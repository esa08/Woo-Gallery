# Gallery without paintings: drop every art_* object (9 frames + labels + label text) from the source scene.
#   WG_GALLERY=hokkaido blender -b --python-exit-code 1 galleries/hokkaido/blend/WOOD-GALLERY_v10_video.blend -P tools/make_empty.py
# Then bake with WG_VARIANT=empty (see WEB_GALLERY.md §3). The source .blend is never saved.
import bpy, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wg import gallery

g = gallery("empty")
gone = [o.name for o in bpy.data.objects if o.name.startswith("art_")]   # 9 frames + labels + label text
for n in gone: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
# bake source only; bake_lightmaps.py (WG_VARIANT=empty) saves the real copy as WOOD-GALLERY_empty.blend
os.makedirs(g.build, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(g.build, "empty_src.blend"))   # default relative_remap keeps the //../art paths valid from build/empty/
print("EMPTY removed", len(gone), gone)
