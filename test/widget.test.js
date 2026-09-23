// Tests du widget CELCAT : on exécute celcat-widget.js dans un faux environnement
// Scriptable (stubs ci-dessous) et on vérifie ce qu'il télécharge, met en cache,
// notifie, écrit dans le calendrier et affiche.
//
//   node test/widget.test.js
const fsn = require("fs"), pathn = require("path"), osn = require("os");
const dir = fsn.mkdtempSync(pathn.join(osn.tmpdir(), "celcat-"));

global.log = [];
const say = (...a) => global.log.push(a.join(" "));

class Color { constructor(h, a = 1) { this.hex = h; this.alpha = a; } }
Color.dynamic = (l, d) => l;
Color.orange = () => new Color("#FF9500");
class Font { constructor(n, s) { this.n = n; this.s = s; } }
Font.systemFont = s => new Font("sys", s);
Font.boldSystemFont = s => new Font("bold", s);
Font.semiboldSystemFont = s => new Font("semi", s);
class Size { constructor(w, h) { this.width = w; this.height = h; } }
class DateFormatter {
  string(d) {
    const days = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
    const months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
    return (this.dateFormat || "").replace("EEEE", days[d.getDay()]).replace("EEE", days[d.getDay()])
      .replace("MMMM", months[d.getMonth()]).replace("MMM", months[d.getMonth()].slice(0, 4)).replace(/\bd\b/, d.getDate());
  }
}
const keychain = {};
global.Keychain = {
  contains: k => k in keychain, get: k => keychain[k],
  set: (k, v) => { keychain[k] = v; }, remove: k => { delete keychain[k]; },
};
global.FileManager = { local: () => ({
  documentsDirectory: () => dir,
  joinPath: (a, b) => pathn.join(a, b),
  fileExists: p => fsn.existsSync(p),
  readString: p => fsn.readFileSync(p, "utf8"),
  writeString: (p, s) => fsn.writeFileSync(p, s),
  remove: p => fsn.rmSync(p, { recursive: true, force: true }),
  move: (a, b) => fsn.renameSync(a, b),
}) };
global.Device = { screenSize: () => new Size(390, 844) };
class Rect { constructor(x, y, w, h) { Object.assign(this, { x, y, width: w, height: h }); } }
global.Rect = Rect;
global.drawn = [];
class DrawContext {
  setFillColor(c) { this.color = c; }
  fillRect(r) { global.drawn.push(r); }
  getImage() { return { size: this.size, rects: global.drawn.length }; }
}
global.DrawContext = DrawContext;

let NET = {};                       // url → réponse (string) ; compte les appels
global.netCalls = [];
class Request {
  constructor(url) { this.url = url; this.headers = {}; }
  async loadString() {
    global.netCalls.push({ url: this.url, timeout: this.timeoutInterval });
    const hit = Object.keys(NET).find(k => this.url.includes(k));
    if (this.timeoutInterval !== 10) global.badTimeout = (global.badTimeout || 0) + 1;
    if (hit === undefined) throw new Error("réseau indisponible: " + this.url);
    const v = NET[hit];
    if (v instanceof Error) throw v;
    this.response = { url: this.url };
    return typeof v === "function" ? v(this) : v;
  }
}
global.Request = Request;

class Stack {
  constructor(root) {
    this.root = root || this;
    this.items = []; this.kind = "stack";
    this.size = null; this.cornerRadius = 0; this.backgroundColor = null;
    this.backgroundImage = null; this.spacing = 0; this.borderWidth = 0; this.borderColor = null;
  }
  addStack() { const s = new Stack(this.root); this.items.push(s); return s; }
  addText(t) {
    const o = { kind: "text", text: t, parent: this };
    this.items.push(o); this.root.texts.push(o);
    return o;
  }
  addDate(d) { const o = { kind: "date", date: d, applyRelativeStyle() {}, applyTimerStyle() {}, leftAlignText() {} }; this.items.push(o); return o; }
  addSpacer(n) { this.items.push({ kind: "spacer", length: n }); }
  addImage() { return { imageSize: null, resizable: false }; }
  setPadding() {}
  layoutVertically() { this.vertical = true; } layoutHorizontally() { this.vertical = false; }
  centerAlignContent() {} topAlignContent() {} bottomAlignContent() {}
  // parcours récursif
  all() { return this.items.flatMap(i => (i instanceof Stack ? [i, ...i.all()] : [i])); }
}
class ListWidget extends Stack {
  constructor() { super(); this.texts = []; global.widget = this; }
  async presentLarge() {} async presentMedium() {} async presentSmall() {} async presentAccessoryRectangular() {}
}
global.ListWidget = ListWidget;
global.texts = () => global.widget.texts.map(t => t.text);
global.Size = Size; global.Color = Color; global.Font = Font; global.DateFormatter = DateFormatter;

global.notifications = [];
class Notification {
  async schedule() { global.notifications.push({ title: this.title, body: this.body, id: this.identifier }); }
  setTriggerDate(d) { this.trigger = d; }
}
Notification.allPending = async () => [];
Notification.removePending = async ids => say("removePending", ids.length);
global.Notification = Notification;

global.calendarOps = [];
class CalendarEvent {
  async save() { await new Promise(r => setImmediate(r)); global.calendarOps.push("save:" + this.title); }
  async remove() { await new Promise(r => setImmediate(r)); global.calendarOps.push("remove:" + this.title); }
}
CalendarEvent.between = async () => [];
global.CalendarEvent = CalendarEvent;
global.Calendar = { forEventsByTitle: async t => ({ title: t }), createForEvents: async t => ({ title: t }) };
global.QuickLook = { present: async () => {} };
global.Alert = class { addAction() {} addCancelAction() {} addTextField() {} addSecureTextField() {} async present() { return -1; } };
global.Script = { setWidget() {}, complete() {} };
global.config = { runsInWidget: true, widgetFamily: "large" };
global.args = { widgetParameter: "" };

// ---- fixtures ----
const at = (day, h, m = 0) => { const d = new Date(); d.setDate(d.getDate() + day); d.setHours(h, m, 0, 0); return d; };
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:00`;
const ev = (id, day, h, cat, mod, room) => ({
  id, start: iso(at(day, h)), end: iso(at(day, h + 2)), allDay: false,
  eventCategory: cat, modules: [mod], sites: ["FER"],
  description: `${cat}<br />${mod}<br />ING2 GSI<br />FER ${room} SALLE DE TD 40p<br />ZAOUCHE DJAOUIDA`,
  backgroundColor: "#4B4BFF",
});
const BASE_EVENTS = [
  ev("1", 1, 8, "TD", "I2GSIM07 - Statistiques", "FT202"),
  ev("2", 1, 13, "CM", "Anglais DIOANG3D", "FT101"),
  ev("3", 2, 10, "TP", "Réseaux [I2GRES01]", "FT305"),
  ev("4", 3, 8, "TD", "Statistiques I2GSIM07", "FT202"),
  ev("5", 4, 14, "Examen", "Maths", "AMPHI B"),
];
const ALLDAY = {
  id: "9", start: iso(at(1, 0)), end: null, allDay: true,
  eventCategory: "Férié", modules: ["Jour férié"], sites: [],
  description: "Férié<br />Jour férié", backgroundColor: "#FF9500",
};
const LOGIN_FORM = '<form><input name="__RequestVerificationToken" value="TOK123" /><input name="Password" type="password" /></form>';

function load() {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const src = fsn.readFileSync(pathn.join(__dirname, "..", "celcat-widget.js"), "utf8");
  return new Function(`return (async () => {\n${src}\n})();`)();
}

const CACHE = pathn.join(dir, "celcat_cache.json");
const readCacheFile = () => JSON.parse(fsn.readFileSync(CACHE, "utf8"));
let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => { if (cond) { pass++; console.log("  OK   " + name); } else { fail++; console.log("  FAIL " + name + " " + extra); } };

(async () => {
  Keychain.set("celcat_user", "etu");
  Keychain.set("celcat_pass", "pw");
  Keychain.set("celcat_fid", "12345678");

  // --- 1. téléchargement nominal
  console.log("\n[1] fetch + rendu + cache");
  NET = { "/Home/GetCalendarData": JSON.stringify(BASE_EVENTS) };
  global.netCalls = [];
  await load();
  const c1 = readCacheFile();
  ok("cache versionné v=2", c1.v === 2, JSON.stringify(c1.v));
  ok("cache contient les 5 cours", c1.data.length === 5);
  ok("pas de .tmp résiduel", !fsn.existsSync(CACHE + ".tmp"));
  ok("timeout réseau posé sur chaque requête", !global.badTimeout, "sans timeout: " + global.badTimeout);
  ok("calendrier enregistré", global.calendarOps.filter(o => o.startsWith("save:")).length === 5,
     JSON.stringify(global.calendarOps));
  ok("titres nettoyés (pas de code matière)", global.calendarOps.some(o => o.includes("Statistiques")) &&
     !global.calendarOps.some(o => o.includes("I2GSIM07")), JSON.stringify(global.calendarOps));
  ok("rappels planifiés", global.notifications.some(n => /dans 10 min/.test(n.title)),
     JSON.stringify(global.notifications.map(n => n.title)));

  // --- 2. cache frais : aucun appel réseau
  console.log("\n[2] cache frais");
  global.netCalls = []; global.calendarOps = [];
  await load();
  ok("aucun appel réseau", global.netCalls.length === 0, JSON.stringify(global.netCalls));

  // --- 3. changement de salle → notification
  console.log("\n[3] diff : salle changée + cours annulé");
  const moved = JSON.parse(JSON.stringify(BASE_EVENTS));
  moved[0].description = moved[0].description.replace("FT202", "FT999");
  moved[2].eventCategory = "TP annulé";
  const c3 = readCacheFile(); c3.at = 0; fsn.writeFileSync(CACHE, JSON.stringify(c3));   // périmer le cache
  NET = { "/Home/GetCalendarData": JSON.stringify(moved) };
  global.notifications = [];
  await load();
  const bodies = global.notifications.map(n => n.body || "").join("\n");
  ok("notif changement de salle", /FT202.*FT999/.test(bodies), bodies);
  ok("notif annulation", /annulé/.test(bodies), bodies);

  // --- 4. identifiants refusés → backoff
  console.log("\n[4] identifiants refusés");
  const c4 = readCacheFile(); c4.at = 0; fsn.writeFileSync(CACHE, JSON.stringify(c4));
  NET = { "/Home/GetCalendarData": "<html>login</html>", "/LdapLogin": LOGIN_FORM };
  global.netCalls = [];
  await load();
  const c4b = readCacheFile();
  ok("échec mémorisé", !!c4b.fail, JSON.stringify(c4b.fail));
  ok("message identifiants", /Identifiants refusés/.test(c4b.fail && c4b.fail.msg || ""), JSON.stringify(c4b.fail));
  ok("compteur démarre à 1 (backoff 1h)", c4b.fail && c4b.fail.count === 1, JSON.stringify(c4b.fail));
  ok("données conservées", c4b.data.length === 5);

  // --- 5. backoff respecté
  console.log("\n[5] backoff");
  const c5 = readCacheFile(); c5.at = 0; fsn.writeFileSync(CACHE, JSON.stringify(c5));
  global.netCalls = [];
  await load();
  ok("aucun appel pendant le backoff", global.netCalls.length === 0, JSON.stringify(global.netCalls));

  // backoff expiré → nouvelle tentative, cette fois réussie
  const c5b = readCacheFile(); c5b.at = 0; c5b.fail.at = Date.now() - 2 * 3600 * 1000;
  fsn.writeFileSync(CACHE, JSON.stringify(c5b));
  NET = { "/Home/GetCalendarData": JSON.stringify(BASE_EVENTS) };
  global.netCalls = [];
  await load();
  const c5c = readCacheFile();
  ok("retente après expiration", global.netCalls.length > 0);
  ok("succès efface l'échec", !c5c.fail, JSON.stringify(c5c.fail));

  // --- 6. serveur HS → données périmées affichées
  console.log("\n[6] serveur injoignable");
  const c6 = readCacheFile(); c6.at = 0; fsn.writeFileSync(CACHE, JSON.stringify(c6));
  NET = {};
  await load();
  const c6b = readCacheFile();
  ok("échec réseau mémorisé (count 0 → 15 min)", c6b.fail && c6b.fail.count === 0, JSON.stringify(c6b.fail));
  ok("cache intact", c6b.data.length === 5);

  // --- 7. cache d'une ancienne version ignoré
  console.log("\n[7] cache d'une version précédente");
  fsn.writeFileSync(CACHE, JSON.stringify({ at: Date.now(), fid: "12345678", until: 0, data: [] }));  // pas de v
  NET = { "/Home/GetCalendarData": JSON.stringify(BASE_EVENTS) };
  global.netCalls = [];
  await load();
  ok("re-téléchargement forcé", global.netCalls.length > 0);
  ok("cache réécrit en v2", readCacheFile().v === 2);

  // --- 8. autres vues
  console.log("\n[8] vues semaine / prochain / petit widget");
  for (const [fam, param] of [["large", "semaine"], ["small", "prochain"], ["small", ""], ["medium", "1"], ["accessoryRectangular", ""]]) {
    global.config.widgetFamily = fam; global.args.widgetParameter = param;
    let err = null;
    try { await load(); } catch (e) { err = e; }
    ok(`rendu ${fam} "${param || "(défaut)"}"`, !err, err && err.message);
  }

  // --- 9. événement journée entière
  console.log("\n[9] journée entière (férié)");
  global.config.widgetFamily = "large"; global.args.widgetParameter = "";
  fsn.rmSync(CACHE, { force: true });
  NET = { "/Home/GetCalendarData": JSON.stringify([ALLDAY, ...BASE_EVENTS]) };
  global.notifications = []; global.calendarOps = [];
  await load();
  const shown = global.texts();
  ok("bandeau journée affiché", shown.includes("journée"), JSON.stringify(shown));
  ok("pas d'horaire 00:00 sur le férié", !shown.some(t => /^00:00/.test(t)), JSON.stringify(shown));
  ok("aucun rappel pour le férié", !global.notifications.some(n => /férié/i.test(n.title || "")),
     JSON.stringify(global.notifications.map(n => n.title)));
  ok("férié envoyé au calendrier", global.calendarOps.some(o => /Férié/.test(o)), JSON.stringify(global.calendarOps));

  global.config.widgetFamily = "accessoryRectangular";
  await load();
  ok("prochain cours ≠ férié", !global.texts().some(t => /Férié/.test(t)), JSON.stringify(global.texts()));

  // --- 10. vue semaine : filets d'heures + trait "maintenant"
  console.log("\n[10] vue semaine");
  global.config.widgetFamily = "large"; global.args.widgetParameter = "semaine";
  global.drawn = [];
  const hNow = new Date().getHours();
  NET = { "/Home/GetCalendarData": JSON.stringify([
    ev("11", 0, Math.min(Math.max(8, hNow - 4), 16), "TD", "Statistiques", "FT202"),
    ...BASE_EVENTS,
  ]) };
  fsn.rmSync(CACHE, { force: true });
  await load();
  ok("filets d'heures dessinés", global.drawn.length >= 3, "rects: " + global.drawn.length);
  const nowBar = global.widget.all().find(i => i.kind === "stack" && i.size && i.size.height === 1.5);
  ok("trait maintenant présent", !!nowBar, "aucune barre de 1.5pt");

  // --- 11. widget moyen : 3 cours
  console.log("\n[11] widget moyen");
  global.config.widgetFamily = "medium"; global.args.widgetParameter = "";
  NET = { "/Home/GetCalendarData": JSON.stringify([
    ev("21", 1, 8, "TD", "Statistiques", "FT202"),
    ev("22", 1, 11, "CM", "Anglais", "FT101"),
    ev("23", 1, 14, "TP", "Réseaux", "FT305"),
  ]) };
  fsn.rmSync(CACHE, { force: true });
  await load();
  const mt = global.texts();
  ok("3 matières affichées", ["Statistiques", "Anglais", "Réseaux"].every(m => mt.some(t => t.includes(m))),
     JSON.stringify(mt));
  ok("salles affichées", mt.some(t => t.includes("FT202")) && mt.some(t => t.includes("FT305")), JSON.stringify(mt));

  console.log(`\n${pass} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
