# Asserts Brooklyn scene conventions on a saved .blend, stage by stage (each stage includes the earlier ones).
#   blender -b galleries/brooklyn/blend/BROOKLYN_vNN.blend --python-exit-code 1 -P galleries/brooklyn/check_scene.py -- --upto <stage>
# Prints "CHECK OK (<stage>)" or every failed assertion, then exits 1.
import sys
import bpy

STAGES = ["cleanup", "materials", "lighting", "content", "effects", "cameras"]
COLLECTIONS = ["Gallery", "Environment", "Gallery_Content", "Lighting", "Cameras", "Atmosphere"]
ARCH = ["gallery_walls", "gallery_floor", "gallery_ceiling", "gallery_trims", "gallery_partitions",
        "gallery_window_glass", "gallery_skylight_frame", "gallery_spot_fixtures", "gallery_doors",
        "gallery_sprinklers", "gallery_corridor_lamps"]


def faces(name):
    o = bpy.data.objects.get(name)
    return len(o.data.polygons) if o and o.type == "MESH" else 0


def check_common(errors):
    for o in bpy.data.objects:
        if o.type == "MESH" and len(o.data.polygons) > 100_000:
            errors.append(f"{o.name}: {len(o.data.polygons)} faces > 100000")
    errors += [f"orphan material {m.name}" for m in bpy.data.materials if m.users == 0]
    errors += [f"orphan image {i.name}" for i in bpy.data.images if i.users == 0 and i.name != "Render Result"]


def check_cleanup(errors):
    errors += [f"missing collection {c}" for c in COLLECTIONS if c not in bpy.data.collections]
    errors += [f"leftover object {n}" for n in ("collision_invisible", "ENVIRONMENT") if n in bpy.data.objects]
    errors += [f"configurator tag in name {d.name}" for d in [*bpy.data.objects, *bpy.data.materials] if "@" in d.name]
    errors += [f"old lightmap UV on {m.name}" for m in bpy.data.meshes if "UVMap.001" in m.uv_layers]
    gallery = bpy.data.collections.get("Gallery")
    for n in ARCH:
        if not gallery or n not in gallery.objects:
            errors.append(f"{n} not in collection Gallery")
    bench = faces("corridor_bench_seat") + faces("corridor_bench_frame")
    # frame is ~2900 strap boxes that collapse can't reduce further, hence 40k not 30k
    if not faces("corridor_bench_seat") or bench > 40_000:
        errors.append(f"corridor bench faces {bench} (need seat present, total <= 40000)")


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    upto = argv[argv.index("--upto") + 1] if "--upto" in argv else STAGES[-1]
    if upto not in STAGES:
        raise SystemExit(f"unknown stage {upto}; use one of {STAGES}")
    errors = []
    check_common(errors)
    for stage in STAGES[:STAGES.index(upto) + 1]:
        globals()[f"check_{stage}"](errors)
    if errors:
        print("\n".join("FAIL: " + e for e in errors))
        sys.exit(1)
    print(f"CHECK OK ({upto})")


main()
