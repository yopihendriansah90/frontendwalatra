# Walatra Herbal, katalog dan akun

Frontend Walatra memakai API untuk katalog produk, bundle, kategori, ikon, banner, login, profil, alamat customer, cart, checkout, pesanan, pembayaran, dan pencarian lokasi pengiriman. Request customer terproteksi melewati bridge Node same-origin. Data katalog tidak disimpan dalam build.

## Jalankan lokal

Salin `.env.example` menjadi `.env`, lalu sesuaikan `API_BASE_URL` dan pengaturan web di satu tempat tersebut. Nilai pada environment proses mengalahkan nilai `.env`. Katalog, banner, dan lokasi publik memakai base URL yang disuntikkan saat build; OTP, profil, alamat, dan sesi login melewati bridge Node same-origin. Bridge meneruskan endpoint customer dengan token Sanctum yang tersimpan di memori server, bukan di browser.

```sh
npm run dev
```

Buka alamat dari `WEB_HOST` dan `WEB_PORT` (default `http://localhost:5173`). `npm run dev` membuat build lalu menjalankan server lokal. Untuk build saja gunakan `npm run build`, dan untuk menjalankan hasil build gunakan `npm start`. Semua pilihan API dan web yang tersedia tercantum di `.env.example`. Perubahan `API_BASE_URL` memerlukan build ulang dan restart server. Untuk deployment di balik reverse proxy, set `APP_ORIGIN` ke origin publik dan aktifkan `COOKIE_SECURE=true` saat menggunakan HTTPS.

Hosting statis dapat menyajikan katalog dan halaman arsip memakai rewrite di `dist/_redirects`, tetapi login dan profil memerlukan server Node yang menjalankan `scripts/serve-local.mjs` beserta bridge sesi. Jalankan satu instance server aktif, atau pindahkan penyimpanan sesi ke store bersama sebelum menjalankan beberapa instance.

## Perilaku katalog

Beranda, produk, bundle, pencarian, kategori, filter, dan pagination membaca API secara langsung. Ikon kategori memakai `icon_url` dari API. Perubahan katalog tampil saat halaman dimuat ulang. Jika API gagal, halaman menunjukkan pesan dan tombol coba lagi tanpa memakai data katalog lama.

Data yang tidak diberikan API—misalnya stok, diskon, rating, atau jumlah terjual—tidak direka. Jika gambar produk kosong atau gagal dimuat, kartu menampilkan “Gambar belum tersedia”. Kategori beranda ditampilkan satu baris dan dapat digeser ke samping. Banner beranda membaca `GET /api/v1/banners`, memetakan `position` `main`, `secondary_top`, dan `secondary_bottom` ke slot tampilannya, serta mengikuti `image_url`, `cta_url`, dan `open_in_new_tab`. Jika API gagal atau belum memiliki banner aktif, gambar snapshot beranda dipakai sementara. Banner API otomatis menjadi prioritas saat tersedia.

Login WhatsApp mendukung request/resend OTP, verifikasi, pelengkapan profil, melihat profil, dan logout. Halaman Alamat Saya mendukung daftar, tambah, ubah, hapus, dan pengaturan alamat utama. Pilihan provinsi sampai kelurahan/desa memakai endpoint lokasi Everpro. Token API hanya berada di memori server; cookie browser berisi ID sesi `HttpOnly`. Halaman artikel, informasi, lokasi toko, dan alat kesehatan yang sebelumnya tersedia dipertahankan sebagai halaman statis atau UI arsip.

Cart `/cart/` membaca barang dari API, mengelompokkan per toko, dan menyediakan pilihan per item/toko/semua barang tersedia. Item tidak tersedia dapat dihapus, tetapi tidak dapat dipilih atau diubah quantity-nya. Ringkasan pilihan menggunakan `selection` backend. Checkbox dikelola di halaman; tidak disimpan ke database.

Checkout `/checkout/` menerima `cart_item_ids[]` dari keranjang, memakai alamat tersimpan, dan meminta preview sebelum order baru. Harga/ongkir serta token berasal dari backend. Preview kedaluwarsa setelah 15 menit dan perubahan checkout mengharuskan preview ulang. Permintaan order yang belum pasti disimpan di `sessionStorage` per akun agar reload/retry memakai key dan payload yang sama; penyimpanan ini berisi ID item, ID alamat, token preview, dan key retry, tanpa Bearer token.

Pesanan `/orders/` dan `/orders/:id/` menampilkan snapshot, status, pembatalan, serta pembayaran sesuai provider backend. Midtrans memakai instruksi VA, Mandiri Bill, atau QRIS melalui Core API. Gambar QRIS diambil melalui bridge berautentikasi dan ditampilkan sebagai blob. Key pembayaran disimpan terpisah per akun/order untuk pemulihan timeout dan `202 PAYMENT_PROCESSING`. Mengganti metode yang sudah terkonfirmasi memakai key baru. Halaman order membaca status tersimpan setiap 15 detik saat tab terlihat; tombol sinkronisasi memanggil provider dan dapat memulihkan charge sesuai kontrak backend. Status akhir selalu mengikuti backend. Mode manual menampilkan instruksi admin dan simulasi diberi label.

Deployment membutuhkan server Node untuk `/auth/session/*`, bukan hosting statis saja. Sesi saat ini disimpan di memori proses; restart server memerlukan login ulang. Lingkungan pembayaran, metode aktif, stok, ongkir, worker, dan webhook mengikuti konfigurasi backend. Implementasi frontend tidak membuktikan settlement pembayaran nyata.

## Pemeriksaan

```sh
npm test
npm run verify
npm run test:browser
```

Audit browser memerlukan Python Playwright/Chromium dan API lokal yang berjalan. Contoh untuk alamat lain: `CATALOG_TEST_API=http://127.0.0.1:8000/api/v1 CATALOG_TEST_URL=http://127.0.0.1:5173 npm run test:browser`.

Tes commerce terisolasi: jalankan `npm run build`, mulai frontend dengan `node scripts/serve-local.mjs --port 5199`, lalu `python3 tests/commerce-browser.py`. Tes ini mengganti respons API di browser, tanpa menulis ke akun customer atau membuat charge provider. Bukti visual dan hasil disimpan di `/tmp/walatra-commerce-evidence`.
