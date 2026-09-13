import { providerFetch } from "./provider-fetch";
import { naturePhotos, naturePhotoById } from '@/lib/nature-catalog';
import { runtime, all, ApiError } from './runtime';
import type { Asset } from '@/lib/domain';
import { storedPhoto } from '@/lib/landscape-discovery';

export async function ensureNatureLibrary() {
  if (!naturePhotos.length) return;
  await runtime().DB.prepare(`UPDATE assets SET in_library=0 WHERE source='sourced-photo' AND owner_id='shared' AND id NOT IN (${naturePhotos.map(() => '?').join(',')})`).bind(...naturePhotos.map(p => p.id)).run();
  const existing = new Set((await all<{id: string}>(
    "SELECT id FROM assets WHERE source=? AND owner_id=?", 'sourced-photo', 'shared',
  )).map(a => a.id));
  const missing = naturePhotos.filter(a => !existing.has(a.id));
  if (!missing.length) return;
  await runtime().DB.batch(missing.map((p, i) => runtime().DB.prepare(
    'INSERT OR IGNORE INTO assets (id,owner_id,kind,name,environment,lighting,source,r2_key,mime,width,height,in_library,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
  ).bind(p.id, 'shared', 'landscape', p.name, p.environment, p.lighting,
    'sourced-photo', 'nature-originals/' + p.id, p.mime, p.width, p.height, 1, Date.now() - i)));
}

/** Only fixed catalog URLs or server-validated Commons metadata reach the network. */
export async function imageObject(asset: Asset) {
  const bucket = runtime().BUCKET;
  const stored = await bucket.get(asset.r2_key);
  if (stored) return stored;
  const photo = naturePhotoById.get(asset.id) ?? storedPhoto(asset.photo_source_json);
  if (asset.source !== 'sourced-photo' || !photo) return null;
  try {
    const response = await providerFetch(photo.originalUrl, {
      redirect: 'manual', signal: AbortSignal.timeout(60000),
      headers: { 'User-Agent': 'THOR-RV-Studio/1.0 (licensed landscape library)' },
    });
    if (response.status === 429) {
      await response.body?.cancel();
      throw new ApiError(503, 'The photo source is temporarily busy. Please wait a few minutes before retrying this original.');
    }
    const size = Number(response.headers.get('content-length'));
    const mime = response.headers.get('content-type')?.split(';')[0];
    if (!response.ok || !response.body || !size || size > 64 * 1024 * 1024 || mime !== photo.mime) {
      await response.body?.cancel();
      throw new Error('Original unavailable');
    }
    const stream = new FixedLengthStream(size);
    await Promise.all([
      response.body.pipeTo(stream.writable),
      bucket.put(asset.r2_key, stream.readable, { httpMetadata: { contentType: photo.mime } }),
    ]);
    return await bucket.get(asset.r2_key);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error('Nature original import failed', photo.id, error instanceof Error ? error.message : 'Unknown storage error');
    throw new ApiError(503, 'This original photo could not be prepared. Please retry or choose another backdrop.');
  }
}
