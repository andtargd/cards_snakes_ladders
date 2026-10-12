
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

// the brain, the eyes and the bubbles: caustic light dancing over them under the water
void p0Surface(inout P0Surface s) {
  bool bubble = s.uv.y > 3.0 && s.uv.y < 5.0;
  if (bubble) {
    // underwater a bubble is a little mirror
    float rim = pow(1.0 - clamp(abs(dot(s.normal, s.view)), 0.0, 1.0), 2.0);
    s.color = vec3(0.9, 1.0, 0.95);
    s.metalness = 0.2;
    s.roughness = 0.08;
    s.emissive += vec3(0.2, 0.55, 0.4) * (0.3 + rim);
    return;
  }
  s.roughness = 0.32;
  vec3 P = s.position;
  if (P.y < LEVEL) {
    float dS = max(LEVEL - P.y, 0.0) / SUN.y;
    float c = caus(P.xz + SUN.xz * dS, 0.0);
    float lit = max(dot(s.normal, normalize(SUN)), 0.0);
    s.emissive += s.color * vec3(0.35, 0.9, 0.6) * c * c * lit * 0.8;
  }
}
