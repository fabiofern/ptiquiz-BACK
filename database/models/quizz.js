// models/quizz.js
const mongoose = require('mongoose');

const quizSchema = new mongoose.Schema({
    name: String,
    location: {
        latitude: String,
        longitude: String,
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
});

module.exports = mongoose.model('quizz', quizSchema);
