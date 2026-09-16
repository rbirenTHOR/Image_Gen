import { test, expect } from '@playwright/test';
import type { Job } from '../../lib/domain';
type ProviderRecord = {kind:string; input:{prompt:string; image_size:{width:number;height:number}}};

test('Mixed-format shoot preserves sizes and shot identity through fallback, retries and replay', async ({ request }) => {
  const headers = {Cookie:'__sites_local_auth=1'};
  const post = (path:string, data:unknown) => request.post('/api/studio/'+path,{data,headers});
  await post('bootstrap',{});
  const p=await (await post('projects',{name:'Mixed format photoshoot regression'})).json();
  for(const [stage,asset_id] of [['rv','sample-rv'],['landscape','mountain-stillness']])
    expect((await post('projects/'+p.id+'/select',{stage,asset_id})).ok()).toBe(true);
  const control=async(data={})=>(await request.post('http://127.0.0.1:6199/__control',{data})).json();
  const before=await control({failPlan:1,failSubmit:1,failSave:0,failChat:0,delay:10});
  const data={id:crypto.randomUUID(),project_id:p.id,stage:'compose',count:2,shot_ids:['establishing','portrait'],prompt:'Use two adults in a candid camp setting with the original RV.'};
  const res=await post('batches',data);
  expect(res.ok(),await res.text()).toBe(true);
  const batch=await res.json();
  expect(batch.jobs.map((j:Job)=>j.output_aspect)).toEqual(['landscape_16_9','portrait_4_3']);
  expect(batch.jobs.map((j:Job)=>j.shot_id)).toEqual(data.shot_ids);
  const images=(await control()).records.slice(before.records.length).filter((r:ProviderRecord)=>r.kind==='image');
  expect(images.map((r:ProviderRecord)=>r.input.image_size)).toEqual([{width:3840,height:2160},{width:2448,height:3264}]);
  expect(images[1].input.prompt).toContain('VERTICAL HUMAN STORY');
  expect(images[1].input.prompt).not.toContain('Keep the backdrop camera and horizon fixed');
  const failed=batch.jobs.find((j:Job)=>j.status==='failed');
  expect(failed).toBeTruthy();
  expect((await post('jobs/'+failed.id+'/retry',{})).ok()).toBe(true);
  const retried=await control();
  const last=retried.records.filter((r:ProviderRecord)=>r.kind==='image').at(-1);
  expect(last.input.prompt).toBe(failed.generation_prompt);
  expect(last.input.image_size).toEqual(failed.output_aspect==='landscape_16_9'?{width:3840,height:2160}:{width:2448,height:3264});
  expect((await post('batches',data)).ok()).toBe(true);
  expect((await control()).records.length).toBe(retried.records.length);
  expect((await post('batches',{...data,shot_ids:['portrait','establishing']})).status()).toBe(409);
  for(const bad of [
    {shot_ids:['portrait','portrait']}, {shot_ids:['missing','portrait']}, {shot_ids:['detail']},
    {stage:'people'}, {count:3,shot_ids:['establishing','portrait','detail']},
  ]) expect((await post('batches',{...data,...bad,id:crypto.randomUUID()})).ok()).toBe(false);
  expect((await control()).records.length).toBe(retried.records.length);
  await expect.poll(async()=> (await (await request.get('/api/studio/batches/'+data.id,{headers})).json()).jobs.every((j:Job)=>j.status==='ready')).toBe(true);
  await control({failPlan:0,failSubmit:0});
  const second = {...data, id:crypto.randomUUID(), shot_ids:['detail','action']};
  const secondResponse = await post('batches', second);
  expect(secondResponse.ok()).toBe(true);
  const secondBatch = await secondResponse.json();
  expect(secondBatch.jobs.map((j:Job)=>j.output_aspect)).toEqual(['square_hd','landscape_4_3']);
  const lastTwo=(await control()).records.filter((r:ProviderRecord)=>r.kind==='image').slice(-2);
  expect(lastTwo.map((r:ProviderRecord)=>r.input.image_size)).toEqual([{width:2880,height:2880},{width:3264,height:2448}]);
  expect(lastTwo[0].input.prompt).toContain('SQUARE TACTILE LIFESTYLE DETAIL');
  await expect.poll(async()=> (await (await request.get('/api/studio/batches/'+second.id,{headers})).json()).jobs.every((j:Job)=>j.status==='ready')).toBe(true);
  await control({noGround:true});
  const beforeNoGround=(await control()).records.filter((r:ProviderRecord)=>r.kind==='image').length;
  expect((await post('batches',{...data,id:crypto.randomUUID()})).status()).toBe(422);
  expect((await control()).records.filter((r:ProviderRecord)=>r.kind==='image').length).toBe(beforeNoGround);
  await control({noGround:false});
});
