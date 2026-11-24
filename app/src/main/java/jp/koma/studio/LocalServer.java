package jp.koma.studio;

import android.content.Context;
import android.net.Uri;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.*;

/** Serves only bundled UI and private media to the embedded WebView. Supports byte ranges. */
final class LocalServer implements Closeable {
    private final Context ctx;
    private final ServerSocket server;
    private final ExecutorService io=Executors.newFixedThreadPool(6);
    final String prefix="/"+UUID.randomUUID()+"/";
    final String root;
    LocalServer(Context c)throws IOException {
        ctx=c.getApplicationContext();server=new ServerSocket(0,24,InetAddress.getByName("127.0.0.1"));
        root="http://127.0.0.1:"+server.getLocalPort()+prefix;
        new Thread(()->{while(!server.isClosed())try{Socket s=server.accept();io.execute(()->serve(s));}catch(Exception e){if(!server.isClosed())break;}},"Koma-local").start();
    }
    static String mime(String file){String ext=file.replaceFirst("^.*\\.","").toLowerCase(Locale.ROOT);switch(ext){case "html":return "text/html; charset=utf-8";case "js":return "application/javascript";case "css":return "text/css";case "svg":return "image/svg+xml";case "png":return "image/png";case "jpg":case "jpeg":return "image/jpeg";case "webp":return "image/webp";case "mp4":case "mov":case "m4v":return "video/mp4";case "webm":return "video/webm";case "mp3":return "audio/mpeg";case "m4a":return "audio/mp4";case "wav":return "audio/wav";case "ogg":return "audio/ogg";default:return "application/octet-stream";}}
    private static void header(OutputStream out,String code,String headers)throws IOException{out.write(("HTTP/1.1 "+code+"\r\nConnection: close\r\nX-Content-Type-Options: nosniff\r\n"+headers+"\r\n").getBytes(StandardCharsets.US_ASCII));}
    private void serve(Socket socket){
        try(Socket s=socket){s.setSoTimeout(8000);BufferedReader r=new BufferedReader(new InputStreamReader(s.getInputStream(),StandardCharsets.US_ASCII));
            String line=r.readLine();if(line==null||line.length()>2048)return;String[] first=line.split(" ");if(first.length<2)return;
            OutputStream out=new BufferedOutputStream(s.getOutputStream());String range=null,host=null;
            for(int n=0;n<75;n++){String v=r.readLine();if(v==null||v.isEmpty())break;if(v.length()>8192)return;String lower=v.toLowerCase(Locale.ROOT);if(lower.startsWith("range:"))range=v.substring(6).trim();if(lower.startsWith("host:"))host=v.substring(5).trim();}
            if(!("127.0.0.1:"+server.getLocalPort()).equals(host)||!(first[0].equals("GET")||first[0].equals("HEAD"))||!first[1].startsWith(prefix)){header(out,"404 Not Found","Content-Length: 0\r\n");out.flush();return;}
            String path=first[1].substring(prefix.length()).split("\\?",2)[0];InputStream stream;long size;String type;
            if(path.matches("desk/[A-Za-z0-9_.-]+")){
                byte[] data=Store.read(ctx.getAssets().open(path),4<<20);stream=new ByteArrayInputStream(data);size=data.length;type=mime(path);
            }else if(path.matches("(media|thumb|proxy|renders)/[A-Za-z0-9_.-]+")){
                String[] parts=path.split("/");File file=Store.child(Store.folder(ctx,parts[0]),parts[1]);
                if(!file.isFile()){header(out,"404 Not Found","Content-Length: 0\r\n");out.flush();return;}
                stream=new FileInputStream(file);size=file.length();type=mime(file.getName());
            }else{header(out,"404 Not Found","Content-Length: 0\r\n");out.flush();return;}
            try(InputStream in=stream){
                long start=0,end=size-1;boolean partial=false;
                if(range!=null && range.matches("bytes=\\d*-\\d*")&&size>0){
                    String[] both=range.substring(6).split("-",-1);if(both[0].isEmpty()&&!both[1].isEmpty())start=Math.max(0,size-Long.parseLong(both[1]));
                    else if(!both[0].isEmpty()){start=Long.parseLong(both[0]);if(!both[1].isEmpty())end=Math.min(end,Long.parseLong(both[1]));}partial=true;
                }
                if(start>end||start>=size){header(out,"416 Range Not Satisfiable","Content-Range: bytes */"+size+"\r\nContent-Length: 0\r\n");out.flush();return;}
                long length=end-start+1;header(out,partial?"206 Partial Content":"200 OK","Accept-Ranges: bytes\r\nCache-Control: private, max-age=0\r\nContent-Type: "+type+"\r\nContent-Length: "+length+"\r\n"+(partial?"Content-Range: bytes "+start+"-"+end+"/"+size+"\r\n":""));
                if(first[0].equals("GET")){if(in instanceof FileInputStream)((FileInputStream)in).getChannel().position(start);else in.skip(start);byte[] b=new byte[65536];while(length>0){int n=in.read(b,0,(int)Math.min(length,b.length));if(n<0)break;out.write(b,0,n);length-=n;}}out.flush();
            }
        }catch(Exception ignored){/* WebView closes playback ranges during scrubbing. */}
    }
    public void close(){try{server.close();}catch(IOException ignored){}io.shutdownNow();}
}
