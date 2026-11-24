'use strict';
let recording=false,captionRequest=null,captionStatus="",captionChoice="",captionChars=22;
const btn=(act,label,style='outline',value='')=>'<button class="'+style+'" data-action="'+act+'" data-value="'+E(value)+'">'+E(label)+'</button>';
const hint=s=>'<p>'+E(s)+'</p>',title=s=>'<h3 class="sectiontitle">'+E(s)+'</h3>';
const row=(label,h)=>'<label class="field"><span>'+E(label)+'</span>'+h+'</label>';
const group=(name,html,start=false)=>'<details data-group="'+E(name)+'" '+(start||lastOpenedDetails[name]?'open':'')+'><summary>'+E(name)+'</summary>'+html+'</details>';
function number(key,label,v,min,max,step=.01,slider=true){
  const a='data-key="'+key+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+K.round(v)+'"';
  return row(label,(slider?'<input aria-label="'+E(label)+' スライダー" type="range" '+a+'>':'')+'<input aria-label="'+E(label)+' 数値" inputmode="decimal" type="number" '+a+'>');
}
const choice=(key,label,value,opts)=>row(label,'<select data-key="'+key+'">'+Object.entries(opts).map(([k,v])=>'<option value="'+E(k)+'" '+(String(value)===k?'selected':'')+'>'+E(v)+'</option>').join('')+'</select>');
const check=(key,label,yes)=>'<label class="check"><input type="checkbox" data-key="'+key+'" '+(yes?'checked':'')+'>'+E(label)+'</label>';
const color=(key,label,value)=>row(label,'<input type="color" data-key="'+key+'" value="'+E(value)+'">');
const options=vals=>Object.fromEntries(vals.map(v=>[String(v),String(v)]));
function clipPanel(c){
  if(!c)return hint('映像を選択してください。');
  const m=media[c.asset],max=m.kind==='image'?86400:m.duration;
  return '<div class="meta">'+E(m.name)+'　'+m.width+'×'+m.height+'　'+K.len(c).toFixed(2)+' 秒</div>'+
    group('トリム・速度',number('from','素材IN（秒）',c.from,0,max,1/p.fps,false)+number('to','素材OUT（秒）',c.to,.01,max,1/p.fps,false)+number('speed','速度（倍）',c.speed,.25,4,.05)+number('gain','元音量（倍）',c.gain,0,3,.01),true)+
    group('構図・キーフレーム',choice('fit','収め方',c.fit,{contain:'全体を表示',cover:'画面を埋める'})+choice('rotation','回転',c.rotation,options([0,90,180,270]))+check('flip','左右反転',c.flip)+hint('開始から終了まで、倍率と拡大中心を直線補間します。')+number('zoom','開始倍率',c.zoom,1,4)+number('zoomEnd','終了倍率',c.zoomEnd,1,4)+number('px','開始 横中心',c.px,0,1)+number('py','開始 縦中心',c.py,0,1)+number('pxEnd','終了 横中心',c.pxEnd,0,1)+number('pyEnd','終了 縦中心',c.pyEnd,0,1))+
    group('色調整',choice('look','ルック',c.look,K.looks)+number('bright','明るさ',c.bright,-.5,.5)+number('contrast','コントラスト',c.contrast,.1,2)+number('sat','彩度',c.sat,0,2))+
    group('切替・フェード',choice('transition','前の映像と接続',c.transition,K.transitions)+number('overlap','重なり（秒）',c.overlap,.03,8,.01)+number('fadeIn','映像 IN（秒）',c.fadeIn,0,10,.01)+number('fadeOut','映像 OUT（秒）',c.fadeOut,0,10,.01)+number('aFadeIn','音声 IN（秒）',c.aFadeIn,0,10,.01)+number('aFadeOut','音声 OUT（秒）',c.aFadeOut,0,10,.01))+
    '<div class="buttons">'+btn('moveClip','← 前へ','outline','-1')+btn('moveClip','後ろへ →','outline','1')+'</div>'+
    (m.kind==='video'?btn('proxy','軽量プレビューを作成','secondary'):'');
}
function layerPanel(l){
  const source=l.type==='text'?null:media[l.asset],timing=number('start','配置（秒）',l.start,0,Math.max(1,K.duration(p)),.01,false)+number('duration','長さ（秒）',l.duration,.02,source&&['audio','video'].includes(l.type)?source.duration-l.from:86400,.01,false)+(source&&['audio','video'].includes(l.type)?number('from','素材IN（秒）',l.from,0,Math.max(0,source.duration-l.duration),.01,false):'');
  let h=l.type==='text'?'<textarea data-key="text" aria-label="字幕本文">'+E(l.text)+'</textarea>':'<strong>'+E(source.name)+'</strong>';
  h+=group('タイミング',timing,true);
  if(l.type!=='audio')h+=group('位置・外観',number('x','横位置',l.x,0,1)+number('y','縦位置',l.y,0,1)+number('opacity','不透明度',l.opacity,0,1)+(l.type==='text'?number('size','文字サイズ',l.size,.015,.25,.001)+choice('font','書体',l.font,{'sans-serif':'ゴシック','serif':'明朝','monospace':'等幅'})+color('color','文字色',l.color)+check('bold','太字',l.bold)+check('box','背景ボックス',l.box)+color('back','背景色',l.back):number('width','画面に対する幅',l.width,.05,1.5)),l.type==='text');
  else h+=group('音量・ダッキング',number('gain','音量（倍）',l.gain,0,3)+number('fadeIn','フェードIN（秒）',l.fadeIn,0,20,.01)+number('fadeOut','フェードOUT（秒）',l.fadeOut,0,20,.01)+check('duck','元の音声に合わせてBGMを自動で下げる',l.duck),true);
  h+='<div class="buttons">'+btn('place','再生位置に移動')+(l.type!=='audio'?btn('zorder','一つ前面へ','outline','1')+btn('zorder','一つ背面へ','outline','-1'):'')+'</div>';
  return h;
}
function assetList(role){
  const items=Object.values(media).filter(m=>role==='audio'?m.audio:['video','image'].includes(m.kind));
  return btn('pick','端末から'+(role==='audio'?'音声・動画':'動画・写真')+'を追加','primary',role)+
    (items.length?title('読み込み済み素材')+'<div class="cards">'+items.map(m=>'<button data-action="useAsset" data-value="'+E(m.id)+'"><img class="thumb" '+(m.thumb?'src="../thumb/'+E(m.id)+'.jpg"':'')+' alt=""><div class="rowlabel"><strong>'+E(m.name)+'</strong><small>'+E(m.kind.toUpperCase())+' · '+(m.kind==='image'?m.width+'×'+m.height:m.duration.toFixed(2)+' s')+'</small></div>'+ic('plus')+'</button>').join('')+'</div>':'')+
    (role==='clips'?btn('sample','サンプル作品を開く','secondary'):'');
}
function projectPanel(){
  return '<div class="buttons">'+btn('new','新規プロジェクト','primary')+btn('projectFile','編集データを開く')+'</div><div class="cards">'+projects.map(a=>'<button data-action="openProject" data-value="'+E(a.id)+'" class="'+(a===p?'active':'')+'"><div class="rowlabel"><strong>'+E(a.name)+'</strong><small>'+a.ratio+' · '+K.duration(a).toFixed(2)+' s · '+a.clips.length+' clips</small></div>'+ic('chev')+'</button>').join('')+'</div>'+
    title('現在の作品')+row('作品名','<input type="text" data-key="name" value="'+E(p.name)+'" maxlength="90">')+'<div class="buttons">'+btn('duplicateProject','作品を複製')+btn('saveArchive','素材込みで保存')+'</div>'+btn('saveProject','軽量な編集データだけ保存','secondary')+hint('素材込みのZIPは別の端末でも復元できます。軽量JSONはこの端末の素材を参照します。')+'<div class="buttons">'+btn('removeProject','作品を削除','secondary')+btn('storage','未使用素材の整理','secondary')+'</div>'+btn('credits','アプリ情報・素材クレジット','secondary');
}
function specPanel(){return choice('ratio','縦横比',p.ratio,options(Object.keys(K.ratios)))+choice('resolution','基準解像度',p.resolution,{'720':'720p','1080':'1080p','2160':'2160p（4K）'})+choice('fps','フレームレート',p.fps,options([24,25,30,50,60]))+color('bg','余白の色',p.bg);}
function exportPanel(){
  const [w,h]=K.dims(p);
  return '<strong>'+w+' × '+h+'　<span class="meta">'+p.fps+' fps · '+K.duration(p).toFixed(2)+' 秒</span></strong>'+specPanel()+choice('codec','映像形式',p.codec,{h264:'H.264（互換性優先）',hevc:'H.265 / HEVC'})+choice('quality','画質',p.quality,{'16':'高画質','20':'標準','25':'容量優先'})+hint('MP4（音声AAC）を Movies/Koma Studio に保存します。360p確認用は同じ処理で合成・音量を確認できます。')+'<div class="buttons">'+btn('renderPreview','360pで確認','outline')+btn('render','MP4を書き出す','primary')+'</div>'+(renderState.phase==='done'?btn('lastResult','前回の結果を開く','secondary'):'');
}
function accountPart(){
  const a=(account.accounts||[]).find(x=>x.id===account.active);const signed=a?.signed;
  let out=title('ChatGPT 接続')+'<div class="meta">'+E(account.waiting?'ブラウザの応答待ち':signed?a.label+' · '+(a.plan?'プラン利用可':'ログインのみ'):'未接続')+'</div>';
  if(!signed)out+=btn('login','Continue with ChatGPT','outline',a?.id||'');else out+='<div class="buttons">'+btn('login','再接続','outline',a.id)+btn('signout','ログアウト','secondary')+'</div>';
  if(account.waiting)out+=btn('cancelAuth','接続待ちを中止','secondary');
  if((account.accounts||[]).length)out+=row('アカウント','<select id="acct">'+account.accounts.map(a=>'<option value="'+E(a.id)+'" '+(a.active?'selected':'')+'>'+E(a.label)+'</option>').join('')+'</select>')+btn('login','別アカウントを追加','secondary','');
  if(signed&&a.plan)out+=row('モデル','<select id="model"><option value="">自動選択</option>'+models.map(m=>'<option value="'+E(m.slug)+'" '+(model===m.slug?'selected':'')+'>'+E(m.name)+'</option>').join('')+'</select>')+btn('models','使用可能モデルを取得','secondary');
  return out;
}
function aiPanel(){
  let out=title('端末で自動編集')+'<div class="chips">'+btn('auto','縦型15秒以内','','short')+btn('auto','シネマルック','','film')+btn('auto','音声を整える','','sound')+'</div>';
  const c=activeClip(),m=c?media[c.asset]:null;
  if(m?.kind==='video')out+=group('選択クリップを解析',number('silenceDb','無音（dB）',analysisDB,-60,-15,1)+number('silenceMin','最小無音（秒）',analysisMin,.15,4,.05)+number('sceneScore','シーン感度しきい値',sceneScore,.08,.8,.01)+'<div class="buttons">'+btn('scan','無音をカット','outline','silence')+btn('scan','シーン分割','outline','scene')+'</div>');
  out+=title('GPTに編集を依頼')+'<textarea id="taskText" maxlength="5000" aria-label="編集指示" placeholder="例：縦型15秒。冒頭にタイトルを2秒表示し、最後は暗転。">'+E(taskText)+'</textarea>'+
  '<label class="check"><input id="images" type="checkbox" '+(useImages?'checked':'')+'>代表画像も送る（先頭6素材・動画は最大4コマ）</label>'+hint('送信内容は指示、素材名、尺、編集設定です。代表画像はオンにした場合に送信します。')+
  btn('ask',busyText||'編集案を生成','primary')+(busyText?'<span class="meta">'+E(busyText)+'</span>':'')+
  group('アカウントとモデル',accountPart(),!account.accounts?.some(a=>a.active&&a.signed))+
  group('ブラウザ経由で編集案を受け取る',hint('指示をコピーしてChatGPTを開きます。回答のJSONを貼り付けると編集内容を確認できます。この方法は画像を送りません。')+btn('chat','指示をコピーしてChatGPTを開く','secondary')+'<textarea id="planPaste" aria-label="編集プランのJSON" placeholder="回答のJSONを貼り付け"></textarea>'+btn('pastePlan','貼り付けた編集案を確認','outline'));
  if(sampleStatus)out+='<div class="meta">'+E(sampleStatus)+'</div>';if(pending)out+=btn('review','編集案を確認','outline');return out;
}
function resultPanel(){const r=renderState;if(r.phase==='working'||r.phase==='starting')return '<strong>'+E(r.message||'準備中')+'</strong><progress value="'+(r.pct||0)+'" max="100"></progress>'+btn('stopRender','書き出しを中止','secondary bad');
  if(r.phase==='done')return (r.preview?'<video class="resultvideo" src="../'+E(r.uri)+'" controls playsinline></video>':'<strong>'+E(r.message)+'</strong><div class="buttons">'+btn('viewMovie','動画を開く','primary')+btn('shareMovie','共有','outline')+'</div>');
  return '<div class="errbox">'+E(r.message||'書き出しがありません')+'</div>'+btn('export','出力設定に戻る','secondary');}
let analysisDB=-36,analysisMin=.55,sceneScore=.30;
function speechSources(){return [...K.spans(p).filter(s=>media[s.c.asset]?.audio).map(s=>({id:s.c.id,asset:s.c.asset,from:s.c.from,to:s.c.to,start:s.start,speed:s.c.speed})),...p.layers.filter(l=>l.type==='audio').map(l=>({id:l.id,asset:l.asset,from:l.from,to:l.from+l.duration,start:l.start,speed:1}))];}
function speechPanel(){
  const sources=speechSources();if(!sources.length)return hint('会話を含む動画やナレーションを追加すると、日本語の自動字幕を作成できます。');
  let which=sources.find(i=>i.id===captionChoice)||sources.find(i=>i.id===sel)||sources[0];captionChoice=which.id;
  return group('日本語の自動字幕',hint('録音を端末内で文字起こしし、字幕案を表示します。初回は同梱モデルを展開します。')+row('対象','<select id="captionSource">'+sources.map(s=>'<option value="'+E(s.id)+'" '+(s.id===which.id?'selected':'')+'>'+E(media[s.asset].name)+' · '+s.start.toFixed(1)+'秒から</option>').join('')+'</select>')+number('captionChars','1字幕の目安文字数',captionChars,8,40,1)+btn('transcribe',captionRequest?'字幕作成を中止':'自動字幕を作成','outline')+'<small class="meta" id="captionStatus">'+E(captionStatus)+'</small>',true);}
function content(name){
  switch(name){
    case 'projects':return ['プロジェクト',projectPanel()];
    case 'assets':return ['映像素材',assetList('clips')];
    case 'audio':return ['音声・BGM',btn('voice',recording?'■ 録音を停止':'● ナレーションを録音',recording?'outline bad':'outline')+hint('マイクで録音し、再生位置から音声トラックに追加します。')+assetList('audio')];
    case 'overlay':return ['映像を重ねる',assetList('overlay')];
    case 'details':{const l=activeLayer();return [l?{text:'字幕を調整',audio:'音声を調整',image:'画像を調整',video:'重ね映像を調整'}[l.type]:'クリップを調整',l?layerPanel(l):clipPanel(activeClip())];}
    case 'text':return ['字幕',speechPanel()+btn('addText','再生位置に字幕を追加','primary')+'<div class="buttons">'+btn('srtIn','SRTを読み込む')+btn('srtOut','SRTを書き出す')+'</div>'+(p.layers.filter(l=>l.type==='text').length?'<div class="cards">'+p.layers.filter(l=>l.type==='text').map(l=>'<button data-action="editItem" data-value="'+E(l.id)+'"><strong>'+E(l.text)+'</strong><small>'+l.start.toFixed(2)+' s</small></button>').join('')+'</div>':'')];
    case 'canvas':return ['作品の設定',specPanel()];
    case 'export':return ['書き出し',exportPanel()];
    case 'ai':return ['AI編集',aiPanel()];
    case 'review':return ['編集案を確認',pending?'<strong>'+E(pending.title)+'</strong><ol class="notes">'+pending.notes.map(l=>'<li>'+E(l)+'</li>').join('')+'</ol><div class="buttons">'+btn('discard','破棄','secondary')+btn('apply','まとめて適用','primary')+'</div>':hint('編集案がありません。')];
    case 'jump':return ['再生位置',row('秒','<input id="jumpSec" type="number" min="0" max="'+K.duration(p)+'" step="0.001" value="'+K.round(head)+'">')+btn('goSec','この位置へ移動','primary')];
    case 'marker':return ['マーカー',row('名前','<input type="text" id="markerName" maxlength="50" placeholder="マーカー名">')+btn('addMarker','再生位置に追加','primary')+'<div class="cards">'+p.markers.map(m=>'<div class="listitem"><button data-action="gotoMark" data-value="'+E(m.id)+'">'+E(m.name)+'　'+moment(m.t)+'</button>'+btn('delMark','削除','secondary',m.id)+'</div>').join('')+'</div>'];
    case 'progress':return ['書き出し結果',resultPanel()];
    case 'delete':return ['選択項目を削除',hint('選択中の項目をタイムラインから取り除きます。元に戻すことができます。')+btn('confirmDelete','タイムラインから削除','outline bad')];
    case 'credits':return ['Koma Studio 1.0',hint('編集は端末内で処理します。プレビュー互換化と書き出しには空き容量が必要です。')+title('サンプル写真')+hint('Alpsdake「Mount Fuji and Sunrise from Lake Motosu」「Mount Fuji from Lake Motosu」／Wikimedia Commons、CC BY-SA 4.0。縮小・クロップを使用。')+title('ソフトウェア')+hint('Koma Studio は GPL v3。FFmpeg、FFmpegKit、x264、x265 等のライセンスはAPK内 assets/licenses と同梱ソースに記載。')];
    case 'removeProject':return ['作品を削除',hint('「'+p.name+'」の編集データを削除します。必要なら先に素材込みで保存してください。')+btn('removeProjectNow','この作品を削除','outline bad')];
    case 'storage':return ['未使用素材を整理',hint('どの作品にも使われていない読み込み済み素材と軽量プレビューを、アプリの保存領域から削除します。端末で最初に選んだファイルは保持されます。')+btn('prune','未使用素材を削除','outline bad')];
    case 'exit':return ['編集を終了',hint('現在の作品は自動保存されています。')+btn('exitNow','アプリを閉じる','primary')];
    default:return ['編集',hint('項目を選んでください。')];
  }
}
function show(name,keep=false){pause();const same=sheet===name&&keep,body=$('#body'),scroll=same?body.scrollTop:0;
  if(!same)lastOpenedDetails={};else for(const det of body.querySelectorAll('details'))lastOpenedDetails[det.dataset.group]=det.open;
  sheet=name;const [t,h]=content(name);$('#sheetTitle').textContent=t;body.innerHTML=h;$('#shade').hidden=false;body.scrollTop=scroll;}
function close(){sheet='';$('#shade').hidden=true;$('#body').innerHTML='';frame(false);}
window.komaBack=()=>{if(sheet)close();else if(playing)pause();else show('exit');};
$('#shade').addEventListener('click',e=>{if(e.target===$('#shade'))close();});
function addAsset(role,m,dest=p){if(role==='clips'){if(!['image','video'].includes(m.kind))throw Error('映像素材を選択してください。');const c=K.clip(m.id,m);dest.clips.push(c);return c.id;}
  if(!dest.clips.length)throw Error('先に主映像を追加してください。');
  if(role==='audio'&&!m.audio)throw Error('この素材には音声がありません。');
  const type=role==='audio'?'audio':m.kind;if(type==='audio'&&role!=='audio')throw Error('映像素材を選択してください。');
  const end=K.duration(dest),start=Math.min(head,Math.max(0,end-1/dest.fps)),l=K.layer(type,start,m.id);l.duration=K.round(Math.min(m.kind==='image'?3:m.duration,end-start));if(l.duration<=0)throw Error('先に再生位置を戻してください');dest.layers.push(l);return l.id;
}
function switchProject(id){const dest=projects.find(a=>a.id===id);if(!dest)throw Error('作品が見つかりません');pause();p=dest;head=0;sel='';past=[];future=[];pending=null;request=null;analysisRequest=null;busyText='';checkSel();$('#scroll').scrollLeft=0;close();save();draw();}
function putPending(result,base=snapshot()){if(snapshot()!==base)throw Error('解析中に作品が変わりました。もう一度実行してください。');pending={...result,base};busyText='';show('review');}
function renderStatus(){const progress=$('#progress'),r=renderState;progress.hidden=!['starting','working'].includes(r.phase);if(!progress.hidden){$('#progressText').textContent=r.message+'　'+r.pct+'%';$('#progressBar').style.width=r.pct+'%';}}
async function startRender(preview){
  if(['working','starting'].includes(renderState.phase))return show('progress');
  const compiled=K.plan(p,media,preview),id=K.id();renderState={phase:'starting',message:'字幕と素材を準備中',pct:0};close();renderStatus();
  await new Promise(r=>setTimeout(r,35));
  try{let plate=null,number=0;for(const stamp of compiled.stamps){let canvas;
      if(stamp.layers){if(!plate){plate=document.createElement('canvas');plate.width=stamp.w;plate.height=stamp.h;}const ctx=plate.getContext('2d');ctx.clearRect(0,0,stamp.w,stamp.h);for(const layer of stamp.layers){const tile=makeStamp(layer,stamp.w,stamp.h);ctx.globalAlpha=layer.opacity;ctx.drawImage(tile,Math.round(layer.x*stamp.w-tile.width/2),Math.round(layer.y*stamp.h-tile.height/2));}ctx.globalAlpha=1;canvas=plate;}
      else canvas=makeStamp(stamp.layer,stamp.w,stamp.h);if(++number%4===0){renderState.message='字幕を準備中 '+number+' / '+compiled.stamps.length;renderStatus();await new Promise(resolve=>setTimeout(resolve,0));}const error=call('stamp',id,stamp.name,canvas.toDataURL('image/png').split(',')[1]);if(error)throw Error(error);}
    delete compiled.stamps;const error=call('startJob',id,JSON.stringify(compiled));if(error)throw Error(error);
  }catch(err){renderState={phase:'error',message:err.message};renderStatus();show('progress');}
}
function action(a,b){
  const c=activeClip(),l=activeLayer(),index=p.clips.findIndex(x=>x.id===sel),v=b?.dataset.value||'';
  switch(a){
    case 'assets':case 'projects':case 'audio':case 'overlay':case 'text':case 'ai':case 'details':case 'canvas':case 'export':case 'jump':case 'marker':case 'progress':case 'credits':case 'delete':return show(a);
    case 'close':return close();case 'undo':return undo(false);case 'redo':return undo(true);case 'play':return togglePlay();
    case 'prev':case 'next':pause();seek((Math.round(head*p.fps)+(a==='next'?1:-1))/p.fps,true);return;
    case 'zoomIn':case 'zoomOut':scrollScale=K.clamp(scrollScale*(a==='zoomIn'?1.4:1/1.4),10,520);timeline();followHead();$('#zoomLabel').textContent=(scrollScale/56).toFixed(1)+'×';save();return;
    case 'snap':snap=!snap;draw();save();return notice(snap?'吸着オン':'吸着オフ');
    case 'guides':$('#guides').hidden=!$('#guides').hidden;$('#guideBtn').classList.toggle('on',!$('#guides').hidden);return;
    case 'split':return edit(()=>{sel=K.split(p,index,head);},'再生位置で分割しました');
    case 'leftTrim':case 'rightTrim':return edit(()=>{if(!c)throw Error('映像を選択してください');const s=K.spans(p)[index],pos=K.round(c.from+(head-s.start)*c.speed);if(pos<c.from+c.speed/p.fps||pos>c.to-c.speed/p.fps)throw Error('再生位置を選択クリップの内側へ移動してください');if(a==='leftTrim')c.from=pos;else c.to=pos;},'トリムしました');
    case 'dup':return edit(()=>{const o=c||l;if(!o)throw Error('項目を選択してください');const n={...o,id:K.id()};if(c)p.clips.splice(index+1,0,n);else{n.start=K.round(l.start+l.duration);p.layers.push(n);}sel=n.id;},'複製しました');
    case 'confirmDelete':close();return edit(()=>{if(c)p.clips.splice(index,1);else p.layers=p.layers.filter(x=>x.id!==sel);checkSel();},'タイムラインから削除しました');
    case 'moveClip':return edit(()=>{const dest=index+Number(v);if(dest<0||dest>=p.clips.length)throw Error('これ以上移動できません');p.clips.splice(dest,0,p.clips.splice(index,1)[0]);},'順序を変更しました');
    case 'place':return edit(()=>{l.start=head;},'配置しました');
    case 'zorder':return edit(()=>{let i=p.layers.indexOf(l),t=K.clamp(i+Number(v),0,p.layers.length-1);p.layers.splice(t,0,p.layers.splice(i,1)[0]);},'重なり順を変更しました');
    case 'proxy':if(!c)return;busyText='軽量プレビューを作成中';call('proxy',c.asset);return notice(busyText);
    case 'new':{const dest=K.project('新規プロジェクト '+(projects.length+1));projects.unshift(dest);switchProject(dest.id);return show('assets');}
    case 'removeProject':case 'storage':return show(a);
    case 'removeProjectNow':{projects=projects.filter(x=>x.id!==p.id);if(!projects.length)projects.push(K.project());switchProject(projects[0].id);return notice('作品を削除しました');}
    case 'prune':if(['starting','working'].includes(renderState.phase))throw Error('書き出しが終わってから整理してください');save();call('prune');return;
    case 'sample':{const dest=K.project('湖畔の朝');projects.push(dest);switchProject(dest.id);call('demo',dest.id);return;}
    case 'openProject':return switchProject(v);
    case 'duplicateProject':{const dst=JSON.parse(snapshot());dst.id=K.id();dst.name+='（コピー）';projects.push(dst);return switchProject(dst.id);}
    case 'pick':call('pickFile',v,p.id);return;
    case 'useAsset':{const role=sheet==='assets'?'clips':sheet;edit(()=>{sel=addAsset(role,media[v]);},'タイムラインに追加しました',false);close();select(sel,true);return;}
    case 'voice':if(!p.clips.length)throw Error('先に映像を追加してください');call('voice',p.id,head);return;
    case 'saveArchive':call('writeDocument',p.name+'.koma.zip','application/zip',JSON.stringify(p));return;
    case 'projectFile':call('pickFile','project',p.id);return;
    case 'saveProject':call('writeDocument',p.name+'.koma.json','application/json',JSON.stringify(p,null,2));return;
    case 'addText':if(!p.clips.length)throw Error('先に映像を追加してください');edit(()=>{const t=Math.min(head,Math.max(0,K.duration(p)-1/p.fps));const o=K.layer('text',t);o.duration=Math.min(3,K.duration(p)-t);p.layers.push(o);sel=o.id;},'',false);return show('details');
    case 'transcribe':{if(captionRequest){call('cancelCaptions');notice('字幕作成を中止しています');return;}const s=speechSources().find(x=>x.id===captionChoice);if(!s)throw Error('音声のある素材を選択してください');captionRequest={...s,ticket:K.id(),base:snapshot()};captionStatus='音声を準備中';call('captions',s.asset,s.from,s.to,captionChars,captionRequest.ticket);return show('text',true);}
    case 'srtIn':call('pickFile','srt',p.id);return;
    case 'srtOut':{const str=K.srtOut(p);if(!str)throw Error('字幕がありません');call('writeDocument',p.name+'.srt','application/x-subrip',str);return;}
    case 'editItem':sel=v;seek(activeLayer().start,true);draw();return show('details');
    case 'goSec':seek(K.num($('#jumpSec').value),true);save();return close();
    case 'addMarker':{const name=$('#markerName').value||'マーカー '+(p.markers.length+1);return edit(()=>p.markers.push({id:K.id(),t:head,name}),'マーカーを追加しました');}
    case 'gotoMark':seek(p.markers.find(m=>m.id===v).t,true);return close();
    case 'delMark':return edit(()=>p.markers=p.markers.filter(m=>m.id!==v),'マーカーを削除しました');
    case 'auto':return putPending(Planner.quick(p,v,media));
    case 'scan':{if(!c)throw Error('対象の動画を選択してください');if(analysisRequest)throw Error('解析中です');analysisRequest={ticket:K.id(),base:snapshot(),index};busyText='素材を解析中';call('analyze',c.asset,v,c.from,c.to,v==='scene'?sceneScore:analysisDB,analysisMin,analysisRequest.ticket);show('ai',true);return;}
    case 'login':call('signIn',v);return;case 'cancelAuth':call('cancelAuth');return;
    case 'models':call('models');notice('利用可能モデルを取得中');return;case 'signout':call('signOut');return;
    case 'ask':case 'chat':{if(!taskText.trim())throw Error('編集指示を入力してください。');if(!p.clips.length)throw Error('映像を追加してください');const prompt=Planner.prompt(p,media,taskText,sel,head);if(a==='chat'){call('browserChat',prompt);return notice('編集指示をコピーしました');}
      if(!account.accounts?.some(x=>x.active&&x.signed&&x.plan))throw Error('「Continue with ChatGPT」から接続してください。');
      if(request)throw Error('編集中です');request={ticket:K.id(),base:snapshot()};busyText='GPTが編集案を作成中';const refs=useImages?Array.from(new Set(p.clips.map(x=>x.asset))).slice(0,6):[];call('generate',prompt,model,JSON.stringify(refs),request.ticket);show('ai',true);return;}
    case 'pastePlan':{const raw=$('#planPaste').value;return putPending(Planner.apply(p,raw,media));}
    case 'review':return show('review');
    case 'apply':{if(!pending||snapshot()!==pending.base)throw Error('作品が変わりました。編集案を作り直してください。');const q=pending.project;close();return edit(()=>replace(q),'編集案を適用しました。↶で取り消せます。');}
    case 'discard':pending=null;return show('ai');
    case 'render':case 'renderPreview':return startRender(a==='renderPreview').catch(e=>notice(e.message));
    case 'lastResult':return show('progress');case 'stopRender':call('stopJob');return;
    case 'viewMovie':case 'shareMovie':call('viewMovie',renderState.uri,a==='shareMovie');return;
    case 'exitNow':save();call('finishApp');return;
  }
}
document.addEventListener('click',e=>{const btn=e.target.closest('button[data-action]');if(!btn)return;try{action(btn.dataset.action,btn);}catch(err){notice(err.message);}});
document.addEventListener('input',e=>{const el=e.target;if(el.id==='taskText')taskText=el.value;if(el.type==='range'){const n=el.parentElement.querySelector('input[type=number]');if(n)n.value=el.value;}});
document.addEventListener('change',e=>{try{const el=e.target;if(el.id==='images'){useImages=el.checked;return;}if(el.id==='captionSource'){captionChoice=el.value;return;}if(el.dataset.key==='captionChars'){captionChars=K.clamp(Number(el.value),8,40);show(sheet,true);return;}if(el.id==='acct'){call('selectAccount',el.value);return;}if(el.id==='model'){model=el.value;save();return;}
  const key=el.dataset.key;if(!key)return;if(['silenceDb','silenceMin','sceneScore'].includes(key)){if(key==='silenceDb')analysisDB=Number(el.value);if(key==='silenceMin')analysisMin=Number(el.value);if(key==='sceneScore')sceneScore=Number(el.value);show(sheet,true);return;}
  const obj=sheet==='details'?activeClip()||activeLayer():p;if(!obj)return;let v=el.type==='checkbox'?el.checked:(typeof obj[key]==='number'?Number(el.value):el.value);
  if(['range','number'].includes(el.type)){if(!el.value.trim()||!Number.isFinite(v)||v<Number(el.min)-.000001||v>Number(el.max)+.000001)throw Error('設定範囲の数値を入力してください。');}
  if(key==='name'){v=v.trim().slice(0,90);if(!v)throw Error('作品名を入力してください');}edit(()=>obj[key]=v,'',false);
  if(el.type!=='textarea')show(sheet,true);
}catch(err){notice(err.message);if(sheet)show(sheet,true);}});
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select'))return;if(e.key==='Escape'){window.komaBack();return;}if(e.key===' '&&!sheet){e.preventDefault();togglePlay();}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();action(e.key==='ArrowLeft'?'prev':'next');}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();undo(e.shiftKey);}});
window.onKoma=(type,json)=>{try{const data=JSON.parse(json);switch(type){
  case 'pruned':media=data.media;close();draw();notice(data.count+' 素材を整理 · '+(data.bytes/1048576).toFixed(1)+' MB');return;
  case 'captionProgress':if(captionRequest?.ticket===data.ticket){captionStatus=data.message+' '+data.pct+'%';const el=$('#captionStatus');if(el)el.textContent=captionStatus;}return;
  case 'captions':{if(captionRequest?.ticket!==data.ticket)return;const q=captionRequest;captionRequest=null;captionStatus='';if(snapshot()!==q.base)throw Error('作品が変わりました。字幕を作り直してください。');if(!data.cues?.length)throw Error('設定した区間から発話を認識できませんでした。');
    const dst=JSON.parse(q.base),notes=[];for(const cue of data.cues){const start=K.round(q.start+cue.start/q.speed),end=Math.min(K.duration(dst),q.start+(q.to-q.from)/q.speed,q.start+cue.end/q.speed);if(end<=start)continue;dst.layers.push({...K.layer('text',start),text:cue.text,duration:K.round(end-start)});notes.push(start.toFixed(2)+' 秒　'+cue.text);}
    if(!notes.length)throw Error('タイムライン内に字幕区間がありません');K.validate(dst,media);putPending({project:dst,title:'日本語の自動字幕 '+notes.length+'件',notes},q.base);return;}
  case 'record':recording=!!data.on;if(sheet==='audio')show(sheet,true);return;
  case 'voice':{media[data.item.id]=data.item;if(data.target!==p.id){notice('録音は素材一覧に保存しました');return;}edit(()=>{const t=K.clamp(data.at,0,Math.max(0,K.duration(p)-1/p.fps));const l=K.layer('audio',t,data.item.id);l.duration=K.round(Math.min(data.item.duration,K.duration(p)-t));l.gain=1;p.layers.push(l);sel=l.id;},'ナレーションを追加しました');return;}
  case 'demo':{media=data.media;const dst=projects.find(x=>x.id===data.target);if(dst)demoProject(dst);return;}
  case 'import':{busyText='';for(const m of data.items)media[m.id]=m;const dst=projects.find(x=>x.id===data.target);if(!dst)return;const add=()=>{let last='';for(const m of data.items)last=addAsset(data.role,m,dst);if(dst===p&&last)sel=last;};
    if(dst===p){close();if(data.items.length){edit(add,'素材を追加しました');select(sel,true);}}else{add();save();}
    if(data.errors.length)notice('読み込み失敗 · '+data.errors.join('、').slice(0,160));return;}
  case 'document':{if(data.role==='project'){if(data.media)media=data.media;const dst=K.validate(JSON.parse(data.text),media);dst.id=K.id();projects.push(dst);switchProject(dst.id);notice('編集データを開きました');}
    else if(data.target===p.id){const added=K.srtIn(data.text);edit(()=>p.layers.push(...added),added.length+'件の字幕を読み込みました');}return;}
  case 'proxy':media[data.id]=data;for(const [key,e] of nodes)if(e.el.tagName==='VIDEO'&&(p.clips.find(c=>c.id===key)?.asset===data.id||p.layers.find(l=>l.id===key)?.asset===data.id))e.el.src=mediaUrl(data);busyText='';draw();notice('軽量プレビューを準備しました');return;
  case 'analysis':{if(!analysisRequest||analysisRequest.ticket!==data.ticket)return;const req=analysisRequest;analysisRequest=null;busyText='';if(snapshot()!==req.base)throw Error('作品が変わりました。再解析してください');putPending(Planner.analysis(p,req.index,data.kind,data.points,media),req.base);return;}
  case 'auth':account=data.status;sampleStatus=data.message;notice(data.message);if(sheet==='ai')show(sheet,true);return;
  case 'account':account=data;models=[];model='';if(sheet==='ai')show(sheet,true);return;
  case 'models':models=data.list;if(sheet==='ai')show(sheet,true);notice('モデルを取得しました');return;
  case 'plan':{if(!request||request.ticket!==data.ticket)return;const req=request;request=null;busyText='';if(snapshot()!==req.base)throw Error('作品が変わりました。編集案を作り直してください。');putPending(Planner.apply(p,data.text,media),req.base);return;}
  case 'render':renderState=data;renderStatus();if(data.phase!=='working'||sheet==='progress')show('progress',true);return;
  case 'error':captionRequest=null;captionStatus='';request=null;analysisRequest=null;busyText='';sampleStatus=data.message;if(renderState.phase==='starting'){renderState={phase:'error',message:data.message};renderStatus();show('progress');}else if(sheet==='ai')show(sheet,true);notice(data.message);return;
  case 'notice':case 'busy':notice(data.message);return;
}}catch(e){busyText='';notice(e.message);if(sheet==='ai')show(sheet,true);}};
boot();
