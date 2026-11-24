package jp.koma.studio;

import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.net.Uri;
import android.os.*;
import android.util.Base64;
import android.view.*;
import android.webkit.*;
import android.widget.TextView;
import java.io.*;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

public final class MainActivity extends Activity {
    private WebView web;private LocalServer server;private MediaShelf media;private PlanAccount account;
    private LocalCaptions captions;
    private final ExecutorService files=Executors.newSingleThreadExecutor();private final ExecutorService ai=Executors.newSingleThreadExecutor();
    private android.media.MediaRecorder recorder;private File recordingFile;private String recordingId="",voiceTarget="";private double voiceAt;
    private String picking="",target="",pendingText="";private boolean ready=false;
    private final BroadcastReceiver receiver=new BroadcastReceiver(){@Override public void onReceive(Context c,Intent i){try{event("render",new JSONObject(i.getStringExtra("value")));}catch(Exception ignored){}}};
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);getWindow().setStatusBarColor(0xff13171c);getWindow().setNavigationBarColor(0xff13171c);
        try{
            server=new LocalServer(this);media=new MediaShelf(this);account=new PlanAccount(this);captions=new LocalCaptions(this);
            if(saved!=null){picking=saved.getString("pick","");target=saved.getString("target","");pendingText=saved.getString("text","");}
            web=new WebView(this);web.setBackgroundColor(0xff13171c);web.setLayerType(View.LAYER_TYPE_HARDWARE,null);
            WebSettings ws=web.getSettings();ws.setJavaScriptEnabled(true);ws.setDomStorageEnabled(false);ws.setAllowFileAccess(false);ws.setAllowContentAccess(false);ws.setMediaPlaybackRequiresUserGesture(false);ws.setSupportMultipleWindows(false);ws.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
            web.addJavascriptInterface(new Bridge(),"Studio");web.setWebViewClient(new WebViewClient(){
                @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest req){return !req.getUrl().toString().equals(server.root+"desk/index.html");}
                @Override public WebResourceResponse shouldInterceptRequest(WebView view,WebResourceRequest req){String u=req.getUrl().toString();if(u.startsWith(server.root)||u.startsWith("data:")||u.startsWith("blob:"))return null;return new WebResourceResponse("text/plain","UTF-8",new ByteArrayInputStream(new byte[0]));}
                @Override public void onPageFinished(WebView w,String url){ready=true;}
            });
            web.setWebChromeClient(new WebChromeClient());setContentView(web);web.setOnApplyWindowInsetsListener((v,ins)->{if(Build.VERSION.SDK_INT>=30){android.graphics.Insets bars=ins.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());v.setPadding(bars.left,bars.top,bars.right,bars.bottom);}return ins;});
            if(Build.VERSION.SDK_INT>=33)registerReceiver(receiver,new IntentFilter(RenderService.EVENT),Context.RECEIVER_NOT_EXPORTED);else registerReceiver(receiver,new IntentFilter(RenderService.EVENT));
            web.loadUrl(server.root+"desk/index.html");
        }catch(Exception e){TextView v=new TextView(this);v.setText("起動エラー · "+Store.message(e));setContentView(v);}
    }
    @Override protected void onSaveInstanceState(Bundle b){super.onSaveInstanceState(b);b.putString("pick",picking);b.putString("target",target);if(pendingText.length()<12000)b.putString("text",pendingText);}
    @Override protected void onDestroy(){if(recorder!=null)stopVoice();if(account!=null)account.cancel();if(captions!=null)captions.cancel();try{unregisterReceiver(receiver);}catch(Exception ignored){}if(server!=null)server.close();files.shutdown();ai.shutdown();if(web!=null){web.removeJavascriptInterface("Studio");web.destroy();}super.onDestroy();}
    @Override public void onBackPressed(){if(ready)web.evaluateJavascript("window.komaBack()",null);else super.onBackPressed();}
    @Override protected void onPause(){super.onPause();if(ready)web.evaluateJavascript("window.komaPause&&window.komaPause()",null);}
    void event(String type,JSONObject data){runOnUiThread(()->{if(web!=null&&!isDestroyed())web.evaluateJavascript("window.onKoma&&window.onKoma("+JSONObject.quote(type)+","+JSONObject.quote(data.toString())+")",null);});}
    void openBrowser(String url){runOnUiThread(()->{try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));}catch(Exception e){if(account!=null)account.cancel();event("error",Store.obj("message","ブラウザを開けません"));}});}
    private interface Work{void run()throws Exception;}
    private void task(ExecutorService pool,Work action){pool.execute(()->{try{action.run();}catch(Throwable e){event("error",Store.obj("message",e instanceof Exception?PlanAccount.diagnose((Exception)e):Store.message(e)));}});}
    private void pick(String role,String dest){
        if(!picking.isEmpty()){event("error",Store.obj("message","ファイル選択を完了してください"));return;}
        picking=role;target=dest;Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE);i.setType("*/*");
        if(role.equals("clips")||role.equals("overlay")){i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"video/*","image/*"});i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);}
        if(role.equals("audio")){i.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"audio/*","video/*"});i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE,true);}
        try{startActivityForResult(i,10);}catch(Exception e){picking="";event("error",Store.obj("message","ファイルを選べません"));}
    }
    @Override protected void onActivityResult(int req,int result,Intent data){
        super.onActivityResult(req,result,data);if(req!=10&&req!=20)return;
        String role=picking,dest=target;String txt=pendingText;if(req==20&&txt.isEmpty())txt=Store.get(this,"pending-document","");final String document=txt;picking="";target="";pendingText="";
        if(result!=RESULT_OK||data==null){event("idle",new JSONObject());return;}
        if(req==20){task(files,()->{if(role.equals("archiveSave"))ProjectArchive.exportTo(this,data.getData(),document,media.catalog());else Store.copy(new ByteArrayInputStream(document.getBytes("UTF-8")),getContentResolver().openOutputStream(data.getData(),"wt"));Store.put(this,"pending-document","");event("notice",Store.obj("message","ファイルを保存しました"));});return;}
        ArrayList<Uri> uris=new ArrayList<>();if(data.getClipData()!=null){for(int i=0;i<data.getClipData().getItemCount();i++)uris.add(data.getClipData().getItemAt(i).getUri());}else if(data.getData()!=null)uris.add(data.getData());
        task(files,()->{
            if(uris.isEmpty())return;
            if(role.equals("project")){event("document",ProjectArchive.read(this,uris.get(0),media).put("role",role).put("target",dest));return;}
            if(role.equals("srt")){String content=new String(Store.read(getContentResolver().openInputStream(uris.get(0)),8<<20),"UTF-8");event("document",Store.obj("role",role,"target",dest,"text",content));return;}
            JSONArray imported=new JSONArray(),errors=new JSONArray();
            for(int i=0;i<uris.size();i++){event("busy",Store.obj("message","素材を読み込み中 "+(i+1)+" / "+uris.size()));try{imported.put(media.add(uris.get(i)));}catch(Throwable e){errors.put(Store.message(e));}}
            event("import",Store.obj("role",role,"target",dest,"items",imported,"errors",errors));
        });
    }
    private void beginVoice(String dest,double start){
        voiceTarget=dest;voiceAt=start;if(recorder!=null)return;
        if(checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO},98);return;}
        try{
            recordingId=UUID.randomUUID().toString();recordingFile=Store.child(Store.folder(this,"media"),recordingId+".m4a");
            recorder=new android.media.MediaRecorder();recorder.setAudioSource(android.media.MediaRecorder.AudioSource.MIC);recorder.setOutputFormat(android.media.MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(android.media.MediaRecorder.AudioEncoder.AAC);recorder.setAudioSamplingRate(44100);recorder.setAudioEncodingBitRate(128000);recorder.setOutputFile(recordingFile.getPath());recorder.prepare();recorder.start();event("record",Store.obj("on",true));
        }catch(Exception e){if(recorder!=null)recorder.release();recorder=null;if(recordingFile!=null)recordingFile.delete();event("error",Store.obj("message","録音開始に失敗 · "+Store.message(e)));}
    }
    private void stopVoice(){
        if(recorder==null)return;android.media.MediaRecorder r=recorder;recorder=null;File output=recordingFile;String id=recordingId,dest=voiceTarget;double start=voiceAt;
        try{r.stop();task(files,()->{try{JSONObject item=media.recorded(output,id);event("voice",Store.obj("target",dest,"at",start,"item",item));}catch(Exception e){output.delete();throw e;}});}catch(RuntimeException e){output.delete();event("error",Store.obj("message","録音が短すぎます"));}finally{r.release();event("record",Store.obj("on",false));}
    }
    @Override public void onRequestPermissionsResult(int code,String[] permission,int[] result){super.onRequestPermissionsResult(code,permission,result);if(code==98){if(result.length>0&&result[0]==PackageManager.PERMISSION_GRANTED)beginVoice(voiceTarget,voiceAt);else event("error",Store.obj("message","ナレーションの録音にはマイクの許可が必要です"));}}
    @Override public void onStop(){if(recorder!=null)stopVoice();super.onStop();}
    private final class Bridge {
        @JavascriptInterface public void prune(){task(files,()->event("pruned",media.prune()));}
        @JavascriptInterface public void captions(String id,double from,double to,int chars,String ticket){task(files,()->captions.transcribe(MediaShelf.file(MainActivity.this,media.catalog().getJSONObject(id)),from,to,chars,ticket));}
        @JavascriptInterface public void cancelCaptions(){captions.cancel();}
        @JavascriptInterface public void voice(String dest,double at){runOnUiThread(()->{if(recorder!=null)stopVoice();else beginVoice(dest,at);});}
        @JavascriptInterface public String boot(){
            try{return Store.obj("state",new JSONObject(Store.get(MainActivity.this,"desk.json","{}")),"media",media.catalog(),"account",account.status(),"render",new JSONObject(RenderService.busy?RenderService.status:Store.get(MainActivity.this,"render-status.json","{\"phase\":\"idle\"}"))).toString();}catch(Exception e){return Store.obj("error",Store.message(e)).toString();}
        }
        @JavascriptInterface public String save(String json){try{if(json.length()>16000000)throw new IOException("保存データが大きすぎます");new JSONObject(json);Store.put(MainActivity.this,"desk.json",json);return "";}catch(Exception e){return Store.message(e);}}
        @JavascriptInterface public void pickFile(String role,String id){runOnUiThread(()->pick(role,id));}
        @JavascriptInterface public void demo(String dest){task(files,()->{media.demo();event("demo",Store.obj("target",dest,"media",media.catalog()));});}
        @JavascriptInterface public void proxy(String id){task(files,()->event("proxy",media.proxy(id)));}
        @JavascriptInterface public void analyze(String id,String kind,double from,double to,double threshold,double min,String ticket){task(files,()->event("analysis",media.analyze(id,kind,from,to,threshold,min).put("ticket",ticket)));}
        @JavascriptInterface public void writeDocument(String name,String mime,String content){runOnUiThread(()->{if(!picking.isEmpty())return;picking=mime.equals("application/zip")?"archiveSave":"save";pendingText=content;try{Store.put(MainActivity.this,"pending-document",content);startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE,name),20);}catch(Exception e){picking="";event("error",Store.obj("message","保存先を開けません"));}});}
        @JavascriptInterface public String startJob(String id,String spec){
            try{if(RenderService.busy)return "別の書き出しを実行中です";File dir=Store.child(Store.folder(MainActivity.this,"jobs"),id);dir.mkdirs();
                JSONObject plan=new JSONObject(spec);if(plan.getJSONArray("jobs").length()==0)return "書き出す内容がありません";
                try(FileOutputStream out=new FileOutputStream(new File(dir,"plan.json"))){out.write(spec.getBytes("UTF-8"));}
                runOnUiThread(()->{try{startForegroundService(new Intent(MainActivity.this,RenderService.class).putExtra("job",id));if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED&&!getPreferences(0).getBoolean("noticed",false)){getPreferences(0).edit().putBoolean("noticed",true).apply();requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},99);}}catch(Exception e){event("error",Store.obj("message",Store.message(e)));}});return "";
            }catch(Exception e){return Store.message(e);}
        }
        @JavascriptInterface public String stamp(String id,String name,String data){try{File d=Store.child(Store.folder(MainActivity.this,"jobs"),id);d.mkdirs();try(OutputStream o=new FileOutputStream(Store.child(d,name))){o.write(Base64.decode(data,Base64.DEFAULT));}return "";}catch(Exception e){return Store.message(e);}}
        @JavascriptInterface public void stopJob(){runOnUiThread(()->{if(RenderService.busy)startService(new Intent(MainActivity.this,RenderService.class).setAction("cancel"));});}
        @JavascriptInterface public void viewMovie(String u,boolean share){runOnUiThread(()->{try{Uri uri=Uri.parse(u);if(!"content".equals(uri.getScheme())||!"media".equals(uri.getAuthority()))return;Intent i=share?new Intent(Intent.ACTION_SEND).setType("video/mp4").putExtra(Intent.EXTRA_STREAM,uri):new Intent(Intent.ACTION_VIEW).setDataAndType(uri,"video/mp4");i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);startActivity(share?Intent.createChooser(i,"動画を共有"):i);}catch(Exception e){event("error",Store.obj("message","動画を開くアプリがありません"));}});}
        @JavascriptInterface public void signIn(String selected){account.login(selected);}
        @JavascriptInterface public void cancelAuth(){account.cancel();}
        @JavascriptInterface public void selectAccount(String id){task(ai,()->account.select(id));}
        @JavascriptInterface public void signOut(){task(ai,account::logout);}
        @JavascriptInterface public void models(){task(ai,()->event("models",Store.obj("list",account.models())));}
        @JavascriptInterface public void generate(String prompt,String model,String images,String ticket){task(ai,()->event("plan",Store.obj("text",account.generate(prompt,model,new JSONArray(images)),"ticket",ticket)));}
        @JavascriptInterface public void browserChat(String prompt){runOnUiThread(()->{((android.content.ClipboardManager)getSystemService(CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("Koma Studio 編集依頼",prompt));openBrowser("https://chatgpt.com/");});}
        @JavascriptInterface public void finishApp(){runOnUiThread(MainActivity.this::finish);}
    }
}
