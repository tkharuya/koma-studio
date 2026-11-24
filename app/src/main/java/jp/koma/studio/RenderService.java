package jp.koma.studio;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.net.Uri;
import android.os.*;
import android.provider.MediaStore;
import com.arthenica.ffmpegkit.*;
import org.json.*;
import java.io.*;
import java.util.*;

public final class RenderService extends Service {
    public static final String EVENT="jp.koma.studio.RENDER";
    static volatile String status="{\"phase\":\"idle\"}";
    static volatile boolean busy=false;
    private volatile boolean cancelled=false;
    private volatile FFmpegSession active;
    private PowerManager.WakeLock lock;
    private long lastNotice;
    private static final int NOTIFY=44;
    static String friendly(Throwable e){return Store.message(e);}
    public IBinder onBind(Intent i){return null;}
    @Override public void onCreate(){super.onCreate();NotificationManager n=getSystemService(NotificationManager.class);
        n.createNotificationChannel(new NotificationChannel("render","動画の書き出し",NotificationManager.IMPORTANCE_LOW));}
    Notification notice(String msg,int percent){
        Intent go=new Intent(this,MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent open=PendingIntent.getActivity(this,2,go,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        Intent stop=new Intent(this,RenderService.class).setAction("cancel");PendingIntent cancel=PendingIntent.getService(this,3,stop,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        return new Notification.Builder(this,"render").setSmallIcon(android.R.drawable.ic_media_play).setContentTitle("Koma Studio").setContentText(msg).setContentIntent(open).setOngoing(true).setOnlyAlertOnce(true).setProgress(100,percent,percent<0).addAction(new Notification.Action.Builder(null,"中止",cancel).build()).build();
    }
    @Override public int onStartCommand(Intent i,int flags,int id){
        if(i==null){stopSelf();return START_NOT_STICKY;}
        if("cancel".equals(i.getAction())){cancelled=true;FFmpegSession s=active;if(s!=null)s.cancel();if(!busy)stopSelf();return START_NOT_STICKY;}
        if(busy)return START_NOT_STICKY;busy=true;cancelled=false;
        Notification n=notice("準備中",0);
        if(Build.VERSION.SDK_INT>=35)startForeground(NOTIFY,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PROCESSING);
        else if(Build.VERSION.SDK_INT>=29)startForeground(NOTIFY,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);else startForeground(NOTIFY,n);
        String job=i.getStringExtra("job");lock=getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Koma:export");lock.acquire(6*60*60*1000L);
        new Thread(()->runJob(job),"Koma-render").start();return START_NOT_STICKY;
    }
    private void update(String phase,String msg,int pct,String uri,boolean preview){
        status=Store.obj("phase",phase,"message",msg,"pct",pct,"uri",uri,"preview",preview).toString();
        if(!phase.equals("working"))try{Store.put(this,"render-status.json",status);}catch(IOException ignored){}
        sendBroadcast(new Intent(EVENT).setPackage(getPackageName()).putExtra("value",status));
        if(phase.equals("working")&&System.currentTimeMillis()-lastNotice>850){lastNotice=System.currentTimeMillis();getSystemService(NotificationManager.class).notify(NOTIFY,notice(msg,pct));}
    }
    private void runJob(String job){
        File dir=null;boolean preview=false;
        try{
            dir=Store.child(Store.folder(this,"jobs"),job);JSONObject plan=new JSONObject(new String(Store.read(new FileInputStream(new File(dir,"plan.json")),12<<20),"UTF-8"));
            preview=plan.optBoolean("preview"); final boolean isPreview=preview;
            JSONObject media=new JSONObject(Store.get(this,"media.json","{}"));JSONObject lists=plan.getJSONObject("lists");
            for(Iterator<String> it=lists.keys();it.hasNext();){String name=it.next();JSONArray v=lists.getJSONArray(name);try(Writer out=new OutputStreamWriter(new FileOutputStream(Store.child(dir,name)),"UTF-8")){out.write("ffconcat version 1.0\n");for(int j=0;j<v.length();j++){JSONObject entry=v.optJSONObject(j);String file=entry==null?v.getString(j):entry.getString("file");out.write("file '"+Store.child(dir,file).getName()+"'\n");if(entry!=null){out.write("option framerate "+entry.getInt("fps")+"\n");if(entry.has("seconds"))out.write("duration "+entry.getDouble("seconds")+"\n");}}}}
            JSONArray jobs=plan.getJSONArray("jobs");double total=0,elapsed=0;for(int i=0;i<jobs.length();i++)total+=jobs.getJSONObject(i).getDouble("secs");
            // Remove intermediate files immediately after their last consumer has finished.
            Map<String,Integer> last=new HashMap<>();for(int i=0;i<jobs.length();i++){JSONArray ar=jobs.getJSONObject(i).getJSONArray("args");for(int j=0;j<ar.length();j++){String a=ar.getString(j);if(a.startsWith("@w/")){String n=a.substring(3);last.put(n,i);JSONArray names=lists.optJSONArray(n);if(names!=null)for(int k=0;k<names.length();k++){JSONObject entry=names.optJSONObject(k);last.put(entry==null?names.getString(k):entry.getString("file"),i);}}}}
            for(int i=0;i<jobs.length();i++){
                if(cancelled)throw new InterruptedException();JSONObject task=jobs.getJSONObject(i);String msg=task.getString("label");JSONArray ar=task.getJSONArray("args");String[] args=new String[ar.length()];for(int j=0;j<args.length;j++){String a=ar.getString(j);args[j]=a.startsWith("@w/")?Store.child(dir,a.substring(3)).getPath():a.startsWith("@m/")?MediaShelf.file(this,media.getJSONObject(a.substring(3))).getPath():a;}
                final double base=elapsed,weight=task.getDouble("secs"),sum=total;update("working",msg,(int)(100*base/sum),"",preview);
                final long[] lastTick={0};FFmpegSession session=FFmpegSession.create(args,null,null,stat->{long now=System.currentTimeMillis();if(now-lastTick[0]<500)return;lastTick[0]=now;int pct=(int)(100*(base+Math.min(weight,Math.max(0,stat.getTime()/1000.0)))/sum);update("working",msg,Math.min(99,pct),"",isPreview);});
                active=session;if(cancelled)throw new InterruptedException();FFmpegKitConfig.ffmpegExecute(session);active=null;
                if(cancelled||ReturnCode.isCancel(session.getReturnCode()))throw new InterruptedException();
                if(!ReturnCode.isSuccess(session.getReturnCode())){String t=session.getAllLogsAsString().trim();throw new IOException(msg+"で失敗 · "+t.substring(Math.max(0,t.length()-650)));}
                elapsed+=weight;
                for(Map.Entry<String,Integer> entry:last.entrySet())if(entry.getValue()==i&&!entry.getKey().equals("result.mp4"))Store.child(dir,entry.getKey()).delete();
            }
            if(cancelled)throw new InterruptedException();File result=new File(dir,"result.mp4");if(result.length()<500)throw new IOException("MP4が空です");
            String location;
            if(preview){File target=Store.child(Store.folder(this,"renders"),job+".mp4");if(!result.renameTo(target))throw new IOException("確認動画を保存できません");File[] prior=target.getParentFile().listFiles();if(prior!=null)for(File f:prior)if(!f.equals(target))f.delete();location="renders/"+target.getName();}
            else {String name=plan.optString("title","Koma").replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]","_").trim();if(name.isEmpty())name="Koma";if(name.length()>70)name=name.substring(0,70);
                ContentValues values=new ContentValues();values.put(MediaStore.MediaColumns.DISPLAY_NAME,name+"_"+new java.text.SimpleDateFormat("yyyyMMdd_HHmmss",Locale.ROOT).format(new Date())+".mp4");values.put(MediaStore.MediaColumns.MIME_TYPE,"video/mp4");values.put(MediaStore.MediaColumns.RELATIVE_PATH,"Movies/Koma Studio");values.put(MediaStore.MediaColumns.IS_PENDING,1);
                Uri u=getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI,values);if(u==null)throw new IOException("Moviesに保存できません");
                try{Store.copy(new FileInputStream(result),getContentResolver().openOutputStream(u));if(cancelled)throw new InterruptedException();values.clear();values.put(MediaStore.MediaColumns.IS_PENDING,0);if(getContentResolver().update(u,values,null,null)<1)throw new IOException("動画を公開できません");}catch(Exception e){getContentResolver().delete(u,null,null);throw e;}location=u.toString();
            }
            update("done",preview?"レンダープレビューができました":"Movies/Koma Studio に保存しました",100,location,preview);
        }catch(InterruptedException e){update("cancel","書き出しを中止しました",0,"",preview);}
        catch(Throwable e){update("error",friendly(e),0,"",preview);}
        finally{active=null;if(dir!=null)Store.delete(dir);if(lock!=null&&lock.isHeld())lock.release();busy=false;stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
    }
    @Override public void onTimeout(int id,int type){cancelled=true;if(active!=null)active.cancel();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();}
}
