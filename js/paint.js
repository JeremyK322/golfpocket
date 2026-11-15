// Procedurally paints the whole course into one large offscreen canvas.
// The result is intentionally rich: layered grass, mown stripes, sand grain,
// shoreline detail and long soft shadows — all without image assets.
import {
  HOLE,
  POND_BOUNDS,
  POND_POLY,
  WORLD,
  FAIRWAY_TRACKS,
  GREENS,
  PAINT_SEED,
  PX_PER_METRE,
  surfaceAt,
} from "./course.js?v=c20301f3";
import { drawScenery } from "./scenery.js?v=c20301f3";
import { circleUnionPath, mulberry32, pointInPoly, rr, TAU } from "./util.js";

function makeNoiseTile(rng, size, colors, count) {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const x = c.getContext("2d");
  for (let i = 0; i < count; i++) {
    x.fillStyle = colors[(rng() * colors.length) | 0];
    x.globalAlpha = rr(rng, 0.2, 0.85);
    const s = rng() < 0.85 ? 1 : 2;
    x.fillRect((rng() * size) | 0, (rng() * size) | 0, s, s);
  }
  return c;
}

function traceSmoothClosed(ctx, pts) {
  const n = pts.length;
  if (!n) return;
  ctx.beginPath();
  ctx.moveTo((pts[0][0] + pts[n - 1][0]) / 2, (pts[0][1] + pts[n - 1][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;
    ctx.bezierCurveTo(c1x, c1y, c2x, c2y, p2[0], p2[1]);
  }
  ctx.closePath();
}

function polyPath(poly) {
  const p = new Path2D();
  if (!poly || !poly.length) return p;
  p.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) {
    p.lineTo(poly[i][0], poly[i][1]);
  }
  p.closePath();
  return p;
}

function polyBounds(poly) {
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
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    rx: (maxX - minX) / 2,
    ry: (maxY - minY) / 2,
  };
}

function makePondPath() {
  return polyPath(POND_POLY);
}

function paintOceanBody(ctx, poly, rng) {
  if (!poly || poly.length < 3) return;
  const path = polyPath(poly);
  const pb = polyBounds(poly);

  // Beach and foam edge.
  ctx.strokeStyle = "#d8c99a";
  ctx.lineWidth = 26;
  ctx.stroke(path);
  ctx.strokeStyle = "rgba(255, 250, 230, 0.6)";
  ctx.lineWidth = 8;
  ctx.stroke(path);

  ctx.save();
  ctx.clip(path);
  const depth = Math.max(200, pb.rx + pb.ry);
  const g = ctx.createLinearGradient(
    pb.cx,
    pb.cy - pb.ry - depth * 0.25,
    pb.cx,
    pb.cy + pb.ry + depth * 0.35
  );
  g.addColorStop(0, "#4aa8bd");
  g.addColorStop(0.28, "#2f8ba8");
  g.addColorStop(0.68, "#206b8d");
  g.addColorStop(1, "#164e6d");
  ctx.fillStyle = g;
  ctx.fillRect(pb.cx - pb.rx - 60, pb.cy - pb.ry - 60, (pb.rx + 60) * 2, (pb.ry + 60) * 2);

  // Large soft current bands.
  for (let i = 0; i < 10; i++) {
    const x = rr(rng, pb.cx - pb.rx, pb.cx + pb.rx);
    const y = rr(rng, pb.cy - pb.ry, pb.cy + pb.ry);
    const r = rr(rng, 60, 180);
    const dg = ctx.createRadialGradient(x, y, 0, x, y, r);
    dg.addColorStop(0, "rgba(20, 74, 104, 0.16)");
    dg.addColorStop(1, "rgba(20, 74, 104, 0)");
    ctx.fillStyle = dg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Wave lines.
  const waveCount = Math.min(70, 20 + Math.round((pb.rx + pb.ry) / 30));
  for (let i = 0; i < waveCount; i++) {
    const x = rr(rng, pb.cx - pb.rx, pb.cx + pb.rx);
    const y = rr(rng, pb.cy - pb.ry, pb.cy + pb.ry);
    const len = rr(rng, 14, 52);
    ctx.strokeStyle =
      rng() < 0.5 ? "rgba(214, 248, 250, 0.22)" : "rgba(12, 65, 88, 0.18)";
    ctx.lineWidth = rr(rng, 0.8, 1.8);
    ctx.beginPath();
    ctx.moveTo(x - len / 2, y);
    ctx.quadraticCurveTo(x, y - rr(rng, 2, 6), x + len / 2, y);
    ctx.stroke();
  }

  // Lighter water close to the shoreline.
  ctx.strokeStyle = "rgba(180, 240, 238, 0.32)";
  ctx.lineWidth = 16;
  ctx.stroke(path);
  ctx.restore();
}

function paintWaterBody(ctx, poly, rng) {
  if (!poly || poly.length < 3) return;
  const path = polyPath(poly);
  const pb = polyBounds(poly);

  // Sandy bank.
  ctx.strokeStyle = "#cfc08d";
  ctx.lineWidth = 15;
  ctx.stroke(path);
  ctx.strokeStyle = "rgba(255,248,220,0.5)";
  ctx.lineWidth = 4;
  ctx.stroke(path);

  // Water.
  ctx.save();
  ctx.clip(path);
  const wg = ctx.createRadialGradient(
    pb.cx - pb.rx * 0.35,
    pb.cy - pb.ry * 0.4,
    Math.max(16, pb.rx * 0.12),
    pb.cx,
    pb.cy,
    Math.max(pb.rx, pb.ry) * 1.35
  );
  wg.addColorStop(0, "#63c2cd");
  wg.addColorStop(0.5, "#3f99ab");
  wg.addColorStop(1, "#266f85");
  ctx.fillStyle = wg;
  ctx.fillRect(pb.cx - pb.rx - 40, pb.cy - pb.ry - 40, (pb.rx + 40) * 2, (pb.ry + 40) * 2);

  for (let i = 0; i < 14; i++) {
    const x = rr(rng, pb.cx - pb.rx * 0.8, pb.cx + pb.rx * 0.8);
    const y = rr(rng, pb.cy - pb.ry * 0.8, pb.cy + pb.ry * 0.8);
    const r = rr(rng, 30, 90);
    const dg = ctx.createRadialGradient(x, y, 0, x, y, r);
    dg.addColorStop(0, "rgba(20,84,104,0.16)");
    dg.addColorStop(1, "rgba(20,84,104,0)");
    ctx.fillStyle = dg;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  ctx.strokeStyle = "rgba(210,248,245,0.20)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    const x = rr(rng, pb.cx - pb.rx * 0.8, pb.cx + pb.rx * 0.8);
    const y = rr(rng, pb.cy - pb.ry * 0.8, pb.cy + pb.ry * 0.8);
    const r = rr(rng, 6, 24);
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI * 1.05, Math.PI * 1.7);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(180,240,235,0.35)";
  ctx.lineWidth = 7;
  ctx.stroke(path);
  ctx.restore();

  // Reeds.
  for (let i = 4; i < poly.length; i += 13) {
    const [x, y] = poly[i];
    const angle = rr(rng, -0.7, 0.7) + Math.atan2(y - pb.cy, x - pb.cx);
    for (let r = 0; r < 5; r++) {
      const len = rr(rng, 10, 24);
      const sway = rr(rng, -4, 4);
      ctx.strokeStyle = rng() < 0.5 ? "rgba(96,140,56,0.85)" : "rgba(126,164,64,0.8)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + rr(rng, -4, 4), y + rr(rng, -3, 3));
      ctx.quadraticCurveTo(
        x + Math.cos(angle) * len * 0.5 + sway,
        y + Math.sin(angle) * len * 0.5,
        x + Math.cos(angle) * len + sway,
        y + Math.sin(angle) * len
      );
      ctx.stroke();
      ctx.fillStyle = "rgba(128,94,48,0.85)";
      ctx.beginPath();
      ctx.arc(x + Math.cos(angle) * len + sway, y + Math.sin(angle) * len, 1.8, 0, TAU);
      ctx.fill();
    }
  }

  // Lily pads.
  const padCandidates = [
    [pb.cx - pb.rx * 0.4, pb.cy + pb.ry * 0.2, 13],
    [pb.cx + pb.rx * 0.38, pb.cy + pb.ry * 0.35, 11],
    [pb.cx + pb.rx * 0.5, pb.cy - pb.ry * 0.25, 9],
    [pb.cx - pb.rx * 0.2, pb.cy + pb.ry * 0.5, 10],
    [pb.cx + pb.rx * 0.1, pb.cy - pb.ry * 0.55, 7],
  ];
  for (const [x, y, r] of padCandidates) {
    if (!pointInPoly(x, y, poly)) continue;
    ctx.fillStyle = "rgba(58,124,66,0.92)";
    ctx.beginPath();
    ctx.ellipse(x, y, r, r * 0.78, rr(rng, -1, 1), 0.35, TAU + 0.12);
    ctx.lineTo(x, y);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,220,140,0.35)";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (r > 10) {
      ctx.fillStyle = "rgba(255,190,210,0.9)";
      ctx.beginPath();
      ctx.arc(x + 3, y - 4, 2.6, 0, TAU);
      ctx.fill();
    }
  }
}

function paintSandBody(ctx, poly, rng) {
  if (!poly || poly.length < 3) return;
  const path = polyPath(poly);
  const pb = polyBounds(poly);

  ctx.save();
  ctx.fillStyle = "rgba(24,50,18,0.22)";
  ctx.save();
  ctx.translate(4, 6);
  ctx.fill(path);
  ctx.restore();

  ctx.fillStyle = "rgba(45, 82, 31, 0.55)";
  ctx.strokeStyle = "rgba(45, 82, 31, 0.55)";
  ctx.lineWidth = 9;
  ctx.stroke(path);

  const sand = ctx.createRadialGradient(
    pb.cx - pb.rx * 0.35,
    pb.cy - pb.ry * 0.4,
    3,
    pb.cx,
    pb.cy,
    Math.max(pb.rx, pb.ry) * 1.25
  );
  sand.addColorStop(0, "#fff2cd");
  sand.addColorStop(0.55, "#f2dfab");
  sand.addColorStop(1, "#d6b87b");
  ctx.fillStyle = sand;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  ctx.fillStyle = "rgba(150,116,60,0.14)";
  const count = Math.max(120, Math.floor(pb.rx * pb.ry * 0.02));
  for (let i = 0; i < count; i++) {
    ctx.fillRect(
      rr(rng, pb.cx - pb.rx, pb.cx + pb.rx),
      rr(rng, pb.cy - pb.ry, pb.cy + pb.ry),
      1.2,
      1.2
    );
  }
  ctx.strokeStyle = "rgba(178,142,82,0.22)";
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    ctx.ellipse(
      rr(rng, pb.cx - pb.rx * 0.4, pb.cx + pb.rx * 0.4),
      rr(rng, pb.cy - pb.ry * 0.4, pb.cy + pb.ry * 0.4),
      rr(rng, 8, Math.max(10, pb.rx * 0.55)),
      rr(rng, 4, 9),
      rr(rng, -0.5, 0.5),
      0,
      TAU
    );
    ctx.stroke();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(120,89,42,0.4)";
  ctx.lineWidth = 2.4;
  ctx.stroke(path);
  ctx.strokeStyle = "rgba(255,248,210,0.35)";
  ctx.lineWidth = 1.2;
  ctx.save();
  ctx.translate(0, 1);
  ctx.stroke(path);
  ctx.restore();
  ctx.restore();
}

function traceBunker(ctx, b, grow = 0, seed = 0) {
  const pts = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const wobble =
      1 +
      0.085 * Math.sin(3 * a + seed) +
      0.055 * Math.cos(5 * a + seed * 1.7) +
      0.03 * Math.sin(7 * a + seed * 0.6);
    pts.push([
      Math.cos(a) * (b.rx + grow) * wobble,
      Math.sin(a) * (b.ry + grow) * wobble,
    ]);
  }
  traceSmoothClosed(ctx, pts);
}

function paintFairwayStripes(ctx, clipPath, cx, cy, angle, span) {
  const bands = Math.ceil(span / 44);
  ctx.save();
  ctx.clip(clipPath);
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  for (let i = -bands; i < bands; i++) {
    ctx.fillStyle =
      i % 2 === 0 ? "rgba(255,255,255,0.024)" : "rgba(16,62,20,0.015)";
    ctx.fillRect(-span, i * 44, span * 2, 44);
  }
  // Faint diagonal sunlight sheen, same as the centreline fairways.
  const sheen = ctx.createLinearGradient(-900, -900, 900, 900);
  sheen.addColorStop(0, "rgba(255,250,190,0.065)");
  sheen.addColorStop(0.55, "rgba(255,255,255,0)");
  ctx.fillStyle = sheen;
  ctx.fillRect(-span, -span, span * 2, span * 2);
  ctx.restore();
}

// Caller must clip to the green and translate to its centre first.
function paintGreenRings(ctx, rx, ry) {
  for (let i = 0; i < 9; i++) {
    ctx.strokeStyle = i % 2 ? "rgba(255,255,255,0.055)" : "rgba(18,66,24,0.045)";
    ctx.lineWidth = Math.min(13, Math.max(5, rx * 0.08));
    const k = 1 - i * 0.1;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx * k, ry * k, 0, 0, TAU);
    ctx.stroke();
  }
}

function paintGreen(ctx, green, rng) {
  ctx.save();
  ctx.translate(green.x, green.y);
  ctx.rotate(green.rot);
  // fringe / collar
  ctx.fillStyle = "#6cb548";
  ctx.beginPath();
  ctx.ellipse(0, 0, green.rx + 15, green.ry + 15, 0, 0, TAU);
  ctx.fill();
  // putting surface
  const gg = ctx.createRadialGradient(-green.rx * 0.35, -green.ry * 0.4, 10, 0, 0, green.rx + 40);
  gg.addColorStop(0, "#87cd61");
  gg.addColorStop(0.65, "#79c455");
  gg.addColorStop(1, "#68b34a");
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.ellipse(0, 0, green.rx, green.ry, 0, 0, TAU);
  ctx.fill();

  // Mown rings.
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(0, 0, green.rx, green.ry, 0, 0, TAU);
  ctx.clip();
  paintGreenRings(ctx, green.rx, green.ry);
  // Fine turf speckle.
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  for (let i = 0; i < 420; i++) {
    const a = rng() * TAU;
    const rr2 = Math.sqrt(rng());
    ctx.fillRect(
      Math.cos(a) * green.rx * rr2,
      Math.sin(a) * green.ry * rr2,
      1,
      1
    );
  }
  // Sunlight pool on the green.
  const sun = ctx.createRadialGradient(-30, -40, 5, -30, -40, green.rx);
  sun.addColorStop(0, "rgba(255,252,190,0.14)");
  sun.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = sun;
  ctx.fillRect(-green.rx, -green.ry, green.rx * 2, green.ry * 2);
  ctx.restore();

  // Collar highlight
  ctx.strokeStyle = "rgba(220,245,170,0.4)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(0, 0, green.rx + 1, green.ry + 1, 0, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function paintTeeBox(ctx, tee) {
  const teeRot = Number(tee.rot) || 0;
  ctx.save();
  ctx.translate(tee.x, tee.y);
  ctx.rotate(teeRot);
  ctx.fillStyle = "rgba(28,70,24,0.2)";
  ctx.beginPath();
  ctx.roundRect(-56, -18, 112, 76, 16);
  ctx.fill();
  const teeGrad = ctx.createLinearGradient(0, -18, 0, 58);
  teeGrad.addColorStop(0, "#7cc457");
  teeGrad.addColorStop(1, "#68b048");
  ctx.fillStyle = teeGrad;
  ctx.beginPath();
  ctx.roundRect(-58, -20, 116, 76, 16);
  ctx.fill();
  ctx.strokeStyle = "rgba(220,245,170,0.35)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-55, -17, 110, 70, 14);
  ctx.stroke();

  // Tee markers follow the same rotation.
  for (const dx of [-26, 26]) {
    ctx.fillStyle = "rgba(20,50,20,0.25)";
    ctx.beginPath();
    ctx.ellipse(dx + 2, 28, 5, 3.5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#f7f4e8";
    ctx.beginPath();
    ctx.arc(dx, 26, 4.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#d8d2bc";
    ctx.beginPath();
    ctx.arc(dx + 1, 27, 2.8, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

export function paintCourse(themeId = "verdant", options = {}) {
  // 1.25 keeps long holes under the common 4096 px GPU texture limit while
  // saving ~20% of the painted texture memory. The camera zooms up to 2.4x,
  // so this is also a reasonable quality/performance point. Large courses are
  // automatically painted at a lower scale to avoid canvas allocation
  // failures on phones.
  const area = Math.max(1, WORLD.w * WORLD.h);
  const maxPixels = Math.max(1000000, Number(options.maxPixels) || 6000000);
  const requested = Math.max(0.6, Math.min(1.25, Number(options.scale) || 1.25));
  const S = Math.max(0.6, Math.min(requested, Math.sqrt(maxPixels / area)));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(WORLD.w * S));
  canvas.height = Math.max(1, Math.round(WORLD.h * S));
  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Could not create the course paint canvas");
  ctx.scale(S, S);
  const rng = mulberry32(PAINT_SEED);

  const pondPath = makePondPath();

  // ---------- ROUGH BASE ----------
  ctx.fillStyle = "#4a8b3a";
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  // Big soft colour mottles.
  for (let i = 0; i < 65; i++) {
    const x = rr(rng, -100, WORLD.w + 100);
    const y = rr(rng, -100, WORLD.h + 100);
    const r = rr(rng, 120, 460);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = rng() < 0.5;
    g.addColorStop(0, light ? "rgba(142,196,92,0.18)" : "rgba(24,68,26,0.16)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Grass blade strokes.
  const bladeColours = [
    "rgba(142,196,96,0.30)",
    "rgba(34,84,30,0.34)",
    "rgba(176,212,116,0.22)",
    "rgba(88,146,58,0.30)",
  ];
  for (let c = 0; c < bladeColours.length; c++) {
    ctx.strokeStyle = bladeColours[c];
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    const count = 3600;
    for (let i = 0; i < count; i++) {
      const x = rng() * WORLD.w;
      const y = rng() * WORLD.h;
      const len = rr(rng, 2.5, 8);
      const a = -Math.PI / 2 + rr(rng, -0.7, 0.7);
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    }
    ctx.stroke();
  }

  // Finer noise overlay.
  const fineNoise = ctx.createPattern(makeNoiseTile(rng, 96, ["#ffffff", "#000000", "#77a84c"], 900), "repeat");
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = fineNoise;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);
  ctx.restore();

  // Little wildflowers in the rough.
  for (let i = 0; i < 260; i++) {
    const x = rng() * WORLD.w;
    const y = rng() * WORLD.h;
    if (rng() < 0.55) {
      ctx.fillStyle = rng() < 0.7 ? "rgba(255,255,255,0.72)" : "rgba(255,231,120,0.8)";
      ctx.beginPath();
      ctx.arc(x, y, rr(rng, 1.2, 2.2), 0, TAU);
      ctx.fill();
      ctx.fillStyle = "rgba(255,206,64,0.9)";
      ctx.beginPath();
      ctx.arc(x, y, 0.7, 0, TAU);
      ctx.fill();
    }
  }

  // ---------- FAIRWAYS ----------
  for (const track of FAIRWAY_TRACKS) {
    if (!track.samples.length) continue;
    const fringePath = circleUnionPath(track.samples, 9);
    const fairwayPath = circleUnionPath(track.samples, 0);
    ctx.fillStyle = "#4c8a37";
    ctx.fill(fringePath);
    ctx.fillStyle = "#5fa742";
    ctx.fill(fairwayPath);

    // Mown stripes, aligned with this fairway's own axis.
    const first = track.samples[0];
    const last = track.samples[track.samples.length - 1];
    const axis = Math.atan2(last.y - first.y, last.x - first.x);
    const mx = (first.x + last.x) / 2;
    const my = (first.y + last.y) / 2;
    paintFairwayStripes(ctx, fairwayPath, mx, my, axis, 2300);

    // Fairway grass detail.
    ctx.save();
    ctx.clip(fairwayPath);
    ctx.strokeStyle = "rgba(190,225,130,0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 4200; i++) {
      const x = rng() * WORLD.w;
      const y = rng() * WORLD.h;
      const len = rr(rng, 2, 6);
      const a = -Math.PI / 2 + rr(rng, -0.5, 0.5);
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = fineNoise;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.restore();
  }

  // Painted fairway areas.
  for (const poly of HOLE.fairwayPolys || []) {
    if (!poly || poly.length < 3) continue;
    const path = new Path2D();
    path.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
    path.closePath();
    ctx.strokeStyle = "#4c8a37";
    ctx.lineWidth = 12;
    ctx.stroke(path);
    ctx.fillStyle = "#5fa742";
    ctx.fill(path);
    const bounds = polyBounds(poly);
    const axis = bounds.rx >= bounds.ry ? 0 : Math.PI / 2;
    const span = Math.hypot(bounds.rx, bounds.ry) + 400;
    paintFairwayStripes(ctx, path, bounds.cx, bounds.cy, axis, span);
    ctx.save();
    ctx.clip(path);
    ctx.strokeStyle = "rgba(190,225,130,0.18)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 2200; i++) {
      const x = rng() * WORLD.w;
      const y = rng() * WORLD.h;
      const len = rr(rng, 2, 5);
      ctx.moveTo(x, y);
      ctx.lineTo(x + rr(rng, -1.5, 1.5), y + len);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------- GREENS ----------
  for (const green of GREENS) paintGreen(ctx, green, rng);
  for (const poly of HOLE.greenPolys || []) {
    if (!poly || poly.length < 3) continue;
    const path = new Path2D();
    path.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
    path.closePath();
    ctx.strokeStyle = "#6cb548";
    ctx.lineWidth = 15;
    ctx.stroke(path);
    ctx.fillStyle = "#79c455";
    ctx.fill(path);
    const bounds = polyBounds(poly);
    ctx.save();
    ctx.clip(path);
    ctx.translate(bounds.cx, bounds.cy);
    paintGreenRings(ctx, Math.max(8, bounds.rx), Math.max(8, bounds.ry));
    ctx.restore();
    ctx.save();
    ctx.clip(path);
    ctx.fillStyle = "rgba(255,255,255,0.11)";
    for (let i = 0; i < 260; i++) {
      const x = rr(rng, 0, WORLD.w);
      const y = rr(rng, 0, WORLD.h);
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(220,245,170,0.4)";
    ctx.lineWidth = 2;
    ctx.stroke(path);
  }

  // ---------- BUNKERS ----------
  for (const b of HOLE.bunkers) {
    const seed = b.x * 0.013;
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    // soft drop shadow
    ctx.fillStyle = "rgba(24,50,18,0.22)";
    ctx.save();
    ctx.translate(4, 6);
    traceBunker(ctx, b, 5, seed);
    ctx.fill();
    ctx.restore();
    // grass lip
    ctx.fillStyle = "rgba(45, 82, 31, 0.55)";
    traceBunker(ctx, b, 6, seed);
    ctx.fill();
    // sand body with a lumpy silhouette
    const sand = ctx.createRadialGradient(
      -b.rx * 0.35,
      -b.ry * 0.45,
      3,
      0,
      0,
      b.rx * 1.25
    );
    sand.addColorStop(0, "#fff2cd");
    sand.addColorStop(0.55, "#f2dfab");
    sand.addColorStop(1, "#d6b87b");
    ctx.fillStyle = sand;
    traceBunker(ctx, b, 0, seed);
    ctx.fill();
    // ragged edge + grain
    ctx.save();
    traceBunker(ctx, b, 0, seed);
    ctx.clip();
    ctx.fillStyle = "rgba(150,116,60,0.12)";
    for (let i = 0; i < 240; i++) {
      ctx.fillRect(rr(rng, -b.rx, b.rx), rr(rng, -b.ry, b.ry), 1.2, 1.2);
    }
    // wind ripples in the sand
    ctx.strokeStyle = "rgba(178,142,82,0.22)";
    ctx.lineWidth = 1.4;
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(
        rr(rng, -20, 20),
        rr(rng, -16, 16),
        rr(rng, 10, b.rx * 0.7),
        rr(rng, 4, 10),
        rr(rng, -0.5, 0.5),
        0,
        TAU
      );
      ctx.stroke();
    }
    ctx.restore();
    // lip
    ctx.strokeStyle = "rgba(120,89,42,0.38)";
    ctx.lineWidth = 3;
    traceBunker(ctx, b, -1, seed);
    ctx.stroke();
    ctx.strokeStyle = "rgba(255,248,210,0.32)";
    ctx.lineWidth = 1.5;
    traceBunker(ctx, b, -4, seed);
    ctx.stroke();
    ctx.restore();
  }

  // Vector sand shapes (editor courses).
  for (const poly of HOLE.sandPolys || []) {
    paintSandBody(ctx, poly, rng);
  }

  // Ocean first, then ponds on top where they meet.
  for (const poly of HOLE.oceanPolys || []) {
    paintOceanBody(ctx, poly, rng);
  }
  // Water bodies (legacy pond or editor polygons).
  for (const poly of HOLE.waterPolys || []) {
    paintWaterBody(ctx, poly, rng);
  }

  // ---------- TEE BOX ----------
  paintTeeBox(ctx, HOLE.tee);
  for (const tee of HOLE.extraTees || []) paintTeeBox(ctx, tee);

  // ---------- ROUGH SCRUB ----------
  // Small bushes
  for (let i = 0; i < 70; i++) {
    const x = rr(rng, 40, WORLD.w - 40);
    const y = rr(rng, 40, WORLD.h - 40);
    if (surfaceAt(x, y) !== "rough") continue;
    const s = rr(rng, 7, 15);
    ctx.fillStyle = "rgba(20, 54, 18, 0.22)";
    ctx.beginPath();
    ctx.ellipse(x + s * 0.35, y + s * 0.45, s * 1.1, s * 0.72, 0, 0, TAU);
    ctx.fill();
    const cols = ["#2f6a2c", "#3d7c31", "#4c8c3a"];
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = cols[(rng() * cols.length) | 0];
      ctx.beginPath();
      ctx.arc(
        x + rr(rng, -s * 0.55, s * 0.55),
        y + rr(rng, -s * 0.45, s * 0.45),
        rr(rng, s * 0.5, s * 0.85),
        0,
        TAU
      );
      ctx.fill();
    }
    ctx.fillStyle = "rgba(150,196,96,0.22)";
    ctx.beginPath();
    ctx.arc(x - s * 0.3, y - s * 0.35, s * 0.32, 0, TAU);
    ctx.fill();
  }

  // Tussocks / taller grass clumps
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 260; i++) {
    const x = rr(rng, 30, WORLD.w - 30);
    const y = rr(rng, 30, WORLD.h - 30);
    if (surfaceAt(x, y) !== "rough") continue;
    ctx.strokeStyle =
      rng() < 0.5 ? "rgba(128,178,74,0.45)" : "rgba(40,92,32,0.5)";
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = -Math.PI / 2 + rr(rng, -0.7, 0.7);
      const len = rr(rng, 4, 11);
      ctx.moveTo(x + rr(rng, -3, 3), y + rr(rng, -2, 2));
      ctx.quadraticCurveTo(
        x + Math.cos(a) * len * 0.5,
        y + Math.sin(a) * len * 0.5,
        x + Math.cos(a) * len,
        y + Math.sin(a) * len
      );
    }
    ctx.stroke();
  }

  // A few pale stones
  for (let i = 0; i < 26; i++) {
    const x = rr(rng, 40, WORLD.w - 40);
    const y = rr(rng, 40, WORLD.h - 40);
    if (surfaceAt(x, y) !== "rough") continue;
    const s = rr(rng, 2.5, 6);
    ctx.fillStyle = "rgba(20,40,18,0.2)";
    ctx.beginPath();
    ctx.ellipse(x + 1.5, y + 2, s * 1.1, s * 0.7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = rng() < 0.5 ? "#a8a994" : "#8f9a80";
    ctx.beginPath();
    ctx.ellipse(x, y, s, s * 0.68, rr(rng, -1, 1), 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,235,0.3)";
    ctx.beginPath();
    ctx.ellipse(x - s * 0.25, y - s * 0.22, s * 0.4, s * 0.25, 0, 0, TAU);
    ctx.fill();
  }

  // ---------- TREE SHADOWS ----------
  for (const t of HOLE.trees) {
    ctx.save();
    ctx.translate(t.x + t.r * 0.34, t.y + t.r * 0.46);
    ctx.scale(1, 0.68);
    const sg = ctx.createRadialGradient(0, 0, t.r * 0.15, 0, 0, t.r * 1.08);
    sg.addColorStop(0, "rgba(12,38,14,0.34)");
    sg.addColorStop(0.7, "rgba(12,38,14,0.20)");
    sg.addColorStop(1, "rgba(12,38,14,0)");
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.arc(0, 0, t.r * 1.08, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // ---------- ROADS / FLOWERS / BUILDINGS ----------
  drawScenery(ctx, HOLE, { pxPerMetre: PX_PER_METRE });

  // ---------- GLOBAL LIGHT ----------
  const sunGrad = ctx.createLinearGradient(0, 0, WORLD.w * 0.8, WORLD.h);
  sunGrad.addColorStop(0, "rgba(255,248,190,0.13)");
  sunGrad.addColorStop(0.45, "rgba(255,248,190,0.02)");
  sunGrad.addColorStop(1, "rgba(255,248,190,0)");
  ctx.fillStyle = sunGrad;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  const vig = ctx.createRadialGradient(
    WORLD.w * 0.45,
    WORLD.h * 0.42,
    Math.min(WORLD.w, WORLD.h) * 0.35,
    WORLD.w * 0.5,
    WORLD.h * 0.5,
    Math.max(WORLD.w, WORLD.h) * 0.72
  );
  vig.addColorStop(0, "rgba(8,30,10,0)");
  vig.addColorStop(1, "rgba(8,30,10,0.28)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WORLD.w, WORLD.h);

  const themeOverlay = {
    autumn: "rgba(196, 104, 34, 0.20)",
    links: "rgba(225, 196, 104, 0.17)",
    night: "rgba(14, 27, 76, 0.46)",
  }[themeId];
  if (themeOverlay) {
    ctx.save();
    ctx.fillStyle = themeOverlay;
    ctx.fillRect(0, 0, WORLD.w, WORLD.h);
    ctx.restore();
  }

  // Small minimap texture generated once per hole. Drawing this instead of
  // downscaling the full-size hole every frame is much cheaper. If memory is
  // tight the thumbnail is optional; the minimap falls back to the main canvas.
  const thumbW = 160;
  const thumbH = Math.max(1, Math.round((thumbW * WORLD.h) / WORLD.w));
  let thumb = null;
  try {
    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = thumbW;
    thumbCanvas.height = thumbH;
    const thumbCtx = thumbCanvas.getContext("2d");
    if (thumbCtx) {
      thumbCtx.drawImage(canvas, 0, 0, thumbW, thumbH);
      thumb = thumbCanvas;
    }
  } catch (err) {
    console.warn("Could not build the minimap thumbnail", err);
  }

  return { canvas, scale: S, pondPath, thumb };
}
