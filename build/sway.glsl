// sway.glsl: the giant ladder rocks on its foot and the coiled snake rocks with it; its neck waves.
// Positions come in the lot's metres; the diorama is turned half round in the lot, so the maths runs in the
// diorama's own frame (x and z flipped). The ladder sits in the snake texture's white band (v > 0.9).
const vec3 FOOT = vec3(-4.10000, 1.01000, 2.90000);
const vec3 FACE = vec3(0.20122, 0.24196, 0.94919);
const vec3 ACROSS = vec3(0.76887, -0.63941, 0.00000);
const float PERIOD = 1.5000;
const float BODY = 27.8857;
const float NECK = 0.7792;
vec3 turnAround(vec3 v, vec3 k, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
}
vec3 p0Vertex(vec3 position, vec3 normal, vec2 uv) {
  float t = p0Time;
  vec3 p = vec3(-position.x, position.y, -position.z);
  float a1 = sin(t * 0.8) * 0.02 + sin(t * 1.9) * 0.004;
  float a2 = sin(t * 0.55) * 0.02;
  vec3 rocked = FOOT + turnAround(turnAround(p - FOOT, ACROSS, a2), FACE, a1);
  float ladder = step(0.9, uv.y);
  float follow = max(ladder, smoothstep(1.0, 3.6, p.y));
  float along = uv.x * PERIOD / BODY;
  float neck = (1.0 - ladder) * pow(clamp((along - NECK) / (1.0 - NECK), 0.0, 1.0), 1.6);
  vec3 wave = vec3(sin(t * 0.9) * 0.32, sin(t * 1.3) * 0.1, sin(t * 0.65) * 0.22);
  vec3 r = mix(p, rocked, follow) + wave * neck;
  return vec3(-r.x, r.y, -r.z);
}
