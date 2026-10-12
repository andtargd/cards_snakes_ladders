
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

// specimens.glsl: bubbles (uv.y 3..5) rise and wobble; the optic nerves (uv.y > 5) wriggle at their loose ends
vec3 p0Vertex(vec3 position, vec3 normal, vec2 uv) {
  float t = p0Time;
  if (uv.y > 5.0) {
    float s = clamp((uv.y - 5.5) / 0.45, 0.0, 1.0), ph = uv.x * 9.0;
    position.x += sin(t * 1.3 + s * 3.2 + ph) * 0.28 * s * s;
    position.y += cos(t * 1.05 + s * 2.6 + ph) * 0.2 * s * s;
  } else if (uv.y > 3.0) {
    float r = uv.x - 2.0, ph = (uv.y - 3.5) / 0.45 * 6.2832;
    vec3 c = position - normal * r;
    float speed = 0.45 + r * 6.0, H = LEVEL - YB - 0.5;
    c.y = YB + 0.2 + mod(c.y - YB + t * speed, H);
    c.x += sin(t * 2.3 + ph) * 0.1;
    c.z += cos(t * 1.9 + ph * 1.3) * 0.1;
    float sq = 1.0 + 0.12 * sin(t * 9.0 + ph);
    position = c + normal * r * vec3(sq, 0.88 / sq, sq);
  }
  return position;
}
