"""Extract retained noncatalog pages, then remove the obsolete capture after QA."""
import argparse,json,re,shutil,subprocess,html
from pathlib import Path
from urllib.parse import urlsplit,unquote,parse_qsl,urlencode
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
DIST=ROOT/'dist';TARGET=ROOT/'retained'
CATALOG={'','product','bundle','cat','brand','search','trending','diseases','bestseller','brandweek','clearance','featured','flashsale','newproduct','promotion','sale','flash-sale','special-promo'}
INTERACTIVE={'health-tools','login','register','forgot-password','password','cart','paymentconfirm','paymentconfirmemail','sign-up','open','store'}
SLOTS='.product-card-v2,.product-card,.swipper-wrapper-product,.wrapper-product-categories,.related-product,.related-products'

def first(url):return urlsplit(url).path.strip('/').split('/')[0]
def key(url):
 p=urlsplit(url);q=urlencode(sorted(parse_qsl(p.query,keep_blank_values=True)));return (p.path.rstrip('/') or '/')+('?' +q if q else '')
def refs(text):
 values=re.findall(r'''(?:["'(=\s])(/(?:assets|_media|_nuxt|_fixtures)/[^\s"'<>)]*)''',text)
 return {unquote(html.unescape(s).split('?')[0]).lstrip('/') for s in values if '..' not in s}

def prepare():
 if (TARGET/'manifest.json').exists():print('Sumber retained sudah tersedia; tidak diekstrak ulang.');return
 coverage=json.loads((ROOT/'evidence/coverage.json').read_text())
 pages=[p for p in coverage['pages'] if first(p['url']) not in CATALOG]
 unique={p['file']:p for p in pages}
 TARGET.mkdir(exist_ok=True);(TARGET/'pages').mkdir(exist_ok=True);(TARGET/'assets').mkdir(exist_ok=True)
 states=[]
 for file,p in unique.items():
  if first(p['url']) in INTERACTIVE:
   raw=(DIST/file).read_text();match=re.search(r'<script[^>]*>(window\.__NUXT__=[\s\S]*?)</script>',raw)
   if match:states.append({'file':file,'script':match.group(1)})
 state_input=TARGET/'states.tmp.json';state_input.write_text(json.dumps(states))
 done=subprocess.run(['node',str(ROOT/'scripts/sanitize-health-state.mjs'),str(state_input)],check=True,capture_output=True,text=True)
 sanitized={p['file']:p['script'] for p in json.loads(done.stdout)};state_input.unlink()
 needed=set();queries={};retained=[]
 for index,(file,p) in enumerate(unique.items()):
  raw=(DIST/file).read_text();s=BeautifulSoup(raw,'html.parser');interactive=file in sanitized
  for node in s.select('script,iframe,noscript'):node.decompose()
  for node in s.select('link[rel=preload],link[rel=prefetch],link[rel=preconnect],link[rel=dns-prefetch]'):node.decompose()
  for meta in s.select('meta[name=viewport]'):meta['content']='width=device-width, initial-scale=1'
  for link in s.select('link[href="/mirror.css"]'):link.decompose()
  if not s.head or not s.body:continue
  if not s.html.get('lang'):s.html['lang']='id'
  for href in ['/mirror.css','/catalog/catalog.css']:
   tag=s.new_tag('link',rel='stylesheet',href=href);s.head.append(tag)
  for src in ['/catalog/config.js']:
   tag=s.new_tag('script',src=src,defer=True);s.head.append(tag)
  body=s.body
  if interactive:
   root=s.select_one('#__nuxt')
   if not root:continue
   for node in root.select('header,footer'):node.clear()
   for node in root.select(SLOTS):node.decompose()
   root.extract();body.clear();wrap=s.new_tag('div',attrs={'class':'w-legacy-app'});wrap.append(root)
   main=s.new_tag('main',id='site-main');main.append(wrap);body.append(main)
   for src in ['/legacy-fixtures.js','/legacy-bridge.js']:
    tag=s.new_tag('script',src=src);s.head.insert(0,tag)
   # Preserve the original health/account client, but no captured catalog state.
   state=s.new_tag('script');state.string=sanitized[file];body.append(state)
   original=BeautifulSoup(raw,'html.parser')
   for node in original.select('script[src^="/_nuxt/"]'):body.append(node.extract())
  else:
   root=s.select_one('#__layout > div')
   if root:
    content=[]
    for node in list(root.children):
     if not getattr(node,'name',None):continue
     if node.name=='header' or node.find('footer') or node.name=='footer':continue
     content.append(node.extract())
   else:content=[node.extract() for node in list(body.children) if getattr(node,'name',None)]
   body.clear();main=s.new_tag('main',id='site-main',attrs={'class':'w-legacy-content'})
   for node in content:main.append(node)
   for node in main.select(SLOTS):node.decompose()
   for link in main.select('a[href]'):
    parsed=urlsplit(link['href'])
    if parsed.path.startswith(('/brand/','/promotion/','/flashsale','/sale/','/diseases/')):link['href']='/product/'
   body.append(main)
  header=s.new_tag('div',id='site-header');body.insert(0,header)
  slot=s.new_tag('div',attrs={'class':'w-container w-live-slot','data-live-catalog':''});main.append(slot)
  body.append(s.new_tag('div',id='site-footer'));body['class']=['w-site']
  script=s.new_tag('script',type='module',src='/catalog/app.js');body.append(script)
  text=str(s);target=TARGET/'pages'/file;target.parent.mkdir(parents=True,exist_ok=True);target.write_text(text)
  needed.update(refs(text));retained.append({'url':p['url'],'file':file,'interactive':interactive})
  if index%150==0:print('Halaman nonkatalog:',index,'/',len(unique),flush=True)
 # Keep aliases and pagination only for retained pages.
 for p in pages:
  if (TARGET/'pages'/p['file']).exists():queries[key(p['url'])]=p['file']
 (TARGET/'queries.json').write_text(json.dumps(queries))
 # Only store-location fixtures remain; the catalog is exclusively live.
 fixture_index=json.loads(subprocess.run(['node','--input-type=module','-e',"import fs from 'node:fs';import vm from 'node:vm';const c={window:{}};vm.runInNewContext(fs.readFileSync('dist/mirror-data.js','utf8'),c,{timeout:3000});console.log(JSON.stringify(Object.fromEntries(Object.entries(c.window.__STATIC_FIXTURES__).filter(([k])=>/\\/api\\/(storelocation|select2\\/region-store)\\?/.test(k)))));"],cwd=ROOT,check=True,capture_output=True,text=True).stdout)
 (TARGET/'fixtures.js').write_text('window.__RETAINED_FIXTURES__='+json.dumps(fixture_index)+';\n')
 needed.update(v.lstrip('/') for v in fixture_index.values())
 # Nuxt's original health-tool runtime loads these chunks dynamically.
 needed.update(str(p.relative_to(DIST)) for p in (DIST/'_nuxt').glob('*.js'))
 pending=list(needed);seen=set();missing=[]
 while pending:
  file=pending.pop()
  if file in seen:continue
  seen.add(file);source=DIST/file
  if not source.is_file():missing.append(file);continue
  target=TARGET/'assets'/file;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
  if source.suffix in {'.css','.js','.json','.svg'}:
   for ref in refs(source.read_text(errors='replace')):
    if ref not in seen:pending.append(ref)
 manifest={'pages':retained,'aliases':len(queries),'fixtures':len(fixture_index),'assets':len(seen)-len(missing),'source_missing_assets':missing,'removed_catalog_routes':sum(first(p['url']) in CATALOG for p in coverage['pages'])}
 (TARGET/'manifest.json').write_text(json.dumps(manifest,indent=2));print(json.dumps({k:v for k,v in manifest.items() if k not in ['pages','source_missing_assets']}))

def commit():
 if not (TARGET/'manifest.json').exists():raise SystemExit('Sumber nonkatalog belum disiapkan.')
 check=ROOT/'evidence/catalog/staging-check.json'
 if not check.exists() or not json.loads(check.read_text()).get('passed'):raise SystemExit('Pemeriksaan staging wajib lulus sebelum checkpoint lama dihapus.')
 subprocess.run(['node',str(ROOT/'scripts/build-local.mjs')],check=True,cwd=ROOT)
 shutil.rmtree(ROOT/'.capture',ignore_errors=True)
 for name in ['naturalfarm-static.tar.gz','naturalfarm-static.tar.gz.sha256','static/search.html','static/mirror.js']:
  p=ROOT/name
  if p.exists():p.unlink()
 print('Snapshot katalog dan checkpoint lama dihapus; sumber nonkatalog tersedia di retained/.')

def refresh_interactive():
 manifest=json.loads((TARGET/'manifest.json').read_text());records=[]
 for p in manifest['pages']:
  if not p['interactive']:continue
  raw=(DIST/p['file']).read_text();match=re.search(r'<script[^>]*>(window\.__NUXT__=[\s\S]*?)</script>',raw)
  if match:records.append({'file':p['file'],'script':match.group(1)})
 temp=TARGET/'states.tmp.json';temp.write_text(json.dumps(records))
 clean=json.loads(subprocess.run(['node',str(ROOT/'scripts/sanitize-health-state.mjs'),str(temp)],capture_output=True,text=True,check=True).stdout);temp.unlink()
 for record in clean:
  original=BeautifulSoup((DIST/record['file']).read_text(),'html.parser');root=original.select_one('#__nuxt')
  for node in root.select('header,footer'):node.clear()
  for node in root.select(SLOTS):node.decompose()
  target=TARGET/'pages'/record['file'];s=BeautifulSoup(target.read_text(),'html.parser');s.select_one('#__nuxt').replace_with(root.extract())
  for script in s.select('script:not([src])'):
   if 'window.__NUXT__' in (script.string or ''):script.string=record['script']
  target.write_text(str(s))
 print('Halaman interaktif disegarkan:',len(clean))

if __name__=='__main__':
 parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group(required=True);group.add_argument('--prepare',action='store_true');group.add_argument('--commit',action='store_true');group.add_argument('--refresh-interactive',action='store_true');args=parser.parse_args();prepare() if args.prepare else refresh_interactive() if args.refresh_interactive else commit()
