# Resolves per-gallery paths from WG_GALLERY (required) / WG_VARIANT (full|empty, default full). Creates no folders.
import json, os, types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # repo root


def gallery(variant=None):
    name = os.environ.get("WG_GALLERY")
    if not name:
        raise SystemExit("WG_GALLERY is not set (e.g. WG_GALLERY=hokkaido)")
    variant = variant or os.environ.get("WG_VARIANT") or "full"
    d = os.path.join(ROOT, "galleries", name)
    cfg_path = os.path.join(d, "gallery.json")
    if not os.path.isfile(cfg_path):
        raise SystemExit(f"WG_GALLERY={name}: {cfg_path} not found")
    with open(cfg_path, encoding="utf-8") as f:
        cfg = json.load(f)
    if variant not in cfg["blend"] or variant == "source":
        raise SystemExit(f"WG_VARIANT={variant}: not in {cfg_path} blend (use full or empty)")
    return types.SimpleNamespace(
        name=name, variant=variant, dir=d, cfg=cfg,
        build=os.path.join(d, "build", variant),
        assets=os.path.join(d, variant, "assets"),
        blend=os.path.join(d, cfg["blend"][variant]),
        source=os.path.join(d, cfg["blend"]["source"]),
    )
