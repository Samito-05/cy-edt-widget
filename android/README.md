# EDT CY pour Android

Version **Android** du widget emploi du temps CELCAT de CY Tech / CYU (testée pour les Samsung Galaxy, Android 8 ou plus).
Scriptable n'existe pas sur Android : c'est donc une petite app native, avec ses propres widgets.

> Projet indépendant, sans aucun lien avec CY Tech / CYU. Les identifiants restent sur le téléphone, chiffrés par le Keystore Android.

## Installation

1. Sur le téléphone, ouvrir la page [Releases](https://github.com/Samito-05/cy-edt-widget/releases) et télécharger **`EDT-CY.apk`** (dernière version « EDT CY Android »).
2. L'ouvrir. Android demande d'autoriser l'installation depuis le navigateur (Samsung : *Paramètres → Applications → Accès spécial → Installer applis inconnues*) : autoriser, puis **Installer**.
   Play Protect peut avertir que l'app est inconnue : « Installer quand même ».
3. Ouvrir **EDT CY**, saisir identifiant + mot de passe CY (ceux de `celcat-calendar.cyu.fr`) et, si possible, le numéro étudiant (le nombre après `fid0=` dans l'adresse de l'emploi du temps ; on peut coller l'adresse entière, ou laisser vide pour la détection automatique) → **Enregistrer et se connecter**. Autoriser les notifications.
4. Appuyer sur **Autoriser la mise à jour en arrière-plan** si le bouton apparaît (sinon One UI endort l'app et le widget se met moins souvent à jour).
5. Appui long sur l'écran d'accueil → **Widgets** → **EDT CY** :
   - **Emploi du temps CY** : cours du jour (ou du prochain jour de cours). Redimensionnable : cartes détaillées quand il y a la place, une ligne par cours sinon. En petite taille (2×2), mode « live » : chaque cours disparaît 30 min après son début.
   - **Prochain cours CY** : seulement le prochain cours et sa salle.

Mise à jour : télécharger le nouvel APK et l'installer par-dessus (identifiants, réglages et cache conservés).

## Fonctionnalités

Comme la version iOS : couleurs par type (CM rouge, TD bleu, TP violet, examen orange, vert réservé au cours en cours), cours annulés grisés, fériés/vacances en bandeau, mode clair/sombre (ou forcé), cours masqués et matières renommées, notification quand l'emploi du temps change (7 prochains jours), rappel X min avant chaque cours avec la salle, cache hors ligne, aucun appel réseau la nuit (22h → 7h), pauses progressives en cas de panne.

**Protection du compte CY** : identique à iOS. Dès que CELCAT refuse le mot de passe, plus rien n'est envoyé tant que l'identifiant ou le mot de passe n'a pas été modifié (ou via « Débloquer et réessayer une fois »). Après 2 connexions non confirmées, verrou aussi.

Pas (encore) sur Android : vue semaine, copie dans le calendrier, écran verrouillé.

## Compiler

L'APK est compilé par GitHub Actions ([`.github/workflows/android.yml`](../.github/workflows/android.yml)) à chaque push qui touche `android/` (artefact `EDT-CY-apk`). Il est publié en Release :

- automatiquement, au premier push d'une nouvelle `versionName` (dans `app/build.gradle.kts`) : la CI crée le tag `android-v<versionName>` ;
- ou à la main, en poussant un tag `android-v*`.

Pour sortir une nouvelle version : augmenter `versionCode` et `versionName`, puis pousser.

En local (JDK 17 + SDK Android) :

```sh
cd android
./gradlew testDebugUnitTest   # tests du parsing, du cache et du verrou d'identifiants
./gradlew assembleRelease     # → app/build/outputs/apk/release/app-release.apk
```

La clé de signature (`app/cy-edt.keystore`) est volontairement publique : elle garantit seulement que chaque APK s'installe par-dessus le précédent. Pour une diffusion plus large, la remplacer par une clé privée.

## Organisation

- `core/` : Kotlin pur, sans Android (testé sur JVM) — `Parser.kt` (portage du parsing iOS), `Schedule.kt` (jour affiché, prochain cours, changements), `Celcat.kt` (connexion, cache, backoff, verrou).
- `Widgets.kt`, `Notifs.kt`, `Edt.kt` (WorkManager toutes les 15 min, alarmes aux débuts/fins de cours), `MainActivity.kt`, `Storage.kt` (Keystore, fichiers atomiques).
