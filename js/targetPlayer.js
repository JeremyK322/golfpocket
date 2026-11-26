// Editor-only target-run player.
//
// Targets are ordinary hole tabs. Each target tab carries one ground TARGET
// ring. The player starts on the first tee, must come to rest inside the active
// target, then plays the next shot from that lie toward the next target. The
// ring is only a scoring zone: it never changes the surface or stops the ball.
import {
  HOLE,
  WORLD,
  WIND,
  WIND_K,
  PX_PER_METRE,
  loadCourseData,
  setHole,
  randomizeWind,
  surfaceAt,
} from "./course.js?v=bf5caebb-dirty";
import { paintCourse } from "./paint.js?v=bf5caebb-dirty";
import { drawTree } from "./holeArt.js?v=bf5caebb-dirty";
import { drawThemeGrade } from "./themeFx.js?v=bf5caebb-dirty";
import { CLUBS } from "./catalog.js?v=bf5caebb-dirty";
import { clamp, TAU } from "./util.js";

const FRICTION = {
  green: 1.55,
  fairway: 2.35,
  fringe: 4.93,
  rough: 7.5,
  sand: 24,
  water: 1,
};
const RETENTION = {
  green: 0.3,
  fairway: 0.37,
  fringe: 0.305,
  rough: 0.24,
  sand: 0.06,
  water: 0,
};
const SHOT_CURVE_ACCEL = 72;
const TREE_TRUNK = 15;
const AIM_SWEEP = 0.26;
const AIM_RATE = 2.35;
const TURN_SENSITIVITY = 0.006;
const POWER_TIME = 1.15;
const TEMPO_PERIOD = 0.95;

const PLAY_CLUBS = CLUBS.filter((club) => !club.putt);

function normalizeAngle(angle) {
  return ((angle + Math.PI) % TAU + TAU) % TAU - Math.PI;
}

function signed(n) {
  return n > 0 ? `+${n}` : String(n);
}

function ellipsePoly(cx, cy, rx, ry, rot = 0, steps = 36) {
  const points = [];
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * TAU;
    const x = Math.cos(a) * rx;
    const y = Math.sin(a) * ry;
    points.push([cx + x * c - y * s, cy + x * s + y * c]);
  }
  return points;
}

// A simple shared-map sample: grassy target patches on ordinary terrain. The
// target rings are independent of the terrain and can be resized or replaced
// in the editor with the existing TARGET tool.
export function sampleTargetRun() {
  const targets = [
    { x: 850, y: 2700, radius: 70, par: 1 },
    { x: 620, y: 2380, radius: 66, par: 2 },
    { x: 1040, y: 2060, radius: 62, par: 1 },
    { x: 760, y: 1740, radius: 58, par: 2 },
    { x: 1060, y: 1420, radius: 54, par: 2 },
    { x: 820, y: 1100, radius: 50, par: 2 },
    { x: 980, y: 780, radius: 46, par: 3 },
  ];
  const tee = { x: 850, y: 3000, rot: 0 };
  const fairwayPolys = [
    ellipsePoly(tee.x, tee.y, 150, 105),
    ...targets.map((t) => ellipsePoly(t.x, t.y, t.radius + 30, t.radius + 22)),
  ];
  const par = targets.reduce((sum, t) => sum + t.par, 0);
  const last = targets[targets.length - 1];
  return {
    version: 2,
    id: "editor-target-sample",
    name: "Target Sample",
    theme: "verdant",
    environment: "canadian",
    mode: "target",
    targetRun: {
      balls: 30,
      sequence: targets.map((t) => ({
        x: t.x,
        y: t.y,
        radius: t.radius,
        par: t.par,
      })),
    },
    holes: [
      {
        index: 1,
        name: "Target Run",
        par,
        world: { w: 1700, h: 3200 },
        tee,
        pin: { x: last.x, y: last.y },
        green: null,
        fairway: [],
        fairwayPolys,
        oceanPolys: [],
        sandPolys: [],
        waterPolys: [],
        bunkers: [],
        pond: [],
        bonusTargets: targets.map((t, i) => ({
          id: `target-${i + 1}`,
          label: `TARGET ${i + 1}`,
          value: -1,
          x: t.x,
          y: t.y,
          radius: t.radius,
          type: "ground",
        })),
        trees: [
          { x: 560, y: 2410, r: 38, species: 5 },
          { x: 1100, y: 2080, r: 36, species: 0 },
          { x: 690, y: 1760, r: 34, species: 5 },
          { x: 1120, y: 1440, r: 32, species: 0 },
          { x: 760, y: 1120, r: 30, species: 5 },
          { x: 1040, y: 800, r: 28, species: 0 },
          { x: 790, y: 3020, r: 30, species: 5 },
        ],
        props: [],
        roads: [],
        flowerBeds: [],
        challenges: [],
        cartRoutes: [],
      },
    ],
  };
}

class TargetBall {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.z = 0;
    this.t = 0;
    this.T = 0;
    this.phase = "rest";
    this.trail = [];
  }

  reset(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.z = 0;
    this.t = 0;
    this.T = 0;
    this.phase = "rest";
    this.trail.length = 0;
  }

  launch({ dir, power, club, curve }) {
    const metres = club.carry * (0.22 + 0.78 * power);
    const px = metres * PX_PER_METRE;
    const T = club.flight * (0.82 + 0.18 * power);
    const speed = px / T;
    const windAcc = WIND.mps * WIND_K * (1 - (club.windResist || 0));
    this.phase = "flight";
    this.t = 0;
    this.T = T;
    this.z = 0;
    this.trail.length = 0;
    this.vx = Math.cos(dir) * speed;
    this.vy = Math.sin(dir) * speed;
    this.windVx = Math.cos(WIND.angle) * windAcc;
    this.windVy = Math.sin(WIND.angle) * windAcc;
    this.curveVx = -Math.sin(dir);
    this.curveVy = Math.cos(dir);
    this.curveAccel = curve * SHOT_CURVE_ACCEL;
    this.club = club;
  }

  get speed() {
    return Math.hypot(this.vx, this.vy);
  }

  update(dt) {
    if (this.phase === "rest") return null;
    this.trail.push({ x: this.x, y: this.y, z: this.z, life: 0.55 });
    for (let i = this.trail.length - 1; i >= 0; i--) {
      this.trail[i].life -= dt;
      if (this.trail[i].life <= 0) this.trail.splice(i, 1);
    }

    if (this.phase === "flight") {
      this.t += dt;
      this.vx += (this.windVx || 0) * dt;
      this.vy += (this.windVy || 0) * dt;
      if (this.curveAccel) {
        this.vx += this.curveVx * this.curveAccel * dt;
        this.vy += this.curveVy * this.curveAccel * dt;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const tt = clamp(this.t / this.T, 0, 1);
      this.z = 4 * tt * (1 - tt);
      if (this.x < 20 || this.x > WORLD.w - 20 || this.y < 20 || this.y > WORLD.h - 20) {
        this.phase = "rest";
        this.vx = this.vy = 0;
        this.z = 0;
        return "water";
      }
      if (this.z < 0.52) this.bounceTrees();
      if (this.t >= this.T) return this.land();
      return null;
    }

    if (this.phase === "roll") {
      const surface = surfaceAt(this.x, this.y);
      if (surface === "water") {
        this.phase = "rest";
        this.vx = this.vy = 0;
        return "water";
      }
      const k = FRICTION[surface] ?? 6;
      const damp = Math.exp(-k * dt);
      this.vx *= damp;
      this.vy *= damp;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.bounceTrees();
      if (this.x < 20 || this.x > WORLD.w - 20 || this.y < 20 || this.y > WORLD.h - 20) {
        this.phase = "rest";
        this.vx = this.vy = 0;
        return "water";
      }
      if (surfaceAt(this.x, this.y) === "water") {
        this.phase = "rest";
        this.vx = this.vy = 0;
        return "water";
      }
      if (this.speed < 4.5) {
        this.phase = "rest";
        this.vx = this.vy = 0;
        this.z = 0;
        return "stop";
      }
    }
    return null;
  }

  bounceTrees() {
    for (const tree of HOLE.trees || []) {
      const d = Math.hypot(this.x - tree.x, this.y - tree.y);
      if (d >= TREE_TRUNK + 5 || d <= 0.01) continue;
      const nx = (this.x - tree.x) / d;
      const ny = (this.y - tree.y) / d;
      const dot = this.vx * nx + this.vy * ny;
      this.vx = (this.vx - 2 * dot * nx) * 0.42;
      this.vy = (this.vy - 2 * dot * ny) * 0.42;
      this.x = tree.x + nx * (TREE_TRUNK + 6);
      this.y = tree.y + ny * (TREE_TRUNK + 6);
      return;
    }
  }

  land() {
    this.z = 0;
    this.t = this.T;
    const surface = surfaceAt(this.x, this.y);
    if (surface === "water") {
      this.phase = "rest";
      this.vx = this.vy = 0;
      return "water";
    }
    this.phase = "roll";
    const landingSpeed = Math.hypot(this.vx, this.vy);
    let retention = RETENTION[surface] ?? 0.3;
    if (this.club && this.club.roll) retention *= 0.7 + this.club.roll * 0.35;
    const jitter = (Math.random() - 0.5) * 0.16;
    const angle = Math.atan2(this.vy, this.vx) + jitter;
    const speed = landingSpeed * retention;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    return null;
  }
}

function distanceMetres(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y) / PX_PER_METRE;
}

function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function courseTargets(course) {
  const sequence = course?.targetRun?.sequence;
  if (Array.isArray(sequence) && sequence.length) {
    return sequence.map((t) => ({
      x: Number(t.x) || 0,
      y: Number(t.y) || 0,
      radius: Math.max(10, Number(t.radius) || 48),
      par: Math.max(1, Number(t.par) || 1),
    }));
  }
  return (HOLE.bonusTargets || []).map((t) => ({
    x: t.x,
    y: t.y,
    radius: Math.max(10, Number(t.radius) || 48),
    par: 1,
  }));
}

export function startTargetPlayer({
  course,
  format = "stroke",
  startingBalls = null,
  startLeg = 1,
  onExit = null,
}) {
  if (!course || !Array.isArray(course.holes) || !course.holes.length) {
    throw new Error("Target player needs course data with a hole");
  }
  loadCourseData(course);
  setHole(0);
  const targets = courseTargets(course);
  if (!targets.length) {
    throw new Error("Target player needs at least one target");
  }

  const ground = paintCourse(course.theme || "verdant");
  const lastTarget = targets.length - 1;
  const totalPar = targets.reduce((sum, t) => sum + (t.par || 0), 0);
  const treeDraw = (HOLE.trees || [])
    .map((tree, index) => ({ tree, index }))
    .sort((a, b) => a.tree.y - b.tree.y);

  const overlay = document.createElement("div");
  overlay.className = "ed-player";
  overlay.innerHTML = `
    <div class="ed-player-bar">
      <div class="ed-player-title">TARGET RUN <span data-badge>STROKE</span></div>
      <div class="ed-player-hud">
        <div><span>TARGET</span><b data-hud="island">1 / ${targets.length}</b></div>
        <div><span>DIST</span><b data-hud="target">—</b></div>
        <div><span>PAR</span><b data-hud="par">—</b></div>
        <div><span>SCORE</span><b data-hud="score">0</b></div>
        <div data-hud-wrap="balls" class="hidden"><span>BALLS</span><b data-hud="balls">—</b></div>
        <div><span>WIND</span><b data-hud="wind">—</b></div>
      </div>
      <div class="ed-player-actions">
        <button type="button" class="small" data-act="restart">RESTART</button>
        <button type="button" class="small" data-act="exit">EXIT</button>
      </div>
    </div>
    <div class="ed-player-stage">
      <canvas data-canvas></canvas>
      <div class="ed-player-card" data-panel="start">
        <p class="ed-dialog-eyebrow">TARGET RUN</p>
        <h2>${course.name || "Target Run"}</h2>
        <p class="ed-player-copy">${targets.length} targets · par ${totalPar} · ${Math.max(
          1,
          Number(course.targetRun?.balls) || 30
        )} balls in Ball Run. Stop inside the lit ring. Rolling through or off the edge is a miss — replay from the same spot.</p>
        <div class="ed-player-formats">
          <button type="button" data-format="stroke" class="on">
            <b>STROKE RUN</b>
            <small>Unlimited balls · score against par</small>
          </button>
          <button type="button" data-format="balls">
            <b>BALL RUN</b>
            <small>Every shot spends a ball · how far can you get?</small>
          </button>
        </div>
        <label class="ed-player-field" data-balls-field>
          <span>STARTING BALLS</span>
          <input type="number" min="1" max="99" data-balls value="${Math.max(
            1,
            Math.min(99, Number(startingBalls ?? course.targetRun?.balls) || 30)
          )}" />
        </label>
        <label class="ed-player-field">
          <span>START ON TARGET</span>
          <select data-leg>
            ${targets
              .map(
                (_, i) =>
                  `<option value="${i + 1}" ${i + 1 === startLeg ? "selected" : ""}>Target ${i + 1}</option>`
              )
              .join("")}
          </select>
        </label>
        <button type="button" class="primary" data-act="begin">START RUN</button>
      </div>
      <div class="ed-player-card hidden" data-panel="result">
        <p class="ed-dialog-eyebrow" data-result-kicker>RUN COMPLETE</p>
        <h2 data-result-title>ALL TARGETS CLEARED</h2>
        <p class="ed-player-copy" data-result-detail></p>
        <div class="ed-player-result-stats">
          <div><span>SHOTS</span><b data-result-shots>0</b></div>
          <div><span>PAR</span><b data-result-par>0</b></div>
          <div><span>TARGETS</span><b data-result-islands>0</b></div>
          <div><span>BALLS</span><b data-result-balls>0</b></div>
        </div>
        <div class="ed-player-result-actions">
          <button type="button" class="primary" data-act="again">RUN AGAIN</button>
          <button type="button" class="small" data-act="exit">BACK TO EDITOR</button>
        </div>
      </div>
    </div>
    <div class="ed-player-bottom">
      <label class="ed-player-club">
        <span>CLUB</span>
        <select data-club>
          ${PLAY_CLUBS.map(
            (club) => `<option value="${club.id}">${club.name}</option>`
          ).join("")}
        </select>
      </label>
      <div class="ed-player-step" data-step>DRAG TO AIM</div>
      <div class="ed-player-tip">TAP OR DRAG ON THE COURSE</div>
    </div>
  `;
  document.body.appendChild(overlay);

  const canvas = overlay.querySelector("[data-canvas]");
  const ctx = canvas.getContext("2d");
  const stage = overlay.querySelector(".ed-player-stage");
  const startPanel = overlay.querySelector('[data-panel="start"]');
  const resultPanel = overlay.querySelector('[data-panel="result"]');
  const stepEl = overlay.querySelector("[data-step]");
  const clubSelect = overlay.querySelector("[data-club]");
  const badges = {
    island: overlay.querySelector('[data-hud="island"]'),
    target: overlay.querySelector('[data-hud="target"]'),
    par: overlay.querySelector('[data-hud="par"]'),
    score: overlay.querySelector('[data-hud="score"]'),
    balls: overlay.querySelector('[data-hud="balls"]'),
    wind: overlay.querySelector('[data-hud="wind"]'),
    ballsWrap: overlay.querySelector('[data-hud-wrap="balls"]'),
  };
  const badge = overlay.querySelector("[data-badge]");
  const ballsInput = overlay.querySelector("[data-balls]");
  const ballsField = overlay.querySelector("[data-balls-field]");
  const legSelect = overlay.querySelector("[data-leg]");
  const formatButtons = [...overlay.querySelectorAll("[data-format]")];

  const teeStart =
    HOLE.tee && Number.isFinite(HOLE.tee.x) && Number.isFinite(HOLE.tee.y)
      ? { x: HOLE.tee.x, y: HOLE.tee.y }
      : { x: targets[0].x, y: targets[0].y };
  const ball = new TargetBall();
  const cam = { x: WORLD.w / 2, y: WORLD.h / 2, zoom: 0.5 };
  const state = {
    format: format === "balls" ? "balls" : "stroke",
    ballsLeft: Math.max(1, Number(startingBalls ?? course.targetRun?.balls) || 30),
    targetIndex: 0,
    shotOrigin: { ...teeStart },
    strokes: 0,
    legShots: 0,
    parTarget: totalPar,
    legResults: [],
    club: PLAY_CLUBS.find((c) => c.id === "driver") || PLAY_CLUBS[0],
    baseAngle: 0,
    angle: 0,
    aimQuality: 1,
    shotShape: 0,
    power: 0,
    powerT: 0,
    aimT: 0,
    tempoT: 0,
    tempoPos: 0.5,
    tempoQuality: 1,
    tempoLabel: "SOLID",
    turnPress: null,
    shapePress: null,
    sweeping: false,
    charging: false,
    state: "start",
    timer: 0,
    nextAction: null,
    splash: null,
    running: true,
    time: 0,
    vw: 1,
    vh: 1,
    dpr: 1,
  };

  function target() {
    return targets[Math.min(state.targetIndex, lastTarget)];
  }

  function autoClub() {
    const t = target();
    const metres = distanceMetres(state.shotOrigin, t);
    let best = PLAY_CLUBS[0];
    let bestDiff = Infinity;
    for (const club of PLAY_CLUBS) {
      const diff = Math.abs(club.carry - metres * 1.04);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = club;
      }
    }
    state.club = best;
    if (clubSelect) clubSelect.value = best.id;
  }

  function snapCamera() {
    const t = target();
    const o = state.shotOrigin;
    const dx = t.x - o.x;
    const dy = t.y - o.y;
    const zoom = clamp(
      Math.min(state.vw / (Math.abs(dx) + 720), state.vh / (Math.abs(dy) + 720)),
      0.28,
      1.15
    );
    cam.x = (o.x + t.x) / 2;
    cam.y = (o.y + t.y) / 2 - 30;
    cam.zoom = zoom;
  }

  function startPositionFor(index) {
    if (index <= 0) return { ...teeStart };
    const previous = targets[index - 1];
    return { x: previous.x, y: previous.y };
  }

  function applyTarget(index) {
    state.targetIndex = clamp(index, 0, lastTarget);
    ball.reset(state.shotOrigin.x, state.shotOrigin.y);
    randomizeWind();
    autoClub();
    const t = target();
    state.baseAngle = Math.atan2(t.y - state.shotOrigin.y, t.x - state.shotOrigin.x);
    state.angle = state.baseAngle;
    state.aimQuality = 1;
    state.shotShape = 0;
    state.power = 0;
    state.powerT = 0;
    state.aimT = 0;
    state.tempoT = 0;
    state.tempoPos = 0.5;
    state.tempoQuality = 1;
    state.turnPress = null;
    state.shapePress = null;
    state.sweeping = false;
    state.charging = false;
    state.legShots = 0;
    state.state = "aimTurn";
    state.timer = 0;
    state.nextAction = null;
    snapCamera();
    updateHud();
    setStep("DRAG TO AIM");
  }

  function continueFromBall() {
    state.shotOrigin = { x: ball.x, y: ball.y };
    randomizeWind();
    autoClub();
    const t = target();
    state.baseAngle = Math.atan2(t.y - ball.y, t.x - ball.x);
    state.angle = state.baseAngle;
    state.aimQuality = 1;
    state.shotShape = 0;
    state.power = 0;
    state.powerT = 0;
    state.aimT = 0;
    state.tempoT = 0;
    state.tempoPos = 0.5;
    state.tempoQuality = 1;
    state.turnPress = null;
    state.shapePress = null;
    state.sweeping = false;
    state.charging = false;
    state.legShots = 0;
    state.state = "aimTurn";
    state.timer = 0;
    state.nextAction = null;
    snapCamera();
    updateHud();
    setStep("DRAG TO AIM");
  }

  function updateHud() {
    const t = target();
    const metres = Math.round(distanceMetres(state.shotOrigin, t));
    const completedPar = state.legResults.reduce(
      (sum, leg) => sum + (Number(leg.par) || 0),
      0
    );
    badges.island.textContent = `${state.targetIndex + 1} / ${targets.length}`;
    badges.target.textContent = `${metres} M · R${Math.round(t.radius)}`;
    badges.par.textContent = `${t.par || 0}`;
    const diff = state.strokes - completedPar;
    badges.score.textContent =
      state.format === "balls"
        ? `${state.strokes} SHOTS`
        : `${state.strokes} · ${diff === 0 ? "E" : signed(diff)}`;
    badges.balls.textContent = `${state.ballsLeft}`;
    badges.wind.textContent = `${WIND.mps.toFixed(1)} M/S`;
    badges.ballsWrap.classList.toggle("hidden", state.format !== "balls");
    badge.textContent = state.format === "balls" ? "BALL" : "STROKE";
  }

  function setStep(text) {
    if (stepEl) stepEl.textContent = text;
  }

  function resize() {
    const rect = stage.getBoundingClientRect();
    state.vw = Math.max(1, rect.width);
    state.vh = Math.max(1, rect.height);
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(state.vw * state.dpr);
    canvas.height = Math.round(state.vh * state.dpr);
    canvas.style.width = `${state.vw}px`;
    canvas.style.height = `${state.vh}px`;
    snapCamera();
  }

  function predictedLanding(power = state.power) {
    const club = state.club;
    const p = clamp(power || 0.7, 0, 1);
    const metres = club.carry * (0.22 + 0.78 * p);
    const dir = state.angle;
    const T = club.flight * (0.82 + 0.18 * p);
    let x = ball.x + Math.cos(dir) * metres * PX_PER_METRE;
    let y = ball.y + Math.sin(dir) * metres * PX_PER_METRE;
    const drift = 0.5 * WIND.mps * WIND_K * (1 - (club.windResist || 0)) * T * T;
    x += Math.cos(WIND.angle) * drift;
    y += Math.sin(WIND.angle) * drift;
    const lateral =
      0.5 * state.shotShape * SHOT_CURVE_ACCEL * (1 + (club.control || 1) * 0.1) * T * T;
    x += -Math.sin(dir) * lateral;
    y += Math.cos(dir) * lateral;
    return { x, y, metres };
  }

  function takeShot() {
    if (state.format === "balls" && state.ballsLeft <= 0) {
      finish("balls");
      return;
    }
    const aimError = (1 - state.aimQuality) * 0.11;
    const dir = state.angle + (Math.random() - 0.5) * aimError;
    const tempoPower = 0.9 + 0.1 * state.tempoQuality;
    const power = clamp(state.power * tempoPower, 0.08, 1);
    const curve = state.shotShape * (0.55 + 0.45 * state.tempoQuality);
    ball.launch({ dir, power, club: state.club, curve });
    state.strokes += 1;
    state.legShots += 1;
    if (state.format === "balls") state.ballsLeft -= 1;
    state.charging = false;
    state.state = "flight";
    setStep(`${state.tempoLabel} · CARRY`);
    updateHud();
  }

  function onHit() {
    const t = target();
    state.legResults.push({
      index: state.targetIndex,
      shots: state.legShots,
      par: t.par || 0,
    });
    if (state.targetIndex >= lastTarget) {
      finish("complete");
      return;
    }
    if (state.format === "balls" && state.ballsLeft <= 0) {
      finish("balls");
      return;
    }
    state.state = "advance";
    state.timer = 0.85;
    state.nextAction = "advance";
    setStep("TARGET HIT");
    updateHud();
  }

  function onMiss(splash = null) {
    if (splash) state.splash = splash;
    state.state = "result";
    state.timer = 1.35;
    state.nextAction = "retry";
    setStep(
      state.format === "balls"
        ? `MISS · ${Math.max(0, state.ballsLeft)} BALL${state.ballsLeft === 1 ? "" : "S"} LEFT`
        : "MISS · RETRY FROM HERE"
    );
    updateHud();
  }

  function retry() {
    if (state.format === "balls" && state.ballsLeft <= 0) {
      finish("balls");
      return;
    }
    ball.reset(state.shotOrigin.x, state.shotOrigin.y);
    const t = target();
    state.baseAngle = Math.atan2(t.y - state.shotOrigin.y, t.x - state.shotOrigin.x);
    state.angle = state.baseAngle;
    state.aimQuality = 1;
    state.shotShape = 0;
    state.power = 0;
    state.powerT = 0;
    state.aimT = 0;
    state.tempoT = 0;
    state.tempoPos = 0.5;
    state.tempoQuality = 1;
    state.state = "aimTurn";
    state.splash = null;
    snapCamera();
    setStep("DRAG TO AIM");
    updateHud();
  }

  function finish(kind) {
    state.state = "done";
    resultPanel.classList.remove("hidden");
    startPanel.classList.add("hidden");
    const complete = kind === "complete";
    const cleared = state.targetIndex + 1;
    const kicker = complete ? "RUN COMPLETE" : "RUN OVER";
    const title = complete ? "ALL TARGETS CLEARED" : "OUT OF BALLS";
    const detail = complete
      ? state.format === "balls"
        ? `${state.strokes} shots · ${state.ballsLeft} balls left.`
        : `${state.strokes} shots · ${signed(
            state.strokes - state.parTarget
          )} against par.`
      : `Reached target ${cleared} of ${targets.length} · ${state.strokes} shots.`;
    overlay.querySelector("[data-result-kicker]").textContent = kicker;
    overlay.querySelector("[data-result-title]").textContent = title;
    overlay.querySelector("[data-result-detail]").textContent = detail;
    overlay.querySelector("[data-result-shots]").textContent = String(state.strokes);
    overlay.querySelector("[data-result-par]").textContent = String(state.parTarget);
    overlay.querySelector("[data-result-islands]").textContent = complete
      ? `${targets.length}/${targets.length}`
      : `${cleared}/${targets.length}`;
    overlay.querySelector("[data-result-balls]").textContent =
      state.format === "balls" ? String(state.ballsLeft) : "—";
    setStep(kind === "complete" ? "RUN COMPLETE" : "OUT OF BALLS");
  }

  function begin() {
    state.format = formatButtons.find((b) => b.classList.contains("on"))?.dataset
      .format || "stroke";
    state.ballsLeft = Math.max(1, Math.min(99, Number(ballsInput.value) || 30));
    const targetNumber = clamp(Number(legSelect.value) || 1, 1, targets.length);
    state.targetIndex = targetNumber - 1;
    state.shotOrigin = startPositionFor(state.targetIndex);
    state.parTarget = targets
      .slice(state.targetIndex)
      .reduce((sum, t) => sum + (Number(t.par) || 0), 0);
    state.strokes = 0;
    state.legResults = [];
    startPanel.classList.add("hidden");
    resultPanel.classList.add("hidden");
    applyTarget(state.targetIndex);
  }

  function showStart() {
    state.state = "start";
    resultPanel.classList.add("hidden");
    startPanel.classList.remove("hidden");
    state.splash = null;
    setStep("CHOOSE A FORMAT");
    updateHud();
  }

  function refreshFormat() {
    const chosen = formatButtons.find((b) => b.classList.contains("on"))?.dataset
      .format || "stroke";
    state.format = chosen === "balls" ? "balls" : "stroke";
    for (const button of formatButtons) {
      button.classList.toggle("on", button.dataset.format === chosen);
    }
    ballsField.classList.toggle("hidden", chosen !== "balls");
    badge.textContent = chosen === "balls" ? "BALL" : "STROKE";
    badges.ballsWrap.classList.toggle("hidden", chosen !== "balls");
  }

  function update(dt) {
    state.time += dt;
    if (state.splash) {
      state.splash.life -= dt;
      if (state.splash.life <= 0) state.splash = null;
    }
    if (state.state === "aimAngle" && state.sweeping) {
      state.aimT += dt;
      state.angle = state.baseAngle + Math.sin(state.aimT * AIM_RATE) * AIM_SWEEP;
    }
    if (state.state === "aimPower" && state.charging) {
      state.powerT += dt;
      state.power = clamp(state.powerT / POWER_TIME, 0, 1);
    }
    if (state.state === "aimTempo") {
      state.tempoT += dt;
      state.tempoPos =
        0.5 + 0.5 * Math.sin((state.tempoT / TEMPO_PERIOD) * TAU - Math.PI / 2);
    }
    if (state.state === "flight") {
      const result = ball.update(dt);
      if (result === "water") {
        onMiss({ kind: "splash", x: ball.x, y: ball.y, life: 0.9 });
      } else if (result === "stop") {
        const t = target();
        const inside = Math.hypot(ball.x - t.x, ball.y - t.y) <= t.radius;
        if (inside) onHit();
        else onMiss();
      }
    }
    if (state.state === "advance" || state.state === "result") {
      state.timer -= dt;
      if (state.timer <= 0) {
        if (state.nextAction === "advance") {
          state.targetIndex += 1;
          state.nextAction = null;
          continueFromBall();
        } else if (state.nextAction === "retry") {
          state.nextAction = null;
          retry();
        }
      }
    }

    if (state.state === "flight") {
      const t = target();
      const focusX = ball.x * 0.7 + t.x * 0.3;
      const focusY = (ball.y + ball.z * -30) * 0.7 + t.y * 0.3;
      cam.x += (focusX - cam.x) * Math.min(1, dt * 5);
      cam.y += (focusY - cam.y) * Math.min(1, dt * 5);
      cam.zoom += (0.78 - cam.zoom) * Math.min(1, dt * 2.2);
    } else if (state.state === "advance" || state.state === "result") {
      const t = target();
      cam.x += (t.x - cam.x) * Math.min(1, dt * 3);
      cam.y += (t.y - cam.y) * Math.min(1, dt * 3);
    }
  }

  function drawWorld(time) {
    ctx.drawImage(ground.canvas, 0, 0, WORLD.w, WORLD.h);

    const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
    for (let i = 0; i < targets.length; i++) {
      const ring = targets[i];
      const active = i === state.targetIndex;
      const done = i < state.targetIndex;
      ctx.save();
      ctx.translate(ring.x, ring.y);
      if (active) {
        const glow = ctx.createRadialGradient(
          0,
          0,
          ring.radius * 0.2,
          0,
          0,
          ring.radius * 1.65
        );
        glow.addColorStop(0, `rgba(255, 220, 90, ${0.1 + pulse * 0.08})`);
        glow.addColorStop(1, "rgba(255, 220, 90, 0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(0, 0, ring.radius * 1.65, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = `rgba(255, 216, 74, ${0.62 + pulse * 0.34})`;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.arc(0, 0, ring.radius + 5 + pulse * 3, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255, 250, 210, 0.8)";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(0, 0, ring.radius, 0, TAU);
        ctx.stroke();
      } else {
        ctx.strokeStyle = done
          ? "rgba(190, 220, 180, 0.18)"
          : "rgba(230, 245, 220, 0.24)";
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, ring.radius, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    for (const entry of treeDraw) {
      drawTree(ctx, entry.tree, entry.index, { time, wind: WIND.mps });
    }

    if (
      ["aimTurn", "aimAngle", "aimShape", "aimPower", "aimTempo"].includes(
        state.state
      )
    ) {
      const landing = predictedLanding(
        state.state === "aimPower" || state.state === "aimTempo"
          ? state.power
          : 0.72
      );
      ctx.save();
      ctx.strokeStyle = "rgba(210, 250, 255, 0.56)";
      ctx.lineWidth = 1.6 / cam.zoom;
      ctx.setLineDash([7 / cam.zoom, 7 / cam.zoom]);
      ctx.beginPath();
      ctx.moveTo(ball.x, ball.y);
      ctx.lineTo(landing.x, landing.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const spread = 29 / cam.zoom;
      ctx.strokeStyle = "rgba(210, 250, 255, 0.55)";
      ctx.lineWidth = 1.4 / cam.zoom;
      ctx.beginPath();
      ctx.ellipse(
        landing.x,
        landing.y,
        spread,
        spread * 0.66,
        state.angle + Math.PI / 2,
        0,
        TAU
      );
      ctx.stroke();
      ctx.restore();
    }

    for (const p of ball.trail) {
      const alpha = clamp(p.life / 0.55, 0, 1) * 0.5;
      ctx.fillStyle = `rgba(255, 255, 240, ${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y - p.z * 38, 2.4, 0, TAU);
      ctx.fill();
    }
    if (state.state !== "done") {
      ctx.fillStyle = "rgba(10, 32, 18, 0.28)";
      ctx.beginPath();
      ctx.ellipse(ball.x + 3, ball.y + 3, 7, 4.4, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fffdf2";
      ctx.beginPath();
      ctx.arc(ball.x, ball.y - ball.z * 44, 5.2, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = "rgba(40, 70, 36, 0.45)";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    if (state.splash) {
      const s = state.splash;
      const p = 1 - clamp(s.life / 0.9, 0, 1);
      ctx.strokeStyle = `rgba(230, 252, 255, ${1 - p})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, 18 + p * 42, 10 + p * 24, 0, 0, TAU);
      ctx.stroke();
    }
  }

  function drawMeters() {
    if (!["aimShape", "aimPower", "aimTempo"].includes(state.state)) return;
    const w = Math.min(400, state.vw - 36);
    const h = 54;
    const x = (state.vw - w) / 2;
    const y = state.vh - h - 16;
    ctx.save();
    ctx.fillStyle = "rgba(6, 26, 15, 0.78)";
    roundedRect(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = "rgba(185, 227, 91, 0.24)";
    ctx.lineWidth = 1;
    ctx.stroke();
    const bx = x + 14;
    const bw = w - 28;
    const by = y + 18;

    if (state.state === "aimShape") {
      ctx.strokeStyle = "rgba(253, 246, 227, 0.22)";
      ctx.beginPath();
      ctx.moveTo(bx + bw / 2, by - 5);
      ctx.lineTo(bx + bw / 2, by + 16);
      ctx.stroke();
      const marker = bx + ((state.shotShape + 1) / 2) * bw;
      ctx.fillStyle = "#b9e35b";
      ctx.beginPath();
      ctx.arc(marker, by + 6, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fdf6e3";
      ctx.font = "900 10px ui-rounded, 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("DRAW", bx + 16, by + 24);
      ctx.fillText("FADE", bx + bw - 16, by + 24);
      ctx.fillText("SHAPE · RELEASE TO LOCK", bx + bw / 2, by + 30);
    } else if (state.state === "aimPower") {
      ctx.fillStyle = "rgba(253, 246, 227, 0.14)";
      roundedRect(ctx, bx, by, bw, 14, 7);
      ctx.fill();
      ctx.fillStyle = state.power > 0.97 ? "#ff8c6b" : "#b9e35b";
      roundedRect(ctx, bx, by, Math.max(8, bw * state.power), 14, 7);
      ctx.fill();
      ctx.fillStyle = "#fdf6e3";
      ctx.font = "900 10px ui-rounded, 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        `POWER ${Math.round(state.power * 100)}% · RELEASE TO LOCK`,
        bx + bw / 2,
        by + 30
      );
    } else if (state.state === "aimTempo") {
      ctx.strokeStyle = "rgba(253, 246, 227, 0.18)";
      ctx.beginPath();
      ctx.moveTo(bx, by + 7);
      ctx.lineTo(bx + bw, by + 7);
      ctx.stroke();
      ctx.strokeStyle = "rgba(185, 227, 91, 0.85)";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(bx + bw * 0.38, by + 7);
      ctx.lineTo(bx + bw * 0.62, by + 7);
      ctx.stroke();
      ctx.lineWidth = 1;
      const marker = bx + clamp(state.tempoPos, 0, 1) * bw;
      ctx.fillStyle = "#ffd23f";
      ctx.beginPath();
      ctx.arc(marker, by + 7, 7, 0, TAU);
      ctx.fill();
      ctx.fillStyle = "#fdf6e3";
      ctx.font = "900 10px ui-rounded, 'Segoe UI', system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("TAP IN THE GREEN", bx + bw / 2, by + 30);
    }
    ctx.restore();
  }

  function draw() {
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    ctx.clearRect(0, 0, state.vw, state.vh);
    ctx.fillStyle = "#143244";
    ctx.fillRect(0, 0, state.vw, state.vh);
    ctx.save();
    ctx.translate(state.vw / 2, state.vh / 2);
    ctx.scale(cam.zoom, cam.zoom);
    ctx.translate(-cam.x, -cam.y);
    drawWorld(state.time);
    ctx.restore();
    drawThemeGrade(ctx, course.theme || "verdant", state.vw, state.vh);
    drawMeters();
  }

  let raf = 0;
  let last = 0;
  let hiddenTimer = 0;
  function frame(now) {
    if (!state.running) return;
    if (!last) last = now;
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    update(dt);
    draw();
    raf = requestAnimationFrame(frame);
  }

  hiddenTimer = window.setInterval(() => {
    if (!state.running) return;
    const now = performance.now();
    if (now - last < 80) return;
    update(clamp((now - last) / 1000, 0, 0.05));
    last = now;
    draw();
  }, 33);

  function pointerPos(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onPointerDown(event) {
    if (event.target !== canvas) return;
    if (state.state === "start" || state.state === "done") return;
    const p = pointerPos(event);
    event.preventDefault();
    try {
      canvas.setPointerCapture?.(event.pointerId);
    } catch (err) {
      // Synthetic pointers in tests are not capturable.
    }
    if (state.state === "aimTurn") {
      state.turnPress = {
        id: event.pointerId,
        startX: p.x,
        base: state.baseAngle,
        moved: false,
      };
      return;
    }
    if (state.state === "aimAngle") {
      state.sweeping = true;
      state.aimT = 0;
      state.angle = state.baseAngle;
      return;
    }
    if (state.state === "aimShape") {
      state.shapePress = { id: event.pointerId, startX: p.x };
      return;
    }
    if (state.state === "aimPower") {
      state.charging = true;
      state.powerT = 0;
      state.power = 0;
      return;
    }
    if (state.state === "aimTempo") {
      const err = Math.abs(state.tempoPos - 0.5) * 2;
      state.tempoQuality = clamp(1 - err * 1.15, 0, 1);
      state.tempoLabel =
        state.tempoQuality > 0.82
          ? "PURE"
          : state.tempoQuality > 0.55
          ? "SOLID"
          : state.tempoQuality > 0.3
          ? "THIN"
          : "OFF LINE";
      takeShot();
    }
  }

  function onPointerMove(event) {
    if (state.state === "aimTurn" && state.turnPress) {
      const p = pointerPos(event);
      const dx = p.x - state.turnPress.startX;
      if (Math.abs(dx) > 7) state.turnPress.moved = true;
      state.baseAngle = state.turnPress.base + dx * TURN_SENSITIVITY;
      state.angle = state.baseAngle;
      return;
    }
    if (state.state === "aimShape" && state.shapePress) {
      const p = pointerPos(event);
      const dx = p.x - state.shapePress.startX;
      state.shotShape = Math.abs(dx) < 14 ? 0 : clamp(dx / 110, -1, 1);
    }
  }

  function onPointerUp() {
    if (state.state === "aimTurn" && state.turnPress) {
      const moved = state.turnPress.moved;
      state.turnPress = null;
      if (!moved) {
        const t = target();
        state.baseAngle = Math.atan2(t.y - ball.y, t.x - ball.x);
        state.angle = state.baseAngle;
      }
      state.state = "aimAngle";
      setStep("HOLD TO SWEEP · RELEASE ON LINE");
      return;
    }
    if (state.state === "aimAngle" && state.sweeping) {
      state.sweeping = false;
      state.aimQuality = clamp(
        1 - Math.abs(normalizeAngle(state.angle - state.baseAngle)) / AIM_SWEEP,
        0,
        1
      );
      state.state = "aimShape";
      state.shotShape = 0;
      setStep("DRAG FOR DRAW / FADE");
      return;
    }
    if (state.state === "aimShape" && state.shapePress) {
      state.shapePress = null;
      state.state = "aimPower";
      state.power = 0;
      state.powerT = 0;
      setStep("HOLD TO CHARGE · RELEASE TO LOCK");
      return;
    }
    if (state.state === "aimPower" && state.charging) {
      state.charging = false;
      state.power = Math.max(0.08, state.power);
      state.state = "aimTempo";
      state.tempoT = 0;
      state.tempoPos = 0.5;
      setStep("TAP IN THE GREEN");
    }
  }

  function stop() {
    if (!state.running) return;
    state.running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    if (hiddenTimer) window.clearInterval(hiddenTimer);
    hiddenTimer = 0;
    window.removeEventListener("resize", resize);
    if (window.__targetPlayer === api) window.__targetPlayer = null;
    overlay.remove();
    if (typeof onExit === "function") onExit();
  }

  overlay.addEventListener("click", (event) => {
    const act = event.target.closest("[data-act]")?.dataset.act;
    if (act === "begin") begin();
    else if (act === "exit") stop();
    else if (act === "restart") showStart();
    else if (act === "again") showStart();
  });
  for (const button of formatButtons) {
    button.addEventListener("click", () => {
      for (const other of formatButtons) other.classList.remove("on");
      button.classList.add("on");
      refreshFormat();
    });
  }
  clubSelect.addEventListener("change", () => {
    state.club = PLAY_CLUBS.find((club) => club.id === clubSelect.value) || state.club;
  });
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("resize", resize);

  const api = {
    stop,
    state,
    update,
    draw,
    wind: WIND,
    targets,
    teeStart,
    takeShot,
    applyTarget,
    target,
    predictedLanding,
    get camera() {
      return { ...cam };
    },
  };
  window.__targetPlayer = api;

  refreshFormat();
  resize();
  showStart();
  raf = requestAnimationFrame((now) => {
    last = now;
    frame(now);
  });

  return { stop, state, update, draw };
}
