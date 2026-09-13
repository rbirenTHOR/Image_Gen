import type { Asset } from '@/lib/domain';

export function PhotoSource({ asset }: { asset: Asset }) {
  const photo = asset.photo_source;
  if (!photo) return null;
  return <div className="photo-source">
    <strong>Real photograph · native {asset.width.toLocaleString()} × {asset.height.toLocaleString()}</strong>
    <p>{photo.location} · {photo.photographer}</p>
    <p>{photo.placementNote}</p>
    {photo.suitability === "scenery" && <p>This is a scenic reference; adding an RV will require a new, plausible foreground.</p>}
    <div><a href={photo.sourceUrl} target="_blank" rel="noreferrer">View original source ↗</a>
      <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license} ↗</a></div>
  </div>;
}
