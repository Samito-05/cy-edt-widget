package fr.samito.cyedt.core

import java.time.DayOfWeek
import java.time.LocalDate
import java.time.LocalDateTime

// Vue semaine : portage de buildWeekWidget / layoutDay de la version iOS.
// Ici uniquement le modèle (quels jours, quelle plage horaire, quel cours où) ;
// le dessin est fait par WeekRenderer côté Android.
object Week {
    const val MAX_LANES = 2          // au-delà, les derniers cours simultanés sont résumés en « +N »

    data class Model(
        val monday: LocalDate,
        val days: List<LocalDate>,           // lun → ven (+ sam / dim s'il y a cours)
        val startMin: Int,                   // plage horaire affichée, en minutes depuis minuit
        val endMin: Int,
        val courses: List<Course>,           // cours horodatés de la semaine
        val allDay: Map<LocalDate, Course>,  // férié / vacances : la colonne est teintée
        val beyond: Boolean,                 // semaine au-delà des jours téléchargés
    )

    private fun mins(d: LocalDateTime) = d.hour * 60 + d.minute

    fun mondayOf(d: LocalDate): LocalDate = d.with(DayOfWeek.MONDAY)

    fun model(courses: List<Course>, now: LocalDateTime, offset: Int, fetchedUntil: LocalDate): Model {
        val sorted = courses.sortedBy { it.start }
        // Semaine en cours, ou la suivante s'il ne reste plus de cours cette semaine
        var monday = mondayOf(now.toLocalDate())
        val endOf = { m: LocalDate -> m.plusDays(7).atStartOfDay() }
        if (sorted.none { !it.cancelled && !it.allDay && it.end.isAfter(now) && it.start.isBefore(endOf(monday)) })
            monday = monday.plusDays(7)
        monday = monday.plusWeeks(offset.toLong())
        val inWeek = sorted.filter { !it.start.isBefore(monday.atStartOfDay()) && it.start.isBefore(endOf(monday)) }
        val timed = inWeek.filter { !it.allDay }
        val allDay = inWeek.filter { it.allDay && !it.cancelled }.associateBy { it.start.toLocalDate() }

        val nDays = when {
            timed.any { it.start.dayOfWeek == DayOfWeek.SUNDAY } -> 7
            timed.any { it.start.dayOfWeek == DayOfWeek.SATURDAY } -> 6
            else -> 5
        }
        var startMin = 8 * 60
        var endMin = 18 * 60
        if (timed.isNotEmpty()) {
            startMin = timed.minOf { mins(it.start) } / 60 * 60
            endMin = (timed.maxOf { if (it.end.toLocalDate() > it.start.toLocalDate()) 24 * 60 else mins(it.end) } + 59) / 60 * 60
            endMin = maxOf(endMin, startMin + 60)   // cours de durée nulle
        }
        return Model(monday, (0 until nDays).map { monday.plusDays(it.toLong()) }, startMin, endMin,
            timed, allDay, beyond = !monday.isBefore(fetchedUntil))
    }

    data class Placed(val course: Course, val y: Float, val h: Float)   // y relatif au haut du groupe
    data class Group(val top: Float, val h: Float, val lanes: List<List<Placed>>, val hidden: List<Course>)

    /**
     * Placement vertical des cours d'une journée. Les cours qui se chevauchent forment un
     * groupe ; chaque cours va dans la 1re colonne (lane) libre. [y] : date → position dans
     * la grille, [minH] : hauteur minimale d'un bloc.
     */
    fun layoutDay(evts: List<Course>, y: (LocalDateTime) -> Float, gridH: Float, minH: Float = 10f): List<Group> {
        val sorted = evts.sortedWith(compareBy<Course> { it.start }.thenByDescending { it.end })
        val out = mutableListOf<Group>()
        var cursor = 0f
        var i = 0
        while (i < sorted.size) {
            val group = mutableListOf(sorted[i])
            var end = sorted[i].end
            i++
            while (i < sorted.size && sorted[i].start.isBefore(end)) {
                group += sorted[i]
                if (sorted[i].end.isAfter(end)) end = sorted[i].end
                i++
            }
            val top = maxOf(y(group[0].start), cursor)
            val h = minOf(maxOf(minH, y(end) - top), gridH - top)   // jamais plus bas que la grille
            if (h <= 0) continue

            val lanes = mutableListOf<MutableList<Course>>()
            for (e in group) {
                val lane = lanes.firstOrNull { !it.last().end.isAfter(e.start) }
                if (lane != null) lane += e else lanes += mutableListOf(e)
            }
            var shown: List<List<Course>> = lanes
            var hidden: List<Course> = emptyList()
            if (lanes.size > MAX_LANES) {
                shown = lanes.take(MAX_LANES - 1)
                hidden = lanes.drop(MAX_LANES - 1).flatten()
            }
            val placed = shown.map { lane ->
                var c = 0f
                lane.map { e ->
                    val t = maxOf(y(e.start) - top, c)
                    val eh = minOf(maxOf(minH, y(e.end) - top - t), h - t)
                    c = t + maxOf(eh, 0f)
                    Placed(e, t, eh)
                }.filter { it.h > 0 }
            }
            out += Group(top, h, placed, hidden)
            cursor = top + h
        }
        return out
    }
}
