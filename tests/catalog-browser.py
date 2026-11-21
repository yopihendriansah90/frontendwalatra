"""Read-only live API checks and isolated contract/failure scenarios."""
import asyncio,json,os,urllib.request
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
from playwright.async_api import async_playwright
from browser_checks import wait_until

ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'evidence/catalog';BASE=os.environ.get('CATALOG_TEST_URL','http://127.0.0.1:5173');API=os.environ.get('CATALOG_TEST_API','http://127.0.0.1:8000/api/v1');checks=[]
def check(name,value):
 checks.append({'name':name,'passed':bool(value)});(OUT/'browser-progress.json').write_text(json.dumps(checks,indent=2));print(name,'PASS' if value else 'FAIL',flush=True);assert value,name
def live(path):
 with urllib.request.urlopen(urllib.request.Request(API+path,headers={'Accept':'application/json'}),timeout=15) as r:return json.load(r)
async def ready(page):
 await wait_until(page,'!document.querySelector("#site-main[aria-busy=true]")');await page.wait_for_load_state('networkidle')
 if await page.locator('.swal2-confirm').is_visible():await page.locator('.swal2-confirm').click()

async def main():
 cats=live('/catalog/categories')['data'];live_banners=live('/banners')['data'];catalog=live('/catalog?per_page=50&sort=latest');product=next(i for i in catalog['data'] if i['type']=='product');bundle=next(i for i in catalog['data'] if i['type']=='bundle')
 async with async_playwright() as p:
  browser=await p.chromium.launch();context=await browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');page=await context.new_page();errors=[];writes=[];old_requests=[]
  page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:writes.append(r.url) if r.method not in ['GET','HEAD','OPTIONS'] else None);page.on('request',lambda r:old_requests.append(r.url) if urlsplit(r.url).hostname in ['api.naturalfarm.id','apinf.naturalfarm.id'] else None)
  await page.goto(BASE+'/',wait_until='networkidle');await ready(page)
  check('Home categories follow API including test category',await page.locator('.w-category-card').count()==len(cats))
  check('Homepage categories stay in one horizontal scrolling row',await page.locator('.w-category-carousel').evaluate('(x)=>getComputedStyle(x).flexWrap==="nowrap" && x.scrollWidth>x.clientWidth && [...x.children].every(c=>Math.abs(c.getBoundingClientRect().top-x.firstElementChild.getBoundingClientRect().top)<2)'))
  visible_banner_urls=set(await page.locator('.w-home-banners img').evaluate_all('(xs)=>xs.map(x=>x.src)'))
  if live_banners:
   check('Active homepage banners use API images',bool(visible_banner_urls) and {urlsplit(u).path for u in visible_banner_urls}.issubset({urlsplit(b['image_url']).path for b in live_banners}) and await page.locator('.w-banner-note').count()==0)
  else:
   check('Empty banner API keeps archived homepage banners visible',await page.locator('.w-banner-hero img').count()==1 and await page.locator('.w-banner-note').inner_text()=='Materi promosi arsip sementara.')
  banner=page.locator('.w-banner-hero img');first_banner=await banner.get_attribute('src');next_button=page.locator('.w-banner-hero .w-banner-next');await next_button.click();await wait_until(page,'document.querySelector(".w-banner-dot[aria-pressed=true]")?.getAttribute("aria-label").endsWith("2")');check('Banner controls switch active banner source',await page.locator('.w-banner-hero img').last.get_attribute('src')!=first_banner)
  if live_banners:
   check('Live API banners share the homepage carousel',await page.locator('.w-banner-dot').count()==len(live_banners) and await page.locator('.w-banner-secondary').count()==0)
  await page.reload();await ready(page);check('Banner remains visible after homepage reload',await page.locator('.w-banner-hero img').count()==1)
  check('API category icons are used',all([urlsplit(await page.locator(f'.w-category-card[href="/cat/{c["slug"]}/"] img').get_attribute('src')).path==urlsplit(c['icon_url']).path for c in cats if c.get('icon_url')]))
  keys=await page.locator('[data-item-key]').evaluate_all('(xs)=>xs.map(x=>x.dataset.itemKey)');body=await page.locator('main').inner_text()
  check('Only current API listings appear',all(k in {f"{i['type']}:{i['listing_id']}" for i in catalog['data']} for k in keys))
  check('No archived sale claims remain',not any(t in body for t in ['Berakhir Dalam','Terjual','Flash Sale']))
  await page.screenshot(path=str(OUT/'home-desktop.png'),full_page=True)
  await page.locator('#w-search').fill(product['name']);await page.locator('#w-search').press('Enter');await page.wait_for_url('**/search/**');await ready(page)
  check('Enter search uses q and live data','q=' in page.url and await page.locator('[data-item-key]').count()>0)
  await page.reload();await ready(page);check('Search reload preserves results',await page.locator('[data-item-key]').count()>0)
  await page.goto(BASE+'/product/?per_page=1&sort=name_asc',wait_until='networkidle');await ready(page);before=await page.locator('[data-item-key]').first.get_attribute('data-item-key');await page.get_by_role('link',name='Halaman 2',exact=True).click();await ready(page)
  check('Server pagination changes URL and result','page=2' in page.url and await page.locator('[data-item-key]').first.get_attribute('data-item-key')!=before)
  await page.go_back();await ready(page);check('Back restores pagination','page=2' not in page.url);await page.go_forward();await ready(page);check('Forward restores pagination','page=2' in page.url)
  await page.goto(BASE+f'/product/{product["slug"]}/?listing={product["listing_id"]}',wait_until='networkidle');await ready(page)
  check('Product detail preserves listing and has variants',await page.locator('.w-detail').get_attribute('data-listing-id')==str(product['listing_id']) and await page.locator('.w-variant-badge').count()>0)
  await page.screenshot(path=str(OUT/'product-desktop.png'),full_page=True)
  await page.goto(BASE+f'/bundle/{bundle["slug"]}/?listing={bundle["listing_id"]}',wait_until='networkidle');await ready(page);check('Bundle detail displays components',await page.locator('.w-components li').count()>0)
  await page.goto(BASE+'/product/definitely-absent-walatra/',wait_until='networkidle');await ready(page);check('Unknown slug displays 404 state',await page.get_by_role('heading',name='Halaman tidak ditemukan').count()==1)
  await page.goto(BASE+'/search/?find=zzznomatchwalatra',wait_until='networkidle');await ready(page);check('Legacy find normalizes and empty results are honest','q=' in page.url and 'find=' not in page.url and await page.locator('[data-item-key]').count()==0 and 'Tidak ada hasil' in await page.locator('main').inner_text())
  await page.goto(BASE+'/blog/1-butir-telur-berapa-kalori/',wait_until='networkidle');check('Archived article remains readable','1 Butir Telur' in await page.locator('.detail-content-article').inner_text())
  await page.goto(BASE+'/health-tools/bmi-calculator/',wait_until='networkidle');check('Health tool remains interactive',await page.locator('input').count()>3 and 'BMI' in (await page.locator('#site-main').inner_text()).upper())
  await page.set_viewport_size({'width':390,'height':844});await page.goto(BASE+'/',wait_until='networkidle');await ready(page);await page.locator('.w-mobile-toggle').click();await page.locator('.w-mobile-drawer.is-open').wait_for(state='visible')
  check('Mobile drawer exposes API categories',await page.locator('.w-mobile-drawer.is-open a').count()>=len(cats));await page.keyboard.press('Escape');check('Escape closes mobile drawer',await page.locator('.w-mobile-drawer.is-open').count()==0)
  await page.locator('#w-search').fill(product['name']);await page.get_by_role('button',name='Cari',exact=True).click();await ready(page);check('Mobile icon search works',await page.locator('[data-item-key]').count()>0)
  await page.goto(BASE+'/',wait_until='networkidle');await ready(page)
  check('Mobile categories stay in one horizontally scrollable row',await page.locator('.w-category-carousel').evaluate('(x)=>getComputedStyle(x).flexWrap==="nowrap" && x.scrollWidth>x.clientWidth'));check('Mobile layout stays within viewport',await page.evaluate('document.documentElement.scrollWidth<=innerWidth'));await page.screenshot(path=str(OUT/'mobile-search.png'),full_page=True)
  if errors or old_requests or writes:print(json.dumps({'runtime_errors':errors,'legacy_requests':old_requests,'writes':writes}),flush=True)
  check('No JavaScript errors, legacy API requests or writes',not errors and not old_requests and not writes)
  await context.close()

  # Isolated contract fixtures never change the backend or production catalog.
  c=await browser.new_context(viewport={'width':1440,'height':1000},reduced_motion='reduce');page=await c.new_page();mock_errors=[];page.on('pageerror',lambda e:mock_errors.append(str(e)));seen=[];mode='normal'
  category={'id':1,'name':'Kategori Fixture','slug':'fixture','icon_url':None,'product_count':1,'children':[{'id':2,'name':'Anak Fixture','slug':'anak','icon_url':None,'product_count':1}]}
  prod={'type':'product','listing_id':7,'id':5,'name':'Produk Fixture','slug':'fixture','price':{'min':'25000.00','max':'45000.00'},'image':{'thumb':None,'url':None},'store':{'name':'Toko Satu','slug':'satu'}}
  bund={'type':'bundle','listing_id':7,'id':5,'name':'Bundle Fixture','slug':'bundle-fixture','price':{'value':'40000.00'},'store':{'name':'Toko Dua','slug':'dua'}}
  async def route(r):
   nonlocal mode
   u=urlsplit(r.request.url);seen.append(r.request.url);path=u.path.split('/api/v1')[-1];q=parse_qs(u.query)
   if path=='/banners':data={'success':True,'data':[]} if mode=='banner_empty' else {'success':True,'data':[{'id':1,'name':'Hero fixture','position':'main','image_url':BASE+'/banners/1927.jpg','image_preview_url':None,'cta_url':'https://example.com/promo','open_in_new_tab':True,'sort_order':1},{'id':2,'name':'Banner sama tab','position':'secondary_top','image_url':BASE+'/banners/2188.jpg','image_preview_url':None,'cta_url':'https://example.com/sama-tab','open_in_new_tab':False,'sort_order':2},{'id':3,'name':'Banner kanan bawah','position':'secondary_bottom','image_url':BASE+'/banners/1458.jpeg','image_preview_url':None,'cta_url':None,'open_in_new_tab':False,'sort_order':3},{'id':4,'name':'Hero kedua','position':'main','image_url':BASE+'/banners/1793.jpeg','image_preview_url':None,'cta_url':'https://example.com/promo-2','open_in_new_tab':False,'sort_order':2}]}
   elif path=='/catalog/categories':data={'success':True,'data':[category]}
   elif path.startswith('/catalog/categories/'):
    data={'success':True,'data':{**category,'parent':{'id':9,'name':'Induk Fixture','slug':'induk'}}}
   elif path.startswith('/catalog/products/'):
    data={'success':True,'data':{'id':5,'name':'Produk Fixture','slug':'fixture','product_code':'TEST','categories':[{'name':'Kategori Fixture','slug':'fixture'}],'variants':[{'id':11,'name':'Kecil','price':'25000.00','sku':'SMALL','image_url':BASE+'/banners/1793.jpeg'},{'id':12,'name':'Besar','price':'45000.00','sku':'LARGE','image_url':BASE+'/banners/1927.jpg','attributes':{'volume':'120 ml'}},{'id':13,'name':'Tanpa foto','price':'30000.00','sku':'NO-IMAGE','image_url':None}],'stores':[] if mode=='nostores' else [{'listing_id':7,'store':{'name':'Toko Satu'},'description':'Deskripsi satu','images':[{'id':21,'order':1,'url':BASE+'/banners/2188.jpg'},{'id':22,'order':2,'url':BASE+'/banners/1458.jpeg'}]},{'listing_id':8,'store':{'name':'Toko Dua'},'description':'<p>Deskripsi aman</p><img src=x onerror=alert(1)><script>window.badDescription=true</script>','images':[{'id':23,'order':1,'url':BASE+'/banners/2188.jpg'},{'id':24,'order':2,'url':BASE+'/banners/1458.jpeg'}]}]}}
   elif mode=='validation':await r.fulfill(status=422,json={'success':False,'message':'Harga tidak valid','errors':{'max_price':['Maksimum harus lebih besar.']}});return
   elif mode=='rate':await r.fulfill(status=429,headers={'Retry-After':'2'},json={'success':False,'message':'Tunggu sebentar','retry_after':2});return
   elif mode=='network':await r.abort();return
   elif mode=='empty':data={'success':True,'data':[],'meta':{'current_page':1,'last_page':1,'total':0,'from':None,'to':None}}
   else:data={'success':True,'data':[prod,{**prod,'listing_id':8,'store':{'name':'Toko Dua','slug':'dua'}},bund],'meta':{'current_page':1,'last_page':1,'total':3,'from':1,'to':3}}
   if mode=='race' and q.get('q')==['lambat']:await asyncio.sleep(.8)
   await r.fulfill(json=data)
  await c.route('**/api/v1/**',route)
  mode='banner_empty';await page.goto(BASE+'/',wait_until='networkidle');await ready(page)
  check('Empty API response falls back to retained banner snapshot',await page.locator('.w-banner-hero img').get_attribute('src')==BASE+'/banners/2188.jpg' and 'arsip sementara' in await page.locator('.w-banner-note').inner_text())
  mode='normal';await page.goto(BASE+'/',wait_until='networkidle');await ready(page)
  check('All banner positions remain available in one carousel',await page.locator('.w-banner-hero img').get_attribute('src')==BASE+'/banners/1927.jpg' and await page.locator('.w-banner-dot').count()==4)
  check('Banner new-tab CTA is protected',await page.locator('.w-banner-hero .w-banner-card').get_attribute('href')=='https://example.com/promo' and await page.locator('.w-banner-hero .w-banner-card').get_attribute('target')=='_blank' and await page.locator('.w-banner-hero .w-banner-card').get_attribute('rel')=='noopener noreferrer')
  await page.locator('.w-banner-next').click()
  check('Banner same-tab CTA follows API',await page.locator('.w-banner-hero .w-banner-card').get_attribute('href')=='https://example.com/sama-tab' and await page.locator('.w-banner-hero .w-banner-card').get_attribute('target') is None)
  await page.locator('.w-banner-next').click()
  check('Banner without CTA is not a false link',await page.locator('.w-banner-hero a.w-banner-card').count()==0)
  await page.locator('.w-banner-dot').first.click()
  await page.locator('.w-banner-dot').last.click()
  check('Additional banners are reachable through carousel controls',await page.locator('.w-banner-hero img').get_attribute('src')==BASE+'/banners/1793.jpeg')
  await page.goto(BASE+'/product/',wait_until='networkidle');await ready(page)
  check('Product/bundle listing identities do not collide',len(set(await page.locator('[data-item-key]').evaluate_all('(xs)=>xs.map(x=>x.dataset.itemKey)')))==3)
  check('Missing images show placeholders',await page.locator('.w-card-media .w-no-image').count()==3)
  await page.goto(BASE+'/product/fixture/?listing=8&variant=12',wait_until='networkidle');await ready(page)
  check('Selected listing/variant, store label and decimal price follow response',await page.locator('.w-detail').get_attribute('data-listing-id')=='8' and await page.locator('.w-detail').get_attribute('data-variant-id')=='12' and await page.locator('.w-detail-store-label').inner_text()=='Penawaran toko' and await page.locator('.w-detail-store-name').inner_text()=='Toko Dua' and await page.locator('select[name=listing]').count()==0 and '45.000' in await page.locator('[data-detail-price]').inner_text())
  check('Variant badges show names without prices',await page.locator('.w-variant-name').all_inner_texts()==['Kecil','Besar','Tanpa foto'] and await page.locator('.w-variant-badge').count()==3)
  check('Variant without an image shows only its name',await page.locator('.w-variant-badge').filter(has_text='Tanpa foto').locator('img').count()==0 and await page.locator('.w-variant-badge').filter(has_text='Tanpa foto').inner_text()=='Tanpa foto')
  check('Variant photos are twice the variant text size',await page.locator('.w-variant-photo').first.evaluate('(x)=>{const image=parseFloat(getComputedStyle(x).width),font=parseFloat(getComputedStyle(x.parentElement.querySelector(".w-variant-name")).fontSize);return image===font*2}'))
  check('Gallery combines storefront and variant photos',await page.locator('.w-thumbnails button').count()==4 and await page.locator('.w-thumb-label').all_inner_texts()==['Foto etalase 1','Foto etalase 2','Kecil','Besar'])
  check('Main image links to original in a secure new tab',await page.locator('.w-gallery-main-link').get_attribute('href')==BASE+'/banners/1927.jpg' and await page.locator('.w-gallery-main-link').get_attribute('target')=='_blank' and await page.locator('.w-gallery-main-link').get_attribute('rel')=='noopener noreferrer')
  check('Gallery stays inline without a popup viewer',await page.locator('.w-gallery-open,.w-image-viewer').count()==0 and await page.locator('.w-thumbnails button').count()==4)
  await page.locator('.w-thumbnails button').first.click();check('Gallery thumbnail changes main image and original link inline',await page.locator('.w-gallery-main img').get_attribute('src')==BASE+'/banners/2188.jpg' and await page.locator('.w-gallery-main-link').get_attribute('href')==BASE+'/banners/2188.jpg' and await page.locator('.w-thumbnails button').first.get_attribute('aria-pressed')=='true');await page.locator('.w-thumbnails button').nth(3).click()
  check('Selected variant photo shows first and desktop description sits below the gallery',await page.locator('.w-gallery-main img').get_attribute('src')==BASE+'/banners/1927.jpg' and await page.locator('.w-detail-description').evaluate('(d)=>{const g=document.querySelector(".w-gallery").getBoundingClientRect(),r=d.getBoundingClientRect(),i=document.querySelector(".w-detail-info").getBoundingClientRect();return r.top>=g.bottom-1&&r.left<i.left}'))
  check('Description HTML is formatted safely','Deskripsi aman' in await page.locator('.w-description p').inner_text() and await page.locator('.w-description script').count()==0 and await page.locator('.w-description img[onerror]').count()==0 and not await page.evaluate('window.badDescription===true'))
  await page.locator('.w-detail').evaluate('(x)=>window.__detailNode=x');await page.locator('.w-variant-badge[data-variant-id="11"]').click();await wait_until(page,'new URLSearchParams(location.search).get("variant")=="11"');check('Variant selection updates URL, price and photo without rebuilding detail','variant=11' in page.url and '25.000' in await page.locator('[data-detail-price]').inner_text() and await page.locator('.w-gallery-main img').get_attribute('src')==BASE+'/banners/1793.jpeg' and await page.locator('.w-gallery-main-link').get_attribute('href')==BASE+'/banners/1793.jpeg' and await page.locator('.w-variant-badge[data-variant-id="11"]').get_attribute('aria-pressed')=='true' and await page.locator('.w-detail').evaluate('(x)=>x===window.__detailNode'))
  await page.locator('.w-variant-badge[data-variant-id="13"]').click();await wait_until(page,'new URLSearchParams(location.search).get("variant")=="13"');check('Variant without a photo is selectable and updates its price','variant=13' in page.url and '30.000' in await page.locator('[data-detail-price]').inner_text() and await page.locator('.w-variant-badge[data-variant-id="13"]').inner_text()=='Tanpa foto')
  check('Selected variant uses Walatra green accent',await page.locator('.w-variant-badge[data-variant-id="13"]').evaluate('(b)=>getComputedStyle(b).borderTopColor==="rgb(7, 84, 70)"'))
  check('Store offer is informational, not a user selection','Toko Dua' in await page.locator('.w-detail-store').inner_text() and await page.locator('select[name=listing]').count()==0)
  mode='nostores';await page.reload();await ready(page);check('Empty stores do not create a purchase choice',await page.locator('select[name=listing]').count()==0 and 'Belum ada penawaran' in await page.locator('main').inner_text())
  mode='normal';await page.goto(BASE+'/cat/fixture/',wait_until='networkidle');await ready(page);check('Category parent/children and direct category filter are respected',await page.get_by_role('link',name='Induk Fixture',exact=True).count()==1 and await page.locator('.w-category-card[href="/cat/anak/"]').count()==1 and any('category=fixture' in u for u in seen))
  check('Null category icons keep category names',await page.locator('.w-category-intro .w-icon-fallback').count()==1)
  category['icon_url']=BASE+'/catalog-missing-icon.png';await page.reload();await ready(page);check('Broken category icons use neutral fallback',await page.locator('.w-category-intro .w-icon-fallback').count()==1)
  category['icon_url']=BASE+'/_media/cdn/images/logo_naturalfarm.svg';await page.reload();await ready(page);check('Updated category icon appears without build',await page.locator('.w-category-intro img').get_attribute('src')==category['icon_url'])
  mode='validation';await page.goto(BASE+'/product/?min_price=10&max_price=1',wait_until='networkidle');await ready(page);check('422 validation message is visible','Maksimum harus lebih besar.' in await page.locator('main').inner_text())
  mode='rate';await page.goto(BASE+'/product/',wait_until='networkidle');await ready(page);check('429 respects cooldown',await page.locator('main button:disabled').count()>0);await page.wait_for_timeout(2100);check('Retry becomes available after Retry-After',await page.get_by_role('button',name='Coba lagi',exact=True).count()>0)
  mode='empty';await page.get_by_role('button',name='Coba lagi',exact=True).click();await ready(page);check('Retry and empty state work',await page.locator('[data-item-key]').count()==0 and 'Tidak ada hasil' in await page.locator('main').inner_text())
  mode='network';await page.reload();await ready(page);check('Network failure offers retry without archive fallback','Tidak dapat menghubungi' in await page.locator('main').inner_text() and await page.locator('[data-item-key]').count()==0)
  check('Contract scenarios have no JavaScript errors',not mock_errors);await c.close();await browser.close()
 report={'passed':all(x['passed'] for x in checks),'count':len(checks),'checks':checks,'live_api':API};(OUT/'staging-check.json').write_text(json.dumps(report,indent=2));print('BROWSER CHECKS COMPLETE',len(checks),flush=True)

if __name__=='__main__':asyncio.run(main())
