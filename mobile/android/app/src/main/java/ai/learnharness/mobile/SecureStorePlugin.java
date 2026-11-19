package ai.learnharness.mobile;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Small encrypted key-value store for provider API keys.
 *
 * Values are AES/GCM encrypted with a non-exportable key held by the Android
 * Keystore; only the ciphertext + IV land in SharedPreferences. The store is
 * intentionally narrow (set/get/remove/keys) — it holds credentials, not
 * product preferences (those stay in the WebView's localStorage).
 */
@CapacitorPlugin(name = "SecureStore")
public class SecureStorePlugin extends Plugin {
    private static final String KEYSTORE = "AndroidKeyStore";
    private static final String ALIAS = "lh_mobile_master";
    private static final String PREFS = "lh_secure_store";
    private static final String CIPHER = "AES/GCM/NoPadding";
    private static final int GCM_TAG_BITS = 128;

    private SharedPreferences prefs() {
        return getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private SecretKey masterKey() throws Exception {
        KeyStore keyStore = KeyStore.getInstance(KEYSTORE);
        keyStore.load(null);
        if (!keyStore.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
            generator.init(new KeyGenParameterSpec.Builder(
                    ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build());
            generator.generateKey();
        }
        return (SecretKey) keyStore.getKey(ALIAS, null);
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || key.isEmpty() || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.ENCRYPT_MODE, masterKey());
            byte[] encrypted = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
            byte[] iv = cipher.getIV();
            byte[] payload = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
            prefs().edit().putString(key, Base64.encodeToString(payload, Base64.NO_WRAP)).apply();
            call.resolve();
        } catch (Exception error) {
            call.reject("Unable to encrypt the value: " + error.getMessage());
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        String stored = prefs().getString(key, null);
        JSObject result = new JSObject();
        if (stored == null) {
            result.put("value", JSONObject.NULL);
            call.resolve(result);
            return;
        }
        try {
            byte[] payload = Base64.decode(stored, Base64.NO_WRAP);
            int ivLength = 12;
            byte[] iv = new byte[ivLength];
            byte[] encrypted = new byte[payload.length - ivLength];
            System.arraycopy(payload, 0, iv, 0, ivLength);
            System.arraycopy(payload, ivLength, encrypted, 0, encrypted.length);
            Cipher cipher = Cipher.getInstance(CIPHER);
            cipher.init(Cipher.DECRYPT_MODE, masterKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
            result.put("value", new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8));
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Unable to decrypt the value: " + error.getMessage());
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        prefs().edit().remove(key).apply();
        call.resolve();
    }

    @PluginMethod
    public void keys(PluginCall call) {
        JSArray names = new JSArray();
        for (String name : prefs().getAll().keySet()) names.put(name);
        JSObject result = new JSObject();
        result.put("keys", names);
        call.resolve(result);
    }
}
