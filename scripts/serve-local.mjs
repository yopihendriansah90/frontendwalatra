import http from 'node:http';
import fs from 'node:fs';
import {stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createAuthSessionHandler} from './auth-session.mjs';
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
const appOrigin=process.env.APP_ORIGIN?httpURL('APP_ORIGIN',process.env.APP_ORIGIN,{originOnly:true}):null;
const authSession=createAuthSessionHandler({apiBaseURL,appOrigin,secureCookies:process.env.COOKIE_SECURE==='true'||(process.env.COOKIE_SECURE!=='false'&&process.env.NODE_ENV==='production'),sessionLifetimeMs:envNumber('SESSION_TTL_SECONDS',43200,{min:60,max:2592000})*1000,upstreamTimeoutMs:envNumber('API_REQUEST_TIMEOUT_MS',15000,{min:1000,max:120000})});
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.ico':'image/x-icon','.woff':'font/woff','.woff2':'font/woff2','.ttf':'font/ttf','.mp4':'video/mp4','.pdf':'application/pdf'};
const server=http.createServer(async(req,res)=>{
  if(await authSession(req,res))return;
  if(!['GET','HEAD'].includes(req.method)){req.resume();res.writeHead(405,{Allow:'GET, HEAD'});res.end('Website ini hanya menyajikan berkas statis.');return;}
  try{
    const url=new URL(req.url,'http://localhost');
    const pathname=decodeURIComponent(url.pathname);
    let file=path.resolve(root,'.'+pathname);
    const relative=path.relative(root,file);
    if(relative.startsWith('..')||path.isAbsolute(relative)){res.writeHead(403);res.end();return;}
    const params=new URLSearchParams(url.searchParams);params.sort();
    const queryKey=(url.pathname.replace(/\/$/,'')||'/')+(params.size?'?'+params:'');
    if(pathname==='/'||/^\/(product|bundle|cat|search|login|profile)(\/|$)/.test(pathname))file=path.join(root,'catalog/index.html');
    else if(queries[queryKey])file=path.join(root,queries[queryKey]);
    let info=await stat(file);
    if(info.isDirectory()){
      if(!url.pathname.endsWith('/')){res.writeHead(301,{Location:url.pathname+'/'+url.search});res.end();return;}
      file=path.join(file,'index.html');info=await stat(file);
    }
    if(!info.isFile()){res.writeHead(404);res.end('Halaman lokal tidak ditemukan.');return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file).toLowerCase()]||'application/octet-stream','Content-Length':info.size,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD'){res.end();return;}
    const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
  }catch(error){const status=error instanceof URIError?400:404;res.writeHead(status,{'Content-Type':'text/html; charset=utf-8'});res.end(status===404&&fs.existsSync(path.join(root,'404.html'))?fs.readFileSync(path.join(root,'404.html')):'Halaman lokal tidak ditemukan.');}
});
server.on('error',error=>{
  console.error(error.code==='EADDRINUSE'?`Port ${port} sudah dipakai. Buka http://localhost:${port} atau jalankan npm run dev -- --port 5174.`:error.message);process.exit(1);
});
server.listen(port,host,()=>console.log(`Walatra Herbal lokal: http://${host==='127.0.0.1'?'localhost':host}:${port}\nFolder ${root}. Katalog langsung dari API. Tekan Ctrl+C untuk berhenti.`));
