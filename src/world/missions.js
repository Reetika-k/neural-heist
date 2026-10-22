// Mission registry: map, guards, rules, the Lab you train in, and the story shown in the briefing.
import { MISSION_1, MISSION_1_GUARDS, MISSION_1_CIVILIANS, MISSION_2, MISSION_2_GUARDS, MISSION_3, MISSION_3_GUARDS } from "./map.js";

export const MISSIONS = [
  {
    id: 1, key: "rooftop", name: "Rooftop", rows: MISSION_1, guards: MISSION_1_GUARDS, civilians: MISSION_1_CIVILIANS,
    rules: { parTime: 45, alarmTime: 25 },
    lab: "classifier", teammate: "drone",
    concept: "Image classification",
    briefing: "VeloraTech's rooftop relay holds a data drive with the city's stolen water-meter records. Security mixes guards with night-shift staff, and in the dark you cannot tell them apart. Train your drone to recognise guards from camera snapshots. The drone reveals the vision cones of everyone it identifies as a guard. A guard it misses stays invisible.",
    objective: { find: "Find the data drive", exit: "Reach the exit" },
    signs: [[9.5, 2.5, 0xff3d9a, "VELORA"], [6.5, 9.5, 0x29e6ff, "चाय · CHAI"], [13.5, 3.5, 0xb26bff, "24×7"]],
  },
  {
    id: 2, key: "vault", name: "Laser Vault", rows: MISSION_2, guards: MISSION_2_GUARDS, civilians: [],
    rules: { parTime: 70, alarmTime: 25 },
    lab: "qlearning", teammate: "dog", vaultOrigin: { x: 13, z: 3 },
    concept: "Reinforcement learning",
    briefing: "The second drive sits inside VeloraTech's laser vault. No human fits through the vent, but your robot dog does. Design its rewards and train it with Q-learning. In the mission, reach the console beside the vault and press E: the dog crosses the lasers by following exactly the policy it learned. If it touches a laser, the alarm goes off.",
    objective: { find: "Go to the glowing console, press E: your dog fetches the drive", working: "Robot dog crossing the vault…", exit: "Reach the exit" },
    // 2026-10-22: "VAULT" used to sit on a lobby wall at (5.5, 4.5), far from the vault, and led players the wrong way;
    // it now hangs on the vault's own wall beside the console. "NO ENTRY" became "DOG ONLY" to say who may cross.
    // signs: [[5.5, 4.5, 0x29e6ff, "VAULT"], [5.5, 12.5, 0xff3d9a, "पान · PAAN"], [17.5, 13.5, 0xb26bff, "NO ENTRY"]],
    signs: [[12.5, 5.5, 0x29e6ff, "VAULT"], [5.5, 12.5, 0xff3d9a, "पान · PAAN"], [17.5, 13.5, 0xb26bff, "DOG ONLY"]],
  },
  {
    id: 3, key: "executive", name: "Executive Floor", rows: MISSION_3, guards: MISSION_3_GUARDS, civilians: [],
    rules: { parTime: 75, alarmTime: 25 },
    lab: "rag", teammate: "assistant", password: "KESTREL37",
    concept: "Retrieval-augmented generation",
    briefing: "The last drive is locked in the CEO's room on the executive floor. We leaked 40 internal emails; somewhere in them is the new vault password, but nobody wrote it down in one place. Build a search index for your hacking assistant. At the terminal (E), it retrieves the most relevant emails and asks a language model to work out the password. Three wrong passwords set off the alarm.",
    objective: { find: "Hack the terminal (E)", unlocked: "Grab the data drive", exit: "Reach the exit" },
    signs: [[3.5, 3.5, 0xb26bff, "EXECUTIVE"], [6.5, 9.5, 0x29e6ff, "VELORA"], [17.5, 7.5, 0xffd23d, "PRIVATE"]],
  },
];

export const missionById = (id) => MISSIONS.find((m) => m.id === id);
