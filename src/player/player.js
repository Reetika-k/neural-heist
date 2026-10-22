import * as THREE from "three";
import { createPerson } from "../engine/people.js";

/** The hacker: dark hoodie with cyan trim, a cyan visor and a ground ring so you never lose them. */
export function createPlayerMesh(scene) {
  const group = createPerson({ body: 0x20243d, legs: 0x141729, skin: 0xc68c62, visor: 0x29e6ff, glow: 0x29e6ff });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.5, 32), new THREE.MeshBasicMaterial({ color: 0x29e6ff, transparent: true, opacity: 0.9 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  group.add(ring);
  scene.add(group);
  return group;
}
