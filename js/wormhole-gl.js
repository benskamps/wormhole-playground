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
    '// ============================ blackbody-ish star tint ============================',
    '// 3-segment T->RGB approximation; t in [0,1] cool->warm.',
    'vec3 starTint(float t){',
    '  vec3 cool = vec3(0.62, 0.74, 1.00);  // blue-white',
    '  vec3 mid  = vec3(1.00, 0.98, 0.92);  // white',
    '  vec3 warm = vec3(1.00, 0.78, 0.52);  // amber',
    '  if (t < 0.5) return mix(cool, mid, t * 2.0);',
    '  return mix(mid, warm, (t - 0.5) * 2.0);',
    '}',
    '',
    '// ============================ starfield ============================',
    '// Hash-cell stars on the direction sphere. density: cells per unit dir.',
    'float starLayer(vec3 dir, float density, float thresh, float seed){',
    '  vec3 g = dir * density;',
    '  vec3 cell = floor(g);',
    '  vec3 fpos = fract(g);',
    '  float acc = 0.0;',
    '  // sample this cell + neighbors for AA at cell borders',
    '  for (int dx = -1; dx <= 1; dx++)',
    '  for (int dy = -1; dy <= 1; dy++)',
    '  for (int dz = -1; dz <= 1; dz++){',
    '    vec3 off = vec3(float(dx), float(dy), float(dz));',
    '    vec3 c = cell + off;',
    '    float h = hash31(c + seed);',
    '    if (h > thresh) {',
    '      vec3 starPos = off + hash33(c + seed + 1.7);',
    '      float d = length(fpos - starPos);',
    '      float bright = pow(hash31(c + seed + 4.3), 6.0);  // power-law',
    '      float core = smoothstep(0.16, 0.0, d);',
    '      acc += core * (0.4 + bright);',
    '    }',
    '  }',
    '  return acc;',
    '}',
    '',
    '// which: 0 = Universe A (cool/sparse), 1 = Universe B (warm/dense/band)',
    'vec3 sky(vec3 dir, float seed, int which){',
    '  dir = normalize(dir);',
    '  vec3 col = vec3(0.0);',
    '  if (which == 0) {',
    '    // ---- Universe A: cool, sparse, teal nebula ----',
    '    float s1 = starLayer(dir, 14.0, 0.86, seed);',
    '    float s2 = starLayer(dir, 32.0, 0.93, seed + 9.1);',
    '    float starT = hash31(floor(dir*14.0) + seed + 2.0);',
    '    vec3 starC = starTint(starT * 0.45);            // skew cool',
    '    col += (s1 + s2 * 0.7) * starC;',
    '    float neb = fbm(dir * 2.3 + seed);',
    '    neb = pow(max(neb - 0.45, 0.0), 2.0) * 1.8;',
    '    col += neb * vec3(0.04, 0.13, 0.16);            // thin teal',
    '    col += vec3(0.012, 0.018, 0.030);               // cool ambient floor',
    '  } else {',
    '    // ---- Universe B: warm, dense, galactic band ----',
    '    float s1 = starLayer(dir, 20.0, 0.78, seed);',
    '    float s2 = starLayer(dir, 44.0, 0.88, seed + 5.5);',
    '    float starT = hash31(floor(dir*20.0) + seed + 2.0);',
    '    vec3 starC = starTint(0.55 + starT * 0.45);     // skew warm',
    '    col += (s1 + s2 * 0.8) * starC;',
    '    // galactic band: bright sheet around an axis',
    '    vec3 bandAxis = normalize(vec3(0.2, 1.0, 0.35));',
    '    float band = 1.0 - abs(dot(dir, bandAxis));',
    '    band = pow(clamp(band, 0.0, 1.0), 7.0);',
    '    float bandNoise = fbm(dir * 5.0 + seed + 3.3);',
    '    col += band * (0.55 + 0.6 * bandNoise) * vec3(1.00, 0.74, 0.42);',
    '    // emission clouds magenta/amber',
    '    float neb = fbm(dir * 2.0 + seed + 7.7);',
    '    neb = pow(max(neb - 0.4, 0.0), 1.8) * 2.4;',
    '    col += neb * vec3(0.18, 0.05, 0.13);',
    '    col += vec3(0.030, 0.014, 0.010);               // warm ambient floor',
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
    '  // Doughnut disk lies in the x-z plane (hole-axis along y) so the per-pixel',
    '  // slice at y=0 cuts the glazed ring through its equator and reads as a',
    '  // doughnut. Tidal deform (Morris-Thorne, VISIBLE): stretch along motion (z),',
    '  // squeeze transverse (x) — both live in the slice plane so they show.',
    '  p.z /= uDoughRadial;        // radial stretch along the direction of motion',
    '  p.x *= uDoughLateral;       // lateral squeeze perpendicular to motion',
    '  vec2 q = vec2(length(p.xz) - DOUGH_R, p.y);',
    '  return length(q) - DOUGH_r;',
    '}',
    '// glaze + sprinkles shading; n = surface normal, pl = local sample point',
    'vec3 doughShade(vec3 pl, vec3 n, vec3 rd, vec3 lightDir){',
    '  vec3 albedo = vec3(0.95, 0.72, 0.78);          // warm pink frosting',
    '  // dough rim (tube facing away from torus axis = lower frosting coverage)',
    '  float tube = length(pl.xz) - DOUGH_R;          // -r..+r across the tube',
    '  float underside = smoothstep(0.05, -0.18, pl.y - tube*0.0);',
    '  vec3 dough = vec3(0.78, 0.55, 0.36);           // baked rim',
    '  albedo = mix(albedo, dough, underside * 0.55);',
    '  // diffuse',
    '  float diff = max(dot(n, lightDir), 0.0);',
    '  float amb = 0.22;',
    '  vec3 col = albedo * (amb + 0.9 * diff);',
    '  // Blinn-Phong specular (tight glaze highlight)',
    '  vec3 h = normalize(lightDir - rd);',
    '  float spec = pow(max(dot(n, h), 0.0), 64.0);',
    '  col += vec3(1.0) * spec * 0.6;',
    '  // sprinkles: hash the surface point into scattered colored dashes',
    '  float sp = hash33(floor(pl * 22.0)).x;',
    '  if (sp > 0.82) {',
    '    vec3 sprColors[4] = vec3[4](',
    '      vec3(0.95,0.25,0.30), vec3(0.30,0.55,0.95),',
    '      vec3(0.98,0.85,0.25), vec3(0.40,0.85,0.45));',
    '    int idx = int(hash33(floor(pl*22.0)+5.0).y * 4.0);',
    '    idx = idx > 3 ? 3 : idx;',
    '    float dash = smoothstep(0.86, 0.95, sp);',
    '    col = mix(col, sprColors[idx], dash * 0.85);',
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
    '  // doughnut light dir (fixed, comes from +up/+right toward camera)',
    '  vec3 lightDir = normalize(vec3(0.5, 0.7, -0.4));',
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
    '            doughCol = doughShade(marchP, nrm, rd3, lightDir);',
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
    '  }',
    '',
    '  // ---- shade the background ----',
    '  vec3 bg;',
    '  if (escaped) {',
    '    // reconstruct world exit direction',
    '    float r2 = l * l + r0 * r0;',
    '    float dphidl = b / r2;            // dφ/dλ',
    '    vec3 u = e1 * cos(phi) + e2 * sin(phi);',
    '    vec3 v = -e1 * sin(phi) + e2 * cos(phi);',
    '    float rr = sqrt(r2);',
    '    vec3 dir = normalize(p * u + (rr * dphidl) * v);',
    '    int which = (l > 0.0) ? 0 : 1;    // A if l>0, else B',
    '    float seed = (l > 0.0) ? uSeedA : uSeedB;',
    '    bg = sky(dir, seed, which);',
    '  } else {',
    '    // step budget exhausted near the throat: photon-ring glow.',
    '    // these rays wind the unstable photon orbit at b≈r0 — the glow IS the physics.',
    '    float ringHeat = 1.0;',
    '    // subtle shimmer keyed to phi so multiple windings read as a luminous ring',
    '    float shimmer = 0.6 + 0.4 * sin(phi * 3.0 + uTime * 0.4);',
    '    bg = vec3(1.0, 0.82, 0.55) * ringHeat * shimmer * 1.6;',
    '  }',
    '',
    '  // photon-ring halo: rays that wound the throat glow warm. windGlow grows',
    '  // sharply for near-critical b≈r0, giving the Einstein ring its luminous edge.',
    '  // honest: this IS the integrated angular travel near the unstable photon orbit.',
    '  float ringHalo = smoothstep(3.5, 7.0, windGlow);',
    '  vec3 ringColor = vec3(1.0, 0.82, 0.55) * ringHalo * 1.1;',
    '',
    '  // composite emission (volumetric) over background',
    '  vec3 color = bg + emission + ringColor;',
    '',
    '  // composite doughnut on top (it is local & opaque where hit)',
    '  if (hitDough) {',
    '    color = doughCol + emission * 0.3 + ringColor * 0.4;',
    '  }',
    '',
    '  // ---- exposure + ACES tonemap + dither ----',
    '  color *= 1.1;                          // exposure',
    '  color = acesApprox(color);',
    '  // 8-bit ordered-ish dither to kill banding',
    '  float dth = (hash31(vec3(frag, uTime)) - 0.5) / 255.0;',
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
    gl.uniform1f(uniforms.uDoughActive, dActive ? 1.0 : 0.0);
    gl.uniform1f(uniforms.uDoughL, dL || 0);
    gl.uniform1f(uniforms.uDoughVFrac, dVF || 0);
    gl.uniform1f(uniforms.uDoughRadial, dRad || 1.0);
    gl.uniform1f(uniforms.uDoughLateral, dLat || 1.0);

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
