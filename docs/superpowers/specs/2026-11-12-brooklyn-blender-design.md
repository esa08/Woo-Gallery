# Brooklyn gallery (sisi Blender): design

Tanggal: 2026-11-12. Issue: VA-21 "Rebuild Brooklyn Gallery 3d" (plan.gothru.org). Status: draft, menunggu persetujuan user. Bagian bertanda *(Keputusan Claude.)* dan §7 belum dikonfirmasi user.

## 1. Kenapa

Villume punya ruangan "T-GALLERY" (GoThruMedia/villume-exhibitions, `T-GALLERY/t-gallery-ori@default.glb`) dengan
lightmap lama yang tidak dipakai lagi. Ruangan ini dibangun ulang jadi gallery baru **Brooklyn** di repo ini, dengan
kualitas visual setara Hokkaido (`galleries/hokkaido/`, acuan look: `renders/hero_hall_v09_small.png` dan web
https://esa08.github.io/Woo-Gallery/). Tahap ini **hanya Blender**: scene bersih, realistis, siap dilanjutkan orang lain.
Lightmap dan web menyusul belakangan lewat pipeline yang sudah ada (WEB_GALLERY.md §3b).

## 2. Goals, non-goals, anti-goals

Goals:
- `.blend` Brooklyn yang bersih: objek dan material bernama jelas, tidak ada sisa yang tidak dipakai.
- Material realistis untuk dinding, lantai, kayu, metal, kaca, frame.
- Pencahayaan natural dengan mood Hokkaido: terang tapi tidak washed out, sinar matahari lewat skylight, spot hangat
  ~3000 K ke lukisan, lampu yang memancarkan cahaya terlihat sebagai fixture.
- Efek halus: dust, bloom/glare, pantulan lantai, berkas cahaya tipis.
- Isi galeri di hall: 9 lukisan Hokkaido + label, bangku, plinth dengan patung, tanaman, detail kecil.
- Backdrop yang terlihat lewat skylight.
- Kamera (main, entrance, close-up lukisan) + render preview untuk review.
- `galleries/brooklyn/SCENE.md` (isi ruangan, lampu, catatan penting), format mengikuti `galleries/hokkaido/SCENE.md`.

Non-goals (tahap ini):
- Bake lightmap, export GLB, `gallery.json` lengkap untuk runtime, halaman web. Menyusul.
- Mengisi koridor depan dengan karya. Koridor = ruang lewat saja (keputusan user).
- Video/animasi kamera.
- Varian `empty`.

Anti-goals (gagal walau "jalan"):
- Lampu tersembunyi (area/fill "wash" yang tidak punya fixture) untuk mendongkrak terang. User menolak ini di Hokkaido
  karena terlihat palsu.
- Ruangan gelap atau sebaliknya washed out.
- Dust yang terlihat seperti salju; efek yang mencolok.
- Scene yang memutus jalur web nanti (nama/collection tidak mengikuti aturan §3b).

## 3. Kondisi sumber (diukur 2026-11-12, GLB diimport ke Blender 5.2 LTS)

Denah huruf **T**, Z-up, meter, lantai z = 0, dinding setinggi ~4 m.
- **Hall** (batang T): x -5..+5 (10 m), y ~-1.8..-21.77, skylight kaca memanjang di atas (x ±4.25, y -3..-21, z ~4.5-4.8)
  dengan rangka (`Window`, `Beam_003`, `Ceiling_Outside_2`). Rel lampu track di sisi skylight (`Lamp_support_001`,
  kepala lampu di `Lamp_016.001` / `Lamp_016.002`, material `Emission_Small_Lamps`).
- **Partisi** (`color_drag_area@Panels`, tebal 0.3 m, tinggi 2.5 m), tiga baris:
  - y -6.62..-6.92: panel tengah x -2..2, stub x 4..5 (menempel dinding kanan).
  - y -11.62..-11.92: panel tengah x -2..2, stub x -5..-4 (menempel dinding kiri).
  - y -16.62..-16.92: panel tengah x -2..2, stub x 4..5.
- **Koridor** (palang T): x -10.33..10.33, y ~-1.8..2.23. Bangku Barcelona (`Puff Barcelona.006` 378k face +
  `Puff Barcelona-metal`), double door di kedua ujung (`Door_003`, `Door_lock_003`), plafon gelap, lampu linear
  (`Long_lamp_Corridor-BAKE`), downlight bulat (`Circle-LAMP`), sprinkler (`Sprinkler_system_001`).
- Lain-lain: `color@Ceiling`, `color_drag_area@Walls`, `donut_area@Floor`, `color@Trims`, `collision_invisible`,
  `ENVIRONMENT` (bola 152 m, foto 3840x2160).
- **Tidak ada light object sama sekali.** Mesh GLB vertex-nya terpisah per face (lihat Hokkaido SCENE.md §10.4).
- Prefix `color@`, `color_drag_area@`, `donut_area@` adalah tag konfigurator web lama.

## 4. Keputusan user

- Lightmap lama tidak dipakai; bake ulang nanti.
- Fokus Blender dulu, web belakangan.
- Lukisan memakai 9 gambar yang sama dengan Hokkaido.
- Koridor hanya ruang lewat; pajangan fokus di hall.
- Mood mengikuti referensi Hokkaido (dari issue VA-21).
- Hero painting di **muka depan partisi pertama** (y -6.62, menghadap koridor), bukan di dinding ujung: partisi tengah
  (4 m x 2.5 m) menutupi dinding ujung dari koridor. Geometri partisi tidak diubah.
- GLB sumber dan file `.blend` Brooklyn **boleh di-commit** ke repo ini.

## 5. Rancangan

### 5.1 File dan folder
- `galleries/brooklyn/blend/T-GALLERY.glb`: GLB sumber asli, tidak diubah, di-commit. Diambil dari GitHub
  `GoThruMedia/villume-exhibitions`, branch `master`, `T-GALLERY/t-gallery-ori@default.glb` (8 311 924 byte, commit
  terakhir folder 2024-02-03). Salinan ada di scratchpad sesi 2026-11-12; ukuran §3 diukur dari file ini.
- `galleries/brooklyn/blend/BROOKLYN_vNN.blend`: scene, disimpan per versi (v01, v02, ...). Versi terbaru di `blend/`,
  versi lama dipindah ke `archive/` (git-ignored), sama seperti Hokkaido.
- Gambar lukisan **tidak disalin**: blend merujuk `//../../hokkaido/art/crop/<file>` (path relatif, tidak di-pack).
  Satu sumber gambar, repo tidak membengkak 15 MB. *(Keputusan Claude.)*
- `galleries/brooklyn/renders/` (sudah git-ignored lewat pola `galleries/*/renders/`) untuk preview.
- `galleries/brooklyn/SCENE.md`.

### 5.2 Konvensi (supaya jalur web §3b tidak perlu diubah)
- Collection: `Gallery` (arsitektur), `Environment` (`env_sky_dome`), `Gallery_Content`, `Lighting`, `Cameras`,
  `Atmosphere`.
- Nama arsitektur `gallery_*` (mis. `gallery_walls`, `gallery_floor`, `gallery_ceiling`, `gallery_trims`,
  `gallery_partitions`, `gallery_skylight_frame`, `gallery_spot_fixtures`, `gallery_window_glass`); tag konfigurator dibuang.
- Lukisan `art_NN[_hero]_frame`, material kanvas berawalan `art_`, label `art_NN_label` / `art_NN_label_txt`.
- Kaca skylight: mesh `gallery_window_glass`, material `glass_gray_translucent`.
- Objek atmosfer berawalan `atmos_`. Sky dome `env_sky_dome`, tekstur `tex_sky_dome_color`.
- UV lightmap: belum dibuat di tahap ini (UV lama `UVMap.001` dibuang); dibuat saat tahap bake.

### 5.3 Bersih-bersih
Hapus: `collision_invisible`, `ENVIRONMENT` (diganti `env_sky_dome`), UV `UVMap.001` lama, material dan image yatim
setelah ganti material. Bangku Barcelona di-decimate sampai wajar (target kasar ≤ 30k face per bangku set, tanpa
perubahan siluet yang terlihat di kamera). Weld (`remove_doubles` 0.0001) di objek yang perlu Bevel.

### 5.4 Material
Prinsip: pakai ulang material Hokkaido yang sudah disetujui (append dari `galleries/hokkaido/blend/WOOD-GALLERY_v10_video.blend`)
bila cocok, lalu sesuaikan. *(Keputusan Claude.)*
- Dinding putih cat satin (tekstur `Paint_Satin_*` dari GLB tetap dipakai atau diganti `wall_paint` Hokkaido diwarnai
  putih hangat), dengan sedikit variasi/kotoran dekat lantai.
- Lantai: parquet ash dari GLB (`Natural Ash Wood Parquet_*`) + variasi roughness dan clearcoat tipis seperti
  `wood_floor` Hokkaido, supaya ada pantulan lantai.
- Metal (rel lampu, sprinkler, kaki bangku, handle pintu), kaca skylight, frame lukisan, label: dari Hokkaido.

### 5.5 Pencahayaan
Mengikuti Hokkaido SCENE.md §6-7 sebagai titik awal:
- Sky Texture + `light_sun` sinkron arah matahari; matahari masuk lewat skylight dan membentuk pola rangka di dinding/lantai.
- Spot di **setiap kepala lampu track** yang ada di mesh (diposisikan di lensa fixture), ~3000 K, diarahkan ke lukisan
  atau dinding. Kepala lampu yang tidak menyorot apa pun tetap jadi spot (diarahkan ke dinding), bukan dihapus.
- Koridor: lampu linear dan downlight yang sudah ada jadi sumber cahaya sungguhan (area/point di fixture-nya).
- Tidak ada lampu tanpa fixture. Kalau kurang terang: naikkan lampu yang ada, atau tambah fixture yang terlihat.
- Render: Cycles GPU (OptiX), AgX, bloom lewat compositor Glare, setting awal sama seperti Hokkaido, disetel lewat preview.

### 5.6 Isi hall (koridor tidak diisi)
- 9 lukisan Hokkaido, frame + label seperti Hokkaido (ukuran per lukisan sama dengan tabel Hokkaido SCENE.md §4).
  `art_01_hero` (2.40 x 1.98 m) di tengah muka depan panel partisi pertama (x -2..2, y -6.62, menghadap koridor),
  langsung terlihat saat masuk hall. Dinding ujung hall (y -21.77) diisi satu lukisan lain + dua plinth dengan patung
  (marmer, perunggu) di kiri-kanannya, sebagai titik akhir lorong. Tujuh sisanya dibagi ke muka panel partisi lain dan
  dinding samping hall, jarak lega. Penataan persis = keputusan builder, divalidasi lewat preview.
- Bangku di hall (1-2), tanaman dalam pot, detail kecil (stop kontak, detektor asap). Boleh append dari Hokkaido lalu
  disesuaikan.
- Bangku Barcelona di koridor tetap.

### 5.7 Efek
Dust motes (geometry nodes, kecil dan sedikit, terutama di area cahaya), volume tipis untuk berkas cahaya, bloom halus,
pantulan lantai dari material lantai. Semua harus tetap halus (lihat anti-goals).

### 5.8 Backdrop
`env_sky_dome` dengan foto langit/pepohonan, terlihat lewat skylight. Ray visibility seperti Hokkaido: hanya camera dan
transmission (supaya tidak menghalangi matahari).

### 5.9 Kamera dan preview
Minimal `CAM_main_hall` (dari koridor/mulut hall menghadap hero di partisi pertama, skylight terlihat di atas),
`CAM_entrance` (dari salah satu ujung koridor ke arah mulut hall), `CAM_artwork_detail` (close-up satu lukisan). Boleh
tambah satu kamera lorong samping yang menangkap kedalaman hall sampai dinding ujung. Konvensi arsitektural: pitch 90°, framing pakai Shift Y.
Preview kecil (960x540, sampel rendah) selama iterasi; still final 1920x1080 setelah disetujui. Render panjang
dijalankan headless (`blender -b ... -P ...`).

## 6. Selesai bila
- Scene bersih dan mudah dilanjutkan (nama, collection, tidak ada objek/material yatim), plus `SCENE.md`.
- Pencahayaan natural, tidak gelap, tidak washed out. Efek terlihat tapi halus.
- Preview dari beberapa kamera disetujui user.

## 7. Diserahkan ke builder
Penataan persis lukisan dan furnitur, jumlah dan daya lampu, parameter material, target decimate, sudut kamera,
sampel render preview, foto backdrop.
