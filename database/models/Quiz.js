// models/Quiz.js - Version avec nom de collection forcé
const mongoose = require('mongoose');

const questionSchema = mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    reponses: [{
        type: String,
        required: true
    }],
    bonneReponseIndex: {
        type: Number,
        required: true
    },
    explication: {
        type: String,
        required: true
    },
    theme: {
        type: String,
        required: true
    },
    difficulte: {
        type: String,
        enum: ['Facile', 'Moyenne', 'Difficile'],
        required: true
    },
    points: {
        type: Number,
        required: true
    },
    funFactReponse: {
        type: String,
        required: true
    }
});

const recompensesSchema = mongoose.Schema({
    premiereFois: {
        points: {
            type: Number,
            required: true
        },
        message: {
            type: String,
            required: true
        }
    },
    parfait: {
        points: {
            type: Number,
            required: true
        },
        message: {
            type: String,
            required: true
        },
        titreSpecial: {
            type: String
        }
    }
});

const quizSchema = mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    location: {
        latitude: {
            type: String,
            required: true
        },
        longitude: {
            type: String,
            required: true
        }
    },
    arrondissement: {
        type: String,
        required: true
    },
    ville: {
        type: String,
        required: true,
        default: "Paris"
    },
    descriptionLieu: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    badgeDebloque: {
        type: String,
        required: true
    },
    themeLieu: {
        type: String,
        required: true
    },
    difficulteGlobale: {
        type: String,
        enum: ['Facile', 'Moyenne', 'Difficile'],
        required: true
    },
    tempsEstime: {
        type: String,
        required: true
    },
    popularite: {
        type: Number,
        min: 1,
        max: 5,
        required: true
    },
    accessible: {
        type: Boolean,
        required: true
    },
    horaires: {
        type: String,
        required: true
    },
    conseilVisite: {
        type: String,
        required: true
    },
    funFact: {
        type: String,
        required: true
    },
    hashtags: [{
        type: String
    }],
    quiz: [questionSchema],
    recompenses: recompensesSchema,
    lieuxProches: [{
        type: String
    }],
    anecdoteBonus: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    },
    unlockRadius: {
        type: Number,
        default: 100
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// 🎯 FORCER LE NOM DE COLLECTION 'quizz' (3ème paramètre)
const Quiz = mongoose.model('Quiz', quizSchema, 'quizz');

module.exports = Quiz;