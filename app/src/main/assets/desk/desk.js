'use strict';
if(!Object.hasOwn)Object.hasOwn=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const K=Koma,$=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s)),esc=s=>String(s==null?'':s).replace(/[&<>"']/g,a=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[a]));
const paths={undo:'M10 6 4 12l6 6M5 12h9a6 6 0 0 1 6 6',redo:'m14 6 6 6-6 6m5-6h-9a6 6 0 0 0-6 6',box:'M5 14v5h14v-5M12 15V3m-5 5 5-5 5 5',chev:'m7 10 5 5 5-5',canvas:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',play:'m8 5 11 7-11 7z',pause:'M8 5v14m8-14v14',prev:'M5 5v14m13-14-10 7 10 7z',next:'M19 5v14M6 5l10 7-10 7z',mark:'M6 21V4h13l-4 5 4 5H6',grid:'M8 3v18m8-18v18M3 8h18M3 16h18',magnet:'M4 5v8a8 8 0 0 0 16 0V5h-5v8a3 3 0 0 1-6 0V5zM4 9h5m6 0h5',cut:'m4 4 15 15M4 20 19 5M8 6a3 3 0 1 1-6 0 3 3 0 1 1 6 0zm0 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0z',left:'M6 4v16m13-13-6 5 6 5M12 12h9',right:'M18 4v16M5 7l6 5-6 5m7-5H3',copy:'M8 8h12v12H8zM4 16V4h12',trash:'M4 6h16M9 6V3h6v3M6 7l1 14h10l1-14M10 10v7m4-7v7',media:'M3 5h18v14H3zM3 10h18M6 5l3 5m3-5 3 5',sliders:'M3 7h10m4 0h4M3 17h3m4 0h11M13 4v6M7 14v6',text:'M3 7V4h18v3M12 4v16m-4 0h8',audio:'M8 17V5l12-2v12M8 17c0 4-7 5-7 1s7-5 7-1zm12-2c0 4-7 5-7 1s7-5 7-1z',layers:'m3 8 9-5 9 5-9 5zm0 5 9 5 9-5m-18 5 9 5 9-5',spark:'m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2zM20 2v4m-2-2h4',close:'M5 5l14 14M19 5 5 19',plus:'M12 4v16M4 12h16',folder:'M3 6h6l2 3h10v11H3z',head:'M3 16v-4a9 9 0 0 1 18 0v4M3 13h4v7H3zm14 0h4v7h-4z'};
const ic=(name)=>'<svg viewBox="0 0 24 24" aria-hidden="true" fill="'+(name==='play'?'currentColor':'none')+'" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="'+paths[name]+'"/></svg>';
const icons={undo:['undo',''],redo:['redo',''],export:['box','書き出し'],prev:['prev',''],next:['next',''],play:['play',''],marker:['mark',''],guides:['grid',''],snap:['magnet',''],split:['cut','分割'],leftTrim:['left','左を削る'],rightTrim:['right','右を削る'],dup:['copy','複製'],delete:['trash','削除'],assets:['media','素材'],details:['sliders','調整'],text:['text','字幕'],audio:['audio','音声'],overlay:['layers','重ねる'],ai:['spark','AI編集'],close:['close','']};
for(const [a,[i,t]] of Object.entries(icons))for(const b of $$('[data-action="'+a+'"]'))if(!b.classList.contains('miniDetail'))b.innerHTML=ic(i)+t;
const E=(s)=>esc(s), call=(name,...args)=>window.Studio[name](...args);
let projects=[],p,media={},account={accounts:[]},sel='',head=0,playing=false,clock=0,scrollScale=56,snap=true,sheet='',past=[],future=[],toastTimer,renderState={phase:'idle'},pending=null,request=null,analysisRequest=null,taskText='',useImages=false,model='',models=[],busyText='',mute=false,sampleStatus='',lastOpenedDetails={};
function notice(msg){const box=$('#toast');box.textContent=msg;box.hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>box.hidden=true,3600);}
function boot(){try{const data=JSON.parse(call('boot'));if(data.error)throw Error(data.error);media=data.media||{};account=data.account||account;renderState=data.render||renderState;
  projects=Array.isArray(data.state.projects)?data.state.projects:[];p=projects.find(x=>x.id===data.state.active)||projects[0];const first=!p;
  if(first){p=K.project('湖畔の朝');projects.push(p);}else{head=K.clamp(data.state.head||0,0,K.duration(p));sel=data.state.sel||'';}
  model=data.state.model||'';snap=data.state.snap!==false;scrollScale=data.state.scale||56;draw();if(first){save();call('demo',p.id);}
}catch(e){notice(e.message);}}
function save(){const err=call('save',JSON.stringify({projects,active:p.id,head,sel,scale:scrollScale,snap,model}));if(err)throw Error(err);}
function snapshot(){return JSON.stringify(p);}
function replace(next){projects[projects.findIndex(x=>x.id===p.id)]=next;p=next;}
function edit(action,label,redrawSheet=true){
  const before=snapshot();try{action();K.validate(p,media);if(snapshot()===before)return;past.push(before);if(past.length>60)past.shift();future=[];pending=null;head=K.clamp(head,0,K.duration(p));checkSel();save();draw();if(redrawSheet&&sheet)show(sheet,true);if(label)notice(label);}
  catch(e){replace(JSON.parse(before));draw();throw e;}
}
function checkSel(){if(!p.clips.concat(p.layers).some(x=>x.id===sel))sel=p.clips[0]?.id||p.layers[0]?.id||'';}
function undo(redo){const src=redo?future:past,dst=redo?past:future;if(!src.length)return;pause();dst.push(snapshot());replace(JSON.parse(src.pop()));head=K.clamp(head,0,K.duration(p));checkSel();pending=null;save();draw();if(sheet)show(sheet,true);}
const activeClip=()=>p.clips.find(c=>c.id===sel),activeLayer=()=>p.layers.find(c=>c.id===sel);
const moment=(n)=>{const fr=Math.floor(Math.max(0,n)*p.fps+.0001);const sec=Math.floor(fr/p.fps);return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0')+':'+String(fr%p.fps).padStart(2,'0');};
function demoProject(dst){
  if(dst.clips.length)return;
  const a=K.clip('demo_sunrise',media.demo_sunrise),b=K.clip('demo_lake',media.demo_lake);Object.assign(a,{to:4,fit:'cover',zoom:1.015,zoomEnd:1.13});Object.assign(b,{to:4,fit:'cover',transition:'fade',overlap:.65,zoom:1.1,zoomEnd:1});
  dst.clips.push(a,b);dst.layers.push({...K.layer('text',.15),text:'MOTOSU',size:.13,font:'serif',box:false,bold:false,x:.5,y:.54,duration:3.15},{...K.layer('text',.15),text:'本 栖 湖 の 朝',size:.039,box:false,bold:true,x:.5,y:.70,duration:3.15});
  dst.markers.push({id:K.id(),t:3.35,name:'湖畔'});if(dst.id===p.id){head=.7;sel=a.id;}save();draw();
}
function draw(){
  $('#projectTitle').innerHTML=E(p.name)+ic('chev');$('#spec').innerHTML=ic('canvas')+E(p.ratio)+' · '+p.fps+' fps';
  $('#undo').disabled=!past.length;$('#redo').disabled=!future.length;$('#snap').classList.toggle('on',snap);$('#zoomLabel').textContent=(scrollScale/56).toFixed(1)+'×';
  const o=activeClip()||activeLayer();$('#selection').textContent=o?(o.type==='text'?'字幕 · '+o.text:media[o.asset]?.name||'素材'):'素材を追加して編集を開始';
  $$('.quicktools button').forEach(b=>b.disabled=!o||(['split','leftTrim','rightTrim'].includes(b.dataset.action)&&!activeClip()));
  timeline();fit();frame(true);renderStatus();
}
function lanePack(items){const lanes=[];for(const a of items.slice().sort((a,b)=>a.start-b.start)){let row=lanes.find(row=>row.every(b=>b.start+b.duration<=a.start+.0001||a.start+a.duration<=b.start+.0001));if(!row){row=[];lanes.push(row);}row.push(a);}return lanes.length?lanes:[[]];}
function timeline(){
  const sc=$('#scroll'),w=Math.max(sc.clientWidth,Math.ceil((K.duration(p)+2)*scrollScale)+10),unit=scrollScale<28?5:scrollScale<65?2:scrollScale>180?.5:1;
  $('#tracks').style.width=w+'px';$('#tracks').style.setProperty('--grid',unit*scrollScale+'px');let ruler='';const left=sc.scrollLeft/scrollScale,right=(sc.scrollLeft+Math.max(sc.clientWidth,400))/scrollScale;
  for(let n=Math.max(0,Math.floor((left-2*unit)/unit));n<=Math.ceil(right/unit)+2;n++){const t=n*unit;ruler+='<i class="tick" style="left:'+t*scrollScale+'px">'+(t>=60?Math.floor(t/60)+'m'+Math.round(t%60):t+'s')+'</i><i class="tick sub" style="left:'+(t+unit/2)*scrollScale+'px"></i>';}
  for(const m of p.markers)ruler+='<button class="flag" data-flag="'+E(m.id)+'" style="left:'+m.t*scrollScale+'px">'+E(m.name)+'</button>';
  let html='<div class="ruler">'+ruler+'</div>',names='<div class="rulerlabel"></div>';
  const lanes=[['v','V1',K.spans(p).map(s=>({item:s.c,start:s.start,d:s.duration}))]];
  for(const [type,cls,label] of [['text','t','T'],['other','o','V'],['audio','a','A']]){
    const items=p.layers.filter(l=>type==='other'?['video','image'].includes(l.type):l.type===type);
    if(!items.length&&type==='other')continue;
    lanePack(items).forEach((row,i)=>lanes.push([cls,label+(i+(cls==='o'?2:1)),row.map(l=>({item:l,start:l.start,d:l.duration}))]));
  }
  for(const [cls,name,items] of lanes){names+='<div class="lanename '+cls+'">'+name+'</div>';html+='<div class="lane '+cls+'">';for(const v of items){
    const o=v.item,m=media[o.asset];const thumb=m?.thumb?'linear-gradient(0deg,#12191de0,transparent 85%),url("../thumb/'+encodeURIComponent(m.id)+(m.strip?'-strip':'')+'.jpg")':'';
    const style='left:'+v.start*scrollScale+'px;width:'+Math.max(4,v.d*scrollScale-1)+'px;'+((cls==='v'||cls==='o'||cls==='a')&&thumb?'background-image:'+thumb+';':'');
    const label=o.type==='text'?o.text:m?.name||'';html+='<div role="button" tabindex="0" aria-label="'+E(label)+'" data-item="'+E(o.id)+'" class="block '+cls+' '+(thumb?'photo ':'')+(sel===o.id?' sel':'')+'" style="'+E(style)+'">'+(sel===o.id?'<i class="movegrip" data-side="move" title="ドラッグで移動"></i><i class="handle left" data-side="left"></i><i class="handle right" data-side="right"></i>':'')+'<span>'+E(label)+'</span></div>';
  }html+='</div>';}
  $('#trackNames').innerHTML=names;$('#tracks').innerHTML=html+'<div class="needle" style="left:'+head*scrollScale+'px"></div>';
}
let scrollTimer=null;$('#scroll').addEventListener('scroll',()=>{if(!scrollTimer)scrollTimer=setTimeout(()=>{scrollTimer=null;if(!drag)timeline();},90);});
function fit(){if(!p)return;const area=$('#monitor'),[w,h]=K.dims(p),r=w/h,aw=area.clientWidth,ah=area.clientHeight;const sw=Math.max(2,Math.min(aw,ah*r));$('#stage').style.width=sw+'px';$('#stage').style.height=sw/r+'px';$('#stage').style.background=K.safeColor(p.bg,'#11151b');}
const mediaUrl=(m,proxy=true)=>'../'+(proxy&&m.proxy?'proxy/'+encodeURIComponent(m.id)+'.mp4':'media/'+encodeURIComponent(m.file));
const nodes=new Map(),audioNodes=new Map(),stampCache=new Map();
function audioGain(el,value){el.volume=K.clamp(value,0,1);}
function sync(el,time,speed,force){if(el.tagName!=='VIDEO'&&el.tagName!=='AUDIO')return;
  el.playbackRate=speed;if(el.readyState>=1){if(force||Math.abs(el.currentTime-time)>(playing?.22:.018)){try{el.currentTime=Math.max(0,time);}catch(_){};}}
  if(playing&&el.paused)el.play().catch(()=>{});if(!playing&&!el.paused)el.pause();
}
function sourceElement(m,isAudio=false){const el=document.createElement(isAudio?'audio':m.kind==='image'?'img':'video');el.src=mediaUrl(m,!isAudio);el.preload='auto';el.playsInline=true;
  el.addEventListener('loadedmetadata',()=>frame(true));el.addEventListener('error',()=>{if(!isAudio&&m.kind==='video')notice('この映像は「調整 → 軽量プレビュー」で端末向けに変換できます。');});return el;}
function deleteUnused(map,keys){for(const [k,item] of map){if(!keys.has(k)){const el=item.el||item;if(el.pause){el.pause();el.removeAttribute('src');el.load();}if(item.wrap)item.wrap.remove();else el.remove();map.delete(k);}}}
function makeStamp(l,w,h){
  const cacheKey=JSON.stringify([l.text,l.size,l.color,l.back,l.box,l.bold,l.font,w,h]);
  if(stampCache.has(cacheKey))return stampCache.get(cacheKey);
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');const size=Math.max(11,Math.round(h*l.size)),pad=Math.ceil(size*.25),lh=Math.ceil(size*1.22),font=(l.bold?'700 ':'400 ')+size+'px '+(['serif','monospace'].includes(l.font)?l.font:'sans-serif');
  ctx.font=font;const maxWidth=Math.max(20,w*.92-2*pad),lines=[];
  for(const para of l.text.split('\n')){let line='';for(const ch of Array.from(para)){if(line&&ctx.measureText(line+ch).width>maxWidth){lines.push(line);line=ch;}else line+=ch;}lines.push(line);}
  const clipped=lines.slice(0,Math.max(1,Math.floor((h-2*pad)/lh)));
  canvas.width=Math.min(w,Math.ceil(Math.max(4,...clipped.map(t=>ctx.measureText(t).width)) +2*pad+4));canvas.height=Math.min(h,clipped.length*lh+pad*2);
  ctx.font=font;ctx.textBaseline='middle';ctx.textAlign='center';if(l.box){ctx.fillStyle=K.safeColor(l.back,'#152026');ctx.globalAlpha=.83;ctx.fillRect(0,0,canvas.width,canvas.height);ctx.globalAlpha=1;}
  else{ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=size*.075;ctx.shadowOffsetY=size*.035;}
  ctx.fillStyle=K.safeColor(l.color,'#ffffff');clipped.forEach((s,i)=>ctx.fillText(s,canvas.width/2,pad+lh*(i+.53)));
  if(stampCache.size>28)stampCache.delete(stampCache.keys().next().value);stampCache.set(cacheKey,canvas);return canvas;
}
function frame(force=false){
  if(!p)return;const stage=$('#stage'),pw=stage.clientWidth,ph=stage.clientHeight;if(!pw||!ph)return;
  const total=K.duration(p),t=Math.min(head,Math.max(0,total-.00001)),spans=K.spans(p),active=spans.filter(s=>s.start<=t+.000001&&s.end>t),seen=new Set(),heard=new Set();const [w,h]=K.dims(p);
  if(!spans.length&&!$('#pictures .emptyframe'))$('#pictures').innerHTML='<button class="emptyframe" data-action="assets">'+ic('media')+'<span>動画・写真を追加</span></button>';if(spans.length)$('#pictures .emptyframe')?.remove();
  active.forEach((s,idx)=>{const c=s.c,m=media[c.asset];if(!m)return;let entry=nodes.get(c.id);if(!entry){const wrap=document.createElement('div');wrap.className='pic';const inner=document.createElement('div');inner.className='fit';const el=sourceElement(m);inner.appendChild(el);const fade=document.createElement('div');fade.className='fade';wrap.append(inner,fade);$('#pictures').appendChild(wrap);entry={wrap,inner,el,fade};nodes.set(c.id,entry);}seen.add(c.id);
    const {wrap,inner,el,fade}=entry,dt=K.clamp(t-s.start,0,s.duration),f=dt/s.duration,z=c.zoom+(c.zoomEnd-c.zoom)*f,px=c.px+(c.pxEnd-c.px)*f,py=c.py+(c.pyEnd-c.py)*f;
    const odd=c.rotation%180===90;el.style.width=(odd?ph:pw)+'px';el.style.height=(odd?pw:ph)+'px';el.style.left=(pw-(odd?ph:pw))/2+'px';el.style.top=(ph-(odd?pw:ph))/2+'px';el.style.objectFit=c.fit;el.style.transform='scaleX('+(c.flip?-1:1)+') rotate('+c.rotation+'deg)';inner.style.transformOrigin=(px*100)+'% '+(py*100)+'%';inner.style.transform='scale('+z+')';const g=K.grade(c);el.style.filter='brightness('+(1+g.b)+') contrast('+g.k+') saturate('+g.s+')';wrap.style.zIndex=String(idx+1);
    wrap.style.clipPath='';wrap.style.transform='';wrap.style.opacity=1;let a=1;
    const x=s.over?K.clamp(dt/s.over,0,1):1;
    if(idx&&x<1){if(c.transition==='fade')wrap.style.opacity=x;else if(c.transition==='wipeleft')wrap.style.clipPath='inset(0 0 0 '+(100-x*100)+'%)';else if(c.transition==='wiperight')wrap.style.clipPath='inset(0 '+(100-x*100)+'% 0 0)';else if(c.transition==='slideleft')wrap.style.transform='translateX('+((1-x)*100)+'%)';else if(c.transition==='circleopen')wrap.style.clipPath='circle('+(x*75)+'% at center)';a=x;}
    if(active.length>1&&idx===0&&active[1].over)a=1-K.clamp((t-active[1].start)/active[1].over,0,1);
    fade.style.opacity=String(Math.max(c.fadeIn?Math.max(0,1-dt/c.fadeIn):0,c.fadeOut?Math.max(0,1-(s.duration-dt)/c.fadeOut):0));
    if(el.tagName==='VIDEO'){el.muted=mute||!m.audio;audioGain(el,c.gain*a*(c.aFadeIn?Math.min(1,dt/c.aFadeIn):1)*(c.aFadeOut?Math.min(1,(s.duration-dt)/c.aFadeOut):1));sync(el,c.from+dt*c.speed,c.speed,force);}
  });
  for(const l of p.layers){if(t<l.start||t>=l.start+l.duration)continue;const dt=t-l.start,m=media[l.asset];
    if(l.type==='audio'){if(!m)continue;let el=audioNodes.get(l.id);if(!el){el=sourceElement(m,true);audioNodes.set(l.id,el);}heard.add(l.id);el.muted=mute;audioGain(el,l.gain*(l.fadeIn?Math.min(1,dt/l.fadeIn):1)*(l.fadeOut?Math.min(1,(l.duration-dt)/l.fadeOut):1));sync(el,l.from+dt,1,force);continue;}
    let entry=nodes.get(l.id);if(!entry){let el=l.type==='text'?document.createElement('canvas'):sourceElement(m);if(el.tagName==='VIDEO')el.muted=true;$('#overlays').appendChild(el);entry={el};nodes.set(l.id,entry);}seen.add(l.id);const el=entry.el;el.dataset.overlay=l.id;el.style.touchAction='none';el.style.zIndex=String(p.layers.indexOf(l)+1);
    if(l.type==='text'){const can=makeStamp(l,w,h);if(entry.stamp!==can){el.width=can.width;el.height=can.height;el.getContext('2d').drawImage(can,0,0);entry.stamp=can;}el.style.width=can.width/w*pw+'px';}
    else{el.style.width=(l.width*pw)+'px';sync(el,l.from+dt,1,force);}
    el.style.left=(l.x*100)+'%';el.style.top=(l.y*100)+'%';el.style.opacity=l.opacity;
  }
  deleteUnused(nodes,seen);deleteUnused(audioNodes,heard);$('#time').textContent=moment(head);$('#total').textContent='/ '+moment(total);const nd=$('.needle');if(nd)nd.style.left=head*scrollScale+'px';
}
function pause(){if(playing){playing=false;$('#play').innerHTML=ic('play');frame(false);try{save();}catch(e){notice(e.message);}}}
window.komaPause=pause;
function seek(t,follow=false){head=K.clamp(K.round(t),0,K.duration(p));if(playing)clock=performance.now()-head*1000;frame(true);if(follow)followHead();}
function followHead(){const sc=$('#scroll'),x=head*scrollScale;if(x<sc.scrollLeft||x>sc.scrollLeft+sc.clientWidth-18)sc.scrollLeft=Math.max(0,x-sc.clientWidth*.30);}
function togglePlay(){if(playing)return pause();if(!p.clips.length)return notice('映像を追加してください');if(head>=K.duration(p)-.01)seek(0,true);playing=true;clock=performance.now()-head*1000;$('#play').innerHTML=ic('pause');const tick=()=>{if(!playing)return;head=(performance.now()-clock)/1000;if(head>=K.duration(p)){head=K.duration(p);pause();return;}frame(false);followHead();requestAnimationFrame(tick);};tick();}
function select(id,jump=false){pause();sel=id;const c=activeClip(),l=activeLayer();if(jump){const s=K.spans(p).find(s=>s.c===c);if(s&&(head<s.start||head>=s.end))head=s.start;if(l&&(head<l.start||head>=l.start+l.duration))head=l.start;}draw();save();}
function snapped(t,omit=''){const frame=Math.round(t*p.fps)/p.fps;if(!snap)return frame;const candidates=[0,head,...p.markers.map(m=>m.t)];for(const s of K.spans(p))if(s.c.id!==omit)candidates.push(s.start,s.end);for(const l of p.layers)if(l.id!==omit)candidates.push(l.start,l.start+l.duration);
  const hit=candidates.sort((a,b)=>Math.abs(t-a)-Math.abs(t-b))[0];return Math.abs(t-hit)<Math.min(.13,6/scrollScale)?hit:frame;}
let drag=null,lastTouch={id:'',t:0};
$('#tracks').addEventListener('pointerdown',ev=>{
  if(ev.button>0)return;const item=ev.target.closest('[data-item]'),flag=ev.target.closest('[data-flag]');if(flag){const m=p.markers.find(m=>m.id===flag.dataset.flag);if(m)seek(m.t);return;}
  const pos=(ev.clientX-$('#tracks').getBoundingClientRect().left)/scrollScale;const side=ev.target.dataset.side;
  if(side&&item){ev.preventDefault();pause();const c=activeClip(),l=activeLayer();drag={id:item.dataset.item,side,x:ev.clientX,c:c?{...c}:null,l:l?{...l}:null,before:snapshot()};$('#tracks').setPointerCapture(ev.pointerId);return;}
  drag={id:item?.dataset.item||'',x:ev.clientX,y:ev.clientY,pos};if(!item&&ev.target.closest('.ruler')){pause();seek(pos);drag.scrub=true;$('#tracks').setPointerCapture(ev.pointerId);}
});
$('#tracks').addEventListener('pointermove',ev=>{if(!drag)return;if(drag.scrub){seek((ev.clientX-$('#tracks').getBoundingClientRect().left)/scrollScale);return;}if(!drag.side)return;
  if(drag.side==='move'){
    const node=$('#tracks [data-item="'+CSS.escape(drag.id)+'"]');if(node){node.style.transform='translateX('+(ev.clientX-drag.x)+'px)';node.style.zIndex=6;}drag.last=ev.clientX;return;
  }
  const dx=(ev.clientX-drag.x)/scrollScale,c=activeClip(),l=activeLayer(),left=drag.side==='left';
  if(c&&drag.c){const a=drag.c,m=media[c.asset],max=m.kind==='image'?86400:m.duration;
    if(left)c.from=K.round(K.clamp(Math.round((a.from+dx*a.speed)*p.fps)/p.fps,0,a.to-a.speed/p.fps));else c.to=K.round(K.clamp(Math.round((a.to+dx*a.speed)*p.fps)/p.fps,a.from+a.speed/p.fps,max));
  }else if(l&&drag.l){const a=drag.l,source=['audio','video'].includes(l.type);if(left){const st=K.clamp(snapped(a.start+dx,l.id),source?Math.max(0,a.start-a.from):0,a.start+a.duration-1/p.fps);l.start=st;l.duration=K.round(a.duration-(st-a.start));if(source)l.from=K.round(a.from+st-a.start);}
    else l.duration=K.round(K.clamp(snapped(a.start+a.duration+dx,l.id)-a.start,1/p.fps,source?media[l.asset].duration-a.from:86400));}timeline();frame(true);
});
function endGesture(ev,cancelled=false){if(!drag)return;const d=drag;drag=null;if(d.side==='move'){
    draw();if(cancelled||Math.abs((d.last||d.x)-d.x)<3)return;
    const dx=((d.last||d.x)-d.x)/scrollScale;
    try{edit(()=>{if(d.l){activeLayer().start=K.round(K.clamp(snapped(d.l.start+dx,d.id),0,Math.max(0,K.duration(p)-1/p.fps)));}
      else if(d.c){const spans=K.spans(p),i=p.clips.findIndex(c=>c.id===d.id),mid=spans[i].start+spans[i].duration/2+dx;const position=spans.filter(s=>s.c.id!==d.id&&s.start+s.duration/2<mid).length;p.clips.splice(position,0,p.clips.splice(i,1)[0]);}
    },'配置を変更しました');}catch(err){notice(err.message);}return;
  }
  if(d.side){if(cancelled){replace(JSON.parse(d.before));draw();return;}try{K.validate(p,media);if(snapshot()!==d.before){past.push(d.before);future=[];pending=null;save();}}catch(e){replace(JSON.parse(d.before));notice(e.message);}draw();return;}
  if(cancelled||d.scrub||Math.abs(ev.clientX-d.x)>7||Math.abs(ev.clientY-d.y)>8)return;
  if(d.id){select(d.id,true);if(lastTouch.id===d.id&&performance.now()-lastTouch.t<380)show('details');lastTouch={id:d.id,t:performance.now()};}else{pause();seek(d.pos);}
}
$('#tracks').addEventListener('pointerup',e=>endGesture(e));$('#tracks').addEventListener('pointercancel',e=>endGesture(e,true));
if(globalThis.ResizeObserver)new ResizeObserver(()=>{if(p){fit();frame(false);}}).observe($('#monitor'));window.addEventListener('resize',()=>{if(p){fit();frame();timeline();}});

// Drag a caption or picture in the viewer. A two-finger gesture also changes its size.
const overlayPointers=new Map();let overlayGesture=null;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
$('#overlays').addEventListener('pointerdown',ev=>{
  const target=ev.target.closest('[data-overlay]');if(!target)return;const id=target.dataset.overlay;
  if(!overlayGesture){pause();sel=id;const l=activeLayer();if(!l)return;overlayGesture={id,before:snapshot(),x:l.x,y:l.y,px:ev.clientX,py:ev.clientY};timeline();}
  if(overlayGesture.id!==id)return;
  ev.preventDefault();overlayPointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});target.setPointerCapture(ev.pointerId);
  if(overlayPointers.size===2){const pts=Array.from(overlayPointers.values());const l=activeLayer();overlayGesture.dist=distance(pts[0],pts[1]);overlayGesture.size=l.type==='text'?l.size:l.width;}
});
$('#overlays').addEventListener('pointermove',ev=>{
  if(!overlayGesture||!overlayPointers.has(ev.pointerId))return;const l=activeLayer(),g=overlayGesture;if(!l)return;overlayPointers.set(ev.pointerId,{x:ev.clientX,y:ev.clientY});
  if(overlayPointers.size===2&&g.dist>0){const pts=Array.from(overlayPointers.values()),factor=distance(pts[0],pts[1])/g.dist;if(l.type==='text')l.size=K.round(K.clamp(g.size*factor,.015,.25));else l.width=K.round(K.clamp(g.size*factor,.05,1.5));}
  else{l.x=K.round(K.clamp(g.x+(ev.clientX-g.px)/$('#stage').clientWidth,0,1));l.y=K.round(K.clamp(g.y+(ev.clientY-g.py)/$('#stage').clientHeight,0,1));}
  frame(false);
});
function endOverlay(ev){if(!overlayGesture)return;overlayPointers.delete(ev.pointerId);if(overlayPointers.size){const p0=Array.from(overlayPointers.values())[0],l=activeLayer();Object.assign(overlayGesture,{x:l.x,y:l.y,px:p0.x,py:p0.y,dist:0});return;}
  const before=overlayGesture.before;overlayGesture=null;if(ev.type==='pointercancel')replace(JSON.parse(before));else if(before!==snapshot()){past.push(before);future=[];pending=null;}draw();save();
}
$('#overlays').addEventListener('pointerup',endOverlay);$('#overlays').addEventListener('pointercancel',endOverlay);
