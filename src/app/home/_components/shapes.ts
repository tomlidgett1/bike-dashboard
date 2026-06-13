/**
 * Point-cloud target shapes for the morphing hero on /home.
 *
 * Every shape returns `count` points packed as xyz triples in a Float32Array,
 * all roughly bounded by the same radius (~2.4) so the GPU morph between them
 * stays visually balanced. The shader lerps between A -> B -> C as you scroll:
 *
 *   A = spinning bike wheel   (motion / cycling)
 *   B = the Yellow Jersey "Y" (who we are)
 *   C = a globe of points     (the marketplace network)
 */

export type HomeShapes = {
  count: number;
  /** A — bike wheel (rim + spokes + hub), lives in the XY plane. */
  wheel: Float32Array;
  /** B — the "Y" monogram, lives in the XY plane facing camera. */
  mono: Float32Array;
  /** C — an even globe of points (fibonacci sphere). */
  sphere: Float32Array;
  /** Per-point 0..1 randomness used for colour mix + twinkle phase. */
  rand: Float32Array;
  /** Per-point size multiplier (most small, a few bright "stars"). */
  scale: Float32Array;
};

export function generateHomeShapes(count: number): HomeShapes {
  const wheel = new Float32Array(count * 3);
  const mono = new Float32Array(count * 3);
  const sphere = new Float32Array(count * 3);
  const rand = new Float32Array(count);
  const scale = new Float32Array(count);

  const R = 2.4; // shared outer radius

  // ---- A: bike wheel -----------------------------------------------------
  const SPOKES = 28;
  for (let i = 0; i < count; i++) {
    const pick = Math.random();
    let x: number, y: number;
    if (pick < 0.42) {
      // rim — a slightly fuzzy ring
      const a = Math.random() * Math.PI * 2;
      const rr = R + (Math.random() - 0.5) * 0.14;
      x = Math.cos(a) * rr;
      y = Math.sin(a) * rr;
    } else if (pick < 0.92) {
      // spokes — radial lines from hub to rim
      const s = Math.floor(Math.random() * SPOKES);
      const a = (s / SPOKES) * Math.PI * 2;
      const rr = Math.pow(Math.random(), 0.85) * R;
      const j = (Math.random() - 0.5) * 0.05;
      x = Math.cos(a) * rr + Math.cos(a + Math.PI / 2) * j;
      y = Math.sin(a) * rr + Math.sin(a + Math.PI / 2) * j;
    } else {
      // hub
      const a = Math.random() * Math.PI * 2;
      const rr = Math.random() * 0.3;
      x = Math.cos(a) * rr;
      y = Math.sin(a) * rr;
    }
    wheel[i * 3] = x;
    wheel[i * 3 + 1] = y;
    wheel[i * 3 + 2] = (Math.random() - 0.5) * 0.06;
  }

  // ---- B: the "Y" monogram ----------------------------------------------
  // Three thick strokes: left arm, right arm, and the stem dropping down.
  const topL: [number, number] = [-1.7, 2.1];
  const topR: [number, number] = [1.7, 2.1];
  const center: [number, number] = [0, 0.1];
  const bottom: [number, number] = [0, -2.3];
  const THICK = 0.42;

  const strokePoint = (
    p: [number, number],
    q: [number, number],
    thickness: number,
  ): [number, number] => {
    const u = Math.random();
    const bx = p[0] + (q[0] - p[0]) * u;
    const by = p[1] + (q[1] - p[1]) * u;
    // perpendicular to the stroke direction
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    const len = Math.hypot(dx, dy) || 1;
    const px = -dy / len;
    const py = dx / len;
    // gaussian-ish offset so the stroke has a soft dense core
    const o = ((Math.random() + Math.random() + Math.random()) / 3 - 0.5) * thickness;
    return [bx + px * o, by + py * o];
  };

  for (let i = 0; i < count; i++) {
    const pick = Math.random();
    let p: [number, number];
    if (pick < 0.34) p = strokePoint(topL, center, THICK);
    else if (pick < 0.68) p = strokePoint(topR, center, THICK);
    else p = strokePoint(center, bottom, THICK * 1.05);
    mono[i * 3] = p[0];
    mono[i * 3 + 1] = p[1];
    mono[i * 3 + 2] = (Math.random() - 0.5) * 0.18;
  }

  // ---- C: globe (fibonacci sphere) --------------------------------------
  const GOLDEN = Math.PI * (1 + Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const t = (i + 0.5) / count;
    const phi = Math.acos(1 - 2 * t); // polar angle
    const theta = GOLDEN * i; // azimuth
    const jitter = 1 + (Math.random() - 0.5) * 0.05;
    const r = R * jitter;
    sphere[i * 3] = Math.sin(phi) * Math.cos(theta) * r;
    sphere[i * 3 + 1] = Math.cos(phi) * r;
    sphere[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * r;
  }

  // ---- per-point attributes ---------------------------------------------
  for (let i = 0; i < count; i++) {
    rand[i] = Math.random();
    // ~6% bright "stars", the rest small dust
    scale[i] = Math.random() < 0.06 ? 1.8 + Math.random() * 1.4 : 0.5 + Math.random() * 0.8;
  }

  return { count, wheel, mono, sphere, rand, scale };
}
