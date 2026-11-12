// Assemble the GitHub Pages site: shared/ + per gallery (gallery.json, its runtime files, thumb, variant folders that have
// an index.html) + a generated gallery picker at the root. Built-in modules only (CI does not npm install).
//   node tools/build_site.mjs <outDir>          (CI: _site; locally then: npx serve <outDir>)
// blend/, art/, build/, renders/ never ship: only the listed files and the variant folders are copied.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const GALLERY_FILES = ["gallery.json", "main.js", "route.js", "thumb.webp"];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function buildSite(root, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.cpSync(path.join(root, "shared"), path.join(outDir, "shared"), { recursive: true });
  const galleries = [];
  const gdir = path.join(root, "galleries");
  for (const name of fs.readdirSync(gdir).sort()) {
    const src = path.join(gdir, name), dst = path.join(outDir, "galleries", name);
    if (!fs.existsSync(path.join(src, "gallery.json"))) continue;
    fs.mkdirSync(dst, { recursive: true });
    for (const f of GALLERY_FILES) if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
    for (const v of fs.readdirSync(src, { withFileTypes: true })) {
      if (v.isDirectory() && fs.existsSync(path.join(src, v.name, "index.html"))) {
        fs.cpSync(path.join(src, v.name), path.join(dst, v.name), { recursive: true });
      }
    }
    if (!fs.existsSync(path.join(src, "full", "index.html"))) continue;   // mid-build gallery: deployed, but no card yet
    const { title = name } = JSON.parse(fs.readFileSync(path.join(src, "gallery.json"), "utf8"));
    galleries.push({ name, title, href: `galleries/${name}/full/`,
      thumb: fs.existsSync(path.join(src, "thumb.webp")) ? `galleries/${name}/thumb.webp` : null });
  }
  fs.writeFileSync(path.join(outDir, "index.html"), pickerHtml(galleries));
  return { galleries };
}

function pickerHtml(galleries) {
  const cards = galleries.map((g) => `    <a class="card" href="${esc(g.href)}">
      ${g.thumb ? `<img src="${esc(g.thumb)}" alt="" loading="lazy" width="640" height="360">` : `<span class="noimg"></span>`}
      <span class="name">${esc(g.title)}</span>
      <span class="go">Masuk &rarr;</span>
    </a>`).join("\n");
  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Woo Gallery</title>
<style>
  :root { --bg:#f4f1ec; --card:#fff; --fg:#222; --muted:#7a7268; --accent:#b8743a; --shadow:0 1px 4px rgba(0,0,0,.12); color-scheme: light; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0d0b09; --card:#1a1612; --fg:#e8e0d4; --muted:#8c8274; --accent:#d9a066; --shadow:0 1px 4px rgba(0,0,0,.5); color-scheme: dark; }
  }
  body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, "Segoe UI", sans-serif; }
  main { max-width:1100px; margin:0 auto; padding:40px 16px 56px; }
  h1 { font:600 22px/1.2 Georgia, serif; letter-spacing:.1em; text-transform:uppercase; margin:0 0 24px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px; }
  @media (max-width: 640px) { .grid { grid-template-columns:1fr; } h1 { margin-bottom:16px; } }
  .card { display:flex; flex-direction:column; background:var(--card); box-shadow:var(--shadow); color:inherit; text-decoration:none;
          border-radius:4px; overflow:hidden; transition:transform .15s; }
  .card:hover { transform:translateY(-2px); }
  .card:focus-visible { outline:3px solid var(--accent); outline-offset:3px; }
  .card img, .noimg { display:block; width:100%; height:auto; aspect-ratio:16/9; object-fit:cover; background:var(--muted); }
  .name { padding:12px 14px 0; font-weight:600; font-size:17px; }
  .go { padding:2px 14px 14px; color:var(--muted); }
  .card:hover .go, .card:focus-visible .go { color:var(--accent); }
</style>
</head>
<body>
<main>
  <h1>Woo Gallery</h1>
  <nav class="grid" aria-label="Pilih gallery">
${cards}
  </nav>
</main>
</body>
</html>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = process.argv[2];
  if (!out) { console.error("usage: node tools/build_site.mjs <outDir>"); process.exit(1); }
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const { galleries } = buildSite(root, path.resolve(out));
  console.log(`site -> ${out}: ${galleries.map((g) => g.name).join(", ")}`);
}
