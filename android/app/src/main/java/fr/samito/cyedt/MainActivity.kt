package fr.samito.cyedt

import android.Manifest
import android.app.Activity
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.graphics.Paint
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings as SysSettings
import android.text.format.DateUtils
import android.view.View
import android.view.animation.LinearInterpolator
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.CompoundButton
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import fr.samito.cyedt.core.BASE
import fr.samito.cyedt.core.Course
import fr.samito.cyedt.core.FetchResult
import fr.samito.cyedt.core.Parser
import fr.samito.cyedt.core.Schedule
import java.time.Duration
import java.time.LocalDateTime
import java.util.concurrent.Executors

/**
 * Écran de l'app : identifiants, état, aperçu des cours et réglages.
 * L'ouvrir force la mise à jour (comme lancer le script dans Scriptable).
 */
class MainActivity : Activity() {
    private val bg = Executors.newSingleThreadExecutor()
    private lateinit var creds: AndroidCreds
    private lateinit var settings: Settings
    private var courses: List<Course> = emptyList()

    private val themes = listOf("auto" to "Automatique", "light" to "Clair", "dark" to "Sombre")
    private val reminds = listOf(0, 5, 10, 15, 30)

    private fun <T : View> v(id: Int): T = findViewById(id)

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        setContentView(R.layout.activity_main)
        creds = AndroidCreds(this)
        settings = Settings(this)
        Notifs.channels(this)
        Edt.schedule(this)

        v<TextView>(R.id.version).text = "EDT CY ${BuildConfig.VERSION_NAME}\nProjet non officiel, sans lien avec CY Tech / CYU"
        v<EditText>(R.id.user).setText(creds.user ?: "")
        v<EditText>(R.id.fid).setText(creds.fid)
        if (creds.hasPassword) v<EditText>(R.id.pass).hint = "Mot de passe (vide = inchangé)"

        v<Spinner>(R.id.theme).adapter = adapter(themes.map { it.second })
        v<Spinner>(R.id.theme).setSelection(themes.indexOfFirst { it.first == settings.theme }.coerceAtLeast(0))
        v<Spinner>(R.id.remind).adapter = adapter(reminds.map { if (it == 0) "Pas de rappel" else "$it min avant" })
        v<Spinner>(R.id.remind).setSelection(reminds.indexOf(settings.remindMin).coerceAtLeast(0))
        v<CompoundButton>(R.id.notify).isChecked = settings.notifyChanges
        v<CompoundButton>(R.id.countdown).isChecked = settings.countdown
        v<EditText>(R.id.hide).setText(settings.hideText)
        v<EditText>(R.id.rename).setText(settings.renameText)

        v<View>(R.id.save).setOnClickListener { saveCreds() }
        v<View>(R.id.refresh).setOnClickListener { load(force = true) }
        v<View>(R.id.unlock).setOnClickListener {
            Edt.celcat(this).clearAuthLock()
            load(force = true)
        }
        v<View>(R.id.open_celcat).setOnClickListener {
            val fid = creds.fid
            open(if (fid.isEmpty()) BASE else "$BASE/cal?vt=agendaWeek&et=student&fid0=$fid")
        }
        v<View>(R.id.copy_next).setOnClickListener {
            val txt = Schedule.nextText(courses, Edt.now())
            getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Prochain cours", txt))
            Toast.makeText(this, txt, Toast.LENGTH_LONG).show()
        }
        v<View>(R.id.save_settings).setOnClickListener { saveSettings() }
        v<View>(R.id.test_notif).setOnClickListener { askNotifications(); Notifs.test(this) }
        v<View>(R.id.battery).setOnClickListener { askBattery() }
        v<View>(R.id.repo).setOnClickListener { open("https://github.com/Samito-05/cy-edt-widget/releases") }
        v<View>(R.id.add_day).setOnClickListener { pin(DayWidget::class.java) }
        v<View>(R.id.add_week).setOnClickListener { pin(WeekWidget::class.java) }
        v<View>(R.id.add_next).setOnClickListener { pin(NextWidget::class.java) }
    }

    override fun onResume() {
        super.onResume()
        // Ouvrir l'app force le téléchargement, sauf s'il date de moins de 2 min
        val at = Edt.celcat(this).cached().at ?: 0
        load(force = System.currentTimeMillis() - at > 2 * 60000)
        v<View>(R.id.battery).visibility =
            if (getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true) View.GONE else View.VISIBLE
        showWidgets()
    }

    /** Section « Widgets » : chaque widget posé, avec sa vue modifiable ici (sans passer par le lanceur) */
    private fun showWidgets() {
        val ids = Widgets.viewIds(this)
        val next = AppWidgetManager.getInstance(this).getAppWidgetIds(ComponentName(this, NextWidget::class.java)).size
        v<TextView>(R.id.widgets_hint).text = when {
            ids.isEmpty() && next == 0 -> "Aucun widget sur l'écran d'accueil. Ajoute-en un ci-dessous, ou appui long sur l'écran d'accueil → Widgets → EDT CY."
            else -> "Même choix que le paramètre du widget iOS : jour actuel, jours de cours suivants, semaine, prochain cours." +
                if (next > 0) "\n+ $next widget${if (next > 1) "s" else ""} « Prochain cours CY »." else ""
        }
        val list = v<LinearLayout>(R.id.widgets_list)
        list.removeAllViews()
        val options = WidgetView.OPTIONS
        ids.forEachIndexed { i, id ->
            val row = layoutInflater.inflate(R.layout.app_widget_row, list, false)
            row.findViewById<TextView>(R.id.w_label).text = "Widget ${i + 1}"
            val sp = row.findViewById<Spinner>(R.id.w_view)
            sp.adapter = adapter(options.map { it.second })
            val current = options.indexOfFirst { it.first == WidgetView.of(this, id) }.coerceAtLeast(0)
            sp.setSelection(current, false)
            sp.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
                override fun onItemSelected(p: AdapterView<*>?, view: View?, pos: Int, rowId: Long) {
                    if (options[pos].first == WidgetView.of(this@MainActivity, id)) return
                    WidgetView.set(this@MainActivity, id, options[pos].first)
                    Widgets.updateAll(this@MainActivity)
                    Toast.makeText(this@MainActivity, "Widget ${i + 1} : ${options[pos].second}", Toast.LENGTH_SHORT).show()
                }
                override fun onNothingSelected(p: AdapterView<*>?) {}
            }
            list.addView(row)
        }
    }

    /** Propose au lanceur d'ajouter un widget (Samsung : fenêtre « Ajouter à l'écran d'accueil ») */
    private fun pin(cls: Class<out AppWidgetProvider>) {
        val mgr = AppWidgetManager.getInstance(this)
        if (!mgr.isRequestPinAppWidgetSupported || !mgr.requestPinAppWidget(ComponentName(this, cls), null, null))
            Toast.makeText(this, "Appui long sur l'écran d'accueil → Widgets → EDT CY", Toast.LENGTH_LONG).show()
    }

    override fun onDestroy() { bg.shutdown(); super.onDestroy() }

    private fun adapter(items: List<String>) =
        ArrayAdapter(this, android.R.layout.simple_spinner_item, items).apply {
            setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)
        }

    /** Icône « Actualiser » qui tourne pendant le téléchargement */
    private fun spin(on: Boolean) {
        val b = v<View>(R.id.refresh)
        b.animate().cancel()
        if (on) b.animate().rotationBy(360f * 40).setDuration(40_000).setInterpolator(LinearInterpolator()).start()
        else b.rotation = 0f
        b.isEnabled = !on
    }

    private fun open(url: String) = try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: Exception) {}

    private fun load(force: Boolean) {
        show(Edt.celcat(this).cached())
        if (creds.user.isNullOrEmpty() || !creds.hasPassword) return
        v<TextView>(R.id.status).text = "Mise à jour…"
        spin(true)
        bg.execute {
            val r = try { Edt.refresh(this, force) } catch (e: Exception) { null }
            runOnUiThread {
                if (isFinishing || isDestroyed) return@runOnUiThread
                spin(false)
                show(r ?: Edt.celcat(this).cached())
            }
        }
    }

    private fun show(r: FetchResult) {
        courses = Edt.courses(this, r)
        val now = Edt.now()
        val at = r.at?.takeIf { it > 0 }?.let { DateUtils.getRelativeTimeSpanString(it, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS) }
        v<TextView>(R.id.status).text = when {
            at != null -> "Mis à jour $at"
            creds.user.isNullOrEmpty() || !creds.hasPassword -> "Renseigne tes identifiants CY pour commencer."
            else -> "Pas encore de données"
        }
        v<TextView>(R.id.error).apply {
            text = r.error ?: ""
            visibility = if (r.error.isNullOrEmpty()) View.GONE else View.VISIBLE
        }
        v<View>(R.id.unlock).visibility = if (r.authBad) View.VISIBLE else View.GONE
        showNext(now)
        showDay(now)
        val modules = Parser.knownModules(courses)
        v<TextView>(R.id.modules).text = if (modules.isEmpty()) "" else "Matières : " + modules.joinToString(", ")
    }

    /** Carte « Prochain cours » */
    private fun showNext(now: LocalDateTime) {
        val c = Schedule.nextClass(courses, now)
        v<View>(R.id.hero).visibility = if (c == null) View.GONE else View.VISIBLE
        if (c == null) return
        val started = !c.start.isAfter(now)
        val mins = Duration.between(now, c.start).toMinutes()
        v<TextView>(R.id.hero_label).text = when {
            started -> "En cours · jusqu'à ${Schedule.hm(c.end)}"
            mins < 60 -> "Dans ${mins + 1} min"
            else -> "${Schedule.dayLabel(c.start.toLocalDate(), now.toLocalDate())} · ${Schedule.hm(c.start)}"
        }
        v<View>(R.id.hero_dot).backgroundTintList = ColorStateList.valueOf(if (started) getColor(R.color.now) else c.color)
        v<TextView>(R.id.hero_title).text = c.module.ifEmpty { c.title }
        v<TextView>(R.id.hero_meta).text = listOf(c.category, "${Schedule.hm(c.start)} – ${Schedule.hm(c.end)}", c.staff)
            .filter { it.isNotEmpty() }.joinToString(" · ")
        v<TextView>(R.id.hero_room).text = "Salle " + c.room.ifEmpty { "inconnue" }
    }

    /** Carte de la journée : un cours par ligne, barre à la couleur de la matière */
    private fun showDay(now: LocalDateTime) {
        val card = v<View>(R.id.day_card)
        if (courses.isEmpty()) { card.visibility = View.GONE; return }
        card.visibility = View.VISIBLE
        val day = Schedule.dayView(courses, now, 12)
        v<TextView>(R.id.day_title).text = day.label
        v<TextView>(R.id.day_count).text = when (day.count) { 0 -> ""; 1 -> "1 cours"; else -> "${day.count} cours" }
        val list = v<LinearLayout>(R.id.day_list)
        list.removeAllViews()

        fun row(start: String, end: String, title: String, meta: String, color: Int,
                badge: String? = null, past: Boolean = false, cancelled: Boolean = false) {
            val r = layoutInflater.inflate(R.layout.app_row, list, false)
            r.findViewById<TextView>(R.id.r_start).text = start
            r.findViewById<TextView>(R.id.r_end).text = end
            r.findViewById<View>(R.id.r_bar).backgroundTintList = ColorStateList.valueOf(color)
            r.findViewById<TextView>(R.id.r_title).apply {
                text = title
                if (cancelled) paintFlags = paintFlags or Paint.STRIKE_THRU_TEXT_FLAG
            }
            r.findViewById<TextView>(R.id.r_meta).apply {
                text = meta
                visibility = if (meta.isEmpty()) View.GONE else View.VISIBLE
            }
            if (badge != null) r.findViewById<TextView>(R.id.r_badge).apply {
                val fg = getColor(if (cancelled) R.color.cancel else R.color.now)
                text = badge
                visibility = View.VISIBLE
                setTextColor(fg)
                backgroundTintList = ColorStateList.valueOf((fg and 0x00FFFFFF) or 0x26000000)
            }
            if (past) r.alpha = 0.45f
            list.addView(r)
        }

        day.allDay.forEach { row("📌", "", it.title, "", it.color) }
        day.shown.forEach { e ->
            val live = !e.cancelled && !e.start.isAfter(now) && e.end.isAfter(now)
            row(Schedule.hm(e.start), Schedule.hm(e.end), e.module.ifEmpty { e.title },
                listOf(e.category, e.room, e.staff).filter { it.isNotEmpty() }.joinToString(" · "),
                if (e.cancelled) getColor(R.color.cancel) else e.color,
                badge = if (e.cancelled) "Annulé" else if (live) "En cours" else null,
                past = !e.end.isAfter(now), cancelled = e.cancelled)
        }
        if (list.childCount == 0) list.addView(TextView(this).apply {
            text = "Pas de cours 🎉"
            textSize = 14f
            setTextColor(getColor(R.color.app_sub))
            setPadding(0, (12 * resources.displayMetrics.density).toInt(), 0, 0)
        })
    }

    private fun saveCreds() {
        val user = v<EditText>(R.id.user).text.toString().trim()
        val pass = v<EditText>(R.id.pass).text.toString()
        // Identifiant ou mot de passe manquant : rien n'est envoyé (un POST vide = un refus = verrou)
        if (user.isEmpty() || (pass.isEmpty() && !creds.hasPassword)) {
            Toast.makeText(this, "Identifiant et mot de passe CY sont obligatoires.", Toast.LENGTH_LONG).show()
            return
        }
        creds.save(user, pass, v<EditText>(R.id.fid).text.toString().trim())
        v<EditText>(R.id.pass).setText("")
        v<EditText>(R.id.pass).hint = "Mot de passe (vide = inchangé)"
        v<EditText>(R.id.fid).setText(creds.fid)
        Edt.celcat(this).credentialsChanged()     // nouveaux identifiants → on a le droit de retenter
        askNotifications()
        load(force = true)
    }

    private fun saveSettings() {
        settings.theme = themes[v<Spinner>(R.id.theme).selectedItemPosition].first
        settings.remindMin = reminds[v<Spinner>(R.id.remind).selectedItemPosition]
        settings.notifyChanges = v<CompoundButton>(R.id.notify).isChecked
        settings.countdown = v<CompoundButton>(R.id.countdown).isChecked
        settings.hideText = v<EditText>(R.id.hide).text.toString()
        settings.renameText = v<EditText>(R.id.rename).text.toString()
        val r = Edt.celcat(this).cached()
        show(r)
        bg.execute { try { Notifs.reminders(this, courses) } catch (e: Exception) {} }
        Widgets.updateAll(this)
        Toast.makeText(this, "Réglages enregistrés", Toast.LENGTH_SHORT).show()
    }

    private fun askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 1)
    }

    // Samsung (One UI) endort les apps peu ouvertes : sans ça, le widget se met à jour moins souvent
    private fun askBattery() = try {
        startActivity(Intent(SysSettings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
    } catch (e: Exception) {
        startActivity(Intent(SysSettings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
    }
}
