"""Remove archived Natural Farm promotions from published HTML."""
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup

BRAND = re.compile(r'natural[\s._-]*farm', re.I)


def clean(markup, page):
    soup = BeautifulSoup(markup, 'html.parser')
    main = soup.select_one('#site-main')
    if main and (page == 'about-us/index.html' or BRAND.search(page)):
        main.clear()
        heading = soup.new_tag('h1')
        heading.string = 'Tentang Kami' if page == 'about-us/index.html' else 'Artikel tidak tersedia'
        main.append(heading)
        message = soup.new_tag('p')
        message.string = 'Informasi tentang Walatra Herbal belum tersedia.' if page == 'about-us/index.html' else 'Artikel ini sudah tidak tersedia. Silakan lihat artikel lainnya.'
        main.append(message)
    for node in list(soup.select('a[href],form[action],iframe[src]')):
        if node.parent is None:
            continue
        if BRAND.search(node.get('href', '') + node.get('action', '') + node.get('src', '')):
            node.decompose()
    for node in list(soup.select('meta,link[rel=canonical],script[type="application/ld+json"]')):
        if BRAND.search(str(node)):
            node.decompose()
    for text in list(soup.find_all(string=BRAND)):
        parent = getattr(text, 'parent', None)
        if not parent or parent.name in ('script', 'style'):
            continue
        block = parent.find_parent(['p', 'h1', 'h2', 'h3', 'h4', 'li'])
        if block is not None:
            block.decompose()
            continue
        if parent.name == 'title':
            text.replace_with('Tentang Kami' if page == 'about-us/index.html' else 'Artikel')
        elif parent.name in ('p', 'a', 'span', 'small', 'h1', 'h2', 'h3', 'h4', 'li', 'strong', 'em', 'b'):
            parent.decompose()
        else:
            text.extract()
    for node in list(soup.select('[alt],[title],[aria-label]')):
        for attr in ('alt', 'title', 'aria-label'):
            if BRAND.search(node.get(attr, '')):
                node[attr] = ''
    return str(soup)


if __name__ == '__main__':
    root = Path(sys.argv[1])
    changed = 0
    for page in root.rglob('*.html'):
        markup = page.read_text()
        if BRAND.search(markup):
            page.write_text(clean(markup, page.relative_to(root).as_posix()))
            changed += 1
    print(f'Pembersihan promosi Natural Farm: {changed} halaman.')
