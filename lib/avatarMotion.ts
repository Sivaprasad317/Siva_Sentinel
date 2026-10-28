// Motion maths for Siva's 3D presenter (the man who walks in and talks). Pure functions only, so the
// walk, greeting and body language can be unit-tested without a browser or WebGL.
//
// Axes (three.js): the presenter faces +z (towards the camera), y is up, his LEFT is +x.
// Joint angles are in radians. For a limb hanging down, a NEGATIVE x rotation swings it FORWARD.

export type PresenterState = 'idle' | 'listening' | 'thinking' | 'speaking';

/** The walk-in: start far back in the fog, walk at a steady pace, then slow down into the spotlight. */
export const WALK = { startZ: -12, endZ: 0, speed: 1.6, slowDistance: 2.6 } as const;

/** Where he is `t` seconds after the walk started, how fast he is going, and whether he has arrived. */
export function walkAt(t: number): { z: number; speed: number; done: boolean } {
  const D = WALK.endZ - WALK.startZ;
  const v = WALK.speed;
  const cruise = D - WALK.slowDistance; // distance at full pace
  const tCruise = cruise / v;
  const tSlow = (2 * WALK.slowDistance) / v; // constant deceleration down to 0
  if (t <= 0) return { z: WALK.startZ, speed: v, done: false };
  if (t < tCruise) return { z: WALK.startZ + v * t, speed: v, done: false };
  const s = Math.min(t - tCruise, tSlow);
  const a = v / tSlow;
  const z = WALK.startZ + cruise + v * s - 0.5 * a * s * s;
  const speed = Math.max(0, v - a * s);
  return { z: Math.min(z, WALK.endZ), speed, done: s >= tSlow };
}
export const WALK_SECONDS = (WALK.endZ - WALK.startZ - WALK.slowDistance) / WALK.speed + (2 * WALK.slowDistance) / WALK.speed;

/** Radians of walk cycle per unit walked (about 1.4 units per full left+right stride). */
export const STRIDE_RAD_PER_UNIT = 4.4;

export function greetingFor(hour: number): 'Good morning' | 'Good afternoon' | 'Good evening' {
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

/** Hour of the day (0-23) in a time zone. */
export function hourIn(tz: string, now = new Date()): number {
  const h = Number(now.toLocaleString('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }));
  return Number.isFinite(h) ? h % 24 : now.getHours();
}

/** What he says when he arrives. */
export function greetLine(hour: number, title: string): string {
  const g = greetingFor(hour);
  return `${g}, ${title}. I am Siva. How can I help you today?`;
}

export interface Pose {
  hipY: number; // pelvis height offset (bob)
  spineX: number; // lean forward (+)
  spineY: number; // twist
  spineZ: number; // side bend
  chest: number; // breathing scale (1 = rest)
  headX: number; // nod down (+)
  headY: number; // turn (+ = his left)
  headZ: number; // tilt
  lShX: number; lShZ: number; lElX: number; lElZ: number;
  rShX: number; rShZ: number; rElX: number; rElZ: number;
  lHipX: number; lKneeX: number; rHipX: number; rKneeX: number;
  mouth: number; // 0 closed … 1 open
  brow: number; // 0 rest … 1 raised
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));

export interface PoseInput {
  state: PresenterState;
  /** seconds since the scene started */
  t: number;
  /** walk cycle phase (radians) and strength 0..1 (0 = standing) */
  gait: { phase: number; amp: number };
  /** 0..1: seconds-decaying pulse from spoken word boundaries */
  wordPulse: number;
  /** 0..1 while waving hello */
  wave: number;
  /** 0..1 quick "got it" nod after he hears you */
  ack: number;
  /** pointer position -1..1 (head follows it a little) */
  look: { x: number; y: number };
}

/** The target body pose for this moment. The renderer eases towards it every frame. */
export function poseFor(p: PoseInput): Pose {
  const { t, gait, state } = p;
  const s = Math.sin(gait.phase);
  const a = gait.amp;
  const breathe = Math.sin(t * 1.6);

  const pose: Pose = {
    hipY: Math.abs(Math.cos(gait.phase)) * 0.035 * a + breathe * 0.002,
    spineX: 0.03 + 0.04 * a,
    spineY: s * 0.08 * a,
    spineZ: Math.sin(t * 0.45) * 0.012 * (1 - a),
    chest: 1 + breathe * 0.012,
    headX: 0.02 - p.look.y * 0.12,
    headY: p.look.x * 0.32 * (1 - a),
    headZ: 0,
    // Arms swing opposite to the legs while walking; relaxed and slightly out when standing.
    lShX: s * 0.38 * a + 0.02,
    lShZ: 0.09,
    lElX: -0.18 - 0.25 * a,
    lElZ: 0,
    rShX: -s * 0.38 * a + 0.02,
    rShZ: -0.09,
    rElX: -0.18 - 0.25 * a,
    rElZ: 0,
    // Left leg forward when sin > 0 (negative x = forward); the knee bends on the back swing.
    lHipX: -s * 0.45 * a,
    lKneeX: 0.06 + Math.max(0, Math.sin(gait.phase - 1.2)) * 0.85 * a,
    rHipX: s * 0.45 * a,
    rKneeX: 0.06 + Math.max(0, Math.sin(gait.phase + Math.PI - 1.2)) * 0.85 * a,
    mouth: 0,
    brow: 0,
  };

  if (state === 'listening') {
    // Leans in, tilts his head and raises his brows: "I'm listening".
    pose.spineX += 0.06;
    pose.headZ = 0.13;
    pose.headX += 0.06 + Math.sin(t * 2.2) * 0.02;
    pose.brow = 0.8;
    pose.lElX = -0.35;
    pose.rElX = -0.35;
  } else if (state === 'thinking') {
    // Right hand to his chin, eyes up.
    pose.rShX = -1.25;
    pose.rShZ = 0.32;
    pose.rElX = -2.05;
    pose.headX = -0.1;
    pose.headY += 0.12;
    pose.brow = 0.4;
  } else if (state === 'speaking') {
    // Talks with his hands: both forearms up, moving with the speech.
    const g1 = Math.sin(t * 2.3) * 0.5 + Math.sin(t * 3.7) * 0.25;
    const g2 = Math.sin(t * 2.0 + 1.3) * 0.5 + Math.sin(t * 3.1 + 0.4) * 0.25;
    pose.lShX = -0.22 + g1 * 0.12;
    pose.lShZ = 0.16 + g1 * 0.05;
    pose.lElX = -1.05 + g1 * 0.35;
    pose.lElZ = -0.25;
    pose.rShX = -0.22 + g2 * 0.12;
    pose.rShZ = -0.16 - g2 * 0.05;
    pose.rElX = -1.05 + g2 * 0.35;
    pose.rElZ = 0.25;
    pose.headX += Math.sin(t * 3.1) * 0.035 + p.wordPulse * 0.03;
    pose.headY += Math.sin(t * 0.9) * 0.08;
    pose.brow = 0.25 + p.wordPulse * 0.4;
    const babble = 0.28 + 0.3 * Math.abs(Math.sin(t * 13.0) * Math.sin(t * 5.3 + 0.7));
    pose.mouth = clamp(Math.max(babble, p.wordPulse * 0.95), 0, 1);
  }

  if (p.wave > 0) {
    // Right arm up and out, forearm waving.
    const w = p.wave;
    pose.rShZ = pose.rShZ * (1 - w) + -2.35 * w;
    pose.rShX = pose.rShX * (1 - w) + -0.15 * w;
    pose.rElX = pose.rElX * (1 - w) + -0.25 * w;
    pose.rElZ = pose.rElZ * (1 - w) + Math.sin(t * 9) * 0.45 * w;
    pose.headZ += 0.06 * w;
    pose.brow = Math.max(pose.brow, 0.6 * w);
  }
  if (p.ack > 0) pose.headX += Math.sin(p.ack * Math.PI * 2) * 0.16; // quick nod: "got it"
  return pose;
}

/** Frame-rate independent easing towards a target (k = responsiveness per second). */
export function approach(current: number, target: number, k: number, dt: number): number {
  return target + (current - target) * Math.exp(-k * dt);
}
