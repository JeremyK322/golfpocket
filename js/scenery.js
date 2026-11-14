// Shared scenery catalogue and drawing helpers used by both the game and the
// course editor. Everything is procedural, in world pixels.
import { mulberry32, rr, TAU } from "./util.js";

export const COURSE_THEMES = [
  { id: "canadian", label: "Canadian" },
  { id: "australian", label: "Australian" },
  { id: "coastal", label: "Coastal" },
  { id: "all", label: "All Themes" },
];

export function themeAllows(environment, itemTheme) {
  return environment === "all" || !environment || itemTheme === environment;
}

export const TREE_SPECIES = [
  { id: "oak", label: "Deep green", theme: "canadian", shape: "round", palette: ["#1d4f22", "#2f6b2c", "#479235", "#78c055"] },
  { id: "olive", label: "Olive green", theme: "canadian", shape: "round", palette: ["#1f5527", "#327230", "#4a9838", "#7dc95c"] },
  { id: "pine", label: "Dark pine", theme: "canadian", shape: "pine", palette: ["#173f1e", "#245a25", "#35752d", "#5c9b45"] },
  { id: "autumn", label: "Autumn", theme: "canadian", shape: "round", palette: ["#5a2c16", "#8b4119", "#c26a27", "#e6a34b"] },
  { id: "golden", label: "Golden", theme: "canadian", shape: "round", palette: ["#5b4a15", "#8d771d", "#b99a29", "#e3c85a"] },
  { id: "blossom", label: "Blossom", theme: "canadian", shape: "round", palette: ["#b4536b", "#d06f88", "#e38fa5", "#f7c0cd"] },
  { id: "spruce", label: "Blue spruce", theme: "canadian", shape: "pine", palette: ["#1c4340", "#2a615b", "#3c8076", "#73b1a1"] },
  { id: "copper", label: "Copper", theme: "canadian", shape: "round", palette: ["#4d2c1c", "#7a4529", "#a66236", "#cf8e5a"] },
  { id: "norfolk-pine", label: "Norfolk pine", theme: "coastal", shape: "pine", palette: ["#1c4a3a", "#2b6650", "#3c8066", "#78b295"] },
  { id: "coastal-banksia", label: "Coastal banksia", theme: "coastal", shape: "round", palette: ["#38553a", "#51724a", "#72925d", "#b7c88d"] },
  { id: "cabbage-tree", label: "Cabbage tree", theme: "coastal", shape: "gum", palette: ["#3f5545", "#5b725c", "#7e9378", "#bfcb9f"] },
  { id: "saltbush", label: "Saltbush", theme: "coastal", shape: "wattle", palette: ["#4d5f3e", "#6a7c4d", "#8ea062", "#d1c97a"] },
  { id: "river-gum", label: "River red gum", theme: "australian", shape: "gum", palette: ["#4d5d42", "#687a55", "#87996c", "#b6c58e"] },
  { id: "ghost-gum", label: "Ghost gum", theme: "australian", shape: "gum", palette: ["#5f6b58", "#7f8b73", "#a3ad96", "#d1d8c2"] },
  { id: "ironbark", label: "Ironbark", theme: "australian", shape: "gum", palette: ["#3d4238", "#555d4c", "#727c66", "#9ca98b"] },
  { id: "wattle", label: "Golden wattle", theme: "australian", shape: "wattle", palette: ["#43502c", "#5f6e35", "#8b9c43", "#d8c34a"] },
  { id: "paperbark", label: "Paperbark", theme: "australian", shape: "gum", palette: ["#4e5a48", "#707c64", "#94a185", "#c5cfb2"] },
  { id: "bottlebrush", label: "Bottlebrush", theme: "australian", shape: "wattle", palette: ["#3d5132", "#566d41", "#7a8e50", "#d16a4c"] },
];

export function treeSpecies(value) {
  const index = Math.abs(Number(value) || 0) % TREE_SPECIES.length;
  return TREE_SPECIES[index];
}

export function treeSpeciesForTheme(environment) {
  return TREE_SPECIES.map((species, index) => ({ ...species, index })).filter((species) =>
    themeAllows(environment, species.theme)
  );
}

export function treePalette(value) {
  return treeSpecies(value).palette;
}

export const PROP_TYPES = {
  shed: {
    label: "Shed",
    w: 62,
    h: 46,
    body: "#8c6a45",
    bodyDark: "#6f5135",
    roof: "#9a4f3c",
    roofDark: "#74382c",
  },
  house: {
    label: "House",
    w: 116,
    h: 84,
    body: "#c9b792",
    bodyDark: "#a99676",
    roof: "#8f4a3d",
    roofDark: "#69332b",
  },
  clubhouse: {
    label: "Clubhouse",
    w: 230,
    h: 150,
    body: "#d8c9a5",
    bodyDark: "#b3a17d",
    roof: "#6f4735",
    roofDark: "#4d3025",
  },
  barn: {
    label: "Barn",
    w: 150,
    h: 104,
    body: "#9b3f32",
    bodyDark: "#762e25",
    roof: "#5b3a2a",
    roofDark: "#3d271c",
  },
  rocks: {
    label: "River rocks",
    w: 92,
    h: 62,
    body: "#8b8f86",
    bodyDark: "#666b63",
    roof: "#7d837a",
    roofDark: "#565b54",
  },
  cliff: {
    label: "Cliff face",
    w: 168,
    h: 108,
    body: "#8b877c",
    bodyDark: "#5f5d55",
    roof: "#b0aa9a",
    roofDark: "#79766b",
  },
  bench: {
    label: "Bench",
    w: 72,
    h: 34,
    body: "#8a5a32",
    bodyDark: "#603d20",
    roof: "#9b6a3c",
    roofDark: "#6d4726",
  },
  bin: {
    label: "Trash bin",
    w: 34,
    h: 30,
    body: "#3f6a43",
    bodyDark: "#29482d",
    roof: "#557a57",
    roofDark: "#345136",
  },
  ballWasher: {
    label: "Ball washer",
    w: 30,
    h: 26,
    body: "#6c7d7f",
    bodyDark: "#485658",
    roof: "#87989a",
    roofDark: "#596a6c",
  },
  teeSign: {
    label: "Tee sign",
    w: 34,
    h: 30,
    body: "#d6c9a8",
    bodyDark: "#a99a79",
    roof: "#8d5a35",
    roofDark: "#653e24",
  },
  stakeRed: {
    label: "Red hazard stake",
    w: 14,
    h: 14,
    body: "#d24a3f",
    bodyDark: "#9f3028",
    roof: "#e46a5d",
    roofDark: "#b23b32",
  },
  stakeYellow: {
    label: "Yellow hazard stake",
    w: 14,
    h: 14,
    body: "#e3b83a",
    bodyDark: "#b58a20",
    roof: "#f0ce63",
    roofDark: "#c49a28",
  },
  stakeWhite: {
    label: "White hazard stake",
    w: 14,
    h: 14,
    body: "#e9e4d4",
    bodyDark: "#b9b3a1",
    roof: "#f7f3e7",
    roofDark: "#cbc4b2",
  },
  rake: {
    label: "Bunker rake",
    w: 52,
    h: 22,
    body: "#9d7a44",
    bodyDark: "#75592e",
    roof: "#b18c50",
    roofDark: "#80623a",
  },
  picnicTable: {
    label: "Picnic table",
    w: 82,
    h: 58,
    body: "#9c6b3a",
    bodyDark: "#704a26",
    roof: "#b27f49",
    roofDark: "#7d5730",
  },
  fountain: {
    label: "Drinking fountain",
    w: 28,
    h: 28,
    body: "#7b8c8d",
    bodyDark: "#556566",
    roof: "#95a6a7",
    roofDark: "#637374",
  },
  signBoard: {
    label: "Sign board",
    w: 56,
    h: 36,
    body: "#8f6a3e",
    bodyDark: "#654a2a",
    roof: "#b08a59",
    roofDark: "#7a5e3b",
  },
  distanceRed: {
    label: "Red distance marker",
    w: 28,
    h: 26,
    body: "#c84238",
    bodyDark: "#932b24",
    roof: "#e25e52",
    roofDark: "#a83a31",
  },
  distanceBlue: {
    label: "Blue distance marker",
    w: 28,
    h: 26,
    body: "#356fae",
    bodyDark: "#234f80",
    roof: "#4b8bd0",
    roofDark: "#2b5f95",
  },
};

export function propType(value) {
  return PROP_TYPES[value] ? value : "shed";
}

export const ROAD_STYLES = {
  paved: { label: "Paved", colour: "#6c6b63", edge: "#54534c", line: "rgba(246,238,198,0.55)" },
  gravel: { label: "Gravel", colour: "#a79675", edge: "#8a7a5c", line: "" },
  path: { label: "Footpath", colour: "#b89b6c", edge: "#94794f", line: "" },
  bridge: { label: "Bridge", colour: "#8a623c", edge: "#5b3d24", line: "" },
};

export function roadStyle(value) {
  return ROAD_STYLES[value] || ROAD_STYLES.paved;
}

export const FLOWER_PALETTES = [
  { id: "wild", label: "Wildflowers", colours: ["#fff4d6", "#ffe36e", "#f7a1c1", "#c7a7ff"] },
  { id: "rose", label: "Roses", colours: ["#ff7f9c", "#ff5d7e", "#ffc2d1"] },
  { id: "tulip", label: "Tulips", colours: ["#ffcc4d", "#ff8a3d", "#ff5a5a"] },
  { id: "blue", label: "Bluebells", colours: ["#8db7ff", "#6b96e8", "#c2d8ff"] },
];

export function flowerPalette(value) {
  const index = Math.abs(Number(value) || 0) % FLOWER_PALETTES.length;
  return FLOWER_PALETTES[index];
}

// ---------------------------------------------------------------- trees
export function makeTreeCanvas(radius, species, seed = 0, scale = 2) {
  const r = Math.max(18, Number(radius) || 78);
  const sp = treeSpecies(species);
  const p = sp.palette;
  const shape = sp.shape || "round";
  const rng = mulberry32(7000 + Math.round(r) * 17 + Math.abs(Number(species) || 0) * 991 + seed);
  const pad = r * 0.16;
  const size = Math.ceil(r * 2 + pad * 2);
  const cv = document.createElement("canvas");
  cv.width = Math.ceil(size * scale);
  cv.height = Math.ceil(size * scale);
  const c = cv.getContext("2d");
  c.scale(scale, scale);
  c.translate(size / 2, size / 2);

  if (shape === "gum") {
    c.strokeStyle = "#d9d4c3";
    c.lineCap = "round";
    c.lineWidth = Math.max(3, r * 0.075);
    c.beginPath();
    c.moveTo(0, r * 0.56);
    c.lineTo(r * 0.02, r * 0.06);
    c.stroke();
    c.lineWidth = Math.max(1.8, r * 0.04);
    for (const [x, y] of [
      [-r * 0.38, -r * 0.22],
      [r * 0.34, -r * 0.28],
      [-r * 0.2, -r * 0.48],
      [r * 0.18, -r * 0.52],
    ]) {
      c.beginPath();
      c.moveTo(0, r * 0.04);
      c.lineTo(x, y);
      c.stroke();
    }
  }

  const puffs = [];
  const count = shape === "gum" ? 66 : 90;
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU;
    const rad = Math.sqrt(rng()) * r * (shape === "gum" ? 0.68 : 0.76);
    puffs.push({
      x: Math.cos(a) * rad,
      y: Math.sin(a) * rad * (shape === "gum" ? 0.78 : 1),
      s: r * (0.045 + rng() * (shape === "gum" ? 0.045 : 0.06)),
      rot: rng() * TAU,
    });
  }
  for (let i = 0; i < (shape === "gum" ? 16 : 22); i++) {
    const a = (i / (shape === "gum" ? 16 : 22)) * TAU + rng() * 0.18;
    const rad = r * (0.78 + rng() * 0.13);
    puffs.push({
      x: Math.cos(a) * rad,
      y: Math.sin(a) * rad * (shape === "gum" ? 0.74 : 1),
      s: r * (shape === "gum" ? 0.026 : 0.035 + rng() * 0.04),
      rot: rng() * TAU,
    });
  }

  c.fillStyle = p[0];
  for (const d of puffs) {
    c.beginPath();
    c.arc(d.x, d.y, d.s * 2.05, 0, TAU);
    c.fill();
  }
  const sorted = [...puffs].sort((a, b) => b.x + b.y - (a.x + a.y));
  for (const d of sorted) {
    const warm = -(d.x + d.y) / (r * 1.45);
    c.fillStyle = warm > 0.22 ? p[3] : warm > -0.15 ? p[2] : p[1];
    c.globalAlpha = shape === "gum" ? 0.78 : 0.9;
    c.beginPath();
    c.ellipse(d.x, d.y, d.s * 1.8, d.s * 1.1, d.rot, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  c.fillStyle = p[0];
  c.globalAlpha = 0.34;
  for (let i = 0; i < sorted.length; i += 4) {
    const d = sorted[i];
    if (d.x + d.y < r * 0.2) continue;
    c.beginPath();
    c.ellipse(d.x, d.y, d.s * 1.05, d.s * 0.65, d.rot, 0, TAU);
    c.fill();
  }
  c.fillStyle = p[3];
  c.globalAlpha = 0.62;
  for (let i = 2; i < sorted.length; i += 5) {
    const d = sorted[i];
    if (d.x + d.y > -r * 0.12) continue;
    c.beginPath();
    c.ellipse(d.x, d.y, d.s * 0.8, d.s * 0.45, d.rot, 0, TAU);
    c.fill();
  }
  c.globalAlpha = 1;
  if (shape === "wattle") {
    c.fillStyle = "#e8cf55";
    for (let i = 0; i < sorted.length; i += 6) {
      const d = sorted[i];
      c.beginPath();
      c.arc(d.x, d.y, Math.max(1, r * 0.02), 0, TAU);
      c.fill();
    }
  }
  return { canvas: cv, size };
}

// ---------------------------------------------------------------- buildings
function drawRocks(ctx, prop, scale, rot) {
  const rng = mulberry32(Math.round(prop.x * 1.7 + prop.y * 2.3) + 91);
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,38,20,0.22)";
  ctx.beginPath();
  ctx.ellipse(4 * scale, 8 * scale, 50 * scale, 28 * scale, 0, 0, TAU);
  ctx.fill();
  const count = 7 + Math.floor(rng() * 5);
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU;
    const rad = rng() * 32 * scale;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad * 0.6;
    const rx = (10 + rng() * 18) * scale;
    const ry = rx * (0.55 + rng() * 0.35);
    const rot2 = rng() * TAU;
    ctx.fillStyle = ["#9aa096", "#7f857c", "#b0b5a8", "#6e756c"][(rng() * 4) | 0];
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, rot2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,240,0.18)";
    ctx.beginPath();
    ctx.ellipse(x - rx * 0.2, y - ry * 0.25, rx * 0.55, ry * 0.38, rot2, 0, TAU);
    ctx.fill();
    if (rng() < 0.4) {
      ctx.fillStyle = "rgba(92,132,58,0.35)";
      ctx.beginPath();
      ctx.ellipse(x + rx * 0.25, y + ry * 0.2, rx * 0.4, ry * 0.28, rot2, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawCliff(ctx, prop, meta, scale, rot) {
  const rng = mulberry32(Math.round(prop.x * 2.1 + prop.y * 1.7) + 507);
  const w = meta.w * scale;
  const h = meta.h * scale;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);

  // Drop shadow.
  ctx.fillStyle = "rgba(18, 34, 20, 0.26)";
  ctx.beginPath();
  ctx.ellipse(w * 0.12, h * 0.18, w * 0.56, h * 0.48, 0.05, 0, TAU);
  ctx.fill();

  const outline = (sx, sy, spread) => {
    ctx.beginPath();
    const count = 11;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const rx = w * (0.34 + rng() * 0.16) * spread;
      const ry = h * (0.26 + rng() * 0.18) * spread;
      const x = sx + Math.cos(a) * rx;
      const y = sy + Math.sin(a) * ry;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };

  // Main rock mass.
  outline(-w * 0.02, 0, 1);
  ctx.fillStyle = meta.bodyDark;
  ctx.fill();

  // Raised ledges.
  outline(-w * 0.1, -h * 0.12, 0.72);
  ctx.fillStyle = meta.body;
  ctx.fill();
  outline(-w * 0.16, -h * 0.2, 0.44);
  ctx.fillStyle = meta.roof;
  ctx.fill();
  outline(-w * 0.2, -h * 0.25, 0.24);
  ctx.fillStyle = "rgba(225, 220, 202, 0.5)";
  ctx.fill();

  // Cracks and strata.
  ctx.strokeStyle = "rgba(52, 50, 44, 0.42)";
  ctx.lineWidth = Math.max(1, 1.5 * scale);
  for (let i = 0; i < 5; i++) {
    const a = rng() * TAU;
    const len = w * (0.16 + rng() * 0.24);
    const x = -w * 0.1 + Math.cos(a) * w * 0.1;
    const y = -h * 0.12 + Math.sin(a) * h * 0.1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len * 0.7);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBench(ctx, prop, meta, scale, rot) {
  const w = meta.w * scale;
  const h = meta.h * scale;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,40,20,0.24)";
  ctx.beginPath();
  ctx.ellipse(3 * scale, 6 * scale, w * 0.62, h * 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = meta.bodyDark;
  for (const dx of [-w * 0.34, w * 0.34]) {
    ctx.fillRect(dx - 3 * scale, -h * 0.15, 6 * scale, h * 0.52);
  }
  ctx.fillStyle = meta.body;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h * 0.18, w, h * 0.24, 3 * scale);
  ctx.fill();
  ctx.fillStyle = meta.roof;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h * 0.48, w, h * 0.2, 3 * scale);
  ctx.fill();
  ctx.fillStyle = meta.roofDark;
  ctx.fillRect(-w * 0.42, -h * 0.48, 3 * scale, h * 0.32);
  ctx.fillRect(w * 0.42 - 3 * scale, -h * 0.48, 3 * scale, h * 0.32);
  ctx.restore();
}

function drawBin(ctx, prop, meta, scale, rot) {
  const r = (meta.w * scale) / 2;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,40,20,0.24)";
  ctx.beginPath();
  ctx.ellipse(2 * scale, 5 * scale, r * 1.05, r * 0.55, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = meta.body;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = meta.roof;
  ctx.beginPath();
  ctx.arc(0, -r * 0.25, r * 0.82, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = meta.bodyDark;
  ctx.lineWidth = 1.4 * scale;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawBallWasher(ctx, prop, scale, rot) {
  const s = scale;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,40,20,0.24)";
  ctx.beginPath();
  ctx.ellipse(2 * s, 5 * s, 12 * s, 7 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#4f5d5f";
  ctx.fillRect(-2.5 * s, -12 * s, 5 * s, 24 * s);
  ctx.fillStyle = "#87989a";
  ctx.beginPath();
  ctx.roundRect(-8 * s, -20 * s, 16 * s, 14 * s, 3 * s);
  ctx.fill();
  ctx.fillStyle = "#c9d6d5";
  ctx.beginPath();
  ctx.arc(0, -13 * s, 4 * s, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawTeeSign(ctx, prop, meta, scale, rot) {
  const s = scale;
  const w = meta.w * s;
  const h = meta.h * s;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,40,20,0.22)";
  ctx.beginPath();
  ctx.ellipse(2 * s, 5 * s, w * 0.5, h * 0.35, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = meta.bodyDark;
  ctx.fillRect(-2 * s, -h * 0.1, 4 * s, h * 0.55);
  ctx.fillStyle = meta.body;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h * 0.5, w, h * 0.48, 3 * s);
  ctx.fill();
  ctx.strokeStyle = meta.bodyDark;
  ctx.lineWidth = 1.2 * s;
  ctx.stroke();
  ctx.fillStyle = "#365a35";
  ctx.font = `900 ${Math.max(5, 7 * s)}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("TEE", 0, -h * 0.26);
  ctx.restore();
}

function drawHazardStake(ctx, prop, meta, scale, rot) {
  const s = scale;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,40,20,0.2)";
  ctx.beginPath();
  ctx.ellipse(1.5 * s, 4 * s, 5 * s, 3 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#e8e2cf";
  ctx.fillRect(-1.2 * s, -10 * s, 2.4 * s, 16 * s);
  ctx.fillStyle = meta.body;
  ctx.fillRect(-4 * s, -10 * s, 8 * s, 7 * s);
  ctx.restore();
}

function drawRake(ctx, prop, meta, scale, rot) {
  const s = scale;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = meta.body;
  ctx.fillRect(-22 * s, -1.5 * s, 40 * s, 3 * s);
  ctx.fillStyle = meta.bodyDark;
  ctx.fillRect(18 * s, -9 * s, 10 * s, 18 * s);
  ctx.strokeStyle = meta.roofDark;
  ctx.lineWidth = 1 * s;
  for (let i = 0; i < 5; i++) {
    const x = 19 * s + i * 1.8 * s;
    ctx.beginPath();
    ctx.moveTo(x, 8 * s);
    ctx.lineTo(x + 0.5 * s, 14 * s);
    ctx.stroke();
  }
  ctx.restore();
}

function drawPicnicTable(ctx, prop, meta, scale, rot) {
  const w = meta.w * scale;
  const h = meta.h * scale;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,40,20,0.24)";
  ctx.beginPath();
  ctx.ellipse(3 * scale, 6 * scale, w * 0.58, h * 0.45, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = meta.bodyDark;
  ctx.fillRect(-w * 0.38, -h * 0.1, 4 * scale, h * 0.45);
  ctx.fillRect(w * 0.34, -h * 0.1, 4 * scale, h * 0.45);
  ctx.fillStyle = meta.body;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h * 0.18, w, h * 0.3, 3 * scale);
  ctx.fill();
  ctx.fillStyle = meta.roof;
  ctx.beginPath();
  ctx.roundRect(-w * 0.56, h * 0.12, w * 1.12, h * 0.16, 3 * scale);
  ctx.fill();
  ctx.restore();
}

function drawFountain(ctx, prop, meta, scale, rot) {
  const s = scale;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,40,20,0.24)";
  ctx.beginPath();
  ctx.ellipse(2 * s, 4 * s, 11 * s, 6 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#576566";
  ctx.fillRect(-3 * s, -8 * s, 6 * s, 20 * s);
  ctx.fillStyle = "#9aa9aa";
  ctx.beginPath();
  ctx.ellipse(0, -10 * s, 10 * s, 5 * s, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#5db6cc";
  ctx.beginPath();
  ctx.ellipse(0, -10 * s, 7 * s, 3.3 * s, 0, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawSignBoard(ctx, prop, meta, scale, rot) {
  const w = meta.w * scale;
  const h = meta.h * scale;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,40,20,0.24)";
  ctx.beginPath();
  ctx.ellipse(2 * scale, 6 * scale, w * 0.55, h * 0.35, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = meta.bodyDark;
  ctx.fillRect(-w * 0.32, 0, 4 * scale, h * 0.5);
  ctx.fillRect(w * 0.28, 0, 4 * scale, h * 0.5);
  ctx.fillStyle = meta.body;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h * 0.5, w, h * 0.55, 3 * scale);
  ctx.fill();
  ctx.strokeStyle = meta.roofDark;
  ctx.lineWidth = 1.2 * scale;
  ctx.stroke();
  ctx.fillStyle = "rgba(55,74,43,0.75)";
  for (let i = 0; i < 3; i++) {
    ctx.fillRect(-w * 0.36, -h * 0.34 + i * h * 0.14, w * (0.55 - i * 0.08), 2 * scale);
  }
  ctx.restore();
}

function drawDistanceMarker(ctx, prop, meta, scale, rot, opts) {
  const w = meta.w * scale;
  const h = meta.h * scale;
  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);
  ctx.fillStyle = "rgba(18,40,20,0.24)";
  ctx.beginPath();
  ctx.ellipse(2 * scale, 5 * scale, w * 0.6, h * 0.4, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = "#d9d3c1";
  ctx.fillRect(-2 * scale, 0, 4 * scale, h * 0.55);
  ctx.fillStyle = meta.body;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h * 0.55, w, h * 0.62, 4 * scale);
  ctx.fill();
  ctx.strokeStyle = meta.bodyDark;
  ctx.lineWidth = 1.4 * scale;
  ctx.stroke();
  ctx.restore();

  const pin = opts && opts.pin;
  if (pin) {
    const distance = Math.round(
      Math.hypot(prop.x - pin.x, prop.y - pin.y) / (opts.pxPerMetre || 3.94)
    );
    ctx.save();
    ctx.translate(prop.x, prop.y);
    ctx.fillStyle = "#fffdf2";
    ctx.font = `900 ${Math.max(6, 8 * scale)}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${distance} M`, 0, -h * 0.18);
    ctx.restore();
  }
}

export function drawProp(ctx, prop, opts = {}) {
  const type = propType(prop.type);
  const meta = PROP_TYPES[type];
  const scale = Math.max(0.35, Number(prop.scale) || 1);
  const rot = Number(prop.rot) || 0;

  if (type === "rocks") return drawRocks(ctx, prop, scale, rot);
  if (type === "cliff") return drawCliff(ctx, prop, meta, scale, rot);
  if (type === "bench") return drawBench(ctx, prop, meta, scale, rot);
  if (type === "bin") return drawBin(ctx, prop, meta, scale, rot);
  if (type === "ballWasher") return drawBallWasher(ctx, prop, scale, rot);
  if (type === "teeSign") return drawTeeSign(ctx, prop, meta, scale, rot);
  if (type === "stakeRed" || type === "stakeYellow" || type === "stakeWhite") {
    return drawHazardStake(ctx, prop, meta, scale, rot);
  }
  if (type === "rake") return drawRake(ctx, prop, meta, scale, rot);
  if (type === "picnicTable") return drawPicnicTable(ctx, prop, meta, scale, rot);
  if (type === "fountain") return drawFountain(ctx, prop, meta, scale, rot);
  if (type === "signBoard") return drawSignBoard(ctx, prop, meta, scale, rot);
  if (type === "distanceRed" || type === "distanceBlue") {
    return drawDistanceMarker(ctx, prop, meta, scale, rot, opts);
  }

  const w = meta.w * scale;
  const h = meta.h * scale;

  ctx.save();
  ctx.translate(prop.x, prop.y);
  ctx.rotate(rot);

  // Ground shadow.
  ctx.fillStyle = "rgba(18,42,16,0.26)";
  ctx.beginPath();
  ctx.ellipse(w * 0.09, h * 0.16, w * 0.62, h * 0.54, 0, 0, TAU);
  ctx.fill();

  // Body / walls.
  ctx.fillStyle = meta.body;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(12, h * 0.12));
  ctx.fill();
  ctx.strokeStyle = meta.bodyDark;
  ctx.lineWidth = Math.max(1.2, scale * 2);
  ctx.stroke();

  // Roof: two shaded halves with a ridge line.
  ctx.fillStyle = meta.roof;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + w * 0.06, -h / 2 + h * 0.06, w * 0.88, h * 0.48, Math.min(9, h * 0.09));
  ctx.fill();
  ctx.fillStyle = meta.roofDark;
  ctx.beginPath();
  ctx.roundRect(-w / 2 + w * 0.06, h * 0.02, w * 0.88, h * 0.38, Math.min(9, h * 0.09));
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = Math.max(1, scale * 1.5);
  ctx.beginPath();
  ctx.moveTo(-w * 0.38, -h * 0.01);
  ctx.lineTo(w * 0.38, -h * 0.01);
  ctx.stroke();

  // Door and windows.
  ctx.fillStyle = "rgba(42,31,20,0.72)";
  ctx.fillRect(-w * 0.08, h * 0.14, w * 0.16, h * 0.28);
  ctx.fillStyle = "rgba(255,235,170,0.7)";
  const winW = w * 0.12;
  const winH = h * 0.13;
  for (const dx of [-w * 0.32, w * 0.32]) {
    ctx.fillRect(dx - winW / 2, h * 0.18, winW, winH);
  }

  // Clubhouse veranda / path detail.
  if (type === "clubhouse") {
    ctx.fillStyle = "rgba(255,247,218,0.28)";
    ctx.beginPath();
    ctx.roundRect(-w / 2 - w * 0.04, h * 0.33, w * 1.08, h * 0.18, 6);
    ctx.fill();
  }

  ctx.restore();
}

// ---------------------------------------------------------------- roads
function drawBridge(ctx, pts, width) {
  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };
  ctx.save();
  ctx.lineCap = "butt";
  ctx.lineJoin = "round";

  trace();
  ctx.strokeStyle = "rgba(18,34,20,0.34)";
  ctx.lineWidth = width + 12;
  ctx.stroke();

  trace();
  ctx.strokeStyle = "#4e3420";
  ctx.lineWidth = width + 5;
  ctx.stroke();

  trace();
  ctx.strokeStyle = "#8a623c";
  ctx.lineWidth = width;
  ctx.stroke();

  // Planks.
  ctx.strokeStyle = "rgba(58,38,21,0.4)";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const steps = Math.max(1, Math.ceil(len / 15));
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      ctx.beginPath();
      ctx.moveTo(x + nx * (width / 2), y + ny * (width / 2));
      ctx.lineTo(x - nx * (width / 2), y - ny * (width / 2));
      ctx.stroke();
    }
  }

  // Side rails.
  ctx.strokeStyle = "#5b3d24";
  ctx.lineWidth = 3;
  for (const side of [-1, 1]) {
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = (-dy / len) * (width / 2 - 2) * side;
      const ny = (dx / len) * (width / 2 - 2) * side;
      ctx.beginPath();
      ctx.moveTo(a.x + nx, a.y + ny);
      ctx.lineTo(b.x + nx, b.y + ny);
      ctx.stroke();
    }
  }
  ctx.restore();
}

export function drawRoad(ctx, road) {
  const pts = Array.isArray(road.points) ? road.points : [];
  if (pts.length < 2) return;
  const style = roadStyle(road.style);
  const width = Math.max(8, Number(road.width) || 42);
  if (road.style === "bridge") {
    drawBridge(ctx, pts, width);
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const trace = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  };

  // Soft shadow / verge.
  trace();
  ctx.strokeStyle = "rgba(20,46,18,0.22)";
  ctx.lineWidth = width + 9;
  ctx.stroke();

  // Edge.
  trace();
  ctx.strokeStyle = style.edge;
  ctx.lineWidth = width + 3;
  ctx.stroke();

  // Surface.
  trace();
  ctx.strokeStyle = style.colour;
  ctx.lineWidth = width;
  ctx.stroke();

  if (style.line) {
    trace();
    ctx.strokeStyle = style.line;
    ctx.lineWidth = 1.4;
    ctx.setLineDash([width * 0.55, width * 0.5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (road.style === "gravel") {
    const rng = mulberry32(Math.round(pts[0].x * 3 + pts[0].y * 7) + pointsSeed(pts));
    ctx.fillStyle = "rgba(255,247,220,0.34)";
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      const n = Math.max(2, Math.ceil(len / 18));
      for (let k = 0; k < n; k++) {
        const t = (k + rng()) / n;
        const x = a.x + (b.x - a.x) * t + rr(rng, -width * 0.35, width * 0.35);
        const y = a.y + (b.y - a.y) * t + rr(rng, -width * 0.35, width * 0.35);
        ctx.fillRect(x, y, 1.4, 1.4);
      }
    }
  }
  ctx.restore();
}

function pointsSeed(pts) {
  let seed = 0;
  for (const p of pts) seed += Math.round(p.x * 0.7 + p.y * 1.3);
  return seed;
}

// ---------------------------------------------------------------- flowers
export function drawFlowerBed(ctx, bed) {
  const rx = Math.max(10, Number(bed.rx) || 34);
  const ry = Math.max(8, Number(bed.ry) || 24);
  const rot = Number(bed.rot) || 0;
  const palette = flowerPalette(bed.palette);
  const rng = mulberry32(Math.round(bed.x * 1.7 + bed.y * 2.9) + 41);

  ctx.save();
  ctx.translate(bed.x, bed.y);
  ctx.rotate(rot);

  ctx.fillStyle = "rgba(18,52,20,0.22)";
  ctx.beginPath();
  ctx.ellipse(3, 4, rx * 1.04, ry * 1.04, 0, 0, TAU);
  ctx.fill();

  ctx.fillStyle = "rgba(52,104,42,0.9)";
  ctx.beginPath();
  ctx.ellipse(0, 0, rx, ry, 0, 0, TAU);
  ctx.fill();

  const count = Math.max(10, Math.round((rx * ry) / 34));
  for (let i = 0; i < count; i++) {
    const a = rng() * TAU;
    const rad = Math.sqrt(rng());
    const x = Math.cos(a) * rx * rad * 0.88;
    const y = Math.sin(a) * ry * rad * 0.88;
    ctx.fillStyle = palette.colours[(rng() * palette.colours.length) | 0];
    ctx.beginPath();
    ctx.arc(x, y, rr(rng, 1.1, 2.5), 0, TAU);
    ctx.fill();
    if (rng() < 0.4) {
      ctx.fillStyle = "rgba(255,224,92,0.9)";
      ctx.beginPath();
      ctx.arc(x, y, 0.75, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

// Draw flat scenery into a ground canvas (roads, flowers, buildings).
export function drawScenery(ctx, hole, opts = {}) {
  for (const road of hole.roads || []) drawRoad(ctx, road);
  for (const bed of hole.flowerBeds || []) drawFlowerBed(ctx, bed);
  for (const prop of hole.props || []) {
    drawProp(ctx, prop, { pin: hole.pin, pxPerMetre: opts.pxPerMetre });
  }
}
