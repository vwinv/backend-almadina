# Configuration Email

## Variables d'environnement requises

Pour activer l'envoi d'emails de suivi des commandes, vous devez configurer les variables suivantes dans votre fichier `.env` :

```env
# Configuration SMTP
SMTP_HOST=smtp.gmail.com          # Serveur SMTP (Gmail, Outlook, etc.)
SMTP_PORT=587                      # Port SMTP (587 pour TLS, 465 pour SSL)
SMTP_SECURE=false                  # true pour SSL (port 465), false pour TLS (port 587)
SMTP_USER=votre-email@example.com # Email expéditeur
SMTP_PASSWORD=votre-mot-de-passe   # Mot de passe de l'email expéditeur
SMTP_FROM_NAME="Al Madina Boutique" # Nom affiché comme expéditeur

# URL du frontend (pour le logo dans les emails)
FRONTEND_URL=https://almadinahboutique.com
```

## Exemples de configuration

### Gmail
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=votre-email@gmail.com
SMTP_PASSWORD=votre-mot-de-passe-application  # Utilisez un mot de passe d'application, pas votre mot de passe Gmail
```

### Outlook/Office 365
```env
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=contact@almadinahboutique.com
SMTP_PASSWORD=Welcometocanada@2025
```

## Notes importantes

1. **Gmail** : Vous devrez créer un "Mot de passe d'application" dans votre compte Google si vous utilisez l'authentification à deux facteurs. Allez dans : Compte Google > Sécurité > Mots de passe des applications.

2. **Sécurité** : Ne commitez jamais vos identifiants dans le code source. Utilisez toujours un fichier `.env` qui est dans `.gitignore`.

3. **Test** : Une fois les variables configurées, le service email vérifiera automatiquement la configuration au démarrage du serveur.

## Emails envoyés automatiquement

Le système envoie automatiquement des emails de suivi lors des événements suivants :

- **PENDING** : Lors de la création d'une nouvelle commande
- **PROCESSING** : Lors du passage en préparation
- **SHIPPED** : Lors de l'expédition (si le statut est changé via `update`)
- **DELIVERED** : Lors de la livraison
- **CANCELLED** : Lors de l'annulation

## Design des emails

Les emails suivent le design suivant :
- Logo centré en haut
- Objet dans un rectangle noir
- Corps de l'email avec les détails de la commande
- Rectangle dégradé doré en bas avec "Al Madinah E - commerce"
