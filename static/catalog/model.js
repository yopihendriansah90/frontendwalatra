export const sorts = {latest:'Terbaru',relevance:'Relevansi',name_asc:'Nama A–Z',name_desc:'Nama Z–A',price_asc:'Harga terendah',price_desc:'Harga tertinggi'};
export function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value); return Number.isFinite(n) && n >= 0 ? n : null;
}
export function money(value) {
  const n = number(value);
  return n === null ? 'Harga belum tersedia' : new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
}
export function itemPrice(item) {
  if (item.type === 'bundle') return money(item.price?.value);
  const min=number(item.price?.min),max=number(item.price?.max);
  return min !== null && max !== null && min !== max ? `${money(min)} – ${money(max)}` : money(min ?? max);
}
export function itemKey(item) { return `${item.type}:${item.listing_id}`; }
export function detailURL(item) {
  return `/${item.type === 'bundle' ? 'bundle' : 'product'}/${encodeURIComponent(item.slug)}/?listing=${encodeURIComponent(item.listing_id)}`;
}
export function mediaURL(value,base) {
  if (!value || typeof value !== 'string') return null;
  try { const u=new URL(value,new URL(base).origin);return ['http:','https:'].includes(u.protocol)?u.href:null; } catch { return null; }
}
export function imageURLs(image,base,card=false) {
  return [...new Set((card ? [image?.thumb,image?.url,image?.image_url] : [image?.full,image?.preview,image?.url,image?.thumb]).map(v=>mediaURL(v,base)).filter(Boolean))];
}
export function paramsFromURL(url) {
  const input=new URL(url,'http://localhost'),p=new URLSearchParams();
  for (const key of ['q','type','store','category','min_price','max_price','sort','per_page','page']) {
    const value=input.searchParams.get(key);if(value!==null&&value!=='')p.set(key,value);
  }
  if (!p.has('q') && input.searchParams.has('find')) p.set('q',input.searchParams.get('find'));
  const oldSort={1:'name_asc',2:'name_desc',3:'latest',5:'price_asc',6:p.get('q')?'relevance':'latest',7:'latest'};
  if(oldSort[p.get('sort')])p.set('sort',oldSort[p.get('sort')]);
  if(!p.has('sort'))p.set('sort',p.get('q')?'relevance':'latest');
  if(!p.has('per_page'))p.set('per_page','15');
  if(!p.has('page'))p.set('page','1');
  return p;
}
export function selection(detail,params,type) {
  const stores=Array.isArray(detail.stores)?detail.stores:[],variants=type==='product'&&Array.isArray(detail.variants)?detail.variants:[];
  return {listing:stores.find(s=>String(s.listing_id)===params.get('listing'))||stores[0]||null,variant:variants.find(v=>String(v.id)===params.get('variant'))||variants[0]||null};
}
