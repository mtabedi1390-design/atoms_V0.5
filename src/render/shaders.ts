export const POINT_VERT = /* glsl */ `
precision highp float;
attribute float aDensity;
attribute float aPhase;
uniform float uPointSize;
uniform float uMaxDensity;
uniform float uCutoff;        // relative density cutoff in [0,1] (log-scaled fraction)
uniform int   uSliceAxis;     // -1 none, 0 x, 1 y, 2 z
uniform float uSlicePos;      // pm
uniform float uSliceHalf;     // half-thickness pm
uniform float uPixelRatio;
varying float vRel;
varying float vPhase;
varying float vDiscard;

void main() {
  // log-relative density in [0,1]
  float rel = log(1.0 + 1000.0 * aDensity / uMaxDensity) / log(1001.0);
  vRel = rel;
  vPhase = aPhase;
  float disc = rel < uCutoff ? 1.0 : 0.0;
  if (uSliceAxis >= 0) {
    float c = uSliceAxis == 0 ? position.x : (uSliceAxis == 1 ? position.y : position.z);
    if (abs(c - uSlicePos) > uSliceHalf) disc = 1.0;
  }
  vDiscard = disc;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float dist = max(-mv.z, 1.0);
  gl_PointSize = disc > 0.5 ? 0.0 : clamp(uPointSize * uPixelRatio * (300.0 / dist), 1.0, 64.0);
}
`;

export const POINT_FRAG = /* glsl */ `
precision highp float;
uniform int   uColorMode;   // 0 density heat, 1 real phase, 2 complex phase, 3 flat layer colour
uniform vec3  uLayerColor;
uniform float uOpacity;
uniform float uBrightness;
varying float vRel;
varying float vPhase;
varying float vDiscard;

vec3 heat(float v) {
  // black → violet → red → orange → yellow → white (ported from heatmap_fire in atom_realtime.cpp)
  vec3 c0 = vec3(0.0), c1 = vec3(0.5, 0.0, 0.99), c2 = vec3(0.8, 0.0, 0.0),
       c3 = vec3(1.0, 0.5, 0.0), c4 = vec3(1.0, 1.0, 0.0), c5 = vec3(1.0);
  float s = v * 5.0;
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  if (s < 4.0) return mix(c3, c4, s - 3.0);
  return mix(c4, c5, s - 4.0);
}
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
void main() {
  if (vDiscard > 0.5) discard;
  vec2 d = gl_PointCoord - 0.5;
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float soft = smoothstep(0.25, 0.05, r2);
  vec3 col;
  if (uColorMode == 0) col = heat(0.15 + 0.85 * vRel);
  else if (uColorMode == 1) col = vPhase > 0.0 ? vec3(0.95, 0.45, 0.10) : vec3(0.15, 0.55, 1.0); // + orange, − blue
  else if (uColorMode == 2) col = hsv2rgb(vec3((vPhase + 3.14159265) / 6.2831853, 0.85, 1.0));
  else col = uLayerColor;
  float a = soft * uOpacity * (0.25 + 0.75 * vRel) * uBrightness;
  gl_FragColor = vec4(col * a, a);
}
`;
