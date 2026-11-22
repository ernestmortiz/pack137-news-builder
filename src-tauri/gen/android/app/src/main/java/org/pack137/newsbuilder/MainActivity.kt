package org.pack137.newsbuilder

import android.os.Bundle
import android.util.Log
import android.view.View
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)

    // Android 15 and later draw apps edge to edge and no setting turns that off, so the page would
    // sit under the status bar, the navigation bar and a camera cutout, and the on-screen keyboard
    // would cover the field being typed in. Padding the window's content area by those insets keeps
    // the page in the free space. This is Kotlin only: the page is unchanged.
    val content = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val free = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime()
      )
      view.setPadding(free.left, free.top, free.right, free.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  // Saving a file. The Android web view has no download handler, so the script that lib.rs adds to
  // the page (src-tauri/src/android-save.js) posts the file to this one object, and DownloadSaver
  // writes it into Downloads. The object exists only for http://tauri.localhost, and DownloadSaver
  // checks the origin and the main frame again. Registered here, before the first page loads.
  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    // Test builds only: lets the emulator test in CI read the page. Release builds are not
    // debuggable.
    if (BuildConfig.DEBUG) WebView.setWebContentsDebuggingEnabled(true)
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
      WebViewCompat.addWebMessageListener(
        webView,
        "pack137Save",
        setOf("http://tauri.localhost"),
        DownloadSaver(applicationContext),
      )
    } else {
      Log.w("Pack137Save", "This web view cannot receive messages, so files cannot be saved")
    }
  }
}
