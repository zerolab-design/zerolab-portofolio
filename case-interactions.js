// ============================================================================
//  CASE STUDY PAGE INTERACTIONS
//  Lenis smooth scroll + the home page's custom cursor.
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
      // "VIEW" over the next-project link, matching the home page's stage
      var view = !overField && !!(t.closest && t.closest(".next-link"));
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

  // --- hero parallax --------------------------------------------------------
  // The backdrop lags the page: scroll a pixel and it moves 1 − FACTOR of one,
  // so the hero reads as sitting behind the copy rather than pasted to it.
  //
  // It moves DOWN as the page scrolls down, which is what "slower" means here,
  // and is also why it can never expose an edge — the strip it uncovers at the
  // top is above the viewport by exactly the distance it has travelled.
  //
  // What moves is .hero::before, not .hero's own background: a background-image
  // cannot be transformed. Driving it through a custom property is the only way
  // in, since a pseudo-element has no node to write a style to.
  var heroEl = document.querySelector(".hero");
  // Reduced motion gets none of this. Scroll-linked movement of a full-screen
  // image is the exact thing that setting is for, so this is the one place on
  // the page that goes to zero rather than merely gentler.
  var HERO_FACTOR = reduce ? 0 : 0.3;
  var heroH = heroEl ? heroEl.offsetHeight : 0;
  var lastShift = -1;

  function heroParallax() {
    if (!heroEl || !HERO_FACTOR) return;
    // Past the hero there is nothing to move, so park it at its last value
    // rather than tracking a scroll position that cannot be seen.
    var y = window.scrollY;
    if (y > heroH) y = heroH;
    // Rounded, then compared: same discipline as the cursor above. Writing an
    // unchanged value still invalidates style for the pseudo-element every
    // frame, and this one sits under the whole page.
    var shift = Math.round(y * HERO_FACTOR * 10) / 10;
    if (shift === lastShift) return;
    lastShift = shift;
    heroEl.style.setProperty("--hero-shift", shift + "px");
  }

  // offsetHeight is a forced layout, so it is read once here and on resize
  // rather than every frame.
  window.addEventListener("resize", function () {
    if (heroEl) heroH = heroEl.offsetHeight;
  });

  // --- one rAF loop for both ------------------------------------------------
  function frame(now) {
    if (lenis) lenis.raf(now);
    heroParallax();

    if (cursorEl && cursorShown) {
      // Only write when it actually moved. The cursor is mix-blend-mode:
      // difference, so every write forces the compositor to read back and
      // re-blend everything underneath it. Writing the same value 60 times a
      // second kept that readback running over whatever else was animating —
      // which is why the reveal stuttered while the pointer sat still.
      var dx = curTX - curX;
      var dy = curTY - curY;
      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
        if (curX !== curTX || curY !== curTY) {
          curX = curTX; // one final write to land exactly, then silence
          curY = curTY;
          cursorEl.style.translate = curX.toFixed(1) + "px " + curY.toFixed(1) + "px";
        }
      } else {
        var k = reduce ? 1 : 0.3;
        curX += dx * k;
        curY += dy * k;
        cursorEl.style.translate = curX.toFixed(1) + "px " + curY.toFixed(1) + "px";
      }
    }

    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();
