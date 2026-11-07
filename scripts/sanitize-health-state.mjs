import fs from 'node:fs';
import vm from 'node:vm';
const records=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const keys=['Product','ProductAndFilter','Category','Brand','Diseases','FlashSale','SmartPromo','Home','Promo','SearchAndBar','Cart','Compare','Wishlist','Review','ReviewAndDiscuss','PageReview'];
function empty(value){if(Array.isArray(value))return [];if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,empty(v)]));return typeof value==='boolean'?false:typeof value==='number'?0:typeof value==='string'?'':value;}
for(const record of records){
  const context={window:{}};vm.runInNewContext(record.script,context,{timeout:3000,contextCodeGeneration:{strings:false,wasm:false}});
  const state=context.window.__NUXT__;
  for(const key of keys)if(state.state?.[key])state.state[key]=empty(state.state[key]);
  state.serverRendered=true;record.script='window.__NUXT__='+JSON.stringify(state).replace(/</g,'\\u003c')+';';
}
process.stdout.write(JSON.stringify(records));
