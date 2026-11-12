# Gallery without paintings: drop every art_* object (9 frames + labels + label text) from the source scene.
#   blender -b --python-exit-code 1 WOOD-GALLERY_v10_video.blend -P web/tools/make_empty.py
# Then bake with WG_VARIANT=empty (see WEB_GALLERY.md §3). The source .blend is never saved.
import bpy
gone = [o.name for o in bpy.data.objects if o.name.startswith("art_")]   # 9 frames + labels + label text
for n in gone: bpy.data.objects.remove(bpy.data.objects[n], do_unlink=True)
bpy.ops.outliner.orphans_purge(do_recursive=True)
# bake source only; bake_lightmaps.py (WG_VARIANT=empty) saves the real copy as WOOD-GALLERY_empty.blend
bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath("//build-empty/empty_src.blend"))
print("EMPTY removed", len(gone), gone)
