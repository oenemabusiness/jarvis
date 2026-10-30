/* =====================================================================
   3D-AVATAR — een futuristische arc-reactor-kern in een HUD-vizier, met
   gloed (bloom). index.html levert `tick()`, `state`, `level` (0..1) en
   `vis` (listen, think, bright); deze module tekent elk frame op <canvas id="c">.
   ===================================================================== */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#03060f');
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

const BLUE = new THREE.Color('#1f6bff'), CYAN = new THREE.Color('#5fe3ff'), GOLD = new THREE.Color('#ffb547');
const glow = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
const lineGlow = (color, opacity) => new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false });
const tinted = [];   // materialen die meekleuren met de toestand

/* ---- kern: draadmodel + gloeiend hart ---- */
const core = new THREE.Group();
const shell = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(1.1, 1)), lineGlow(CYAN, 0.8));
const inner = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.7, 0)), lineGlow(BLUE, 0.9));
const heart = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 32), glow(CYAN, 1));
const halo = new THREE.Mesh(new THREE.SphereGeometry(0.6, 32, 32), glow(BLUE, 0.15));
core.add(shell, inner, heart, halo);
scene.add(core);

/* ---- HUD-vizier: alles in één groep die plat naar de kijker staat ---- */
const hud = new THREE.Group();
scene.add(hud);

function arc(r, w, start, len, color, opacity) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r, r + w, 96, 1, start, len), glow(color, opacity));
  tinted.push(m.material);
  return m;
}
function dashedRing(r, segments, gap, w, opacity) {
  const g = new THREE.Group(), step = (Math.PI * 2) / segments;
  for (let i = 0; i < segments; i++) g.add(arc(r, w, i * step, step * (1 - gap), BLUE, opacity));
  return g;
}
// maatstreepjes rond de buitenrand, elke tiende langer
function ticks(r, count, short, long, opacity) {
  const pts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2, l = i % 10 === 0 ? long : short;
    pts.push(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * (r + l), Math.sin(a) * (r + l), 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const m = new THREE.LineSegments(geo, lineGlow(CYAN, opacity));
  tinted.push(m.material);
  return m;
}
const thin = r => { const m = arc(r, 0.008, 0, Math.PI * 2, CYAN, 0.35); return m; };

const ringA = dashedRing(1.75, 36, 0.4, 0.04, 0.8);
const ringB = new THREE.Group();          // drie brede segmenten, draaien tegengesteld
for (let i = 0; i < 3; i++) ringB.add(arc(2.0, 0.07, i * (Math.PI * 2 / 3), Math.PI / 2.4, BLUE, 0.55));
const tickRing = ticks(2.35, 120, 0.06, 0.16, 0.6);
const scanner = arc(2.18, 0.12, 0, Math.PI / 5, CYAN, 0.35);    // draaiende scanbundel
const ringC = dashedRing(2.75, 90, 0.55, 0.05, 0.3);
const brackets = new THREE.Group();       // vier hoekhaken als een vizier
for (let i = 0; i < 4; i++) brackets.add(arc(3.05, 0.03, i * Math.PI / 2 + 0.2, Math.PI / 2 - 0.4, CYAN, 0.5));
hud.add(thin(1.55), ringA, ringB, tickRing, scanner, ringC, thin(2.95), brackets);

// kleine 'satellieten' die over een schuine baan om de kern draaien
const sats = [0, 1, 2].map(i => {
  const orbit = new THREE.Group();
  orbit.rotation.set(1.1 + i * 0.35, i * 2.1, 0);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.045, 12, 12), glow(CYAN, 1));
  const path = new THREE.Mesh(new THREE.RingGeometry(1.45, 1.455, 128), glow(BLUE, 0.18));
  orbit.add(path, dot);
  scene.add(orbit);
  return { orbit, dot, speed: 0.6 + i * 0.25, phase: i * 2 };
});

/* ---- fijne deeltjes rond het geheel ---- */
const N = 500, pos = new Float32Array(N * 3), dirs = [];
for (let i = 0; i < N; i++) dirs.push({ v: new THREE.Vector3().randomDirection(), r: 3.2 + Math.random() * 0.8, s: 0.4 + Math.random() });
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
const pMat = new THREE.PointsMaterial({ color: CYAN, size: 0.022, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false });
const particles = new THREE.Points(pGeo, pMat);
scene.add(particles);

/* ---- gloed ---- */
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.5, 0.1);
composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h);   // ook de CSS-maat, anders wordt het beeld op Retina-schermen dubbel zo groot
  composer.setSize(w, h);
  camera.aspect = w / h;
  // het geheel beslaat iets minder dan de helft van de schermhoogte; op smalle schermen verder weg
  camera.position.set(0, 0, w < h ? 15 * Math.min(1.8, h / w) : 15);
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
  heart.material.color.copy(tmp).lerp(CYAN, 0.6);
  halo.material.color.copy(tmp);
  tinted.forEach(m => m.color.copy(tmp).lerp(CYAN, 0.25));

  // grootte en gloed volgen het geluidsniveau
  const pulse = 1 + lv * 0.35;
  heart.scale.setScalar(0.85 + lv * 0.8);
  halo.scale.setScalar(pulse * 1.1);
  halo.material.opacity = 0.08 + lv * 0.3;
  shell.scale.setScalar(pulse);
  shell.material.opacity = 0.3 + 0.5 * bright;
  inner.material.opacity = 0.4 + 0.5 * bright;
  bloom.strength = 0.7 + bright * 0.4 + lv * 0.6;

  // draaien: sneller bij nadenken
  spin += dt * (0.25 + think * 1.6 + lv * 0.6);
  core.rotation.set(spin * 0.6, spin, 0);
  inner.rotation.set(-spin * 1.4, spin * 0.5, 0);
  ringA.rotation.z = spin * 0.5;
  ringB.rotation.z = -spin * 0.8;
  tickRing.rotation.z = -spin * 0.08;
  scanner.rotation.z = -t * (1.2 + think * 3);
  scanner.material.opacity = 0.2 + 0.3 * bright;
  ringC.rotation.z = spin * 0.2;
  brackets.rotation.z = Math.sin(t * 0.4) * 0.05;
  hud.scale.setScalar(1 + lv * 0.06 - listen * 0.04);
  hud.rotation.x = Math.sin(t * 0.25) * 0.08;      // licht kantelen voor diepte
  hud.rotation.y = Math.cos(t * 0.2) * 0.08;
  sats.forEach(s => {
    const a = t * s.speed * (1 + think) + s.phase;
    s.dot.position.set(Math.cos(a) * 1.45, Math.sin(a) * 1.45, 0);
  });

  // deeltjes ademen mee en trekken samen bij luisteren
  for (let i = 0; i < N; i++) {
    const d = dirs[i];
    const r = d.r * (1 - listen * 0.12) + Math.sin(t * d.s + i) * 0.06 + lv * 0.4 * d.s;
    pos[i * 3] = d.v.x * r; pos[i * 3 + 1] = d.v.y * r; pos[i * 3 + 2] = d.v.z * r;
  }
  pGeo.attributes.position.needsUpdate = true;
  particles.rotation.y = -spin * 0.15;
  pMat.opacity = 0.2 + 0.45 * bright;
  pMat.color.copy(tmp).lerp(CYAN, 0.4);

  composer.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
