package jp.koma.studio;

import android.content.*;
import android.net.Uri;
import android.security.keystore.*;
import android.util.Base64;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.security.spec.*;
import java.math.BigInteger;
import java.util.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;
import org.json.*;

/** Public native OAuth client. Account credentials never cross the WebView bridge. */
final class PlanAccount {
    static final String ISS="https://auth.openai.com", API="https://api.openai.com/v1";
    static final String SCOPE="openid profile email offline_access resource.invoke chatgpt.tokens.use.direct";
    final MainActivity app;
    final SharedPreferences prefs;
    volatile ServerSocket waiting;
    String stage="";
    PlanAccount(MainActivity activity){app=activity;prefs=app.getSharedPreferences("account",0);}
    private static String enc(byte[] b){return Base64.encodeToString(b,Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING);}
    private static byte[] dec(String s){return Base64.decode(s,Base64.URL_SAFE|Base64.NO_WRAP);}
    static String token(){byte[] b=new byte[32];new SecureRandom().nextBytes(b);return enc(b);}
    private static String form(String... kv)throws Exception{StringBuilder s=new StringBuilder();for(int i=0;i<kv.length;i+=2){if(i>0)s.append('&');s.append(URLEncoder.encode(kv[i],"UTF-8")).append('=').append(URLEncoder.encode(kv[i+1],"UTF-8"));}return s.toString();}
    private SecretKey key()throws Exception{
        KeyStore ks=KeyStore.getInstance("AndroidKeyStore");ks.load(null);
        if(!ks.containsAlias("koma-plan-v1")){
            KeyGenerator gen=KeyGenerator.getInstance("AES","AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder("koma-plan-v1",KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT).setBlockModes("GCM").setEncryptionPaddings("NoPadding").build());return gen.generateKey();
        }return (SecretKey)ks.getKey("koma-plan-v1",null);
    }
    private synchronized JSONObject vault()throws Exception{
        String raw=prefs.getString("vault","");if(raw.isEmpty())return new JSONObject();
        String[] p=raw.split("\\.");Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.DECRYPT_MODE,key(),new GCMParameterSpec(128,dec(p[0])));
        return new JSONObject(new String(c.doFinal(dec(p[1])),StandardCharsets.UTF_8));
    }
    private synchronized void save(JSONObject data)throws Exception{
        Cipher c=Cipher.getInstance("AES/GCM/NoPadding");c.init(Cipher.ENCRYPT_MODE,key());
        String v=enc(c.getIV())+"."+enc(c.doFinal(data.toString().getBytes(StandardCharsets.UTF_8)));
        if(!prefs.edit().putString("vault",v).commit())throw new IOException("接続情報の保存に失敗");
    }
    private synchronized String host(){
        String h=prefs.getString("host","");if(h.isEmpty()){h="urn:uuid:"+UUID.randomUUID();prefs.edit().putString("host",h).commit();}return h;
    }
    JSONObject status(){
        try{JSONObject v=vault();JSONArray accounts=new JSONArray();Iterator<String> it=v.keys();String active=prefs.getString("active","");
            while(it.hasNext()){String k=it.next();JSONObject a=v.getJSONObject(k);accounts.put(Store.obj("id",k,"label",a.optString("email","ChatGPT")+" · "+k.substring(Math.max(0,k.length()-5)),"active",k.equals(active),"signed",!a.optString("access_token").isEmpty(),"plan",permitted(a)));}
            return Store.obj("accounts",accounts,"active",active,"waiting",waiting!=null);
        }catch(Exception e){return Store.obj("accounts",new JSONArray(),"error","接続情報を読み込めません");}
    }
    static boolean permitted(JSONObject a){return Arrays.asList(a.optString("scope").split("\\s+")).contains("chatgpt.tokens.use.direct");}
    void note(String msg){app.event("auth",Store.obj("message",msg,"status",status()));}
    static HttpURLConnection connection(String url,String bearer)throws Exception{
        URL target=new URL(url);if(!"https".equals(target.getProtocol())||!("auth.openai.com".equals(target.getHost())||"api.openai.com".equals(target.getHost())))throw new IOException("接続先を検証できません");
        HttpURLConnection h=(HttpURLConnection)target.openConnection();h.setInstanceFollowRedirects(false);h.setConnectTimeout(18000);h.setReadTimeout(90000);h.setRequestProperty("User-Agent","KomaStudio-Android/1.0");if(bearer!=null)h.setRequestProperty("Authorization","Bearer "+bearer);return h;
    }
    static void body(HttpURLConnection h,String type,String payload)throws Exception{
        h.setRequestMethod("POST");h.setDoOutput(true);h.setRequestProperty("Content-Type",type);try(OutputStream s=h.getOutputStream()){s.write(payload.getBytes(StandardCharsets.UTF_8));}
    }
    static String error(HttpURLConnection h)throws Exception{
        String code="";InputStream err=h.getErrorStream();if(err!=null){try{JSONObject j=new JSONObject(new String(Store.read(err,1<<18),StandardCharsets.UTF_8));Object o=j.opt("error");code=o instanceof JSONObject?((JSONObject)o).optString("code"):String.valueOf(o);if(!code.matches("[a-zA-Z0-9_.-]{1,90}"))code="";}catch(Exception ignored){}}
        return "HTTP "+h.getResponseCode()+(code.isEmpty()?"":" · "+code);
    }
    static JSONObject json(String url,String bearer,String form)throws Exception{
        HttpURLConnection h=connection(url,bearer);try{
            if(form!=null)body(h,"application/x-www-form-urlencoded",form);
            if(h.getResponseCode()/100!=2)throw new IOException(error(h));
            byte[] b=Store.read(h.getInputStream(),4<<20);return b.length==0?new JSONObject():new JSONObject(new String(b,StandardCharsets.UTF_8));
        }finally{h.disconnect();}
    }
    private JSONObject discovery()throws Exception{
        JSONObject o=json(ISS+"/.well-known/openid-configuration",null,null);if(!ISS.equals(o.getString("issuer")))throw new IOException("発行者を検証できません");return o;
    }
    private JSONObject identity(String jwt,String client,String nonce)throws Exception{
        String[] p=jwt.split("\\.");if(p.length!=3)throw new IOException("IDトークン形式が無効");
        JSONObject header=new JSONObject(new String(dec(p[0]),StandardCharsets.UTF_8));if(!"RS256".equals(header.optString("alg")))throw new IOException("署名方式が未対応");
        JSONArray keys=json(discovery().getString("jwks_uri"),null,null).getJSONArray("keys");PublicKey key=null;
        for(int i=0;i<keys.length();i++){JSONObject jwk=keys.getJSONObject(i);if("RSA".equals(jwk.optString("kty"))&&jwk.optString("kid").equals(header.getString("kid"))){key=KeyFactory.getInstance("RSA").generatePublic(new RSAPublicKeySpec(new BigInteger(1,dec(jwk.getString("n"))),new BigInteger(1,dec(jwk.getString("e")))));break;}}
        if(key==null)throw new IOException("署名鍵が見つかりません");Signature sig=Signature.getInstance("SHA256withRSA");sig.initVerify(key);sig.update((p[0]+"."+p[1]).getBytes(StandardCharsets.US_ASCII));if(!sig.verify(dec(p[2])))throw new IOException("IDトークンの署名が無効");
        JSONObject b=new JSONObject(new String(dec(p[1]),StandardCharsets.UTF_8));Object aud=b.get("aud");boolean match=client.equals(aud);
        if(aud instanceof JSONArray){JSONArray a=(JSONArray)aud;for(int i=0;i<a.length();i++)if(client.equals(a.optString(i)))match=true;if(a.length()>1&&!client.equals(b.optString("azp")))match=false;}
        if(!ISS.equals(b.optString("iss"))||!match||!nonce.equals(b.optString("nonce"))||b.optLong("exp")<=System.currentTimeMillis()/1000||b.optString("sub").isEmpty())throw new IOException("IDトークンの対象・期限・nonceを確認できません");return b;
    }
    void cancel(){ServerSocket s=waiting;if(s!=null)try{s.close();}catch(IOException ignored){}}
    void login(String selected){
        if(waiting!=null){note("接続を待っています。ブラウザで続けてください。");return;}
        new Thread(()->{ServerSocket sock=null;String step="認証開始";
            try{
                JSONObject old=selected.isEmpty()?null:vault().optJSONObject(selected);if(!selected.isEmpty()&&old==null)throw new IOException("アカウントを選び直してください");
                sock=new ServerSocket(0,6,InetAddress.getByName("127.0.0.1"));synchronized(this){if(waiting!=null){sock.close();return;}waiting=sock;}sock.setSoTimeout(2000);
                String redirect="http://127.0.0.1:"+sock.getLocalPort()+"/auth/callback",state=token(),nonce=token(),verifier=token();
                String query=form("client_id",old==null?"dynamic_agent_client":selected,"ext_agent_host_id",host(),"response_type","code","redirect_uri",redirect,"scope",SCOPE,"resource",API,"state",state,"nonce",nonce,"code_challenge_method","S256","code_challenge",enc(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII))));
                if(old==null)query+="&"+form("agent_name_hint","Koma Studio");else if(!old.optString("id_token").isEmpty())query+="&"+form("id_token_hint",old.getString("id_token"));
                app.openBrowser(ISS+"/api/accounts/authorize?"+query);note("ブラウザでログインとプラン利用の許可を完了してください。");
                Uri cb=null;long deadline=System.currentTimeMillis()+300000;
                while(System.currentTimeMillis()<deadline && cb==null){
                    try(Socket s=sock.accept()){s.setSoTimeout(4000);BufferedReader br=new BufferedReader(new InputStreamReader(s.getInputStream(),StandardCharsets.US_ASCII));String request=br.readLine();if(request==null||request.length()>24000)continue;String[] req=request.split(" ");Uri u=req.length>1?Uri.parse(req[1]):null;
                        boolean valid=req[0].equals("GET")&&u!=null&&"/auth/callback".equals(u.getPath())&&state.equals(u.getQueryParameter("state"));
                        String html=valid?"<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'><style>body{background:#16191e;color:white;font:18px sans-serif;padding:32px}a{color:#dcfa70}</style><h1>Koma Studio</h1><p>認証応答を受け取りました。アプリに戻って接続結果を確認してください。</p><a href='komaedit://return'>アプリに戻る</a>":"Invalid callback";
                        byte[] b=html.getBytes(StandardCharsets.UTF_8);OutputStream out=s.getOutputStream();out.write(("HTTP/1.1 "+(valid?"200 OK":"400 Bad Request")+"\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: "+b.length+"\r\nConnection: close\r\n\r\n").getBytes(StandardCharsets.US_ASCII));out.write(b);out.flush();if(valid)cb=u;
                    }catch(SocketTimeoutException e){/* Keep waiting for the user's browser. */}
                }
                if(cb==null)throw new IOException("接続待ち時間を超えました。もう一度接続してください。");
                if(cb.getQueryParameter("error")!=null)throw new IOException("認証またはプラン利用が許可されませんでした");
                String client=cb.getQueryParameter("client_id"),code=cb.getQueryParameter("code");
                if(old!=null&&client==null)client=selected;
                if(client==null||client.equals("dynamic_agent_client")||(old!=null&&!selected.equals(client))||code==null)throw new IOException("認証応答のclient_idまたはcodeが無効");
                step="認証情報の受信";String payload=form("grant_type","authorization_code","client_id",client,"code",code,"code_verifier",verifier,"redirect_uri",redirect,"resource",API);
                JSONObject session;
                try{session=json(ISS+"/api/accounts/oauth/token",null,payload);}catch(UnknownHostException err){Thread.sleep(750);session=json(ISS+"/api/accounts/oauth/token",null,payload);}
                step="署名確認";JSONObject verified=identity(session.getString("id_token"),client,nonce);
                if(old!=null&&!old.getString("sub").equals(verified.getString("sub")))throw new IOException("登録時のアカウントと一致しません");
                session.put("sub",verified.getString("sub")).put("email",verified.optString("email","ChatGPT")).put("expires",System.currentTimeMillis()+1000L*session.optLong("expires_in",3600));session.getString("access_token");
                synchronized(this){JSONObject v=vault();v.put(client,session);save(v);prefs.edit().putString("active",client).commit();}
                note(permitted(session)?"ChatGPTに接続しました。":"サインインしました。自動編集にはプラン利用の許可が必要です。");
            }catch(Exception e){note(step+" · "+diagnose(e));}
            finally{if(sock!=null)try{sock.close();}catch(IOException ignored){}synchronized(this){if(waiting==sock)waiting=null;}app.event("account",status());}
        },"Koma-signin").start();
    }
    static String diagnose(Exception e){if(e instanceof UnknownHostException)return "OpenAIのドメインを解決できません。回線やプライベートDNSを確認し、再接続してください。";if(e instanceof SocketTimeoutException)return "通信がタイムアウトしました。";return Store.message(e);}
    synchronized void select(String client)throws Exception{if(vault().has(client))prefs.edit().putString("active",client).commit();app.event("account",status());}
    synchronized String access()throws Exception{
        String client=prefs.getString("active","");JSONObject v=vault(),a=v.optJSONObject(client);
        if(a==null||a.optString("access_token").isEmpty())throw new IOException("ChatGPTに接続してください");
        if(!permitted(a))throw new IOException("ChatGPTプランの利用を許可してください");
        if(a.optLong("expires")<System.currentTimeMillis()+75000){
            JSONObject fresh=json(ISS+"/api/accounts/oauth/token",null,form("grant_type","refresh_token","client_id",client,"refresh_token",a.getString("refresh_token"),"resource",API));
            a.put("access_token",fresh.getString("access_token"));if(fresh.has("refresh_token"))a.put("refresh_token",fresh.getString("refresh_token"));
            if(fresh.has("scope"))a.put("scope",fresh.getString("scope"));a.put("expires",System.currentTimeMillis()+1000L*fresh.optLong("expires_in",3600));save(v);if(!permitted(a))throw new IOException("ChatGPTプラン利用の再認証が必要です");
        }return a.getString("access_token");
    }
    synchronized void logout()throws Exception{
        String client=prefs.getString("active","");JSONObject v=vault(),a=v.optJSONObject(client);if(a==null)return;boolean remote=true;
        if(!a.optString("refresh_token").isEmpty()){remote=false;for(int i=0;i<2&&!remote;i++)try{json(discovery().getString("revocation_endpoint"),null,form("token",a.getString("refresh_token"),"token_type_hint","refresh_token","client_id",client));remote=true;}catch(Exception e){if(i==0)Thread.sleep(550);}}
        for(String k:new String[]{"access_token","refresh_token","id_token","expires"})a.remove(k);save(v);note(remote?"ログアウトしました":"端末からログアウトしました。サーバー側の解除はChatGPTの設定から確認してください。");
    }
    JSONArray models()throws Exception{
        JSONObject o=json(API+"/models",access(),null);JSONArray source=o.optJSONArray("models");JSONArray list=new JSONArray();if(source==null)source=o.getJSONArray("data");
        for(int i=0;i<source.length();i++){JSONObject x=source.getJSONObject(i);if(!"list".equals(x.optString("visibility","list")))continue;String slug=x.optString("slug",x.optString("id"));if(slug.isEmpty())continue;list.put(Store.obj("slug",slug,"name",x.optString("display_name",slug)));}if(list.length()==0)throw new IOException("利用可能なモデルがありません");return list;
    }
    String generate(String prompt,String model,JSONArray refs)throws Exception{
        String bearer=access();if(model.isEmpty())model=models().getJSONObject(0).getString("slug");
        JSONArray content=new JSONArray().put(Store.obj("type","input_text","text",prompt));for(int i=0;i<Math.min(6,refs.length());i++){File th=Store.child(Store.folder(app,"thumb"),refs.getString(i)+".jpg");File strip=Store.child(Store.folder(app,"thumb"),refs.getString(i)+"-strip.jpg");if(strip.isFile())th=strip;if(th.isFile())content.put(Store.obj("type","input_image","image_url","data:image/jpeg;base64,"+Base64.encodeToString(Store.read(new FileInputStream(th),1<<20),Base64.NO_WRAP)));}
        JSONObject payload=Store.obj("model",model,"input",new JSONArray().put(Store.obj("role","user","content",content)),"store",false,"stream",true);
        HttpURLConnection h=connection(API+"/responses",bearer);
        try{h.setRequestProperty("Accept","text/event-stream");body(h,"application/json",payload.toString());if(h.getResponseCode()/100!=2)throw new IOException(error(h));
            StringBuilder text=new StringBuilder();boolean done=false;
            try(BufferedReader r=new BufferedReader(new InputStreamReader(h.getInputStream(),StandardCharsets.UTF_8))){String line;while((line=r.readLine())!=null){if(!line.startsWith("data:"))continue;String data=line.substring(5).trim();if(data.isEmpty()||data.equals("[DONE]"))continue;JSONObject ev=new JSONObject(data);String type=ev.optString("type");
                if(type.equals("response.output_text.delta"))text.append(ev.optString("delta"));
                if(text.length()>300000)throw new IOException("編集案が長すぎます");
                if(type.equals("response.failed")||type.equals("response.incomplete")||type.equals("error")){JSONObject resp=ev.optJSONObject("response");JSONObject err=resp==null?ev.optJSONObject("error"):resp.optJSONObject("error");throw new IOException("生成中断 · "+(err==null?type:err.optString("code",type)));}
                if(type.equals("response.completed")){done=true;if(text.length()==0){JSONObject resp=ev.optJSONObject("response");JSONArray items=resp==null?null:resp.optJSONArray("output");if(items!=null)for(int i=0;i<items.length();i++){JSONArray parts=items.getJSONObject(i).optJSONArray("content");if(parts!=null)for(int j=0;j<parts.length();j++)if("output_text".equals(parts.getJSONObject(j).optString("type")))text.append(parts.getJSONObject(j).optString("text"));}}break;}
            }}
            if(!done||text.length()==0)throw new IOException("完全な編集案を受信できませんでした");return text.toString();
        }finally{h.disconnect();}
    }
}
