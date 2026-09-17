import { imageObject } from "./nature-library";
import { getAsset, assetDataURI } from "./library";
import { runtime, ApiError } from "./runtime";
import { providerFetch } from "./provider-fetch";

function mediaURL(value: string) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.port ||
    url.username ||
    url.password ||
    !(
      url.hostname === "fal.media" ||
      url.hostname.endsWith(".fal.media") ||
      url.hostname.endsWith(".falusercontent.com")
    )
  ) {
    throw new ApiError(502, "The provider returned an invalid upload address.");
  }
  return url.toString();
}

/** Large references use streamed, expiring fal uploads so parallel requests
 * never duplicate multiple full-resolution base64 images in Worker memory. */
export async function modelImages(ids: string[], owner: string, remoteOnly = false) {
  const images: string[] = [];
  for (const id of ids) {
    const asset = await getAsset(id, owner);
    let object = await imageObject(asset);
    if (object && object.size > 25_000_000) {
      const optimized = await runtime().BUCKET.get('model-references/' + asset.id);
      if (optimized) { await object.body.cancel(); object = optimized; }
    }
    if (!object) throw new ApiError(503, "A source image could not be loaded.");
    if (!remoteOnly && object.size <= 2 * 1024 * 1024) {
      await object.body.cancel();
      images.push(await assetDataURI(id, owner));
      continue;
    }
    if (object.size > 60_000_000) { await object.body.cancel(); throw new ApiError(400, 'This reference exceeds 60 MB. Upload a smaller source image.'); }
    const mime = object.httpMetadata?.contentType || asset.mime;
    const needsCompression = object.size > 25_000_000;
    const key = runtime().FAL_KEY || process.env.FAL_KEY;
    if (!key)
      throw new ApiError(503, "Image generation has not been connected.");
    const init = await providerFetch(
      "https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3",
      {
        method: "POST",
        headers: {
          Authorization: "Key " + key,
          "Content-Type": "application/json",
          "X-Fal-Object-Lifecycle": JSON.stringify({
            expiration_duration_seconds: 86400,
          }),
        },
        body: JSON.stringify({
          file_name: `${asset.id}.${mime.split("/")[1]}`,
          content_type: mime,
        }),
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!init.ok)
      throw new ApiError(
        503,
        "Could not prepare the high-resolution reference. Retry shortly.",
      );
    const result = (await init.json()) as {
      upload_url: string;
      file_url: string;
    };
    const uploadURL = mediaURL(result.upload_url),
      fileURL = mediaURL(result.file_url);
    const upload = await providerFetch(uploadURL, {
      method: "PUT",
      headers: {
        "Content-Type": mime,
        "Content-Length": String(object.size),
      },
      body: object.body as ReadableStream,
      signal: AbortSignal.timeout(60000),
    });
    if (!upload.ok)
      throw new ApiError(
        503,
        "High-resolution reference transfer failed. Retry shortly.",
      );
    if (needsCompression) {
      const response = await providerFetch('https://fal.run/fal-ai/workflow-utilities/compress-image', {
        method: 'POST', headers: { Authorization: 'Key ' + key, 'Content-Type': 'application/json',
          'X-Fal-Object-Lifecycle': JSON.stringify({ expiration_duration_seconds: 86400 }) },
        body: JSON.stringify({ image_url: fileURL, quality: 90, max_width: null, max_height: null, output_format: 'jpg', optimize: true }),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok) throw new ApiError(503, 'Could not prepare this large reference. No image generations were requested. Please retry.');
      const result = await response.json() as { image: { url: string; width?: number; height?: number }; compressed_size: number };
      if (!result.image || !result.compressed_size || result.compressed_size > 25_000_000 ||
          (result.image.width && asset.width && result.image.width !== asset.width) ||
          (result.image.height && asset.height && result.image.height !== asset.height))
        throw new ApiError(503, 'The optimized reference did not meet the size and resolution requirements. Choose another image.');
      const optimizedURL = mediaURL(result.image.url);
      const compressed = await providerFetch(optimizedURL, { signal: AbortSignal.timeout(60000) });
      const size = Number(compressed.headers.get('content-length') || result.compressed_size);
      if (!compressed.ok || !compressed.body || !Number.isSafeInteger(size) || size <= 0 || size > 25_000_000) {
        await compressed.body?.cancel();
        throw new ApiError(503, 'The optimized reference could not be saved. Please retry.');
      }
      const signature: number[] = [];
      const validated = compressed.body.pipeThrough(new TransformStream<Uint8Array,Uint8Array>({
        transform(chunk, controller) {
          for (const byte of chunk.subarray(0, Math.max(0, 3-signature.length))) signature.push(byte);
          if (signature.length === 3 && (signature[0] !== 255 || signature[1] !== 216 || signature[2] !== 255)) throw new Error('Invalid JPEG reference');
          controller.enqueue(chunk);
        }, flush() { if (signature.length !== 3) throw new Error('Empty JPEG reference'); }
      }));
      const stream = new FixedLengthStream(size);
      await Promise.all([validated.pipeTo(stream.writable), runtime().BUCKET.put('model-references/' + asset.id, stream.readable, {httpMetadata:{contentType:'image/jpeg'}})]);
      images.push(optimizedURL);
    } else images.push(fileURL);
  }
  return images;
}
