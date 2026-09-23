// ============================================================
//  Widget emploi du temps CELCAT (CY Tech / CYU) pour Scriptable
//  Style calqué sur l'app : cartes sombres, bordure colorée
//  (TD = bleu, CM = rouge), horaires à gauche, infos à droite.
//  Petit widget en mode "live" : chaque cours disparaît 30 min après
//  son début pour laisser place au(x) suivant(s) et leur salle.
//  Autres modes via le "Parameter" du widget : 1, 2… (jours suivants),
//  semaine, prochain. Écran verrouillé : prochain cours + salle.
//  En plus : cours annulés grisés, notification si l'emploi du temps
//  change, rappel avant chaque cours, copie dans le calendrier iPhone,
//  mode clair/sombre automatique (voir « réglages » plus bas).
//
//  - Lance-le une fois dans Scriptable pour enregistrer tes
//    identifiants et ton numéro étudiant (stockés dans le Trousseau iOS).
//  - Ajoute un widget Scriptable (grand conseillé) et choisis ce script.
// ============================================================

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

const KC_USER = "celcat_user";
const KC_PASS = "celcat_pass";
const KC_FID  = "celcat_fid";    // numéro étudiant CELCAT (fid0), saisi ou détecté
let FID = Keychain.contains(KC_FID) ? Keychain.get(KC_FID) : "";

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

// Couleur selon le type de cours (1re règle qui correspond)
const TYPE_COLORS = [
  { re: /^CM\b|magistral/i,                                color: "#FF1A1A" }, // rouge
  { re: /^TD\b|dirig/i,                                    color: "#4B4BFF" }, // bleu
  { re: /^TP\b|pratique/i,                                 color: "#22C55E" }, // vert
  { re: /exam|partiel|\bDS\b|contr[oô]le|soutenance/i,     color: "#FF9500" }, // orange
];

const fm = FileManager.local();
const CACHE = fm.joinPath(fm.documentsDirectory(), "celcat_cache.json");

// ---------- utilitaires ----------
const pad = n => String(n).padStart(2, "0");
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

function decode(s) {
  return String(s ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")                                            // gère aussi "&amp;#232;"
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
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

  Keychain.set(KC_USER, a.textFieldValue(0).trim());
  if (a.textFieldValue(1)) Keychain.set(KC_PASS, a.textFieldValue(1));

  // Accepte le numéro seul ou l'adresse complète collée (…&fid0=12345678)
  const raw = a.textFieldValue(2).trim();
  const m = raw.match(/fid0=(\d+)/) || raw.match(/\d{5,}/);
  if (m) saveFid(m[1] || m[0]);
  else { FID = ""; if (Keychain.contains(KC_FID)) Keychain.remove(KC_FID); }
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
  const page = await request(BASE + "/LdapLogin").loadString();
  const m = page.match(/__RequestVerificationToken[^>]*value="([^"]+)"/);
  if (!m) return; // pas de formulaire → pas de connexion nécessaire

  const r = request(BASE + "/LdapLogin/Logon");
  r.method = "POST";
  r.headers = { "Content-Type": "application/x-www-form-urlencoded" };
  r.body = `Name=${enc(Keychain.get(KC_USER))}&Password=${enc(Keychain.get(KC_PASS))}` +
           `&__RequestVerificationToken=${enc(m[1])}`;
  const html = await r.loadString();
  // Identifiants refusés : CELCAT réaffiche le formulaire au lieu de rediriger vers l'agenda
  if (/name="Password"/i.test(html) && /__RequestVerificationToken/.test(html)) {
    const err = new Error("Identifiants refusés : ouvre le script → « Changer mes identifiants ».");
    err.badCredentials = true;
    throw err;
  }
  if (!FID) detectFid(r.response && r.response.url, html);   // après connexion, CELCAT redirige souvent vers …&fid0=…
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
           `&federationIds%5B%5D=${FID}&colourScheme=3`;
  const txt = (await r.loadString()).trim();
  if (!txt.startsWith("[")) return null; // page HTML = non connecté
  return JSON.parse(txt);
}

const CACHE_V = 2;               // incrémenter si le format du cache change → l'ancien est ignoré

function readCache() {
  try {
    if (!fm.fileExists(CACHE)) return null;
    const c = JSON.parse(fm.readString(CACHE));
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
  const cached = readCache();
  const fresh = cached && Date.now() - cached.at < (FETCH_MIN - 1) * 60000;
  if (cached && FID && !force && (fresh || isNight())) return { data: cached.data, stale: false, fetched: false };

  // Tentative précédente en échec : on patiente (ouvrir le script dans l'app réessaie tout de suite)
  const fail = cached && cached.fail;
  if (fail && !force && Date.now() - fail.at < backoffMs(fail))
    return { data: cached.data, stale: true, error: fail.msg, fetched: false };

  try {
    let data = FID ? await fetchEvents() : null;
    if (!data) {
      await login();
      if (!FID) await findFid();
      if (!FID) {
        const err = new Error("Numéro étudiant manquant : ouvre le script → « Changer mes identifiants ».");
        err.fatal = true;
        throw err;
      }
      data = await fetchEvents();
    }
    if (!data) throw new Error("Connexion refusée (identifiants ?)");
    // Réponse vide alors qu'on avait des cours à venir → raté du serveur : on garde l'ancienne version
    if (!data.length && cached && cached.data.filter(e => new Date(e.start) > new Date()).length >= 4)
      throw new Error("Réponse vide du serveur");
    const until = fetchWindow().end.getTime();
    writeCache({ at: Date.now(), fid: FID, until, data });   // succès → l'historique d'échecs est effacé
    // "prev" = version précédente, pour détecter les changements
    return { data, stale: false, fetched: true, until,
             prev: cached ? cached.data : null, prevUntil: cached ? cached.until : null };
  } catch (e) {
    // Mot de passe refusé : on attend plus longtemps dès le premier échec
    if (cached) {
      const count = fail ? fail.count + 1 : (e.badCredentials ? 1 : 0);
      try { writeCache({ ...cached, fail: { at: Date.now(), count, msg: e.message } }); } catch (err) {}
    }
    if (!e.fatal && cached) return { data: cached.data, stale: true, error: e.message, fetched: false };
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
  return new Set(Object.keys(count).filter(l => data.length >= 4 && count[l] / data.length >= 0.5));
}

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
  return {
    key: e.id != null ? String(e.id) : `${e.start}|${module}`,   // identifiant stable du cours
    start: new Date(e.start),
    end: new Date(e.end),
    title: module ? (category ? `${category} - ${module}` : module) : (category || "Cours"),
    module: module || category || "Cours", category,
    staff, room,
    cancelled: isCancelled(category, lines),
    color: type ? type.color : (e.backgroundColor || "#4B4BFF"),
  };
}

// Cours annulé : CELCAT l'indique dans le type ou la description ("Annulé", "Annulation", "Cancelled"…)
function isCancelled(category, lines) {
  return /annul|cancel/i.test(category) || lines.some(l => /\bannul|\bcancel/i.test(l));
}

const parseAll = data => { const f = frequentLines(data); return data.map(e => parse(e, f)); };

// ---------- carte de cours ----------
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

  const h = { full: 44, compact: 30, mini: 28 }[mode];
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
  const nextEvent = sorted.find(e => visible(e) && !e.cancelled);
  let targetDay = nextEvent ? ymd(nextEvent.start) : ymd(now);
  // Paramètre "1", "2"… : Nᵉ jour de cours suivant (pour naviguer dans une pile de widgets)
  if (offset > 0) {
    const days = [...new Set(sorted.filter(e => !e.cancelled).map(e => ymd(e.start)))].filter(d => d > targetDay);
    targetDay = days[offset - 1] || null;
  }
  const dayEvents = targetDay ? sorted.filter(e => ymd(e.start) === targetDay) : [];

  const max = { small: 2, medium: 2, large: 6, extraLarge: 8 }[fam] ?? 6;
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
  const mode = live ? "live" : fam === "small" ? "mini"
             : (fam === "medium" || shown.length >= 5) ? "compact" : "full";
  const big = fam === "large" || fam === "extraLarge";

  const w = new ListWidget();
  w.backgroundColor = STYLE.bg;
  const p = fam === "small" ? 10 : 12;
  w.setPadding(p, p, p, p);
  w.url = `${BASE}/cal?vt=agendaDay&dt=${targetDay || ymd(now)}&et=student&fid0=${FID}`;

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
    const s = head.addText("hors ligne");
    s.font = STYLE.font(9); s.textColor = Color.orange();
  } else if (fam !== "small" && dayEvents.some(e => !e.cancelled)) {
    const c = head.addText(`${dayEvents.filter(e => !e.cancelled).length} cours`);
    c.font = STYLE.font(11); c.textColor = STYLE.muted;
  }
  w.addSpacer(live ? 6 : 8);

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

function buildWeekWidget(events, stale, error, weekOffset = 0) {
  const now = new Date();
  const sorted = events.slice().sort((a, b) => a.start - b.start);
  const plus7 = d => { const m = new Date(d); m.setDate(m.getDate() + 7); return m; };
  const mins = d => d.getHours() * 60 + d.getMinutes();

  // Semaine en cours, ou la suivante s'il ne reste plus de cours cette semaine
  let monday = mondayOf(now);
  if (!sorted.some(e => !e.cancelled && e.end > now && e.start < plus7(monday))) monday = plus7(monday);
  for (let i = 0; i < weekOffset; i++) monday = plus7(monday);
  const weekEvents = sorted.filter(e => e.start >= monday && e.start < plus7(monday));

  // Lun → ven (+ sam/dim s'il y a cours)
  const nDays = weekEvents.some(e => e.start.getDay() === 0) ? 7
              : weekEvents.some(e => e.start.getDay() === 6) ? 6 : 5;
  const days = [...Array(nDays)].map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });

  // Plage horaire affichée (heures pleines)
  let startMin = 8 * 60, endMin = 18 * 60;
  if (weekEvents.length) {
    startMin = Math.floor(Math.min(...weekEvents.map(e => mins(e.start))) / 60) * 60;
    endMin = Math.ceil(Math.max(...weekEvents.map(e => mins(e.end))) / 60) * 60;
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
  w.url = `${BASE}/cal?vt=agendaWeek&dt=${ymd(monday)}&et=student&fid0=${FID}`;

  // En-tête
  const head = w.addStack();
  head.size = new Size(innerW, headH);
  head.centerAlignContent();
  const h1 = head.addText(`Semaine du ${fmtDate(monday, "d MMM")}`);
  h1.font = STYLE.bold(15); h1.textColor = STYLE.text;
  head.addSpacer();
  const h2 = head.addText(stale ? "hors ligne" : `${weekEvents.filter(e => !e.cancelled).length} cours`);
  h2.font = STYLE.font(stale ? 9 : 11); h2.textColor = stale ? Color.orange() : STYLE.muted;
  w.addSpacer(6);

  // Ligne des jours
  const dh = w.addStack();
  dh.layoutHorizontally();
  dh.addSpacer(axisW);
  days.forEach(d => {
    dh.addSpacer(gap);
    const isToday = ymd(d) === ymd(now);
    const c = dh.addStack();
    c.size = new Size(colW, dayH);
    c.centerAlignContent();
    if (isToday) { c.backgroundColor = STYLE.text; c.cornerRadius = 4; }
    c.addSpacer();
    const t = c.addText(`${cap(fmtDate(d, "EEE").replace(".", ""))} ${d.getDate()}`);
    t.font = isToday ? STYLE.bold(9) : STYLE.font(9);
    t.textColor = isToday ? STYLE.bg : (d < mondayOf(now) || (ymd(d) < ymd(now)) ? STYLE.muted : STYLE.sub);
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

    let cursor = 0;
    weekEvents.filter(e => ymd(e.start) === ymd(d)).forEach(e => {
      const top = Math.round((mins(e.start) - startMin) * scale);
      const bottom = Math.round((mins(e.end) - startMin) * scale);
      const y = Math.max(top, cursor);
      if (y > cursor) col.addSpacer(y - cursor);
      const h = Math.min(Math.max(10, bottom - y), gridH - y);   // jamais plus bas que la grille
      if (h <= 0) return;
      addWeekBlock(col, e, colW, h, now);
      cursor = y + h;
    });
    // Espace restant EXACT (un spacer flexible a une taille mini sous iOS : quand les cours
    // vont jusqu'en bas, la colonne déborde et iOS la recentre → tout remonte de quelques points)
    if (gridH - cursor > 0) col.addSpacer(gridH - cursor);
  });

  if (!weekEvents.length) {
    w.addSpacer(4);
    const n = w.addText(error && !events.length ? `⚠️ ${error}` : "Pas de cours cette semaine 🎉");
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
const whenStr = d => `${cap(fmtDate(d, "EEE d").replace(".", ""))} ${hm(d)}`;   // "Jeu 24 13:00"
const dayUrl = d => `${BASE}/cal?vt=agendaDay&dt=${ymd(d)}&et=student&fid0=${FID}`;

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
  n.openURL = `${BASE}/cal?vt=agendaWeek&dt=${ymd(new Date())}&et=student&fid0=${FID}`;
  await n.schedule();
}

// Rappels avant chaque cours (5 prochains jours) ; supprimés/remplacés si le cours change
async function scheduleReminders(events) {
  const pending = await Notification.allPending();
  const ours = pending.map(n => n.identifier || "").filter(id => id.startsWith(REMIND_PREFIX));
  const now = Date.now(), horizon = now + 5 * 86400000;
  const wanted = new Map();
  if (REMIND_BEFORE_MIN > 0) {
    for (const e of events) {
      const at = e.start.getTime() - REMIND_BEFORE_MIN * 60000;
      if (e.cancelled || at <= now || at > horizon) continue;
      // la salle fait partie de l'identifiant → un changement de salle remplace le rappel
      wanted.set(`${REMIND_PREFIX}${e.key}|${e.start.getTime()}|${e.room}`, { e, at });
    }
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
  catch (e) { cal = await Calendar.createForEvents(CALENDAR_NAME); }

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
        (ev.location || "") === (e.room || "") && (ev.notes || "") === notes) continue;   // inchangé
    if (!ev) { ev = new CalendarEvent(); ev.calendar = cal; }
    ev.title = title;
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
               .find(e => !e.cancelled && e.end > now && hideAt(e) > now);
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
  w.url = `${BASE}/cal?vt=agendaDay&dt=${ymd(e ? e.start : now)}&et=student&fid0=${FID}`;
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
    text(w, inProgress ? `En cours · ${e.room}` : `${when} · ${e.room}`, Font.systemFont(12));
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
  if (stale) text(head, "hors ligne", STYLE.font(9), Color.orange());

  w.addSpacer();                         // infos calées en bas du widget
  text(w, e.module, STYLE.bold(fam === "small" ? 15 : 17), STYLE.text, 2);
  w.addSpacer(2);
  text(w, e.room || "Salle ?", STYLE.bold(fam === "small" ? 24 : 28), inProgress ? STYLE.now : STYLE.text);
  w.addSpacer(4);
  addStatus(w, STYLE.font(12), STYLE.sub, STYLE.now);
  return w;
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

if (!config.runsInWidget) {
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
  ];
  const menu = new Alert();
  menu.title = "Widget CELCAT";
  actions.forEach(([label]) => menu.addAction(label));
  menu.addCancelAction("Fermer");
  const c = await menu.present();
  if (c === -1) { Script.complete(); return; }
  const choice = actions[c][1];
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
  const res = await getEvents(!config.runsInWidget);   // dans l'app : toujours à jour
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
