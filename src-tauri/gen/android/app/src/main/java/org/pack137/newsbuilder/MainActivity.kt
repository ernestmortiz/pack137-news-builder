package org.pack137.newsbuilder

import android.os.Bundle
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

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
}
