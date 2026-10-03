// All GLSL lives here as template strings. No external assets.

export const quadVS = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// ---------------------------------------------------------------------------
// Wave simulation: explicit 2D wave equation, ping-pong. R = h, G = h_prev.
// Impulses (disc or ring) and damping zones (glass zones, slicks) are uniforms
// so a single pass does everything.
// ---------------------------------------------------------------------------
export const simFS = `#version 300 es
precision highp float;
uniform sampler2D uPrev;
uniform float uTexel;
uniform float uC2;
uniform float uDamp;
uniform float uNu;
uniform float uPondR;
uniform int uNumImp;
uniform vec4 uImp[16];   // x, y, radius, amp
uniform vec4 uImpB[16];  // type(0 disc,1 ring), ringWidth, 0, 0
uniform int uNumZones;
uniform vec4 uZone[12];  // x, y, radius, strength
in vec2 vUv;
out vec4 frag;
void main(){
  vec4 c = texture(uPrev, vUv);
  float h = c.r, hp = c.g;
  vec4 l = texture(uPrev, vUv - vec2(uTexel, 0.0));
  vec4 r = texture(uPrev, vUv + vec2(uTexel, 0.0));
  vec4 d = texture(uPrev, vUv - vec2(0.0, uTexel));
  vec4 u = texture(uPrev, vUv + vec2(0.0, uTexel));
  float lap = l.r + r.r + u.r + d.r - 4.0 * h;
  // viscous term: Laplacian of velocity. Kills grid-scale (Nyquist) ripples
  // that the explicit scheme would otherwise keep forever, barely touches
  // gameplay-scale waves.
  float lapV = (l.r - l.g) + (r.r - r.g) + (u.r - u.g) + (d.r - d.g) - 4.0 * (h - hp);

  // Damping is applied to the whole new height (not only the velocity term):
  // scaling the velocity term alone destabilises the grid's Nyquist mode.
  float dist = length(vUv - 0.5);
  float edge = smoothstep(uPondR - 0.05, uPondR + 0.01, dist);

  float zoneK = 0.0;
  for (int i = 0; i < 12; i++) {
    if (i >= uNumZones) break;
    vec4 z = uZone[i];
    float dz = length(vUv - z.xy) / z.z;
    float m = 1.0 - smoothstep(0.55, 1.0, dz);
    zoneK = max(zoneK, m * z.w);
  }

  float vel = (h - hp) * uDamp + uNu * lapV;
  float hn = h + vel + uC2 * lap;
  float k = (1.0 - zoneK * 0.10) * (1.0 - edge * 0.05);
  hn *= k;

  // Impulses. Rings also write a slightly smaller ring into h_prev so the
  // initial velocity points outward: the pulse leaves the strider instead of
  // collapsing back onto it.
  float hprev = h;
  float shift = sqrt(uC2) * uTexel;
  for (int i = 0; i < 16; i++) {
    if (i >= uNumImp) break;
    vec4 im = uImp[i];
    vec4 ib = uImpB[i];
    float di = length(vUv - im.xy);
    if (ib.x < 0.5) {
      hn += im.w * exp(-(di * di) / (im.z * im.z));
    } else {
      float q = (di - im.z) / ib.y;
      hn += im.w * exp(-q * q);
      float q2 = (di - (im.z - shift)) / ib.y;
      hprev += im.w * exp(-q2 * q2);
    }
  }
  hn = clamp(hn, -1.0, 1.0);
  frag = vec4(hn, hprev, 0.0, 1.0);
}`;

export const debugSimFS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
in vec2 vUv;
out vec4 frag;
void main(){ float h = texture(uSrc, vUv).r; frag = vec4(vec3(0.5 + h * 4.0), 1.0); }`;

export const copyFS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
in vec2 vUv;
out vec4 frag;
void main(){ frag = texture(uSrc, vUv); }`;

// Compact height + slope readback for gameplay (RGBA8, async PBO on the CPU side).
export const readbackFS = `#version 300 es
precision highp float;
uniform sampler2D uH;
uniform float uTexel;
in vec2 vUv;
out vec4 frag;
void main(){
  float h  = texture(uH, vUv).r;
  float hl = texture(uH, vUv - vec2(uTexel, 0.0)).r;
  float hr = texture(uH, vUv + vec2(uTexel, 0.0)).r;
  float hd = texture(uH, vUv - vec2(0.0, uTexel)).r;
  float hu = texture(uH, vUv + vec2(0.0, uTexel)).r;
  vec2 g = vec2(hr - hl, hu - hd) / (2.0 * uTexel);
  frag = vec4(clamp(h * 2.0 + 0.5, 0.0, 1.0), clamp(g * 0.05 + 0.5, 0.0, 1.0), 1.0);
}`;

// ---------------------------------------------------------------------------
// Procedural pebble bed, baked once into a tiling texture.
// ---------------------------------------------------------------------------
const noiseLib = `
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
vec2 hash2(vec2 p){ float h = hash(p); return vec2(h, hash(p + h + 1.7)); }
float pnoise(vec2 p, float per){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  vec2 i0 = mod(i, per), i1 = mod(i + 1.0, per);
  float a = hash(vec2(i0.x, i0.y)), b = hash(vec2(i1.x, i0.y)), c = hash(vec2(i0.x, i1.y)), d = hash(vec2(i1.x, i1.y));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float pfbm(vec2 p, float per){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * pnoise(p, per); p *= 2.0; per *= 2.0; a *= 0.5; }
  return v;
}
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; }
  return v;
}
`;

export const bedFS = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 frag;
${noiseLib}
vec4 pebbles(vec2 p, float scale, float density, float seed){
  vec2 q = p * scale;
  vec2 cell = floor(q);
  float best = 1e9; vec3 col = vec3(0.0); float cover = 0.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 c = cell + vec2(float(i), float(j));
    vec2 cm = mod(c, scale) + seed;
    vec2 r = hash2(cm);
    if (r.x > density) continue;
    vec2 center = c + 0.5 + (hash2(cm + 4.2) - 0.5) * 0.55;
    vec2 rad = vec2(0.30 + 0.22 * hash(cm + 3.1), 0.22 + 0.18 * hash(cm + 7.7));
    float ang = hash(cm + 2.2) * 3.1416;
    vec2 d = q - center;
    d = mat2(cos(ang), -sin(ang), sin(ang), cos(ang)) * d;
    float e = length(d / rad);
    if (e < 1.0 && e < best) {
      best = e;
      float hue = hash(cm + 5.5);
      vec3 base = mix(vec3(0.56, 0.51, 0.46), vec3(0.74, 0.68, 0.60), hash(cm + 9.0));
      if (hue < 0.18) base = vec3(0.40, 0.38, 0.37);
      else if (hue < 0.34) base = vec3(0.78, 0.62, 0.44);
      else if (hue < 0.44) base = vec3(0.50, 0.56, 0.47);
      else if (hue < 0.52) base = vec3(0.82, 0.80, 0.76);
      else if (hue < 0.58) base = vec3(0.60, 0.42, 0.36);
      vec3 n = normalize(vec3(d / rad, sqrt(max(0.0, 1.0 - e * e)) * 1.4));
      float diff = clamp(dot(n, normalize(vec3(-0.45, 0.55, 0.7))), 0.0, 1.0);
      float speck = (noise(q * 23.0 + hash(cm) * 10.0) - 0.5) * 0.18;
      col = base * (0.50 + 0.65 * diff) + speck;
      col += vec3(0.25) * pow(clamp(dot(n, normalize(vec3(-0.3, 0.5, 0.9))), 0.0, 1.0), 24.0);
      cover = 1.0 - smoothstep(0.84, 1.0, e);
    }
  }
  return vec4(col, cover);
}
void main(){
  vec2 p = vUv;
  float n = pfbm(p * 24.0, 24.0);
  vec3 sand = mix(vec3(0.40, 0.36, 0.29), vec3(0.62, 0.56, 0.45), n);
  sand *= 0.85 + 0.3 * pfbm(p * 96.0 + 3.0, 96.0);
  vec3 col = sand;
  vec4 g2 = pebbles(p, 96.0, 0.65, 11.0); col = mix(col, g2.rgb, g2.a * 0.9);
  vec4 g1 = pebbles(p, 40.0, 0.70, 3.0);  col = mix(col, g1.rgb, g1.a);
  vec4 g0 = pebbles(p, 16.0, 0.45, 7.0);  col = mix(col, g0.rgb, g0.a);
  float m = smoothstep(0.52, 0.74, pfbm(p * 8.0 + 20.0, 8.0));
  col = mix(col, vec3(0.20, 0.36, 0.16) * (0.8 + 0.4 * n), m * 0.55 * (1.0 - g0.a * 0.7));
  float ao = 1.0 - 0.18 * smoothstep(0.0, 1.0, (1.0 - g0.a) * (1.0 - g1.a) * pfbm(p * 48.0 + 9.0, 48.0));
  col *= ao;
  frag = vec4(col, 1.0);
}`;

// ---------------------------------------------------------------------------
// Water surface. One height map → refraction, caustics, shadows, reflection,
// glints, slick sheen, night glow. Bank outside the pond.
// ---------------------------------------------------------------------------
export const waterFS = `#version 300 es
precision highp float;
uniform sampler2D uH;
uniform sampler2D uBed;
uniform vec2 uRes;
uniform vec3 uCam;          // cx, cy, px per world unit
uniform float uTexel;
uniform float uTime;
uniform float uNight;
uniform float uStorm;
uniform float uDawn;
uniform vec3 uSun;
uniform float uPondR;
uniform vec4 uFeet[6];      // x, y, radius, weight
uniform vec4 uBody;         // x, y, cos, sin
uniform vec3 uBodySize;     // half length, half width, sink
uniform vec4 uFish;         // x, y, heading, size
uniform vec3 uFishState;    // depth, mouth, visible
uniform vec4 uBug;          // x, y, heading, size
uniform vec4 uSlick[8];
uniform int uNumSlick;
uniform vec2 uStriderPos;
uniform float uSenseR;
uniform float uFog;
uniform float uGlow;
uniform float uNormalScale;
uniform float uCaustic;
uniform vec4 uGhost;        // x, y, radius, alpha (friend/ghost marker)
uniform float uMicro;       // wind capillary texture strength (render only)
uniform vec2 uWind;
in vec2 vUv;
out vec4 frag;
${noiseLib}
float sdCapsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdEll(vec2 p, vec2 r){ return (length(p / r) - 1.0) * min(r.x, r.y); }

vec3 skyColor(vec3 d){
  float up = clamp(d.z, 0.0, 1.0);
  vec3 zen = vec3(0.30, 0.52, 0.86);
  vec3 hor = vec3(0.86, 0.90, 0.95);
  vec3 day = mix(hor, zen, pow(up, 0.55));
  vec3 dawnSky = mix(vec3(1.0, 0.72, 0.42), vec3(0.58, 0.62, 0.82), pow(up, 0.5));
  day = mix(day, dawnSky, uDawn);
  vec2 cuv = d.xy / (d.z + 0.25);
  float cl = fbm(cuv * 2.2 + uTime * 0.012);
  float cloud = smoothstep(0.42, 0.72, cl);
  day = mix(day, vec3(1.0, 0.98, 0.96), cloud * 0.45 * (1.0 - uStorm));
  vec3 storm = mix(vec3(0.48, 0.50, 0.54), vec3(0.28, 0.31, 0.37), pow(up, 0.5));
  storm = mix(storm, vec3(0.62, 0.63, 0.66), cloud * 0.35);
  day = mix(day, storm, uStorm);
  float sd = max(dot(d, uSun), 0.0);
  day += vec3(1.0, 0.95, 0.85) * pow(sd, 500.0) * 3.0 * (1.0 - uStorm * 0.92);
  day += mix(vec3(1.0, 0.95, 0.9), vec3(1.0, 0.7, 0.45), uDawn) * pow(sd, 6.0) * 0.30 * (1.0 - uStorm * 0.85);
  vec3 night = mix(vec3(0.025, 0.035, 0.08), vec3(0.01, 0.015, 0.045), up);
  night += vec3(0.8, 0.85, 1.0) * pow(sd, 700.0) * 1.6 + vec3(0.12, 0.14, 0.22) * pow(sd, 5.0) * 0.35;
  vec2 sp = d.xy / (d.z + 0.3) * 70.0;
  vec2 sc = floor(sp);
  float st = step(0.994, hash(sc)) * (0.5 + 0.5 * sin(uTime * 2.5 + hash(sc + 1.3) * 20.0));
  night += st * 0.35 * smoothstep(0.1, 0.4, up);
  return mix(day, night, uNight);
}
vec3 film(float t){ return 0.5 + 0.5 * cos(6.2831 * (t + vec3(0.0, 0.33, 0.67))); }

void main(){
  vec2 world = (gl_FragCoord.xy - uRes * 0.5) / uCam.z + uCam.xy;
  float e = uTexel;
  vec2 pc = world - 0.5;
  float dPond = length(pc);
  float waterMask = 1.0 - smoothstep(uPondR - 0.0015, uPondR + 0.0015, dPond);

  // ---- bank ----
  vec3 bank;
  {
    vec3 b = texture(uBed, world * 0.42).rgb;
    b = mix(b, vec3(0.70, 0.62, 0.48), 0.30) * 1.08;
    float moss = smoothstep(0.50, 0.80, fbm(world * 6.0 + 40.0));
    b = mix(b, vec3(0.22, 0.36, 0.15), moss * 0.55);
    float wet = 1.0 - smoothstep(uPondR, uPondR + 0.035, dPond);
    b *= 1.0 - 0.45 * wet;
    bank = b;
  }

  // ---- surface height, slope, laplacian ----
  vec2 uv = clamp(world, 0.0, 1.0);
  float h  = texture(uH, uv).r;
  float hl = texture(uH, uv - vec2(e, 0.0)).r, hr = texture(uH, uv + vec2(e, 0.0)).r;
  float hd = texture(uH, uv - vec2(0.0, e)).r, hu = texture(uH, uv + vec2(0.0, e)).r;
  vec2 g = vec2(hr - hl, hu - hd) / (2.0 * e);
  // Laplacian on a 2-texel stencil: blind to grid-scale noise, smoother caustics.
  float l2 = texture(uH, uv - vec2(2.0 * e, 0.0)).r + texture(uH, uv + vec2(2.0 * e, 0.0)).r
           + texture(uH, uv - vec2(0.0, 2.0 * e)).r + texture(uH, uv + vec2(0.0, 2.0 * e)).r;
  float lap = (l2 - 4.0 * h) * 0.25;

  for (int i = 0; i < 6; i++) {
    vec4 f = uFeet[i];
    if (f.w <= 0.001) continue;
    vec2 dv = world - f.xy;
    float r2 = dot(dv, dv);
    float s2 = f.z * f.z;
    if (r2 > s2 * 9.0) continue;
    float gs = exp(-r2 / s2) * f.w * 0.016;
    h -= gs;
    g += gs * 2.0 * dv / s2;
    lap -= gs * (4.0 * r2 / (s2 * s2) - 4.0 / s2) * e * e;
  }
  if (uFishState.z > 0.5 && uFishState.x > 0.55) {
    vec2 dv = world - uFish.xy;
    float s = uFish.w * 1.4;
    float s2 = s * s;
    float r2 = dot(dv, dv);
    if (r2 < s2 * 9.0) {
      float amp = (uFishState.x - 0.55) / 0.45 * 0.035;
      float b = exp(-r2 / s2) * amp;
      h += b;
      g -= b * 2.0 * dv / s2;
      lap += b * (4.0 * r2 / (s2 * s2) - 4.0 / s2) * e * e;
    }
  }

  float depthF = smoothstep(uPondR, uPondR - 0.10, dPond);
  vec2 gs2 = g * uNormalScale;
  gs2 /= 1.0 + length(gs2) * 0.6;
  if (uMicro > 0.0) {
    // wind-driven capillary texture: far below the sim's resolution, render-only,
    // and it is what makes the sun glitter.
    vec2 mp = world * 380.0 + uWind * uTime * 22.0;
    float m0 = noise(mp), mx = noise(mp + vec2(0.9, 0.0)), my = noise(mp + vec2(0.0, 0.9));
    gs2 += vec2(mx - m0, my - m0) * uMicro * depthF;
  }
  vec3 n = normalize(vec3(-gs2, 1.0));
  vec3 V = normalize(vec3(-(world - uCam.xy) * 0.35, 1.0));
  float NdV = clamp(dot(n, V), 0.0, 1.0);

  // ---- refraction & floor ----
  vec2 refr = n.xy * (-0.045) * (0.3 + 0.7 * depthF);
  vec2 fuv = world + refr;
  vec3 bed = texture(uBed, fuv * 0.72).rgb;

  float sunUp = (1.0 - uNight) * (1.0 - uStorm * 0.75);
  float ca = 1.0 / max(1.0 + uCaustic * lap, 0.3);
  ca = min(ca, 2.6);
  ca = pow(ca, 1.25);
  vec3 light = vec3(mix(1.0, ca, 0.9 * sunUp + 0.1));

  // shadows on the floor: leg dimples (flower shadow) + body
  vec2 shOff = -uSun.xy * 0.06 * (0.3 + 0.7 * depthF);
  float sh = 1.0;
  float rim = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 f = uFeet[i];
    if (f.w <= 0.001) continue;
    float d = length(fuv - (f.xy + shOff));
    float rs = f.z * 1.7;
    if (d > rs * 3.0) continue;
    sh *= 1.0 - 0.85 * f.w * exp(-(d * d) / (rs * rs));
    float q = (d - rs * 1.25) / (rs * 0.26);
    rim += 1.1 * f.w * exp(-q * q);
  }
  if (uBodySize.x > 0.0) {
    vec2 bp = fuv - (uBody.xy + shOff);
    vec2 lp = vec2(bp.x * uBody.z + bp.y * uBody.w, -bp.x * uBody.w + bp.y * uBody.z);
    float db = sdEll(lp, uBodySize.xy);
    sh *= 1.0 - 0.55 * (1.0 - smoothstep(0.0, 0.006, db));
  }
  light = light * sh + vec3(rim * (0.3 + 0.7 * sunUp) * 0.9);

  vec3 under = bed * light;
  vec3 tint = mix(vec3(1.0), vec3(0.50, 0.78, 0.84), depthF * 0.7);
  under *= tint;
  under = mix(under, vec3(0.06, 0.20, 0.26), depthF * 0.42);
  under = mix(under, under * vec3(0.9, 0.95, 1.0), uStorm * 0.3);

  // ---- fish (seen through the surface) ----
  if (uFishState.z > 0.5) {
    float depth = uFishState.x;
    vec2 dv = fuv - uFish.xy;
    float c = cos(uFish.z), s = sin(uFish.z);
    vec2 lp = vec2(dv.x * c + dv.y * s, -dv.x * s + dv.y * c);
    float L = uFish.w;
    if (abs(lp.x) < L * 2.2 && abs(lp.y) < L * 1.2) {
      float body = sdEll(lp - vec2(L * 0.15, 0.0), vec2(L, L * 0.30));
      vec2 tp = lp + vec2(L * 1.05, 0.0);
      float tail = sdEll(tp * vec2(1.0, 1.0 + 2.2 * clamp(-tp.x / (L * 0.5), 0.0, 1.0)), vec2(L * 0.45, L * 0.34));
      float fins = sdEll(lp - vec2(-L * 0.05, 0.0), vec2(L * 0.32, L * 0.60)) + L * 0.06;
      float d = min(body, min(tail, fins));
      float soft = mix(L * 0.30, L * 0.04, depth);
      float a = 1.0 - smoothstep(-soft * 0.4, soft, d);
      a *= mix(0.35, 0.97, depth);
      vec3 fc = mix(vec3(0.09, 0.12, 0.09), vec3(0.36, 0.38, 0.29), smoothstep(-L * 0.1, L * 0.14, lp.y));
      fc += vec3(0.30, 0.26, 0.16) * smoothstep(0.6, 1.0, depth) * 0.6 * (1.0 - smoothstep(0.0, L * 0.2, abs(lp.y)));
      fc *= mix(0.5, 1.0, smoothstep(-L * 0.02, -L * 0.16, d));                 // darker rim
      fc *= 0.9 + 0.2 * noise(lp * (14.0 / L));                                 // scales
      float lat = 1.0 - smoothstep(L * 0.01, L * 0.035, abs(lp.y + L * 0.02)) ;  // lateral line
      fc = mix(fc, fc * 0.6, lat * step(-L * 0.6, lp.x) * step(lp.x, L * 0.9));
      float eye = 1.0 - smoothstep(L * 0.045, L * 0.065, length(lp - vec2(L * 0.88, L * 0.09)));
      fc = mix(fc, vec3(0.02), eye);
      fc = mix(fc, vec3(0.9, 0.85, 0.6), (1.0 - smoothstep(L * 0.018, L * 0.03, length(lp - vec2(L * 0.90, L * 0.11)))) * depth);
      fc *= 1.0 - 0.5 * uNight;
      float mouth = 1.0 - smoothstep(L * 0.14, L * 0.20, length(lp - vec2(L * 1.05, 0.0)));
      fc = mix(fc, vec3(0.95, 0.88, 0.82), mouth * uFishState.y);
      under = mix(under, fc, a);
    }
  }
  // ---- backswimmer (hangs just under the skin) ----
  if (uBug.w > 0.0) {
    vec2 dv = fuv - uBug.xy;
    float c = cos(uBug.z), s = sin(uBug.z);
    vec2 lp = vec2(dv.x * c + dv.y * s, -dv.x * s + dv.y * c);
    float L = uBug.w;
    if (abs(lp.x) < L * 2.0 && abs(lp.y) < L * 1.6) {
      float d = sdEll(lp, vec2(L, L * 0.40));
      float oars = min(sdCapsule(lp, vec2(0.0, L * 0.25), vec2(-L * 0.6, L * 1.35), L * 0.06),
                       sdCapsule(lp, vec2(0.0, -L * 0.25), vec2(-L * 0.6, -L * 1.35), L * 0.06));
      d = min(d, oars);
      float a = 1.0 - smoothstep(0.0, L * 0.10, d);
      vec3 bc = mix(vec3(0.78, 0.74, 0.60), vec3(0.22, 0.20, 0.14), smoothstep(0.0, L * 0.35, abs(lp.y)));
      under = mix(under, bc, a * 0.92);
    }
  }

  // ---- reflection & glints ----
  vec3 R = reflect(-V, n);
  R.z = abs(R.z);
  vec3 sky = skyColor(R);
  float F = 0.10 + 0.90 * pow(1.0 - NdV, 3.0);
  F = clamp(F * 1.2, 0.0, 1.0);
  vec3 Hh = normalize(uSun + V);
  float ndh = max(dot(n, Hh), 0.0);
  float sp = pow(ndh, 1200.0);
  float sp2 = pow(ndh, 48.0);
  float sp3 = pow(ndh, 6.0);
  vec3 sunCol = mix(vec3(1.0, 0.97, 0.90), vec3(1.0, 0.76, 0.50), uDawn);
  vec3 spec = sunCol * (sp * 2.2 + sp2 * 0.14 + sp3 * 0.05) * sunUp;
  spec += vec3(0.6, 0.7, 1.0) * (sp * 0.9 + sp2 * 0.08) * uNight;

  vec3 col = mix(under, sky, F) + spec;
  col *= mix(vec3(1.0), vec3(1.06, 0.97, 0.88), uDawn * (1.0 - uNight));

  float crest = smoothstep(0.05, 0.14, h);
  col += vec3(0.40, 0.44, 0.48) * crest * 0.25 * (1.0 - uNight);

  // ---- oil / soap slicks ----
  float slickM = 0.0;
  for (int i = 0; i < 8; i++) {
    if (i >= uNumSlick) break;
    vec4 sl = uSlick[i];
    float dd = length(world - sl.xy);
    if (dd > sl.z * 1.3) continue;
    float wob = 1.0 + 0.16 * (noise(world * 40.0 + sl.xy * 77.0 + uTime * 0.3) - 0.5);
    float d = dd / (sl.z * wob);
    slickM = max(slickM, 1.0 - smoothstep(0.72, 1.0, d));
  }
  if (slickM > 0.0) {
    float th = fbm(world * 26.0 + uTime * 0.06) * 2.6 + dot(n.xy, vec2(3.0)) + NdV * 2.0;
    vec3 rainbow = film(th);
    rainbow = mix(vec3(dot(rainbow, vec3(0.33))), rainbow, 0.75);
    vec3 sheen = mix(col, rainbow * 0.85 + 0.1, 0.5);
    sheen = mix(sheen, sky, 0.35);
    col = mix(col, sheen, slickM * 0.8);
  }

  // ---- night glow ----
  if (uNight > 0.0) {
    float slopeMag = length(g);
    // luminous lines along moving water: slopes glow, crests glow brighter
    float lines = smoothstep(1.2, 5.0, slopeMag);
    float crests = smoothstep(0.03, 0.10, h);
    float glowA = lines * 0.22 + crests * 0.35;
    vec3 bio = mix(vec3(0.05, 0.5, 0.7), vec3(0.4, 0.95, 1.0), crests);
    col += bio * glowA * uNight * uGlow;
    col *= 1.0 - 0.2 * uNight * smoothstep(0.0, -0.04, h);
  }

  // ---- ghost marker (friend's best run) ----
  if (uGhost.w > 0.0) {
    float dg = length(world - uGhost.xy);
    float ring = exp(-pow((dg - uGhost.z) / (uGhost.z * 0.25), 2.0));
    col += vec3(0.4, 0.8, 1.0) * ring * uGhost.w * 0.35;
  }

  // ---- sense fog ----
  if (uFog > 0.0) {
    float ds = length(world - uStriderPos);
    float fog = smoothstep(uSenseR, uSenseR + 0.22, ds) * uFog;
    col = mix(col, vec3(0.02, 0.03, 0.05), fog * 0.88);
  }

  vec3 outc = mix(bank, col, waterMask);
  float rimShade = smoothstep(uPondR - 0.03, uPondR, dPond) * waterMask;
  outc *= 1.0 - 0.28 * rimShade;
  vec3 nightBank = outc * vec3(0.10, 0.12, 0.20);
  outc = mix(outc, nightBank, uNight * (1.0 - waterMask));
  outc = mix(outc, outc * vec3(0.75, 0.78, 0.85), uStorm * 0.5 * (1.0 - waterMask));
  frag = vec4(outc, 1.0);
}`;

// ---------------------------------------------------------------------------
// Sprites: instanced quads, SDF shapes selected by type.
// ---------------------------------------------------------------------------
export const spriteVS = `#version 300 es
precision highp float;
layout(location = 0) in vec4 a0; // x, y, size, rot
layout(location = 1) in vec4 a1; // type, p0, p1, p2
layout(location = 2) in vec4 a2; // rgba
uniform vec2 uRes;
uniform vec3 uCam;
out vec2 vL;
flat out vec4 vP;
flat out vec4 vC;
flat out float vPx;
void main(){
  vec2 q = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  vL = q;
  float c = cos(a0.w), s = sin(a0.w);
  vec2 w = a0.xy + mat2(c, s, -s, c) * (q * a0.z);
  vec2 px = (w - uCam.xy) * uCam.z + uRes * 0.5;
  gl_Position = vec4(px / uRes * 2.0 - 1.0, 0.0, 1.0);
  vP = a1; vC = a2;
  vPx = a0.z * uCam.z;
}`;

export const spriteFS = `#version 300 es
precision highp float;
in vec2 vL;
flat in vec4 vP;
flat in vec4 vC;
flat in float vPx;
uniform float uTime;
out vec4 frag;
float aa(float d){ float w = 1.0 / max(vPx, 1.0); return 1.0 - smoothstep(-w, w, d); }
float sdCapsule(vec2 p, vec2 a, vec2 b, float r){
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float sdEll(vec2 p, vec2 r){ return (length(p / r) - 1.0) * min(r.x, r.y); }
vec2 rot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
void main(){
  int t = int(vP.x + 0.5);
  float a = 0.0;
  vec3 col = vC.rgb;
  float r = length(vL);
  if (t == 0) {                       // soft disc: p0 = hardness
    a = 1.0 - smoothstep(vP.y, 1.0, r);
  } else if (t == 1) {                // ring: p0 radius, p1 half width, p2 softness
    float d = abs(r - vP.y) - vP.z;
    a = vP.w > 0.0 ? (1.0 - smoothstep(0.0, vP.w, d)) : aa(d);
  } else if (t == 2) {                // gnat / mosquito: p0 wing phase, p1 kind, p2 stunned
    float kind = vP.z;
    float body = sdEll(vL - vec2(-0.05, 0.0), vec2(0.42 + 0.1 * kind, 0.11 + 0.03 * kind));
    float head = length(vL - vec2(0.42, 0.0)) - 0.11;
    float d = min(body, head);
    float stun = vP.w;
    for (int i = 0; i < 3; i++) {
      float bx = -0.15 + 0.22 * float(i);
      float ly = 0.5 + 0.25 * kind;
      float jitter = 0.12 * sin(uTime * 25.0 + float(i) * 2.1 + vP.y) * (1.0 - stun);
      vec2 f1 = vec2(bx - 0.28 + jitter, ly), f2 = vec2(bx - 0.28 - jitter, -ly);
      d = min(d, sdCapsule(vL, vec2(bx, 0.03), f1, 0.028));
      d = min(d, sdCapsule(vL, vec2(bx, -0.03), f2, 0.028));
    }
    if (kind > 0.5) d = min(d, sdCapsule(vL, vec2(0.45, 0.0), vec2(0.95, 0.0), 0.02));
    a = aa(d);
    float flap = sin(vP.y) * 0.55 * (1.0 - stun);
    vec2 wl = vL - vec2(-0.12, 0.08);
    vec2 wr = vL - vec2(-0.12, -0.08);
    float w1 = sdEll(rot(wl, 1.05 + flap), vec2(0.52, 0.16));
    float w2 = sdEll(rot(wr, -1.05 - flap), vec2(0.52, 0.16));
    float wA = aa(min(w1, w2)) * 0.5;
    col = mix(vec3(0.85, 0.92, 1.0), col, a);
    a = max(a, wA);
  } else if (t == 3) {                // arc: p0 start, p1 end, p2 half thickness, radius 0.8
    float ang = atan(vL.y, vL.x);
    float inA = smoothstep(vP.y - 0.02, vP.y + 0.02, ang) * (1.0 - smoothstep(vP.z - 0.02, vP.z + 0.02, ang));
    float d = abs(r - 0.8) - vP.w;
    a = aa(d) * inA;
  } else if (t == 4) {                // capsule along x: p0 radius
    float d = sdCapsule(vL, vec2(-1.0 + vP.y, 0.0), vec2(1.0 - vP.y, 0.0), vP.y);
    a = aa(d);
  } else if (t == 5) {                // frog: p0 glint, p1 facing angle
    vec2 p = rot(vL, -vP.z);
    float body = sdEll(p - vec2(-0.15, 0.0), vec2(0.7, 0.55));
    float headd = sdEll(p - vec2(0.35, 0.0), vec2(0.45, 0.42));
    float d = min(body, headd);
    float eyeL = length(p - vec2(0.45, 0.28)) - 0.17;
    float eyeR = length(p - vec2(0.45, -0.28)) - 0.17;
    float eyes = min(eyeL, eyeR);
    a = aa(min(d, eyes));
    vec3 skin = col * (0.75 + 0.5 * smoothstep(0.3, -0.5, length(p - vec2(0.2, 0.0))));
    skin = mix(skin, skin * vec3(0.7, 0.9, 0.6), smoothstep(0.0, 0.6, abs(p.y)));
    float eyeA = aa(eyes);
    vec3 eyeC = mix(vec3(0.75, 0.6, 0.15), vec3(1.0, 0.95, 0.7), vP.y);
    float pupil = aa(min(length(p - vec2(0.47, 0.28)) - 0.07, length(p - vec2(0.47, -0.28)) - 0.07));
    eyeC = mix(eyeC, vec3(0.02), pupil);
    float glint = aa(min(length(p - vec2(0.50, 0.33)) - 0.04, length(p - vec2(0.50, -0.23)) - 0.04));
    eyeC = mix(eyeC, vec3(1.0), glint * (0.5 + 0.5 * vP.y));
    col = mix(skin, eyeC, eyeA);
  } else if (t == 6) {                // strider body (long axis = x): p0 sink
    float body = sdEll(vL - vec2(-0.08, 0.0), vec2(0.72, 0.15));
    float thorax = sdEll(vL - vec2(0.28, 0.0), vec2(0.28, 0.20));
    float head = length(vL - vec2(0.70, 0.0)) - 0.13;
    float d = min(min(body, thorax), head);
    float ant = min(sdCapsule(vL, vec2(0.78, 0.04), vec2(1.0, 0.33), 0.022),
                    sdCapsule(vL, vec2(0.78, -0.04), vec2(1.0, -0.33), 0.022));
    d = min(d, ant);
    a = aa(d);
    float stripe = smoothstep(0.08, 0.0, abs(vL.y - 0.03)) * step(-0.65, vL.x) * step(vL.x, 0.55);
    col = col * (0.85 + 0.35 * stripe);
    col = mix(col, vec3(0.80, 0.78, 0.70), smoothstep(0.03, 0.0, abs(vL.y + 0.07)) * 0.35 * step(-0.6, vL.x) * step(vL.x, 0.5));
    float eye = aa(min(length(vL - vec2(0.72, 0.09)) - 0.045, length(vL - vec2(0.72, -0.09)) - 0.045));
    col = mix(col, vec3(0.05), eye);
    col = mix(col, vec3(0.35, 0.4, 0.5), vP.y * 0.5);
  } else if (t == 7) {                // splash crown: p0 radius 0..1, p1 fade
    float ringd = abs(r - vP.y) - 0.045;
    a = aa(ringd) * 0.55;
    float ang = atan(vL.y, vL.x);
    float k = floor((ang / 6.2831 + 0.5) * 12.0);
    float seg = 6.2831 / 12.0;
    float an = (k + 0.5) * seg - 3.1416;
    float jitter = fract(sin(k * 12.9898 + vP.w) * 43758.5);
    vec2 dp = vec2(cos(an), sin(an)) * (vP.y * (1.1 + 0.35 * jitter));
    a = max(a, aa(length(vL - dp) - (0.05 + 0.04 * jitter)));
    a *= vP.z;
  } else if (t == 8) {                // spark / star glow
    a = pow(max(0.0, 1.0 - r), 3.0);
    a += pow(max(0.0, 1.0 - abs(vL.x) * 4.0), 6.0) * pow(max(0.0, 1.0 - abs(vL.y)), 2.0) * 0.5;
    a += pow(max(0.0, 1.0 - abs(vL.y) * 4.0), 6.0) * pow(max(0.0, 1.0 - abs(vL.x)), 2.0) * 0.5;
    a = min(a, 1.0);
  } else if (t == 9) {                // raindrop shadow: p0 softness, falling disc
    a = (1.0 - smoothstep(vP.y, 1.0, r)) * (0.75 + 0.25 * (1.0 - smoothstep(0.0, 0.5, r)));
  } else if (t == 10) {               // joystick base/knob ring
    float d = abs(r - 0.9) - 0.06;
    a = aa(d) * 0.6 + (1.0 - smoothstep(0.0, 0.9, r)) * 0.08;
  }
  frag = vec4(col * a * vC.a, a * vC.a);
}`;

// ---------------------------------------------------------------------------
// Post: downsample, separable blur, composite (tilt-shift + bloom + grade).
// ---------------------------------------------------------------------------
export const downFS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 frag;
void main(){
  vec3 c = texture(uSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb
         + texture(uSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  frag = vec4(c * 0.25, 1.0);
}`;

export const blurFS = `#version 300 es
precision highp float;
uniform sampler2D uSrc;
uniform vec2 uDir;
in vec2 vUv;
out vec4 frag;
void main(){
  vec3 c = texture(uSrc, vUv).rgb * 0.2270270270;
  c += texture(uSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  c += texture(uSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  c += texture(uSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  frag = vec4(c, 1.0);
}`;

export const compositeFS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBlur;
uniform float uDof;
uniform float uBloom;
uniform float uBloomThr;
uniform float uAspect;
uniform float uFocusY;
uniform float uNight;
uniform float uFlash;
uniform float uVignette;
uniform float uTime;
in vec2 vUv;
out vec4 frag;
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
void main(){
  vec3 sharp = texture(uScene, vUv).rgb;
  vec3 blur = texture(uBlur, vUv).rgb;
  float band = abs(vUv.y - uFocusY);
  float dof = uDof * smoothstep(0.22, 0.6, band);
  vec3 col = mix(sharp, blur, dof);
  float lum = dot(blur, vec3(0.299, 0.587, 0.114));
  col += blur * smoothstep(uBloomThr, uBloomThr + 0.8, lum) * uBloom;
  vec2 vq = (vUv - 0.5) * vec2(uAspect, 1.0);
  float vig = 1.0 - uVignette * pow(clamp(length(vq) * 1.05, 0.0, 1.0), 2.5);
  col *= vig;
  col = mix(col, vec3(1.0), uFlash);
  col = col / (1.0 + col * 0.10);
  col = clamp(col, 0.0, 1.0);
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = clamp(mix(vec3(l), col, 1.12), 0.0, 1.0);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.3);
  col += (hash(vUv * 1000.0 + fract(uTime)) - 0.5) * 0.012;
  frag = vec4(col, 1.0);
}`;
