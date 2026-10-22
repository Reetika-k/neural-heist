import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/** Renderer, angled orthographic camera, neon-night lighting, optional bloom (graphics quality "high"). */
export function createScene(canvas, { quality = "high" } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b1f);
  scene.fog = new THREE.Fog(0x070b1f, 30, 60);

  // Orthographic = no perspective distortion, which keeps distances readable in a stealth game.
  const VIEW = 7; // half-height of the view in world units
  const camera = new THREE.OrthographicCamera(-VIEW, VIEW, VIEW, -VIEW, 0.1, 200);
  const CAMERA_OFFSET = new THREE.Vector3(6, 18, 8); // steep angled top-down: depth cues without walls hiding the player

  scene.add(new THREE.HemisphereLight(0x6f7dff, 0x0a0420, 0.9));
  const moon = new THREE.DirectionalLight(0xa9c6ff, 1.6);
  moon.position.set(12, 24, 8);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  Object.assign(moon.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
  scene.add(moon, moon.target);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.55, 0.5, 0.82);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  let current = quality;

  function setQuality(q) {
    current = q;
    renderer.setPixelRatio(q === "high" ? Math.min(devicePixelRatio, 2) : 1);
    renderer.shadowMap.enabled = q === "high";
    scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    resize();
  }
  function resize() {
    const w = innerWidth, h = innerHeight, aspect = w / h;
    camera.left = -VIEW * aspect; camera.right = VIEW * aspect; camera.top = VIEW; camera.bottom = -VIEW;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
  }
  addEventListener("resize", resize);
  setQuality(quality);

  /** Smoothly follow a target position (lerp toward it each frame). */
  function follow(target, dt, snap = false) {
    const desired = new THREE.Vector3(target.x, 0, target.z).add(CAMERA_OFFSET);
    if (snap) camera.position.copy(desired); else camera.position.lerp(desired, 1 - Math.exp(-6 * dt));
    camera.lookAt(camera.position.x - CAMERA_OFFSET.x, 0, camera.position.z - CAMERA_OFFSET.z);
    moon.target.position.set(target.x, 0, target.z);
    moon.position.set(target.x + 12, 24, target.z + 8);
  }
  const render = () => (current === "high" ? composer.render() : renderer.render(scene, camera));

  return { renderer, scene, camera, follow, render, setQuality };
}
