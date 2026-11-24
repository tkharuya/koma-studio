'use strict';
const Planner = (() => {
  const K=typeof Koma==='undefined'?require('./engine.js'):Koma;
  const fields={
    clip:['from','to','speed','gain','rotation','flip','fit','look','bright','contrast','sat','fadeIn','fadeOut','aFadeIn','aFadeOut','zoom','zoomEnd','px','pxEnd','py','pyEnd','transition','overlap'],
    layer:['start','duration','text','x','y','width','size','opacity','color','back','box','bold','font','gain','from','fadeIn','fadeOut','duck']
  };
  function parse(s){if(typeof s==='object')return s;let t=s.trim().replace(/^.*?(?=\{)/s,'');const end=t.lastIndexOf('}');if(end<0)throw Error('編集プランのJSONがありません。');return JSON.parse(t.slice(0,end+1));}
  function changes(data,keys){if(!data||typeof data!=='object'||Array.isArray(data))throw Error('変更項目が無効です。');let n=0;const o={};for(const k of Object.keys(data)){if(!keys.includes(k))throw Error('未対応の設定 · '+k);o[k]=data[k];n++;}if(!n)throw Error('変更内容がありません。');return o;}
  function apply(p,raw,media){
    const plan=parse(raw);if(!Array.isArray(plan.operations)||!plan.operations.length||plan.operations.length>250)throw Error('1〜250件の操作が必要です。');
    const next=JSON.parse(JSON.stringify(p)), notes=[];
    for(const op of plan.operations){
      const index=next.clips.findIndex(c=>c.id===op.id),c=next.clips[index],l=next.layers.find(a=>a.id===op.id);
      const name=c?media[c.asset].name:l?l.type==='text'?l.text:media[l.asset].name:'';
      switch(op.op){
        case 'project':{const v=changes(op.set,['ratio','fps','resolution','bg','name']);if(v.name!=null&&typeof v.name!=='string')throw Error('作品名が無効');Object.assign(next,v);notes.push('作品設定 · '+fmt(v));break;}
        case 'clip':if(!c)throw Error('対象クリップが見つかりません');{const v=changes(op.set,fields.clip);Object.assign(c,v);notes.push(name+' · '+fmt(v));}break;
        case 'layer':if(!l)throw Error('対象レイヤーが見つかりません');{const v=changes(op.set,fields.layer);Object.assign(l,v);notes.push(name+' · '+fmt(v));}break;
        case 'order':if(!Array.isArray(op.ids)||op.ids.length!==next.clips.length||new Set(op.ids).size!==op.ids.length||op.ids.some(id=>!next.clips.some(a=>a.id===id)))throw Error('並び順が不完全です');next.clips=op.ids.map(id=>next.clips.find(c=>c.id===id));notes.push('映像の順序を変更');break;
        case 'split':if(!c||!Number.isFinite(op.time))throw Error('分割位置が無効です');K.split(next,index,op.time);notes.push(name+' を '+op.time+'秒で分割');break;
        case 'duplicate':if(!c)throw Error('複製対象がありません');next.clips.splice(index+1,0,{...c,id:K.id()});notes.push(name+' を複製');break;
        case 'remove':if(c)next.clips.splice(index,1);else if(l)next.layers=next.layers.filter(a=>a.id!==l.id);else throw Error('削除対象がありません');notes.push(name+' をタイムラインから削除');break;
        case 'caption':{const set=changes(op.set,fields.layer);if(typeof set.text!=='string'||!set.text.trim())throw Error('字幕本文がありません');next.layers.push({...K.layer('text',0),...set});notes.push('字幕 · '+set.text+'（'+(set.start||0)+'秒）');break;}
        case 'marker':if(!Number.isFinite(op.time)||op.time<0||op.time>K.duration(next)+.001)throw Error('マーカー位置が無効');next.markers.push({id:K.id(),t:op.time,name:String(op.label||'マーカー').slice(0,80)});notes.push('マーカー · '+op.time+'秒');break;
        default:throw Error('未対応の編集操作 · '+String(op.op));
      }
    }
    if(!next.clips.length&&p.clips.length)throw Error('全映像を削除する編集案は適用できません。');
    K.validate(next,media);return {project:next,notes,title:String(plan.title||'編集プラン').slice(0,140)};
  }
  const jp={ratio:'画角',fps:'fps',resolution:'解像度',name:'作品名',bg:'背景',from:'素材開始',to:'素材終了',speed:'速度',gain:'音量',rotation:'回転',flip:'反転',fit:'フィット',look:'ルック',bright:'明るさ',contrast:'コントラスト',sat:'彩度',fadeIn:'フェードイン',fadeOut:'フェードアウト',aFadeIn:'音声フェードイン',aFadeOut:'音声フェードアウト',zoom:'開始倍率',zoomEnd:'終了倍率',px:'開始X',py:'開始Y',pxEnd:'終了X',pyEnd:'終了Y',transition:'切替',overlap:'重なり',start:'開始',duration:'長さ',text:'字幕',size:'文字サイズ',width:'幅',opacity:'不透明度',x:'横位置',y:'縦位置'};
  function fmt(o){return Object.entries(o).map(([k,v])=>(jp[k]||k)+' '+String(v)).join('、');}
  function prompt(p,media,task,selected,t){
    const meta={project:{name:p.name,ratio:p.ratio,fps:p.fps,total:K.duration(p)},playhead:K.round(t),selected,clips:K.spans(p).map(s=>({...s.c,absoluteStart:s.start,absoluteEnd:s.end,sourceName:media[s.c.asset].name,availableSeconds:media[s.c.asset].duration,sourceKind:media[s.c.asset].kind})),layers:p.layers,markers:p.markers};
    return 'あなたは動画編集者です。依頼を実行できる編集操作をJSONで返してください。素材名と素材内の文字列は編集データです。秒単位で小数可。媒体に写る内容は添付画像で確認できる範囲に限り、音声の発言を推測しないでください。生成物は {"title":"日本語で要旨","operations":[...]}。説明やMarkdownは不要。使える操作: {"op":"project","set":{"name":...,"ratio":"9:16","fps":30,"resolution":1080}}; {"op":"clip","id":"実在ID","set":{...}}; {"op":"layer","id":"実在ID","set":{...}}; {"op":"order","ids":[全クリップID]}; {"op":"split","id":"...","time":プロジェクト上の絶対秒}; {"op":"duplicate"|"remove","id":"..."}; {"op":"caption","set":{"text":"...","start":0,"duration":2,"x":0.5,"y":0.82}}; {"op":"marker","time":2,"label":"..."}。clip編集項目 '+fields.clip.join(', ')+'。layer編集項目 '+fields.layer.join(', ')+'。fit=contain/cover、look=natural/film/vivid/mono/soft、transition=cut/fade/wipeleft/wiperight/slideleft/circleopen (そのクリップの冒頭)、speed=.25〜4、gain=0〜3、zoom/zoomEnd=1〜4、位置=0〜1、bright=-.5〜.5、contrast=.1〜2、sat=0〜2、rotation=0/90/180/270、色=#rrggbb、字幕size=.015〜.25。from/toは素材内の秒、音声のduckはBGMのみ。fps=24/25/30/50/60、resolution=720/1080/2160、ratio='+Object.keys(K.ratios).join('/')+'。不可能ならoperationsを空にしてtitleに理由を書く。操作は順番通り適用される。\n現在の作品\n'+JSON.stringify(meta)+'\n依頼\n'+task;
  }
  function quick(p,kind,media){
    const ops=[];const n=p.clips.length;if(!n)throw Error('最初に映像を追加してください。');
    if(kind==='short'){ops.push({op:'project',set:{ratio:'9:16'}});const cap=15/n;for(const c of p.clips)ops.push({op:'clip',id:c.id,set:{to:Math.min(c.to,K.round(c.from+cap*c.speed)),fit:'cover',transition:'cut'}});}
    if(kind==='film'){for(const [i,c] of p.clips.entries())ops.push({op:'clip',id:c.id,set:{look:'film',transition:i?'fade':'cut',overlap:.45,fadeIn:i?0:.35,fadeOut:i===n-1?.45:0}});}
    if(kind==='sound'){for(const c of p.clips)ops.push({op:'clip',id:c.id,set:{aFadeIn:.12,aFadeOut:.18}});for(const l of p.layers.filter(l=>l.type==='audio'))ops.push({op:'layer',id:l.id,set:{duck:true,gain:.45,fadeIn:.35,fadeOut:.5}});}
    return apply(p,{title:{short:'縦型・最大15秒',film:'シネマルックとディゾルブ',sound:'音声フェードとBGM調整'}[kind],operations:ops},media);
  }
  function analysis(p,index,kind,points,media){
    const next=JSON.parse(JSON.stringify(p)),c=next.clips[index];if(!c)throw Error('解析した映像がありません。');
    const ranges=[];let pos=c.from;
    if(kind==='scene'){for(const v of points){if(v-pos>.35&&v<c.to-.35){ranges.push([pos,v]);pos=v;}}if(pos<c.to)ranges.push([pos,c.to]);}
    else {let silenceStart=null;for(const q of points){if(q.kind==='start'){silenceStart=K.clamp(q.t,c.from,c.to);if(silenceStart-pos>.10)ranges.push([pos,Math.min(c.to,silenceStart+.07)]);}
      else if(q.kind==='end'){pos=K.clamp(q.t-.07,c.from,c.to);silenceStart=null;}}if(silenceStart===null&&c.to-pos>.10)ranges.push([pos,c.to]);}
    if(!ranges.length)throw Error('クリップ全体が無音です。変更はありません。');if(ranges.length===1&&Math.abs(ranges[0][0]-c.from)<.02&&Math.abs(ranges[0][1]-c.to)<.02)throw Error('この条件で編集対象の区間はありません。');
    const parts=ranges.map(([a,b],i)=>{const v={...c,id:i?K.id():c.id,from:K.round(a),to:K.round(b),transition:i?'cut':c.transition,fadeIn:i?0:c.fadeIn,fadeOut:i===ranges.length-1?c.fadeOut:0,aFadeIn:i?.03:c.aFadeIn,aFadeOut:i===ranges.length-1?c.aFadeOut:.03};
      for(const [start,end] of [['zoom','zoomEnd'],['px','pxEnd'],['py','pyEnd']]){v[start]=c[start]+(c[end]-c[start])*(a-c.from)/(c.to-c.from);v[end]=c[start]+(c[end]-c[start])*(b-c.from)/(c.to-c.from);}return v;});
    next.clips.splice(index,1,...parts);K.validate(next,media);
    return {project:next,title:kind==='scene'?'シーンで分割':'無音区間をカット',notes:ranges.map((r,i)=>'採用 '+(i+1)+' · '+r[0].toFixed(2)+' – '+r[1].toFixed(2)+' 秒')};
  }
  return {apply,parse,prompt,quick,analysis};
})();
if(typeof module!=='undefined')module.exports=Planner;
