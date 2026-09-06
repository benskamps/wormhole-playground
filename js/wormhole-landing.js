/* ============================================================================
 * wormhole-landing.js — landing-page glue for index.html.
 * The hero shows a static poster until the reader opts in; only then is the
 * playground iframe (a second WebGL2 context) created. Classic script, no
 * globals, works from file:// and under script-src 'self'.
 * ==========================================================================*/
(function () {
  'use strict';

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

    var poster = box.querySelector('.instrument-poster');
    box.insertBefore(frame, box.firstChild);
    if (poster && poster.parentNode) poster.parentNode.removeChild(poster);
    if (btn.parentNode) btn.parentNode.removeChild(btn);
    box.classList.add('is-live');

    // keep keyboard focus somewhere sensible after the button disappears
    var enter = box.querySelector('.instrument-enter');
    if (enter && typeof enter.focus === 'function') enter.focus();
  }

  function wire() {
    var btn = document.getElementById('instrument-activate');
    if (btn) btn.addEventListener('click', activate);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
