import json,urllib.request,urllib.error,uuid,sqlite3,time
from pathlib import Path
base='http://localhost:5173/api/studio/'
def req(path,data=None,cookie=True,origin=None,expected=200,method=None):
 headers={'Content-Type':'application/json'}
 if cookie:headers['Cookie']='__sites_local_auth=1'
 if origin:headers['Origin']=origin
 r=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers=headers,method=method or ('POST' if data is not None else 'GET'))
 try:
  with urllib.request.urlopen(r,timeout=90) as response:status=response.status;v=json.load(response)
 except urllib.error.HTTPError as e:
  status=e.code
  try:v=json.load(e)
  except:v={}
 assert status==expected,(path,status,v)
 return v
checks=[]
def ok(name):checks.append(name);print('PASS '+name,flush=True)
req('state',cookie=False,expected=401);ok('Anonymous state access is rejected')
req('projects',{'name':'Cross-site request'},origin='https://untrusted.example',expected=403);ok('Cross-origin mutations are rejected')
p=req('projects',{'name':'QA · request safety'},expected=201);pid=p['id']
req('projects/'+pid,{'step':'review'},method='PATCH',expected=400);ok('Review cannot be entered before a composition exists')
req('projects/'+pid+'/select',{'stage':'rv','asset_id':'alpine-quiet'},expected=400);ok('Wrong asset kinds are rejected')
req('assets/sample-rv',{'name':'Changed sample'},method='PATCH',expected=403);ok('Shared starter references cannot be overwritten')
req('batches',{'id':'invalid','project_id':pid,'stage':'compose','prompt':'A legitimate long prompt'},expected=400);ok('Invalid batch identifiers are rejected before provider submission')
req('batches',{'id':str(uuid.uuid4()),'project_id':pid,'stage':'people','prompt':'Two adults near an RV'},expected=400);ok('People generation requires a selected composition')
# Inject only isolated local records to exercise crash recovery and ownership.
path=next(p for p in Path('.wrangler/state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if p.name!='metadata.sqlite')
db=sqlite3.connect(path);now=int(time.time()*1000);bid=str(uuid.uuid4());jid=str(uuid.uuid4())
db.execute('INSERT INTO batches(id,owner_id,project_id,stage,prompt,endpoint,quality,aspect,inputs_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',(bid,'local_seedy',pid,'landscape','Recovery fixture','openai/gpt-image-2.5/sunburst/text-to-image','max','landscape_4_3','[]',now-120000))
db.execute('INSERT INTO jobs(id,batch_id,slot,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',(jid,bid,0,'submitting',now-120000,now-120000));db.commit()
b=req('batches/'+bid);assert b['jobs'][0]['status']=='unknown';ok('Interrupted submission becomes unknown without automatic duplicate submission')
req('jobs/'+jid+'/retry',{},expected=409);ok('Unknown submissions cannot be blindly retried')
# Verify completed-image storage recovery never requests a new generation.
report=json.loads(Path('work/live-test-report.json').read_text());done=next(b for b in report['batches'] if b.get('result_ids'))
j=done['result_ids'][0];before=db.execute('SELECT request_id,attempts FROM jobs WHERE id=?',(j,)).fetchone()
db.execute("UPDATE jobs SET status='save_failed',poll_after=0,lease_until=0 WHERE id=?",(j,));db.commit()
after=req('jobs/'+j+'/retry',{});job=next(v for v in after['jobs'] if v['id']==j);assert job['status']=='ready'
assert db.execute('SELECT request_id,attempts FROM jobs WHERE id=?',(j,)).fetchone()==before;ok('Retry saving reuses the same provider result and request ID')
assert all(v['status']=='ready' for v in after['jobs']);ok('Retry saving preserves all other successful images')
# Add a foreign owner row and verify lookup is scoped.
foreign=str(uuid.uuid4());db.execute('INSERT INTO projects(id,owner_id,name,created_at,updated_at) VALUES(?,?,?,?,?)',(foreign,'another_user','Private',now,now));db.commit()
req('projects/'+foreign,{'name':'Unauthorized'},method='PATCH',expected=404);ok('Cross-owner campaign mutations are rejected')
db.close();Path('work/api-safety-report.json').write_text(json.dumps({'passed':True,'checks':checks},indent=2))
