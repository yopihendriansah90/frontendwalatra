export class AuthError extends Error{
  constructor(message,status=0,errors=null,retryAfter=null,code=null){super(message);this.status=status;this.errors=errors;this.retryAfter=retryAfter;this.code=code;}
}

export async function authRequest(path,{method='GET',body,key,binary=false}={}){
  let response;
  try{
    response=await fetch(`/auth/session${path}`,{method,credentials:'same-origin',cache:'no-store',headers:{Accept:binary?'image/png':'application/json',...(key?{'Idempotency-Key':key}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});
  }catch{
    throw new AuthError('Tidak dapat menghubungi layanan autentikasi. Periksa koneksi lalu coba lagi.');
  }
  if(binary&&response.ok){if(!response.headers.get('Content-Type')?.startsWith('image/png'))throw new AuthError('Format gambar QR tidak valid.',502);return response.blob();}
  let result;
  try{result=await response.json();}catch{throw new AuthError('Respons layanan autentikasi tidak dapat dibaca.',response.status);}
  if(!response.ok||(result.success!==true&&response.status!==202))throw new AuthError(result.message||'Permintaan gagal.',response.status,result.errors,response.headers.get('Retry-After')||result.retry_after||null,result.code);
  return {...result,httpStatus:response.status};
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
export const getCart=(ids=[])=>{const query=new URLSearchParams();ids.forEach(id=>query.append('cart_item_ids[]',id));return authRequest('/cart'+(query.size?'?'+query:''));};
export const addCartItem=item=>authRequest('/cart/items',{method:'POST',body:item});
export const updateCartItem=(id,changes)=>authRequest(`/cart/items/${encodeURIComponent(id)}`,{method:'PATCH',body:changes});
export const deleteCartItem=id=>authRequest(`/cart/items/${encodeURIComponent(id)}`,{method:'DELETE'});
export const clearCart=()=>authRequest('/cart',{method:'DELETE'});
export const previewCheckout=body=>authRequest('/checkout/preview',{method:'POST',body});
export const createOrder=(body,key)=>authRequest('/orders',{method:'POST',body,key});
export const listOrders=(page=1)=>authRequest(`/orders?page=${page}`);
export const getOrder=id=>authRequest(`/orders/${encodeURIComponent(id)}`);
export const cancelOrder=id=>authRequest(`/orders/${encodeURIComponent(id)}/cancel`,{method:'POST',body:{}});
export const paymentMethods=()=>authRequest('/payment-methods');
export const createPayment=(id,method,key)=>authRequest(`/orders/${encodeURIComponent(id)}/payment`,{method:'POST',body:{method},key});
export const refreshPayment=id=>authRequest(`/orders/${encodeURIComponent(id)}/payment/refresh`,{method:'POST',body:{}});
export const paymentQR=(id,payment)=>authRequest(`/orders/${encodeURIComponent(id)}/payments/${encodeURIComponent(payment)}/qr-code`,{binary:true});
