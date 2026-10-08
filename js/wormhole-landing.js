/* ============================================================================
 * wormhole-landing.js — landing-page glue for index.html.
 * - The hero shows a rendered loop of the raytracer (or its still) until the
 *   reader opts in; only then is the playground iframe (a second WebGL2
 *   context) created.
 * - The loop plays only while on screen, only when the tab is visible, and
 *   never under prefers-reduced-motion or Save-Data.
 * - Content below the fold fades up as it arrives. Nothing is hidden without
 *   js, and anything already on screen or scrolled past is never hidden.
 * - The background embedding diagram is centred on the instrument's throat.
 * Classic script, no globals, works from file:// and under script-src 'self'.
 * ==========================================================================*/
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function motionOK() { return !(motionQuery && motionQuery.matches); }
  function onMotionChange(fn) {
    if (!motionQuery) return;
    if (motionQuery.addEventListener) motionQuery.addEventListener('change', fn);
    else if (motionQuery.addListener) motionQuery.addListener(fn);
  }

  // ── hero loop ──────────────────────────────────────────────────────────
  function stopVideo(v) {
    try {
      v.pause();
      while (v.firstChild) v.removeChild(v.firstChild);
      v.removeAttribute('src');
      v.load();                                   // aborts any download in flight
    } catch (e) { /* already gone */ }
  }

  function setupLoop() {
    var v = document.getElementById('instrument-loop');
    if (!v || typeof v.play !== 'function') return;
    var conn = navigator.connection;
    var saveData = !!(conn && conn.saveData);
    var onScreen = false;

    function sync() {
      if (!v.isConnected) return;
      var want = onScreen && motionOK() && !saveData && !document.hidden;
      if (want) {
        if (v.preload !== 'auto') v.preload = 'auto';
        var p = v.play();
        if (p && typeof p.catch === 'function') p.catch(function () {});
      } else if (!v.paused) {
        v.pause();
      }
      if (!motionOK()) v.classList.remove('is-playing');  // back to the still
    }

    v.addEventListener('playing', function () { v.classList.add('is-playing'); });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        onScreen = entries[entries.length - 1].isIntersecting;
        sync();
      }, { threshold: 0.15 }).observe(v);
    } else {
      onScreen = true;
    }
    document.addEventListener('visibilitychange', sync);
    onMotionChange(sync);
    sync();
  }

  // ── swap in the live instrument ────────────────────────────────────────
  function activate() {
    var box = document.getElementById('instrument-preview');
    var btn = document.getElementById('instrument-activate');
    if (!box || !btn) return;
    if (box.querySelector('iframe')) return;      // already live

    var frame = document.createElement('iframe');
    frame.src = 'playground.html';
    frame.title = 'Live preview of the Wormhole Physics Playground';
    frame.setAttribute('tabindex', '-1');
    frame.setAttribute('loading', 'eager');

    box.insertBefore(frame, box.firstChild);
    var posters = box.querySelectorAll('.instrument-poster');
    for (var i = 0; i < posters.length; i++) {
      var el = posters[i];
      if (el.tagName === 'VIDEO') stopVideo(el);
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    if (btn.parentNode) btn.parentNode.removeChild(btn);
    box.classList.add('is-live');

    // keep keyboard focus somewhere sensible after the button disappears
    var enter = box.querySelector('.instrument-enter');
    if (enter && typeof enter.focus === 'function') enter.focus();
  }

  // ── reveal on scroll ───────────────────────────────────────────────────
  function setupReveal() {
    // Automated captures (navigator.webdriver) and reduced motion get the
    // finished page straight away.
    if (!motionOK() || navigator.webdriver || !('IntersectionObserver' in window)) return;
    var els = document.querySelectorAll('[data-reveal]');
    var fold = window.innerHeight * 0.94;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting && e.boundingClientRect.top > 0) return;
        show(e.target);
      });
    }, { rootMargin: '0px 0px -6% 0px' });

    function show(el) {
      io.unobserve(el);
      if (!el.classList.contains('is-pending')) return;
      el.classList.remove('is-pending');
      el.classList.add('is-in');
    }
    function showAll() { for (var i = 0; i < els.length; i++) show(els[i]); }

    for (var i = 0; i < els.length; i++) {
      if (els[i].getBoundingClientRect().top > fold) {
        els[i].classList.add('is-pending');
        io.observe(els[i]);
      }
    }
    window.addEventListener('beforeprint', showAll);
    onMotionChange(showAll);
  }

  // ── centre the embedding diagram on the instrument ────────────────────
  function setupSpacetime() {
    var layer = document.getElementById('spacetime');
    var target = document.getElementById('instrument-preview');
    if (!layer || !target) return;
    var queued = false;

    function place() {
      queued = false;
      var r = target.getBoundingClientRect();
      var lr = layer.getBoundingClientRect();
      if (!r.width) return;
      layer.style.setProperty('--tx', Math.round(r.left - lr.left + r.width / 2) + 'px');
      layer.style.setProperty('--ty', Math.round(r.top - lr.top + r.height / 2) + 'px');
    }
    function queue() { if (!queued) { queued = true; window.requestAnimationFrame(place); } }

    place();
    window.addEventListener('resize', queue);
    if ('ResizeObserver' in window) new ResizeObserver(queue).observe(document.body);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(queue);
    window.addEventListener('load', queue);

    // the diagram's slow drift pauses once the hero has scrolled away
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        layer.classList.toggle('is-idle', !entries[entries.length - 1].isIntersecting);
      }).observe(layer);
    }
  }

  function wire() {
    var btn = document.getElementById('instrument-activate');
    if (btn) btn.addEventListener('click', activate);
    setupSpacetime();
    setupLoop();
    setupReveal();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
