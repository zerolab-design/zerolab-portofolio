/* ============================================================
   ZeroLab — Portfolio
   Infinite carousel (horizontal/vertical) with detail animations:
   directional stage transitions, focus-snap brackets, split-flap
   name roll, odometer counter, velocity skew, strip parallax +
   distance dim, sliding switcher chip, custom cursor, waveform
   breathing, intro reveal and mode-switch choreography.
   All motion respects prefers-reduced-motion.
   ============================================================ */

(function () {
  "use strict";

  // Everything below runs once the project list has loaded. config.js fetches
  // content/projects.json, so nothing here can build until that resolves — see
  // the bottom of this file for the gate.
  function __init() {

  // Don't let the browser restore the (huge) scroll position on reload — it
  // would inject a bogus scroll delta into the carousel on load.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

  var STORAGE_KEY = "zerolab.projects.override";
  var MODE_KEY = "zerolab.mode";

  // ---------- Motion preference ----------

  var motionQuery = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

  function reduceMotion() {
    return !!(motionQuery && motionQuery.matches);
  }

  // ---------- Projects (config + optional GUI override) ----------

  function loadProjects() {
    var base = (window.PROJECTS || []).map(function (p, i) {
      return {
        name: p.name,
        subtitle: p.subtitle,
        image: p.image,
        thumb: p.thumb || p.image,
        slug: (p.slug || p.name || "project-" + i).toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        year: p.year || "",
        role: p.role || "",
        href: p.href || "",
        // The case page's hero. The leaving panel shows it, so dropping it here
        // silently turns the panel back into a blank rectangle.
        hero: p.hero || p.image || "",
        // Same reason: the panel renders the whole hero block, and anything
        // missing from this map simply never reaches it.
        heroMeta: p.heroMeta || [],
        heroIntro: p.heroIntro || "",
      };
    });
    // The old ✎ Edit panel (editor.js, removed) stored name/subtitle overrides
    // here and they were applied on top of the real content. That silently beat
    // anything edited in the CMS — a stale override would keep showing an old
    // name forever, on that browser only. Content now comes from the CMS alone,
    // so the override is gone and any leftover copy is cleared once.
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      /* private mode or storage disabled — nothing to clean up */
    }
    return base;
  }

  var projects = loadProjects();
  var N = projects.length;

  // ---------- Layout mode (horizontal | vertical) ----------

  var mode = "horizontal";
  try {
    var savedMode = localStorage.getItem(MODE_KEY);
    if (savedMode === "vertical" || savedMode === "horizontal" || savedMode === "grid") mode = savedMode;
  } catch (e) {
    /* storage unavailable */
  }

  // ---------- Deep link (#mode/slug) ----------
  // "#grid/serein" opens grid mode on Serein; "#serein" keeps the saved mode.
  // The hash is kept up to date (replaceState) so any state can be shared.

  var VALID_MODES = { horizontal: true, vertical: true, grid: true };
  var hashReady = false; // suppress writes until init is done
  var initialIdx = 0;

  (function parseHash() {
    var h = (location.hash || "").replace(/^#/, "").toLowerCase();
    if (!h) return;
    var parts = h.split("/");
    var slugPart = parts[0];
    if (VALID_MODES[parts[0]]) {
      mode = parts[0];
      slugPart = parts[1] || "";
    }
    if (slugPart) {
      for (var i = 0; i < N; i++) {
        if (projects[i].slug === slugPart) {
          initialIdx = i;
          break;
        }
      }
    }
  })();

  function updateHash() {
    if (!hashReady || activeIdx < 0) return;
    try {
      history.replaceState(null, "", "#" + mode + "/" + projects[activeIdx].slug);
    } catch (e) {
      /* ignore (e.g. file://) */
    }
  }

  function isVertical() {
    return mode === "vertical";
  }

  function isGrid() {
    return mode === "grid";
  }

  // ---------- DOM ----------

  var film = document.getElementById("film");
  var track = document.getElementById("filmTrack");
  var stageA = document.getElementById("stageA");
  var stageB = document.getElementById("stageB");
  var stageFrameEl = document.getElementById("stageFrame");
  var projPrev = document.getElementById("projPrev");
  var projNext = document.getElementById("projNext");
  var projActive = document.getElementById("projActive");
  var projName = document.getElementById("projName");
  var projSub = document.getElementById("projSub");
  var counterNow = document.getElementById("counterNow");
  var counterTotal = document.getElementById("counterTotal");
  var canvas = document.getElementById("waveCanvas");
  var ctx = canvas.getContext("2d");
  var waveMarker = document.querySelector(".wave-marker");
  var switcherEl = document.querySelector(".switcher");
  var gridEl = document.getElementById("grid");
  var gridStage = document.getElementById("gridStage");
  var gridCellsEl = document.getElementById("gridCells");
  var gridTitle = document.getElementById("gridTitle");
  var gtBlack = document.getElementById("gtBlack");
  var gtWhite = document.getElementById("gtWhite");
  var gridBrackets = document.querySelector(".grid-brackets");
  var stageLink = document.getElementById("stageLink");
  var stageMeta = document.getElementById("stageMeta");
  var waveEl = document.querySelector(".wave");
  var sndBtn = document.getElementById("sndBtn");
  var a11yStatus = document.getElementById("a11yStatus");
  var loaderEl = document.getElementById("loader");
  var loaderCount = document.getElementById("loaderCount");
  var loaderTotal = document.getElementById("loaderTotal");

  // ---------- Geometry ----------

  var uh, coverW, coverH, gap, step, loopLen;

  function measure() {
    // Contain-scale — must match the CSS --uh so JS-sized covers stay in sync.
    // Guard the zero case: a hidden or not-yet-laid-out window reports 0 for
    // innerWidth/innerHeight, which would make `step` 0 and cascade badly —
    // buildTrack() computes NaN cells and builds an empty strip, and frame()
    // divides by zero, producing projects[NaN] and killing the rAF loop.
    // Falling back to the design canvas keeps every derived value finite; the
    // resize handler re-measures once real dimensions arrive.
    var vw = window.innerWidth || 1440;
    var vh = window.innerHeight || 900;
    uh = Math.min(vh / 900, vw / 1440);
    if (!(uh > 0)) uh = 1;
    coverH = 172.08 * uh;
    coverW = coverH * (252 / 172.08);
    // Fixed 16px so the cover gap matches the fixed ±16px internal parallax
    // (see frame()) and stays consistent across every responsive breakpoint,
    // rather than shrinking with --uh.
    gap = 16;
    // Step is the distance between covers along the scroll axis: cover width in
    // horizontal mode, cover height in vertical mode.
    step = (isVertical() ? coverH : coverW) + gap;
    loopLen = N * step;
  }

  // ---------- Film strip ----------

  var copies = 0;
  var cells = [];

  // If a thumbnail file is missing, quietly fall back to the full image.
  function thumbFallback() {
    this.onerror = null;
    if (this.dataset.full && this.src.indexOf(this.dataset.full) === -1) this.src = this.dataset.full;
  }

  function buildTrack() {
    track.style.gap = gap + "px";
    var span = isVertical() ? window.innerHeight : window.innerWidth;
    var needed = Math.max(3, Math.ceil((span + 2 * loopLen) / loopLen) + 1);
    if (needed !== copies) {
      copies = needed;
      track.innerHTML = "";
      for (var c = 0; c < copies; c++) {
        for (var i = 0; i < N; i++) {
          var cell = document.createElement("div");
          cell.className = "film-cover";
          cell.dataset.index = String(i);
          var img = document.createElement("img");
          img.src = projects[i].thumb; // strip shows small covers — thumbs are enough
          img.alt = projects[i].name;
          img.dataset.full = projects[i].image;
          img.onerror = thumbFallback;
          cell.appendChild(img);
          track.appendChild(cell);
        }
      }
    }
    cells = Array.prototype.slice.call(track.children);
  }

  // ---------- Virtual scroll state (spring physics) ----------

  var target = 0;
  var current = 0;
  var vel = 0;
  var velSmooth = 0;
  var skewSmooth = 0;
  var activeIdx = -1;
  var lastStepCount = 0;
  var snapTimer = null;

  function mod(v, m) {
    return ((v % m) + m) % m;
  }

  function scheduleSnap(delay) {
    clearTimeout(snapTimer);
    snapTimer = setTimeout(function () {
      target = Math.round(target / step) * step;
    }, delay || 160);
  }

  // Wheel/trackpad input is handled by Lenis (smooth-scroll engine); its
  // inertial scroll delta is read each frame in frame() and fed to the
  // carousel. See the "Lenis smooth scroll" section below.

  window.addEventListener("keydown", function (e) {
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // 1/2/3 switch the layout
    if (e.key === "1") return setMode("horizontal");
    if (e.key === "2") return setMode("vertical");
    if (e.key === "3") return setMode("grid");
    if (isGrid()) {
      if (e.key === "ArrowRight" || e.key === "ArrowDown") gridStep(1);
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") gridStep(-1);
      return;
    }
    var fwd = isVertical() ? "ArrowDown" : "ArrowRight";
    var back = isVertical() ? "ArrowUp" : "ArrowLeft";
    if (e.key === fwd) target = (Math.round(target / step) + 1) * step;
    if (e.key === back) target = (Math.round(target / step) - 1) * step;
  });

  // Drag on the film strip (also works on touch)
  var dragging = false;
  var dragMoved = 0;
  var lastPos = 0;

  function pointerPos(e) {
    return isVertical() ? e.clientY : e.clientX;
  }

  film.addEventListener("pointerdown", function (e) {
    dragging = true;
    dragMoved = 0;
    lastPos = pointerPos(e);
    film.classList.add("is-dragging");
    try {
      film.setPointerCapture(e.pointerId);
    } catch (err) {
      /* some pointer types can't be captured */
    }
    clearTimeout(snapTimer);
  });

  film.addEventListener("pointermove", function (e) {
    if (!dragging) return;
    var pos = pointerPos(e);
    var d = pos - lastPos;
    lastPos = pos;
    dragMoved += Math.abs(d);
    target -= d;
  });

  film.addEventListener("pointerup", function (e) {
    dragging = false;
    film.classList.remove("is-dragging");
    if (lenis) lastLenisScroll = lenis.scroll; // absorb any scroll during the drag
    if (dragMoved < 6) {
      // Treat as a click: bring the tapped cover to the center. Tapping the
      // cover that is ALREADY centered opens its case study instead.
      var cell = e.target.closest ? e.target.closest(".film-cover") : null;
      if (cell) {
        var ci = parseInt(cell.dataset.index, 10);
        if (ci === activeIdx && projects[ci] && projects[ci].href) {
          leaveTo(projects[ci]);
          return;
        }
        var rect = cell.getBoundingClientRect();
        var center = isVertical()
          ? rect.top + rect.height / 2 - window.innerHeight / 2
          : rect.left + rect.width / 2 - window.innerWidth / 2;
        target = current + center;
      }
    }
    scheduleSnap(60);
  });

  film.addEventListener("pointercancel", function () {
    dragging = false;
    film.classList.remove("is-dragging");
    scheduleSnap(60);
  });

  // ---------- Stage (directional crossfade) ----------

  var frontIsA = false;

  function showCover(idx, dir) {
    var incoming = frontIsA ? stageB : stageA;
    var outgoing = frontIsA ? stageA : stageB;
    frontIsA = !frontIsA;
    incoming.src = projects[idx].image;
    var axis = isVertical() ? "Y" : "X";
    if (dir && !reduceMotion()) {
      // New cover slides in following the scroll direction, then settles.
      incoming.style.transition = "none";
      incoming.style.transform = "translate" + axis + "(" + dir * 5 + "%) scale(1.045)";
      void incoming.offsetWidth;
      incoming.style.transition = "";
      incoming.style.transform = "translate" + axis + "(0%) scale(1)";
      outgoing.style.transform = "translate" + axis + "(" + dir * -3 + "%) scale(1.02)";
    } else {
      incoming.style.transform = "";
      outgoing.style.transform = "";
    }
    incoming.classList.add("is-visible");
    outgoing.classList.remove("is-visible");
  }

  // Viewfinder brackets do a quick "focus hunt" on every project change.
  function focusBrackets() {
    stageFrameEl.classList.remove("is-focusing");
    void stageFrameEl.offsetWidth;
    stageFrameEl.classList.add("is-focusing");
  }

  // ---------- Project name (split-flap roll) ----------

  function setName(name, animate) {
    if (!animate || reduceMotion()) {
      projName.textContent = name;
      return;
    }
    projName.textContent = "";
    for (var i = 0; i < name.length; i++) {
      var ch = document.createElement("span");
      ch.className = "pn-ch";
      ch.textContent = name[i] === " " ? " " : name[i];
      ch.style.animationDelay = i * 24 + "ms";
      projName.appendChild(ch);
    }
  }

  // ---------- Counter (odometer) ----------

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  var odoStrips = [];
  var odoDigits = Math.max(2, String(N).length);

  function buildOdometer() {
    counterNow.textContent = "";
    odoStrips = [];
    for (var d = 0; d < odoDigits; d++) {
      var odo = document.createElement("span");
      odo.className = "odo";
      var strip = document.createElement("span");
      strip.className = "odo-strip";
      for (var n = 0; n <= 9; n++) {
        var digit = document.createElement("span");
        digit.textContent = String(n);
        strip.appendChild(digit);
      }
      odo.appendChild(strip);
      counterNow.appendChild(odo);
      odoStrips.push(strip);
    }
  }

  function setCounter(idx) {
    var str = String(idx + 1).padStart(odoDigits, "0");
    for (var d = 0; d < odoStrips.length; d++) {
      odoStrips[d].style.transform = "translateY(" + -parseInt(str[d], 10) * 0.87 + "em)";
    }
    counterTotal.textContent = "/" + pad(N);
  }

  // ---------- Waveform marker pulse ----------

  function pulseMarker() {
    if (!waveMarker) return;
    waveMarker.classList.remove("is-pulse");
    void waveMarker.offsetWidth;
    waveMarker.classList.add("is-pulse");
  }

  // ---------- Project list ----------

  // Up to 4 names on each side (like the design), fewer when there aren't
  // enough projects to keep every listed name unique.
  var sideCount = Math.min(4, Math.floor((N - 1) / 2));

  function renderSideList(el, startOffset, animate) {
    el.innerHTML = "";
    for (var k = 0; k < sideCount; k++) {
      var idx = mod(activeIdx + startOffset + k, N);
      var li = document.createElement("li");
      li.textContent = projects[idx].name;
      li.dataset.index = String(idx);
      if (animate && !reduceMotion()) li.style.animationDelay = k * 45 + "ms";
      else li.style.animation = "none";
      el.appendChild(li);
    }
  }

  // Tab title + share/meta state follow the active project.
  function updateTitleMeta(idx) {
    document.title = pad(idx + 1) + "/" + pad(N) + " — " + projects[idx].name + " · ZeroLab";
  }

  // Screen-reader announcement (polite) for the active project.
  function announce(idx) {
    if (!a11yStatus) return;
    a11yStatus.textContent =
      projects[idx].name + " — " + projects[idx].subtitle + " (" + (idx + 1) + " of " + N + ")";
  }

  // The clickable stage layer: destination + hover metadata.
  function updateStageLink(idx) {
    if (!stageLink) return;
    var p = projects[idx];
    if (p.href) {
      stageLink.href = p.href;
      stageLink.classList.remove("is-disabled");
    } else {
      stageLink.removeAttribute("href");
      stageLink.classList.add("is-disabled");
    }
    stageLink.setAttribute("aria-label", "View case study: " + p.name);
    if (stageMeta) {
      var bits = [];
      if (p.year) bits.push(p.year);
      if (p.role) bits.push(p.role);
      if (p.subtitle) bits.push(p.subtitle);
      stageMeta.textContent = bits.join("  ·  ");
    }
  }

  function setActive(idx, dir, animate) {
    var anim = animate !== false;
    activeIdx = idx;
    showCover(idx, anim ? dir || 0 : 0);
    setName(projects[idx].name, anim);
    projSub.textContent = projects[idx].subtitle;
    renderSideList(projPrev, -sideCount, anim);
    renderSideList(projNext, 1, anim);
    setCounter(idx);
    updateStageLink(idx);
    updateTitleMeta(idx);
    announce(idx);
    updateHash();
    preloadNeighbors(idx);
    preloadHero(projects[idx]);
    if (anim && !reduceMotion()) {
      focusBrackets();
      pulseMarker();
      tickSound();
      projActive.classList.remove("is-switching");
      void projActive.offsetWidth; // restart the subtitle swap animation
      projActive.classList.add("is-switching");
    }
  }

  // ---------- Leaving for a case study ----------
  // A real navigation destroys this document the instant it commits, so the
  // incoming page has nothing to animate over. The panel therefore runs HERE,
  // over the still-visible home page, and we only leave once the screen is
  // solid — the case page then paints onto the same colour, so the swap between
  // two documents is invisible.

  // Kept warm so the panel never starts travelling on an image that has not
  // decoded yet — that would show as a blank rectangle for the first frames,
  // which is exactly what the panel exists to avoid.
  var heroPreloader = new Image();
  function preloadHero(p) {
    if (p && p.hero) heroPreloader.src = p.hero;
  }

  // Set when we start leaving for a case study, read by the main loop below to
  // stop itself. The panel is about to cover the screen and reveal the hero on
  // top; every frame this loop spends on the carousel spring, per-cover parallax
  // and waveform is a frame stolen from that reveal — which is what made it
  // stutter. It is all hidden behind the panel anyway, so we halt it.
  var halted = false;

  function leaveTo(project) {
    var href = project && project.href;
    if (!href) return;
    // Hand the hero across the navigation. Without this the case page cannot
    // even REQUEST its hero until content/<slug>.json has resolved and told it
    // the URL — which loses the race against first paint, so that page opens on
    // flat colour and the photograph the panel was just showing blinks back in.
    try {
      if (project.hero && project.slug) {
        sessionStorage.setItem("zl:hero:" + project.slug, project.hero);
      }
    } catch (e) {
      /* private mode — the case page falls back to fetching it as before */
    }
    if (window.ZLTransition) {
      // Free the main thread for the panel's hero reveal — see `halted` above.
      halted = true;
      if (lenis && lenis.stop) lenis.stop();
      // Hide the custom cursor for the whole leave. The loop is now paused, so it
      // would otherwise hang frozen (z-index 999) over the cover panel and the
      // case overlay until the router's zl-case-open rule takes over. The case
      // page runs its own cursor; on return, a pointermove un-hides this one.
      if (cursorEl) cursorEl.classList.add("is-hidden");
      window.ZLTransition.leaveTo({
        href: href,
        image: project.hero,
        title: project.name,
        meta: project.heroMeta,
        intro: project.heroIntro,
        slug: project.slug,
        theme: "dark",
      });
      return;
    }
    window.location.href = href; // transition.js absent — still navigate
  }

  // The bfcache reset lives in transition.js now, alongside the panel it
  // resets — restoring this page from the back button would otherwise bring it
  // back frozen behind a solid panel.

  // The stage link is a real anchor, so its default navigation has to be held
  // back until the panel has finished.
  if (stageLink) {
    stageLink.addEventListener("click", function (e) {
      var href = stageLink.getAttribute("href");
      if (!href || stageLink.classList.contains("is-disabled")) return;
      e.preventDefault();
      leaveTo(projects[activeIdx]);
    });
  }

  // Clicking a name in the side lists brings that project to centre — the
  // carousel springs to it rather than jumping straight to the case study.
  // Opening a case study stays the stage's job (the centre card's "View case"
  // link), so mis-clicking a neighbouring title costs a scroll, not a page
  // load. `href` is still read by updateStageLink and by the grid.
  document.querySelector(".proj").addEventListener("click", function (e) {
    var li = e.target.closest ? e.target.closest("li") : null;
    if (!li || li.dataset.index === undefined) return;
    var idx = parseInt(li.dataset.index, 10);
    var cur = Math.round(target / step);
    var diff = mod(idx - mod(cur, N), N);
    if (diff > N / 2) diff -= N; // take the shorter direction
    target = (cur + diff) * step;
  });

  // ---------- Waveform ----------
  // Fixed pattern lifted from the Figma SVG (561x62 design space): bars every
  // 11px, 2px wide, black @50%, in three heights that repeat every 13 bars.
  // A center-peaked linear fade (0 -> 1 -> 0) matches the SVG's gradient mask.

  var WAVE_DESIGN_W = 561;
  var WAVE_SPACING = 11; // design units between bars
  var WAVE_BARW = 2; // design units bar width
  var WAVE_H = 62; // design units tall
  var WAVE_F = 62; // full height
  var WAVE_M = 45; // medium
  var WAVE_S = 33; // short
  var WAVE_PATTERN = [
    WAVE_F, WAVE_M, WAVE_F, WAVE_M, WAVE_M, WAVE_S, WAVE_F, WAVE_S, WAVE_F, WAVE_S, WAVE_S, WAVE_S, WAVE_S,
  ];

  var waveW = 0;
  var waveH = 0;

  function sizeWave() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var rect = canvas.parentElement.getBoundingClientRect();
    waveW = rect.width;
    waveH = rect.height;
    canvas.width = Math.round(waveW * dpr);
    canvas.height = Math.round(waveH * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawWave(now) {
    ctx.clearRect(0, 0, waveW, waveH);
    var vert = isVertical();
    var L = vert ? waveH : waveW; // length along the bar sequence
    var C = vert ? waveW : waveH; // cross axis (bar height direction)
    var scale = L / WAVE_DESIGN_W; // keep the design's bar-count proportion at any size
    var spacing = WAVE_SPACING * scale;
    var barW = Math.max(1, WAVE_BARW * scale);
    var mid = C / 2;
    var scroll = current * 0.5; // scrub the pattern as the carousel moves
    var period = WAVE_PATTERN.length;
    var first = Math.floor(scroll / spacing) - 1;
    var count = Math.ceil(L / spacing) + 2;
    var breathe = !reduceMotion();
    var boost = Math.min(0.4, Math.abs(velSmooth) * 0.0035);
    for (var i = first; i < first + count; i++) {
      var p = i * spacing - scroll;
      if (p < -barW || p > L + barW) continue;
      var amp = 1 + boost;
      if (breathe) amp += 0.05 * Math.sin(now / 420 + i * 0.6); // idle "breathing"
      var h = Math.min(C, (WAVE_PATTERN[((i % period) + period) % period] / WAVE_H) * C * amp);
      var fade = 1 - Math.abs(p - L / 2) / (L / 2); // linear 0..1..0
      if (fade <= 0) continue;
      ctx.fillStyle = "rgba(0,0,0," + (0.5 * fade).toFixed(3) + ")";
      if (vert) ctx.fillRect(mid - h / 2, p - barW / 2, h, barW);
      else ctx.fillRect(p - barW / 2, mid - h / 2, barW, h);
    }
  }

  // ---------- Waveform scrubber (drag the tape / click to seek) ----------
  // The waveform scrolls at 0.5px per carousel px, so dragging it maps back
  // at 1/0.5 = 2x: grabbing the tape keeps the bars under your pointer, and
  // clicking a spot jumps the "playhead" (center marker) to it.

  var WAVE_RATIO = 2; // carousel px per waveform px
  var waveDragging = false;
  var waveMovedTotal = 0;
  var waveLastPos = 0;

  function wavePointerPos(e) {
    return isVertical() ? e.clientY : e.clientX;
  }

  if (waveEl) {
    waveEl.addEventListener("pointerdown", function (e) {
      waveDragging = true;
      waveMovedTotal = 0;
      waveLastPos = wavePointerPos(e);
      waveEl.classList.add("is-dragging");
      try {
        waveEl.setPointerCapture(e.pointerId);
      } catch (err) {
        /* some pointer types can't be captured */
      }
      clearTimeout(snapTimer);
    });

    waveEl.addEventListener("pointermove", function (e) {
      if (!waveDragging) return;
      var pos = wavePointerPos(e);
      var d = pos - waveLastPos;
      waveLastPos = pos;
      waveMovedTotal += Math.abs(d);
      target -= d * WAVE_RATIO; // dragging the tape right rewinds
    });

    waveEl.addEventListener("pointerup", function (e) {
      waveDragging = false;
      waveEl.classList.remove("is-dragging");
      if (lenis) lastLenisScroll = lenis.scroll;
      if (waveMovedTotal < 5) {
        // A click: seek so the clicked spot lands on the center marker
        var rect = waveEl.getBoundingClientRect();
        var offset = isVertical()
          ? e.clientY - (rect.top + rect.height / 2)
          : e.clientX - (rect.left + rect.width / 2);
        target += offset * WAVE_RATIO;
      }
      scheduleSnap(60);
    });

    waveEl.addEventListener("pointercancel", function () {
      waveDragging = false;
      waveEl.classList.remove("is-dragging");
      scheduleSnap(60);
    });
  }

  // The clock moved to nav.js, which owns the bar this page renders and drives
  // every clock on the site from one ticker.

  // ---------- View switcher (sliding chip) ----------

  var switchItems = Array.prototype.slice.call(document.querySelectorAll(".switch-item[data-mode]"));

  var chipEl = document.createElement("div");
  chipEl.className = "switch-chip no-anim";
  switcherEl.insertBefore(chipEl, switcherEl.firstChild);
  switcherEl.classList.add("has-chip");

  function positionChip() {
    var active = switcherEl.querySelector(".switch-wrap.is-active");
    if (!active) {
      chipEl.style.opacity = "0";
      return;
    }
    chipEl.style.opacity = "1";
    chipEl.style.top = active.offsetTop + "px";
    chipEl.style.left = active.offsetLeft + "px";
    chipEl.style.width = active.offsetWidth + "px";
    chipEl.style.height = active.offsetHeight + "px";
  }

  function applyModeClass() {
    document.body.classList.toggle("is-horizontal", mode === "horizontal");
    document.body.classList.toggle("is-vertical", mode === "vertical");
    document.body.classList.toggle("is-grid", mode === "grid");
    gridEl.setAttribute("aria-hidden", isGrid() ? "false" : "true");
  }

  function updateSwitcher() {
    switchItems.forEach(function (el) {
      var active = el.dataset.mode === mode;
      // The wrapper carries the active (black chip) styling; the item just dims.
      if (el.parentElement) el.parentElement.classList.toggle("is-active", active);
      el.classList.toggle("dim", !active);
    });
    positionChip();
  }

  // ---------- Mode switching (choreographed) ----------

  var modeSwitching = false;

  function commitMode(newMode, idxBefore) {
    mode = newMode;
    try {
      localStorage.setItem(MODE_KEY, mode);
    } catch (e) {
      /* storage unavailable */
    }
    applyModeClass();
    updateSwitcher();
    measure();
    if (isGrid()) {
      gridStage.style.setProperty("--gscale", uh);
      activeIdx = idxBefore;
      layoutGrid(false);
    } else {
      copies = 0; // force the track to rebuild for the new axis span
      buildTrack();
      current = target = idxBefore * step;
      lastStepCount = idxBefore;
      vel = 0;
      sizeWave();
      activeIdx = -1;
      setActive(idxBefore, 0, false);
    }
    positionChip();
    updateHash();
  }

  var modeMarkerTimer = null;

  function setMode(newMode) {
    if (newMode === mode || modeSwitching) return;
    var idxBefore = activeIdx < 0 ? 0 : activeIdx;
    clearTimeout(modeMarkerTimer);
    if (reduceMotion()) {
      document.body.classList.remove("to-grid");
      document.body.classList.remove("from-grid");
      commitMode(newMode, idxBefore);
      return;
    }
    // Choreography: surrounding chrome fades out, the layout flips underneath,
    // then the new chrome fades back in. The center active card never moves —
    // grid's active cell sits on the exact stage rect, so the swap is
    // invisible. to-grid / from-grid markers pick the right participants.
    modeSwitching = true;
    document.body.classList.toggle("to-grid", newMode === "grid");
    document.body.classList.toggle("from-grid", isGrid());
    document.body.classList.add("is-mode-leave");
    setTimeout(function () {
      commitMode(newMode, idxBefore);
      document.body.classList.remove("is-mode-leave");
      document.body.classList.add("is-mode-enter");
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.body.classList.remove("is-mode-enter");
          modeSwitching = false;
          // Keep the direction markers briefly so the entrance stagger
          // (transition-delay under .to-grid) can play out, then drop them.
          modeMarkerTimer = setTimeout(function () {
            document.body.classList.remove("to-grid");
            document.body.classList.remove("from-grid");
          }, 700);
        });
      });
    }, 260);
  }

  switchItems.forEach(function (el) {
    el.addEventListener("click", function () {
      setMode(el.dataset.mode);
    });
  });

  // ---------- Grid collage ----------
  // Fixed scatter slots in 1440x900 design space (left-corner coords). Slot 0
  // is the centered active cover; the rest are dimmed background positions.
  // The whole stage is scaled by --gscale (= uh) so it contains like H/V.

  // Active slot 0 matches the H/V center stage exactly (centered, 770x497) so
  // switching to/from grid reads as continuous. Dim slots share the cover
  // aspect ratio (~1.464) so the FLIP scale is near-uniform (no stretch).
  var GRID_SLOTS = [
    { left: 335, top: 172, w: 770, h: 497, op: 1, z: 6, depth: 0 }, // active = stage
    { left: 972, top: 46, w: 349, h: 238, op: 0.2, z: 2, depth: 1.15 }, // top-right
    { left: 58, top: 689, w: 372, h: 254, op: 0.2, z: 2, depth: 1.0 }, // bottom-left
    { left: 1147, top: 395, w: 392, h: 268, op: 0.2, z: 2, depth: 1.35 }, // right
    { left: 41, top: 49, w: 429, h: 293, op: 0.2, z: 2, depth: 0.9 }, // left
    { left: 566, top: 2, w: 279, h: 191, op: 0.2, z: 2, depth: 1.25 }, // center-top
  ];
  // Projects beyond the visible slots rest here, invisible, near center.
  var GRID_HIDDEN = { left: 660, top: 390, w: 120, h: 120, op: 0, z: 1, depth: 0 };

  var gridCellEls = [];

  function buildGrid() {
    gridCellsEl.innerHTML = "";
    gridCellEls = [];
    for (var i = 0; i < N; i++) {
      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "grid-cell";
      cell.dataset.index = String(i);
      cell.setAttribute("aria-label", projects[i].name);
      var inner = document.createElement("div");
      inner.className = "grid-cell-inner"; // holds parallax so the outer is free for FLIP
      var img = document.createElement("img");
      img.src = projects[i].thumb; // scattered covers are small; the active one upgrades
      img.alt = projects[i].name;
      img.dataset.full = projects[i].image;
      img.onerror = thumbFallback;
      img.draggable = false;
      inner.appendChild(img);
      cell.appendChild(inner);
      gridCellsEl.appendChild(cell);
      cell._inner = inner;
      cell._img = img;
      gridCellEls.push(cell);
    }
  }

  function slotFor(offset) {
    return offset < GRID_SLOTS.length ? GRID_SLOTS[offset] : GRID_HIDDEN;
  }

  // FLIP: measure First, apply new boxes instantly, Invert with a transform,
  // then Play back to identity via a GPU transition. Interruptible — a new
  // step mid-animation continues smoothly from the current visual position.
  function layoutGrid(animate) {
    if (!gridCellEls.length) return;
    var anim = animate && !reduceMotion();

    var firsts = anim
      ? gridCellEls.map(function (c) {
          return c.getBoundingClientRect();
        })
      : null;

    // Apply the new slot boxes instantly (no transition on layout props)
    for (var i = 0; i < N; i++) {
      var cell = gridCellEls[i];
      var offset = mod(i - activeIdx, N);
      var slot = slotFor(offset);
      cell.style.transition = "none";
      cell.style.transform = "none";
      cell.style.left = slot.left + "px";
      cell.style.top = slot.top + "px";
      cell.style.width = slot.w + "px";
      cell.style.height = slot.h + "px";
      cell.style.zIndex = String(slot.z);
      cell.classList.toggle("is-active", offset === 0);
      cell.style.pointerEvents = slot.op === 0 ? "none" : "auto";
      cell._depth = slot.depth;
      if (!anim) cell.style.opacity = String(slot.op);
      cell._targetOp = slot.op;
    }

    void gridStage.offsetWidth; // reflow so the new boxes are committed

    if (anim) {
      // Invert: transform each cell back onto its previous (First) rect
      gridCellEls.forEach(function (cell, i) {
        var last = cell.getBoundingClientRect();
        var f = firsts[i];
        if (!f.width || !last.width) {
          cell.style.opacity = String(cell._targetOp);
          return;
        }
        var dx = f.left - last.left;
        var dy = f.top - last.top;
        var sx = f.width / last.width;
        var sy = f.height / last.height;
        cell.style.transformOrigin = "top left";
        cell.style.transform =
          "translate(" + dx.toFixed(2) + "px," + dy.toFixed(2) + "px) scale(" + sx.toFixed(4) + "," + sy.toFixed(4) + ")";
      });

      // Play: next frame, release to identity + target opacity → animates
      requestAnimationFrame(function () {
        gridCellEls.forEach(function (cell) {
          cell.style.transition = "";
          cell.style.transform = "none";
          cell.style.opacity = String(cell._targetOp);
        });
      });
    } else {
      void gridStage.offsetWidth;
      gridCellEls.forEach(function (cell) {
        cell.style.transition = "";
      });
    }

    // The centered card deserves full resolution; scattered ones keep thumbs.
    var activeCell = gridCellEls[activeIdx];
    if (activeCell && activeCell._img && activeCell._img.src.indexOf(projects[activeIdx].image) === -1) {
      activeCell._img.onerror = null;
      activeCell._img.src = projects[activeIdx].image;
    }

    // Title (two-tone straddling the active image's top edge)
    var nm = projects[activeIdx].name.toUpperCase();
    gtBlack.textContent = nm;
    gtWhite.textContent = nm;
    if (anim) {
      gridTitle.classList.remove("is-swap");
      void gridTitle.offsetWidth;
      gridTitle.classList.add("is-swap");
      gridBrackets.classList.remove("is-focusing");
      void gridBrackets.offsetWidth;
      gridBrackets.classList.add("is-focusing");
    }
  }

  function gridSetActive(idx, animate) {
    var next = mod(idx, N);
    if (next === activeIdx) return;
    activeIdx = next;
    layoutGrid(animate);
    preloadNeighbors(next);
    updateTitleMeta(next);
    announce(next);
    updateHash();
    if (animate) tickSound();
  }

  function gridStep(dir) {
    gridSetActive(activeIdx + dir, true);
  }

  // Grid stepping reads raw wheel events (the actual input impulses), not the
  // smoothed scroll, so it's immune to frame-rate/momentum quirks.
  //
  // One gesture = one card: on the first wheel of a gesture we step and disarm.
  // Inertial momentum then keeps firing wheel events whose deltaY only DECAYS,
  // so we ignore them — UNLESS deltaY spikes back up (a genuine new push during
  // the momentum tail), which steps again. We re-arm shortly after wheel events
  // stop (momentum ended). No multi-second dead zone, no double-step.
  var gridReady = true;
  var gridEnv = 0; // decaying envelope of recent wheel magnitude
  var gridRearmTimer = null;

  function onGridWheel(e) {
    if (!isGrid()) return;
    if (e.target && e.target.closest && e.target.closest(".zl-editor")) return;
    var d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    var mag = Math.abs(d);
    if (mag < 2) return;

    // Re-arm once wheel events have stopped for a beat (momentum finished).
    clearTimeout(gridRearmTimer);
    gridRearmTimer = setTimeout(function () {
      gridReady = true;
      gridEnv = 0;
    }, 150);

    if (gridReady) {
      gridStep(d > 0 ? 1 : -1);
      gridReady = false;
      gridEnv = mag;
      return;
    }
    // Already stepped this gesture — only step again on a clear new push
    // (deltaY accelerating well above the decaying momentum envelope).
    if (mag > gridEnv * 1.7 && mag > 14) {
      gridStep(d > 0 ? 1 : -1);
      gridEnv = mag;
    } else {
      gridEnv = Math.max(gridEnv * 0.9, mag);
    }
  }

  window.addEventListener("wheel", onGridWheel, { passive: true });

  gridCellsEl.addEventListener("click", function (e) {
    if (gridClickSuppressed) {
      gridClickSuppressed = false;
      return;
    }
    var cell = e.target.closest ? e.target.closest(".grid-cell") : null;
    if (!cell) return;
    var idx = parseInt(cell.dataset.index, 10);
    // Any card opens its case study on a single click — drag the collage to
    // browse. Cards with no `href` in config.js just center instead.
    var href = projects[idx] && projects[idx].href;
    if (href) {
      leaveTo(projects[idx]);
      return;
    }
    gridSetActive(idx, true);
  });

  // Drag navigation in grid mode (parity with the H/V film strip): dragging
  // anywhere on the collage steps through cards every GRID_DRAG_STEP px.
  var GRID_DRAG_STEP = 150;
  var gridDragging = false;
  var gridDragAcc = 0;
  var gridDragMoved = 0;
  var gridDragLast = 0;
  var gridClickSuppressed = false;

  gridEl.addEventListener("pointerdown", function (e) {
    if (e.target.closest && e.target.closest(".zl-editor, .zl-edit-btn")) return;
    gridDragging = true;
    gridDragAcc = 0;
    gridDragMoved = 0;
    gridDragLast = e.clientX;
    try {
      gridEl.setPointerCapture(e.pointerId);
    } catch (err) {
      /* some pointer types can't be captured */
    }
  });

  gridEl.addEventListener("pointermove", function (e) {
    if (!gridDragging) return;
    var d = e.clientX - gridDragLast;
    gridDragLast = e.clientX;
    gridDragMoved += Math.abs(d);
    gridDragAcc -= d; // drag left = advance (same feel as the film strip)
    if (Math.abs(gridDragAcc) >= GRID_DRAG_STEP) {
      gridStep(gridDragAcc > 0 ? 1 : -1);
      gridDragAcc = 0;
    }
  });

  function endGridDrag() {
    if (!gridDragging) return;
    gridDragging = false;
    if (gridDragMoved >= 6) gridClickSuppressed = true; // it was a drag, not a click
  }

  gridEl.addEventListener("pointerup", endGridDrag);
  gridEl.addEventListener("pointercancel", endGridDrag);

  // Mouse-parallax depth (applied to the inner wrapper, so it never fights FLIP)
  var pmx = 0;
  var pmy = 0;
  var gpx = 0;
  var gpy = 0;

  window.addEventListener("pointermove", function (e) {
    pmx = (e.clientX / window.innerWidth - 0.5) * 2;
    pmy = (e.clientY / window.innerHeight - 0.5) * 2;
  });

  function gridFrame() {
    var still = reduceMotion();
    var k = still ? 1 : 0.07;
    gpx += (pmx - gpx) * k;
    gpy += (pmy - gpy) * k;
    for (var i = 0; i < gridCellEls.length; i++) {
      var cell = gridCellEls[i];
      var inner = cell._inner;
      if (!inner) continue;
      var depth = cell._depth || 0;
      var px = -gpx * depth * 30;
      var py = -gpy * depth * 30;
      inner.style.transform = "translate3d(" + px.toFixed(1) + "px," + py.toFixed(1) + "px,0)";
    }
  }

  // ---------- Custom cursor ----------

  var finePointer = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var cursorEl = null;
  var curX = 0;
  var curY = 0;
  var curTX = 0;
  var curTY = 0;
  var cursorShown = false;

  if (finePointer) {
    cursorEl = document.createElement("div");
    cursorEl.className = "zl-cursor is-hidden";
    var arrows = document.createElement("span");
    arrows.className = "zl-cursor-arrows";
    arrows.textContent = "◂ ▸";
    cursorEl.appendChild(arrows);
    var viewTag = document.createElement("span");
    viewTag.className = "zl-cursor-view";
    viewTag.textContent = "VIEW";
    cursorEl.appendChild(viewTag);
    document.body.appendChild(cursorEl);

    window.addEventListener("pointermove", function (e) {
      // While leaving for a case the loop is halted, so the cursor cannot be
      // repositioned — but this handler would still toggle is-hidden back off and
      // leave it frozen on screen over the cover. Stay inert until home resumes.
      if (halted) return;
      curTX = e.clientX;
      curTY = e.clientY;
      if (!cursorShown) {
        cursorShown = true;
        curX = curTX;
        curY = curTY;
      }
      var t = e.target;
      var overTool = t.closest && t.closest(".zl-editor, .zl-edit-btn, .snd-btn");
      cursorEl.classList.toggle("is-hidden", !!overTool);
      // "VIEW" over the clickable active card (stage link / grid center)
      var view = !overTool && !!(t.closest && t.closest(".stage-hit:not(.is-disabled), .grid-cell.is-active"));
      cursorEl.classList.toggle("is-view", view);
      // Scattered grid covers and list names are plain links
      var link = !overTool && !view && !!(t.closest && t.closest(".grid-cell, a, .proj-side li, button"));
      cursorEl.classList.toggle("is-link", link);
      // Drag arrows over anything scrubbable: film strip, waveform, grid bg
      var drag = !overTool && !view && !link && !!(t.closest && t.closest(".film, .wave, .grid"));
      cursorEl.classList.toggle("is-drag", drag);
    });
    window.addEventListener("pointerdown", function () {
      cursorEl.classList.add("is-down");
    });
    window.addEventListener("pointerup", function () {
      cursorEl.classList.remove("is-down");
    });
    document.documentElement.addEventListener("mouseleave", function () {
      cursorEl.classList.add("is-hidden");
    });
  }

  function cursorFrame() {
    if (!cursorEl || !cursorShown) return;
    var k = reduceMotion() ? 1 : 0.3;
    curX += (curTX - curX) * k;
    curY += (curTY - curY) * k;
    cursorEl.style.translate = curX.toFixed(1) + "px " + curY.toFixed(1) + "px";
  }

  // ---------- Sound tick (opt-in, WebAudio, no assets) ----------

  var SOUND_KEY = "zerolab.sound";
  var soundOn = false;
  try {
    soundOn = localStorage.getItem(SOUND_KEY) === "1";
  } catch (e) {
    /* storage unavailable */
  }
  var audioCtx = null;

  function tickSound() {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
      var t = audioCtx.currentTime;
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "square";
      osc.frequency.value = 2100;
      gain.gain.setValueAtTime(0.05, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(t);
      osc.stop(t + 0.035);
    } catch (e) {
      /* audio unavailable */
    }
  }

  function renderSndBtn() {
    if (!sndBtn) return;
    sndBtn.textContent = soundOn ? "SND ON" : "SND OFF";
    sndBtn.classList.toggle("is-on", soundOn);
    sndBtn.setAttribute("aria-pressed", soundOn ? "true" : "false");
  }

  if (sndBtn) {
    sndBtn.addEventListener("click", function () {
      soundOn = !soundOn;
      try {
        localStorage.setItem(SOUND_KEY, soundOn ? "1" : "0");
      } catch (e) {
        /* storage unavailable */
      }
      renderSndBtn();
      if (soundOn) tickSound(); // audible confirmation (also unlocks the AudioContext)
    });
    renderSndBtn();
  }

  // ---------- Attract mode (gentle auto-advance when idle) ----------

  var IDLE_MS = 10000;
  var ATTRACT_EVERY_MS = 3800;
  var lastInput = performance.now();
  var lastAttract = 0;

  function bumpInput() {
    lastInput = performance.now();
  }

  ["wheel", "pointerdown", "pointermove", "keydown", "touchstart"].forEach(function (evt) {
    window.addEventListener(evt, bumpInput, { passive: true });
  });

  setInterval(function () {
    if (document.hidden || modeSwitching || reduceMotion()) return;
    if (document.body.classList.contains("is-loading")) return;
    var editorOpen = document.querySelector(".zl-editor.is-open");
    if (editorOpen) return;
    var now = performance.now();
    if (now - lastInput < IDLE_MS || now - lastAttract < ATTRACT_EVERY_MS) return;
    lastAttract = now;
    if (isGrid()) gridStep(1);
    else target = (Math.round(target / step) + 1) * step;
  }, 1000);

  // ---------- Image loading strategy ----------
  // Thumbs load eagerly (they're tiny and drive the strip/collage). Full-res
  // covers load for the active project + its neighbors, then the rest trickle
  // in during idle time. The preloader gates the intro on the first full one.

  var fullLoaded = {};

  function preloadFull(i, cb) {
    i = mod(i, N);
    if (fullLoaded[i]) {
      if (cb) cb();
      return;
    }
    var im = new Image();
    im.onload = im.onerror = function () {
      fullLoaded[i] = true;
      if (cb) cb();
    };
    im.src = projects[i].image;
  }

  function preloadNeighbors(idx) {
    preloadFull(idx + 1);
    preloadFull(idx - 1);
  }

  function trickleRemaining() {
    var pending = [];
    for (var i = 0; i < N; i++) if (!fullLoaded[i]) pending.push(i);
    (function next() {
      if (!pending.length) return;
      preloadFull(pending.shift(), function () {
        setTimeout(next, 600);
      });
    })();
  }

  // ---------- Lenis smooth scroll (inertial input for every mode) ----------
  // Lenis smooths the (hidden) page scroll into a weighted, coasting value.
  // We read its per-frame delta and feed it to the carousel: continuous
  // position for horizontal/vertical, discrete stepping for grid. This gives
  // scroll real momentum instead of reacting to raw, spiky wheel events.

  var SENS_HV = 1.35; // scroll px -> carousel px (horizontal / vertical)
  var RECENTER = 100000; // park scroll mid-track so travel feels endless

  var lenis = null;
  var lastLenisScroll = RECENTER;

  if (window.Lenis) {
    lenis = new window.Lenis({
      lerp: 0.085, // lower = heavier, more inertia / "weight"
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: true, // touch screens get the same weighted scroll
      autoRaf: false, // advanced from our own rAF loop
      prevent: function (node) {
        return !!(node && node.closest && node.closest(".zl-editor"));
      },
    });
  }

  // Read Lenis's smoothed scroll delta since last frame (0 while dragging).
  function readScrollDelta() {
    if (!lenis || dragging) return 0;
    var s = lenis.scroll;
    var d = s - lastLenisScroll;
    lastLenisScroll = s;
    if (Math.abs(d) > 40000) d = 0; // ignore the jump when we recenter
    if (s < 40000 || s > 160000) {
      lenis.scrollTo(RECENTER, { immediate: true, force: true });
      lastLenisScroll = RECENTER;
    }
    return d;
  }

  // ---------- Main loop ----------

  var lastNow = 0;

  function frame(now) {
    if (halted) return; // leaving for a case study — the panel owns the screen now
    var dt = lastNow ? Math.min(40, Math.max(4, now - lastNow)) : 16.7;
    lastNow = now;
    var ts = dt / 16.7; // time scale relative to 60fps

    if (lenis) lenis.raf(now);
    var sd = readScrollDelta();

    if (isGrid()) {
      // sd is read (above) only to keep Lenis synced/recentered; grid stepping
      // is handled by the raw-wheel impulse detector (onGridWheel).
      gridFrame(now);
      cursorFrame();
      requestAnimationFrame(frame);
      return;
    }

    if (sd) {
      target += sd * SENS_HV;
      scheduleSnap();
    }

    var before = current;
    if (dragging) {
      // Tight follow while dragging so the strip feels attached to the pointer
      current += (target - current) * Math.min(1, 0.35 * ts);
      vel = current - before;
    } else if (reduceMotion()) {
      current += (target - current) * Math.min(1, 0.12 * ts);
      vel = current - before;
      if (Math.abs(target - current) < 0.05) current = target;
    } else {
      // Slightly underdamped spring: settles with a subtle bounce
      vel += (target - current) * 0.016 * ts;
      vel *= Math.pow(0.85, ts);
      current += vel * ts;
      if (Math.abs(target - current) < 0.06 && Math.abs(vel) < 0.06) {
        current = target;
        vel = 0;
      }
    }
    velSmooth += (vel - velSmooth) * 0.18;

    var vert = isVertical();
    var spanSize = vert ? window.innerHeight : window.innerWidth;
    var coverSize = vert ? coverH : coverW;
    var trackPos = spanSize / 2 - coverSize / 2 - mod(current, loopLen) - loopLen;

    // Velocity skew: the strip leans with scroll speed
    var skewTarget = reduceMotion() ? 0 : Math.max(-5, Math.min(5, velSmooth * 0.22));
    skewSmooth += (skewTarget - skewSmooth) * 0.2;
    var skewStr =
      Math.abs(skewSmooth) < 0.05
        ? ""
        : vert
          ? " skewY(" + skewSmooth.toFixed(2) + "deg)"
          : " skewX(" + skewSmooth.toFixed(2) + "deg)";

    track.style.transform = vert
      ? "translate3d(-50%, " + trackPos + "px, 0)" + skewStr
      : "translate3d(" + trackPos + "px, -50%, 0)" + skewStr;

    // Depth: covers dim with distance from center + internal parallax
    var centerLine = spanSize / 2;
    var noPar = reduceMotion();
    for (var ci = 0; ci < cells.length; ci++) {
      var cellCenter = trackPos + ci * step + coverSize / 2;
      var d = cellCenter - centerLine;
      var t = Math.min(1, Math.abs(d) / (spanSize * 0.65));
      cells[ci].style.opacity = (1 - t * 0.45).toFixed(3);
      var img = cells[ci].firstChild;
      if (img) {
        if (noPar) {
          if (img.style.transform) img.style.transform = "";
        } else {
          var shift = Math.max(-16, Math.min(16, -d * 0.045));
          img.style.transform = "scale(1.12) translate" + (vert ? "Y" : "X") + "(" + shift.toFixed(1) + "px)";
        }
      }
    }

    var stepCount = Math.round(current / step);
    if (stepCount !== lastStepCount) {
      var dir = stepCount > lastStepCount ? 1 : -1;
      lastStepCount = stepCount;
      var idx = mod(stepCount, N);
      if (idx !== activeIdx) setActive(idx, dir);
    }

    drawWave(now);
    cursorFrame();
    requestAnimationFrame(frame);
  }

  // ---------- Init / resize ----------

  function rebuild() {
    var idxBefore = activeIdx < 0 ? 0 : Math.round(current / step);
    measure();
    gridStage.style.setProperty("--gscale", uh);
    if (isGrid()) {
      layoutGrid(false);
    } else {
      buildTrack();
      current = target = idxBefore * step;
      lastStepCount = idxBefore;
      vel = 0;
      sizeWave();
    }
    positionChip();
  }

  window.addEventListener("resize", rebuild);

  // Back button restores this page from the bfcache exactly as it was left —
  // which, if you left by opening a case study, means halted with the loop
  // stopped. Restart it so the carousel is live again rather than frozen.
  function resumeHome() {
    if (!halted) return;
    halted = false;
    lastNow = 0;
    if (lenis && lenis.start) lenis.start();
    requestAnimationFrame(frame);
  }
  window.addEventListener("pageshow", resumeHome);
  // Option A overlay router keeps this page alive underneath a case shown in an
  // iframe; closing it fires this instead of a bfcache pageshow. Resume, then
  // REPLAY the entrance so returning reads as an arrival rather than a flat
  // reappearance. Re-arm the pre-entrance state and re-run the same choreography;
  // it plays as the router's cover panel lifts, which hides the reset. Only here,
  // not on the bfcache pageshow above — that path has no cover to mask it.
  window.addEventListener("zl:home-resume", function () {
    var wasHalted = halted;
    resumeHome();
    if (wasHalted && !reduceMotion()) {
      var body = document.body;
      // Stamp the hidden start state INSTANTLY. The elements are visible right now
      // and carry their own opacity/translate transitions, so re-adding .is-intro
      // alone would fade them OUT over those transitions — the reveal would have
      // nothing to play from. zl-intro-reset suppresses them for one reflow so the
      // reset snaps; then runIntro removes .is-intro and they animate in normally.
      body.classList.add("zl-intro-reset");
      body.classList.add("is-intro");
      body.classList.add("is-revealing");
      void body.offsetWidth; // commit hidden state with transitions off
      body.classList.remove("zl-intro-reset"); // transitions back on, no value change yet
      void body.offsetWidth; // commit that before runIntro changes the values
      runIntro();
    }
  });

  var scrollSpacer = document.getElementById("scrollSpacer");
  if (scrollSpacer) scrollSpacer.style.height = "200000px";
  if (lenis) {
    lenis.scrollTo(RECENTER, { immediate: true, force: true });
    lenis.raf(performance.now());
    lastLenisScroll = lenis.scroll; // sync to whatever Lenis actually parked at
  }

  applyModeClass();
  updateSwitcher();
  measure();
  gridStage.style.setProperty("--gscale", uh);
  buildTrack();
  sizeWave();
  buildOdometer();
  buildGrid();
  if (isGrid()) {
    activeIdx = initialIdx;
    layoutGrid(false);
    updateStageLink(initialIdx);
    updateTitleMeta(initialIdx);
  } else {
    current = target = initialIdx * step;
    lastStepCount = initialIdx;
    setActive(initialIdx, 0, false);
  }
  hashReady = true;
  updateHash();
  requestAnimationFrame(frame);

  // ---------- Preloader ----------
  // Counts thumbs in (NN/07) and waits for the active full-res cover, then
  // releases the overlay and starts the intro reveal. A timeout makes sure a
  // slow or missing asset never strands the page.

  (function runLoader() {
    var totalCount = N;
    var loaded = 0;
    var fullReady = false;
    var finished = false;
    if (loaderTotal) loaderTotal.textContent = "/" + pad(N);

    function render() {
      if (loaderCount) loaderCount.textContent = pad(Math.min(loaded, totalCount));
    }

    function maybeFinish(force) {
      if (finished) return;
      if (!force && (!fullReady || loaded < totalCount)) return;
      finished = true;
      loaded = totalCount;
      render();
      setTimeout(function () {
        document.body.classList.remove("is-loading");
        lastInput = performance.now(); // attract-mode countdown starts now
        runIntro();
        trickleRemaining();
      }, 180);
    }

    projects.forEach(function (p) {
      var im = new Image();
      im.onload = im.onerror = function () {
        loaded++;
        render();
        maybeFinish();
      };
      im.src = p.thumb;
    });

    preloadFull(initialIdx, function () {
      fullReady = true;
      maybeFinish();
    });
    preloadNeighbors(initialIdx);

    setTimeout(function () {
      maybeFinish(true);
    }, 6000);
    render();
  })();

  // Reposition the switcher chip once fonts are in (metrics change widths),
  // then enable its slide transition.
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(positionChip);
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      chipEl.classList.remove("no-anim");
    });
  });

  // ---------- Intro reveal (started by the preloader) ----------

  function runIntro() {
    var body = document.body;
    if (reduceMotion()) {
      body.classList.remove("is-intro");
      body.classList.remove("is-revealing");
      return;
    }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        body.classList.remove("is-intro");
        // Counter rolls to its value late in the sequence
        setTimeout(function () {
          odoStrips.forEach(function (s) {
            s.classList.add("no-anim");
            s.style.transform = "translateY(0)";
          });
          void counterNow.offsetWidth;
          odoStrips.forEach(function (s) {
            s.classList.remove("no-anim");
          });
          setCounter(activeIdx < 0 ? 0 : activeIdx);
        }, 650);
        setTimeout(function () {
          body.classList.remove("is-revealing");
        }, 1700);
      });
    });
  }

  // ---------- Hook for the temporary GUI editor ----------

  window.ZL = {
    getProjects: function () {
      return projects;
    },
    storageKey: STORAGE_KEY,
    applyProjects: function (updated) {
      updated.forEach(function (p, i) {
        if (projects[i]) {
          projects[i].name = p.name;
          projects[i].subtitle = p.subtitle;
        }
      });
      var idx = activeIdx < 0 ? 0 : activeIdx;
      if (isGrid()) {
        activeIdx = idx;
        layoutGrid(false); // silent: refresh title, no animation while typing
        updateTitleMeta(idx);
        updateStageLink(idx);
        updateHash();
      } else {
        activeIdx = -1;
        setActive(idx, 0, false);
      }
      // Refresh strip alt texts
      cells.forEach(function (cell) {
        var i = parseInt(cell.dataset.index, 10);
        var img = cell.querySelector("img");
        if (img && projects[i]) img.alt = projects[i].name;
      });
      // Refresh grid cell labels
      gridCellEls.forEach(function (cell) {
        var i = parseInt(cell.dataset.index, 10);
        if (projects[i]) {
          cell.setAttribute("aria-label", projects[i].name);
          var gimg = cell.querySelector("img");
          if (gimg) gimg.alt = projects[i].name;
        }
      });
    },
  };
  } // end __init

  // Wait for the project data before building anything. The fallback keeps this
  // file usable on a page that loads it without config.js.
  (window.PROJECTS_READY || Promise.resolve()).then(__init);
})();
