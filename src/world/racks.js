import * as THREE from "three";

/**
 * Mission 4 server racks: dark cabinets with LED strips. Flagged racks (the group the player chose) glow cyan and show
 * their name; a checked wrong rack turns red, the one holding the drive turns green.
 */
export function createRackView(parent, map, servers) {
  const cabinetGeo = new THREE.BoxGeometry(0.9, 1.5, 0.9), ledGeo = new THREE.BoxGeometry(0.7, 0.06, 0.02);
  const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x1b2148, metalness: 0.5, roughness: 0.45 });
  const racks = map.racks.map((cell, i) => {
    const g = new THREE.Group(); g.position.set(cell.x + 0.5, 0, cell.z + 0.5);
    const body = new THREE.Mesh(cabinetGeo, cabinetMat); body.position.y = 0.75; body.castShadow = true;
    const ledMat = new THREE.MeshBasicMaterial({ color: 0x2a6bff, toneMapped: false });
    const leds = [0.35, 0.6, 0.85, 1.1, 1.35].flatMap((y) => [-1, 1].map((side) => { const l = new THREE.Mesh(ledGeo, ledMat); l.position.set(0, y, side * 0.461); return l; }));
    const glow = new THREE.PointLight(0x29e6ff, 0, 2.2, 2); glow.position.y = 1.2;
    // name label, shown only when flagged
    const tag = document.createElement("canvas"); tag.width = 128; tag.height = 48;
    const tg = tag.getContext("2d"); tg.fillStyle = "rgba(4,18,26,.85)"; tg.strokeStyle = "#29e6ff"; tg.lineWidth = 4;
    tg.beginPath(); tg.roundRect(3, 3, 122, 42, 12); tg.fill(); tg.stroke();
    tg.fillStyle = "#29e6ff"; tg.font = "800 26px Orbitron, Inter, sans-serif"; tg.textAlign = "center"; tg.textBaseline = "middle"; tg.fillText(servers[i].id, 64, 26);
    const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(tag), depthTest: false, transparent: true, toneMapped: false }));
    label.scale.set(0.9, 0.34, 1); label.position.y = 2; label.renderOrder = 10; label.visible = false;
    g.add(body, ...leds, glow, label); parent.add(g);
    return { id: servers[i].id, ledMat, glow, label, phase: i * 0.7 };
  });
  return {
    /** sc: the scanner state; nearIndex: rack the player could check now (highlighted yellow), or null. */
    update(sc, nearIndex, t) {
      racks.forEach((r, i) => {
        const state = sc?.checked.get(r.id), flagged = sc?.flagged.has(r.id);
        const pulse = 0.5 + 0.5 * Math.sin(t * 4 + r.phase);
        const color = state === "found" ? 0x3dff9a : state === "wrong" ? 0xff2d55 : i === nearIndex ? 0xffd23d : flagged ? 0x29e6ff : 0x2a6bff;
        r.ledMat.color.setHex(color);
        r.glow.color.setHex(color);
        r.glow.intensity = state ? 1.5 : flagged || i === nearIndex ? 1 + 1.5 * pulse : 0;
        r.label.visible = !!flagged && !state;
      });
    },
  };
}
