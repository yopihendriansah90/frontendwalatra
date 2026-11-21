import {createHash} from 'node:crypto';

export function assertProductionSettings(env,apiBaseURL){
  if(env.NODE_ENV!=='production')return;
  if(!env.APP_ORIGIN||new URL(env.APP_ORIGIN).protocol!=='https:'||env.COOKIE_SECURE==='false')throw new Error('Production memerlukan APP_ORIGIN HTTPS dan secure cookie.');
  if(env.SESSION_STORE!=='redis'||(env.SESSION_ENCRYPTION_KEY||'').length<32||(env.BACKEND_BRIDGE_SECRET||'').length<32)throw new Error('Production memerlukan Redis dan kunci sesi/bridge minimal 32 karakter.');
  if(new URL(apiBaseURL).protocol!=='https:')throw new Error('API_BASE_URL production harus HTTPS yang dapat dijangkau browser.');
  if(env.CSP_MODE&&env.CSP_MODE!=='enforce')throw new Error('Production memerlukan CSP_MODE=enforce.');
  const redis=new URL(env.REDIS_URL||'redis://127.0.0.1:6379');
  if(!['redis:','rediss:'].includes(redis.protocol)||redis.protocol==='redis:'&&!['127.0.0.1','localhost','[::1]'].includes(redis.hostname))throw new Error('Koneksi Redis remote production harus memakai TLS.');
}

export function securityHeaders({apiBaseURL,production=false,html=''}={}){
  const origin=new URL(apiBaseURL).origin,hashes=[];
  for(const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)){
    if(!/\bsrc\s*=/i.test(match[1])&&match[2].trim())hashes.push("'sha256-"+createHash('sha256').update(match[2].replace(/\r\n?/g,'\n')).digest('base64')+"'");
  }
  const policy=["default-src 'self'","base-uri 'self'","object-src 'none'","frame-ancestors 'none'","form-action 'self'",
    "script-src 'self' "+[...new Set(hashes)].join(' '),"script-src-attr 'none'","style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: "+origin,"font-src 'self' data:","connect-src 'self' blob: "+origin,
    "frame-src https://www.openstreetmap.org","worker-src 'self' blob:",...(production?['upgrade-insecure-requests']:[])].join('; ');
  return {'Content-Security-Policy':policy,'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Permissions-Policy':'geolocation=(self), camera=(), microphone=()',...(production?{'Strict-Transport-Security':'max-age=31536000'}:{})};
}
