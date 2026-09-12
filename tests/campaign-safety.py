import json,sqlite3,urllib.request,urllib.error,uuid,time
from pathlib import Path
base='http://localhost:5173/api/studio/'
r=json.loads(Path('work/campaign-test-report.json').read_text());pid=r['project_id'];tid=r['turns']['variation']['id']
def call(route,data=None,expected=200,auth=True):
 headers={'Content-Type':'application/json'}
 if auth:headers['Cookie']='__sites_local_auth=1'
 req=urllib.request.Request(base+route,data=None if data is None else json.dumps(data).encode(),headers=headers)
 try:
  with urllib.request.urlopen(req,timeout=60) as response:status=response.status;v=json.load(response)
 except urllib.error.HTTPError as e:status=e.code;v=json.load(e)
 assert status==expected,(route,status,v)
 return v
checks=[]
def ok(s):checks.append(s);print('PASS '+s,flush=True)
call('projects/'+pid+'/gallery',expected=401,auth=False);ok('Campaign gallery requires authentication')
db=sqlite3.connect(next(p for p in Path('.wrangler/state/v3/d1/miniflare-D1DatabaseObject').glob('*.sqlite') if p.name!='metadata.sqlite'));foreign=db.execute("SELECT id FROM projects WHERE owner_id='another_user' LIMIT 1").fetchone()[0]
call('projects/'+foreign+'/gallery',expected=404);call('projects/'+foreign+'/chat',{'id':str(uuid.uuid4()),'text':'Change the image','reference_ids':[]},404);ok('Gallery and chat are scoped to the campaign owner')
call('projects/'+foreign+'/chat/'+tid+'/generate',{'prompt':'Create another image with warm light','aspect':'landscape_4_3'},404);ok('Another campaign cannot invoke a conversation direction')
gallery=call('projects/'+pid+'/gallery');before=set(gallery['saved_ids'])
call('projects/'+pid+'/gallery',{'asset_ids':['sample-rv','unavailable-image'],'saved':True},404);after=set(call('projects/'+pid+'/gallery')['saved_ids']);assert before==after;ok('Bulk saving validates every image before making any change')
call('projects/'+pid+'/chat',{'id':tid,'text':'A changed duplicate message','reference_ids':[]},409);ok('An existing turn cannot be overwritten with another request')
call('batches',{'id':str(uuid.uuid4()),'project_id':pid,'stage':'variation','prompt':'A valid visual direction','reference_ids':[]},400);ok('Variation requires an explicit base image')
call('projects/'+pid+'/approve-image',{'asset_id':'sample-rv','checks':{'rv':True,'scene':True,'crop':True}},400);ok('Reference sample cannot be approved as a finished generated campaign image')
# Isolated interrupted-message fixture. It never calls the text or image provider.
now=int(time.time()*1000);fixture=str(uuid.uuid4());db.execute('INSERT INTO campaign_turns(id,owner_id,project_id,user_text,references_json,status,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',(fixture,'local_seedy',pid,'Interrupted chat test','[]','planning',now-130000,now-130000));db.commit()
fixtureTurn=next(t for t in call('projects/'+pid+'/gallery')['turns'] if t['id']==fixture);assert fixtureTurn['status']=='failed' and fixtureTurn['batch_id'] is None;ok('Interrupted chat becomes retryable without generating images')
db.execute('DELETE FROM campaign_turns WHERE id=?',(fixture,));db.commit();db.close()
Path('work/campaign-safety-report.json').write_text(json.dumps({'passed':True,'checks':checks},indent=2))
