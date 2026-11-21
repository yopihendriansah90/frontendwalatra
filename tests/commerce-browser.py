"""Isolated commerce UI scenarios; no customer writes or provider charges."""
import asyncio, copy, json, os
from pathlib import Path
from urllib.parse import urlsplit, parse_qs
from playwright.async_api import async_playwright
from browser_checks import wait_until

BASE=os.environ.get('COMMERCE_TEST_URL','http://127.0.0.1:5199')
OUT=Path('/tmp/walatra-commerce-evidence');OUT.mkdir(exist_ok=True)

async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(headless=True)
  page=await browser.new_page(viewport={'width':1440,'height':1000},reduced_motion='reduce')
  page.set_default_timeout(10000)
  await page.clock.install()
  errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
  items=[{'id':301,'type':'product','is_available':True,'product':{'name':'Madu Herbal','slug':'madu'},'variant':{'name':'Botol'},'store':{'id':1,'name':'Toko Utama'},'quantity':2,'unit_price':'15000.00','subtotal':'30000.00'},
         {'id':302,'type':'bundle','is_available':True,'bundle':{'name':'Paket Herbal','items':[{'product':{'name':'Madu'},'variant':{'name':'Botol'},'quantity':2}]},'store':{'id':2,'name':'Toko Kedua'},'quantity':1,'unit_price':'40000.00','subtotal':'40000.00'},
         {'id':303,'type':'product','is_available':False,'availability_message':'Tidak tersedia','product':None,'store':None,'quantity':1,'unit_price':'10000.00','subtotal':'10000.00'}]
  addresses=[{'id':401,'label':'Rumah','name':'Penerima','phone':'08123456789','address':'Jalan Herbal 1','city':'Bandung','is_default':True},{'id':402,'label':'Kantor','name':'Penerima','address':'Jalan Herbal 2','is_default':False}]
  order={'id':501,'order_number':'WAL-TEST-501','status':'pending_payment','payment_provider':'midtrans','payment_required':True,'payment_due_at':'2099-01-01T00:00:00Z','payment':None,'items':[{'product_name':'Madu Herbal','quantity':3,'unit_price':'16000.00','subtotal':'48000.00'}],'subtotal':'48000.00','shipping_fee':'0.00','total':'48000.00','shipping_address':addresses[0]}
  calls=[];preview_count=0;order_count=0;pay_count=0;slow_preview_done=asyncio.Event()
  async def api(route):
   nonlocal preview_count,order_count,pay_count,items
   request=route.request;url=urlsplit(request.url);path=url.path;method=request.method
   body=request.post_data_json if request.post_data else None
   calls.append({'path':path,'query':parse_qs(url.query),'method':method,'body':body,'key':request.headers.get('idempotency-key')})
   status=200;result={'success':True,'data':None}
   if path=='/auth/session/me':result['data']={'user':{'id':9,'name':'Tester','phone':'08123'}}
   elif path=='/auth/session/addresses':result['data']=addresses
   elif path=='/auth/session/cart':
    if method=='DELETE':items=[]
    selected=[int(i) for i in parse_qs(url.query).get('cart_item_ids[]',[])]
    available=[i for i in items if i['id'] in selected and i['is_available']]
    result['data']={'items':copy.deepcopy(items),'total_items':sum(i['quantity'] for i in items),'subtotal':str(sum(float(i['subtotal']) for i in items)),
                    'selection':{'cart_item_ids':selected,'line_count':len(available),'total_items':sum(i['quantity'] for i in available),'subtotal':str(sum(float(i['subtotal']) for i in available)),'unavailable_item_ids':[]}}
   elif path.startswith('/auth/session/cart/items/'):
    ident=int(path.split('/')[-1]);item=next(i for i in items if i['id']==ident)
    if method=='DELETE':items=[i for i in items if i['id']!=ident]
    else:
     await asyncio.sleep(.2);item['quantity']=min(body['quantity'],3);item['subtotal']=str(float(item['unit_price'])*item['quantity']);result['data']={'items':items,'total_items':sum(i['quantity'] for i in items)}
   elif path=='/auth/session/checkout/preview':
    preview_count+=1
    request_number=preview_count
    await asyncio.sleep(.4 if body.get('address_id')==402 else .05)
    selected=[i for i in items if i['id'] in body['cart_item_ids']]
    reviewed=[{'cart_item_id':i['id'],'quantity':i['quantity'],'unit_price':'16000.00' if i['type']=='product' else i['unit_price'],'subtotal':str(i['quantity']*(16000 if i['type']=='product' else float(i['unit_price'])))} for i in selected]
    total=str(sum(float(i['subtotal']) for i in reviewed))
    result['data']={'checkout_token':'preview-'+str(request_number),'checkout_available':True,'price_changed':True,'stock_verification':'pending_manual','items':reviewed,'subtotal':total,'shipping':{'fee':'5000.00' if body.get('address_id')==402 else '0.00'} if body.get('address_id') else None,'total':str(float(total)+5000) if body.get('address_id')==402 else total if body.get('address_id') else None,'shipping_origin':{'warehouse_code':'WH-TASIK','warehouse_name':'TASIKMALAYA','address':'Gudang Herbal Tamansari','postal_code':'46196','latitude':-7.3660108,'longitude':108.2280630,'distance_km':6.321,'candidates':[{'warehouse_name':'GUDANG LAIN','latitude':-6.2,'longitude':107.1}]} if body.get('address_id') else None}
   elif path=='/auth/session/orders' and method=='POST':
    order_count+=1
    if order_count==1:status=409;result={'success':False,'message':'Harga berubah lagi','code':'CHECKOUT_CHANGED'}
    elif order_count==2:status=502;result={'success':False,'message':'Waktu respons habis'}
    else:result['data']=copy.deepcopy(order);items=[i for i in items if i['id']!=301]
   elif path=='/auth/session/orders':result['data']=[copy.deepcopy(order)];result['meta']={'current_page':1,'last_page':2}
   elif path=='/auth/session/orders/501':result['data']=copy.deepcopy(order)
   elif path=='/auth/session/payment-methods':result['data']=[{'code':'bca_va','name':'BCA Virtual Account'},{'code':'qris','name':'QRIS'}]
   elif path=='/auth/session/orders/501/payment' and method=='GET':result['data']={'order_status':order['status'],'payment':copy.deepcopy(order['payment'])}
   elif path=='/auth/session/orders/501/payment':
    pay_count+=1
    if pay_count==1:status=202;result={'success':False,'code':'PAYMENT_PROCESSING','data':None}
    else:
     order['payment']={'id':7,'method':body['method'],'state':'pending','amount':'48000.00','expires_at':'2099-01-01T00:00:00Z','bank':'bca','va_number':'123456789','qr_code_url':'https://backend.test/qr'}
     result['data']={'payment':copy.deepcopy(order['payment'])}
   elif path.endswith('/qr-code'):
    await route.fulfill(status=200,content_type='image/png',body=bytes.fromhex('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000b49444154789c636000020000050001a5f645400000000049454e44ae426082'));return
   elif path.endswith('/payment/refresh'):order['status']='paid';order['payment_required']=False;order['payment']['state']='paid';result['data']={'payment':copy.deepcopy(order['payment'])}
   elif path.endswith('/cancel'):order['status']='cancelled';order['payment_required']=False;result['data']=copy.deepcopy(order)
   else:status=404;result={'success':False,'message':'Unexpected mock route '+path}
   await route.fulfill(status=status,content_type='application/json',body=json.dumps(result))
   if path=='/auth/session/checkout/preview' and body.get('address_id')==402:slow_preview_done.set()
  await page.route('**/auth/session/**',api)
  catalog_calls=[]
  catalog_failure=False
  async def catalog(route):
   url=urlsplit(route.request.url);catalog_calls.append(url)
   if '/catalog' in url.path and catalog_failure:
    await route.fulfill(status=503,json={'success':False,'message':'Katalog sementara tidak tersedia'});return
   data=[]
   if url.path.endswith('/catalog'):
    data=[{'id':10,'type':'product','listing_id':101,'slug':'madu','name':'Madu Herbal','price':{'min':'16000'}},
          *[{'id':n,'type':'product','listing_id':n+100,'slug':f'herbal-{n}','name':f'Produk Herbal {n}','price':{'min':'25000','max':'30000'}} for n in range(11,16)]]
   elif url.path.endswith('/catalog/products/madu'):data={'id':10,'categories':[{'slug':'herbal'}]}
   await route.fulfill(json={'success':True,'data':data})
  await page.route('**/api/v1/**',catalog)
  async def ready():
   await wait_until(page,'!document.querySelector("#site-main[aria-busy=true]") && !document.querySelector(".w-commerce-page[aria-busy=true]")')
   for _ in range(5):
    if not await page.locator('.swal2-confirm').is_visible() or await page.locator('.swal2-cancel').is_visible():break
    await page.locator('.swal2-confirm').click()
    await asyncio.sleep(.05)
  async def visit(path):await page.goto(BASE+path);await ready()
  async def check(label,condition):
   assert condition,label
   print('PASS',label,flush=True)
  await visit('/cart/')
  await check('Cart groups stores and unavailable items remain removable',await page.locator('.w-cart-store-group').count()==3 and await page.locator('[data-cart-item-id="303"] input[type=checkbox]').is_disabled())
  await check('Unavailable quantity is disabled',await page.locator('[data-cart-item-id="303"] input[type=number]').is_disabled())
  await check('Available items are selected and summarized on first load',await page.get_by_label('Pilih semua barang tersedia',exact=True).is_checked() and '70.000' in await page.locator('.w-cart-summary').inner_text() and not await page.get_by_role('button',name='Lanjut checkout').is_disabled())
  await page.get_by_label('Pilih semua barang tersedia',exact=True).uncheck();await ready()
  await check('Empty selection disables checkout',await page.get_by_role('button',name='Lanjut checkout').is_disabled())
  await page.get_by_label('Tambah Madu Herbal',exact=True).click();await ready()
  await check('Quantity changes preserve intentionally empty selection',not await page.get_by_label('Pilih semua barang tersedia',exact=True).is_checked() and await page.get_by_role('button',name='Lanjut checkout').is_disabled())
  await page.get_by_label('Kurangi Madu Herbal',exact=True).click();await ready()
  await page.get_by_label('Pilih semua barang tersedia',exact=True).check();await ready()
  await check('Server selection total excludes unavailable item','70.000' in await page.locator('.w-cart-summary').inner_text())
  await page.locator('.w-cart-store-heading label').filter(has_text='Toko Kedua').locator('input').uncheck();await ready()
  await page.get_by_label('Tambah Madu Herbal',exact=True).click()
  await check('Quantity controls block concurrent writes',await page.get_by_label('Tambah Madu Herbal',exact=True).is_disabled());await ready()
  await check('Quantity follows backend response',await page.get_by_label('Jumlah Madu Herbal',exact=True).input_value()=='3')
  await page.screenshot(path=str(OUT/'cart-desktop.png'),full_page=True)
  await page.get_by_role('button',name='Lanjut checkout').click();await ready()
  await check('Checkout previews selected IDs and shows price change',calls[-1]['body']['cart_item_ids']==[301] and await page.get_by_text('Harga barang berubah.',exact=False).count()==1)
  await check('Initial checkout preview includes selected address',calls[-1]['body']['address_id']==401)
  await check('Desktop checkout uses two columns and an inline order action',await page.evaluate('''()=>{
   const main=document.querySelector('.w-checkout-main').getBoundingClientRect(),summary=document.querySelector('.w-checkout-summary').getBoundingClientRect();
   return summary.left>=main.right && getComputedStyle(document.querySelector('.w-checkout-action')).position!=='fixed';
  }'''))
  await page.screenshot(path=str(OUT/'checkout-desktop.png'),full_page=True)
  await page.get_by_role('button',name='Buat pesanan & bayar',exact=True).click();await ready()
  await check('Changed checkout invalidates preview',await page.get_by_role('button',name='Buat pesanan & bayar',exact=True).is_disabled())
  await page.get_by_role('button',name='Hitung ulang').click();await ready()
  await page.get_by_role('button',name='Buat pesanan & bayar',exact=True).click();await ready()
  await check('Unknown order creation locks address',await page.locator('#w-checkout-address-401').is_disabled())
  await page.reload();await ready()
  await page.get_by_role('button',name='Coba lagi pesanan yang sama').click();await page.wait_for_url('**/orders/501/');await ready()
  posts=[c for c in calls if c['path']=='/auth/session/orders' and c['method']=='POST']
  await check('Reload retry preserves order key and original payload',posts[1]['key']==posts[2]['key'] and posts[1]['body']==posts[2]['body'] and posts[0]['key']!=posts[1]['key'])
  await check('202 processing keeps recovery without inventing instructions',await page.get_by_role('button',name='Pulihkan pembayaran yang sama').is_visible() and await page.get_by_text('123456789',exact=True).count()==0)
  await page.reload();await ready()
  await page.get_by_role('button',name='Pulihkan pembayaran yang sama').click();await ready()
  payments=[c for c in calls if c['path']=='/auth/session/orders/501/payment' and c['method']=='POST']
  await check('Payment recovery retains key across reload',payments[0]['key']==payments[1]['key'] and payments[0]['key']!=posts[2]['key'])
  await check('VA instructions come from API',await page.get_by_text('123456789',exact=True).count()==1)
  await page.locator('.w-order-related-card').first.wait_for()
  await check('Recommendations exclude purchased products and cap at four',await page.locator('.w-order-related-card').count()==4 and 'Madu Herbal' not in await page.locator('.w-order-related-list').inner_text())
  await check('Desktop recommendations sit right of constrained order details',await page.evaluate('''()=>{
   const sidebar=document.querySelector('.w-order-related').getBoundingClientRect(),main=document.querySelector('.w-order-main').getBoundingClientRect();
   return sidebar.left>=main.right && main.width<850 && document.documentElement.scrollWidth<=innerWidth;
  }'''))
  await check('Recommendation links target real catalog detail routes',(await page.get_by_role('link',name='Lihat produk',exact=True).first.get_attribute('href'))=='/product/herbal-11/?listing=111')
  await check('Payment pending status is localized','Menunggu pembayaran' in await page.locator('.w-order-payment').inner_text())
  await page.evaluate('scrollTo(0,0)')
  await page.screenshot(path=str(OUT/'order-desktop.png'),full_page=True)
  await page.get_by_role('button',name='Ganti metode pembayaran',exact=True).click();await ready()
  await page.locator('input[name=w-order-payment-method][value=qris]').check()
  await page.get_by_role('button',name='Gunakan metode ini').click();await ready()
  payments=[c for c in calls if c['path']=='/auth/session/orders/501/payment' and c['method']=='POST']
  await check('Changing method uses a new payment key',payments[-1]['key']!=payments[-2]['key'])
  await page.get_by_alt_text('Kode QRIS pembayaran pesanan').wait_for()
  await check('QRIS uses authenticated bridge and blob image',(await page.get_by_alt_text('Kode QRIS pembayaran pesanan').get_attribute('src')).startswith('blob:') and any(c['path'].endswith('/qr-code') for c in calls))
  async with page.expect_download() as download_event:
   await page.get_by_role('link',name='Download QR',exact=True).click()
  download=await download_event.value
  await check('QR download saves the authenticated image with order filename',download.suggested_filename=='QRIS-WAL-TEST-501.png' and await download.failure() is None)
  qr_src=await page.get_by_alt_text('Kode QRIS pembayaran pesanan').get_attribute('src')
  reads=sum(c['path']=='/auth/session/orders/501' for c in calls)
  await page.clock.fast_forward(15001)
  await wait_until(page,'document.querySelector(".w-payment-qr img") !== null')
  await check('Background status reads preserve QRIS display',await page.get_by_alt_text('Kode QRIS pembayaran pesanan').get_attribute('src')==qr_src and sum(c['path']=='/auth/session/orders/501' for c in calls)>reads)
  await page.get_by_role('button',name='Refresh',exact=True).click();await ready()
  await page.get_by_role('button',name='Cek Status',exact=True).click();await ready()
  await check('Verified paid order hides payment creation',await page.get_by_text('Sudah dibayar',exact=True).count()>=1 and await page.get_by_label('Metode pembayaran',exact=True).count()==0)
  await page.get_by_role('link',name='Semua pesanan',exact=True).click();await ready()
  await page.get_by_role('button',name='Berikutnya',exact=True).click();await ready()
  await check('Order pagination passes page parameter',any(c['path']=='/auth/session/orders' and c['query'].get('page')==['2'] for c in calls))
  order['status']='pending_payment';order['payment_required']=True
  await visit('/orders/501/');await page.get_by_role('button',name='Batalkan pesanan',exact=True).click();await page.get_by_role('button',name='Ya, lanjutkan',exact=True).click();await ready()
  await check('Cancellation reads authoritative order status',await page.get_by_text('Dibatalkan',exact=True).count()==1)
  order['payment_provider']='manual';order['status']='pending_payment';order['payment_required']=True;order['payment_instructions']='Hubungi admin untuk konfirmasi.';order['payment']=None
  await visit('/orders/501/');await check('Manual orders show admin instructions',await page.get_by_text('Hubungi admin untuk konfirmasi.',exact=True).count()==1 and await page.get_by_label('Metode pembayaran',exact=True).count()==0)
  order['payment_provider']='simulation';order['status']='paid';order['simulation']=True
  await visit('/orders/501/');await check('Simulation is explicitly labelled',await page.get_by_text('Pesanan simulasi.',exact=False).count()==1)
  await page.set_viewport_size({'width':390,'height':844});await visit('/cart/')
  await check('Mobile navigation shown and footer hidden',await page.locator('.w-mobile-bottom-nav').is_visible() and not await page.locator('#site-footer').is_visible())
  await check('Mobile cart has no horizontal overflow',await page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
  await page.locator('.w-mobile-toggle').click();await page.locator('.w-mobile-drawer.is-open').wait_for(state='visible');await check('Hamburger opens mobile drawer',await page.locator('.w-mobile-drawer').is_visible());await page.keyboard.press('Escape')
  await page.screenshot(path=str(OUT/'cart-mobile.png'),full_page=True)
  addresses[0]['is_default']=False
  await visit('/checkout/?cart_item_ids[]=302')
  await check('Mobile checkout fits viewport',await page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
  await check('Checkout without address automatically checks items and subtotal','address_id' not in calls[-1]['body'] and '40.000' in await page.locator('.w-commerce-page').inner_text() and await page.get_by_text('Pilih alamat pengiriman',exact=True).count()>=2 and await page.get_by_role('button',name='Buat pesanan & bayar',exact=True).is_disabled())
  await page.locator('#w-checkout-address-402').check()
  await check('Preview shows updating status and blocks order but allows address change',await page.get_by_text('Memperbarui pesanan…',exact=True).is_visible() and await page.get_by_role('button',name='Buat pesanan & bayar',exact=True).is_disabled() and await page.locator('#w-checkout-address-401').is_enabled())
  await page.locator('#w-checkout-address-401').check()
  await ready();await asyncio.wait_for(slow_preview_done.wait(),timeout=5)
  await check('Slower previous address cannot overwrite newest totals',await page.locator('#w-checkout-address-401').is_checked() and '45.000' not in await page.locator('.w-commerce-page').inner_text() and not await page.get_by_role('button',name='Buat pesanan & bayar',exact=True).is_disabled())
  origin_text=await page.locator('.w-checkout-origin').inner_text()
  await check('Checkout shows only the selected warehouse and its distance','TASIKMALAYA' in origin_text and 'Gudang Herbal Tamansari' in origin_text and '6,321 km' in origin_text and 'GUDANG LAIN' not in origin_text and 'null' not in origin_text)
  latest_token='preview-'+str(preview_count)
  await page.get_by_role('button',name='Buat pesanan & bayar',exact=True).click();await page.wait_for_url('**/orders/501/');await ready()
  latest_order=next(c for c in reversed(calls) if c['path']=='/auth/session/orders' and c['method']=='POST')
  await check('Order sends token from newest address preview',latest_order['body']['address_id']==401 and latest_order['body']['checkout_token']==latest_token)
  await visit('/checkout/?cart_item_ids[]=302');await page.locator('#w-checkout-address-401').check();await ready()
  await check('Mobile order action clears navigation and matches the preview total',await page.evaluate('''()=>{
   const action=document.querySelector('.w-checkout-action'),nav=document.querySelector('.w-mobile-bottom-nav');
   return getComputedStyle(action).position==='fixed' && action.getBoundingClientRect().bottom<=nav.getBoundingClientRect().top+1
    && document.querySelector('.w-checkout-action-total strong').textContent===document.querySelector('.w-checkout-totals .w-cart-summary-line:last-child strong').textContent;
  }'''))
  await page.screenshot(path=str(OUT/'checkout-mobile.png'),full_page=True)
  await page.clock.fast_forward(900001);await ready()
  await check('Expired preview disables order submission',await page.get_by_role('button',name='Buat pesanan & bayar',exact=True).is_disabled())
  order['payment_provider']='midtrans';order['status']='pending_payment';order['payment_required']=True;order['simulation']=False
  await visit('/orders/501/')
  await check('Mobile payment fits viewport',await page.evaluate('document.documentElement.scrollWidth <= innerWidth'))
  await page.locator('.w-order-related-card').first.wait_for()
  await check('Mobile recommendations follow payment and scroll inside their row',await page.evaluate('''()=>{
   const related=document.querySelector('.w-order-related'),main=document.querySelector('.w-order-main'),list=document.querySelector('.w-order-related-list');
   return related.getBoundingClientRect().top>=main.getBoundingClientRect().bottom && list.scrollWidth>list.clientWidth && getComputedStyle(list).overflowX==='auto';
  }'''))
  await page.screenshot(path=str(OUT/'order-mobile.png'),full_page=True)
  await page.screenshot(path=str(OUT/'payment-mobile.png'),full_page=True)
  await page.get_by_role('button',name='Cek Status',exact=True).focus()
  await check('Payment control supports keyboard focus',await page.get_by_role('button',name='Cek Status',exact=True).evaluate('(el)=>el===document.activeElement'))
  await visit('/cart/')
  await page.get_by_role('button',name='Hapus',exact=True).first.click();await page.get_by_role('button',name='Ya, lanjutkan',exact=True).click();await ready()
  await check('Unavailable item can be removed',len(items)==1)
  await page.get_by_role('button',name='Kosongkan cart',exact=True).click();await page.get_by_role('button',name='Ya, lanjutkan',exact=True).click();await ready()
  await check('Clear cart shows empty state',await page.get_by_text('Keranjang masih kosong',exact=True).count()==1)
  await page.set_viewport_size({'width':1440,'height':1000});await visit('/cart/')
  await check('Desktop excludes mobile navigation',not await page.locator('.w-mobile-bottom-nav').is_visible())
  order['items'][0]['product_slug']='madu'
  await visit('/orders/501/');await page.get_by_role('heading',name='Produk terkait',exact=True).wait_for()
  await check('Recommendations use purchased product category',any(parse_qs(url.query).get('category')==['herbal'] for url in catalog_calls))
  catalog_failure=True
  await visit('/orders/501/');await page.locator('.w-order-related-status').get_by_role('button',name='Coba lagi',exact=True).wait_for()
  await check('Catalog failure leaves order payment available',await page.locator('.w-order-payment').is_visible())
  catalog_failure=False
  await page.locator('.w-order-related-status').get_by_role('button',name='Coba lagi',exact=True).click()
  await page.locator('.w-order-related-card').first.wait_for()
  await check('Recommendation retry recovers without reloading order',await page.locator('.w-order-related-card').count()==4)
  await check('No browser runtime errors',not errors)
  (OUT/'results.json').write_text(json.dumps({'errors':errors,'request_count':len(calls),'result':'passed'},indent=2))
  await browser.close()

asyncio.run(main())
