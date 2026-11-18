import {coordinates} from './coordinates.js';

export function addressMap({el,notify,initial,isActive}){
  let selected=coordinates(initial?.latitude,initial?.longitude),destroyed=false,locating=false;
  const live=()=>!destroyed&&isActive()&&root.isConnected;
  const status=el('p',{class:'w-address-map-status',role:'status','aria-live':'polite'});
  const render=()=>{
    status.textContent=selected?`Titik pengiriman tersimpan: ${selected.lat.toFixed(6)}, ${selected.lon.toFixed(6)}.`:'Lokasi belum diambil. Gunakan GPS perangkat untuk menyimpan titik pengiriman.';
    clear.disabled=!selected||locating;
  };
  const locate=el('button',{type:'button',class:'w-button w-outline',onclick:()=>{
    if(locating||!live())return;
    if(!navigator.geolocation||!globalThis.isSecureContext){
      status.textContent='GPS tidak tersedia. Buka situs melalui HTTPS dan aktifkan izin lokasi perangkat.';
      notify({icon:'warning',title:'Lokasi belum tersedia',text:status.textContent});return;
    }
    locating=true;locate.disabled=true;clear.disabled=true;locate.textContent='Mencari lokasi…';
    status.textContent='Mengambil lokasi dari GPS perangkat…';
    const done=()=>{locating=false;locate.disabled=false;locate.textContent='Gunakan lokasi saya';render();};
    const fail=error=>{
      if(!live())return;
      done();
      const message=error.code===1?'Izin lokasi ditolak. Aktifkan izin lokasi di browser lalu coba lagi.':error.code===3?'Pencarian lokasi terlalu lama. Coba lagi di tempat dengan sinyal GPS yang lebih baik.':'Lokasi perangkat belum tersedia. Aktifkan GPS lalu coba lagi.';
      status.textContent=message;
      notify({icon:'warning',title:'Lokasi belum dapat diambil',text:message});
    };
    navigator.geolocation.getCurrentPosition(position=>{
      if(!live())return;
      const point=coordinates(position.coords.latitude,position.coords.longitude);
      if(!point){fail({code:2});return;}
      selected=point;done();
    },fail,{enableHighAccuracy:true,timeout:15000,maximumAge:0});
  }},'Gunakan lokasi saya');
  const clear=el('button',{type:'button',class:'w-button w-outline',onclick:()=>{selected=null;render();}},'Hapus titik');
  const root=el('section',{class:'w-address-map','aria-labelledby':'w-address-map-title'},
    el('h3',{id:'w-address-map-title'},'Titik pengiriman (opsional)'),
    el('p',{class:'w-profile-copy'},'Gunakan lokasi saya saat berada di alamat penerima. Pilihan wilayah di atas tetap diperlukan.'),
    status,el('div',{class:'w-address-map-actions'},locate,clear)
  );
  render();
  return {element:root,value:()=>selected,mount:()=>{},destroy:()=>{destroyed=true;}};
}
