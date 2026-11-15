// Renders a single, finished hole exactly the way the game paints it: the
// game's own course painter for the ground, then trees, the pin flag and the
// waterline. No gameplay, no input, no HUD — a moving picture of the hole.
import {
  HOLE,
  WIND,
  loadCourseData,
  setHole,
  WORLD,
} from "./course.js?v=e61ece37";
import { paintCourse } from "./paint.js?v=e61ece37";
import { ShoreWaves } from "./waves.js?v=e61ece37";
import { drawFlag, drawTree } from "./holeArt.js?v=e61ece37";

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
export function startHolePreview(canvas, { hole, theme = "verdant", environment = "canadian" }) {
  loadCourseData({
    id: "preview",
    name: "Preview",
    theme,
    environment,
    holes: [hole],
  });
  setHole(0);

  const ground = paintGround(theme);
  const trees = HOLE.trees
    .map((tree, index) => ({ tree, index }))
    .sort((a, b) => a.tree.y - b.tree.y);
  const waves = new ShoreWaves();
  waves.build(HOLE, `preview:${HOLE.index}`);

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

  function frame(now) {
    if (stopped) return;
    if (!started) started = now;
    // Cap the work on slow machines rather than dropping frames forever.
    if (now - last < MIN_FRAME_MS) {
      raf = requestAnimationFrame(frame);
      return;
    }
    last = now;
    const time = (now - started) / 1000;

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
    drawFlag(ctx, HOLE.pin, time, WIND.mps);
    try {
      waves.draw(ctx, time, false);
    } catch (err) {
      // Water is decoration; never let it break the preview.
    }
    ctx.restore();

    raf = requestAnimationFrame(frame);
  }

  raf = requestAnimationFrame(frame);

  return {
    stop() {
      stopped = true;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}
