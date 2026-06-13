/* =============================================================================
 * wormhole-panels.js  →  window.WormholePanels   (ONE window-global per file)
 * -----------------------------------------------------------------------------
 * Canvas-2D secondary visualizations — the honest-physics inspector rail.
 *
 *   1. Cross-section / embedding diagram  (±r(l) profile + TRUE isometric
 *      z(l)=r0·asinh(l/r0) curve + |rho(l)| exotic shading + V_eff(l) for the
 *      current angular index m + throat marker + camera tick), with a
 *      click-a-pixel traced-ray overlay (top-down winding inset + (l,r)
 *      polyline + b / deflection° / winding / destination-universe annotation).
 *   2. m-mode wave amplitude plot  (|psi|^2 polyline + filled corrected V_eff +
 *      throat marker + T / R / (T+R) / m readout).
 *   3. Exotic-matter ledger  (vertical log10 J/m^3 axis with LABELED rungs that
 *      each carry their assumption; the computed budget highlighted red +
 *      NEGATIVE; both kg/m^3 and J/m^3 with explicit c^2 conversion; gapOrders
 *      printed as "≈ N orders above Casimir" + Jupiter counter line).
 *
 * This module is the Canvas-2D FALLBACK experience when WebGL2 is unavailable.
 *
 * DEPENDS ONLY ON: window.WormholePhysics  (single source of truth for math).
 * NO WebGL, NO DOM mutation beyond the three supplied <canvas> elements.
 *
 * Public API (honored exactly — other agents code against this):
 *   WormholePanels.create({crossSectionCanvas, waveCanvas, ledgerCanvas})
 *     -> panels {
 *          resize(),
 *          renderCrossSection(state, overlay),
 *          renderWave(amp, lGrid, potentialArr, r0, m, trans),
 *          renderLedger(budget, r0_m)
 *        }
 * ===========================================================================*/

(function () {
  'use strict';

  // --- brand palette (continuity with the dark #0a0a12 / #4facfe aesthetic) ---
  var COL = {
    bg:        '#0a0a12',
    panel:     '#0a0a12',
    grid:      '#22223a',
    gridFaint: '#191926',
    axis:      '#3a3a5a',
    profile:   '#4facfe',   // r(l) profile + accent
    iso:       '#7ee0c0',   // isometric embedding curve (proper distance)
    exotic:    'rgba(176, 92, 255, 0.30)', // |rho| violet fog (matches GL fog)
    exoticEdge:'rgba(176, 92, 255, 0.65)',
    veff:      '#aa66ff',   // effective potential
    veffFill:  'rgba(170, 102, 255, 0.16)',
    throat:    '#ff4466',
    cam:       '#ffce56',
    wave:      '#44ff88',   // |psi|^2
    ink:       '#e0e0e0',
    inkMuted:  '#8888aa',
    inkFaint:  '#6a6a8a',
    rayA:      '#4facfe',   // universe-A sheet (l>0)  cool
    rayB:      '#ff9a55',   // universe-B sheet (l<0)  warm
    ring:      '#ffd27f',   // photon-ring (winding) glow
    danger:    '#ff5a6a',   // negative-energy ledger highlight
    rungCol:   '#cfd0e8',
    rungLine:  '#444a66'
  };

  var MONO = '11px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  var MONO_SM = '10px ui-monospace, "SF Mono", Menlo, Consolas, monospace';
  var SANS = '11px system-ui, "Segoe UI", sans-serif';

  // ---------------------------------------------------------------------------
  // small helpers
  // ---------------------------------------------------------------------------
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }

  // Format a number into "m.mmm × 10^e" superscript-ish parts for tight labels.
  function sci(v) {
    if (!isFiniteNum(v) || v === 0) return { mant: '0', exp: 0, str: '0' };
    var neg = v < 0;
    var a = Math.abs(v);
    var exp = Math.floor(Math.log10(a));
    var mant = a / Math.pow(10, exp);
    // guard for fp edge (e.g. 9.9999 -> 10)
    if (mant >= 9.9995) { mant = 1; exp += 1; }
    var mstr = (neg ? '-' : '') + mant.toFixed(2);
    return { mant: mstr, exp: exp, str: mstr + 'e' + exp };
  }

  // Draw "base × 10^exp" with a real superscript exponent. Returns advance width.
  function drawSci(ctx, x, y, baseStr, exp, color) {
    ctx.fillStyle = color;
    ctx.font = MONO;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    var s = baseStr + '×10';
    ctx.fillText(s, x, y);
    var w = ctx.measureText(s).width;
    ctx.font = '8px ui-monospace, monospace';
    ctx.fillText(String(exp), x + w + 1, y - 5);
    var w2 = ctx.measureText(String(exp)).width;
    ctx.font = MONO;
    return w + 1 + w2 + 2;
  }

  function P() { return window.WormholePhysics; }

  // ---------------------------------------------------------------------------
  // A single canvas wrapper: owns its 2D context, css size, and dpr scaling.
  // ---------------------------------------------------------------------------
  function makeSurface(canvas) {
    var s = {
      canvas: canvas,
      ctx: canvas ? canvas.getContext('2d') : null,
      w: 1,
      h: 1,
      dpr: 1
    };

    s.resize = function () {
      if (!s.canvas || !s.ctx) return;
      var parent = s.canvas.parentElement || s.canvas;
      var rect = parent.getBoundingClientRect();
      var dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      // Guard against zero-size parents (hidden panels) — keep a 1px floor.
      var w = Math.max(1, Math.round(rect.width));
      var h = Math.max(1, Math.round(rect.height));
      s.w = w;
      s.h = h;
      s.dpr = dpr;
      s.canvas.width = Math.max(1, Math.round(w * dpr));
      s.canvas.height = Math.max(1, Math.round(h * dpr));
      // Reset transform then scale so 1 ctx unit == 1 CSS px.
      s.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    s.clear = function (bg) {
      if (!s.ctx) return;
      s.ctx.save();
      s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
      s.ctx.fillStyle = bg || COL.bg;
      s.ctx.fillRect(0, 0, s.w, s.h);
      s.ctx.restore();
    };

    s.resize();
    return s;
  }

  // ---------------------------------------------------------------------------
  // The panels object returned by create().
  // ---------------------------------------------------------------------------
  function create(opts) {
    opts = opts || {};
    var csSurf = makeSurface(opts.crossSectionCanvas || null);
    var waveSurf = makeSurface(opts.waveCanvas || null);
    var ledgerSurf = makeSurface(opts.ledgerCanvas || null);

    // Domain shown on the cross-section / wave panels (sim units).
    var L_VIEW = 12;            // |l| span drawn on the profile/wave x-axis

    // ===================================================================
    // CROSS-SECTION / EMBEDDING DIAGRAM  (+ inspector overlay)
    // ===================================================================
    function renderCrossSection(state, overlay) {
      var ph = P();
      var ctx = csSurf.ctx;
      if (!ctx || !ph) return;
      var W = csSurf.w, H = csSurf.h;

      var r0 = (state && isFiniteNum(state.r0)) ? state.r0 : 1.0;
      var m  = (state && isFiniteNum(state.m))  ? Math.round(state.m) : 0;
      var camL = (state && isFiniteNum(state.camL)) ? state.camL : 8.0;

      csSurf.clear(COL.bg);

      // ---- layout ----
      var padL = 34, padR = 12, padT = 26, padB = 22;
      var plotW = Math.max(1, W - padL - padR);
      var plotH = Math.max(1, H - padT - padB);
      var midY = padT + plotH * 0.5;           // l-axis (r=0 centerline)

      // vertical scale: how many sim-units of r/z map to half the plot height.
      // Show enough to see r(±12)≈12 and z(±12) which grows ~ r0·ln; clamp.
      var maxR = ph.rFromL(L_VIEW, r0);                 // r at edge
      var maxZ = Math.abs(ph.embeddingZ(L_VIEW, r0));   // |z| at edge
      var vSpan = Math.max(maxR, maxZ, r0 * 1.4) * 1.12;
      var yScale = (plotH * 0.5) / vSpan;               // px per sim-unit (vertical)
      var xScale = plotW / (2 * L_VIEW);                // px per sim-unit (horiz)

      function lToX(l) { return padL + (l + L_VIEW) * xScale; }
      function rToYup(r) { return midY - r * yScale; }   // upper sheet
      function rToYdn(r) { return midY + r * yScale; }   // lower (mirror) sheet
      function zToY(z) { return midY - z * yScale; }     // signed embedding height

      // ---- background grid ----
      ctx.strokeStyle = COL.gridFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gl = -L_VIEW; gl <= L_VIEW; gl += 2) {
        var gx = lToX(gl);
        ctx.moveTo(gx, padT); ctx.lineTo(gx, padT + plotH);
      }
      ctx.stroke();

      // r=0 centerline
      ctx.strokeStyle = COL.grid;
      ctx.beginPath();
      ctx.moveTo(padL, midY); ctx.lineTo(padL + plotW, midY);
      ctx.stroke();

      // ---- |rho(l)| exotic-matter shading under the throat ----
      // rho = -r0^2/(8π r^4) < 0; shade |rho| as a violet band hugging the throat.
      var rhoPeak = Math.abs(ph.energyDensityGeom(0, r0));     // max at l=0
      if (rhoPeak > 0) {
        ctx.fillStyle = COL.exotic;
        ctx.beginPath();
        var started = false;
        var bandH = plotH * 0.5; // |rho| maps into the upper half as a glow band
        for (var li = -L_VIEW; li <= L_VIEW; li += 0.1) {
          var rho = Math.abs(ph.energyDensityGeom(li, r0));
          var frac = clamp(rho / rhoPeak, 0, 1);
          var x = lToX(li);
          var y = midY - frac * bandH * 0.62;
          if (!started) { ctx.moveTo(x, midY); started = true; }
          ctx.lineTo(x, y);
        }
        ctx.lineTo(lToX(L_VIEW), midY);
        ctx.closePath();
        ctx.fill();
        // its mirror under the centerline
        ctx.beginPath();
        started = false;
        for (var lj = -L_VIEW; lj <= L_VIEW; lj += 0.1) {
          var rho2 = Math.abs(ph.energyDensityGeom(lj, r0));
          var frac2 = clamp(rho2 / rhoPeak, 0, 1);
          var x2 = lToX(lj);
          var y2 = midY + frac2 * bandH * 0.62;
          if (!started) { ctx.moveTo(x2, midY); started = true; }
          ctx.lineTo(x2, y2);
        }
        ctx.lineTo(lToX(L_VIEW), midY);
        ctx.closePath();
        ctx.fill();
      }

      // ---- ±r(l) flat profile (the cross-section radius) ----
      function strokeProfile(yMap) {
        ctx.beginPath();
        var first = true;
        for (var l = -L_VIEW; l <= L_VIEW; l += 0.08) {
          var r = ph.rFromL(l, r0);
          var x = lToX(l), y = yMap(r);
          if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.strokeStyle = COL.profile;
      ctx.lineWidth = 2;
      strokeProfile(rToYup);
      ctx.strokeStyle = 'rgba(79,172,254,0.45)';
      ctx.lineWidth = 1.5;
      strokeProfile(rToYdn);

      // ---- isometric embedding z(l)=r0·asinh(l/r0) (proper-distance curve) ----
      // Drawn as a dashed teal curve through the centerline; this is the TRUE
      // isometric height (fixes the old z=l funnel).
      ctx.strokeStyle = COL.iso;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      var firstZ = true;
      for (var lz = -L_VIEW; lz <= L_VIEW; lz += 0.08) {
        var z = ph.embeddingZ(lz, r0);
        var xz = lToX(lz), yz = zToY(z * 0.5); // *0.5: share vertical space tastefully
        if (firstZ) { ctx.moveTo(xz, yz); firstZ = false; } else ctx.lineTo(xz, yz);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // ---- V_eff(l) curve for current m  (corrected potential) ----
      // V = m(m+1)/(l²+r0²) + r0²/(l²+r0²)²  — even m=0 shows the curvature bump.
      // Draw across the upper portion so it doesn't fight the profile.
      var veffPeak = m * (m + 1) / (r0 * r0) + 1 / (r0 * r0); // value at l=0
      if (veffPeak > 0) {
        ctx.strokeStyle = COL.veff;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        var firstV = true;
        var vBandTop = padT + 4;
        var vBandH = plotH * 0.40;
        for (var lv = -L_VIEW; lv <= L_VIEW; lv += 0.06) {
          var d = lv * lv + r0 * r0;
          var V = m * (m + 1) / d + (r0 * r0) / (d * d);
          var xv = lToX(lv);
          var yv = (padT + vBandH) - clamp(V / veffPeak, 0, 1) * vBandH;
          yv = Math.max(vBandTop, yv);
          if (firstV) { ctx.moveTo(xv, yv); firstV = false; } else ctx.lineTo(xv, yv);
        }
        ctx.stroke();
      }

      // ---- throat marker (vertical line at l=0) ----
      ctx.strokeStyle = COL.throat;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(lToX(0), padT); ctx.lineTo(lToX(0), padT + plotH);
      ctx.stroke();
      ctx.setLineDash([]);

      // throat radius dot + label
      ctx.fillStyle = COL.throat;
      ctx.beginPath();
      ctx.arc(lToX(0), rToYup(r0), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = MONO_SM;
      ctx.fillStyle = COL.throat;
      ctx.textAlign = 'left';
      ctx.fillText('r0=' + r0.toFixed(2), lToX(0) + 5, rToYup(r0) - 4);

      // ---- camera tick at camL ----
      var camX = lToX(clamp(camL, -L_VIEW, L_VIEW));
      ctx.strokeStyle = COL.cam;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(camX, midY - 7); ctx.lineTo(camX, midY + 7);
      ctx.stroke();
      ctx.fillStyle = COL.cam;
      ctx.beginPath();
      ctx.moveTo(camX, midY - 10);
      ctx.lineTo(camX - 4, midY - 16);
      ctx.lineTo(camX + 4, midY - 16);
      ctx.closePath();
      ctx.fill();
      ctx.font = MONO_SM;
      ctx.textAlign = 'center';
      ctx.fillText('cam', camX, midY - 18);

      // ---- titles / axis labels ----
      ctx.font = SANS;
      ctx.textAlign = 'left';
      ctx.fillStyle = COL.inkMuted;
      ctx.fillText('CROSS-SECTION', padL, 14);
      ctx.fillStyle = COL.iso;
      ctx.font = MONO_SM;
      ctx.fillText('z(l)=r0·asinh(l/r0) — isometric (proper distance)', padL, padT + plotH + 14);

      // universe sheet labels
      ctx.font = SANS;
      ctx.fillStyle = COL.rayB;
      ctx.textAlign = 'center';
      ctx.fillText('Universe B  (l<0)', padL + plotW * 0.22, padT + 11);
      ctx.fillStyle = COL.rayA;
      ctx.fillText('Universe A  (l>0)', padL + plotW * 0.78, padT + 11);

      // V_eff legend
      ctx.font = MONO_SM;
      ctx.fillStyle = COL.veff;
      ctx.textAlign = 'right';
      ctx.fillText('V_eff (m=' + m + ')', padL + plotW, padT + 11);

      // ===================================================================
      // INSPECTOR OVERLAY — traced ray from WormholePhysics.traceRay
      // ===================================================================
      if (overlay && overlay.path && overlay.path.length >= 2) {
        drawRayOverlay(ctx, overlay, {
          padL: padL, padT: padT, plotW: plotW, plotH: plotH,
          midY: midY, lToX: lToX, rToYup: rToYup, yScale: yScale,
          r0: r0, ph: ph
        });
      }
    }

    // ---- the click-a-pixel traced-ray overlay ----
    function drawRayOverlay(ctx, overlay, g) {
      var ph = g.ph;
      var path = overlay.path; // Float32Array [l0,phi0, l1,phi1, ...]
      var nPts = Math.floor(path.length / 2);
      if (nPts < 2) return;

      // (1) (l, r) polyline traced on the main profile (upper sheet, then
      //     mirror to lower if it ends in Universe B for a quick visual cue).
      ctx.save();
      ctx.lineWidth = 2;
      ctx.strokeStyle = COL.ring;       // distinct from the static profile
      ctx.globalAlpha = 0.95;
      ctx.beginPath();
      var first = true;
      for (var i = 0; i < nPts; i++) {
        var l = path[i * 2];
        var r = ph.rFromL(l, g.r0);
        var lx = g.lToX(clamp(l, -L_VIEW, L_VIEW));
        // place the ray ABOVE the centerline (it lives on the r>0 profile)
        var ly = g.midY - r * g.yScale;
        if (!isFiniteNum(lx) || !isFiniteNum(ly)) continue;
        if (first) { ctx.moveTo(lx, ly); first = false; } else ctx.lineTo(lx, ly);
      }
      ctx.stroke();
      ctx.restore();

      // (2) top-down winding inset: x=r·cosφ, y=r·sinφ, hue by sign(l).
      var insetSz = Math.min(g.plotW * 0.34, g.plotH * 0.5, 120);
      var insX = g.padL + g.plotW - insetSz - 6;
      var insY = g.padT + 6;
      var cx = insX + insetSz / 2;
      var cy = insY + insetSz / 2;

      // inset frame
      ctx.save();
      ctx.fillStyle = 'rgba(8,8,18,0.82)';
      ctx.strokeStyle = COL.rungLine;
      ctx.lineWidth = 1;
      roundRect(ctx, insX, insY, insetSz, insetSz, 4);
      ctx.fill();
      ctx.stroke();

      // determine radial scale for inset from max |r| along the path
      var maxr = g.r0;
      for (var k = 0; k < nPts; k++) {
        var rr = ph.rFromL(path[k * 2], g.r0);
        if (rr > maxr) maxr = rr;
      }
      // cap so deeply-escaping rays don't shrink the interesting near-throat part
      maxr = Math.min(maxr, g.r0 * 8 + 4);
      var iScale = (insetSz * 0.42) / maxr;

      // throat circle (radius r0) in the inset
      ctx.strokeStyle = COL.throat;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(cx, cy, g.r0 * iScale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      // the winding polyline, colored by which universe sheet (sign of l)
      ctx.lineWidth = 1.6;
      var prevX = null, prevY = null, prevSign = 0;
      for (var j = 0; j < nPts; j++) {
        var lj = path[j * 2];
        var phij = path[j * 2 + 1];
        var rj = Math.min(ph.rFromL(lj, g.r0), maxr);
        var px = cx + rj * Math.cos(phij) * iScale;
        var py = cy + rj * Math.sin(phij) * iScale;
        var sign = lj >= 0 ? 1 : -1;
        if (prevX !== null) {
          ctx.strokeStyle = (prevSign >= 0) ? COL.rayA : COL.rayB;
          ctx.beginPath();
          ctx.moveTo(prevX, prevY);
          ctx.lineTo(px, py);
          ctx.stroke();
        }
        prevX = px; prevY = py; prevSign = sign;
      }
      // start marker
      var l0 = path[0], phi0 = path[1];
      var r0p = Math.min(ph.rFromL(l0, g.r0), maxr);
      ctx.fillStyle = COL.cam;
      ctx.beginPath();
      ctx.arc(cx + r0p * Math.cos(phi0) * iScale, cy + r0p * Math.sin(phi0) * iScale, 2.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '9px ui-monospace, monospace';
      ctx.fillStyle = COL.inkMuted;
      ctx.textAlign = 'center';
      ctx.fillText('traced ray (top-down)', cx, insY + insetSz - 5);
      ctx.restore();

      // (3) annotation card: b / deflection° / winding / destination universe
      var defl = isFiniteNum(overlay.deflection) ? overlay.deflection : 0;
      var deflDeg = defl * 180 / Math.PI;
      var uni = overlay.universe;
      var uniLabel = uni === 'A' ? 'Universe A (l>0)'
                   : uni === 'B' ? 'Universe B (l<0)'
                   : 'PHOTON RING (winding)';
      var uniCol = uni === 'A' ? COL.rayA : uni === 'B' ? COL.rayB : COL.ring;
      var bVal = isFiniteNum(overlay.b) ? overlay.b : 0;
      var winding = isFiniteNum(overlay.winding) ? overlay.winding : 0;

      var lines = [
        'INSPECTOR — traced ray',
        'b = ' + bVal.toFixed(3) + '   (b_c = r0 = ' + g.r0.toFixed(2) + ')',
        'deflection = ' + deflDeg.toFixed(1) + '°',
        'winding = ' + winding,
        'dest: '
      ];
      ctx.save();
      ctx.font = MONO_SM;
      var cardW = 0;
      for (var t = 0; t < lines.length; t++) {
        cardW = Math.max(cardW, ctx.measureText(lines[t] + (t === 4 ? uniLabel : '')).width);
      }
      cardW += 14;
      var cardH = lines.length * 13 + 8;
      var cardX = g.padL + 4;
      var cardY = g.padT + 4;
      ctx.fillStyle = 'rgba(8,8,18,0.85)';
      ctx.strokeStyle = uniCol;
      ctx.lineWidth = 1;
      roundRect(ctx, cardX, cardY, cardW, cardH, 4);
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      for (var u = 0; u < lines.length; u++) {
        var ly2 = cardY + 14 + u * 13;
        if (u === 0) { ctx.fillStyle = COL.ink; }
        else if (u === 4) { ctx.fillStyle = COL.inkMuted; }
        else { ctx.fillStyle = COL.inkMuted; }
        ctx.fillText(lines[u], cardX + 7, ly2);
        if (u === 4) {
          var lw = ctx.measureText(lines[4]).width;
          ctx.fillStyle = uniCol;
          ctx.fillText(uniLabel, cardX + 7 + lw, ly2);
        }
      }
      ctx.restore();
    }

    // ===================================================================
    // WAVE AMPLITUDE PLOT  (|psi|^2 + filled corrected V_eff + T/R readout)
    // ===================================================================
    function renderWave(amp, lGrid, potentialArr, r0, m, trans) {
      var ctx = waveSurf.ctx;
      if (!ctx) return;
      var W = waveSurf.w, H = waveSurf.h;
      waveSurf.clear(COL.bg);

      r0 = isFiniteNum(r0) ? r0 : 1.0;
      m = isFiniteNum(m) ? Math.round(m) : 0;

      var padL = 30, padR = 12, padT = 24, padB = 26;
      var plotW = Math.max(1, W - padL - padR);
      var plotH = Math.max(1, H - padT - padB);
      var baseY = padT + plotH;             // y for |psi|^2 = 0 and V = 0

      var n = (amp && amp.length) ? amp.length : 0;

      function idxToX(i) { return padL + (i / Math.max(1, n - 1)) * plotW; }

      // grid
      ctx.strokeStyle = COL.gridFaint;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (var gx = 0; gx <= 4; gx++) {
        var X = padL + (gx / 4) * plotW;
        ctx.moveTo(X, padT); ctx.lineTo(X, baseY);
      }
      ctx.stroke();
      ctx.strokeStyle = COL.axis;
      ctx.beginPath();
      ctx.moveTo(padL, baseY); ctx.lineTo(padL + plotW, baseY);
      ctx.stroke();

      // ---- filled corrected V_eff (use solver's potentialArr if given) ----
      var vMax = 1e-9;
      var Varr = potentialArr;
      if (!Varr || !Varr.length) {
        // derive from lGrid if the caller didn't pass a potential array
        if (lGrid && lGrid.length) {
          Varr = new Float32Array(lGrid.length);
          for (var vi = 0; vi < lGrid.length; vi++) {
            var l = lGrid[vi];
            var d = l * l + r0 * r0;
            Varr[vi] = m * (m + 1) / d + (r0 * r0) / (d * d);
          }
        }
      }
      if (Varr && Varr.length) {
        for (var vk = 0; vk < Varr.length; vk++) if (Varr[vk] > vMax) vMax = Varr[vk];
        var vBandH = plotH * 0.55;
        ctx.fillStyle = COL.veffFill;
        ctx.beginPath();
        ctx.moveTo(padL, baseY);
        for (var p = 0; p < Varr.length; p++) {
          var xv = padL + (p / Math.max(1, Varr.length - 1)) * plotW;
          var yv = baseY - clamp(Varr[p] / vMax, 0, 1) * vBandH;
          ctx.lineTo(xv, yv);
        }
        ctx.lineTo(padL + plotW, baseY);
        ctx.closePath();
        ctx.fill();
        // outline
        ctx.strokeStyle = COL.veff;
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (var p2 = 0; p2 < Varr.length; p2++) {
          var xv2 = padL + (p2 / Math.max(1, Varr.length - 1)) * plotW;
          var yv2 = baseY - clamp(Varr[p2] / vMax, 0, 1) * vBandH;
          if (p2 === 0) ctx.moveTo(xv2, yv2); else ctx.lineTo(xv2, yv2);
        }
        ctx.stroke();
      }

      // ---- |psi|^2 polyline (normalized to its own running max) ----
      if (n > 0) {
        var maxAmp = 1e-9;
        for (var a = 0; a < n; a++) if (amp[a] > maxAmp) maxAmp = amp[a];
        var ampBandH = plotH * 0.78;
        ctx.strokeStyle = COL.wave;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (var s = 0; s < n; s++) {
          var x = idxToX(s);
          var y = baseY - clamp(amp[s] / maxAmp, 0, 1) * ampBandH;
          if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }

      // ---- throat marker at l=0 ----
      // find index nearest l=0 in lGrid, else assume centered grid.
      var throatX = padL + plotW * 0.5;
      if (lGrid && lGrid.length) {
        var bestI = 0, bestD = Infinity;
        for (var li = 0; li < lGrid.length; li++) {
          var dd = Math.abs(lGrid[li]);
          if (dd < bestD) { bestD = dd; bestI = li; }
        }
        throatX = padL + (bestI / Math.max(1, lGrid.length - 1)) * plotW;
      }
      ctx.strokeStyle = COL.throat;
      ctx.lineWidth = 1;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(throatX, padT); ctx.lineTo(throatX, baseY);
      ctx.stroke();
      ctx.setLineDash([]);

      // ---- T / R / (T+R) / m readout ----
      var T = (trans && isFiniteNum(trans.T)) ? trans.T : 0;
      var R = (trans && isFiniteNum(trans.R)) ? trans.R : 0;
      var sum = (trans && isFiniteNum(trans.sum)) ? trans.sum : (T + R);
      var readout = 'peak T=' + (T * 100).toFixed(0) + '%  R=' + (R * 100).toFixed(0) +
                    '%  (T+R=' + sum.toFixed(2) + ')  m=' + m;

      ctx.font = SANS;
      ctx.fillStyle = COL.inkMuted;
      ctx.textAlign = 'left';
      ctx.fillText('m-MODE WAVE', padL, 14);

      ctx.font = MONO;
      ctx.fillStyle = COL.wave;
      ctx.textAlign = 'right';
      ctx.fillText(readout, padL + plotW, 14);

      // axis labels + honesty caption
      ctx.font = MONO_SM;
      ctx.fillStyle = COL.wave;
      ctx.textAlign = 'left';
      ctx.fillText('|ψ|²', padL + 2, padT + 11);
      ctx.fillStyle = COL.veff;
      ctx.fillText('V_eff = m(m+1)/r² + r0²/r⁴', padL + 38, padT + 11);
      ctx.fillStyle = COL.inkFaint;
      ctx.textAlign = 'center';
      ctx.fillText('throat', throatX, baseY + 12);
      ctx.fillText('m=0 passes at high freq; the throat curvature term gives even m=0 a small barrier',
                   padL + plotW * 0.5, baseY + 22);
    }

    // ===================================================================
    // EXOTIC-MATTER LEDGER  (Jupiter counter)
    // ===================================================================
    // Every rung carries its assumption in the label. No unlabeled magic numbers.
    var LEDGER_RUNGS = [
      { v: 4.3e-4, label: 'Casimir effect',     assume: '1 µm plate gap',        col: '#7ee0c0' },
      { v: 1e10,   label: 'TNT detonation',     assume: 'chemical energy density', col: '#ffce56' },
      { v: 9e19,   label: 'Water (mass-energy)', assume: 'ρc² of liquid water',   col: '#4facfe' },
      { v: 5e34,   label: 'Neutron-star core',  assume: 'nuclear saturation',     col: '#c08bff' }
    ];

    function renderLedger(budget, r0_m) {
      var ctx = ledgerSurf.ctx;
      if (!ctx) return;
      var W = ledgerSurf.w, H = ledgerSurf.h;
      ledgerSurf.clear(COL.bg);

      budget = budget || {};
      var rhoJ = isFiniteNum(budget.rho_J_m3) ? budget.rho_J_m3 : 0;
      var rhoKg = isFiniteNum(budget.rho_kg_m3) ? budget.rho_kg_m3 : 0;
      var jupiters = isFiniteNum(budget.jupiters) ? budget.jupiters : 0;
      var gapOrders = isFiniteNum(budget.gapOrders) ? budget.gapOrders : 0;

      var padL = 12, padR = 12, padT = 22, padB = 30;
      var axisX = padL + 6;
      var plotTop = padT;
      var plotBot = H - padB;
      var plotH = Math.max(1, plotBot - plotTop);

      // log10 axis range: span from below Casimir up to (and beyond) the budget.
      var loExp = -6;                                  // a touch below Casimir
      var budgetExp = rhoJ > 0 ? Math.log10(rhoJ) : 45;
      var hiExp = Math.max(budgetExp + 3, 38);
      // ensure all named rungs fit
      for (var ri = 0; ri < LEDGER_RUNGS.length; ri++) {
        var e = Math.log10(LEDGER_RUNGS[ri].v);
        if (e < loExp) loExp = e - 1;
        if (e > hiExp) hiExp = e + 2;
      }
      var expSpan = Math.max(1, hiExp - loExp);

      function expToY(exp) {
        var f = (exp - loExp) / expSpan;            // 0 at bottom, 1 at top
        return plotBot - f * plotH;
      }

      // ---- vertical axis ----
      ctx.strokeStyle = COL.axis;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(axisX, plotTop); ctx.lineTo(axisX, plotBot);
      ctx.stroke();

      // decade tick marks
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillStyle = COL.inkFaint;
      ctx.textAlign = 'left';
      var step = expSpan > 40 ? 10 : (expSpan > 16 ? 5 : 2);
      for (var d = Math.ceil(loExp / step) * step; d <= hiExp; d += step) {
        var ty = expToY(d);
        ctx.strokeStyle = COL.gridFaint;
        ctx.beginPath();
        ctx.moveTo(axisX, ty); ctx.lineTo(W - padR, ty);
        ctx.stroke();
        ctx.fillStyle = COL.inkFaint;
        ctx.fillText('10^' + d, axisX + 2, ty - 1);
      }

      // ---- named rungs (each with assumption) ----
      for (var rj = 0; rj < LEDGER_RUNGS.length; rj++) {
        var rung = LEDGER_RUNGS[rj];
        var ry = expToY(Math.log10(rung.v));
        ctx.strokeStyle = rung.col;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(axisX, ry); ctx.lineTo(W - padR - 4, ry);
        ctx.stroke();
        // marker dot
        ctx.fillStyle = rung.col;
        ctx.beginPath();
        ctx.arc(axisX, ry, 2.5, 0, Math.PI * 2);
        ctx.fill();
        // label (name + value + assumption — labeled magic numbers)
        var sc = sci(rung.v);
        ctx.font = MONO_SM;
        ctx.fillStyle = rung.col;
        ctx.textAlign = 'left';
        ctx.fillText(rung.label + '  ' + sc.str + ' J/m³', axisX + 8, ry - 2);
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillStyle = COL.inkFaint;
        ctx.fillText('(' + rung.assume + ')', axisX + 8, ry + 8);
      }

      // ---- the computed exotic-matter requirement: red, NEGATIVE ----
      if (rhoJ > 0) {
        var by = expToY(budgetExp);
        // glow band
        ctx.fillStyle = 'rgba(255,90,106,0.12)';
        ctx.fillRect(axisX, Math.min(by, plotTop), W - padR - axisX, Math.abs(plotTop - by));
        ctx.strokeStyle = COL.danger;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(axisX, by); ctx.lineTo(W - padR, by);
        ctx.stroke();
        ctx.fillStyle = COL.danger;
        ctx.beginPath();
        ctx.arc(axisX, by, 3.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = 'bold ' + MONO_SM;
        ctx.fillStyle = COL.danger;
        ctx.textAlign = 'left';
        var scB = sci(rhoJ);
        ctx.fillText('THROAT REQUIREMENT  −' + scB.str + ' J/m³  (NEGATIVE)', axisX + 8, by - 4);
        // kg/m³ with explicit c² conversion
        ctx.font = '8px ui-monospace, monospace';
        ctx.fillStyle = '#ff97a3';
        var scKg = sci(rhoKg);
        ctx.fillText('= −' + scKg.str + ' kg/m³   (÷ c² = ÷ 8.988×10¹⁶)', axisX + 8, by + 8);
      }

      // ---- header + footer summary lines ----
      ctx.font = SANS;
      ctx.fillStyle = COL.inkMuted;
      ctx.textAlign = 'left';
      ctx.fillText('EXOTIC-MATTER LEDGER', padL, 13);

      // gap-orders + Jupiter counter (computed live — no hardcoded "60")
      ctx.font = MONO_SM;
      ctx.textAlign = 'left';
      var fy = H - padB + 11;
      ctx.fillStyle = COL.danger;
      ctx.fillText('≈ ' + gapOrders.toFixed(1) + ' orders of magnitude above the Casimir effect',
                   padL, fy);
      ctx.fillStyle = COL.cam;
      var jStr = jupiters >= 0.01 ? jupiters.toFixed(2) : sci(jupiters).str;
      ctx.fillText('|E| ≈ ' + jStr + ' M_Jup per this throat' +
                   (isFiniteNum(r0_m) ? '   (r0 = ' + fmtMeters(r0_m) + ')' : ''),
                   padL, fy + 11);
    }

    // ---------------------------------------------------------------------
    // resize all three surfaces (re-read parent rects × dpr)
    // ---------------------------------------------------------------------
    function resize() {
      csSurf.resize();
      waveSurf.resize();
      ledgerSurf.resize();
    }

    return {
      resize: resize,
      renderCrossSection: renderCrossSection,
      renderWave: renderWave,
      renderLedger: renderLedger
    };
  }

  // ---------------------------------------------------------------------------
  // misc drawing / format helpers (module-private)
  // ---------------------------------------------------------------------------
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fmtMeters(m) {
    if (!isFiniteNum(m)) return '?';
    if (m >= 1e6) return (m / 1e3).toFixed(0) + ' km';
    if (m >= 1e3) return (m / 1e3).toFixed(0) + ' km';
    if (m >= 1) return m.toFixed(0) + ' m';
    if (m >= 1e-3) return (m * 1e3).toFixed(0) + ' mm';
    if (m >= 1e-6) return (m * 1e6).toFixed(0) + ' µm';
    if (m >= 1e-9) return (m * 1e9).toFixed(0) + ' nm';
    return sci(m).str + ' m';
  }

  // ---------------------------------------------------------------------------
  // export the single window-global
  // ---------------------------------------------------------------------------
  window.WormholePanels = {
    VERSION: '1.0.0',
    create: create
  };
})();
