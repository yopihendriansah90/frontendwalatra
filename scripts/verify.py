"""Check the live-catalog build and retained noncatalog pages."""
import json,re,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; DIST=ROOT/'dist'
manifest=json.loads((ROOT/'retained/manifest.json').read_text())
coverage=json.loads((ROOT/'evidence/coverage.json').read_text())
errors=[]
for entry in manifest['pages']:
    f=DIST/entry['file']
    if not f.is_file(): errors.append('Missing retained page: '+entry['file']); continue
    html=f.read_text(errors='replace')
    for src in re.findall(r"""<(?:script|link)[^>]+(?:src|href)=[\"']([^\"']+)""",html,re.I):
        if src.startswith('/') and not (DIST/src.split('?',1)[0].lstrip('/')).is_file(): errors.append('Missing local asset: '+src)
for f in (DIST/'_fixtures').glob('*.json'):
    try: json.loads(f.read_text())
    except Exception as e: errors.append(str(f.relative_to(DIST))+': '+str(e))
if not (DIST/'catalog/index.html').is_file(): errors.append('Missing dynamic catalog shell')
if not (DIST/'banners/manifest.json').is_file(): errors.append('Missing archived banner manifest')
if '/ /catalog/index.html 200' not in (DIST/'_redirects').read_text(): errors.append('Missing homepage rewrite')
for route in ('product','search','bundle','cat'):
    if not (DIST/'_redirects').read_text().count('/'+route+'/*'): errors.append('Missing rewrite route: '+route)
if coverage.get('catalog_snapshots') != 0: errors.append('Catalog snapshots remain in build')
result={'retained_pages_checked':len(manifest['pages']),'fixtures_checked':len(list((DIST/'_fixtures').glob('*.json'))),'catalog_snapshots':coverage.get('catalog_snapshots'),'banner_assets':len(list((DIST/'banners').glob('*')))-1,'errors':errors}
(ROOT/'evidence/static-check.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
if errors: sys.exit(1)
