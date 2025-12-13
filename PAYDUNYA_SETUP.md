# Configuration PayDunya

Ce document explique comment configurer l'intégration PayDunya pour les paiements.

## Variables d'environnement

Ajoutez les variables suivantes dans votre fichier `.env` :

```env
# PayDunya API Configuration
PAYDUNYA_API_URL=https://app.paydunya.com/api/v1
PAYDUNYA_MASTER_KEY=votre_master_key
PAYDUNYA_PRIVATE_KEY=votre_private_key
PAYDUNYA_TOKEN=votre_token

# Store Configuration
STORE_NAME=Almadina
API_BASE_URL=http://localhost:3001
```

## Obtenir les clés PayDunya

1. Créez un compte PayDunya Business sur [https://paydunya.com](https://paydunya.com)
2. Connectez-vous à votre compte
3. Allez dans "Intégrez notre API" dans le menu de gauche
4. Cliquez sur "Configurer une nouvelle application"
5. Remplissez le formulaire et choisissez le mode (TEST ou PRODUCTION)
6. Copiez les clés générées :
   - **PAYDUNYA-MASTER-KEY** : Clé maître
   - **PAYDUNYA-PRIVATE-KEY** : Clé privée
   - **PAYDUNYA-TOKEN** : Token d'authentification

## Méthodes de paiement supportées

L'API supporte les méthodes de paiement suivantes :

- **MTN Côte d'Ivoire** : `/api/payments/mtn-ci`
- **MOOV Côte d'Ivoire** : `/api/payments/moov-ci`
- **Orange Money Côte d'Ivoire** : `/api/payments/orange-money-ci`
- **Wave Côte d'Ivoire** : `/api/payments/wave-ci` (avec QR code)
- **Wave Sénégal** : `/api/payments/wave-sn` (avec QR code)
- **Orange Money Sénégal** : `/api/payments/orange-money-sn` (avec QR code)

## Utilisation

### 1. Créer un checkout invoice

```http
POST /api/payments/checkout/:orderId
Authorization: Bearer <token>
```

### 2. Effectuer un paiement

```http
POST /api/payments/mtn-ci
Authorization: Bearer <token>
Content-Type: application/json

{
  "orderId": 1,
  "paymentMethod": "MTN_CI",
  "phoneNumber": "01234567",
  "fullName": "John Doe",
  "email": "[email protected]"
}
```

### Réponse pour Wave et Orange Money (avec QR code)

Pour Wave et Orange Money, la réponse contient une URL pour afficher le QR code :

```json
{
  "success": true,
  "message": "Rediriger vers cette URL pour completer le paiement.",
  "url": "https://pay.wave.com/c/...",
  "fees": 100,
  "currency": "XOF"
}
```

Utilisez le champ `url` pour générer un QR code que le client peut scanner avec son application mobile.

## Webhook / Callback

PayDunya enverra des notifications de statut de paiement à :

```
POST /api/payments/callback
```

Ce endpoint mettra automatiquement à jour le statut du paiement et de la commande dans la base de données.

## Documentation PayDunya

Pour plus d'informations, consultez la documentation officielle :
https://developers.paydunya.com/doc/FR/softpay

