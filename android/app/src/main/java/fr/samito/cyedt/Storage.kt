package fr.samito.cyedt

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import fr.samito.cyedt.core.Creds
import fr.samito.cyedt.core.ParsePrefs
import fr.samito.cyedt.core.Store
import java.io.File
import java.security.KeyStore
import java.util.Base64
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Fichiers privés de l'app, écrits de façon atomique (jamais de JSON tronqué). */
class AndroidStore(ctx: Context) : Store {
    private val dir = ctx.filesDir
    private fun file(name: String) = AtomicFile(File(dir, name))

    override fun read(name: String): String? = try {
        if (File(dir, name).exists()) file(name).readFully().toString(Charsets.UTF_8) else null
    } catch (e: Exception) { null }

    override fun write(name: String, text: String) {
        val f = file(name)
        val out = f.startWrite()
        try { out.write(text.toByteArray()); f.finishWrite(out) } catch (e: Exception) { f.failWrite(out); throw e }
    }

    override fun delete(name: String) { file(name).delete() }
}

/** Chiffrement AES-GCM avec une clé du Keystore Android (elle ne quitte jamais le téléphone). */
object Secure {
    private const val ALIAS = "cy-edt-creds"

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (ks.getKey(ALIAS, null) as? SecretKey)?.let { return it }
        val g = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        g.init(KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .build())
        return g.generateKey()
    }

    fun encrypt(s: String): String {
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.ENCRYPT_MODE, key())
        return Base64.getEncoder().encodeToString(c.iv + c.doFinal(s.toByteArray()))
    }

    fun decrypt(s: String?): String? = try {
        val b = Base64.getDecoder().decode(s ?: return null)
        val c = Cipher.getInstance("AES/GCM/NoPadding")
        c.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, b, 0, 12))
        String(c.doFinal(b, 12, b.size - 12))
    } catch (e: Exception) { null }
}

/** Identifiants CY + numéro étudiant, chiffrés. */
class AndroidCreds(ctx: Context) : Creds {
    private val p = ctx.getSharedPreferences("creds", Context.MODE_PRIVATE)

    override val user get() = Secure.decrypt(p.getString("user", null))
    override val pass get() = Secure.decrypt(p.getString("pass", null))
    override var fid: String
        get() = Secure.decrypt(p.getString("fid", null)) ?: ""
        set(v) { p.edit().putString("fid", Secure.encrypt(v)).apply() }
    override val salt: String
        get() = p.getString("salt", null) ?: UUID.randomUUID().toString().also { p.edit().putString("salt", it).apply() }

    val hasPassword get() = p.contains("pass")

    /** [pass] vide = inchangé. [fidRaw] : numéro seul ou adresse CELCAT complète (…&fid0=12345678). */
    fun save(user: String, pass: String, fidRaw: String) {
        val e = p.edit().putString("user", Secure.encrypt(user))
        if (pass.isNotEmpty()) e.putString("pass", Secure.encrypt(pass))
        val m = Regex("fid0=(\\d+)").find(fidRaw) ?: Regex("\\d{5,}").find(fidRaw)
        if (m != null) e.putString("fid", Secure.encrypt(m.groupValues.getOrNull(1)?.takeIf { it.isNotEmpty() } ?: m.value))
        else e.remove("fid")
        e.commit()
    }
}

/** Réglages modifiables dans l'app (équivalent du menu « Réglages » iOS). */
class Settings(ctx: Context) {
    private val p = ctx.getSharedPreferences("settings", Context.MODE_PRIVATE)

    var theme: String                                   // "auto", "light", "dark"
        get() = p.getString("theme", "auto") ?: "auto"
        set(v) { p.edit().putString("theme", v).apply() }
    var remindMin: Int                                  // rappel avant chaque cours (0 = désactivé)
        get() = p.getInt("remind", 10)
        set(v) { p.edit().putInt("remind", v).apply() }
    var notifyChanges: Boolean
        get() = p.getBoolean("notify", true)
        set(v) { p.edit().putBoolean("notify", v).apply() }
    var hideText: String                                // une règle par ligne
        get() = p.getString("hide", "") ?: ""
        set(v) { p.edit().putString("hide", v).apply() }
    var renameText: String                              // « Ancien = Nouveau », une par ligne
        get() = p.getString("rename", "") ?: ""
        set(v) { p.edit().putString("rename", v).apply() }

    fun parsePrefs() = ParsePrefs(
        hide = hideText.lines().map { it.trim() }.filter { it.isNotEmpty() },
        rename = renameText.lines().mapNotNull { l ->
            val i = l.indexOf('=')
            if (i <= 0) null else l.substring(0, i).trim() to l.substring(i + 1).trim()
        }.filter { it.first.isNotEmpty() && it.second.isNotEmpty() }.toMap(),
    )
}
