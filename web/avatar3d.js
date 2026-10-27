/* =====================================================================
   3D-AVATAR — een arc-reactor-achtige kern met ringen en een deeltjeswolk.
   index.html levert `tick()`, `state`, `level` (0..1) en `vis` (listen,
   think, bright); deze module tekent elk frame op <canvas id="c">.
   ===================================================================== */
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 0, 9);

const BLUE = new THREE.Color('#1f6bff'), CYAN = new THREE.Color('#5fe3ff'), GOLD = new THREE.Color('#ffb547');
const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const lineGlow = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });

/* ---- kern: draadmodel + gloeiend hart ---- */
const core = new THREE.Group();
const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.25, 1)), lineGlow(CYAN, 0.85));
const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.8, 0)), lineGlow(BLUE, 0.9));
const heart = new THREE.Mesh(new THREE.SphereGeometry(0.42, 32, 32), glow(CYAN, 0.9));
const halo = new THREE.Mesh(new THREE.SphereGeometry(0.75, 32, 32), glow(BLUE, 0.18));
core.add(shell, inner, heart, halo);
scene.add(core);

/* ---- ringen in de stijl van een HUD: onderbroken bogen ---- */
function dashedRing(radius, segments, gap, width, opacity) {
  const g = new THREE.Group();
  for (let i = 0; i < segments; i++) {
    const arc = (Math.PI * 2) / segments;
    const geo = new THREE.RingGeometry(radius, radius + width, 48, 1, i * arc, arc * (1 - gap));
    g.add(new THREE.Mesh(geo, glow(BLUE, opacity)));
  }
  return g;
}
const rings = [dashedRing(2.0, 24, 0.35, 0.05, 0.75), dashedRing(2.35, 6, 0.12, 0.025, 0.6), dashedRing(2.75, 60, 0.5, 0.08, 0.35)];
rings[1].rotation.x = 1.15; rings[2].rotation.x = -0.35;
rings.forEach(r => scene.add(r));

/* ---- deeltjeswolk rond de kern ---- */
const N = 900, pos = new Float32Array(N * 3), dirs = [];
for (let i = 0; i < N; i++) {
  const v = new THREE.Vector3().randomDirection();
  dirs.push({ v, r: 3.1 + Math.random() * 0.9, s: 0.4 + Math.random() });
}
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const pMat = new THREE.PointsMaterial({ color: CYAN, size: 0.035, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false });
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // op smalle schermen iets verder weg, zodat de ringen passen
  camera.position.z = w < h ? 9 * Math.min(1.8, h / w) : 9;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

const tmp = new THREE.Color();
let last = performance.now(), spin = 0;
function frame(now) {
  tick(now);   // index.html werkt state, level en vis bij
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  const lv = level, think = vis.think, listen = vis.listen, bright = vis.bright;

  // kleur: blauw in rust, cyaan bij luisteren, een vleugje goud bij nadenken
  tmp.copy(BLUE).lerp(CYAN, listen * 0.8 + lv * 0.4).lerp(GOLD, think * 0.35);
  heart.material.color.copy(tmp).lerp(CYAN, 0.5);
  halo.material.color.copy(tmp);
  rings.forEach(r => r.children.forEach(m => m.material.color.copy(tmp)));

  // grootte en gloed volgen het geluidsniveau
  const pulse = 1 + lv * 0.45;
  heart.scale.setScalar(0.8 + lv * 0.9);
  halo.scale.setScalar(pulse * 1.1);
  halo.material.opacity = 0.1 + lv * 0.35;
  shell.scale.setScalar(pulse);
  shell.material.opacity = 0.35 + 0.5 * bright;
  inner.material.opacity = 0.4 + 0.5 * bright;

  // draaien: sneller bij nadenken
  spin += dt * (0.25 + think * 1.6 + lv * 0.6);
  core.rotation.set(spin * 0.6, spin, 0);
  inner.rotation.set(-spin * 1.4, spin * 0.5, 0);
  rings[0].rotation.z = spin * 0.5;
  rings[1].rotation.z = -spin * 0.9;
  rings[1].rotation.y = Math.sin(t * 0.3) * 0.3;
  rings[2].rotation.z = spin * 0.25;
  rings.forEach((r, i) => r.scale.setScalar(1 + lv * (0.08 + i * 0.04) + listen * 0.06));

  // deeltjes ademen mee en trekken samen bij luisteren
  for (let i = 0; i < N; i++) {
    const d = dirs[i];
    const r = d.r * (1 - listen * 0.15) + Math.sin(t * d.s + i) * 0.08 + lv * 0.6 * d.s;
    pos[i * 3] = d.v.x * r; pos[i * 3 + 1] = d.v.y * r; pos[i * 3 + 2] = d.v.z * r;
  }
  pGeo.attributes.position.needsUpdate = true;
  particles.rotation.y = -spin * 0.15;
  pMat.opacity = 0.25 + 0.5 * bright;
  pMat.color.copy(tmp).lerp(CYAN, 0.4);

  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
