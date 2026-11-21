import {BlockList,isIP} from 'node:net';
import {createHmac} from 'node:crypto';

const normalize=value=>typeof value==='string'?value.replace(/^::ffff:/i,'').trim():'';
export function clientIdentity(trustedProxies=[]){
  const trusted=new BlockList();
  for(const entry of trustedProxies){
    const [address,prefix]=entry.split('/'),family=isIP(address);
    if(!family)throw new Error('TRUSTED_PROXY_IPS harus berisi IP atau subnet yang valid.');
    if(prefix!==undefined&&(!/^\d+$/.test(prefix)||Number(prefix)<1||Number(prefix)>(family===4?32:128)))throw new Error('Subnet proxy harus dibatasi secara eksplisit.');
    const type=family===4?'ipv4':'ipv6';
    if(prefix===undefined)trusted.addAddress(address,type);else trusted.addSubnet(address,Number(prefix),type);
  }
  const isTrusted=ip=>isIP(ip)&&trusted.check(ip,isIP(ip)===4?'ipv4':'ipv6');
  return req=>{
    const remote=normalize(req.socket?.remoteAddress);
    if(!isIP(remote))throw Object.assign(new Error('Identitas koneksi tidak valid.'),{status:400});
    if(!isTrusted(remote))return remote;
    const forwarded=req.headers['x-forwarded-for'];
    if(typeof forwarded!=='string')return remote;
    const chain=forwarded.split(',').map(normalize);
    if(chain.length>20||chain.some(ip=>!isIP(ip)))return remote;
    for(const ip of chain.reverse())if(!isTrusted(ip))return ip;
    return remote;
  };
}
export function identityHeaders(ip,method,path,secret){
  if(!secret)return {};
  if(secret.length<32)throw new Error('BACKEND_BRIDGE_SECRET minimal 32 karakter.');
  const timestamp=String(Math.floor(Date.now()/1000));
  return {'X-Walatra-Client-IP':ip,'X-Walatra-Client-Time':timestamp,'X-Walatra-Client-Signature':createHmac('sha256',secret).update([timestamp,ip,method,path].join('\n')).digest('hex')};
}
