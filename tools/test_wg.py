# Run: blender -b --factory-startup --python-exit-code 1 -P tools/test_wg.py
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wg import gallery

os.environ["WG_GALLERY"] = "hokkaido"; os.environ.pop("WG_VARIANT", None)
g = gallery()
assert g.variant == "full"
assert g.build.endswith(os.path.join("galleries", "hokkaido", "build", "full"))
assert g.assets.endswith(os.path.join("galleries", "hokkaido", "full", "assets"))
assert g.blend.endswith("WOOD-GALLERY_web.blend") and os.path.exists(g.blend)
assert g.source.endswith("WOOD-GALLERY_v10_video.blend") and os.path.exists(g.source)
assert gallery("empty").blend.endswith("WOOD-GALLERY_empty.blend")
assert g.cfg["runtime"]["env"]["probe"] == [0, -14.66, 3.86]
for env, var in [({"WG_GALLERY": ""}, None), ({"WG_GALLERY": "hokaido"}, None), ({"WG_GALLERY": "hokkaido"}, "nope")]:
    os.environ.update(env)
    try: gallery(var); raise AssertionError(f"no error for {env} {var}")
    except SystemExit: pass
print("WG OK")
