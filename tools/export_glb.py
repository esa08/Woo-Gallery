# Export the gallery geometry (run on WOOD-GALLERY_web.blend after baking so UV2 is included).
#   WG_GALLERY=hokkaido [WG_VARIANT=empty] blender -b galleries/hokkaido/blend/WOOD-GALLERY_web.blend -P tools/export_glb.py
# Removes lights, cameras, empties and atmosphere objects in memory only.
# The .blend is never saved, so the source file stays untouched.
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wg import gallery

g = gallery()   # open the matching blend: WOOD-GALLERY_web.blend (full) or WOOD-GALLERY_empty.blend (empty)

DROP_TYPES = {"LIGHT", "CAMERA", "EMPTY"}
for ob in list(bpy.data.objects):
    if ob.type in DROP_TYPES or ob.name.startswith("atmos_"):
        bpy.data.objects.remove(ob, do_unlink=True)

os.makedirs(g.build, exist_ok=True)
out = os.path.join(g.build, "gallery.raw.glb")   # tools/optimize.mjs makes the shipped one
bpy.ops.export_scene.gltf(
    filepath=out,
    export_format="GLB",
    use_renderable=True,       # skip objects disabled for render
    export_apply=True,         # bake bevel / smooth-by-angle modifiers into the mesh
    export_lights=False,
    export_cameras=False,
    export_animations=False,
    export_yup=True,
)
print("EXPORTED", out)
