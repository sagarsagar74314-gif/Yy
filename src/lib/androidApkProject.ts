export interface ApkFileSpec {
  path: string;
  language: string;
  description: string;
  content: string;
}

export const ANDROID_APK_FILES: ApkFileSpec[] = [
  {
    path: '.github/workflows/build-apk.yml',
    language: 'yaml',
    description:
      'GitHub Actions workflow to automatically build a downloadable Android APK on every push without needing gradlew binaries.',
    content: `name: Build Aanya Android Companion APK

on:
  push:
    branches: [ main, master ]
  workflow_dispatch:

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          java-version: '17'
          distribution: 'temurin'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v4
        with:
          gradle-version: '8.7'

      - name: Build Debug APK
        run: gradle assembleDebug

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: Aanya-Companion-APK
          path: app/build/outputs/apk/debug/app-debug.apk
`,
  },
  {
    path: 'settings.gradle.kts',
    language: 'kotlin',
    description: 'Root Gradle settings linking Google & Maven Central repositories and :app module.',
    content: `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "AanyaCompanion"
include(":app")
`,
  },
  {
    path: 'build.gradle.kts',
    language: 'kotlin',
    description: 'Root Android Gradle Plugin & Kotlin Android plugin versions.',
    content: `plugins {
    id("com.android.application") version "8.5.2" apply false
    id("org.jetbrains.kotlin.android") version "1.9.24" apply false
}
`,
  },
  {
    path: 'gradle.properties',
    language: 'properties',
    description: 'AndroidX and Gradle memory settings.',
    content: `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
kotlin.code.style=official
android.nonTransitiveRClass=true
`,
  },
  {
    path: 'app/src/main/res/values/strings.xml',
    language: 'xml',
    description: 'App title and Accessibility service permission explanation.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Aanya AI Companion</string>
    <string name="aanya_accessibility_desc">Allows Aanya voice commands to open apps, tap controls, type text, and manage settings automatically.</string>
</resources>
`,
  },
  {
    path: 'app/build.gradle.kts',
    language: 'kotlin',
    description: 'App-level Gradle config for Android SDK 34, Kotlin, and WebView bridge.',
    content: `plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.sagar.aanyacompanion"
    compileSdk = 34

    defaultConfig {
        applicationId = "com.sagar.aanyacompanion"
        minSdk = 26
        targetSdk = 34
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "AANYA_WEB_URL", "\\"https://ais-pre-fwog5xc46x27ple4nvbtpb-495963950147.asia-east1.run.app\\"")
    }

    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.appcompat:appcompat:1.7.0")
    implementation("com.google.android.material:material:1.12.0")
}
`,
  },
  {
    path: 'app/src/main/AndroidManifest.xml',
    language: 'xml',
    description:
      'Android manifest declaring Accessibility Service, Overlay Mic Orb, Alarm, Call, and Internet permissions.',
    content: `<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="com.sagar.aanyacompanion">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />
    <uses-permission android:name="android.permission.CALL_PHONE" />
    <uses-permission android:name="android.permission.SET_ALARM" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.FLASHLIGHT" />
    <uses-permission android:name="android.permission.QUERY_ALL_PACKAGES" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" />

    <queries>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="https" />
        </intent>
        <intent>
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="http" />
        </intent>
        <package android:name="com.google.android.youtube" />
        <package android:name="com.android.chrome" />
        <package android:name="com.lemon.lvoverseas" />
        <package android:name="com.google.android.apps.maps" />
        <package android:name="com.spotify.music" />
        <package android:name="com.whatsapp" />
        <package android:name="com.instagram.android" />
        <package android:name="com.facebook.katana" />
        <package android:name="org.telegram.messenger" />
        <package android:name="com.snapchat.android" />
        <package android:name="com.google.android.gm" />
        <package android:name="com.google.android.apps.meetings" />
        <package android:name="com.android.vending" />
    </queries>

    <application
        android:allowBackup="true"
        android:label="Aanya AI Companion"
        android:supportsRtl="true"
        android:theme="@style/Theme.Material3.DayNight.NoActionBar">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

        <!-- Accessibility Service for Auto-Tap, Auto-Type, Notification Shade, Settings & App Control -->
        <service
            android:name=".AanyaAccessibilityService"
            android:permission="android.permission.BIND_ACCESSIBILITY_SERVICE"
            android:exported="true">
            <intent-filter>
                <action android:name="android.accessibilityservice.AccessibilityService" />
            </intent-filter>
            <meta-data
                android:name="android.accessibilityservice"
                android:resource="@xml/aanya_accessibility_config" />
        </service>

        <!-- Floating Voice Orb Overlay Service -->
        <service
            android:name=".FloatingVoiceOrbService"
            android:exported="false"
            android:foregroundServiceType="microphone" />
    </application>
</manifest>
`,
  },
  {
    path: 'app/src/main/res/xml/aanya_accessibility_config.xml',
    language: 'xml',
    description:
      'Accessibility service metadata enabling full screen tree inspection, auto-typing, gesture dispatch, and cross-app control.',
    content: `<?xml version="1.0" encoding="utf-8"?>
<accessibility-service xmlns:android="http://schemas.android.com/apk/res/android"
    android:accessibilityEventTypes="typeAllMask"
    android:accessibilityFeedbackType="feedbackGeneric"
    android:accessibilityFlags="flagDefault|flagReportViewIds|flagRetrieveInteractiveWindows|flagIncludeNotImportantViews"
    android:canPerformGestures="true"
    android:canRetrieveWindowContent="true"
    android:notificationTimeout="80"
    android:description="@string/aanya_accessibility_desc" />
`,
  },
  {
    path: 'app/src/main/java/com/sagar/aanyacompanion/AanyaAccessibilityService.kt',
    language: 'kotlin',
    description:
      'Full Kotlin AccessibilityService: reads visible screen text, taps UI elements or coordinates, types into any EditText, slides Quick Settings, scrolls, and controls Chrome, CapCut, Maps, Calls, and Alarms.',
    content: `package com.sagar.aanyacompanion

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.GestureDescription
import android.content.Context
import android.content.Intent
import android.graphics.Path
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.AlarmClock
import android.provider.Settings
import android.view.KeyEvent
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class AanyaAccessibilityService : AccessibilityService() {

    companion object {
        var instance: AanyaAccessibilityService? = null
        var lastForegroundPackage: String = ""
        var torchOn: Boolean = false
    }

    private val mainHandler = Handler(Looper.getMainLooper())

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event?.packageName?.toString()?.let { pkg ->
            lastForegroundPackage = pkg
        }
    }

    override fun onInterrupt() {}

    override fun onDestroy() {
        super.onDestroy()
        instance = null
    }

    fun executeCommand(type: String, target: String?, query: String?, value: String?) {
        when (type) {
            "slide_panel" -> performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
            "open_notifications" -> performGlobalAction(GLOBAL_ACTION_NOTIFICATIONS)
            "go_back" -> performGlobalAction(GLOBAL_ACTION_BACK)
            "go_home" -> performGlobalAction(GLOBAL_ACTION_HOME)
            "toggle_flashlight" -> {
                val desired = when (value?.lowercase()) {
                    "on" -> true
                    "off" -> false
                    else -> !torchOn
                }
                setHardwareTorch(desired)
            }
            "toggle_wifi", "toggle_data" -> {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    val intent = Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                } else {
                    performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
                }
            }
            "toggle_bluetooth" -> {
                val intent = Intent(Settings.ACTION_BLUETOOTH_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            }
            "open_settings" -> {
                val intent = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            }
            "search_settings" -> {
                val intent = Intent(Settings.ACTION_SETTINGS).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
                if (!query.isNullOrBlank()) {
                    mainHandler.postDelayed({
                        tapNodeByText("Search")
                        mainHandler.postDelayed({ typeIntoAnyInputNode(query) }, 450)
                    }, 900)
                }
            }
            "type_text" -> if (!value.isNullOrBlank()) typeIntoAnyInputNode(value)
            "tap_target" -> if (!target.isNullOrBlank()) tapNodeByText(target)
            "scroll_down" -> performScrollGesture(down = true)
            "scroll_up" -> performScrollGesture(down = false)
            "play_media" -> {
                val mediaQuery = query?.takeIf { it.isNotBlank() } ?: target ?: "trending song"
                val appTarget = target?.lowercase() ?: "youtube"
                if (appTarget.contains("spotify")) {
                    val uri = Uri.parse("spotify:search:" + Uri.encode(mediaQuery))
                    val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                } else {
                    // Open YouTube directly to search results and auto-tap the first playable video
                    val searchUrl = "https://www.youtube.com/results?search_query=" + Uri.encode(mediaQuery)
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(searchUrl)).apply {
                        setPackage("com.google.android.youtube")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    try {
                        startActivity(intent)
                    } catch (_: Exception) {
                        val fallback = Intent(Intent.ACTION_VIEW, Uri.parse(searchUrl)).apply {
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        startActivity(fallback)
                    }
                }
                // Wait for search results to render, then auto-tap first playable media item
                mainHandler.postDelayed({
                    if (!tapFirstMediaResult(mediaQuery)) {
                        mainHandler.postDelayed({ tapFirstMediaResult(mediaQuery) }, 1200)
                    }
                }, 1500)
            }
            "stop_media" -> {
                try {
                    val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PAUSE))
                    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PAUSE))
                    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_STOP))
                    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_STOP))
                } catch (_: Exception) {
                }
            }
            "chrome_search" -> {
                val url = "https://www.google.com/search?q=" + Uri.encode(query ?: "")
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                    setPackage("com.android.chrome")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            }
            "chrome_download" -> {
                val item = target?.takeIf { it.isNotBlank() } ?: query ?: ""
                val uri = if (item.startsWith("http")) {
                    Uri.parse(item)
                } else {
                    Uri.parse("market://search?q=" + Uri.encode(item))
                }
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            }
            "open_maps" -> {
                val uri = Uri.parse("geo:0,0?q=" + Uri.encode(query ?: ""))
                val intent = Intent(Intent.ACTION_VIEW, uri).apply {
                    setPackage("com.google.android.apps.maps")
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            }
            "open_app" -> launchAppByName(target ?: "")
            "capcut_edit" -> {
                launchAppByName("CapCut")
                if (!value.isNullOrBlank()) {
                    mainHandler.postDelayed({ tapNodeByText(value) }, 1100)
                }
            }
            "set_alarm" -> {
                val parts = (value ?: "07:00").split(":")
                val hour = parts.getOrNull(0)?.toIntOrNull() ?: 7
                val min = parts.getOrNull(1)?.toIntOrNull() ?: 0
                val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                    putExtra(AlarmClock.EXTRA_HOUR, hour)
                    putExtra(AlarmClock.EXTRA_MINUTES, min)
                    putExtra(AlarmClock.EXTRA_MESSAGE, target ?: "Aanya Reminder")
                    putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            }
            "make_call" -> {
                val intent = Intent(Intent.ACTION_CALL, Uri.parse("tel:" + Uri.encode(target ?: ""))).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            }
            "start_video_call" -> {
                val meetUrl = value?.takeIf { it.startsWith("http") } ?: "https://meet.google.com"
                val intent = Intent(Intent.ACTION_VIEW, Uri.parse(meetUrl)).apply {
                    addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                }
                startActivity(intent)
            }
            "check_messages" -> {
                launchAppByName(target?.takeIf { it.isNotBlank() } ?: "Messages")
            }
        }
    }

    private fun tapFirstMediaResult(queryHint: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val firstWord = queryHint.trim().split(" ").firstOrNull() ?: ""
        if (firstWord.length > 2 && tapNodeByText(firstWord)) {
            return true
        }
        // Fallback: tap first large clickable content card in YouTube/Spotify results list
        val candidates = ArrayList<AccessibilityNodeInfo>()
        collectClickableMediaCards(root, candidates)
        for (node in candidates) {
            if (node.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true
            }
        }
        return false
    }

    private fun collectClickableMediaCards(
        node: AccessibilityNodeInfo?,
        out: MutableList<AccessibilityNodeInfo>
    ) {
        if (node == null) return
        val desc = node.contentDescription?.toString() ?: ""
        val txt = node.text?.toString() ?: ""
        if (node.isClickable && (desc.length > 15 || txt.length > 15)) {
            out.add(node)
        }
        for (i in 0 until node.childCount) {
            collectClickableMediaCards(node.getChild(i), out)
        }
    }

    fun readScreenText(): String {
        val root = rootInActiveWindow ?: return ""
        val sb = StringBuilder()
        collectText(root, sb)
        return sb.toString().trim()
    }

    private fun collectText(node: AccessibilityNodeInfo?, sb: StringBuilder) {
        if (node == null) return
        node.text?.let { if (it.isNotBlank()) sb.append(it).append(" | ") }
        node.contentDescription?.let { if (it.isNotBlank()) sb.append(it).append(" | ") }
        for (i in 0 until node.childCount) {
            collectText(node.getChild(i), sb)
        }
    }

    private fun tapNodeByText(label: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val matches = root.findAccessibilityNodeInfosByText(label)
        for (node in matches) {
            var current: AccessibilityNodeInfo? = node
            while (current != null) {
                if (current.isClickable) {
                    return current.performAction(AccessibilityNodeInfo.ACTION_CLICK)
                }
                current = current.parent
            }
        }
        return false
    }

    private fun typeIntoAnyInputNode(text: String): Boolean {
        val root = rootInActiveWindow ?: return false
        val focused = root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT)
        if (focused != null) {
            val args = Bundle().apply {
                putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
            }
            return focused.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
        }
        val editable = findEditableNode(root) ?: return false
        editable.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val args = Bundle().apply {
            putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, text)
        }
        return editable.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    private fun findEditableNode(node: AccessibilityNodeInfo): AccessibilityNodeInfo? {
        if (node.isEditable) return node
        for (i in 0 until node.childCount) {
            val found = node.getChild(i)?.let { findEditableNode(it) }
            if (found != null) return found
        }
        return null
    }

    fun tapAt(x: Float, y: Float) {
        val path = Path().apply { moveTo(x, y) }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 60))
            .build()
        dispatchGesture(gesture, null, null)
    }

    private fun performScrollGesture(down: Boolean) {
        val path = Path().apply {
            if (down) {
                moveTo(540f, 1500f)
                lineTo(540f, 500f)
            } else {
                moveTo(540f, 500f)
                lineTo(540f, 1500f)
            }
        }
        val gesture = GestureDescription.Builder()
            .addStroke(GestureDescription.StrokeDescription(path, 0, 320))
            .build()
        dispatchGesture(gesture, null, null)
    }

    private fun setHardwareTorch(enabled: Boolean) {
        try {
            val camManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
            val cameraId = camManager.cameraIdList.firstOrNull { id ->
                camManager.getCameraCharacteristics(id)
                    .get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
            }
            if (cameraId != null) {
                camManager.setTorchMode(cameraId, enabled)
                torchOn = enabled
            }
        } catch (_: Exception) {
            performGlobalAction(GLOBAL_ACTION_QUICK_SETTINGS)
            mainHandler.postDelayed({ tapNodeByText("Flashlight") || tapNodeByText("Torch") }, 700)
        }
    }

    private fun launchAppByName(appName: String) {
        val lower = appName.trim().lowercase()
        if (lower.contains("camera")) {
            val camIntent = Intent(android.provider.MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(camIntent)
            return
        }
        val knownPackage = when {
            lower.contains("youtube") -> "com.google.android.youtube"
            lower.contains("chrome") || lower.contains("browser") -> "com.android.chrome"
            lower.contains("capcut") -> "com.lemon.lvoverseas"
            lower.contains("map") -> "com.google.android.apps.maps"
            lower.contains("spotify") -> "com.spotify.music"
            lower.contains("whatsapp") -> "com.whatsapp"
            lower.contains("instagram") -> "com.instagram.android"
            lower.contains("facebook") || lower == "fb" -> "com.facebook.katana"
            lower.contains("telegram") -> "org.telegram.messenger"
            lower.contains("snapchat") -> "com.snapchat.android"
            lower.contains("gmail") -> "com.google.android.gm"
            lower.contains("drive") -> "com.google.android.apps.docs"
            lower.contains("photos") || lower.contains("gallery") -> "com.google.android.apps.photos"
            lower.contains("phonepe") -> "com.phonepe.app"
            lower.contains("paytm") -> "net.one97.paytm"
            lower.contains("gpay") || lower.contains("google pay") -> "com.google.android.apps.nbu.paisa.user"
            lower.contains("truecaller") -> "com.truecaller"
            lower.contains("play store") || lower.contains("playstore") -> "com.android.vending"
            lower.contains("meet") -> "com.google.android.apps.meetings"
            else -> null
        }

        val pm = packageManager
        if (knownPackage != null) {
            pm.getLaunchIntentForPackage(knownPackage)?.let {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(it)
                return
            }
        }

        val packages = pm.getInstalledApplications(0)
        val match = packages.firstOrNull {
            pm.getApplicationLabel(it).toString().contains(appName, ignoreCase = true)
        }
        if (match != null) {
            pm.getLaunchIntentForPackage(match.packageName)?.let {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(it)
                return
            }
        }

        if (lower.contains("youtube")) {
            val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.youtube.com")).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(webIntent)
        }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/sagar/aanyacompanion/FloatingVoiceOrbService.kt',
    language: 'kotlin',
    description:
      'System overlay service showing the floating Mic Orb over any app only while listening/talking and hiding automatically when silent.',
    content: `package com.sagar.aanyacompanion

import android.app.Service
import android.content.Intent
import android.graphics.Color
import android.graphics.PixelFormat
import android.graphics.drawable.GradientDrawable
import android.os.IBinder
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.widget.FrameLayout

class FloatingVoiceOrbService : Service() {

    private var windowManager: WindowManager? = null
    private var orbView: View? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        val params = WindowManager.LayoutParams(
            136,
            136,
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.BOTTOM or Gravity.END
            x = 36
            y = 140
        }

        val container = FrameLayout(this).apply {
            background = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#E11D48"))
                setStroke(4, Color.parseColor("#FDA4AF"))
            }
            visibility = View.GONE
        }

        orbView = container
        windowManager?.addView(orbView, params)
    }

    fun setOrbActive(active: Boolean) {
        orbView?.post {
            orbView?.visibility = if (active) View.VISIBLE else View.GONE
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        orbView?.let { windowManager?.removeView(it) }
    }
}
`,
  },
  {
    path: 'app/src/main/java/com/sagar/aanyacompanion/MainActivity.kt',
    language: 'kotlin',
    description:
      'WebView + JS Bridge with zero-tap direct Intent launching, intent:// URL interception, Accessibility fallback, Torch, and runtime permissions.',
    content: `package com.sagar.aanyacompanion

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.AlarmClock
import android.provider.Settings
import android.view.KeyEvent
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var torchEnabled = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val missingPerms = mutableListOf<String>()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
            != PackageManager.PERMISSION_GRANTED
        ) {
            missingPerms.add(Manifest.permission.RECORD_AUDIO)
        }
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.CAMERA)
            != PackageManager.PERMISSION_GRANTED
        ) {
            missingPerms.add(Manifest.permission.CAMERA)
        }
        if (missingPerms.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, missingPerms.toTypedArray(), 101)
        }

        webView = WebView(this)
        setContentView(webView)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                val url = request?.url?.toString() ?: return false
                if (url.startsWith("http://") || url.startsWith("https://")) {
                    return false
                }
                return handleCustomSchemeUrl(url)
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onPermissionRequest(request: PermissionRequest) {
                request.grant(request.resources)
            }
        }

        webView.addJavascriptInterface(AanyaAndroidBridge(), "AanyaAndroidBridge")
        webView.loadUrl(BuildConfig.AANYA_WEB_URL)
    }

    private fun handleCustomSchemeUrl(url: String): Boolean {
        return try {
            val intent = if (url.startsWith("intent:")) {
                Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
            } else {
                Intent(Intent.ACTION_VIEW, Uri.parse(url))
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            true
        } catch (_: Exception) {
            try {
                if (url.startsWith("intent:")) {
                    val parsed = Intent.parseUri(url, Intent.URI_INTENT_SCHEME)
                    val fallback = parsed.getStringExtra("browser_fallback_url")
                    if (!fallback.isNullOrBlank()) {
                        startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(fallback)))
                        return true
                    }
                }
            } catch (_: Exception) {
            }
            false
        }
    }

    private fun launchAppFallback(appName: String): Boolean {
        val lower = appName.trim().lowercase()
        if (lower.contains("camera")) {
            val camIntent = Intent(android.provider.MediaStore.INTENT_ACTION_STILL_IMAGE_CAMERA).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            startActivity(camIntent)
            return true
        }
        val knownPackage = when {
            lower.contains("youtube") -> "com.google.android.youtube"
            lower.contains("chrome") || lower.contains("browser") -> "com.android.chrome"
            lower.contains("capcut") -> "com.lemon.lvoverseas"
            lower.contains("map") -> "com.google.android.apps.maps"
            lower.contains("spotify") -> "com.spotify.music"
            lower.contains("whatsapp") -> "com.whatsapp"
            lower.contains("instagram") -> "com.instagram.android"
            lower.contains("facebook") || lower == "fb" -> "com.facebook.katana"
            lower.contains("telegram") -> "org.telegram.messenger"
            lower.contains("snapchat") -> "com.snapchat.android"
            lower.contains("gmail") -> "com.google.android.gm"
            lower.contains("drive") -> "com.google.android.apps.docs"
            lower.contains("photos") || lower.contains("gallery") -> "com.google.android.apps.photos"
            lower.contains("play store") || lower.contains("playstore") -> "com.android.vending"
            lower.contains("meet") -> "com.google.android.apps.meetings"
            else -> null
        }

        if (knownPackage != null) {
            packageManager.getLaunchIntentForPackage(knownPackage)?.let {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(it)
                return true
            }
        }

        val match = packageManager.getInstalledApplications(0).firstOrNull {
            packageManager.getApplicationLabel(it).toString().contains(appName, ignoreCase = true)
        }
        if (match != null) {
            packageManager.getLaunchIntentForPackage(match.packageName)?.let {
                it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                startActivity(it)
                return true
            }
        }
        return false
    }

    private fun executeDirectIntentFallback(
        type: String,
        target: String,
        query: String,
        value: String,
        nativeIntentUri: String
    ) {
        try {
            when (type) {
                "open_app" -> {
                    if (!launchAppFallback(target) && nativeIntentUri.isNotBlank()) {
                        handleCustomSchemeUrl(nativeIntentUri)
                    }
                }
                "capcut_edit" -> launchAppFallback("CapCut")
                "open_settings", "search_settings" -> {
                    startActivity(Intent(Settings.ACTION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                "toggle_wifi", "toggle_data" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        startActivity(Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    } else {
                        startActivity(Intent(Settings.ACTION_WIFI_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                    }
                }
                "toggle_bluetooth" -> {
                    startActivity(Intent(Settings.ACTION_BLUETOOTH_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                "toggle_flashlight" -> {
                    val camManager = getSystemService(Context.CAMERA_SERVICE) as CameraManager
                    val cameraId = camManager.cameraIdList.firstOrNull { id ->
                        camManager.getCameraCharacteristics(id)
                            .get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true
                    }
                    if (cameraId != null) {
                        val next = when (value.lowercase()) {
                            "on" -> true
                            "off" -> false
                            else -> !torchEnabled
                        }
                        camManager.setTorchMode(cameraId, next)
                        torchEnabled = next
                    }
                }
                "chrome_search" -> {
                    val url = "https://www.google.com/search?q=" + Uri.encode(query)
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                        setPackage("com.android.chrome")
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                }
                "chrome_download" -> {
                    val item = target.ifBlank { query }
                    val uri = if (item.startsWith("http")) Uri.parse(item) else Uri.parse("market://search?q=" + Uri.encode(item))
                    startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                "open_maps" -> {
                    val uri = Uri.parse("geo:0,0?q=" + Uri.encode(query))
                    startActivity(Intent(Intent.ACTION_VIEW, uri).setPackage("com.google.android.apps.maps").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                "play_media" -> {
                    if (nativeIntentUri.isNotBlank()) {
                        handleCustomSchemeUrl(nativeIntentUri)
                    }
                }
                "stop_media" -> {
                    val audioManager = getSystemService(Context.AUDIO_SERVICE) as AudioManager
                    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_PAUSE))
                    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_PAUSE))
                    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, KeyEvent.KEYCODE_MEDIA_STOP))
                    audioManager.dispatchMediaKeyEvent(KeyEvent(KeyEvent.ACTION_UP, KeyEvent.KEYCODE_MEDIA_STOP))
                }
                "set_alarm" -> {
                    val parts = value.ifBlank { "07:00" }.split(":")
                    val hour = parts.getOrNull(0)?.toIntOrNull() ?: 7
                    val min = parts.getOrNull(1)?.toIntOrNull() ?: 0
                    val intent = Intent(AlarmClock.ACTION_SET_ALARM).apply {
                        putExtra(AlarmClock.EXTRA_HOUR, hour)
                        putExtra(AlarmClock.EXTRA_MINUTES, min)
                        putExtra(AlarmClock.EXTRA_MESSAGE, target.ifBlank { "Aanya Reminder" })
                        putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                }
                "make_call" -> {
                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:" + Uri.encode(target))).apply {
                        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                    }
                    startActivity(intent)
                }
                "start_video_call" -> {
                    val meetUrl = value.takeIf { it.startsWith("http") } ?: "https://meet.google.com"
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(meetUrl)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                }
                else -> {
                    if (nativeIntentUri.isNotBlank()) {
                        handleCustomSchemeUrl(nativeIntentUri)
                    }
                }
            }
        } catch (_: Exception) {
        }
    }

    inner class AanyaAndroidBridge {
        @JavascriptInterface
        fun isAccessibilityEnabled(): Boolean {
            return AanyaAccessibilityService.instance != null
        }

        @JavascriptInterface
        fun readCurrentScreen(): String {
            return AanyaAccessibilityService.instance?.readScreenText() ?: ""
        }

        @JavascriptInterface
        fun dispatchDeviceAction(actionJson: String) {
            val obj = JSONObject(actionJson)
            val type = obj.optString("type", "none")
            val target = obj.optString("target", "")
            val query = obj.optString("query", "")
            val value = obj.optString("value", "")
            val nativeIntentUri = obj.optString("nativeIntentUri", "")
            runOnUiThread {
                val acc = AanyaAccessibilityService.instance
                if (acc != null) {
                    acc.executeCommand(type, target, query, value)
                } else {
                    executeDirectIntentFallback(type, target, query, value, nativeIntentUri)
                }
            }
        }

        @JavascriptInterface
        fun openAccessibilitySettings() {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)
            startActivity(intent)
        }

        @JavascriptInterface
        fun openOverlaySettings() {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                Uri.parse("package:$packageName")
            )
            startActivity(intent)
        }
    }
}
`,
  },
];
