"""Paid integration test: one replacement generation in an isolated local fixture."""
import json,sqlite3,time,uuid,urllib.request
from pathlib import Path
root='http://localhost:5173/api/studio/'
def call(path,data=None):
 req=urllib.request.Request(root+path,data=None if data is None else json.dumps(data).encode(),headers={'Cookie':'__sites_local_auth=1','Content-Type':'application/json'})
 with urllib.request.urlopen(req,timeout=100) as r:return json.load(r)
db=sqlite3.connect(next(p for p in Path('.wrangler/state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if p.name!='metadata.sqlite'))
p=call('projects',{'name':'QA · single slot retry'});bid=str(uuid.uuid4());ids=[str(uuid.uuid4()) for _ in range(4)];now=int(time.time()*1000)
db.execute('INSERT INTO batches(id,owner_id,project_id,stage,prompt,endpoint,quality,aspect,inputs_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',(bid,'local_seedy',p['id'],'prop','One khaki folding camping chair, isolated on a neutral background, realistic product photograph.','openai/gpt-image-2.5/sunburst/text-to-image','max','landscape_4_3','[]',now))
for slot,j in enumerate(ids):db.execute('INSERT INTO jobs(id,batch_id,slot,status,request_id,result_asset_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',(j,bid,slot,'failed' if slot==0 else 'ready',None if slot==0 else 'fixture-preserved-'+str(slot),None if slot==0 else 'sample-rv',now,now))
db.commit()
b=call('jobs/'+ids[0]+'/retry',{});receipt=b['jobs'][0]['request_id'];assert receipt
for _ in range(90):
 if b['jobs'][0]['status']=='ready':break
 assert b['jobs'][0]['status'] not in ['failed','unknown'],b
 if b['jobs'][0]['status']=='save_failed':b=call('jobs/'+ids[0]+'/retry',{})
 else:time.sleep(5);b=call('batches/'+bid)
else:raise RuntimeError('Replacement did not complete')
assert b['jobs'][0]['request_id']==receipt
for slot in range(1,4):assert b['jobs'][slot]['request_id']=='fixture-preserved-'+str(slot) and b['jobs'][slot]['result_asset_id']=='sample-rv' and b['jobs'][slot]['status']=='ready'
assert db.execute('SELECT attempts FROM jobs WHERE id=?',(ids[0],)).fetchone()[0]==2
print('PASS One failed slot regenerated; three successful slot receipts and images unchanged',flush=True)
Path('work/retry-one-report.json').write_text(json.dumps({'passed':True,'batch_id':bid,'request_id':receipt},indent=2))
