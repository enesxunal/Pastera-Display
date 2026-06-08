# Pastera Digital Signage

Restoran kasası üzerindeki 3 Samsung Tizen ekranı için bulut tabanlı dijital tabela yönetim sistemi.

## Özellikler

- **3 ayrı ekran modu** — Her cihaz kendi URL'sini açar (`/screen/1`, `/screen/2`, `/screen/3`)
- **Birleşik mod** — Tek cihazda 3 panel yan yana (`/screen/unified`)
- **Medya kütüphanesi** — JPG, PNG, MP4 yükleme
- **Sürükle-bırak** — Medyayı ekrana atama
- **Zamanlama** — Almanya saati (Europe/Berlin), isteğe bağlı saat aralığı
- **Varsayılan içerik** — Saat diliminde içerik yoksa otomatik oynatma
- **Canlı güncelleme** — Ekranlar sayfa yenilemeden içerik değiştirir
- **Çevrimiçi durum** — Admin panelden ekranların açık/kapalı takibi
- **Şifreli admin paneli** — `/admin`

---

## Klasör Yapısı

```
pastera-display/
├── api/
│   └── index.js          # Vercel giriş noktası
├── server/
│   ├── app.js            # Express uygulaması
│   ├── index.js          # Yerel sunucu başlatıcı
│   ├── config.js         # Ayarlar
│   ├── db/               # Veritabanı (SQLite / PostgreSQL)
│   ├── middleware/       # Kimlik doğrulama
│   ├── routes/           # API rotaları
│   └── services/         # Zamanlama, dosya depolama
├── public/
│   ├── admin/            # Yönetim paneli
│   ├── screen/           # Ekran sayfaları
│   ├── js/               # Oynatıcı ve admin scriptleri
│   └── css/              # Stiller
├── package.json
├── vercel.json
└── .env.example
```

---

## Yerel Kurulum

### 1. Bağımlılıkları yükle

```bash
npm install
```

### 2. Ortam dosyasını oluştur

```bash
cp .env.example .env
```

`.env` dosyasında admin şifresini değiştirebilirsiniz.

### 3. Sunucuyu başlat

```bash
npm run dev
```

Tarayıcıda açın:

| Sayfa | Adres |
|-------|-------|
| Admin Panel | http://localhost:3000/admin |
| Ekran 1 | http://localhost:3000/screen/1 |
| Ekran 2 | http://localhost:3000/screen/2 |
| Ekran 3 | http://localhost:3000/screen/3 |
| Birleşik Mod | http://localhost:3000/screen/unified |

**Varsayılan giriş:** `admin` / `pastera123`

---

## Vercel'e Deploy

Vercel'de dosya sistemi kalıcı olmadığı için iki ek servis gerekir:

### 1. Vercel Postgres (veritabanı)

Vercel dashboard → Storage → Create Database → Postgres

Otomatik olarak `DATABASE_URL` ortam değişkeni eklenir.

### 2. Vercel Blob (medya dosyaları)

Vercel dashboard → Storage → Create Store → Blob

`BLOB_READ_WRITE_TOKEN` otomatik eklenir.

### 3. Ortam değişkenleri

Vercel → Project → Settings → Environment Variables:

| Değişken | Açıklama |
|----------|----------|
| `JWT_SECRET` | Güçlü bir rastgele metin |
| `ADMIN_USERNAME` | Admin kullanıcı adı |
| `ADMIN_PASSWORD` | Admin şifresi |
| `TZ` | `Europe/Berlin` |
| `DATABASE_URL` | Postgres bağlantısı (otomatik) |
| `BLOB_READ_WRITE_TOKEN` | Blob token (otomatik) |

### 4. Deploy

```bash
npx vercel
```

---

## Samsung Tizen Ekran Kurulumu

1. Tizen ekranın tarayıcısını açın
2. İlgili URL'yi girin (örn. `https://sizin-domain.vercel.app/screen/1`)
3. Tam ekran moduna alın (F11 veya Tizen kiosk ayarı)
4. Diğer 2 ekran için `/screen/2` ve `/screen/3` tekrarlayın

**Birleşik mod** için tek geniş ekranda `/screen/unified` açın.

---

## Zamanlama Nasıl Çalışır?

- Saat alanları **boş bırakılırsa** → içerik **24 saat** oynar
- Başlangıç/bitiş saati girilirse → sadece o aralıkta oynar
- O saatte içerik yoksa → **"Varsayılan"** işaretli içerik devreye girer
- Görseller → belirlediğiniz saniye kadar kalır (varsayılan 10 sn)
- Videolar → tamamen bitene kadar oynar

---

## İleride Eklenecekler (hazır altyapı)

- Çoklu şube desteği (`branches` tablosu mevcut)
- Uzaktan ekran durumu (heartbeat sistemi aktif)
- Çoklu admin kullanıcı

---

## Teknik Stack

- **Backend:** Node.js + Express
- **Veritabanı:** SQLite (yerel) / PostgreSQL (Vercel)
- **Depolama:** Yerel disk / Vercel Blob
- **Frontend:** HTML + Tailwind CSS + Vanilla JS
- **Deploy:** Vercel Serverless
