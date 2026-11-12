# blender -b galleries/brooklyn/blend/BROOKLYN_vNN.blend -P galleries/brooklyn/render_still.py -- <CAM_name> <out.png>
import sys
import bpy

cam, out = sys.argv[sys.argv.index("--") + 1:][:2]
sc = bpy.context.scene
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
sc.cycles.device = "GPU"
sc.camera = bpy.data.objects[cam]
sc.render.image_settings.file_format = "PNG"
sc.render.image_settings.color_depth = "16"
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
