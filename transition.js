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
  var FALLBACK_MS = 1200;

  var panel = null;
  var panelImg = null;
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
    document.body.appendChild(panel);
  }

  function leaveTo(opts) {
    var href = opts && opts.href;
    if (!href || leaving) return false;
    if (reduce || !panel) {
      window.location.href = href;
      return true;
    }
    leaving = true;
    panel.setAttribute("data-theme", opts.theme || "dark");
    // No image on the light theme: it hands off to the home page's loader,
    // which is plain white and could not match a photograph anyway.
    panelImg.style.backgroundImage = opts.image
      ? 'url("' + encodeURI(opts.image) + '")'
      : "";
    // Carry the hero COPY across so the case page can paint it at first paint,
    // the same way app.js stashes zl:hero for the image. The panel itself now
    // shows only the image and slides up to cover — the hero TEXT reveals on the
    // case page, out of its masks, on that page's own quiet document rather than
    // on this one, which is still running the carousel, waveform and smooth
    // scroll and cannot spare the frames. The copy is identical to what render()
    // fetches (config reads it from the same data.hero this serialises), so it
    // can never disagree; carrying it just lets the reveal start on arrival
    // instead of waiting on the content fetch.
    if (opts.title && opts.slug) {
      try {
        sessionStorage.setItem(
          "zl:herotext:" + opts.slug,
          JSON.stringify({ title: opts.title, meta: opts.meta || [], intro: opts.intro || "" })
        );
      } catch (e) {
        /* private mode — the case page fills the hero from its own fetch */
      }
    }

    var done = false;
    function go() {
      if (done) return;
      done = true;
      window.location.href = href;
    }
    // Navigate the instant the PANEL itself has finished sliding up — not on
    // the backdrop's zoom, which bubbles up too. Only the panel's own slide
    // means the screen is fully covered; leaving earlier would navigate
    // part-covered and flash.
    panel.addEventListener("transitionend", function (e) {
      if (e.target === panel && e.propertyName === "translate") go();
    });
    // transitionend never fires in a background tab — never strand the click
    setTimeout(go, FALLBACK_MS);
    panel.classList.add("is-covering");
    return true;
  }

  // Coming back via the browser's back button restores a page from the bfcache
  // exactly as it was left: frozen behind a solid panel.
  window.addEventListener("pageshow", function () {
    leaving = false;
    if (panel) {
      panel.classList.remove("is-covering");
      panel.removeAttribute("data-theme");
    }
  });

  // --- returning to the home page -------------------------------------------
  // Delegated so it covers links rendered later by nav.js, and so every route
  // home behaves the same: the logo and "Works" in both the header and the
  // footer, plus "Browse All Case Studies".
  function isHomePage() {
    return /(^|\/)(index\.html)?$/.test(location.pathname.replace(/\/+$/, "/"));
  }

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

  document.addEventListener("click", function (e) {
    if (isHomePage()) return; // home drives its own exits from app.js
    var a = e.target.closest ? e.target.closest("a[href]") : null;
    if (!a) return;
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    if (a.target === "_blank") return;
    var raw = a.getAttribute("href") || "";
    // only plain links to the home page, never mailto/anchors/other pages
    if (!/^index\.html(\?|#|$)/.test(raw)) return;
    e.preventDefault();
    leaveTo({ href: homeHrefWithProject("index.html"), theme: "light" });
  });

  window.ZLTransition = { leaveTo: leaveTo, buildPanel: buildPanel };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", buildPanel);
  } else {
    buildPanel();
  }
})();
