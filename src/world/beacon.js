import * as THREE from "three";

/**
 * Objective beacon: a pulsing light column, a floor ring and a floating label that shows through walls.
 * First made for the Mission 2 console (players could not find it); since 2026-10-23 every objective uses it:
 * console, terminal, data drive and exit, so all missions look alike.
 */
export function createBeacon(parent, { color = 0x3dff9a, text = "", position = { x: 0, z: 0 }, labelY = 2.2, width = 2.4 } = {}) {
  const css = `#${color.toString(16).padStart(6, "0")}`;
  const group = new THREE.Group();
  const beamMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false, toneMapped: false });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 4, 20, 1, true), beamMat); beam.position.y = 2;
  const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.68, 40), ringMat); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03;
  const tag = document.createElement("canvas"); tag.width = 512; tag.height = 128;
  const g = tag.getContext("2d");
  g.fillStyle = "rgba(4,18,26,.85)"; g.strokeStyle = css; g.lineWidth = 6;
  g.beginPath(); g.roundRect(6, 6, 500, 116, 28); g.fill(); g.stroke();
  g.fillStyle = css; g.font = `800 ${text.length > 12 ? 48 : 58}px Orbitron, Inter, sans-serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText(text, 256, 68);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tag), depthTest: false, transparent: true, toneMapped: false }));
  label.scale.set(width, width / 4, 1); label.position.y = labelY; label.renderOrder = 10;
  group.add(beam, ring, label);
  group.position.set(position.x, 0, position.z);
  parent.add(group);
  return {
    group,
    update(visible, t) {
      group.visible = visible;
      if (!visible) return;
      const pulse = 0.5 + 0.5 * Math.sin(t * 3);
      beamMat.opacity = 0.14 + 0.14 * pulse; ringMat.opacity = 0.5 + 0.4 * pulse;
      ring.scale.setScalar(1 + 0.12 * pulse); label.position.y = labelY + 0.08 * Math.sin(t * 2);
    },
  };
}
