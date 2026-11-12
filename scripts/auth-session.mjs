import {randomBytes} from 'node:crypto';

const cookieName='walatra_session';
const maxBodySize=16*1024;

function json(res,status,body,headers={}){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});
  res.end(JSON.stringify(body));
}
function cookieValue(header){
  const entry=header?.split(';').map(value=>value.trim()).find(value=>value.startsWith(`${cookieName}=`));
  try{return entry?decodeURIComponent(entry.slice(cookieName.length+1)):null;}catch{return null;}
}
function cookieHeader(value,{secure,maxAge}={}){
  return `${cookieName}=${encodeURIComponent(value)}; Path=/auth/session; HttpOnly; SameSite=Lax${secure?'; Secure':''}${maxAge===undefined?'':`; Max-Age=${maxAge}`}`;
}
async function readJSON(req){
  let size=0,body='';
  for await(const chunk of req){size+=chunk.length;if(size>maxBodySize)throw Object.assign(new Error('Ukuran data terlalu besar.'),{status:413});body+=chunk;}
  if(!body)return {};
  try{return JSON.parse(body);}catch{throw Object.assign(new Error('Format data tidak valid.'),{status:400});}
}

export function createAuthSessionHandler({apiBaseURL,appOrigin=null,secureCookies=false,sessionLifetimeMs=12*60*60*1000,upstreamTimeoutMs=20000}){
  const sessions=new Map();
  const requestAPI=async(path,{method='GET',body,token,key,binary=false}={})=>{
    const headers={Accept:'application/json'};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(token)headers.Authorization=`Bearer ${token}`;
    if(key!==undefined)headers['Idempotency-Key']=key;
    if(binary)headers.Accept='image/png';
    let response;
    try{response=await fetch(`${apiBaseURL}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(upstreamTimeoutMs)});}
    catch(error){throw Object.assign(new Error(error.name==='TimeoutError'?'Layanan autentikasi terlalu lama merespons.':'Tidak dapat menghubungi layanan autentikasi.'),{status:502});}
    if(binary&&response.ok){
      if(!response.headers.get('Content-Type')?.startsWith('image/png'))throw Object.assign(new Error('Format gambar QR tidak valid.'),{status:502});
      return {status:response.status,image:Buffer.from(await response.arrayBuffer())};
    }
    let data;
    try{data=await response.json();}catch{throw Object.assign(new Error('Respons layanan autentikasi tidak dapat dibaca.'),{status:502});}
    return {status:response.status,data,retryAfter:response.headers.get('Retry-After')};
  };
  const sendAPI=(res,result)=>{
    const headers=result.retryAfter?{'Retry-After':result.retryAfter}:{};
    const data=result.data&&typeof result.data==='object'?{...result.data}:{};
    if(Array.isArray(data.data)){
      data.data=[...data.data];
    }else if(data.data&&typeof data.data==='object'){
      data.data={...data.data};
      delete data.data.token;
      delete data.data.otp;
    }
    json(res,result.status,data,headers);
  };
  const currentSession=(req,res)=>{
    const id=cookieValue(req.headers.cookie),session=id?sessions.get(id):null;
    if(!session)return null;
    if(session.expiresAt<Date.now()){sessions.delete(id);res.setHeader('Set-Cookie',cookieHeader('',{secure:secureCookies,maxAge:0}));return null;}
    session.expiresAt=Date.now()+sessionLifetimeMs;
    return {id,session};
  };
  const clearSession=(res,id)=>{
    if(id)sessions.delete(id);
    res.setHeader('Set-Cookie',cookieHeader('',{secure:secureCookies,maxAge:0}));
  };
  const sameOrigin=(req)=>{
    const origin=req.headers.origin;
    if(!origin)return false;
    const expected=appOrigin||`${secureCookies?'https':'http'}://${req.headers.host}`;
    try{return new URL(origin).origin===new URL(expected).origin;}catch{return false;}
  };

  return async(req,res)=>{
    const url=new URL(req.url,'http://localhost');
    if(!url.pathname.startsWith('/auth/session/'))return false;
    for(const [id,session] of sessions)if(session.expiresAt<Date.now())sessions.delete(id);
    if(!['GET','POST','PATCH','PUT','DELETE'].includes(req.method)){json(res,405,{success:false,message:'Metode tidak diizinkan.'},{Allow:'GET, POST, PATCH, PUT, DELETE'});return true;}
    if(req.method!=='GET'&&!sameOrigin(req)){json(res,403,{success:false,message:'Permintaan lintas origin ditolak.'});return true;}
    const route=url.pathname.slice('/auth/session'.length);
    try{
      if(route==='/request-otp'&&req.method==='POST'){
        const body=await readJSON(req);
        sendAPI(res,await requestAPI('/auth/customer/request-otp',{method:'POST',body}));
        return true;
      }
      if(route==='/verify-otp'&&req.method==='POST'){
        const body=await readJSON(req);
        const verified=await requestAPI('/auth/customer/verify-otp',{method:'POST',body});
        if(verified.status<200||verified.status>=300||verified.data?.success!==true){sendAPI(res,verified);return true;}
        const token=verified.data?.data?.token;
        if(typeof token!=='string'||!token.includes('|')){json(res,502,{success:false,message:'Respons login tidak berisi token yang valid.'});return true;}
        const id=randomBytes(32).toString('base64url');
        const session={token,expiresAt:Date.now()+sessionLifetimeMs};
        sessions.set(id,session);
        res.setHeader('Set-Cookie',cookieHeader(id,{secure:secureCookies,maxAge:sessionLifetimeMs/1000}));
        let me=null;
        try{me=await requestAPI('/auth/me',{token});}catch{}
        const user=me?.status===200&&me.data?.success===true?me.data.data?.user:verified.data.data?.user;
        const requiresProfileCompletion=me?.status===200&&me.data?.success===true?me.data.data?.requires_profile_completion:verified.data.data?.requires_profile_completion;
        json(res,200,{success:true,message:verified.data.message||'Login berhasil.',data:{user,requires_profile_completion:requiresProfileCompletion===true}});
        return true;
      }
      if(route==='/me'&&req.method==='GET'){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const result=await requestAPI('/auth/me',{token:found.session.token});
        if(result.status===401)clearSession(res,found.id);
        sendAPI(res,result);return true;
      }
      if(route==='/profile'&&req.method==='PATCH'){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const body=await readJSON(req);
        const result=await requestAPI('/auth/customer/profile',{method:'PATCH',body,token:found.session.token});
        if(result.status===401)clearSession(res,found.id);
        sendAPI(res,result);return true;
      }
      if(route==='/addresses'&&['GET','POST'].includes(req.method)){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const body=req.method==='POST'?await readJSON(req):undefined;
        const result=await requestAPI('/addresses',{method:req.method,body,token:found.session.token});
        if(result.status===401)clearSession(res,found.id);
        sendAPI(res,result);return true;
      }
      const addressMatch=route.match(/^\/addresses\/(\d+)$/);
      if(addressMatch&&['PATCH','PUT','DELETE'].includes(req.method)){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const body=req.method==='DELETE'?undefined:await readJSON(req);
        const result=await requestAPI(`/addresses/${addressMatch[1]}`,{method:req.method,body,token:found.session.token});
        if(result.status===401)clearSession(res,found.id);
        sendAPI(res,result);return true;
      }
      if(route==='/cart'&&['GET','DELETE'].includes(req.method)){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const query=new URLSearchParams();
        if(req.method==='GET')for(const value of url.searchParams.getAll('cart_item_ids[]'))query.append('cart_item_ids[]',value);
        const result=await requestAPI('/cart'+(query.size?'?'+query:''),{method:req.method,token:found.session.token});
        if(result.status===401)clearSession(res,found.id);
        sendAPI(res,result);return true;
      }
      if(route==='/cart/items'&&req.method==='POST'){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const body=await readJSON(req),result=await requestAPI('/cart/items',{method:'POST',body,token:found.session.token});
        if(result.status===401)clearSession(res,found.id);
        sendAPI(res,result);return true;
      }
      const cartItemMatch=route.match(/^\/cart\/items\/(\d+)$/);
      if(cartItemMatch&&['PATCH','DELETE'].includes(req.method)){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const body=req.method==='PATCH'?await readJSON(req):undefined;
        const result=await requestAPI(`/cart/items/${cartItemMatch[1]}`,{method:req.method,body,token:found.session.token});
        if(result.status===401)clearSession(res,found.id);
        sendAPI(res,result);return true;
      }
      const commerceRoute=(route==='/checkout/preview'&&req.method==='POST')
        ||(route==='/orders'&&['GET','POST'].includes(req.method))
        ||(route==='/payment-methods'&&req.method==='GET')
        ||(/^\/orders\/\d+$/.test(route)&&req.method==='GET')
        ||(/^\/orders\/\d+\/(cancel|payment\/refresh)$/.test(route)&&req.method==='POST')
        ||(/^\/orders\/\d+\/payment$/.test(route)&&['GET','POST'].includes(req.method))
        ||(/^\/orders\/\d+\/payments\/\d+\/qr-code$/.test(route)&&req.method==='GET');
      if(commerceRoute){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const query=new URLSearchParams();if(route==='/orders'&&req.method==='GET'&&url.searchParams.has('page'))query.set('page',url.searchParams.get('page'));
        const body=req.method==='POST'?await readJSON(req):undefined;
        const binary=route.endsWith('/qr-code');
        const result=await requestAPI(route+(query.size?'?'+query:''),{method:req.method,body,token:found.session.token,key:req.headers['idempotency-key'],binary});
        if(result.status===401)clearSession(res,found.id);
        if(result.image){res.writeHead(result.status,{'Content-Type':'image/png','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(result.image);}
        else sendAPI(res,result);
        return true;
      }
      if(route==='/logout'&&req.method==='POST'){
        const found=currentSession(req,res);
        if(!found){clearSession(res,null);json(res,200,{success:true,message:'Logout berhasil.'});return true;}
        let result;
        try{result=await requestAPI('/auth/logout',{method:'POST',token:found.session.token});}
        catch(error){clearSession(res,found.id);json(res,error.status||502,{success:false,message:error.message});return true;}
        clearSession(res,found.id);
        if(result.status===401){json(res,200,{success:true,message:'Logout berhasil.'});return true;}
        sendAPI(res,result);return true;
      }
      json(res,404,{success:false,message:'Endpoint autentikasi tidak ditemukan.'});
    }catch(error){json(res,error.status||500,{success:false,message:error.status?error.message:'Permintaan autentikasi gagal.'});}
    return true;
  };
}
