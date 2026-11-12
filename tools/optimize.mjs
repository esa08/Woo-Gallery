// Build step: build/<variant>/gallery.raw.glb + lightmaps/*.png  ->  <variant>/assets/gallery.glb + lightmaps/*.webp
//   cd tools && npm install && WG_GALLERY=hokkaido [WG_VARIANT=empty] node optimize.mjs
// Full order (repo root; same commands as WEB_GALLERY.md section 3):
//   1.  WG_GALLERY=hokkaido blender -b galleries/hokkaido/blend/WOOD-GALLERY_v10_video.blend -P tools/bake_lightmaps.py -- --samples 768 [--albedo]   (writes WOOD-GALLERY_web.blend + build/full/lightmaps)
//       (later additions: blender -b galleries/hokkaido/blend/WOOD-GALLERY_web.blend ... -- --in-place --only a,b)
//   2.  WG_GALLERY=hokkaido blender -b galleries/hokkaido/blend/WOOD-GALLERY_web.blend -P tools/export_glb.py   (writes build/full/gallery.raw.glb)
//   2b. WG_GALLERY=hokkaido blender -b galleries/hokkaido/blend/WOOD-GALLERY_v10_video.blend -P tools/render_env.py   (writes build/full/env/hall.hdr)
//   3.  cd tools && WG_GALLERY=hokkaido node optimize.mjs   (this file)
// Empty order (gallery without paintings):
//   1.  WG_GALLERY=hokkaido blender -b --python-exit-code 1 galleries/hokkaido/blend/WOOD-GALLERY_v10_video.blend -P tools/make_empty.py   (writes build/empty/empty_src.blend)
//   2.  WG_GALLERY=hokkaido WG_VARIANT=empty blender -b galleries/hokkaido/build/empty/empty_src.blend -P tools/bake_lightmaps.py -- --samples 768 --albedo
//   3.  WG_GALLERY=hokkaido WG_VARIANT=empty blender -b galleries/hokkaido/blend/WOOD-GALLERY_empty.blend -P tools/render_env.py
//   4.  WG_GALLERY=hokkaido WG_VARIANT=empty blender -b galleries/hokkaido/blend/WOOD-GALLERY_empty.blend -P tools/export_glb.py
//   5.  cd tools && WG_GALLERY=hokkaido WG_VARIANT=empty node optimize.mjs
// Deploy galleries/<name>/<variant>/ (assets/ + index.html) only.
// Everything shipped to the browser comes out of here; the raw Blender output stays in build/.
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { gallery } from "./wg.mjs";

const g = gallery();
const BUILD = g.build;
const RAW = path.join(BUILD, "gallery.raw.glb");
const LM_IN = path.join(BUILD, "lightmaps");
const OUT = g.assets;
const LM_OUT = path.join(OUT, "lightmaps");
fs.mkdirSync(LM_OUT, { recursive: true });

const mb = (f) => (fs.statSync(f).size / 1e6).toFixed(2) + " MB";

// ---- GLB ----
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(RAW);

// Lighting is baked into lightmaps and played back by a uniform light, so these maps change nothing on screen:
// the art "normal" map is the colour image itself (Blender bump-from-luminance export artefact) and the
// roughness map only feeds specular. Dropping them halves the art cost and removes a wrong normal.
for (const m of doc.getRoot().listMaterials()) {
  if (/^art_\d/.test(m.getName())) {
    m.setNormalTexture(null).setMetallicRoughnessTexture(null).setRoughnessFactor(0.55).setMetallicFactor(0);
  }
}

// Drop textures nothing references any more. Not using @gltf-transform/functions prune(): importing that package loads a
// second libvips through ndarray-pixels and sharp then fails with "colourspace: parameter space not set".
for (const tex of doc.getRoot().listTextures()) {
  if (tex.listParents().every((p) => p.propertyType === "Root")) tex.dispose();
}

// WebP for every texture (EXT_texture_webp, supported by Babylon's loader and every current browser).
doc.createExtension(EXTTextureWebP).setRequired(true);
for (const tex of doc.getRoot().listTextures()) {
  let img = sharp(Buffer.from(tex.getImage()));
  const sky = tex.getName() === "tex_sky_dome_color";          // only seen through the windows: 3840x2160 (44 MB VRAM) -> fit 2048
  if (sky) img = img.resize(2048, 2048, { fit: "inside" });
  let out;
  try {
    out = await img.webp({ quality: sky ? 85 : 90 }).toBuffer();   // 90: also fine for the few normal maps
  } catch (e) {
    const m = await sharp(Buffer.from(tex.getImage())).metadata().catch(() => ({}));
    throw new Error(`texture "${tex.getName()}" ${tex.getMimeType()} ${m.width}x${m.height} ${m.space}/${m.channels}ch: ${e.message}`);
  }
  tex.setImage(new Uint8Array(out)).setMimeType("image/webp");
}
const glb = path.join(OUT, "gallery.glb");
await io.write(glb, doc);
console.log("gallery.glb", mb(RAW), "->", mb(glb));

// ---- environment probe (render_env.py): plain copy, Radiance HDR is already RLE-compressed (1024x512 = 1.6 MB) ----
fs.mkdirSync(path.join(OUT, "env"), { recursive: true });
fs.copyFileSync(path.join(BUILD, "env/hall.hdr"), path.join(OUT, "env/hall.hdr"));

// ---- lightmaps (sRGB 8-bit, linear/scale encoded by bake_lightmaps.py) ----
const manifest = JSON.parse(fs.readFileSync(path.join(LM_IN, "manifest.json"), "utf8"));
let before = 0, after = 0;
const toWebp = async (srcName, quality) => {
  const src = path.join(LM_IN, srcName + ".png");
  const dst = path.join(LM_OUT, srcName + ".webp");
  await sharp(src).webp({ quality, smartSubsample: true }).toFile(dst);
  before += fs.statSync(src).size; after += fs.statSync(dst).size;
  return "lightmaps/" + srcName + ".webp";
};
for (const [name, info] of Object.entries(manifest)) {
  // quality 95: smooth gradients (spot cone edges) show banding at lower values. effort > 4 crashes sharp 0.34 on PNG input
  if (info.file) info.file = await toWebp(name, 95);
  if (info.albedo) info.albedo = await toWebp(name + "_albedo", 92);
}
fs.writeFileSync(path.join(LM_OUT, "manifest.json"), JSON.stringify(manifest, null, 2));
console.log("lightmaps", (before / 1e6).toFixed(2), "MB ->", (after / 1e6).toFixed(2), "MB");

// ---- painting normal maps (bake_art_normals.py): plain PNG -> WebP, loaded by main.js only when Glare is switched on ----
const NORMALS_IN = path.join(BUILD, "normals");
if (fs.existsSync(NORMALS_IN)) {
  const NORMALS_OUT = path.join(OUT, "normals");
  fs.mkdirSync(NORMALS_OUT, { recursive: true });
  let nb = 0, na = 0;
  for (const f of fs.readdirSync(NORMALS_IN).filter((f) => f.endsWith(".png"))) {
    const dst = path.join(NORMALS_OUT, f.replace(/\.png$/, ".webp"));
    await sharp(path.join(NORMALS_IN, f)).webp({ quality: 90 }).toFile(dst);   // 90 like the other normal maps; lower shows blocks in the flat areas
    nb += fs.statSync(path.join(NORMALS_IN, f)).size; na += fs.statSync(dst).size;
  }
  console.log("normals", (nb / 1e6).toFixed(2), "MB ->", (na / 1e6).toFixed(2), "MB");
}
