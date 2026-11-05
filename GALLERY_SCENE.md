# WOOD-GALLERY 3D scene: agent knowledge base

Audience: AI agents working on this Blender scene. Data was read from the live scene (`v10_video`) on 2026-11-04. Re-verify before relying on exact numbers if the scene was edited later.

## 0. TL;DR
- Interior of a modern wooden art gallery: front room (entrance) -> partition with 2 doorways -> long hall with a high wooden ceiling and clerestory windows.
- Origin: imported from `WOOD-GALLERY.glb` (a web-configurator export). It was cleaned, lit, textured, furnished, and animated for video in Blender 5.2 LTS, Cycles + OptiX.
- Goal set by the user: **realistic and natural**. They rejected hidden "wash" lights as unnatural. They accepted visible linear pendant lights.
- Current file: `WOOD-GALLERY_v10_video.blend`. Still renders: 1920x1080. Video: 1280x720 @ 60 fps, 1800 frames (30 s). **The full video render has NOT started yet.** Only a 120-frame test clip (frames 421-540) was rendered.

## 1. Paths and files
Root: `C:\Users\fx506\Pictures\Woo-Gallery\`

| Path | Content |
|---|---|
| `WOOD-GALLERY.glb` | Original source model (do not modify) |
| `WOOD-GALLERY_v01..v10_video.blend` | Version history. v08 contains the rejected wash lights. v09 = pendant lights, still-ready. v10_video = v09 + animation |
| `assets\art\art_*.png` | 9 AI-generated paintings (originals, 1024x1024 with white wall edges) |
| `assets\art\crop\art_*.png` | Cropped canvases used as textures (loaded into the .blend) |
| `renders\cam_hero_hall.png`, `cam_entrance.png`, `cam_artwork_detail.png` | First final stills (dark version, 1920x1080, before pendant lights) |
| `renders\hero_hall_v09_small.png` | Latest preview (v09, 960x540, 64 spp) |
| `renders\video_test\` | 4 test frames (1, 481, 901, 1300) |
| `renders\video_clip_test\`, `renders\clip_test.mp4` | 2 s test clip, frames 421-540 |
| `renders\video_frames\` | Target for the full render (empty at time of writing) |
| `C:\Users\fx506\AppData\Local\Temp\opencode\` | Temp: preview renders, `render_range.py`, `render_final.py`, `test_frames.py` |

## 2. Coordinate system and architecture
Blender, Z-up, meters. The gallery extends along **-Y** (the camera looks toward -Y). X is left/right, with +X on the right when facing -Y.

### Zones (measured by ray cast)
| Zone | Y range | X (interior) | Ceiling Z | Notes |
|---|---|---|---|---|
| Entrance (front room) | +1.4 .. -6.15 | about +-2.78 at the glass walls, +-3.5 elsewhere | about 6.1 | 4 glass window panes on the side walls, track spotlights at z ~4.2 |
| Partition wall | y -6.147 (entrance side) / -6.66 (hall side) | full width | - | Two doorways, one on the left and one on the right of a solid center panel (x ~-1.2..+1.2). Exact doorway x ranges were NOT measured; check with a ray cast before depending on them. Door frames only, no door leaves |
| Hall | -6.66 .. -22.66 (16 m) | +-3.5 (7 m wide) | wall tops at z 3.12, wooden ceiling up to z 7.72 | Clerestory windows (a band of glass between the wall top and the ceiling) on both sides. Track spotlights at z ~5.6 |

- Floor is at z = 0 (`gallery_floor`, 14 polys, 7 x 24 m).
- Wall height is about 3.12 m. Above it is a wooden structure (ceiling and beams) with clerestory glass, which gives the "high roof" look.
- Glass panes (`gallery_window_glass`): 4 quads of 4.6 m^2 each at x = +-3.08, y = -1.6 and -3.35.
- The back wall of the hall is at y = -22.66. The wall surface positions of the hall are x = -3.498 and +3.502.

### Source geometry objects (all from the GLB, renamed)
| Object | Polys | Material(s) | Notes |
|---|---|---|---|
| `gallery_ceiling` | 1819 | wood_laminate | Complex, no modifiers (bevel is done in the shader) |
| `gallery_walls` | 84 | wall_paint | Formerly `color_drag_area@Wall Color`. The configurator tag is **gone** (it was renamed) |
| `gallery_floor` | 14 | wood_floor | |
| `gallery_trims` | 184 | wood_laminate | Welded + Bevel modifier + Smooth by Angle |
| `gallery_door_window_frames` | 134 | metal_gray, metal_door_handle | Welded + Bevel + Smooth by Angle. Frames and handles only |
| `gallery_window_glass` | 4 | glass_gray_translucent | |
| `gallery_spot_fixtures` | 6512 | metal_gray, lamp_emissive | 22 lamp heads (mesh only, not light sources) |
| `env_sky_dome` | 960 | sky_dome | Sphere ~75 m across with a tree photo, a backdrop visible through the windows |

Deleted on purpose: `collision_invisible` (game-engine collision box), the unused materials `Dots Stroke` and `Material`, and the `Cube` mesh.

## 3. Collections
- `Gallery`: the 7 architecture objects.
- `Environment`: `env_sky_dome`.
- `Gallery_Content`: art, furniture, small details (below).
- `Lighting`: all lights.
- `Cameras`: stills cameras, video camera, and the two tracking empties.
- `Atmosphere`: the volume box and the dust emitter.

## 4. Content (`Gallery_Content`)
### Artworks (frames face the room; oriented via matrix_world; center height z = 1.5)
Each frame object has 3 material slots: art canvas (texture), `canvas_edge_linen`, `frame_walnut_dark`. A bevel modifier (1.5 mm) is attached. Each has a label card object `*_label` and a text object `*_label_txt`. All are named `art_NN_frame` and use the texture `tex_art_NN`.

| Object | Title | Wall | Position (x, y) | Size w x h (m) |
|---|---|---|---|---|
| `art_01_hero_frame` | Horizon Drift | hall back wall | (0, -22.65) | 2.40 x 1.98 |
| `art_02_frame` | Ochre Fracture | hall left | (-3.49, -10.6) | 1.07 x 1.50 |
| `art_04_frame` | Tidal Gold | hall left | (-3.49, -14.6) | 1.25 x 1.26 |
| `art_06_frame` | Cobalt Weather | hall left | (-3.49, -18.6) | 1.08 x 1.40 |
| `art_05_frame` | Ink Gesture | hall right | (3.49, -10.6) | 1.10 x 1.50 |
| `art_07_frame` | Mustard Plane | hall right | (3.49, -14.6) | 1.25 x 1.25 |
| `art_08_frame` | Burgundy Rain | hall right | (3.49, -18.6) | 1.07 x 1.50 |
| `art_03_frame` | Terracotta Fields | partition, hall side | (0.05, -6.66) | 1.00 x 1.00 |
| `art_09_frame` | Sand and Slate | partition, entrance side | (0.05, -6.15) | 1.00 x 1.00 |

Labels sit about 0.75 m to one side of each frame at z = 1.25. Label text is "title / Oil on canvas, 2026". It is too small to read except in the close-up shot.

Painting style: contemporary abstract oils. The palette (indigo, sienna, ochre, plus one teal piece) matches the wooden room.

### Furniture and sculptures
| Object(s) | Position | Material | Notes |
|---|---|---|---|
| `bench_seat`, `bench_leg_1/2` | (0, -15.8), seat z 0.44 | bench_oak, metal_black_satin | Hall center, 1.9 m long |
| `plinth_1`, `plinth_2` | (-2.3, -22.2) and (2.3, -22.2), 0.5 x 0.5 x 1.0 | plinth_white_matte | Next to the hero painting |
| `sculpture_marble` | on plinth_1 | marble_white | Noisy icosphere, procedural marble |
| `sculpture_bronze_knot` | on plinth_2 | bronze_aged | Curve (a knot), bevel_depth 14 mm |
| `table_top`, `table_leg_1..4` | (0, -5.97), top z 0.78 | bench_oak, metal_black_satin | Console table below `art_09` in the entrance |
| `plant_pot`, `plant_leaves` | (-0.85, -5.78) | pot_ceramic_white, plant_leaf_green | 16 hand-built leaf strips, subsurface |
| `outlet_plate` | (3.49, -12.6), z 0.3 | plinth_white_matte | Small realism detail |
| `smoke_detector` | (0, -2.5, 6.105) | detector_white | Entrance ceiling |

## 5. Materials (names after cleanup)
Textures are packed in the .blend and prefixed `tex_`.
- `wall_paint`: ivory (0.80, 0.78, 0.73), roughness 0.88, plaster bump (noise 180), dirt near the floor (position-Z mask x big noise), weak normal map 0.25.
- `wood_laminate` (ceiling and trims): base color from `tex_wood_laminate_color`, roughness from luminance (0.75..0.45), bump, per-plank value variation, shader Bevel node (4 mm).
- `wood_floor`: glTF ORM texture (green = roughness, blue -> metallic via Math), normal map, roughness multiplied by large noise (0.8..1.25), clearcoat 0.12, micro bump. The `glTF Material Output` node group is a harmless leftover.
- `glass_gray_translucent`: transmission 1, IOR 1.5, roughness noise 0.02..0.12, subtle normal 0.08.
- `metal_gray`: dark anodized, metallic 0.9, roughness noise 0.3..0.5.
- `metal_door_handle`: brushed (noise stretched 80x on Y), roughness 0.22..0.42.
- `lamp_emissive`: warm emission (1.0, 0.73, 0.45), strength 8. Only the lens of a spot fixture glows visually. The actual illumination comes from Spot lights.
- `lamp_pendant_diffuser`: warm emission strength 4, emission sampling disabled so it does not add noise.
- `sky_dome`: emission of the tree photo, strength 2. It must not cast shadows or contribute diffuse light (exact ray flags in section 7).
- `art_NN`: image texture, bump from luminance (strength 0.6), roughness from luminance (0.7..0.4), light clearcoat 0.08.
- Others: `frame_walnut_dark`, `canvas_edge_linen`, `label_card_paper`, `label_text_ink`, `bench_oak` (procedural wave grain), `plinth_white_matte`, `marble_white`, `bronze_aged`, `pot_ceramic_white`, `plant_leaf_green`, `detector_white`, `metal_black_satin`, `atmos_dust_volume`, `dust_mote`.

## 6. Lighting design (current)
Mood: bright but moody late-morning gallery. Sunlight comes through the clerestory, with warm 3000 K artificial accents. Color is near white with a warm bias. The room should be "a bit brighter" but **never washed out**.

| Light group | Count | Type | Power | Color | Purpose |
|---|---|---|---|---|---|
| `light_sun` | 1 | Sun | 6 | (1, 0.95, 0.88) | Direction is synced to the Sky Texture sun (angle 0.6 deg). Animated over the video |
| `light_spot_01..12` | 12 | Spot, 38 deg, blend 0.6, soft size 3 cm | 300 W | (1, 0.73, 0.45) ~3000 K | Hall track lamps, positioned at the fixture lenses, aimed at the side walls (z 1.6) |
| `light_spot_13..20` | 8 | Spot, same | 300 W | same | Entrance track lamps, aimed at the side walls (z 1.4) |
| `light_spot_21..22` | 2 | Spot, same | 300 W | same | More hall lamps |
| `light_spot_hero_1/2` | 2 | Spot 30 deg | 350 W | same | At (+-1.4, -18.8, 5.6), aimed at the hero painting |
| `light_spot_sculpt_1/2` | 2 | Spot 20 deg, blend 0.7 | 180 W | same | At (+-2.0, -19.2, 5.6), aimed at the sculptures |
| `light_pendant_01..03` (+ `_down`, `_up`) | 3 fixtures x 2 area lights | Area 0.045 x 2.1 m | 28 W each | (1, 0.82, 0.6) | Visible linear LED pendants at y = -12.6, -16.6, -20.6, z 4.9, rotated 90 deg about Z so the bar runs along X. `_down` points down, `_up` points up (it bounces off the wooden ceiling) |

World: Sky Texture (Multiple Scattering, sun elevation 50 deg, rotation 120 deg, sun disc off), Background strength **0.35**. These are the user-approved values: **do not change world strength or exposure** (the user asked to keep them).

Rejected approach: hidden area "wash" lights over the walls plus a ceiling fill (v08). The user found them unnatural. Visible fixtures are the preferred way to add brightness. If more light is needed, adjust the pendants (28 W) before anything else.

## 7. Render and look settings
- Engine Cycles, device GPU, OptiX on an RTX 3050 Laptop (4 GB). Light Tree on.
- Stills: 1920x1080, 384 spp, adaptive threshold 0.01, OpenImageDenoise, 16-bit PNG.
- Video: 1280x720, 60 fps, frames 1-1800, 48 spp, adaptive 0.02, denoise, 8-bit PNG, persistent data on.
- Bounces: total 8, diffuse 4, glossy 6, transmission 8, **volume 1**. Indirect clamp 10, direct clamp 0.
- Color management: AgX, look "AgX - Medium High Contrast", exposure **0.3**.
- Compositor (Blender 5 node-group style, `scene.compositing_node_group`): Render Layers -> Glare (type Bloom, threshold 1.5, strength 0.35, size 0.5, smoothness 0.5) -> Group Output.
- `env_sky_dome` ray visibility: visible to camera and transmission only. Shadow, diffuse, glossy and volume scatter are OFF. Otherwise the 75 m sphere blocks the sun.
- Timings measured: about 5 min per 1080p still @ 384 spp. About 18-26 s per 720p frame @ 48 spp. The full video is about **11 h** (1800 frames).

## 8. Atmosphere
- `atmos_volume_box`: 6.9 x 23.8 x 7.6 m at (0, -10.6, 3.85), Principled Volume density **0.0028**, anisotropy 0.6, hidden from shadows, shown as wire. It gives faint spot cones.
- `atmos_dust_motes`: a single-vertex host with the Geometry Nodes group `GN_dust_motes`. Currently 3000 icosphere instances (radius about 1.8-4.5 mm), randomly distributed in the box x -3.2..3.2, y -22.2..-6.9, z 0.3..6.6, a Set Position node adds a 4D-noise drift driven by scene time (slow movement). Material `dust_mote` (low emission 0.15).
- Tuning history: at density 0.0045 and 3500 particles the dust looked like snow at 1080p, which was rejected. Smaller and fewer are better. Sun rays (god rays) from the clerestory are **not** visible, because the density is too low. Raising density makes the render slower.

## 9. Cameras
| Camera | Location | Lens | DOF | Purpose |
|---|---|---|---|---|
| `CAM_hero_hall` | (0, -7.4, 1.6), rot (90, 0, 180), shift_y 0.06 | 24 mm | f/8, focus `art_01_hero_frame` | Wide shot from the partition toward the hero painting |
| `CAM_entrance` | (0, 0.9, 1.6), rot (90, 0, 180), shift_y 0.05 | 24 mm | f/8, focus `art_09_frame` | Entrance room facing the partition |
| `CAM_artwork_detail` | (-1.0, -10.6, 1.5), rot (90, 0, -90) | 50 mm | f/2.8, focus `art_05_frame` | Close-up of the Ink Gesture painting |
| `CAM_video` | animated | 24 -> 35 -> 24 mm (animated) | f/8 -> f/2.8 (animated), focus = empty `video_focus` | Video camera, Track To constraint on `video_target` |

Architectural convention: camera pitch is 90 degrees (horizon level) and Shift Y fixes the framing, so verticals stay straight.

### Video plan (30 s, 1800 frames)
Camera path (keyframes on `CAM_video`, plus a small Noise modifier for handheld feel; target empty also has noise):

| Frame | Camera location | Shot |
|---|---|---|
| 1 | (0.8, 0.9, 1.55) | Entrance room, near the window (tree blur) |
| 301 | (1.2, -3.4, 1.6) | Approaching the partition (rack focus: window -> `art_09`) |
| 481 | (1.95, -5.9, 1.7) | In the right doorway |
| 661 | (1.9, -8.5, 1.8) | Entering the hall |
| 901 | (0.7, -14.2, 1.7) | Walking down the hall |
| 1141 | (-0.8, -18.9, 1.55) | Close-up on the hero painting (lens 35, f/2.8). Y was moved from -20.2 to -18.9 so the frame fits |
| 1471 | (0.8, -18.9, 1.5) | Track sideways |
| 1800 | (0, -7.4, 1.6) | Pull back to the wide hero view |

Also animated: the sun rotates by 5 degrees over the clip (Sky node `sun_rotation` plus the Sun light). Pendants are static on purpose. Audio is not produced (a no-audio MP4 via ffmpeg).

Test results (clip of frames 421-540 only; the other shots were checked as single frames, not as motion): no camera clipping through door frames. The left door frame covers about a fifth of the screen at the start of the doorway shot. The user was offered to shift the path to the door center and has not answered that question yet. Denoiser flicker was small (about 0.17/255 in the second difference on a wall patch at 48 spp). Dust drift smoothness between frames was NOT verified. The pull-back shot and the moved close-up (frame 1141) were not rendered.

## 10. Pipeline and gotchas (learned the hard way)
1. **MCP `execute_blender_code`**: `result` must be a **dict**. Long renders block and may time out, so render long jobs headlessly:
   `blender -b <file.blend> -P <script.py> -- <args>` in a background shell. Use OptiX in the script (`preferences.addons['cycles'].preferences`).
2. **Reading rendered files**: the first Read right after `render(write_still=True)` often says "File not found". Just retry once.
3. **Kill carefully**: when stopping a headless render, filter by command line (`render_final_bright`) so the user's interactive Blender is not killed.
4. **GLB meshes have split vertices (per-face)**, so Bevel does nothing until you `remove_doubles` (dist 0.0001). Only trims and door frames were welded. The ceiling is not (shader bevel is used).
5. **Image generator ignores `size`**: all images come out 1024x1024 with white wall margins. They were cropped by hand (auto-crop was unreliable). Parallel generation hits 429 rate limits, so generate sequentially.
6. **Blender 5.x API differences**: fcurves use channelbags (`anim_utils.action_get_channelbag_for_slot`), compositor is `scene.compositing_node_group` (create `CompositorNodeTree`, Glare inputs are sockets: Type, Threshold, Strength, Size...), `Sky Texture` has no `dust_density`, material emission sampling is `emission_sampling` (not `emit_sampling`), and the `Principled BSDF` input is `Specular IOR Level`.
7. **Sky and Sun sync**: read `sky.sun_direction` and orient the Sun lamp with `(-dir).to_track_quat('-Z','Y')`.
8. **Never add hidden/invisible fill lights** to brighten the room. Add visible fixtures or tune existing ones.
9. Don't `grep` generated or huge files. Keep outputs small and inspect with contact sheets (PIL).
10. `.blend` saved from an interactive session keeps any preview settings (resolution %, samples). Restore stills settings (100%, 384 spp) and video settings (50 spp... see section 7) before saving or rendering.

## 11. Current status and open items
- Done: cleanup and renaming, lighting, materials, bevels, gallery content, dust and volume, cameras, compositor, 3 final stills (dark version), pendant lights, video animation, test frames, 2 s test clip. The user approved the test clip ("looks nice") and asked for this document; they have not yet said "start" for the full render.
- Open question to the user: shift the camera path to the middle of the doorway, or keep it.
- **Not done**: full video render (1800 frames, ~11 h, laptop must stay on and plugged in). Frames go to `renders\video_frames\` as `frame_####.png`, rendered by `render_range.py` (`-- <start> <end> <outdir>`, no-overwrite so it can resume). Then stitch with ffmpeg: `ffmpeg -framerate 60 -start_number 1 -i frame_%04d.png -c:v libx264 -pix_fmt yuv420p -crf 16 out.mp4`.
- Final stills in the brighter (pendant) look were not re-rendered at 1080p. The existing `cam_*.png` are the darker earlier version.
- Possible improvements: dust fewer and more localized in light cones, visible sun rays, pendants rotated/arranged differently, legible label text, door leaves, more props.
- Known non-issues: the `HIPEW ... failed` warning in the Blender log is an AMD HIP warning and can be ignored. The third pendant is usually outside the hero camera frame.
