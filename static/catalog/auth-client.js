export class AuthError extends Error{
  constructor(message,status=0,errors=null,retryAfter=null){super(message);this.status=status;this.errors=errors;this.retryAfter=retryAfter;}
}

async function authRequest(path,{method='GET',body}={}){
  let response;
  try{
    response=await fetch(`/auth/session${path}`,{method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  }catch{
    throw new AuthError('Tidak dapat menghubungi layanan autentikasi. Periksa koneksi lalu coba lagi.');
  }
  let result;
  try{result=await response.json();}catch{throw new AuthError('Respons layanan autentikasi tidak dapat dibaca.',response.status);}
  if(!response.ok||result.success!==true)throw new AuthError(result.message||'Permintaan autentikasi gagal.',response.status,result.errors,response.headers.get('Retry-After')||result.retry_after||null);
  return result;
}

export const requestOTP=phone=>authRequest('/request-otp',{method:'POST',body:{phone}});
export const verifyOTP=values=>authRequest('/verify-otp',{method:'POST',body:values});
export const currentUser=()=>authRequest('/me');
export const updateProfile=name=>authRequest('/profile',{method:'PATCH',body:{name}});
export const logout=()=>authRequest('/logout',{method:'POST',body:{}});
export const listAddresses=()=>authRequest('/addresses');
export const createAddress=address=>authRequest('/addresses',{method:'POST',body:address});
export const updateAddress=(id,changes)=>authRequest(`/addresses/${encodeURIComponent(id)}`,{method:'PATCH',body:changes});
export const deleteAddress=id=>authRequest(`/addresses/${encodeURIComponent(id)}`,{method:'DELETE'});
