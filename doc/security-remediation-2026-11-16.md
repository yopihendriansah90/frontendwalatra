**Perbaikan keamanan Walatra, 16 November 2026**

Pekerjaan mencakup frontend dan backend terintegrasi, berdasarkan [audit awal](security-audit-2026-11-16.md). Perubahan lokal lain yang sudah ada dipertahankan.

1. Handler HTTP menangkap URL cacat dan exception per request; tes membuktikan proses tetap hidup setelah request tidak valid. Respons upstream 5xx tidak lagi meneruskan trace/detail internal ke browser. Dotfile dan symlink yang keluar dari document root ditolak.
2. Paket Composer diperbarui dalam constraint project. Laravel 12.72.0, Filament 5.11.4, Livewire 4.4.8, dan patch Symfony yang terpasang melewati audit Composer. Tes banner lama diselaraskan dengan carousel tanpa area; tes OTP diselaraskan dengan kuota yang berlaku.
3. Identitas client ditandatangani HMAC-SHA256, mencakup timestamp, IP, method, dan path. Backend mengabaikan identitas yang kadaluwarsa atau bertanda tangan salah. Header IP dari internet tidak dipercaya langsung. Bridge juga membatasi request OTP, dan kuota disimpan bersama di Redis.
4. Webhook dibatasi 16 KiB dan 300 request/menit per IP. Payload/signature tidak valid ditolak sebelum penulisan log penuh. Signature valid dan retry tetap memakai durable inbox. Nama penerima, catatan alamat, dan koordinat presisi disaring dari log API eksternal. `logs:prune-external --dry-run` memeriksa retensi; scheduler menjalankan retensi harian, default 30 hari.
5. Session production menggunakan Redis dengan key ID yang di-hash dan token yang dienkripsi AES-256-GCM. TTL bersifat absolut; membaca session tidak memperpanjangnya tanpa batas. Logout menghapus session bersama. Redis yang tidak tersedia tidak menyebabkan fallback ke autentikasi lokal yang longgar. Memory store hanya untuk development/test.
6. Production menolak konfigurasi yang tidak aman. Header framing, CSP, referrer, dan permissions ditambahkan. Script inline arsip menggunakan hash CSP; `unsafe-inline` dan `unsafe-eval` tidak diaktifkan untuk script. `connect-src blob:` diperlukan untuk fixture lokal halaman arsip, bukan untuk mengeksekusi script. HSTS diterapkan pada mode production HTTPS.

Uji browser juga menemukan dan memperbaiki dua bug checkout: pilihan alamat/metode sekarang dikunci segera setelah intent pembuatan order disimpan, dan variabel status pembayaran tersedia pada seluruh lingkup panel instruksi. Pemulihan setelah reload tidak lagi mengklaim pesanan sudah dibuat ketika hasil request belum pasti.

**Pengaturan development lokal**

Redis lokal telah diaktifkan pada `.env` frontend. Secret bridge frontend/backend dibuat konsisten, dan kunci enkripsi session dibuat tanpa menampilkannya ke log atau file publik. File `.env` tetap diabaikan Git. Test Redis menggunakan prefix acak terpisah dan membersihkan hanya key milik tes.

**Deployment production**

- Gunakan `.env.production.example` frontend sebagai acuan. Gabungkan acuan backend dengan konfigurasi database, `APP_KEY`, queue, dan integrasi yang sudah disediakan operator. Domain contoh harus diganti dengan domain sebenarnya.
- Buat `SESSION_ENCRYPTION_KEY` dan secret bridge acak minimal 32 karakter. Samakan `BACKEND_BRIDGE_SECRET` frontend dengan `FRONTEND_BRIDGE_SECRET` backend. Semua instance frontend harus memakai key enkripsi dan prefix Redis yang sama. Jangan salin key ke JavaScript browser.
- Pasang Redis pada jaringan privat. Koneksi Redis remote production wajib `rediss://`; Redis loopback boleh memakai `redis://`. Atur autentikasi dan ACL Redis sesuai lingkungan server. Kegagalan Redis harus dipantau dan tidak ditangani dengan menonaktifkan session store bersama.
- `TRUSTED_PROXY_IPS` hanya berisi IP/subnet proxy yang benar-benar Anda kelola. Contoh Nginx di `deploy/nginx.conf.example` mengganti header client dengan `$remote_addr`. Untuk beberapa proxy berantai, konfigurasikan rantai tepercaya secara eksplisit. Jangan membuka Node ke internet sambil mempercayai sembarang alamat proxy.
- Frontend wajib `NODE_ENV=production`, origin dan API publik HTTPS, secure cookie, Redis, secret yang memadai, dan CSP enforce. Backend wajib `APP_ENV=production`, debug dan OTP exposure nonaktif, secure cookie, serta secret bridge yang memadai. NTP antar server harus konsisten karena signature identity berlaku 30 detik.
- Document root backend adalah direktori `public`; document root frontend tetap `dist`. Sajikan frontend melalui Node/proxy agar session bridge dan header/hash CSP diterapkan. Jangan mempublikasikan root repository atau folder evidence.
- Jalankan `npm ci`, `npm run build`, Composer install dari lockfile, dan restart proses aplikasi setelah perubahan env/server. Jalankan scheduler Laravel agar rekonsiliasi pembayaran dan retensi log berjalan. Perubahan ini tidak memerlukan migrasi database baru.
- Review log historis dan backup yang dibuat sebelum sanitasi: filter baru berlaku pada pencatatan berikutnya. Retensi harian menghapus log di luar masa simpan; audit akses/backup tetap menjadi tanggung jawab operator production.
- Sebelum mengalihkan trafik, uji certificate/redirect HTTPS, header aktual proxy, cookie Secure/HttpOnly, login/logout antar instance, pemilihan alamat, retry order, VA/QRIS, webhook, dan permission panel. Gunakan mode sandbox/tiruan saat pengujian pembayaran.

**Verifikasi**

Jalankan `npm test`, `npm audit`, `npm run build`, dan `npm run verify` pada frontend. Tes Redis memerlukan Redis lokal, atau `TEST_REDIS_URL` khusus. Browser memakai `COMMERCE_TEST_URL` / `CATALOG_TEST_URL`; jangan menonaktifkan CSP untuk menjalankan suite. Jalankan `composer audit` dan `vendor/bin/phpunit` pada backend dengan konfigurasi pengujian SQLite memory.

Audit akhir dan hasil perintah dicatat setelah seluruh pemeriksaan selesai. Sertifikat, domain, konfigurasi cloud, backup production, dan perilaku layanan provider nyata tidak bisa disimpulkan dari tes lokal saja.
