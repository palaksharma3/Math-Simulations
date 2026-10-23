/* ============================================================
   MathScribble
   Type a real formula -> it drives a live vector-field animation.
   Type anything else (words, feelings, nonsense) -> the text is
   hashed into a seed that deterministically generates its own
   unique "complex math" animation. Same phrase always looks the
   same; different phrases always look different.
   ============================================================ */

   //every const remains private to that function
(() => {
  "use strict";

  // ---------- DOM ----------
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d"); //ctx is now paintbrush

  const mathInput = document.getElementById("mathInput");
  const chips = document.getElementById("chips");
  const generateBtn = document.getElementById("generateBtn");
  const statusEl = document.getElementById("status");

  const speedSlider = document.getElementById("speed");
  const countSlider = document.getElementById("count");
  const trailSlider = document.getElementById("trail");
  const zoomSlider = document.getElementById("zoom");
  const speedVal = document.getElementById("speedVal");
  const countVal = document.getElementById("countVal");
  const trailVal = document.getElementById("trailVal");
  const zoomVal = document.getElementById("zoomVal");
  const showCurveBox = document.getElementById("showCurve");

  const pauseBtn = document.getElementById("pauseBtn");
  const colorBtn = document.getElementById("colorBtn");
  const saveBtn = document.getElementById("saveBtn");

  // ---------- canvas sizing (device-pixel aware) ----------
  let cssWidth = 0;
  let cssHeight = 0;

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    cssWidth = Math.max(1, rect.width);
    cssHeight = Math.max(1, rect.height);
    canvas.width = Math.round(cssWidth * dpr);
    canvas.height = Math.round(cssHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); //scales our *drawing commands* back down (makes sure x=100 is CSS 100 and not actual screen 100)
    // repaint background immediately so resizing never flashes white
    ctx.fillStyle = "#05030d";
    ctx.fillRect(0, 0, cssWidth, cssHeight);
  }

  //whenever the window resizes, call `resizeCanvas` again
  window.addEventListener("resize", resizeCanvas);

  // ---------- deterministic hashing / PRNG ----------
  //FNV-1a hash algorithm
  //convert any string ("galaxy brain") into one fixed 32-bit number, same input → same output, every time (deterministic)
  function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i); //numeric code of the i-th character (e.g., `'a'` → 97)
      h = Math.imul(h, 16777619); //multiplies two numbers *as 32-bit integers*
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296; //2^32: dividing by this converts the 32-bit integer into a float in `[0, 1`
    };
  }

  // ---------- "is this real math?" detection ----------
  //creating a plain JavaScript **array of strings**
  const FUNCS = [
    "asin", "acos", "atan2", "atan", "sinh", "cosh", "tanh",
    "sin", "cos", "tan", "sqrt", "cbrt", "abs", "exp",
    "log2", "log10", "log", "pow", "min", "max",
    "floor", "ceil", "round", "sign",
  ];
  const CONSTS = ["pi", "e"];

  function isValidMath(raw) {
    let s = raw.trim().toLowerCase();
    if (!s) return false;
    if (!/[xyt]/.test(s)) return false; // must reference at least one variable
    FUNCS.forEach((fn) => {
      s = s.split(fn).join(""); //replace every occurrence of `the fn` with nothing
    });
    CONSTS.forEach((c) => {
      s = s.split(new RegExp("\\b" + c + "\\b", "g")).join("");
    });
    s = s.replace(/[xyt]/g, "");
    s = s.replace(/[0-9.]+/g, "");
    s = s.replace(/\*\*/g, "");
    s = s.replace(/[+\-*/%^(),\s]/g, "");
    return s.length === 0;
  }

  function compileMath(raw) {
    const body = raw.trim().toLowerCase().replace(/\^/g, "**");
    const src = `
      const {sin,cos,tan,asin,acos,atan,atan2,sinh,cosh,tanh,
             sqrt,cbrt,abs,exp,log2,log10,log,pow,min,max,
             floor,ceil,round,sign,PI:pi,E:e} = Math;
      const v = (${body});
      return Number.isFinite(v) ? v : 0;
    `;
    try {
      const fn = new Function("x", "y", "t", src);
      const probe = fn(0.37, -0.21, 0.5);
      if (typeof probe !== "number" || Number.isNaN(probe)) return null;
      return fn;
    } catch (err) {
      return null;
    }
  }

  // ---------- generative fallback for plain text ----------
  function synthFromText(text) {
    const seed = hashString(text || "blank canvas");
    const rand = mulberry32(seed);
    const termCount = 3 + Math.floor(rand() * 3); // 3..5 terms
    const terms = [];
    for (let i = 0; i < termCount; i++) {
      terms.push({
        ax: (rand() * 3.2 + 0.4) * (rand() < 0.5 ? 1 : -1),
        ay: (rand() * 3.2 + 0.4) * (rand() < 0.5 ? 1 : -1),
        at: (rand() * 1.6 + 0.15) * (rand() < 0.5 ? 1 : -1),
        phase: rand() * Math.PI * 2,
        amp: 0.35 + rand() * 0.65,
        useSin: rand() < 0.5,
      });
    }
    const fn = (x, y, t) => {
      let v = 0;
      for (const term of terms) {
        const arg = term.ax * x + term.ay * y + term.at * t + term.phase;
        v += term.amp * (term.useSin ? Math.sin(arg) : Math.cos(arg));
      }
      return v;
    };
    return { fn, seed };
  }

  // ---------- color palette ----------
  function paletteFromSeed(seed, spin) {
    const rand = mulberry32((seed ^ Math.imul(spin + 1, 2654435761)) >>> 0);
    const base = Math.floor(rand() * 360);
    return [
      base,
      (base + 40 + rand() * 20) % 360,
      (base + 190 + rand() * 20) % 360,
      (base + 300 + rand() * 20) % 360,
    ];
  }

  // ---------- simulation state ----------
  const WORLD_RANGE = 1.6; // particles spawn within [-range, range]
  const WORLD_BOUND = 2.6; // particles respawn once they drift past this

  let currentFn = null;
  let currentSeed = 0;
  let colorSpin = 0;
  let palette = [260, 320, 190, 40];
  let mode = "—";

  let particles = [];
  let t = 0;
  let lastFrame = 0;
  let paused = false;

  let ripples = [];

  const state = {
    speed: parseFloat(speedSlider.value),
    count: parseInt(countSlider.value, 10),
    trail: parseInt(trailSlider.value, 10),
    zoom: parseFloat(zoomSlider.value),
    showCurve: showCurveBox.checked,
  };

  function initParticles(n) {
    const arr = new Array(n);
    for (let i = 0; i < n; i++) {
      arr[i] = {
        x: (Math.random() * 2 - 1) * WORLD_RANGE,
        y: (Math.random() * 2 - 1) * WORLD_RANGE,
        hue: Math.random(),
      };
    }
    particles = arr;
  }

  function screenScale() {
    const minDim = Math.min(cssWidth, cssHeight);
    return (minDim / 2 / 3) * state.zoom;
  }

  function fadeAlphaFromTrail(trail) {
    // trail: 2 (short, fast fade) .. 30 (long, barely fades)
    const clamped = Math.min(30, Math.max(2, trail));
    return 0.46 - ((clamped - 2) / 28) * 0.43; // 0.46 .. 0.03
  }

  function gradient(fn, x, y, time) {
    const eps = 0.0015;
    const fx = (fn(x + eps, y, time) - fn(x - eps, y, time)) / (2 * eps);
    const fy = (fn(x, y + eps, time) - fn(x, y - eps, time)) / (2 * eps);
    return [fx, fy];
  }

  function drawSignatureCurve(scale) {
    const steps = 260;
    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * Math.PI * 2;
      const r = 1.05 + 0.5 * currentFn(Math.cos(theta) * 1.3, Math.sin(theta) * 1.3, t * 0.6);
      const x = Math.cos(theta) * r;
      const y = Math.sin(theta) * r;
      if (i === 0) ctx.moveTo(x * scale, y * scale);
      else ctx.lineTo(x * scale, y * scale);
    }
    ctx.closePath();
    ctx.lineWidth = 2;
    ctx.strokeStyle = `hsla(${palette[2]}, 90%, 70%, 0.9)`;
    ctx.shadowColor = `hsla(${palette[2]}, 90%, 65%, 0.9)`;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (!lastFrame) lastFrame = now;
    const dt = Math.min(0.05, (now - lastFrame) / 1000);
    lastFrame = now;
    if (paused || !currentFn) return;

    t += dt * state.speed;
    const scale = screenScale();
    const fadeAlpha = fadeAlphaFromTrail(state.trail);

    ctx.setTransform((window.devicePixelRatio || 1), 0, 0, (window.devicePixelRatio || 1), 0, 0);
    ctx.fillStyle = `rgba(5, 3, 13, ${fadeAlpha})`;
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.save();
    ctx.translate(cssWidth / 2, cssHeight / 2);

    // ripple pulses from clicks — gentle outward nudge, fades over ~1.2s
    ripples = ripples.filter((r) => now - r.born < 1200);

    const moveStep = 0.016 * state.speed;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const [fx, fy] = gradient(currentFn, p.x, p.y, t);
      let vx = fy;
      let vy = -fx;
      const mag = Math.hypot(vx, vy) || 1;
      vx /= mag;
      vy /= mag;

      for (const r of ripples) {
        const dx = p.x - r.x;
        const dy = p.y - r.y;
        const d = Math.hypot(dx, dy) || 0.0001;
        const age = (now - r.born) / 1200;
        const push = Math.max(0, 0.08 * (1 - age) / d);
        vx += (dx / d) * push;
        vy += (dy / d) * push;
      }

      p.x += vx * moveStep;
      p.y += vy * moveStep;

      if (Math.abs(p.x) > WORLD_BOUND || Math.abs(p.y) > WORLD_BOUND) {
        p.x = (Math.random() * 2 - 1) * WORLD_RANGE;
        p.y = (Math.random() * 2 - 1) * WORLD_RANGE;
      }

      const hue = (palette[0] + p.hue * 70 + t * 10) % 360;
      ctx.fillStyle = `hsla(${hue}, 85%, 64%, 0.85)`;
      ctx.beginPath();
      ctx.arc(p.x * scale, p.y * scale, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state.showCurve) drawSignatureCurve(scale);

    ctx.restore();
  }

  // ---------- generate / apply ----------
  function generate() {
    const raw = mathInput.value;
    const trimmed = raw.trim();

    if (trimmed && isValidMath(trimmed)) {
      const compiled = compileMath(trimmed);
      if (compiled) {
        currentFn = compiled;
        currentSeed = hashString(trimmed.toLowerCase());
        mode = "Math equation";
      } else {
        const synth = synthFromText(trimmed || "blank canvas");
        currentFn = synth.fn;
        currentSeed = synth.seed;
        mode = "Generative pattern (couldn't evaluate, improvised)";
      }
    } else {
      const synth = synthFromText(trimmed || "blank canvas");
      currentFn = synth.fn;
      currentSeed = synth.seed;
      mode = trimmed ? "Generative pattern" : "Generative pattern (empty input)";
    }

    palette = paletteFromSeed(currentSeed, colorSpin);
    initParticles(state.count);
    t = 0;
    statusEl.textContent = `Mode: ${mode} · ${state.count.toLocaleString()} particles`;
  }

  // ---------- UI wiring ----------
  function syncLabels() {
    speedVal.textContent = `${state.speed.toFixed(1)}x`;
    countVal.textContent = state.count.toLocaleString();
    trailVal.textContent = state.trail;
    zoomVal.textContent = `${state.zoom.toFixed(1)}x`;
  }

  speedSlider.addEventListener("input", () => {
    state.speed = parseFloat(speedSlider.value);
    syncLabels();
  });

  trailSlider.addEventListener("input", () => {
    state.trail = parseInt(trailSlider.value, 10);
    syncLabels();
  });

  zoomSlider.addEventListener("input", () => {
    state.zoom = parseFloat(zoomSlider.value);
    syncLabels();
  });

  countSlider.addEventListener("input", () => {
    state.count = parseInt(countSlider.value, 10);
    syncLabels();
    initParticles(state.count);
  });

  showCurveBox.addEventListener("change", () => {
    state.showCurve = showCurveBox.checked;
  });

  chips.addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    mathInput.value = btn.dataset.v;
    generate();
  });

  generateBtn.addEventListener("click", generate);

  mathInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      generate();
    }
  });

  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.textContent = paused ? "Resume" : "Pause";
    lastFrame = 0;
  });

  colorBtn.addEventListener("click", () => {
    colorSpin += 1;
    palette = paletteFromSeed(currentSeed, colorSpin);
  });

  saveBtn.addEventListener("click", () => {
    const link = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    link.download = `mathscribble-${stamp}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  canvas.addEventListener("pointerdown", (e) => {
    const rect = canvas.getBoundingClientRect();
    const scale = screenScale();
    const px = (e.clientX - rect.left - cssWidth / 2) / scale;
    const py = (e.clientY - rect.top - cssHeight / 2) / scale;
    ripples.push({ x: px, y: py, born: performance.now() });
  });

  // ---------- boot ----------
  resizeCanvas();
  syncLabels();
  generate();
  requestAnimationFrame(loop);
})();
