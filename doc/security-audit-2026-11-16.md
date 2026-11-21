**Audit keamanan dan keandalan Walatra, 16 November 2026**

Audit mencakup working tree frontend `/home/popes/Project/frontend` (HEAD `a7a68b7`) dan jalur integrasi backend Laravel `/home/popes/Project/backendwalatra-remote` (HEAD `2284c21`). Kedua working tree berisi perubahan lokal. Kode aplikasi tidak diubah dalam audit ini. Semua reproduksi menggunakan proses server terpisah, upstream tiruan, atau database SQLite `:memory:`. Tidak ada OTP nyata, charge pembayaran, atau penulisan database operasional.

Ada risiko yang sudah direproduksi, terutama penolakan layanan pada server Node. Belum ada bukti dalam audit ini bahwa data pengguna telah dicuri. Audit kode dan pengujian lokal ini tidak memberikan jaminan bebas kerentanan dan tidak menggantikan pemeriksaan deployment production.

| ID | Prioritas | Temuan | Kepastian dan batas |
|---|---|---|---|
| F01 | Tinggi | Request URL tidak valid mematikan server frontend | Direproduksi pada proses Node terisolasi, tanpa autentikasi. Jangkauan melalui reverse proxy production belum diuji. |
| F02 | Tinggi | Dependensi backend memiliki 17 advisory pada 10 paket | Versi terpasang terdeteksi `composer audit`. Tidak semua advisory memiliki jalur eksploitasi yang terbukti dipakai aplikasi. |
| F03 | Sedang | Pembatasan OTP berdasarkan IP menjadi kuota bersama di belakang session bridge | Upstream tiruan melihat IP loopback yang sama dan tidak menerima identitas client yang diteruskan. |
| F04 | Sedang | Webhook tidak valid dapat memenuhi tabel log | Dua request anonim tanpa payload menghasilkan dua baris log pada SQLite terisolasi. |
| F05 | Sedang | Sanitasi log masih menyimpan nama penerima dan GPS presisi | Direproduksi dengan data fiktif; akses tanpa izin ke log tidak terbukti. |
| F06 | Sedang, operasional | Sesi frontend berada di memori satu proses | Terlihat langsung dari implementasi; restart dan beberapa instance memerlukan penanganan sesi bersama. |
| F07 | Rendah, penguatan | Header pembatasan framing dan CSP belum disediakan server Node | Dikonfirmasi pada respons lokal. Konfigurasi reverse proxy production belum diperiksa. |
| F08 | Bersyarat, sebelum production | Konfigurasi lokal debug dan OTP exposure tidak boleh dipublikasikan | Lingkungan yang diperiksa memang development; bukan bukti salah konfigurasi production. |

**F01. Request tanpa login dapat mematikan server Node**

Lokasi: [auth-session.mjs:74](../scripts/auth-session.mjs#L74), [serve-local.mjs:23](../scripts/serve-local.mjs#L23).

`new URL(req.url, 'http://localhost')` dijalankan sebelum blok `try` di session handler. Pemanggilnya merupakan callback HTTP `async` yang tidak menangkap rejection dari `await authSession(req, res)`. Request-target tidak valid seperti `//[` menimbulkan `ERR_INVALID_URL` dan menjadi unhandled rejection.

Reproduksi pada server sementara: satu request anonim, proses keluar dengan exit code `1`, respons HTTP kosong. Proses frontend yang sedang dipakai tidak dijadikan target pengujian. Dampak jika request mencapai Node: website dan seluruh sesi di proses tersebut terputus. Restart otomatis mengurangi lama gangguan, tetapi tidak menutup celah.

Perbaikan: tangkap parsing URL dan seluruh handler per request; berikan respons `400` untuk URL tidak valid. Tambahkan tes yang memastikan request normal masih mendapat respons setelah request cacat. Jangan mengandalkan handler global yang hanya menelan exception.

**F02. Paket backend perlu pembaruan keamanan**

Sumber versi: `backendwalatra-remote/composer.lock`. `composer audit --format=json --no-interaction` menghasilkan exit code `1`: 17 advisory pada 10 paket, terdiri dari 2 high, 4 medium, 1 low, dan 10 tanpa label severity pada respons advisory. Paket frontend Leaflet dan SweetAlert2 tidak memiliki advisory yang dilaporkan oleh `npm audit` pada saat pemeriksaan.

| Paket | Versi di lockfile | Advisory |
|---|---|---|
| filament/filament | 5.7.8 | [Pengelolaan MFA aplikasi tanpa konfirmasi ulang password](https://github.com/filamentphp/filament/security/advisories/GHSA-7m6h-rg42-m449) |
| laravel/framework | 12.69.1 | [Task output injection pada Concurrency Process](https://github.com/advisories/GHSA-63hm-g96r-2m2q) |
| league/commonmark | 2.10.0 | [Bypass DisallowedRawHtml](https://github.com/thephpleague/commonmark/security/advisories/GHSA-97jj-33gv-5xf9), [DoS pemrosesan tabel GFM](https://github.com/thephpleague/commonmark/security/advisories/GHSA-3q6v-r5mr-hxv8) |
| livewire/livewire | 4.4.3 | [Bypass atribut Authorize pada parameter dan metode Json](https://github.com/livewire/livewire/security/advisories/GHSA-mhf7-xp6r-6qrc) |
| symfony/html-sanitizer | 8.1.6 | [srcset](https://github.com/symfony/symfony/security/advisories/GHSA-q8jq-xrf4-v5j8), [meta refresh](https://github.com/symfony/symfony/security/advisories/GHSA-wm2w-4mgj-vw33), [host allowlist](https://symfony.com/cve-2026-118517) |
| symfony/http-foundation | 7.4.18 | [Trusted proxies](https://github.com/symfony/symfony/security/advisories/GHSA-xg2q-4rrq-657q), [HEAD access control](https://symfony.com/cve-2026-118514), [path normalization](https://github.com/symfony/symfony/security/advisories/GHSA-3h27-hjv7-fqjx), [host pada URL](https://github.com/symfony/symfony/security/advisories/GHSA-5mx8-mwrp-5693), [ReDoS Cache-Control](https://symfony.com/cve-2026-108082) |
| symfony/http-kernel | 7.4.18 | [Forwarded headers pada inline fragments](https://github.com/symfony/symfony/security/advisories/GHSA-wg5q-m2ww-f3c9) |
| symfony/mime | 7.4.18 | [Email header injection](https://symfony.com/cve-2026-45070) |
| symfony/routing | 7.4.18 | [Bypass path access control melalui host placeholders](https://symfony.com/cve-2026-118516) |
| symfony/yaml | 8.1.6 | [DoS parser YAML](https://github.com/symfony/symfony/security/advisories/GHSA-hwfg-qwvh-2wfx) |

Advisory Symfony Cache-Control menyebut pemrosesan request HTTP tanpa autentikasi sebagai jalur terdampak. Ini menjadi prioritas pembaruan. Advisory Livewire memerlukan pemakaian atribut `#[Authorize]` yang relevan; pencarian teks di `app`, `resources`, dan `routes` tidak menemukan pemakaiannya dalam cakupan yang diperiksa. Panel MFA Filament juga tidak terlihat diaktifkan pada provider panel yang dibaca. Temuan paket tersebut tetap perlu ditangani, tetapi tidak boleh disamakan dengan bukti takeover akun pada aplikasi ini.

Pilih versi patch yang menutup seluruh advisory terkini dengan mempertahankan kompatibilitas Laravel/Filament. Jangan hanya mengejar satu versi minimum: beberapa keluarga paket memiliki lebih dari satu advisory. Jalankan ulang audit, pengujian autentikasi/pembayaran, dan panel setelah lockfile diperbarui. Tidak dilakukan update dependensi dalam audit ini.

**F03. Kuota OTP terkumpul pada IP session bridge**

Lokasi: `frontend/scripts/auth-session.mjs:26` dan `backendwalatra-remote/app/Providers/AppServiceProvider.php:98`.

Bridge meneruskan request OTP tanpa identitas client yang dapat dipercaya. Pengujian upstream tiruan dengan dua nilai identitas client berbeda menunjukkan dua request diterima dari `127.0.0.1`, tanpa `X-Forwarded-For`. Backend membatasi request OTP berdasarkan IP: 20 request per 15 menit; verifikasi OTP memiliki batas IP 30 per 5 menit, ditambah batas per challenge.

Dalam topologi saat ini, banyak pengunjung frontend menggunakan bucket IP backend yang sama. Satu pengunjung dapat menghabiskan anggaran bersama dan menyebabkan pengunjung lain menerima `429`. Pengukuran exhaustion terhadap layanan OTP nyata sengaja tidak dilakukan.

Perbaikan: tetapkan identitas client dari reverse proxy yang dipercaya, sanitasi header client pada edge, dan konfigurasi trusted proxies Laravel secara sempit. Tambahkan rate limit di bridge serta pertahankan batas per nomor/challenge. Meneruskan sembarang `X-Forwarded-For` dari pengguna justru membuka bypass pembatasan IP.

Ada kegagalan tes terkait: `CustomerOtpAuthTest::test_request_limit_by_ip_cannot_be_bypassed_by_changing_phone` mengharapkan request keenam ditolak, sedangkan kode sekarang mengizinkan 20 request per 15 menit. Ini merupakan ketidaksinkronan kebijakan dan tes, bukan bukti limiter sepenuhnya tidak bekerja. Kebijakan yang dimaksud perlu ditetapkan sebelum memperbarui salah satunya.

**F04. Penulisan log webhook terjadi sebelum validasi/signature**

Lokasi: `backendwalatra-remote/routes/api.php:69`, `app/Http/Controllers/Api/V1/PaymentController.php:103`, dan `app/Services/ExternalApiActivityLogger.php:12`.

Webhook memang perlu publik. Masalahnya, logger menulis `$request->all()` sebelum validasi payload dan pemeriksaan signature. Route yang dibaca tidak memasang throttle khusus webhook. Dua POST kosong tanpa autentikasi masing-masing ditolak `422`, tetapi tetap membuat dua baris `external_api_activity_logs`. Pengujian membuktikan perilaku ini dengan database `:memory:`.

Dampak: spam request dapat memperbesar tabel dan beban write database walaupun penyerang tidak bisa mengubah status pembayaran. Tidak dilakukan pengujian volume besar. Model log dan scheduler yang diperiksa belum menunjukkan kebijakan retensi; kebijakan maintenance di luar repository belum diketahui.

Perbaikan: batasi ukuran request, terapkan pembatasan webhook yang mempertimbangkan retry provider, lakukan validasi murah/signature sebelum menyimpan payload penuh, gunakan sampling/metadata minimum untuk request ditolak, dan tetapkan retensi log. Webhook valid harus tetap diterima secara andal.

**F05. Nama dan koordinat rinci ikut tersalin ke log**

Lokasi: `backendwalatra-remote/app/Services/ExternalApiActivityLogger.php:104`, `app/Services/Shipping/ShippingApiRateProvider.php:19`, dan `app/Services/Marketplace/CheckoutReview.php:14`.

Snapshot alamat memuat `name`, `latitude`, dan `longitude`. Penyedia ongkir mengirim snapshot sebagai `destination`, kemudian mencatatnya ke log. Sanitasi menghapus `phone` dan `address`, tetapi nama dengan key `name` serta GPS tetap utuh. Pengujian data fiktif mengonfirmasi ketiganya tetap berada pada payload hasil sanitasi.

Ini adalah perluasan penyimpanan data pribadi ke log. Akses resource log yang diperiksa sudah dibatasi ke superadmin aktif; tidak ditemukan bukti akses log tanpa izin dalam pemeriksaan ini. Risiko meningkat jika log diekspor, masuk backup, atau masa simpannya terlalu lama.

Perbaikan: gunakan schema allowlist untuk data operasional log, hilangkan nama dan GPS yang tidak diperlukan, atau kurangi presisi koordinat. Tetapkan retensi, kontrol ekspor/backup, dan enkripsi bila data rinci harus disimpan.

**F06. Penyimpanan sesi bergantung pada satu proses**

Lokasi: `frontend/scripts/auth-session.mjs:25`.

Session disimpan dalam `Map`. Restart menghapus login aktif; dua instance dengan memori terpisah akan mengenali session berbeda tanpa sticky routing. F01 memperbesar dampaknya karena proses yang mati juga kehilangan seluruh sesi. Ini merupakan risiko keandalan, bukan bukti pencurian token.

Perbaikan untuk deployment beberapa instance: gunakan session store bersama dengan TTL, misalnya Redis, serta pembatasan jumlah sesi dan pengelolaan invalidasi. Frontend juga melakukan sweep seluruh Map pada tiap request session; kapasitas dan beban perlu diuji sebelum skala besar.

**F07. Header keamanan browser belum lengkap pada server Node**

Lokasi: `frontend/scripts/serve-local.mjs:41` dan `frontend/scripts/auth-session.mjs:6`.

Respons lokal `/checkout/` menyediakan `X-Content-Type-Options: nosniff`, tetapi tidak menyertakan `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`, atau `Permissions-Policy`. Ini mengurangi perlindungan terhadap framing dan dampak jika injeksi script muncul di kemudian hari. Tidak adanya CSP sendiri bukan bukti XSS.

Perbaikan: tetapkan `frame-ancestors`, kebijakan sumber script/media/frame/connect yang sesuai untuk API dan OpenStreetMap, serta kebijakan referrer dan geolocation. Uji kebijakan dalam report-only sebelum enforcement karena halaman arsip lama mungkin membutuhkan penyesuaian. HSTS hanya dinilai pada deployment HTTPS; absennya HSTS pada localhost HTTP bukan kerentanan tersendiri. Header yang ditambahkan reverse proxy production belum diverifikasi.

**F08. Gerbang konfigurasi production**

Backend lokal memakai `APP_ENV=local`, `APP_DEBUG=true`, dan OTP exposure aktif. Ini konsisten dengan lingkungan pengembangan. Controller hanya mengeluarkan kode OTP saat environment `local/testing`; tes bahwa production tidak mengeluarkan OTP sudah lulus. Jika konfigurasi development dipublikasikan sebagai layanan internet, endpoint API langsung dan exception debug dapat membocorkan OTP/detail internal. Bridge menghapus field OTP dari respons yang diteruskannya, tetapi tidak melindungi akses langsung ke backend.

Sebelum production: `APP_ENV=production`, `APP_DEBUG=false`, `OTP_EXPOSE_CODE=false`; HTTPS, `APP_ORIGIN` publik yang eksplisit, dan secure cookie pada bridge serta panel Laravel. Jangan menjadikan root repository sebagai document root dan jangan menyajikan `.env`, backup, atau log. Tidak ada secret value yang disalin ke laporan ini.

**Kontrol yang berhasil diperiksa**

- Cookie bridge `HttpOnly` dan `SameSite=Lax`; session ID dibuat dari 32 byte acak. Token bearer disimpan server-side dan dikeluarkan dari respons login browser.
- Mutasi session bridge menolak origin yang tidak cocok. Tes lintas origin dan whitelist route/query lulus.
- Alamat, order, dan pembayaran customer dibatasi ke pemiliknya pada query. Tes akses lintas customer dan QR kedaluwarsa lulus.
- OTP disimpan sebagai hash, memiliki batas lima kegagalan, terikat nomor/purpose, dan memiliki masa berlaku. Job pengiriman mengimplementasikan `ShouldBeEncrypted`.
- Token checkout terenkripsi, terikat user, memiliki expiry 15 menit, dan mencocokkan fingerprint pilihan/alamat/ongkir/total.
- Webhook memeriksa signature dengan `hash_equals`; rekonsiliasi memeriksa identitas transaksi, nominal, mata uang, dan status melalui provider. Tes webhook, idempotency, pembayaran ganda/terlambat, dan pembatalan lulus.
- Proxy QR membatasi HTTPS, hostname, path, dan menolak redirect; tes host asing lulus.
- Deskripsi produk dibangun dari elemen/atribut yang dibatasi; nama dan pesan notifikasi menggunakan teks. URL `javascript:` ditolak pada helper URL dan `safeNext` memeriksa origin.
- Pemindaian pola credential yang terbatas pada source/config/docs terkait serta field sensitif JSON fixture/evidence tidak menghasilkan kandidat credential. Ini bukan pemeriksaan seluruh riwayat Git atau jaminan tidak ada secret.

**Hasil verifikasi**

| Pemeriksaan | Hasil |
|---|---|
| `npm test` | 14 tes lulus |
| `python3 scripts/verify.py` | 2.366 halaman arsip diperiksa, 2 fixture, 21 aset banner, tidak ada error yang dilaporkan |
| `npm audit --json` | 0 advisory yang dilaporkan |
| `composer audit --format=json --no-interaction` | 17 advisory, 10 paket, exit code 1 |
| PHPUnit subset auth/address/checkout/payment/logs | 88 tes, 727 assertion: 87 lulus, 1 gagal pada ekspektasi rate limit OTP |
| Probe tambahan webhook dan sanitasi log, SQLite memory | 2 tes, 10 assertion, keduanya mengonfirmasi kondisi F04/F05 |
| Probe Node URL tidak valid | Proses server terisolasi mati dengan exit code 1 dan `ERR_INVALID_URL` |
| Probe identitas IP bridge, upstream tiruan | Dua caller header berbeda terlihat sebagai satu IP loopback, tanpa header forwarded |
| Header HTTP lokal | `nosniff` ada; header yang dijelaskan di F07 tidak ada |

Urutan tindak lanjut: tutup F01, perbarui dependensi F02, perbaiki identitas/rate limit OTP F03, lalu batasi logging webhook dan data pribadi F04/F05. Setelah itu lakukan penguatan session/deployment/header dan jalankan ulang regresi serta audit dependensi.

**Batas audit**

Ini review kode berbantuan graph dan pengujian lokal terarah, bukan pentest seluruh infrastruktur. Belum diverifikasi: TLS/reverse proxy/WAF production, firewall/SSH/cloud IAM, hak akses database dan backup, seluruh riwayat Git, seluruh kode minified Nuxt arsip, seluruh dependency vendor secara manual, load test terukur, dan seluruh panel/modul backend. Advisory paket dilaporkan berdasarkan versi terpasang; keterjangkauan setiap advisory perlu penilaian terpisah. Tidak ada kesimpulan bahwa seluruh kemungkinan SQL injection, XSS, RCE, atau pencurian data telah tersingkir.
