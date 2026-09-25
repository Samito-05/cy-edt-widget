package fr.samito.cyedt

import android.Manifest
import android.app.Activity
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings as SysSettings
import android.text.format.DateUtils
import android.view.View
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.CheckBox
import android.widget.EditText
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import fr.samito.cyedt.core.BASE
import fr.samito.cyedt.core.Course
import fr.samito.cyedt.core.FetchResult
import fr.samito.cyedt.core.Parser
import fr.samito.cyedt.core.Schedule
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

        v<TextView>(R.id.version).text = "EDT CY ${BuildConfig.VERSION_NAME} · projet non officiel, sans lien avec CY Tech / CYU"
        v<EditText>(R.id.user).setText(creds.user ?: "")
        v<EditText>(R.id.fid).setText(creds.fid)
        if (creds.hasPassword) v<EditText>(R.id.pass).hint = "Mot de passe (vide = inchangé)"

        v<Spinner>(R.id.theme).adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item, themes.map { it.second })
        v<Spinner>(R.id.theme).setSelection(themes.indexOfFirst { it.first == settings.theme }.coerceAtLeast(0))
        v<Spinner>(R.id.remind).adapter = ArrayAdapter(this, android.R.layout.simple_spinner_dropdown_item,
            reminds.map { if (it == 0) "Pas de rappel" else "$it min avant" })
        v<Spinner>(R.id.remind).setSelection(reminds.indexOf(settings.remindMin).coerceAtLeast(0))
        v<CheckBox>(R.id.notify).isChecked = settings.notifyChanges
        v<EditText>(R.id.hide).setText(settings.hideText)
        v<EditText>(R.id.rename).setText(settings.renameText)

        v<Button>(R.id.save).setOnClickListener { saveCreds() }
        v<Button>(R.id.refresh).setOnClickListener { load(force = true) }
        v<Button>(R.id.unlock).setOnClickListener {
            Edt.celcat(this).clearAuthLock()
            load(force = true)
        }
        v<Button>(R.id.open_celcat).setOnClickListener {
            val fid = creds.fid
            open(if (fid.isEmpty()) BASE else "$BASE/cal?vt=agendaWeek&et=student&fid0=$fid")
        }
        v<Button>(R.id.copy_next).setOnClickListener {
            val txt = Schedule.nextText(courses, Edt.now())
            getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Prochain cours", txt))
            Toast.makeText(this, txt, Toast.LENGTH_LONG).show()
        }
        v<Button>(R.id.save_settings).setOnClickListener { saveSettings() }
        v<Button>(R.id.test_notif).setOnClickListener { askNotifications(); Notifs.test(this) }
        v<Button>(R.id.battery).setOnClickListener { askBattery() }
        v<Button>(R.id.repo).setOnClickListener { open("https://github.com/Samito-05/cy-edt-widget/releases") }
    }

    override fun onResume() {
        super.onResume()
        // Ouvrir l'app force le téléchargement, sauf s'il date de moins de 2 min
        val at = Edt.celcat(this).cached().at ?: 0
        load(force = System.currentTimeMillis() - at > 2 * 60000)
        v<Button>(R.id.battery).visibility =
            if (getSystemService(PowerManager::class.java)?.isIgnoringBatteryOptimizations(packageName) == true) View.GONE else View.VISIBLE
    }

    override fun onDestroy() { bg.shutdown(); super.onDestroy() }

    private fun open(url: String) = try { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) } catch (e: Exception) {}

    private fun load(force: Boolean) {
        show(Edt.celcat(this).cached())
        if (creds.user.isNullOrEmpty() || !creds.hasPassword) {
            v<TextView>(R.id.status).text = "Renseigne tes identifiants CY ci-dessous pour commencer."
            return
        }
        v<TextView>(R.id.status).text = "Mise à jour…"
        bg.execute {
            val r = try { Edt.refresh(this, force) } catch (e: Exception) { null }
            runOnUiThread { if (!isFinishing) show(r ?: Edt.celcat(this).cached()) }
        }
    }

    private fun show(r: FetchResult) {
        courses = Edt.courses(this, r)
        val now = Edt.now()
        val at = r.at?.takeIf { it > 0 }?.let { DateUtils.getRelativeTimeSpanString(it, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS) }
        v<TextView>(R.id.status).text = listOfNotNull(
            r.error?.let { "⚠️ $it" },
            at?.let { "Emploi du temps mis à jour $it" },
        ).joinToString("\n").ifEmpty { if (creds.hasPassword) "Pas encore de données." else "" }
        v<Button>(R.id.unlock).visibility = if (r.authBad) View.VISIBLE else View.GONE
        v<TextView>(R.id.next).text = if (courses.isEmpty()) "" else Schedule.nextText(courses, now)

        val day = Schedule.dayView(courses, now, 12)
        v<TextView>(R.id.day_title).text = if (courses.isEmpty()) "" else day.label
        v<TextView>(R.id.day_list).text = (day.allDay.map { "📌 ${it.title}" } + day.shown.map { e ->
            val info = if (e.cancelled) "ANNULÉ" else listOf(e.room, e.staff).filter { it.isNotEmpty() }.joinToString(" · ")
            "${Schedule.hm(e.start)}–${Schedule.hm(e.end)}  ${e.title}" + if (info.isNotEmpty()) "\n              $info" else ""
        }).joinToString("\n").ifEmpty { if (courses.isEmpty()) "" else "Pas de cours 🎉" }

        val modules = Parser.knownModules(courses)
        v<TextView>(R.id.modules).text = if (modules.isEmpty()) "" else "Matières : " + modules.joinToString(", ")
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
        settings.notifyChanges = v<CheckBox>(R.id.notify).isChecked
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
