// Shared course-theme grading and night ambience. This module is deliberately
// free of gameplay code so the editor preview can use exactly the same look as
// the game.
import { HOLE } from "./course.js?v=bf5caebb-dirty";
import { clamp, mulberry32, pointInPoly, rr, TAU } from "./util.js";

const GLOW_SPRITE_SIZE = 64;
const glowSprites = new Map();

function glowSprite(core, edge) {
  const key = `${core}|${edge}`;
  let sprite = glowSprites.get(key);
  if (sprite) return sprite;
  sprite = document.createElement("canvas");
  sprite.width = GLOW_SPRITE_SIZE;
  sprite.height = GLOW_SPRITE_SIZE;
  const c = sprite.getContext("2d");
  const half = GLOW_SPRITE_SIZE / 2;
  const g = c.createRadialGradient(half, half, 0, half, half, half);
  g.addColorStop(0, core);
  g.addColorStop(0.24, core);
  g.addColorStop(1, edge);
  c.fillStyle = g;
  c.fillRect(0, 0, GLOW_SPRITE_SIZE, GLOW_SPRITE_SIZE);
  glowSprites.set(key, sprite);
  return sprite;
}

function fireflySprite() {
  return glowSprite("rgba(255, 244, 148, 0.95)", "rgba(255, 190, 38, 0)");
}

function waterSprite() {
  return glowSprite("rgba(188,255,244,0.9)", "rgba(72,226,214,0)");
}

function polygonPath(poly) {
  if (typeof Path2D === "undefined") return null;
  const path = new Path2D();
  path.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) path.lineTo(poly[i][0], poly[i][1]);
  path.closePath();
  return path;
}

function polygonBounds(poly) {
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
  return { minX, maxX, minY, maxY, w: maxX - minX, h: maxY - minY };
}

function polygonArea(poly) {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(area / 2);
}

function makeFireflies(count) {
  const trees = HOLE.trees || [];
  if (!trees.length) return [];
  const rng = mulberry32(7300 + (HOLE.index || 0) * 191);
  const flies = [];
  for (let i = 0; i < count; i++) {
    const tree = trees[Math.floor(rng() * trees.length)];
    if (!tree) continue;
    const angle = rng() * TAU;
    const radius = tree.r * rr(rng, 0.42, 0.98);
    flies.push({
      x: tree.x + Math.cos(angle) * radius,
      y: tree.y - tree.r * rr(rng, 0.18, 0.62) + Math.sin(angle) * radius * 0.55,
      driftX: rr(rng, 8, 24),
      driftY: rr(rng, 5, 14),
      phase: rng() * TAU,
      speed: rr(rng, 0.35, 0.9),
      size: rr(rng, 11, 22),
    });
  }
  return flies;
}

function sampleWaterPoints(polys, total) {
  const points = [];
  if (!polys.length) return points;
  const areas = polys.map(polygonArea);
  const totalArea = areas.reduce((sum, area) => sum + area, 0) || 1;
  const rng = mulberry32(8300 + (HOLE.index || 0) * 233);
  for (let i = 0; i < polys.length; i++) {
    const poly = polys[i];
    const count = clamp(Math.round((areas[i] / totalArea) * total), 4, 46);
    const b = polygonBounds(poly);
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 80) {
      attempts++;
      const x = rr(rng, b.minX, b.maxX);
      const y = rr(rng, b.minY, b.maxY);
      if (!pointInPoly(x, y, poly)) continue;
      points.push({
        x,
        y,
        driftX: rr(rng, 10, 28),
        driftY: rr(rng, 6, 18),
        phase: rng() * TAU,
        speed: rr(rng, 0.16, 0.42),
        size: rr(rng, 14, 34),
      });
      placed++;
    }
  }
  return points;
}

export class ThemeLife {
  constructor(themeId, environment, key = "") {
    this.themeId = themeId || "verdant";
    this.environment = environment || "canadian";
    this.key = key;
    this.fireflies = [];
    this.water = [];
    this.waterBodies = [];
    if (this.themeId !== "night") return;

    if (this.environment === "canadian" || this.environment === "all") {
      const treeCount = (HOLE.trees || []).length;
      this.fireflies = makeFireflies(
        clamp(Math.round(treeCount * 2.1), 24, 92)
      );
    }
    if (this.environment === "coastal" || this.environment === "all") {
      const polys = [
        ...(HOLE.oceanPolys || []),
        ...(HOLE.waterPolys || []),
      ].filter((poly) => Array.isArray(poly) && poly.length > 2);
      this.water = sampleWaterPoints(polys, 96);
      this.waterBodies = polys.map((poly) => ({
        poly,
        path: polygonPath(poly),
        bounds: polygonBounds(poly),
      }));
    }
  }

  drawWater(ctx, time, lowEffects = false) {
    if (!this.water.length && !this.waterBodies.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";

    const wash = 0.085 + (Math.sin(time * 0.55) + 1) * 0.02;
    for (const body of this.waterBodies) {
      if (!body.path) continue;
      ctx.save();
      ctx.clip(body.path);
      ctx.fillStyle = `rgba(66, 226, 208, ${wash})`;
      ctx.fillRect(body.bounds.minX, body.bounds.minY, body.bounds.w, body.bounds.h);
      ctx.restore();
    }

    const sprite = waterSprite();
    const step = lowEffects && this.water.length > 40 ? 2 : 1;
    for (let i = 0; i < this.water.length; i += step) {
      const p = this.water[i];
      const blink = 0.28 + (Math.sin(time * 0.7 + p.phase) + 1) * 0.24;
      const x = p.x + Math.sin(time * p.speed + p.phase) * p.driftX;
      const y = p.y + Math.cos(time * p.speed * 0.8 + p.phase) * p.driftY;
      const size = p.size * (0.82 + blink * 0.4);
      ctx.globalAlpha = blink;
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.restore();
  }

  drawFireflies(ctx, time, lowEffects = false, bounds = null) {
    if (!this.fireflies.length) return;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const sprite = fireflySprite();
    const step = lowEffects && this.fireflies.length > 48 ? 2 : 1;
    for (let i = 0; i < this.fireflies.length; i += step) {
      const f = this.fireflies[i];
      const x = f.x + Math.sin(time * f.speed + f.phase) * f.driftX;
      const y = f.y + Math.cos(time * f.speed * 0.75 + f.phase * 1.7) * f.driftY;
      if (
        bounds &&
        (x < bounds.minX - 40 ||
          x > bounds.maxX + 40 ||
          y < bounds.minY - 40 ||
          y > bounds.maxY + 40)
      ) {
        continue;
      }
      const pulse = 0.5 + 0.5 * Math.sin(time * 1.9 + f.phase);
      const blink = 0.16 + pulse * pulse * pulse * 0.84;
      const size = f.size * (0.78 + blink * 0.55);
      ctx.globalAlpha = blink * 0.92;
      ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
    }
    ctx.restore();
  }
}

// Screen-space colour grade. Keeping this out of the baked ground means trees,
// the ball and particles all receive the same treatment.
export function drawThemeGrade(ctx, themeId, width, height) {
  if (!width || !height || themeId === "verdant" || !themeId) return;
  ctx.save();

  if (themeId === "autumn") {
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = "rgba(255, 139, 28, 0.48)";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(255, 218, 150, 0.16)";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "screen";
    const glow = ctx.createRadialGradient(
      width * 0.16,
      height * 0.08,
      0,
      width * 0.16,
      height * 0.08,
      Math.max(width, height) * 0.85
    );
    glow.addColorStop(0, "rgba(255, 214, 122, 0.34)");
    glow.addColorStop(0.55, "rgba(255, 172, 74, 0.10)");
    glow.addColorStop(1, "rgba(255, 150, 50, 0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(184, 79, 18, 0.10)";
    ctx.fillRect(0, 0, width, height);
  } else if (themeId === "links") {
    ctx.globalCompositeOperation = "soft-light";
    ctx.fillStyle = "rgba(247, 232, 158, 0.44)";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "screen";
    const haze = ctx.createLinearGradient(0, 0, 0, height);
    haze.addColorStop(0, "rgba(255, 252, 226, 0.24)");
    haze.addColorStop(0.55, "rgba(255, 247, 205, 0.08)");
    haze.addColorStop(1, "rgba(232, 220, 160, 0)");
    ctx.fillStyle = haze;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(255, 244, 206, 0.14)";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "rgba(205, 188, 120, 0.13)";
    ctx.fillRect(0, 0, width, height);
  } else if (themeId === "night") {
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(58, 84, 156, 0.62)";
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "screen";
    const moon = ctx.createRadialGradient(
      width * 0.22,
      height * 0.05,
      0,
      width * 0.22,
      height * 0.05,
      Math.max(width, height) * 0.9
    );
    moon.addColorStop(0, "rgba(156, 188, 255, 0.22)");
    moon.addColorStop(0.42, "rgba(92, 132, 224, 0.08)");
    moon.addColorStop(1, "rgba(60, 96, 190, 0)");
    ctx.fillStyle = moon;
    ctx.fillRect(0, 0, width, height);
    ctx.globalCompositeOperation = "source-over";
    const vignette = ctx.createRadialGradient(
      width * 0.5,
      height * 0.46,
      Math.min(width, height) * 0.28,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.72
    );
    vignette.addColorStop(0, "rgba(4, 10, 30, 0)");
    vignette.addColorStop(1, "rgba(3, 8, 26, 0.62)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.restore();
}
