"""Offline browser regression checks for bundle component navigation and photos."""
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://bundle.test'
PHOTO = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#dce9d5"/><rect x="24" y="8" width="16" height="48" fill="#00594a"/></svg>'


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        for width in (1440, 390):
            page = browser.new_page(viewport={'width': width, 'height': 900})
            calls, errors = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))

            def route(request):
                path = urlsplit(request.request.url).path
                if path.startswith('/auth/session'):
                    request.fulfill(status=401, json={'success': False, 'message': 'Belum login'})
                elif path.startswith('/api/v1/'):
                    endpoint = path.removeprefix('/api/v1')
                    data = []
                    if endpoint == '/catalog/bundles/fixture':
                        items = [{'product': {'slug': 'herbal', 'name': 'Herbal'}, 'variant': {'id': 2, 'name': 'Besar', 'image_url': BASE+'/broken.jpg'}, 'quantity': 1}, {'product': {'slug': 'herbal', 'name': 'Herbal'}, 'variant': {'id': 3, 'name': 'Kecil'}, 'quantity': 1}]
                        items += [{'product': {'slug': f'herbal-{n}', 'name': f'Herbal {n}'}, 'variant': {'id': 2, 'name': 'Besar'}, 'quantity': 1} for n in range(20)]
                        data = {'id': 1, 'name': 'Bundle Uji', 'slug': 'fixture', 'price': '40000', 'items': items, 'stores': [{'listing_id': 1, 'store': {'id': 1, 'name': 'Toko Uji'}, 'images': [{'url': BASE+'/photo.svg'}]}]}
                    elif endpoint.startswith('/catalog/products/'):
                        calls.append(endpoint)
                        data = {'id': 2, 'name': 'Herbal', 'slug': endpoint.rsplit('/', 1)[1], 'variants': [{'id': 1, 'name': 'Default', 'price': '10000'}, {'id': 2, 'name': 'Besar', 'price': '20000', 'image_url': BASE+'/broken.jpg'}, {'id': 3, 'name': 'Kecil', 'price': '10000', 'image_url': BASE+'/photo.svg'}], 'stores': [{'listing_id': 2, 'store': {'name': 'Toko Uji'}, 'images': [{'url': BASE+'/photo.svg'}]}]}
                    request.fulfill(json={'success': True, 'data': data})
                elif path == '/broken.jpg':
                    request.fulfill(status=404, body='not found')
                elif path == '/photo.svg':
                    request.fulfill(content_type='image/svg+xml', body=PHOTO)
                else:
                    if path.startswith(('/bundle/', '/product/')):
                        file = ROOT/'static/catalog/index.html'
                    else:
                        file = ROOT/'static'/path.lstrip('/')
                        if not file.is_file():
                            file = ROOT/'dist'/path.lstrip('/')
                    if path == '/catalog/config.js':
                        request.fulfill(content_type='application/javascript', body=f'globalThis.WALATRA_CONFIG={{apiBaseURL:"{BASE}/api/v1"}};')
                    elif file.is_file():
                        request.fulfill(content_type=mimetypes.guess_type(file.name)[0] or 'application/octet-stream', body=file.read_bytes())
                    else:
                        request.fulfill(status=404, body='not found')

            page.route(BASE+'/**', route)
            page.goto(BASE+'/bundle/fixture/')
            page.wait_for_function("document.querySelectorAll('.w-components li').length===22")
            first = page.locator('.w-component-link').first
            first.scroll_into_view_if_needed()
            page.wait_for_function("document.querySelector('.w-component-media img')?.src.endsWith('/photo.svg') && document.querySelector('.w-component-media img')?.naturalWidth>0")
            assert first.get_attribute('href') == '/product/herbal/?variant=2'
            assert calls.count('/catalog/products/herbal') == 1
            assert len(calls) < 21, 'Offscreen products should not fetch details yet'
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            page.screenshot(path=f'/tmp/bundle-fixed-{width}.png')
            first.click()
            page.wait_for_function("document.querySelector('.w-detail')?.dataset.variantId==='2'")
            assert not errors, errors
            print(f'PASS {width}px: broken photo recovered, details shared, offscreen requests deferred, correct variant opened')
            page.close()
        browser.close()


if __name__ == '__main__':
    main()
