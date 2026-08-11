# wauthier.com

Site vitrine de l'espace familial Wauthier — implémentation du design
`Wauthier.dc.html` (Claude Design) en site statique.

Sept écrans : Accueil, Consultance IA & RH, Certificats & audits énergétiques,
Architecture, Le coin philo, SweetLo, Espace Kawa.

## Structure

```
index.html            Les 7 écrans, en HTML (aucune génération côté serveur)
assets/css/site.css   Styles — tokens, composants, points de rupture
assets/js/site.js     Routage, formulaires de contact, date du jour
assets/img/           Images du projet
```

Aucune étape de build, aucune dépendance : ouvrir `index.html` suffit.
Pour un serveur local :

```sh
python3 -m http.server 8000   # puis http://127.0.0.1:8000
```

Déployable tel quel sur GitHub Pages, Netlify, ou n'importe quel hébergement
statique.

## Routage

Le prototype changeait d'écran via un état interne, sans URL. Ici chaque écran
a son URL en `hash`, ce qui rend les pages partageables et fait fonctionner le
bouton « précédent » du navigateur :

| Écran        | URL              |
| ------------ | ---------------- |
| Accueil      | `/`              |
| IA & RH      | `#/ia`           |
| Énergie      | `#/energie`      |
| Architecture | `#/architecture` |
| Le coin philo| `#/philo`        |
| Espace Kawa  | `#/kawa`         |
| SweetLo      | `#/sweetlo`      |

Le contenu des sept écrans est présent dans le HTML initial (les écrans
inactifs sont masqués), donc indexable par les moteurs de recherche. Une URL
inconnue retombe sur l'accueil.

## Formulaires de contact

Cinq formulaires (IA & RH, Énergie, Architecture, Philo, SweetLo). Chacun porte
la couleur d'accent de son activité et nomme l'activité dans sa confirmation.

**Aucun envoi réel n'est configuré pour l'instant.** Comme dans le prototype,
le formulaire affiche seulement son écran de confirmation — le message n'arrive
nulle part.

Pour activer l'envoi, renseigner `CONTACT_ENDPOINT` en haut de
`assets/js/site.js` avec une URL acceptant un POST (Formspree, Netlify Forms,
webhook n8n…) :

```js
var CONTACT_ENDPOINT = 'https://…';
```

Le corps envoyé est du JSON :

```json
{ "name": "", "phone": "", "email": "", "message": "", "activity": "", "page": "" }
```

Toute réponse hors 2xx affiche un message d'erreur sous le formulaire.

## Points à connaître

- **Qualité des images de pâtisserie.** `cake-06`, `cake-08`, `cake-13` et
  `cake-15` ne font que 182 × 182 px dans le bundle de design, alors qu'elles
  sont affichées jusqu'à ~500 px de large (visuel principal SweetLo, encart
  « Passer commande »). Elles apparaissent floues. Il faut remplacer ces
  quatre fichiers par les originaux haute résolution — les noms de fichiers
  peuvent rester identiques.
- **`architecture.webp`** fait 600 × 400 px pour un bandeau affiché jusqu'à
  1120 px de large : même remarque, en moins critique.
- **Images de l'Espace Kawa.** Les quatre visuels Kawa pointent vers
  `docteurcatherinewauthier.be` (comme dans le design). Le site dépend donc de
  la disponibilité de ce domaine ; les héberger localement serait plus sûr.
- Les extensions des fichiers d'images ont été corrigées pour correspondre à
  leur format réel (plusieurs `.jpg` étaient en fait des PNG ou du WebP).

## Origine

Implémenté depuis le bundle de handoff Claude Design
« Wauthier.com professional activities site ». Le prototype s'appuyait sur le
moteur `support.js` / `image-slot.js` de l'outil de design : ces fichiers sont
propres à l'outil et ne font pas partie du site.
