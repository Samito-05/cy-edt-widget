// Génère celcat-demo.js : le script principal, avec un emploi du temps fictif à la
// place des vraies données. Même rendu, sans identifiants, réseau, notifications ni
// calendrier — un script Scriptable à part, pour que le vrai n'ait que ses widgets.
//
//   node tools/build-demo.js           → réécrit celcat-demo.js
//   node tools/build-demo.js --check   → échoue si celcat-demo.js n'est pas à jour (CI)
const fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const read = f => fs.readFileSync(path.join(root, f), "utf8");

function build() {
  const src = read("celcat-widget.js");
  const data = read("tools/demo-data.js").trimEnd();
  const marker = /^const DEMO = null;$/m;
  if (!marker.test(src)) throw new Error("ligne « const DEMO = null; » introuvable dans celcat-widget.js");
  const header =
    "// ============================================================\n" +
    "//  DÉMO du widget emploi du temps CELCAT — emploi du temps FICTIF\n" +
    "//  Aucun identifiant, aucun appel réseau, aucune notification, rien\n" +
    "//  écrit dans le calendrier. Pour le vrai widget : celcat-widget.js.\n" +
    "//\n" +
    "//  Fichier généré par tools/build-demo.js : ne pas modifier à la main.\n" +
    "// ============================================================\n\n";
  return header + src.replace(marker, () => `${data}\nconst DEMO = demoData;`);
}

const out = build();
const target = path.join(root, "celcat-demo.js");
if (process.argv.includes("--check")) {
  const cur = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : "";
  if (cur !== out) {
    console.error("celcat-demo.js n'est pas à jour : lance « node tools/build-demo.js ».");
    process.exit(1);
  }
  console.log("celcat-demo.js à jour.");
} else {
  fs.writeFileSync(target, out);
  console.log("celcat-demo.js généré.");
}
