# Bake the paint relief of every painting to a tangent-space normal map: the Bump node in the Blender material (luminance of the
# painting as height, strength 0.6, distance 2 mm) does not survive the glTF export, so it is baked here.
#   WG_GALLERY=hokkaido blender -b galleries/hokkaido/blend/WOOD-GALLERY_v10_video.blend -P tools/bake_art_normals.py
# Nothing is saved: the temporary image nodes live only in this background session, the .blend is never touched.
# Output: galleries/<name>/build/<variant>/normals/<canvas material>.png (OpenGL / glTF convention: +X right, +Y up, 8-bit linear), same size as the painting.
# tools/optimize.mjs converts them to <variant>/assets/normals/*.webp; main.js loads them the first time Glare is switched on.
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wg import gallery

OUT = os.path.join(gallery().build, "normals")
os.makedirs(OUT, exist_ok=True)
SAMPLES = 16                                                  # bump is deterministic, samples only anti-alias the texel footprint

sc = bpy.context.scene
sc.render.engine = "CYCLES"
sc.cycles.device = "CPU"
sc.cycles.samples = SAMPLES
sc.cycles.use_denoising = False
b = sc.render.bake
b.normal_space = "TANGENT"
b.normal_r, b.normal_g, b.normal_b = "POS_X", "POS_Y", "POS_Z"
b.use_selected_to_active = False
b.use_clear = True
b.margin = 8
b.margin_type = "EXTEND"

report = {}
for ob in sorted(bpy.data.objects, key=lambda o: o.name):
    if ob.type != "MESH" or not (ob.name.startswith("art_") and ob.name.endswith("_frame")):
        continue
    slots = [s.material for s in ob.material_slots]
    canvas = next((m for m in slots if m and m.name.startswith("art_")), None)
    if not canvas:
        continue
    tex = next((n for n in canvas.node_tree.nodes if n.bl_idname == "ShaderNodeTexImage" and n.image), None)
    w, h = tex.image.size
    ob.data.uv_layers.active_index = 0                        # the painting UV (UV 2 is the lightmap)
    made = []                                                 # (material, node, image) to clean up
    for m in slots:
        if not m:
            continue
        size = (w, h) if m == canvas else (4, 4)              # every material needs an active image node to bake; the others get a dummy
        img = bpy.data.images.new("_nbake_" + m.name, size[0], size[1], alpha=False, float_buffer=False)
        img.colorspace_settings.name = "Non-Color"
        node = m.node_tree.nodes.new("ShaderNodeTexImage")
        node.image = img
        m.node_tree.nodes.active = node
        made.append((m, node, img))
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.bake(type="NORMAL")
    img = next(i for m, n, i in made if m == canvas)
    path = os.path.join(OUT, canvas.name + ".png")
    img.filepath_raw = path
    img.file_format = "PNG"
    img.save()
    px = list(img.pixels)
    n = len(px) // 4
    report[canvas.name] = {"size": [w, h], "mean_rgb": [round(sum(px[c::4]) / n, 3) for c in range(3)],
                           "min_rg": [round(min(px[c::4]), 3) for c in range(2)], "max_rg": [round(max(px[c::4]), 3) for c in range(2)]}
    for m, node, im in made:                                  # leave the session as we found it
        m.node_tree.nodes.remove(node)
        bpy.data.images.remove(im)
    print("NORMAL", canvas.name, report[canvas.name])
print("DONE", len(report), "normal maps ->", OUT)
