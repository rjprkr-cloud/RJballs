// Top-down arena shooter — co-op, boss waves, neon effects, buff pickups
// Portal Protocol + Trystero multiplayer

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;
canvas.style.cursor = 'none';

// ── Portal protocol ───────────────────────────────────────────────
const incoming   = Portal.readPortalParams();
document.getElementById('username').textContent = incoming.username;
const nextTarget = await Portal.pickPortalTarget();

// ── Constants ─────────────────────────────────────────────────────
const WALL = 36, TILE = 48, PR = 13;
const BTN_W = 190, BTN_H = 48;
const MAX_PLAYERS = 6;

// ── Portals ───────────────────────────────────────────────────────
const exitPortal = {
  x: W-WALL-52, y: H/2, r: 36, color: '#c64bff',
  label: nextTarget ? `→ ${nextTarget.title}` : 'no destinations yet',
  target: nextTarget?.url ?? null, pulse: 0,
};
const returnPortal = incoming.ref ? {
  x: WALL+52, y: H/2, r: 36, color: '#4ff0ff',
  label: '← back', target: incoming.ref, pulse: 0,
} : null;

// ── World geometry ────────────────────────────────────────────────
const WALLS = [
  {x:0,      y:0,      w:W,    h:WALL},
  {x:0,      y:H-WALL, w:W,    h:WALL},
  {x:0,      y:0,      w:WALL, h:H},
  {x:W-WALL, y:0,      w:WALL, h:H},
];
const FURNITURE = [
  {x:82,     y:62,    w:26, h:26, type:'pillar'},
  {x:W-108,  y:62,    w:26, h:26, type:'pillar'},
  {x:82,     y:H-88,  w:26, h:26, type:'pillar'},
  {x:W-108,  y:H-88,  w:26, h:26, type:'pillar'},
  {x:W/2-42, y:H/2-28,w:84, h:56, type:'table' },
  {x:200,    y:128,   w:110,h:28, type:'bench' },
  {x:W-310,  y:128,   w:110,h:28, type:'bench' },
  {x:200,    y:H-156, w:110,h:28, type:'bench' },
  {x:W-310,  y:H-156, w:110,h:28, type:'bench' },
];
const SOLID = [...WALLS, ...FURNITURE];

// ── Weapons (unlocked by level) ───────────────────────────────────
const WEAPONS = [
  {name:'Pistol',  lv:1,  dmg:15, spd:9,  cd:0.42,n:1,spr:0,    pierce:false,aoe:0,  clr:'#ffdd44',br:4},
  {name:'Shotgun', lv:3,  dmg:12, spd:9,  cd:0.70,n:5,spr:0.32, pierce:false,aoe:0,  clr:'#ff8833',br:4},
  {name:'SMG',     lv:5,  dmg:9,  spd:13, cd:0.09,n:1,spr:0.10, pierce:false,aoe:0,  clr:'#44aaff',br:3},
  {name:'Plasma',  lv:7,  dmg:40, spd:14, cd:0.45,n:1,spr:0,    pierce:true, aoe:0,  clr:'#dd44ff',br:5},
  {name:'Rocket',  lv:10, dmg:90, spd:6,  cd:1.10,n:1,spr:0,    pierce:false,aoe:55, clr:'#ff4444',br:6},
];
const getWeapon = lv => [...WEAPONS].reverse().find(w => lv >= w.lv) ?? WEAPONS[0];
const xpToNext  = lv => 40 + lv * 30;

// ── Buff item definitions ─────────────────────────────────────────
const BUFF_DEFS = [
  {id:'bouncing', name:'BOUNCE',  dur:20, clr:'#44ffcc'},
  {id:'splash',   name:'SPLASH',  dur:20, clr:'#ff8844'},
  {id:'spread',   name:'SPREAD',  dur:20, clr:'#4488ff'},
  {id:'rapid',    name:'RAPID',   dur:15, clr:'#ffff44'},
];

// ── Enemy templates ───────────────────────────────────────────────
const ETYPES = [
  {kind:'Runner',  maxHp:30,  spd:2.2,dmg:6,  r:10,clr:'#ff4455',xp:10},
  {kind:'Brute',   maxHp:110, spd:1.0,dmg:18, r:18,clr:'#ff8800',xp:30},
  {kind:'Speeder', maxHp:22,  spd:4.2,dmg:5,  r:8, clr:'#ff44cc',xp:15},
];
function pickType(wave) {
  if (wave <= 2) return ETYPES[0];
  if (wave <= 4) return Math.random() < 0.35 ? ETYPES[1] : ETYPES[0];
  return ETYPES[Math.floor(Math.random() * ETYPES.length)];
}

// ── Game state ────────────────────────────────────────────────────
let state = 'menu';
let player, bullets, enemyBullets, enemies, boss;
let explosions, buffItems;
let wave, waveTimer, shotCd, kills, buffSpawnTimer;
let notif = '', notifT = 0, notifClr = '#ffdd44';
let t = 0, lastBroad = 0;

function showNotif(msg, clr = '#ffdd44') { notif = msg; notifT = 2.8; notifClr = clr; }

function initGame() {
  player = {
    x: W/2, y: H/2, r: PR, speed: 4,
    color: '#' + incoming.color, angle: 0,
    hp: 100, maxHp: 100, level: 1, xp: 0, iframes: 0,
    buffs: {bouncing:0, splash:0, spread:0, rapid:0},
  };
  bullets = []; enemyBullets = []; enemies = [];
  boss = null; explosions = []; buffItems = [];
  wave = 0; waveTimer = 0; shotCd = 0; kills = 0;
  buffSpawnTimer = 22;
  spawnWave();
}

// ── Spawning ──────────────────────────────────────────────────────
function randomEdgePos() {
  const side = Math.floor(Math.random() * 4);
  if (side === 0) return {x: WALL+10+Math.random()*(W-WALL*2-20), y: WALL+8};
  if (side === 1) return {x: WALL+10+Math.random()*(W-WALL*2-20), y: H-WALL-8};
  if (side === 2) return {x: WALL+8,      y: WALL+10+Math.random()*(H-WALL*2-20)};
                  return {x: W-WALL-8,    y: WALL+10+Math.random()*(H-WALL*2-20)};
}

function spawnEnemy(type) {
  const pos = randomEdgePos();
  enemies.push({...type, hp: type.maxHp, ...pos, angle: 0});
}

function spawnWave() {
  wave++;
  const peerCount  = Math.min(peers.size, MAX_PLAYERS - 1);
  const hpMult     = 1 + peerCount * 0.35;
  const extraCount = peerCount * 2;

  if (wave % 5 === 0) {
    // Boss wave
    const tier  = Math.floor((wave - 5) / 5);
    const bHp   = Math.round(800 * Math.pow(1.35, tier) * hpMult);
    const pos   = randomEdgePos();
    boss = {
      ...pos, r: 30, spd: 1.8, dmg: 22,
      hp: bHp, maxHp: bHp, clr: '#cc0033',
      xp: 300 + wave * 30,
      atkCd: 2.5, atkIdx: 0,
      charging: false, chargeDur: 0, chargeDir: {x:0, y:1},
      enraged: false, angle: 0,
    };
    const minionCount = 4 + (tier * 2) + extraCount;
    for (let i = 0; i < minionCount; i++) spawnEnemy(ETYPES[0]);
    waveTimer = 9999;
    showNotif(`★ BOSS WAVE ${wave} ★`, '#ff2244');
  } else {
    const total = (2 + wave * 3) + extraCount;
    for (let i = 0; i < total; i++) spawnEnemy(pickType(wave));
    if (wave > 1) showNotif(`Wave ${wave}`, '#ffdd44');
    waveTimer = 14;
  }
}

// ── Boss attacks ──────────────────────────────────────────────────
function doBossAttack(b) {
  const phase = b.atkIdx % 3;
  b.atkIdx++;

  if (phase === 0) {
    // Ring blast — 8 radial bullets (12 when enraged)
    const n = b.enraged ? 12 : 8;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + t * 0.4;
      enemyBullets.push({x:b.x, y:b.y, vx:Math.cos(a)*4.5, vy:Math.sin(a)*4.5, dmg:12, r:7, life:2.5, dead:false});
    }
    if (b.enraged) {
      for (let i = 0; i < 8; i++) {
        const a = (i/8)*Math.PI*2 + Math.PI/8 + t*0.4;
        enemyBullets.push({x:b.x, y:b.y, vx:Math.cos(a)*3.2, vy:Math.sin(a)*3.2, dmg:10, r:6, life:3, dead:false});
      }
    }
    createExplosion(b.x, b.y, 35, '#ff0022');

  } else if (phase === 1) {
    // Seeking — fires at each player
    const targets = [{x: player.x, y: player.y}];
    for (const p of peers.values()) {
      if (p?.renderX && p.alive !== false) targets.push({x: p.renderX, y: p.renderY});
    }
    for (const tgt of targets.slice(0, MAX_PLAYERS)) {
      const a  = Math.atan2(tgt.y - b.y, tgt.x - b.x);
      const shots = b.enraged ? 2 : 1;
      for (let i = 0; i < shots; i++) {
        const da = (i - (shots-1)/2) * 0.18;
        enemyBullets.push({x:b.x, y:b.y, vx:Math.cos(a+da)*5.5, vy:Math.sin(a+da)*5.5, dmg:18, r:7, life:3, dead:false});
      }
    }

  } else {
    // Charge
    const dx = player.x - b.x, dy = player.y - b.y, d = Math.hypot(dx, dy) || 1;
    b.charging = true;
    b.chargeDur = 1.3;
    b.chargeDir = {x: dx/d, y: dy/d};
    showNotif('BOSS CHARGING!', '#ff8800');
  }
}

// ── Shooting ──────────────────────────────────────────────────────
function shoot() {
  const w    = getWeapon(player.level);
  const cd   = player.buffs.rapid    > 0 ? w.cd * 0.55 : w.cd;
  const n    = player.buffs.spread   > 0 ? w.n + 2     : w.n;
  const aoe  = player.buffs.splash   > 0 ? Math.max(w.aoe, 22) : w.aoe;
  const spr  = player.buffs.spread   > 0 ? w.spr + 0.26 : w.spr;
  const base = Math.atan2(mouseY - player.y, mouseX - player.x);

  for (let i = 0; i < n; i++) {
    const a = base + (Math.random() - 0.5) * spr * 2;
    bullets.push({
      x: player.x, y: player.y,
      vx: Math.cos(a) * w.spd, vy: Math.sin(a) * w.spd,
      dmg: w.dmg, r: w.br, clr: w.clr,
      pierce: w.pierce, aoe,
      life: 1.8, dead: false,
      bouncing: player.buffs.bouncing > 0, bounces: 0,
    });
  }
  shotCd = cd;
}

// ── XP / Level ────────────────────────────────────────────────────
function gainXP(amount) {
  player.xp += amount;
  if (player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    player.level++;
    player.maxHp += 10;
    player.hp = Math.min(player.hp + 25, player.maxHp);
    const w = getWeapon(player.level);
    showNotif(w.lv === player.level ? `Lv ${player.level}! Unlocked: ${w.name}` : `Level ${player.level}!`, '#ffdd44');
  }
}

// ── Explosions ────────────────────────────────────────────────────
function createExplosion(x, y, maxR, clr = '#ff4400') {
  explosions.push({x, y, r:0, maxR, life:0.4, maxLife:0.4, clr});
}

// ── Input ─────────────────────────────────────────────────────────
const keys = {};
addEventListener('keydown', e => { keys[e.key.toLowerCase()] = true; });
addEventListener('keyup',   e => { keys[e.key.toLowerCase()] = false; });

let mouseX = W/2, mouseY = H/2, mouseDown = false;
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseX = (e.clientX - r.left) * (W / r.width);
  mouseY = (e.clientY - r.top)  * (H / r.height);
});
canvas.addEventListener('mousedown', e => { if (e.button !== 0) return; mouseDown = true; handleClick(mouseX, mouseY); });
canvas.addEventListener('mouseup',   e => { if (e.button === 0) mouseDown = false; });

function hitBtn(mx, my, bx, by) {
  return mx >= bx-BTN_W/2 && mx <= bx+BTN_W/2 && my >= by-BTN_H/2 && my <= by+BTN_H/2;
}
function handleClick(mx, my) {
  if (state === 'menu') {
    if (hitBtn(mx, my, W/2, H/2+20)) { initGame(); state = 'playing'; }
    if (hitBtn(mx, my, W/2, H/2+88)) { window.location.href = nextTarget?.url ?? 'https://callumhyoung.github.io/gamejam/'; }
  }
  if (state === 'dead') {
    if (hitBtn(mx, my, W/2, H/2+45))  { initGame(); state = 'playing'; }
    if (hitBtn(mx, my, W/2, H/2+108)) { state = 'menu'; }
  }
}

// ── Portal check ──────────────────────────────────────────────────
let redirecting = false;
function checkPortals() {
  if (redirecting || state !== 'playing') return;
  for (const p of [exitPortal, returnPortal]) {
    if (!p?.target) continue;
    if (Math.hypot(player.x - p.x, player.y - p.y) < p.r + player.r - 4) {
      redirecting = true;
      Portal.sendPlayerThroughPortal(p.target, {username: incoming.username, color: incoming.color, speed: player.speed});
    }
  }
}

// ── Multiplayer (extended co-op broadcast) ────────────────────────
const peers = new Map();
const peerCountEl = document.getElementById('peers');
let sendState = null, room = null;

const setPeerStatus = (txt, err=false) => { if (peerCountEl) { peerCountEl.textContent = txt; peerCountEl.style.color = err ? '#ff6b6b' : ''; } };
const refreshCount  = () => setPeerStatus(`${peers.size + 1} online`);
const broadcastSelf = () => sendState?.({
  x: player?.x ?? W/2, y: player?.y ?? H/2,
  angle: player?.angle ?? 0, color: player?.color ?? '#888',
  username: incoming.username,
  hp: player?.hp ?? 0, maxHp: player?.maxHp ?? 100,
  level: player?.level ?? 1,
  alive: state === 'playing' && (player?.hp ?? 0) > 0,
});

async function loadTrystero() {
  for (const url of ['https://esm.run/trystero@0.23','https://cdn.jsdelivr.net/npm/trystero@0.23/+esm','https://esm.sh/trystero@0.23']) {
    try { const m = await import(url); if (m?.joinRoom) return m; } catch {}
  }
  throw new Error('trystero unavailable');
}
async function setupMultiplayer() {
  try {
    setPeerStatus('connecting…');
    const {joinRoom} = await loadTrystero();
    room = joinRoom({appId: 'ordinary-game-jam-starter'}, 'demo-room');
    const [send, get] = room.makeAction('state');
    sendState = send;
    room.onPeerJoin(id => { peers.set(id, null); broadcastSelf(); refreshCount(); });
    room.onPeerLeave(id => { peers.delete(id); refreshCount(); });
    get((d, id) => { const p = peers.get(id); peers.set(id, {...d, renderX: p?.renderX ?? d.x, renderY: p?.renderY ?? d.y}); });
    refreshCount(); broadcastSelf();
    console.log('[jam] co-op ready');
  } catch { setPeerStatus('multiplayer offline', true); }
}
setPeerStatus('connecting…');
setupMultiplayer();
addEventListener('beforeunload', () => { try { room?.leave(); } catch {} });

// ── Collision helpers ─────────────────────────────────────────────
function circleRect(cx,cy,cr,rx,ry,rw,rh) {
  const nx=Math.max(rx,Math.min(cx,rx+rw)), ny=Math.max(ry,Math.min(cy,ry+rh));
  return (cx-nx)**2+(cy-ny)**2 < cr*cr;
}
function pushOut(px,py,pr,rect) {
  if (!circleRect(px,py,pr,rect.x,rect.y,rect.w,rect.h)) return {x:px,y:py};
  const nx=Math.max(rect.x,Math.min(px,rect.x+rect.w));
  const ny=Math.max(rect.y,Math.min(py,rect.y+rect.h));
  const dx=px-nx, dy=py-ny, d=Math.hypot(dx,dy)||0.001;
  return {x:px+(dx/d)*(pr-d), y:py+(dy/d)*(pr-d)};
}

// ── Update ────────────────────────────────────────────────────────
function update(dt) {
  t += dt;
  exitPortal.pulse += dt * 3;
  if (returnPortal) returnPortal.pulse += dt * 3;
  if (notifT > 0) notifT -= dt;

  if (state !== 'playing') return;

  // ── Player movement
  let dx=0, dy=0;
  if (keys['w']||keys['arrowup'])    dy -= 1;
  if (keys['s']||keys['arrowdown'])  dy += 1;
  if (keys['a']||keys['arrowleft'])  dx -= 1;
  if (keys['d']||keys['arrowright']) dx += 1;
  if (dx && dy) { dx *= 0.707; dy *= 0.707; }
  dx *= player.speed; dy *= player.speed;
  if (dx || dy) player.angle = Math.atan2(dx, -dy);
  else player.angle = Math.atan2(mouseX - player.x, -(mouseY - player.y));

  let nx = player.x + dx;
  for (const r of SOLID) { const p = pushOut(nx, player.y, player.r, r); nx = p.x; }
  player.x = nx;
  let ny = player.y + dy;
  for (const r of SOLID) { const p = pushOut(player.x, ny, player.r, r); ny = p.y; }
  player.y = ny;

  // ── Shoot
  shotCd = Math.max(0, shotCd - dt);
  if (mouseDown && shotCd === 0) shoot();

  // ── Buff timers
  for (const id of Object.keys(player.buffs)) player.buffs[id] = Math.max(0, player.buffs[id] - dt);

  checkPortals();

  // ── Move player bullets (with bounce)
  for (const b of bullets) {
    b.x += b.vx; b.y += b.vy; b.life -= dt;
    if (b.life <= 0) { b.dead = true; continue; }
    const hL = b.x-b.r < WALL+1, hR = b.x+b.r > W-WALL-1;
    const hT = b.y-b.r < WALL+1, hB = b.y+b.r > H-WALL-1;
    if (hL||hR||hT||hB) {
      if (b.bouncing && b.bounces < 3) {
        if (hL||hR) { b.vx *= -1; b.x = hL ? WALL+b.r+2 : W-WALL-b.r-2; }
        if (hT||hB) { b.vy *= -1; b.y = hT ? WALL+b.r+2 : H-WALL-b.r-2; }
        b.bounces++;
      } else { b.dead = true; }
    }
    if (!b.dead) for (const f of FURNITURE) if (circleRect(b.x,b.y,b.r,f.x,f.y,f.w,f.h)) { b.dead=true; break; }
  }

  // ── Player bullets vs enemies
  for (const e of enemies) {
    for (const b of bullets) {
      if (b.dead) continue;
      if (Math.hypot(b.x-e.x, b.y-e.y) < e.r+b.r) {
        e.hp -= b.dmg;
        if (b.aoe > 0) {
          for (const o of enemies) { if (Math.hypot(b.x-o.x, b.y-o.y) < b.aoe) o.hp -= b.dmg*0.5; }
          if (boss) { if (Math.hypot(b.x-boss.x, b.y-boss.y) < b.aoe) boss.hp -= b.dmg*0.5; }
          createExplosion(b.x, b.y, b.aoe, b.clr);
          b.dead = true;
        } else if (!b.pierce) { b.dead = true; }
      }
    }
  }

  // ── Player bullets vs boss
  if (boss) {
    for (const b of bullets) {
      if (b.dead) continue;
      if (Math.hypot(b.x-boss.x, b.y-boss.y) < boss.r+b.r) {
        boss.hp -= b.dmg;
        if (b.aoe > 0) {
          for (const o of enemies) { if (Math.hypot(b.x-o.x, b.y-o.y) < b.aoe) o.hp -= b.dmg*0.5; }
          createExplosion(b.x, b.y, b.aoe, b.clr);
          b.dead = true;
        } else if (!b.pierce) { b.dead = true; }
      }
    }
  }
  bullets = bullets.filter(b => !b.dead);

  // ── Boss update
  if (boss) {
    if (!boss.enraged && boss.hp < boss.maxHp * 0.5) {
      boss.enraged = true; boss.spd = 2.8;
      showNotif('BOSS ENRAGED!', '#ff6600');
    }
    boss.atkCd = Math.max(0, boss.atkCd - dt);
    if (boss.atkCd === 0) { boss.atkCd = boss.enraged ? 1.6 : 2.5; doBossAttack(boss); }

    const bspd  = boss.charging ? 7.5 : boss.spd;
    const bdx   = player.x - boss.x, bdy = player.y - boss.y;
    const bdist = Math.hypot(bdx, bdy) || 1;
    const bdir  = boss.charging ? boss.chargeDir : {x: bdx/bdist, y: bdy/bdist};
    let bx2 = boss.x + bdir.x*bspd, by2 = boss.y + bdir.y*bspd;
    for (const r of WALLS) { let p=pushOut(bx2,boss.y,boss.r,r); bx2=p.x; }
    for (const r of WALLS) { let p=pushOut(bx2,by2, boss.r,r); by2=p.y; }
    boss.x = bx2; boss.y = by2;
    boss.angle = Math.atan2(bdy, bdx);
    if (boss.charging) { boss.chargeDur -= dt; if (boss.chargeDur <= 0) boss.charging = false; }

    if (player.iframes <= 0 && Math.hypot(player.x-boss.x, player.y-boss.y) < PR+boss.r) {
      player.hp -= boss.dmg * dt * 2.5; player.iframes = 0.55;
    }
    if (boss.hp <= 0) {
      gainXP(boss.xp); kills++;
      for (let i = 0; i < BUFF_DEFS.length; i++) {
        const a = (i / BUFF_DEFS.length) * Math.PI * 2;
        buffItems.push({x: boss.x+Math.cos(a)*50, y: boss.y+Math.sin(a)*50, def: BUFF_DEFS[i], life: 25, pulse:0});
      }
      createExplosion(boss.x, boss.y, 80, '#ff0033');
      showNotif('BOSS DEFEATED! BUFFS DROPPED!', '#ffdd44');
      waveTimer = 15; boss = null;
    }
  }

  // ── Move enemies
  for (const e of enemies) {
    const edx = player.x-e.x, edy = player.y-e.y, ed = Math.hypot(edx,edy)||1;
    let ex = e.x+(edx/ed)*e.spd, ey = e.y+(edy/ed)*e.spd;
    for (const r of SOLID) { let p=pushOut(ex,e.y,e.r,r); ex=p.x; }
    for (const r of SOLID) { let p=pushOut(ex,ey, e.r,r); ey=p.y; }
    for (const o of enemies) {
      if (o===e) continue;
      const ox=ex-o.x,oy=ey-o.y,od=Math.hypot(ox,oy)||1,ov=e.r+o.r-od;
      if (ov>0){ex+=ox/od*ov*0.5; ey+=oy/od*ov*0.5;}
    }
    e.x=ex; e.y=ey; e.angle=Math.atan2(edy,edx);

    if (player.iframes <= 0 && Math.hypot(player.x-e.x, player.y-e.y) < PR+e.r) {
      player.hp -= e.dmg * dt * 2.5; player.iframes = 0.55;
    }
  }
  player.iframes = Math.max(0, player.iframes - dt);

  enemies = enemies.filter(e => { if (e.hp <= 0) { gainXP(e.xp); kills++; return false; } return true; });

  // ── Enemy bullets (boss projectiles)
  for (const b of enemyBullets) {
    b.x += b.vx; b.y += b.vy; b.life -= dt;
    if (b.life<=0||b.x<WALL||b.x>W-WALL||b.y<WALL||b.y>H-WALL) { b.dead=true; continue; }
    if (player.iframes <= 0 && Math.hypot(b.x-player.x, b.y-player.y) < PR+b.r) {
      player.hp -= b.dmg; player.iframes = 0.4; b.dead = true;
    }
  }
  enemyBullets = enemyBullets.filter(b => !b.dead);

  // ── Buff items — spawn + pickup
  buffSpawnTimer -= dt;
  if (buffSpawnTimer <= 0 && buffItems.length < 3) {
    buffSpawnTimer = 20 + Math.random() * 15;
    const margin = WALL + 65;
    const def = BUFF_DEFS[Math.floor(Math.random() * BUFF_DEFS.length)];
    buffItems.push({x: margin + Math.random()*(W-margin*2), y: margin + Math.random()*(H-margin*2), def, life:12, pulse:0});
  }
  buffItems = buffItems.filter(item => {
    item.life -= dt; item.pulse += dt * 3;
    if (Math.hypot(player.x-item.x, player.y-item.y) < PR+15) {
      player.buffs[item.def.id] = item.def.dur;
      showNotif(`${item.def.name}!`, item.def.clr);
      createExplosion(item.x, item.y, 22, item.def.clr);
      return false;
    }
    return item.life > 0;
  });

  // ── Explosions
  explosions = explosions.filter(ex => {
    ex.life -= dt;
    ex.r = ex.maxR * (1 - ex.life/ex.maxLife);
    return ex.life > 0;
  });

  // ── Wave progression (only when no boss)
  if (!boss) {
    if (enemies.length === 0 && waveTimer > 5) waveTimer = 5;
    waveTimer -= dt;
    if (waveTimer <= 0) spawnWave();
  }

  if (player.hp <= 0) { player.hp = 0; state = 'dead'; }

  const now = performance.now();
  if (now - lastBroad > 66) { lastBroad = now; broadcastSelf(); }
  for (const p of peers.values()) {
    if (!p) continue;
    const k = Math.min(1, dt * 12);
    p.renderX += (p.x - p.renderX) * k;
    p.renderY += (p.y - p.renderY) * k;
  }
}

// ── Environment drawing ───────────────────────────────────────────
function drawFloor() {
  for (let tx=WALL; tx<W-WALL; tx+=TILE)
    for (let ty=WALL; ty<H-WALL; ty+=TILE) {
      ctx.fillStyle = (Math.floor((tx-WALL)/TILE)+Math.floor((ty-WALL)/TILE))%2===0 ? '#120826' : '#160a2e';
      ctx.fillRect(tx, ty, Math.min(TILE,W-WALL-tx), Math.min(TILE,H-WALL-ty));
    }
  ctx.strokeStyle='rgba(80,20,140,0.22)'; ctx.lineWidth=0.5;
  for (let tx=WALL; tx<=W-WALL; tx+=TILE){ctx.beginPath();ctx.moveTo(tx,WALL);ctx.lineTo(tx,H-WALL);ctx.stroke();}
  for (let ty=WALL; ty<=H-WALL; ty+=TILE){ctx.beginPath();ctx.moveTo(WALL,ty);ctx.lineTo(W-WALL,ty);ctx.stroke();}
}
function drawWalls() {
  ctx.fillStyle='#1a0840';
  ctx.fillRect(0,0,W,WALL); ctx.fillRect(0,H-WALL,W,WALL);
  ctx.fillRect(0,0,WALL,H); ctx.fillRect(W-WALL,0,WALL,H);
  ctx.strokeStyle='#4a1080'; ctx.lineWidth=2; ctx.strokeRect(WALL,WALL,W-WALL*2,H-WALL*2);
  ctx.strokeStyle='#9030e0'; ctx.lineWidth=2;
  for (const[cx,cy,sx,sy] of [[WALL,WALL,1,1],[W-WALL,WALL,-1,1],[WALL,H-WALL,1,-1],[W-WALL,H-WALL,-1,-1]]) {
    const B=14; ctx.beginPath(); ctx.moveTo(cx+sx*B,cy); ctx.lineTo(cx,cy); ctx.lineTo(cx,cy+sy*B); ctx.stroke();
  }
}
function drawFurniture() {
  for (const f of FURNITURE) {
    ctx.save();
    if (f.type==='pillar'){
      ctx.shadowColor='#9030e0'; ctx.shadowBlur=12; ctx.fillStyle='#2a0a50'; ctx.fillRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle='#9030e0'; ctx.lineWidth=1.5; ctx.strokeRect(f.x,f.y,f.w,f.h);
    } else if (f.type==='table'){
      ctx.fillStyle='#1e0840'; ctx.fillRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle='#4a1a80'; ctx.lineWidth=1.5; ctx.strokeRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle='rgba(90,40,140,0.35)'; ctx.lineWidth=1;
      for (let lx=f.x+10; lx<f.x+f.w-4; lx+=12){ctx.beginPath();ctx.moveTo(lx,f.y+5);ctx.lineTo(lx,f.y+f.h-5);ctx.stroke();}
    } else {
      ctx.fillStyle='#180636'; ctx.fillRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle='#3a1070'; ctx.lineWidth=1.5; ctx.strokeRect(f.x,f.y,f.w,f.h);
    }
    ctx.restore();
  }
}
function drawPortal(p) {
  ctx.save();
  ctx.shadowColor=p.color; ctx.shadowBlur=18+Math.sin(p.pulse)*7;
  ctx.strokeStyle=p.color; ctx.lineWidth=4; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.stroke();
  ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(t*1.4); ctx.globalAlpha=0.5; ctx.lineWidth=2;
  ctx.setLineDash([7,6]); ctx.beginPath(); ctx.arc(0,0,p.r-10,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]); ctx.restore();
  ctx.globalAlpha=0.06+Math.sin(p.pulse)*0.04; ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
  ctx.restore();
  ctx.fillStyle='#fff'; ctx.font='600 13px ui-sans-serif,sans-serif'; ctx.textAlign='center';
  ctx.fillText(p.label, p.x, p.y-p.r-10);
}

// ── Neon bullet drawing (batched passes) ──────────────────────────
function drawPlayerBullets() {
  if (!bullets.length) return;
  // Pass 1 — cyan glow halo (all at once)
  ctx.save();
  ctx.shadowColor='#00ddff'; ctx.shadowBlur=18; ctx.globalAlpha=0.45; ctx.fillStyle='#00ddff';
  for (const b of bullets) { ctx.beginPath(); ctx.arc(b.x,b.y,b.r+3,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
  // Pass 2 — weapon-color cores (grouped by color)
  ctx.save(); ctx.shadowBlur=8; ctx.globalAlpha=1;
  const byClr = new Map();
  for (const b of bullets) { if (!byClr.has(b.clr)) byClr.set(b.clr,[]); byClr.get(b.clr).push(b); }
  for (const [clr, bs] of byClr) {
    ctx.shadowColor=clr; ctx.fillStyle=clr;
    for (const b of bs) { ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); }
  }
  ctx.restore();
}

function drawEnemyBullets() {
  if (!enemyBullets.length) return;
  // Pass 1 — outer red halo
  ctx.save();
  ctx.shadowColor='#ff0000'; ctx.shadowBlur=22; ctx.globalAlpha=0.4; ctx.fillStyle='#ff0022';
  for (const b of enemyBullets) { ctx.beginPath(); ctx.arc(b.x,b.y,b.r+4,0,Math.PI*2); ctx.fill(); }
  // Pass 2 — solid red core
  ctx.globalAlpha=1; ctx.shadowBlur=10; ctx.fillStyle='#ff2244';
  for (const b of enemyBullets) { ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
}

// ── Enemy drawing ─────────────────────────────────────────────────
function drawEnemies() {
  // Pass 1 — red glow halos (batched)
  ctx.save();
  ctx.shadowColor='#ff0000'; ctx.shadowBlur=14; ctx.globalAlpha=0.28; ctx.fillStyle='#ff0000';
  for (const e of enemies) { ctx.beginPath(); ctx.arc(e.x,e.y,e.r+4,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
  // Pass 2 — individual cores + HP bars
  for (const e of enemies) {
    ctx.save();
    ctx.shadowColor=e.clr; ctx.shadowBlur=10; ctx.fillStyle=e.clr;
    ctx.beginPath(); ctx.arc(e.x,e.y,e.r,0,Math.PI*2); ctx.fill();
    const dotX=e.x+Math.cos(e.angle)*(e.r-4), dotY=e.y+Math.sin(e.angle)*(e.r-4);
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.shadowBlur=0;
    ctx.beginPath(); ctx.arc(dotX,dotY,2.5,0,Math.PI*2); ctx.fill();
    ctx.restore();
    const bw=e.r*2;
    ctx.fillStyle='#440000'; ctx.fillRect(e.x-e.r, e.y-e.r-8, bw, 3);
    ctx.fillStyle='#ff4455'; ctx.fillRect(e.x-e.r, e.y-e.r-8, bw*(e.hp/e.maxHp), 3);
  }
}

// ── Boss drawing ──────────────────────────────────────────────────
function drawBoss(b) {
  if (!b) return;
  const enr = b.enraged, pulse = Math.sin(t*(enr?6:3))*0.5+0.5;

  ctx.save();
  // Outer corona
  ctx.globalAlpha=0.12+pulse*0.06; ctx.shadowColor='#ff0000'; ctx.shadowBlur=60; ctx.fillStyle='#ff0022';
  ctx.beginPath(); ctx.arc(b.x,b.y,b.r+25+pulse*10,0,Math.PI*2); ctx.fill();
  // Inner corona
  ctx.globalAlpha=0.38; ctx.shadowBlur=30;
  ctx.beginPath(); ctx.arc(b.x,b.y,b.r+10,0,Math.PI*2); ctx.fill();

  // Rotating rings
  ctx.save(); ctx.translate(b.x,b.y);
  ctx.strokeStyle=enr?'#ff6600':'#ff0033'; ctx.lineWidth=2.5; ctx.shadowColor=enr?'#ff6600':'#ff0033'; ctx.shadowBlur=12; ctx.globalAlpha=0.85;
  ctx.rotate(t*(enr?4:1.8)); ctx.setLineDash([10,8]); ctx.beginPath(); ctx.arc(0,0,b.r+14,0,Math.PI*2); ctx.stroke();
  ctx.rotate(-(t*(enr?8:3.5))); ctx.globalAlpha=0.5; ctx.lineWidth=1.5; ctx.setLineDash([6,10]);
  ctx.beginPath(); ctx.arc(0,0,b.r+22,0,Math.PI*2); ctx.stroke();
  ctx.setLineDash([]); ctx.restore();

  // Body
  ctx.globalAlpha=1; ctx.shadowColor=enr?'#ff6600':'#ff0033'; ctx.shadowBlur=20;
  ctx.fillStyle=b.charging?'#ff8800':(enr?'#dd2200':'#aa0022');
  ctx.beginPath(); ctx.arc(b.x,b.y,b.r,0,Math.PI*2); ctx.fill();

  // Eyes
  const eyeR=b.r*0.35, ea=b.angle;
  for (const side of [-0.42,0.42]) {
    const ex=b.x+Math.cos(ea+side)*eyeR, ey=b.y+Math.sin(ea+side)*eyeR;
    ctx.fillStyle=enr?'#ff8800':'#ffffff'; ctx.shadowColor='#ffffff'; ctx.shadowBlur=8; ctx.globalAlpha=0.92;
    ctx.beginPath(); ctx.arc(ex,ey,5,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.shadowBlur=0; ctx.globalAlpha=1;
    ctx.beginPath(); ctx.arc(ex+Math.cos(ea)*2,ey+Math.sin(ea)*2,2.5,0,Math.PI*2); ctx.fill();
  }
  ctx.restore();

  // HP bar
  const bw=b.r*3, bh=8, bx2=b.x-bw/2, by2=b.y-b.r-22;
  ctx.fillStyle='#330000'; ctx.fillRect(bx2,by2,bw,bh);
  ctx.fillStyle=b.hp/b.maxHp>0.5?'#ff2244':'#ff6600';
  ctx.fillRect(bx2,by2,bw*(b.hp/b.maxHp),bh);
  ctx.strokeStyle='#ff4455'; ctx.lineWidth=1.5; ctx.strokeRect(bx2,by2,bw,bh);
  ctx.fillStyle=enr?'#ff8800':'#ff4455'; ctx.font='bold 12px ui-sans-serif,sans-serif'; ctx.textAlign='center';
  ctx.shadowColor=enr?'#ff8800':'#ff4455'; ctx.shadowBlur=10;
  ctx.fillText(enr?'BOSS ★ ENRAGED':'BOSS', b.x, by2-5);
  ctx.shadowBlur=0;
}

// ── Buff item drawing ─────────────────────────────────────────────
function drawBuffItems() {
  for (const item of buffItems) {
    const pulse=Math.sin(item.pulse)*0.5+0.5, fade=Math.min(1,item.life/2);
    ctx.save();
    ctx.globalAlpha=fade;
    ctx.shadowColor=item.def.clr; ctx.shadowBlur=12+pulse*10;
    ctx.fillStyle=item.def.clr;
    ctx.beginPath(); ctx.arc(item.x,item.y,12+pulse*3,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.82)'; ctx.shadowBlur=0;
    ctx.beginPath(); ctx.arc(item.x,item.y,10,0,Math.PI*2); ctx.fill();
    ctx.fillStyle=item.def.clr; ctx.font='bold 8px ui-sans-serif,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(item.def.name.slice(0,3), item.x, item.y);
    ctx.textBaseline='alphabetic'; ctx.font='9px ui-sans-serif,sans-serif';
    ctx.fillText(item.def.name, item.x, item.y+20);
    ctx.restore();
  }
}

// ── Explosion drawing ─────────────────────────────────────────────
function drawExplosions() {
  ctx.save();
  for (const ex of explosions) {
    const alpha = ex.life / ex.maxLife;
    ctx.globalAlpha = alpha * 0.7; ctx.shadowColor=ex.clr; ctx.shadowBlur=16;
    ctx.strokeStyle=ex.clr; ctx.lineWidth=3;
    ctx.beginPath(); ctx.arc(ex.x,ex.y,ex.r,0,Math.PI*2); ctx.stroke();
    ctx.globalAlpha=alpha*0.25; ctx.lineWidth=7;
    ctx.beginPath(); ctx.arc(ex.x,ex.y,ex.r*0.55,0,Math.PI*2); ctx.stroke();
  }
  ctx.restore();
}

// ── Player + peer drawing ─────────────────────────────────────────
function drawPlayerAvatar(x, y, angle, color, alpha=1) {
  ctx.save();
  // Ally teal aura
  ctx.globalAlpha=alpha*0.25; ctx.shadowColor='#00ffaa'; ctx.shadowBlur=22; ctx.fillStyle='#00ffaa';
  ctx.beginPath(); ctx.arc(x,y,PR+5,0,Math.PI*2); ctx.fill();
  // Body
  ctx.globalAlpha=alpha; ctx.shadowColor=color; ctx.shadowBlur=12; ctx.fillStyle=color;
  ctx.beginPath(); ctx.arc(x,y,PR,0,Math.PI*2); ctx.fill();
  // Direction dot
  const dotX=x+Math.sin(angle)*(PR-4), dotY=y-Math.cos(angle)*(PR-4);
  ctx.fillStyle='rgba(255,255,255,0.88)'; ctx.shadowColor='#fff'; ctx.shadowBlur=6; ctx.globalAlpha=alpha*0.85;
  ctx.beginPath(); ctx.arc(dotX,dotY,3.5,0,Math.PI*2); ctx.fill();
  ctx.restore();
}
function drawPeer(p) {
  const alive = p.alive !== false, alpha = alive ? 0.85 : 0.22;
  ctx.save();
  // Cyan ally aura
  ctx.globalAlpha=alpha*0.22; ctx.shadowColor='#00ccff'; ctx.shadowBlur=20; ctx.fillStyle='#00ccff';
  ctx.beginPath(); ctx.arc(p.renderX,p.renderY,PR+5,0,Math.PI*2); ctx.fill();
  // Body
  ctx.globalAlpha=alpha; ctx.shadowColor=p.color||'#888'; ctx.shadowBlur=12; ctx.fillStyle=p.color||'#888';
  ctx.beginPath(); ctx.arc(p.renderX,p.renderY,PR,0,Math.PI*2); ctx.fill();
  const dotX=p.renderX+Math.sin(p.angle||0)*(PR-4), dotY=p.renderY-Math.cos(p.angle||0)*(PR-4);
  ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.shadowColor='#fff'; ctx.shadowBlur=5; ctx.globalAlpha=alpha*0.8;
  ctx.beginPath(); ctx.arc(dotX,dotY,3.5,0,Math.PI*2); ctx.fill();
  ctx.restore();
  // Name + HP bar
  if (p.username) {
    ctx.fillStyle='#00ffcc'; ctx.font='10px ui-sans-serif,sans-serif'; ctx.textAlign='center'; ctx.globalAlpha=alpha;
    ctx.fillText(p.username, p.renderX, p.renderY-PR-16);
  }
  if (p.maxHp && alive) {
    const bw=28, bx2=p.renderX-bw/2, by2=p.renderY-PR-13;
    ctx.globalAlpha=alpha*0.7;
    ctx.fillStyle='#112200'; ctx.fillRect(bx2,by2,bw,4);
    ctx.fillStyle='#44ff88'; ctx.fillRect(bx2,by2,bw*(p.hp/p.maxHp),4);
  }
  ctx.globalAlpha=1;
}

// ── HUD ───────────────────────────────────────────────────────────
function drawHUD() {
  const w=getWeapon(player.level);
  const bx=WALL+10, by=H-WALL-54, bw=210, bh=14;

  // HP bar
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(bx,by,bw,bh);
  ctx.fillStyle=player.iframes>0?'#ff8899':'#ff4455';
  ctx.fillRect(bx,by,bw*(player.hp/player.maxHp),bh);
  ctx.strokeStyle='#ff8899'; ctx.lineWidth=1; ctx.strokeRect(bx,by,bw,bh);
  ctx.fillStyle='#fff'; ctx.font='11px ui-sans-serif,sans-serif'; ctx.textAlign='left';
  ctx.fillText(`HP  ${Math.ceil(player.hp)} / ${player.maxHp}`, bx+4, by+11);

  // XP bar
  const xby=by+bh+4;
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(bx,xby,bw,bh);
  ctx.fillStyle='#aa44ff'; ctx.fillRect(bx,xby,bw*(player.xp/xpToNext(player.level)),bh);
  ctx.strokeStyle='#cc88ff'; ctx.lineWidth=1; ctx.strokeRect(bx,xby,bw,bh);
  ctx.fillStyle='#fff'; ctx.fillText(`LV ${player.level}  XP ${player.xp}/${xpToNext(player.level)}`, bx+4, xby+11);

  // Weapon
  const wby=xby+bh+6;
  ctx.fillStyle=w.clr; ctx.shadowColor=w.clr; ctx.shadowBlur=6;
  ctx.font='bold 13px ui-sans-serif,sans-serif';
  ctx.fillText(`⚔ ${w.name}`, bx, wby+11);
  ctx.shadowBlur=0;
  const next=WEAPONS.find(wp=>wp.lv>player.level);
  if (next) {
    ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='11px ui-sans-serif,sans-serif';
    ctx.fillText(`Next: ${next.name} @ Lv${next.lv}`, bx, wby+26);
  }

  // Active buffs
  let buffDrawX = bx;
  const buffDrawY = wby + 42;
  for (const [id, timer] of Object.entries(player.buffs)) {
    if (timer <= 0) continue;
    const def = BUFF_DEFS.find(d => d.id === id); if (!def) continue;
    ctx.save();
    ctx.shadowColor=def.clr; ctx.shadowBlur=8; ctx.globalAlpha=0.85;
    ctx.fillStyle=def.clr; ctx.beginPath(); ctx.arc(buffDrawX+8,buffDrawY,8,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.shadowBlur=0; ctx.globalAlpha=1;
    ctx.font='bold 7px ui-sans-serif,sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(id[0].toUpperCase(), buffDrawX+8, buffDrawY);
    ctx.textBaseline='alphabetic';
    ctx.fillStyle=def.clr; ctx.globalAlpha=0.55;
    ctx.fillRect(buffDrawX+20, buffDrawY-4, 38*(timer/def.dur), 8);
    ctx.strokeStyle=def.clr; ctx.lineWidth=1; ctx.globalAlpha=0.35;
    ctx.strokeRect(buffDrawX+20, buffDrawY-4, 38, 8);
    ctx.fillStyle=def.clr; ctx.font='9px ui-sans-serif,sans-serif';
    ctx.textAlign='left'; ctx.globalAlpha=1;
    ctx.fillText(`${def.name} ${Math.ceil(timer)}s`, buffDrawX+62, buffDrawY+3);
    ctx.restore();
    buffDrawX += 130;
  }

  // Top-right stats
  ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.font='bold 13px ui-sans-serif,sans-serif'; ctx.textAlign='right';
  ctx.fillText(boss ? `BOSS ${Math.ceil(boss.hp*100/boss.maxHp)}%` : `Wave ${wave}`, W-WALL-10, WALL+20);
  ctx.fillText(`Kills ${kills}`, W-WALL-10, WALL+36);
  if (!boss) ctx.fillText(`${enemies.length} left`, W-WALL-10, WALL+52);
  const pCount = peers.size+1;
  if (pCount > 1) {
    ctx.fillStyle='#00ffcc'; ctx.fillText(`${pCount}/${MAX_PLAYERS} players`, W-WALL-10, WALL+68);
  }

  // Crosshair (cyan for ally)
  ctx.save();
  ctx.strokeStyle='rgba(0,220,255,0.65)'; ctx.lineWidth=1.5; const cs=9;
  ctx.beginPath(); ctx.moveTo(mouseX-cs,mouseY); ctx.lineTo(mouseX+cs,mouseY); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(mouseX,mouseY-cs); ctx.lineTo(mouseX,mouseY+cs); ctx.stroke();
  ctx.beginPath(); ctx.arc(mouseX,mouseY,3,0,Math.PI*2); ctx.stroke();
  ctx.restore();

  // Notification
  if (notifT > 0) {
    ctx.save(); ctx.globalAlpha=Math.min(1,notifT);
    ctx.fillStyle=notifClr; ctx.shadowColor=notifClr; ctx.shadowBlur=18;
    ctx.font='bold 22px ui-sans-serif,sans-serif'; ctx.textAlign='center';
    ctx.fillText(notif, W/2, WALL+44); ctx.restore();
  }
}

// ── Menu + Dead screens ───────────────────────────────────────────
function drawButton(label, cx, cy, glowColor) {
  ctx.save(); ctx.shadowColor=glowColor; ctx.shadowBlur=20;
  ctx.fillStyle='rgba(10,5,20,0.92)'; ctx.strokeStyle=glowColor; ctx.lineWidth=2;
  ctx.beginPath(); ctx.roundRect(cx-BTN_W/2,cy-BTN_H/2,BTN_W,BTN_H,8); ctx.fill(); ctx.stroke();
  ctx.fillStyle=glowColor; ctx.font='bold 18px ui-sans-serif,sans-serif';
  ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label,cx,cy);
  ctx.restore(); ctx.textBaseline='alphabetic';
}
function drawMenu() {
  ctx.fillStyle='rgba(8,3,18,0.84)'; ctx.fillRect(0,0,W,H);
  ctx.save();
  ctx.shadowColor='#c64bff'; ctx.shadowBlur=30; ctx.fillStyle='#f4f4ff';
  ctx.font='bold 64px ui-sans-serif,sans-serif'; ctx.textAlign='center';
  ctx.fillText('ARENA', W/2, H/2-86);
  ctx.fillStyle='#c64bff'; ctx.font='17px ui-sans-serif,sans-serif';
  ctx.fillText('Co-op arena shooter · survive the waves · level up your weapons', W/2, H/2-46);
  ctx.restore();
  drawButton('START GAME',  W/2, H/2+20,  '#44ff88');
  drawButton('LEAVE ARENA', W/2, H/2+88,  '#ff4455');
  // Weapon tier preview
  ctx.save();
  const startX = W/2 - (WEAPONS.length*110)/2 + 55;
  for (let i=0; i<WEAPONS.length; i++) {
    const ww=WEAPONS[i];
    ctx.fillStyle=ww.clr; ctx.shadowColor=ww.clr; ctx.shadowBlur=8;
    ctx.font='bold 11px ui-sans-serif,sans-serif'; ctx.textAlign='center';
    ctx.fillText(`Lv${ww.lv}`, startX+i*110, H/2-5);
    ctx.shadowBlur=0; ctx.fillStyle='rgba(255,255,255,0.7)';
    ctx.font='10px ui-sans-serif,sans-serif';
    ctx.fillText(ww.name, startX+i*110, H/2+10);
  }
  ctx.restore();
  // Buff preview
  ctx.save();
  const bStartX = W/2 - (BUFF_DEFS.length*120)/2 + 60;
  for (let i=0; i<BUFF_DEFS.length; i++) {
    const bd=BUFF_DEFS[i];
    ctx.fillStyle=bd.clr; ctx.shadowColor=bd.clr; ctx.shadowBlur=6;
    ctx.font='bold 10px ui-sans-serif,sans-serif'; ctx.textAlign='center';
    ctx.fillText(`★ ${bd.name}`, bStartX+i*120, H/2+30);
  }
  ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='12px ui-sans-serif,sans-serif'; ctx.textAlign='center';
  ctx.fillText('WASD move · Mouse aim · Click shoot · Walk into portal to travel · Up to 6 co-op', W/2, H/2+152);
}
function drawDead() {
  ctx.fillStyle='rgba(8,3,18,0.88)'; ctx.fillRect(0,0,W,H);
  ctx.save(); ctx.shadowColor='#ff4455'; ctx.shadowBlur=30;
  ctx.fillStyle='#ff4455'; ctx.font='bold 56px ui-sans-serif,sans-serif'; ctx.textAlign='center';
  ctx.fillText('GAME OVER', W/2, H/2-60); ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.75)'; ctx.font='18px ui-sans-serif,sans-serif'; ctx.textAlign='center';
  ctx.fillText(`Level ${player.level}  ·  ${kills} kills  ·  Wave ${wave}`, W/2, H/2-16);
  drawButton('PLAY AGAIN', W/2, H/2+45,  '#44ff88');
  drawButton('MAIN MENU',  W/2, H/2+108, '#aaaaaa');
}

// ── Render ────────────────────────────────────────────────────────
function render() {
  ctx.fillStyle='#0a0514'; ctx.fillRect(0,0,W,H);
  drawFloor(); drawWalls(); drawFurniture();
  drawPortal(exitPortal);
  if (returnPortal) drawPortal(returnPortal);

  if (state === 'playing') {
    drawBuffItems();
    drawExplosions();
    drawPlayerBullets();
    drawEnemyBullets();
    drawEnemies();
    drawBoss(boss);

    for (const p of peers.values()) { if (p) drawPeer(p); }

    // Player (flash during iframes)
    if (player.iframes <= 0 || Math.floor(t*10)%2 === 0)
      drawPlayerAvatar(player.x, player.y, player.angle, player.color, 1);

    drawHUD();
  } else if (state === 'menu') {
    drawMenu();
  } else if (state === 'dead') {
    drawDead();
  }
}

// ── Game loop ─────────────────────────────────────────────────────
let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
