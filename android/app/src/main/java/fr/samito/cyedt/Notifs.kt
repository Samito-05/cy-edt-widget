package fr.samito.cyedt

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import fr.samito.cyedt.core.Course
import fr.samito.cyedt.core.Schedule
import org.json.JSONArray
import org.json.JSONObject

/** Notifications de changement et rappels avant chaque cours. */
object Notifs {
    private const val CH_CHANGES = "changes"
    private const val CH_REMIND = "reminders"
    private const val NOTIFIED = "celcat_notified.json"
    private const val REMINDERS = "celcat_reminders.json"
    private const val MAX_REMINDERS = 30

    fun channels(ctx: Context) {
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(NotificationChannel(CH_CHANGES, "Changements d'emploi du temps", NotificationManager.IMPORTANCE_DEFAULT)
            .apply { description = "Salle, horaire, annulation ou ajout de cours dans les 7 prochains jours" })
        nm.createNotificationChannel(NotificationChannel(CH_REMIND, "Rappels avant les cours", NotificationManager.IMPORTANCE_HIGH)
            .apply { description = "Quelques minutes avant chaque cours, avec la salle" })
    }

    private fun openApp(ctx: Context, req: Int) = PendingIntent.getActivity(ctx, req,
        Intent(ctx, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    fun post(ctx: Context, id: Int, channel: String, title: String, body: String) {
        channels(ctx)
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        val n = android.app.Notification.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_notif)
            .setContentTitle(title)
            .setContentText(body.lineSequence().first())
            .setStyle(android.app.Notification.BigTextStyle().bigText(body))
            .setContentIntent(openApp(ctx, id))
            .setAutoCancel(true)
            .build()
        try { nm.notify(id, n) } catch (e: SecurityException) {}   // notifications refusées
    }

    /** Une seule notification par changement, même si plusieurs rafraîchissements le voient. */
    fun changes(ctx: Context, changes: List<String>) {
        if (changes.isEmpty()) return
        val store = AndroidStore(ctx)
        val seen = try { JSONObject(store.read(NOTIFIED) ?: "{}") } catch (e: Exception) { JSONObject() }
        val now = System.currentTimeMillis()
        seen.keys().asSequence().toList().forEach { if (now - seen.optLong(it) > 7 * 86400000L) seen.remove(it) }
        val fresh = changes.filter { !seen.has(it) }
        if (fresh.isEmpty()) return
        fresh.forEach { seen.put(it, now) }
        store.write(NOTIFIED, seen.toString())
        post(ctx, 1, CH_CHANGES,
            if (fresh.size == 1) "Emploi du temps modifié" else "${fresh.size} changements dans ton emploi du temps",
            fresh.take(5).joinToString("\n") + if (fresh.size > 5) "\n…" else "")
    }

    private fun reminderIntent(ctx: Context, id: String) =
        Intent(ctx, ReminderReceiver::class.java).setData(Uri.parse("cyedt://rappel/" + Uri.encode(id)))

    /** Rappels des 5 prochains jours ; supprimés / remplacés si le cours change. */
    fun reminders(ctx: Context, courses: List<Course>, reset: Boolean = false) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val store = AndroidStore(ctx)
        val min = Settings(ctx).remindMin
        val now = System.currentTimeMillis()
        val horizon = now + 5 * 86400000L
        val wanted = LinkedHashMap<String, Pair<Course, Long>>()
        if (min > 0) {
            courses.filter { !it.cancelled && !it.allDay }
                .map { it to Edt.epoch(it.start) - min * 60000L }
                .filter { (_, at) -> at in (now + 1)..horizon }
                .sortedBy { it.second }
                .take(MAX_REMINDERS)
                // la salle fait partie de l'identifiant → un changement de salle remplace le rappel
                .forEach { (c, at) -> wanted["${c.key}|${Edt.epoch(c.start)}|${c.room}|$min"] = c to at }
        }
        val old = try { JSONArray(store.read(REMINDERS) ?: "[]") } catch (e: Exception) { JSONArray() }
        val ours = (0 until old.length()).map { old.getString(it) }
        for (id in ours) if (id !in wanted) {
            PendingIntent.getBroadcast(ctx, 0, reminderIntent(ctx, id), PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE)
                ?.let { am.cancel(it); it.cancel() }
        }
        for ((id, v) in wanted) {
            if (id in ours && !reset) continue
            val (c, at) = v
            val body = listOfNotNull(c.room.takeIf { it.isNotEmpty() }?.let { "📍 $it" }, c.category.ifEmpty { null },
                "${Schedule.hm(c.start)}–${Schedule.hm(c.end)}").joinToString(" · ")
            val i = reminderIntent(ctx, id).putExtra("title", "${c.module} dans $min min").putExtra("body", body)
            val pi = PendingIntent.getBroadcast(ctx, 0, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            if (Edt.canExact(am)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
        store.write(REMINDERS, JSONArray(wanted.keys.toList()).toString())
    }

    fun test(ctx: Context) = post(ctx, 3, CH_REMIND, "Test EDT CY", "Les notifications fonctionnent 👍")
}

class ReminderReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        val id = (intent.data?.toString() ?: "").hashCode()
        Notifs.post(ctx, id, "reminders", intent.getStringExtra("title") ?: "Cours bientôt", intent.getStringExtra("body") ?: "")
    }
}
