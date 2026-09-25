package fr.samito.cyedt

import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint as GPaint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import fr.samito.cyedt.core.Course
import fr.samito.cyedt.core.Schedule
import fr.samito.cyedt.core.Week
import java.time.LocalDateTime
import kotlin.math.roundToInt

/**
 * Grille de la vue semaine, dessinée dans une image : les widgets Android ne savent pas
 * placer des blocs à une position arbitraire. Même mise en page que la version iOS :
 * ligne des jours, axe des heures, cours côte à côte s'ils se chevauchent (2 max, puis
 * « +N »), colonne du jour teintée, trait rouge sur l'heure actuelle.
 */
class WeekRenderer(private val color: (Int) -> Int, private val s: Float) {
    private fun dp(v: Float) = v * s
    private val bg = color(R.color.bg)
    private val text = color(R.color.text)
    private val sub = color(R.color.sub)
    private val muted = color(R.color.muted)
    private val now = color(R.color.now)
    private val nowBg = color(R.color.now_bg)
    private val cancel = color(R.color.cancel)
    private val nowLine = color(R.color.bad)

    private val fill = GPaint(GPaint.ANTI_ALIAS_FLAG).apply { style = GPaint.Style.FILL }
    private val stroke = GPaint(GPaint.ANTI_ALIAS_FLAG).apply { style = GPaint.Style.STROKE }
    private val regular = Typeface.create("sans-serif", Typeface.NORMAL)
    private val medium = Typeface.create("sans-serif-medium", Typeface.NORMAL)

    private fun tp(size: Float, c: Int, bold: Boolean = false, alpha: Float = 1f) = TextPaint(GPaint.ANTI_ALIAS_FLAG).apply {
        textSize = dp(size); typeface = if (bold) medium else regular; this.color = withAlpha(c, alpha)
    }

    private fun withAlpha(c: Int, a: Float) = (c and 0x00FFFFFF) or ((((c ushr 24) and 0xFF) * a).roundToInt() shl 24)

    private fun Canvas.label(s: String, x: Float, y: Float, w: Float, p: TextPaint, center: Boolean = false) {
        val t = TextUtils.ellipsize(s, p, w, TextUtils.TruncateAt.END).toString()
        val tx = if (center) x + (w - p.measureText(t)) / 2 else x
        drawText(t, tx, y - p.ascent(), p)
    }

    /** Texte sur [maxLines] lignes au plus, coupé proprement */
    private fun Canvas.block(s: String, x: Float, y: Float, w: Float, p: TextPaint, maxLines: Int): Float {
        if (w <= 0) return 0f
        val l = StaticLayout.Builder.obtain(s, 0, s.length, p, w.toInt().coerceAtLeast(1))
            .setAlignment(Layout.Alignment.ALIGN_NORMAL).setIncludePad(false)
            .setMaxLines(maxLines).setEllipsize(TextUtils.TruncateAt.END).build()
        save(); translate(x, y); l.draw(this); restore()
        return l.height.toFloat()
    }

    /** [wDp] × [hDp] : taille de la zone (ligne des jours + grille) en dp. */
    fun render(m: Week.Model, nowDt: LocalDateTime, wDp: Float, hDp: Float): Bitmap {
        val W = dp(wDp); val H = dp(hDp)
        val bmp = Bitmap.createBitmap(W.roundToInt().coerceAtLeast(1), H.roundToInt().coerceAtLeast(1), Bitmap.Config.RGB_565)
        val c = Canvas(bmp)
        c.drawColor(bg)

        val dayH = dp(16f); val axisW = dp(18f); val gap = dp(3f)
        val gridTop = dayH + dp(4f)
        val gridH = H - gridTop
        val n = m.days.size
        val colW = (W - axisW - n * gap) / n
        val scale = gridH / (m.endMin - m.startMin)
        val today = nowDt.toLocalDate()
        fun colX(i: Int) = axisW + gap + i * (colW + gap)

        // Ligne des jours
        m.days.forEachIndexed { i, d ->
            val x = colX(i)
            val off = m.allDay[d]
            val r = RectF(x, 0f, x + colW, dayH)
            val p: TextPaint
            when {
                d == today -> { fill.color = text; c.drawRoundRect(r, dp(4f), dp(4f), fill); p = tp(9.5f, bg, bold = true) }
                off != null -> { fill.color = withAlpha(off.color, 0.16f); c.drawRoundRect(r, dp(4f), dp(4f), fill); p = tp(9.5f, off.color, bold = true) }
                else -> p = tp(9.5f, if (d < today) muted else sub)
            }
            val lbl = Schedule.cap(d.format(java.time.format.DateTimeFormatter.ofPattern("EEE", java.util.Locale.FRENCH)).replace(".", "")) + " ${d.dayOfMonth}"
            c.label(lbl, x, (dayH - (p.descent() - p.ascent())) / 2, colW, p, center = true)
        }

        // Axe des heures
        val hp = tp(8f, muted)
        var mm = m.startMin
        while (mm < m.endMin) {
            c.label("${mm / 60}h", 0f, gridTop + (mm - m.startMin) * scale, axisW, hp)
            mm += 60
        }

        fun y(t: LocalDateTime) = (t.hour * 60 + t.minute - m.startMin) * scale

        m.days.forEachIndexed { i, d ->
            val x = colX(i)
            if (d == today) {
                fill.color = withAlpha(text, 0.05f)
                c.drawRoundRect(RectF(x, gridTop, x + colW, gridTop + gridH), dp(5f), dp(5f), fill)
            }
            val dayCourses = m.courses.filter { it.start.toLocalDate() == d }
            val covered = mutableListOf<ClosedFloatingPointRange<Float>>()
            // Cours qui finit après minuit : coupé en bas de la grille
            val toY = { t: LocalDateTime -> if (t.toLocalDate() != d) gridH else y(t) }
            for (g in Week.layoutDay(dayCourses, toY, gridH, dp(10f))) {
                covered += g.top..(g.top + g.h)
                val lanes = g.lanes.size
                val moreW = if (g.hidden.isNotEmpty()) dp(16f) + dp(2f) else 0f
                val laneW = (colW - moreW - (lanes - 1) * dp(2f)) / lanes
                g.lanes.forEachIndexed { k, lane ->
                    val lx = x + k * (laneW + dp(2f))
                    lane.forEach { p -> drawBlock(c, p.course, lx, gridTop + g.top + p.y, laneW, p.h, nowDt) }
                }
                if (g.hidden.isNotEmpty()) {
                    val first = g.hidden.first()
                    val done = g.hidden.all { !it.end.isAfter(nowDt) || it.cancelled }
                    val r = RectF(x + colW - dp(16f), gridTop + g.top, x + colW, gridTop + g.top + g.h)
                    fill.color = withAlpha(first.color, if (done) 0.08f else 0.2f)
                    stroke.color = withAlpha(first.color, if (done) 0.3f else 0.9f); stroke.strokeWidth = dp(1f)
                    c.drawRoundRect(r, dp(5f), dp(5f), fill)
                    c.drawRoundRect(inset(r, dp(0.5f)), dp(5f), dp(5f), stroke)
                    val p = tp(8.5f, text, bold = true, alpha = if (done) 0.4f else 1f)
                    c.label("+${g.hidden.size}", r.left, r.centerY() - (p.descent() - p.ascent()) / 2, r.width(), p, center = true)
                }
            }
            // Trait « maintenant » : seulement dans un trou de l'emploi du temps
            // (pendant un cours, la carte verte dit déjà où on en est)
            val nowMin = nowDt.hour * 60 + nowDt.minute
            if (d == today && nowMin >= m.startMin && nowMin < m.endMin) {
                val ny = (nowMin - m.startMin) * scale
                if (covered.none { ny in it }) {
                    fill.color = nowLine
                    c.drawRoundRect(RectF(x, gridTop + ny - dp(0.75f), x + colW, gridTop + ny + dp(0.75f)), dp(0.75f), dp(0.75f), fill)
                }
            }
        }
        return bmp
    }

    private fun inset(r: RectF, d: Float) = RectF(r.left + d, r.top + d, r.right - d, r.bottom - d)

    private fun drawBlock(c: Canvas, e: Course, x: Float, y: Float, w: Float, h: Float, nowDt: LocalDateTime) {
        val done = !e.end.isAfter(nowDt) || e.cancelled
        val live = !e.cancelled && !e.start.isAfter(nowDt) && e.end.isAfter(nowDt)
        val op = if (done) 0.4f else 1f
        val r = RectF(x, y, x + w, y + h)
        fill.color = if (live) nowBg else withAlpha(e.color, if (done) 0.08f else 0.2f)
        c.drawRoundRect(r, dp(5f), dp(5f), fill)
        stroke.color = if (live) now else withAlpha(e.color, if (done) 0.3f else 0.9f)
        stroke.strokeWidth = dp(if (live) 1.5f else 1f)
        c.drawRoundRect(inset(r, stroke.strokeWidth / 2), dp(5f), dp(5f), stroke)

        c.save()
        c.clipRect(r)
        val tx = x + dp(3f); val tw = w - dp(5f)
        val th = c.block(e.module, tx, y + dp(2f), tw, tp(8.5f, if (live) now else text, bold = true, alpha = op), if (h >= dp(30f)) 2 else 1)
        if (h >= dp(24f) && (e.room.isNotEmpty() || e.cancelled)) {
            val p = if (e.cancelled) tp(7.5f, cancel, bold = true) else tp(7.5f, sub, alpha = op)
            c.label(if (e.cancelled) "Annulé" else e.room, tx, y + dp(2f) + th, tw, p)
        }
        c.restore()
    }
}
