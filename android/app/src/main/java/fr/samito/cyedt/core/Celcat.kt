package fr.samito.cyedt.core

import org.json.JSONArray
import org.json.JSONObject
import java.net.CookieManager
import java.net.CookiePolicy
import java.net.HttpCookie
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZoneId

// Téléchargement de l'emploi du temps CELCAT, cache hors ligne, backoff et verrou
// d'identifiants : portage de getEvents / login / readAuthLock de la version iOS.

const val BASE = "https://celcat-calendar.cyu.fr"

/** Fichiers texte privés de l'app (l'implémentation Android écrit de façon atomique). */
interface Store {
    fun read(name: String): String?
    fun write(name: String, text: String)
    fun delete(name: String)
}

/** Identifiants, stockés chiffrés (Android Keystore) côté Android. */
interface Creds {
    val user: String?
    val pass: String?
    var fid: String
    val salt: String
}

class Resp(val body: String, val url: String)

interface Http {
    fun get(url: String): Resp
    fun post(url: String, form: String, headers: Map<String, String> = emptyMap()): Resp
}

class CelcatException(
    message: String,
    val badCredentials: Boolean = false,
    val transient: Boolean = false,   // autre tentative de connexion en cours : pas un échec
    val fatal: Boolean = false,
) : Exception(message)

class FetchResult(
    val data: JSONArray,
    val stale: Boolean,
    val error: String? = null,
    val fetched: Boolean = false,
    val authBad: Boolean = false,
    val at: Long? = null,             // date du téléchargement affiché
    val until: Long? = null,
    val prev: JSONArray? = null,      // version précédente, pour détecter les changements
    val prevUntil: Long? = null,
)

private fun enc(s: String): String = URLEncoder.encode(s, "UTF-8")

class Celcat(
    private val store: Store,
    private val creds: Creds,
    private val http: Http,
    private val clock: () -> Long = System::currentTimeMillis,
) {
    companion object {
        const val DAYS_AHEAD = 14L
        const val FETCH_MIN = 15L
        const val CACHE_V = 2
        const val CACHE = "celcat_cache.json"
        const val AUTHLOCK = "celcat_auth.json"
        const val PENDING_TTL_MIN = 10L
        const val MAX_STRIKES = 2
        val FAIL_BACKOFF_MIN = listOf(15L, 60L, 180L, 360L)
        const val UNCONFIRMED_MSG = "Connexion non confirmée par CELCAT — ouvre l'app → « Débloquer et réessayer une fois »."
        const val NO_CREDS_MSG = "Ouvre l'app EDT CY pour te connecter."
        private val LOCK = Any()     // une seule connexion à la fois dans le processus
    }

    private fun nowDt(): LocalDateTime = LocalDateTime.ofInstant(Instant.ofEpochMilli(clock()), ZoneId.systemDefault())
    private fun ms(d: LocalDateTime) = d.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    // ---------- verrou d'identifiants ----------
    // Dès le PREMIER refus, plus aucune tentative de connexion n'est envoyée à CELCAT :
    // sinon le widget rejouerait le mauvais mot de passe toutes les 15 min et l'annuaire
    // CY finirait par bloquer le compte. Le verrou saute dès que les identifiants changent.
    // Une tentative posée juste avant l'envoi du mot de passe (pending) expire d'elle-même :
    // réponse jamais reçue (processus tué, réseau coupé) = essai suspect ; au bout de
    // MAX_STRIKES essais suspects, verrou définitif comme pour un refus.
    data class AuthLock(val pending: Boolean = false, val blocked: Boolean = false,
                        val msg: String? = null, val strikes: Int = 0, val at: Long = 0)

    fun credFingerprint(): String {
        val s = creds.salt + "\u0000" + (creds.user ?: "") + "\u0000" + (creds.pass ?: "")
        return MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).take(12).joinToString("") { "%02x".format(it) }
    }

    fun readAuthLock(): AuthLock? = try {
        store.read(AUTHLOCK)?.let { txt ->
            val o = JSONObject(txt)
            if (o.optString("fp") != credFingerprint()) { clearAuthLock(); null }   // identifiants modifiés
            else {
                val l = AuthLock(o.optBoolean("pending"), o.optBoolean("blocked"),
                    o.optString("msg").ifEmpty { null }, o.optInt("strikes"), o.optLong("at"))
                if (l.pending && clock() - l.at > PENDING_TTL_MIN * 60000) addStrike(l.strikes + 1)
                else l
            }
        }
    } catch (e: Exception) { null }

    private fun writeAuthLock(l: AuthLock) {
        val o = JSONObject().put("at", clock()).put("fp", credFingerprint())
            .put("pending", l.pending).put("blocked", l.blocked).put("strikes", l.strikes)
        l.msg?.let { o.put("msg", it) }
        try { store.write(AUTHLOCK, o.toString()) } catch (e: Exception) {}
    }

    private fun addStrike(strikes: Int): AuthLock {
        val l = if (strikes >= MAX_STRIKES) AuthLock(blocked = true, msg = UNCONFIRMED_MSG, strikes = strikes) else AuthLock(strikes = strikes)
        writeAuthLock(l)
        return l
    }

    fun clearAuthLock() { try { store.delete(AUTHLOCK) } catch (e: Exception) {} }

    private fun credError(msg: String) = CelcatException(msg, badCredentials = true)

    // Message d'erreur affiché par la page de connexion CELCAT, s'il y en a un
    fun loginErrorMessage(html: String): String {
        val m = Regex("validation-summary-errors[^>]*>([\\s\\S]{0,400}?)</div>", RegexOption.IGNORE_CASE).find(html)
        val txt = m?.groupValues?.get(1)?.replace(Regex("<[^>]+>"), " ")?.replace(Regex("&[#a-z0-9]+;", RegexOption.IGNORE_CASE), " ")
            ?.replace(Regex("\\s+"), " ")?.trim() ?: ""
        if (Regex("verrouill|bloqu|locked|disabled", RegexOption.IGNORE_CASE).containsMatchIn(txt)) return "Compte CY bloqué : $txt"
        return (if (txt.isNotEmpty()) "$txt — " else "Identifiants refusés — ") + "ouvre l'app et corrige tes identifiants."
    }

    // ---------- réseau ----------
    fun detectFid(vararg texts: String?): String {
        for (t in texts) {
            val s = t ?: continue
            val m = Regex("fid0=(\\d{5,})").find(s) ?: Regex("federationIds[^0-9]{0,30}(\\d{5,})").find(s)
            if (m != null) { creds.fid = m.groupValues[1]; return m.groupValues[1] }
        }
        return ""
    }

    /** true si un mot de passe est parti vers CELCAT */
    private fun login(): Boolean {
        val user = creds.user; val pass = creds.pass
        if (user.isNullOrEmpty() || pass.isNullOrEmpty()) throw CelcatException(NO_CREDS_MSG, fatal = true)
        // Un refus a déjà eu lieu avec CES identifiants : on n'envoie plus rien.
        val lock = readAuthLock()
        if (lock != null && lock.blocked) throw credError(lock.msg ?: UNCONFIRMED_MSG)
        if (lock != null && lock.pending) throw CelcatException("Connexion en cours…", transient = true)

        val page = http.get("$BASE/LdapLogin").body
        val token = Regex("__RequestVerificationToken[^>]*value=\"([^\"]+)\"").find(page)?.groupValues?.get(1)
            ?: return false   // pas de formulaire → pas de connexion nécessaire

        // Verrou posé AVANT l'envoi : si le processus meurt avant la réponse, un seul mot de passe part.
        val strikes = lock?.strikes ?: 0
        writeAuthLock(AuthLock(pending = true, strikes = strikes))
        val r = http.post("$BASE/LdapLogin/Logon",
            "Name=${enc(user)}&Password=${enc(pass)}&__RequestVerificationToken=${enc(token)}")
        // Identifiants refusés : CELCAT réaffiche le formulaire au lieu de rediriger vers l'agenda
        if (Regex("name=\"Password\"", RegexOption.IGNORE_CASE).containsMatchIn(r.body) && r.body.contains("__RequestVerificationToken")) {
            val msg = loginErrorMessage(r.body)
            writeAuthLock(AuthLock(blocked = true, msg = msg))   // une seule tentative : on s'arrête là
            throw credError(msg)
        }
        // Acceptée en apparence : le verrou ne saute qu'une fois les cours reçus
        writeAuthLock(AuthLock(strikes = strikes))
        if (creds.fid.isEmpty()) detectFid(r.url, r.body)
        return true
    }

    private fun findFid(): String {
        for (path in listOf("/cal", "/")) {
            val r = try { http.get(BASE + path) } catch (e: Exception) { continue }
            val id = detectFid(r.url, r.body)
            if (id.isNotEmpty()) return id
        }
        return ""
    }

    /** Du lundi de cette semaine à aujourd'hui + DAYS_AHEAD (exclu) */
    fun fetchWindow(): Pair<LocalDate, LocalDate> {
        val today = nowDt().toLocalDate()
        return today.minusDays((today.dayOfWeek.value - 1).toLong()) to today.plusDays(DAYS_AHEAD)
    }

    private fun fetchEvents(): JSONArray? {
        val (start, end) = fetchWindow()
        val txt = http.post("$BASE/Home/GetCalendarData",
            "start=$start&end=$end&resType=104&calView=agendaWeek&federationIds%5B%5D=${enc(creds.fid)}&colourScheme=3",
            mapOf("X-Requested-With" to "XMLHttpRequest")).body.trim()
        if (!txt.startsWith("[")) return null   // page HTML = non connecté
        return JSONArray(txt)
    }

    // ---------- cache ----------
    fun readCache(): JSONObject? = try {
        val txt = store.read(CACHE)
        val c = txt?.let(::JSONObject)
        if (c == null || c.optInt("v") != CACHE_V || c.optString("fid") != creds.fid) null else c
    } catch (e: Exception) { null }

    private fun writeCache(c: JSONObject) = store.write(CACHE, c.put("v", CACHE_V).toString())

    private fun backoffMs(count: Int) = FAIL_BACKOFF_MIN[minOf(count, FAIL_BACKOFF_MIN.size - 1)] * 60000

    /** Données en mémoire, sans réseau (affichage des widgets). */
    fun cached(): FetchResult {
        val lock = readAuthLock()
        val authBad = lock?.blocked == true
        val c = readCache() ?: return FetchResult(JSONArray(), stale = authBad, error = if (authBad) lock?.msg else null, authBad = authBad)
        val fail = c.optJSONObject("fail")
        return FetchResult(c.getJSONArray("data"), stale = authBad || fail != null,
            error = if (authBad) lock?.msg else fail?.optString("msg"), authBad = authBad, at = c.optLong("at"))
    }

    /** [force] : ouverture de l'app, bouton « Actualiser » (ignore délai, nuit et backoff, jamais le verrou). */
    fun getEvents(force: Boolean = false): FetchResult = synchronized(LOCK) {
        val lock = readAuthLock()
        var authBad = lock?.blocked == true
        val cached = readCache()
        val now = clock()
        val fresh = cached != null && now - cached.optLong("at") < (FETCH_MIN - 1) * 60000
        if (cached != null && creds.fid.isNotEmpty() && !force && (fresh || Schedule.isNight(nowDt())))
            return FetchResult(cached.getJSONArray("data"), stale = authBad, error = if (authBad) lock?.msg else null,
                authBad = authBad, at = cached.optLong("at"))

        // Tentative précédente en échec : on patiente
        val fail = cached?.optJSONObject("fail")
        if (fail != null && !force && now - fail.optLong("at") < backoffMs(fail.optInt("count")))
            return FetchResult(cached.getJSONArray("data"), stale = true, error = fail.optString("msg"), authBad = authBad, at = cached.optLong("at"))

        try {
            var data = if (creds.fid.isNotEmpty()) fetchEvents() else null
            if (data == null) {
                val sent = login()
                if (creds.fid.isEmpty()) findFid()
                if (creds.fid.isEmpty())
                    throw CelcatException("Numéro étudiant manquant : ouvre l'app et renseigne-le.", fatal = true)
                data = fetchEvents()
                // Mot de passe parti, « accepté », mais toujours pas de cours : essai suspect
                if (data == null && sent) {
                    val l = addStrike((readAuthLock()?.strikes ?: 0) + 1)
                    if (l.blocked) throw credError(l.msg ?: UNCONFIRMED_MSG)
                }
            }
            if (data == null) throw CelcatException("Connexion refusée (identifiants ?)")
            // Cours reçus : connexion confirmée, compteur d'essais remis à zéro
            val l = readAuthLock()
            if (l != null && !l.blocked && !l.pending) clearAuthLock()
            // Réponse vide alors qu'on avait des cours à venir → raté du serveur : on garde l'ancienne version
            if (data.length() == 0 && cached != null) {
                val old = cached.getJSONArray("data")
                val upcoming = (0 until old.length()).count { i ->
                    Parser.parseDate(old.optJSONObject(i)?.opt("start"))?.isAfter(nowDt()) == true }
                if (upcoming >= 4) throw CelcatException("Réponse vide du serveur")
            }
            val until = ms(fetchWindow().second.atStartOfDay())
            writeCache(JSONObject().put("at", now).put("fid", creds.fid).put("until", until).put("data", data))
            return FetchResult(data, stale = false, fetched = true, at = now, until = until,
                prev = cached?.getJSONArray("data"), prevUntil = cached?.optLong("until"))
        } catch (e: Exception) {
            val ce = e as? CelcatException
            if (ce?.badCredentials == true) authBad = true
            val msg = ce?.message ?: "Réseau indisponible"
            // Une autre tentative a pu réussir pendant ce temps : on relit le cache
            val cur = readCache() ?: cached
            if (cur != null && cached != null && cur.optLong("at") > cached.optLong("at") && !cur.has("fail"))
                return FetchResult(cur.getJSONArray("data"), stale = false, at = cur.optLong("at"))
            if (ce?.transient == true && cur != null) return FetchResult(cur.getJSONArray("data"), stale = false, at = cur.optLong("at"))
            if (cur != null && ce?.transient != true) {
                val f = cur.optJSONObject("fail")
                val count = if (f != null) f.optInt("count") + 1 else if (ce?.badCredentials == true) 1 else 0
                try { writeCache(cur.put("fail", JSONObject().put("at", now).put("count", count).put("msg", msg))) } catch (err: Exception) {}
            }
            if (ce?.fatal != true && cur != null)
                return FetchResult(cur.getJSONArray("data"), stale = true, error = msg, authBad = authBad, at = cur.optLong("at"))
            // Rien en mémoire : on affiche l'erreur, pas un plantage
            return FetchResult(JSONArray(), stale = true, error = msg, authBad = authBad)
        }
    }

    /** Nouveaux identifiants enregistrés : on a le droit de retenter, le cache d'échec est oublié. */
    fun credentialsChanged() {
        clearAuthLock()
        readCache()?.let { c -> c.remove("fail"); try { writeCache(c) } catch (e: Exception) {} }
    }
}

/** Client HTTP (java.net) : cookies de session gardés sur le disque, redirections suivies à la main. */
class CelcatHttp(private val store: Store) : Http {
    private val cookies = CookieManager(null, CookiePolicy.ACCEPT_ALL)
    private val COOKIES = "celcat_cookies.json"

    init {
        try {
            val a = JSONArray(store.read(COOKIES) ?: "[]")
            for (i in 0 until a.length()) {
                val o = a.getJSONObject(i)
                val c = HttpCookie(o.getString("n"), o.getString("v"))
                c.path = o.optString("p", "/")
                c.maxAge = o.optLong("m", -1)
                c.secure = true
                cookies.cookieStore.add(URI(BASE), c)
            }
        } catch (e: Exception) {}
    }

    private fun saveCookies() {
        val a = JSONArray()
        cookies.cookieStore.cookies.filter { !it.hasExpired() }.forEach {
            a.put(JSONObject().put("n", it.name).put("v", it.value).put("p", it.path ?: "/").put("m", it.maxAge))
        }
        try { store.write(COOKIES, a.toString()) } catch (e: Exception) {}
    }

    override fun get(url: String) = send(url, null, emptyMap())
    override fun post(url: String, form: String, headers: Map<String, String>) = send(url, form, headers)

    private fun send(start: String, form: String?, headers: Map<String, String>): Resp {
        var url = start
        var body = form
        repeat(8) {
            val uri = URI(url)
            val c = URL(url).openConnection() as HttpURLConnection
            c.instanceFollowRedirects = false
            c.connectTimeout = 15000
            c.readTimeout = 20000
            c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) cy-edt-android")
            c.setRequestProperty("Accept-Language", "fr-FR,fr;q=0.9")
            cookies.get(uri, emptyMap()).forEach { (k, v) -> if (v.isNotEmpty()) c.setRequestProperty(k, v.joinToString("; ")) }
            headers.forEach { (k, v) -> c.setRequestProperty(k, v) }
            if (body != null) {
                c.requestMethod = "POST"
                c.doOutput = true
                c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded; charset=UTF-8")
                c.outputStream.use { it.write(body!!.toByteArray()) }
            }
            try {
                val code = c.responseCode
                cookies.put(uri, c.headerFields.filterKeys { it != null })
                saveCookies()
                val loc = c.getHeaderField("Location")
                if (code in 300..399 && loc != null) {
                    url = uri.resolve(loc).toString()
                    if (code != 307 && code != 308) body = null   // POST → GET après 301/302/303
                    return@repeat
                }
                val stream = if (code >= 400) c.errorStream else c.inputStream
                val text = stream?.use { it.readBytes().toString(Charsets.UTF_8) } ?: ""
                if (code >= 500) throw CelcatException("CELCAT indisponible ($code)")
                return Resp(text, url)
            } finally { c.disconnect() }
        }
        throw CelcatException("Trop de redirections")
    }
}
