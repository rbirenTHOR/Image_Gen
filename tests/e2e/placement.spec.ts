import { test, expect } from '@playwright/test';
import { naturePhotos } from '../../lib/nature-catalog';

test('Scene assessment produces four persisted shot directions and retries the same shot', async ({context,page}) => {
  await context.addCookies([{name:'__sites_local_auth',value:'1',url:'http://localhost:6173'}]);
  const control = async (data={}) => (await page.request.post('http://127.0.0.1:6199/__control',{data})).json();
  await page.goto('/');
  await expect(page.getByRole('navigation')).toBeVisible();
  const p = await (await page.request.post('/api/studio/projects',{data:{name:'Placement planning'}})).json();
  for(const [stage,asset_id] of [['rv','sample-rv'],['landscape','mountain-stillness']])
    expect((await page.request.post('/api/studio/projects/'+p.id+'/select',{data:{stage,asset_id}})).ok()).toBe(true);
  const request={id:crypto.randomUUID(),project_id:p.id,stage:'compose',prompt:'Keep the RV distant on visible level ground. Preserve the landscape.'};
  const baseline=await control({failPlan:1,failChat:0,failSubmit:0,failSave:0,delay:100});
  const failed=await page.request.post('/api/studio/batches',{data:request});
  expect(failed.status()).toBe(503);
  expect((await failed.json()).error).toContain('No image generations');
  expect((await control()).records.filter((r:any)=>r.kind==='image').length).toBe(baseline.records.filter((r:any)=>r.kind==='image').length);
  const before=await control({failPlan:0,failSubmit:1});
  const response=await page.request.post('/api/studio/batches',{data:request});
  expect(response.ok()).toBe(true);
  const b=await response.json();
  expect(new Set(b.jobs.map((j:any)=>j.shot_label)).size).toBe(4);
  expect(new Set(b.jobs.map((j:any)=>j.generation_prompt)).size).toBe(4);
  const after=await control();
  const images=after.records.slice(before.records.length).filter((r:any)=>r.kind==='image');
  expect(images).toHaveLength(4);
  expect(images.map((r:any)=>r.input.prompt).sort()).toEqual(b.jobs.map((j:any)=>j.generation_prompt).sort());
  expect(images.every((r:any)=>r.input.quality==='max'&&r.input.num_images===1)).toBe(true);
  const plans=after.records.slice(before.records.length).filter((r:any)=>r.plan);
  expect(plans).toHaveLength(1);
  expect(plans[0].visionDetails).toEqual(['high','high']);
  const failedJob=b.jobs.find((j:any)=>j.status==='failed');
  expect(failedJob).toBeTruthy();
  expect((await page.request.post('/api/studio/jobs/'+failedJob.id+'/retry',{data:{}})).ok()).toBe(true);
  const retry=await control();
  expect(retry.records.slice(after.records.length).filter((r:any)=>r.plan)).toHaveLength(0);
  expect(retry.records.filter((r:any)=>r.kind==='image').at(-1).input.prompt).toBe(failedJob.generation_prompt);
  expect((await page.request.post('/api/studio/batches',{data:request})).ok()).toBe(true);
  expect((await control()).records.length).toBe(retry.records.length);
  await page.goto('/?project='+p.id);
  await expect(page.getByText('4 of 4 ready',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.locator('.shot-label')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.shot-label')).toHaveCount(4);
});


test('Large originals retain dimensions while a cached compatible reference reaches fal', async ({context,page},info) => {
  await context.addCookies([{name:'__sites_local_auth',value:'1',url:'http://localhost:6173'}]);
  await page.goto('/');
  await expect(page.getByRole('navigation')).toBeVisible();
  const control=async(data={})=>(await page.request.post('http://127.0.0.1:6199/__control',{data})).json();
  const before=await control({largeNature:true,failPlan:0,failSubmit:0,failSave:0,failNature:0});
  const p=await (await page.request.post('/api/studio/projects',{data:{name:'Large reference validation'}})).json();
  const photo=naturePhotos[13+['desktop-light','mobile-light','desktop-dark'].indexOf(info.project.name)];
  for(const [stage,asset_id] of [['rv','sample-rv'],['landscape',photo.id]])
    expect((await page.request.post('/api/studio/projects/'+p.id+'/select',{data:{stage,asset_id}})).ok()).toBe(true);
  const data={id:crypto.randomUUID(),project_id:p.id,stage:'compose',prompt:'Place the RV on level ground with distinct positions.'};
  try {
    expect((await page.request.post('/api/studio/batches',{data})).ok()).toBe(true);
    await expect.poll(async()=>{const b=await (await page.request.get('/api/studio/batches/'+data.id)).json();return b.jobs.every((j:any)=>j.status==='ready');}).toBe(true);
    const records=(await control()).records.slice(before.records.length);
    const compression=records.filter((r:any)=>r.kind==='compression');
    expect(compression).toHaveLength(1);
    expect(compression[0].input).toMatchObject({max_width:null,max_height:null,quality:90,output_format:'jpg'});
    expect(records.filter((r:any)=>r.kind==='image')).toHaveLength(4);
    const nextId=crypto.randomUUID();
    expect((await page.request.post('/api/studio/batches',{data:{...data,id:nextId}})).ok()).toBe(true);
    await expect.poll(async()=>{const b=await (await page.request.get('/api/studio/batches/'+nextId)).json();return b.jobs.every((j:any)=>j.status==='ready');}).toBe(true);
    expect((await control()).records.slice(before.records.length).filter((r:any)=>r.kind==='compression')).toHaveLength(1);
  } finally { await control({largeNature:false}); }
});
