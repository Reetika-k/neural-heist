import * as THREE from "three";
import { createPerson, animatePerson } from "../engine/people.js";

const CIV_COLORS = [[0xe0763d, 0x2a3a5a], [0x3dbf9a, 0x3a2a2a], [0xd94f8a, 0x22304a], [0xe8c547, 0x2c2c3c]];

/** A civilian with a tag showing what the drone thinks it is (label + confidence). */
export function createCivilianView(parent, overlay, index) {
  const [body, legs] = CIV_COLORS[index % CIV_COLORS.length];
  const group = createPerson({ body, legs, skin: [0xd9a77a, 0x8d5a3b, 0xc68c62][index % 3] });
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.9 }));
  marker.rotation.x = -Math.PI / 2; marker.position.y = 0.035; marker.visible = false;
  group.add(marker);
  parent.add(group);
  let lastPos = null;
  return {
    group,
    update(c, t, dt, detection) {
      const speed = lastPos && dt > 0 ? Math.hypot(c.pos.x - lastPos.x, c.pos.z - lastPos.z) / dt : 0;
      lastPos = { ...c.pos };
      group.position.set(c.pos.x, 0, c.pos.z);
      group.rotation.y = Math.atan2(-Math.cos(c.facing), -Math.sin(c.facing));
      animatePerson(group, speed, t);
      marker.visible = detection?.label === "guard"; // a false positive is drawn exactly like a real guard mark
    },
    dispose() {},
  };
}

/** Drone: a small quadcopter with spinning rotors and a scan ring showing its radius. */
export function createDroneView(parent, scanRadius) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), new THREE.MeshStandardMaterial({ color: 0x2b3050, metalness: 0.6, roughness: 0.3 }));
  const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), new THREE.MeshBasicMaterial({ color: 0x3dff9a }));
  eye.position.set(0, -0.06, -0.15);
  g.add(body, eye);
  const rotors = [];
  for (const [x, z] of [[-0.24, -0.24], [0.24, -0.24], [-0.24, 0.24], [0.24, 0.24]]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 16), new THREE.MeshBasicMaterial({ color: 0x9fb4ff, transparent: true, opacity: 0.5 }));
    r.position.set(x, 0.06, z); g.add(r); rotors.push(r);
  }
  const light = new THREE.PointLight(0x3dff9a, 4, 4, 2); light.position.y = -0.2; g.add(light);
  parent.add(g);
  const scan = new THREE.Mesh(new THREE.RingGeometry(scanRadius - 0.06, scanRadius, 64), new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.18, depthWrite: false }));
  scan.rotation.x = -Math.PI / 2; scan.position.y = 0.05;
  parent.add(scan);
  return {
    update(d, t) {
      g.position.set(d.pos.x, 2.2 + Math.sin(t * 3) * 0.08, d.pos.z);
      rotors.forEach((r, i) => (r.rotation.y = t * 40 * (i % 2 ? 1 : -1)));
      scan.position.set(d.pos.x, 0.05, d.pos.z);
      scan.material.opacity = 0.06 + 0.04 * Math.sin(t * 4);
    },
    setVisible(on) { g.visible = on; scan.visible = on; },
  };
}

/** Floating label above any character: "GUARD 92%" / "CIVILIAN 71%" / "?" (drone results). */
export function createDetectionTag(overlay) {
  const el = document.createElement("div");
  el.className = "det-tag";
  overlay.appendChild(el);
  const v = new THREE.Vector3();
  return {
    update(pos, detection, camera) {
      if (!detection) { el.style.display = "none"; return; }
      el.style.display = "";
      v.set(pos.x, 1.75, pos.z).project(camera);
      el.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      el.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
      el.dataset.label = detection.label ?? "none";
      el.textContent = detection.label ? `${detection.label.toUpperCase()} ${Math.round(detection.confidence * 100)}%` : "NO MODEL";
    },
    dispose() { el.remove(); },
  };
}
