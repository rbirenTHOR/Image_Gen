"""Resumable paid high-resolution audit: one batch of four Max edits, one vision chat."""
import json,time,uuid,urllib.request,urllib.error,struct
from pathlib import Path
BASE='http://localhost:5173/api/studio/'
path=Path('work/resolution-test-report.json')
report=json.loads(path.read_text()) if path.exists() else {}
def save(): path.write_text(json.dumps(report,indent=2))
def call(route,data=None,expected=200):
 req=urllib.request.Request(BASE+route,data=None if data is None else json.dumps(data).encode(),headers={'Cookie':'__sites_local_auth=1','Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=200) as r: status=r.status;value=json.load(r)
 except urllib.error.HTTPError as e: status=e.code;value=json.load(e)
 assert status==expected,(route,status,value)
 return value
def media(a):
 req=urllib.request.Request(BASE+'media/'+a['id'],headers={'Cookie':'__sites_local_auth=1'})
 with urllib.request.urlopen(req,timeout=60) as r: data=r.read();mime=r.headers.get('Content-Type')
 assert mime=='image/png' and data[:8]==b'\x89PNG\r\n\x1a\n'
 assert struct.unpack('>II',data[16:24])==(3840,2160)
 return len(data)
call('bootstrap',{})
if not report.get('project_id'):
 report['project_id']=call('projects',{'name':'Native resolution · QA'},201)['id'];save()
if not report.get('batch_id'):
 report['batch_id']=str(uuid.uuid4());save()
old=json.loads(Path('work/campaign-test-report.json').read_text())
reference=old['turns']['variation']['results'][0]
payload={'id':report['batch_id'],'project_id':report['project_id'],'stage':'variation','aspect':'landscape_16_9','prompt':'Preserve the RV, markings, camera and scene in this reference. Improve natural photographic detail on the bodywork, grass, gravel and distant trees. Keep realistic textures, crisp edges and deep focus. No added people or objects. No artificial sharpening halos.','reference_ids':[reference]}
b=call('batches',payload,201)
for _ in range(150):
 print('Max 4K: '+', '.join(j['status'] for j in b['jobs']),flush=True)
 if all(j['status']=='ready' for j in b['jobs']):break
 for j in b['jobs']:
  assert j['status'] not in ['failed','unknown'],j
  if j['status']=='save_failed': call('jobs/'+j['id']+'/retry',{})
 time.sleep(5);b=call('batches/'+b['id'])
else: raise RuntimeError('Generation still working; rerun this resumable test')
assets={a['id']:a for a in call('state')['assets']}
report['images']=[]
for job in b['jobs']:
 a=assets[job['result_asset_id']]
 assert (a['width'],a['height'],a['mime'],a['quality'])==(3840,2160,'image/png','max'),a
 report['images'].append({'id':a['id'],'width':a['width'],'height':a['height'],'bytes':media(a),'request_id':job['request_id']})
save();print('PASS Four native 3840 × 2160 Max PNGs stored at full resolution',flush=True)
again=call('batches',payload,201)
assert [j['request_id'] for j in again['jobs']]==[j['request_id'] for j in b['jobs']]
print('PASS Repeated request reuses original provider receipts',flush=True)
if not report.get('chat_id'):report['chat_id']=str(uuid.uuid4());save()
refs=[i['id'] for i in report['images']]
t=call('projects/'+report['project_id']+'/chat',{'id':report['chat_id'],'text':'Compare these attached RV pictures and suggest one specific lighting improvement. Prepare an edit prompt preserving all RV features.','reference_ids':refs},201)
if t['status']=='failed': t=call('projects/'+report['project_id']+'/chat/'+report['chat_id']+'/retry',{})
assert t['status']=='ready' and len(t['reply'])>20,t
print('PASS Four high-resolution references transferred and inspected by creative chat',flush=True)
report['passed']=True;save()
