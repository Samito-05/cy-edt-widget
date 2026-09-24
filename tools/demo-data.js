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
