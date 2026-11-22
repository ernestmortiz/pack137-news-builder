package org.pack137.newsbuilder

import java.util.Base64
import java.util.Locale

/**
 * The rules for saving a file from the page into Downloads. Plain Kotlin with no Android classes,
 * so JVM unit tests cover it. The name rules are a port of `sanitize_file_name` and
 * `free_destination` in src-tauri/src/lib.rs (the Windows wrapper) and must stay the same.
 */
object SaveRules {
  /** The largest file the app saves. Drafts are a few kilobytes; shrunk photos are under 1 MB. */
  const val MAX_BYTES = 8 * 1024 * 1024

  /** The kinds of file the app makes: drafts and shrunk photos. Anything else is refused. */
  private val EXTENSIONS = setOf("json", "jpg", "jpeg")

  /** The one origin Tauri serves the app from on Android. */
  fun isAppOrigin(scheme: String?, host: String?, port: Int): Boolean =
    scheme == "http" && host == "tauri.localhost" && port == -1

  fun mimeTypeFor(fileName: String): String =
    if (fileName.substringAfterLast('.').lowercase(Locale.ROOT) == "json") {
      "application/json"
    } else {
      "image/jpeg"
    }

  /**
   * Reduces a name the page suggested to a plain file name the app could have made: the part after
   * the last folder separator, only ASCII letters, digits, spaces and `-_.()` (anything else,
   * including invisible and right-to-left marks, becomes `_`), cut to 120 characters, no leading
   * or trailing dots and spaces, and not a name Windows reserves for devices. Null unless the name
   * ends in one of the allowed extensions.
   */
  fun sanitizeFileName(suggested: String): String? {
    val last = suggested.substring(maxOf(suggested.lastIndexOf('/'), suggested.lastIndexOf('\\')) + 1)

    // One character is one code point, as in Rust, so an emoji becomes one underscore.
    val cleaned = StringBuilder()
    var i = 0
    var count = 0
    while (i < last.length && count < 120) {
      val cp = last.codePointAt(i)
      i += Character.charCount(cp)
      count += 1
      val plain = (cp < 128) &&
        (cp.toChar() in 'a'..'z' || cp.toChar() in 'A'..'Z' || cp.toChar() in '0'..'9' ||
          " -_.()".indexOf(cp.toChar()) >= 0)
      cleaned.append(if (plain) cp.toChar() else '_')
    }
    val name = cleaned.toString().trim { it == '.' || it == ' ' }

    // A name with no stem ("json") has no extension, like Path::extension in Rust.
    val dot = name.lastIndexOf('.')
    if (dot <= 0) return null
    val extension = name.substring(dot + 1).lowercase(Locale.ROOT)
    if (extension !in EXTENSIONS) return null

    val stem = name.substringBefore('.').trim().uppercase(Locale.ROOT)
    val reserved = stem == "CON" || stem == "PRN" || stem == "AUX" || stem == "NUL" ||
      ((stem.startsWith("COM") || stem.startsWith("LPT")) && stem.length == 4 && stem[3] in '0'..'9')
    return if (reserved) "_$name" else name
  }

  /**
   * Picks `name`, or `name (1).ext`, `name (2).ext` and so on, the way browsers do, so a save
   * never writes over an earlier file. Null if every name up to 9999 is taken.
   */
  fun freeName(name: String, isTaken: (String) -> Boolean): String? {
    if (!isTaken(name)) return name
    val dot = name.lastIndexOf('.')
    val stem = if (dot > 0) name.substring(0, dot) else name
    val extension = if (dot > 0) name.substring(dot) else ""
    for (n in 1 until 10_000) {
      val candidate = "$stem ($n)$extension"
      if (!isTaken(candidate)) return candidate
    }
    return null
  }

  /**
   * The bytes inside a `data:<type>;base64,<data>` address, or null when it is not that form, is
   * not valid base64, or would be larger than MAX_BYTES.
   */
  fun decodeDataUrl(dataUrl: String): ByteArray? {
    if (!dataUrl.startsWith("data:")) return null
    val comma = dataUrl.indexOf(',')
    if (comma < 0 || !dataUrl.substring(0, comma).endsWith(";base64")) return null
    val payload = dataUrl.substring(comma + 1)
    // Base64 text is 4 characters for every 3 bytes. Refuse before decoding anything large.
    if (payload.length / 4 * 3 > MAX_BYTES + 3) return null
    val bytes = try {
      Base64.getDecoder().decode(payload)
    } catch (e: IllegalArgumentException) {
      return null
    }
    return if (bytes.size <= MAX_BYTES) bytes else null
  }
}
