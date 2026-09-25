package fr.samito.cyedt.core

import java.time.LocalDate
import java.time.LocalDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

// Choix des cours à afficher, libellés et détection des changements (portés de la version iOS).
object Schedule {
    const val NIGHT_START = 22          // la nuit (22h → 7h) : aucun appel réseau
    const val NIGHT_END = 7
    const val HIDE_AFTER_MIN = 30L      // mode live : un cours disparaît 30 min après son début
    const val CHANGES_DAYS = 7L         // fenêtre de détection des changements

    private val FR = Locale.FRENCH
    fun hm(d: LocalDateTime): String = d.format(DateTimeFormatter.ofPattern("HH:mm"))
    fun cap(s: String) = s.replaceFirstChar { it.titlecase(FR) }
    fun fmt(d: LocalDateTime, pattern: String): String = d.format(DateTimeFormatter.ofPattern(pattern, FR))

    fun isNight(now: LocalDateTime) = now.hour >= NIGHT_START || now.hour < NIGHT_END

    fun dayLabel(d: LocalDate, today: LocalDate): String = when (d) {
        today -> "Aujourd'hui"
        today.plusDays(1) -> "Demain"
        else -> cap(d.format(DateTimeFormatter.ofPattern("EEEE d MMMM", FR)))
    }

    // "Jeu 24 13:00"
    fun whenStr(d: LocalDateTime) = "${cap(fmt(d, "EEE d").replace(".", ""))} ${hm(d)}"

    private fun hideAt(c: Course) = c.start.plusMinutes(HIDE_AFTER_MIN)

    data class DayView(
        val day: LocalDate?,            // null : plus aucun cours prévu
        val label: String,
        val allDay: List<Course>,
        val shown: List<Course>,
        val count: Int,                 // cours non annulés ce jour-là
    )

    /**
     * Aujourd'hui s'il reste des cours, sinon le prochain jour avec cours.
     * [offset] > 0 : Nᵉ jour de cours suivant. [live] : un cours disparaît 30 min après son début.
     */
    fun dayView(courses: List<Course>, now: LocalDateTime, max: Int, live: Boolean = false, offset: Int = 0): DayView {
        val sorted = courses.sortedBy { it.start }
        fun visible(c: Course) = c.end.isAfter(now) && (!live || hideAt(c).isAfter(now))
        val next = sorted.firstOrNull { !it.allDay && visible(it) && !it.cancelled }
        var target: LocalDate? = next?.start?.toLocalDate() ?: now.toLocalDate()
        if (offset > 0) {
            val days = sorted.filter { !it.cancelled && !it.allDay }.map { it.start.toLocalDate() }.distinct().filter { it > target }
            target = days.getOrNull(offset - 1)
        }
        val onTarget = if (target != null) sorted.filter { it.start.toLocalDate() == target } else emptyList()
        val allDay = onTarget.filter { it.allDay && !it.cancelled }
        val dayCourses = onTarget.filter { !it.allDay }
        val shown = if (live) dayCourses.filter(::visible).take(max) else {
            var from = 0
            if (dayCourses.size > max) {
                val idx = dayCourses.indexOfFirst { it.end.isAfter(now) }
                from = minOf(maxOf(idx, 0), dayCourses.size - max)
            }
            dayCourses.drop(from).take(max)
        }
        return DayView(
            day = target,
            label = target?.let { dayLabel(it, now.toLocalDate()) } ?: "Plus tard",
            allDay = allDay, shown = shown,
            count = dayCourses.count { !it.cancelled },
        )
    }

    /** Prochain cours (ou cours en cours depuis moins de 30 min) */
    fun nextClass(courses: List<Course>, now: LocalDateTime) = courses.sortedBy { it.start }
        .firstOrNull { !it.cancelled && !it.allDay && it.end.isAfter(now) && hideAt(it).isAfter(now) }

    /** Moments où l'affichage change (début, +30 min, fin de chaque cours) */
    fun edges(courses: List<Course>) = courses.filter { !it.allDay }.flatMap { listOf(it.start, hideAt(it), it.end) }

    /** Prochain rafraîchissement : prochain début/fin de cours, sinon minuit (changement de jour). */
    fun nextRedraw(courses: List<Course>, now: LocalDateTime): LocalDateTime {
        val midnight = now.toLocalDate().plusDays(1).atStartOfDay()
        return edges(courses).filter { it.isAfter(now) }.minOrNull()?.takeIf { it < midnight } ?: midnight
    }

    /** Compare l'ancien planning au nouveau → changements lisibles (7 prochains jours) */
    fun diff(prev: List<Course>, next: List<Course>, now: LocalDateTime, prevUntil: LocalDateTime?, nextUntil: LocalDateTime?): List<String> {
        val limit = listOfNotNull(now.plusDays(CHANGES_DAYS), prevUntil, nextUntil).min()
        fun inScope(c: Course) = c.start.isAfter(now) && c.start.isBefore(limit)
        val p = prev.associateBy { it.key }
        val n = next.associateBy { it.key }
        val changes = mutableListOf<String>()
        val removed = mutableListOf<Course>()
        val added = mutableListOf<Course>()

        for ((k, a) in p) {
            val b = n[k]
            if (b == null) { if (inScope(a) && !a.cancelled) removed += a; continue }
            if (!inScope(a) && !inScope(b)) continue
            if (!a.cancelled && b.cancelled) { changes += "❌ ${b.module} ${whenStr(b.start)} : annulé"; continue }
            if (a.cancelled && !b.cancelled) changes += "✅ ${b.module} ${whenStr(b.start)} : rétabli"
            if (a.start != b.start || a.end != b.end)
                changes += "🕒 ${b.module} : ${whenStr(a.start)} → ${whenStr(b.start)}–${hm(b.end)}"
            if (a.room != b.room && !b.cancelled)
                changes += "📍 ${b.module} ${whenStr(b.start)} : ${a.room.ifEmpty { "?" }} → ${b.room.ifEmpty { "?" }}"
        }
        for ((k, b) in n) if (k !in p && inScope(b) && !b.cancelled) added += b

        // Un cours retiré + un cours ajouté de la même matière = cours déplacé
        for (r in removed.toList()) {
            val i = added.indexOfFirst { it.module == r.module && it.category == r.category }
            if (i < 0) continue
            val a = added.removeAt(i)
            removed.remove(r)
            changes += "🕒 ${a.module} : ${whenStr(r.start)} → ${whenStr(a.start)}" + (if (a.room != r.room) " · ${a.room}" else "")
        }
        removed.forEach { changes += "❌ ${it.module} ${whenStr(it.start)} : retiré de l'emploi du temps" }
        added.forEach { changes += "➕ ${it.title} ${whenStr(it.start)}" + (if (it.room.isNotEmpty()) " · ${it.room}" else "") }
        return changes
    }

    // Réponses texte (partage / copie), comme Siri sur iOS
    fun nextText(courses: List<Course>, now: LocalDateTime): String {
        val c = nextClass(courses, now) ?: return "Aucun cours prévu."
        val day = dayLabel(c.start.toLocalDate(), now.toLocalDate()).lowercase(FR).let {
            if (it.startsWith("aujourd") || it == "demain") it else "le $it"
        }
        val what = c.module + if (c.category.isNotEmpty()) " (${c.category})" else ""
        return if (!c.start.isAfter(now)) "En cours : $what jusqu'à ${hm(c.end)}, salle ${c.room.ifEmpty { "inconnue" }}."
        else "Prochain cours : $what, $day à ${hm(c.start)}, salle ${c.room.ifEmpty { "inconnue" }}."
    }
}
