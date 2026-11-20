package com.robot2027.companion;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.os.BatteryManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.Locale;

@CapacitorPlugin(name = "RobotNative")
public class RobotNativePlugin extends Plugin implements SensorEventListener {

    private SpeechRecognizer speechRecognizer;
    private Intent recognizerIntent;
    private boolean isListening = false;
    private boolean autoRestartLoop = false;
    private String currentLang = "en-US";

    // Hai bộ TTS độc lập Anh & Việt để đọc nối tiếp 0ms độ trễ
    private TextToSpeech ttsEn;
    private TextToSpeech ttsVi;
    private boolean ttsEnReady = false;
    private boolean ttsViReady = false;

    private AudioManager audioManager;
    private AudioFocusRequest focusRequest;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    // Cảm biến gia tốc phát hiện nghiêng/nhấc robot
    private SensorManager sensorManager;
    private Sensor accelerometer;
    private long lastTiltNotifyTime = 0;

    // Trạng thái âm lượng hệ thống lưu tạm để tắt tiếng "tít tít" của Mic
    private boolean streamsMutedForMic = false;
    private int savedNotifVol = -1;
    private int savedSysVol = -1;

    @Override
    public void load() {
        Context ctx = getContext();
        audioManager = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);

        // Khởi tạo song song 2 engine TTS Anh và Việt
        ttsEn = new TextToSpeech(ctx, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int res = ttsEn.setLanguage(Locale.US);
                ttsEnReady = (res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED);
                attachTtsListener(ttsEn, "en");
            }
        });

        ttsVi = new TextToSpeech(ctx, status -> {
            if (status == TextToSpeech.SUCCESS) {
                int res = ttsVi.setLanguage(new Locale("vi", "VN"));
                ttsViReady = (res != TextToSpeech.LANG_MISSING_DATA && res != TextToSpeech.LANG_NOT_SUPPORTED);
                attachTtsListener(ttsVi, "vi");
            }
        });

        // Đăng ký cảm biến nghiêng / rung lắc
        sensorManager = (SensorManager) ctx.getSystemService(Context.SENSOR_SERVICE);
        if (sensorManager != null) {
            accelerometer = sensorManager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER);
            if (accelerometer != null) {
                sensorManager.registerListener(this, accelerometer, SensorManager.SENSOR_DELAY_UI);
            }
        }
    }

    private void attachTtsListener(TextToSpeech engine, String langTag) {
        engine.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override
            public void onStart(String utteranceId) {
                JSObject data = new JSObject();
                data.put("event", "START");
                data.put("lang", langTag);
                data.put("id", utteranceId);
                notifyListeners("ttsEvent", data);
            }

            @Override
            public void onDone(String utteranceId) {
                JSObject data = new JSObject();
                data.put("event", "DONE");
                data.put("lang", langTag);
                data.put("id", utteranceId);
                notifyListeners("ttsEvent", data);
            }

            @Override
            public void onError(String utteranceId) {
                JSObject data = new JSObject();
                data.put("event", "ERROR");
                data.put("lang", langTag);
                data.put("id", utteranceId);
                notifyListeners("ttsEvent", data);
            }

            @Override
            public void onRangeStart(String utteranceId, int start, int end, int frame) {
                JSObject data = new JSObject();
                data.put("event", "WORD_BOUNDARY");
                data.put("lang", langTag);
                data.put("id", utteranceId);
                data.put("start", start);
                data.put("end", end);
                notifyListeners("ttsEvent", data);
            }
        });
    }

    // =========================================================================
    // 1. TẮT TIẾNG BÍP ("TÍT TÍT") CỦA ANDROID KHI BẬT/TẮT MICRO
    // =========================================================================
    private void muteSystemBeepTemporarily() {
        if (audioManager == null || streamsMutedForMic) return;
        try {
            savedNotifVol = audioManager.getStreamVolume(AudioManager.STREAM_NOTIFICATION);
            savedSysVol = audioManager.getStreamVolume(AudioManager.STREAM_SYSTEM);
            audioManager.adjustStreamVolume(AudioManager.STREAM_NOTIFICATION, AudioManager.ADJUST_MUTE, 0);
            audioManager.adjustStreamVolume(AudioManager.STREAM_SYSTEM, AudioManager.ADJUST_MUTE, 0);
            streamsMutedForMic = true;
        } catch (Exception ignored) {}
    }

    private void restoreSystemBeep() {
        if (audioManager == null || !streamsMutedForMic) return;
        try {
            audioManager.adjustStreamVolume(AudioManager.STREAM_NOTIFICATION, AudioManager.ADJUST_UNMUTE, 0);
            audioManager.adjustStreamVolume(AudioManager.STREAM_SYSTEM, AudioManager.ADJUST_UNMUTE, 0);
            if (savedNotifVol >= 0) {
                audioManager.setStreamVolume(AudioManager.STREAM_NOTIFICATION, savedNotifVol, 0);
            }
            if (savedSysVol >= 0) {
                audioManager.setStreamVolume(AudioManager.STREAM_SYSTEM, savedSysVol, 0);
            }
            streamsMutedForMic = false;
        } catch (Exception ignored) {}
    }

    private void requestAudioFocusForMic() {
        if (audioManager == null) return;
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes attrs = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build();
                focusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
                    .setAudioAttributes(attrs)
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener(focusChange -> {})
                    .build();
                audioManager.requestAudioFocus(focusRequest);
            } else {
                audioManager.requestAudioFocus(null, AudioManager.STREAM_VOICE_CALL, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
            }
        } catch (Exception ignored) {}
    }

    // =========================================================================
    // 2. KHỞI TẠO MỚI & QUẢN LÝ SPEECH RECOGNIZER (CHỐNG MẤT MIC KHI ĐỔI TAB)
    // =========================================================================
    private void destroyRecognizerInternal() {
        isListening = false;
        if (speechRecognizer != null) {
            try {
                speechRecognizer.stopListening();
                speechRecognizer.cancel();
                speechRecognizer.destroy();
            } catch (Exception ignored) {}
            speechRecognizer = null;
        }
    }

    private void createFreshRecognizer() {
        destroyRecognizerInternal();
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            emitSpeechState("UNAVAILABLE", "Thiết bị không hỗ trợ SpeechRecognizer");
            return;
        }

        speechRecognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
        speechRecognizer.setRecognitionListener(new RecognitionListener() {
            @Override
            public void onReadyForSpeech(Bundle params) {
                isListening = true;
                emitSpeechState("LISTENING", "");
                // Mở lại âm thông báo sau 350ms khi tiếng bíp khởi động mic đã qua
                mainHandler.postDelayed(() -> restoreSystemBeep(), 350);
            }

            @Override
            public void onBeginningOfSpeech() {
                emitSpeechState("SPEAKING_USER", "");
            }

            @Override
            public void onRmsChanged(float rmsdB) {
                JSObject rmsObj = new JSObject();
                rmsObj.put("rms", rmsdB);
                notifyListeners("speechRms", rmsObj);
            }

            @Override
            public void onBufferReceived(byte[] buffer) {}

            @Override
            public void onEndOfSpeech() {
                isListening = false;
                emitSpeechState("PROCESSING", "");
            }

            @Override
            public void onError(int error) {
                isListening = false;
                mainHandler.postDelayed(() -> restoreSystemBeep(), 250);
                String errName = mapSpeechError(error);
                emitSpeechState("ERROR", errName);

                // Nếu lỗi BUSY hoặc CLIENT (thường gặp sau khi thoát Iframe YouTube), hủy & tạo mới
                if (error == SpeechRecognizer.ERROR_RECOGNIZER_BUSY || error == SpeechRecognizer.ERROR_CLIENT) {
                    if (autoRestartLoop) {
                        mainHandler.postDelayed(() -> {
                            createFreshRecognizer();
                            startListeningInternal();
                        }, 450);
                    }
                } else if (autoRestartLoop &&
                          (error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT)) {
                    mainHandler.postDelayed(() -> startListeningInternal(), 300);
                }
            }

            @Override
            public void onResults(Bundle results) {
                isListening = false;
                ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                JSObject payload = new JSObject();
                JSArray arr = new JSArray();
                if (matches != null) {
                    for (String m : matches) arr.put(m);
                    payload.put("best", matches.isEmpty() ? "" : matches.get(0));
                } else {
                    payload.put("best", "");
                }
                payload.put("alternatives", arr);
                notifyListeners("speechResult", payload);

                if (autoRestartLoop) {
                    mainHandler.postDelayed(() -> startListeningInternal(), 320);
                }
            }

            @Override
            public void onPartialResults(Bundle partialResults) {
                ArrayList<String> partial = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if (partial != null && !partial.isEmpty()) {
                    JSObject payload = new JSObject();
                    payload.put("text", partial.get(0));
                    notifyListeners("speechPartial", payload);
                }
            }

            @Override
            public void onEvent(int eventType, Bundle params) {}
        });
    }

    private void startListeningInternal() {
        if (speechRecognizer == null) {
            createFreshRecognizer();
        }
        if (speechRecognizer == null) return;

        recognizerIntent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, currentLang);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, currentLang);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1100L);
        recognizerIntent.putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 900L);

        muteSystemBeepTemporarily();
        try {
            speechRecognizer.startListening(recognizerIntent);
        } catch (Exception e) {
            createFreshRecognizer();
            try {
                speechRecognizer.startListening(recognizerIntent);
            } catch (Exception ignored) {
                restoreSystemBeep();
            }
        }
    }

    private void emitSpeechState(String state, String detail) {
        JSObject obj = new JSObject();
        obj.put("state", state);
        obj.put("detail", detail);
        notifyListeners("speechState", obj);
    }

    private String mapSpeechError(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_AUDIO: return "ERROR_AUDIO";
            case SpeechRecognizer.ERROR_CLIENT: return "ERROR_CLIENT";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "ERROR_PERMISSIONS";
            case SpeechRecognizer.ERROR_NETWORK: return "ERROR_NETWORK";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "ERROR_NETWORK_TIMEOUT";
            case SpeechRecognizer.ERROR_NO_MATCH: return "ERROR_NO_MATCH";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "ERROR_RECOGNIZER_BUSY";
            case SpeechRecognizer.ERROR_SERVER: return "ERROR_SERVER";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "ERROR_SPEECH_TIMEOUT";
            default: return "ERROR_UNKNOWN_" + code;
        }
    }

    @PluginMethod
    public void startMic(PluginCall call) {
        currentLang = call.getString("lang", "en-US");
        autoRestartLoop = call.getBoolean("continuous", false);
        mainHandler.post(() -> {
            requestAudioFocusForMic();
            startListeningInternal();
            call.resolve();
        });
    }

    @PluginMethod
    public void resetAndStartMic(PluginCall call) {
        currentLang = call.getString("lang", "en-US");
        autoRestartLoop = call.getBoolean("continuous", false);
        mainHandler.post(() -> {
            requestAudioFocusForMic();
            createFreshRecognizer();
            startListeningInternal();
            call.resolve();
        });
    }

    @PluginMethod
    public void stopMic(PluginCall call) {
        autoRestartLoop = false;
        mainHandler.post(() -> {
            muteSystemBeepTemporarily();
            destroyRecognizerInternal();
            mainHandler.postDelayed(this::restoreSystemBeep, 300);
            emitSpeechState("IDLE", "");
            call.resolve();
        });
    }

    // =========================================================================
    // 3. DUAL ZERO-LATENCY TTS (ANH & VIỆT ĐỘC LẬP)
    // =========================================================================
    @PluginMethod
    public void speak(PluginCall call) {
        String text = call.getString("text", "");
        String lang = call.getString("lang", "en");
        float rate = call.getFloat("rate", 1.0f);
        String utteranceId = call.getString("id", "utt_" + System.currentTimeMillis());

        mainHandler.post(() -> {
            // Tạm dừng mic ngay khi robot bắt đầu nói để chống tự thu giọng mình (Echo Loop)
            if (isListening && speechRecognizer != null) {
                muteSystemBeepTemporarily();
                try { speechRecognizer.cancel(); } catch (Exception ignored) {}
                isListening = false;
                mainHandler.postDelayed(this::restoreSystemBeep, 250);
            }

            TextToSpeech target = "vi".equalsIgnoreCase(lang) ? ttsVi : ttsEn;
            boolean ready = "vi".equalsIgnoreCase(lang) ? ttsViReady : ttsEnReady;

            if (target != null && ready && !text.isEmpty()) {
                target.setSpeechRate(rate);
                Bundle params = new Bundle();
                params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
                target.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
                JSObject res = new JSObject();
                res.put("nativeTts", true);
                call.resolve(res);
            } else {
                JSObject res = new JSObject();
                res.put("nativeTts", false);
                call.resolve(res);
            }
        });
    }

    @PluginMethod
    public void stopSpeak(PluginCall call) {
        mainHandler.post(() -> {
            if (ttsEn != null) ttsEn.stop();
            if (ttsVi != null) ttsVi.stop();
            call.resolve();
        });
    }

    // =========================================================================
    // 4. PHẦN CỨNG: ĐỘ SÁNG THẬT, ÂM LƯỢNG, PIN, NHIỆT ĐỘ, WIFI, BLUETOOTH, KIOSK
    // =========================================================================
    @PluginMethod
    public void setBrightness(PluginCall call) {
        float level = call.getFloat("level", 0.7f);
        final float clamped = Math.max(0.01f, Math.min(1.0f, level));
        mainHandler.post(() -> {
            WindowManager.LayoutParams lp = getActivity().getWindow().getAttributes();
            lp.screenBrightness = clamped;
            getActivity().getWindow().setAttributes(lp);
            call.resolve();
        });
    }

    @PluginMethod
    public void setVolume(PluginCall call) {
        int percent = call.getInt("percent", 80);
        int clamped = Math.max(0, Math.min(100, percent));
        if (audioManager != null) {
            int max = audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC);
            int targetVol = Math.round((clamped / 100.0f) * max);
            audioManager.setStreamVolume(AudioManager.STREAM_MUSIC, targetVol, 0);
        }
        call.resolve();
    }

    @PluginMethod
    public void getDeviceStats(PluginCall call) {
        Context ctx = getContext();
        IntentFilter ifilter = new IntentFilter(Intent.ACTION_BATTERY_CHANGED);
        Intent batteryStatus = ctx.registerReceiver(null, ifilter);

        int level = 100;
        int scale = 100;
        int status = -1;
        float tempC = 32.0f;

        if (batteryStatus != null) {
            level = batteryStatus.getIntExtra(BatteryManager.EXTRA_LEVEL, 100);
            scale = batteryStatus.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
            status = batteryStatus.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
            int rawTemp = batteryStatus.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, 320);
            tempC = rawTemp / 10.0f;
        }

        int pct = Math.round((level * 100.0f) / Math.max(1, scale));
        boolean isCharging = (status == BatteryManager.BATTERY_STATUS_CHARGING ||
                              status == BatteryManager.BATTERY_STATUS_FULL);

        int volPct = 80;
        if (audioManager != null) {
            int cur = audioManager.getStreamVolume(AudioManager.STREAM_MUSIC);
            int max = Math.max(1, audioManager.getStreamMaxVolume(AudioManager.STREAM_MUSIC));
            volPct = Math.round((cur * 100.0f) / max);
        }

        String wifiSsid = "";
        try {
            WifiManager wm = (WifiManager) ctx.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
            if (wm != null && wm.isWifiEnabled()) {
                WifiInfo info = wm.getConnectionInfo();
                if (info != null && info.getSSID() != null) {
                    wifiSsid = info.getSSID().replace(""", "");
                }
            }
        } catch (Exception ignored) {}

        JSObject res = new JSObject();
        res.put("batteryPercent", pct);
        res.put("isCharging", isCharging);
        res.put("temperatureC", tempC);
        res.put("volumePercent", volPct);
        res.put("wifiSsid", wifiSsid);
        if (getActivity() instanceof MainActivity) {
            res.put("kioskEnabled", ((MainActivity) getActivity()).isKioskLockEnabled());
        }
        call.resolve(res);
    }

    @PluginMethod
    public void openWifiPanel(PluginCall call) {
        mainHandler.post(() -> {
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    Intent panelIntent = new Intent(Settings.Panel.ACTION_WIFI);
                    getActivity().startActivity(panelIntent);
                } else {
                    getActivity().startActivity(new Intent(Settings.ACTION_WIFI_SETTINGS));
                }
            } catch (Exception e) {
                getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void openBluetoothSettings(PluginCall call) {
        mainHandler.post(() -> {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_BLUETOOTH_SETTINGS));
            } catch (Exception e) {
                getActivity().startActivity(new Intent(Settings.ACTION_SETTINGS));
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setKioskLock(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", true);
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).enableLockTaskSafely(enabled);
        }
        call.resolve();
    }

    @PluginMethod
    public void vibrate(PluginCall call) {
        int ms = call.getInt("ms", 40);
        try {
            Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    v.vibrate(ms);
                }
            }
        } catch (Exception ignored) {}
        call.resolve();
    }

    // =========================================================================
    // 5. CẢM BIẾN GIA TỐC KẾ (PHÁT HIỆN NGHIÊNG / NHẤC ROBOT)
    // =========================================================================
    @Override
    public void onSensorChanged(SensorEvent event) {
        if (event.sensor.getType() != Sensor.TYPE_ACCELEROMETER) return;
        float x = event.values[0];
        float y = event.values[1];
        float z = event.values[2];
        double totalG = Math.sqrt(x * x + y * y + z * z);

        long now = System.currentTimeMillis();
        // Khi robot đặt ngang bình thường trên bàn, trục Y ~ 9.8 m/s2. Nếu bị lắc mạnh hoặc nghiêng ngả > 45 độ:
        if ((totalG > 15.5 || Math.abs(x) > 7.2) && (now - lastTiltNotifyTime > 4000)) {
            lastTiltNotifyTime = now;
            JSObject tilt = new JSObject();
            tilt.put("state", totalG > 15.5 ? "SHAKEN" : "TILTED");
            tilt.put("x", x);
            tilt.put("y", y);
            notifyListeners("deviceTilt", tilt);
        }
    }

    @Override
    public void onAccuracyChanged(Sensor sensor, int accuracy) {}

    @Override
    protected void handleOnDestroy() {
        destroyRecognizerInternal();
        if (ttsEn != null) ttsEn.shutdown();
        if (ttsVi != null) ttsVi.shutdown();
        if (sensorManager != null) sensorManager.unregisterListener(this);
        super.handleOnDestroy();
    }
}
