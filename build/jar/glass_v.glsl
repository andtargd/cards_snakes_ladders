
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

// the water's surface (uv.y > 2) swells and ripples
vec3 p0Vertex(vec3 position, vec3 normal, vec2 uv) {
  if (uv.y > 2.0) position.y += wave(position.xz, p0Time);
  return position;
}
