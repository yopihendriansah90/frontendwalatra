# Penerapan cart, checkout, dan pembayaran frontend

Acuan kontrak: `cart-checkout-payment-flow.md`, `cart-management.md`, serta resource dan controller API pada checkout backend lokal. Tidak ada perubahan backend pada pekerjaan ini.

## Implementasi

- `static/catalog/commerce.js`: cart terpilih, preview, order, pembayaran, pembatalan, dan pembacaan status berkala.
- `static/catalog/auth-client.js`: query pilihan, kode error, key idempotency, serta pengambilan PNG.
- `scripts/auth-session.mjs`: whitelist endpoint customer, penerusan query/key, dan QR berautentikasi. Bearer token tetap di server.
- Router frontend, server, dan hasil build melayani `/cart/`, `/checkout/`, `/orders/`, dan `/orders/:id/`. Halaman arsip mengarahkan tautan transaksi ke halaman baru.

Semua barang tersedia otomatis dipilih setiap kali halaman cart dibuka. Pilihan checkbox berada di memori halaman; mengubah quantity atau menghapus barang mempertahankan pilihan pengguna, termasuk jika semua centang sengaja dilepas. Ringkasan berasal dari `selection` backend. Data cart tidak tersedia tetap terlihat dan dapat dihapus. Request perubahan dikunci selama berjalan.

Preview wajib untuk order baru dan kedaluwarsa setelah 15 menit. Payload dan key order yang belum pasti tersimpan di sessionStorage per akun. Retry memakai permintaan yang sama meskipun halaman dimuat ulang; key pembayaran terpisah per akun/order. Penyimpanan yang gagal menghentikan request, sehingga mutasi tidak dikirim tanpa key retry yang tersimpan.

Status order mengendalikan tindakan. Status attempt tidak dianggap sebagai status akhir order. Pembayaran manual dan simulasi mengikuti respons backend. Polling memakai GET setiap 15 detik saat tab terlihat; sinkronisasi provider hanya lewat tindakan pengguna. QR diambil melalui bridge menggunakan ID order/payment, tanpa mengambil URL backend arbitrer.

## Verifikasi dan batasnya

- `npm test`: 10 tes client/model dan integrasi HTTP bridge lulus.
- `npm run build`: build berhasil.
- `npm run verify`: 2.366 halaman arsip, dua fixture, tanpa error.
- `tests/commerce-browser.py`: skenario terisolasi meliputi pilihan toko/item, quantity server, barang tidak tersedia, preview/harga berubah, token kedaluwarsa, retry setelah reload, `202`, pergantian metode, VA, QRIS, polling, status paid, manual/simulasi, pembatalan, pagination, keyboard, dan breakpoint mobile/desktop.
- Screenshot: `/tmp/walatra-commerce-evidence/`.

Browser memakai respons API tiruan. Tes bridge memakai server HTTP lokal. Belum dilakukan order customer nyata, charge sandbox, settlement, atau webhook publik. Konfigurasi produksi dan worker pembayaran tetap tanggung jawab deployment backend. Sesi Node masih disimpan di memori proses; restart memerlukan login ulang.

## Pemeriksaan tampilan yang berubah

Design Read: halaman transaksi Walatra untuk pembeli produk herbal, mengikuti logo, Montserrat, warna hijau, dan struktur per toko yang sudah ada. ENERGY 1 / RHYTHM 1 / MOTION 1. Aksen hijau menunjukkan tindakan utama; panel memisahkan alamat, barang, dan pembayaran. Tidak menambahkan dekorasi atau aset visual.

Status pemeriksaan berikut berlaku pada halaman commerce yang diubah, bukan audit seluruh halaman arsip.

| Aturan | Status dan bukti |
|---|---|
| R-01 | PASS: warna datar dari tema Walatra; tanpa gradient/glow baru. |
| R-02 | PASS: teks UI commerce tidak memakai em dash. |
| R-03 | PASS: browser mengukur lebar dokumen pada cart, checkout, dan pembayaran mobile. |
| R-04 | PASS: memakai kontrol native dan ikon navigasi yang sudah ada. |
| R-05 | PASS: komposisi mengikuti daftar barang, alamat, total, dan instruksi transaksi. |
| R-06 | PASS: font Montserrat mengikuti tema eksisting; tanpa tipografi dekoratif baru. |
| R-07 | PASS: tanpa pola latar baru. |
| R-08 | PASS: tombol baru menggunakan teks tindakan tanpa panah dekoratif. |
| R-09 | PASS: tidak menambahkan badge pemasaran. |
| R-10 | PASS: panel commerce memakai latar solid. |
| R-11 | PASS: radius mengikuti kontrol dan panel yang sudah ada. |
| R-12 | PASS: panel commerce menggunakan border, tanpa shadow baru. |
| R-13 | PASS: tidak menambahkan glow. |
| R-14 | PASS: satu baris per item dan satu panel per fungsi transaksi. |
| R-15 | PASS: tindakan spesifik: lanjut checkout, buat pesanan, baca ulang status, batalkan pesanan. |
| R-16 | PASS: tanpa klaim pemasaran AI pada teks commerce. |
| R-17 | PASS: angka item dan nominal berasal dari respons API. |
| R-18 | PASS: tidak menambahkan testimonial. |
| R-19 | PASS: tidak menambahkan animasi commerce; drawer mengikuti navigasi yang ada. |
| R-20 | PASS: logo, warna, font, dan konten herbal mengikuti proyek Walatra. |
| R-21 | PASS: mempertahankan tema terang proyek. |
| R-22 | PASS: tidak menambahkan ilustrasi. |
| R-23 | PASS: memakai logo dan placeholder eksisting; halaman order sesuai lingkup yang disetujui. |
| R-24 | PASS: route cart/checkout/order tersedia di SPA, server, dan rewrite build. |
| R-25 | PASS: checker mengukur teks sekunder #52645a/putih 6,31:1, peringatan 8,33:1, tombol utama 8,88:1, teks item 4,82:1. |
| R-26 | PASS: kontrol commerce memiliki handler API, navigasi nyata, atau disabled sesuai status. |
| R-27 | PASS: tersedia loading, error/retry, cart kosong, dan metode pembayaran belum tersedia. |
| R-28 | PASS: tidak menambahkan FAQ. |
| R-29 | PASS: mempertahankan warna tema dan warna peringatan untuk status. |
| R-30 | PASS: mengikuti struktur cart Walatra yang sudah ada. |
| R-31 | PASS: hierarki panel, daftar, dan total dijelaskan pada Design Read. |
| R-32 | PASS: checkbox/select/button native, outline fokus, pengujian fokus pembayaran dan Escape drawer. |
| R-33 | PASS: perubahan sumber dilakukan dengan apply_patch. |
| R-34 | PASS: tidak menambahkan toggle atau mode tema baru. |
| R-35 | PASS: build dan interaksi commerce dijalankan melalui Playwright; tanpa error JavaScript. |
| R-36 | PASS: tanpa klaim keamanan, pelanggan, atau performa baru. |
| R-37 | PASS: arah visual mengikuti tema proyek; dials tercatat di atas. |
| R-38 | PASS: data UI berasal dari API; fixture pengujian hanya digunakan di browser tes. |
| R-39 | PASS: kontrol native dengan nama aksesibel; gambar berdimensi dan berlabel; CSS reduced-motion eksisting dipertahankan. |
| R-40 | PASS: gambar cart/snapshot berdimensi; area QR memiliki ruang yang disediakan; tanpa skrip eksternal baru. |
| Liveliness | PASS: total/tindakan sebagai fokus, whitespace memisahkan fungsi, aksen hijau dan pengelompokan toko mengikuti identitas proyek. |
| C-1 | PASS: keputusan visual mengikuti tema dan kebutuhan transaksi. |
| C-2 | PASS: tindakan utama diuji dengan respons API terisolasi. |
| C-3 | PASS: setiap panel berisi informasi pembelian atau tindakan transaksi. |
| C-4 | PASS: kondisi kosong, request berjalan, gagal, retry, serta tampilan mobile/desktop diuji. |
| C-5 | PASS: status dan nominal mengikuti backend; simulasi diberi label. |
