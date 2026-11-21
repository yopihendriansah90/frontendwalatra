import {createHash,createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createClient} from 'redis';

export function memorySessionStore({maxSessions=10000,now=Date.now}={}){
  const sessions=new Map();let sweptAt=0;
  return {
    async get(id){const item=sessions.get(id);if(!item||item.expiresAt<=now()){sessions.delete(id);return null;}return item;},
    async set(id,item){
      const time=now();
      if(time-sweptAt>30000){for(const [key,value] of sessions)if(value.expiresAt<=time)sessions.delete(key);sweptAt=time;}
      if(sessions.size>=maxSessions&&!sessions.has(id))throw new Error('Session capacity reached');
      sessions.set(id,item);
    },
    async delete(id){sessions.delete(id);},
    async close(){}
  };
}

export async function redisSessionStore({url,secret,prefix='walatra:web:'}){
  if(typeof secret!=='string'||secret.length<32)throw new Error('SESSION_ENCRYPTION_KEY minimal 32 karakter.');
  if(!/^[a-zA-Z0-9:_-]{1,80}$/.test(prefix))throw new Error('SESSION_KEY_PREFIX tidak valid.');
  const key=createHash('sha256').update(secret).digest();
  const client=createClient({url,disableOfflineQueue:true,socket:{connectTimeout:3000,reconnectStrategy:false}});
  client.on('error',()=>{});
  try{await client.connect();}catch{if(client.isOpen)client.destroy();throw new Error('Penyimpanan sesi Redis belum tersedia.');}
  const sessionKey=id=>prefix+'session:'+createHash('sha256').update(id).digest('hex');
  return {
    async get(id){
      const name=sessionKey(id),raw=await client.get(name);if(!raw)return null;
      try{
        const buffer=Buffer.from(raw,'base64'),decipher=createDecipheriv('aes-256-gcm',key,buffer.subarray(0,12));
        decipher.setAAD(Buffer.from(name));decipher.setAuthTag(buffer.subarray(12,28));
        const item=JSON.parse(Buffer.concat([decipher.update(buffer.subarray(28)),decipher.final()]).toString());
        if(typeof item.token!=='string'||!Number.isFinite(item.expiresAt)||item.expiresAt<=Date.now()){await client.del(name);return null;}
        return item;
      }catch{await client.del(name);return null;}
    },
    async set(id,item){
      const name=sessionKey(id),iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
      cipher.setAAD(Buffer.from(name));
      const encrypted=Buffer.concat([cipher.update(JSON.stringify(item)),cipher.final()]);
      await client.set(name,Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64'),{PX:Math.max(1,item.expiresAt-Date.now())});
    },
    async delete(id){await client.del(sessionKey(id));},
    async consumeRate(id,maximum,windowMs){
      const name=prefix+'rate:'+createHash('sha256').update(id).digest('hex');
      const [count,ttl]=await client.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('PTTL',KEYS[1])}",{keys:[name],arguments:[String(windowMs)]});
      return {allowed:Number(count)<=maximum,retryAfter:Math.max(1,Math.ceil(Number(ttl)/1000))};
    },
    async close(){if(client.isOpen)await client.close();}
  };
}
