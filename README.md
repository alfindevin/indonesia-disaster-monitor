# Pemantauan Bencana Indonesia MVP

MVP ini memantau kejadian bencana Indonesia dengan prinsip utama: sumber resmi, atribusi jelas, cache, dan tidak mengklaim real-time bila sumber tidak menjaminnya.

## Sumber Data Yang Dipilih

1. **BMKG Data Gempabumi Terbuka**
   - URL: `https://data.bmkg.go.id/gempabumi/`
   - Feed dipakai:
     - `https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json`
     - `https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json`
     - `https://data.bmkg.go.id/DataMKG/TEWS/gempadirasakan.json`
   - Status: resmi, JSON publik, event-driven, batas akses 60 permintaan/menit/IP, wajib mencantumkan BMKG.

2. **BNPB Data Bencana / GIS**
   - URL halaman: `https://gis.bnpb.go.id/databencana/`
   - FeatureServer yang ditargetkan:
     - `https://gis.bnpb.go.id/server/rest/services/Hosted/Data_Bencana_Dashboard/FeatureServer/0`
   - Fallback tabel:
     - `https://gis.bnpb.go.id/databencana/tabel/pencarian.php`
   - Status: resmi. FeatureServer mendukung query JSON/GeoJSON, tetapi saat pengujian dari backend lokal masih mengembalikan error. Fallback tabel berhasil memuat jenis bencana non-gempa seperti banjir, kebakaran hutan dan lahan, kekeringan, tanah longsor, cuaca ekstrem, dan erupsi gunung api.
   - Catatan: sebagian data tabel tidak membawa koordinat presisi, jadi MVP menempatkan titik dengan perkiraan centroid wilayah administratif dan memberi label `perkiraan`.

3. **PVMBG / MAGMA Indonesia**
   - URL: `https://magma.esdm.go.id/`
   - Status: sumber resmi untuk kebencanaan geologi dan disebut quasi real-time. API publik resmi yang stabil belum ditemukan dalam dokumentasi terbuka saat riset awal, jadi belum dimasukkan sebagai ingestion otomatis MVP.

## Arsitektur MVP

- **Frontend:** HTML, CSS, JavaScript, Leaflet, OpenStreetMap.
- **Backend:** Node.js HTTP server tanpa dependency eksternal.
- **Endpoint utama:** `/api/incidents`.
- **Cache:** file `work/cache.json` dengan TTL 5 menit.
- **Normalisasi data:** semua sumber diubah ke bentuk `incident` yang sama:
  - `id`
  - `source`
  - `sourceUrl`
  - `type`
  - `title`
  - `region`
  - `province`
  - `occurredAt`
  - `updatedAt`
  - `lat`
  - `lon`
  - `severity`
  - `metrics`
  - `summary`
  - `approximateLocation`

## Deduplikasi Dan Update

- Kunci deduplikasi memakai `sourceId`.
- Untuk BMKG, `sourceId` diturunkan dari waktu kejadian dan magnitudo.
- Untuk BNPB, `sourceId` memakai `objectid` bila tersedia.
- Bila kejadian sama muncul di beberapa feed BMKG, aplikasi menyimpan versi dengan ringkasan lebih lengkap.
- Bila satu sumber gagal, error ditampilkan di payload API dan sumber lain tetap berjalan.

## Rencana Produksi

- Ganti file cache dengan PostgreSQL/PostGIS.
- Tambahkan tabel `sources`, `incidents`, `incident_updates`, dan `ingestion_runs`.
- Jalankan ingestion worker terjadwal per sumber:
  - BMKG: 1-5 menit, tetap di bawah batas 60 request/menit/IP.
  - BNPB: 5-15 menit, dengan retry dan backoff.
  - PVMBG: setelah ada endpoint resmi/izin integrasi yang stabil.
- Simpan histori perubahan parameter, karena data awal gempa bisa direvisi.
- Tambahkan observability: status sumber, latency, jumlah data baru, jumlah data gagal parse.

## Menjalankan

```bash
npm start
```

Buka `http://localhost:5173`.
