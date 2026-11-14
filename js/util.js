// Small math / geometry helpers used across the game.

export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0];
    const yi = poly[i][1];
    const xj = poly[j][0];
    const yj = poly[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

// Catmull-Rom open spline -> dense points.
export function splinePoints(pts, steps = 12) {
  const out = [];
  const n = pts.length;
  if (n < 2) return pts.slice();
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push([pts[n - 1][0], pts[n - 1][1]]);
  return out;
}

// Closed Catmull-Rom spline -> dense points.
export function closedSplinePoints(pts, steps = 12) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  return out;
}

// Closest distance from a point to a polyline of [x,y] points.
export function distanceToPolyline(x, y, pts) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i][0];
    const ay = pts[i][1];
    const bx = pts[i + 1][0];
    const by = pts[i + 1][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((x - ax) * dx + (y - ay) * dy) / len2;
    t = clamp(t, 0, 1);
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return best;
}

// Build a Path2D made of overlapping circles (used for organic fairway fills).
export function circleUnionPath(samples, extra = 0) {
  const path = new Path2D();
  for (const s of samples) {
    path.moveTo(s.x + s.w / 2 + extra, s.y);
    path.arc(s.x, s.y, Math.max(0.5, s.w / 2 + extra), 0, TAU);
  }
  return path;
}

// Rotated ellipse hit test.
export function inEllipse(x, y, e, margin = 0) {
  const rot = e.rot || 0;
  const dx = x - e.x;
  const dy = y - e.y;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  const rx = e.rx + margin;
  const ry = e.ry + margin;
  return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
}

// Random helper.
export function rr(rng, a, b) {
  return a + rng() * (b - a);
}

// Soft-ish normal from two uniforms.
export function approxNormal(rng) {
  return (rng() + rng() + rng() + rng() - 2) / 2;
}
