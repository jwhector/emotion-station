import React, { useEffect, useRef, useState, useCallback } from "react";
import * as Tone from "tone";

/* ============================================================ *
 *  EMBODIED
 *  1 structure — how you move   (modeless presets + colored backbone)
 *  2 grid      — who you are    (6 dims × 5 nodes; lock collapses the grid)
 *  3 plane     — how you feel   (performable valence × arousal; owns tempo)
 *  Grammar: one visual channel per dimension, no redundancy with the plane.
 * ============================================================ */

const ROOT_MIDI = 48;
const midiToNote = (m) => Tone.Frequency(m, "midi").toNote();

const PRESETS = [
  { id:"pulse",   name:"Pulse",          blurb:"steady · breathing",   spin:0.10, wob:0.04,
    steps:[0,null,null,null,0,null,null,null,0,null,null,null,0,null,null,null] },
  { id:"roll",    name:"Sixteenth Roll", blurb:"urgent · mechanical",  spin:0.55, wob:0.02,
    steps:[0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0] },
  { id:"arc",     name:"Arc",            blurb:"lyrical · gestural",   spin:0.18, wob:0.10,
    steps:[0,null,7,null,12,null,7,null,0,null,7,null,12,null,7,null] },
  { id:"scatter", name:"Scatter",        blurb:"playful · off-kilter", spin:0.30, wob:0.07,
    steps:[0,null,null,7,null,null,0,12,null,null,7,null,null,0,null,null] },
  { id:"drone",   name:"Drone & Accent", blurb:"minimal · suspended",  spin:0.06, wob:0.03,
    steps:[0,null,null,null,null,null,null,null,null,null,12,null,null,null,null,null] },
];

const WHITE=[255,226,180], VIOLET=[165,150,205], TEAL=[120,185,175];
// 6 rows, EVERY row exactly 5 nodes -> evenly spaced grid
const ROWS = [
  { key:"mode", label:"MODE", channel:"color", nodes:[
    { name:"Phrygian", tint:[205,110,110], third:3, seventh:10 },
    { name:"Aeolian",  tint:[110,140,205], third:3, seventh:10 },
    { name:"Dorian",   tint:[110,185,175], third:3, seventh:10 },
    { name:"Ionian",   tint:[220,180,120], third:4, seventh:11 },
    { name:"Lydian",   tint:[200,150,210], third:4, seventh:11 },
  ]},
  { key:"timbre", label:"TIMBRE", channel:"texture", nodes:[
    { name:"Sine",     osc:"sine",     texture:0.0 },
    { name:"Triangle", osc:"triangle", texture:0.3 },
    { name:"Square",   osc:"square",   texture:0.6 },
    { name:"Saw",      osc:"sawtooth", texture:0.9 },
    { name:"FM",       osc:"fmsine",   texture:0.7 },
  ]},
  { key:"register", label:"REGISTER", channel:"size", nodes:[
    { name:"−2 oct", semis:-24, size:1.70 },
    { name:"−1 oct", semis:-12, size:1.45 },
    { name:"unison", semis:0,   size:1.20 },
    { name:"+1 oct", semis:12,  size:0.98 },
    { name:"+2 oct", semis:24,  size:0.78 },
  ]},
  { key:"articulation", label:"ARTICULATION", channel:"sharpness", nodes:[
    { name:"Staccato", env:{attack:0.003,decay:0.10,sustain:0.0,release:0.12}, sharp:1.0 },
    { name:"Pluck",    env:{attack:0.005,decay:0.16,sustain:0.0,release:0.2 }, sharp:0.82 },
    { name:"Soft",     env:{attack:0.02, decay:0.25,sustain:0.2,release:0.6 }, sharp:0.6 },
    { name:"Legato",   env:{attack:0.10, decay:0.30,sustain:0.4,release:0.9 }, sharp:0.42 },
    { name:"Swell",    env:{attack:0.30, decay:0.30,sustain:0.5,release:1.3 }, sharp:0.26 },
  ]},
  { key:"space", label:"SPACE", channel:"halo", nodes:[
    { name:"Dry", wet:0.04 },{ name:"Room", wet:0.22 },{ name:"Plate", wet:0.40 },
    { name:"Hall", wet:0.62 },{ name:"Cavern", wet:0.86 },
  ]},
  { key:"companion", label:"COMPANION", channel:"satellites", nodes:[
    { name:"Alone",    bass:false, counter:false, choir:false, sat:0 },
    { name:"Bass",     bass:true,  counter:false, choir:false, sat:1 },
    { name:"Counter",  bass:false, counter:true,  choir:false, sat:1 },
    { name:"Choir",    bass:false, counter:false, choir:true,  sat:2 },
    { name:"Ensemble", bass:true,  counter:true,  choir:true,  sat:3 },
  ]},
];
const ROW_DEFAULT = { mode:null, timbre:0, register:2, articulation:2, space:1, companion:0 };

const ATTRACTORS = [
  { x:-1, y:-1, name:"melancholy", col:[80,100,150] },
  { x: 1, y:-1, name:"tense",      col:[160,80,80] },
  { x:-1, y: 1, name:"serene",     col:[90,150,140] },
  { x: 1, y: 1, name:"joyful",     col:[210,170,90] },
];

const EMOTIONS = [
  { id:"Joy",        col:[222,182,120] },
  { id:"Sadness",    col:[110,140,205] },
  { id:"Excitement", col:[232,150,92] },
  { id:"Anger",      col:[206,92,92] },
  { id:"Fear",       col:[156,116,196] },
];
const emoCol = (id)=>(EMOTIONS.find(e=>e.id===id)||EMOTIONS[0]).col;

// synthesize a gesture path through emotion-space (valence × arousal)
function makePath(fn,n=70,dur=6500){ const p=[]; for(let i=0;i<=n;i++){ const u=i/n; const {x,y}=fn(u); p.push({t:u*dur,x,y}); } return p; }
const MOCKS = [
  { id:"m_sad",  emotion:"Sadness",    presetId:"drone",   lockedCols:{mode:1,timbre:0,register:1,articulation:4,space:4,companion:3},
    path:makePath(u=>({x:-0.6+Math.sin(u*Math.PI*2)*0.12,y:-0.55+Math.cos(u*Math.PI*2)*0.1})) },
  { id:"m_joy",  emotion:"Joy",        presetId:"arc",     lockedCols:{mode:3,timbre:1,register:3,articulation:1,space:1,companion:4},
    path:makePath(u=>({x:-0.1+Math.sin(u*Math.PI*4)*0.5,y:0.55+Math.sin(u*Math.PI*2)*0.18})) },
  { id:"m_ang",  emotion:"Anger",      presetId:"roll",    lockedCols:{mode:0,timbre:3,register:1,articulation:0,space:0,companion:1},
    path:makePath(u=>({x:0.7+Math.sin(u*Math.PI*8)*0.18,y:-0.4+Math.sin(u*Math.PI*6)*0.25})) },
  { id:"m_fear", emotion:"Fear",       presetId:"scatter", lockedCols:{mode:0,timbre:4,register:4,articulation:1,space:3,companion:2},
    path:makePath(u=>({x:Math.sin(u*Math.PI*5)*0.6,y:-0.2+Math.cos(u*Math.PI*7)*0.5})) },
  { id:"m_exc",  emotion:"Excitement", presetId:"roll",    lockedCols:{mode:4,timbre:3,register:2,articulation:1,space:2,companion:4},
    path:makePath(u=>({x:0.55+Math.sin(u*Math.PI*3)*0.35,y:0.5+Math.sin(u*Math.PI*5)*0.3})) },
];

function drawAvatar(ctx,cx,cy,R,o){
  const {t,spin,wob,energy,contour,tint,alpha=1,halo=1,texture=0,satellites=0}=o;
  const N=92,rot=t*spin*Math.PI*2;
  const breathe=1+Math.sin(t*1.6)*0.02+energy*0.10, baseR=R*breathe, [tr,tg,tb]=tint;
  const hr=baseR*(1.8+halo*0.9);
  const hg=ctx.createRadialGradient(cx,cy,baseR*0.2,cx,cy,hr);
  hg.addColorStop(0,`rgba(${tr},${tg},${tb},${(0.20+energy*0.28)*alpha*(0.6+halo*0.4)})`);
  hg.addColorStop(0.5,`rgba(${tr},${tg},${tb},${0.06*alpha*halo})`);
  hg.addColorStop(1,`rgba(${tr},${tg},${tb},0)`);
  ctx.fillStyle=hg; ctx.beginPath(); ctx.arc(cx,cy,hr,0,Math.PI*2); ctx.fill();
  ctx.beginPath();
  for(let i=0;i<=N;i++){ const a=(i/N)*Math.PI*2;
    const d=Math.sin(a*3+rot)*wob+Math.sin(a*5-rot*1.3)*wob*0.4+contour*Math.sin(a*2+rot*0.5)*0.06
      +texture*(Math.sin(a*13+rot*2)*0.025+Math.sin(a*21-rot)*0.018);
    const rr=baseR*(1+d),x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
  ctx.closePath();
  const bg=ctx.createRadialGradient(cx-baseR*0.25,cy-baseR*0.25,baseR*0.1,cx,cy,baseR*1.05);
  bg.addColorStop(0,`rgba(255,250,238,${0.95*alpha})`);
  bg.addColorStop(0.55,`rgba(${Math.min(255,tr+50)},${Math.min(255,tg+35)},${tb},${0.5*alpha})`);
  bg.addColorStop(1,`rgba(${tr},${tg},${tb},${0.12*alpha})`);
  ctx.fillStyle=bg; ctx.fill();
  ctx.lineWidth=1.2; ctx.strokeStyle=`rgba(255,247,232,${(0.32+energy*0.5)*alpha})`; ctx.stroke();
  if(energy>0.01){ const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,baseR*0.9);
    cg.addColorStop(0,`rgba(255,255,250,${energy*0.9*alpha})`); cg.addColorStop(1,"rgba(255,255,250,0)");
    ctx.fillStyle=cg; ctx.beginPath(); ctx.arc(cx,cy,baseR*0.9,0,Math.PI*2); ctx.fill(); }
  for(let s=0;s<satellites;s++){ const a=rot*1.4+(s/Math.max(1,satellites))*Math.PI*2, orb=baseR*(1.7+s*0.32);
    const sx=cx+Math.cos(a)*orb, sy=cy+Math.sin(a)*orb;
    ctx.beginPath(); ctx.arc(sx,sy,baseR*0.10,0,Math.PI*2); ctx.fillStyle=`rgba(255,244,214,${0.7*alpha})`; ctx.fill(); }
}
function drawRing(ctx,cx,cy,R,age,pitch,sharp){
  const life=0.8/(0.5+sharp); if(age>life)return;
  const p=age/life,rr=R*(1+(0.6+pitch/18)*p*1.6),a=(1-p)*(0.4+pitch/30);
  ctx.beginPath(); ctx.arc(cx,cy,rr,0,Math.PI*2); ctx.lineWidth=2*(1-p)+0.4; ctx.strokeStyle=`rgba(255,240,205,${a})`; ctx.stroke();
}

export default function App(){
  const [phase,setPhase]=useState("welcome");
  const [audioReady,setAudioReady]=useState(false);
  const [welcomeExit,setWelcomeExit]=useState(false);
  const [assignedEmotion,setAssignedEmotion]=useState(null);
  const [mySubId,setMySubId]=useState(null);
  const [pool,setPool]=useState([]);
  const [currentSub,setCurrentSub]=useState(null);
  const [guesses,setGuesses]=useState({});   // {subId: guessedEmotionId}
  const [revealed,setRevealed]=useState(false);
  const [selected,setSelected]=useState(null);
  const [locked,setLocked]=useState(null);
  const [focus,setFocus]=useState({r:2,c:2});
  const [lockedCols,setLockedCols]=useState({mode:null,timbre:null,register:null,articulation:null,space:null,companion:null});
  const [,force]=useState(0);
  const [recording,setRecording]=useState(false);
  const [playingPath,setPlayingPath]=useState(false);

  const canvasRef=useRef(null);
  const phaseRef=useRef(phase),focusRef=useRef(focus),lockedColsRef=useRef(lockedCols);
  const patternRef=useRef(null),pulsesRef=useRef([]),progressRef=useRef(0);
  const cameraRef=useRef({x:0,y:0}),draggingRef=useRef(false),dragMovedRef=useRef(0),pointerRef=useRef({x:0,y:0});
  const presentRef=useRef({}); ROWS.forEach(r=>{ if(presentRef.current[r.key]===undefined) presentRef.current[r.key]=1; });
  const lockAnimRef=useRef(null), nodeScreenRef=useRef({});
  const planeTargetRef=useRef({x:0,y:0}),planeCurRef=useRef({x:0,y:0});
  const recRef=useRef({recording:false,path:[],t0:0}),playRef=useRef({playing:false,t0:0});
  const listenRef=useRef({path:null,t0:0});

  const synthRef=useRef(null),padRef=useRef(null),bassRef=useRef(null),counterRef=useRef(null),choirRef=useRef(null);
  const filterRef=useRef(null),reverbRef=useRef(null),seqRef=useRef(null);
  const eff=useRef({tint:WHITE,spin:0.13,halo:1,texture:0,size:1.2,sat:0,sharp:0.6,third:null,seventh:null,regSemis:0,wet:0.22,bass:false,counter:false,choir:false,gate:0});

  useEffect(()=>{phaseRef.current=phase;},[phase]);
  useEffect(()=>{focusRef.current=focus;},[focus]);
  useEffect(()=>{ if(!audioReady)return; try{ if(phase==="gallery"){ Tone.Transport.pause(); } else if(["movement","grid","plane","listen"].includes(phase)){ if(Tone.Transport.state!=="started") Tone.Transport.start(); } }catch(e){} },[phase,audioReady]);
  useEffect(()=>{lockedColsRef.current=lockedCols;},[lockedCols]);

  const activeRows=useCallback(()=>ROWS.filter(r=>lockedColsRef.current[r.key]===null),[]);

  const applyEffective=useCallback(()=>{
    const lc=lockedColsRef.current, act=ROWS.filter(r=>lc[r.key]===null);
    const fk = phaseRef.current==="grid" ? act[focusRef.current.r]?.key : undefined;
    const nodeFor=(key,idx)=>{ const row=ROWS[idx];
      if(key===fk) return row.nodes[focusRef.current.c];
      if(lc[key]!==null) return row.nodes[lc[key]];
      return ROW_DEFAULT[key]!==null ? row.nodes[ROW_DEFAULT[key]] : null; };
    const mode=nodeFor("mode",0),timbre=nodeFor("timbre",1),reg=nodeFor("register",2),
          art=nodeFor("articulation",3),space=nodeFor("space",4),comp=nodeFor("companion",5);
    const e=eff.current;
    e.tint=mode?mode.tint:WHITE; e.third=mode?mode.third:null; e.seventh=mode?mode.seventh:null;
    e.texture=timbre?timbre.texture:0; e.regSemis=reg?reg.semis:0; e.size=reg?reg.size:1.2;
    e.sharp=art?art.sharp:0.6; e.wet=space?space.wet:0.22; e.halo=1+(space?space.wet:0.22)*3;
    e.sat=comp?comp.sat:0; e.bass=comp?comp.bass:false; e.counter=comp?comp.counter:false; e.choir=comp?comp.choir:false;
    if(audioReady){
      synthRef.current.set({oscillator:{type:timbre?timbre.osc:"sine"},envelope:art?art.env:{attack:0.02,decay:0.25,sustain:0.2,release:0.6}});
      reverbRef.current.wet.rampTo(e.wet,0.3);
      if(phaseRef.current!=="plane"&&phaseRef.current!=="listen"){ filterRef.current.frequency.rampTo(6500,0.3); Tone.Transport.bpm.rampTo(96,0.3); }
    }
  },[audioReady]);
  useEffect(()=>{applyEffective();},[focus,lockedCols,phase,applyEffective]);

  const initAudio=useCallback(async()=>{
    await Tone.start();
    const reverb=new Tone.Reverb({decay:3.2,wet:0.22}).toDestination();
    const filter=new Tone.Filter(6500,"lowpass"); filter.Q.value=1.1; filter.connect(reverb);
    reverbRef.current=reverb; filterRef.current=filter;
    const synth=new Tone.PolySynth(Tone.Synth,{oscillator:{type:"sine"},envelope:{attack:0.02,decay:0.25,sustain:0.2,release:0.6}}).connect(filter); synth.volume.value=-9; synthRef.current=synth;
    const pad=new Tone.PolySynth(Tone.Synth,{oscillator:{type:"sine"},envelope:{attack:0.8,decay:0.5,sustain:0.7,release:2}}).connect(filter); pad.volume.value=-9; padRef.current=pad;
    const bass=new Tone.MonoSynth({oscillator:{type:"triangle"},envelope:{attack:0.01,decay:0.22,sustain:0.25,release:0.4},filterEnvelope:{attack:0.01,decay:0.2,baseFrequency:90,octaves:2.5}}).connect(filter); bass.volume.value=-7; bassRef.current=bass;
    const counter=new Tone.PolySynth(Tone.Synth,{oscillator:{type:"triangle"},envelope:{attack:0.005,decay:0.15,sustain:0,release:0.2}}).connect(filter); counter.volume.value=-13; counterRef.current=counter;
    const choir=new Tone.PolySynth(Tone.Synth,{oscillator:{type:"triangle"},envelope:{attack:1.1,decay:0.6,sustain:0.7,release:2.4}}).connect(filter); choir.volume.value=-15; choirRef.current=choir;

    Tone.Transport.bpm.value=96; Tone.Transport.loop=true; Tone.Transport.loopStart=0; Tone.Transport.loopEnd="1m";
    const weights=[1,.3,.6,.3,.8,.3,.6,.3,1,.3,.6,.3,.8,.3,.6,.3];
    const seq=new Tone.Sequence((time,step)=>{
      const preset=patternRef.current; if(!preset)return; const e=eff.current;
      if(step===0){
        const base=ROOT_MIDI-12+e.regSemis, chord=[base,base+7];
        if(e.third!==null){ chord.push(base+e.third); chord.push(base+12+e.third); } // third stacked in two octaves
        if(phaseRef.current==="plane"&&planeCurRef.current.y>0.3&&e.seventh!==null) chord.push(base+e.seventh);
        padRef.current.triggerAttackRelease(chord.map(midiToNote),"1m",time,0.5);
        if(e.choir){ const ct=e.third!==null?base+12+e.third:base+19; choirRef.current.triggerAttackRelease([base+12,base+19,ct].map(midiToNote),"1m",time,0.4); }
      }
      if(weights[step]<e.gate) return;
      const off=preset.steps[step];
      if(off!==null&&off!==undefined){
        // accent notes (the structure's octave hits) carry the mode's colour tone
        let semi=off;
        if(off===12 && e.third!==null) semi=12+e.third;     // octave accent -> colored
        synthRef.current.triggerAttackRelease(midiToNote(ROOT_MIDI+semi+e.regSemis),"16n",time,0.9);
        Tone.Draw.schedule(()=>pulsesRef.current.push({t:performance.now(),pitch:off}),time);
      }
      if(e.bass&&(step%4===0||(e.gate<0.3&&step%2===0))) bassRef.current.triggerAttackRelease(midiToNote(ROOT_MIDI-12+e.regSemis),"8n",time,0.9);
      if(e.counter&&step%4===2){ const ci=e.third!==null?e.third:7; counterRef.current.triggerAttackRelease(midiToNote(ROOT_MIDI+12+ci+e.regSemis),"16n",time,0.5); }
    },[...Array(16).keys()],"16n");
    seq.start(0); seqRef.current=seq; Tone.Transport.start();
    setAssignedEmotion(EMOTIONS[Math.floor(Math.random()*EMOTIONS.length)].id);
    setAudioReady(true); setPhase("movement");
  },[]);

  const beginIntro=useCallback(()=>{ setWelcomeExit(true); setTimeout(()=>setPhase("intro"),820); },[]);
  const audition=useCallback((i)=>{setSelected(i);patternRef.current=PRESETS[i];},[]);
  const lockMovement=useCallback(()=>{if(selected===null)return;setLocked(selected);cameraRef.current={x:0,y:0};setFocus({r:2,c:2});setPhase("grid");},[selected]);
  const lockRow=useCallback(()=>{
    const f=focusRef.current, lc=lockedColsRef.current, act=ROWS.filter(r=>lc[r.key]===null);
    const row=act[f.r]; if(!row||lc[row.key]!==null)return;
    const sp=nodeScreenRef.current[row.key+":"+f.c];
    lockAnimRef.current={key:row.key,node:row.nodes[f.c],t0:performance.now(),sx:sp?sp.x:null,sy:sp?sp.y:null};
    const nl={...lc,[row.key]:f.c}; setLockedCols(nl);
    const after=ROWS.filter(r=>nl[r.key]===null);
    setFocus({r:Math.min(f.r,Math.max(0,after.length-1)),c:2});
  },[]);
  const enterPlane=useCallback(()=>{planeTargetRef.current={x:0,y:0};planeCurRef.current={x:0,y:0};setPhase("plane");},[]);
  const backToGrid=useCallback(()=>{setPhase("grid");setPlayingPath(false);playRef.current.playing=false;},[]);

  const submitCreation=useCallback(async()=>{
    const raw=recRef.current.path; if(!raw||raw.length<3)return;
    // downsample path for storage
    const step=Math.max(1,Math.floor(raw.length/120)); const path=raw.filter((_,i)=>i%step===0);
    const id="u_"+Math.random().toString(36).slice(2,9);
    const sub={ id, emotion:assignedEmotion, presetId:PRESETS[locked].id, lockedCols:{...lockedCols}, path, ts:Date.now() };
    try{ await window.storage.set("sub:"+id, JSON.stringify(sub), true); }catch(e){}
    setMySubId(id); playRef.current.playing=false; setPlayingPath(false); setPhase("gallery");
  },[assignedEmotion,locked,lockedCols]);

  const loadPool=useCallback(async()=>{
    let stored=[];
    try{ const r=await window.storage.list("sub:",true); if(r&&r.keys){ for(const k of r.keys.slice(0,16)){ try{ const v=await window.storage.get(k,true); if(v&&v.value) stored.push(JSON.parse(v.value)); }catch(e){} } } }catch(e){}
    const seen=new Set(); const merged=[];
    for(const sub of [...stored,...MOCKS]){ if(!sub||seen.has(sub.id)||sub.id===mySubId) continue; seen.add(sub.id); merged.push(sub); }
    setPool(merged);
  },[mySubId]);
  useEffect(()=>{ if(phase==="gallery") loadPool(); },[phase,loadPool]);

  const startListen=useCallback((sub)=>{
    const preset=PRESETS.find(p=>p.id===sub.presetId)||PRESETS[0]; patternRef.current=preset;
    setLockedCols({mode:null,timbre:null,register:null,articulation:null,space:null,companion:null,...sub.lockedCols});
    listenRef.current={path:sub.path,t0:performance.now()};
    planeCurRef.current={x:sub.path[0].x,y:sub.path[0].y}; planeTargetRef.current={x:sub.path[0].x,y:sub.path[0].y};
    setCurrentSub(sub); setRevealed(false); setPhase("listen");
  },[]);
  const submitGuess=useCallback((emo)=>{ if(!currentSub)return; setGuesses(g=>({...g,[currentSub.id]:emo})); setRevealed(true); },[currentSub]);
  const leaveListen=useCallback(()=>{ setPhase("gallery"); setCurrentSub(null); setRevealed(false); },[]);
  const restart=useCallback(()=>{
    setLocked(null);setSelected(null);patternRef.current=null;pulsesRef.current=[];
    setLockedCols({mode:null,timbre:null,register:null,articulation:null,space:null,companion:null});
    ROWS.forEach(r=>presentRef.current[r.key]=1); lockAnimRef.current=null; eff.current.gate=0;
    cameraRef.current={x:0,y:0}; setFocus({r:2,c:2});
    if(audioReady)Tone.Transport.bpm.rampTo(96,0.2); setPhase("movement");
  },[audioReady]);
  const toggleRecord=useCallback(()=>{ if(recRef.current.recording){recRef.current.recording=false;setRecording(false);} else {recRef.current={recording:true,path:[],t0:performance.now()};setRecording(true);setPlayingPath(false);playRef.current.playing=false;} },[]);
  const togglePlay=useCallback(()=>{ if(playRef.current.playing){playRef.current.playing=false;setPlayingPath(false);} else if(recRef.current.path.length>2){playRef.current={playing:true,t0:performance.now()};setPlayingPath(true);} },[]);

  useEffect(()=>{
    const onKey=(e)=>{ const ph=phaseRef.current;
      if(ph==="grid"){ const f=focusRef.current, act=ROWS.filter(r=>lockedColsRef.current[r.key]===null); if(!act.length)return;
        if(e.key==="ArrowLeft"){ setFocus({r:f.r,c:(f.c+4)%5}); }
        else if(e.key==="ArrowRight"){ setFocus({r:f.r,c:(f.c+1)%5}); }
        else if(e.key==="ArrowUp"){ setFocus({r:(f.r-1+act.length)%act.length,c:f.c}); }
        else if(e.key==="ArrowDown"){ setFocus({r:(f.r+1)%act.length,c:f.c}); }
        else if(e.key==="Enter"){ lockRow(); }
        else return; e.preventDefault();
      } else if(ph==="plane"){ const tg=planeTargetRef.current,s=0.08;
        if(e.key==="ArrowLeft")tg.x=Math.max(-1,tg.x-s); else if(e.key==="ArrowRight")tg.x=Math.min(1,tg.x+s);
        else if(e.key==="ArrowUp")tg.y=Math.min(1,tg.y+s); else if(e.key==="ArrowDown")tg.y=Math.max(-1,tg.y-s);
        else return; e.preventDefault(); }
    };
    window.addEventListener("keydown",onKey); return ()=>window.removeEventListener("keydown",onKey);
  },[lockRow]);

  const dims=(W,H)=>{ const u=Math.min(W,H); return {colGap:u*0.27, rowGap:u*0.285, miniR:u*0.05}; };

  useEffect(()=>{
    const canvas=canvasRef.current; if(!canvas)return; const ctx=canvas.getContext("2d"); let raf; const start=performance.now();
    const fit=()=>{const dpr=Math.min(window.devicePixelRatio||1,2);const r=canvas.getBoundingClientRect();canvas.width=r.width*dpr;canvas.height=r.height*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);};
    fit(); window.addEventListener("resize",fit);

    const frame=(now)=>{
      const t=(now-start)/1000; const rct=canvas.getBoundingClientRect(),W=rct.width,H=rct.height;
      ctx.clearRect(0,0,W,H); const ph=phaseRef.current,cx=W/2,cy=H/2; const e=eff.current;
      if(audioReady)progressRef.current=Tone.Transport.progress||0;
      const pulses=pulsesRef.current; while(pulses.length&&now-pulses[0].t>900)pulses.shift();
      let energy=0,contour=0;
      for(const p of pulses){const age=(now-p.t)/1000;const ev=Math.max(0,1-age/(0.5/(0.4+e.sharp)));energy=Math.max(energy,ev);contour=Math.max(contour,(p.pitch/12)*ev);}

      if(ph==="grid"){
        const {colGap,rowGap,miniR}=dims(W,H);
        // animate row "present" values (collapse on lock)
        let total=0; const present={};
        for(const row of ROWS){ const target=lockedColsRef.current[row.key]===null?1:0;
          presentRef.current[row.key]+=(target-presentRef.current[row.key])*0.12;
          present[row.key]=presentRef.current[row.key]; total+=present[row.key]; }
        // stacked y positions (centered) -> grid shrinks as rows collapse
        const yMap={}; let acc=0;
        for(const row of ROWS){ const p=present[row.key]; yMap[row.key]=(acc+p/2 - total/2)*rowGap; acc+=p; }

        const act=ROWS.filter(r=>lockedColsRef.current[r.key]===null);
        const f=focusRef.current; const fRow=act[Math.min(f.r,act.length-1)];

        // camera: drag = free + nearest live; else ease to center focused node
        if(draggingRef.current){
          let best=null,bd=1e9,bi=0;
          act.forEach((row,ri)=>{ for(let c=0;c<5;c++){ const sx=cx+(c-2)*colGap+cameraRef.current.x, sy=cy+yMap[row.key]+cameraRef.current.y; const d=(sx-cx)**2+(sy-cy)**2; if(d<bd){bd=d;best={ri,c};} } });
          if(best&&(best.ri!==f.r||best.c!==f.c)){ focusRef.current={r:best.ri,c:best.c}; applyEffective(); }
        } else if(fRow){
          const tx=-(f.c-2)*colGap, ty=-yMap[fRow.key];
          cameraRef.current.x+=(tx-cameraRef.current.x)*0.14; cameraRef.current.y+=(ty-cameraRef.current.y)*0.14;
        }

        // draw rows
        nodeScreenRef.current={};
        const la=lockAnimRef.current;
        for(const row of ROWS){
          const p=present[row.key]; if(p<0.01) continue;
          const baseY=cy+yMap[row.key]+cameraRef.current.y;
          const isLockingRow = la && la.key===row.key;
          ctx.font="10px 'IBM Plex Mono',monospace"; ctx.textAlign="right";
          ctx.fillStyle="rgba(150,148,135,.5)";
          ctx.fillText(row.label, cx+(0-2)*colGap+cameraRef.current.x - colGap*0.62, baseY+3);
          for(let c=0;c<5;c++){
            const sx=cx+(c-2)*colGap+cameraRef.current.x, sy=baseY;
            nodeScreenRef.current[row.key+":"+c]={x:sx,y:sy};
            if(sx<-100||sx>W+100||sy<-100||sy>H+100)continue;
            const n=row.nodes[c]; const isF=fRow&&fRow.key===row.key&&f.c===c;
            if(isLockingRow && la.node===n) continue; // flying separately
            let tint=WHITE,spin=0.13,halo=1,texture=0,size=1,sat=0,selfP=0;
            if(row.key==="mode")tint=n.tint;
            if(row.key==="timbre"){tint=TEAL;texture=n.texture;}
            if(row.key==="register"){tint=[200,190,210];size=n.size/1.2;}
            if(row.key==="articulation"){tint=[210,200,180];selfP=Math.max(0,Math.sin(t*3*(0.4+n.sharp)))*n.sharp;}
            if(row.key==="space"){tint=VIOLET;halo=1+n.wet*3;}
            if(row.key==="companion"){tint=[150,200,160];sat=n.sat;}
            const dim=(isF?1:0.42)*p;
            drawAvatar(ctx,sx,sy,miniR*size*(isF?1.15:1),{t:t+c*0.7,spin,wob:0.05,energy:isF?energy:selfP,contour:0,tint,alpha:dim,halo,texture,satellites:sat});
            ctx.font="9px 'IBM Plex Mono',monospace"; ctx.textAlign="center";
            ctx.fillStyle=`rgba(230,228,220,${dim})`; ctx.fillText(n.name,sx,sy+miniR*size+15);
          }
        }
        // flying locked node -> absorbed into the self
        if(la){ const k=(now-la.t0)/650;
          if(k>=1){ lockAnimRef.current=null; }
          else { const ease=1-Math.pow(1-k,3);
            const fx=(la.sx??cx), fy=(la.sy??cy);
            const x=fx+(cx-fx)*ease, y=fy+(cy-fy)*ease;
            const tint=la.key==="mode"?la.node.tint:la.key==="timbre"?TEAL:la.key==="space"?VIOLET:[235,225,205];
            drawAvatar(ctx,x,y,miniR*(1-k*0.5),{t,spin:0.2,wob:0.05,energy:0.6*(1-k),contour:0,tint,alpha:1-k*0.7,halo:1,texture:0,satellites:0});
          }
        }
        // centre reticle (fixed self position)
        ctx.beginPath(); ctx.arc(cx,cy,miniR*1.7,0,Math.PI*2); ctx.setLineDash([3,5]);
        ctx.strokeStyle="rgba(255,247,232,.16)"; ctx.lineWidth=1; ctx.stroke(); ctx.setLineDash([]);
      }

      if(ph==="plane"||ph==="listen"){
        if(ph==="listen"&&listenRef.current.path){ const pth=listenRef.current.path,dur=pth[pth.length-1].t||1; const el=(now-listenRef.current.t0)%dur; let i=0; while(i<pth.length-1&&pth[i+1].t<el)i++; planeTargetRef.current={x:pth[i].x,y:pth[i].y}; }
        else if(playRef.current.playing&&recRef.current.path.length>2){ const pth=recRef.current.path,dur=pth[pth.length-1].t||1; const el=(now-playRef.current.t0)%dur; let i=0; while(i<pth.length-1&&pth[i+1].t<el)i++; planeTargetRef.current={x:pth[i].x,y:pth[i].y}; }
        const cur=planeCurRef.current,tgt=planeTargetRef.current; cur.x+=(tgt.x-cur.x)*0.06; cur.y+=(tgt.y-cur.y)*0.06;
        if(ph==="plane"&&recRef.current.recording)recRef.current.path.push({t:now-recRef.current.t0,x:cur.x,y:cur.y});
        const ar=(cur.x+1)/2,val=(cur.y+1)/2; e.gate=1-ar;
        if(audioReady){ Tone.Transport.bpm.rampTo(60+ar*96,0.1); filterRef.current.frequency.rampTo(220*Math.pow(2,val*4.6),0.1); }
        const px=W/2,py=H/2,rad=Math.min(W,H)*0.40;
        for(const a of ATTRACTORS){ const ax=px+a.x*rad,ay=py-a.y*rad; const g=ctx.createRadialGradient(ax,ay,0,ax,ay,rad*1.1);
          g.addColorStop(0,`rgba(${a.col[0]},${a.col[1]},${a.col[2]},.16)`); g.addColorStop(1,"rgba(0,0,0,0)"); ctx.fillStyle=g; ctx.fillRect(0,0,W,H); }
        ctx.strokeStyle="rgba(255,255,255,.08)"; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(px-rad,py); ctx.lineTo(px+rad,py); ctx.moveTo(px,py-rad); ctx.lineTo(px,py+rad); ctx.stroke();
        ctx.font="10px 'IBM Plex Mono',monospace"; ctx.fillStyle="rgba(180,178,168,.5)"; ctx.textAlign="center";
        ctx.fillText("← calm    arousal · tempo · density    energetic →",px,py+rad+26);
        ctx.save(); ctx.translate(px-rad-18,py); ctx.rotate(-Math.PI/2); ctx.fillText("← dark    valence · brightness    bright →",0,0); ctx.restore();
        for(const a of ATTRACTORS){ ctx.fillStyle="rgba(220,215,200,.4)"; ctx.fillText(a.name,px+a.x*rad*0.92,py-a.y*rad*0.92); }
        const tracePath = ph==="listen"?listenRef.current.path:recRef.current.path;
        if(tracePath&&tracePath.length>1){ ctx.beginPath(); tracePath.forEach((pt,i)=>{const x=px+pt.x*rad,y=py-pt.y*rad;i?ctx.lineTo(x,y):ctx.moveTo(x,y);}); ctx.strokeStyle=recRef.current.recording?"rgba(201,164,92,.5)":"rgba(201,164,92,.25)"; ctx.lineWidth=1.5; ctx.stroke(); }
        const mx=px+cur.x*rad,my=py-cur.y*rad; ctx.beginPath(); ctx.arc(mx,my,5,0,Math.PI*2); ctx.fillStyle="rgba(255,245,220,.8)"; ctx.fill();
        for(const p of pulses) drawRing(ctx,cx,cy,Math.min(W,H)*0.115*e.size,(now-p.t)/1000,p.pitch,e.sharp);
        drawAvatar(ctx,cx,cy,Math.min(W,H)*0.115*e.size,{t,spin:e.spin*(0.5+ar*1.4),wob:0.04+ar*0.05,energy,contour,tint:e.tint,alpha:1,halo:e.halo*(0.6+val*0.8),texture:e.texture,satellites:e.sat});
        raf=requestAnimationFrame(frame); return;
      }

      // the self is only embodied from "movement" onward (welcome/intro show no avatar)
      if(ph==="movement"||ph==="grid"){
        const preset=patternRef.current||(locked!==null?PRESETS[locked]:null);
        const heroR=Math.min(W,H)*(ph==="grid"?0.115:0.17)*(ph==="grid"?e.size:1);
        if(preset&&ph==="movement"){ const ang=-Math.PI/2+progressRef.current*Math.PI*2; ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(ang)*heroR*1.9,cy+Math.sin(ang)*heroR*1.9); ctx.strokeStyle="rgba(201,164,92,.22)"; ctx.lineWidth=1; ctx.stroke(); }
        for(const p of pulses) drawRing(ctx,cx,cy,heroR,(now-p.t)/1000,p.pitch,ph==="grid"?e.sharp:0.6);
        drawAvatar(ctx,cx,cy,heroR,{t,spin:ph==="grid"?e.spin:(preset?preset.spin:0.05),wob:preset?preset.wob:0.02,energy,contour,tint:ph==="grid"?e.tint:WHITE,alpha:1,halo:ph==="grid"?e.halo:1,texture:ph==="grid"?e.texture:0,satellites:ph==="grid"?e.sat:0});
      }
      raf=requestAnimationFrame(frame);
    };
    raf=requestAnimationFrame(frame); return ()=>{cancelAnimationFrame(raf);window.removeEventListener("resize",fit);};
  },[audioReady,locked,applyEffective]);

  useEffect(()=>()=>{try{seqRef.current?.dispose();Tone.Transport.stop();[synthRef,padRef,bassRef,counterRef,choirRef].forEach(r=>r.current?.dispose());}catch(e){}},[]);

  const onDown=(ev)=>{ draggingRef.current=true; dragMovedRef.current=0;
    const r=canvasRef.current.getBoundingClientRect(); pointerRef.current={x:ev.clientX-r.left,y:ev.clientY-r.top};
    ev.currentTarget.setPointerCapture?.(ev.pointerId); onMove(ev);
  };
  const onMove=(ev)=>{ const ph=phaseRef.current; const r=canvasRef.current.getBoundingClientRect();
    const px=ev.clientX-r.left, py=ev.clientY-r.top;
    if(ph==="grid"&&draggingRef.current){ cameraRef.current.x+=px-pointerRef.current.x; cameraRef.current.y+=py-pointerRef.current.y; dragMovedRef.current+=Math.abs(px-pointerRef.current.x)+Math.abs(py-pointerRef.current.y); }
    else if(ph==="plane"&&draggingRef.current){ const rad=Math.min(r.width,r.height)*0.40; planeTargetRef.current={x:Math.max(-1,Math.min(1,(px-r.width/2)/rad)),y:Math.max(-1,Math.min(1,-(py-r.height/2)/rad))}; }
    pointerRef.current={x:px,y:py};
  };
  const onUp=()=>{ const ph=phaseRef.current; if(ph==="grid"){ setFocus({...focusRef.current}); } draggingRef.current=false; };

  const act=ROWS.filter(r=>lockedCols[r.key]===null);
  const fRow=act[Math.min(focus.r,Math.max(0,act.length-1))];
  const allLocked=act.length===0;

  return (
    <div className="stage-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500&family=IBM+Plex+Mono:wght@300;400;500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        .stage-root{position:relative;width:100%;height:100vh;min-height:600px;overflow:hidden;color:#e8e6df;font-family:'IBM Plex Mono',monospace;background:radial-gradient(120% 120% at 50% 45%,#14141d 0%,#0a0a11 55%,#050507 100%)}
        .stage-root::after{content:"";position:absolute;inset:0;pointer-events:none;background-image:radial-gradient(rgba(255,255,255,.025) 1px,transparent 1px);background-size:3px 3px;opacity:.5}
        canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
        .overlay{position:absolute;inset:0;touch-action:none;cursor:grab}
        .overlay:active{cursor:grabbing}
        .layer{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;pointer-events:none}
        .layer>*{pointer-events:auto}
        .kicker{font-size:11px;letter-spacing:.42em;text-transform:uppercase;color:#c9a45c;margin-bottom:22px}
        .title{font-family:'Fraunces',serif;font-weight:300;font-size:clamp(34px,6vw,62px);line-height:1.02;color:#f4f0e6;text-align:center}
        .title em{font-style:italic;color:#e9d6ad}
        .body{max-width:540px;text-align:center;margin-top:26px;font-size:14px;line-height:1.85;color:#9a9788;font-weight:300}
        .btn{margin-top:38px;background:transparent;color:#f4f0e6;cursor:pointer;border:1px solid rgba(201,164,92,.45);padding:14px 34px;font-family:inherit;font-size:12px;letter-spacing:.22em;text-transform:uppercase;transition:all .4s;border-radius:2px}
        .btn:hover{background:rgba(201,164,92,.10);border-color:#c9a45c;box-shadow:0 0 40px rgba(201,164,92,.15);letter-spacing:.28em}
        .btn:disabled{opacity:.25;cursor:default}
        .b2{margin-top:0;padding:10px 22px;font-size:10px}
        .rail{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;margin-bottom:6px;max-width:780px}
        .chip{background:rgba(15,15,22,.55);backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,.08);border-radius:3px;padding:13px 18px;cursor:pointer;transition:all .3s;min-width:130px;text-align:left}
        .chip:hover{border-color:rgba(201,164,92,.4);transform:translateY(-2px)}
        .chip.on{border-color:#c9a45c;background:rgba(201,164,92,.08)}
        .chip .nm{font-family:'Fraunces',serif;font-size:16px;color:#f4f0e6}
        .chip .bl{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#8a8779;margin-top:5px}
        .lock-row{display:flex;flex-direction:column;align-items:center;gap:14px;margin-bottom:26px}.lock-row .btn{margin-top:0}
        .topcap{position:absolute;top:24px;left:0;right:0;text-align:center;pointer-events:none}
        .hint{font-size:12px;color:#7d7a6e;letter-spacing:.04em;font-weight:300}
        .corner{position:absolute;top:22px;right:24px;display:flex;gap:8px}
        .bottombar{position:absolute;bottom:24px;left:0;right:0;display:flex;flex-direction:column;align-items:center;gap:12px;pointer-events:none}
        .bottombar>*{pointer-events:auto}
        .welcome{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;transition:opacity .8s ease,filter .8s ease}
        .welcome.wexit{opacity:0;filter:blur(6px)}
        .seed{width:6px;height:6px;border-radius:50%;background:#fff7e8;margin-bottom:54px;box-shadow:0 0 18px 4px rgba(255,221,160,.55);animation:seedPulse 3.4s ease-in-out infinite, seedIn 1.6s ease both}
        @keyframes seedIn{from{opacity:0;transform:scale(.2)}to{opacity:1}}
        @keyframes seedPulse{0%,100%{box-shadow:0 0 14px 3px rgba(255,221,160,.4);transform:scale(1)}50%{box-shadow:0 0 26px 7px rgba(255,221,160,.7);transform:scale(1.25)}}
        .wlines{display:flex;flex-direction:column;align-items:center;gap:16px;max-width:640px;text-align:center}
        .wl{font-family:'Fraunces',serif;font-weight:300;font-size:clamp(19px,2.6vw,27px);line-height:1.4;color:#efe9dc;opacity:0;animation:wlrise 1.5s ease both}
        .wl-dim{font-style:italic;color:#b9b09a;font-size:clamp(16px,2.2vw,22px)}
        @keyframes wlrise{from{opacity:0;transform:translateY(14px);filter:blur(3px)}to{opacity:1;transform:translateY(0);filter:blur(0)}}
        .wenter{margin-top:52px;font-size:11px;letter-spacing:.42em;text-transform:uppercase;color:#c9a45c;opacity:0;animation:wlrise 1.6s ease both, enterGlow 2.6s ease-in-out infinite 9s}
        @keyframes enterGlow{0%,100%{opacity:.55}50%{opacity:1}}
        .goaltag{position:absolute;top:24px;left:24px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#8a8779;display:flex;gap:6px;align-items:center;pointer-events:none}
        .goaltag b{color:var(--gc);font-weight:500;letter-spacing:.2em}
        .goaltag::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--gc);box-shadow:0 0 12px 2px var(--gc);margin-right:4px}
        .galleryL{justify-content:flex-start;padding-top:64px;overflow-y:auto}
        .cards{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;max-width:760px;margin-top:14px}
        .card{width:228px;text-align:left;background:rgba(15,15,22,.6);border:1px solid rgba(255,255,255,.08);border-radius:4px;padding:16px 18px;cursor:pointer;transition:all .3s;color:#e8e6df;font-family:inherit}
        .card:hover{border-color:rgba(201,164,92,.45);transform:translateY(-2px);box-shadow:0 8px 30px rgba(0,0,0,.3)}
        .cardno{font-family:'Fraunces',serif;font-size:17px;color:#f4f0e6}
        .cardsub{font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#8a8779;margin:6px 0 12px}
        .cardguess{font-size:11px;letter-spacing:.06em}
        .emorow{display:flex;gap:10px;flex-wrap:wrap;justify-content:center}
        .emobtn{background:rgba(15,15,22,.55);backdrop-filter:blur(6px);border:1px solid var(--ec);color:#f4f0e6;border-radius:3px;padding:12px 20px;cursor:pointer;font-family:inherit;font-size:12px;letter-spacing:.14em;transition:all .3s;box-shadow:0 0 0 0 var(--ec)}
        .emobtn:hover{background:var(--ec);color:#0a0a11;box-shadow:0 0 28px -4px var(--ec)}
        .revealbox{display:flex;flex-direction:column;align-items:center;gap:12px;background:rgba(12,12,18,.7);backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.08);border-radius:6px;padding:22px 30px}
        .revealline{font-family:'Fraunces',serif;font-size:18px;color:#efe9dc}
        .revealline b{font-weight:500}
        .revealtag{font-size:11px;letter-spacing:.2em;text-transform:uppercase}
                .fade-in{animation:fade 1.1s ease both}@keyframes fade{from{opacity:0;transform:translateY(8px)}to{opacity:1}}
      `}</style>

      <canvas ref={canvasRef}/>
      {(phase==="grid"||phase==="plane")&&(<div className="overlay" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp}/>)}

      {phase==="welcome"&&(
        <div className={`welcome ${welcomeExit?"wexit":""}`} onClick={beginIntro}>
          <div className="seed"/>
          <div className="wlines">
            <p className="wl" style={{animationDelay:"0.6s"}}>Welcome.</p>
            <p className="wl" style={{animationDelay:"2.0s"}}>You are the seed of an emotion.</p>
            <p className="wl wl-dim" style={{animationDelay:"3.6s"}}>Unmolded and unformed.</p>
            <p className="wl" style={{animationDelay:"5.4s"}}>You must grow to evoke the sense of your emotion</p>
            <p className="wl" style={{animationDelay:"6.6s"}}>through molding the sound.</p>
          </div>
          <div className="wenter" style={{animationDelay:"8.6s"}}>enter</div>
        </div>
      )}

      {phase==="intro"&&(
        <div className="layer fade-in">
          <div className="kicker">Phase One</div>
          <h1 className="title">Learning to <em>Move</em></h1>
          <p className="body">You are an emotion with no body yet — no color, no feeling, only the possibility of motion. Before you can feel, you must learn how to move.</p>
          <button className="btn" onClick={initAudio}>Awaken</button>
        </div>
      )}

      {phase==="movement"&&(
        <div className="layer">
          {assignedEmotion&&(<div className="goaltag" style={{["--gc"]:`rgb(${emoCol(assignedEmotion).join(",")})`}}>your emotion · <b>{assignedEmotion}</b></div>)}
          <div className="topcap fade-in"><div className="kicker">Choose a Movement</div><div className="hint">listen · it plays live · lock it in when it feels like you</div></div>
          <div style={{flex:1}}/>
          <div className="lock-row">
            <div className="rail">{PRESETS.map((p,i)=>(<button key={p.id} className={`chip ${selected===i?"on":""}`} onClick={()=>audition(i)}><div className="nm">{p.name}</div><div className="bl">{p.blurb}</div></button>))}</div>
            <button className="btn" disabled={selected===null} onClick={lockMovement}>Lock in this movement</button>
          </div>
        </div>
      )}

      {phase==="grid"&&(
        <>
          <div className="corner"><button className="btn b2" onClick={restart}>Restart</button></div>
          {assignedEmotion&&(<div className="goaltag" style={{["--gc"]:`rgb(${emoCol(assignedEmotion).join(",")})`}}>evoke · <b>{assignedEmotion}</b></div>)}
          <div className="topcap fade-in"><div className="kicker">The Landscape · Who You Are</div>
            <div className="hint">drag to pan · arrows to roam · the centred node plays · each lock collapses the grid</div></div>
          <div className="bottombar">
            {!allLocked && fRow && (
              <button className="btn b2" style={{borderColor:"rgba(201,164,92,.6)"}} onClick={lockRow}>
                Lock {fRow.label}: {fRow.nodes[focus.c].name}
              </button>
            )}
            <button className="btn b2" onClick={enterPlane} disabled={lockedCols.mode===null}>
              {lockedCols.mode===null?"lock a mode to feel":(allLocked?"You are complete — enter the feeling →":"Enter the feeling →")}
            </button>
          </div>
        </>
      )}

      {phase==="plane"&&(
        <>
          <div className="corner">
            <button className="btn b2" onClick={toggleRecord}>{recording?"◼ stop":"● record"}</button>
            <button className="btn b2" onClick={togglePlay} disabled={recRef.current.path.length<3}>{playingPath?"❚❚ pause":"▶ loop"}</button>
            <button className="btn b2" onClick={backToGrid}>← grid</button>
          </div>
          {assignedEmotion&&(<div className="goaltag" style={{["--gc"]:`rgb(${emoCol(assignedEmotion).join(",")})`}}>evoke · <b>{assignedEmotion}</b></div>)}
          <div className="topcap fade-in"><div className="kicker">The Feeling · Performed</div>
            <div className="hint">move through emotion-space · drag anywhere · record a gesture to capture your piece</div></div>
          <div className="bottombar">
            <button className="btn b2" style={{borderColor:"rgba(201,164,92,.6)"}} disabled={recRef.current.path.length<3} onClick={submitCreation}>
              {recRef.current.path.length<3?"record a gesture to submit":"Submit your emotion →"}
            </button>
          </div>
        </>
      )}

      {phase==="gallery"&&(
        <div className="layer galleryL fade-in">
          <div className="kicker" style={{marginBottom:10}}>The Gallery · What Others Made</div>
          <p className="hint" style={{marginBottom:4}}>listen to each soundscape and guess the emotion it was meant to evoke</p>
          {mySubId&&assignedEmotion&&(<p className="hint" style={{marginBottom:18}}>you submitted <b style={{color:`rgb(${emoCol(assignedEmotion).join(",")})`}}>{assignedEmotion}</b> · score {Object.keys(guesses).filter(id=>{const sp=pool.find(s=>s.id===id);return sp&&guesses[id]===sp.emotion;}).length}/{Object.keys(guesses).length}</p>)}
          <div className="cards">
            {pool.map((sub,i)=>{ const g=guesses[sub.id]; const correct=g===sub.emotion;
              return (
                <button key={sub.id} className="card" onClick={()=>startListen(sub)}>
                  <div className="cardno">untitled · {String(i+1).padStart(2,"0")}</div>
                  <div className="cardsub">{ROWS[0].nodes[sub.lockedCols.mode??2]?.name||"—"} · {PRESETS.find(p=>p.id===sub.presetId)?.name}</div>
                  {g
                    ? <div className="cardguess" style={{color:correct?"#9fd09f":"#d09f9f"}}>{correct?"✓":"✗"} guessed {g} · was {sub.emotion}</div>
                    : <div className="cardguess" style={{color:"#8a8779"}}>▶ listen & guess</div>}
                </button>
              );
            })}
          </div>
          <button className="btn" onClick={restart} style={{marginTop:30}}>Begin a new emotion</button>
        </div>
      )}

      {phase==="listen"&&currentSub&&(
        <>
          <div className="corner"><button className="btn b2" onClick={leaveListen}>← gallery</button></div>
          <div className="topcap fade-in"><div className="kicker">Listen · What Does This Feel Like?</div>
            <div className="hint">{revealed?"the truth is revealed":"watch it move · then name the emotion"}</div></div>
          <div className="bottombar">
            {!revealed ? (
              <div className="emorow">
                {EMOTIONS.map(e=>(
                  <button key={e.id} className="emobtn" style={{["--ec"]:`rgb(${e.col.join(",")})`}} onClick={()=>submitGuess(e.id)}>{e.id}</button>
                ))}
              </div>
            ) : (
              <div className="revealbox">
                <div className="revealline">
                  you felt <b style={{color:`rgb(${emoCol(guesses[currentSub.id]).join(",")})`}}>{guesses[currentSub.id]}</b>
                  {" · "}the maker shaped <b style={{color:`rgb(${emoCol(currentSub.emotion).join(",")})`}}>{currentSub.emotion}</b>
                </div>
                <div className="revealtag" style={{color:guesses[currentSub.id]===currentSub.emotion?"#9fd09f":"#d09f9f"}}>
                  {guesses[currentSub.id]===currentSub.emotion?"✓ you read it true":"✗ a different feeling"}
                </div>
                <button className="btn b2" onClick={leaveListen}>back to the gallery →</button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
