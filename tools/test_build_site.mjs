// node --test tools/test_build_site.mjs
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildSite } from "./build_site.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "wg-site-"));
const walkDirs = (d) => fs.readdirSync(d, { withFileTypes: true }).filter((e) => e.isDirectory())
  .flatMap((e) => [e.name, ...walkDirs(path.join(d, e.name))]);

test("cards", () => {
  const out = tmp(), r = buildSite(ROOT, out);
  assert.deepEqual(r.galleries.map((g) => [g.name, g.title, g.href]),
    [["brooklyn", "Brooklyn", "galleries/brooklyn/full/"], ["hokkaido", "Wood Gallery", "galleries/hokkaido/full/"]]);
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  for (const s of ["Brooklyn", "Wood Gallery", 'href="galleries/brooklyn/full/"', 'href="galleries/hokkaido/full/"']) assert.ok(html.includes(s), s);
  assert.equal((html.match(/<a /g) || []).length, 2);
});

test("hokkaido intact", () => {
  const out = tmp();
  buildSite(ROOT, out);
  for (const f of ["galleries/hokkaido/full/index.html", "galleries/hokkaido/empty/index.html", "shared/main.js", "galleries/hokkaido/gallery.json"]) {
    assert.ok(fs.existsSync(path.join(out, f)), f);
  }
  for (const d of walkDirs(out)) assert.ok(!["blend", "build", "renders", "art"].includes(d), `copied ${d}/`);
});

test("brooklyn runtime copied", () => {
  const out = tmp();
  buildSite(ROOT, out);
  for (const f of ["main.js", "route.js", "gallery.json", "full/index.html"]) assert.ok(fs.existsSync(path.join(out, "galleries/brooklyn", f)), f);
});

test("incomplete gallery", () => {
  const root = tmp(), out = tmp();
  fs.mkdirSync(path.join(root, "shared"));
  fs.writeFileSync(path.join(root, "shared/main.js"), "");
  const g = (name, title, withFull) => {
    fs.mkdirSync(path.join(root, "galleries", name, withFull ? "full" : ""), { recursive: true });
    fs.writeFileSync(path.join(root, "galleries", name, "gallery.json"), JSON.stringify({ title }));
    if (withFull) fs.writeFileSync(path.join(root, "galleries", name, "full/index.html"), "<!doctype html>");
  };
  g("alpha", "Alpha", false);                   // mid-build: no full/ -> no card
  g("beta", "Beta", true);                      // no thumb.webp -> card without image
  const r = buildSite(root, out);
  assert.deepEqual(r.galleries.map((x) => [x.name, x.thumb]), [["beta", null]]);
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.ok(!html.includes("<img"), "no broken <img>");
  assert.ok(!html.includes("Alpha"));
});

test("theme and mobile", () => {
  const out = tmp();
  buildSite(ROOT, out);
  const html = fs.readFileSync(path.join(out, "index.html"), "utf8");
  assert.ok(html.includes("prefers-color-scheme"));
  assert.match(html, /@media \(max-width: *\d+px\)[^}]*\{[^}]*grid-template-columns: *1fr/);
});
