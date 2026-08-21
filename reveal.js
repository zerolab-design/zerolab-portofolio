// ============================================================================
//  CASE STUDY SCROLL REVEAL
//
//  Three effects, one IntersectionObserver:
//    1. headings split into lines, each riding up out of an overflow-hidden
//       mask (the same trick as the home page's per-character `nameRise`,
//       one level coarser)
//    2. label chip and body copy fading up beneath the heading
//    3. media lifting in behind a clip-path curtain, staggered across a group
//
//  Everything fires ONCE. Re-firing on scroll-back turns a reveal into a
//  distraction on a page people scroll up and down while reading.
//
//  The hidden states live in project.css under html.has-reveal, set below
//  before any content renders — if this script never runs, nothing is hidden.
//
//  Content arrives asynchronously now (case-studies.js fetches content/<slug>
//  .json), so binding waits on the `casestudy:rendered` event that project.html
//  dispatches once the DOM is built.
// ============================================================================
(function () {
  var root = document.documentElement;
  var reduce =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Claim the hidden states immediately — before render, so nothing flashes.
  root.classList.add("has-reveal");

  var LINE_TARGETS = ".sec-heading, .hero-title";
  var observer = null;

  // Set when the hero was handed across the navigation and shown in place at
  // first paint (see revealHeroInstant). It tells bind() to leave the hero
  // alone: splitting or animating it again would replay a move the panel
  // already performed — the "beeping" the whole handoff exists to remove.
  var heroBound = false;

  // Stage 3's start, read back from the CSS rather than repeated here so the
  // whole sequence stays tunable from one place. It deliberately overlaps the
  // tail of stage 2 — see the note beside --enter-copy.
  function cssMs(name, fallback) {
    var v = getComputedStyle(root).getPropertyValue(name).trim();
    var n = parseFloat(v);
    if (!v || isNaN(n)) return fallback;
    return /ms$/.test(v) ? n : n * 1000; // a bare seconds value is still valid CSS
  }
  function heroCopyDelay() {
    return cssMs("--enter-copy", 380);
  }


  // --- line splitting -------------------------------------------------------
  // Wraps each visual line in <span class="rv-mask"><span class="rv-line">.
  // Words are measured as plain inline spans so wrapping, balancing and
  // justification stay exactly as the browser laid them out — switching them to
  // inline-block would change the line breaks we are trying to capture.
  function splitLines(el) {
    // Marks the element as handled. The hero title is hidden until this lands,
    // so it can never be painted as raw text between the content arriving and
    // the masks being built. Set before the early return below — otherwise an
    // empty title would stay hidden forever.
    el.classList.add("rv-split");
    var text = el.getAttribute("data-rv-text");
    if (text === null) {
      text = el.textContent.replace(/\s+/g, " ").trim();
      el.setAttribute("data-rv-text", text);
    }
    if (!text) return;

    var words = text.split(" ");
    el.textContent = "";
    var probes = words.map(function (w, i) {
      var s = document.createElement("span");
      s.textContent = w;
      el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(" "));
      return s;
    });

    // Group words by their vertical offset — same offset means same line.
    var lines = [];
    var currentTop = null;
    probes.forEach(function (s) {
      var top = s.offsetTop;
      if (currentTop === null || top !== currentTop) {
        lines.push([]);
        currentTop = top;
      }
      lines[lines.length - 1].push(s.textContent);
    });

    el.textContent = "";
    lines.forEach(function (words, i) {
      var mask = document.createElement("span");
      mask.className = "rv-mask";
      var line = document.createElement("span");
      line.className = "rv-line";
      line.textContent = words.join(" ");
      mask.appendChild(line);
      el.appendChild(mask);
      // The masks are block boxes, so textContent would run the last word of
      // one line into the first of the next — "Turningconversations" to a
      // screen reader or anyone copying the heading. Whitespace between block
      // boxes is not rendered, so this costs nothing visually.
      if (i < lines.length - 1) el.appendChild(document.createTextNode(" "));
    });
  }

  // --- stagger indices ------------------------------------------------------
  // One running counter per group so the cascade reads label -> heading lines
  // -> body, rather than three separate animations starting together.
  function indexGroup(scope) {
    var i = 0;
    var label = scope.querySelector(".sec-label");
    if (label) label.style.setProperty("--i", i++);
    scope.querySelectorAll(".rv-line").forEach(function (line) {
      line.style.setProperty("--i", i++);
    });
    scope.querySelectorAll(".hero-meta-col").forEach(function (col) {
      col.style.setProperty("--i", i++);
    });
    scope.querySelectorAll(".sec-body p, .hero-intro").forEach(function (p) {
      p.style.setProperty("--i", i++);
    });
  }

  function indexMedia(media) {
    media.querySelectorAll("img").forEach(function (img, i) {
      img.style.setProperty("--i", i);
    });
  }

  // --- binding --------------------------------------------------------------
  function bind() {
    var heads = [].slice.call(document.querySelectorAll(".sec-head"));
    var media = [].slice.call(document.querySelectorAll(".sec-media"));
    var heroInner = document.querySelector(".hero-inner");

    // Skip the hero entirely when it arrived through the panel: project.html
    // filled it from the stash and revealHeroInstant already showed it. Only
    // the sections still need splitting, indexing and observing.
    document.querySelectorAll(heroBound ? ".sec-heading" : LINE_TARGETS).forEach(splitLines);
    heads.forEach(indexGroup);
    if (heroInner && !heroBound) indexGroup(heroInner);
    media.forEach(indexMedia);

    // Arrived through the leaving panel, which already rose this title while
    // the page was travelling — show it in place rather than playing the same
    // reveal a second time. Keyed by slug so the flag cannot leak into another
    // project, and cleared on use so a later direct visit animates normally.
    var arrivedSlug = (location.hash || "").replace(/^#/, "").toLowerCase();
    if (heroInner && arrivedSlug && !heroBound) {
      try {
        if (sessionStorage.getItem("zl:titleShown:" + arrivedSlug)) {
          // The whole block, not just the title — the panel rises the meta and
          // intro too, so revealing any part of it again would replay a move
          // the reader has already watched.
          heroInner.classList.add("rv-instant");
          sessionStorage.removeItem("zl:titleShown:" + arrivedSlug);
        }
      } catch (e) {
        /* storage unavailable — the hero reveals as normal */
      }
    }

    // Arrival sequence, three separate beats: the page travels up from the
    // bottom edge, then the hero backdrop settles out of its 1.1 scale, then
    // the copy reveals. Each waits for the one before it, with a pause between,
    // so they read as a sequence rather than one blur of movement. The hero is
    // above the fold on every load, so none of it waits on the observer to say
    // what we already know.
    //
    // Two frames before starting: one to paint the resting state, one to begin
    // the transition. In a single frame the browser coalesces both into one
    // style recalculation and nothing moves at all.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        root.classList.add("is-entered");
        // heroBound: the panel already delivered the hero in place, so there is
        // nothing to animate in here — only the page-level is-entered above,
        // which the navbar still rides.
        if (!heroInner || heroBound) return;
        if (reduce) { heroInner.classList.add("is-in"); return; }
        setTimeout(function () {
          heroInner.classList.add("is-in");
        }, heroCopyDelay());
      });
    });

    if (reduce || !("IntersectionObserver" in window)) {
      // No observer: show everything and stop. Under reduced motion the CSS
      // has already flattened these to a plain fade.
      heads.concat(media).forEach(function (el) { el.classList.add("is-in"); });
      return;
    }

    observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-in");
          observer.unobserve(entry.target); // once, never again
        });
      },
      // -100px keeps the reveal from firing while the element is still a
      // sliver at the edge of the viewport.
      { rootMargin: "-100px 0px -100px 0px", threshold: 0 }
    );

    heads.concat(media).forEach(function (el) { observer.observe(el); });
  }

  // --- resize ---------------------------------------------------------------
  // Line breaks move when the viewport does — `text-wrap: balance` and the
  // justified headings re-flow at almost every width — so the split has to be
  // rebuilt. Sections already read are restored to their revealed state with
  // transitions suppressed, so nothing replays behind the reader.
  var resizeTimer = null;
  var lastWidth = window.innerWidth;
  function onResize() {
    if (window.innerWidth === lastWidth) return; // ignore mobile scroll-chrome
    lastWidth = window.innerWidth;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      root.classList.add("rv-resplit");
      document.querySelectorAll(LINE_TARGETS).forEach(splitLines);
      document.querySelectorAll(".sec-head").forEach(indexGroup);
      var heroInner = document.querySelector(".hero-inner");
      if (heroInner) indexGroup(heroInner);
      // Force a reflow so the restored positions are committed before
      // transitions come back on.
      void document.body.offsetWidth;
      requestAnimationFrame(function () {
        root.classList.remove("rv-resplit");
      });
    }, 180);
  }

  // --- panel arrival: reveal the hero here, on this quiet document ----------
  // project.html paints the hero copy from the stash before this script runs
  // and flags window.__zlHeroPre. The panel now carries only the image, so this
  // page owns the hero reveal — and it plays the SAME entry the page runs on a
  // direct visit (masked title rise, meta and intro fading up), just started now
  // instead of after the content fetch, since the copy is already in. Running it
  // here rather than on the sliding panel is the whole point: the home page is
  // busy driving the carousel and waveform while the panel animates, so a reveal
  // over there drops frames; this document has nothing competing for them.
  // heroBound tells bind() to leave the hero alone and only reveal the sections.
  function revealHeroEntry() {
    var heroInner = document.querySelector(".hero-inner");
    if (!heroInner) return;
    heroBound = true;
    var start = function () {
      var title = heroInner.querySelector(".hero-title");
      if (title) splitLines(title);
      indexGroup(heroInner);
      // Two frames: one to paint the split's resting state (lines at 120% inside
      // their masks), one to begin the rise — coalesced into one, nothing moves.
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          root.classList.add("is-entered");
          if (reduce) { heroInner.classList.add("is-in"); return; }
          setTimeout(function () {
            heroInner.classList.add("is-in");
          }, heroCopyDelay());
        });
      });
    };
    // Split only once the webfont is in, so the masked line breaks match the
    // final layout, not the fallback's. It is cached from the home page, so this
    // resolves almost immediately; the hero stays in its has-reveal hidden state
    // until it does, so nothing flashes. The timeout is a floor in case
    // fonts.ready never settles — the hero must never be left invisible.
    if (document.fonts && document.fonts.ready) {
      var ran = false;
      var run = function () { if (ran) return; ran = true; start(); };
      document.fonts.ready.then(run);
      setTimeout(run, 400);
    } else {
      start();
    }
  }
  if (window.__zlHeroPre) revealHeroEntry();

  window.addEventListener("casestudy:rendered", bind, { once: true });
  window.addEventListener("resize", onResize);
})();
