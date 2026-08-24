// ============================================================================
//  PAGE TRANSITION
//
//  Drives the leaving panel (see transition.css). Shared by both pages so the
//  two directions cannot drift apart — they were one implementation living in
//  app.js before this, which meant the way back had nothing to use.
//
//  WHY IT RUNS ON THE PAGE YOU ARE LEAVING
//  A real navigation destroys the outgoing document the moment it commits, so
//  the incoming page has nothing to animate over. The panel covers the screen
//  here, and only once it is solid do we leave. The destination then paints
//  onto the same colour and the swap is invisible.
//
//  USAGE
//    ZLTransition.leaveTo({ href: "project.html#krool",
//                           image: "portfolio/krool/hero.png",
//                           theme: "dark" })
//
//  Links to the home page are intercepted automatically on any page that is
//  not the home page — see the delegated handler at the bottom. The home page
//  drives its own exits explicitly from app.js, because its cards are canvas-
//  like elements rather than plain anchors.
// ============================================================================
(function () {
  var mq = window.matchMedia;
  var reduce = mq && mq("(prefers-reduced-motion: reduce)").matches;
  // Comfortably past the whole choreography — the slide (700ms) plus the hero
  // rise that finishes around 1020ms. Only a safety net for background tabs,
  // where transitionend never fires; it must never preempt the real reveal.
  var FALLBACK_MS = 1500;

  var panel = null;
  var panelImg = null;
  var panelHero = null;
  var leaving = false;

  // Built at load, not on demand: the panel has to be painted at rest before
  // .is-covering is added, or the browser coalesces both into one style pass
  // and it jumps straight to covered instead of travelling.
  function buildPanel() {
    if (panel) return;
    panel = document.createElement("div");
    panel.className = "page-cover";
    panel.setAttribute("aria-hidden", "true");
    panelImg = document.createElement("div");
    panelImg.className = "page-cover-img";
    panel.appendChild(panelImg);
    panelHero = document.createElement("div");
    panelHero.className = "page-cover-hero";
    panel.appendChild(panelHero);
    document.body.appendChild(panel);
  }

  // Rebuilds the hero block the destination is about to show: meta, title,
  // intro, in that order, so the CSS margins put them where that page will.
  // The title rises inside a mask — the same construction reveal.js builds —
  // so what the panel shows and what the page then displays are the same shape
  // rather than an approximation of it.
  function setPanelHero(opts) {
    panelHero.textContent = "";
    if (!opts || !opts.title) return;

    var meta = opts.meta || [];
    if (meta.length) {
      // The meta rides up out of a clip, exactly like the title below, rather
      // than fading — so the whole hero arrives as one masked rise. The wrapper
      // is the mask; the dl is what travels inside it.
      var metaMask = document.createElement("div");
      metaMask.className = "page-cover-metamask";
      var dl = document.createElement("dl");
      dl.className = "page-cover-meta";
      meta.forEach(function (col) {
        var wrap = document.createElement("div");
        wrap.className = "page-cover-metacol";
        var dt = document.createElement("dt");
        dt.textContent = col.label || "";
        wrap.appendChild(dt);
        var vals = document.createElement("div");
        vals.className = "vals";
        (col.values || []).forEach(function (v) {
          var dd = document.createElement("dd");
          dd.textContent = v;
          vals.appendChild(dd);
        });
        wrap.appendChild(vals);
        dl.appendChild(wrap);
      });
      metaMask.appendChild(dl);
      panelHero.appendChild(metaMask);
    }

    var h1 = document.createElement("h1");
    h1.className = "page-cover-title";
    var mask = document.createElement("span");
    mask.className = "page-cover-mask";
    var line = document.createElement("span");
    line.className = "page-cover-line";
    line.textContent = opts.title;
    mask.appendChild(line);
    h1.appendChild(mask);
    panelHero.appendChild(h1);

    if (opts.intro) {
      // Same masked rise: the <p> is the clip, the inner span is what travels.
      var p = document.createElement("p");
      p.className = "page-cover-intro";
      var introLine = document.createElement("span");
      introLine.className = "page-cover-intro-line";
      introLine.textContent = opts.intro;
      p.appendChild(introLine);
      panelHero.appendChild(p);
    }
  }

  // --- marking the page being left ------------------------------------------
  // Sets the hook the parallax/recede/veil rules in transition.css key off,
  // and pins the transform origins those rules depend on.
  //
  // WHY THE ORIGINS ARE COMPUTED HERE AND NOT DECLARED IN CSS
  // The page scales away by scaling its body's children. Left alone each one
  // scales about its own centre, and <main> on a case study runs to several
  // thousand pixels — its centre is far outside the viewport, so it would
  // shear away from the header and hero above it rather than scaling with
  // them. There is no CSS value for "the middle of the viewport" in an
  // element's own coordinate space, because it depends on where that element
  // currently sits. So we measure it: the same viewport point, expressed
  // separately for each child, which makes them scale as one page.
  //
  // Takes a document because the page being left is not always this one — under
  // the overlay router the panel lives in the home document while the case
  // study being left is inside an iframe.
  function markLeaving(doc, theme) {
    var body = doc && doc.body;
    if (!body) return;
    // Only the case page scales; nothing else matches the CSS either.
    if (body.classList.contains("case")) {
      var mid = (doc.defaultView || window).innerHeight / 2;
      var moving = [];
      var kids = body.children;
      for (var i = 0; i < kids.length; i++) {
        var el = kids[i];
        if (el.classList.contains("page-cover") || el.classList.contains("zl-cursor")) continue;
        if (el.tagName === "SCRIPT" || el.tagName === "STYLE" || el.tagName === "LINK") continue;
        moving.push(el);
      }
      // Read every position, then write every origin. Interleaving them would
      // make each write invalidate the layout the next read needs, turning
      // four cheap measurements into four full reflows at the worst possible
      // moment — the frame the whole transition starts on.
      var tops = moving.map(function (el) { return el.getBoundingClientRect().top; });
      moving.forEach(function (el, n) {
        el.style.transformOrigin = "50% " + (mid - tops[n]) + "px";
      });
      // A --cover-recede above 1 grows the page past the viewport, and the
      // half that overflows to the RIGHT is real scrollable overflow — enough
      // to flash a horizontal scrollbar for the length of the transition.
      // Clip that axis only: clipping the whole thing would propagate to the
      // viewport, and a viewport that stops scrolling clamps scrollTop, which
      // would snap the page to the top mid-leave. `clip` rather than `hidden`
      // so no scroll container is created on the root either.
      doc.documentElement.style.overflowX = "clip";
    }
    // Last: the origins have to be in place before the rules that use them
    // apply, or the first frame scales about the wrong point.
    body.setAttribute("data-leaving", theme || "dark");
  }

  function clearLeaving(doc) {
    var body = doc && doc.body;
    if (!body) return;
    body.removeAttribute("data-leaving");
    doc.documentElement.style.overflowX = "";
    var kids = body.children;
    for (var i = 0; i < kids.length; i++) kids[i].style.transformOrigin = "";
  }

  function leaveTo(opts) {
    var href = opts && opts.href;
    if (!href || leaving) return false;
    if (reduce || !panel) {
      window.location.href = href;
      return true;
    }
    leaving = true;
    panel.hidden = false; // settle() may have hidden it after the last open
    panel.setAttribute("data-theme", opts.theme || "dark");
    // No image on the light theme: it hands off to the home page's loader,
    // which is plain white and could not match a photograph anyway.
    panelImg.style.backgroundImage = opts.image
      ? 'url("' + encodeURI(opts.image) + '")'
      : "";
    setPanelHero(opts);
    // Tell the destination its title has already been shown, so it displays it
    // in place rather than revealing it a second time. Keyed by slug because
    // the flag must not survive into a different project.
    //
    // zl:herotext carries the actual hero copy across too, the same way app.js
    // stashes zl:hero for the image: the destination leaves its title/meta/intro
    // empty until content/<slug>.json resolves, so the text the panel just rose
    // would otherwise vanish for the fetch's duration and blink back. With this
    // the case page paints the hero at first paint and shows it in place. It is
    // the exact same copy — config reads heroMeta/heroIntro from the same
    // data.hero this JSON serialises — so it can never disagree with render().
    if (opts.title && opts.slug) {
      try {
        sessionStorage.setItem("zl:titleShown:" + opts.slug, "1");
        sessionStorage.setItem(
          "zl:herotext:" + opts.slug,
          JSON.stringify({ title: opts.title, meta: opts.meta || [], intro: opts.intro || "" })
        );
      } catch (e) {
        /* private mode — the page reveals its title as normal */
      }
    }
    // The hero IMAGE half of the same handoff, and for the same reason: the
    // destination cannot even request its hero until content/<slug>.json has
    // resolved, which loses the race against first paint — so it opens on flat
    // colour and the photograph this panel is showing blinks back in a frame
    // later. Its <head> script reads this key before <body> is parsed.
    //
    // It lives HERE, not in the callers, because every route needs it and only
    // one had it: app.js wrote it for home -> case, so that hop was clean while
    // both case -> case routes (the overlay router's next-project swap and the
    // standalone page's own links) flashed on arrival. app.js keeps its copy —
    // that one also covers its no-ZLTransition fallback, and writes the same
    // value from the same data, so the two cannot disagree.
    if (opts.image && opts.slug) {
      try {
        sessionStorage.setItem("zl:hero:" + opts.slug, opts.image);
      } catch (e) {
        /* private mode — the page fetches it as before */
      }
    }

    var commit = opts.onCommit;
    var done = false;
    function go() {
      if (done) return;
      done = true;
      // Option A overlay: the router hands us an onCommit and there is NO
      // navigation — it swaps a case iframe in behind the covered panel, then
      // calls settle() to drop the panel onto the matching hero. Only a real
      // leave (no router, or a directly-loaded case page) navigates.
      if (commit) commit(opts);
      else window.location.href = href;
    }
    // Navigate once the hero has finished RISING, not when the panel finishes
    // sliding. The rise is the last, most visible beat — it plays on the covered
    // panel after the slide — so leaving at the end of the slide would cut it off
    // and the case page (which shows the hero in place) would snap it to the end.
    // The intro is last in the cascade; fall back through the shorter heroes and
    // finally to the panel's own slide when there is no hero at all (the way back
    // to the home page carries none).
    var lastRise =
      panel.querySelector(".page-cover-intro-line") ||
      panel.querySelector(".page-cover-line") ||
      panel.querySelector(".page-cover-meta");
    panel.addEventListener("transitionend", function (e) {
      if (e.propertyName !== "translate") return;
      if (e.target === (lastRise || panel)) go();
    });
    // transitionend never fires in a background tab — never strand the click
    setTimeout(go, FALLBACK_MS);
    // Commit the rest state before travelling. On the first open the panel was
    // painted at rest at load; on a REUSED panel (settle() put it back to rest
    // while hidden) this reflow is what stops it jumping straight to covered.
    // Drift, recede and dim the page behind the panel — see the parallax block
    // in transition.css. Ahead of the reflow below deliberately: that one
    // forced layout then commits the panel's rest state AND starts this, so
    // both are moving from the same paint rather than a frame apart.
    //
    // On a case page opened through the overlay router this document is HOME,
    // whose body is not .case, so only the attribute lands and nothing moves —
    // router.js marks the frame's own body, since that is the page actually
    // being left there.
    markLeaving(document, opts.theme || "dark");
    void panel.offsetWidth;
    panel.classList.add("is-covering");
    return true;
  }

  // Put the panel back to rest and re-arm it. Shared by the bfcache restore
  // (back button) and the overlay router, which reuses the one panel open after
  // open instead of discarding it with a navigated-away document.
  function reset() {
    leaving = false;
    clearLeaving(document); // page snaps back to rest
    if (!panel) return;
    panel.classList.remove("is-covering");
    panel.removeAttribute("data-theme");
    panel.hidden = false;
    setPanelHero(null);
  }

  // Drop the panel instantly (no retract) once the overlay underneath is showing
  // the matching hero — the invisible swap a real navigation used to give us,
  // now without a document change. Hiding FIRST means the re-arm below cannot be
  // seen animating back to rest.
  function settle() {
    clearLeaving(document);
    if (!panel) return;
    panel.hidden = true;
    panel.classList.remove("is-covering");
    panel.removeAttribute("data-theme");
    setPanelHero(null);
    leaving = false;
  }

  // Coming back via the browser's back button restores a page from the bfcache
  // exactly as it was left: frozen behind a solid panel. reset() re-arms it.
  window.addEventListener("pageshow", reset);

  // --- leaving to the home page, or to another case study -------------------
  // Delegated so it covers links rendered later by nav.js and case-studies.js
  // (next-project, "Browse All Case Studies", the footer), and so every route
  // behaves the same wherever the link lives.
  //
  // A case study opened through the home page's overlay router has its case
  // links claimed FIRST — router.js listens on the same document in the
  // capture phase, ahead of this bubble-phase handler, and calls
  // preventDefault() before this ever sees the click (the e.defaultPrevented
  // check below is what keeps the two from double-handling the same click).
  // This handler is what's left for everything the router doesn't cover: the
  // home page itself (which drives its own exits from app.js), and a
  // directly-loaded or refreshed case page, which has no router at all — its
  // case-to-case links used to fall straight through to a plain reload with
  // no panel. Same leaveTo() either way; only the destination differs.
  function isHomePage() {
    return /(^|\/)(index\.html)?$/.test(location.pathname.replace(/\/+$/, "/"));
  }

  var CASE_RE = /^project\.html(\?|#|$)/;
  var HOME_RE = /^index\.html(\?|#|$)/;

  function homeHrefWithProject(base) {
    // Carry the project across so home restores what you were just reading
    // instead of resetting to the first one — app.js already reads this hash
    // on load. Falls back to a bare link when the slug is unknown.
    var slug = (location.hash || "").replace(/^#/, "").toLowerCase();
    if (!slug) return base;
    // app.js's own key, kept current whenever the view mode changes — so you
    // come back to the mode you left in, not always horizontal.
    var mode = "horizontal";
    try {
      var saved = localStorage.getItem("zerolab.mode");
      if (saved === "horizontal" || saved === "vertical" || saved === "grid") mode = saved;
    } catch (e) {
      /* storage unavailable — the default is fine */
    }
    return base + "#" + mode + "/" + slug;
  }

  // Mirrors router.js's own findProject — that copy serves the overlay (a
  // different window, a different set of concerns: pushState, iframe swap).
  // This one only needs the destination's hero to hand to leaveTo().
  function findProject(slug) {
    var list = window.PROJECTS || [];
    for (var i = 0; i < list.length; i++) {
      var s = (list[i].slug || list[i].name || "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-");
      if (s === slug) return list[i];
    }
    return null;
  }

  document.addEventListener("click", function (e) {
    if (isHomePage()) return; // home drives its own exits from app.js
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (a.target === "_blank") return;
    var raw = a.getAttribute("href") || "";

    if (HOME_RE.test(raw)) {
      e.preventDefault();
      leaveTo({ href: homeHrefWithProject("index.html"), theme: "light" });
      return;
    }
    if (CASE_RE.test(raw)) {
      // Only reached with no router present (see the comment above) — router
      // pages never leave this un-prevented. No onCommit, so leaveTo's own
      // fallback runs at the end of the rise: a real window.location.href.
      var slug = (raw.split("#")[1] || "").toLowerCase();
      var p = findProject(slug);
      e.preventDefault();
      leaveTo({
        href: raw,
        theme: "dark",
        slug: slug,
        image: p ? (p.hero || p.image) : "",
        title: p ? p.name : "",
        meta: p ? p.heroMeta : [],
        intro: p ? p.heroIntro : "",
      });
    }
  });

  window.ZLTransition = {
    leaveTo: leaveTo,
    buildPanel: buildPanel,
    reset: reset,
    settle: settle,
    // Exposed for router.js: under the overlay the page being left lives in an
    // iframe, so the document it has to mark is not this one.
    markLeaving: markLeaving,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPanel);
  } else {
    buildPanel();
  }
})();
