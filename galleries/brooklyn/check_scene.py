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


GALLERY_MATS = {"wall_paint", "wood_floor", "trim_white", "glass_gray_translucent", "metal_gray", "metal_door_handle",
                "metal_black_satin", "lamp_emissive", "ceiling_white", "sprinkler_metal"}
GLB_LEFTOVERS = ["Material #25", "Material.001", "White", "Walls", "Floor", "Gray.Frame.001"]


def used_materials(o):
    slots = o.material_slots
    return {slots[p.material_index].material.name if slots and slots[p.material_index].material else None
            for p in o.data.polygons}


def check_materials(errors):
    for o in bpy.data.collections["Gallery"].objects:
        bad = used_materials(o) - GALLERY_MATS
        if bad:
            errors.append(f"{o.name} uses {sorted(map(str, bad))}")
    for n, want in (("corridor_bench_seat", {"leather_black"}), ("corridor_bench_frame", {"metal_black_satin"})):
        if n in bpy.data.objects and used_materials(bpy.data.objects[n]) != want:
            errors.append(f"{n} uses {sorted(map(str, used_materials(bpy.data.objects[n])))}, want {sorted(want)}")
    errors += [f"GLB leftover material {n}" for n in GLB_LEFTOVERS if n in bpy.data.materials]
    errors += [f"packed image without tex_ prefix: {i.name}" for i in bpy.data.images
               if i.packed_file and not i.name.startswith("tex_")]


FIXTURES = ["gallery_spot_fixtures", "gallery_corridor_lamps"]


def check_lighting(errors):
    from mathutils.bvhtree import BVHTree
    sc = bpy.context.scene
    lights = [o for o in bpy.data.collections["Lighting"].objects if o.type == "LIGHT"]
    suns = [o for o in lights if o.data.type == "SUN"]
    if [o.name for o in suns] != ["light_sun"]:
        errors.append(f"want exactly one SUN named light_sun, got {[o.name for o in suns]}")
    heads, spots = sc.get("spot_heads", 0), sum(o.data.type == "SPOT" for o in lights)
    if not heads or spots < heads:
        errors.append(f"{spots} spots for {heads} spot heads")
    import bmesh
    trees = []
    for n in FIXTURES:   # world-space trees: fixture objects are not at identity transform
        if n in bpy.data.objects:
            bm = bmesh.new()
            bm.from_mesh(bpy.data.objects[n].data)
            bm.transform(bpy.data.objects[n].matrix_world)
            trees.append(BVHTree.FromBMesh(bm))
            bm.free()
    for o in lights:   # anti-goal: no light without a visible fixture
        if o.data.type == "SUN":
            continue
        p = o.matrix_world.translation
        dist = min((t.find_nearest(p)[3] for t in trees if t.find_nearest(p)[0] is not None), default=1e9)
        if dist > 0.3:
            errors.append(f"{o.name} is {dist:.2f} m from any fixture (hidden light)")
    w = sc.world
    if not (w and w.use_nodes and any(n.type == "TEX_SKY" for n in w.node_tree.nodes)):
        errors.append("world has no Sky Texture")
    if sc.render.engine != "CYCLES" or sc.view_settings.view_transform != "AgX":
        errors.append(f"render {sc.render.engine}/{sc.view_settings.view_transform}, want CYCLES/AgX")
    g = sc.compositing_node_group
    if not (g and any(n.type == "GLARE" for n in g.nodes)):
        errors.append("compositor has no Glare node")


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
