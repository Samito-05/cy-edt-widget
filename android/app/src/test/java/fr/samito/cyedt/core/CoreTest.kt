package fr.samito.cyedt.core

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDateTime
import java.time.ZoneId

class MemStore : Store {
    val files = HashMap<String, String>()
    override fun read(name: String) = files[name]
    override fun write(name: String, text: String) { files[name] = text }
    override fun delete(name: String) { files.remove(name) }
}

class MemCreds(override var user: String? = "e-dupont", override var pass: String? = "secret", override var fid: String = "22212345") : Creds {
    override val salt = "sel"
}

/** Faux CELCAT : sessions, refus d'identifiants, pannes. */
class FakeCelcat(var password: String = "secret", var events: String = "[]") : Http {
    var logged = false
    var down = false
    val posts = mutableListOf<String>()
    private val form = """<form><input name="__RequestVerificationToken" type="hidden" value="tok123" /><input name="Password" type="password"/></form>"""

    override fun get(url: String): Resp {
        if (down) throw java.io.IOException("réseau")
        return Resp(if (url.endsWith("/LdapLogin")) form else "<html></html>", url)
    }

    override fun post(url: String, form: String, headers: Map<String, String>): Resp {
        if (down) throw java.io.IOException("réseau")
        posts += url
        if (url.endsWith("/LdapLogin/Logon")) {
            return if (form.contains("Password=$password&")) { logged = true; Resp("<html>agenda</html>", "$BASE/cal?vt=agendaWeek&fid0=22212345") }
            else Resp("""<div class="validation-summary-errors"><ul><li>Nom d'utilisateur ou mot de passe incorrect.</li></ul></div>""" + this.form, url)
        }
        return Resp(if (logged) events else "<html>login</html>", url)
    }
}

private fun at(s: String) = LocalDateTime.parse(s)
private fun ms(s: String) = at(s).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

private fun ev(id: Int, start: String, end: String?, desc: String, category: String = "TD", color: String = "#0000ff") = JSONObject()
    .put("id", id).put("start", start).put("end", end ?: JSONObject.NULL).put("allDay", false)
    .put("description", desc).put("eventCategory", category).put("backgroundColor", color)
    .put("modules", JSONArray()).put("sites", JSONArray().put("PARIS"))

class ParserTest {
    @Test fun decodeEntities() {
        assertEquals("Économie & société", Parser.decode("&Eacute;conomie &amp;amp; soci&#233;t&#xE9;"))
        assertEquals("&#99999999;", Parser.decode("&#99999999;"))
        assertEquals("a b", Parser.decode(" <b>a</b>\n  b "))
    }

    @Test fun cleanNames() {
        assertEquals("Statistiques", Parser.cleanName("Statistiques [I2GSIM07]", emptyMap()))
        assertEquals("Anglais", Parser.cleanName("Anglais DIOANG3D", emptyMap()))
        assertEquals("Statistiques", Parser.cleanName("I2GSIM07 - Statistiques", emptyMap()))
        assertEquals("", Parser.cleanName("I2GSIM07", emptyMap()))
        assertEquals("Stats", Parser.cleanName("I2GSIM07", mapOf("I2GSIM07" to "Stats")))
    }

    @Test fun rooms() {
        assertEquals("FER FT202", Parser.shortRoom("FER FT202 SALLE DE TD 40p"))
        assertTrue(Parser.isRoom("FER FT202 SALLE DE TD 40p"))
        assertTrue(Parser.isStaff("ZAOUCHE DJAOUIDA"))
        assertFalse(Parser.isStaff("Statistiques"))
    }

    @Test fun greenIsReserved() {
        assertTrue(Parser.isGreen("#34C759"))
        assertFalse(Parser.isGreen("#0A84FF"))
        assertEquals(Parser.NOT_GREEN, Parser.courseColor("#0f0"))
        assertEquals(Parser.DEFAULT_COLOR, Parser.hexColor("rgb(1,2,3)"))
    }

    @Test fun parseEvent() {
        val data = JSONArray()
            .put(ev(1, "2026-09-24T08:30:00", "2026-09-24T10:00:00", "TD<br />FER FT202 SALLE DE TD 40p<br />ZAOUCHE DJAOUIDA<br />Statistiques [I2GSIM07]<br />ING2 GSI"))
            .put(ev(2, "2026-09-24T10:15:00", "2026-09-24T12:00:00", "CM<br />Amphi A<br />Économie<br />ING2 GSI", "CM"))
            .put(ev(3, "2026-09-24T13:00:00", "2026-09-24T14:00:00", "TD annulé<br />Anglais DIOANG3D<br />ING2 GSI", "TD annulé"))
            .put(ev(4, "2026-09-25T00:00:00", null, "Férié<br />ING2 GSI", "Férié", "#00ff00"))
            .put(JSONObject().put("id", 5).put("start", "n'importe quoi"))
        val c = Parser.parseAll(data)
        assertEquals(4, c.size)
        assertEquals("Statistiques", c[0].module)
        assertEquals("TD - Statistiques", c[0].title)
        assertEquals("FER FT202", c[0].room)
        assertEquals("ZAOUCHE DJAOUIDA", c[0].staff)
        assertEquals(Parser.argb("#0A84FF"), c[0].color)
        assertEquals("Économie", c[1].module)
        assertEquals(Parser.argb("#FF3B30"), c[1].color)
        assertTrue(c[2].cancelled)
        assertEquals("Anglais", c[2].module)
        assertTrue(c[3].allDay)
        assertEquals(Parser.argb(Parser.NOT_GREEN), c[3].color)
        assertEquals(3, Parser.parseAll(data, ParsePrefs(hide = listOf("anglais"))).size)
        assertEquals(3, Parser.parseAll(data, ParsePrefs(hide = listOf("/^CM - /i"))).size)
        assertEquals("Stats", Parser.parseAll(data, ParsePrefs(rename = mapOf("Statistiques" to "Stats")))[0].module)
    }
}

class ScheduleTest {
    private val data = JSONArray()
        .put(ev(1, "2026-09-24T08:30:00", "2026-09-24T10:00:00", "TD<br />FER FT202<br />Statistiques"))
        .put(ev(2, "2026-09-24T10:15:00", "2026-09-24T12:00:00", "CM<br />FER FT101<br />Économie", "CM"))
        .put(ev(3, "2026-09-25T08:30:00", "2026-09-25T10:00:00", "TD<br />FER FT303<br />Anglais"))
    private val courses = Parser.parseAll(data)

    @Test fun dayViews() {
        val v = Schedule.dayView(courses, at("2026-09-24T09:00:00"), 6)
        assertEquals("Aujourd'hui", v.label)
        assertEquals(2, v.shown.size)
        val live = Schedule.dayView(courses, at("2026-09-24T09:05:00"), 2, live = true)
        assertEquals(listOf("Économie"), live.shown.map { it.module })
        val evening = Schedule.dayView(courses, at("2026-09-24T18:00:00"), 6)
        assertEquals("Demain", evening.label)
        assertEquals("Jeudi 24 septembre", Schedule.dayView(courses, at("2026-09-22T18:00:00"), 6).label)
        assertEquals("Demain", Schedule.dayView(courses, at("2026-09-24T09:00:00"), 6, offset = 1).label)
        assertNull(Schedule.dayView(courses, at("2026-09-24T09:00:00"), 6, offset = 2).day)
    }

    @Test fun nextAndRedraw() {
        assertEquals("Statistiques", Schedule.nextClass(courses, at("2026-09-24T08:50:00"))!!.module)
        assertEquals("Économie", Schedule.nextClass(courses, at("2026-09-24T09:01:00"))!!.module)
        assertEquals(at("2026-09-24T09:00:00"), Schedule.nextRedraw(courses, at("2026-09-24T08:40:00")))
        assertEquals(at("2026-09-25T00:00:00"), Schedule.nextRedraw(courses, at("2026-09-24T13:00:00")))
        assertTrue(Schedule.nextText(courses, at("2026-09-24T08:00:00")).contains("salle FER FT202"))
    }

    @Test fun diffs() {
        val next = JSONArray(data.toString())
        next.getJSONObject(1).put("description", "CM<br />FER FT999<br />Économie")
        next.getJSONObject(2).put("eventCategory", "TD annulé")
        val changes = Schedule.diff(courses, Parser.parseAll(next), at("2026-09-24T07:00:00"), null, null)
        assertEquals(2, changes.size)
        assertTrue(changes[0], changes[0].startsWith("📍 Économie"))
        assertTrue(changes[1], changes[1].startsWith("❌ Anglais"))
    }
}

class CelcatTest {
    private var now = ms("2026-09-24T09:00:00")
    private val events = JSONArray().put(ev(1, "2026-09-24T10:00:00", "2026-09-24T11:00:00", "TD<br />Stats")).toString()

    @Test fun loginThenFetchThenCache() {
        val store = MemStore(); val http = FakeCelcat(events = events)
        val c = Celcat(store, MemCreds(), http) { now }
        val r = c.getEvents()
        assertTrue(r.fetched); assertEquals(1, r.data.length())
        assertNull(store.files[Celcat.AUTHLOCK])
        val posts = http.posts.size
        now += 5 * 60000
        assertFalse(c.getEvents().fetched)                     // encore frais : pas de réseau
        assertEquals(posts, http.posts.size)
    }

    @Test fun refusedPasswordIsNeverResent() {
        val store = MemStore(); val http = FakeCelcat(password = "autre", events = events)
        val creds = MemCreds()
        val c = Celcat(store, creds, http) { now }
        val r = c.getEvents()
        assertTrue(r.authBad); assertTrue(r.error!!, r.error!!.contains("incorrect"))
        assertEquals(1, http.posts.count { it.endsWith("/Logon") })
        repeat(5) { now += 60 * 60000; c.getEvents(force = true) }
        assertEquals(1, http.posts.count { it.endsWith("/Logon") })   // verrou : plus aucun envoi
        creds.pass = "autre"                                          // identifiants modifiés → le verrou saute
        assertNull(c.readAuthLock())
        assertTrue(c.getEvents(force = true).fetched)
    }

    @Test fun unconfirmedLoginsLockAfterTwoStrikes() {
        val store = MemStore()
        val http = object : Http {
            val logons = mutableListOf<String>()
            override fun get(url: String) = Resp("""<input name="__RequestVerificationToken" value="t" />""", url)
            override fun post(url: String, form: String, headers: Map<String, String>): Resp {
                if (url.endsWith("/Logon")) { logons += url; return Resp("<html>ok ?</html>", url) }
                return Resp("<html>SSO</html>", url)          // jamais de cours : page de connexion inconnue
            }
        }
        val c = Celcat(store, MemCreds(), http) { now }
        c.getEvents(force = true)
        assertFalse(c.readAuthLock()!!.blocked)
        c.getEvents(force = true)
        assertTrue(c.readAuthLock()!!.blocked)
        c.getEvents(force = true)
        assertEquals(2, http.logons.size)
    }

    @Test fun pendingThatNeverAnsweredCountsAsStrike() {
        val store = MemStore()
        val c = Celcat(store, MemCreds(), FakeCelcat()) { now }
        store.write(Celcat.AUTHLOCK, JSONObject().put("at", now).put("fp", c.credFingerprint()).put("pending", true).put("strikes", 1).toString())
        assertTrue(c.readAuthLock()!!.pending)
        assertEquals("Connexion en cours…", c.getEvents(force = true).error)
        now += 11 * 60000
        assertTrue(c.readAuthLock()!!.blocked)
    }

    @Test fun offlineUsesCacheWithBackoff() {
        val store = MemStore(); val http = FakeCelcat(events = events)
        val c = Celcat(store, MemCreds(), http) { now }
        c.getEvents()
        http.down = true
        now += 20 * 60000
        val r = c.getEvents()
        assertTrue(r.stale); assertEquals(1, r.data.length())
        http.down = false
        now += 5 * 60000
        assertTrue(c.getEvents().stale)                        // backoff : on patiente 15 min
        now += 15 * 60000
        assertTrue(c.getEvents().fetched)
    }

    @Test fun nightUsesCache() {
        val store = MemStore(); val http = FakeCelcat(events = events)
        val c = Celcat(store, MemCreds(), http) { now }
        c.getEvents()
        now = ms("2026-09-24T23:30:00")
        val n = http.posts.size
        assertFalse(c.getEvents().fetched)
        assertEquals(n, http.posts.size)
    }

    @Test fun detectsFidAfterLogin() {
        val store = MemStore(); val creds = MemCreds(fid = "")
        val c = Celcat(store, creds, FakeCelcat(events = events)) { now }
        assertTrue(c.getEvents().fetched)
        assertEquals("22212345", creds.fid)
    }

    @Test fun missingCredentials() {
        val c = Celcat(MemStore(), MemCreds(user = null, pass = null, fid = ""), FakeCelcat()) { now }
        assertEquals(Celcat.NO_CREDS_MSG, c.getEvents().error)
    }
}
