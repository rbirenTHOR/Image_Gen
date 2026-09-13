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
  const request={id:crypto.randomUUID(),project_id:p.id,stage:'compose',count:4,prompt:'Keep the RV distant on visible level ground. Preserve the landscape.'};
  const baseline=await control({failPlan:1,failChat:0,failSubmit:0,failSave:0,delay:100});
  const fallback=await page.request.post('/api/studio/batches',{data:request});
  expect(fallback.ok()).toBe(true);
  const fallbackBatch=await fallback.json();
  expect(fallbackBatch.jobs.every((j:any)=>j.shot_label.startsWith('Preset ·'))).toBe(true);
  expect(new Set(fallbackBatch.jobs.map((j:any)=>j.generation_prompt)).size).toBe(4);
  expect((await control()).records.filter((r:any)=>r.kind==='image').length).toBe(baseline.records.filter((r:any)=>r.kind==='image').length+4);
  await page.goto('/?project='+p.id);
  await expect(page.getByText('Automatic scene assessment was unavailable.',{exact:false})).toBeVisible();
  await expect(page.locator('.batch-section').first().getByText('4 of 4 ready',{exact:true})).toBeVisible({timeout:30000});
  request.id=crypto.randomUUID();
  const before=await control({failPlan:0,failSubmit:1,incompletePlan:1});
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
  expect(plans).toHaveLength(2);
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
  await expect(page.locator('.batch-section').first().getByText('4 of 4 ready',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.locator('.batch-section').first().locator('.shot-label')).toHaveCount(4);
  await page.reload();
  await expect(page.locator('.batch-section').first().locator('.shot-label')).toHaveCount(4);
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
  const data={id:crypto.randomUUID(),project_id:p.id,stage:'compose',count:4,prompt:'Place the RV on level ground with distinct positions.'};
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

test('Two-image default, quantity choices, physical checks and incompatible-ground recovery',async({context,page})=>{
  await context.addCookies([{name:'__sites_local_auth',value:'1',url:'http://localhost:6173'}]);
  const control=async(data={})=>(await page.request.post('http://127.0.0.1:6199/__control',{data})).json();
  await page.goto('/');
  const p=await (await page.request.post('/api/studio/projects',{data:{name:'Natural placement and quantity'}})).json();
  for(const [stage,asset_id] of [['rv','sample-rv'],['landscape','mountain-stillness']])
    expect((await page.request.post('/api/studio/projects/'+p.id+'/select',{data:{stage,asset_id}})).ok()).toBe(true);
  await page.goto('/?project='+p.id);
  await expect(page.getByRole('button',{name:'Generate 2 takes',exact:true})).toBeVisible();
  await expect(page.getByRole('combobox',{name:'Number of images'})).toContainText('2 images');
  await page.getByRole('combobox',{name:'Number of images'}).click();
  await page.getByRole('option',{name:'3 images',exact:true}).click();
  await expect(page.getByRole('button',{name:'Generate 3 takes',exact:true})).toBeVisible();
  const before=await control({noGround:true,failPlan:0,incompletePlan:0,failSubmit:0,failSave:0,delay:50});
  await page.getByRole('button',{name:'Generate 3 takes',exact:true}).click();
  await expect(page.getByText('These photos do not support a natural RV placement.',{exact:false}).first()).toBeVisible();
  expect((await control()).records.slice(before.records.length).filter((r:any)=>r.kind==='image')).toHaveLength(0);
  await control({noGround:false});
  await page.getByRole('button',{name:'Generate 3 takes',exact:true}).click();
  await expect(page.getByText('3 of 3 ready',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByRole('progressbar',{name:'3 of 3 images ready'})).toHaveAttribute('aria-valuenow','100');
  const rec=(await control()).records.slice(before.records.length);
  expect(rec.filter((r:any)=>r.kind==='image')).toHaveLength(3);
  expect(rec.filter((r:any)=>r.plan).at(-1).requestedCount).toBe(3);
  expect(rec.filter((r:any)=>r.plan).at(-1).instructions).toContain('There are no mandatory left/right positions');
  for(const r of rec.filter((r:any)=>r.kind==='image'))expect(r.input.prompt).toContain('Use uniform scaling');
  await page.reload();
  await expect(page.getByText('3 of 3 ready',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Generate 2 takes',exact:true})).toBeVisible();
  for(const count of [1,2,4]){
    const data={id:crypto.randomUUID(),project_id:p.id,stage:'compose',prompt:'Place the whole RV naturally on visible level ground.',...(count===2?{}:{count})};
    const result=await page.request.post('/api/studio/batches',{data});
    expect(result.ok()).toBe(true);const b=await result.json();expect(b.jobs).toHaveLength(count);
    const records=(await control()).records.length;
    expect((await page.request.post('/api/studio/batches',{data})).ok()).toBe(true);
    expect((await control()).records.length).toBe(records);
    expect((await page.request.post('/api/studio/batches',{data:{...data,count:count===1?2:1}})).status()).toBe(409);
    await expect.poll(async()=>{const current=await (await page.request.get('/api/studio/batches/'+b.id)).json();return current.jobs.every((j:any)=>j.status==='ready');}).toBe(true);
  }
  for(const count of [0,5,1.5])expect((await page.request.post('/api/studio/batches',{data:{id:crypto.randomUUID(),project_id:p.id,stage:'compose',prompt:'Place the RV naturally.',count}})).ok()).toBe(false);
});
