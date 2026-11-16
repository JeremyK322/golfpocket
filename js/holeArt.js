// Tree sprites and the pin flag, shared by the game and the editor preview so
// the two renderings can never drift apart.
import { makeTreeCanvas } from "./scenery.js?v=bf5caebb-dirty";
import { TAU } from "./util.js";

// Trees share a small, bounded sprite cache. Keying by species/size/variant
// keeps memory flat across a whole round instead of one canvas per tree.
const TREE_SPRITE_CACHE = new Map();
const TREE_SPRITE_LIMIT = 36;
const TREE_SPRITE_SCALE = 1.25;

export function treeSpriteFor(tree, index) {
  if (!tree.spriteKey) {
    const species = Number(tree.species != null ? tree.species : tree.hue) || 0;
    const bucket = Math.max(18, Math.round(tree.r / 18) * 18);
    const variant = Math.abs(Math.round(tree.x * 0.37 + tree.y * 0.61 + index)) % 3;
    tree.spriteBucket = bucket;
    tree.spriteSpecies = species;
    tree.spriteVariant = variant;
    tree.spriteKey = `${species}:${bucket}:${variant}`;
  }
  let sprite = TREE_SPRITE_CACHE.get(tree.spriteKey);
  if (!sprite) {
    if (TREE_SPRITE_CACHE.size >= TREE_SPRITE_LIMIT) {
      TREE_SPRITE_CACHE.delete(TREE_SPRITE_CACHE.keys().next().value);
    }
    sprite = makeTreeCanvas(
      tree.spriteBucket,
      tree.spriteSpecies,
      tree.spriteVariant * 37,
      TREE_SPRITE_SCALE
    );
    TREE_SPRITE_CACHE.set(tree.spriteKey, sprite);
  }
  return sprite;
}

// `time` drives the breeze, `wind` is metres per second, `shake` is the
// per-tree impact wobble the game applies when a ball hits it.
export function drawTree(ctx, tree, index, { time = 0, wind = 4.5, shake = 0 } = {}) {
  const breeze = 0.9 + wind * 0.45;
  const sway =
    Math.sin(time * 0.62 + tree.x * 0.013 + tree.y * 0.006) * breeze +
    Math.sin(time * 12) * shake * 4;
  ctx.save();
  ctx.translate(tree.x + sway, tree.y);
  if (shake > 0) ctx.rotate(Math.sin(time * 18) * shake * 0.035);
  const sprite = treeSpriteFor(tree, index);
  const size = tree.r * 2.32;
  ctx.drawImage(sprite.canvas, -size / 2, -size / 2, size, size);
  ctx.restore();
}

export function drawFlag(ctx, pin, time = 0, wind = 4.5) {
  const { x, y } = pin;

  // cup
  ctx.fillStyle = "rgba(16,36,14,0.25)";
  ctx.beginPath();
  ctx.ellipse(x + 3, y + 2.5, 10, 6, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#233a22";
  ctx.beginPath();
  ctx.ellipse(x, y, 7.6, 4.6, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = "rgba(245,250,235,0.55)";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(x, y, 8.4, 5.2, 0, 0, TAU);
  ctx.stroke();

  // pole shadow
  ctx.strokeStyle = "rgba(18,38,14,0.22)";
  ctx.lineWidth = 2.4;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x + 3, y);
  ctx.lineTo(x + 10, y - 38);
  ctx.stroke();

  // pole
  ctx.strokeStyle = "#f7f4e8";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - 47);
  ctx.stroke();
  ctx.strokeStyle = "rgba(140,130,105,0.5)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(x + 0.6, y);
  ctx.lineTo(x + 0.6, y - 46);
  ctx.stroke();

  // flag
  const gust = 0.65 + wind * 0.16;
  const w1 = Math.sin(time * (3.2 + wind * 0.22)) * 3.6 * gust;
  const w2 = Math.sin(time * (3.2 + wind * 0.22) + 0.9) * 2.6 * gust;
  ctx.fillStyle = "#ff5147";
  ctx.beginPath();
  ctx.moveTo(x + 1, y - 47);
  ctx.quadraticCurveTo(x + 16, y - 47 + w1 * 0.4, x + 30 + w1, y - 40 + w2);
  ctx.quadraticCurveTo(x + 17, y - 36 + w1 * 0.3, x + 1, y - 30);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.28)";
  ctx.beginPath();
  ctx.moveTo(x + 2, y - 45);
  ctx.quadraticCurveTo(x + 14, y - 44 + w1 * 0.3, x + 24 + w1 * 0.7, y - 40 + w2);
  ctx.lineTo(x + 2, y - 38);
  ctx.closePath();
  ctx.fill();

  // pole top
  ctx.fillStyle = "#ffd23f";
  ctx.beginPath();
  ctx.arc(x, y - 47, 1.9, 0, TAU);
  ctx.fill();
}
