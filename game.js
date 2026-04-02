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
             bestTime: null, matchHistory: [], storyCompleted: {} };
  }
};

let saveData = Storage.load();

const STATE = {
  TITLE: 'title', NAME_INPUT: 'name_input',
  SELECT: 'select', STORY_INTRO: 'story_intro',
  DIALOGUE: 'dialogue', INTRO: 'intro',
  FIGHTING: 'fighting', ROUND_END: 'round_end',
  MATCH_END: 'match_end', STORY_END: 'story_end'
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
  update() { this.x+=this.vx;this.y+=this.vy;this.vy+=0.1;this.life--;return this.life>0; }
  draw(ctx) {
    const a=this.life/this.maxLife; ctx.globalAlpha=a; ctx.fillStyle=this.color;
    if(this.type==='circle'){ctx.beginPath();ctx.arc(this.x,this.y,this.size*a,0,Math.PI*2);ctx.fill();}
    else{ctx.fillRect(this.x-this.size/2,this.y-this.size/2,this.size*a,this.size*a);}
    ctx.globalAlpha=1;
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
    const scale = 1 + (1 - a) * 0.3;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#000';
    ctx.font = 'bold 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.value, 1, 1);
    ctx.fillStyle = this.color;
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
const touchInput = { left:false,right:false,up:false,down:false,light:false,heavy:false,special:false,throw_btn:false };
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

function getP1Input() {
  const ti = touchInput;
  const l = !!keys['ArrowLeft']||ti.left, r = !!keys['ArrowRight']||ti.right;
  const u = !!keys['ArrowUp']||ti.up, d = !!keys['ArrowDown']||ti.down;
  const lt = !!keys['Space']||ti.light, hv = !!keys['ShiftLeft']||!!keys['ShiftRight']||ti.heavy;
  const sp = !!keys['KeyZ']||ti.special, th = !!keys['KeyX']||ti.throw_btn;

  // just pressed for touch
  touchJP.light = lt && !touchPrev.light;
  touchJP.heavy = hv && !touchPrev.heavy;
  touchJP.special = sp && !touchPrev.special;
  touchJP.throw_btn = th && !touchPrev.throw_btn;
  touchPrev.light = lt; touchPrev.heavy = hv; touchPrev.special = sp; touchPrev.throw_btn = th;

  return {
    left:l, right:r, up:u, down:d,
    light:lt, heavy:hv, special:sp, throw_btn:th,
    lightJP: !!keyJustPressed['Space']||touchJP.light,
    heavyJP: !!keyJustPressed['ShiftLeft']||!!keyJustPressed['ShiftRight']||touchJP.heavy,
    specialJP: !!keyJustPressed['KeyZ']||touchJP.special,
    throwJP: !!keyJustPressed['KeyX']||touchJP.throw_btn,
  };
}

function getP2Input() {
  return {
    left:!!keys['KeyA'], right:!!keys['KeyD'], up:!!keys['KeyW'], down:!!keys['KeyS'],
    light:!!keys['KeyU'], heavy:!!keys['KeyI'], special:!!keys['KeyO'], throw_btn:!!keys['KeyP'],
    lightJP:!!keyJustPressed['KeyU'], heavyJP:!!keyJustPressed['KeyI'],
    specialJP:!!keyJustPressed['KeyO'], throwJP:!!keyJustPressed['KeyP'],
  };
}

// === AI ===
function getAIInput(self,opp,difficulty=0.6) {
  const inp={left:false,right:false,up:false,down:false,light:false,heavy:false,special:false,throw_btn:false,lightJP:false,heavyJP:false,specialJP:false,throwJP:false};
  const dist=Math.abs(self.x-opp.x), fr=self.x<opp.x;
  if(Math.random()>difficulty*0.3){if(dist>200){if(fr)inp.right=true;else inp.left=true;}else if(dist<80&&Math.random()<0.3){if(fr)inp.left=true;else inp.right=true;}}
  const canAct=self.fstate===FSTATE.IDLE||self.fstate===FSTATE.WALK_F||self.fstate===FSTATE.WALK_B;
  if(canAct){
    if(dist<60&&Math.random()<difficulty*0.03){inp.throw_btn=true;inp.throwJP=true;}
    if(dist<100&&Math.random()<difficulty*0.08){inp.light=true;inp.lightJP=true;}
    if(dist<120&&Math.random()<difficulty*0.04){inp.heavy=true;inp.heavyJP=true;}
    if(dist<100&&Math.random()<difficulty*0.02){inp.down=true;inp.heavy=true;inp.heavyJP=true;}
    if(dist>150&&dist<400&&Math.random()<difficulty*0.02){inp.special=true;inp.specialJP=true;}
    if(opp.fstate===FSTATE.JUMP&&dist<150&&Math.random()<difficulty*0.08){inp.down=true;inp.light=true;inp.lightJP=true;}
    if(dist>200&&Math.random()<difficulty*0.01)self._aiDash=true;
  }
  if(opp.fstate===FSTATE.ATTACK&&dist<130&&Math.random()<difficulty*0.5){if(fr)inp.left=true;else inp.right=true;}
  if(Math.random()<0.004*difficulty)inp.up=true;
  if(self.fstate===FSTATE.JUMP&&self.vy>0&&dist<120&&Math.random()<difficulty*0.06){inp.down=true;inp.heavy=true;inp.heavyJP=true;}
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
    description:'波動拳を操る正統派格闘家'
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
    description:'疾風の如き高速格闘家'
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
    ctx.save();ctx.shadowBlur=20;ctx.shadowColor=this.color;ctx.fillStyle=this.color;ctx.globalAlpha=0.8;
    ctx.beginPath();ctx.arc(this.x,this.y,this.radius*p,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#fff';ctx.globalAlpha=0.6;ctx.beginPath();ctx.arc(this.x,this.y,this.radius*p*0.5,0,Math.PI*2);ctx.fill();ctx.restore();
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
    const w=this.bodyW,h=this.fstate===FSTATE.CROUCH?this.bodyH*0.6:this.bodyH;
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
    // Blocking = holding direction away from attacker
    const ci=this.currentInput||{};const pi=this.prevInput||{};
    const holdBack = (attackerDir>0&&(ci.left||pi.left)) || (attackerDir<0&&(ci.right||pi.right));
    return this.fstate===FSTATE.WALK_B || this.fstate===FSTATE.BLOCK ||
      ((this.fstate===FSTATE.IDLE||this.fstate===FSTATE.CROUCH) && holdBack);
  }

  // === DRAWING ===
  draw(ctx) {
    ctx.save();ctx.translate(this.x,this.y);ctx.scale(this.dir,1);
    const c=this.data.colors;
    if(this.flashTimer>0&&this.flashTimer%2===0) ctx.filter='brightness(3)';
    switch(this.fstate) {
      case FSTATE.IDLE:this._drawIdle(ctx,c);break;
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
    ctx.fillStyle=c.headband;ctx.fillRect(-11,-13,22,6);ctx.fillRect(-14,-13,4,12);
    ctx.fillStyle=c.skin;ctx.beginPath();ctx.arc(0,0,11,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=c.hair;ctx.beginPath();ctx.arc(0,-3,11,Math.PI,Math.PI*2);ctx.fill();
    ctx.fillStyle='#111';ctx.fillRect(3,-2,3,3);ctx.fillRect(-2,-2,3,3);
    ctx.fillRect(2,-5,5,2);ctx.fillRect(-3,-5,5,2);ctx.restore();
  }
  _drawBody(ctx,c,x,y,w,h) {
    ctx.fillStyle=c.gi;ctx.fillRect(x-w/2,y,w,h);
    ctx.fillStyle=c.giLight;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w/3,y);ctx.lineTo(x+2,y+h*0.4);ctx.lineTo(x-w/3,y);ctx.closePath();ctx.fill();
    ctx.fillStyle=c.belt;ctx.fillRect(x-w/2,y+h*0.65,w,4);
  }
  _drawLimb(ctx,color,x1,y1,x2,y2,w) { ctx.strokeStyle=color;ctx.lineWidth=w;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke(); }
  _drawFist(ctx,c,x,y) { ctx.fillStyle=c.skin;ctx.fillRect(x-4,y-4,8,8); }
  _drawFoot(ctx,c,x,y) { ctx.fillStyle='#443322';ctx.fillRect(x-3,y-3,10,6); }

  _drawIdle(ctx,c) {
    const b=Math.sin(this.animFrame*0.08)*2;
    this._drawLimb(ctx,c.pants,-8,0,-10,18+b,9);this._drawLimb(ctx,c.pants,-10,18+b,-8,34+b,8);this._drawFoot(ctx,c,-8,34+b);
    this._drawLimb(ctx,c.pants,8,0,10,18+b,9);this._drawLimb(ctx,c.pants,10,18+b,8,34+b,8);this._drawFoot(ctx,c,8,34+b);
    this._drawBody(ctx,c,0,-38+b,28,38);
    const ab=Math.sin(this.animFrame*0.08+1)*2;
    this._drawLimb(ctx,c.gi,-14,-32+b,-18,-16+ab,7);this._drawLimb(ctx,c.skin,-18,-16+ab,-14,-4+ab,6);this._drawFist(ctx,c,-14,-4+ab);
    this._drawLimb(ctx,c.gi,14,-32+b,20,-18+ab,7);this._drawLimb(ctx,c.skin,20,-18+ab,22,-6+ab,6);this._drawFist(ctx,c,22,-6+ab);
    this._drawHead(ctx,c,0,-52+b);
  }
  _drawWalk(ctx,c,d) {
    const s=Math.sin(this.animFrame*0.15)*10;
    this._drawLimb(ctx,c.pants,-6,0,-6+s,18,9);this._drawLimb(ctx,c.pants,-6+s,18,-6+s*0.5,34,8);this._drawFoot(ctx,c,-6+s*0.5,34);
    this._drawLimb(ctx,c.pants,6,0,6-s,18,9);this._drawLimb(ctx,c.pants,6-s,18,6-s*0.5,34,8);this._drawFoot(ctx,c,6-s*0.5,34);
    this._drawBody(ctx,c,0,-38,28,38);
    this._drawLimb(ctx,c.gi,-14,-32,-18-s*0.5,-16,7);this._drawLimb(ctx,c.skin,-18-s*0.5,-16,-14-s*0.3,-4,6);this._drawFist(ctx,c,-14-s*0.3,-4);
    this._drawLimb(ctx,c.gi,14,-32,20+s*0.5,-18,7);this._drawLimb(ctx,c.skin,20+s*0.5,-18,22+s*0.3,-6,6);this._drawFist(ctx,c,22+s*0.3,-6);
    this._drawHead(ctx,c,0,-52);
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
    ctx.translate(0,-Math.abs(Math.sin(this.animFrame*0.06))*5);
    this._drawLimb(ctx,c.pants,-8,0,-10,18,9);this._drawLimb(ctx,c.pants,-10,18,-8,34,8);this._drawFoot(ctx,c,-8,34);
    this._drawLimb(ctx,c.pants,8,0,10,18,9);this._drawLimb(ctx,c.pants,10,18,8,34,8);this._drawFoot(ctx,c,8,34);
    this._drawBody(ctx,c,0,-38,28,38);
    this._drawLimb(ctx,c.gi,-14,-34,-20,-50,7);this._drawLimb(ctx,c.skin,-20,-50,-16,-60,6);this._drawFist(ctx,c,-16,-60);
    this._drawLimb(ctx,c.gi,14,-34,20,-50,7);this._drawLimb(ctx,c.skin,20,-50,16,-60,6);this._drawFist(ctx,c,16,-60);
    this._drawHead(ctx,c,0,-52);
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

function drawBackground(ctx) {
  // Use cached background for static elements, only redraw animated parts
  if(!bgCache){bgCache=document.createElement('canvas');bgCache.width=W;bgCache.height=H;bgCacheDirty=true;}
  if(bgCacheDirty){
    const bc=bgCache.getContext('2d');
    _drawBgStatic(bc);
    bgCacheDirty=false;
  }
  ctx.drawImage(bgCache,0,0);
  // Animated elements on top
  const fc=game.frameCount;
  // twinkling stars
  ctx.fillStyle='#fff';
  [123,456,789,234,567,890,135,468,791,246,579,802,147,258,369,470,581,692,703,814].forEach((s,i)=>{
    ctx.globalAlpha=(Math.sin(fc*0.02+s)*0.3+0.7)*0.6;
    ctx.fillRect((s*7+i*43)%W,(s*3+i*17)%(GROUND_Y-50),2,2);
  });ctx.globalAlpha=1;
  // lanterns glow
  ctx.fillStyle='#ff6633';ctx.globalAlpha=0.4+Math.sin(fc*0.05)*0.15;
  ctx.beginPath();ctx.arc(370,GROUND_Y-80,6,0,Math.PI*2);ctx.fill();
  ctx.beginPath();ctx.arc(590,GROUND_Y-80,6,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
}

function _drawBgStatic(ctx) {
  // Sky gradient
  const grad=ctx.createLinearGradient(0,0,0,GROUND_Y);
  grad.addColorStop(0,'#1a0a2e');grad.addColorStop(0.5,'#2d1b4e');grad.addColorStop(1,'#0f1923');
  ctx.fillStyle=grad;ctx.fillRect(0,0,W,GROUND_Y);
  // Moon
  ctx.fillStyle='#dde4f0';ctx.globalAlpha=0.3;ctx.beginPath();ctx.arc(760,80,40,0,Math.PI*2);ctx.fill();
  ctx.globalAlpha=0.15;ctx.beginPath();ctx.arc(760,80,55,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  // Star base positions (static dim)
  ctx.fillStyle='#fff';ctx.globalAlpha=0.3;
  [123,456,789,234,567,890,135,468,791,246,579,802,147,258,369,470,581,692,703,814].forEach((s,i)=>{
    ctx.fillRect((s*7+i*43)%W,(s*3+i*17)%(GROUND_Y-50),2,2);
  });ctx.globalAlpha=1;
  // Mountains
  ctx.fillStyle='#0d1520';ctx.beginPath();ctx.moveTo(0,GROUND_Y);
  for(let x=0;x<=W;x+=40)ctx.lineTo(x,GROUND_Y-80-Math.sin(x*0.008)*60-Math.sin(x*0.015)*30-Math.sin(x*0.003)*40);
  ctx.lineTo(W,GROUND_Y);ctx.fill();
  // Temple
  ctx.fillStyle='#141e2b';ctx.fillRect(320,GROUND_Y-120,320,120);
  ctx.beginPath();ctx.moveTo(300,GROUND_Y-120);ctx.lineTo(480,GROUND_Y-170);ctx.lineTo(660,GROUND_Y-120);ctx.fill();
  ctx.beginPath();ctx.moveTo(340,GROUND_Y-100);ctx.lineTo(480,GROUND_Y-140);ctx.lineTo(620,GROUND_Y-100);ctx.fill();
  for(let i=0;i<5;i++){ctx.fillStyle='#1a2838';ctx.fillRect(340+i*60,GROUND_Y-100,8,100);}
  // Ground
  const gg=ctx.createLinearGradient(0,GROUND_Y,0,H);
  gg.addColorStop(0,'#2a2018');gg.addColorStop(0.3,'#1e1610');gg.addColorStop(1,'#0a0806');
  ctx.fillStyle=gg;ctx.fillRect(0,GROUND_Y,W,H-GROUND_Y);
  ctx.strokeStyle='#3a3028';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,GROUND_Y);ctx.lineTo(W,GROUND_Y);ctx.stroke();
}

function drawHUD(ctx) {
  const p1=game.p1,p2=game.p2;
  const barW=350,barH=22,barY=30,p1X=50,p2X=W-50-barW;
  ctx.fillStyle='#1a1a1a';ctx.fillRect(p1X-2,barY-2,barW+4,barH+4);ctx.fillRect(p2X-2,barY-2,barW+4,barH+4);
  const p1P=p1.hp/p1.maxHp,p2P=p2.hp/p2.maxHp;
  const c1=p1P>0.5?'#22cc44':p1P>0.25?'#ccaa22':'#cc2222';
  const c2=p2P>0.5?'#22cc44':p2P>0.25?'#ccaa22':'#cc2222';
  ctx.fillStyle='#331111';ctx.fillRect(p1X,barY,barW,barH);ctx.fillStyle=c1;ctx.fillRect(p1X,barY,barW*p1P,barH);
  ctx.fillStyle='#331111';ctx.fillRect(p2X,barY,barW,barH);ctx.fillStyle=c2;ctx.fillRect(p2X+barW*(1-p2P),barY,barW*p2P,barH);
  ctx.fillStyle='rgba(255,255,255,0.15)';ctx.fillRect(p1X,barY,barW*p1P,barH/3);ctx.fillRect(p2X+barW*(1-p2P),barY,barW*p2P,barH/3);
  ctx.strokeStyle='#888';ctx.lineWidth=2;ctx.strokeRect(p1X,barY,barW,barH);ctx.strokeRect(p2X,barY,barW,barH);

  // Names with player labels
  ctx.font='bold 16px sans-serif';
  ctx.textAlign='left';
  ctx.fillStyle='#4488ff';ctx.fillText(game.p1Name||p1.data.name,p1X,barY-8);
  ctx.textAlign='right';
  ctx.fillStyle=game.mode==='pvp'?'#ff4444':'#ff6666';
  ctx.fillText(game.p2Name||(game.mode==='cpu'?'CPU':p2.data.name),p2X+barW,barY-8);

  // Super meter
  const sbW=150,sbH=8,sbY=barY+barH+8;
  ctx.fillStyle='#111';ctx.fillRect(p1X,sbY,sbW,sbH);ctx.fillStyle='#4488ff';ctx.fillRect(p1X,sbY,sbW*(p1.super/p1.maxSuper),sbH);
  ctx.strokeStyle='#446';ctx.lineWidth=1;ctx.strokeRect(p1X,sbY,sbW,sbH);
  ctx.fillStyle='#111';ctx.fillRect(p2X+barW-sbW,sbY,sbW,sbH);ctx.fillStyle='#4488ff';
  ctx.fillRect(p2X+barW-sbW*(p2.super/p2.maxSuper),sbY,sbW*(p2.super/p2.maxSuper),sbH);ctx.strokeRect(p2X+barW-sbW,sbY,sbW,sbH);

  // Timer
  ctx.textAlign='center';ctx.fillStyle='#222';ctx.fillRect(W/2-30,barY-8,60,38);
  ctx.strokeStyle='#666';ctx.lineWidth=2;ctx.strokeRect(W/2-30,barY-8,60,38);
  ctx.fillStyle=game.timer<=10?'#ff4444':'#fff';ctx.font='bold 28px sans-serif';
  ctx.fillText(Math.ceil(game.timer).toString(),W/2,barY+22);

  // Win markers
  for(let i=0;i<p1.wins;i++){ctx.fillStyle='#ffcc00';ctx.beginPath();ctx.arc(p1X+i*20+10,barY+barH+24,5,0,Math.PI*2);ctx.fill();}
  for(let i=0;i<p2.wins;i++){ctx.fillStyle='#ffcc00';ctx.beginPath();ctx.arc(p2X+barW-i*20-10,barY+barH+24,5,0,Math.PI*2);ctx.fill();}

  // Score display
  ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='11px sans-serif';ctx.textAlign='left';
  ctx.fillText(`通算: ${saveData.totalWins}勝 ${saveData.totalLosses}敗 KO:${saveData.totalKOs}`,p1X,barY+barH+42);

  // Move hints
  if(!isMobile){
    ctx.fillStyle='rgba(255,255,255,0.2)';ctx.font='10px monospace';ctx.textAlign='left';
    if(game.mode==='training'){
      ctx.fillText('Space:パンチ Shift:キック Z:必殺 X:投げ ←:ガード ↓+Shift:足払い しゃがみ↑+Space:アッパー 空中↓+Shift:急降下 →→:ダッシュ ←←:バクステ',60,GROUND_Y+15);
      // Training info panel
      ctx.fillStyle='rgba(0,0,0,0.5)';ctx.fillRect(W-200,GROUND_Y+5,190,H-GROUND_Y-10);
      ctx.fillStyle='#aab';ctx.font='11px sans-serif';ctx.textAlign='left';
      const p1=game.p1;
      const info=['[TRAINING MODE]',
        `State: ${p1.fstate}`,`Combo: ${p1.comboCount}`,
        `Super: ${Math.floor(p1.super)}%`,
        '','Esc: ポーズ/技表'];
      info.forEach((l,i)=>ctx.fillText(l,W-190,GROUND_Y+22+i*16));
    } else {
      ctx.fillText('Space:パンチ Shift:キック Z:必殺 X:投げ ←:ガード  Esc:ポーズ',60,GROUND_Y+15);
    }
  }
}

// === TEXT RENDERER (for story/dialogue) ===
function drawTextBox(ctx,text,speaker,progress) {
  ctx.fillStyle='rgba(0,0,0,0.8)';
  ctx.fillRect(40,H-160,W-80,120);
  ctx.strokeStyle='#ffcc44';ctx.lineWidth=2;
  ctx.strokeRect(40,H-160,W-80,120);
  if(speaker){
    ctx.fillStyle='#ffcc44';ctx.font='bold 16px sans-serif';ctx.textAlign='left';
    ctx.fillText(speaker,65,H-138);
  }
  const displayed=text.substring(0,Math.floor(progress));
  const lines=displayed.split('\n');
  ctx.fillStyle='#eee';ctx.font='15px sans-serif';ctx.textAlign='left';
  lines.forEach((line,i)=>ctx.fillText(line,65,H-110+i*22));
  // continue indicator
  if(progress>=text.length){
    const blink=Math.sin(game.frameCount*0.1)>0;
    if(blink){ctx.fillStyle='#ffcc44';ctx.font='12px sans-serif';ctx.textAlign='right';ctx.fillText('▼ Space',W-65,H-55);}
  }
}

// === SCREENS ===
function drawTitle(ctx) {
  ctx.fillStyle='#0a0a12';ctx.fillRect(0,0,W,H);
  ctx.save();ctx.globalAlpha=0.05;
  for(let i=0;i<12;i++){const a=game.frameCount*0.002+i*Math.PI/6;ctx.fillStyle='#4466ff';ctx.beginPath();ctx.moveTo(W/2,H/2-50);ctx.lineTo(W/2+Math.cos(a)*600,H/2-50+Math.sin(a)*600);ctx.lineTo(W/2+Math.cos(a+0.1)*600,H/2-50+Math.sin(a+0.1)*600);ctx.fill();}
  ctx.restore();
  ctx.textAlign='center';
  ctx.fillStyle='#000';ctx.font='bold 72px sans-serif';ctx.fillText('KAZE FIGHTERS',W/2+3,163);
  const tG=ctx.createLinearGradient(W/2-200,120,W/2+200,160);tG.addColorStop(0,'#ff6644');tG.addColorStop(0.5,'#ffcc44');tG.addColorStop(1,'#ff6644');
  ctx.fillStyle=tG;ctx.fillText('KAZE FIGHTERS',W/2,160);
  ctx.font='bold 20px sans-serif';ctx.fillStyle='#8899bb';ctx.fillText('風のファイターズ',W/2,195);

  const menuY=280;const pulse=Math.sin(game.frameCount*0.06)*0.3+0.7;
  ['STORY MODE','VS CPU','VS PLAYER','TRAINING'].forEach((item,i)=>{
    const sel=i===game.menuIndex;
    ctx.font=sel?'bold 26px sans-serif':'22px sans-serif';
    ctx.fillStyle=sel?`rgba(255,204,68,${pulse+0.3})`:'#556677';
    ctx.fillText(sel?'▶  '+item+'  ◀':item,W/2,menuY+i*42);
  });

  // records
  if(saveData.totalWins+saveData.totalLosses>0){
    ctx.font='14px sans-serif';ctx.fillStyle='#445566';
    ctx.fillText(`${saveData.playerName||'Player'} - ${saveData.totalWins}勝${saveData.totalLosses}敗`,W/2,H-70);
  }

  ctx.font='14px sans-serif';ctx.fillStyle='#334455';
  ctx.fillText(isMobile?'タップで選択':'↑/↓: 選択  Space: 決定',W/2,H-35);
}

function drawCharSelect(ctx) {
  ctx.fillStyle='#0a0a18';ctx.fillRect(0,0,W,H);
  ctx.textAlign='center';ctx.fillStyle='#ffcc44';ctx.font='bold 32px sans-serif';
  ctx.fillText('CHARACTER SELECT',W/2,50);
  const chars=Object.keys(CHARACTERS),cardW=200,cardH=280;
  const startX=W/2-(chars.length*(cardW+30))/2+15;
  chars.forEach((charId,i)=>{
    const ch=CHARACTERS[charId],cx=startX+i*(cardW+30)+cardW/2,cy=200;
    const s1=i===game.selectIndex1,s2=i===game.selectIndex2;
    ctx.fillStyle=s1||s2?'#1a2240':'#111122';ctx.fillRect(cx-cardW/2,cy-cardH/2,cardW,cardH);
    if(s1){ctx.strokeStyle='#4488ff';ctx.lineWidth=3;ctx.strokeRect(cx-cardW/2,cy-cardH/2,cardW,cardH);ctx.fillStyle='#4488ff';ctx.font='bold 14px sans-serif';ctx.fillText('▼ YOU',cx,cy-cardH/2+18);}
    if(s2){ctx.strokeStyle='#ff4444';ctx.lineWidth=3;ctx.strokeRect(cx-cardW/2+4,cy-cardH/2+4,cardW-8,cardH-8);ctx.fillStyle='#ff4444';ctx.font='bold 14px sans-serif';ctx.fillText(game.mode==='pvp'?'P2':'CPU',cx,cy-cardH/2+36);}
    ctx.save();ctx.translate(cx,cy+20);
    const pv=new Fighter(charId,1,0);pv.y=0;pv.animFrame=game.frameCount;
    const pc=ch.colors,bob=Math.sin(game.frameCount*0.08)*2;
    ctx.scale(1.5,1.5);
    pv._drawLimb(ctx,pc.pants,-8,0,-10,18,9);pv._drawLimb(ctx,pc.pants,-10,18,-8,34,8);
    pv._drawLimb(ctx,pc.pants,8,0,10,18,9);pv._drawLimb(ctx,pc.pants,10,18,8,34,8);
    pv._drawBody(ctx,pc,0,-38+bob,28,38);
    const ab=Math.sin(game.frameCount*0.08+1)*2;
    pv._drawLimb(ctx,pc.gi,-14,-32+bob,-18,-16+ab,7);pv._drawLimb(ctx,pc.skin,-18,-16+ab,-14,-4+ab,6);
    pv._drawLimb(ctx,pc.gi,14,-32+bob,20,-18+ab,7);pv._drawLimb(ctx,pc.skin,20,-18+ab,22,-6+ab,6);
    pv._drawHead(ctx,pc,0,-52+bob);ctx.restore();
    ctx.fillStyle='#fff';ctx.font='bold 22px sans-serif';ctx.fillText(ch.name,cx,cy+cardH/2-50);
    ctx.fillStyle='#aab';ctx.font='16px sans-serif';ctx.fillText(ch.nameJp,cx,cy+cardH/2-28);
    ctx.font='11px sans-serif';ctx.fillStyle='#667';ctx.fillText(ch.description,cx,cy+cardH/2-8);
  });
  // Backstory of selected character
  const selChar=chars[game.selectIndex1];
  const backstory=STORY.characters[selChar]?.backstory;
  if(backstory){
    ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(40,H-110,W-80,65);
    ctx.strokeStyle='#446';ctx.lineWidth=1;ctx.strokeRect(40,H-110,W-80,65);
    ctx.fillStyle='#ccddee';ctx.font='12px sans-serif';ctx.textAlign='left';
    const lines=backstory.split('\n');
    lines.forEach((l,i)=>ctx.fillText(l,55,H-92+i*18));
  }

  ctx.textAlign='center';ctx.fillStyle='#445566';ctx.font='14px sans-serif';
  ctx.fillText('←/→: キャラ選択  Space: 決定  Esc: 戻る',W/2,H-30);
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

  init() { this.state=STATE.TITLE;this.menuIndex=0;this.frameCount=0; },

  startCharSelect() { this.state=STATE.SELECT;this.selectIndex1=0;this.selectIndex2=1;AudioEngine.play('select'); },

  startMatch() {
    const chars=Object.keys(CHARACTERS);
    this.p1=new Fighter(chars[this.selectIndex1],1,250);
    this.p2=new Fighter(chars[this.selectIndex2],2,710);
    this.p1.displayName=this.p1Name||this.p1.data.name;
    this.p2.displayName=this.p2Name||(this.mode==='cpu'?'CPU':this.p2.data.name);
    this.projectiles=[];this.round=1;this.p1.wins=0;this.p2.wins=0;

    if(this.mode==='story'){
      this.state=STATE.STORY_INTRO;this.storyTextProgress=0;
      this.storyTextTarget=STORY.intro;
    } else {
      this.startRound();
    }
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
      case STATE.STORY_INTRO: this._updateStoryText();break;
      case STATE.DIALOGUE: this._updateDialogue();break;
      case STATE.INTRO: this._updateIntro();break;
      case STATE.FIGHTING: this._updateFighting();break;
      case STATE.ROUND_END: this._updateRoundEnd();break;
      case STATE.MATCH_END: this._updateMatchEnd();break;
      case STATE.STORY_END: this._updateStoryText();break;
    }

    for(let i=particles.length-1;i>=0;i--){if(!particles[i].update())particles.splice(i,1);}
    this.screenShake*=SHAKE_DECAY;if(this.screenShake<0.5)this.screenShake=0;
  },

  _updateTitle() {
    if(keys['ArrowUp']||keys['KeyW']){if(!this._navHeld){this.menuIndex=(this.menuIndex-1+4)%4;this._navHeld=true;AudioEngine.play('select');}}
    else if(keys['ArrowDown']||keys['KeyS']){if(!this._navHeld){this.menuIndex=(this.menuIndex+1)%4;this._navHeld=true;AudioEngine.play('select');}}
    else this._navHeld=false;
    if(keys['Space']||keys['Enter']){if(!this._confirmHeld){this._confirmHeld=true;
      this.mode=['story','cpu','pvp','training'][this.menuIndex];
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
    const p2i=(this.mode==='pvp')?getP2Input():(this.mode==='training')?dummyInput:getAIInput(this.p2,this.p1);
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

        if(this.mode==='story'&&this.p1.wins>=ROUNDS_TO_WIN){
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
    if(this.matchEndTimer<=0||((keys['Space']||keys['Enter'])&&!this._confirmHeld)){this._confirmHeld=true;this.state=STATE.TITLE;}
    if(!keys['Space']&&!keys['Enter'])this._confirmHeld=false;
  },

  render() {
    ctx.save();
    if(this.screenShake>0)ctx.translate((Math.random()-0.5)*this.screenShake*2,(Math.random()-0.5)*this.screenShake*2);

    switch(this.state) {
      case STATE.TITLE: drawTitle(ctx);break;
      case STATE.NAME_INPUT: drawTitle(ctx);break; // show title behind overlay
      case STATE.SELECT: drawCharSelect(ctx);break;
      case STATE.STORY_INTRO: {
        ctx.fillStyle='#0a0a18';ctx.fillRect(0,0,W,H);
        ctx.textAlign='center';ctx.fillStyle='#ffcc44';ctx.font='bold 28px sans-serif';
        ctx.fillText('風神武闘会',W/2,100);
        drawTextBox(ctx,this.storyTextTarget,'',this.storyTextProgress);
        break;
      }
      case STATE.DIALOGUE: {
        drawBackground(ctx);this.p1.draw(ctx);this.p2.draw(ctx);
        const dl=STORY.rivalDialogue[this.storyDialogueIndex];
        if(dl){
          const charData=CHARACTERS[dl.speaker];
          drawTextBox(ctx,dl.text,charData?charData.name:'',this.storyTextProgress);
        }
        break;
      }
      case STATE.INTRO: {
        drawBackground(ctx);this.p1.draw(ctx);this.p2.draw(ctx);drawHUD(ctx);
        const t=this.introTimer;ctx.textAlign='center';
        if(t>90){const s=Math.min(1,(150-t)/20);ctx.save();ctx.translate(W/2,H/2-30);ctx.scale(s,s);ctx.fillStyle='#ffcc44';ctx.font='bold 48px sans-serif';ctx.fillText(`ROUND ${this.round}`,0,0);ctx.restore();}
        else if(t>30){const s=1+(60-t)*0.01;ctx.save();ctx.translate(W/2,H/2-30);ctx.scale(s,s);ctx.fillStyle='#fff';ctx.font='bold 56px sans-serif';ctx.fillText('FIGHT!',0,0);ctx.restore();}
        break;
      }
      case STATE.FIGHTING:case STATE.ROUND_END:case STATE.MATCH_END:
        drawBackground(ctx);
        this.projectiles.forEach(p=>p.draw(ctx));
        if(this.p1.y<=this.p2.y){this.p1.draw(ctx);this.p2.draw(ctx);}else{this.p2.draw(ctx);this.p1.draw(ctx);}
        particles.forEach(p=>p.draw(ctx));drawHUD(ctx);

        if(this.state===STATE.ROUND_END&&this.roundEndTimer>100){
          ctx.textAlign='center';ctx.fillStyle='rgba(0,0,0,0.4)';ctx.fillRect(0,H/2-60,W,120);
          if(this.doubleKO){
            ctx.fillStyle='#ff4444';ctx.font='bold 48px sans-serif';
            ctx.fillText('DOUBLE K.O.!',W/2,H/2+5);
          } else {
            const winner=this.p1.fstate===FSTATE.VICTORY?this.p1:this.p2;
            ctx.fillStyle='#ffcc44';ctx.font='bold 42px sans-serif';
            ctx.fillText(`${winner.displayName||winner.data.name} WINS!`,W/2,H/2-5);
            const charId=winner.charId;
            const quotes=STORY.characters[charId]?.victoryQuotes;
            if(quotes){ctx.fillStyle='#aab';ctx.font='16px sans-serif';ctx.fillText(quotes[this.round%quotes.length],W/2,H/2+30);}
          }
        }

        // Damage numbers
        this.damageNumbers.forEach(d=>d.draw(ctx));

        // Pause overlay
        if(this.paused){
          ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(0,0,W,H);
          ctx.textAlign='center';ctx.fillStyle='#fff';ctx.font='bold 42px sans-serif';
          ctx.fillText('PAUSE',W/2,H/2-60);
          ctx.fillStyle='#aab';ctx.font='16px sans-serif';
          const moveLines=[
            'Space: パンチ (軽攻撃)',
            'Shift: キック (重攻撃)',
            'Z: 必殺技',
            'X: 投げ (近距離)',
            '↓+Shift: 足払い (ダウン)',
            'しゃがみ中 ↑+Space: アッパーカット (打ち上げ)',
            '空中 ↓+Shift: 急降下キック',
            '→→: ダッシュ  ←←: バックステップ',
            '←(相手と反対方向): ガード',
            '',
            'Esc / P: 再開'
          ];
          moveLines.forEach((l,i)=>ctx.fillText(l,W/2,H/2-20+i*24));
        }

        if(this.state===STATE.MATCH_END){
          ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,0,W,H);ctx.textAlign='center';
          const mw=this.p1.wins>=ROUNDS_TO_WIN?this.p1:this.p2;
          ctx.fillStyle='#ffcc44';ctx.font='bold 52px sans-serif';ctx.fillText(mw.displayName||mw.data.name,W/2,H/2-30);
          ctx.fillStyle='#fff';ctx.font='bold 28px sans-serif';ctx.fillText('WINS THE MATCH!',W/2,H/2+15);
          const pulse=Math.sin(this.frameCount*0.08)*0.3+0.7;
          ctx.fillStyle=`rgba(150,170,200,${pulse})`;ctx.font='18px sans-serif';
          ctx.fillText('PRESS SPACE TO CONTINUE',W/2,H/2+70);
        }
        break;
      case STATE.STORY_END: {
        ctx.fillStyle='#0a0a18';ctx.fillRect(0,0,W,H);
        ctx.textAlign='center';ctx.fillStyle='#ffcc44';ctx.font='bold 28px sans-serif';
        ctx.fillText('ENDING',W/2,80);
        const charId=Object.keys(CHARACTERS)[this.selectIndex1];
        ctx.fillStyle='#8899bb';ctx.font='18px sans-serif';
        ctx.fillText(CHARACTERS[charId].nameJp,W/2,115);
        drawTextBox(ctx,this.storyTextTarget,'',this.storyTextProgress);
        break;
      }
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
    for(let i=0;i<4;i++){
      if(y>menuY+i*42-20&&y<menuY+i*42+15){game.menuIndex=i;AudioEngine.play('select');
        game.mode=['story','cpu','pvp','training'][i];game.state=STATE.NAME_INPUT;
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
function gameLoop(){game.update();game.render();requestAnimationFrame(gameLoop);}
requestAnimationFrame(gameLoop);
canvas.tabIndex=1;canvas.focus();
