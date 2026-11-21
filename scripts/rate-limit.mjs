export function memoryRateLimiter({maxKeys=10000,now=Date.now}={}){
  const buckets=new Map();let sweptAt=0;
  return async(key,limit,windowMs)=>{
    const time=now();
    if(time-sweptAt>=30000){for(const [id,item] of buckets)if(item.expiresAt<=time)buckets.delete(id);sweptAt=time;}
    let bucket=buckets.get(key);
    if(!bucket||bucket.expiresAt<=time){
      if(buckets.size>=maxKeys&&!buckets.has(key))throw Object.assign(new Error('Layanan sedang sibuk.'),{status:503});
      bucket={count:0,expiresAt:time+windowMs};buckets.set(key,bucket);
    }
    bucket.count++;
    return {allowed:bucket.count<=limit,retryAfter:Math.max(1,Math.ceil((bucket.expiresAt-time)/1000))};
  };
}
