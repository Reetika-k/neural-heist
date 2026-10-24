// Player settings, remembered in localStorage (wrapped in try/catch for private browsing).
export const DIFFICULTY = {
  easy: { label: "Easy", range: 6, speedMul: 0.85, fillMul: 0.75 },
  normal: { label: "Normal", range: 8, speedMul: 1, fillMul: 1 },
  hard: { label: "Hard", range: 10, speedMul: 1.15, fillMul: 1.3 },
};
const KEY = "neural-heist.settings";
// 2026-10-24: music (separate level, default 40 %) and footsteps (on/off) added after "the sound is so annoying".
// export const DEFAULT_SETTINGS = { difficulty: "normal", volume: 0.7, muted: false, quality: "high", palette: "standard" };
export const DEFAULT_SETTINGS = { difficulty: "normal", volume: 0.7, muted: false, music: 0.4, footsteps: true, quality: "high", palette: "standard" };

export function loadSettings() {
  try { return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { ...DEFAULT_SETTINGS }; }
}
export function saveSettings(s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* keep playing */ } }
export const tuningFor = (s) => DIFFICULTY[s.difficulty] ?? DIFFICULTY.normal;
