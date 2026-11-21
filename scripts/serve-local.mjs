import http from 'node:http';
import fs from 'node:fs';
import {stat,realpath,readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAuthSessionHandler} from './auth-session.mjs';
import {requestURL} from './http-request.mjs';
import {memorySessionStore,redisSessionStore} from './session-store.mjs';
import {assertProductionSettings,securityHeaders} from './security-headers.mjs';
import {envNumber, httpURL, loadEnv} from './env.mjs';
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:undefined;};
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
loadEnv(project);
const root=path.resolve(project,option('--dir')||'dist');
const queryFile=path.join(root,'legacy-query.json');
const queries=fs.existsSync(queryFile)?JSON.parse(fs.readFileSync(queryFile,'utf8')):{};
const port=Number(option('--port')||process.env.WEB_PORT||process.env.PORT||5173);
const host=option('--host')||process.env.WEB_HOST||'127.0.0.1';
if(!Number.isSafeInteger(port)||port<1||port>65535)throw new Error('WEB_PORT harus berada pada rentang 1–65535.');
const apiBaseURL=httpURL('API_BASE_URL','http://127.0.0.1:8000/api/v1');
assertProductionSettings(process.env,apiBaseURL);
const appOrigin=process.env.APP_ORIGIN?httpURL('APP_ORIGIN',process.env.APP_ORIGIN,{originOnly:true}):null;
const sessionMode=process.env.SESSION_STORE||(process.env.NODE_ENV==='production'?'redis':'memory');
if(!['redis','memory'].includes(sessionMode))throw new Error('SESSION_STORE harus redis atau memory.');
const sessionStore=sessionMode==='redis'?await redisSessionStore({url:process.env.REDIS_URL||'redis://127.0.0.1:6379',secret:process.env.SESSION_ENCRYPTION_KEY,prefix:process.env.SESSION_KEY_PREFIX||'walatra:web:'}):memorySessionStore();
const authSession=createAuthSessionHandler({apiBaseURL,appOrigin,sessionStore,consumeRate:sessionStore.consumeRate,bridgeSecret:process.env.BACKEND_BRIDGE_SECRET||'',trustedProxyIPs:(process.env.TRUSTED_PROXY_IPS||'').split(',').map(v=>v.trim()).filter(Boolean),secureCookies:process.env.COOKIE_SECURE==='true'||(process.env.COOKIE_SECURE!=='false'&&process.env.NODE_ENV==='production'),sessionLifetimeMs:envNumber('SESSION_TTL_SECONDS',43200,{min:60,max:2592000})*1000,upstreamTimeoutMs:envNumber('API_REQUEST_TIMEOUT_MS',15000,{min:1000,max:120000})});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.pdf':'application/pdf'};
const server=http.createServer(async(req,res)=>{
  const commonHeaders=securityHeaders({apiBaseURL,production:process.env.NODE_ENV==='production'});
  for(const [key,value] of Object.entries(commonHeaders))res.setHeader(key,value);
  try{
  if(await authSession(req,res))return;
  if(!['GET','HEAD'].includes(req.method)){req.resume();res.writeHead(405,{Allow:'GET, HEAD'});res.end('Website ini hanya menyajikan berkas statis.');return;}
  try{
    const url=requestURL(req.url);
    const pathname=decodeURIComponent(url.pathname);
    if(pathname.split('/').some(segment=>segment.startsWith('.')&&segment!=='.well-known')){res.writeHead(403);res.end();return;}
    let file=path.resolve(root,'.'+pathname);
    const relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
    const params=new URLSearchParams(url.searchParams);params.sort();
    const queryKey=(url.pathname.replace(/\/$/,'')||'/')+(params.size?'?'+params:'');
    if(pathname==='/'||/^\/(product|bundle|cat|search|login|profile|cart|checkout|orders)(\/|$)/.test(pathname))file=path.join(root,'catalog/index.html');
    else if(queries[queryKey])file=path.join(root,queries[queryKey]);
    let info=await stat(file);
    if(info.isDirectory()){
      if(!url.pathname.endsWith('/')){res.writeHead(301,{Location:url.pathname+'/'+url.search});res.end();return;}
      file=path.join(file,'index.html');info=await stat(file);
    }
    if(!info.isFile()){res.writeHead(404);res.end('Halaman lokal tidak ditemukan.');return;}
    const physical=path.relative(await realpath(root),await realpath(file));
    if(physical.startsWith('..')||path.isAbsolute(physical)){res.writeHead(403);res.end();return;}
    if(path.extname(file).toLowerCase()==='.html'){
      const html=await readFile(file,'utf8'),headers=securityHeaders({apiBaseURL,production:process.env.NODE_ENV==='production',html});
      if(process.env.CSP_MODE==='report-only'){
        res.removeHeader('Content-Security-Policy');headers['Content-Security-Policy-Report-Only']=headers['Content-Security-Policy'];delete headers['Content-Security-Policy'];
      }
      res.writeHead(200,{...headers,'Content-Type':mime['.html'],'Content-Length':Buffer.byteLength(html),'Cache-Control':'no-cache'});
      res.end(req.method==='HEAD'?undefined:html);return;
    }
    res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch(error){const status=error instanceof URIError?400:404;res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(status===404&&fs.existsSync(path.join(root,'404.html'))?fs.readFileSync(path.join(root,'404.html')):'Halaman lokal tidak ditemukan.');}
  }catch(error){
    if(res.headersSent){res.destroy();return;}
    req.resume();res.writeHead(error.status===400?400:500,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
    res.end(JSON.stringify({success:false,message:error.status===400?'URL permintaan tidak valid.':'Permintaan belum dapat diproses.'}));
  }
});
server.on('error',error=>{
  console.error(error.code==='EADDRINUSE'?`Port ${port} sudah dipakai. Buka http://localhost:${port} atau jalankan npm run dev -- --port 5174.`:error.message);process.exit(1);
});
server.listen(port,host,()=>console.log(`Walatra Herbal lokal: http://${host==='127.0.0.1'?'localhost':host}:${port}\nFolder ${root}. Katalog langsung dari API. Tekan Ctrl+C untuk berhenti.`));
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>{
  server.closeAllConnections();server.close(async()=>{await sessionStore.close();process.exit(0);});
});
