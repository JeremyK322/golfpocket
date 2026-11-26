// Course layout + rules data. Multiple holes share one world size.
import {
  TAU,
  closedSplinePoints,
  distanceToPoly,
  distanceToPolyline,
  inEllipse,
  pointInPoly,
} from "./util.js";

// Mutable: editor-exported holes may use their own portrait world height.
export const WORLD = { w: 1700, h: 2350 };
export const BASE_WORLD = { w: 1700, h: 2350 };
export const PX_PER_METRE = 3.94;

// Painted edge widths (px). Shared by the painter, the editor preview and the
// surface tests so the fringe always plays the way it looks.
export const FAIRWAY_FRINGE = 36;
export const FAIRWAY_POLY_FRINGE = 24;
export const GREEN_COLLAR = 60;
export const GREEN_POLY_COLLAR = 30;

export function worldForHole(hole) {
  const world = hole && hole.world;
  const w = Math.max(BASE_WORLD.w, Number(world && world.w) || BASE_WORLD.w);
  const h = Math.max(BASE_WORLD.h, Number(world && world.h) || BASE_WORLD.h);
  return { w, h };
}

function applyWorld(hole) {
  const w = worldForHole(hole);
  WORLD.w = w.w;
  WORLD.h = w.h;
}

const EMPTY_HOLE = {
  index: 1,
  name: "",
  par: 4,
  challenges: [],
  tee: { x: 850, y: 1900 },
  pin: { x: 850, y: 900 },
  green: { x: 850, y: 950, rx: 70, ry: 58, rot: 0 },
  fairway: [],
  bunkers: [],
  pond: [],
  trees: [],
  bonusTargets: [],
  cartRoutes: [],
};

export let COURSE = {
  id: "verdant-links",
  name: "Verdant Links",
  theme: "verdant",
  mode: "round",
  targetRun: null,
};
export let HOLES = [];
export let HOLE = EMPTY_HOLE;
export let HOLE_INDEX = 0;

export const WIND = { angle: -0.58, mps: 4.5 };
export const WIND_K = 8;

export function randomizeWind(extreme = false) {
  // A fresh direction and strength each time you step onto the tee.
  WIND.angle = Math.random() * TAU - Math.PI;
  WIND.mps = extreme
    ? Math.round((10 + Math.random() * 5) * 2) / 2
    : Math.round((2 + Math.random() * 5.5) * 2) / 2;
  WIND.extreme = extreme;
  return WIND;
}

export const POND_BOUNDS = { cx: 0, cy: 0, rx: 0, ry: 0 };

export let FAIRWAY_SAMPLES = [];
export let FAIRWAY_TRACKS = [];
export let GREENS = [];
export let POND_POLY = [];
let FAIRWAY_LINE = [];

function fairwaySamples(ctrl) {
  const out = [];
  const SEG = 18;
  const points = Array.isArray(ctrl) ? ctrl : [];
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    for (let s = 0; s < SEG; s++) {
      const t = s / SEG;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x:
          0.5 *
          (2 * p1.x +
            (-p0.x + p2.x) * t +
            (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
            (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y:
          0.5 *
          (2 * p1.y +
            (-p0.y + p2.y) * t +
            (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
            (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        w: p1.w + (p2.w - p1.w) * t,
      });
    }
  }
  if (points.length) {
    const last = points[points.length - 1];
    out.push({ x: last.x, y: last.y, w: last.w });
  }
  return out;
}

function deriveHole() {
  const ctrl = HOLE.fairway || [];
  FAIRWAY_SAMPLES = fairwaySamples(ctrl);
  FAIRWAY_LINE = FAIRWAY_SAMPLES.map((s) => [s.x, s.y]);
  FAIRWAY_TRACKS = [{ samples: FAIRWAY_SAMPLES, line: FAIRWAY_LINE, extra: false }];
  for (const extra of HOLE.extraFairways || []) {
    const samples = fairwaySamples(extra.points || []);
    if (!samples.length) continue;
    FAIRWAY_TRACKS.push({
      samples,
      line: samples.map((s) => [s.x, s.y]),
      extra: true,
    });
  }
  GREENS = [HOLE.green, ...(HOLE.extraGreens || [])].filter(
    (g) => g && Number.isFinite(g.x) && Number.isFinite(g.y)
  );

  const polys = Array.isArray(HOLE.waterPolys) ? HOLE.waterPolys : [];
  let primary = [];
  let bestArea = -Infinity;
  for (const poly of polys) {
    if (!poly || poly.length < 3) continue;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of poly) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const area = (maxX - minX) * (maxY - minY);
    if (area > bestArea) {
      bestArea = area;
      primary = poly;
    }
  }
  // A duck marker picks the pond the ducks use, even when a larger water
  // body exists elsewhere on the hole.
  const duck = Array.isArray(HOLE.duckPonds) ? HOLE.duckPonds[0] : null;
  if (duck) {
    for (const poly of polys) {
      if (poly.length > 2 && pointInPoly(duck.x, duck.y, poly)) {
        primary = poly;
        break;
      }
    }
  }
  POND_POLY = primary;
  if (POND_POLY.length) {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [x, y] of POND_POLY) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    POND_BOUNDS.cx = (minX + maxX) / 2;
    POND_BOUNDS.cy = (minY + maxY) / 2;
    POND_BOUNDS.rx = (maxX - minX) / 2;
    POND_BOUNDS.ry = (maxY - minY) / 2;
  } else {
    POND_BOUNDS.cx = POND_BOUNDS.cy = 0;
    POND_BOUNDS.rx = POND_BOUNDS.ry = 0;
  }
}

deriveHole();

function normaliseHole(raw, i) {
  const h = { ...raw };
  h.index = Number.isFinite(raw.index) ? raw.index : i + 1;
  h.name = raw.name || `Hole ${i + 1}`;
  h.par = Number(raw.par) || 4;
  h.world = {
    w: Math.max(BASE_WORLD.w, Number(raw.world && raw.world.w) || BASE_WORLD.w),
    h: Math.max(BASE_WORLD.h, Number(raw.world && raw.world.h) || BASE_WORLD.h),
  };
  const normPoint = (p) =>
    Array.isArray(p) ? { x: Number(p[0]) || 0, y: Number(p[1]) || 0 } : { x: Number(p.x) || 0, y: Number(p.y) || 0 };
  h.tee = { ...normPoint(raw.tee || { x: 850, y: 1900 }), rot: Number(raw.tee && raw.tee.rot) || 0 };
  h.pin = normPoint(raw.pin || { x: 850, y: 900 });
  h.green = raw.green
    ? { ...normPoint(raw.green), rx: Math.max(20, Number(raw.green.rx) || 70), ry: Math.max(16, Number(raw.green.ry) || 58), rot: Number(raw.green.rot) || 0 }
    : null;
  h.fairway = Array.isArray(raw.fairway)
    ? raw.fairway.map((p) => ({ ...normPoint(p), w: Math.max(24, Number(p.w) || 140) }))
    : [];
  const normPoly = (poly) =>
    Array.isArray(poly)
      ? poly.map((p) =>
          Array.isArray(p) ? [Number(p[0]) || 0, Number(p[1]) || 0] : [Number(p.x) || 0, Number(p.y) || 0]
        )
      : [];
  h.fairwayPolys = Array.isArray(raw.fairwayPolys)
    ? raw.fairwayPolys.map(normPoly).filter((p) => p.length > 2)
    : [];
  h.greenPolys = Array.isArray(raw.greenPolys)
    ? raw.greenPolys.map(normPoly).filter((p) => p.length > 2)
    : [];
  const normFairway = (value) => {
    let points = [];
    if (Array.isArray(value)) {
      if (value.length && Array.isArray(value[0])) {
        points = value.map((p) => ({ x: Number(p[0]) || 0, y: Number(p[1]) || 0 }));
      } else if (value.length && value[0] && typeof value[0] === "object") {
        points = value;
      }
    } else if (value && Array.isArray(value.points)) {
      points = value.points;
    }
    return points.map((p) => ({ ...normPoint(p), w: Math.max(24, Number(p.w) || 140) }));
  };
  h.extraFairways = Array.isArray(raw.extraFairways)
    ? raw.extraFairways
        .map((value) => ({ points: normFairway(value), hole: value && value.hole }))
        .filter((f) => f.points.length > 1)
    : [];
  h.extraGreens = Array.isArray(raw.extraGreens)
    ? raw.extraGreens.map((g) => ({
        ...normPoint(g),
        rx: Math.max(20, Number(g.rx) || 70),
        ry: Math.max(16, Number(g.ry) || 58),
        rot: Number(g.rot) || 0,
        hole: g.hole,
      }))
    : [];
  h.extraTees = Array.isArray(raw.extraTees)
    ? raw.extraTees.map((t) => ({ ...normPoint(t), rot: Number(t.rot) || 0, hole: t.hole }))
    : [];
  h.bunkers = Array.isArray(raw.bunkers) ? raw.bunkers : [];
  h.pond = Array.isArray(raw.pond) ? raw.pond : [];
  h.trees = Array.isArray(raw.trees)
    ? raw.trees.map((t) => ({ ...t, species: Number(t.species != null ? t.species : t.hue) || 0 }))
    : [];
  h.waterPolys =
    Array.isArray(raw.waterPolys) && raw.waterPolys.length
      ? raw.waterPolys.map(normPoly).filter((p) => p.length > 2)
      : h.pond.length
      ? [closedSplinePoints(h.pond, 10)]
      : [];
  h.oceanPolys = Array.isArray(raw.oceanPolys)
    ? raw.oceanPolys.map(normPoly).filter((p) => p.length > 2)
    : [];
  h.sandPolys = Array.isArray(raw.sandPolys)
    ? raw.sandPolys.map(normPoly).filter((p) => p.length > 2)
    : [];
  h.props = Array.isArray(raw.props)
    ? raw.props.map((p) => ({
        type: p.type || "shed",
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
        rot: Number(p.rot) || 0,
        scale: Math.max(0.35, Number(p.scale) || 1),
      }))
    : [];
  h.roads = Array.isArray(raw.roads)
    ? raw.roads
        .map((r) => ({
          style: r.style || "paved",
          width: Math.max(8, Number(r.width) || 42),
          points: Array.isArray(r.points) ? r.points.map(normPoint) : [],
        }))
        .filter((r) => r.points.length > 1)
    : [];
  h.flowerBeds = Array.isArray(raw.flowerBeds)
    ? raw.flowerBeds.map((f) => ({
        x: Number(f.x) || 0,
        y: Number(f.y) || 0,
        rx: Math.max(10, Number(f.rx) || 34),
        ry: Math.max(8, Number(f.ry) || 24),
        rot: Number(f.rot) || 0,
        palette: Number(f.palette) || 0,
      }))
    : [];
  h.challenges = Array.isArray(raw.challenges) ? raw.challenges : [];
  h.bonusTargets = Array.isArray(raw.bonusTargets) ? raw.bonusTargets : [];
  h.cartRoutes = Array.isArray(raw.cartRoutes) ? raw.cartRoutes : [];
  return h;
}

export function loadCourseData(data) {
  if (!data || !Array.isArray(data.holes) || data.holes.length === 0) {
    throw new Error("Course data has no holes");
  }
  COURSE = {
    id: data.id || "course",
    name: data.name || "Course",
    theme: data.theme || "verdant",
    environment: data.environment || "canadian",
    analysis: data.analysis || null,
    mode: data.mode === "target" ? "target" : "round",
    targetRun: data.targetRun && typeof data.targetRun === "object" ? data.targetRun : null,
  };
  HOLES = data.holes.map(normaliseHole);
  HOLE_INDEX = 0;
  HOLE = HOLES[0];
  applyWorld(HOLE);
  deriveHole();
  return COURSE;
}

export function setHole(index) {
  HOLE_INDEX = Math.max(0, Math.min(HOLES.length - 1, index));
  HOLE = HOLES[HOLE_INDEX];
  applyWorld(HOLE);
  deriveHole();
  return HOLE;
}

export function isLastHole() {
  return HOLE_INDEX >= HOLES.length - 1;
}

export const TREE_TRUNK = 15;

// Approximate local fairway width by taking the nearest sample on a track.
function fairwayWidthAt(track, x, y) {
  let best = Infinity;
  let width = 60;
  for (const s of track.samples) {
    const d = (x - s.x) * (x - s.x) + (y - s.y) * (y - s.y);
    if (d < best) {
      best = d;
      width = s.w / 2;
    }
  }
  return width;
}

export function surfaceAt(x, y) {
  if (HOLE.waterPolys) {
    for (const poly of HOLE.waterPolys) {
      if (poly.length > 2 && pointInPoly(x, y, poly)) return "water";
    }
  }
  if (HOLE.oceanPolys) {
    for (const poly of HOLE.oceanPolys) {
      if (poly.length > 2 && pointInPoly(x, y, poly)) return "water";
    }
  }
  if (HOLE.sandPolys) {
    for (const poly of HOLE.sandPolys) {
      if (poly.length > 2 && pointInPoly(x, y, poly)) return "sand";
    }
  }
  for (const b of HOLE.bunkers) {
    if (inEllipse(x, y, b)) return "sand";
  }
  for (const green of GREENS) {
    if (inEllipse(x, y, green)) return "green";
  }
  for (const poly of HOLE.greenPolys || []) {
    if (poly.length > 2 && pointInPoly(x, y, poly)) return "green";
  }

  // The collar around a green is painted as apron but plays as fairway.
  for (const green of GREENS) {
    if (inEllipse(x, y, green, GREEN_COLLAR)) return "fairway";
  }
  for (const poly of HOLE.greenPolys || []) {
    if (poly.length > 2 && distanceToPoly(x, y, poly) <= GREEN_POLY_COLLAR) {
      return "fairway";
    }
  }

  for (const poly of HOLE.fairwayPolys || []) {
    if (poly.length > 2 && pointInPoly(x, y, poly)) return "fairway";
  }
  for (const track of FAIRWAY_TRACKS) {
    if (
      track.line.length &&
      distanceToPolyline(x, y, track.line) < fairwayWidthAt(track, x, y)
    ) {
      return "fairway";
    }
  }

  // Fringe is the widened painted edge around the fairway: half the rough
  // penalty, but still a distinct lie.
  for (const poly of HOLE.fairwayPolys || []) {
    if (poly.length > 2 && distanceToPoly(x, y, poly) <= FAIRWAY_POLY_FRINGE) {
      return "fringe";
    }
  }
  for (const track of FAIRWAY_TRACKS) {
    if (
      track.line.length &&
      distanceToPolyline(x, y, track.line) <
        fairwayWidthAt(track, x, y) + FAIRWAY_FRINGE
    ) {
      return "fringe";
    }
  }
  return "rough";
}

export function isOnGreen(x, y) {
  if (GREENS.some((green) => inEllipse(x, y, green, -6))) return true;
  return (HOLE.greenPolys || []).some(
    (poly) => poly.length > 2 && pointInPoly(x, y, poly)
  );
}

// Green plus its painted collar. Used to suggest the putter from the apron;
// the collar itself still plays as a fairway lie.
export function isOnGreenOrCollar(x, y) {
  if (GREENS.some((green) => inEllipse(x, y, green, GREEN_COLLAR))) return true;
  return (HOLE.greenPolys || []).some(
    (poly) =>
      poly.length > 2 &&
      (pointInPoly(x, y, poly) || distanceToPoly(x, y, poly) <= GREEN_POLY_COLLAR)
  );
}

export function metresBetween(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay) / PX_PER_METRE;
}

export function treeAt(x, y) {
  for (const t of HOLE.trees) {
    if (Math.hypot(x - t.x, y - t.y) < t.r * 0.85) return t;
  }
  return null;
}

// Shot difficulty from the lie. `mult` scales carry, `spread` scales dispersion.
export function lieAt(x, y) {
  const s = surfaceAt(x, y);
  if (s === "green") return { kind: "green", mult: 1, spread: 1, label: "" };
  if (s === "sand")
    return { kind: "sand", mult: 0.55, spread: 1.5, label: "BUNKER · −45% CARRY" };
  if (treeAt(x, y))
    return { kind: "trees", mult: 0.5, spread: 1.8, label: "IN TREES · −50% CARRY" };
  if (s === "fringe")
    return { kind: "fringe", mult: 0.91, spread: 1.15, label: "FRINGE · −9% CARRY" };
  if (s === "rough")
    return { kind: "rough", mult: 0.82, spread: 1.3, label: "ROUGH · −18% CARRY" };
  return { kind: s, mult: 1, spread: 1, label: "" };
}

// Scenery-only seed.
export const PAINT_SEED = 20261107;
