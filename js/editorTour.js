// First-run screenshot tour for the course editor.
//
// The images live in tutorial/ and are captured from the real editor. Each
// slide may carry a `focus` rectangle (fractions of the screenshot) that the
// overlay spotlights while the rest of the picture is dimmed.

const SEEN_KEY = "golfpocket.editorTour.seen.v1";

const SLIDES = [
  {
    image: "tutorial/tour-01.webp",
    alt: "The GolfPocket course editor with a finished hole on the design canvas",
    title: "Build a course, one hole at a time",
    body:
      "This editor makes the courses the game plays. You draw a hole on the big map, check it with the game's own painter, then export one .glfpkt file. This short tour builds a single hole.",
    focus: null,
  },
  {
    image: "tutorial/tour-02.webp",
    alt: "The New Course dialog with name, course ID, hole count and theme fields",
    title: "Create the course",
    body:
      "Press NEW COURSE. Give it a name and an ID, choose 9 holes, pick a theme, then CREATE COURSE. The other holes stay empty for now — today you only need Hole 1.",
    focus: { x: 0.334722, y: 0.167500, w: 0.330556, h: 0.665000 },
  },
  {
    image: "tutorial/tour-03.webp",
    alt: "Hole 1 selected on the design canvas with its red export frame",
    title: "Work in one hole",
    body:
      "Click the Hole 1 tab at the bottom. Every hole has its own plot on the shared map. The red dashed rectangle is the export frame: the hole is rotated upright and cut to that shape when you export.",
    focus: { x: 0.058333, y: 0.928889, w: 0.723611, h: 0.068889 },
  },
  {
    image: "tutorial/tour-04.webp",
    alt: "The TEE and PIN tools in the editor toolbar",
    title: "Set the ends with TEE and PIN",
    body:
      "Choose TEE and click near the bottom of the plot. Choose PIN and click above it. The frame and the length readout follow those two points: about 1000 px is 254 m, a solid par 4.",
    focus: { x: 0.000000, y: 0.214444, w: 0.052083, h: 0.180000 },
  },
  {
    image: "tutorial/tour-05.webp",
    alt: "A green placed around the pin with the green size sliders visible",
    title: "Place the GREEN",
    body:
      "Choose GREEN and click just below the pin, or drag outward to size it. The default 70 × 58 ellipse is a good start. Keep the pin inside the green or VALIDATION will warn you.",
    focus: { x: 0.000000, y: 0.270000, w: 0.052083, h: 0.068889 },
  },
  {
    image: "tutorial/tour-06.webp",
    alt: "A fairway centreline drawn from the tee to the green",
    title: "Draw the FAIRWAY",
    body:
      "Choose FAIRWAY, click a few points from the tee to the green, then double-click or press Enter. Set the width with the slider. Use two segments if water or a gap splits the fairway.",
    focus: { x: 0.000000, y: 0.158889, w: 0.052083, h: 0.068889 },
  },
  {
    image: "tutorial/tour-07.webp",
    alt: "A pond, bunker and trees placed around the hole",
    title: "Add hazards and scenery",
    body:
      "Drag with POND or BUNKER to paint hazards; click with TREE to block shots. Everything inside the red frame is kept. Anything outside it is cut from the hole on export.",
    focus: { x: 0.000000, y: 0.381111, w: 0.052083, h: 0.180000 },
  },
  {
    image: "tutorial/tour-08.webp",
    alt: "The validation panel and the Preview button",
    title: "Check it, then play it",
    body:
      "The inspector lists errors and warnings. Fix red errors first, then press PREVIEW to play the hole with the game's painter. Only the hole you are editing has to be complete.",
    focus: { x: 0.788194, y: 0.729132, w: 0.200694, h: 0.087778 },
  },
  {
    image: "tutorial/tour-09.webp",
    alt: "Deleting the unused hole tabs to leave a one-hole course",
    title: "Keep just this hole",
    body:
      "Set the hole name and par in the inspector. To get down to one hole, select each unused tab and press DELETE HOLE. Run ANALYSE and APPLY SUGGESTED PARS if you want the game's suggested par.",
    focus: { x: 0.788194, y: 0.458021, w: 0.200694, h: 0.121111 },
  },
  {
    image: "tutorial/tour-10.webp",
    alt: "The export dialog with the download button for a .glfpkt course",
    title: "Save and share",
    body:
      "SAVE DRAFT keeps work in this browser; SAVE FILE writes a resumable .glfppart. When the course is ready, EXPORT COURSE downloads a .glfpkt. Players import it from Settings → Courses.",
    focus: { x: 0.313889, y: 0.205000, w: 0.372222, h: 0.590000 },
  },
];

const LAST_SLIDE = SLIDES.length - 1;
const byId = (id) => document.getElementById(id);

let els = null;
let index = 0;
let open = false;
let seenThisSession = false;
let lastFocus = null;
let preloaded = false;

function hasSeen() {
  if (seenThisSession) return true;
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function markSeen() {
  seenThisSession = true;
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    // Storage can be blocked. The in-memory flag still stops repeats.
  }
}

function preload() {
  if (preloaded) return;
  preloaded = true;
  for (const slide of SLIDES) {
    const img = new Image();
    img.src = slide.image;
  }
}

function positionSpotlight(slide) {
  if (!els) return;
  const spot = els.spot;
  const shade = els.shade;
  const focus = slide.focus;
  if (!focus) {
    spot.classList.add("hidden");
    shade?.classList.add("hidden");
    return;
  }
  const x = Math.max(0, Math.min(0.98, focus.x));
  const y = Math.max(0, Math.min(0.98, focus.y));
  const w = Math.max(0.01, Math.min(1 - x, focus.w));
  const h = Math.max(0.01, Math.min(1 - y, focus.h));
  if (shade) {
    shade.classList.remove("hidden");
    shade.style.setProperty("--fx", String(x));
    shade.style.setProperty("--fy", String(y));
    shade.style.setProperty("--fw", String(w));
    shade.style.setProperty("--fh", String(h));
  }
  spot.classList.remove("hidden");
  spot.style.left = `${x * 100}%`;
  spot.style.top = `${y * 100}%`;
  spot.style.width = `${w * 100}%`;
  spot.style.height = `${h * 100}%`;
}

function renderDots() {
  if (!els) return;
  els.dots.innerHTML = "";
  for (let i = 0; i <= LAST_SLIDE; i++) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `ed-tour-dot${i === index ? " on" : ""}`;
    dot.setAttribute("aria-label", `Go to step ${i + 1}`);
    dot.addEventListener("click", () => show(i));
    els.dots.appendChild(dot);
  }
}

function show(next) {
  if (!els) return;
  index = Math.max(0, Math.min(LAST_SLIDE, next));
  const slide = SLIDES[index];
  els.step.textContent = `STEP ${index + 1} OF ${SLIDES.length}`;
  els.title.textContent = slide.title;
  els.body.textContent = slide.body;
  els.back.disabled = index === 0;
  els.next.textContent = index === LAST_SLIDE ? "START BUILDING" : "NEXT";
  els.image.alt = slide.alt;
  els.image.src = slide.image;
  renderDots();
  positionSpotlight(slide);
  els.shell.classList.remove("ed-tour-in");
  setTimeout(() => els.shell.classList.add("ed-tour-in"), 20);
  els.next.focus({ preventScroll: true });
}

function openTour(force = false) {
  if (!els) return;
  if (open) return;
  if (!force && hasSeen()) return;
  preload();
  open = true;
  lastFocus = document.activeElement;
  const editor = document.getElementById("editor");
  if (editor) editor.inert = true;
  els.root.classList.remove("hidden");
  document.body.classList.add("ed-tour-open");
  show(0);
  window.addEventListener("keydown", onKeyDown);
}

function closeTour() {
  if (!els || !open) return;
  open = false;
  markSeen();
  els.root.classList.add("hidden");
  document.body.classList.remove("ed-tour-open");
  const editor = document.getElementById("editor");
  if (editor) editor.inert = false;
  window.removeEventListener("keydown", onKeyDown);
  if (lastFocus && typeof lastFocus.focus === "function") {
    lastFocus.focus({ preventScroll: true });
  }
}

function onKeyDown(event) {
  if (!open) return;
  if (event.key === "Escape") {
    event.preventDefault();
    closeTour();
    return;
  }
  if (event.key === "ArrowRight" || event.key === " ") {
    event.preventDefault();
    if (index === LAST_SLIDE) closeTour();
    else show(index + 1);
    return;
  }
  if (event.key === "ArrowLeft") {
    event.preventDefault();
    show(index - 1);
  }
}

export function initEditorTour() {
  const root = byId("editorTour");
  const tourBtn = byId("tourBtn");
  if (!root) return;
  els = {
    root,
    shell: root.querySelector(".ed-tour-shell"),
    image: byId("tourImage"),
    shade: byId("tourShade"),
    spot: byId("tourSpot"),
    step: byId("tourStep"),
    dots: byId("tourDots"),
    title: byId("tourTitle"),
    body: byId("tourBody"),
    back: byId("tourBackBtn"),
    next: byId("tourNextBtn"),
    skip: byId("tourSkipBtn"),
  };
  els.back.addEventListener("click", () => show(index - 1));
  els.next.addEventListener("click", () => {
    if (index === LAST_SLIDE) closeTour();
    else show(index + 1);
  });
  els.skip.addEventListener("click", closeTour);
  tourBtn?.addEventListener("click", () => openTour(true));

  preload();

  const params = new URLSearchParams(location.search);
  const mode = params.get("tour");
  if (mode === "1") {
    setTimeout(() => openTour(true), 80);
    return;
  }
  if (mode === "0" || hasSeen()) return;
  setTimeout(() => openTour(), 160);
}

export function replayEditorTour() {
  openTour(true);
}

export function closeEditorTour() {
  closeTour();
}

// Handy for screenshots and manual checks.
if (typeof window !== "undefined") {
  window.__editorTour = {
    open: replayEditorTour,
    close: closeEditorTour,
    slides: SLIDES,
    reset: () => {
      seenThisSession = false;
      try {
        localStorage.removeItem(SEEN_KEY);
      } catch {
        // ignore
      }
    },
  };
}
