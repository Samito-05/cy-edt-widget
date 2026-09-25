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
import android.os.SystemClock
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import fr.samito.cyedt.core.Celcat
import fr.samito.cyedt.core.Course
import fr.samito.cyedt.core.FetchResult
import fr.samito.cyedt.core.Week
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
    /** Couleur résolue ici (pour dessiner une image) */
    fun resolve(res: Int) = (forced ?: ctx).getColor(res)
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
        day.forEach { update(app, mgr, it, courses, r, now) }
        next.forEach { mgr.updateAppWidget(it, nextViews(app, courses, r.stale, r.authBad, r.error, now)) }
        Edt.scheduleRedraw(app, Schedule.nextRedraw(courses, now, Settings(app).countdown))
    }

    /** Widget « EDT CY » : la vue choisie à sa création (jour, jour +N, semaine, prochain cours) */
    fun update(ctx: Context, mgr: AppWidgetManager, id: Int, courses: List<Course>, r: FetchResult, now: LocalDateTime) {
        val opts = mgr.getAppWidgetOptions(id)
        try {
            val v = when (val view = WidgetView.of(ctx, id)) {
                is WidgetView.Day -> dayViews(ctx, opts, courses, r.stale, r.authBad, r.error, now, view.offset)
                is WidgetView.WeekView -> weekViews(ctx, opts, courses, r.stale, r.authBad, r.error, now, view.offset, 2.75f)
                WidgetView.Next -> nextViews(ctx, courses, r.stale, r.authBad, r.error, now)
            }
            mgr.updateAppWidget(id, v)
        } catch (e: Exception) {
            // Image de la semaine trop lourde pour le lanceur : on la redessine plus petite
            if (WidgetView.of(ctx, id) is WidgetView.WeekView) try {
                mgr.updateAppWidget(id, weekViews(ctx, opts, courses, r.stale, r.authBad, r.error, now,
                    (WidgetView.of(ctx, id) as WidgetView.WeekView).offset, 1.5f))
            } catch (e2: Exception) {}
        }
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
                 error: String?, now: LocalDateTime, offset: Int = 0): RemoteViews {
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
        val small = w < 200                          // petit widget
        val live = small && offset == 0              // mode « live » : comme le petit widget iOS
        val avail = h - 24 - 26                      // marges + en-tête
        val fullH = 58; val compactH = 34
        val dayAll = Schedule.dayView(courses, now, 20, live = live, offset = offset)
        val nFull = maxOf(1, avail / fullH)
        val nCompact = maxOf(1, avail / compactH)
        val needed = dayAll.shown.size + dayAll.allDay.size.coerceAtMost(2)
        val mode = when { small -> "mini"; needed <= nFull -> "full"; else -> "compact" }
        val max = when (mode) { "mini" -> maxOf(1, avail / 46); "full" -> nFull; else -> nCompact } - dayAll.allDay.size.coerceAtMost(2)
        val day = Schedule.dayView(courses, now, maxOf(1, max), live = live, offset = offset)

        v.setTextViewText(R.id.title, day.label)
        val sub = when {
            live && day.label == "Aujourd'hui" -> "· à venir"
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
                v.addView(R.id.list, card(ctx, p, e, mode, now, first = i == 0 && live))
            }
        }
        return v
    }

    private fun card(ctx: Context, p: Paint, e: Course, mode: String, now: LocalDateTime, first: Boolean = false): RemoteViews {
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
            else -> {   // mini (petit widget)
                val inProgress = !e.cancelled && !e.start.isAfter(now)
                when {
                    e.cancelled -> line(c, p, R.id.line1, "Annulé · ${Schedule.hm(e.start)}", R.color.cancel)
                    inProgress -> line(c, p, R.id.line1, "En cours · fin ${Schedule.hm(e.end)} · ${e.room.ifEmpty { "—" }}", R.color.now)
                    else -> line(c, p, R.id.line1, listOf(time, e.room).filter { it.isNotEmpty() }.joinToString(" · "), subRes)
                }
                // 1er cours du mode live, moins d'1 h avant : compte à rebours (mis à jour par Android)
                if (first && Settings(ctx).countdown && Schedule.countdownFor(e, now)) countdown(c, p, e, now, R.color.sub)
            }
        }
        return c
    }

    /** Compte à rebours « dans 12:34 » jusqu'au début du cours */
    private fun countdown(v: RemoteViews, p: Paint, e: Course, now: LocalDateTime, color: Int) {
        val ms = Edt.epoch(e.start) - System.currentTimeMillis()
        v.setChronometer(R.id.countdown, SystemClock.elapsedRealtime() + ms, "dans %s", true)
        v.setChronometerCountDown(R.id.countdown, true)
        v.setViewVisibility(R.id.countdown, View.VISIBLE)
        p.text(v, R.id.countdown, color)
    }

    private fun line(v: RemoteViews, p: Paint, id: Int, s: String, color: Int) {
        v.setTextViewText(id, s)
        v.setViewVisibility(id, if (s.isEmpty()) View.GONE else View.VISIBLE)
        p.text(v, id, color)
    }

    // ---------- semaine ----------
    fun weekViews(ctx: Context, opts: Bundle?, courses: List<Course>, stale: Boolean, authBad: Boolean,
                  error: String?, now: LocalDateTime, offset: Int, maxScale: Float): RemoteViews {
        val p = Paint(ctx, Settings(ctx).theme)
        val v = RemoteViews(ctx.packageName, R.layout.widget_week)
        v.setOnClickPendingIntent(R.id.root, openApp(ctx))
        p.tint(v, R.id.bg, R.color.bg)
        p.text(v, R.id.title, R.color.text)
        p.text(v, R.id.badge, R.color.muted)
        p.text(v, R.id.empty, R.color.muted)

        val m = Week.model(courses, now, offset, now.toLocalDate().plusDays(Celcat.DAYS_AHEAD))
        v.setTextViewText(R.id.title, "Semaine du " + Schedule.fmt(m.monday.atStartOfDay(), "d MMM"))
        if (!badge(v, p, stale, authBad)) {
            v.setTextViewText(R.id.badge, "${m.courses.count { !it.cancelled }} cours")
            v.setViewVisibility(R.id.badge, View.VISIBLE)
        }
        if (m.courses.isEmpty()) {
            v.setViewVisibility(R.id.grid, View.GONE)
            v.setViewVisibility(R.id.empty, View.VISIBLE)
            v.setTextViewText(R.id.empty, when {
                error != null && courses.isEmpty() -> "⚠️ $error"
                // Au-delà des jours téléchargés : on ne sait pas, ce n'est pas « pas de cours »
                m.beyond -> "Semaine hors période : seuls les ${Celcat.DAYS_AHEAD} prochains jours sont téléchargés."
                else -> "Pas de cours cette semaine 🎉"
            })
            return v
        }
        v.setViewVisibility(R.id.empty, View.GONE)
        v.setViewVisibility(R.id.grid, View.VISIBLE)

        val w = (opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH)?.takeIf { it > 0 } ?: 320).toFloat()
        val h = (opts?.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)?.takeIf { it > 0 } ?: 320).toFloat()
        val gw = w - 24; val gh = h - 24 - 20 - 6               // marges, en-tête
        val scale = minOf(ctx.resources.displayMetrics.density, maxScale)
        v.setImageViewBitmap(R.id.grid, WeekRenderer(p::resolve, scale).render(m, now, gw, maxOf(gh, 80f)))
        return v
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
        val soon = Settings(ctx).countdown && today && Schedule.countdownFor(e, now)
        if (soon) countdown(v, p, e, now, R.color.sub)
        v.setTextViewText(R.id.time, when {
            inProgress -> "En cours · fin ${Schedule.hm(e.end)}"
            soon -> "${Schedule.hm(e.start)} ·"
            today -> "${Schedule.hm(e.start)} – ${Schedule.hm(e.end)}"
            else -> "${Schedule.dayLabel(e.start.toLocalDate(), now.toLocalDate()).split(" ")[0]} · ${Schedule.hm(e.start)}"
        })
        v.setTextViewTextSize(R.id.room, TypedValue.COMPLEX_UNIT_SP, if (e.room.length > 12) 20f else 26f)
        return v
    }
}

/** Widget « EDT CY » : jour, jours suivants, semaine ou prochain cours (choisi à l'ajout). */
class DayWidget : AppWidgetProvider() {
    override fun onUpdate(ctx: Context, mgr: AppWidgetManager, ids: IntArray) = refresh(ctx)
    override fun onAppWidgetOptionsChanged(ctx: Context, mgr: AppWidgetManager, id: Int, opts: Bundle) = Widgets.updateAll(ctx)
    override fun onEnabled(ctx: Context) = Edt.schedule(ctx)
    override fun onDeleted(ctx: Context, ids: IntArray) = ids.forEach { WidgetView.remove(ctx, it) }
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
