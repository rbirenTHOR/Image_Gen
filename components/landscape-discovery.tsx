"use client";
import { useEffect, useRef, useState } from 'react';
import { Search, ArrowLeft, Plus, Check, LoaderCircle, ExternalLink, Mountain } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { landscapeEnvironments, landscapeQueries, type LandscapeResult, type LandscapeSearch } from '@/lib/landscape-discovery';
import type { Asset } from '@/lib/domain';

export default function LandscapeDiscovery({ onBack, onImported, canUse }: {
  onBack:()=>void; onImported:(asset:Asset,use:boolean)=>Promise<void>; canUse:boolean;
}) {
  const [query,setQuery]=useState(''), [resolution,setResolution]=useState('8k');
  const [results,setResults]=useState<LandscapeResult[]>([]),[next,setNext]=useState<number|null>(null);
  const [applied,setApplied]=useState<{query:string;resolution:string}|null>(null);
  const [matchedQuery,setMatchedQuery]=useState(''),[broadened,setBroadened]=useState(false);
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const [review,setReview]=useState<LandscapeResult|null>(null),[name,setName]=useState('');
  const [environment,setEnvironment]=useState('other'),[ground,setGround]=useState('scenery'),[note,setNote]=useState('');
  const [saving,setSaving]=useState(false),[saveError,setSaveError]=useState(''),[success,setSuccess]=useState('');
  const [previewFailed,setPreviewFailed]=useState(false),[previewLoaded,setPreviewLoaded]=useState(false),[previewRevision,setPreviewRevision]=useState(0);
  const abort=useRef<AbortController|null>(null);
  useEffect(()=>()=>abort.current?.abort(),[]);
  async function search(offset=0, suggested?:string, newResolution?:string) {
    const params=offset&&applied?{...applied,query:matchedQuery||applied.query}:{query:(suggested??query).trim(),resolution:newResolution??resolution};
    if(params.query.length<2)return;
    if(suggested)setQuery(suggested);
    if(newResolution)setResolution(newResolution);
    abort.current?.abort(); const controller=new AbortController(); abort.current=controller;
    setLoading(true);setError('');setSuccess('');
    if(!offset){setResults([]);setNext(null);setApplied(params);setMatchedQuery('');setBroadened(false);}
    try {
      const r=await fetch('/api/studio/landscape-search?'+new URLSearchParams({...params,offset:String(offset)}),{signal:controller.signal});
      const data=await r.json() as LandscapeSearch & {error?:string};
      if(!r.ok)throw new Error(data.error||'Search did not complete. Please retry.');
      setResults(old=>offset?[...old,...data.photos.filter(p=>!old.some(o=>o.pageId===p.pageId))]:data.photos);
      setNext(data.nextOffset);
      setMatchedQuery(data.matchedQuery);
      if(!offset)setBroadened(data.broadened);
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Search did not complete.');}
    finally{if(!controller.signal.aborted)setLoading(false);}
  }
  function openReview(p:LandscapeResult){setReview(p);setName(p.name);setEnvironment(p.environment);setGround('scenery');setNote('');setSaveError('');setPreviewFailed(false);setPreviewLoaded(false);setPreviewRevision(0);}
  async function add(use:boolean){
    if(!review)return;setSaving(true);setSaveError('');
    try{
      const r=await fetch('/api/studio/landscape-import',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pageId:review.pageId,name:name.trim(),environment,suitability:ground,placementNote:note.trim()})});
      const asset=await r.json() as Asset & {error?:string};
      if(!r.ok)throw new Error(asset.error||'The original could not be added. Please retry.');
      setResults(old=>old.map(p=>p.pageId===review.pageId?{...p,existingAssetId:asset.id}:p));
      setReview(p=>p?{...p,existingAssetId:asset.id}:null);
      await onImported(asset,use);
      setSuccess('“'+asset.name+'” is in your photo library.');setReview(null);
    }catch(e){setSaveError(e instanceof Error?e.message:'Could not add this photo.');}
    finally{setSaving(false);}
  }
  return <section className="landscape-discovery" aria-label="Find real photos">
    <div className="discovery-heading"><div><p className="eyebrow">EXPAND YOUR LOCATIONS</p><h2>Find your next backdrop.</h2><p>Search real places. Review the photograph. Keep the original.</p></div><Button variant="outline" onClick={onBack}><ArrowLeft/>Your photo library</Button></div>
    <form className="discovery-search" onSubmit={e=>{e.preventDefault();void search();}}>
      <div><label htmlFor="discovery-query">Place or scenery</label><div className="search-field"><Search size={18}/><Input id="discovery-query" placeholder="Alaska mountains, Oregon forest, desert road…" value={query} onChange={e=>setQuery(e.target.value)} maxLength={160} disabled={loading}/></div></div>
      <div><label htmlFor="discovery-resolution">Original resolution</label><select id="discovery-resolution" value={resolution} onChange={e=>setResolution(e.target.value)} disabled={loading}><option value="8k">Native 8K+ · best detail</option><option value="4k">4K+ · more choices</option></select></div>
      <Button type="submit" disabled={loading||query.trim().length<2}>{loading?<LoaderCircle className="spin"/>:<Search/>}{loading?'Searching…':'Search photos'}</Button>
    </form>
    <div className="discovery-suggestions" aria-label="Suggested searches">{['Alaska landscape','Burning Man','Black Rock Desert','forest clearing','desert road'].map(q=><Button variant="outline" size="sm" key={q} disabled={loading} onClick={()=>void search(0,q)}>{q}</Button>)}</div>
    <p className="discovery-source-note">Wikimedia Commons · Public domain & CC0 only · Landscape format · {resolution==='8k'?'At least 7,680 pixels wide':'At least 3,840 × 2,160 pixels'}. No AI image generation.</p>
    {success&&<div className="discovery-success" role="status"><Check size={18}/><span>{success}</span><Button variant="outline" size="sm" onClick={onBack}>View library</Button></div>}
    {error&&<div className="discovery-error" role="alert"><p>{error}</p><Button variant="outline" onClick={()=>void search(results.length&&next?next:0)}>Retry search</Button></div>}
    {!applied&&!loading&&<div className="discovery-empty"><Mountain size={32}/><h3>Start with a place you want to shoot.</h3><p>Try a park, region or type of scenery. Look for level ground, a useful camera angle and natural light.</p></div>}
    {applied&&<p className="discovery-count" role="status">{loading?`Searching for “${applied.query}” and checking broader matches…`:`${results.length} photos found for “${matchedQuery||applied.query}” · ${applied.resolution.toUpperCase()}+ originals`}</p>}
    {broadened&&!loading&&!error&&results.length>0&&<div className="discovery-success" role="status"><Search size={18}/><span>Broadened your search to “{matchedQuery}”. Your {applied?.resolution.toUpperCase()}+ resolution and public-domain/CC0 filters are unchanged.</span></div>}
    {!loading&&applied&&!results.length&&!error&&<div className="discovery-empty"><h3>No eligible photos in these results.</h3><p>We tried broader wording too. {applied.resolution==='8k'?'Search at 4K+ to include more originals.':'Try the place or event name on its own, without shot directions.'} Photos must still meet the selected size and public-domain/CC0 requirements.</p><div className="discovery-suggestions">{applied.resolution==='8k'&&<Button variant="outline" onClick={()=>void search(0,applied.query,'4k')}>Search at 4K+</Button>}{landscapeQueries(applied.query).slice(1).map(q=><Button key={q} variant="outline" onClick={()=>void search(0,q)}>Search “{q}”</Button>)}</div></div>}
    <div className="discovery-grid" aria-busy={loading}>
      {results.map(p=><article key={p.pageId} className="discovery-card">
        <button className="discovery-photo" onClick={()=>openReview(p)} aria-label={'Review '+p.name}><img src={p.previewUrl} alt={p.name} loading="lazy" referrerPolicy="no-referrer"/><span>{p.width>=7680?'8K+':'4K+'} original</span></button>
        <div className="discovery-card-body"><h3>{p.name}</h3><p>{p.width.toLocaleString()} × {p.height.toLocaleString()} · {p.license}</p><div><Button variant="outline" onClick={()=>openReview(p)}>Review photo</Button>{p.existingAssetId&&<span className="discovery-added"><Check size={16}/>In library</span>}</div></div>
      </article>)}
    </div>
    {loading&&!results.length&&<div className="discovery-loading" role="status"><LoaderCircle className="spin"/>Checking source details and photo sizes…</div>}
    {next!==null&&<Button className="discovery-more" variant="outline" disabled={loading} onClick={()=>void search(next)}>{loading?'Searching…':results.length?'Find more photos':'Check more matches'}</Button>}
    <Dialog open={!!review} onOpenChange={open=>{if(!open&&!saving)setReview(null);}}>
      <DialogContent className="landscape-review" onInteractOutside={e=>{if(saving)e.preventDefault();}} onEscapeKeyDown={e=>{if(saving)e.preventDefault();}}>
        <DialogHeader><DialogTitle>Review this backdrop</DialogTitle><DialogDescription>Check that this is a real photograph with a useful view and enough ground for your scene.</DialogDescription></DialogHeader>
        {review&&<>
          <div className="landscape-review-body"><div className="landscape-review-visual">
            <img key={review.pageId+'-'+previewRevision} src={review.previewUrl+(previewRevision?'?retry='+previewRevision:'')} alt={review.name} onError={()=>{setPreviewFailed(true);setPreviewLoaded(false);}} onLoad={()=>{setPreviewLoaded(true);setPreviewFailed(false);}} referrerPolicy="no-referrer"/>
            {previewFailed?<div role="alert"><p>The preview could not load.</p><Button variant="outline" onClick={()=>{setPreviewFailed(false);setPreviewRevision(x=>x+1);}}>Retry preview</Button></div>:!previewLoaded&&<p role="status">Loading preview…</p>}
            <p>Preview shown. Adding saves the full {review.width.toLocaleString()} × {review.height.toLocaleString()} original ({(review.bytes/1_000_000).toFixed(1)} MB).</p>
            <div className="discovery-source-links"><a href={review.sourceUrl} target="_blank" rel="noreferrer">Source & photographer <ExternalLink size={14}/></a><a href={review.originalUrl} target="_blank" rel="noreferrer">Inspect full original <ExternalLink size={14}/></a><a href={review.licenseUrl} target="_blank" rel="noreferrer">{review.license} <ExternalLink size={14}/></a></div>
            <p>{review.photographer}</p><details><summary>Source description</summary><p>{review.description||review.name}</p></details>
          </div><div className="landscape-review-fields">
            <label htmlFor="backdrop-name">Library name</label><Input id="backdrop-name" value={name} onChange={e=>setName(e.target.value)} maxLength={120} disabled={saving}/>
            <label htmlFor="backdrop-environment">Scenery</label><select id="backdrop-environment" value={environment} onChange={e=>setEnvironment(e.target.value)} disabled={saving}>{landscapeEnvironments.map(v=><option key={v} value={v}>{v[0].toUpperCase()+v.slice(1)}</option>)}</select>
            <label htmlFor="backdrop-ground">Ground space</label><select id="backdrop-ground" value={ground} onChange={e=>setGround(e.target.value)} disabled={saving}><option value="scenery">Scenic reference · ground needs work</option><option value="placement">Open ground · room for the RV</option></select>
            <label htmlFor="backdrop-notes">Placement notes <span>(optional)</span></label><Textarea id="backdrop-notes" value={note} onChange={e=>setNote(e.target.value)} placeholder="Level gravel at the left, light from the right…" maxLength={500} disabled={saving}/>
            <p>Keep the horizon, ground slope and direction of light in mind. Scenery without usable ground may need a new foreground.</p>
            {review.existingAssetId&&<p className="discovery-added"><Check size={16}/>Already in your library. No duplicate will be created.</p>}
          </div></div>
          {saveError&&<p className="discovery-error" role="alert">{saveError}</p>}
          <div className="landscape-review-footer"><p role="status">{saving?'Preparing the original photo. This can take a minute…':'The original and source credit stay with the photo.'}</p><div><Button variant={canUse?'outline':'default'} disabled={saving||!name.trim()||!previewLoaded||!!review.existingAssetId} onClick={()=>void add(false)}>{saving?<LoaderCircle className="spin"/>:review.existingAssetId?<Check/>:<Plus/>}{review.existingAssetId?'In library':'Add to library'}</Button>{canUse&&<Button disabled={saving||!name.trim()||!previewLoaded} onClick={()=>void add(true)}>{saving?<LoaderCircle className="spin"/>:<Check/>}{review.existingAssetId?'Use this backdrop':'Add & use backdrop'}</Button>}</div></div>
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}
