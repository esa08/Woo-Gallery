// Woo-Gallery walkthrough. Lighting = Cycles lightmaps (UV2) played back by one uniform light, reflections = an HDR probe
// rendered from the hall, plus bloom and dust. Build pipeline: see the header of web/tools/optimize.mjs.
"use strict";

const $ = (id) => document.getElementById(id);
const canvas = $("renderCanvas");
const engine = new BABYLON.Engine(canvas, true);
const scene = new BABYLON.Scene(engine);
scene.clearColor = new BABYLON.Color4(0.04, 0.035, 0.03, 1);
scene.skipPointerMovePicking = true;   // no picking in v1

window.addEventListener("resize", () => engine.resize());

// Meshes the camera must not walk through. Everything else stays non-colliding (ceiling, trims, fixtures).
const SOLID = [
  "gallery_floor", "gallery_walls", "gallery_window_glass", "gallery_door_window_frames",
  "bench_seat", "bench_leg_1", "bench_leg_2",
  "plinth_1", "plinth_2", "sculpture_marble", "sculpture_bronze_knot",
  "table_top", "table_leg_1", "table_leg_2", "table_leg_3", "table_leg_4", "plant_pot",
];

// Uniform light that "plays back" the lightmaps. Measured with a white lightmap + white albedo + tone mapping off:
// PBR diffuse comes out at 0.95-0.98 per unit intensity on wall, floor and ceiling (Burley/energy conservation), so 1/0.97.
const LM_LIGHT = 1.03;

// Reflection probe (render_env.py): rendered from the middle of the hall volume, so the projection box is centred on it.
const ENV = { probe: [0, -14.66, 3.86], box: [7, 7.72, 16] /* Babylon axes: x, up, along the hall */, rotationY: 0 };

// Gloss for lightmapped materials. Babylon multiplies EVERYTHING by the lightmap when useLightmapAsShadowmap is on
// (diffuse, IBL ambient, reflections). That is right for diffuse, wrong for reflections: a window reflected in the floor
// would be darkened by the floor's own light level. So just before the final composition: drop IBL ambient (the lightmap
// already has all diffuse light), drop direct specular from the uniform playback light, and divide the reflection by the
// lightmap so the later multiplication cancels out. Variables are from pbrBlockFinalLitComponents (v9.0.0 bundle).
// spec = true (paintings): keep direct specular, because setupLightPlay adds spec-only spot lights there. Same trick as the
// reflection: divide by the lightmap so the multiplication cancels, i.e. the highlight is not darkened by the baked light level.
class LightmapGloss extends BABYLON.MaterialPluginBase {
  constructor(material, spec = false) {
    super(material, "LightmapGloss", 200, { LMGLOSS: false, LMSPEC: false });
    this.spec = spec;
    this._enable(true);
  }
  prepareDefines(defines) { defines.LMGLOSS = true; defines.LMSPEC = this.spec; }
  getClassName() { return "LightmapGlossPlugin"; }
  isCompatible(shaderLanguage) { return shaderLanguage === BABYLON.ShaderLanguage.GLSL; }
  getCustomCode(shaderType) {
    if (shaderType !== "fragment") return null;
    return {
      CUSTOM_FRAGMENT_BEFORE_FINALCOLORCOMPOSITION: `
#if defined(LMGLOSS) && defined(LIGHTMAP) && defined(USELIGHTMAPASSHADOWMAP)
  vec3 lmInv = vec3(1.0) / max(lightmapColor.rgb, vec3(0.03));
  #ifdef REFLECTION
    finalIrradiance = vec3(0.0);
    finalRadianceScaled *= lmInv;
    #ifdef CLEARCOAT
      clearcoatOut.finalClearCoatRadianceScaled *= lmInv;
    #endif
  #endif
  #ifdef LMSPEC
    #ifdef SPECULARTERM
      finalSpecularScaled *= lmInv;
    #endif
    #ifdef CLEARCOAT
      finalClearCoatScaled *= lmInv;
    #endif
  #else
    #ifdef SPECULARTERM
      finalSpecularScaled = vec3(0.0);
    #endif
    #ifdef CLEARCOAT
      finalClearCoatScaled = vec3(0.0);
    #endif
  #endif
#endif`,
    };
  }
}

// Hall dust box in Blender coords (GALLERY_SCENE.md section 8).
const DUST = { x: [-3.2, 3.2], y: [-22.2, -6.9], z: [0.3, 6.6], count: 400 };

// Loading bar. The work is staged (GLB -> reflections -> lightmaps -> shader compile) and every stage reports in, because
// a GLB served with gzip has no Content-Length (lengthComputable = false) and the later stages block the main thread.
// After each update we give the browser one paint (setTimeout fallback: rAF is paused in background tabs).
const GLB_BYTES = 8.5e6;                                // size of assets/gallery.glb, only used when the server sends no length
const bar = $("bar").firstElementChild;
const setBar = (p, msg) => { bar.style.width = (Math.min(p, 1) * 100).toFixed(1) + "%"; if (msg) $("msg").textContent = msg; };
const paint = () => new Promise((res) => { const t = setTimeout(res, 50); requestAnimationFrame(() => { clearTimeout(t); res(); }); });
const step = async (p, msg) => { setBar(p, msg); await paint(); };

(async function main() {
  await step(0.02, "Downloading gallery…");
  const result = await BABYLON.ImportMeshAsync("assets/gallery.glb", scene, {
    onProgress: (e) => setBar(0.02 + 0.5 * Math.min(e.loaded / (e.lengthComputable ? e.total : GLB_BYTES), 1)),   // 2% .. 52%
  });
  await step(0.55, "Preparing scene…");
  const root = result.meshes[0];                        // "__root__": carries the glTF handedness flip
  root.computeWorldMatrix(true);
  // Blender (x, y, z, Z-up) -> glTF (x, z, -y) -> Babylon world through the root matrix. No guessing of axis flips.
  const bl = (x, y, z) => BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(x, z, -y), root.getWorldMatrix());

  prepareMeshes(result.meshes);
  prepareMaterials();
  await step(0.58, "Loading reflections…");
  const env = await setupEnvironment(bl);
  await step(0.68, "Loading lighting…");
  const baked = await applyLightmaps((f) => setBar(0.68 + 0.2 * f));   // 68% .. 88%
  const lights = setupLights(baked);
  const camera = setupCamera(bl);
  const pipeline = setupPipeline(camera);
  setupDust(bl);
  const focus = setupPaintingFocus(camera, result.meshes, bl);
  const play = setupLightPlay(bl, focus.art);
  const floorRefl = setupFloorReflection();
  const eye = setupEyeAdaptation(camera, pipeline);

  await step(0.9, "Compiling shaders…");
  await scene.whenReadyAsync();
  await step(1, "Ready");
  // Freeze after everything compiled once. Not freezeActiveMeshes: the camera moves, frozen culling would pop meshes.
  scene.materials.forEach((m) => m.freeze());
  result.meshes.forEach((m) => m.freezeWorldMatrix());

  // Music: browsers block autoplay, so it starts on the hint click. 3-min loop; M or the button mutes.
  const music = $("music"), muteBtn = $("mute");
  music.volume = 0.5;
  const toggleMute = () => { music.muted = !music.muted; muteBtn.textContent = "♫ Music: " + (music.muted ? "off" : "on"); };
  muteBtn.addEventListener("click", (e) => { toggleMute(); e.stopPropagation(); canvas.focus(); });
  addEventListener("keydown", (e) => { if (e.code === "KeyM") toggleMute(); });

  // Effect toggles: a button (right bottom) + a key. apply(on) must only change uniforms (materials are frozen).
  const toggle = (id, key, label, initial, apply) => {
    const btn = $(id);
    let on = initial;
    const show = () => { apply(on); btn.textContent = label + ": " + (on ? "on" : "off"); };
    const flip = () => { on = !on; show(); };
    show();
    btn.addEventListener("click", (e) => { flip(); e.stopPropagation(); canvas.focus(); });
    addEventListener("keydown", (e) => { if (e.code === key && !e.repeat) flip(); });
  };
  toggle("beams", "KeyB", "✦ Beams", BEAM.on, play.setBeams);                // light beams + motes: off by default
  toggle("glare", "KeyG", "✧ Glare", false, play.setGlare);                  // painting varnish highlight + relief: off by default
  toggle("floor", "KeyR", "◈ Floor reflection", true, floorRefl.set);        // realtime mirror in the floor

  engine.runRenderLoop(() => scene.render());
  $("loading").classList.add("hidden");
  $("hint").classList.remove("hidden");
  $("hint").addEventListener("click", () => { music.play().catch(() => {}); engine.enterPointerlock(); canvas.focus(); $("hint").classList.add("hidden"); });
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) $("hint").classList.remove("hidden");
  });

  // ponytail: one-shot resolution drop, no tiers. Add SceneOptimizer / quality tiers if this is not enough.
  setTimeout(() => { if (engine.getFps() < 40) engine.setHardwareScalingLevel(1.5); }, 6000);

  window.__g = { engine, scene, camera, pipeline, root, bl, baked, lights, env, focus, play, floorRefl, eye };   // handle for console checks
})().catch((err) => {
  console.error(err);
  $("msg").textContent = "Failed to load: " + err.message;
});

function prepareMeshes(meshes) {
  for (const m of meshes) {
    m.isPickable = false;
    // Multi-material meshes arrive split as "<name>_primitiveN"; strip the suffix to match.
    m.checkCollisions = SOLID.includes(baseName(m.name));
  }
  const sky = scene.getMeshByName("env_sky_dome");
  if (sky) {
    sky.material.backFaceCulling = false;               // camera sits inside the 75 m sphere
    sky.material.disableLighting = true;
    sky.applyFog = false;
  }
  scene.collisionsEnabled = true;
}

function prepareMaterials() {
  // Wall paint, oak and marble colours come from procedural nodes that the glTF export drops (colour falls back to white).
  // They are baked to albedo textures by bake_lightmaps.py --albedo and applied in applyLightmaps().

  // Transmission would render the whole scene again for refraction. Plain alpha for the prototype.
  const glass = scene.getMaterialByName("glass_gray_translucent");
  if (glass) {
    if (glass.subSurface) glass.subSurface.isRefractionEnabled = false;
    glass.alpha = 0.12;
    glass.transparencyMode = BABYLON.PBRMaterial.PBRMATERIAL_ALPHABLEND;
    glass.backFaceCulling = false;
    glass.useRadianceOverAlpha = true;                  // reflections stay visible on a mostly transparent pane
    glass.useSpecularOverAlpha = true;
  }
}

const baseName = (n) => n.replace(/_primitive\d+$/, "");   // multi-material meshes arrive as "<name>_primitiveN"

// Lightmaps carry lighting only (Cycles Diffuse, Direct+Indirect, no Color). Babylon PBR with
// useLightmapAsShadowmap computes (lights * albedo + ...) * lightmap, so a uniform white hemispheric light
// (see setupLights) turns that into albedo * baked lighting and keeps the 1K wood/plaster textures sharp.
async function applyLightmaps(onProgress = () => {}) {
  let manifest;
  try {
    const r = await fetch("assets/lightmaps/manifest.json");
    if (!r.ok) return [];
    manifest = await r.json();
  } catch (e) { return []; }
  const baked = [];
  const total = Object.values(manifest).reduce((n, i) => n + (i.file ? 1 : 0) + (i.albedo ? 1 : 0), 0);
  let loaded = 0;
  const loads = [];                                    // one promise per texture, so the loading bar can follow the downloads
  const load = (file) => {
    let done;
    loads.push(new Promise((res) => { done = () => { onProgress(++loaded / total); res(); }; }));
    return new BABYLON.Texture("assets/" + file, scene, { invertY: false, onLoad: done, onError: done });   // glTF UVs are top-left origin
  };
  for (const [name, info] of Object.entries(manifest)) {
    const tex = load(info.file);
    tex.coordinatesIndex = 1;                          // UV2 = TEXCOORD_1
    tex.level = info.scale;                            // image stores linear / scale
    let albedo = null;
    if (info.albedo) {
      albedo = load(info.albedo);
      albedo.coordinatesIndex = 1;                     // baked on the lightmap UV
    }
    for (const m of scene.meshes.filter((x) => baseName(x.name) === name)) {
      if (!m.isVerticesDataPresent(BABYLON.VertexBuffer.UV2Kind)) { console.warn("no UV2 on", m.name); continue; }
      // wood_laminate is shared by ceiling and trims: each needs its own lightmap
      if (m.material.getBindedMeshes().length > 1) m.material = m.material.clone(m.material.name + "_" + name);
      m.material.lightmapTexture = tex;
      m.material.useLightmapAsShadowmap = true;
      if (albedo) {                                    // colour that came from procedural nodes (wall dirt, oak grain, marble)
        m.material.albedoTexture = albedo;
        m.material.albedoColor = BABYLON.Color3.White();
      }
      new LightmapGloss(m.material, /^art_/.test(name)); // keeps IBL reflections out of the lightmap multiplication
      baked.push(m);
    }
  }
  await Promise.all(loads);
  return baked;
}

// HDR probe from the hall: reflections for everything, ambient for the few meshes that are not lightmapped
// (spot fixtures, pendants, labels, metal legs, bronze knot). Box projection pins reflections to the hall walls.
async function setupEnvironment(bl) {
  const env = new BABYLON.HDRCubeTexture("assets/env/hall.hdr", scene, 256, false, true, false, true);
  env.boundingBoxPosition = bl(...ENV.probe);
  env.boundingBoxSize = new BABYLON.Vector3(...ENV.box);
  env.rotationY = ENV.rotationY;
  scene.environmentTexture = env;
  scene.environmentIntensity = 1;
  await new Promise((res, rej) => { env.onLoadObservable.addOnce(res); setTimeout(() => res(), 8000); });
  return env;
}

// One uniform white light that plays the lightmaps back; nothing else is lit by lights (IBL covers the rest).
// Ground == sky colour, so it does not depend on the surface direction. Calibrated value: see LM_LIGHT.
function setupLights(baked) {
  const lm = new BABYLON.HemisphericLight("lmLight", new BABYLON.Vector3(0, 1, 0), scene);
  lm.diffuse = lm.groundColor = new BABYLON.Color3(1, 1, 1);
  lm.specular = new BABYLON.Color3(0, 0, 0);
  lm.intensity = LM_LIGHT;
  lm.includedOnlyMeshes = baked.slice();
  return { lm };
}

function setupCamera(bl) {
  const cam = new BABYLON.UniversalCamera("walk", bl(0, -7.4, 1.7), scene);   // = CAM_hero_hall: hall side of the partition, facing the hero painting
  cam.setTarget(bl(0, -22.66, 1.6));
  cam.fov = 0.8;                                        // ~24 mm lens on 16:9, same as the still cameras
  cam.minZ = 0.05;
  cam.maxZ = 120;                                       // sky dome radius ~37 m
  cam.speed = 0.1;                                      // measured: 0.4 -> 5.9 m/s at 60 fps, so 0.1 ~ 1.5 m/s (walking pace)
  cam.angularSensibility = 2500;
  cam.inertia = 0.8;
  // WASD walks, arrow keys turn the view. A key cannot do both: the keyboard input checks the move lists first, so
  // arrows must not stay in keysUp/Down/Left/Right or they would never rotate.
  cam.keysUp = [87]; cam.keysDown = [83];               // W / S
  cam.keysLeft = [65]; cam.keysRight = [68];            // A / D (strafe)
  cam.keysRotateLeft = [37]; cam.keysRotateRight = [39];   // left / right arrow: turn
  cam.keysRotateUp = [38]; cam.keysRotateDown = [40];      // up / down arrow: look up / down
  cam.inputs.attached.keyboard.rotationSpeed = 0.25;       // measured: default 0.5 = 143 deg/s, too fast; 0.25 ~ 72 deg/s
  cam.attachControl(canvas, true);

  scene.gravity = new BABYLON.Vector3(0, -9.81 / 60, 0);
  cam.applyGravity = true;
  cam.needMoveForGravity = true;                        // default false: gravity would only start after the first key press
  cam.checkCollisions = true;
  cam.ellipsoid = new BABYLON.Vector3(0.35, 0.8, 0.35); // eye sits at the top of the ellipsoid: settles at y = 1.608 (measured)
  return cam;
}

// Click a painting -> the camera glides to a spot in front of it, looking at its centre. Pointer lock hides the cursor, so
// the "cursor" is the screen centre (a dot, which grows over a painting). The glide does NOT use collisions: sliding along a
// wall dead-ends when the target is seen through a doorway at an angle. It follows a route instead: straight on the same side
// of the partition, through the nearest doorway when the painting is on the other side. Everything else in the gallery is
// below eye height (bench, plinths, table), so the camera passes over it.
const DOORS = [-2.0, 2.0];                               // Blender x of the two partition doorway centres (openings 1.3..2.7 m, ray cast)
function setupPaintingFocus(cam, meshes, bl) {
  const V = BABYLON.Vector3;
  const zEnt = bl(0, -5.0, 0).z, zDoor = bl(0, -6.4, 0).z, zHall = bl(0, -7.9, 0).z;   // gates ~1.2 m before / after the wall faces
  const zone = (p) => (p.z < bl(0, -6.0, 0).z ? 0 : p.z > bl(0, -6.8, 0).z ? 2 : 1);  // 0 entrance, 1 inside the partition, 2 hall
  function route(from, end) {
    const a = zone(from), b = zone(end);
    if (a === b) return [from, end];
    const dx = DOORS.map((d) => bl(d, 0, 0).x).reduce((best, x) => (Math.abs(from.x - x) + Math.abs(end.x - x) < Math.abs(from.x - best) + Math.abs(end.x - best) ? x : best));
    const gates = [zEnt, zDoor, zHall].map((z) => new V(dx, from.y, z));
    const idx = a < b ? [a === 0 ? 0 : 1, b] : [a === 2 ? 2 : 1, b === 0 ? 0 : 1];
    const nodes = [];
    for (let i = idx[0]; i !== idx[1]; i += a < b ? 1 : -1) nodes.push(gates[i]);
    nodes.push(gates[idx[1]]);
    return [from, ...nodes, end];
  }
  function smooth(pts) {                                 // Chaikin corner cutting, end points stay
    for (let k = 0; k < 2; k++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) {
        out.push(V.Lerp(pts[i], pts[i + 1], 0.25), V.Lerp(pts[i], pts[i + 1], 0.75));
      }
      out.push(pts[pts.length - 1]);
      pts = out;
    }
    return pts;
  }
  const art = new Map();                                // "art_09_frame" -> its meshes (canvas, edge and frame are separate primitives)
  for (const m of meshes) {
    const n = baseName(m.name);
    if (!/^art_\d+(?:_hero)?_frame$/.test(n)) continue;
    m.isPickable = true;
    if (!art.has(n)) art.set(n, []);
    art.get(n).push(m);
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));            // shortest turn
  let flight = null;

  const pickAtCentre = () => {
    const hit = scene.pick(canvas.clientWidth / 2, canvas.clientHeight / 2, (m) => m.isPickable);   // CSS pixels: pick() divides by the hardware scaling level (the 6 s fallback sets 1.5)
    return hit.hit ? { name: baseName(hit.pickedMesh.name), normal: hit.getNormal(true) } : null;   // normal: world space, tells which side faces the room
  };

  function stop() {
    if (!flight) return;
    flight = null;
    cam.cameraDirection.setAll(0); cam.cameraRotation.setAll(0);
    cam.attachControl(canvas, true);
    canvas.focus();
  }

  function flyTo(name, faceNormal) {
    const ms = art.get(name);
    if (!ms) return false;
    stop();
    const min = new BABYLON.Vector3(Infinity, Infinity, Infinity), max = min.scale(-1);
    for (const m of ms) {
      m.computeWorldMatrix(true);
      const b = m.getBoundingInfo().boundingBox;
      min.minimizeInPlace(b.minimumWorld); max.maximizeInPlace(b.maximumWorld);
    }
    const size = max.subtract(min), centre = min.add(max).scale(0.5);
    // Paintings are upright: the thinner of x / z is the wall normal, pointing to the side the camera is on.
    const nAxis = size.x < size.z ? "x" : "z", wAxis = nAxis === "x" ? "z" : "x";
    const normal = new BABYLON.Vector3(0, 0, 0);
    // Side: the picked face normal when we have one, else the side the camera is on.
    normal[nAxis] = faceNormal && Math.abs(faceNormal[nAxis]) > 0.3 ? Math.sign(faceNormal[nAxis]) : Math.sign(cam.position[nAxis] - centre[nAxis]) || 1;
    const half = Math.tan(cam.fov / 2);
    const dist = Math.min(4, Math.max(1.4, 1.25 * Math.max(size.y / 2 / half, size[wAxis] / 2 / (half * engine.getAspectRatio(cam)))));
    const end = centre.add(normal.scale(dist));
    end.y = cam.position.y;                              // keep the eye where gravity put it
    const dx = centre.x - end.x, dz = centre.z - end.z;
    const yaw = Math.atan2(dx, dz), pitch = Math.atan2(end.y - centre.y, Math.hypot(dx, dz));
    const from = cam.position.clone();
    const r0 = cam.rotation.clone();
    const path = smooth(route(from, end));
    const cum = [0];
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + V.Distance(path[i - 1], path[i]));
    const dur = Math.min(3200, Math.max(1000, 700 + cum[cum.length - 1] * 200));
    cam.detachControl();                                 // no input fights the glide; any key press ends it early
    flight = { t0: performance.now(), dur, path, cum, r0, yaw: r0.y + wrap(yaw - r0.y), pitch };
    return { dist, end: end.asArray(), yaw, pitch, size: size.asArray(), via: path.length };
  }

  scene.onBeforeRenderObservable.add(() => {
    if (!flight) return;
    const f = flight, t = Math.min(1, (performance.now() - f.t0) / f.dur), e = ease(t);
    const d = e * f.cum[f.cum.length - 1];
    let i = 1;
    while (i < f.cum.length - 1 && f.cum[i] < d) i++;
    const seg = f.cum[i] - f.cum[i - 1];
    V.LerpToRef(f.path[i - 1], f.path[i], seg > 0 ? (d - f.cum[i - 1]) / seg : 1, cam.position);
    cam.rotation.y = f.r0.y + (f.yaw - f.r0.y) * e;
    cam.rotation.x = f.r0.x + (f.pitch - f.r0.x) * e;
    if (t >= 1) stop();
  });

  const focusAtCentre = () => {
    if (!engine.isPointerLock) return;
    const p = pickAtCentre();
    if (p) flyTo(p.name, p.normal);
  };
  canvas.addEventListener("click", focusAtCentre);
  addEventListener("keydown", (e) => {
    if (e.repeat) return;
    if (e.code === "Enter" || e.code === "NumpadEnter") { if (flight) stop(); else focusAtCentre(); return; }   // Enter = click on the dot
    if (flight && !["KeyM", "KeyB", "KeyG", "KeyR"].includes(e.code)) stop();
  });

  // Dot at the screen centre; grows over a painting. Throttled pick (a few meshes only).
  const dot = $("cross");
  let last = 0;
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now();
    if (now - last < 120) return;
    last = now;
    dot.classList.toggle("on", !flight && engine.isPointerLock && !!pickAtCentre());
  });
  return { flyTo, stop, art };
}

function setupPipeline(cam) {
  const p = new BABYLON.DefaultRenderingPipeline("pipe", true, scene, [cam]);   // HDR on
  p.samples = 4;                                        // MSAA: thin frames and trims stay clean
  p.fxaaEnabled = false;
  p.bloomEnabled = true;                                // soft, like the Blender Glare node (strength 0.35)
  p.bloomThreshold = 1.0;
  p.bloomWeight = 0.35;
  p.bloomKernel = 64;
  p.bloomScale = 0.5;
  p.imageProcessingEnabled = true;
  const ip = p.imageProcessing;                         // AgX does not exist in Babylon 9.0.0; Neutral is the closest honest match
  ip.toneMappingEnabled = true;
  ip.toneMappingType = BABYLON.ImageProcessingConfiguration.TONEMAPPING_KHR_PBR_NEUTRAL;
  // Tuned against renders/hero_hall_v09_small.png = the approved pendant-light look (mean luminance 0.42, saturation 0.389,
  // mean RGB 0.503/0.406/0.318). NOT cam_hero_hall.png: that still is the older, darker version (GALLERY_SCENE.md section 11).
  // AgX "Medium High Contrast" desaturates, Neutral does not, so saturation is pulled down by hand.
  // Grid search (4 x 3 x 3) on 8x6 cell luminance + saturation: best 1.4 / 1.2 / -30 (mean 0.416, sat 0.375, RGB .485/.405/.318).
  // Remaining cell error (~0.06) is structural (sensor shift_y of the Cycles camera, glossy floor), not a global parameter.
  ip.exposure = 1.4;
  ip.contrast = 1.2;
  ip.colorCurvesEnabled = true;
  ip.colorCurves = new BABYLON.ColorCurves();
  ip.colorCurves.globalSaturation = -30;
  return p;
}

// Sparse, tiny, slow. At density 0.0045 / 3500 motes the Blender render looked like snow: stay small.
function dustTexture() {
  const tex = new BABYLON.DynamicTexture("dust", 64, scene, true);
  tex.hasAlpha = true;
  const g = tex.getContext();
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");          // hard core, short falloff: crisp dots, not bokeh discs
  grad.addColorStop(0.45, "rgba(255,255,255,0.85)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  tex.update();
  return tex;
}

function setupDust(bl) {
  const tex = dustTexture();
  const [x0, x1] = DUST.x, [y0, y1] = DUST.y, [z0, z1] = DUST.z;
  const ps = new BABYLON.ParticleSystem("dust", DUST.count, scene);
  ps.particleTexture = tex;
  // Box is axis-aligned and symmetric around its center, so the Blender->Babylon axis swap is just (x, z, y).
  ps.emitter = bl((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const half = new BABYLON.Vector3((x1 - x0) / 2, (z1 - z0) / 2, (y1 - y0) / 2);
  // Direction * emit power = m/s (positions advance by direction * updateSpeed * animationRatio, ~1 s per 60 frames).
  // Start at 5-12 cm/s (settles near 6 cm/s with the damping below): slow, but clearly drifting. The first values gave
  // 0.6 cm/s, i.e. frozen.
  ps.createBoxEmitter(new BABYLON.Vector3(-1, -0.5, -1), new BABYLON.Vector3(1, 0.8, 1), half.scale(-1), half);
  ps.minSize = 0.008; ps.maxSize = 0.018;               // ~1-2 px at 10 m on 1080p; the Cycles motes are 4-9 mm
  ps.minLifeTime = 25; ps.maxLifeTime = 45;
  ps.emitRate = DUST.count / 35;
  ps.minEmitPower = 0.05; ps.maxEmitPower = 0.12;
  ps.updateSpeed = 0.016;

  // Slow air currents: a smooth flow field (sines of position and time, ~3 m swirls) nudges every particle's velocity,
  // light damping keeps the speed near 6 cm/s. Stateless per particle, so it costs nothing for 400 particles.
  const FLOW = 1.1e-3, DAMP = 0.99;                      // per frame at 60 fps, scaled by the animation ratio below
  const baseUpdate = ps.updateFunction;
  let t = 0;
  ps.updateFunction = (particles) => {
    const r = scene.getAnimationRatio();                 // frame-rate independent: 1 at 60 fps
    t += 0.016 * r;
    const damp = Math.pow(DAMP, r), k = FLOW * r;
    for (let i = 0; i < particles.length; i++) {
      const d = particles[i].direction, q = particles[i].position;
      d.x += Math.sin(q.y * 2.1 + q.z * 1.3 + t * 0.7) * k;
      d.y += Math.sin(q.z * 1.7 + q.x * 2.3 + t * 0.5) * k * 0.5;   // less vertical than horizontal
      d.z += Math.sin(q.x * 1.9 + q.y * 1.1 + t * 0.6) * k;
      d.scaleInPlace(damp);
    }
    baseUpdate(particles);
  };
  ps.color1 = new BABYLON.Color4(1, 0.92, 0.8, 0.7);
  ps.color2 = new BABYLON.Color4(1, 0.85, 0.7, 0.4);
  ps.colorDead = new BABYLON.Color4(1, 0.9, 0.8, 0);
  ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
  ps.preWarmCycles = 600; ps.preWarmStepOffset = 4;
  ps.start();
}

// ---- Light play: view-dependent highlights on the paintings + visible light beams with dust --------------------------------
// The lightmaps are static, so they cannot show a highlight that moves with the viewer or the air that the spots shine through.
// (1) Paintings: varnish (clearcoat) on the canvas + one specular-only light per painting (LIGHTMAP_SPECULAR: the lightmap is
//     untouched). The real spots hang ~1 m from the wall and ~4 m up, so their mirror image lands above the frame from any
//     standing position; the virtual key light sits just in front of / above the painting, so the highlight is on the canvas
//     and slides over it as you walk.
// (2) Beams: a soft additive cone per spot, as long as the ray to the first wall/floor, plus motes that only show inside a beam.
// Spot table = Blender light_spot_* [x, y, z, dirX, dirY, dirZ, cone angle in degrees] (Blender coords, converted with bl()).
const SPOTS = [
  [-2.42, -14.608, 5.601, -0.261, 0, -0.965, 38], [1.044, -14.716, 5.642, 0.519, 0, -0.855, 38], [2.013, -10.721, 5.63, 0.346, 0, -0.938, 38],
  [-0.236, -10.527, 5.642, -0.628, 0, -0.778, 38], [-1.724, -10.671, 5.619, -0.404, 0, -0.915, 38], [-1.154, -14.526, 5.642, -0.502, 0, -0.865, 38],
  [1.683, -18.669, 5.642, 0.41, 0, -0.912, 38], [2.654, -18.672, 5.639, 0.205, 0, -0.979, 38], [2.23, -14.608, 5.601, 0.303, 0, -0.953, 38],
  [-2.319, -18.586, 5.619, -0.282, 0, -0.959, 38], [-1.298, -18.698, 5.642, -0.478, 0, -0.878, 38], [0.015, -18.694, 5.63, 0.654, 0, -0.756, 38],
  [1.386, -1.357, 4.161, 0.505, 0, -0.863, 38], [-1.697, -3.662, 4.19, -0.423, 0, -0.906, 38], [-0.527, -3.867, 4.202, -0.662, 0, -0.75, 38],
  [0.352, -3.856, 4.202, 0.687, 0, -0.727, 38], [-1.764, -1.357, 4.161, -0.409, 0, -0.913, 38], [-0.726, -1.468, 4.202, -0.63, 0, -0.776, 38],
  [1.431, -3.712, 4.179, 0.492, 0, -0.871, 38], [0.67, -1.439, 4.202, 0.639, 0, -0.769, 38], [0.979, -10.569, 5.642, 0.529, 0, -0.848, 38],
  [-1.241, -10.548, 5.642, -0.488, 0, -0.873, 38],
  [-1.4, -18.8, 5.6, 0.164, -0.694, -0.701, 30], [1.4, -18.8, 5.6, -0.164, -0.694, -0.701, 30],      // hero pair
  [0.05, -4.586, 4.184, 0, -0.458, -0.889, 42], [0.34, -10.489, 5.651, -0.053, 0.699, -0.713, 30],   // partition: entrance side, hall side
  [-2, -19.2, 5.6, -0.057, -0.571, -0.819, 20], [2, -19.2, 5.6, 0.056, -0.562, -0.825, 20],          // sculpture pair
];
const BEAM = { on: false /* default state of the Beams button / B key */, colour: [1, 0.73, 0.45], strength: 0.09, maxLen: 8, motes: 450 };
// out / above: virtual key light, metres in front of the painting / above its centre. cone: radians. Intensity: see the
// glare test in WEB_GALLERY.md (30 = blown-out blob, ~8 = soft sheen).
// jitterOut / jitterSide / jitterUp: total spread (m) of the per-painting random offset of that position.
const PAINT = { specular: [1, 0.78, 0.55], intensity: 8, out: 0.9, above: 0.35, jitterOut: 0.4, jitterSide: 1.2, jitterUp: 0.4, cone: 1.8, relief: 0.6, reliefStrength: 1.5, reliefSize: 1024, clearCoat: 0.5, clearCoatRoughness: 0.2, canvasRoughness: 0.5 };

// Normal map from the painting itself: luminance read as height, Sobel on the GPU (a ProceduralTexture rendered once, no readback).
// glTF convention: +X right, +Y up in the image; image rows run along +v, so "up" is -v.
BABYLON.Effect.ShadersStore.artReliefFragmentShader = `
  precision highp float;
  varying vec2 vUV;
  uniform sampler2D src; uniform vec2 texel; uniform float strength;
  float L(float dx, float dy) { return dot(texture2D(src, vUV + vec2(dx, dy) * texel).rgb, vec3(0.299, 0.587, 0.114)); }
  void main() {
    float tl = L(-1., -1.), t = L(0., -1.), tr = L(1., -1.), l = L(-1., 0.), r = L(1., 0.), bl = L(-1., 1.), b = L(0., 1.), br = L(1., 1.);
    float dx = (tr + 2. * r + br) - (tl + 2. * l + bl);
    float dv = (bl + 2. * b + br) - (tl + 2. * t + tr);
    gl_FragColor = vec4(normalize(vec3(-dx * strength, dv * strength, 1.0)) * 0.5 + 0.5, 1.0);
  }`;
function reliefMap(albedo) {
  const size = PAINT.reliefSize;
  const p = new BABYLON.ProceduralTexture("relief_" + albedo.name, size, "artRelief", scene, null, true);
  p.setTexture("src", albedo);
  p.setVector2("texel", new BABYLON.Vector2(1 / size, 1 / size));
  p.setFloat("strength", PAINT.reliefStrength);
  p.refreshRate = 1;                                                                         // every frame until the painting texture has arrived, then once more and stop
  const obs = scene.onBeforeRenderObservable.add(() => {
    if (albedo.isReady() && p.isReady()) { p.refreshRate = 0; scene.onBeforeRenderObservable.remove(obs); }
  });
  return p;
}

function setupLightPlay(bl, art) {
  const V = BABYLON.Vector3, o0 = bl(0, 0, 0);
  const spots = SPOTS.map(([x, y, z, dx, dy, dz, deg]) => ({
    pos: bl(x, y, z), dir: bl(dx, dy, dz).subtract(o0).normalize(), angle: (deg * Math.PI) / 180, len: BEAM.maxLen,
  }));
  const zPart = bl(0, -6.4, 0).z, zEnd = bl(0, -20, 0).z;

  // ---- (1) paintings ----
  const specLights = [], reliefs = [], canvasMats = [];
  let idx = 0;
  for (const [name, ms] of art) {
    const min = new V(Infinity, Infinity, Infinity), max = min.scale(-1);
    for (const m of ms) { m.computeWorldMatrix(true); const b = m.getBoundingInfo().boundingBox; min.minimizeInPlace(b.minimumWorld); max.maximizeInPlace(b.maximumWorld); }
    const size = max.subtract(min), c = min.add(max).scale(0.5);
    const n = size.x < size.z ? "x" : "z";
    // side the painting faces: side walls look at the hall axis; on the z axis the partition faces both ways, the end wall faces the hall
    const face = n === "x" ? Math.sign(-c.x) : c.z > zEnd ? -1 : Math.sign(c.z - zPart);
    // Same light position on every painting would put the glare at the same spot on all of them: jitter it per painting (fixed seed).
    const k = idx++, j = (s) => { const v = Math.sin((k + 1) * 78.233 + s * 12.9898) * 43758.5453; return v - Math.floor(v) - 0.5; };   // -0.5 .. 0.5
    const w = n === "x" ? "z" : "x";
    const pos = c.clone();
    pos[n] += face * (PAINT.out + j(1) * PAINT.jitterOut);
    pos[w] += j(2) * PAINT.jitterSide;
    pos.y = c.y + PAINT.above + j(3) * PAINT.jitterUp;
    const canvasMat = ms.find((m) => /primitive0$/.test(m.name))?.material;
    if (canvasMat) {                                                                         // varnish: a thin glossy coat over the paint
      canvasMats.push(canvasMat);
      canvasMat.roughness = PAINT.canvasRoughness;
      canvasMat.clearCoat.isEnabled = true;
      canvasMat.clearCoat.intensity = PAINT.clearCoat;
      canvasMat.clearCoat.roughness = PAINT.clearCoatRoughness;
      if (PAINT.relief > 0 && canvasMat.albedoTexture) {                                     // brush ridges catch the light: relief from the colour image
        const nm = reliefMap(canvasMat.albedoTexture);
        nm.level = PAINT.relief;
        reliefs.push(nm);
        canvasMat.bumpTexture = nm;
        canvasMat.clearCoat.bumpTexture = nm;                                                // the varnish follows the paint surface
        canvasMat.invertNormalMapX = true;                                                   // glTF normal-map convention in this left-handed scene (what the glTF loader sets)
      }
    }
    const l = new BABYLON.SpotLight("spec_" + name, pos, c.subtract(pos).normalize(), PAINT.cone, 1, scene);
    // PBR takes the specular colour from the light's DIFFUSE colour; LIGHTMAP_SPECULAR then drops the diffuse part (the lightmap has it)
    l.diffuse = l.specular = new BABYLON.Color3(...PAINT.specular);
    l.lightmapMode = BABYLON.Light.LIGHTMAP_SPECULAR;
    l.intensity = PAINT.intensity;
    l.includedOnlyMeshes = ms.filter((m) => /primitive0$/.test(m.name));                    // canvas only: on the walnut frame it reads as metal
    specLights.push(l);
  }

  // ---- (2) beams ----
  const solid = (m) => (SOLID.includes(baseName(m.name)) && baseName(m.name) !== "gallery_window_glass") || /^art_\d/.test(baseName(m.name));
  const mat = new BABYLON.ShaderMaterial("beam", scene, { vertexSource: `
    precision highp float;
    attribute vec3 position; attribute vec3 normal; attribute vec2 uv;
    uniform mat4 world; uniform mat4 view; uniform mat4 worldViewProjection;
    varying vec3 vN; varying vec3 vP; varying float vT;
    void main() {
      mat4 wv = view * world;
      vP = (wv * vec4(position, 1.0)).xyz;
      vN = mat3(wv) * normal;
      vT = uv.y;                                       // 0 at the lamp .. 1 at the first surface
      gl_Position = worldViewProjection * vec4(position, 1.0);
    }`, fragmentSource: `
    precision highp float;
    varying vec3 vN; varying vec3 vP; varying float vT;
    uniform vec3 tint; uniform float strength;
    void main() {
      float chord = pow(abs(dot(normalize(vN), normalize(-vP))), 1.4);   // thick through the middle, vanishing at the silhouette
      float along = smoothstep(0.0, 0.1, vT) * (1.0 - 0.8 * smoothstep(0.5, 1.0, vT)) * (1.0 - 0.4 * vT);
      float near = smoothstep(0.3, 1.5, length(vP));                       // no hard slice when the camera is inside / next to it
      gl_FragColor = vec4(tint, strength * chord * along * near);
    }` }, { attributes: ["position", "normal", "uv"], uniforms: ["world", "view", "worldViewProjection", "tint", "strength"] });
  mat.setColor3("tint", new BABYLON.Color3(...BEAM.colour));
  mat.setFloat("strength", BEAM.strength);
  mat.alphaMode = BABYLON.Engine.ALPHA_ADD;
  mat.backFaceCulling = false;
  mat.disableDepthWrite = true;
  mat.needAlphaBlending = () => true;

  const beams = spots.map((s, i) => {
    const hit = scene.pickWithRay(new BABYLON.Ray(s.pos.add(s.dir.scale(0.1)), s.dir, BEAM.maxLen), solid);
    s.len = hit && hit.hit ? Math.min(BEAM.maxLen, hit.distance + 0.1) : BEAM.maxLen;
    const R = s.len * Math.tan(s.angle / 2);
    const cone = BABYLON.MeshBuilder.CreateCylinder("beam" + i, { height: s.len, diameterTop: 0, diameterBottom: 2 * R, tessellation: 32, cap: BABYLON.Mesh.NO_CAP }, scene);
    const p = cone.getVerticesData(BABYLON.VertexBuffer.PositionKind), uv = [];
    for (let k = 0; k < p.length; k += 3) uv.push(0, (s.len / 2 - p[k + 1]) / s.len);   // v along the beam, apex = 0
    cone.setVerticesData(BABYLON.VertexBuffer.UVKind, uv);
    cone.position = s.pos.add(s.dir.scale(s.len / 2));
    cone.rotationQuaternion = BABYLON.Quaternion.FromUnitVectorsToRef(V.Up(), s.dir.scale(-1), new BABYLON.Quaternion());   // apex (+y) at the lamp
    cone.material = mat;
    cone.isPickable = false;
    cone.alphaIndex = 10;
    s.tanHalf = Math.tan(s.angle / 2);
    return cone;
  });

  // ---- motes: only visible inside a beam (size scaled by how deep inside), re-spawned inside random beams ----
  const ps = new BABYLON.ParticleSystem("beamDust", BEAM.motes, scene);
  ps.particleTexture = dustTexture();
  ps.emitter = V.Zero();
  ps.createPointEmitter(new V(-1, -0.4, -1), new V(1, 0.6, 1));
  ps.startPositionFunction = (wm, pos) => {
    const s = spots[(Math.random() * spots.length) | 0];
    const d = s.len * (0.08 + 0.85 * Math.random()), r = d * s.tanHalf * Math.sqrt(Math.random()) * 0.95, a = Math.random() * 2 * Math.PI;
    const u = V.Cross(s.dir, Math.abs(s.dir.y) > 0.9 ? V.Right() : V.Up()).normalize(), v = V.Cross(s.dir, u);
    pos.copyFrom(s.pos).addInPlace(s.dir.scale(d)).addInPlace(u.scale(Math.cos(a) * r)).addInPlace(v.scale(Math.sin(a) * r));
  };
  ps.minSize = 0.01; ps.maxSize = 0.026;
  ps.minLifeTime = 8; ps.maxLifeTime = 16;
  ps.emitRate = BEAM.motes / 12;
  ps.minEmitPower = 0.03; ps.maxEmitPower = 0.08;
  ps.updateSpeed = 0.016;
  const flow = ps.updateFunction;
  let t = 0;
  ps.updateFunction = (list) => {
    const r = scene.getAnimationRatio(), k = 1.1e-3 * r, damp = Math.pow(0.99, r);
    t += 0.016 * r;
    for (const p of list) {
      const d = p.direction, q = p.position;
      d.x += Math.sin(q.y * 2.1 + q.z * 1.3 + t * 0.7) * k;
      d.y += Math.sin(q.z * 1.7 + q.x * 2.3 + t * 0.5) * k * 0.5;
      d.z += Math.sin(q.x * 1.9 + q.y * 1.1 + t * 0.6) * k;
      d.scaleInPlace(damp);
      let inside = 0;                                                                     // 0 outside every beam .. 1 on a beam axis
      for (const s of spots) {
        const rx = q.x - s.pos.x, ry = q.y - s.pos.y, rz = q.z - s.pos.z;
        const along = rx * s.dir.x + ry * s.dir.y + rz * s.dir.z;
        if (along < 0.15 || along > s.len) continue;
        const px = rx - s.dir.x * along, py = ry - s.dir.y * along, pz = rz - s.dir.z * along;
        inside = Math.max(inside, 1 - Math.sqrt(px * px + py * py + pz * pz) / (along * s.tanHalf));
      }
      const f = Math.min(1, Math.max(0, inside) * 3);
      const cd = V.Distance(q, scene.activeCamera.position), n = Math.min(1, Math.max(0, (cd - 0.5) / 1.2));   // no big blobs right in front of the lens
      p.scale.x = p.scale.y = f * f * (3 - 2 * f) * n;
    }
    flow(list);
  };
  ps.color1 = new BABYLON.Color4(1, 0.9, 0.7, 0.95);
  ps.color2 = new BABYLON.Color4(1, 0.8, 0.6, 0.7);
  ps.colorDead = new BABYLON.Color4(1, 0.9, 0.8, 0);
  ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_ADD;
  ps.preWarmCycles = 300; ps.preWarmStepOffset = 4;

  const set = (on) => { beams.forEach((b) => b.setEnabled(on)); on ? ps.start() : ps.stop(); };
  set(BEAM.on);
  // Glare on/off: highlight lights + varnish + relief together (all plain uniforms, no recompile).
  const setGlare = (on) => {
    specLights.forEach((l) => { l.intensity = on ? PAINT.intensity : 0; });
    reliefs.forEach((r) => { r.level = on ? PAINT.relief : 0; });
    canvasMats.forEach((m) => { m.clearCoat.intensity = on ? PAINT.clearCoat : 0; });
  };
  return { specLights, beams, spots, mat, motes: ps, setBeams: set, setGlare };
}

// ---- Floor reflection: a realtime planar mirror in the polished floor ----------------------------------------------------
// The floor only had the static hall probe, so nothing in it moved with you. A MirrorTexture (the scene rendered upside down
// about the floor plane, mip-mapped so the floor's roughness texture blurs it, plus an adaptive blur by distance) is used as
// the floor material's reflectionTexture; LightmapGloss already divides reflections by the lightmap, so it fits. Cost: one more
// pass over the scene (floor, beams and particles excluded), halved with FLOOR.every = 2. Off = level 0 + no rendering (a
// reflectionTexture swap would recompile the frozen floor material and make the floor vanish for a moment).
const FLOOR = { level: 3, size: 1024, blur: 12, every: 1 };
function setupFloorReflection() {
  const floor = scene.getMeshByName("gallery_floor");
  if (!floor || !floor.material) return { set() {} };
  const mir = new BABYLON.MirrorTexture("floorMirror", FLOOR.size, scene, true, BABYLON.Constants.TEXTURETYPE_HALF_FLOAT);
  mir.mirrorPlane = new BABYLON.Plane(0, -1, 0, floor.getBoundingInfo().boundingBox.maximumWorld.y);   // floor top
  mir.renderList = scene.meshes.filter((m) => m !== floor && !/^beam/.test(m.name) && m.getTotalVertices() > 0);
  mir.adaptiveBlurKernel = FLOOR.blur;
  floor.material.reflectionTexture = mir;
  const mat = floor.material;
  const set = (on) => {
    mir.level = on ? FLOOR.level : 0;
    mir.refreshRate = on ? FLOOR.every : 0;
    if (mat.isFrozen) { mat.unfreeze(); scene.onAfterRenderObservable.addOnce(() => mat.freeze()); }   // a frozen material keeps the old reflection level
  };
  return { mirror: mir, set };
}

// ---- Eye adaptation: exposure follows how bright the view is ---------------------------------------------------------------
// A tiny HDR render of the scene from the walking camera (48x27, every few frames) is read back and reduced to one number: the
// centre-weighted log-average luminance. The first reading (spawn view, the tuned look) is the reference; after that
// exposure = base * (ref / L)^power, clamped, and eased with different speeds (the eye gets used to a bright view faster than
// to a dark one). Always on (no UI; console: __g.eye.on = false freezes it). The readback is the only GPU stall: 48x27 floats.
const ADAPT = { w: 48, h: 27, every: 8, power: 0.5, min: 0.7, max: 1.5, tauBright: 0.6, tauDark: 2.0 };
function setupEyeAdaptation(cam, pipeline) {
  const ip = pipeline.imageProcessing, base = ip.exposure;
  const rtt = new BABYLON.RenderTargetTexture("lum", { width: ADAPT.w, height: ADAPT.h }, scene, false, true, BABYLON.Constants.TEXTURETYPE_HALF_FLOAT);
  rtt.activeCamera = cam;
  rtt.refreshRate = ADAPT.every;
  rtt.renderList = scene.meshes.filter((m) => m.getTotalVertices() > 0 && !/^beam/.test(m.name));
  rtt.clearColor = new BABYLON.Color4(0, 0, 0, 1);
  scene.customRenderTargets.push(rtt);
  const weights = [];
  let wsum = 0;
  for (let y = 0; y < ADAPT.h; y++) for (let x = 0; x < ADAPT.w; x++) {
    const dx = (x + 0.5) / ADAPT.w - 0.5, dy = (y + 0.5) / ADAPT.h - 0.5, w = Math.exp(-(dx * dx + dy * dy) / 0.08);   // centre-weighted
    weights.push(w); wsum += w;
  }
  const st = { on: true, lum: 0, ref: 0, target: base, exposure: base, busy: false };
  const read = () => {
    if (st.busy) return;
    st.busy = true;
    Promise.resolve(rtt.readPixels()).then((d) => {
      st.busy = false;
      if (!d) return;
      let s = 0;
      for (let i = 0, k = 0; k < weights.length; i += 4, k++) s += weights[k] * Math.log(0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2] + 1e-3);
      st.lum = Math.exp(s / wsum);
      if (!st.ref) st.ref = st.lum;                                                          // first reading = the tuned spawn view
      st.target = base * Math.min(ADAPT.max, Math.max(ADAPT.min, Math.pow(st.ref / st.lum, ADAPT.power)));
    }).catch(() => { st.busy = false; });
  };
  rtt.onAfterRenderObservable.add(read);
  let t0 = performance.now();
  scene.onBeforeRenderObservable.add(() => {
    const now = performance.now(), dt = Math.min(0.1, (now - t0) / 1000);
    t0 = now;
    if (!st.on) return;
    const tau = st.target < st.exposure ? ADAPT.tauBright : ADAPT.tauDark;
    st.exposure += (st.target - st.exposure) * (1 - Math.exp(-dt / tau));
    ip.exposure = st.exposure;
  });
  return st;
}
