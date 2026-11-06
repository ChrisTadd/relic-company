package io.github.christadd.reliccompany;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.security.MessageDigest;
import java.security.Signature;
import java.security.cert.CertificateFactory;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.net.ssl.HttpsURLConnection;

final class GameUpdates {
    private static final String RELEASE = "https://github.com/ChrisTadd/relic-company/releases/latest/download/";
    private static final int PACKAGE_LIMIT = 2_000_000;
    static final Map<String, String> ASSETS = assetTypes();
    private final Context context;
    private final SharedPreferences state;
    private final int bundledVersion;
    private final Consumer<String> status;
    private final ExecutorService background = Executors.newSingleThreadExecutor();
    private final AtomicBoolean checking = new AtomicBoolean();

    private static Map<String, String> assetTypes() {
        Map<String, String> files = new HashMap<>();
        for (String name : new String[]{"app.mjs", "map.mjs", "game.mjs", "data.mjs", "backup.mjs", "sw.js"}) files.put(name, "text/javascript");
        for (String name : new String[]{"crest.svg", "march.svg"}) files.put(name, "image/svg+xml");
        for (String name : new String[]{"icon-192.png", "icon-512.png"}) files.put(name, "image/png");
        files.put("index.html", "text/html");
        files.put("style.css", "text/css");
        files.put("manifest.webmanifest", "application/manifest+json");
        return files;
    }

    GameUpdates(Context context, Consumer<String> status) {
        this.context = context.getApplicationContext();
        this.status = status;
        this.state = context.getSharedPreferences("game-updates", Context.MODE_PRIVATE);
        try {
            bundledVersion = context.getPackageManager().getPackageInfo(context.getPackageName(), 0).versionCode;
        } catch (PackageManager.NameNotFoundException failure) {
            throw new IllegalStateException(failure);
        }
    }

    private File directory(int version) {
        return new File(context.getFilesDir(), "game-" + version);
    }

    private int activeVersion() { return Math.max(bundledVersion, state.getInt("active", 0)); }

    InputStream openAsset(String file) throws IOException {
        int version = activeVersion();
        File installed = new File(directory(version), file);
        if (version > bundledVersion && installed.isFile()) return new FileInputStream(installed);
        return context.getAssets().open("game/" + file);
    }

    boolean hasUpdate() { return state.getInt("staged", 0) > activeVersion(); }

    synchronized boolean apply() {
        int version = state.getInt("staged", 0);
        if (version <= activeVersion()) return false;
        if (!state.edit().putInt("active", version).remove("staged").commit()) {
            status.accept("unavailable");
            return false;
        }
        return true;
    }

    void check() {
        if (!checking.compareAndSet(false, true)) return;
        background.execute(() -> {
            String result = "unavailable";
            try {
                result = download();
            } catch (Exception ignored) {
                // The current offline build stays active if any part fails verification.
            } finally {
                checking.set(false);
                status.accept(result);
            }
        });
    }

    private String download() throws Exception {
        if (hasUpdate()) return "ready";
        byte[] manifest = fetch(RELEASE + "relic-update.json", 8_192);
        JSONObject release = new JSONObject(new String(manifest, StandardCharsets.UTF_8));
        int version = release.getInt("version");
        if (version <= activeVersion()) return "current";
        String tag = "https://github.com/ChrisTadd/relic-company/releases/download/android-v" + version + "/";
        byte[] signature = fetch(tag + "relic-update.sig", 2_048);
        PackageInfo app = context.getPackageManager().getPackageInfo(context.getPackageName(), PackageManager.GET_SIGNATURES);
        Signature verifier = Signature.getInstance("SHA256withRSA");
        verifier.initVerify(CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(app.signatures[0].toByteArray())));
        verifier.update(manifest);
        if (!verifier.verify(signature)) throw new IOException("Invalid update signature");
        status.accept("downloading");
        byte[] archive = fetch(tag + "relic-game.zip", PACKAGE_LIMIT);
        StringBuilder digest = new StringBuilder();
        for (byte value : MessageDigest.getInstance("SHA-256").digest(archive)) digest.append(String.format("%02x", value & 255));
        if (!digest.toString().equals(release.getString("sha256"))) throw new IOException("Invalid update archive");

        File target = directory(version);
        if (!target.isDirectory() && !target.mkdir()) throw new IOException("Could not stage update");
        Set<String> files = new HashSet<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(archive))) {
            ZipEntry entry;
            int remaining = PACKAGE_LIMIT;
            while ((entry = zip.getNextEntry()) != null) {
                String file = entry.getName();
                if (entry.isDirectory() || !ASSETS.containsKey(file) || !files.add(file)) throw new IOException("Unexpected update file");
                byte[] content = readLimited(zip, remaining);
                remaining -= content.length;
                Files.write(new File(target, file).toPath(), content);
            }
        }
        if (!files.equals(ASSETS.keySet()) || !state.edit().putInt("staged", version).commit()) throw new IOException("Incomplete update");
        for (File old : context.getFilesDir().listFiles() == null ? new File[0] : context.getFilesDir().listFiles()) {
            if (old.isDirectory() && old.getName().matches("game-[0-9]+") && !old.equals(target) && !old.equals(directory(activeVersion()))) {
                for (String file : ASSETS.keySet()) new File(old, file).delete();
                old.delete();
            }
        }
        return "ready";
    }

    private static byte[] fetch(String address, int limit) throws IOException {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(address).openConnection();
        connection.setConnectTimeout(12_000);
        connection.setReadTimeout(12_000);
        connection.setUseCaches(false);
        try (InputStream stream = connection.getInputStream()) {
            return readLimited(stream, limit);
        } finally {
            connection.disconnect();
        }
    }

    static byte[] readLimited(InputStream stream, int limit) throws IOException {
        if (stream == null) throw new IOException("File unavailable");
        ByteArrayOutputStream result = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int length;
        while ((length = stream.read(buffer)) != -1) {
            if (length > limit - result.size()) throw new IOException("File exceeds size limit");
            result.write(buffer, 0, length);
        }
        return result.toByteArray();
    }

    void close() { background.shutdownNow(); }
}
