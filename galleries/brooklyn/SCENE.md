# BROOKLYN gallery 3D scene: agent knowledge base

Audience: AI agents and developers continuing this Blender scene. Values were read from the scene while building it on 2026-11-12 (issue VA-21). Design: `docs/superpowers/specs/2026-11-12-brooklyn-blender-design.md`, plan: `docs/superpowers/plans/2026-11-12-brooklyn-blender.md`.

## 0. TL;DR
- Villume's "T-GALLERY" rebuilt in Blender 5.2 LTS (Cycles + OptiX): a T-shaped white gallery with a long skylight, 9 paintings, plinths with sculptures, benches, dust and haze.
- Look target: same mood as Hokkaido (`../hokkaido/SCENE.md`), "realistic and natural". There are no hidden lights; every lamp sits in a visible fixture.
- Current file: `blend/BROOKLYN_v06.blend` (with paintings) and `blend/BROOKLYN_v06_empty.blend` (same scene, all `art_*` removed). Older versions are in `archive/` at the repo root (git-ignored).
- Check the conventions with `blender -b blend/BROOKLYN_v06.blend --python-exit-code 1 -P check_scene.py -- --upto cameras`, which must print `CHECK OK (cameras)`. For the empty variant use `--upto lighting`.
- Web (bake, GLB, `gallery.json`) is not done yet. The scene follows WEB_GALLERY.md §3b naming, so that pipeline should apply.

## 1. Paths and files
Paths are relative to `galleries/brooklyn/`.

| Path | Content |
|---|---|
| `blend/T-GALLERY.glb` | Source model. From GitHub `GoThruMedia/villume-exhibitions`, `master`, `T-GALLERY/t-gallery-ori@default.glb`, 8 311 924 bytes. Do not modify |
| `blend/BROOKLYN_v06.blend` | Current scene |
| `blend/BROOKLYN_v06_empty.blend` | Derived: v06 without `art_*`. Re-derive it, don't edit it (snippet in §10) |
| `check_scene.py` | Stage-by-stage convention check (`cleanup, materials, lighting, content, effects, cameras`) |
| `render_still.py` | Headless still render of one camera (§10.5) |
| `renders/` (git-ignored) | `cam_*.png` final stills (1920x1080, 384 spp) and `prev_v0N_*.png` previews |
| `../hokkaido/art/crop/*.png` | Painting images, **shared with Hokkaido**, linked relative (`//../../hokkaido/art/crop/<file>`), not packed. Moving either folder breaks the links (`check_scene.py --upto content` catches it) |

Every other texture is packed and prefixed `tex_`.

## 2. Coordinate system and architecture
Z-up, meters, floor at z = 0, walls about 4 m high. The camera usually looks toward -Y. **Facing -Y, +X is on the left.**

| Zone | X | Y | Notes |
|---|---|---|---|
| Corridor (top bar of the T) | -10.33 .. 10.33 | -1.8 .. 2.23 | Pass-through only (user decision). Barcelona bench along the +Y wall, double doors at both ends, linear lamps and round downlights |
| Hall (stem of the T) | -5 .. 5 | -1.8 .. -21.77 | Skylight above x ±4.25, y -3.1 .. -20.9, glass at z 4.57 (edges) / 4.69 (ridge) |
| Partition 1 | centre -2..2, stub 4..5 | -6.62 .. -6.92 | 0.3 m thick, 2.5 m high |
| Partition 2 | centre -2..2, stub -5..-4 | -11.62 .. -11.92 | |
| Partition 3 | centre -2..2, stub 4..5 | -16.62 .. -16.92 | |

The centre partitions hide the end wall from the corridor. That is why the hero painting hangs on the **front of partition 1**.

### Architecture objects (collection `Gallery`)
| Object | From GLB | Material(s) |
|---|---|---|
| `gallery_walls` | `color_drag_area@Walls` | wall_paint |
| `gallery_floor` | `donut_area@Floor` | wood_floor |
| `gallery_ceiling` | `color@Ceiling` + `Ceiling_Outside_2` | ceiling_white |
| `gallery_trims` | `color@Trims` (welded) | trim_white |
| `gallery_partitions` | `color_drag_area@Panels` (welded) | wall_paint |
| `gallery_skylight_frame` | `Window` + `Beam_003` | trim_white |
| `gallery_window_glass` | **new** (the GLB had no glass faces): 2 quads following the gable | glass_gray_translucent, **visible_shadow off** (refractive glass blocks the sun otherwise) |
| `gallery_spot_fixtures` | `Lamp_support_001` + `Lamp_016.001/.002` | metal_black_satin, lamp_emissive (lens) |
| `gallery_doors` | `Door_003` + `Door_lock_003` (welded) | metal_gray, metal_door_handle |
| `gallery_sprinklers` | `Sprinkler_system_001` | sprinkler_metal |
| `gallery_corridor_lamps` | `Circle-LAMP` + `Long_lamp_Corridor-BAKE` | lamp_emissive, metal_black_satin |

Deleted on purpose: `collision_invisible`, `ENVIRONMENT` (152 m photo sphere), all old lightmap UVs `UVMap.001` (a new one is made at bake time), and the GLB materials.

## 3. Collections
`Gallery` (architecture), `Environment` (`env_sky_dome`), `Gallery_Content` (art, furniture, props, corridor bench), `Lighting`, `Cameras`, `Atmosphere`.

## 4. Content (`Gallery_Content`)
Frames, labels and props are appended from Hokkaido. The frame is `art_NN_frame` and the label pair is `<frame>_label` / `<frame>_label_txt`, which keep Hokkaido's offset relative to their frame. A frame's canvas faces local +Z, and its rotation is (90°, 0, yaw).

| Object | Title | Where | Centre (x, y, z) | Faces |
|---|---|---|---|---|
| `art_01_hero_frame` | Horizon Drift | partition 1, front | (0, -6.608, 1.3) | +Y |
| `art_04_frame` | Tidal Gold | partition 1, back | (0, -6.932, 1.45) | -Y |
| `art_02_frame` | Ochre Fracture | partition 2, front | (0, -11.608, 1.45) | +Y |
| `art_05_frame` | Ink Gesture | partition 2, back | (0, -11.932, 1.45) | -Y |
| `art_06_frame` | Cobalt Weather | partition 3, front | (0, -16.608, 1.45) | +Y |
| `art_08_frame` | Burgundy Rain | partition 3, back | (0, -16.932, 1.45) | -Y |
| `art_07_frame` | Mustard Plane | end wall | (0, -21.758, 1.5) | +Y |
| `art_03_frame` | Terracotta Fields | +X wall | (4.988, -9.27, 1.5) | -X |
| `art_09_frame` | Sand and Slate | +X wall | (4.988, -14.27, 1.5) | -X |

The **-X wall is left bare on purpose**. The sun pattern lands on it (z about 1.7-3.5) and would hit paintings.

Props: `plinth_1` + `sculpture_marble` at (-2.3, -21.17), `plinth_2` + `sculpture_bronze_knot` at (2.3, -21.17), hall benches `bench_seat`/`bench_leg_1/2` at (0, -9.27) and `bench_seat_2`/`bench_leg_3/4` at (0, -19.3), `plant_pot`/`plant_leaves` at (4.4, -2.5), `outlet_plate` on the +X wall at (5, -11.8, 0.3), `smoke_detector` on the ceiling at (2.5, -2.4). Corridor bench: `corridor_bench_seat` (welded, decimated 372k → 21k faces; faint dents at 1 m) and `corridor_bench_frame` (17k faces of strap boxes; collapse cannot reduce it further).

## 5. Materials
Appended from Hokkaido and retuned:
- `wall_paint`: base (0.85, 0.84, 0.81), with Hokkaido's plaster bump and floor dirt.
- `wood_floor`: GLB ash parquet (`tex_floor_ash_color` / `_normal`) through a Hue/Sat node `floor_hsv` (sat 0.75, value 0.75). Roughness 0.45 x noise, coat 0.35 at roughness 0.06 (gives the floor reflections). Hokkaido's ORM nodes were removed.
- Others: `glass_gray_translucent`, `metal_gray`, `metal_door_handle`, `metal_black_satin`, `lamp_emissive`, plus the art/frame/label/prop materials.
- New: `trim_white` and `ceiling_white` (copies of `plinth_white_matte`), `sprinkler_metal` (lighter `metal_gray`), `leather_black` (GLB leather textures).

## 6. Lighting
| Light | Count | Type / power | Notes |
|---|---|---|---|
| `light_sun` | 1 | Sun 14, (1, 0.95, 0.88), angle 0.6° | Synced to the Sky Texture: elevation 55°, rotation 90° (sun from +X). Parallel to the partition faces, so no sun on paintings |
| `light_spot_01..17` | 17 | Spot 200 W, 38°, blend 0.6, soft 3 cm, (1, 0.73, 0.45) | One per track head (`scene["spot_heads"] = 17`), 1.5 cm in front of the lens. Aimed at paintings, sculptures, or plain wall |
| `light_corridor_bar_01..04` | 4 | Area 40 W, 2 m x 0.1 m, (1, 0.82, 0.6) | Under the linear corridor lamps |
| `light_corridor_down_01..05` | 5 | Spot 60 W, 90° | Under the round downlights |

World `world_sky`: Sky Texture (Multiple Scattering, sun disc off), Background **0.15**. Sky direction formula (measured): `dir = (sin r·cos e, cos r·cos e, sin e)`.

Rules: never add hidden or fill lights. `check_scene.py --upto lighting` fails any non-sun light more than 0.3 m from a fixture mesh.

## 7. Render and look
Cycles GPU (OptiX), Light Tree, 384 spp, adaptive 0.01, denoise. Bounces: 8 total, diffuse 4, glossy 6, transmission 8, volume 1; indirect clamp 10. AgX, look **"AgX - High Contrast"**, exposure **-0.2**. Compositor group `comp_gallery`: Glare (Bloom, threshold 1.5, strength 0.35). Stills are 1920x1080. A 960x540 preview at 128 spp takes about 15-30 s.

The look values (world 0.15, sun 14, spots 200 W, High Contrast, exposure -0.2, darker glossy floor) are "variant C", made after the user asked for a more realistic mood. They are not final approved values yet.

## 8. Atmosphere
- `atmos_volume_box`: covers the hall, inset from the floor and walls (scale 9.9 x 19.85 x 4.76, centre (0, -11.79, 2.42)). Density 0.0028. **Never let a box face touch the floor**: coplanar faces made the floor see-through to the sky dome.
- `atmos_dust_motes`: GN group `GN_dust_motes`, 1800 motes, radius 1.8-3 mm, in x ±4.8, y -21.5..-2, z 0.3..4.4. Material `dust_mote` emission 0, so motes show only where light hits them.
- Sun beams are barely visible at this density, the same as in Hokkaido.

## 9. Cameras (`Cameras`)
All are level (pitch 90°, roll 0). Framing uses Shift Y.

| Camera | Location → look at | Lens | DOF |
|---|---|---|---|
| `CAM_main_hall` (scene camera) | (0, -1.0, 1.6) → -Y | 22 mm, shift_y 0.08 | f/8, focus hero |
| `CAM_entrance` | (-4.5, 2.0, 1.6) → (0.5, -6.6) | 20 mm, shift_y 0.05 | f/8, focus hero |
| `CAM_artwork_detail` | (2.1, -8.4, 1.5) → (5, -9.27) | 50 mm | f/2.8, focus `art_03_frame` |
| `CAM_side_aisle` | (3.7, -2.3, 1.6) → (2.0, -21.7) | 20 mm, shift_y 0.06 | f/8, focus `art_07_frame` |

## 10. Pipeline and gotchas
1. Version files were written from an interactive session with `bpy.data.libraries.write({scene}, path_remap='NONE')`, after setting the art paths to `//../../hokkaido/art/crop/...`. This keeps the user's unrelated scratch scene out of the file. Blender on Windows stores those paths with backslashes (Hokkaido does too), and the check normalises them.
2. Appending a compositor node group can drag in the whole source scene through its Render Layers node. Repoint it to the current scene, then delete the appended scene.
3. Appended objects show identity transforms until `view_layer.update()`.
4. GLB meshes are split per face: weld before Decimate or Bevel, otherwise Decimate tears the mesh.
5. `MCP execute_blender_code` times out at 120 s. Render stills headless with `render_still.py`, which sets OptiX, picks the camera and writes a 16-bit PNG. From the repo root: `blender -b galleries/brooklyn/blend/BROOKLYN_v06.blend -P galleries/brooklyn/render_still.py -- CAM_main_hall galleries/brooklyn/renders/cam_main_hall.png`.
6. Empty variant from v06: `blender -b blend/BROOKLYN_v06.blend --python-expr "import bpy; [bpy.data.objects.remove(o) for o in list(bpy.data.objects) if o.name.startswith('art_')]; bpy.data.orphans_purge(do_recursive=True); bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath('//BROOKLYN_v06_empty.blend'), compress=True)"`.

## 11. Status and open items
- Done: cleanup and naming, materials, lighting, content, sky dome and atmosphere, cameras, final stills, empty variant, this document.
- Open: the user asked for a "more realistic" mood, and variant C is the current answer. They have not confirmed it yet, and a reference photo was requested.
- Not done (later stage): lightmap bake, GLB export, `gallery.json`, web page (WEB_GALLERY.md §3b).
