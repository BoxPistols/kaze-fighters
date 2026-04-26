// ============================================================
// KAZE FIGHTERS - 2D Fighting Game (Complete Edition)
// 風のファイターズ 完全版
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// === RESPONSIVE CANVAS ===
let W = 960, H = 540, SCALE = 1;

function resizeCanvas() {
  const cw = window.innerWidth, ch = window.innerHeight;
  const aspect = 16 / 9;
  let w, h;
  if (cw / ch > aspect) { h = ch; w = h * aspect; }
  else { w = cw; h = w / aspect; }
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = W;
  canvas.height = H;
  SCALE = w / W;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// === CONSTANTS ===
const GROUND_Y = 440;
const GRAVITY = 0.7;
const STAGE_LEFT = 40;
const STAGE_RIGHT = W - 40;
const ROUND_TIME = 60;
const ROUNDS_TO_WIN = 2;
const HITSTOP_FRAMES = 6;
const SHAKE_DECAY = 0.85;
const DASH_SPEED = 10;
const DASH_DURATION = 12;
const BACKSTEP_SPEED = 7;
const BACKSTEP_DURATION = 14;
const THROW_RANGE = 60;
const DOUBLETAP_WINDOW = 12;
const MAX_PARTICLES = 200;

// === RENDERING FX HELPERS (CG 調仕上げ用) ===
// 色操作: hex → rgb 変換と明暗調整
function _hexToRgb(hex){
  const c=hex.replace('#','');
  if(c.length===3) return [parseInt(c[0]+c[0],16),parseInt(c[1]+c[1],16),parseInt(c[2]+c[2],16)];
  return [parseInt(c.slice(0,2),16),parseInt(c.slice(2,4),16),parseInt(c.slice(4,6),16)];
}
function _toRgba(color,a){
  if(color.startsWith('rgba')||color.startsWith('rgb')) return color.replace(/rgba?\(([^)]+)\)/,(m,v)=>{
    const p=v.split(',').map(s=>s.trim()); return `rgba(${p[0]},${p[1]},${p[2]},${a})`;
  });
  const [r,g,b]=_hexToRgb(color); return `rgba(${r},${g},${b},${a})`;
}
function _shade(color,amt){
  const [r,g,b]=_hexToRgb(color);
  if(amt>=0){const t=amt;return `rgb(${Math.min(255,Math.round(r+(255-r)*t))},${Math.min(255,Math.round(g+(255-g)*t))},${Math.min(255,Math.round(b+(255-b)*t))})`;}
  const t=1+amt; return `rgb(${Math.max(0,Math.round(r*t))},${Math.max(0,Math.round(g*t))},${Math.max(0,Math.round(b*t))})`;
}

const FX = {
  rgba:_toRgba, lighten:(c,a)=>_shade(c,a), darken:(c,a)=>_shade(c,-a),
  // 角丸矩形パス
  roundRect(ctx,x,y,w,h,r){
    const rr=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr,y);ctx.lineTo(x+w-rr,y);ctx.quadraticCurveTo(x+w,y,x+w,y+rr);
    ctx.lineTo(x+w,y+h-rr);ctx.quadraticCurveTo(x+w,y+h,x+w-rr,y+h);
    ctx.lineTo(x+rr,y+h);ctx.quadraticCurveTo(x,y+h,x,y+h-rr);
    ctx.lineTo(x,y+rr);ctx.quadraticCurveTo(x,y,x+rr,y);
    ctx.closePath();
  },
  // グロー付きで描画
  withGlow(ctx,color,blur,fn){
    ctx.save();ctx.shadowColor=color;ctx.shadowBlur=blur;fn();ctx.restore();
  },
  // 縦方向グラデ（上=明、下=暗）
  vGrad(ctx,base,x,y,h,topAmt=0.35,botAmt=0.45){
    const g=ctx.createLinearGradient(x,y,x,y+h);
    g.addColorStop(0,_shade(base,topAmt));
    g.addColorStop(0.45,base);
    g.addColorStop(1,_shade(base,-botAmt));
    return g;
  },
  // 横方向ライティング（右肩から光が当たる想定）
  hGrad(ctx,base,x,y,w,dir=1){
    const g=ctx.createLinearGradient(x-w/2,y,x+w/2,y);
    if(dir>=0){g.addColorStop(0,_shade(base,-0.35));g.addColorStop(0.5,base);g.addColorStop(1,_shade(base,0.25));}
    else{g.addColorStop(0,_shade(base,0.25));g.addColorStop(0.5,base);g.addColorStop(1,_shade(base,-0.35));}
    return g;
  },
  // 球体ライティング（立体感のあるラジアル）
  sphereGrad(ctx,base,cx,cy,r,lightX=-0.4,lightY=-0.4){
    const g=ctx.createRadialGradient(cx+r*lightX,cy+r*lightY,r*0.1,cx,cy,r*1.1);
    g.addColorStop(0,_shade(base,0.45));
    g.addColorStop(0.55,base);
    g.addColorStop(1,_shade(base,-0.55));
    return g;
  },
  // 楕円ドロップシャドウ
  groundShadow(ctx,x,y,w,a=0.45){
    ctx.save();ctx.fillStyle=`rgba(0,0,0,${a})`;ctx.filter='blur(2px)';
    ctx.beginPath();ctx.ellipse(x,y,w*0.55,w*0.18,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
  },
  // ガラス調パネル
  glass(ctx,x,y,w,h,r=8,tint='rgba(20,30,55,0.55)',border='rgba(160,200,255,0.35)'){
    ctx.save();
    FX.roundRect(ctx,x,y,w,h,r);
    ctx.fillStyle=tint;ctx.fill();
    // 上部ハイライト
    const g=ctx.createLinearGradient(0,y,0,y+h*0.5);
    g.addColorStop(0,'rgba(255,255,255,0.15)');g.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=g;FX.roundRect(ctx,x,y,w,h*0.5,r);ctx.fill();
    // ボーダー
    ctx.strokeStyle=border;ctx.lineWidth=1.2;FX.roundRect(ctx,x,y,w,h,r);ctx.stroke();
    ctx.restore();
  }
};

// === PERSISTENCE (localStorage) ===
const Storage = {
  _key: 'kazeFighters',
  load() {
    try { return JSON.parse(localStorage.getItem(this._key)) || this._default(); }
    catch { return this._default(); }
  },
  save(data) {
    try { localStorage.setItem(this._key, JSON.stringify(data)); } catch {}
  },
  _default() {
    return { playerName: '', totalWins: 0, totalLosses: 0, totalKOs: 0,
             bestTime: null, matchHistory: [], storyCompleted: {},
             settings: defaultSettings() };
  }
};

// === 設定モデル ===
const DIFFICULTIES = {
  easy:   { id:'easy',   label:'EASY',   nameJp:'初心者', value:0.30, color:'#44cc66' },
  normal: { id:'normal', label:'NORMAL', nameJp:'普通',   value:0.60, color:'#44aaff' },
  hard:   { id:'hard',   label:'HARD',   nameJp:'熟練',   value:0.85, color:'#ffaa44' },
  expert: { id:'expert', label:'EXPERT', nameJp:'達人',   value:1.00, color:'#ff5544' },
};
const CONTROL_SCHEMES = {
  standard: { id:'standard', label:'標準',         desc:'5ボタン: 軽/重/必殺/投げ/防御' },
  simple:   { id:'simple',   label:'シンプル',     desc:'攻撃1ボタン+方向で技分岐' },
  dpad:     { id:'dpad',     label:'十字キー中心', desc:'方向キーだけで攻撃可能、補助2ボタン' },
};
const DEFAULT_KEYBINDS_P1 = {
  up:'ArrowUp', down:'ArrowDown', left:'ArrowLeft', right:'ArrowRight',
  light:'Space', heavy:'ShiftLeft', special:'KeyZ', throw_btn:'KeyX', guard:'KeyC',
  attack:'Space', // 簡易/十字モードの汎用攻撃ボタン
};
const DEFAULT_KEYBINDS_P2 = {
  up:'KeyW', down:'KeyS', left:'KeyA', right:'KeyD',
  light:'KeyU', heavy:'KeyI', special:'KeyO', throw_btn:'KeyP', guard:'KeyH',
  attack:'KeyU',
};
function defaultSettings(){
  return {
    difficulty:'normal',
    controlScheme:'standard',
    keybinds:{ p1:{...DEFAULT_KEYBINDS_P1}, p2:{...DEFAULT_KEYBINDS_P2} },
    gamepadEnabled:true,
  };
}

let saveData = Storage.load();
// 古いデータの移行（settings 欠落時にデフォルトを補完）
if(!saveData.settings) saveData.settings = defaultSettings();
else {
  const ds=defaultSettings();
  if(!saveData.settings.keybinds) saveData.settings.keybinds=ds.keybinds;
  else {
    for(const p of ['p1','p2']){
      if(!saveData.settings.keybinds[p]) saveData.settings.keybinds[p]={...ds.keybinds[p]};
      else for(const k in ds.keybinds[p]) if(!saveData.settings.keybinds[p][k]) saveData.settings.keybinds[p][k]=ds.keybinds[p][k];
    }
  }
  for(const k of ['difficulty','controlScheme','gamepadEnabled']) if(saveData.settings[k]===undefined) saveData.settings[k]=ds[k];
}

const STATE = {
  TITLE: 'title', NAME_INPUT: 'name_input',
  SELECT: 'select', STORY_INTRO: 'story_intro',
  DIALOGUE: 'dialogue', INTRO: 'intro',
  FIGHTING: 'fighting', ROUND_END: 'round_end',
  MATCH_END: 'match_end', STORY_END: 'story_end',
  TOURNAMENT_BRACKET: 'tournament_bracket', TOURNAMENT_RESULT: 'tournament_result',
  TOURNAMENT_CHAMPION: 'tournament_champion',
  SETTINGS: 'settings'
};

const FSTATE = {
  IDLE: 'idle', WALK_F: 'walk_f', WALK_B: 'walk_b',
  JUMP: 'jump', CROUCH: 'crouch', ATTACK: 'attack',
  HIT: 'hit', KNOCKDOWN: 'knockdown', BLOCK: 'block',
  DASH_F: 'dash_f', DASH_B: 'dash_b',
  THROW: 'throw', THROWN: 'thrown',
  VICTORY: 'victory', DEFEAT: 'defeat'
};

// === AUDIO ENGINE (data-driven) ===
// Sound definitions: [waveform, freqStart, freqEnd, duration, volume, noiseDur, noiseVol]
const SFX_DEFS = {
  punch_light: {osc:[['square',200,80,0.1,0.3]],noise:[0.06,0.15]},
  punch_heavy: {osc:[['sawtooth',150,40,0.2,0.4]],noise:[0.1,0.25]},
  kick_light: {osc:[['triangle',300,100,0.1,0.25]]},
  kick_heavy: {osc:[['sawtooth',250,50,0.25,0.35]],noise:[0.08,0.2]},
  uppercut: {osc:[['sawtooth',100,500,0.2,0.35]],noise:[0.1,0.3]},
  sweep: {osc:[['triangle',400,80,0.2,0.3]],noise:[0.08,0.2]},
  dash: {osc:[['sine',300,600,0.1,0.12]]},
  divekick: {osc:[['sawtooth',500,150,0.2,0.3]],noise:[0.08,0.2]},
  block: {osc:[['square',800,400,0.08,0.15]]},
  select: {osc:[['sine',600,800,0.15,0.2]]},
  text: {osc:[['sine',440,440,0.04,0.05]]},
  fireball: {osc:[['sine',600,200,0.45,0.2]],noise:[0.05,0.15]},
};

const AudioEngine = {
  ctx: null,
  init() { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); },
  ensure() { if (!this.ctx) this.init(); if (this.ctx.state === 'suspended') this.ctx.resume(); },

  play(type) {
    this.ensure();
    const c = this.ctx, now = c.currentTime;
    const def = SFX_DEFS[type];

    if (def) {
      const g = c.createGain(); g.connect(c.destination);
      for (const [wave,f0,f1,dur,vol] of def.osc) {
        const o = c.createOscillator();
        o.type = wave;
        o.frequency.setValueAtTime(f0, now);
        if (f0 !== f1) o.frequency.exponentialRampToValueAtTime(Math.max(f1,1), now + dur * 0.8);
        g.gain.setValueAtTime(vol, now);
        g.gain.exponentialRampToValueAtTime(0.001, now + dur);
        o.connect(g); o.start(now); o.stop(now + dur);
      }
      if (def.noise) this._noise(g, now, def.noise[0], def.noise[1]);
      return;
    }

    // Complex sounds that need custom logic
    const g = c.createGain(); g.connect(c.destination);
    if (type === 'throw') {
      for(let i=0;i<2;i++){const o=c.createOscillator(),tg=c.createGain(),t=now+i*0.15;
        o.type='square';o.frequency.setValueAtTime(180-i*60,t);o.frequency.exponentialRampToValueAtTime(60,t+0.15);
        tg.gain.setValueAtTime(0.3,t);tg.gain.exponentialRampToValueAtTime(0.001,t+0.2);
        o.connect(tg);tg.connect(c.destination);o.start(t);o.stop(t+0.25);}
      this._noise(g,now+0.1,0.15,0.25);
    } else if (type === 'special') {
      for(let i=0;i<3;i++){const o=c.createOscillator(),sg=c.createGain();
        o.type='sine';o.frequency.setValueAtTime(400+i*200,now);o.frequency.exponentialRampToValueAtTime(100+i*50,now+0.3);
        sg.gain.setValueAtTime(0.2,now);sg.gain.exponentialRampToValueAtTime(0.001,now+0.3);
        o.connect(sg);sg.connect(c.destination);o.start(now);o.stop(now+0.35);}
      this._noise(g,now,0.15,0.3);
    } else if (type === 'ko') {
      for(let i=0;i<5;i++){const o=c.createOscillator(),kg=c.createGain(),t=now+i*0.1;
        o.type=i%2===0?'sawtooth':'square';o.frequency.setValueAtTime(200+i*100,t);
        o.frequency.exponentialRampToValueAtTime(50,t+0.3);kg.gain.setValueAtTime(0.3,t);
        kg.gain.exponentialRampToValueAtTime(0.001,t+0.4);o.connect(kg);kg.connect(c.destination);o.start(t);o.stop(t+0.4);}
    } else if (type === 'round') {
      [523,659,784].forEach((f,i)=>{const o=c.createOscillator(),rg=c.createGain();
        o.type='sine';o.frequency.value=f;rg.gain.setValueAtTime(0,now+i*0.15);
        rg.gain.linearRampToValueAtTime(0.2,now+i*0.15+0.05);rg.gain.exponentialRampToValueAtTime(0.001,now+i*0.15+0.3);
        o.connect(rg);rg.connect(c.destination);o.start(now+i*0.15);o.stop(now+i*0.15+0.35);});
    }
  },

  // Simple procedural BGM
  _bgmNodes: null,
  startBGM() {
    if(this._bgmNodes) return;
    this.ensure();
    const c=this.ctx;
    const master=c.createGain(); master.gain.value=0.08; master.connect(c.destination);

    // Bass loop
    const bassOsc=c.createOscillator(); bassOsc.type='triangle'; bassOsc.frequency.value=55;
    const bassGain=c.createGain(); bassGain.gain.value=0.6;
    bassOsc.connect(bassGain); bassGain.connect(master); bassOsc.start();

    // Kick-like LFO on bass
    const lfo=c.createOscillator(); lfo.type='square'; lfo.frequency.value=3.5;
    const lfoGain=c.createGain(); lfoGain.gain.value=0.4;
    lfo.connect(lfoGain); lfoGain.connect(bassGain.gain); lfo.start();

    // Pad
    const pad=c.createOscillator(); pad.type='sine'; pad.frequency.value=220;
    const padGain=c.createGain(); padGain.gain.value=0.15;
    const padFilter=c.createBiquadFilter(); padFilter.type='lowpass'; padFilter.frequency.value=400;
    pad.connect(padFilter); padFilter.connect(padGain); padGain.connect(master); pad.start();

    this._bgmNodes={master,bassOsc,lfo,pad,bassGain,padGain};
  },
  stopBGM() {
    if(!this._bgmNodes) return;
    const n=this._bgmNodes;
    n.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime+0.5);
    setTimeout(()=>{try{n.bassOsc.stop();n.lfo.stop();n.pad.stop();}catch{}},600);
    this._bgmNodes=null;
  },

  _noise(dest, when, dur, gain) {
    const c=this.ctx, bufSize=c.sampleRate*dur, buf=c.createBuffer(1,bufSize,c.sampleRate), data=buf.getChannelData(0);
    for(let i=0;i<bufSize;i++) data[i]=Math.random()*2-1;
    const src=c.createBufferSource(); src.buffer=buf;
    const ng=c.createGain(); ng.gain.setValueAtTime(gain,when); ng.gain.exponentialRampToValueAtTime(0.001,when+dur);
    src.connect(ng); ng.connect(dest); src.start(when);
  }
};

// === PARTICLE SYSTEM ===
class Particle {
  constructor(x,y,vx,vy,life,color,size,type='circle') {
    this.x=x;this.y=y;this.vx=vx;this.vy=vy;
    this.life=life;this.maxLife=life;this.color=color;this.size=size;this.type=type;
  }
  update() { this.x+=this.vx;this.y+=this.vy;this.vy+=0.1;this.vx*=0.99;this.life--;return this.life>0; }
  draw(ctx) {
    const a=this.life/this.maxLife;
    ctx.globalCompositeOperation='lighter';
    ctx.globalAlpha=a;
    if(this.type==='circle'){
      // 二重円で簡易グロー（gradient を使わない）
      const r=this.size*a;
      ctx.fillStyle=_toRgba(this.color,0.35);
      ctx.beginPath();ctx.arc(this.x,this.y,r*1.6,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=this.color;
      ctx.beginPath();ctx.arc(this.x,this.y,r*0.7,0,Math.PI*2);ctx.fill();
      ctx.fillStyle='#fff';ctx.globalAlpha=a*0.85;
      ctx.beginPath();ctx.arc(this.x,this.y,r*0.3,0,Math.PI*2);ctx.fill();
    } else {
      // 矩形スパーク
      const sz=this.size*a;
      ctx.fillStyle=this.color;
      ctx.fillRect(this.x-sz/2,this.y-sz/2,sz,sz);
    }
    ctx.globalAlpha=1;
    ctx.globalCompositeOperation='source-over';
  }
}
const particles = [];

function _addP(p) { if(particles.length<MAX_PARTICLES) particles.push(p); }

// === DAMAGE NUMBERS ===
class DamageNumber {
  constructor(x, y, value, color='#fff') {
    this.x = x; this.y = y; this.value = value; this.color = color;
    this.life = 45; this.maxLife = 45; this.vy = -2;
  }
  update() { this.y += this.vy; this.vy *= 0.95; this.life--; return this.life > 0; }
  draw(ctx) {
    const a = this.life / this.maxLife;
    const t = 1 - a;
    const scale = 0.7 + Math.min(1,t*4)*0.6 - Math.max(0,t-0.4)*0.4;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.scale(scale, scale);
    ctx.font = 'bold 26px "Helvetica Neue","Arial Black",sans-serif';
    ctx.textAlign = 'center';
    // 縁取り
    ctx.lineWidth = 4;ctx.strokeStyle = 'rgba(0,0,0,0.85)';ctx.lineJoin='round';
    ctx.strokeText(this.value, 0, 0);
    // グロー
    ctx.shadowColor = this.color;ctx.shadowBlur = 12;
    // 文字（上→下グラデ）
    const g = ctx.createLinearGradient(0, -14, 0, 8);
    g.addColorStop(0, '#fff');
    g.addColorStop(0.5, this.color);
    g.addColorStop(1, _shade(this.color, -0.3));
    ctx.fillStyle = g;
    ctx.fillText(this.value, 0, 0);
    ctx.restore();
  }
}

function spawnDamageNumber(x, y, damage, isHeavy) {
  const color = isHeavy ? '#ff4444' : damage > 10 ? '#ffaa44' : '#ffcc00';
  game.damageNumbers.push(new DamageNumber(x + (Math.random()-0.5)*20, y, damage, color));
}

function spawnHitParticles(x,y,color,count=12) {
  for(let i=0;i<count;i++){const a=Math.random()*Math.PI*2,s=2+Math.random()*5;
    _addP(new Particle(x,y,Math.cos(a)*s,Math.sin(a)*s-2,15+Math.random()*15,color,3+Math.random()*4,Math.random()>0.5?'circle':'rect'));}
}
function spawnBlockParticles(x,y) {
  for(let i=0;i<6;i++){const a=-Math.PI/2+(Math.random()-0.5)*Math.PI,s=2+Math.random()*3;
    _addP(new Particle(x,y,Math.cos(a)*s,Math.sin(a)*s,10+Math.random()*10,'#88ccff',2+Math.random()*3,'rect'));}
}
function spawnFireball(x,y,color) {
  for(let i=0;i<4;i++) _addP(new Particle(x+(Math.random()-0.5)*10,y+(Math.random()-0.5)*10,(Math.random()-0.5)*2,(Math.random()-0.5)*2-1,8+Math.random()*8,color,4+Math.random()*5,'circle'));
}
function spawnDashTrail(x,y,color) {
  for(let i=0;i<3;i++) _addP(new Particle(x+(Math.random()-0.5)*20,y-20+(Math.random()-0.5)*40,(Math.random()-0.5),(Math.random()-0.5),8+Math.random()*6,color,3+Math.random()*3,'rect'));
}
function spawnThrowEffect(x,y) {
  for(let i=0;i<8;i++){const a=(i/8)*Math.PI*2; _addP(new Particle(x,y,Math.cos(a)*4,Math.sin(a)*4,12,'#ffaa44',4,'circle'));}
}

// === INPUT MANAGER ===
const keys = {};
const keyJustPressed = {};
const keyPrevState = {};
// Touch input state
const touchInput = { left:false,right:false,up:false,down:false,light:false,heavy:false,special:false,throw_btn:false,guard:false };
let isMobile = false;

window.addEventListener('keydown', e => { keys[e.code]=true; if(e.code!=='F5'&&e.code!=='F12') e.preventDefault(); });
window.addEventListener('keyup', e => { keys[e.code]=false; e.preventDefault(); });

function updateInputState() {
  for(const code in keys) { keyJustPressed[code]=keys[code]&&!keyPrevState[code]; keyPrevState[code]=keys[code]; }
}

// Touch controls setup
function setupTouch() {
  const tc = document.getElementById('touchControls');
  if (!('ontouchstart' in window) && !navigator.maxTouchPoints) return;
  isMobile = true;
  tc.classList.add('active');

  // Track which touches map to which buttons
  const activeTouches = new Map(); // touchId -> element

  function updateTouchState() {
    // Reset all
    for(const k in touchInput) touchInput[k]=false;
    // Re-enable from active touches
    tc.querySelectorAll('.active').forEach(el=>el.classList.remove('active'));
    activeTouches.forEach(el=>{
      if(el.dataset.dir) touchInput[el.dataset.dir]=true;
      if(el.dataset.action) touchInput[el.dataset.action]=true;
      el.classList.add('active');
    });
  }

  tc.addEventListener('touchstart', e => {
    e.preventDefault();
    for(const t of e.changedTouches){
      const el=document.elementFromPoint(t.clientX,t.clientY)?.closest('[data-dir],[data-action]');
      if(el) activeTouches.set(t.identifier,el);
    }
    updateTouchState();
  }, { passive: false });

  tc.addEventListener('touchmove', e => {
    e.preventDefault();
    for(const t of e.changedTouches){
      const el=document.elementFromPoint(t.clientX,t.clientY)?.closest('[data-dir],[data-action]');
      if(el) activeTouches.set(t.identifier,el);
      else activeTouches.delete(t.identifier);
    }
    updateTouchState();
  }, { passive: false });

  tc.addEventListener('touchend', e => {
    e.preventDefault();
    for(const t of e.changedTouches) activeTouches.delete(t.identifier);
    updateTouchState();
  }, { passive: false });

  tc.addEventListener('touchcancel', e => {
    e.preventDefault();
    for(const t of e.changedTouches) activeTouches.delete(t.identifier);
    updateTouchState();
  }, { passive: false });
}
setupTouch();

// Unified touch state tracking
const touchJP = {};
const touchPrev = {};

// === キーバインド + 操作モード対応の入力読取 ===
// shift キーは ShiftLeft / ShiftRight どちらでも反応させるためのエイリアス
function _kPressed(code){
  if(!code) return false;
  if(code==='ShiftLeft'||code==='ShiftRight') return !!keys.ShiftLeft||!!keys.ShiftRight;
  return !!keys[code];
}
function _kJP(code){
  if(!code) return false;
  if(code==='ShiftLeft'||code==='ShiftRight') return !!keyJustPressed.ShiftLeft||!!keyJustPressed.ShiftRight;
  return !!keyJustPressed[code];
}

function getP1Input(){ return _readPlayerInput(1, touchInput); }
function getP2Input(){ return _readPlayerInput(2, null); }

function _readPlayerInput(playerNum, ti){
  const kb = saveData.settings.keybinds[playerNum===1?'p1':'p2'];
  const scheme = saveData.settings.controlScheme;

  const left  = _kPressed(kb.left)  || !!(ti&&ti.left);
  const right = _kPressed(kb.right) || !!(ti&&ti.right);
  const up    = _kPressed(kb.up)    || !!(ti&&ti.up);
  const down  = _kPressed(kb.down)  || !!(ti&&ti.down);

  // タッチ入力の Just-Pressed 検出
  if(ti){
    touchJP.light=ti.light&&!touchPrev.light;
    touchJP.heavy=ti.heavy&&!touchPrev.heavy;
    touchJP.special=ti.special&&!touchPrev.special;
    touchJP.throw_btn=ti.throw_btn&&!touchPrev.throw_btn;
    touchJP.attack=ti.light&&!touchPrev.light; // 簡易モード用エイリアス
    touchPrev.light=ti.light; touchPrev.heavy=ti.heavy;
    touchPrev.special=ti.special; touchPrev.throw_btn=ti.throw_btn;
  }

  // ゲームパッド入力（P1 のみ）
  let pad={};
  if(playerNum===1) pad=_readGamepad();

  if(scheme==='standard'){
    const lt=_kPressed(kb.light)||!!(ti&&ti.light)||!!pad.light;
    const hv=_kPressed(kb.heavy)||!!(ti&&ti.heavy)||!!pad.heavy;
    const sp=_kPressed(kb.special)||!!(ti&&ti.special)||!!pad.special;
    const th=_kPressed(kb.throw_btn)||!!(ti&&ti.throw_btn)||!!pad.throw_btn;
    const gd=_kPressed(kb.guard)||!!(ti&&ti.guard)||!!pad.guard;
    return {
      left,right,up,down,
      light:lt, heavy:hv, special:sp, throw_btn:th, guard:gd,
      lightJP:_kJP(kb.light)||touchJP.light||!!pad.lightJP,
      heavyJP:_kJP(kb.heavy)||touchJP.heavy||!!pad.heavyJP,
      specialJP:_kJP(kb.special)||touchJP.special||!!pad.specialJP,
      throwJP:_kJP(kb.throw_btn)||touchJP.throw_btn||!!pad.throwJP,
    };
  }

  // シンプル / 十字キー: 攻撃ボタン1つ + 必殺 (+ ガード)
  // attack: 専用 attack キー / light キー / heavy キー / タッチ light or heavy
  const atk = _kPressed(kb.attack)||_kPressed(kb.light)||_kPressed(kb.heavy)
              ||!!(ti&&(ti.light||ti.heavy))||!!pad.attack||!!pad.light||!!pad.heavy;
  const atkJP = _kJP(kb.attack)||_kJP(kb.light)||_kJP(kb.heavy)||touchJP.light||touchJP.heavy
              ||!!pad.attackJP||!!pad.lightJP||!!pad.heavyJP;
  const sp = _kPressed(kb.special)||!!(ti&&ti.special)||!!pad.special;
  const spJP = _kJP(kb.special)||touchJP.special||!!pad.specialJP;
  // 投げ: シンプルでは特殊+下、十字では使わない（特殊が距離で代替）
  const th = _kPressed(kb.throw_btn)||!!(ti&&ti.throw_btn)||!!pad.throw_btn;
  const thJP = _kJP(kb.throw_btn)||touchJP.throw_btn||!!pad.throwJP;
  // ガード
  let gd=false;
  if(scheme==='simple'){
    gd=_kPressed(kb.guard)||!!(ti&&ti.guard)||!!pad.guard;
  } // dpad はガード=後ろ入力（fighter 側の判定に任せる）

  // 攻撃の振り分け: ↓+attack→重 (sweep)、それ以外→軽
  let lightJP=false, heavyJP=false, light=false, heavy=false;
  if(down){ heavy=atk; heavyJP=atkJP; }
  else { light=atk; lightJP=atkJP; }

  return {
    left,right,up,down,
    light, heavy, special:sp, throw_btn:th, guard:gd,
    lightJP, heavyJP, specialJP:spJP, throwJP:thJP,
  };
}

// === ゲームパッド入力（標準的な XInput 配置） ===
const _padPrev={};
function _readGamepad(){
  if(!saveData.settings.gamepadEnabled) return {};
  if(typeof navigator==='undefined'||!navigator.getGamepads) return {};
  const pads=navigator.getGamepads();
  for(const p of pads){
    if(!p) continue;
    const b=p.buttons, ax=p.axes;
    const get=(i)=>b[i]&&b[i].pressed;
    const cur={
      left:  ax[0]<-0.4||get(14),
      right: ax[0]> 0.4||get(15),
      up:    ax[1]<-0.4||get(12),
      down:  ax[1]> 0.4||get(13),
      light: get(0),  // A / ✕
      heavy: get(2),  // X / □
      special: get(3),// Y / △
      throw_btn: get(1), // B / ◯
      guard: get(4)||get(6), // LB / LT
      attack: get(0),
    };
    cur.lightJP=cur.light&&!_padPrev.light;
    cur.heavyJP=cur.heavy&&!_padPrev.heavy;
    cur.specialJP=cur.special&&!_padPrev.special;
    cur.throwJP=cur.throw_btn&&!_padPrev.throw_btn;
    cur.attackJP=cur.attack&&!_padPrev.attack;
    Object.assign(_padPrev,{light:cur.light,heavy:cur.heavy,special:cur.special,throw_btn:cur.throw_btn,attack:cur.attack});
    return cur;
  }
  return {};
}
function gamepadConnected(){
  if(typeof navigator==='undefined'||!navigator.getGamepads) return null;
  const pads=navigator.getGamepads();
  for(const p of pads) if(p) return p.id;
  return null;
}

// === AI (active, varied behavior) ===
function getAIInput(self,opp,difficulty=0.6) {
  const inp={left:false,right:false,up:false,down:false,light:false,heavy:false,special:false,throw_btn:false,guard:false,lightJP:false,heavyJP:false,specialJP:false,throwJP:false};
  const dist=Math.abs(self.x-opp.x);
  const fr=self.x<opp.x; // facing right?
  const canAct=self.fstate===FSTATE.IDLE||self.fstate===FSTATE.WALK_F||self.fstate===FSTATE.WALK_B;
  const r=Math.random;

  // --- MOVEMENT: always be doing something ---
  if(canAct) {
    const moveRoll=r();
    if(moveRoll < 0.35) {
      // Approach opponent
      if(fr) inp.right=true; else inp.left=true;
    } else if(moveRoll < 0.50) {
      // Retreat
      if(fr) inp.left=true; else inp.right=true;
    } else if(moveRoll < 0.58) {
      // Sidestep / reposition randomly
      if(r()<0.5) inp.left=true; else inp.right=true;
    }
    // else: stand still briefly
  }

  // --- JUMPING: frequent, varied ---
  if(canAct) {
    if(r() < 0.025 * difficulty) {
      inp.up=true;
      // Jump forward/backward randomly
      if(r()<0.6){if(fr)inp.right=true;else inp.left=true;}
      else if(r()<0.3){if(fr)inp.left=true;else inp.right=true;}
    }
    // Jump over opponent when very close (position swap)
    if(dist<80 && r()<0.015*difficulty) {
      inp.up=true;
      if(fr) inp.right=true; else inp.left=true;
    }
  }

  // --- ATTACKS ---
  if(canAct) {
    if(dist<60 && r()<difficulty*0.04) { inp.throw_btn=true;inp.throwJP=true; }
    if(dist<100 && r()<difficulty*0.10) { inp.light=true;inp.lightJP=true; }
    if(dist<130 && r()<difficulty*0.06) { inp.heavy=true;inp.heavyJP=true; }
    // Sweep
    if(dist<110 && r()<difficulty*0.025) { inp.down=true;inp.heavy=true;inp.heavyJP=true; }
    // Special move
    if(dist>120 && dist<450 && r()<difficulty*0.03) { inp.special=true;inp.specialJP=true; }
    // Anti-air uppercut
    if(opp.fstate===FSTATE.JUMP && dist<160 && r()<difficulty*0.12) { inp.down=true;inp.light=true;inp.lightJP=true; }
    // Dash in for pressure
    if(dist>180 && r()<difficulty*0.02) self._aiDash=true;
    // Crouch sometimes
    if(r()<0.01) inp.down=true;
  }

  // --- AIR ACTIONS ---
  if(self.fstate===FSTATE.JUMP) {
    // Air attack when descending near opponent
    if(self.vy>0 && dist<140) {
      if(r()<difficulty*0.12){inp.light=true;inp.lightJP=true;}
      else if(r()<difficulty*0.06){inp.heavy=true;inp.heavyJP=true;}
    }
    // Dive kick
    if(self.vy>-2 && dist<130 && r()<difficulty*0.08) {
      inp.down=true;inp.heavy=true;inp.heavyJP=true;
    }
  }

  // --- GUARD: react to opponent's attacks ---
  if(opp.fstate===FSTATE.ATTACK && dist<150 && r()<difficulty*0.6) {
    inp.guard=true;
  }
  // Guard projectiles
  if(game.projectiles.some(p=>p.owner!==self.playerNum && Math.abs(p.x-self.x)<200)) {
    if(r()<difficulty*0.7) inp.guard=true;
  }

  return inp;
}

// === CHARACTER DATA ===
const CHARACTERS = {
  kaito: {
    name: 'KAITO', nameJp: 'カイト',
    colors: { gi:'#2255aa', giLight:'#3377cc', belt:'#aa8833', skin:'#f0c090', hair:'#221100', pants:'#1a3366', headband:'#cc2222' },
    attacks: {
      light:{damage:6,startup:3,active:3,recovery:5,knockback:3,hitstun:10,hitboxW:50,hitboxH:20,hitboxX:30,hitboxY:-40,sound:'punch_light',type:'punch',anim:'punch_light'},
      heavy:{damage:14,startup:7,active:4,recovery:12,knockback:8,hitstun:18,hitboxW:60,hitboxH:25,hitboxX:25,hitboxY:-20,sound:'kick_heavy',type:'kick',anim:'kick_heavy'},
      crouch_light:{damage:5,startup:3,active:3,recovery:6,knockback:2,hitstun:8,hitboxW:45,hitboxH:20,hitboxX:25,hitboxY:-10,sound:'punch_light',type:'punch',anim:'crouch_punch'},
      crouch_heavy:{damage:10,startup:6,active:4,recovery:14,knockback:5,hitstun:20,hitboxW:70,hitboxH:18,hitboxX:20,hitboxY:5,sound:'sweep',type:'sweep',anim:'sweep',forceKnockdown:true},
      uppercut:{damage:16,startup:5,active:5,recovery:16,knockback:6,hitstun:24,hitboxW:40,hitboxH:60,hitboxX:15,hitboxY:-65,sound:'uppercut',type:'uppercut',anim:'uppercut',launch:true},
      air_light:{damage:8,startup:3,active:6,recovery:3,knockback:4,hitstun:12,hitboxW:50,hitboxH:35,hitboxX:15,hitboxY:-15,sound:'punch_light',type:'punch',anim:'air_punch'},
      air_heavy:{damage:12,startup:4,active:5,recovery:4,knockback:6,hitstun:16,hitboxW:55,hitboxH:40,hitboxX:20,hitboxY:-10,sound:'kick_heavy',type:'kick',anim:'air_kick'},
      divekick:{damage:11,startup:4,active:20,recovery:8,knockback:7,hitstun:14,hitboxW:35,hitboxH:45,hitboxX:15,hitboxY:0,sound:'divekick',type:'divekick',anim:'divekick'},
      throw_atk:{damage:18,startup:3,active:3,recovery:20,knockback:12,hitstun:30,sound:'throw',type:'throw',anim:'throw'},
      special:{damage:12,startup:12,active:60,recovery:15,knockback:10,hitstun:20,sound:'fireball',type:'projectile',projSpeed:6,projColor:'#44aaff',anim:'special'},
    },
    walkSpeed:3.5, jumpPower:-13, dashSpeed:DASH_SPEED,
    bodyScale:1.0, description:'波動拳を操る正統派格闘家'
  },
  akane: {
    name: 'AKANE', nameJp: 'アカネ',
    colors: { gi:'#cc2233', giLight:'#ee4455', belt:'#222222', skin:'#f0c8a0', hair:'#cc3300', pants:'#881122', headband:'#ffcc00' },
    attacks: {
      light:{damage:5,startup:2,active:3,recovery:4,knockback:2,hitstun:8,hitboxW:45,hitboxH:18,hitboxX:28,hitboxY:-42,sound:'punch_light',type:'punch',anim:'punch_light'},
      heavy:{damage:12,startup:5,active:5,recovery:10,knockback:7,hitstun:16,hitboxW:65,hitboxH:22,hitboxX:20,hitboxY:-18,sound:'kick_heavy',type:'kick',anim:'kick_heavy'},
      crouch_light:{damage:4,startup:2,active:3,recovery:5,knockback:2,hitstun:7,hitboxW:42,hitboxH:18,hitboxX:25,hitboxY:-8,sound:'punch_light',type:'punch',anim:'crouch_punch'},
      crouch_heavy:{damage:9,startup:5,active:5,recovery:12,knockback:4,hitstun:18,hitboxW:75,hitboxH:16,hitboxX:18,hitboxY:5,sound:'sweep',type:'sweep',anim:'sweep',forceKnockdown:true},
      uppercut:{damage:14,startup:4,active:6,recovery:14,knockback:5,hitstun:22,hitboxW:38,hitboxH:55,hitboxX:12,hitboxY:-60,sound:'uppercut',type:'uppercut',anim:'uppercut',launch:true},
      air_light:{damage:7,startup:2,active:7,recovery:3,knockback:5,hitstun:10,hitboxW:55,hitboxH:30,hitboxX:10,hitboxY:-12,sound:'kick_light',type:'kick',anim:'air_punch'},
      air_heavy:{damage:11,startup:3,active:6,recovery:3,knockback:7,hitstun:14,hitboxW:60,hitboxH:38,hitboxX:15,hitboxY:-8,sound:'kick_heavy',type:'kick',anim:'air_kick'},
      divekick:{damage:10,startup:3,active:22,recovery:6,knockback:8,hitstun:12,hitboxW:30,hitboxH:50,hitboxX:12,hitboxY:5,sound:'divekick',type:'divekick',anim:'divekick'},
      throw_atk:{damage:16,startup:3,active:3,recovery:18,knockback:10,hitstun:28,sound:'throw',type:'throw',anim:'throw'},
      special:{damage:15,startup:8,active:12,recovery:14,knockback:14,hitstun:22,sound:'special',type:'rush',rushDist:180,hitboxW:55,hitboxH:35,hitboxX:30,hitboxY:-35,anim:'rush'},
    },
    walkSpeed:4.2, jumpPower:-13.5, dashSpeed:DASH_SPEED+2,
    bodyScale:1.0, description:'疾風の如き高速格闘家'
  },
  gouki: {
    name: 'GOUKI', nameJp: 'ゴウキ',
    colors: { gi:'#3a1155', giLight:'#5a2277', belt:'#111', skin:'#d0a070', hair:'#1a0a00', pants:'#2a0d3d', headband:'#880044' },
    attacks: {
      light:{damage:8,startup:5,active:4,recovery:6,knockback:5,hitstun:12,hitboxW:55,hitboxH:25,hitboxX:30,hitboxY:-38,sound:'punch_heavy',type:'punch',anim:'punch_light'},
      heavy:{damage:20,startup:10,active:5,recovery:16,knockback:12,hitstun:22,hitboxW:70,hitboxH:30,hitboxX:25,hitboxY:-18,sound:'kick_heavy',type:'kick',anim:'kick_heavy'},
      crouch_light:{damage:7,startup:4,active:4,recovery:7,knockback:3,hitstun:10,hitboxW:50,hitboxH:22,hitboxX:25,hitboxY:-8,sound:'punch_light',type:'punch',anim:'crouch_punch'},
      crouch_heavy:{damage:14,startup:8,active:5,recovery:18,knockback:8,hitstun:24,hitboxW:80,hitboxH:22,hitboxX:20,hitboxY:5,sound:'sweep',type:'sweep',anim:'sweep',forceKnockdown:true},
      uppercut:{damage:22,startup:7,active:6,recovery:20,knockback:10,hitstun:28,hitboxW:45,hitboxH:65,hitboxX:15,hitboxY:-70,sound:'uppercut',type:'uppercut',anim:'uppercut',launch:true},
      air_light:{damage:10,startup:4,active:5,recovery:4,knockback:6,hitstun:14,hitboxW:55,hitboxH:40,hitboxX:15,hitboxY:-15,sound:'punch_heavy',type:'punch',anim:'air_punch'},
      air_heavy:{damage:16,startup:6,active:5,recovery:5,knockback:10,hitstun:18,hitboxW:60,hitboxH:45,hitboxX:20,hitboxY:-10,sound:'kick_heavy',type:'kick',anim:'air_kick'},
      divekick:{damage:14,startup:5,active:20,recovery:10,knockback:10,hitstun:16,hitboxW:40,hitboxH:50,hitboxX:15,hitboxY:0,sound:'divekick',type:'divekick',anim:'divekick'},
      throw_atk:{damage:24,startup:4,active:3,recovery:24,knockback:15,hitstun:35,sound:'throw',type:'throw',anim:'throw'},
      special:{damage:18,startup:14,active:60,recovery:18,knockback:12,hitstun:24,sound:'special',type:'projectile',projSpeed:4,projColor:'#9944cc',anim:'special'},
    },
    walkSpeed:2.5, jumpPower:-11, dashSpeed:DASH_SPEED-2,
    bodyScale:1.3, description:'圧倒的パワーの元王者'
  },
  hikari: {
    name: 'HIKARI', nameJp: 'ヒカリ',
    colors: { gi:'#e8e0d0', giLight:'#fff8ee', belt:'#cc9933', skin:'#f8d8b8', hair:'#ddb844', pants:'#c8b898', headband:'#ffdd66' },
    attacks: {
      light:{damage:5,startup:3,active:3,recovery:5,knockback:3,hitstun:9,hitboxW:55,hitboxH:18,hitboxX:35,hitboxY:-42,sound:'punch_light',type:'punch',anim:'punch_light'},
      heavy:{damage:11,startup:6,active:4,recovery:11,knockback:7,hitstun:16,hitboxW:65,hitboxH:22,hitboxX:30,hitboxY:-22,sound:'kick_light',type:'kick',anim:'kick_heavy'},
      crouch_light:{damage:4,startup:3,active:3,recovery:5,knockback:2,hitstun:7,hitboxW:50,hitboxH:18,hitboxX:30,hitboxY:-8,sound:'punch_light',type:'punch',anim:'crouch_punch'},
      crouch_heavy:{damage:8,startup:5,active:4,recovery:12,knockback:4,hitstun:16,hitboxW:70,hitboxH:16,hitboxX:25,hitboxY:5,sound:'sweep',type:'sweep',anim:'sweep',forceKnockdown:true},
      uppercut:{damage:13,startup:5,active:5,recovery:14,knockback:5,hitstun:20,hitboxW:35,hitboxH:55,hitboxX:15,hitboxY:-60,sound:'uppercut',type:'uppercut',anim:'uppercut',launch:true},
      air_light:{damage:6,startup:2,active:6,recovery:3,knockback:4,hitstun:10,hitboxW:50,hitboxH:30,hitboxX:15,hitboxY:-15,sound:'punch_light',type:'punch',anim:'air_punch'},
      air_heavy:{damage:10,startup:3,active:5,recovery:3,knockback:6,hitstun:14,hitboxW:55,hitboxH:35,hitboxX:20,hitboxY:-10,sound:'kick_light',type:'kick',anim:'air_kick'},
      divekick:{damage:9,startup:3,active:20,recovery:6,knockback:6,hitstun:12,hitboxW:30,hitboxH:40,hitboxX:15,hitboxY:0,sound:'divekick',type:'divekick',anim:'divekick'},
      throw_atk:{damage:14,startup:3,active:3,recovery:18,knockback:10,hitstun:26,sound:'throw',type:'throw',anim:'throw'},
      special:{damage:10,startup:8,active:60,recovery:12,knockback:8,hitstun:18,sound:'fireball',type:'projectile',projSpeed:8,projColor:'#ffee88',anim:'special'},
    },
    walkSpeed:3.5, jumpPower:-14, dashSpeed:DASH_SPEED,
    bodyScale:0.85, description:'光を操る神殿の巫女'
  },
  tetsu: {
    name: 'TETSU', nameJp: 'テツ',
    colors: { gi:'#556677', giLight:'#778899', belt:'#333', skin:'#d8b090', hair:'#444444', pants:'#445566', headband:'#888888' },
    attacks: {
      light:{damage:7,startup:5,active:4,recovery:7,knockback:4,hitstun:11,hitboxW:50,hitboxH:25,hitboxX:28,hitboxY:-36,sound:'punch_heavy',type:'punch',anim:'punch_light'},
      heavy:{damage:18,startup:9,active:5,recovery:15,knockback:10,hitstun:20,hitboxW:65,hitboxH:28,hitboxX:22,hitboxY:-16,sound:'kick_heavy',type:'kick',anim:'kick_heavy'},
      crouch_light:{damage:6,startup:4,active:4,recovery:6,knockback:3,hitstun:9,hitboxW:48,hitboxH:22,hitboxX:24,hitboxY:-8,sound:'punch_light',type:'punch',anim:'crouch_punch'},
      crouch_heavy:{damage:12,startup:7,active:5,recovery:16,knockback:6,hitstun:22,hitboxW:75,hitboxH:20,hitboxX:18,hitboxY:5,sound:'sweep',type:'sweep',anim:'sweep',forceKnockdown:true},
      uppercut:{damage:18,startup:6,active:6,recovery:18,knockback:8,hitstun:26,hitboxW:42,hitboxH:60,hitboxX:14,hitboxY:-65,sound:'uppercut',type:'uppercut',anim:'uppercut',launch:true},
      air_light:{damage:9,startup:4,active:5,recovery:4,knockback:5,hitstun:12,hitboxW:52,hitboxH:38,hitboxX:14,hitboxY:-14,sound:'punch_heavy',type:'punch',anim:'air_punch'},
      air_heavy:{damage:14,startup:5,active:5,recovery:5,knockback:8,hitstun:16,hitboxW:58,hitboxH:42,hitboxX:18,hitboxY:-8,sound:'kick_heavy',type:'kick',anim:'air_kick'},
      divekick:{damage:13,startup:5,active:20,recovery:10,knockback:9,hitstun:15,hitboxW:38,hitboxH:48,hitboxX:14,hitboxY:0,sound:'divekick',type:'divekick',anim:'divekick'},
      throw_atk:{damage:28,startup:4,active:4,recovery:22,knockback:14,hitstun:36,sound:'throw',type:'throw',anim:'throw'},
      special:{damage:22,startup:6,active:6,recovery:20,knockback:16,hitstun:32,sound:'throw',type:'rush',rushDist:120,hitboxW:60,hitboxH:50,hitboxX:20,hitboxY:-30,anim:'rush'},
    },
    walkSpeed:2.0, jumpPower:-10, dashSpeed:DASH_SPEED-3,
    bodyScale:1.35, description:'鉄の肉体を持つ元軍人'
  },
  yuki: {
    name: 'YUKI', nameJp: 'ユキ',
    colors: { gi:'#88bbdd', giLight:'#aaddff', belt:'#4488aa', skin:'#f0dde8', hair:'#ddeeff', pants:'#6699bb', headband:'#44aacc' },
    attacks: {
      light:{damage:4,startup:2,active:3,recovery:4,knockback:2,hitstun:7,hitboxW:42,hitboxH:16,hitboxX:28,hitboxY:-44,sound:'punch_light',type:'punch',anim:'punch_light'},
      heavy:{damage:10,startup:5,active:4,recovery:9,knockback:6,hitstun:14,hitboxW:58,hitboxH:20,hitboxX:22,hitboxY:-20,sound:'kick_light',type:'kick',anim:'kick_heavy'},
      crouch_light:{damage:3,startup:2,active:3,recovery:4,knockback:1,hitstun:6,hitboxW:40,hitboxH:16,hitboxX:24,hitboxY:-8,sound:'punch_light',type:'punch',anim:'crouch_punch'},
      crouch_heavy:{damage:8,startup:4,active:4,recovery:10,knockback:3,hitstun:15,hitboxW:68,hitboxH:14,hitboxX:18,hitboxY:5,sound:'sweep',type:'sweep',anim:'sweep',forceKnockdown:true},
      uppercut:{damage:12,startup:4,active:5,recovery:12,knockback:4,hitstun:18,hitboxW:36,hitboxH:50,hitboxX:12,hitboxY:-55,sound:'uppercut',type:'uppercut',anim:'uppercut',launch:true},
      air_light:{damage:5,startup:2,active:6,recovery:2,knockback:3,hitstun:8,hitboxW:48,hitboxH:28,hitboxX:12,hitboxY:-12,sound:'punch_light',type:'punch',anim:'air_punch'},
      air_heavy:{damage:9,startup:3,active:5,recovery:3,knockback:5,hitstun:12,hitboxW:52,hitboxH:32,hitboxX:15,hitboxY:-8,sound:'kick_light',type:'kick',anim:'air_kick'},
      divekick:{damage:8,startup:2,active:22,recovery:5,knockback:6,hitstun:10,hitboxW:28,hitboxH:42,hitboxX:12,hitboxY:5,sound:'divekick',type:'divekick',anim:'divekick'},
      throw_atk:{damage:14,startup:2,active:3,recovery:16,knockback:8,hitstun:24,sound:'throw',type:'throw',anim:'throw'},
      special:{damage:13,startup:6,active:10,recovery:10,knockback:10,hitstun:18,sound:'special',type:'rush',rushDist:200,hitboxW:45,hitboxH:30,hitboxX:25,hitboxY:-35,anim:'rush'},
    },
    walkSpeed:4.0, jumpPower:-13, dashSpeed:DASH_SPEED+3,
    bodyScale:0.9, description:'幻惑の氷使い'
  },
  ren: {
    name: 'REN', nameJp: 'レン',
    colors: { gi:'#338844', giLight:'#44aa66', belt:'#886622', skin:'#e8c098', hair:'#553311', pants:'#226633', headband:'#ddaa44' },
    attacks: {
      light:{damage:4,startup:2,active:2,recovery:3,knockback:2,hitstun:7,hitboxW:44,hitboxH:16,hitboxX:26,hitboxY:-42,sound:'punch_light',type:'punch',anim:'punch_light'},
      heavy:{damage:11,startup:4,active:5,recovery:9,knockback:6,hitstun:15,hitboxW:62,hitboxH:20,hitboxX:22,hitboxY:-20,sound:'kick_heavy',type:'kick',anim:'kick_heavy'},
      crouch_light:{damage:3,startup:2,active:2,recovery:4,knockback:1,hitstun:6,hitboxW:40,hitboxH:16,hitboxX:22,hitboxY:-8,sound:'punch_light',type:'punch',anim:'crouch_punch'},
      crouch_heavy:{damage:8,startup:4,active:4,recovery:10,knockback:3,hitstun:16,hitboxW:72,hitboxH:14,hitboxX:16,hitboxY:5,sound:'sweep',type:'sweep',anim:'sweep',forceKnockdown:true},
      uppercut:{damage:13,startup:3,active:5,recovery:13,knockback:5,hitstun:20,hitboxW:36,hitboxH:52,hitboxX:12,hitboxY:-58,sound:'uppercut',type:'uppercut',anim:'uppercut',launch:true},
      air_light:{damage:5,startup:2,active:5,recovery:2,knockback:3,hitstun:8,hitboxW:48,hitboxH:28,hitboxX:10,hitboxY:-12,sound:'kick_light',type:'kick',anim:'air_punch'},
      air_heavy:{damage:10,startup:3,active:6,recovery:3,knockback:6,hitstun:13,hitboxW:55,hitboxH:34,hitboxX:14,hitboxY:-8,sound:'kick_heavy',type:'kick',anim:'air_kick'},
      divekick:{damage:9,startup:2,active:22,recovery:5,knockback:7,hitstun:11,hitboxW:30,hitboxH:44,hitboxX:12,hitboxY:5,sound:'divekick',type:'divekick',anim:'divekick'},
      throw_atk:{damage:15,startup:2,active:3,recovery:16,knockback:9,hitstun:25,sound:'throw',type:'throw',anim:'throw'},
      special:{damage:14,startup:6,active:14,recovery:12,knockback:12,hitstun:20,sound:'special',type:'rush',rushDist:160,hitboxW:50,hitboxH:35,hitboxX:28,hitboxY:-32,anim:'rush'},
    },
    walkSpeed:4.5, jumpPower:-14.5, dashSpeed:DASH_SPEED+2,
    bodyScale:1.0, description:'連撃の拳法少年'
  },
  maki: {
    name: 'MAKI', nameJp: 'マキ',
    colors: { gi:'#1a1122', giLight:'#2a1a33', belt:'#440044', skin:'#d8c0a8', hair:'#110011', pants:'#150d1e', headband:'#660066' },
    attacks: {
      light:{damage:5,startup:3,active:3,recovery:4,knockback:3,hitstun:9,hitboxW:48,hitboxH:18,hitboxX:28,hitboxY:-42,sound:'punch_light',type:'punch',anim:'punch_light'},
      heavy:{damage:13,startup:6,active:4,recovery:11,knockback:8,hitstun:17,hitboxW:60,hitboxH:24,hitboxX:24,hitboxY:-20,sound:'kick_heavy',type:'kick',anim:'kick_heavy'},
      crouch_light:{damage:4,startup:3,active:3,recovery:5,knockback:2,hitstun:7,hitboxW:44,hitboxH:18,hitboxX:24,hitboxY:-8,sound:'punch_light',type:'punch',anim:'crouch_punch'},
      crouch_heavy:{damage:10,startup:6,active:4,recovery:13,knockback:5,hitstun:19,hitboxW:72,hitboxH:16,hitboxX:20,hitboxY:5,sound:'sweep',type:'sweep',anim:'sweep',forceKnockdown:true},
      uppercut:{damage:15,startup:5,active:5,recovery:15,knockback:6,hitstun:22,hitboxW:38,hitboxH:58,hitboxX:14,hitboxY:-62,sound:'uppercut',type:'uppercut',anim:'uppercut',launch:true},
      air_light:{damage:7,startup:2,active:6,recovery:3,knockback:4,hitstun:10,hitboxW:50,hitboxH:32,hitboxX:12,hitboxY:-14,sound:'punch_light',type:'punch',anim:'air_punch'},
      air_heavy:{damage:11,startup:3,active:5,recovery:3,knockback:7,hitstun:14,hitboxW:56,hitboxH:36,hitboxX:16,hitboxY:-8,sound:'kick_heavy',type:'kick',anim:'air_kick'},
      divekick:{damage:10,startup:3,active:22,recovery:6,knockback:7,hitstun:12,hitboxW:32,hitboxH:45,hitboxX:12,hitboxY:5,sound:'divekick',type:'divekick',anim:'divekick'},
      throw_atk:{damage:17,startup:3,active:3,recovery:19,knockback:11,hitstun:28,sound:'throw',type:'throw',anim:'throw'},
      special:{damage:16,startup:10,active:10,recovery:12,knockback:12,hitstun:22,sound:'special',type:'rush',rushDist:150,hitboxW:50,hitboxH:35,hitboxX:25,hitboxY:-35,anim:'rush'},
    },
    walkSpeed:3.5, jumpPower:-13, dashSpeed:DASH_SPEED+1,
    bodyScale:1.05, description:'闇に潜む謎の暗殺者'
  }
};

// === PROJECTILE CLASS ===
class Projectile {
  constructor(x,y,dir,speed,damage,knockback,hitstun,color,owner) {
    this.x=x;this.y=y;this.dir=dir;this.speed=speed;this.damage=damage;
    this.knockback=knockback;this.hitstun=hitstun;this.color=color;this.owner=owner;
    this.radius=15;this.life=120;this.frame=0;
  }
  update() { this.x+=this.speed*this.dir;this.frame++;this.life--;spawnFireball(this.x-this.dir*10,this.y,this.color);return this.life>0&&this.x>STAGE_LEFT-30&&this.x<STAGE_RIGHT+30; }
  draw(ctx) {
    const p=1+Math.sin(this.frame*0.5)*0.2;
    const r=this.radius*p;
    ctx.save();
    ctx.globalCompositeOperation='lighter';
    // 外側ハロー（単色）
    ctx.fillStyle=_toRgba(this.color,0.18);
    ctx.beginPath();ctx.arc(this.x,this.y,r*2.6,0,Math.PI*2);ctx.fill();
    // 中間
    ctx.fillStyle=_toRgba(this.color,0.55);
    ctx.beginPath();ctx.arc(this.x,this.y,r*1.4,0,Math.PI*2);ctx.fill();
    // メイン球
    ctx.fillStyle=this.color;
    ctx.beginPath();ctx.arc(this.x,this.y,r,0,Math.PI*2);ctx.fill();
    // 中心の白い核
    ctx.fillStyle='rgba(255,255,255,0.9)';
    ctx.beginPath();ctx.arc(this.x,this.y,r*0.4,0,Math.PI*2);ctx.fill();
    ctx.restore();
  }
  getHitbox() { return {x:this.x-this.radius,y:this.y-this.radius,w:this.radius*2,h:this.radius*2}; }
}

// === FIGHTER CLASS ===
class Fighter {
  constructor(charId,playerNum,x) {
    this.charId=charId;this.data=CHARACTERS[charId];this.playerNum=playerNum;
    this.x=x;this.y=GROUND_Y;this.vx=0;this.vy=0;
    this.hp=100;this.maxHp=100;this.super=0;this.maxSuper=100;
    this.fstate=FSTATE.IDLE;this.dir=playerNum===1?1:-1;
    this.attackFrame=0;this.attackData=null;this.attackName='';
    this.hitStun=0;this.knockdownTime=0;this.hasHit=false;
    this.comboCount=0;this.comboTimer=0;this.animFrame=0;this.flashTimer=0;
    this.wins=0;this.isRushing=false;this.isDiving=false;this.blockStun=0;
    this.bodyW=40;this.bodyH=70;this.prevInput={};
    this.dashTimer=0;this.dashDir=0;this.dashFrame=0;
    this.lastTapDir=0;this.lastTapTime=0;
    this.throwTarget=null;this.throwFrame=0;
    this.wasDown=false;this._aiDash=false;
    this.displayName='';this.guardShowTimer=0;this.currentInput={};
  }
  reset(x) {
    this.x=x;this.y=GROUND_Y;this.vx=0;this.vy=0;this.hp=100;this.super=0;
    this.fstate=FSTATE.IDLE;this.attackFrame=0;this.attackData=null;this.attackName='';
    this.hitStun=0;this.knockdownTime=0;this.hasHit=false;this.comboCount=0;this.comboTimer=0;
    this.animFrame=0;this.flashTimer=0;this.isRushing=false;this.isDiving=false;this.blockStun=0;
    this.prevInput={};this.currentInput={};this.dashTimer=0;this.dashDir=0;this.dashFrame=0;
    this.lastTapDir=0;this.lastTapTime=0;this.throwTarget=null;this.throwFrame=0;
    this.wasDown=false;this._aiDash=false;this.guardShowTimer=0;
  }
  getHurtbox() {
    const bs=this.data.bodyScale||1;
    const w=this.bodyW*bs,h=(this.fstate===FSTATE.CROUCH?this.bodyH*0.6:this.bodyH)*bs;
    return {x:this.x-w/2,y:this.y-h,w:w,h:h};
  }
  getAttackHitbox() {
    if(this.fstate!==FSTATE.ATTACK||!this.attackData) return null;
    const a=this.attackData;
    if(a.type==='projectile'||a.type==='rush'||a.type==='throw') return null;
    if(this.attackFrame<a.startup||this.attackFrame>=a.startup+a.active) return null;
    const cr=this.attackName.startsWith('crouch_');
    const by=cr?this.y-this.bodyH*0.4:this.y-this.bodyH*0.5;
    const hx=this.x+a.hitboxX*this.dir;
    return {x:this.dir===1?hx:hx-a.hitboxW, y:by+a.hitboxY, w:a.hitboxW, h:a.hitboxH};
  }
  getRushHitbox() {
    if(!this.isRushing||!this.attackData) return null;
    const a=this.attackData;
    if(this.attackFrame<a.startup||this.attackFrame>=a.startup+a.active) return null;
    const hx=this.x+a.hitboxX*this.dir;
    return {x:this.dir===1?hx:hx-a.hitboxW, y:this.y-this.bodyH*0.5+a.hitboxY, w:a.hitboxW, h:a.hitboxH};
  }
  getDiveHitbox() {
    if(!this.isDiving||!this.attackData) return null;
    if(this.attackFrame<this.attackData.startup) return null;
    const a=this.attackData, hx=this.x+a.hitboxX*this.dir;
    return {x:this.dir===1?hx:hx-a.hitboxW, y:this.y+a.hitboxY, w:a.hitboxW, h:a.hitboxH};
  }

  update(input,opponent) {
    this.animFrame++;
    this.currentInput=input; // store for blocking check
    if(this.flashTimer>0) this.flashTimer--;
    if(this.guardShowTimer>0) this.guardShowTimer--;
    if(this.comboTimer>0){this.comboTimer--;if(this.comboTimer<=0)this.comboCount=0;}
    if(this.fstate!==FSTATE.ATTACK&&this.fstate!==FSTATE.HIT&&this.fstate!==FSTATE.KNOCKDOWN&&
       this.fstate!==FSTATE.DASH_F&&this.fstate!==FSTATE.DASH_B&&this.fstate!==FSTATE.THROW&&this.fstate!==FSTATE.THROWN)
      this.dir=this.x<opponent.x?1:-1;
    this._detectDoubleTap(input);

    switch(this.fstate) {
      case FSTATE.IDLE:case FSTATE.WALK_F:case FSTATE.WALK_B:
        this._handleMovement(input);this._handleAttacks(input,opponent);break;
      case FSTATE.CROUCH:
        if(!input.down)this.fstate=FSTATE.IDLE; this._handleCrouchAttacks(input,opponent);break;
      case FSTATE.JUMP: this._handleAirState(input);break;
      case FSTATE.ATTACK: this._handleAttackState();break;
      case FSTATE.DASH_F:case FSTATE.DASH_B:
        this.dashFrame++;
        const dd=this.fstate===FSTATE.DASH_F?1:-1;
        const ds=this.fstate===FSTATE.DASH_F?(this.data.dashSpeed||DASH_SPEED):BACKSTEP_SPEED;
        const dur=this.fstate===FSTATE.DASH_F?DASH_DURATION:BACKSTEP_DURATION;
        this.vx=dd*this.dir*ds*(1-this.dashFrame/dur);
        spawnDashTrail(this.x-this.dir*15,this.y-30,this.data.colors.gi+'88');
        if(this.dashFrame>=dur){this.fstate=FSTATE.IDLE;this.vx=0;}
        if(this.fstate===FSTATE.DASH_F&&this.dashFrame>4){
          if(input.lightJP)this._startAttack('light');
          else if(input.heavyJP)this._startAttack('heavy');
          else if(input.throwJP&&Math.abs(this.x-opponent.x)<THROW_RANGE)this._startThrow(opponent);
        }break;
      case FSTATE.HIT: this.hitStun--;this.vx*=0.85;if(this.hitStun<=0)this.fstate=FSTATE.IDLE;break;
      case FSTATE.KNOCKDOWN:
        this.knockdownTime--;this.vx*=0.9;this.vy+=GRAVITY;
        if(this.y>=GROUND_Y){this.y=GROUND_Y;this.vy=0;if(this.knockdownTime<=0)this.fstate=FSTATE.IDLE;}break;
      case FSTATE.BLOCK: this.blockStun--;this.vx*=0.85;if(this.blockStun<=0)this.fstate=FSTATE.IDLE;break;
      case FSTATE.THROW:
        this.throwFrame++;
        if(this.throwFrame===8&&this.throwTarget){
          const a=this.data.attacks.throw_atk;
          this.throwTarget.takeHit(a.damage,a.knockback,a.hitstun,this.dir,false);
          spawnThrowEffect(this.throwTarget.x,this.throwTarget.y-30);
          game.screenShake=10;this.super=Math.min(this.maxSuper,this.super+15);
          this.comboCount++;this.comboTimer=60;
        }
        if(this.throwFrame>=30){this.fstate=FSTATE.IDLE;this.throwTarget=null;}break;
      case FSTATE.THROWN:break;
      case FSTATE.VICTORY:case FSTATE.DEFEAT:break;
    }

    if(this.isRushing&&this.attackData){
      const p=(this.attackFrame-this.attackData.startup)/this.attackData.active;
      if(p>=0&&p<=1)this.vx=this.dir*8;
    }
    if(this.isDiving&&this.attackData&&this.attackFrame>=this.attackData.startup){this.vx=this.dir*3;this.vy=8;}

    this.x+=this.vx;this.y+=this.vy;
    // Ceiling clamp - prevent flying off screen
    const CEILING=80;
    if(this.y<CEILING){this.y=CEILING;if(this.vy<0)this.vy=0;}
    // Ground collision
    if(this.y>=GROUND_Y){this.y=GROUND_Y;this.vy=0;
      if(this.fstate===FSTATE.JUMP)this.fstate=FSTATE.IDLE;
      if(this.isDiving){this.isDiving=false;this.fstate=FSTATE.IDLE;this.attackData=null;game.screenShake=3;}
    }
    this.x=Math.max(STAGE_LEFT,Math.min(STAGE_RIGHT,this.x));
    const ol=this.bodyW-Math.abs(this.x-opponent.x);
    if(ol>0&&Math.abs(this.y-opponent.y)<this.bodyH){
      const p=ol/2;if(this.x<opponent.x){this.x-=p;opponent.x+=p;}else{this.x+=p;opponent.x-=p;}
    }
    this.wasDown=input.down;this.prevInput={...input};
  }

  _detectDoubleTap(input) {
    if(this.fstate!==FSTATE.IDLE&&this.fstate!==FSTATE.WALK_F&&this.fstate!==FSTATE.WALK_B) return;
    if(this._aiDash){this._aiDash=false;this.fstate=FSTATE.DASH_F;this.dashFrame=0;AudioEngine.play('dash');return;}
    const fwd=(this.dir===1&&input.right&&!this.prevInput.right)||(this.dir===-1&&input.left&&!this.prevInput.left);
    const bwd=(this.dir===1&&input.left&&!this.prevInput.left)||(this.dir===-1&&input.right&&!this.prevInput.right);
    if(fwd){if(this.lastTapDir===1&&this.lastTapTime>0){this.fstate=FSTATE.DASH_F;this.dashFrame=0;this.lastTapDir=0;this.lastTapTime=0;AudioEngine.play('dash');return;}this.lastTapDir=1;this.lastTapTime=DOUBLETAP_WINDOW;}
    else if(bwd){if(this.lastTapDir===-1&&this.lastTapTime>0){this.fstate=FSTATE.DASH_B;this.dashFrame=0;this.lastTapDir=0;this.lastTapTime=0;AudioEngine.play('dash');return;}this.lastTapDir=-1;this.lastTapTime=DOUBLETAP_WINDOW;}
    if(this.lastTapTime>0)this.lastTapTime--;if(this.lastTapTime<=0)this.lastTapDir=0;
  }

  _handleMovement(input) {
    this.vx=0;
    // Guard button = enter guard stance (can't move)
    if(input.guard){
      this.fstate=FSTATE.IDLE; // stay still, isBlockingAttack will handle the rest
      this.vx=0;
      return;
    }
    const fwd=(this.dir===1&&input.right)||(this.dir===-1&&input.left);
    const bwd=(this.dir===1&&input.left)||(this.dir===-1&&input.right);
    if(fwd){this.vx=this.data.walkSpeed*this.dir;this.fstate=FSTATE.WALK_F;}
    else if(bwd){this.vx=-this.data.walkSpeed*this.dir*0.7;this.fstate=FSTATE.WALK_B;}
    else this.fstate=FSTATE.IDLE;
    if(input.up&&this.y>=GROUND_Y){this.vy=this.data.jumpPower;this.fstate=FSTATE.JUMP;if(fwd)this.vx=this.data.walkSpeed*this.dir;else if(bwd)this.vx=-this.data.walkSpeed*this.dir*0.7;}
    if(input.down){this.fstate=FSTATE.CROUCH;this.vx=0;}
  }
  _handleAttacks(input,opponent) {
    if(input.throwJP&&opponent&&Math.abs(this.x-opponent.x)<THROW_RANGE){this._startThrow(opponent);return;}
    if(input.lightJP&&this.wasDown&&!input.down){this._startAttack('uppercut');return;}
    if(input.lightJP)this._startAttack('light');
    else if(input.heavyJP)this._startAttack('heavy');
    else if(input.specialJP)this._startAttack('special');
  }
  _handleCrouchAttacks(input) {
    if(input.up&&input.lightJP){this._startAttack('uppercut');this.vy=this.data.jumpPower*0.8;return;}
    if(input.lightJP)this._startAttack('crouch_light');
    else if(input.heavyJP)this._startAttack('crouch_heavy');
  }
  _handleAirState(input) {
    this.vy+=GRAVITY;
    if(this.fstate!==FSTATE.ATTACK&&!this.isDiving){
      if(input.down&&input.heavyJP&&this.vy>-2){this._startAttack('divekick');this.isDiving=true;return;}
      if(input.lightJP&&!this.hasHit)this._startAttack('air_light');
      else if(input.heavyJP&&!this.hasHit)this._startAttack('air_heavy');
    }
  }
  _startAttack(name) {
    const a=this.data.attacks[name];if(!a)return;
    this.fstate=FSTATE.ATTACK;this.attackFrame=0;this.attackData=a;this.attackName=name;
    this.hasHit=false;this.isRushing=a.type==='rush';
  }
  _startThrow(opponent) {
    if(!opponent||opponent.fstate===FSTATE.THROWN||opponent.fstate===FSTATE.KNOCKDOWN) return;
    if(opponent.prevInput&&opponent.prevInput.throw_btn){
      this.vx=-this.dir*5;opponent.vx=this.dir*5;
      spawnBlockParticles(this.x+this.dir*20,this.y-35);AudioEngine.play('block');return;
    }
    this.fstate=FSTATE.THROW;this.throwFrame=0;this.throwTarget=opponent;
    opponent.fstate=FSTATE.THROWN;opponent.vx=0;opponent.vy=0;AudioEngine.play('throw');
  }
  _handleAttackState() {
    this.attackFrame++;const a=this.attackData;if(!a){this.fstate=FSTATE.IDLE;return;}
    const total=a.startup+(a.type==='projectile'?5:a.active)+a.recovery;
    if(this.attackName==='uppercut'&&this.attackFrame>=a.startup&&this.attackFrame<a.startup+a.active)this.vy=-5;
    if(a.type==='projectile'&&this.attackFrame===a.startup){
      game.projectiles.push(new Projectile(this.x+30*this.dir,this.y-this.bodyH*0.5,this.dir,a.projSpeed,a.damage,a.knockback,a.hitstun,a.projColor,this.playerNum));
      AudioEngine.play('fireball');
    }
    if(this.attackFrame>=total){if(this.isDiving)return;this.fstate=this.y<GROUND_Y?FSTATE.JUMP:FSTATE.IDLE;this.attackData=null;this.attackName='';this.isRushing=false;}
  }

  takeHit(damage,knockback,hitstun,attackerDir,isBlocking,flags={}) {
    if(isBlocking){
      this.fstate=FSTATE.BLOCK;this.blockStun=Math.floor(hitstun*0.6);
      this.vx=attackerDir*knockback*0.3;this.hp-=Math.floor(damage*0.1);
      this.flashTimer=5;this.guardShowTimer=30;AudioEngine.play('block');
      game.screenShake=2;
      spawnBlockParticles(this.x-attackerDir*20,this.y-this.bodyH*0.5);return;
    }
    this.hp-=damage;this.super=Math.min(this.maxSuper,this.super+damage*0.8);this.flashTimer=8;
    spawnDamageNumber(this.x, this.y - this.bodyH - 10, damage, damage >= 14);
    if(this.hp<=0){this.hp=0;this.fstate=FSTATE.KNOCKDOWN;this.knockdownTime=60;this.vx=attackerDir*knockback*1.5;this.vy=-8;AudioEngine.play('ko');game.screenShake=15;game.slowMoFrames=30;game.screenFlash=8;game.screenFlashColor='#ffcc00';spawnHitParticles(this.x,this.y-this.bodyH*0.5,'#ffaa00',25);}
    else if(knockback>10||flags.forceKnockdown){this.fstate=FSTATE.KNOCKDOWN;this.knockdownTime=30;this.vx=attackerDir*knockback;this.vy=-6;game.screenShake=8;game.screenFlash=4;game.screenFlashColor='#ff8844';spawnHitParticles(this.x,this.y-this.bodyH*0.5,'#ff6600',18);}
    else if(flags.launch){this.fstate=FSTATE.KNOCKDOWN;this.knockdownTime=40;this.vx=attackerDir*knockback*0.5;this.vy=-12;game.screenShake=8;game.screenFlash=4;game.screenFlashColor='#ffdd44';spawnHitParticles(this.x,this.y-this.bodyH*0.5,'#ff8800',15);}
    else{this.fstate=FSTATE.HIT;this.hitStun=hitstun;this.vx=attackerDir*knockback;game.screenShake=4;if(damage>=10){game.screenFlash=2;game.screenFlashColor='#ffffff';}spawnHitParticles(this.x,this.y-this.bodyH*0.5,'#ffcc00',10);}
    this.attackFrame=0;this.attackData=null;this.attackName='';this.isRushing=false;this.isDiving=false;
  }

  isBlockingAttack(attackerDir) {
    if(this.fstate===FSTATE.HIT||this.fstate===FSTATE.KNOCKDOWN||this.fstate===FSTATE.ATTACK||this.fstate===FSTATE.THROW||this.fstate===FSTATE.THROWN||this.fstate===FSTATE.DASH_F||this.fstate===FSTATE.DASH_B)return false;
    const ci=this.currentInput||{};const pi=this.prevInput||{};
    // Guard button (C key / touch guard) = always blocks
    if(ci.guard||pi.guard) return true;
    // Back direction = traditional block
    const holdBack = (attackerDir>0&&(ci.left||pi.left)) || (attackerDir<0&&(ci.right||pi.right));
    return this.fstate===FSTATE.WALK_B || this.fstate===FSTATE.BLOCK ||
      ((this.fstate===FSTATE.IDLE||this.fstate===FSTATE.CROUCH) && holdBack);
  }

  // === DRAWING ===
  draw(ctx) {
    const bs=this.data.bodyScale||1;
    // 接地影 — 二段楕円（グラデなし軽量）
    const onGround=this.y>=GROUND_Y-1&&this.fstate!==FSTATE.JUMP&&this.fstate!==FSTATE.KNOCKDOWN;
    const airAlt=Math.max(0,GROUND_Y-this.y);
    const shAlpha=Math.max(0.10,0.45-airAlt/280);
    const shScale=onGround?1:Math.max(0.40,1-airAlt/300);
    ctx.fillStyle=`rgba(0,0,0,${shAlpha*0.5})`;
    ctx.beginPath();
    ctx.ellipse(this.x,GROUND_Y+3,32*bs*shScale,8*bs*shScale,0,0,Math.PI*2);
    ctx.fill();
    if(onGround){
      ctx.fillStyle='rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.ellipse(this.x,GROUND_Y+2,16*bs,3.5*bs,0,0,Math.PI*2);
      ctx.fill();
    }

    ctx.save();ctx.translate(this.x,this.y);
    ctx.scale(this.dir*bs,bs);
    const c=this.data.colors;
    if(this.flashTimer>0&&this.flashTimer%2===0) ctx.filter='brightness(3)';
    switch(this.fstate) {
      case FSTATE.IDLE:
        if((this.currentInput&&this.currentInput.guard)){this._drawBlock(ctx,c);}
        else{this._drawIdle(ctx,c);}break;
      case FSTATE.WALK_F:this._drawWalk(ctx,c,1);break;
      case FSTATE.WALK_B:this._drawWalk(ctx,c,-1);break;
      case FSTATE.JUMP:this._drawJump(ctx,c);break;
      case FSTATE.CROUCH:this._drawCrouch(ctx,c);break;
      case FSTATE.ATTACK:this._drawAttack(ctx,c);break;
      case FSTATE.HIT:this._drawHit(ctx,c);break;
      case FSTATE.KNOCKDOWN:this._drawKnockdown(ctx,c);break;
      case FSTATE.BLOCK:this._drawBlock(ctx,c);break;
      case FSTATE.DASH_F:case FSTATE.DASH_B:this._drawDash(ctx,c,this.fstate===FSTATE.DASH_F?1:-1);break;
      case FSTATE.THROW:this._drawThrowAnim(ctx,c);break;
      case FSTATE.THROWN:this._drawThrownAnim(ctx,c);break;
      case FSTATE.VICTORY:this._drawVictory(ctx,c);break;
      case FSTATE.DEFEAT:this._drawDefeat(ctx,c);break;
      default:this._drawIdle(ctx,c);
    }
    ctx.filter='none';ctx.restore();

    // Player indicator + name
    ctx.save();ctx.textAlign='center';
    // "YOU" marker for P1
    if(this.playerNum===1){
      ctx.fillStyle='#4488ff';ctx.font='bold 12px sans-serif';
      ctx.fillText('▼ YOU',this.x,this.y-this.bodyH-40);
    } else if(game.mode==='pvp') {
      ctx.fillStyle='#ff4444';ctx.font='bold 12px sans-serif';
      ctx.fillText('▼ P2',this.x,this.y-this.bodyH-40);
    } else {
      ctx.fillStyle='#ff4444';ctx.font='bold 12px sans-serif';
      ctx.fillText('▼ CPU',this.x,this.y-this.bodyH-40);
    }

    // combo
    if(this.comboCount>1){
      const p=1+Math.sin(this.animFrame*0.2)*0.1;
      ctx.fillStyle='#ffcc00';ctx.font=`bold ${Math.floor(20*p)}px sans-serif`;
      ctx.fillText(`${this.comboCount} HIT!`,this.x,this.y-this.bodyH-55);
    }
    // guard indicator
    if(this.guardShowTimer>0){
      const ga=this.guardShowTimer/30;
      ctx.globalAlpha=ga;
      ctx.fillStyle='#66ccff';ctx.font='bold 18px sans-serif';
      ctx.fillText('GUARD!',this.x,this.y-this.bodyH-55);
      ctx.globalAlpha=1;
    }
    ctx.restore();
  }

  // ---- DRAWING HELPERS ----
  _drawHead(ctx,c,x,y,tilt=0) {
    ctx.save();ctx.translate(x,y);ctx.rotate(tilt);
    const id=this.charId;
    // 顔の球体グラデ
    const skinG=ctx.createRadialGradient(-4,-4,2,0,0,12);
    skinG.addColorStop(0,_shade(c.skin,0.35));
    skinG.addColorStop(0.6,c.skin);
    skinG.addColorStop(1,_shade(c.skin,-0.45));
    ctx.fillStyle=skinG;ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();
    // 顎下の AO（アンビエントオクルージョン）
    ctx.save();
    const aoG=ctx.createRadialGradient(0,9,1,0,11,8);
    aoG.addColorStop(0,'rgba(0,0,0,0.35)');aoG.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=aoG;
    ctx.beginPath();ctx.ellipse(0,9,9,4,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    // 顔の輪郭（細い暗線）
    ctx.strokeStyle=_shade(c.skin,-0.55);ctx.lineWidth=0.8;
    ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.stroke();
    // スペキュラハイライト（鼻筋）
    ctx.save();
    const spG=ctx.createRadialGradient(-3,-4,0,-3,-4,5);
    spG.addColorStop(0,'rgba(255,255,255,0.55)');spG.addColorStop(1,'rgba(255,255,255,0)');
    ctx.fillStyle=spG;
    ctx.beginPath();ctx.ellipse(-3,-4,4,5,-0.4,0,Math.PI*2);ctx.fill();
    ctx.restore();

    // Per-character hair & features
    if(id==='kaito'){
      // Short dark hair + red headband with tail
      ctx.fillStyle=c.hair;ctx.beginPath();ctx.arc(0,-3,11,Math.PI,Math.PI*2);ctx.fill();
      ctx.fillStyle=c.headband;ctx.fillRect(-12,-13,24,5);ctx.fillRect(-15,-13,4,14);
    } else if(id==='akane'){
      // Long red ponytail + yellow headband
      ctx.fillStyle=c.hair;ctx.beginPath();ctx.arc(0,-3,11,Math.PI,Math.PI*2);ctx.fill();
      // Ponytail flowing back
      ctx.fillStyle=c.hair;
      ctx.beginPath();ctx.moveTo(-8,0);ctx.quadraticCurveTo(-16,8,-14,22);
      ctx.quadraticCurveTo(-12,24,-8,18);ctx.quadraticCurveTo(-6,8,-6,0);ctx.fill();
      ctx.fillStyle=c.headband;ctx.fillRect(-12,-12,24,4);
      // Hair bangs
      ctx.fillStyle=c.hair;ctx.fillRect(4,-10,6,8);
    } else if(id==='gouki'){
      // Wild spiked-up hair, thick brows, fierce look
      ctx.fillStyle=c.hair;
      ctx.beginPath();ctx.moveTo(-10,-4);ctx.lineTo(-12,-18);ctx.lineTo(-6,-10);
      ctx.lineTo(-3,-22);ctx.lineTo(0,-10);ctx.lineTo(4,-20);ctx.lineTo(6,-8);
      ctx.lineTo(10,-16);ctx.lineTo(11,-4);ctx.arc(0,-3,11,0,Math.PI,true);ctx.fill();
      // Thick angry brows
      ctx.fillStyle='#111';ctx.lineWidth=3;ctx.strokeStyle='#111';
      ctx.beginPath();ctx.moveTo(-6,-6);ctx.lineTo(-1,-8);ctx.stroke();
      ctx.beginPath();ctx.moveTo(2,-8);ctx.lineTo(7,-6);ctx.stroke();
      // Scar
      ctx.strokeStyle='#aa6666';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(5,-4);ctx.lineTo(8,4);ctx.stroke();
    } else if(id==='hikari'){
      // Long flowing blonde hair + golden tiara
      ctx.fillStyle=c.hair;ctx.beginPath();ctx.arc(0,-3,11,Math.PI,Math.PI*2);ctx.fill();
      // Long hair flowing both sides
      ctx.fillStyle=c.hair;
      ctx.beginPath();ctx.moveTo(-10,-2);ctx.quadraticCurveTo(-14,10,-12,26);
      ctx.lineTo(-8,24);ctx.quadraticCurveTo(-8,8,-8,-2);ctx.fill();
      ctx.beginPath();ctx.moveTo(10,-2);ctx.quadraticCurveTo(14,10,12,26);
      ctx.lineTo(8,24);ctx.quadraticCurveTo(8,8,8,-2);ctx.fill();
      // Golden tiara
      ctx.fillStyle='#ffdd44';
      ctx.beginPath();ctx.moveTo(-8,-12);ctx.lineTo(-5,-18);ctx.lineTo(-2,-12);
      ctx.lineTo(0,-16);ctx.lineTo(2,-12);ctx.lineTo(5,-18);ctx.lineTo(8,-12);ctx.fill();
      // Gentle eyes
      ctx.fillStyle='#4488cc';ctx.fillRect(3,-2,3,2);ctx.fillRect(-2,-2,3,2);
      ctx.restore();return;
    } else if(id==='tetsu'){
      // Bald/buzz cut + scars + jaw
      ctx.fillStyle=c.hair;
      ctx.beginPath();ctx.arc(0,-4,10.5,Math.PI,Math.PI*2);ctx.fill();
      // Stubble effect
      ctx.fillStyle='rgba(100,100,100,0.3)';
      ctx.fillRect(-6,2,12,6);
      // Scar across eye
      ctx.strokeStyle='#cc8888';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(-8,-6);ctx.lineTo(-2,4);ctx.stroke();
      // Shoulder armor hint
      ctx.fillStyle='#667788';
      ctx.fillRect(-16,8,6,4);ctx.fillRect(10,8,6,4);
    } else if(id==='yuki'){
      // Long flowing white/ice hair + scarf
      ctx.fillStyle=c.hair;ctx.beginPath();ctx.arc(0,-3,11,Math.PI,Math.PI*2);ctx.fill();
      // Flowing long hair
      const wave=Math.sin(this.animFrame*0.1)*3;
      ctx.fillStyle=c.hair;
      ctx.beginPath();ctx.moveTo(-9,0);ctx.quadraticCurveTo(-12+wave,12,-10+wave,28);
      ctx.lineTo(-6+wave,26);ctx.quadraticCurveTo(-7,10,-7,0);ctx.fill();
      ctx.beginPath();ctx.moveTo(9,0);ctx.quadraticCurveTo(12+wave,12,10+wave,28);
      ctx.lineTo(6+wave,26);ctx.quadraticCurveTo(7,10,7,0);ctx.fill();
      // Ice crystal headpiece
      ctx.fillStyle='#aaeeff';
      ctx.beginPath();ctx.moveTo(0,-16);ctx.lineTo(-3,-11);ctx.lineTo(0,-13);ctx.lineTo(3,-11);ctx.closePath();ctx.fill();
      // Scarf
      ctx.fillStyle=c.headband;
      ctx.beginPath();ctx.moveTo(-6,6);ctx.quadraticCurveTo(-10+wave,14,-8+wave,22);
      ctx.lineTo(-5+wave,20);ctx.quadraticCurveTo(-7,12,-4,6);ctx.fill();
    } else if(id==='ren'){
      // Spiky upward hair + green headband
      ctx.fillStyle=c.hair;
      ctx.beginPath();ctx.moveTo(-9,-4);ctx.lineTo(-7,-16);ctx.lineTo(-4,-6);
      ctx.lineTo(-1,-18);ctx.lineTo(1,-6);ctx.lineTo(4,-16);ctx.lineTo(7,-4);
      ctx.lineTo(9,-14);ctx.lineTo(10,-3);ctx.arc(0,-3,11,0,Math.PI,true);ctx.fill();
      ctx.fillStyle=c.headband;ctx.fillRect(-12,-10,24,4);
      // Confident grin
      ctx.strokeStyle='#111';ctx.lineWidth=1.5;
      ctx.beginPath();ctx.arc(0,3,4,0.1,Math.PI-0.1);ctx.stroke();
    } else if(id==='maki'){
      // Hood + face mask, only eyes visible
      ctx.fillStyle=c.hair;ctx.beginPath();ctx.arc(0,-3,13,Math.PI,Math.PI*2);ctx.fill();
      // Hood drape sides
      ctx.fillStyle=c.gi;
      ctx.beginPath();ctx.moveTo(-12,-6);ctx.quadraticCurveTo(-15,4,-13,12);
      ctx.lineTo(-10,10);ctx.quadraticCurveTo(-11,2,-10,-4);ctx.fill();
      ctx.beginPath();ctx.moveTo(12,-6);ctx.quadraticCurveTo(15,4,13,12);
      ctx.lineTo(10,10);ctx.quadraticCurveTo(11,2,10,-4);ctx.fill();
      // Face mask (covers lower face)
      ctx.fillStyle='#222';ctx.fillRect(-8,0,16,8);
      // Only eyes visible - glowing
      ctx.fillStyle=c.headband;ctx.fillRect(3,-3,4,3);ctx.fillRect(-3,-3,4,3);
      ctx.restore();return;
    }

    // Eyes
    if(id==='gouki'){
      // Red glowing eyes
      ctx.fillStyle='#ff2200';ctx.fillRect(3,-3,4,3);ctx.fillRect(-3,-3,4,3);
    } else if(id==='ren'){
      // Already has grin drawn above, just eyes
      ctx.fillStyle='#111';ctx.fillRect(3,-2,3,3);ctx.fillRect(-2,-2,3,3);
    } else {
      ctx.fillStyle='#111';ctx.fillRect(3,-2,3,3);ctx.fillRect(-2,-2,3,3);
    }
    ctx.restore();
  }

  _drawBody(ctx,c,x,y,w,h) {
    const id=this.charId;
    // 道着のグラデ（縦＋横）
    const giG=ctx.createLinearGradient(x-w/2,y,x+w/2,y);
    giG.addColorStop(0,_shade(c.gi,-0.45));
    giG.addColorStop(0.4,c.gi);
    giG.addColorStop(0.7,_shade(c.gi,0.15));
    giG.addColorStop(1,_shade(c.gi,-0.25));
    const giVG=ctx.createLinearGradient(0,y,0,y+h);
    giVG.addColorStop(0,_shade(c.gi,0.2));
    giVG.addColorStop(0.5,c.gi);
    giVG.addColorStop(1,_shade(c.gi,-0.35));
    const beltG=ctx.createLinearGradient(0,y+h*0.6,0,y+h*0.75);
    beltG.addColorStop(0,_shade(c.belt,0.3));beltG.addColorStop(0.5,c.belt);beltG.addColorStop(1,_shade(c.belt,-0.5));
    const outline=_shade(c.gi,-0.7);
    ctx.lineJoin='round';

    if(id==='hikari'){
      // ローブ — フレア付き
      ctx.fillStyle=giG;
      ctx.beginPath();
      ctx.moveTo(x-w/2,y+3);
      ctx.quadraticCurveTo(x-w/2-2,y,x-w/2+2,y);
      ctx.lineTo(x+w/2-2,y);
      ctx.quadraticCurveTo(x+w/2+2,y,x+w/2,y+3);
      ctx.lineTo(x+w/2+5,y+h);
      ctx.quadraticCurveTo(x,y+h+3,x-w/2-5,y+h);
      ctx.closePath();ctx.fill();
      // 中央 AO
      ctx.save();ctx.clip();
      const ao=ctx.createLinearGradient(x-w/2,0,x+w/2,0);
      ao.addColorStop(0,'rgba(0,0,0,0.32)');ao.addColorStop(0.5,'rgba(0,0,0,0)');ao.addColorStop(1,'rgba(0,0,0,0.32)');
      ctx.fillStyle=ao;ctx.fillRect(x-w/2-6,y,w+12,h);
      // 上部光沢
      const sh=ctx.createRadialGradient(x-3,y+5,1,x-3,y+5,18);
      sh.addColorStop(0,'rgba(255,255,255,0.5)');sh.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=sh;ctx.fillRect(x-w/2-6,y,w+12,h*0.5);
      ctx.restore();
      ctx.strokeStyle=outline;ctx.lineWidth=1;ctx.stroke();
      // 帯
      ctx.fillStyle=beltG;
      ctx.beginPath();ctx.moveTo(x-w/2,y+h*0.5);ctx.lineTo(x+w/2,y+h*0.5);
      ctx.lineTo(x+w/2+2,y+h*0.5+5);ctx.lineTo(x-w/2-2,y+h*0.5+5);ctx.fill();
      // 光のシンボル
      ctx.save();ctx.shadowColor='#ffee88';ctx.shadowBlur=10;
      const lightG=ctx.createRadialGradient(x,y+h*0.3,1,x,y+h*0.3,8);
      lightG.addColorStop(0,'rgba(255,255,200,0.85)');lightG.addColorStop(1,'rgba(255,238,136,0)');
      ctx.fillStyle=lightG;
      ctx.beginPath();ctx.arc(x,y+h*0.3,8,0,Math.PI*2);ctx.fill();
      ctx.restore();
    } else if(id==='tetsu'){
      // 装甲 — 厚みのある立体プレート
      const X=x-w/2-3, W2=w+6;
      ctx.fillStyle=giVG;
      FX.roundRect(ctx,X,y,W2,h,3);ctx.fill();
      // 中央 AO
      ctx.save();FX.roundRect(ctx,X,y,W2,h,3);ctx.clip();
      const ao=ctx.createLinearGradient(X,0,X+W2,0);
      ao.addColorStop(0,'rgba(0,0,0,0.35)');ao.addColorStop(0.3,'rgba(0,0,0,0.05)');
      ao.addColorStop(0.7,'rgba(0,0,0,0.05)');ao.addColorStop(1,'rgba(0,0,0,0.35)');
      ctx.fillStyle=ao;ctx.fillRect(X,y,W2,h);
      ctx.restore();
      // 上部プレート（金属）
      const plateG=ctx.createLinearGradient(0,y,0,y+h*0.3);
      plateG.addColorStop(0,_shade(c.giLight,0.55));
      plateG.addColorStop(0.4,c.giLight);
      plateG.addColorStop(1,_shade(c.giLight,-0.5));
      ctx.fillStyle=plateG;
      FX.roundRect(ctx,X,y,W2,h*0.3,3);ctx.fill();
      // メタリックハイライト
      ctx.fillStyle='rgba(255,255,255,0.55)';
      FX.roundRect(ctx,X+2,y+1.5,W2-4,2,1);ctx.fill();
      // リベット
      ctx.fillStyle='rgba(0,0,0,0.6)';
      [0.15,0.5,0.85].forEach(p=>{
        ctx.beginPath();ctx.arc(X+W2*p,y+h*0.18,1.5,0,Math.PI*2);ctx.fill();
      });
      // プレート分割
      ctx.strokeStyle='#1a1d28';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(X,y+h*0.3);ctx.lineTo(X+W2,y+h*0.3);ctx.stroke();
      ctx.beginPath();ctx.moveTo(X,y+h*0.65);ctx.lineTo(X+W2,y+h*0.65);ctx.stroke();
      // ベルト
      ctx.fillStyle=beltG;FX.roundRect(ctx,X,y+h*0.65,W2,5,2);ctx.fill();
      // 全体の輪郭
      ctx.strokeStyle=outline;ctx.lineWidth=1;
      FX.roundRect(ctx,X,y,W2,h,3);ctx.stroke();
    } else if(id==='maki'){
      // スリムな闇のボディ
      ctx.fillStyle=giG;
      FX.roundRect(ctx,x-w/2,y,w,h,4);ctx.fill();
      // 中央 AO + 縁影
      ctx.save();FX.roundRect(ctx,x-w/2,y,w,h,4);ctx.clip();
      const ao=ctx.createLinearGradient(x-w/2,0,x+w/2,0);
      ao.addColorStop(0,'rgba(0,0,0,0.5)');ao.addColorStop(0.5,'rgba(0,0,0,0.05)');ao.addColorStop(1,'rgba(0,0,0,0.5)');
      ctx.fillStyle=ao;ctx.fillRect(x-w/2,y,w,h);
      // 紫の縁発光
      const rim=ctx.createLinearGradient(0,y,0,y+h);
      rim.addColorStop(0,'rgba(180,80,200,0.25)');rim.addColorStop(1,'rgba(180,80,200,0)');
      ctx.fillStyle=rim;ctx.fillRect(x-w/2,y,w,h*0.5);
      ctx.restore();
      // マント
      const capeG=ctx.createLinearGradient(x-w/2-8,y,x-w/2,y+h);
      capeG.addColorStop(0,_shade(c.giLight,-0.4));
      capeG.addColorStop(0.5,c.giLight);
      capeG.addColorStop(1,_shade(c.giLight,-0.7));
      ctx.fillStyle=capeG;
      ctx.beginPath();ctx.moveTo(x-w/2-2,y+2);
      ctx.quadraticCurveTo(x-w/2-9,y+h*0.5,x-w/2-6,y+h+5);
      ctx.lineTo(x-w/2,y+h);ctx.lineTo(x-w/2,y);ctx.fill();
      // マント縁の暗線
      ctx.strokeStyle='rgba(0,0,0,0.6)';ctx.lineWidth=0.8;
      ctx.beginPath();
      ctx.moveTo(x-w/2-2,y+2);
      ctx.quadraticCurveTo(x-w/2-9,y+h*0.5,x-w/2-6,y+h+5);
      ctx.stroke();
      // 帯
      ctx.fillStyle=beltG;FX.roundRect(ctx,x-w/2,y+h*0.65,w,3,1);ctx.fill();
      ctx.strokeStyle=outline;ctx.lineWidth=1;
      FX.roundRect(ctx,x-w/2,y,w,h,4);ctx.stroke();
    } else if(id==='gouki'){
      // 筋肉質 — 立体的な台形+丸み
      ctx.fillStyle=giG;
      ctx.beginPath();
      ctx.moveTo(x-w/2-2,y);
      ctx.quadraticCurveTo(x-w/2-5,y-1,x-w/2-4,y+4);
      ctx.lineTo(x-w/2-2,y+h);
      ctx.quadraticCurveTo(x,y+h+3,x+w/2+2,y+h);
      ctx.lineTo(x+w/2+4,y+4);
      ctx.quadraticCurveTo(x+w/2+5,y-1,x+w/2+2,y);
      ctx.closePath();ctx.fill();
      // 中央 AO + 大胸筋陰影
      ctx.save();ctx.clip();
      const ao=ctx.createLinearGradient(x-w/2,0,x+w/2,0);
      ao.addColorStop(0,'rgba(0,0,0,0.45)');ao.addColorStop(0.3,'rgba(0,0,0,0)');
      ao.addColorStop(0.7,'rgba(0,0,0,0)');ao.addColorStop(1,'rgba(0,0,0,0.45)');
      ctx.fillStyle=ao;ctx.fillRect(x-w/2-6,y,w+12,h);
      // 中央分割（胸筋）
      ctx.fillStyle='rgba(0,0,0,0.3)';
      ctx.fillRect(x-0.6,y+h*0.18,1.2,h*0.45);
      // 上部光沢
      const sh=ctx.createRadialGradient(x-3,y+5,1,x-3,y+5,16);
      sh.addColorStop(0,'rgba(255,200,150,0.3)');sh.addColorStop(1,'rgba(255,200,150,0)');
      ctx.fillStyle=sh;ctx.fillRect(x-w/2-6,y,w+12,h*0.5);
      ctx.restore();
      ctx.strokeStyle=outline;ctx.lineWidth=1.2;
      ctx.beginPath();
      ctx.moveTo(x-w/2-2,y);
      ctx.quadraticCurveTo(x-w/2-5,y-1,x-w/2-4,y+4);
      ctx.lineTo(x-w/2-2,y+h);
      ctx.quadraticCurveTo(x,y+h+3,x+w/2+2,y+h);
      ctx.lineTo(x+w/2+4,y+4);
      ctx.quadraticCurveTo(x+w/2+5,y-1,x+w/2+2,y);
      ctx.closePath();ctx.stroke();
      // V ネック
      const skinG=ctx.createLinearGradient(0,y,0,y+h*0.5);
      skinG.addColorStop(0,_shade(c.giLight,0.2));
      skinG.addColorStop(1,_shade(c.giLight,-0.35));
      ctx.fillStyle=skinG;
      ctx.beginPath();ctx.moveTo(x-2,y);ctx.lineTo(x+w/3+2,y);ctx.lineTo(x+2,y+h*0.5);ctx.lineTo(x-w/3-2,y);ctx.closePath();ctx.fill();
      // 帯
      ctx.fillStyle=beltG;ctx.fillRect(x-w/2-4,y+h*0.65,w+8,5);
      // 肩パッド（球体）
      const sg=ctx.createRadialGradient(x-w/2-6,y,1,x-w/2-4,y+2,8);
      sg.addColorStop(0,_shade(c.gi,0.4));sg.addColorStop(0.6,c.gi);sg.addColorStop(1,_shade(c.gi,-0.6));
      ctx.fillStyle=sg;
      ctx.beginPath();ctx.arc(x-w/2-4,y+2,6,0,Math.PI*2);ctx.fill();
      const sg2=ctx.createRadialGradient(x+w/2+2,y,1,x+w/2+4,y+2,8);
      sg2.addColorStop(0,_shade(c.gi,0.4));sg2.addColorStop(0.6,c.gi);sg2.addColorStop(1,_shade(c.gi,-0.6));
      ctx.fillStyle=sg2;
      ctx.beginPath();ctx.arc(x+w/2+4,y+2,6,0,Math.PI*2);ctx.fill();
    } else {
      // デフォルト道着 — 丸み付き立体ボディ
      ctx.fillStyle=giG;
      FX.roundRect(ctx,x-w/2,y,w,h,5);ctx.fill();
      // 中央に縦の影帯（胴体の丸みを表現）
      ctx.save();FX.roundRect(ctx,x-w/2,y,w,h,5);ctx.clip();
      const ao=ctx.createLinearGradient(x-w/2,0,x+w/2,0);
      ao.addColorStop(0,'rgba(0,0,0,0.28)');
      ao.addColorStop(0.25,'rgba(0,0,0,0)');
      ao.addColorStop(0.75,'rgba(0,0,0,0)');
      ao.addColorStop(1,'rgba(0,0,0,0.28)');
      ctx.fillStyle=ao;ctx.fillRect(x-w/2,y,w,h);
      // 上部の光沢
      const sheen=ctx.createRadialGradient(x-2,y+4,1,x-2,y+4,16);
      sheen.addColorStop(0,'rgba(255,255,255,0.45)');
      sheen.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=sheen;ctx.fillRect(x-w/2,y,w,h*0.5);
      ctx.restore();
      // V ネック
      const vG=ctx.createLinearGradient(0,y,0,y+h*0.4);
      vG.addColorStop(0,_shade(c.giLight,0.2));
      vG.addColorStop(1,_shade(c.giLight,-0.3));
      ctx.fillStyle=vG;
      ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w/3,y);ctx.lineTo(x+2,y+h*0.4);ctx.lineTo(x-w/3,y);ctx.closePath();ctx.fill();
      // ベルト（丸み）
      ctx.fillStyle=beltG;
      FX.roundRect(ctx,x-w/2-1,y+h*0.65,w+2,5,2);ctx.fill();
      // ベルトハイライト
      ctx.fillStyle='rgba(255,255,255,0.3)';
      ctx.fillRect(x-w/2,y+h*0.65+0.5,w,1.2);
      // 輪郭
      ctx.strokeStyle=outline;ctx.lineWidth=1;
      FX.roundRect(ctx,x-w/2,y,w,h,5);ctx.stroke();
    }
  }

  _drawLimb(ctx,color,x1,y1,x2,y2,w) {
    ctx.lineCap='round';
    // 暗い輪郭線
    ctx.strokeStyle=_shade(color,-0.55);
    ctx.lineWidth=w+1.2;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    // メインカラー
    ctx.strokeStyle=color;
    ctx.lineWidth=w;
    ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke();
    // ハイライト（光は左上から、軽量化のため1本のみ）
    const dx=x2-x1, dy=y2-y1, len=Math.hypot(dx,dy)||1;
    const px=-dy/len, py=dx/len;
    ctx.strokeStyle=_shade(color,0.4);
    ctx.lineWidth=Math.max(1,w*0.32);
    ctx.beginPath();ctx.moveTo(x1-px*w*0.25,y1-py*w*0.25);ctx.lineTo(x2-px*w*0.25,y2-py*w*0.25);ctx.stroke();
  }
  _drawFist(ctx,c,x,y) {
    if(this.charId==='tetsu'){
      // 装甲ガントレット
      const g=ctx.createLinearGradient(x-5,y-5,x+5,y+5);
      g.addColorStop(0,_shade(c.gi,0.35));g.addColorStop(0.5,c.gi);g.addColorStop(1,_shade(c.gi,-0.5));
      ctx.fillStyle=g;
      ctx.fillRect(x-5,y-5,10,10);
      ctx.fillStyle='rgba(255,255,255,0.5)';ctx.fillRect(x-4,y-4,8,2);
      ctx.strokeStyle=_shade(c.gi,-0.7);ctx.lineWidth=0.8;
      ctx.strokeRect(x-5,y-5,10,10);
    } else {
      // 拳（球体ライティング）
      const g=ctx.createRadialGradient(x-2,y-2,1,x,y,6);
      g.addColorStop(0,_shade(c.skin,0.4));g.addColorStop(0.6,c.skin);g.addColorStop(1,_shade(c.skin,-0.4));
      ctx.fillStyle=g;
      ctx.beginPath();ctx.arc(x,y,4.5,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle=_shade(c.skin,-0.55);ctx.lineWidth=0.8;
      ctx.beginPath();ctx.arc(x,y,4.5,0,Math.PI*2);ctx.stroke();
    }
  }
  _drawFoot(ctx,c,x,y) {
    let baseColor;
    if(this.charId==='hikari') baseColor='#cc9944';
    else if(this.charId==='tetsu') baseColor='#56627a';
    else if(this.charId==='maki') baseColor='#1c0c20';
    else baseColor='#553a22';
    const w=this.charId==='tetsu'?12:9;
    const h=this.charId==='hikari'?5:6;
    const g=ctx.createLinearGradient(0,y-h/2,0,y+h/2);
    g.addColorStop(0,_shade(baseColor,0.4));g.addColorStop(0.5,baseColor);g.addColorStop(1,_shade(baseColor,-0.5));
    ctx.fillStyle=g;
    FX.roundRect(ctx,x-3,y-h/2,w,h,2);ctx.fill();
    ctx.strokeStyle=_shade(baseColor,-0.6);ctx.lineWidth=0.8;
    FX.roundRect(ctx,x-3,y-h/2,w,h,2);ctx.stroke();
    // 上面ハイライト
    ctx.fillStyle='rgba(255,255,255,0.25)';
    FX.roundRect(ctx,x-3+1,y-h/2+1,w-2,h*0.35,1);ctx.fill();
  }

  _drawIdle(ctx,c) {
    const b=Math.sin(this.animFrame*0.08)*2;
    const id=this.charId;

    // Aura effects (behind character)
    if(id==='gouki'){
      ctx.save();ctx.globalAlpha=0.08+Math.sin(this.animFrame*0.06)*0.04;
      ctx.fillStyle='#8800cc';
      ctx.beginPath();ctx.arc(0,-20+b,35,0,Math.PI*2);ctx.fill();ctx.restore();
    } else if(id==='hikari'){
      ctx.save();ctx.globalAlpha=0.06+Math.sin(this.animFrame*0.05)*0.03;
      ctx.fillStyle='#ffee66';
      ctx.beginPath();ctx.arc(0,-25+b,30,0,Math.PI*2);ctx.fill();ctx.restore();
    } else if(id==='maki'){
      ctx.save();ctx.globalAlpha=0.05+Math.sin(this.animFrame*0.04)*0.03;
      ctx.fillStyle='#440066';
      for(let i=0;i<3;i++){const ox=Math.sin(this.animFrame*0.03+i*2)*8;
        ctx.beginPath();ctx.arc(ox,-20+b-i*5,20-i*4,0,Math.PI*2);ctx.fill();}
      ctx.restore();
    }

    if(id==='gouki'){
      // Wide power stance, arms slightly apart, menacing lean forward
      this._drawLimb(ctx,c.pants,-12,0,-16,18+b,10);this._drawLimb(ctx,c.pants,-16,18+b,-14,34+b,9);this._drawFoot(ctx,c,-14,34+b);
      this._drawLimb(ctx,c.pants,12,0,16,18+b,10);this._drawLimb(ctx,c.pants,16,18+b,14,34+b,9);this._drawFoot(ctx,c,14,34+b);
      this._drawBody(ctx,c,2,-38+b,28,38);
      this._drawLimb(ctx,c.gi,-16,-32+b,-24,-18+b,8);this._drawLimb(ctx,c.skin,-24,-18+b,-22,-6+b,7);this._drawFist(ctx,c,-22,-6+b);
      this._drawLimb(ctx,c.gi,16,-32+b,26,-16+b,8);this._drawLimb(ctx,c.skin,26,-16+b,28,-4+b,7);this._drawFist(ctx,c,28,-4+b);
      this._drawHead(ctx,c,2,-52+b);
    } else if(id==='hikari'){
      // Elegant stance, one hand raised gracefully
      const ab=Math.sin(this.animFrame*0.06+1)*2;
      this._drawLimb(ctx,c.pants,-6,0,-6,18+b,8);this._drawLimb(ctx,c.pants,-6,18+b,-6,34+b,7);this._drawFoot(ctx,c,-6,34+b);
      this._drawLimb(ctx,c.pants,6,0,8,18+b,8);this._drawLimb(ctx,c.pants,8,18+b,6,34+b,7);this._drawFoot(ctx,c,6,34+b);
      this._drawBody(ctx,c,0,-38+b,28,38);
      // Left arm at side
      this._drawLimb(ctx,c.gi,-14,-32+b,-16,-18+ab,6);this._drawLimb(ctx,c.skin,-16,-18+ab,-14,-8+ab,5);this._drawFist(ctx,c,-14,-8+ab);
      // Right arm raised elegantly
      this._drawLimb(ctx,c.gi,14,-34+b,22,-44+ab,6);this._drawLimb(ctx,c.skin,22,-44+ab,18,-52+ab,5);this._drawFist(ctx,c,18,-52+ab);
      this._drawHead(ctx,c,0,-52+b);
    } else if(id==='tetsu'){
      // Heavy wide stance, fists clenched forward
      this._drawLimb(ctx,c.pants,-12,0,-15,16+b,11);this._drawLimb(ctx,c.pants,-15,16+b,-14,34+b,10);this._drawFoot(ctx,c,-14,34+b);
      this._drawLimb(ctx,c.pants,12,0,15,16+b,11);this._drawLimb(ctx,c.pants,15,16+b,14,34+b,10);this._drawFoot(ctx,c,14,34+b);
      this._drawBody(ctx,c,0,-38+b,28,38);
      // Both arms forward in guard
      const ab=Math.sin(this.animFrame*0.07)*1;
      this._drawLimb(ctx,c.gi,-14,-30+b,-8,-16+ab,9);this._drawLimb(ctx,c.skin,-8,-16+ab,2,-18+ab,8);this._drawFist(ctx,c,2,-18+ab);
      this._drawLimb(ctx,c.gi,14,-30+b,18,-14+ab,9);this._drawLimb(ctx,c.skin,18,-14+ab,24,-10+ab,8);this._drawFist(ctx,c,24,-10+ab);
      this._drawHead(ctx,c,0,-52+b);
    } else if(id==='yuki'){
      // Playful loose stance, one hand behind back
      const ab=Math.sin(this.animFrame*0.09+0.5)*3;
      this._drawLimb(ctx,c.pants,-5,0,-4,18+b,8);this._drawLimb(ctx,c.pants,-4,18+b,-5,34+b,7);this._drawFoot(ctx,c,-5,34+b);
      this._drawLimb(ctx,c.pants,7,0,10,16+b,8);this._drawLimb(ctx,c.pants,10,16+b,8,34+b,7);this._drawFoot(ctx,c,8,34+b);
      this._drawBody(ctx,c,1,-38+b,28,38);
      // Left arm behind back
      this._drawLimb(ctx,c.gi,-14,-32+b,-18,-22+ab,6);this._drawLimb(ctx,c.skin,-18,-22+ab,-12,-14+ab,5);
      // Right arm forward loosely
      this._drawLimb(ctx,c.gi,14,-32+b,22,-22+ab,6);this._drawLimb(ctx,c.skin,22,-22+ab,20,-12+ab,5);this._drawFist(ctx,c,20,-12+ab);
      this._drawHead(ctx,c,1,-52+b,Math.sin(this.animFrame*0.04)*0.05);
    } else if(id==='ren'){
      // Dynamic kung fu stance, one leg raised slightly, fists ready
      const ab=Math.sin(this.animFrame*0.1)*2;
      this._drawLimb(ctx,c.pants,-8,0,-10,18+b,9);this._drawLimb(ctx,c.pants,-10,18+b,-8,34+b,8);this._drawFoot(ctx,c,-8,34+b);
      // Right leg slightly lifted
      const legLift=Math.abs(Math.sin(this.animFrame*0.04))*4;
      this._drawLimb(ctx,c.pants,8,0,12,14+b-legLift,9);this._drawLimb(ctx,c.pants,12,14+b-legLift,10,28+b-legLift,8);this._drawFoot(ctx,c,10,28+b-legLift);
      this._drawBody(ctx,c,0,-38+b,28,38);
      // Both arms up in guard, bouncing
      this._drawLimb(ctx,c.gi,-14,-32+b,-6,-24+ab,7);this._drawLimb(ctx,c.skin,-6,-24+ab,0,-18+ab,6);this._drawFist(ctx,c,0,-18+ab);
      this._drawLimb(ctx,c.gi,14,-32+b,22,-26+ab,7);this._drawLimb(ctx,c.skin,22,-26+ab,26,-20+ab,6);this._drawFist(ctx,c,26,-20+ab);
      this._drawHead(ctx,c,0,-52+b);
    } else if(id==='maki'){
      // Low stealth stance, arms crossed, slightly crouched
      const ab=Math.sin(this.animFrame*0.06)*1.5;
      this._drawLimb(ctx,c.pants,-8,2,-12,20+b,8);this._drawLimb(ctx,c.pants,-12,20+b,-10,34+b,7);this._drawFoot(ctx,c,-10,34+b);
      this._drawLimb(ctx,c.pants,8,2,12,18+b,8);this._drawLimb(ctx,c.pants,12,18+b,10,34+b,7);this._drawFoot(ctx,c,10,34+b);
      this._drawBody(ctx,c,0,-36+b,28,38);
      // Arms crossed in front
      this._drawLimb(ctx,c.gi,-14,-30+b,4,-26+ab,7);this._drawLimb(ctx,c.skin,4,-26+ab,14,-22+ab,6);this._drawFist(ctx,c,14,-22+ab);
      this._drawLimb(ctx,c.gi,14,-28+b,-2,-24+ab,7);this._drawLimb(ctx,c.skin,-2,-24+ab,-10,-20+ab,6);this._drawFist(ctx,c,-10,-20+ab);
      this._drawHead(ctx,c,0,-50+b);
    } else if(id==='akane'){
      // Agile stance, side-facing, one fist forward
      const ab=Math.sin(this.animFrame*0.1+1)*2;
      this._drawLimb(ctx,c.pants,-6,0,-8,18+b,8);this._drawLimb(ctx,c.pants,-8,18+b,-6,34+b,7);this._drawFoot(ctx,c,-6,34+b);
      this._drawLimb(ctx,c.pants,8,0,12,16+b,8);this._drawLimb(ctx,c.pants,12,16+b,10,34+b,7);this._drawFoot(ctx,c,10,34+b);
      this._drawBody(ctx,c,2,-38+b,28,38);
      // Back arm tucked
      this._drawLimb(ctx,c.gi,-14,-32+b,-10,-20+ab,6);this._drawLimb(ctx,c.skin,-10,-20+ab,-6,-12+ab,5);this._drawFist(ctx,c,-6,-12+ab);
      // Front fist extended
      this._drawLimb(ctx,c.gi,14,-34+b,26,-30+ab,7);this._drawLimb(ctx,c.skin,26,-30+ab,32,-28+ab,6);this._drawFist(ctx,c,32,-28+ab);
      this._drawHead(ctx,c,2,-52+b);
    } else {
      // Default (Kaito) - balanced fighting stance
      const ab=Math.sin(this.animFrame*0.08+1)*2;
      this._drawLimb(ctx,c.pants,-8,0,-10,18+b,9);this._drawLimb(ctx,c.pants,-10,18+b,-8,34+b,8);this._drawFoot(ctx,c,-8,34+b);
      this._drawLimb(ctx,c.pants,8,0,10,18+b,9);this._drawLimb(ctx,c.pants,10,18+b,8,34+b,8);this._drawFoot(ctx,c,8,34+b);
      this._drawBody(ctx,c,0,-38+b,28,38);
      this._drawLimb(ctx,c.gi,-14,-32+b,-18,-16+ab,7);this._drawLimb(ctx,c.skin,-18,-16+ab,-14,-4+ab,6);this._drawFist(ctx,c,-14,-4+ab);
      this._drawLimb(ctx,c.gi,14,-32+b,20,-18+ab,7);this._drawLimb(ctx,c.skin,20,-18+ab,22,-6+ab,6);this._drawFist(ctx,c,22,-6+ab);
      this._drawHead(ctx,c,0,-52+b);
    }
  }
  _drawWalk(ctx,c,d) {
    const id=this.charId;
    // Heavy chars walk slower/wider, light chars walk faster/tighter
    const spd = (id==='gouki'||id==='tetsu') ? 0.10 : (id==='ren'||id==='akane'||id==='yuki') ? 0.20 : 0.15;
    const amp = (id==='gouki'||id==='tetsu') ? 12 : (id==='ren'||id==='akane') ? 8 : 10;
    const lw = (id==='gouki'||id==='tetsu') ? 11 : (id==='hikari'||id==='yuki') ? 7 : 9;
    const s=Math.sin(this.animFrame*spd)*amp;
    // Body sway for heavy chars
    const sway = (id==='gouki'||id==='tetsu') ? Math.sin(this.animFrame*spd)*1.5 : 0;
    this._drawLimb(ctx,c.pants,-6,0,-6+s,18,lw);this._drawLimb(ctx,c.pants,-6+s,18,-6+s*0.5,34,lw-1);this._drawFoot(ctx,c,-6+s*0.5,34);
    this._drawLimb(ctx,c.pants,6,0,6-s,18,lw);this._drawLimb(ctx,c.pants,6-s,18,6-s*0.5,34,lw-1);this._drawFoot(ctx,c,6-s*0.5,34);
    this._drawBody(ctx,c,sway,-38,28,38);
    this._drawLimb(ctx,c.gi,-14,-32,-18-s*0.5,-16,lw-2);this._drawLimb(ctx,c.skin,-18-s*0.5,-16,-14-s*0.3,-4,lw-3);this._drawFist(ctx,c,-14-s*0.3,-4);
    this._drawLimb(ctx,c.gi,14,-32,20+s*0.5,-18,lw-2);this._drawLimb(ctx,c.skin,20+s*0.5,-18,22+s*0.3,-6,lw-3);this._drawFist(ctx,c,22+s*0.3,-6);
    this._drawHead(ctx,c,sway,-52);
  }
  _drawJump(ctx,c) {
    this._drawLimb(ctx,c.pants,-8,0,-15,8,9);this._drawLimb(ctx,c.pants,-15,8,-10,16,8);this._drawFoot(ctx,c,-10,16);
    this._drawLimb(ctx,c.pants,8,0,15,8,9);this._drawLimb(ctx,c.pants,15,8,10,16,8);this._drawFoot(ctx,c,10,16);
    this._drawBody(ctx,c,0,-38,28,38);
    this._drawLimb(ctx,c.gi,-14,-32,-22,-42,7);this._drawLimb(ctx,c.skin,-22,-42,-18,-30,6);this._drawFist(ctx,c,-18,-30);
    this._drawLimb(ctx,c.gi,14,-32,22,-42,7);this._drawLimb(ctx,c.skin,22,-42,18,-30,6);this._drawFist(ctx,c,18,-30);
    this._drawHead(ctx,c,0,-52);
  }
  _drawCrouch(ctx,c) {
    this._drawLimb(ctx,c.pants,-10,14,-14,24,9);this._drawLimb(ctx,c.pants,-14,24,-10,34,8);this._drawFoot(ctx,c,-10,34);
    this._drawLimb(ctx,c.pants,10,14,14,24,9);this._drawLimb(ctx,c.pants,14,24,10,34,8);this._drawFoot(ctx,c,10,34);
    this._drawBody(ctx,c,0,-22,28,36);
    this._drawLimb(ctx,c.gi,-14,-16,-10,-2,7);this._drawLimb(ctx,c.skin,-10,-2,4,-6,6);this._drawFist(ctx,c,4,-6);
    this._drawLimb(ctx,c.gi,14,-16,18,-4,7);this._drawLimb(ctx,c.skin,18,-4,22,-10,6);this._drawFist(ctx,c,22,-10);
    this._drawHead(ctx,c,0,-36);
  }
  _drawDash(ctx,c,dir) {
    const lean=dir*0.15;ctx.save();ctx.rotate(lean);
    ctx.globalAlpha=0.3;ctx.translate(-dir*15,0);this._drawIdle(ctx,c);ctx.translate(dir*15,0);ctx.globalAlpha=1;this._drawIdle(ctx,c);
    ctx.strokeStyle='rgba(255,255,255,0.4)';ctx.lineWidth=2;
    for(let i=0;i<4;i++){const ly=-50+i*18;ctx.beginPath();ctx.moveTo(-dir*20,ly);ctx.lineTo(-dir*50,ly);ctx.stroke();}
    ctx.restore();
  }
  _drawThrowAnim(ctx,c) {
    const p=this.throwFrame/30;
    if(p<0.3){
      this._drawLimb(ctx,c.pants,-8,0,-8,18,9);this._drawLimb(ctx,c.pants,-8,18,-8,34,8);this._drawFoot(ctx,c,-8,34);
      this._drawLimb(ctx,c.pants,8,0,8,18,9);this._drawLimb(ctx,c.pants,8,18,8,34,8);this._drawFoot(ctx,c,8,34);
      this._drawBody(ctx,c,4,-38,28,38);
      this._drawLimb(ctx,c.gi,14,-34,35,-36,8);this._drawLimb(ctx,c.skin,35,-36,40,-30,7);this._drawFist(ctx,c,40,-30);
      this._drawLimb(ctx,c.gi,-14,-30,-10,-18,7);this._drawLimb(ctx,c.skin,-10,-18,-4,-10,6);
      this._drawHead(ctx,c,4,-52);
    } else {
      const sa=Math.min((p-0.3)/0.3,1)*0.5;ctx.save();ctx.rotate(-sa);
      this._drawLimb(ctx,c.pants,-10,0,-14,18,9);this._drawLimb(ctx,c.pants,-14,18,-10,34,8);this._drawFoot(ctx,c,-10,34);
      this._drawLimb(ctx,c.pants,10,0,14,16,9);this._drawLimb(ctx,c.pants,14,16,12,34,8);this._drawFoot(ctx,c,12,34);
      this._drawBody(ctx,c,0,-38,28,38);
      this._drawLimb(ctx,c.gi,14,-34,30,-44,8);this._drawLimb(ctx,c.skin,30,-44,35,-36,7);
      this._drawLimb(ctx,c.gi,-14,-30,-20,-20,7);this._drawLimb(ctx,c.skin,-20,-20,-16,-12,6);
      this._drawHead(ctx,c,2,-52);ctx.restore();
    }
  }
  _drawThrownAnim(ctx,c) {
    const rot=this.animFrame*0.3;ctx.save();ctx.translate(0,-20);ctx.rotate(rot);
    this._drawLimb(ctx,c.pants,-6,10,-10,22,8);this._drawLimb(ctx,c.pants,6,10,10,22,8);
    this._drawBody(ctx,c,0,-20,24,30);
    this._drawLimb(ctx,c.gi,-10,-16,-18,-8,6);this._drawLimb(ctx,c.gi,10,-16,18,-8,6);
    this._drawHead(ctx,c,0,-30);ctx.restore();
  }
  _drawAttack(ctx,c) {
    if(!this.attackData){this._drawIdle(ctx,c);return;}
    const a=this.attackData, pr=this.attackFrame/(a.startup+(a.type==='projectile'?5:a.active)+a.recovery);
    const inA=this.attackFrame>=a.startup&&this.attackFrame<a.startup+a.active;
    switch(a.anim) {
      case 'punch_light':case 'special': {
        this._drawLimb(ctx,c.pants,-8,0,-8,18,9);this._drawLimb(ctx,c.pants,-8,18,-8,34,8);this._drawFoot(ctx,c,-8,34);
        this._drawLimb(ctx,c.pants,10,0,14,18,9);this._drawLimb(ctx,c.pants,14,18,12,34,8);this._drawFoot(ctx,c,12,34);
        this._drawBody(ctx,c,2,-38,28,38);this._drawLimb(ctx,c.gi,-14,-32,-20,-18,7);this._drawLimb(ctx,c.skin,-20,-18,-16,-8,6);this._drawFist(ctx,c,-16,-8);
        const ext=inA?1:(pr<0.3?pr/0.3:Math.max(0,1-(pr-0.5)/0.5));const ax=14+ext*35;
        this._drawLimb(ctx,c.gi,14,-34,ax*0.6,-36,7);this._drawLimb(ctx,c.skin,ax*0.6,-36,ax,-36,7);this._drawFist(ctx,c,ax,-36);
        if(inA){ctx.fillStyle='#ffff00';ctx.globalAlpha=0.6;ctx.beginPath();ctx.arc(ax+5,-36,8,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
        this._drawHead(ctx,c,2,-52);break;
      }
      case 'kick_heavy': {
        this._drawLimb(ctx,c.pants,-10,0,-10,18,9);this._drawLimb(ctx,c.pants,-10,18,-10,34,8);this._drawFoot(ctx,c,-10,34);
        this._drawBody(ctx,c,-2,-38,28,38);
        const ext=inA?1:(pr<0.3?pr/0.3:Math.max(0,1-(pr-0.5)/0.5));const kx=8+ext*40;
        this._drawLimb(ctx,c.pants,8,0,kx*0.5,-7.5,9);this._drawLimb(ctx,c.pants,kx*0.5,-7.5,kx,-15,8);this._drawFoot(ctx,c,kx,-15);
        if(inA){ctx.strokeStyle='#ffcc00';ctx.lineWidth=2;ctx.globalAlpha=0.7;ctx.beginPath();ctx.arc(kx+5,-15,12,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
        this._drawLimb(ctx,c.gi,-14,-32,-20,-20,7);this._drawLimb(ctx,c.skin,-20,-20,-14,-10,6);this._drawFist(ctx,c,-14,-10);
        this._drawLimb(ctx,c.gi,14,-32,18,-22,7);this._drawLimb(ctx,c.skin,18,-22,14,-14,6);this._drawFist(ctx,c,14,-14);
        this._drawHead(ctx,c,-2,-52);break;
      }
      case 'crouch_punch': {
        this._drawLimb(ctx,c.pants,-10,14,-14,24,9);this._drawLimb(ctx,c.pants,-14,24,-10,34,8);this._drawFoot(ctx,c,-10,34);
        this._drawLimb(ctx,c.pants,10,14,14,24,9);this._drawLimb(ctx,c.pants,14,24,10,34,8);this._drawFoot(ctx,c,10,34);
        this._drawBody(ctx,c,2,-22,28,36);this._drawLimb(ctx,c.gi,-14,-16,-10,-2,7);this._drawLimb(ctx,c.skin,-10,-2,-6,4,6);
        const ext=inA?1:(pr<0.3?pr/0.3:Math.max(0,1-(pr-0.5)/0.5));const px=14+ext*30;
        this._drawLimb(ctx,c.gi,14,-16,px*0.5,-18,7);this._drawLimb(ctx,c.skin,px*0.5,-18,px,-16,6);this._drawFist(ctx,c,px,-16);
        if(inA){ctx.fillStyle='#ffff00';ctx.globalAlpha=0.5;ctx.beginPath();ctx.arc(px+4,-16,6,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
        this._drawHead(ctx,c,2,-36);break;
      }
      case 'sweep': {
        this._drawLimb(ctx,c.pants,-10,12,-16,22,9);this._drawLimb(ctx,c.pants,-16,22,-12,34,8);this._drawFoot(ctx,c,-12,34);
        this._drawBody(ctx,c,-4,-22,28,36);
        const ext=inA?1:(pr<0.4?pr/0.4:Math.max(0,1-(pr-0.6)/0.4));const sx=10+ext*50;
        this._drawLimb(ctx,c.pants,8,12,sx*0.4,28,9);this._drawLimb(ctx,c.pants,sx*0.4,28,sx,30,8);this._drawFoot(ctx,c,sx,30);
        if(inA){ctx.strokeStyle='#ff8844';ctx.lineWidth=3;ctx.globalAlpha=0.6;ctx.beginPath();ctx.arc(sx,30,10,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
        this._drawLimb(ctx,c.gi,-12,-16,-4,-4,7);this._drawLimb(ctx,c.skin,-4,-4,2,2,6);
        this._drawLimb(ctx,c.gi,12,-16,16,-6,7);this._drawLimb(ctx,c.skin,16,-6,12,2,6);
        this._drawHead(ctx,c,-4,-36);break;
      }
      case 'uppercut': {
        const rise=inA?1:Math.min(pr*3,1);ctx.translate(0,-rise*20);
        this._drawLimb(ctx,c.pants,-8,0,-12,16,9);this._drawLimb(ctx,c.pants,-12,16,-8,30,8);this._drawFoot(ctx,c,-8,30);
        this._drawLimb(ctx,c.pants,6,0,4,16,9);this._drawLimb(ctx,c.pants,4,16,6,30,8);this._drawFoot(ctx,c,6,30);
        this._drawBody(ctx,c,2,-40,28,40);
        this._drawLimb(ctx,c.gi,-14,-34,-18,-22,7);this._drawLimb(ctx,c.skin,-18,-22,-14,-14,6);this._drawFist(ctx,c,-14,-14);
        const armUp=inA?-65:-36-rise*29;
        this._drawLimb(ctx,c.gi,14,-36,18,armUp+10,8);this._drawLimb(ctx,c.skin,18,armUp+10,16,armUp,8);this._drawFist(ctx,c,16,armUp);
        if(inA){ctx.fillStyle='#ffdd44';ctx.globalAlpha=0.7;ctx.beginPath();ctx.arc(16,armUp-5,10,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
          ctx.strokeStyle='rgba(255,200,50,0.5)';ctx.lineWidth=2;for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(10+i*5,armUp+20);ctx.lineTo(10+i*5,armUp+50);ctx.stroke();}
        }
        this._drawHead(ctx,c,2,-54);break;
      }
      case 'air_punch': {
        this._drawLimb(ctx,c.pants,-8,0,-12,12,9);this._drawLimb(ctx,c.pants,-12,12,-8,20,8);
        this._drawLimb(ctx,c.pants,8,0,12,12,9);this._drawLimb(ctx,c.pants,12,12,8,20,8);
        this._drawBody(ctx,c,2,-38,28,38);this._drawLimb(ctx,c.gi,-14,-32,-18,-20,7);this._drawLimb(ctx,c.skin,-18,-20,-14,-12,6);
        const ext=inA?1:0.5;const ax=14+ext*30;
        this._drawLimb(ctx,c.gi,14,-34,ax*0.5,-34,7);this._drawLimb(ctx,c.skin,ax*0.5,-34,ax,-32,7);this._drawFist(ctx,c,ax,-32);
        if(inA){ctx.fillStyle='#ffff00';ctx.globalAlpha=0.5;ctx.beginPath();ctx.arc(ax+4,-32,7,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;}
        this._drawHead(ctx,c,2,-52);break;
      }
      case 'air_kick': {
        this._drawLimb(ctx,c.pants,-10,0,-12,14,9);this._drawLimb(ctx,c.pants,-12,14,-10,24,8);
        this._drawBody(ctx,c,0,-38,28,38);
        const ext=inA?1:0.5;const kx=10+ext*35;
        this._drawLimb(ctx,c.pants,8,0,kx*0.4,2,9);this._drawLimb(ctx,c.pants,kx*0.4,2,kx,5,8);this._drawFoot(ctx,c,kx,5);
        if(inA){ctx.strokeStyle='#ffcc00';ctx.lineWidth=2;ctx.globalAlpha=0.6;ctx.beginPath();ctx.arc(kx+4,5,10,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=1;}
        this._drawLimb(ctx,c.gi,-14,-32,-20,-22,7);this._drawLimb(ctx,c.skin,-20,-22,-16,-14,6);
        this._drawLimb(ctx,c.gi,14,-32,18,-24,7);this._drawLimb(ctx,c.skin,18,-24,14,-16,6);
        this._drawHead(ctx,c,0,-52);break;
      }
      case 'divekick': {
        ctx.rotate(0.4);
        this._drawLimb(ctx,c.pants,-8,0,-6,14,9);this._drawLimb(ctx,c.pants,-6,14,-8,24,8);
        this._drawBody(ctx,c,2,-38,28,38);
        this._drawLimb(ctx,c.pants,8,-2,28,15,9);this._drawLimb(ctx,c.pants,28,15,40,25,8);this._drawFoot(ctx,c,40,25);
        this._drawLimb(ctx,c.gi,-14,-32,-18,-22,7);this._drawLimb(ctx,c.skin,-18,-22,-14,-14,6);
        this._drawLimb(ctx,c.gi,14,-32,8,-24,7);this._drawLimb(ctx,c.skin,8,-24,4,-16,6);
        this._drawHead(ctx,c,2,-52);
        if(inA||this.attackFrame>=a.startup){ctx.strokeStyle='#ff6600';ctx.lineWidth=3;ctx.globalAlpha=0.5;ctx.beginPath();ctx.moveTo(42,27);ctx.lineTo(20,-10);ctx.stroke();ctx.globalAlpha=1;}
        break;
      }
      case 'rush': {
        const lean=inA?0.2:0;
        this._drawLimb(ctx,c.pants,-6,0,-15,12,9);this._drawLimb(ctx,c.pants,-15,12,-12,34,8);this._drawFoot(ctx,c,-12,34);
        this._drawLimb(ctx,c.pants,6,0,18,14,9);this._drawLimb(ctx,c.pants,18,14,14,34,8);this._drawFoot(ctx,c,14,34);
        ctx.save();ctx.rotate(lean);this._drawBody(ctx,c,4,-38,28,38);
        const ae=inA?45:20;
        this._drawLimb(ctx,c.gi,14,-34,ae*0.5,-38,8);this._drawLimb(ctx,c.skin,ae*0.5,-38,ae,-36,8);this._drawFist(ctx,c,ae,-36);
        this._drawLimb(ctx,c.gi,-14,-30,-18,-16,7);this._drawLimb(ctx,c.skin,-18,-16,-12,-8,6);this._drawFist(ctx,c,-12,-8);
        this._drawHead(ctx,c,4,-52);ctx.restore();
        if(inA){ctx.strokeStyle='rgba(255,200,0,0.5)';ctx.lineWidth=2;for(let i=0;i<3;i++){const ly=-40+i*15;ctx.beginPath();ctx.moveTo(-30,ly);ctx.lineTo(-60,ly);ctx.stroke();}}
        break;
      }
      default:this._drawIdle(ctx,c);
    }
  }
  _drawHit(ctx,c) {
    ctx.translate((this.hitStun%4<2)?2:-2,0);
    this._drawLimb(ctx,c.pants,-6,0,-8,18,9);this._drawLimb(ctx,c.pants,-8,18,-6,34,8);this._drawFoot(ctx,c,-6,34);
    this._drawLimb(ctx,c.pants,8,0,6,18,9);this._drawLimb(ctx,c.pants,6,18,8,34,8);this._drawFoot(ctx,c,8,34);
    this._drawBody(ctx,c,-3,-36,28,36);
    this._drawLimb(ctx,c.gi,-14,-30,-24,-18,7);this._drawLimb(ctx,c.skin,-24,-18,-20,-8,6);this._drawFist(ctx,c,-20,-8);
    this._drawLimb(ctx,c.gi,10,-30,6,-16,7);this._drawLimb(ctx,c.skin,6,-16,10,-6,6);this._drawFist(ctx,c,10,-6);
    this._drawHead(ctx,c,-3,-50,-0.15);
  }
  _drawKnockdown(ctx,c) {
    ctx.rotate(Math.min(this.knockdownTime*0.05,Math.PI/3));
    this._drawLimb(ctx,c.pants,-6,0,-10,20,9);this._drawLimb(ctx,c.pants,-10,20,-6,34,8);
    this._drawLimb(ctx,c.pants,8,0,4,20,9);this._drawLimb(ctx,c.pants,4,20,8,34,8);
    this._drawBody(ctx,c,0,-36,28,36);
    this._drawLimb(ctx,c.gi,-14,-30,-22,-20,7);this._drawLimb(ctx,c.skin,-22,-20,-18,-10,6);
    this._drawLimb(ctx,c.gi,12,-30,4,-20,7);this._drawLimb(ctx,c.skin,4,-20,8,-10,6);
    this._drawHead(ctx,c,0,-50,-0.3);
  }
  _drawBlock(ctx,c) {
    ctx.translate((this.blockStun%4<2)?1:-1,0);
    this._drawLimb(ctx,c.pants,-8,0,-10,18,9);this._drawLimb(ctx,c.pants,-10,18,-8,34,8);this._drawFoot(ctx,c,-8,34);
    this._drawLimb(ctx,c.pants,8,0,10,18,9);this._drawLimb(ctx,c.pants,10,18,8,34,8);this._drawFoot(ctx,c,8,34);
    this._drawBody(ctx,c,-2,-38,28,38);
    this._drawLimb(ctx,c.gi,-12,-32,2,-30,8);this._drawLimb(ctx,c.skin,2,-30,8,-22,7);this._drawFist(ctx,c,8,-22);
    this._drawLimb(ctx,c.gi,12,-32,4,-26,8);this._drawLimb(ctx,c.skin,4,-26,10,-18,7);this._drawFist(ctx,c,10,-18);
    this._drawHead(ctx,c,-2,-52);
    ctx.strokeStyle='rgba(100,180,255,0.5)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(5,-30,18,0,Math.PI*2);ctx.stroke();
  }
  _drawVictory(ctx,c) {
    const id=this.charId;
    const bounce=Math.abs(Math.sin(this.animFrame*0.06))*5;

    if(id==='gouki'){
      // Arms crossed, intimidating (no bounce)
      this._drawLimb(ctx,c.pants,-12,0,-14,18,10);this._drawLimb(ctx,c.pants,-14,18,-12,34,9);this._drawFoot(ctx,c,-12,34);
      this._drawLimb(ctx,c.pants,12,0,14,18,10);this._drawLimb(ctx,c.pants,14,18,12,34,9);this._drawFoot(ctx,c,12,34);
      this._drawBody(ctx,c,0,-38,28,38);
      this._drawLimb(ctx,c.gi,-16,-32,4,-26,8);this._drawLimb(ctx,c.skin,4,-26,16,-22,7);this._drawFist(ctx,c,16,-22);
      this._drawLimb(ctx,c.gi,16,-30,-2,-24,8);this._drawLimb(ctx,c.skin,-2,-24,-12,-20,7);this._drawFist(ctx,c,-12,-20);
      // Power aura
      ctx.save();ctx.globalAlpha=0.15;ctx.fillStyle='#9900ff';
      ctx.beginPath();ctx.arc(0,-25,40+Math.sin(this.animFrame*0.1)*5,0,Math.PI*2);ctx.fill();ctx.restore();
      this._drawHead(ctx,c,0,-52);
    } else if(id==='hikari'){
      // Graceful bow
      ctx.translate(0,-bounce*0.5);
      this._drawLimb(ctx,c.pants,-6,0,-6,18,8);this._drawLimb(ctx,c.pants,-6,18,-6,34,7);this._drawFoot(ctx,c,-6,34);
      this._drawLimb(ctx,c.pants,6,0,6,18,8);this._drawLimb(ctx,c.pants,6,18,6,34,7);this._drawFoot(ctx,c,6,34);
      this._drawBody(ctx,c,0,-38,28,38);
      // Hands together in prayer
      this._drawLimb(ctx,c.gi,-14,-34,-4,-28,6);this._drawLimb(ctx,c.skin,-4,-28,2,-30,5);
      this._drawLimb(ctx,c.gi,14,-34,4,-28,6);this._drawLimb(ctx,c.skin,4,-28,2,-30,5);
      // Light glow
      ctx.save();ctx.globalAlpha=0.2;ctx.fillStyle='#ffee88';
      ctx.beginPath();ctx.arc(0,-30,15+Math.sin(this.animFrame*0.1)*3,0,Math.PI*2);ctx.fill();ctx.restore();
      this._drawHead(ctx,c,0,-52,0.1);
    } else if(id==='tetsu'){
      // Flex muscles pose
      this._drawLimb(ctx,c.pants,-12,0,-14,18,11);this._drawLimb(ctx,c.pants,-14,18,-12,34,10);this._drawFoot(ctx,c,-12,34);
      this._drawLimb(ctx,c.pants,12,0,14,18,11);this._drawLimb(ctx,c.pants,14,18,12,34,10);this._drawFoot(ctx,c,12,34);
      this._drawBody(ctx,c,0,-38,28,38);
      // Flexing arms up
      this._drawLimb(ctx,c.gi,-16,-34,-24,-44,9);this._drawLimb(ctx,c.skin,-24,-44,-18,-36,8);this._drawFist(ctx,c,-18,-36);
      this._drawLimb(ctx,c.gi,16,-34,24,-44,9);this._drawLimb(ctx,c.skin,24,-44,18,-36,8);this._drawFist(ctx,c,18,-36);
      this._drawHead(ctx,c,0,-52);
    } else if(id==='maki'){
      // Turn away, cape flowing
      this._drawLimb(ctx,c.pants,-8,0,-8,18,8);this._drawLimb(ctx,c.pants,-8,18,-8,34,7);this._drawFoot(ctx,c,-8,34);
      this._drawLimb(ctx,c.pants,8,0,8,18,8);this._drawLimb(ctx,c.pants,8,18,8,34,7);this._drawFoot(ctx,c,8,34);
      this._drawBody(ctx,c,0,-38,28,38);
      // Cape flow
      const w=Math.sin(this.animFrame*0.05)*6;
      ctx.fillStyle=c.giLight;ctx.beginPath();
      ctx.moveTo(-14,-34);ctx.quadraticCurveTo(-22+w,-10,-18+w,20);
      ctx.lineTo(-10,18);ctx.lineTo(-12,-30);ctx.fill();
      this._drawLimb(ctx,c.gi,-14,-32,-18,-22,7);this._drawLimb(ctx,c.skin,-18,-22,-16,-14,6);
      this._drawLimb(ctx,c.gi,14,-32,12,-24,7);this._drawLimb(ctx,c.skin,12,-24,8,-18,6);
      this._drawHead(ctx,c,0,-52,-0.1);
    } else if(id==='ren'){
      // Jump kick celebration pose
      ctx.translate(0,-bounce*1.5);
      this._drawLimb(ctx,c.pants,-8,0,-12,14,9);this._drawLimb(ctx,c.pants,-12,14,-8,26,8);this._drawFoot(ctx,c,-8,26);
      this._drawLimb(ctx,c.pants,8,-2,18,8,9);this._drawLimb(ctx,c.pants,18,8,22,18,8);this._drawFoot(ctx,c,22,18);
      this._drawBody(ctx,c,0,-38,28,38);
      this._drawLimb(ctx,c.gi,-14,-34,-20,-50,7);this._drawLimb(ctx,c.skin,-20,-50,-16,-60,6);this._drawFist(ctx,c,-16,-60);
      this._drawLimb(ctx,c.gi,14,-34,20,-50,7);this._drawLimb(ctx,c.skin,20,-50,16,-60,6);this._drawFist(ctx,c,16,-60);
      this._drawHead(ctx,c,0,-52);
    } else {
      // Default: arms raised (Kaito, Akane, Yuki)
      ctx.translate(0,-bounce);
      this._drawLimb(ctx,c.pants,-8,0,-10,18,9);this._drawLimb(ctx,c.pants,-10,18,-8,34,8);this._drawFoot(ctx,c,-8,34);
      this._drawLimb(ctx,c.pants,8,0,10,18,9);this._drawLimb(ctx,c.pants,10,18,8,34,8);this._drawFoot(ctx,c,8,34);
      this._drawBody(ctx,c,0,-38,28,38);
      this._drawLimb(ctx,c.gi,-14,-34,-20,-50,7);this._drawLimb(ctx,c.skin,-20,-50,-16,-60,6);this._drawFist(ctx,c,-16,-60);
      this._drawLimb(ctx,c.gi,14,-34,20,-50,7);this._drawLimb(ctx,c.skin,20,-50,16,-60,6);this._drawFist(ctx,c,16,-60);
      this._drawHead(ctx,c,0,-52);
    }
  }
  _drawDefeat(ctx,c) {
    ctx.translate(0,10);
    this._drawLimb(ctx,c.pants,-10,0,-16,10,9);this._drawLimb(ctx,c.pants,-16,10,-20,24,8);
    this._drawLimb(ctx,c.pants,10,0,16,10,9);this._drawLimb(ctx,c.pants,16,10,20,24,8);
    this._drawBody(ctx,c,0,-30,28,30);
    this._drawLimb(ctx,c.gi,-14,-24,-20,-10,7);this._drawLimb(ctx,c.skin,-20,-10,-24,4,6);
    this._drawLimb(ctx,c.gi,14,-24,20,-10,7);this._drawLimb(ctx,c.skin,20,-10,24,4,6);
    this._drawHead(ctx,c,0,-42,0.3);
  }
}

// === BACKGROUND & HUD ===
let bgCache = null;
let bgCacheDirty = true;
// 桜の花びら（軽量化: 16枚、グラデなし）
const _petals = Array.from({length:16},()=>({
  x:Math.random()*W, y:Math.random()*GROUND_Y,
  vx:0.3+Math.random()*0.6, vy:0.4+Math.random()*0.7,
  rot:Math.random()*Math.PI*2, vr:(Math.random()-0.5)*0.04,
  size:3+Math.random()*4, sway:Math.random()*Math.PI*2,
  color:Math.random()>0.5?'#ffc8d8':'#ffaec0', alpha:0.45+Math.random()*0.35
}));

function drawBackground(ctx) {
  if(!bgCache){bgCache=document.createElement('canvas');bgCache.width=W;bgCache.height=H;bgCacheDirty=true;}
  if(bgCacheDirty){
    const bc=bgCache.getContext('2d');
    _drawBgStatic(bc);
    bgCacheDirty=false;
  }
  ctx.drawImage(bgCache,0,0);

  const fc=game.frameCount;

  // 瞬く星（軽量化: 12 個）
  ctx.fillStyle='#fff';
  [123,456,789,234,567,890,135,468,791,246,579,802].forEach((s,i)=>{
    const tw=Math.sin(fc*0.03+s)*0.4+0.6;
    ctx.globalAlpha=tw*0.55;
    const px=(s*7+i*43)%W, py=(s*3+i*17)%(GROUND_Y-80);
    ctx.fillRect(px,py,2,2);
  });ctx.globalAlpha=1;

  // 灯篭の発光（軽量化: 二重円のみ）
  const lanterns=[[370,GROUND_Y-78],[590,GROUND_Y-78]];
  ctx.save();ctx.globalCompositeOperation='lighter';
  lanterns.forEach(([lx,ly])=>{
    const flick=0.55+Math.sin(fc*0.08+lx)*0.18;
    ctx.fillStyle=`rgba(255,140,60,${flick*0.18})`;
    ctx.beginPath();ctx.arc(lx,ly,40,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(255,180,90,${flick*0.4})`;
    ctx.beginPath();ctx.arc(lx,ly,18,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`rgba(255,220,140,${flick})`;
    ctx.beginPath();ctx.arc(lx,ly,4,0,Math.PI*2);ctx.fill();
    // 地面への光こぼれ（小さい楕円）
    ctx.fillStyle=`rgba(255,140,60,${flick*0.18})`;
    ctx.beginPath();ctx.ellipse(lx,GROUND_Y+10,60,12,0,0,Math.PI*2);ctx.fill();
  });
  ctx.restore();

  // 桜の花びら（軽量: グラデなし）
  ctx.save();
  for(const p of _petals){
    p.sway+=0.04;
    p.x+=p.vx+Math.sin(p.sway)*0.6;
    p.y+=p.vy;
    p.rot+=p.vr;
    if(p.y>H+10){p.y=-10;p.x=Math.random()*W;}
    if(p.x>W+10) p.x=-10;
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.rot);
    ctx.globalAlpha=p.alpha;
    ctx.fillStyle=p.color;
    ctx.beginPath();
    ctx.moveTo(0,-p.size);
    ctx.quadraticCurveTo(p.size*0.7,-p.size*0.2,0,p.size);
    ctx.quadraticCurveTo(-p.size*0.7,-p.size*0.2,0,-p.size);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // ヴィネットは静的キャッシュ側に焼き込み済みなので動的な処理なし
}

function _drawBgStatic(ctx) {
  // 空グラデ（夜の藤色〜紺）
  const sky=ctx.createLinearGradient(0,0,0,GROUND_Y);
  sky.addColorStop(0,'#0a0820');
  sky.addColorStop(0.35,'#241148');
  sky.addColorStop(0.7,'#3a2360');
  sky.addColorStop(1,'#1a1530');
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,GROUND_Y);

  // 高層雲
  ctx.save();ctx.globalAlpha=0.18;
  for(let i=0;i<5;i++){
    const cx=120+i*180, cy=70+Math.sin(i)*20;
    const g=ctx.createRadialGradient(cx,cy,8,cx,cy,90);
    g.addColorStop(0,'rgba(190,170,220,0.55)');g.addColorStop(1,'rgba(190,170,220,0)');
    ctx.fillStyle=g;ctx.fillRect(cx-90,cy-30,180,60);
  }
  ctx.restore();

  // 月（ハロー＋本体＋クレーター＋反射光）
  const mx=760,my=82;
  // 外周ハロー
  for(let i=4;i>=1;i--){
    const r=42+i*22;
    const g=ctx.createRadialGradient(mx,my,30,mx,my,r);
    g.addColorStop(0,`rgba(220,230,255,${0.10/i})`);
    g.addColorStop(1,'rgba(220,230,255,0)');
    ctx.fillStyle=g;ctx.fillRect(mx-r,my-r,r*2,r*2);
  }
  // 本体（球体グラデ）
  const moonGrad=ctx.createRadialGradient(mx-12,my-14,4,mx,my,42);
  moonGrad.addColorStop(0,'#fefcf2');
  moonGrad.addColorStop(0.55,'#e8e2d4');
  moonGrad.addColorStop(0.95,'#a8a89a');
  moonGrad.addColorStop(1,'#605860');
  ctx.fillStyle=moonGrad;ctx.beginPath();ctx.arc(mx,my,40,0,Math.PI*2);ctx.fill();
  // クレーター
  ctx.fillStyle='rgba(120,110,130,0.25)';
  [[mx-10,my-4,6],[mx+8,my+10,4],[mx-2,my+16,3],[mx+16,my-12,3],[mx-18,my+8,3]].forEach(([x,y,r])=>{
    ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();
  });

  // 星の薄影（静止）
  ctx.fillStyle='#fff';ctx.globalAlpha=0.25;
  [123,456,789,234,567,890,135,468,791,246,579,802,147,258,369,470,581,692,703,814].forEach((s,i)=>{
    ctx.fillRect((s*7+i*43)%W,(s*3+i*17)%(GROUND_Y-80),2,2);
  });ctx.globalAlpha=1;

  // 遠景の山（最遠 — 紫がかったシルエット＋月明かりリム）
  ctx.fillStyle='#1f1738';
  ctx.beginPath();ctx.moveTo(0,GROUND_Y);
  for(let x=0;x<=W;x+=30) ctx.lineTo(x,GROUND_Y-100-Math.sin(x*0.006)*70-Math.sin(x*0.013)*32);
  ctx.lineTo(W,GROUND_Y);ctx.fill();
  // 月明かりのリム
  ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='rgba(180,160,210,0.45)';ctx.lineWidth=1.2;
  ctx.beginPath();
  for(let x=0;x<=W;x+=30){const y=GROUND_Y-100-Math.sin(x*0.006)*70-Math.sin(x*0.013)*32;if(x===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}
  ctx.stroke();ctx.restore();

  // 中景の山
  ctx.fillStyle='#141027';
  ctx.beginPath();ctx.moveTo(0,GROUND_Y);
  for(let x=0;x<=W;x+=24) ctx.lineTo(x,GROUND_Y-65-Math.sin(x*0.011)*45-Math.sin(x*0.019)*22);
  ctx.lineTo(W,GROUND_Y);ctx.fill();

  // 近景の山
  ctx.fillStyle='#0a0818';
  ctx.beginPath();ctx.moveTo(0,GROUND_Y);
  for(let x=0;x<=W;x+=18) ctx.lineTo(x,GROUND_Y-35-Math.sin(x*0.018)*22-Math.sin(x*0.031)*14);
  ctx.lineTo(W,GROUND_Y);ctx.fill();

  // 神社（多層屋根）
  const tx=480,ty=GROUND_Y;
  // 本殿の影
  ctx.save();ctx.shadowColor='rgba(0,0,0,0.6)';ctx.shadowBlur=18;ctx.shadowOffsetY=6;
  // 壁面
  const wallG=ctx.createLinearGradient(0,ty-120,0,ty);
  wallG.addColorStop(0,'#3a2418');wallG.addColorStop(0.5,'#2a1810');wallG.addColorStop(1,'#1a0e08');
  ctx.fillStyle=wallG;
  ctx.fillRect(tx-160,ty-120,320,120);
  ctx.restore();
  // 屋根（下層）— 反り屋根
  ctx.fillStyle='#2a1418';
  ctx.beginPath();
  ctx.moveTo(tx-180,ty-120);
  ctx.quadraticCurveTo(tx-90,ty-128,tx,ty-150);
  ctx.quadraticCurveTo(tx+90,ty-128,tx+180,ty-120);
  ctx.lineTo(tx+170,ty-110);
  ctx.quadraticCurveTo(tx+90,ty-118,tx,ty-138);
  ctx.quadraticCurveTo(tx-90,ty-118,tx-170,ty-110);
  ctx.closePath();ctx.fill();
  // 屋根のハイライト（瓦）
  ctx.strokeStyle='rgba(180,80,60,0.35)';ctx.lineWidth=1;
  for(let i=-7;i<=7;i++){
    ctx.beginPath();
    ctx.moveTo(tx+i*22,ty-120);
    const dx=Math.abs(i)/7;
    ctx.quadraticCurveTo(tx+i*22*0.6,ty-128-(1-dx)*15,tx+i*22*0.4,ty-148+dx*8);
    ctx.stroke();
  }
  // 屋根（上層 — より小さい）
  ctx.fillStyle='#1c0e12';
  ctx.beginPath();
  ctx.moveTo(tx-100,ty-120);
  ctx.quadraticCurveTo(tx-50,ty-148,tx,ty-172);
  ctx.quadraticCurveTo(tx+50,ty-148,tx+100,ty-120);
  ctx.lineTo(tx+92,ty-114);
  ctx.quadraticCurveTo(tx+50,ty-138,tx,ty-160);
  ctx.quadraticCurveTo(tx-50,ty-138,tx-92,ty-114);
  ctx.closePath();ctx.fill();
  // 千木（屋根の交差）
  ctx.strokeStyle='#0a0608';ctx.lineWidth=3;
  ctx.beginPath();ctx.moveTo(tx-8,ty-184);ctx.lineTo(tx+8,ty-160);
  ctx.moveTo(tx+8,ty-184);ctx.lineTo(tx-8,ty-160);ctx.stroke();
  // 柱
  for(let i=0;i<6;i++){
    const px=tx-130+i*52;
    const pg=ctx.createLinearGradient(px,0,px+8,0);
    pg.addColorStop(0,'#1a0a05');pg.addColorStop(0.5,'#3a1810');pg.addColorStop(1,'#1a0a05');
    ctx.fillStyle=pg;ctx.fillRect(px,ty-118,8,118);
  }
  // 神社の入口（明かりが漏れる）
  const doorG=ctx.createLinearGradient(tx-30,ty-90,tx+30,ty-90);
  doorG.addColorStop(0,'rgba(255,150,60,0.0)');
  doorG.addColorStop(0.5,'rgba(255,180,80,0.45)');
  doorG.addColorStop(1,'rgba(255,150,60,0.0)');
  ctx.fillStyle=doorG;ctx.fillRect(tx-30,ty-92,60,92);

  // 灯篭（左右）
  [370,590].forEach(lx=>{
    // 柱
    ctx.fillStyle='#1a1410';ctx.fillRect(lx-3,GROUND_Y-60,6,60);
    // 笠
    ctx.fillStyle='#2a2018';
    ctx.beginPath();ctx.moveTo(lx-12,GROUND_Y-72);ctx.lineTo(lx+12,GROUND_Y-72);
    ctx.lineTo(lx+8,GROUND_Y-78);ctx.lineTo(lx-8,GROUND_Y-78);ctx.closePath();ctx.fill();
    // 火袋
    ctx.fillStyle='#221008';ctx.fillRect(lx-7,GROUND_Y-90,14,14);
  });

  // 地面（石畳ベース）
  const gg=ctx.createLinearGradient(0,GROUND_Y,0,H);
  gg.addColorStop(0,'#1a1818');
  gg.addColorStop(0.4,'#0e0c0a');
  gg.addColorStop(1,'#020202');
  ctx.fillStyle=gg;ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);

  // 石畳（パースペクティブ）
  ctx.save();
  for(let row=0;row<6;row++){
    const t=row/6;
    const py=GROUND_Y+t*(H-GROUND_Y);
    const tilesPerRow=8+row*2;
    const tileW=W/tilesPerRow;
    const offset=row%2*tileW*0.5;
    for(let c=0;c<tilesPerRow+1;c++){
      const x=c*tileW-offset;
      const shade=20+Math.floor(Math.random()*20);
      const a=0.5-t*0.4;
      ctx.strokeStyle=`rgba(${shade*2},${shade*1.6},${shade*1.4},${a})`;
      ctx.lineWidth=1;
      ctx.strokeRect(x,py,tileW,(H-GROUND_Y)/6);
    }
  }
  ctx.restore();

  // 地表ハイライト（ステージ照明）
  const hl=ctx.createRadialGradient(W/2,GROUND_Y+5,40,W/2,GROUND_Y+5,360);
  hl.addColorStop(0,'rgba(255,220,160,0.18)');
  hl.addColorStop(1,'rgba(255,220,160,0)');
  ctx.fillStyle=hl;ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);

  // 地平線
  const lh=ctx.createLinearGradient(0,GROUND_Y-1,0,GROUND_Y+3);
  lh.addColorStop(0,'rgba(255,200,140,0)');
  lh.addColorStop(0.5,'rgba(255,200,140,0.45)');
  lh.addColorStop(1,'rgba(255,200,140,0)');
  ctx.fillStyle=lh;ctx.fillRect(0,GROUND_Y-1,W,4);

  // 地表霧（焼き込み）
  const mg=ctx.createLinearGradient(0,GROUND_Y-60,0,GROUND_Y+10);
  mg.addColorStop(0,'rgba(160,170,200,0)');
  mg.addColorStop(0.6,'rgba(160,170,200,0.08)');
  mg.addColorStop(1,'rgba(180,190,210,0.18)');
  ctx.fillStyle=mg;ctx.fillRect(0,GROUND_Y-60,W,80);

  // 周辺減光ヴィネット（焼き込み）
  const vg=ctx.createRadialGradient(W/2,H*0.55,W*0.28,W/2,H*0.5,W*0.7);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.55)');
  ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);
}

// HUD ゲージ用のスムージングHP（ダメージ受けると黄色いチップが残る、0..1 の比率）
let _hpDispP1=1,_hpDispP2=1;

// HUD グラデキャッシュ（毎フレーム作らない）
let _hpFrameG=null,_hpBgG=null,_hpFillCache={};
function _drawHpBar(ctx,x,y,w,h,hpRatio,dispRatio,reverse){
  // 外枠
  if(!_hpFrameG){
    _hpFrameG=ctx.createLinearGradient(0,0,0,h+6);
    _hpFrameG.addColorStop(0,'#3a3a45');_hpFrameG.addColorStop(0.5,'#1a1a22');_hpFrameG.addColorStop(1,'#2a2a33');
  }
  ctx.save();
  ctx.translate(0,0);
  FX.roundRect(ctx,x-3,y-3,w+6,h+6,h*0.7);
  ctx.fillStyle='#15161e';ctx.fill();
  ctx.restore();

  // 内側背景
  FX.roundRect(ctx,x,y,w,h,h*0.55);
  ctx.fillStyle='#0d0608';ctx.fill();

  // チップダメージ
  if(dispRatio>hpRatio){
    ctx.save();FX.roundRect(ctx,x,y,w,h,h*0.55);ctx.clip();
    const chipW=w*dispRatio;
    const chipX=reverse?x+w-chipW:x;
    ctx.fillStyle='#ddaa22';ctx.fillRect(chipX,y,chipW,h);
    ctx.fillStyle='rgba(255,255,255,0.25)';ctx.fillRect(chipX,y,chipW,h*0.4);
    ctx.restore();
  }

  // メインHPフィル
  const hpW=w*hpRatio;
  const hpX=reverse?x+w-hpW:x;
  const baseColor=hpRatio>0.5?'#22cc55':hpRatio>0.25?'#ddaa22':'#dd2233';

  // フィル本体
  ctx.save();FX.roundRect(ctx,x,y,w,h,h*0.55);ctx.clip();
  ctx.fillStyle=baseColor;ctx.fillRect(hpX,y,hpW,h);
  // 暗い下半分
  ctx.fillStyle='rgba(0,0,0,0.25)';ctx.fillRect(hpX,y+h*0.5,hpW,h*0.5);
  // 上部ハイライト
  ctx.fillStyle='rgba(255,255,255,0.4)';ctx.fillRect(hpX,y+1,hpW,h*0.35);
  // 端の白い発光線
  if(hpW>4){
    const edgeX=reverse?hpX:hpX+hpW;
    ctx.fillStyle='rgba(255,255,255,0.85)';
    ctx.fillRect(edgeX-1,y+1,2,h-2);
  }
  ctx.restore();

  // 凹み感の枠線
  FX.roundRect(ctx,x,y,w,h,h*0.55);
  ctx.strokeStyle='rgba(0,0,0,0.55)';ctx.lineWidth=1.2;ctx.stroke();
}

function _drawSuperBar(ctx,x,y,w,h,ratio,reverse){
  // 背景
  FX.roundRect(ctx,x,y,w,h,h*0.5);
  ctx.fillStyle='#0c0e22';ctx.fill();
  ctx.strokeStyle='rgba(80,120,200,0.45)';ctx.lineWidth=1;ctx.stroke();

  if(ratio<=0) return;
  const fillW=w*ratio;
  const fx=reverse?x+w-fillW:x;
  ctx.save();FX.roundRect(ctx,x,y,w,h,h*0.5);ctx.clip();
  ctx.fillStyle='#3388dd';ctx.fillRect(fx,y,fillW,h);
  ctx.fillStyle='rgba(255,255,255,0.4)';ctx.fillRect(fx,y,fillW,h*0.4);
  ctx.restore();

  // MAX 状態の発光枠（簡易）
  if(ratio>=1){
    const pul=0.5+Math.sin(game.frameCount*0.18)*0.3;
    FX.roundRect(ctx,x,y,w,h,h*0.5);
    ctx.strokeStyle=`rgba(180,230,255,${0.6+pul*0.3})`;ctx.lineWidth=1.5;ctx.stroke();
  }
}

function drawHUD(ctx) {
  const p1=game.p1,p2=game.p2;
  const barW=340,barH=20,barY=42,p1X=44,p2X=W-44-barW;
  const fc=game.frameCount;

  // ヘッダーガラスパネル
  FX.glass(ctx,20,12,W-40,68,14,'rgba(10,14,28,0.55)','rgba(140,180,240,0.25)');

  // HP のスムーズ追従（チップダメージ用）
  const targetHp1=p1.hp/p1.maxHp, targetHp2=p2.hp/p2.maxHp;
  if(_hpDispP1>targetHp1) _hpDispP1=Math.max(targetHp1,_hpDispP1-0.005);
  else _hpDispP1=targetHp1;
  if(_hpDispP2>targetHp2) _hpDispP2=Math.max(targetHp2,_hpDispP2-0.005);
  else _hpDispP2=targetHp2;

  _drawHpBar(ctx,p1X,barY,barW,barH,targetHp1,_hpDispP1,false);
  _drawHpBar(ctx,p2X,barY,barW,barH,targetHp2,_hpDispP2,true);

  // 名前 + プレイヤーバッジ（軽量: shadowBlur なし）
  ctx.font='bold 15px "Helvetica Neue", sans-serif';
  ctx.textAlign='left';
  ctx.fillStyle='#88ccff';ctx.fillText('1P',p1X,barY-8);
  ctx.fillStyle='#fff';ctx.fillText(game.p1Name||p1.data.name,p1X+24,barY-8);

  ctx.textAlign='right';
  const p2tag=game.mode==='pvp'?'2P':'CPU';
  const p2tagColor=game.mode==='pvp'?'#ff8888':'#ff9966';
  ctx.fillStyle=p2tagColor;ctx.fillText(p2tag,p2X+barW,barY-8);
  ctx.fillStyle='#fff';ctx.fillText(game.p2Name||(game.mode==='cpu'?'CPU':p2.data.name),p2X+barW-30,barY-8);

  // SUPER メーター
  const sbW=160,sbH=7,sbY=barY+barH+10;
  // ラベル
  ctx.fillStyle='rgba(180,210,255,0.7)';ctx.font='bold 9px sans-serif';
  ctx.textAlign='left';ctx.fillText('SUPER',p1X,sbY-3);
  ctx.textAlign='right';ctx.fillText('SUPER',p2X+barW,sbY-3);
  _drawSuperBar(ctx,p1X,sbY,sbW,sbH,p1.super/p1.maxSuper,false);
  _drawSuperBar(ctx,p2X+barW-sbW,sbY,sbW,sbH,p2.super/p2.maxSuper,true);

  // タイマー（中央ガラスバッジ、shadowBlur 不使用）
  const tcx=W/2,tcy=barY+8;
  // 背景円（単色多重）
  ctx.fillStyle='#05060c';
  ctx.beginPath();ctx.arc(tcx,tcy,33,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#15182a';
  ctx.beginPath();ctx.arc(tcx,tcy,30,0,Math.PI*2);ctx.fill();
  // 円リング
  const isLow=game.timer<=10;
  const ringColor=isLow?'#ff4455':'#ddccaa';
  ctx.strokeStyle=FX.rgba(ringColor,0.45);ctx.lineWidth=2.5;
  ctx.beginPath();ctx.arc(tcx,tcy,30,0,Math.PI*2);ctx.stroke();
  // 残り時間プログレス
  const tp=Math.max(0,Math.min(1,game.timer/ROUND_TIME));
  ctx.strokeStyle=ringColor;ctx.lineWidth=3;ctx.lineCap='round';
  ctx.beginPath();ctx.arc(tcx,tcy,30,-Math.PI/2,-Math.PI/2+Math.PI*2*tp);ctx.stroke();
  // 数字
  ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.fillStyle=isLow?'#ff5566':'#fff';
  ctx.font='bold 28px "Helvetica Neue", sans-serif';
  ctx.fillText(Math.ceil(game.timer).toString(),tcx,tcy+1);
  ctx.textBaseline='alphabetic';

  // ラウンド勝利マーカー（宝石風）
  for(let i=0;i<ROUNDS_TO_WIN;i++){
    const won=i<p1.wins;
    const cx=p1X+12+i*20, cy=barY+barH+24;
    _drawWinGem(ctx,cx,cy,5.5,won);
  }
  for(let i=0;i<ROUNDS_TO_WIN;i++){
    const won=i<p2.wins;
    const cx=p2X+barW-12-i*20, cy=barY+barH+24;
    _drawWinGem(ctx,cx,cy,5.5,won);
  }

  // 通算成績（控えめ）
  ctx.fillStyle='rgba(200,210,230,0.35)';ctx.font='10px sans-serif';ctx.textAlign='left';
  ctx.fillText(`通算 ${saveData.totalWins}W ${saveData.totalLosses}L  KO:${saveData.totalKOs}`,p1X+30,barY+barH+28);

  // 操作ヒント / トレーニング情報
  if(!isMobile){
    if(game.mode==='training'){
      ctx.fillStyle='rgba(220,230,250,0.35)';ctx.font='10px monospace';ctx.textAlign='left';
      ctx.fillText('Space:パンチ  Shift:キック  Z:必殺  X:投げ  C:防御  ↓+Shift:足払い  ↑+Space:アッパー  →→:ダッシュ',50,H-12);
      // トレーニング情報（ガラスパネル）
      FX.glass(ctx,W-208,GROUND_Y+8,196,H-GROUND_Y-18,10,'rgba(10,14,28,0.6)','rgba(140,180,240,0.3)');
      ctx.fillStyle='#cdd';ctx.font='bold 11px sans-serif';ctx.textAlign='left';
      ctx.fillText('TRAINING',W-198,GROUND_Y+25);
      ctx.fillStyle='#99a';ctx.font='10px sans-serif';
      const p1=game.p1;
      const info=[`State: ${p1.fstate}`,`Combo: ${p1.comboCount}`,`Super: ${Math.floor(p1.super)}%`,'','Esc: ポーズ/技表'];
      info.forEach((l,i)=>ctx.fillText(l,W-198,GROUND_Y+44+i*14));
    } else {
      ctx.fillStyle='rgba(220,230,250,0.35)';ctx.font='10px monospace';ctx.textAlign='center';
      ctx.fillText('Space:パンチ  Shift:キック  Z:必殺  X:投げ  C:防御  Esc:ポーズ',W/2,H-12);
    }
  }
}

function _drawWinGem(ctx,cx,cy,r,filled){
  if(filled){
    // 多重円で擬似グロー
    ctx.fillStyle='rgba(255,180,60,0.25)';
    ctx.beginPath();ctx.arc(cx,cy,r*1.6,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#ffcc44';
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,0.7)';
    ctx.beginPath();ctx.arc(cx-r*0.35,cy-r*0.35,r*0.35,0,Math.PI*2);ctx.fill();
  } else {
    ctx.fillStyle='rgba(80,80,100,0.45)';
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(180,180,200,0.4)';ctx.lineWidth=1;
    ctx.beginPath();ctx.arc(cx,cy,r,0,Math.PI*2);ctx.stroke();
  }
}

// === ストーリー名前ヘルパー ===
// プレイヤーが選んだキャラの speaker ID
function _playerCharId(){
  return Object.keys(CHARACTERS)[game.selectIndex1];
}
// 入力名があればそれ、なければキャラ data.name
function _playerSpeakerName(){
  const ch=CHARACTERS[_playerCharId()];
  return (game.p1Name&&game.p1Name.trim())||ch.name;
}
// ダイアログ speaker → 表示名（自分なら入力名、それ以外はキャラ名）
function _resolveSpeakerName(speakerId){
  if(speakerId===_playerCharId()) return _playerSpeakerName();
  return CHARACTERS[speakerId]?.name||'';
}
// ストーリーテキスト中の自キャラ名表記をプレイヤー名に置換
function _personalize(text){
  if(!game.p1Name||!game.p1Name.trim()) return text;
  const ch=CHARACTERS[_playerCharId()];
  if(!ch) return text;
  const name=game.p1Name.trim();
  return text
    .replaceAll(ch.nameJp, name)
    .replaceAll(ch.name, name);
}

// === TEXT RENDERER (for story/dialogue) ===
function drawTextBox(ctx,text,speaker,progress) {
  const x=40,y=H-170,w=W-80,h=130;
  // 影
  ctx.save();
  ctx.shadowColor='rgba(0,0,0,0.7)';ctx.shadowBlur=14;ctx.shadowOffsetY=4;
  FX.roundRect(ctx,x,y,w,h,12);
  // 背景グラデ
  const bg=ctx.createLinearGradient(0,y,0,y+h);
  bg.addColorStop(0,'rgba(20,18,32,0.92)');
  bg.addColorStop(1,'rgba(8,8,16,0.92)');
  ctx.fillStyle=bg;ctx.fill();
  ctx.restore();
  // ハイライト
  ctx.save();FX.roundRect(ctx,x,y,w,h,12);ctx.clip();
  const hi=ctx.createLinearGradient(0,y,0,y+h*0.4);
  hi.addColorStop(0,'rgba(255,255,255,0.07)');hi.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=hi;ctx.fillRect(x,y,w,h*0.4);
  ctx.restore();
  // 金色の枠
  ctx.save();
  const bg2=ctx.createLinearGradient(x,y,x+w,y+h);
  bg2.addColorStop(0,'rgba(255,210,120,0.45)');
  bg2.addColorStop(0.5,'rgba(255,180,80,0.85)');
  bg2.addColorStop(1,'rgba(180,120,40,0.45)');
  ctx.strokeStyle=bg2;ctx.lineWidth=1.5;
  FX.roundRect(ctx,x,y,w,h,12);ctx.stroke();
  ctx.restore();

  if(speaker){
    // スピーカータグ
    const tagW=ctx.measureText(speaker).width+30;
    ctx.save();
    ctx.shadowColor='rgba(255,180,60,0.5)';ctx.shadowBlur=8;
    FX.roundRect(ctx,x+18,y-15,tagW,28,8);
    const tg=ctx.createLinearGradient(0,y-15,0,y+13);
    tg.addColorStop(0,'#3a1a08');tg.addColorStop(1,'#1a0f06');
    ctx.fillStyle=tg;ctx.fill();
    ctx.strokeStyle='rgba(255,200,100,0.75)';ctx.lineWidth=1;
    FX.roundRect(ctx,x+18,y-15,tagW,28,8);ctx.stroke();
    ctx.restore();
    ctx.fillStyle='#ffcc55';ctx.font='bold 15px "Hiragino Sans",sans-serif';ctx.textAlign='left';
    ctx.fillText(speaker,x+33,y+4);
  }

  const displayed=text.substring(0,Math.floor(progress));
  const lines=displayed.split('\n');
  ctx.save();
  ctx.fillStyle='#eef';ctx.font='15px "Hiragino Sans",sans-serif';ctx.textAlign='left';
  ctx.shadowColor='rgba(0,0,0,0.65)';ctx.shadowBlur=2;ctx.shadowOffsetY=1;
  lines.forEach((line,i)=>ctx.fillText(line,x+25,y+30+i*23));
  ctx.restore();

  // 継続アイコン
  if(progress>=text.length){
    const blink=Math.sin(game.frameCount*0.12)*0.4+0.6;
    ctx.save();
    ctx.shadowColor='#ffcc44';ctx.shadowBlur=8;
    ctx.fillStyle=`rgba(255,210,120,${blink})`;
    ctx.font='12px sans-serif';ctx.textAlign='right';
    const arrowY=y+h-15+Math.sin(game.frameCount*0.15)*2;
    ctx.fillText('▼ SPACE',x+w-25,arrowY);
    ctx.restore();
  }
}

// === SCREENS ===
// タイトル画面用パーティクル（軽量、shadowBlur 不使用）
const _titleEmbers = Array.from({length:14},()=>({
  x:Math.random()*W, y:H+Math.random()*200,
  vy:0.3+Math.random()*0.5, vx:(Math.random()-0.5)*0.3,
  size:1+Math.random()*2.5, life:Math.random()*300,
  hue:20+Math.random()*40
}));

function drawTitle(ctx) {
  const fc=game.frameCount;

  // 深い夜空グラデ
  const sky=ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,'#06061a');
  sky.addColorStop(0.4,'#1a0e2e');
  sky.addColorStop(0.75,'#3a1820');
  sky.addColorStop(1,'#0a0408');
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);

  // 中央の太陽光
  ctx.save();ctx.globalCompositeOperation='screen';
  const cg=ctx.createRadialGradient(W/2,H*0.4,30,W/2,H*0.4,500);
  cg.addColorStop(0,'rgba(255,140,60,0.30)');
  cg.addColorStop(0.4,'rgba(180,60,80,0.10)');
  cg.addColorStop(1,'rgba(180,60,80,0)');
  ctx.fillStyle=cg;ctx.fillRect(0,0,W,H);
  ctx.restore();

  // 回転する光芒（軽量化: 8 スライス、共通グラデを使い回し）
  ctx.save();ctx.globalCompositeOperation='screen';ctx.translate(W/2,H*0.4);
  ctx.fillStyle='rgba(255,180,100,0.10)';
  for(let i=0;i<8;i++){
    const a=fc*0.003+i*Math.PI/4;
    ctx.beginPath();ctx.moveTo(0,0);
    ctx.lineTo(Math.cos(a)*900,Math.sin(a)*900);
    ctx.lineTo(Math.cos(a+0.08)*900,Math.sin(a+0.08)*900);
    ctx.closePath();ctx.fill();
  }
  ctx.restore();

  // 上昇する火の粉（shadowBlur なし、二重円で代用）
  ctx.save();ctx.globalCompositeOperation='lighter';
  for(const e of _titleEmbers){
    e.x+=e.vx; e.y-=e.vy; e.life++;
    if(e.y<-20){e.y=H+20;e.x=Math.random()*W;e.life=0;}
    const flicker=0.5+Math.sin(e.life*0.1)*0.3;
    const a=Math.max(0,Math.min(1,(H-e.y)/H))*flicker;
    ctx.fillStyle=`hsla(${e.hue},90%,70%,${a*0.25})`;
    ctx.beginPath();ctx.arc(e.x,e.y,e.size*2.2,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=`hsla(${e.hue},95%,80%,${a*0.85})`;
    ctx.beginPath();ctx.arc(e.x,e.y,e.size,0,Math.PI*2);ctx.fill();
  }
  ctx.restore();

  // 山シルエット
  ctx.fillStyle='rgba(10,5,15,0.85)';
  ctx.beginPath();ctx.moveTo(0,H);
  for(let x=0;x<=W;x+=20)ctx.lineTo(x,H-100-Math.sin(x*0.012)*40-Math.sin(x*0.006)*60);
  ctx.lineTo(W,H);ctx.fill();

  // ヴィネット
  const vg=ctx.createRadialGradient(W/2,H*0.45,W*0.2,W/2,H*0.5,W*0.7);
  vg.addColorStop(0,'rgba(0,0,0,0)');vg.addColorStop(1,'rgba(0,0,0,0.7)');
  ctx.fillStyle=vg;ctx.fillRect(0,0,W,H);

  ctx.textAlign='center';

  // 副題（漢字）— 上に
  ctx.save();
  ctx.font='bold 18px "Hiragino Mincho ProN","Yu Mincho",serif';
  ctx.fillStyle='rgba(180,150,200,0.55)';
  ctx.fillText('— 風 神 武 闘 会 —',W/2,90);
  ctx.restore();

  // メインタイトル: KAZE FIGHTERS（軽量化: shadowBlur 不使用）
  const tcx=W/2, tcy=170;
  ctx.font='bold 76px "Helvetica Neue", "Arial Black", sans-serif';
  // ドロップシャドウ
  ctx.fillStyle='rgba(0,0,0,0.7)';
  ctx.fillText('KAZE FIGHTERS',tcx+5,tcy+6);
  // 縁取り
  ctx.strokeStyle='#3a0a08';ctx.lineWidth=6;ctx.lineJoin='round';
  ctx.strokeText('KAZE FIGHTERS',tcx,tcy);
  // メイン塗り（金〜赤グラデ）
  const titleG=ctx.createLinearGradient(0,tcy-50,0,tcy+10);
  titleG.addColorStop(0,'#fff5cc');
  titleG.addColorStop(0.45,'#ffcc44');
  titleG.addColorStop(0.55,'#ee7733');
  titleG.addColorStop(1,'#aa3322');
  ctx.fillStyle=titleG;
  ctx.fillText('KAZE FIGHTERS',tcx,tcy);

  // 副題（和文）
  ctx.font='500 22px "Hiragino Sans","Yu Gothic",sans-serif';
  ctx.fillStyle='rgba(0,0,0,0.7)';
  ctx.fillText('風のファイターズ',tcx+1,tcy+33);
  ctx.fillStyle='#ccd0e0';
  ctx.fillText('風のファイターズ',tcx,tcy+32);

  // 装飾ライン
  ctx.save();
  const lineG=ctx.createLinearGradient(W/2-180,0,W/2+180,0);
  lineG.addColorStop(0,'rgba(255,180,80,0)');
  lineG.addColorStop(0.5,'rgba(255,200,120,0.85)');
  lineG.addColorStop(1,'rgba(255,180,80,0)');
  ctx.fillStyle=lineG;
  ctx.fillRect(W/2-180,tcy+50,360,1.2);
  ctx.restore();

  // 戦績（メニュー上部に配置 — メニューと被らないため）
  if(saveData.totalWins+saveData.totalLosses>0){
    ctx.font='11px sans-serif';
    ctx.fillStyle='rgba(180,180,210,0.55)';
    ctx.textAlign='center';
    ctx.fillText(`${saveData.playerName||'---'}   ${saveData.totalWins}W  ${saveData.totalLosses}L   KO ${saveData.totalKOs}`,W/2,235);
  }

  // メニュー（間隔ゆったり、サブテキストは box の十分下）
  const menuY=270;
  const itemGap=43;
  const items=['STORY MODE','TOURNAMENT','VS CPU','VS PLAYER','TRAINING','OPTIONS'];
  const subs=['ストーリーを進める','8人勝ち抜きトーナメント','CPU と対戦','友達と対戦','技を試す','難易度・キー設定'];
  const pulse=Math.sin(fc*0.08)*0.5+0.5;
  items.forEach((item,i)=>{
    const sel=i===game.menuIndex;
    const cy=menuY+i*itemGap;
    if(sel){
      const bw=320, bh=30;
      // 発光バー
      ctx.fillStyle=`rgba(255,140,60,${0.18+pulse*0.10})`;
      ctx.fillRect(W/2-bw/2,cy-bh/2,bw,bh);
      // 上下のライン
      ctx.fillStyle='rgba(255,210,140,0.7)';
      ctx.fillRect(W/2-bw/2,cy-bh/2,bw,1);
      ctx.fillRect(W/2-bw/2,cy+bh/2-1,bw,1);
      // メイン文字
      ctx.textBaseline='middle';
      ctx.font='bold 22px "Helvetica Neue", sans-serif';
      ctx.fillStyle='#fff5e0';
      ctx.fillText(item,W/2,cy);
      // ◆ マーカー
      ctx.fillStyle='#ffcc66';
      ctx.font='bold 14px sans-serif';
      ctx.fillText('◆',W/2-150,cy);
      ctx.fillText('◆',W/2+150,cy);
      ctx.textBaseline='alphabetic';
      // サブテキスト（box の下に余裕を持って配置）
      ctx.textBaseline='top';
      ctx.fillStyle='rgba(255,220,180,0.55)';
      ctx.font='10px sans-serif';
      ctx.fillText(subs[i],W/2,cy+bh/2+3);
      ctx.textBaseline='alphabetic';
    } else {
      ctx.textBaseline='middle';
      ctx.font='400 18px "Helvetica Neue", sans-serif';
      ctx.fillStyle='rgba(150,160,180,0.55)';
      ctx.fillText(item,W/2,cy);
      ctx.textBaseline='alphabetic';
    }
  });

  // 操作ヒント
  ctx.font='12px sans-serif';ctx.fillStyle='rgba(180,180,210,0.45)';ctx.textAlign='center';
  ctx.fillText(isMobile?'タップで選択':'↑/↓ で選択  ENTER または SPACE で決定',W/2,H-22);
}

// === SETTINGS SCREEN ===
function _settingsRows(){
  const rows=[];
  rows.push({type:'difficulty', label:'難易度', adjust:true});
  rows.push({type:'controlScheme', label:'操作モード', adjust:true});
  rows.push({type:'gamepad', label:'ゲームパッド', adjust:true});
  rows.push({type:'header', label:'— 1P キー設定 —'});
  for(const a of ['up','down','left','right','attack','light','heavy','special','throw_btn','guard']){
    rows.push({type:'keybind', label:_actionLabel(a), action:a, player:'p1'});
  }
  rows.push({type:'header', label:'— 2P キー設定 —'});
  for(const a of ['up','down','left','right','light','heavy','special','throw_btn','guard']){
    rows.push({type:'keybind', label:_actionLabel(a), action:a, player:'p2'});
  }
  rows.push({type:'reset', label:'デフォルトに戻す'});
  rows.push({type:'back', label:'タイトルに戻る'});
  return rows.filter(r=>r.type!=='header'||true); // header も表示
}

function _actionLabel(a){
  return ({
    up:'↑ 上', down:'↓ 下', left:'← 左', right:'→ 右',
    attack:'攻撃 (簡易/十字)',
    light:'軽攻撃 (パンチ)', heavy:'重攻撃 (キック)',
    special:'必殺技', throw_btn:'投げ', guard:'防御'
  })[a]||a;
}

function _settingsAdjust(row, dir){
  if(!row) return;
  const s=saveData.settings;
  if(row.type==='difficulty'){
    const ids=Object.keys(DIFFICULTIES);
    const i=Math.max(0,ids.indexOf(s.difficulty));
    s.difficulty=ids[(i+dir+ids.length)%ids.length];
    Storage.save(saveData);
  } else if(row.type==='controlScheme'){
    const ids=Object.keys(CONTROL_SCHEMES);
    const i=Math.max(0,ids.indexOf(s.controlScheme));
    s.controlScheme=ids[(i+dir+ids.length)%ids.length];
    Storage.save(saveData);
  } else if(row.type==='gamepad'){
    s.gamepadEnabled=!s.gamepadEnabled;
    Storage.save(saveData);
  }
}

function _settingsValueText(row){
  const s=saveData.settings;
  if(row.type==='difficulty'){
    const d=DIFFICULTIES[s.difficulty]||DIFFICULTIES.normal;
    return `${d.label} / ${d.nameJp}`;
  }
  if(row.type==='controlScheme'){
    const c=CONTROL_SCHEMES[s.controlScheme]||CONTROL_SCHEMES.standard;
    return c.label;
  }
  if(row.type==='gamepad'){
    const id=gamepadConnected();
    return s.gamepadEnabled?(id?`接続中: ${id.substring(0,28)}`:'有効 (未検出)'):'無効';
  }
  if(row.type==='keybind'){
    return _keyDisplay(s.keybinds[row.player||'p1'][row.action]);
  }
  return '';
}

function _keyDisplay(code){
  if(!code) return '—';
  return ({
    ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→',
    Space:'Space', ShiftLeft:'Shift', ShiftRight:'Shift', Enter:'Enter',
    Escape:'Esc', Tab:'Tab', Backspace:'BS',
  })[code] || code.replace(/^Key/,'').replace(/^Digit/,'');
}

function drawSettings(ctx){
  const fc=game.frameCount;
  // 背景
  const bgg=ctx.createLinearGradient(0,0,0,H);
  bgg.addColorStop(0,'#06081a');bgg.addColorStop(0.5,'#10122a');bgg.addColorStop(1,'#04050e');
  ctx.fillStyle=bgg;ctx.fillRect(0,0,W,H);
  // グリッド
  ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='rgba(80,120,200,0.06)';ctx.lineWidth=1;
  for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.restore();

  // タイトル
  ctx.textAlign='center';
  ctx.fillStyle='#ffcc55';ctx.font='bold 26px "Helvetica Neue",sans-serif';
  ctx.fillText('OPTIONS',W/2,38);
  ctx.fillStyle='rgba(180,200,230,0.5)';ctx.font='10px sans-serif';
  ctx.fillText('— 設定 —',W/2,52);

  // パネル
  const px=40,py=68,pw=W-80,ph=H-130;
  FX.glass(ctx,px,py,pw,ph,12,'rgba(12,16,30,0.65)','rgba(160,180,230,0.3)');

  const rows=_settingsRows();
  // スクロール（必要時）
  const visibleRows=Math.floor((ph-30)/22);
  const sel=game.settingsIndex;
  let startRow=Math.max(0,Math.min(rows.length-visibleRows,sel-Math.floor(visibleRows/2)));

  ctx.textAlign='left';
  for(let i=0;i<Math.min(visibleRows,rows.length);i++){
    const idx=startRow+i;
    if(idx>=rows.length) break;
    const row=rows[idx];
    const ry=py+18+i*22;
    const isSel=idx===sel;

    if(row.type==='header'){
      ctx.fillStyle='rgba(255,200,120,0.5)';ctx.font='bold 11px sans-serif';
      ctx.fillText(row.label,px+24,ry+12);
      continue;
    }

    if(isSel){
      // 選択ハイライト
      const pulse=0.6+Math.sin(fc*0.12)*0.3;
      ctx.fillStyle=`rgba(255,180,80,${0.10*pulse})`;
      ctx.fillRect(px+10,ry,pw-20,20);
      ctx.fillStyle=`rgba(255,210,120,${0.7*pulse})`;
      ctx.fillRect(px+10,ry,3,20);
    }

    // ラベル
    ctx.fillStyle=isSel?'#fff5cc':'rgba(220,225,240,0.85)';
    ctx.font=isSel?'bold 13px sans-serif':'13px sans-serif';
    ctx.fillText(row.label,px+24,ry+15);

    // 値
    if(row.type==='difficulty'){
      const d=DIFFICULTIES[saveData.settings.difficulty]||DIFFICULTIES.normal;
      ctx.fillStyle=d.color;ctx.font='bold 13px sans-serif';ctx.textAlign='right';
      ctx.fillText(`◀ ${_settingsValueText(row)} ▶`,px+pw-24,ry+15);
    } else if(row.type==='controlScheme'){
      const c=CONTROL_SCHEMES[saveData.settings.controlScheme]||CONTROL_SCHEMES.standard;
      ctx.fillStyle='#88ccff';ctx.font='bold 13px sans-serif';ctx.textAlign='right';
      ctx.fillText(`◀ ${c.label} ▶`,px+pw-24,ry+15);
      ctx.fillStyle='rgba(180,200,230,0.55)';ctx.font='10px sans-serif';
      ctx.textAlign='right';
      ctx.fillText(c.desc,px+pw-24,ry+27);
    } else if(row.type==='gamepad'){
      ctx.fillStyle=saveData.settings.gamepadEnabled?'#88ddaa':'#888';ctx.font='13px sans-serif';ctx.textAlign='right';
      ctx.fillText(_settingsValueText(row),px+pw-24,ry+15);
    } else if(row.type==='keybind'){
      const isRebinding=game.settingsRebindAction===row.action&&game.settingsRebindPlayer===row.player&&isSel;
      if(isRebinding){
        const blink=Math.sin(fc*0.2)*0.5+0.5;
        ctx.fillStyle=`rgba(255,210,120,${0.5+blink*0.5})`;ctx.font='bold 12px sans-serif';ctx.textAlign='right';
        ctx.fillText('▶ キーを押してください (Esc=取消)',px+pw-24,ry+15);
      } else {
        // キー名をボックス調に
        const keyText=_settingsValueText(row);
        ctx.font='bold 11px monospace';
        const tw=ctx.measureText(keyText).width+14;
        FX.roundRect(ctx,px+pw-24-tw,ry+2,tw,16,4);
        ctx.fillStyle='rgba(20,30,50,0.85)';ctx.fill();
        ctx.strokeStyle='rgba(180,200,240,0.5)';ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle='#ddeeff';ctx.textAlign='center';
        ctx.fillText(keyText,px+pw-24-tw/2,ry+14);
      }
    } else if(row.type==='reset'||row.type==='back'){
      if(isSel){
        ctx.fillStyle='#ffaa44';ctx.font='bold 12px sans-serif';ctx.textAlign='right';
        ctx.fillText('▶ Enter で実行',px+pw-24,ry+15);
      }
    }
    ctx.textAlign='left';
  }

  // フッター
  ctx.textAlign='center';
  ctx.fillStyle='rgba(200,210,230,0.55)';ctx.font='11px sans-serif';
  ctx.fillText('↑↓: 選択   ←→ / Enter: 値変更   Esc: タイトル',W/2,H-32);
  // 選択中のキーバインド再割り当て待機
  if(game.settingsRebindAction){
    ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
    FX.glass(ctx,W/2-220,H/2-60,440,120,12,'rgba(20,24,40,0.85)','rgba(255,200,120,0.6)');
    ctx.textAlign='center';
    ctx.fillStyle='#ffcc55';ctx.font='bold 18px sans-serif';
    ctx.fillText('新しいキーを押してください',W/2,H/2-15);
    ctx.fillStyle='#ddeeff';ctx.font='13px sans-serif';
    ctx.fillText(`[${game.settingsRebindPlayer.toUpperCase()}] ${_actionLabel(game.settingsRebindAction)}`,W/2,H/2+8);
    ctx.fillStyle='rgba(200,210,230,0.55)';ctx.font='11px sans-serif';
    ctx.fillText('Esc で取消',W/2,H/2+32);
  }
}

function drawCharSelect(ctx) {
  const fc=game.frameCount;
  // 背景
  const bgg=ctx.createLinearGradient(0,0,0,H);
  bgg.addColorStop(0,'#06081a');bgg.addColorStop(0.5,'#10122a');bgg.addColorStop(1,'#04050e');
  ctx.fillStyle=bgg;ctx.fillRect(0,0,W,H);
  // 装飾グリッド
  ctx.save();ctx.globalCompositeOperation='screen';ctx.strokeStyle='rgba(80,120,200,0.06)';ctx.lineWidth=1;
  for(let x=0;x<W;x+=40){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
  for(let y=0;y<H;y+=40){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
  ctx.restore();
  // 中央スポット
  ctx.save();ctx.globalCompositeOperation='screen';
  const sp=ctx.createRadialGradient(W/2,H/2,40,W/2,H/2,W*0.6);
  sp.addColorStop(0,'rgba(255,180,80,0.10)');sp.addColorStop(1,'rgba(255,180,80,0)');
  ctx.fillStyle=sp;ctx.fillRect(0,0,W,H);
  ctx.restore();

  // タイトルバー
  ctx.textAlign='center';
  ctx.fillStyle='#ffcc55';ctx.font='bold 26px "Helvetica Neue",sans-serif';
  ctx.fillText('CHARACTER SELECT',W/2,38);
  ctx.fillStyle='rgba(180,200,230,0.5)';ctx.font='10px sans-serif';
  ctx.fillText('— 闘士を選べ —',W/2,52);

  const chars=Object.keys(CHARACTERS);
  const cols=4, rows=2;
  const cardW=110, cardH=155, gapX=14, gapY=12;
  const gridW=cols*cardW+(cols-1)*gapX;
  const gridH=rows*cardH+(rows-1)*gapY;
  const ox=(W-gridW)/2, oy=68;

  chars.forEach((charId,i)=>{
    const col=i%cols, row=Math.floor(i/cols);
    const cx=ox+col*(cardW+gapX)+cardW/2;
    const cy=oy+row*(cardH+gapY)+cardH/2;
    const ch=CHARACTERS[charId];
    const s1=i===game.selectIndex1, s2=i===game.selectIndex2;
    const cardX=cx-cardW/2, cardY=cy-cardH/2;

    // カード本体（キャラカラーをほのかに、shadowBlur 不使用）
    FX.roundRect(ctx,cardX,cardY,cardW,cardH,8);
    const tint=ch.colors.gi;
    const cg=ctx.createLinearGradient(cardX,cardY,cardX,cardY+cardH);
    cg.addColorStop(0,_shade(tint,-0.7));
    cg.addColorStop(0.5,_shade(tint,-0.85));
    cg.addColorStop(1,'#06070f');
    ctx.fillStyle=cg;ctx.fill();

    // キャラタイプ別の発光
    ctx.save();FX.roundRect(ctx,cardX,cardY,cardW,cardH,8);ctx.clip();
    ctx.globalCompositeOperation='screen';
    const auraG=ctx.createRadialGradient(cx,cy+10,5,cx,cy+10,80);
    auraG.addColorStop(0,_toRgba(ch.colors.giLight,0.45));
    auraG.addColorStop(1,_toRgba(ch.colors.giLight,0));
    ctx.fillStyle=auraG;ctx.fillRect(cardX,cardY,cardW,cardH);
    ctx.restore();

    // キャラプレビュー
    ctx.save();ctx.translate(cx,cy+18);
    const pv=new Fighter(charId,1,0);pv.y=0;pv.animFrame=fc+i*10;
    const bs=ch.bodyScale||1;
    // 床の影
    ctx.save();
    ctx.fillStyle='rgba(0,0,0,0.45)';ctx.filter='blur(2px)';
    ctx.beginPath();ctx.ellipse(0,38,22*bs,5*bs,0,0,Math.PI*2);ctx.fill();
    ctx.restore();
    ctx.scale(bs*0.85,bs*0.85);
    pv._drawIdle(ctx,ch.colors);
    ctx.restore();

    // 名前バー（下部）
    ctx.save();
    const nameH=36;
    FX.roundRect(ctx,cardX,cardY+cardH-nameH,cardW,nameH,0);
    const ng=ctx.createLinearGradient(0,cardY+cardH-nameH,0,cardY+cardH);
    ng.addColorStop(0,'rgba(0,0,0,0)');ng.addColorStop(1,'rgba(0,0,0,0.7)');
    ctx.fillStyle=ng;ctx.fill();
    ctx.restore();
    ctx.fillStyle='#fff';ctx.font='bold 13px "Helvetica Neue",sans-serif';
    ctx.textAlign='center';
    ctx.fillText(ch.name,cx,cardY+cardH-18);
    ctx.fillStyle='rgba(200,210,225,0.7)';ctx.font='10px "Hiragino Sans",sans-serif';
    ctx.fillText(ch.nameJp,cx,cardY+cardH-6);

    // カード枠（基本）
    ctx.save();
    FX.roundRect(ctx,cardX,cardY,cardW,cardH,8);
    ctx.strokeStyle='rgba(180,200,240,0.18)';ctx.lineWidth=1;ctx.stroke();
    ctx.restore();

    // 選択ハイライト（shadowBlur 不使用）
    if(s1||s2){
      const pulse=0.7+Math.sin(fc*0.12)*0.3;
      const color=s1?'#4488ff':'#ff4477';
      // 二重枠線で擬似グロー
      FX.roundRect(ctx,cardX-2,cardY-2,cardW+4,cardH+4,9);
      ctx.strokeStyle=FX.rgba(color,0.4*pulse);ctx.lineWidth=4;ctx.stroke();
      FX.roundRect(ctx,cardX,cardY,cardW,cardH,8);
      ctx.strokeStyle=color;ctx.lineWidth=2.4;ctx.stroke();
      // 角ブラケット
      ctx.strokeStyle=color;ctx.lineWidth=2.5;ctx.lineCap='round';
      const bl=10;
      [[cardX,cardY,1,1],[cardX+cardW,cardY,-1,1],[cardX,cardY+cardH,1,-1],[cardX+cardW,cardY+cardH,-1,-1]].forEach(([px,py,sx,sy])=>{
        ctx.beginPath();ctx.moveTo(px,py+sy*bl);ctx.lineTo(px,py);ctx.lineTo(px+sx*bl,py);ctx.stroke();
      });
      // タグ
      ctx.fillStyle=color;ctx.font='bold 10px sans-serif';ctx.textAlign='center';
      const tag=s1?'▼ 1P':(game.mode==='pvp'?'▼ 2P':'▼ CPU');
      ctx.fillText(tag,cx,cardY+12);
    }
  });

  // 選択キャラの情報パネル
  const selChar=chars[game.selectIndex1];
  const ch=CHARACTERS[selChar];
  const infoY=oy+gridH+18, infoH=H-infoY-40;

  FX.glass(ctx,30,infoY,W-60,infoH,12,'rgba(12,16,30,0.65)','rgba(160,180,230,0.3)');

  ctx.textAlign='left';
  // 名前
  ctx.fillStyle='#ffcc55';ctx.font='bold 18px "Helvetica Neue",sans-serif';
  ctx.fillText(ch.name,52,infoY+25);
  ctx.fillStyle='rgba(200,200,220,0.65)';ctx.font='13px "Hiragino Sans",sans-serif';
  ctx.fillText(ch.nameJp,52+ctx.measureText(ch.name).width+8,infoY+25);
  ctx.fillStyle='rgba(180,190,210,0.85)';ctx.font='12px sans-serif';
  ctx.fillText(ch.description,52,infoY+44);

  // ステータスバー
  const statX=52, statY=infoY+62, barW2=110, barH2=8;
  const stats=[
    ['SPD', ch.walkSpeed/5, '#44cc88'],
    ['POW', ch.attacks.heavy.damage/22, '#ee5544'],
    ['RNG', (ch.attacks.special.type==='projectile'?0.9:ch.attacks.special.rushDist?ch.attacks.special.rushDist/200:0.5), '#5588ff'],
    ['DEF', ch.bodyScale>1.1?0.8:ch.bodyScale<0.95?0.4:0.6, '#ffaa44']
  ];
  stats.forEach(([label,val,color],si)=>{
    const sx=statX+si*150;
    ctx.fillStyle='rgba(180,195,220,0.85)';ctx.font='bold 10px sans-serif';ctx.textAlign='left';
    ctx.fillText(label,sx,statY-2);
    // 背景
    FX.roundRect(ctx,sx+30,statY-9,barW2,barH2,barH2/2);
    ctx.fillStyle='rgba(0,0,0,0.55)';ctx.fill();
    // 値
    ctx.save();FX.roundRect(ctx,sx+30,statY-9,barW2,barH2,barH2/2);ctx.clip();
    const fg=ctx.createLinearGradient(sx+30,0,sx+30+barW2,0);
    fg.addColorStop(0,_shade(color,-0.3));fg.addColorStop(1,color);
    ctx.fillStyle=fg;
    ctx.fillRect(sx+30,statY-9,barW2*Math.min(val,1),barH2);
    // ハイライト
    ctx.fillStyle='rgba(255,255,255,0.3)';
    ctx.fillRect(sx+30,statY-9,barW2*Math.min(val,1),barH2*0.4);
    ctx.restore();
    // 枠（shadowBlur 不使用）
    FX.roundRect(ctx,sx+30,statY-9,barW2,barH2,barH2/2);
    ctx.strokeStyle=FX.rgba(color,0.5);ctx.lineWidth=1;ctx.stroke();
    ctx.fillStyle='rgba(220,230,250,0.7)';ctx.font='9px sans-serif';
    ctx.fillText(Math.round(val*100),sx+30+barW2+6,statY-1);
  });

  // 背景ストーリー
  const backstory=typeof STORY!=='undefined'&&STORY.characters[selChar]?.backstory;
  if(backstory){
    ctx.fillStyle='rgba(180,195,225,0.65)';ctx.font='11px "Hiragino Sans",sans-serif';ctx.textAlign='left';
    const line1=backstory.split('\n')[0];
    ctx.fillText(line1.substring(0,80)+(line1.length>80?'…':''),52,statY+22);
  }

  // 操作ヒント
  ctx.textAlign='center';
  ctx.fillStyle='rgba(180,190,220,0.55)';ctx.font='12px sans-serif';
  ctx.fillText('←/→: キャラ選択   SPACE / ENTER: 決定',W/2,H-18);
}

// === MAIN GAME OBJECT ===
const game = {
  state:STATE.TITLE, frameCount:0, menuIndex:0, mode:'cpu',
  selectIndex1:0, selectIndex2:1,
  p1:null, p2:null, projectiles:[],
  round:1, timer:ROUND_TIME, introTimer:0, roundEndTimer:0, matchEndTimer:0,
  screenShake:0, hitstopFrames:0, doubleKO:false,
  slowMoFrames:0, screenFlash:0, screenFlashColor:'#fff',
  paused:false, fadeAlpha:0, fadeDir:0, fadeCallback:null,
  damageNumbers:[],
  _navHeld:false, _confirmHeld:false,
  p1Name:'', p2Name:'',
  // story
  storyTextProgress:0, storyTextTarget:'', storyDialogueIndex:0,
  // bgm
  bgmPlaying:false,
  // tournament
  tournament:null,
  // settings
  settingsIndex:0, settingsRebindAction:null, settingsRebindPlayer:'p1',

  init() { this.state=STATE.TITLE;this.menuIndex=0;this.frameCount=0; },

  startCharSelect() { this.state=STATE.SELECT;this.selectIndex1=0;this.selectIndex2=1;AudioEngine.play('select'); },

  startMatch() {
    const chars=Object.keys(CHARACTERS);

    if(this.mode==='tournament'&&!this.tournament){
      this._initTournament(chars);return;
    }

    this.p1=new Fighter(chars[this.selectIndex1],1,250);
    if(this.mode==='tournament'){
      const oppId=this.tournament.currentOpponent;
      this.p2=new Fighter(oppId,2,710);
      this.p2.displayName=CHARACTERS[oppId].name;
    } else {
      this.p2=new Fighter(chars[this.selectIndex2],2,710);
    }
    this.p1.displayName=this.p1Name||this.p1.data.name;
    if(this.mode!=='tournament') this.p2.displayName=this.p2Name||(this.mode==='cpu'?'CPU':this.p2.data.name);
    this.projectiles=[];this.round=1;this.p1.wins=0;this.p2.wins=0;

    if(this.mode==='story'){
      this.state=STATE.STORY_INTRO;this.storyTextProgress=0;
      this.storyTextTarget=STORY.intro;
    } else {
      this.startRound();
    }
  },

  // === TOURNAMENT SYSTEM ===
  _initTournament(chars) {
    const playerChar=chars[this.selectIndex1];
    // Shuffle other characters for bracket
    const others=chars.filter(c=>c!==playerChar);
    for(let i=others.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[others[i],others[j]]=[others[j],others[i]];}
    // Build 8-player bracket: 4 matches in QF
    // Player is always in slot 0
    const seeds=[playerChar,...others];
    this.tournament={
      seeds:seeds,
      // bracket[round][match] = {a, b, winner}
      bracket:[
        [{a:seeds[0],b:seeds[1],winner:null},{a:seeds[2],b:seeds[3],winner:null},
         {a:seeds[4],b:seeds[5],winner:null},{a:seeds[6],b:seeds[7],winner:null}],
        [{a:null,b:null,winner:null},{a:null,b:null,winner:null}],
        [{a:null,b:null,winner:null}]
      ],
      roundIndex:0,
      matchIndex:0,
      currentOpponent:seeds[1],
      playerChar:playerChar,
      roundNames:['QUARTER FINALS','SEMI FINALS','FINAL'],
      resultTimer:0,
    };
    this.state=STATE.TOURNAMENT_BRACKET;
  },

  _tournamentAdvance() {
    const t=this.tournament;
    const r=t.bracket[t.roundIndex];
    const playerChar=t.playerChar;

    // Check if player was eliminated
    const playerMatch=r[t.matchIndex];
    if(playerMatch&&playerMatch.winner&&playerMatch.winner!==playerChar){
      // Player eliminated - show final bracket then go to title
      this.state=STATE.MATCH_END;this.matchEndTimer=300;
      saveData.totalLosses++;Storage.save(saveData);
      return;
    }

    // Simulate non-player matches in this round
    for(let i=0;i<r.length;i++){
      if(r[i].winner) continue;
      // If neither fighter is the player, simulate
      if(r[i].a!==playerChar&&r[i].b!==playerChar){
        // Random winner weighted by stats
        const sa=CHARACTERS[r[i].a], sb=CHARACTERS[r[i].b];
        const pa=sa.walkSpeed+sa.attacks.heavy.damage*0.5;
        const pb=sb.walkSpeed+sb.attacks.heavy.damage*0.5;
        r[i].winner=Math.random()*pa>Math.random()*pb?r[i].a:r[i].b;
      }
    }

    // Fill next round bracket
    if(t.roundIndex<2){
      const next=t.bracket[t.roundIndex+1];
      for(let i=0;i<next.length;i++){
        next[i].a=r[i*2].winner;
        next[i].b=r[i*2+1].winner;
      }
    }

    // Move to next round
    t.roundIndex++;
    if(t.roundIndex>=3){
      // Tournament complete!
      this.state=STATE.TOURNAMENT_CHAMPION;
      this.matchEndTimer=300;
      saveData.totalWins++;Storage.save(saveData);
      return;
    }

    // Find player's next match
    const nr=t.bracket[t.roundIndex];
    let found=false;
    for(let i=0;i<nr.length;i++){
      if(nr[i].a===playerChar||nr[i].b===playerChar){
        t.matchIndex=i;
        t.currentOpponent=nr[i].a===playerChar?nr[i].b:nr[i].a;
        found=true;break;
      }
    }

    if(!found){
      // Player was eliminated (shouldn't happen if they won)
      this.state=STATE.TITLE;return;
    }

    this.state=STATE.TOURNAMENT_BRACKET;
  },

  startRound() {
    this.state=STATE.INTRO;this.introTimer=150;this.timer=ROUND_TIME;this.projectiles=[];
    this.p1.reset(250);this.p2.reset(710);this.doubleKO=false;AudioEngine.play('round');
  },

  showDialogue() {
    this.state=STATE.DIALOGUE;this.storyDialogueIndex=0;this.storyTextProgress=0;
  },

  update() {
    this.frameCount++;updateInputState();
    // Fade transition
    if(this.fadeDir!==0){this.fadeAlpha+=this.fadeDir*0.05;
      if(this.fadeAlpha>=1){this.fadeAlpha=1;this.fadeDir=0;if(this.fadeCallback){this.fadeCallback();this.fadeCallback=null;this.fadeDir=-1;}}
      if(this.fadeAlpha<=0){this.fadeAlpha=0;this.fadeDir=0;}
    }
    // Slow motion
    if(this.slowMoFrames>0){this.slowMoFrames--;if(this.frameCount%3!==0)return;}
    if(this.hitstopFrames>0){this.hitstopFrames--;return;}
    // Screen flash decay
    if(this.screenFlash>0)this.screenFlash--;
    // Pause check
    if(this.state===STATE.FIGHTING&&(keyJustPressed['Escape']||keyJustPressed['KeyP'])){this.paused=!this.paused;return;}
    if(this.paused)return;
    // Damage numbers
    for(let i=this.damageNumbers.length-1;i>=0;i--){if(!this.damageNumbers[i].update())this.damageNumbers.splice(i,1);}

    switch(this.state) {
      case STATE.TITLE: this._updateTitle();break;
      case STATE.NAME_INPUT: this._updateNameInput();break;
      case STATE.SELECT: this._updateSelect();break;
      case STATE.SETTINGS: this._updateSettings();break;
      case STATE.STORY_INTRO: this._updateStoryText();break;
      case STATE.DIALOGUE: this._updateDialogue();break;
      case STATE.INTRO: this._updateIntro();break;
      case STATE.FIGHTING: this._updateFighting();break;
      case STATE.ROUND_END: this._updateRoundEnd();break;
      case STATE.MATCH_END: this._updateMatchEnd();break;
      case STATE.STORY_END: this._updateStoryText();break;
      case STATE.TOURNAMENT_BRACKET: this._updateTournamentBracket();break;
      case STATE.TOURNAMENT_RESULT: this._updateTournamentResult();break;
      case STATE.TOURNAMENT_CHAMPION: this._updateMatchEnd();break;
    }

    for(let i=particles.length-1;i>=0;i--){if(!particles[i].update())particles.splice(i,1);}
    this.screenShake*=SHAKE_DECAY;if(this.screenShake<0.5)this.screenShake=0;
  },

  _updateTitle() {
    const N=6;
    if(keys['ArrowUp']||keys['KeyW']){if(!this._navHeld){this.menuIndex=(this.menuIndex-1+N)%N;this._navHeld=true;AudioEngine.play('select');}}
    else if(keys['ArrowDown']||keys['KeyS']){if(!this._navHeld){this.menuIndex=(this.menuIndex+1)%N;this._navHeld=true;AudioEngine.play('select');}}
    else this._navHeld=false;
    if(keys['Space']||keys['Enter']){if(!this._confirmHeld){this._confirmHeld=true;
      const choice=['story','tournament','cpu','pvp','training','options'][this.menuIndex];
      if(choice==='options'){
        this.state=STATE.SETTINGS;
        this.settingsIndex=0; this.settingsRebindAction=null;
        AudioEngine.play('select');
        return;
      }
      this.mode=choice;
      // Show name input
      this.state=STATE.NAME_INPUT;
      const overlay=document.getElementById('nameOverlay');
      const input=document.getElementById('nameInput');
      overlay.classList.add('active');
      input.value=saveData.playerName||'';
      setTimeout(()=>input.focus(),100);
    }}else this._confirmHeld=false;
  },

  _updateNameInput() {
    // handled by DOM events
  },

  // === SETTINGS ===
  _updateSettings() {
    const rows=_settingsRows();
    const N=rows.length;

    // 再割り当て待機中: 任意のキーを次の入力で割り当て
    if(this.settingsRebindAction){
      const action=this.settingsRebindAction;
      // ESC でキャンセル
      if(keyJustPressed['Escape']){this.settingsRebindAction=null;return;}
      for(const code in keyJustPressed){
        if(keyJustPressed[code] && code!=='Escape'){
          saveData.settings.keybinds[this.settingsRebindPlayer][action]=code;
          Storage.save(saveData);
          this.settingsRebindAction=null;
          AudioEngine.play('select');
          return;
        }
      }
      return;
    }

    const ti=touchInput;
    if(keys['ArrowUp']||keys['KeyW']||ti.up){if(!this._navHeld){this.settingsIndex=(this.settingsIndex-1+N)%N;this._navHeld=true;AudioEngine.play('select');}}
    else if(keys['ArrowDown']||keys['KeyS']||ti.down){if(!this._navHeld){this.settingsIndex=(this.settingsIndex+1)%N;this._navHeld=true;AudioEngine.play('select');}}
    else if(keys['ArrowLeft']||keys['KeyA']||ti.left){if(!this._navHeld){_settingsAdjust(rows[this.settingsIndex],-1);this._navHeld=true;AudioEngine.play('select');}}
    else if(keys['ArrowRight']||keys['KeyD']||ti.right){if(!this._navHeld){_settingsAdjust(rows[this.settingsIndex],1);this._navHeld=true;AudioEngine.play('select');}}
    else this._navHeld=false;

    if(keyJustPressed['Escape']){this.state=STATE.TITLE;return;}

    if(keys['Space']||keys['Enter']){
      if(!this._confirmHeld){this._confirmHeld=true;
        const row=rows[this.settingsIndex];
        if(row.type==='keybind'){
          this.settingsRebindAction=row.action;
          this.settingsRebindPlayer=row.player||'p1';
        } else if(row.type==='reset'){
          saveData.settings=defaultSettings();
          Storage.save(saveData);
          AudioEngine.play('select');
        } else if(row.type==='back'){
          this.state=STATE.TITLE;
          AudioEngine.play('select');
        } else if(row.adjust){
          _settingsAdjust(row,1);
          AudioEngine.play('select');
        }
      }
    } else this._confirmHeld=false;
  },

  _updateSelect() {
    const chars=Object.keys(CHARACTERS),n=chars.length;
    if(keyJustPressed['ArrowLeft']){this.selectIndex1=(this.selectIndex1-1+n)%n;AudioEngine.play('select');}
    if(keyJustPressed['ArrowRight']){this.selectIndex1=(this.selectIndex1+1)%n;AudioEngine.play('select');}
    if(this.mode==='pvp'){
      if(keyJustPressed['KeyA']){this.selectIndex2=(this.selectIndex2-1+n)%n;AudioEngine.play('select');}
      if(keyJustPressed['KeyD']){this.selectIndex2=(this.selectIndex2+1)%n;AudioEngine.play('select');}
    }
    if(keys['Space']||keys['Enter']){if(!this._confirmHeld){this._confirmHeld=true;this.startMatch();}}else this._confirmHeld=false;
  },

  _updateStoryText() {
    this.storyTextProgress+=0.5;
    if((keys['Space']||keys['Enter'])&&!this._confirmHeld){
      this._confirmHeld=true;
      if(this.storyTextProgress>=this.storyTextTarget.length){
        if(this.state===STATE.STORY_INTRO){
          this.showDialogue();
        } else if(this.state===STATE.STORY_END){
          this.state=STATE.TITLE;
        }
      } else {
        this.storyTextProgress=this.storyTextTarget.length;
      }
    }
    if(!keys['Space']&&!keys['Enter'])this._confirmHeld=false;
  },

  _updateDialogue() {
    const dial=STORY.rivalDialogue;
    this.storyTextProgress+=0.5;
    const currentLine=dial[this.storyDialogueIndex];
    if((keys['Space']||keys['Enter'])&&!this._confirmHeld){
      this._confirmHeld=true;
      if(this.storyTextProgress>=currentLine.text.length){
        this.storyDialogueIndex++;this.storyTextProgress=0;
        AudioEngine.play('text');
        if(this.storyDialogueIndex>=dial.length){this.startRound();}
      } else {
        this.storyTextProgress=currentLine.text.length;
      }
    }
    if(!keys['Space']&&!keys['Enter'])this._confirmHeld=false;
  },

  _updateIntro() { this.introTimer--;if(this.introTimer<=0){this.state=STATE.FIGHTING;AudioEngine.startBGM();} },

  _updateFighting() {
    if(this.mode!=='training'){this.timer-=1/60;if(this.timer<=0){this.timer=0;this._endRound();return;}}
    const p1i=getP1Input();
    const dummyInput={left:false,right:false,up:false,down:false,light:false,heavy:false,special:false,throw_btn:false,lightJP:false,heavyJP:false,specialJP:false,throwJP:false};
    // 難易度: 設定から取得。トーナメントは1ラウンドごとに +0.15 で上昇
    const baseDiff=(DIFFICULTIES[saveData.settings.difficulty]||DIFFICULTIES.normal).value;
    const aiDiff = this.mode==='tournament'&&this.tournament
      ? Math.min(1.05, baseDiff*0.7+this.tournament.roundIndex*0.18)
      : baseDiff;
    const p2i=(this.mode==='pvp')?getP2Input():(this.mode==='training')?dummyInput:getAIInput(this.p2,this.p1,aiDiff);
    this.p1.update(p1i,this.p2);this.p2.update(p2i,this.p1);
    this._checkHit(this.p1,this.p2);this._checkHit(this.p2,this.p1);
    for(let i=this.projectiles.length-1;i>=0;i--){
      const pr=this.projectiles[i];if(!pr.update()){this.projectiles.splice(i,1);continue;}
      const tgt=pr.owner===1?this.p2:this.p1,atk=pr.owner===1?this.p1:this.p2;
      if(this._boxOverlap(pr.getHitbox(),tgt.getHurtbox())){
        const bl=tgt.isBlockingAttack(atk.dir);
        tgt.takeHit(pr.damage,pr.knockback,pr.hitstun,atk.dir,bl);
        if(!bl){atk.super=Math.min(atk.maxSuper,atk.super+pr.damage*0.5);atk.comboCount++;atk.comboTimer=60;this.hitstopFrames=HITSTOP_FRAMES;}
        spawnHitParticles(pr.x,pr.y,pr.color,15);this.projectiles.splice(i,1);
      }
    }
    if(this.mode==='training'){if(this.p1.hp<30)this.p1.hp+=0.5;if(this.p2.hp<30)this.p2.hp+=0.5;}
    if(this.p1.hp<=0||this.p2.hp<=0)this._endRound();
  },

  _checkHit(atk,def) {
    if(atk.hasHit)return;
    let hb=atk.getAttackHitbox()||atk.getRushHitbox()||atk.getDiveHitbox();
    if(!hb||!this._boxOverlap(hb,def.getHurtbox()))return;
    atk.hasHit=true;const ad=atk.attackData;const bl=def.isBlockingAttack(atk.dir);
    def.takeHit(ad.damage,ad.knockback,ad.hitstun,atk.dir,bl,{forceKnockdown:!!ad.forceKnockdown,launch:!!ad.launch});
    if(!bl){atk.super=Math.min(atk.maxSuper,atk.super+ad.damage*0.5);atk.comboCount++;atk.comboTimer=60;
      this.hitstopFrames=ad.damage>10?HITSTOP_FRAMES+2:HITSTOP_FRAMES;AudioEngine.play(ad.sound);}
  },

  _boxOverlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;},

  _endRound() {
    if(this.mode==='training')return;
    this.state=STATE.ROUND_END;this.roundEndTimer=180;AudioEngine.stopBGM();
    const isKO=this.p1.hp<=0||this.p2.hp<=0;
    if(this.p1.hp<=0&&this.p2.hp<=0){
      // Double KO - both lose, no one gets a win
      this.p1.hp=0;this.p2.hp=0;
      this.p1.fstate=FSTATE.KNOCKDOWN;this.p1.knockdownTime=60;this.p1.vy=-6;
      this.p2.fstate=FSTATE.KNOCKDOWN;this.p2.knockdownTime=60;this.p2.vy=-6;
      this.doubleKO=true;
    } else if(this.p2.hp<=0||this.p1.hp>this.p2.hp){
      this.p2.hp=Math.max(0,this.p2.hp);this.p1.wins++;
      this.p1.fstate=FSTATE.VICTORY;this.p2.fstate=FSTATE.DEFEAT;
      if(isKO)saveData.totalKOs++;
    } else {
      this.p1.hp=Math.max(0,this.p1.hp);this.p2.wins++;
      this.p2.fstate=FSTATE.VICTORY;this.p1.fstate=FSTATE.DEFEAT;
    }
  },

  _updateRoundEnd() {
    this.roundEndTimer--;
    if(this.roundEndTimer<=0){
      if(this.p1.wins>=ROUNDS_TO_WIN||this.p2.wins>=ROUNDS_TO_WIN){
        // save stats
        if(this.p1.wins>=ROUNDS_TO_WIN)saveData.totalWins++;else saveData.totalLosses++;
        Storage.save(saveData);

        if(this.mode==='tournament'&&this.tournament){
          // Record result in bracket
          const t=this.tournament;
          const match=t.bracket[t.roundIndex][t.matchIndex];
          match.winner=this.p1.wins>=ROUNDS_TO_WIN?t.playerChar:t.currentOpponent;
          t.resultTimer=0;
          if(match.winner!==t.playerChar){
            // Player eliminated
            this.state=STATE.TOURNAMENT_RESULT;
          } else {
            this.state=STATE.TOURNAMENT_RESULT;
          }
        } else if(this.mode==='story'&&this.p1.wins>=ROUNDS_TO_WIN){
          const charId=Object.keys(CHARACTERS)[this.selectIndex1];
          this.state=STATE.STORY_END;
          this.storyTextTarget=STORY.characters[charId].ending;
          this.storyTextProgress=0;
          saveData.storyCompleted[charId]=true;Storage.save(saveData);
        } else {
          this.state=STATE.MATCH_END;this.matchEndTimer=300;
        }
      } else {this.round++;this.startRound();}
    }
  },

  _updateMatchEnd() {
    this.matchEndTimer--;
    if(this.matchEndTimer<=0||((keys['Space']||keys['Enter'])&&!this._confirmHeld)){
      this._confirmHeld=true;
      this.tournament=null; // clear tournament on exit
      this.state=STATE.TITLE;
    }
    if(!keys['Space']&&!keys['Enter'])this._confirmHeld=false;
  },

  _updateTournamentBracket() {
    if(keys['Space']||keys['Enter']){
      if(!this._confirmHeld){
        this._confirmHeld=true;
        // Start next match
        this.startMatch();
      }
    } else this._confirmHeld=false;
  },

  _updateTournamentResult() {
    this.tournament.resultTimer++;
    if(this.tournament.resultTimer>120||((keys['Space']||keys['Enter'])&&!this._confirmHeld)){
      this._confirmHeld=true;
      this._tournamentAdvance();
    }
    if(!keys['Space']&&!keys['Enter'])this._confirmHeld=false;
  },

  _drawTournamentBracket(ctx) {
    const t=this.tournament;if(!t)return;
    ctx.fillStyle='#080812';ctx.fillRect(0,0,W,H);
    ctx.textAlign='center';

    // Title
    const rn=t.roundIndex<3?t.roundNames[t.roundIndex]:'COMPLETE';
    ctx.fillStyle='#ffcc44';ctx.font='bold 24px sans-serif';
    ctx.fillText('TOURNAMENT - '+rn,W/2,32);

    // Draw bracket tree
    const bx=80, by=60, colW=200, rowH=55;
    const rounds=t.bracket;

    for(let ri=0;ri<3;ri++){
      const matches=rounds[ri];
      const matchCount=matches.length;
      const totalH=matchCount*rowH*Math.pow(2,ri);
      const startY=by+(H-by-40-totalH)/2;

      for(let mi=0;mi<matchCount;mi++){
        const m=matches[mi];
        const x=bx+ri*colW;
        const spacing=rowH*Math.pow(2,ri);
        const y=startY+mi*spacing+spacing/2;
        const slotH=22;

        // Match box
        const isPlayerMatch=(m.a===t.playerChar||m.b===t.playerChar);
        const isCurrent=(ri===t.roundIndex&&this.state===STATE.TOURNAMENT_BRACKET);

        // Slot A
        if(m.a){
          const isPlayer=m.a===t.playerChar;
          const isWinner=m.winner===m.a;
          const isLoser=m.winner&&m.winner!==m.a;
          ctx.fillStyle=isLoser?'#1a1a22':isPlayer?'#1a2a50':'#16161e';
          ctx.fillRect(x,y-slotH-2,160,slotH);
          if(isWinner){ctx.strokeStyle='#ffcc44';ctx.lineWidth=2;ctx.strokeRect(x,y-slotH-2,160,slotH);}
          else if(isPlayer&&isCurrent){ctx.strokeStyle='#4488ff';ctx.lineWidth=2;ctx.strokeRect(x,y-slotH-2,160,slotH);}
          ctx.fillStyle=isLoser?'#556':isPlayer?'#88bbff':'#aab';
          ctx.font=isPlayer?'bold 13px sans-serif':'13px sans-serif';
          ctx.textAlign='left';
          ctx.fillText((isPlayer?'★ ':'')+CHARACTERS[m.a].name,x+8,y-slotH+13);
          if(isWinner){ctx.fillStyle='#ffcc44';ctx.textAlign='right';ctx.fillText('WIN',x+152,y-slotH+13);}
        } else {
          ctx.fillStyle='#111';ctx.fillRect(x,y-slotH-2,160,slotH);
          ctx.fillStyle='#444';ctx.font='13px sans-serif';ctx.textAlign='left';ctx.fillText('---',x+8,y-slotH+13);
        }

        // Slot B
        if(m.b){
          const isPlayer=m.b===t.playerChar;
          const isWinner=m.winner===m.b;
          const isLoser=m.winner&&m.winner!==m.b;
          ctx.fillStyle=isLoser?'#1a1a22':isPlayer?'#1a2a50':'#16161e';
          ctx.fillRect(x,y+2,160,slotH);
          if(isWinner){ctx.strokeStyle='#ffcc44';ctx.lineWidth=2;ctx.strokeRect(x,y+2,160,slotH);}
          else if(isPlayer&&isCurrent){ctx.strokeStyle='#4488ff';ctx.lineWidth=2;ctx.strokeRect(x,y+2,160,slotH);}
          ctx.fillStyle=isLoser?'#556':isPlayer?'#88bbff':'#aab';
          ctx.font=isPlayer?'bold 13px sans-serif':'13px sans-serif';
          ctx.textAlign='left';
          ctx.fillText((isPlayer?'★ ':'')+CHARACTERS[m.b].name,x+8,y+17);
          if(isWinner){ctx.fillStyle='#ffcc44';ctx.textAlign='right';ctx.fillText('WIN',x+152,y+17);}
        } else {
          ctx.fillStyle='#111';ctx.fillRect(x,y+2,160,slotH);
          ctx.fillStyle='#444';ctx.font='13px sans-serif';ctx.textAlign='left';ctx.fillText('---',x+8,y+17);
        }

        // Connector lines to next round
        if(ri<2&&m.winner){
          ctx.strokeStyle='#334';ctx.lineWidth=1;
          const nx=x+160, ny=y;
          const nextY=startY+Math.floor(mi/2)*spacing*2+spacing;
          ctx.beginPath();ctx.moveTo(nx,ny);ctx.lineTo(nx+20,ny);ctx.lineTo(nx+20,nextY);ctx.lineTo(nx+40,nextY);ctx.stroke();
        }
      }
    }

    // Instructions
    ctx.textAlign='center';ctx.fillStyle='#556';ctx.font='14px sans-serif';
    if(this.state===STATE.TOURNAMENT_BRACKET){
      const opp=CHARACTERS[t.currentOpponent];
      ctx.fillStyle='#aab';ctx.font='16px sans-serif';
      ctx.fillText(`NEXT: vs ${opp.name} (${opp.nameJp})`,W/2,H-55);
      const pulse=Math.sin(this.frameCount*0.08)*0.3+0.7;
      ctx.fillStyle=`rgba(255,204,68,${pulse})`;ctx.font='14px sans-serif';
      ctx.fillText('Space: 試合開始',W/2,H-30);
    } else if(this.state===STATE.TOURNAMENT_RESULT){
      const match=t.bracket[t.roundIndex][t.matchIndex];
      if(match.winner===t.playerChar){
        ctx.fillStyle='#44cc66';ctx.font='bold 18px sans-serif';ctx.fillText('WIN! 次のラウンドへ進出！',W/2,H-40);
      } else {
        ctx.fillStyle='#cc4444';ctx.font='bold 18px sans-serif';ctx.fillText('LOSE... トーナメント敗退',W/2,H-40);
      }
    }
  },

  render() {
    // 各フレーム冒頭で確実にリセット（多重描画/状態漏れ防止）
    ctx.setTransform(1,0,0,1,0,0);
    ctx.globalAlpha=1;
    ctx.globalCompositeOperation='source-over';
    ctx.filter='none';
    ctx.clearRect(0,0,W,H);
    ctx.save();
    if(this.screenShake>0)ctx.translate((Math.random()-0.5)*this.screenShake*2,(Math.random()-0.5)*this.screenShake*2);

    switch(this.state) {
      case STATE.TITLE: drawTitle(ctx);break;
      case STATE.NAME_INPUT: drawTitle(ctx);break; // show title behind overlay
      case STATE.SELECT: drawCharSelect(ctx);break;
      case STATE.SETTINGS: drawSettings(ctx);break;
      case STATE.STORY_INTRO: {
        ctx.fillStyle='#0a0a18';ctx.fillRect(0,0,W,H);
        ctx.textAlign='center';ctx.fillStyle='#ffcc44';ctx.font='bold 28px sans-serif';
        ctx.fillText('風神武闘会',W/2,100);
        drawTextBox(ctx,_personalize(this.storyTextTarget),'',this.storyTextProgress);
        break;
      }
      case STATE.DIALOGUE: {
        drawBackground(ctx);this.p1.draw(ctx);this.p2.draw(ctx);
        const dl=STORY.rivalDialogue[this.storyDialogueIndex];
        if(dl){
          drawTextBox(ctx,_personalize(dl.text),_resolveSpeakerName(dl.speaker),this.storyTextProgress);
        }
        break;
      }
      case STATE.INTRO: {
        drawBackground(ctx);this.p1.draw(ctx);this.p2.draw(ctx);drawHUD(ctx);
        const t=this.introTimer;ctx.textAlign='center';
        // 中央バンド
        ctx.save();
        const bandA=t>90?Math.min(1,(150-t)/15):t>30?Math.max(0,(t-30)/30):0;
        ctx.fillStyle=`rgba(0,0,0,${bandA*0.45})`;
        ctx.fillRect(0,H/2-70,W,140);
        // 上下のライン
        const lg=ctx.createLinearGradient(0,0,W,0);
        lg.addColorStop(0,'rgba(255,200,80,0)');
        lg.addColorStop(0.5,`rgba(255,200,80,${bandA*0.85})`);
        lg.addColorStop(1,'rgba(255,200,80,0)');
        ctx.fillStyle=lg;
        ctx.fillRect(0,H/2-70,W,2);ctx.fillRect(0,H/2+68,W,2);
        ctx.restore();

        if(t>90){
          const s=Math.min(1,(150-t)/20);
          const fa=Math.min(1,(150-t)/12);
          ctx.save();
          ctx.translate(W/2,H/2-10);ctx.scale(s,s);
          ctx.globalAlpha=fa;
          // 影
          ctx.fillStyle='rgba(0,0,0,0.7)';ctx.font='bold 56px "Helvetica Neue",sans-serif';
          ctx.fillText(`ROUND ${this.round}`,4,5);
          // 縁取り
          ctx.lineWidth=4;ctx.strokeStyle='#3a1a08';ctx.lineJoin='round';
          ctx.strokeText(`ROUND ${this.round}`,0,0);
          // メイン
          const tg=ctx.createLinearGradient(0,-30,0,20);
          tg.addColorStop(0,'#fff5cc');tg.addColorStop(0.5,'#ffcc44');tg.addColorStop(1,'#aa5522');
          ctx.fillStyle=tg;
          ctx.shadowColor='#ff8844';ctx.shadowBlur=20;
          ctx.fillText(`ROUND ${this.round}`,0,0);
          ctx.restore();
        } else if(t>30){
          const s=1+(60-t)*0.012;
          const fa=Math.min(1,t/30);
          ctx.save();
          ctx.translate(W/2,H/2-10);ctx.scale(s,s);
          ctx.globalAlpha=fa;
          // 衝撃リング
          if(t>50){
            ctx.save();
            const rt=(60-t)/10;
            ctx.strokeStyle=`rgba(255,200,80,${(1-rt)*0.8})`;ctx.lineWidth=4;
            ctx.beginPath();ctx.arc(0,0,80*rt,0,Math.PI*2);ctx.stroke();
            ctx.restore();
          }
          ctx.fillStyle='rgba(0,0,0,0.7)';ctx.font='bold 80px "Helvetica Neue","Arial Black",sans-serif';
          ctx.fillText('FIGHT!',5,6);
          ctx.lineWidth=6;ctx.strokeStyle='#3a0808';ctx.lineJoin='round';
          ctx.strokeText('FIGHT!',0,0);
          const fg=ctx.createLinearGradient(0,-40,0,30);
          fg.addColorStop(0,'#fff');fg.addColorStop(0.4,'#ffeebb');fg.addColorStop(0.55,'#ff5544');fg.addColorStop(1,'#aa1122');
          ctx.fillStyle=fg;
          ctx.shadowColor='#ff5544';ctx.shadowBlur=24;
          ctx.fillText('FIGHT!',0,0);
          ctx.restore();
        }
        break;
      }
      case STATE.FIGHTING:case STATE.ROUND_END:case STATE.MATCH_END:
        drawBackground(ctx);
        this.projectiles.forEach(p=>p.draw(ctx));
        if(this.p1.y<=this.p2.y){this.p1.draw(ctx);this.p2.draw(ctx);}else{this.p2.draw(ctx);this.p1.draw(ctx);}
        particles.forEach(p=>p.draw(ctx));drawHUD(ctx);

        if(this.state===STATE.ROUND_END&&this.roundEndTimer>100){
          ctx.textAlign='center';
          // バンド
          const bandG=ctx.createLinearGradient(0,H/2-70,0,H/2+70);
          bandG.addColorStop(0,'rgba(0,0,0,0)');bandG.addColorStop(0.5,'rgba(0,0,0,0.7)');bandG.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=bandG;ctx.fillRect(0,H/2-70,W,140);
          if(this.doubleKO){
            ctx.save();
            ctx.lineWidth=5;ctx.strokeStyle='#3a0808';ctx.lineJoin='round';
            ctx.font='bold 58px "Helvetica Neue","Arial Black",sans-serif';
            ctx.strokeText('DOUBLE K.O.!',W/2,H/2+10);
            ctx.shadowColor='#ff3344';ctx.shadowBlur=22;
            const dg=ctx.createLinearGradient(0,H/2-30,0,H/2+30);
            dg.addColorStop(0,'#ff8888');dg.addColorStop(0.5,'#ff3344');dg.addColorStop(1,'#aa0011');
            ctx.fillStyle=dg;
            ctx.fillText('DOUBLE K.O.!',W/2,H/2+10);
            ctx.restore();
          } else {
            const winner=this.p1.fstate===FSTATE.VICTORY?this.p1:this.p2;
            ctx.save();
            ctx.lineWidth=5;ctx.strokeStyle='#2a1a08';ctx.lineJoin='round';
            ctx.font='bold 48px "Helvetica Neue","Arial Black",sans-serif';
            ctx.strokeText(`${winner.displayName||winner.data.name} WINS!`,W/2,H/2);
            ctx.shadowColor='#ffaa44';ctx.shadowBlur=20;
            const wg=ctx.createLinearGradient(0,H/2-25,0,H/2+10);
            wg.addColorStop(0,'#fff5cc');wg.addColorStop(0.5,'#ffcc44');wg.addColorStop(1,'#aa5522');
            ctx.fillStyle=wg;
            ctx.fillText(`${winner.displayName||winner.data.name} WINS!`,W/2,H/2);
            ctx.restore();
            const charId=winner.charId;
            const quotes=STORY.characters[charId]?.victoryQuotes;
            if(quotes){
              ctx.save();
              ctx.fillStyle='rgba(0,0,0,0.7)';ctx.font='italic 16px "Hiragino Sans",sans-serif';
              ctx.fillText('「'+quotes[this.round%quotes.length]+'」',W/2+1,H/2+37);
              ctx.fillStyle='#dde0ee';
              ctx.fillText('「'+quotes[this.round%quotes.length]+'」',W/2,H/2+36);
              ctx.restore();
            }
          }
        }

        // Damage numbers
        this.damageNumbers.forEach(d=>d.draw(ctx));

        // Pause overlay
        if(this.paused){
          // 背景ブラー風
          ctx.fillStyle='rgba(8,10,18,0.78)';ctx.fillRect(0,0,W,H);
          // パネル
          const pw=460,ph=380;
          FX.glass(ctx,W/2-pw/2,H/2-ph/2,pw,ph,16,'rgba(20,24,40,0.8)','rgba(180,200,240,0.4)');
          ctx.textAlign='center';
          ctx.save();
          ctx.shadowColor='rgba(255,200,100,0.5)';ctx.shadowBlur=14;
          ctx.fillStyle='#ffcc55';ctx.font='bold 36px "Helvetica Neue",sans-serif';
          ctx.fillText('PAUSE',W/2,H/2-130);
          ctx.restore();
          ctx.fillStyle='rgba(180,200,230,0.55)';ctx.font='11px sans-serif';
          ctx.fillText('— 操作一覧 —',W/2,H/2-110);
          ctx.fillStyle='#dde';ctx.font='14px sans-serif';
          const moveLines=[
            'Space: パンチ (軽攻撃)',
            'Shift: キック (重攻撃)',
            'Z: 必殺技      X: 投げ (近距離)',
            '↓ + Shift: 足払い  ↑ + Space: アッパー',
            '空中 ↓ + Shift: 急降下キック',
            '→→: ダッシュ    ←←: バックステップ',
            'C: 防御 (← 後ろ入力でも可)',
          ];
          moveLines.forEach((l,i)=>ctx.fillText(l,W/2,H/2-80+i*26));
          // 再開
          const pulse=Math.sin(this.frameCount*0.1)*0.3+0.7;
          ctx.save();
          ctx.shadowColor='#ffcc55';ctx.shadowBlur=10*pulse;
          ctx.fillStyle=`rgba(255,210,120,${0.7+pulse*0.3})`;
          ctx.font='bold 14px sans-serif';
          ctx.fillText('Esc / P で再開',W/2,H/2+150);
          ctx.restore();
        }

        if(this.state===STATE.MATCH_END){
          // 背景
          ctx.fillStyle='rgba(0,0,0,0.65)';ctx.fillRect(0,0,W,H);
          // 中央バンド
          const bg2=ctx.createLinearGradient(0,H/2-100,0,H/2+100);
          bg2.addColorStop(0,'rgba(0,0,0,0)');bg2.addColorStop(0.5,'rgba(50,30,15,0.7)');bg2.addColorStop(1,'rgba(0,0,0,0)');
          ctx.fillStyle=bg2;ctx.fillRect(0,H/2-100,W,200);
          ctx.textAlign='center';
          const mw=this.p1.wins>=ROUNDS_TO_WIN?this.p1:this.p2;
          // 装飾ライン
          const lg=ctx.createLinearGradient(W/2-220,0,W/2+220,0);
          lg.addColorStop(0,'rgba(255,200,80,0)');lg.addColorStop(0.5,'rgba(255,210,120,0.85)');lg.addColorStop(1,'rgba(255,200,80,0)');
          ctx.fillStyle=lg;ctx.fillRect(W/2-220,H/2-65,440,1.5);ctx.fillRect(W/2-220,H/2+65,440,1.5);

          // 名前（大きく豪華に）
          ctx.save();
          ctx.lineWidth=6;ctx.strokeStyle='#3a1a08';ctx.lineJoin='round';
          ctx.font='bold 60px "Helvetica Neue","Arial Black",sans-serif';
          ctx.strokeText(mw.displayName||mw.data.name,W/2,H/2-15);
          ctx.shadowColor='#ffaa44';ctx.shadowBlur=24;
          const wg=ctx.createLinearGradient(0,H/2-50,0,H/2);
          wg.addColorStop(0,'#fff5cc');wg.addColorStop(0.5,'#ffcc44');wg.addColorStop(1,'#aa3322');
          ctx.fillStyle=wg;
          ctx.fillText(mw.displayName||mw.data.name,W/2,H/2-15);
          ctx.restore();
          // WINS THE MATCH
          ctx.save();
          ctx.lineWidth=4;ctx.strokeStyle='#1a1a2a';ctx.lineJoin='round';
          ctx.font='bold 30px "Helvetica Neue",sans-serif';
          ctx.strokeText('WINS THE MATCH!',W/2,H/2+30);
          ctx.fillStyle='#fff5e0';
          ctx.fillText('WINS THE MATCH!',W/2,H/2+30);
          ctx.restore();

          const pulse=Math.sin(this.frameCount*0.1)*0.3+0.7;
          ctx.save();
          ctx.shadowColor='#fff';ctx.shadowBlur=8*pulse;
          ctx.fillStyle=`rgba(220,230,255,${0.55+pulse*0.4})`;ctx.font='15px sans-serif';
          ctx.fillText('▶ SPACE で続ける',W/2,H/2+95);
          ctx.restore();
        }
        break;
      case STATE.STORY_END: {
        ctx.fillStyle='#0a0a18';ctx.fillRect(0,0,W,H);
        ctx.textAlign='center';ctx.fillStyle='#ffcc44';ctx.font='bold 28px sans-serif';
        ctx.fillText('ENDING',W/2,80);
        const charId=Object.keys(CHARACTERS)[this.selectIndex1];
        const ch=CHARACTERS[charId];
        const playerName=(this.p1Name&&this.p1Name.trim())||ch.name;
        ctx.fillStyle='#8899bb';ctx.font='18px sans-serif';
        // 入力名がある場合: 「ATSU （カイト として）」、なければキャラ名のみ
        const subText=this.p1Name&&this.p1Name.trim()
          ? `${playerName}　（${ch.nameJp} として）`
          : ch.nameJp;
        ctx.fillText(subText,W/2,115);
        drawTextBox(ctx,_personalize(this.storyTextTarget),'',this.storyTextProgress);
        break;
      }
      case STATE.TOURNAMENT_BRACKET:
      case STATE.TOURNAMENT_RESULT:
        this._drawTournamentBracket(ctx);
        break;
      case STATE.TOURNAMENT_CHAMPION:
        this._drawTournamentBracket(ctx);
        // Champion overlay
        ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
        // 黄金光線
        ctx.save();ctx.globalCompositeOperation='screen';ctx.translate(W/2,H/2);
        for(let i=0;i<14;i++){
          const a=this.frameCount*0.005+i*Math.PI/7;
          const grad=ctx.createLinearGradient(0,0,Math.cos(a)*500,Math.sin(a)*500);
          grad.addColorStop(0,'rgba(255,220,120,0.3)');
          grad.addColorStop(1,'rgba(255,180,60,0)');
          ctx.fillStyle=grad;
          ctx.beginPath();ctx.moveTo(0,0);
          ctx.lineTo(Math.cos(a)*900,Math.sin(a)*900);
          ctx.lineTo(Math.cos(a+0.05)*900,Math.sin(a+0.05)*900);
          ctx.fill();
        }
        ctx.restore();
        ctx.textAlign='center';
        // CHAMPION
        ctx.save();
        ctx.lineWidth=8;ctx.strokeStyle='#3a1a08';ctx.lineJoin='round';
        ctx.font='bold 80px "Helvetica Neue","Arial Black",sans-serif';
        ctx.strokeText('CHAMPION!',W/2,H/2-30);
        ctx.shadowColor='#ffcc44';ctx.shadowBlur=30;
        const cg=ctx.createLinearGradient(0,H/2-80,0,H/2-10);
        cg.addColorStop(0,'#fffbcc');cg.addColorStop(0.5,'#ffcc44');cg.addColorStop(1,'#aa3322');
        ctx.fillStyle=cg;
        ctx.fillText('CHAMPION!',W/2,H/2-30);
        ctx.restore();
        // 名前
        ctx.save();
        ctx.lineWidth=4;ctx.strokeStyle='#1a1a2a';ctx.lineJoin='round';
        ctx.font='bold 28px "Helvetica Neue",sans-serif';
        const champName=this.p1Name||CHARACTERS[this.tournament.playerChar].name;
        ctx.strokeText(champName,W/2,H/2+22);
        ctx.fillStyle='#fff5e0';
        ctx.fillText(champName,W/2,H/2+22);
        ctx.restore();
        ctx.fillStyle='rgba(220,200,160,0.85)';ctx.font='17px "Hiragino Sans",sans-serif';
        ctx.fillText('— 風神武闘会 制覇 —',W/2,H/2+52);
        const p2=Math.sin(this.frameCount*0.1)*0.4+0.6;
        ctx.save();
        ctx.shadowColor='#fff';ctx.shadowBlur=8*p2;
        ctx.fillStyle=`rgba(220,230,255,${0.55+p2*0.4})`;ctx.font='bold 15px sans-serif';
        ctx.fillText('▶ SPACE',W/2,H/2+92);
        ctx.restore();
        break;
    }

    // Screen flash overlay
    if(this.screenFlash>0){
      ctx.fillStyle=this.screenFlashColor;
      ctx.globalAlpha=this.screenFlash*0.08;
      ctx.fillRect(0,0,W,H);
      ctx.globalAlpha=1;
    }

    // Fade overlay
    if(this.fadeAlpha>0){
      ctx.fillStyle='#000';
      ctx.globalAlpha=this.fadeAlpha;
      ctx.fillRect(0,0,W,H);
      ctx.globalAlpha=1;
    }

    ctx.restore();
  },

  // Fade transition helper
  fadeTo(callback) {
    this.fadeDir=1;this.fadeCallback=callback;
  }
};

// === NAME INPUT HANDLER ===
document.getElementById('nameConfirm').addEventListener('click', confirmName);
const nameInputEl = document.getElementById('nameInput');
nameInputEl.addEventListener('keydown', e => {
  if(e.key==='Enter') { e.preventDefault(); confirmName(); }
  e.stopPropagation();
});
nameInputEl.addEventListener('keyup', e => e.stopPropagation());

function confirmName() {
  const input=document.getElementById('nameInput');
  const name=input.value.trim();
  game.p1Name=name||'';
  saveData.playerName=name;Storage.save(saveData);
  document.getElementById('nameOverlay').classList.remove('active');
  canvas.focus();
  game.startCharSelect();
}

// Mobile: tap on canvas areas for menu
canvas.addEventListener('click', e => {
  canvas.focus();AudioEngine.ensure();
  if(!isMobile) return;
  const rect=canvas.getBoundingClientRect();
  const x=(e.clientX-rect.left)/rect.width*W;
  const y=(e.clientY-rect.top)/rect.height*H;

  if(game.state===STATE.TITLE){
    const menuY=280;
    for(let i=0;i<5;i++){
      if(y>menuY+i*42-20&&y<menuY+i*42+15){game.menuIndex=i;AudioEngine.play('select');
        game.mode=['story','tournament','cpu','pvp','training'][i];game.state=STATE.NAME_INPUT;
        const ov=document.getElementById('nameOverlay');const inp=document.getElementById('nameInput');
        ov.classList.add('active');inp.value=saveData.playerName||'';setTimeout(()=>inp.focus(),100);return;
      }
    }
  }
  if(game.state===STATE.SELECT){
    const chars=Object.keys(CHARACTERS);
    if(x<W/2){game.selectIndex1=(game.selectIndex1+1)%chars.length;AudioEngine.play('select');}
    else{
      // confirm
      keys['Space']=true;setTimeout(()=>{keys['Space']=false;},100);
    }
  }
  if(game.state===STATE.STORY_INTRO||game.state===STATE.DIALOGUE||game.state===STATE.STORY_END||
     game.state===STATE.MATCH_END){
    keys['Space']=true;setTimeout(()=>{keys['Space']=false;},100);
  }
});

// === GAME LOOP ===
game.init();
function gameLoop(){
  try { game.update(); } catch(e){ console.error('update error:', e); }
  try { game.render(); } catch(e){ console.error('render error:', e); }
  requestAnimationFrame(gameLoop);
}
requestAnimationFrame(gameLoop);
canvas.tabIndex=1;canvas.focus();
