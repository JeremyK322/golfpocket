// Animated surf on painted ocean shorelines. Shoreline geometry is built once
// per hole; every wave reads the same clock so all beaches break together.

export const WAVE_PERIOD = 5.2;

const MIN_SHORELINE = 1100;
const MIN_OCEAN_AREA = 40000;
const MAX_WAVE_POINTS = 160;
const WAVE_REACH = 46;

function signedArea(poly) {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i];
    const [x2, y2] = poly[(i + 1) % poly.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function polygonPath(poly) {
  const path = new Path2D();
  path.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
  path.closePath();
  return path;
}

function hash01(x, y) {
  const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return v - Math.floor(v);
}

export class ShoreWaves {
  constructor() {
    this.key = "";
    this.enabled = false;
    this.polys = [];
  }

  build(hole, key) {
    this.key = key;
    this.enabled = false;
    this.polys = [];
    if (typeof Path2D === "undefined") return;

    const oceans = (hole?.oceanPolys || []).filter(
      (poly) => Array.isArray(poly) && poly.length > 2
    );
    const kept = [];
    let totalLength = 0;
    for (const poly of oceans) {
      const area = Math.abs(signedArea(poly));
      if (area < MIN_OCEAN_AREA) continue;
      let perimeter = 0;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        perimeter += Math.hypot(x2 - x1, y2 - y1);
      }
      if (perimeter <= 0) continue;
      totalLength += perimeter;
      kept.push({
        poly,
        perimeter,
        orientation: signedArea(poly) >= 0 ? 1 : -1,
        path: polygonPath(poly),
        points: [],
      });
    }

    if (!kept.length || totalLength < MIN_SHORELINE) return;

    const budget = Math.min(
      MAX_WAVE_POINTS,
      Math.max(24, Math.round(totalLength / 28))
    );

    for (const group of kept) {
      const count = Math.max(
        8,
        Math.round((group.perimeter / totalLength) * budget)
      );
      const step = group.perimeter / count;
      const poly = group.poly;
      for (let i = 0; i < poly.length; i++) {
        const [x1, y1] = poly[i];
        const [x2, y2] = poly[(i + 1) % poly.length];
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.hypot(dx, dy);
        if (length < 0.5) continue;
        const samples = Math.max(1, Math.round(length / step));
        const nx = (-dy / length) * group.orientation;
        const ny = (dx / length) * group.orientation;
        for (let s = 0; s < samples; s++) {
          const t = (s + 0.5) / samples;
          const x = x1 + dx * t;
          const y = y1 + dy * t;
          const jitter = hash01(x, y);
          group.points.push({
            x,
            y,
            nx,
            ny,
            len: 14 + jitter * 20,
            bow: (hash01(y, x) - 0.5) * 8,
          });
        }
      }
    }

    this.polys = kept;
    this.enabled = true;
  }

  draw(ctx, time, lowEffects = false) {
    if (!this.enabled) return;
    const cycle = (((time / WAVE_PERIOD) % 1) + 1) % 1;
    const bands = lowEffects ? 2 : 3;
    const stride = lowEffects ? 2 : 1;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (const group of this.polys) {
      ctx.save();
      ctx.clip(group.path);
      for (let band = 0; band < bands; band++) {
        let phase = cycle - band * 0.22;
        phase = ((phase % 1) + 1) % 1;
        if (phase > 0.72) continue;
        const t = phase / 0.72;
        const distance = 3 + t * WAVE_REACH;
        const alpha = Math.sin(Math.PI * t);
        if (alpha <= 0.01) continue;

        ctx.beginPath();
        const points = group.points;
        for (let i = 0; i < points.length; i += stride) {
          const p = points[i];
          const x = p.x + p.nx * distance;
          const y = p.y + p.ny * distance;
          const tx = -p.ny * p.len * 0.5;
          const ty = p.nx * p.len * 0.5;
          ctx.moveTo(x - tx, y - ty);
          ctx.quadraticCurveTo(
            x + p.nx * p.bow,
            y + p.ny * p.bow,
            x + tx,
            y + ty
          );
        }
        if (band === 0) {
          ctx.strokeStyle = `rgba(238, 253, 252, ${(0.16 + alpha * 0.34).toFixed(3)})`;
          ctx.lineWidth = 1.6 + (1 - t) * 1.2;
        } else {
          ctx.strokeStyle = `rgba(198, 240, 245, ${(0.07 + alpha * 0.17).toFixed(3)})`;
          ctx.lineWidth = 1.1;
        }
        ctx.stroke();
      }

      // A gentle breath of foam right on the shoreline.
      const breath = 0.5 + 0.5 * Math.cos(cycle * Math.PI * 2);
      ctx.globalAlpha = 0.07 + breath * 0.09;
      ctx.strokeStyle = "#e8fcfb";
      ctx.lineWidth = 2;
      ctx.stroke(group.path);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    ctx.restore();
  }
}
