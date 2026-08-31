// ============================================================================
//  NAVIGATION BAR — shared component
//
//  Renders the brand + clock + links bar into any element carrying
//  [data-zl-nav], and drives every clock on the page from a single ticker.
//
//  USAGE (markup)
//    <header class="topbar" data-zl-nav data-nav-active="works"></header>
//    <header class="case-top" data-zl-nav data-nav-active="works"
//            data-nav-invert></header>
//    <footer class="contact-foot" data-zl-nav data-nav-layout="footer"
//            data-nav-active="works" data-nav-invert></footer>
//
//  ATTRIBUTES
//    data-nav-active  "works" | "about"  which link reads as current
//    data-nav-layout  "bar" (default) | "footer"
//    data-nav-invert  present -> inverted for dark backdrops
//
//  WHY A RENDER FUNCTION AND NOT A CUSTOM ELEMENT
//  There is no build step here and the rest of the codebase is ES5-flavoured
//  vanilla, so this matches it. It also renders into the EXISTING host element
//  rather than replacing it, which matters: index.html's .topbar is the hook
//  for the intro reveal (body.is-intro .topbar) and its pointer-events rules,
//  so the host has to survive.
//
//  THE CLOCK
//  Previously written twice — app.js formatted Asia/Jakarta via Intl, while
//  project.html's inline script used the viewer's own clock and computed the
//  offset. Outside UTC+7 the two pages disagreed about the time. One ticker
//  now, pinned to Jakarta, which is what the [UTC+7] label claims.
// ============================================================================
(function () {
  var LINKS = [
    { key: "works", label: "Works", href: "index.html" },
    { key: "about", label: "About us", href: "about.html" },
  ];
  var EMAIL = "zerolab@gmail.com";
  var LOGO = "asset/zerolab logo.svg";
  var TICK_MS = 15000;
  var seq = 0; // makes each bar's panel id unique

  // --- clock ---------------------------------------------------------------
  var clockFmt = null;
  function clockParts() {
    if (!clockFmt) {
      clockFmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Jakarta", // the [UTC+7] label is a promise; keep it true
        weekday: "short",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
    }
    var p = {};
    clockFmt.formatToParts(new Date()).forEach(function (part) {
      p[part.type] = part.value;
    });
    return p;
  }

  function paintClocks() {
    var p = clockParts();
    var head = p.weekday + " " + p.day + " " + p.month + " " + p.hour;
    var tail = p.minute + " [UTC+7]";
    var els = document.querySelectorAll(".zl-nav-clock");
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      // Rebuild only when the text actually changed, so the blinking separator
      // is not restarted every tick.
      if (el.getAttribute("data-t") === head + tail) continue;
      el.setAttribute("data-t", head + tail);
      el.textContent = "";
      el.appendChild(document.createTextNode(head));
      var sep = document.createElement("span");
      sep.className = "zl-nav-sep";
      sep.textContent = ".";
      el.appendChild(sep);
      el.appendChild(document.createTextNode(tail));
    }
  }

  // --- render --------------------------------------------------------------
  function render(host) {
    if (!host || host.getAttribute("data-zl-nav-ready") === "1") return;

    var active = host.getAttribute("data-nav-active") || "";
    var layout = host.getAttribute("data-nav-layout") || "bar";
    var invert = host.hasAttribute("data-nav-invert");

    var root = document.createElement("div");
    root.className = "zl-nav";
    root.setAttribute("data-layout", layout);
    if (invert) root.setAttribute("data-invert", "true");

    // brand
    var brand = document.createElement("div");
    brand.className = "zl-nav-brand";
    var logo = document.createElement("a");
    logo.className = "zl-nav-logo";
    logo.href = "index.html";
    logo.setAttribute("aria-label", "ZeroLab — home");
    var img = document.createElement("img");
    img.src = LOGO;
    img.alt = "ZeroLab";
    img.draggable = false;
    logo.appendChild(img);
    brand.appendChild(logo);

    var clock = document.createElement("div");
    clock.className = "zl-nav-clock";
    brand.appendChild(clock);
    root.appendChild(brand);

    // toggle — header only. A menu button at the foot of the page would hide
    // links the reader has already scrolled to.
    var toggle = null;
    if (layout === "bar") {
      toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "zl-nav-toggle";
      toggle.setAttribute("aria-label", "Menu");
      toggle.setAttribute("aria-expanded", "false");
      var tlabel = document.createElement("span");
      tlabel.className = "zl-nav-toggle-label";
      tlabel.textContent = "Menu";
      toggle.appendChild(tlabel);
      // two bars in an icon box — a plus that rotates into a close × on open
      var ticon = document.createElement("span");
      ticon.className = "zl-nav-toggle-icon";
      for (var b = 0; b < 2; b++) ticon.appendChild(document.createElement("span"));
      toggle.appendChild(ticon);
      root.appendChild(toggle);
    }

    // links
    var nav = document.createElement("nav");
    nav.className = "zl-nav-links";
    nav.setAttribute("aria-label", "Primary");
    // Unique: the case study page renders two of these bars.
    var panelId = "zl-nav-links-" + ++seq;
    nav.id = panelId;
    if (toggle) toggle.setAttribute("aria-controls", panelId);
    // Works / About us / Contact all sit in one group so they share a single
    // even gap; Contact is still a mailto, it just reads as a nav item now.
    var group = document.createElement("div");
    group.className = "zl-nav-links-group";
    LINKS.forEach(function (l) {
      var a = document.createElement("a");
      a.href = l.href;
      a.textContent = l.label;
      if (l.key === active) {
        a.className = "is-active";
        a.setAttribute("aria-current", "page");
      }
      group.appendChild(a);
    });

    var mail = document.createElement("a");
    mail.className = "zl-nav-email";
    mail.href = "mailto:" + EMAIL;
    mail.textContent = "Contact";
    group.appendChild(mail);

    nav.appendChild(group);
    root.appendChild(nav);

    host.textContent = "";
    host.appendChild(root);
    host.setAttribute("data-zl-nav-ready", "1");

    if (toggle) wireToggle(root, toggle, nav);
  }

  // --- menu toggle ---------------------------------------------------------
  function wireToggle(root, toggle, panel) {
    function setOpen(open) {
      if (open) root.setAttribute("data-open", "true");
      else root.removeAttribute("data-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    }

    toggle.addEventListener("click", function () {
      setOpen(root.getAttribute("data-open") !== "true");
    });

    // Following a link navigates anyway, but same-page hrefs would otherwise
    // leave the panel hanging open behind the new view.
    panel.addEventListener("click", function (e) {
      if (e.target.closest("a")) setOpen(false);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key !== "Escape" || root.getAttribute("data-open") !== "true") return;
      setOpen(false);
      toggle.focus(); // don't strand focus inside a panel that just closed
    });

    // Widening past the breakpoint reveals the links anyway; leaving data-open
    // set would then show the panel again on the next narrow resize.
    var wide = window.matchMedia("(min-width: 768px)");
    var onChange = function (e) { if (e.matches) setOpen(false); };
    if (wide.addEventListener) wide.addEventListener("change", onChange);
    else if (wide.addListener) wide.addListener(onChange); // older Safari
  }

  function mount() {
    var hosts = document.querySelectorAll("[data-zl-nav]");
    for (var i = 0; i < hosts.length; i++) render(hosts[i]);
    paintClocks();
  }

  window.ZLNav = { mount: mount, render: render, paintClocks: paintClocks };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
  setInterval(paintClocks, TICK_MS);
})();
