# v08 -> v09 (user review of the web build, 2026-11-12). Run from the repo root:
#   blender -b galleries/brooklyn/blend/BROOKLYN_v08.blend --python-exit-code 1 -P galleries/brooklyn/make_v09.py
# 1. Track heads: the GLB heads are wedges with a lens sliver on a slanted face; swivelled, the lens read as a glowing card
#    floating beside the head. Each head is replaced by a plain cylinder spotlight (black housing, round lens) hanging from
#    the existing stem, pointing exactly where its spot points. Lights move to the new lens.
# 2. light_spot_16 aims at the back of partition 3 (Burgundy Rain) instead of the end wall.
# 3. Corridor bench frame and sprinklers: flat faces dissolved (web weight; same look).
import math, os
import bpy, bmesh
from mathutils import Vector, Matrix

OUT = bpy.path.abspath("//BROOKLYN_v09.blend")
HEAD = {"r": 0.055, "len": 0.17, "lens_r": 0.04, "drop": 0.12, "yoke_r": 0.012}

# --- 2. re-aim spot 16 (before the heads are built from the spot directions)
s16 = bpy.data.objects["light_spot_16"]
s16.rotation_euler = (Vector((0.6, -16.95, 1.45)) - s16.matrix_world.translation).to_track_quat("-Z", "Y").to_euler()
bpy.context.view_layer.update()

# --- 1. heads
fx = bpy.data.objects["gallery_spot_fixtures"]
slot = {s.material.name: i for i, s in enumerate(fx.material_slots) if s.material}
LENS, BODY = slot["lamp_emissive"], slot["metal_black_satin"]
mw = fx.matrix_world.copy()
bm = bmesh.new(); bm.from_mesh(fx.data); bm.transform(mw)
bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0005)
bm.verts.ensure_lookup_table()
seen, islands = set(), []
for v in bm.verts:
    if v.index in seen:
        continue
    st, comp = [v], []
    while st:
        x = st.pop()
        if x.index in seen:
            continue
        seen.add(x.index); comp.append(x)
        st += [e.other_vert(x) for e in x.link_edges]
    lo = Vector([min(c.co[i] for c in comp) for i in range(3)]); hi = Vector([max(c.co[i] for c in comp) for i in range(3)])
    lens = [f for c in comp for f in c.link_faces if f.material_index == LENS]
    islands.append({"verts": comp, "lo": lo, "hi": hi, "c": (lo + hi) / 2, "size": max(hi - lo),
                    "lens_c": sum((f.calc_center_median() for f in lens), Vector()) / len(lens) if lens else None})
RAIL_Z = min(i["lo"].z for i in islands if i["size"] > 2.0)       # underside of the long track rails
heads = []
for i in [i for i in islands if i["lens_c"] is not None]:
    lc = i["lens_c"]
    # a head = every small island around its lens: wedge housing, lens sliver, stem (the long rails stay)
    parts = [j for j in islands if j["size"] < 0.45 and (j["c"].xy - lc.xy).length < 0.35]
    heads.append({"verts": [v for j in parts for v in j["verts"]], "lens_c": lc, "pivot": Vector((lc.x, lc.y, RAIL_Z))})
spots = [o for o in bpy.data.collections["Lighting"].objects if o.name.startswith("light_spot_")]
assert len(heads) == len(spots) == 17, (len(heads), len(spots))
pairs = []
for s in spots:
    p = s.matrix_world.translation
    h = min(heads, key=lambda h: (h["lens_c"] - p).length)
    assert (h["lens_c"] - p).length < 0.2, s.name
    pairs.append((s, h))
bmesh.ops.delete(bm, geom=list({v for h in heads for v in h["verts"]}), context="VERTS")

def cylinder(center, axis, r, length, mat, segs=24):
    g = bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs, radius1=r, radius2=r, depth=length)
    rot = axis.to_track_quat("Z", "Y").to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation(center) @ rot, verts=g["verts"])
    faces = {f for v in g["verts"] for f in v.link_faces}
    for f in faces:
        f.material_index = mat
        f.smooth = abs(f.normal.dot(axis)) < 0.5            # round housing, flat caps
    return faces

for s, h in pairs:
    d = (s.matrix_world.to_3x3() @ Vector((0, 0, -1))).normalized()
    body_c = h["pivot"] + Vector((0, 0, -HEAD["drop"])) + d * 0.03
    cylinder(h["pivot"] + Vector((0, 0, -HEAD["drop"] / 2)), Vector((0, 0, 1)), HEAD["yoke_r"], HEAD["drop"], BODY, 12)
    cylinder(body_c, d, HEAD["r"], HEAD["len"], BODY)
    lens_c = body_c + d * (HEAD["len"] / 2 + 0.002)
    g = bmesh.ops.create_circle(bm, cap_ends=True, cap_tris=False, segments=24, radius=HEAD["lens_r"])   # one disc facing out
    bmesh.ops.transform(bm, matrix=Matrix.Translation(lens_c) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4(), verts=g["verts"])
    for f in {f for v in g["verts"] for f in v.link_faces}:
        f.normal_update()
        if f.normal.dot(d) < 0:
            f.normal_flip()
        f.material_index = LENS
    s.location = lens_c + d * 0.015

bm.normal_update()
bm.transform(mw.inverted()); bm.to_mesh(fx.data); bm.free(); fx.data.update()
sc = bpy.context.scene
sc["spot_heads"] = 17

# --- 3. dissolve flat faces (web weight)
for n in ("corridor_bench_frame", "gallery_sprinklers"):
    o = bpy.data.objects[n]
    m = o.modifiers.new("dissolve", "DECIMATE"); m.decimate_type = "DISSOLVE"; m.angle_limit = math.radians(5)
    with bpy.context.temp_override(object=o, active_object=o):
        bpy.ops.object.modifier_apply(modifier="dissolve")
    print("DISSOLVE", n, len(o.data.polygons))

bpy.ops.wm.save_as_mainfile(filepath=OUT, compress=True, relative_remap=True)
print("SAVED", OUT)
