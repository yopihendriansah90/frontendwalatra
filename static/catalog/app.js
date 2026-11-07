import Swal from './vendor/sweetalert2.esm.all.min.js';
import {request,categories,banners,shippingLocations,apiBase,ApiError} from './api.js';
import {AuthError,requestOTP,verifyOTP,currentUser,updateProfile,logout,listAddresses,createAddress,updateAddress,deleteAddress} from './auth-client.js';
import {sorts,money,itemPrice,itemKey,detailURL,mediaURL,imageURLs,paramsFromURL,selection} from './model.js';

const $=(s,r=document)=>r.querySelector(s);
globalThis.Swal=Swal;
function el(tag,attrs={},...children){
  const node=document.createElement(tag);
  for(const [key,value] of Object.entries(attrs)){
    if(value===null||value===undefined||value===false)continue;
    if(key==='class')node.className=value;
    else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);
    else if(key==='text')node.textContent=value;
    else node.setAttribute(key,value===true?'':String(value));
  }
  for(const child of children.flat(Infinity))if(child!==null&&child!==undefined)node.append(child instanceof Node?child:document.createTextNode(String(child)));
  return node;
}
function notify(options){
  if(!globalThis.Swal)return Promise.resolve(null);
  if(Swal.isVisible())return Promise.resolve(null);
  return Swal.fire({confirmButtonColor:'#075446',customClass:{popup:'w-swal-popup',confirmButton:'w-swal-confirm'},...options});
}
function icon(name){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.7');svg.setAttribute('aria-hidden','true');
  const path=document.createElementNS(svg.namespaceURI,'path');
  const shapes={search:'M21 21l-6-6M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z',user:'M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',home:'m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1z',bag:'M5 8h14l1 13H4L5 8Zm4 0a3 3 0 0 1 6 0',grid:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z',menu:'M4 6h16M4 12h16M4 18h16',close:'m6 6 12 12M18 6 6 18',phone:'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7l.4 2.8a2 2 0 0 1-.6 1.7L7.5 9.6a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 1.7-.6l2.8.4a2 2 0 0 1 1.6 1.9Z',logout:'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',chevron:'m9 18 6-6-6-6',mail:'M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Zm0 1 8 6 8-6',pin:'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0ZM12 10h.01',plus:'M12 5v14M5 12h14',edit:'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z',trash:'M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6m4 4v6m6-6v6',star:'m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z',image:'M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M9 7h.01'};
  path.setAttribute('d',shapes[name]||shapes.image);svg.append(path);return svg;
}
function placeholder(){return el('div',{class:'w-no-image',role:'img','aria-label':'Gambar belum tersedia'},icon('image'),el('span',{},'Gambar belum tersedia'));}
function picture(urls,alt,{category=false,eager=false}={}){
  if(!urls.length)return category?el('span',{class:'w-icon-fallback',role:'img','aria-label':`Ikon ${alt} belum tersedia`},'◇'):placeholder();
  const img=el('img',{src:urls[0],alt,loading:eager?'eager':'lazy',decoding:'async',width:category?64:400,height:category?64:400,class:category?'w-category-icon':null});
  let next=1;img.addEventListener('error',()=>{if(next<urls.length)img.src=urls[next++];else img.replaceWith(category?el('span',{class:'w-icon-fallback',role:'img','aria-label':`Ikon ${alt} belum tersedia`},'◇'):placeholder());});return img;
}
function renderDescription(markup){
  const parsed=new DOMParser().parseFromString(String(markup),'text/html'),allowed=new Set(['p','h2','h3','h4','ul','ol','li','strong','b','em','i','br','hr','a','blockquote']);
  const convert=node=>{
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode(node.nodeValue||'');
    if(node.nodeType!==Node.ELEMENT_NODE)return null;
    const tag=node.tagName.toLowerCase();
    if(['script','style','iframe','object','embed','template','noscript'].includes(tag))return null;
    if(tag==='img'){
      const src=mediaURL(node.getAttribute('src'),apiBase);if(!src)return null;
      const image=el('img',{src,alt:node.getAttribute('alt')||'',loading:'lazy',decoding:'async'});image.addEventListener('error',()=>image.remove(),{once:true});return image;
    }
    if(!allowed.has(tag)){const fragment=document.createDocumentFragment();for(const child of node.childNodes){const safe=convert(child);if(safe)fragment.append(safe);}return fragment;}
    const safe=el(tag);
    if(tag==='a'){
      const href=node.getAttribute('href');
      if(href){try{const url=new URL(href,location.origin);if(['http:','https:','mailto:'].includes(url.protocol))safe.setAttribute('href',url.href);}catch{}}
    }
    for(const child of node.childNodes){const content=convert(child);if(content)safe.append(content);}
    return safe;
  };
  const content=document.createDocumentFragment();for(const child of parsed.body.childNodes){const safe=convert(child);if(safe)content.append(safe);}
  return el('div',{class:'w-description'},content);
}
const categoryIcon=(c,eager=false)=>picture([mediaURL(c.icon_url,apiBase)].filter(Boolean),c.name,{category:true,eager});
const categoryHref=c=>`/cat/${encodeURIComponent(c.slug)}/`;
const logo=()=>el('img',{class:'w-logo',src:'/_media/cdn/images/logo_naturalfarm.svg',alt:'Walatra Herbal',width:140,height:32});
const link=(href,label,attrs={})=>el('a',{href,...attrs},label);
let categoryData=null,categoryPromise=null,activeController=null,renderVersion=0;
let main=$('#site-main'),header=$('#site-header'),footer=$('#site-footer');
let shellMounted=false;
if(!header){header=el('div',{id:'site-header'});document.body.prepend(header);}
if(!footer){footer=el('div',{id:'site-footer'});document.body.append(footer);}
document.body.classList.add('w-site');

function getCategories(force=false){
  if(force){categoryData=null;categoryPromise=null;}
  if(categoryData)return Promise.resolve(categoryData);
  if(!categoryPromise)categoryPromise=categories().then(r=>{if(!Array.isArray(r.data))throw new ApiError('Daftar kategori tidak valid.');categoryData=r.data;return r.data;}).catch(e=>{categoryPromise=null;throw e;});
  return categoryPromise;
}
function categoryLinks(items,child=false){
  return items.flatMap(c=>[link(categoryHref(c),[categoryIcon(c,true),el('span',{},c.name)],{class:child?'w-child':null}),...categoryLinks(c.children||[],true)]);
}
function closeMenus({restoreFocus=false}={}){
  document.querySelectorAll('.w-menu[open]').forEach(m=>m.open=false);
  const toggle=$('.w-mobile-toggle'),drawer=$('.w-mobile-drawer');
  if(toggle)toggle.setAttribute('aria-expanded','false');
  if(drawer&&!drawer.hidden){drawer.classList.remove('is-open');drawer.setAttribute('aria-hidden','true');drawer.inert=true;document.body.classList.remove('w-drawer-open');if(restoreFocus)toggle?.focus();setTimeout(()=>{if(!drawer.classList.contains('is-open'))drawer.hidden=true;},260);}
}
function openMobileDrawer(section='menu'){
  const drawer=$('.w-mobile-drawer'),toggle=$('.w-mobile-toggle');if(!drawer)return;
  drawer.hidden=false;drawer.inert=false;drawer.setAttribute('aria-hidden','false');drawer.dataset.section=section;document.body.classList.add('w-drawer-open');toggle?.setAttribute('aria-expanded','true');requestAnimationFrame(()=>{if(!drawer.hidden&&!drawer.inert){drawer.classList.add('is-open');$('.w-mobile-drawer-close',drawer)?.focus();}});
}
function mobileNavigation(){
  const current=location.pathname.replace(/\/$/,'')||'/';
  const item=(href,label,shape,active)=>link(href,[icon(shape),el('span',{},label)],{class:'w-mobile-nav-item', 'aria-current':active?'page':null});
  const categories=el('button',{class:'w-mobile-nav-item',type:'button','aria-label':'Buka kategori',onclick:()=>openMobileDrawer('categories')},icon('grid'),el('span',{},'Kategori'));
  const account=link('/login/','Akun',{class:'w-mobile-nav-item','data-mobile-account-link':''});account.replaceChildren(icon('user'),el('span',{},'Akun'));
  const nav=el('nav',{class:'w-mobile-bottom-nav','aria-label':'Navigasi utama mobile'},item('/','Beranda','home',current==='/'),item('/product/','Produk','bag',current==='/product'),categories,account);
  document.body.append(nav);return nav;
}
function syncMobileNavigation(path){
  const nav=$('.w-mobile-bottom-nav');if(!nav)return;
  const normalized=path.replace(/\/$/,'')||'/';
  const home=$('a[href="/"]',nav),products=$('a[href="/product/"]',nav),categories=$('button',nav),account=$('[data-mobile-account-link]',nav);
  for(const [node,active] of [[home,normalized==='/'],[products,normalized==='/product'||normalized==='/search'],[categories,normalized.startsWith('/cat/')],[account,normalized.startsWith('/profile')]]){
    if(!node)continue;if(active)node.setAttribute('aria-current','page');else node.removeAttribute('aria-current');
  }
}
function mountMobileDrawer(toggle){
  const close=()=>closeMenus({restoreFocus:true});
  const drawer=el('div',{class:'w-mobile-drawer',hidden:true,'aria-hidden':'true',inert:true},el('button',{class:'w-mobile-drawer-backdrop',type:'button','aria-label':'Tutup menu',onclick:close}),el('nav',{class:'w-mobile-drawer-panel','aria-label':'Menu mobile'},el('div',{class:'w-mobile-drawer-heading'},link('/',logo(),{'aria-label':'Beranda Walatra Herbal'}),el('button',{class:'w-mobile-drawer-close w-icon-button',type:'button','aria-label':'Tutup menu',onclick:close},icon('close'))),el('div',{class:'w-mobile-drawer-links'},link('/product/','Semua Produk'),link('/store/','Lokasi Toko'),link('/blog/','Artikel'),link('/health-tools/','Cek Kesehatan'),link('/about-us/','Tentang Kami'),link('/contactus/','Hubungi Kami')),el('section',{class:'w-mobile-drawer-categories','aria-labelledby':'w-mobile-categories-title'},el('h2',{id:'w-mobile-categories-title'},'Kategori'),el('div',{class:'w-mobile-category-links'},el('p',{class:'w-category-status',role:'status'},'Memuat kategori…')))));
  drawer.hidden=true;drawer.inert=true;drawer.addEventListener('click',event=>{if(event.target.closest('a'))closeMenus();});
  toggle.addEventListener('click',()=>{if(drawer.hidden)openMobileDrawer('menu');else closeMenus();});
  header.append(drawer);return drawer;
}
function mountHeader(){
  const menu=el('details',{class:'w-menu',id:'w-category-menu'},el('summary',{},'☰ Semua Kategori'),el('nav',{class:'w-menu-panel','aria-label':'Kategori'},el('p',{class:'w-category-status',role:'status'},'Memuat kategori…')));
  const toggle=el('button',{class:'w-icon-button w-mobile-toggle',type:'button','aria-label':'Buka menu','aria-controls':'w-mobile-drawer','aria-expanded':'false'},icon('menu'));
  const searchInput=el('input',{id:'w-search',type:'search',name:'q','aria-label':'Cari produk dan bundle',placeholder:'Temukan produk favoritmu',maxlength:100,autocomplete:'off',value:paramsFromURL(location.href).get('q')||''});
  let timer;
  const search=()=>{clearTimeout(timer);const q=searchInput.value.trim();go('/search/?'+new URLSearchParams(q?{q}:{}));};
  searchInput.addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(search,globalThis.WALATRA_CONFIG?.searchDebounceMs??350);});
  searchInput.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();search();}});
  const form=el('form',{class:'w-search',role:'search',onsubmit:e=>{e.preventDefault();search();}},searchInput,el('button',{type:'submit','aria-label':'Cari'},icon('search')));
  const account=link('/login/?next='+encodeURIComponent(location.pathname+location.search),'Login',{class:'w-button w-login','data-account-link':''});
  header.replaceChildren(el('header',{class:'w-header'},el('div',{class:'w-topbar'},el('div',{class:'w-container'},el('span',{},'Walatra Herbal'),el('nav',{class:'w-toplinks','aria-label':'Tautan informasi'},link('/store/','Lokasi Toko'),link('/blog/','Artikel'),link('/product/','Semua Produk')))),el('div',{class:'w-container'},el('div',{class:'w-headrow'},link('/',logo(),{'aria-label':'Beranda Walatra Herbal'}),link('/health-tools/','Cek Kesehatan',{class:'w-health-link'}),form,account,toggle),el('nav',{class:'w-navrow','aria-label':'Navigasi katalog'},menu,link('/product/','Semua Produk'),el('div',{class:'w-navstrip','aria-label':'Pilihan kategori'})))));
  mountMobileDrawer(toggle);
  const mobileAccount=$('[data-mobile-account-link]');if(mobileAccount)mobileAccount.href=account.href;
  currentUser().then(()=>{if(account.isConnected){account.href='/profile/';account.textContent='Profil';if(mobileAccount)mobileAccount.href='/profile/';}}).catch(error=>{if(error.status!==401)console.warn('Status sesi Walatra tidak dapat diperiksa.');});
  menu.addEventListener('toggle',()=>toggle.setAttribute('aria-expanded',String(menu.open)));
  const load=async(force=false)=>{
    try{const items=await getCategories(force);$('.w-menu-panel',header).replaceChildren(...categoryLinks(items));$('.w-navstrip',header).replaceChildren(...items.map(c=>link(categoryHref(c),el('span',{},c.name))));$('.w-mobile-category-links',header).replaceChildren(...categoryLinks(items));if(!items.length){$('.w-menu-panel',header).append(el('p',{},'Kategori belum tersedia.'));$('.w-mobile-category-links',header).append(el('p',{},'Kategori belum tersedia.'));}}
    catch(e){$('.w-menu-panel',header).replaceChildren(errorState(e,()=>load(true)));$('.w-navstrip',header).replaceChildren(el('span',{class:'w-category-status'},'Kategori belum dapat dimuat.'));$('.w-mobile-category-links',header).replaceChildren(errorState(e,()=>load(true)));}
  };load();
}
function mountFooter(){footer.replaceChildren(el('footer',{class:'w-footer'},el('div',{class:'w-container'},el('div',{},link('/',logo(),{'aria-label':'Beranda Walatra Herbal'}),el('small',{},'Produk dan kategori mengikuti katalog Walatra Herbal.')),el('nav',{class:'w-footer-links','aria-label':'Informasi lainnya'},link('/product/','Katalog'),link('/blog/','Artikel'),link('/health-tools/','Cek Kesehatan'),link('/about-us/','Tentang Kami'),link('/contactus/','Hubungi Kami')))));if(!$('.w-mobile-bottom-nav'))mobileNavigation();}
function errorState(error,retry,titleTag='h2'){
  const notFound=error.status===404;
  const node=el('div',{class:'w-state',role:'alert'},el(titleTag,{},notFound?'Halaman tidak ditemukan':'Data belum dapat dimuat'),el('p',{},error.message||'Silakan coba lagi.'));
  if(error.errors)for(const messages of Object.values(error.errors))node.append(el('p',{class:'w-errors'},Array.isArray(messages)?messages.join(' '):String(messages)));
  if(notFound){node.append(link('/product/','Kembali ke katalog',{class:'w-button'}));return node;}
  notify({icon:'error',title:'Data belum dapat dimuat',text:error.message||'Silakan coba lagi.'});
  const button=el('button',{type:'button',class:'w-button',onclick:retry},'Coba lagi');node.append(button);
  if(error.retryAt>Date.now()){
    const tick=()=>{if(!button.isConnected)return;const seconds=Math.ceil((error.retryAt-Date.now())/1000);button.disabled=seconds>0;button.textContent=seconds>0?`Coba lagi dalam ${seconds} detik`:'Coba lagi';if(seconds>0)setTimeout(tick,1000);};
    button.disabled=true;button.textContent=`Coba lagi dalam ${Math.ceil((error.retryAt-Date.now())/1000)} detik`;setTimeout(tick,1000);
  }
  return node;
}
function state(text){return el('div',{class:'w-state',role:'status'},text);}
function section(title,body,more){return el('section',{class:'w-section'},el('div',{class:'w-section-head'},el('h2',{},title),more?link(more,'Lihat Semua'):null),body);}
function breadcrumb(parts){return el('nav',{class:'w-breadcrumb','aria-label':'Breadcrumb'},link('/','Beranda'),...parts.flatMap(([text,href])=>['/',href?link(href,text):el('span',{'aria-current':'page'},text)]));}
function categoryCards(items,scroll=false){return el('div',{class:`w-category-grid${scroll?' w-category-carousel':''}`,tabindex:scroll?'0':null,'aria-label':scroll?'Daftar kategori, geser ke samping':null},...items.map(c=>link(categoryHref(c),[categoryIcon(c),el('span',{},c.name),Number.isFinite(c.product_count)?el('span',{class:'w-category-count'},`${c.product_count} produk`):null],{class:'w-category-card'})));}
function card(item){
  const urls=imageURLs({...item.image,image_url:item.image_url},apiBase,true);
  return el('article',{class:'w-product-card','data-item-key':itemKey(item)},link(detailURL(item),[el('div',{class:'w-card-media'},picture(urls,item.name)),el('div',{class:'w-card-body'},el('span',{class:'w-item-type'},item.type==='bundle'?'Bundle':'Produk'),el('h3',{class:'w-product-name'},item.name),el('div',{class:'w-price'},itemPrice(item)))],{class:'w-card-link'}),item.store?link('/product/?'+new URLSearchParams({store:item.store.slug}),el('span',{},item.store.name),{class:'w-store-name',style:'padding:0 12px 12px'}):null);
}
function grid(items,list=false){return items.length?el('div',{class:`w-grid${list?' w-list-grid':''}`},...items.map(card)):state('Belum ada produk atau bundle yang sesuai. Ubah pencarian atau filter.');}
function bannerImage(item,eager=false){
  const src=mediaURL(item.image_url,apiBase);
  const image=el('img',{class:'w-banner-image',src,alt:item.name||'Banner Walatra Herbal',loading:eager?'eager':'lazy',fetchpriority:eager?'high':null,decoding:'async'});
  image.addEventListener('error',()=>image.closest('.w-banner-card')?.remove(),{once:true});
  const href=mediaURL(item.cta_url,apiBase);
  return href?link(href,image,{class:'w-banner-card',target:item.open_in_new_tab===true?'_blank':null,rel:item.open_in_new_tab===true?'noopener noreferrer':null,'aria-label':item.name||'Lihat promo'}):el('div',{class:'w-banner-card'},image);
}
function archivedBanner(item,eager=false){
  return el('img',{class:'w-banner-image',src:item.src,alt:item.alt||'Banner arsip',width:item.width,height:item.height,loading:eager?'eager':'lazy',fetchpriority:eager?'high':null,decoding:'async'});
}
async function archivedHomeBanners(target,signal){
  try{
    const response=await fetch('/banners/manifest.json',{signal});if(!response.ok)throw new Error('Banner arsip belum tersedia');const data=await response.json();if(signal.aborted)return;
    const hero=data.hero||[];if(!hero.length){target.remove();return;}
    let current=0;const image=archivedBanner(hero[0],true),dots=el('div',{class:'w-banner-dots','aria-label':'Pilih banner'});
    const show=index=>{current=(index+hero.length)%hero.length;const item=hero[current];image.src=item.src;image.alt=item.alt;image.width=item.width;image.height=item.height;dots.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===current)));};
    const frame=el('div',{class:'w-banner-hero',role:'region','aria-label':'Banner beranda',onkeydown:e=>{if(e.key==='ArrowRight'){e.preventDefault();show(current+1,1);}if(e.key==='ArrowLeft'){e.preventDefault();show(current-1,-1);}}},image);
    if(hero.length>1){frame.append(el('button',{type:'button',class:'w-banner-arrow w-banner-prev','aria-label':'Banner sebelumnya',onclick:()=>show(current-1,-1)},'‹'),el('button',{type:'button',class:'w-banner-arrow w-banner-next','aria-label':'Banner berikutnya',onclick:()=>show(current+1,1)},'›'));hero.forEach((_,i)=>dots.append(el('button',{type:'button',class:'w-banner-dot','aria-label':`Banner ${i+1}`,'aria-pressed':String(i===0),onclick:()=>{const forward=(i-current+items.length)%items.length;show(i,forward<=items.length/2?1:-1);}},el('span',{'aria-hidden':'true'}))));frame.append(dots);}
    target.replaceChildren(el('div',{class:'w-banner-layout'},frame,el('div',{class:'w-banner-side'},...(data.side||[]).slice(0,2).map(item=>archivedBanner(item)))),...(data.strip||[]).map(item=>el('div',{class:'w-banner-strip'},archivedBanner(item))),el('small',{class:'w-banner-note'},'Materi promosi arsip sementara.'));
    const extra=$('[data-extra-banners]');if(extra)extra.replaceChildren(el('div',{class:'w-banner-mini'},...[...(data.mini||[]),...(data.bottom||[])].map(item=>archivedBanner(item))));
  }catch(e){if(!signal.aborted)target.remove();}
}
function bannerCarousel(items,className,label,autoAdvanceMs=0){
  const frame=el('div',{class:className,role:'region','aria-label':label,tabindex:items.length>1?'0':null});
  if(!items.length)return frame;
  let current=0,card=bannerImage(items[0],true);frame.append(card);
  let sliding=false;
  const show=(index,direction=1)=>{
    if(sliding)return;
    const nextIndex=(index+items.length)%items.length;if(nextIndex===current)return;current=nextIndex;const next=bannerImage(items[current],true);const previous=card;
    const isMain=className==='w-banner-hero',isSecondary=className.startsWith('w-banner-secondary');
    if((isMain||isSecondary)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      const enterClass=isMain?(direction>0?'w-banner-slide-enter-right':'w-banner-slide-enter-left'):(direction>0?'w-banner-slide-enter-down':'w-banner-slide-enter-up');
      const exitClass=isMain?(direction>0?'w-banner-slide-exit-left':'w-banner-slide-exit-right'):(direction>0?'w-banner-slide-exit-down':'w-banner-slide-exit-up');
      sliding=true;next.classList.add(enterClass);frame.append(next);
      let finished=false;const finish=()=>{if(finished)return;finished=true;previous.remove();next.classList.remove('w-banner-slide-enter-right','w-banner-slide-enter-left','w-banner-slide-enter-down','w-banner-slide-enter-up','w-banner-slide-active');card=next;sliding=false;};
      next.addEventListener('transitionend',event=>{if(event.target===next&&event.propertyName==='transform')finish();});setTimeout(finish,550);
      requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!frame.isConnected)return;next.classList.add('w-banner-slide-active');previous.classList.add(exitClass);}));
    }else{previous.replaceWith(next);card=next;}
    frame.querySelectorAll('.w-banner-dot').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===current)));
  };
  if(items.length>1){
    frame.addEventListener('keydown',e=>{
      if(className.startsWith('w-banner-secondary')){if(e.key==='ArrowDown'){e.preventDefault();show(current+1,1);}if(e.key==='ArrowUp'){e.preventDefault();show(current-1,-1);}}
      else{if(e.key==='ArrowRight'){e.preventDefault();show(current+1,1);}if(e.key==='ArrowLeft'){e.preventDefault();show(current-1,-1);}}
    });
    if(className==='w-banner-hero'){
      let touchStart=null,suppressClick=false;
      frame.addEventListener('pointerdown',event=>{if(event.pointerType==='touch')touchStart={x:event.clientX,y:event.clientY};});
      frame.addEventListener('pointerup',event=>{
        if(!touchStart||event.pointerType!=='touch')return;
        const dx=event.clientX-touchStart.x,dy=event.clientY-touchStart.y;touchStart=null;
        if(Math.abs(dx)<45||Math.abs(dx)<=Math.abs(dy))return;
        suppressClick=true;show(current+(dx<0?1:-1),dx<0?1:-1);setTimeout(()=>{suppressClick=false;},500);
      });
      frame.addEventListener('pointercancel',()=>{touchStart=null;});
      frame.addEventListener('click',event=>{if(suppressClick){event.preventDefault();event.stopPropagation();suppressClick=false;}},true);
      frame.append(el('button',{type:'button',class:'w-banner-arrow w-banner-prev','aria-label':`${label} sebelumnya`,onclick:()=>show(current-1,-1)},'‹'),el('button',{type:'button',class:'w-banner-arrow w-banner-next','aria-label':`${label} berikutnya`,onclick:()=>show(current+1,1)},'›'));
    }
    if(className==='w-banner-hero'){const dots=el('div',{class:'w-banner-dots','aria-label':`Pilih ${label.toLowerCase()}`});items.forEach((_,i)=>dots.append(el('button',{type:'button',class:'w-banner-dot','aria-label':`${label} ${i+1}`,'aria-pressed':String(i===0),onclick:()=>{const forward=(i-current+items.length)%items.length;show(i,forward<=items.length/2?1:-1);}},el('span',{'aria-hidden':'true'}))));frame.append(dots);}
    if(autoAdvanceMs>0&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      let timer=null;
      const stop=()=>{if(timer!==null){clearInterval(timer);timer=null;}};
      const start=()=>{if(timer===null&&!document.hidden)timer=setInterval(()=>show(current+1,1),autoAdvanceMs);};
      frame.addEventListener('mouseenter',stop);frame.addEventListener('mouseleave',start);frame.addEventListener('focusin',stop);
      frame.addEventListener('focusout',()=>queueMicrotask(()=>{if(!frame.contains(document.activeElement))start();}));
      const visibility=()=>document.hidden?stop():start();document.addEventListener('visibilitychange',visibility);
      const cleanup=setInterval(()=>{if(!frame.isConnected){stop();clearInterval(cleanup);document.removeEventListener('visibilitychange',visibility);}},3000);start();
    }
  }
  return frame;
}
async function homeBanners(target,signal){
  let response;
  try{response=await banners(signal);}catch(e){if(signal.aborted)return;await archivedHomeBanners(target,signal);return;}
  if(signal.aborted)return;
  if(!Array.isArray(response.data)){await archivedHomeBanners(target,signal);return;}
  const items=response.data.filter(item=>mediaURL(item.image_url,apiBase)&&['main','secondary_top','secondary_bottom'].includes(item.position));
  if(!items.length){await archivedHomeBanners(target,signal);return;}
  const byPosition=position=>items.filter(item=>item.position===position);
  const mainItems=byPosition('main'),topItems=byPosition('secondary_top'),bottomItems=byPosition('secondary_bottom');
  const hero=bannerCarousel(mainItems,'w-banner-hero','Banner utama',3000);
  const top=bannerCarousel(topItems,'w-banner-secondary w-banner-secondary-top','Banner kanan atas',7000);
  const bottom=bannerCarousel(bottomItems,'w-banner-secondary w-banner-secondary-bottom','Banner kanan bawah',7000);
  const side=el('div',{class:'w-banner-side'},top,bottom);
  target.replaceChildren(el('div',{class:'w-banner-layout'},hero,side));
}
async function home(signal,container){
  document.title='Walatra Herbal | Produk dan Bundle';
  const banners=el('section',{class:'w-home-banners','aria-label':'Banner beranda'});
  container.append(el('h1',{class:'w-sr-only'},'Produk Herbal Walatra'),banners);
  const cats=state('Memuat kategori…'),latest=state('Memuat produk terbaru…');container.append(section('Belanja Sesuai Kategori',cats),section('Produk Terbaru',latest,'/product/'));
  await Promise.allSettled([
    homeBanners(banners,signal),
    getCategories().then(items=>{if(!signal.aborted)cats.replaceWith(items.length?categoryCards(items,true):state('Kategori belum tersedia.'));}).catch(e=>{if(!signal.aborted)cats.replaceWith(errorState(e,()=>render()));}),
    request('/catalog',new URLSearchParams({sort:'latest',per_page:'10',page:'1'}),signal).then(r=>{if(!signal.aborted)latest.replaceWith(grid(r.data));}).catch(e=>{if(!signal.aborted)latest.replaceWith(errorState(e,()=>render()));})
  ]);
}
function option(value,text,selected){return el('option',{value,selected},text);}
function field(label,name,input){input.id=`w-filter-${name}`;return el('div',{class:'w-field'},el('label',{for:input.id},label),input);}
function filterForm(params,cats,categorySlug){
  const input=(name,attrs={})=>el('input',{name,value:params.get(name)||'',...attrs});
  const catOptions=items=>items.flatMap(c=>[option(c.slug,c.name,params.get('category')===c.slug),...catOptions(c.children||[])]);
  const controls=[field('Jenis','type',el('select',{name:'type'},option('','Produk dan bundle',!params.get('type')),option('product','Produk',params.get('type')==='product'),option('bundle','Bundle',params.get('type')==='bundle')))];
  if(!categorySlug)controls.push(field('Kategori','category',el('select',{name:'category'},option('','Semua kategori',!params.get('category')),...catOptions(cats))));
  controls.push(field('Toko','store',input('store',{type:'text',maxlength:255,placeholder:'contoh: toko-utama'})),field('Harga minimum','min_price',input('min_price',{type:'number',min:0,step:'any',inputmode:'decimal'})),field('Harga maksimum','max_price',input('max_price',{type:'number',min:0,step:'any',inputmode:'decimal'})),field('Urutkan','sort',el('select',{name:'sort'},...Object.entries(sorts).map(([value,name])=>option(value,name,params.get('sort')===value)))),field('Per halaman','per_page',el('select',{name:'per_page'},...[15,30,50].map(n=>option(n,n,Number(params.get('per_page'))===n)))));
  const errors=el('div',{class:'w-errors',role:'alert'});
  const resetParams=new URLSearchParams();if(params.get('q'))resetParams.set('q',params.get('q'));
  const form=el('form',{onsubmit:e=>{e.preventDefault();const values=new URLSearchParams(new FormData(form));for(const [k,v] of [...values])if(!v)values.delete(k);if(params.get('q'))values.set('q',params.get('q'));if(categorySlug)values.set('category',categorySlug);const min=values.get('min_price'),max=values.get('max_price');if(min!==null&&max!==null&&Number(max)<Number(min)){const message='Harga maksimum harus lebih besar atau sama dengan harga minimum.';errors.textContent=message;notify({icon:'warning',title:'Rentang harga tidak valid',text:message});return;}errors.textContent='';values.set('page','1');go(location.pathname+'?'+values);}},...controls,errors,el('div',{class:'w-filter-actions'},el('button',{type:'submit',class:'w-button'},'Terapkan'),link(location.pathname+(resetParams.size?'?'+resetParams:''),'Reset')));
  return el('aside',{class:'w-filters','aria-label':'Filter katalog'},el('h2',{},'Filter'),form);
}
function pagination(meta,params){
  const current=Number(meta.current_page),last=Number(meta.last_page);if(!Number.isFinite(last)||last<=1)return null;
  const pages=[...new Set([1,current-1,current,current+1,last].filter(n=>n>=1&&n<=last))].sort((a,b)=>a-b);
  const nav=el('nav',{class:'w-pagination','aria-label':'Halaman katalog'});
  const pageLink=(n,label)=>{const p=new URLSearchParams(params);p.set('page',n);return link(location.pathname+'?'+p,label,{'aria-label':typeof label==='number'?`Halaman ${n}`:label});};
  if(current>1)nav.append(pageLink(current-1,'Sebelumnya'));
  let prev=0;for(const n of pages){if(prev&&n-prev>1)nav.append(el('span',{'aria-hidden':'true'},'…'));nav.append(n===current?el('span',{'aria-current':'page'},n):pageLink(n,n));prev=n;}
  if(current<last)nav.append(pageLink(current+1,'Berikutnya'));return nav;
}
async function listing(signal,container,categorySlug){
  const params=paramsFromURL(location.href);if(categorySlug)params.set('category',categorySlug);
  let cat=null;
  if(categorySlug){const r=await request('/catalog/categories/'+encodeURIComponent(categorySlug),new URLSearchParams(),signal);cat=r.data;}
  let cats=[];try{cats=await getCategories();}catch{/* The catalog can still load when navigation is unavailable. */}
  if(signal.aborted)return;
  const title=cat?.name||(location.pathname.startsWith('/search')?'Hasil Pencarian':'Semua Produk dan Bundle');document.title=`${title} | Walatra Herbal`;
  container.append(breadcrumb(cat?[[cat.parent?.name,cat.parent?categoryHref(cat.parent):null],[cat.name,null]].filter(x=>x[0]):[[title,null]]),el('h1',{class:'w-heading'},title));
  if(cat){container.append(el('div',{class:'w-category-intro'},categoryIcon(cat,true),cat.description?el('p',{class:'w-description'},cat.description):null));if(cat.children?.length)container.append(section('Subkategori',categoryCards(cat.children)));}
  const body=el('div',{},state('Memuat hasil katalog…'));container.append(el('div',{class:'w-layout'},filterForm(params,cats,categorySlug),body));
  try{
    const response=await request('/catalog',params,signal);if(signal.aborted)return;
    if(!Array.isArray(response.data)||!response.meta)throw new ApiError('Struktur pagination katalog tidak valid.');
    const {meta}=response;body.replaceChildren(el('div',{class:'w-results-head',role:'status'},el('span',{},meta.total?`${meta.from??0}–${meta.to??0} dari ${meta.total} produk`:'Tidak ada hasil')),grid(response.data,true),pagination(meta,params)||document.createTextNode(''));
  }catch(e){if(!signal.aborted)body.replaceChildren(errorState(e,()=>render()));}
}
function gallery(images,name,variants=[],selectedVariant=null){
  const entries=[...images].sort((a,b)=>(a.order??0)-(b.order??0)).map((image,i)=>({image,label:`Foto etalase${images.length>1?` ${i+1}`:''}`}));
  for(const variant of variants)if(variant.image_url)entries.push({image:{url:variant.image_url,image_url:variant.image_url},variantId:String(variant.id),label:variant.name||'Foto varian'});
  const seen=new Set(),list=entries.map(entry=>({...entry,urls:imageURLs(entry.image,apiBase)})).filter(entry=>{
    if(!entry.urls.length)return false;const key=entry.urls.at(-1);if(seen.has(key))return false;seen.add(key);return true;
  });
  const selectedIndex=list.findIndex(entry=>entry.variantId===String(selectedVariant?.id));
  let active=selectedIndex>=0?selectedIndex:0;
  const area=el('div',{class:'w-gallery-main'},list.length?picture(list[active].urls,`${name} — ${list[active].label}`,{eager:true}):placeholder());
  const originalURL=image=>mediaURL(image.url||image.image_url||image.full||image.preview||image.thumb,apiBase);
  if(list.length){const link=el('a',{class:'w-gallery-main-link',href:originalURL(list[active].image)||list[active].urls[0],target:'_blank',rel:'noopener noreferrer','aria-label':'Buka gambar asli produk di tab baru'},area.firstChild);area.replaceChildren(link);}
  const thumbs=el('div',{class:'w-thumbnails','aria-label':'Galeri produk'});
  const show=index=>{if(!list.length)return;active=index;const link=area.querySelector('.w-gallery-main-link');if(link){link.href=originalURL(list[index].image)||list[index].urls[0];link.replaceChildren(picture(list[index].urls,`${name} — ${list[index].label}`,{eager:true}));}else area.replaceChildren(picture(list[index].urls,`${name} — ${list[index].label}`,{eager:true}));thumbs.querySelectorAll('button').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));};
  list.forEach((entry,i)=>{const button=el('button',{type:'button','aria-label':`Lihat foto ${entry.label}`,'aria-pressed':i===active,onclick:()=>show(i)},picture(imageURLs(entry.image,apiBase,true),entry.label),el('span',{class:'w-thumb-label'},entry.label));thumbs.append(button);});
  const root=el('div',{class:'w-gallery'},area,list.length>1?thumbs:null);
  root.showVariant=id=>{const variantIndex=list.findIndex(entry=>entry.variantId===String(id));const fallbackIndex=list.findIndex(entry=>!entry.variantId);if(variantIndex>=0)show(variantIndex);else if(fallbackIndex>=0)show(fallbackIndex);};
  return root;
}
function variantPicker(variants,selected,onSelect){
  let selectedId=String(selected?.id??'');const buttons=[];
  const options=variants.map(variant=>{
    const imageURL=mediaURL(variant.image_url,apiBase);
    const children=[];
    if(imageURL){const image=el('img',{class:'w-variant-photo',src:imageURL,alt:'',loading:'lazy',decoding:'async'});image.addEventListener('error',()=>image.remove(),{once:true});children.push(image);}
    const button=el('button',{type:'button',class:'w-variant-badge','data-variant-id':variant.id,'aria-pressed':String(String(variant.id)===selectedId),onclick:()=>{if(String(variant.id)===selectedId)return;selectedId=String(variant.id);buttons.forEach(b=>b.setAttribute('aria-pressed',String(b===button)));onSelect(variant);}},...children,el('span',{class:'w-variant-name'},variant.name));buttons.push(button);return button;
  });
  return el('div',{class:'w-variant-picker'},el('span',{class:'w-variant-label'},'Varian'),el('div',{class:'w-variant-options',role:'group','aria-label':'Pilih varian'},...options));
}
function variantMeta(variant){
  const nodes=[el('p',{class:'w-detail-meta'},`SKU: ${variant.sku||'Belum tersedia'}`)];
  if(variant.weight_grams!=null)nodes.push(el('p',{class:'w-detail-meta'},`Berat: ${variant.weight_grams} gram`));
  if(variant.attributes&&typeof variant.attributes==='object')for(const [key,value] of Object.entries(variant.attributes))nodes.push(el('p',{class:'w-detail-meta'},`${key}: ${typeof value==='object'?JSON.stringify(value):value}`));
  return nodes;
}
async function detail(signal,container,type,slug){
  const response=await request(`/catalog/${type==='bundle'?'bundles':'products'}/${encodeURIComponent(slug)}`,new URLSearchParams(),signal);if(signal.aborted)return;
  const data=response.data,params=new URLSearchParams(location.search),chosen=selection(data,params,type);
  document.title=`${data.name} | Walatra Herbal`;
  const normalized=new URL(location.href);if(chosen.listing)normalized.searchParams.set('listing',chosen.listing.listing_id);else normalized.searchParams.delete('listing');if(chosen.variant)normalized.searchParams.set('variant',chosen.variant.id);else normalized.searchParams.delete('variant');history.replaceState(history.state,'',normalized);
  const price=el('div',{class:'w-price','data-detail-price':true},money(type==='bundle'?data.price:chosen.variant?.price));
  const info=el('div',{class:'w-detail-info'},el('span',{class:'w-item-type'},type==='bundle'?'Bundle':'Produk'),el('h1',{},data.name),price);
  const meta=el('div',{class:'w-detail-meta'});if(data.bpom_number)meta.append(el('p',{},`BPOM: ${data.bpom_number}`));
  if(data.categories?.length)meta.append(el('p',{},'Kategori: ',...data.categories.flatMap((c,i)=>[i?', ':null,link(categoryHref(c),c.name)])));
  info.append(meta);
  if(chosen.listing){
    info.append(el('div',{class:'w-detail-store'},el('span',{class:'w-detail-store-label'},'Penawaran toko'),el('span',{class:'w-detail-store-name'},chosen.listing.store?.name||'Toko')));
    const locationText=[chosen.listing.store?.city,chosen.listing.store?.province].filter(Boolean).join(', ');if(locationText)info.append(el('p',{class:'w-detail-meta'},locationText));
  }else info.append(state('Belum ada penawaran toko untuk produk ini.'));
  let productGallery=null;
  if(type==='product'&&data.variants?.length){
    const variantFacts=el('div',{class:'w-variant-meta'},...variantMeta(chosen.variant||{}));
    productGallery=gallery(chosen.listing?.images||[],data.name,data.variants,chosen.variant);
    const picker=variantPicker(data.variants,chosen.variant,variant=>{
      const u=new URL(location.href);u.searchParams.set('variant',variant.id);history.pushState({...history.state,scrollY:window.scrollY},'',u.pathname+u.search+u.hash);
      price.textContent=money(variant.price);variantFacts.replaceChildren(...variantMeta(variant));productDetail.setAttribute('data-variant-id',String(variant.id));productGallery.showVariant(variant.id);
    });
    info.append(picker,variantFacts);
  }
  const description=chosen.listing?.description;let detailDescription=null;
  if(description){const content=[el('h2',{},'Deskripsi'),renderDescription(description)];if(type==='product')detailDescription=el('div',{class:'w-detail-description'},...content);else info.append(...content);}
  if(type==='bundle')info.append(el('h2',{style:'font-size:18px;margin-top:24px'},'Isi Bundle'),el('ul',{class:'w-components'},...(data.items||[]).map(item=>el('li',{},link(`/product/${encodeURIComponent(item.product.slug)}/`,item.product.name),el('div',{class:'w-detail-meta'},`${item.quantity} × ${item.variant?.name||''}`)))));
  const productDetail=el('section',{class:`w-detail${detailDescription?'':' w-detail-no-description'}`,'data-listing-id':chosen.listing?.listing_id,'data-variant-id':chosen.variant?.id},productGallery||gallery(chosen.listing?.images||[],data.name,[],null),info,detailDescription);
  container.append(breadcrumb([['Katalog','/product/'],[data.name,null]]),productDetail);
  const related=state('Memuat produk lainnya…');container.append(section(data.categories?.length?'Produk dalam Kategori yang Sama':'Produk Terbaru',related));
  const p=new URLSearchParams({per_page:'5',sort:'latest'});if(data.categories?.[0])p.set('category',data.categories[0].slug);
  try{const r=await request('/catalog',p,signal);if(!signal.aborted)related.replaceWith(grid(r.data.filter(i=>!(i.type===type&&String(i.id)===String(data.id)))));}catch(e){if(!signal.aborted)related.replaceWith(errorState(e,()=>render()));}
}
function authNotice(error,title='Autentikasi gagal'){
  const message=error.status>=500?'Layanan sedang bermasalah. Silakan coba lagi nanti.':error.message||'Silakan coba lagi.';
  return notify({icon:error.status===429?'warning':'error',title,text:message});
}
function setRetryCountdown(button,seconds,label,canEnable=()=>true){
  const until=Date.now()+Math.max(1,Number(seconds)||1)*1000;
  button.disabled=true;
  const tick=()=>{
    if(!button.isConnected)return;
    const remaining=Math.ceil((until-Date.now())/1000);
    if(remaining<=0){button.textContent=label;button.disabled=!canEnable();return;}
    button.textContent=`Coba lagi dalam ${remaining} detik`;
    setTimeout(tick,1000);
  };
  tick();
}
const challengeStorageKey='walatra.auth.challenge';
function readChallenge(){try{return JSON.parse(sessionStorage.getItem(challengeStorageKey)||'null');}catch{return null;}}
function normalizeWhatsApp(value){
  let digits=value.replace(/\D/g,'');
  if(digits.startsWith('62'))return `+${digits}`;
  if(digits.startsWith('0'))digits=digits.slice(1);
  return `+62${digits}`;
}
function challengeFromResponse(data,phone){
  const id=Number(data?.challenge_id),expires=Date.parse(data?.expires_at||'');
  if(!Number.isSafeInteger(id)||id<1||!Number.isFinite(expires))throw new AuthError('Respons OTP tidak lengkap. Silakan coba lagi.',502);
  const statuses=new Set(['skipped','pending','sent','delivered','unknown','failed']);
  return {phone,challenge_id:id,expires_at:data.expires_at,delivery_status:statuses.has(data.delivery_status)?data.delivery_status:'unknown'};
}
function mountOTPLogin(){
  const brand=el('aside',{class:'w-login-brand-panel'},link('/',logo(),{'aria-label':'Beranda Walatra Herbal'}),el('div',{class:'w-login-brand-copy'},el('span',{class:'w-login-brand-kicker'},'WALATRA HERBAL'),el('p',{class:'w-login-brand-title'},'Masuk lebih mudah dengan WhatsApp'),el('p',{},'Gunakan nomor WhatsApp Anda untuk masuk ke akun Walatra Herbal.')));
  const panel=el('section',{class:'w-login-form-panel','aria-labelledby':'w-login-otp-title'});
  const layout=el('div',{class:'w-login-otp-layout'},brand,panel);
  const page=el('div',{class:'w-login-otp-page'},layout);
  const showPhone=(previous='')=>{
    const status=el('p',{class:'w-login-otp-status',role:'status','aria-live':'polite',hidden:true});
    const phone=el('input',{id:'w-login-whatsapp',name:'phone',type:'tel',inputmode:'tel',autocomplete:'tel-national',placeholder:'812 3456 7890',maxlength:20,minlength:8,required:true,value:previous,'aria-label':'Nomor WhatsApp',oninput:()=>{send.disabled=phone.value.replace(/\D/g,'').length<8;}});
    const send=el('button',{class:'w-login-otp-submit',type:'submit',disabled:phone.value.replace(/\D/g,'').length<8},'Kirim kode OTP');
    const row=el('div',{class:'w-login-phone-row'},el('span',{class:'w-login-country-code','aria-label':'Kode negara Indonesia'},el('span',{'aria-hidden':'true'},'🇮🇩'),el('span',{},'+62')) ,phone);
    const form=el('form',{class:'w-login-otp-form',onsubmit:async event=>{
      event.preventDefault();if(send.disabled)return;send.disabled=true;send.textContent='Meminta kode…';
      try{
        const normalizedPhone=normalizeWhatsApp(phone.value.trim());
        const response=await requestOTP(normalizedPhone),data=response.data;
        const challenge=challengeFromResponse(data,normalizedPhone);
        sessionStorage.setItem(challengeStorageKey,JSON.stringify(challenge));showOTP(challenge);
        const failed=challenge.delivery_status==='failed';
        notify({icon:failed?'warning':'info',title:failed?'Pengiriman OTP gagal':'Periksa WhatsApp',text:response.message||'Masukkan kode verifikasi yang dikirim ke WhatsApp Anda.'});
      }catch(error){send.disabled=phone.value.replace(/\D/g,'').length<8;send.textContent='Kirim kode OTP';authNotice(error,error.status===429?'Terlalu banyak permintaan':'OTP tidak dapat diminta');if(error.status===429)setRetryCountdown(send,error.retryAfter,'Kirim kode OTP',()=>phone.value.replace(/\D/g,'').length>=8);}
    }},el('label',{for:'w-login-whatsapp'},'Nomor WhatsApp'),row,send,status);
    panel.replaceChildren(el('h1',{id:'w-login-otp-title'},'Masukkan nomor WhatsApp'),el('p',{class:'w-login-otp-copy'},'Kami akan mengirimkan kode verifikasi ke nomor WhatsApp kamu.'),form);
  };
  const showOTP=challenge=>{
    const deliveryFailed=challenge.delivery_status==='failed';
    const expiresAt=Date.parse(challenge.expires_at);
    const expiresLabel=Number.isFinite(expiresAt)?new Intl.DateTimeFormat('id-ID',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Jakarta'}).format(new Date(expiresAt)):'waktu yang ditentukan';
    const otpStatus=el('p',{class:'w-login-otp-status',role:'status','aria-live':'polite'},deliveryFailed?'Pengiriman kode gagal. Minta kode baru untuk melanjutkan.':`Masukkan 6 digit kode verifikasi yang dikirim ke ${challenge.phone}.`);
    const otp=el('input',{id:'w-login-otp',name:'otp',type:'text',inputmode:'numeric',autocomplete:'one-time-code',pattern:'[0-9]{6}',maxlength:6,minlength:6,required:true,placeholder:'••••••','aria-label':'Kode OTP',oninput:()=>{otp.value=otp.value.replace(/\D/g,'').slice(0,6);verify.disabled=otp.value.length!==6||expired();}});
    const expired=()=>!Number.isFinite(expiresAt)||expiresAt<=Date.now();
    const verify=el('button',{class:'w-login-otp-submit',type:'submit',disabled:true},'Verifikasi dan masuk');
    const resend=el('button',{class:'w-login-secondary-button',type:'button',onclick:async()=>{
      resend.disabled=true;resend.textContent='Meminta kode baru…';
      try{
        const response=await requestOTP(challenge.phone),data=response.data;
        const next=challengeFromResponse(data,challenge.phone);
        sessionStorage.setItem(challengeStorageKey,JSON.stringify(next));showOTP(next);
        notify({icon:next.delivery_status==='failed'?'warning':'info',title:next.delivery_status==='failed'?'Pengiriman OTP gagal':'Kode baru diminta',text:response.message||'Periksa WhatsApp Anda.'});
      }catch(error){resend.disabled=false;resend.textContent='Kirim ulang kode';authNotice(error,error.status===429?'Terlalu banyak permintaan':'Kode baru tidak dapat diminta');if(error.status===429)setRetryCountdown(resend,error.retryAfter,'Kirim ulang kode');}
    }},'Kirim ulang kode');
    const change=el('button',{class:'w-login-secondary-button',type:'button',onclick:()=>{sessionStorage.removeItem(challengeStorageKey);showPhone(challenge.phone);}},'Ganti nomor WhatsApp');
    const form=el('form',{class:'w-login-otp-form',onsubmit:async event=>{
      event.preventDefault();if(expired()){otpStatus.textContent='Kode sudah kedaluwarsa. Minta kode baru untuk melanjutkan.';verify.disabled=true;return;}
      if(otp.value.length!==6)return;verify.disabled=true;verify.textContent='Memverifikasi…';
      try{
        const result=await verifyOTP({phone:challenge.phone,challenge_id:Number(challenge.challenge_id),otp:otp.value,device_name:'Walatra Herbal Web'});
        sessionStorage.removeItem(challengeStorageKey);
        await notify({icon:'success',title:'Berhasil masuk',text:result.message||'Verifikasi berhasil.'});
        const required=result.data?.requires_profile_completion===true;
        const next=new URLSearchParams(location.search).get('next');
        const destination=required?'/profile/?complete=1':safeNext(next)||'/profile/';
        location.assign(destination);
      }catch(error){verify.disabled=expired();verify.textContent='Verifikasi dan masuk';authNotice(error,error.status===429?'Terlalu banyak percobaan':'Kode tidak dapat diverifikasi');if(error.status===429)setRetryCountdown(verify,error.retryAfter,'Verifikasi dan masuk',()=>otp.value.length===6&&!expired());}
    }},el('label',{for:'w-login-otp'},'Kode OTP'),otp,verify,otpStatus,el('div',{class:'w-login-auth-actions'},resend,change));
    panel.replaceChildren(el('h1',{id:'w-login-otp-title'},'Verifikasi WhatsApp'),el('p',{class:'w-login-otp-copy'},deliveryFailed?'Pengiriman OTP gagal. Gunakan kirim ulang untuk meminta kode baru.':`Kode verifikasi berlaku sampai pukul ${expiresLabel} WIB.`),form);
    if(expired()){otpStatus.textContent='Kode sudah kedaluwarsa. Minta kode baru untuk melanjutkan.';}
  };
  main.replaceChildren(page);
  const challenge=readChallenge();if(challenge?.challenge_id&&challenge?.expires_at&&challenge?.phone)showOTP(challenge);else showPhone();
}
function safeNext(value){
  if(!value||!value.startsWith('/')||value.startsWith('//'))return null;
  try{const url=new URL(value,location.origin);return url.origin===location.origin&&!['/login','/profile'].includes(url.pathname.replace(/\/$/,''))?url.pathname+url.search+url.hash:null;}catch{return null;}
}
async function mountProfilePage(version=++renderVersion){
  document.title='Profil Saya | Walatra Herbal';
  const container=el('div',{class:'w-container w-profile-page'},state('Memuat profil…'));main.replaceChildren(container);main.setAttribute('aria-busy','true');
  try{
    const response=await currentUser(),data=response.data,user=data.user;
    if(version!==renderVersion)return;
    if(!user)throw new AuthError('Data profil tidak tersedia.',502);
    const complete=data.requires_profile_completion===true||new URLSearchParams(location.search).get('complete')==='1'&&!user.profile_completed_at;
    const navigation=profileNavigation(user,'profile',version);
    const fields=el('div',{class:'w-profile-fields'},
      el('div',{class:'w-profile-field'},el('span',{class:'w-profile-field-icon'},icon('user')),el('div',{class:'w-profile-field-copy'},el('span',{},'Nama lengkap'),el('strong',{},user.name||'Belum diisi'))),
      el('div',{class:'w-profile-field'},el('span',{class:'w-profile-field-icon'},icon('phone')),el('div',{class:'w-profile-field-copy'},el('span',{},'Nomor WhatsApp'),el('strong',{},user.phone||'Belum tersedia'))),
      user.email?el('div',{class:'w-profile-field'},el('span',{class:'w-profile-field-icon'},icon('mail')),el('div',{class:'w-profile-field-copy'},el('span',{},'Email'),el('strong',{},user.email))):null
    );
    const heading=el('header',{class:'w-profile-card-heading'},
      el('div',{},el('p',{class:'w-profile-eyebrow'},'AKUN WALATRA'),el('h1',{},complete?'Lengkapi profil':'Profil Saya'),el('p',{class:'w-profile-copy'},complete?'Lengkapi nama agar akunmu lebih mudah dikenali.':'Kelola informasi dasar akun Walatra Herbal.')),
      complete?el('span',{class:'w-profile-status'},'Perlu dilengkapi'):null
    );
    const section=el('section',{class:'w-account-card'},heading,fields);
    if(complete){
      const name=el('input',{id:'w-profile-name',name:'name',type:'text',autocomplete:'name',minlength:2,maxlength:255,required:true,value:user.name||''});
      const save=el('button',{class:'w-button',type:'submit'},'Simpan profil');
      section.append(el('form',{class:'w-profile-form',onsubmit:async event=>{event.preventDefault();if(!name.reportValidity())return;save.disabled=true;save.textContent='Menyimpan…';try{await updateProfile(name.value.trim());if(version!==renderVersion)return;const refreshed=await currentUser();if(version!==renderVersion)return;await notify({icon:'success',title:'Profil tersimpan',text:refreshed.message||'Nama profil berhasil diperbarui.'});if(version===renderVersion)location.replace('/profile/');}catch(error){if(version!==renderVersion)return;save.disabled=false;save.textContent='Simpan profil';authNotice(error,'Profil belum tersimpan');}},},el('label',{for:'w-profile-name'},'Nama lengkap'),name,save));
    }
    container.classList.add('w-profile-page-ready');container.replaceChildren(navigation,section);
  }catch(error){
    if(version!==renderVersion)return;
    if(error.status===401){location.replace('/login/?next='+encodeURIComponent('/profile/'));return;}
    container.replaceChildren(el('section',{class:'w-account-card w-profile-error'},el('h1',{},'Profil belum dapat dimuat'),el('p',{class:'w-profile-copy'},error.message||'Silakan coba lagi.'),el('button',{class:'w-button',type:'button',onclick:()=>mountProfilePage()},'Coba lagi')));
    authNotice(error,'Profil belum dapat dimuat');
  }finally{if(version===renderVersion)main.removeAttribute('aria-busy');}
}
function profileNavigation(user,active,version){
  const initials=(user.name||'W').trim().split(/\s+/).slice(0,2).map(part=>part[0]).join('').toUpperCase();
  const identity=el('div',{class:'w-profile-identity'},el('span',{class:'w-profile-avatar','aria-hidden':'true'},initials),el('div',{class:'w-profile-identity-copy'},el('strong',{},user.name||'Profil belum lengkap'),el('span',{},user.phone||'Nomor WhatsApp belum tersedia')));
  const item=(path,label,shape,key)=>el('a',{class:`w-profile-nav-item${active===key?' is-active':''}`,href:path,'aria-current':active===key?'page':null},icon(shape),el('span',{},label),icon('chevron'));
  const signout=el('button',{class:'w-profile-nav-item w-profile-logout',type:'button',onclick:async event=>{const button=event.currentTarget;button.disabled=true;try{await logout();if(version!==renderVersion)return;await notify({icon:'success',title:'Kamu sudah keluar',text:'Sesi akun telah diakhiri.'});if(version===renderVersion)location.replace('/');}catch(error){if(version!==renderVersion)return;button.disabled=false;authNotice(error,'Logout gagal');}}},icon('logout'),el('span',{},'Keluar dari akun'));
  return el('aside',{class:'w-profile-sidebar'},identity,el('nav',{'aria-label':'Menu akun'},item('/profile/','Profil Saya','user','profile'),item('/profile/addresses/','Alamat Saya','pin','addresses'),signout));
}
async function mountAddressesPage(version=++renderVersion){
  document.title='Alamat Saya | Walatra Herbal';
  const container=el('div',{class:'w-container w-profile-page'},state('Memuat alamat…'));main.replaceChildren(container);main.setAttribute('aria-busy','true');
  try{
    const session=await currentUser(),user=session.data.user;
    if(version!==renderVersion)return;
    if(!user)throw new AuthError('Data akun tidak tersedia.',502);
    const navigation=profileNavigation(user,'addresses',version);
    const content=el('div',{class:'w-address-list',role:'region','aria-live':'polite','aria-label':'Daftar alamat'});
    const add=el('button',{class:'w-button w-address-add',type:'button',onclick:()=>openAddressForm(null)},icon('plus'),el('span',{},'Tambah alamat'));
    const section=el('section',{class:'w-account-card w-addresses-card'},el('header',{class:'w-profile-card-heading'},el('div',{},el('p',{class:'w-profile-eyebrow'},'PENGIRIMAN'),el('h1',{},'Alamat Saya'),el('p',{class:'w-profile-copy'},'Simpan alamat tujuan untuk memudahkan pengiriman pesanan.')),add),content);
    container.classList.add('w-profile-page-ready');container.replaceChildren(navigation,section);
    let addresses=[];
    const loadAddresses=async()=>{
      content.setAttribute('aria-busy','true');content.replaceChildren(state('Memuat daftar alamat…'));
      try{
        const result=await listAddresses();
        if(version!==renderVersion)return;
        addresses=Array.isArray(result.data)?result.data:[];
        drawAddresses();
      }catch(error){
        if(version!==renderVersion)return;
        const retry=el('button',{class:'w-button w-outline',type:'button',onclick:loadAddresses},'Coba lagi');
        content.replaceChildren(el('div',{class:'w-address-empty'},el('h2',{},'Alamat belum dapat dimuat'),el('p',{},error.message||'Periksa koneksi lalu coba lagi.'),retry));
        if(error.status===401){location.replace('/login/?next='+encodeURIComponent('/profile/addresses/'));return;}
        authNotice(error,'Alamat belum dapat dimuat');
      }finally{if(version===renderVersion)content.removeAttribute('aria-busy');}
    };
    const drawAddresses=()=>{
      if(!addresses.length){
        content.replaceChildren(el('div',{class:'w-address-empty'},el('span',{class:'w-address-empty-icon'},icon('pin')),el('h2',{},'Belum ada alamat tersimpan'),el('p',{},'Tambahkan alamat penerima untuk menyiapkan tujuan pengiriman.'),el('button',{class:'w-button',type:'button',onclick:()=>openAddressForm(null)},'Tambah alamat')));
        return;
      }
      content.replaceChildren(el('div',{class:'w-address-cards'},...addresses.map(address=>{
        const location=[address.sub_district_name,address.district||address.district_name,address.city||address.city_name,address.province||address.province_name].filter(Boolean).join(', ');
        const lines=[address.address,location,[address.postal_code,address.address_note].filter(Boolean).join(' · ')].filter(Boolean);
        const actions=el('div',{class:'w-address-actions'},
          el('button',{class:'w-address-action',type:'button',onclick:()=>openAddressForm(address)},icon('edit'),el('span',{},'Ubah')),
          address.is_default?el('span',{class:'w-address-default-current'},icon('star'),el('span',{},'Alamat utama')):el('button',{class:'w-address-action w-address-make-default',type:'button',onclick:()=>setDefault(address)},icon('star'),el('span',{},'Jadikan utama')),
          el('button',{class:'w-address-action w-address-delete',type:'button',onclick:()=>removeAddress(address)},icon('trash'),el('span',{},'Hapus'))
        );
        return el('article',{class:`w-address-card${address.is_default?' is-default':''}`},el('div',{class:'w-address-card-top'},el('h2',{},address.label||'Alamat'),address.is_default?el('span',{class:'w-address-default-badge'},'Utama'):null),el('p',{class:'w-address-recipient'},address.name||'—'),el('p',{class:'w-address-phone'},address.phone||''),el('div',{class:'w-address-lines'},...lines.map(line=>el('p',{},line))),actions);
      })));
    };
    const mutate=async(action,successTitle,successText)=>{
      try{const result=await action();if(version!==renderVersion)return;await notify({icon:'success',title:successTitle,text:result.message||successText});if(version===renderVersion)await loadAddresses();}
      catch(error){if(version===renderVersion)authNotice(error,successTitle);}
    };
    const setDefault=address=>mutate(()=>updateAddress(address.id,{is_default:true}),'Alamat utama diperbarui','Alamat utama berhasil diperbarui.');
    const removeAddress=async address=>{
      const result=await Swal.fire({icon:'warning',title:'Hapus alamat ini?',text:`${address.label||'Alamat'} atas nama ${address.name||'penerima'} akan dihapus.`,showCancelButton:true,confirmButtonText:'Hapus alamat',cancelButtonText:'Batal',confirmButtonColor:'#a33b34',cancelButtonColor:'#64756a',customClass:{popup:'w-swal-popup',confirmButton:'w-swal-confirm'}});
      if(!result.isConfirmed)return;
      await mutate(()=>deleteAddress(address.id),'Alamat dihapus','Alamat berhasil dihapus.');
    };
    const openAddressForm=async existing=>{
      const formNotice=el('p',{class:'w-address-form-notice',role:'status','aria-live':'polite'});
      const addressLabel=el('input',{id:'w-address-label',name:'label',type:'text',maxlength:50,required:true,value:existing?.label||''});
      const recipient=el('input',{id:'w-address-name',name:'name',type:'text',autocomplete:'name',minlength:2,maxlength:255,required:true,value:existing?.name||user.name||''});
      const phone=el('input',{id:'w-address-phone',name:'phone',type:'tel',autocomplete:'tel',inputmode:'tel',maxlength:20,required:true,value:existing?.phone||user.phone||''});
      const province=el('select',{id:'w-address-province',name:'province_id',required:true,disabled:true},el('option',{value:''},'Memuat provinsi…'));
      const city=el('select',{id:'w-address-city',name:'city_id',required:true,disabled:true},el('option',{value:''},'Pilih kota/kabupaten'));
      const district=el('select',{id:'w-address-district',name:'district_id',required:true,disabled:true},el('option',{value:''},'Pilih kecamatan'));
      const subDistrict=el('select',{id:'w-address-sub-district',name:'sub_district_id',required:true,disabled:true},el('option',{value:''},'Pilih kelurahan/desa'));
      const postalCode=el('input',{id:'w-address-postal',name:'postal_code',type:'text',inputmode:'numeric',maxlength:10,required:true,value:existing?.postal_code||''});
      const street=el('textarea',{id:'w-address-street',name:'address',maxlength:1000,required:true,rows:3},existing?.address||'');
      const note=el('textarea',{id:'w-address-note',name:'address_note',maxlength:500,rows:2},existing?.address_note||'');
      const isDefault=el('input',{id:'w-address-default',name:'is_default',type:'checkbox',checked:existing?existing.is_default:addresses.length===0,disabled:existing?.is_default===true||(!existing&&addresses.length===0)});
      const isDefaultLabel=el('label',{class:'w-address-default-toggle',for:'w-address-default'},isDefault,el('span',{},existing?.is_default?'Alamat ini adalah alamat utama':'Jadikan alamat utama'));
      const save=el('button',{class:'w-button',type:'submit'},existing?'Simpan perubahan':'Simpan alamat');
      const retryLocation=el('button',{class:'w-address-location-retry',type:'button',hidden:true},'Coba muat ulang lokasi');
      const locationMessage=el('span',{});
      const locationStatus=el('div',{class:'w-address-location-status',role:'status','aria-live':'polite'},locationMessage,retryLocation);
      const form=el('form',{class:'w-address-form',onsubmit:async event=>{
        event.preventDefault();if(!form.reportValidity())return;
        const provinceOption=province.selectedOptions[0],cityOption=city.selectedOptions[0],districtOption=district.selectedOptions[0],subOption=subDistrict.selectedOptions[0];
        if(!province.value||!city.value||!district.value||!subDistrict.value){formNotice.textContent='Pilih provinsi, kota, kecamatan, dan kelurahan/desa.';return;}
        const body={label:addressLabel.value.trim(),name:recipient.value.trim(),phone:phone.value.trim(),province:provinceOption.textContent,province_id:province.value,province_name:provinceOption.textContent,city:cityOption.textContent,city_id:city.value,city_name:cityOption.textContent,district:districtOption.textContent,district_id:district.value,district_name:districtOption.textContent,sub_district_id:subDistrict.value,sub_district_name:subOption.textContent,postal_code:postalCode.value.trim(),address:street.value.trim(),address_note:note.value.trim()||null};
        if(!existing&&!addresses.length)body.is_default=true;else if(isDefault.checked&&!existing?.is_default)body.is_default=true;
        save.disabled=true;save.textContent='Menyimpan…';
        try{const result=existing?await updateAddress(existing.id,body):await createAddress(body);if(version!==renderVersion)return;await notify({icon:'success',title:existing?'Alamat diperbarui':'Alamat ditambahkan',text:result.message||'Perubahan alamat berhasil disimpan.'});if(version===renderVersion)await loadAddresses();}
        catch(error){if(version!==renderVersion)return;save.disabled=false;save.textContent=existing?'Simpan perubahan':'Simpan alamat';formNotice.textContent=error.message||'Alamat belum dapat disimpan.';authNotice(error,'Alamat belum dapat disimpan');}
      }},
        el('div',{class:'w-address-form-grid'},
          addressField('Label alamat',addressLabel),addressField('Nama penerima',recipient),addressField('Nomor telepon',phone),addressField('Provinsi',province),addressField('Kota/kabupaten',city),addressField('Kecamatan',district),addressField('Kelurahan/desa',subDistrict),addressField('Kode pos',postalCode),
          addressField('Alamat lengkap',street,'w-address-field-wide'),addressField('Catatan alamat (opsional)',note,'w-address-field-wide')
        ),locationStatus,isDefaultLabel,formNotice,
        el('div',{class:'w-address-form-actions'},el('button',{class:'w-button w-outline',type:'button',onclick:drawAddresses},'Batal'),save)
      );
      const formHeading=el('header',{class:'w-profile-card-heading'},el('div',{},el('p',{class:'w-profile-eyebrow'},'ALAMAT PENGIRIMAN'),el('h2',{},existing?'Ubah alamat':'Tambah alamat'),el('p',{class:'w-profile-copy'},'Pilih wilayah dari daftar agar alamat cocok dengan layanan pengiriman.')));
      content.replaceChildren(formHeading,form);
      const controllers={};let retryLoad=()=>{};
      const setSelect=(select,placeholder,disabled=true)=>{select.replaceChildren(el('option',{value:''},placeholder));select.value='';select.disabled=disabled;};
      const fetchLevel=async(level,params,select,idKey,nameKey,placeholder,selectedId,selectedName)=>{
        controllers[level]?.abort();const controller=new AbortController();controllers[level]=controller;
        select.disabled=true;select.replaceChildren(el('option',{value:''},'Memuat…'));retryLocation.hidden=true;
        const label=placeholder.replace(/^Pilih /,'');const query=new URLSearchParams(params);
        retryLoad=()=>fetchLevel(level,params,select,idKey,nameKey,placeholder,selectedId,selectedName);
        locationMessage.textContent=`Memuat ${label.toLowerCase()}…`;
        try{
          const response=await shippingLocations(level,query,controller.signal);if(controller.signal.aborted||version!==renderVersion)return;
          const options=Array.isArray(response.data?.locations)?response.data.locations:[];
          select.replaceChildren(el('option',{value:''},placeholder),...options.map(item=>{const option=el('option',{value:item[idKey]},item[nameKey]);if(item.postal_code)option.dataset.postalCode=item.postal_code;return option;}));
          const selected=options.find(item=>String(item[idKey])===String(selectedId??''))||options.find(item=>item[nameKey]===selectedName);
          if(selected)select.value=String(selected[idKey]);
          select.disabled=options.length===0;locationMessage.textContent=options.length?`${label} tersedia.`:`Daftar ${label.toLowerCase()} kosong.`;retryLocation.hidden=true;
        }catch(error){
          if(controller.signal.aborted||error.name==='AbortError')return;
          select.replaceChildren(el('option',{value:''},placeholder));select.disabled=true;locationMessage.textContent=error.message||`Daftar ${label.toLowerCase()} gagal dimuat.`;retryLocation.hidden=false;
        }
      };
      const loadProvinces=(id,name)=>fetchLevel('provinces',new URLSearchParams(),province,'province_id','province_name','Pilih provinsi',id,name);
      const loadCities=(id,name)=>fetchLevel('cities',{province_id:province.value},city,'city_id','city_name','Pilih kota/kabupaten',id,name);
      const loadDistricts=(id,name)=>fetchLevel('districts',{city_id:city.value},district,'district_id','district_name','Pilih kecamatan',id,name);
      const loadSubDistricts=(id,name)=>fetchLevel('sub-districts',{district_id:district.value},subDistrict,'sub_district_id','sub_district_name','Pilih kelurahan/desa',id,name);
      const abortDescendants=(levels)=>levels.forEach(level=>controllers[level]?.abort());
      province.addEventListener('change',()=>{abortDescendants(['cities','districts','sub-districts']);setSelect(city,'Pilih kota/kabupaten');setSelect(district,'Pilih kecamatan');setSelect(subDistrict,'Pilih kelurahan/desa');postalCode.value='';if(province.value)loadCities();});
      city.addEventListener('change',()=>{abortDescendants(['districts','sub-districts']);setSelect(district,'Pilih kecamatan');setSelect(subDistrict,'Pilih kelurahan/desa');postalCode.value='';if(city.value)loadDistricts();});
      district.addEventListener('change',()=>{abortDescendants(['sub-districts']);setSelect(subDistrict,'Pilih kelurahan/desa');postalCode.value='';if(district.value)loadSubDistricts();});
      subDistrict.addEventListener('change',()=>{const selected=subDistrict.selectedOptions[0];if(selected?.dataset.postalCode)postalCode.value=selected.dataset.postalCode;});
      retryLocation.addEventListener('click',()=>retryLoad());
      loadProvinces(existing?.province_id,existing?.province_name||existing?.province).then(async()=>{
        if(!existing||!province.value)return;
        await loadCities(existing.city_id,existing.city_name||existing.city);
        if(!city.value)return;
        await loadDistricts(existing.district_id,existing.district_name||existing.district);
        if(!district.value)return;
        await loadSubDistricts(existing.sub_district_id,existing.sub_district_name);
      });
    };
    const addressField=(label,input,extraClass='')=>el('div',{class:`w-address-field ${extraClass}`.trim()},el('label',{for:input.id},label),input);
    await loadAddresses();
  }catch(error){
    if(version!==renderVersion)return;
    if(error.status===401){location.replace('/login/?next='+encodeURIComponent('/profile/addresses/'));return;}
    container.replaceChildren(el('section',{class:'w-account-card w-profile-error'},el('h1',{},'Alamat belum dapat dimuat'),el('p',{class:'w-profile-copy'},error.message||'Silakan coba lagi.'),el('button',{class:'w-button',type:'button',onclick:()=>mountAddressesPage()},'Coba lagi')));
    authNotice(error,'Alamat belum dapat dimuat');
  }finally{if(version===renderVersion)main.removeAttribute('aria-busy');}
}
function owned(path){return path==='/'||/^\/(product|bundle|cat|search|login|profile)(\/|$)/.test(path);}
function go(href,{replace=false,scroll=true}={}){
  const u=new URL(href,location.href);if(u.origin!==location.origin||!owned(u.pathname)){location.assign(u.href);return;}
  history.replaceState({...history.state,scrollY:window.scrollY},'',location.href);
  history[replace?'replaceState':'pushState']({scrollY:scroll?0:window.scrollY},'',u.pathname+u.search+u.hash);closeMenus();render({scrollY:scroll?0:window.scrollY});
}
async function render({scrollY=0}={}){
  if(!main||!owned(location.pathname))return;
  activeController?.abort();activeController=null;
  const version=++renderVersion;
  const path=location.pathname.replace(/\/$/,'')||'/';syncMobileNavigation(path);
  if(path==='/login'){
    main.removeAttribute('aria-busy');document.title='Login | Walatra Herbal';document.body.classList.add('w-login-page');header.hidden=true;footer.hidden=true;mountOTPLogin();return;
  }
  document.body.classList.remove('w-login-page');header.hidden=false;footer.hidden=false;
  if(!shellMounted){mountHeader();mountFooter();shellMounted=true;}
  if(path==='/profile/addresses'){await mountAddressesPage(version);return;}
  if(path==='/profile'){await mountProfilePage(version);return;}
  activeController=new AbortController();const {signal}=activeController;
  if(new URLSearchParams(location.search).has('find')){const u=new URL(location.href),p=paramsFromURL(u);u.search=p;history.replaceState(history.state,'',u.pathname+u.search);}
  const searchInput=$('#w-search');if(searchInput&&document.activeElement!==searchInput)searchInput.value=paramsFromURL(location.href).get('q')||'';
  const container=el('div',{class:'w-container'});main.replaceChildren(container);main.setAttribute('aria-busy','true');
  const loading=state('Memuat katalog…');container.append(loading);
  try{
    if(path==='/'){loading.remove();await home(signal,container);}
    else if(/^\/(?:product|bundle)\/[^/]+$/.test(path)){const [,type,slug]=path.split('/');await detail(signal,container,type,decodeURIComponent(slug));loading.remove();}
    else if(/^\/cat\/[^/]+$/.test(path)){loading.remove();await listing(signal,container,decodeURIComponent(path.split('/')[2]));}
    else if(['/product','/search'].includes(path)){loading.remove();await listing(signal,container);}
    else throw new ApiError('Halaman katalog tidak ditemukan.',404);
  }catch(e){if(!signal.aborted){document.title=e.status===404?'Tidak ditemukan | Walatra Herbal':'Katalog | Walatra Herbal';container.replaceChildren(errorState(e,()=>render(),'h1'));}}
  finally{if(version===renderVersion){main.removeAttribute('aria-busy');window.scrollTo(0,scrollY);}}
}
document.addEventListener('click',e=>{
  const a=e.target.closest('a[href]');if(!a||e.button!==0||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==='_blank'||a.hasAttribute('download'))return;
  const u=new URL(a.href,location.href);if(u.origin===location.origin&&owned(u.pathname)&&!a.getAttribute('href').startsWith('#')){e.preventDefault();go(u.href);}
});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){const drawerOpen=Boolean($('.w-mobile-drawer')&&!$('.w-mobile-drawer').hidden);closeMenus({restoreFocus:drawerOpen});}});
window.addEventListener('popstate',()=>{if(owned(location.pathname))render({scrollY:history.state?.scrollY||0});else location.reload();});
const standaloneLogin=/^\/login\/?$/.test(location.pathname);
if(standaloneLogin){
  document.title='Login | Walatra Herbal';document.body.classList.add('w-login-page');header.hidden=true;footer.hidden=true;mountOTPLogin();
}else{mountHeader();mountFooter();shellMounted=true;}
if(owned(location.pathname)&&!standaloneLogin)render();
else if(!owned(location.pathname)){
  const slot=$('[data-live-catalog]');if(slot){const loading=state('Memuat produk terbaru…');slot.append(section('Produk Terbaru',loading,'/product/'));request('/catalog',new URLSearchParams({sort:'latest',per_page:'5'})).then(r=>loading.replaceWith(grid(r.data))).catch(e=>loading.replaceWith(errorState(e,()=>location.reload())));}
}
