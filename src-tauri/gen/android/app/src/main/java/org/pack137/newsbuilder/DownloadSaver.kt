package org.pack137.newsbuilder

import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Environment
import android.provider.MediaStore
import android.util.Log
import android.webkit.WebView
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebMessageCompat
import androidx.webkit.WebViewCompat
import java.io.IOException
import java.util.concurrent.Executors
import org.json.JSONException
import org.json.JSONObject

/**
 * Receives "save this file" messages from the page (see src-tauri/src/android-save.js) and writes
 * the file into the public Downloads folder with MediaStore. That needs no storage permission on
 * Android 10 and later, and it can write nowhere else. The page already tells the person to look
 * in Downloads, so a refused or failed save shows nothing; it is logged.
 */
class DownloadSaver(private val context: Context) : WebViewCompat.WebMessageListener {
  private val worker = Executors.newSingleThreadExecutor()

  override fun onPostMessage(
    view: WebView,
    message: WebMessageCompat,
    sourceOrigin: Uri,
    isMainFrame: Boolean,
    replyProxy: JavaScriptReplyProxy,
  ) {
    if (!isMainFrame || !SaveRules.isAppOrigin(sourceOrigin.scheme, sourceOrigin.host, sourceOrigin.port)) {
      Log.w(TAG, "Refused a save from $sourceOrigin (main frame: $isMainFrame)")
      return
    }
    val (name, bytes) = parse(message) ?: return
    worker.execute {
      try {
        val saved = save(name, bytes)
        Log.i(TAG, "Saved $saved in Downloads (${bytes.size} bytes)")
      } catch (e: Exception) {
        Log.w(TAG, "Could not save $name", e)
      }
    }
  }

  /** The plain file name and the file's bytes from a message, or null (and a log line) if refused. */
  private fun parse(message: WebMessageCompat): Pair<String, ByteArray>? {
    val raw = try {
      message.data
    } catch (e: RuntimeException) {
      null
    }
    // The data URL is about 4/3 the size of the file, plus the name and the JSON around it.
    if (raw == null || raw.length > SaveRules.MAX_BYTES / 3 * 4 + 4096) {
      Log.w(TAG, "Refused a save: not a text message or too large")
      return null
    }
    val json = try {
      JSONObject(raw)
    } catch (e: JSONException) {
      Log.w(TAG, "Refused a save: the message was not what the app sends")
      return null
    }
    val suggested = json.optString("name", "")
    val dataUrl = json.optString("dataUrl", "")
    val name = SaveRules.sanitizeFileName(suggested)
    if (name == null) {
      Log.w(TAG, "Refused a save: the file type is not one the app makes")
      return null
    }
    val bytes = SaveRules.decodeDataUrl(dataUrl)
    if (bytes == null) {
      Log.w(TAG, "Refused a save: the data is not valid or is over ${SaveRules.MAX_BYTES} bytes")
      return null
    }
    return Pair(name, bytes)
  }

  /** Writes into Downloads under a free name and returns that name. */
  private fun save(wanted: String, bytes: ByteArray): String {
    val resolver = context.contentResolver
    val collection = MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
    val folder = Environment.DIRECTORY_DOWNLOADS

    fun isTaken(displayName: String): Boolean =
      resolver.query(
        collection,
        arrayOf(MediaStore.Downloads._ID),
        "${MediaStore.Downloads.DISPLAY_NAME} = ? AND ${MediaStore.Downloads.RELATIVE_PATH} = ?",
        arrayOf(displayName, "$folder/"),
        null,
      )?.use { it.count > 0 } ?: false

    val name = SaveRules.freeName(wanted, ::isTaken) ?: throw IOException("No free name for $wanted")
    val values = ContentValues().apply {
      put(MediaStore.Downloads.DISPLAY_NAME, name)
      put(MediaStore.Downloads.MIME_TYPE, SaveRules.mimeTypeFor(name))
      put(MediaStore.Downloads.RELATIVE_PATH, folder)
      put(MediaStore.Downloads.IS_PENDING, 1)
    }
    val uri = resolver.insert(collection, values) ?: throw IOException("MediaStore refused $name")
    try {
      val out = resolver.openOutputStream(uri, "w") ?: throw IOException("Could not open $name")
      out.use { it.write(bytes) }
      values.clear()
      values.put(MediaStore.Downloads.IS_PENDING, 0)
      resolver.update(uri, values, null, null)
    } catch (e: Exception) {
      resolver.delete(uri, null, null)
      throw e
    }
    return name
  }

  private companion object {
    const val TAG = "Pack137Save"
  }
}
