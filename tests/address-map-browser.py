"""Address point picker checks with isolated API, geolocation and tile responses."""
import asyncio,base64,os
from urllib.parse import urlsplit
from playwright.async_api import async_playwright
from browser_checks import wait_until

BASE=os.environ.get('CATALOG_TEST_URL','http://127.0.0.1:5173')
PNG=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mNgAAIAAAUAAaX2RUAAAAAASUVORK5CYII=')

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  context=await browser.new_context(viewport={'width':1280,'height':960},reduced_motion='reduce')
  await context.add_init_script('''window.geoCalls=0;window.geoDenied=false;
    navigator.geolocation.getCurrentPosition=(ok,fail)=>{window.geoCalls++;window.geoDenied?fail({code:1}):ok({coords:{latitude:-7.3274,longitude:108.2207}});};''')
  page=await context.new_page()
  page.set_default_timeout(8000)
  errors=[];page.on('pageerror',lambda error:errors.append(str(error)))
  addresses=[];saved=[];fail_tiles=False
  async def tiles(route):
   if fail_tiles:await route.abort('failed')
   else:await route.fulfill(content_type='image/png',body=PNG,headers={'Cache-Control':'no-store'})
  await context.route('https://tile.openstreetmap.org/**',tiles)
  async def api(route):
   request=route.request;path=urlsplit(request.url).path;data=[]
   if path.endswith('/me'):data={'user':{'id':1,'name':'Penguji','phone':'628123456789'}}
   elif path.endswith('/cart'):data={'items':[{'id':301,'type':'product','is_available':True,'product':{'name':'Madu','slug':'madu'},'quantity':1,'unit_price':95000,'subtotal':95000}],'total_items':1}
   elif path.endswith('/payment-methods'):data=[{'code':'qris','name':'QRIS'}]
   elif path.endswith('/checkout/preview'):data={'items':[],'subtotal':95000,'shipping':{'fee':8000},'total':103000,'checkout_token':'test','checkout_available':True}
   elif '/addresses' in path:
    if request.method in ['POST','PATCH']:
     body=request.post_data_json;saved.append(body);data=dict(addresses[0] if request.method=='PATCH' else {},**body,id=401)
     addresses[:]=[data]
    else:data=addresses
   elif '/shipping/locations/' in path:
    level=path.rsplit('/',1)[-1]
    keys={'provinces':('province_id','province_name','Jawa Barat'),'cities':('city_id','city_name','Tasikmalaya'),'districts':('district_id','district_name','Tawang'),'sub-districts':('sub_district_id','sub_district_name','Tawangsari')}
    id_key,name_key,name=keys[level]
    data={'locations':[{id_key:level,name_key:name,'postal_code':'46112'}]}
   await route.fulfill(json={'success':True,'data':data})
  await context.route('**/auth/session/**',api)
  await context.route('**/api/v1/**',api)
  async def ready_map():
   await page.locator('.w-address-map .leaflet-container').wait_for()
   await wait_until(page,'!document.querySelector(".w-address-map-actions button:nth-child(2)").disabled')
  async def dismiss():
   await page.locator('.swal2-confirm').click()
   await page.get_by_role('dialog').wait_for(state='hidden')
  async def fill_address():
   await page.get_by_label('Label alamat',exact=True).fill('Rumah')
   for label,value in [('Provinsi','provinces'),('Kota/kabupaten','cities'),('Kecamatan','districts'),('Kelurahan/desa','sub-districts')]:
    await page.get_by_label(label,exact=True).select_option(value)
   await page.get_by_label('Alamat lengkap',exact=True).fill('Jalan Pengujian 1')
  async def edit():
   await page.get_by_role('button',name='Ubah',exact=True).click();await ready_map()
  await page.goto(BASE+'/profile/addresses/')
  await page.get_by_role('button',name='Tambah alamat',exact=True).first.click();await ready_map()
  assert await page.locator('.w-address-map-pin').count()==0
  assert await page.get_by_label('Latitude',exact=True).input_value()==''
  assert await page.evaluate('geoCalls')==0
  await fill_address()
  await page.get_by_role('button',name='Gunakan lokasi saya',exact=True).click()
  assert await page.get_by_label('Latitude',exact=True).input_value()=='-7.327400'
  assert await page.get_by_label('Longitude',exact=True).input_value()=='108.220700'
  pin=page.locator('.w-address-map-pin');box=await pin.bounding_box()
  before=await page.get_by_label('Longitude',exact=True).input_value()
  await page.mouse.move(box['x']+16,box['y']+15);await page.mouse.down();await page.mouse.move(box['x']+66,box['y']+35,steps=8);await page.mouse.up()
  assert await page.get_by_label('Longitude',exact=True).input_value()!=before
  canvas=page.locator('.w-address-map-canvas');box=await canvas.bounding_box()
  await page.mouse.click(box['x']+box['width']*.6,box['y']+box['height']*.55)
  chosen=(float(await page.get_by_label('Latitude',exact=True).input_value()),float(await page.get_by_label('Longitude',exact=True).input_value()))
  await page.get_by_role('button',name='Simpan alamat',exact=True).click()
  await page.get_by_role('dialog').wait_for()
  assert saved[-1]['latitude']==chosen[0] and saved[-1]['longitude']==chosen[1]
  await dismiss();await edit()
  assert float(await page.get_by_label('Latitude',exact=True).input_value())==chosen[0]
  await page.get_by_label('Longitude',exact=True).fill('')
  await page.get_by_role('button',name='Simpan perubahan',exact=True).click()
  await page.get_by_role('dialog').wait_for()
  assert 'Titik pengiriman belum valid' in await page.get_by_role('dialog').inner_text()
  assert len(saved)==1
  await dismiss()
  await page.get_by_role('button',name='Hapus titik',exact=True).click()
  assert await page.locator('.w-address-map-pin').count()==0
  await page.get_by_role('button',name='Simpan perubahan',exact=True).click()
  await page.get_by_role('dialog').wait_for()
  assert saved[-1]['latitude'] is None and saved[-1]['longitude'] is None
  await dismiss();await edit()
  assert await page.locator('.w-address-map-pin').count()==0
  print('PASS click, drag, geolocation, POST/PATCH persistence, restored point, partial coordinate validation and clearing',flush=True)
  await page.evaluate('window.geoDenied=true')
  await page.get_by_role('button',name='Gunakan lokasi saya',exact=True).click()
  await page.get_by_role('dialog').wait_for()
  assert 'Izin lokasi ditolak' in await page.get_by_role('dialog').inner_text()
  await dismiss()
  await canvas.focus();await page.keyboard.press('ArrowRight')
  await page.get_by_role('button',name='Pilih titik di tengah peta',exact=True).click()
  assert await page.get_by_label('Latitude',exact=True).input_value()!=''
  await page.screenshot(path='/tmp/address-map-desktop.png',full_page=True)
  await page.set_viewport_size({'width':390,'height':844})
  await canvas.scroll_into_view_if_needed()
  await page.screenshot(path='/tmp/address-map-mobile.png',full_page=True)
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert await page.locator('.w-mobile-bottom-nav').is_visible()
  await page.set_viewport_size({'width':800,'height':1000})
  assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert not await page.locator('.w-mobile-bottom-nav').is_visible()
  await page.get_by_role('button',name='Batal',exact=True).click()
  assert await page.locator('.leaflet-container').count()==0
  print('PASS location denial popup, keyboard selection, desktop/mobile/tablet layout and form cleanup',flush=True)
  fail_tiles=True
  await page.reload()
  await edit()
  await page.get_by_role('dialog').wait_for()
  assert 'Gambar peta belum dapat dimuat' in await page.get_by_role('dialog').inner_text()
  await dismiss();fail_tiles=False
  await page.get_by_role('button',name='Coba muat peta lagi',exact=True).click()
  await wait_until(page,'document.querySelector(".w-address-map-status").textContent.startsWith("Titik belum")')
  assert await page.get_by_role('button',name='Coba muat peta lagi',exact=True).is_hidden()
  await page.get_by_role('button',name='Batal',exact=True).click()
  assert not errors,errors
  print('PASS tile failure SweetAlert2, tile retry and no browser errors',flush=True)
  await context.route('https://www.openstreetmap.org/export/**',lambda route:route.fulfill(content_type='text/html',body='<p>Map preview fixture</p>'))
  await page.goto(BASE+'/checkout/?cart_item_ids[]=301')
  await wait_until(page,'document.querySelector(".w-checkout-status")?.textContent==="Pesanan diperbarui."')
  assert await page.locator('.w-checkout-map').count()==0
  assert 'Titik peta belum disimpan' in await page.locator('.w-checkout-addresses').inner_text()
  addresses[0].update(latitude=chosen[0],longitude=chosen[1])
  await page.reload()
  await wait_until(page,'document.querySelector(".w-checkout-status")?.textContent==="Pesanan diperbarui."')
  assert await page.locator('.w-checkout-map').count()==1
  assert f'marker={chosen[0]}%2C{chosen[1]}' in await page.locator('.w-checkout-map').get_attribute('src')
  print('PASS checkout hides missing coordinates and displays the saved destination',flush=True)
  module_requests=0
  async def leaflet_module(route):
   nonlocal module_requests
   module_requests+=1
   if module_requests==1:await route.abort('failed')
   else:await route.continue_()
  await context.route('**/vendor/leaflet/leaflet-src.esm.js*',leaflet_module)
  await page.goto(BASE+'/profile/addresses/')
  await page.get_by_role('button',name='Ubah',exact=True).click()
  await page.get_by_role('dialog').wait_for()
  assert 'Peta belum dapat dimuat' in await page.get_by_role('dialog').inner_text()
  await dismiss()
  assert await page.get_by_label('Latitude',exact=True).is_enabled()
  await page.get_by_role('button',name='Coba muat peta lagi',exact=True).click()
  await ready_map()
  assert module_requests>=2
  print('PASS map library load failure, manual input fallback and retry',flush=True)
  assert not errors,errors
  await browser.close()

asyncio.run(main())
