/* ============================================================================
 * wormhole-gl.js  →  window.WormholeGL   (and ONLY window.WormholeGL)
 * ----------------------------------------------------------------------------
 * WebGL2 raytracer for the Ellis wormhole playground.
 *
 * One window-global per file (hard constraint). This file touches nothing
 * global except `window.WormholeGL`. All GLSL lives in JS template strings.
 * No DOM access except the <canvas> handed to init(). No network fetches,
 * no ES modules — classic <script src> only (file:// must double-click work).
 *
 * Depends on: window.WormholePhysics (for the shared-constants cross-check and
 *             the pixelToRay/traceRay camera-basis contract). Optional at init.
 *
 * ============================================================================
 * SHARED GEODESIC CONTRACT — this GLSL mirrors WormholePhysics.traceRay
 * CONSTANT-FOR-CONSTANT. If you change one, change BOTH.
 *
 *   metric:        ds² = -dt² + dl² + (l²+r0²)dΩ²        (Φ=0 Ellis drainhole)
 *   r(l)         = sqrt(l*l + r0*r0)
 *   conserved b  = sqrt(camL*camL + r0*r0) * dot(d, e2)   (E=1 normalization)
 *   p0           = dot(d, e1)
 *   RK4 state    = (l, p, phi):
 *       dl/dλ  = p
 *       dp/dλ  = b*b*l / (l*l + r0*r0)^2
 *       dφ/dλ  = b / (l*l + r0*r0)
 *   step rule    = dλ = h * sqrt(l*l + r0*r0),  h = H_TOTAL / uSteps
 *   H_TOTAL      = 22.0  (total affine budget; concentrates near the throat)
 *   exit         = |l| > max(40*r0, 25)
 *   exit dir     = u = e1*cosφ + e2*sinφ ;  v = -e1*sinφ + e2*cosφ
 *                  dir = normalize(p*u + (r*dφ/dλ)*v)
 *   sky select   = l>0 -> Universe A ; l<0 -> Universe B
 *   ring         = step budget exhausted with |l| small (b≈r0) -> photon-ring glow
 * ============================================================================
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ shared
  // These MUST match wormhole-physics.js. Kept here so the shader and the JS
  // camera basis (pixelToRay) agree to the bit with the CPU mirror.
  var H_TOTAL = 22.0; // total affine budget for the geodesic loop

  // -------------------------------------------------------------- GLSL: vert
  // Attributeless full-screen triangle via gl_VertexID. No buffers, no attribs.
  var VERT_SRC = '#version 300 es\n' + [
    'precision highp float;',
    'void main() {',
    '  // oversized triangle covering clip [-1,1]: clip verts (-1,-1) (3,-1) (-1,3)',
    '  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));',
    '  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);',
    '}'
  ].join('\n');

  // -------------------------------------------------------------- GLSL: frag
  var FRAG_SRC = '#version 300 es\n' + [
    'precision highp float;',
    '',
    'out vec4 fragColor;       // uses gl_FragCoord.xy for per-pixel coords',
    '',
    '// ---- uniforms (camera + state) ----',
    'uniform vec2  uRes;       // internal render resolution (px)',
    'uniform float uR0;        // throat radius (sim units)',
    'uniform float uCamL;      // camera position on l-axis',
    'uniform float uYaw;       // radians',
    'uniform float uPitch;     // radians',
    'uniform float uFov;       // vertical fov (radians)',
    'uniform float uSteps;     // geodesic loop iterations (float for division)',
    'uniform float uTime;',
    'uniform float uExoticVis; // 0..1',
    'uniform float uWaveVis;   // 0..1',
    'uniform float uHTotal;    // total affine budget (=H_TOTAL)',
    '',
    '// ---- sky reseed offsets ----',
    'uniform float uSeedA;',
    'uniform float uSeedB;',
    '',
    '// ---- wave field (R32F 400x1) ----',
    'uniform sampler2D uWaveTex;',
    'uniform float uWaveLMin;',
    'uniform float uWaveLMax;',
    '',
    '// ---- doughnut ----',
    'uniform float uDoughActive;  // 0/1',
    'uniform float uDoughL;       // current l of doughnut center',
    'uniform float uDoughVFrac;',
    'uniform float uDoughRadial;  // tidal stretch  (>=1)',
    'uniform float uDoughLateral; // tidal squeeze  (<=1)',
    '',
    'const float PI = 3.14159265358979;',
    '',
    '// ============================ hashing ============================',
    'float hash11(float p){',
    '  p = fract(p * 0.1031);',
    '  p *= p + 33.33;',
    '  p *= p + p;',
    '  return fract(p);',
    '}',
    'float hash31(vec3 p3){',
    '  p3 = fract(p3 * 0.1031);',
    '  p3 += dot(p3, p3.zyx + 31.32);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'vec3 hash33(vec3 p3){',
    '  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));',
    '  p3 += dot(p3, p3.yxz + 33.33);',
    '  return fract((p3.xxy + p3.yxx) * p3.zyx);',
    '}',
    '',
    '// ============================ value noise / FBM ============================',
    'float vnoise(vec3 x){',
    '  vec3 i = floor(x);',
    '  vec3 f = fract(x);',
    '  f = f*f*(3.0-2.0*f);',
    '  float n000 = hash31(i + vec3(0,0,0));',
    '  float n100 = hash31(i + vec3(1,0,0));',
    '  float n010 = hash31(i + vec3(0,1,0));',
    '  float n110 = hash31(i + vec3(1,1,0));',
    '  float n001 = hash31(i + vec3(0,0,1));',
    '  float n101 = hash31(i + vec3(1,0,1));',
    '  float n011 = hash31(i + vec3(0,1,1));',
    '  float n111 = hash31(i + vec3(1,1,1));',
    '  float nx00 = mix(n000, n100, f.x);',
    '  float nx10 = mix(n010, n110, f.x);',
    '  float nx01 = mix(n001, n101, f.x);',
    '  float nx11 = mix(n011, n111, f.x);',
    '  float nxy0 = mix(nx00, nx10, f.y);',
    '  float nxy1 = mix(nx01, nx11, f.y);',
    '  return mix(nxy0, nxy1, f.z);',
    '}',
    'float fbm(vec3 x){',
    '  float v = 0.0;',
    '  float a = 0.5;',
    '  for (int i = 0; i < 4; i++) {',
    '    v += a * vnoise(x);',
    '    x = x * 2.02 + vec3(11.3, 7.1, 5.7);',
    '    a *= 0.5;',
    '  }',
    '  return v;',
    '}',
    '',
    '// ============================ colour helpers ============================',
    '// 3-segment T->RGB approximation; t in [0,1] cool->warm.',
    'vec3 starTint(float t){',
    '  vec3 cool = vec3(0.66, 0.78, 1.00);  // blue-white',
    '  vec3 mid  = vec3(1.00, 0.97, 0.92);  // white',
    '  vec3 warm = vec3(1.00, 0.74, 0.46);  // amber',
    '  if (t < 0.5) return mix(cool, mid, t * 2.0);',
    '  return mix(mid, warm, (t - 0.5) * 2.0);',
    '}',
    '// heat ramp for the photon ring: deep ember -> ember -> gold -> white-hot.',
    '// Visual only (the ring brightness itself comes from the integration).',
    'vec3 heatRamp(float t){',
    '  t = clamp(t, 0.0, 1.0);',
    '  vec3 c0 = vec3(0.30, 0.04, 0.02);',
    '  vec3 c1 = vec3(0.98, 0.36, 0.08);',
    '  vec3 c2 = vec3(1.00, 0.70, 0.32);',
    '  vec3 c3 = vec3(1.00, 0.95, 0.86);',
    '  if (t < 0.33) return mix(c0, c1, t / 0.33);',
    '  if (t < 0.70) return mix(c1, c2, (t - 0.33) / 0.37);',
    '  return mix(c2, c3, (t - 0.70) / 0.30);',
    '}',
    '',
    '// ============================ stars ============================',
    '// Fine dust: one star per lit cell, kept inside the cell so only the own',
    '// cell is sampled (cheap enough to run several layers per pixel).',
    'vec3 dustStars(vec3 dir, float density, float thresh, float seed, float tintBias, float tintSpan){',
    '  vec3 g = dir * density;',
    '  vec3 cell = floor(g);',
    '  vec3 f = fract(g);',
    '  float h = hash31(cell + seed);',
    '  if (h < thresh) return vec3(0.0);',
    '  vec3 sp = 0.25 + 0.5 * hash33(cell + seed + 1.7);',
    '  float d = length(f - sp);',
    '  float mag = pow(hash31(cell + seed + 4.3), 3.0);',
    '  float core = exp(-d * d * 160.0);',
    '  float tw = 0.85 + 0.15 * sin(uTime * (0.6 + 2.0 * h) + h * 40.0);   // slow scintillation',
    '  return core * (0.18 + 1.4 * mag) * tw * starTint(tintBias + tintSpan * hash31(cell + seed + 2.0));',
    '}',
    '// Bright stars with a soft halo and faint 4-point flare; samples neighbours',
    '// so halos cross cell borders cleanly.',
    'vec3 brightStars(vec3 dir, float density, float thresh, float seed, float tintBias, float tintSpan){',
    '  vec3 g = dir * density;',
    '  vec3 cell = floor(g);',
    '  vec3 f = fract(g);',
    '  vec3 acc = vec3(0.0);',
    '  for (int dx = -1; dx <= 1; dx++)',
    '  for (int dy = -1; dy <= 1; dy++)',
    '  for (int dz = -1; dz <= 1; dz++){',
    '    vec3 off = vec3(float(dx), float(dy), float(dz));',
    '    vec3 c = cell + off;',
    '    float h = hash31(c + seed);',
    '    if (h > thresh) {',
    '      vec3 sp = off + hash33(c + seed + 1.7);',
    '      vec3 dv = f - sp;',
    '      float d = length(dv);',
    '      float mag = pow(hash31(c + seed + 4.3), 4.0);',
    '      vec3 tint = starTint(tintBias + tintSpan * hash31(c + seed + 2.0));',
    '      float core = exp(-d * d * 900.0) * 2.2;',
    '      float halo = exp(-d * 9.0) * 0.10 * (0.3 + mag);',
    '      // flare along two fixed world axes; tapered so it never draws a grid',
    '      float fl = exp(-abs(dv.x) * 140.0) * exp(-abs(dv.y) * 9.0)',
    '               + exp(-abs(dv.y) * 140.0) * exp(-abs(dv.x) * 9.0);',
    '      acc += tint * ((core + halo) * (0.35 + mag) + fl * 0.18 * mag);',
    '    }',
    '  }',
    '  return acc;',
    '}',
    '',
    '// ============================ nebula ============================',
    '// Domain-warped FBM: filaments rather than blobs.',
    'float warpNeb(vec3 p, out vec3 q){',
    '  q = vec3(fbm(p), fbm(p + vec3(5.2, 1.3, 2.8)), fbm(p + vec3(1.7, 9.2, 3.4)));',
    '  return fbm(p + 1.9 * q);',
    '}',
    '',
    '// ============================ graticule (Universe A only) ============================',
    '// A faint survey grid on our own sky, polar about the throat axis (+/-l):',
    '// rings every 10 deg, spokes every 15 deg. It is drawn on the EXIT direction,',
    '// so the lensing bends it; where the map from pixel to sky gets violent (near',
    '// the photon ring) the lines fade out instead of aliasing. Called from main()',
    '// in uniform control flow because it uses screen-space derivatives.',
    'float graticule(vec3 dir){',
    '  float th = acos(clamp(dir.z, -1.0, 1.0));',
    '  float ph = atan(dir.y, dir.x);',
    '  vec2 g = vec2(th / (PI / 18.0), ph / (PI / 12.0));',
    '  vec2 w = fwidth(g);',
    '  vec2 dist = abs(fract(g - 0.5) - 0.5);',
    '  vec2 line = 1.0 - smoothstep(vec2(0.0), max(w * 1.25, vec2(1e-4)), dist);',
    '  vec2 fade = 1.0 - smoothstep(vec2(0.06), vec2(0.35), w);',
    '  float pole = smoothstep(0.05, 0.45, sin(th));',
    '  return max(line.x * fade.x, line.y * fade.y * pole);',
    '}',
    '',
    '// which: 0 = Universe A (our side: cold, surveyed, sparse),',
    '//        1 = Universe B (through the throat: warm, dense, a galaxy edge-on)',
    'vec3 sky(vec3 dir, float seed, int which){',
    '  dir = normalize(dir);',
    '  vec3 col;',
    '  if (which == 0) {',
    '    // ---- Universe A: deep indigo, slate-teal filaments, dark dust ----',
    '    col = vec3(0.004, 0.006, 0.013);',
    '    vec3 q;',
    '    float n = warpNeb(dir * 1.7 + seed, q);',
    '    float fil = smoothstep(0.36, 0.78, n);',
    '    vec3 nebC = mix(vec3(0.015, 0.060, 0.085), vec3(0.070, 0.150, 0.175), clamp(q.x * 1.4 - 0.2, 0.0, 1.0));',
    '    nebC = mix(nebC, vec3(0.150, 0.095, 0.050), smoothstep(0.55, 0.80, q.z) * 0.55);  // brass dust glints',
    '    col += nebC * fil * 1.45;',
    '    col += vec3(0.016, 0.026, 0.042) * smoothstep(0.30, 0.70, q.y);                   // broad cold glow',
    '    float dust = smoothstep(0.48, 0.70, fbm(dir * 5.0 + q * 1.3 + seed + 3.1));',
    '    vec3 stars = dustStars(dir, 90.0, 0.55, seed, 0.05, 0.55) * 0.55',
    '               + dustStars(dir, 46.0, 0.72, seed + 3.3, 0.0, 0.7)',
    '               + brightStars(dir, 9.0, 0.80, seed + 9.1, 0.0, 0.75);',
    '    col += stars * mix(1.0, 0.35, dust * fil);',
    '    col *= mix(1.0, 0.55, dust * fil);',
    '  } else {',
    '    // ---- Universe B: ember galaxy seen edge-on, gold core, rose emission ----',
    '    col = vec3(0.030, 0.012, 0.010);',
    '    vec3 bandAxis = normalize(vec3(0.2, 1.0, 0.35));',
    '    float lat = dot(dir, bandAxis);',
    '    vec3 q;',
    '    float n = warpNeb(dir * 2.4 + seed + 7.7, q);',
    '    float band = exp(-lat * lat * 26.0);',
    '    float bulge = exp(-lat * lat * 70.0) * pow(max(dot(dir, normalize(vec3(0.9, -0.18, -0.4))), 0.0), 6.0);',
    '    float lane = smoothstep(0.035, 0.0, abs(lat + 0.03 * (q.x - 0.5))) * smoothstep(0.35, 0.65, n);  // dark mid-plane lane',
    '    vec3 bandC = mix(vec3(0.85, 0.42, 0.16), vec3(1.0, 0.80, 0.52), q.y);',
    '    col += band * (0.35 + 0.65 * n) * bandC * 1.25;',
    '    col += bulge * vec3(1.0, 0.84, 0.60) * 1.4;',
    '    float emis = smoothstep(0.50, 0.85, n) * (0.4 + band);',
    '    col += emis * mix(vec3(0.30, 0.06, 0.12), vec3(0.45, 0.16, 0.06), q.z) * 1.1;      // rose / ember clouds',
    '    vec3 stars = dustStars(dir, 110.0, 0.40, seed, 0.45, 0.55) * (0.5 + 1.5 * band)',
    '               + dustStars(dir, 52.0, 0.62, seed + 5.5, 0.4, 0.6)',
    '               + brightStars(dir, 11.0, 0.76, seed + 2.2, 0.35, 0.65);',
    '    col += stars;',
    '    col *= 1.0 - 0.75 * lane;',
    '  }',
    '  return col;',
    '}',
    '',
    '// ============================ wave field sample ============================',
    'float lToTex(float l){',
    '  return clamp((l - uWaveLMin) / (uWaveLMax - uWaveLMin), 0.0, 1.0);',
    '}',
    'float waveAt(float l){',
    '  return texture(uWaveTex, vec2(lToTex(l), 0.5)).r;',
    '}',
    '',
    '// ============================ doughnut SDF ============================',
    '// Torus in local frame: major R, minor r.',
    'const float DOUGH_R = 0.85;  // major radius (sim units)',
    'const float DOUGH_r = 0.34;  // minor radius',
    'float sdTorus(vec3 p){',
    '  // Local frame: x = transverse (this pixel\'s orbital-plane axis),',
    '  //              z = along motion (l - centerL),  y = out of the slice plane.',
    '  // The doughnut flies face-on: disk in the x-y plane, hole-axis along z',
    '  // (= l). Every pixel plane contains the l axis, so its y=0 slice cuts the',
    '  // ring through both sides of the tube and the hole stays open in the',
    '  // centre. (Until 2026-10 the axis sat along y, which made the union of',
    '  // slices a closed shell that read as a pink ball, not a doughnut.)',
    '  // Tidal deform (Morris-Thorne, VISIBLE): stretch along motion (z),',
    '  // squeeze transverse (x) — both live in the slice plane so they show.',
    '  p.z /= uDoughRadial;        // radial stretch along the direction of motion',
    '  p.x *= uDoughLateral;       // lateral squeeze perpendicular to motion',
    '  vec2 q = vec2(length(p.xy) - DOUGH_R, p.z);',
    '  float d = length(q) - DOUGH_r;',
    '  // --- Lipschitz correction (THIS is the old full-screen-blob fix) ---',
    '  // The anisotropic deform above measures distance in DEFORMED space. For a',
    '  // safe sphere-trace in REAL space the step must never exceed the true',
    '  // distance, so divide by the largest stretch of the inverse map. Stretching',
    '  // z by uDoughRadial and squeezing x by uDoughLateral both make deformed',
    '  // distance OVER-estimate real distance by up to max(radial, 1/lateral);',
    '  // without this, the tracer takes giant steps, tunnels through the thin tube,',
    '  // misses the hit test, and doughNormal central-differences explode into a',
    '  // pixelated blob. (Uniforms are also clamped JS-side to keep the deform',
    '  // recognizable; this guard makes the SDF robust even if they were not.)',
    '  float lip = max(max(uDoughRadial, 1.0 / max(uDoughLateral, 1e-3)), 1.0);',
    '  return d / lip;',
    '}',
    '// glazed-doughnut shading, in a 3D frame rebuilt from the pixel\'s slice:',
    '// the disk lies in x-y (screen plane), its axis along z (= l). pl = point,',
    '// n = normal, rd = ray dir, all in that frame. face = +1 on the side that',
    '// faces the camera, so the frosted top is the face you see.',
    '// rimCol is the warm photon-ring light wrapping the silhouette.',
    'vec3 doughShade(vec3 pl, vec3 n, vec3 rd, vec3 lightDir, vec3 rimCol, float face){',
    '  pl = vec3(pl.xy * uDoughLateral, pl.z / uDoughRadial);   // undo the tidal deform: shade the undeformed doughnut',
    '  float rad = length(pl.xy);',
    '  float ty = pl.z * face;                            // height across the tube, + toward camera',
    '  float ang = atan(pl.y, pl.x);',
    '  // frosting covers the top with a drippy lower edge',
    '  float drip = 0.055 * sin(ang * 7.0 + 0.6) + 0.035 * sin(ang * 13.0 + 2.1) + 0.02 * sin(ang * 23.0);',
    '  float frost = smoothstep(-0.11, -0.03, ty + drip);',
    '  // the glaze stops short of the hole, leaving a ring of bare dough inside',
    '  frost *= smoothstep(DOUGH_R - DOUGH_r * 1.02, DOUGH_R - DOUGH_r * 0.82, rad + drip * 0.25);',
    '  // baked dough: golden, darker toward the underside, a pale proof band at the edge',
    '  vec3 dough = mix(vec3(0.46, 0.24, 0.11), vec3(0.86, 0.56, 0.30), smoothstep(-0.34, -0.02, ty));',
    '  dough = mix(dough, vec3(0.93, 0.80, 0.58), smoothstep(0.035, 0.0, abs(ty + drip + 0.075)) * 0.6);',
    '  vec3 glaze = vec3(0.97, 0.56, 0.68);',
    '  vec3 albedo = mix(dough, glaze, frost);',
    '  // soft wrap diffuse (dough scatters light) and hole occlusion',
    '  float wrap = max((dot(n, lightDir) + 0.4) / 1.4, 0.0);',
    '  float ao = mix(0.28, 1.0, smoothstep(DOUGH_R - DOUGH_r, DOUGH_R - 0.05, rad));',
    '  vec3 col = albedo * (0.16 * ao + 0.95 * wrap * mix(0.8, 1.0, ao));',
    '  // warm subsurface glow on the dough where light grazes',
    '  col += (1.0 - frost) * vec3(0.30, 0.10, 0.03) * pow(1.0 - abs(dot(n, lightDir)), 3.0) * 0.5;',
    '  // fresnel rim from the photon ring behind it',
    '  float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.5);',
    '  col += rimCol * fres * (0.35 + 0.65 * frost);',
    '  // glaze: one sharp highlight + broad sheen',
    '  vec3 h = normalize(lightDir - rd);',
    '  float nh = max(dot(n, h), 0.0);',
    '  col += frost * (vec3(1.0) * pow(nh, 160.0) * 0.75 + vec3(1.0, 0.85, 0.9) * pow(nh, 18.0) * 0.06);',
    '  // sprinkles: short rods scattered over the frosting only',
    '  vec3 sg = pl * 16.0;',
    '  vec3 sc = floor(sg);',
    '  vec3 sf = fract(sg) - 0.5;',
    '  vec3 hs = hash33(sc + 3.7);',
    '  if (hs.x > 0.42 && frost > 0.6) {',
    '    vec3 ax = normalize(hash33(sc + 9.1) - 0.5);',
    '    float t = clamp(dot(sf, ax), -0.30, 0.30);',
    '    float dd = length(sf - ax * t);',
    '    float rod = smoothstep(0.13, 0.08, dd);',
    '    vec3 sprColors[5] = vec3[5](',
    '      vec3(0.95, 0.24, 0.28), vec3(0.32, 0.58, 0.96), vec3(0.99, 0.86, 0.30),',
    '      vec3(0.42, 0.84, 0.48), vec3(0.98, 0.97, 0.94));',
    '    int idx = int(hs.y * 5.0);',
    '    idx = idx > 4 ? 4 : idx;',
    '    vec3 sc3 = sprColors[idx] * (0.25 + 0.95 * wrap) + vec3(pow(nh, 40.0) * 0.5);',
    '    col = mix(col, sc3, rod * 0.95);',
    '  }',
    '  return col;',
    '}',
    '// estimate torus normal by central differences (with tidal deform baked in)',
    'vec3 doughNormal(vec3 p){',
    '  vec2 e = vec2(0.001, 0.0);',
    '  return normalize(vec3(',
    '    sdTorus(p + e.xyy) - sdTorus(p - e.xyy),',
    '    sdTorus(p + e.yxy) - sdTorus(p - e.yxy),',
    '    sdTorus(p + e.yyx) - sdTorus(p - e.yyx)));',
    '}',
    '',
    '// ============================ ACES tonemap ============================',
    'vec3 acesApprox(vec3 x){',
    '  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;',
    '  return clamp((x*(a*x+b)) / (x*(c*x+d)+e), 0.0, 1.0);',
    '}',
    '',
    '// ============================ camera basis ============================',
    '// IMPORTANT: mirrored EXACTLY in JS (WormholeGL.pixelToRay). Keep in sync.',
    '// At yaw=pitch=0 the camera looks DOWN the -l axis toward the throat, so a',
    '// camera at camL=+8 sees Universe B through the throat in the center.',
    '// World axes: z = +l (depth), x = right, y = up. Forward base = (0,0,-1).',
    'void cameraBasis(out vec3 fwd, out vec3 right, out vec3 up){',
    '  // base frame: forward = -l (toward throat), up = +y, right = +x',
    '  // yaw rotates around up (y), pitch rotates around right (x).',
    '  float cy = cos(uYaw),  sy = sin(uYaw);',
    '  float cp = cos(uPitch), sp = sin(uPitch);',
    '  // forward base -z, yaw in x-z plane, pitch toward +/- y',
    '  vec3 f = vec3(sy * cp, sp, -cy * cp);  // (x, y, l-component=z-slot)',
    '  vec3 r = vec3(cy, 0.0, sy);            // right, unaffected by pitch',
    '  vec3 u = cross(r, f);',
    '  fwd = normalize(f); right = normalize(r); up = normalize(u);',
    '}',
    '',
    '// ============================ main ============================',
    'void main(){',
    '  vec2 frag = gl_FragCoord.xy;             // pixel center, bottom-up (matches readPixels)',
    '  vec2 uv = (frag - 0.5 * uRes) / uRes.y;  // aspect-correct, y in [-.5,.5]',
    '',
    '  // build world ray dir from camera basis. world coords: x=right, y=up, z=+l(depth)',
    '  vec3 fwd, right, up;',
    '  cameraBasis(fwd, right, up);',
    '  float t = tan(uFov * 0.5);',
    '  vec3 d = normalize(fwd + uv.x * t * 2.0 * right + uv.y * t * 2.0 * up);',
    '',
    '  // ---- plane reduction (spherical symmetry) ----',
    '  // e1 = +l axis in world = (0,0,1); e2 = transverse component of d.',
    '  vec3 e1 = vec3(0.0, 0.0, 1.0);',
    '  float pl0 = dot(d, e1);                  // = p0',
    '  vec3 e2raw = d - pl0 * e1;',
    '  float e2len = length(e2raw);',
    '  vec3 e2;',
    '  float b;',
    '  float r0 = uR0;',
    '  float rCam = sqrt(uCamL * uCamL + r0 * r0);',
    '  if (e2len < 1e-5) {',
    '    // looking straight down the axis: radial ray, b = 0',
    '    e2 = vec3(1.0, 0.0, 0.0);   // arbitrary; phi stays 0',
    '    b = 0.0;',
    '  } else {',
    '    e2 = e2raw / e2len;',
    '    b = rCam * e2len;            // = rCam * dot(d,e2) (conserved, E=1)',
    '  }',
    '',
    '  // ---- integrate the null geodesic (RK4) ----',
    '  float l = uCamL;',
    '  float p = pl0;',
    '  float phi = 0.0;',
    '  float h = uHTotal / uSteps;',
    '  float lExit = max(40.0 * r0, 25.0);',
    '  int   maxSteps = int(uSteps);',
    '  bool  escaped = false;',
    '  bool  hitDough = false;',
    '  vec3  doughCol = vec3(0.0);',
    '',
    '  vec3  emission = vec3(0.0);   // volumetric exotic fog + wave shell',
    '  float windGlow = 0.0;         // photon pile-up: dφ accumulated near the throat',
    '',
    '  // doughnut light dir (fixed, from up/right, camera side)',
    '  vec3 lightDir = normalize(vec3(0.45, 0.65, 0.62));   // key light from over the camera\'s shoulder',
    '  vec3 rimCol = vec3(1.0, 0.62, 0.32) * 0.55;   // warm ring light on the silhouette',
    '  float lMin = abs(uCamL);      // closest approach to the throat (for the skim haze)',
    '',
    '  for (int i = 0; i < 256; i++) {',
    '    if (i >= maxSteps) break;',
    '    float r2 = l * l + r0 * r0;',
    '    float r  = sqrt(r2);',
    '    // adaptive step: dλ = h * r(l); clamp floor by r0 during collapse',
    '    float dlam = h * r;',
    '    if (r0 < 0.3) dlam = max(dlam, 0.02 * r0);',
    '',
    '    // ---- volumetric accumulation BEFORE the step (honest visualizations) ----',
    '    // exotic fog: |ρ(r)| = r0^2 / (8π r^4). Scaled to a dim violet veil so the',
    '    // lensed background still reads through it (it is a visualization, not opaque).',
    '    float rho = r0 * r0 / (8.0 * PI * r2 * r2);',
    '    emission += uExoticVis * rho * dlam * vec3(0.22, 0.06, 0.40) * 0.6;  // dim violet',
    '    // wave shell (m-mode packet luminous at its actual l).',
    '    // |psi|^2 has a broad Gaussian tail; sampling it raw and accumulating',
    '    // over every ray step floods the whole frame solid green. We (a) square',
    '    // the sample so only the actual shell PEAK glows (the low-amplitude tail',
    '    // falls off fast), (b) use a much smaller gain, and (c) gate out the',
    '    // numerical floor — so it reads as a LOCALIZED luminous shell, not a wash.',
    '    float wvRaw = waveAt(l);',
    '    float wv = wvRaw * wvRaw;                 // sharpen: tail^2 ~ 0, peak preserved',
    '    wv = max(wv - 0.004, 0.0);                // clip numerical/tail floor',
    '    emission += uWaveVis * wv * dlam * vec3(0.10, 0.85, 0.35) * 0.85;',
    '',
    '    // photon pile-up glow: near-critical rays linger at small |l| winding the throat.',
    '    // dφ/dλ = b/r²; weight by proximity to the throat. The Einstein-ring halo is the',
    '    // integrated angular travel of rays trapped near the unstable photon orbit (b≈r0).',
    '    float dphiStep = (b / r2) * dlam;',
    '    float throatProx = exp(-(l * l) / (r0 * r0 * 1.6));   // 1 at throat, falls off',
    '    windGlow += dphiStep * throatProx;',
    '',
    '    // ---- doughnut: local 2D-plane sphere-trace near its l ----',
    '    // Each pixel\'s geodesic lives in its OWN orbital plane (spanned by e1=+l',
    '    // and e2=transverse). That plane cuts the 3D torus in a 1D slice; the union',
    '    // of all pixels\' planes sweeps the whole doughnut, so a per-pixel slice is',
    '    // the correct image. Local doughnut frame (disk faces the camera, hole-axis',
    '    // along the motion/l direction):  Lz = (l-centerL) along motion,',
    '    // Lx = transverse offset in this pixel\'s plane,  Ly = 0 (the slice plane).',
    '    // sdTorusLocal orients the tube ring in the Lx-Ly plane with axis along Lz',
    '    // so a transverse slice shows the two sides of the glazed ring.',
    '    if (uDoughActive > 0.5 && !hitDough) {',
    '      float dCatch = (DOUGH_R + DOUGH_r) + 0.6;',
    '      if (abs(l - uDoughL) < dCatch + 0.8) {',
    '        // signed transverse offset of THIS geodesic point from the axis.',
    '        float trans = r * sin(phi);',
    '        // local ray position & direction inside the pixel plane (Lx=trans, Lz=l-center)',
    '        // ray dir in plane: along-l component p, transverse component r*dphi/dl.',
    '        float dphidl_loc = b / r2;',
    '        vec2 rdir2 = normalize(vec2(r * dphidl_loc, p)); // (transverse, along-l)',
    '        vec3 marchP = vec3(trans, 0.0, l - uDoughL);',
    '        vec3 rd3 = normalize(vec3(rdir2.x, 0.0, rdir2.y));',
    '        float acc = 0.0;',
    '        for (int j = 0; j < 28; j++) {',
    '          float dist = sdTorus(marchP);',
    '          if (dist < 0.006) {',
    '            vec3 nrm = doughNormal(marchP);',
    '            // lift the slice (Lx along this pixel\'s e2) back into 3D so lighting,',
    '            // drips and sprinkles vary around the ring',
    '            vec3 p3 = vec3(marchP.x * e2.x, marchP.x * e2.y, marchP.z);',
    '            vec3 n3 = normalize(vec3(nrm.x * e2.x, nrm.x * e2.y, nrm.z));',
    '            vec3 r3 = normalize(vec3(rd3.x * e2.x, rd3.x * e2.y, rd3.z));',
    '            float face = (uCamL >= uDoughL) ? 1.0 : -1.0;',
    '            doughCol = doughShade(p3, n3, r3, lightDir, rimCol, face);',
    '            hitDough = true;',
    '            break;',
    '          }',
    '          acc += dist;',
    '          if (acc > 2.0 * dCatch) break;',
    '          marchP += rd3 * dist;',
    '        }',
    '      }',
    '    }',
    '',
    '    // ---- exit test ----',
    '    if (abs(l) > lExit) { escaped = true; break; }',
    '',
    '    // ---- RK4 step on (l, p, phi) ----',
    '    // k1',
    '    float dl1 = p;',
    '    float dp1 = b * b * l / (r2 * r2);',
    '    float dphi1 = b / r2;',
    '    // k2',
    '    float l2 = l + 0.5 * dlam * dl1;',
    '    float p2 = p + 0.5 * dlam * dp1;',
    '    float r2b = l2 * l2 + r0 * r0;',
    '    float dl2 = p2;',
    '    float dp2 = b * b * l2 / (r2b * r2b);',
    '    float dphi2 = b / r2b;',
    '    // k3',
    '    float l3 = l + 0.5 * dlam * dl2;',
    '    float p3 = p + 0.5 * dlam * dp2;',
    '    float r2c = l3 * l3 + r0 * r0;',
    '    float dl3 = p3;',
    '    float dp3 = b * b * l3 / (r2c * r2c);',
    '    float dphi3 = b / r2c;',
    '    // k4',
    '    float l4 = l + dlam * dl3;',
    '    float p4 = p + dlam * dp3;',
    '    float r2d = l4 * l4 + r0 * r0;',
    '    float dl4 = p4;',
    '    float dp4 = b * b * l4 / (r2d * r2d);',
    '    float dphi4 = b / r2d;',
    '',
    '    l   += (dlam / 6.0) * (dl1 + 2.0*dl2 + 2.0*dl3 + dl4);',
    '    p   += (dlam / 6.0) * (dp1 + 2.0*dp2 + 2.0*dp3 + dp4);',
    '    phi += (dlam / 6.0) * (dphi1 + 2.0*dphi2 + 2.0*dphi3 + dphi4);',
    '    lMin = min(lMin, abs(l));',
    '  }',
    '',
    '  // ---- shade the background ----',
    '  // Everything below runs in uniform control flow (graticule() uses fwidth).',
    '  float r2e = l * l + r0 * r0;',
    '  float dphidlE = b / r2e;            // dφ/dλ at the last state',
    '  vec3 uE = e1 * cos(phi) + e2 * sin(phi);',
    '  vec3 vE = -e1 * sin(phi) + e2 * cos(phi);',
    '  vec3 dirE = normalize(p * uE + (sqrt(r2e) * dphidlE) * vE);',
    '  int which = (l > 0.0) ? 0 : 1;      // A if l>0, else B',
    '  float seed = (l > 0.0) ? uSeedA : uSeedB;',
    '  float grid = graticule(dirE);',
    '',
    '  vec3 bg;',
    '  if (escaped) {',
    '    bg = sky(dirE, seed, which);',
    '    if (which == 0) bg += vec3(0.62, 0.50, 0.30) * grid * 0.038;   // faint brass survey grid',
    '  } else {',
    '    // step budget exhausted near the throat: photon-ring glow.',
    '    // these rays wind the unstable photon orbit at b≈r0 — the glow IS the physics.',
    '    float shimmer = 0.75 + 0.25 * sin(phi * 3.0 + uTime * 0.4);',
    '    bg = heatRamp(0.80 + 0.2 * shimmer) * shimmer * 1.7;',
    '  }',
    '',
    '  // photon-ring halo: rays that wound the throat glow. windGlow grows sharply',
    '  // for near-critical b≈r0, giving the Einstein ring its luminous edge — the',
    '  // integrated angular travel near the unstable photon orbit. Coloured on a',
    '  // heat ramp: a white-hot crest falling off through gold into deep ember.',
    '  float hw = max(windGlow - 2.2, 0.0);',
    '  float ringHalo = 1.0 - exp(-hw * hw / 9.0);',
    '  vec3 ringColor = heatRamp(0.25 + 0.75 * ringHalo) * ringHalo * 1.15;',
    '  // faint outer haze for rays that skim the throat and turn back (visual aid)',
    '  float skim = (which == 0 && escaped) ? exp(-(lMin * lMin) / (r0 * r0 * 0.9)) : 0.0;',
    '  ringColor += vec3(0.55, 0.22, 0.07) * skim * 0.22;',
    '',
    '  // composite emission (volumetric) over background',
    '  vec3 color = bg + emission + ringColor;',
    '',
    '  // composite doughnut on top (it is local & opaque where hit).',
    '  // Near-camera fade: when the doughnut passes point-blank through the camera',
    '  // plane (|uDoughL - uCamL| small) the tube fills the whole near-field and',
    '  // reads as a flat full-frame pink fill — not the shareable throat view. Fade',
    '  // it out within ~1 sim unit of the camera so it cleanly approaches from depth',
    '  // and emerges past the lens instead of flashing at spawn / fly-by.',
    '  if (hitDough) {',
    '    float camGap = abs(uDoughL - uCamL);',
    '    float nearFade = smoothstep(0.7, 1.9, camGap);   // 0 point-blank -> 1 away',
    '    color = mix(color, doughCol + emission * 0.3 + ringColor * 0.4, nearFade);',
    '  }',
    '',
    '  // ---- lens: vignette, exposure, ACES tonemap, grade, dither ----',
    '  float vig = smoothstep(1.05, 0.25, length(uv * vec2(0.92, 1.08)));',
    '  color *= mix(0.50, 1.0, vig);',
    '  color *= 1.25;                         // exposure',
    '  color = acesApprox(color);',
    '  color = pow(color, vec3(0.96, 0.98, 1.0));               // slight warm lift in the mids',
    '  color += vec3(0.010, 0.008, 0.012) * (1.0 - color);      // never quite black: ink, not void',
    '  // 8-bit ordered-ish dither to kill banding (doubles as fine film grain)',
    '  float dth = (hash31(vec3(frag, uTime)) - 0.5) / 160.0;',
    '  color += dth;',
    '',
    '  // never emit NaN',
    '  if (any(isnan(color)) || any(isinf(color))) color = vec3(0.02, 0.0, 0.05);',
    '',
    '  fragColor = vec4(color, 1.0);',
    '}'
  ].join('\n');

  // ===================================================================== JS
  var gl = null;
  var canvasEl = null;
  var program = null;
  var vao = null;
  var waveTex = null;

  var uniforms = {};          // name -> location
  var resolutionScale = 1.0;
  var cssW = 1, cssH = 1, dpr = 1;
  var internalW = 1, internalH = 1;

  // governor state
  var frameTimes = [];        // last N frame ms
  var EMA_N = 30;
  var frameMsAvg = 16.7;
  var stepsBase = 96;         // commanded steps from state
  var stepsEffective = 96;
  var aboveCount = 0;         // frames above 58fps in a row
  var govScaleSteps = [1.0, 0.75, 0.5];
  var govScaleIdx = 0;        // index into govScaleSteps
  var govStepsCut = false;    // whether we dropped 96->64 at the lowest scale
  var lastRenderT = 0;        // wall-clock of the previous render() call (real frame cadence)

  var seedA = 0.0;
  var seedB = 137.0;

  // doughnut uniform cache
  var dough = { active: false, l: 0, vFrac: 0, radial: 1, lateral: 1 };
  // Visual clamp bounds for the tidal deform pushed to the torus SDF (see the
  // strain-clamp note in setUniforms). Keeps a recognizable stretch/squeeze;
  // the survival HUD uses the unclamped physics numbers.
  var DOUGH_STRAIN_MAX = 2.2;   // max radial stretch shown
  var DOUGH_STRAIN_MIN = 0.45;  // min lateral squeeze shown

  // wave field cache
  var waveLMin = -12, waveLMax = 12;
  var waveData = new Float32Array(400);

  // --------------------------------------------------------- shader compile
  function compile(type, src) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      gl.deleteShader(sh);
      return { ok: false, log: log };
    }
    return { ok: true, shader: sh };
  }

  function buildProgram() {
    var vs = compile(gl.VERTEX_SHADER, VERT_SRC);
    if (!vs.ok) { console.error('[WormholeGL] vertex shader:\n' + vs.log); return null; }
    var fs = compile(gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!fs.ok) { console.error('[WormholeGL] fragment shader:\n' + fs.log); return null; }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs.shader);
    gl.attachShader(prog, fs.shader);
    gl.linkProgram(prog);
    gl.deleteShader(vs.shader);
    gl.deleteShader(fs.shader);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error('[WormholeGL] link:\n' + gl.getProgramInfoLog(prog));
      gl.deleteProgram(prog);
      return null;
    }
    return prog;
  }

  function cacheUniforms() {
    var names = [
      'uRes', 'uR0', 'uCamL', 'uYaw', 'uPitch', 'uFov', 'uSteps', 'uTime',
      'uExoticVis', 'uWaveVis', 'uHTotal', 'uSeedA', 'uSeedB',
      'uWaveTex', 'uWaveLMin', 'uWaveLMax',
      'uDoughActive', 'uDoughL', 'uDoughVFrac', 'uDoughRadial', 'uDoughLateral'
    ];
    uniforms = {};
    for (var i = 0; i < names.length; i++) {
      uniforms[names[i]] = gl.getUniformLocation(program, names[i]);
    }
  }

  function allocWaveTexture() {
    waveTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, waveTex);
    // R32F 400x1. Linear if the float-linear ext is present, else nearest.
    var floatLinear = gl.getExtension('OES_texture_float_linear');
    var filter = floatLinear ? gl.LINEAR : gl.NEAREST;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32F, 400, 1, 0, gl.RED, gl.FLOAT, waveData);
  }

  // --------------------------------------------------------------- public
  function init(canvas) {
    canvasEl = canvas;
    try {
      gl = canvas.getContext('webgl2', {
        antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: true,  // allow toBlob postcard (stretch) on file://
        powerPreference: 'high-performance'
      });
    } catch (e) {
      return { ok: false, reason: 'no-webgl2' };
    }
    if (!gl) return { ok: false, reason: 'no-webgl2' };

    // R32F requires EXT_color_buffer_float for renderability, but for a SAMPLED
    // texture (texImage2D upload, no FBO) it is core in WebGL2. Linear filtering
    // of floats needs OES_texture_float_linear; we fall back to NEAREST if absent.

    program = buildProgram();
    if (!program) return { ok: false, reason: 'shader-compile' };

    cacheUniforms();

    // attributeless triangle: a VAO with no buffers, drawArrays(TRIANGLES, 0, 3)
    vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    gl.bindVertexArray(null);

    allocWaveTexture();

    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    // optional cross-check against the physics mirror (non-fatal)
    try {
      if (window.WormholePhysics && typeof window.WormholePhysics.rFromL === 'function') {
        var rc = window.WormholePhysics.rFromL(0, 1);
        if (Math.abs(rc - 1) > 1e-6) {
          console.warn('[WormholeGL] WormholePhysics.rFromL(0,1) != 1 — geodesic mirror may drift.');
        }
      }
    } catch (e) { /* ignore */ }

    // initial sizing from canvas attributes if present
    var w = canvas.clientWidth || canvas.width || 1;
    var h = canvas.clientHeight || canvas.height || 1;
    resize(w, h, window.devicePixelRatio || 1);

    return { ok: true };
  }

  function applyInternalSize() {
    internalW = Math.max(1, Math.round(cssW * dpr * resolutionScale));
    internalH = Math.max(1, Math.round(cssH * dpr * resolutionScale));
    if (canvasEl) {
      if (canvasEl.width !== internalW) canvasEl.width = internalW;
      if (canvasEl.height !== internalH) canvasEl.height = internalH;
    }
  }

  function resize(w, h, devicePixelRatio) {
    cssW = Math.max(1, w);
    cssH = Math.max(1, h);
    dpr = devicePixelRatio || 1;
    if (canvasEl) {
      canvasEl.style.width = cssW + 'px';
      canvasEl.style.height = cssH + 'px';
    }
    applyInternalSize();
  }

  function setResolutionScale(s) {
    resolutionScale = Math.max(0.25, Math.min(1.0, s));
    // snap governor index to the nearest preset for consistency
    govScaleIdx = 0;
    for (var i = 0; i < govScaleSteps.length; i++) {
      if (Math.abs(govScaleSteps[i] - resolutionScale) < 0.06) { govScaleIdx = i; break; }
    }
    applyInternalSize();
  }

  function setDoughnut(d) {
    dough.active = !!(d && d.active);
    if (d) {
      dough.l = (typeof d.l === 'number') ? d.l : dough.l;
      dough.vFrac = (typeof d.vFrac === 'number') ? d.vFrac : dough.vFrac;
      dough.radial = (typeof d.radialStrain === 'number' && d.radialStrain > 0) ? d.radialStrain : 1.0;
      dough.lateral = (typeof d.lateralStrain === 'number' && d.lateralStrain > 0) ? d.lateralStrain : 1.0;
    }
  }

  function setWaveField(amp, lMin, lMax) {
    if (typeof lMin === 'number') waveLMin = lMin;
    if (typeof lMax === 'number') waveLMax = lMax;
    if (amp && amp.length) {
      // copy (defensive) into our fixed 400 buffer
      var n = Math.min(400, amp.length);
      for (var i = 0; i < n; i++) waveData[i] = amp[i];
      for (var j = n; j < 400; j++) waveData[j] = 0;
      gl.bindTexture(gl.TEXTURE_2D, waveTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 400, 1, gl.RED, gl.FLOAT, waveData);
    }
  }

  function reseedSky(sA, sB) {
    if (typeof sA === 'number') seedA = sA;
    if (typeof sB === 'number') seedB = sB;
  }

  // --------------------------------------------------- governor
  function recordFrame(ms) {
    frameTimes.push(ms);
    if (frameTimes.length > EMA_N) frameTimes.shift();
    // EMA
    var alpha = 2.0 / (EMA_N + 1);
    frameMsAvg = frameMsAvg + alpha * (ms - frameMsAvg);

    if (frameTimes.length < EMA_N) return; // warm-up

    var fps = 1000.0 / Math.max(0.001, frameMsAvg);

    if (fps < 50.0) {
      aboveCount = 0;
      if (govScaleIdx < govScaleSteps.length - 1) {
        govScaleIdx++;
        resolutionScale = govScaleSteps[govScaleIdx];
        applyInternalSize();
      } else if (!govStepsCut) {
        govStepsCut = true; // drop 96 -> 64
      }
    } else if (fps > 58.0) {
      aboveCount++;
      if (aboveCount >= 120) {
        aboveCount = 0;
        if (govStepsCut) {
          govStepsCut = false; // restore steps first
        } else if (govScaleIdx > 0) {
          govScaleIdx--;
          resolutionScale = govScaleSteps[govScaleIdx];
          applyInternalSize();
        }
      }
    } else {
      aboveCount = 0;
    }
  }

  function effectiveSteps(commanded) {
    var s = (typeof commanded === 'number') ? commanded : 96;
    s = Math.max(32, Math.min(192, s));
    if (govStepsCut) s = Math.min(s, 64);
    return s;
  }

  // --------------------------------------------------- render
  function render(state) {
    if (!gl || !program) return;
    var tNow = (typeof performance !== 'undefined') ? performance.now() : Date.now();
    // True frame cadence = wall-clock between successive render() calls (one per rAF).
    // This captures GPU + vsync cost, which a within-call submit-time delta cannot
    // (drawArrays returns before the GPU finishes). First call seeds, no record.
    if (lastRenderT !== 0) {
      var frameMs = tNow - lastRenderT;
      // ignore absurd gaps (tab was backgrounded) so the governor doesn't over-react
      if (frameMs > 0 && frameMs < 500) recordFrame(frameMs);
    }
    lastRenderT = tNow;

    stepsBase = (state && typeof state.steps === 'number') ? state.steps : 96;
    stepsEffective = effectiveSteps(stepsBase);

    gl.viewport(0, 0, internalW, internalH);
    gl.useProgram(program);
    gl.bindVertexArray(vao);

    // uniforms
    gl.uniform2f(uniforms.uRes, internalW, internalH);
    gl.uniform1f(uniforms.uR0, state ? state.r0 : 1.0);
    gl.uniform1f(uniforms.uCamL, state ? state.camL : 8.0);
    gl.uniform1f(uniforms.uYaw, state ? (state.yaw || 0) : 0);
    gl.uniform1f(uniforms.uPitch, state ? (state.pitch || 0) : 0);
    gl.uniform1f(uniforms.uFov, state && state.fov ? state.fov : 1.2);
    gl.uniform1f(uniforms.uSteps, stepsEffective);
    gl.uniform1f(uniforms.uTime, state ? (state.time || 0) : 0);
    gl.uniform1f(uniforms.uExoticVis, state ? (state.exoticVis || 0) : 0);
    gl.uniform1f(uniforms.uWaveVis, state ? (state.waveVis || 0) : 0);
    gl.uniform1f(uniforms.uHTotal, H_TOTAL);
    gl.uniform1f(uniforms.uSeedA, seedA);
    gl.uniform1f(uniforms.uSeedB, seedB);
    gl.uniform1f(uniforms.uWaveLMin, waveLMin);
    gl.uniform1f(uniforms.uWaveLMax, waveLMax);

    // doughnut: prefer per-frame state, fall back to setDoughnut cache
    var dd = (state && state.doughnut) ? state.doughnut : null;
    var dActive = dd ? dd.active : dough.active;
    var dL = dd ? dd.l : dough.l;
    var dVF = dd ? dd.vFrac : dough.vFrac;
    var dRad = dd && typeof dd.radialStrain === 'number' && dd.radialStrain > 0 ? dd.radialStrain : dough.radial;
    var dLat = dd && typeof dd.lateralStrain === 'number' && dd.lateralStrain > 0 ? dd.lateralStrain : dough.lateral;
    // VISUAL-ONLY strain clamp. The honest tidal numbers (radial up to ~100x,
    // lateral down to ~0.01x near a small throat / high vFrac) would shrink the
    // glazed tube to a sub-pixel sliver and read as noise. Clamp the *render*
    // deform to a recognizable stretch/squeeze so the doughnut still looks like a
    // doughnut while it visibly deforms. The HUD survival verdict (tidal()/
    // doughnutSurvival) uses the UNCLAMPED physics — this changes pixels, not the
    // ledger. Pairs with the Lipschitz guard in sdTorus.
    var dRadVis = Math.min(Math.max(dRad || 1.0, 1.0), DOUGH_STRAIN_MAX);
    var dLatVis = Math.min(Math.max(dLat || 1.0, DOUGH_STRAIN_MIN), 1.0);
    gl.uniform1f(uniforms.uDoughActive, dActive ? 1.0 : 0.0);
    gl.uniform1f(uniforms.uDoughL, dL || 0);
    gl.uniform1f(uniforms.uDoughVFrac, dVF || 0);
    gl.uniform1f(uniforms.uDoughRadial, dRadVis);
    gl.uniform1f(uniforms.uDoughLateral, dLatVis);

    // wave texture unit 0
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, waveTex);
    gl.uniform1i(uniforms.uWaveTex, 0);

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    // No finish()/readPixels here — that would stall the pipeline. The governor's
    // signal is the inter-call wall-clock delta measured at the top of render().
  }

  function getStats() {
    return {
      frameMsAvg: frameMsAvg,
      resolutionScale: resolutionScale,
      stepsEffective: stepsEffective
    };
  }

  // --------------------------------------------------- pixelToRay (CPU bridge)
  // Mirror of the shader camera basis + plane reduction. CONTRACT:
  // WormholePhysics.traceRay(state.camL, theta, state.r0) reproduces this pixel.
  // theta = angle between the ray and +l axis at the camera (in the orbital plane).
  function cameraBasisJS(yaw, pitch) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var f = [sy * cp, sp, -cy * cp];  // forward base -z (toward throat)
    var r = [cy, 0, sy];              // right
    // up = cross(r, f)
    var u = [
      r[1] * f[2] - r[2] * f[1],
      r[2] * f[0] - r[0] * f[2],
      r[0] * f[1] - r[1] * f[0]
    ];
    function norm(v) {
      var m = Math.hypot(v[0], v[1], v[2]) || 1;
      return [v[0] / m, v[1] / m, v[2] / m];
    }
    return { fwd: norm(f), right: norm(r), up: norm(u) };
  }

  function pixelToRay(px, py, state) {
    var r0 = state ? state.r0 : 1.0;
    var camL = state ? state.camL : 8.0;
    var fov = (state && state.fov) ? state.fov : 1.2;
    var yaw = state ? (state.yaw || 0) : 0;
    var pitch = state ? (state.pitch || 0) : 0;

    // CSS pixel -> internal pixel space mirror of the shader's uv mapping.
    // The shader uses uv = (frag - 0.5*uRes)/uRes.y with frag in internal px.
    // px,py arrive as CSS pixels (origin top-left). Convert to the same uv.
    var W = cssW, Hh = cssH;
    // shader y is bottom-up (vUv from gl_VertexID); CSS y is top-down -> flip.
    var fragX = px * dpr * resolutionScale;
    var fragY = (Hh - py) * dpr * resolutionScale; // flip Y to match GL
    var resX = internalW, resY = internalH;
    var uvx = (fragX - 0.5 * resX) / resY;
    var uvy = (fragY - 0.5 * resY) / resY;

    var basis = cameraBasisJS(yaw, pitch);
    var tn = Math.tan(fov * 0.5);
    var fwd = basis.fwd, right = basis.right, up = basis.up;
    var d = [
      fwd[0] + uvx * tn * 2.0 * right[0] + uvy * tn * 2.0 * up[0],
      fwd[1] + uvx * tn * 2.0 * right[1] + uvy * tn * 2.0 * up[1],
      fwd[2] + uvx * tn * 2.0 * right[2] + uvy * tn * 2.0 * up[2]
    ];
    var dm = Math.hypot(d[0], d[1], d[2]) || 1;
    d = [d[0] / dm, d[1] / dm, d[2] / dm];

    // plane reduction: e1 = +l axis = (0,0,1)
    var p0 = d[2];                       // dot(d, e1)
    var e2raw = [d[0], d[1], 0.0];       // d - p0*e1
    var e2len = Math.hypot(e2raw[0], e2raw[1], e2raw[2]);
    var rCam = Math.sqrt(camL * camL + r0 * r0);
    var b;
    var theta;
    if (e2len < 1e-5) {
      b = 0.0;
      theta = (p0 >= 0) ? 0.0 : Math.PI; // radial ray
    } else {
      b = rCam * e2len;
      // b = rCam * sin(theta), p0 = cos(theta)*|d| with |d|=1 -> theta = atan2(e2len, p0)
      theta = Math.atan2(e2len, p0);
    }
    return { theta: theta, b: b };
  }

  // --------------------------------------------------- export (single global)
  window.WormholeGL = {
    VERSION: '1.0.0',
    init: init,
    resize: resize,
    render: render,
    setDoughnut: setDoughnut,
    setWaveField: setWaveField,
    setResolutionScale: setResolutionScale,
    getStats: getStats,
    reseedSky: reseedSky,
    pixelToRay: pixelToRay
  };
})();
