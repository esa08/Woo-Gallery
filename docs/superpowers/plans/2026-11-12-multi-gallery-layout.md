# Multi-gallery Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pindahkan gallery Hokkaido ke `galleries/hokkaido/`, keluarkan semua konstanta khusus ruangan ke `gallery.json`, dan buat `shared/main.js` + `tools/` dipakai bersama, tanpa perubahan tampilan.

**Architecture:** File dipindah dengan `git mv`. Runtime mengambil `../gallery.json` (relatif ke halaman) sebelum memuat GLB dan membaca semua nilai ruangan dari `R = cfg.runtime`. Script Blender dan `optimize.mjs` menurunkan semua path dari env `WG_GALLERY` + `WG_VARIANT` lewat satu helper kecil per bahasa.

**Tech Stack:** Babylon.js 9.0.0 (CDN), Blender 5.2 Python (`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`), Node 24 + gltf-transform + sharp, GitHub Pages workflow.

**Spec:** `docs/superpowers/specs/2026-11-12-multi-gallery-layout-design.md`

## Global Constraints

- Tidak ada file `.blend`, lukisan sumber, atau render yang dihapus. Yang tidak di-track dipindah dengan `mv`, yang di-track dengan `git mv`.
- Tidak ada bake ulang. Aset di `galleries/hokkaido/{full,empty}/assets/` harus tetap byte-identik dengan commit `2a98355` (kecuali `audio/` yang pindah ke `shared/`).
- `gallery.json` = JSON biasa, internal untuk repo ini, koordinat sumbu Blender.
- Konstanta "rasa" (`LM_LIGHT`, `BEAM`, `PAINT`, `FLOOR`, `ADAPT`, setting kamera selain posisi/target) tetap di `shared/main.js`.
- Aturan penamaan tetap di kode (`art_*`, `atmos_*`, `env_sky_dome`, `tex_sky_dome_color`, `glass_gray_translucent`, `gallery_window_glass`, `Lighting`/`Gallery`, `UVMap.001`, `env/hall.hdr`).
- `WG_GALLERY` wajib (error jelas kalau kosong); `WG_VARIANT` = `full` (default) atau `empty`.
- `python` di shell ini tidak berfungsi; Python hanya lewat Blender. Lokal dijalankan dengan `npx serve . -l 3000` dari root repo.
- Commit diakhiri baris `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Halaman dibuka dari root yang salah / `gallery.json` tidak ketemu → loader menampilkan "Failed to load: …", bukan layar hitam diam. Test di Task 3 Step 6.
2. Gallery baru dengan `gallery.json` minim (hanya `solid` + `camera`) → halaman tetap jalan tanpa error console; dust/beams/probe/partisi mati. Test di Task 3 Step 6.
3. `WG_GALLERY` kosong atau salah ketik, atau `WG_VARIANT` tidak ada di `blend` → script berhenti sebelum menulis apa pun ke folder yang salah. Test di Task 2 Step 1.
4. Folder gallery yang belum punya `full/index.html` (sedang dikerjakan) → workflow Pages melewatinya, tidak gagal. Test di Task 4 Step 2.
5. Pipeline dijalankan dari PowerShell (shell utama user) → docs memberi bentuk `$env:WG_GALLERY="hokkaido"` di samping bentuk bash. Dicek di Task 5 Step 3.

---

### Task 1: Pindahkan file ke layout baru, runtime tetap jalan

**Files:**
- Move (git mv): `web/src/main.js` → `shared/main.js`; `web/assets/audio/music.mp3` → `shared/audio/music.mp3`; `web/tools/{*.py,optimize.mjs,package.json,package-lock.json}` → `tools/`; `web/index.html` + `web/assets/*` → `galleries/hokkaido/full/`; `web-empty/*` → `galleries/hokkaido/empty/`; `WOOD-GALLERY_v10_video.blend`, `WOOD-GALLERY_web.blend`, `WOOD-GALLERY_empty.blend`, `WOOD-GALLERY.glb` → `galleries/hokkaido/blend/`; `assets/art/` → `galleries/hokkaido/art/`; `GALLERY_SCENE.md` → `galleries/hokkaido/SCENE.md`
- Move (mv, untracked): `web/tools/node_modules` → `tools/node_modules`; `build/` → `galleries/hokkaido/build/full/`; `build-empty/` → `galleries/hokkaido/build/empty/`; `renders/` → `galleries/hokkaido/renders/`; `WOOD-GALLERY_v0[1-9].blend` + `*.blend1` → `archive/`
- Modify: `.gitignore`, `galleries/hokkaido/full/index.html`, `galleries/hokkaido/empty/index.html`

**Interfaces:**
- Produces: layout di spec §3. Halaman memuat `../../../shared/main.js` dan `../../../shared/audio/music.mp3`. Tools sementara rusak (path `ROOT` lama) sampai Task 2.

- [ ] **Step 1: Ambil baseline sebelum memindah apa pun**

`npx serve . -l 3000` dari root. Di Chrome buka `http://localhost:3000/web/` dan `/web-empty/`, tunggu "Ready". Simpan screenshot posisi awal (tanpa klik) ke scratchpad sebagai `baseline_full.png` / `baseline_empty.png`. Di console `/web/` catat:
```js
JSON.stringify({cam: __g.camera.position.asArray(), art: [...__g.focus.art.keys()].map(n => [n, __g.focus.flyTo(n)?.via])})
```
(`via` > 2 = glide lewat pintu partisi.) Simpan output ke scratchpad `baseline.json`. Reload halaman setelahnya.

- [ ] **Step 2: Pindahkan semua file sesuai daftar Files**

`mkdir -p` folder tujuan dulu. `git mv` untuk yang di-track, `mv` untuk sisanya. Setelah itu `web/`, `web-empty/`, `build/`, `build-empty/`, `renders/`, `assets/` tidak ada lagi di root.

- [ ] **Step 3: Update `.gitignore` ke**

```
node_modules/
.claude/
*.blend1
archive/
galleries/*/build/
galleries/*/renders/
```

- [ ] **Step 4: Update path di kedua `index.html`**

`full/index.html`: `src="src/main.js?v=…"` → `src="../../../shared/main.js?v=2"`, `src="assets/audio/music.mp3"` → `src="../../../shared/audio/music.mp3"`. `empty/index.html`: `../web/src/main.js?v=1` → `../../../shared/main.js?v=2`, `../web/assets/audio/music.mp3` → `../../../shared/audio/music.mp3`; hapus komentar yang menyebut `web/`.

- [ ] **Step 5: Cek blend yang dipindah tidak kehilangan file**

Untuk tiap `.blend` di `galleries/hokkaido/blend/`:
```
blender -b <file> --python-expr "import bpy,os; m=[i.filepath for i in bpy.data.images if i.source=='FILE' and not i.packed_file and not os.path.exists(bpy.path.abspath(i.filepath))]; print('MISSING', m)"
```
Expected: `MISSING []` untuk ketiganya.

- [ ] **Step 6: Verifikasi runtime**

`npx serve . -l 3000`, buka `/galleries/hokkaido/full/` dan `/galleries/hokkaido/empty/`. Expected: tidak ada error console, tidak ada 404 di network, screenshot sama dengan baseline (beda dust boleh), snippet Step 1 menghasilkan JSON yang sama dengan `baseline.json`, musik berbunyi setelah klik hint.

- [ ] **Step 7: Cek aset tidak berubah dan commit**

`git diff 2a98355 --stat -M -- galleries/` harus hanya menunjukkan rename (100%) plus dua `index.html`.
```bash
git add -A
git commit -m "Move Hokkaido gallery into galleries/hokkaido, shared runtime and tools"
```

---

### Task 2: `gallery.json` + path helper, tools membaca config

**Files:**
- Create: `galleries/hokkaido/gallery.json`, `tools/wg.py`, `tools/wg.mjs`, `tools/test_wg.py`
- Modify: `tools/bake_lightmaps.py`, `tools/render_env.py`, `tools/export_glb.py`, `tools/make_empty.py`, `tools/bake_art_normals.py`, `tools/sync_objects.py`, `tools/optimize.mjs` (path + komentar header)

**Interfaces:**
- Produces `gallery.json` (schema spec §4): `title`, `blend.{source,full,empty}`, `bake.{res,albedo}`, `runtime.{glbBytes,solid,floor,camera.{pos,target},env.{probe,box,rotationY},dust.{x,y,z,count},spots,partition.{doors,zone,gates,wallY,endY}}`.
- Produces `tools/wg.py`: `gallery(variant: str | None = None) -> types.SimpleNamespace(name, variant, dir, cfg, build, assets, blend, source)` — semua path absolut; `variant` default `os.environ.get("WG_VARIANT") or "full"`; `build` = `galleries/<g>/build/<variant>`, `assets` = `galleries/<g>/<variant>/assets`, `blend` = `dir` + `cfg["blend"][variant]`, `source` = `dir` + `cfg["blend"]["source"]`. `raise SystemExit("<pesan>")` kalau `WG_GALLERY` kosong, folder/`gallery.json` tidak ada, atau variant tidak ada di `cfg["blend"]`. Tidak membuat folder.
- Produces `tools/wg.mjs`: `export function gallery(variant?): {name, variant, dir, cfg, build, assets}`, aturan yang sama, `throw new Error(...)`.
- Script Blender mengimpor dengan `sys.path.insert(0, os.path.dirname(os.path.abspath(__file__))); from wg import gallery`.

- [ ] **Step 1: Tulis test helper yang gagal**

`tools/test_wg.py` (dijalankan oleh Python Blender), set `os.environ` di dalam test:
```python
os.environ["WG_GALLERY"] = "hokkaido"; os.environ.pop("WG_VARIANT", None)
g = gallery()
assert g.variant == "full"
assert g.build.endswith(os.path.join("galleries", "hokkaido", "build", "full"))
assert g.assets.endswith(os.path.join("galleries", "hokkaido", "full", "assets"))
assert g.blend.endswith("WOOD-GALLERY_web.blend") and os.path.exists(g.blend)
assert g.source.endswith("WOOD-GALLERY_v10_video.blend") and os.path.exists(g.source)
assert gallery("empty").blend.endswith("WOOD-GALLERY_empty.blend")
assert g.cfg["runtime"]["env"]["probe"] == [0, -14.66, 3.86]
for env, var in [({"WG_GALLERY": ""}, None), ({"WG_GALLERY": "hokaido"}, None), ({"WG_GALLERY": "hokkaido"}, "nope")]:
    os.environ.update(env)
    try: gallery(var); raise AssertionError(f"no error for {env} {var}")
    except SystemExit: pass
print("WG OK")
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `blender -b --factory-startup --python-exit-code 1 -P tools/test_wg.py`
Expected: exit code 1, `ModuleNotFoundError: No module named 'wg'`.

- [ ] **Step 3: Tulis `galleries/hokkaido/gallery.json`**

Nilai disalin apa adanya dari kode commit `2a98355`: `title` "Wood Gallery"; `blend` = `blend/WOOD-GALLERY_v10_video.blend` / `blend/WOOD-GALLERY_web.blend` / `blend/WOOD-GALLERY_empty.blend`; `bake.res` = `DEFAULT_RES` dan `bake.albedo` = `ALBEDO_RES` dari `bake_lightmaps.py` (comprehension dijabarkan: `art_02_frame`…`art_09_frame` = 256, `table_leg_1`…`4` = 64); `runtime.glbBytes` 8500000; `runtime.solid` = `SOLID`; `runtime.floor` "gallery_floor"; `runtime.camera` = `{pos:[0,-7.4,1.7], target:[0,-22.66,1.6]}`; `runtime.env` = `ENV`; `runtime.dust` = `DUST`; `runtime.spots` = 28 baris `SPOTS`; `runtime.partition` = `{doors:[-2,2], zone:[-6.0,-6.8], gates:[-5.0,-6.4,-7.9], wallY:-6.4, endY:-20}`.

- [ ] **Step 4: Implement `tools/wg.py` dan `tools/wg.mjs`** sesuai Interfaces (repo root = parent folder `tools/`).

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `blender -b --factory-startup --python-exit-code 1 -P tools/test_wg.py`
Expected: `WG OK`, exit 0.

- [ ] **Step 6: Cocokkan `gallery.json` dengan konstanta lama**

Ekstrak `SOLID`, `ENV`, `DUST`, `SPOTS`, `DOORS` dari `git show 2a98355:web/src/main.js` lewat Node (eval potongan `const` itu) dan `DEFAULT_RES`/`ALBEDO_RES` lewat Blender Python dari `git show 2a98355:web/tools/bake_lightmaps.py`; bandingkan deep-equal dengan `gallery.json`. Expected: semua sama. Script cek ini tidak di-commit (scratchpad).

- [ ] **Step 7: Ganti path di tools**

Per script, pakai `g = gallery()`:
- `bake_lightmaps.py`: `BUILD=g.build`, `OUT=g.build/lightmaps`, `WEB_BLEND=g.blend`, `DEFAULT_RES=g.cfg["bake"]["res"]`, `ALBEDO_RES=g.cfg["bake"]["albedo"]`.
- `render_env.py`: `OUT=g.build/env`, `PROBE=tuple(g.cfg["runtime"]["env"]["probe"])`.
- `export_glb.py`: output `g.build/gallery.raw.glb` (bukan `//…`).
- `make_empty.py`: `gallery("empty")`, simpan ke `<build>/empty_src.blend`, `os.makedirs` dulu.
- `bake_art_normals.py`: `OUT=g.build/normals`.
- `sync_objects.py`: `SRC=g.source`.
- `optimize.mjs`: `BUILD`/`OUT` dari `gallery()` di `wg.mjs`.
Semua `os.makedirs` tetap di script (helper tidak membuat folder). Header komentar diganti ke bentuk `WG_GALLERY=hokkaido [WG_VARIANT=empty] blender -b galleries/hokkaido/blend/<file> -P tools/<script>.py`.

- [ ] **Step 8: Verifikasi optimize identik**

Run (bash, dari root): `cd tools && WG_GALLERY=hokkaido node optimize.mjs && WG_GALLERY=hokkaido WG_VARIANT=empty node optimize.mjs && cd .. && git status --short galleries/`
Expected: tidak ada file berubah. Kalau ada yang berbeda, berhenti dan laporkan (jangan commit aset baru).

- [ ] **Step 9: Verifikasi satu script Blender**

Backup `galleries/hokkaido/build/full/gallery.raw.glb` ke scratchpad, lalu `WG_GALLERY=hokkaido blender -b --python-exit-code 1 galleries/hokkaido/blend/WOOD-GALLERY_web.blend -P tools/export_glb.py`.
Expected: `EXPORTED …galleries\hokkaido\build\full\gallery.raw.glb`, ukuran sama dengan backup ±1%. Tanpa `WG_GALLERY`: exit 1 dengan pesan dari `wg.py`.

- [ ] **Step 10: Commit**

```bash
git add galleries/hokkaido/gallery.json tools/
git commit -m "Per-gallery gallery.json; tools derive paths from WG_GALLERY/WG_VARIANT"
```

---

### Task 3: Runtime membaca `gallery.json`

**Files:**
- Modify: `shared/main.js`

**Interfaces:**
- Consumes: `gallery.json` dari Task 2 (`runtime.*`).
- Produces: `let R` di level modul, diisi di awal `main()` dengan `(await (await fetch("../gallery.json")).json()).runtime`; fetch yang gagal (`!r.ok`) melempar error supaya `.catch` yang ada menampilkan "Failed to load: …". `window.__g` tambah `R`.

- [ ] **Step 1: Ganti konstanta ruangan dengan `R`**

Hapus `SOLID`, `ENV`, `DUST`, `GLB_BYTES`, `DOORS`, `SPOTS`, dan angka di `setupCamera`, `setupPaintingFocus` (`zEnt/zDoor/zHall` = `partition.gates`, `zone` = `partition.zone`), `setupLightPlay` (`zPart`=`partition.wallY`, `zEnd`=`partition.endY`), `setupFloorReflection` (`"gallery_floor"` → `R.floor`). `"gallery_window_glass"` di `setupLightPlay` tetap (aturan penamaan). JSON tidak punya komentar, jadi komentar yang menjelaskan *arti* field (mis. ENV "Babylon axes", SPOTS format `[x,y,z,dirX,dirY,dirZ,deg]`) dipertahankan di dekat tempat `R.*` dipakai.

- [ ] **Step 2: Field opsional mati dengan aman**

- `!R.env` → `setupEnvironment` tidak memuat HDR, return `null`.
- `!R.dust` → `setupDust` return tanpa partikel.
- `!R.spots` → diperlakukan `[]`; `setBeams` tetap bisa dipanggil.
- `!R.partition` → `route()` return `[from, end]`; arah hadap lukisan di `setupLightPlay` = `Math.sign(cam0[n] - c[n])` dengan `cam0 = bl(...R.camera.pos)` (menghadap posisi awal kamera).
- `!R.floor` → perilaku yang sudah ada (`return { set() {} }`).
- `R.glbBytes` kosong → `8.5e6`.

- [ ] **Step 3: Bump cache-bust** `?v=2` → `?v=3` di kedua `index.html`.

- [ ] **Step 4: Verifikasi Hokkaido identik**

Buka `/galleries/hokkaido/full/` dan `/empty/`. Expected: tidak ada error console; screenshot sama dengan baseline Task 1; snippet Task 1 Step 1 = `baseline.json`; tombol B/G/R/M dan tombol Enter pada lukisan berfungsi.

- [ ] **Step 5: Verifikasi config minim**

Sementara ganti `galleries/hokkaido/gallery.json` dengan `{"runtime": {"solid": <solid yang sama>, "camera": <camera yang sama>}}`, reload `/full/`. Expected: "Ready", bisa jalan WASD, tidak ada error console, B/G/R tidak melempar error. Kembalikan dengan `git checkout galleries/hokkaido/gallery.json`.

- [ ] **Step 6: Verifikasi config hilang**

Sementara rename `gallery.json` → `gallery.json.off`, reload. Expected: overlay menampilkan "Failed to load: …" (bukan layar hitam diam). Kembalikan namanya.

- [ ] **Step 7: Commit**

```bash
git add shared/main.js galleries/hokkaido/full/index.html galleries/hokkaido/empty/index.html
git commit -m "Runtime reads room constants from gallery.json"
```

---

### Task 4: Workflow Pages untuk semua gallery

**Files:**
- Modify: `.github/workflows/pages.yml`

**Interfaces:**
- Produces: `_site/shared/`, `_site/galleries/<g>/gallery.json`, `_site/galleries/<g>/<variant>/` untuk tiap subfolder variant yang punya `index.html`; `_site/index.html` = meta refresh ke `galleries/hokkaido/full/`.

- [ ] **Step 1: Ganti dua langkah `run` copy dengan satu langkah** yang: `cp -r shared _site/`; loop `galleries/*/`, lewati gallery tanpa `gallery.json`; salin `gallery.json`; salin tiap subfolder yang berisi `index.html` (jadi `blend/`, `art/`, `build/`, `renders/` tidak ikut); tulis redirect:
```html
<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0; url=galleries/hokkaido/full/"><title>Woo Gallery</title>
```

- [ ] **Step 2: Dry run lokal**

Jalankan isi langkah `run` itu di bash dengan `_site` diarahkan ke scratchpad, ditambah folder palsu `galleries/_wip/blend/` (tanpa `gallery.json`, dihapus setelahnya).
Expected: `find <scratch>/_site -name "*.blend" -o -name "SCENE.md"` kosong; ada `galleries/hokkaido/{gallery.json,full/index.html,empty/index.html}` dan `shared/main.js`; `_wip` tidak ada; tidak ada error. `npx serve <scratch>/_site` → `/` redirect ke Hokkaido dan halaman jalan.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/pages.yml
git commit -m "Pages: deploy every gallery under galleries/, root redirects to Hokkaido"
```

---

### Task 5: Docs

**Files:**
- Modify: `WEB_GALLERY.md`, `galleries/hokkaido/SCENE.md`, `.claude/skills/babylonjs/references/gallery-pipeline.md` (di-ignore git: update lokal saja, tidak di-commit)

- [ ] **Step 1: `WEB_GALLERY.md`** — tabel path §1, perintah pipeline §3 (termasuk varian empty dengan `make_empty.py`), cara jalan lokal, URL Pages (`/galleries/hokkaido/full/`, `/galleries/hokkaido/empty/`), `renders/` → `galleries/hokkaido/renders/`. Tambah bagian "Membuat gallery baru": buat `galleries/<nama>/{blend,full}`, `gallery.json` (field wajib `solid`, `camera`; sisanya opsional dan apa yang mati tanpanya), aturan penamaan dari spec §4.2b, urutan pipeline, salin `full/index.html` dari Hokkaido lalu ganti judul/teks.

- [ ] **Step 2: `SCENE.md` dan referensi skill** — ganti path lama (`WOOD-GALLERY_*.blend` di root, `assets\art\`, `renders/`, `web/tools/`) ke lokasi baru.

- [ ] **Step 3: Cek tidak ada path lama tersisa**

Run: `git grep -nE "web-empty|build-empty|web/tools|web/src|web/assets|\\bassets\\\\art" -- . ':!docs/superpowers'`
Expected: kosong. Cek juga tiap contoh perintah pipeline di `WEB_GALLERY.md` punya bentuk PowerShell (`$env:WG_GALLERY="hokkaido"; blender …`) di samping bentuk bash.

- [ ] **Step 4: Commit**

```bash
git add WEB_GALLERY.md galleries/hokkaido/SCENE.md
git commit -m "Docs: multi-gallery layout, new-gallery guide"
```
