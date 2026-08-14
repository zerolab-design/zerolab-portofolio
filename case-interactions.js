// ============================================================================
//  CASE STUDY PAGE INTERACTIONS
//  Lenis smooth scroll + the home page's custom cursor, plus a magnetic pull
//  on this page's interactive targets.
//
//  WHY THIS FILE EXISTS
//  The home page gets its scroll and cursor from app.js, which is one large
//  IIFE built around the film-strip carousel — nothing in it is importable, and
//  most of it (recentering, drag scrubbing, waveform) is meaningless here. This
//  is the case-study-sized equivalent: the same Lenis feel and the same cursor
//  states, without the carousel machinery.
//
//  Keep the cursor's visual states in sync with style.css / app.js if either
//  side changes.
// ============================================================================
(function () {
  var mq = window.matchMedia;
  var reduce = mq && mq("(prefers-reduced-motion: reduce)").matches;
  var finePointer = mq && mq("(hover: hover) and (pointer: fine)").matches;

  // --- Lenis smooth scroll --------------------------------------------------
  // Same lerp as the home page so both pages feel like one site. Unlike home,
  // this is a plain page scroll — no recentering, no carousel input, so the
  // scroll value is used for nothing but scrolling.
  var lenis = null;
  if (window.Lenis && !reduce) {
    lenis = new window.Lenis({
      lerp: 0.085, // lower = heavier, more inertia
      wheelMultiplier: 1,
      smoothWheel: true,
      syncTouch: true,
      autoRaf: false, // advanced from the shared rAF loop below
    });
  }

  // --- custom cursor --------------------------------------------------------
  var cursorEl = null;
  var curX = 0, curY = 0, curTX = 0, curTY = 0;
  var cursorShown = false;

  if (finePointer) {
    cursorEl = document.createElement("div");
    cursorEl.className = "zl-cursor is-hidden";
    var viewTag = document.createElement("span");
    viewTag.className = "zl-cursor-view";
    viewTag.textContent = "VIEW";
    cursorEl.appendChild(viewTag);
    document.body.appendChild(cursorEl);

    window.addEventListener("pointermove", function (e) {
      curTX = e.clientX;
      curTY = e.clientY;
      if (!cursorShown) {
        // jump to the pointer on first sight instead of flying in from 0,0
        cursorShown = true;
        curX = curTX;
        curY = curTY;
      }
      var t = e.target;
      // form fields keep the native caret, so hide ours over them
      var overField = !!(t.closest && t.closest("input, textarea"));
      cursorEl.classList.toggle("is-hidden", overField);
      // "VIEW" over the related-project cards, matching the home page's stage
      var view = !overField && !!(t.closest && t.closest(".cta-card"));
      cursorEl.classList.toggle("is-view", view);
      var link = !overField && !view && !!(t.closest && t.closest("a, button"));
      cursorEl.classList.toggle("is-link", link);
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

  // --- magnetic targets -----------------------------------------------------
  // The home page has no magnetism — this is new here. Each target is pulled a
  // fraction of the way toward the pointer once the pointer is within RADIUS of
  // its box, and eases back to rest on exit.
  var MAG_SELECTOR = ".cta-all, .contact-card button, .case-nav a, .case-logo";
  var RADIUS = 90; // px of slack around the element's box
  var PULL = 0.32; // fraction of the pointer offset the element travels
  var EASE = 0.18; // per-frame approach rate toward that target
  var magnets = [];

  function collectMagnets() {
    magnets = [].slice.call(document.querySelectorAll(MAG_SELECTOR)).map(function (el) {
      el.classList.add("magnetic");
      return { el: el, x: 0, y: 0, tx: 0, ty: 0 };
    });
  }

  // Reads every rect. Called before any writes each frame so the frame costs
  // one layout flush instead of one per magnet.
  function measureMagnets() {
    // Rest until the pointer's real position is known. Without this the first
    // frames measure against (0, 0) and every magnet near the top-left corner
    // — the logo, the nav — visibly drifts toward it on load.
    if (!cursorShown || !magnets.length) return;
    for (var i = 0; i < magnets.length; i++) {
      var m = magnets[i];
      var r = m.el.getBoundingClientRect();
      // Subtract the current offset to get the element's RESTING centre —
      // measuring the translated box would let the pull feed back on itself
      // and the element would drift away under the pointer.
      var cx = r.left + r.width / 2 - m.x;
      var cy = r.top + r.height / 2 - m.y;
      var dx = curTX - cx;
      var dy = curTY - cy;
      var inside =
        Math.abs(dx) < r.width / 2 + RADIUS && Math.abs(dy) < r.height / 2 + RADIUS;
      m.tx = inside ? dx * PULL : 0;
      m.ty = inside ? dy * PULL : 0;
    }
  }

  // --- one rAF loop for all three ------------------------------------------
  function frame(now) {
    if (lenis) lenis.raf(now);

    // read first...
    if (!reduce) measureMagnets();

    // ...then write, so nothing forces a synchronous re-layout mid-frame
    if (cursorEl && cursorShown) {
      var k = reduce ? 1 : 0.3;
      curX += (curTX - curX) * k;
      curY += (curTY - curY) * k;
      cursorEl.style.translate = curX.toFixed(1) + "px " + curY.toFixed(1) + "px";
    }
    if (!reduce) {
      for (var i = 0; i < magnets.length; i++) {
        var m = magnets[i];
        m.x += (m.tx - m.x) * EASE;
        m.y += (m.ty - m.y) * EASE;
        m.el.style.translate = m.x.toFixed(2) + "px " + m.y.toFixed(2) + "px";
      }
    }

    requestAnimationFrame(frame);
  }

  collectMagnets();
  requestAnimationFrame(frame);
})();
