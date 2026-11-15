// GolfPocket course editor. A standalone desktop/tablet tool that edits the
// same JSON schema the game loads from courses/*.json.
import * as C from "./course.js?v=c20301f3";
import {
  clamp,
  closedSplinePoints,
  distanceToPolyline,
  circleUnionPath,
  inEllipse,
  pointInPoly,
  splinePoints,
  TAU,
} from "./util.js";
import {
  TREE_SPECIES,
  COURSE_THEMES,
  themeAllows,
  treeSpeciesForTheme,
  PROP_TYPES,
  ROAD_STYLES,
  FLOWER_PALETTES,
  makeTreeCanvas,
  drawProp,
  drawRoad,
  drawFlowerBed,
} from "./scenery.js?v=c20301f3";
import { analyseCourse } from "./stableford.js?v=c20301f3";
import * as Store from "./editorStore.js?v=c20301f3";
import { startHolePreview } from "./holePreview.js?v=c20301f3";

const WORLD = C.BASE_WORLD;
const CELL = 4;
const CART_CLEARANCE = 44;
const LIBRARY_KEY = "golfpocket.editorLibrary.v1";
const MIN_ZOOM = 0.04;
const MAX_ZOOM = 3;
const PACKAGE_FORMAT = "glfpkt";
const PACKAGE_VERSION = 1;
// Work-in-progress files. Deliberately a separate format so the game can
// reject an unfinished course with a clear message instead of half-loading it.
const PART_FORMAT = "glfppart";
const PART_VERSION = 1;
const AUTOSAVE_KEY = "autosave";
const PART_HANDLE_KEY = "partFileHandle";
const UI_SCALE_KEY = "uiScale";
const UI_SCALE_STEPS = [0.85, 1, 1.15, 1.3, 1.5, 1.75];
const EXPORT_WIDTH = 1700;
const EXPORT_MIN_HEIGHT = 2350;
const EXPORT_PADDING = 240;
const GROW_MARGIN = 260;
const GROW_STEP = 900;

const TOOLS = {
  pan: {
    title: "PAN",
    help: "Drag the whole course map. Scroll to zoom, or use the − / + / FIT buttons. FIT frames the entire designed course; click a hole tab to zoom to that hole.",
  },
  fairway: {
    title: "FAIRWAY",
    help: "Click to add a fairway segment. Finish it with double-click or Enter, then draw another segment to split the fairway around water or a gap. Width comes from the slider.",
  },
  tee: {
    title: "TEE",
    help: "Click to place the tee. The game aims from this point and the round starts here.",
  },
  green: {
    title: "GREEN",
    help: "Click to place the green, or drag outwards from its centre to size it. Radius sliders are below.",
  },
  pin: {
    title: "PIN",
    help: "Click to place the cup. Keep it inside the green for a sensible hole.",
  },
  pond: {
    title: "POND",
    help: "Drag to paint water. Overlapping strokes and shapes of the same type merge into one shoreline when you release.",
  },
  ocean: {
    title: "OCEAN",
    help: "Drag to paint ocean. Ocean behaves as water for the ball and cannot be walked across except over bridges.",
  },
  bunker: {
    title: "BUNKER",
    help: "Drag to paint sand. Overlapping strokes and shapes of the same type merge into one bunker when you release.",
  },
  tree: {
    title: "TREE",
    help: "Click to drop a tree. Trees block shots and are used as rabbit warren locations.",
  },
  prop: {
    title: "BUILDING",
    help: "Place a shed, house, barn, clubhouse, furniture, river rocks or a distance marker. Scenery does not block shots.",
  },
  road: {
    title: "ROAD",
    help: "Click waypoints to draw a road, path or bridge. Double-click or press Enter to finish. Roads are scenery; bridges are water for the ball but drivable for carts.",
  },
  flowers: {
    title: "FLOWERS",
    help: "Click to place a flower bed. Use the sliders for size and choose a colour mix.",
  },
  reference: {
    title: "REFERENCE",
    help: "Open a course image to trace over. Drag to move it, drag a corner to resize, and use the opacity slider. It is not exported with the course.",
  },
  deer: {
    title: "DEER",
    help: "Click to add a course-wide deer spawn zone. Every hole whose export frame contains it gets the deer family.",
  },
  rabbit: {
    title: "RABBIT",
    help: "Click near a tree to mark a course-wide rabbit warren. It appears in every hole whose export frame contains it.",
  },
  squirrel: {
    title: "SQUIRREL",
    help: "Click to place a course-wide squirrel marker. It appears in every hole whose export frame contains it.",
  },
  duck: {
    title: "DUCK",
    help: "Click inside a pond to mark a course-wide duck pond. It appears in every hole whose export frame contains it.",
  },
  kangaroo: {
    title: "KANGAROO",
    help: "Click to add a course-wide kangaroo mob. It appears in every hole whose export frame contains it.",
  },
  galah: {
    title: "GALAH",
    help: "Click to add a course-wide galah flock. It appears in every hole whose export frame contains it.",
  },
  emu: {
    title: "EMU",
    help: "Click to add a course-wide emu group. It appears in every hole whose export frame contains it.",
  },
  seal: {
    title: "SEAL",
    help: "Click to add a course-wide seal colony for coastal courses.",
  },
  penguin: {
    title: "PENGUIN",
    help: "Click to add a course-wide penguin colony for coastal courses.",
  },
  target: {
    title: "BONUS TARGET",
    help: "Click to place a bonus ring. Water targets drop the ball on the nearest bank; ground targets are collected on landing.",
  },
  route: {
    title: "CART ROUTE",
    help: "Click waypoints for a course-wide cart route. Double-click or press Enter to finish. Each hole gets the part of the route that passes through its export frame.",
  },
  erase: {
    title: "ERASE",
    help: "Click or drag over anything to remove it: fairways, painted fairways, tees, pins, greens, water, ocean, sand, trees, buildings, roads, flower beds, targets, wildlife or routes. Hole-specific features from any hole can be erased regardless of which hole is selected.",
  },
};

const CHALLENGE_CATALOG = {
  duck: {
    id: "duck",
    label: "SPLASH A DUCK",
    hint: "Land a ball within 20 m of a duck.",
  },
  squirrel: {
    id: "squirrel",
    label: "SCARE A SQUIRREL",
    hint: "Drop a shot beside a squirrel.",
  },
  emu: {
    id: "emu",
    label: "STARTLE AN EMU",
    hint: "Land a shot close to an emu.",
  },
  kangaroo: {
    id: "kangaroo",
    label: "STARTLE A KANGAROO",
    hint: "Land a shot close to a kangaroo.",
  },
  galah: {
    id: "galah",
    label: "SCATTER THE GALAH FLOCK",
    hint: "Land a shot close to a galah flock.",
  },
  fairway: {
    id: "fairway",
    label: "FIND THE FAIRWAY",
    hint: "Finish your tee shot on the short grass.",
  },
  green: {
    id: "green",
    label: "HIT THE GREEN",
    hint: "Reach the putting surface from the tee.",
  },
  ring: {
    id: "ring",
    label: "CATCH THE RING",
    hint: "Drop a ball inside a golden bonus ring.",
    requiresTarget: true,
  },
};
const CHALLENGE_ORDER_CANADIAN = ["duck", "squirrel", "fairway", "green", "ring"];
const CHALLENGE_ORDER_AUSTRALIAN = [
  "duck",
  "emu",
  "kangaroo",
  "galah",
  "fairway",
  "green",
  "ring",
];
function challengeOrder() {
  const env = state.course.environment || "canadian";
  if (env === "all") {
    return [
      "duck",
      "squirrel",
      "emu",
      "kangaroo",
      "galah",
      "fairway",
      "green",
      "ring",
    ];
  }
  return env === "australian"
    ? CHALLENGE_ORDER_AUSTRALIAN
    : CHALLENGE_ORDER_CANADIAN;
}

const $ = (id) => document.getElementById(id);
const canvas = $("edCanvas");
let ctx = canvas.getContext("2d");
const cursorHintEl = $("cursorHint");
const statusEl = $("status");
const toolbar = $("toolbar");
const toolTitle = $("toolTitle");
const toolHelp = $("toolHelp");
const toolSettings = $("toolSettings");
const referenceFileInput = $("referenceFile");
const sizeGuideCanvas = $("sizeGuideCanvas");
const sizeGuideCtx = sizeGuideCanvas.getContext("2d");
const sizeGuideLabel = $("sizeGuideLabel");
const holeTabs = $("holeTabs");
const holeNameInput = $("holeName");
const holeParInput = $("holePar");
const holeStats = $("holeStats");
const routeActions = $("routeActions");
const courseNameInput = $("courseName");
const courseIdInput = $("courseId");
const courseSummaryEl = $("courseSummary");
const courseDialog = $("courseDialog");
const courseForm = $("courseForm");
const setupNameInput = $("setupName");
const setupIdInput = $("setupId");
const setupEnvironmentSelect = $("setupEnvironment");
const setupCountsEl = $("setupCounts");
const setupNoteEl = $("setupNote");
const courseDialogModeEl = $("courseDialogMode");
const courseDialogTitleEl = $("courseDialogTitle");
const courseDialogHelpEl = $("courseDialogHelp");
const courseConfirmBtn = $("courseConfirmBtn");
const undoBtn = $("undoBtn");
const redoBtn = $("redoBtn");
const previewOverlay = $("previewOverlay");
const previewCanvas = $("previewCanvas");
const previewTitleHole = $("previewTitleHole");
const uiScaleLabel = $("uiScaleLabel");
const libraryDialog = $("libraryDialog");
const savedCourseList = $("savedCourseList");
const publishDialog = $("publishDialog");
const publishFileName = $("publishFileName");
const publishManifest = $("publishManifest");
const publishCopyStatus = $("publishCopyStatus");
const publishSummaryInput = $("publishSummary");
const publishUnlockMode = $("publishUnlockMode");
const publishAfterInput = $("publishAfter");
const publishAfterField = $("publishAfterField");
const publishTrophiesInput = $("publishTrophies");
const publishTrophiesField = $("publishTrophiesField");
const publishCourseIds = $("publishCourseIds");
const publishFolderBtn = $("publishFolderBtn");
const publishDownloadBtn = $("publishDownloadBtn");
const mapSelectBar = $("mapSelectBar");
const mapSelectConfirmBtn = $("mapSelectConfirm");
const mapSelectCancelBtn = $("mapSelectCancel");
const analysisDialog = $("analysisDialog");
const analysisSummary = $("analysisSummary");
const analysisHoles = $("analysisHoles");
const analysisNpcs = $("analysisNpcs");
const analysisNote = $("analysisNote");
const analysisApplyBtn = $("analysisApplyBtn");

let analysisResult = null;
let publishData = null;
let publishPackage = null;
const challengeListEl = $("challengeList");
const challengeCountLabel = $("challengeCountLabel");
const targetListEl = $("targetList");
const validationListEl = $("validationList");
const validationBadge = $("validationBadge");

const state = {
  course: null,
  holeIndex: 0,
  tool: "pan",
  zoom: 0.3,
  panX: 0,
  panY: 0,
  vw: 800,
  vh: 600,
  dpr: 1,
  dirty: false,
  // Touch input gets a larger pick radius than a mouse pointer.
  hitScale: 1,
  partCreatedAt: null,
  uiScale: 1,
  // Authored metadata that travels inside the file (part or package).
  meta: { summary: "", unlock: { starter: true } },
  preview: null,
  previewDirty: true,
  reference: null,
  fitted: false,
  pointer: null,
  drag: null,
  stroke: null,
  mapSelect: null,
  exportMapImage: null,
  fairwayDraft: null,
  fairwayEditTarget: null,
  routeDraft: null,
  roadDraft: null,
  selectedRoute: -1,
  pendingDropIndex: -1,
  settings: {
    fairwayWidth: 150,
    fairwayMode: "centreline",
    brushRadius: 56,
    greenBrushRadius: 82,
    greenMode: "ellipse",
    greenRx: 70,
    greenRy: 58,
    greenRot: 0,
    treeRadius: 78,
    treeHue: 0,
    propType: "shed",
    propScale: 1,
    propRot: 0,
    markerDistance: 150,
    roadWidth: 44,
    roadStyle: "paved",
    flowerRx: 42,
    flowerRy: 30,
    flowerPalette: 0,
    deerRadius: 150,
    duckRadius: 80,
    kangarooRadius: 180,
    galahRadius: 140,
    emuRadius: 160,
    sealRadius: 100,
    penguinRadius: 80,
    targetType: "water",
    targetRadius: 34,
    targetValue: 1,
    targetLabel: "GOLD RING",
    teeRot: 0,
  },
};

let history = [];
let historyIndex = -1;
let renderQueued = false;
let courseDialogMode = "new";
let setupHoleCount = 9;
let setupIdTouched = false;
let setupExistingCount = 9;

// ---------------------------------------------------------------- data model
const clone = (value) => JSON.parse(JSON.stringify(value));
const round1 = (n) => Math.round(n * 10) / 10;
const slugify = (value) =>
  String(value || "course")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "course";
const escapeHtml = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch];
  });

function pointOf(value, fallbackX = 850, fallbackY = 1000) {
  if (Array.isArray(value)) {
    return { x: Number(value[0]) || 0, y: Number(value[1]) || 0 };
  }
  if (value && typeof value === "object") {
    return { x: Number(value.x) || 0, y: Number(value.y) || 0 };
  }
  return { x: fallbackX, y: fallbackY };
}

function polyOf(value) {
  if (!Array.isArray(value)) return [];
  const out = [];
  for (const p of value) {
    if (Array.isArray(p)) out.push([Number(p[0]) || 0, Number(p[1]) || 0]);
    else if (p && typeof p === "object") out.push([Number(p.x) || 0, Number(p.y) || 0]);
  }
  return out.length > 2 ? out : [];
}

function ellipsePoly(b, n = 26) {
  const out = [];
  const rx = Math.max(4, Number(b.rx) || 20);
  const ry = Math.max(4, Number(b.ry) || 16);
  const rot = Number(b.rot) || 0;
  const cr = Math.cos(rot);
  const sr = Math.sin(rot);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const lx = Math.cos(a) * rx;
    const ly = Math.sin(a) * ry;
    out.push([b.x + lx * cr - ly * sr, b.y + lx * sr + ly * cr]);
  }
  return out;
}

function pointIsValid(value) {
  if (Array.isArray(value)) {
    return Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]));
  }
  return !!(
    value &&
    Number.isFinite(Number(value.x)) &&
    Number.isFinite(Number(value.y))
  );
}

function normaliseHole(raw, index) {
  const h = { ...raw };
  h.index = index + 1;
  h.name = String(raw.name || `Hole ${index + 1}`);
  h.par = clamp(Number(raw.par) || 4, 1, 99);
  const teeValid = pointIsValid(raw.tee);
  h.tee = teeValid
    ? { ...pointOf(raw.tee, 850, 1900), rot: Number(raw.tee?.rot) || 0 }
    : null;
  const pinValid = pointIsValid(raw.pin);
  h.pin = pinValid ? pointOf(raw.pin, 850, 900) : null;
  const g = raw.green;
  const greenValid = g && pointIsValid(g);
  h.green = greenValid
    ? {
        x: Number(g.x),
        y: Number(g.y),
        rx: Math.max(20, Number(g.rx) || 70),
        ry: Math.max(16, Number(g.ry) || 58),
        rot: Number(g.rot) || 0,
      }
    : null;
  h.fairway = Array.isArray(raw.fairway)
    ? raw.fairway
        .map((p) => {
          const q = pointOf(p);
          return { x: q.x, y: q.y, w: Math.max(24, Number(p.w) || 140) };
        })
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    : [];
  h.fairwayPolys = Array.isArray(raw.fairwayPolys)
    ? raw.fairwayPolys.map(polyOf).filter((p) => p.length > 2)
    : [];
  h.greenPolys = Array.isArray(raw.greenPolys)
    ? raw.greenPolys.map(polyOf).filter((p) => p.length > 2)
    : [];

  h.waterPolys = Array.isArray(raw.waterPolys)
    ? raw.waterPolys.map(polyOf).filter((p) => p.length > 2)
    : [];
  h.oceanPolys = Array.isArray(raw.oceanPolys)
    ? raw.oceanPolys.map(polyOf).filter((p) => p.length > 2)
    : [];
  h.sandPolys = Array.isArray(raw.sandPolys)
    ? raw.sandPolys.map(polyOf).filter((p) => p.length > 2)
    : [];

  // Convert the original hand-authored pond / bunker ellipses into editable
  // vector shapes so opening an existing course does not lose its hazards.
  if (!h.waterPolys.length && Array.isArray(raw.pond) && raw.pond.length > 2) {
    const pts = raw.pond.map((p) => {
      const q = pointOf(p);
      return [q.x, q.y];
    });
    h.waterPolys = [closedSplinePoints(pts, 10)];
  }
  if (!h.sandPolys.length && Array.isArray(raw.bunkers)) {
    h.sandPolys = raw.bunkers.filter((b) => b && b.x != null).map((b) => ellipsePoly(b));
  }
  h.pond = [];
  h.bunkers = [];

  h.trees = Array.isArray(raw.trees)
    ? raw.trees.map((t) => ({
        x: Number(t.x) || 0,
        y: Number(t.y) || 0,
        r: Math.max(18, Number(t.r) || 78),
        hue: Number(t.hue) || 0,
        species: Number(t.species != null ? t.species : t.hue) || 0,
      }))
    : [];
  h.props = Array.isArray(raw.props)
    ? raw.props.map((p) => ({
        type: PROP_TYPES[p.type] ? p.type : "shed",
        x: Number(p.x) || 0,
        y: Number(p.y) || 0,
        rot: Number(p.rot) || 0,
        scale: Math.max(0.35, Number(p.scale) || 1),
      }))
    : [];
  h.roads = Array.isArray(raw.roads)
    ? raw.roads
        .map((r) => ({
          style: ROAD_STYLES[r.style] ? r.style : "paved",
          width: Math.max(8, Number(r.width) || 42),
          points: Array.isArray(r.points)
            ? r.points.map((p) => pointOf(p)).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
            : [],
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
        palette: Math.abs(Number(f.palette) || 0) % FLOWER_PALETTES.length,
      }))
    : [];
  h.extraFairways = Array.isArray(raw.extraFairways)
    ? raw.extraFairways
        .map((f) => {
          const src = Array.isArray(f?.points) ? f.points : Array.isArray(f) ? f : [];
          return {
            points: src
              .map((p) => {
                const q = pointOf(p);
                return { x: q.x, y: q.y, w: Math.max(24, Number(p.w) || 140) };
              })
              .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
            hole: f && f.hole,
          };
        })
        .filter((f) => f.points.length > 1)
    : [];
  h.extraGreens = Array.isArray(raw.extraGreens)
    ? raw.extraGreens.map((g) => ({
        ...pointOf(g),
        rx: Math.max(20, Number(g.rx) || 70),
        ry: Math.max(16, Number(g.ry) || 58),
        rot: Number(g.rot) || 0,
        hole: g.hole,
      }))
    : [];
  h.extraTees = Array.isArray(raw.extraTees)
    ? raw.extraTees.map((t) => ({
        ...pointOf(t),
        rot: Number(t.rot) || 0,
        hole: t.hole,
      }))
    : [];
  h.challenges = Array.isArray(raw.challenges)
    ? raw.challenges
        .map((c, i) => ({
          ...c,
          id: String(c.id || `challenge-${i + 1}`),
          label: String(c.label || c.id || "CHALLENGE"),
          hint: String(c.hint || ""),
        }))
        .filter((c) => c.id)
    : [];
  h.bonusTargets = Array.isArray(raw.bonusTargets)
    ? raw.bonusTargets
        .map((t, i) => {
          const q = pointOf(t);
          const out = {
            id: String(t.id || `bonus-${i + 1}`),
            label: String(t.label || "GOLD RING"),
            value: -Math.max(
              1,
              Math.abs(Number.isFinite(Number(t.value)) ? Number(t.value) : 1)
            ),
            x: q.x,
            y: q.y,
            radius: Math.max(10, Number(t.radius) || 34),
            type: t.type === "ground" ? "ground" : "water",
          };
          if (t.drop) out.drop = pointOf(t.drop);
          return out;
        })
        .filter((t) => Number.isFinite(t.x) && Number.isFinite(t.y))
    : [];
  h.cartRoutes = Array.isArray(raw.cartRoutes)
    ? raw.cartRoutes
        .map((route) =>
          Array.isArray(route)
            ? route.map((p) => {
                const q = pointOf(p);
                return { x: q.x, y: q.y };
              })
            : []
        )
        .filter((route) => route.length >= 2)
    : [];
  h.deerSpawns = Array.isArray(raw.deerSpawns)
    ? raw.deerSpawns.map((s) => ({
        ...pointOf(s),
        radius: Math.max(30, Number(s.radius) || 150),
      }))
    : [];
  h.rabbitTrees = Array.isArray(raw.rabbitTrees)
    ? raw.rabbitTrees.map((s) => pointOf(s))
    : [];
  h.squirrelTrees = Array.isArray(raw.squirrelTrees)
    ? raw.squirrelTrees.map((s) => pointOf(s))
    : [];
  h.duckPonds = Array.isArray(raw.duckPonds)
    ? raw.duckPonds.map((s) => ({
        ...pointOf(s),
        radius: Math.max(20, Number(s.radius) || 80),
      }))
    : [];
  return h;
}

function holeHasTee(hole) {
  return !!(hole && hole.tee && Number.isFinite(hole.tee.x) && Number.isFinite(hole.tee.y));
}
function holeHasPin(hole) {
  return !!(hole && hole.pin && Number.isFinite(hole.pin.x) && Number.isFinite(hole.pin.y));
}
function holeHasGreen(hole) {
  return !!(hole && hole.green && Number.isFinite(hole.green.x) && Number.isFinite(hole.green.y));
}
function holeHasFrame(hole) {
  return holeHasTee(hole) && holeHasPin(hole);
}
function holeIsComplete(hole) {
  const hasFairway =
    holeFairwaySegments(hole).length > 0 ||
    (Array.isArray(hole.fairwayPolys) && hole.fairwayPolys.length > 0);
  const hasGreen =
    holeHasGreen(hole) ||
    (Array.isArray(hole.greenPolys) && hole.greenPolys.length > 0);
  return holeHasFrame(hole) && hasGreen && hasFairway;
}

const HOLE_GRID_W = 2350;
const HOLE_GRID_H = 3150;
const HOLE_GRID_COLS = 3;

function gridOffset(index) {
  return {
    x: (index % HOLE_GRID_COLS) * HOLE_GRID_W,
    y: Math.floor(index / HOLE_GRID_COLS) * HOLE_GRID_H,
  };
}

function translatePoly(poly, dx, dy) {
  return poly.map(([x, y]) => [x + dx, y + dy]);
}

function translateHole(hole, dx, dy) {
  if (!dx && !dy) return hole;
  const move = (p) => ({ ...p, x: p.x + dx, y: p.y + dy });
  if (hole.tee) hole.tee = move(hole.tee);
  if (hole.pin) hole.pin = move(hole.pin);
  if (hole.green) hole.green = move(hole.green);
  hole.fairway = hole.fairway.map(move);
  hole.fairwayPolys = (hole.fairwayPolys || []).map((poly) => translatePoly(poly, dx, dy));
  hole.greenPolys = (hole.greenPolys || []).map((poly) => translatePoly(poly, dx, dy));
  hole.waterPolys = hole.waterPolys.map((poly) => translatePoly(poly, dx, dy));
  hole.oceanPolys = (hole.oceanPolys || []).map((poly) => translatePoly(poly, dx, dy));
  hole.sandPolys = hole.sandPolys.map((poly) => translatePoly(poly, dx, dy));
  hole.trees = hole.trees.map(move);
  hole.props = hole.props.map(move);
  hole.roads = hole.roads.map((road) => ({ ...road, points: road.points.map(move) }));
  hole.flowerBeds = hole.flowerBeds.map(move);
  hole.bonusTargets = hole.bonusTargets.map((t) => {
    const out = move(t);
    if (t.drop) out.drop = move(t.drop);
    return out;
  });
  hole.cartRoutes = hole.cartRoutes.map((route) => route.map(move));
  hole.deerSpawns = hole.deerSpawns.map(move);
  hole.rabbitTrees = hole.rabbitTrees.map(move);
  hole.squirrelTrees = (hole.squirrelTrees || []).map(move);
  hole.duckPonds = hole.duckPonds.map(move);
  hole.extraFairways = (hole.extraFairways || []).map((f) => ({
    ...f,
    points: f.points.map(move),
  }));
  hole.extraGreens = (hole.extraGreens || []).map(move);
  hole.extraTees = (hole.extraTees || []).map(move);
  return hole;
}

function holeExtent(hole) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x, y, r = 0) => {
    minX = Math.min(minX, x - r);
    minY = Math.min(minY, y - r);
    maxX = Math.max(maxX, x + r);
    maxY = Math.max(maxY, y + r);
  };
  if (holeHasTee(hole)) add(hole.tee.x, hole.tee.y, 90);
  if (holeHasPin(hole)) add(hole.pin.x, hole.pin.y, 60);
  if (holeHasGreen(hole)) {
    add(hole.green.x, hole.green.y, Math.max(hole.green.rx, hole.green.ry) + 20);
  }
  for (const p of hole.fairway) add(p.x, p.y, p.w / 2 + 18);
  for (const poly of hole.fairwayPolys || []) for (const [x, y] of poly) add(x, y);
  for (const poly of hole.greenPolys || []) for (const [x, y] of poly) add(x, y);
  for (const poly of hole.waterPolys) for (const [x, y] of poly) add(x, y);
  for (const poly of hole.oceanPolys || []) for (const [x, y] of poly) add(x, y);
  for (const poly of hole.sandPolys) for (const [x, y] of poly) add(x, y);
  for (const t of hole.trees) add(t.x, t.y, t.r + 16);
  for (const p of hole.props) {
    const meta = PROP_TYPES[p.type] || PROP_TYPES.shed;
    add(p.x, p.y, Math.max(meta.w, meta.h) * p.scale * 0.75);
  }
  for (const road of hole.roads) for (const p of road.points) add(p.x, p.y, road.width / 2 + 12);
  for (const f of hole.flowerBeds) add(f.x, f.y, Math.max(f.rx, f.ry) + 10);
  for (const t of hole.bonusTargets) add(t.x, t.y, t.radius + 20);
  for (const route of hole.cartRoutes) for (const p of route) add(p.x, p.y, 30);
  for (const s of hole.deerSpawns) add(s.x, s.y, s.radius);
  for (const s of hole.duckPonds) add(s.x, s.y, s.radius);
  for (const s of hole.rabbitTrees) add(s.x, s.y, 30);
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

function designBoundsForHoles(holes) {
  let minX = 0;
  let minY = 0;
  let maxX = WORLD.w;
  let maxY = WORLD.h;
  for (const hole of holes) {
    const e = holeExtent(hole);
    if (e) {
      minX = Math.min(minX, e.minX - 260);
      minY = Math.min(minY, e.minY - 260);
      maxX = Math.max(maxX, e.maxX + 260);
      maxY = Math.max(maxY, e.maxY + 260);
    }
    const f = holeFrame(hole);
    if (!f) continue;
    for (const corner of frameCorners(f)) {
      minX = Math.min(minX, corner.x - 80);
      minY = Math.min(minY, corner.y - 80);
      maxX = Math.max(maxX, corner.x + 80);
      maxY = Math.max(maxY, corner.y + 80);
    }
  }
  return {
    minX: Math.floor(minX),
    minY: Math.floor(minY),
    maxX: Math.ceil(maxX),
    maxY: Math.ceil(maxY),
  };
}

function unwrapCoursePackage(raw) {
  if (!raw || raw.format !== PACKAGE_FORMAT) return raw;
  if (Number(raw.formatVersion) > PACKAGE_VERSION) {
    throw new Error(
      `This .glfpkt file uses format version ${raw.formatVersion}, but this editor only supports version ${PACKAGE_VERSION}.`
    );
  }
  if (!raw.course || typeof raw.course !== "object") {
    throw new Error("That .glfpkt file does not contain course data.");
  }
  return raw.course;
}

function unwrapPartPackage(raw) {
  if (!raw || raw.format !== PART_FORMAT) return null;
  if (Number(raw.formatVersion) > PART_VERSION) {
    throw new Error(
      `This .glfppart file uses format version ${raw.formatVersion}, but this editor only supports version ${PART_VERSION}. Update the editor before opening it.`
    );
  }
  if (!raw.course || typeof raw.course !== "object") {
    throw new Error("That .glfppart file does not contain course data.");
  }
  return raw;
}

function normaliseMeta(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const unlock = source.unlock && typeof source.unlock === "object" ? source.unlock : {};
  const meta = { summary: String(source.summary || "").slice(0, 140) };
  if (unlock.starter) {
    meta.unlock = { starter: true };
  } else if (unlock.after) {
    meta.unlock = { after: String(unlock.after) };
    const trophies = Math.max(0, Math.floor(Number(unlock.trophies) || 0));
    if (trophies > 0) meta.unlock.trophies = trophies;
  } else if (Number(unlock.trophies) > 0) {
    meta.unlock = { trophies: Math.max(1, Math.floor(Number(unlock.trophies))) };
  } else {
    meta.unlock = { starter: true };
  }
  return meta;
}

function normaliseCourse(raw, options = {}) {
  const part = unwrapPartPackage(raw);
  raw = part ? part.course : unwrapCoursePackage(raw);
  const allowEmpty = options.allowEmpty === true || Boolean(part);
  if (!raw || !Array.isArray(raw.holes)) {
    throw new Error("That file does not contain any holes.");
  }
  if (!raw.holes.length && !allowEmpty) {
    throw new Error("That file does not contain any holes.");
  }
  const holes = raw.holes.map(normaliseHole);
  const isDesign = raw.design && Number.isFinite(raw.design.minX);
  if (!isDesign) {
    // Game-ready JSON stores each hole in its own local world. Spread imported
    // holes out into a design grid so they do not pile up on one another.
    holes.forEach((hole, i) => {
      const offset = gridOffset(i);
      translateHole(hole, offset.x, offset.y);
    });
  }
  return {
    version: 2,
    id: slugify(raw.id || raw.name),
    name: String(raw.name || raw.id || "My Course"),
    theme: raw.theme || "verdant",
    environment: raw.environment || "canadian",
    design: isDesign ? { ...raw.design } : designBoundsForHoles(holes),
    wildlife: normaliseWildlife(raw.wildlife),
    cartRoutes: normaliseCartRoutes(raw.cartRoutes),
    holes,
  };
}

function normaliseWildlife(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    deerSpawns: Array.isArray(source.deerSpawns)
      ? source.deerSpawns.map((s) => ({
          ...pointOf(s),
          radius: Math.max(30, Number(s.radius) || 150),
        }))
      : [],
    rabbitTrees: Array.isArray(source.rabbitTrees)
      ? source.rabbitTrees.map((s) => pointOf(s))
      : [],
    squirrelTrees: Array.isArray(source.squirrelTrees)
      ? source.squirrelTrees.map((s) => pointOf(s))
      : [],
    duckPonds: Array.isArray(source.duckPonds)
      ? source.duckPonds.map((s) => ({
          ...pointOf(s),
          radius: Math.max(20, Number(s.radius) || 80),
        }))
      : [],
    kangarooSpawns: Array.isArray(source.kangarooSpawns)
      ? source.kangarooSpawns.map((s) => ({
          ...pointOf(s),
          radius: Math.max(40, Number(s.radius) || 180),
        }))
      : [],
    galahFlocks: Array.isArray(source.galahFlocks)
      ? source.galahFlocks.map((s) => ({
          ...pointOf(s),
          radius: Math.max(40, Number(s.radius) || 140),
        }))
      : [],
    emuSpawns: Array.isArray(source.emuSpawns)
      ? source.emuSpawns.map((s) => ({
          ...pointOf(s),
          radius: Math.max(40, Number(s.radius) || 160),
        }))
      : [],
    sealColonies: Array.isArray(source.sealColonies)
      ? source.sealColonies.map((s) => ({
          ...pointOf(s),
          radius: Math.max(30, Number(s.radius) || 100),
        }))
      : [],
    penguinColonies: Array.isArray(source.penguinColonies)
      ? source.penguinColonies.map((s) => ({
          ...pointOf(s),
          radius: Math.max(25, Number(s.radius) || 80),
        }))
      : [],
  };
}

function normaliseCartRoutes(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((route) =>
      Array.isArray(route)
        ? route.map((p) => pointOf(p)).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
        : []
    )
    .filter((route) => route.length >= 2);
}

// A realistic par mix: 9 holes = par 36, 18 holes = par 72.
const PAR_PATTERN = [4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4];

function parForHole(index) {
  return PAR_PATTERN[index % PAR_PATTERN.length];
}

function defaultHole(index) {
  return normaliseHole(
    {
      name: `Hole ${index + 1}`,
      par: parForHole(index),
      waterPolys: [],
      oceanPolys: [],
      sandPolys: [],
      trees: [],
      props: [],
      roads: [],
      flowerBeds: [],
      cartRoutes: [],
      challenges: [],
      bonusTargets: [],
    },
    index
  );
}

function blankCourse(
  holeCount = 9,
  name = "My Course",
  id = "my-course",
  environment = "canadian"
) {
  const count = clamp(Number(holeCount) || 9, 1, 36);
  const holes = Array.from({ length: count }, (_, i) => defaultHole(i));
  return {
    version: 2,
    id: slugify(id || name),
    name: String(name || "My Course"),
    theme: "verdant",
    environment,
    design: designBoundsForHoles(holes),
    wildlife: {
      deerSpawns: [],
      rabbitTrees: [],
      squirrelTrees: [],
      duckPonds: [],
      kangarooSpawns: [],
      galahFlocks: [],
      emuSpawns: [],
      sealColonies: [],
      penguinColonies: [],
    },
    cartRoutes: [],
    holes,
  };
}

function reindexHoles() {
  state.course.holes.forEach((hole, i) => {
    hole.index = i + 1;
    if (/^Hole \d+$/i.test(hole.name || "")) hole.name = `Hole ${i + 1}`;
  });
}

function currentHole() {
  return state.course.holes[state.holeIndex];
}

function holeFairwaySegments(hole) {
  const segments = [];
  if (Array.isArray(hole.fairway) && hole.fairway.length > 1) {
    segments.push({ points: hole.fairway, owner: "primary", extraIndex: -1 });
  }
  (hole.extraFairways || []).forEach((extra, index) => {
    if (Array.isArray(extra.points) && extra.points.length > 1) {
      segments.push({ points: extra.points, owner: "extra", extraIndex: index });
    }
  });
  return segments;
}

// ---------------------------------------------------------------- design bounds
function designBounds() {
  if (!state.course.design) {
    state.course.design = designBoundsForHoles(state.course.holes);
  }
  return state.course.design;
}

function ensureDesignSpace(minX, minY, maxX, maxY) {
  const d = designBounds();
  let changed = false;
  if (minX < d.minX + GROW_MARGIN) {
    d.minX = Math.floor(Math.min(d.minX, minX - GROW_STEP));
    changed = true;
  }
  if (minY < d.minY + GROW_MARGIN) {
    d.minY = Math.floor(Math.min(d.minY, minY - GROW_STEP));
    changed = true;
  }
  if (maxX > d.maxX - GROW_MARGIN) {
    d.maxX = Math.ceil(Math.max(d.maxX, maxX + GROW_STEP));
    changed = true;
  }
  if (maxY > d.maxY - GROW_MARGIN) {
    d.maxY = Math.ceil(Math.max(d.maxY, maxY + GROW_STEP));
    changed = true;
  }
  if (changed) requestRender();
  return changed;
}

function ensureAssetSpace(x, y, radius = 40) {
  return ensureDesignSpace(x - radius, y - radius, x + radius, y + radius);
}

function ensurePolySpace(poly, extra = 0) {
  if (!poly || !poly.length) return;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    const x = Array.isArray(p) ? p[0] : p.x;
    const y = Array.isArray(p) ? p[1] : p.y;
    minX = Math.min(minX, x - extra);
    minY = Math.min(minY, y - extra);
    maxX = Math.max(maxX, x + extra);
    maxY = Math.max(maxY, y + extra);
  }
  ensureDesignSpace(minX, minY, maxX, maxY);
}

function ensureHoleFrameSpace(hole) {
  const f = holeFrame(hole);
  if (!f) return;
  for (const p of frameCorners(f)) {
    ensureDesignSpace(p.x - 80, p.y - 80, p.x + 80, p.y + 80);
  }
}

// ---------------------------------------------------------------- preview
function applyCourse() {
  state.previewDirty = false;
}

function invalidatePreview() {
  state.previewDirty = true;
  requestRender();
}

function commit() {
  const snap = JSON.stringify(state.course);
  state.dirty = true;
  scheduleAutosave();
  if (historyIndex >= 0 && snap === history[historyIndex]) {
    updateHistoryButtons();
    return;
  }
  history = history.slice(0, historyIndex + 1);
  history.push(snap);
  if (history.length > 80) history.shift();
  historyIndex = history.length - 1;
  updateHistoryButtons();
}

function resetHistory() {
  history = [JSON.stringify(state.course)];
  historyIndex = 0;
  updateHistoryButtons();
}

function updateHistoryButtons() {
  undoBtn.disabled = historyIndex <= 0;
  redoBtn.disabled = historyIndex < 0 || historyIndex >= history.length - 1;
}

// ---------------------------------------------------------------- autosave
// A tab crash or an accidental refresh should never cost a build. The editor
// writes its full resumable state to IndexedDB a few seconds after each change.
let autosaveTimer = 0;
let autosaveSnapshot = "";
let autosaveWarned = false;

function scheduleAutosave() {
  if (autosaveTimer) clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(flushAutosave, 4000);
}

async function flushAutosave() {
  if (autosaveTimer) {
    clearTimeout(autosaveTimer);
    autosaveTimer = 0;
  }
  if (!state.course) return;
  let part;
  try {
    part = serialisePart();
  } catch (err) {
    return;
  }
  const text = JSON.stringify(part);
  if (text === autosaveSnapshot) return;
  autosaveSnapshot = text;
  const ok = await Store.setItem(AUTOSAVE_KEY, part);
  if (!ok && !autosaveWarned) {
    autosaveWarned = true;
    setStatus(
      "Autosave is unavailable in this browser — use SAVE FILE to keep your work.",
      "warn"
    );
  }
}

async function restoreAutosave() {
  const part = await Store.getItem(AUTOSAVE_KEY);
  if (!part || part.format !== PART_FORMAT) return false;
  try {
    loadCourseFileData(part);
    autosaveSnapshot = JSON.stringify(part);
    state.dirty = false;
    const when = part.updatedAt ? savedDateLabel(Date.parse(part.updatedAt)) : "earlier";
    setStatus(
      `Restored unsaved work: “${state.course.name}” · ${state.course.holes.length} holes · ${when}`
    );
    return true;
  } catch (err) {
    console.warn("Could not restore the autosaved course", err);
    return false;
  }
}

function clearAutosave() {
  autosaveSnapshot = "";
  Store.removeItem(AUTOSAVE_KEY);
}

// ---------------------------------------------------------------- UI scale
function applyUiScale(scale, { persist = true } = {}) {
  const value = clamp(Number(scale) || 1, UI_SCALE_STEPS[0], UI_SCALE_STEPS[UI_SCALE_STEPS.length - 1]);
  state.uiScale = value;
  document.documentElement.style.setProperty("--ui", String(value));
  if (uiScaleLabel) uiScaleLabel.textContent = `${Math.round(value * 100)}%`;
  if (persist) Store.setItem(UI_SCALE_KEY, value);
  resize();
}

function stepUiScale(direction) {
  const current = state.uiScale;
  let index = UI_SCALE_STEPS.findIndex((step) => Math.abs(step - current) < 0.001);
  if (index < 0) index = 1;
  const next = clamp(index + direction, 0, UI_SCALE_STEPS.length - 1);
  applyUiScale(UI_SCALE_STEPS[next]);
}

function undo() {
  if (historyIndex <= 0) return;
  historyIndex -= 1;
  state.course = JSON.parse(history[historyIndex]);
  state.holeIndex = clamp(state.holeIndex, 0, state.course.holes.length - 1);
  state.fairwayDraft = null;
  state.fairwayEditTarget = null;
  state.routeDraft = null;
  state.roadDraft = null;
  state.selectedRoute = -1;
  applyCourse();
  refreshUI();
  updateHistoryButtons();
  setStatus("Undo");
}

function redo() {
  if (historyIndex < 0 || historyIndex >= history.length - 1) return;
  historyIndex += 1;
  state.course = JSON.parse(history[historyIndex]);
  state.holeIndex = clamp(state.holeIndex, 0, state.course.holes.length - 1);
  state.fairwayDraft = null;
  state.fairwayEditTarget = null;
  state.routeDraft = null;
  state.roadDraft = null;
  state.selectedRoute = -1;
  applyCourse();
  refreshUI();
  updateHistoryButtons();
  setStatus("Redo");
}

// ---------------------------------------------------------------- history/ui
function setStatus(message, kind = "") {
  statusEl.textContent = message;
  statusEl.className = `ed-status${kind ? ` ${kind}` : ""}`;
}

function updateHoleFields() {
  const hole = currentHole();
  if (document.activeElement !== holeNameInput) holeNameInput.value = hole.name;
  if (document.activeElement !== holeParInput) holeParInput.value = hole.par;
  courseNameInput.value = state.course.name;
  courseIdInput.value = state.course.id;
  const par = state.course.holes.reduce((total, h) => total + h.par, 0);
  const environment =
    COURSE_THEMES.find((theme) => theme.id === (state.course.environment || "canadian"))?.label ||
    "Canadian";
  courseSummaryEl.textContent = `${state.course.name} · ${environment} · ${
    state.course.holes.length
  } ${state.course.holes.length === 1 ? "HOLE" : "HOLES"} · PAR ${par}`;
}

function renderHoleTabs() {
  holeTabs.innerHTML = "";
  state.course.holes.forEach((hole, i) => {
    const b = document.createElement("button");
    b.className = `hole-tab${i === state.holeIndex ? " on" : ""}`;
    b.textContent = `${i + 1} · ${hole.name}`;
    b.title = `Hole ${i + 1} · ${hole.name} · Par ${hole.par}`;
    b.addEventListener("click", () => selectHole(i));
    holeTabs.appendChild(b);
  });
}

function renderStats() {
  const hole = currentHole();
  const segments = holeFairwaySegments(hole);
  const paintedFairways = (hole.fairwayPolys || []).length;
  const length = holeHasFrame(hole)
    ? Math.hypot(hole.pin.x - hole.tee.x, hole.pin.y - hole.tee.y)
    : 0;
  const greenShape =
    holeHasGreen(hole) && (hole.greenPolys || []).length
      ? "BOTH"
      : holeHasGreen(hole)
      ? "ELLIPSE"
      : (hole.greenPolys || []).length
      ? "PAINT"
      : "—";
  const metres = Math.round(length / C.PX_PER_METRE);
  const stats = [
    ["HOLE", `${state.holeIndex + 1} / ${state.course.holes.length}`],
    ["PAR", hole.par],
    ["LENGTH", metres ? `${metres} m` : "—"],
    [
      "FAIRWAY",
      segments.length || paintedFairways
        ? `${segments.length} seg · ${paintedFairways} paint`
        : "—",
    ],
    ["GREEN", greenShape],
    ["WATER", hole.waterPolys.length],
    ["OCEAN", (hole.oceanPolys || []).length],
    ["SAND", hole.sandPolys.length],
    ["TREES", hole.trees.length],
    ["SCENERY", hole.props.length + hole.roads.length + hole.flowerBeds.length],
    ["ROUTES", state.course.cartRoutes.length],
    ["CHALLENGES", hole.challenges.length],
    ["TARGETS", hole.bonusTargets.length],
  ];
  const wildlife =
    state.course.wildlife.deerSpawns.length +
    state.course.wildlife.rabbitTrees.length +
    (state.course.wildlife.squirrelTrees?.length || 0) +
    state.course.wildlife.duckPonds.length +
    (state.course.wildlife.kangarooSpawns?.length || 0) +
    (state.course.wildlife.galahFlocks?.length || 0) +
    (state.course.wildlife.emuSpawns?.length || 0) +
    (state.course.wildlife.sealColonies?.length || 0) +
    (state.course.wildlife.penguinColonies?.length || 0);
  if (wildlife) stats.push(["WILDLIFE", wildlife]);
  holeStats.innerHTML = stats
    .map(
      ([label, value]) =>
        `<div class="ed-stat"><span>${label}</span><b>${value}</b></div>`
    )
    .join("");
}

function renderChallenges() {
  const hole = currentHole();
  const active = new Set(hole.challenges.map((c) => c.id));
  const rows = [];
  for (const id of challengeOrder()) {
    const catalog = CHALLENGE_CATALOG[id];
    const on = active.has(id);
    rows.push(`
      <label class="ed-challenge-row${on ? " on" : ""}">
        <input type="checkbox" data-challenge="${id}" ${on ? "checked" : ""} />
        <span class="ch-copy">
          <b>${escapeHtml(catalog.label)}</b>
          <small>${escapeHtml(catalog.hint)}</small>
        </span>
      </label>`);
  }
  for (const c of hole.challenges) {
    if (CHALLENGE_CATALOG[c.id]) continue;
    rows.push(`
      <label class="ed-challenge-row on">
        <input type="checkbox" data-challenge="${escapeHtml(c.id)}" checked />
        <span class="ch-copy">
          <b>${escapeHtml(c.label || c.id)}</b>
          <small>Unsupported challenge type — untick to remove.</small>
        </span>
      </label>`);
  }
  challengeListEl.innerHTML = rows.join("");
  challengeCountLabel.textContent = `${hole.challenges.length} ACTIVE`;
}

function renderBonusTargets() {
  const targets = currentHole().bonusTargets;
  if (!targets.length) {
    targetListEl.innerHTML =
      '<div class="ed-empty">No bonus targets. Choose TARGET and click the course.</div>';
    return;
  }
  targetListEl.innerHTML = targets
    .map(
      (t, i) => `
      <div class="ed-target-row">
        <span class="tg-value">−${Math.abs(t.value)}</span>
        <span class="tg-copy">
          <b>${escapeHtml(t.label || "GOLD RING")}</b>
          <small>${String(t.type || "water").toUpperCase()} · radius ${Math.round(
            t.radius
          )} · ${Math.round(t.x)}, ${Math.round(t.y)}</small>
        </span>
        ${
          t.type === "water"
            ? `<button type="button" data-target-drop="${i}">DROP</button>`
            : ""
        }
        <button type="button" data-target-del="${i}">DEL</button>
      </div>`
    )
    .join("");
}

function holeSurfaceAt(hole, x, y) {
  const holes = state.course ? state.course.holes : [hole];
  for (const h of holes) {
    for (const polys of [h.waterPolys, h.oceanPolys]) {
      for (const poly of polys || []) {
        if (poly.length > 2 && pointInPoly(x, y, poly)) return "water";
      }
    }
  }
  for (const h of holes) {
    for (const poly of h.sandPolys || []) {
      if (poly.length > 2 && pointInPoly(x, y, poly)) return "sand";
    }
    for (const b of h.bunkers || []) {
      if (inEllipse(x, y, b)) return "sand";
    }
  }
  for (const h of holes) {
    if (h.green && inEllipse(x, y, h.green)) return "green";
    for (const poly of h.greenPolys || []) {
      if (poly.length > 2 && pointInPoly(x, y, poly)) return "green";
    }
    for (const g of h.extraGreens || []) {
      if (inEllipse(x, y, g)) return "green";
    }
  }
  for (const h of holes) {
    for (const poly of h.fairwayPolys || []) {
      if (poly.length > 2 && pointInPoly(x, y, poly)) return "fairway";
    }
    const fairways = [h.fairway, ...(h.extraFairways || []).map((f) => f.points)];
    for (const fairway of fairways) {
      if (!fairway || fairway.length < 2) continue;
      const pts = splinePoints(fairway.map((p) => [p.x, p.y]), 10);
      const d = distanceToPolyline(x, y, pts);
      let width = 0;
      let best = Infinity;
      for (const p of fairway) {
        const dd = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (dd < best) {
          best = dd;
          width = p.w / 2;
        }
      }
      if (d < width) return "fairway";
    }
  }
  return "rough";
}

function isBridgeAtDesign(x, y) {
  for (const hole of state.course.holes) {
    for (const road of hole.roads || []) {
      if (road.style !== "bridge" || !road.points || road.points.length < 2) continue;
      const d = distanceToPolyline(
        x,
        y,
        road.points.map((p) => [p.x, p.y])
      );
      if (d <= (Number(road.width) || 42) / 2) return true;
    }
  }
  return false;
}

function nearestDryPoint(hole, x, y) {
  const b = designBounds();
  for (let d = 16; d <= 620; d += 8) {
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const px = x + Math.cos(a) * d;
      const py = y + Math.sin(a) * d;
      if (
        px > b.minX + 20 &&
        px < b.maxX - 20 &&
        py > b.minY + 20 &&
        py < b.maxY - 20 &&
        holeSurfaceAt(hole, px, py) !== "water"
      ) {
        return { x: px, y: py };
      }
    }
  }
  return holeHasTee(hole) ? { x: hole.tee.x, y: hole.tee.y } : { x, y };
}

function validateCourse() {
  const issues = [];
  const add = (level, text) => issues.push({ level, text });
  if (!state.course.holes.length) {
    add("error", "The course has no holes.");
    return issues;
  }
  const db = designBounds();
  const inWorld = (p) =>
    p &&
    Number.isFinite(p.x) &&
    Number.isFinite(p.y) &&
    p.x >= db.minX &&
    p.x <= db.maxX &&
    p.y >= db.minY &&
    p.y <= db.maxY;
  const holesWithoutChallenges = [];

  state.course.holes.forEach((hole, hi) => {
    const tag = `Hole ${hi + 1}`;
    const fairwaySegments = holeFairwaySegments(hole);
    const paintedFairways = hole.fairwayPolys || [];
    if (!fairwaySegments.length && !paintedFairways.length) {
      add("error", `${tag}: no fairway centreline or painted fairway.`);
    } else {
      let total = 0;
      fairwaySegments.forEach((segment, si) => {
        let length = 0;
        for (let i = 1; i < segment.points.length; i++) {
          length += Math.hypot(
            segment.points[i].x - segment.points[i - 1].x,
            segment.points[i].y - segment.points[i - 1].y
          );
        }
        total += length;
        if (length < 100) {
          add(
            "warn",
            `${tag}: fairway segment ${si + 1} is very short.`
          );
        }
      });
      if (total < 100 && !paintedFairways.length) {
        add("warn", `${tag}: fairway is very short.`);
      }
    }

    if (!holeHasTee(hole)) add("error", `${tag}: tee is missing.`);
    else if (!inWorld(hole.tee)) add("error", `${tag}: tee is outside the course.`);
    if (!holeHasPin(hole)) add("error", `${tag}: pin is missing.`);
    else if (!inWorld(hole.pin)) add("error", `${tag}: pin is outside the course.`);
    const greenPolys = hole.greenPolys || [];
    if (!holeHasGreen(hole) && !greenPolys.length) {
      add("error", `${tag}: green is missing.`);
    } else {
      if (holeHasGreen(hole)) {
        const reach = Math.max(hole.green.rx, hole.green.ry);
        if (
          hole.green.x - reach < db.minX ||
          hole.green.y - reach < db.minY ||
          hole.green.x + reach > db.maxX ||
          hole.green.y + reach > db.maxY
        ) {
          add("warn", `${tag}: green is partly outside the designed course.`);
        }
      }
      if (holeHasPin(hole) && inWorld(hole.pin)) {
        const onGreen =
          (holeHasGreen(hole) && inEllipse(hole.pin.x, hole.pin.y, hole.green)) ||
          greenPolys.some((poly) => pointInPoly(hole.pin.x, hole.pin.y, poly));
        if (!onGreen) add("warn", `${tag}: pin is outside the green.`);
      }
    }

    if (holeHasTee(hole) && inWorld(hole.tee) && holeSurfaceAt(hole, hole.tee.x, hole.tee.y) === "water") {
      add("error", `${tag}: tee is in water.`);
    }
    if (holeHasPin(hole) && inWorld(hole.pin) && holeSurfaceAt(hole, hole.pin.x, hole.pin.y) === "water") {
      add("error", `${tag}: pin is in water.`);
    }

    const frame = holeFrame(hole);
    if (frame) {
      const outsideExport = [];
      const checkFramePoint = (p, label, margin = 0) => {
        if (p && !frameContains(p, frame, margin)) outsideExport.push(label);
      };
      checkFramePoint(hole.tee, "tee", 90);
      checkFramePoint(hole.pin, "pin", 60);
      if (holeHasGreen(hole)) {
        checkFramePoint(hole.green, "green", Math.max(hole.green.rx, hole.green.ry) + 20);
      }
      for (const p of hole.fairway) checkFramePoint(p, "fairway", p.w / 2 + 18);
      for (const poly of hole.fairwayPolys || []) {
        if (poly.some(([x, y]) => !frameContains({ x, y }, frame))) outsideExport.push("painted fairway");
      }
      for (const poly of hole.greenPolys || []) {
        if (poly.some(([x, y]) => !frameContains({ x, y }, frame))) outsideExport.push("painted green");
      }
      for (const poly of hole.waterPolys) {
        if (poly.some(([x, y]) => !frameContains({ x, y }, frame))) outsideExport.push("water");
      }
      for (const poly of hole.sandPolys) {
        if (poly.some(([x, y]) => !frameContains({ x, y }, frame))) outsideExport.push("sand");
      }
      for (const t of hole.trees) checkFramePoint(t, "tree", t.r + 16);
      for (const p of hole.props) {
        const meta = PROP_TYPES[p.type] || PROP_TYPES.shed;
        checkFramePoint(p, "building", (Math.max(meta.w, meta.h) * p.scale) / 2 + 20);
      }
    for (const road of hole.roads) {
      for (const p of road.points) checkFramePoint(p, "road", road.width / 2 + 10);
    }
    for (const bed of hole.flowerBeds) {
      checkFramePoint(bed, "flowers", Math.max(bed.rx, bed.ry) + 12);
    }
    for (const t of hole.bonusTargets) checkFramePoint(t, "bonus target", t.radius + 20);
    if (outsideExport.length) {
      const unique = [...new Set(outsideExport)];
      add(
        "warn",
        `${tag}: ${unique.slice(0, 4).join(", ")}${
          unique.length > 4 ? " and other assets" : ""
        } extend outside the red export frame and will be cut.`
      );
    }
    }

    const challengeIds = new Set();
    for (const c of hole.challenges) {
      if (challengeIds.has(c.id)) {
        add("warn", `${tag}: challenge “${c.label || c.id}” is duplicated.`);
      }
      if (!CHALLENGE_CATALOG[c.id]) {
        add(
          "warn",
          `${tag}: challenge “${c.label || c.id}” is not supported by the game.`
        );
      }
      challengeIds.add(c.id);
    }
    if (!hole.challenges.length) {
      holesWithoutChallenges.push(hi + 1);
    }
    if (challengeIds.has("ring") && !hole.bonusTargets.length) {
      add("warn", `${tag}: CATCH THE RING has no bonus target.`);
    }

    hole.bonusTargets.forEach((t, ti) => {
      const ttag = `${tag}: target ${ti + 1}`;
      if (!inWorld(t)) {
        add("error", `${ttag} is outside the course.`);
        return;
      }
      const surface = holeSurfaceAt(hole, t.x, t.y);
      if (t.type === "water" && surface !== "water") {
        add("warn", `${ttag} is a water ring but is not inside water.`);
      }
      if (t.type === "water" && !t.drop) {
        add("warn", `${ttag} has no safe drop point.`);
      }
      if (t.drop) {
        if (!inWorld(t.drop)) {
          add("warn", `${ttag} has a drop point outside the course.`);
        } else if (holeSurfaceAt(hole, t.drop.x, t.drop.y) === "water") {
          add("warn", `${ttag} has a drop point in water.`);
        }
      }
    });

  });

  state.course.cartRoutes.forEach((route, ri) => {
    if (route.length < 2) {
      add("warn", `Course cart route ${ri + 1} needs at least two points.`);
      return;
    }
    let used = false;
    let badWater = false;
    let badTree = false;
    let short = false;
    for (const hole of state.course.holes) {
      const f = holeFrame(hole);
      if (!f) continue;
      const runs = clipRouteToFrame(route, f);
      for (const run of runs) {
        if (run.length < 2) continue;
        used = true;
        let runLength = 0;
        for (let i = 1; i < run.length; i++) {
          runLength += Math.hypot(
            run[i].x - run[i - 1].x,
            run[i].y - run[i - 1].y
          );
        }
        if (runLength < 100) short = true;
        for (const q of samplePolyline(run)) {
          const p = frameWorldPoint(q, f);
          const probe = CART_CLEARANCE * 0.7;
          const wet = (x, y) =>
            holeSurfaceAt(hole, x, y) === "water" && !isBridgeAtDesign(x, y);
          if (
            wet(p.x, p.y) ||
            wet(p.x + probe, p.y) ||
            wet(p.x - probe, p.y) ||
            wet(p.x, p.y + probe) ||
            wet(p.x, p.y - probe)
          ) {
            badWater = true;
          }
          for (const h of state.course.holes) {
            for (const tree of h.trees) {
              if (
                Math.hypot(p.x - tree.x, p.y - tree.y) <
                C.TREE_TRUNK + CART_CLEARANCE * 0.45
              ) {
                badTree = true;
                break;
              }
            }
            if (badTree) break;
          }
        }
      }
    }
    if (!used) {
      add(
        "warn",
        `Course cart route ${ri + 1} is outside every hole’s export frame and will not appear.`
      );
    } else if (badWater || badTree) {
      add(
        "warn",
        `Course cart route ${ri + 1} crosses ${badWater ? "water" : "a tree"} in at least one hole and will be ignored there.`
      );
    } else if (short) {
      add(
        "warn",
        `Course cart route ${ri + 1} is very short in at least one hole’s export frame.`
      );
    }
  });

  state.course.wildlife.deerSpawns.forEach((spawn, i) => {
    if (
      !state.course.holes.some((hole) => {
        const f = holeFrame(hole);
        return f && frameContains(spawn, f, 0);
      })
    ) {
      add("warn", `Deer spawn ${i + 1} is outside every hole’s export frame and will not appear.`);
    }
  });
  state.course.wildlife.rabbitTrees.forEach((warren, i) => {
    if (
      !state.course.holes.some((hole) => {
        const f = holeFrame(hole);
        return f && frameContains(warren, f, 0);
      })
    ) {
      add("warn", `Rabbit warren ${i + 1} is outside every hole’s export frame and will not appear.`);
    }
  });
  (state.course.wildlife.squirrelTrees || []).forEach((marker, i) => {
    if (
      !state.course.holes.some((hole) => {
        const f = holeFrame(hole);
        return f && frameContains(marker, f, 0);
      })
    ) {
      add("warn", `Squirrel marker ${i + 1} is outside every hole’s export frame and will not appear.`);
    }
  });
  state.course.wildlife.duckPonds.forEach((marker, i) => {
    if (
      !state.course.holes.some((hole) => {
        const f = holeFrame(hole);
        return f && frameContains(marker, f, 0);
      })
    ) {
      add("warn", `Duck marker ${i + 1} is outside every hole’s export frame and will not appear.`);
    }
  });
  const extraWildlife = [
    ["Kangaroo mob", state.course.wildlife.kangarooSpawns || []],
    ["Galah flock", state.course.wildlife.galahFlocks || []],
    ["Emu group", state.course.wildlife.emuSpawns || []],
    ["Seal colony", state.course.wildlife.sealColonies || []],
    ["Penguin colony", state.course.wildlife.penguinColonies || []],
  ];
  for (const [label, markers] of extraWildlife) {
    markers.forEach((marker, i) => {
      if (
        !state.course.holes.some((hole) => {
          const f = holeFrame(hole);
          return f && frameContains(marker, f, 0);
        })
      ) {
        add("warn", `${label} ${i + 1} is outside every hole’s export frame and will not appear.`);
      }
    });
  }
  if (holesWithoutChallenges.length) {
    const label =
      holesWithoutChallenges.length === 1
        ? `Hole ${holesWithoutChallenges[0]}`
        : holesWithoutChallenges.length <= 6
        ? `Holes ${holesWithoutChallenges.join(", ")}`
        : `${holesWithoutChallenges.length} holes`;
    add(
      "warn",
      `${label} ${
        holesWithoutChallenges.length === 1 ? "has" : "have"
      } no challenges, so no trophies can be earned there.`
    );
  }
  return issues;
}

function renderValidation() {
  const issues = validateCourse();
  const errors = issues.filter((i) => i.level === "error").length;
  const warnings = issues.filter((i) => i.level === "warn").length;
  validationBadge.className = "ed-validation-badge";
  if (errors) {
    validationBadge.textContent = `${errors} ERROR${errors === 1 ? "" : "S"}`;
    validationBadge.classList.add("error");
  } else if (warnings) {
    validationBadge.textContent = `${warnings} WARNING${
      warnings === 1 ? "" : "S"
    }`;
    validationBadge.classList.add("warn");
  } else {
    validationBadge.textContent = "PASS";
    validationBadge.classList.add("pass");
  }
  if (!issues.length) {
    validationListEl.innerHTML =
      '<div class="ed-validation-pass">All checks passed.</div>';
    return;
  }
  validationListEl.innerHTML = issues
    .map(
      (issue) =>
        `<div class="ed-validation-row ${issue.level}">${escapeHtml(
          issue.text
        )}</div>`
    )
    .join("");
}

function renderRouteActions() {
  const routes = state.course.cartRoutes;
  routeActions.innerHTML = "";
  if (!routes.length) {
    routeActions.innerHTML =
      '<div class="ed-empty">No cart routes yet. Choose CART ROUTE and click waypoints on the course map.</div>';
    return;
  }
  routes.forEach((route, i) => {
    const row = document.createElement("div");
    row.className = `ed-route-row${state.selectedRoute === i ? " on" : ""}`;
    row.innerHTML = `<span>Route ${i + 1} · ${route.length} pts</span>`;
    const sel = document.createElement("button");
    sel.textContent = state.selectedRoute === i ? "HIDE" : "SHOW";
    sel.addEventListener("click", () => {
      state.selectedRoute = state.selectedRoute === i ? -1 : i;
      renderRouteActions();
      requestRender();
    });
    const del = document.createElement("button");
    del.textContent = "DEL";
    del.addEventListener("click", () => {
      editHole(() => {
        state.course.cartRoutes.splice(i, 1);
        state.selectedRoute = -1;
      });
      setStatus(`Deleted cart route ${i + 1}`);
    });
    row.append(sel, del);
    routeActions.appendChild(row);
  });
}

function currentToolSize() {
  const s = state.settings;
  const hole = currentHole();
  switch (state.tool) {
    case "fairway":
      return { label: "Fairway width", kind: "band", size: s.fairwayWidth };
    case "green":
      if (s.greenMode === "paint") {
        return { label: "Green brush", kind: "circle", size: s.greenBrushRadius * 2 };
      }
      return holeHasGreen(hole)
        ? { label: "Green", kind: "ellipse", w: hole.green.rx * 2, h: hole.green.ry * 2 }
        : { label: "Green", kind: "ellipse", w: s.greenRx * 2, h: s.greenRy * 2 };
    case "pond":
    case "ocean":
    case "bunker":
      return { label: "Brush", kind: "circle", size: s.brushRadius * 2 };
    case "tree":
      return { label: "Tree canopy", kind: "circle", size: s.treeRadius * 2 };
    case "deer":
      return { label: "Deer zone", kind: "circle", size: s.deerRadius * 2 };
    case "rabbit":
      return { label: "Rabbit marker", kind: "circle", size: 48 };
    case "squirrel":
      return { label: "Squirrel marker", kind: "circle", size: 48 };
    case "duck":
      return { label: "Duck marker", kind: "circle", size: s.duckRadius * 2 };
    case "kangaroo":
      return { label: "Kangaroo mob", kind: "circle", size: s.kangarooRadius * 2 };
    case "galah":
      return { label: "Galah flock", kind: "circle", size: s.galahRadius * 2 };
    case "emu":
      return { label: "Emu group", kind: "circle", size: s.emuRadius * 2 };
    case "seal":
      return { label: "Seal colony", kind: "circle", size: s.sealRadius * 2 };
    case "penguin":
      return { label: "Penguin colony", kind: "circle", size: s.penguinRadius * 2 };
    case "target":
      return { label: "Bonus ring", kind: "circle", size: s.targetRadius * 2 };
    case "flowers":
      return { label: "Flower bed", kind: "ellipse", w: s.flowerRx * 2, h: s.flowerRy * 2 };
    case "prop": {
      const meta = PROP_TYPES[s.propType] || PROP_TYPES.shed;
      return { label: meta.label, kind: "rect", w: meta.w * s.propScale, h: meta.h * s.propScale };
    }
    case "road":
      return { label: "Road width", kind: "band", size: s.roadWidth };
    case "tee":
      return { label: "Tee box", kind: "rect", w: 116, h: 76 };
    case "pin":
      return { label: "Pin", kind: "circle", size: 24 };
    case "reference":
      return state.reference
        ? { label: "Reference image", kind: "rect", w: state.reference.w, h: state.reference.h }
        : { label: "Reference", kind: "circle", size: 100 };
    default:
      return { label: "Scale", kind: "circle", size: 100 };
  }
}

function drawSizeGuide() {
  if (!sizeGuideCtx) return;
  const info = currentToolSize();
  const activeSize = Math.max(info.size || 0, info.w || 0, info.h || 0, 20);
  const scale = 54 / activeSize;
  const w = 300;
  const h = 118;
  sizeGuideCtx.clearRect(0, 0, w, h);
  sizeGuideCtx.fillStyle = "rgba(4,24,14,0.55)";
  sizeGuideCtx.fillRect(0, 0, w, h);

  const cx = w / 2;
  const cy = 50;
  const s = state.settings;
  const activeFill = "rgba(185,227,91,0.28)";
  const activeStroke = "rgba(185,227,91,0.9)";

  sizeGuideCtx.save();
  sizeGuideCtx.lineWidth = 1.4;
  sizeGuideCtx.strokeStyle = activeStroke;
  sizeGuideCtx.fillStyle = activeFill;

  const drawScaled = () => {
    if (info.kind === "band") {
      const width = info.size * scale;
      sizeGuideCtx.beginPath();
      sizeGuideCtx.roundRect(cx - width / 2, cy - 9, width, 18, 9);
      sizeGuideCtx.fill();
      sizeGuideCtx.stroke();
    } else if (info.kind === "circle") {
      const r = (info.size * scale) / 2;
      sizeGuideCtx.beginPath();
      sizeGuideCtx.arc(cx, cy, Math.max(2, r), 0, TAU);
      sizeGuideCtx.fill();
      sizeGuideCtx.stroke();
    } else if (info.kind === "ellipse") {
      sizeGuideCtx.beginPath();
      sizeGuideCtx.ellipse(
        cx,
        cy,
        Math.max(2, (info.w * scale) / 2),
        Math.max(2, (info.h * scale) / 2),
        0,
        0,
        TAU
      );
      sizeGuideCtx.fill();
      sizeGuideCtx.stroke();
    } else if (info.kind === "rect") {
      sizeGuideCtx.beginPath();
      sizeGuideCtx.roundRect(
        cx - (info.w * scale) / 2,
        cy - (info.h * scale) / 2,
        info.w * scale,
        info.h * scale,
        4
      );
      sizeGuideCtx.fill();
      sizeGuideCtx.stroke();
    }
  };
  drawScaled();
  sizeGuideCtx.restore();

  // Ruler.
  const rulerY = 92;
  const rulerX0 = 12;
  const rulerX1 = 288;
  sizeGuideCtx.strokeStyle = "rgba(253,246,227,0.35)";
  sizeGuideCtx.lineWidth = 1;
  sizeGuideCtx.beginPath();
  sizeGuideCtx.moveTo(rulerX0, rulerY);
  sizeGuideCtx.lineTo(rulerX1, rulerY);
  sizeGuideCtx.stroke();
  const ticks = 6;
  for (let i = 0; i <= ticks; i++) {
    const x = rulerX0 + ((rulerX1 - rulerX0) * i) / ticks;
    sizeGuideCtx.beginPath();
    sizeGuideCtx.moveTo(x, rulerY - 3);
    sizeGuideCtx.lineTo(x, rulerY + 3);
    sizeGuideCtx.stroke();
  }
  const metresAcross = ((rulerX1 - rulerX0) / scale) / C.PX_PER_METRE;
  sizeGuideCtx.fillStyle = "rgba(253,246,227,0.6)";
  sizeGuideCtx.font = "800 8px ui-rounded, system-ui, sans-serif";
  sizeGuideCtx.textAlign = "left";
  sizeGuideCtx.fillText("0", rulerX0, rulerY + 14);
  sizeGuideCtx.textAlign = "right";
  sizeGuideCtx.fillText(`≈ ${Math.round(metresAcross)} m`, rulerX1, rulerY + 14);

  sizeGuideCtx.textAlign = "center";
  sizeGuideCtx.fillStyle = "rgba(253,246,227,0.78)";
  sizeGuideCtx.font = "900 8px ui-rounded, system-ui, sans-serif";
  const sizeMetres = (info.size || info.w || 0) / C.PX_PER_METRE;
  sizeGuideCtx.fillText(
    `${Math.round(info.size || info.w || 0)} px · ${sizeMetres.toFixed(1)} m`,
    cx,
    18
  );

  if (sizeGuideLabel) {
    sizeGuideLabel.textContent = info.label;
  }
}

function renderToolSettings() {
  const tool = state.tool;
  const s = state.settings;
  const hole = currentHole();
  toolTitle.textContent = TOOLS[tool].title;
  toolHelp.textContent = TOOLS[tool].help;

  const range = (label, key, min, max, step, suffix = "") => `
    <label class="ed-setting">
      <span class="ed-set-head">${label} <b data-value="${key}">${s[key]}${suffix}</b></span>
      <input type="range" data-setting="${key}" min="${min}" max="${max}" step="${step}" value="${s[key]}" />
    </label>`;

  let html = "";
  switch (tool) {
    case "fairway": {
      const draft = state.fairwayDraft;
      const segments = holeFairwaySegments(hole);
      html += `
        <label class="ed-setting">
          <span class="ed-set-head">MODE</span>
          <select data-setting="fairwayMode">
            <option value="centreline" ${
              s.fairwayMode === "centreline" ? "selected" : ""
            }>Centreline</option>
            <option value="paint" ${
              s.fairwayMode === "paint" ? "selected" : ""
            }>Paint</option>
          </select>
        </label>`;
      if (s.fairwayMode === "paint") {
        html += range("BRUSH WIDTH", "fairwayWidth", 40, 300, 5);
        html += `<div class="ed-setting"><button data-action="clear-painted-fairway">CLEAR PAINTED FAIRWAY</button></div>
          <div class="ed-tip">Drag to paint fairway. Strokes merge into organic fairway areas and count as fairway in the game.</div>`;
        break;
      }
      html += range("WIDTH", "fairwayWidth", 70, 300, 5);
      html += `
        <div class="ed-setting"><div class="row">
          <button data-action="finish-draft">FINISH SEGMENT</button>
          <button data-action="load-fairway">USE PRIMARY</button>
          <button data-action="new-fairway-segment">NEW</button>
        </div></div>
        <div class="ed-setting"><button data-action="clear-fairway">CLEAR ALL FAIRWAYS</button></div>
        <div class="ed-fairway-list">
          ${
            segments.length
              ? segments
                  .map(
                    (segment, i) => `
                    <div class="ed-fairway-row">
                      <span>Fairway ${i + 1}${segment.owner === "primary" ? " · PRIMARY" : ""} · ${
                        segment.points.length
                      } pts</span>
                      <button type="button" data-action="edit-fairway-segment" data-segment="${i}">EDIT</button>
                      <button type="button" data-action="delete-fairway-segment" data-segment="${i}">DEL</button>
                    </div>`
                  )
                  .join("")
              : '<div class="ed-empty">No fairway segments yet.</div>'
          }
        </div>
        <div class="ed-tip">${
          draft
            ? `${draft.length} point${draft.length === 1 ? "" : "s"} in this draft. Double-click or press Enter to finish and add it as a segment.`
            : "Click to start a new fairway segment. Finish it to add it; draw another to split a fairway around water or a gap."
        }</div>`;
      break;
    }
    case "green": {
      html += `
        <label class="ed-setting">
          <span class="ed-set-head">MODE</span>
          <select data-setting="greenMode">
            <option value="ellipse" ${
              s.greenMode === "ellipse" ? "selected" : ""
            }>Ellipse</option>
            <option value="paint" ${
              s.greenMode === "paint" ? "selected" : ""
            }>Paint</option>
          </select>
        </label>`;
      if (s.greenMode === "paint") {
        html += range("BRUSH RADIUS", "greenBrushRadius", 24, 180, 2);
        html += `<div class="ed-setting"><button data-action="clear-painted-green">CLEAR PAINTED GREEN</button></div>
          <div class="ed-tip">Drag to paint this hole’s green. Strokes merge into an organic putting surface.</div>`;
        break;
      }
      html += range("RADIUS X", "greenRx", 30, 180, 2);
      html += range("RADIUS Y", "greenRy", 24, 150, 2);
      html += range("ROTATION", "greenRot", -180, 180, 5, "°");
      html += holeHasGreen(hole)
        ? `<div class="ed-tip">Current green: ${Math.round(hole.green.rx)} × ${Math.round(
            hole.green.ry
          )} at ${Math.round((hole.green.rot * 180) / Math.PI)}°.</div>`
        : `<div class="ed-tip">Click the course to place this hole’s green.</div>`;
      break;
    }
    case "pond":
    case "ocean":
    case "bunker": {
      html += range("BRUSH RADIUS", "brushRadius", 18, 180, 2);
      const brushKind =
        tool === "pond" ? "water" : tool === "ocean" ? "ocean" : "sand";
      html += `<div class="ed-tip">Overlapping ${brushKind} shapes merge when the stroke ends. The shoreline is rebuilt from the painted area.</div>`;
      break;
    }
    case "tree":
      html += range("CANOPY RADIUS", "treeRadius", 32, 160, 2);
      html += `
        <label class="ed-setting">
          <span class="ed-set-head">SPECIES / COLOUR</span>
          <select data-setting="treeHue">
            ${treeSpeciesForTheme(state.course.environment || "canadian")
              .map(
                (species) =>
                  `<option value="${species.index}" ${
                    Number(s.treeHue) === species.index ? "selected" : ""
                  }>${escapeHtml(species.label)}</option>`
              )
              .join("")}
          </select>
        </label>`;
      break;
    case "prop": {
      html += `
        <label class="ed-setting">
          <span class="ed-set-head">SCENERY</span>
          <select data-setting="propType">
            ${Object.entries(PROP_TYPES)
              .map(
                ([id, meta]) =>
                  `<option value="${id}" ${s.propType === id ? "selected" : ""}>${escapeHtml(meta.label)}</option>`
              )
              .join("")}
          </select>
        </label>`;
      html += range("SCALE", "propScale", 0.5, 2.5, 0.1);
      html += range("ROTATION", "propRot", -180, 180, 5, "°");
      if (s.propType === "distanceRed" || s.propType === "distanceBlue") {
        html += range("DISTANCE TO PIN", "markerDistance", 30, 300, 5, " m");
        html += `<div class="ed-tip">The marker snaps to a circle around the current hole’s pin. The distance shown on the plaque is always the actual marker-to-pin distance.</div>`;
      } else {
        html += `<div class="ed-tip">Scenery does not block shots. Place roads, bridges and flower beds with their own tools.</div>`;
      }
      break;
    }
    case "road":
      html += range("ROAD WIDTH", "roadWidth", 14, 110, 2);
      html += `
        <label class="ed-setting">
          <span class="ed-set-head">SURFACE</span>
          <select data-setting="roadStyle">
            ${Object.entries(ROAD_STYLES)
              .map(
                ([id, meta]) =>
                  `<option value="${id}" ${s.roadStyle === id ? "selected" : ""}>${escapeHtml(meta.label)}</option>`
              )
              .join("")}
          </select>
        </label>
        <div class="ed-setting"><div class="row">
          <button data-action="finish-road">FINISH ROAD</button>
          <button data-action="clear-roads">CLEAR ROADS</button>
        </div></div>
        <div class="ed-tip">${
          state.roadDraft
            ? `${state.roadDraft.length} waypoint${state.roadDraft.length === 1 ? "" : "s"}. Double-click or press Enter to finish.`
            : "Click waypoints to draw a road or path. Roads expand the design canvas like other visual assets."
        }</div>`;
      break;
    case "flowers":
      html += range("RADIUS X", "flowerRx", 14, 140, 2);
      html += range("RADIUS Y", "flowerRy", 10, 100, 2);
      html += `
        <label class="ed-setting">
          <span class="ed-set-head">COLOURS</span>
          <select data-setting="flowerPalette">
            ${FLOWER_PALETTES.map(
              (palette, i) =>
                `<option value="${i}" ${Number(s.flowerPalette) === i ? "selected" : ""}>${escapeHtml(palette.label)}</option>`
            ).join("")}
          </select>
        </label>`;
      break;
    case "reference": {
      const ref = state.reference;
      if (!ref) {
        html += `
          <div class="ed-setting"><button data-action="open-reference">OPEN IMAGE</button></div>
          <div class="ed-tip">Choose a course screenshot or aerial image to trace over. It stays out of the exported course.</div>`;
        break;
      }
      const deg = Math.round((ref.rot * 180) / Math.PI);
      html += `
        <div class="ed-setting"><button data-action="open-reference">REPLACE IMAGE</button></div>
        <div class="ed-ref-name">${escapeHtml(ref.name || "Reference image")}</div>
        <label class="ed-setting">
          <span class="ed-set-head">OPACITY <b data-ref-value="opacity">${Math.round(
            ref.opacity * 100
          )}%</b></span>
          <input type="range" data-reference="opacity" min="5" max="100" step="1" value="${Math.round(
            ref.opacity * 100
          )}" />
        </label>
        <label class="ed-setting">
          <span class="ed-set-head">WIDTH <b data-ref-value="width">${Math.round(
            ref.w
          )} px</b></span>
          <input type="range" data-reference="width" min="100" max="20000" step="5" value="${Math.round(
            ref.w
          )}" />
        </label>
        <label class="ed-setting">
          <span class="ed-set-head">HEIGHT <b data-ref-value="height">${Math.round(
            ref.h
          )} px</b></span>
          <input type="range" data-reference="height" min="100" max="20000" step="5" value="${Math.round(
            ref.h
          )}" />
        </label>
        <label class="ed-setting ed-ref-lock">
          <span class="ed-set-head">LOCK ASPECT</span>
          <input type="checkbox" data-reference="lockAspect" ${ref.lockAspect ? "checked" : ""} />
        </label>
        <label class="ed-setting">
          <span class="ed-set-head">ROTATION <b data-ref-value="rot">${deg}°</b></span>
          <input type="range" data-reference="rot" min="-180" max="180" step="1" value="${deg}" />
        </label>
        <div class="ed-setting"><div class="row">
          <button data-action="fit-reference">FIT TO DESIGN</button>
          <button data-action="remove-reference">REMOVE</button>
        </div></div>
        <div class="ed-tip">Drag the image to move it, or drag a corner handle to resize. It is a tracing aid and is not exported.</div>`;
      break;
    }
    case "deer":
      html += range("SPAWN RADIUS", "deerRadius", 40, 320, 5);
      html += `<div class="ed-tip">Placed once for the whole course. The family of five deer is spread around this marker in every hole that contains it.</div>`;
      break;
    case "duck":
      html += range("POND MARKER", "duckRadius", 30, 160, 5);
      html += `<div class="ed-tip">Placed once for the whole course. Ducks use the pond containing this marker in each hole that contains it.</div>`;
      break;
    case "kangaroo":
      html += range("MOB RADIUS", "kangarooRadius", 40, 320, 5);
      html += `<div class="ed-tip">Placed once for the whole course. A kangaroo mob appears in every hole whose export frame contains the marker.</div>`;
      break;
    case "galah":
      html += range("FLOCK RADIUS", "galahRadius", 40, 280, 5);
      html += `<div class="ed-tip">Placed once for the whole course. A galah flock appears in every hole whose export frame contains the marker.</div>`;
      break;
    case "emu":
      html += range("GROUP RADIUS", "emuRadius", 40, 320, 5);
      html += `<div class="ed-tip">Placed once for the whole course. An emu group appears in every hole whose export frame contains the marker.</div>`;
      break;
    case "seal":
      html += range("COLONY RADIUS", "sealRadius", 30, 240, 5);
      html += `<div class="ed-tip">Placed once for the whole course. Seals appear on every hole whose export frame contains the marker.</div>`;
      break;
    case "penguin":
      html += range("COLONY RADIUS", "penguinRadius", 25, 200, 5);
      html += `<div class="ed-tip">Placed once for the whole course. Penguins appear on every hole whose export frame contains the marker.</div>`;
      break;
    case "target":
      html += `
        <label class="ed-setting">
          <span class="ed-set-head">TYPE</span>
          <select data-setting="targetType">
            <option value="water" ${s.targetType === "water" ? "selected" : ""}>Water ring</option>
            <option value="ground" ${s.targetType === "ground" ? "selected" : ""}>Ground ring</option>
          </select>
        </label>`;
      html += range("RADIUS", "targetRadius", 16, 90, 2);
      html += `
        <label class="ed-setting">
          <span class="ed-set-head">BONUS</span>
          <select data-setting="targetValue">
            <option value="1" ${s.targetValue === 1 ? "selected" : ""}>−1 stroke</option>
            <option value="2" ${s.targetValue === 2 ? "selected" : ""}>−2 strokes</option>
          </select>
        </label>
        <label class="ed-setting">
          <span class="ed-set-head">LABEL</span>
          <input type="text" data-setting="targetLabel" value="${String(
            s.targetLabel
          ).replace(/"/g, "&quot;")}" />
        </label>
        <div class="ed-setting"><button data-action="clear-targets">CLEAR TARGETS</button></div>
        <div class="ed-tip">Water targets must sit inside a pond. A safe drop point is generated on the nearest bank when placed.</div>`;
      break;
    case "route": {
      const draft = state.routeDraft;
      html += `
        <div class="ed-setting"><div class="row">
          <button data-action="finish-route">FINISH ROUTE</button>
          <button data-action="clear-route">CLEAR ROUTES</button>
        </div></div>
        <div class="ed-tip">${
          draft
            ? `${draft.length} waypoint${draft.length === 1 ? "" : "s"}. Double-click or press Enter to finish.`
            : "Click the course to start a course-wide cart route. Each hole receives the part that passes through its export frame."
        }</div>`;
      break;
    }
    case "erase":
      html += `<div class="ed-tip">Click close to a tree trunk, deer marker, rabbit warren, duck marker, bonus target or cart route. Press Delete to remove the selected route.</div>`;
      break;
    case "tee":
      html += range("ROTATION", "teeRot", -180, 180, 5, "°");
      html += holeHasTee(hole)
        ? `<div class="ed-tip">Tee at ${Math.round(hole.tee.x)}, ${Math.round(
            hole.tee.y
          )}. Rotation turns the tee box and its markers.</div>`
        : `<div class="ed-tip">Click the course to place this hole’s tee.</div>`;
      break;
    case "pin":
      html += holeHasPin(hole)
        ? `<div class="ed-tip">Pin at ${Math.round(
            hole.pin.x
          )}, ${Math.round(hole.pin.y)}.</div>`
        : `<div class="ed-tip">Click the course to place this hole’s pin.</div>`;
      break;
    default:
      html += `<div class="ed-tip">Click FIT to frame the whole design. Use the mouse wheel or + / − to zoom. Hold WASD or the arrow keys to pan. Click a hole tab to jump to that hole.</div>`;
  }
  toolSettings.innerHTML = html;
  drawSizeGuide();
}

function applyThemeToTools() {
  const env = state.course.environment || "canadian";
  const canadian = env === "canadian" || env === "all";
  const australian = env === "australian" || env === "all";
  const coastal = env === "coastal" || env === "all";
  const visibility = {
    deer: canadian,
    rabbit: canadian,
    squirrel: canadian || australian,
    duck: canadian || australian,
    kangaroo: australian,
    galah: australian,
    emu: australian,
    ocean: coastal,
    seal: coastal,
    penguin: coastal,
  };
  for (const button of toolbar.querySelectorAll(".tool")) {
    const tool = button.dataset.tool;
    if (tool in visibility) button.style.display = visibility[tool] ? "" : "none";
  }
  if (visibility[state.tool] === false) {
    state.tool = "pan";
    canvas.style.cursor = "grab";
    for (const button of toolbar.querySelectorAll(".tool")) {
      button.classList.toggle("on", button.dataset.tool === "pan");
    }
  }
  const allowed = treeSpeciesForTheme(env);
  if (allowed.length && !allowed.some((species) => species.index === state.settings.treeHue)) {
    state.settings.treeHue = allowed[0].index;
  }
}

function refreshUI() {
  applyThemeToTools();
  renderHoleTabs();
  updateHoleFields();
  renderStats();
  renderToolSettings();
  renderChallenges();
  renderBonusTargets();
  renderValidation();
  renderRouteActions();
}

function setupParTotal(count) {
  if (courseDialogMode === "edit" && count === state.course.holes.length) {
    return state.course.holes.reduce((total, hole) => total + hole.par, 0);
  }
  let total = 0;
  for (let i = 0; i < count; i++) total += parForHole(i);
  return total;
}

function renderSetupCounts() {
  const current = state.course.holes.length;
  const counts = [];
  if (courseDialogMode === "edit" && current !== 9 && current !== 18) {
    counts.push(current);
  }
  counts.push(9, 18);
  setupCountsEl.innerHTML = [...new Set(counts)]
    .sort((a, b) => a - b)
    .map((count) => {
      const isCurrent = courseDialogMode === "edit" && count === current;
      return `<button type="button" data-count="${count}" class="${
        count === setupHoleCount ? "on" : ""
      }">${count}<small>${isCurrent ? "CURRENT" : "HOLES"}</small></button>`;
    })
    .join("");
}

function updateSetupNote() {
  const current = state.course.holes.length;
  const par = setupParTotal(setupHoleCount);
  let text = `${setupHoleCount} holes · par ${par}.`;
  if (courseDialogMode === "edit") {
    if (setupHoleCount > current) {
      text += ` Adds ${setupHoleCount - current} new hole${
        setupHoleCount - current === 1 ? "" : "s"
      }.`;
    } else if (setupHoleCount < current) {
      text += ` Deletes ${current - setupHoleCount} hole${
        current - setupHoleCount === 1 ? "" : "s"
      } when saved.`;
    } else {
      text += " Keeps all current holes.";
    }
  }
  setupNoteEl.textContent = text;
}

function openCourseDialog(mode) {
  courseDialogMode = mode;
  setupExistingCount = state.course.holes.length;
  if (mode === "new") {
    setupNameInput.value = "My Course";
    setupIdInput.value = "my-course";
    setupIdTouched = false;
    setupHoleCount = 9;
    setupEnvironmentSelect.value = "canadian";
    courseDialogModeEl.textContent = "NEW COURSE";
    courseDialogTitleEl.textContent = "Build a full course";
    courseDialogHelpEl.textContent =
      "Choose the course theme and how many holes it has. Holes start empty on a blank canvas. Creating a new course replaces the current editor contents.";
    courseConfirmBtn.textContent = "CREATE COURSE";
  } else {
    setupNameInput.value = state.course.name;
    setupIdInput.value = state.course.id;
    setupIdTouched = true;
    setupHoleCount = setupExistingCount;
    setupEnvironmentSelect.value = state.course.environment || "canadian";
    courseDialogModeEl.textContent = "COURSE SETUP";
    courseDialogTitleEl.textContent = "Course details";
    courseDialogHelpEl.textContent =
      "Rename the course, change its theme or change the hole count. Increasing adds fresh empty holes; decreasing removes the extra holes.";
    courseConfirmBtn.textContent = "SAVE SETUP";
  }
  renderSetupCounts();
  updateSetupNote();
  courseDialog.classList.remove("hidden");
  setTimeout(() => setupNameInput.focus(), 0);
}

function closeCourseDialog() {
  courseDialog.classList.add("hidden");
}

function submitCourseDialog(event) {
  event.preventDefault();
  const name = setupNameInput.value.trim() || "My Course";
  const id = slugify(setupIdInput.value || name);
  const environment = setupEnvironmentSelect?.value || "canadian";
  let count = setupHoleCount;

  if (courseDialogMode === "new") {
    state.course = blankCourse(count, name, id, environment);
    state.holeIndex = 0;
    state.fairwayDraft = null;
    state.routeDraft = null;
    state.selectedRoute = -1;
    state.meta = { summary: "", unlock: { starter: true } };
    state.partCreatedAt = null;
    clearAutosave();
    resetHistory();
    applyCourse();
    refreshUI();
    fitView();
    closeCourseDialog();
    setStatus(`Created ${name} · ${count} holes`);
    return;
  }

  const current = state.course.holes.length;
  if (
    count < current &&
    !window.confirm(
      `Remove ${current - count} hole${
        current - count === 1 ? "" : "s"
      } from this course? Their edits will be lost.`
    )
  ) {
    return;
  }

  state.course.name = name;
  state.course.id = id;
  state.course.environment = environment;
  while (state.course.holes.length < count) {
    const hole = defaultHole(state.course.holes.length);
    state.course.holes.push(hole);
    const e = holeExtent(hole);
    if (e) ensureDesignSpace(e.minX, e.minY, e.maxX, e.maxY);
  }
  if (state.course.holes.length > count) state.course.holes.length = count;
  reindexHoles();
  state.holeIndex = clamp(state.holeIndex, 0, state.course.holes.length - 1);
  applyCourse();
  refreshUI();
  commit();
  closeCourseDialog();
  setStatus(
    count === current
      ? "Course details saved"
      : `Course resized to ${count} holes`
  );
}

function selectHole(index) {
  state.holeIndex = clamp(index, 0, state.course.holes.length - 1);
  state.fairwayDraft = null;
  state.fairwayEditTarget = null;
  state.routeDraft = null;
  state.roadDraft = null;
  state.selectedRoute = -1;
  applyCourse();
  refreshUI();
  focusHole(state.holeIndex);
  setStatus(`Editing ${currentHole().name}`);
}

function editHole(mutator, options = {}) {
  const { apply = true, record = true } = options;
  mutator(currentHole());
  if (apply) applyCourse();
  else invalidatePreview();
  if (record) commit();
  refreshUI();
  requestRender();
}

// ---------------------------------------------------------------- brush merge
function fillPolyGrid(grid, gw, gh, poly, originX = 0, originY = 0) {
  if (!poly || poly.length < 3) return;
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
  const x0 = clamp(Math.floor((minX - originX) / CELL), 0, gw - 1);
  const x1 = clamp(Math.ceil((maxX - originX) / CELL), 0, gw - 1);
  const y0 = clamp(Math.floor((minY - originY) / CELL), 0, gh - 1);
  const y1 = clamp(Math.ceil((maxY - originY) / CELL), 0, gh - 1);
  for (let gy = y0; gy <= y1; gy++) {
    const py = originY + (gy + 0.5) * CELL;
    for (let gx = x0; gx <= x1; gx++) {
      const px = originX + (gx + 0.5) * CELL;
      if (pointInPoly(px, py, poly)) grid[gy * gw + gx] = 1;
    }
  }
}

function fillCircleGrid(grid, gw, gh, circle, originX = 0, originY = 0) {
  const r = Math.max(2, circle.r);
  const x0 = clamp(Math.floor((circle.x - r - originX) / CELL), 0, gw - 1);
  const x1 = clamp(Math.ceil((circle.x + r - originX) / CELL), 0, gw - 1);
  const y0 = clamp(Math.floor((circle.y - r - originY) / CELL), 0, gh - 1);
  const y1 = clamp(Math.ceil((circle.y + r - originY) / CELL), 0, gh - 1);
  const r2 = r * r;
  for (let gy = y0; gy <= y1; gy++) {
    const py = originY + (gy + 0.5) * CELL;
    for (let gx = x0; gx <= x1; gx++) {
      const px = originX + (gx + 0.5) * CELL;
      if ((px - circle.x) ** 2 + (py - circle.y) ** 2 <= r2) {
        grid[gy * gw + gx] = 1;
      }
    }
  }
}

function boundaryLoops(grid, gw, gh) {
  const edges = [];
  const starts = new Map();
  const key = (x, y) => `${x},${y}`;
  const addEdge = (a, b) => {
    edges.push([a, b]);
    const k = key(a[0], a[1]);
    let list = starts.get(k);
    if (!list) {
      list = [];
      starts.set(k, list);
    }
    list.push(edges.length - 1);
  };

  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      if (!grid[gy * gw + gx]) continue;
      if (gy === 0 || !grid[(gy - 1) * gw + gx]) addEdge([gx, gy], [gx + 1, gy]);
      if (gx === gw - 1 || !grid[gy * gw + gx + 1]) addEdge([gx + 1, gy], [gx + 1, gy + 1]);
      if (gy === gh - 1 || !grid[(gy + 1) * gw + gx]) addEdge([gx + 1, gy + 1], [gx, gy + 1]);
      if (gx === 0 || !grid[gy * gw + gx - 1]) addEdge([gx, gy + 1], [gx, gy]);
    }
  }

  const used = new Uint8Array(edges.length);
  const loops = [];
  for (let i = 0; i < edges.length; i++) {
    if (used[i]) continue;
    const loop = [];
    let cursor = i;
    let guard = 0;
    while (cursor >= 0 && cursor < edges.length && !used[cursor] && guard++ < 60000) {
      used[cursor] = 1;
      const [, b] = edges[cursor];
      loop.push(edges[cursor][0]);
      const candidates = starts.get(key(b[0], b[1]));
      let next = -1;
      if (candidates) {
        for (const j of candidates) {
          if (!used[j]) {
            next = j;
            break;
          }
        }
      }
      cursor = next;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

function rdpOpen(points, epsilon) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  const eps2 = epsilon * epsilon;
  while (stack.length) {
    const [first, last] = stack.pop();
    if (last - first < 2) continue;
    const ax = points[first][0];
    const ay = points[first][1];
    const bx = points[last][0];
    const by = points[last][1];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let best = -1;
    let bestD = -1;
    for (let i = first + 1; i < last; i++) {
      const px = points[i][0];
      const py = points[i][1];
      let t = ((px - ax) * dx + (py - ay) * dy) / len2;
      t = clamp(t, 0, 1);
      const qx = ax + dx * t;
      const qy = ay + dy * t;
      const d = (px - qx) ** 2 + (py - qy) ** 2;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (bestD > eps2 && best > -1) {
      keep[best] = 1;
      stack.push([first, best], [best, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

function rdpClosed(points, epsilon) {
  if (points.length < 5) return points;
  let far = 0;
  let best = -1;
  for (let i = 1; i < points.length; i++) {
    const d =
      (points[i][0] - points[0][0]) ** 2 +
      (points[i][1] - points[0][1]) ** 2;
    if (d > best) {
      best = d;
      far = i;
    }
  }
  const a = rdpOpen(points.slice(0, far + 1), epsilon);
  const b = rdpOpen(points.slice(far).concat([points[0]]), epsilon);
  return a.concat(b.slice(1, -1));
}

function polyArea(poly) {
  let area = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    area += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  }
  return Math.abs(area / 2);
}

function mergeBrush(existingPolys, circles) {
  const b = designBounds();
  const originX = Math.floor(b.minX) - CELL * 2;
  const originY = Math.floor(b.minY) - CELL * 2;
  const gw = Math.max(1, Math.ceil((b.maxX - originX) / CELL) + 2);
  const gh = Math.max(1, Math.ceil((b.maxY - originY) / CELL) + 2);
  const grid = new Uint8Array(gw * gh);
  for (const poly of existingPolys || []) fillPolyGrid(grid, gw, gh, poly, originX, originY);
  for (const circle of circles) fillCircleGrid(grid, gw, gh, circle, originX, originY);

  const loops = boundaryLoops(grid, gw, gh);
  const polys = [];
  for (const loop of loops) {
    const world = loop.map(([gx, gy]) => [
      originX + gx * CELL,
      originY + gy * CELL,
    ]);
    let simplified = rdpClosed(world, 2.4);
    // Drop a duplicated closing point if the simplifier produced one.
    if (
      simplified.length > 1 &&
      Math.hypot(
        simplified[0][0] - simplified[simplified.length - 1][0],
        simplified[0][1] - simplified[simplified.length - 1][1]
      ) < 0.01
    ) {
      simplified.pop();
    }
    if (simplified.length >= 3 && polyArea(simplified) > 120) {
      polys.push(simplified.map(([x, y]) => [round1(x), round1(y)]));
    }
  }
  return polys;
}

// ---------------------------------------------------------------- tools
function setTool(tool) {
  if (!TOOLS[tool]) return;
  if (state.stroke) finishBrush();
  state.pendingDropIndex = -1;
  state.tool = tool;
  canvas.style.cursor = tool === "pan" ? "grab" : "crosshair";
  for (const button of toolbar.querySelectorAll(".tool")) {
    button.classList.toggle("on", button.dataset.tool === tool);
  }
  if (tool === "green") {
    const g = currentHole().green;
    if (holeHasGreen(currentHole())) {
      state.settings.greenRx = Math.round(g.rx);
      state.settings.greenRy = Math.round(g.ry);
      state.settings.greenRot = Math.round((g.rot * 180) / Math.PI);
    }
  }
  if (tool === "tee") {
    state.settings.teeRot = holeHasTee(currentHole())
      ? Math.round((currentHole().tee.rot * 180) / Math.PI)
      : 0;
  }
  renderToolSettings();
  updateHint();
  requestRender();
}

function updateHint() {
  const p = state.pointer;
  const title = TOOLS[state.tool].title;
  if (!p) {
    cursorHintEl.textContent = title;
    return;
  }
  cursorHintEl.textContent = `${title} · ${Math.round(p.x)}, ${Math.round(p.y)} px`;
}

function addFairwayPoint(p) {
  if (!state.fairwayDraft) {
    state.fairwayDraft = [];
    state.fairwayEditTarget = null;
  }
  state.fairwayDraft.push({
    x: Math.round(p.x),
    y: Math.round(p.y),
    w: state.settings.fairwayWidth,
  });
  ensureAssetSpace(p.x, p.y, state.settings.fairwayWidth / 2 + 40);
  renderToolSettings();
  requestRender();
  updateHint();
}

function finishFairway() {
  const draft = state.fairwayDraft;
  if (!draft || draft.length < 2) {
    setStatus("A fairway needs at least two points.", "warn");
    return;
  }
  const target = state.fairwayEditTarget;
  state.fairwayDraft = null;
  state.fairwayEditTarget = null;
  const hole = currentHole();
  const isPrimary = !Array.isArray(hole.fairway) || hole.fairway.length < 2;
  let replaced = false;
  editHole(() => {
    const h = currentHole();
    if (target && target.owner === "primary") {
      h.fairway = draft;
      replaced = true;
    } else if (
      target &&
      target.owner === "extra" &&
      Array.isArray(h.extraFairways) &&
      h.extraFairways[target.extraIndex]
    ) {
      h.extraFairways[target.extraIndex].points = draft;
      replaced = true;
    } else if (isPrimary) {
      h.fairway = draft;
    } else {
      if (!Array.isArray(h.extraFairways)) h.extraFairways = [];
      h.extraFairways.push({
        points: draft,
        hole: state.holeIndex + 1,
      });
    }
  });
  setStatus(
    replaced
      ? "Fairway segment updated"
      : isPrimary
      ? "Primary fairway set"
      : `Fairway segment ${holeFairwaySegments(currentHole()).length} added`
  );
}

function loadFairwaySegment(index) {
  const segment = holeFairwaySegments(currentHole())[index];
  if (!segment) {
    setStatus("That fairway segment could not be found.", "warn");
    return;
  }
  state.fairwayDraft = segment.points.map((p) => ({ ...p }));
  state.fairwayEditTarget = {
    owner: segment.owner,
    extraIndex: segment.extraIndex,
  };
  renderToolSettings();
  requestRender();
  setStatus(`Editing fairway segment ${index + 1}`);
}

function loadCurrentFairway() {
  if (!holeFairwaySegments(currentHole()).length) {
    setStatus("This hole has no fairway to load.", "warn");
    return;
  }
  loadFairwaySegment(0);
}

function addRoutePoint(p) {
  if (!state.routeDraft) state.routeDraft = [];
  state.routeDraft.push({ x: Math.round(p.x), y: Math.round(p.y) });
  renderToolSettings();
  requestRender();
  updateHint();
}

function finishRoute() {
  const draft = state.routeDraft;
  if (!draft || draft.length < 2) {
    setStatus("A cart route needs at least two waypoints.", "warn");
    return;
  }
  state.routeDraft = null;
  editHole(() => {
    state.course.cartRoutes.push(draft);
  });
  setStatus(`Cart route added to the whole course (${draft.length} waypoints)`);
}

function placeTee(p) {
  ensureAssetSpace(p.x, p.y, 100);
  editHole(() => {
    currentHole().tee = {
      x: Math.round(p.x),
      y: Math.round(p.y),
      rot: (state.settings.teeRot * Math.PI) / 180,
    };
  });
  ensureHoleFrameSpace(currentHole());
  setStatus("Tee moved");
}

function placePin(p) {
  ensureAssetSpace(p.x, p.y, 70);
  editHole(() => {
    currentHole().pin = { x: Math.round(p.x), y: Math.round(p.y) };
  });
  ensureHoleFrameSpace(currentHole());
  setStatus("Pin moved");
}

function addTree(p) {
  const r = state.settings.treeRadius;
  ensureAssetSpace(p.x, p.y, r + 30);
  editHole(() => {
    currentHole().trees.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      r,
      hue: state.settings.treeHue,
      species: state.settings.treeHue,
    });
  });
  setStatus("Tree placed");
}

function addProp(p) {
  const type = state.settings.propType;
  const meta = PROP_TYPES[type] || PROP_TYPES.shed;
  const r = (Math.max(meta.w, meta.h) * state.settings.propScale) / 2 + 40;
  let x = p.x;
  let y = p.y;
  const isDistance = type === "distanceRed" || type === "distanceBlue";
  if (isDistance) {
    const hole = currentHole();
    if (!holeHasPin(hole)) {
      setStatus("Place the pin before adding a distance marker.", "warn");
      return;
    }
    const distancePx = state.settings.markerDistance * C.PX_PER_METRE;
    const angle = Math.atan2(p.y - hole.pin.y, p.x - hole.pin.x);
    x = hole.pin.x + Math.cos(angle) * distancePx;
    y = hole.pin.y + Math.sin(angle) * distancePx;
  }
  ensureAssetSpace(x, y, r);
  editHole(() => {
    currentHole().props.push({
      type,
      x: Math.round(x),
      y: Math.round(y),
      rot: (state.settings.propRot * Math.PI) / 180,
      scale: state.settings.propScale,
    });
  });
  setStatus(`${meta.label} placed`);
}

function addRoadPoint(p) {
  if (!state.roadDraft) state.roadDraft = [];
  state.roadDraft.push({ x: Math.round(p.x), y: Math.round(p.y) });
  ensureAssetSpace(p.x, p.y, state.settings.roadWidth / 2 + 30);
  renderToolSettings();
  requestRender();
  updateHint();
}

function finishRoad() {
  const draft = state.roadDraft;
  if (!draft || draft.length < 2) {
    setStatus("A road needs at least two waypoints.", "warn");
    return;
  }
  state.roadDraft = null;
  editHole(() => {
    currentHole().roads.push({
      style: state.settings.roadStyle,
      width: state.settings.roadWidth,
      points: draft,
    });
  });
  setStatus("Road added");
}

function addFlowerBed(p) {
  const rx = state.settings.flowerRx;
  const ry = state.settings.flowerRy;
  ensureAssetSpace(p.x, p.y, Math.max(rx, ry) + 20);
  editHole(() => {
    currentHole().flowerBeds.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      rx,
      ry,
      rot: 0,
      palette: state.settings.flowerPalette,
    });
  });
  setStatus("Flower bed placed");
}

function addDeer(p) {
  ensureAssetSpace(p.x, p.y, state.settings.deerRadius);
  editHole(() => {
    state.course.wildlife.deerSpawns.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      radius: state.settings.deerRadius,
    });
  });
  setStatus("Deer spawn added to the whole course");
}

function addRabbit(p) {
  ensureAssetSpace(p.x, p.y, 40);
  editHole(() => {
    state.course.wildlife.rabbitTrees.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
    });
  });
  setStatus("Rabbit warren added to the whole course");
}

function addSquirrel(p) {
  ensureAssetSpace(p.x, p.y, 30);
  editHole(() => {
    if (!Array.isArray(state.course.wildlife.squirrelTrees)) {
      state.course.wildlife.squirrelTrees = [];
    }
    state.course.wildlife.squirrelTrees.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
    });
  });
  setStatus("Squirrel marker added to the whole course");
}

function addDuck(p) {
  ensureAssetSpace(p.x, p.y, state.settings.duckRadius);
  editHole(() => {
    state.course.wildlife.duckPonds.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      radius: state.settings.duckRadius,
    });
  });
  setStatus("Duck pond marker added to the whole course");
}

function addKangaroo(p) {
  ensureAssetSpace(p.x, p.y, state.settings.kangarooRadius);
  editHole(() => {
    state.course.wildlife.kangarooSpawns.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      radius: state.settings.kangarooRadius,
    });
  });
  setStatus("Kangaroo mob added to the whole course");
}

function addGalah(p) {
  ensureAssetSpace(p.x, p.y, state.settings.galahRadius);
  editHole(() => {
    state.course.wildlife.galahFlocks.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      radius: state.settings.galahRadius,
    });
  });
  setStatus("Galah flock added to the whole course");
}

function addEmu(p) {
  ensureAssetSpace(p.x, p.y, state.settings.emuRadius);
  editHole(() => {
    state.course.wildlife.emuSpawns.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      radius: state.settings.emuRadius,
    });
  });
  setStatus("Emu group added to the whole course");
}

function addSeal(p) {
  ensureAssetSpace(p.x, p.y, state.settings.sealRadius);
  editHole(() => {
    if (!Array.isArray(state.course.wildlife.sealColonies)) {
      state.course.wildlife.sealColonies = [];
    }
    state.course.wildlife.sealColonies.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      radius: state.settings.sealRadius,
    });
  });
  setStatus("Seal colony added to the whole course");
}

function addPenguin(p) {
  ensureAssetSpace(p.x, p.y, state.settings.penguinRadius);
  editHole(() => {
    if (!Array.isArray(state.course.wildlife.penguinColonies)) {
      state.course.wildlife.penguinColonies = [];
    }
    state.course.wildlife.penguinColonies.push({
      x: Math.round(p.x),
      y: Math.round(p.y),
      radius: state.settings.penguinRadius,
    });
  });
  setStatus("Penguin colony added to the whole course");
}

function nextBonusId(hole) {
  const ids = new Set(hole.bonusTargets.map((t) => t.id));
  let n = 1;
  while (ids.has(`bonus-${n}`)) n += 1;
  return `bonus-${n}`;
}

function addBonusTarget(p) {
  const hole = currentHole();
  const type = state.settings.targetType === "ground" ? "ground" : "water";
  const surface = holeSurfaceAt(hole, p.x, p.y);
  const target = {
    id: nextBonusId(hole),
    label:
      String(state.settings.targetLabel || "").trim() ||
      (type === "water" ? "WATER RING" : "GOLD RING"),
    value: -Math.max(1, Number(state.settings.targetValue) || 1),
    x: Math.round(p.x),
    y: Math.round(p.y),
    radius: Math.max(12, Number(state.settings.targetRadius) || 34),
    type,
  };
  if (type === "water") {
    const drop = nearestDryPoint(hole, p.x, p.y);
    target.drop = { x: Math.round(drop.x), y: Math.round(drop.y) };
  }
  ensureAssetSpace(p.x, p.y, target.radius + 30);
  editHole(() => {
    currentHole().bonusTargets.push(target);
  });
  if (type === "water" && surface !== "water") {
    setStatus("Water target placed on dry ground — move it onto a pond.", "warn");
  } else if (type === "ground" && surface === "water") {
    setStatus("Ground target placed in water — it may be hard to land on.", "warn");
  } else {
    setStatus(`Bonus target placed · ${target.label}`);
  }
}

function eraseAt(p, options = {}) {
  const { silent = false } = options;
  let best = null;
  const consider = (
    kind,
    holeIndex,
    index,
    distance,
    limit,
    area = Infinity,
    priority = 2
  ) => {
    if (distance > limit * state.hitScale) return;
    const better =
      !best ||
      priority < best.priority ||
      (priority === best.priority && distance < best.distance - 1e-6) ||
      (priority === best.priority &&
        Math.abs(distance - best.distance) < 1e-6 &&
        area < best.area);
    if (better) best = { kind, holeIndex, index, distance, area, priority };
  };

  state.course.holes.forEach((hole, hi) => {
    hole.trees.forEach((t, i) =>
      consider(
        "tree",
        hi,
        i,
        Math.hypot(p.x - t.x, p.y - t.y),
        Math.max(26, t.r * 0.55),
        Infinity,
        0
      )
    );
    if (holeHasTee(hole)) {
      consider(
        "tee",
        hi,
        0,
        Math.hypot(p.x - hole.tee.x, p.y - hole.tee.y),
        26,
        Infinity,
        0
      );
    }
    if (holeHasPin(hole)) {
      consider(
        "pin",
        hi,
        0,
        Math.hypot(p.x - hole.pin.x, p.y - hole.pin.y),
        26,
        Infinity,
        0
      );
    }
    if (holeHasGreen(hole) && inEllipse(p.x, p.y, hole.green, 2)) {
      consider(
        "green",
        hi,
        0,
        0,
        0,
        Math.PI * hole.green.rx * hole.green.ry,
        2
      );
    }
    (hole.greenPolys || []).forEach((poly, i) => {
      if (poly.length > 2 && pointInPoly(p.x, p.y, poly)) {
        consider("greenPoly", hi, i, 0, 0, polyArea(poly), 2);
      }
    });
    (hole.extraGreens || []).forEach((green, i) => {
      if (inEllipse(p.x, p.y, green, 2)) {
        consider(
          "extraGreen",
          hi,
          i,
          0,
          0,
          Math.PI * green.rx * green.ry,
          2
        );
      }
    });
    (hole.extraTees || []).forEach((tee, i) => {
      consider(
        "extraTee",
        hi,
        i,
        Math.hypot(p.x - tee.x, p.y - tee.y),
        26,
        Infinity,
        0
      );
    });
    if (Array.isArray(hole.fairway) && hole.fairway.length > 1) {
      const d = distanceToPolyline(
        p.x,
        p.y,
        hole.fairway.map((q) => [q.x, q.y])
      );
      const width = hole.fairway.reduce(
        (max, q) => Math.max(max, Number(q.w) || 140),
        0
      );
      consider("fairway", hi, 0, d, Math.max(20, width / 2 + 12), Infinity, 1);
    }
    (hole.fairwayPolys || []).forEach((poly, i) => {
      if (poly.length > 2 && pointInPoly(p.x, p.y, poly)) {
        consider("fairwayPoly", hi, i, 0, 0, polyArea(poly), 2);
      }
    });
    (hole.extraFairways || []).forEach((extra, i) => {
      if (!Array.isArray(extra.points) || extra.points.length < 2) return;
      const d = distanceToPolyline(
        p.x,
        p.y,
        extra.points.map((q) => [q.x, q.y])
      );
      const width = extra.points.reduce(
        (max, q) => Math.max(max, Number(q.w) || 140),
        0
      );
      consider("extraFairway", hi, i, d, Math.max(20, width / 2 + 12), Infinity, 1);
    });
    hole.waterPolys.forEach((poly, i) => {
      if (poly.length > 2 && pointInPoly(p.x, p.y, poly)) {
        consider("water", hi, i, 0, 0, polyArea(poly), 2);
      }
    });
    (hole.oceanPolys || []).forEach((poly, i) => {
      if (poly.length > 2 && pointInPoly(p.x, p.y, poly)) {
        consider("ocean", hi, i, 0, 0, polyArea(poly), 2);
      }
    });
    hole.sandPolys.forEach((poly, i) => {
      if (poly.length > 2 && pointInPoly(p.x, p.y, poly)) {
        consider("sand", hi, i, 0, 0, polyArea(poly), 2);
      }
    });
    hole.bonusTargets.forEach((t, i) =>
      consider(
        "target",
        hi,
        i,
        Math.hypot(p.x - t.x, p.y - t.y),
        Math.max(28, Number(t.radius) || 34),
        Infinity,
        0
      )
    );
    hole.props.forEach((prop, i) => {
      const meta = PROP_TYPES[prop.type] || PROP_TYPES.shed;
      consider(
        "prop",
        hi,
        i,
        Math.hypot(p.x - prop.x, p.y - prop.y),
        Math.max(30, Math.max(meta.w, meta.h) * prop.scale * 0.6),
        Infinity,
        0
      );
    });
    hole.roads.forEach((road, i) => {
      const d = distanceToPolyline(
        p.x,
        p.y,
        road.points.map((q) => [q.x, q.y])
      );
      consider("road", hi, i, d, Math.max(26, road.width / 2 + 12), Infinity, 1);
    });
    hole.flowerBeds.forEach((bed, i) =>
      consider(
        "flowers",
        hi,
        i,
        Math.hypot(p.x - bed.x, p.y - bed.y),
        Math.max(bed.rx, bed.ry) + 8,
        Infinity,
        1
      )
    );
  });

  const wildlife = state.course.wildlife;
  wildlife.deerSpawns.forEach((s, i) =>
    consider("deer", null, i, Math.hypot(p.x - s.x, p.y - s.y), 30, Infinity, 0)
  );
  wildlife.rabbitTrees.forEach((s, i) =>
    consider("rabbit", null, i, Math.hypot(p.x - s.x, p.y - s.y), 26, Infinity, 0)
  );
  (wildlife.squirrelTrees || []).forEach((s, i) =>
    consider("squirrel", null, i, Math.hypot(p.x - s.x, p.y - s.y), 26, Infinity, 0)
  );
  wildlife.duckPonds.forEach((s, i) =>
    consider("duck", null, i, Math.hypot(p.x - s.x, p.y - s.y), 30, Infinity, 0)
  );
  (wildlife.kangarooSpawns || []).forEach((s, i) =>
    consider("kangaroo", null, i, Math.hypot(p.x - s.x, p.y - s.y), 32, Infinity, 0)
  );
  (wildlife.galahFlocks || []).forEach((s, i) =>
    consider("galah", null, i, Math.hypot(p.x - s.x, p.y - s.y), 32, Infinity, 0)
  );
  (wildlife.emuSpawns || []).forEach((s, i) =>
    consider("emu", null, i, Math.hypot(p.x - s.x, p.y - s.y), 32, Infinity, 0)
  );
  (wildlife.sealColonies || []).forEach((s, i) =>
    consider("seal", null, i, Math.hypot(p.x - s.x, p.y - s.y), 32, Infinity, 0)
  );
  (wildlife.penguinColonies || []).forEach((s, i) =>
    consider("penguin", null, i, Math.hypot(p.x - s.x, p.y - s.y), 32, Infinity, 0)
  );
  state.course.cartRoutes.forEach((route, i) => {
    const pts = route.map((q) => [q.x, q.y]);
    const d = distanceToPolyline(p.x, p.y, pts);
    consider("route", null, i, d, 26, Infinity, 1);
  });

  if (!best) {
    if (!silent) setStatus("Nothing close enough to erase.", "warn");
    return;
  }
  const labels = {
    tree: "Tree",
    tee: "Tee",
    pin: "Pin",
    green: "Green",
    greenPoly: "Painted green",
    extraGreen: "Green",
    extraTee: "Tee",
    fairway: "Fairway",
    fairwayPoly: "Painted fairway",
    extraFairway: "Fairway",
    deer: "Deer spawn",
    rabbit: "Rabbit warren",
    squirrel: "Squirrel marker",
    duck: "Duck marker",
    kangaroo: "Kangaroo mob",
    galah: "Galah flock",
    emu: "Emu group",
    seal: "Seal colony",
    penguin: "Penguin colony",
    target: "Bonus target",
    route: "Cart route",
    prop: "Building",
    road: "Road",
    flowers: "Flower bed",
    water: "Water",
    ocean: "Ocean",
    sand: "Sand",
  };
  editHole(() => {
    const target = best.holeIndex == null ? null : state.course.holes[best.holeIndex];
    if (target) {
      if (best.kind === "tree") target.trees.splice(best.index, 1);
      if (best.kind === "tee") target.tee = null;
      if (best.kind === "pin") target.pin = null;
      if (best.kind === "green") target.green = null;
      if (best.kind === "greenPoly") target.greenPolys.splice(best.index, 1);
      if (best.kind === "extraGreen") target.extraGreens.splice(best.index, 1);
      if (best.kind === "extraTee") target.extraTees.splice(best.index, 1);
      if (best.kind === "fairway") target.fairway = [];
      if (best.kind === "fairwayPoly") target.fairwayPolys.splice(best.index, 1);
      if (best.kind === "extraFairway") target.extraFairways.splice(best.index, 1);
      if (best.kind === "water") target.waterPolys.splice(best.index, 1);
      if (best.kind === "ocean") target.oceanPolys.splice(best.index, 1);
      if (best.kind === "sand") target.sandPolys.splice(best.index, 1);
      if (best.kind === "target") target.bonusTargets.splice(best.index, 1);
      if (best.kind === "prop") target.props.splice(best.index, 1);
      if (best.kind === "road") target.roads.splice(best.index, 1);
      if (best.kind === "flowers") target.flowerBeds.splice(best.index, 1);
    }
    if (best.kind === "deer") state.course.wildlife.deerSpawns.splice(best.index, 1);
    if (best.kind === "rabbit") state.course.wildlife.rabbitTrees.splice(best.index, 1);
    if (best.kind === "squirrel") state.course.wildlife.squirrelTrees?.splice(best.index, 1);
    if (best.kind === "duck") state.course.wildlife.duckPonds.splice(best.index, 1);
    if (best.kind === "kangaroo") state.course.wildlife.kangarooSpawns?.splice(best.index, 1);
    if (best.kind === "galah") state.course.wildlife.galahFlocks?.splice(best.index, 1);
    if (best.kind === "emu") state.course.wildlife.emuSpawns?.splice(best.index, 1);
    if (best.kind === "seal") state.course.wildlife.sealColonies?.splice(best.index, 1);
    if (best.kind === "penguin") state.course.wildlife.penguinColonies?.splice(best.index, 1);
    if (best.kind === "route") {
      state.course.cartRoutes.splice(best.index, 1);
      state.selectedRoute = -1;
    }
  });
  const from = best.holeIndex == null ? "" : ` from Hole ${best.holeIndex + 1}`;
  setStatus(`${labels[best.kind]}${from} erased`);
}

function finishBrush() {
  const stroke = state.stroke;
  if (!stroke || !stroke.circles.length) {
    state.stroke = null;
    return;
  }
  const keyMap = {
    pond: "waterPolys",
    ocean: "oceanPolys",
    bunker: "sandPolys",
    fairwayPaint: "fairwayPolys",
    greenPaint: "greenPolys",
  };
  const labelMap = {
    pond: "Water",
    ocean: "Ocean",
    bunker: "Sand",
    fairwayPaint: "Fairway",
    greenPaint: "Green",
  };
  const key = keyMap[stroke.type] || "sandPolys";
  const label = labelMap[stroke.type] || "Shape";
  const circles = stroke.circles;
  state.stroke = null;
  editHole(() => {
    const hole = currentHole();
    hole[key] = mergeBrush(hole[key] || [], circles);
  });
  setStatus(
    `${label} updated (${currentHole()[key].length} shape${
      currentHole()[key].length === 1 ? "" : "s"
    })`
  );
}

// ---------------------------------------------------------------- drawing
function requestRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    render();
  });
}

const w2s = (x, y) => ({
  x: state.panX + x * state.zoom,
  y: state.panY + y * state.zoom,
});

function s2w(sx, sy) {
  return {
    x: (sx - state.panX) / state.zoom,
    y: (sy - state.panY) / state.zoom,
  };
}

function pathWorld(points, close = false) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const s = w2s(p[0], p[1]);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  if (close) ctx.closePath();
}

const treeSpriteCache = new Map();

function treeSprite(t) {
  const species = Number(t.species != null ? t.species : t.hue) || 0;
  const radius = Math.max(24, Math.round(t.r));
  const key = `${radius}|${species}`;
  if (treeSpriteCache.has(key)) return treeSpriteCache.get(key);
  const sprite = makeTreeCanvas(radius, species, 0, 2);
  treeSpriteCache.set(key, sprite);
  return sprite;
}

function drawTreeAt(t) {
  const s = w2s(t.x, t.y);
  const sprite = treeSprite(t);
  const w = sprite.size * state.zoom;
  ctx.drawImage(sprite.canvas, s.x - w / 2, s.y - w / 2, w, w);
}

function drawTreeWorld(t) {
  const sprite = treeSprite(t);
  const w = sprite.size;
  ctx.drawImage(sprite.canvas, t.x - w / 2, t.y - w / 2, w, w);
}

function designFairwaySamples(points) {
  const out = [];
  const ctrl = points || [];
  const SEG = 10;
  for (let i = 0; i < ctrl.length - 1; i++) {
    const p0 = ctrl[Math.max(0, i - 1)];
    const p1 = ctrl[i];
    const p2 = ctrl[i + 1];
    const p3 = ctrl[Math.min(ctrl.length - 1, i + 2)];
    for (let s = 0; s < SEG; s++) {
      const t = s / SEG;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push({
        x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        w: p1.w + (p2.w - p1.w) * t,
      });
    }
  }
  if (ctrl.length) {
    const last = ctrl[ctrl.length - 1];
    out.push({ x: last.x, y: last.y, w: last.w });
  }
  return out;
}

function traceWorldPoly(poly) {
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const x = Array.isArray(p) ? p[0] : p.x;
    const y = Array.isArray(p) ? p[1] : p.y;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawHoleDesign(hole, active) {
  ctx.save();
  ctx.globalAlpha = active ? 1 : 0.62;

  // Fairway bands first, so water and sand can cut across them.
  for (const fw of [hole.fairway, ...(hole.extraFairways || []).map((f) => f.points)]) {
    if (!fw || fw.length < 2) continue;
    const samples = designFairwaySamples(fw);
    ctx.fillStyle = active ? "#5fa742" : "#477f39";
    ctx.fill(circleUnionPath(samples, 0));
  }
  for (const poly of hole.fairwayPolys || []) {
    traceWorldPoly(poly);
    ctx.fillStyle = active ? "#5fa742" : "#477f39";
    ctx.fill();
  }

  // Sand then water on top.
  for (const poly of hole.sandPolys) {
    traceWorldPoly(poly);
    ctx.fillStyle = active ? "#e8d29a" : "#b9aa80";
    ctx.fill();
  }
  for (const poly of hole.oceanPolys || []) {
    traceWorldPoly(poly);
    ctx.fillStyle = active ? "#1f6e91" : "#245f78";
    ctx.fill();
    ctx.strokeStyle = active ? "rgba(185, 240, 245, 0.55)" : "rgba(160,210,215,0.4)";
    ctx.lineWidth = 6;
    ctx.stroke();
  }
  for (const poly of hole.waterPolys) {
    traceWorldPoly(poly);
    ctx.fillStyle = active ? "#3b96aa" : "#3b7a88";
    ctx.fill();
  }

  // Greens.
  for (const green of [hole.green, ...(hole.extraGreens || [])]) {
    if (!green) continue;
    ctx.save();
    ctx.translate(green.x, green.y);
    ctx.rotate(green.rot || 0);
    ctx.fillStyle = active ? "#82ca5c" : "#619b4a";
    ctx.beginPath();
    ctx.ellipse(0, 0, green.rx + 8, green.ry + 8, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = active ? "#8edb68" : "#6aab50";
    ctx.beginPath();
    ctx.ellipse(0, 0, green.rx, green.ry, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  for (const poly of hole.greenPolys || []) {
    traceWorldPoly(poly);
    ctx.fillStyle = active ? "#82ca5c" : "#619b4a";
    ctx.fill();
    ctx.save();
    traceWorldPoly(poly);
    ctx.clip();
    ctx.fillStyle = active ? "#8edb68" : "#6aab50";
    ctx.fillRect(
      Math.min(...poly.map(([x]) => x)) - 10,
      Math.min(...poly.map(([, y]) => y)) - 10,
      Math.max(...poly.map(([x]) => x)) - Math.min(...poly.map(([x]) => x)) + 20,
      Math.max(...poly.map(([, y]) => y)) - Math.min(...poly.map(([, y]) => y)) + 20
    );
    ctx.restore();
  }

  // Roads, flowers and buildings.
  for (const road of hole.roads) {
    ctx.globalAlpha = active ? 0.95 : 0.45;
    drawRoad(ctx, road);
  }
  for (const bed of hole.flowerBeds) drawFlowerBed(ctx, bed);
  for (const prop of hole.props) {
    drawProp(ctx, prop, { pin: hole.pin, pxPerMetre: C.PX_PER_METRE });
  }
  ctx.globalAlpha = active ? 1 : 0.62;

  // Trees.
  for (const t of hole.trees) drawTreeWorld(t);

  // Tee box and pin marker.
  const tee = hole.tee;
  if (holeHasTee(hole)) {
    ctx.save();
    ctx.translate(tee.x, tee.y);
    ctx.rotate(tee.rot || 0);
    ctx.fillStyle = active ? "rgba(235,255,210,0.22)" : "rgba(235,255,210,0.1)";
    ctx.strokeStyle = active ? "rgba(253,246,227,0.7)" : "rgba(253,246,227,0.28)";
    ctx.lineWidth = 1.5 / state.zoom;
    ctx.beginPath();
    ctx.roundRect(-58, -20, 116, 76, 14);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  if (holeHasPin(hole)) {
    const pin = hole.pin;
    const pinSize = Math.max(1.5, 14 / state.zoom);
    ctx.fillStyle = active ? "#ff6b57" : "rgba(255,107,87,0.55)";
    ctx.beginPath();
    ctx.moveTo(pin.x, pin.y);
    ctx.lineTo(pin.x, pin.y - pinSize * 2.2);
    ctx.lineTo(pin.x + pinSize * 1.5, pin.y - pinSize * 1.6);
    ctx.lineTo(pin.x, pin.y - pinSize * 1.0);
    ctx.closePath();
    ctx.fill();
  }

  const badgeAt = holeHasTee(hole) ? hole.tee : holeHasPin(hole) ? hole.pin : null;
  if (badgeAt) {
    // Hole number badge.
    const label = `${hole.index}`;
    const lx = badgeAt.x;
    const ly = badgeAt.y + (holeHasTee(hole) ? 116 : -70);
    const size = Math.max(10, 30 / state.zoom);
    ctx.font = `900 ${size}px ui-rounded, system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(5,24,14,0.62)";
    ctx.beginPath();
    ctx.arc(lx, ly, size * 1.15, 0, TAU);
    ctx.fill();
    ctx.fillStyle = active ? "#fdf6e3" : "rgba(253,246,227,0.55)";
    ctx.fillText(label, lx, ly + 1);
  }

  ctx.restore();
}

function drawExportFrame(hole) {
  const f = holeFrame(hole);
  if (!f) return;
  const corners = frameCorners(f);
  ctx.save();
  ctx.beginPath();
  corners.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(255,107,87,0.045)";
  ctx.fill();
  ctx.strokeStyle = "#ff6b57";
  ctx.lineWidth = 2 / state.zoom;
  ctx.setLineDash([10 / state.zoom, 8 / state.zoom]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Centreline / tee-to-pin axis.
  ctx.strokeStyle = "rgba(255,107,87,0.55)";
  ctx.lineWidth = 1.2 / state.zoom;
  ctx.setLineDash([5 / state.zoom, 7 / state.zoom]);
  ctx.beginPath();
  ctx.moveTo(hole.tee.x, hole.tee.y);
  ctx.lineTo(hole.pin.x, hole.pin.y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Small label above the top edge of the frame.
  const pad = 14 / state.zoom;
  const labelX = f.cx - (f.h / 2 + pad) * Math.sin(f.rot);
  const labelY = f.cy - (f.h / 2 + pad) * Math.cos(f.rot);
  const size = Math.max(9, 16 / state.zoom);
  ctx.font = `900 ${size}px ui-rounded, system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "bottom";
  ctx.fillStyle = "#ff8d7e";
  ctx.fillText(
    `EXPORT ${Math.round(f.w)} × ${Math.round(f.h)}`,
    labelX,
    labelY
  );
  ctx.restore();
}

function referenceLocalPoint(p) {
  const ref = state.reference;
  if (!ref) return { x: 0, y: 0 };
  const dx = p.x - ref.x;
  const dy = p.y - ref.y;
  const c = Math.cos(-ref.rot);
  const s = Math.sin(-ref.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function referenceHitTest(p) {
  const ref = state.reference;
  if (!ref) return null;
  const local = referenceLocalPoint(p);
  const hw = ref.w / 2;
  const hh = ref.h / 2;
  const handleR = Math.max(7, (12 * state.hitScale) / state.zoom);
  const corners = [
    { x: -hw, y: -hh, sx: -1, sy: -1 },
    { x: hw, y: -hh, sx: 1, sy: -1 },
    { x: hw, y: hh, sx: 1, sy: 1 },
    { x: -hw, y: hh, sx: -1, sy: 1 },
  ];
  for (const corner of corners) {
    if (Math.hypot(local.x - corner.x, local.y - corner.y) <= handleR) {
      return { type: "resize", sx: corner.sx, sy: corner.sy };
    }
  }
  if (Math.abs(local.x) <= hw && Math.abs(local.y) <= hh) {
    return { type: "move" };
  }
  return null;
}

function fitReferenceToDesign() {
  const ref = state.reference;
  if (!ref) return;
  const b = designBounds();
  const bw = Math.max(1, b.maxX - b.minX);
  const bh = Math.max(1, b.maxY - b.minY);
  const scale = Math.min((bw * 0.82) / ref.w, (bh * 0.82) / ref.h);
  ref.w *= scale;
  ref.h *= scale;
  ref.aspect = ref.w / ref.h;
  ref.x = (b.minX + b.maxX) / 2;
  ref.y = (b.minY + b.maxY) / 2;
  renderToolSettings();
  requestRender();
  setStatus("Reference fitted to the design");
}

function syncReferenceInputs() {
  const ref = state.reference;
  if (!ref) return;
  const setValue = (key, value) => {
    const el = toolSettings.querySelector(`[data-ref-value="${key}"]`);
    if (el) el.textContent = value;
  };
  const setInput = (key, value) => {
    const el = toolSettings.querySelector(`[data-reference="${key}"]`);
    if (el) el.value = value;
  };
  const deg = Math.round((ref.rot * 180) / Math.PI);
  setValue("opacity", `${Math.round(ref.opacity * 100)}%`);
  setValue("width", `${Math.round(ref.w)} px`);
  setValue("height", `${Math.round(ref.h)} px`);
  setValue("rot", `${deg}°`);
  setInput("opacity", Math.round(ref.opacity * 100));
  setInput("width", Math.round(ref.w));
  setInput("height", Math.round(ref.h));
  setInput("rot", deg);
}

function loadReferenceImage(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    let source = image;
    let width = image.naturalWidth || image.width;
    let height = image.naturalHeight || image.height;
    const maxSide = 4096;
    if (Math.max(width, height) > maxSide) {
      const scale = maxSide / Math.max(width, height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const c = canvas.getContext("2d");
      c.drawImage(image, 0, 0, canvas.width, canvas.height);
      source = canvas;
      width = canvas.width;
      height = canvas.height;
    }
    URL.revokeObjectURL(url);
    const b = designBounds();
    const bw = Math.max(1, b.maxX - b.minX);
    const bh = Math.max(1, b.maxY - b.minY);
    const scale = Math.min((bw * 0.82) / width, (bh * 0.82) / height);
    const w = width * scale;
    const h = height * scale;
    state.reference = {
      image: source,
      name: file.name || "Reference image",
      x: (b.minX + b.maxX) / 2,
      y: (b.minY + b.maxY) / 2,
      w,
      h,
      rot: 0,
      opacity: 0.3,
      lockAspect: true,
      aspect: w / h,
    };
    setStatus(`Reference image loaded: ${file.name || "image"}`);
    refreshUI();
    requestRender();
  };
  image.onerror = () => {
    URL.revokeObjectURL(url);
    setStatus("That image could not be opened.", "error");
  };
  image.src = url;
}

function drawReferenceImage() {
  const ref = state.reference;
  if (!ref) return;
  ctx.save();
  ctx.globalAlpha = ref.opacity;
  ctx.translate(ref.x, ref.y);
  ctx.rotate(ref.rot);
  ctx.drawImage(ref.image, -ref.w / 2, -ref.h / 2, ref.w, ref.h);
  ctx.restore();

  if (state.tool !== "reference") return;
  ctx.save();
  ctx.translate(ref.x, ref.y);
  ctx.rotate(ref.rot);
  ctx.strokeStyle = "rgba(253,246,227,0.85)";
  ctx.lineWidth = 1.6 / state.zoom;
  ctx.setLineDash([8 / state.zoom, 6 / state.zoom]);
  ctx.strokeRect(-ref.w / 2, -ref.h / 2, ref.w, ref.h);
  ctx.setLineDash([]);
  const hs = Math.max(5, 9 / state.zoom);
  ctx.fillStyle = "#ffd23f";
  ctx.strokeStyle = "rgba(5,24,14,0.8)";
  ctx.lineWidth = 1.5 / state.zoom;
  for (const [x, y] of [
    [-ref.w / 2, -ref.h / 2],
    [ref.w / 2, -ref.h / 2],
    [ref.w / 2, ref.h / 2],
    [-ref.w / 2, ref.h / 2],
  ]) {
    ctx.beginPath();
    ctx.rect(x - hs / 2, y - hs / 2, hs, hs);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function drawDesignCourse() {
  const bounds = designBounds();
  // Outer design area fill.
  const tl = w2s(bounds.minX, bounds.minY);
  const br = w2s(bounds.maxX, bounds.maxY);
  ctx.fillStyle = "#2f662c";
  ctx.fillRect(tl.x, tl.y, br.x - tl.x, br.y - tl.y);

  ctx.save();
  ctx.translate(state.panX, state.panY);
  ctx.scale(state.zoom, state.zoom);

  // Subtle grid so the huge canvas has scale.
  const grid = 500;
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1 / state.zoom;
  ctx.beginPath();
  for (let x = Math.floor(bounds.minX / grid) * grid; x <= bounds.maxX; x += grid) {
    ctx.moveTo(x, bounds.minY);
    ctx.lineTo(x, bounds.maxY);
  }
  for (let y = Math.floor(bounds.minY / grid) * grid; y <= bounds.maxY; y += grid) {
    ctx.moveTo(bounds.minX, y);
    ctx.lineTo(bounds.maxX, y);
  }
  ctx.stroke();

  // Design boundary.
  ctx.strokeStyle = "rgba(253,246,227,0.22)";
  ctx.lineWidth = 1.5 / state.zoom;
  ctx.strokeRect(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY);

  state.course.holes.forEach((hole, i) => drawHoleDesign(hole, i === state.holeIndex));
  drawReferenceImage();
  drawExportFrame(currentHole());

  ctx.restore();
}

function drawOverlays() {
  const hole = currentHole();
  if (!hole) return;

  // Green outline.
  if (holeHasGreen(hole)) {
    const g = hole.green;
    const gc = w2s(g.x, g.y);
    ctx.save();
    ctx.translate(gc.x, gc.y);
    ctx.rotate(g.rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, g.rx * state.zoom, g.ry * state.zoom, 0, 0, TAU);
    ctx.strokeStyle = "rgba(253,246,227,0.55)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();
    ctx.setLineDash([]);
  }

  // Existing fairway lines (when drawing).
  if (state.tool === "fairway" && !state.fairwayDraft) {
    const segments = holeFairwaySegments(hole);
    for (let si = 0; si < segments.length; si++) {
      pathWorld(segments[si].points.map((p) => [p.x, p.y]));
      ctx.strokeStyle =
        si === 0 ? "rgba(185,227,91,0.6)" : "rgba(185,227,91,0.38)";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Cart routes (course-wide).
  state.course.cartRoutes.forEach((route, i) => {
    if (state.selectedRoute >= 0 && state.selectedRoute !== i) {
      ctx.globalAlpha = 0.28;
    }
    const sampled = splinePoints(route.map((p) => [p.x, p.y]), 12);
    pathWorld(sampled);
    ctx.strokeStyle =
      state.selectedRoute === i ? "#ffd23f" : "rgba(255,210,63,0.55)";
    ctx.lineWidth = state.selectedRoute === i ? 2.4 : 1.4;
    ctx.setLineDash([7, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    for (const p of route) {
      const s = w2s(p.x, p.y);
      ctx.fillStyle = "rgba(255,210,63,0.9)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 2.3, 0, TAU);
      ctx.fill();
    }
  });

  // Draft fairway.
  if (state.tool === "fairway") {
    const draft = state.fairwayDraft;
    const pts = draft || hole.fairway;
    if (pts.length > 1) {
      pathWorld(pts.map((p) => [p.x, p.y]));
      ctx.strokeStyle = draft ? "#7bd7e8" : "rgba(185,227,91,0.35)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (draft) {
      draft.forEach((p, i) => {
        const s = w2s(p.x, p.y);
        ctx.fillStyle = i === 0 ? "#b9e35b" : "#7bd7e8";
        ctx.beginPath();
        ctx.arc(s.x, s.y, 4, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(5,24,14,0.8)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      });
    }
  }

  // Draft route.
  if (state.tool === "route" && state.routeDraft) {
    const draft = state.routeDraft;
    if (draft.length > 1) {
      const sampled = splinePoints(draft.map((p) => [p.x, p.y]), 12);
      pathWorld(sampled);
      ctx.strokeStyle = "#ffd23f";
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    draft.forEach((p, i) => {
      const s = w2s(p.x, p.y);
      ctx.fillStyle = i === 0 ? "#b9e35b" : "#ffd23f";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(5,24,14,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // Draft road.
  if (state.tool === "road" && state.roadDraft) {
    const draft = state.roadDraft;
    if (draft.length > 1) {
      ctx.save();
      ctx.translate(state.panX, state.panY);
      ctx.scale(state.zoom, state.zoom);
      drawRoad(ctx, { points: draft, width: state.settings.roadWidth, style: state.settings.roadStyle });
      ctx.restore();
    }
    draft.forEach((p, i) => {
      const s = w2s(p.x, p.y);
      ctx.fillStyle = i === 0 ? "#b9e35b" : "#d9c08e";
      ctx.beginPath();
      ctx.arc(s.x, s.y, 4, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(5,24,14,0.8)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });
  }

  // Spawn / wildlife markers.
  const marker = (x, y, radius, colour, label) => {
    const s = w2s(x, y);
    const r = Math.max(5, radius * state.zoom);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fillStyle = colour.fill;
    ctx.fill();
    ctx.strokeStyle = colour.line;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = colour.text;
    ctx.font = "900 9px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, s.x, s.y);
  };
  const wildlife = state.course.wildlife;
  for (const s of wildlife.deerSpawns) {
    marker(s.x, s.y, s.radius, { fill: "rgba(185,227,91,0.1)", line: "rgba(185,227,91,0.7)", text: "#d8ee9c" }, "DEER");
  }
  for (const s of wildlife.rabbitTrees) {
    marker(s.x, s.y, 24, { fill: "rgba(230,180,255,0.12)", line: "rgba(230,180,255,0.8)", text: "#eed3ff" }, "R");
  }
  for (const s of wildlife.squirrelTrees || []) {
    marker(s.x, s.y, 24, { fill: "rgba(255,196,110,0.12)", line: "rgba(255,196,110,0.8)", text: "#ffe1b5" }, "S");
  }
  for (const s of wildlife.duckPonds) {
    marker(s.x, s.y, s.radius, { fill: "rgba(123,215,232,0.1)", line: "rgba(123,215,232,0.7)", text: "#bdeef8" }, "DUCK");
  }
  for (const s of wildlife.kangarooSpawns || []) {
    marker(s.x, s.y, s.radius, { fill: "rgba(214,166,96,0.12)", line: "rgba(214,166,96,0.8)", text: "#f0d0a4" }, "ROO");
  }
  for (const s of wildlife.galahFlocks || []) {
    marker(s.x, s.y, s.radius, { fill: "rgba(247,158,190,0.12)", line: "rgba(247,158,190,0.8)", text: "#ffd0e0" }, "GALAH");
  }
  for (const s of wildlife.emuSpawns || []) {
    marker(s.x, s.y, s.radius, { fill: "rgba(176,160,140,0.12)", line: "rgba(200,185,160,0.8)", text: "#e2d6c1" }, "EMU");
  }
  for (const s of wildlife.sealColonies || []) {
    marker(s.x, s.y, s.radius, { fill: "rgba(140,180,200,0.12)", line: "rgba(150,195,215,0.8)", text: "#c8e4ef" }, "SEAL");
  }
  for (const s of wildlife.penguinColonies || []) {
    marker(s.x, s.y, s.radius, { fill: "rgba(220,220,235,0.12)", line: "rgba(190,195,220,0.8)", text: "#e2e5f2" }, "PENGUIN");
  }

  // Bonus rings and their safe drop points.
  for (const t of hole.bonusTargets) {
    const s = w2s(t.x, t.y);
    const r = Math.max(5, (Number(t.radius) || 34) * state.zoom);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r, 0, TAU);
    ctx.fillStyle = "rgba(255,210,63,0.1)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255,210,63,0.9)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(s.x, s.y, r * 0.72, 0, TAU);
    ctx.strokeStyle = "rgba(255,250,210,0.55)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#ffe27a";
    ctx.font = "900 9px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(
      `−${Math.abs(t.value)} ${String(t.label || "RING").toUpperCase()}`,
      s.x,
      s.y - 22
    );
    if (t.drop) {
      const d = w2s(t.drop.x, t.drop.y);
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(d.x, d.y);
      ctx.strokeStyle = "rgba(255,210,63,0.4)";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(d.x, d.y, 4, 0, TAU);
      ctx.fillStyle = "rgba(185,227,91,0.9)";
      ctx.fill();
      ctx.fillStyle = "rgba(253,246,227,0.75)";
      ctx.font = "900 8px ui-rounded, system-ui, sans-serif";
      ctx.fillText("DROP", d.x, d.y - 9);
    }
  }

  // Tree centre dots when editing trees or erasing.
  if (state.tool === "tree" || state.tool === "erase") {
    for (const t of hole.trees) {
      const s = w2s(t.x, t.y);
      ctx.beginPath();
      ctx.arc(s.x, s.y, Math.max(4, t.r * state.zoom), 0, TAU);
      ctx.strokeStyle = "rgba(253,246,227,0.28)";
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 5]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Brush cursor / active stroke.
  const p = state.pointer;
  const brushActive =
    state.tool === "pond" ||
    state.tool === "bunker" ||
    (state.tool === "fairway" && state.settings.fairwayMode === "paint") ||
    (state.tool === "green" && state.settings.greenMode === "paint");
  if (p && brushActive) {
    const brushRadius =
      state.tool === "fairway"
        ? state.settings.fairwayWidth / 2
        : state.tool === "green"
        ? state.settings.greenBrushRadius
        : state.settings.brushRadius;
    if (state.stroke) {
      const strokeFill =
        state.stroke.type === "pond"
          ? "rgba(80,190,215,0.4)"
          : state.stroke.type === "greenPaint"
          ? "rgba(95,200,95,0.4)"
          : state.stroke.type === "fairwayPaint"
          ? "rgba(95,167,66,0.4)"
          : "rgba(240,215,155,0.45)";
      ctx.fillStyle = strokeFill;
      for (const c of state.stroke.circles) {
        const s = w2s(c.x, c.y);
        ctx.beginPath();
        ctx.arc(s.x, s.y, c.r * state.zoom, 0, TAU);
        ctx.fill();
      }
    }
    const ps = w2s(p.x, p.y);
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, brushRadius * state.zoom, 0, TAU);
    ctx.strokeStyle =
      state.tool === "pond"
        ? "rgba(123,215,232,0.9)"
        : state.tool === "green"
        ? "rgba(155,232,111,0.95)"
        : state.tool === "fairway"
        ? "rgba(139,220,90,0.95)"
        : "rgba(240,215,155,0.9)";
    ctx.lineWidth = 1.4;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    drawGhostLabel(
      `${Math.round(brushRadius * 2)} px · ${(
        (brushRadius * 2) /
        C.PX_PER_METRE
      ).toFixed(1)} m`,
      ps.x,
      ps.y
    );
  }

  if (p && state.tool === "erase") {
    const ps = w2s(p.x, p.y);
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, 13, 0, TAU);
    ctx.strokeStyle = "rgba(255, 120, 96, 0.95)";
    ctx.lineWidth = 1.6;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (
    p &&
    state.tool === "prop" &&
    holeHasPin(currentHole()) &&
    (state.settings.propType === "distanceRed" ||
      state.settings.propType === "distanceBlue")
  ) {
    const hole = currentHole();
    const distancePx = state.settings.markerDistance * C.PX_PER_METRE;
    const center = w2s(hole.pin.x, hole.pin.y);
    const colour =
      state.settings.propType === "distanceRed" ? "#ff6b57" : "#64a8ff";
    ctx.beginPath();
    ctx.arc(center.x, center.y, distancePx * state.zoom, 0, TAU);
    ctx.strokeStyle = colour;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.3;
    ctx.setLineDash([7, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    const angle = Math.atan2(p.y - hole.pin.y, p.x - hole.pin.x);
    const markerX = hole.pin.x + Math.cos(angle) * distancePx;
    const markerY = hole.pin.y + Math.sin(angle) * distancePx;
    const ms = w2s(markerX, markerY);
    ctx.beginPath();
    ctx.arc(ms.x, ms.y, 6, 0, TAU);
    ctx.fillStyle = colour;
    ctx.fill();
    ctx.strokeStyle = "rgba(5,24,14,0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    drawGhostLabel(`${state.settings.markerDistance} m to pin`, ms.x, ms.y);
  }

  if (p) drawSizeGhost(p);

  if (state.mapSelect?.start && state.mapSelect?.end) {
    const a = w2s(state.mapSelect.start.x, state.mapSelect.start.y);
    const b = w2s(state.mapSelect.end.x, state.mapSelect.end.y);
    const x = Math.min(a.x, b.x);
    const y = Math.min(a.y, b.y);
    const w = Math.abs(b.x - a.x);
    const h = Math.abs(b.y - a.y);
    ctx.save();
    ctx.fillStyle = "rgba(3, 14, 8, 0.58)";
    ctx.fillRect(0, 0, state.vw, y);
    ctx.fillRect(0, y + h, state.vw, state.vh - (y + h));
    ctx.fillRect(0, y, x, h);
    ctx.fillRect(x + w, y, state.vw - (x + w), h);
    ctx.strokeStyle = "#b9e35b";
    ctx.lineWidth = 2;
    ctx.setLineDash([9, 5]);
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(185, 227, 91, 0.92)";
    ctx.font = "900 9px ui-rounded, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText("COURSE IMAGE", x + 6, Math.max(14, y - 6));
    ctx.restore();
  }
}

function drawGhostLabel(text, sx, sy) {
  ctx.font = "900 9px ui-rounded, system-ui, sans-serif";
  const width = ctx.measureText(text).width + 10;
  ctx.fillStyle = "rgba(5,24,14,0.82)";
  ctx.beginPath();
  ctx.roundRect(sx - width / 2, sy - 24, width, 14, 7);
  ctx.fill();
  ctx.fillStyle = "#fdf6e3";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, sx, sy - 17);
}

function drawSizeGhost(p) {
  const tool = state.tool;
  if (
    tool === "pan" ||
    tool === "erase" ||
    tool === "pond" ||
    tool === "bunker" ||
    tool === "route" ||
    tool === "reference" ||
    (tool === "fairway" && state.settings.fairwayMode === "paint") ||
    (tool === "green" && state.settings.greenMode === "paint") ||
    (tool === "prop" &&
      (state.settings.propType === "distanceRed" ||
        state.settings.propType === "distanceBlue"))
  ) {
    return;
  }
  const info = currentToolSize();
  const ps = w2s(p.x, p.y);
  const zoom = state.zoom;
  const sizePx = info.size || info.w || 0;
  const metres = (sizePx / C.PX_PER_METRE).toFixed(1);
  const colours = {
    fairway: "#8bdc5a",
    tree: "#78c055",
    deer: "#b9e35b",
    rabbit: "#e6b4ff",
    duck: "#7bd7e8",
    target: "#ffd23f",
    green: "#9be86f",
    flowers: "#f7a1c1",
    prop: "#d9c08e",
    road: "#b9a77f",
    tee: "#fdf6e3",
    pin: "#ff6b57",
  };
  const colour = colours[tool] || "#fdf6e3";
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = `${colour}33`;
  ctx.lineWidth = 1.4;
  ctx.setLineDash([5, 4]);

  if (info.kind === "band") {
    const wWorld = info.size;
    const lengthWorld = Math.max(180, wWorld * 1.5);
    let angle = 0;
    const points = tool === "road" ? state.roadDraft : state.fairwayDraft;
    if (points && points.length > 1) {
      const a = points[points.length - 2];
      const b = points[points.length - 1];
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    }
    ctx.translate(ps.x, ps.y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.roundRect(
      (-lengthWorld / 2) * zoom,
      (-wWorld / 2) * zoom,
      lengthWorld * zoom,
      wWorld * zoom,
      (wWorld / 2) * zoom
    );
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    drawGhostLabel(`${Math.round(wWorld)} px · ${metres} m`, ps.x, ps.y);
  } else if (info.kind === "circle") {
    const r = Math.max(3, (info.size * zoom) / 2);
    ctx.beginPath();
    ctx.arc(ps.x, ps.y, r, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    drawGhostLabel(`${Math.round(info.size)} px · ${metres} m`, ps.x, ps.y);
  } else if (info.kind === "ellipse") {
    ctx.beginPath();
    ctx.ellipse(ps.x, ps.y, Math.max(3, (info.w * zoom) / 2), Math.max(3, (info.h * zoom) / 2), 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    drawGhostLabel(`${Math.round(info.w)} × ${Math.round(info.h)} px`, ps.x, ps.y);
  } else if (info.kind === "rect") {
    const w = info.w * zoom;
    const h = info.h * zoom;
    const rot = tool === "prop" ? (state.settings.propRot * Math.PI) / 180 : 0;
    ctx.translate(ps.x, ps.y);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 4);
    ctx.fill();
    ctx.stroke();
    ctx.setLineDash([]);
    drawGhostLabel(`${Math.round(info.w)} × ${Math.round(info.h)} px`, ps.x, ps.y);
  }
  ctx.restore();
}

function render() {
  if (state.previewDirty) applyCourse();
  ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
  ctx.clearRect(0, 0, state.vw, state.vh);
  ctx.fillStyle = "#0d2115";
  ctx.fillRect(0, 0, state.vw, state.vh);

  drawDesignCourse();
  drawOverlays();
}

// ---------------------------------------------------------------- camera/input
function resize() {
  const rect = canvas.getBoundingClientRect();
  state.vw = Math.max(1, rect.width);
  state.vh = Math.max(1, rect.height);
  state.dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(state.vw * state.dpr);
  canvas.height = Math.round(state.vh * state.dpr);
  if (!state.fitted) {
    fitView();
    state.fitted = true;
  }
  requestRender();
}

function fitView() {
  if (!state.course) return;
  const pad = 36;
  const bottom = 66;
  const b = designBounds();
  const w = Math.max(1, b.maxX - b.minX);
  const h = Math.max(1, b.maxY - b.minY);
  const zoom = Math.min(
    (state.vw - pad * 2) / w,
    (state.vh - pad - bottom) / h
  );
  state.zoom = clamp(zoom, MIN_ZOOM, MAX_ZOOM);
  state.panX = (state.vw - w * state.zoom) / 2 - b.minX * state.zoom;
  state.panY = pad + (state.vh - pad - bottom - h * state.zoom) / 2 - b.minY * state.zoom;
  requestRender();
}

function focusHole(index) {
  const hole = state.course.holes[index];
  if (!hole) return;
  const f = holeFrame(hole);
  if (!f) {
    fitView();
    return;
  }
  const pad = 120;
  const zoom = clamp(
    Math.min((state.vw - 80) / (f.w + pad), (state.vh - 140) / (f.h + pad)),
    MIN_ZOOM,
    MAX_ZOOM
  );
  state.zoom = zoom;
  state.panX = state.vw / 2 - f.cx * zoom;
  state.panY = (state.vh - 40) / 2 - f.cy * zoom;
  requestRender();
}

function zoomAt(sx, sy, factor) {
  const before = s2w(sx, sy);
  state.zoom = clamp(state.zoom * factor, MIN_ZOOM, MAX_ZOOM);
  state.panX = sx - before.x * state.zoom;
  state.panY = sy - before.y * state.zoom;
  requestRender();
}

// ---------------------------------------------------------------- keyboard pan
const PAN_KEYS = new Set([
  "w",
  "a",
  "s",
  "d",
  "arrowup",
  "arrowdown",
  "arrowleft",
  "arrowright",
]);
const PAN_SPEED = 760;
const panKeys = new Set();
let panRaf = 0;
let panLast = 0;

function keyboardPanBlocked() {
  return [
    courseDialog,
    libraryDialog,
    publishDialog,
    analysisDialog,
    previewOverlay,
  ].some((el) => el && !el.classList.contains("hidden"));
}

function panDirection() {
  let x = 0;
  let y = 0;
  if (panKeys.has("a") || panKeys.has("arrowleft")) x += 1;
  if (panKeys.has("d") || panKeys.has("arrowright")) x -= 1;
  if (panKeys.has("w") || panKeys.has("arrowup")) y += 1;
  if (panKeys.has("s") || panKeys.has("arrowdown")) y -= 1;
  return { x, y };
}

function panStep(now) {
  if (!panKeys.size) {
    panRaf = 0;
    panLast = 0;
    return;
  }
  if (keyboardPanBlocked()) {
    panKeys.clear();
    stopKeyboardPan();
    return;
  }
  const { x, y } = panDirection();
  if (!x && !y) {
    panRaf = 0;
    panLast = 0;
    return;
  }
  const dt = panLast ? Math.min(0.05, (now - panLast) / 1000) : 1 / 60;
  panLast = now;
  const length = Math.hypot(x, y) || 1;
  state.panX += (x / length) * PAN_SPEED * dt;
  state.panY += (y / length) * PAN_SPEED * dt;
  requestRender();
  panRaf = requestAnimationFrame(panStep);
}

function startKeyboardPan() {
  if (panRaf) return;
  panLast = 0;
  panRaf = requestAnimationFrame(panStep);
}

function stopKeyboardPan() {
  if (panRaf) cancelAnimationFrame(panRaf);
  panRaf = 0;
  panLast = 0;
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const sx = event.clientX - rect.left;
  const sy = event.clientY - rect.top;
  return { sx, sy, world: s2w(sx, sy) };
}

// The second click/tap of a double action adds a duplicate point before the
// draft is finished, so drop it first.
function finishDraftFromDoubleTap() {
  if (state.tool === "fairway") {
    if (state.fairwayDraft && state.fairwayDraft.length > 1) state.fairwayDraft.pop();
    finishFairway();
  } else if (state.tool === "route") {
    if (state.routeDraft && state.routeDraft.length > 1) state.routeDraft.pop();
    finishRoute();
  } else if (state.tool === "road") {
    if (state.roadDraft && state.roadDraft.length > 1) state.roadDraft.pop();
    finishRoad();
  }
}

// ---------------------------------------------------------------- pointers
// Track every pointer so two fingers can pinch and pan without the second
// finger being interpreted as a new draw or placement.
const activePointers = new Map();
let pinchGesture = null;
let gestureLatch = false;
let lastTap = null;

function trackPointer(event) {
  const rect = canvas.getBoundingClientRect();
  const record = {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    startX: event.clientX,
    startY: event.clientY,
    sx: event.clientX - rect.left,
    sy: event.clientY - rect.top,
    time: performance.now(),
    moved: false,
    touch: event.pointerType === "touch",
    historyBefore: historyIndex,
  };
  activePointers.set(event.pointerId, record);
  return record;
}

function pinchPoints() {
  const points = [...activePointers.values()];
  return { a: points[0], b: points[1] };
}

function beginGesture() {
  const { a, b } = pinchPoints();
  if (!a || !b) return;
  gestureLatch = true;
  state.drag = null;
  if (state.stroke) finishBrush();
  // A stray placement from the first finger is undone when the pinch starts
  // immediately, so two-finger gestures never leave a tee or a bush behind.
  const settled = !a.moved && !b.moved;
  const young = performance.now() - Math.min(a.time, b.time) < 240;
  const leader = a.time <= b.time ? a : b;
  if (settled && young && historyIndex !== leader.historyBefore) undo();
  pinchGesture = {
    lastDist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    lastMidX: (a.x + b.x) / 2,
    lastMidY: (a.y + b.y) / 2,
  };
  canvas.style.cursor = "grabbing";
}

function updateGesture() {
  const { a, b } = pinchPoints();
  if (!a || !b || !pinchGesture) return;
  const rect = canvas.getBoundingClientRect();
  const dist = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
  const midX = (a.x + b.x) / 2;
  const midY = (a.y + b.y) / 2;

  const factor = dist / pinchGesture.lastDist;
  if (Math.abs(factor - 1) > 0.002) {
    zoomAt(midX - rect.left, midY - rect.top, factor);
    state.fitted = true;
  }
  const dx = midX - pinchGesture.lastMidX;
  const dy = midY - pinchGesture.lastMidY;
  if (dx || dy) {
    state.panX += dx;
    state.panY += dy;
  }
  pinchGesture.lastDist = dist;
  pinchGesture.lastMidX = midX;
  pinchGesture.lastMidY = midY;
  requestRender();
}

function rebaseGesture() {
  const { a, b } = pinchPoints();
  if (!a || !b) {
    pinchGesture = null;
    return;
  }
  pinchGesture = {
    lastDist: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    lastMidX: (a.x + b.x) / 2,
    lastMidY: (a.y + b.y) / 2,
  };
}

function onPointerDown(event) {
  if (event.button !== 0 && event.pointerType === "mouse") return;
  const record = trackPointer(event);
  try {
    canvas.setPointerCapture?.(event.pointerId);
  } catch (err) {
    // Some touch stacks reject capture for synthetic or cancelled pointers.
  }

  if (activePointers.size >= 2) {
    beginGesture();
    return;
  }
  if (gestureLatch) return;

  state.hitScale = record.touch ? 1.7 : 1;
  const pos = pointerPosition(event);
  const p = pos.world;
  state.pointer = p;

  if (state.mapSelect) {
    state.mapSelect.dragging = true;
    state.mapSelect.start = { x: p.x, y: p.y };
    state.mapSelect.end = { x: p.x, y: p.y };
    if (mapSelectConfirmBtn) mapSelectConfirmBtn.disabled = true;
    canvas.style.cursor = "crosshair";
    requestRender();
    return;
  }

  if (state.pendingDropIndex >= 0) {
    const index = state.pendingDropIndex;
    state.pendingDropIndex = -1;
    editHole(() => {
      const target = currentHole().bonusTargets[index];
      if (target) target.drop = { x: Math.round(p.x), y: Math.round(p.y) };
    });
    setStatus("Safe drop point moved");
    updateHint();
    return;
  }

  switch (state.tool) {
    case "reference": {
      const hit = referenceHitTest(p);
      const ref = state.reference;
      if (hit && ref) {
        if (hit.type === "move") {
          state.drag = {
            mode: "reference-move",
            startPointer: { x: p.x, y: p.y },
            startX: ref.x,
            startY: ref.y,
          };
          canvas.style.cursor = "grabbing";
        } else {
          const c = Math.cos(ref.rot);
          const s = Math.sin(ref.rot);
          const ax = -hit.sx * (ref.w / 2);
          const ay = -hit.sy * (ref.h / 2);
          state.drag = {
            mode: "reference-resize",
            sx: hit.sx,
            sy: hit.sy,
            anchor: { x: ref.x + ax * c - ay * s, y: ref.y + ax * s + ay * c },
            startW: ref.w,
            startH: ref.h,
            rot: ref.rot,
          };
          canvas.style.cursor = "nwse-resize";
        }
      }
      break;
    }
    case "pan":
      state.drag = {
        mode: "pan",
        clientX: event.clientX,
        clientY: event.clientY,
        panX: state.panX,
        panY: state.panY,
      };
      canvas.style.cursor = "grabbing";
      break;
    case "fairway":
      if (state.settings.fairwayMode === "paint") {
        state.stroke = {
          type: "fairwayPaint",
          radius: Math.max(20, state.settings.fairwayWidth / 2),
          circles: [
            {
              x: p.x,
              y: p.y,
              r: Math.max(20, state.settings.fairwayWidth / 2),
            },
          ],
        };
        setStatus("Painting fairway — release to apply");
        ensureAssetSpace(
          p.x,
          p.y,
          Math.max(20, state.settings.fairwayWidth / 2) + 20
        );
        requestRender();
      } else {
        addFairwayPoint(p);
      }
      break;
    case "route":
      addRoutePoint(p);
      break;
    case "tee":
      placeTee(p);
      break;
    case "pin":
      placePin(p);
      break;
    case "green": {
      if (state.settings.greenMode === "paint") {
        state.stroke = {
          type: "greenPaint",
          radius: state.settings.greenBrushRadius,
          circles: [
            {
              x: p.x,
              y: p.y,
              r: state.settings.greenBrushRadius,
            },
          ],
        };
        setStatus("Painting green — release to apply");
        ensureAssetSpace(p.x, p.y, state.settings.greenBrushRadius + 20);
        requestRender();
        break;
      }
      state.drag = { mode: "green", center: { x: p.x, y: p.y } };
      const hole = currentHole();
      if (!holeHasGreen(hole)) {
        hole.green = { x: Math.round(p.x), y: Math.round(p.y), rx: 70, ry: 58, rot: 0 };
      }
      hole.green.x = Math.round(p.x);
      hole.green.y = Math.round(p.y);
      hole.green.rx = Math.max(30, state.settings.greenRx);
      hole.green.ry = Math.max(24, state.settings.greenRy);
      ensureAssetSpace(p.x, p.y, Math.max(hole.green.rx, hole.green.ry) + 30);
      requestRender();
      break;
    }
    case "pond":
    case "ocean":
    case "bunker":
      state.stroke = {
        type: state.tool,
        radius: state.settings.brushRadius,
        circles: [{ x: p.x, y: p.y, r: state.settings.brushRadius }],
      };
      setStatus(
        `Painting ${
          state.tool === "pond"
            ? "water"
            : state.tool === "ocean"
            ? "ocean"
            : "sand"
        } — release to apply`
      );
      ensureAssetSpace(p.x, p.y, state.settings.brushRadius + 20);
      requestRender();
      break;
    case "tree":
      addTree(p);
      break;
    case "prop":
      addProp(p);
      break;
    case "road":
      addRoadPoint(p);
      break;
    case "flowers":
      addFlowerBed(p);
      break;
    case "deer":
      addDeer(p);
      break;
    case "rabbit":
      addRabbit(p);
      break;
    case "squirrel":
      addSquirrel(p);
      break;
    case "duck":
      addDuck(p);
      break;
    case "kangaroo":
      addKangaroo(p);
      break;
    case "galah":
      addGalah(p);
      break;
    case "emu":
      addEmu(p);
      break;
    case "seal":
      addSeal(p);
      break;
    case "penguin":
      addPenguin(p);
      break;
    case "target":
      addBonusTarget(p);
      break;
    case "erase":
      state.drag = { mode: "erase", lastX: p.x, lastY: p.y };
      canvas.style.cursor = "crosshair";
      eraseAt(p);
      break;
  }
  updateHint();
}

function onPointerMove(event) {
  const record = activePointers.get(event.pointerId);
  if (record) {
    record.x = event.clientX;
    record.y = event.clientY;
    if (
      !record.moved &&
      Math.hypot(event.clientX - record.startX, event.clientY - record.startY) > 8
    ) {
      record.moved = true;
    }
  }
  if (gestureLatch) {
    if (activePointers.size >= 2) updateGesture();
    return;
  }

  const pos = pointerPosition(event);
  const p = pos.world;
  state.pointer = p;

  if (state.mapSelect?.dragging) {
    state.mapSelect.end = { x: p.x, y: p.y };
    requestRender();
    return;
  }

  if (state.drag?.mode === "reference-move") {
    const ref = state.reference;
    if (ref) {
      ref.x = state.drag.startX + (p.x - state.drag.startPointer.x);
      ref.y = state.drag.startY + (p.y - state.drag.startPointer.y);
      syncReferenceInputs();
      requestRender();
    }
  } else if (state.drag?.mode === "reference-resize") {
    const ref = state.reference;
    if (ref) {
      const drag = state.drag;
      const dx = p.x - drag.anchor.x;
      const dy = p.y - drag.anchor.y;
      const lc = Math.cos(-drag.rot);
      const ls = Math.sin(-drag.rot);
      const lx = dx * lc - dy * ls;
      const ly = dx * ls + dy * lc;
      let newW = Math.max(40, Math.abs(lx));
      let newH = Math.max(40, Math.abs(ly));
      if (ref.lockAspect) {
        const scale = Math.max(newW / drag.startW, newH / drag.startH);
        newW = drag.startW * scale;
        newH = drag.startH * scale;
      } else {
        ref.aspect = newW / newH;
      }
      const c = Math.cos(drag.rot);
      const s = Math.sin(drag.rot);
      const ox = (drag.sx * newW) / 2;
      const oy = (drag.sy * newH) / 2;
      ref.w = newW;
      ref.h = newH;
      ref.x = drag.anchor.x + ox * c - oy * s;
      ref.y = drag.anchor.y + ox * s + oy * c;
      syncReferenceInputs();
      drawSizeGuide();
      requestRender();
    }
  } else if (state.drag?.mode === "pan") {
    state.panX = state.drag.panX + (event.clientX - state.drag.clientX);
    state.panY = state.drag.panY + (event.clientY - state.drag.clientY);
    requestRender();
  } else if (state.drag?.mode === "erase") {
    const step = 12 / Math.max(0.15, state.zoom);
    if (
      Math.hypot(p.x - state.drag.lastX, p.y - state.drag.lastY) >= step
    ) {
      state.drag.lastX = p.x;
      state.drag.lastY = p.y;
      eraseAt(p, { silent: true });
    }
  } else if (state.drag?.mode === "green") {
    const hole = currentHole();
    const d = Math.hypot(p.x - state.drag.center.x, p.y - state.drag.center.y);
    hole.green.rx = Math.max(30, Math.round(d || state.settings.greenRx));
    hole.green.ry = Math.max(24, Math.round((d || state.settings.greenRy) * 0.84));
    ensureAssetSpace(
      hole.green.x,
      hole.green.y,
      Math.max(hole.green.rx, hole.green.ry) + 30
    );
    requestRender();
  } else if (state.stroke) {
    const last = state.stroke.circles[state.stroke.circles.length - 1];
    const r = state.stroke.radius || state.settings.brushRadius;
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) >= r * 0.3) {
      state.stroke.circles.push({ x: p.x, y: p.y, r });
      ensureAssetSpace(p.x, p.y, r + 20);
    }
    requestRender();
  } else if (
    state.tool === "pond" ||
    state.tool === "ocean" ||
    state.tool === "bunker" ||
    state.tool === "tree" ||
    state.tool === "prop" ||
    state.tool === "road" ||
    state.tool === "flowers" ||
    state.tool === "fairway" ||
    state.tool === "green"
  ) {
    requestRender();
  }
  if (!state.drag && !state.stroke && state.tool === "reference") {
    const hit = referenceHitTest(p);
    canvas.style.cursor = hit
      ? hit.type === "move"
        ? "grab"
        : "nwse-resize"
      : "crosshair";
  }
  updateHint();
}

function onPointerUp(event) {
  const record = event ? activePointers.get(event.pointerId) : null;
  if (event) activePointers.delete(event.pointerId);

  if (gestureLatch) {
    if (activePointers.size >= 2) rebaseGesture();
    else if (activePointers.size === 1) pinchGesture = null;
    else {
      gestureLatch = false;
      pinchGesture = null;
      state.drag = null;
      state.pointer = null;
      lastTap = null;
      canvas.style.cursor = state.tool === "pan" ? "grab" : "crosshair";
      requestRender();
    }
    return;
  }

  // A quick double tap finishes multi-point drafts on touch screens, where
  // dblclick is not guaranteed to fire.
  if (
    record &&
    record.touch &&
    !record.moved &&
    performance.now() - record.time < 420 &&
    ["fairway", "route", "road"].includes(state.tool)
  ) {
    const now = performance.now();
    if (
      lastTap &&
      now - lastTap.time < 340 &&
      Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) < 28
    ) {
      lastTap = null;
      finishDraftFromDoubleTap();
      return;
    }
    lastTap = { time: now, x: event.clientX, y: event.clientY };
  } else if (record && !record.touch) {
    lastTap = null;
  }

  if (state.mapSelect?.dragging) {
    state.mapSelect.dragging = false;
    const a = state.mapSelect.start;
    const b = state.mapSelect.end;
    const big =
      a &&
      b &&
      Math.abs(a.x - b.x) > 200 &&
      Math.abs(a.y - b.y) > 200;
    if (mapSelectConfirmBtn) mapSelectConfirmBtn.disabled = !big;
    canvas.style.cursor = "crosshair";
    requestRender();
    return;
  }
  if (
    state.drag?.mode === "reference-move" ||
    state.drag?.mode === "reference-resize"
  ) {
    state.drag = null;
    canvas.style.cursor = "crosshair";
    renderToolSettings();
    requestRender();
  } else if (state.drag?.mode === "pan") {
    state.drag = null;
    canvas.style.cursor = "grab";
  } else if (state.drag?.mode === "erase") {
    state.drag = null;
    canvas.style.cursor = "crosshair";
  } else if (state.drag?.mode === "green") {
    state.drag = null;
    const g = currentHole().green;
    state.settings.greenRx = Math.round(g.rx);
    state.settings.greenRy = Math.round(g.ry);
    applyCourse();
    commit();
    refreshUI();
    setStatus("Green moved / resized");
  } else if (state.stroke) {
    finishBrush();
  }
}

// ---------------------------------------------------------------- export frame
function normalizeAngle(a) {
  let out = a;
  while (out > Math.PI) out -= TAU;
  while (out < -Math.PI) out += TAU;
  return out;
}

// The export frame is derived entirely from tee and pin: a portrait rectangle
// rotated so tee -> pin points straight up. Height grows for long holes.
function holeFrame(hole) {
  if (!holeHasFrame(hole)) return null;
  const dx = hole.pin.x - hole.tee.x;
  const dy = hole.pin.y - hole.tee.y;
  const length = Math.hypot(dx, dy) || 1;
  const theta = Math.atan2(dy, dx);
  const rot = -theta - Math.PI / 2;
  const w = EXPORT_WIDTH;
  const h = Math.max(
    EXPORT_MIN_HEIGHT,
    Math.ceil(length + EXPORT_PADDING * 2)
  );
  return {
    cx: (hole.tee.x + hole.pin.x) / 2,
    cy: (hole.tee.y + hole.pin.y) / 2,
    rot,
    w,
    h,
    length,
    theta,
  };
}

function framePoint(p, f) {
  const dx = p.x - f.cx;
  const dy = p.y - f.cy;
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  return { x: dx * c - dy * s + f.w / 2, y: dx * s + dy * c + f.h / 2 };
}

function frameLocalPoint(p, f) {
  const dx = p.x - f.cx;
  const dy = p.y - f.cy;
  const c = Math.cos(f.rot);
  const s = Math.sin(f.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}

function frameWorldPoint(q, f) {
  const dx = q.x - f.w / 2;
  const dy = q.y - f.h / 2;
  const c = Math.cos(-f.rot);
  const s = Math.sin(-f.rot);
  return { x: f.cx + dx * c - dy * s, y: f.cy + dx * s + dy * c };
}

function frameCorners(f) {
  const hw = f.w / 2;
  const hh = f.h / 2;
  // framePoint() uses f.rot to map design space into the exported world.
  // To draw that world rectangle back on the design canvas we need the
  // inverse rotation.
  const c = Math.cos(-f.rot);
  const s = Math.sin(-f.rot);
  const out = [];
  for (const [x, y] of [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]) {
    out.push({ x: f.cx + x * c - y * s, y: f.cy + x * s + y * c });
  }
  return out;
}

function frameContains(p, f, margin = 0) {
  const q = framePoint(p, f);
  return (
    q.x >= -margin &&
    q.x <= f.w + margin &&
    q.y >= -margin &&
    q.y <= f.h + margin
  );
}

function rectsOverlap(a, b) {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function pointsBounds(points, extra = 0) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x - extra);
    minY = Math.min(minY, p.y - extra);
    maxX = Math.max(maxX, p.x + extra);
    maxY = Math.max(maxY, p.y + extra);
  }
  if (!Number.isFinite(minX)) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }
  return { minX, minY, maxX, maxY };
}

function clipSegmentToRect(a, b, rect) {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const p = [-dx, dx, -dy, dy];
  const q = [
    a.x - rect.minX,
    rect.maxX - a.x,
    a.y - rect.minY,
    rect.maxY - a.y,
  ];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return null;
    } else {
      const r = q[i] / p[i];
      if (p[i] < 0) {
        if (r > t1) return null;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return null;
        if (r < t1) t1 = r;
      }
    }
  }
  return [
    { x: a.x + dx * t0, y: a.y + dy * t0 },
    { x: a.x + dx * t1, y: a.y + dy * t1 },
  ];
}

function clipPolylineToRect(points, rect) {
  const runs = [];
  let current = [];
  const flush = () => {
    if (current.length >= 2) runs.push(current);
    current = [];
  };
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const seg = clipSegmentToRect(a, b, rect);
    if (!seg) {
      flush();
      continue;
    }
    const [c, d] = seg;
    if (current.length) {
      const last = current[current.length - 1];
      if (Math.hypot(last.x - c.x, last.y - c.y) < 0.01) {
        current.push({ ...d });
      } else {
        flush();
        current = [{ ...c }, { ...d }];
      }
    } else {
      current = [{ ...c }, { ...d }];
    }
    const exits = Math.hypot(d.x - b.x, d.y - b.y) > 0.01;
    if (exits) flush();
  }
  flush();
  return runs;
}

function routeRectForFrame(f) {
  const margin = 50;
  return {
    minX: margin,
    minY: margin,
    maxX: f.w - margin,
    maxY: f.h - margin,
  };
}

function clipRouteToFrame(route, f) {
  const transformed = route.map((p) => framePoint(p, f));
  return clipPolylineToRect(transformed, routeRectForFrame(f));
}

function samplePolyline(points, step = 22) {
  const out = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  if (points.length) out.push(points[points.length - 1]);
  return out;
}

function cutHole(hole, index, allHoles, course) {
  if (
    !holeHasFrame(hole) ||
    (!holeHasGreen(hole) && !(hole.greenPolys || []).length)
  ) {
    throw new Error(`Hole ${index + 1} is incomplete.`);
  }
  const f = holeFrame(hole);
  const move = (p) => framePoint(p, f);
  const angle = (a) => normalizeAngle((Number(a) || 0) + f.rot);
  const exportRect = { minX: 0, minY: 0, maxX: f.w, maxY: f.h };
  const transformedBounds = (points, extra = 0) =>
    pointsBounds(points.map(move), extra);

  const out = {
    index: index + 1,
    name: hole.name || `Hole ${index + 1}`,
    par: hole.par,
    world: { w: f.w, h: f.h },
    tee: { ...move(hole.tee), rot: angle(hole.tee.rot) },
    pin: move(hole.pin),
    green: holeHasGreen(hole)
      ? {
          ...move(hole.green),
          rx: hole.green.rx,
          ry: hole.green.ry,
          rot: angle(hole.green.rot),
        }
      : null,
    fairway: hole.fairway.map((p) => ({ ...move(p), w: p.w })),
    fairwayPolys: (hole.fairwayPolys || []).map((poly) =>
      poly.map(([x, y]) => {
        const q = move({ x, y });
        return [q.x, q.y];
      })
    ),
    greenPolys: (hole.greenPolys || []).map((poly) =>
      poly.map(([x, y]) => {
        const q = move({ x, y });
        return [q.x, q.y];
      })
    ),
    waterPolys: hole.waterPolys.map((poly) => poly.map(([x, y]) => {
      const q = move({ x, y });
      return [q.x, q.y];
    })),
    oceanPolys: (hole.oceanPolys || []).map((poly) =>
      poly.map(([x, y]) => {
        const q = move({ x, y });
        return [q.x, q.y];
      })
    ),
    sandPolys: hole.sandPolys.map((poly) => poly.map(([x, y]) => {
      const q = move({ x, y });
      return [q.x, q.y];
    })),
    trees: hole.trees.map((t) => ({
      ...t,
      ...move(t),
      species: Number(t.species != null ? t.species : t.hue) || 0,
    })),
    props: hole.props.map((p) => ({ ...p, ...move(p), rot: angle(p.rot) })),
    roads: hole.roads.map((r) => ({
      ...r,
      points: r.points.map(move),
    })),
    flowerBeds: hole.flowerBeds.map((bed) => ({ ...bed, ...move(bed), rot: angle(bed.rot) })),
    challenges: clone(hole.challenges),
    bonusTargets: hole.bonusTargets.map((t) => {
      const item = { ...t, ...move(t) };
      if (t.drop) item.drop = move(t.drop);
      return item;
    }),
    cartRoutes: [],
    deerSpawns: [],
    rabbitTrees: [],
    squirrelTrees: [],
    duckPonds: [],
    sealColonies: [],
    penguinColonies: [],
    extraFairways: (hole.extraFairways || []).map((f) => ({
      ...f,
      points: f.points.map((p) => ({ ...move(p), w: p.w })),
    })),
    extraGreens: (hole.extraGreens || []).map((g) => ({
      ...g,
      ...move(g),
      rx: g.rx,
      ry: g.ry,
      rot: angle(g.rot),
    })),
    extraTees: (hole.extraTees || []).map((t) => ({
      ...t,
      ...move(t),
      rot: angle(t.rot),
    })),
  };

  const wildlife = (course && course.wildlife) || {
    deerSpawns: [],
    rabbitTrees: [],
    squirrelTrees: [],
    duckPonds: [],
    kangarooSpawns: [],
    galahFlocks: [],
    emuSpawns: [],
    sealColonies: [],
    penguinColonies: [],
  };
  out.deerSpawns = (wildlife.deerSpawns || [])
    .filter((s) => frameContains(s, f, 0))
    .map((s) => ({ ...s, ...move(s) }));
  out.rabbitTrees = (wildlife.rabbitTrees || [])
    .filter((s) => frameContains(s, f, 0))
    .map((s) => move(s));
  out.squirrelTrees = (wildlife.squirrelTrees || [])
    .filter((s) => frameContains(s, f, 0))
    .map((s) => move(s));
  out.duckPonds = (wildlife.duckPonds || [])
    .filter((s) => frameContains(s, f, 0))
    .map((s) => ({ ...s, ...move(s) }));
  out.kangarooSpawns = (wildlife.kangarooSpawns || [])
    .filter((s) => frameContains(s, f, 0))
    .map((s) => ({ ...s, ...move(s) }));
  out.galahFlocks = (wildlife.galahFlocks || [])
    .filter((s) => frameContains(s, f, 0))
    .map((s) => ({ ...s, ...move(s) }));
  out.emuSpawns = (wildlife.emuSpawns || [])
    .filter((s) => frameContains(s, f, 0))
    .map((s) => ({ ...s, ...move(s) }));
  out.sealColonies = (wildlife.sealColonies || [])
    .filter((s) => frameContains(s, f, 0))
    .map((s) => ({ ...s, ...move(s) }));
  out.penguinColonies = (wildlife.penguinColonies || [])
    .filter((s) => frameContains(s, f, 0))
    .map((s) => ({ ...s, ...move(s) }));
  for (const route of (course && course.cartRoutes) || []) {
    for (const run of clipRouteToFrame(route, f)) {
      out.cartRoutes.push(run);
    }
  }

  for (let hi = 0; hi < allHoles.length; hi++) {
    if (hi === index) continue;
    const other = allHoles[hi];
    const tag = hi + 1;

    // Fairways crossing this hole remain fairway for lie purposes.
    if (other.fairway.length > 1) {
      const widest = Math.max(...other.fairway.map((p) => p.w));
      const b = transformedBounds(other.fairway, widest / 2 + 20);
      if (rectsOverlap(b, exportRect)) {
        out.extraFairways.push({
          points: other.fairway.map((p) => ({ ...move(p), w: p.w })),
          hole: tag,
        });
      }
    }

    // Painted fairways from neighbouring holes are still fairway.
    for (const poly of other.fairwayPolys || []) {
      const pts = poly.map(([x, y]) => {
        const q = move({ x, y });
        return [q.x, q.y];
      });
      if (rectsOverlap(pointsBounds(pts.map(([x, y]) => ({ x, y }))), exportRect)) {
        out.fairwayPolys.push(pts);
      }
    }

    // Greens from neighbouring holes still count as putting surfaces.
    if (other.green) {
      const gc = move(other.green);
      const gr = Math.max(other.green.rx, other.green.ry) + 30;
      if (
        gc.x + gr >= 0 &&
        gc.x - gr <= f.w &&
        gc.y + gr >= 0 &&
        gc.y - gr <= f.h
      ) {
        out.extraGreens.push({
          ...gc,
          rx: other.green.rx,
          ry: other.green.ry,
          rot: angle(other.green.rot),
          hole: tag,
        });
      }
    }
    for (const poly of other.greenPolys || []) {
      const pts = poly.map(([x, y]) => {
        const q = move({ x, y });
        return [q.x, q.y];
      });
      if (rectsOverlap(pointsBounds(pts.map(([x, y]) => ({ x, y }))), exportRect)) {
        out.greenPolys.push(pts);
      }
    }

    const tc = move(other.tee);
    if (tc.x >= -110 && tc.x <= f.w + 110 && tc.y >= -110 && tc.y <= f.h + 110) {
      out.extraTees.push({ ...tc, rot: angle(other.tee.rot), hole: tag });
    }

    const pushPoly = (poly) => {
      if (poly.length < 3) return;
      const pts = poly.map(([x, y]) => move({ x, y }));
      if (rectsOverlap(pointsBounds(pts), exportRect)) {
        out.waterPolys.push(pts.map((p) => [p.x, p.y]));
      }
    };
    for (const poly of other.waterPolys) pushPoly(poly);

    const pushSand = (poly) => {
      if (poly.length < 3) return;
      const pts = poly.map(([x, y]) => move({ x, y }));
      if (rectsOverlap(pointsBounds(pts), exportRect)) {
        out.sandPolys.push(pts.map((p) => [p.x, p.y]));
      }
    };
    for (const poly of other.sandPolys) pushSand(poly);

    for (const t of other.trees) {
      const p = move(t);
      if (p.x + t.r >= 0 && p.x - t.r <= f.w && p.y + t.r >= 0 && p.y - t.r <= f.h) {
        out.trees.push({ ...t, ...p, species: Number(t.species != null ? t.species : t.hue) || 0 });
      }
    }

    for (const prop of other.props) {
      const p = move(prop);
      const meta = PROP_TYPES[prop.type] || PROP_TYPES.shed;
      const r = Math.max(meta.w, meta.h) * prop.scale * 0.7;
      if (p.x + r >= 0 && p.x - r <= f.w && p.y + r >= 0 && p.y - r <= f.h) {
        out.props.push({ ...prop, ...p, rot: angle(prop.rot) });
      }
    }

    for (const road of other.roads) {
      const pts = road.points.map(move);
      if (rectsOverlap(pointsBounds(pts, road.width / 2 + 10), exportRect)) {
        out.roads.push({ ...road, points: pts });
      }
    }

    for (const bed of other.flowerBeds) {
      const p = move(bed);
      const r = Math.max(bed.rx, bed.ry) + 12;
      if (p.x + r >= 0 && p.x - r <= f.w && p.y + r >= 0 && p.y - r <= f.h) {
        out.flowerBeds.push({ ...bed, ...p, rot: angle(bed.rot) });
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------- import/export
function roundPoint(p) {
  return { x: round1(p.x), y: round1(p.y) };
}

function roundFairway(points) {
  return points.map((p) => ({ x: round1(p.x), y: round1(p.y), w: round1(p.w) }));
}

function courseExportBlocker() {
  for (let i = 0; i < state.course.holes.length; i++) {
    const hole = state.course.holes[i];
    if (!holeHasTee(hole)) return `Hole ${i + 1} has no tee.`;
    if (!holeHasPin(hole)) return `Hole ${i + 1} has no pin.`;
    if (!holeHasGreen(hole) && !(hole.greenPolys || []).length) {
      return `Hole ${i + 1} has no green.`;
    }
    if (!holeFairwaySegments(hole).length && !(hole.fairwayPolys || []).length) {
      return `Hole ${i + 1} has no fairway.`;
    }
  }
  return "";
}

function runCourseAnalysis() {
  analysisResult = analyseCourse(state.course.holes, {});
  renderCourseAnalysis();
  return analysisResult;
}

function renderCourseAnalysis() {
  if (!analysisResult) return;
  const analysis = analysisResult;
  const mismatches = analysis.holeMetrics.filter(
    (metric, index) =>
      state.course.holes[index] &&
      Number(state.course.holes[index].par) !== metric.suggestedPar
  ).length;
  analysisSummary.innerHTML = [
    ["HOLES", analysis.holes],
    ["PAR", `${analysis.par} → ${analysis.suggestedPar}`],
    ["RATING", analysis.rating.toFixed(1)],
    ["SLOPE", analysis.slope],
    ["DIFFICULTY", analysis.difficulty.toUpperCase()],
    [
      "NPC NET",
      `${analysis.field.best} · ${analysis.field.median} · ${analysis.field.worst}`,
    ],
    [
      "NPC GROSS",
      `${analysis.grossField?.best ?? "—"} · ${
        analysis.grossField?.median ?? "—"
      } · ${analysis.grossField?.worst ?? "—"}`,
    ],
  ]
    .map(
      ([label, value]) =>
        `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(
          String(value)
        )}</b></div>`
    )
    .join("");
  analysisHoles.innerHTML = analysis.holeMetrics
    .map((metric, index) => {
      const par = Number(state.course.holes[index]?.par) || 4;
      const changed = par !== metric.suggestedPar;
      return `
        <div class="ed-analysis-row ${changed ? "warn" : ""}">
          <span class="an-hole">HOLE ${index + 1}</span>
          <span>${Math.round(metric.length)} m</span>
          <span class="an-exp">${Number(metric.expectedScratch).toFixed(1)}</span>
          <span>PAR ${par}</span>
          <span class="an-suggest">${changed ? `→ ${metric.suggestedPar}` : "OK"}</span>
          <span class="an-si">SI ${metric.strokeIndex}</span>
        </div>`;
    })
    .join("");
  analysisNpcs.innerHTML = `
    <div class="ed-analysis-npcs-title">PRO REFERENCE + NPC FIELD · 200 ROUNDS EACH</div>
    <div class="ed-analysis-npc-row head">
      <span>PLAYER</span><span>HCP</span><span>SIM</span><span>GROSS</span><span>PTS</span>
    </div>
    <div class="ed-analysis-npc-row pro">
      <span>PRO REFERENCE</span><span>0</span><span>0</span><span>${
        analysis.pro?.averageGross ?? "—"
      }</span><span>${analysis.pro?.suggestedPar ?? "—"}</span>
    </div>
    ${(analysis.npcs || [])
      .map(
        (npc) => `
      <div class="ed-analysis-npc-row">
        <span>${escapeHtml(npc.name)}</span>
        <span>${npc.targetHandicap}</span>
        <span>${npc.simulatedHandicap}</span>
        <span>${npc.averageGross}</span>
        <span>${npc.averagePoints}</span>
      </div>`
      )
      .join("")}`;
  analysisNote.textContent = mismatches
    ? `${mismatches} hole${mismatches === 1 ? "" : "s"} look off for how the course plays. Apply the suggested pars to fix the course card.`
    : "Every hole par matches the simulated scratch score. The rating is ready to export.";
  analysisApplyBtn.disabled = !mismatches;
}

function openAnalysisDialog() {
  runCourseAnalysis();
  analysisDialog.classList.remove("hidden");
}

function closeAnalysisDialog() {
  analysisDialog.classList.add("hidden");
}

function applySuggestedPars() {
  if (!analysisResult) return;
  let changed = 0;
  analysisResult.holeMetrics.forEach((metric, index) => {
    const hole = state.course.holes[index];
    if (!hole || hole.par === metric.suggestedPar) return;
    hole.par = metric.suggestedPar;
    changed += 1;
  });
  if (!changed) return;
  applyCourse();
  commit();
  refreshUI();
  requestRender();
  setStatus(
    `Applied suggested pars to ${changed} hole${changed === 1 ? "" : "s"}`
  );
  runCourseAnalysis();
}

function courseMapBounds() {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const hole of state.course.holes) {
    const e = holeExtent(hole);
    if (!e || !Number.isFinite(e.minX)) continue;
    minX = Math.min(minX, e.minX);
    minY = Math.min(minY, e.minY);
    maxX = Math.max(maxX, e.maxX);
    maxY = Math.max(maxY, e.maxY);
  }
  if (!Number.isFinite(minX)) return designBounds();
  const pad = 180;
  return {
    minX: Math.floor(minX - pad),
    minY: Math.floor(minY - pad),
    maxX: Math.ceil(maxX + pad),
    maxY: Math.ceil(maxY + pad),
  };
}

function renderCourseMapImage(selectedBounds = null) {
  const bounds = selectedBounds || courseMapBounds();
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  const scale = Math.min(3, 1280 / Math.max(w, h));
  let outW = Math.max(1, Math.round(w * scale));
  let outH = Math.max(1, Math.round(h * scale));
  const longEdge = Math.max(outW, outH);
  if (longEdge < 480) {
    const up = 480 / longEdge;
    outW = Math.round(outW * up);
    outH = Math.round(outH * up);
  }
  const mapCanvas = document.createElement("canvas");
  mapCanvas.width = outW;
  mapCanvas.height = outH;
  const mapCtx = mapCanvas.getContext("2d");
  const saved = {
    ctx,
    zoom: state.zoom,
    panX: state.panX,
    panY: state.panY,
  };
  ctx = mapCtx;
  state.zoom = Math.min(outW / w, outH / h) * 0.98;
  state.panX = (outW - w * state.zoom) / 2 - bounds.minX * state.zoom;
  state.panY = (outH - h * state.zoom) / 2 - bounds.minY * state.zoom;
  try {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = "#0d2115";
    ctx.fillRect(0, 0, outW, outH);
    ctx.fillStyle = "#2f662c";
    ctx.fillRect(
      state.panX + bounds.minX * state.zoom,
      state.panY + bounds.minY * state.zoom,
      w * state.zoom,
      h * state.zoom
    );
    ctx.save();
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
    for (const hole of state.course.holes) {
      drawHoleDesign(hole, true);
    }
    ctx.restore();
  } finally {
    ctx = saved.ctx;
    state.zoom = saved.zoom;
    state.panX = saved.panX;
    state.panY = saved.panY;
  }
  let url = mapCanvas.toDataURL("image/webp", 0.82);
  if (!url.startsWith("data:image/webp")) {
    url = mapCanvas.toDataURL("image/jpeg", 0.86);
  }
  return url;
}

function exportCourse() {
  const blocker = courseExportBlocker();
  if (blocker) throw new Error(blocker);
  const analysis = analyseCourse(state.course.holes, {});
  return {
    version: 2,
    id: slugify(state.course.id),
    name: state.course.name || "My Course",
    theme: state.course.theme || "verdant",
    environment: state.course.environment || "canadian",
    mapImage: state.exportMapImage || renderCourseMapImage(),
    analysis: {
      version: analysis.version,
      holes: analysis.holes,
      par: analysis.par,
      suggestedPar: analysis.suggestedPar,
      rating: analysis.rating,
      slope: analysis.slope,
      difficulty: analysis.difficulty,
      suggestedPars: analysis.holeMetrics.map((metric) => metric.suggestedPar),
      strokeIndex: analysis.holeMetrics.map((metric) => metric.strokeIndex),
      field: analysis.field,
      grossField: analysis.grossField,
      pro: analysis.pro,
      npcs: analysis.npcs,
    },
    holes: state.course.holes.map((hole, index) => {
      const cut = cutHole(hole, index, state.course.holes, state.course);
      return {
        ...cut,
        tee: { ...roundPoint(cut.tee), rot: round1(cut.tee.rot || 0) },
        pin: roundPoint(cut.pin),
        green: cut.green
          ? {
              ...roundPoint(cut.green),
              rx: round1(cut.green.rx),
              ry: round1(cut.green.ry),
              rot: round1(cut.green.rot),
            }
          : null,
        fairway: roundFairway(cut.fairway),
        fairwayPolys: cut.fairwayPolys.map((poly) =>
          poly.map(([x, y]) => [round1(x), round1(y)])
        ),
        greenPolys: cut.greenPolys.map((poly) =>
          poly.map(([x, y]) => [round1(x), round1(y)])
        ),
        waterPolys: cut.waterPolys.map((poly) => poly.map(([x, y]) => [round1(x), round1(y)])),
        oceanPolys: (cut.oceanPolys || []).map((poly) =>
          poly.map(([x, y]) => [round1(x), round1(y)])
        ),
        sandPolys: cut.sandPolys.map((poly) => poly.map(([x, y]) => [round1(x), round1(y)])),
        trees: cut.trees.map((t) => ({
          x: round1(t.x),
          y: round1(t.y),
          r: round1(t.r),
          hue: t.species || 0,
          species: t.species || 0,
        })),
        props: cut.props.map((p) => ({ ...p, x: round1(p.x), y: round1(p.y), rot: round1(p.rot || 0), scale: round1(p.scale) })),
        roads: cut.roads.map((r) => ({ ...r, points: r.points.map(roundPoint), width: round1(r.width) })),
        flowerBeds: cut.flowerBeds.map((f) => ({
          ...f,
          x: round1(f.x),
          y: round1(f.y),
          rx: round1(f.rx),
          ry: round1(f.ry),
          rot: round1(f.rot || 0),
        })),
        bonusTargets: cut.bonusTargets.map((t) => ({
          ...t,
          x: round1(t.x),
          y: round1(t.y),
          drop: t.drop ? roundPoint(t.drop) : undefined,
        })),
        cartRoutes: cut.cartRoutes.map((route) => route.map(roundPoint)),
        deerSpawns: cut.deerSpawns.map((s) => ({ ...s, x: round1(s.x), y: round1(s.y), radius: round1(s.radius) })),
        rabbitTrees: cut.rabbitTrees.map(roundPoint),
        squirrelTrees: cut.squirrelTrees.map(roundPoint),
        duckPonds: cut.duckPonds.map((s) => ({ ...s, x: round1(s.x), y: round1(s.y), radius: round1(s.radius) })),
        kangarooSpawns: cut.kangarooSpawns.map((s) => ({ ...s, x: round1(s.x), y: round1(s.y), radius: round1(s.radius) })),
        galahFlocks: cut.galahFlocks.map((s) => ({ ...s, x: round1(s.x), y: round1(s.y), radius: round1(s.radius) })),
        emuSpawns: cut.emuSpawns.map((s) => ({ ...s, x: round1(s.x), y: round1(s.y), radius: round1(s.radius) })),
        sealColonies: cut.sealColonies.map((s) => ({ ...s, x: round1(s.x), y: round1(s.y), radius: round1(s.radius) })),
        penguinColonies: cut.penguinColonies.map((s) => ({ ...s, x: round1(s.x), y: round1(s.y), radius: round1(s.radius) })),
        extraFairways: cut.extraFairways.map((f) => ({ hole: f.hole, points: roundFairway(f.points) })),
        extraGreens: cut.extraGreens.map((g) => ({
          ...g,
          x: round1(g.x),
          y: round1(g.y),
          rx: round1(g.rx),
          ry: round1(g.ry),
          rot: round1(g.rot || 0),
        })),
        extraTees: cut.extraTees.map((t) => ({ ...t, x: round1(t.x), y: round1(t.y), rot: round1(t.rot || 0) })),
        bunkers: [],
        pond: [],
      };
    }),
  };
}

// User-facing package: .glfpkt is JSON with a small, versioned wrapper.
// `meta` is additive: older builds ignore it (they read `.course` only).
function exportPackage() {
  return {
    format: PACKAGE_FORMAT,
    formatVersion: PACKAGE_VERSION,
    createdAt: new Date().toISOString(),
    meta: normaliseMeta(state.meta),
    course: exportCourse(),
  };
}

// Saves keep the full design-space course; only EXPORT cuts holes.
function serialiseCourse() {
  return JSON.parse(
    JSON.stringify({
      version: 2,
      id: slugify(state.course.id),
      name: state.course.name || "My Course",
      theme: state.course.theme || "verdant",
      environment: state.course.environment || "canadian",
      design: { ...designBounds() },
      wildlife: state.course.wildlife,
      cartRoutes: state.course.cartRoutes,
      holes: state.course.holes,
    })
  );
}

function serialiseDesign() {
  return serialiseCourse();
}

// A part file is the complete resumable editor state: unfinished holes, the
// design bounds, and where the author was looking. No map render, so parts stay
// small enough to email.
function serialisePart() {
  const now = new Date().toISOString();
  if (!state.partCreatedAt) state.partCreatedAt = now;
  return {
    format: PART_FORMAT,
    formatVersion: PART_VERSION,
    createdAt: state.partCreatedAt,
    updatedAt: now,
    meta: normaliseMeta(state.meta),
    editor: {
      holeIndex: state.holeIndex,
      tool: state.tool,
      view: { zoom: state.zoom, panX: state.panX, panY: state.panY },
      settings: { ...state.settings },
    },
    course: serialiseCourse(),
  };
}

function readLibrary() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIBRARY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn("Could not read saved courses", err);
    return [];
  }
}

function writeLibrary(entries) {
  localStorage.setItem(LIBRARY_KEY, JSON.stringify(entries));
}

function savedDateLabel(timestamp) {
  if (!timestamp) return "unknown time";
  const d = new Date(timestamp);
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  }) + " " + d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function saveCurrentCourse() {
  try {
    const data = serialiseCourse();
    const entries = readLibrary();
    const entry = {
      course: data,
      holeIndex: state.holeIndex,
      meta: normaliseMeta(state.meta),
      view: { zoom: state.zoom, panX: state.panX, panY: state.panY },
      settings: { ...state.settings },
      savedAt: Date.now(),
    };
    const index = entries.findIndex((item) => item.course?.id === data.id);
    if (index >= 0) entries[index] = entry;
    else entries.push(entry);
    entries.sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    writeLibrary(entries);
    state.dirty = false;
    setStatus(
      `Saved “${data.name}” locally · ${data.holes.length} holes · hole ${
        state.holeIndex + 1
      } — use SAVE FILE to keep a copy outside this browser`
    );
  } catch (err) {
    console.error(err);
    setStatus(`Save failed: ${err.message}`, "error");
  }
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function partFileName() {
  const id = slugify(state.course?.id || state.course?.name || "course");
  return `${id || "course"}.glfppart`;
}

// Applies the resumable editor half of a part (or library entry).
function applyEditorSnapshot(snapshot) {
  const source = snapshot && typeof snapshot === "object" ? snapshot : {};
  const holes = state.course?.holes?.length || 0;
  state.holeIndex = holes
    ? clamp(Math.floor(Number(source.holeIndex) || 0), 0, holes - 1)
    : 0;
  if (source.settings && typeof source.settings === "object") {
    for (const [key, value] of Object.entries(source.settings)) {
      if (
        Object.prototype.hasOwnProperty.call(state.settings, key) &&
        value !== null &&
        value !== undefined
      ) {
        state.settings[key] = value;
      }
    }
  }
  const view = source.view;
  const restoredView =
    view && Number.isFinite(Number(view.zoom)) && Number.isFinite(Number(view.panX));
  if (restoredView) {
    state.zoom = clamp(Number(view.zoom), MIN_ZOOM, MAX_ZOOM);
    state.panX = Number(view.panX) || 0;
    state.panY = Number(view.panY) || 0;
  }
  const tool = typeof source.tool === "string" && TOOLS[source.tool] ? source.tool : "pan";
  return { restoredView, tool };
}

function afterSnapshotLoad(snapshot) {
  const { restoredView, tool } = applyEditorSnapshot(snapshot);
  state.fairwayDraft = null;
  state.routeDraft = null;
  state.roadDraft = null;
  state.selectedRoute = -1;
  state.pendingDropIndex = -1;
  state.exportMapImage = null;
  resetHistory();
  setTool(tool);
  applyCourse();
  refreshUI();
  if (!restoredView) fitView();
  requestRender();
}

function downloadFile(text, filename, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// SAVE FILE: writes the complete resumable state to disk. Works at any point,
// including with zero finished holes.
async function savePartFile() {
  try {
    const part = serialisePart();
    const text = JSON.stringify(part, null, 2);
    const filename = partFileName();
    const holes = part.course.holes.length;
    if (window.showSaveFilePicker) {
      try {
        let handle = await Store.getItem(PART_HANDLE_KEY);
        const suggestion = { suggestedName: filename, types: [
          { description: "GolfPocket course part", accept: { "application/json": [".glfppart"] } },
        ] };
        if (handle) {
          const permission = (await handle.queryPermission?.({ mode: "readwrite" })) || "prompt";
          if (permission !== "granted") {
            handle = (await handle.requestPermission?.({ mode: "readwrite" })) === "granted"
              ? handle
              : null;
          }
        }
        if (!handle) {
          handle = await window.showSaveFilePicker(suggestion);
          await Store.setItem(PART_HANDLE_KEY, handle);
        }
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
        state.dirty = false;
        setStatus(
          `Saved “${handle.name}” · ${holes} hole${holes === 1 ? "" : "s"} · ${formatBytes(
            text.length
          )}`
        );
        return;
      } catch (err) {
        if (err && err.name === "AbortError") {
          setStatus("Save cancelled.");
          return;
        }
        // A stale file handle should not block every future save.
        await Store.removeItem(PART_HANDLE_KEY);
        // Fall through to a download if the picker is unavailable or blocked.
      }
    }
    downloadFile(text, filename, "application/x-golfpocket-part");
    state.dirty = false;
    setStatus(
      `Downloaded ${filename} · ${holes} hole${holes === 1 ? "" : "s"} · ${formatBytes(
        text.length
      )}`
    );
  } catch (err) {
    console.error(err);
    setStatus(`Could not save the part: ${err.message}`, "error");
  }
}

function renderSavedCourses() {
  const entries = readLibrary();
  if (!entries.length) {
    savedCourseList.innerHTML =
      '<div class="ed-empty">No saved courses yet. Edit a course and press SAVE.</div>';
    return;
  }
  savedCourseList.innerHTML = entries
    .map((entry, i) => {
      const course = entry.course || {};
      const holes = Array.isArray(course.holes) ? course.holes.length : 0;
      const par = Array.isArray(course.holes)
        ? course.holes.reduce((total, hole) => total + (Number(hole.par) || 0), 0)
        : 0;
      const holeIndex = Math.min(
        Math.max(0, Number(entry.holeIndex) || 0),
        Math.max(0, holes - 1)
      );
      return `
        <div class="ed-saved-row">
          <span class="saved-copy">
            <b>${escapeHtml(course.name || course.id || "Untitled course")}</b>
            <small>${escapeHtml(course.id || "no-id")} · ${holes} holes · par ${par} · ${savedDateLabel(
              entry.savedAt
            )}</small>
            <em>EDITING HOLE ${holeIndex + 1}</em>
          </span>
          <button type="button" class="load" data-load-course="${i}">LOAD</button>
          <button type="button" class="del" data-del-course="${i}">DEL</button>
        </div>`;
    })
    .join("");
}

function openLibraryDialog() {
  renderSavedCourses();
  libraryDialog.classList.remove("hidden");
}

function closeLibraryDialog() {
  libraryDialog.classList.add("hidden");
}

function loadSavedCourse(index) {
  const entries = readLibrary();
  const entry = entries[index];
  if (!entry || !entry.course) {
    setStatus("That saved course could not be found.", "warn");
    return;
  }
  try {
    state.course = normaliseCourse(clone(entry.course));
    state.meta = normaliseMeta(entry.meta);
    state.partCreatedAt = null;
    afterSnapshotLoad(entry);
    closeLibraryDialog();
    setStatus(`Loaded “${state.course.name}” from local saves`);
  } catch (err) {
    console.error(err);
    setStatus(`Load failed: ${err.message}`, "error");
  }
}

function deleteSavedCourse(index) {
  const entries = readLibrary();
  const entry = entries[index];
  if (!entry) return;
  const name = entry.course?.name || entry.course?.id || "this course";
  if (!window.confirm(`Delete the local save for “${name}”?`)) return;
  entries.splice(index, 1);
  writeLibrary(entries);
  renderSavedCourses();
  setStatus("Local save deleted");
}

function beginMapSelection() {
  if (!state.course.holes.length) {
    setStatus("Nothing to export yet.", "warn");
    return;
  }
  const blocker = courseExportBlocker();
  if (blocker) {
    setStatus(`${blocker} Finish every hole before exporting.`, "error");
    return;
  }
  state.exportMapImage = null;
  fitView();
  state.mapSelect = {
    dragging: false,
    start: null,
    end: null,
  };
  if (mapSelectConfirmBtn) mapSelectConfirmBtn.disabled = true;
  mapSelectBar?.classList.remove("hidden");
  canvas.style.cursor = "crosshair";
  setStatus("Drag a box around the course for the round picture.");
  requestRender();
}

function cancelMapSelection() {
  state.mapSelect = null;
  mapSelectBar?.classList.add("hidden");
  canvas.style.cursor = "grab";
  setStatus("Export cancelled.");
  requestRender();
}

function confirmMapSelection() {
  const sel = state.mapSelect;
  const a = sel?.start;
  const b = sel?.end;
  if (!a || !b) {
    setStatus("Drag a box around the course first.", "warn");
    return;
  }
  const bounds = {
    minX: Math.floor(Math.min(a.x, b.x)),
    minY: Math.floor(Math.min(a.y, b.y)),
    maxX: Math.ceil(Math.max(a.x, b.x)),
    maxY: Math.ceil(Math.max(a.y, b.y)),
  };
  if (bounds.maxX - bounds.minX < 200 || bounds.maxY - bounds.minY < 200) {
    setStatus("That box is too small. Drag a bigger area.", "warn");
    return;
  }
  state.exportMapImage = renderCourseMapImage(bounds);
  state.mapSelect = null;
  mapSelectBar?.classList.add("hidden");
  canvas.style.cursor = "grab";
  requestRender();
  finishExport();
}

function downloadExport() {
  beginMapSelection();
}

function finishExport() {
  const pkg = exportPackage();
  setStatus(`Ready to export ${pkg.course.id}.glfpkt`);
  showExportDialog(pkg);
}

function showExportDialog(pkg) {
  publishPackage = pkg;
  publishData = pkg.course;
  const data = pkg.course;
  const holes = Array.isArray(data.holes) ? data.holes.length : 0;
  const par = Array.isArray(data.holes)
    ? data.holes.reduce((total, hole) => total + (Number(hole.par) || 0), 0)
    : 0;
  const meta = normaliseMeta(pkg.meta);
  publishFileName.textContent = `${data.id}.glfpkt`;
  publishSummaryInput.value = meta.summary;
  if (meta.unlock.after) {
    publishUnlockMode.value = "after";
    publishAfterInput.value = meta.unlock.after;
    publishTrophiesInput.value = String(meta.unlock.trophies || 0);
  } else if (meta.unlock.trophies && !meta.unlock.starter) {
    publishUnlockMode.value = "trophies";
    publishAfterInput.value = "";
    publishTrophiesInput.value = String(meta.unlock.trophies);
  } else {
    publishUnlockMode.value = "starter";
    publishAfterInput.value = "";
    publishTrophiesInput.value = "0";
  }
  publishCopyStatus.textContent = "";
  publishFileName.dataset.id = data.id;
  publishFileName.dataset.name = data.name || data.id;
  publishFileName.dataset.environment = data.environment || "canadian";
  publishFileName.dataset.holes = String(holes);
  publishFileName.dataset.par = String(par);
  syncPublishFields();
  publishDialog.classList.remove("hidden");
}

function readExportMeta() {
  const mode = publishUnlockMode?.value || "starter";
  const summary = publishSummaryInput?.value.trim() || "";
  const unlock = { starter: true };
  if (mode === "after") {
    unlock.after = publishAfterInput?.value.trim() || "";
    const trophies = Math.max(0, Math.floor(Number(publishTrophiesInput?.value) || 0));
    if (trophies > 0) unlock.trophies = trophies;
  } else if (mode === "trophies") {
    unlock.trophies = Math.max(1, Math.floor(Number(publishTrophiesInput?.value) || 1));
  }
  return normaliseMeta({ summary, unlock });
}

function updateExportPreview() {
  state.meta = readExportMeta();
  if (publishPackage) publishPackage.meta = normaliseMeta(state.meta);
  if (!publishManifest) return;
  const size = publishPackage ? JSON.stringify(publishPackage).length : 0;
  const holes = publishPackage?.course?.holes?.length || 0;
  publishManifest.textContent = JSON.stringify(
    {
      file: publishFileName.dataset.id ? `${publishFileName.dataset.id}.glfpkt` : "",
      holes,
      size: formatBytes(size),
      meta: normaliseMeta(state.meta),
    },
    null,
    2
  );
}

function syncPublishFields() {
  const mode = publishUnlockMode?.value || "starter";
  publishAfterField?.classList.toggle("hidden", mode !== "after");
  publishTrophiesField?.classList.toggle("hidden", mode === "starter");
  updateExportPreview();
}

// The only way a finished course leaves the editor: one self-contained file
// that the game can import. No server, no manifest to maintain.
function downloadExportPackage() {
  if (!publishPackage) return;
  state.meta = readExportMeta();
  const pkg = { ...publishPackage, meta: normaliseMeta(state.meta) };
  const text = JSON.stringify(pkg, null, 2);
  const filename = `${pkg.course.id}.glfpkt`;
  downloadFile(text, filename, "application/x-golfpocket-course");
  state.dirty = false;
  publishCopyStatus.textContent = `Downloaded ${filename} · ${formatBytes(
    text.length
  )}. Send it to a friend — they import it from the game's Settings screen.`;
}

function closePublishDialog() {
  publishDialog.classList.add("hidden");
}

// ---------------------------------------------------------------- preview
// Preview works on the current hole alone, so a course can be inspected while
// the other 17 holes are still empty.
function previewBlocker(hole) {
  const number = state.holeIndex + 1;
  if (!hole) return "There is no hole to preview.";
  if (!holeHasTee(hole)) return `Hole ${number} has no tee yet.`;
  if (!holeHasPin(hole)) return `Hole ${number} has no pin yet.`;
  if (!holeHasGreen(hole) && !(hole.greenPolys || []).length) {
    return `Hole ${number} needs a green before it can be previewed.`;
  }
  return "";
}

let previewSession = null;

function stopPreview() {
  if (previewSession) {
    previewSession.stop();
    previewSession = null;
  }
}

// The hole is cut into its portrait world and drawn by the game's own course
// painter, so what you see is what the course looks like in play.
function showPreview() {
  const index = state.holeIndex;
  const blocker = previewBlocker(state.course.holes[index]);
  if (blocker) {
    setStatus(blocker, "error");
    return;
  }
  try {
    const cut = cutHole(state.course.holes[index], index, state.course.holes, state.course);
    previewOverlay.classList.remove("hidden");
    if (previewTitleHole) {
      previewTitleHole.textContent = `HOLE ${index + 1} · AS PLAYED`;
    }
    stopPreview();
    previewCanvas.width = 0;
    previewCanvas.height = 0;
    setStatus(`Rendering hole ${index + 1}…`);
    try {
      previewSession = startHolePreview(previewCanvas, {
        hole: { ...cut, index: index + 1 },
        theme: state.course.theme || "verdant",
        environment: state.course.environment || "canadian",
      });
      setStatus(`Previewing hole ${index + 1} — ${state.course.theme || "verdant"} theme`);
    } catch (err) {
      console.error(err);
      setStatus(`Preview failed: ${err.message}`, "error");
      hidePreview();
    }
  } catch (err) {
    console.error(err);
    setStatus(`Preview failed: ${err.message}`, "error");
  }
}

function hidePreview() {
  stopPreview();
  previewOverlay.classList.add("hidden");
  if (state.course?.holes?.length) {
    setStatus(`Editing ${currentHole().name}`);
  }
}

// ---------------------------------------------------------------- loading
// Accepts a .glfppart (resume exactly where the author left off), a .glfpkt,
// or legacy game-ready JSON (opened for editing).
function loadCourseFileData(raw) {
  const part = unwrapPartPackage(raw);
  state.course = normaliseCourse(raw);
  state.meta = normaliseMeta(raw.meta);
  state.partCreatedAt = part ? raw.createdAt || null : null;
  if (!state.course.holes.length) {
    state.course.holes.push(defaultHole(0));
    reindexHoles();
  }
  if (part) {
    afterSnapshotLoad(raw.editor);
  } else {
    state.holeIndex = 0;
    state.fairwayDraft = null;
    state.routeDraft = null;
    state.roadDraft = null;
    state.selectedRoute = -1;
    state.pendingDropIndex = -1;
    resetHistory();
    applyCourse();
    refreshUI();
    fitView();
  }
  return Boolean(part);
}

function importJSONFile(file) {
  return file
    .text()
    .then((text) => {
      const raw = JSON.parse(text);
      const wasPart = loadCourseFileData(raw);
      const holes = state.course.holes.length;
      setStatus(
        `${wasPart ? "Resumed" : "Opened"} “${state.course.name}” · ${holes} hole${
          holes === 1 ? "" : "s"
        }${wasPart ? ` · hole ${state.holeIndex + 1}` : ""}`
      );
    })
    .catch((err) => {
      console.error(err);
      setStatus(`Could not open that file: ${err.message}`, "error");
    });
}

// ---------------------------------------------------------------- events
toolbar.addEventListener("click", (event) => {
  const button = event.target.closest(".tool");
  if (button) setTool(button.dataset.tool);
});

toolSettings.addEventListener("input", (event) => {
  const input = event.target.closest("[data-setting]");
  if (!input) return;
  const key = input.dataset.setting;
  const stringKeys = new Set([
    "targetType",
    "targetLabel",
    "propType",
    "roadStyle",
    "fairwayMode",
    "greenMode",
  ]);
  let value = stringKeys.has(key) ? input.value : Number(input.value);
  state.settings[key] = value;
  const valueEl = toolSettings.querySelector(`[data-value="${key}"]`);
  if (valueEl) {
    valueEl.textContent = `${value}${key === "greenRot" ? "°" : ""}`;
  }
  if (key.startsWith("green")) {
    const hole = currentHole();
    if (holeHasGreen(hole)) {
      if (key === "greenRx") hole.green.rx = Math.max(20, value);
      if (key === "greenRy") hole.green.ry = Math.max(16, value);
      if (key === "greenRot") hole.green.rot = (value * Math.PI) / 180;
    }
    requestRender();
  } else if (key === "teeRot") {
    if (holeHasTee(currentHole())) {
      currentHole().tee.rot = (value * Math.PI) / 180;
    }
    requestRender();
  } else {
    requestRender();
  }
  drawSizeGuide();
});

function handleReferenceSetting(event) {
  const input = event.target.closest("[data-reference]");
  if (!input || !state.reference) return;
  const key = input.dataset.reference;
  const ref = state.reference;
  if (key === "opacity") {
    ref.opacity = clamp(Number(input.value) / 100, 0.05, 1);
  } else if (key === "width") {
    ref.w = clamp(Number(input.value) || 1, 40, 20000);
    if (ref.lockAspect) ref.h = ref.w / ref.aspect;
    else ref.aspect = ref.w / ref.h;
  } else if (key === "height") {
    ref.h = clamp(Number(input.value) || 1, 40, 20000);
    if (ref.lockAspect) ref.w = ref.h * ref.aspect;
    else ref.aspect = ref.w / ref.h;
  } else if (key === "rot") {
    ref.rot = (Number(input.value) * Math.PI) / 180;
  } else if (key === "lockAspect") {
    ref.lockAspect = !!input.checked;
    if (ref.lockAspect) ref.aspect = ref.w / ref.h;
  }
  syncReferenceInputs();
  drawSizeGuide();
  requestRender();
}
toolSettings.addEventListener("input", handleReferenceSetting);
toolSettings.addEventListener("change", handleReferenceSetting);

toolSettings.addEventListener("change", (event) => {
  const input = event.target.closest("[data-setting]");
  if (!input) return;
  const key = input.dataset.setting;
  if (key.startsWith("green") || key === "teeRot") {
    applyCourse();
    commit();
    renderStats();
    if (key === "teeRot") {
      setStatus(`Tee rotation set to ${Math.round(Number(input.value))}°`);
    }
  } else if (
    key === "propType" ||
    key === "roadStyle" ||
    key === "fairwayMode" ||
    key === "greenMode"
  ) {
    state.fairwayDraft = null;
    state.fairwayEditTarget = null;
    state.stroke = null;
    renderToolSettings();
    requestRender();
  }
});

toolSettings.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "finish-draft") finishFairway();
  if (action === "load-fairway") loadCurrentFairway();
  if (action === "edit-fairway-segment") {
    loadFairwaySegment(Number(button.dataset.segment));
  }
  if (action === "open-reference") referenceFileInput.click();
  if (action === "fit-reference") fitReferenceToDesign();
  if (action === "remove-reference") {
    state.reference = null;
    renderToolSettings();
    requestRender();
    setStatus("Reference image removed");
  }
  if (action === "new-fairway-segment") {
    state.fairwayDraft = null;
    state.fairwayEditTarget = null;
    renderToolSettings();
    requestRender();
    setStatus("Click the course to start a new fairway segment");
  }
  if (action === "delete-fairway-segment") {
    const index = Number(button.dataset.segment);
    editHole(() => {
      const h = currentHole();
      const segment = holeFairwaySegments(h)[index];
      if (!segment) return;
      if (segment.owner === "primary") {
        if (Array.isArray(h.extraFairways) && h.extraFairways.length) {
          h.fairway = h.extraFairways.shift().points;
        } else {
          h.fairway = [];
        }
      } else if (Array.isArray(h.extraFairways)) {
        h.extraFairways.splice(segment.extraIndex, 1);
      }
    });
    setStatus("Fairway segment deleted");
  }
  if (action === "clear-fairway") {
    state.fairwayDraft = null;
    editHole(() => {
      currentHole().fairway = [];
      currentHole().extraFairways = [];
    });
    setStatus("All fairway segments cleared");
  }
  if (action === "clear-painted-fairway") {
    editHole(() => {
      currentHole().fairwayPolys = [];
    });
    setStatus("Painted fairway cleared");
  }
  if (action === "clear-painted-green") {
    editHole(() => {
      currentHole().greenPolys = [];
    });
    setStatus("Painted green cleared");
  }
  if (action === "finish-route") finishRoute();
  if (action === "finish-road") finishRoad();
  if (action === "clear-roads") {
    state.roadDraft = null;
    editHole(() => {
      currentHole().roads = [];
    });
    setStatus("Roads cleared");
  }
  if (action === "clear-route") {
    state.routeDraft = null;
    editHole(() => {
      state.course.cartRoutes = [];
      state.selectedRoute = -1;
    });
    setStatus("All course cart routes cleared");
  }
  if (action === "clear-targets") {
    editHole(() => {
      currentHole().bonusTargets = [];
    });
    setStatus("Bonus targets cleared on this hole");
  }
});

challengeListEl.addEventListener("change", (event) => {
  const input = event.target.closest("[data-challenge]");
  if (!input) return;
  const id = input.dataset.challenge;
  editHole(() => {
    const hole = currentHole();
    const index = hole.challenges.findIndex((c) => c.id === id);
    if (input.checked) {
      if (index < 0) {
        const catalog = CHALLENGE_CATALOG[id];
        hole.challenges.push(
          catalog
            ? { ...catalog }
            : { id, label: id.toUpperCase(), hint: "" }
        );
      }
    } else if (index >= 0) {
      hole.challenges.splice(index, 1);
    }
  });
  setStatus(`Challenges updated · ${currentHole().challenges.length} active`);
});

targetListEl.addEventListener("click", (event) => {
  const dropButton = event.target.closest("[data-target-drop]");
  if (dropButton) {
    state.pendingDropIndex = Number(dropButton.dataset.targetDrop);
    setStatus("Click the course to place the target’s safe drop point");
    return;
  }
  const button = event.target.closest("[data-target-del]");
  if (!button) return;
  const index = Number(button.dataset.targetDel);
  if (state.pendingDropIndex === index) state.pendingDropIndex = -1;
  editHole(() => {
    currentHole().bonusTargets.splice(index, 1);
  });
  setStatus("Bonus target deleted");
});

$("clearTargetsBtn").addEventListener("click", () => {
  editHole(() => {
    currentHole().bonusTargets = [];
  });
  setStatus("Bonus targets cleared on this hole");
});

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
window.addEventListener("pointerup", (event) => {
  // Safety net for releases outside the canvas (capture normally handles it).
  if (state.drag || state.stroke) onPointerUp(event);
});
canvas.addEventListener("pointerleave", () => {
  if (!state.drag && !state.stroke) {
    state.pointer = null;
    updateHint();
    requestRender();
  }
});
canvas.addEventListener(
  "wheel",
  (event) => {
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0012);
    zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor);
  },
  { passive: false }
);
canvas.addEventListener("dblclick", () => {
  finishDraftFromDoubleTap();
});
canvas.addEventListener("contextmenu", (event) => {
  // Long-press on a touch screen must not open the browser menu mid-draw.
  event.preventDefault();
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveCurrentCourse();
    return;
  }
  if (state.mapSelect) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelMapSelection();
    } else if (event.key === "Enter") {
      event.preventDefault();
      confirmMapSelection();
    }
    return;
  }
  if (event.target instanceof Element && event.target.matches("input, select, textarea")) return;
  const panKey = event.key.toLowerCase();
  if (
    PAN_KEYS.has(panKey) &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !keyboardPanBlocked()
  ) {
    event.preventDefault();
    panKeys.add(panKey);
    startKeyboardPan();
    return;
  }
  if (event.key === "Escape") {
    state.fairwayDraft = null;
    state.fairwayEditTarget = null;
    state.routeDraft = null;
    state.roadDraft = null;
    state.stroke = null;
    state.drag = null;
    state.pendingDropIndex = -1;
    refreshUI();
    requestRender();
    setStatus("Draft cancelled");
  }
  if (event.key === "Enter") {
    if (state.tool === "fairway") finishFairway();
    if (state.tool === "route") finishRoute();
    if (state.tool === "road") finishRoad();
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    if (state.selectedRoute >= 0) {
      editHole(() => {
        state.course.cartRoutes.splice(state.selectedRoute, 1);
        state.selectedRoute = -1;
      });
      setStatus("Selected route deleted");
    }
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
    event.preventDefault();
    if (event.shiftKey) redo();
    else undo();
  }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
    event.preventDefault();
    redo();
  }
});

document.addEventListener("keyup", (event) => {
  const key = event.key.toLowerCase();
  if (!panKeys.delete(key)) return;
  if (!panKeys.size) stopKeyboardPan();
});

window.addEventListener("blur", () => {
  panKeys.clear();
  stopKeyboardPan();
  // A lost pointerup must not leave the canvas stuck in gesture mode.
  activePointers.clear();
  gestureLatch = false;
  pinchGesture = null;
  state.drag = null;
  lastTap = null;
});

undoBtn.addEventListener("click", undo);
redoBtn.addEventListener("click", redo);
$("newBtn").addEventListener("click", () => openCourseDialog("new"));
$("setupBtn").addEventListener("click", () => openCourseDialog("edit"));
$("saveBtn").addEventListener("click", saveCurrentCourse);
$("saveFileBtn").addEventListener("click", savePartFile);
$("uiScaleDown").addEventListener("click", () => stepUiScale(-1));
$("uiScaleUp").addEventListener("click", () => stepUiScale(1));
$("loadBtn").addEventListener("click", openLibraryDialog);
$("libraryCloseBtn").addEventListener("click", closeLibraryDialog);
libraryDialog.addEventListener("click", (event) => {
  if (event.target === libraryDialog) closeLibraryDialog();
});
publishDialog.addEventListener("click", (event) => {
  if (event.target === publishDialog) closePublishDialog();
});
$("publishCloseBtn").addEventListener("click", closePublishDialog);
publishSummaryInput?.addEventListener("input", updateExportPreview);
publishUnlockMode?.addEventListener("change", syncPublishFields);
publishAfterInput?.addEventListener("input", updateExportPreview);
publishTrophiesInput?.addEventListener("input", updateExportPreview);
publishDownloadBtn?.addEventListener("click", downloadExportPackage);
savedCourseList.addEventListener("click", (event) => {
  const load = event.target.closest("[data-load-course]");
  if (load) {
    loadSavedCourse(Number(load.dataset.loadCourse));
    return;
  }
  const del = event.target.closest("[data-del-course]");
  if (del) deleteSavedCourse(Number(del.dataset.delCourse));
});
$("previewBtn").addEventListener("click", showPreview);
$("previewReloadBtn").addEventListener("click", showPreview);
$("previewCloseBtn").addEventListener("click", hidePreview);
previewOverlay.addEventListener("click", (event) => {
  if (event.target === previewOverlay) hidePreview();
});
courseDialog.addEventListener("click", (event) => {
  if (event.target === courseDialog) closeCourseDialog();
});
courseForm.addEventListener("submit", submitCourseDialog);
$("courseCancelBtn").addEventListener("click", closeCourseDialog);
setupNameInput.addEventListener("input", () => {
  if (!setupIdTouched || !setupIdInput.value.trim()) {
    setupIdInput.value = slugify(setupNameInput.value);
  }
});
setupIdInput.addEventListener("input", () => {
  setupIdTouched = true;
});
setupIdInput.addEventListener("blur", () => {
  setupIdInput.value = slugify(setupIdInput.value || setupNameInput.value);
});
setupCountsEl.addEventListener("click", (event) => {
  const button = event.target.closest("[data-count]");
  if (!button) return;
  setupHoleCount = Number(button.dataset.count);
  renderSetupCounts();
  updateSetupNote();
});
$("exportBtn").addEventListener("click", downloadExport);
mapSelectConfirmBtn?.addEventListener("click", confirmMapSelection);
mapSelectCancelBtn?.addEventListener("click", cancelMapSelection);
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) importJSONFile(file);
  event.target.value = "";
});
referenceFileInput.addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) loadReferenceImage(file);
  event.target.value = "";
});
$("fitBtn").addEventListener("click", fitView);
$("zoomInBtn").addEventListener("click", () =>
  zoomAt(state.vw / 2, state.vh / 2, 1.25)
);
$("zoomOutBtn").addEventListener("click", () =>
  zoomAt(state.vw / 2, state.vh / 2, 0.8)
);

$("addHoleBtn").addEventListener("click", () => {
  const hole = defaultHole(state.course.holes.length);
  state.course.holes.push(hole);
  const e = holeExtent(hole);
  if (e) ensureDesignSpace(e.minX, e.minY, e.maxX, e.maxY);
  reindexHoles();
  state.holeIndex = state.course.holes.length - 1;
  state.fairwayDraft = null;
  state.fairwayEditTarget = null;
  state.routeDraft = null;
  state.roadDraft = null;
  state.selectedRoute = -1;
  applyCourse();
  refreshUI();
  commit();
  focusHole(state.holeIndex);
  setStatus(`Added ${hole.name}`);
});

courseNameInput.addEventListener("input", () => {
  state.course.name = courseNameInput.value;
});
courseNameInput.addEventListener("change", () => {
  state.course.name = courseNameInput.value.trim() || "My Course";
  courseNameInput.value = state.course.name;
  commit();
});
courseIdInput.addEventListener("input", () => {
  state.course.id = slugify(courseIdInput.value);
});
courseIdInput.addEventListener("change", () => {
  state.course.id = slugify(courseIdInput.value);
  courseIdInput.value = state.course.id;
  commit();
});
holeNameInput.addEventListener("change", () => {
  editHole(() => {
    currentHole().name = holeNameInput.value.trim() || `Hole ${state.holeIndex + 1}`;
  });
});
holeParInput.addEventListener("change", () => {
  editHole(() => {
    currentHole().par = clamp(parseInt(holeParInput.value, 10) || 4, 1, 99);
  });
});

$("clearWaterBtn").addEventListener("click", () => {
  editHole(() => {
    const hole = currentHole();
    hole.waterPolys = [];
    hole.pond = [];
  });
  setStatus("Water cleared on this hole");
});
$("clearSandBtn").addEventListener("click", () => {
  editHole(() => {
    const hole = currentHole();
    hole.sandPolys = [];
    hole.bunkers = [];
  });
  setStatus("Sand cleared on this hole");
});
$("clearTreesBtn").addEventListener("click", () => {
  editHole(() => {
    currentHole().trees = [];
  });
  setStatus("Trees cleared on this hole");
});
$("clearSceneryBtn").addEventListener("click", () => {
  editHole(() => {
    const hole = currentHole();
    hole.props = [];
    hole.roads = [];
    hole.flowerBeds = [];
  });
  setStatus("Buildings, roads and flowers cleared on this hole");
});
$("clearRouteBtn").addEventListener("click", () => {
  editHole(() => {
    state.course.cartRoutes = [];
    state.selectedRoute = -1;
  });
  setStatus("All course cart routes cleared");
});
$("deleteHoleBtn").addEventListener("click", () => {
  const hole = currentHole();
  if (
    !window.confirm(
      `Delete ${hole.name}? This removes the hole and its hazards from the course.`
    )
  ) {
    return;
  }
  state.course.holes.splice(state.holeIndex, 1);
  if (!state.course.holes.length) state.course.holes.push(defaultHole(0));
  reindexHoles();
  state.holeIndex = clamp(state.holeIndex, 0, state.course.holes.length - 1);
  state.fairwayDraft = null;
  state.routeDraft = null;
  state.selectedRoute = -1;
  applyCourse();
  refreshUI();
  commit();
  setStatus("Hole deleted");
});

$("analyseBtn").addEventListener("click", openAnalysisDialog);
$("analysisCloseBtn").addEventListener("click", closeAnalysisDialog);
$("analysisReanalyseBtn").addEventListener("click", () => {
  runCourseAnalysis();
  setStatus("Course analysis refreshed");
});
analysisApplyBtn.addEventListener("click", applySuggestedPars);
analysisDialog.addEventListener("click", (event) => {
  if (event.target === analysisDialog) closeAnalysisDialog();
});

window.addEventListener("resize", resize);
window.addEventListener("orientationchange", () => setTimeout(resize, 150));

// ---------------------------------------------------------------- boot
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushAutosave();
});
window.addEventListener("pagehide", () => {
  flushAutosave();
});
window.addEventListener("beforeunload", (event) => {
  flushAutosave();
  if (!state.dirty) return;
  event.preventDefault();
  event.returnValue = "";
});

async function boot() {
  state.course = blankCourse();
  const storedScale = Number(await Store.getItem(UI_SCALE_KEY));
  applyUiScale(
    Number.isFinite(storedScale) && storedScale > 0 ? storedScale : 1,
    { persist: false }
  );
  canvas.style.cursor = "grab";
  resetHistory();
  applyCourse();
  refreshUI();
  selectHole(0);
  resize();
  const restored = await restoreAutosave();
  requestAnimationFrame(() => {
    if (!state.fitted) {
      fitView();
      state.fitted = true;
    }
    if (!restored) {
      setStatus("Ready — draw a fairway, then place tee, green and pin");
    }
  });
}

boot();

// Debug handle, mirroring window.__golf in the game.
window.__editor = {
  state,
  setTool,
  fitView,
  applyCourse,
  exportCourse,
  exportPackage,
  serialisePart,
  loadCourseFileData,
  applyUiScale,
  mergeBrush,
  addProp,
  eraseAt,
  undo,
  redo,
  analyseCourse: runCourseAnalysis,
  getAnalysis: () => analysisResult,
};
