# Render an equirectangular HDR probe from the middle of the hall, used by Babylon as the reflection / ambient environment.
#   WG_GALLERY=hokkaido [WG_VARIANT=empty] blender -b galleries/hokkaido/blend/WOOD-GALLERY_v10_video.blend -P tools/render_env.py
# Output: galleries/<name>/build/<variant>/env/hall.hdr (Radiance RGBE, linear scene values: windows and lamps stay > 1, which is what reflections need).
# Source file is never saved. Atmosphere (volume + dust motes) is removed in memory: dust specks would become bright
# dots in every reflection. The compositor (Glare) is disabled so the file holds raw radiance.
import bpy, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wg import gallery

g = gallery()
OUT = os.path.join(g.build, "env"); os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene

for ob in list(bpy.data.objects):
    if ob.name.startswith("atmos_") or ob.type == "CAMERA":
        bpy.data.objects.remove(ob, do_unlink=True)

# Probe at the centre of the hall volume (x 0, y -14.66 = middle of -6.66..-22.66, z 3.86 = middle of 0..7.72):
# Babylon's box projection assumes the probe sits at the box centre.
PROBE = tuple(g.cfg["runtime"]["env"]["probe"])
cd = bpy.data.cameras.new("ENV_probe")
cd.type = "PANO"
if hasattr(cd, "panorama_type"): cd.panorama_type = "EQUIRECTANGULAR"
else: cd.cycles.panorama_type = "EQUIRECTANGULAR"
cd.clip_start = 0.01; cd.clip_end = 200
cam = bpy.data.objects.new("ENV_probe", cd); sc.collection.objects.link(cam)
cam.location = PROBE
cam.rotation_euler = (math.radians(90), 0, math.radians(180))     # looks toward -Y (the hero painting), Z up
sc.camera = cam

sc.render.engine = "CYCLES"
sc.render.resolution_x = 1024; sc.render.resolution_y = 512; sc.render.resolution_percentage = 100
sc.render.use_compositing = False
sc.cycles.samples = 512
sc.cycles.use_denoising = True
sc.cycles.use_adaptive_sampling = True
sc.cycles.adaptive_threshold = 0.005
sc.cycles.sample_clamp_indirect = 20          # keeps fireflies out of the reflections but leaves lamps bright
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"; prefs.get_devices()
for d in prefs.devices: d.use = d.type == "OPTIX"
sc.cycles.device = "GPU"

sc.render.image_settings.file_format = "HDR"
sc.render.filepath = os.path.join(OUT, "hall.hdr")
sc.frame_set(1)
bpy.ops.render.render(write_still=True)
print("ENV rendered", sc.render.filepath, os.path.getsize(sc.render.filepath) // 1024, "KB")
