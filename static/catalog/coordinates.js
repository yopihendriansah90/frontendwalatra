export function coordinates(latitude,longitude){
  const numeric=value=>(typeof value==='number'||typeof value==='string'&&value.trim()!=='')&&Number.isFinite(Number(value));
  if(!numeric(latitude)||!numeric(longitude))return null;
  const lat=Number(latitude),lon=Number(longitude);
  return Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null;
}
