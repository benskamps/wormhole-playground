/* ============================================================================
 * wormhole-ui.js  ->  window.WormholeUI   (ONE window-global per file)
 * ----------------------------------------------------------------------------
 * UI + glue + (stretch) tour + audio.
 *
 *  - Builds all DOM controls into the supplied sidebar element and owns the
 *    inspector HUD overlay.
 *  - Owns `ui.state` — the SINGLE SOURCE OF TRUTH the integrator reads every
 *    frame. Nothing else writes it except this module (sliders, pointer,
 *    traverse easing, doughnut stepping).
 *  - Runs the TRAVERSE camera flythrough (camL +8r0 -> -8r0 over 12 s, eased,
 *    honestly labeled "radially infalling observer").
 *  - Advances THE DOUGHNUT crossing: timelike geodesic step
 *    (WormholePhysics.doughnutStepTimelike) + tidal strain
 *    (doughnutTidalStrain) + survival HUD (doughnutSurvival for xi=0.1 doughnut
 *    AND xi=2 human), pushing strain to WormholeGL.setDoughnut(...).
 *  - Handles pointer input: drag = yaw/pitch, wheel = dolly camL in [-20,20],
 *    click (no drag) = inspect a pixel.
 *  - Emits a drained action queue via pollActions().
 *  - Shows the styled WebGL fallback banner.
 *  - Talks to GL/panels ONLY through the integrator loop (it never imports or
 *    calls WormholeGL.render / WormholePanels.* directly). The single GL touch
 *    it is contracted to make is WormholeGL.setDoughnut(...) while advancing
 *    the doughnut inside update() — per the public API contract.
 *
 *  Tour + WebAudio sonification live INSIDE this one namespace (stretch).
 *
 *  Depends on: window.WormholePhysics (labels/values + doughnut math),
 *              window.WormholeGL (setDoughnut only).
 *  GLSL: none in this file.
 * ========================================================================== */
'use strict';

(function () {
  // ---- guard: never clobber if loaded twice ----
  if (typeof window !== 'undefined' && window.WormholeUI) return;

  // Physics reference is read lazily at init() time so this file can load in
  // any order during dev; the contract still requires physics to exist before
  // init() is called.
  var P = (typeof window !== 'undefined' && window.WormholePhysics) || null;

  // ------------------------------------------------------------------ utils --
  function clamp(x, lo, hi) { return x < lo ? lo : (x > hi ? hi : x); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  // slow-in / slow-out (smootherstep) for the traverse flight
  function smoother(t) { t = clamp(t, 0, 1); return t * t * t * (t * (t * 6 - 15) + 10); }
  function fmt(n, d) {
    if (!isFinite(n)) return '∞';
    if (n === 0) return (0).toFixed(d == null ? 2 : d);
    var a = Math.abs(n);
    if (a >= 1e6 || a < 1e-3) return n.toExponential(2);
    return n.toFixed(d == null ? 2 : d);
  }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }

  // ------------------------------------------------------- injected styles --
  var STYLE_ID = 'wormhole-ui-style';
  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var css = '' +
      '.wh-grp{margin-bottom:18px}' +
      '.wh-grp>h3{font-size:.7rem;text-transform:uppercase;letter-spacing:1px;color:#6a6a8a;' +
        'margin:0 0 10px;padding-bottom:6px;border-bottom:1px solid #2a2a4a}' +
      '.wh-row{margin-bottom:11px}' +
      '.wh-row>label{display:flex;justify-content:space-between;font-size:.82rem;margin-bottom:4px;color:#aaaacc}' +
      '.wh-row .wh-val{color:#4facfe;font-family:monospace}' +
      '.wh-row input[type=range]{width:100%;height:6px;-webkit-appearance:none;appearance:none;' +
        'background:#2a2a4a;border-radius:3px;outline:none;margin:0}' +
      '.wh-row input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:15px;height:15px;' +
        'background:#4facfe;border-radius:50%;cursor:pointer;box-shadow:0 0 8px #4facfe66}' +
      '.wh-row input[type=range]::-moz-range-thumb{width:15px;height:15px;background:#4facfe;border:none;' +
        'border-radius:50%;cursor:pointer}' +
      '.wh-chk{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:.82rem;color:#aaaacc;cursor:pointer}' +
      '.wh-chk input{width:16px;height:16px;accent-color:#4facfe;cursor:pointer}' +
      '.wh-btn{width:100%;padding:9px;background:linear-gradient(90deg,#4facfe33,#00f2fe33);' +
        'border:1px solid #4facfe;color:#4facfe;border-radius:4px;cursor:pointer;font-size:.85rem;' +
        'margin-top:6px;transition:background .15s;font-family:inherit}' +
      '.wh-btn:hover{background:linear-gradient(90deg,#4facfe55,#00f2fe55)}' +
      '.wh-btn.wh-hot{background:linear-gradient(90deg,#ff8a4c33,#ffd24c33);border-color:#ff8a4c;color:#ffb37a}' +
      '.wh-btn.wh-hot:hover{background:linear-gradient(90deg,#ff8a4c55,#ffd24c55)}' +
      '.wh-seg{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:5px}' +
      '.wh-seg button{padding:6px 2px;background:#1a1a2e;border:1px solid #3a3a5a;color:#9a9ac0;' +
        'border-radius:4px;cursor:pointer;font-size:.72rem;font-family:inherit;transition:all .15s}' +
      '.wh-seg button:hover{border-color:#4facfe;color:#4facfe}' +
      '.wh-seg button.wh-on{background:#4facfe22;border-color:#4facfe;color:#4facfe}' +
      '.wh-note{font-size:.68rem;color:#6a6a8a;line-height:1.4;margin-top:6px}' +
      /* HUD overlay */
      '.wh-hud{position:absolute;left:14px;bottom:14px;z-index:30;font-family:monospace;font-size:.74rem;' +
        'line-height:1.5;color:#cfe6ff;background:rgba(8,8,20,.72);border:1px solid #243049;' +
        'border-radius:6px;padding:9px 12px;max-width:330px;pointer-events:none;backdrop-filter:blur(3px)}' +
      '.wh-hud .wh-hud-k{color:#6f87b5}' +
      '.wh-hud .wh-throat{color:#ffd27a}' +
      '.wh-hud .wh-dough{color:#ffb0c4}' +
      '.wh-hud .wh-lethal{color:#ff6b7d;font-weight:bold}' +
      '.wh-hud .wh-surv{color:#ffd27a}' +
      '.wh-hud .wh-ok{color:#8af0b0}' +
      '.wh-chip{display:inline-block;margin-top:6px;padding:2px 8px;border-radius:10px;font-size:.7rem;' +
        'font-weight:bold;letter-spacing:.5px}' +
      '.wh-chip.wh-pass{background:#0d3a1f;color:#7af0a8;border:1px solid #1f7a44}' +
      '.wh-chip.wh-fail{background:#3a0d10;color:#ff8a96;border:1px solid #7a1f28}' +
      /* traverse label */
      '.wh-flight{position:absolute;left:50%;bottom:96px;transform:translateX(-50%);z-index:31;' +
        'font-family:monospace;font-size:.78rem;color:#bcd3ff;background:rgba(8,8,20,.7);' +
        'border:1px solid #243049;border-radius:6px;padding:6px 14px;pointer-events:none;display:none}' +
      /* collapse banner */
      '.wh-collapse{position:absolute;left:50%;top:18px;transform:translateX(-50%);z-index:32;' +
        'font-family:monospace;font-size:.8rem;color:#ffd0d0;background:rgba(48,10,14,.86);' +
        'border:1px solid #7a2630;border-radius:6px;padding:8px 16px;max-width:480px;text-align:center;' +
        'pointer-events:none;display:none;line-height:1.45}' +
      /* inspector card */
      '.wh-inspect{font-family:monospace;font-size:.78rem;line-height:1.6;color:#d6e6ff}' +
      '.wh-inspect .wh-ins-k{color:#6f87b5}' +
      '.wh-inspect .wh-ins-uA{color:#7ec8ff}' +
      '.wh-inspect .wh-ins-uB{color:#ffb37a}' +
      '.wh-inspect .wh-ins-ring{color:#ffe08a}' +
      '.wh-inspect .wh-ins-empty{color:#6a6a8a;font-style:italic}' +
      /* fallback banner */
      '.wh-fallback{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:50;' +
        'font-family:system-ui,sans-serif;max-width:520px;text-align:center;color:#dfe8ff;' +
        'background:linear-gradient(160deg,#141426,#0d0d18);border:1px solid #2c3a5c;border-radius:12px;' +
        'padding:26px 30px;box-shadow:0 12px 40px rgba(0,0,0,.5);display:none}' +
      '.wh-fallback h2{margin:0 0 10px;font-size:1.15rem;color:#ffb37a}' +
      '.wh-fallback p{margin:0 0 8px;font-size:.86rem;line-height:1.5;color:#aab6d6}' +
      '.wh-fallback code{font-family:monospace;color:#7ec8ff}' +
      /* tour */
      '.wh-tour{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:33;' +
        'width:min(640px,86%);font-family:monospace;color:#dfe8ff;background:rgba(8,8,20,.86);' +
        'border:1px solid #2c3a5c;border-radius:8px;padding:14px 18px;display:none}' +
      '.wh-tour h4{margin:0 0 6px;font-size:.92rem;color:#7ec8ff;letter-spacing:1px}' +
      '.wh-tour p{margin:0 0 10px;font-size:.82rem;line-height:1.55;color:#c2cee6}' +
      '.wh-tour .wh-stamp{font-size:.78rem;color:#ffd27a;margin:0 0 10px}' +
      '.wh-tour .wh-tour-btns{display:flex;gap:8px;justify-content:flex-end}' +
      '.wh-tour .wh-tour-btns button{padding:6px 16px;border-radius:4px;cursor:pointer;font-family:inherit;' +
        'font-size:.78rem;background:#1a1a2e;border:1px solid #3a3a5a;color:#aaaacc}' +
      '.wh-tour .wh-tour-btns button.wh-primary{background:#4facfe22;border-color:#4facfe;color:#4facfe}' +
      '.wh-mini{display:flex;gap:8px;align-items:center}' +
      '.wh-mini .wh-btn{margin-top:0}';
    var s = el('style');
    s.id = STYLE_ID;
    s.textContent = css;
    document.head.appendChild(s);
  }

  // ============================================================ the factory ==
  function init(opts) {
    opts = opts || {};
    P = P || (window && window.WormholePhysics) || null;
    injectStyles();

    var sidebarEl = opts.sidebarEl || document.createElement('div');
    var hudEl = opts.hudEl || document.createElement('div');
    var bannerEl = opts.bannerEl || document.createElement('div');
    var heroCanvas = opts.heroCanvas || null;

    // ----------------------------------------------------- the state object --
    // SINGLE SOURCE OF TRUTH. The integrator reads this every frame.
    var state = {
      // raytracer params
      r0: 1.0,
      m: 0,
      steps: 96,
      exoticVis: 0.6,
      waveVis: 0.0,
      // stability toy
      exoticStrength: 1.0,
      collapseRate: 1.0,
      dynamicThroat: false,
      // physical scale (meters per sim unit)
      scale_m: 1,            // 1e-9 | 1 | 1e3 | 1e6
      // camera
      camL: 8.0,
      yaw: 0.0,
      pitch: 0.0,
      fov: 1.2,
      // staged wave launch params
      waveLaunch: { l0: 8.0, k: 4.0, width: 1.5 },
      // camera flythrough
      traverse: { active: false, t: 0 },
      // THE DOUGHNUT crossing state
      doughnut: {
        active: false, l: 8.0, p: 0.0, tau: 0.0,
        vFrac: 0.02, radialStrain: 1.0, lateralStrain: 1.0
      },
      // Default crossing speed is gentle (0.02c) so the glazed torus stays
      // RECOGNIZABLE — at the spec's K calibration (1m@0.01c ⇒ strain≈2) this
      // gives a visible radial-stretch/lateral-squeeze without spaghettifying
      // the mascot into an invisible sliver. Drag the speed slider up to watch
      // the honest tidal collapse: by ~0.1c the doughnut shreds and the HUD
      // says so. The physics is untouched; only the default is chosen to keep
      // the signature shareable moment watchable.
      doughnutSpeed: 0.02,   // vFrac used when a doughnut is sent
      time: 0
    };

    // ----------------------------------------------------- the action queue --
    var actions = [];
    function emit(a) { actions.push(a); }

    // ------------------------------------------------ internal bookkeeping --
    var TRAVERSE_DURATION = 12.0;   // seconds, +8r0 -> -8r0
    // COMING SOON: the doughnut crossing renders a full-screen pixelated blob near
    // the throat (the tidal-deform torus SDF blows up). Gated off in prod until the
    // sdTorus / tidal-strain shader path is fixed. Flip to false to re-enable every
    // doughnut trigger at once (panel button + header button + exposed API).
    var DOUGHNUT_COMING_SOON = true;
    var DOUGHNUT_CROSS_SECONDS = 16.0; // target wall-clock for a full doughnut crossing
                                       // (longer so the throat-passage — where the
                                       //  lensed glazed torus is most visible — lingers
                                       //  as the shareable moment)
    var prevR0 = state.r0;          // for collapse rumble (audio) dr0/dt
    var waveHasRun = false;         // tour/HUD nicety
    var lastSurvival = { dough: null, human: null };

    // ===================================================================== //
    //  HUD                                                                  //
    // ===================================================================== //
    hudEl.classList.add('wh-hud-host');
    // We render the HUD as innerHTML each frame (cheap; a few short lines).
    var hudBox = el('div', 'wh-hud');
    hudEl.appendChild(hudBox);

    // self-test chip lives in the HUD box but is set independently
    var selfTestHtml = '<span class="wh-chip wh-fail">self-test … pending</span>';

    // flight label + collapse banner overlay the hero; mount them on the
    // hero's parent so they position over the canvas. Fall back to hudEl host.
    var overlayHost = (heroCanvas && heroCanvas.parentElement) || hudEl;
    if (getComputedStyle(overlayHost).position === 'static') {
      overlayHost.style.position = 'relative';
    }
    var flightLabel = el('div', 'wh-flight',
      'radially infalling observer · eased proper velocity · metric is static, so animating l + free-look is exact');
    var collapseBanner = el('div', 'wh-collapse');
    overlayHost.appendChild(flightLabel);
    overlayHost.appendChild(collapseBanner);

    // ===================================================================== //
    //  SIDEBAR CONTROLS                                                     //
    // ===================================================================== //
    function group(title) {
      var g = el('div', 'wh-grp');
      g.appendChild(el('h3', null, title));
      sidebarEl.appendChild(g);
      return g;
    }
    // slider helper: writes state[key] (or nested via setter), live label
    function slider(parent, label, opt) {
      var row = el('div', 'wh-row');
      var lab = el('label');
      var name = el('span', null, label);
      var val = el('span', 'wh-val');
      lab.appendChild(name); lab.appendChild(val);
      var inp = el('input');
      inp.type = 'range';
      inp.min = opt.min; inp.max = opt.max; inp.step = opt.step;
      inp.value = opt.value;
      row.appendChild(lab); row.appendChild(inp);
      parent.appendChild(row);
      function paint() {
        var v = parseFloat(inp.value);
        val.textContent = (opt.fmt ? opt.fmt(v) : v.toFixed(opt.dec == null ? 1 : opt.dec));
      }
      inp.addEventListener('input', function () {
        var v = parseFloat(inp.value);
        opt.set(v);
        paint();
      });
      paint();
      return { input: inp, paint: paint, set: function (v) { inp.value = v; paint(); } };
    }
    function checkbox(parent, label, checked, onChange) {
      var lab = el('label', 'wh-chk');
      var inp = el('input'); inp.type = 'checkbox'; inp.checked = !!checked;
      lab.appendChild(inp); lab.appendChild(document.createTextNode(label));
      inp.addEventListener('change', function () { onChange(inp.checked); });
      parent.appendChild(lab);
      return inp;
    }
    function button(parent, label, hot, onClick) {
      var b = el('button', 'wh-btn' + (hot ? ' wh-hot' : ''), label);
      b.type = 'button';
      b.addEventListener('click', onClick);
      parent.appendChild(b);
      return b;
    }
    function note(parent, text) { parent.appendChild(el('div', 'wh-note', text)); }

    // -- Geometry group --
    var gGeo = group('Wormhole Geometry');
    var sR0 = slider(gGeo, 'Throat r₀', {
      min: 0.05, max: 3, step: 0.01, value: state.r0, dec: 2,
      set: function (v) { state.r0 = v; }
    });
    var sSteps = slider(gGeo, 'RK4 steps', {
      min: 32, max: 192, step: 8, value: state.steps, dec: 0,
      set: function (v) { state.steps = Math.round(v); }
    });
    note(gGeo, 'Each pixel RK4-integrates a null geodesic of ds² = −dt² + dl² + (l²+r0²)dΩ². More steps = sharper ring.');

    // -- Visualization group --
    var gVis = group('Visualization');
    slider(gVis, 'Exotic-matter glow', {
      min: 0, max: 1, step: 0.05, value: state.exoticVis, dec: 2,
      set: function (v) { state.exoticVis = v; }
    });
    slider(gVis, 'Wave shell', {
      min: 0, max: 1, step: 0.05, value: state.waveVis, dec: 2,
      set: function (v) { state.waveVis = v; }
    });
    note(gVis, 'Exotic glow visualizes the ρ&lt;0 the Einstein equations require — real exotic matter would be invisible. Wave shell shows the m-mode packet at its actual l.');

    // -- Wave / m-mode group --
    var gWave = group('Wave / m-mode filter');
    var sM = slider(gWave, 'Angular index m', {
      min: 0, max: 5, step: 1, value: state.m, dec: 0,
      set: function (v) { state.m = Math.round(v); }
    });
    slider(gWave, 'Launch l₀', {
      min: -10, max: 10, step: 0.5, value: state.waveLaunch.l0, dec: 1,
      set: function (v) { state.waveLaunch.l0 = v; }
    });
    slider(gWave, 'Wavenumber k', {
      min: 1, max: 8, step: 0.5, value: state.waveLaunch.k, dec: 1,
      set: function (v) { state.waveLaunch.k = v; }
    });
    button(gWave, 'Launch Wave Packet', false, function () {
      state.waveVis = Math.max(state.waveVis, 0.5);
      // sync the vis slider label
      syncVisSliders();
      emit({ type: 'launchWave' });
    });
    note(gWave, 'm label is the angular index ℓ. m=0 passes at high frequency; the throat curvature term gives even m=0 a small barrier — m=5 reflects.');

    // -- Doughnut group --
    var gDough = group('🍩 The Doughnut');
    var sDspeed = slider(gDough, 'Crossing speed v/c', {
      min: 0.01, max: 0.5, step: 0.01, value: state.doughnutSpeed, dec: 2,
      set: function (v) { state.doughnutSpeed = v; state.doughnut.vFrac = v; }
    });
    var bDoughPanel = button(gDough, 'Coming soon 🍩', false, function () {});
    bDoughPanel.disabled = true;
    bDoughPanel.title = 'Doughnut traversal is being polished — coming soon';
    note(gDough, 'The mascot crossing the throat on a real timelike geodesic — gravitationally lensed and tidally deformed, with a survival HUD — is being polished. <strong>Coming soon.</strong> 🍩');

    // -- Stability group --
    var gStab = group('Stability (pedagogical toy)');
    slider(gStab, 'Exotic strength', {
      min: 0, max: 2, step: 0.05, value: state.exoticStrength, dec: 2,
      set: function (v) { state.exoticStrength = v; }
    });
    slider(gStab, 'Collapse rate', {
      min: 0.1, max: 2, step: 0.1, value: state.collapseRate, dec: 1,
      set: function (v) { state.collapseRate = v; }
    });
    var chkDyn = checkbox(gStab, 'Dynamic throat', state.dynamicThroat, function (on) {
      state.dynamicThroat = on;
    });
    button(gStab, 'Cut Exotic Matter', false, function () {
      // drive the throat toward collapse: zero exotic strength + dynamic on
      state.exoticStrength = 0;
      state.dynamicThroat = true;
      chkDyn.checked = true;
      syncStabSliders();
    });
    button(gStab, 'Reset Throat', false, function () { emit({ type: 'resetThroat' }); });
    note(gStab, 'Toy in the spirit of stability.py — the true static Ellis throat is genuinely unstable (González–Guzmán–Sarbach 2009).');

    // -- Physical scale group --
    var gScale = group('Physical scale (per sim unit)');
    var scaleSeg = el('div', 'wh-seg');
    var scaleDefs = [
      { label: '1 nm', v: 1e-9 },
      { label: '1 m', v: 1 },
      { label: '1 km', v: 1e3 },
      { label: '1000 km', v: 1e6 }
    ];
    var scaleBtns = [];
    scaleDefs.forEach(function (d) {
      var b = el('button', null, d.label);
      b.type = 'button';
      if (d.v === state.scale_m) b.classList.add('wh-on');
      b.addEventListener('click', function () {
        state.scale_m = d.v;
        scaleBtns.forEach(function (x) { x.classList.remove('wh-on'); });
        b.classList.add('wh-on');
      });
      scaleSeg.appendChild(b);
      scaleBtns.push(b);
    });
    gScale.appendChild(scaleSeg);
    note(gScale, 'Sets r0 in meters for the exotic-matter ledger and tidal/survival numbers. 1 m ≈ 1.1 M_Jup &amp; ~47 orders; 1 nm ≈ 10⁴³ kg/m³ &amp; ~65 orders.');

    // -- Scene / sky group --
    var gScene = group('Scene');
    button(gScene, 'Reseed Skies', false, function () { emit({ type: 'reseed' }); });
    // audio mute toggle (stretch); created here so it lives with scene controls
    var audioBtn = button(gScene, 'Sonification: off', false, function () { toggleAudio(); });
    var tourBtn = button(gScene, 'Start Guided Tour', false, function () { tourStart(); });

    // sync helpers (so programmatic changes update slider labels)
    function syncVisSliders() {
      // find the wave-shell slider's label by re-reading inputs would be fiddly;
      // simplest: re-walk the vis group inputs and set values from state.
      var inputs = gVis.querySelectorAll('input[type=range]');
      if (inputs[1]) { inputs[1].value = state.waveVis; inputs[1].dispatchEvent(new Event('input')); }
    }
    function syncStabSliders() {
      var inputs = gStab.querySelectorAll('input[type=range]');
      if (inputs[0]) { inputs[0].value = state.exoticStrength; inputs[0].dispatchEvent(new Event('input')); }
    }
    function syncR0Slider() { sR0.set(state.r0); }

    // ===================================================================== //
    //  POINTER (drag-look, wheel-dolly, click-inspect)                      //
    // ===================================================================== //
    var pointerAttached = false;
    function attachPointer(canvas) {
      canvas = canvas || heroCanvas;
      if (!canvas || pointerAttached) return;
      pointerAttached = true;

      var dragging = false;
      var moved = false;
      var startX = 0, startY = 0, lastX = 0, lastY = 0;
      var DRAG_THRESHOLD = 5; // px before a press counts as a drag (not a click)

      canvas.addEventListener('mousedown', function (e) {
        dragging = true; moved = false;
        startX = lastX = e.clientX; startY = lastY = e.clientY;
        // resume audio context on first gesture if it exists
        resumeAudio();
      });
      window.addEventListener('mousemove', function (e) {
        if (!dragging) return;
        var dx = e.clientX - lastX, dy = e.clientY - lastY;
        lastX = e.clientX; lastY = e.clientY;
        if (Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY) > DRAG_THRESHOLD) moved = true;
        state.yaw += dx * 0.005;
        state.pitch = clamp(state.pitch - dy * 0.005, -1.45, 1.45);
      });
      window.addEventListener('mouseup', function (e) {
        if (!dragging) return;
        dragging = false;
        if (!moved) {
          // click (no drag) -> inspect that pixel (CSS coords relative to canvas)
          var rect = canvas.getBoundingClientRect();
          var px = e.clientX - rect.left;
          var py = e.clientY - rect.top;
          if (px >= 0 && py >= 0 && px <= rect.width && py <= rect.height) {
            emit({ type: 'inspect', px: px, py: py });
          }
        }
      });
      canvas.addEventListener('wheel', function (e) {
        e.preventDefault();
        // dolly along the l-axis; wheel-down (deltaY>0) pulls back toward +l
        state.camL = clamp(state.camL + Math.sign(e.deltaY) * 0.4, -20, 20);
      }, { passive: false });

      // touch: single finger = look, pinch could be dolly (kept simple: drag-look)
      var tLast = null;
      canvas.addEventListener('touchstart', function (e) {
        resumeAudio();
        if (e.touches.length === 1) { tLast = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false }; }
      }, { passive: true });
      canvas.addEventListener('touchmove', function (e) {
        if (e.touches.length === 1 && tLast) {
          var dx = e.touches[0].clientX - tLast.x, dy = e.touches[0].clientY - tLast.y;
          tLast.x = e.touches[0].clientX; tLast.y = e.touches[0].clientY; tLast.moved = true;
          state.yaw += dx * 0.005;
          state.pitch = clamp(state.pitch - dy * 0.005, -1.45, 1.45);
        }
      }, { passive: true });
      canvas.addEventListener('touchend', function () { tLast = null; });
    }

    // ===================================================================== //
    //  TRAVERSE                                                             //
    // ===================================================================== //
    function startTraverse() {
      state.traverse.active = true;
      state.traverse.t = 0;
      flightLabel.style.display = 'block';
    }
    // Expose a way for pollActions consumers / tour to fire it; per the contract
    // the action queue carries 'traverse' so the integrator routes it back here.
    // We also handle 'traverse' internally in pollActions drain (below) so the
    // header button can just emit it.

    // ===================================================================== //
    //  DOUGHNUT                                                             //
    // ===================================================================== //
    function sendDoughnut() {
      if (DOUGHNUT_COMING_SOON) return;   // gated — see DOUGHNUT_COMING_SOON above
      var v = Math.abs(state.doughnutSpeed);
      state.doughnut.active = true;
      state.doughnut.l = 8 * state.r0;
      state.doughnut.p = -v;        // infalling (moving toward -l)
      state.doughnut.tau = 0;
      state.doughnut.phiTL = 0;
      state.doughnut.vFrac = v;
      state.doughnut.radialStrain = 1;
      state.doughnut.lateralStrain = 1;
      // frame the throat: park the camera on the +l side looking inward
      state.camL = clamp(8 * state.r0, -20, 20);
      state.yaw = 0;
      state.pitch = 0;
      pushDoughnutToGL();
    }
    function pushDoughnutToGL() {
      if (window.WormholeGL && typeof window.WormholeGL.setDoughnut === 'function') {
        window.WormholeGL.setDoughnut({
          active: state.doughnut.active,
          l: state.doughnut.l,
          vFrac: state.doughnut.vFrac,
          radialStrain: state.doughnut.radialStrain,
          lateralStrain: state.doughnut.lateralStrain
        });
      }
    }

    // ===================================================================== //
    //  HUD RENDER                                                           //
    // ===================================================================== //
    function verdictClass(v) {
      return v === 'lethal' ? 'wh-lethal' : (v === 'survivable' ? 'wh-surv' : 'wh-ok');
    }
    function renderHud(info) {
      var rl = P ? P.rFromL(state.camL, state.r0) : Math.sqrt(state.camL * state.camL + state.r0 * state.r0);
      var rho = P ? P.energyDensityGeom(state.camL, state.r0)
                  : (-state.r0 * state.r0) / (8 * Math.PI * Math.pow(rl, 4));
      var lines = [];
      lines.push('<span class="wh-hud-k">l</span> = ' + fmt(state.camL, 2) +
                 '   <span class="wh-hud-k">r(l)</span> = ' + fmt(rl, 3) +
                 '   <span class="wh-hud-k">ρ</span> = ' + fmt(rho, 2));

      if (Math.abs(state.camL) < 0.2) {
        lines.push('<span class="wh-throat">r = r₀ — you are in the throat. ' +
          'ρ = −1/(8πr0²) &lt; 0: exotic matter is holding this open.</span>');
      }

      // doughnut survival readout
      if (lastSurvival.dough && lastSurvival.human) {
        var d = lastSurvival.dough, h = lastSurvival.human;
        if (d.verdict === 'lethal') {
          lines.push('<span class="wh-lethal">⚠ DOUGHNUT SPAGHETTIFIED — ' + fmt(d.accel_g, 0) + ' g</span>');
        } else {
          lines.push('<span class="wh-dough">🍩 doughnut: <span class="' + verdictClass(d.verdict) + '">' +
            d.verdict + '</span> (' + fmt(d.accel_g, 1) + ' g)</span>');
        }
        lines.push('<span class="wh-hud-k">human (2 m):</span> <span class="' + verdictClass(h.verdict) + '">' +
          h.verdict + '</span> (' + fmt(h.accel_g, 1) + ' g)');
        // Honest demonstrability hint: at small scales the tides are lethal no
        // matter the speed. Surface the throat radius a comfortable human
        // crossing actually requires — and that the "1000 km" scale reaches it.
        if (h.verdict === 'lethal' && h.minComfortR0_m && isFinite(h.minComfortR0_m)) {
          var km = h.minComfortR0_m / 1000;
          lines.push('<span class="wh-hud-k">→ comfortable human crossing needs r₀ ≳ ' +
            (km >= 1 ? fmt(km, 0) + ' km' : fmt(h.minComfortR0_m, 0) + ' m') +
            '</span> <span class="wh-dough">(try the “1000 km” scale)</span>');
        }
      }

      // wave transmission — T is the PEAK-HOLD fraction (max energy that ever
      // reached the far side), a stable headline that doesn't flicker as the
      // transmitted lobe sloshes and gets absorbed. "peak T" labels it honestly.
      if (info && info.trans && (waveHasRun || state.waveVis > 0.01)) {
        var t = info.trans;
        var T = (t.T != null ? t.T : 0), R = (t.R != null ? t.R : 0);
        lines.push('<span class="wh-hud-k">m=' + state.m + ':</span> peak T=' + (T * 100).toFixed(0) +
          '% R=' + (R * 100).toFixed(0) + '%' +
          (T >= 0.9 ? ' <span class="wh-ok">passes</span>'
                    : (T <= 0.1 ? ' <span class="wh-lethal">reflected</span>' : '')));
      }

      // resolution + steps from governor
      if (info && info.stats) {
        var st = info.stats;
        lines.push('<span class="wh-hud-k">res</span> ×' + fmt(st.resolutionScale, 2) +
          '   <span class="wh-hud-k">steps</span> ' + (st.stepsEffective != null ? st.stepsEffective : state.steps) +
          (st.frameMsAvg != null ? '   <span class="wh-hud-k">' + fmt(st.frameMsAvg, 1) + 'ms</span>' : ''));
      }

      lines.push(selfTestHtml);
      hudBox.innerHTML = lines.join('<br>');
    }

    // collapse banner toggles when r0 hits the floor
    function updateCollapseBanner() {
      var atFloor = state.r0 <= 0.0501 && (state.dynamicThroat || state.exoticStrength < 0.05);
      if (atFloor) {
        collapseBanner.innerHTML = '⚠ Throat collapsing — at r0→0 classical evolution ends. ' +
          'Topology change requires physics beyond GR (formation from flat space is impossible — see README).';
        collapseBanner.style.display = 'block';
      } else {
        collapseBanner.style.display = 'none';
      }
    }

    // ===================================================================== //
    //  UPDATE  (called every frame by the integrator)                      //
    // ===================================================================== //
    function update(dt, info) {
      dt = (typeof dt === 'number' && isFinite(dt)) ? clamp(dt, 0, 0.1) : 0.016;
      state.time += dt;

      // --- traverse easing: camL +8r0 -> -8r0 over 12 s, slow-in/out ---
      if (state.traverse.active) {
        state.traverse.t += dt / TRAVERSE_DURATION;
        if (state.traverse.t >= 1) {
          state.traverse.t = 1;
          state.traverse.active = false;
          flightLabel.style.display = 'none';
        }
        var e = smoother(state.traverse.t);
        state.camL = clamp(lerp(8 * state.r0, -8 * state.r0, e), -20, 20);
      }

      // --- doughnut crossing ---
      if (state.doughnut.active) {
        var d = state.doughnut;
        // Pace the proper-time integration so the full +8r0 -> -8r0 crossing
        // takes ~DOUGHNUT_CROSS_SECONDS of wall-clock REGARDLESS of vFrac — the
        // shareable moment must be watchable whether the doughnut creeps or
        // races. The metric is static, so choosing how fast we step proper time
        // τ is a presentation choice, not a physics fib: the geodesic, the
        // momentum p, and the tidal strain are all the honest values at each l.
        var span = 16 * state.r0;                       // proper distance to cover
        var speed = Math.max(Math.abs(d.p), 1e-3);      // |dl/dτ| (conserved for L=0)
        var dTauTotal = (span / speed) * (dt / DOUGHNUT_CROSS_SECONDS);
        // Presentation-only easing: slow the proper-time stepping when the
        // doughnut is in the high-lensing zone near the throat (|l| < ~2r0),
        // where the glazed torus is most visible, so the shareable moment
        // lingers. This rescales dτ per frame only; the geodesic, momentum p,
        // and tidal strain remain the honest values at each l (static metric).
        var nearThroat = Math.exp(-(d.l * d.l) / (2.0 * state.r0 * state.r0));
        dTauTotal *= (1.0 - 0.78 * nearThroat);         // up to ~4.5x slower at l=0
        if (P && typeof P.doughnutStepTimelike === 'function') {
          // step proper time; default L=0 clean radial crossing
          var s = { l: d.l, p: d.p, tau: d.tau, phiTL: d.phiTL || 0 };
          var sub = 3;                                  // sub-step for integration stability
          var dTau = dTauTotal / sub;
          for (var i = 0; i < sub; i++) {
            s = P.doughnutStepTimelike(s, state.r0, dTau, { E: 1, L: 0 });
          }
          d.l = s.l; d.p = s.p; d.tau = s.tau; d.phiTL = s.phiTL;
        } else {
          // physics-less fallback: integrate dl/dτ = p directly (L=0 ⇒ p const)
          d.tau += dTauTotal;
          d.l += d.p * dTauTotal;
        }

        // recompute strain factors at current l
        if (P && typeof P.doughnutTidalStrain === 'function') {
          var strain = P.doughnutTidalStrain(d.l, d.vFrac, state.r0);
          d.radialStrain = (strain && isFinite(strain.radial)) ? strain.radial : 1;
          d.lateralStrain = (strain && isFinite(strain.lateral)) ? strain.lateral : 1;
        }
        pushDoughnutToGL();

        // survival HUD: xi=0.1 doughnut, xi=2 human
        var r0_m = state.r0 * state.scale_m;
        if (P && typeof P.doughnutSurvival === 'function') {
          lastSurvival.dough = P.doughnutSurvival(r0_m, d.vFrac, 0.1);
          lastSurvival.human = P.doughnutSurvival(r0_m, d.vFrac, 2.0);
        }

        // deactivate once it has exited into Universe B
        if (d.l < -8 * state.r0) {
          d.active = false;
          pushDoughnutToGL(); // push active=false so GL stops drawing the torus
        }
      }

      // --- stability toy ---
      if (state.dynamicThroat && P && typeof P.stabilityStep === 'function') {
        if (state._stab == null) state._stab = { r0: state.r0, v: 0 };
        state._stab.r0 = state.r0;
        var ns = P.stabilityStep(state._stab, state.exoticStrength, state.collapseRate, dt);
        state._stab = ns;
        state.r0 = clamp(ns.r0, 0.05, 3);
        syncR0Slider();
      } else {
        state._stab = null;
      }

      // --- audio sonification update (stretch) ---
      audioUpdate(dt, info);
      prevR0 = state.r0;

      // --- HUD + banners ---
      renderHud(info);
      updateCollapseBanner();

      // --- tour auto-advance hook ---
      tourTick(dt);

      // expose self-test report if integrator hasn't called setSelfTest yet
      if (info && info.selfTest && !selfTestSet) setSelfTest(info.selfTest);
    }

    // ===================================================================== //
    //  ACTION QUEUE                                                         //
    // ===================================================================== //
    function pollActions() {
      // Drain, but intercept the actions this module owns internally
      // (traverse / sendDoughnut / resetThroat) AND still pass them through so
      // the integrator's switch can no-op or log them. Per the spec the
      // integrator handles traverse/sendDoughnut "internally" via the UI, so we
      // perform the side effect here and return the queue.
      var out = actions;
      actions = [];
      for (var i = 0; i < out.length; i++) {
        var a = out[i];
        if (a.type === 'traverse') startTraverse();
        else if (a.type === 'sendDoughnut') sendDoughnut();
        else if (a.type === 'resetThroat') {
          state.r0 = 1.0;
          state.exoticStrength = 1.0;
          state.dynamicThroat = false;
          if (chkDyn) chkDyn.checked = false;
          state._stab = null;
          syncR0Slider();
          syncStabSliders();
        }
        else if (a.type === 'launchWave') { waveHasRun = true; }
      }
      return out;
    }

    // ===================================================================== //
    //  INSPECTOR                                                            //
    // ===================================================================== //
    var inspectorBox = el('div', 'wh-inspect');
    inspectorBox.innerHTML = '<span class="wh-ins-empty">Click any pixel in the hero view to re-integrate that ray on the CPU.</span>';
    // mount into bannerEl? No — inspector belongs in the inspector rail. The
    // integrator wires a container; if hudEl has a child slot use it. We expose
    // the element so the host can place it; also append to sidebar bottom as a
    // safe default so it is always visible.
    var inspectorMount = el('div', 'wh-grp');
    inspectorMount.appendChild(el('h3', null, 'Ray Inspector'));
    inspectorMount.appendChild(inspectorBox);

    function setInspector(result) {
      if (!result) {
        inspectorBox.innerHTML = '<span class="wh-ins-empty">Click any pixel in the hero view to re-integrate that ray on the CPU.</span>';
        return;
      }
      var uni = result.universe || 'A';
      var uniCls = uni === 'B' ? 'wh-ins-uB' : (uni === 'ring' ? 'wh-ins-ring' : 'wh-ins-uA');
      var uniLabel = uni === 'A' ? 'Universe A (our sky)'
                   : uni === 'B' ? 'Universe B (the far sky)'
                   : 'photon ring (winding the throat)';
      var defDeg = (result.deflection != null) ? (result.deflection * 180 / Math.PI) : null;
      var html = '';
      html += '<div><span class="wh-ins-k">b (impact param)</span> = ' + fmt(result.b, 3) +
              '  · b_c = r₀ = ' + fmt(state.r0, 2) + '</div>';
      html += '<div><span class="wh-ins-k">deflection</span> = ' + (defDeg != null ? fmt(defDeg, 1) + '°' : '—') + '</div>';
      html += '<div><span class="wh-ins-k">winding</span> = ' + (result.winding != null ? result.winding : 0) + '</div>';
      html += '<div><span class="wh-ins-k">destination</span> = <span class="' + uniCls + '">' + uniLabel + '</span></div>';
      inspectorBox.innerHTML = html;
    }

    // ===================================================================== //
    //  SELF-TEST CHIP                                                       //
    // ===================================================================== //
    var selfTestSet = false;
    function setSelfTest(report) {
      selfTestSet = true;
      if (!report || !report.results) {
        selfTestHtml = '<span class="wh-chip wh-fail">self-test: no report</span>';
        return;
      }
      var total = report.results.length;
      var passed = report.results.filter(function (r) { return r.pass; }).length;
      if (report.passed && passed === total) {
        selfTestHtml = '<span class="wh-chip wh-pass">physics self-test: ' + passed + '/' + total + ' PASS</span>';
      } else {
        var failed = report.results.filter(function (r) { return !r.pass; })
          .map(function (r) { return r.name; }).join(', ');
        selfTestHtml = '<span class="wh-chip wh-fail">self-test: ' + passed + '/' + total + ' — FAIL: ' +
          (failed || '?') + '</span>';
      }
    }

    // ===================================================================== //
    //  FALLBACK BANNER                                                      //
    // ===================================================================== //
    var fallbackBox = null;
    function showFallback(reason) {
      // hide hero canvas, show panels-only experience
      if (heroCanvas) heroCanvas.style.display = 'none';
      flightLabel.style.display = 'none';
      var reasonText = ({
        'no-webgl2': 'WebGL2 is not available in this browser.',
        'shader-compile': 'The raytracer shader failed to compile on this GPU.'
      })[reason] || ('WebGL2 raytracer unavailable' + (reason ? ' (' + reason + ')' : '') + '.');

      if (!fallbackBox) {
        fallbackBox = el('div', 'wh-fallback');
        (bannerEl && bannerEl.appendChild ? bannerEl : overlayHost).appendChild(fallbackBox);
      }
      fallbackBox.innerHTML =
        '<h2>Hero raytracer offline</h2>' +
        '<p>' + reasonText + '</p>' +
        '<p>The honest-physics inspector rail is still fully live — the ' +
        '<code>cross-section</code>, <code>m-mode wave plot</code>, and the ' +
        '<code>exotic-matter ledger</code> are real solutions of the Ellis metric, ' +
        'computed on the CPU. They become the experience.</p>' +
        '<p style="color:#7ec8ff">ds² = −dt² + dl² + (l²+r0²)dΩ²</p>';
      fallbackBox.style.display = 'block';
    }

    // ===================================================================== //
    //  STRETCH: GUIDED TOUR (declarative 5-stop docent)                     //
    // ===================================================================== //
    var tour = {
      active: false, idx: -1, holdT: 0, autoHold: 0,
      box: null, titleEl: null, capEl: null, stampEl: null
    };
    var TOUR_STOPS = [
      {
        title: 'THE WINDOW',
        caption: 'A black hole eats light. A wormhole is a window. Every pixel here is an ' +
          'RK4-integrated null geodesic of ds² = −dt² + dl² + (l²+r0²)dΩ².',
        stamp: '',
        setup: function (st) { st.camL = 8 * st.r0; st.yaw = 0; st.pitch = 0; st.waveVis = 0; },
        autoHold: 0
      },
      {
        title: 'TRAVERSE',
        caption: 'We fly the camera through the throat as a radially infalling observer. ' +
          'Universe B inflates; our sky collapses to a ring behind us.',
        stamp: '✅ Geodesic traversal: works.',
        setup: function () { startTraverse(); },
        autoHold: TRAVERSE_DURATION + 0.5
      },
      {
        title: 'THE FILTER',
        caption: 'Launch m=0 (sails through) then m=5 (piles up at the throat and reflects). ' +
          'Pure geometry — the angular-momentum barrier of the corrected potential.',
        stamp: '✅ Angular-momentum filtering: robust. Pure geometry.',
        setup: function (st) {
          st.waveVis = 0.55; st.m = 0; sM.set(0); syncVisSliders();
          emit({ type: 'launchWave' });
          // schedule an m=5 follow-up via the tour hold
          tour._scheduleM5 = true;
        },
        autoHold: 6
      },
      {
        title: 'THE COLLAPSE',
        caption: 'Cut the exotic matter and turn on the dynamic throat: r0 shrinks and the ' +
          'Einstein ring visibly pinches shut. (Pedagogical toy — the static throat is truly unstable.)',
        stamp: '⚠️ Stability: conditional. Remove the exotic matter → collapse.',
        setup: function (st) {
          // Done with the wave demo — lower the shell so it doesn't flood the
          // collapse scene. (The FILTER stop raised it to 0.55.)
          st.waveVis = 0; syncVisSliders();
          st.exoticStrength = 0; st.dynamicThroat = true; chkDyn.checked = true;
          syncStabSliders();
        },
        autoHold: 6
      },
      {
        title: 'THE WALL',
        caption: 'The ledger computes the exotic-matter requirement live: ≈1.1 Jupiter masses of ' +
          'negative energy per meter of throat. Shrinking r0 makes it WORSE (ρ ∝ 1/r0²) — no slider closes the gap.',
        stamp: '❌ Exotic-matter budget: tens of orders short. ❌ Formation from flat space: impossible classically.',
        setup: function (st) { st.waveVis = 0; syncVisSliders(); emit({ type: 'resetThroat' }); st.scale_m = 1; },
        autoHold: 0
      }
    ];

    function ensureTourBox() {
      if (tour.box) return;
      tour.box = el('div', 'wh-tour');
      tour.titleEl = el('h4');
      tour.capEl = el('p');
      tour.stampEl = el('div', 'wh-stamp');
      var btns = el('div', 'wh-tour-btns');
      var skip = el('button', null, 'Skip');
      var cont = el('button', 'wh-primary', 'Continue');
      skip.type = 'button'; cont.type = 'button';
      skip.addEventListener('click', tourEnd);
      cont.addEventListener('click', tourNext);
      btns.appendChild(skip); btns.appendChild(cont);
      tour.box.appendChild(tour.titleEl);
      tour.box.appendChild(tour.capEl);
      tour.box.appendChild(tour.stampEl);
      tour.box.appendChild(btns);
      overlayHost.appendChild(tour.box);
    }
    function tourStart() {
      ensureTourBox();
      tour.active = true; tour.idx = -1;
      tour.box.style.display = 'block';
      tourNext();
    }
    function tourNext() {
      tour.idx++;
      if (tour.idx >= TOUR_STOPS.length) { tourEnd(); return; }
      var stop = TOUR_STOPS[tour.idx];
      tour.titleEl.textContent = stop.title;
      tour.capEl.textContent = stop.caption;
      tour.stampEl.textContent = stop.stamp || '';
      tour.holdT = 0;
      tour.autoHold = stop.autoHold || 0;
      tour._scheduleM5 = false;
      try { if (stop.setup) stop.setup(state); } catch (e) { /* keep tour alive */ }
      // reflect any state changes the setup made into sliders
      syncR0Slider();
    }
    function tourEnd() {
      tour.active = false;
      if (tour.box) tour.box.style.display = 'none';
      // Restore visualization sliders to a sane resting state so a raised wave
      // shell (from the FILTER stop) doesn't persist as a green flood after the
      // tour — including when the user Skips mid-tour.
      state.waveVis = 0;
      syncVisSliders();
    }
    function tourTick(dt) {
      if (!tour.active) return;
      tour.holdT += dt;
      // mid-FILTER: fire the m=5 follow-up halfway through the hold
      if (tour._scheduleM5 && tour.holdT > 3) {
        tour._scheduleM5 = false;
        state.m = 5; sM.set(5);
        emit({ type: 'launchWave' });
      }
      if (tour.autoHold > 0 && tour.holdT >= tour.autoHold) {
        tourNext();
      }
    }

    // ===================================================================== //
    //  STRETCH: WEBAUDIO SONIFICATION                                       //
    // ===================================================================== //
    // Two "microphones" at l=±8 sample solver.amplitude (read off info if the
    // integrator forwards it; otherwise we approximate from doughnut/collapse).
    // We keep this self-contained: a 220 Hz triangle whose gain rises as energy
    // reaches the far side, plus a low rumble whose gain ∝ |dr0/dt|.
    var audio = { ctx: null, on: false, osc: null, gain: null, rumbleOsc: null, rumbleGain: null };
    function ensureAudioGraph() {
      if (audio.ctx) return true;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try {
        audio.ctx = new AC();
        audio.osc = audio.ctx.createOscillator();
        audio.osc.type = 'triangle';
        audio.osc.frequency.value = 220;
        audio.gain = audio.ctx.createGain();
        audio.gain.gain.value = 0;
        audio.osc.connect(audio.gain).connect(audio.ctx.destination);
        audio.osc.start();

        audio.rumbleOsc = audio.ctx.createOscillator();
        audio.rumbleOsc.type = 'sine';
        audio.rumbleOsc.frequency.value = 42;
        audio.rumbleGain = audio.ctx.createGain();
        audio.rumbleGain.gain.value = 0;
        audio.rumbleOsc.connect(audio.rumbleGain).connect(audio.ctx.destination);
        audio.rumbleOsc.start();
        return true;
      } catch (e) {
        audio.ctx = null;
        return false;
      }
    }
    function toggleAudio() {
      if (!audio.on) {
        if (!ensureAudioGraph()) { audioBtn.textContent = 'Sonification: unavailable'; return; }
        resumeAudio();
        audio.on = true;
        audioBtn.textContent = 'Sonification: on';
      } else {
        audio.on = false;
        if (audio.gain) audio.gain.gain.value = 0;
        if (audio.rumbleGain) audio.rumbleGain.gain.value = 0;
        audioBtn.textContent = 'Sonification: off';
      }
    }
    function resumeAudio() {
      if (audio.ctx && audio.ctx.state === 'suspended') {
        try { audio.ctx.resume(); } catch (e) { /* ignore */ }
      }
    }
    function audioUpdate(dt, info) {
      if (!audio.on || !audio.ctx) return;
      // far-side transmission gain — use the LIVE instantaneous fraction
      // (instT) so the tone tracks energy actually arriving on the far side as
      // the packet crosses; the headline T is a static peak-hold and would make
      // the sonification a flat drone.
      var far = 0;
      if (info && info.trans) {
        var liveT = (info.trans.instT != null) ? info.trans.instT : info.trans.T;
        if (liveT != null) far = clamp(liveT, 0, 1);
      }
      if (audio.gain) {
        var target = far * 0.18 * (state.waveVis > 0.01 || waveHasRun ? 1 : 0);
        // glide
        audio.gain.gain.value += (target - audio.gain.gain.value) * Math.min(1, dt * 6);
      }
      // collapse rumble ∝ |dr0/dt|
      if (audio.rumbleGain) {
        var rate = Math.abs(state.r0 - prevR0) / Math.max(dt, 1e-3);
        var rtarget = clamp(rate * 0.9, 0, 0.4);
        audio.rumbleGain.gain.value += (rtarget - audio.rumbleGain.gain.value) * Math.min(1, dt * 8);
      }
    }

    // ===================================================================== //
    //  HEADER ACTION BUTTONS (Send Doughnut / Traverse / Tour)             //
    // ===================================================================== //
    // The spec's layout puts Send Doughnut / Traverse in the header. We create a
    // compact action strip and place it at the TOP of the sidebar so it is always
    // reachable even if the integrator's header has no slot. (Sidebar-owned per
    // the contract: "builds all controls into sidebarEl".)
    var headerStrip = el('div', 'wh-grp wh-mini');
    var bSend = el('button', 'wh-btn', 'Doughnut · soon'); bSend.type = 'button';
    bSend.disabled = true; bSend.title = 'Coming soon';
    var bTrav = el('button', 'wh-btn wh-hot', 'Traverse'); bTrav.type = 'button';
    bSend.addEventListener('click', function () { if (!DOUGHNUT_COMING_SOON) emit({ type: 'sendDoughnut' }); });
    bTrav.addEventListener('click', function () { emit({ type: 'traverse' }); });
    headerStrip.appendChild(bSend);
    headerStrip.appendChild(bTrav);
    sidebarEl.insertBefore(headerStrip, sidebarEl.firstChild);

    // mount the inspector rail at the bottom of the sidebar as a safe default
    sidebarEl.appendChild(inspectorMount);

    // ---------------------------------------------------- the public object --
    var ui = {
      state: state,
      update: update,
      pollActions: pollActions,
      attachPointer: attachPointer,
      setInspector: setInspector,
      showFallback: showFallback,
      setSelfTest: setSelfTest,
      // extra surfaced handles (not in the strict contract but harmless + useful
      // for the integrator if it wants to mount the inspector card elsewhere)
      _inspectorEl: inspectorBox,
      _startTraverse: startTraverse,
      _sendDoughnut: sendDoughnut,
      _tourStart: tourStart
    };

    // auto-attach pointer to the hero canvas if one was provided
    if (heroCanvas) attachPointer(heroCanvas);

    return ui;
  }

  // ------------------------------------------------------------ the global --
  window.WormholeUI = { VERSION: '1.0.0', init: init };
})();
