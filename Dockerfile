# Étape 1 : Image de base
FROM node:18

# Étape 2 : Création du dossier de travail
WORKDIR /app

# Étape 3 : Copie des fichiers
COPY package*.json ./
COPY . .

# Étape 4 : Installation des dépendances
RUN npm install

# Étape 5 : Définition du port exposé
EXPOSE 3000

# Étape 6 : Commande de démarrage
CMD ["npm", "start"]

