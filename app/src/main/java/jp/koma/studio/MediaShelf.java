package jp.koma.studio;

import android.content.*;
import android.database.Cursor;
import android.graphics.*;
import android.net.Uri;
import android.provider.OpenableColumns;
import com.arthenica.ffmpegkit.*;
import java.io.*;
import java.util.*;
import java.util.regex.*;
import org.json.*;

final class MediaShelf {
    private final MainActivity app;
    MediaShelf(MainActivity a){app=a;}
    synchronized JSONObject catalog()throws Exception{return new JSONObject(Store.get(app,"media.json","{}"));}
    private synchronized void record(JSONObject m)throws Exception{JSONObject items=catalog();items.put(m.getString("id"),m);Store.put(app,"media.json",items.toString());}
    private String title(Uri u){try(Cursor c=app.getContentResolver().query(u,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(c!=null&&c.moveToFirst())return c.getString(0);}catch(Exception ignored){}return "素材";}
    static File file(Context c,JSONObject m)throws Exception{return Store.child(Store.folder(c,"media"),m.getString("file"));}
    JSONObject add(Uri u)throws Exception{
        String name=title(u),mime=app.getContentResolver().getType(u),id=UUID.randomUUID().toString();
        String ext=name.replaceFirst("^.*\\.","").toLowerCase(Locale.ROOT);if(!ext.matches("[a-z0-9]{1,6}")||!name.contains("."))ext=mime!=null&&mime.startsWith("image/")?"jpg":mime!=null&&mime.startsWith("audio/")?"m4a":"mp4";
        File f=Store.child(Store.folder(app,"media"),id+"."+ext);try{
            Store.copy(app.getContentResolver().openInputStream(u),new FileOutputStream(f));
            JSONObject m=inspect(f,name,id,mime==null?"":mime);record(m);return m;
        }catch(Exception e){f.delete();Store.child(Store.folder(app,"thumb"),id+".jpg").delete();throw e;}
    }
    void demo()throws Exception{
        synchronized(this){for(String key:new String[]{"lake","sunrise"}){
            String id="demo_"+key;if(catalog().has(id))continue;
            File f=Store.child(Store.folder(app,"media"),id+".jpg");Store.copy(app.getAssets().open("demo/"+key+".jpg"),new FileOutputStream(f));
            JSONObject m=inspect(f,key.equals("lake")?"本栖湖・湖畔":"本栖湖・日の出",id,"image/jpeg");record(m);
        }}
    }
    private JSONObject inspect(File f,String title,String id,String mime)throws Exception{
        JSONObject m=Store.obj("id",id,"file",f.getName(),"name",title,"audio",false,"duration",0,"width",0,"height",0,"kind","video");
        BitmapFactory.Options opt=new BitmapFactory.Options();opt.inJustDecodeBounds=true;BitmapFactory.decodeFile(f.getPath(),opt);
        if(opt.outWidth>0 && (mime.startsWith("image/")||f.getName().matches("(?i).+\\.(png|jpe?g|webp|heic|bmp|gif|avif)"))){
            m.put("kind","image").put("width",opt.outWidth).put("height",opt.outHeight).put("duration",4);
        }else{
            MediaInformation info=FFprobeKit.getMediaInformation(f.getPath()).getMediaInformation();if(info==null)throw new IOException("素材の形式を読み取れません");
            double duration=0;try{duration=Double.parseDouble(info.getDuration());}catch(Exception ignored){}
            boolean video=false,audio=false;for(StreamInformation s:info.getStreams()){
                if("video".equals(s.getType())&&!video){JSONObject disp=s.getAllProperties().optJSONObject("disposition");if(disp!=null&&disp.optInt("attached_pic")==1)continue;video=true;m.put("width",s.getWidth()).put("height",s.getHeight()).put("codec",s.getCodec());}
                if("audio".equals(s.getType()))audio=true;
            }
            if(!audio&&!video||!(duration>.02))throw new IOException("再生時間または映像・音声を取得できません");
            m.put("kind",video?"video":"audio").put("audio",audio).put("duration",duration);
        }
        File thumb=Store.child(Store.folder(app,"thumb"),id+".jpg");
        if(!m.getString("kind").equals("audio")){
            String[] args={"-hide_banner","-loglevel","error","-y","-threads","1","-ss",m.optString("kind").equals("video")?String.valueOf(Math.min(m.optDouble("duration")*.25,3)): "0","-i",f.getPath(),"-frames:v","1","-vf","scale=440:440:force_original_aspect_ratio=decrease","-q:v","4","-threads","1",thumb.getPath()};
            FFmpegSession session=FFmpegKit.executeWithArguments(args);
            if(!ReturnCode.isSuccess(session.getReturnCode())&&m.getString("kind").equals("image")){BitmapFactory.Options dec=new BitmapFactory.Options();dec.inSampleSize=Math.max(1,Math.max(opt.outWidth,opt.outHeight)/480);Bitmap b=BitmapFactory.decodeFile(f.getPath(),dec);if(b!=null)try(OutputStream out=new FileOutputStream(thumb)){b.compress(Bitmap.CompressFormat.JPEG,80,out);b.recycle();}}
        }else{
            FFmpegKit.executeWithArguments(new String[]{"-v","error","-y","-i",f.getPath(),"-filter_complex","showwavespic=s=440x80:colors=0x60cbb8","-frames:v","1","-threads","1",thumb.getPath()});
        }
        if(m.optString("kind").equals("video"))m.put("strip",filmstrip(f,id,m.getDouble("duration")));
        return m.put("thumb",thumb.isFile());
    }
    synchronized JSONObject prune()throws Exception{
        if(RenderService.busy)throw new IOException("書き出しが終わってから整理してください");
        JSONObject state=new JSONObject(Store.get(app,"desk.json","{}")),items=catalog();Set<String> keep=new HashSet<>();JSONArray projects=state.getJSONArray("projects");
        for(int j=0;j<projects.length();j++)for(String key:new String[]{"clips","layers"}){
            JSONArray entries=projects.getJSONObject(j).getJSONArray(key);for(int i=0;i<entries.length();i++)keep.add(entries.getJSONObject(i).optString("asset"));
        }
        JSONObject next=new JSONObject();List<File> remove=new ArrayList<>();int count=0;long bytes=0;
        for(Iterator<String> it=items.keys();it.hasNext();){String id=it.next();JSONObject m=items.getJSONObject(id);if(keep.contains(id)){next.put(id,m);continue;}count++;
            remove.add(file(app,m));remove.add(Store.child(Store.folder(app,"thumb"),id+".jpg"));remove.add(Store.child(Store.folder(app,"thumb"),id+"-strip.jpg"));remove.add(Store.child(Store.folder(app,"proxy"),id+".mp4"));
        }
        Store.put(app,"media.json",next.toString());for(File file:remove){long size=file.length();if(file.delete())bytes+=size;}
        return Store.obj("media",next,"count",count,"bytes",bytes);
    }
    synchronized JSONObject restore(File stage,JSONObject sources)throws Exception{
        JSONObject next=catalog(),remap=new JSONObject();List<File> created=new ArrayList<>();
        try{
            for(Iterator<String> it=sources.keys();it.hasNext();){
                String prior=it.next();JSONObject m=sources.getJSONObject(prior);File f=Store.child(stage,m.getString("file"));
                if(!f.isFile())throw new IOException("同梱素材が不足しています");
                String newId=UUID.randomUUID().toString(),extension=f.getName().substring(f.getName().lastIndexOf('.'));
                File dest=Store.child(Store.folder(app,"media"),newId+extension);if(!f.renameTo(dest))throw new IOException("素材を復元できません");created.add(dest);
                created.add(Store.child(Store.folder(app,"thumb"),newId+".jpg"));created.add(Store.child(Store.folder(app,"thumb"),newId+"-strip.jpg"));
                JSONObject fresh=inspect(dest,m.optString("name","復元素材"),newId,m.optString("kind").equals("image")?"image/*":"");next.put(newId,fresh);remap.put(prior,newId);
            }
            Store.put(app,"media.json",next.toString());return remap;
        }catch(Exception e){for(File f:created)f.delete();throw e;}
    }
    JSONObject recorded(File f,String id)throws Exception{
        JSONObject m=inspect(f,"ナレーション "+new java.text.SimpleDateFormat("HHmmss",Locale.ROOT).format(new Date()),id,"audio/mp4");record(m);return m;
    }
    private boolean filmstrip(File source,String id,double duration){
        android.media.MediaMetadataRetriever retriever=new android.media.MediaMetadataRetriever();
        Bitmap strip=null;
        try{
            retriever.setDataSource(source.getPath());strip=Bitmap.createBitmap(640,90,Bitmap.Config.ARGB_8888);android.graphics.Canvas canvas=new android.graphics.Canvas(strip);
            android.graphics.Paint paint=new android.graphics.Paint(android.graphics.Paint.FILTER_BITMAP_FLAG);int count=0;
            for(double pos:new double[]{.07,.35,.63,.90}){
                Bitmap bmp=retriever.getScaledFrameAtTime((long)(Math.max(0,duration-.02)*pos*1000000),android.media.MediaMetadataRetriever.OPTION_CLOSEST_SYNC,160,90);
                if(bmp==null)return false;float scale=Math.max(160f/bmp.getWidth(),90f/bmp.getHeight()),width=bmp.getWidth()*scale,height=bmp.getHeight()*scale;
                float left=count*160+(160-width)/2,top=(90-height)/2;canvas.save();canvas.clipRect(count*160,0,(count+1)*160,90);canvas.drawBitmap(bmp,null,new android.graphics.RectF(left,top,left+width,top+height),paint);canvas.restore();bmp.recycle();count++;
            }
            try(OutputStream out=new FileOutputStream(Store.child(Store.folder(app,"thumb"),id+"-strip.jpg"))){return strip.compress(Bitmap.CompressFormat.JPEG,84,out);}
        }catch(Exception e){return false;}finally{try{retriever.release();}catch(Exception ignored){}if(strip!=null)strip.recycle();}
    }
    JSONObject proxy(String id)throws Exception{
        JSONObject m=catalog().getJSONObject(id);File src=file(app,m);File dest=Store.child(Store.folder(app,"proxy"),id+".mp4");
        if(!dest.isFile()){File temp=Store.child(Store.folder(app,"proxy"),id+"-part.mp4");FFmpegSession s=FFmpegKit.executeWithArguments(new String[]{"-hide_banner","-loglevel","error","-y","-threads","2","-i",src.getPath(),"-map","0:v:0","-map","0:a:0?","-vf","scale=960:960:force_original_aspect_ratio=decrease:force_divisible_by=2","-c:v","libx264","-threads","2","-preset","ultrafast","-crf","25","-pix_fmt","yuv420p","-c:a","aac","-movflags","+faststart",temp.getPath()});if(!ReturnCode.isSuccess(s.getReturnCode())||!temp.renameTo(dest)){temp.delete();throw new IOException("軽量プレビューの作成に失敗しました");}}
        m.put("proxy",true);record(m);return m;
    }
    JSONObject analyze(String id,String kind,double from,double to,double threshold,double min)throws Exception{
        JSONObject m=catalog().getJSONObject(id);if(!kind.equals("scene")&&!kind.equals("silence"))throw new IOException("解析方法が無効です");
        if(!Double.isFinite(from)||!Double.isFinite(to)||from<0||to<=from||to>m.optDouble("duration")+.1)throw new IOException("解析区間が無効です");
        String src=file(app,m).getPath();List<String> args=new ArrayList<>(Arrays.asList("-hide_banner","-nostats","-loglevel","info","-threads","2","-ss",String.valueOf(from),"-t",String.valueOf(to-from),"-i",src));
        boolean silence=kind.equals("silence");
        if(silence){if(!m.optBoolean("audio"))throw new IOException("この素材に音声はありません");Collections.addAll(args,"-vn","-af","silencedetect=noise="+Math.max(-65,Math.min(-15,threshold))+"dB:d="+Math.max(.15,Math.min(4,min)));}
        else Collections.addAll(args,"-an","-vf","scale=240:-2,select='gt(scene,"+Math.max(.08,Math.min(.8,threshold))+")',showinfo");
        Collections.addAll(args,"-f","null","-");FFmpegSession session=FFmpegKit.executeWithArguments(args.toArray(new String[0]));if(!ReturnCode.isSuccess(session.getReturnCode()))throw new IOException("素材解析に失敗しました");
        String log=session.getAllLogsAsString();JSONArray points=new JSONArray();
        Pattern pattern=Pattern.compile(silence?"silence_(start|end):\\s*(-?[\\d.]+)":"pts_time:\\s*(-?[\\d.]+)");Matcher match=pattern.matcher(log);while(match.find()&&points.length()<500){if(silence)points.put(Store.obj("kind",match.group(1),"t",from+Double.parseDouble(match.group(2))));else points.put(from+Double.parseDouble(match.group(1)));}
        return Store.obj("kind",kind,"points",points);
    }
}
