# Copy objects that were added to the source scene into WOOD-GALLERY_web.blend (the derived copy keeps its lightmap UVs,
# so a full re-bake is not needed). Existing materials are reused by name. Lights go to "Lighting", the rest to "Gallery".
#   WG_GALLERY=hokkaido blender -b galleries/hokkaido/blend/WOOD-GALLERY_web.blend -P tools/sync_objects.py -- a,b,c
# Objects that already exist in the web copy are skipped. Saves the web copy.
import bpy, sys, os, re
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wg import gallery

names = (sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "").split(",")
SRC = gallery().source

with bpy.data.libraries.load(SRC, link=False) as (src, dst):
    dst.objects = [n for n in names if n in src.objects and n not in bpy.data.objects]

for ob in dst.objects:
    col = bpy.data.collections.get("Lighting" if ob.type == "LIGHT" else "Gallery") or bpy.context.scene.collection
    col.objects.link(ob)
    if ob.type == "MESH":                                  # appended materials come as "name.001": point back to the originals
        for i, m in enumerate(ob.data.materials):
            orig = bpy.data.materials.get(re.sub(r"\.\d{3}$", "", m.name)) if m else None
            if orig and orig != m:
                ob.data.materials[i] = orig
    print("SYNC added", ob.name)
for m in [m for m in bpy.data.materials if m.users == 0]:
    bpy.data.materials.remove(m)
bpy.ops.wm.save_mainfile()
