import * as THREE from "three";

/** Turn the parsed grid into meshes inside `parent`: floor, walls with neon trim, neon sign lights. */
export function buildWorld(parent, map, { signs = [] } = {}) {
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(map.width, map.depth), new THREE.MeshStandardMaterial({ color: 0x141a3a, roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(map.width / 2, 0, map.depth / 2);
  floor.receiveShadow = true;
  parent.add(floor);

  const size = Math.max(map.width, map.depth);
  const grid = new THREE.GridHelper(size, size, 0x233070, 0x1a2350);
  grid.position.set(size / 2, 0.01, size / 2);
  parent.add(grid);

  // One InstancedMesh for all walls: a single draw call regardless of wall count.
  const wallGeo = new THREE.BoxGeometry(1, 1.1, 1); // kept low so walls on the camera side do not hide the player
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x232a5c, roughness: 0.55, metalness: 0.25 });
  const walls = new THREE.InstancedMesh(wallGeo, wallMat, map.walls.size);
  walls.castShadow = walls.receiveShadow = true;
  // Neon strip at the foot of every wall: reads as a glowing outline of the maze.
  const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(1.04, 0.05, 1.04), new THREE.MeshBasicMaterial({ color: 0x29e6ff }), map.walls.size);
  const m = new THREE.Matrix4();
  [...map.walls].forEach((key, i) => {
    const [x, z] = key.split(",").map(Number);
    walls.setMatrixAt(i, m.makeTranslation(x + 0.5, 0.55, z + 0.5));
    trim.setMatrixAt(i, m.makeTranslation(x + 0.5, 0.025, z + 0.5));
  });
  parent.add(walls, trim);

  for (const [x, z, color] of signs) {
    const light = new THREE.PointLight(color, 18, 8, 1.6);
    light.position.set(x, 1.4, z);
    parent.add(light);
  }
}
