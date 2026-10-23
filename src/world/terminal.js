import * as THREE from "three";
import { createBeacon } from "./beacon.js";

/** Mission 3 props: the hacking terminal and the locked door (a red force field that drops when unlocked). */
export function createTerminalView(parent, map, { touch = false } = {}) {
  const t = map.terminal;
  const desk = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.75, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a3168, metalness: 0.4 }));
  desk.position.set(t.x + 0.5, 0.375, t.z + 0.5);
  const screenMat = new THREE.MeshBasicMaterial({ color: 0xb26bff });
  const screen = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.38, 0.04), screenMat);
  screen.position.set(t.x + 0.5, 0.95, t.z + 0.6); screen.rotation.x = -0.4;
  const glow = new THREE.PointLight(0xb26bff, 5, 3, 2); glow.position.set(t.x + 0.5, 1.2, t.z + 0.5);
  parent.add(desk, screen, glow);
  // same beacon as the Mission 2 console (2026-10-23): players did not see where to go in Mission 3
  const beacon = createBeacon(parent, { color: 0xb26bff, text: touch ? "TERMINAL" : "TERMINAL · E", position: { x: t.x + 0.5, z: t.z + 0.5 } });

  const doors = [...map.locked].map((k) => {
    const [x, z] = k.split(",").map(Number);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide });
    const field = new THREE.Mesh(new THREE.BoxGeometry(0.15, 1.3, 1), mat);
    field.position.set(x + 0.5, 0.65, z + 0.5);
    parent.add(field);
    return { field, mat, x, z };
  });
  return {
    update(near, unlocked, t) {
      screenMat.color.set(unlocked ? 0x3dff9a : near ? 0xffd23d : 0xb26bff);
      beacon.update(!unlocked, t);
      doors.forEach((d) => { d.field.visible = !unlocked; d.mat.opacity = 0.35 + 0.15 * Math.sin(t * 6); });
    },
  };
}
