// Top-down arena shooter — 1920×1080, walk-on menu pads, 30s wave timer
// Portal Protocol + Trystero co-op multiplayer

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
const W = canvas.width;    // 1920
const H = canvas.height;   // 1080
canvas.style.cursor = 'default';
function updateCursor() {
  canvas.style.cursor = (state === 'playing') ? 'none' : 'default';
}

// ── Music ─────────────────────────────────────────────────────────
const music = new Audio('music.mp3');
music.loop = true;
music.volume = 0.55;
function musicPlay()  { if (music.paused) music.play().catch(()=>{}); }
function musicPause() { if (!music.paused) music.pause(); }

// Browsers block Audio.play() unless it originates from a user gesture.
// Prime the audio context on the very first input so musicPlay() works
// from anywhere in the code (RAF, pad walk-on, etc.).
let _audioUnlocked = false;
function _unlockAudio() {
  if (_audioUnlocked) return;
  _audioUnlocked = true;
  music.play().then(() => { if (state !== 'playing') music.pause(); }).catch(()=>{});
}
addEventListener('mousedown', _unlockAudio, { once: true });
addEventListener('keydown',   _unlockAudio, { once: true });

// ── Portal protocol ───────────────────────────────────────────────
const incoming   = Portal.readPortalParams();
document.getElementById('username').textContent = incoming.username;
const nextTarget = await Portal.pickPortalTarget();

// ── Constants ─────────────────────────────────────────────────────
const WALL = 36, TILE = 48, PR = 13;
const MAX_PLAYERS = 6;
const WAVE_DELAY  = 30;   // seconds between waves

// ── Portals (hidden during play, active in lobby) ─────────────────
const EXIT_PORTAL_POS   = { x: W - WALL - 80, y: H / 2 };
const RETURN_PORTAL_POS = { x: WALL + 80,      y: H / 2 };
// Off-map position used while game is active
const OFF_MAP = { x: -999, y: -999 };

const exitPortal = {
  ...EXIT_PORTAL_POS, r: 40, color: '#c64bff',
  label: nextTarget ? `→ ${nextTarget.title}` : 'no destinations yet',
  target: nextTarget?.url ?? null, pulse: 0,
};
const returnPortal = incoming.ref ? {
  ...RETURN_PORTAL_POS, r: 40, color: '#4ff0ff',
  label: '← back', target: incoming.ref, pulse: 0,
} : null;

function movePortals(active) {
  if (active) {
    exitPortal.x = EXIT_PORTAL_POS.x;   exitPortal.y = EXIT_PORTAL_POS.y;
    if (returnPortal) { returnPortal.x = RETURN_PORTAL_POS.x; returnPortal.y = RETURN_PORTAL_POS.y; }
  } else {
    exitPortal.x = OFF_MAP.x;  exitPortal.y = OFF_MAP.y;
    if (returnPortal) { returnPortal.x = OFF_MAP.x; returnPortal.y = OFF_MAP.y; }
  }
}
movePortals(true); // start in lobby

// ── World geometry ─────────────────────────────────────────────────
const WALLS = [
  {x:0,      y:0,      w:W,    h:WALL},
  {x:0,      y:H-WALL, w:W,    h:WALL},
  {x:0,      y:0,      w:WALL, h:H},
  {x:W-WALL, y:0,      w:WALL, h:H},
];

const FURNITURE = [
  // Outer-ring pillars (8)
  {x:90,         y:75,         w:34, h:34, type:'pillar'},
  {x:W-124,      y:75,         w:34, h:34, type:'pillar'},
  {x:90,         y:H-109,      w:34, h:34, type:'pillar'},
  {x:W-124,      y:H-109,      w:34, h:34, type:'pillar'},
  {x:W/2-17,     y:75,         w:34, h:34, type:'pillar'},
  {x:W/2-17,     y:H-109,      w:34, h:34, type:'pillar'},
  {x:75,         y:H/2-17,     w:34, h:34, type:'pillar'},
  {x:W-109,      y:H/2-17,     w:34, h:34, type:'pillar'},
  // Inner quadrant pillars (4)
  {x:W*0.25-17,  y:H*0.25-17,  w:34, h:34, type:'pillar'},
  {x:W*0.75-17,  y:H*0.25-17,  w:34, h:34, type:'pillar'},
  {x:W*0.25-17,  y:H*0.75-17,  w:34, h:34, type:'pillar'},
  {x:W*0.75-17,  y:H*0.75-17,  w:34, h:34, type:'pillar'},
  // Side pillars (mid-lane cover)
  {x:W*0.15-16,  y:H/2-45,     w:32, h:90, type:'pillar'},
  {x:W*0.85-16,  y:H/2-45,     w:32, h:90, type:'pillar'},
  // Central structure (two tables)
  {x:W/2-100,    y:H/2-50,     w:200,h:100,type:'table' },
  // Benches — upper row
  {x:300,        y:180,        w:160, h:36, type:'bench'},
  {x:W-460,      y:180,        w:160, h:36, type:'bench'},
  {x:W/2-200,    y:200,        w:120, h:36, type:'bench'},
  {x:W/2+80,     y:200,        w:120, h:36, type:'bench'},
  // Benches — lower row
  {x:300,        y:H-216,      w:160, h:36, type:'bench'},
  {x:W-460,      y:H-216,      w:160, h:36, type:'bench'},
  {x:W/2-200,    y:H-236,      w:120, h:36, type:'bench'},
  {x:W/2+80,     y:H-236,      w:120, h:36, type:'bench'},
  // Mid-lane scatter blocks
  {x:W*0.33-24,  y:H/2-24,    w:48,  h:48, type:'pillar'},
  {x:W*0.67-24,  y:H/2-24,    w:48,  h:48, type:'pillar'},
];

const SOLID = [...WALLS, ...FURNITURE];

// ── Walk-on menu pads ─────────────────────────────────────────────
const WALK_PADS = [
  { id:'start',  x:W/2-380, y:H*0.64, w:240, h:100, label:'START',  sub:'stand to begin',  clr:'#44ff88', timer:0 },
  { id:'scores', x:W/2,     y:H*0.64, w:240, h:100, label:'SCORES', sub:'stand to view',   clr:'#44ddff', timer:0 },
  { id:'end',    x:W/2+380, y:H*0.64, w:240, h:100, label:'END',    sub:'stand to leave',  clr:'#ff4455', timer:0 },
];
const PAD_HOLD = 1.0; // seconds to hold before activating

// ── Weapons ───────────────────────────────────────────────────────
const WEAPONS = [
  {name:'Pistol',  lv:1,  dmg:15, spd:9,  cd:0.42,n:1,spr:0,    pierce:false,aoe:0,  clr:'#ffdd44',br:4},
  {name:'Shotgun', lv:3,  dmg:12, spd:9,  cd:0.70,n:5,spr:0.32, pierce:false,aoe:0,  clr:'#ff8833',br:4},
  {name:'SMG',     lv:5,  dmg:9,  spd:13, cd:0.09,n:1,spr:0.10, pierce:false,aoe:0,  clr:'#44aaff',br:3},
  {name:'Plasma',  lv:7,  dmg:40, spd:14, cd:0.45,n:1,spr:0,    pierce:true, aoe:0,  clr:'#dd44ff',br:5},
  {name:'Rocket',  lv:10, dmg:90, spd:6,  cd:1.10,n:1,spr:0,    pierce:false,aoe:55, clr:'#ff4444',br:6},
];
const getWeapon = lv => [...WEAPONS].reverse().find(w => lv >= w.lv) ?? WEAPONS[0];
const xpToNext  = lv => 40 + lv * 30;

// ── Buff items ────────────────────────────────────────────────────
const BUFF_DEFS = [
  {id:'bouncing', name:'BOUNCE', dur:20, clr:'#44ffcc'},
  {id:'splash',   name:'SPLASH', dur:20, clr:'#ff8844'},
  {id:'spread',   name:'SPREAD', dur:20, clr:'#4488ff'},
  {id:'rapid',    name:'RAPID',  dur:15, clr:'#ffff44'},
];

// ── Enemy templates ───────────────────────────────────────────────
const ETYPES = [
  {kind:'Runner',  maxHp:60,  spd:2.4, dmg:18, r:10, clr:'#ff4455', xp:10}, // solid baseline
  {kind:'Brute',   maxHp:220, spd:0.9, dmg:45, r:18, clr:'#ff8800', xp:30}, // slow, devastating
  {kind:'Speeder', maxHp:35,  spd:5.2, dmg:8,  r:8,  clr:'#ff44cc', xp:15}, // fast but light hits
];
function pickType(wave) {
  if (wave <= 2) return ETYPES[0];
  if (wave <= 4) return Math.random() < 0.35 ? ETYPES[1] : ETYPES[0];
  return ETYPES[Math.floor(Math.random() * ETYPES.length)];
}

// ── Game state ────────────────────────────────────────────────────
let state = 'menu'; // 'menu' | 'playing' | 'paused' | 'dead'
let bullets, enemyBullets, enemies, boss;
let explosions, buffItems;
let wave, waveTimer, shotCd, kills, buffSpawnTimer;
let notif = '', notifT = 0, notifClr = '#ffdd44';
let t = 0, lastBroad = 0;

// Player is always live so lobby movement works
let player = {
  x: W / 2, y: H / 2 - 80, r: PR, speed: 10,
  color: '#' + incoming.color, angle: 0,
  hp: 200, maxHp: 200, level: 1, xp: 0, iframes: 0,
  buffs: {bouncing:0, splash:0, spread:0, rapid:0},
};

function showNotif(msg, clr='#ffdd44') { notif=msg; notifT=2.8; notifClr=clr; }

function initGame() {
  player.x = W/2; player.y = H/2;
  player.hp = 200; player.maxHp = 200;
  player.level = 1; player.xp = 0; player.iframes = 0;
  player.buffs = {bouncing:0,splash:0,spread:0,rapid:0};
  bullets=[]; enemyBullets=[]; enemies=[];
  boss=null; explosions=[]; buffItems=[];
  wave=0; waveTimer=WAVE_DELAY; shotCd=0; kills=0; buffSpawnTimer=25;
  // Reset pad timers
  for (const p of WALK_PADS) p.timer = 0;
  spawnWave();
  movePortals(false); // portals off-map during game
}

// ── Spawning ──────────────────────────────────────────────────────
function randomEdgePos() {
  const side = Math.floor(Math.random()*4);
  if (side===0) return {x:WALL+10+Math.random()*(W-WALL*2-20), y:WALL+8};
  if (side===1) return {x:WALL+10+Math.random()*(W-WALL*2-20), y:H-WALL-8};
  if (side===2) return {x:WALL+8,     y:WALL+10+Math.random()*(H-WALL*2-20)};
                return {x:W-WALL-8,   y:WALL+10+Math.random()*(H-WALL*2-20)};
}

function spawnEnemy(type) {
  const pos = randomEdgePos();
  enemies.push({...type, hp:type.maxHp, ...pos, angle:0});
}

function spawnWave() {
  wave++;
  const peerCount  = Math.min(peers.size, MAX_PLAYERS-1);
  const hpMult     = 1 + peerCount * 0.35;
  const extraCount = peerCount * 2;

  if (wave % 5 === 0) {
    const tier  = Math.floor((wave-5)/5);
    const bHp   = Math.round(800 * Math.pow(1.35, tier) * hpMult);
    const pos   = randomEdgePos();
    boss = {
      ...pos, r:32, spd:1.8, dmg:70,
      hp:bHp, maxHp:bHp, clr:'#cc0033', xp:300+wave*30,
      atkCd:2.5, atkIdx:0, charging:false, chargeDur:0,
      chargeDir:{x:0,y:1}, enraged:false, angle:0,
    };
    const minionCount = 4 + (tier*2) + extraCount;
    for (let i=0; i<minionCount; i++) spawnEnemy(ETYPES[0]);
    waveTimer = 9999;
    showNotif(`★ BOSS WAVE ${wave} ★`, '#ff2244');
  } else {
    const total = (2 + wave*3) + extraCount;
    for (let i=0; i<total; i++) spawnEnemy(pickType(wave));
    if (wave > 1) showNotif(`Wave ${wave}`, '#ffdd44');
    waveTimer = WAVE_DELAY;
  }
}

// ── Boss attacks ──────────────────────────────────────────────────
function doBossAttack(b) {
  const phase = b.atkIdx % 3;
  b.atkIdx++;

  if (phase === 0) {
    const n = b.enraged ? 14 : 9;
    for (let i=0; i<n; i++) {
      const a = (i/n)*Math.PI*2 + t*0.4;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*4.5,vy:Math.sin(a)*4.5,dmg:12,r:7,life:3,dead:false});
    }
    if (b.enraged) {
      for (let i=0; i<9; i++) {
        const a=(i/9)*Math.PI*2+Math.PI/9+t*0.4;
        enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*3.2,vy:Math.sin(a)*3.2,dmg:10,r:6,life:3.5,dead:false});
      }
    }
    createExplosion(b.x, b.y, 40, '#ff0022');

  } else if (phase === 1) {
    const targets = [{x:player.x,y:player.y}];
    for (const p of peers.values()) if (p?.renderX && p.alive!==false) targets.push({x:p.renderX,y:p.renderY});
    for (const tgt of targets.slice(0,MAX_PLAYERS)) {
      const a  = Math.atan2(tgt.y-b.y, tgt.x-b.x);
      const shots = b.enraged ? 3 : 2;
      for (let i=0; i<shots; i++) {
        const da = (i-(shots-1)/2)*0.18;
        enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a+da)*5.5,vy:Math.sin(a+da)*5.5,dmg:18,r:7,life:3.5,dead:false});
      }
    }

  } else {
    const dx=player.x-b.x, dy=player.y-b.y, d=Math.hypot(dx,dy)||1;
    b.charging=true; b.chargeDur=1.3;
    b.chargeDir={x:dx/d,y:dy/d};
    showNotif('BOSS CHARGING!', '#ff8800');
  }
}

// ── Shooting ──────────────────────────────────────────────────────
function shoot() {
  const w    = getWeapon(player.level);
  const cd   = player.buffs.rapid  >0 ? w.cd*0.55 : w.cd;
  const n    = player.buffs.spread >0 ? w.n+2     : w.n;
  const aoe  = player.buffs.splash >0 ? Math.max(w.aoe,22) : w.aoe;
  const spr  = player.buffs.spread >0 ? w.spr+0.26 : w.spr;
  const base = Math.atan2(mouseY-player.y, mouseX-player.x);
  for (let i=0; i<n; i++) {
    const a = base + (Math.random()-0.5)*spr*2;
    bullets.push({
      x:player.x, y:player.y,
      vx:Math.cos(a)*w.spd, vy:Math.sin(a)*w.spd,
      dmg:w.dmg, r:w.br, clr:w.clr,
      pierce:w.pierce, aoe, life:2.2, dead:false,
      bouncing: player.buffs.bouncing>0, bounces:0,
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
    player.hp = Math.min(player.hp+25, player.maxHp);
    const w = getWeapon(player.level);
    showNotif(w.lv===player.level ? `Lv ${player.level}! Unlocked: ${w.name}` : `Level ${player.level}!`, '#ffdd44');
  }
}

// ── Explosions ────────────────────────────────────────────────────
function createExplosion(x, y, maxR, clr='#ff4400') {
  explosions.push({x,y,r:0,maxR,life:0.4,maxLife:0.4,clr});
}

// ── Input ─────────────────────────────────────────────────────────
const keys = {};
addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') e.preventDefault(); // stop spacebar scrolling page
  if (e.key === 'Escape') {
    if (state === 'playing') { state = 'paused'; musicPause(); }
    else if (state === 'paused') { state = 'playing'; musicPlay(); }
    updateCursor();
  }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

let mouseX=W/2, mouseY=H/2, mouseDown=false;
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseX = (e.clientX-r.left)*(W/r.width);
  mouseY = (e.clientY-r.top) *(H/r.height);
});
canvas.addEventListener('mousedown', e => { if(e.button!==0) return; mouseDown=true; handleClick(mouseX,mouseY); });
canvas.addEventListener('mouseup',   e => { if(e.button===0) mouseDown=false; });

const BTN_W=190, BTN_H=48;
function hitBtn(mx,my,bx,by) {
  return mx>=bx-BTN_W/2 && mx<=bx+BTN_W/2 && my>=by-BTN_H/2 && my<=by+BTN_H/2;
}
// Click only used for dead screen now
function handleClick(mx,my) {
  if (state==='paused') {
    if (hitBtn(mx,my,W/2-200,H/2+10))  { state='playing'; musicPlay();  updateCursor(); }
    if (hitBtn(mx,my,W/2-200,H/2+78))  { movePortals(true); state='menu'; musicPause(); updateCursor(); }
  }
  if (state==='dead') {
    if (hitBtn(mx,my,W/2,H/2+45))  { initGame(); state='playing'; musicPlay();  updateCursor(); }
    if (hitBtn(mx,my,W/2,H/2+108)) { movePortals(true); state='menu'; musicPause(); updateCursor(); }
  }
}

// ── Portal check (lobby only) ─────────────────────────────────────
let redirecting=false;
function checkPortals() {
  if (redirecting || state==='playing') return;
  for (const p of [exitPortal, returnPortal]) {
    if (!p?.target) continue;
    if (Math.hypot(player.x-p.x, player.y-p.y) < p.r+player.r-4) {
      redirecting=true;
      Portal.sendPlayerThroughPortal(p.target, {username:incoming.username,color:incoming.color,speed:player.speed});
    }
  }
}

// ── Leaderboard ───────────────────────────────────────────────────
const LB_KEY = 'arena-leaderboard-v1';
const MAX_LB  = 20;

function lbLoad() {
  try { return JSON.parse(localStorage.getItem(LB_KEY) || '[]'); } catch { return []; }
}
function lbSave(entries) { localStorage.setItem(LB_KEY, JSON.stringify(entries)); }
function lbSubmit(entry) {
  const all = lbLoad();
  all.push(entry);
  all.sort((a,b) => b.score - a.score);
  lbSave(all.slice(0, MAX_LB));
}
function calcScore(wave, kills, level) { return wave * 500 + kills * 50 + level * 100; }

const peerScores = new Map(); // peerId → leaderboard entry
let sendScore = null;
let showScores = false;

function submitMyScore() {
  const score = calcScore(wave, kills, player.level);
  const entry = {
    username: incoming.username,
    wave, kills, level: player.level, score,
    date: new Date().toLocaleDateString(),
  };
  lbSubmit(entry);
  // Broadcast to peers in the same room
  sendScore?.({ ...entry, color: player.color });
}

function mergedLeaderboard() {
  // Combine localStorage entries with live peer scores, deduplicate by username+score, sort
  const local = lbLoad();
  const live  = [...peerScores.values()];
  const all   = [...local, ...live];
  // Deduplicate: keep highest score per username
  const byUser = new Map();
  for (const e of all) {
    const key = e.username?.toLowerCase() ?? '?';
    if (!byUser.has(key) || byUser.get(key).score < e.score) byUser.set(key, e);
  }
  return [...byUser.values()].sort((a,b) => b.score - a.score).slice(0, MAX_LB);
}

// ── Multiplayer ───────────────────────────────────────────────────
const peers=new Map(), peerCountEl=document.getElementById('peers');
let sendState=null, room=null;
const setPeerStatus=(txt,err=false)=>{if(peerCountEl){peerCountEl.textContent=txt;peerCountEl.style.color=err?'#ff6b6b':'';}};
const refreshCount=()=>setPeerStatus(`${peers.size+1} online`);
const broadcastSelf=()=>sendState?.({
  x:player.x, y:player.y, angle:player.angle, color:player.color,
  username:incoming.username,
  hp:player.hp, maxHp:player.maxHp, level:player.level,
  alive: state==='playing' && player.hp>0,
});

async function loadTrystero() {
  for (const url of ['https://esm.run/trystero@0.23','https://cdn.jsdelivr.net/npm/trystero@0.23/+esm','https://esm.sh/trystero@0.23']) {
    try { const m=await import(url); if(m?.joinRoom) return m; } catch {}
  }
  throw new Error('trystero unavailable');
}
async function setupMultiplayer() {
  try {
    setPeerStatus('connecting…');
    const {joinRoom}=await loadTrystero();
    room=joinRoom({appId:'ordinary-game-jam-starter'},'demo-room');
    const [send,get]=room.makeAction('state');
    sendState=send;

    const [sScore,gScore]=room.makeAction('score');
    sendScore=sScore;
    gScore((d,peerId)=>{ peerScores.set(peerId,d); });

    room.onPeerJoin(id=>{peers.set(id,null);broadcastSelf();refreshCount();});
    room.onPeerLeave(id=>{peers.delete(id);refreshCount();});
    get((d,id)=>{const p=peers.get(id);peers.set(id,{...d,renderX:p?.renderX??d.x,renderY:p?.renderY??d.y});});
    refreshCount(); broadcastSelf();
  } catch { setPeerStatus('multiplayer offline',true); }
}
setPeerStatus('connecting…');
setupMultiplayer();
addEventListener('beforeunload',()=>{try{room?.leave();}catch{}});

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
  exitPortal.pulse += dt*3;
  if (returnPortal) returnPortal.pulse += dt*3;
  if (notifT>0) notifT-=dt;

  // ── Player movement (all states)
  {
    let dx=0, dy=0;
    if (keys['w']||keys['arrowup'])    dy-=1;
    if (keys['s']||keys['arrowdown'])  dy+=1;
    if (keys['a']||keys['arrowleft'])  dx-=1;
    if (keys['d']||keys['arrowright']) dx+=1;
    if (dx&&dy){dx*=0.707;dy*=0.707;}
    dx*=player.speed; dy*=player.speed;
    if (dx||dy) player.angle=Math.atan2(dx,-dy);
    else if (state==='playing') player.angle=Math.atan2(mouseX-player.x,-(mouseY-player.y));

    let nx=player.x+dx;
    for (const r of SOLID){const p=pushOut(nx,player.y,player.r,r);nx=p.x;}
    player.x=nx;
    let ny=player.y+dy;
    for (const r of SOLID){const p=pushOut(player.x,ny,player.r,r);ny=p.y;}
    player.y=ny;
  }

  // ── Menu pad logic
  if (state==='menu') {
    for (const pad of WALK_PADS) {
      const hit = circleRect(player.x,player.y,player.r, pad.x-pad.w/2,pad.y-pad.h/2, pad.w,pad.h);
      if (hit) {
        pad.timer = Math.min(PAD_HOLD, pad.timer+dt);
        if (pad.timer >= PAD_HOLD) {
          pad.timer=0;
          if (pad.id==='start')  { initGame(); state='playing'; musicPlay(); updateCursor(); return; }
          if (pad.id==='scores') { showScores=!showScores; pad.timer=0; return; }
          if (pad.id==='end')    {
            window.location.href = nextTarget?.url ?? 'https://callumhyoung.github.io/gamejam/';
          }
        }
      } else {
        pad.timer = Math.max(0, pad.timer-dt*1.8);
      }
    }
    checkPortals();
    const now=performance.now();
    if (now-lastBroad>66){lastBroad=now;broadcastSelf();}
    return;
  }

  if (state==='dead' || state==='paused') return;

  // ── PLAYING STATE ──────────────────────────────────────────────

  // Buff timers
  for (const id of Object.keys(player.buffs)) player.buffs[id]=Math.max(0,player.buffs[id]-dt);

  // Shoot (click OR spacebar)
  shotCd=Math.max(0,shotCd-dt);
  if ((mouseDown||keys[' '])&&shotCd===0) shoot();

  // ── Player bullets
  for (const b of bullets) {
    b.x+=b.vx; b.y+=b.vy; b.life-=dt;
    if (b.life<=0){b.dead=true;continue;}
    const hL=b.x-b.r<WALL+1, hR=b.x+b.r>W-WALL-1, hT=b.y-b.r<WALL+1, hB=b.y+b.r>H-WALL-1;
    if (hL||hR||hT||hB) {
      if (b.bouncing&&b.bounces<3) {
        if(hL||hR){b.vx*=-1;b.x=hL?WALL+b.r+2:W-WALL-b.r-2;}
        if(hT||hB){b.vy*=-1;b.y=hT?WALL+b.r+2:H-WALL-b.r-2;}
        b.bounces++;
      } else { b.dead=true; }
    }
    if (!b.dead) for (const f of FURNITURE) if(circleRect(b.x,b.y,b.r,f.x,f.y,f.w,f.h)){b.dead=true;break;}
  }

  // ── Player bullets vs enemies
  for (const e of enemies) {
    for (const b of bullets) {
      if (b.dead) continue;
      if (Math.hypot(b.x-e.x,b.y-e.y)<e.r+b.r) {
        e.hp-=b.dmg;
        if (b.aoe>0){
          for (const o of enemies) if(Math.hypot(b.x-o.x,b.y-o.y)<b.aoe) o.hp-=b.dmg*0.5;
          if (boss&&Math.hypot(b.x-boss.x,b.y-boss.y)<b.aoe) boss.hp-=b.dmg*0.5;
          createExplosion(b.x,b.y,b.aoe,b.clr); b.dead=true;
        } else if (!b.pierce) { b.dead=true; }
      }
    }
  }

  // ── Player bullets vs boss
  if (boss) {
    for (const b of bullets) {
      if (b.dead) continue;
      if (Math.hypot(b.x-boss.x,b.y-boss.y)<boss.r+b.r) {
        boss.hp-=b.dmg;
        if (b.aoe>0){
          for (const o of enemies) if(Math.hypot(b.x-o.x,b.y-o.y)<b.aoe) o.hp-=b.dmg*0.5;
          createExplosion(b.x,b.y,b.aoe,b.clr); b.dead=true;
        } else if (!b.pierce){b.dead=true;}
      }
    }
  }
  bullets=bullets.filter(b=>!b.dead);

  // ── Boss update
  if (boss) {
    if (!boss.enraged&&boss.hp<boss.maxHp*0.5){boss.enraged=true;boss.spd=2.8;showNotif('BOSS ENRAGED!','#ff6600');}
    boss.atkCd=Math.max(0,boss.atkCd-dt);
    if (boss.atkCd===0){boss.atkCd=boss.enraged?1.5:2.5;doBossAttack(boss);}

    const bspd=boss.charging?8.0:boss.spd;
    const bdx=player.x-boss.x, bdy=player.y-boss.y, bdist=Math.hypot(bdx,bdy)||1;
    const bdir=boss.charging?boss.chargeDir:{x:bdx/bdist,y:bdy/bdist};
    let bx2=boss.x+bdir.x*bspd, by2=boss.y+bdir.y*bspd;
    for (const r of WALLS){let p=pushOut(bx2,boss.y,boss.r,r);bx2=p.x;}
    for (const r of WALLS){let p=pushOut(bx2,by2,boss.r,r);by2=p.y;}
    boss.x=bx2;boss.y=by2;boss.angle=Math.atan2(bdy,bdx);
    if (boss.charging){boss.chargeDur-=dt;if(boss.chargeDur<=0)boss.charging=false;}

    if (player.iframes<=0&&Math.hypot(player.x-boss.x,player.y-boss.y)<PR+boss.r){
      player.hp-=boss.dmg*dt*2.5;player.iframes=0.55;
    }
    if (boss.hp<=0){
      gainXP(boss.xp);kills++;
      for (let i=0;i<BUFF_DEFS.length;i++){
        const a=(i/BUFF_DEFS.length)*Math.PI*2;
        buffItems.push({x:boss.x+Math.cos(a)*60,y:boss.y+Math.sin(a)*60,def:BUFF_DEFS[i],life:25,pulse:0});
      }
      createExplosion(boss.x,boss.y,90,'#ff0033');
      showNotif('BOSS DEFEATED! BUFFS DROPPED!','#ffdd44');
      waveTimer=WAVE_DELAY;boss=null;
    }
  }

  // ── Move enemies
  for (const e of enemies) {
    const edx=player.x-e.x, edy=player.y-e.y, ed=Math.hypot(edx,edy)||1;
    let ex=e.x+(edx/ed)*e.spd, ey=e.y+(edy/ed)*e.spd;
    for (const r of SOLID){let p=pushOut(ex,e.y,e.r,r);ex=p.x;}
    for (const r of SOLID){let p=pushOut(ex,ey,e.r,r);ey=p.y;}
    for (const o of enemies){
      if(o===e)continue;
      const ox=ex-o.x,oy=ey-o.y,od=Math.hypot(ox,oy)||1,ov=e.r+o.r-od;
      if(ov>0){ex+=ox/od*ov*0.5;ey+=oy/od*ov*0.5;}
    }
    e.x=ex;e.y=ey;e.angle=Math.atan2(edy,edx);
    if(player.iframes<=0&&Math.hypot(player.x-e.x,player.y-e.y)<PR+e.r){
      player.hp-=e.dmg*dt*2.5;player.iframes=0.55;
    }
  }
  player.iframes=Math.max(0,player.iframes-dt);
  enemies=enemies.filter(e=>{if(e.hp<=0){gainXP(e.xp);kills++;return false;}return true;});

  // ── Enemy bullets
  for (const b of enemyBullets) {
    b.x+=b.vx;b.y+=b.vy;b.life-=dt;
    if(b.life<=0||b.x<WALL||b.x>W-WALL||b.y<WALL||b.y>H-WALL){b.dead=true;continue;}
    if(player.iframes<=0&&Math.hypot(b.x-player.x,b.y-player.y)<PR+b.r){
      player.hp-=b.dmg;player.iframes=0.4;b.dead=true;
    }
  }
  enemyBullets=enemyBullets.filter(b=>!b.dead);

  // ── Buff spawning + pickup
  buffSpawnTimer-=dt;
  if (buffSpawnTimer<=0&&buffItems.length<3){
    buffSpawnTimer=22+Math.random()*14;
    const margin=WALL+80;
    const def=BUFF_DEFS[Math.floor(Math.random()*BUFF_DEFS.length)];
    buffItems.push({x:margin+Math.random()*(W-margin*2),y:margin+Math.random()*(H-margin*2),def,life:12,pulse:0});
  }
  buffItems=buffItems.filter(item=>{
    item.life-=dt;item.pulse+=dt*3;
    if(Math.hypot(player.x-item.x,player.y-item.y)<PR+16){
      player.buffs[item.def.id]=item.def.dur;
      showNotif(`${item.def.name}!`,item.def.clr);
      createExplosion(item.x,item.y,26,item.def.clr);
      return false;
    }
    return item.life>0;
  });

  // ── Explosions
  explosions=explosions.filter(ex=>{ex.life-=dt;ex.r=ex.maxR*(1-ex.life/ex.maxLife);return ex.life>0;});

  // ── Wave timer (no boss)
  if (!boss){
    if (enemies.length===0&&waveTimer>5) waveTimer=5;
    waveTimer-=dt;
    if (waveTimer<=0) spawnWave();
  }

  if (player.hp<=0){player.hp=0;state='dead';musicPause();music.currentTime=0;submitMyScore();}

  const now=performance.now();
  if(now-lastBroad>66){lastBroad=now;broadcastSelf();}
  for(const p of peers.values()){
    if(!p)continue;
    const k=Math.min(1,dt*12);
    p.renderX+=(p.x-p.renderX)*k;p.renderY+=(p.y-p.renderY)*k;
  }
}

// ── Draw helpers ──────────────────────────────────────────────────
function drawFloor() {
  for (let tx=WALL;tx<W-WALL;tx+=TILE)
    for (let ty=WALL;ty<H-WALL;ty+=TILE){
      ctx.fillStyle=(Math.floor((tx-WALL)/TILE)+Math.floor((ty-WALL)/TILE))%2===0?'#120826':'#160a2e';
      ctx.fillRect(tx,ty,Math.min(TILE,W-WALL-tx),Math.min(TILE,H-WALL-ty));
    }
  ctx.strokeStyle='rgba(80,20,140,0.2)';ctx.lineWidth=0.5;
  for (let tx=WALL;tx<=W-WALL;tx+=TILE){ctx.beginPath();ctx.moveTo(tx,WALL);ctx.lineTo(tx,H-WALL);ctx.stroke();}
  for (let ty=WALL;ty<=H-WALL;ty+=TILE){ctx.beginPath();ctx.moveTo(WALL,ty);ctx.lineTo(W-WALL,ty);ctx.stroke();}
}
function drawWalls() {
  ctx.shadowBlur=0;
  ctx.fillStyle='#1a0840';
  ctx.fillRect(0,0,W,WALL);ctx.fillRect(0,H-WALL,W,WALL);
  ctx.fillRect(0,0,WALL,H);ctx.fillRect(W-WALL,0,WALL,H);
  ctx.strokeStyle='#4a1080';ctx.lineWidth=2;ctx.strokeRect(WALL,WALL,W-WALL*2,H-WALL*2);
  ctx.strokeStyle='#5a1898';ctx.lineWidth=2;
  for (const[cx,cy,sx,sy] of [[WALL,WALL,1,1],[W-WALL,WALL,-1,1],[WALL,H-WALL,1,-1],[W-WALL,H-WALL,-1,-1]]){
    const B=18;ctx.beginPath();ctx.moveTo(cx+sx*B,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+sy*B);ctx.stroke();
  }
}
function drawFurniture() {
  // No shadowBlur on static geometry — just flat fills + strokes
  for (const f of FURNITURE) {
    if (f.type==='pillar'){
      ctx.fillStyle='#2a0a50'; ctx.fillRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle='#7020c0'; ctx.lineWidth=1.5; ctx.strokeRect(f.x,f.y,f.w,f.h);
    } else if (f.type==='table'){
      ctx.fillStyle='#1e0840'; ctx.fillRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle='#4a1a80'; ctx.lineWidth=1.5; ctx.strokeRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle='rgba(90,40,140,0.3)'; ctx.lineWidth=1;
      for(let lx=f.x+12;lx<f.x+f.w-4;lx+=14){ctx.beginPath();ctx.moveTo(lx,f.y+6);ctx.lineTo(lx,f.y+f.h-6);ctx.stroke();}
    } else {
      ctx.fillStyle='#180636'; ctx.fillRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle='#3a1070'; ctx.lineWidth=1.5; ctx.strokeRect(f.x,f.y,f.w,f.h);
    }
  }
}
function drawPortal(p) {
  if (p.x<0) return;
  ctx.save();
  ctx.shadowColor=p.color;ctx.shadowBlur=20+Math.sin(p.pulse)*7;
  ctx.strokeStyle=p.color;ctx.lineWidth=4;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.stroke();
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(t*1.4);ctx.globalAlpha=0.5;ctx.lineWidth=2;
  ctx.setLineDash([7,6]);ctx.beginPath();ctx.arc(0,0,p.r-12,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);ctx.restore();
  ctx.globalAlpha=0.06+Math.sin(p.pulse)*0.04;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
  ctx.restore();
  ctx.fillStyle='#fff';ctx.font='600 14px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.fillText(p.label,p.x,p.y-p.r-12);
}

// ── Walk-on pads ──────────────────────────────────────────────────
function drawWalkPads() {
  for (const pad of WALK_PADS) {
    const prog    = pad.timer / PAD_HOLD;
    const pulse   = Math.sin(t*3)*0.5+0.5;
    const hovered = prog > 0;
    const rx=pad.x-pad.w/2, ry=pad.y-pad.h/2;

    ctx.save();
    // Floor glow
    ctx.shadowColor=pad.clr; ctx.shadowBlur=hovered ? 30+pulse*20 : 14+pulse*8;
    ctx.globalAlpha=0.12+pulse*0.06+(hovered?0.12:0);
    ctx.fillStyle=pad.clr;
    ctx.beginPath();ctx.rect(rx,ry,pad.w,pad.h);ctx.fill();

    // Border
    ctx.globalAlpha=0.6+(hovered?0.3:0); ctx.shadowBlur=6;
    ctx.strokeStyle=pad.clr; ctx.lineWidth=2;
    ctx.beginPath();ctx.rect(rx,ry,pad.w,pad.h);ctx.stroke();

    // Progress fill
    if (prog>0) {
      ctx.globalAlpha=0.28;ctx.fillStyle=pad.clr;
      ctx.beginPath();ctx.rect(rx,ry,pad.w*prog,pad.h);ctx.fill();
    }

    // Label
    ctx.globalAlpha=1; ctx.shadowColor=pad.clr; ctx.shadowBlur=hovered?14:6;
    ctx.fillStyle=pad.clr; ctx.font='bold 28px ui-sans-serif,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(pad.label, pad.x, pad.y-10);

    // Sub label
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.font='13px ui-sans-serif,sans-serif';
    ctx.shadowBlur=0;
    ctx.fillText(hovered ? `${Math.ceil((PAD_HOLD-pad.timer)*10)/10}s…` : pad.sub, pad.x, pad.y+22);

    ctx.restore();
    ctx.textBaseline='alphabetic';
  }
}

// ── Neon bullet passes ────────────────────────────────────────────
function drawPlayerBullets() {
  if (!bullets.length) return;
  ctx.save();
  // Flat-colour cores grouped by weapon colour — no shadowBlur for perf
  const byClr=new Map();
  for(const b of bullets){if(!byClr.has(b.clr))byClr.set(b.clr,[]);byClr.get(b.clr).push(b);}
  for(const[clr,bs] of byClr){
    // Outer teal halo (single set-state before the group)
    ctx.globalAlpha=0.55; ctx.fillStyle='#00ddff';
    for(const b of bs){ctx.beginPath();ctx.arc(b.x,b.y,b.r+3,0,Math.PI*2);ctx.fill();}
    // Weapon-colour core
    ctx.globalAlpha=1; ctx.fillStyle=clr;
    for(const b of bs){ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}
  }
  ctx.restore();
}
function drawEnemyBullets() {
  if (!enemyBullets.length) return;
  ctx.save();
  // Red outer ring
  ctx.globalAlpha=0.45; ctx.fillStyle='#ff0022';
  for(const b of enemyBullets){ctx.beginPath();ctx.arc(b.x,b.y,b.r+4,0,Math.PI*2);ctx.fill();}
  // Red core
  ctx.globalAlpha=1; ctx.fillStyle='#ff3355';
  for(const b of enemyBullets){ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}
  ctx.restore();
}
function drawEnemies() {
  if (!enemies.length) return;
  // No per-entity shadowBlur — batch by colour for performance
  // Dark outer ring pass
  ctx.save();
  ctx.globalAlpha=0.35; ctx.fillStyle='#550000';
  for(const e of enemies){ctx.beginPath();ctx.arc(e.x,e.y,e.r+4,0,Math.PI*2);ctx.fill();}
  ctx.restore();
  // Coloured core + dot + HP bar
  for(const e of enemies){
    ctx.fillStyle=e.clr; ctx.globalAlpha=1;
    ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.fill();
    const dotX=e.x+Math.cos(e.angle)*(e.r-4),dotY=e.y+Math.sin(e.angle)*(e.r-4);
    ctx.fillStyle='rgba(255,255,255,0.6)';
    ctx.beginPath();ctx.arc(dotX,dotY,2.5,0,Math.PI*2);ctx.fill();
    const bw=e.r*2.2;
    ctx.fillStyle='#440000';ctx.fillRect(e.x-bw/2,e.y-e.r-10,bw,4);
    ctx.fillStyle='#ff4455';ctx.fillRect(e.x-bw/2,e.y-e.r-10,bw*(e.hp/e.maxHp),4);
  }
}
function drawBoss(b) {
  if (!b) return;
  const enr=b.enraged, pulse=Math.sin(t*(enr?6:3))*0.5+0.5;
  ctx.save();
  ctx.globalAlpha=0.10+pulse*0.06;ctx.shadowColor='#ff0000';ctx.shadowBlur=20;ctx.fillStyle='#ff0022';
  ctx.beginPath();ctx.arc(b.x,b.y,b.r+30+pulse*12,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=0.35;ctx.shadowBlur=12;
  ctx.beginPath();ctx.arc(b.x,b.y,b.r+12,0,Math.PI*2);ctx.fill();
  ctx.save();ctx.translate(b.x,b.y);
  ctx.strokeStyle=enr?'#ff6600':'#ff0033';ctx.lineWidth=2.5;ctx.shadowColor=enr?'#ff6600':'#ff0033';ctx.shadowBlur=12;ctx.globalAlpha=0.85;
  ctx.rotate(t*(enr?4:1.8));ctx.setLineDash([12,9]);ctx.beginPath();ctx.arc(0,0,b.r+16,0,Math.PI*2);ctx.stroke();
  ctx.rotate(-(t*(enr?8:3.5)));ctx.globalAlpha=0.5;ctx.lineWidth=1.5;ctx.setLineDash([7,11]);
  ctx.beginPath();ctx.arc(0,0,b.r+26,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([]);ctx.restore();
  ctx.globalAlpha=1;ctx.shadowColor=enr?'#ff6600':'#ff0033';ctx.shadowBlur=22;
  ctx.fillStyle=b.charging?'#ff8800':(enr?'#dd2200':'#aa0022');
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
  const eyeR=b.r*0.35,ea=b.angle;
  for(const side of[-0.42,0.42]){
    const ex=b.x+Math.cos(ea+side)*eyeR,ey=b.y+Math.sin(ea+side)*eyeR;
    ctx.fillStyle=enr?'#ff8800':'#ffffff';ctx.shadowColor='#ffffff';ctx.shadowBlur=8;ctx.globalAlpha=0.92;
    ctx.beginPath();ctx.arc(ex,ey,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.shadowBlur=0;ctx.globalAlpha=1;
    ctx.beginPath();ctx.arc(ex+Math.cos(ea)*2,ey+Math.sin(ea)*2,2.5,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
  const bw=b.r*3.5,bh=10,bx2=b.x-bw/2,by2=b.y-b.r-28;
  ctx.fillStyle='#330000';ctx.fillRect(bx2,by2,bw,bh);
  ctx.fillStyle=b.hp/b.maxHp>0.5?'#ff2244':'#ff6600';ctx.fillRect(bx2,by2,bw*(b.hp/b.maxHp),bh);
  ctx.strokeStyle='#ff4455';ctx.lineWidth=1.5;ctx.strokeRect(bx2,by2,bw,bh);
  ctx.fillStyle=enr?'#ff8800':'#ff4455';ctx.font='bold 13px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.shadowColor=enr?'#ff8800':'#ff4455';ctx.shadowBlur=10;
  ctx.fillText(enr?'BOSS ★ ENRAGED':'BOSS',b.x,by2-6);ctx.shadowBlur=0;
}
function drawBuffItems() {
  for(const item of buffItems){
    const pulse=Math.sin(item.pulse)*0.5+0.5, fade=Math.min(1,item.life/2);
    ctx.save();ctx.globalAlpha=fade;ctx.shadowColor=item.def.clr;ctx.shadowBlur=14+pulse*10;ctx.fillStyle=item.def.clr;
    ctx.beginPath();ctx.arc(item.x,item.y,14+pulse*3,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.85)';ctx.shadowBlur=0;ctx.beginPath();ctx.arc(item.x,item.y,11,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=item.def.clr;ctx.font='bold 8px ui-sans-serif,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(item.def.name.slice(0,3),item.x,item.y);
    ctx.textBaseline='alphabetic';ctx.font='10px ui-sans-serif,sans-serif';ctx.shadowColor=item.def.clr;ctx.shadowBlur=6;
    ctx.fillText(item.def.name,item.x,item.y+24);ctx.restore();
  }
}
function drawExplosions() {
  ctx.save();
  for(const ex of explosions){
    const alpha=ex.life/ex.maxLife;
    ctx.globalAlpha=alpha*0.7;ctx.shadowColor=ex.clr;ctx.shadowBlur=16;ctx.strokeStyle=ex.clr;ctx.lineWidth=3;
    ctx.beginPath();ctx.arc(ex.x,ex.y,ex.r,0,Math.PI*2);ctx.stroke();
    ctx.globalAlpha=alpha*0.25;ctx.lineWidth=8;ctx.beginPath();ctx.arc(ex.x,ex.y,ex.r*0.55,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
function drawPlayerAvatar(x,y,angle,color,alpha=1) {
  ctx.save();
  ctx.globalAlpha=alpha*0.22;ctx.shadowColor='#00ffaa';ctx.shadowBlur=22;ctx.fillStyle='#00ffaa';
  ctx.beginPath();ctx.arc(x,y,PR+6,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=alpha;ctx.shadowColor=color;ctx.shadowBlur=12;ctx.fillStyle=color;
  ctx.beginPath();ctx.arc(x,y,PR,0,Math.PI*2);ctx.fill();
  const dotX=x+Math.sin(angle)*(PR-4),dotY=y-Math.cos(angle)*(PR-4);
  ctx.fillStyle='rgba(255,255,255,0.88)';ctx.shadowColor='#fff';ctx.shadowBlur=6;ctx.globalAlpha=alpha*0.85;
  ctx.beginPath();ctx.arc(dotX,dotY,3.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
}
function drawPeer(p) {
  const alive=p.alive!==false, alpha=alive?0.85:0.2;
  ctx.save();
  ctx.globalAlpha=alpha*0.2;ctx.shadowColor='#00ccff';ctx.shadowBlur=20;ctx.fillStyle='#00ccff';
  ctx.beginPath();ctx.arc(p.renderX,p.renderY,PR+6,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=alpha;ctx.shadowColor=p.color||'#888';ctx.shadowBlur=12;ctx.fillStyle=p.color||'#888';
  ctx.beginPath();ctx.arc(p.renderX,p.renderY,PR,0,Math.PI*2);ctx.fill();
  const dotX=p.renderX+Math.sin(p.angle||0)*(PR-4),dotY=p.renderY-Math.cos(p.angle||0)*(PR-4);
  ctx.fillStyle='rgba(255,255,255,0.85)';ctx.shadowColor='#fff';ctx.shadowBlur=5;ctx.globalAlpha=alpha*0.8;
  ctx.beginPath();ctx.arc(dotX,dotY,3.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
  if(p.username){ctx.fillStyle='#00ffcc';ctx.font='11px ui-sans-serif,sans-serif';ctx.textAlign='center';ctx.globalAlpha=alpha;ctx.fillText(p.username,p.renderX,p.renderY-PR-18);}
  if(p.maxHp&&alive){
    const bw=30,bx2=p.renderX-bw/2,by2=p.renderY-PR-14;
    ctx.globalAlpha=alpha*0.7;ctx.fillStyle='#112200';ctx.fillRect(bx2,by2,bw,4);
    ctx.fillStyle='#44ff88';ctx.fillRect(bx2,by2,bw*(p.hp/p.maxHp),4);
  }
  ctx.globalAlpha=1;
}

// ── Wave countdown ────────────────────────────────────────────────
function drawWaveCountdown() {
  if (boss||waveTimer>WAVE_DELAY||waveTimer<=0) return;
  const sec = Math.ceil(waveTimer);
  const progress = waveTimer / WAVE_DELAY;
  const cx=W/2, cy=WALL+40, r=22;
  ctx.save();
  ctx.strokeStyle='rgba(255,200,0,0.2)';ctx.lineWidth=4;ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle='#ffdd44';ctx.shadowColor='#ffdd44';ctx.shadowBlur=10;ctx.lineWidth=4;
  ctx.beginPath();ctx.arc(cx,cy,r,-Math.PI/2,-Math.PI/2+(1-progress)*Math.PI*2,false);ctx.stroke();
  ctx.restore();
  ctx.fillStyle='#ffdd44';ctx.font='bold 14px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.fillText(enemies.length===0&&sec<=5?`Next wave: ${sec}s`:`Wave ${wave}`,cx,cy+5);
}

// ── HUD ───────────────────────────────────────────────────────────
function drawHUD() {
  const w=getWeapon(player.level);
  const bx=WALL+12,by=H-WALL-58,bw=230,bh=14;

  ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(bx,by,bw,bh);
  ctx.fillStyle=player.iframes>0?'#ff8899':'#ff4455';ctx.fillRect(bx,by,bw*(player.hp/player.maxHp),bh);
  ctx.strokeStyle='#ff8899';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,bh);
  ctx.fillStyle='#fff';ctx.font='11px ui-sans-serif,sans-serif';ctx.textAlign='left';
  ctx.fillText(`HP  ${Math.ceil(player.hp)} / ${player.maxHp}`,bx+4,by+11);

  const xby=by+bh+4;
  ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(bx,xby,bw,bh);
  ctx.fillStyle='#aa44ff';ctx.fillRect(bx,xby,bw*(player.xp/xpToNext(player.level)),bh);
  ctx.strokeStyle='#cc88ff';ctx.lineWidth=1;ctx.strokeRect(bx,xby,bw,bh);
  ctx.fillStyle='#fff';ctx.fillText(`LV ${player.level}  XP ${player.xp}/${xpToNext(player.level)}`,bx+4,xby+11);

  const wby=xby+bh+7;
  ctx.fillStyle=w.clr;ctx.shadowColor=w.clr;ctx.shadowBlur=6;ctx.font='bold 13px ui-sans-serif,sans-serif';
  ctx.fillText(`⚔ ${w.name}`,bx,wby+12);ctx.shadowBlur=0;
  const next=WEAPONS.find(wp=>wp.lv>player.level);
  if(next){ctx.fillStyle='rgba(255,255,255,0.4)';ctx.font='11px ui-sans-serif,sans-serif';ctx.fillText(`Next: ${next.name} @ Lv${next.lv}`,bx,wby+26);}

  let buffDrawX=bx;const buffDrawY=wby+46;
  for(const[id,timer] of Object.entries(player.buffs)){
    if(timer<=0)continue;
    const def=BUFF_DEFS.find(d=>d.id===id);if(!def)continue;
    ctx.save();ctx.shadowColor=def.clr;ctx.shadowBlur=8;ctx.globalAlpha=0.85;
    ctx.fillStyle=def.clr;ctx.beginPath();ctx.arc(buffDrawX+8,buffDrawY,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.shadowBlur=0;ctx.globalAlpha=1;
    ctx.font='bold 7px ui-sans-serif,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(id[0].toUpperCase(),buffDrawX+8,buffDrawY);ctx.textBaseline='alphabetic';
    ctx.fillStyle=def.clr;ctx.globalAlpha=0.55;ctx.fillRect(buffDrawX+20,buffDrawY-4,40*(timer/def.dur),8);
    ctx.strokeStyle=def.clr;ctx.lineWidth=1;ctx.globalAlpha=0.35;ctx.strokeRect(buffDrawX+20,buffDrawY-4,40,8);
    ctx.fillStyle=def.clr;ctx.font='9px ui-sans-serif,sans-serif';ctx.textAlign='left';ctx.globalAlpha=1;
    ctx.fillText(`${def.name} ${Math.ceil(timer)}s`,buffDrawX+64,buffDrawY+3);ctx.restore();
    buffDrawX+=138;
  }

  ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='bold 14px ui-sans-serif,sans-serif';ctx.textAlign='right';
  ctx.fillText(boss?`BOSS ${Math.ceil(boss.hp*100/boss.maxHp)}%`:`Wave ${wave}`,W-WALL-12,WALL+22);
  ctx.fillText(`Kills ${kills}`,W-WALL-12,WALL+40);
  if(!boss)ctx.fillText(`${enemies.length} left`,W-WALL-12,WALL+58);
  const pCount=peers.size+1;
  if(pCount>1){ctx.fillStyle='#00ffcc';ctx.fillText(`${pCount}/${MAX_PLAYERS} co-op`,W-WALL-12,WALL+76);}

  drawWaveCountdown();

  ctx.save();ctx.strokeStyle='rgba(0,220,255,0.65)';ctx.lineWidth=1.5;const cs=10;
  ctx.beginPath();ctx.moveTo(mouseX-cs,mouseY);ctx.lineTo(mouseX+cs,mouseY);ctx.stroke();
  ctx.beginPath();ctx.moveTo(mouseX,mouseY-cs);ctx.lineTo(mouseX,mouseY+cs);ctx.stroke();
  ctx.beginPath();ctx.arc(mouseX,mouseY,3.5,0,Math.PI*2);ctx.stroke();ctx.restore();

  if(notifT>0){
    ctx.save();ctx.globalAlpha=Math.min(1,notifT);ctx.fillStyle=notifClr;ctx.shadowColor=notifClr;ctx.shadowBlur=18;
    ctx.font='bold 26px ui-sans-serif,sans-serif';ctx.textAlign='center';
    ctx.fillText(notif,W/2,WALL+52);ctx.restore();
  }
}

// ── Screens ───────────────────────────────────────────────────────
function drawButton(label,cx,cy,glowColor) {
  ctx.save();ctx.shadowColor=glowColor;ctx.shadowBlur=20;
  ctx.fillStyle='rgba(10,5,20,0.92)';ctx.strokeStyle=glowColor;ctx.lineWidth=2;
  ctx.beginPath();ctx.rect(cx-BTN_W/2,cy-BTN_H/2,BTN_W,BTN_H);ctx.fill();ctx.stroke();
  ctx.fillStyle=glowColor;ctx.font='bold 18px ui-sans-serif,sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,cx,cy);
  ctx.restore();ctx.textBaseline='alphabetic';
}

function drawMenuOverlay() {
  // Translucent header overlay — arena/world is visible behind it
  ctx.save();
  ctx.fillStyle='rgba(8,3,18,0.65)';ctx.fillRect(WALL,WALL,W-WALL*2,H*0.48);
  ctx.shadowColor='#c64bff';ctx.shadowBlur=36;ctx.fillStyle='#f4f4ff';
  ctx.font='bold 96px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.fillText('ARENA',W/2,H*0.18);
  ctx.fillStyle='#c64bff';ctx.font='20px ui-sans-serif,sans-serif';ctx.shadowBlur=0;
  ctx.fillText('Co-op arena shooter  ·  survive the waves  ·  level up',W/2,H*0.25);
  ctx.fillStyle='rgba(255,255,255,0.45)';ctx.font='14px ui-sans-serif,sans-serif';
  ctx.fillText('WASD to move  ·  Mouse to aim  ·  Click to shoot  ·  Up to 6 co-op',W/2,H*0.29);
  // Weapon tier row
  const startX=W/2-(WEAPONS.length*130)/2+65;
  for(let i=0;i<WEAPONS.length;i++){
    const ww=WEAPONS[i];
    ctx.fillStyle=ww.clr;ctx.shadowColor=ww.clr;ctx.shadowBlur=8;ctx.font='bold 12px ui-sans-serif,sans-serif';ctx.textAlign='center';
    ctx.fillText(`Lv${ww.lv}`,startX+i*130,H*0.34);
    ctx.shadowBlur=0;ctx.fillStyle='rgba(255,255,255,0.65)';ctx.font='11px ui-sans-serif,sans-serif';
    ctx.fillText(ww.name,startX+i*130,H*0.34+15);
  }
  // Buff row
  const bStartX=W/2-(BUFF_DEFS.length*140)/2+70;
  for(let i=0;i<BUFF_DEFS.length;i++){
    const bd=BUFF_DEFS[i];
    ctx.fillStyle=bd.clr;ctx.shadowColor=bd.clr;ctx.shadowBlur=6;ctx.font='bold 11px ui-sans-serif,sans-serif';ctx.textAlign='center';
    ctx.fillText(`★ ${bd.name}`,bStartX+i*140,H*0.38);
  }
  ctx.restore();

  // Walk-on pads drawn on the floor (lower half of arena)
  drawWalkPads();

  // Portals active in lobby
  drawPortal(exitPortal);
  if(returnPortal) drawPortal(returnPortal);

  // Peers in lobby
  for(const p of peers.values()) if(p) drawPeer(p);

  // Player in lobby
  drawPlayerAvatar(player.x,player.y,player.angle,player.color,1);

  if(notifT>0){
    ctx.save();ctx.globalAlpha=Math.min(1,notifT);ctx.fillStyle=notifClr;ctx.shadowColor=notifClr;ctx.shadowBlur=18;
    ctx.font='bold 26px ui-sans-serif,sans-serif';ctx.textAlign='center';
    ctx.fillText(notif,W/2,WALL+52);ctx.restore();
  }
}

// ── Leaderboard panel ─────────────────────────────────────────────
function drawLeaderboard(cx, cy, title='LEADERBOARD') {
  const entries = mergedLeaderboard();
  const panelW  = 560, rowH = 36;
  const rows    = Math.min(entries.length, 12);
  const panelH  = 80 + rows * rowH + 20;
  const px = cx - panelW/2, py = cy - panelH/2;

  ctx.save();

  // Panel background
  ctx.fillStyle='rgba(6,2,16,0.94)';
  ctx.strokeStyle='#44ddff'; ctx.lineWidth=2;
  ctx.shadowBlur=0;
  ctx.beginPath(); ctx.rect(px, py, panelW, panelH);
  ctx.fill(); ctx.stroke();

  // Title
  ctx.fillStyle='#44ddff';
  ctx.font='bold 22px ui-sans-serif,sans-serif'; ctx.textAlign='center';
  ctx.fillText(title, cx, py+38);

  // Column headers
  ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='11px ui-sans-serif,sans-serif';
  const col = { rank: px+24, name: px+70, score: px+310, wave: px+390, kills: px+455, lv: px+520 };
  const hy  = py+62;
  ctx.textAlign='left';
  ctx.fillText('#',     col.rank,  hy);
  ctx.fillText('NAME',  col.name,  hy);
  ctx.fillText('SCORE', col.score, hy);
  ctx.fillText('WAVE',  col.wave,  hy);
  ctx.fillText('KILLS', col.kills, hy);
  ctx.fillText('LV',    col.lv,    hy);

  // Divider
  ctx.strokeStyle='rgba(68,221,255,0.25)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(px+16, hy+6); ctx.lineTo(px+panelW-16, hy+6); ctx.stroke();

  if (entries.length === 0) {
    ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='14px ui-sans-serif,sans-serif';
    ctx.textAlign='center';
    ctx.fillText('No scores yet — play a run!', cx, py + panelH/2 + 20);
    ctx.restore(); return;
  }

  for (let i=0; i<rows; i++) {
    const e   = entries[i];
    const ry  = hy + 14 + i*rowH;
    const isMe = e.username?.toLowerCase() === incoming.username?.toLowerCase();

    // Row highlight for top 3 or own score
    if (i === 0)   { ctx.fillStyle='rgba(255,215,0,0.08)'; ctx.fillRect(px+8, ry-14, panelW-16, rowH-2); }
    else if (i===1){ ctx.fillStyle='rgba(192,192,192,0.06)'; ctx.fillRect(px+8, ry-14, panelW-16, rowH-2); }
    else if (i===2){ ctx.fillStyle='rgba(205,127,50,0.06)';  ctx.fillRect(px+8, ry-14, panelW-16, rowH-2); }
    if (isMe)      { ctx.fillStyle='rgba(68,255,136,0.08)'; ctx.fillRect(px+8, ry-14, panelW-16, rowH-2); }

    // Rank medal / number
    const medals = ['🥇','🥈','🥉'];
    ctx.font = i<3 ? '16px serif' : '13px ui-sans-serif,sans-serif';
    ctx.textAlign='left';
    ctx.fillStyle = i<3 ? '#fff' : 'rgba(255,255,255,0.55)';
    ctx.fillText(i<3 ? medals[i] : `${i+1}`, col.rank, ry);

    // Name (cyan if it's the current player)
    ctx.font = 'bold 13px ui-sans-serif,sans-serif';
    ctx.fillStyle = isMe ? '#44ff88' : (e.color || '#eee');
    ctx.fillText((e.username || 'unknown').slice(0,18), col.name, ry);

    // Score highlighted
    ctx.fillStyle = i===0 ? '#ffd700' : 'rgba(255,255,255,0.85)';
    ctx.fillText(e.score.toLocaleString(), col.score, ry);

    // Wave, kills, level
    ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='12px ui-sans-serif,sans-serif';
    ctx.fillText(e.wave  ?? '-', col.wave,  ry);
    ctx.fillText(e.kills ?? '-', col.kills, ry);
    ctx.fillText(e.level ?? '-', col.lv,    ry);
  }

  // Footnote
  ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='10px ui-sans-serif,sans-serif';
  ctx.textAlign='center';
  ctx.fillText('Score = wave×500 + kills×50 + level×100  ·  includes live players in this room', cx, py+panelH-8);

  ctx.restore();
}

function drawPauseScreen() {
  // Dim the frozen game world behind the overlay
  ctx.fillStyle='rgba(8,3,18,0.72)'; ctx.fillRect(0,0,W,H);

  // Title
  ctx.save();
  ctx.shadowColor='#c64bff'; ctx.shadowBlur=28;
  ctx.fillStyle='#f4f4ff'; ctx.font='bold 72px ui-sans-serif,sans-serif';
  ctx.textAlign='center'; ctx.fillText('PAUSED', W/2, H/2-90);
  ctx.restore();

  // Stats line
  ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.font='18px ui-sans-serif,sans-serif';
  ctx.textAlign='center';
  ctx.fillText(`Wave ${wave}  ·  Level ${player.level}  ·  ${kills} kills`, W/2, H/2-36);

  // Buttons (left of centre)
  drawButton('RESUME',   W/2-200, H/2+10, '#44ff88');
  drawButton('END GAME', W/2-200, H/2+78, '#ff4455');

  // Hint
  ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='13px ui-sans-serif,sans-serif';
  ctx.textAlign='center';
  ctx.fillText('Press Esc to resume', W/2-200, H/2+126);

  // Leaderboard (right of centre)
  drawLeaderboard(W/2+260, H/2, 'LEADERBOARD');
}

function drawDeadScreen() {
  ctx.fillStyle='rgba(8,3,18,0.88)';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.shadowColor='#ff4455';ctx.shadowBlur=30;
  ctx.fillStyle='#ff4455';ctx.font='bold 72px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.fillText('GAME OVER',W/2,H/2-70);ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.75)';ctx.font='20px ui-sans-serif,sans-serif';ctx.textAlign='center';
  const sc = calcScore(wave, kills, player.level);
  ctx.fillStyle='rgba(255,255,255,0.75)';ctx.font='20px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.fillText(`Level ${player.level}  ·  ${kills} kills  ·  Wave ${wave}  ·  Score ${sc.toLocaleString()}`,W/2,H/2-18);
  drawButton('PLAY AGAIN',W/2-200, H/2+50,  '#44ff88');
  drawButton('MAIN MENU', W/2-200, H/2+116, '#aaaaaa');
  drawLeaderboard(W/2+260, H/2+30, 'LEADERBOARD');
}

// ── Render ────────────────────────────────────────────────────────
function render() {
  // Keep cursor in sync with state every frame (most reliable approach)
  updateCursor();
  // Reset critical state at the top of every frame
  ctx.globalAlpha=1; ctx.shadowBlur=0; ctx.setLineDash([]);
  ctx.fillStyle='#0a0514';ctx.fillRect(0,0,W,H);
  drawFloor();drawWalls();drawFurniture();

  if (state==='playing') {
    drawPortal(exitPortal);  // off-map, so drawPortal guard skips them
    if(returnPortal) drawPortal(returnPortal);
    drawBuffItems();
    drawExplosions();
    drawPlayerBullets();
    drawEnemyBullets();
    drawEnemies();
    drawBoss(boss);
    for(const p of peers.values()) if(p) drawPeer(p);
    if(player.iframes<=0||Math.floor(t*10)%2===0)
      drawPlayerAvatar(player.x,player.y,player.angle,player.color,1);
    drawHUD();
  } else if (state==='menu') {
    drawMenuOverlay();
    if (showScores) drawLeaderboard(W/2, H*0.5, 'LEADERBOARD');
  } else if (state==='paused') {
    drawPauseScreen();
  } else if (state==='dead') {
    drawDeadScreen();
  }
}

// ── Loop ──────────────────────────────────────────────────────────
let last=performance.now();
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  try {
    update(dt);
    render();
  } catch(e) {
    // Show the real error on canvas instead of silently dying
    ctx.fillStyle='#0a0514'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#ff4455'; ctx.font='bold 28px ui-sans-serif,sans-serif';
    ctx.textAlign='center';
    ctx.fillText('ERROR — check console', W/2, H/2-20);
    ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font='16px monospace';
    ctx.fillText(String(e), W/2, H/2+16);
    console.error('[arena] loop error:', e);
    return; // stop loop so the message stays visible
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
