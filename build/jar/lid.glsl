
// lid.glsl: the knurled ribs round the screw band (metal only: the labels sit at uv.y > 0.35)
void p0Surface(inout P0Surface s) {
  vec3 P = s.position;
  float r = length(P.xz);
  if (s.uv.y < 0.35 && r > 5.1 && P.y > 16.4 && P.y < 18.4) {
    float a = atan(P.z, P.x);
    vec3 tg = vec3(-sin(a), 0.0, cos(a));
    s.normal = normalize(s.normal + tg * 0.45 * sin(a * 180.0));
  }
}
