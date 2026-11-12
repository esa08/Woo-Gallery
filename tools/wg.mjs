// Resolves per-gallery paths from WG_GALLERY (required) / WG_VARIANT (full|empty, default full). Creates no folders.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");   // repo root

export function gallery(variant) {
  const name = process.env.WG_GALLERY;
  if (!name) throw new Error("WG_GALLERY is not set (e.g. WG_GALLERY=hokkaido)");
  variant = variant || process.env.WG_VARIANT || "full";
  const dir = path.join(ROOT, "galleries", name);
  const cfgPath = path.join(dir, "gallery.json");
  if (!fs.existsSync(cfgPath)) throw new Error(`WG_GALLERY=${name}: ${cfgPath} not found`);
  const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  if (variant === "source" || !(variant in cfg.blend)) throw new Error(`WG_VARIANT=${variant}: not in ${cfgPath} blend (use full or empty)`);
  return { name, variant, dir, cfg, build: path.join(dir, "build", variant), assets: path.join(dir, variant, "assets") };
}
