package fr.samito.cyedt.core

import org.json.JSONArray
import org.json.JSONObject
import java.time.Duration
import java.time.LocalDateTime
import java.time.OffsetDateTime
import java.time.ZoneId
import java.time.format.DateTimeParseException

// Portage fidèle du parsing de celcat-widget.js (version iOS) : mêmes règles pour
// deviner la matière, la salle, les enseignants, les cours annulés et les couleurs.

data class Course(
    val key: String,              // identifiant stable du cours
    val start: LocalDateTime,
    val end: LocalDateTime,
    val allDay: Boolean,          // férié, vacances, journée d'intégration…
    val title: String,            // « TD - Statistiques »
    val module: String,           // « Statistiques »
    val category: String,         // « TD »
    val staff: String,
    val room: String,
    val cancelled: Boolean,
    val color: Int,               // ARGB
)

/** Réglages qui changent l'analyse : cours masqués et matières renommées. */
data class ParsePrefs(
    val hide: List<String> = emptyList(),
    val rename: Map<String, String> = emptyMap(),
)

object Parser {
    private val IC = RegexOption.IGNORE_CASE

    // Entités HTML nommées courantes (le reste est géré en numérique : &#232; → è)
    private val ENTITIES = mapOf(
        "amp" to "&", "lt" to "<", "gt" to ">", "quot" to "\"", "apos" to "'", "nbsp" to " ",
        "eacute" to "é", "egrave" to "è", "ecirc" to "ê", "euml" to "ë", "agrave" to "à", "acirc" to "â", "auml" to "ä",
        "ccedil" to "ç", "icirc" to "î", "iuml" to "ï", "ocirc" to "ô", "ouml" to "ö", "ugrave" to "ù", "ucirc" to "û", "uuml" to "ü",
        "Eacute" to "É", "Egrave" to "È", "Ecirc" to "Ê", "Agrave" to "À", "Ccedil" to "Ç", "oelig" to "œ", "OElig" to "Œ",
        "rsquo" to "’", "lsquo" to "‘", "laquo" to "«", "raquo" to "»", "hellip" to "…", "ndash" to "–", "mdash" to "—", "deg" to "°",
    )

    // Code point hors Unicode : on laisse l'entité telle quelle
    private fun fromCp(cp: Long, raw: String): String =
        if (cp in 0..0x10FFFF) String(Character.toChars(cp.toInt())) else raw

    fun decode(s: String?): String = (s ?: "")
        .replace(Regex("<[^>]+>"), "")
        .replace("&amp;", "&")                                          // gère aussi "&amp;#232;"
        .replace(Regex("&#x([0-9a-f]+);", IC)) { fromCp(it.groupValues[1].toLongOrNull(16) ?: -1, it.value) }
        .replace(Regex("&#(\\d+);")) { fromCp(it.groupValues[1].toLongOrNull() ?: -1, it.value) }
        .replace(Regex("&([a-z]+);", IC)) { ENTITIES[it.groupValues[1]] ?: it.value }
        .replace(Regex("\\s+"), " ").trim()

    // CELCAT renvoie "2026-09-23T08:00:00", sans fuseau : heure locale.
    private val DATE_RE = Regex("^(\\d{4})-(\\d{2})-(\\d{2})(?:[T ](\\d{2}):(\\d{2})(?::(\\d{2}))?)?$")

    fun parseDate(v: Any?): LocalDateTime? {
        val s = (v as? String)?.trim() ?: return null
        DATE_RE.find(s)?.let { m ->
            val g = m.groupValues
            return try {
                LocalDateTime.of(g[1].toInt(), g[2].toInt(), g[3].toInt(),
                    g[4].ifEmpty { "0" }.toInt(), g[5].ifEmpty { "0" }.toInt(), g[6].ifEmpty { "0" }.toInt())
            } catch (e: Exception) { null }
        }
        // Date avec fuseau ("…Z", "…+02:00") : convertie en heure locale
        return try {
            OffsetDateTime.parse(s).atZoneSameInstant(ZoneId.systemDefault()).toLocalDateTime()
        } catch (e: DateTimeParseException) { null }
    }

    private val ROOM_WORD = Regex("salle|amphi|labo", IC)
    private val ROOM_CODE = Regex("^[A-Z]{2,5}[\\s-]?[A-Z]{0,3}\\d{2,4}\\b")
    fun isRoom(l: String) = ROOM_WORD.containsMatchIn(l) || ROOM_CODE.containsMatchIn(l)   // ex. "FER FT202 …"

    private val STAFF = Regex("^[A-ZÀ-ÖØ-Þ' ,.\\-]+$")
    fun isStaff(l: String) = Regex("\\s").containsMatchIn(l) && STAFF.matches(l)            // ex. "ZAOUCHE DJAOUIDA"

    // Salle courte : "FER FT202 SALLE DE TD 40p" → "FER FT202"
    fun shortRoom(r: String): String {
        val s = r.replace(Regex("\\s+\\d+\\s?p(l(aces?)?)?\\.?$", IC), "")
            .replace(Regex("\\s+SALLES?\\b.*$", IC), "")
            .trim()
        return s.ifEmpty { r }
    }

    private fun strings(v: Any?): List<String> {
        val a = v as? JSONArray ?: return emptyList()
        return (0 until a.length()).mapNotNull { a.opt(it) as? String }
    }

    private fun str(e: JSONObject, k: String): String? = e.opt(k) as? String

    fun splitLines(e: JSONObject): List<String> =
        (str(e, "description") ?: "").split(Regex("<br\\s*/?>", IC)).map(::decode).filter { it.isNotEmpty() }

    private val GROUP = Regex("\\b(ING\\d?|PRE-?ING\\d?|CPI\\d?|GR(P|OUPE)?\\s?[A-Z0-9]+|GSI|FISA|FISE|PROMO|L[1-3]|M[12]|S\\d{1,2})\\b", IC)
    fun looksLikeGroup(l: String) = GROUP.containsMatchIn(l)

    // Code matière : un seul "mot" majuscules + chiffres (ex. "DIOANG3D", "I2GSIM07", "22_ING2_STAT")
    fun isCode(s: String) = !Regex("\\s").containsMatchIn(s) && Regex("\\d").containsMatchIn(s) &&
        Regex("[A-Z]", IC).containsMatchIn(s) && Regex("^[A-Z0-9_\\-./]{4,}$", IC).matches(s) &&
        !Regex("[a-zà-ÿ]{3,}").containsMatchIn(s)

    // Retire les codes d'un intitulé : "Anglais DIOANG3D", "Statistiques [I2GSIM07]"… → le nom seul
    fun cleanName(s: String, rename: Map<String, String>): String {
        rename[s]?.let { return it }
        var out = s.replace(Regex("\\s*[\\[(]([^\\])]*)[\\])]\\s*")) { if (isCode(it.groupValues[1].trim())) " " else it.value }.trim()
        out = out.split(Regex("\\s+[-–]\\s+")).filter { !isCode(it.trim()) }.joinToString(" - ").trim()
        val words = out.split(" ").toMutableList()
        while (words.size > 1 && isCode(words.last())) words.removeAt(words.size - 1)   // code collé à la fin
        while (words.size > 1 && isCode(words.first())) words.removeAt(0)               // code collé au début
        out = words.joinToString(" ")
        rename[out]?.let { return it }
        return if (isCode(out)) "" else out
    }

    // Candidats matière d'un cours : champ "modules" + lignes de la description
    fun candidates(e: JSONObject, category: String): List<String> =
        (strings(e.opt("modules")).map(::decode) + splitLines(e))
            .filter { it.isNotEmpty() && it != category && !isRoom(it) && !isStaff(it) }

    // Intitulés présents dans la majorité des cours = groupe/promo, pas une matière
    fun frequentLines(data: List<JSONObject>, rename: Map<String, String>): Set<String> {
        val count = HashMap<String, Int>()
        data.forEach { e -> candidates(e, "").map { cleanName(it, rename) }.toSet().forEach { count[it] = (count[it] ?: 0) + 1 } }
        val min = if (data.size >= 4) 0.5 else 1.0
        return count.filter { (_, c) -> data.size >= 2 && c.toDouble() / data.size >= min }.keys
    }

    const val DEFAULT_COLOR = "#0A84FF"
    const val NOT_GREEN = "#AF52DE"          // le vert est réservé au cours en cours

    // Couleur selon le type de cours (1re règle qui correspond)
    private val TYPE_COLORS = listOf(
        Regex("^CM\\b|magistral", IC) to "#FF3B30",                              // rouge
        Regex("^TD\\b|dirig", IC) to "#0A84FF",                                  // bleu
        Regex("^TP\\b|pratique", IC) to "#AF52DE",                               // violet
        Regex("exam|partiel|\\bDS\\b|contr[oô]le|soutenance", IC) to "#FF9500",  // orange
    )

    private val HEX_RE = Regex("^#?(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$", IC)

    fun hexColor(v: Any?): String {
        val s = (v as? String ?: "").trim()
        if (!HEX_RE.matches(s)) return DEFAULT_COLOR
        return if (s.startsWith("#")) s else "#$s"
    }

    private fun rgbOf(hex: String): Triple<Double, Double, Double> {
        var h = hex.removePrefix("#")
        if (h.length <= 4) h = h.map { "$it$it" }.joinToString("")   // #RGB(A) → #RRGGBB(AA)
        return Triple(h.substring(0, 2).toInt(16) / 255.0, h.substring(2, 4).toInt(16) / 255.0, h.substring(4, 6).toInt(16) / 255.0)
    }

    fun isGreen(hex: String): Boolean {
        val (r, g, b) = rgbOf(hex)
        val max = maxOf(r, g, b); val min = minOf(r, g, b)
        if (max < 0.2 || (max - min) / max < 0.25) return false          // presque noir ou grisâtre
        val hue = when (max) {
            g -> 60 * ((b - r) / (max - min) + 2)
            r -> 60 * (((g - b) / (max - min) + 6) % 6)
            else -> 60 * ((r - g) / (max - min) + 4)
        }
        return hue in 70.0..170.0
    }

    fun courseColor(hex: String) = if (isGreen(hex)) NOT_GREEN else hex

    /** "#RRGGBB" (ou #RGB, #RRGGBBAA) → ARGB opaque */
    fun argb(hex: String): Int {
        val (r, g, b) = rgbOf(hex)
        return (0xFF shl 24) or ((r * 255).toInt() shl 16) or ((g * 255).toInt() shl 8) or (b * 255).toInt()
    }

    fun isCancelled(category: String, lines: List<String>) =
        Regex("annul|cancel", IC).containsMatchIn(category) || lines.any { Regex("\\bannul|\\bcancel", IC).containsMatchIn(it) }

    fun parse(e: JSONObject, frequent: Set<String>, rename: Map<String, String>): Course? {
        val start = parseDate(e.opt("start")) ?: return null
        val lines = splitLines(e)
        val category = decode(str(e, "eventCategory") ?: lines.firstOrNull() ?: "")
        val room = shortRoom(lines.firstOrNull(::isRoom) ?: strings(e.opt("sites")).map(::decode).joinToString(", "))
        val staff = lines.filter { it != category && isStaff(it) }.joinToString(", ")

        // Matière : on nettoie les codes, on note chaque candidat, le meilleur gagne
        fun score(l: String) = (if (Regex("[a-zà-ÿ]").containsMatchIn(l)) 3 else 0) -
            (if (l in frequent) 4 else 0) - (if (looksLikeGroup(l)) 2 else 0)
        val names = candidates(e, category).map { cleanName(it, rename) }.filter { it.isNotEmpty() }
            .distinct().sortedByDescending(::score)
        var module = names.firstOrNull() ?: ""
        module = module.replace(Regex("^" + Regex.escape(category) + "\\s*[-:]\\s*"), "")

        val type = TYPE_COLORS.firstOrNull { it.first.containsMatchIn(category) }
        val rawEnd = parseDate(e.opt("end"))
        val end = if (rawEnd == null || rawEnd.isBefore(start)) start.plusHours(1) else rawEnd
        // Journée entière : pas d'horaire à afficher, et surtout pas de rappel à minuit
        val allDay = e.opt("allDay") == true || rawEnd == null || Duration.between(start, end).toHours() >= 20
        val id = e.opt("id").takeIf { it != null && it != JSONObject.NULL }
        return Course(
            key = id?.toString() ?: "${e.opt("start")}|$module",
            start = start, end = end, allDay = allDay,
            title = if (module.isNotEmpty()) (if (category.isNotEmpty()) "$category - $module" else module) else category.ifEmpty { "Cours" },
            module = module.ifEmpty { category.ifEmpty { "Cours" } }, category = category,
            staff = staff, room = room,
            cancelled = isCancelled(category, lines),
            color = argb(courseColor(type?.second ?: hexColor(e.opt("backgroundColor")))),
        )
    }

    // Cours masqué : texte contenu dans la matière ou le type, ou /regex/ testée sur « Type - Matière »
    fun isHidden(c: Course, hide: List<String>) = hide.any { h ->
        val re = Regex("^/(.+)/([a-z]*)$").find(h.trim())
        if (re != null) {
            try {
                val opts = if ('i' in re.groupValues[2]) setOf(IC) else emptySet()
                Regex(re.groupValues[1], opts).containsMatchIn(c.title)
            } catch (e: Exception) { false }
        } else h.isNotBlank() && listOf(c.module, c.category).any { it.contains(h.trim(), ignoreCase = true) }
    }

    fun parseAll(data: JSONArray, prefs: ParsePrefs = ParsePrefs()): List<Course> {
        val ok = (0 until data.length()).mapNotNull { data.opt(it) as? JSONObject }.filter { parseDate(it.opt("start")) != null }
        val f = frequentLines(ok, prefs.rename)
        return ok.mapNotNull { parse(it, f, prefs.rename) }.filter { !isHidden(it, prefs.hide) }
    }

    /** Matières connues (pour les menus « masquer » / « renommer ») */
    fun knownModules(courses: List<Course>) =
        courses.filter { !it.allDay }.map { it.module }.distinct().sorted()
}
