"""Cart animation checks with isolated product and cart responses."""
import asyncio, os
from playwright.async_api import async_playwright
from browser_checks import wait_until

BASE=os.environ.get('COMMERCE_TEST_URL','http://127.0.0.1:5199')

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='no-preference')
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  await page.add_init_script('''window.flights=[];
   const original=Element.prototype.animate;
   Element.prototype.animate=function(frames,options){
    if(this.classList.contains('w-cart-flying-thumbnail')){
     const target=document.querySelector(matchMedia('(max-width:767px)').matches?'[data-mobile-cart-link] svg':'.w-header-cart svg').getBoundingClientRect();
     const source=this.getBoundingClientRect();
     window.flights.push({frames,options,source:{x:source.x,y:source.y},target:{x:target.x+target.width/2,y:target.y+target.height/2},animation:null});
    }
    const animation=original.call(this,frames,options);
    if(this.classList.contains('w-cart-flying-thumbnail'))window.flights.at(-1).animation=animation;
    return animation;
   };''')
  total=0;fail=False;release=asyncio.Event()
  async def auth(route):
   nonlocal total
   path=route.request.url
   if path.endswith('/me'):data={'user':{'id':1,'name':'Penguji'}}
   elif '/cart/items' in path:
    await release.wait()
    if fail:
     await route.fulfill(status=422,json={'success':False,'message':'Stok tidak cukup'});return
    total+=1;data={'total_items':total,'items':[]}
   else:data={'total_items':total,'items':[]}
   await route.fulfill(json={'success':True,'data':data})
  async def catalog(route):
   data=[]
   if '/catalog/products/fixture' in route.request.url:
    data={'id':5,'name':'Produk Fixture','slug':'fixture','categories':[],
          'variants':[{'id':11,'name':'Botol','price':'25000','image_url':None,'weight_grams':0,
                       'attributes':{'volume':'120 ml','price_source':'internal','shipping_weight_status':'unknown','shipping_weight_estimated':False}}],
          'stores':[{'listing_id':7,'store':{'name':'Toko Fixture'},'description':'Produk pengujian',
                     'images':[{'id':21,'order':1,'url':BASE+'/animation-product.svg'}]}]}
   await route.fulfill(json={'success':True,'data':data})
  await page.route('**/auth/session/**',auth)
  await page.route('**/api/v1/**',catalog)
  await page.route('**/animation-product.svg',lambda route:route.fulfill(content_type='image/svg+xml',body='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#075446"/></svg>'))
  async def visit():
   await page.goto(BASE+'/product/fixture/?listing=7&variant=11')
   await page.get_by_role('button',name='Tambah ke Keranjang',exact=True).wait_for()
   await wait_until(page,'document.querySelector(".w-gallery-main img")?.naturalWidth>0')
   metadata=await page.locator('.w-detail-meta').all_text_contents()
   assert 'Berat belum tersedia' in metadata and 'Volume: 120 ml' in metadata
   assert not any('price_source' in text or 'shipping_weight' in text or '0 gram' in text for text in metadata)
  async def dismiss():
   await page.get_by_role('button',name='OK',exact=True).click()
   await page.get_by_role('dialog').wait_for(state='hidden')
  for mobile in [False,True]:
   await page.set_viewport_size({'width':390 if mobile else 1440,'height':844 if mobile else 1000})
   await visit();release.clear()
   button=page.locator('.w-add-cart-button')
   await button.click()
   assert await button.is_disabled()
   assert await page.evaluate('flights.length')==0
   release.set()
   await page.locator('.w-cart-flying-thumbnail').wait_for()
   assert await page.locator('.w-cart-flying-thumbnail').get_attribute('aria-hidden')=='true'
   await page.get_by_role('dialog').wait_for()
   assert await page.locator('.w-cart-flying-thumbnail').count()==0
   assert await page.evaluate('''()=>{
    const flight=flights[0],end=new DOMMatrix(flight.frames.at(-1).transform);
    return flight.options.duration===550 && Math.abs(flight.source.x+32+end.m41-flight.target.x)<1
     && Math.abs(flight.source.y+32+end.m42-flight.target.y)<1;
   }''')
   badge=page.locator('[data-mobile-cart-link] [data-cart-count]' if mobile else '.w-header-cart [data-cart-count]')
   assert await badge.inner_text()==str(total)
   assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
   await dismiss()
   print('PASS', 'mobile' if mobile else 'desktop','server success, thumbnail destination, badge and cleanup',flush=True)
  await page.emulate_media(reduced_motion='reduce');await visit()
  await page.get_by_role('button',name='Tambah ke Keranjang',exact=True).click()
  await page.get_by_role('dialog').wait_for()
  assert await page.evaluate('flights.length')==0
  await dismiss();print('PASS reduced motion confirms addition without flight',flush=True)
  fail=True;await page.emulate_media(reduced_motion='no-preference');await visit()
  await page.get_by_role('button',name='Tambah ke Keranjang',exact=True).click()
  await page.get_by_role('dialog').wait_for()
  assert await page.evaluate('flights.length')==0
  assert 'Stok tidak cukup' in await page.get_by_role('dialog').inner_text()
  await dismiss();print('PASS rejected cart addition never animates',flush=True)
  fail=False;await visit()
  await page.get_by_role('button',name='Tambah ke Keranjang',exact=True).click()
  await page.locator('.w-cart-flying-thumbnail').wait_for()
  await page.set_viewport_size({'width':420,'height':844})
  await page.get_by_role('dialog').wait_for()
  assert await page.locator('.w-cart-flying-thumbnail').count()==0
  assert not errors,errors
  print('PASS resize cancels flight cleanly; no browser runtime errors',flush=True)
  await browser.close()

asyncio.run(main())
