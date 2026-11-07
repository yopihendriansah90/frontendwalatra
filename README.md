# Walatra Herbal, katalog dan akun

Frontend Walatra memakai katalog produk, bundle, kategori, ikon, dan banner promosi dari API. Login customer dan profil memakai bridge Node same-origin. Data katalog tidak disimpan dalam build.

## Jalankan lokal

Salin `.env.example` menjadi `.env`, lalu sesuaikan alamat API dan pengaturan web di satu tempat tersebut. Nilai pada environment proses mengalahkan nilai `.env`. Browser mengakses katalog dan banner langsung memakai konfigurasi yang disuntikkan saat build; OTP, profil, dan sesi login melewati bridge Node same-origin. Bridge meneruskan autentikasi ke API dan menyimpan token Sanctum di memori server, bukan di browser.

```sh
npm run dev
```

Buka alamat dari `WEB_HOST` dan `WEB_PORT` (default `http://localhost:5173`). `npm run dev` membuat build lalu menjalankan server lokal. Untuk build saja gunakan `npm run build`, dan untuk menjalankan hasil build gunakan `npm start`. Semua pilihan API dan web yang tersedia tercantum di `.env.example`. Perubahan konfigurasi katalog dan pencarian memerlukan build ulang; perubahan konfigurasi server autentikasi dibaca saat server dimulai ulang. Untuk deployment di balik reverse proxy, set `APP_ORIGIN` ke origin publik dan aktifkan `COOKIE_SECURE=true` saat menggunakan HTTPS.

Hosting statis dapat menyajikan katalog dan halaman arsip memakai rewrite di `dist/_redirects`, tetapi login dan profil memerlukan server Node yang menjalankan `scripts/serve-local.mjs` beserta bridge sesi. Jalankan satu instance server aktif, atau pindahkan penyimpanan sesi ke store bersama sebelum menjalankan beberapa instance.

## Perilaku katalog

Beranda, produk, bundle, pencarian, kategori, filter, dan pagination membaca API secara langsung. Ikon kategori memakai `icon_url` dari API. Perubahan katalog tampil saat halaman dimuat ulang. Jika API gagal, halaman menunjukkan pesan dan tombol coba lagi tanpa memakai data katalog lama.

Data yang tidak diberikan API—misalnya stok, diskon, rating, atau jumlah terjual—tidak direka. Jika gambar produk kosong atau gagal dimuat, kartu menampilkan “Gambar belum tersedia”. Kategori beranda ditampilkan satu baris dan dapat digeser ke samping. Banner beranda membaca `GET /api/v1/banners`, memetakan `position` `main`, `secondary_top`, dan `secondary_bottom` ke slot tampilannya, serta mengikuti `image_url`, `cta_url`, dan `open_in_new_tab`. Jika API gagal atau belum memiliki banner aktif, gambar snapshot beranda dipakai sementara. Banner API otomatis menjadi prioritas saat tersedia.

Login WhatsApp mendukung request/resend OTP, verifikasi, pelengkapan profil, melihat profil, dan logout. Token API hanya berada di memori server; cookie browser berisi ID sesi `HttpOnly`. Checkout, pembayaran, dan transaksi tetap tidak diaktifkan sebagai backend. Halaman artikel, informasi, lokasi toko, dan alat kesehatan yang sebelumnya tersedia dipertahankan sebagai halaman statis atau UI arsip.

## Pemeriksaan

```sh
npm test
npm run verify
npm run test:browser
```

Audit browser memerlukan Python Playwright/Chromium dan API lokal yang berjalan. Contoh untuk alamat lain: `CATALOG_TEST_API=http://127.0.0.1:8000/api/v1 CATALOG_TEST_URL=http://127.0.0.1:5173 npm run test:browser`.
