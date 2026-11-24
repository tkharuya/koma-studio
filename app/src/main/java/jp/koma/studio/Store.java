package jp.koma.studio;

import android.content.Context;
import android.util.AtomicFile;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

final class Store {
    static byte[] read(InputStream in,int limit) throws IOException {
        try(InputStream stream=in; ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buf=new byte[16384];int n;
            while((n=stream.read(buf))!=-1){if(out.size()+n>limit)throw new IOException("ファイルが大きすぎます");out.write(buf,0,n);}return out.toByteArray();
        }
    }
    static synchronized String get(Context c,String name,String fallback){
        try{return new String(read(new AtomicFile(new File(c.getFilesDir(),name)).openRead(),32<<20),StandardCharsets.UTF_8);}
        catch(FileNotFoundException e){return fallback;}catch(IOException e){throw new IllegalStateException("保存データを読み込めません",e);}
    }
    static synchronized void put(Context c,String name,String value)throws IOException {
        AtomicFile f=new AtomicFile(new File(c.getFilesDir(),name));FileOutputStream out=f.startWrite();
        try{out.write(value.getBytes(StandardCharsets.UTF_8));f.finishWrite(out);}catch(Exception e){f.failWrite(out);throw e;}
    }
    static File folder(Context c,String name){File f=new File(c.getFilesDir(),name);if(!f.isDirectory()&&!f.mkdirs())throw new IllegalStateException("保存場所を作成できません");return f;}
    static File child(File dir,String name){
        if(name==null||!name.matches("[A-Za-z0-9_-]+(?:\\.[A-Za-z0-9]+)?"))throw new IllegalArgumentException("素材名が無効です");
        return new File(dir,name);
    }
    static void copy(InputStream input,OutputStream output)throws IOException{try(InputStream in=input;OutputStream out=output){if(in==null||out==null)throw new IOException("ファイルを開けません");byte[] b=new byte[65536];int n;while((n=in.read(b))!=-1)out.write(b,0,n);}}
    static void delete(File f){File[] children=f.listFiles();if(children!=null)for(File item:children)delete(item);f.delete();}
    static JSONObject obj(Object... kv){JSONObject o=new JSONObject();try{for(int i=0;i<kv.length;i+=2)o.put((String)kv[i],kv[i+1]);}catch(JSONException e){throw new IllegalArgumentException(e);}return o;}
    static String message(Throwable e){String t=e.getMessage();return t==null?e.getClass().getSimpleName():t;}
}
