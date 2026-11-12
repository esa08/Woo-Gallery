# Brooklyn web + gallery picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish Brooklyn as a walkable Babylon.js gallery at `/galleries/brooklyn/full/`, and replace the root redirect with a generated picker page (card grid, option A).

**Architecture:** The shared Blender→web pipeline (`tools/`) is used unchanged, driven by a new `galleries/brooklyn/gallery.json`. Brooklyn gets its own runtime `galleries/brooklyn/main.js`, a copy of `shared/main.js` with three changes:
- glide routing around free-standing partitions, through a pure helper `galleries/brooklyn/route.js` that is unit-tested in Node;
- painting facing taken from the canvas normal;
- look tuned to the Brooklyn render.

The Pages assembly moves out of the workflow into `tools/build_site.mjs`, which also writes the picker. It runs both locally and in CI, and is covered by a Node test.

**Tech Stack:** Blender 5.2 (Cycles/OptiX, headless), Node 24 (`node:test`, `node:assert`, `sharp` already in `tools/node_modules`), Babylon.js 9.0.0 via CDN (pinned), GitHub Pages workflow.

**Spec:** `docs/superpowers/specs/2026-11-12-brooklyn-web-design.md`. Context: `WEB_GALLERY.md` (§2 runtime, §3/§3b pipeline, §4 gotchas), `galleries/brooklyn/SCENE.md`.

## Global Constraints

- **Hokkaido must not change.** No edits to `shared/main.js`, `galleries/hokkaido/**` (except adding `thumb.webp`), or Hokkaido URLs.
- Brooklyn web ships the `full` variant only. No `galleries/brooklyn/empty/`.
- The walkthrough experience is identical to Hokkaido: controls, music (`../../../shared/audio/music.mp3`), click-to-glide, effect buttons, loading bar, dust, beams. Only routing, facing and look tuning differ.
- Bake source: `galleries/brooklyn/blend/BROOKLYN_v06.blend` (approved look, variant C). Never save over it.
- Run Blender jobs **headless and one at a time**, with the interactive Blender closed. Two Blender instances ran out of memory on 16 GB RAM.
- No new npm dependencies. The picker is static HTML+CSS, follows the light/dark system theme, is one column on phones, and its cards are keyboard focusable.
- Do not merge to `main` and do not `git push` without the user's explicit OK (the public URL changes and `/web-empty/` disappears).
- Blender exe: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. Run from the repo root; `python` is not available, Node is.

## Review Focus

1. **The glide cuts through a partition** when the target painting is on the other side or on the far face. `test_route.mjs` asserts that no segment of any route intersects a partition rectangle, for every pair of (start sample, painting stand point).
2. **A gallery folder without `full/index.html` or without `thumb.webp`** (for example a new gallery mid-build) breaks the picker. `test_build_site.mjs` asserts that it is skipped or rendered without an image, and that the build doesn't crash.
3. **Hokkaido regresses** through the workflow rewrite. `test_build_site.mjs` asserts that `_site/galleries/hokkaido/{full,empty}/index.html`, `_site/shared/main.js` and `_site/galleries/hokkaido/gallery.json` exist, and that no `blend/`, `build/`, `renders/` or `art/` is copied.
4. **The canvas normal points into the wall** (a frame flipped in Blender), so glare and the glide stand point end up behind the wall. The facing helper in `route.js` takes the normal and the start position, and flips the normal if it points away from the hall interior. `test_route.mjs` covers this.
5. **A Brooklyn GLB that is too big** makes loading slow. Task 2 asserts `full/assets` ≤ 14 MB on disk, against Hokkaido's ~11 MB.

---

### Task 0: Branch and spec

- [ ] **Step 1:** `git switch -c va-21-brooklyn-web` from `va-21-brooklyn`.
- [ ] **Step 2:** Commit the spec and this plan: `VA-21 Brooklyn web: design and plan`.

### Task 1: `gallery.json` + lightmap bake

**Files:** Create `galleries/brooklyn/gallery.json`. Generated: `galleries/brooklyn/blend/BROOKLYN_web.blend`, `galleries/brooklyn/build/full/lightmaps/*`.

**Interfaces:**
- Produces: `gallery.json` with `title: "Brooklyn"`, `blend: {source: "blend/BROOKLYN_v06.blend", full: "blend/BROOKLYN_web.blend"}`, `bake: {res, albedo}`, and `runtime` with the fields below. Tasks 2-5 read it.

- [ ] **Step 1: Write `gallery.json`.** It must be valid JSON. The `runtime` coordinates are in Blender space.
  - `bake.res`: gallery_walls 2048, gallery_floor 2048, gallery_ceiling 2048, gallery_partitions 1024, gallery_trims 512, gallery_doors 512, gallery_skylight_frame 512, art frames 256 (`art_01_hero_frame` 512), and 64-128 for every `bench_*`, `plinth_*`, `sculpture_*`, `plant_*`, `outlet_plate`, `smoke_detector`, `corridor_bench_*`.
  - `bake.albedo`: `{ "gallery_walls": 1024, "gallery_partitions": 512 }`.
  - `runtime.solid`: gallery_floor, gallery_walls, gallery_partitions, gallery_doors, gallery_window_glass, corridor_bench_seat, corridor_bench_frame, bench_seat, bench_leg_1..4, bench_seat_2, plinth_1, plinth_2, sculpture_marble, sculpture_bronze_knot, plant_pot.
  - `runtime.camera`: `{pos: [0, -1.0, 1.6], target: [0, -6.6, 1.6]}`.
  - `runtime.floor`: `"gallery_floor"`.
  - `runtime.env`: `{probe: [0, -11.8, 2.4], box: [10, 4.8, 20], rotationY: 0}`, where box is the Babylon (x, height, depth) size, as in Hokkaido.
  - `runtime.dust`: `{x: [-4.8, 4.8], y: [-21.5, -2.0], z: [0.3, 4.4], count: 400}`.
  - `runtime.spots`: the 17 `light_spot_*`. Dump them with `blender -b galleries/brooklyn/blend/BROOKLYN_v06.blend --python-expr` printing `[x, y, z, dx, dy, dz, 38]` per spot (d = world -Z axis of the light, 3 decimals), and paste the result.
  - `runtime.glbBytes`: filled in Task 2.
- [ ] **Step 2: Check the wiring.** Run `blender -b --factory-startup --python-exit-code 1 -P tools/test_wg.py` → `WG OK`. Then run `WG_GALLERY=brooklyn blender -b --factory-startup --python-expr "import sys;sys.path.insert(0,'tools');from wg import gallery;g=gallery();print('SRC',g.source,'FULL',g.blend)"` → it prints the v06 path and the `BROOKLYN_web.blend` path.
- [ ] **Step 3: Fresh bake.** Run `WG_GALLERY=brooklyn blender -b galleries/brooklyn/blend/BROOKLYN_v06.blend -P tools/bake_lightmaps.py -- --samples 768 --albedo` in the background, with its log in the workspace. Expected: exit 0, `BROOKLYN_web.blend` written, and `build/full/lightmaps/manifest.json` lists every `bake.res` key. Verify with `node -e` reading both files, asserting that the key sets are equal and printing `BAKE OK`.
- [ ] **Step 4:** Look at a contact sheet of the 4 biggest lightmaps (walls, floor, ceiling, partitions). There must be no black islands and no seams that stand out. Ledger any re-bake.
- [ ] **Step 5:** Commit `gallery.json` and `BROOKLYN_web.blend`: `VA-21 Brooklyn web: gallery.json and lightmap bake`.

### Task 2: Export, panorama, normals, optimize

**Files:** Generated: `galleries/brooklyn/full/assets/{gallery.glb, lightmaps/*.webp, manifest.json, env/hall.hdr, normals/*.webp}`. Modify `gallery.json` (`runtime.glbBytes`).

- [ ] **Step 1:** Run these headless, in order, one at a time:
  - `WG_GALLERY=brooklyn blender -b galleries/brooklyn/blend/BROOKLYN_web.blend -P tools/export_glb.py`
  - `WG_GALLERY=brooklyn blender -b galleries/brooklyn/blend/BROOKLYN_v06.blend -P tools/render_env.py`
  - `WG_GALLERY=brooklyn blender -b galleries/brooklyn/blend/BROOKLYN_v06.blend -P tools/bake_art_normals.py`

  Each must exit 0. After them, `build/full/` must contain `gallery.raw.glb`, `env/hall.hdr` and 9 `normals/*.png`.
- [ ] **Step 2:** `cd tools && WG_GALLERY=brooklyn node optimize.mjs` → exit 0.
- [ ] **Step 3: Size gate (Review Focus 5).** `du -sb galleries/brooklyn/full/assets` must be ≤ 14 000 000 bytes. If it is over, lower the `bake.res` of the largest lightmaps and repeat Task 1 Step 3 with `--in-place --only <names>`, then Steps 1-2 here. Ledger it.
- [ ] **Step 4:** Set `runtime.glbBytes` to the byte size of `full/assets/gallery.glb`. Commit `full/assets` + `gallery.json`: `VA-21 Brooklyn web: optimized assets`.

### Task 3: Glide routing helper (pure, tested)

**Files:** Create `galleries/brooklyn/route.js` and `galleries/brooklyn/test_route.mjs`.

**Interfaces:**
- Produces `route.js`, loaded as a classic `<script>` before `main.js` (it defines globals) and also loadable from Node (`if (typeof module === "object") module.exports = {...}`). All coordinates are Blender XY in metres.
  - `BROOKLYN_PARTITIONS`: `[{x0,x1,y0,y1}]`. Six rectangles: the three centre panels x -2..2, plus stubs (4..5 at y -6.62..-6.92 and -16.62..-16.92; -5..-4 at -11.62..-11.92). The y ranges are as in SCENE.md §2. Each rectangle is inflated by `CLEAR = 0.45` m (camera ellipsoid 0.35 + margin).
  - `routeXY(from: [x,y], to: [x,y], parts = BROOKLYN_PARTITIONS) -> [[x,y], ...]`. Returns `[from, ...waypoints, to]`. No segment intersects an inflated rectangle. For each partition row the straight line crosses, insert a waypoint in the open gap of that row closest to the line: between the centre panel and the stub, x ≈ ±3.0, or on the side without a stub, x ≈ ±3.5. Place it at the row's y ± (CLEAR + 0.3) on both sides. If the straight line is already clear, return `[from, to]`.
  - `facingXY(center: [x,y], normal: [x,y], start: [x,y]) -> [nx,ny]`. Returns the unit normal, flipped if it points away from the open side. Test the point `center + 0.6·normal`: if it is inside a partition rectangle or outside the hall (x ∉ [-5,5] or y ∉ [-21.77,-1.8]), flip.

- [ ] **Step 1: Write the failing tests** in `test_route.mjs` (`node:test`, `assert`, `createRequire` to load `route.js`):
  - `straight line when clear`: `routeXY([0,-3],[0,-6.0])` deep-equals `[[0,-3],[0,-6.0]]`.
  - `never cuts a partition` (Review Focus 1). Starts: `[0,-1]`, `[3.5,-9.3]`, `[-3.5,-14.3]`, `[0,-19.3]`. Targets: the stand point 1.6 m in front of each of the 9 paintings (centres and facings from SCENE.md §4). For every route, no segment intersects any inflated rectangle (segment-vs-AABB test in the test file).
  - `waypoints stay in the hall`: every point has x ∈ [-4.6, 4.6] and y ∈ [-21.4, -1.0].
  - `facing keeps a correct normal`: `facingXY([0,-6.608],[0,1],[0,-1])` → `[0,1]`.
  - `facing flips a normal into the wall` (Review Focus 4): `facingXY([4.988,-9.27],[1,0],[0,-1])` → `[-1,0]`, and `facingXY([0,-6.932],[0,1],[0,-1])` → `[0,-1]` (the normal points into partition 1).
- [ ] **Step 2:** `node --test galleries/brooklyn/test_route.mjs` → FAIL (`route.js` missing).
- [ ] **Step 3:** Implement `route.js` to the interface above.
- [ ] **Step 4:** `node --test galleries/brooklyn/test_route.mjs` → all pass.
- [ ] **Step 5:** Commit: `VA-21 Brooklyn web: glide routing around partitions`.

### Task 4: Brooklyn runtime + page

**Files:** Create `galleries/brooklyn/main.js` (copy of `shared/main.js`) and `galleries/brooklyn/full/index.html` (copy of the Hokkaido page).

**Interfaces:**
- Consumes `routeXY` and `facingXY` from Task 3 (globals).
- `window.__g` keeps the same shape as in Hokkaido.

- [ ] **Step 1:** Copy the two files. In `index.html`: title "Brooklyn", script tags `../route.js` then `../main.js` (drop `../../../shared/main.js`), music path unchanged.
- [ ] **Step 2: Edit `main.js`.**
  - `setupPaintingFocus.route()` returns the `routeXY` path, mapped through `bl()` (Blender XY → Babylon) at the camera height. The `R.partition` code paths are removed.
  - The glide stand point and the `setupLightPlay` `face` use `facingXY` with the canvas normal. That normal is the world normal of the `primitive0` canvas mesh, or `hit.getNormal(true)` for clicks, converted to Blender XY.
  - Keep a header comment that says this file is the Brooklyn fork of `shared/main.js` and names the three differences.
- [ ] **Step 3: Browser check** (Chrome tools, `npx serve . -l 3000` from the repo root), at `http://localhost:3000/galleries/brooklyn/full/`:
  - the console has no errors (`read_console_messages`, pattern `error|Error|404`);
  - `__g.camera.position` is at the start pose;
  - walking with W from the start stops at the hero partition (collision);
  - for each of the 9 paintings: set the camera to the start, call the focus routine on it, and log the path points (`__g.focus`). The path must not cross a partition (same AABB test, run in the page);
  - beams and glare toggles work (B and G).
- [ ] **Step 4: Look tuning.** Screenshot the start view at 1920x1080 and compare it side by side with `galleries/brooklyn/renders/cam_main_hall.png`. Tune only constants local to Brooklyn's `main.js` (exposure, IBL/lightmap levels, the eye adaptation reference) until the mean luminance and the overall look match. Ledger the before/after numbers.
- [ ] **Step 5: User gate.** Show the user both images and wait for an OK on the web look before Task 5.
- [ ] **Step 6:** Commit: `VA-21 Brooklyn web: runtime fork and page`.

### Task 5: Site builder + picker + thumbnails

**Files:** Create `tools/build_site.mjs`, `tools/test_build_site.mjs`, `galleries/hokkaido/thumb.webp`, `galleries/brooklyn/thumb.webp`. Modify `.github/workflows/pages.yml`.

**Interfaces:**
- Produces `node tools/build_site.mjs <outDir>`, which writes:
  - `<outDir>/shared/**`;
  - for each `galleries/<g>/` with `gallery.json`: `gallery.json`, `main.js`, `route.js` and `thumb.webp` (each only if present), plus every subfolder that has an `index.html`;
  - `<outDir>/index.html`, the picker.
  - It exports `buildSite(root, outDir) -> {galleries: [{name, title, href, thumb|null}]}` for the test.

- [ ] **Step 1: Write the failing tests** in `test_build_site.mjs` (`node:test`). Each builds into an `fs.mkdtemp` dir from the real repo root.
  - `cards`: the result has `brooklyn` and `hokkaido` in alphabetical order, with titles "Brooklyn" / "Wood Gallery" and hrefs `galleries/<g>/full/`. `index.html` contains both titles, both hrefs, and `<a` elements (focusable).
  - `hokkaido intact` (Review Focus 3): the paths listed there exist, and no `blend`, `build`, `renders` or `art` directory exists anywhere under the output.
  - `brooklyn runtime copied`: `galleries/brooklyn/main.js` and `route.js` exist in the output.
  - `incomplete gallery` (Review Focus 2): a fixture root in a tmp dir with a gallery that has `gallery.json` but no `full/` gets no card, and one with `full/` but no `thumb.webp` gets a card with `thumb === null` and no broken `<img>`. No throw.
  - `theme and mobile`: `index.html` contains `prefers-color-scheme` and a `grid-template-columns` rule that drops to 1 column under a max-width media query.
- [ ] **Step 2:** `node --test tools/test_build_site.mjs` → FAIL (module missing).
- [ ] **Step 3: Implement `build_site.mjs`** with `node:fs` `cpSync`. The picker HTML is a template string in the file: "Woo Gallery" heading and an option-A card grid (image 16:9, title, "Masuk →").
- [ ] **Step 4:** `node --test tools/test_build_site.mjs` → all pass.
- [ ] **Step 5: Thumbnails.** Make 640x360 WebP files with `sharp`: `node -e` from `tools/` (`sharp(src).resize(640,360,{fit:'cover'}).webp({quality:82})`). Sources: `galleries/hokkaido/renders/hero_hall_v09_small.png` and `galleries/brooklyn/renders/cam_main_hall.png`. Each must be ≤ 80 KB.
- [ ] **Step 6: Workflow.** In `pages.yml`, replace the "Assemble site" shell with `actions/setup-node@v4` (node 24), then `node tools/build_site.mjs _site`. `build_site.mjs` must only import `node:` built-ins, because CI does not install `tools/node_modules`.
- [ ] **Step 7: Local check.** Run `node tools/build_site.mjs <workspace>/_site` and `npx serve <workspace>/_site -l 3001`.
  - In Chrome, `/` shows 2 cards and each one opens its gallery (console clean).
  - `/galleries/hokkaido/empty/` still loads.
  - At a 390 px window width, the cards are in one column.
- [ ] **Step 8:** Commit: `VA-21 gallery picker: site builder, thumbnails, workflow`.

### Task 6: Docs + hand-off

**Files:** Modify `WEB_GALLERY.md` (§0, §1, §3b: Brooklyn, per-gallery runtime fork, `build_site.mjs`, picker, thumbnails) and `galleries/brooklyn/SCENE.md` §11.

- [ ] **Step 1:** Update the docs.
- [ ] **Step 2:** Run every check again:
  - `node --test galleries/brooklyn/test_route.mjs tools/test_build_site.mjs`;
  - `blender -b --factory-startup --python-exit-code 1 -P tools/test_wg.py`;
  - `check_scene.py --upto cameras` on v06.

  All must pass.
- [ ] **Step 3:** Commit `VA-21 docs: Brooklyn web and gallery picker`. Then **ask the user** about merging `va-21-brooklyn-web` (and `va-21-brooklyn`) into `main` and pushing. Do neither without an explicit yes. After deploy, move VA-21 to the completed column.
