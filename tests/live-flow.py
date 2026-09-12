import json,urllib.request,urllib.error,uuid,time
from pathlib import Path
BASE='http://localhost:5173/api/studio/'
report=json.loads(Path('work/live-test-report.json').read_text()) if Path('work/live-test-report.json').exists() else {'started_at':time.time(),'checks':[],'batches':[]}
def call(path,data=None,method=None,expected=200):
 req=urllib.request.Request(BASE+path,data=json.dumps(data).encode() if data is not None else None,method=method or ('POST' if data is not None else 'GET'),headers={'Cookie':'__sites_local_auth=1','Content-Type':'application/json'})
 try:
  with urllib.request.urlopen(req,timeout=100) as res:code=res.status;v=json.load(res)
 except urllib.error.HTTPError as e:code=e.code;v=json.load(e)
 if code!=expected:raise RuntimeError(f'{path}: HTTP {code}: {v}')
 return v

def check(name):report['checks'].append(name);print('PASS '+name,flush=True)
def save():Path('work/live-test-report.json').write_text(json.dumps(report,indent=2))
call('bootstrap',{})
if report.get('project_id'):
 pid=report['project_id']
 prompt=call('batches/'+report['batches'][0]['id'])['prompt'] if report['batches'] else 'A realistic alpine lake landscape with open gravel foreground and no people or vehicles.'
else:
 p=call('projects',{'name':'QA · complete provider flow'},expected=201);pid=p['id'];report['project_id']=pid;save()
 call('batches',{'id':str(uuid.uuid4()),'project_id':pid,'stage':'compose','prompt':'Place the RV in the landscape.'},expected=400);check('Composition requires both selected inputs')
 call('projects/'+pid+'/select',{'stage':'rv','asset_id':'sample-rv'})
 call('projects/'+pid+'/select',{'stage':'landscape','asset_id':'alpine-quiet'})
 prompt=call('enhance',{'stage':'landscape','brief':'An alpine lake with a level gravel foreground, warm afternoon light, no vehicles or people.'})['prompt'];assert len(prompt)>100;check('OpenAI enhancement returns editable photography prompt')

def generate(stage,prompt,ref=None):
 payload={'id':str(uuid.uuid4()),'project_id':pid,'stage':stage,'prompt':prompt,'aspect':'landscape_4_3'}
 if ref:payload['reference_id']=ref
 existing=next((b for b in report['batches'] if b['stage']==stage),None)
 if existing and existing.get('result_ids'):return existing['result_ids'][0]
 if existing:
  b=call('batches/'+existing['id']);payload['id']=b['id'];payload['prompt']=b['prompt'];start=existing['started']
 else:
  start=time.time();b=call('batches',payload,expected=201);report['batches'].append({'id':b['id'],'stage':stage,'endpoint':b['endpoint'],'quality':b['quality'],'started':start});save()
 assert len(b['jobs'])==4
 if stage!='people':assert b['quality']=='max' and 'sunburst' in b['endpoint']
 else:assert b['endpoint']=='meta/muse-image/edit'
 original=[j['request_id'] for j in b['jobs']]
 duplicate=call('batches',payload,expected=201);assert original==[j['request_id'] for j in duplicate['jobs']];check(stage+': duplicate submission reuses all four provider requests')
 for tick in range(100):
  statuses=[j['status'] for j in b['jobs']]
  print(stage+': '+', '.join(statuses),flush=True)
  if all(s=='ready' for s in statuses):break
  if any(s in ['failed','unknown'] for s in statuses):raise RuntimeError(json.dumps(b))
  for job in b['jobs']:
   if job['status']=='save_failed':
    recovered=call('jobs/'+job['id']+'/retry',{})
    assert next(j for j in recovered['jobs'] if j['id']==job['id'])['request_id']==job['request_id']
    check(stage+': save recovery preserves provider request')
  time.sleep(5);b=call('batches/'+b['id'])
 else:raise RuntimeError(stage+' did not finish within test window')
 report['batches'][-1]['elapsed_seconds']=round(time.time()-start,2);report['batches'][-1]['requests']=[j['request_id'] for j in b['jobs']];report['batches'][-1]['result_ids']=[j['result_asset_id'] for j in b['jobs']];save();check(stage+': four distinct images saved successfully')
 return b['jobs'][0]['result_asset_id']
try:
 landscape=generate('landscape',prompt)
 call('assets/'+landscape,{'name':'QA alpine landscape','in_library':True},'PATCH');call('projects/'+pid+'/select',{'stage':'landscape','asset_id':landscape});check('Generated landscape can be saved and selected without regenerating')
 composition=generate('compose','Fit the RV naturally on the level foreground, preserving its body details. Match the selected landscape light and perspective. No people or props.')
 call('projects/'+pid+'/select',{'stage':'compose','asset_id':composition})
 people=generate('people','Add two adults standing naturally beside the RV, sharing a quiet conversation. Keep the RV and landscape unchanged. Realistic clothing and natural faces.')
 call('projects/'+pid+'/select',{'stage':'lifestyle','asset_id':people})
 objects=generate('objects','Add two simple folding camping chairs near the RV. Preserve the people, RV, landscape and camera position. Match the scene lighting.')
 call('projects/'+pid+'/select',{'stage':'lifestyle','asset_id':objects})
 call('approve',{'project_id':pid,'asset_id':composition,'checks':{'rv':True,'scene':True,'crop':True}},expected=400);check('Approval rejects a non-selected image')
 call('approve',{'project_id':pid,'asset_id':objects,'checks':{'rv':False,'scene':True,'crop':True}},expected=400);check('Approval requires all review checks')
 call('approve',{'project_id':pid,'asset_id':objects,'checks':{'rv':True,'scene':True,'crop':True}});check('Selected final image can be approved')
 req=urllib.request.Request(BASE+'media/'+objects+'?download=1',headers={'Cookie':'__sites_local_auth=1'})
 with urllib.request.urlopen(req) as response:assert response.headers.get('Content-Disposition','').startswith('attachment');assert len(response.read())>10000
 check('Approved full-resolution download works')
 call('projects/'+pid+'/select',{'stage':'lifestyle','asset_id':composition});check('Accepted base composition can be restored')
 prop=generate('prop','One simple khaki folding camping chair, isolated on a neutral background, clearly visible at a three-quarter angle, realistic materials.')
 call('assets/'+prop,{'name':'QA camping chair','in_library':True},'PATCH');check('Reusable object generation and library save work')
 call('projects/'+pid+'/select',{'stage':'landscape','asset_id':'alpine-quiet'})
 p=next(p for p in call('state')['projects'] if p['id']==pid);assert p['composition_id'] is None and p['current_id'] is None;check('Changing upstream landscape clears downstream selections')
 call('projects/'+pid+'/select',{'stage':'compose','asset_id':composition},expected=409);check('Stale composition cannot be selected with different source images')
 report['passed']=True;report.pop('error',None)
except Exception as e:report['passed']=False;report['error']=str(e);print('FAIL '+str(e),flush=True)
finally:report['finished_at']=time.time();save()
