// Tests du widget CELCAT : on exécute celcat-widget.js dans un faux environnement
// Scriptable (stubs ci-dessous) et on vérifie ce qu'il télécharge, met en cache,
// notifie, écrit dans le calendrier et affiche.
//
//   node test/widget.test.js
const fsn = require("fs"), pathn = require("path"), osn = require("os");
const dir = fsn.mkdtempSync(pathn.join(osn.tmpdir(), "celcat-"));

global.log = [];
const say = (...a) => global.log.push(a.join(" "));

// Le widget ne fait aucun appel réseau la nuit (22 h → 7 h) : on décale l'horloge
// sur 10 h du matin pour que la suite donne le même résultat à toute heure.
const RealDate = Date;
const SHIFT = (() => {
  const now = new RealDate();
  const ten = new RealDate(now.getTime()); ten.setHours(10, 0, 0, 0);
  return ten.getTime() - now.getTime();
})();
class FakeDate extends RealDate {
  constructor(...a) { if (a.length === 0) super(RealDate.now() + SHIFT); else super(...a); }
  static now() { return RealDate.now() + SHIFT; }
}
global.Date = FakeDate;

class Color {
  constructor(h, a = 1) {
    // Scriptable n'accepte qu'un hex : on réplique pour que le test voie passer
    // une couleur exotique renvoyée par CELCAT.
    if (typeof h !== "string" || !/^#?(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(h))
      throw new Error("couleur invalide : " + h);
    this.hex = h; this.alpha = a;
  }
}
Color.dynamic = (l, d) => l;
Color.orange = () => new Color("#FF9500");
Color.red = () => new Color("#FF3B30");
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
global.alerts = [];                 // menus présentés (libellés des actions)
global.Alert = class {
  constructor() { this.actions = []; global.alerts.push(this); }
  addAction(l) { this.actions.push(l); } addCancelAction() {} addTextField() {} addSecureTextField() {}
  textFieldValue(i) { return (global.fieldValues || [])[i] || ""; }
  // réponses scriptées (index du bouton), sinon « Annuler »
  async present() { const r = (global.alertAnswers || []).shift(); return r === undefined ? -1 : r; }
};
global.Script = { name: () => "EDT CY", setWidget() {}, complete() {}, setShortcutOutput(o) { global.shortcutOut = o; } };
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

// file : script à exécuter ; patch : retouche du source (réglages en haut du fichier)
function load(file = "celcat-widget.js", patch = s => s) {
  for (const k of Object.keys(require.cache)) delete require.cache[k];
  const src = patch(fsn.readFileSync(pathn.join(__dirname, "..", file), "utf8"));
  return new Function(`return (async () => {\n${src}\n})();`)();
}

const CACHE = pathn.join(dir, "celcat_cache.json");
const AUTHLOCK = pathn.join(dir, "celcat_auth.json");
const readCacheFile = () => JSON.parse(fsn.readFileSync(CACHE, "utf8"));
const readLockFile = () => JSON.parse(fsn.readFileSync(AUTHLOCK, "utf8"));
const loginPosts = () => global.netCalls.filter(c => /LdapLogin/.test(c.url)).length;
const pwdPosts = () => global.netCalls.filter(c => /Logon/.test(c.url)).length;
const expire = extra => { const c = readCacheFile(); c.at = 0; delete c.fail; fsn.writeFileSync(CACHE, JSON.stringify(Object.assign(c, extra))); };
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
  ok("verrou posé dès le 1er refus", fsn.existsSync(AUTHLOCK), "pas de celcat_auth.json");
  ok("verrou sans mot de passe en clair", !JSON.stringify(readLockFile()).includes("pw"),
     fsn.readFileSync(AUTHLOCK, "utf8"));
  ok("empreinte sans longueur du mot de passe", !/\.\d/.test(readLockFile().fp), readLockFile().fp);
  ok("sel de l'empreinte gardé dans le Trousseau", !!Keychain.get("celcat_salt"));
  {   // sans le sel, l'empreinte du disque ne correspond à rien : verrou inutilisable
    const fp = readLockFile().fp, salt = Keychain.get("celcat_salt");
    Keychain.set("celcat_salt", "autre-sel");
    expire();
    NET = { "/Home/GetCalendarData": JSON.stringify(BASE_EVENTS) };
    global.netCalls = [];
    await load();
    ok("empreinte liée au sel", !fsn.existsSync(AUTHLOCK) || readLockFile().fp !== fp);
    Keychain.set("celcat_salt", salt);
    fsn.rmSync(AUTHLOCK, { force: true });
    NET = { "/Home/GetCalendarData": "<html>login</html>", "/LdapLogin": LOGIN_FORM };
    expire();
    await load();                      // on repose un vrai verrou pour la suite
  }

  // --- 4 bis. verrou : plus aucune tentative de connexion tant que rien ne change
  console.log("\n[4b] verrou identifiants");
  const cL = readCacheFile(); cL.at = 0; delete cL.fail; fsn.writeFileSync(CACHE, JSON.stringify(cL));
  NET = { "/Home/GetCalendarData": "<html>login</html>", "/LdapLogin": LOGIN_FORM };
  global.netCalls = [];
  await load();
  ok("aucun appel à /LdapLogin", loginPosts() === 0, JSON.stringify(global.netCalls));
  ok("cours précédents toujours affichés",
     global.texts().some(t => /Statistiques|Anglais/.test(t)), JSON.stringify(global.texts()).slice(0, 200));
  ok("badge « identifiants » affiché", global.texts().some(t => /identifiants/.test(t)),
     JSON.stringify(global.texts()).slice(0, 200));
  ok("cours conservés en cache", readCacheFile().data.length === 5);

  // mot de passe corrigé → le verrou saute tout seul (empreinte différente)
  Keychain.set("celcat_pass", "nouveau-pw");
  const cL2 = readCacheFile(); cL2.at = 0; delete cL2.fail; fsn.writeFileSync(CACHE, JSON.stringify(cL2));
  NET = { "/Home/GetCalendarData": JSON.stringify(BASE_EVENTS) };
  global.netCalls = [];
  await load();
  ok("verrou levé après changement de mot de passe", !fsn.existsSync(AUTHLOCK));
  ok("re-téléchargement après correction", global.netCalls.length > 0);
  Keychain.set("celcat_pass", "pw");
  fsn.rmSync(AUTHLOCK, { force: true });

  // --- 4 ter. tentative interrompue : le mot de passe ne part qu'une fois
  console.log("\n[4c] tentative interrompue");
  expire();
  NET = { "/LdapLogin/Logon": new Error("coupure"),        // réponse jamais reçue
          "/Home/GetCalendarData": "<html>login</html>", "/LdapLogin": LOGIN_FORM };
  global.netCalls = [];
  await load();
  ok("mot de passe envoyé une fois", pwdPosts() === 1, JSON.stringify(global.netCalls));
  ok("verrou provisoire posé", fsn.existsSync(AUTHLOCK) && readLockFile().pending === true,
     fsn.existsSync(AUTHLOCK) ? fsn.readFileSync(AUTHLOCK, "utf8") : "aucun verrou");
  ok("pas de badge « identifiants » sur une coupure",
     !global.texts().some(t => /identifiants/.test(t)), JSON.stringify(global.texts()).slice(0, 200));

  expire();
  global.netCalls = [];
  await load();
  ok("aucun 2e envoi du mot de passe", pwdPosts() === 0, JSON.stringify(global.netCalls));

  // passé 10 min, on a le droit de retenter
  const stale = readLockFile(); stale.at = Date.now() - 11 * 60000;
  fsn.writeFileSync(AUTHLOCK, JSON.stringify(stale));
  expire();
  global.netCalls = [];
  await load();
  ok("nouvelle tentative après 10 min", pwdPosts() === 1, JSON.stringify(global.netCalls));
  ok("1 essai suspect compté", readLockFile().strikes === 1, fsn.readFileSync(AUTHLOCK, "utf8"));

  // 2e réponse jamais reçue → plafond atteint : verrou définitif, plus aucun envoi
  const stale3 = readLockFile(); stale3.at = Date.now() - 11 * 60000;
  fsn.writeFileSync(AUTHLOCK, JSON.stringify(stale3));
  expire();
  global.netCalls = [];
  await load();
  ok("verrou définitif après 2 envois non confirmés", readLockFile().blocked === true && pwdPosts() === 0,
     fsn.readFileSync(AUTHLOCK, "utf8") + " " + JSON.stringify(global.netCalls));
  ok("badge « identifiants » après plafond", global.texts().some(t => /identifiants/.test(t)),
     JSON.stringify(global.texts()).slice(0, 200));

  // connexion acceptée → le verrou provisoire disparaît
  let gets = 0;
  NET = { "/LdapLogin/Logon": "<html>agenda</html>", "/LdapLogin": LOGIN_FORM,
          "/Home/GetCalendarData": () => (++gets === 1 ? "<html>login</html>" : JSON.stringify(BASE_EVENTS)) };
  const stale2 = { at: Date.now() - 11 * 60000, fp: readLockFile().fp, pending: true };
  fsn.writeFileSync(AUTHLOCK, JSON.stringify(stale2));
  expire({ data: [] });
  global.netCalls = [];
  await load();
  ok("succès efface le verrou provisoire", !fsn.existsSync(AUTHLOCK),
     fsn.existsSync(AUTHLOCK) ? fsn.readFileSync(AUTHLOCK, "utf8") : "");
  ok("cours reçus après connexion", readCacheFile().data.length === 5);

  // connexion « acceptée » (pas de formulaire réaffiché) mais toujours aucun cours :
  // le mot de passe ne doit pas repartir à chaque backoff
  console.log("\n[4d] connexion non confirmée");
  NET = { "/LdapLogin/Logon": "<html>page inconnue</html>", "/LdapLogin": LOGIN_FORM,
          "/Home/GetCalendarData": "<html>login</html>" };
  for (let i = 0; i < 4; i++) { expire(); await load(); }
  global.netCalls = [];
  expire(); await load();
  ok("verrou définitif après 2 connexions sans cours", fsn.existsSync(AUTHLOCK) && readLockFile().blocked === true,
     fsn.existsSync(AUTHLOCK) ? fsn.readFileSync(AUTHLOCK, "utf8") : "aucun verrou");
  ok("plus aucun envoi du mot de passe", pwdPosts() === 0, JSON.stringify(global.netCalls));
  const FP = readLockFile().fp;
  fsn.rmSync(AUTHLOCK, { force: true });

  // autre widget en pleine connexion : pas de badge « identifiants », pas de backoff
  console.log("\n[4e] tentative d'un autre widget en cours");
  NET = { "/Home/GetCalendarData": "<html>login</html>", "/LdapLogin": LOGIN_FORM };
  expire();
  fsn.writeFileSync(AUTHLOCK, JSON.stringify({ at: Date.now(), fp: FP, pending: true }));
  global.netCalls = [];
  await load();
  ok("aucun envoi du mot de passe", pwdPosts() === 0, JSON.stringify(global.netCalls));
  ok("pas de badge « identifiants »", !global.texts().some(t => /identifiants/.test(t)),
     JSON.stringify(global.texts()).slice(0, 200));
  ok("pas d'échec mémorisé", !readCacheFile().fail, JSON.stringify(readCacheFile().fail));
  fsn.rmSync(AUTHLOCK, { force: true });

  // échec pendant qu'un autre widget réussit : ses données ne sont pas écrasées
  console.log("\n[4f] course entre deux widgets");
  expire({ data: [] });
  NET = { "/Home/GetCalendarData": () => {
    const c = readCacheFile();       // l'autre widget écrit un cache frais pendant notre requête
    fsn.writeFileSync(CACHE, JSON.stringify({ ...c, at: Date.now(), data: BASE_EVENTS }));
    throw new Error("coupure");
  } };
  await load();
  ok("cache frais de l'autre widget conservé", readCacheFile().data.length === 5 && !readCacheFile().fail,
     JSON.stringify(readCacheFile()).slice(0, 200));

  // --- 5. backoff respecté (panne serveur, pas un refus d'identifiants)
  console.log("\n[5] backoff");
  const c5 = readCacheFile(); c5.at = 0;
  c5.fail = { at: Date.now(), count: 1, msg: "Serveur injoignable" };
  fsn.writeFileSync(CACHE, JSON.stringify(c5));
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

  // --- 10. vue semaine : trait "maintenant"
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

  // --- 12. script de démo (fichier séparé)
  console.log("\n[12] script de démo");
  {
    const cp = require("child_process").spawnSync(process.execPath,
      [pathn.join(__dirname, "..", "tools", "build-demo.js"), "--check"], { encoding: "utf8" });
    ok("celcat-demo.js à jour (node tools/build-demo.js)", cp.status === 0, cp.stderr || cp.stdout);
  }
  const keychainBefore = JSON.stringify(keychain);
  for (const [fam, p] of [["large", ""], ["large", "semaine"], ["small", "prochain"], ["small", ""],
                          ["medium", ""], ["accessoryRectangular", ""]]) {
    global.config.widgetFamily = fam; global.args.widgetParameter = p;
    global.netCalls = []; global.calendarOps = []; global.notifications = [];
    NET = {};                                    // tout appel réseau échouerait
    fsn.rmSync(CACHE, { force: true });
    let err = null;
    try { await load("celcat-demo.js"); } catch (e) { err = e; }
    ok(`démo ${fam} "${p || "(défaut)"}"`, !err, err && err.message);
    ok("  aucun réseau", global.netCalls.length === 0, JSON.stringify(global.netCalls));
    ok("  rien écrit (calendrier, notifs, cache, Trousseau)",
       !global.calendarOps.length && !global.notifications.length && !fsn.existsSync(CACHE) &&
       JSON.stringify(keychain) === keychainBefore,
       JSON.stringify([global.calendarOps, global.notifications]));
  }
  global.config.widgetFamily = "large"; global.args.widgetParameter = "";
  await load("celcat-demo.js");
  const dt = global.texts();
  ok("démo : cours affichés", dt.some(t => /Statistiques|Anglais|Économie/.test(t)), JSON.stringify(dt).slice(0, 200));
  ok("démo : pas de lien vers CELCAT au toucher", global.widget.url === undefined, global.widget.url);
  const demoSrc = fsn.readFileSync(pathn.join(__dirname, "..", "celcat-demo.js"), "utf8");
  ok("démo : en-tête sans identifiants", /^\/\/ =+\n\/\/  DÉMO/.test(demoSrc) && !/enregistrer tes\s*\n?\/\/\s*identifiants/.test(demoSrc),
     demoSrc.slice(0, 300));

  // menus : la démo n'a que ses aperçus, le vrai script plus aucune entrée « Démo »
  global.config.runsInWidget = false;
  global.alerts = [];
  await load("celcat-demo.js");
  const demoMenu = (global.alerts[0] || {}).actions || [];
  ok("menu démo : 6 aperçus, rien d'autre", demoMenu.length === 6 && !demoMenu.some(l => /identifiants|notif|jour/i.test(l)),
     JSON.stringify(demoMenu));
  global.alerts = [];
  await load();
  const mainMenu = (global.alerts[0] || {}).actions || [];
  ok("menu principal sans entrée « Démo »", mainMenu.length > 0 && !mainMenu.some(l => /d[ée]mo/i.test(l)),
     JSON.stringify(mainMenu));
  global.config.runsInWidget = true;

  // l'ancien paramètre « demo » ne fait plus basculer le vrai script sur des données fictives
  global.args.widgetParameter = "demo";
  NET = { "/Home/GetCalendarData": JSON.stringify(BASE_EVENTS) };
  fsn.rmSync(CACHE, { force: true });
  await load();
  ok("vrai script : toucher le widget ouvre CELCAT", /^https:\/\/celcat-calendar\.cyu\.fr\/cal\?.*fid0=12345678$/.test(global.widget.url || ""),
     global.widget.url);
  ok("vrai script : paramètre « demo » ignoré", !global.texts().some(t => /Économie/.test(t)),
     JSON.stringify(global.texts()).slice(0, 200));
  global.args.widgetParameter = "";

  // --- 13. dates sans fuseau lues en heure locale
  console.log("\n[13] lecture des dates");
  global.args.widgetParameter = "";
  const at8 = new Date(); at8.setHours(8, 30, 0, 0);
  const iso830 = `${at8.getFullYear()}-${String(at8.getMonth() + 1).padStart(2, "0")}-${String(at8.getDate()).padStart(2, "0")}T08:30:00`;
  NET = { "/Home/GetCalendarData": JSON.stringify([{
    id: "z1", start: iso830, end: iso830.replace("T08:30", "T10:00"), allDay: false,
    eventCategory: "TD", modules: ["Statistiques"], sites: ["FER"],
    description: "TD<br />Statistiques<br />FER FT202 SALLE DE TD 40p",
  }]) };
  fsn.rmSync(CACHE, { force: true });
  await load();
  ok("08:30 affiché tel quel", global.texts().includes("08:30"), JSON.stringify(global.texts()));

  // --- 13 bis. couleur inattendue renvoyée par CELCAT
  console.log("\n[13b] couleur invalide");
  for (const bad of ["rgb(255,0,0)", "", null, "red", "#12"]) {
    const e13 = ev("c1", 1, 9, "Réunion", "Conseil de classe", "FT202");
    e13.backgroundColor = bad;
    NET = { "/Home/GetCalendarData": JSON.stringify([e13]) };
    fsn.rmSync(CACHE, { force: true });
    let err = null;
    try { await load(); } catch (x) { err = x; }
    ok(`rendu malgré backgroundColor ${JSON.stringify(bad)}`,
       !err && global.texts().some(t => /Conseil/.test(t)),
       (err && err.message) || JSON.stringify(global.texts()).slice(0, 160));
  }

  // --- 13 ter. données abîmées renvoyées par CELCAT
  console.log("\n[13c] entité HTML hors Unicode + date illisible");
  {
    const e1 = ev("d1", 1, 9, "TD", "Chimie &#99999999; &#x110000;", "FT202");
    const e2 = ev("d2", 1, 11, "TD", "Physique", "FT101");
    const e3 = { ...ev("d3", 1, 14, "TD", "Fantôme", "FT305"), start: "pas une date" };
    const e4 = { ...ev("d4", 1, 16, "TD", "Biologie", "FT305"), end: "n'importe quoi" };
    NET = { "/Home/GetCalendarData": JSON.stringify([e1, e2, e3, e4]) };
    fsn.rmSync(CACHE, { force: true });
    global.args.widgetParameter = "";
    let err = null;
    try { await load(); } catch (x) { err = x; }
    const t = global.texts();
    ok("rendu malgré &#99999999;", !err && t.some(s => /Chimie/.test(s)), (err && err.message) || JSON.stringify(t));
    ok("cours à date illisible ignoré", !t.some(s => /Fantôme|NaN/.test(s)), JSON.stringify(t));
    ok("fin illisible → 1 h par défaut", t.includes("17:00"), JSON.stringify(t));
    global.args.widgetParameter = "semaine";
    err = null;
    try { await load(); } catch (x) { err = x; }
    ok("vue semaine malgré données abîmées", !err && !global.texts().some(s => /NaN/.test(s)),
       (err && err.message) || JSON.stringify(global.texts()));
    global.args.widgetParameter = "";
  }

  // --- 15. cours masqués (HIDE)
  console.log("\n[15] cours masqués");
  {
    const hide = src => src.replace("const HIDE = [\n", 'const HIDE = [\n  "anglais", /^TP - /,\n');
    NET = { "/Home/GetCalendarData": JSON.stringify(BASE_EVENTS) };
    fsn.rmSync(CACHE, { force: true });
    global.calendarOps = []; global.notifications = [];
    await load("celcat-widget.js", hide);
    const t = global.texts();
    ok("matière masquée absente du widget", !t.some(s => /Anglais/.test(s)) && t.some(s => /Statistiques/.test(s)),
       JSON.stringify(t));
    ok("masquée aussi du calendrier (texte + regex)",
       !global.calendarOps.some(o => /Anglais|Réseaux/.test(o)) && global.calendarOps.some(o => /Statistiques/.test(o)),
       JSON.stringify(global.calendarOps));
    ok("pas de rappel pour une matière masquée", !global.notifications.some(n => /Anglais/.test(n.title || "")),
       JSON.stringify(global.notifications.map(n => n.title)));
  }

  // --- 16. Siri / Raccourcis
  console.log("\n[16] Siri / Raccourcis");
  global.config.runsWithSiri = true; global.config.runsInWidget = false;
  global.alerts = [];
  global.args.shortcutParameter = "";
  global.shortcutOut = null;
  await load();
  ok("prochain cours en texte", /^Prochain cours : Statistiques \(TD\), demain à 08:00, salle FER FT202\.$/.test(global.shortcutOut || ""),
     global.shortcutOut);
  ok("aucun menu présenté", global.alerts.length === 0, JSON.stringify(global.alerts.map(a => a.actions)));
  global.args.shortcutParameter = "jour";
  await load();
  ok("cours du jour en texte", /^Demain : 08:00 Statistiques \(FER FT202\), 13:00 Anglais \(FER FT101\)\.$/.test(global.shortcutOut || ""),
     global.shortcutOut);
  global.args.shortcutParameter = ""; global.netCalls = []; NET = {};
  await load("celcat-demo.js");
  ok("démo via Siri : réponse sans réseau", /cours/i.test(global.shortcutOut || "") && global.netCalls.length === 0,
     global.shortcutOut);
  global.config.runsWithSiri = false; global.config.runsInWidget = true;
  global.args.shortcutParameter = "";

  // --- 17. semaine au-delà des jours téléchargés
  console.log("\n[17] semaine hors période");
  NET = { "/Home/GetCalendarData": JSON.stringify(BASE_EVENTS) };
  fsn.rmSync(CACHE, { force: true });
  global.args.widgetParameter = "semaine 3";
  await load();
  ok("« hors période » au lieu de « pas de cours »", global.texts().some(t => /hors période/.test(t)),
     JSON.stringify(global.texts()));
  global.args.widgetParameter = "";

  // --- 18. cache interrompu entre suppression et renommage
  console.log("\n[18] cache .tmp orphelin");
  {
    const c = readCacheFile(); c.at = Date.now();
    fsn.writeFileSync(CACHE + ".tmp", JSON.stringify(c));
    fsn.rmSync(CACHE, { force: true });
    NET = {};
    global.netCalls = [];
    await load();
    ok("cours relus depuis le .tmp", global.texts().some(t => /Statistiques/.test(t)) && global.netCalls.length === 0,
       JSON.stringify(global.texts()).slice(0, 200));
    fsn.rmSync(CACHE + ".tmp", { force: true });
  }

  // --- 19. vue semaine : cours qui se chevauchent côte à côte
  console.log("\n[19] cours simultanés");
  {
    const at1 = (h, m) => iso(at(1, h, m));
    const sim = (id, h1, m1, h2, m2, mod) => ({ ...ev(id, 1, 8, "TD", mod, "FT" + id), start: at1(h1, m1), end: at1(h2, m2) });
    const run = async evts => {
      NET = { "/Home/GetCalendarData": JSON.stringify(evts) };
      fsn.rmSync(CACHE, { force: true });
      global.args.widgetParameter = "semaine"; global.config.widgetFamily = "large";
      let err = null;
      try { await load(); } catch (x) { err = x; }
      return err;
    };
    // hauteur remplie par une pile verticale (taille fixe des enfants + spacers)
    const filled = s => s.items.reduce((n, i) => n + (i.kind === "spacer" ? (i.length || 0) : i.size ? i.size.height : 0), 0);
    const columns = () => {
      const grid = global.widget.items.filter(i => i instanceof Object && i.kind === "stack").find(s => s.items.length > 5 && s.items[0].vertical);
      return grid ? grid.items.filter(i => i.kind === "stack" && i.vertical).slice(1) : [];
    };

    let err = await run([sim("201", 10, 0, 12, 0, "Chimie"), sim("202", 11, 0, 13, 0, "Physique"), sim("203", 14, 0, 15, 0, "Biologie")]);
    const t = global.texts();
    ok("rendu semaine avec chevauchement", !err, err && err.message);
    ok("les deux cours simultanés affichés", t.includes("Chimie") && t.includes("Physique"), JSON.stringify(t));
    const rows = global.widget.all().filter(i => i.kind === "stack" && !i.vertical && i.items.filter(c => c.kind === "stack").length === 2 &&
                                                  i.items.every(c => c.kind !== "stack" || c.vertical));
    const row = rows.find(r => r.all().some(i => i.text === "Chimie"));
    ok("Chimie et Physique dans la même rangée", !!row && row.all().some(i => i.text === "Physique"), rows.length + " rangées");
    const lanes = row ? row.items.filter(c => c.kind === "stack") : [];
    ok("sous-colonnes de même hauteur que la rangée", lanes.length === 2 && lanes.every(l => l.size.height === row.size.height && filled(l) === row.size.height),
       JSON.stringify(lanes.map(l => [l.size, filled(l)])));
    ok("sous-colonnes plus étroites que la colonne", lanes.every(l => 2 * l.size.width + 2 <= row.size.width), JSON.stringify(lanes.map(l => l.size)));
    const cols = columns();
    ok("chaque colonne du jour garde sa hauteur exacte", cols.length >= 5 && cols.every(c => Math.abs(filled(c) - c.size.height) < 0.01),
       JSON.stringify(cols.map(c => [c.size && c.size.height, filled(c)])));

    err = await run([sim("211", 9, 0, 11, 0, "Cours A"), { ...sim("212", 9, 0, 11, 0, "Cours B"), eventCategory: "Examen" },
                     sim("213", 9, 30, 10, 30, "Cours C")]);
    const t3 = global.texts();
    ok("3 cours simultanés : 1 affiché + « +2 »", !err && t3.includes("Cours A") && t3.includes("+2") &&
       !t3.includes("Cours B") && !t3.includes("Cours C"), (err && err.message) || JSON.stringify(t3));
    const row3 = global.widget.all().find(i => i.kind === "stack" && !i.vertical &&
                                             i.items.some(c => c.kind === "stack" && c.size && c.size.width === 16 && c.all().some(t => t.text === "+2")));
    const lanes3 = row3 ? row3.items.filter(c => c.kind === "stack") : [];
    ok("  2 colonnes seulement (lisibles)", lanes3.length === 2, lanes3.length + " colonnes");
    ok("  « +N » en bande étroite, le cours garde la largeur",
       lanes3.length === 2 && lanes3[1].size.width < 20 && lanes3[0].size.width > 2 * lanes3[1].size.width,
       JSON.stringify(lanes3.map(l => l.size)));
    ok("  « +N » aux couleurs du cours caché", lanes3[1] && lanes3[1].borderColor && lanes3[1].borderColor.hex === "#FF9500",
       JSON.stringify(lanes3[1] && lanes3[1].borderColor));

    err = await run([sim("211", 9, 0, 11, 0, "Cours A"), sim("212", 9, 0, 11, 0, "Cours B"),
                     sim("213", 9, 0, 11, 0, "Cours C"), sim("214", 9, 30, 10, 30, "Cours D")]);
    const t4 = global.texts();
    ok("4 cours simultanés : 1 affiché + « +3 »", !err && t4.includes("+3") && t4.includes("Cours A") &&
       !t4.includes("Cours B"), (err && err.message) || JSON.stringify(t4));
    global.args.widgetParameter = "";
  }

  // --- 20. vert réservé au cours en cours
  console.log("\n[20] pas de vert hors cours en cours");
  {
    const greens = ["#34C759", "#0f0", "4CD964", "#2E7D32", "#8BC34A"];
    const evts = greens.map((g, i) => ({ ...ev("g" + i, 1, 8 + 2 * i, "Réunion", "Matière " + i, "FT20" + i), backgroundColor: g }));
    evts.push({ ...ev("tp", 2, 8, "TP", "Réseaux", "FT305") });
    evts.push({ ...ev("bl", 2, 11, "Réunion", "Conseil", "FT306"), backgroundColor: "#4B4BFF" });
    NET = { "/Home/GetCalendarData": JSON.stringify(evts) };
    fsn.rmSync(CACHE, { force: true });
    global.config.widgetFamily = "large"; global.args.widgetParameter = "semaine";
    await load();
    const colors = global.widget.all().flatMap(i => [i.backgroundColor, i.borderColor, i.textColor])
                                      .filter(c => c && c.hex).map(c => c.hex.replace("#", "").toUpperCase());
    const norm = g => g.replace("#", "").toUpperCase();
    ok("aucune couleur verte de CELCAT reprise", !greens.some(g => colors.includes(norm(g))), JSON.stringify([...new Set(colors)]));
    ok("verts remplacés par du violet", colors.includes("AF52DE"), JSON.stringify([...new Set(colors)]));
    ok("couleur non verte conservée", colors.includes("4B4BFF"), JSON.stringify([...new Set(colors)]));
    global.args.widgetParameter = "";
  }

  // --- 14. comparaison de versions
  console.log("\n[14] mises à jour");
  const widgetSrc = fsn.readFileSync(pathn.join(__dirname, "..", "celcat-widget.js"), "utf8");
  const version = (widgetSrc.match(/const VERSION = "([^"]+)"/) || [])[1];
  ok("VERSION présente", !!version, version);
  const cmp = new Function(widgetSrc.slice(widgetSrc.indexOf("function versionRank"),
                                           widgetSrc.indexOf("async function checkUpdate")) +
                           "return { versionRank, isNewer };")();
  ok("1.2.1 > 1.2.0", cmp.isNewer("1.2.1", "1.2.0"));
  ok("1.1.0 = 1.1.0 → pas de mise à jour", !cmp.isNewer("1.1.0", "1.1.0"));
  ok("1.10.0 > 1.9.0 (comparaison numérique)", cmp.isNewer("1.10.0", "1.9.0"));
  ok("1.0.9 < 1.1.0", !cmp.isNewer("1.0.9", "1.1.0"));

  // installation depuis le menu : réglages modifiés reportés, en-tête Scriptable gardé
  {
    const setVer = (s, v) => s.replace(/const VERSION = "[^"]+"/, `const VERSION = "${v}"`);
    const header = "// Variables used by Scriptable.\n// icon-color: deep-blue; icon-glyph: calendar-alt;\n";
    const base = setVer(widgetSrc, "1.0.0");
    const mine = header + base.replace('const THEME = "auto";', 'const THEME = "dark";')
                              .replace(/const HIDE = \[[\s\S]*?\n\];/, 'const HIDE = [\n  "Allemand",\n];');
    const remote = setVer(widgetSrc, "9.9.9").replace("const FETCH_MIN = 15;", "const FETCH_MIN = 20;");
    const scriptPath = pathn.join(dir, "EDT CY.js");
    fsn.writeFileSync(scriptPath, mine);
    global.module = { filename: scriptPath };
    NET = { "/main/celcat-widget.js": remote, "/1.0.0/celcat-widget.js": base };
    global.config.runsInWidget = false;
    global.alerts = [];
    global.alertAnswers = [9, 0, 0];             // menu → « Vérifier les mises à jour » → Installer → OK
    await load("celcat-widget.js", s => setVer(s, "1.0.0").replace('const THEME = "auto";', 'const THEME = "dark";'));
    const out = fsn.readFileSync(scriptPath, "utf8");
    const done = global.alerts[global.alerts.length - 1] || {};
    ok("menu : entrée 10 = mises à jour", /mises à jour/.test((global.alerts[0].actions || [])[9]), JSON.stringify(global.alerts[0].actions));
    ok("mise à jour installée", /const VERSION = "9\.9\.9"/.test(out), (done.title || "") + " " + (done.message || ""));
    ok("réglages modifiés reportés", /const THEME = "dark";/.test(out) && /"Allemand",/.test(out), out.slice(0, 200));
    ok("réglage non modifié : nouvelle valeur par défaut", /const FETCH_MIN = 20;/.test(out));
    ok("en-tête Scriptable conservé", out.startsWith(header));
    ok("ancienne version sauvegardée", fsn.readFileSync(pathn.join(dir, "EDT CY-1.0.0.js.bak"), "utf8") === mine);
    ok("pas d'alerte « autres modifications »", /THEME, HIDE/.test(done.message || "") && !/\.bak/.test(done.message || ""), done.message);

    // version publiée cassée → fichier intact
    fsn.writeFileSync(scriptPath, mine);
    NET = { "/main/celcat-widget.js": setVer("const VERSION = \"9.9.9\";\nif (", "9.9.9"), "/1.0.0/celcat-widget.js": base };
    global.alerts = []; global.alertAnswers = [9, 0, 0];
    await load("celcat-widget.js", s => setVer(s, "1.0.0"));
    ok("source invalide refusée, script intact", fsn.readFileSync(scriptPath, "utf8") === mine,
       (global.alerts[global.alerts.length - 1] || {}).title);
    global.alertAnswers = [];
  }

  // --- 21. premier lancement : assistant au lieu du menu
  console.log("\n[21] premier lancement");
  {
    const saved = { ...keychain };
    for (const k of Object.keys(keychain)) delete keychain[k];
    global.alerts = []; global.notifications = [];
    await load();
    ok("sans identifiants : écran d'accueil", /Bienvenue/.test((global.alerts[0] || {}).title || "") && global.alerts.length === 1,
       JSON.stringify(global.alerts.map(a => a.title)));
    global.alerts = []; global.alertAnswers = [0, 0, 0]; global.fieldValues = ["etu2", "pw2", "87654321"];
    NET = {};
    await load();
    ok("assistant : identifiants enregistrés", keychain.celcat_user === "etu2" && keychain.celcat_fid === "87654321");
    ok("assistant : notification de test", global.notifications.some(n => /Notifications activées/.test(n.title || "")));
    ok("assistant : consignes d'ajout du widget", global.alerts.some(a => /widget/.test(a.title || "")));
    global.alertAnswers = []; global.fieldValues = [];
    for (const k of Object.keys(keychain)) delete keychain[k];
    Object.assign(keychain, saved);
    global.config.runsInWidget = true;
  }

  // --- 22. installateur
  console.log("\n[22] installateur");
  {
    const inst = fsn.readFileSync(pathn.join(__dirname, "..", "install.js"), "utf8");
    let err = null;
    try { new (Object.getPrototypeOf(async function () {}).constructor)(inst); } catch (e) { err = e; }
    ok("install.js : syntaxe valide", !err, err && err.message);
    ok("install.js : court (à coller sur iPhone)", inst.split("\n").length <= 30);
    const readme = fsn.readFileSync(pathn.join(__dirname, "..", "README.md"), "utf8");
    ok("README : même code que install.js", readme.includes(inst.trimEnd().split("\n").join("\n   ")));
  }

  console.log(`\n${pass} OK, ${fail} FAIL`);
  process.exit(fail ? 1 : 0);
})();
