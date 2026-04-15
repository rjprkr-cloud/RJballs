// 2D top-down walkable room
// Portal Protocol + optional Trystero multiplayer

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width;   // 960
const H = canvas.height;  // 540

// ------------------------------------------------------------------
// Portal protocol
// ------------------------------------------------------------------
const incoming = Portal.readPortalParams();
document.getElementById('username').textContent = incoming.username;
const nextTarget = await Portal.pickPortalTarget();

// ------------------------------------------------------------------
// Layout constants
// ------------------------------------------------------------------
const WALL = 36;  // wall thickness
const TILE = 48;  // floor tile size
const PLAYER_R = 13;

// ------------------------------------------------------------------
// Portals
// ------------------------------------------------------------------
const exitPortal = {
  x: W - WALL - 52,
  y: H / 2,
  r: 36,
  color: '#c64bff',
  label: nextTarget ? `→ ${nextTarget.title}` : 'no destinations yet',
  target: nextTarget?.url || null,
  pulse: 0,
};

const returnPortal = incoming.ref ? {
  x: WALL + 52,
  y: H / 2,
  r: 36,
  color: '#4ff0ff',
  label: '← back',
  target: incoming.ref,
  pulse: 0,
} : null;

// ------------------------------------------------------------------
// Player
// ------------------------------------------------------------------
const player = {
  x: W / 2,
  y: H / 2,
  r: PLAYER_R,
  speed: incoming.speed || 4,
  color: '#' + incoming.color,
  angle: 0, // facing direction in radians (0 = up)
};

if (incoming.fromPortal && returnPortal) {
  player.x = returnPortal.x + returnPortal.r + 30;
  player.y = returnPortal.y;
}

// ------------------------------------------------------------------
// Collidable geometry
// ------------------------------------------------------------------
const walls = [
  { x: 0,        y: 0,        w: W,    h: WALL },
  { x: 0,        y: H - WALL, w: W,    h: WALL },
  { x: 0,        y: 0,        w: WALL, h: H    },
  { x: W - WALL, y: 0,        w: WALL, h: H    },
];

const furniture = [
  // Corner pillars
  { x: 82,      y: 62,      w: 26, h: 26, type: 'pillar' },
  { x: W - 108, y: 62,      w: 26, h: 26, type: 'pillar' },
  { x: 82,      y: H - 88,  w: 26, h: 26, type: 'pillar' },
  { x: W - 108, y: H - 88,  w: 26, h: 26, type: 'pillar' },
  // Central table
  { x: W/2 - 42, y: H/2 - 28, w: 84, h: 56, type: 'table' },
  // Side benches
  { x: 200,      y: 128,      w: 110, h: 28, type: 'bench' },
  { x: W - 310,  y: 128,      w: 110, h: 28, type: 'bench' },
  { x: 200,      y: H - 156,  w: 110, h: 28, type: 'bench' },
  { x: W - 310,  y: H - 156,  w: 110, h: 28, type: 'bench' },
];

const collidables = [...walls, ...furniture];

// ------------------------------------------------------------------
// Collision helpers
// ------------------------------------------------------------------
function circleRect(cx, cy, cr, rx, ry, rw, rh) {
  const nearX = Math.max(rx, Math.min(cx, rx + rw));
  const nearY = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < cr * cr;
}

function pushOut(px, py, pr, rect) {
  if (!circleRect(px, py, pr, rect.x, rect.y, rect.w, rect.h)) return { x: px, y: py };
  const nearX = Math.max(rect.x, Math.min(px, rect.x + rect.w));
  const nearY = Math.max(rect.y, Math.min(py, rect.y + rect.h));
  const dx = px - nearX;
  const dy = py - nearY;
  const dist = Math.hypot(dx, dy) || 0.001;
  const overlap = pr - dist;
  return { x: px + (dx / dist) * overlap, y: py + (dy / dist) * overlap };
}

// ------------------------------------------------------------------
// Multiplayer via Trystero (optional, non-blocking)
// ------------------------------------------------------------------
const peers = new Map();
const peerCountEl = document.getElementById('peers');
let sendState = null;
let room = null;

function setPeerStatus(text, isError = false) {
  if (!peerCountEl) return;
  peerCountEl.textContent = text;
  peerCountEl.style.color = isError ? '#ff6b6b' : '';
}
function refreshPeerCount() { setPeerStatus(`${peers.size + 1} online`); }

function broadcastSelf() {
  if (!sendState) return;
  sendState({ x: player.x, y: player.y, angle: player.angle, color: player.color, username: incoming.username });
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
    room.onPeerLeave(id => { peers.delete(id); refreshPeerCount(); });
    getState((data, peerId) => {
      const prev = peers.get(peerId);
      peers.set(peerId, { ...data, renderX: prev?.renderX ?? data.x, renderY: prev?.renderY ?? data.y });
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
// Input
// ------------------------------------------------------------------
const keys = {};
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

// ------------------------------------------------------------------
// Portal check
// ------------------------------------------------------------------
let redirecting = false;
function attemptPortal(portal) {
  if (redirecting || !portal?.target) return;
  if (Math.hypot(player.x - portal.x, player.y - portal.y) < portal.r + player.r - 4) {
    redirecting = true;
    Portal.sendPlayerThroughPortal(portal.target, {
      username: incoming.username,
      color: incoming.color,
      speed: player.speed,
    });
  }
}

// ------------------------------------------------------------------
// Drawing
// ------------------------------------------------------------------
function drawFloor() {
  for (let tx = WALL; tx < W - WALL; tx += TILE) {
    for (let ty = WALL; ty < H - WALL; ty += TILE) {
      const even = (Math.floor((tx - WALL) / TILE) + Math.floor((ty - WALL) / TILE)) % 2 === 0;
      ctx.fillStyle = even ? '#120826' : '#160a2e';
      ctx.fillRect(tx, ty, Math.min(TILE, W - WALL - tx), Math.min(TILE, H - WALL - ty));
    }
  }
  // Subtle grid lines
  ctx.strokeStyle = 'rgba(80, 20, 140, 0.22)';
  ctx.lineWidth = 0.5;
  for (let tx = WALL; tx <= W - WALL; tx += TILE) {
    ctx.beginPath(); ctx.moveTo(tx, WALL); ctx.lineTo(tx, H - WALL); ctx.stroke();
  }
  for (let ty = WALL; ty <= H - WALL; ty += TILE) {
    ctx.beginPath(); ctx.moveTo(WALL, ty); ctx.lineTo(W - WALL, ty); ctx.stroke();
  }
}

function drawWalls() {
  ctx.fillStyle = '#1a0840';
  ctx.fillRect(0, 0, W, WALL);
  ctx.fillRect(0, H - WALL, W, WALL);
  ctx.fillRect(0, 0, WALL, H);
  ctx.fillRect(W - WALL, 0, WALL, H);

  // Inner edge accent
  ctx.strokeStyle = '#4a1080';
  ctx.lineWidth = 2;
  ctx.strokeRect(WALL, WALL, W - WALL * 2, H - WALL * 2);

  // Corner brackets
  const B = 14;
  ctx.strokeStyle = '#9030e0';
  ctx.lineWidth = 2;
  for (const [cx, cy, sx, sy] of [[WALL,WALL,1,1],[W-WALL,WALL,-1,1],[WALL,H-WALL,1,-1],[W-WALL,H-WALL,-1,-1]]) {
    ctx.beginPath();
    ctx.moveTo(cx + sx * B, cy);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx, cy + sy * B);
    ctx.stroke();
  }
}

function drawFurniture() {
  for (const f of furniture) {
    ctx.save();
    if (f.type === 'pillar') {
      ctx.shadowColor = '#9030e0';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#2a0a50';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.strokeStyle = '#9030e0';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(f.x, f.y, f.w, f.h);
    } else if (f.type === 'table') {
      ctx.fillStyle = '#1e0840';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.strokeStyle = '#4a1a80';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(f.x, f.y, f.w, f.h);
      // grain lines
      ctx.strokeStyle = 'rgba(90, 40, 140, 0.35)';
      ctx.lineWidth = 1;
      for (let lx = f.x + 10; lx < f.x + f.w - 4; lx += 12) {
        ctx.beginPath(); ctx.moveTo(lx, f.y + 5); ctx.lineTo(lx, f.y + f.h - 5); ctx.stroke();
      }
    } else if (f.type === 'bench') {
      ctx.fillStyle = '#180636';
      ctx.fillRect(f.x, f.y, f.w, f.h);
      ctx.strokeStyle = '#3a1070';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(f.x, f.y, f.w, f.h);
    }
    ctx.restore();
  }
}

function drawPortal(p, t) {
  ctx.save();
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 18 + Math.sin(p.pulse) * 7;
  ctx.strokeStyle = p.color;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.stroke();

  // Spinning dashed inner ring
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(t * 1.4);
  ctx.globalAlpha = 0.5;
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 6]);
  ctx.beginPath();
  ctx.arc(0, 0, p.r - 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // Fill glow
  ctx.globalAlpha = 0.06 + Math.sin(p.pulse) * 0.04;
  ctx.fillStyle = p.color;
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Label
  ctx.fillStyle = '#fff';
  ctx.font = '600 13px ui-sans-serif, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(p.label, p.x, p.y - p.r - 10);
}

// angle: 0=up, PI/2=right, PI=down, -PI/2=left
function drawCharacter(x, y, angle, color, username, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, PLAYER_R, 0, Math.PI * 2);
  ctx.fill();

  // Direction dot
  const dotX = x + Math.sin(angle) * (PLAYER_R - 4);
  const dotY = y - Math.cos(angle) * (PLAYER_R - 4);
  ctx.shadowColor = '#fff';
  ctx.shadowBlur = 8;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  ctx.beginPath();
  ctx.arc(dotX, dotY, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (username) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(username, x, y - PLAYER_R - 8);
  }
}

// ------------------------------------------------------------------
// Game loop
// ------------------------------------------------------------------
let t = 0;
let lastBroadcast = 0;

function update(dt) {
  t += dt;

  let dx = 0, dy = 0;
  if (keys['w'] || keys['arrowup'])    dy -= 1;
  if (keys['s'] || keys['arrowdown'])  dy += 1;
  if (keys['a'] || keys['arrowleft'])  dx -= 1;
  if (keys['d'] || keys['arrowright']) dx += 1;

  if (dx !== 0 && dy !== 0) { dx *= 0.707; dy *= 0.707; }
  dx *= player.speed;
  dy *= player.speed;

  if (dx !== 0 || dy !== 0) {
    player.angle = Math.atan2(dx, -dy);
  }

  // Resolve x then y separately for wall sliding
  let nx = player.x + dx;
  for (const rect of collidables) {
    const res = pushOut(nx, player.y, player.r, rect);
    nx = res.x;
  }
  player.x = nx;

  let ny = player.y + dy;
  for (const rect of collidables) {
    const res = pushOut(player.x, ny, player.r, rect);
    ny = res.y;
  }
  player.y = ny;

  exitPortal.pulse += dt * 3;
  if (returnPortal) returnPortal.pulse += dt * 3;

  attemptPortal(exitPortal);
  if (returnPortal) attemptPortal(returnPortal);

  const now = performance.now();
  if (now - lastBroadcast > 66) {
    lastBroadcast = now;
    broadcastSelf();
  }

  for (const peer of peers.values()) {
    if (!peer) continue;
    const k = Math.min(1, dt * 12);
    peer.renderX += (peer.x - peer.renderX) * k;
    peer.renderY += (peer.y - peer.renderY) * k;
  }
}

function render() {
  ctx.fillStyle = '#0a0514';
  ctx.fillRect(0, 0, W, H);

  drawFloor();
  drawWalls();
  drawFurniture();

  drawPortal(exitPortal, t);
  if (returnPortal) drawPortal(returnPortal, t);

  for (const peer of peers.values()) {
    if (!peer) continue;
    drawCharacter(peer.renderX, peer.renderY, peer.angle ?? 0, peer.color || '#888', peer.username || '?', 0.8);
  }
  drawCharacter(player.x, player.y, player.angle, player.color, '', 1);
}

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
