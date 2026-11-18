export function createNotifications(Swal){
  let queue=Promise.resolve();
  const pending=new Map();
  return function notify(options){
    const key=options.showCancelButton?null:JSON.stringify([options.icon,options.title,options.text]);
    if(key&&pending.has(key))return pending.get(key);
    const result=queue.then(()=>Swal.fire({
      confirmButtonText:'OK',cancelButtonText:'Batal',confirmButtonColor:'#075446',
      customClass:{popup:'w-swal-popup',confirmButton:'w-swal-confirm'},
      ...options
    }));
    queue=result.catch(()=>{});
    if(key){
      pending.set(key,result);
      result.then(()=>pending.delete(key),()=>pending.delete(key));
    }
    return result;
  };
}
