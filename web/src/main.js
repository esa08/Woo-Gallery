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
class LightmapGloss extends BABYLON.MaterialPluginBase {
  constructor(material) {
    super(material, "LightmapGloss", 200, { LMGLOSS: false });
    this._enable(true);
  }
  prepareDefines(defines) { defines.LMGLOSS = true; }
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
  #ifdef SPECULARTERM
    finalSpecularScaled = vec3(0.0);
  #endif
  #ifdef CLEARCOAT
    finalClearCoatScaled = vec3(0.0);
  #endif
#endif`,
    };
  }
}

// Hall dust box in Blender coords (GALLERY_SCENE.md section 8).
const DUST = { x: [-3.2, 3.2], y: [-22.2, -6.9], z: [0.3, 6.6], count: 400 };

(async function main() {
  const result = await BABYLON.ImportMeshAsync("assets/gallery.glb", scene, {
    onProgress: (e) => {
      if (e.lengthComputable) $("bar").firstElementChild.style.width = (e.loaded * 100 / e.total) + "%";
    },
  });
  const root = result.meshes[0];                        // "__root__": carries the glTF handedness flip
  root.computeWorldMatrix(true);
  // Blender (x, y, z, Z-up) -> glTF (x, z, -y) -> Babylon world through the root matrix. No guessing of axis flips.
  const bl = (x, y, z) => BABYLON.Vector3.TransformCoordinates(new BABYLON.Vector3(x, z, -y), root.getWorldMatrix());

  prepareMeshes(result.meshes);
  prepareMaterials();
  const env = await setupEnvironment(bl);
  const baked = await applyLightmaps();
  const lights = setupLights(baked);
  const camera = setupCamera(bl);
  const pipeline = setupPipeline(camera);
  setupDust(bl);

  await scene.whenReadyAsync();
  // Freeze after everything compiled once. Not freezeActiveMeshes: the camera moves, frozen culling would pop meshes.
  scene.materials.forEach((m) => m.freeze());
  result.meshes.forEach((m) => m.freezeWorldMatrix());

  // Music: browsers block autoplay, so it starts on the hint click. 3-min loop; M or the button mutes.
  const music = $("music"), muteBtn = $("mute");
  music.volume = 0.5;
  const toggleMute = () => { music.muted = !music.muted; muteBtn.textContent = "♫ Musik: " + (music.muted ? "off" : "on"); };
  muteBtn.addEventListener("click", (e) => { toggleMute(); e.stopPropagation(); canvas.focus(); });
  addEventListener("keydown", (e) => { if (e.code === "KeyM") toggleMute(); });

  engine.runRenderLoop(() => scene.render());
  $("loading").classList.add("hidden");
  $("hint").classList.remove("hidden");
  $("hint").addEventListener("click", () => { music.play().catch(() => {}); engine.enterPointerlock(); canvas.focus(); $("hint").classList.add("hidden"); });
  document.addEventListener("pointerlockchange", () => {
    if (!document.pointerLockElement) $("hint").classList.remove("hidden");
  });

  // ponytail: one-shot resolution drop, no tiers. Add SceneOptimizer / quality tiers if this is not enough.
  setTimeout(() => { if (engine.getFps() < 40) engine.setHardwareScalingLevel(1.5); }, 6000);

  window.__g = { engine, scene, camera, pipeline, root, bl, baked, lights, env };   // handle for console checks
})().catch((err) => {
  console.error(err);
  $("msg").textContent = "Gagal memuat: " + err.message;
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
async function applyLightmaps() {
  let manifest;
  try {
    const r = await fetch("assets/lightmaps/manifest.json");
    if (!r.ok) return [];
    manifest = await r.json();
  } catch (e) { return []; }
  const baked = [];
  for (const [name, info] of Object.entries(manifest)) {
    const tex = new BABYLON.Texture("assets/" + info.file, scene, { invertY: false });   // glTF UVs are top-left origin
    tex.coordinatesIndex = 1;                          // UV2 = TEXCOORD_1
    tex.level = info.scale;                            // image stores linear / scale
    let albedo = null;
    if (info.albedo) {
      albedo = new BABYLON.Texture("assets/" + info.albedo, scene, { invertY: false });
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
      new LightmapGloss(m.material);                   // keeps IBL reflections out of the lightmap multiplication
      baked.push(m);
    }
  }
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
  const cam = new BABYLON.UniversalCamera("walk", bl(0, 0.9, 1.7), scene);
  cam.setTarget(bl(0, -12, 1.6));
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
function setupDust(bl) {
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
