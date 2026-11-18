import {currentUser,getCart,updateCartItem,deleteCartItem,clearCart,listAddresses,previewCheckout,createOrder,listOrders,getOrder,getOrderPayment,cancelOrder,paymentMethods,createPayment,refreshPayment,paymentQR} from './auth-client.js';
import {coordinates} from './coordinates.js';
import {request} from './api.js';
import {detailURL,itemPrice} from './model.js';

export function commerce({el,link,money,main,go,setCartData,cartImage,confirm,notify}){
  let dispose=()=>{};
  const reset=()=>{dispose();dispose=()=>{};};
  const name=item=>item.product_name||(item.type==='bundle'?item.bundle?.name:item.product?.name)||'Item tidak tersedia';
  const statuses={pending_payment:'Menunggu pembayaran',paid:'Sudah dibayar',cancelled:'Dibatalkan',expired:'Kedaluwarsa',payment_review:'Pembayaran diperiksa admin',refunded:'Dana dikembalikan'};
  const read=key=>{try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}};
  const write=(key,value)=>{sessionStorage.setItem(key,JSON.stringify(value));return value;};
  const row=(label,value)=>el('div',{class:'w-cart-summary-line'},el('span',{},label),el('strong',{},value));
  const button=(text,action,outline=false)=>el('button',{type:'button',class:`w-button${outline?' w-outline':''}`,onclick:action},text);
  const addressText=a=>[a?.sub_district_name,a?.district||a?.district_name,a?.city||a?.city_name,a?.province||a?.province_name,a?.postal_code].filter(Boolean).join(', ');
  const pointOf=value=>{
    if(!value||typeof value!=='object')return null;
    const entries=Object.entries(value),lat=entries.find(([k])=>/^(lat|latitude)$/i.test(k))?.[1],lon=entries.find(([k])=>/^(lng|lon|longitude)$/i.test(k))?.[1];
    const point=coordinates(lat,lon);if(point)return point;
    for(const child of Object.values(value)){const found=pointOf(child);if(found)return found;}return null;
  };
  const mapFrame=(point,label)=>{
    if(!point)return null;
    return el('p',{},`Koordinat: ${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}`);
  };
  const shortDate=value=>value?new Date(value).toLocaleString('id-ID'):'Belum tersedia';
  const snapshot=item=>el('article',{class:'w-commerce-item'},cartImage(item.image_url,name(item)),el('div',{},el('strong',{},name(item)),el('p',{},item.store_name||item.store?.name||'',item.variant_name||item.variant?.name?` · ${item.variant_name||item.variant.name}`:''),el('p',{},`${item.quantity} × ${money(item.unit_price)}`)),el('strong',{},money(item.subtotal)));

  async function mount(path){
    reset();let active=true,timer=null,qrURL=null,busy=false,cooldownUntil=0;
    dispose=()=>{active=false;clearTimeout(timer);if(qrURL)URL.revokeObjectURL(qrURL);};
    const page=el('section',{class:'w-container w-cart-page w-commerce-page'}),content=el('fieldset',{class:'w-cart-page-shell','aria-label':'Belanja dan pesanan'}),notice=el('p',{class:'w-commerce-notice',role:'status','aria-live':'polite'});
    page.append(content,notice);main.replaceChildren(page);main.setAttribute('aria-busy','true');
    const error=(e,title='Permintaan belum berhasil')=>{
      if(!active)return;
      if(e.status===401){location.replace('/login/?next='+encodeURIComponent(location.pathname+location.search));return;}
      const fields=Object.values(e.errors||{}).flat().join(' ');
      notice.textContent=[e.message,fields].filter(Boolean).join(' ');
      if(e.status===429){const seconds=Number(e.retryAfter);cooldownUntil=Date.now()+(Number.isFinite(seconds)&&seconds>0?seconds*1000:Math.max(1000,Date.parse(e.retryAfter)-Date.now())||60000);notice.textContent+=' Tunggu sebelum mencoba lagi.';}
      notify({icon:e.status===429?'warning':'error',title,text:notice.textContent||'Silakan coba lagi.'});
    };
    const run=async action=>{
      if(busy||!active)return;
      if(Date.now()<cooldownUntil){notify({icon:'warning',title:'Terlalu banyak permintaan',text:'Batas request tercapai. Tunggu sebelum mencoba lagi.'});return;}
      busy=true;notice.textContent='';page.setAttribute('aria-busy','true');
      content.disabled=true;page.inert=true;
      try{await action();}catch(e){error(e);}finally{busy=false;if(active){page.removeAttribute('aria-busy');content.disabled=false;page.inert=false;}}
    };
    const heading=(title,copy)=>{document.title=`${title} | Walatra Herbal`;return el('header',{class:'w-cart-heading'},el('div',{},el('h1',{},title),copy?el('p',{class:'w-profile-copy'},copy):null));};
    content.append(el('p',{},'Memuat…'));
    try{
      const session=await currentUser();if(!active)return;
      const user=session.data?.user;if(!user){location.replace('/login/?next='+encodeURIComponent(location.pathname+location.search));return;}
      const intentKey=`walatra-checkout:${user.id}`,paymentKey=id=>`walatra-payment:${user.id}:${id}`;

      if(path==='/cart'){
        let selected=new Set(),data=null,revision=0,initialized=false;
        const load=async()=>{
          let result;try{result=await getCart([...selected]);}catch(e){if(e.status!==422)throw e;result=await getCart();}if(!active)return;
          const available=new Set((result.data?.items||[]).filter(i=>i.is_available!==false).map(i=>Number(i.id)));
          const valid=initialized?[...selected].filter(id=>available.has(id)):[...available];
          if((!initialized&&valid.length>0)||valid.length!==selected.size){selected=new Set(valid);result=await getCart(valid);if(!active)return;}
          initialized=true;
          data=result.data;setCartData(data);draw();
        };
        const choose=async(ids,checked)=>{
          ids.forEach(id=>checked?selected.add(Number(id)):selected.delete(Number(id)));
          const current=++revision;
          data={...data,selection:null};
          try{const result=await getCart([...selected]);if(!active||current!==revision)return;data=result.data;setCartData(data);draw();}
          catch(e){if(active){draw();if(e.status===422)await load();}throw e;}
        };
        const checkbox=(label,items)=>{
          const ids=items.filter(i=>i.is_available!==false).map(i=>Number(i.id)),count=ids.filter(id=>selected.has(id)).length;
          const input=el('input',{type:'checkbox',checked:ids.length>0&&count===ids.length,disabled:!ids.length,onchange:e=>run(()=>choose(ids,e.target.checked))});input.indeterminate=count>0&&count<ids.length;
          return el('label',{class:'w-cart-select'},input,el('span',{},label));
        };
        const mutate=action=>run(async()=>{await action();await load();});
        const draw=()=>{
          const items=data?.items||[],available=items.filter(i=>i.is_available!==false),summary=data?.selection;
          const head=heading('Keranjang',`${data?.total_items||0} item tersimpan`);
          head.append(link('/orders/','Pesanan saya',{class:'w-commerce-link'}),button('Kosongkan cart',async()=>{if(await confirm('Kosongkan cart?','Semua item akan dihapus dari keranjang.'))mutate(()=>clearCart());},true));
          content.replaceChildren(head);
          if(!items.length){content.append(el('div',{class:'w-cart-empty'},el('h2',{},'Keranjang masih kosong'),link('/product/','Mulai belanja',{class:'w-button'})));return;}
          const groups=new Map();for(const item of items){const key=item.store?.id??'unknown';if(!groups.has(key))groups.set(key,{name:item.store?.name||'Toko',items:[]});groups.get(key).items.push(item);}
          const list=el('div',{class:'w-cart-content'},checkbox('Pilih semua barang tersedia',available));
          for(const group of groups.values()){
            const section=el('section',{class:'w-cart-store-group'},el('h2',{class:'w-cart-store-heading'},checkbox(group.name,group.items)));
            for(const item of group.items){
              const unavailable=item.is_available===false;
              const update=value=>mutate(async()=>{
                if(!Number.isInteger(value)||value<1||value>99)throw new Error('Jumlah harus antara 1 sampai 99.');
                try{const result=await updateCartItem(item.id,{quantity:value});if(active)setCartData(result.data);}
                catch(e){if([404,422].includes(e.status))await load();throw e;}
              });
              const quantity=el('input',{type:'number',min:1,max:99,step:1,value:item.quantity,disabled:unavailable,class:'w-cart-quantity','aria-label':`Jumlah ${name(item)}`,onchange:e=>{const value=Number(e.target.value);e.target.value=item.quantity;update(value);}});
              const controls=el('div',{class:'w-cart-quantity-controls'},el('button',{type:'button',disabled:unavailable||item.quantity<=1,'aria-label':`Kurangi ${name(item)}`,onclick:()=>update(Number(item.quantity)-1)},'−'),quantity,el('button',{type:'button',disabled:unavailable||item.quantity>=99,'aria-label':`Tambah ${name(item)}`,onclick:()=>update(Number(item.quantity)+1)},'+'));
              const slug=item.type==='bundle'?item.bundle?.slug:item.product?.slug;
              const target=slug?`/${item.type==='bundle'?'bundle':'product'}/${encodeURIComponent(slug)}/?`+new URLSearchParams(item.type==='bundle'?{listing:item.bundle_listing_id}:{listing:item.listing_id,variant:item.variant_id}):null;
              const info=el('div',{class:'w-cart-item-info'},target?link(target,name(item)):el('strong',{},name(item)),el('p',{class:'w-cart-variant'},item.variant?.name||(item.type==='bundle'?'Bundle':'Produk')),el('p',{class:'w-cart-unit-price'},`${money(item.unit_price)} / item`));
              if(item.type==='bundle')info.append(el('ul',{class:'w-cart-components'},...(item.bundle?.items||[]).map(c=>el('li',{},`${c.product?.name||'Produk'} · ${c.variant?.name||'Varian'} × ${c.quantity}`))));
              if(unavailable)info.append(el('p',{class:'w-errors'},item.availability_message||'Tidak tersedia'));
              section.append(el('article',{class:'w-cart-item w-cart-selectable','data-cart-item-id':item.id},checkbox(`Pilih ${name(item)}`,[item]),cartImage(item.image_url,name(item)),info,el('div',{class:'w-cart-item-side'},el('strong',{class:'w-cart-item-subtotal'},money(item.subtotal)),controls,button('Hapus',async()=>{if(await confirm('Hapus item?',name(item)))mutate(async()=>{await deleteCartItem(item.id);selected.delete(Number(item.id));});},true))));
            }
            list.append(section);
          }
          const checkout=button('Lanjut checkout',()=>go('/checkout/?'+new URLSearchParams([...selected].map(id=>['cart_item_ids[]',id]))));
          checkout.disabled=!selected.size||!summary||summary.line_count<1||Boolean(summary.unavailable_item_ids?.length);
          const aside=el('aside',{class:'w-cart-summary','aria-label':'Ringkasan pilihan'},el('h2',{},'Ringkasan pilihan'),row('Jumlah barang',String(summary?.total_items||0)),row('Subtotal',money(summary?.subtotal??0)),el('p',{},'Harga terbaru dan ongkir dikonfirmasi pada checkout.'),checkout);
          content.append(el('div',{class:'w-cart-layout'},list,aside));
        };
        await load();
      }else if(path==='/checkout'){
        let intent=read(intentKey),preview=null,previewAt=0,previewRevision=0,previewPending=false,previewAddress='';
        const ids=intent?.body?.cart_item_ids||new URLSearchParams(location.search).getAll('cart_item_ids[]').map(Number);
        if(!ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length){content.replaceChildren(heading('Checkout'),el('p',{},'Pilih barang dari keranjang sebelum checkout.'),link('/cart/','Buka keranjang',{class:'w-button'}));return;}
        if(intent?.orderId){go(`/orders/${intent.orderId}/`,{replace:true});return;}
        const results=await Promise.all([getCart(),listAddresses()]);if(!active)return;
        const cart=results[0].data;setCartData(cart);
        const addresses=Array.isArray(results[1].data)?results[1].data:[];
        const chosen=(cart.items||[]).filter(i=>ids.includes(Number(i.id)));
        if(!intent&& (chosen.length!==ids.length||chosen.some(i=>i.is_available===false))){content.replaceChildren(heading('Checkout'),el('p',{},'Pilihan keranjang berubah atau tidak tersedia. Pilih ulang barang.'),link('/cart/','Perbarui pilihan',{class:'w-button'}));return;}
        let selectedAddress=String(intent?.body?.address_id||addresses.find(a=>a.is_default)?.id||''),selectedMethod=String(intent?.method||intent?.body?.method||''),methods=[],methodError='';
        const addressPicker=el('div',{class:'w-checkout-addresses'}),methodOptions=el('div',{class:'w-checkout-methods',role:'radiogroup','aria-label':'Pilih metode pembayaran'}),originPoint=el('div',{class:'w-checkout-origin'});
        page.classList.add('w-checkout-page');
        const previewStatus=el('p',{class:'w-checkout-status',role:'status','aria-live':'polite'}),review=el('div',{class:'w-checkout-items'}),summary=el('div',{class:'w-checkout-totals'}),submit=button('Buat pesanan & bayar',()=>run(place)),previewButton=button('Hitung ulang',()=>loadPreview(),true);
        const dockTotal=el('strong',{},'Belum dihitung');
        const checkoutAction=el('div',{class:'w-checkout-action'},el('div',{class:'w-checkout-action-total'},el('span',{},'Total pembayaran'),dockTotal),submit);
        const syncTotal=()=>{dockTotal.textContent=preview?.total!=null?money(preview.total):'Belum dihitung';};
        const drawAddress=()=>{
          addressPicker.replaceChildren(...addresses.map(a=>{
            const area=addressText(a),point=pointOf({latitude:a.latitude,longitude:a.longitude});
            const radioId=`w-checkout-address-${a.id}`;
            const details=el('div',{class:'w-checkout-address-copy'},el('div',{class:'w-checkout-address-name'},el('strong',{},a.name||'Penerima'),el('span',{},a.phone||'')),el('label',{class:'w-checkout-address-label',for:radioId},a.label||'Alamat pengiriman',a.is_default?el('span',{class:'w-address-default-badge'},'UTAMA'):null),el('p',{},a.address||'Alamat jalan belum diisi'),el('p',{},area||'Detail wilayah belum tersedia'),a.address_note?el('p',{class:'w-checkout-address-note'},el('strong',{},'Catatan: '),a.address_note):null,point&&String(a.id)===selectedAddress?el('div',{class:'w-checkout-map-wrap'},el('strong',{},'Titik tujuan pengiriman'),mapFrame(point,`Peta alamat ${a.label||a.name}`)):point?el('p',{class:'w-checkout-no-point'},'Titik lokasi tersedia untuk alamat ini.'):el('p',{class:'w-checkout-no-point'},'Titik lokasi belum disimpan untuk alamat ini.'));
            const radio=el('input',{id:radioId,type:'radio',name:'w-checkout-address',value:a.id,'aria-label':`${a.label||'Alamat'}: ${a.name||'Penerima'}, ${area}`,checked:String(a.id)===selectedAddress,disabled:Boolean(intent),onchange:()=>{if(intent)return;selectedAddress=String(a.id);drawAddress();loadPreview();}});
            return el('div',{class:`w-checkout-address-card${String(a.id)===selectedAddress?' is-selected':''}`,onclick:e=>{if(radio.disabled||e.target.closest('a,iframe,input,label'))return;radio.checked=true;radio.dispatchEvent(new Event('change',{bubbles:true}));}},radio,details);
          }));
        };
        const drawMethods=()=>{
          methodOptions.replaceChildren(...methods.map(method=>{
            const radio=el('input',{type:'radio',name:'w-checkout-method',value:method.code,checked:method.code===selectedMethod,disabled:Boolean(intent),onchange:()=>{selectedMethod=method.code;drawMethods();submit.disabled=!(selectedAddress&&selectedMethod&&preview?.checkout_available&&preview.checkout_token&&preview.total!==null&&preview.shipping);}});
            const copy=el('span',{class:'w-checkout-method-copy'},el('strong',{},method.name),el('small',{},[method.payment_type?.replaceAll('_',' '),method.expiry_minutes?`Berlaku hingga ${method.expiry_minutes} menit`:null].filter(Boolean).join(' · ')));
            return el('label',{class:`w-checkout-method-card${method.code===selectedMethod?' is-selected':''}`},radio,copy);
          }));
          if(methodError)methodOptions.append(el('p',{class:'w-checkout-method-error',role:'status'},methodError),button('Coba muat metode lagi',()=>run(loadMethods),true));
          else if(!methods.length)methodOptions.append(el('p',{class:'w-checkout-method-error'},'Belum ada metode pembayaran yang tersedia.'));
        };
        const drawOrigin=origin=>{
          originPoint.replaceChildren();if(!origin)return;
          const point=pointOf(origin),label=typeof origin==='string'?origin:[origin.name,origin.label,origin.warehouse_name,origin.address,origin.city,origin.city_name,origin.province,origin.province_name].filter(v=>typeof v==='string'&&v.trim()).join(', ');
          originPoint.append(el('span',{class:'w-checkout-origin-label'},'DIKIRIM DARI'),el('strong',{},label||'Titik gudang dari server'),point?mapFrame(point,'Peta titik asal pengiriman'):null);
        };
        const loadMethods=async()=>{methodError='';try{const result=await paymentMethods();if(!active)return;methods=Array.isArray(result.data)?result.data:[];if(!selectedMethod||!methods.some(m=>m.code===selectedMethod))selectedMethod=methods[0]?.code||'';}catch(e){if(!active)return;methodError=e.message||'Metode pembayaran belum dapat dimuat.';error(e,'Metode pembayaran belum dapat dimuat');}drawMethods();submit.disabled=!(selectedAddress&&selectedMethod&&preview?.checkout_available&&preview.checkout_token&&preview.total!==null&&preview.shipping);};
        const invalidate=()=>{preview=null;syncTotal();submit.disabled=true;review.replaceChildren(...chosen.map(snapshot));summary.replaceChildren(row('Subtotal',money(chosen.reduce((sum,item)=>sum+Number(item.subtotal||0),0))),row('Ongkir','Menunggu perhitungan'),row('Total','Belum dihitung'));originPoint.replaceChildren();};
        const loadPreview=async()=>{
          if(intent||!active)return;
          const revision=++previewRevision,addressId=selectedAddress;
          clearTimeout(timer);invalidate();notice.textContent='';
          if(Date.now()<cooldownUntil){previewPending=false;previewButton.disabled=false;review.removeAttribute('aria-busy');page.removeAttribute('aria-busy');previewStatus.textContent='Tunggu sebelum memperbarui pesanan.';notify({icon:'warning',title:'Terlalu banyak permintaan',text:previewStatus.textContent});return;}
          previewPending=true;previewButton.disabled=true;previewStatus.textContent='Memperbarui pesanan…';review.setAttribute('aria-busy','true');page.setAttribute('aria-busy','true');
          try{
            const result=await previewCheckout({cart_item_ids:ids,...(addressId?{address_id:Number(addressId)}:{})});
            if(!active||revision!==previewRevision)return;
            preview=result.data;previewAt=Date.now();previewAddress=addressId;syncTotal();
            review.replaceChildren(...(preview.items||[]).map(item=>snapshot({...chosen.find(i=>Number(i.id)===Number(item.cart_item_id)),...item})));
            summary.replaceChildren(row('Subtotal',money(preview.subtotal)),row('Ongkir',preview.shipping===null?'Pilih alamat pengiriman':money(preview.shipping?.fee)),row('Total',preview.total===null?'Pilih alamat pengiriman':money(preview.total)));
            drawOrigin(preview.shipping_origin);
            if(preview.price_changed){review.prepend(el('p',{class:'w-commerce-warning',role:'status'},'Harga barang berubah. Periksa harga terbaru sebelum membuat pesanan.'));notify({icon:'warning',title:'Harga barang berubah',text:'Periksa harga terbaru sebelum membuat pesanan.'});}
            if(preview.stock_verification==='pending_manual')review.append(el('p',{class:'w-checkout-stock-note'},'Ketersediaan stok akan dikonfirmasi oleh toko.'));
            submit.disabled=!(addressId&&selectedMethod&&preview.checkout_available&&preview.checkout_token&&preview.total!==null&&preview.shipping);
            previewStatus.textContent=addressId?'Pesanan diperbarui.':'Barang diperiksa. Pilih alamat untuk menghitung ongkir dan total.';
            timer=setTimeout(()=>{if(active){invalidate();previewStatus.textContent='Ringkasan kedaluwarsa. Perbarui sebelum membuat pesanan.';notify({icon:'info',title:'Ringkasan kedaluwarsa',text:'Hitung ulang sebelum membuat pesanan.'});}},15*60*1000);
          }catch(e){if(active&&revision===previewRevision){previewStatus.textContent='Pesanan belum dapat diperbarui.';error(e,'Pesanan belum dapat diperbarui');}}
          finally{if(active&&revision===previewRevision){previewPending=false;previewButton.disabled=false;review.removeAttribute('aria-busy');page.removeAttribute('aria-busy');}}
        };
        const place=async()=>{
          if(!intent&&(previewPending||!preview||!selectedAddress||previewAddress!==selectedAddress||!selectedMethod||!preview.checkout_available||!preview.shipping||preview.total===null||!preview.checkout_token||Date.now()-previewAt>=15*60*1000)){invalidate();throw new Error('Pilih alamat dan metode pembayaran, lalu tunggu ringkasan diperbarui.');}
          if(!intent)intent=write(intentKey,{key:crypto.randomUUID(),method:selectedMethod,body:{cart_item_ids:ids,address_id:Number(selectedAddress),checkout_token:preview.checkout_token}});
          drawAddress();drawMethods();
          previewButton.disabled=true;submit.disabled=true;
          try{
            const result=await createOrder(intent.body,intent.key);if(!active)return;
            if(!result.data?.id)throw new Error('Respons pesanan belum pasti. Coba lagi dengan pembelian yang sama.');
            intent=write(intentKey,{...intent,orderId:result.data.id});
            await getCart().then(r=>{if(active)setCartData(r.data);}).catch(()=>{});
            if(result.data.payment_provider==='midtrans'){
              const key=paymentKey(result.data.id),attempt=read(key)||write(key,{key:crypto.randomUUID(),method:selectedMethod});
              try{await createPayment(result.data.id,attempt.method,attempt.key);}catch{await notify({icon:'warning',title:'Pembayaran belum dapat dimulai',text:'Pesanan sudah dibuat. Lanjutkan pembayaran dari detail pesanan yang sama.'});}
            }
            if(active)go(`/orders/${result.data.id}/`,{replace:true});
          }catch(e){
            if(e.status===409&&['CHECKOUT_CHANGED','CHECKOUT_EXPIRED','STALE_CART'].includes(e.code)||e.status===422){sessionStorage.removeItem(intentKey);intent=null;previewButton.disabled=false;invalidate();drawAddress();drawMethods();}
            else{submit.textContent='Coba lagi pesanan yang sama';e.message=[e.message,'Status pembuatan belum pasti. Gunakan tombol Coba lagi pesanan yang sama agar pembelian tidak terduplikasi.'].filter(Boolean).join(' ');}
            throw e;
          }
        };
        const addressPanel=el('section',{class:'w-commerce-panel w-checkout-section'},el('div',{class:'w-checkout-section-head'},el('h2',{},'Alamat pengiriman'),link('/profile/addresses/','Kelola alamat',{class:'w-commerce-link'})),addressPicker,addresses.length?null:el('p',{class:'w-checkout-method-error'},'Belum ada alamat tersimpan. Tambahkan alamat sebelum melanjutkan.'));
        const productPanel=el('section',{class:'w-commerce-panel w-checkout-section'},el('div',{class:'w-checkout-section-head'},el('h2',{},'Produk yang dibeli'),link('/cart/','Ubah keranjang',{class:'w-commerce-link'})),review);
        const methodPanel=el('section',{class:'w-commerce-panel w-checkout-section'},el('h2',{},'Metode pembayaran'),el('p',{class:'w-checkout-section-copy'},'Pilih cara pembayaran untuk pesanan ini.'),methodOptions);
        const summaryPanel=el('aside',{class:'w-commerce-panel w-checkout-summary','aria-label':'Ringkasan pembayaran'},el('h2',{},'Ringkasan belanja'),summary,originPoint,previewStatus,previewButton,checkoutAction);
        content.replaceChildren(heading('Checkout','Satu langkah lagi. Periksa pesanan dan pilih pembayaran.'),el('div',{class:'w-checkout-layout'},el('div',{class:'w-checkout-main'},addressPanel,productPanel,methodPanel),summaryPanel));
        drawAddress();drawMethods();invalidate();
        if(intent){previewButton.disabled=true;submit.disabled=false;submit.textContent='Coba lagi pesanan yang sama';review.replaceChildren(el('p',{},'Status pembuatan pesanan belum pasti. Gunakan permintaan yang sama untuk memeriksa dan melanjutkan pesanan.'));}
        else await Promise.all([loadMethods(),loadPreview()]);
      }else if(path==='/orders'){
        let current=Math.max(1,Number(new URLSearchParams(location.search).get('page'))||1);
        const load=async()=>{
          const result=await listOrders(current);if(!active)return;
          const orders=Array.isArray(result.data)?result.data:[],meta=result.meta||{};
          content.replaceChildren(heading('Pesanan saya'),link('/cart/','Buka keranjang'));
          if(!orders.length)content.append(el('p',{},'Belum ada pesanan pada halaman ini.'));
          for(const order of orders)content.append(el('article',{class:'w-commerce-panel'},el('h2',{},order.order_number),el('p',{},statuses[order.status]||order.status),row('Total',money(order.total)),link(`/orders/${order.id}/`,'Lihat pesanan',{class:'w-button w-outline'})));
          const previous=button('Sebelumnya',()=>go(`/orders/?page=${current-1}`),true),next=button('Berikutnya',()=>go(`/orders/?page=${current+1}`),true);
          previous.disabled=current<=1;next.disabled=current>=Number(meta.last_page||current);
          content.append(el('nav',{class:'w-commerce-actions','aria-label':'Halaman pesanan'},previous,next));
        };await load();
      }else{
        const id=path.split('/')[2];let order=null,paymentIntent=read(paymentKey(id)),fetching=false,methods=[],methodPicker=false,selectedMethod='';
        page.classList.add('w-order-page');
        const recommendationController=new AbortController(),previousDispose=dispose;
        dispose=()=>{recommendationController.abort();previousDispose();};
        const recommendationTitle=el('h2',{id:'w-order-related-title'},'Produk lainnya');
        const recommendationList=el('div',{class:'w-order-related-list',role:'list','aria-label':'Rekomendasi produk',tabindex:0});
        const recommendationStatus=el('p',{class:'w-order-related-status',role:'status','aria-live':'polite'},'Memuat produk…');
        const recommendations=el('aside',{class:'w-order-related','aria-labelledby':'w-order-related-title'},recommendationTitle,el('p',{class:'w-order-related-copy'},'Pilihan untuk belanja berikutnya.'),recommendationStatus,recommendationList);
        const loadRecommendations=async()=>{
          recommendationStatus.textContent='Memuat produk…';
          try{
            const purchased=order.items||[],first=purchased[0];
            let category=first?.categories?.[0]?.slug||first?.product?.categories?.[0]?.slug;
            const slug=first?.product_slug||first?.product?.slug||first?.bundle_slug||first?.bundle?.slug;
            if(!category&&slug){
              try{
                const result=await request(`/catalog/${first.type==='bundle'||first.bundle_slug||first.bundle?'bundles':'products'}/${encodeURIComponent(slug)}`,new URLSearchParams(),recommendationController.signal);
                category=result.data?.categories?.[0]?.slug;
              }catch(e){if(e.name==='AbortError')throw e;}
            }
            const params=new URLSearchParams({per_page:'12',sort:'latest'});
            if(category)params.set('category',category);
            const result=await request('/catalog',params,recommendationController.signal);
            if(!active)return;
            const products=(Array.isArray(result.data)?result.data:[]).filter(product=>product.slug&&product.listing_id&& !purchased.some(item=>{
              const type=item.type||(item.bundle_id||item.bundle_slug||item.bundle?'bundle':'product');
              const purchasedId=item.product_id||item.bundle_id||item.product?.id||item.bundle?.id;
              const purchasedSlug=item.product_slug||item.bundle_slug||item.product?.slug||item.bundle?.slug;
              return type===product.type&&((purchasedId!=null&&String(purchasedId)===String(product.id))||(purchasedSlug&&purchasedSlug===product.slug)||name(item).trim().toLowerCase()===String(product.name).trim().toLowerCase());
            })).filter((product,index,list)=>list.findIndex(other=>other.type===product.type&&String(other.id)===String(product.id))===index).slice(0,4);
            recommendationTitle.textContent=category?'Produk terkait':'Produk lainnya';
            recommendationList.replaceChildren(...products.map(product=>el('article',{class:'w-order-related-card',role:'listitem'},
              link(detailURL(product),cartImage(product.image?.thumb||product.image_url||product.image?.url,product.name),{'aria-label':product.name,class:'w-order-related-image'}),
              el('div',{class:'w-order-related-info'},link(detailURL(product),product.name,{class:'w-order-related-name'}),el('strong',{},itemPrice(product)),link(detailURL(product),'Lihat produk',{class:'w-order-related-link'}))
            )));
            recommendationStatus.textContent=products.length?'':'Belum ada rekomendasi produk yang tersedia.';
          }catch(e){
            if(!active||e.name==='AbortError')return;
            recommendationStatus.replaceChildren(el('span',{},'Produk belum dapat dimuat.'),button('Coba lagi',loadRecommendations,true));
          }
        };
        if(String(read(intentKey)?.orderId)===id)sessionStorage.removeItem(intentKey);
        const load=async(force=true)=>{
          if(fetching)return;fetching=true;
          try{const result=await getOrder(id);if(!active)return;const changed=JSON.stringify(order)!==JSON.stringify(result.data);order=result.data;if(force||changed||(qrURL&&Date.parse(order.payment?.expires_at)<=Date.now()))draw();}finally{fetching=false;}
        };
        const loadQR=async(qr,paymentId)=>{
          try{const blob=await paymentQR(id,paymentId);if(!active||!qr.isConnected)return;if(qrURL)URL.revokeObjectURL(qrURL);qrURL=URL.createObjectURL(blob);qr.replaceChildren(el('img',{src:qrURL,width:256,height:256,alt:'Kode QRIS pembayaran pesanan'}));}
          catch(e){if(active&&qr.isConnected){qr.replaceChildren(el('p',{role:'status'},'QRIS belum dapat dimuat.'),button('Coba muat QR lagi',()=>run(()=>loadQR(qr,paymentId)),true));error(e,'QRIS belum dapat dimuat');}}
        };
        const submitPaymentIntent=async(currentPayment,renew=false)=>{
          if(renew)paymentIntent=write(paymentKey(id),{key:crypto.randomUUID(),method:selectedMethod||currentPayment?.method});
          if(!paymentIntent?.method)throw new Error('Pilih metode pembayaran terlebih dahulu.');
          if(paymentIntent.method!==currentPayment?.method){
            const snapshot=await getOrderPayment(id),observed=snapshot.data?.payment||snapshot.data;
            if(snapshot.data?.order_status==='paid'||observed?.state==='paid'){sessionStorage.removeItem(paymentKey(id));paymentIntent=null;await load();return;}
          }
          try{
            const result=await createPayment(id,paymentIntent.method,paymentIntent.key);
            if(!active)return;
            if(result.httpStatus===202){notify({icon:'info',title:'Pembayaran sedang diproses',text:'Pembayaran sebelumnya sedang diproses. Jangan bayar instruksi lama. Lanjutkan pergantian dengan tombol yang sama setelah status diperiksa.'});await getOrderPayment(id);}
            else if(result.data?.payment&&!['creating','unknown','cancelling'].includes(result.data.payment.state)){sessionStorage.removeItem(paymentKey(id));paymentIntent=null;}
            await load();
          }catch(e){if([409,422].includes(e.status)){sessionStorage.removeItem(paymentKey(id));paymentIntent=null;}await load().catch(()=>{});throw e;}
        };
        const draw=()=>{
          if(qrURL){URL.revokeObjectURL(qrURL);qrURL=null;}
          let qrToLoad=null;
          const payment=order.payment,open=order.status==='pending_payment'&&order.payment_required!==false,pending=Boolean(payment&&payment.state==='pending'&&(!payment.expires_at||Date.parse(payment.expires_at)>Date.now()));
          if(['paid','cancelled','expired','refunded','payment_review'].includes(order.status)){sessionStorage.removeItem(paymentKey(id));paymentIntent=null;}
          if(payment?.state==='pending'&&Date.parse(payment.expires_at)>Date.now()&&paymentIntent?.method===payment.method){sessionStorage.removeItem(paymentKey(id));paymentIntent=null;}
          const unresolved=paymentIntent||['creating','unknown','cancelling'].includes(payment?.state);
          const switching=Boolean(paymentIntent?.method&&payment?.method&&paymentIntent.method!==payment.method);
          const paymentUncertain=['creating','unknown','cancelling'].includes(payment?.state);
          content.replaceChildren(heading(order.order_number||'Detail pesanan',statuses[order.status]||order.status),link('/orders/','Semua pesanan'));
          if(order.simulation)content.append(el('p',{class:'w-commerce-warning'},'Pesanan simulasi. Status dibayar berasal dari simulasi backend.'));
          const orderMain=el('div',{class:'w-order-main'});
          const shipping=order.shipping_address;
          orderMain.append(el('section',{class:'w-commerce-panel w-order-products'},el('h2',{},'Produk pesanan'),...(order.items||[]).map(snapshot),el('div',{class:'w-order-totals'},row('Subtotal',money(order.subtotal)),row('Ongkir',money(order.shipping_fee)),row('Total',money(order.total)))));
          if(shipping)orderMain.append(el('section',{class:'w-commerce-panel w-order-shipping'},el('h2',{},'Alamat pengiriman'),el('strong',{},shipping.name||shipping.recipient_name||'Penerima'),shipping.phone?el('p',{},shipping.phone):null,shipping.address?el('p',{},shipping.address):null,el('p',{},addressText(shipping)),shipping.address_note?el('p',{},`Catatan: ${shipping.address_note}`):null));
          const panel=el('section',{class:'w-commerce-panel w-order-payment'},el('h2',{},'Pembayaran'));
          if(order.payment_due_at)panel.append(el('p',{},`Batas waktu pesanan: ${shortDate(order.payment_due_at)}`));
          if(order.status==='payment_review')panel.append(el('p',{},'Pembayaran perlu diperiksa admin. Tunggu hasil pemeriksaan.'));
          if(order.payment_provider==='manual')panel.append(el('p',{},order.payment_instructions||'Pembayaran menunggu verifikasi admin.'));
          if(payment){
            const paymentStates={pending:'Menunggu pembayaran',paid:'Sudah dibayar',settlement:'Sudah dibayar',creating:'Menyiapkan pembayaran',unknown:'Status sedang diperiksa',cancelling:'Pembatalan diproses',cancelled:'Dibatalkan',expired:'Kedaluwarsa',failed:'Gagal'};
            panel.append(row('Metode',String(payment.method||'').replaceAll('_',' ').toUpperCase()),row('Status pembayaran',paymentStates[payment.state]||payment.state),row('Nominal',money(payment.amount)),el('p',{},`Instruksi berlaku hingga ${shortDate(payment.expires_at)}`));
            if(open&&pending&&!switching){
              if(payment.va_number)panel.append(row((payment.bank||'Bank').toUpperCase()+' VA',payment.va_number));
              if(payment.biller_code)panel.append(row('Kode perusahaan',payment.biller_code),row('Kode pembayaran',payment.bill_key));
              if(payment.method==='qris'){
                const qr=el('div',{class:'w-payment-qr','aria-live':'polite'},el('p',{},'Memuat QRIS…'));panel.append(qr);qrToLoad={qr,paymentId:payment.id};
              }
            }
          }
          if(open&&order.payment_provider==='midtrans'){
            const retryExpired=Boolean(payment&&['expired','failed','cancelled'].includes(payment.state)||payment?.state==='pending'&&payment.expires_at&&Date.parse(payment.expires_at)<=Date.now());
            if(paymentIntent||retryExpired){
              const pay=button(switching?'Lanjutkan pergantian metode':retryExpired?'Terbitkan ulang instruksi pembayaran':'Pulihkan pembayaran yang sama',()=>run(()=>submitPaymentIntent(payment,retryExpired&&!switching)));
              panel.append(pay);
            }else if(!payment)panel.append(el('p',{class:'w-commerce-address'},'Metode pembayaran dipilih saat checkout. Instruksi belum tersedia untuk pesanan ini. Sinkronkan status, lalu hubungi admin jika tetap kosong.'));
            if(unresolved&&!retryExpired)panel.append(el('p',{class:'w-commerce-address'},'Status pembayaran belum pasti. Pemulihan akan memakai permintaan yang sama.'));
            if(switching)panel.append(el('p',{class:'w-commerce-warning',role:'status'},'Pergantian metode sedang diproses. Jangan membayar instruksi metode sebelumnya.'));
            if(open&&payment&&(pending||retryExpired)&&!switching&&!paymentUncertain&&(!paymentIntent||retryExpired)){
              panel.append(button(methodPicker?'Tutup pilihan metode':'Ganti metode pembayaran',()=>run(async()=>{
                if(!methods.length){const result=await paymentMethods();methods=Array.isArray(result.data)?result.data:[];}
                selectedMethod='';methodPicker=!methodPicker;draw();
              }),true));
              if(methodPicker){
                const choices=el('div',{class:'w-payment-method-choices',role:'radiogroup','aria-label':'Pilih metode pembayaran baru'},...methods.map(method=>{
                  const radio=el('input',{type:'radio',name:'w-order-payment-method',value:method.code,checked:method.code===selectedMethod,disabled:pending&&method.code===payment.method,onchange:()=>{selectedMethod=method.code;}});
                  return el('label',{class:'w-payment-method-choice'},radio,el('span',{},el('strong',{},method.name),el('small',{},method.payment_type?.replaceAll('_',' ')||'')));
                }));
                panel.append(choices,button('Gunakan metode ini',()=>run(async()=>{
                  if(!selectedMethod)throw new Error('Pilih metode pembayaran.');
                  paymentIntent=write(paymentKey(id),{key:crypto.randomUUID(),method:selectedMethod});methodPicker=false;
                  await submitPaymentIntent(payment);
                })));
                if(!methods.length)panel.append(el('p',{class:'w-checkout-method-error'},'Metode pembayaran belum tersedia.'));
              }
            }
            panel.append(button('Cek Status',()=>run(async()=>{await refreshPayment(id);await load();}),true),el('p',{},'Memeriksa transaksi ke penyedia pembayaran dan memperbarui hasilnya.'));
          }
          const actions=el('div',{class:'w-commerce-actions'},button('Refresh',()=>run(load),true));
          if(open)actions.append(button('Batalkan pesanan',async()=>{if(await confirm('Batalkan pesanan?','Barang tidak otomatis dikembalikan ke keranjang.'))run(async()=>{await cancelOrder(id);await load();});},true));
          orderMain.append(panel,actions);
          content.append(el('div',{class:'w-order-layout'},orderMain,recommendations));
          if(qrToLoad)loadQR(qrToLoad.qr,qrToLoad.paymentId);
        };
        await load();if(!active)return;
        loadRecommendations();
        const poll=async()=>{
          if(!active)return;
          if(!busy&&!document.hidden&&Date.now()>=cooldownUntil&&order?.status==='pending_payment'){try{await load(false);}catch(e){error(e);}}
          if(active)timer=setTimeout(poll,15000);
        };timer=setTimeout(poll,15000);
      }
    }catch(e){error(e);if(active&&content.textContent==='Memuat…')content.replaceChildren(heading('Belum dapat dimuat'),button('Coba lagi',()=>mount(path)));}
    finally{if(active)main.removeAttribute('aria-busy');}
  }
  return {mount,reset};
}
