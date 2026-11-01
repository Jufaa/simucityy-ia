/** Deterministic visual-only traits; no citizen or solver state is changed. */
export interface CitizenAppearance {
  skin: number;
  hair: number;
  shirt: number;
  trousers: number;
  shoes: number;
}
const skins = [0xf0c8a0, 0xdca777, 0xc58a5c, 0x9c6746, 0x704a35];
const shirts = [0x447dad, 0x9f596a, 0x66966a, 0xcc9152, 0x8072b0, 0x53a5a2];
const trousers = [0x31465c, 0x575963, 0x746451, 0x354d46];
const hairs = [0x28211e, 0x583b29, 0x997341, 0xb8b4aa];
export function citizenAppearance(id: string): CitizenAppearance {
  let state = 2166136261;
  for (let index = 0; index < id.length; index++)
    state = Math.imul(state ^ id.charCodeAt(index), 16777619) >>> 0;
  const choose = (colors: readonly number[]) => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return colors[state % colors.length] ?? 0;
  };
  return {
    skin: choose(skins),
    hair: choose(hairs),
    shirt: choose(shirts),
    trousers: choose(trousers),
    shoes: 0x292b31,
  };
}
export interface CitizenLimbGait {
  hip: number;
  knee: number;
  footY: number;
  footZ: number;
  arm: number;
  elbow: number;
}
export interface CitizenGait {
  rootY: number;
  headBob: number;
  left: CitizenLimbGait;
  right: CitizenLimbGait;
}
export function createCitizenGait(): CitizenGait {
  const limb = (): CitizenLimbGait => ({
    hip: 0,
    knee: 0,
    footY: 0.1,
    footZ: 0,
    arm: 0,
    elbow: 0,
  });
  return { rootY: 0, headBob: 0, left: limb(), right: limb() };
}
/** Two-link legs solve to grounded stance feet; one reusable output avoids frame allocations. */
export function writeCitizenGait(
  target: CitizenGait,
  phase: number,
  walking: boolean,
): void {
  const wave = walking ? Math.sin(phase) : 0;
  target.rootY = walking ? -0.055 + Math.abs(wave) * 0.015 : 0;
  target.headBob = walking ? Math.abs(wave) * 0.012 : 0;
  const leg = (out: CitizenLimbGait, side: number) => {
    out.footY = 0.1 + (walking ? Math.max(0, wave * side) * 0.12 : 0);
    out.footZ = walking ? Math.cos(phase) * side * 0.24 : 0;
    const down = 1 + target.rootY - out.footY;
    const distance = Math.min(0.9, Math.hypot(down, out.footZ));
    out.knee = walking
      ? Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (distance * distance - 2 * 0.45 * 0.45) / (2 * 0.45 * 0.45),
            ),
          ),
        )
      : 0;
    out.hip = walking ? -Math.atan2(out.footZ, down) - out.knee / 2 : 0;
    out.arm = wave * side * 0.38;
    out.elbow = walking ? -0.2 - Math.max(0, -wave * side) * 0.35 : 0;
  };
  leg(target.left, 1);
  leg(target.right, -1);
}
