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
    # a light must shine out of its lens, not sideways through its own housing
    import math
    from mathutils import Vector
    lens = []
    for n in FIXTURES:
        o = bpy.data.objects.get(n)
        if not o:
            continue
        idx = {i for i, s in enumerate(o.material_slots) if s.material and s.material.name == "lamp_emissive"}
        m3 = o.matrix_world.to_3x3()
        lens += [(o.matrix_world @ p.center, (m3 @ p.normal).normalized() * p.area)
                 for p in o.data.polygons if p.material_index in idx]
    for o in lights:
        if o.data.type == "SUN":
            continue
        p = o.matrix_world.translation
        nrm = sum((wn for c, wn in lens if (c - p).length < 0.3), Vector())
        d = o.matrix_world.to_3x3() @ Vector((0, 0, -1))
        if nrm.length == 0:
            errors.append(f"{o.name} has no lens within 30 cm")
        elif math.degrees(d.angle(nrm)) > 30:
            errors.append(f"{o.name} aims {math.degrees(d.angle(nrm)):.0f} deg off its lens normal")
    w = sc.world
    if not (w and w.use_nodes and any(n.type == "TEX_SKY" for n in w.node_tree.nodes)):
        errors.append("world has no Sky Texture")
    if sc.render.engine != "CYCLES" or sc.view_settings.view_transform != "AgX":
        errors.append(f"render {sc.render.engine}/{sc.view_settings.view_transform}, want CYCLES/AgX")
    g = sc.compositing_node_group
    if not (g and any(n.type == "GLARE" for n in g.nodes)):
        errors.append("compositor has no Glare node")


ART_PREFIX = "//../../hokkaido/art/crop/"
ART_FRAMES = ["art_01_hero_frame"] + [f"art_{i:02d}_frame" for i in range(2, 10)]


def canvas_normal(o):
    """Area-weighted world normal of the faces using an art_* material."""
    from mathutils import Vector
    idx = {i for i, s in enumerate(o.material_slots) if s.material and s.material.name.startswith("art_")}
    n = sum((p.normal * p.area for p in o.data.polygons if p.material_index in idx), Vector())
    return (o.matrix_world.to_3x3() @ n).normalized()


def check_content(errors):
    import os
    import re
    frames = sorted(o.name for o in bpy.data.objects if re.fullmatch(r"art_\d\d(_hero)?_frame", o.name))
    if frames != sorted(ART_FRAMES):
        errors.append(f"art frames {frames}, want {ART_FRAMES}")
    for n in frames:
        o = bpy.data.objects[n]
        mats = [s.material for s in o.material_slots if s.material and s.material.name.startswith("art_")]
        imgs = [nd.image for m in mats for nd in m.node_tree.nodes if nd.type == "TEX_IMAGE" and nd.image]
        if not imgs:
            errors.append(f"{n}: no art_ material with an image")
        for img in imgs:
            # Blender on Windows stores "//..\\..\\" (Hokkaido too), so compare with "/" separators
            if (not img.filepath.replace("\\", "/").startswith(ART_PREFIX)
                    or not os.path.isfile(bpy.path.abspath(img.filepath))):
                errors.append(f"{n}: image {img.filepath!r} not a valid {ART_PREFIX} link")
        x, y = o.matrix_world.translation.x, o.matrix_world.translation.y
        if not (-5 <= x <= 5 and -21.77 <= y <= -1.8):
            errors.append(f"{n} at ({x:.2f}, {y:.2f}) is outside the hall")
        for suffix in ("_label", "_label_txt"):
            if n + suffix not in bpy.data.objects:
                errors.append(f"missing {n + suffix}")
    hero = bpy.data.objects.get("art_01_hero_frame")
    if hero:
        p = hero.matrix_world.translation
        if abs(p.x) >= 0.1 or not -6.62 <= p.y <= -6.40:
            errors.append(f"hero at ({p.x:.2f}, {p.y:.2f}), want front face of partition 1 (x~0, y -6.62..-6.40)")
        if canvas_normal(hero).y < 0.95:
            errors.append(f"hero canvas faces {tuple(round(c, 2) for c in canvas_normal(hero))}, want +Y")
    content = bpy.data.collections["Gallery_Content"].objects
    for n in ("plinth_1", "plinth_2", "sculpture_marble", "sculpture_bronze_knot"):
        if n not in content:
            errors.append(f"{n} not in Gallery_Content")
    hall_bench = [o for o in content if o.name.startswith("bench_") and o.matrix_world.translation.y < -1.8]
    if not hall_bench:
        errors.append("no bench_* in the hall")
    if not any(o.name.startswith("plant_") for o in content):
        errors.append("no plant_* in Gallery_Content")


def check_effects(errors):
    dome = bpy.data.objects.get("env_sky_dome")
    if not dome or dome.name not in bpy.data.collections["Environment"].objects:
        errors.append("env_sky_dome not in Environment")
    else:
        imgs = [n.image.name for s in dome.material_slots if s.material
                for n in s.material.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
        if "tex_sky_dome_color" not in imgs:
            errors.append(f"env_sky_dome images {imgs}, want tex_sky_dome_color")
        want = {"visible_camera": True, "visible_transmission": True, "visible_shadow": False,
                "visible_diffuse": False, "visible_glossy": False, "visible_volume_scatter": False}
        bad = {k: getattr(dome, k) for k, v in want.items() if getattr(dome, k) != v}
        if bad:   # a dome that casts shadows blocks the sun
            errors.append(f"env_sky_dome ray visibility wrong: {bad}")
    atm = bpy.data.collections["Atmosphere"].objects
    errors += [f"{o.name} in Atmosphere lacks atmos_ prefix" for o in atm if not o.name.startswith("atmos_")]
    box = bpy.data.objects.get("atmos_volume_box")
    vol = box and next((n for s in box.material_slots if s.material
                        for n in s.material.node_tree.nodes if n.type == "PRINCIPLED_VOLUME"), None)
    if not vol or vol.inputs["Density"].default_value > 0.003:
        errors.append("atmos_volume_box missing or Principled Volume density > 0.003")
    dust = bpy.data.objects.get("atmos_dust_motes")
    gn = dust and next((m for m in dust.modifiers if m.type == "NODES"), None)
    if not gn:
        errors.append("atmos_dust_motes missing or has no Geometry Nodes modifier")
    else:
        dg = bpy.context.evaluated_depsgraph_get()
        n = sum(1 for i in dg.object_instances if i.is_instance and i.parent and i.parent.original == dust)
        if n > 3000:
            errors.append(f"atmos_dust_motes has {n} instances > 3000")


CAMERAS = ["CAM_main_hall", "CAM_entrance", "CAM_artwork_detail"]


def check_cameras(errors):
    import math
    sc = bpy.context.scene
    cams = bpy.data.collections["Cameras"].objects
    for n in CAMERAS:
        c = cams.get(n)
        if not c or c.type != "CAMERA":
            errors.append(f"{n} missing from Cameras")
            continue
        pitch, roll = (math.degrees(a) for a in c.matrix_world.to_euler("XYZ")[:2])
        if abs(pitch - 90) > 1 or abs(roll) > 1:   # level horizon, verticals straight (Hokkaido convention)
            errors.append(f"{n} pitch {pitch:.1f} roll {roll:.1f}, want 90 / 0")
    if not sc.camera or sc.camera.name != "CAM_main_hall":
        errors.append(f"scene camera {sc.camera and sc.camera.name}, want CAM_main_hall")
    main, hero = cams.get("CAM_main_hall"), bpy.data.objects.get("art_01_hero_frame")
    if main and hero:
        dg = bpy.context.evaluated_depsgraph_get()
        o = main.matrix_world.translation
        target = hero.matrix_world @ (sum((v.co for v in hero.data.vertices), hero.data.vertices[0].co * 0)
                                      / len(hero.data.vertices))
        d = (target - o).normalized()
        while True:   # atmos_* volumes are not opaque surfaces, so look through them
            hit, loc, _, _, obj, _ = sc.ray_cast(dg, o, d)
            if not (hit and obj.name.startswith("atmos_")):
                break
            o = loc + d * 1e-3
        if not hit or obj.name != "art_01_hero_frame":
            errors.append(f"CAM_main_hall -> hero ray hits {obj.name if hit else None}, want art_01_hero_frame")
    r = sc.render
    if (r.resolution_x, r.resolution_y, r.resolution_percentage, sc.cycles.samples) != (1920, 1080, 100, 384):
        errors.append(f"stills settings {r.resolution_x}x{r.resolution_y} {r.resolution_percentage}% "
                      f"{sc.cycles.samples} spp, want 1920x1080 100% 384")


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
