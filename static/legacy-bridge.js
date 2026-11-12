(() => {
  const fetchOriginal=window.fetch.bind(window),open=XMLHttpRequest.prototype.open;
  const fixtures=window.__RETAINED_FIXTURES__||{},hosts=new Set(['api.naturalfarm.id','apinf.naturalfarm.id']);
  const empty=URL.createObjectURL(new Blob([JSON.stringify({status:'success',data:[],product:[],brand:[]})],{type:'application/json'}));
  function local(url){
    const u=new URL(url,location.href);if(!hosts.has(u.host))return null;
    const q=new URLSearchParams([...u.searchParams].sort((a,b)=>a[0].localeCompare(b[0])||a[1].localeCompare(b[1])));
    return fixtures[u.host+u.pathname.replace(/\/$/,'')+'?'+q]||empty;
  }
  XMLHttpRequest.prototype.open=function(method,url,...args){const mapped=local(url);this.__readOnly=Boolean(mapped);return open.call(this,mapped?'GET':method,mapped||url,...args);};
  const send=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(body){return send.call(this,this.__readOnly?null:body);};
  window.fetch=function(input,init){const url=typeof input==='string'||input instanceof URL?String(input):input.url;const mapped=local(url);return mapped?fetchOriginal(mapped,{credentials:'omit'}):fetchOriginal(input,init);};
  navigator.sendBeacon=()=>false;
  for(const method of ['appendChild','insertBefore']){const native=Node.prototype[method];Node.prototype[method]=function(node,...args){if(node.tagName==='SCRIPT'&&node.src&&new URL(node.src,location.href).origin!==location.origin)node.src='/noop.js';return native.call(this,node,...args);};}
  function notice(){document.querySelector('.static-notice')?.remove();const n=document.createElement('div');n.className='static-notice';n.setAttribute('role','status');n.textContent='Versi tampilan: proses akun dan transaksi belum dihubungkan.';document.body.append(n);setTimeout(()=>n.remove(),4500);}
  document.addEventListener('submit',e=>{if(e.target.closest('.w-header,.w-filters'))return;e.preventDefault();e.stopImmediatePropagation();notice();},true);
  document.addEventListener('click',e=>{
    const button=e.target.closest('button');if(button&&/^(login(?: with google)?|masuk|daftar|register|subscribe|kirim|bayar|checkout|reset password)$/i.test(button.textContent.trim())){const form=button.closest('form');if(form&&!form.reportValidity())return;e.preventDefault();e.stopImmediatePropagation();notice();return;}
    const a=e.target.closest('a[href]');if(!a||e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||a.target==='_blank')return;
    const u=new URL(a.href,location.href);if(u.origin!==location.origin)return;
    if(/^\/(checkout|cart|orders)(\/|$)/.test(u.pathname)){e.preventDefault();e.stopImmediatePropagation();location.assign(u.href);}
    else if(/^\/member(\/|$)/.test(u.pathname)){e.preventDefault();e.stopImmediatePropagation();notice();}
    else if(!/^\/(product|bundle|cat|search)(\/|$)/.test(u.pathname)&&u.pathname!=='/'&&!a.getAttribute('href').startsWith('#')){e.preventDefault();e.stopImmediatePropagation();location.assign(u.href);}
  },true);
})();
