// ============================================================
//  DÉMO du widget emploi du temps CELCAT — emploi du temps FICTIF
//  Aucun identifiant, aucun appel réseau, aucune notification, rien
//  écrit dans le calendrier. Pour le vrai widget : celcat-widget.js.
//
//  - Lance-le dans Scriptable : menu d'aperçus (grand, moyen, petit,
//    semaine, prochain cours, écran verrouillé).
//  - Widget → Parameter : mêmes valeurs que le vrai script
//    (vide, 1, 2…, semaine, semaine 1, prochain).
//
//  Fichier généré par tools/build-demo.js : ne pas modifier à la main.
// ============================================================

const VERSION = "1.3.3";         // version de ce script (comparée à celle du dépôt)
const REPO = "https://github.com/Samito-05/cy-edt-widget";
const REPO_RAW = "https://raw.githubusercontent.com/Samito-05/cy-edt-widget/main/celcat-widget.js";

const BASE = "https://celcat-calendar.cyu.fr";
const DAYS_AHEAD = 14;           // jours récupérés (couvre week-ends / vacances courtes)
const FETCH_MIN = 15;            // en journée : l'emploi du temps est retéléchargé toutes les 15 min
const NIGHT_START = 22;          // la nuit (22h → 7h) : aucun appel réseau,
const NIGHT_END = 7;             //   le widget se sert uniquement des données en mémoire
const HIDE_AFTER_MIN = 30;       // mode live : un cours disparaît 30 min après son début
const SHOW_COUNTDOWN = false;    // compte à rebours « dans 12:34 » dans l'heure avant un cours (true = activé)
const LIVE_FAMILIES = ["small"]; // tailles en mode live (ajoute "medium" si tu veux)

// ---------- réglages : notifications, calendrier, thème ----------
const NOTIFY_CHANGES = true;     // notification si un cours change (salle, horaire, annulation, ajout)
const CHANGES_DAYS = 7;          //   … uniquement pour les cours des 7 prochains jours
const REMIND_BEFORE_MIN = 10;    // rappel X min avant chaque cours, avec la salle (0 = désactivé)
const SYNC_CALENDAR = true;      // copie les cours dans un calendrier iPhone dédié
const CALENDAR_NAME = "Cours CY";
const THEME = "auto";            // "auto" (suit l'iPhone), "dark" ou "light"

// Cours à masquer partout (widget, rappels, notifications, calendrier) : option non
// suivie, cours d'un autre groupe… Texte (contenu dans la matière ou le type, sans
// tenir compte des majuscules) ou expression régulière testée sur « Type - Matière ».
const HIDE = [
  // "Allemand",
  // /^TP - Sport/i,
];

// Script de démo (celcat-demo.js) : tools/build-demo.js remplace la ligne ci-dessous
// par un emploi du temps fictif. Ici : vraies données, rien à changer.
// Emploi du temps fictif du script de démo (celcat-demo.js), au format renvoyé par
// CELCAT : il traverse donc le même parsing et le même rendu que les vraies données.
// Inséré tel quel dans celcat-demo.js par tools/build-demo.js (mondayOf, ymd, pad
// viennent du script principal).
function demoData() {
  const monday = mondayOf(new Date());
  const day = i => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; };
  const stamp = (d, h, m) => `${ymd(d)}T${pad(h)}:${pad(m)}:00`;
  const mk = (id, i, [sh, sm], [eh, em], cat, mod, room, staff, note) => {
    const d = day(i);
    return {
      id: "demo" + id, start: stamp(d, sh, sm), end: stamp(d, eh, em), allDay: false,
      eventCategory: cat, modules: [mod], sites: ["FER"],
      description: [cat, mod, "ING2 GSI", room ? `FER ${room} SALLE DE COURS 40p` : "", staff, note]
                     .filter(Boolean).join("<br />"),
    };
  };
  const events = [
    mk(1, 0, [8, 30], [10, 0],  "CM", "I2GSIM07 - Statistiques", "AMPHI B", "MARTIN CLAIRE"),
    mk(2, 0, [10, 15], [11, 45], "TD", "Économie I2GECO01",      "FT202", "DUBOIS PAUL"),
    mk(3, 0, [13, 0], [14, 30], "TD", "Projet tutoré",           "FT310", "DA SILVA INES"),
    mk(4, 1, [9, 0], [10, 30],  "CM", "Cybersécurité I2GCYB01",  "AMPHI A", "NGUYEN ANH"),
    mk(5, 1, [10, 45], [12, 15], "TD", "IA : Théorie",           "FT202", "MARTIN CLAIRE"),
    mk(6, 1, [14, 0], [15, 30], "TD", "Test logiciel I2GTST01",  "FT105", "BERNARD LUC"),
    mk(14, 1, [14, 30], [16, 0], "TP", "Réseaux I2GRES01",       "FT310", "DA SILVA INES"),   // en même temps : côte à côte
    mk(7, 3, [8, 30], [10, 0],  "TD", "Économie I2GECO01",       "FT202", "DUBOIS PAUL"),
    mk(8, 3, [10, 15], [11, 45], "CM", "Test logiciel I2GTST01", "FT105", "BERNARD LUC", "Annulé"),
    mk(9, 3, [12, 0], [13, 30], "TD", "Anglais DIOANG3D",        "FT310", "SMITH JANE, LEROY EMMA"),
    mk(10, 3, [15, 0], [16, 30], "TD", "I2GSIM07 - Statistiques", "FT202", "MARTIN CLAIRE"),
    mk(11, 4, [8, 30], [10, 0], "TD", "IA : Théorie",            "FT202", "MARTIN CLAIRE"),
    mk(12, 4, [13, 0], [14, 30], "TD", "Conception Systèmes",    "FT105", "NGUYEN ANH"),
    mk(13, 4, [16, 45], [18, 0], "Examen", "Mathématiques",      "AMPHI B", "BERNARD LUC"),
  ];
  // Un cours cale sur l'heure de la capture : carte verte « En cours · fin … »
  const now = new Date();
  const from = new Date(now.getTime() - 20 * 60000);
  const to = new Date(now.getTime() + 70 * 60000);
  events.push({
    id: "demo0", allDay: false,
    start: stamp(now, from.getHours(), from.getMinutes()),
    end: stamp(now, to.getHours(), to.getMinutes()),
    eventCategory: "TD", modules: ["Anglais DIOANG3D"], sites: ["FER"],
    description: "TD<br />Anglais DIOANG3D<br />ING2 GSI<br />FER FT310 SALLE DE COURS 40p<br />SMITH JANE",
  });
  // Jour férié (journée entière) en milieu de semaine
  events.push({
    id: "demo-ferie", allDay: true, start: ymd(day(2)), end: null,
    eventCategory: "Férié", modules: ["Jour férié"], sites: [],
    description: "Férié<br />Jour férié",
  });
  return events;
}
const DEMO = demoData;

const KC_USER = "celcat_user";
const KC_PASS = "celcat_pass";
const KC_FID  = "celcat_fid";    // numéro étudiant CELCAT (fid0), saisi ou détecté
const KC_SALT = "celcat_salt";   // sel aléatoire de l'empreinte (voir credFingerprint)
let FID = Keychain.contains(KC_FID) ? Keychain.get(KC_FID) : "";
let AUTH_BAD = false;            // identifiants refusés : plus aucune tentative de connexion

// ---------- style ----------
// Couleur qui suit le mode clair / sombre de l'iPhone (selon THEME)
function dyn(light, dark, alpha = 1) {
  if (THEME === "dark") return new Color(dark, alpha);
  if (THEME === "light") return new Color(light, alpha);
  return Color.dynamic(new Color(light, alpha), new Color(dark, alpha));
}

const STYLE = {
  bg:     dyn("#F2F2F7", "#131418"),
  card:   dyn("#FFFFFF", "#1E1F24"),
  text:   dyn("#111114", "#FFFFFF"),
  sub:    dyn("#3C3C43", "#D4D4DA"),
  muted:  dyn("#8A8A8E", "#8E8E96"),
  now:    dyn("#1E9E47", "#34C759"),   // cours en cours
  nowLine: dyn("#FF3B30", "#FF453A"),  // trait "maintenant" (vue semaine)
  nowBg:  dyn("#E3F5E8", "#182A1F"),
  cancel: dyn("#D95A00", "#FF9F0A"),   // cours annulé
  todayCol: dyn("#000000", "#FFFFFF", 0.05),
  white:  new Color("#FFFFFF"),
  font:   s => new Font("AvenirNext-Medium", s),
  bold:   s => new Font("AvenirNext-DemiBold", s),
};

// Si une matière s'affiche encore avec son code, ajoute-la ici : "CODE": "Nom affiché"
const RENAME = {
  // "I2GSIM07": "Statistiques",
};

// Couleur selon le type de cours (1re règle qui correspond).
// Teintes système iOS : elles restent lisibles sur fond clair comme sur fond sombre.
// Le vert est réservé au cours en cours : une couleur verte ici (ou renvoyée par
// CELCAT) est remplacée par NOT_GREEN, voir courseColor.
const TYPE_COLORS = [
  { re: /^CM\b|magistral/i,                                color: "#FF3B30" }, // rouge
  { re: /^TD\b|dirig/i,                                    color: "#0A84FF" }, // bleu
  { re: /^TP\b|pratique/i,                                 color: "#AF52DE" }, // violet
  { re: /exam|partiel|\bDS\b|contr[oô]le|soutenance/i,     color: "#FF9500" }, // orange
];

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "celcat_cache.json");
const AUTHLOCK = fm.joinPath(fm.documentsDirectory(), "celcat_auth.json");

// ---------- utilitaires ----------
const pad = n => String(n).padStart(2, "0");

// CELCAT renvoie "2026-09-23T08:00:00", sans fuseau : on lit les composants nous-mêmes
// pour que ce soit toujours l'heure locale, quelle que soit la version de JavaScriptCore.
// Une date qui porte un fuseau ("…Z", "…+02:00") est laissée à Date, qui sait la convertir.
function parseDate(v) {
  if (v instanceof Date) return v;
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return new Date(v);
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
}
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const enc = encodeURIComponent;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// Entités HTML nommées courantes (le reste est géré en numérique : &#232; → è)
const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", ecirc: "ê", euml: "ë", agrave: "à", acirc: "â", auml: "ä",
  ccedil: "ç", icirc: "î", iuml: "ï", ocirc: "ô", ouml: "ö", ugrave: "ù", ucirc: "û", uuml: "ü",
  Eacute: "É", Egrave: "È", Ecirc: "Ê", Agrave: "À", Ccedil: "Ç", oelig: "œ", OElig: "Œ",
  rsquo: "’", lsquo: "‘", laquo: "«", raquo: "»", hellip: "…", ndash: "–", mdash: "—", deg: "°",
};

// Code point hors Unicode ("&#99999999;") : fromCodePoint lèverait une RangeError
// et ferait tomber tout le parsing → on laisse l'entité telle quelle.
const fromCp = (cp, raw) => cp <= 0x10FFFF ? String.fromCodePoint(cp) : raw;

function decode(s) {
  return String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")                                            // gère aussi "&amp;#232;"
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => fromCp(parseInt(h, 16), m))
    .replace(/&#(\d+);/g, (m, d) => fromCp(+d, m))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n] ?? m)
    .replace(/\s+/g, " ").trim();
}

function fmtDate(d, pattern) {
  const df = new DateFormatter(); df.locale = "fr_FR"; df.dateFormat = pattern;
  return df.string(d);
}

function dayLabel(d) {
  const today = new Date();
  const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
  if (ymd(d) === ymd(today)) return "Aujourd'hui";
  if (ymd(d) === ymd(tomorrow)) return "Demain";
  return cap(fmtDate(d, "EEEE d MMMM"));
}

// ---------- identifiants ----------
// Empreinte des identifiants : sert uniquement à repérer qu'ils ont changé.
// Le mot de passe ne sort jamais du Trousseau iOS, et l'empreinte écrite sur le
// disque est salée : sans le sel (qui reste, lui aussi, dans le Trousseau) elle ne
// permet pas de tester des mots de passe candidats, et ne dit rien de sa longueur.
function credSalt() {
  if (!Keychain.contains(KC_SALT)) {
    Keychain.set(KC_SALT, Math.random().toString(36).slice(2) + Date.now().toString(36));
  }
  return Keychain.get(KC_SALT);
}

function credFingerprint() {
  const s = credSalt() + "\u0000" +
            (Keychain.contains(KC_USER) ? Keychain.get(KC_USER) : "") + "\u0000" +
            (Keychain.contains(KC_PASS) ? Keychain.get(KC_PASS) : "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// Verrou local. Dès le PREMIER refus d'identifiants, plus aucune tentative de
// connexion n'est envoyée à CELCAT : sinon le widget rejouerait le mauvais mot de
// passe toutes les 15 min et l'annuaire CY finirait par bloquer le compte.
// Le verrou saute dès que les identifiants changent, ou via le menu du script.
// Une tentative posée juste avant l'envoi du mot de passe (voir login) expire
// d'elle-même : elle ne sert qu'à empêcher deux widgets de tenter en même temps,
// ou à couvrir un essai dont on n'a jamais vu la réponse (iOS coupe le widget).
//
// Le refus n'est reconnu qu'à la page de connexion réaffichée : si CELCAT change
// de page (SSO, maintenance…) un mauvais mot de passe passerait pour accepté.
// Chaque envoi non confirmé par un emploi du temps reçu (réponse jamais vue,
// ou connexion « acceptée » mais toujours pas de données) compte donc comme un
// essai suspect ; au bout de MAX_STRIKES, verrou définitif comme pour un refus.
const PENDING_TTL_MIN = 10;
const MAX_STRIKES = 2;
const UNCONFIRMED_MSG = "Connexion non confirmée par CELCAT — ouvre le script → « Débloquer et réessayer une fois ».";

// États du fichier : { pending } tentative en cours · { blocked, msg } verrou définitif ·
// sinon simple compteur d'essais suspects ({ strikes }).
function readAuthLock() {
  try {
    if (!fm.fileExists(AUTHLOCK)) return null;
    const l = JSON.parse(fm.readString(AUTHLOCK));
    if (l.fp !== credFingerprint()) { clearAuthLock(); return null; }   // identifiants modifiés
    if (l.blocked === undefined) l.blocked = !l.pending && !!l.msg;     // fichier d'une version précédente
    if (l.pending && Date.now() - l.at > PENDING_TTL_MIN * 60000)       // réponse jamais reçue
      return addStrike((l.strikes || 0) + 1);
    return l;
  } catch (e) { return null; }
}

function writeAuthLock(l) {
  try { fm.writeString(AUTHLOCK, JSON.stringify({ at: Date.now(), fp: credFingerprint(), ...l })); }
  catch (e) {}
}

const setAuthLock = msg => writeAuthLock({ msg, blocked: true });

// Enregistre un essai suspect ; verrouille au-delà de MAX_STRIKES
function addStrike(strikes) {
  const l = strikes >= MAX_STRIKES ? { msg: UNCONFIRMED_MSG, blocked: true, strikes } : { strikes };
  writeAuthLock(l);
  return { ...l, blocked: !!l.blocked };
}

function clearAuthLock() {
  try { if (fm.fileExists(AUTHLOCK)) fm.remove(AUTHLOCK); } catch (e) {}
}

function credError(msg) {
  const e = new Error(msg);
  e.badCredentials = true;
  return e;
}

// Message d'erreur affiché par la page de connexion CELCAT, s'il y en a un
function loginErrorMessage(html) {
  const m = String(html).match(/validation-summary-errors[^>]*>([\s\S]{0,400}?)<\/div>/i);
  const txt = m ? m[1].replace(/<[^>]+>/g, " ").replace(/&[#a-z0-9]+;/gi, " ").replace(/\s+/g, " ").trim() : "";
  if (/verrouill|bloqu|locked|disabled/i.test(txt)) return "Compte CY bloqué : " + txt;
  return (txt ? txt + " — " : "Identifiants refusés — ") +
         "ouvre le script → « Changer mes identifiants ».";
}

async function askCredentials() {
  const a = new Alert();
  a.title = "Connexion CELCAT";
  a.message = "Identifiants CY (ceux du site celcat-calendar.cyu.fr) et ton numéro étudiant : " +
              "le nombre après « fid0= » dans l'adresse de ton emploi du temps. " +
              "Laisse-le vide pour essayer la détection automatique. Tout est stocké dans le Trousseau iOS.";
  a.addTextField("Identifiant", Keychain.contains(KC_USER) ? Keychain.get(KC_USER) : "");
  a.addSecureTextField(Keychain.contains(KC_PASS) ? "Mot de passe (vide = inchangé)" : "Mot de passe", "");
  a.addTextField("Numéro étudiant", FID);
  a.addAction("Enregistrer");
  a.addCancelAction("Annuler");
  if ((await a.present()) === -1) return false;

  // Identifiant ou mot de passe manquant : rien n'est envoyé (un POST vide = un refus = verrou)
  const user = a.textFieldValue(0).trim();
  if (!user || (!a.textFieldValue(1) && !Keychain.contains(KC_PASS))) {
    const warn = new Alert();
    warn.title = "Identifiants incomplets";
    warn.message = "Identifiant et mot de passe CY sont obligatoires. Rien n'a été enregistré.";
    warn.addAction("OK");
    await warn.present();
    return false;
  }
  Keychain.set(KC_USER, user);
  if (a.textFieldValue(1)) Keychain.set(KC_PASS, a.textFieldValue(1));

  // Accepte le numéro seul ou l'adresse complète collée (…&fid0=12345678)
  const raw = a.textFieldValue(2).trim();
  const m = raw.match(/fid0=(\d+)/) || raw.match(/\d{5,}/);
  if (m) saveFid(m[1] || m[0]);
  else { FID = ""; if (Keychain.contains(KC_FID)) Keychain.remove(KC_FID); }
  clearAuthLock();   // nouveaux identifiants → on a le droit de retenter
  AUTH_BAD = false;
  return true;
}

function saveFid(id) { FID = id; Keychain.set(KC_FID, id); }

// Cherche le numéro étudiant dans une page ou une adresse CELCAT
function detectFid(...texts) {
  for (const t of texts) {
    const s = String(t || "");
    const m = s.match(/fid0=(\d{5,})/) || s.match(/federationIds[^0-9]{0,30}(\d{5,})/);
    if (m) { saveFid(m[1]); return m[1]; }
  }
  return "";
}

// ---------- réseau ----------
// iOS ne laisse qu'une poignée de secondes à un widget : mieux vaut abandonner
// et afficher les données en mémoire que de se faire tuer en plein chargement.
const NET_TIMEOUT = 10;          // secondes

function request(url) {
  const r = new Request(url);
  r.timeoutInterval = NET_TIMEOUT;
  return r;
}

async function login() {
  if (!Keychain.contains(KC_USER) || !Keychain.contains(KC_PASS)) {
    if (config.runsInWidget) throw new Error("Ouvre le script dans Scriptable pour te connecter.");
    if (!(await askCredentials())) throw new Error("Connexion annulée.");
  }
  // Un refus a déjà eu lieu avec CES identifiants : on n'envoie plus rien.
  const lock = readAuthLock();
  if (lock && lock.blocked) throw credError(lock.msg);
  // Un autre widget est en train de se connecter : ce n'est pas un refus, on attend.
  if (lock && lock.pending) {
    const e = new Error("Connexion en cours…");
    e.transient = true;
    throw e;
  }

  const page = await request(BASE + "/LdapLogin").loadString();
  const m = page.match(/__RequestVerificationToken[^>]*value="([^"]+)"/);
  if (!m) return false; // pas de formulaire → pas de connexion nécessaire

  const r = request(BASE + "/LdapLogin/Logon");
  r.method = "POST";
  r.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  r.body = `Name=${enc(Keychain.get(KC_USER))}&Password=${enc(Keychain.get(KC_PASS))}` +
           `&__RequestVerificationToken=${enc(m[1])}`;
  // Verrou posé AVANT l'envoi : même si deux widgets se réveillent ensemble, ou si
  // iOS tue le script avant la réponse, un seul mot de passe part vers CELCAT.
  const strikes = (lock && lock.strikes) || 0;
  writeAuthLock({ pending: true, strikes });
  const html = await r.loadString();
  // Identifiants refusés : CELCAT réaffiche le formulaire au lieu de rediriger vers l'agenda
  if (/name="Password"/i.test(html) && /__RequestVerificationToken/.test(html)) {
    const msg = loginErrorMessage(html);
    setAuthLock(msg);          // une seule tentative : on s'arrête là
    throw credError(msg);
  }
  // Connexion acceptée en apparence : le verrou ne saute qu'une fois les cours reçus
  // (voir getEvents), sinon l'envoi compte comme un essai suspect.
  writeAuthLock({ strikes });
  if (!FID) detectFid(r.response && r.response.url, html);   // après connexion, CELCAT redirige souvent vers …&fid0=…
  return true;
}

// Détection auto du numéro étudiant (si non saisi)
async function findFid() {
  for (const path of ["/cal", "/"]) {
    const r = request(BASE + path);
    const html = await r.loadString().catch(() => "");
    const id = detectFid(r.response && r.response.url, html);
    if (id) return id;
  }
  return "";
}

// Lundi de la semaine de d (00:00)
function mondayOf(d) {
  const m = new Date(d); m.setHours(0, 0, 0, 0);
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return m;
}

// Période téléchargée : du lundi de cette semaine à aujourd'hui + DAYS_AHEAD (exclu)
function fetchWindow() {
  const start = mondayOf(new Date());
  const end = new Date(); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + DAYS_AHEAD);
  return { start, end };
}

async function fetchEvents() {
  const { start, end } = fetchWindow();                    // depuis lundi (pour la vue semaine)
  const r = request(BASE + "/Home/GetCalendarData");
  r.method = "POST";
  r.headers = {
    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    "X-Requested-With": "XMLHttpRequest",
  };
  r.body = `start=${ymd(start)}&end=${ymd(end)}&resType=104&calView=agendaWeek` +
           `&federationIds%5B%5D=${enc(FID)}&colourScheme=3`;
  const txt = (await r.loadString()).trim();
  if (!txt.startsWith("[")) return null; // page HTML = non connecté
  return JSON.parse(txt);
}

const CACHE_V = 2;               // incrémenter si le format du cache change → l'ancien est ignoré

function readCache() {
  try {
    // iOS a pu couper writeCache entre la suppression et le renommage : le .tmp est complet
    const file = fm.fileExists(CACHE) ? CACHE : fm.fileExists(CACHE + ".tmp") ? CACHE + ".tmp" : null;
    if (!file) return null;
    const c = JSON.parse(fm.readString(file));
    if (c.v !== CACHE_V) return null;  // écrit par une version plus ancienne du script
    return c.fid === FID ? c : null;   // cache d'un autre numéro étudiant → ignoré
  } catch (e) { return null; }
}

// Écriture en deux temps : une interruption d'iOS ne laisse jamais un JSON tronqué
function writeCache(obj) {
  const tmp = CACHE + ".tmp";
  fm.writeString(tmp, JSON.stringify({ ...obj, v: CACHE_V }));
  if (fm.fileExists(CACHE)) fm.remove(CACHE);
  fm.move(tmp, CACHE);
}

// Échecs répétés (mot de passe changé, serveur HS…) : on espace les tentatives au lieu
// de rappeler CELCAT toutes les FETCH_MIN minutes, pour chaque widget installé.
const FAIL_BACKOFF_MIN = [15, 60, 180, 360];
const backoffMs = f => FAIL_BACKOFF_MIN[Math.min(f.count, FAIL_BACKOFF_MIN.length - 1)] * 60000;

// Badge d'état en haut du widget
const staleLabel = () => AUTH_BAD ? "identifiants ✗" : "hors ligne";
const staleColor = () => AUTH_BAD ? Color.red() : Color.orange();

const isNight = (d = new Date()) => d.getHours() >= NIGHT_START || d.getHours() < NIGHT_END;

// Prochain rafraîchissement du widget :
// - journée : au prochain début/fin de cours, au plus tard dans FETCH_MIN min ;
// - nuit : à minuit (pour passer "Demain" → "Aujourd'hui", sans réseau) puis à NIGHT_END.
function nextRefresh(edges) {
  const now = new Date();
  if (isNight(now)) {
    const t = new Date(now);
    if (now.getHours() >= NIGHT_START) t.setHours(24, 0, 0, 0);   // minuit
    else t.setHours(NIGHT_END, 0, 0, 0);                           // réveil
    return t;
  }
  let t = new Date(now.getTime() + FETCH_MIN * 60000);
  const next = edges.filter(d => d > now).sort((a, b) => a - b)[0];
  if (next && next < t) t = next;
  const nightStart = new Date(now); nightStart.setHours(NIGHT_START, 0, 0, 0);
  return t > nightStart ? nightStart : t;
}

async function getEvents(force = false) {
  // Données en mémoire suffisantes ? (nuit, ou téléchargées il y a moins de FETCH_MIN min,
  // ce qui évite aussi que plusieurs widgets téléchargent chacun de leur côté)
  const lock = readAuthLock();
  AUTH_BAD = !!lock && lock.blocked;
  const cached = readCache();
  const fresh = cached && Date.now() - cached.at < (FETCH_MIN - 1) * 60000;
  if (cached && FID && !force && (fresh || isNight()))
    return { data: cached.data, stale: AUTH_BAD, error: AUTH_BAD ? lock.msg : undefined, fetched: false };

  // Tentative précédente en échec : on patiente (ouvrir le script dans l'app réessaie tout de suite)
  const fail = cached && cached.fail;
  if (fail && !force && Date.now() - fail.at < backoffMs(fail))
    return { data: cached.data, stale: true, error: fail.msg, fetched: false };

  try {
    let data = FID ? await fetchEvents() : null;
    if (!data) {
      const sent = await login();
      if (!FID) await findFid();
      if (!FID) {
        const err = new Error("Numéro étudiant manquant : ouvre le script → « Changer mes identifiants ».");
        err.fatal = true;
        throw err;
      }
      data = await fetchEvents();
      // Mot de passe parti, « accepté », mais toujours pas de cours : essai suspect
      if (!data && sent) {
        const l = addStrike(((readAuthLock() || {}).strikes || 0) + 1);
        if (l.blocked) throw credError(l.msg);
      }
    }
    if (!data) throw new Error("Connexion refusée (identifiants ?)");
    // Cours reçus : connexion confirmée, compteur d'essais remis à zéro. Un verrou
    // définitif reste (session encore ouverte ≠ mot de passe bon), une tentative
    // d'un autre widget aussi.
    const l = readAuthLock();
    if (l && !l.blocked && !l.pending) clearAuthLock();
    // Réponse vide alors qu'on avait des cours à venir → raté du serveur : on garde l'ancienne version
    if (!data.length && cached && cached.data.filter(e => parseDate(e.start) > new Date()).length >= 4)
      throw new Error("Réponse vide du serveur");
    const until = fetchWindow().end.getTime();
    writeCache({ at: Date.now(), fid: FID, until, data });   // succès → l'historique d'échecs est effacé
    // "prev" = version précédente, pour détecter les changements
    return { data, stale: false, fetched: true, until,
             prev: cached ? cached.data : null, prevUntil: cached ? cached.until : null };
  } catch (e) {
    if (e.badCredentials) AUTH_BAD = true;
    // Un autre widget a pu réussir pendant qu'on échouait : on relit le cache au lieu
    // d'écraser ses données toutes fraîches avec notre vieille copie.
    const cur = readCache() || cached;
    if (cur && cached && cur.at > cached.at && !cur.fail)
      return { data: cur.data, stale: false, fetched: false };
    // Autre widget en pleine connexion : rien d'anormal, pas de backoff
    if (e.transient && cur) return { data: cur.data, stale: false, fetched: false };
    // Mot de passe refusé : le verrou a déjà coupé les tentatives ; ce décompte
    // ne sert plus qu'aux pannes réseau / serveur.
    if (cur && !e.transient) {
      const f = cur.fail;
      const count = f ? f.count + 1 : (e.badCredentials ? 1 : 0);
      try { writeCache({ ...cur, fail: { at: Date.now(), count, msg: e.message } }); } catch (err) {}
    }
    if (!e.fatal && cur) return { data: cur.data, stale: true, error: e.message, fetched: false };
    // Identifiants refusés sans rien en mémoire : on affiche l'erreur, pas un plantage
    if (e.badCredentials) return { data: [], stale: true, error: e.message, fetched: false };
    throw e;
  }
}

// ---------- parsing ----------
const isRoom  = l => /salle|amphi|labo/i.test(l) || /^[A-Z]{2,5}[\s-]?[A-Z]{0,3}\d{2,4}\b/.test(l); // ex. "FER FT202 …"
const isStaff = l => /\s/.test(l) && /^[A-ZÀ-ÖØ-Þ' ,.\-]+$/.test(l);                     // ex. "ZAOUCHE DJAOUIDA"

// Salle courte : "FER FT202 SALLE DE TD 40p" → "FER FT202"
function shortRoom(r) {
  const s = r.replace(/\s+\d+\s?p(l(aces?)?)?\.?$/i, "")   // capacité "40p"
             .replace(/\s+SALLES?\b.*$/i, "")              // "SALLE DE TD…"
             .trim();
  return s || r;
}

const splitLines = e => (e.description || "").split(/<br\s*\/?>/i).map(decode).filter(Boolean);
const looksLikeGroup = l => /\b(ING\d?|PRE-?ING\d?|CPI\d?|GR(P|OUPE)?\s?[A-Z0-9]+|GSI|FISA|FISE|PROMO|L[1-3]|M[12]|S\d{1,2})\b/i.test(l);

// Code matière : un seul "mot" majuscules + chiffres (ex. "DIOANG3D", "I2GSIM07", "22_ING2_STAT")
const isCode = s => !/\s/.test(s) && /\d/.test(s) && /[A-Z]/i.test(s) &&
                    /^[A-Z0-9_\-.\/]{4,}$/i.test(s) && !/[a-zà-ÿ]{3,}/.test(s);

// Retire les codes d'un intitulé :
// "Anglais DIOANG3D", "Statistiques [I2GSIM07]", "I2GSIM07 - Statistiques"… → le nom seul
function cleanName(s) {
  if (RENAME[s]) return RENAME[s];
  let out = s.replace(/\s*[\[(]([^\])]*)[\])]\s*/g, (m, inner) => isCode(inner.trim()) ? " " : m).trim();
  out = out.split(/\s+[-–]\s+/).filter(p => !isCode(p.trim())).join(" - ").trim();
  const words = out.split(" ");
  while (words.length > 1 && isCode(words[words.length - 1])) words.pop();   // code collé à la fin
  while (words.length > 1 && isCode(words[0])) words.shift();               // code collé au début
  out = words.join(" ");
  if (RENAME[out]) return RENAME[out];
  return isCode(out) ? "" : out;
}

// Candidats matière d'un cours : champ "modules" + lignes de la description
function candidates(e, category) {
  return [...(e.modules || []).map(decode), ...splitLines(e)]
    .filter(l => l && l !== category && !isRoom(l) && !isStaff(l));
}

// Intitulés présents dans la majorité des cours = groupe/promo, pas une matière
function frequentLines(data) {
  const count = {};
  data.forEach(e => new Set(candidates(e, "").map(cleanName)).forEach(l => count[l] = (count[l] || 0) + 1));
  // En semaine creuse (vacances, semaine d'examens) il reste peu de cours : on exige
  // alors qu'un intitulé soit présent PARTOUT pour le considérer comme un groupe/promo.
  const min = data.length >= 4 ? 0.5 : 1;
  return new Set(Object.keys(count).filter(l => data.length >= 2 && count[l] / data.length >= min));
}

// CELCAT renvoie normalement "#RRGGBB". Une valeur exotique ("rgb(...)", "", un nom
// de couleur) ferait échouer new Color() et, avec lui, tout le rendu du widget :
// on ne garde que ce qui est sûr.
const HEX_RE = /^#?(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const DEFAULT_COLOR = "#0A84FF";

function hexColor(v) {
  const s = String(v == null ? "" : v).trim();
  if (!HEX_RE.test(s)) return DEFAULT_COLOR;
  return s.startsWith("#") ? s : "#" + s;
}

// Vert = « en cours » (carte verte) : aucun autre cours ne doit s'y confondre.
const NOT_GREEN = "#AF52DE";     // violet système iOS

function isGreen(hex) {
  let h = hex.replace("#", "");
  if (h.length <= 4) h = h.split("").map(c => c + c).join("");       // #RGB(A) → #RRGGBB(AA)
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  if (max < 0.2 || (max - min) / max < 0.25) return false;          // presque noir ou grisâtre
  const hue = max === g ? 60 * ((b - r) / (max - min) + 2)
            : max === r ? 60 * (((g - b) / (max - min) + 6) % 6)
            : 60 * ((r - g) / (max - min) + 4);
  return hue >= 70 && hue <= 170;                                     // du vert-jaune au vert d'eau
}

const courseColor = hex => isGreen(hex) ? NOT_GREEN : hex;

function parse(e, frequent) {
  const lines = splitLines(e);
  const category = decode(e.eventCategory || lines[0] || "");
  const room = shortRoom(lines.find(isRoom) || (e.sites || []).map(decode).join(", "));
  const staff = lines.filter(l => l !== category && isStaff(l)).join(", ");

  // Matière : on nettoie les codes, on note chaque candidat, le meilleur gagne
  const score = l => (/[a-zà-ÿ]/.test(l) ? 3 : 0) - (frequent.has(l) ? 4 : 0) - (looksLikeGroup(l) ? 2 : 0);
  const names = [...new Set(candidates(e, category).map(cleanName).filter(Boolean))]
                  .sort((a, b) => score(b) - score(a));
  let module = names[0] || "";
  const esc = category.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  module = module.replace(new RegExp(`^${esc}\\s*[-:]\\s*`), "");

  const type = TYPE_COLORS.find(t => t.re.test(category));
  const start = parseDate(e.start);
  let end = e.end ? parseDate(e.end) : null;
  if (!end || isNaN(end) || end < start) end = new Date(start.getTime() + 3600000);
  // Journée entière (férié, vacances, journée d'intégration…) : pas d'horaire à afficher,
  // et surtout pas de rappel « dans 10 min » à minuit.
  const allDay = e.allDay === true || !e.end || (+end - +start) >= 20 * 3600000;
  return {
    key: e.id != null ? String(e.id) : `${e.start}|${module}`,   // identifiant stable du cours
    start, end, allDay,
    title: module ? (category ? `${category} - ${module}` : module) : (category || "Cours"),
    module: module || category || "Cours", category,
    staff, room,
    cancelled: isCancelled(category, lines),
    color: courseColor(type ? type.color : hexColor(e.backgroundColor)),
  };
}

// Cours annulé : CELCAT l'indique dans le type ou la description ("Annulé", "Annulation", "Cancelled"…)
function isCancelled(category, lines) {
  return /annul|cancel/i.test(category) || lines.some(l => /\bannul|\bcancel/i.test(l));
}

// Cours masqué par l'utilisateur (voir HIDE)
function isHidden(e) {
  return HIDE.some(h => h instanceof RegExp
    ? h.test(e.title)
    : [e.module, e.category].some(s => s.toLowerCase().includes(String(h).toLowerCase())));
}

// Cours sans date de début lisible : ignoré (sinon "NaN:NaN", tri et grille cassés)
const parseAll = data => {
  const ok = data.filter(e => e && !isNaN(parseDate(e.start)));
  const f = frequentLines(ok);
  return ok.map(e => parse(e, f)).filter(e => !isHidden(e));
};

// ---------- carte de cours ----------
// Bandeau fin pour un événement "journée entière" (férié, vacances, journée d'intégration…)
function addAllDayBanner(w, e, fam) {
  const color = new Color(e.color, 1);
  const b = w.addStack();
  b.layoutHorizontally();
  b.centerAlignContent();
  b.backgroundColor = new Color(e.color, 0.16);
  b.cornerRadius = 7;
  b.setPadding(4, 8, 4, 8);
  const t = b.addText(e.title);
  t.font = STYLE.bold(fam === "small" ? 10 : 11);
  t.textColor = color;
  t.lineLimit = 1; t.minimumScaleFactor = 0.7;
  b.addSpacer();
  const d = b.addText("journée");
  d.font = STYLE.font(fam === "small" ? 9 : 10);
  d.textColor = STYLE.muted;
  d.lineLimit = 1;
}

function addCard(w, e, mode, now) {
  const done = e.end <= now || e.cancelled;
  const live = !e.cancelled && e.start <= now && e.end > now;
  const accent = new Color(e.color, done ? 0.35 : 1);
  const op = done ? 0.4 : 1;

  // En cours : surligné en vert (la barre garde la couleur TD/CM). Passé ou annulé : grisé.
  const card = w.addStack();
  card.layoutHorizontally();
  card.centerAlignContent();
  card.backgroundColor = live ? STYLE.nowBg : STYLE.card;
  card.cornerRadius = mode === "mini" ? 8 : 11;
  card.borderColor = live ? STYLE.now : accent;
  card.borderWidth = live ? 2 : 1.5;
  card.setPadding(5, 6, 5, mode === "mini" ? 6 : 10);
  const titleColor = live ? STYLE.now : STYLE.text;

  const h = { full: 44, compact: 30, dense: 22, mini: 28 }[mode];
  const bar = card.addStack();
  bar.size = new Size(3, h);
  bar.backgroundColor = accent;
  bar.cornerRadius = 1.5;
  card.addSpacer(mode === "mini" ? 6 : 8);

  const txt = (stack, s, font, color, opacity = op) => {
    const t = stack.addText(s);
    t.font = font; t.textColor = color; t.textOpacity = opacity;
    t.lineLimit = 1; t.minimumScaleFactor = 0.75;
    return t;
  };

  // Petit widget : tout à gauche, horaires sur la 2e ligne
  if (mode === "mini") {
    const col = card.addStack();
    col.layoutVertically();
    txt(col, e.title, STYLE.bold(11), titleColor);
    if (e.cancelled) txt(col, `Annulé · ${hm(e.start)}–${hm(e.end)}`, STYLE.bold(10), STYLE.cancel, 1);
    else txt(col, [`${hm(e.start)}–${hm(e.end)}`, e.room].filter(Boolean).join(" · "), STYLE.font(10), STYLE.sub);
    card.addSpacer();
    return;
  }

  // Widget moyen à 3 cours : tout sur une ligne — heure, matière, puis salle à droite
  if (mode === "dense") {
    txt(card, hm(e.start), STYLE.font(11), STYLE.text);
    card.addSpacer(6);
    txt(card, e.title, STYLE.bold(11.5), titleColor).minimumScaleFactor = 0.6;
    card.addSpacer();
    if (e.cancelled) txt(card, "Annulé", STYLE.bold(10), STYLE.cancel, 1);
    else if (e.room) txt(card, e.room, STYLE.font(10), STYLE.sub);
    return;
  }

  // Horaires : début en haut, fin en bas (comme l'app)
  const time = card.addStack();
  time.layoutVertically();
  time.size = new Size(38, h);
  txt(time, hm(e.start), STYLE.font(12), STYLE.text);
  time.addSpacer();
  txt(time, hm(e.end), STYLE.font(12), STYLE.text);
  card.addSpacer(6);

  // Infos alignées à droite
  const col = card.addStack();
  col.layoutVertically();
  const lines = e.cancelled
    ? [[e.title, STYLE.bold(12)], ["Annulé", STYLE.bold(10.5), STYLE.cancel, 1]]
    : mode === "full"
    ? [[e.title, STYLE.bold(12)], [e.staff, STYLE.font(10.5)], [e.room, STYLE.font(10.5)]]
    : [[e.title, STYLE.bold(12)], [[e.staff, e.room].filter(Boolean).join(" · "), STYLE.font(10.5)]];
  lines.forEach(([s, f, color, opacity], i) => {
    if (!s) return;
    const row = col.addStack();
    row.addSpacer();
    txt(row, s, f, color || (i === 0 ? titleColor : STYLE.sub), opacity);
  });
}

// ---------- carte "live" (petit widget) ----------
// Chaque carte : matière + heure · salle.
// 1re carte : + une ligne d'état ("En cours · fin 11:45" ou compte à rebours < 1 h).
function addLiveCard(w, e, now, first) {
  const inProgress = !e.cancelled && e.start <= now;
  const soon = SHOW_COUNTDOWN && !e.cancelled && !inProgress && e.start - now <= 60 * 60000;
  const status = first && (inProgress || soon);
  const accent = new Color(e.color, e.cancelled ? 0.35 : 1);

  const card = w.addStack();
  card.layoutHorizontally();
  card.centerAlignContent();
  card.backgroundColor = inProgress ? STYLE.nowBg : STYLE.card;
  card.cornerRadius = 9;
  card.borderColor = inProgress ? STYLE.now : accent;
  card.borderWidth = inProgress ? 2 : 1.5;
  card.setPadding(5, 6, 5, 6);

  const bar = card.addStack();
  bar.size = new Size(3, status ? 40 : 28);
  bar.backgroundColor = accent;
  bar.cornerRadius = 1.5;
  card.addSpacer(6);

  const col = card.addStack();
  col.layoutVertically();
  const txt = (stack, s, font, color, opacity = 1) => {
    const t = stack.addText(s);
    t.font = font; t.textColor = color; t.textOpacity = opacity;
    t.lineLimit = 1; t.minimumScaleFactor = 0.7;
    return t;
  };

  const op = e.cancelled ? 0.4 : 1;
  txt(col, e.title, STYLE.bold(11), STYLE.text, op);
  const row = col.addStack();
  row.centerAlignContent();
  txt(row, `${hm(e.start)} ·`, STYLE.font(10), STYLE.sub, op);
  row.addSpacer(3);
  if (e.cancelled) txt(row, "Annulé", STYLE.bold(10), STYLE.cancel);
  else txt(row, e.room || "—", STYLE.bold(10), STYLE.text);

  if (status) {
    const st = col.addStack();
    st.centerAlignContent();
    if (inProgress) {
      txt(st, `En cours · fin ${hm(e.end)}`, STYLE.font(10), STYLE.now);
    } else {
      // Moins d'1 h avant le cours : compte à rebours
      txt(st, "dans", STYLE.font(10), STYLE.sub);
      st.addSpacer(3);
      const d = st.addDate(e.start);       // géré par iOS → se met à jour en direct
      d.applyTimerStyle();
      d.font = STYLE.font(10); d.textColor = STYLE.sub;
      d.lineLimit = 1; d.leftAlignText();
    }
  }
  card.addSpacer();
}

// ---------- widget ----------
function buildWidget(events, fam, stale, error, offset = 0) {
  const now = new Date();
  const sorted = events.slice().sort((a, b) => a.start - b.start);

  // Mode live : un cours disparaît HIDE_AFTER_MIN minutes après son début
  const live = LIVE_FAMILIES.includes(fam) && offset === 0;
  const hideAt = e => new Date(e.start.getTime() + HIDE_AFTER_MIN * 60000);
  const visible = e => e.end > now && (!live || hideAt(e) > now);

  // Aujourd'hui s'il reste des cours (non annulés), sinon le prochain jour avec cours
  const nextEvent = sorted.find(e => !e.allDay && visible(e) && !e.cancelled);
  let targetDay = nextEvent ? ymd(nextEvent.start) : ymd(now);
  // Paramètre "1", "2"… : Nᵉ jour de cours suivant (pour naviguer dans une pile de widgets)
  if (offset > 0) {
    const days = [...new Set(sorted.filter(e => !e.cancelled && !e.allDay).map(e => ymd(e.start)))].filter(d => d > targetDay);
    targetDay = days[offset - 1] || null;
  }
  const onTarget = targetDay ? sorted.filter(e => ymd(e.start) === targetDay) : [];
  const allDayEvents = onTarget.filter(e => e.allDay && !e.cancelled);
  const dayEvents = onTarget.filter(e => !e.allDay);

  const max = { small: 2, medium: 3, large: 6, extraLarge: 8 }[fam] ?? 6;
  let shown;
  if (live) {
    shown = dayEvents.filter(visible).slice(0, max);
  } else {
    let from = 0;
    if (dayEvents.length > max) {
      const idx = dayEvents.findIndex(e => e.end > now);
      from = Math.min(Math.max(idx, 0), dayEvents.length - max);
    }
    shown = dayEvents.slice(from, from + max);
  }
  // "dense" : widget moyen à 3 cours — une seule ligne par cours, sinon ça ne rentre pas
  const mode = live ? "live" : fam === "small" ? "mini"
             : fam === "medium" ? (shown.length >= 3 ? "dense" : "compact")
             : shown.length >= 5 ? "compact" : "full";
  const big = fam === "large" || fam === "extraLarge";

  const w = new ListWidget();
  w.backgroundColor = STYLE.bg;
  const p = fam === "small" ? 10 : 12;
  w.setPadding(p, p, p, p);
  // Toucher le widget ouvre CELCAT (pas en démo : aucun numéro étudiant, la page serait vide)
  if (!DEMO) w.url = `${BASE}/cal?vt=agendaDay&dt=${targetDay || ymd(now)}&et=student&fid0=${enc(FID)}`;

  // En-tête
  const dayDate = dayEvents[0] ? dayEvents[0].start : now;
  const label = targetDay ? dayLabel(dayDate) : "Plus tard";
  const head = w.addStack();
  head.centerAlignContent();
  const h1 = head.addText(label);
  h1.font = STYLE.bold(fam === "small" ? 13 : 15);
  h1.textColor = STYLE.text;
  h1.lineLimit = 1; h1.minimumScaleFactor = 0.8;
  if (fam !== "small" && (label === "Aujourd'hui" || label === "Demain")) {
    head.addSpacer(6);
    const h2 = head.addText(fmtDate(dayDate, "EEE d MMM"));
    h2.font = STYLE.font(12); h2.textColor = STYLE.muted;
  }
  // Mode live : les cours passés sont masqués → on le précise
  if (live && label === "Aujourd'hui") {
    head.addSpacer(5);
    const h3 = head.addText("· à venir");
    h3.font = STYLE.font(fam === "small" ? 11 : 12); h3.textColor = STYLE.muted;
    h3.lineLimit = 1;
  }
  head.addSpacer();
  if (stale) {
    const s = head.addText(staleLabel());
    s.font = STYLE.font(9); s.textColor = staleColor();
  } else if (fam !== "small" && dayEvents.some(e => !e.cancelled)) {
    const c = head.addText(`${dayEvents.filter(e => !e.cancelled).length} cours`);
    c.font = STYLE.font(11); c.textColor = STYLE.muted;
  }
  w.addSpacer(live ? 6 : 8);

  // Journées entières (férié, vacances…) : un bandeau, pas une carte de cours
  allDayEvents.slice(0, 2).forEach(e => {
    addAllDayBanner(w, e, fam);
    w.addSpacer(live ? 4 : 5);
  });

  // Cours
  if (!shown.length) {
    const n = w.addText(error && !events.length ? `⚠️ ${error}`
                        : targetDay ? "Pas de cours 🎉" : "Pas d'autres cours prévus");
    n.font = STYLE.font(13); n.textColor = STYLE.muted;
    w.addSpacer();
  } else {
    shown.forEach((e, i) => {
      if (i > 0) {
        w.addSpacer(mode === "mini" || live ? 4 : 5);
        const prev = shown[i - 1];
        const gap = (e.start - prev.end) / 60000;
        // Pause déjeuner : juste un espace plus grand entre le matin et l'après-midi
        if (big && gap >= 45 && prev.end.getHours() >= 11 && prev.end.getHours() <= 13) {
          w.addSpacer(22);
        }
      }
      if (live) addLiveCard(w, e, now, i === 0);
      else addCard(w, e, mode, now);
    });
    w.addSpacer();
  }

  // Rafraîchit au prochain changement (début, +30 min en mode live, fin) – voir nextRefresh
  const edges = dayEvents.flatMap(e => live
      ? [...(SHOW_COUNTDOWN ? [new Date(e.start.getTime() - 60 * 60000)] : []), e.start, hideAt(e), e.end]  // -1 h : début du compte à rebours
      : [e.start, e.end]);
  w.refreshAfterDate = nextRefresh(edges);
  return w;
}

// ---------- vue semaine (grand widget, paramètre "semaine") ----------
// Taille du grand widget selon l'iPhone (valeurs Apple, arrondies vers le bas)
function largeWidgetSize() {
  const s = Device.screenSize();
  const sw = Math.min(s.width, s.height);
  if (sw >= 428) return new Size(364, 382);
  if (sw >= 414) return new Size(348, 357);
  if (sw >= 390) return new Size(338, 354);
  if (sw >= 375) return new Size(321, 324);
  return new Size(292, 311);
}

// Trait "maintenant" : seulement s'il tombe dans un trou de l'emploi du temps —
// pendant un cours, la carte verte "en cours" dit déjà où on en est.
function addNowLine(col, width) {
  const l = col.addStack();
  l.size = new Size(width, 1.5);
  l.backgroundColor = STYLE.nowLine;
  l.cornerRadius = 0.75;
}

function addWeekBlock(col, e, width, height, now) {
  const done = e.end <= now || e.cancelled;
  const live = !e.cancelled && e.start <= now && e.end > now;
  const op = done ? 0.4 : 1;

  const b = col.addStack();
  b.size = new Size(width, height);
  b.layoutVertically();
  b.backgroundColor = live ? STYLE.nowBg : new Color(e.color, done ? 0.08 : 0.2);
  b.borderColor = live ? STYLE.now : new Color(e.color, done ? 0.3 : 0.9);
  b.borderWidth = live ? 1.5 : 1;
  b.cornerRadius = 5;
  b.setPadding(2, 3, 2, 2);

  const t = b.addText(e.module);
  t.font = STYLE.bold(8); t.textColor = live ? STYLE.now : STYLE.text; t.textOpacity = op;
  t.lineLimit = height >= 30 ? 2 : 1; t.minimumScaleFactor = 0.8;
  if (height >= 24 && (e.room || e.cancelled)) {
    const r = b.addText(e.cancelled ? "Annulé" : e.room);
    r.font = e.cancelled ? STYLE.bold(7) : STYLE.font(7);
    r.textColor = e.cancelled ? STYLE.cancel : STYLE.sub; r.textOpacity = e.cancelled ? 1 : op;
    r.lineLimit = 1; r.minimumScaleFactor = 0.7;
  }
  b.addSpacer();
}

// Cours qui se chevauchent (deux groupes, TP en parallèle…) : côte à côte.
// Au-delà de MAX_LANES colonnes, les dernières sont résumées en « +N » : à 3 colonnes,
// chacune ne fait plus que ~17 pt et les noms deviennent illisibles.
const MAX_LANES = 2;
const LANE_GAP = 2;

// Placement vertical des cours d'une journée, en points depuis le haut de la grille.
// Les cours qui se chevauchent forment un groupe ; chaque cours du groupe va dans
// la 1re colonne (lane) libre. Retourne [{ top, h, lanes: [[{ e, y, h }]], more }],
// où y est relatif au haut du groupe. y(date) → position dans la grille.
function layoutDay(evts, y, gridH) {
  const sorted = evts.slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const out = [];
  let cursor = 0;
  for (let i = 0; i < sorted.length;) {
    const group = [sorted[i]];
    let end = sorted[i].end;
    for (i++; i < sorted.length && sorted[i].start < end; i++) {
      group.push(sorted[i]);
      if (sorted[i].end > end) end = sorted[i].end;
    }
    const top = Math.max(y(group[0].start), cursor);
    const h = Math.min(Math.max(10, y(end) - top), gridH - top);   // jamais plus bas que la grille
    if (h <= 0) continue;

    const lanes = [];
    for (const e of group) {
      let lane = lanes.find(l => l[l.length - 1].end <= e.start);
      if (!lane) lanes.push(lane = []);
      lane.push(e);
    }
    let shown = lanes, more = 0;
    if (lanes.length > MAX_LANES) {
      shown = lanes.slice(0, MAX_LANES - 1);
      more = lanes.slice(MAX_LANES - 1).reduce((n, l) => n + l.length, 0);
    }
    const placed = shown.map(lane => {
      let c = 0;
      return lane.map(e => {
        const t = Math.max(y(e.start) - top, c);
        const eh = Math.min(Math.max(10, y(e.end) - top - t), h - t);
        c = t + Math.max(eh, 0);
        return { e, y: t, h: eh };
      }).filter(p => p.h > 0);
    });
    out.push({ top, h, lanes: placed, more });
    cursor = top + h;
  }
  return out;
}

// Groupe de cours simultanés : une rangée de sous-colonnes de hauteur fixe
function addWeekGroup(col, g, width, now) {
  const n = g.lanes.length + (g.more ? 1 : 0);
  const laneW = Math.floor((width - (n - 1) * LANE_GAP) / n);
  const row = col.addStack();
  row.layoutHorizontally();
  row.topAlignContent();
  row.size = new Size(width, g.h);
  g.lanes.forEach((lane, k) => {
    if (k) row.addSpacer(LANE_GAP);
    const lc = row.addStack();
    lc.layoutVertically();
    lc.size = new Size(laneW, g.h);
    let c = 0;
    for (const p of lane) {
      if (p.y > c) lc.addSpacer(p.y - c);
      addWeekBlock(lc, p.e, laneW, p.h, now);
      c = p.y + p.h;
    }
    if (g.h - c > 0) lc.addSpacer(g.h - c);   // taille exacte, comme la colonne du jour
  });
  if (g.more) {
    row.addSpacer(LANE_GAP);
    const m = row.addStack();
    m.size = new Size(laneW, g.h);
    m.layoutVertically();
    m.backgroundColor = STYLE.todayCol;
    m.cornerRadius = 5;
    m.setPadding(2, 2, 2, 2);
    const t = m.addText(`+${g.more}`);
    t.font = STYLE.bold(8); t.textColor = STYLE.sub;
    t.lineLimit = 1; t.minimumScaleFactor = 0.7;
    m.addSpacer();
  }
}

function buildWeekWidget(events, stale, error, weekOffset = 0) {
  const now = new Date();
  const sorted = events.slice().sort((a, b) => a.start - b.start);
  const plus7 = d => { const m = new Date(d); m.setDate(m.getDate() + 7); return m; };
  const mins = d => d.getHours() * 60 + d.getMinutes();

  // Semaine en cours, ou la suivante s'il ne reste plus de cours cette semaine
  let monday = mondayOf(now);
  if (!sorted.some(e => !e.cancelled && !e.allDay && e.end > now && e.start < plus7(monday))) monday = plus7(monday);
  for (let i = 0; i < weekOffset; i++) monday = plus7(monday);
  const inWeek = sorted.filter(e => e.start >= monday && e.start < plus7(monday));
  const weekEvents = inWeek.filter(e => !e.allDay);          // la grille n'affiche que les cours horodatés
  const allDayByDay = new Map();                             // jour → événement journée entière (férié…)
  inWeek.filter(e => e.allDay && !e.cancelled).forEach(e => allDayByDay.set(ymd(e.start), e));

  // Lun → ven (+ sam/dim s'il y a cours)
  const nDays = weekEvents.some(e => e.start.getDay() === 0) ? 7
              : weekEvents.some(e => e.start.getDay() === 6) ? 6 : 5;
  const days = [...Array(nDays)].map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });

  // Plage horaire affichée (heures pleines)
  let startMin = 8 * 60, endMin = 18 * 60;
  if (weekEvents.length) {
    startMin = Math.floor(Math.min(...weekEvents.map(e => mins(e.start))) / 60) * 60;
    endMin = Math.ceil(Math.max(...weekEvents.map(e => mins(e.end))) / 60) * 60;
    endMin = Math.max(endMin, startMin + 60);   // cours de durée nulle / finissant après minuit
  }

  // Géométrie
  const pad = 12, headH = 20, dayH = 14, axisW = 16, gap = 3;
  const size = largeWidgetSize();
  const innerW = size.width - 2 * pad;
  const gridH = size.height - 2 * pad - headH - 6 - dayH - 4;
  const colW = Math.floor((innerW - axisW - nDays * gap) / nDays);
  const scale = gridH / (endMin - startMin);

  const w = new ListWidget();
  w.backgroundColor = STYLE.bg;
  w.setPadding(pad, pad, pad, pad);
  if (!DEMO) w.url = `${BASE}/cal?vt=agendaWeek&dt=${ymd(monday)}&et=student&fid0=${enc(FID)}`;

  // En-tête
  const head = w.addStack();
  head.size = new Size(innerW, headH);
  head.centerAlignContent();
  const h1 = head.addText(`Semaine du ${fmtDate(monday, "d MMM")}`);
  h1.font = STYLE.bold(15); h1.textColor = STYLE.text;
  head.addSpacer();
  const h2 = head.addText(stale ? staleLabel() : `${weekEvents.filter(e => !e.cancelled).length} cours`);
  h2.font = STYLE.font(stale ? 9 : 11); h2.textColor = stale ? staleColor() : STYLE.muted;
  w.addSpacer(6);

  // Ligne des jours
  const dh = w.addStack();
  dh.layoutHorizontally();
  dh.addSpacer(axisW);
  days.forEach(d => {
    dh.addSpacer(gap);
    const isToday = ymd(d) === ymd(now);
    const off = allDayByDay.get(ymd(d));     // férié / vacances : la colonne est teintée
    const c = dh.addStack();
    c.size = new Size(colW, dayH);
    c.centerAlignContent();
    if (isToday) { c.backgroundColor = STYLE.text; c.cornerRadius = 4; }
    else if (off) { c.backgroundColor = new Color(off.color, 0.16); c.cornerRadius = 4; }
    c.addSpacer();
    const t = c.addText(`${cap(fmtDate(d, "EEE").replace(".", ""))} ${d.getDate()}`);
    t.font = isToday || off ? STYLE.bold(9) : STYLE.font(9);
    t.textColor = isToday ? STYLE.bg : off ? new Color(off.color, 1)
                : (d < mondayOf(now) || (ymd(d) < ymd(now)) ? STYLE.muted : STYLE.sub);
    t.lineLimit = 1; t.minimumScaleFactor = 0.8;
    c.addSpacer();
  });
  w.addSpacer(4);

  // Grille : axe des heures + une colonne par jour
  const grid = w.addStack();
  grid.layoutHorizontally();
  grid.topAlignContent();

  const axis = grid.addStack();
  axis.layoutVertically();
  axis.size = new Size(axisW, gridH);
  for (let m = startMin; m < endMin; m += 60) {
    const cell = axis.addStack();
    cell.layoutVertically();
    cell.size = new Size(axisW, 60 * scale);
    const t = cell.addText(`${m / 60}h`);
    t.font = STYLE.font(7); t.textColor = STYLE.muted; t.lineLimit = 1;
    cell.addSpacer();
  }

  days.forEach(d => {
    grid.addSpacer(gap);
    const col = grid.addStack();
    col.layoutVertically();
    col.size = new Size(colW, gridH);
    if (ymd(d) === ymd(now)) { col.backgroundColor = STYLE.todayCol; col.cornerRadius = 5; }

    // Position du trait "maintenant" dans cette colonne (aujourd'hui uniquement)
    const nowY = ymd(d) === ymd(now) && mins(now) >= startMin && mins(now) < endMin
               ? Math.round((mins(now) - startMin) * scale) : -1;
    let cursor = 0, nowDrawn = false;
    // Insère le trait s'il tombe dans l'espace libre qu'on s'apprête à ajouter
    const spacerTo = y => {
      if (y <= cursor) return;
      if (nowY >= cursor && nowY < y - 1.5 && !nowDrawn) {
        if (nowY > cursor) col.addSpacer(nowY - cursor);
        addNowLine(col, colW);
        nowDrawn = true;
        col.addSpacer(y - nowY - 1.5);
      } else {
        col.addSpacer(y - cursor);
      }
      cursor = y;
    };

    const toY = t => Math.round((mins(t) - startMin) * scale);
    for (const g of layoutDay(weekEvents.filter(e => ymd(e.start) === ymd(d)), toY, gridH)) {
      spacerTo(g.top);
      if (g.lanes.length === 1 && !g.more && g.lanes[0].length === 1) addWeekBlock(col, g.lanes[0][0].e, colW, g.h, now);
      else addWeekGroup(col, g, colW, now);
      cursor = g.top + g.h;
    }
    // Plus aucun cours après l'heure actuelle : le trait va après la dernière carte
    if (nowY >= cursor && !nowDrawn && nowY < gridH - 1.5) {
      if (nowY > cursor) col.addSpacer(nowY - cursor);
      addNowLine(col, colW);
      nowDrawn = true;
      cursor = nowY + 1.5;
    }
    // Espace restant EXACT (un spacer flexible a une taille mini sous iOS : quand les cours
    // vont jusqu'en bas, la colonne déborde et iOS la recentre → tout remonte de quelques points)
    if (gridH - cursor > 0) col.addSpacer(gridH - cursor);
  });

  if (!weekEvents.length) {
    w.addSpacer(4);
    // Au-delà des DAYS_AHEAD jours téléchargés : on ne sait pas, ce n'est pas « pas de cours »
    const beyond = !DEMO && monday >= fetchWindow().end;
    const n = w.addText(error && !events.length ? `⚠️ ${error}`
                        : beyond ? `Semaine hors période : seuls les ${DAYS_AHEAD} prochains jours sont téléchargés.`
                        : "Pas de cours cette semaine 🎉");
    n.font = STYLE.font(12); n.textColor = STYLE.muted;
  }
  w.addSpacer();

  // Rafraîchit au prochain début/fin de cours – voir nextRefresh
  w.refreshAfterDate = nextRefresh(weekEvents.flatMap(e => [e.start, e.end]));
  return w;
}

// ---------- changements, rappels, calendrier ----------
const NOTIFIED = fm.joinPath(fm.documentsDirectory(), "celcat_notified.json");
const REMIND_PREFIX = "celcat-rappel|";
const MAX_REMINDERS = 30;        // iOS n'accepte que 64 notifications en attente pour toute l'app Scriptable
const whenStr = d => `${cap(fmtDate(d, "EEE d").replace(".", ""))} ${hm(d)}`;   // "Jeu 24 13:00"
const dayUrl = d => `${BASE}/cal?vt=agendaDay&dt=${ymd(d)}&et=student&fid0=${enc(FID)}`;

// Compare l'ancien téléchargement (brut) au nouveau (déjà analysé) → changements lisibles
function diffSchedules(prevRaw, nextEvents, prevUntil, nextUntil) {
  const now = new Date();
  // On ne compare que ce que les deux versions couvrent, dans les CHANGES_DAYS prochains jours
  const limit = Math.min(now.getTime() + CHANGES_DAYS * 86400000, prevUntil || Infinity, nextUntil || Infinity);
  const inScope = e => e && e.start > now && e.start.getTime() < limit;
  const P = new Map(parseAll(prevRaw).map(e => [e.key, e]));
  const N = new Map(nextEvents.map(e => [e.key, e]));
  const changes = [], removed = [], added = [];

  for (const [k, p] of P) {
    const n = N.get(k);
    if (!n) { if (inScope(p) && !p.cancelled) removed.push(p); continue; }
    if (!inScope(p) && !inScope(n)) continue;
    if (!p.cancelled && n.cancelled) { changes.push(`❌ ${n.module} ${whenStr(n.start)} : annulé`); continue; }
    if (p.cancelled && !n.cancelled) changes.push(`✅ ${n.module} ${whenStr(n.start)} : rétabli`);
    if (+p.start !== +n.start || +p.end !== +n.end)
      changes.push(`🕒 ${n.module} : ${whenStr(p.start)} → ${whenStr(n.start)}–${hm(n.end)}`);
    if (p.room !== n.room && !n.cancelled)
      changes.push(`📍 ${n.module} ${whenStr(n.start)} : ${p.room || "?"} → ${n.room || "?"}`);
  }
  for (const [k, n] of N) if (!P.has(k) && inScope(n) && !n.cancelled) added.push(n);

  // Un cours retiré + un cours ajouté de la même matière = cours déplacé
  for (const r of removed.slice()) {
    const i = added.findIndex(a => a.module === r.module && a.category === r.category);
    if (i < 0) continue;
    const a = added.splice(i, 1)[0];
    removed.splice(removed.indexOf(r), 1);
    changes.push(`🕒 ${a.module} : ${whenStr(r.start)} → ${whenStr(a.start)}` + (a.room !== r.room ? ` · ${a.room}` : ""));
  }
  removed.forEach(r => changes.push(`❌ ${r.module} ${whenStr(r.start)} : retiré de l'emploi du temps`));
  added.forEach(a => changes.push(`➕ ${a.title} ${whenStr(a.start)}${a.room ? " · " + a.room : ""}`));
  return changes;
}

// Envoie une notification (une seule fois par changement, même avec plusieurs widgets)
async function notifyChanges(changes) {
  if (!changes.length) return;
  let seen = {};
  try { if (fm.fileExists(NOTIFIED)) seen = JSON.parse(fm.readString(NOTIFIED)); } catch (e) {}
  const nowMs = Date.now();
  for (const k of Object.keys(seen)) if (nowMs - seen[k] > 7 * 86400000) delete seen[k];
  const fresh = changes.filter(c => !(c in seen));
  if (!fresh.length) return;
  fresh.forEach(c => seen[c] = nowMs);
  fm.writeString(NOTIFIED, JSON.stringify(seen));

  const n = new Notification();
  n.title = fresh.length === 1 ? "Emploi du temps modifié" : `${fresh.length} changements dans ton emploi du temps`;
  n.body = fresh.slice(0, 5).join("\n") + (fresh.length > 5 ? "\n…" : "");
  n.threadIdentifier = "celcat-changements";
  n.sound = "default";
  n.openURL = `${BASE}/cal?vt=agendaWeek&dt=${ymd(new Date())}&et=student&fid0=${enc(FID)}`;
  await n.schedule();
}

// Rappels avant chaque cours (5 prochains jours) ; supprimés/remplacés si le cours change
async function scheduleReminders(events) {
  const pending = await Notification.allPending();
  const ours = pending.map(n => n.identifier || "").filter(id => id.startsWith(REMIND_PREFIX));
  const now = Date.now(), horizon = now + 5 * 86400000;
  const wanted = new Map();
  if (REMIND_BEFORE_MIN > 0) {
    const due = events
      .filter(e => !e.cancelled && !e.allDay)
      .map(e => ({ e, at: e.start.getTime() - REMIND_BEFORE_MIN * 60000 }))
      .filter(({ at }) => at > now && at <= horizon)
      .sort((a, b) => a.at - b.at)
      .slice(0, MAX_REMINDERS);   // iOS limite les notifications en attente, partagées avec les autres scripts
    // la salle fait partie de l'identifiant → un changement de salle remplace le rappel
    for (const { e, at } of due) wanted.set(`${REMIND_PREFIX}${e.key}|${e.start.getTime()}|${e.room}`, { e, at });
  }
  const obsolete = ours.filter(id => !wanted.has(id));
  if (obsolete.length) await Notification.removePending(obsolete);

  for (const [id, { e, at }] of wanted) {
    if (ours.includes(id)) continue;
    const n = new Notification();
    n.identifier = id;
    n.threadIdentifier = "celcat-rappels";
    n.title = `${e.module} dans ${REMIND_BEFORE_MIN} min`;
    n.body = [e.room ? `📍 ${e.room}` : null, e.category, `${hm(e.start)}–${hm(e.end)}`].filter(Boolean).join(" · ");
    n.sound = "default";
    n.setTriggerDate(new Date(at));
    n.openURL = dayUrl(e.start);
    await n.schedule();
  }
}

// Copie les cours dans un calendrier iPhone dédié (création / mise à jour / suppression)
async function syncCalendar(events, from, to) {
  let cal;
  try { cal = await Calendar.forEventsByTitle(CALENDAR_NAME); }
  catch (e) {
    // Créer le calendrier demande l'accès à l'app Calendrier : impossible depuis un widget,
    // qui resterait bloqué sur la demande. Le premier lancement dans Scriptable s'en charge.
    if (config.runsInWidget || config.runsWithSiri) return;
    cal = await Calendar.createForEvents(CALENDAR_NAME);
  }

  const existing = await CalendarEvent.between(from, to, [cal]);
  const byKey = new Map();
  for (const ev of existing) {
    const m = (ev.notes || "").match(/\[celcat:([^\]]+)\]/);
    if (!m) continue;                                      // ajouté à la main : on n'y touche pas
    if (byKey.has(m[1])) { await ev.remove(); continue; }  // doublon
    byKey.set(m[1], ev);
  }

  const keys = new Set();
  const inWindow = events.filter(e => e.start >= from && e.start < to && !keys.has(e.key) && keys.add(e.key));
  // Sécurité : réponse vide alors que le calendrier contient des cours → sûrement un raté du serveur
  if (!inWindow.length && byKey.size > 3) return;

  for (const e of inWindow) {
    const title = (e.cancelled ? "❌ Annulé · " : "") + e.title;
    const notes = [e.staff, `[celcat:${e.key}]`].filter(Boolean).join("\n");
    let ev = byKey.get(e.key);
    byKey.delete(e.key);
    if (ev && ev.title === title && +ev.startDate === +e.start && +ev.endDate === +e.end &&
        !!ev.isAllDayEvent === !!e.allDay &&
        (ev.location || "") === (e.room || "") && (ev.notes || "") === notes) continue;   // inchangé
    if (!ev) { ev = new CalendarEvent(); ev.calendar = cal; }
    ev.title = title;
    ev.isAllDayEvent = !!e.allDay;
    ev.startDate = e.start;
    ev.endDate = e.end;
    ev.location = e.room || "";
    ev.notes = notes;
    try { ev.availability = e.cancelled ? "free" : "busy"; } catch (err) {}
    await ev.save();      // sans await, Script.complete() peut couper avant l'enregistrement
  }
  for (const ev of byKey.values()) await ev.remove();  // n'existe plus dans CELCAT
}

// Après chaque téléchargement : changements, rappels, calendrier (chacun isolé : une erreur
// n'empêche jamais le widget de s'afficher)
async function afterFetch(res, events) {
  const suspicious = !res.data.length && res.prev && res.prev.length >= 4;   // réponse vide anormale
  if (NOTIFY_CHANGES && res.prev && res.prev.length && !suspicious) {
    try { await notifyChanges(diffSchedules(res.prev, events, res.prevUntil, res.until)); }
    catch (e) { console.log("Notifications : " + e); }
  }
  if (!suspicious) {
    try { await scheduleReminders(events); } catch (e) { console.log("Rappels : " + e); }
  }
  if (SYNC_CALENDAR) {
    try { const { start, end } = fetchWindow(); await syncCalendar(events, start, end); }
    catch (e) { console.log("Calendrier : " + e); }
  }
}

// ---------- prochain cours (paramètre "prochain" + écran verrouillé) ----------
function nextClass(events, now) {
  const hideAt = e => e.start.getTime() + HIDE_AFTER_MIN * 60000;
  return events.slice().sort((a, b) => a.start - b.start)
               .find(e => !e.cancelled && !e.allDay && e.end > now && hideAt(e) > now);
}

// "FER FT202" → "FT202" (pour le petit rond de l'écran verrouillé)
const roomCode = r => (r.split(" ").reverse().find(t => /\d/.test(t)) || r).slice(0, 6);

function buildNextWidget(events, fam, stale, error) {
  const now = new Date();
  const e = nextClass(events, now);
  const w = new ListWidget();
  const lock = fam.startsWith("accessory");

  w.refreshAfterDate = nextRefresh(e ? [...(SHOW_COUNTDOWN ? [new Date(e.start.getTime() - 60 * 60000)] : []), e.start,
    new Date(e.start.getTime() + HIDE_AFTER_MIN * 60000), e.end] : []);
  if (!DEMO) w.url = `${BASE}/cal?vt=agendaDay&dt=${ymd(e ? e.start : now)}&et=student&fid0=${enc(FID)}`;
  if (!lock) { w.backgroundColor = STYLE.bg; w.setPadding(12, 12, 12, 12); }

  const text = (stack, s, font, color, lines = 1) => {
    const t = stack.addText(s);
    t.font = font; if (color) t.textColor = color;
    t.lineLimit = lines; t.minimumScaleFactor = 0.7;
    return t;
  };

  if (!e) {
    text(w, error && !events.length ? `⚠️ ${error}` : "Pas de cours prévu",
         lock ? Font.systemFont(13) : STYLE.font(13), lock ? null : STYLE.muted, 2);
    return w;
  }

  const inProgress = e.start <= now;
  const today = ymd(e.start) === ymd(now);
  const soon = SHOW_COUNTDOWN && !inProgress && today && e.start - now <= 60 * 60000;
  const when = today ? hm(e.start) : `${cap(fmtDate(e.start, "EEE").replace(".", ""))} ${hm(e.start)}`;

  // Ligne d'état : "En cours · fin 14:30" / "13:00 · dans 12:34" / "13:00 – 14:30" / "Demain · 08:30"
  const addStatus = (stack, font, color, nowColor) => {
    const row = stack.addStack();
    row.centerAlignContent();
    if (inProgress) { text(row, `En cours · fin ${hm(e.end)}`, font, nowColor); return; }
    if (soon) {
      text(row, `${hm(e.start)} · dans`, font, color);
      row.addSpacer(3);
      const d = row.addDate(e.start);           // compte à rebours mis à jour par iOS
      d.applyTimerStyle(); d.font = font; if (color) d.textColor = color;
      d.lineLimit = 1; d.leftAlignText();
      return;
    }
    text(row, today ? `${hm(e.start)} – ${hm(e.end)}` : `${dayLabel(e.start).split(" ")[0]} · ${hm(e.start)}`, font, color);
  };

  // --- Écran verrouillé : une ligne (au-dessus de l'heure) ---
  if (fam === "accessoryInline") {
    const room = e.room || "Salle ?";
    text(w, inProgress ? `En cours · ${room}` : `${when} · ${room}`, Font.systemFont(12));
    return w;
  }

  // --- Écran verrouillé : rond ---
  if (fam === "accessoryCircular") {
    w.addAccessoryWidgetBackground = true;
    w.addSpacer();
    const t1 = text(w, inProgress ? "En cours" : hm(e.start), Font.boldSystemFont(inProgress ? 10 : 14));
    t1.centerAlignText();
    const t2 = text(w, roomCode(e.room || "—"), Font.systemFont(11));
    t2.centerAlignText();
    w.addSpacer();
    return w;
  }

  // --- Écran verrouillé : rectangle (3 lignes) ---
  if (fam === "accessoryRectangular") {
    addStatus(w, Font.semiboldSystemFont(13), null, null);
    text(w, e.module, Font.systemFont(13));
    text(w, e.room || "Salle ?", Font.boldSystemFont(15));
    return w;
  }

  // --- Écran d'accueil ---
  const accent = new Color(e.color);
  if (inProgress) w.backgroundColor = STYLE.nowBg;

  const head = w.addStack();
  head.centerAlignContent();
  if (e.category) {
    const pill = head.addStack();
    pill.backgroundColor = accent;
    pill.cornerRadius = 4;
    pill.setPadding(1, 5, 1, 5);
    text(pill, e.category, STYLE.bold(9), STYLE.white);
    head.addSpacer(6);
  }
  text(head, inProgress ? "En cours" : "Prochain cours", STYLE.font(11), inProgress ? STYLE.now : STYLE.muted);
  head.addSpacer();
  if (stale) text(head, staleLabel(), STYLE.font(9), staleColor());

  w.addSpacer();                         // infos calées en bas du widget
  text(w, e.module, STYLE.bold(fam === "small" ? 15 : 17), STYLE.text, 2);
  w.addSpacer(2);
  text(w, e.room || "Salle ?", STYLE.bold(fam === "small" ? 24 : 28), inProgress ? STYLE.now : STYLE.text);
  w.addSpacer(4);
  addStatus(w, STYLE.font(12), STYLE.sub, STYLE.now);
  return w;
}

// ---------- mises à jour ----------
// Compare la ligne VERSION du script à celle publiée sur GitHub. Appelé seulement
// depuis le menu (jamais depuis un widget) : une seule requête, déclenchée à la main.
function versionRank(v) {
  return String(v).split(".").map(n => parseInt(n, 10) || 0);
}

function isNewer(remote, local) {
  const a = versionRank(remote), b = versionRank(local);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

async function checkUpdate() {
  const r = request(REPO_RAW);
  const src = await r.loadString();
  const m = src.match(/const VERSION = "([^"]+)"/);
  if (!m) throw new Error("Version introuvable sur GitHub.");
  return { remote: m[1], newer: isNewer(m[1], VERSION) };
}

// ---------- Siri / Raccourcis ----------
// « Dis Siri, <nom du script> » ou action « Exécuter le script » de Raccourcis :
// réponse en texte, réutilisable dans un raccourci. Paramètre du raccourci :
// vide → prochain cours ; "jour" → cours du jour (ou du prochain jour de cours).
function siriNext(events, now) {
  const e = nextClass(events, now);
  if (!e) return "Pas de cours prévu.";
  const where = e.room ? `, salle ${e.room}` : "";
  if (e.start <= now) return `En cours : ${e.module}, jusqu'à ${hm(e.end)}${where}.`;
  const day = ymd(e.start) === ymd(now) ? "aujourd'hui" : dayLabel(e.start).toLowerCase();
  return `Prochain cours : ${e.module}${e.category ? ` (${e.category})` : ""}, ${day} à ${hm(e.start)}${where}.`;
}

function siriDay(events, now) {
  const upcoming = events.filter(e => !e.cancelled && !e.allDay && e.end > now)
                         .sort((a, b) => a.start - b.start);
  if (!upcoming.length) return "Pas de cours prévu.";
  const day = ymd(upcoming[0].start);
  const list = upcoming.filter(e => ymd(e.start) === day)
                       .map(e => `${hm(e.start)} ${e.module}${e.room ? ` (${e.room})` : ""}`);
  return `${dayLabel(upcoming[0].start)} : ${list.join(", ")}.`;
}

// ---------- main ----------
// Paramètre du widget (appui long → Modifier le widget → Parameter) :
//   vide ou 0   → jour actuel (ou prochain jour de cours)
//   1, 2, 3…    → jours de cours suivants (pour une pile de widgets qu'on fait défiler)
//   semaine     → vue semaine (grand widget) ; "semaine 1" → semaine suivante
//   prochain    → uniquement le prochain cours et sa salle
// Écran verrouillé : affiche toujours le prochain cours et sa salle.
let family = config.widgetFamily || "large";
const param = String(args.widgetParameter || "").trim().toLowerCase();
const weekParam = param.match(/^(semaine|week)\s*\+?\s*(\d*)$/);
let view = weekParam ? "week" : /^(prochain|next)$/.test(param) ? "next" : "day";
let offset = weekParam ? (parseInt(weekParam[2], 10) || 0) : (parseInt(param, 10) || 0);
if (family.startsWith("accessory")) view = "next";

// Démo : données fictives, aucun appel réseau, rien d'écrit dans le calendrier,
// aucune notification envoyée (fetched reste faux).
const loadEvents = force => DEMO ? Promise.resolve({ data: DEMO(), stale: false, fetched: false })
                                 : getEvents(force);

if (config.runsWithSiri) {
  let out;
  try {
    const res = await loadEvents(false);
    const events = parseAll(res.data);
    if (res.fetched) await afterFetch(res, events);
    const q = String(args.shortcutParameter || (args.plainTexts || [])[0] || "").toLowerCase();
    out = /jour|today|aujourd/.test(q) ? siriDay(events, new Date()) : siriNext(events, new Date());
    if (res.stale) out += " (données hors ligne)";
  } catch (e) { out = "Emploi du temps indisponible : " + e.message; }
  Script.setShortcutOutput(out);
  Script.complete();
  return;
}

if (!config.runsInWidget && DEMO) {
  // Script de démo : uniquement les aperçus
  const previews = [
    ["Grand widget",      { family: "large",  view: "day" }],
    ["Widget moyen",      { family: "medium", view: "day" }],
    ["Petit widget",      { family: "small",  view: "day" }],
    ["Vue semaine",       { family: "large",  view: "week" }],
    ["Prochain cours",    { family: "small",  view: "next" }],
    ["Écran verrouillé",  { family: "accessoryRectangular", view: "next" }],
  ];
  const menu = new Alert();
  menu.title = "Widget CELCAT · démo";
  menu.message = "Emploi du temps fictif : aucune connexion, aucune notification, rien dans le calendrier.";
  previews.forEach(([label]) => menu.addAction(label));
  menu.addCancelAction("Fermer");
  const c = await menu.present();
  if (c === -1) { Script.complete(); return; }
  ({ family, view } = previews[c][1]);
  offset = 0;
} else if (!config.runsInWidget) {
  const auth = readAuthLock();
  const lock = auth && auth.blocked ? auth : null;   // tentative en cours / simple compteur : rien à signaler
  const actions = [
    ["Aperçu grand widget",               { family: "large",  view: "day" }],
    ["Aperçu widget moyen",               { family: "medium", view: "day" }],
    ["Aperçu petit widget",               { family: "small",  view: "day" }],
    ["Aperçu vue semaine",                { family: "large",  view: "week" }],
    ["Aperçu prochain cours",             { family: "small",  view: "next" }],
    ["Aperçu écran verrouillé",           { family: "accessoryRectangular", view: "next" }],
    ["Changer mes identifiants",          { creds: true }],
    ["Tester les notifications",          { testNotif: true }],
    ["Données brutes (debug)",            { debug: true }],
    ["Vérifier les mises à jour",         { update: true }],
  ];
  if (lock) actions.unshift(["Débloquer et réessayer une fois", { unlock: true }]);
  const menu = new Alert();
  menu.title = "Widget CELCAT";
  if (lock) menu.message = "⚠️ " + lock.msg +
    "\nAucune connexion n'est tentée tant que les identifiants ne changent pas " +
    "(protection contre le blocage du compte CY).";
  actions.forEach(([label]) => menu.addAction(label));
  menu.addCancelAction("Fermer");
  const c = await menu.present();
  if (c === -1) { Script.complete(); return; }
  const choice = actions[c][1];
  if (choice.unlock) { clearAuthLock(); AUTH_BAD = false; }
  if (choice.creds) await askCredentials();
  if (choice.testNotif) {
    // Au 1er essai, iOS demande l'autorisation d'envoyer des notifications à Scriptable
    const n = new Notification();
    n.title = "Notifications activées ✅";
    n.body = `Rappels ${REMIND_BEFORE_MIN ? REMIND_BEFORE_MIN + " min avant chaque cours" : "désactivés"}` +
             `${NOTIFY_CHANGES ? " · alertes en cas de changement" : ""}.`;
    n.sound = "default";
    await n.schedule();
    Script.complete(); return;
  }
  if (choice.update) {
    const a = new Alert();
    a.title = "Mise à jour";
    try {
      const { remote, newer } = await checkUpdate();
      a.message = newer
        ? `Version ${remote} disponible (tu as la ${VERSION}).
Copie le script depuis ${REPO} pour mettre à jour.`
        : `Le script est à jour (version ${VERSION}).`;
    } catch (e) {
      a.message = "Vérification impossible : " + e.message;
    }
    a.addAction("OK");
    await a.present();
    Script.complete(); return;
  }
  if (choice.debug) {
    try {
      const { data } = await getEvents(true);
      const frequent = frequentLines(data);
      const out = data.slice(0, 8).map(e => ({
        debut: e.start, categorie: e.eventCategory, modules: e.modules,
        lignes: splitLines(e), titre_affiche: parse(e, frequent).title,
      }));
      await QuickLook.present(JSON.stringify(out, null, 2));
    } catch (e) { await QuickLook.present("Erreur : " + e.message); }
    Script.complete(); return;
  }
  family = choice.family || "large";
  view = choice.view || "day";
  offset = 0;
}

let widget;
try {
  const res = await loadEvents(!config.runsInWidget);   // dans l'app : toujours à jour
  const { data, stale, error } = res;
  const events = parseAll(data);
  // Nouvelles données → notifications de changement, rappels, calendrier
  if (res.fetched) await afterFetch(res, events);
  if (view === "next") {
    widget = buildNextWidget(events, family, stale, error);
  } else if (view === "week" && (family === "large" || family === "extraLarge")) {
    widget = buildWeekWidget(events, stale, error, offset);
  } else if (view === "week") {
    widget = new ListWidget();
    widget.backgroundColor = STYLE.bg;
    const t = widget.addText("La vue semaine s'affiche sur un grand widget.");
    t.font = STYLE.font(12); t.textColor = STYLE.text;
  } else {
    widget = buildWidget(events, family, stale, error, offset);
  }
} catch (e) {
  widget = new ListWidget();
  if (!family.startsWith("accessory")) widget.backgroundColor = STYLE.bg;
  const t = widget.addText("⚠️ " + e.message);
  t.font = Font.systemFont(12);
  if (!family.startsWith("accessory")) t.textColor = STYLE.text;
}

if (config.runsInWidget) Script.setWidget(widget);
else if (family === "accessoryRectangular" && widget.presentAccessoryRectangular) await widget.presentAccessoryRectangular();
else if (family === "small" || family.startsWith("accessory")) await widget.presentSmall();
else if (family === "medium") await widget.presentMedium();
else await widget.presentLarge();
Script.complete();
