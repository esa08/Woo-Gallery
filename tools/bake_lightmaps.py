# Bake lightmaps for the web gallery: lighting only (Diffuse, Direct+Indirect, NO Color), plus optional albedo
# for materials whose colour comes from procedural nodes (those do not survive the glTF export).
#
# Fresh run (everything, re-packs every lightmap UV, re-saves WOOD-GALLERY_web.blend from the source file):
#   WG_GALLERY=hokkaido blender -b galleries/hokkaido/blend/WOOD-GALLERY_v10_video.blend -P tools/bake_lightmaps.py -- --samples 768
# Incremental run on the web copy (keeps the lightmap UV that already exists, merges into manifest.json):
#   WG_GALLERY=hokkaido blender -b galleries/hokkaido/blend/WOOD-GALLERY_web.blend -P tools/bake_lightmaps.py -- --in-place --samples 768 --only a,b
#   WG_GALLERY=hokkaido blender -b galleries/hokkaido/blend/WOOD-GALLERY_web.blend -P tools/bake_lightmaps.py -- --in-place --no-light --albedo --only gallery_walls
# WG_VARIANT=empty bakes the gallery without paintings (WOOD-GALLERY_empty.blend, build/empty/). Its fresh bake opens the make_empty.py output:
#   WG_GALLERY=hokkaido WG_VARIANT=empty blender -b galleries/hokkaido/build/empty/empty_src.blend -P tools/bake_lightmaps.py -- --samples 768 --albedo
# The source .blend is never touched.
#
# Output: galleries/<name>/build/<variant>/lightmaps/<object>.png (sRGB 8-bit, value = linear / scale), <object>_albedo.png, manifest.json.
# In Babylon: lightmap texture.level = scale, coordinatesIndex = 1, invertY = false, useLightmapAsShadowmap = true;
# albedo texture coordinatesIndex = 1, invertY = false.
import bpy, sys, os, json, math, time, argparse
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wg import gallery

ap = argparse.ArgumentParser()
ap.add_argument("--samples", type=int, default=64)
ap.add_argument("--res-scale", type=float, default=1.0, help="multiplies every default resolution (0.5 = quick preview)")
ap.add_argument("--only", default="", help="comma separated object names")
ap.add_argument("--uv-layer", default="UVMap.001", help="second UV layer = lightmap UV (exported as TEXCOORD_1)")
ap.add_argument("--blur", type=float, default=1.0, help="gaussian sigma in px, masked to baked texels; hides residual bake noise (0 = off)")
ap.add_argument("--in-place", action="store_true", help="work on the opened file (WOOD-GALLERY_web.blend), keep existing lightmap UVs, merge the manifest")
ap.add_argument("--no-light", action="store_true", help="skip the lighting bake (use with --albedo)")
ap.add_argument("--albedo", action="store_true", help="also bake albedo for ALBEDO_RES objects")
ap.add_argument("--albedo-samples", type=int, default=8)
args = ap.parse_args(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])

g = gallery()
BUILD = g.build
OUT = os.path.join(BUILD, "lightmaps")   # raw PNG; tools/optimize.mjs converts to <variant>/assets/lightmaps
WEB_BLEND = g.blend
os.makedirs(OUT, exist_ok=True)

DEFAULT_RES = g.cfg["bake"]["res"]
# Colour from procedural nodes (mix / noise / ramp) is lost on export: bake it. Walls = plaster mix + dirt near the floor,
# bench / table = oak wave grain, marble = ramp veining. Lightmap UV, so no extra UV is needed.
ALBEDO_RES = g.cfg["bake"]["albedo"]
# Optional per-object blur sigma (px) overriding --blur, e.g. { "gallery_walls": 3 }: big flat walls show low-frequency
# bake noise as blotches that 1 px does not hide (Brooklyn). Absent = --blur for every object (Hokkaido unchanged).
BLUR = g.cfg["bake"].get("blur", {})

targets = {n: max(64, int(r * args.res_scale)) for n, r in DEFAULT_RES.items()}
if args.only:
    keep = set(args.only.split(","))
    targets = {n: r for n, r in targets.items() if n in keep}

if not args.in_place:
    bpy.ops.wm.save_as_mainfile(filepath=WEB_BLEND)      # from here on we only touch the copy
sc = bpy.context.scene

# Atmosphere (volume box + dust) cannot be baked and would scatter the light: remove from the copy.
for ob in list(bpy.data.objects):
    if ob.name.startswith("atmos_"):
        bpy.data.objects.remove(ob, do_unlink=True)

# Cycles on the RTX (OptiX), same as the video renders.
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    prefs.compute_device_type = kind
    prefs.get_devices()
    gpus = [d for d in prefs.devices if d.type == kind]
    if gpus:
        for d in prefs.devices: d.use = d.type == kind
        break
sc.render.engine = "CYCLES"
sc.cycles.device = "GPU"
sc.cycles.use_adaptive_sampling = True
sc.cycles.adaptive_threshold = 0.005
print("BAKE device", prefs.compute_device_type, [d.name for d in prefs.devices if d.use])


def srgb_oetf(v):
    return np.where(v <= 0.0031308, 12.92 * v, 1.055 * np.power(np.maximum(v, 1e-9), 1 / 2.4) - 0.055)


def gauss_blur(rgb, valid, sigma):
    """Normalized convolution: only baked texels contribute, so black padding never bleeds into the lighting."""
    if sigma <= 0: return rgb
    r = int(math.ceil(3 * sigma)); k = np.exp(-0.5 * (np.arange(-r, r + 1) / sigma) ** 2); k /= k.sum()
    def conv(a, axis):
        pad = [(0, 0)] * a.ndim; pad[axis] = (r, r); ap = np.pad(a, pad, mode="edge"); out = np.zeros_like(a)
        for i, w in enumerate(k):
            sl = [slice(None)] * a.ndim; sl[axis] = slice(i, i + a.shape[axis]); out += w * ap[tuple(sl)]
        return out
    m = valid.astype(np.float32)[..., None]
    num = conv(conv(rgb * m, 0), 1); den = conv(conv(m, 0), 1)
    return np.where(valid[..., None] & (den > 1e-4), num / np.maximum(den, 1e-4), rgb)


def select(ob):
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def prepare(ob, res):
    """Curve -> mesh (the bronze knot), then make sure a non-overlapping lightmap UV exists."""
    if ob.type == "CURVE":
        select(ob); bpy.ops.object.convert(target="MESH")
    me = ob.data
    has_layer = args.uv_layer in me.uv_layers
    if args.in_place and has_layer:
        return                                           # incremental run: lightmaps already baked on this layout
    if len(me.uv_layers) == 0:
        me.uv_layers.new(name="UVMap")                   # keep the lightmap layer second so it exports as TEXCOORD_1
    layer = me.uv_layers.get(args.uv_layer) or me.uv_layers.new(name=args.uv_layer)
    me.uv_layers.active = layer
    select(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    sc.tool_settings.use_uv_select_sync = True
    bpy.ops.mesh.select_all(action="SELECT")
    # Smart UV keeps island scale proportional to 3D size
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), margin_method="FRACTION",
                             island_margin=6.0 / res, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    uv = me.uv_layers[args.uv_layer].data
    a = np.zeros(len(uv) * 2, np.float32); uv.foreach_get("uv", a); a = a.reshape(-1, 2)
    uv_area = 0.0; world_area = 0.0
    for p in me.polygons:
        pts = a[list(p.loop_indices)]; x, y = pts[:, 0], pts[:, 1]
        uv_area += 0.5 * abs(np.dot(x, np.roll(y, -1)) - np.dot(y, np.roll(x, -1)))
        world_area += p.area
    print(f"BAKE uv {ob.name}: res {res} used {uv_area:.1%} of atlas, ~{math.sqrt(uv_area * res * res / max(world_area, 1e-9)):.0f} px/m")


def bake_pass(ob, res, passes, samples):
    """Bake into a float image through a temporary Image Texture node on every material slot. Returns rgb (res, res, 3)."""
    sc.cycles.samples = samples
    img = bpy.data.images.new("bake_tmp", res, res, alpha=False, float_buffer=True, is_data=True)
    added = []
    for slot in ob.material_slots:
        m = slot.material
        if not m or not m.use_nodes: continue
        nt = m.node_tree
        tex = nt.nodes.new("ShaderNodeTexImage"); tex.image = img
        uvn = nt.nodes.new("ShaderNodeUVMap"); uvn.uv_map = args.uv_layer
        nt.links.new(uvn.outputs[0], tex.inputs["Vector"])
        nt.nodes.active = tex; tex.select = True
        added.append((nt, tex, uvn))
    select(ob)
    bpy.ops.object.bake(type="DIFFUSE", pass_filter=passes, target="IMAGE_TEXTURES",
                        margin=8, margin_type="EXTEND", use_clear=True, uv_layer=args.uv_layer)
    for nt, tex, uvn in added:
        nt.nodes.remove(tex); nt.nodes.remove(uvn)
    px = np.empty(res * res * 4, np.float32); img.pixels.foreach_get(px)
    bpy.data.images.remove(img)
    return px.reshape(res, res, 4)[..., :3].copy()


def save_png(enc, res, path):
    out = bpy.data.images.new("out_tmp", res, res, alpha=False, float_buffer=False, is_data=True)
    out.pixels.foreach_set(np.concatenate([enc, np.ones((res, res, 1), np.float32)], axis=-1).astype(np.float32).ravel())
    out.filepath_raw = path; out.file_format = "PNG"; out.save()
    bpy.data.images.remove(out)


def bake_light(ob, res):
    t0 = time.time()
    rgb = bake_pass(ob, res, {"DIRECT", "INDIRECT"}, args.samples)
    valid = rgb.max(axis=-1) > 0
    rgb = gauss_blur(rgb, valid, BLUR.get(ob.name, args.blur))
    peak = rgb.max(axis=-1)
    p999 = float(np.percentile(peak[valid], 99.9)) if valid.any() else 1.0
    scale = max(1.0, math.ceil(p999 * 4) / 4)             # headroom factor, Babylon multiplies it back via texture.level
    save_png(srgb_oetf(np.clip(rgb / scale, 0, 1)).astype(np.float32), res, os.path.join(OUT, ob.name + ".png"))
    st = dict(file="lightmaps/" + ob.name + ".png", scale=scale, res=res,
              mean=float(rgb[valid].mean()) if valid.any() else 0.0, p999=p999, coverage=float(valid.mean()))
    print(f"BAKE light {ob.name}: {time.time() - t0:.0f}s scale {scale} mean {st['mean']:.3f} p99.9 {p999:.2f} covered {st['coverage']:.1%}")
    return st


def bake_albedo(ob, res):
    t0 = time.time()
    rgb = bake_pass(ob, res, {"COLOR"}, args.albedo_samples)
    valid = rgb.max(axis=-1) > 0
    mean = rgb[valid].mean(axis=0) if valid.any() else np.zeros(3)
    save_png(srgb_oetf(np.clip(rgb, 0, 1)).astype(np.float32), res, os.path.join(OUT, ob.name + "_albedo.png"))
    print(f"BAKE albedo {ob.name}: {time.time() - t0:.0f}s res {res} mean linear {mean.round(3).tolist()}")
    return dict(albedo="lightmaps/" + ob.name + "_albedo.png", albedoRes=res)


mpath = os.path.join(OUT, "manifest.json")
manifest = json.load(open(mpath)) if (args.in_place and os.path.exists(mpath)) else {}
for name, res in targets.items():
    ob = bpy.data.objects.get(name)
    if ob is None:
        print("BAKE MISSING", name); continue
    entry = manifest.setdefault(name, {})
    if not args.no_light:
        prepare(ob, res)
        st = bake_light(ob, res)
        if st["mean"] <= 1e-6:
            # fully metallic material (metal_black_satin, bronze_aged): no diffuse to bake, it is lit by reflections only.
            # A black lightmap would turn the object black in the browser, so it stays on the IBL path.
            print(f"BAKE skip {name}: zero diffuse (metallic), not added to the manifest")
            manifest.pop(name, None); os.remove(os.path.join(OUT, name + ".png"))
            ob.data.uv_layers.remove(ob.data.uv_layers[args.uv_layer])   # unused lightmap UV would only split vertices in the GLB
            continue
        entry.update(st)
    if args.albedo and name in ALBEDO_RES:
        if "file" not in entry: prepare(ob, ALBEDO_RES[name])      # --no-light on a fresh object still needs the UV
        entry.update(bake_albedo(ob, ALBEDO_RES[name]))
    with open(mpath, "w") as f:                          # written after every object: a crash keeps what is done
        json.dump(manifest, f, indent=2)
bpy.ops.wm.save_mainfile()                               # keeps the lightmap UV layers (and the converted knot) in the web copy
print("BAKE finished", list(manifest))
