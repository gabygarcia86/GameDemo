const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const shell = document.querySelector("#game-shell");
const overlay = document.querySelector("#overlay");
const hud = document.querySelector("#hud");
const playBtn = document.querySelector("#play-btn");
const pauseBtn = document.querySelector("#pause-btn");
const ollieBtn = document.querySelector("#ollie");
const timeEl = document.querySelector("#time");
const scoreEl = document.querySelector("#score");
const comboEl = document.querySelector("#combo");
const bestEl = document.querySelector("#best-score");
const trickCallout = document.querySelector("#trick-callout");
const comboCallout = document.querySelector("#combo-callout");
const toast = document.querySelector("#toast");

const CONFIG = {
  duration: 60,
  baseSpeed: 300,
  gravity: 1550,
  jumpVelocity: -620,
  segmentMin: 520,
  segmentMax: 820,
  score: { ollie: 50, flip: 100, grab: 100, combo: 250, landing: 100, grindPerSecond: 50, grindExit: 150, nearMiss: 100 }
};

const rand = (a,b) => a + Math.random() * (b-a);
const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
const format = n => Math.floor(n).toLocaleString("en-US");
let W=960,H=540,DPR=1,lastTime=0,accumulator=0;
let game = null;
let state = "title";
let pausedFrom = "playing";
let toastTimer = 0;

function resize() {
  const rect = shell.getBoundingClientRect();
  W = Math.max(320, rect.width); H = Math.max(300, rect.height);
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(W*DPR); canvas.height = Math.floor(H*DPR);
  ctx.setTransform(DPR,0,0,DPR,0,0);
}
window.addEventListener("resize", resize);
resize();

function bestScore() {
  try { return Number(localStorage.getItem("skateboardNinjasBest") || 0); } catch { return 0; }
}
function setBest(n) {
  try { localStorage.setItem("skateboardNinjasBest", String(n)); } catch {}
}
bestEl.textContent = format(bestScore());

const flipNames = {up:"KICKFLIP",down:"HEELFLIP",left:"POP SHOVE-IT",right:"360 SHOVE-IT"};
const grabNames = {up:"INDY GRAB",down:"TAIL GRAB",left:"MELON GRAB",right:"NOSE GRAB"};

class Player {
  constructor() {
    this.x = W*0.24; this.y = 0; this.vy=0; this.grounded=true;
    this.state="grounded"; this.grind=null; this.airTime=0; this.rotation=0;
    this.flip=null; this.grab=null; this.trickFlash=0; this.wipeout=0; this.invuln=0;
    this.lastLand=0; this.animation=0;
  }
  jump() {
    if (state!=="playing" || this.wipeout>0) return;
    if (this.state==="grinding") {
      this.state="airborne"; this.grind=null; this.vy=CONFIG.jumpVelocity*0.78; this.grounded=false; this.airTime=0;
      showToast("GRIND POP!");
      return;
    }
    if (!this.grounded) return;
    this.vy=CONFIG.jumpVelocity; this.grounded=false; this.state="airborne"; this.airTime=0; this.flip=null; this.grab=null;
    game.comboActions++;
    game.comboRaw += CONFIG.score.ollie;
    showTrick("OLLIE", CONFIG.score.ollie);
  }
  doTrick(kind,dir) {
    if (state!=="playing" || this.state!=="airborne" || this.airTime<0.07 || this.wipeout>0) return;
    const names = kind==="flip" ? flipNames : grabNames;
    const name = names[dir];
    if (!name) return;
    if (kind==="flip") {
      if (this.flip === dir) return;
      this.flip=dir; this.rotation += dir==="left" ? -Math.PI*2 : dir==="right" ? Math.PI*2 : Math.PI;
    } else {
      if (this.grab === dir) return;
      this.grab=dir;
    }
    const points = kind==="flip" ? CONFIG.score.flip : CONFIG.score.grab;
    game.comboActions++;
    game.comboRaw += points;
    if (this.flip && this.grab) {
      game.comboRaw += CONFIG.score.combo;
      game.comboActions++;
      showTrick(`${flipNames[this.flip]} + ${grabNames[this.grab]}`, points+CONFIG.score.combo);
      comboCallout.textContent = "COMBO LINKED!";
      comboCallout.style.opacity = 1;
    } else showTrick(name, points);
  }
  crash() {
    if (this.invuln>0 || this.wipeout>0) return;
    this.state="wipeout"; this.wipeout=1.0; this.grounded=false; this.vy=-190;
    game.comboRaw=0; game.comboActions=0; game.multiplier=1;
    showToast("WIPEOUT! COMBO LOST");
  }
  update(dt) {
    this.animation += dt;
    this.invuln=Math.max(0,this.invuln-dt);
    this.trickFlash=Math.max(0,this.trickFlash-dt);
    if (this.wipeout>0) {
      this.wipeout-=dt; this.vy+=CONFIG.gravity*dt; this.y+=this.vy*dt;
      if (this.y>0) { this.y=0; this.vy=0; }
      if (this.wipeout<=0) { this.state="grounded"; this.grounded=true; this.y=0; this.invuln=1.0; }
      return;
    }
    if (this.state==="grinding") {
      this.y=-(this.grind?.height || 26);
      game.comboRaw += CONFIG.score.grindPerSecond*dt;
      this.rotation = Math.sin(this.animation*18)*0.03;
      if (this.grind && this.grind.x2 < game.cameraX + this.x + 5) {
        this.state="airborne"; this.grounded=false; this.grind=null; this.vy=-100;
        game.comboRaw+=CONFIG.score.grindExit; game.comboActions++;
        showTrick("CLEAN GRIND EXIT",CONFIG.score.grindExit);
      }
      return;
    }
    if (!this.grounded) {
      this.state="airborne"; this.airTime+=dt;
      this.vy+=CONFIG.gravity*dt; this.y+=this.vy*dt;
      if (this.y>=0 && this.vy>0) {
        this.y=0; this.vy=0; this.grounded=true; this.state="grounded"; this.airTime=0; this.rotation=0;
        if (this.flip || this.grab) {
          const landed = Math.random() > 0.07;
          if (landed) {
            const bank = Math.floor(game.comboRaw * game.multiplier) + CONFIG.score.landing;
            game.score += bank; game.comboRaw=0; game.comboActions=0;
            game.multiplier=1; this.lastLand=1;
            showTrick("CLEAN LANDING",bank);
          } else this.crash();
        } else {
          if (game.comboRaw>0) { game.score+=Math.floor(game.comboRaw*game.multiplier); game.comboRaw=0; game.comboActions=0; game.multiplier=1; }
        }
        this.flip=null; this.grab=null;
      }
    } else {
      this.y=0; this.state="grounded";
      this.rotation=Math.sin(this.animation*10)*0.015;
    }
  }
}

class LevelGenerator {
  constructor() { this.objects=[]; this.nextX=0; this.segmentId=0; this.difficulty=0; }
  reset() { this.objects=[]; this.nextX=0; this.segmentId=0; this.difficulty=0; this.generateUntil(W*2.5); }
  generateUntil(x) {
    while (this.nextX < x) {
      const len=rand(CONFIG.segmentMin,CONFIG.segmentMax);
      this.segmentId++;
      const types=["flat","ramp","rail","obstacles","karen","combo"];
      let weights=this.segmentId<3 ? ["flat","ramp","obstacles"] : types;
      const type=weights[Math.floor(Math.random()*weights.length)];
      const start=this.nextX+rand(70,130);
      if(type==="ramp") {
        this.objects.push({type:"ramp",x:start,w:rand(90,145),h:rand(45,85),used:false});
      } else if(type==="rail") {
        const h=rand(24,58),w=rand(170,250);
        this.objects.push({type:"rail",x:start,w,h,y:0,used:false});
      } else if(type==="obstacles") {
        const n=Math.random()<.35?2:1;
        for(let i=0;i<n;i++) this.objects.push({type:Math.random()<.5?"cone":"bin",x:start+i*rand(115,155),w:30,h:Math.random()<.5?38:52,used:false});
      } else if(type==="karen") {
        this.objects.push({type:"karen",x:start,w:42,h:82,phase:Math.random()*8,used:false});
      } else if(type==="combo") {
        this.objects.push({type:"ramp",x:start,w:105,h:65,used:false});
        this.objects.push({type:"rail",x:start+180,w:205,h:35,y:0,used:false});
        this.objects.push({type:"cone",x:start+430,w:30,h:38,used:false});
      }
      this.nextX += len;
      this.difficulty=Math.min(1,this.difficulty+0.015);
    }
  }
}

function newGame() {
  game = {
    elapsed:0, score:0, cameraX:0, speed:CONFIG.baseSpeed, player:new Player(),
    level:new LevelGenerator(), comboRaw:0, comboActions:0, multiplier:1,
    particles:[], backgroundOffset:0, nearMisses:0, tricks:0, grindTime:0,
    lastScoreTick:0, seed:Math.floor(Math.random()*999999), endReason:"time"
  };
  game.player.x=W*0.24;
  game.level.reset();
  state="playing";
  overlay.classList.add("hidden"); hud.classList.remove("hidden");
  trickCallout.classList.remove("show"); comboCallout.style.opacity=0;
  lastTime=performance.now(); accumulator=0;
}

function endGame() {
  if (state!=="playing") return;
  state="results";
  const p=game.player;
  if (game.comboRaw>0 && p.grounded) game.score+=Math.floor(game.comboRaw*game.multiplier);
  const old=bestScore(); if(game.score>old) setBest(game.score);
  hud.classList.add("hidden");
  overlay.classList.remove("hidden");
  overlay.querySelector(".eyebrow").textContent="RUN COMPLETE";
  overlay.querySelector("h1").innerHTML=`FINAL<br><span>SCORE</span>`;
  overlay.querySelector(".subtitle").textContent=`${format(game.score)} points · ${game.tricks} tricks · ${game.nearMisses} near misses`;
  overlay.querySelector(".howto").innerHTML=`
    <div><b>BEST COMBO</b><span>${game.bestCombo || 1}x multiplier</span></div>
    <div><b>GRIND TIME</b><span>${game.grindTime.toFixed(1)} seconds</span></div>
    <div><b>PERSONAL BEST</b><span>${format(Math.max(old,game.score))}</span></div>
    <div><b>SEED</b><span>${game.seed}</span></div>`;
  playBtn.innerHTML='SKATE AGAIN <span>↻</span>';
  bestEl.textContent=format(Math.max(old,game.score));
}

function pauseGame() {
  if (state==="playing") {
    pausedFrom=state; state="paused";
    overlay.classList.remove("hidden");
    overlay.querySelector(".eyebrow").textContent="TAKE FIVE";
    overlay.querySelector("h1").innerHTML=`NINJA<br><span>PAUSED</span>`;
    overlay.querySelector(".subtitle").textContent="Catch your breath. The street can wait.";
    overlay.querySelector(".howto").innerHTML='<div><b>RESUME</b><span>Jump back into the run</span></div><div><b>TIP</b><span>Land clean to bank your combo</span></div>';
    playBtn.innerHTML='RESUME RUN <span>▶</span>';
  } else if (state==="paused") {
    state="playing"; overlay.classList.add("hidden"); lastTime=performance.now();
  }
}

playBtn.addEventListener("click",()=>{
  if(state==="paused") { pauseGame(); return; }
  overlay.querySelector(".eyebrow").textContent="ARCADE SKATE ATTACK";
  overlay.querySelector("h1").innerHTML='SKATEBOARD<br><span>NINJAS</span>';
  overlay.querySelector(".subtitle").textContent="Shred the streets. Chain tricks. Dodge the Karens.";
  overlay.querySelector(".howto").innerHTML='<div><b>↑ / SPACE</b><span>Ollie</span></div><div><b>FLIP STICK</b><span>Kickflip · Heelflip · Shove-it</span></div><div><b>GRAB STICK</b><span>Indy · Tail · Melon · Nose grab</span></div><div><b>RAILS</b><span>Land on a rail to grind automatically</span></div>';
  newGame();
});
pauseBtn.addEventListener("click",pauseGame);
ollieBtn.addEventListener("pointerdown",e=>{e.preventDefault(); game?.player.jump();});

function showTrick(text,points) {
  if(!game) return;
  trickCallout.textContent=`${text}  +${format(points)}`;
  trickCallout.classList.add("show");
  trickCallout.style.opacity=1;
  trickCallout.dataset.until=String(performance.now()+850);
  game.tricks++;
}
function showToast(text) {
  toast.textContent=text; toast.style.opacity=1; toastTimer=1.2;
}

function setupStick(el) {
  const knob=el.querySelector(".knob");
  let activePointer=null, startX=0,startY=0, fired=null;
  const radius=el.clientWidth*0.31;
  function move(e) {
    const r=el.getBoundingClientRect();
    let dx=e.clientX-(r.left+r.width/2), dy=e.clientY-(r.top+r.height/2);
    const max=r.width*0.31, d=Math.hypot(dx,dy);
    if(d>max){dx=dx/d*max;dy=dy/d*max;}
    knob.style.left=`calc(50% + ${dx}px)`; knob.style.top=`calc(50% + ${dy}px)`;
    const threshold=r.width*0.20;
    if(Math.hypot(dx,dy)<threshold) return;
    const dir=Math.abs(dx)>Math.abs(dy) ? (dx>0?"right":"left") : (dy>0?"down":"up");
    if(dir!==fired) {
      fired=dir;
      if(game && state==="playing") game.player.doTrick(el.dataset.kind,dir);
    }
  }
  function reset(e) {
    if(activePointer!==e.pointerId) return;
    activePointer=null; fired=null;
    knob.style.left="50%"; knob.style.top="50%";
    try { el.releasePointerCapture(e.pointerId); } catch {}
  }
  el.addEventListener("pointerdown",e=>{
    e.preventDefault(); if(activePointer!==null) return;
    activePointer=e.pointerId; fired=null;
    el.setPointerCapture(e.pointerId); move(e);
  });
  el.addEventListener("pointermove",e=>{if(activePointer===e.pointerId)move(e);});
  el.addEventListener("pointerup",reset);
  el.addEventListener("pointercancel",reset);
}
document.querySelectorAll(".stick").forEach(setupStick);

window.addEventListener("keydown",e=>{
  if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight","KeyW","KeyA","KeyS","KeyD"].includes(e.code)) e.preventDefault();
  if(e.repeat) return;
  if(e.code==="Escape"||e.code==="KeyP") { if(state==="playing"||state==="paused")pauseGame(); return; }
  if(state!=="playing"||!game)return;
  if(e.code==="Space"||e.code==="ArrowUp") { game.player.jump(); return; }
  const flip={ArrowLeft:"left",ArrowRight:"right",KeyW:"up",KeyS:"down"};
  const grab={KeyA:"left",KeyD:"right",KeyW:"up",KeyS:"down"};
  if(flip[e.code])game.player.doTrick("flip",flip[e.code]);
  if(grab[e.code] && (e.code==="KeyA"||e.code==="KeyD"))game.player.doTrick("grab",grab[e.code]);
});

document.addEventListener("visibilitychange",()=>{ if(document.hidden && state==="playing") pauseGame(); });

function update(dt) {
  if(state!=="playing"||!game)return;
  game.elapsed+=dt;
  game.speed=CONFIG.baseSpeed*(1+Math.min(.2,game.elapsed/60*.2));
  game.cameraX+=game.speed*dt;
  game.backgroundOffset+=game.speed*dt*.25;
  game.level.generateUntil(game.cameraX+W*2);
  game.player.update(dt);
  if(game.player.state==="grinding")game.grindTime+=dt;

  const p=game.player, worldPlayer=game.cameraX+p.x;
  for(const o of game.level.objects) {
    const sx=o.x-game.cameraX;
    if(sx < -150 || sx>W+160) continue;
    if(o.type==="rail" && p.state==="airborne" && p.vy>0 && !o.used) {
      const playerBottom=H*0.76-p.y+22;
      const railY=H*0.76-o.h;
      if(sx < p.x+34 && sx+o.w>p.x+5 && Math.abs(playerBottom-railY)<34 && p.airTime>.12) {
        p.state="grinding";p.grounded=false;p.grind={x2:o.x+o.w,height:o.h};o.used=true;
        p.y=-o.h; p.vy=0; showTrick("RAIL GRIND",100);
      }
    }
    if(["cone","bin","karen"].includes(o.type) && !o.used && p.invuln<=0) {
      const playerGround=H*.76-p.y;
      const objTop=H*.76-o.h;
      const overlapX=sx < p.x+31 && sx+o.w>p.x-22;
      const overlapY=playerGround+20>objTop && p.y<o.h+10;
      if(overlapX && overlapY && p.state!=="airborne" && p.state!=="grinding") {
        o.used=true; p.crash();
      } else if(!o.used && sx<p.x+12 && sx>p.x-12) {
        if(p.state==="airborne" || p.state==="grinding") {
          game.score+=CONFIG.score.nearMiss;game.nearMisses++;o.used=true;showToast("NEAR MISS +100");
        }
      }
    }
  }
  game.level.objects=game.level.objects.filter(o=>o.x+o.w>game.cameraX-300);
  game.multiplier=clamp(1+Math.floor(game.comboActions/3)*.5,1,4);
  game.bestCombo=Math.max(game.bestCombo||1,game.multiplier);
  if(game.elapsed>=CONFIG.duration) { endGame(); return; }
  if(toastTimer>0){toastTimer-=dt;if(toastTimer<=0)toast.style.opacity=0;}
  if(performance.now()>Number(trickCallout.dataset.until||0))trickCallout.classList.remove("show");
  timeEl.textContent=Math.max(0,game.elapsed<60?(60-game.elapsed).toFixed(1):"0.0");
  scoreEl.textContent=format(game.score+Math.floor(game.comboRaw*game.multiplier));
  comboEl.textContent=`x${game.multiplier.toFixed(1)}`;
  comboCallout.style.opacity=game.comboActions>1?Math.min(.85,.25+game.comboActions*.05):0;
  comboCallout.textContent=game.comboActions>1?`${game.comboActions} ACTION COMBO`:"";
}

function drawBackground() {
  const sky=ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,"#17233b");sky.addColorStop(.58,"#536a7a");sky.addColorStop(1,"#d39a75");
  ctx.fillStyle=sky;ctx.fillRect(0,0,W,H);
  // distant moon / sun
  ctx.fillStyle="#ffe0a0";ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(W*.78,H*.2,Math.min(W,H)*.055,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
  // distant skyline parallax
  const bw=60;
  for(let layer=0;layer<2;layer++){
    const speed=layer===0?.12:.23, base=H*.66+layer*15, color=layer===0?"#26364a":"#1b2b3d";
    ctx.fillStyle=color;
    const offset=(game?game.backgroundOffset*speed:0)%bw;
    for(let x=-bw-offset;x<W+bw;x+=bw){
      const hh=70+((Math.floor((x+offset+bw*20)/bw)*37)%110);
      ctx.fillRect(x,base-hh,bw-5,hh);
      ctx.fillStyle=layer===0?"#d7c58a55":"#e7b85b55";
      for(let wy=base-hh+14;wy<base-12;wy+=17)for(let wx=x+9;wx<x+bw-12;wx+=16)ctx.fillRect(wx,wy,5,7);
      ctx.fillStyle=color;
    }
  }
  // street
  const ground=H*.76;
  ctx.fillStyle="#252e3a";ctx.fillRect(0,ground,W,H-ground);
  ctx.fillStyle="#c3ccd0";ctx.fillRect(0,ground,W,7);
  ctx.fillStyle="#626f78";ctx.fillRect(0,ground+7,W,5);
  ctx.fillStyle="#e5b84d";
  const dashOff=game?game.cameraX%100:0;
  for(let x=-100-dashOff;x<W+100;x+=100)ctx.fillRect(x,ground+H*.16,48,5);
  // curb blocks
  for(let x=-(game?game.cameraX%55:0);x<W;x+=55){ctx.fillStyle="#f0c3a3";ctx.fillRect(x,ground+2,26,4);}
}

function drawNinja(p) {
  const x=p.x, ground=H*.76, y=ground+p.y;
  ctx.save();ctx.translate(x,y);
  if(p.state==="wipeout")ctx.rotate(-.9);
  else if(p.state==="airborne")ctx.rotate(Math.sin(p.animation*15)*.06+(p.flip?Math.sin(p.animation*20)*.25:0));
  else if(p.state==="grinding")ctx.rotate(Math.sin(p.animation*18)*.04);
  if(p.invuln>0 && Math.floor(performance.now()/100)%2===0)ctx.globalAlpha=.55;
  // shadow
  ctx.save();ctx.globalAlpha=.23;ctx.fillStyle="#000";ctx.beginPath();ctx.ellipse(0,4,35,7,0,0,Math.PI*2);ctx.fill();ctx.restore();
  // skateboard
  ctx.save();ctx.rotate(p.state==="airborne"?(p.flip==="left"?-.35:p.flip==="right"?.35:Math.sin(p.animation*18)*.2):p.state==="grinding"?-.02:0);
  ctx.fillStyle="#101522";roundRect(ctx,-32,-3,64,7,4);ctx.fill();
  ctx.fillStyle="#c7f36b";roundRect(ctx,-23,-4,46,3,2);ctx.fill();
  ctx.fillStyle="#111827";ctx.beginPath();ctx.arc(-21,5,4,0,Math.PI*2);ctx.arc(21,5,4,0,Math.PI*2);ctx.fill();
  ctx.restore();
  // legs
  ctx.strokeStyle="#101827";ctx.lineWidth=9;ctx.lineCap="round";
  if(p.state==="airborne"){ctx.beginPath();ctx.moveTo(-5,-28);ctx.lineTo(-17,-12);ctx.moveTo(6,-27);ctx.lineTo(18,-15);ctx.stroke();}
  else {ctx.beginPath();ctx.moveTo(-5,-28);ctx.lineTo(-14,-6);ctx.moveTo(6,-28);ctx.lineTo(13,-6);ctx.stroke();}
  // body / ninja suit
  ctx.fillStyle="#111827";roundRect(ctx,-16,-66,32,42,9);ctx.fill();
  ctx.fillStyle="#29384c";roundRect(ctx,-13,-62,26,34,6);ctx.fill();
  // belt
  ctx.fillStyle="#c7f36b";ctx.fillRect(-15,-34,30,5);
  // arms
  ctx.strokeStyle="#111827";ctx.lineWidth=8;
  ctx.beginPath();
  if(p.grab){ctx.moveTo(-12,-57);ctx.lineTo(-19,-43);ctx.lineTo(-7,-28);}
  else {ctx.moveTo(-12,-57);ctx.lineTo(-25,-45);}
  ctx.moveTo(12,-57);ctx.lineTo(25,-45);ctx.stroke();
  // head
  ctx.fillStyle="#111827";ctx.beginPath();ctx.arc(0,-77,17,0,Math.PI*2);ctx.fill();
  // face opening
  ctx.fillStyle="#d9e4e8";roundRect(ctx,-12,-81,24,10,4);ctx.fill();
  // eyes
  ctx.fillStyle="#e53f62";ctx.beginPath();ctx.ellipse(-5,-76,3.5,2.5,-.1,0,Math.PI*2);ctx.ellipse(5,-76,3.5,2.5,.1,0,Math.PI*2);ctx.fill();
  // headband tails
  ctx.fillStyle="#ff5578";ctx.beginPath();ctx.moveTo(8,-89);ctx.lineTo(29,-83);ctx.lineTo(14,-78);ctx.closePath();ctx.fill();
  ctx.beginPath();ctx.moveTo(12,-86);ctx.lineTo(30,-95);ctx.lineTo(24,-80);ctx.closePath();ctx.fill();
  // airborne trick sparkle
  if(p.state==="airborne"&&(p.flip||p.grab)){
    ctx.strokeStyle=p.grab?"#50e3c2":"#ffb547";ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,-35,40,-.9,.9);ctx.stroke();
    ctx.fillStyle="#fff";ctx.font="bold 10px system-ui";ctx.textAlign="center";ctx.fillText(p.flip?"FLIP!":"GRAB!",0,-116);
  }
  ctx.restore();
}

function roundRect(c,x,y,w,h,r) {
  c.beginPath();c.moveTo(x+r,y);c.arcTo(x+w,y,x+w,y+h,r);c.arcTo(x+w,y+h,x,y+h,r);c.arcTo(x,y+h,x,y,r);c.arcTo(x,y,x+w,y,r);c.closePath();
}
function drawObject(o) {
  const sx=o.x-game.cameraX, ground=H*.76;
  if(sx<-180||sx>W+180)return;
  if(o.type==="ramp"){
    ctx.fillStyle="#ec9b52";ctx.beginPath();ctx.moveTo(sx,ground);ctx.lineTo(sx+o.w,ground);ctx.lineTo(sx+o.w,ground-o.h);ctx.closePath();ctx.fill();
    ctx.strokeStyle="#ffe2a8";ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(sx,ground);ctx.lineTo(sx+o.w,ground-o.h);ctx.stroke();
    ctx.fillStyle="#273345";ctx.fillRect(sx,ground-2,o.w,5);
  } else if(o.type==="rail"){
    const ry=ground-o.h;
    ctx.strokeStyle="#a9c6d8";ctx.lineWidth=7;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(sx,ry);ctx.lineTo(sx+o.w,ry);ctx.stroke();
    ctx.strokeStyle="#526b7c";ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(sx+12,ry+3);ctx.lineTo(sx+12,ground);ctx.moveTo(sx+o.w-12,ry+3);ctx.lineTo(sx+o.w-12,ground);ctx.stroke();
    ctx.fillStyle="#d5e5eb";ctx.fillRect(sx,ry-3,o.w,3);
  } else if(o.type==="cone"){
    ctx.fillStyle="#ff8a45";ctx.beginPath();ctx.moveTo(sx+o.w/2,ground-o.h);ctx.lineTo(sx+o.w,ground);ctx.lineTo(sx,ground);ctx.closePath();ctx.fill();
    ctx.fillStyle="#fff1d2";ctx.fillRect(sx+6,ground-o.h*.42,o.w-12,5);ctx.fillStyle="#ffb06c";ctx.fillRect(sx-3,ground-5,o.w+6,5);
  } else if(o.type==="bin"){
    ctx.fillStyle="#2e9b88";roundRect(ctx,sx,ground-o.h,o.w,o.h,5);ctx.fill();
    ctx.fillStyle="#174d4b";ctx.fillRect(sx-3,ground-o.h,o.w+6,8);
    ctx.fillStyle="#7fe2bd";ctx.fillRect(sx+6,ground-o.h+15,4,20);ctx.fillRect(sx+17,ground-o.h+15,4,20);
  } else if(o.type==="karen"){
    const bob=Math.sin((game?.elapsed||0)*4+o.phase)*2;
    const y=ground+bob;
    // legs, body, hair, face, angry brows
    ctx.strokeStyle="#29213b";ctx.lineWidth=8;ctx.lineCap="round";ctx.beginPath();ctx.moveTo(sx+13,y-24);ctx.lineTo(sx+10,y-4);ctx.moveTo(sx+29,y-24);ctx.lineTo(sx+33,y-4);ctx.stroke();
    ctx.fillStyle="#8b5cc7";roundRect(ctx,sx+5,y-57,34,36,7);ctx.fill();
    ctx.strokeStyle="#8b5cc7";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(sx+7,y-50);ctx.lineTo(sx-4,y-36);ctx.moveTo(sx+37,y-50);ctx.lineTo(sx+47,y-39);ctx.stroke();
    ctx.fillStyle="#f1c5a4";ctx.beginPath();ctx.arc(sx+22,y-69,15,0,Math.PI*2);ctx.fill();
    ctx.fillStyle="#7a4935";ctx.beginPath();ctx.arc(sx+22,y-74,16,Math.PI,Math.PI*2);ctx.lineTo(sx+36,y-60);ctx.lineTo(sx+8,y-60);ctx.closePath();ctx.fill();
    ctx.strokeStyle="#542c2b";ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(sx+12,y-74);ctx.lineTo(sx+19,y-71);ctx.moveTo(sx+25,y-71);ctx.lineTo(sx+32,y-74);ctx.stroke();
    ctx.fillStyle="#34243b";ctx.beginPath();ctx.arc(sx+17,y-68,2,0,Math.PI*2);ctx.arc(sx+28,y-68,2,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle="#a53d4c";ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx+17,y-60);ctx.lineTo(sx+28,y-60);ctx.stroke();
    ctx.fillStyle="#ff5578";ctx.font="1000 11px system-ui";ctx.textAlign="center";ctx.fillText("HEY!",sx+22,y-91);
  }
}

function drawParticles(dt) {
  if(!game)return;
  for(let i=game.particles.length-1;i>=0;i--){
    const p=game.particles[i];p.life-=dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=400*dt;
    if(p.life<=0){game.particles.splice(i,1);continue;}
    ctx.globalAlpha=clamp(p.life,0,1);ctx.fillStyle=p.color;ctx.fillRect(p.x,p.y,4,4);ctx.globalAlpha=1;
  }
}

function render(dt=0) {
  ctx.clearRect(0,0,W,H);
  drawBackground();
  if(game){
    const ground=H*.76;
    // simple sidewalk cracks
    ctx.strokeStyle="#ffffff12";ctx.lineWidth=2;
    const off=game.cameraX%180;
    for(let x=-off;x<W;x+=180){ctx.beginPath();ctx.moveTo(x,ground+14);ctx.lineTo(x+28,ground+37);ctx.lineTo(x+18,ground+60);ctx.stroke();}
    for(const o of game.level.objects)drawObject(o);
    drawNinja(game.player);
    drawParticles(dt);
  } else {
    // title-screen ninja silhouette and rail
    ctx.strokeStyle="#a9c6d8";ctx.lineWidth=7;ctx.beginPath();ctx.moveTo(W*.52,H*.72);ctx.lineTo(W*.9,H*.72);ctx.stroke();
    drawNinja({x:W*.42,y:-15,animation:0,state:"airborne",flip:"left",grab:"up",rotation:0,invuln:0,airTime:.4,grind:null});
  }
  // vignette
  const g=ctx.createRadialGradient(W/2,H/2,Math.min(W,H)*.25,W/2,H/2,Math.max(W,H)*.72);
  g.addColorStop(0,"#00000000");g.addColorStop(1,"#02071266");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
}

function frame(now) {
  const raw=Math.min(.05,(now-lastTime)/1000||0);lastTime=now;
  if(state==="playing"){
    accumulator+=raw;
    const step=1/60;
    while(accumulator>=step){update(step);accumulator-=step;}
  }
  render(raw);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Avoid browser gestures over the play surface; allow buttons to receive pointer input.
shell.addEventListener("contextmenu",e=>e.preventDefault());
