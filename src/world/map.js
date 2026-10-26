// Mission maps as character grids. One cell = 1 world unit.
//   # wall   . floor   P player start   D data drive   E exit
//   V vault floor (robot-dog only)   C vault console   T hacking terminal   L locked door
// The grid is the single source of truth: walls are built from it, collisions read it,
// and guards, civilians and the robot dog plan their routes on it.

export const MISSION_1 = [
  "####################",
  "#P.......#.........#",
  "#........#.........#",
  "#..####..#..####...#",
  "#..#..............##",
  "#..#.....######....#",
  "#........#.........#",
  "####..####....##...#",
  "#.............##...#",
  "#....####..........#",
  "#.......#.....######",
  "#E......#.........D#",
  "####################",
];

// Guard patrol routes for Mission 1 (grid cells; guards walk between them with A*).
export const MISSION_1_GUARDS = [
  { id: "G1", patrol: [{ x: 11, z: 1 }, { x: 17, z: 1 }, { x: 17, z: 4 }, { x: 11, z: 4 }] },
  { id: "G2", patrol: [{ x: 3, z: 8 }, { x: 12, z: 8 }, { x: 12, z: 11 }, { x: 3, z: 11 }] },
];

export const MISSION_1_CIVILIANS = [
  { id: "C1", route: [{ x: 5, z: 6 }, { x: 13, z: 6 }, { x: 13, z: 4 }] },
  { id: "C2", route: [{ x: 15, z: 8 }, { x: 18, z: 8 }, { x: 18, z: 11 }, { x: 10, z: 11 }] },
  { id: "C3", route: [{ x: 2, z: 4 }, { x: 2, z: 9 }, { x: 6, z: 9 }] },
];

// Mission 2: the laser vault (V) sits at x 13–22, z 3–12; the console (C) is outside its west wall.
export const MISSION_2 = [
  "########################",
  "#P.....................#",
  "#...........############",
  "#....#......#VVVVVVVVVV#",
  "#....#......#VVVVVVVVVV#",
  "#....####...#VVVVVVVVVV#",
  "#...........#VVVVVVVVVV#",
  "#..###......#VVVVVVVVVV#",
  "#..#......C.#VVVVVVVVVV#",
  "#..#........#VVVVVVVVVV#",
  "#......##...#VVVVVVVVVV#",
  "#...........#VVVVVVVVVV#",
  "#....#......#VVVVVVVVVV#",
  "#....#......############",
  "#E.....................#",
  "########################",
];
export const MISSION_2_GUARDS = [
  { id: "G1", patrol: [{ x: 4, z: 1 }, { x: 21, z: 1 }] },
  { id: "G2", patrol: [{ x: 6, z: 6 }, { x: 10, z: 6 }, { x: 10, z: 11 }, { x: 6, z: 11 }] },
  { id: "G3", patrol: [{ x: 21, z: 14 }, { x: 6, z: 14 }] },
];

// Mission 3: executive floor. The hacking terminal (T) opens the locked door (L) to the drive room.
export const MISSION_3 = [
  "######################",
  "#P......#............#",
  "#.......#............#",
  "#..##...#...####.....#",
  "#..##.......#........#",
  "#...........#..###...#",
  "#######..####........#",
  "#.......T....#########",
  "#............L.....D.#",
  "#....###.....#.......#",
  "#....#.......#.......#",
  "#............#########",
  "#E...................#",
  "######################",
];
export const MISSION_3_GUARDS = [
  { id: "G1", patrol: [{ x: 9, z: 1 }, { x: 20, z: 1 }, { x: 20, z: 4 }, { x: 13, z: 4 }] },
  { id: "G2", patrol: [{ x: 2, z: 8 }, { x: 11, z: 8 }, { x: 11, z: 11 }, { x: 2, z: 11 }] },
  { id: "G3", patrol: [{ x: 14, z: 12 }, { x: 20, z: 12 }, { x: 20, z: 6 }, { x: 14, z: 6 }] },
];

// Mission 4: the server farm. 24 racks (R) in four rows; the racks block movement and sight like walls, so the
// rows are cover. One rack holds the drive; which one is found by clustering the servers' readings in the Lab.
export const MISSION_4 = [
  "########################",
  "#P.....................#",
  "#......................#",
  "#...RRRRRR..RRRRRR.....#",
  "#......................#",
  "#......................#",
  "#...RRRRRR..RRRRRR.....#",
  "#......................#",
  "#......................#",
  "#######......###########",
  "#......................#",
  "#E.....................#",
  "########################",
];
export const MISSION_4_GUARDS = [
  { id: "G1", patrol: [{ x: 2, z: 4 }, { x: 21, z: 4 }] },
  { id: "G2", patrol: [{ x: 21, z: 7 }, { x: 2, z: 7 }] },
  { id: "G3", patrol: [{ x: 8, z: 10 }, { x: 21, z: 10 }] },
];

export function parseMap(rows) {
  const walls = new Set(), vault = new Set(), locked = new Set(), unlocked = new Set();
  let start = { x: 1, z: 1 }, drive = null, exit = null, console = null, terminal = null;
  const racks = [], rackSet = new Set(); // server racks, in reading order (row by row): rack i holds server i
  const width = rows[0].length;
  rows.forEach((row, z) => {
    if (row.length !== width) throw new Error(`Map row ${z} has ${row.length} cells, expected ${width}`);
    [...row].forEach((ch, x) => {
      const k = `${x},${z}`;
      if (ch === "#") walls.add(k);
      if (ch === "V") vault.add(k);
      if (ch === "L") locked.add(k);
      if (ch === "P") start = { x, z };
      if (ch === "D") drive = { x, z };
      if (ch === "E") exit = { x, z };
      if (ch === "C") console = { x, z };
      if (ch === "T") terminal = { x, z };
      if (ch === "R") { racks.push({ x, z }); rackSet.add(k); }
    });
  });
  return {
    width, depth: rows.length, walls, vault, locked, unlocked, start, drive, exit, console, terminal, racks,
    // RETIRED 2026-10-26: walls only; server racks (Mission 4) now block sight and movement too.
    // isWall: (x, z) => walls.has(`${x},${z}`),
    // isBlocked: (x, z) => { const k = `${x},${z}`; return walls.has(k) || vault.has(k) || (locked.has(k) && !unlocked.has(k)); },
    /** Walls (and server racks) block movement and sight. */
    isWall: (x, z) => { const k = `${x},${z}`; return walls.has(k) || rackSet.has(k); },
    /** What walkers (player, guards, civilians) cannot enter: walls, racks, the vault floor, locked doors. */
    isBlocked: (x, z) => { const k = `${x},${z}`; return walls.has(k) || rackSet.has(k) || vault.has(k) || (locked.has(k) && !unlocked.has(k)); },
    unlockAll() { for (const k of locked) unlocked.add(k); },
    isLockedDoor: (x, z) => { const k = `${x},${z}`; return locked.has(k) && !unlocked.has(k); },
  };
}
