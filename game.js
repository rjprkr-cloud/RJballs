// Spherocide — top-down shooter — 1920×1080, walk-on menu pads, 30s wave timer
// Portal Protocol + Trystero co-op multiplayer

const canvas = document.getElementById('game');
const ctx    = canvas.getContext('2d');
const W = canvas.width;    // 1920
const H = canvas.height;   // 1080
canvas.style.cursor = 'default';
function updateCursor() {
  canvas.style.cursor = (state === 'playing') ? 'none' : 'default';
}

// ── Music playlist ────────────────────────────────────────────────
let musicVolume = 0.30;

const TRACKS = [
  'music.mp3',
  'track-tokyo.mp3',
  'track-midtown.mp3',
  'track-worlds.mp3',
];

// Shuffle a copy so the order is random each session, no immediate repeats
function _shuffleTracks() {
  const arr = [...TRACKS];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

let _playlist  = _shuffleTracks();
let _trackIdx  = 0;
const music    = new Audio(_playlist[_trackIdx]);
music.volume   = musicVolume;

// When a track ends, advance to the next (re-shuffle when the list wraps)
music.addEventListener('ended', () => {
  _trackIdx++;
  if (_trackIdx >= _playlist.length) {
    _playlist = _shuffleTracks();
    _trackIdx = 0;
  }
  music.src = _playlist[_trackIdx];
  music.volume = musicVolume;
  music.play().catch(() => {});
});

// ── Game-over sting ───────────────────────────────────────────────
const gameOverSfx = new Audio('game-over.mp3');
gameOverSfx.volume = 0.85;
function playGameOver() {
  gameOverSfx.currentTime = 0;
  gameOverSfx.play().catch(() => {});
}

// musicPlay() is called from the RAF loop (not a direct user gesture).
// If the browser blocks autoplay, we set up one-shot retry listeners so
// music starts the moment the player next touches a key or clicks.
function musicPlay() {
  if (!music.paused) return;
  music.play().catch(() => {
    const tryAgain = () => { if (!music.paused) return; music.play().catch(()=>{}); };
    addEventListener('mousedown', tryAgain, { once: true });
    addEventListener('keydown',   tryAgain, { once: true });
  });
}
function musicPause() { if (!music.paused) music.pause(); }

// ── 16-bit weapon sound effects (Web Audio synthesis) ─────────────
let _sfxCtx = null;
function _sfx() {
  if (!_sfxCtx) _sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (_sfxCtx.state === 'suspended') _sfxCtx.resume();
  return _sfxCtx;
}
// SFX volume is independently controlled via settings
function _sfxVol() { return Math.max(0.01, sfxVolume); }

// Shared helper: create a noise buffer source
function _noise(ac, dur) {
  const n = Math.ceil(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, n, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buf;
  return src;
}

function playWeaponSound(name) {
  try {
    const ac = _sfx(), now = ac.currentTime, v = _sfxVol();

    if (name === 'Pistol') {
      // Crisp square-wave pop: quick pitch drop
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(560, now);
      osc.frequency.exponentialRampToValueAtTime(160, now + 0.09);
      g.gain.setValueAtTime(v * 0.45, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
      osc.connect(g); g.connect(ac.destination);
      osc.start(now); osc.stop(now + 0.09);

    } else if (name === 'Dual Pistols') {
      // Two staggered pops, second slightly higher pitch
      for (let i = 0; i < 2; i++) {
        const t = now + i * 0.055;
        const osc = ac.createOscillator(), g = ac.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(620 - i * 80, t);
        osc.frequency.exponentialRampToValueAtTime(180, t + 0.08);
        g.gain.setValueAtTime(v * 0.38, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
        osc.connect(g); g.connect(ac.destination);
        osc.start(t); osc.stop(t + 0.08);
      }

    } else if (name === 'Shotgun') {
      // Wide bandpass noise burst + low square thump
      const ns = _noise(ac, 0.18), filt = ac.createBiquadFilter(), ng = ac.createGain();
      filt.type = 'bandpass'; filt.frequency.value = 320; filt.Q.value = 0.4;
      ng.gain.setValueAtTime(v * 0.65, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
      ns.connect(filt); filt.connect(ng); ng.connect(ac.destination);
      ns.start(now); ns.stop(now + 0.18);
      // Low punch
      const osc = ac.createOscillator(), og = ac.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(130, now);
      osc.frequency.exponentialRampToValueAtTime(38, now + 0.14);
      og.gain.setValueAtTime(v * 0.7, now);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.connect(og); og.connect(ac.destination);
      osc.start(now); osc.stop(now + 0.14);

    } else if (name === 'SMG') {
      // Very short rapid square tick
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(130, now + 0.042);
      g.gain.setValueAtTime(v * 0.32, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.042);
      osc.connect(g); g.connect(ac.destination);
      osc.start(now); osc.stop(now + 0.042);

    } else if (name === 'Mini Gun') {
      // Deep mechanical thud — low sawtooth blip, very short, dense
      const osc = ac.createOscillator(), g = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(280, now);
      osc.frequency.exponentialRampToValueAtTime(80, now + 0.032);
      g.gain.setValueAtTime(v * 0.42, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.032);
      osc.connect(g); g.connect(ac.destination);
      osc.start(now); osc.stop(now + 0.032);
      // Mechanical click layer
      const ns = _noise(ac, 0.022), ng = ac.createGain();
      ng.gain.setValueAtTime(v * 0.28, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.022);
      ns.connect(ng); ng.connect(ac.destination);
      ns.start(now); ns.stop(now + 0.022);

    } else if (name === 'Rocket') {
      // Sawtooth whoosh down + low-pass noise rumble
      const osc = ac.createOscillator(), og = ac.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.22);
      og.gain.setValueAtTime(v * 0.55, now);
      og.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      osc.connect(og); og.connect(ac.destination);
      osc.start(now); osc.stop(now + 0.22);
      // Rumble
      const ns = _noise(ac, 0.22), filt = ac.createBiquadFilter(), ng = ac.createGain();
      filt.type = 'lowpass'; filt.frequency.value = 160;
      ng.gain.setValueAtTime(v * 0.5, now);
      ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      ns.connect(filt); filt.connect(ng); ng.connect(ac.destination);
      ns.start(now); ns.stop(now + 0.22);

    } else if (name === 'Plasma') {
      // High sine sweep down + buzzy sawtooth overlay = sci-fi zap
      const o1 = ac.createOscillator(), g1 = ac.createGain();
      o1.type = 'sine';
      o1.frequency.setValueAtTime(1400, now);
      o1.frequency.exponentialRampToValueAtTime(180, now + 0.14);
      g1.gain.setValueAtTime(v * 0.38, now);
      g1.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      o1.connect(g1); g1.connect(ac.destination);
      o1.start(now); o1.stop(now + 0.14);
      const o2 = ac.createOscillator(), g2 = ac.createGain();
      o2.type = 'sawtooth';
      o2.frequency.setValueAtTime(1600, now);
      o2.frequency.exponentialRampToValueAtTime(320, now + 0.11);
      g2.gain.setValueAtTime(v * 0.22, now);
      g2.gain.exponentialRampToValueAtTime(0.0001, now + 0.11);
      o2.connect(g2); g2.connect(ac.destination);
      o2.start(now); o2.stop(now + 0.11);
    }
  } catch(_) {} // silently ignore if audio context unavailable
}

// Faint high tick when a bullet connects with an enemy
function playHitSound() {
  try {
    const ac = _sfx(), now = ac.currentTime, v = _sfxVol() * 0.18;
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1800, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.03);
    g.gain.setValueAtTime(v, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);
    osc.connect(g); g.connect(ac.destination);
    osc.start(now); osc.stop(now + 0.03);
  } catch(_) {}
}

// Satisfying crunch when an enemy dies
function playKillSound() {
  try {
    const ac = _sfx(), now = ac.currentTime, v = _sfxVol() * 0.55;
    // Punchy low thud
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.08);
    g.gain.setValueAtTime(v, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
    osc.connect(g); g.connect(ac.destination);
    osc.start(now); osc.stop(now + 0.08);
    // High crack layer
    const ns = _noise(ac, 0.05), ng = ac.createGain();
    ng.gain.setValueAtTime(v * 0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
    ns.connect(ng); ng.connect(ac.destination);
    ns.start(now); ns.stop(now + 0.05);
  } catch(_) {}
}

// ── Name entry ────────────────────────────────────────────────────
// Show the name screen, resolve with the chosen name, then hide it.
const _chosenName = await (function askName() {
  const screen = document.getElementById('name-screen');
  const input  = document.getElementById('name-input');
  const btn    = document.getElementById('name-btn');
  // Pre-fill with last used name if available
  const saved = localStorage.getItem('spherocide-username') || '';
  if (saved) input.value = saved;
  input.focus();
  input.select();
  return new Promise(resolve => {
    function submit() {
      const name = input.value.trim().slice(0, 20) || 'Player';
      localStorage.setItem('spherocide-username', name);
      screen.style.display = 'none';
      resolve(name);
    }
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  });
}());

// ── Portal protocol ───────────────────────────────────────────────
const incoming   = Portal.readPortalParams();
incoming.username = _chosenName;  // override portal guest ID with chosen name
document.getElementById('username').textContent = _chosenName;
// 3-second timeout so a slow/hanging registry fetch never blocks the game loop
const nextTarget = await Promise.race([
  Portal.pickPortalTarget(),
  new Promise(resolve => setTimeout(() => resolve(null), 3000)),
]);

// ── Constants ─────────────────────────────────────────────────────
const WALL = 36, TILE = 48, PR = 13;

// ── Zone themes (change every 5 waves) ───────────────────────────
const ZONES = [
  { name:'Deep Space', // waves 0-4
    floor1:'#120826', floor2:'#160a2e', grid:'rgba(80,20,140,0.2)',
    wall:'#1a0840',   wallBorder:'#4a1080', corner:'#5a1898',
    pillarFill:'#2a0a50', pillarStroke:'#7020c0',
    tableFill:'#1e0840',  tableStroke:'#4a1a80', tableDetail:'rgba(90,40,140,0.3)' },
  { name:'Toxic Zone', // waves 5-9
    floor1:'#071a0a', floor2:'#091f0c', grid:'rgba(30,120,40,0.2)',
    wall:'#061408',   wallBorder:'#1a6020', corner:'#22802a',
    pillarFill:'#0d2a10', pillarStroke:'#2a8030',
    tableFill:'#091a0b',  tableStroke:'#1a5a22', tableDetail:'rgba(40,120,50,0.3)' },
  { name:'Volcanic',   // waves 10-14
    floor1:'#1a0800', floor2:'#200a00', grid:'rgba(180,50,10,0.2)',
    wall:'#1a0500',   wallBorder:'#7a2000', corner:'#aa3000',
    pillarFill:'#2a0a00', pillarStroke:'#aa3500',
    tableFill:'#1a0600',  tableStroke:'#6a1a00', tableDetail:'rgba(150,50,10,0.3)' },
  { name:'Arctic',     // waves 15-19
    floor1:'#040e16', floor2:'#06121c', grid:'rgba(40,160,200,0.2)',
    wall:'#040c18',   wallBorder:'#1a6080', corner:'#2080aa',
    pillarFill:'#061422', pillarStroke:'#1a80aa',
    tableFill:'#05101e',  tableStroke:'#156880', tableDetail:'rgba(30,140,180,0.3)' },
  { name:'Ancient',    // waves 20-24
    floor1:'#16100a', floor2:'#1c1408', grid:'rgba(180,140,20,0.2)',
    wall:'#14100a',   wallBorder:'#7a6010', corner:'#aa8820',
    pillarFill:'#241a08', pillarStroke:'#aa8a10',
    tableFill:'#1c140a',  tableStroke:'#7a6018', tableDetail:'rgba(160,120,20,0.3)' },
  { name:'The Void',   // waves 25+
    floor1:'#060614', floor2:'#08081a', grid:'rgba(200,200,255,0.08)',
    wall:'#04040e',   wallBorder:'#303060', corner:'#5050aa',
    pillarFill:'#0c0c22', pillarStroke:'#6060cc',
    tableFill:'#080818',  tableStroke:'#404080', tableDetail:'rgba(100,100,200,0.3)' },
];
function getZone() { return ZONES[Math.min(Math.floor((wave||0)/5), ZONES.length-1)] || ZONES[0]; }
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
  { id:'start',    x:W/2-380, y:H*0.64, w:240, h:100, label:'START',    sub:'stand to begin',      clr:'#44ff88', timer:0 },
  { id:'settings', x:W/2,     y:H*0.64, w:240, h:100, label:'SETTINGS', sub:'stand to configure',  clr:'#c64bff', timer:0 },
  { id:'scores',   x:W/2+380, y:H*0.64, w:240, h:100, label:'SCORES',   sub:'stand to view',       clr:'#44ddff', timer:0 },
];
const PAD_HOLD = 1.0; // seconds to hold before activating

// ── Weapons ───────────────────────────────────────────────────────
const WEAPONS = [
  {name:'Pistol',  lv:1,  dmg:15, spd:540, cd:0.42,n:1,spr:0,    pierce:false,aoe:0,  clr:'#ffdd44',br:4},
  {name:'Dual Pistols', lv:5, dmg:15, spd:540, cd:0.28,n:2,spr:0.12,pierce:false,aoe:0,  clr:'#ffee88',br:4},
  {name:'Shotgun', lv:9,  dmg:12, spd:540, cd:0.70,n:5,spr:0.32, pierce:false,aoe:0,  clr:'#ff8833',br:4},
  {name:'SMG',     lv:13, dmg:9,  spd:780, cd:0.09,n:1,spr:0.10, pierce:false,aoe:0,  clr:'#44aaff',br:3},
  {name:'Mini Gun', lv:17, dmg:7,  spd:900, cd:0.055,n:2,spr:0.20,pierce:false,aoe:0,  clr:'#ff9900',br:3},
  {name:'Rocket',  lv:21, dmg:90, spd:360, cd:1.10,n:1,spr:0,    pierce:false,aoe:130,clr:'#ff4444',br:6, double:true},
  {name:'Plasma',  lv:25, dmg:80, spd:840, cd:0.45,n:1,spr:0,    pierce:true, aoe:0,  clr:'#dd44ff',br:5, beam:true},
];
const getWeapon = lv => [...WEAPONS].reverse().find(w => lv >= w.lv) ?? WEAPONS[0];
const xpToNext  = lv => 40 + lv * 30;

// ── Buff items ────────────────────────────────────────────────────
const BUFF_DEFS = [
  {id:'bouncing', name:'BOUNCE',   dur:60, clr:'#44ffcc'},
  {id:'splash',   name:'SPLASH',   dur:60, clr:'#ff8844'},
  {id:'spread',   name:'SPREAD',   dur:60, clr:'#4488ff'},
  {id:'rapid',    name:'RAPID',    dur:60, clr:'#ffff44'},
  {id:'ricochet', name:'RICOCHET', dur:60, clr:'#ff44aa'},
  {id:'bomb',     name:'BOMB',     dur:0,  clr:'#ff8800', instant:true},
];

// ── Enemy templates ───────────────────────────────────────────────
const ETYPES = [
  // ── Regular enemies (all zones)
  {kind:'Runner',  maxHp:30,  spd:144, dmg:36, r:10, clr:'#ff4455', xp:10},
  {kind:'Brute',   maxHp:220, spd:84,  dmg:90, r:18, clr:'#ff8800', xp:30},
  {kind:'Speeder', maxHp:17,  spd:312, dmg:16, r:8,  clr:'#ff44cc', xp:15},
  // ── Zone 1: Toxic Zone — Spitter (ranged acid shots)
  {kind:'Spitter', maxHp:70,  spd:108, dmg:18, r:11, clr:'#44ff44', xp:22, zone:1, atkCd:3.0},
  // ── Zone 2: Volcanic — Ember (explodes violently on death)
  {kind:'Ember',   maxHp:160, spd:120, dmg:40, r:15, clr:'#ff6600', xp:28, zone:2},
  // ── Zone 3: Arctic — Glacial (ranged ice shards that slow the player)
  {kind:'Glacial', maxHp:55,  spd:168, dmg:12, r:10, clr:'#88ddff', xp:22, zone:3, atkCd:3.5},
  // ── Zone 4: Ancient — Phantom (teleports + 35% bullet dodge)
  {kind:'Phantom', maxHp:85,  spd:156, dmg:22, r:11, clr:'#ffcc44', xp:32, zone:4, atkCd:3.5},
  // ── Zone 5: The Void — Wraith (phases through furniture)
  {kind:'Wraith',  maxHp:95,  spd:192, dmg:28, r:12, clr:'#cc99ff', xp:38, zone:5},
];
const REGULAR_ETYPES = ETYPES.slice(0,3);
function pickType(wave) {
  const zoneIdx = Math.min(Math.floor(wave/5), ZONES.length-1);
  const zonePool = ETYPES.filter(e => e.zone === zoneIdx);
  // 40% chance to spawn the zone-specific enemy when one exists
  if (zonePool.length && Math.random() < 0.40)
    return zonePool[Math.floor(Math.random()*zonePool.length)];
  if (wave <= 2) return REGULAR_ETYPES[0];
  if (wave <= 4) return Math.random()<0.35 ? REGULAR_ETYPES[1] : REGULAR_ETYPES[0];
  return REGULAR_ETYPES[Math.floor(Math.random()*REGULAR_ETYPES.length)];
}

// ── Game state ────────────────────────────────────────────────────
let state = 'menu'; // 'menu'|'playing'|'paused'|'dead'|'settings'
let bullets, enemyBullets, enemies, boss, beams;
let explosions, buffItems;
let wave, waveTimer, shotCd, kills, buffSpawnTimer;
let notif = '', notifT = 0, notifClr = '#ffdd44';
let t = 0;

// ── Settings state ────────────────────────────────────────────────
let settingsFrom = 'menu';   // where to return when closing settings
let settingsTab  = 'audio';  // 'audio' | 'display' | 'keybinds'
let sfxVolume    = 1.0;      // independent SFX volume (0–1)
let screenScale  = 1.0;      // CSS canvas scale
let _rebinding   = null;     // BINDS key currently being captured

// Keybinds — action → e.key.toLowerCase()
let BINDS = { up:'w', down:'s', left:'a', right:'d', shoot:' ' };

const KEYBIND_ROWS = [
  { action:'up',    label:'MOVE UP'    },
  { action:'down',  label:'MOVE DOWN'  },
  { action:'left',  label:'MOVE LEFT'  },
  { action:'right', label:'MOVE RIGHT' },
  { action:'shoot', label:'SHOOT'      },
];

function keyDisplayName(k) {
  if (!k) return '?';
  if (k === ' ')         return 'SPACE';
  if (k === 'arrowup')   return '↑';
  if (k === 'arrowdown') return '↓';
  if (k === 'arrowleft') return '←';
  if (k === 'arrowright')return '→';
  return k.toUpperCase();
}

function applyScale(s) {
  screenScale = s;
  canvas.style.width  = (W * s) + 'px';
  canvas.style.height = (H * s) + 'px';
}


// Player is always live so lobby movement works
let player = {
  x: W / 2, y: H / 2 - 80, r: PR, speed: 600,
  color: '#' + incoming.color, angle: 0,
  hp: 200, maxHp: 200, level: 1, xp: 0, iframes: 0, slowTimer: 0,
  buffs: {bouncing:0, splash:0, spread:0, rapid:0, ricochet:0},
};

function showNotif(msg, clr='#ffdd44') { notif=msg; notifT=2.8; notifClr=clr; }

function initGame() {
  player.x = W/2; player.y = H/2;
  player.hp = 200; player.maxHp = 200;
  player.level = 1; player.xp = 0; player.iframes = 0; player.slowTimer = 0;
  player.buffs = {bouncing:0,splash:0,spread:0,rapid:0,ricochet:0};
  bullets=[]; enemyBullets=[]; enemies=[];
  boss=null; explosions=[]; buffItems=[]; beams=[];
  wave=0; waveTimer=WAVE_DELAY; shotCd=0; kills=0; buffSpawnTimer=25;
  for (const p of WALK_PADS) p.timer = 0;
  spawnWave();
  movePortals(false); // portals off-map during game
}

// ── Spawning ──────────────────────────────────────────────────────

// Returns a random floor position that doesn't overlap any wall or furniture.
function randomBuffPos() {
  const margin = WALL + 60, r = 26;
  for (let i = 0; i < 60; i++) {
    const x = margin + Math.random() * (W - margin * 2);
    const y = margin + Math.random() * (H - margin * 2);
    let blocked = false;
    for (const rect of SOLID) {
      if (circleRect(x, y, r, rect.x, rect.y, rect.w, rect.h)) { blocked=true; break; }
    }
    if (!blocked) return {x, y};
  }
  return {x: W/2, y: H/2}; // fallback
}

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
  const prevZoneIdx = Math.min(Math.floor((wave)/5), ZONES.length-1);
  wave++;
  const newZoneIdx  = Math.min(Math.floor((wave)/5), ZONES.length-1);
  if (newZoneIdx !== prevZoneIdx) {
    const z = ZONES[newZoneIdx];
    showNotif(`⬡ ENTERING: ${z.name.toUpperCase()} ⬡`, z.pillarStroke);
  }
  if (wave % 5 === 0) {
    const tier    = Math.floor((wave-5)/5);
    const zoneIdx = Math.min(tier, 5);
    const bHp     = Math.round(800 * Math.pow(1.35, tier));
    const pos     = randomEdgePos();
    // Per-zone boss definitions
    const BOSS_DEFS = [
      {name:'VOID STALKER',   clr:'#aa44ff', r:32, spd:132, enrSpd:204, atkCd:2.2, dmg:130},
      {name:'ACID WORM',      clr:'#44ee44', r:30, spd:96,  enrSpd:150, atkCd:2.8, dmg:120},
      {name:'MAGMA TITAN',    clr:'#ff6600', r:42, spd:78,  enrSpd:126, atkCd:3.0, dmg:160},
      {name:'FROST COLOSSUS', clr:'#88ddff', r:36, spd:108, enrSpd:162, atkCd:2.5, dmg:140},
      {name:'PHANTOM KING',   clr:'#ffcc00', r:30, spd:150, enrSpd:216, atkCd:2.0, dmg:130},
      {name:'WRAITH LORD',    clr:'#cc44ff', r:36, spd:168, enrSpd:240, atkCd:1.8, dmg:150},
    ];
    const bd = BOSS_DEFS[zoneIdx];
    boss = {
      ...pos, kind:zoneIdx, name:bd.name,
      r:bd.r, spd:bd.spd, enrSpd:bd.enrSpd, dmg:bd.dmg,
      hp:bHp, maxHp:bHp, clr:bd.clr, xp:300+wave*30,
      atkCd:bd.atkCd, baseAtkCd:bd.atkCd, atkIdx:0,
      charging:false, chargeDur:0, chargeDir:{x:0,y:1},
      enraged:false, angle:0, trailTimer:0,
    };
    const minionCount = 4 + (tier*2);
    for (let i=0; i<minionCount; i++) spawnEnemy(ETYPES[0]);
    waveTimer = 9999;
    showNotif(`★ ${bd.name} ★`, bd.clr);
  } else {
    const total = 2 + wave*3;
    for (let i=0; i<total; i++) spawnEnemy(pickType(wave));
    if (wave > 1) showNotif(`Wave ${wave}`, '#ffdd44');
    waveTimer = WAVE_DELAY;
  }
}

// ── Boss attacks — dispatched by zone kind ────────────────────────
function doBossAttack(b) {
  b.atkIdx++;
  switch (b.kind) {
    case 0: bossAtk_VoidStalker(b);   break;
    case 1: bossAtk_AcidWorm(b);      break;
    case 2: bossAtk_MagmaTitan(b);    break;
    case 3: bossAtk_FrostColossus(b); break;
    case 4: bossAtk_PhantomKing(b);   break;
    case 5: bossAtk_WraithLord(b);    break;
    default: bossAtk_VoidStalker(b);  break;
  }
}

// Zone 0 — VOID STALKER: teleport-and-burst, aimed shots, gravity pull ring
function bossAtk_VoidStalker(b) {
  const phase = (b.atkIdx-1) % 3;
  if (phase === 0) {
    // Teleport to random arena spot, then fire outward ring
    createExplosion(b.x, b.y, 44, b.clr);
    b.x = WALL+120+Math.random()*(W-WALL*2-240);
    b.y = WALL+120+Math.random()*(H-WALL*2-240);
    createExplosion(b.x, b.y, 44, b.clr);
    const n = b.enraged ? 16 : 10;
    for (let i=0;i<n;i++) {
      const a=(i/n)*Math.PI*2+t*0.3;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*252,vy:Math.sin(a)*252,dmg:22,r:7,life:3,dead:false,clr:b.clr});
    }
    if (b.enraged) {
      for (let i=0;i<8;i++) {
        const a=(i/8)*Math.PI*2+Math.PI/8;
        enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*168,vy:Math.sin(a)*168,dmg:18,r:6,life:3.5,dead:false,clr:b.clr});
      }
    }
  } else if (phase === 1) {
    // Aimed spread shots
    const a=Math.atan2(player.y-b.y,player.x-b.x);
    const shots=b.enraged?4:2;
    for (let i=0;i<shots;i++) {
      const da=(i-(shots-1)/2)*0.2;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a+da)*330,vy:Math.sin(a+da)*330,dmg:34,r:7,life:3.5,dead:false,clr:b.clr});
    }
  } else {
    // Gravity pull — bullets from surrounding ring converge inward
    const n = b.enraged ? 22 : 14;
    for (let i=0;i<n;i++) {
      const a=(i/n)*Math.PI*2;
      const ox=b.x+Math.cos(a)*240, oy=b.y+Math.sin(a)*240;
      enemyBullets.push({x:ox,y:oy,vx:-Math.cos(a)*312,vy:-Math.sin(a)*312,dmg:26,r:7,life:1.4,dead:false,clr:b.clr});
    }
    showNotif('GRAVITY PULL!', b.clr);
  }
}

// Zone 1 — ACID WORM: poison blob fan, homing shots, acid charge
function bossAtk_AcidWorm(b) {
  const phase = (b.atkIdx-1) % 3;
  if (phase === 0) {
    // Wide slow poison blob fan
    const a=Math.atan2(player.y-b.y,player.x-b.x);
    const n=b.enraged?9:6;
    for (let i=0;i<n;i++) {
      const da=(i-(n-1)/2)*0.28;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a+da)*144,vy:Math.sin(a+da)*144,dmg:18,r:11,life:5,dead:false,clr:b.clr,slow:1.5});
    }
    createExplosion(b.x,b.y,32,b.clr);
  } else if (phase === 1) {
    // Homing acid shots
    const n=b.enraged?5:3;
    const a=Math.atan2(player.y-b.y,player.x-b.x);
    for (let i=0;i<n;i++) {
      const da=(i-(n-1)/2)*0.18;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a+da)*228,vy:Math.sin(a+da)*228,dmg:28,r:8,life:4.5,dead:false,clr:b.clr,homing:true});
    }
    showNotif('ACID HOMING!', b.clr);
  } else {
    // Charge — acid pools dropped in boss update loop via trailTimer
    const dx=player.x-b.x,dy=player.y-b.y,d=Math.hypot(dx,dy)||1;
    b.charging=true; b.chargeDur=1.2; b.trailTimer=0;
    b.chargeDir={x:dx/d,y:dy/d};
    showNotif('ACID CHARGE!', b.clr);
  }
}

// Zone 2 — MAGMA TITAN: slam ring, meteor rain, charge
function bossAtk_MagmaTitan(b) {
  const phase = (b.atkIdx-1) % 3;
  if (phase === 0) {
    // Ground slam — wide outward ring of fireballs at varied speeds
    const n=b.enraged?18:12;
    for (let i=0;i<n;i++) {
      const a=(i/n)*Math.PI*2;
      const spd=(3.5+Math.random()*2.5)*60;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,dmg:32,r:9,life:3,dead:false,clr:b.clr});
    }
    if (b.enraged) {
      // Second inner ring offset
      for (let i=0;i<9;i++) {
        const a=(i/9)*Math.PI*2+Math.PI/9;
        enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*144,vy:Math.sin(a)*144,dmg:22,r:8,life:3.5,dead:false,clr:'#ffaa00'});
      }
    }
    createExplosion(b.x,b.y,80,b.clr);
    showNotif('GROUND SLAM!', b.clr);
  } else if (phase === 1) {
    // Meteor rain — staggered aimed shots with slight spread
    const count=b.enraged?10:6;
    const a=Math.atan2(player.y-b.y,player.x-b.x);
    for (let i=0;i<count;i++) {
      const da=(Math.random()-0.5)*0.45;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a+da)*348,vy:Math.sin(a+da)*348,dmg:38,r:8,life:3,dead:false,clr:'#ffaa00'});
    }
    showNotif('METEOR RAIN!', b.clr);
  } else {
    // Heavy charge
    const dx=player.x-b.x,dy=player.y-b.y,d=Math.hypot(dx,dy)||1;
    b.charging=true; b.chargeDur=1.5;
    b.chargeDir={x:dx/d,y:dy/d};
    showNotif('MAGMA CHARGE!', b.clr);
  }
}

// Zone 3 — FROST COLOSSUS: ice shard ring, freeze shots, blizzard pulse
function bossAtk_FrostColossus(b) {
  const phase = (b.atkIdx-1) % 3;
  if (phase === 0) {
    // Ice shard ring — slow, large shards
    const n=b.enraged?18:12;
    for (let i=0;i<n;i++) {
      const a=(i/n)*Math.PI*2+t*0.2;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*180,vy:Math.sin(a)*180,dmg:20,r:8,life:4,dead:false,clr:b.clr,slow:1.8});
    }
    if (b.enraged) {
      for (let i=0;i<9;i++) {
        const a=(i/9)*Math.PI*2+Math.PI/9;
        enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*270,vy:Math.sin(a)*270,dmg:16,r:7,life:3,dead:false,clr:'#ccf0ff'});
      }
    }
    createExplosion(b.x,b.y,50,b.clr);
  } else if (phase === 1) {
    // Freeze burst — aimed slow shots that freeze player
    const a=Math.atan2(player.y-b.y,player.x-b.x);
    const shots=b.enraged?5:3;
    for (let i=0;i<shots;i++) {
      const da=(i-(shots-1)/2)*0.22;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a+da)*240,vy:Math.sin(a+da)*240,dmg:24,r:8,life:4,dead:false,clr:b.clr,freeze:2.0});
    }
    showNotif('FREEZE BURST!', b.clr);
  } else {
    // Blizzard pulse — slow radial ring + charge
    const n=b.enraged?24:16;
    for (let i=0;i<n;i++) {
      const a=(i/n)*Math.PI*2;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*132,vy:Math.sin(a)*132,dmg:18,r:9,life:5,dead:false,clr:'#ccf0ff',slow:1.0});
    }
    const dx=player.x-b.x,dy=player.y-b.y,d=Math.hypot(dx,dy)||1;
    b.charging=true; b.chargeDur=1.1;
    b.chargeDir={x:dx/d,y:dy/d};
    showNotif('BLIZZARD!', b.clr);
  }
}

// Zone 4 — PHANTOM KING: teleport+ring, 5-way spread, phase blink nova
function bossAtk_PhantomKing(b) {
  const phase = (b.atkIdx-1) % 3;
  if (phase === 0) {
    // Teleport + large ring
    createExplosion(b.x,b.y,44,b.clr);
    b.x=WALL+120+Math.random()*(W-WALL*2-240);
    b.y=WALL+120+Math.random()*(H-WALL*2-240);
    createExplosion(b.x,b.y,44,b.clr);
    const n=b.enraged?20:14;
    for (let i=0;i<n;i++) {
      const a=(i/n)*Math.PI*2;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*288,vy:Math.sin(a)*288,dmg:26,r:7,life:3,dead:false,clr:b.clr});
    }
    // Always add aimed shots after teleport
    const a=Math.atan2(player.y-b.y,player.x-b.x);
    for (let i=0;i<3;i++) {
      const da=(i-1)*0.18;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a+da)*360,vy:Math.sin(a+da)*360,dmg:30,r:7,life:3,dead:false,clr:b.clr});
    }
  } else if (phase === 1) {
    // 5-way (or 7-way enraged) aimed spread
    const a=Math.atan2(player.y-b.y,player.x-b.x);
    const shots=b.enraged?7:5;
    for (let i=0;i<shots;i++) {
      const da=(i-(shots-1)/2)*0.2;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a+da)*348,vy:Math.sin(a+da)*348,dmg:28,r:7,life:3.5,dead:false,clr:b.clr});
    }
  } else {
    // Phase blink: teleport twice then 24-bullet explosion
    const blinks=b.enraged?3:2;
    for (let bi=0;bi<blinks;bi++) {
      const tx=WALL+120+Math.random()*(W-WALL*2-240);
      const ty=WALL+120+Math.random()*(H-WALL*2-240);
      createExplosion(b.x,b.y,30,b.clr); b.x=tx; b.y=ty;
    }
    const n=b.enraged?28:20;
    for (let i=0;i<n;i++) {
      const a=(i/n)*Math.PI*2+t;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*300,vy:Math.sin(a)*300,dmg:30,r:7,life:3,dead:false,clr:b.clr});
    }
    createExplosion(b.x,b.y,80,b.clr);
    showNotif('PHASE NOVA!', b.clr);
  }
}

// Zone 5 — WRAITH LORD: chaos burst, 5-way homing, darkness nova + teleport
function bossAtk_WraithLord(b) {
  const phase = (b.atkIdx-1) % 3;
  if (phase === 0) {
    // Chaos — random direction bullets (some homing when enraged)
    const n=b.enraged?32:20;
    for (let i=0;i<n;i++) {
      const a=Math.random()*Math.PI*2;
      const spd=(3+Math.random()*3.5)*60;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*spd,vy:Math.sin(a)*spd,
        dmg:22,r:7,life:3.5,dead:false,clr:b.clr,homing:b.enraged&&Math.random()<0.4});
    }
    createExplosion(b.x,b.y,60,b.clr);
    showNotif('CHAOS BURST!', b.clr);
  } else if (phase === 1) {
    // Aimed 5-way homing spread
    const a=Math.atan2(player.y-b.y,player.x-b.x);
    const shots=b.enraged?7:5;
    for (let i=0;i<shots;i++) {
      const da=(i-(shots-1)/2)*0.2;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a+da)*330,vy:Math.sin(a+da)*330,
        dmg:32,r:7,life:4,dead:false,clr:b.clr,homing:true});
    }
    showNotif('WRAITH HOMING!', b.clr);
  } else {
    // Darkness nova — massive ring, then teleport, then second ring
    const n=b.enraged?36:24;
    for (let i=0;i<n;i++) {
      const a=(i/n)*Math.PI*2+t;
      enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*270,vy:Math.sin(a)*270,dmg:26,r:8,life:3.5,dead:false,clr:b.clr});
    }
    createExplosion(b.x,b.y,100,b.clr);
    // Teleport away
    b.x=WALL+120+Math.random()*(W-WALL*2-240);
    b.y=WALL+120+Math.random()*(H-WALL*2-240);
    if (b.enraged) {
      for (let i=0;i<16;i++) {
        const a=(i/16)*Math.PI*2+Math.PI/16+t;
        enemyBullets.push({x:b.x,y:b.y,vx:Math.cos(a)*210,vy:Math.sin(a)*210,dmg:20,r:7,life:3,dead:false,clr:'#ff44ff'});
      }
    }
    createExplosion(b.x,b.y,60,b.clr);
    showNotif('DARKNESS NOVA!', b.clr);
  }
}

// ── Bomb instant pickup ───────────────────────────────────────────
function triggerBomb() {
  // Kill every regular enemy (hp=0 lets the existing filter give XP/kills)
  for (const e of enemies) {
    createExplosion(e.x, e.y, e.r * 4, '#ff8800');
    e.hp = 0;
  }
  // Deal 50% of boss max HP as damage — never outright kills the boss
  if (boss) {
    boss.hp = Math.max(1, boss.hp - boss.maxHp * 0.5);
    createExplosion(boss.x, boss.y, 120, '#ff8800');
  }
  // Big screen-wide flash
  createExplosion(W/2, H/2, 500, '#ff8800');
  showNotif(boss ? '💣 BOMB! BOSS HALF HP!' : '💣 BOMB! ALL ENEMIES WIPED!', '#ff8800');
}

// ── Shooting ──────────────────────────────────────────────────────
function shoot() {
  const w    = getWeapon(player.level);
  const cd   = player.buffs.rapid  >0 ? w.cd*0.55 : w.cd;
  const base = Math.atan2(mouseY-player.y, mouseX-player.x);
  playWeaponSound(w.name);
  if (w.beam) {
    const beamOpts = {
      splash:      player.buffs.splash   >0 ? 70  : 0,
      wallBounces: player.buffs.bouncing >0 ? 2   : 0,
      ricochet:    player.buffs.ricochet >0,
    };
    if (player.buffs.spread>0) {
      // Three fanned beams when spread is active
      for (let i=-1; i<=1; i++) fireBeam(base+i*0.22, w.dmg, w.clr, {...beamOpts, hit:new Set()});
    } else {
      fireBeam(base, w.dmg, w.clr, beamOpts);
    }
    shotCd=cd; return;
  }
  const n    = player.buffs.spread >0 ? w.n+3     : w.n;
  const aoe  = player.buffs.splash >0 ? Math.max(w.aoe,80) : w.aoe;
  const spr  = player.buffs.spread >0 ? w.spr+0.26 : w.spr;
  for (let i=0; i<n; i++) {
    const a = base + (Math.random()-0.5)*spr*2;
    bullets.push({
      x:player.x, y:player.y,
      vx:Math.cos(a)*w.spd, vy:Math.sin(a)*w.spd,
      dmg:w.dmg, r:w.br, clr:w.clr,
      pierce:w.pierce, aoe, life:2.2, dead:false,
      double: w.double||false,
      bouncing: player.buffs.bouncing>0, bounces:0,
      ricochet: player.buffs.ricochet>0, ricochetsLeft:6, ricocheted:new Set(),
      knockback: w.name==='Shotgun',
    });
  }
  shotCd = cd;
}

// ── Plasma beam raycast ───────────────────────────────────────────
// opts: { splash, wallBounces, ricochet, sx, sy, hit, depth }
function fireBeam(angle, dmg, clr, opts={}) {
  const {
    splash=0, wallBounces=0, ricochet=false,
    sx=player.x, sy=player.y,
    hit=new Set(), depth=0,
  } = opts;
  if (depth > 6) return; // safety cap against runaway recursion

  let dx=Math.cos(angle), dy=Math.sin(angle);
  let endX=sx, endY=sy;
  let bounceX=null, bounceY=null, bounceAngle=null;

  for (let dist=8; dist<2200; dist+=8) {
    const cx=sx+dx*dist, cy=sy+dy*dist;

    // Wall hit — reflect if bounces remain, otherwise stop
    if (cx<WALL||cx>W-WALL||cy<WALL||cy>H-WALL) {
      endX=cx; endY=cy;
      if (wallBounces>0) {
        const ndx = (cx<WALL||cx>W-WALL) ? -dx : dx;
        const ndy = (cy<WALL||cy>H-WALL) ? -dy : dy;
        bounceX=Math.max(WALL+2,Math.min(W-WALL-2,cx));
        bounceY=Math.max(WALL+2,Math.min(H-WALL-2,cy));
        bounceAngle=Math.atan2(ndy,ndx);
      }
      break;
    }
    endX=cx; endY=cy;

    // Stop at furniture
    let blocked=false;
    for (const f of FURNITURE) {
      if (cx>=f.x&&cx<=f.x+f.w&&cy>=f.y&&cy<=f.y+f.h){blocked=true;break;}
    }
    if (blocked) break;

    // Damage enemies along path (each hit once per full beam chain)
    for (const e of enemies) {
      if (!hit.has(e) && Math.hypot(cx-e.x,cy-e.y)<e.r+6) {
        e.hp-=dmg; hit.add(e);
        createExplosion(e.x,e.y,splash>0?splash:18,clr);
        if (splash>0) { // splash: damage nearby enemies too
          for (const o of enemies) if(!hit.has(o)&&Math.hypot(e.x-o.x,e.y-o.y)<splash){o.hp-=dmg*0.4;hit.add(o);}
          if (boss&&Math.hypot(e.x-boss.x,e.y-boss.y)<splash) boss.hp-=dmg*0.4;
        }
        if (ricochet) { // ricochet: bend beam to nearest un-hit enemy
          let nearest=null,nearestD=500;
          for (const o of enemies){if(hit.has(o))continue;const d=Math.hypot(cx-o.x,cy-o.y);if(d<nearestD){nearest=o;nearestD=d;}}
          if (nearest) {
            endX=cx; endY=cy;
            beams.push({x1:sx,y1:sy,x2:endX,y2:endY,clr,life:0.18,maxLife:0.18});
            fireBeam(Math.atan2(nearest.y-cy,nearest.x-cx),dmg,clr,{...opts,sx:cx,sy:cy,hit,depth:depth+1});
            return;
          }
        }
      }
    }
    if (boss&&!hit.has(boss)&&Math.hypot(cx-boss.x,cy-boss.y)<boss.r+6) {
      boss.hp-=dmg; hit.add(boss);
      createExplosion(boss.x,boss.y,splash>0?Math.max(28,splash):28,clr);
      if (splash>0){for(const o of enemies)if(!hit.has(o)&&Math.hypot(boss.x-o.x,boss.y-o.y)<splash){o.hp-=dmg*0.4;hit.add(o);}}
    }
  }

  beams.push({x1:sx,y1:sy,x2:endX,y2:endY,clr,life:0.18,maxLife:0.18});

  // Continue reflected beam if wall bounce remaining
  if (bounceAngle!==null && wallBounces>0) {
    fireBeam(bounceAngle,dmg,clr,{...opts,sx:bounceX,sy:bounceY,wallBounces:wallBounces-1,hit,depth:depth+1});
  }
}

// ── XP / Level ────────────────────────────────────────────────────
function gainXP(amount) {
  player.xp += amount;
  if (player.xp >= xpToNext(player.level)) {
    player.xp -= xpToNext(player.level);
    player.level++;
    player.maxHp += 10;
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
  // Keybind capture mode — eat the key and assign it
  if (_rebinding !== null) {
    if (e.key !== 'Escape') BINDS[_rebinding] = e.key.toLowerCase();
    _rebinding = null;
    e.preventDefault(); return;
  }
  keys[e.key.toLowerCase()] = true;
  if (e.key === ' ') e.preventDefault();
  if (e.key === 'Escape') {
    if (state === 'playing')  { state='paused'; musicPause(); }
    else if (state === 'paused')   { state='playing'; musicPlay(); }
    else if (state === 'settings') { state=settingsFrom; if(settingsFrom==='playing') musicPlay(); }
    updateCursor();
  }
});
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });

let mouseX=W/2, mouseY=H/2, mouseDown=false;
let _volDrag=false;
// Volume slider constants (used in draw + input)
// Settings slider geometry (used by drawSettings + mouse handlers)
const SET_SL_CX=W/2, SET_SL_W=440, SET_SL_H=20;
const SET_MUS_Y=H/2-40;   // music vol slider y
const SET_SFX_Y=H/2+60;   // sfx vol slider y

function _applyMusicSlider(mx) {
  musicVolume = Math.max(0, Math.min(1, (mx-(SET_SL_CX-SET_SL_W/2))/SET_SL_W));
  music.volume = musicVolume;
}
function _applySfxSlider(mx) {
  sfxVolume = Math.max(0, Math.min(1, (mx-(SET_SL_CX-SET_SL_W/2))/SET_SL_W));
}

canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  mouseX = (e.clientX-r.left)*(W/r.width);
  mouseY = (e.clientY-r.top) *(H/r.height);
  if (_volDrag==='music') _applyMusicSlider(mouseX);
  else if (_volDrag==='sfx') _applySfxSlider(mouseX);
});
canvas.addEventListener('mousedown', e => {
  if(e.button!==0) return;
  mouseDown=true;
  // Settings audio sliders
  if (state==='settings' && settingsTab==='audio') {
    const lx=SET_SL_CX-SET_SL_W/2-10, rx=SET_SL_CX+SET_SL_W/2+10;
    if (mouseX>=lx&&mouseX<=rx&&mouseY>=SET_MUS_Y-SET_SL_H&&mouseY<=SET_MUS_Y+SET_SL_H)
      { _volDrag='music'; _applyMusicSlider(mouseX); return; }
    if (mouseX>=lx&&mouseX<=rx&&mouseY>=SET_SFX_Y-SET_SL_H&&mouseY<=SET_SFX_Y+SET_SL_H)
      { _volDrag='sfx'; _applySfxSlider(mouseX); return; }
  }
  handleClick(mouseX,mouseY);
});
canvas.addEventListener('mouseup', e => { if(e.button===0){ mouseDown=false; _volDrag=false; } });

const BTN_W=190, BTN_H=48;
function hitBtn(mx,my,bx,by) {
  return mx>=bx-BTN_W/2 && mx<=bx+BTN_W/2 && my>=by-BTN_H/2 && my<=by+BTN_H/2;
}
function handleClick(mx,my) {
  if (state==='paused') {
    if (hitBtn(mx,my,W/2-200,H/2+14))  { state='playing'; musicPlay(); updateCursor(); }
    if (hitBtn(mx,my,W/2-200,H/2+82))  { settingsFrom='paused'; settingsTab='audio'; state='settings'; }
    if (hitBtn(mx,my,W/2-200,H/2+150)) { movePortals(true); state='menu'; musicPause(); updateCursor(); }
  }
  if (state==='dead') {
    if (hitBtn(mx,my,W/2-200,H/2+58))  { initGame(); state='playing'; musicPlay(); updateCursor(); }
    if (hitBtn(mx,my,W/2-200,H/2+124)) { movePortals(true); state='menu'; musicPause(); updateCursor(); }
  }
  if (state==='settings') {
    // Tab buttons
    const ty=H/2-155;
    if (mx>=W/2-360&&mx<=W/2-120&&my>=ty-24&&my<=ty+24) settingsTab='audio';
    if (mx>=W/2-110&&mx<=W/2+110&&my>=ty-24&&my<=ty+24) settingsTab='display';
    if (mx>=W/2+120&&mx<=W/2+360&&my>=ty-24&&my<=ty+24) settingsTab='keybinds';
    // BACK button
    if (hitBtn(mx,my,W/2,H/2+290)) { state=settingsFrom; if(settingsFrom==='playing') musicPlay(); updateCursor(); }
    // Display: scale buttons
    if (settingsTab==='display') {
      if (hitBtn(mx,my,W/2-200,H/2+30)) applyScale(0.5);
      if (hitBtn(mx,my,W/2,     H/2+30)) applyScale(0.75);
      if (hitBtn(mx,my,W/2+200, H/2+30)) applyScale(1.0);
    }
    // Keybinds: row buttons
    if (settingsTab==='keybinds') {
      KEYBIND_ROWS.forEach((row,i) => {
        const ry = H/2-100+i*56;
        if (mx>=W/2+80&&mx<=W/2+280&&my>=ry-22&&my<=ry+22) _rebinding=row.action;
      });
    }
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
const MAX_LB  = 10;

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
// Damage multiplier: doubles every 8 waves (wave 8 = 2×, 16 = 4×, 24 = 8×…)
function enemyDmgMult() { return Math.pow(2, Math.floor(wave / 8)); }

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
  // Share score with anyone else in the room so their leaderboard updates too
  sendScore?.({ ...entry, color: player.color });
}

function mergedLeaderboard() {
  // All received peer scores are saved to localStorage via lbSubmit, so just read local
  const all = lbLoad();
  const byUser = new Map();
  for (const e of all) {
    const key = e.username?.toLowerCase() ?? '?';
    if (!byUser.has(key) || byUser.get(key).score < e.score) byUser.set(key, e);
  }
  return [...byUser.values()].sort((a,b) => b.score - a.score).slice(0, MAX_LB);
}

// ── Score-sharing (P2P gossip for leaderboard only) ───────────────
let room = null;

async function loadTrystero() {
  for (const url of ['https://esm.run/trystero@0.23','https://cdn.jsdelivr.net/npm/trystero@0.23/+esm','https://esm.sh/trystero@0.23']) {
    try { const m=await import(url); if(m?.joinRoom) return m; } catch {}
  }
  throw new Error('trystero unavailable');
}
async function setupScoreSharing() {
  try {
    const {joinRoom}=await loadTrystero();
    room=joinRoom({appId:'ordinary-game-jam-starter'},'demo-room');

    const [sScore,gScore]=room.makeAction('score');
    sendScore=sScore;
    // Persist every received score so the leaderboard accumulates across sessions
    gScore((d)=>{
      if (d.username && d.score != null) lbSubmit(d);
    });

    // When someone joins, gossip our full local score history to them
    room.onPeerJoin(()=>{
      const all = lbLoad();
      setTimeout(()=>{ for (const entry of all) sendScore?.({...entry}); }, 800);
    });
  } catch {}
}
setupScoreSharing();
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
    if (keys[BINDS.up]   ||keys['arrowup'])    dy-=1;
    if (keys[BINDS.down] ||keys['arrowdown'])  dy+=1;
    if (keys[BINDS.left] ||keys['arrowleft'])  dx-=1;
    if (keys[BINDS.right]||keys['arrowright']) dx+=1;
    if (dx&&dy){dx*=0.707;dy*=0.707;}
    player.slowTimer=Math.max(0,player.slowTimer-dt);
    const speedMult = player.slowTimer>0 ? 0.3 : 1;
    dx*=player.speed*speedMult*dt; dy*=player.speed*speedMult*dt;
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
          if (pad.id==='start')    { initGame(); state='playing'; musicPlay(); updateCursor(); return; }
          if (pad.id==='scores')   { showScores=!showScores; pad.timer=0; return; }
          if (pad.id==='settings') { settingsFrom='menu'; settingsTab='audio'; state='settings'; return; }
          if (pad.id==='end')    {
            window.location.href = nextTarget?.url ?? 'https://callumhyoung.github.io/gamejam/';
          }
        }
      } else {
        pad.timer = Math.max(0, pad.timer-dt*1.8);
      }
    }

    checkPortals();
    return;
  }

  if (state==='dead' || state==='paused') return;

  // ── PLAYING STATE ──────────────────────────────────────────────

  // Buff timers
  for (const id of Object.keys(player.buffs)) player.buffs[id]=Math.max(0,player.buffs[id]-dt);

  // Shoot (click OR spacebar)
  shotCd=Math.max(0,shotCd-dt);
  if ((mouseDown||keys[BINDS.shoot])&&shotCd===0) shoot();

  // ── Player bullets
  for (const b of bullets) {
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.life-=dt;
    if (b.life<=0){b.dead=true;continue;}
    const hL=b.x-b.r<WALL+1, hR=b.x+b.r>W-WALL-1, hT=b.y-b.r<WALL+1, hB=b.y+b.r>H-WALL-1;
    if (hL||hR||hT||hB) {
      if (b.bouncing&&b.bounces<6) {
        if(hL||hR){b.vx*=-1;b.x=hL?WALL+b.r+2:W-WALL-b.r-2;}
        if(hT||hB){b.vy*=-1;b.y=hT?WALL+b.r+2:H-WALL-b.r-2;}
        b.bounces++;
      } else { b.dead=true; }
    }
    if (!b.dead) {
      for (const f of FURNITURE) {
        if (circleRect(b.x,b.y,b.r,f.x,f.y,f.w,f.h)) {
          if (b.bouncing&&b.bounces<6) {
            // Determine which axis caused the penetration and reflect it
            const hitByX = circleRect(b.x, b.y-b.vy, b.r, f.x,f.y,f.w,f.h);
            const hitByY = circleRect(b.x-b.vx, b.y, b.r, f.x,f.y,f.w,f.h);
            if (hitByX) b.vx*=-1;
            if (hitByY) b.vy*=-1;
            if (!hitByX&&!hitByY){b.vx*=-1;b.vy*=-1;} // corner — reflect both
            b.bounces++;
          } else { b.dead=true; }
          break;
        }
      }
    }
  }

  // ── Player bullets vs enemies
  for (const e of enemies) {
    for (const b of bullets) {
      if (b.dead) continue;
      if (b.ricocheted?.has(e)) continue; // already hit this enemy this chain
      if (Math.hypot(b.x-e.x,b.y-e.y)<e.r+b.r) {
        // Phantom dodge — 35% chance to blink away, consuming the bullet
        if (e.kind==='Phantom' && Math.random()<0.35) {
          const pa=Math.random()*Math.PI*2, pd=120+Math.random()*100;
          e.x=Math.max(WALL+e.r+5,Math.min(W-WALL-e.r-5, player.x+Math.cos(pa)*pd));
          e.y=Math.max(WALL+e.r+5,Math.min(H-WALL-e.r-5, player.y+Math.sin(pa)*pd));
          if(!b.pierce) b.dead=true;
          continue;
        }
        e.hp-=b.dmg;
        playHitSound();
        if (b.knockback) {
          const ka=Math.atan2(b.vy,b.vx), kf=22;
          e.x=Math.max(WALL+e.r, Math.min(W-WALL-e.r, e.x+Math.cos(ka)*kf));
          e.y=Math.max(WALL+e.r, Math.min(H-WALL-e.r, e.y+Math.sin(ka)*kf));
        }
        if (b.aoe>0){
          for (const o of enemies) if(Math.hypot(b.x-o.x,b.y-o.y)<b.aoe) o.hp-=b.dmg*0.5;
          if (boss&&Math.hypot(b.x-boss.x,b.y-boss.y)<b.aoe) boss.hp-=b.dmg*0.5;
          createExplosion(b.x,b.y,b.aoe,b.clr); b.dead=true;
          if (b.double) {
            const r2=b.aoe*1.35;
            for (const o of enemies) if(Math.hypot(b.x-o.x,b.y-o.y)<r2) o.hp-=b.dmg*0.35;
            if (boss&&Math.hypot(b.x-boss.x,b.y-boss.y)<r2) boss.hp-=b.dmg*0.35;
            createExplosion(b.x,b.y,r2,'#ff8800');
          }
        } else if (b.ricochet&&b.ricochetsLeft>0) {
          b.ricocheted.add(e);
          // Find nearest enemy not yet in this chain
          let nearest=null, nearestD=380;
          for (const o of enemies) {
            if (b.ricocheted.has(o)) continue;
            const d=Math.hypot(b.x-o.x,b.y-o.y);
            if (d<nearestD){nearest=o;nearestD=d;}
          }
          if (nearest) {
            const spd=Math.hypot(b.vx,b.vy);
            const a=Math.atan2(nearest.y-b.y,nearest.x-b.x);
            b.vx=Math.cos(a)*spd; b.vy=Math.sin(a)*spd;
            b.ricochetsLeft--;
          } else { b.dead=true; }
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
          if (b.double) {
            const r2=b.aoe*1.35;
            for (const o of enemies) if(Math.hypot(b.x-o.x,b.y-o.y)<r2) o.hp-=b.dmg*0.35;
            if (boss&&Math.hypot(b.x-boss.x,b.y-boss.y)<r2) boss.hp-=b.dmg*0.35;
            createExplosion(b.x,b.y,r2,'#ff8800');
          }
        } else if (b.ricochet&&b.ricochetsLeft>0) {
          b.ricocheted?.add(boss);
          // Ricochet to nearest enemy after hitting boss
          let nearest=null, nearestD=380;
          for (const o of enemies) {
            if (b.ricocheted?.has(o)) continue;
            const d=Math.hypot(b.x-o.x,b.y-o.y);
            if (d<nearestD){nearest=o;nearestD=d;}
          }
          if (nearest) {
            const spd=Math.hypot(b.vx,b.vy);
            const a=Math.atan2(nearest.y-b.y,nearest.x-b.x);
            b.vx=Math.cos(a)*spd; b.vy=Math.sin(a)*spd;
            b.ricochetsLeft--;
          } else { b.dead=true; }
        } else if (!b.pierce){b.dead=true;}
      }
    }
  }
  bullets=bullets.filter(b=>!b.dead);

  // ── Boss update
  if (boss) {
    if (!boss.enraged&&boss.hp<boss.maxHp*0.5){
      boss.enraged=true; boss.spd=boss.enrSpd||2.8;
      showNotif(`${boss.name||'BOSS'} ENRAGED!`,'#ff6600');
    }
    boss.atkCd=Math.max(0,boss.atkCd-dt);
    if (boss.atkCd===0){boss.atkCd=boss.enraged?boss.baseAtkCd*0.55:boss.baseAtkCd;doBossAttack(boss);}

    const bspd=(boss.charging?510:boss.spd)*dt;
    const bdx=player.x-boss.x, bdy=player.y-boss.y, bdist=Math.hypot(bdx,bdy)||1;
    const bdir=boss.charging?boss.chargeDir:{x:bdx/bdist,y:bdy/bdist};
    let bx2=boss.x+bdir.x*bspd, by2=boss.y+bdir.y*bspd;
    for (const r of WALLS){let p=pushOut(bx2,boss.y,boss.r,r);bx2=p.x;}
    for (const r of WALLS){let p=pushOut(bx2,by2,boss.r,r);by2=p.y;}
    boss.x=bx2;boss.y=by2;boss.angle=Math.atan2(bdy,bdx);
    if (boss.charging){
      boss.chargeDur-=dt;
      // Acid Worm: drop poison pools during charge
      if (boss.kind===1) {
        boss.trailTimer-=dt;
        if(boss.trailTimer<=0){boss.trailTimer=0.18;
          enemyBullets.push({x:boss.x,y:boss.y,vx:0,vy:0,dmg:14,r:14,life:2.8,dead:false,clr:'#44ee44',slow:1.2});}
      }
      if(boss.chargeDur<=0)boss.charging=false;
    }

    if (player.iframes<=0&&Math.hypot(player.x-boss.x,player.y-boss.y)<PR+boss.r){
      player.hp-=boss.dmg*dt*2.5*enemyDmgMult();player.iframes=0.55;
    }
    if (boss.hp<=0){
      gainXP(boss.xp);kills++;
      const pool=[...BUFF_DEFS].sort(()=>Math.random()-0.5).slice(0,2);
      pool.forEach((def,i)=>{
        const a=(i/pool.length)*Math.PI*2;
        buffItems.push({x:boss.x+Math.cos(a)*60,y:boss.y+Math.sin(a)*60,def,life:25,pulse:0});
      });
      createExplosion(boss.x,boss.y,90,'#ff0033');
      player.hp = Math.min(player.hp + 80, player.maxHp); // heal on boss kill
      showNotif('BOSS DEFEATED! +80 HP!','#44ff88');
      waveTimer=WAVE_DELAY;boss=null;
    }
  }

  // ── Move enemies
  for (const e of enemies) {
    const edx=player.x-e.x, edy=player.y-e.y, ed=Math.hypot(edx,edy)||1;
    let ex=e.x+(edx/ed)*e.spd*dt, ey=e.y+(edy/ed)*e.spd*dt;
    // Wraith phases through furniture — only wall collision
    const colSet = e.kind==='Wraith' ? WALLS : SOLID;
    for (const r of colSet){let p=pushOut(ex,e.y,e.r,r);ex=p.x;}
    for (const r of colSet){let p=pushOut(ex,ey,e.r,r);ey=p.y;}
    for (const o of enemies){
      if(o===e)continue;
      const ox=ex-o.x,oy=ey-o.y,od=Math.hypot(ox,oy)||1,ov=e.r+o.r-od;
      if(ov>0){ex+=ox/od*ov*0.5;ey+=oy/od*ov*0.5;}
    }
    e.x=ex;e.y=ey;e.angle=Math.atan2(edy,edx);

    // ── Zone enemy special abilities
    if (e.atkCd !== undefined) {
      e.atkCd = Math.max(0, e.atkCd-dt);
      if (e.atkCd === 0) {
        const a = Math.atan2(player.y-e.y, player.x-e.x);
        if (e.kind==='Spitter') {
          // Lob slow acid glob
          enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*192,vy:Math.sin(a)*192,
            dmg:20,r:8,life:4.5,dead:false,clr:'#44ff44'});
          e.atkCd = 3.0;
        } else if (e.kind==='Glacial') {
          // Fire ice shard that slows on hit
          enemyBullets.push({x:e.x,y:e.y,vx:Math.cos(a)*300,vy:Math.sin(a)*300,
            dmg:10,r:7,life:4,dead:false,clr:'#88ddff',slow:2.5});
          e.atkCd = 3.5;
        } else if (e.kind==='Phantom') {
          // Blink to unexpected angle near player
          const pa=Math.random()*Math.PI*2, pd=130+Math.random()*110;
          e.x=Math.max(WALL+e.r+5,Math.min(W-WALL-e.r-5, player.x+Math.cos(pa)*pd));
          e.y=Math.max(WALL+e.r+5,Math.min(H-WALL-e.r-5, player.y+Math.sin(pa)*pd));
          e.atkCd = 3.5;
        }
      }
    }

    if(player.iframes<=0&&Math.hypot(player.x-e.x,player.y-e.y)<PR+e.r){
      player.hp-=e.dmg*dt*2.5*enemyDmgMult();player.iframes=0.55;
      if (e.kind==='Glacial') player.slowTimer=2.5; // freeze on contact
    }
  }
  player.iframes=Math.max(0,player.iframes-dt);
  enemies=enemies.filter(e=>{
    if(e.hp<=0){
      gainXP(e.xp);kills++;playKillSound();
      if (e.kind==='Ember') {
        // Death explosion damages player and nearby enemies
        createExplosion(e.x,e.y,180,'#ff6600');
        if (Math.hypot(player.x-e.x,player.y-e.y)<180)
          player.hp=Math.max(0, player.hp-55*enemyDmgMult());
        for (const other of enemies)
          if (other !== e && Math.hypot(other.x-e.x,other.y-e.y)<180)
            other.hp=Math.max(0, other.hp-120);
      }
      return false;
    }
    return true;
  });

  // ── Enemy bullets
  for (const b of enemyBullets) {
    if (b.homing) {
      const hdx=player.x-b.x, hdy=player.y-b.y, hd=Math.hypot(hdx,hdy)||1;
      const spd=Math.hypot(b.vx,b.vy);
      b.vx+=(hdx/hd*spd-b.vx)*3.3*dt; b.vy+=(hdy/hd*spd-b.vy)*3.3*dt;
    }
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    if(b.life<=0||b.x<WALL||b.x>W-WALL||b.y<WALL||b.y>H-WALL){b.dead=true;continue;}
    if(player.iframes<=0&&Math.hypot(b.x-player.x,b.y-player.y)<PR+b.r){
      player.hp-=b.dmg*enemyDmgMult();player.iframes=0.4;b.dead=true;
      if(b.slow)   player.slowTimer=Math.max(player.slowTimer,b.slow);
      if(b.freeze) player.slowTimer=Math.max(player.slowTimer,b.freeze);
    }
  }
  enemyBullets=enemyBullets.filter(b=>!b.dead);

  // ── Buff spawning + pickup
  buffSpawnTimer-=dt;
  if (buffSpawnTimer<=0&&buffItems.length<3){
    buffSpawnTimer=22+Math.random()*14;
    const def=BUFF_DEFS[Math.floor(Math.random()*BUFF_DEFS.length)];
    const bp=randomBuffPos();
    buffItems.push({x:bp.x,y:bp.y,def,life:12,pulse:0});
  }
  buffItems=buffItems.filter(item=>{
    item.life-=dt;item.pulse+=dt*3;
    if(Math.hypot(player.x-item.x,player.y-item.y)<PR+26){
      if (item.def.instant) { triggerBomb(); }
      else { player.buffs[item.def.id]=item.def.dur; showNotif(`${item.def.name}!`,item.def.clr); }
      createExplosion(item.x,item.y,26,item.def.clr);
      return false;
    }
    return item.life>0;
  });

  // ── Explosions & beams
  explosions=explosions.filter(ex=>{ex.life-=dt;ex.r=ex.maxR*(1-ex.life/ex.maxLife);return ex.life>0;});
  beams=beams.filter(b=>{b.life-=dt;return b.life>0;});

  // ── Wave timer (no boss)
  if (!boss){
    if (enemies.length===0&&waveTimer>5) waveTimer=5;
    waveTimer-=dt;
    if (waveTimer<=0) spawnWave();
  }

  if (player.hp<=0){player.hp=0;state='dead';musicPause();music.currentTime=0;playGameOver();submitMyScore();}
}

// ── Draw helpers ──────────────────────────────────────────────────

// Overlays rim-shadow + specular highlight onto any circle to fake sphere depth.
// Call immediately after filling the base colour circle (ctx state is preserved).
function drawSphereShading(x, y, r) {
  // Rim darkening — transparent centre, dark edge
  const rim = ctx.createRadialGradient(x, y, r * 0.35, x, y, r);
  rim.addColorStop(0, 'rgba(0,0,0,0)');
  rim.addColorStop(1, 'rgba(0,0,0,0.52)');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
  // Specular highlight — offset toward top-left
  const hx = x - r * 0.28, hy = y - r * 0.28;
  const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.58);
  spec.addColorStop(0,   'rgba(255,255,255,0.62)');
  spec.addColorStop(0.45,'rgba(255,255,255,0.12)');
  spec.addColorStop(1,   'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill();
}

function drawFloor() {
  const z=getZone();
  for (let tx=WALL;tx<W-WALL;tx+=TILE)
    for (let ty=WALL;ty<H-WALL;ty+=TILE){
      ctx.fillStyle=(Math.floor((tx-WALL)/TILE)+Math.floor((ty-WALL)/TILE))%2===0?z.floor1:z.floor2;
      ctx.fillRect(tx,ty,Math.min(TILE,W-WALL-tx),Math.min(TILE,H-WALL-ty));
    }
  ctx.strokeStyle=z.grid;ctx.lineWidth=0.5;
  for (let tx=WALL;tx<=W-WALL;tx+=TILE){ctx.beginPath();ctx.moveTo(tx,WALL);ctx.lineTo(tx,H-WALL);ctx.stroke();}
  for (let ty=WALL;ty<=H-WALL;ty+=TILE){ctx.beginPath();ctx.moveTo(WALL,ty);ctx.lineTo(W-WALL,ty);ctx.stroke();}
}
function drawWalls() {
  const z=getZone();
  ctx.shadowBlur=0;
  ctx.fillStyle=z.wall;
  ctx.fillRect(0,0,W,WALL);ctx.fillRect(0,H-WALL,W,WALL);
  ctx.fillRect(0,0,WALL,H);ctx.fillRect(W-WALL,0,WALL,H);
  ctx.strokeStyle=z.wallBorder;ctx.lineWidth=2;ctx.strokeRect(WALL,WALL,W-WALL*2,H-WALL*2);
  ctx.strokeStyle=z.corner;ctx.lineWidth=2;
  for (const[cx,cy,sx,sy] of [[WALL,WALL,1,1],[W-WALL,WALL,-1,1],[WALL,H-WALL,1,-1],[W-WALL,H-WALL,-1,-1]]){
    const B=18;ctx.beginPath();ctx.moveTo(cx+sx*B,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+sy*B);ctx.stroke();
  }
}
function drawFurniture() {
  const z=getZone();
  for (const f of FURNITURE) {
    if (f.type==='pillar'){
      ctx.fillStyle=z.pillarFill; ctx.fillRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle=z.pillarStroke; ctx.lineWidth=1.5; ctx.strokeRect(f.x,f.y,f.w,f.h);
    } else if (f.type==='table'){
      ctx.fillStyle=z.tableFill; ctx.fillRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle=z.tableStroke; ctx.lineWidth=1.5; ctx.strokeRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle=z.tableDetail; ctx.lineWidth=1;
      for(let lx=f.x+12;lx<f.x+f.w-4;lx+=14){ctx.beginPath();ctx.moveTo(lx,f.y+6);ctx.lineTo(lx,f.y+f.h-6);ctx.stroke();}
    } else {
      ctx.fillStyle=z.pillarFill; ctx.fillRect(f.x,f.y,f.w,f.h);
      ctx.strokeStyle=z.pillarStroke; ctx.lineWidth=1.5; ctx.strokeRect(f.x,f.y,f.w,f.h);
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
  ctx.fillStyle='#fff';ctx.font='600 24px ui-sans-serif,sans-serif';ctx.textAlign='center';
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
    ctx.fillStyle=pad.clr; ctx.font='bold 46px ui-sans-serif,sans-serif';
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(pad.label, pad.x, pad.y-10);

    // Sub label
    const subText = hovered ? `${Math.ceil((PAD_HOLD-pad.timer)*10)/10}s…` : pad.sub;
    ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.font='22px ui-sans-serif,sans-serif';
    ctx.shadowBlur=0;
    ctx.fillText(subText, pad.x, pad.y+22);

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
  // Group by color for batched drawing
  const byClr = new Map();
  for (const b of enemyBullets) {
    const c = b.clr || '#ff3355';
    if (!byClr.has(c)) byClr.set(c, []);
    byClr.get(c).push(b);
  }
  for (const [clr, bs] of byClr) {
    ctx.globalAlpha=0.40; ctx.fillStyle=clr;
    for(const b of bs){ctx.beginPath();ctx.arc(b.x,b.y,b.r+4,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1; ctx.fillStyle=clr;
    for(const b of bs){ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();}
  }
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
    // Zone enemy: special alpha/outline before the fill
    if (e.kind==='Wraith') {
      // Phasing shimmer — pulse opacity
      ctx.globalAlpha=0.55+Math.sin(t*4+e.x)*0.3;
    } else if (e.kind==='Phantom') {
      ctx.globalAlpha=0.75+Math.sin(t*5)*0.2;
    } else {
      ctx.globalAlpha=1;
    }
    ctx.fillStyle=e.clr;
    ctx.beginPath();ctx.arc(e.x,e.y,e.r,0,Math.PI*2);ctx.fill();
    drawSphereShading(e.x, e.y, e.r);

    // Ember: inner fire core
    if (e.kind==='Ember') {
      ctx.globalAlpha=0.55+Math.sin(t*6)*0.3;
      ctx.fillStyle='#ffdd00';
      ctx.beginPath();ctx.arc(e.x,e.y,e.r*0.5,0,Math.PI*2);ctx.fill();
    }
    // Spitter: drip ring
    if (e.kind==='Spitter') {
      ctx.globalAlpha=0.4; ctx.strokeStyle='#00ff44'; ctx.lineWidth=2;
      ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+5,0,Math.PI*2);ctx.stroke();
      ctx.setLineDash([]);
    }
    // Glacial: icy shard ring
    if (e.kind==='Glacial') {
      ctx.globalAlpha=0.5; ctx.strokeStyle='#aaeeff'; ctx.lineWidth=1.5;
      for (let i=0;i<6;i++){
        const sa=(i/6)*Math.PI*2+t;
        ctx.beginPath();
        ctx.moveTo(e.x+Math.cos(sa)*(e.r+2),e.y+Math.sin(sa)*(e.r+2));
        ctx.lineTo(e.x+Math.cos(sa)*(e.r+8),e.y+Math.sin(sa)*(e.r+8));
        ctx.stroke();
      }
    }
    // Wraith: dashed ghost border
    if (e.kind==='Wraith') {
      ctx.globalAlpha=0.6; ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5;
      ctx.setLineDash([5,5]);
      ctx.beginPath();ctx.arc(e.x,e.y,e.r+3,0,Math.PI*2);ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.globalAlpha=1;
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
  const clr  = b.clr  || '#cc0033';
  const ring  = enr ? '#ff6600' : clr;
  ctx.save();
  // Outer aura glow
  ctx.globalAlpha=0.10+pulse*0.06; ctx.shadowColor=clr; ctx.shadowBlur=20; ctx.fillStyle=clr;
  ctx.beginPath();ctx.arc(b.x,b.y,b.r+30+pulse*12,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=0.30; ctx.shadowBlur=12;
  ctx.beginPath();ctx.arc(b.x,b.y,b.r+12,0,Math.PI*2);ctx.fill();
  // Rotating orbit rings
  ctx.save();ctx.translate(b.x,b.y);
  ctx.strokeStyle=ring;ctx.lineWidth=2.5;ctx.shadowColor=ring;ctx.shadowBlur=12;ctx.globalAlpha=0.85;
  ctx.rotate(t*(enr?4:1.8));ctx.setLineDash([12,9]);ctx.beginPath();ctx.arc(0,0,b.r+16,0,Math.PI*2);ctx.stroke();
  ctx.rotate(-(t*(enr?8:3.5)));ctx.globalAlpha=0.5;ctx.lineWidth=1.5;ctx.setLineDash([7,11]);
  ctx.beginPath();ctx.arc(0,0,b.r+26,0,Math.PI*2);ctx.stroke();
  ctx.setLineDash([]);ctx.restore();
  // Boss sphere
  ctx.globalAlpha=1;ctx.shadowColor=ring;ctx.shadowBlur=22;
  ctx.fillStyle=b.charging?'#ff8800':(enr?'#ff6600':clr);
  ctx.beginPath();ctx.arc(b.x,b.y,b.r,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0; drawSphereShading(b.x,b.y,b.r);
  // Eyes
  const eyeR=b.r*0.35,ea=b.angle;
  for(const side of[-0.42,0.42]){
    const ex=b.x+Math.cos(ea+side)*eyeR,ey=b.y+Math.sin(ea+side)*eyeR;
    ctx.fillStyle=enr?'#ff8800':'#ffffff';ctx.shadowColor='#ffffff';ctx.shadowBlur=8;ctx.globalAlpha=0.92;
    ctx.beginPath();ctx.arc(ex,ey,5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.shadowBlur=0;ctx.globalAlpha=1;
    ctx.beginPath();ctx.arc(ex+Math.cos(ea)*2,ey+Math.sin(ea)*2,2.5,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();
  // HP bar
  const bw=Math.max(b.r*4,140),bh=10,bx2=b.x-bw/2,by2=b.y-b.r-30;
  ctx.fillStyle='#1a0022';ctx.fillRect(bx2,by2,bw,bh);
  ctx.fillStyle=b.hp/b.maxHp>0.5?clr:'#ff6600';ctx.fillRect(bx2,by2,bw*(b.hp/b.maxHp),bh);
  ctx.strokeStyle=clr;ctx.lineWidth=1.5;ctx.strokeRect(bx2,by2,bw,bh);
  // Boss name label
  const label=(b.name||'BOSS')+(enr?' ★ ENRAGED':'');
  ctx.fillStyle=enr?'#ff8800':clr;ctx.font='bold 20px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.shadowColor=enr?'#ff8800':clr;ctx.shadowBlur=12;
  ctx.fillText(label,b.x,by2-6);ctx.shadowBlur=0;
}
function drawBuffItems() {
  for(const item of buffItems){
    const pulse=Math.sin(item.pulse)*0.5+0.5, fade=Math.min(1,item.life/2);
    ctx.save();ctx.globalAlpha=fade;ctx.shadowColor=item.def.clr;ctx.shadowBlur=14+pulse*10;ctx.fillStyle=item.def.clr;
    ctx.beginPath();ctx.arc(item.x,item.y,22+pulse*5,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(0,0,0,0.85)';ctx.shadowBlur=0;ctx.beginPath();ctx.arc(item.x,item.y,17,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=item.def.clr;ctx.font='bold 16px ui-sans-serif,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(item.def.name.slice(0,3),item.x,item.y);
    ctx.textBaseline='alphabetic';ctx.font='18px ui-sans-serif,sans-serif';ctx.shadowColor=item.def.clr;ctx.shadowBlur=6;
    ctx.fillText(item.def.name,item.x,item.y+24);ctx.restore();
  }
}
function drawBeams() {
  if (!beams?.length) return;
  ctx.save();
  for (const b of beams) {
    const alpha = b.life / b.maxLife;
    // Wide outer glow
    ctx.globalAlpha=alpha*0.22; ctx.strokeStyle=b.clr; ctx.lineWidth=22;
    ctx.shadowColor=b.clr; ctx.shadowBlur=18;
    ctx.beginPath(); ctx.moveTo(b.x1,b.y1); ctx.lineTo(b.x2,b.y2); ctx.stroke();
    // Mid colour core
    ctx.globalAlpha=alpha*0.85; ctx.lineWidth=5; ctx.shadowBlur=8;
    ctx.beginPath(); ctx.moveTo(b.x1,b.y1); ctx.lineTo(b.x2,b.y2); ctx.stroke();
    // White-hot centre line
    ctx.globalAlpha=alpha*0.9; ctx.strokeStyle='#ffffff'; ctx.lineWidth=1.5; ctx.shadowBlur=0;
    ctx.beginPath(); ctx.moveTo(b.x1,b.y1); ctx.lineTo(b.x2,b.y2); ctx.stroke();
  }
  ctx.restore();
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
// Draws weapon shape extending in aim direction (barrel behind player circle)
// angle is compass-style: sin(a)=dx, -cos(a)=dy
function drawWeapon(x, y, angle, weaponName, weaponClr, alpha=1) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle - Math.PI / 2); // +x now = forward aim direction
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.lineWidth = 1;
  const s = PR + 2; // barrel starts just outside player radius

  switch (weaponName) {
    case 'Pistol':
      ctx.fillStyle = weaponClr;
      ctx.fillRect(s, -2, 14, 4); ctx.strokeRect(s, -2, 14, 4);
      break;

    case 'Dual Pistols':
      ctx.fillStyle = weaponClr;
      ctx.fillRect(s, -6, 13, 3); ctx.strokeRect(s, -6, 13, 3);
      ctx.fillRect(s,  3, 13, 3); ctx.strokeRect(s,  3, 13, 3);
      break;

    case 'Shotgun':
      ctx.fillStyle = '#884422'; // grip
      ctx.fillRect(s-5, -3, 6, 7); ctx.strokeRect(s-5, -3, 6, 7);
      ctx.fillStyle = weaponClr;  // wide barrel
      ctx.fillRect(s, -4, 13, 8); ctx.strokeRect(s, -4, 13, 8);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; // barrel split
      ctx.beginPath(); ctx.moveTo(s, 0); ctx.lineTo(s+13, 0); ctx.stroke();
      break;

    case 'SMG':
      ctx.fillStyle = weaponClr;   // barrel
      ctx.fillRect(s, -2, 20, 4); ctx.strokeRect(s, -2, 20, 4);
      ctx.fillStyle = '#1155aa';   // magazine
      ctx.fillRect(s+3, 2, 7, 7); ctx.strokeRect(s+3, 2, 7, 7);
      break;

    case 'Rocket':
      ctx.fillStyle = weaponClr;    // main tube
      ctx.fillRect(s, -5, 22, 10); ctx.strokeRect(s, -5, 22, 10);
      ctx.fillStyle = 'rgba(255,100,0,0.55)'; // exhaust vent accent
      ctx.fillRect(s, -5, 5, 10);
      ctx.fillStyle = '#220000';    // dark muzzle hole
      ctx.beginPath(); ctx.arc(s+22, 0, 5, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = weaponClr; ctx.stroke();
      break;

    case 'Plasma':
      ctx.fillStyle = '#440055';   // dark base
      ctx.fillRect(s, -3, 30, 6); ctx.strokeRect(s, -3, 30, 6);
      ctx.fillStyle = weaponClr;   // bright overlay
      ctx.fillRect(s, -2, 30, 4);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(s, -2, 30, 4);
      ctx.fillStyle = '#ffffff';   // white-hot tip
      ctx.beginPath(); ctx.arc(s+31, 0, 4, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = weaponClr;
      ctx.beginPath(); ctx.arc(s+31, 0, 2.5, 0, Math.PI*2); ctx.fill();
      break;
  }
  ctx.restore();
}

function drawPlayerAvatar(x,y,angle,color,alpha=1,weaponName=null,weaponClr='#ffdd44') {
  if (weaponName) drawWeapon(x, y, angle, weaponName, weaponClr, alpha);
  ctx.save();
  ctx.globalAlpha=alpha*0.22;ctx.shadowColor='#00ffaa';ctx.shadowBlur=22;ctx.fillStyle='#00ffaa';
  ctx.beginPath();ctx.arc(x,y,PR+6,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=alpha;ctx.shadowColor=color;ctx.shadowBlur=12;ctx.fillStyle=color;
  ctx.beginPath();ctx.arc(x,y,PR,0,Math.PI*2);ctx.fill();
  ctx.shadowBlur=0; drawSphereShading(x, y, PR);
  const dotX=x+Math.sin(angle)*(PR-4),dotY=y-Math.cos(angle)*(PR-4);
  ctx.fillStyle='rgba(255,255,255,0.88)';ctx.shadowColor='#fff';ctx.shadowBlur=6;ctx.globalAlpha=alpha*0.85;
  ctx.beginPath();ctx.arc(dotX,dotY,3.5,0,Math.PI*2);ctx.fill();
  ctx.restore();
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
  ctx.fillStyle='#ffdd44';ctx.font='bold 24px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.fillText(enemies.length===0&&sec<=5?`Next wave: ${sec}s`:`Wave ${wave}`,cx,cy+5);
}

// ── HUD ───────────────────────────────────────────────────────────
function drawHUD() {
  const w=getWeapon(player.level);
  const bx=WALL+12,by=H-WALL-140,bw=230,bh=14;

  ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(bx,by,bw,bh);
  ctx.fillStyle=player.iframes>0?'#ff8899':'#ff4455';ctx.fillRect(bx,by,bw*(player.hp/player.maxHp),bh);
  ctx.strokeStyle='#ff8899';ctx.lineWidth=1;ctx.strokeRect(bx,by,bw,bh);
  ctx.fillStyle='#fff';ctx.font='20px ui-sans-serif,sans-serif';ctx.textAlign='left';
  ctx.fillText(`HP  ${Math.ceil(player.hp)} / ${player.maxHp}`,bx+4,by+11);

  const xby=by+bh+8;
  ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fillRect(bx,xby,bw,bh);
  ctx.fillStyle='#aa44ff';ctx.fillRect(bx,xby,bw*(player.xp/xpToNext(player.level)),bh);
  ctx.strokeStyle='#cc88ff';ctx.lineWidth=1;ctx.strokeRect(bx,xby,bw,bh);
  ctx.fillStyle='#fff';ctx.fillText(`LV ${player.level}  XP ${player.xp}/${xpToNext(player.level)}`,bx+4,xby+11);

  const wby=xby+bh+12;
  ctx.fillStyle=w.clr;ctx.shadowColor=w.clr;ctx.shadowBlur=6;ctx.font='bold 22px ui-sans-serif,sans-serif';
  ctx.fillText(`⚔ ${w.name}`,bx,wby+12);ctx.shadowBlur=0;
  const next=WEAPONS.find(wp=>wp.lv>player.level);
  if(next){ctx.fillStyle='rgba(255,255,255,0.4)';ctx.font='20px ui-sans-serif,sans-serif';ctx.fillText(`Next: ${next.name} @ Lv${next.lv}`,bx,wby+26);}

  let buffDrawX=bx;const buffDrawY=wby+46;
  for(const[id,timer] of Object.entries(player.buffs)){
    if(timer<=0)continue;
    const def=BUFF_DEFS.find(d=>d.id===id);if(!def)continue;
    ctx.save();ctx.shadowColor=def.clr;ctx.shadowBlur=8;ctx.globalAlpha=0.85;
    ctx.fillStyle=def.clr;ctx.beginPath();ctx.arc(buffDrawX+8,buffDrawY,8,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#000';ctx.shadowBlur=0;ctx.globalAlpha=1;
    ctx.font='bold 14px ui-sans-serif,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.fillText(id[0].toUpperCase(),buffDrawX+8,buffDrawY);ctx.textBaseline='alphabetic';
    ctx.fillStyle=def.clr;ctx.globalAlpha=0.55;ctx.fillRect(buffDrawX+20,buffDrawY-4,40*(timer/def.dur),8);
    ctx.strokeStyle=def.clr;ctx.lineWidth=1;ctx.globalAlpha=0.35;ctx.strokeRect(buffDrawX+20,buffDrawY-4,40,8);
    ctx.fillStyle=def.clr;ctx.font='18px ui-sans-serif,sans-serif';ctx.textAlign='left';ctx.globalAlpha=1;
    ctx.fillText(`${def.name} ${Math.ceil(timer)}s`,buffDrawX+64,buffDrawY+3);ctx.restore();
    buffDrawX+=138;
  }

  ctx.fillStyle='rgba(255,255,255,0.8)';ctx.font='bold 24px ui-sans-serif,sans-serif';ctx.textAlign='right';
  ctx.fillText(boss?`BOSS ${Math.ceil(boss.hp*100/boss.maxHp)}%`:`Wave ${wave}`,W-WALL-12,WALL+26);
  ctx.fillText(`Kills ${kills}`,W-WALL-12,WALL+52);
  if(!boss)ctx.fillText(`${enemies.length} left`,W-WALL-12,WALL+78);

  drawWaveCountdown();

  ctx.save();ctx.strokeStyle='rgba(0,220,255,0.65)';ctx.lineWidth=1.5;const cs=10;
  ctx.beginPath();ctx.moveTo(mouseX-cs,mouseY);ctx.lineTo(mouseX+cs,mouseY);ctx.stroke();
  ctx.beginPath();ctx.moveTo(mouseX,mouseY-cs);ctx.lineTo(mouseX,mouseY+cs);ctx.stroke();
  ctx.beginPath();ctx.arc(mouseX,mouseY,3.5,0,Math.PI*2);ctx.stroke();ctx.restore();

  if(notifT>0){
    ctx.save();ctx.globalAlpha=Math.min(1,notifT);ctx.fillStyle=notifClr;ctx.shadowColor=notifClr;ctx.shadowBlur=18;
    ctx.font='bold 42px ui-sans-serif,sans-serif';ctx.textAlign='center';
    ctx.fillText(notif,W/2,WALL+52);ctx.restore();
  }
}

// ── Screens ───────────────────────────────────────────────────────
function drawButton(label,cx,cy,glowColor) {
  ctx.save();ctx.shadowColor=glowColor;ctx.shadowBlur=20;
  ctx.fillStyle='rgba(10,5,20,0.92)';ctx.strokeStyle=glowColor;ctx.lineWidth=2;
  ctx.beginPath();ctx.rect(cx-BTN_W/2,cy-BTN_H/2,BTN_W,BTN_H);ctx.fill();ctx.stroke();
  ctx.fillStyle=glowColor;ctx.font='bold 30px ui-sans-serif,sans-serif';
  ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(label,cx,cy);
  ctx.restore();ctx.textBaseline='alphabetic';
}

function drawSettings() {
  // ── Background ────────────────────────────────────────────────
  ctx.fillStyle='rgba(8,3,18,0.94)'; ctx.fillRect(0,0,W,H);

  // ── Title ─────────────────────────────────────────────────────
  ctx.save();
  ctx.shadowColor='#c64bff'; ctx.shadowBlur=28;
  ctx.fillStyle='#f4f4ff'; ctx.font='bold 90px ui-sans-serif,sans-serif';
  ctx.textAlign='center'; ctx.fillText('SETTINGS', W/2, H/2-230);
  ctx.restore();

  // ── Tabs ──────────────────────────────────────────────────────
  const tabs = [{id:'audio',label:'AUDIO'},{id:'display',label:'DISPLAY'},{id:'keybinds',label:'KEYBINDS'}];
  const tabCXs = [W/2-240, W/2, W/2+240];
  const ty = H/2-155;
  tabs.forEach(({id,label},i) => {
    const active = settingsTab===id;
    const clr = active ? '#c64bff' : 'rgba(255,255,255,0.35)';
    ctx.save();
    ctx.shadowColor=clr; ctx.shadowBlur=active?16:0;
    ctx.strokeStyle=clr; ctx.lineWidth=2;
    ctx.fillStyle=active?'rgba(198,75,255,0.12)':'rgba(255,255,255,0.04)';
    ctx.beginPath(); ctx.rect(tabCXs[i]-110,ty-24,220,48); ctx.fill(); ctx.stroke();
    ctx.fillStyle=clr; ctx.font=`bold 26px ui-sans-serif,sans-serif`;
    ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(label, tabCXs[i], ty);
    ctx.restore(); ctx.textBaseline='alphabetic';
  });

  // ── Divider ───────────────────────────────────────────────────
  ctx.strokeStyle='rgba(255,255,255,0.12)'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(W/2-450,H/2-110); ctx.lineTo(W/2+450,H/2-110); ctx.stroke();

  // ── Tab content ───────────────────────────────────────────────
  if (settingsTab === 'audio') {
    // Helper to draw one slider row
    function drawSlider(label, value, sliderY) {
      const lx = SET_SL_CX-SET_SL_W/2;
      ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font='bold 26px ui-sans-serif,sans-serif';
      ctx.textAlign='left'; ctx.fillText(label, lx, sliderY-18);
      ctx.textAlign='right'; ctx.fillText(`${Math.round(value*100)}%`, SET_SL_CX+SET_SL_W/2, sliderY-18);
      // Track
      ctx.fillStyle='rgba(255,255,255,0.14)'; ctx.fillRect(lx, sliderY-5, SET_SL_W, 10);
      // Fill
      ctx.save(); ctx.shadowColor='#c64bff'; ctx.shadowBlur=8;
      ctx.fillStyle='#c64bff'; ctx.fillRect(lx, sliderY-5, SET_SL_W*value, 10);
      // Knob
      const kx=lx+SET_SL_W*value;
      ctx.fillStyle='#ffffff'; ctx.beginPath(); ctx.arc(kx, sliderY, 11, 0, Math.PI*2); ctx.fill();
      ctx.restore();
    }
    drawSlider('MUSIC VOLUME', musicVolume, SET_MUS_Y);
    drawSlider('SFX VOLUME',   sfxVolume,   SET_SFX_Y);
  }

  if (settingsTab === 'display') {
    ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font='bold 26px ui-sans-serif,sans-serif';
    ctx.textAlign='center'; ctx.fillText('SCREEN SCALE', W/2, H/2-60);
    const scaleOpts = [['50%',0.5],['75%',0.75],['100%',1.0]];
    const scaleCXs  = [W/2-200, W/2, W/2+200];
    scaleOpts.forEach(([label,val],i) => {
      const active = Math.abs(screenScale-val)<0.01;
      const clr = active ? '#44ff88' : 'rgba(255,255,255,0.4)';
      ctx.save();
      ctx.shadowColor=clr; ctx.shadowBlur=active?16:0;
      ctx.strokeStyle=clr; ctx.lineWidth=2;
      ctx.fillStyle=active?'rgba(68,255,136,0.12)':'rgba(255,255,255,0.05)';
      ctx.beginPath(); ctx.rect(scaleCXs[i]-BTN_W/2,H/2+30-BTN_H/2,BTN_W,BTN_H); ctx.fill(); ctx.stroke();
      ctx.fillStyle=clr; ctx.font='bold 28px ui-sans-serif,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle'; ctx.fillText(label, scaleCXs[i], H/2+30);
      ctx.restore(); ctx.textBaseline='alphabetic';
    });
    // Resolution note
    ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='20px ui-sans-serif,sans-serif';
    ctx.textAlign='center';
    ctx.fillText(`Rendered at 1920×1080 — displayed at ${Math.round(W*screenScale)}×${Math.round(H*screenScale)}`, W/2, H/2+110);
  }

  if (settingsTab === 'keybinds') {
    KEYBIND_ROWS.forEach((row,i) => {
      const ry = H/2-100+i*56;
      const isCapturing = _rebinding===row.action;
      // Row label
      ctx.fillStyle='rgba(255,255,255,0.75)'; ctx.font='bold 26px ui-sans-serif,sans-serif';
      ctx.textAlign='left'; ctx.fillText(row.label, W/2-260, ry+9);
      // Key button
      const btnClr = isCapturing ? '#ffdd44' : '#c64bff';
      ctx.save();
      ctx.shadowColor=btnClr; ctx.shadowBlur=isCapturing?20:8;
      ctx.strokeStyle=btnClr; ctx.lineWidth=2;
      ctx.fillStyle=isCapturing?'rgba(255,221,68,0.15)':'rgba(198,75,255,0.1)';
      ctx.beginPath(); ctx.rect(W/2+80,ry-22,200,44); ctx.fill(); ctx.stroke();
      ctx.fillStyle=btnClr; ctx.font='bold 24px ui-sans-serif,sans-serif';
      ctx.textAlign='center'; ctx.textBaseline='middle';
      ctx.fillText(isCapturing ? 'PRESS KEY…' : keyDisplayName(BINDS[row.action]), W/2+180, ry);
      ctx.restore(); ctx.textBaseline='alphabetic';
    });
    ctx.fillStyle='rgba(255,255,255,0.3)'; ctx.font='20px ui-sans-serif,sans-serif';
    ctx.textAlign='center'; ctx.fillText('Click a key button, then press any key to rebind  ·  ESC cancels', W/2, H/2+200);
  }

  // ── BACK button ───────────────────────────────────────────────
  drawButton('BACK', W/2, H/2+290, '#aaaaaa');
}

function drawMenuOverlay() {
  // Translucent header overlay — arena/world is visible behind it
  ctx.save();
  ctx.fillStyle='rgba(8,3,18,0.65)';ctx.fillRect(WALL,WALL,W-WALL*2,H*0.48);
  ctx.shadowColor='#c64bff';ctx.shadowBlur=36;ctx.fillStyle='#f4f4ff';
  ctx.font='bold 148px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.fillText('SPHEROCIDE',W/2,H*0.18);
  ctx.fillStyle='#c64bff';ctx.font='32px ui-sans-serif,sans-serif';ctx.shadowBlur=0;
  ctx.fillText('Survive the waves  ·  level up  ·  beat the leaderboard',W/2,H*0.24);
  ctx.fillStyle='rgba(255,255,255,0.45)';ctx.font='24px ui-sans-serif,sans-serif';
  ctx.fillText('WASD to move  ·  Mouse to aim  ·  Click or Space to shoot',W/2,H*0.28);
  // Weapon tier row  (Lv label + name, 22px gap between)
  const startX=W/2-(WEAPONS.length*130)/2+65;
  for(let i=0;i<WEAPONS.length;i++){
    const ww=WEAPONS[i];
    ctx.fillStyle=ww.clr;ctx.shadowColor=ww.clr;ctx.shadowBlur=8;ctx.font='bold 22px ui-sans-serif,sans-serif';ctx.textAlign='center';
    ctx.fillText(`Lv${ww.lv}`,startX+i*130,H*0.33);
    ctx.shadowBlur=0;ctx.fillStyle='rgba(255,255,255,0.65)';ctx.font='20px ui-sans-serif,sans-serif';
    ctx.fillText(ww.name,startX+i*130,H*0.33+22);
  }
  // Buff row — placed 38px below weapon name row bottom to avoid overlap
  const bStartX=W/2-(BUFF_DEFS.length*140)/2+70;
  for(let i=0;i<BUFF_DEFS.length;i++){
    const bd=BUFF_DEFS[i];
    ctx.fillStyle=bd.clr;ctx.shadowColor=bd.clr;ctx.shadowBlur=6;ctx.font='bold 20px ui-sans-serif,sans-serif';ctx.textAlign='center';
    ctx.fillText(`★ ${bd.name}`,bStartX+i*140,H*0.41);
  }
  ctx.restore();

  // Walk-on pads drawn on the floor (lower half of arena)
  drawWalkPads();

  // Portals active in lobby
  drawPortal(exitPortal);
  if(returnPortal) drawPortal(returnPortal);

  // Player in lobby
  { const pw=getWeapon(player.level); const col=player.slowTimer>0?'#88ddff':player.color; drawPlayerAvatar(player.x,player.y,player.angle,col,1,pw.name,pw.clr); }

  if(notifT>0){
    ctx.save();ctx.globalAlpha=Math.min(1,notifT);ctx.fillStyle=notifClr;ctx.shadowColor=notifClr;ctx.shadowBlur=18;
    ctx.font='bold 42px ui-sans-serif,sans-serif';ctx.textAlign='center';
    ctx.fillText(notif,W/2,WALL+52);ctx.restore();
  }
}

// ── Leaderboard panel ─────────────────────────────────────────────
function drawLeaderboard(cx, cy, title='LEADERBOARD') {
  const entries = mergedLeaderboard();
  const panelW  = 560, rowH = 36;
  const rows    = Math.min(entries.length, 10);
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
  ctx.font='bold 36px ui-sans-serif,sans-serif'; ctx.textAlign='center';
  ctx.fillText(title, cx, py+38);

  // Column headers
  ctx.fillStyle='rgba(255,255,255,0.35)'; ctx.font='20px ui-sans-serif,sans-serif';
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
    ctx.fillStyle='rgba(255,255,255,0.4)'; ctx.font='24px ui-sans-serif,sans-serif';
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
    ctx.fillText((e.score ?? 0).toLocaleString(), col.score, ry);

    // Wave, kills, level
    ctx.fillStyle='rgba(255,255,255,0.6)'; ctx.font='21px ui-sans-serif,sans-serif';
    ctx.fillText(e.wave  ?? '-', col.wave,  ry);
    ctx.fillText(e.kills ?? '-', col.kills, ry);
    ctx.fillText(e.level ?? '-', col.lv,    ry);
  }

  // Footnote
  ctx.fillStyle='rgba(255,255,255,0.25)'; ctx.font='18px ui-sans-serif,sans-serif';
  ctx.textAlign='center';
  ctx.fillText('Score = wave×500 + kills×50 + level×100  ·  includes live players in this room', cx, py+panelH-8);

  ctx.restore();
}

function drawPauseScreen() {
  // Dim the frozen game world behind the overlay
  ctx.fillStyle='rgba(8,3,18,0.72)'; ctx.fillRect(0,0,W,H);

  // ── Title – full-width centre so it bridges both columns
  // baseline y = H/2-110
  ctx.save();
  ctx.shadowColor='#c64bff'; ctx.shadowBlur=28;
  ctx.fillStyle='#f4f4ff'; ctx.font='bold 110px ui-sans-serif,sans-serif';
  ctx.textAlign='center'; ctx.fillText('PAUSED', W/2, H/2-110);
  ctx.restore();

  // Stats line – baseline y = H/2-52  (≈58px below title baseline, clear of descenders)
  ctx.fillStyle='rgba(255,255,255,0.55)'; ctx.font='28px ui-sans-serif,sans-serif';
  ctx.textAlign='center';
  ctx.fillText(`Wave ${wave}  ·  Level ${player.level}  ·  ${kills} kills`, W/2, H/2-52);

  // RESUME   button
  drawButton('RESUME',   W/2-200, H/2+14,  '#44ff88');
  // SETTINGS button
  drawButton('SETTINGS', W/2-200, H/2+82,  '#c64bff');
  // END GAME button
  drawButton('END GAME', W/2-200, H/2+150, '#ff4455');

  // Leaderboard – bottom-right corner, clear of all left-column text
  // panelH (10 rows) = 460px  →  cy = H - WALL - 240 keeps bottom edge ≤ H-WALL
  drawLeaderboard(W - 320, H - WALL - 240, 'LEADERBOARD');
}

function drawDeadScreen() {
  ctx.fillStyle='rgba(8,3,18,0.88)';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.shadowColor='#ff4455';ctx.shadowBlur=30;
  ctx.fillStyle='#ff4455';ctx.font='bold 110px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.fillText('GAME OVER',W/2,H/2-80);ctx.restore();
  ctx.fillStyle='rgba(255,255,255,0.75)';ctx.font='32px ui-sans-serif,sans-serif';ctx.textAlign='center';
  const sc = calcScore(wave, kills, player.level);
  ctx.fillStyle='rgba(255,255,255,0.75)';ctx.font='32px ui-sans-serif,sans-serif';ctx.textAlign='center';
  ctx.fillText(`Level ${player.level}  ·  ${kills} kills  ·  Wave ${wave}  ·  Score ${sc.toLocaleString()}`,W/2,H/2-26);
  drawButton('PLAY AGAIN',W/2-200, H/2+58,  '#44ff88');
  drawButton('MAIN MENU', W/2-200, H/2+124, '#aaaaaa');
  // Leaderboard – bottom-right corner
  drawLeaderboard(W - 320, H - WALL - 240, 'LEADERBOARD');
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
    drawBeams();
    drawEnemyBullets();
    drawEnemies();
    drawBoss(boss);
    if(player.iframes<=0||Math.floor(t*10)%2===0)
      { const pw=getWeapon(player.level); const col=player.slowTimer>0?'#88ddff':player.color; drawPlayerAvatar(player.x,player.y,player.angle,col,1,pw.name,pw.clr); }
    drawHUD();
  } else if (state==='menu') {
    drawMenuOverlay();
    if (showScores) drawLeaderboard(W/2, H*0.5, 'LEADERBOARD');
  } else if (state==='paused') {
    drawPauseScreen();
  } else if (state==='dead') {
    drawDeadScreen();
  } else if (state==='settings') {
    drawSettings();
  }
}

// ── Loop ──────────────────────────────────────────────────────────
let last=performance.now();
let _errFrames=0; // consecutive error frames — stop loop only if truly unrecoverable
function loop(now){
  const dt=Math.min(0.05,(now-last)/1000);last=now;
  try {
    update(dt);
    render();
    _errFrames=0; // clear on successful frame
  } catch(err) {
    _errFrames++;
    console.error('[arena] loop error:', err);
    try {
      ctx.fillStyle='#0a0514'; ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ff4455'; ctx.font='bold 46px ui-sans-serif,sans-serif';
      ctx.textAlign='center';
      ctx.fillText('ERROR — check console', W/2, H/2-20);
      ctx.fillStyle='rgba(255,255,255,0.7)'; ctx.font='24px monospace';
      ctx.fillText(String(err).slice(0,120), W/2, H/2+16);
    } catch(_) {}
    // Keep the loop alive so buttons/Escape still work.
    // Only stop if errors are completely unrelenting (500+ frames = ~8s).
    if (_errFrames > 500) return;
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
