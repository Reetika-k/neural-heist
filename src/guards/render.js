import * as THREE from "three";
import { GUARD } from "./guard.js";
import { visionPolygon } from "./vision.js";
import { createPerson, animatePerson } from "../engine/people.js";

export const CONE_PALETTES = {
  standard: [0xcfe0ff, 0xffd23d, 0xff2d55],
  colorblind: [0xcfe0ff, 0xf0e442, 0x0072b2], // white → yellow → blue (deuteranopia/protanopia safe)
};
const ICON = { patrol: "", suspicious: "?", search: "👁", chase: "!" };

/** Draws one guard: body, vision cone clipped by walls, and an HTML tag (state icon + suspicion meter). */
export function createGuardView(parent, overlay, map) {
  const group = createPerson({ body: 0x1f2a4d, legs: 0x141a33, skin: 0xb07a55, visor: 0xff2d55, cap: 0x141a33 });
  parent.add(group);
  const marker = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.55, 32), new THREE.MeshBasicMaterial({ color: 0xff2d55, transparent: true, opacity: 0.9 }));
  marker.rotation.x = -Math.PI / 2; marker.position.y = 0.035;
  group.add(marker);

  const rays = 28;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array((rays + 2) * 3), 3));
  const index = [];
  for (let i = 1; i <= rays; i++) index.push(0, i, i + 1);
  geo.setIndex(index);
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const cone = new THREE.Mesh(geo, coneMat);
  cone.frustumCulled = false;
  parent.add(cone);

  const tag = document.createElement("div");
  tag.className = "guard-tag";
  tag.innerHTML = '<span class="icon"></span><div class="meter"><i></i></div>';
  overlay.appendChild(tag);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  let lastPos = null;

  return {
    update(g, camera, { revealed = true, palette = "standard", range = GUARD.range, fov = GUARD.fov, t = 0, dt = 0.016 } = {}) {
      const speed = lastPos && dt > 0 ? Math.hypot(g.pos.x - lastPos.x, g.pos.z - lastPos.z) / dt : 0;
      lastPos = { ...g.pos };
      group.position.set(g.pos.x, 0, g.pos.z);
      group.rotation.y = Math.atan2(-Math.cos(g.facing), -Math.sin(g.facing)); // local −z faces (cos f, sin f)
      animatePerson(group, speed, t);
      marker.visible = revealed;

      cone.visible = revealed;
      if (revealed) {
        const pts = visionPolygon(map, g, range, fov, rays);
        const arr = geo.attributes.position.array;
        arr[0] = g.pos.x; arr[1] = 0.04; arr[2] = g.pos.z;
        pts.forEach((p, i) => { arr[(i + 1) * 3] = p.x; arr[(i + 1) * 3 + 1] = 0.04; arr[(i + 1) * 3 + 2] = p.z; });
        geo.attributes.position.needsUpdate = true;
        const [a, b, d] = (CONE_PALETTES[palette] || CONE_PALETTES.standard).map((x) => new THREE.Color(x));
        const s = g.state === "chase" ? 1 : g.suspicion;
        c.copy(s < 0.5 ? a.lerp(b, s / 0.5) : b.lerp(d, (s - 0.5) / 0.5));
        coneMat.color.copy(c);
        coneMat.opacity = 0.1 + 0.18 * s; // kept low: bloom brightens anything near white
      }

      v.set(g.pos.x, 2.0, g.pos.z).project(camera);
      tag.style.left = `${((v.x + 1) / 2) * innerWidth}px`;
      tag.style.top = `${((1 - v.y) / 2) * innerHeight}px`;
      tag.dataset.state = g.state;
      tag.style.display = revealed || g.state === "chase" ? "" : "none"; // a chasing guard is obvious even when unidentified
      tag.querySelector(".icon").textContent = ICON[g.state];
      tag.querySelector(".meter i").style.width = `${Math.round(g.suspicion * 100)}%`;
      tag.classList.toggle("quiet", g.state === "patrol" && g.suspicion === 0);
    },
    dispose() { tag.remove(); },
  };
}
