import * as THREE from "three";

/**
 * Low-poly person: legs, torso, arms, head. Options give guards a uniform, cap and visor,
 * civilians random clothes. `animate(group, speed, t)` swings arms and legs while walking.
 */
export function createPerson({ body = 0x3a4a8a, legs = 0x1a1f33, skin = 0xd9a77a, visor = null, cap = null, glow = null } = {}) {
  const g = new THREE.Group();
  const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.1, ...extra });
  const legGeo = new THREE.BoxGeometry(0.14, 0.5, 0.16);
  const legL = new THREE.Mesh(legGeo, mat(legs)); legL.position.set(-0.1, 0.25, 0);
  const legR = legL.clone(); legR.position.x = 0.1;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), mat(body)); torso.position.y = 0.75;
  const armGeo = new THREE.BoxGeometry(0.11, 0.44, 0.12);
  const armL = new THREE.Mesh(armGeo, mat(body)); armL.position.set(-0.28, 0.76, 0);
  const armR = armL.clone(); armR.position.x = 0.28;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mat(skin)); head.position.y = 1.18;
  for (const m of [legL, legR, torso, armL, armR, head]) m.castShadow = true;
  g.add(legL, legR, torso, armL, armR, head);
  if (visor !== null) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.08), new THREE.MeshBasicMaterial({ color: visor })); v.position.set(0, 1.2, -0.15); g.add(v); g.userData.visor = v; }
  if (cap !== null) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 16), mat(cap)); c.position.y = 1.32; const brim = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, 0.14), mat(cap)); brim.position.set(0, 1.29, -0.16); g.add(c, brim); }
  if (glow !== null) { const l = new THREE.PointLight(glow, 3, 3, 2); l.position.y = 1.1; g.add(l); }
  g.userData.limbs = { legL, legR, armL, armR };
  return g;
}

/** Walk cycle: limbs swing proportionally to speed (0 = standing still). */
export function animatePerson(g, speed, t) {
  const { legL, legR, armL, armR } = g.userData.limbs;
  const a = Math.min(1, speed / 3) * 0.7 * Math.sin(t * 10);
  legL.rotation.x = a; legR.rotation.x = -a; armL.rotation.x = -a * 0.8; armR.rotation.x = a * 0.8;
  g.children.forEach((c) => { if (c !== legL && c !== legR) c.position.y += 0; });
}
