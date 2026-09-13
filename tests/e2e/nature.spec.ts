import { test, expect } from '@playwright/test';
import { naturePhotos } from '../../lib/nature-catalog';

test.beforeEach(async ({context, page}) => {
  await context.addCookies([{name:'__sites_local_auth',value:'1',url:'http://localhost:6173'}]);
  await page.request.post('http://127.0.0.1:6199/__control', {data:{failNature:0,failChat:0,failSubmit:0,failSave:0,delay:500}});
});

test('Real-photo catalog filters, provenance, and recoverable original loading', async ({page}, info) => {
  await page.goto('/?view=library&kind=landscape');
  await expect(page.locator('.photo-card-detail').first()).toBeVisible();
  const state = await (await page.request.get('/api/studio/state')).json();
  const catalog = state.assets.filter((a:any)=>a.kind==='landscape'&&a.source==='sourced-photo'&&a.in_library);
  expect(catalog.length).toBeGreaterThanOrEqual(30);
  await expect(page.locator('.photo-card-detail')).toHaveCount(catalog.length);
  await page.getByRole('button',{name:'Open ground',exact:true}).click();
  await expect(page.locator('.photo-card-detail')).toHaveCount(catalog.filter((a:any)=>a.photo_source.suitability==='placement').length);
  await page.getByRole('button',{name:'Scenic references',exact:true}).click();
  await expect(page.locator('.photo-card-detail')).toHaveCount(catalog.filter((a:any)=>a.photo_source.suitability==='scenery').length);
  await page.getByRole('button',{name:'All scenes',exact:true}).click();
  const index = ['desktop-light','mobile-light','desktop-dark'].indexOf(info.project.name);
  const photo = naturePhotos[10+index];
  await page.getByRole('textbox',{name:'Search library'}).fill(photo.name);
  await expect(page.locator('.photo-card-detail')).toHaveCount(1);
  // Only the source transfer is mocked; the app, media route, and R2 cache are real.
  await page.request.post('http://127.0.0.1:6199/__control',{data:{failNature:1}});
  const prior = (await (await page.request.get('http://127.0.0.1:6199/__control')).json()).records;
  expect(prior.filter((r:any)=>r.kind==='nature-original'&&r.url===photo.originalUrl)).toHaveLength(0);
  await page.getByRole('button',{name:'Enlarge '+photo.name,exact:true}).click();
  await expect(page.getByText('The original could not load.')).toBeVisible();
  await expect(page.getByRole('link',{name:'View original source ↗'})).toHaveAttribute('href',photo.sourceUrl);
  await page.getByRole('button',{name:'Retry original',exact:true}).click();
  await expect(page.locator('.original-status')).toHaveCount(0);
  const before = (await (await page.request.get('http://127.0.0.1:6199/__control')).json()).records.filter((r:any)=>r.kind==='nature-original'&&r.url===photo.originalUrl).length;
  expect((await page.request.get('/api/studio/media/'+photo.id)).ok()).toBe(true);
  const after = (await (await page.request.get('http://127.0.0.1:6199/__control')).json()).records.filter((r:any)=>r.kind==='nature-original'&&r.url===photo.originalUrl).length;
  expect(after).toBe(before);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.getByRole('textbox',{name:'Search library'}).fill('no-such-place');
  await expect(page.getByText('No matching images')).toBeVisible();
  await page.getByRole('button',{name:'Clear search',exact:true}).click();
  await expect(page.locator('.photo-card-detail')).toHaveCount(catalog.length);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
  await page.screenshot({path:info.outputPath('photo-library.png'),fullPage:false});
});

test('A sourced backdrop flows through composition, saving, and campaign chat', async ({page}) => {
  await page.goto('/');
  await expect(page.getByRole('navigation')).toBeVisible();
  const p = await (await page.request.post('/api/studio/projects',{data:{name:'Real-photo workflow'}})).json();
  await page.goto('/?project='+p.id);
  await page.getByRole('button',{name:'Select Travel trailer · sample',exact:true}).click();
  await page.getByRole('button',{name:'Choose the setting',exact:true}).click();
  await expect(page.getByRole('tab',{name:'Photo library',exact:true})).toHaveAttribute('aria-selected','true');
  await page.getByRole('tab',{name:'Generate a setting',exact:true}).click();
  await expect(page.getByRole('button',{name:'Create 2 landscapes',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'Photo library',exact:true}).click();
  const photo = naturePhotos[0];
  await page.getByRole('button',{name:'Save to campaign '+photo.name,exact:true}).click();
  await page.getByRole('button',{name:'Select '+photo.name,exact:true}).click();
  await page.getByRole('button',{name:'Compose your photograph',exact:true}).click();
  await expect(page.getByText('Real-photo backdrop',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Generate 2 takes',exact:true}).click();
  await expect(page.getByText('2 of 2 ready',{exact:true})).toBeVisible({timeout:30000});
  await page.getByRole('button',{name:'Save all ready',exact:true}).click();
  await page.getByRole('navigation').getByRole('button',{name:'Campaigns',exact:true}).click();
  await page.getByRole('button',{name:/Real-photo workflow/}).first().click();
  await expect(page.getByText('3 saved images',{exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText('3 saved images',{exact:true})).toBeVisible();
  const card=page.getByRole('article').filter({has:page.getByRole('img',{name:photo.name,exact:true})});
  await card.getByRole('button',{name:'Riff on this',exact:true}).click();
  const chatTab=page.getByRole('tab',{name:'Creative chat',exact:true});
  if(await chatTab.isVisible()) await chatTab.click();
  await expect(page.getByRole('button',{name:'Remove reference '+photo.name,exact:true})).toBeVisible();
});
