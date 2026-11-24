/* Koma Studio – timeline arithmetic and deterministic render plan. */
'use strict';
const Koma = (() => {
  const id = () => (globalThis.crypto?.randomUUID?.() || (Date.now().toString(36)+Math.random().toString(36).slice(2)));
  const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
  const num=(v,def=0)=>Number.isFinite(Number(v))?Number(v):def;
  const val=(v,lo,hi,def)=>clamp(num(v,def),lo,hi);
  const round=n=>Math.round(n*1e5)/1e5;
  const f=n=>String(round(n));
  const ratios={'16:9':[16,9],'9:16':[9,16],'1:1':[1,1],'4:5':[4,5],'2.39:1':[2.39,1]};
  const transitions={cut:'カット',fade:'ディゾルブ',wipeleft:'左ワイプ',wiperight:'右ワイプ',slideleft:'左スライド',circleopen:'円形'};
  const looks={natural:'標準',film:'シネマ',vivid:'ビビッド',mono:'白黒',soft:'ソフト'};
  const project=(name='新規プロジェクト')=>({id:id(),version:1,name,ratio:'16:9',resolution:1080,fps:30,quality:20,codec:'h264',bg:'#11151b',clips:[],layers:[],markers:[]});
  const clip=(asset,meta)=>({id:id(),asset,from:0,to:meta.kind==='image'?4:meta.duration,speed:1,gain:1,rotation:0,flip:false,fit:'contain',look:'natural',bright:0,contrast:1,sat:1,fadeIn:0,fadeOut:0,aFadeIn:0,aFadeOut:0,zoom:1,zoomEnd:1,px:.5,py:.5,pxEnd:.5,pyEnd:.5,transition:'cut',overlap:.5});
  const layer=(type,start,asset='')=>({id:id(),type,asset,start,duration:3,from:0,x:.5,y:type==='text'?.82:.5,width:.38,opacity:1,text:'テキスト',size:.056,color:'#ffffff',back:'#152026',box:true,bold:true,font:'sans-serif',gain:.7,fadeIn:0,fadeOut:0,duck:false});
  const len=c=>Math.max(.001,(c.to-c.from)/c.speed);
  function spans(p) {
    let end=0;
    return p.clips.map((c,i)=>{
      const d=len(c), t=i&&c.transition!=='cut'?Math.min(val(c.overlap,.03,8,.5),d*.48,len(p.clips[i-1])*.48):0;
      const start=round(end-t); end=round(start+d);
      return {c,start,end,duration:d,over:t};
    });
  }
  function duration(p){const s=spans(p);return s.length?s[s.length-1].end:0;}
  function dims(p){
    const [rw,rh]=ratios[p.ratio]||ratios['16:9']; const s=p.resolution;
    return rw>=rh?[Math.round(s*rw/rh/2)*2,s]:[s,Math.round(s*rh/rw/2)*2];
  }
  function grade(c){
    let b=c.bright,k=c.contrast,s=c.sat;
    if(c.look==='film'){k*=1.15;s*=.78;b-=.025;}
    if(c.look==='vivid'){k*=1.09;s*=1.3;}
    if(c.look==='mono')s=0;
    if(c.look==='soft'){b+=.045;k*=.89;s*=.88;}
    return {b:clamp(b,-1,1),k:clamp(k,.01,3),s:clamp(s,0,3)};
  }
  const safeColor=(s,def)=>/^#[0-9a-f]{6}$/i.test(s||'')?s:def;
  function validate(p,media){
    if(!p||p.version!==1||!Array.isArray(p.clips)||!Array.isArray(p.layers))throw Error('プロジェクト形式を確認してください。');
    if(!ratios[p.ratio]||![24,25,30,50,60].includes(p.fps)||![360,720,1080,2160].includes(p.resolution))throw Error('出力設定が範囲外です。');
    if(p.clips.length>240||p.layers.length>800||p.markers?.length>1000)throw Error('このプロジェクトの編集数上限を超えました。');
    if(!Array.isArray(p.markers))p.markers=[];
    const seen=new Set();
    for(const o of [...p.clips,...p.layers]){if(!o.id||seen.has(o.id))throw Error('項目IDが重複しています。');seen.add(o.id);}
    for(const c of p.clips){
      const m=media[c.asset];
      if(!m||!['image','video'].includes(m.kind))throw Error('この端末に元の映像素材がありません。');
      if(!Number.isFinite(c.to)||!Number.isFinite(c.from)||c.from<0||c.to<=c.from||c.to>(m.kind==='image'?86400:m.duration)+.06||!Number.isFinite(c.speed)||c.speed<.25||c.speed>4)throw Error('クリップの範囲または速度を確認してください。');
      if(!Object.hasOwn(transitions,c.transition)||!Object.hasOwn(looks,c.look)||![0,90,180,270].includes(c.rotation)||!['contain','cover'].includes(c.fit))throw Error('映像設定が範囲外です。');
      for(const [key,lo,hi] of [['gain',0,3],['bright',-.5,.5],['contrast',.1,2],['sat',0,2],['zoom',1,4],['zoomEnd',1,4],['px',0,1],['pxEnd',0,1],['py',0,1],['pyEnd',0,1],['fadeIn',0,60],['fadeOut',0,60],['aFadeIn',0,60],['aFadeOut',0,60],['overlap',.03,8]])if(!Number.isFinite(c[key])||c[key]<lo||c[key]>hi)throw Error('クリップ設定の数値が範囲外です。');
    }
    for(const l of p.layers){
      if(!['text','audio','image','video'].includes(l.type)||!Number.isFinite(l.start)||l.start<0||!Number.isFinite(l.duration)||l.duration<=0)throw Error('レイヤーの時間が無効です。');
      if(l.type!=='text' && (!media[l.asset]||(l.type==='audio'?!media[l.asset].audio:media[l.asset].kind!==l.type)))throw Error('レイヤーの素材が見つかりません。');
      for(const [k,lo,hi] of [['x',0,1],['y',0,1],['size',.015,.25],['width',.05,1.5],['opacity',0,1],['gain',0,3],['from',0,86400],['fadeIn',0,60],['fadeOut',0,60]])if(!Number.isFinite(l[k])||l[k]<lo||l[k]>hi)throw Error('レイヤー設定の数値が範囲外です。');
      if(l.type==='text'&&(typeof l.text!=='string'||l.text.length>2000))throw Error('字幕は1項目2,000文字までです。');
      if(['audio','video'].includes(l.type)&&l.from+l.duration>media[l.asset].duration+.06)throw Error('レイヤーが元素材の長さを超えています。');
    }
    return p;
  }
  function tempos(speed){
    const t=[]; while(speed>2){t.push('atempo=2');speed/=2;}while(speed<.5){t.push('atempo=0.5');speed*=2;}
    if(Math.abs(speed-1)>.00001)t.push('atempo='+f(speed));return t;
  }
  function plan(original,media,preview=false){
    const p=validate(JSON.parse(JSON.stringify(original)),media);
    if(!p.clips.length)throw Error('映像または写真を追加してください。');
    if(preview){p.resolution=360;p.fps=Math.min(p.fps,30);p.quality=24;p.codec='h264';}
    const [w,h]=dims(p), fps=p.fps, all=spans(p), total=duration(p), jobs=[], lists={}, stamps=[];
    const prefix=['-hide_banner','-loglevel','warning','-y','-filter_complex_threads','2','-filter_threads','2'];
    const work=name=>'@w/'+name, source=id=>'@m/'+id;
    const video=['-c:v','libx264','-threads','2','-preset','ultrafast','-crf','16','-pix_fmt','yuv420p'];
    const add=(label,secs,args,file)=>jobs.push({label,secs,args:[...prefix,...args,work(file)]});
    let segments=all.map((s,i)=>{
      const c=s.c,m=media[c.asset],d=s.duration,file='clip'+i+'.mkv',args=[];
      if(m.kind==='image')args.push('-loop','1','-framerate',String(fps),'-t',f(c.to-c.from));
      else args.push('-ss',f(c.from),'-t',f(c.to-c.from));
      args.push('-threads','2','-i',source(c.asset));
      const g=grade(c),vf=['setpts=(PTS-STARTPTS)/'+f(c.speed)];
      if(c.rotation===90)vf.push('transpose=clock');if(c.rotation===180)vf.push('hflip','vflip');if(c.rotation===270)vf.push('transpose=cclock');if(c.flip)vf.push('hflip');
      vf.push('fps='+fps,'scale='+w+':'+h+':force_original_aspect_ratio='+(c.fit==='cover'?'increase':'decrease')+':force_divisible_by=2');
      vf.push(c.fit==='cover'?'crop='+w+':'+h:'pad='+w+':'+h+':(ow-iw)/2:(oh-ih)/2:color='+safeColor(p.bg,'#11151b').replace('#','0x'));
      vf.push('setsar=1');
      if(c.zoom!==1||c.zoomEnd!==1){
        const t='min(1,on/'+Math.max(1,Math.round(d*fps)-1)+')';
        const interp=(a,b)=>f(a)+'+('+f(b-a)+')*'+t;
        vf.push("zoompan=z='"+interp(c.zoom,c.zoomEnd)+"':x='(iw-iw/zoom)*("+interp(c.px,c.pxEnd)+")':y='(ih-ih/zoom)*("+interp(c.py,c.pyEnd)+")':d=1:s="+w+'x'+h+':fps='+fps);
      }
      vf.push('eq=brightness='+f(g.b)+':contrast='+f(g.k)+':saturation='+f(g.s),'tpad=stop_mode=clone:stop_duration='+f(d),'trim=duration='+f(d));
      if(c.fadeIn)vf.push('fade=t=in:d='+f(Math.min(c.fadeIn,d)));
      if(c.fadeOut)vf.push('fade=t=out:st='+f(Math.max(0,d-c.fadeOut))+':d='+f(Math.min(c.fadeOut,d)));
      const a=m.audio?'[0:a:0]asetpts=PTS-STARTPTS'+(tempos(c.speed).length?','+tempos(c.speed).join(','):''):'anullsrc=r=48000:cl=stereo';
      const af=[a,'aresample=48000','aformat=sample_fmts=fltp:channel_layouts=stereo','volume='+f(c.gain),'apad','atrim=duration='+f(d),'asetpts=PTS-STARTPTS'];
      if(c.aFadeIn)af.push('afade=t=in:d='+f(Math.min(c.aFadeIn,d)));
      if(c.aFadeOut)af.push('afade=t=out:st='+f(Math.max(0,d-c.aFadeOut))+':d='+f(Math.min(c.aFadeOut,d)));
      args.push('-filter_complex','[0:v:0]'+vf.join(',')+'[v];'+af.join(',')+'[a]','-map','[v]','-map','[a]',...video,'-c:a','pcm_s16le','-t',f(d));
      add('映像 '+(i+1)+' / '+all.length,d,args,file);return {file,d,t:s.over,fx:c.transition};
    });
    let serial=0;
    function join(group){
      if(group.length===1)return group[0];
      const d=group.reduce((t,v,i)=>t+v.d-(i?v.t:0),0),file='join'+(++serial)+'.mkv',args=[],graph=[];
      if(group.slice(1).every(s=>!s.t)){
        const fileList='join'+serial+'.txt';lists[fileList]=group.map(s=>s.file);
        args.push('-f','concat','-safe','0','-i',work(fileList),'-map','0:v:0','-map','0:a:0','-c','copy');
      }else{
        group.forEach((s,i)=>{args.push('-threads','2','-i',work(s.file)); graph.push('['+i+':v]fps='+fps+',format=yuv420p,settb=AVTB,setpts=PTS-STARTPTS[v'+i+']','['+i+':a]atrim=duration='+f(s.d)+',asetpts=PTS-STARTPTS[a'+i+']');});
        let v='v0',a='a0',pos=group[0].d;
        for(let i=1;i<group.length;i++){const s=group[i],nv='jv'+i,na='ja'+i;
          if(s.t){graph.push('['+v+'][v'+i+']xfade=transition='+s.fx+':duration='+f(s.t)+':offset='+f(pos-s.t)+'['+nv+']','['+a+'][a'+i+']acrossfade=d='+f(s.t)+':c1=tri:c2=tri['+na+']');}
          else graph.push('['+v+']['+a+'][v'+i+'][a'+i+']concat=n=2:v=1:a=1['+nv+']['+na+']');
          v=nv;a=na;pos+=s.d-s.t;
        }
        args.push('-filter_complex',graph.join(';'),'-map','['+v+']','-map','['+a+']',...video,'-c:a','pcm_s16le','-t',f(d));
      }
      add('クリップを接続',d,args,file);return {file,d,t:group[0].t,fx:group[0].fx};
    }
    while(segments.length>1){const next=[];const batch=segments.slice(1).some(s=>s.t)?4:40;for(let i=0;i<segments.length;i+=batch)next.push(join(segments.slice(i,i+batch)));segments=next;}
    let base=segments[0].file;
    const active=p.layers.filter(l=>l.start<total);
    const stacked=active.filter(l=>l.type!=='audio'),music=active.filter(l=>l.type==='audio'),visual=[];
    // Non-overlapping captions share a variable-frame-rate transparent stream.
    // This keeps hundreds of captions in one compositing pass while retaining the visual stack order.
    for(let i=0;i<stacked.length;){
      if(stacked[i].type!=='text'){visual.push(stacked[i++]);continue;}
      let end=i+1;while(end<stacked.length&&stacked[end].type==='text')end++;
      const run=stacked.slice(i,end);i=end;if(run.length<3){visual.push(...run);continue;}
      const lastFrame=Math.max(1,Math.ceil(total*fps-.000001)),bound=new Set([0,lastFrame]);
      const eventFrame=t=>clamp(Math.ceil(t*fps-.000001),0,lastFrame);
      for(const l of run){bound.add(eventFrame(l.start));bound.add(eventFrame(l.start+l.duration));}
      const times=Array.from(bound).sort((a,b)=>a-b),entries=[],states=new Map(),seq='titles'+visual.length,file=seq+'.txt';
      for(let j=0;j<times.length-1;j++){const n=times[j],layers=run.filter(l=>eventFrame(l.start)<=n&&n<eventFrame(l.start+l.duration)),key=layers.map(l=>l.id).join('|');
        let png=states.get(key);if(!png){png=seq+'_'+states.size+'.png';states.set(key,png);stamps.push({name:png,layers,w,h});}
        entries.push({file:png,seconds:round((times[j+1]-n)/fps),fps});
      }
      if(entries.length){entries.push({file:entries[entries.length-1].file,fps});lists[file]=entries;visual.push({type:'textSequence',list:file,start:0,duration:total,x:.5,y:.5,opacity:1});}
    }
    for(let offset=0;offset<visual.length;offset+=6){
      const group=visual.slice(offset,offset+6),args=['-threads','2','-i',work(base)],graph=[],file='layer'+offset+'.mkv';
      let prev='0:v';
      group.forEach((l,i)=>{
        const d=Math.min(l.duration,total-l.start),idx=i+1; let vf='';
        if(l.type==='textSequence'){args.push('-f','concat','-safe','0','-i',work(l.list));}
        else if(l.type==='text'){
          const stamp='text'+(offset+i)+'.png';stamps.push({name:stamp,layer:l,w,h});args.push('-i',work(stamp));
        }else{
          if(l.type==='video')args.push('-ss',f(l.from),'-t',f(d));
          args.push('-threads','2','-i',source(l.asset));
          vf='scale='+Math.max(2,Math.round(w*l.width/2)*2)+':-2,';
        }
        graph.push('['+idx+':v]'+vf+'format=rgba,colorchannelmixer=aa='+f(l.opacity)+',setpts=PTS-STARTPTS+'+f(l.start)+'/TB[ov'+i+']');
        graph.push('['+prev+'][ov'+i+"]overlay=x='W*"+f(l.x)+"-w/2':y='H*"+f(l.y)+"-h/2':enable='gte(t,"+f(l.start)+")*lt(t,"+f(l.start+d)+")':eof_action=repeat:repeatlast=1[lv"+i+']');prev='lv'+i;
      });
      args.push('-filter_complex',graph.join(';'),'-map','['+prev+']','-map','0:a:0',...video,'-c:a','copy','-t',f(total));add('字幕・合成',total,args,file);base=file;
    }
    // Mix all beds against the original dialogue for consistent sidechain ducking.
    // Groups cap the number of simultaneously decoded external tracks.
    const dialogue=segments[0].file;
    for(let offset=0;offset<music.length;offset+=6){
      const group=music.slice(offset,offset+6),args=['-i',work(base),'-i',work(dialogue)],graph=[],labels=[],file='mix'+offset+'.mkv';
      group.forEach((l,i)=>{
        const d=Math.min(l.duration,total-l.start);args.push('-ss',f(l.from),'-t',f(d),'-i',source(l.asset));
        const af=['asetpts=PTS-STARTPTS','aresample=48000','aformat=channel_layouts=stereo','volume='+f(l.gain)];
        if(l.fadeIn)af.push('afade=t=in:d='+f(Math.min(d,l.fadeIn)));
        if(l.fadeOut)af.push('afade=t=out:st='+f(Math.max(0,d-l.fadeOut))+':d='+f(Math.min(d,l.fadeOut)));
        af.push('adelay='+Math.round(l.start*1000)+':all=1');
        graph.push('['+(i+2)+':a:0]'+af.join(',')+'[m'+i+']');
        if(l.duck){graph.push('[m'+i+'][1:a:0]sidechaincompress=threshold=0.035:ratio=7:attack=20:release=300[duck'+i+']');labels.push('[duck'+i+']');}
        else labels.push('[m'+i+']');
      });
      graph.push('[0:a:0]'+labels.join('')+'amix=inputs='+(1+group.length)+':duration=first:normalize=0,alimiter=limit=0.96:latency=1[aout]');
      args.push('-filter_complex',graph.join(';'),'-map','0:v:0','-map','[aout]','-c:v','copy','-c:a','pcm_s16le','-t',f(total));add('オーディオミックス',total,args,file);base=file;
    }
    const hevc=p.codec==='hevc';const final=['-threads','2','-i',work(base),'-map','0:v:0','-map','0:a:0','-c:v',hevc?'libx265':'libx264','-threads','2','-preset',preview?'ultrafast':'veryfast','-crf',String(val(p.quality,15,28,20)),'-pix_fmt','yuv420p','-c:a','aac','-b:a','192k','-ar','48000','-movflags','+faststart','-t',f(total)];
    if(hevc)final.push('-x265-params','pools=2:frame-threads=2','-tag:v','hvc1');
    add(preview?'確認用MP4':'MP4を仕上げています',total,final,'result.mp4');
    return {jobs,lists,stamps,total,w,h,preview,title:p.name};
  }
  function split(p,index,time){
    const s=spans(p)[index];if(!s)throw Error('クリップを選択してください。');
    const c=s.c,pos=round(c.from+(time-s.start)*c.speed),min=c.speed/p.fps;
    if(pos<c.from+min-.00001||pos>c.to-min+.00001)throw Error('再生位置をクリップの内側に合わせてください。');
    const b={...c,id:id(),from:pos,transition:'cut',fadeIn:0,aFadeIn:0};
    const t=(pos-c.from)/(c.to-c.from);
    for(const [a,e] of [['zoom','zoomEnd'],['px','pxEnd'],['py','pyEnd']]){const mid=round(c[a]+(c[e]-c[a])*t);c[e]=mid;b[a]=mid;}
    c.to=pos;c.fadeOut=0;c.aFadeOut=0;p.clips.splice(index+1,0,b);return b.id;
  }
  function srtIn(text){
    const sec=t=>{const m=/^(\d+):(\d\d):(\d\d)[,.](\d{1,3})$/.exec(t);if(!m)return NaN;return +m[1]*3600 + +m[2]*60 + +m[3]+Number(m[4].padEnd(3,'0'))/1000;};
    return text.replace(/^\uFEFF/,'').replace(/\r/g,'').trim().split(/\n\s*\n/).map(block=>{
      const lines=block.split('\n');const i=lines.findIndex(l=>l.includes('-->'));if(i<0)throw Error('SRTの時刻行が無効です。');
      const [left,right]=lines[i].split(/\s*-->\s*/);const a=sec(left.trim()),b=sec(right.trim().split(' ')[0]);
      const body=lines.slice(i+1).join('\n').trim();if(!(b>a)||!body)throw Error('SRTの字幕または区間が無効です。');
      return {...layer('text',a),duration:round(b-a),text:body};
    });
  }
  function srtOut(p){const ts=t=>{let n=Math.round(t*1000);const pad=(x,w)=>String(x).padStart(w,'0');return pad(Math.floor(n/3600000),2)+':'+pad(Math.floor(n/60000)%60,2)+':'+pad(Math.floor(n/1000)%60,2)+','+pad(n%1000,3);};
    return p.layers.filter(l=>l.type==='text').sort((a,b)=>a.start-b.start).map((l,i)=>(i+1)+'\n'+ts(l.start)+' --> '+ts(l.start+l.duration)+'\n'+l.text+'\n').join('\n');}
  return {id,clamp,num,val,round,ratios,transitions,looks,project,clip,layer,len,spans,duration,dims,grade,safeColor,validate,plan,split,srtIn,srtOut};
})();
if(typeof module!=='undefined')module.exports=Koma;
