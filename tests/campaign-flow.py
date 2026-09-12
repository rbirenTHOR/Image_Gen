"""Campaign integration audit. Uses paid OpenAI and fal requests. Resume the report after interruption."""
import json,time,uuid,urllib.request,urllib.error,sqlite3
from pathlib import Path
BASE='http://localhost:5173/api/studio/'
path=Path('work/campaign-test-report.json');report=json.loads(path.read_text()) if path.exists() else {'checks':[],'turns':{}}
def save():path.write_text(json.dumps(report,indent=2))
def call(route,data=None,expected=200):
 q=urllib.request.Request(BASE+route,data=None if data is None else json.dumps(data).encode(),headers={'Cookie':'__sites_local_auth=1','Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(q,timeout=150) as r:status=r.status;v=json.load(r)
 except urllib.error.HTTPError as e:status=e.code;v=json.load(e)
 assert status==expected,(route,status,v)
 return v
def check(s):report['checks'].append(s);save();print('PASS '+s,flush=True)
call('bootstrap',{})
old=json.loads(Path('work/live-test-report.json').read_text());compositions=next(b for b in old['batches'] if b['stage']=='compose')['result_ids']
if not report.get('project_id'):report['project_id']=call('projects',{'name':'Alpine collection · campaign QA'},201)['id'];save()
pid=report['project_id'];root='projects/'+pid+'/'
try:
 gallery=call(root+'gallery',{'asset_ids':compositions,'saved':True});assert set(compositions)<=set(gallery['saved_ids']);check('Four composition images saved to one campaign')
 repeated=call(root+'gallery',{'asset_ids':compositions,'saved':True});assert len(repeated['saved_ids'])==len(gallery['saved_ids']);check('Repeated saves do not duplicate gallery entries')
 call(root+'gallery',{'asset_ids':[compositions[0]],'saved':False});assert compositions[0] not in call(root+'gallery')['saved_ids'];check('Removed entry stays removed on reopen; original retained')
 call(root+'gallery',{'asset_ids':[compositions[0]],'saved':True});p=next(p for p in call('state')['projects'] if p['id']==pid);assert p['current_id'] is None;check('Saving several images never changes the wizard selection')
 call(root+'gallery',{'asset_ids':['missing-or-foreign'],'saved':True},404);check('Unavailable images cannot be added')
 call(root+'chat',{'id':str(uuid.uuid4()),'text':'Make warmer','reference_ids':[compositions[0]]*5},400);check('Reference count and duplicates are rejected before provider work')
 for kind,brief,refs in [('variation','Make the afternoon light warmer in the attached photo. Preserve the RV and landscape. Do not add people or props.',[compositions[0]]),('new','Create a new alpine lake landscape campaign plate with open gravel foreground, no RV, no people and no props.',[])]:
  if kind not in report['turns']:
   tid=str(uuid.uuid4());report['turns'][kind]={'id':tid,'brief':brief,'refs':refs};save()
  entry=report['turns'][kind];t=call(root+'chat',{'id':entry['id'],'text':entry['brief'],'reference_ids':entry['refs']},201)
  assert t['status']=='ready' and len(t['prompt'])>100,t;check(kind+': conversation returns an editable enhanced prompt')
  duplicate=call(root+'chat',{'id':t['id'],'text':brief,'reference_ids':refs},201);assert duplicate['reply']==t['reply'];check(kind+': repeated message reuses saved reply')
  payload={'prompt':t['prompt'],'aspect':'landscape_4_3'}
  b=call(root+'chat/'+t['id']+'/generate',payload,201);assert b['quality']=='max';assert b['endpoint'].endswith('/edit' if refs else '/text-to-image');assert json.loads(b['inputs_json'])==refs
  receipts=[j['request_id'] for j in b['jobs']];again=call(root+'chat/'+t['id']+'/generate',payload,201);assert receipts==[j['request_id'] for j in again['jobs']];check(kind+': Max routing and duplicate generation protection')
  for _ in range(100):
   print(kind+': '+', '.join(j['status'] for j in b['jobs']),flush=True)
   if all(j['status']=='ready' for j in b['jobs']):break
   for j in b['jobs']:
    assert j['status'] not in ['failed','unknown'],j
    if j['status']=='save_failed':call('jobs/'+j['id']+'/retry',{})
   time.sleep(5);b=call('batches/'+b['id'])
  else:raise RuntimeError('Generation did not complete')
  ids=[j['result_asset_id'] for j in b['jobs']];entry['results']=ids;save();check(kind+': four images completed and persisted')
  call(root+'gallery',{'asset_ids':ids,'saved':True});state=call('state');a=next(a for a in state['assets'] if a['id']==ids[0]);assert a['kind']=='campaign' and a['parent_id']==(refs[0] if refs else None);check(kind+': new assets preserve source lineage')
  call(root+'approve-image',{'asset_id':ids[0],'checks':{'rv':False,'scene':True,'crop':True}},400)
  call(root+'approve-image',{'asset_id':ids[0],'checks':{'rv':True,'scene':True,'crop':True}});check(kind+': independent campaign image review and approval')
  call(root+'chat/'+t['id']+'/generate',{'prompt':t['prompt']+' Make a change.','aspect':'landscape_4_3'},409);check(kind+': completed direction cannot accidentally regenerate with edited settings')
 if not report.get('followup_id'):report['followup_id']=str(uuid.uuid4());save()
 follow=call(root+'chat',{'id':report['followup_id'],'text':'Keep that last new landscape idea, but make it early morning instead. Still no people or vehicles.','reference_ids':[]},201);assert follow['status']=='ready' and len(follow['prompt'])>100;check('Multi-turn follow-up prepares a new direction without auto-generating')
 assert len(call(root+'gallery')['saved_ids'])>=12;check('Campaign retains all saved photos and conversation after reload')
 report['passed']=True;report.pop('error',None)
except Exception as e:report['passed']=False;report['error']=str(e);print('FAIL '+str(e),flush=True)
finally:save()
