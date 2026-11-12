# Multi-gallery layout: design

Tanggal: 2026-11-12. Status: disetujui user 2026-11-12.

## 1. Kenapa

Repo ini sekarang berisi satu gallery (Hokkaido / "Wood Gallery") plus varian tanpa lukisan. Berikutnya akan dibuat
**gallery baru dengan ruangan 3D yang berbeda** (blend baru) di repo yang sama. Struktur sekarang tidak siap untuk itu:

- Root penuh file `.blend` (v01–v10, `_web`, `_empty`, `.blend1`), `renders/` 210 MB, `WOOD-GALLERY.glb`.
- `web/` mencampur runtime (`src/main.js`), pipeline (`tools/`), dan aset hasil build.
- `web-empty/` menumpang `../web/src/main.js` dan `../web/assets/audio`.
- `main.js` dan tools penuh konstanta khusus ruangan Hokkaido (nama mesh, koordinat, spot, pintu partisi, resolusi bake
  per objek, nama file blend).

Tujuan: tiap gallery punya foldernya sendiri dan `index.html` sendiri, sementara runtime dan pipeline dipakai bersama.
Membuat gallery baru = buat folder, taruh blend, isi satu file config, jalankan pipeline.

## 2. Goals, non-goals, anti-goals

**Goals**
- Struktur folder per gallery (opsi A yang disetujui).
- Semua konstanta khusus ruangan keluar dari `main.js` dan tools, masuk ke `galleries/<nama>/gallery.json`.
- Satu `shared/main.js` untuk semua gallery; tools dipanggil per gallery + varian.
- File lama dirapikan tanpa ada yang hilang.

**Non-goals**
- Membuat gallery baru itu sendiri (refactor ini hanya menyiapkan tempatnya).
- Bake ulang aset Hokkaido. Aset hasil build cukup dipindah.
- Logika generik untuk ruangan berbentuk apa pun (misalnya deteksi arah hadap lukisan dari geometri, routing glide
  tanpa partisi). Dikerjakan nanti ketika gallery baru sudah ada dan kebutuhannya kelihatan. Di refactor ini, fitur yang
  datanya tidak ada di config cukup **mati dengan aman** (lihat 4.3).
- Halaman pemilih gallery. Direncanakan nanti (permintaan user); sampai itu ada, root redirect ke Hokkaido. Field
  `title` di `gallery.json` sudah tersedia untuk dipakai halaman itu.

**Anti-goals (gagal walau "jalan")**
- `/galleries/hokkaido/full/` atau `/galleries/hokkaido/empty/` tampil atau berperilaku berbeda dari versi sekarang
  (lightmap, refleksi, glide ke lukisan, glare, beams, dust, floor reflection, eye adaptation, musik, tombol).
- Ada file `.blend`, lukisan sumber, atau render yang terhapus.
- Pipeline Hokkaido tidak bisa dijalankan lagi dari lokasi baru.

## 3. Struktur target

```
.github/workflows/pages.yml
.gitignore
WEB_GALLERY.md                    runtime + pipeline (dipakai bersama), path diupdate
docs/superpowers/specs/           dokumen ini
shared/
  main.js                         dari web/src/main.js
  audio/music.mp3                 dari web/assets/audio/
tools/                            dari web/tools/ (bake_*.py, export_glb.py, render_env.py, make_empty.py,
                                  sync_objects.py, optimize.mjs, package.json, package-lock.json)
galleries/
  hokkaido/
    gallery.json                  config ruangan (lihat 4)
    SCENE.md                      dari GALLERY_SCENE.md
    blend/                        WOOD-GALLERY_v10_video.blend (sumber), WOOD-GALLERY_web.blend,
                                  WOOD-GALLERY_empty.blend, WOOD-GALLERY.glb
    art/                          dari assets/art/ (termasuk crop/)
    renders/                      dari renders/ (ignored, referensi visual)
    build/full/                   dari build/ (ignored)
    build/empty/                  dari build-empty/ (ignored)
    full/index.html + assets/     dari web/index.html + web/assets/ (tanpa audio)
    empty/index.html + assets/    dari web-empty/
archive/                          (ignored) WOOD-GALLERY_v01..v09.blend, semua *.blend1
```

Semua pemindahan file yang di-track memakai `git mv` supaya history tetap tersambung.

`.gitignore` baru: `node_modules/`, `.claude/`, `*.blend1`, `archive/`, `galleries/*/build/`, `galleries/*/renders/`.

## 4. Config per gallery: `galleries/<nama>/gallery.json`

Satu file dibaca oleh runtime dan pipeline. Nilai untuk Hokkaido diambil apa adanya dari kode sekarang.
Format ini **internal untuk repo ini** (keputusan user, 2026-11-12): tidak perlu menyamai format gallery Villume, dan
koordinat tetap dalam sumbu Blender seperti kode sekarang.

```jsonc
{
  "title": "Wood Gallery",
  "blend": {
    "source": "blend/WOOD-GALLERY_v10_video.blend",          // tidak pernah disentuh script
    "full":   "blend/WOOD-GALLERY_web.blend",                 // turunan hasil bake, per varian
    "empty":  "blend/WOOD-GALLERY_empty.blend"
  },
  "bake": {
    "res":    { "gallery_walls": 2048, "...": 0 },            // DEFAULT_RES di bake_lightmaps.py
    "albedo": { "gallery_walls": 1024, "...": 0 }             // ALBEDO_RES
  },
  "runtime": {
    "glbBytes": 8.5e6,                                        // GLB_BYTES (fallback loading bar)
    "solid": ["gallery_floor", "..."],                        // SOLID
    "floor": "gallery_floor",                                 // mesh untuk floor reflection
    "camera": { "pos": [0, -7.4, 1.7], "target": [0, -22.66, 1.6] },   // koordinat Blender
    "env":  { "probe": [0, -14.66, 3.86], "box": [7, 7.72, 16], "rotationY": 0 },
    "dust": { "x": [-3.2, 3.2], "y": [-22.2, -6.9], "z": [0.3, 6.6], "count": 400 },
    "spots": [[-2.42, -14.608, 5.601, -0.261, 0, -0.965, 38], "..."],   // SPOTS
    "partition": {                                            // routing glide + arah hadap lukisan
      "doors": [-2.0, 2.0],
      "zone": [-6.0, -6.8],                                   // batas entrance / partisi / hall (Blender y)
      "gates": [-5.0, -6.4, -7.9],
      "wallY": -6.4,                                          // zPart di setupLightPlay
      "endY": -20                                             // zEnd di setupLightPlay
    }
  }
}
```

### 4.1 Runtime
- `index.html` tetap file terpisah per gallery/varian (judul, teks petunjuk, tombol yang disembunyikan, path musik).
- `index.html` memuat `../../../shared/main.js`. `main.js` mengambil config lewat `fetch("../gallery.json")` (relatif ke
  halaman; `full/` dan `empty/` sama-sama satu level di bawah folder gallery) sebelum memuat GLB.
- Aset varian tetap relatif ke halaman (`assets/gallery.glb`, `assets/lightmaps/...`), tidak berubah.
- Musik: `src="../../../shared/audio/music.mp3"`.
- Konstanta "rasa" yang bukan geometri ruangan (`LM_LIGHT`, `BEAM`, `PAINT`, `FLOOR` kualitas, `ADAPT`, setting kamera
  selain posisi) **tetap di `main.js`**. Dipindah ke config hanya kalau suatu gallery butuh nilai berbeda.

### 4.2 Pipeline
- Gallery dan varian dipilih lewat env var, melanjutkan konvensi `WG_VARIANT` yang sudah ada:
  `WG_GALLERY=hokkaido` (wajib; script berhenti dengan pesan jelas kalau kosong) dan `WG_VARIANT=full|empty`
  (default `full`).
- Path diturunkan dari keduanya:
  - build mentah: `galleries/<g>/build/<variant>/` (lightmaps, normals, env, `gallery.raw.glb`)
  - blend turunan: `galleries/<g>/` + `blend.<variant>` dari config
  - output web: `galleries/<g>/<variant>/assets/`
- `export_glb.py` dan `make_empty.py` berhenti memakai `//` (folder blend) untuk output; pakai path di atas.
- `sync_objects.py` membaca blend sumber dari `blend.source`, bukan nama hardcoded.
- `bake_lightmaps.py` membaca `bake.res` / `bake.albedo` dari config.
- Komentar header tiap script dan `optimize.mjs` diupdate ke perintah baru.
- `tools/node_modules` tidak dipindah; cukup `npm install` ulang di `tools/`.

### 4.2b Yang tetap di kode sebagai aturan penamaan (keputusan Claude)
Bukan koordinat atau daftar per ruangan, jadi tidak masuk config. Ditulis di bagian "Membuat gallery baru" di
`WEB_GALLERY.md` sebagai aturan yang harus diikuti modeller:
- lukisan: objek `art_<nn>[_hero]_frame`, material kanvas berawalan `art_`; label ikut prefix `art_`
  (dipakai `make_empty.py`, `bake_art_normals.py`, runtime)
- objek atmosfer berawalan `atmos_` (dibuang saat ekspor); sky dome `env_sky_dome` + tekstur `tex_sky_dome_color`
- kaca: material `glass_gray_translucent`, mesh `gallery_window_glass` (dikecualikan dari ray test beams)
- collection `Lighting` / `Gallery` (dipakai `sync_objects.py`), UV lightmap `UVMap.001`
- nama panorama tetap `env/hall.hdr`
- aturan arah hadap lukisan di `setupLightPlay` mengasumsikan garis tengah hall di Blender x = 0 (asumsi Hokkaido,
  dicatat; versi generik = non-goal)

`render_env.py` membaca posisi probe dari `runtime.env.probe` (harus sama dengan runtime), bukan konstanta sendiri.
`gallery.json` ditulis sebagai JSON biasa (contoh di atas memakai komentar hanya untuk penjelasan).

### 4.3 Kalau data tidak ada di config
Untuk gallery baru yang belum mengisi semuanya, runtime tidak boleh crash:
- tanpa `dust` → tanpa dust; tanpa `spots` → tanpa beams; tanpa `partition` → glide lurus;
- tanpa `floor` → tanpa floor reflection; tanpa `env` → tanpa refleksi probe.
Field wajib: `solid`, `camera`. Perilaku generik yang lebih pintar adalah non-goal (lihat 2).

## 5. Deploy (GitHub Pages)

Remote saat ini `github.com/esa08/Woo-Gallery`, workflow `pages.yml` tetap dipakai.

- `_site` mencerminkan layout repo supaya path relatif sama di lokal dan di Pages:
  `_site/shared/`, `_site/galleries/<g>/gallery.json`, `_site/galleries/<g>/full/`, `_site/galleries/<g>/empty/`.
  Yang **tidak** ikut: `blend/`, `art/`, `build/`, `renders/`, `SCENE.md`, `tools/`.
- Workflow menyalin semua `galleries/*` secara otomatis (loop), jadi gallery baru tidak perlu edit workflow.
- `_site/index.html` = redirect ke `galleries/hokkaido/full/` supaya link lama ke root tetap jalan. Sementara: nanti
  diganti halaman pemilih gallery.
- URL baru: `/galleries/hokkaido/full/` dan `/galleries/hokkaido/empty/`. URL lama `/web-empty/` hilang (disetujui user).
- Lokal: `npx serve . -l 3000` dari root repo.

## 6. Dokumen

- `WEB_GALLERY.md`: tabel path, perintah pipeline, cara jalan lokal, URL Pages, dan bagian varian diupdate. Tambah bagian
  singkat "Membuat gallery baru" (folder, `gallery.json`, urutan pipeline).
- `GALLERY_SCENE.md` → `galleries/hokkaido/SCENE.md`, path di dalamnya diupdate.
- `.claude/skills/babylonjs/references/gallery-pipeline.md` menyebut path lama; diupdate juga.

## 7. Verifikasi

1. Blend yang dipindah dibuka di Blender background: tidak ada file hilang (tekstur di-pack, tapi dicek).
2. `npx serve . -l 3000`, buka `/galleries/hokkaido/full/` dan `/galleries/hokkaido/empty/` di Chrome:
   tanpa error console, screenshot dari posisi awal dibandingkan dengan versi sebelum refactor (commit `2a98355`),
   glide ke lukisan lewat pintu partisi, tombol B/G/R/M berfungsi.
3. Pipeline: jalankan `optimize.mjs` untuk `hokkaido/full` dan `hokkaido/empty` dari build mentah yang sudah ada;
   output harus identik (atau setara byte untuk WebP) dengan aset yang sekarang di-commit. Bake ulang tidak perlu.
   Satu script Blender yang murah (`render_env.py` atau `export_glb.py`) dijalankan sekali untuk membuktikan path baru.
4. Workflow Pages: cek isi `_site` lewat dry run lokal dari perintah copy-nya.

## 8. Diserahkan ke builder
- Urutan commit (disarankan: pindah file dulu dengan `git mv`, lalu config + kode, lalu docs + workflow).
- Bentuk persis helper path di Python/Node (satu fungsi kecil per bahasa, tanpa framework).
- Cara `main.js` meneruskan config ke fungsi-fungsi setup (parameter atau satu objek modul).
