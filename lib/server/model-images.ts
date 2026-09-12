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

/** Large references use streamed, expiring fal uploads so four Max requests
 * never duplicate multiple full-resolution base64 images in Worker memory. */
export async function modelImages(ids: string[], owner: string) {
  const images: string[] = [];
  for (const id of ids) {
    const asset = await getAsset(id, owner);
    const object = await runtime().BUCKET.get(asset.r2_key);
    if (!object) throw new ApiError(503, "A source image could not be loaded.");
    if (object.size <= 2 * 1024 * 1024) {
      await object.body.cancel();
      images.push(await assetDataURI(id, owner));
      continue;
    }
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
          file_name: `${asset.id}.${asset.mime.split("/")[1]}`,
          content_type: asset.mime,
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
        "Content-Type": asset.mime,
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
    images.push(fileURL);
  }
  return images;
}
