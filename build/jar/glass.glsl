
const float LEVEL = 14.200;
const float RW = 5.700;
const float YB = 0.560;
const vec3 SUN = vec3(-0.27, 0.9, 0.34); // towards the light, roughly unit length
const vec3 SIGMA = vec3(0.05, 0.03, 0.085); // absorption per metre: the green survives
float wave(vec2 p, float t) {
  float r = length(p);
  return 0.065 * sin(0.55 * p.x + 0.9 * t) + 0.05 * sin(0.72 * p.y - 0.7 * t + 1.3)
    + 0.03 * sin(1.3 * (p.x * 0.8 + p.y * 0.6) + 1.6 * t) + 0.022 * sin(1.9 * (-p.x * 0.5 + p.y * 0.86) - 2.1 * t + 0.4)
    + 0.018 * sin(3.1 * r - 2.4 * t) * exp(-r * 0.25);
}

// entry and exit distances of the ray o + t d through the water cylinder (no hit: x > y)
vec2 cylHit(vec3 o, vec3 d) {
  float t0 = -1e9, t1 = 1e9;
  float a = dot(d.xz, d.xz), b = dot(o.xz, d.xz), c = dot(o.xz, o.xz) - RW * RW;
  if (a > 1e-7) {
    float h = b * b - a * c;
    if (h < 0.0) return vec2(1.0, -1.0);
    h = sqrt(h); t0 = (-b - h) / a; t1 = (-b + h) / a;
  } else if (c > 0.0) return vec2(1.0, -1.0);
  if (abs(d.y) > 1e-7) {
    float ta = (YB - o.y) / d.y, tb = (LEVEL - o.y) / d.y;
    t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb));
  } else if (o.y < YB || o.y > LEVEL) return vec2(1.0, -1.0);
  return vec2(t0, t1);
}
// two drifting layers of one tileable caustic, crossed: the light the rippling surface focuses
float caus(vec2 xz, float bias) {
  float t = p0Time;
  float a = texture(causticMap, xz * 0.17 + vec2(t * 0.021, t * 0.013), bias).r;
  float b = texture(causticMap, xz * 0.23 + vec2(-t * 0.017, t * 0.019) + 0.37, bias).r;
  return min(a, b) * 1.7;
}

// glass.glsl: thick glass, and below the waterline clear emerald water with light shafts in it
void p0Surface(inout P0Surface s) {
  vec3 P = s.position;
  vec3 V = -s.view;
  float ndv = clamp(abs(dot(s.normal, s.view)), 0.0, 1.0);
  float fr = pow(1.0 - ndv, 2.6);
  float r = length(P.xz);
  bool top = s.uv.y > 2.0;
  float line = LEVEL + wave(P.xz, p0Time);
  s.roughness = 0.04;
  s.metalness = 0.0;
  if (!top && !(r > RW && P.y < line && P.y > YB - 0.4)) {
    // plain glass: nearly clear face on, darker and greener where it is seen edge on
    s.color = vec3(0.09, 0.15, 0.14);
    s.alpha = clamp(0.07 + 0.62 * fr, 0.0, 0.92);
    return;
  }
  if (top) {
    // fine ripples on the surface
    float e = 0.05, t = p0Time;
    float gx = (wave(P.xz + vec2(e, 0.0), t) - wave(P.xz - vec2(e, 0.0), t)) / (2.0 * e);
    float gz = (wave(P.xz + vec2(0.0, e), t) - wave(P.xz - vec2(0.0, e), t)) / (2.0 * e);
    s.normal = normalize(vec3(-gx + 0.06 * sin(2.7 * P.x + 3.1 * t), 1.0, -gz + 0.06 * sin(2.9 * P.z - 2.7 * t)));
  }
  // march the view ray through the water; at each step look up to the surface for the light it lets in
  vec2 h = cylHit(P - V * 0.05, V);
  float t0 = max(h.x, 0.0), t1 = max(h.y, t0);
  float len = t1 - t0;
  vec3 scat = vec3(0.0);
  float dt = len / 8.0;
  for (int i = 0; i < 8; i++) {
    float t = t0 + (float(i) + 0.5) * dt;
    vec3 Q = P + V * t;
    float dS = max(LEVEL - Q.y, 0.0) / SUN.y;
    vec2 qq = Q.xz + SUN.xz * dS;
    float c = texture(causticMap, qq * 0.17 + vec2(p0Time * 0.021, p0Time * 0.013), 2.5 + dS * 0.1).r * 1.2;
    float shaft = step(length(qq), RW) * (0.15 + 3.2 * c * c);
    scat += (vec3(1.0, 0.95, 0.85) * shaft * exp(-SIGMA * dS) + vec3(0.01, 0.06, 0.04)) * exp(-SIGMA * (t - t0)) * dt;
  }
  s.color = vec3(0.02, 0.3, 0.16);
  s.emissive = scat * vec3(0.045, 0.2, 0.13);
  s.alpha = clamp(0.16 + (1.0 - exp(-len * 0.09)) * 0.3 + fr * 0.3, 0.0, 0.93);
  if (top) {
    s.alpha = 0.6;
    s.emissive += vec3(0.1, 0.4, 0.26) * caus(P.xz, 0.0) * 0.3;
  } else {
    // the meniscus: a bright line where the water meets the glass
    float men = max(line - P.y, 0.0);
    s.emissive += vec3(0.3, 0.85, 0.6) * (exp(-pow(men / 0.06, 2.0)) * 0.8 + exp(-men / 0.35) * 0.1);
  }
}
