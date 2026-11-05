# Export the gallery geometry (run on WOOD-GALLERY_web.blend after baking so UV2 is included).
#   blender -b WOOD-GALLERY_v10_video.blend -P web/tools/export_glb.py
# Removes lights, cameras, empties and atmosphere objects in memory only.
# The .blend is never saved, so the source file stays untouched.
import bpy

DROP_TYPES = {"LIGHT", "CAMERA", "EMPTY"}
for ob in list(bpy.data.objects):
    if ob.type in DROP_TYPES or ob.name.startswith("atmos_"):
        bpy.data.objects.remove(ob, do_unlink=True)

out = bpy.path.abspath("//build/gallery.raw.glb")  # "//" = folder of the .blend; web/tools/optimize.mjs makes the shipped one
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
