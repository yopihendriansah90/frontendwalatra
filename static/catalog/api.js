const base=(globalThis.WALATRA_CONFIG?.apiBaseURL||'http://127.0.0.1:8000/api/v1').replace(/\/$/,'');
const requestTimeoutMs=globalThis.WALATRA_CONFIG?.catalogTimeoutMs||15000;
export const apiBase=base;
const pending=new Map();
let blockedUntil=0;
export class ApiError extends Error {
  constructor(message,status=0,errors=null,retryAt=0){super(message);this.status=status;this.errors=errors;this.retryAt=retryAt;}
}
function retryTime(response,body) {
  const raw=response.headers.get('Retry-After');
  const seconds=raw!==null&&/^\d+$/.test(raw)?Number(raw):Number(body?.retry_after);
  return Number.isFinite(seconds)&&seconds>=0 ? Date.now()+seconds*1000 : Math.max(Date.now()+1000,Date.parse(raw)||Date.now()+30000);
}
function subscribe(entry,signal) {
  entry.users++;
  return new Promise((resolve,reject)=>{
    let finished=false;
    const finish=(fn,value)=>{if(finished)return;finished=true;signal?.removeEventListener('abort',abort);entry.users--;fn(value);};
    const abort=()=>{finish(reject,new DOMException('Request dibatalkan','AbortError'));if(entry.users===0)entry.controller.abort();};
    if(signal?.aborted){abort();return;}
    signal?.addEventListener('abort',abort,{once:true});entry.promise.then(value=>finish(resolve,value),e=>finish(reject,e));
  });
}
export function request(path,params=new URLSearchParams(),signal) {
  if(!(/^\/catalog(?:\/(?:categories|products|bundles)(?:\/[^/?#]+)?)?$/.test(path)||path==='/banners'))return Promise.reject(new ApiError('Endpoint API tidak valid.'));
  if(blockedUntil>Date.now())return Promise.reject(new ApiError('Batas akses tercapai. Tunggu sebelum mencoba lagi.',429,null,blockedUntil));
  const url=new URL(base+path);url.search=new URLSearchParams(params).toString();
  let entry=pending.get(url.href);
  if(entry?.controller.signal.aborted){pending.delete(url.href);entry=null;}
  if(!entry){
    entry={controller:new AbortController(),users:0};
    const current=entry;
    const timeout=setTimeout(()=>{current.timedOut=true;current.controller.abort();},requestTimeoutMs);
    entry.promise=(async()=>{
      let response;
      try {response=await fetch(url,{method:'GET',headers:{Accept:'application/json'},credentials:'omit',cache:'no-store',signal:current.controller.signal});}
      catch(e){if(current.timedOut)throw new ApiError('Katalog terlalu lama merespons. Silakan coba lagi.');if(e.name==='AbortError')throw e;throw new ApiError('Tidak dapat menghubungi katalog. Periksa koneksi lalu coba lagi.');}
      let body;try{body=await response.json();}catch{throw new ApiError('Respons katalog tidak dapat dibaca.',response.status);}
      if(response.status===429){blockedUntil=retryTime(response,body);throw new ApiError(body.message||'Batas akses tercapai.',429,body.errors,blockedUntil);}
      if(!response.ok||body.success!==true)throw new ApiError(body.message||'Katalog tidak dapat dimuat.',response.status,body.errors);
      if(body.data===undefined)throw new ApiError('Struktur respons katalog tidak sesuai dokumentasi.',response.status);
      return body;
    })().finally(()=>{clearTimeout(timeout);if(pending.get(url.href)===current)pending.delete(url.href);});
    pending.set(url.href,entry);
  }
  return subscribe(entry,signal);
}
export const categories=signal=>request('/catalog/categories',new URLSearchParams(),signal);
export const banners=signal=>request('/banners',new URLSearchParams(),signal);
