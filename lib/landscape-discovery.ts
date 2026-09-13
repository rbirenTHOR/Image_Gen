import type { NaturePhoto } from './nature-catalog';

export type LandscapeResult = NaturePhoto & { pageId: number; previewUrl: string; bytes: number; description: string; existingAssetId?: string };
export type LandscapeSearch = { photos: LandscapeResult[]; nextOffset: number | null; excluded: number; matchedQuery: string; broadened: boolean };
/** Keep place words, then relax descriptive requirements when the exact search is empty. */
export function landscapeQueries(input: string): string[] {
  const spelling:Record<string,string>={concenrt:'concert',conert:'concert',mountian:'mountain',moutain:'mountain',forrest:'forest',landscpae:'landscape'};
  const words=(input.match(/[\p{L}\p{N}]+/gu)??[]).slice(0,16).map(w=>spelling[w.toLowerCase()]??w);
  const descriptive=new Set(['a','an','the','in','at','with','and','of','for','some','real','authentic','photo','photos','photograph','photographs','image','images','backdrop','backdrops','background','backgrounds','open','wide','large','area','areas','space','spaces','landscape','landscapes','scenery','concert','festival']);
  const focus=words.filter(w=>!descriptive.has(w.toLowerCase()));
  return [...new Set([words.join(' '),focus.join(' '),focus.slice(0,2).join(' ')].filter(q=>q.length>=2))];
}
export const landscapeEnvironments = ['mountain', 'forest', 'meadow', 'road', 'desert', 'coast', 'lake', 'snow', 'other'] as const;

/** Source HTML is displayed only as plain text; never inserted into the DOM. */
export function sourceText(value: unknown, limit = 500): string {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/&(?:amp|quot|apos|lt|gt|nbsp);/g, s => ({'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '}[s]!)).replace(/\s+/g, ' ').trim().slice(0, limit);
}
export function commonsImageUrl(value: unknown, original = false): string | null {
  if (typeof value !== 'string') return null;
  try {
    const u = new URL(value);
    if (u.protocol !== 'https:' || u.username || u.password || u.port ||
      !(original ? ['upload.wikimedia.org'] : ['upload.wikimedia.org', 'thumb.wikimedia.org']).includes(u.hostname) ||
      !u.pathname.startsWith('/wikipedia/commons/') || (original && u.pathname.includes('/thumb/'))) return null;
    u.search = ''; u.hash = ''; return u.toString();
  } catch { return null; }
}
type CommonsPage = { pageid?: number; title?: string; index?: number; imageinfo?: Array<{
  url?: string; thumburl?: string; descriptionurl?: string; width?: number; height?: number; size?: number; mime?: string;
  extmetadata?: Record<string, {value?: string}>;
}> };
export function parseLandscape(page: CommonsPage, minWidth = 3840): LandscapeResult | null {
  const info = page.imageinfo?.[0], meta = info?.extmetadata ?? {};
  if (!Number.isSafeInteger(page.pageid) || !info) return null;
  const original = commonsImageUrl(info.url, true), preview = commonsImageUrl(info.thumburl);
  if (!original || !preview || !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime ?? '') ||
    !info.width || !info.height || info.width < minWidth || info.height < 2160 || info.width < info.height ||
    !info.size || info.size > 64 * 1024 * 1024) return null;
  const license = sourceText(meta.LicenseShortName?.value);
  if (!/^(CC0(?: 1\.0)?|Public domain)$/i.test(license)) return null;
  const evidence = [page.title, meta.Categories?.value, meta.ImageDescription?.value].join(' ');
  if (/AI[- ]generated|artificial intelligence|stable diffusion|midjourney|DALL[·-]?E|digital paintings?|oil paintings?|watercolou?r|engravings?|lithographs?|\bmaps?\b|cartograph|atlases|\bdrawings?\b|satellite images?|aerial photographs/i.test(evidence)) return null;
  // Category metadata is a filter, not proof; the review screen asks users to inspect the actual photograph.
  const sourceUrl = `https://commons.wikimedia.org/wiki/Special:Redirect/page/${page.pageid}`;
  let licenseUrl = sourceUrl;
  if (/^CC0/i.test(license)) licenseUrl = 'https://creativecommons.org/publicdomain/zero/1.0/';
  const name = sourceText(page.title?.replace(/^File:/, '').replace(/\.(jpe?g|png|webp)$/i, ''), 120);
  const description = sourceText(meta.ImageDescription?.value, 700);
  return {id: `commons-${page.pageid}`, pageId: page.pageid!, name, location: description || name,
    environment: 'other', lighting: 'source light', width: info.width, height: info.height,
    originalUrl: original, previewUrl: preview, sourceUrl, photographer: sourceText(meta.Artist?.value, 240) || 'See source credit',
    license, licenseUrl, placementNote: 'Review ground space and perspective before composing.',
    suitability: 'scenery', mime: info.mime!, bytes: info.size, description};
}

export function storedPhoto(value?: string): NaturePhoto | undefined {
  if (!value) return;
  try { const p = JSON.parse(value) as NaturePhoto; return p.pageId && commonsImageUrl(p.originalUrl, true) ? p : undefined; } catch { return; }
}
