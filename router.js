// ============================================================================
//  OVERLAY ROUTER (Option A)
//
//  Keeps the HOME page alive and shows case studies in a full-screen iframe
//  overlay, so moving home <-> case never reloads the top document. Home is
//  paused (app.js halts its loop when it leaves for a case) and hidden behind
//  the overlay; coming back is instant and keeps home's exact state — scroll,
//  active project, mode — because it was never destroyed.
//
//  WHY AN IFRAME
//  The case study runs unchanged in its own document: its CSS, Lenis, cursor,
//  scroll-reveal and the first-paint hero handoff all work exactly as they do on
//  a real visit, with zero bleed into the home page's styles or scroll engine.
//  The cost is that a shared-element hero morph across the frame boundary is not
//  possible — this preserves today's panel-cover disguise, minus the reload.
//
//  HISTORY MODEL
//  Iframe navigations create entries in the SHARED session history, which tangles
//  the back button. So the frame is only ever loaded with location.replace() —
//  it never adds a history entry — and the TOP document's pushState is the sole
//  history: index.html <-> project.html#slug. popstate drives the frame. Every
//  link inside the frame that would navigate it (home links AND related cards) is
//  intercepted and rerouted through here.
//
//  HOW IT HOOKS IN
//  app.js already calls window.ZLTransition.leaveTo({ href: "project.html#slug",
//  ... }) to open a case, having first paused home and stashed the hero. We wrap
//  that call: for a case href we inject an onCommit, so when the panel finishes
//  covering it swaps in the iframe instead of navigating. transition.js is
//  otherwise untouched — the same panel choreography plays.
//
//  Only runs on the home document. A directly-loaded case page has no home
//  engine to overlay, so it keeps the plain navigation transition.js gives it.
// ============================================================================
(function () {
  // Home only — mirrors transition.js's own test.
  function isHomePage() {
    return /(^|\/)(index\.html)?$/.test(location.pathname.replace(/\/+$/, "/"));
  }
  if (!isHomePage() || !window.ZLTransition) return;

  var CASE_RE = /^project\.html(\?|#|$)/;
  var HOME_RE = /^index\.html(\?|#|$)/;

  var overlay = null; // the iframe, or null when closed
  var open = false;

  // Run fn after the next paint, but never depend on rAF alone: it is throttled
  // to a stop in a background/occluded tab, which would strand the cover panel
  // over the loaded case forever. The timeout is the same backstop transition.js
  // uses for its own navigation commit.
  function afterPaint(fn) {
    var done = false;
    function run() { if (done) return; done = true; fn(); }
    requestAnimationFrame(function () { requestAnimationFrame(run); });
    setTimeout(run, 120);
  }

  function slugOf(href) {
    var h = (href || "").split("#")[1] || "";
    return h.toLowerCase();
  }

  // Hero data for a related-card cover, read from the same list app.js uses.
  function findProject(slug) {
    var list = window.PROJECTS || [];
    for (var i = 0; i < list.length; i++) {
      var s = (list[i].slug || list[i].name || "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (s === slug) return list[i];
    }
    return null;
  }

  function frameDoc() {
    try { return overlay && overlay.contentDocument; } catch (e) { return null; }
  }

  // --- the frame ------------------------------------------------------------
  function ensureFrame() {
    if (overlay) return;
    overlay = document.createElement("iframe");
    overlay.className = "zl-overlay";
    overlay.setAttribute("title", "Case study");
    document.body.appendChild(overlay); // its window starts at about:blank
  }

  // Load a case into the frame WITHOUT adding a history entry, and wire its
  // links once it is in. onReady runs after the new document loads.
  function loadFrame(href, onReady) {
    ensureFrame();
    overlay.onload = function () {
      wireFrameLinks();
      if (onReady) onReady();
    };
    try {
      overlay.contentWindow.location.replace(href);
    } catch (e) {
      overlay.src = href; // last resort; only reached cross-origin, which can't happen here
    }
  }

  // --- open / swap a case ---------------------------------------------------
  // The panel is already covering (the caller used leaveTo). Load the frame
  // behind it, then settle the panel onto the case's matching first-paint hero.
  function showCase(href, push) {
    if (push) { try { history.pushState({ zlCase: href }, "", href); } catch (e) {} }
    loadFrame(href, function () {
      if (!open) {
        open = true;
        document.body.classList.add("zl-case-open");
      }
      afterPaint(function () { window.ZLTransition.settle(); });
    });
  }

  // The cover options for a case href: which hero the panel shows on its way
  // over, and — because transition.js stashes them for the destination's
  // first paint — what that page paints before its own JSON has resolved.
  // Shared by every route into a case so none of them can be the one that
  // forgets and arrives on flat colour.
  function coverOptsFor(href) {
    var slug = slugOf(href);
    var p = findProject(slug);
    return {
      href: href,
      theme: "dark",
      slug: slug,
      image: p ? (p.hero || p.image) : "",
      title: p ? p.name : "",
      meta: p ? p.heroMeta : [],
      intro: p ? p.heroIntro : "",
    };
  }

  // Drift the case study away behind the panel — the parallax rule in
  // transition.css. transition.js marks its OWN document, which here is the
  // home page: the page actually being left is the one in the frame, so it
  // has to be marked separately. No cleanup: every route out of this either
  // replaces the frame document or removes the frame entirely.
  function markFrameLeaving(theme) {
    var doc = frameDoc();
    // transition.js owns this — it also pins the transform origins the recede
    // depends on, which cannot be expressed in CSS.
    if (doc) window.ZLTransition.markLeaving(doc, theme || "dark");
  }

  // Next-project navigation from inside the frame: cover with the new hero
  // (looked up from PROJECTS), push the URL, swap the frame.
  function gotoCase(href) {
    var opts = coverOptsFor(href);
    opts.onCommit = function () { showCase(href, true); };
    markFrameLeaving("dark");
    window.ZLTransition.leaveTo(opts);
  }

  // Intercept links INSIDE the (same-origin) frame so they never navigate the
  // frame itself: home links close the overlay, case links swap through here.
  // Runs once per frame document (each load is a fresh document).
  function wireFrameLinks() {
    var doc = frameDoc();
    if (!doc) return;
    doc.addEventListener(
      "click",
      function (e) {
        var a = e.target.closest ? e.target.closest("a[href]") : null;
        if (!a) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        if (a.target === "_blank") return;
        var raw = a.getAttribute("href") || "";
        // preventDefault also stops transition.js inside the frame from acting —
        // its own handler bails on defaultPrevented.
        if (HOME_RE.test(raw)) {
          e.preventDefault();
          closeToHome(true);
        } else if (CASE_RE.test(raw)) {
          e.preventDefault();
          gotoCase(raw);
        }
      },
      true // capture: ahead of the frame's own bubbling handler
    );
  }

  // --- close back to the live home ------------------------------------------
  function closeToHome(push) {
    if (!open) return;
    // Cover with the light panel (home is white underneath), then swap home back
    // in behind it. leaveTo needs an href even though we never navigate; onCommit
    // takes over before it would.
    markFrameLeaving("light"); // panel is white on the way home; match the ground
    var covered = window.ZLTransition.leaveTo({
      href: "index.html",
      theme: "light",
      onCommit: function () { finishClose(push); },
    });
    if (!covered) finishClose(push); // reduced motion / no panel: just close
  }

  function finishClose(push) {
    open = false;
    document.body.classList.remove("zl-case-open");
    if (overlay) {
      overlay.onload = null;
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      overlay = null; // fully drop the case document; next open builds fresh
    }
    // Resume the home engine app.js paused when it left for the case.
    window.dispatchEvent(new Event("zl:home-resume"));
    if (push) { try { history.pushState({}, "", "index.html"); } catch (e) {} }
    // Drop the panel onto the now-live home.
    afterPaint(function () { window.ZLTransition.settle(); });
  }

  // --- history: back / forward ----------------------------------------------
  window.addEventListener("popstate", function () {
    var here = location.pathname.replace(/^.*\//, "") + location.hash;
    if (CASE_RE.test(here)) {
      // Into a case, or between two cases — one branch, because showCase sets
      // the open flag itself and the cover carries the hero either way. They
      // were separate, and the between-cases one swapped the frame with no
      // cover at all: the case you were reading vanished and the next one
      // arrived on flat colour, since nothing had stashed its hero for first
      // paint. Both now travel the same way a click does.
      //
      // The URL is already where it is going — popstate is the browser
      // telling us it moved — so showCase must not push it again.
      var opts = coverOptsFor(here);
      opts.onCommit = function () { showCase(here, false); };
      markFrameLeaving("dark"); // no-op when arriving from home; no frame yet
      window.ZLTransition.leaveTo(opts);
    } else if (open) {
      closeToHome(false); // back to home: URL already changed, don't push
    }
  });

  // --- hook into the existing leaveTo ---------------------------------------
  var _leaveTo = window.ZLTransition.leaveTo;
  window.ZLTransition.leaveTo = function (opts) {
    opts = opts || {};
    // Home -> case: route through the overlay. An explicit onCommit (our own
    // close/forward/related covers) or a non-case href passes straight through.
    if (!opts.onCommit && CASE_RE.test(opts.href || "")) {
      var href = opts.href;
      opts.onCommit = function () { showCase(href, true); };
    }
    return _leaveTo.call(window.ZLTransition, opts);
  };
})();
