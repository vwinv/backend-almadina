# Guide de débogage - Upload Cloudinary

## Vérifications Backend

### 1. Variables d'environnement
Vérifiez que votre fichier `.env` contient bien :
```env
CLOUDINARY_CLOUD_NAME=votre-cloud-name
CLOUDINARY_API_KEY=votre-api-key
CLOUDINARY_API_SECRET=votre-api-secret
```

**Important :** Après modification du `.env`, redémarrez le serveur !

### 2. Logs de débogage
Les logs suivants apparaîtront au démarrage du serveur :
- ✅ Configuration Cloudinary chargée : Les credentials sont corrects
- ❌ Configuration Cloudinary manquante : Vérifiez vos variables d'environnement

### 3. Logs lors de l'upload
Quand vous uploadez un fichier, vous verrez :
- 📤 Upload de produits - Nombre de fichiers: X
- Fichier 1: { name, mimetype, size, bufferLength }
- ✅ Upload réussi: { public_id, format, width, height }
- ✅ URLs générées: [...]

Si vous voyez "❌ Erreur upload produits", vérifiez les détails dans les logs.

## Vérifications Frontend

### 1. Format de la requête
La requête doit être en `multipart/form-data` avec le Content-Type correct :

```javascript
const formData = new FormData();
formData.append('file', file); // ou 'files' si plusieurs fichiers

fetch('https://votre-api.com/api/uploads/products', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`, // Important !
    // NE PAS mettre 'Content-Type': 'multipart/form-data' manuellement
    // Le navigateur l'ajoutera automatiquement avec le boundary
  },
  body: formData
});
```

### 2. Points à vérifier côté frontend

#### ❌ Erreurs communes :
1. **Content-Type manuel** : Ne pas définir `Content-Type` manuellement pour FormData
   ```javascript
   // ❌ MAUVAIS
   headers: {
     'Content-Type': 'multipart/form-data'
   }
   
   // ✅ BON - Laisser le navigateur l'ajouter automatiquement
   // Pas de Content-Type dans les headers
   ```

2. **Nom du champ** : Vérifiez que le nom du champ correspond
   - Pour `AnyFilesInterceptor`, le nom du champ n'a pas d'importance
   - Mais utilisez un nom cohérent : `file` ou `files`

3. **Token d'authentification** : Assurez-vous d'envoyer le token JWT
   ```javascript
   headers: {
     'Authorization': `Bearer ${votre_token_jwt}`
   }
   ```

4. **Taille des fichiers** : Vérifiez que les fichiers ne dépassent pas 10MB

### 3. Exemple complet Frontend (React/Vue/Angular)

```javascript
async function uploadProductImages(files, authToken) {
  const formData = new FormData();
  
  // Ajouter tous les fichiers
  files.forEach((file) => {
    formData.append('files', file); // Nom du champ
  });

  try {
    const response = await fetch('http://localhost:3001/api/uploads/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`, // Important !
        // Ne pas mettre Content-Type ici
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Erreur upload:', error);
      throw new Error(error.message);
    }

    const data = await response.json();
    console.log('Upload réussi:', data.urls);
    return data.urls;
  } catch (error) {
    console.error('Erreur:', error);
    throw error;
  }
}
```

### 4. Vérification avec Postman/Insomnia

1. **Méthode** : POST
2. **URL** : `http://localhost:3001/api/uploads/products`
3. **Headers** :
   ```
   Authorization: Bearer votre_token_jwt
   ```
   **Important :** Ne pas ajouter Content-Type manuellement
4. **Body** : Sélectionner `form-data`
5. **Champs** : Ajouter des fichiers avec la clé `files` (ou n'importe quel nom)

## Erreur 401 "Invalid Signature"

Cette erreur signifie généralement :
1. ❌ Les credentials Cloudinary sont incorrects
2. ❌ Les variables d'environnement ne sont pas chargées
3. ❌ Le serveur n'a pas été redémarré après modification du `.env`

### Solution :
1. Vérifiez les logs au démarrage du serveur
2. Vérifiez que les 3 variables sont bien définies dans `.env`
3. Redémarrez complètement le serveur backend
4. Vérifiez dans le dashboard Cloudinary que vos credentials sont corrects

## Test rapide

Pour tester si le problème vient du frontend ou backend :

1. **Test avec Postman** :
   - Si ça fonctionne avec Postman → Problème côté frontend
   - Si ça ne fonctionne pas avec Postman → Problème côté backend (credentials Cloudinary)

2. **Vérifier les logs backend** :
   - Regardez la console du serveur lors de l'upload
   - Les logs indiquent exactement où le problème se situe
