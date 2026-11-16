// Round NPC roster: four named golfers drawn per round, with fixed looks.
import {
  CHARACTERS,
  CHARACTER_BY_ID,
  GLOVE_COLOUR_BY_ID,
  HAT_COLOUR_BY_ID,
  SHIRT_COLOUR_BY_ID,
  SHORTS_COLOUR_BY_ID,
} from "./catalog.js?v=bf5caebb-dirty";
import { clamp, mulberry32 } from "./util.js";

export const NPC_PROFILES = [  {
    id: "mara-voss",
    name: "MARA VOSS",
    character: "pro",
    hatStyle: "cap",
    hatColour: "white",
    shirt: "navy",
    shorts: "black",
    glove: "white",
    transport: "carry",
    skill: 0.82,
  },
  {
    id: "pip-hartley",
    name: "PIP HARTLEY",
    character: "sunny",
    hatStyle: "bucket",
    hatColour: "sunburst",
    shirt: "coral",
    shorts: "khaki",
    glove: "auto",
    transport: "pullcart",
    skill: 0.54,
  },
  {
    id: "d-okafor",
    name: "D. OKAFOR",
    character: "ace",
    hatStyle: "visor",
    hatColour: "navy",
    shirt: "mint",
    shorts: "navy",
    glove: "black",
    transport: "caddy",
    skill: 0.74,
  },
  {
    id: "bea-moran",
    name: "BEA MORAN",
    character: "marigold",
    hatStyle: "wide",
    hatColour: "white",
    shirt: "sunburst",
    shorts: "black",
    glove: "auto",
    transport: "pullcart",
    skill: 0.36,
  },
  {
    id: "t-lindqvist",
    name: "T. LINDQVIST",
    character: "veteran",
    hatStyle: "flatcap",
    hatColour: "navy",
    shirt: "white",
    shorts: "navy",
    glove: "auto",
    transport: "carry",
    skill: 0.68,
  },
  {
    id: "r-patel",
    name: "R. PATEL",
    character: "caddie",
    hatStyle: "cap",
    hatColour: "red",
    shirt: "mint",
    shorts: "khaki",
    glove: "auto",
    transport: "carry",
    skill: 0.52,
  },
  {
    id: "sunny-reyes",
    name: "SUNNY REYES",
    character: "sunny",
    hatStyle: "none",
    hatColour: "auto",
    shirt: "coral",
    shorts: "white",
    glove: "auto",
    transport: "pullcart",
    skill: 0.43,
  },
  {
    id: "j-kim",
    name: "J. KIM",
    character: "pro",
    hatStyle: "beanie",
    hatColour: "navy",
    shirt: "black",
    shorts: "black",
    glove: "black",
    transport: "caddy",
    skill: 0.88,
  },
  {
    id: "neddo",
    name: "NEDDO",
    character: "rookie",
    hatStyle: "bucket",
    hatColour: "lime",
    shirt: "sunburst",
    shorts: "red",
    glove: "auto",
    transport: "carry",
    skill: 0.29,
  },
  {
    id: "greta-holm",
    name: "GRETA HOLM",
    character: "marigold",
    hatStyle: "visor",
    hatColour: "pink",
    shirt: "white",
    shorts: "mint",
    glove: "mint",
    transport: "pullcart",
    skill: 0.61,
  },
  {
    id: "coach-byrne",
    name: "COACH BYRNE",
    character: "veteran",
    hatStyle: "flatcap",
    hatColour: "auto",
    shirt: "black",
    shorts: "khaki",
    glove: "auto",
    transport: "carry",
    skill: 0.7,
  },
  {
    id: "lila-stone",
    name: "LILA STONE",
    character: "ace",
    hatStyle: "wide",
    hatColour: "coral",
    shirt: "navy",
    shorts: "white",
    glove: "white",
    transport: "caddy",
    skill: 0.58,
  },
];

// Headless skill attributes. Handicap is derived from these, not stored.
const NPC_ATTRIBUTES = {
  "mara-voss": { power: 0.78, control: 0.86, consistency: 0.82, shortGame: 0.84 },
  "pip-hartley": { power: 0.58, control: 0.52, consistency: 0.5, shortGame: 0.54 },
  "d-okafor": { power: 0.82, control: 0.7, consistency: 0.66, shortGame: 0.72 },
  "bea-moran": { power: 0.4, control: 0.34, consistency: 0.3, shortGame: 0.38 },
  "t-lindqvist": { power: 0.64, control: 0.76, consistency: 0.8, shortGame: 0.68 },
  "r-patel": { power: 0.5, control: 0.6, consistency: 0.62, shortGame: 0.52 },
  "sunny-reyes": { power: 0.48, control: 0.4, consistency: 0.34, shortGame: 0.46 },
  "j-kim": { power: 0.86, control: 0.92, consistency: 0.94, shortGame: 0.88 },
  neddo: { power: 0.36, control: 0.24, consistency: 0.2, shortGame: 0.3 },
  "greta-holm": { power: 0.6, control: 0.64, consistency: 0.68, shortGame: 0.62 },
  "coach-byrne": { power: 0.62, control: 0.78, consistency: 0.82, shortGame: 0.7 },
  "lila-stone": { power: 0.66, control: 0.58, consistency: 0.6, shortGame: 0.66 },
};

for (const profile of NPC_PROFILES) {
  const attributes = NPC_ATTRIBUTES[profile.id];
  if (attributes) Object.assign(profile, attributes);
}

export function npcHandicapIndex(profile) {
  if (!profile) return 18;
  const fallback = clamp(Number(profile.skill) || 0.5, 0, 1);
  const power = clamp(Number(profile.power) || fallback, 0, 1);
  const control = clamp(Number(profile.control) || fallback, 0, 1);
  const consistency = clamp(
    Number(profile.consistency) || fallback,
    0,
    1
  );
  const shortGame = clamp(Number(profile.shortGame) || fallback, 0, 1);
  const overall =
    power * 0.3 + control * 0.35 + consistency * 0.2 + shortGame * 0.15;
  return Math.round(clamp(36 - overall * 36, 0, 54) * 10) / 10;
}

const PROFILE_BY_ID = Object.fromEntries(
  NPC_PROFILES.map((profile) => [profile.id, profile])
);

export function resolveNpcLook(profile) {
  const character =
    CHARACTER_BY_ID[profile?.character] || CHARACTERS[0] || {};
  const hat = HAT_COLOUR_BY_ID[profile?.hatColour] || HAT_COLOUR_BY_ID.auto;
  const shirt =
    SHIRT_COLOUR_BY_ID[profile?.shirt] || SHIRT_COLOUR_BY_ID.auto;
  const shorts =
    SHORTS_COLOUR_BY_ID[profile?.shorts] || SHORTS_COLOUR_BY_ID.auto;
  const glove =
    GLOVE_COLOUR_BY_ID[profile?.glove] || GLOVE_COLOUR_BY_ID.auto;
  return {
    shirt: shirt.colour || character.shirt || "#5b8fd1",
    shirtLight: shirt.light || character.shirtLight || "#8fb8e8",
    shorts: shorts.colour || character.shorts || "#2f4b6b",
    skin: character.skin || "#e0a77d",
    hatStyle: profile?.hatStyle || "cap",
    hatMain: hat.colour || character.cap || "#f4f1e5",
    hatDark: hat.dark || character.capDark || "#d9d2bd",
    glove: glove.colour || null,
  };
}

function shuffle(list, rng) {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

export function buildRoundNpcs({
  startHole = 0,
  holeCount = 1,
  seed = Date.now(),
} = {}) {
  const rng = mulberry32((Number(seed) || Date.now()) >>> 0);
  const pool = shuffle(NPC_PROFILES.slice(), rng);
  const total = Math.max(1, Number(holeCount) || 1);
  const current = clamp(Math.floor(Number(startHole) || 0), 0, total - 1);
  const used = new Set();
  const slots = [];

  const add = (holeIndex, role, startShot, finished = false) => {
    if (holeIndex < 0 || holeIndex >= total || used.has(holeIndex)) return;
    used.add(holeIndex);
    slots.push({ holeIndex, role, startShot, finished });
  };

  add(current, "current", 1 + Math.floor(rng() * 2));
  if (current + 1 < total) {
    add(current + 1, "next", 1 + Math.floor(rng() * 2));
  }
  if (current - 1 >= 0) {
    add(current - 1, "previous", 2, true);
  }

  const rest = [];
  for (let i = 0; i < total; i++) if (!used.has(i)) rest.push(i);
  shuffle(rest, rng);
  while (slots.length < 4 && rest.length) {
    add(rest.pop(), slots.length < 2 ? "next" : "other", 1 + Math.floor(rng() * 2));
  }
  while (slots.length < 4) {
    slots.push({ holeIndex: -1, role: "unused", startShot: 0, finished: true });
  }

  return slots.map((slot, i) => {
    const profile = pool[i % pool.length];
    return {
      id: profile.id,
      name: profile.name,
      holeIndex: slot.holeIndex,
      role: slot.role,
      startShot: slot.startShot,
      finished: slot.finished,
      look: resolveNpcLook(profile),
      transport: profile.transport || "carry",
      skill: clamp(Number(profile.skill) || 0.5, 0, 1),
    };
  });
}

export function restoreRoundNpcs(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const out = [];
  for (const value of raw) {
    if (!value || typeof value !== "object") continue;
    const profile = PROFILE_BY_ID[value.id];
    out.push({
      id: String(value.id || profile?.id || "npc"),
      name: String(value.name || profile?.name || "NPC"),
      holeIndex: Number.isFinite(value.holeIndex) ? value.holeIndex : -1,
      role: typeof value.role === "string" ? value.role : "other",
      startShot: Number.isFinite(value.startShot) ? value.startShot : 1,
      finished: !!value.finished,
      look:
        value.look && typeof value.look === "object"
          ? { ...value.look }
          : resolveNpcLook(profile || NPC_PROFILES[0]),
      transport: value.transport || profile?.transport || "carry",
      skill: clamp(
        Number(value.skill ?? profile?.skill) || 0.5,
        0,
        1
      ),
    });
  }
  return out.length ? out : null;
}
