# Brooklyn gallery (sisi web) + halaman pilih gallery: design

Tanggal: 2026-11-12. Issue: VA-21 (lanjutan). Status: draft, menunggu persetujuan user.
Prasyarat: scene Blender Brooklyn selesai (`galleries/brooklyn/blend/BROOKLYN_v07.blend`, `galleries/brooklyn/SCENE.md`,
spec `2026-11-12-brooklyn-blender-design.md`).

## 1. Kenapa

Brooklyn sudah jadi di Blender. Sekarang Brooklyn dibuat bisa dijelajahi di browser seperti Hokkaido, dan root situs
berubah dari redirect ke Hokkaido menjadi halaman untuk memilih gallery. Pengunjung datang lewat dua jalan: link
langsung ke satu gallery (dibagikan ke klien) atau root situs lalu memilih.

## 2. Goals, non-goals, anti-goals

Goals:
- `/galleries/brooklyn/full/` dengan pengalaman yang sama dengan Hokkaido: lightmap hasil bake Cycles, refleksi
  panorama HDR, bloom, dust, WASD/mouse, klik lukisan → glide, musik, tombol efek, loading bar.
- Look web semirip mungkin dengan render Blender yang disetujui (`galleries/brooklyn/renders/cam_main_hall.png`).
- Root situs `/` = halaman pilih gallery, layout **opsi A (kartu grid)**: judul "Woo Gallery", satu kartu per gallery
  (foto, nama, "Masuk" → `/galleries/<g>/full/`). Gallery baru muncul otomatis tanpa edit HTML manual.
- Link langsung lama tetap jalan: `/galleries/hokkaido/full/`, `/galleries/hokkaido/empty/`.

Non-goals:
- Varian `empty` Brooklyn di web (keputusan user: versi berlukisan dulu). `BROOKLYN_v07_empty.blend` tetap ada untuk nanti.
- Menggeneralisasi `shared/main.js` untuk semua ruangan.
- Musik/kontrol khusus Brooklyn, kontrol sentuh mobile.
- Push/deploy otomatis (lihat §6).

Anti-goals:
- Hokkaido berubah atau rusak (runtime, aset, URL).
- Kamera menembus partisi saat glide ke lukisan.
- Halaman pilih yang harus diedit tangan tiap kali gallery bertambah.
- Web jauh lebih gelap/terang/datar dari render Blender yang disetujui.

## 3. Keputusan user
- Root bisa memilih gallery; link langsung juga dipakai.
- Layout halaman pilih: opsi A (kartu grid).
- **Script runtime masing-masing**: Brooklyn punya runtime sendiri, Hokkaido tetap memakai `shared/main.js` apa adanya.
- Web Brooklyn: hanya versi dengan lukisan untuk saat ini.
- Pengalaman jalan-jalan di Brooklyn: **samakan dengan Hokkaido**.
- Look Blender "varian C" di `BROOKLYN_v07.blend` sudah disetujui (preview v06 dan still final, 2026-11-12). Bake langsung
  dari v06, tanpa gate look tambahan.

## 4. Rancangan

### 4.1 Struktur file
- `galleries/brooklyn/gallery.json`: config (format sama dengan Hokkaido, lihat §4.3).
- `galleries/brooklyn/main.js`: **salinan `shared/main.js`** dengan perubahan khusus Brooklyn (§4.4). Dibaca halaman
  sebagai `../main.js`. Musik tetap `../../../shared/audio/music.mp3`.
- `galleries/brooklyn/full/index.html`: salinan `galleries/hokkaido/full/index.html`, judul/teks diganti, script
  menunjuk `../main.js`.
- `galleries/brooklyn/full/assets/`: hasil pipeline (GLB, lightmaps, normals, env/hall.hdr).
- `galleries/brooklyn/blend/BROOKLYN_web.blend`: turunan hasil bake (`blend.full`), tidak diedit manual.
- `galleries/<g>/thumb.webp` (Hokkaido dan Brooklyn): foto kartu, ±640x360, dari `hero_hall_v09_small.png` (Hokkaido)
  dan `cam_main_hall.png` (Brooklyn). *(Keputusan Claude.)*
- Workflow Pages harus ikut menyalin `galleries/brooklyn/main.js` (sekarang hanya menyalin `gallery.json` dan folder
  varian). *(Keputusan Claude: workflow menyalin juga `main.js` dan `thumb.webp` per gallery bila ada.)*

### 4.2 Pipeline (tool bersama, tidak diubah kecuali terbukti perlu)
Urutan WEB_GALLERY.md §3b dengan `WG_GALLERY=brooklyn`:
`bake_lightmaps.py` (fresh, dari `BROOKLYN_v07.blend` → `BROOKLYN_web.blend`) → `export_glb.py` → `render_env.py` →
`bake_art_normals.py` → `optimize.mjs`. Render panjang dijalankan headless satu per satu (Blender interaktif ditutup:
render berbarengan sempat kehabisan memori, 16 GB RAM).

### 4.3 `gallery.json` Brooklyn (koordinat Blender)
- `title`: "Brooklyn". `blend`: `source` = `blend/BROOKLYN_v07.blend`, `full` = `blend/BROOKLYN_web.blend`.
- `bake.res`: resolusi per objek mengikuti kepadatan Hokkaido (dinding/lantai/plafon 2048, partisi ~1024, trims dan
  pintu 512, frame lukisan 256 (hero 512), props 64-128); `bake.albedo` minimal `gallery_walls`. Angka persis = builder,
  dengan target ukuran aset sekitar Hokkaido (±11 MB di disk).
- `runtime.solid`: dinding, lantai, partisi, pintu, bangku koridor dan hall, plinth, patung, pot tanaman.
- `runtime.camera`: posisi awal = `CAM_main_hall` (0, -1.0, ~1.6) menghadap hero (0, -6.6). Tinggi mata ikut runtime.
- `runtime.floor`: `gallery_floor`. `runtime.env`: probe di tengah hall setinggi ~2.4 m, box seukuran hall.
- `runtime.dust`: kotak hall (x ±4.8, y -21.5..-2, z 0.3..4.4). `runtime.spots`: 17 spot hall dari Blender
  (`light_spot_*`, posisi + arah + 38°). Spot koridor tidak ikut (bukan sorotan lukisan).
- `runtime.partition`: tidak dipakai (khas Hokkaido); routing Brooklyn ada di `main.js` sendiri.

### 4.4 Perubahan di `galleries/brooklyn/main.js` (dibanding `shared/main.js`)
1. **Glide ke lukisan memutari partisi.** Tiga partisi berdiri bebas (tengah x -2..2; stub di x 4..5 atau -5..-4;
   y -6.62..-6.92, -11.62..-11.92, -16.62..-16.92). Jalur glide tidak boleh memotong partisi mana pun: lewat celah di
   samping panel tengah (x ≈ ±3) bila target ada di sisi lain partisi. Algoritma = builder (mis. waypoint di celah
   terdekat per partisi yang dilintasi).
2. **Arah hadap lukisan dari normal kanvas** (bukan tebakan partisi/dinding ujung Hokkaido), dipakai untuk posisi glare
   lukisan dan titik berdiri glide.
3. Tuning look (exposure, kontras, kekuatan lightmap/IBL) dicocokkan ke `cam_main_hall.png` Brooklyn, bukan ke
   referensi Hokkaido.
Selain itu identik dengan `shared/main.js` (keputusan user: samakan pengalaman).

### 4.5 Halaman pilih gallery (root)
- Dibuat saat deploy oleh workflow Pages dari tiap `galleries/*/gallery.json` yang punya `full/index.html`:
  judul dari `title`, foto dari `thumb.webp`, link ke `full/`. Urutan: alfabetis nama folder. *(Keputusan Claude.)*
- HTML statis + CSS, tanpa library. Mengikuti tema terang/gelap sistem, satu kolom di layar HP, kartu bisa difokus
  keyboard. Varian `empty` tidak muncul sebagai kartu.
- Bisa dibangun lokal juga (script yang sama dipanggil workflow), supaya bisa dicek dengan `npx serve`.

## 5. Selesai bila
- Lokal (`npx serve . -l 3000` dari root repo): `/` menampilkan 2 kartu yang mengarah ke gallery yang benar;
  `/galleries/brooklyn/full/` memuat tanpa error console, bisa jalan dari mulut hall sampai dinding ujung tanpa
  menembus dinding/partisi, kesembilan lukisan bisa diklik dan glide tidak memotong partisi.
- Screenshot web dari posisi awal dibandingkan dengan `cam_main_hall.png` dan disetujui user.
- Hokkaido `full/` dan `empty/` tetap jalan seperti sebelumnya (dicek lokal).
- Dokumentasi: WEB_GALLERY.md diperbarui (Brooklyn, halaman pilih, runtime per gallery).

## 6. Deploy
`main` lokal sudah 10+ commit di depan `origin/main` dan belum di-push (keputusan user sebelumnya). Push memindahkan
URL publik ke struktur baru dan menghapus `/web-empty/` lama. Merge branch ke `main` dan push **hanya setelah user
mengizinkan**.

## 7. Diserahkan ke builder
Resolusi bake per objek, isi persis `solid`, posisi probe/box, algoritma routing glide, angka tuning look, gaya visual
halaman pilih dalam batas opsi A, nama script pembangun halaman pilih.
