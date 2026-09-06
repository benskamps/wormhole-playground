/* ============================================================================
 * wormhole-integrator.js  — the fifth classic script.
 * Extracted from the inline block in playground.html so the page can ship
 * under a real (enforced) Content-Security-Policy with script-src 'self'.
 * Honors the page's stated constraints: classic script, no build, no modules,
 * loads last in dependency order, still works from file://.
 * ==========================================================================*/
/* ============================================================================
 * INTEGRATOR  — wires the four globals into one running product.
 * Pure glue: it owns no physics. It reads ui.state every frame (single source
 * of truth), drives the wave solver on launch actions, bridges click-a-pixel
 * inspection (WormholeGL.pixelToRay → WormholePhysics.traceRay), and renders.
 *
 * Lifecycle hardening (host responsibilities, not physics):
 *   - the rAF loop keeps its handle, pauses on visibilitychange/pagehide and
 *     resumes with a fresh dt clock (no catch-up step after a long background)
 *   - resize is debounced (GL.resize reallocates the drawing buffer)
 *   - webglcontextlost / webglcontextrestored on the hero canvas stop the loop,
 *     show the fallback banner, then re-init GL and resume
 *   - a missing #hero canvas produces the boot-error card, not a throw
 * ==========================================================================*/
(function () {
  'use strict';

  function bootError(msg) {
    var box = document.getElementById('boot-error');
    var det = document.getElementById('boot-error-detail');
    if (det) det.textContent = msg || '';
    if (box) box.style.display = 'flex';
    console.error('[integrator] boot error: ' + msg);
  }

  function boot() {
    // ---- verify all four globals are present ----
    var missing = [];
    if (!window.WormholePhysics) missing.push('WormholePhysics');
    if (!window.WormholeGL)      missing.push('WormholeGL');
    if (!window.WormholePanels)  missing.push('WormholePanels');
    if (!window.WormholeUI)      missing.push('WormholeUI');
    if (missing.length) {
      bootError('Missing module global(s): ' + missing.join(', ') +
        '. Check that js/ is next to playground.html and the <script> tags resolved.');
      return;
    }

    var Physics = window.WormholePhysics;
    var GL = window.WormholeGL;
    var Panels = window.WormholePanels;
    var UI = window.WormholeUI;

    // ---- DOM handles ----
    var heroCanvas = document.getElementById('hero');
    var sidebarEl  = document.getElementById('sidebar');
    var hudEl      = document.getElementById('hud');
    var bannerEl   = document.getElementById('banner');
    var csCanvas   = document.getElementById('cs-canvas');
    var waveCanvas = document.getElementById('wave-canvas');
    var ledgerCanvas = document.getElementById('ledger-canvas');

    // The hero canvas is the one DOM node every subsystem sizes against. If
    // the markup lost it, say so in the boot card instead of throwing later
    // inside doResize().
    if (!heroCanvas || !heroCanvas.parentElement) {
      bootError('The hero <canvas id="hero"> is missing from the page (or has no parent element), ' +
        'so the raytracer has nothing to size against.');
      return;
    }

    // ========================================================================
    // 1. STARTUP SELF-TEST  (log each assertion; surface PASS/FAIL chip)
    // ========================================================================
    var selfTestReport;
    try {
      selfTestReport = Physics.selfTest();
    } catch (e) {
      selfTestReport = { passed: false, results: [{ name: 'selfTest threw', expected: 'no throw', actual: String(e), pass: false }] };
    }
    console.log('%c━━━ Wormhole physics self-test ━━━', 'color:#4facfe;font-weight:bold');
    (selfTestReport.results || []).forEach(function (r) {
      var tag = r.pass ? '%cPASS' : '%cFAIL';
      var style = r.pass ? 'color:#7af0a8' : 'color:#ff8a96;font-weight:bold';
      console.log(tag + '%c  ' + r.name + '  →  expected ' + r.expected + ', got ' + r.actual,
        style, 'color:inherit');
    });
    console.log('%c━━━ self-test ' + (selfTestReport.passed ? 'PASSED' : 'FAILED') + ' (' +
      (selfTestReport.results || []).filter(function (r) { return r.pass; }).length + '/' +
      (selfTestReport.results || []).length + ') ━━━',
      selfTestReport.passed ? 'color:#7af0a8;font-weight:bold' : 'color:#ff8a96;font-weight:bold');

    // ========================================================================
    // 2. WAVE SOLVER  (single source — GL shell + panel plot both read it)
    // ========================================================================
    var solver = Physics.makeWaveSolver({ n: 400, lMin: -12, lMax: 12 });
    var waveRunning = false;   // true once a packet is launched
    var WAVE_DT = 0.02;

    // ========================================================================
    // 3. WEBGL RAYTRACER
    // ========================================================================
    var glStatus = GL.init(heroCanvas);
    var glOk = !!(glStatus && glStatus.ok);
    var contextLost = false;   // true between webglcontextlost and ...restored

    // ========================================================================
    // 4. CANVAS-2D PANELS  (inspector rail; also the fallback experience)
    // ========================================================================
    var panels = Panels.create({
      crossSectionCanvas: csCanvas,
      waveCanvas: waveCanvas,
      ledgerCanvas: ledgerCanvas
    });

    // ========================================================================
    // 5. UI  (controls + HUD + pointer + traverse + doughnut + tour + audio)
    // ========================================================================
    var ui = UI.init({
      sidebarEl: sidebarEl,
      hudEl: hudEl,
      bannerEl: bannerEl,
      heroCanvas: heroCanvas
    });
    ui.setSelfTest(selfTestReport);

    if (!glOk) {
      // styled banner + panels-only experience
      ui.showFallback(glStatus ? glStatus.reason : 'no-webgl2');
      console.warn('[integrator] WebGL2 raytracer offline (' +
        (glStatus ? glStatus.reason : 'unknown') + ') — running Canvas-2D panel fallback.');
    }

    // wire the header action buttons → the UI's own handlers
    wireHeaderButton('hdr-dough', ui._sendDoughnut);
    wireHeaderButton('hdr-traverse', ui._startTraverse);
    wireHeaderButton('hdr-tour', ui._tourStart);

    // The doughnut header button ships disabled; enable + relabel it once the
    // UI reports the throat-crossing is no longer gated.
    (function () {
      var b = document.getElementById('hdr-dough');
      if (b && ui._doughnutGated === false) {
        b.disabled = false;
        b.textContent = 'Send Doughnut';
        b.title = 'Send the mascot through the throat';
      }
    })();

    function wireHeaderButton(id, fn) {
      var b = document.getElementById(id);
      if (b && typeof fn === 'function') b.addEventListener('click', fn);
    }

    // mobile drawer toggles (keep aria-expanded in step with the .open class)
    (function () {
      function wireDrawer(toggleId, drawerId) {
        var drawer = document.getElementById(drawerId);
        var toggle = document.getElementById(toggleId);
        if (!drawer || !toggle) return;
        toggle.addEventListener('click', function () {
          var open = drawer.classList.toggle('open');
          toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        });
      }
      wireDrawer('sidebar-toggle', 'sidebar');
      wireDrawer('rail-toggle', 'rail');
    })();

    // ========================================================================
    // 6. RESIZE  (hero GL + the three panel canvases) — debounced, because
    //    GL.resize reallocates the drawing buffer on every call.
    // ========================================================================
    function doResize() {
      var host = heroCanvas.parentElement;
      if (!host) return;
      var rect = host.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      if (glOk) GL.resize(Math.max(1, rect.width), Math.max(1, rect.height), dpr);
      panels.resize();
    }
    var RESIZE_DEBOUNCE_MS = 150;
    var resizeTimer = 0;
    window.addEventListener('resize', function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resizeTimer = 0;
        doResize();
      }, RESIZE_DEBOUNCE_MS);
    });
    doResize();

    // ========================================================================
    // 7. STATE TRACKING for solver setM + inspector overlay
    // ========================================================================
    var lastM = ui.state.m;
    solver.setM(lastM);

    var overlay = null;   // last inspector traceRay result, drawn on the cross-section

    // ========================================================================
    // 8. ACTION ROUTER  — drain ui.pollActions() each frame and do the
    //    integrator-owned side effects (launchWave / reseed / inspect).
    //    traverse / sendDoughnut / resetThroat are applied inside the UI;
    //    we no-op them here (they still arrive in the queue per the contract).
    // ========================================================================
    function handleActions() {
      var queue = ui.pollActions();
      for (var i = 0; i < queue.length; i++) {
        var a = queue[i];
        switch (a.type) {
          case 'launchWave':
            solver.setM(ui.state.m);
            lastM = ui.state.m;
            solver.launch({
              l0: ui.state.waveLaunch.l0,
              k: ui.state.waveLaunch.k,
              width: ui.state.waveLaunch.width,
              m: ui.state.m
            });
            waveRunning = true;
            break;
          case 'reseed':
            if (!glOk) break;                       // Canvas-2D fallback has no sky to reseed
            GL.reseedSky(Math.random() * 1000, Math.random() * 1000 + 500);
            break;
          case 'inspect': {
            if (!glOk) break;                       // no raytraced pixel to re-integrate in fallback
            // click-a-pixel → re-integrate that exact ray on the CPU.
            // WormholeGL.pixelToRay produces ICs for the SAME camera basis the
            // shader used; WormholePhysics.traceRay reproduces the pixel.
            var ray = GL.pixelToRay(a.px, a.py, ui.state);
            var result = Physics.traceRay(ui.state.camL, ray.theta, ui.state.r0, {
              steps: 2000, recordPath: true
            });
            ui.setInspector(result);
            overlay = result;
            break;
          }
          // traverse / sendDoughnut / resetThroat: UI already applied them.
          default: break;
        }
      }
    }

    // ========================================================================
    // 9. MAIN rAF LOOP  (owns its handle; pausable; dt clock resets on resume)
    // ========================================================================
    var tPrev = performance.now();
    var rafId = 0;           // 0 while the loop is stopped
    var frameCount = 0;      // monotonic; read-only probe below

    function frame(tNow) {
      rafId = 0;
      var dt = (tNow - tPrev) / 1000;
      if (!isFinite(dt) || dt < 0) dt = 0.016;
      if (dt > 0.1) dt = 0.1;          // clamp long gaps (throttled tab, debugger pause)
      tPrev = tNow;
      frameCount++;

      // --- drain UI actions (launchWave / reseed / inspect; rest already applied) ---
      handleActions();

      // --- keep the solver's m in sync with the slider even without a relaunch ---
      if (ui.state.m !== lastM) {
        solver.setM(ui.state.m);
        lastM = ui.state.m;
      }

      // --- advance the wave field while a packet is live ---
      if (waveRunning) {
        solver.step(WAVE_DT, ui.state.r0, 5);
        if (glOk) GL.setWaveField(solver.amplitude, -12, 12);
      }
      var trans = solver.getTransmission();

      // --- SI budget for the current throat at the selected physical scale ---
      var budget = Physics.budget(ui.state.r0 * ui.state.scale_m);

      // --- advance UI (traverse easing, doughnut crossing, stability toy, HUD) ---
      ui.update(dt, {
        stats: glOk ? GL.getStats() : null,
        trans: trans,
        budget: budget,
        selfTest: selfTestReport
      });

      // --- render the hero ---
      if (glOk) GL.render(ui.state);

      // --- render the inspector rail panels ---
      panels.renderCrossSection(ui.state, overlay);
      panels.renderWave(
        solver.amplitude, solver.lGrid,
        solver.potential(ui.state.r0, ui.state.m),
        ui.state.r0, ui.state.m, trans
      );
      panels.renderLedger(budget, ui.state.r0 * ui.state.scale_m);

      rafId = requestAnimationFrame(frame);
    }

    function loopRunning() { return rafId !== 0; }

    function stopLoop() {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = 0;
    }

    function startLoop() {
      if (rafId || contextLost) return;          // already running / GL is mid-recovery
      if (document.visibilityState === 'hidden') return;
      tPrev = performance.now();                  // fresh dt clock: no catch-up step
      rafId = requestAnimationFrame(frame);
    }

    // Pause while hidden / unloading; resume when visible again. The dt clock
    // is reset in startLoop so the first frame back is an ordinary ~16 ms step.
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') stopLoop();
      else startLoop();
    });
    window.addEventListener('pagehide', stopLoop);
    window.addEventListener('pageshow', function () { startLoop(); });

    // ========================================================================
    // 10. WEBGL CONTEXT LOSS / RESTORE on the hero canvas
    // ========================================================================
    heroCanvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();                          // tell the browser we intend to restore
      contextLost = true;
      glOk = false;
      stopLoop();
      ui.showFallback('context-lost');
      console.warn('[integrator] WebGL context lost — waiting for restore.');
    });
    heroCanvas.addEventListener('webglcontextrestored', function () {
      contextLost = false;
      glStatus = GL.init(heroCanvas);
      glOk = !!(glStatus && glStatus.ok);
      if (glOk) {
        if (typeof ui.hideFallback === 'function') ui.hideFallback();
        doResize();
        if (waveRunning) GL.setWaveField(solver.amplitude, -12, 12);
        console.log('[integrator] WebGL context restored — raytracer back online.');
      } else {
        ui.showFallback(glStatus ? glStatus.reason : 'no-webgl2');
        console.warn('[integrator] WebGL context restored but re-init failed (' +
          (glStatus ? glStatus.reason : 'unknown') + ') — staying on the Canvas-2D fallback.');
      }
      startLoop();
    });

    startLoop();

    // Read-only loop probe: enough for a test to confirm the loop paused and
    // resumed, without exposing state or solver handles. Debug access proper
    // is opt-in via ?debug below.
    if (!('__wormholeLoop' in window)) {
      Object.defineProperty(window, '__wormholeLoop', {
        value: Object.freeze({
          get frames() { return frameCount; },
          get running() { return loopRunning(); }
        }),
        writable: false, configurable: false, enumerable: false
      });
    }

    // Debug handle — development only. Enable with ?debug in the URL.
    if (/(^|[?&])debug(=|&|$)/.test(location.search)) {
      window.__wormhole = {
        get state() { return ui.state; },
        solver: solver, selfTest: selfTestReport,
        stop: stopLoop, start: startLoop,
        relaunch: function () {
          solver.launch({ l0: ui.state.waveLaunch.l0, k: ui.state.waveLaunch.k, m: ui.state.m });
          waveRunning = true;
        }
      };
    }

    console.log('%c[integrator] Wormhole Playground booted. WebGL2: ' +
      (glOk ? 'ON' : 'FALLBACK') + '. Click a pixel to trace a ray; Traverse to fly through the throat.',
      'color:#4facfe');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
