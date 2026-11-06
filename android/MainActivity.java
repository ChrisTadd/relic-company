package io.github.christadd.reliccompany;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String PATH = "/game/";
    private static final String HOME = "https://" + HOST + PATH + "index.html";
    private static final int IMPORT = 1;
    private static final int EXPORT = 2;
    private WebView web;
    private GameUpdates updates;
    private byte[] pendingBackup;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(Color.rgb(21, 20, 17));
        getWindow().setNavigationBarColor(Color.rgb(21, 20, 17));
        updates = new GameUpdates(this, message -> event("relic-android-update", message));
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(21, 20, 17));
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(false);
        web.addJavascriptInterface(new Bridge(), "RelicAndroid");
        web.setWebChromeClient(new WebChromeClient());
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !HOME.equals(request.getUrl().toString());
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri url = request.getUrl();
                String path = url.getPath();
                if ("https".equals(url.getScheme()) && HOST.equals(url.getHost()) && path != null && path.startsWith(PATH)) {
                    String file = path.substring(PATH.length());
                    String mime = GameUpdates.ASSETS.get(file);
                    if (mime != null) {
                        try {
                            return new WebResourceResponse(mime, mime.startsWith("image/png") ? null : "UTF-8",
                                200, "OK", Collections.singletonMap("Cache-Control", "no-store"), updates.openAsset(file));
                        } catch (Exception ignored) { }
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
        });
        setContentView(web);
        web.loadUrl(HOME);
    }

    private void event(String name, String message) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("window.dispatchEvent(new CustomEvent(" + JSONObject.quote(name)
                + ",{detail:" + JSONObject.quote(message) + "}))", null);
        });
    }

    @Override protected void onPause() {
        event("relic-android-pause", "");
        web.onPause();
        web.pauseTimers();
        super.onPause();
    }

    @Override protected void onResume() {
        super.onResume();
        if (web != null) {
            web.resumeTimers();
            web.onResume();
            event("relic-android-resume", "");
        }
    }

    @Override protected void onDestroy() {
        updates.close();
        web.destroy();
        web = null;
        super.onDestroy();
    }

    private void chooseFile(boolean export) {
        Intent intent = new Intent(export ? Intent.ACTION_CREATE_DOCUMENT : Intent.ACTION_OPEN_DOCUMENT);
        intent.setType(export ? "application/json" : "*/*");
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        if (export) intent.putExtra(Intent.EXTRA_TITLE, "relic-company-save.json");
        startActivityForResult(intent, export ? EXPORT : IMPORT);
    }

    @Override protected void onActivityResult(int code, int result, Intent data) {
        super.onActivityResult(code, result, data);
        if (result != RESULT_OK || data == null || data.getData() == null) return;
        try {
            if (code == IMPORT) {
                try (InputStream stream = getContentResolver().openInputStream(data.getData())) {
                    event("relic-android-import", new String(GameUpdates.readLimited(stream, 100_000), StandardCharsets.UTF_8));
                }
            } else if (code == EXPORT && pendingBackup != null) {
                try (OutputStream stream = getContentResolver().openOutputStream(data.getData())) {
                    stream.write(pendingBackup);
                }
                pendingBackup = null;
            }
        } catch (Exception ignored) {
            event("relic-android-backup-error", "");
        }
    }

    public final class Bridge {
        @JavascriptInterface public String loadState() {
            return getSharedPreferences("company-save", MODE_PRIVATE).getString("state", null);
        }
        @JavascriptInterface public boolean saveState(String json) {
            return json.length() <= 200_000 && getSharedPreferences("company-save", MODE_PRIVATE)
                .edit().putString("state", json).commit();
        }
        @JavascriptInterface public boolean hasUpdate() { return updates.hasUpdate(); }
        @JavascriptInterface public void checkUpdate() { updates.check(); }
        @JavascriptInterface public void applyUpdate() {
            runOnUiThread(() -> {
                if (web != null && updates.apply()) web.loadUrl(HOME);
            });
        }
        @JavascriptInterface public void exportBackup(String json) {
            byte[] contents = json.getBytes(StandardCharsets.UTF_8);
            if (contents.length > 100_000) return;
            runOnUiThread(() -> { pendingBackup = contents; chooseFile(true); });
        }
        @JavascriptInterface public void importBackup() { runOnUiThread(() -> chooseFile(false)); }
    }
}
