import * as THREE from "three";
import { CLASSIC, BLINK } from "../lab/qlearning.js";
import { vaultToWorld, DOG } from "../teammates/dog.js";

/**
 * Mission 2's vault: metal floor, pulsing laser beams, the drive on a pedestal, the console, and the dog.
 * 2026-10-23: drawn from the environment the dog trained on (random layouts, blinking lasers, batteries, puddles).
 */
export function createVaultView(parent, origin, consoleCell, env = CLASSIC) {
  const VAULT = env, LASERS = new Set([...env.lasers].filter((k) => !env.blink.has(k))), BLINKING = [...env.blink];
  const floorMat = new THREE.MeshStandardMaterial({ color: 0x1a2148, metalness: 0.6, roughness: 0.35 });
  const tile = new THREE.InstancedMesh(new THREE.BoxGeometry(0.96, 0.04, 0.96), floorMat, VAULT.size * VAULT.size);
  const m = new THREE.Matrix4();
  for (let z = 0; z < VAULT.size; z++) for (let x = 0; x < VAULT.size; x++) { const w = vaultToWorld({ x, z }, origin); tile.setMatrixAt(z * VAULT.size + x, m.makeTranslation(w.x, 0.02, w.z)); }
  parent.add(tile);

  const laserMat = new THREE.MeshBasicMaterial({ color: 0xff2d55 });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.18, depthWrite: false });
  const lasers = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 0.04), laserMat, LASERS.size);
  const glows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.5, 0.9), glowMat, LASERS.size);
  [...LASERS].forEach((k, i) => { const [x, z] = k.split(",").map(Number); const w = vaultToWorld({ x, z }, origin); lasers.setMatrixAt(i, m.makeTranslation(w.x, 0.35, w.z)); glows.setMatrixAt(i, m.makeTranslation(w.x, 0.25, w.z)); });
  parent.add(lasers, glows);
  // blinking lasers: orange, switched on and off with the same timing the dog learned (one phase per dog step)
  const blinkMat = new THREE.MeshBasicMaterial({ color: 0xff8c3c }), blinkGlowMat = new THREE.MeshBasicMaterial({ color: 0xff8c3c, transparent: true, opacity: 0.2, depthWrite: false });
  const blinkBeams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.04, 0.04), blinkMat, Math.max(1, BLINKING.length));
  const blinkGlows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.5, 0.9), blinkGlowMat, Math.max(1, BLINKING.length));
  BLINKING.forEach((k, i) => { const [x, z] = k.split(",").map(Number); const w = vaultToWorld({ x, z }, origin); blinkBeams.setMatrixAt(i, m.makeTranslation(w.x, 0.35, w.z)); blinkGlows.setMatrixAt(i, m.makeTranslation(w.x, 0.25, w.z)); });
  blinkBeams.count = blinkGlows.count = BLINKING.length;
  parent.add(blinkBeams, blinkGlows);
  // puddles: flat blue patches
  const wetMat = new THREE.MeshBasicMaterial({ color: 0x3f8cff, transparent: true, opacity: 0.45, depthWrite: false });
  for (const k of env.wet) { const [x, z] = k.split(",").map(Number); const w = vaultToWorld({ x, z }, origin); const p = new THREE.Mesh(new THREE.CircleGeometry(0.38, 20), wetMat); p.rotation.x = -Math.PI / 2; p.position.set(w.x, 0.05, w.z); p.scale.set(1, 0.7, 1); parent.add(p); }
  // batteries: glowing green cells that vanish when the dog picks them up
  const batteryMeshes = env.batteries.map((b) => { const w = vaultToWorld(b, origin); const g = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.36, 0.22), new THREE.MeshStandardMaterial({ color: 0xb6ff4d, emissive: 0x7cff2d, emissiveIntensity: 1.2 })); g.position.set(w.x, 0.4, w.z); parent.add(g); return { cell: b, mesh: g }; });

  const goal = vaultToWorld(VAULT.goal, origin);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xffa800, emissiveIntensity: 1.4 }));
  gem.position.set(goal.x, 0.7, goal.z);
  const gemLight = new THREE.PointLight(0xffc23d, 8, 4, 1.6); gemLight.position.set(goal.x, 1, goal.z);
  parent.add(gem, gemLight);

  const con = new THREE.Group();
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x2a3168, metalness: 0.4 });
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.5), deskMat); desk.position.y = 0.4;
  const screenMat = new THREE.MeshBasicMaterial({ color: 0x29e6ff });
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.35, 0.04), screenMat); screen.position.set(0, 0.95, 0.12); screen.rotation.x = -0.4;
  con.add(desk, screen);
  con.position.set(consoleCell.x + 0.5, 0, consoleCell.z + 0.5);
  parent.add(con);

  // Beacon: players could not find the console (a dark desk) and tried to walk into the vault instead.
  // A pulsing light column, a floor ring and a floating "CONSOLE · E" label mark it until the dog is sent.
  const beacon = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 4, 20, 1, true), beamMat); beam.position.y = 2;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  const tag = document.createElement("canvas"); tag.width = 512; tag.height = 128;
  const g = tag.getContext("2d");
  g.fillStyle = "rgba(4,18,26,.85)"; g.strokeStyle = "#3dff9a"; g.lineWidth = 6;
  g.beginPath(); g.roundRect(6, 6, 500, 116, 28); g.fill(); g.stroke();
  g.fillStyle = "#3dff9a"; g.font = "800 58px Orbitron, Inter, sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("CONSOLE · E", 256, 68);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tag), depthTest: false, transparent: true, toneMapped: false }));
  label.scale.set(2.4, 0.6, 1); label.position.y = 2.2; label.renderOrder = 10;
  beacon.add(beam, ring, label);
  beacon.position.copy(con.position);
  parent.add(beacon);

  // robot dog: low-poly quadruped with cyan eyes
  const dog = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc9d2ff, metalness: 0.5, roughness: 0.3 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.2, 0.26), bodyMat); body.position.y = 0.36;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.2), bodyMat); head.position.set(0.32, 0.46, 0);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.14), new THREE.MeshBasicMaterial({ color: 0x29e6ff })); eyes.position.set(0.42, 0.48, 0);
  const legs = [];
  for (const [x, z] of [[-0.18, -0.1], [-0.18, 0.1], [0.18, -0.1], [0.18, 0.1]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.28, 0.06), bodyMat); l.position.set(x, 0.14, z); dog.add(l); legs.push(l); }
  const dogLight = new THREE.PointLight(0x29e6ff, 0.8, 1.8, 2); dogLight.position.y = 0.6;
  dog.add(body, head, eyes, dogLight);
  parent.add(dog);
  const spark = new THREE.PointLight(0xff2d55, 0, 4, 1.5); parent.add(spark);

  return {
    update(dogState, mission, nearConsole, t) {
      // blink phase: the dog's own step while it crosses (as in training), otherwise a steady clock
      const phase = dogState?.status === "crossing" || dogState?.status === "goal" || dogState?.status === "laser" ? dogState.step : Math.floor(t * DOG.cellsPerSecond);
      const blinkOn = ((phase % BLINK.period) + BLINK.period) % BLINK.period < BLINK.on;
      blinkBeams.visible = blinkOn; blinkGlowMat.opacity = blinkOn ? 0.2 : 0.04; blinkGlows.visible = true;
      if (dogState) for (const b of batteryMeshes) b.mesh.visible = !dogState.plan.path.slice(0, dogState.step + 1).some((p) => p.x === b.cell.x && p.z === b.cell.z);
      for (const b of batteryMeshes) b.mesh.rotation.y = t * 2;
      laserMat.color.setHSL(0.97, 1, 0.5 + 0.1 * Math.sin(t * 8));
      glowMat.opacity = 0.12 + 0.08 * Math.sin(t * 6);
      gem.visible = gemLight.visible = !mission.hasDrive && dogState?.status !== "goal";
      gem.rotation.y = t * 1.6;
      screenMat.color.set(nearConsole ? 0x3dff9a : dogState?.status === "crossing" ? 0xffd23d : 0x29e6ff);
      beacon.visible = !!dogState && dogState.status === "idle" && !mission.outcome;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      beamMat.opacity = 0.14 + 0.14 * pulse; ringMat.opacity = 0.5 + 0.4 * pulse;
      ring.scale.setScalar(1 + 0.12 * pulse); label.position.y = 2.2 + 0.08 * Math.sin(t * 2);
      if (!dogState) { dog.visible = false; return; }
      dog.visible = dogState.status !== "laser";
      dog.position.set(dogState.pos.x, 0, dogState.pos.z);
      dog.rotation.y = -dogState.facing;
      const walking = dogState.status === "crossing";
      legs.forEach((l, i) => (l.rotation.z = walking ? Math.sin(t * 14 + (i % 2) * Math.PI) * 0.5 : 0));
      spark.intensity = dogState.status === "laser" ? 12 + 6 * Math.sin(t * 30) : 0;
      spark.position.set(dogState.pos.x, 0.6, dogState.pos.z);
    },
  };
}
