# wauthier.com

Site vitrine de l'espace familial Wauthier — implémentation du design
`Wauthier.dc.html` (Claude Design) en site statique.

Sept écrans : Accueil, Consultance IA & RH, Certificats & audits énergétiques,
Architecture, Le coin philo, SweetLo, Espace Kawa.

## Structure

```
index.html            Les 7 écrans, en HTML (aucune génération côté serveur)
assets/css/site.css   Styles — tokens, composants, points de rupture
assets/js/site.js     Routage, formulaires, citation du jour, date du jour
assets/img/           Images du projet
```

Aucune étape de build, aucune dépendance : ouvrir `index.html` suffit.
Pour un serveur local :

> **Une seule étape manuelle : le `?v=` des assets.** `index.html` référence
> `site.css?v=N` et `site.js?v=N`. Après toute modification de l'un des deux,
> incrémenter `N` dans `index.html`, sinon les visiteurs déjà venus gardent
> l'ancienne version en cache et ne voient rien changer — y compris vous, en
> testant. Ces fichiers sont servis sans empreinte dans leur nom, le `?v=` est
> ce qui en tient lieu.

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

Quatre formulaires (IA & RH, Énergie, Architecture, SweetLo). Chacun porte
la couleur d'accent de son activité et nomme l'activité dans sa confirmation.
L'écran Philo n'a pas de formulaire de contact : il porte le formulaire
d'inscription à la citation quotidienne, décrit plus bas.

Chaque formulaire envoie vers l'URL de son propre attribut `data-endpoint`,
dans `index.html`, à côté du point de montage. À défaut il retombe sur
`CONTACT_ENDPOINT`, en haut de `assets/js/site.js`, commun à tous les
formulaires. Quand aucun des deux n'est renseigné, le formulaire affiche
seulement son écran de confirmation et le message n'arrive nulle part, comme
dans le prototype.

```html
<div class="contact-form-mount" data-activity="…" data-endpoint="https://…"></div>
```

```js
var CONTACT_ENDPOINT = 'https://…';   // destination par défaut
```

**État actuel.** Les quatre formulaires envoient vers le même workflow n8n
« Formulaire contact wauthier.com », via `CONTACT_ENDPOINT`. Aucun n'a de
`data-endpoint` : l'attribut ne sert que si une activité doit un jour partir
ailleurs.

Attention en cas de retour en arrière : un formulaire sans destination affiche
quand même son écran « Message envoyé ». Le visiteur croit son message parti,
alors qu'il n'existe nulle part. Ne laisser un formulaire non branché que si
c'est vraiment l'intention.

Le corps envoyé est du JSON :

```json
{ "name": "", "phone": "", "email": "", "message": "", "activity": "", "page": "" }
```

Toute réponse hors 2xx affiche un message d'erreur sous le formulaire.

### Côté n8n

L'appel part du navigateur du visiteur, donc le nœud **Webhook** doit :

- écouter en `POST` ;
- autoriser l'origine du site dans son option **Allowed Origins (CORS)** —
  sans quoi le navigateur bloque la requête avant même qu'elle parte, et le
  visiteur voit le message d'erreur ;
- répondre en 2xx (« Respond: Immediately » suffit).

L'URL à coller est celle de **production** (`/webhook/…`), le workflow étant
actif. L'URL de test (`/webhook-test/…`) ne répond que pendant une écoute
manuelle dans l'éditeur, et un workflow désactivé répond 404 sur l'URL de
production — le visiteur voit alors le message d'erreur.

Le champ `activity` du payload nomme l'activité d'origine (« Atelier Déclic
IA & RH », « Certificat PEB (résidentiel)», « SweetLo pâtisseries »…) : de quoi
router les messages sans multiplier les webhooks.

Le workflow en place fait trois choses : il normalise les six champs, envoie le
message par mail avec le visiteur en Reply-To, et archive la soumission dans le
classeur Google Sheets `Archive_forms_wauthier_com`. Mail et archivage sont deux
branches parallèles, l'archivage en « continue on error » : si Google Sheets est
indisponible, le mail part quand même.

Le destinataire dépend de l'activité : `Certificat PEB (résidentiel)` part vers
`peb@wauthier.com`, tout le reste vers `philippe@wauthier.com`. Le libellé est
comparé tel quel — modifier un `data-activity` dans `index.html` sans ajuster le
workflow renverrait les demandes PEB chez Philippe.

L'écriture dans Sheets est en `RAW` et doit le rester : en `USER_ENTERED`, un
numéro de téléphone au format international est interprété comme une formule et
la cellule affiche `#ERROR!`.

## Citation du jour (Le coin philo)

La carte « Citation du jour » de l'écran `#/philo` est remplie au chargement
depuis le workflow n8n « Citation du jour wauthier.com », qui lit le classeur
Google Sheets `Citations matinales` (colonnes `Date du mail`, `Citation`,
`Auteur`, `Commentaire`) et renvoie l'archive, la plus ancienne d'abord :

```json
[{ "date": "16/08/2026", "citation": "", "auteur": "", "commentaire": "", "jour": true }]
```

Le drapeau `jour` marque la citation à afficher à l'ouverture — celle du jour,
ou à défaut la plus récente déjà passée. Sous le texte, des flèches
`<<< jj/mm/aaaa >>>` permettent de remonter l'archive ; la navigation est
purement locale, tout est chargé en une requête. Les flèches restent masquées
tant qu'il n'y a qu'une citation, et se désactivent aux deux bouts.

Le workflow plafonne la réponse aux **90 citations les plus récentes**
(`MAX_CITATIONS`, en tête du nœud Code). Sans ce plafond, la page téléchargerait
un an d'archive au bout d'un an — chaque entrée pèse près d'un kilo-octet, à
cause du commentaire.

L'URL est dans `PHILO_QUOTE_ENDPOINT`, en haut de `assets/js/site.js`. L'appel
est un `GET` fait depuis le navigateur du visiteur : le nœud **Webhook** doit
donc, comme celui des formulaires, écouter en `GET` et autoriser l'origine du
site dans **Allowed Origins (CORS)**.

La date affichée dans l'en-tête de la carte est celle de la citation servie, et
non celle du jour : le workflow retombe sur la ligne passée la plus récente
quand celle du jour manque, et dater la carte d'aujourd'hui laisserait croire à
une citation fraîche.

**Citation de secours.** Le HTML de `index.html` contient une citation
d'Épictète, affichée telle quelle si quoi que ce soit échoue — endpoint vide,
réseau coupé, workflow désactivé, classeur vide. Rien n'est signalé au visiteur :
sur une page qui invite à ralentir, une citation datée passe mieux qu'un message
d'erreur. C'est aussi pourquoi cette citation de secours doit rester présentable
et ne pas être vidée.

Les noms de colonnes sont reconnus par préfixe, côté workflow comme côté site :
`Date du mail` ou `Date`, `Auteur` ou `Philosophe`, `Commentaire` ou
`Explication`. Renommer une colonne dans le classeur ne casse donc rien tant que
le préfixe tient.

## Inscription à la citation du jour (Le coin philo)

Sous la carte de citation, l'écran `#/philo` propose de recevoir la citation
quotidienne par mail. Le formulaire remplace l'ancien formulaire de contact de
cet écran : c'est le seul des sept écrans à ne pas en avoir.

Prénom, nom et e-mail sont obligatoires ; une zone de commentaire libre reste
facultative. Le corps envoyé est du JSON :

```json
{ "firstname": "", "lastname": "", "email": "", "comment": "", "page": "" }
```

L'URL est dans `PHILO_SUBSCRIBE_ENDPOINT`, en haut de `assets/js/site.js`, et
pointe vers le workflow n8n « Inscription citation du jour wauthier.com ».
Comme pour les formulaires de contact, l'appel est un `POST` fait depuis le
navigateur du visiteur : le nœud **Webhook** doit écouter en `POST` et
autoriser l'origine du site dans **Allowed Origins (CORS)**. Toute réponse hors
2xx affiche un message d'erreur sous le formulaire ; un endpoint vide afficherait
la confirmation sans inscrire personne, exactement comme pour les formulaires de
contact.

### Côté n8n

Le workflow normalise les cinq champs, écarte les adresses qui ne ressemblent
pas à une adresse e-mail (nœud « E-mail plausible », qui protège des robots),
puis écrit l'abonné dans le classeur Google Sheets `mailing_list_philo` :

| Prénom | Nom | E-mail | Date d'inscription | Commentaire |
| ------ | --- | ------ | ------------------ | ----------- |

L'écriture est un **upsert sur la colonne `E-mail`** : une seconde inscription
avec la même adresse met la ligne existante à jour au lieu d'en créer une
seconde, ce qui garde une ligne par abonné. Conséquence à connaître : la
dernière soumission l'emporte sur toutes les colonnes — la date devient celle de
la réinscription, et un commentaire laissé vide efface le précédent.

L'adresse est mise en minuscules avant écriture, sans quoi `Jean@x.be` et
`jean@x.be` créeraient deux lignes.

Comme pour l'archivage des formulaires de contact, l'écriture est en `RAW` et
doit le rester : en `USER_ENTERED`, un commentaire commençant par `=` serait
interprété comme une formule.

**Ce qui n'est pas branché.** Le workflow enregistre les abonnés ; il n'envoie
rien. L'envoi quotidien aux adresses du classeur reste à construire (le
workflow « Citations Philosophiques » produit la citation du matin, mais la
pousse vers WhatsApp).

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
