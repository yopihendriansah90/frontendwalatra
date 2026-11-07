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

export function createAuthSessionHandler({baseURL,appOrigin=null,secureCookies=false,sessionLifetimeMs=12*60*60*1000,upstreamTimeoutMs=20000}){
  const sessions=new Map();
  const endpoint='/api/v1/auth';
  const requestAPI=async(path,{method='GET',body,token}={})=>{
    const headers={Accept:'application/json'};
    if(body!==undefined)headers['Content-Type']='application/json';
    if(token)headers.Authorization=`Bearer ${token}`;
    let response;
    try{response=await fetch(`${baseURL}${endpoint}${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(upstreamTimeoutMs)});}
    catch(error){throw Object.assign(new Error(error.name==='TimeoutError'?'Layanan autentikasi terlalu lama merespons.':'Tidak dapat menghubungi layanan autentikasi.'),{status:502});}
    let data;
    try{data=await response.json();}catch{throw Object.assign(new Error('Respons layanan autentikasi tidak dapat dibaca.'),{status:502});}
    return {status:response.status,data,retryAfter:response.headers.get('Retry-After')};
  };
  const sendAPI=(res,result)=>{
    const headers=result.retryAfter?{'Retry-After':result.retryAfter}:{};
    const data=result.data&&typeof result.data==='object'?{...result.data}:{};
    if(data.data&&typeof data.data==='object'){
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
    if(!['GET','POST','PATCH'].includes(req.method)){json(res,405,{success:false,message:'Metode tidak diizinkan.'},{Allow:'GET, POST, PATCH'});return true;}
    if(req.method!=='GET'&&!sameOrigin(req)){json(res,403,{success:false,message:'Permintaan lintas origin ditolak.'});return true;}
    const route=url.pathname.slice('/auth/session'.length);
    try{
      if(route==='/request-otp'&&req.method==='POST'){
        const body=await readJSON(req);
        sendAPI(res,await requestAPI('/customer/request-otp',{method:'POST',body}));
        return true;
      }
      if(route==='/verify-otp'&&req.method==='POST'){
        const body=await readJSON(req);
        const verified=await requestAPI('/customer/verify-otp',{method:'POST',body});
        if(verified.status<200||verified.status>=300||verified.data?.success!==true){sendAPI(res,verified);return true;}
        const token=verified.data?.data?.token;
        if(typeof token!=='string'||!token.includes('|')){json(res,502,{success:false,message:'Respons login tidak berisi token yang valid.'});return true;}
        const id=randomBytes(32).toString('base64url');
        const session={token,expiresAt:Date.now()+sessionLifetimeMs};
        sessions.set(id,session);
        res.setHeader('Set-Cookie',cookieHeader(id,{secure:secureCookies,maxAge:sessionLifetimeMs/1000}));
        let me=null;
        try{me=await requestAPI('/me',{token});}catch{}
        const user=me?.status===200&&me.data?.success===true?me.data.data?.user:verified.data.data?.user;
        const requiresProfileCompletion=me?.status===200&&me.data?.success===true?me.data.data?.requires_profile_completion:verified.data.data?.requires_profile_completion;
        json(res,200,{success:true,message:verified.data.message||'Login berhasil.',data:{user,requires_profile_completion:requiresProfileCompletion===true}});
        return true;
      }
      if(route==='/me'&&req.method==='GET'){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const result=await requestAPI('/me',{token:found.session.token});
        if(result.status===401)clearSession(res,found.id);
        sendAPI(res,result);return true;
      }
      if(route==='/profile'&&req.method==='PATCH'){
        const found=currentSession(req,res);
        if(!found){json(res,401,{success:false,message:'Unauthenticated.'});return true;}
        const body=await readJSON(req);
        const result=await requestAPI('/customer/profile',{method:'PATCH',body,token:found.session.token});
        if(result.status===401)clearSession(res,found.id);
        sendAPI(res,result);return true;
      }
      if(route==='/logout'&&req.method==='POST'){
        const found=currentSession(req,res);
        if(!found){clearSession(res,null);json(res,200,{success:true,message:'Logout berhasil.'});return true;}
        let result;
        try{result=await requestAPI('/logout',{method:'POST',token:found.session.token});}
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
