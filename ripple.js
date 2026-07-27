/* ============================================================
   ZeroLab — Water-ripple hover for every project card.

   One shared WebGL (three.js) renderer whose canvas is re-parented
   into whichever card is hovered (only one card is ever hovered).
   A ping-pong FBO runs a real wave simulation: entering a card
   drops a ripple at the entry point, and moving the mouse injects
   impulses along its path so the water trails the pointer.
   A composite pass refracts the card image through the heightfield
   and adds a specular glint. GSAP drives the enter/leave fades,
   the first-hover ripple tween, mouse smoothing (quickTo) and the
   render loop (gsap.ticker).

   Fine pointers only; disabled under prefers-reduced-motion.
   ============================================================ */

import * as THREE from "./vendor/three.module.min.js";

(function () {
  "use strict";

  window.__rippleVersion = 2; // texture-follow + scroll retarget

  var gsap = window.gsap;
  var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!gsap || !fine || reduced) return;

  var SIM_RES = 160; // wave-sim grid (plenty for card-sized ripples)
  var DAMPING = 0.986;

  // ---------- Renderer (shared, created once) ----------

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: "high-performance",
    });
  } catch (e) {
    return; // no WebGL — the site simply keeps its normal hovers
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.autoClear = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  var canvas = renderer.domElement;
  canvas.className = "ripple-canvas";

  var quad = new THREE.PlaneGeometry(2, 2);
  var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // ---------- Wave simulation (ping-pong heightfield) ----------
  // R = current height, G = previous height.

  var rtOpts = {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
  };
  var rtA = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtOpts);
  var rtB = new THREE.WebGLRenderTarget(SIM_RES, SIM_RES, rtOpts);

  var simMat = new THREE.ShaderMaterial({
    uniforms: {
      uTex: { value: null },
      uTexel: { value: new THREE.Vector2(1 / SIM_RES, 1 / SIM_RES) },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uPrevMouse: { value: new THREE.Vector2(0.5, 0.5) },
      uImpulse: { value: 0 },
      uRadius: { value: 0.05 },
      uAspect: { value: 1.55 },
      uDamp: { value: DAMPING },
    },
    vertexShader:
      "varying vec2 vUv;" +
      "void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader:
      "precision highp float;" +
      "varying vec2 vUv;" +
      "uniform sampler2D uTex;" +
      "uniform vec2 uTexel, uMouse, uPrevMouse;" +
      "uniform float uImpulse, uRadius, uAspect, uDamp;" +
      "float distSeg(vec2 p, vec2 a, vec2 b){" +
      "  vec2 pa = p - a, ba = b - a;" +
      "  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);" +
      "  return length(pa - ba * h);" +
      "}" +
      "void main(){" +
      "  vec4 c = texture2D(uTex, vUv);" +
      "  float prev = c.g;" +
      "  float sum =" +
      "    texture2D(uTex, vUv + vec2(uTexel.x, 0.0)).r +" +
      "    texture2D(uTex, vUv - vec2(uTexel.x, 0.0)).r +" +
      "    texture2D(uTex, vUv + vec2(0.0, uTexel.y)).r +" +
      "    texture2D(uTex, vUv - vec2(0.0, uTexel.y)).r;" +
      "  float next = (sum * 0.5 - prev) * uDamp;" +
      // impulse along the mouse path — this is what makes the water
      // trail the pointer's direction of travel
      "  vec2 p = vec2(vUv.x * uAspect, vUv.y);" +
      "  vec2 a = vec2(uPrevMouse.x * uAspect, uPrevMouse.y);" +
      "  vec2 b = vec2(uMouse.x * uAspect, uMouse.y);" +
      "  float d = distSeg(p, a, b);" +
      "  next -= uImpulse * exp(-d * d / (uRadius * uRadius));" +
      "  next = clamp(next, -2.5, 2.5);" +
      "  gl_FragColor = vec4(next, c.r, 0.0, 1.0);" +
      "}",
    depthTest: false,
    depthWrite: false,
  });
  var simScene = new THREE.Scene();
  simScene.add(new THREE.Mesh(quad, simMat));

  // ---------- Composite (refract the card image through the water) ----------

  var viewMat = new THREE.ShaderMaterial({
    uniforms: {
      uMap: { value: null },
      uMapPrev: { value: null }, // previous texture — crossfaded out when the card's image changes mid-hover
      uMixT: { value: 1 }, // 0 = prev, 1 = current
      uSim: { value: null },
      uSimTexel: { value: new THREE.Vector2(1 / SIM_RES, 1 / SIM_RES) },
      uIntensity: { value: 0 },
      uSpec: { value: 0.85 },
      uPlane: { value: new THREE.Vector2(1, 1) }, // element size px
      uImgSize: { value: new THREE.Vector2(1, 1) }, // texture natural size px
      uCssScale: { value: 1 }, // parallax zoom on the underlying <img>
      uCssShift: { value: new THREE.Vector2(0, 0) }, // parallax translate (px, y up)
    },
    vertexShader:
      "varying vec2 vUv;" +
      "void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader:
      "precision highp float;" +
      "varying vec2 vUv;" +
      "uniform sampler2D uMap, uMapPrev, uSim;" +
      "uniform vec2 uSimTexel, uPlane, uImgSize, uCssShift;" +
      "uniform float uIntensity, uSpec, uCssScale, uMixT;" +
      "void main(){" +
      // undo the underlying <img>'s CSS transform (parallax scale+shift)
      "  vec2 px = vUv * uPlane;" +
      "  vec2 ctr = uPlane * 0.5;" +
      "  px = (px - ctr - uCssShift) / max(uCssScale, 0.0001) + ctr;" +
      "  vec2 uv = px / uPlane;" +
      // object-fit: cover
      "  float pr = uPlane.x / uPlane.y;" +
      "  float ir = uImgSize.x / uImgSize.y;" +
      "  vec2 cuv = uv - 0.5;" +
      "  if (ir > pr) { cuv.x *= pr / ir; } else { cuv.y *= ir / pr; }" +
      "  cuv += 0.5;" +
      // heightfield normal
      "  float hl = texture2D(uSim, vUv - vec2(uSimTexel.x, 0.0)).r;" +
      "  float hr = texture2D(uSim, vUv + vec2(uSimTexel.x, 0.0)).r;" +
      "  float hd = texture2D(uSim, vUv - vec2(0.0, uSimTexel.y)).r;" +
      "  float hu = texture2D(uSim, vUv + vec2(0.0, uSimTexel.y)).r;" +
      "  vec2 n = vec2(hl - hr, hd - hu);" +
      // refraction
      "  vec2 duv = clamp(cuv + n * 0.055 * uIntensity, 0.002, 0.998);" +
      // crossfade prev -> current so mid-hover image swaps stay smooth
      "  vec4 col = mix(texture2D(uMapPrev, duv), texture2D(uMap, duv), uMixT);" +
      // specular glint from the wave slope
      "  vec3 nrm = normalize(vec3(n * 2.4, 1.0));" +
      "  vec3 light = normalize(vec3(-0.35, 0.55, 0.75));" +
      "  float spec = pow(max(dot(nrm, light), 0.0), 70.0) * uSpec * uIntensity;" +
      "  col.rgb += spec;" +
      "  gl_FragColor = vec4(col.rgb, 1.0);" +
      "}",
    depthTest: false,
    depthWrite: false,
  });
  var viewScene = new THREE.Scene();
  viewScene.add(new THREE.Mesh(quad, viewMat));

  // ---------- Texture cache ----------

  var texLoader = new THREE.TextureLoader();
  var texCache = {};

  function getTexture(url, cb) {
    if (texCache[url]) {
      cb(texCache[url]);
      return;
    }
    texLoader.load(url, function (tex) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      texCache[url] = tex;
      cb(tex);
    });
  }

  // ---------- Hover lifecycle ----------

  var currentCard = null; // the hovered card element
  var hostEl = null; // where the canvas lives (clipped wrapper)
  var imgEl = null; // the <img> we mirror
  var hostW = 0;
  var hostH = 0;
  var tickerOn = false;
  var detachTween = null;
  var curTexUrl = ""; // texture currently shown
  var pendingTexUrl = ""; // texture being loaded
  var lastClient = { x: -1, y: -1 }; // last real pointer position (for retargeting)
  var tickN = 0;

  // The stage crossfades between two <img> layers; always mirror the live one.
  function resolveImg() {
    if (currentCard && currentCard.classList.contains("stage-frame")) {
      return currentCard.querySelector(".stage-img.is-visible") || imgEl;
    }
    return imgEl;
  }

  // Load (cached) and show a texture; crossfades from the previous one unless
  // instant. Keeps the water uninterrupted while the card's image changes.
  function applyTexture(url, instant) {
    if (!url || url === curTexUrl) return;
    pendingTexUrl = url;
    getTexture(url, function (tex) {
      if (pendingTexUrl !== url || !hostEl) return;
      var u = viewMat.uniforms;
      var prev = u.uMap.value;
      u.uImgSize.value.set(tex.image.width, tex.image.height);
      gsap.killTweensOf(u.uMixT);
      if (instant || !prev) {
        u.uMapPrev.value = tex;
        u.uMap.value = tex;
        u.uMixT.value = 1;
      } else {
        u.uMapPrev.value = prev;
        u.uMap.value = tex;
        u.uMixT.value = 0;
        gsap.to(u.uMixT, { value: 1, duration: 0.45, ease: "power1.inOut" });
      }
      curTexUrl = url;
    });
  }

  // GSAP-smoothed mouse (uv in element space, y up)
  var mouse = { x: 0.5, y: 0.5 };
  var mouseTo = { x: null, y: null };
  var prevSmooth = { x: 0.5, y: 0.5 };
  var moveImpulse = 0;
  var enterFx = { impulse: 0, radius: 0.05 };
  var fade = { v: 0 };

  function cardParts(card) {
    if (card.classList.contains("grid-cell")) {
      var inner = card.querySelector(".grid-cell-inner");
      return { host: inner || card, img: card.querySelector("img"), before: null };
    }
    if (card.classList.contains("stage-frame")) {
      var vis = card.querySelector(".stage-img.is-visible") || card.querySelector(".stage-img");
      return { host: card, img: vis, before: card.querySelector(".stage-hit") };
    }
    return { host: card, img: card.querySelector("img"), before: null };
  }

  function clearSim() {
    var old = renderer.getRenderTarget();
    renderer.setRenderTarget(rtA);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(rtB);
    renderer.clear(true, false, false);
    renderer.setRenderTarget(old);
  }

  function pointToUv(card, clientX, clientY) {
    var r = card.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (clientX - r.left) / Math.max(1, r.width))),
      y: Math.min(1, Math.max(0, 1 - (clientY - r.top) / Math.max(1, r.height))),
    };
  }

  function syncSize() {
    var w = hostEl.offsetWidth;
    var h = hostEl.offsetHeight;
    if (!w || !h) return false;
    if (w !== hostW || h !== hostH) {
      hostW = w;
      hostH = h;
      renderer.setSize(w, h, false);
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      viewMat.uniforms.uPlane.value.set(w, h);
      simMat.uniforms.uAspect.value = w / h;
    }
    return true;
  }

  function attach(card, e, soft) {
    if (detachTween) {
      detachTween.kill();
      detachTween = null;
    }
    var parts = cardParts(card);
    if (!parts.img) return;
    currentCard = card;
    hostEl = parts.host;
    imgEl = parts.img;
    hostW = hostH = 0;
    curTexUrl = "";

    if (parts.before) hostEl.insertBefore(canvas, parts.before);
    else hostEl.appendChild(canvas);
    if (!syncSize()) return detachNow();

    var liveImg = resolveImg();
    applyTexture(liveImg && (liveImg.currentSrc || liveImg.src), true);

    clearSim();

    // Mouse starts exactly at the entry point (no streak from the last card)
    var uv = pointToUv(card, e.clientX, e.clientY);
    mouse.x = prevSmooth.x = uv.x;
    mouse.y = prevSmooth.y = uv.y;
    mouseTo.x = gsap.quickTo(mouse, "x", { duration: 0.14, ease: "power2.out" });
    mouseTo.y = gsap.quickTo(mouse, "y", { duration: 0.14, ease: "power2.out" });
    moveImpulse = 0;

    // First-hover splash: a strong, wide ripple that tightens as it fades.
    // Retargets (card scrolled in under a resting pointer) get a gentler drop.
    gsap.killTweensOf(enterFx);
    enterFx.impulse = soft ? 0.55 : 1.1;
    enterFx.radius = soft ? 0.11 : 0.16;
    gsap.to(enterFx, { impulse: 0, duration: 0.75, ease: "power2.out" });
    gsap.to(enterFx, { radius: 0.05, duration: 0.55, ease: "power1.out" });

    // Fade the water in (canvas opacity tracks the shader intensity)
    gsap.killTweensOf(fade);
    gsap.to(fade, { v: 1, duration: 0.4, ease: "power2.out" });

    if (!tickerOn) {
      tickerOn = true;
      gsap.ticker.add(tick);
    }
  }

  function detachNow() {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    currentCard = null;
    hostEl = null;
    imgEl = null;
    curTexUrl = "";
    pendingTexUrl = "";
    if (tickerOn) {
      tickerOn = false;
      gsap.ticker.remove(tick);
    }
  }

  function detach() {
    if (!currentCard) return;
    currentCard = null; // stop tracking immediately; keep rendering the fade-out
    gsap.killTweensOf(fade);
    detachTween = gsap.to(fade, {
      v: 0,
      duration: 0.45,
      ease: "power2.inOut",
      onComplete: detachNow,
    });
  }

  // ---------- Events ----------

  document.addEventListener("pointerover", function (e) {
    lastClient.x = e.clientX;
    lastClient.y = e.clientY;
    if (!e.target || !e.target.closest) return;
    var card = e.target.closest(".film-cover, .grid-cell, .stage-frame");
    if (!card || card === currentCard) return;
    attach(card, e);
  });

  document.addEventListener("pointerout", function (e) {
    if (!currentCard || !e.target || !e.target.closest) return;
    var card = e.target.closest(".film-cover, .grid-cell, .stage-frame");
    if (card !== currentCard) return;
    if (e.relatedTarget && card.contains(e.relatedTarget)) return; // still inside
    detach();
  });

  window.addEventListener("pointermove", function (e) {
    lastClient.x = e.clientX;
    lastClient.y = e.clientY;
    if (!currentCard || !mouseTo.x) return;
    var uv = pointToUv(currentCard, e.clientX, e.clientY);
    mouseTo.x(uv.x);
    mouseTo.y(uv.y);
  });

  // Scrolling moves cards under a resting pointer without firing any boundary
  // events — so while attached, periodically re-hit-test: if the pointer is now
  // over a different card, hand the water over to it; if over none, let go.
  function retarget() {
    if (!currentCard || lastClient.x < 0) return;
    var el = document.elementFromPoint(lastClient.x, lastClient.y);
    if (el && currentCard.contains(el)) return; // still on the same card
    var card = el && el.closest ? el.closest(".film-cover, .grid-cell, .stage-frame") : null;
    if (card) attach(card, { clientX: lastClient.x, clientY: lastClient.y }, true);
    else detach();
  }

  // ---------- Render loop (gsap.ticker) ----------

  function tick() {
    if (!hostEl) return;

    // Card vanished (mode switch, rebuild) — drop the effect instantly
    if (!hostEl.isConnected || hostEl.offsetWidth === 0) {
      gsap.killTweensOf(fade);
      fade.v = 0;
      return detachNow();
    }
    syncSize();

    // Scroll may have moved another card under the pointer (no hover events
    // fire for that) — re-hit-test a few times a second.
    if (++tickN % 6 === 0) retarget();
    if (!hostEl) return; // retarget() may have detached

    // The card's image can change mid-hover (stage crossfade on scroll, grid
    // thumb -> full upgrade). Follow it; applyTexture crossfades in the shader.
    var liveImg = resolveImg();
    if (liveImg) {
      var url = liveImg.currentSrc || liveImg.src;
      if (url && url !== curTexUrl && url !== pendingTexUrl) applyTexture(url, false);
    }

    // Mirror the underlying <img>'s CSS transform (strip parallax / stage slide)
    if (liveImg) {
      var tf = getComputedStyle(liveImg).transform;
      if (tf && tf !== "none") {
        var m = tf.match(/matrix\(([^)]+)\)/);
        if (m) {
          var v = m[1].split(",");
          viewMat.uniforms.uCssScale.value = parseFloat(v[0]) || 1;
          viewMat.uniforms.uCssShift.value.set(parseFloat(v[4]) || 0, -(parseFloat(v[5]) || 0));
        }
      } else {
        viewMat.uniforms.uCssScale.value = 1;
        viewMat.uniforms.uCssShift.value.set(0, 0);
      }
    }

    // Impulse strength: entry splash + movement speed along the path
    var dx = mouse.x - prevSmooth.x;
    var dy = mouse.y - prevSmooth.y;
    var speed = Math.sqrt(dx * dx + dy * dy);
    moveImpulse = Math.max(moveImpulse * 0.8, Math.min(0.5, speed * 5.5));

    simMat.uniforms.uPrevMouse.value.set(prevSmooth.x, prevSmooth.y);
    simMat.uniforms.uMouse.value.set(mouse.x, mouse.y);
    simMat.uniforms.uImpulse.value = Math.max(enterFx.impulse, moveImpulse * fade.v);
    simMat.uniforms.uRadius.value = enterFx.radius;
    prevSmooth.x = mouse.x;
    prevSmooth.y = mouse.y;

    // Step the water: rtA -> rtB, then swap
    simMat.uniforms.uTex.value = rtA.texture;
    renderer.setRenderTarget(rtB);
    renderer.render(simScene, camera);
    var tmp = rtA;
    rtA = rtB;
    rtB = tmp;

    // Composite onto the card
    viewMat.uniforms.uSim.value = rtA.texture;
    viewMat.uniforms.uIntensity.value = fade.v;
    canvas.style.opacity = String(fade.v);
    renderer.setRenderTarget(null);
    renderer.render(viewScene, camera);
  }
})();
