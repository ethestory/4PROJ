# SUPRSS — Manuel utilisateur

> **Produit** : SUPRSS — Lecteur/Gestionnaire de flux RSS  
> **Version** : 1.0  
> **Interface** : Frontend React (App.js)

---

## 1) Connexion

### 1.1 Connexion avec Google
- Sur la page d’accueil, cliquez sur **“Se connecter avec Google”**.  
- Une fenêtre Google s’ouvre → choisissez votre compte.  
- Une fois validé, vous êtes automatiquement connecté à SUPRSS.  

>  Si le bouton n’apparaît pas, c’est que la variable `REACT_APP_GOOGLE_CLIENT_ID` n’est pas configurée dans l’application.

### 1.2 Connexion locale (optionnelle)
- Cliquez sur **“Connexion locale”**.  
- Saisissez votre **nom d’utilisateur** et **mot de passe**.  
- Validez → vous accédez à vos flux personnels.  

---

## 2) Tableau de bord

Après connexion, vous arrivez sur l’écran principal.  
Vous y trouverez :  
- La **liste de vos flux RSS** (ajoutés manuellement ou via import).  
- Les **articles récents** de vos flux.  
- Les boutons pour **ajouter un flux** ou gérer vos préférences.  

---

## 3) Ajouter un flux RSS

1. Cliquez sur **“Ajouter un flux”**.  
2. Renseignez le formulaire :  
   - **Titre** : nom du flux (ex. “Le Monde – Une”).  
   - **URL** : l’adresse du flux RSS (ex. `https://www.lemonde.fr/rss/une.xml`).  
   - **Description** : optionnel.  
   - **Tags** : mots-clés séparés par virgule (ex. `actu,fr`).  
   - **Fréquence de mise à jour** : en minutes (par défaut 60).  

3. Cliquez sur **Valider** → le flux apparaît dans votre liste.  

---

## 4) Lire les articles

- La page **Articles** affiche la liste des publications de vos flux.  
- Pour chaque article, vous verrez :  
  - Titre  
  - Date de publication  
  - Auteur (si disponible)  
  - Extrait / résumé  
  - Lien vers la source originale  

**Actions possibles :**  
- ✅ **Marquer comme lu / non lu**  
- ⭐ **Ajouter aux favoris**

---

## 5) Gérer vos flux

- **Modifier un flux** : cliquez sur le flux dans la liste, ajustez titre/description/tags/fréquence.  
- **Activer / désactiver un flux** : utile pour garder un flux sans le mettre à jour.  
- **Supprimer un flux** : retire définitivement le flux et ses articles associés de votre compte.  

---

## 6) Collections partagées

Les **collections** permettent de regrouper plusieurs flux et de collaborer avec d’autres utilisateurs.  

### 6.1 Créer une collection
1. Dans le menu **Collections**, cliquez sur **Nouvelle collection**.  
2. Donnez un **nom** et une **description** (optionnel).  
3. La collection est créée, vous en êtes l’**administrateur**.  

### 6.2 Inviter des membres
- Depuis la page de votre collection → **Inviter un membre**.  
- Saisissez l’adresse e-mail de la personne.  
- Choisissez son rôle :  
  - **Lecture (read)** : consulter les articles.  
  - **Écriture (write)** : ajouter des flux, marquer lu/favori.  
  - **Admin** : gérer flux et membres.  

### 6.3 Ajouter des flux à une collection
- Dans la collection → **Ajouter un flux**.  
- Même formulaire que pour vos flux personnels.  
- Tous les membres autorisés voient les articles du flux ajouté.  

### 6.4 Consulter et filtrer
- Accédez à **Articles** dans la collection.  
- Filtres disponibles : par source, par tags, par statut (lu/non lu), par favoris, recherche plein texte.  

### 6.5 Commenter et discuter
- **Messagerie interne** : discuter en direct avec les membres.  
- **Commentaires d’article** : laisser une note ou poser une question sur un article précis.  

> Les droits dépendent de votre rôle. Si vous ne pouvez pas modifier ou supprimer un flux, demandez à un administrateur.  

---

## 7) Déconnexion

- Cliquez sur **Déconnexion** en haut à droite.  
- Vous serez redirigé vers la page d’accueil (connexion).  

---

## 8) FAQ

**Le bouton Google n’apparaît pas ?**  
- Vérifiez que l’administrateur a bien défini `REACT_APP_GOOGLE_CLIENT_ID`.  
- Rechargez la page.  

**Je n’arrive pas à ajouter un flux.**  
- Vérifiez que l’URL est bien un flux RSS valide (terminant souvent par `.xml`).  
- Exemple valide : `https://news.ycombinator.com/rss`.  

**Un flux n’affiche pas d’articles.**  
- Cliquez sur **Rafraîchir le flux** pour forcer la récupération.  
- Certains flux nécessitent un délai avant de renvoyer de nouveaux articles.  

**Import OPML/CSV échoue**  
- Vérifiez que le fichier est bien structuré.  
- Exportez d’abord vos flux actuels pour avoir un modèle.  

**Accès refusé à une collection**  
- Vérifiez votre rôle.  
- Seul un **admin** peut modifier flux et gérer les membres.  

---

## 9) Bonnes pratiques

- Utilisez les **tags** pour organiser vos flux (ex. `veille,tech,fr`).  
- Marquez vos articles comme **favoris** pour les retrouver facilement.  
- Créez des collections thématiques (par équipe, projet, ou sujet).  
- Exportez régulièrement vos flux pour garder une sauvegarde.  

---