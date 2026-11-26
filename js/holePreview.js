// Renders a single, finished hole exactly the way the game paints it: the
// game's own course painter for the ground, then trees, the pin flag and the
// waterline. No gameplay, no input, no HUD — a moving picture of the hole.
import {
  HOLE,
  WIND,
  loadCourseData,
  setHole,
  WORLD,
} from "./course.js?v=bf5caebb-dirty";
import { paintCourse } from "./paint.js?v=bf5caebb-dirty";
import { ShoreWaves } from "./waves.js?v=bf5caebb-dirty";
import { drawFlag, drawTree } from "./holeArt.js?v=bf5caebb-dirty";
import { drawThemeGrade, ThemeLife } from "./themeFx.js?v=bf5caebb-dirty";
import { TAU } from "./util.js";

const MIN_FRAME_MS = 1000 / 30;

function paintGround(theme) {
  try {
    return paintCourse(theme);
  } catch (err) {
    console.warn("Hole preview paint failed, retrying at lower detail", err);
  }
  return paintCourse(theme, { scale: 0.85, maxPixels: 3800000 });
}

/**
 * Draws `hole` into `canvas`, fitted to its portrait world, and keeps it
 * animating until stop() is called.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {{ hole: object, theme?: string, environment?: string }} options
 * @returns {{ stop: () => void }}
 */
export function startHolePreview(canvas, {
  hole,
  theme = "verdant",
  environment = "canadian",
  mode = "round",
  targetRun = null,
}) {
  loadCourseData({
    id: "preview",
    name: "Preview",
    theme,
    environment,
    mode,
    targetRun,
    holes: [hole],
  });
  setHole(0);

  const ground = paintGround(theme);
  const trees = HOLE.trees
    .map((tree, index) => ({ tree, index }))
    .sort((a, b) => a.tree.y - b.tree.y);
  const waves = new ShoreWaves();
  waves.build(HOLE, `preview:${HOLE.index}`);
  const themeLife = new ThemeLife(theme, environment, `preview:${HOLE.index}`);

  const ctx = canvas.getContext("2d");
  const stage = canvas.parentElement;
  let raf = 0;
  let stopped = false;
  let started = 0;
  let last = 0;
  let boxW = 0;
  let boxH = 0;
  let boxKey = "";

  // Fit the hole's portrait world inside the stage, keeping its aspect ratio so
  // there are no letterbox bands.
  function layout() {
    const availW = Math.max(1, stage.clientWidth);
    const availH = Math.max(1, stage.clientHeight);
    const key = `${availW}x${availH}`;
    if (key === boxKey) return;
    boxKey = key;
    const fit = Math.min(availW / WORLD.w, availH / WORLD.h) || 1;
    boxW = Math.max(1, Math.round(WORLD.w * fit));
    boxH = Math.max(1, Math.round(WORLD.h * fit));
    canvas.style.width = `${boxW}px`;
    canvas.style.height = `${boxH}px`;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(boxW * dpr);
    canvas.height = Math.round(boxH * dpr);
  }

  function draw(time) {
    layout();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = boxW / WORLD.w;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#0d2115";
    ctx.fillRect(0, 0, boxW, boxH);
    ctx.save();
    ctx.scale(scale, scale);

    if (ground && ground.canvas) {
      ctx.drawImage(ground.canvas, 0, 0, WORLD.w, WORLD.h);
    }
    for (const entry of trees) {
      drawTree(ctx, entry.tree, entry.index, { time, wind: WIND.mps });
    }
    if (mode === "target") {
      const targets = (HOLE.bonusTargets || []).filter(
        (t) => t.type === "ground"
      );
      for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        const radius = Math.max(10, Number(target.radius) || 34);
        const pulse = 0.5 + 0.5 * Math.sin(time * 2.4 + i);
        ctx.save();
        ctx.strokeStyle = `rgba(255, 216, 74, ${0.62 + pulse * 0.3})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(target.x, target.y, radius, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 250, 210, 0.7)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(target.x, target.y, radius - 4, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }
    } else {
      drawFlag(ctx, HOLE.pin, time, WIND.mps);
    }
    try {
      waves.draw(ctx, time, false);
    } catch (err) {
      // Water is decoration; never let it break the preview.
    }
    themeLife.drawWater(ctx, time, false);
    themeLife.drawFireflies(ctx, time, false);
    ctx.restore();

    drawThemeGrade(ctx, theme, boxW, boxH);
  }

  function frame(now) {
    if (stopped) return;
    if (!started) started = now;
    // Cap the work on slow machines rather than dropping frames forever.
    if (now - last < MIN_FRAME_MS) {
      raf = requestAnimationFrame(frame);
      return;
    }
    last = now;
    draw((now - started) / 1000);
    raf = requestAnimationFrame(frame);
  }

  // Paint one frame immediately: a background tab pauses rAF, and the preview
  // should still show the hole the moment it opens.
  draw(0);
  raf = requestAnimationFrame(frame);

  return {
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
