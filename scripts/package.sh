#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python3 scripts/verify.py
python3 - <<'PY'
import json
from pathlib import Path
root=Path('.')
checks=json.loads((root/'evidence/catalog/staging-check.json').read_text())
assert checks['passed'] and checks['count'] >= 40
vibium=json.loads((root/'evidence/catalog/vibium-check.json').read_text())
assert vibium['passed'] and all(x['passed'] for x in vibium['checks'])
coverage=json.loads((root/'evidence/coverage.json').read_text())
assert coverage['catalog_snapshots']==0 and coverage['legacy_catalog_removed']
for file in ['dist/catalog/index.html','dist/banners/manifest.json','README.md','doc/product-catalog.md','doc/banners.md']:
    assert (root/file).is_file(), f'Missing {file}'
print('Pemeriksaan paket lulus: katalog dan banner API dengan cadangan snapshot, halaman terpilih, serta audit browser.')
PY
archive=walatra-herbal-frontend.tar.gz
tar --exclude='__pycache__' --exclude='*.pyc' -I 'pigz -1' -cf "$archive" dist retained README.md package.json package-lock.json requirements.txt .env.example .env.production.example deploy iconcategori scripts static/catalog static/brand static/banners static/legacy-bridge.js static/noop.js static/mirror.css doc tests evidence/coverage.json evidence/static-check.json evidence/catalog
sha256sum "$archive" > "$archive.sha256"
