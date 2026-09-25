package fr.samito.cyedt

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import fr.samito.cyedt.core.Celcat
import fr.samito.cyedt.core.Course
import fr.samito.cyedt.core.Schedule
import java.time.LocalDateTime

/**
 * Couleurs du widget. En thème automatique (Android 12+), les couleurs sont passées en
 * ressources : c'est le lanceur qui les résout, donc le widget suit le mode sombre
 * instantanément. Thème forcé : couleurs résolues ici, clair ou sombre.
 */
class Paint(private val ctx: Context, theme: String) {
    private val forced: Context? = when (theme) {
        "light", "dark" -> {
            val cfg = Configuration(ctx.resources.configuration)
            cfg.uiMode = (cfg.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
                (if (theme == "dark") Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO)
            ctx.createConfigurationContext(cfg)
        }
        else -> null
    }

    private fun apply(v: RemoteViews, id: Int, method: String, res: Int) {
        when {
            forced != null -> v.setInt(id, method, forced.getColor(res))
            Build.VERSION.SDK_INT >= 31 -> v.setColor(id, method, res)
            else -> v.setInt(id, method, ctx.getColor(res))
        }
    }

    fun text(v: RemoteViews, id: Int, res: Int) = apply(v, id, "setTextColor", res)
    fun tint(v: RemoteViews, id: Int, res: Int) = apply(v, id, "setColorFilter", res)
}

private fun withAlpha(color: Int, a: Float) = (color and 0x00FFFFFF) or ((a * 255).toInt() shl 24)

object Widgets {
    fun updateAll(ctx: Context) {
        val app = ctx.applicationContext
        val mgr = AppWidgetManager.getInstance(app)
        val day = mgr.getAppWidgetIds(ComponentName(app, DayWidget::class.java))
        val next = mgr.getAppWidgetIds(ComponentName(app, NextWidget::class.java))
        if (day.isEmpty() && next.isEmpty()) return
        val r = Edt.celcat(app).cached()
        val courses = Edt.courses(app, r)
        val now = Edt.now()
        day.forEach { mgr.updateAppWidget(it, dayViews(app, mgr.getAppWidgetOptions(it), courses, r.stale, r.authBad, r.error, now)) }
        next.forEach { mgr.updateAppWidget(it, nextViews(app, courses, r.stale, r.authBad, r.error, now)) }
        Edt.scheduleRedraw(app, Schedule.nextRedraw(courses, now))
    }

    private fun openApp(ctx: Context) = PendingIntent.getActivity(ctx, 100,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun badge(v: RemoteViews, p: Paint, stale: Boolean, authBad: Boolean): Boolean {
        if (!stale) return false
        v.setTextViewText(R.id.badge, if (authBad) "identifiants ✗" else "hors ligne")
        p.text(v, R.id.badge, if (authBad) R.color.bad else R.color.cancel)
        v.setViewVisibility(R.id.badge, View.VISIBLE)
        return true
    }

    // ---------- vue du jour ----------
    fun dayViews(ctx: Context, opts: Bundle?, courses: List<Course>, stale: Boolean, authBad: Boolean,
                 error: String?, now: LocalDateTime): RemoteViews {
        val p = Paint(ctx, Settings(ctx).theme)
        val v = RemoteViews(ctx.packageName, R.layout.widget_day)
        v.setOnClickPendingIntent(R.id.root, openApp(ctx))
        p.tint(v, R.id.bg, R.color.bg)
        p.text(v, R.id.title, R.color.text)
        p.text(v, R.id.subtitle, R.color.muted)
        p.text(v, R.id.badge, R.color.muted)
        p.text(v, R.id.empty, R.color.muted)

        // Taille du widget (portrait : largeur mini, hauteur maxi)
        val w = opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)?.takeIf { it > 0 } ?: 250
        val h = opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)?.takeIf { it > 0 } ?: 250
        val small = w < 200                          // petit widget : mode « live », comme sur iOS
        val avail = h - 24 - 26                      // marges + en-tête
        val fullH = 58; val compactH = 34
        val dayAll = Schedule.dayView(courses, now, 20, live = small)
        val nFull = maxOf(1, avail / fullH)
        val nCompact = maxOf(1, avail / compactH)
        val needed = dayAll.shown.size + dayAll.allDay.size.coerceAtMost(2)
        val mode = when { small -> "mini"; needed <= nFull -> "full"; else -> "compact" }
        val max = when (mode) { "mini" -> maxOf(1, avail / 46); "full" -> nFull; else -> nCompact } - dayAll.allDay.size.coerceAtMost(2)
        val day = Schedule.dayView(courses, now, maxOf(1, max), live = small)

        v.setTextViewText(R.id.title, day.label)
        val sub = when {
            small && day.label == "Aujourd'hui" -> "· à venir"
            !small && (day.label == "Aujourd'hui" || day.label == "Demain") && day.day != null ->
                Schedule.fmt(day.day.atStartOfDay(), "EEE d MMM")
            else -> ""
        }
        v.setTextViewText(R.id.subtitle, sub)
        if (!badge(v, p, stale, authBad) && !small && day.count > 0) {
            v.setTextViewText(R.id.badge, "${day.count} cours")
            v.setViewVisibility(R.id.badge, View.VISIBLE)
        } else if (!stale) v.setViewVisibility(R.id.badge, View.GONE)

        v.removeAllViews(R.id.list)
        day.allDay.take(2).forEach { e ->
            val b = RemoteViews(ctx.packageName, R.layout.item_banner)
            b.setInt(R.id.banner_bg, "setColorFilter", withAlpha(e.color, 0.18f))
            b.setTextViewText(R.id.banner_text, e.title)
            p.text(b, R.id.banner_text, R.color.text)
            v.addView(R.id.list, b)
        }
        if (day.shown.isEmpty()) {
            v.setTextViewText(R.id.empty, when {
                error != null && courses.isEmpty() -> "⚠️ $error"
                day.day != null -> "Pas de cours 🎉"
                else -> "Pas d'autres cours prévus"
            })
            v.setViewVisibility(R.id.empty, View.VISIBLE)
        } else {
            v.setViewVisibility(R.id.empty, View.GONE)
            day.shown.forEachIndexed { i, e ->
                // Pause déjeuner : un espace plus grand entre le matin et l'après-midi
                if (i > 0 && mode == "full") {
                    val prev = day.shown[i - 1]
                    val gap = java.time.Duration.between(prev.end, e.start).toMinutes()
                    if (gap >= 45 && prev.end.hour in 11..13 && avail > (day.shown.size * fullH + 20))
                        v.addView(R.id.list, RemoteViews(ctx.packageName, R.layout.item_gap))
                }
                v.addView(R.id.list, card(ctx, p, e, mode, now))
            }
        }
        return v
    }

    private fun card(ctx: Context, p: Paint, e: Course, mode: String, now: LocalDateTime): RemoteViews {
        val layout = when (mode) { "full" -> R.layout.item_card; "compact" -> R.layout.item_row; else -> R.layout.item_mini }
        val c = RemoteViews(ctx.packageName, layout)
        val done = !e.end.isAfter(now) || e.cancelled
        val live = !e.cancelled && !e.start.isAfter(now) && e.end.isAfter(now)

        p.tint(c, R.id.card_bg, if (live) R.color.now_bg else R.color.card)
        if (live) p.tint(c, R.id.card_border, R.color.now)
        else c.setInt(R.id.card_border, "setColorFilter", withAlpha(e.color, if (done) 0.35f else 1f))
        c.setInt(R.id.bar, "setColorFilter", withAlpha(e.color, if (done) 0.35f else 1f))

        val titleRes = if (live) R.color.now else if (done) R.color.text_dim else R.color.text
        val subRes = if (done) R.color.sub_dim else R.color.sub
        c.setTextViewText(R.id.title, e.title)
        p.text(c, R.id.title, titleRes)

        val time = "${Schedule.hm(e.start)}–${Schedule.hm(e.end)}"
        when (mode) {
            "full" -> {
                c.setTextViewText(R.id.start, Schedule.hm(e.start))
                c.setTextViewText(R.id.end, Schedule.hm(e.end))
                p.text(c, R.id.start, if (done) R.color.text_dim else R.color.text)
                p.text(c, R.id.end, if (done) R.color.text_dim else R.color.text)
                if (e.cancelled) {
                    line(c, p, R.id.line1, "Annulé", R.color.cancel)
                    line(c, p, R.id.line2, "", subRes)
                } else {
                    line(c, p, R.id.line1, e.staff, subRes)
                    line(c, p, R.id.line2, e.room, subRes)
                }
            }
            "compact" -> {
                c.setTextViewText(R.id.start, Schedule.hm(e.start))
                p.text(c, R.id.start, if (done) R.color.text_dim else R.color.text)
                if (e.cancelled) line(c, p, R.id.line1, "Annulé", R.color.cancel)
                else line(c, p, R.id.line1, e.room, subRes)
            }
            else -> {   // mini (petit widget, mode live)
                val first = !e.cancelled && !e.start.isAfter(now)
                when {
                    e.cancelled -> line(c, p, R.id.line1, "Annulé · ${Schedule.hm(e.start)}", R.color.cancel)
                    first -> line(c, p, R.id.line1, "En cours · fin ${Schedule.hm(e.end)} · ${e.room.ifEmpty { "—" }}", R.color.now)
                    else -> line(c, p, R.id.line1, listOf(time, e.room).filter { it.isNotEmpty() }.joinToString(" · "), subRes)
                }
            }
        }
        return c
    }

    private fun line(v: RemoteViews, p: Paint, id: Int, s: String, color: Int) {
        v.setTextViewText(id, s)
        v.setViewVisibility(id, if (s.isEmpty()) View.GONE else View.VISIBLE)
        p.text(v, id, color)
    }

    // ---------- prochain cours ----------
    fun nextViews(ctx: Context, courses: List<Course>, stale: Boolean, authBad: Boolean, error: String?, now: LocalDateTime): RemoteViews {
        val p = Paint(ctx, Settings(ctx).theme)
        val v = RemoteViews(ctx.packageName, R.layout.widget_next)
        v.setOnClickPendingIntent(R.id.root, openApp(ctx))
        val e = Schedule.nextClass(courses, now)
        val inProgress = e != null && !e.start.isAfter(now)
        p.tint(v, R.id.bg, if (inProgress) R.color.now_bg else R.color.bg)
        p.text(v, R.id.status, if (inProgress) R.color.now else R.color.muted)
        p.text(v, R.id.module, R.color.text)
        p.text(v, R.id.room, if (inProgress) R.color.now else R.color.text)
        p.text(v, R.id.time, if (inProgress) R.color.now else R.color.sub)
        if (!badge(v, p, stale, authBad)) v.setViewVisibility(R.id.badge, View.GONE)

        if (e == null) {
            v.setViewVisibility(R.id.pill, View.GONE)
            v.setTextViewText(R.id.status, "Prochain cours")
            v.setTextViewText(R.id.module, if (error != null && courses.isEmpty()) "⚠️ $error" else "Pas de cours prévu")
            p.text(v, R.id.module, R.color.muted)
            v.setTextViewText(R.id.room, "")
            v.setTextViewText(R.id.time, "")
            return v
        }
        if (e.category.isNotEmpty()) {
            v.setViewVisibility(R.id.pill, View.VISIBLE)
            v.setInt(R.id.pill_bg, "setColorFilter", e.color)
            v.setTextViewText(R.id.pill_text, e.category)
        } else v.setViewVisibility(R.id.pill, View.GONE)
        v.setTextViewText(R.id.status, if (inProgress) "En cours" else "Prochain cours")
        v.setTextViewText(R.id.module, e.module)
        v.setTextViewText(R.id.room, e.room.ifEmpty { "Salle ?" })
        val today = e.start.toLocalDate() == now.toLocalDate()
        v.setTextViewText(R.id.time, when {
            inProgress -> "En cours · fin ${Schedule.hm(e.end)}"
            today -> "${Schedule.hm(e.start)} – ${Schedule.hm(e.end)}"
            else -> "${Schedule.dayLabel(e.start.toLocalDate(), now.toLocalDate()).split(" ")[0]} · ${Schedule.hm(e.start)}"
        })
        v.setTextViewTextSize(R.id.room, TypedValue.COMPLEX_UNIT_SP, if (e.room.length > 12) 20f else 26f)
        return v
    }
}

/** Grand / moyen widget : cours du jour (ou du prochain jour de cours). */
class DayWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) = refresh(ctx)
    override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, opts: Bundle) = Widgets.updateAll(ctx)
    override fun onEnabled(ctx: Context) = Edt.schedule(ctx)
}

/** Petit widget : seulement le prochain cours et sa salle. */
class NextWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) = refresh(ctx)
    override fun onEnabled(ctx: Context) = Edt.schedule(ctx)
}

private fun refresh(ctx: Context) {
    Widgets.updateAll(ctx)
    // Données trop anciennes : un téléchargement en arrière-plan (jamais bloquant ici)
    val at = Edt.celcat(ctx).cached().at ?: 0
    if (System.currentTimeMillis() - at > Celcat.FETCH_MIN * 60000) Edt.refreshSoon(ctx)
}
