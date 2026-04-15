// Generic 3D walkable space built on Three.js.
// Keeps the Portal Protocol (mandatory) and optional Trystero multiplayer
// from the original template — rip those out or keep them as-is.

import * as THREE from 'https://esm.sh/three@0.168.0';

// ------------------------------------------------------------------
// Portal protocol setup
// ------------------------------------------------------------------
const incoming = Portal.readPortalParams();
document.getElementById('username').textContent = incoming.username;
const nextTarget = await Portal.pickPortalTarget();

// ------------------------------------------------------------------
// Renderer & scene
// ------------------------------------------------------------------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0514);
scene.fog = new THREE.FogExp2(0x0a0514, 0.016);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 150);
camera.rotation.order = 'YXZ';

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ------------------------------------------------------------------
// Lighting
// ------------------------------------------------------------------
scene.add(new THREE.AmbientLight(0x3a1060, 1.2));

const sunLight = new THREE.DirectionalLight(0xc0a0ff, 0.7);
sunLight.position.set(10, 20, 5);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(1024, 1024);
scene.add(sunLight);

// Accent point lights at the four corners
const accentColors = [0xc64bff, 0x4ff0ff, 0xff4fd8, 0x4bffdd];
for (let i = 0; i < 4; i++) {
  const angle = (i / 4) * Math.PI * 2;
  const pl = new THREE.PointLight(accentColors[i], 2.5, 28);
  pl.position.set(Math.cos(angle) * 14, 3.5, Math.sin(angle) * 14);
  scene.add(pl);
}

// ------------------------------------------------------------------
// Environment
// ------------------------------------------------------------------
const ROOM = 48; // half-size of the room

// Floor
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM * 2, ROOM * 2),
  new THREE.MeshStandardMaterial({ color: 0x120826, roughness: 0.85, metalness: 0.1 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// Grid overlay
const grid = new THREE.GridHelper(ROOM * 2, 60, 0x2d0a50, 0x180430);
grid.position.y = 0.005;
scene.add(grid);

// Walls
function addWall(w, h, x, y, z, ry) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshStandardMaterial({ color: 0x0d0520, roughness: 0.95, side: THREE.FrontSide })
  );
  mesh.position.set(x, y, z);
  mesh.rotation.y = ry;
  scene.add(mesh);
}
addWall(ROOM * 2, 9, 0,      4.5, -ROOM, 0);
addWall(ROOM * 2, 9, 0,      4.5,  ROOM, Math.PI);
addWall(ROOM * 2, 9, -ROOM,  4.5,  0,    Math.PI / 2);
addWall(ROOM * 2, 9,  ROOM,  4.5,  0,   -Math.PI / 2);

// Ceiling
const ceiling = new THREE.Mesh(
  new THREE.PlaneGeometry(ROOM * 2, ROOM * 2),
  new THREE.MeshStandardMaterial({ color: 0x07021a, side: THREE.BackSide })
);
ceiling.position.y = 9;
ceiling.rotation.x = Math.PI / 2;
scene.add(ceiling);

// Pillars with glowing cap rings
function addPillar(x, z) {
  const pillar = new THREE.Mesh(
    new THREE.CylinderGeometry(0.35, 0.42, 7, 8),
    new THREE.MeshStandardMaterial({ color: 0x1e0840, roughness: 0.4, metalness: 0.3 })
  );
  pillar.position.set(x, 3.5, z);
  pillar.castShadow = true;
  scene.add(pillar);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.58, 0.07, 8, 24),
    new THREE.MeshBasicMaterial({ color: 0x9030e0 })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(x, 7.15, z);
  scene.add(ring);

  const glow = new THREE.PointLight(0x8020d0, 1.2, 8);
  glow.position.set(x, 7, z);
  scene.add(glow);
}
for (const [x, z] of [[-14,-14],[14,-14],[-14,14],[14,14],[-28,0],[28,0],[0,-28],[0,28]]) {
  addPillar(x, z);
}

// Ceiling stars
const starGeo = new THREE.BufferGeometry();
const starPos = new Float32Array(400 * 3);
for (let i = 0; i < 400; i++) {
  starPos[i*3]   = (Math.random() - 0.5) * (ROOM * 2 - 4);
  starPos[i*3+1] = 8.6 + Math.random() * 0.3;
  starPos[i*3+2] = (Math.random() - 0.5) * (ROOM * 2 - 4);
}
starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.07, sizeAttenuation: true })));

// ------------------------------------------------------------------
// Portals
// ------------------------------------------------------------------
function makePortalLabel(text) {
  const cv = document.createElement('canvas');
  cv.width = 512; cv.height = 96;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 512, 96);
  c.fillStyle = 'rgba(255,255,255,0.92)';
  c.font = 'bold 30px ui-sans-serif, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(text, 256, 48);
  return new THREE.CanvasTexture(cv);
}

function makePortal(x, z, color, label, target) {
  const group = new THREE.Group();
  group.position.set(x, 2.4, z);

  // Outer glowing ring
  const torus = new THREE.Mesh(
    new THREE.TorusGeometry(1.4, 0.1, 16, 64),
    new THREE.MeshBasicMaterial({ color })
  );
  group.add(torus);

  // Inner spinning ring
  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.0, 0.045, 8, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 })
  );
  group.add(innerRing);

  // Semi-transparent face disc
  const disc = new THREE.Mesh(
    new THREE.CircleGeometry(1.38, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide })
  );
  group.add(disc);

  // Floating label (always faces camera because it's a Sprite)
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: makePortalLabel(label), transparent: true })
  );
  sprite.scale.set(4.5, 0.85, 1);
  sprite.position.y = 2.1;
  group.add(sprite);

  // Portal glow light
  const light = new THREE.PointLight(color, 2.5, 12);
  light.position.set(0, 0, 0);
  group.add(light);

  scene.add(group);
  return { group, torus, innerRing, disc, light, target, x, z };
}

const portals = [];
if (nextTarget?.url) {
  portals.push(makePortal(0, -(ROOM - 4), 0xc64bff, `→ ${nextTarget.title}`, nextTarget.url));
}
if (incoming.ref) {
  portals.push(makePortal(0, ROOM - 4, 0x4ff0ff, '← back', incoming.ref));
}

// ------------------------------------------------------------------
// Player
// ------------------------------------------------------------------
const player = {
  x: 0,
  z: incoming.fromPortal && incoming.ref ? (ROOM - 7) : 0,
  yaw: incoming.fromPortal && incoming.ref ? Math.PI : 0,
  speed: incoming.speed || 5,
  color: '#' + incoming.color,
};
camera.position.set(player.x, 1.7, player.z);
camera.rotation.y = player.yaw;

// ------------------------------------------------------------------
// Input
// ------------------------------------------------------------------
const keys = {};
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

let pointerLocked = false;
renderer.domElement.addEventListener('click', () => renderer.domElement.requestPointerLock());
document.addEventListener('pointerlockchange', () => {
  pointerLocked = document.pointerLockElement === renderer.domElement;
  document.getElementById('hint').textContent = pointerLocked
    ? 'WASD to move • mouse to look • Esc to release • enter a portal to travel'
    : 'Click to capture mouse • WASD to move • arrow keys to turn';
});
document.addEventListener('mousemove', e => {
  if (!pointerLocked) return;
  player.yaw -= e.movementX * 0.002;
});

// ------------------------------------------------------------------
// Multiplayer via Trystero (optional, non-blocking)
// ------------------------------------------------------------------
const peers = new Map();
const peerMeshes = new Map();
const peerCountEl = document.getElementById('peers');
let sendState = null;
let room = null;

function getOrCreatePeerMesh(peerId, colorHex) {
  if (peerMeshes.has(peerId)) return peerMeshes.get(peerId);
  let color;
  try { color = new THREE.Color(colorHex || '#888888'); } catch { color = new THREE.Color(0x888888); }
  const mesh = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.3, 1.0, 4, 8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.15 })
  );
  mesh.castShadow = true;
  scene.add(mesh);
  peerMeshes.set(peerId, mesh);
  return mesh;
}

function removePeerMesh(peerId) {
  const mesh = peerMeshes.get(peerId);
  if (mesh) { scene.remove(mesh); peerMeshes.delete(peerId); }
}

function setPeerStatus(text, isError = false) {
  if (!peerCountEl) return;
  peerCountEl.textContent = text;
  peerCountEl.style.color = isError ? '#ff6b6b' : '';
}
function refreshPeerCount() { setPeerStatus(`${peers.size + 1} online`); }

function broadcastSelf() {
  if (!sendState) return;
  sendState({ x: player.x, z: player.z, color: player.color, username: incoming.username });
}

async function loadTrystero() {
  const urls = [
    'https://esm.run/trystero@0.23',
    'https://cdn.jsdelivr.net/npm/trystero@0.23/+esm',
    'https://esm.sh/trystero@0.23',
  ];
  let lastErr;
  for (const url of urls) {
    try {
      const mod = await import(url);
      if (mod && typeof mod.joinRoom === 'function') return mod;
      lastErr = new Error(`no joinRoom from ${url}`);
    } catch (err) { lastErr = err; }
  }
  throw lastErr;
}

async function setupMultiplayer() {
  try {
    setPeerStatus('connecting…');
    const { joinRoom } = await loadTrystero();
    room = joinRoom({ appId: 'ordinary-game-jam-starter' }, 'demo-room');
    const [send, getState] = room.makeAction('state');
    sendState = send;
    room.onPeerJoin(id => { peers.set(id, null); broadcastSelf(); refreshPeerCount(); });
    room.onPeerLeave(id => { peers.delete(id); removePeerMesh(id); refreshPeerCount(); });
    getState((data, peerId) => {
      const prev = peers.get(peerId);
      peers.set(peerId, { ...data, renderX: prev?.renderX ?? data.x, renderZ: prev?.renderZ ?? data.z });
    });
    refreshPeerCount();
    broadcastSelf();
    console.log('[jam] multiplayer ready (nostr)');
  } catch (err) {
    console.error('[jam] multiplayer setup failed:', err);
    setPeerStatus('multiplayer offline', true);
  }
}

setPeerStatus('connecting…');
setupMultiplayer();
addEventListener('beforeunload', () => { if (room) try { room.leave(); } catch {} });

// ------------------------------------------------------------------
// Game loop
// ------------------------------------------------------------------
const clock = new THREE.Clock();
let totalTime = 0;
let lastBroadcast = 0;
let redirecting = false;

function checkPortals() {
  if (redirecting) return;
  for (const p of portals) {
    if (Math.hypot(player.x - p.x, player.z - p.z) < 1.8) {
      redirecting = true;
      Portal.sendPlayerThroughPortal(p.target, {
        username: incoming.username,
        color: incoming.color,
        speed: player.speed,
      });
    }
  }
}

function update(dt) {
  totalTime += dt;

  const spd = player.speed * dt * 5;
  const sin = Math.sin(player.yaw);
  const cos = Math.cos(player.yaw);

  if (keys['w'] || keys['arrowup'])    { player.x += sin * spd; player.z -= cos * spd; }
  if (keys['s'] || keys['arrowdown'])  { player.x -= sin * spd; player.z += cos * spd; }
  if (keys['a'])                       { player.x -= cos * spd; player.z -= sin * spd; }
  if (keys['d'])                       { player.x += cos * spd; player.z += sin * spd; }
  if (keys['arrowleft'])               { player.yaw += dt * 1.8; }
  if (keys['arrowright'])              { player.yaw -= dt * 1.8; }

  player.x = Math.max(-(ROOM - 1), Math.min(ROOM - 1, player.x));
  player.z = Math.max(-(ROOM - 1), Math.min(ROOM - 1, player.z));

  camera.position.set(player.x, 1.7, player.z);
  camera.rotation.y = player.yaw;

  // Animate portals: spin ring, pulse opacity
  for (const p of portals) {
    const pulse = Math.sin(totalTime * 2.5) * 0.5 + 0.5;
    p.torus.rotation.z += dt * 0.6;
    p.innerRing.rotation.z -= dt * 1.1;
    p.disc.material.opacity = 0.08 + pulse * 0.14;
    p.innerRing.material.opacity = 0.35 + pulse * 0.45;
    p.light.intensity = 2 + pulse * 1.5;
  }

  checkPortals();

  const now = performance.now();
  if (now - lastBroadcast > 66) { lastBroadcast = now; broadcastSelf(); }

  for (const [id, peer] of peers.entries()) {
    if (!peer) continue;
    const k = Math.min(1, dt * 12);
    peer.renderX += (peer.x - peer.renderX) * k;
    peer.renderZ += (peer.z - peer.renderZ) * k;
    const mesh = getOrCreatePeerMesh(id, peer.color);
    mesh.position.set(peer.renderX, 1.05, peer.renderZ);
  }
}

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  update(dt);
  renderer.render(scene, camera);
}
animate();
