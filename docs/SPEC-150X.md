# SPEC-150X — Wormhole Physics Playground rebuild
### "Through the Drainhole": a per-pixel geodesic-raytraced Ellis wormhole with the honest-physics inspector rail

Status: BUILD SPEC (synthesized 2026-06-12 from four design visions)
Target: `playground.html` (rewritten by the integrator) + 4 new files in `js/`
Python scripts, `README.md`, `index.html`: untouched by builders.

---

## 0. Product concept (one paragraph)

Replace the slider-dashboard with one hero view: a full-screen WebGL2 fragment shader that
RK4-integrates an actual null geodesic of the Ellis metric `ds² = −dt² + dl² + (l²+r0²)dΩ²`
for every pixel, so the Einstein ring, ghost-star multiple imaging, and the view into a second
procedurally distinct universe all EMERGE from the integration — nothing is painted on. The
house mascot — a glazed DOUGHNUT (raymarched torus SDF) — is the traversable test object: press
SEND DOUGHNUT and it crosses the throat on a real timelike geodesic, gravitationally lensed by
the spacetime and tidally deformed by the Ellis tidal tensor (radial stretch / lateral squeeze),
with the HUD honestly reporting whether the doughnut — and a human — survive the tides at the
current throat radius (small throat ⇒ spaghettification). A TRAVERSE button flies the camera
through the throat (the shareable 15 seconds); the project's
flagship m-mode angular-momentum filtering result renders as a glowing wave shell in the same
raytraced scene AND as the surviving 1D plot; cutting exotic matter makes the throat visibly
pinch shut; and a click-any-pixel inspector re-integrates that exact ray on the CPU and plots
it on the cross-section diagram with impact parameter, deflection, and winding count — closing
the loop between awe and equation. A live "Jupiter counter" ledger computes the exotic-matter
requirement from the closed form and scrolls the visitor past the tens-of-orders-of-magnitude
Casimir gap. Every wrong thing in the current build (fake Kerr ergosphere, hardcoded CTC flag,
backwards clock, dropped curvature term in the wave potential, non-isometric funnel,
launch-side transmission bug) is deleted or fixed. Same honest-physics brand, two orders of
magnitude more awe.

---

## 1. Hard constraints (verbatim, non-negotiable)

1. **file:// double-click must work.** Zero dependencies, no build step, no network fetches,
   no ES modules, no `fetch()` of `.glsl` files, no texture image downloads. All GLSL lives in
   JS template strings. All skies are procedural. Classic `<script src>` tags only.
2. **One window-global per file.** Each `js/` file defines exactly one namespace object
   (`window.WormholePhysics`, etc.) and touches nothing else global. Put this rule in a header
   comment at the top of every file.
3. **WebGL2 raw** (no three.js). If WebGL2 or required extensions are missing,
   show a styled banner and run the Canvas-2D panels alone as the fallback experience.
4. **Scientific honesty.** The raytracer renders ONLY the exact Φ=0 Ellis solution. Anything
   approximate or conjectural is fenced, labeled, or deleted. Specific deletions and fixes in §8.
5. **Performance:** 60 fps target on a mid-range GPU at default settings; graceful at 30 fps
   via the dynamic-resolution governor (§5.8). Never silently degrade — surface the current
   scale in the HUD.

---

## 2. File layout & load order

```
sims/wormhole/
├── playground.html          ← INTEGRATOR ONLY. Shell, State, rAF loop, wiring.
├── js/
│   ├── wormhole-physics.js  → window.WormholePhysics   (pure math; no DOM, no GL)
│   ├── wormhole-gl.js       → window.WormholeGL        (WebGL2 raytracer + GLSL strings)
│   ├── wormhole-panels.js   → window.WormholePanels    (Canvas-2D secondary viz)
│   └── wormhole-ui.js       → window.WormholeUI        (controls, HUD, traverse, inspector glue, stretch: tour+audio)
└── docs/SPEC-150X.md        ← this file
```

Load order in playground.html: `physics → gl → panels → ui`. Each file may assume the ones
before it exist; never the ones after.

### Units convention (PINNED — all four builders use this)

- **Simulation units are geometric (G=c=1), dimensionless.** `r0 ∈ [0.05, 3]` (default 1.0),
  `l ∈ [−12, 12]` for the wave grid, camera `l ∈ [−20, 20]`.
- **SI appears ONLY in `WormholePhysics.budget()` and `.tidal()`**, which take `r0_m`
  (throat radius in meters) from the UI's physical-scale selector:
  `1 nm | 1 m | 1 km | 1000 km`.
- **README reconciliation (important):** the README quotes "1 m throat needs ~10⁴³ kg/m³"
  and a "60-order gap." The closed form ρ_throat = c⁴/(8πG·r0²) gives ~4.8×10⁴² J/m³ =
  ~5.4×10²⁵ kg/m³ for r0 = 1 m (gap vs 1 µm-gap Casimir ≈ 47 orders); the README's 10⁴³ kg/m³
  and ~60-order figures are mutually consistent for r0 ≈ 1 nm. The ledger therefore computes
  everything LIVE from the closed form, shows BOTH kg/m³ and J/m³ with the c² conversion
  explicit, and lets the scale selector reproduce both regimes. Do not hardcode "60"; display
  the computed order count for the selected scale. (Note for Ben: README deserves a one-line
  erratum; out of scope for builders.)

---

## 3. Synthesis decisions (what won, what died)

**Centerpiece** = the per-pixel geodesic raytracer (appeared in all four visions; spectacle
vision rated it feasibility 4 — highest-wow item available). In-shader **procedural** sky
sampling at ray exit (hash starfields + FBM nebula evaluated from exit direction) wins over
baked cubemaps for v1 — simpler contract, zero FBO bake; cubemap bake with mips is a stretch
upgrade for Einstein-ring antialiasing.

**Kept first-class:** TRAVERSE flythrough; m-mode wave filtering (1D plot + raytraced glow
shell, single-source solver); collapse-on-exotic-cut driving `uR0`; exotic-matter glow along
rays (≈15 shader lines, labeled visualization); click-a-pixel inspector; the 60-order ledger
(Jupiter counter); startup self-tests.

**Fixed (vision 3's audit, verified against current source):** wave potential curvature term;
isometric embedding z = r0·asinh(l/r0); transmission launch-side bug.

**Deleted:** fake Kerr ergosphere (`KerrMetric.ergosphereRadius` uses a black-hole formula with
a phantom M=1), hardcoded `hasCTC`, the "TIME RUNNING BACKWARDS" clock (proper time is
monotonic along every worldline, CTC or not), the CTC preset and warning banner. Rotation
(Teo metric) and ER=EPR are NOT rebuilt in v1; ER=EPR may return as a clearly-fenced
"Speculative Annex" tab (stretch). Φ≠0 redshift is dropped from the raytracer (it renders the
exact Φ=0 Ellis drainhole; honest corollary shown in HUD: "Φ=0 ⇒ no gravitational time
dilation in this geometry — clock-rate effects during traverse are velocity, not gravity").

**Stretch (ordered):** guided tour chapters; WebAudio sonification; tidal survivability meter;
photon slingshot; HDR bloom post pipeline; postcard save; sky reseed UI; cubemap bake;
ER=EPR annex.

---

## 4. `js/wormhole-physics.js` → `window.WormholePhysics`

Pure math. **No DOM, no WebGL, no Canvas.** Safe to run in console. This file is the
single source of truth for every equation; the GLSL in `wormhole-gl.js` mirrors `traceRay`
constant-for-constant (a comment block in BOTH files must say so and list the shared
constants: RK4 form, step rule `dλ = h·r(l)`, h base 0.35, exit at `|l| > max(40·r0, 25)`).

```js
window.WormholePhysics = {
  VERSION: '1.0.0',
  // --- constants (SI) ---
  C: { G: 6.674e-11, c: 2.998e8, M_JUP: 1.898e27, g0: 9.81,
       CASIMIR_J_M3: 4.3e-4 /* 1 µm plate gap, π²ħc/720d⁴ */ },

  // --- metric (geometric units) ---
  rFromL(l, r0),                 // -> sqrt(l*l + r0*r0)
  energyDensityGeom(l, r0),      // -> -r0*r0 / (8*Math.PI * Math.pow(rFromL(l,r0), 4))  (< 0)
  embeddingZ(l, r0),             // -> r0 * Math.asinh(l / r0)   // TRUE isometric embedding

  // --- null geodesics (the CPU mirror of the shader) ---
  criticalImpact(r0),            // -> r0   (unstable photon orbit sits AT the throat)
  traceRay(l0, theta, r0, opts), // theta: angle [rad] between ray and +l axis at the camera,
                                 //   measured in the ray's orbital plane. b = rFromL(l0,r0)*sin(theta).
                                 // opts = { steps: 600, lMax: Math.max(40*r0, 25), recordPath: true }
                                 // RK4 on state (l, p, phi):
                                 //   dl/dλ = p
                                 //   dp/dλ = b*b*l / Math.pow(l*l + r0*r0, 2)
                                 //   dφ/dλ = b / (l*l + r0*r0)
                                 // with p0 = cos(theta), φ0 = 0, adaptive dλ = 0.35*rFromL(l,r0)
                                 //   (scaled down so total budget ≈ opts.steps).
                                 // -> { b, universe: 'A'|'B'|'ring',       // 'A' if exit l>0, 'B' if l<0,
                                 //                                          // 'ring' if step budget exhausted (near-critical)
                                 //      deflection,                        // total Δφ minus straight-line Δφ [rad]
                                 //      winding,                           // Math.floor(totalPhi / (2π))
                                 //      path }                             // Float32Array [l0,phi0, l1,phi1, ...] (if recordPath)

  // --- wave solver (the m-mode filtering result; SINGLE SOURCE — GL & panels both read its array) ---
  makeWaveSolver(opts),          // opts = { n: 400, lMin: -12, lMax: 12 } ->
    // solver = {
    //   n, lGrid: Float32Array(n),
    //   amplitude: Float32Array(n),          // |ψ|², updated in place by step(); upload/draw THIS
    //   potential(r0, m) -> Float32Array(n), // V(l) = m*(m+1)/(l²+r0²) + r0²/(l²+r0²)²
    //                                        // CORRECTED: includes curvature term r0²/r⁴ (ψ = r·φ).
    //                                        // UI label keeps "m"; tooltip notes it is the angular index ℓ.
    //   launch({ l0, width = 1.5, k, m }),   // Gaussian ψ = exp(-(l-l0)²/2w²)·e^{ikl}; records sign(l0) as launch side
    //   step(dt, r0, substeps = 5),          // leapfrog ψ_tt = ψ_ll − Vψ, absorbing edges (30-cell ramp), dt = 0.02
    //   getTransmission()                    // -> { T, R, sum }  T = energy on the side OPPOSITE the recorded
    //                                        //    launch side / total (FIXES the hardcoded-left bug);
    //                                        //    sum = T+R energy-conservation sanity number
    // }

  // --- stability (PEDAGOGICAL TOY — label it; true Ellis throats are unstable: González–Guzmán–Sarbach 2009) ---
  stabilityStep(s, exotic, collapseRate, dt),
                                 // s = {r0, v}; F = exotic/(s.r0²+0.01) − collapseRate*s.r0;
                                 // v += F*dt; v *= 0.99; r0 += v*dt; clamp r0 to [0.05, 3]. Returns s.

  // --- SI instruments ---
  budget(r0_m),                  // -> { rho_J_m3: c⁴/(8πG·r0_m²),
                                 //      rho_kg_m3: rho_J_m3 / c²,
                                 //      totalE_J:  Math.PI * c⁴ * r0_m / (2*G),   // ≈ 1.90e44 J · (r0_m/1m)
                                 //      jupiters:  totalE_J / (M_JUP * c²),        // ≈ 1.11 per meter of throat
                                 //      gapOrders: Math.log10(rho_J_m3 / CASIMIR_J_M3) }  // ~46.7 @1m, ~64.7 @1nm
  tidal(r0_m, vFrac, xi = 2.0),  // traveler height xi [m], speed vFrac·c. γ = 1/sqrt(1-vFrac²)
                                 // -> { accel_ms2: γ²(vFrac·c)²·xi / r0_m²,
                                 //      accel_g, minComfortR0_m: γ·vFrac·c·Math.sqrt(xi/g0),
                                 //      radialTidal: 0 }   // exactly zero for Φ=0 Ellis — display the fact

  // --- THE DOUGHNUT (required must-have; mascot test object crossing the throat) ---
  // Timelike radial geodesic path of the doughnut through the throat. Φ=0 Ellis ⇒ a
  // free-fall doughnut with conserved E and L. Default send: L=0 (clean radial crossing).
  doughnutStepTimelike(s, r0, dTau, opts), // s = { l, p, tau, phiTL }; opts = { E:1, L:0 }
                                 // RK4 one step of proper time τ on:
                                 //   dl/dτ = p
                                 //   dp/dτ = -(L*L) * l / Math.pow(l*l+r0*r0, 2)   // angular barrier (Φ=0)
                                 //   dphiTL/dτ = L / (l*l+r0*r0)
                                 // with the constraint p² = E² − (1 + L²/r²) used only as a
                                 // self-check. Returns updated s; the throat-barrier filtering
                                 // (high L stalls at a turning point) falls out of dp/dτ.
  doughnutTurningPoint(r0, E, L),// -> l_turn or null. null ⇒ doughnut traverses; else it
                                 //    stalls at sqrt(L²/(E²−1) − r0²) and bounces (same physics
                                 //    as the m-mode wave filter, but for a massive doughnut).
  // Tidal strain on the doughnut's geometry at proper-distance l, crossing at speed vFrac.
  // Returns DIMENSIONLESS strain factors used directly by the GL torus deform:
  //   stretch >1 along motion, squeeze <1 perpendicular, normalized so a comfortable
  //   crossing ≈ {radial:1.0, lateral:1.0} and spaghettification → radial≫1, lateral→0.
  doughnutTidalStrain(l, vFrac, r0), // -> { radial, lateral }
                                 //   radial  = 1 + K·|accel_local|        (stretch along path)
                                 //   lateral = 1 / (1 + K·|accel_local|)  (compression perp)
                                 //   accel_local = γ²·(vFrac·c)²·ξ_dough / r(l)²  (ξ_dough = 0.1 m)
                                 //   peaks at the throat (l=0). K tuned so a 1 m throat at 0.01c ≈ 1.
  // Survival verdict for an object of size xi crossing now. Powers the HUD readout for both
  // the doughnut (xi=0.1) AND a human (xi=2.0) — small throat ⇒ "SPAGHETTIFIED".
  doughnutSurvival(r0_m, vFrac, xi), // -> { accel_g, verdict: 'comfortable'|'survivable'|'lethal',
                                 //        minComfortR0_m }   // gated 1 g comfort / 10 g survival

  // --- self test (run at startup by integrator; log PASS/FAIL lines to console) ---
  selfTest()                     // -> { passed: bool, results: [{name, expected, actual, pass}] }
                                 // 1. straight-line limit: traceRay(8, 0.4, 0.001) deflection < 0.1°
                                 // 2. critical threshold: b = r0(1±0.02) at r0=1 land in opposite universes
                                 // 3. deflection regression: b = 3·r0 matches stored 6-decimal reference
                                 // 4. wave energy conservation: after 500 steps (m=0), sum ∈ [0.95, 1.0]
                                 //    (absorbing boundaries only after packet exits |l|>10)
                                 // 5. embeddingZ(0, r0) === 0 and d z/d l |₀ ... slope sanity
                                 // 6. doughnut: doughnutTurningPoint(1, 1.0, 0) === null (L=0 traverses);
                                 //    doughnutTidalStrain(0, v, r0).radial > strain at |l|=8 (peaks at throat)
};
```

Honesty note baked into the corrected potential: even m=0 sees a curvature bump of height
1/r0² at the throat, so very-low-frequency m=0 packets partially reflect. The default launch
(k = 4, energy ≫ bump) still transmits ≳95% — the flagship "m=0 passes, m=5 reflects" result
survives, now MORE honest. The wave-panel caption must say "m=0 passes at high frequency;
the throat's curvature term gives even m=0 a small barrier."

---

## 5. `js/wormhole-gl.js` → `window.WormholeGL`

WebGL2 raytracer. All GLSL in template strings inside this file. No DOM access except the
canvas handed to `init`. Depends on `WormholePhysics` only for the shared-constants comment
and (optionally) init-time cross-checks.

```js
window.WormholeGL = {
  init(canvas),                  // -> { ok: true } | { ok: false, reason: 'no-webgl2' | 'shader-compile' | ... }
                                 // Creates WebGL2 context, compiles program, builds attributeless
                                 // fullscreen triangle (gl_VertexID), allocates wave texture
                                 // (R32F 400×1; if EXT_color_buffer_float / OES_texture_float_linear
                                 // unavailable, fall back to NEAREST sampling — still fine).
  resize(cssW, cssH, dpr),
  render(state),                 // state = { r0, camL, yaw, pitch, fov = 1.2 [rad vertical],
                                 //           steps = 96 [32..192], exoticVis [0..1], waveVis [0..1], time,
                                 //           doughnut: { active, l, vFrac, radialStrain, lateralStrain } }
                                 // Draws one frame at internal resolution = canvas × resolutionScale.
                                 // When doughnut.active, raymarches the glazed torus SDF inside the same
                                 // geodesic loop so the doughnut is gravitationally LENSED near the throat
                                 // (its image bends with the spacetime). See §5.4.
  setDoughnut(d),                // d = { active, l, vFrac, radialStrain, lateralStrain } (uniforms).
                                 // strain factors come from WormholePhysics.doughnutTidalStrain — the
                                 // renderer multiplies the torus SDF axes by them (radial stretch / lateral
                                 // squeeze) so the Morris–Thorne tidal deformation is VISIBLE on the mascot.
  setWaveField(amp, lMin, lMax), // amp: Float32Array(400) from solver.amplitude. Upload each frame the wave runs.
  setResolutionScale(s),         // manual override; governor may change it (see below)
  getStats(),                    // -> { frameMsAvg, resolutionScale, stepsEffective }
  reseedSky(seedA, seedB),       // floats; re-derives the procedural sky hash offsets (uniforms, no bake)
  pixelToRay(px, py, state),     // CSS pixel -> { theta, b } for the SAME camera basis the shader uses.
                                 // CONTRACT: WormholePhysics.traceRay(state.camL, theta, state.r0)
                                 // must reproduce what that pixel shows. This is the inspector bridge —
                                 // implement camera basis ONCE in JS, mirror EXACTLY in the vertex/frag shader.
};
```

### 5.1 Shader integration strategy (the heart — read carefully)

Per pixel in the fragment shader:

1. **Camera ray.** From `yaw/pitch/fov` build world direction `d` (right-handed; camera sits
   on the l-axis embedding at radius-free abstract position — the camera state is just
   `camL` plus orientation; world frame: e_l = "outward +l" direction, two transverse axes).
2. **Plane reduction (spherical symmetry).** `e1` = unit vector along +l axis as seen at the
   camera; `e2 = normalize(d − dot(d,e1)·e1)`. Degenerate case `|d − (d·e1)e1| < 1e-5`
   (looking straight down the axis): set b = 0, ray is radial — handle explicitly to kill the
   axis seam.
3. **Initial state.** `l = camL`, `p = dot(d, e1)`, `phi = 0`,
   `b = sqrt(camL² + r0²) · dot(d, e2)` (conserved; E=1 normalization).
4. **Integrate** the second-order form (NO turning-point sign flips):
   `dl/dλ = p; dp/dλ = b²·l/(l²+r0²)²; dφ/dλ = b/(l²+r0²)`
   Fixed loop count = `uSteps` (uniform). **Adaptive step `dλ = h·sqrt(l²+r0²)`** with
   `h = H_TOTAL/uSteps` — resolution concentrates at the throat automatically. When
   `r0 < 0.3` scale the dλ floor by `r0` (prevents ring banding during collapse).
5. **Exit.** When `|l| > max(40·r0, 25)`: reconstruct world exit direction
   `u = e1·cosφ + e2·sinφ; v = −e1·sinφ + e2·cosφ; dir = normalize(p·u + (r·dφ/dλ)·v)`.
   Sample procedural sky A if `l > 0`, sky B if `l < 0`.
6. **Step-budget exhausted** (near-critical b ≈ r0): shade as the photon-ring glow color
   (warm white-amber). Code comment: "these rays are winding the unstable photon orbit at
   the throat — the glow IS the physics, not a hack." Never emit NaN; clamp everything.
7. **Volumetric accumulation inside the loop** (cheap adds, both honest visualizations):
   - **Exotic fog:** `emission += uExoticVis · |ρ(r)| · dλ` with
     `ρ = −r0²/(8π·r⁴)`, rendered dim violet. UI label (owned by UI module):
     "Exotic-matter visualization — the ρ<0 the Einstein equations require; rendered as glow
     for visibility; real exotic matter would be invisible."
   - **Wave shell:** `emission += uWaveVis · texture(uWaveTex, lToTex(l)).r ·` green tint —
     the m-mode packet appears as a luminous spherical shell at its actual l, piles up at the
     throat for m=5, sails through for m=0. `lToTex(l) = (l − lMin)/(lMax − lMin)` clamped.

### 5.2 Procedural skies (in-shader, zero fetches)

Function `vec3 sky(vec3 dir, float seed, int which)`:
- Hash-based cell-noise star placement on the direction sphere (3D grid cells of `dir·K`),
  brightness power-law, blackbody-tinted star colors (3-segment T→RGB polynomial).
- 3–4 octave value-noise FBM nebula.
- **Universe A:** sparse cool blue-white stars, thin teal nebula.
- **Universe B:** dense warm amber starfield, magenta/amber emission clouds + a bright
  "galactic band" (abs(dot(dir, bandAxis)) falloff) so it reads instantly as ELSEWHERE.
- Antialias stars with `fwidth`/smoothstep; accept residual shimmer on innermost ghost rings
  at 96 steps (HUD documents it; cubemap-with-mips bake is the stretch fix).

### 5.3 Tonemap

Simple in-shader: exposure + ACES-approx tonemap + 8-bit dither. (Full HDR FBO bloom chain
is STRETCH; do not build FBOs in v1 — keeps `EXT_color_buffer_float` out of the required set.)

### 5.4 The DOUGHNUT — raymarched, lensed, tidally deformed (required must-have)

The doughnut is the playground's traversable test object: a glazed torus, the house mascot.
"Send Doughnut" flings it through the wormhole on a real timelike geodesic (`camL` stays put;
the doughnut's `l` advances via `WormholePhysics.doughnutStepTimelike`) and the viewer watches
it cross — gravitationally lensed and tidally deformed.

Inside the SAME per-pixel geodesic loop (so the doughnut's image bends with the spacetime):

1. **Torus SDF.** `float sdTorus(vec3 p) = length(vec2(length(p.xz) - R, p.y)) - r;`
   with module consts `R` (major) `r` (minor). Place it in the local frame centered at the
   doughnut's current `l = u_dough_l` along the traversal path.
2. **Tidal deform (Morris–Thorne made visible).** Before the SDF eval, scale the sample point:
   `p.y /= u_dough_radial;  p.xz *= u_dough_lateral;` using the strain factors from
   `WormholePhysics.doughnutTidalStrain` (radial stretch along motion, lateral squeeze) — so a
   small throat visibly spaghettifies the doughnut. Strain peaks at the throat.
3. **Sample along the ray.** Because each pixel's ray is already an integrated geodesic in the
   `(l, φ)` plane, march the torus in that warped frame so the doughnut is **lensed** (its
   silhouette distorts near the ring). Cheapest correct approach for v1: evaluate the SDF at the
   ray's near-throat segment positions and composite by depth against the lensed background; the
   torus is small and local, so a short fixed-count sphere-trace (≈24 steps) along the segment
   nearest `l = u_dough_l` is enough.
4. **Glaze shading.** Warm pink-frosted base albedo `vec3(0.95, 0.72, 0.78)`, soft specular
   highlight (Blinn-Phong, tight), a darker dough rim where the torus tube faces away.
   **Sprinkles (optional, welcome):** hash the surface point → scattered short colored dashes.
5. **Honesty in the HUD (owned by UI):** live readout of whether the doughnut (ξ=0.1 m) and a
   human (ξ=2 m) survive the tides at the current r0 — small throat ⇒ "⚠ DOUGHNUT SPAGHETTIFIED
   (12 000 g)". This is Morris–Thorne's survivability criterion, not decoration.

The doughnut crossing is the signature shareable moment: press **Send Doughnut**, watch the
glazed torus stretch as it dives toward the throat, lens around the Einstein ring, and pop out
into Universe B's amber sky — every frame a solved Ellis geodesic.

**Fallback (only if the raymarched torus proves unbuildable):** draw a shaded doughnut on the
embedding-diagram surface (in `WormholePanels`) traversing the funnel with tidal squash-and-stretch.
Try the SDF first — torus SDFs are cheap and reliable.

### 5.8 Dynamic-resolution governor

Rolling 30-frame average of `performance.now()` deltas measured by `render()`. Below 50 fps:
`resolutionScale 1.0 → 0.75 → 0.5`, then `steps 96 → 64`. Above 58 fps for 120 frames: step
back up. Expose via `getStats()`; the UI HUD prints it (nothing hidden).

---

## 6. `js/wormhole-panels.js` → `window.WormholePanels`

Canvas-2D secondary visualizations — the surviving honest panels, ported and fixed.
Depends on `WormholePhysics` only.

```js
window.WormholePanels = {
  create({ crossSectionCanvas, waveCanvas, ledgerCanvas }) // -> panels object:
  // panels.resize()                                        // re-read parent rects × dpr
  // panels.renderCrossSection(state, overlay)
  //   state = { r0, m, camL }.
  //   Draws: side profile ±r(l) using TRUE embedding (x = l, y = ±r(l)) plus the isometric
  //   z(l) = r0·asinh(l/r0) profile as a second labeled curve ("isometric embedding — proper
  //   distance preserved"); |ρ(l)| shading under the throat; V_eff(l) curve for current m;
  //   throat marker; camera position tick at camL.
  //   overlay = null | result of WormholePhysics.traceRay (the inspector ray):
  //   draw a top-down inset (x = r·cosφ, y = r·sinφ; stroke hue = universe sheet, sign(l))
  //   showing the winding, plus the (l, r) polyline on the main profile; annotate
  //   b, deflection (deg), winding count, destination universe.
  // panels.renderWave(amp, lGrid, potentialArr, r0, m, trans)
  //   |ψ|² polyline + filled V_eff + throat marker; prints `T=..% R=..% (T+R=..) m=..`.
  // panels.renderLedger(budget, r0_m)
  //   Vertical log10 J/m³ axis. Rungs (labeled, with values, assumptions in the label):
  //   Casimir 4.3e-4 (1 µm plate gap) · TNT detonation ~1e10 · water mass-energy 9e19 ·
  //   neutron-star core ~5e34, then the computed requirement budget.rho_J_m3
  //   highlighted in red with "NEGATIVE" tag, and `budget.gapOrders` printed as
  //   "≈ N orders of magnitude above the Casimir effect". Both kg/m³ and J/m³ shown,
  //   c² conversion explicit. Jupiter counter line: `|E| ≈ {jupiters} M_Jup per this throat`.
};
```

(Ledger rung values are illustrative landmarks; builder must put the number AND the
assumption in the label — e.g. "Casimir, 1 µm plate gap". No unlabeled magic numbers.)

---

## 7. `js/wormhole-ui.js` → `window.WormholeUI`

DOM controls, HUD, pointer input, traverse animation, inspector orchestration, fallback
banner. Stretch: tour + audio live INSIDE this namespace (one global per file rule).
Depends on `WormholePhysics` (for labels/values) — talks to GL/panels only through the
integrator loop, never directly.

```js
window.WormholeUI = {
  init({ sidebarEl, hudEl, bannerEl, heroCanvas }) // builds all controls into sidebarEl -> ui:
  // ui.state   — SINGLE SOURCE OF TRUTH the integrator reads every frame:
  //   { r0, m, steps, exoticVis, waveVis,          // raytracer params
  //     exoticStrength, collapseRate, dynamicThroat,// stability toy
  //     scale_m,                                    // 1e-9 | 1 | 1e3 | 1e6 (meters per sim unit)
  //     camL, yaw, pitch, fov,                      // camera (drag-look + wheel dolly write here)
  //     waveLaunch: { l0, k, width },               // staged launch params (sliders)
  //     traverse: { active, t },                    // camera flythrough
  //     doughnut: { active, l, p, tau, vFrac,       // THE DOUGHNUT crossing state
  //                 radialStrain, lateralStrain },  //   (advanced each frame by ui.update)
  //     time }
  // ui.update(dt, info) — advance traverse easing (camL: +8r0 → −8r0 over 12 s,
  //   slow-in/slow-out; HONEST label rendered during flight: "radially infalling observer,
  //   eased proper velocity — metric is static so animating l + free-look is exact"),
  //   advance THE DOUGHNUT when state.doughnut.active: step its timelike geodesic via
  //   WormholePhysics.doughnutStepTimelike, recompute radial/lateralStrain via
  //   doughnutTidalStrain, push to WormholeGL.setDoughnut(...), and write the survival HUD
  //   line via doughnutSurvival for ξ=0.1 (doughnut) and ξ=2 (human); deactivate when l<−8r0,
  //   run stabilityStep when dynamicThroat, write HUD text.
  //   info = { stats: WormholeGL.getStats(), trans, budget, selfTest } (any may be null).
  //   HUD shows: l, r(l), ρ(r) at camera; at |l|<0.2: "r = r0 — you are in the throat.
  //   ρ = −1/(8πr0²) < 0: exotic matter is holding this open." ;
  //   resolutionScale + steps; collapse banner when r0 hits 0.05:
  //   "Throat collapsing — at r0→0 classical evolution ends. Topology change requires
  //   physics beyond GR (formation from flat space is impossible — see README)."
  // ui.pollActions() -> [{type:'launchWave'}|{type:'traverse'}|{type:'reseed'}|
  //                      {type:'sendDoughnut'}|                         // THE DOUGHNUT button
  //                      {type:'inspect', px, py}|{type:'resetThroat'}] (drained each call)
  //   'sendDoughnut' resets state.doughnut to { active:true, l:+8*r0, p:-|v|, tau:0,
  //    vFrac: state.doughnutSpeed } and the camera frames the throat to watch it cross.
  // ui.attachPointer(heroCanvas) — drag-to-look (yaw/pitch), wheel = dolly camL ∈ [−20,20],
  //   click (no drag) emits 'inspect'. Pointer routing: hero canvas owns look/inspect;
  //   panel canvases own nothing in v1 (slingshot is stretch).
  // ui.setInspector(result|null) — renders b, deflection°, winding, universe text card.
  // ui.showFallback(reason) — styled banner + hides hero canvas, panels become the experience.
  // ui.setSelfTest(report) — green "physics self-test: 5/5 PASS" chip or red FAIL detail.
};
```

### UI layout

```
┌──────────────────────────────────────────────────────────────┐
│ header: WORMHOLE PHYSICS PLAYGROUND   [Send Doughnut] [Traverse] [Tour*]│
├───────────┬──────────────────────────────────────┬───────────┤
│ sidebar   │                                      │ inspector │
│ (controls)│        HERO WebGL canvas             │ rail      │
│ r0 ────   │   (drag-look · wheel dolly ·         │ ┌────────┐│
│ m  ────   │    click a pixel to trace it)        │ │cross-  ││
│ steps ──  │                                      │ │section ││
│ exotic ─  │  HUD (bottom-left): l, r(l), ρ(r),   │ ├────────┤│
│ vis ────  │  res scale, steps, self-test chip    │ │wave    ││
│ [Launch]  │                                      │ │plot    ││
│ [Cut      │                                      │ ├────────┤│
│  exotic]  │                                      │ │ledger  ││
│ scale sel │                                      │ └────────┘│
├───────────┴──────────────────────────────────────┴───────────┤
│ footer: ds² = −dt² + dl² + (l²+r0²)dΩ²  ·  r(l)=√(l²+r0²)  · │
│         ρ = −r0²/(8πr⁴) < 0 (exotic)                         │
└──────────────────────────────────────────────────────────────┘
```

Inspector rail collapsible; mobile = stacked (hero on top). Keep the existing dark
aesthetic (#0a0a12 bg, #4facfe accent) — brand continuity.

---

## 8. Honesty fixes & deletions (acceptance-gated)

| # | Item | Action |
|---|------|--------|
| 1 | `KerrMetric.ergosphereRadius` (Kerr BH formula, phantom M=1) | DELETE. No rotation in v1. |
| 2 | `KerrMetric.hasCTC` hardcoded threshold | DELETE, with the CTC preset/warning. |
| 3 | "TIME RUNNING BACKWARDS" reversed clock | DELETE. Proper time is monotonic on every worldline. |
| 4 | `effectivePotential = m²/r²` drops curvature term | FIX: `m(m+1)/(l²+r0²) + r0²/(l²+r0²)²`. |
| 5 | Embedding uses z = l (not isometric) | FIX: `z = r0·asinh(l/r0)`, labeled "isometric embedding". |
| 6 | `getTransmission` hardcodes left = transmission | FIX: use recorded launch side; report T+R. |
| 7 | Stability ODE invented forces | KEEP but LABEL: "pedagogical toy in the spirit of stability.py; the static Ellis throat is genuinely unstable (González–Guzmán–Sarbach 2009)". |
| 8 | ER=EPR 50% step-function toy | OUT of v1; stretch annex with amber "conjecture toy" framing. |
| 9 | README 10⁴³ kg/m³ vs closed form | Ledger computes live; both units; scale selector covers both regimes (§2). |

---

## 9. Integrator contract — playground.html main loop

```js
// after the four <script src> tags, DOMContentLoaded:
const report = WormholePhysics.selfTest();           // log lines; ui.setSelfTest(report)
const solver = WormholePhysics.makeWaveSolver({});
const glOk   = WormholeGL.init(heroCanvas);
const panels = WormholePanels.create({...});
const ui     = WormholeUI.init({...});
if (!glOk.ok) ui.showFallback(glOk.reason);
function frame(tNow) {
  const dt = clamp(tNow - tPrev);
  for (const a of ui.pollActions()) { /* launchWave -> solver.launch(...m: ui.state.m);
       traverse -> ui handles internally; sendDoughnut -> ui handles internally (sets
         ui.state.doughnut.active; ui.update advances it + calls WormholeGL.setDoughnut);
       reseed -> WormholeGL.reseedSky;
       inspect -> { const {theta} = WormholeGL.pixelToRay(a.px, a.py, ui.state);
                    const r = WormholePhysics.traceRay(ui.state.camL, theta, ui.state.r0);
                    ui.setInspector(r); overlay = r; } */ }
  if (waveRunning) { solver.step(0.02, ui.state.r0, 5);
                     WormholeGL.setWaveField(solver.amplitude, -12, 12); }
  ui.update(dt, { stats: glOk.ok ? WormholeGL.getStats() : null,
                  trans: solver.getTransmission(),
                  budget: WormholePhysics.budget(ui.state.r0 * ui.state.scale_m) });
  if (glOk.ok) WormholeGL.render(ui.state);
  panels.renderCrossSection(ui.state, overlay);
  panels.renderWave(solver.amplitude, solver.lGrid, solver.potential(ui.state.r0, ui.state.m),
                    ui.state.r0, ui.state.m, solver.getTransmission());
  panels.renderLedger(budget, ui.state.r0 * ui.state.scale_m);
  requestAnimationFrame(frame);
}
```

Resize: window listener calls `WormholeGL.resize`, `panels.resize()`.

---

## 10. Stretch: guided tour script (5 stops, only if must-haves are green)

Implemented inside `WormholeUI` as a declarative array `{title, caption, setup(ui.state), advance}`;
typed-monospace lower-third captions; Continue/Skip always visible. Verdict stamps quote the
README results table.

1. **THE WINDOW** — camera at l=8r0 facing throat. "A black hole eats light. A wormhole is a
   window. Every pixel here is an RK4-integrated null geodesic of ds² = −dt² + dl² + (l²+r0²)dΩ²."
2. **TRAVERSE** — fires the traverse animation. Stamp: "✅ Geodesic traversal: works."
3. **THE FILTER** — launches m=0 then m=5 (waveVis up). Stamp: "✅ Angular-momentum filtering:
   robust. Pure geometry."
4. **THE COLLAPSE** — exoticStrength→0, dynamicThroat on; ring chokes shut. Stamp:
   "⚠️ Stability: conditional. Remove the exotic matter → collapse."
5. **THE WALL** — pans to ledger, scrolls the rungs, hands over the r0 slider ("shrinking it
   makes it WORSE — ρ ∝ 1/r0²; there is no slider position that closes the gap"). Stamp:
   "❌ Exotic-matter budget: tens of orders of magnitude short. ❌ Formation from flat space:
   impossible classically — exotic matter deforms spacetime; it cannot change its topology."

Stretch audio (inside WormholeUI, AudioContext created on first user gesture): two
"microphones" at l=±8 sampling solver.amplitude driving gains on a 220 Hz triangle
(transmission audible on the far side); collapse rumble gain ∝ |dr0/dt|. Mute toggle.

---

## 11. Acceptance checklist

- [ ] Double-click playground.html from disk (file://) → renders, zero console errors, zero network requests.
- [ ] Self-test chip shows 5/5 PASS; console logs each assertion.
- [ ] Einstein ring visible at default state; universe B's amber sky inside it, clearly alien.
- [ ] TRAVERSE: B inflates, A collapses to a ring behind (drag to look back mid-flight works).
- [ ] SEND DOUGHNUT: glazed torus crosses the throat, lensed near the ring, visibly tidally
      deformed (stretch/squeeze); HUD reports doughnut + human survival; small r0 ⇒ "SPAGHETTIFIED".
- [ ] m=0 launch: shell sails through (T ≳ 90%); m=5: visible pile-up + reflection (T ≲ 10%); T+R ≈ 1.
- [ ] Cut exotic → ring pinches shut, clamps at r0=0.05 with the honest banner.
- [ ] Click a pixel near the ring → inspector shows winding ≥ 1 and the polyline hugs the throat.
- [ ] Ledger: 1 m scale shows ≈1.1 M_Jup and ≈47 orders; 1 nm scale shows ≈10⁴³ kg/m³ and ≈64 orders.
- [ ] Disable WebGL (browser flag) → styled banner + panels-only experience, no crash.
- [ ] Governor: forced 4K window stays ≥30 fps with HUD showing the reduced scale.
- [ ] No Kerr/CTC/backwards-clock code anywhere in the new tree.
```
