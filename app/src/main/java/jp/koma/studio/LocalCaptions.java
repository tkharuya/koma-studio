package jp.koma.studio;

import com.arthenica.ffmpegkit.*;
import org.vosk.Model;
import org.vosk.Recognizer;
import org.json.*;
import java.io.*;
import java.util.UUID;
import java.util.zip.*;

/** Local 16 kHz Japanese speech recognition, with time-aligned editable captions. */
final class LocalCaptions {
    private final MainActivity app;
    private volatile boolean cancelled;
    private volatile FFmpegSession decoding;
    LocalCaptions(MainActivity a){app=a;}
    void cancel(){cancelled=true;FFmpegSession s=decoding;if(s!=null)s.cancel();}
    private File model()throws Exception{
        File dir=Store.folder(app,"speech"),target=new File(dir,"ja-v022");
        if(new File(target,"ok").isFile())return target;
        File work=new File(dir,"unpack-"+UUID.randomUUID());if(!work.mkdir())throw new IOException("モデルを展開できません");
        String prefix="vosk-model-small-ja-0.22/";
        try(ZipInputStream zip=new ZipInputStream(new BufferedInputStream(app.getAssets().open("speech/ja-small.zip")))){
            ZipEntry e;while((e=zip.getNextEntry())!=null){
                if(cancelled)throw new InterruptedException("字幕作成を中止しました");
                String name=e.getName();if(!name.startsWith(prefix))throw new IOException("音声モデル形式が無効");
                if(e.isDirectory())continue;File f=new File(work,name.substring(prefix.length()));
                if(!f.getCanonicalPath().startsWith(work.getCanonicalPath()+File.separator))throw new IOException("音声モデルのパスが無効");
                File parent=f.getParentFile();if(!parent.isDirectory()&&!parent.mkdirs())throw new IOException("空き容量を確認してください");
                try(OutputStream out=new BufferedOutputStream(new FileOutputStream(f))){ProjectArchive.transfer(zip,out,128L<<20);}
            }new File(work,"ok").createNewFile();if(target.exists())Store.delete(target);if(!work.renameTo(target))throw new IOException("音声モデルを保存できません");return target;
        }finally{if(work.exists())Store.delete(work);}
    }
    void transcribe(File source,double from,double to,int chars,String ticket)throws Exception{
        if(!Double.isFinite(from)||!Double.isFinite(to)||from<0||to<=from)throw new IOException("字幕区間が無効です");
        cancelled=false;File pcm=File.createTempFile("koma-captions",".pcm",app.getCacheDir());
        try{
            status(ticket,"日本語モデルを準備中",0);File modelDir=model();
            status(ticket,"音声を抽出中",3);String[] args={"-v","error","-y","-ss",String.valueOf(from),"-t",String.valueOf(to-from),"-threads","1","-i",source.getPath(),"-map","0:a:0","-vn","-ac","1","-ar","16000","-f","s16le",pcm.getPath()};
            decoding=FFmpegSession.create(args);if(cancelled)throw new InterruptedException("字幕作成を中止しました");FFmpegKitConfig.ffmpegExecute(decoding);
            if(cancelled)throw new InterruptedException("字幕作成を中止しました");if(!ReturnCode.isSuccess(decoding.getReturnCode()))throw new IOException("元の音声を抽出できません");decoding=null;
            CaptionGroups groups=new CaptionGroups(Math.max(8,Math.min(48,chars)));long bytes=0,lastUpdate=0,total=pcm.length();
            status(ticket,"端末で音声を認識中",8);
            try(Model model=new Model(modelDir.getPath());Recognizer rec=new Recognizer(model,16000f);InputStream in=new BufferedInputStream(new FileInputStream(pcm))){
                rec.setWords(true);byte[] buffer=new byte[8000];int n;
                while((n=in.read(buffer))!=-1){if(cancelled)throw new InterruptedException("字幕作成を中止しました");if(rec.acceptWaveForm(buffer,n))groups.add(rec.getResult());bytes+=n;
                    if(System.currentTimeMillis()-lastUpdate>1500){status(ticket,"端末で音声を認識中",8+(int)(90.0*bytes/Math.max(1,total)));lastUpdate=System.currentTimeMillis();}}
                groups.add(rec.getFinalResult());
            }
            groups.flush();if(cancelled)throw new InterruptedException("字幕作成を中止しました");app.event("captions",Store.obj("ticket",ticket,"cues",groups.cues));
        }finally{decoding=null;pcm.delete();}
    }
    private void status(String ticket,String label,int pct){app.event("captionProgress",Store.obj("ticket",ticket,"message",label,"pct",pct));}
    static class CaptionGroups {
        final int max;final JSONArray cues=new JSONArray();String text="";double start,end;
        CaptionGroups(int max){this.max=max;}
        void flush()throws Exception{if(!text.isEmpty()){cues.put(Store.obj("text",text,"start",start,"end",end));text="";if(cues.length()>780)throw new IOException("字幕が多すぎます。クリップを分割して区間ごとに認識してください");}}
        void add(String json)throws Exception{
            JSONObject result=new JSONObject(json);JSONArray words=result.optJSONArray("result");if(words==null)return;
            for(int i=0;i<words.length();i++){JSONObject word=words.getJSONObject(i);String w=word.optString("word").replace("<unk>","").trim();if(w.isEmpty()||w.equals("[unk]"))continue;
                double a=word.getDouble("start"),b=word.getDouble("end");if(b<=a)continue;if(!text.isEmpty()&&(a-end>.55||b-start>3.8||text.length()+w.length()>max))flush();
                if(text.isEmpty())start=a;else if(isAsciiWord(text.charAt(text.length()-1))&&isAsciiWord(w.charAt(0)))text+=" ";text+=w;end=b;
            }flush();
        }
        boolean isAsciiWord(char c){return c<128&&Character.isLetterOrDigit(c);}
    }
}
