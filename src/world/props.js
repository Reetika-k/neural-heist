import * as THREE from "three";

/** The data drive (spinning glowing crystal) and the exit pad (locked until you hold the drive). */
export function createProps(parent) {
  const drive = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), new THREE.MeshStandardMaterial({ color: 0xffd23d, emissive: 0xffa800, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.2 }));
  gem.position.y = 0.7;
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 0.12, 24), new THREE.MeshStandardMaterial({ color: 0x2a3168 }));
  base.position.y = 0.06;
  const light = new THREE.PointLight(0xffc23d, 10, 5, 1.6);
  light.position.y = 0.9;
  drive.add(gem, base, light);
  parent.add(drive);

  const exit = new THREE.Group();
  const padMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.25 });
  const pad = new THREE.Mesh(new THREE.CircleGeometry(0.75, 40), padMat);
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03;
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.6 });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.8, 40), ringMat);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
  const beamMat = new THREE.MeshBasicMaterial({ color: 0x3dff9a, transparent: true, opacity: 0.0, depthWrite: false, side: THREE.DoubleSide });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 2.4, 32, 1, true), beamMat);
  beam.position.y = 1.2;
  const exitLight = new THREE.PointLight(0x3dff9a, 0, 4, 1.6);
  exitLight.position.y = 0.8;
  exit.add(pad, ring, beam, exitLight);
  parent.add(exit);

  return {
    update(mission, t) {
      drive.visible = !!mission.drive && !mission.hasDrive;
      if (mission.drive) drive.position.set(mission.drive.x, 0, mission.drive.z);
      gem.rotation.y = t * 1.6; gem.position.y = 0.7 + Math.sin(t * 2.4) * 0.08;
      exit.position.set(mission.exit.x, 0, mission.exit.z);
      const open = mission.hasDrive;
      const pulse = 0.5 + 0.5 * Math.sin(t * 4);
      padMat.opacity = open ? 0.35 + 0.2 * pulse : 0.12;
      ringMat.opacity = open ? 0.9 : 0.3;
      beamMat.opacity = open ? 0.12 + 0.08 * pulse : 0;
      exitLight.intensity = open ? 8 : 0;
      ringMat.color.set(open ? 0x3dff9a : 0x4a5a8a);
      padMat.color.set(open ? 0x3dff9a : 0x4a5a8a);
    },
  };
}
