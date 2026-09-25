package fr.samito.cyedt

import android.app.Activity
import android.appwidget.AppWidgetManager
import android.content.Intent
import android.os.Bundle
import android.widget.ArrayAdapter
import android.widget.ListView

/**
 * Choix de la vue d'un widget « EDT CY » : l'équivalent du champ « Parameter » du widget
 * iOS (vide, 1, 2…, semaine, semaine 1…, prochain). Ouvert à l'ajout du widget, puis
 * par appui long → Paramètres.
 */
class ConfigActivity : Activity() {
    private val options = WidgetView.OPTIONS

    override fun onCreate(state: Bundle?) {
        super.onCreate(state)
        val id = intent?.extras?.getInt(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
            ?: AppWidgetManager.INVALID_APPWIDGET_ID
        // Retour sans choix : le widget n'est pas ajouté
        setResult(RESULT_CANCELED, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
        if (id == AppWidgetManager.INVALID_APPWIDGET_ID) { finish(); return }

        setContentView(R.layout.activity_config)
        val list = findViewById<ListView>(R.id.options)
        list.choiceMode = ListView.CHOICE_MODE_SINGLE
        list.adapter = ArrayAdapter(this, android.R.layout.simple_list_item_single_choice, options.map { it.second })
        val current = WidgetView.of(this, id)
        list.setItemChecked(options.indexOfFirst { it.first == current }.coerceAtLeast(0), true)
        list.setOnItemClickListener { _, _, pos, _ ->
            WidgetView.set(this, id, options[pos].first)
            Widgets.updateAll(this)
            Edt.schedule(this)
            setResult(RESULT_OK, Intent().putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, id))
            finish()
        }
    }
}
