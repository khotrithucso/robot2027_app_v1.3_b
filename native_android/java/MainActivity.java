package com.robot2027.companion;

import android.Manifest;
import android.app.ActivityManager;
import android.app.admin.DevicePolicyManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.activity.OnBackPressedCallback;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;

public class MainActivity extends BridgeActivity {

    private boolean kioskLockEnabled = true;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Đăng ký Plugin Native trước khi gọi super.onCreate
        registerPlugin(RobotNativePlugin.class);
        super.onCreate(savedInstanceState);

        // 1. Khóa cứng màn hình ngang & giữ màn hình luôn sáng
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        // 2. Xin quyền Micro & Camera ngay khi khởi động
        requestRequiredPermissions();

        // 3. Kích hoạt Kiosk Mode ẩn thanh trạng thái + thanh điều hướng
        applyImmersiveKiosk();
        enableLockTaskSafely(true);

        // 4. Chặn nút Back vật lý / cử chỉ vuốt Back cạnh màn hình
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                // Giữ nguyên trong Kiosk, tái ẩn thanh hệ thống nếu lỡ hiện
                applyImmersiveKiosk();
            }
        });

        // 5. Cấu hình WebView chống văng ra Chrome/YouTube App ngoài & hỗ trợ WebRTC Camera
        configureKioskWebView();
    }

    private void requestRequiredPermissions() {
        List<String> needed = new ArrayList<>();
        String[] perms = new String[]{
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.CAMERA
        };
        for (String p : perms) {
            if (ContextCompat.checkSelfPermission(this, p) != PackageManager.PERMISSION_GRANTED) {
                needed.add(p);
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_CONNECT);
            }
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN) != PackageManager.PERMISSION_GRANTED) {
                needed.add(Manifest.permission.BLUETOOTH_SCAN);
            }
        }
        if (!needed.isEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toArray(new String[0]), 2027);
        }
    }

    public void applyImmersiveKiosk() {
        runOnUiThread(() -> {
            WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
            View decor = getWindow().getDecorView();
            WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), decor);
            if (controller != null) {
                controller.hide(WindowInsetsCompat.Type.systemBars());
                controller.setSystemBarsBehavior(
                    WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
                );
            }
            // Tự động ẩn lại ngay lập tức nếu người dùng vuốt từ trên xuống hoặc cạnh phải lên
            ViewCompat.setOnApplyWindowInsetsListener(decor, (v, insets) -> {
                if (kioskLockEnabled && insets.isVisible(WindowInsetsCompat.Type.systemBars())) {
                    WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), decor);
                    if (c != null) {
                        c.hide(WindowInsetsCompat.Type.systemBars());
                    }
                }
                return ViewCompat.onApplyWindowInsets(v, insets);
            });
        });
    }

    public void enableLockTaskSafely(boolean enable) {
        this.kioskLockEnabled = enable;
        runOnUiThread(() -> {
            try {
                DevicePolicyManager dpm = (DevicePolicyManager) getSystemService(Context.DEVICE_POLICY_SERVICE);
                ComponentName admin = new ComponentName(this, RobotDeviceAdminReceiver.class);
                ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);

                if (enable) {
                    applyImmersiveKiosk();
                    if (dpm != null && dpm.isDeviceOwnerApp(getPackageName())) {
                        dpm.setLockTaskPackages(admin, new String[]{getPackageName()});
                        startLockTask();
                    } else if (am != null && am.getLockTaskModeState() == ActivityManager.LOCK_TASK_MODE_NONE) {
                        // Nếu chưa set Device Owner vẫn kích hoạt Screen Pinning chống thoát nhầm
                        startLockTask();
                    }
                } else {
                    if (am != null && am.getLockTaskModeState() != ActivityManager.LOCK_TASK_MODE_NONE) {
                        stopLockTask();
                    }
                }
            } catch (Exception ignored) {
                // Một số ROM Android cũ từ chối startLockTask nếu chưa bật Screen Pinning trong Settings
            }
        });
    }

    public boolean isKioskLockEnabled() {
        return kioskLockEnabled;
    }

    private void configureKioskWebView() {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        WebView webView = getBridge().getWebView();
        WebSettings settings = webView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);

        // Cấp quyền WebRTC Camera/Mic bên trong WebView cho tính năng Giám sát phụ huynh
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
            }
        });
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && kioskLockEnabled) {
            applyImmersiveKiosk();
        }
    }

    @Override
    public void onResume() {
        super.onResume();
        if (kioskLockEnabled) {
            applyImmersiveKiosk();
        }
    }
}
