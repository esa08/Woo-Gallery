# Brooklyn gallery (Blender) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Villume's T-GALLERY GLB into a clean, lit, furnished Blender scene `galleries/brooklyn/blend/BROOKLYN_vNN.blend`, with Hokkaido-level realism, preview renders and `SCENE.md`.

**Architecture:** The scene is edited in the user's running Blender 5.2 through the Blender MCP (`execute_blender_code`). Each task saves a new version, then a headless check script (`galleries/brooklyn/check_scene.py`) asserts that stage's conventions on the saved file. Visual stages end with a small Cycles preview that the user looks at. Materials and props are appended from the Hokkaido blend instead of rebuilt.

**Tech Stack:** Blender 5.2 LTS (`C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`), Cycles + OptiX (RTX 3050 4 GB), bpy, Blender MCP.

**Spec:** `docs/superpowers/specs/2026-11-12-brooklyn-blender-design.md`. Reference scene: `galleries/hokkaido/SCENE.md`. Hokkaido source blend: `galleries/hokkaido/blend/WOOD-GALLERY_v10_video.blend` (read only, never saved).

## Global Constraints

- Blender side only: no bake, no GLB export, no `gallery.json`, no web page.
- Corridor gets no artworks. All art goes in the hall (x -5..5, y -1.8..-21.77).
- `art_01_hero` goes on the front face of the first centre partition (x -2..2, y -6.62, facing +Y toward the corridor). Partition geometry is NOT changed.
- No light without a visible fixture (Sun excepted). Never add hidden fill or wash lights.
- Paintings link `//../../hokkaido/art/crop/<file>` relatively and are not packed. Other textures are packed with the `tex_` prefix.
- Names follow WEB_GALLERY.md §3b: collections `Gallery`, `Environment`, `Gallery_Content`, `Lighting`, `Cameras`, `Atmosphere`. Architecture is `gallery_*`, art is `art_NN[_hero]_frame` with canvas material `art_*`. Skylight glass is `gallery_window_glass` with material `glass_gray_translucent`. Atmosphere objects are `atmos_*`. Sky is `env_sky_dome` with `tex_sky_dome_color`.
- Version files: `galleries/brooklyn/blend/BROOKLYN_vNN.blend`, latest only in `blend/`; older ones get moved to repo-root `archive/` (git-ignored). Never `save_as` over the file that is currently open in a background process (Windows "Unable to make version backup").
- Don't touch the user's other Blender scenes. Work in a scene of its own (the open file is unsaved scratch).
- Render settings start from Hokkaido SCENE.md §7. Look: AgX "Medium High Contrast", Glare bloom in `scene.compositing_node_group`.
- Commit `.blend` only at the end, after preview approval (keeps git history small). Scripts and docs are committed per task.

## Review Focus

1. **Hidden light sneaks in.** Every non-sun light must be within 0.3 m of a fixture mesh. `check_scene.py` stage `lighting` asserts this.
2. **Broken painting links after a move.** All `art_*` images must resolve to existing files through the relative path. Stage `content` asserts `os.path.isfile(bpy.path.abspath(img.filepath))`.
3. **Hero not visible from the main camera.** Stage `cameras` ray-casts from `CAM_main_hall` to the centre of `art_01_hero_frame`, and the first hit must be the hero frame (or its canvas).
4. **Sky dome blocks the sun.** Stage `effects` asserts that `env_sky_dome` has `visible_shadow`, `visible_diffuse`, `visible_glossy` and `visible_volume_scatter` all False.
5. **Heavy leftovers.** Every stage asserts: no mesh object over 100 000 faces, and no material or image with 0 users.

---

### Task 0: Branch, spec, source GLB

**Files:**
- Create: `galleries/brooklyn/blend/T-GALLERY.glb` (copy from the scratchpad download, or re-fetch: `gh api -H "Accept: application/vnd.github.raw" repos/GoThruMedia/villume-exhibitions/contents/T-GALLERY/t-gallery-ori@default.glb > galleries/brooklyn/blend/T-GALLERY.glb`, expect 8 311 924 bytes)
- Commit: the spec and this plan

- [ ] **Step 1:** `git switch -c va-21-brooklyn` (main is clean, 10 commits ahead of origin, do not push).
- [ ] **Step 2:** Put the GLB in place, then check its size: `stat -c %s galleries/brooklyn/blend/T-GALLERY.glb` → `8311924`.
- [ ] **Step 3:** Move VA-21 to the column whose stateType is `started` (`get_project VA`, then `update_issue 72 columnId`).
- [ ] **Step 4:** Commit:
```bash
git add docs/superpowers/specs/2026-11-12-brooklyn-blender-design.md docs/superpowers/plans/2026-11-12-brooklyn-blender.md galleries/brooklyn/blend/T-GALLERY.glb
git commit -m "VA-21 Brooklyn: design, plan and source GLB"
```

### Task 1: Check script + import + cleanup → v01

**Files:**
- Create: `galleries/brooklyn/check_scene.py`
- Create: `galleries/brooklyn/blend/BROOKLYN_v01.blend`

**Interfaces:**
- Produces: `check_scene.py`. Run it as `"<blender>" -b <blend> --python-exit-code 1 -P galleries/brooklyn/check_scene.py -- --upto <stage>`, where stage is one of `cleanup, materials, lighting, content, effects, cameras` (in that order, and each stage includes the earlier ones). On success it prints `CHECK OK (<stage>)`. On failure it prints every failed assertion and exits 1. Each later task adds its stage's function: `def check_<stage>(errors: list[str]) -> None`.

- [ ] **Step 1: Write `check_scene.py` with stage `cleanup`.** The common checks (Review Focus 5) run in every stage. Stage `cleanup` asserts:
  - the six collections exist (`Gallery`, `Environment`, `Gallery_Content`, `Lighting`, `Cameras`, `Atmosphere`);
  - there is no object named `collision_invisible` or `ENVIRONMENT`, and no object or material name contains `@`;
  - no mesh has a UV layer `UVMap.001`;
  - these objects exist in `Gallery`: `gallery_walls`, `gallery_floor`, `gallery_ceiling`, `gallery_trims`, `gallery_partitions`, `gallery_window_glass`, `gallery_skylight_frame`, `gallery_spot_fixtures`, `gallery_doors`, `gallery_sprinklers`, `gallery_corridor_lamps`;
  - the bench objects (`corridor_bench_seat`, `corridor_bench_frame`) together have ≤ 30 000 faces.
- [ ] **Step 2: Run it on a raw import to prove it fails.** Save a raw import (new scene, `import_scene.gltf`) to scratchpad `raw.blend`, then run `--upto cleanup`. Expected: exit 1, with the collection, name and UV errors listed.
- [ ] **Step 3: Clean up in Blender (MCP).** Create the scene `Brooklyn` and import the GLB there. Delete `collision_invisible`, `ENVIRONMENT` and every `UVMap.001`. Rename and merge the objects:

| GLB | New name |
|---|---|
| `color_drag_area@Walls` | `gallery_walls` |
| `donut_area@Floor` | `gallery_floor` |
| `color@Ceiling` + `Ceiling_Outside_2` | `gallery_ceiling` (join) |
| `color@Trims` | `gallery_trims` |
| `color_drag_area@Panels` | `gallery_partitions` |
| `Window` + `Beam_003` | split by material: glass faces → `gallery_window_glass`, the rest → `gallery_skylight_frame` (if `Window` has no separate glass faces, model one glass plane per opening at the glass height) |
| `Lamp_support_001` + `Lamp_016.001` + `Lamp_016.002` | `gallery_spot_fixtures` (join) |
| `Door_003` + `Door_lock_003` | `gallery_doors` (join, clear parent keep transform) |
| `Sprinkler_system_001` | `gallery_sprinklers` |
| `Circle-LAMP` + `Long_lamp_Corridor-BAKE` | `gallery_corridor_lamps` (join) |
| `Puff Barcelona.006` / `Puff Barcelona-metal` | `corridor_bench_seat` / `corridor_bench_frame` |

  Then: Decimate (collapse) `corridor_bench_seat` to ≤ 25k faces and compare a close render before/after (no visible silhouette change at 1 m). Weld (`remove_doubles` 0.0001) `gallery_trims`, `gallery_partitions`, `gallery_doors`. Move architecture into `Gallery` and the benches into `Gallery_Content`, and create the empty collections. Purge orphans. Save as `BROOKLYN_v01.blend`.
- [ ] **Step 4:** Run `--upto cleanup` on v01. Expected: `CHECK OK (cleanup)`.
- [ ] **Step 5:** Commit `check_scene.py` (`VA-21 Brooklyn: scene check script, cleanup stage`).

### Task 2: Materials → v02

**Files:** Modify `check_scene.py` (stage `materials`). Create `BROOKLYN_v02.blend`.

- [ ] **Step 1: Add `check_materials`.** It asserts:
  - every mesh face of a `Gallery` object uses a material from this set: `wall_paint`, `wood_floor`, `trim_white`, `glass_gray_translucent`, `metal_gray`, `metal_door_handle`, `metal_black_satin`, `lamp_emissive`, `ceiling_white`, `sprinkler_metal`;
  - the corridor bench uses `leather_black` + `metal_black_satin`;
  - the GLB leftovers `Material #25`, `Material.001`, `White`, `Walls`, `Floor`, `Gray.Frame.001` are gone;
  - every packed image name starts with `tex_`.
- [ ] **Step 2:** Run `--upto materials` on v01. Expected FAIL, listing the old material names.
- [ ] **Step 3: Append and assign materials (MCP).**
  - Append from the Hokkaido blend: `wood_floor`, `glass_gray_translucent`, `metal_gray`, `metal_door_handle`, `metal_black_satin`, `lamp_emissive`, `wall_paint`.
  - Re-tune for this room: `wall_paint` goes to warm white (~0.85, 0.84, 0.81), keeping its plaster bump and floor dirt. `wood_floor` gets its base color and normal from the GLB's `Natural Ash Wood Parquet_*` (rename them `tex_floor_ash_color` / `tex_floor_ash_normal`), keeping Hokkaido's roughness variation and clearcoat 0.12.
  - New: `ceiling_white` and `trim_white` (matte white, from `plinth_white_matte`), `sprinkler_metal` (copy of `metal_gray`, lighter), `leather_black` (from the GLB leather textures, renamed `tex_`).
  - Pack the non-art images and purge.
- [ ] **Step 4:** Run `--upto materials`. Expected: `CHECK OK (materials)`.
- [ ] **Step 5:** Render a preview: hall from (0, -2, 1.6) looking -Y, 960x540, 64 spp, with a temporary studio world. Save it to `galleries/brooklyn/renders/prev_v02_materials.png` and show the user. Save v02, move v01 to `archive/`.
- [ ] **Step 6:** Commit `check_scene.py`.

### Task 3: Lighting + render settings → v03

**Files:** Modify `check_scene.py` (stage `lighting`). Create `BROOKLYN_v03.blend`.

- [ ] **Step 1: Add `check_lighting`.** It asserts:
  - `Lighting` holds exactly one SUN named `light_sun`, plus ≥ 1 SPOT per spot head found in `gallery_spot_fixtures`. Count the heads as islands after `remove_doubles` with a 0.001 tolerance, but only islands whose material is `lamp_emissive`. Store the count as a custom prop `scene["spot_heads"]`, and assert that the spot count is ≥ it.
  - Every non-SUN light lies within 0.3 m of the nearest surface of `gallery_spot_fixtures` or `gallery_corridor_lamps` (BVHTree `find_nearest`).
  - The world uses a Sky Texture. The engine is CYCLES and the view transform is AgX.
  - `scene.compositing_node_group` contains a Glare node.
- [ ] **Step 2:** Run `--upto lighting` on v02. Expected FAIL.
- [ ] **Step 3: Light the scene (MCP)**, starting from Hokkaido §6/§7:
  - Sky Texture (Multiple Scattering, sun disc off), background 0.35. `light_sun` synced to the sky sun direction (gotcha §10.7), with the elevation/rotation picked so the sun pattern from the skylight frame lands on the hall wall or floor in `CAM_main_hall`'s future view (from about (0,-2,1.6) toward -Y).
  - One spot per head: `light_spot_NN`, 38°, blend 0.6, soft 3 cm, (1, 0.73, 0.45), 300 W, at the head's lens. Each one is aimed at the nearest wall/partition face at z 1.5 (the art layout in Task 4 re-aims as needed).
  - Corridor: `Long_lamp` bars become one Area light each (`light_corridor_bar_NN`, down, 0.045 x bar length). `Circle-LAMP` downlights become Spot 90° (`light_corridor_down_NN`).
  - Cycles OptiX, Light Tree on, bounces as Hokkaido, AgX Medium High Contrast, exposure 0.3, Glare bloom (threshold 1.5, strength 0.35).
- [ ] **Step 4:** Run `--upto lighting`. Expected: `CHECK OK (lighting)`.
- [ ] **Step 5: User gate.** Render 960x540 at 128 spp from (0,-2,1.6)→-Y and from the corridor, to `renders/prev_v03_light_*.png`. Show the user and **wait for OK on brightness and mood** before Task 4. If it's too dark, raise the existing lights. Never add hidden lights. Save v03, archive v02.
- [ ] **Step 6:** Commit `check_scene.py`.

### Task 4: Hall content → v04

**Files:** Modify `check_scene.py` (stage `content`). Create `BROOKLYN_v04.blend`.

- [ ] **Step 1: Add `check_content`.** It asserts:
  - 9 frames match `^art_\d\d(_hero)?_frame$`, with the names `art_01_hero` and `art_02..art_09`.
  - Each frame has a material whose name starts with `art_`. Its image path starts with `//../../hokkaido/art/crop/` and the file exists (Review Focus 2).
  - `art_01_hero_frame`: the world location has |x| < 0.1 and y within [-6.62, -6.40], and its local "front" axis faces +Y. Use the same axis convention as the appended Hokkaido frame and assert the dot product > 0.95.
  - Every art frame is inside the hall: x in [-5, 5], y in [-21.77, -1.8].
  - Each frame has `<frame>_label` and `<frame>_label_txt`.
  - `Gallery_Content` contains `plinth_1`, `plinth_2`, `sculpture_marble`, `sculpture_bronze_knot`, ≥ 1 `bench_*` in the hall, and ≥ 1 `plant_*`.
- [ ] **Step 2:** Run `--upto content` on v03. Expected FAIL.
- [ ] **Step 3: Place the content (MCP).**
  - Append from Hokkaido: the 9 art frames with their labels, `bench_seat` / `bench_leg_*`, `plinth_*`, both sculptures, `plant_pot` / `plant_leaves`, `outlet_plate`, `smoke_detector`. Repath the images to `//../../hokkaido/art/crop/`.
  - Layout:
    - hero centred on the front face of partition 1 (y -6.62);
    - one 1.25 m painting centred on the end wall (y -21.77), with the plinths and sculptures at x ±2.3, 0.6 m off that wall;
    - the remaining 7 on the other partition faces (the back of partition 1, both faces of partitions 2 and 3) and on the side walls, centres at z 1.5, with at least 1.5 m of clear wall between frames;
    - bench(es) on the hall axis facing a painting;
    - plant next to the hall mouth.
  - Re-aim the spots so every painting gets 1-2 spots, plus the sculptures. Save as v04.
- [ ] **Step 4:** Run `--upto content`. Expected: `CHECK OK (content)`.
- [ ] **Step 5:** Render a preview (2 views) to `renders/prev_v04_*.png` and show the user. Archive v03.
- [ ] **Step 6:** Commit `check_scene.py`.

### Task 5: Backdrop + effects → v05

**Files:** Modify `check_scene.py` (stage `effects`). Create `BROOKLYN_v05.blend`.

- [ ] **Step 1: Add `check_effects`.** It asserts:
  - `env_sky_dome` is in `Environment`, and its material uses the image `tex_sky_dome_color`.
  - The dome's ray visibility: camera and transmission are True; shadow, diffuse, glossy and volume scatter are False (Review Focus 4).
  - `Atmosphere` holds only `atmos_*` objects: `atmos_volume_box` (Principled Volume density ≤ 0.003) and `atmos_dust_motes` (a Geometry Nodes instance count ≤ 3000).
- [ ] **Step 2:** Run `--upto effects` on v04. Expected FAIL.
- [ ] **Step 3: Build the backdrop and effects (MCP).**
  - Append `env_sky_dome` and its material from Hokkaido. Scale it to enclose the room. Check through the skylight that the tree photo reads as sky/treetops; rotate it if needed.
  - Append `atmos_volume_box` and `atmos_dust_motes` (with `GN_dust_motes`). Fit the box to the hall (x -5..5, y -1.8..-21.77, z 0..4.8) and the dust range to the hall.
  - Floor reflection comes from the `wood_floor` clearcoat (already set). Light beams come from the volume density, which you tune by preview, starting at 0.0028.
- [ ] **Step 4:** Run `--upto effects`. Expected: `CHECK OK (effects)`.
- [ ] **Step 5:** Render a preview (main view) to `renders/prev_v05_effects.png`. Dust must not look like snow and beams must stay faint. Show the user. Archive v04.
- [ ] **Step 6:** Commit `check_scene.py`.

### Task 6: Cameras, final previews, SCENE.md → v06

**Files:** Modify `check_scene.py` (stage `cameras`). Create `BROOKLYN_v06.blend` and `galleries/brooklyn/SCENE.md`.

- [ ] **Step 1: Add `check_cameras`.** It asserts:
  - `Cameras` holds `CAM_main_hall`, `CAM_entrance`, `CAM_artwork_detail`.
  - Each camera has pitch 90° ± 1 and roll 0 (Hokkaido convention).
  - `scene.camera == CAM_main_hall`.
  - A `scene.ray_cast` from `CAM_main_hall` to the world centre of `art_01_hero_frame` hits `art_01_hero_frame` first (Review Focus 3).
  - Stills settings: 1920x1080, 100%, 384 spp.
- [ ] **Step 2:** Run `--upto cameras` on v05. Expected FAIL.
- [ ] **Step 3: Set up the cameras (MCP).**
  - `CAM_main_hall`: from the hall mouth (about (0, -1.5, 1.6)) toward the hero, 24 mm, shift_y for the skylight, f/8, focus on the hero.
  - `CAM_entrance`: from one corridor end toward the hall mouth.
  - `CAM_artwork_detail`: 50 mm, f/2.8, on one side-wall painting.
  - Optional: `CAM_side_aisle` down the x ≈ 3.5 aisle to the end wall.
  - Set the stills settings and save v06.
- [ ] **Step 4:** Run `--upto cameras`. Expected: `CHECK OK (cameras)`.
- [ ] **Step 5:** Render the final stills headless, one camera per run: `blender -b BROOKLYN_v06.blend -P <scratch render script> -- <CAM>` → `renders/cam_<name>.png` (about 5 min each). Show them to the user for approval. If changes are requested, iterate and re-save as v07+, re-running `--upto cameras`.
- [ ] **Step 6:** Write `galleries/brooklyn/SCENE.md` in the structure of Hokkaido's SCENE.md: TL;DR, paths, zones and coordinates, collections, content table, materials, lighting table, render settings, atmosphere, cameras, gotchas, status.
- [ ] **Step 7: After user approval**, archive v05, then commit the final blend + `SCENE.md`:
```bash
git add galleries/brooklyn/blend/BROOKLYN_v06.blend galleries/brooklyn/SCENE.md galleries/brooklyn/check_scene.py
git commit -m "VA-21 Brooklyn: lit and furnished Blender scene with previews"
```
- [ ] **Step 8:** Move VA-21 to the `completed` column (or leave a short comment on what is left, if anything). Propose a final commit/merge message to the user, and do not push.
