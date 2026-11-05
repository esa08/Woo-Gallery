# WOOD-GALLERY web (Babylon.js): agent knowledge base

Audience: AI agents dan developer yang melanjutkan versi web dari scene Blender di `GALLERY_SCENE.md`. Isi diambil dari kode (`web/`) dan pengukuran langsung di browser pada 2026-11-05. Angka bertanda **(diukur)** berasal dari tes, bukan asumsi. Yang belum diverifikasi ditandai ⚠.

## 0. TL;DR
- Walkthrough 3D first-person di browser, murni statis (HTML + 1 file JS), **Babylon.js 9.0.0 via CDN yang di-pin** (`cdn.babylonjs.com/v9.0.0/...`), WebGL2, tanpa build step untuk runtime.
- **Pencahayaan = lightmap hasil bake Cycles** (UV2), bukan lampu real-time. 26 spot + 6 area light + sun + bounce tidak mungkin berjalan real-time; hasil bake dimainkan ulang oleh **satu lampu putih seragam**.
- **Refleksi = satu panorama HDR** yang dirender dari tengah hall (box projection). Ditambah bloom, tone mapping, dan dust bergerak.
- Kontrol: **WASD** jalan, **panah** atau mouse (pointer lock) untuk melihat, gravity + collision, tinggi mata 1.608 m.
- Aset yang dikirim ke browser: **±11 MB** di disk (`web/assets`), ±8 MB transfer dengan gzip ⚠(estimasi; 6.7 MB diukur sebelum HDR 1.6 MB ditambahkan).
- Target visual: "realistis dan natural", dicocokkan dengan `renders/hero_hall_v09_small.png` (BUKAN `cam_*.png`, itu versi gelap lama).
- Dibuat/diuji desktop Chrome. Mobile, Firefox, dan Safari belum diuji.

## 1. Paths dan file
Root: `C:\Users\fx506\Pictures\Woo-Gallery\`

| Path | Isi | Dikirim ke browser? |
|---|---|---|
| `web/index.html` | canvas, overlay loading dan petunjuk kontrol, tag script CDN | ya |
| `web/src/main.js` | seluruh logika runtime (±310 baris) | ya |
| `web/assets/gallery.glb` | geometri + material, 8.0 MB (WebP) | ya |
| `web/assets/lightmaps/*.webp` + `manifest.json` | 23 lightmap + 4 albedo hasil bake | ya |
| `web/assets/env/hall.hdr` | panorama HDR 1024x512, 1.6 MB | ya |
| `web/tools/bake_lightmaps.py` | bake lightmap/albedo di Blender | tidak |
| `web/tools/export_glb.py` | ekspor GLB dari Blender | tidak |
| `web/tools/render_env.py` | render panorama HDR | tidak |
| `web/tools/optimize.mjs` (+ `package.json`, `node_modules/`) | WebP, buang tekstur yatim, salin HDR | tidak |
| `build/` (41 MB) | hasil mentah: `gallery.raw.glb` 32.6 MB, `lightmaps/*.png`, `env/hall.hdr`. Bisa dibuat ulang | tidak |
| `WOOD-GALLERY_web.blend` | **turunan** dari `v10_video.blend` (UV lightmap baru, patung perunggu sudah jadi mesh, atmosfer dibuang). Jangan diedit manual | tidak |
| `WOOD-GALLERY_v10_video.blend` | sumber asli, tidak pernah disentuh script web | tidak |

Deploy: kirim `web/` **tanpa `web/tools`** (`node_modules` ada di situ).
Jalankan lokal: `npx serve web -l 3000` lalu buka `http://localhost:3000` (GLB butuh HTTP, `file://` tidak bisa). `python` tidak berfungsi di shell ini (hanya alias Microsoft Store); script Blender memakai Python bawaan Blender dan tooling lain memakai Node 24.

## 2. Arsitektur runtime (`web/src/main.js`)

### 2.1 Urutan boot
`ImportMeshAsync(gallery.glb)` → `prepareMeshes` → `prepareMaterials` → `setupEnvironment` (HDR) → `applyLightmaps` → `setupLights` → `setupCamera` → `setupPipeline` → `setupDust` → `whenReadyAsync` → **freeze** material dan world matrix → render loop → overlay loading disembunyikan, overlay "Klik untuk mulai" ditampilkan.
- Tidak memakai `freezeActiveMeshes`: kamera bergerak, culling yang dibekukan akan membuat mesh muncul/hilang.
- Fallback performa: 6 detik setelah mulai, jika `getFps() < 40` maka `setHardwareScalingLevel(1.5)`. Hanya satu langkah, belum ada tier kualitas.
- `window.__g` = handle debug untuk console (engine, scene, camera, pipeline, bl, baked, lights, env). **Hapus untuk produksi.**

### 2.2 Koordinat
Blender (Z-up) → glTF `(x, z, -y)` → Babylon lewat matriks `__root__`. Root bernilai **scale z = -1 DAN rotasi Y 180°**, hasil bersihnya `world = (-x_b, z_b, -y_b)` (rotasi murni, bukan mirror).
- **Jangan menebak flip sumbu: pakai helper `bl(x, y, z)`** (angka Blender → vektor Babylon). Dipakai untuk spawn kamera, box dust, probe, dan semua uji.
- Hall memanjang ke **+Z** di Babylon. Menghadap −Y Blender (ke lukisan hero), **+X Blender ada di KIRI** (rumus kanan = forward × up). `GALLERY_SCENE.md` §2 menulis sebaliknya, itu keliru.

### 2.3 Model pencahayaan (inti)
1. **Bake**: Cycles Diffuse, Direct+Indirect, **tanpa Color** → lightmap = hanya cahaya, disimpan sRGB 8-bit sebagai `linear / scale` (scale per file di `manifest.json`).
2. **Playback**: `PBRMaterial.lightmapTexture` (UV2, `coordinatesIndex = 1`, `invertY = false`, `level = scale`) + `useLightmapAsShadowmap = true`. Shader PBR Babylon menghitung `(lampu × albedo + ...) × lightmap`, jadi satu `HemisphericLight` putih (ground = sky, specular hitam, `includedOnlyMeshes` = mesh ter-bake) menghasilkan `albedo × cahaya_bake`.
3. **Kalibrasi lampu**: `LM_LIGHT = 1.03` **(diukur)**. Dengan lightmap putih dan albedo putih, diffuse PBR Babylon keluar 0.95–0.98 per unit intensitas di dinding/lantai/plafon (energy conservation), maka 1/0.97.
4. **Mengapa tanpa Color**: tekstur kayu 1K (serat) dan plaster tetap tajam; lightmap cukup 2048 karena cahaya halus. Bake dengan Color akan membuang serat kayu.
5. **Plugin `LightmapGloss`** (`MaterialPluginBase`, hook `CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION`): Babylon mengalikan SEMUA (diffuse, ambient IBL, refleksi) dengan lightmap. Itu benar untuk diffuse tapi refleksi jadi gelap. Plugin menolkan `finalIrradiance`, spekular langsung, dan clearcoat langsung dari lampu seragam, lalu membagi `finalRadianceScaled` (dan radiance clearcoat) dengan lightmap supaya perkalian berikutnya membatalkannya. Hanya GLSL (WebGL). Terbukti: material yang sama tanpa plugin **jenuh ke 1.0** (clearcoat + spekular lampu seragam), dengan plugin 0.28–0.46.
6. **Mesh yang tidak punya lightmap** hanya dilit IBL (panorama): spot fixtures, pendant (emissive), label/teks, kaki bench/meja, patung perunggu, kaca, sky dome.

### 2.4 Lightmap dan albedo ter-bake
- 23 objek di manifest: dinding, lantai, plafon, trims, door frames, 9 frame lukisan, bench seat, 2 plinth, patung marmer, table top, pot, daun, outlet, smoke detector.
- Material yang dipakai lebih dari satu mesh di-`clone()` (contoh `wood_laminate` dipakai plafon dan trims). Nama mesh multi-material dari glTF berbentuk `<nama>_primitiveN`, dicocokkan lewat `baseName()`.
- **Albedo ter-bake** (`*_albedo.webp`, UV lightmap) untuk warna yang berasal dari node prosedural dan hilang saat ekspor glTF: dinding (campuran ivory + kotoran dekat lantai), bench + meja (serat oak), marmer.
- Objek **logam penuh** (kaki bench/meja, patung perunggu) memberi hasil Diffuse = 0. Tidak di-bake dan tidak masuk manifest (lightmap hitam akan membuatnya hitam total). Script melewatinya otomatis.

### 2.5 Refleksi (IBL)
`HDRCubeTexture("assets/env/hall.hdr", size 256, prefilterOnLoad)` sebagai `scene.environmentTexture`, intensitas 1.
- Probe dirender di **(0, -14.66, 3.86)** Blender = pusat volume hall, karena box projection Babylon mengasumsikan probe di tengah box. Box = 7 × 7.72 × 16 m (sumbu Babylon: x, atas, sepanjang hall).
- Orientasi sudah dicek dengan skybox sementara: tanpa rotasi, tanpa mirror (`ENV.rotationY = 0`).
- Hanya **satu probe di hall**: lantai entrance memantulkan hall, bukan jendela entrance. Dengan roughness setinggi ini selisihnya kecil ⚠(belum dibandingkan langsung).
- Efek gloss lantai halus: environment menambah ±8–10% luminance di lantai **(diukur)**. Lantai di Cycles juga kasar, jadi ini bukan kekurangan.

### 2.6 Post-process (`DefaultRenderingPipeline`, HDR)
MSAA 4× (FXAA mati), bloom (threshold 1.0, weight 0.35, kernel 64, scale 0.5; meniru Glare Blender), tone mapping **KHR PBR Neutral** (AgX **tidak ada** di Babylon 9.0.0), `exposure 1.4`, `contrast 1.2`, `colorCurves.globalSaturation −30`.
Nilai ini hasil grid search (4×3×3) terhadap `hero_hall_v09_small.png` memakai grid luminance dan saturasi 8×6: luminance rata-rata 0.415 vs 0.42 di referensi, saturasi 0.37 vs 0.389, RGB 0.483/0.405/0.318 vs 0.503/0.406/0.318. Entrance dicek terhadap render Cycles baru: 0.294 vs 0.300. Selisih per-sel sisa ±0.06 bersifat struktural (framing `shift_y` kamera Cycles, gloss lantai), bukan parameter global.

### 2.7 Kamera dan kontrol
`UniversalCamera`, FOV 0.8 rad (≈ lensa 24 mm 16:9, sama dengan kamera still), `minZ 0.05`, `maxZ 120`, spawn `bl(0, 0.9, 1.7)` menghadap hall.

| Input | Fungsi | Nilai |
|---|---|---|
| W A S D | maju, mundur, strafe | `speed 0.1` ≈ 1.5 m/s **(diukur)** |
| ← → | putar kiri/kanan | `rotationSpeed 0.25` ≈ 72°/s **(diukur)** |
| ↑ ↓ | lihat atas/bawah | pitch dikunci ±90° |
| Mouse | lihat | pointer lock setelah klik overlay, `angularSensibility 2500`, `inertia 0.8` |

- Panah **harus dikeluarkan** dari `keysUp/Down/Left/Right`: input keyboard Babylon mengecek daftar gerak lebih dulu, jadi panah yang masih terdaftar tidak akan pernah memutar.
- Gravity `−9.81/60` per frame, `ellipsoid (0.35, 0.8, 0.35)`. **Mata ada di puncak ellipsoid**, jadi tinggi mata settle di `2 × ellipsoid.y` = **1.608 m (diukur)**, bukan `ellipsoid.y` seperti tertulis di beberapa dokumentasi.
- `needMoveForGravity = true` wajib: defaultnya `false`, gravity baru mulai setelah tombol pertama ditekan.
- Collision hanya pada daftar `SOLID` (lantai, dinding, kaca jendela, door frames, bench, plinth, patung, meja, pot) = 18 mesh. Plafon, trims, dan fixtures tidak.
- Diuji (simulasi tombol 60 fps): kedua doorway partisi bisa dilewati sampai dinding belakang hall (berhenti di z = 22.31 = 22.66 − 0.35), panel tengah partisi dan meja konsol menahan kamera.

### 2.7b Klik lukisan → glide
`setupPaintingFocus` (main.js). Pointer lock menyembunyikan kursor, jadi "kursor" = titik di tengah layar (`#cross`, membesar saat di atas lukisan; pick throttled 120 ms). Klik **atau Enter** (NumpadEnter juga; Enter saat glide = berhenti) (saat pointer lock) → `scene.pick` di tengah layar, dalam **piksel CSS** (`canvas.clientWidth/2`): `scene.pick` membagi dengan hardware scaling level, jadi memakai `getRenderWidth()/2` membuat titik pick meleset begitu fallback 1.5 aktif → kamera meluncur ke depan lukisan (jarak dihitung agar lukisan muat dengan FOV, 1.4–4 m, mata tetap di tinggi gravity), menghadap pusat lukisan, easing cubic 1–2.5 s berbasis waktu (`performance.now`, aman saat tab di-throttle). Sisi depan = normal face yang di-pick. Gerak **tanpa collision** lewat rute: satu sisi partisi = garis lurus; beda sisi (entrance / hall) = lewat tengah doorway terdekat (`DOORS` = Blender x ±2.0, bukaan 1.3–2.7 m diukur ray cast; gate 1.2 m sebelum/sesudah dinding), dihaluskan Chaikin. Versi pertama memakai `moveWithCollisions` dan macet menempel dinding saat lukisan tujuan dilihat miring lewat doorway. Bench/plinth/meja di bawah tinggi mata, jadi kamera lewat di atasnya. Diuji 5 skenario (tak ada titik jalur di dalam dinding). Input kamera di-`detachControl` selama glide; tombol apa pun menghentikannya. Hanya mesh `art_NN_frame` yang `isPickable`. Uji dari console: `__g.focus.flyTo("art_09_frame")`.

### 2.7c Loading bar
Bertahap karena GLB lewat gzip tidak punya Content-Length (`lengthComputable=false`, bar lama tidak bergerak) dan tahap berikutnya memblok main thread: GLB 2–52% (fallback `GLB_BYTES` bila total tak diketahui), refleksi 58%, lightmap 68–88% (per tekstur via `onLoad`), shader 90%, siap 100%. Tiap tahap menunggu satu paint (`rAF` + fallback `setTimeout`).

### 2.8 Dust
`ParticleSystem` 400 partikel, ukuran 8–18 mm, umur 25–45 s, blend additive, tekstur radial dari `DynamicTexture` (tanpa file). Hanya di **box hall** dari `GALLERY_SCENE.md` §8: dari spawn di entrance belum terlihat, baru setelah masuk hall.
- Gerak: kecepatan awal 5–12 cm/s lalu `updateFunction` dibungkus dengan **medan aliran sinus** (pusaran ±3 m, tanpa state per partikel) + redaman 0.99/frame. Hasil **(diukur)**: median 5.5 cm/s, rentang 2–10 cm/s, bergeser rata-rata 26 cm per 4.8 s. Versi pertama (0.6 cm/s) tampak diam.
- Kecepatan arah × emit power = m/s; independen frame rate lewat `scene.getAnimationRatio()`.
- Pelajaran dari Blender: 3500 mote dan densitas 0.0045 terlihat seperti salju. Tetap kecil dan sedikit.

### 2.8b Light play (`setupLightPlay`): glare lukisan + berkas cahaya
Lightmap statis, jadi dua hal ini dibuat realtime tanpa mengubah lightmap.
- **Glare di lukisan**: kanvas (primitive0) dapat clearcoat (varnish) + satu `SpotLight` spekular per lukisan. Lampu itu **virtual**: 0.9 m di depan lukisan dan 0.35 m di atas pusatnya. Spot Blender asli tidak dipakai karena menggantung ±1 m dari dinding dan ±4 m tinggi, jadi bayangan cermin-nya selalu jatuh **di atas** bingkai dari posisi berdiri mana pun (dihitung: lukisan 1.5 m dengan mata 1.65 m, tinggi sorot ≈ 3.4–4.6 m). Hasil: sorot lembut di kanvas yang bergeser mengikuti kamera.
- Kunci yang dipelajari: PBR Babylon memakai warna **diffuse** lampu untuk spekular, jadi diffuse hitam = spekular nol. Pakai `light.lightmapMode = Light.LIGHTMAP_SPECULAR` (buang bagian diffuse, lightmap sudah punya) dengan diffuse = warna spekular. `LightmapGloss(material, spec=true)` untuk `art_*` tidak lagi menolkan `finalSpecularScaled` / `finalClearCoatScaled`, tapi mengalikannya `1/lightmap` (sama seperti refleksi) agar perkalian lightmap membatalkan.
- **Posisi lampu virtual divariasikan** per lukisan (seed tetap, `PAINT.jitterOut/Side/Up`: ±0.2 m ke depan, ±0.6 m menyamping, ±0.2 m tinggi), supaya glare tidak jatuh di titik yang sama di semua lukisan.
- **Relief cat** = normal map yang di-bake dari node **Bump** material Blender (`web/tools/bake_art_normals.py`: luminansi lukisan sebagai tinggi, strength 0.6, distance 2 mm; Cycles NORMAL bake, tangent space, OpenGL/glTF, PNG 8-bit selebar gambar lukisan ±1000 px, UV 0). `optimize.mjs` mengubahnya ke `web/assets/normals/<material>.webp` (q90, total ±0.8 MB untuk 9 lukisan). `main.js` memuatnya saat start (ikut loading, bukan lazy: 0.8 MB tidak sebanding dengan kerumitan unfreeze material) dan memasangnya sebagai `bumpTexture` kanvas **dan** `clearCoat.bumpTexture` (varnish mengikuti permukaan cat). Glare jadi pecah menjadi kilau di punggung sapuan. `PAINT.relief` = level normal map (pengali kemiringan): 1 = halus, 1.5 = pilihan pertama (terlalu halus), **4 dipilih** (menonjol jelas), 6 = mulai kasar. Relief hanya terlihat saat Glare on (level 0 saat off). Sebelumnya relief dibuat saat runtime dari luminansi (Sobel GPU); itu diganti karena hanya mendekati Bump Blender. Normal map glTF bawaan GLB tetap dibuang oleh `optimize.mjs` (isinya gambar warna, bukan normal); `invertNormalMapX = true` meniru yang diset loader glTF di scene kidal ini.
- **Tombol "✧ Glare"** (kanan bawah) atau tombol **G**, default **off**. `play.setGlare(bool)` hanya mengubah uniform (intensitas lampu virtual, `level` relief, intensitas clearcoat) jadi tidak ada recompile dan jalan juga di material beku. Diuji: on vs off berbeda ±2800 piksel di titik pantulan, on→off→on kembali identik.
- Lampu hanya untuk kanvas (`includedOnlyMeshes`): di bingkai walnut tampak seperti logam. Intensitas 8: 30 = blob terbakar, 0.6 = tak terlihat. Material **beku** (`freeze()` setelah load) menampilkan hasil yang benar; `unfreeze()` untuk menyetel di console membuat lukisan tampak pucat, jadi bandingkan hanya pada halaman yang baru dimuat.
- **Berkas cahaya**: 28 kerucut (tabel `SPOTS` = salinan `light_spot_*` Blender, koordinat Blender) sepanjang sinar sampai permukaan pertama (`scene.pickWithRay` ke `SOLID`, maks 8 m). `ShaderMaterial` additive tanpa depth-write; alpha = `strength × chord × along × near` (chord ≈ |N·V|^1.4 supaya tepi menghilang, `along` memudar di ujung, `near` mencegah irisan keras di dekat kamera). Intensitas `BEAM.strength = 0.09`; 0.2 sudah seperti kabut.
- **Mote** (450, `beamDust`): lahir acak di dalam kerucut, ukurannya diskalakan 0 di luar berkas (dihitung tiap frame dari jarak ke sumbu), jadi hanya berkilau saat melewati cahaya; mengecil dekat lensa (< 1.7 m) agar tidak jadi bola besar. Berkas + mote **default mati** (`BEAM.on = false`); tombol "✦ Beams" di kanan bawah atau tombol **B** menyalakannya (`window.__g.play.setBeams(bool)` dari console).

### 2.8c Pantulan lantai (`setupFloorReflection`)
`MirrorTexture` 1024² (HALF_FLOAT, mip-map, `adaptiveBlurKernel` 12) di bidang lantai (y = 0), dipasang sebagai `reflectionTexture` material `wood_floor` (yang sudah punya clearcoat); roughness lantai dari tekstur memburamkan pantulan lewat mip. `LightmapGloss` sudah membagi refleksi dengan lightmap, jadi cocok. `FLOOR.level` = 3 (level 1 nyaris tak terlihat, 4 terlalu terang). `renderList` = semua mesh kecuali lantai dan berkas (`beam*`); partikel tidak ikut terpantul. Biaya: satu pass scene tambahan; `FLOOR.every = 2` menghemat setengah.
- Tombol "◈ Floor reflection" / **R**, default on. Off = `level 0` + berhenti merender. Material lantai beku tidak membaca `level` baru, jadi `set()` melakukan `unfreeze()` lalu `freeze()` sesudah satu frame (tanpa recompile). Mengganti `reflectionTexture` ke null akan recompile material beku dan lantai hilang sesaat, jadi tidak dipakai. Konsekuensinya "off" = lantai tanpa pantulan sama sekali (bukan lagi probe statis).

### 2.8d Penyesuaian mata (`setupEyeAdaptation`)
`RenderTargetTexture` HDR 48×27 dari kamera jalan, dirender tiap 8 frame dan dibaca (`readPixels`, satu-satunya stall GPU). Dirata-rata log-luminansi berbobot tengah; bacaan pertama (spawn, tampilan yang sudah di-tuning) = referensi. `exposure = 1.4 × clamp((ref/L)^0.5, 0.7, 1.5)`, dihaluskan: τ = 0.6 s saat harus lebih gelap, 2.0 s saat harus lebih terang. Diukur: spawn L≈0.126; menatap langit-langit L≈0.062 → exposure naik ke ≈1.9; dinding ruang masuk L≈0.100 → ≈1.5. Selalu aktif, **tanpa tombol** (sudah disetujui). Untuk membandingkan dari console: `__g.eye.on = false` membekukan eksposur di nilai terakhir.
- Halo di kepala lampu **tidak** dibuat: kepala lampu track dari luar tidak menyala (bohlam di dalam kap); ambang bloom 1.0 sudah ada untuk benda yang memang lebih terang.

### Tombol efek (kanan bawah, `toggle()` di `main()`)
Music (M), Beams (B, default off), Glare (G, default off), Floor reflection (R). Semua `apply(on)` hanya mengubah uniform / refresh rate, kecuali lantai yang unfreeze sesaat.

### 2.9 Kaca
`glass_gray_translucent`: transmission dimatikan (akan merender scene dua kali) diganti alpha 0.12 dengan `useRadianceOverAlpha` dan `useSpecularOverAlpha`, jadi refleksi tetap terlihat di kaca yang transparan.

## 3. Pipeline build (urutan, dari root repo)
```
1. blender -b WOOD-GALLERY_v10_video.blend -P web/tools/bake_lightmaps.py -- --samples 768 [--albedo]
      -> WOOD-GALLERY_web.blend (UV2 baru) + build/lightmaps/*.png + manifest.json
2. blender -b WOOD-GALLERY_web.blend -P web/tools/export_glb.py
      -> build/gallery.raw.glb   (lampu/kamera/empty/atmosfer dibuang di memori, .blend tidak disimpan)
2b. blender -b WOOD-GALLERY_v10_video.blend -P web/tools/render_env.py
      -> build/env/hall.hdr
3. cd web/tools && npm install && node optimize.mjs
      -> web/assets/gallery.glb, web/assets/lightmaps/*.webp (+ manifest), web/assets/env/hall.hdr
         (+ web/assets/normals/*.webp bila build/normals ada, lihat di bawah)
2c. blender -b WOOD-GALLERY_v10_video.blend -P web/tools/bake_art_normals.py
      -> build/normals/<material kanvas>.png (9 lukisan, ±5 detik; tidak menyimpan .blend). Lalu langkah 3.
```
Blender di `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. Cycles memakai OptiX (RTX 3050 Laptop 4 GB).

**Tambahan inkremental** (tanpa bake ulang semua, UV lightmap lama dipertahankan, manifest digabung):
```
blender -b WOOD-GALLERY_web.blend -P web/tools/bake_lightmaps.py -- --in-place --samples 768 --only nama1,nama2
blender -b WOOD-GALLERY_web.blend -P web/tools/bake_lightmaps.py -- --in-place --no-light --albedo --only gallery_walls
```
Lalu ulangi langkah 2 dan 3. Objek baru didaftarkan di `DEFAULT_RES` (dan `ALBEDO_RES` bila perlu) di `bake_lightmaps.py`.

**Objek/lampu baru dari scene sumber** (tanpa bake ulang semua): `blender -b WOOD-GALLERY_web.blend -P web/tools/sync_objects.py -- nama1,nama2` menyalin objek dari `v10_video.blend` ke copy web (material dipakai ulang berdasarkan nama; lampu masuk `Lighting`, mesh masuk `Gallery`). Lalu bake ulang **semua objek yang terkena cahaya baru** (dinding, lantai, trims, door frames, props di dekatnya), ekspor GLB, optimize. Contoh 2026-11-05 (lampu spot partisi `partition_spot_fixture_hall/ent` + `light_spot_part_hall/ent`): bake `gallery_walls,gallery_floor,gallery_trims,gallery_door_window_frames,art_03_frame,art_09_frame,table_top,plant_pot,plant_leaves` ±11 menit. Fixture hanya IBL (tanpa lightmap), seperti spot fixtures lain.

### Parameter bake
- 768 spp, adaptive threshold 0.005, margin 8 px (extend), blur gaussian σ = 1 px yang hanya memakai texel ter-bake (normalized convolution, supaya padding hitam tidak bocor).
- UV: Smart UV Project ke layer `UVMap.001` (diekspor sebagai `TEXCOORD_1`), margin 6 px, skala pulau proporsional ukuran 3D. Pemakaian atlas lantai 60%, dinding 34%, plafon 34% (UV2 bawaan GLB hanya memakai 7–10%).
- Resolusi: dinding 2048 (88 px/m), lantai 2048 (127 px/m), plafon 2048 (37 px/m), trims dan door frames 512, frame lukisan 256 (hero 512), props kecil 64–128. Albedo dinding 1024.
- Waktu bake di RTX 3050 Laptop: dinding ±4.5 menit, lantai ±6.5 menit, plafon ±3.5 menit, props beberapa detik per objek.
- Panorama: 1024×512, 512 spp, denoise, `sample_clamp_indirect 20`, compositor (Glare) dimatikan, atmosfer dibuang (mote debu akan jadi titik terang di setiap refleksi).
- `optimize.mjs`: semua tekstur → WebP kualitas 90 (sky dome dikecilkan ke 2048 dan kualitas 85; lightmap kualitas 95, di bawah itu gradien tepi kolam spot mulai banding); normal dan metallicRoughness map lukisan dibuang.

## 4. Gotcha (dipelajari lewat error)
1. **`cam_*.png` di `renders/` adalah versi gelap lama** (sebelum lampu pendant). Acuan look yang disetujui: `hero_hall_v09_small.png`. Sempat salah menala ke yang lama.
2. **Clearcoat + hemispheric light seragam**: lantai jenuh ke 1.0 saat kamera menatap lurus ke bawah (highlight dari lampu arah atas). Itu alasan plugin `LightmapGloss` ada.
3. **Metal penuh → bake Diffuse = 0** → jangan masukkan ke manifest.
4. **Props tanpa UV sama sekali**: layer baru akan menjadi `TEXCOORD_0`, bukan `_1`. Script membuat layer dummy `UVMap` dulu.
5. **Ekspor Blender**: node prosedural (warna dinding, oak, marmer) hilang, warna jatuh ke putih. Normal map lukisan adalah **gambar warna yang sama** (artefak bump-from-luminance), dibuang karena tidak berguna.
6. **`sharp` 0.34 + `@gltf-transform/functions`**: mengimpor paket `functions` memuat libvips kedua (lewat `ndarray-pixels`) dan `sharp` gagal dengan `colourspace: parameter space not set`. Solusi: tidak mengimpor `functions`; tekstur yatim dibuang manual, konversi WebP langsung lewat `sharp`. `textureCompress()` gltf-transform ikut tidak bisa dipakai. `effort > 4` juga bermasalah pada input PNG.
7. **`PBRMaterial.albedoColor` nilainya linear** (sama dengan nilai glTF/Blender), bisa diisi langsung dari angka Blender.
8. **Tab browser di-throttle** (rAF turun ke ~1 fps saat tidak terlihat). `engine.getFps()` tidak bisa dipercaya di sesi otomatis. Cara tes yang andal: hentikan render loop, panggil `scene.render()` sinkron dengan `engine.getDeltaTime = () => 16.667` dan `getFps = () => 60`.
9. **`engine.readPixels` tidak andal** dengan pipeline aktif. Untuk membaca piksel pakai `BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync` lalu `getImageData` pada canvas 2D.
10. **`MaterialPluginBase.isEnabled=false` / `dispose()` tidak melepas plugin** dari shader yang sudah dikompilasi. Untuk A/B pakai `material.clone()` (serialisasi tidak membawa plugin).
11. Material sudah `freeze()`: ubah properti lalu `unfreeze()` dulu, atau perubahan define tidak diterapkan.
12. Kecepatan kamera Babylon bergantung `deltaTime/fps`: nilai `speed` dan `rotationSpeed` harus diukur, bukan ditebak (0.4 = 5.9 m/s; rotasi default 143°/s).
13. Beberapa nama API tidak ada atau berbeda dari dokumentasi (mis. `TONEMAPPING_AGX`). Verifikasi dengan `bash .claude/skills/babylonjs/scripts/check_api.sh 9.0.0 <nama>` sebelum dipakai.

## 5. Cara memverifikasi perubahan
- Console bersih: mulai tracking `read_console_messages` **sebelum** navigasi, baru reload.
- **Look**: bandingkan dengan render Cycles pada pose kamera yang sama. Hitung luminance dan saturasi per grid 8×6 (script numpy di Blender untuk referensi, JS untuk halaman), lalu grid search exposure/contrast/saturasi.
- **Gerak/collision**: simulasi tombol dengan mendorong keycode ke `camera.inputs.attached.keyboard._keys` sambil me-render sinkron (poin 8 di atas).
- **Dust**: lacak `ps.particles[i].position` dan `age` (umur simulasi), kecepatan = jarak / Δage (independen throttle).
- **Orientasi env**: `scene.createDefaultSkybox(env)` sementara, sembunyikan semua mesh, hadap +Z dan cocokkan dengan panorama.

## 6. Status dan sisa pekerjaan

### Sudah
Walkthrough WASD + panah + mouse, collision, gravity; lightmap 23 objek + albedo prosedural; IBL hall dengan box projection; plugin gloss; bloom/tone mapping tertala; dust bergerak; kompresi aset (40 → 11 MB); pipeline build terdokumentasi dan bisa diulang.

### Belum / perlu dikerjakan
**Sebelum rilis**
- ⚠ Tes input asli (keyboard fisik, pointer lock, mouse look). Tes otomatis memakai simulasi tombol.
- ⚠ QA keliling semua zona: jahitan lightmap, dinding belakang, sisi hall dari partisi, close-up lukisan.
- ⚠ `art_03` dan `art_09` di partisi: lightmap rata-rata 0.06, jauh lebih gelap dari lukisan lain. Belum dibandingkan dengan Cycles (bisa benar, bisa bug).
- Self-host Babylon (`babylon.js`, loaders, decoder) dan hapus `window.__g`. Saat ini masih CDN `v9.0.0`.
- Deploy (hosting static, tanpa `web/tools`).

**Fidelity vs Cycles**
- Tidak ada: DOF, god rays/volume, matahari bergerak, AgX asli (diganti Neutral + tala manual), transmission kaca asli.
- Hanya satu probe refleksi (hall); entrance memakai probe yang sama.
- Teks label tetap tidak terbaca (sama seperti di Cycles); tidak ada daun pintu (sama seperti di Blender).
- Dust hanya di hall, belum di entrance.
- Detail prosedural yang masih hilang: kotoran plaster halus (resolusi albedo dinding 1 cm/px), variasi per-papan di plafon.

**Teknis**
- KTX2 belum ada (`toktx` tidak terpasang): WebP hanya mengecilkan download, **VRAM tidak turun**. Penting bila mobile jadi target.
- Geometri belum dikompres (2.6 MB, meshopt butuh decoder).
- Belum ada tier kualitas, kontrol touch, atau uji Firefox/Safari.
- Folder bukan repo git: tidak ada riwayat versi untuk `web/` dan `build/`.

**Fitur yang sengaja ditunda dari v1**
- Klik lukisan → kamera mendekat + panel info (judul/medium di `GALLERY_SCENE.md` §4).
- Tour otomatis dari 8 keyframe `CAM_video` (`GALLERY_SCENE.md` §9).

**Dokumen**
- `GALLERY_SCENE.md` §2: klaim "+X di kanan saat menghadap −Y" salah (lihat §2.2 di sini). Belum dikoreksi.
