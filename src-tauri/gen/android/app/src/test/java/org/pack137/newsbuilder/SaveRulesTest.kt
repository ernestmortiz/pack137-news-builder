package org.pack137.newsbuilder

import java.util.Base64
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The same cases as the Rust tests in src-tauri/src/lib.rs, so the two wrappers agree. */
class SaveRulesTest {
  private fun ok(s: String) = SaveRules.sanitizeFileName(s)

  @Test
  fun fileNamesBecomePlain() {
    assertEquals("pack137-letter-2026-12.json", ok("pack137-letter-2026-12.json"))
    assertEquals("Pinewood derby-letter.jpg", ok("Pinewood derby-letter.jpg"))
    assertEquals("photo.JPEG", ok("photo.JPEG"))
    assertEquals("passwd.json", ok("../../etc/passwd.json"))
    assertEquals("draft.json", ok("C:\\Windows\\draft.json"))
    assertEquals("a_b__c_d_.json", ok("a<b>:c|d?.json"))
    assertEquals("hidden.json", ok("  ..hidden.json "))
    assertNull("nothing but an extension is refused", ok(".json"))
    assertEquals("_nul.json", ok("nul.json"))
    assertEquals("_CON .json", ok("CON .json"))
    assertEquals("_COM1.jpg", ok("COM1.jpg"))
    assertEquals("con_trol.json", ok("con\u0000trol.json"))
    // A right-to-left mark cannot disguise the extension.
    assertEquals("draft_gpj.json", ok("draft\u202egpj.json"))
    assertNull("cut names lose the extension", ok("x".repeat(500) + ".json"))
    // One emoji is one character, as in Rust.
    assertEquals("a_b.json", ok("a\uD83D\uDE00b.json"))
  }

  @Test
  fun fileTypesTheAppDoesNotMakeAreRefused() {
    for (bad in listOf(
      "Open me.command", "setup.exe", "draft.json.exe", "link.lnk", "script.scpt",
      "page.html", "noextension", "", "../", "draft\u202enosj.exe",
    )) {
      assertNull("$bad should be refused", ok(bad))
    }
  }

  @Test
  fun takenNamesGetANumberBeforeTheExtension() {
    val taken = mutableSetOf<String>()
    fun next(): String {
      val name = SaveRules.freeName("draft.json") { it in taken }!!
      taken.add(name)
      return name
    }
    assertEquals("draft.json", next())
    assertEquals("draft (1).json", next())
    assertEquals("draft (2).json", next())
    assertEquals("a.b (1).jpg", SaveRules.freeName("a.b.jpg") { it == "a.b.jpg" })
  }

  @Test
  fun nothingIsFreeWhenEverythingIsTaken() {
    assertNull(SaveRules.freeName("draft.json") { true })
  }

  @Test
  fun onlyTheAppOriginIsTrusted() {
    assertTrue(SaveRules.isAppOrigin("http", "tauri.localhost", -1))
    assertFalse(SaveRules.isAppOrigin("https", "tauri.localhost", -1))
    assertFalse(SaveRules.isAppOrigin("http", "tauri.localhost", 8080))
    assertFalse(SaveRules.isAppOrigin("http", "tauri.localhost.example.org", -1))
    assertFalse(SaveRules.isAppOrigin("tauri", "localhost", -1))
    assertFalse(SaveRules.isAppOrigin(null, null, -1))
  }

  @Test
  fun dataUrlsAreDecodedAndChecked() {
    val bytes = byteArrayOf(1, 2, 3, 4, 5)
    val text = Base64.getEncoder().encodeToString(bytes)
    assertArrayEquals(bytes, SaveRules.decodeDataUrl("data:image/jpeg;base64,$text"))
    assertArrayEquals(ByteArray(0), SaveRules.decodeDataUrl("data:;base64,"))
    assertNull(SaveRules.decodeDataUrl("data:image/jpeg,$text"))
    assertNull(SaveRules.decodeDataUrl("http://example.org/;base64,$text"))
    assertNull(SaveRules.decodeDataUrl("data:image/jpeg;base64,not base64!"))
    val big = Base64.getEncoder().encodeToString(ByteArray(SaveRules.MAX_BYTES + 1))
    assertNull(SaveRules.decodeDataUrl("data:image/jpeg;base64,$big"))
    val limit = Base64.getEncoder().encodeToString(ByteArray(SaveRules.MAX_BYTES))
    assertEquals(SaveRules.MAX_BYTES, SaveRules.decodeDataUrl("data:image/jpeg;base64,$limit")?.size)
  }

  @Test
  fun mimeTypesFollowTheExtension() {
    assertEquals("application/json", SaveRules.mimeTypeFor("a.json"))
    assertEquals("application/json", SaveRules.mimeTypeFor("a.JSON"))
    assertEquals("image/jpeg", SaveRules.mimeTypeFor("a.jpg"))
    assertEquals("image/jpeg", SaveRules.mimeTypeFor("a.jpeg"))
  }
}
