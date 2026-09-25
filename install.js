// Installe (ou réinstalle) le widget emploi du temps CY dans Scriptable.
// Coller dans un nouveau script Scriptable, le lancer, puis le supprimer.
const NAME = "EDT CY";
const URL = "https://raw.githubusercontent.com/Samito-05/cy-edt-widget/main/celcat-widget.js";
let fm = FileManager.local();
try { if (module.filename.startsWith(FileManager.iCloud().documentsDirectory())) fm = FileManager.iCloud(); } catch (e) {}
const path = fm.joinPath(module.filename.replace(/\/[^/]*$/, ""), NAME + ".js");
const req = new Request(URL); req.timeoutInterval = 20;
const src = await req.loadString();
if (!/const VERSION = "/.test(src)) throw new Error("Téléchargement incomplet, réessaie.");
if (fm.fileExists(path)) {
  const a = new Alert(); a.title = `« ${NAME} » existe déjà`;
  a.message = "Le remplacer par la dernière version ? Identifiants conservés, mais pas les réglages " +
              "modifiés dans le script : pour les garder, utilise plutôt son menu « Vérifier les mises à jour ».";
  a.addAction("Remplacer"); a.addCancelAction("Annuler");
  if (await a.present() === -1) return;
}
fm.writeString(path, "// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n" +
                     "// icon-color: deep-blue; icon-glyph: calendar-alt;\n" + src);
Safari.open("scriptable:///run/" + encodeURIComponent(NAME));
