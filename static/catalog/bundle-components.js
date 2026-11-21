export function createBundleComponents({el,link,picture,request,imageURLs,mediaAssetURL,apiBase,apiMediaBase,Observer=globalThis.IntersectionObserver}){
  return (items,signal)=>{
    const details=new Map(),queue=[],waiting=new Map();
    let active=0,limited=false;
    const observer=Observer?new Observer(entries=>{
      for(const entry of entries){
        if(!entry.isIntersecting)continue;
        const load=waiting.get(entry.target);
        waiting.delete(entry.target);observer.unobserve(entry.target);load?.();
      }
    },{rootMargin:'160px'}):null;
    signal.addEventListener('abort',()=>{
      observer?.disconnect();waiting.clear();
      for(const job of queue.splice(0))job.resolve(null);
    },{once:true});
    const drain=()=>{
      while(active<3&&queue.length){
        const job=queue.shift();
        if(signal.aborted||limited){job.resolve(null);continue;}
        active++;
        request(`/catalog/products/${encodeURIComponent(job.slug)}`,new URLSearchParams(),signal)
          .then(({data})=>job.resolve(data),error=>{if(error.status===429)limited=true;job.resolve(null);})
          .finally(()=>{active--;drain();});
      }
    };
    const loadDetail=slug=>{
      if(!details.has(slug)){
        const pending=new Promise(resolve=>queue.push({slug,resolve}));
        details.set(slug,pending);drain();
      }
      return details.get(slug);
    };
    const resolveURLs=values=>[...new Set(values.map(url=>mediaAssetURL(url,apiBase,apiMediaBase)).filter(Boolean))];
    return items.map(item=>{
      const product=item.product,params=new URLSearchParams();
      if(item.variant?.id!=null)params.set('variant',item.variant.id);
      const href=`/product/${encodeURIComponent(product.slug)}/${params.size?'?'+params:''}`;
      const urls=resolveURLs([item.variant?.image_url,product.image_url,...imageURLs(product.image,apiBase,true,apiMediaBase)]);
      const media=el('span',{class:'w-component-media'});
      let fetched=false;
      const load=async()=>{
        if(fetched||signal.aborted)return;
        fetched=true;
        const data=await loadDetail(product.slug);
        if(!data||signal.aborted)return;
        const variant=data.variants?.find(variant=>String(variant.id)===String(item.variant?.id));
        const resolved=resolveURLs([variant?.image_url,data.image_url,...imageURLs(data.image,apiBase,true,apiMediaBase),...(data.stores||[]).flatMap(store=>(store.images||[]).flatMap(image=>imageURLs(image,apiBase,true,apiMediaBase)))]).filter(url=>!urls.includes(url));
        if(resolved.length)media.replaceChildren(picture(resolved,product.name));
      };
      const schedule=()=>{
        if(signal.aborted||fetched)return;
        if(observer){waiting.set(media,load);observer.observe(media);}else load();
      };
      media.append(picture(urls,product.name,{onExhausted:schedule}));
      if(!urls.length)schedule();
      return el('li',{},link(href,[media,el('span',{class:'w-component-info'},el('span',{},product.name),el('span',{class:'w-detail-meta'},`${item.quantity} × ${item.variant?.name||''}`))],{class:'w-component-link'}));
    });
  };
}
