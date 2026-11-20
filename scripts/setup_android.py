import os
import shutil
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANDROID_DIR = os.path.join(ROOT, "android")
APP_MAIN = os.path.join(ANDROID_DIR, "app", "src", "main")
JAVA_PKG_DIR = os.path.join(APP_MAIN, "java", "com", "robot2027", "companion")
RES_XML_DIR = os.path.join(APP_MAIN, "res", "xml")
NATIVE_SRC = os.path.join(ROOT, "native_android")

def main():
    if not os.path.exists(APP_MAIN):
        raise RuntimeError("Không tìm thấy thư mục android/app/src/main. Hãy chạy npx cap add android trước.")

    os.makedirs(JAVA_PKG_DIR, exist_ok=True)
    os.makedirs(RES_XML_DIR, exist_ok=True)

    # 1. Copy các file Java Native
    java_files = [
        "MainActivity.java",
        "RobotNativePlugin.java",
        "BootReceiver.java",
        "RobotDeviceAdminReceiver.java"
    ]
    for jf in java_files:
        src = os.path.join(NATIVE_SRC, "java", jf)
        dst = os.path.join(JAVA_PKG_DIR, jf)
        shutil.copy2(src, dst)
        print(f"[OK] Đã chép {jf}")

    # 2. Copy các file cấu hình XML
    xml_files = ["device_admin.xml", "network_security_config.xml"]
    for xf in xml_files:
        src = os.path.join(NATIVE_SRC, "xml", xf)
        dst = os.path.join(RES_XML_DIR, xf)
        shutil.copy2(src, dst)
        print(f"[OK] Đã chép res/xml/{xf}")

    # 3. Copy AndroidManifest.xml chuẩn Kiosk V1.3
    manifest_src = os.path.join(NATIVE_SRC, "AndroidManifest.xml")
    manifest_dst = os.path.join(APP_MAIN, "AndroidManifest.xml")
    shutil.copy2(manifest_src, manifest_dst)
    print("[OK] Đã cập nhật AndroidManifest.xml")

    # 4. Thêm Google Maven Mirror & cấu hình JVM chống lỗi mạng Maven Central
    top_gradle = os.path.join(ANDROID_DIR, "build.gradle")
    if os.path.exists(top_gradle):
        with open(top_gradle, "r", encoding="utf-8") as f:
            content = f.read()
        mirror = 'maven { url "https://maven-central.storage-download.googleapis.com/maven2" }'
        if mirror not in content:
            content = content.replace("mavenCentral()", f"mavenCentral()\n        {mirror}")
            with open(top_gradle, "w", encoding="utf-8") as f:
                f.write(content)
            print("[OK] Đã thêm Google Maven Mirror vào android/build.gradle")

    gradle_props = os.path.join(ANDROID_DIR, "gradle.properties")
    if os.path.exists(gradle_props):
        with open(gradle_props, "r", encoding="utf-8") as f:
            props = f.read()
        if "preferIPv4Stack" not in props:
            with open(gradle_props, "a", encoding="utf-8") as f:
                f.write("\norg.gradle.jvmargs=-Xmx2048m -Djava.net.preferIPv4Stack=true\n")
            print("[OK] Đã cấu hình IPv4 & RAM 2GB trong gradle.properties")

    # 5. Đảm bảo app/build.gradle hỗ trợ androidx.webkit và core
    app_gradle = os.path.join(ANDROID_DIR, "app", "build.gradle")
    if os.path.exists(app_gradle):
        with open(app_gradle, "r", encoding="utf-8") as f:
            ag = f.read()
        if "androidx.webkit:webkit" not in ag:
            ag = ag.replace(
                "dependencies {",
                "dependencies {\n    implementation 'androidx.webkit:webkit:1.11.0'"
            )
            with open(app_gradle, "w", encoding="utf-8") as f:
                f.write(ag)
            print("[OK] Đã bổ sung androidx.webkit:webkit vào app/build.gradle")

if __name__ == "__main__":
    main()
