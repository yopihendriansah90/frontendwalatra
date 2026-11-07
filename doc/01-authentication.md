# API Authentication

**Project:** Walatra Marketplace  
**API version:** `v1`  
**Status:** Implemented  
**Last synchronized:** 11 September 2026

Dokumen ini adalah kontrak API autentikasi untuk web frontend dan Android. Dokumentasi
interaktif tersedia pada Postman Collection:

`docs/api/postman/Walatra Marketplace - Authentication.postman_collection.json`

## Base URL dan header

Gunakan `base_url` tanpa suffix `/api/v1` dan tanpa slash di akhir.

Contoh local:

```text
http://127.0.0.1:8001
```

Header JSON:

```http
Accept: application/json
Content-Type: application/json
```

Endpoint terproteksi menggunakan:

```http
Authorization: Bearer <token>
```

Token Sanctum bukan JWT. Simpan token sebagai string utuh, termasuk bagian sebelum
dan sesudah karakter `|`. Jangan menaruh token, OTP, atau secret provider di URL,
log, repository, atau analytics.

## Ringkasan endpoint

| Method  | Endpoint                            | Auth   | Kegunaan                                      |
| ------- | ----------------------------------- | ------ | --------------------------------------------- |
| `POST`  | `/api/v1/auth/customer/request-otp` | Tidak  | Meminta atau mengirim ulang OTP               |
| `POST`  | `/api/v1/auth/customer/verify-otp`  | Tidak  | Memverifikasi OTP dan login/register customer |
| `PATCH` | `/api/v1/auth/customer/profile`     | Bearer | Melengkapi nama profil customer               |
| `GET`   | `/api/v1/auth/me`                   | Bearer | Mengambil user yang sedang login              |
| `POST`  | `/api/v1/auth/logout`               | Bearer | Mencabut token aktif saat ini                 |
| `POST`  | `/api/v1/auth/login`                | Tidak  | Login email/password yang masih tersedia      |

## Alur customer OTP

```text
Request OTP
    ↓
Simpan challenge_id dan expires_at
    ↓
Verify OTP
    ↓
Simpan token
    ↓
GET /auth/me
    ↓
Jika requires_profile_completion=true, PATCH profile
```

Nomor WhatsApp yang didukung adalah nomor Indonesia. Format `08...`, `628...`,
`+628...`, dan `8...` dinormalisasi menjadi format `628...`. OTP berlaku 5 menit,
hanya dapat digunakan sekali, dan challenge lama dibatalkan ketika OTP baru diminta.

OTP yang ditampilkan pada response hanya tersedia di environment `local` atau
`testing` jika `OTP_EXPOSE_CODE=true`. Integrasi production tidak boleh bergantung
pada field `data.otp`; OTP akan dikirim melalui provider WhatsApp ketika integrasi
MaxChat diaktifkan.

Pada production, backend mengirim OTP melalui MaxChat menggunakan format nomor
`628...`. Client tidak berkomunikasi langsung dengan MaxChat dan tidak perlu
mengetahui token MaxChat.

Pengiriman OTP diproses melalui Redis queue. Endpoint request OTP membuat challenge
dan mengembalikan response dengan cepat; pengiriman ke MaxChat dilakukan oleh worker
queue. Karena itu client harus menggunakan `challenge_id` dari response dan tidak
menganggap `pending` sebagai kegagalan.

Jika MaxChat mengembalikan status awal `pending`, backend melakukan pengecekan
lanjutan menggunakan `provider_message_id` melalui endpoint status pesan. Worker
akan mencoba beberapa kali dengan jeda singkat. Jika status final tersedia, nilai
`delivery_status` akan diperbarui menjadi `sent` atau `delivered`. Jika status tetap
belum tersedia, challenge tetap valid selama belum expired.

### Aturan implementasi client

Frontend web dan aplikasi Android wajib mengikuti aturan berikut:

1. Simpan `challenge_id`, `expires_at`, dan nomor WhatsApp setelah request OTP
   berhasil.
2. Jangan menganggap `delivery_status=pending` atau `unknown` sebagai kegagalan.
   Tampilkan instruksi kepada customer untuk memeriksa WhatsApp dan memasukkan OTP.
3. Jangan memanggil API MaxChat secara langsung. Semua komunikasi provider dilakukan
   oleh backend.
4. Gunakan `challenge_id` terbaru setelah resend OTP. Challenge sebelumnya tidak
   boleh digunakan lagi.
5. Jangan mengirim OTP berulang-ulang secara otomatis. Ikuti nilai `retry_after`
   ketika response API adalah `429`.
6. Setelah OTP berhasil diverifikasi, simpan token Sanctum sesuai mekanisme keamanan
   platform masing-masing dan gunakan sebagai Bearer Token.
7. Jika `requires_profile_completion=true`, arahkan customer ke halaman pelengkapan
   profil. Jika `false`, customer dapat langsung melanjutkan ke aplikasi.

### Status pengiriman OTP

| `delivery_status` | Makna untuk client | Tindakan client |
| ----------------- | ------------------ | --------------- |
| `pending`         | Provider sedang memproses pesan | Tunggu dan minta customer memeriksa WhatsApp |
| `sent`            | Pesan sudah diterima untuk dikirim | Customer dapat memasukkan OTP |
| `delivered`       | Pesan sudah sampai ke WhatsApp tujuan | Customer dapat memasukkan OTP |
| `unknown`         | Hasil provider belum dapat dipastikan | Tetap izinkan verifikasi sampai OTP expired |
| `failed`          | Provider mengembalikan kegagalan yang jelas | Tampilkan opsi request OTP ulang |
| `skipped`         | Integrasi provider sedang nonaktif, biasanya testing | Hanya gunakan untuk environment testing |

Client tidak perlu melakukan polling status pengiriman. Client cukup menampilkan
status berdasarkan response request OTP dan langsung menyediakan form verifikasi.
Pengecekan status ke MaxChat dilakukan oleh worker backend.

## 1. Request OTP

```http
POST {{base_url}}/api/v1/auth/customer/request-otp
```

Body:

```json
{
  "phone": "08123456789"
}
```

| Field   | Tipe   | Wajib | Aturan                                      |
| ------- | ------ | ----: | ------------------------------------------- |
| `phone` | string |    Ya | Nomor Indonesia valid, maksimal 20 karakter |

Response `200 OK` pada environment normal:

```json
{
  "success": true,
  "message": "Jika nomor dapat menerima WhatsApp, OTP akan dikirim.",
  "data": {
    "challenge_id": 101,
    "expires_at": "2026-09-07T14:05:00+07:00",
    "delivery_status": "sent"
  }
}
```

Response normal ketika pengiriman masih diproses:

```json
{
  "success": true,
  "message": "OTP sedang diproses. Silakan periksa WhatsApp Anda.",
  "data": {
    "challenge_id": 101,
    "expires_at": "2026-09-07T14:05:00+07:00",
    "delivery_status": "pending"
  }
}
```

Response ketika provider gagal secara jelas:

```json
{
  "success": true,
  "message": "OTP gagal dikirim. Silakan coba lagi.",
  "data": {
    "challenge_id": 101,
    "expires_at": "2026-09-07T14:05:00+07:00",
    "delivery_status": "failed"
  }
}
```

Untuk status `failed`, client harus meminta OTP baru menggunakan endpoint request OTP
yang sama setelah mengikuti rate limit yang berlaku.

Pada environment testing, response dapat memiliki `data.otp`:

```json
{
  "success": true,
  "message": "Jika nomor dapat menerima WhatsApp, OTP akan dikirim.",
  "data": {
    "challenge_id": 101,
    "expires_at": "2026-09-07T14:05:00+07:00",
    "otp": "483921"
  }
}
```

Simpan `challenge_id`, `expires_at`, dan nomor yang digunakan. Request resend memakai
endpoint dan body yang sama. Setelah resend berhasil, gunakan challenge terbaru.

Contoh cURL:

```bash
curl -X POST "{{base_url}}/api/v1/auth/customer/request-otp" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"phone":"08123456789"}'
```

## 2. Verify OTP dan login/register

```http
POST {{base_url}}/api/v1/auth/customer/verify-otp
```

Body:

```json
{
  "phone": "08123456789",
  "challenge_id": 101,
  "otp": "483921",
  "device_name": "postman"
}
```

| Field          | Tipe    | Wajib | Aturan                             |
| -------------- | ------- | ----: | ---------------------------------- |
| `phone`        | string  |    Ya | Nomor yang sama dengan request OTP |
| `challenge_id` | integer |    Ya | ID dari response OTP terbaru       |
| `otp`          | string  |    Ya | Tepat 6 digit                      |
| `device_name`  | string  |    Ya | Maksimal 100 karakter              |

Jika nomor belum terdaftar, backend membuat akun customer setelah OTP valid. Jika
nomor sudah terdaftar dan aktif, backend langsung login.

Response customer baru `200 OK`:

```json
{
  "success": true,
  "message": "Login berhasil.",
  "data": {
    "user": {
      "id": 12,
      "name": null,
      "phone": "628123456789",
      "profile_completed_at": null
    },
    "token": "42|token_contoh",
    "token_type": "Bearer",
    "is_new_user": true,
    "requires_profile_completion": true
  }
}
```

Jika OTP salah, response menggunakan HTTP `422`. Jangan membuat token atau mengubah
status login di sisi client sebelum response verifikasi menyatakan `success=true`.

Customer lama yang profilnya lengkap menerima `is_new_user=false` dan
`requires_profile_completion=false`.

Contoh cURL:

```bash
curl -X POST "{{base_url}}/api/v1/auth/customer/verify-otp" \
  -H "Accept: application/json" \
  -H "Content-Type: application/json" \
  -d '{"phone":"08123456789","challenge_id":101,"otp":"483921","device_name":"postman"}'
```

## 3. Melengkapi profil customer

```http
PATCH {{base_url}}/api/v1/auth/customer/profile
Authorization: Bearer <token>
```

Body:

```json
{
  "name": "Customer Walatra"
}
```

`name` wajib berupa string minimal 2 dan maksimal 255 karakter.

Response `200 OK`:

```json
{
  "success": true,
  "message": "Profil berhasil dilengkapi.",
  "data": {
    "user": {
      "id": 12,
      "name": "Customer Walatra",
      "email": null,
      "phone": "628123456789",
    "profile_completed_at": "2026-09-07T14:10:00+07:00"
    },
    "requires_profile_completion": false
  }
}
```

## 4. Get current user

```http
GET {{base_url}}/api/v1/auth/me
Authorization: Bearer <token>
```

Response `200 OK`:

```json
{
  "success": true,
  "message": "User aktif.",
  "data": {
    "user": {
      "id": 12,
      "name": "Customer Walatra",
      "email": null,
      "phone": "628123456789",
    "profile_completed_at": "2026-09-07T14:10:00+07:00"
    },
    "requires_profile_completion": false
  }
}
```

## 5. Logout

```http
POST {{base_url}}/api/v1/auth/logout
Authorization: Bearer <token>
```

Response `200 OK`:

```json
{
  "success": true,
  "message": "Logout berhasil."
}
```

Logout hanya mencabut token yang sedang digunakan. Token pada device lain tidak ikut
dicabut.

## 6. Login email/password legacy

Endpoint ini masih tersedia, tetapi bukan alur utama customer WhatsApp.

```http
POST {{base_url}}/api/v1/auth/login
```

Body:

```json
{
  "email": "user@example.com",
  "password": "password",
  "device_name": "postman"
}
```

## Error dan rate limit

| Status | Arti                                                    |
| -----: | ------------------------------------------------------- |
|  `401` | Token tidak ada/tidak valid atau kredensial email salah |
|  `403` | Akun tidak aktif                                        |
|  `422` | Input atau OTP tidak valid                              |
|  `429` | Rate limit tercapai                                     |
|  `503` | Provider WhatsApp tidak tersedia atau gagal mengirim OTP |
|  `500` | Kesalahan server; jangan menampilkan trace ke user      |

Untuk endpoint API, response error validasi, autentikasi, dan resource tidak ditemukan
selalu memiliki `success: false`. Response `401` ketika Bearer Token tidak ada atau
tidak valid adalah:

```json
{
  "success": false,
  "message": "Unauthenticated."
}
```

Contoh error OTP:

```json
{
  "success": false,
  "message": "OTP tidak valid atau sudah tidak dapat digunakan.",
  "errors": {
    "otp": ["OTP tidak valid atau sudah tidak dapat digunakan."]
  }
}
```

Jika worker memperoleh response kegagalan yang jelas dari MaxChat, challenge akan
ditandai `failed` dan API request OTP tetap mengembalikan response status pengiriman:

```json
{
  "success": true,
  "message": "OTP gagal dikirim. Silakan coba lagi.",
  "data": {
    "challenge_id": 101,
    "expires_at": "2026-09-07T14:05:00+07:00",
    "delivery_status": "failed"
  }
}
```

Client dapat meminta OTP kembali menggunakan endpoint request OTP yang sama setelah
menunggu beberapa saat. Token MaxChat, isi OTP, dan response internal provider tidak
pernah dikirimkan ke client.

Jika koneksi timeout setelah request dikirim, status pengiriman tidak dapat dipastikan.
Dalam kondisi ini challenge tidak dibatalkan karena provider mungkin sudah menerima
dan mengirim OTP. API mengembalikan `200 OK` dengan status `unknown` agar OTP yang
telah diterima tetap dapat diverifikasi:

```json
{
  "success": true,
  "message": "OTP sedang diproses. Silakan periksa WhatsApp Anda.",
  "data": {
    "challenge_id": 101,
    "expires_at": "2026-09-07T14:05:00+07:00",
    "delivery_status": "unknown"
  }
}
```

Status `delivery_status` yang dapat diterima client adalah `skipped`, `pending`,
`sent`, `delivered`, `unknown`, dan `failed`. Status `failed` hanya digunakan ketika
provider memberikan response kegagalan yang jelas.

Worker lokal dapat dijalankan dengan:

```bash
php artisan queue:work redis --queue=otp,default --tries=1 --timeout=40
```

Pada production, gunakan Horizon agar worker queue `otp` dapat dipantau dan
dijalankan sebagai service.

Response `429` memiliki `retry_after` dalam detik dan header `Retry-After`. Nilainya
dinamis mengikuti sisa waktu window rate limit, sehingga tidak selalu `60`:

```json
{
  "success": false,
  "message": "Terlalu banyak percobaan. Silakan tunggu sebelum mencoba lagi.",
  "retry_after": 60
}
```

Batas saat ini:

- request/resend OTP per nomor: 10 request per menit;
- request OTP per IP: 5 request per 15 menit;
- verify per challenge dan IP: 10 request per 5 menit;
- verify per IP: 30 request per 5 menit;
- kesalahan kode per challenge: 5 kali.

## Catatan integrasi web dan Android

- Web frontend server-side menyimpan token pada session server.
- Android menyimpan token menggunakan secure storage.
- Jangan menyimpan token pada URL atau mengirim OTP sebagai Bearer token.
- Semua waktu memakai timezone `Asia/Jakarta` dan format ISO 8601 dengan offset `+07:00`.
- Jangan melakukan retry otomatis untuk request OTP atau verify ketika response jaringan
  gagal, karena request mungkin sudah berhasil diproses backend.
