// models/quizz.js (MISE À JOUR RECOMMANDÉE)
const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
    name: String,
    location: { // Changer String en Number pour les coordonnées
        latitude: { type: Number, required: true, min: -90, max: 90 },
        longitude: { type: Number, required: true, min: -180, max: 180 },
    },
    arrondissement: String,
    ville: String,
    descriptionLieu: String,
    image: String,
    badgeDebloque: String,
    quiz: [
        {
            question: String,
            reponses: [String],
            bonneReponseIndex: Number,
            explication: String,
            theme: String,
            difficulte: String,
            points: Number,
        },
    ],
}, {
    timestamps: true // Ajout de timestamps pour un meilleur suivi
});

module.exports = mongoose.model('quizz', quizSchema);