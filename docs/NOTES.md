# Balise — Notes de travail

> Textes utiles, décisions et idées rassemblés depuis les conversations de développement (novembre 2026).
> La documentation technique est dans [ARCHITECTURE.md](ARCHITECTURE.md), la méthode de travail dans [TRAVAIL.md](TRAVAIL.md).

## 1. Liens

- **Site** (téléphone ou ordinateur) : https://wagido.github.io/navshom/
- **Site de test** : https://wagido.github.io/navshom/beta/
- **Appli Android** : https://github.com/Wagido/navshom/releases/download/apk-latest/Balise.apk
- **Slides de présentation** : https://claude.ai/artifact/VCXUopnVtgdnbrQqLf9oqe (privé, à exporter en PDF ou PowerPoint)
- **Maquette de design « Clarté »** : https://claude.ai/artifact/D4iTDpy5mkGHRRyef61gaS
- **Maquette 3D Mont-Blanc** (relief IGN + itinéraires Camptocamp, échantillon figé) : https://claude.ai/artifact/CoFQLoteG5SSMZmYTE6zwR

## 2. Reprendre le travail dans une nouvelle session

Ouvrir une session Claude Code sur le dépôt **Wagido/navshom**, dans l'environnement cloud **navshom** (il autorise déjà les serveurs IGN, SHOM, Open-Meteo, OpenWindMap, refuges.info, ORC…), puis commencer par :

> Projet : Balise (dépôt Wagido/navshom). Lis d'abord `docs/ARCHITECTURE.md`, `docs/TRAVAIL.md` et `docs/NOTES.md`. Travaille sur la branche `beta`, vérifie sur /beta/, puis fusionne dans `main` quand les tests passent. Réponds-moi en français, simplement.
>
> Ce que je veux : …

Conseils :
- une seule conversation à la fois sur Balise, pour éviter que deux sessions modifient le code en même temps ;
- des conversations courtes, une par chantier : moins coûteuses qu'une très longue.

## 3. Messages WhatsApp

### Présentation générale (mer)

> ⚓⛰️ *Balise : grosse mise à jour !*
>
> *En mer* 🌊
> • *Hors ligne* : on télécharge une zone avant de partir (cartes + météo 3 jours). Au large, sans réseau, tout s'affiche quand même.
> • *Instruments* : touchez Vitesse/Cap en haut, gros chiffres lisibles à la barre. Avec la *polaire de votre bateau* et le % de la vitesse cible.
> • *604 modèles de bateaux* (polaires ORC : First, Sun Odyssey, Dufour, Pogo…), *avec ou sans spi*, pour le routage.
> • *Bouées et phares* : touchez la carte près d'une bouée → son nom et son feu (ex. « Q(9) W 15s »).
> • *AIS* : les navires autour, avec alerte de collision (clé gratuite aisstream.io).
> • *Alarme de mouillage* forte (sirène) + bouton « Tester ». *Alarme* si on sort de la route.
> • *Vent mesuré en direct* et *hauteur d'eau des marégraphes du SHOM*.
> • *Courants* : barre de temps à faire glisser, comme sur Windy. Liens directs vers les *bulletins Météo-France*.
>
> *Partout* ✨
> • Météo lisible : tableau clair, lever et coucher du soleil, 7 jours, ☔ *pluie à venir*.
> • L'appli prévient quand une nouvelle version sort.
>
> 👉 Site : https://wagido.github.io/navshom/
> 📲 Android : https://github.com/Wagido/navshom/releases/download/apk-latest/Balise.apk
>
> Si vous voyez encore l'ancienne version : fermez l'onglet et rouvrez le lien.
> Gratuit, sans pub, données publiques (IGN, SHOM, Météo-France). Vos retours sont les bienvenus ! 🙏
> *Capitaine BoBo*

### Culture rando (forêts, géologie)

> 🌳🪨 *Balise : la rando devient une balade nature*
>
> Nouveau dans le mode *Rando*, bouton *Cartes* :
>
> 🌲 *Quels arbres autour de moi ?*
> Activez la *carte des forêts de l'IGN*. Un encart affiche *uniquement les essences présentes à l'écran*, avec leur part.
> 👉 Exemple dans le Vivarais : 21 % mixte à dominante conifères, 20 % feuillus, 19 % Douglas, 13 % pin sylvestre…
>
> 🪨 *Sur quelle roche je marche ?*
> La *carte géologique du BRGM* se superpose à la carte de rando. Un encart indique *les terrains visibles à l'écran* : calcaires du Jurassique, craie du Crétacé, granites, schistes du Primaire, alluvions…
> 👉 Autour de Grenoble : Crétacé 50 %, Jurassique 26 % (les falaises de la Chartreuse et du Vercors).
>
> 🗺️ *Et aussi* : OpenTopoMap, carte IGN 1950, sentiers balisés GR et PR, courbes de niveau, cadastre, pentes > 30°, neige et iso 0 °C, refuges et points d'eau, boussole et carte qui tourne, vue 3D.
>
> 👉 https://wagido.github.io/navshom/
> 📲 Android : https://github.com/Wagido/navshom/releases/download/apk-latest/Balise.apk
>
> Gratuit, sans pub, données publiques (IGN, BRGM, Météo-France). Dites-moi ce que vous découvrez en chemin ! 🥾
> *Capitaine BoBo*

## 4. Décisions prises (et pourquoi)

- **Gratuit, sans pub, sans serveur.** Vendre même 1 € ne tient pas : Open-Meteo, RainViewer, aisstream sont gratuits seulement pour un usage non commercial ; la clé IGN 1:25 000 est transitoire ; ≈ 0,85 € net par vente ; concurrence gratuite (Cartes IGN, Windy, Navily) ; administratif. Piste possible : un bouton « Offrir un café », à vérifier avec les conditions d'Open-Meteo.
- **Une seule appli** Mer + Rando, la mer présentée comme le cœur (la rando seule a peu d'avantage sur Cartes IGN).
- **On ne contourne aucun refus d'accès** : pas d'usurpation du *referer* SHOM, pas de contournement des refus CORS (Camptocamp, BRGM, NOAA).
- **Pas de code GPL** : la rotation de carte est écrite maison plutôt que d'utiliser leaflet-rotate (GPL-3.0), qui aurait imposé cette licence à toute l'appli.
- **Trace unique** : plus de choix Rando / Course, l'affichage course se déclenche au-delà de 7 km/h.
- **Radar de pluie retiré** (RainViewer ne montre que les 2 heures passées) au profit de « Pluie à venir » (prévision AROME animée sur 12 h).

## 5. Pistes en attente

- **Courants de marée à 250 m (Ifremer)** : atlas des composantes harmoniques issu des modèles MARS2D (rang 2, 250 m, dont « Sud Bretagne »), calculable sur le téléphone, hors ligne, sans quota. Un mail de demande (licence, accès, couverture du Golfe du Morbihan, version plus récente que 2013) a été préparé en brouillon dans Gmail ; l'adresse est à trouver sur la page « Contacts » de marc.ifremer.fr. Les serveurs Ifremer ne sont pas encore autorisés dans l'environnement navshom.
- **Camptocamp** : leur API refuse les autres sites. Leur demander d'autoriser Balise (association, données CC BY-SA). En attendant, simple lien au point touché.
- **Signal K** (APK) : vrai vent de l'anémomètre, sondeur, AIS du bord par le Wi-Fi ; la polaire deviendrait une vraie mesure.
- **Bascules de vent et laylines** dans l'écran Instruments.
- **Journal de bord automatique.**
- **Balisage hors ligne** (cache des réponses Overpass par zone).
- **Bouées au large NOAA** : demanderaient un petit relais serveur.
- **Bouton « Signaler un problème »** et phase de test avec 15 à 20 utilisateurs.
- **Tri des fonctions et premier lancement guidé** (3 écrans : Mer ou Rando, GPS, zone à télécharger).

## 6. Publication sur le Play Store (si un jour)

À faire par le propriétaire :
1. Compte développeur Google Play : 25 $ une fois, pièce d'identité.
2. Au moins **12 testeurs** gardant l'appli **14 jours d'affilée** (test fermé obligatoire pour un nouveau compte personnel).
3. Remplir la console Google Play (textes préparés par Claude).

À faire techniquement :
1. Passer Capacitor 6 à une version récente (Android visé assez récent pour une nouvelle appli) et revérifier GPS en arrière-plan, notifications, partage.
2. Produire un **AAB signé** avec une vraie clé (stockée dans les secrets GitHub).
3. Choisir l'identifiant définitif (aujourd'hui `fr.navshom.app`, par exemple `fr.balise.app`) : **il ne pourra plus changer**.
4. Politique de confidentialité (aucune donnée ne quitte le téléphone vers un serveur à nous).
5. Fiche : description, captures, icône 512 px, bannière ; formulaires sécurité des données, classification, publicité (aucune).

Points délicats : le **GPS en arrière-plan** demande une justification écrite et une courte vidéo ; une appli qui ne fait qu'afficher un site peut être refusée, donc embarquer le code dans l'APK pour la version Play Store.

## 7. Comment marche la mise à jour automatique (rappel)

Trois étages : GitHub Pages republie à chaque publication ; le service worker sert l'app « réseau d'abord » ; la page déjà ouverte vérifie sa version au retour sur l'appli et toutes les 30 minutes et propose « Mettre à jour ». Un onglet resté ouvert des jours peut donc montrer une ancienne version jusqu'au rechargement : c'est ce qui était arrivé à un ami. Détails dans ARCHITECTURE.md, §8.
