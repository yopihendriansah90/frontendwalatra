import {currentUser,getCart,updateCartItem,deleteCartItem,clearCart,listAddresses,previewCheckout,createOrder,listOrders,getOrder,cancelOrder,paymentMethods,createPayment,refreshPayment,paymentQR} from './auth-client.js';

export function commerce({el,link,money,main,go,setCartData,cartImage,confirm}){
  let dispose=()=>{};
  const reset=()=>{dispose();dispose=()=>{};};
  const name=item=>item.product_name||(item.type==='bundle'?item.bundle?.name:item.product?.name)||'Item tidak tersedia';
  const statuses={pending_payment:'Menunggu pembayaran',paid:'Sudah dibayar',cancelled:'Dibatalkan',expired:'Kedaluwarsa',payment_review:'Pembayaran diperiksa admin',refunded:'Dana dikembalikan'};
  const read=key=>{try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}};
  const write=(key,value)=>{sessionStorage.setItem(key,JSON.stringify(value));return value;};
  const row=(label,value)=>el('div',{class:'w-cart-summary-line'},el('span',{},label),el('strong',{},value));
  const button=(text,action,outline=false)=>el('button',{type:'button',class:`w-button${outline?' w-outline':''}`,onclick:action},text);
  const addressText=a=>[a?.name,a?.phone,a?.address,a?.sub_district_name,a?.district||a?.district_name,a?.city||a?.city_name,a?.province||a?.province_name,a?.postal_code].filter(Boolean).join(', ');
  const shortDate=value=>value?new Date(value).toLocaleString('id-ID'):'Belum tersedia';
  const snapshot=item=>el('article',{class:'w-commerce-item'},cartImage(item.image_url,name(item)),el('div',{},el('strong',{},name(item)),el('p',{},item.store_name||item.store?.name||'',item.variant_name||item.variant?.name?` · ${item.variant_name||item.variant.name}`:''),el('p',{},`${item.quantity} × ${money(item.unit_price)}`)),el('strong',{},money(item.subtotal)));

  async function mount(path){
    reset();let active=true,timer=null,qrURL=null,busy=false,cooldownUntil=0;
    dispose=()=>{active=false;clearTimeout(timer);if(qrURL)URL.revokeObjectURL(qrURL);};
    const page=el('section',{class:'w-container w-cart-page w-commerce-page'}),content=el('fieldset',{class:'w-cart-page-shell','aria-label':'Belanja dan pesanan'}),notice=el('p',{class:'w-commerce-notice',role:'status','aria-live':'polite'});
    page.append(content,notice);main.replaceChildren(page);main.setAttribute('aria-busy','true');
    const error=e=>{
      if(!active)return;
      if(e.status===401){location.replace('/login/?next='+encodeURIComponent(location.pathname+location.search));return;}
      const fields=Object.values(e.errors||{}).flat().join(' ');
      notice.textContent=[e.message,fields].filter(Boolean).join(' ');
      if(e.status===429){const seconds=Number(e.retryAfter);cooldownUntil=Date.now()+(Number.isFinite(seconds)&&seconds>0?seconds*1000:Math.max(1000,Date.parse(e.retryAfter)-Date.now())||60000);notice.textContent+=' Tunggu sebelum mencoba lagi.';}
    };
    const run=async action=>{
      if(busy||!active)return;
      if(Date.now()<cooldownUntil){notice.textContent='Batas request tercapai. Tunggu sebelum mencoba lagi.';return;}
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
        let intent=read(intentKey),preview=null,previewAt=0;
        const ids=intent?.body?.cart_item_ids||new URLSearchParams(location.search).getAll('cart_item_ids[]').map(Number);
        if(!ids.length||ids.some(id=>!Number.isSafeInteger(id)||id<1)||new Set(ids).size!==ids.length){content.replaceChildren(heading('Checkout'),el('p',{},'Pilih barang dari keranjang sebelum checkout.'),link('/cart/','Buka keranjang',{class:'w-button'}));return;}
        if(intent?.orderId){go(`/orders/${intent.orderId}/`,{replace:true});return;}
        const results=await Promise.all([getCart(),listAddresses()]);if(!active)return;
        const cart=results[0].data;setCartData(cart);
        const addresses=Array.isArray(results[1].data)?results[1].data:[];
        const chosen=(cart.items||[]).filter(i=>ids.includes(Number(i.id)));
        if(!intent&& (chosen.length!==ids.length||chosen.some(i=>i.is_available===false))){content.replaceChildren(heading('Checkout'),el('p',{},'Pilihan keranjang berubah atau tidak tersedia. Pilih ulang barang.'),link('/cart/','Perbarui pilihan',{class:'w-button'}));return;}
        const select=el('select',{id:'w-checkout-address'},el('option',{value:''},'Pilih alamat pengiriman'),...addresses.map(a=>el('option',{value:a.id,selected:Number(intent?.body?.address_id)===Number(a.id)||(!intent&&a.is_default)},a.label||a.name)));
        const address=el('p',{class:'w-commerce-address'}),review=el('div',{}),submit=button('Buat pesanan',()=>run(place)),previewButton=button('Perbarui ringkasan',()=>run(loadPreview),true);
        const drawAddress=()=>{address.textContent=addressText(addresses.find(a=>String(a.id)===select.value));};
        const invalidate=()=>{preview=null;submit.disabled=true;review.replaceChildren(el('p',{},'Perbarui ringkasan untuk mengonfirmasi harga dan ongkir.'));};
        select.addEventListener('change',()=>{invalidate();drawAddress();});
        const loadPreview=async()=>{
          invalidate();if(!select.value)throw new Error('Pilih alamat pengiriman terlebih dahulu.');
          const result=await previewCheckout({cart_item_ids:ids,address_id:Number(select.value)});if(!active)return;
          preview=result.data;previewAt=Date.now();
          review.replaceChildren(...(preview.items||[]).map(item=>snapshot({...chosen.find(i=>Number(i.id)===Number(item.cart_item_id)),...item})),row('Subtotal',money(preview.subtotal)),row('Ongkir',money(preview.shipping?.fee)),row('Total',money(preview.total)));
          if(preview.price_changed)review.prepend(el('p',{class:'w-commerce-warning',role:'status'},'Harga barang berubah. Periksa harga terbaru sebelum membuat pesanan.'));
          if(preview.stock_verification==='pending_manual')review.append(el('p',{},'Stok belum diverifikasi otomatis.'));
          submit.disabled=!(preview.checkout_available&&preview.checkout_token&&preview.total!==null&&preview.shipping);
          clearTimeout(timer);timer=setTimeout(()=>{if(active){invalidate();notice.textContent='Ringkasan kedaluwarsa. Perbarui sebelum membuat pesanan.';}},15*60*1000);
        };
        const place=async()=>{
          if(!intent&&(!preview||Date.now()-previewAt>=15*60*1000)){invalidate();throw new Error('Perbarui ringkasan checkout terlebih dahulu.');}
          if(!intent)intent=write(intentKey,{key:crypto.randomUUID(),body:{cart_item_ids:ids,address_id:Number(select.value),checkout_token:preview.checkout_token}});
          select.disabled=true;previewButton.disabled=true;
          try{
            const result=await createOrder(intent.body,intent.key);if(!active)return;
            if(!result.data?.id)throw new Error('Respons pesanan belum pasti. Coba lagi dengan pembelian yang sama.');
            intent=write(intentKey,{...intent,orderId:result.data.id});
            await getCart().then(r=>{if(active)setCartData(r.data);}).catch(()=>{});
            if(active)go(`/orders/${result.data.id}/`,{replace:true});
          }catch(e){
            if(e.status===409&&['CHECKOUT_CHANGED','CHECKOUT_EXPIRED','STALE_CART'].includes(e.code)||e.status===422){sessionStorage.removeItem(intentKey);intent=null;select.disabled=false;previewButton.disabled=false;invalidate();}
            else{submit.textContent='Coba lagi pesanan yang sama';notice.textContent='Status pembuatan belum pasti. Jangan membuat pembelian baru.';}
            throw e;
          }
        };
        content.replaceChildren(heading('Checkout','Konfirmasikan alamat, harga, dan ongkir.'),link('/cart/','Kembali ke keranjang'),el('section',{class:'w-commerce-panel'},el('label',{for:select.id},'Alamat pengiriman'),select,address,link('/profile/addresses/','Kelola alamat')),review,el('div',{class:'w-commerce-actions'},previewButton,submit));
        drawAddress();invalidate();
        if(intent){select.disabled=true;previewButton.disabled=true;submit.disabled=false;submit.textContent='Coba lagi pesanan yang sama';review.replaceChildren(el('p',{},'Ada pembuatan pesanan yang belum terkonfirmasi. Lanjutkan dengan permintaan yang sama.'));}
        else if(select.value)await loadPreview();
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
        const id=path.split('/')[2];let order=null,methods=[],paymentIntent=read(paymentKey(id)),fetching=false;
        if(String(read(intentKey)?.orderId)===id)sessionStorage.removeItem(intentKey);
        const load=async(force=true)=>{
          if(fetching)return;fetching=true;
          try{const result=await getOrder(id);if(!active)return;const changed=JSON.stringify(order)!==JSON.stringify(result.data);order=result.data;if(force||changed||(qrURL&&Date.parse(order.payment?.expires_at)<=Date.now()))draw();}finally{fetching=false;}
        };
        const draw=()=>{
          if(qrURL){URL.revokeObjectURL(qrURL);qrURL=null;}
          const payment=order.payment,open=order.status==='pending_payment'&&order.payment_required!==false;
          if(['paid','cancelled','expired','refunded','payment_review'].includes(order.status)){sessionStorage.removeItem(paymentKey(id));paymentIntent=null;}
          if(payment?.state==='pending'&&Date.parse(payment.expires_at)>Date.now()&&paymentIntent?.method===payment.method){sessionStorage.removeItem(paymentKey(id));paymentIntent=null;}
          const unresolved=paymentIntent||['creating','unknown','cancelling'].includes(payment?.state);
          content.replaceChildren(heading(order.order_number||'Detail pesanan',statuses[order.status]||order.status),link('/orders/','Semua pesanan'));
          if(order.simulation)content.append(el('p',{class:'w-commerce-warning'},'Pesanan simulasi. Status dibayar berasal dari simulasi backend.'));
          content.append(el('div',{class:'w-commerce-panel'},...(order.items||[]).map(snapshot),row('Subtotal',money(order.subtotal)),row('Ongkir',money(order.shipping_fee)),row('Total',money(order.total)),el('p',{},addressText(order.shipping_address))));
          const panel=el('section',{class:'w-commerce-panel'},el('h2',{},'Pembayaran'));
          if(order.payment_due_at)panel.append(el('p',{},`Batas waktu pesanan: ${shortDate(order.payment_due_at)}`));
          if(order.status==='payment_review')panel.append(el('p',{},'Pembayaran perlu diperiksa admin. Tunggu hasil pemeriksaan.'));
          if(order.payment_provider==='manual')panel.append(el('p',{},order.payment_instructions||'Pembayaran menunggu verifikasi admin.'));
          if(payment){
            panel.append(row('Status pembayaran',payment.state),row('Nominal',money(payment.amount)),el('p',{},`Instruksi berlaku hingga ${shortDate(payment.expires_at)}`));
            const pending=payment.state==='pending'&&(!payment.expires_at||Date.parse(payment.expires_at)>Date.now());
            if(open&&pending){
              if(payment.va_number)panel.append(row((payment.bank||'Bank').toUpperCase()+' VA',payment.va_number));
              if(payment.biller_code)panel.append(row('Kode perusahaan',payment.biller_code),row('Kode pembayaran',payment.bill_key));
              if(payment.method==='qris'){
                const qr=el('div',{class:'w-payment-qr'},button('Tampilkan QRIS',()=>run(async()=>{
                  const blob=await paymentQR(id,payment.id);if(!active||!qr.isConnected)return;
                  if(qrURL)URL.revokeObjectURL(qrURL);qrURL=URL.createObjectURL(blob);qr.replaceChildren(el('img',{src:qrURL,width:256,height:256,alt:'Kode QRIS pembayaran pesanan'}));
                })));panel.append(qr);
              }
            }
          }
          if(open&&order.payment_provider==='midtrans'){
            const method=el('select',{id:'w-payment-method'},el('option',{value:''},'Pilih metode'),...methods.map(m=>el('option',{value:m.code,selected:m.code===(paymentIntent?.method||payment?.method)},m.name)));
            method.disabled=Boolean(unresolved);
            const pay=button(unresolved?'Pulihkan pembayaran yang sama':'Terbitkan instruksi pembayaran',()=>run(async()=>{
              const chosen=paymentIntent?.method||method.value;if(!chosen)throw new Error('Pilih metode pembayaran.');
              if(!paymentIntent)paymentIntent=write(paymentKey(id),{key:crypto.randomUUID(),method:chosen});
              try{const result=await createPayment(id,paymentIntent.method,paymentIntent.key);if(!active)return;if(result.httpStatus===202){notice.textContent='Pembayaran sedang diproses. Baca ulang status atau lanjutkan dengan permintaan yang sama.';}else if(result.data?.payment&&!['creating','unknown','cancelling'].includes(result.data.payment.state)){sessionStorage.removeItem(paymentKey(id));paymentIntent=null;}await load();}
              catch(e){if([409,422].includes(e.status)){sessionStorage.removeItem(paymentKey(id));paymentIntent=null;}await load().catch(()=>{});throw e;}
            }));
            pay.disabled=!methods.length&&!paymentIntent;
            panel.append(el('label',{for:method.id},'Metode pembayaran'),method,pay);
            if(!methods.length)panel.append(button('Muat metode pembayaran',()=>run(async()=>{const result=await paymentMethods();if(active){methods=result.data||[];draw();if(!methods.length)notice.textContent='Belum ada metode pembayaran yang diaktifkan server.';}}),true));
            if(unresolved)panel.append(el('p',{},'Status pembayaran belum pasti. Pemulihan memakai permintaan yang sama.'));
            panel.append(button('Sinkronkan pembayaran',()=>run(async()=>{await refreshPayment(id);await load();}),true),el('p',{},'Sinkronisasi juga dapat memulihkan penerbitan instruksi pembayaran.'));
          }
          const actions=el('div',{class:'w-commerce-actions'},button('Baca ulang status',()=>run(load),true));
          if(open)actions.append(button('Batalkan pesanan',async()=>{if(await confirm('Batalkan pesanan?','Barang tidak otomatis dikembalikan ke keranjang.'))run(async()=>{await cancelOrder(id);await load();});},true));
          content.append(panel,actions);
        };
        await load();if(!active)return;
        if(order.payment_provider==='midtrans'&&order.status==='pending_payment'){
          try{const result=await paymentMethods();if(active){methods=result.data||[];draw();}}catch(e){error(e);}
        }
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
