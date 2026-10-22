import * as THREE from "three";

/** Neon text sign on a glowing panel (canvas texture). */
function neonSign(text, color) {
  const c = document.createElement("canvas"); c.width = 512; c.height = 128;
  const g = c.getContext("2d");
  const hex = `#${color.toString(16).padStart(6, "0")}`;
  g.fillStyle = "rgba(5,8,24,0.85)"; g.fillRect(0, 0, 512, 128);
  g.strokeStyle = hex; g.lineWidth = 6; g.strokeRect(6, 6, 500, 116);
  g.font = "bold 60px 'Orbitron', 'Kohinoor Devanagari', 'Noto Sans Devanagari', sans-serif"; g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = hex; g.shadowBlur = 24; g.fillStyle = "#ffffff"; g.fillText(text, 256, 68);
  g.shadowBlur = 0; g.fillStyle = hex; g.globalAlpha = 0.6; g.fillText(text, 256, 68);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(new THREE.PlaneGeometry(3.4, 0.85), new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
}

/**
 * Set dressing that never affects gameplay: neon signs above walls, water tanks and AC units on
 * wall tops (rooftop feel), and drifting neon dust particles.
 */
export function addDecor(parent, map, { signs = [], seed = 1 } = {}) {
  const facing = Math.atan2(6, 8); // turn signs towards the camera
  for (const [x, z, color, text] of signs) {
    if (!text) continue;
    const s = neonSign(text, color);
    s.position.set(x, 2.6, z); s.rotation.y = facing; s.rotation.x = -0.5; // tilted towards the high camera
    parent.add(s);
  }
  // wall-top clutter (deterministic positions)
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const tankMat = new THREE.MeshStandardMaterial({ color: 0x3a4278, metalness: 0.3, roughness: 0.6 });
  const acMat = new THREE.MeshStandardMaterial({ color: 0x5560a0, metalness: 0.5, roughness: 0.4 });
  const fan = new THREE.MeshBasicMaterial({ color: 0x29e6ff });
  const wallCells = [...map.walls].map((k) => k.split(",").map(Number)).filter(([x, z]) => x > 0 && z > 0 && x < map.width - 1 && z < map.depth - 1);
  for (const [x, z] of wallCells) {
    const roll = rnd();
    if (roll < 0.06) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.55, 16), tankMat);
      tank.position.set(x + 0.5, 1.1 + 0.28, z + 0.5); tank.castShadow = true; parent.add(tank);
    } else if (roll < 0.12) {
      const ac = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.45), acMat);
      ac.position.set(x + 0.5, 1.1 + 0.15, z + 0.5); parent.add(ac);
      const f = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), fan); f.rotation.x = -Math.PI / 2; f.position.set(x + 0.5, 1.26, z + 0.5); parent.add(f);
    }
  }
  // neon dust
  const N = 160, pos = new Float32Array(N * 3), base = [];
  for (let i = 0; i < N; i++) { pos[i * 3] = rnd() * map.width; pos[i * 3 + 1] = 0.3 + rnd() * 2.5; pos[i * 3 + 2] = rnd() * map.depth; base.push(rnd() * Math.PI * 2); }
  const geo = new THREE.BufferGeometry(); geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x8fdcff, size: 0.06, transparent: true, opacity: 0.7, depthWrite: false }));
  parent.add(dust);
  return {
    update(t) {
      const a = geo.attributes.position.array;
      for (let i = 0; i < N; i++) { a[i * 3 + 1] = 0.3 + ((base[i] + t * 0.15) % 2.6); a[i * 3] += Math.sin(t + base[i]) * 0.002; }
      geo.attributes.position.needsUpdate = true;
    },
  };
}
