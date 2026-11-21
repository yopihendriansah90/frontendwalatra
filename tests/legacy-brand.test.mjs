import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

test('Published archives remove old brand promotions while preserving Walatra and reference links',()=>{
  const result=execFileSync('python3',['-c',`
import runpy
from bs4 import BeautifulSoup
clean=runpy.run_path('scripts/remove-legacy-brand.py')['clean']
markup='<main id="site-main"><h1>Artikel kesehatan</h1><p>Informasi artikel.</p><p>Belanja di <strong>Natural Farm</strong>.</p><a href="https://www.google.com/preferences/source?q=naturalfarm.id">Ikuti</a><a href="https://play.google.com/store/apps/details?id=com.app.naturalfarmapp">Aplikasi</a><a href="https://www.instagram.com/naturalfarm.id/">Instagram</a><a href="https://walatraherbal.com/cek_keaslian">Cek Keaslian</a><a href="https://pubmed.ncbi.nlm.nih.gov/123/">Referensi</a></main>'
soup=BeautifulSoup(clean(markup,'blog/artikel/index.html'),'html.parser')
assert 'Natural Farm' not in soup.get_text()
assert 'Belanja di' not in soup.get_text()
assert len(soup.select('a'))==2
assert soup.h1.string=='Artikel kesehatan'
assert 'Informasi artikel.' in soup.get_text()
about=clean('<main id="site-main"><h1>Tentang Natural Farm</h1><p>Berdiri sejak 1995</p></main>','about-us/index.html')
assert '1995' not in about
assert 'Informasi tentang Walatra Herbal belum tersedia.' in about
print('PASS')
`],{encoding:'utf8'});
  assert.match(result,/PASS/);
});
