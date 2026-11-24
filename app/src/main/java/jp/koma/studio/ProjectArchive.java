package jp.koma.studio;

import android.content.Context;
import android.net.Uri;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.zip.*;
import org.json.*;

/** Portable .koma.zip. Only named project inputs are included, never account data. */
final class ProjectArchive {
    static void exportTo(Context ctx,Uri uri,String json,JSONObject shelf)throws Exception{
        JSONObject project=new JSONObject(json),items=new JSONObject();Set<String> ids=new LinkedHashSet<>();
        for(String list:new String[]{"clips","layers"}){JSONArray a=project.getJSONArray(list);for(int i=0;i<a.length();i++){String id=a.getJSONObject(i).optString("asset");if(!id.isEmpty())ids.add(id);}}
        try(ZipOutputStream zip=new ZipOutputStream(new BufferedOutputStream(ctx.getContentResolver().openOutputStream(uri,"wt")))){
            zip.setLevel(0);
            for(String id:ids){JSONObject m=shelf.getJSONObject(id);File source=MediaShelf.file(ctx,m);items.put(id,m);
                zip.putNextEntry(new ZipEntry("media/"+source.getName()));try(InputStream in=new FileInputStream(source)){transfer(in,zip,Long.MAX_VALUE);}zip.closeEntry();}
            byte[] body=Store.obj("format","koma-portable-1","project",project,"media",items).toString().getBytes(StandardCharsets.UTF_8);
            zip.putNextEntry(new ZipEntry("koma.json"));zip.write(body);zip.closeEntry();
        }catch(Exception e){try{ctx.getContentResolver().delete(uri,null,null);}catch(Exception ignored){}throw e;}
    }
    static long transfer(InputStream in,OutputStream out,long limit)throws IOException{byte[] b=new byte[65536];long total=0;int n;while((n=in.read(b))!=-1){total+=n;if(total>limit)throw new IOException("読み込みに必要な空き容量がありません");out.write(b,0,n);}return total;}
    static JSONObject read(Context ctx,Uri uri,MediaShelf shelf)throws Exception{
        File stage=new File(ctx.getCacheDir(),"restore-"+UUID.randomUUID());if(!stage.mkdir())throw new IOException("復元用フォルダを作成できません");
        try(InputStream raw=ctx.getContentResolver().openInputStream(uri);BufferedInputStream in=new BufferedInputStream(raw)){
            in.mark(4);int b=in.read(),c=in.read();in.reset();
            if(b!='P'||c!='K')return Store.obj("text",new String(Store.read(in,8<<20),StandardCharsets.UTF_8),"media",shelf.catalog());
            JSONObject manifest=null;Set<String> names=new HashSet<>();long remaining=Math.max(0,stage.getUsableSpace()-(64L<<20));
            try(ZipInputStream zip=new ZipInputStream(in)){ZipEntry entry;while((entry=zip.getNextEntry())!=null){String n=entry.getName();if(!names.add(n)||names.size()>1100)throw new IOException("作品ファイルの構成が無効です");
                if(n.equals("koma.json")){ByteArrayOutputStream data=new ByteArrayOutputStream();transfer(zip,data,12<<20);manifest=new JSONObject(data.toString("UTF-8"));}
                else if(n.matches("media/[a-zA-Z0-9_-]+\\.[a-zA-Z0-9]+")){try(OutputStream out=new FileOutputStream(Store.child(stage,n.substring(6)))){remaining-=transfer(zip,out,remaining);}}
                else throw new IOException("未対応の作品ファイルです");zip.closeEntry();}}
            if(manifest==null||!"koma-portable-1".equals(manifest.optString("format")))throw new IOException("Koma Studioの作品ファイルを選択してください");
            JSONObject project=manifest.getJSONObject("project"),sources=manifest.getJSONObject("media");
            if(project.optInt("version")!=1||project.getJSONArray("clips").length()>240||project.getJSONArray("layers").length()>800)throw new IOException("未対応のプロジェクト");
            for(String lane:new String[]{"clips","layers"}){JSONArray ar=project.getJSONArray(lane);for(int k=0;k<ar.length();k++){String id=ar.getJSONObject(k).optString("asset");if(!id.isEmpty()&&!sources.has(id))throw new IOException("プロジェクトの素材一覧が不完全です");}}
            // Reprobe the actual files, assign fresh IDs, and commit the catalog only after all inputs succeed.
            JSONObject remap=shelf.restore(stage,sources);
            for(String lane:new String[]{"clips","layers"}){JSONArray a=project.getJSONArray(lane);for(int i=0;i<a.length();i++){JSONObject item=a.getJSONObject(i);String id=item.optString("asset");if(!id.isEmpty())item.put("asset",remap.getString(id));}}
            return Store.obj("text",project.toString(),"media",shelf.catalog());
        }finally{Store.delete(stage);}
    }
}
