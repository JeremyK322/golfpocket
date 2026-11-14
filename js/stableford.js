// Shared Stableford, course rating and handicap engine.
// Used by the game (daily tours, player handicap) and the course editor.
//
// ANALYSE runs every NPC over the course 200 times with headless gross scores.
// Those rounds produce each NPC's handicap, the course rating/slope and the
// suggested par for every hole. There are no fixed par targets or clamps.
import { NPC_PROFILES, npcHandicapIndex } from "./npcs.js?v=e109c3c4";
import { approxNormal, clamp, mulberry32 } from "./util.js";

export const PX_PER_METRE = 3.94;
export const MIN_HANDICAP = -5;
export const MAX_HANDICAP = 54;
export const DEFAULT_HANDICAP = 18.0;

const CALIBRATION_ROUNDS = 200;

const PRO_REFERENCE = {
  id: "pro-reference",
  name: "PRO REFERENCE",
  skill: 1,
  power: 1,
  control: 1,
  consistency: 1,
  shortGame: 1,
};

export const STABLEFORD_TIERS = {
  casual: {
    id: "casual",
    label: "CASUAL",
    fieldGrossBias: 0.14,
    slopeMul: 0.96,
    ratingShift: -0.3,
  },
  club: {
    id: "club",
    label: "CLUB",
    fieldGrossBias: 0,
    slopeMul: 1,
    ratingShift: 0,
  },
  championship: {
    id: "championship",
    label: "CHAMPIONSHIP",
    fieldGrossBias: -0.14,
    slopeMul: 1.04,
    ratingShift: 0.3,
  },
};

function hashString(value) {
  let hash = 2166136261;
  const text = String(value || "");
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pointOf(value) {
  if (Array.isArray(value)) {
    return { x: Number(value[0]) || 0, y: Number(value[1]) || 0 };
  }
  return { x: Number(value?.x) || 0, y: Number(value?.y) || 0 };
}

function polyArea(poly) {
  if (!Array.isArray(poly) || poly.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = pointOf(poly[i]);
    const b = pointOf(poly[(i + 1) % poly.length]);
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

export function holeLengthMetres(hole) {
  if (!hole) return 0;
  const tee = pointOf(hole.tee);
  const pin = pointOf(hole.pin);
  const direct = Math.hypot(pin.x - tee.x, pin.y - tee.y);
  let along = 0;
  const fairways = [
    hole.fairway,
    ...(hole.extraFairways || []).map((f) => f?.points || f),
  ];
  for (const fairway of fairways) {
    if (!Array.isArray(fairway) || fairway.length < 2) continue;
    let length = 0;
    for (let i = 1; i < fairway.length; i++) {
      const a = pointOf(fairway[i - 1]);
      const b = pointOf(fairway[i]);
      length += Math.hypot(b.x - a.x, b.y - a.y);
    }
    along = Math.max(along, length);
  }
  return Math.max(direct, Math.min(along, direct * 1.35)) / PX_PER_METRE;
}

// Fallback only; analysis replaces this with a simulated scratch score.
export function suggestedPar(hole) {
  const length = holeLengthMetres(hole);
  if (length < 230) return 3;
  if (length < 430) return 4;
  if (length < 600) return 5;
  return 6;
}

function holeMetrics(hole, index) {
  const length = holeLengthMetres(hole);
  const currentPar = clamp(Number(hole?.par) || 4, 1, 99);
  const waterArea =
    (hole?.waterPolys || []).reduce((sum, poly) => sum + polyArea(poly), 0) +
    (hole?.oceanPolys || []).reduce((sum, poly) => sum + polyArea(poly), 0);
  const sandArea = (hole?.sandPolys || []).reduce(
    (sum, poly) => sum + polyArea(poly),
    0
  );
  const green = hole?.green;
  const greenSize = green
    ? (Number(green.rx) || 70) + (Number(green.ry) || 58)
    : 0;
  const hazardScore =
    Math.min(3, waterArea / 120000) +
    Math.min(2, sandArea / 180000) +
    Math.min(1.5, (hole?.trees?.length || 0) * 0.02) +
    (green ? Math.max(0, 90 - greenSize / 2) / 160 : 0.5);
  return {
    index,
    length,
    par: currentPar,
    hazardScore,
    rawDifficulty: length / 120 + hazardScore,
    difficulty: 0,
    strokeIndex: index + 1,
    expectedScratch: 0,
    suggestedPar: suggestedPar(hole),
  };
}

function profileAttributes(profile) {
  const fallback = clamp(Number(profile?.skill) || 0.5, 0, 1);
  return {
    power: clamp(Number(profile?.power) || fallback, 0, 1),
    control: clamp(Number(profile?.control) || fallback, 0, 1),
    consistency: clamp(
      Number(profile?.consistency) || fallback,
      0,
      1
    ),
    shortGame: clamp(Number(profile?.shortGame) || fallback, 0, 1),
  };
}

// The pro's full-power shot carries 250 m. Every player is scored against that
// same reference distance; the skill gap is expressed by handicap strokes, so
// power is not counted twice (once in distance, once in the handicap).
const REFERENCE_SHOT_CARRY = 250;
const PUTTS_PER_HOLE = 1.1;

function shotsToGreen(length, carry = REFERENCE_SHOT_CARRY) {
  if (length <= carry) return 1;
  return 1 + Math.ceil((length - carry) / carry);
}

// Expected gross strokes for one hole. Distance decides how many full shots
// are needed; handicap, hazards and skill add the rest.
function simulateRound(profile, metrics, rng, options = {}) {
  const attributes = profileAttributes(profile);
  const index = npcHandicapIndex(profile);
  const grossBias = Number(options.grossBias) || 0;
  const holes = Math.max(1, metrics.length);
  const roundForm =
    approxNormal(rng) *
    (0.25 + (1 - attributes.consistency) * 0.55) *
    Math.sqrt(holes / 18);
  const strokes = [];
  let total = 0;
  for (const metric of metrics) {
    // Full shots to reach the green, plus the pro putting expectation.
    const scratchBase = shotsToGreen(metric.length) + PUTTS_PER_HOLE;
    const handicapStrokes = index / 18;
    const hazardPenalty =
      (index / 18) * metric.hazardScore * 0.06;
    const shortGamePenalty = (1 - attributes.shortGame) * 0.03;
    const sd = 0.35 + (1 - attributes.consistency) * 0.95;
    const gross = clamp(
      Math.round(
        scratchBase +
          handicapStrokes +
          hazardPenalty +
          shortGamePenalty +
          approxNormal(rng) * sd +
          roundForm +
          grossBias
      ),
      1,
      15
    );
    strokes.push(gross);
    total += gross;
  }
  return { total, strokes };
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const index = clamp(
    Math.round((sorted.length - 1) * p),
    0,
    sorted.length - 1
  );
  return sorted[index];
}

function fitLine(points) {
  let count = 0;
  let sx = 0;
  let sy = 0;
  let sxx = 0;
  let sxy = 0;
  for (const point of points) {
    const x = Number(point.x) || 0;
    const y = Number(point.y) || 0;
    count += 1;
    sx += x;
    sy += y;
    sxx += x * x;
    sxy += x * y;
  }
  if (count < 2) return { intercept: 0, slope: 0 };
  const denominator = count * sxx - sx * sx;
  if (!denominator) return { intercept: sy / count, slope: 0 };
  const slope = (count * sxy - sx * sy) / denominator;
  return { intercept: (sy - slope * sx) / count, slope };
}

export function courseSignature(holes) {
  const parts = (holes || []).map((hole) => {
    const tee = pointOf(hole.tee);
    const pin = pointOf(hole.pin);
    return [
      Math.round(tee.x),
      Math.round(tee.y),
      Math.round(pin.x),
      Math.round(pin.y),
      Number(hole.par) || 4,
      (hole.waterPolys || []).length,
      (hole.sandPolys || []).length,
      (hole.trees || []).length,
    ].join(",");
  });
  return hashString(parts.join("|"));
}

export function analyseCourse(holes, options = {}) {
  const seed = Number(options.seed) || courseSignature(holes);
  const stored = options.storedAnalysis || null;
  // Only trust stored analysis produced by the pro-reference version. Older
  // exports have no `pro` block and would override the fresh pro rounds.
  const storedTrusted =
    !!stored && Number(stored.version) >= 2 && !!stored.pro;
  const metrics = (holes || []).map((hole, index) => holeMetrics(hole, index));
  if (!metrics.length) {
    return {
      version: 2,
      holes: 0,
      par: 0,
      rating: 72,
      slope: 113,
      difficulty: "club",
      holeMetrics: [],
      npcs: [],
      field: { best: 0, median: 0, worst: 0 },
      grossField: { best: 0, median: 0, worst: 0 },
    };
  }

  const mean =
    metrics.reduce((sum, metric) => sum + metric.rawDifficulty, 0) /
    metrics.length;
  const variance =
    metrics.reduce(
      (sum, metric) => sum + (metric.rawDifficulty - mean) ** 2,
      0
    ) / metrics.length;
  const sd = Math.sqrt(variance) || 1;
  for (const metric of metrics) {
    metric.difficulty = (metric.rawDifficulty - mean) / sd;
  }
  [...metrics]
    .sort((a, b) => b.rawDifficulty - a.rawDifficulty)
    .forEach((metric, i) => {
      metric.strokeIndex = i + 1;
    });

  const rng = mulberry32(hashString(`course|${seed}|${metrics.length}`));
  const npcRuns = NPC_PROFILES.map((profile) => {
    const rounds = [];
    const holeSums = new Array(metrics.length).fill(0);
    for (let r = 0; r < CALIBRATION_ROUNDS; r++) {
      const round = simulateRound(profile, metrics, rng);
      rounds.push(round);
      for (let i = 0; i < metrics.length; i++) {
        holeSums[i] += round.strokes[i];
      }
    }
    return {
      profile,
      handicap: npcHandicapIndex(profile),
      rounds,
      holeSums,
    };
  });

  const par = metrics.reduce((sum, metric) => sum + metric.par, 0);

  // A dedicated scratch/pro reference plays the course 200 times. Par and
  // course rating come from the pro's actual scores, not an extrapolated field.
  const proRng = mulberry32(
    hashString(`pro|${seed}|${metrics.length}`)
  );
  const proHoleSums = new Array(metrics.length).fill(0);
  let proTotal = 0;
  for (let r = 0; r < CALIBRATION_ROUNDS; r++) {
    const round = simulateRound(PRO_REFERENCE, metrics, proRng);
    proTotal += round.total;
    for (let i = 0; i < metrics.length; i++) {
      proHoleSums[i] += round.strokes[i];
    }
  }
  const proAverageGross = proTotal / CALIBRATION_ROUNDS;
  for (let i = 0; i < metrics.length; i++) {
    const proStrokes = proHoleSums[i] / CALIBRATION_ROUNDS;
    metrics[i].expectedScratch = Math.round(proStrokes * 10) / 10;
    // Par is exactly what the pro averages on the hole. No target, no floor.
    metrics[i].suggestedPar = Math.max(1, Math.round(proStrokes));
  }

  let rating = Math.round(proAverageGross * 10) / 10;
  if (!Number.isFinite(rating)) rating = par;
  if (storedTrusted && Number.isFinite(Number(stored.rating))) {
    rating = Number(stored.rating);
  }
  const rating18 = rating * (18 / metrics.length);
  let slope = 113;
  let slopeNumerator = 0;
  let slopeDenominator = 0;
  for (const run of npcRuns) {
    const avgGross18 =
      (run.rounds.reduce((sum, round) => sum + round.total, 0) /
        run.rounds.length) *
      (18 / metrics.length);
    const diff = avgGross18 - rating18;
    slopeNumerator += run.handicap * diff;
    slopeDenominator += run.handicap * run.handicap;
  }
  if (slopeDenominator > 0 && slopeNumerator > 0) {
    slope = (113 * slopeNumerator) / slopeDenominator;
  }
  if (storedTrusted && Number.isFinite(Number(stored.slope))) {
    slope = Number(stored.slope);
  }
  slope = Math.max(1, Math.round(slope));
  if (
    storedTrusted &&
    Array.isArray(stored.suggestedPars) &&
    stored.suggestedPars.length === metrics.length
  ) {
    metrics.forEach((metric, i) => {
      const value = Number(stored.suggestedPars[i]);
      if (Number.isFinite(value)) metric.suggestedPar = value;
    });
  }
  if (
    storedTrusted &&
    Array.isArray(stored.strokeIndex) &&
    stored.strokeIndex.length === metrics.length
  ) {
    metrics.forEach((metric, i) => {
      const value = Number(stored.strokeIndex[i]);
      if (Number.isFinite(value)) metric.strokeIndex = value;
    });
  }

  const suggestedParTotal = metrics.reduce(
    (sum, metric) => sum + metric.suggestedPar,
    0
  );
  const difficulty =
    storedTrusted && typeof stored.difficulty === "string"
      ? stored.difficulty
      : slope < 108
      ? "casual"
      : slope <= 124
      ? "club"
      : "championship";

  const fieldPoints = [];
  const grossTotals = [];
  const npcSummaries = npcRuns.map((run) => {
    const avgGross =
      run.rounds.reduce((sum, round) => sum + round.total, 0) /
      run.rounds.length;
    const courseHcp = courseHandicap(
      run.handicap,
      {
        holes: metrics.length,
        par: suggestedParTotal,
        rating,
        slope,
        holeMetrics: metrics,
      },
      "club"
    );
    const strokes = allocateHandicapStrokes(courseHcp, {
      holeMetrics: metrics,
    });
    let totalPointsForNpc = 0;
    for (const round of run.rounds) {
      grossTotals.push(round.total);
      let points = 0;
      for (let i = 0; i < metrics.length; i++) {
        points += stablefordPoints(
          round.strokes[i],
          metrics[i].suggestedPar,
          strokes[i]
        );
      }
      fieldPoints.push(points);
      totalPointsForNpc += points;
    }
    const avgGross18 = avgGross * (18 / metrics.length);
    const implied =
      ((avgGross18 - rating18) * 113) / (slope || 113);
    return {
      id: run.profile.id,
      name: run.profile.name,
      targetHandicap: Math.round(run.handicap * 10) / 10,
      simulatedHandicap: Math.round(implied * 10) / 10,
      averageGross: Math.round(avgGross * 10) / 10,
      averagePoints:
        Math.round((totalPointsForNpc / run.rounds.length) * 10) / 10,
      courseHandicap: courseHcp,
    };
  });

  fieldPoints.sort((a, b) => a - b);
  grossTotals.sort((a, b) => a - b);
  const field = {
    best: percentile(fieldPoints, 0.95),
    median: percentile(fieldPoints, 0.5),
    worst: percentile(fieldPoints, 0.05),
  };
  const grossField = {
    best: percentile(grossTotals, 0.95),
    median: percentile(grossTotals, 0.5),
    worst: percentile(grossTotals, 0.05),
  };

  return {
    version: 2,
    holes: metrics.length,
    par,
    suggestedPar: suggestedParTotal,
    rating,
    slope,
    difficulty,
    signature: seed,
    holeMetrics: metrics,
    npcs: npcSummaries,
    pro: {
      name: PRO_REFERENCE.name,
      averageGross: Math.round(proAverageGross * 10) / 10,
      averagePerHole:
        Math.round((proAverageGross / metrics.length) * 10) / 10,
      suggestedPar: suggestedParTotal,
      rounds: CALIBRATION_ROUNDS,
    },
    field,
    grossField,
  };
}

export function stablefordPoints(gross, par, handicapStrokes = 0) {
  return clamp(
    2 +
      (Number(par) || 0) +
      (Number(handicapStrokes) || 0) -
      (Number(gross) || 0),
    0,
    5
  );
}

export function tierForDate(date, courseId) {
  const keys = Object.keys(STABLEFORD_TIERS);
  const index = hashString(`${date}|${courseId}|stableford-tier`) % keys.length;
  return keys[index];
}

export function getTier(key) {
  return STABLEFORD_TIERS[key] || STABLEFORD_TIERS.club;
}

export function buildDailyField(date, courseId, analysis, tierKey) {
  const tier = getTier(tierKey);
  const rng = mulberry32(
    hashString(`${date}|${courseId}|${tier.id}|${Math.random()}`)
  );
  return NPC_PROFILES.map((profile) => {
    const index = npcHandicapIndex(profile);
    const courseHcp = courseHandicap(index, analysis, tierKey);
    const strokes = allocateHandicapStrokes(courseHcp, analysis);
    const round = simulateRound(profile, analysis.holeMetrics, rng, {
      grossBias: tier.fieldGrossBias,
    });
    let points = 0;
    for (let i = 0; i < analysis.holeMetrics.length; i++) {
      points += stablefordPoints(
        round.strokes[i],
        analysis.holeMetrics[i].par,
        strokes[i]
      );
    }
    return {
      id: profile.id,
      name: profile.name,
      skill: profile.skill,
      handicap: index,
      courseHandicap: courseHcp,
      points,
      gross: round.total,
    };
  });
}

export function simulateProfileScores(profile, analysis, options = {}) {
  const metrics = analysis?.holeMetrics || [];
  if (!profile || !metrics.length) return null;
  const tierKey = options.tierKey || "club";
  const tier = getTier(tierKey);
  const seed =
    Number(options.seed) ||
    hashString(
      `partner|${profile.id}|${analysis?.signature}|${tier.id}`
    );
  const rng = mulberry32(seed >>> 0);
  const round = simulateRound(profile, metrics, rng, {
    grossBias: tier.fieldGrossBias,
  });
  const handicap = npcHandicapIndex(profile);
  const courseHcp = courseHandicap(handicap, analysis, tierKey);
  const strokes = allocateHandicapStrokes(courseHcp, analysis);
  const points = metrics.map((metric, index) =>
    stablefordPoints(round.strokes[index], metric.par, strokes[index])
  );
  return {
    id: profile.id,
    name: profile.name,
    handicap,
    courseHandicap: courseHcp,
    strokes: round.strokes,
    points,
    total: round.total,
    pointsTotal: points.reduce((sum, value) => sum + value, 0),
  };
}

export function computeHandicapIndex(history, getCourseProfile) {
  const rounds = (Array.isArray(history) ? history : [])
    .slice(0, 10)
    .map((row) => {
      const holes = Math.max(1, Number(row.holes) || 18);
      const par = Math.max(0, Number(row.par) || 0);
      const total = Math.max(1, Number(row.total) || 1);
      const profile = getCourseProfile(row.courseId) || {};
      const rating = Number.isFinite(Number(profile.rating))
        ? Number(profile.rating)
        : par;
      const slope = Number(profile.slope) || 113;
      return (
        (total - par - (rating - par)) * (113 / slope) * (18 / holes)
      );
    })
    .sort((a, b) => a - b);
  if (!rounds.length) return DEFAULT_HANDICAP;
  const used = rounds.length >= 9 ? 3 : rounds.length >= 6 ? 2 : 1;
  const average =
    rounds.slice(0, used).reduce((sum, value) => sum + value, 0) / used;
  return Math.round(clamp(average, MIN_HANDICAP, MAX_HANDICAP) * 10) / 10;
}

export function courseHandicap(index, analysis, tierKey) {
  const tier = getTier(tierKey);
  const holes = Math.max(1, Number(analysis?.holes) || 18);
  const par = Number(analysis?.par) || 0;
  const rating = Number.isFinite(Number(analysis?.rating))
    ? Number(analysis.rating)
    : par;
  const slope = (Number(analysis?.slope) || 113) * tier.slopeMul;
  const scaled = (Number(index) || 0) * (holes / 18);
  const handicap =
    scaled * (slope / 113) + (rating + tier.ratingShift - par);
  return Math.round(clamp(handicap, 0, MAX_HANDICAP));
}

export function allocateHandicapStrokes(handicap, analysis) {
  const metrics = analysis?.holeMetrics || [];
  const holes = Math.max(1, metrics.length);
  const value = Math.max(0, Number(handicap) || 0);
  const base = Math.floor(value / holes);
  const remainder = value % holes;
  return metrics.map((metric) => {
    const extra = metric.strokeIndex <= remainder ? 1 : 0;
    return base + extra;
  });
}
