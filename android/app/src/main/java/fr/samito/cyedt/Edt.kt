package fr.samito.cyedt

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.Worker
import androidx.work.WorkerParameters
import fr.samito.cyedt.core.Celcat
import fr.samito.cyedt.core.CelcatHttp
import fr.samito.cyedt.core.Course
import fr.samito.cyedt.core.FetchResult
import fr.samito.cyedt.core.Parser
import fr.samito.cyedt.core.Schedule
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.concurrent.TimeUnit

/** Point d'entrée commun : app, widgets, tâche de fond, alarmes. */
object Edt {
    fun celcat(ctx: Context): Celcat {
        val store = AndroidStore(ctx)
        return Celcat(store, AndroidCreds(ctx), CelcatHttp(store))
    }

    fun courses(ctx: Context, r: FetchResult): List<Course> = Parser.parseAll(r.data, Settings(ctx).parsePrefs())

    fun now(): LocalDateTime = LocalDateTime.now()
    fun epoch(d: LocalDateTime) = d.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()

    /** Réseau (si nécessaire) + notifications + widgets. À appeler hors du thread principal. */
    fun refresh(ctx: Context, force: Boolean): FetchResult {
        val app = ctx.applicationContext
        val r = celcat(app).getEvents(force)
        if (r.fetched) {
            val courses = courses(app, r)
            // Réponse vide alors qu'il y avait des cours : sûrement un raté du serveur
            val suspicious = r.data.length() == 0 && (r.prev?.length() ?: 0) >= 4
            if (!suspicious) {
                if (Settings(app).notifyChanges && r.prev != null && r.prev.length() > 0) {
                    try {
                        val prev = Parser.parseAll(r.prev, Settings(app).parsePrefs())
                        fun dt(ms: Long?) = ms?.takeIf { it > 0 }?.let {
                            LocalDateTime.ofInstant(java.time.Instant.ofEpochMilli(it), ZoneId.systemDefault()) }
                        Notifs.changes(app, Schedule.diff(prev, courses, now(), dt(r.prevUntil), dt(r.until)))
                    } catch (e: Exception) {}
                }
                try { Notifs.reminders(app, courses) } catch (e: Exception) {}
            }
        }
        Widgets.updateAll(app)
        return r
    }

    /** Tâche périodique (toutes les 15 min, avec réseau). Android peut la décaler un peu. */
    fun schedule(ctx: Context) {
        val req = PeriodicWorkRequest.Builder(RefreshWorker::class.java, 15, TimeUnit.MINUTES)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork("refresh", ExistingPeriodicWorkPolicy.KEEP, req)
    }

    /** Rafraîchissement ponctuel en arrière-plan (ajout d'un widget, démarrage…) */
    fun refreshSoon(ctx: Context) {
        val req = OneTimeWorkRequest.Builder(RefreshWorker::class.java)
            .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .build()
        WorkManager.getInstance(ctx).enqueueUniqueWork("refresh-now", ExistingWorkPolicy.KEEP, req)
    }

    fun canExact(am: AlarmManager) = Build.VERSION.SDK_INT < 31 || am.canScheduleExactAlarms()

    /** Redessine les widgets au prochain début/fin de cours (sans réseau). */
    fun scheduleRedraw(ctx: Context, at: LocalDateTime) {
        val am = ctx.getSystemService(AlarmManager::class.java) ?: return
        val pi = PendingIntent.getBroadcast(ctx, 0, Intent(ctx, RedrawReceiver::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val t = epoch(at) + 1000
        if (canExact(am)) am.setExact(AlarmManager.RTC, t, pi)
        else am.setWindow(AlarmManager.RTC, t, 5 * 60000L, pi)
    }
}

class RefreshWorker(ctx: Context, params: WorkerParameters) : Worker(ctx, params) {
    override fun doWork(): Result {
        try { Edt.refresh(applicationContext, false) } catch (e: Exception) { Widgets.updateAll(applicationContext) }
        return Result.success()
    }
}

/** Alarme « début / fin de cours » : simple redessin à partir du cache. */
class RedrawReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) = Widgets.updateAll(ctx)
}

/** Redémarrage, mise à jour de l'app, changement d'heure : tout est reprogrammé. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        Edt.schedule(ctx)
        Widgets.updateAll(ctx)
        val pending = goAsync()
        Thread {
            try {
                val c = Edt.celcat(ctx)
                Notifs.reminders(ctx, Edt.courses(ctx, c.cached()), reset = true)
            } catch (e: Exception) {
            } finally { pending.finish() }
        }.start()
    }
}
