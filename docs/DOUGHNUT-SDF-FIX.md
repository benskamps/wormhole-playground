# The Doughnut: SDF blob fix (2026-06-19)

The "Send Doughnut" throat-crossing — the playground's signature shareable
moment, where the mascot doughnut falls through the wormhole throat,
gravitationally lensed and tidally deformed — was gated off in prod behind
`DOUGHNUT_COMING_SOON = true` (`js/wormhole-ui.js`). Near the throat it rendered
a full-screen pixelated pink blob. This note records the root cause and the fix,
and the gate is now **off** (`DOUGHNUT_COMING_SOON = false`).

## Symptom

When the doughnut neared the throat (`l -> 0`), the whole frame filled with a
flat, pixelated pink wash instead of a lensed glazed torus.

## Root cause: an anisotropically-scaled SDF is no longer a valid distance

The doughnut is drawn by a per-pixel sphere-trace of a torus signed-distance
function, `sdTorus` in `js/wormhole-gl.js`. To show the Morris-Thorne tidal
deform it scales space before measuring distance:

```glsl
p.z /= uDoughRadial;    // stretch along motion
p.x *= uDoughLateral;   // squeeze transverse
vec2 q = vec2(length(p.xz) - DOUGH_R, p.y);
return length(q) - DOUGH_r;   // <-- distance in DEFORMED space
```

`length(q) - r` is only a true distance in **un-scaled** space. Once you scale a
coordinate non-uniformly, the returned value measures distance in the *deformed*
frame, and in real space it **over-estimates** the true distance by up to
`max(uDoughRadial, 1/uDoughLateral)`.

The tidal strain is computed in `WormholePhysics.doughnutTidalStrain` and peaks
at the throat (where `r(l)` is minimized). Measured magnitudes:

| condition                | radial (`uDoughRadial`) | lateral (`uDoughLateral`) |
|--------------------------|-------------------------|---------------------------|
| far (`l = 8 r0`), 0.02c  | ~1.06                   | ~0.94                     |
| throat (`l = 0`), 0.02c  | ~5.0                    | ~0.20                     |
| throat (`l = 0`), 0.1c   | ~102                    | ~0.0098                   |
| throat, small throat r0  | ~100                    | ~0.01                     |

So near the throat the SDF over-estimates distance by **5x to ~100x**. A sphere
tracer that trusts an over-estimate takes giant steps and **tunnels straight
through the thin torus tube** without ever satisfying the `dist < 0.006` hit
test. Worse, `doughNormal` estimates the normal by central differences of the
same broken SDF, so when a near-miss does register, the normal explodes ->
garbage shading -> the pixelated blob.

This was verified by replicating the GLSL sphere-trace in Node: at the throat
(radial=5, lateral=0.2) the ray flew clean past the surface (final position well
past the far side, closest approach ~0.075, never within the 0.006 threshold);
at 0.1c it tunnelled in ~6 giant steps.

## The fix (three parts)

1. **Lipschitz correction in `sdTorus`** (`js/wormhole-gl.js`). Divide the
   returned distance by the largest stretch of the inverse map so the SDF is a
   conservative under-estimate again and the trace cannot overshoot:
   ```glsl
   float lip = max(max(uDoughRadial, 1.0 / max(uDoughLateral, 1e-3)), 1.0);
   return d / lip;
   ```
   This alone stops the throat tunnelling.

2. **Visual-only strain clamp** (`setUniforms` in `js/wormhole-gl.js`). The
   honest strain (radial up to ~100, lateral down to ~0.01) would shrink the
   glazed tube to a sub-pixel sliver and read as noise even with a correct SDF.
   The render deform is clamped to a recognizable range
   (`DOUGH_STRAIN_MAX = 2.2`, `DOUGH_STRAIN_MIN = 0.45`) so the doughnut still
   *looks* like a doughnut while it visibly deforms. **The survival HUD
   (`doughnutSurvival` / `tidal()`) uses the UNCLAMPED physics** — this changes
   pixels, not the ledger.

3. **Near-camera fade** (composite in `js/wormhole-gl.js`). Independently of the
   throat blob, the doughnut spawns on the camera's flight path and passes
   point-blank through the camera plane, which briefly filled the frame with the
   flat unlit pink underside. The composite now fades the doughnut out within
   ~1 sim unit of the camera (`smoothstep(0.35, 1.25, |uDoughL - uCamL|)`) so it
   approaches from depth and emerges past the lens cleanly.

## Verification

Headless WebGL2 (SwiftShader) crossing, sampling the hero canvas every frame
from spawn (`l = 8 r0`) through the throat (`l = 0`) to exit:

- Physics self-test chip: **7/7 PASS** (unchanged).
- No console errors / no shader compile failure across the whole crossing.
- Whole-frame pink fraction stays in the healthy 0.001-0.12 band with real
  saturation/detail throughout the throat passage. The previous
  `pink = 1.0, saturation = 0` full-frame-blob frames are gone.
- Throat screenshot shows the lensed concentric ring structure + deformed
  glazed torus, not a blob.

Re-gate kill-switch: set `DOUGHNUT_COMING_SOON = true` in `js/wormhole-ui.js`.
