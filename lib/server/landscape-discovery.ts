import { z } from 'zod';
import { parseLandscape, landscapeQueries, landscapeEnvironments, type LandscapeResult, type LandscapeSearch } from '@/lib/landscape-discovery';
import { naturePhotoById } from '@/lib/nature-catalog';
import { all, one, run, ApiError, runtime } from './runtime';
import { providerFetch } from './provider-fetch';
import { publicAsset, getAsset } from './library';
import { imageObject } from './nature-library';
import type { Asset } from '@/lib/domain';

const searchSchema = z.object({query:z.string().trim().min(2).max(160),resolution:z.enum(['8k','4k']).default('8k'),offset:z.coerce.number().int().min(0).max(480).default(0)}).strict();
const importSchema = z.object({pageId:z.number().int().positive().max(2_147_483_647),name:z.string().trim().min(1).max(120),environment:z.enum(landscapeEnvironments),suitability:z.enum(['placement','scenery']),placementNote:z.string().trim().max(500).default('')}).strict();
type CommonsReply = {error?:unknown; query?:{pages?:Parameters<typeof parseLandscape>[0][]}; continue?:{gsroffset?:number}};
async function commons(parameters: Record<string,string>): Promise<CommonsReply> {
  const u = new URL('https://commons.wikimedia.org/w/api.php');
  u.search = new URLSearchParams({action:'query',format:'json',formatversion:'2',prop:'imageinfo',iiprop:'url|size|mime|extmetadata',iiurlwidth:'1280',iiextmetadatafilter:'Artist|LicenseShortName|LicenseUrl|ImageDescription|Categories',...parameters}).toString();
  try {
    const r = await providerFetch(u.toString(), {headers:{'User-Agent':'THOR-RV-Studio/1.0 (landscape discovery; https://thor-rv-studio-ryan.ryguy86.chatgpt.site)'},signal:AbortSignal.timeout(25000),redirect:'manual'});
    if (!r.ok) { await r.body?.cancel(); throw new Error('source unavailable'); }
    const result = await r.json() as CommonsReply;
    if (result.error) throw new Error('source query failed');
    return result;
  } catch { throw new ApiError(503, 'Photo search is temporarily unavailable. Your search is preserved; please try again.'); }
}
async function ownerAssetId(owner:string,pageId:number) {
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner)));
  return 'discovered-'+Array.from(hash.slice(0,16),n=>n.toString(16).padStart(2,'0')).join('')+'-'+pageId;
}
async function existingPhoto(pageId:number,owner:string) {
  const shared = naturePhotoById.get('commons-'+pageId);
  if (shared) {
    const asset = await one<Asset>('SELECT * FROM assets WHERE id=? AND owner_id=?',shared.id,'shared');
    if (asset) return asset;
  }
  return one<Asset>('SELECT * FROM assets WHERE id=? AND owner_id=?',await ownerAssetId(owner,pageId),owner);
}
export async function searchLandscapes(input:unknown,owner:string):Promise<LandscapeSearch> {
  const data = searchSchema.parse(input);
  const queries = landscapeQueries(data.query);
  if (!queries.length) throw new ApiError(400,'Enter a place or landscape to search.');
  const width = data.resolution === '8k' ? 7680 : 3840;
  let photos:LandscapeResult[]=[],matchedQuery=queries[0],nextOffset:number|null=null,excluded=0;
  // License templates are incomplete and are not a reliable search index. Validate actual
  // source metadata below, including on import, instead of hiding eligible photos up front.
  for(const query of data.offset?queries.slice(0,1):queries){
    matchedQuery=query;
    const words=query.split(' ').length===2?'"'+query+'"':query.split(' ').map(s=>'"'+s+'"').join(' ');
    let offset=data.offset;
    for(let page=0;page<2;page++){
      const result=await commons({generator:'search',gsrsearch:`${words} filetype:bitmap filew:>${width-1} fileh:>2159 -intitle:map -intitle:atlas -intitle:painting`,gsrnamespace:'6',gsrlimit:'40',gsroffset:String(offset)});
      const pages=(result.query?.pages??[]).sort((a,b)=>(a.index??0)-(b.index??0));
      photos=pages.map(p=>parseLandscape(p,width)).filter((p):p is LandscapeResult=>!!p);
      excluded+=pages.length-photos.length;
      const next=result.continue?.gsroffset;
      nextOffset=typeof next==='number'&&next>offset&&next<=480?next:null;
      if(photos.length||nextOffset===null)break;
      offset=nextOffset;
    }
    if(photos.length)break;
  }
  // One owned-library query, independent of the number of search results.
  const owned = await all<Asset>('SELECT * FROM assets WHERE owner_id=? AND source=?',owner,'sourced-photo');
  for (const photo of photos) {
    const existing = owned.find(a=>a.id.endsWith('-'+photo.pageId) && a.in_library);
    if (existing) photo.existingAssetId=existing.id;
    else if (naturePhotoById.has(photo.id)) photo.existingAssetId=photo.id;
  }
  return {photos,nextOffset,excluded,matchedQuery,broadened:matchedQuery.toLowerCase()!==data.query.trim().toLowerCase()};
}
export async function importLandscape(input:unknown,owner:string) {
  const data=importSchema.parse(input);
  const existing=await existingPhoto(data.pageId,owner);
  if (existing) {
    if (!existing.in_library && existing.owner_id===owner) await run('UPDATE assets SET in_library=1 WHERE id=? AND owner_id=?',existing.id,owner);
    return publicAsset(await getAsset(existing.id,owner));
  }
  // Recheck fresh source metadata. Browser-provided URLs, licenses and dimensions are never accepted.
  const result=await commons({pageids:String(data.pageId)});
  const photo=parseLandscape(result.query?.pages?.[0]??{});
  if (!photo || photo.pageId!==data.pageId) throw new ApiError(422,'This photo no longer meets the resolution, format or public-domain/CC0 requirements. Please choose another.');
  const id=await ownerAssetId(owner,data.pageId);
  const metadata={...photo,id,name:data.name,environment:data.environment,suitability:data.suitability,
    placementNote:data.placementNote || (data.suitability==='placement'?'Reviewer marked open ground. Match perspective, scale and ground contact.':'Scenic reference. A new, plausible foreground may be needed.'),importedAt:Date.now()};
  const key='nature-originals/'+id;
  // Copy the full original before presenting it as an added library asset. Failed imports can be retried safely.
  await imageObject({id,source:'sourced-photo',r2_key:key,photo_source_json:JSON.stringify(metadata)} as Asset);
  await run('INSERT OR IGNORE INTO assets (id,owner_id,kind,name,environment,lighting,source,photo_source_json,r2_key,mime,width,height,in_library,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,owner,'landscape',data.name,data.environment,photo.lighting,'sourced-photo',JSON.stringify(metadata),key,photo.mime,photo.width,photo.height,1,Date.now());
  return publicAsset(await getAsset(id,owner));
}
