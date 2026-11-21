export function requestURL(target){
  try{
    if(typeof target!=='string'||!target.startsWith('/')||target.startsWith('//')||target.includes('\\'))throw new Error();
    const url=new URL(target,'http://localhost');
    decodeURIComponent(url.pathname);
    return url;
  }catch{throw Object.assign(new Error('URL permintaan tidak valid.'),{status:400});}
}
