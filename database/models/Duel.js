const mongoose = require('mongoose');

const duelSchema = new mongoose.Schema({
    // 👥 Participants du duel
    challenger: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },
    challenged: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users',
        required: true
    },

    // 📊 Statut du duel
    status: {
        type: String,
        enum: ['pending', 'active', 'completed', 'expired', 'declined'],
        default: 'pending'
    },

    // ❓ Questions du duel (10 questions communes)
    questions: [{
        quizId: {
            type: String,
            required: true
        },
        questionId: {
            type: String,
            required: true
        },
        question: String,           // Texte de la question
        answers: [String],          // 4 réponses possibles
        correctAnswer: Number,      // Index de la bonne réponse (0-3)
        points: {                   // Points pour cette question
            type: Number,
            default: 10
        }
    }],

    // 🎯 Résultats des joueurs
    results: {
        challenger: {
            score: { type: Number, default: 0 },
            answers: [{
                questionIndex: Number,
                selectedAnswer: Number,
                isCorrect: Boolean,
                timeSpent: Number        // Temps en secondes
            }],
            completedAt: Date,
            totalTime: Number          // Temps total en secondes
        },
        challenged: {
            score: { type: Number, default: 0 },
            answers: [{
                questionIndex: Number,
                selectedAnswer: Number,
                isCorrect: Boolean,
                timeSpent: Number
            }],
            completedAt: Date,
            totalTime: Number
        }
    },

    // 🏆 Gagnant et récompenses
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users'
    },
    isDraw: {
        type: Boolean,
        default: false
    },

    // 💰 Récompenses distribuées
    rewards: {
        winner: {
            points: { type: Number, default: 50 },
            badge: String
        },
        loser: {
            points: { type: Number, default: 25 }
        }
    },

    // ⏱️ Gestion du temps
    expiresAt: {
        type: Date,
        default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h pour accepter
    },

    // 📅 Dates importantes
    createdAt: { type: Date, default: Date.now },
    acceptedAt: Date,
    completedAt: Date
});

// 📊 Index pour optimiser les requêtes
duelSchema.index({ challenger: 1, status: 1 });
duelSchema.index({ challenged: 1, status: 1 });
duelSchema.index({ status: 1, createdAt: -1 });
duelSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // Auto-suppression

// 🎯 Méthodes du modèle

// Vérifier si un joueur peut jouer
duelSchema.methods.canPlay = function (userId) {
    return this.status === 'active' &&
        (this.challenger.toString() === userId.toString() ||
            this.challenged.toString() === userId.toString());
};

// Vérifier si un joueur a terminé
duelSchema.methods.hasPlayerCompleted = function (userId) {
    if (this.challenger.toString() === userId.toString()) {
        return !!this.results.challenger.completedAt;
    }
    if (this.challenged.toString() === userId.toString()) {
        return !!this.results.challenged.completedAt;
    }
    return false;
};

// Calculer le gagnant
duelSchema.methods.calculateWinner = function () {
    if (!this.results.challenger.completedAt || !this.results.challenged.completedAt) {
        return null; // Pas encore terminé
    }

    const challengerScore = this.results.challenger.score;
    const challengedScore = this.results.challenged.score;

    if (challengerScore > challengedScore) {
        this.winner = this.challenger;
        this.isDraw = false;
    } else if (challengedScore > challengerScore) {
        this.winner = this.challenged;
        this.isDraw = false;
    } else {
        // Égalité - départage par temps
        const challengerTime = this.results.challenger.totalTime;
        const challengedTime = this.results.challenged.totalTime;

        if (challengerTime < challengedTime) {
            this.winner = this.challenger;
        } else if (challengedTime < challengerTime) {
            this.winner = this.challenged;
        } else {
            this.isDraw = true; // Vraie égalité
        }
    }

    this.status = 'completed';
    this.completedAt = new Date();

    return this.winner;
};

// Méthodes statiques

// Trouver les duels en attente pour un utilisateur
duelSchema.statics.findPendingDuels = function (userId) {
    return this.find({
        challenged: userId,
        status: 'pending',
        expiresAt: { $gt: new Date() }
    }).populate('challenger', 'username avatar');
};

// Trouver les duels actifs pour un utilisateur
duelSchema.statics.findActiveDuels = function (userId) {
    return this.find({
        $or: [{ challenger: userId }, { challenged: userId }],
        status: 'active'
    }).populate('challenger challenged', 'username avatar');
};

// Trouver l'historique des duels
duelSchema.statics.findDuelHistory = function (userId, limit = 10) {
    return this.find({
        $or: [{ challenger: userId }, { challenged: userId }],
        status: 'completed'
    })
        .populate('challenger challenged winner', 'username avatar')
        .sort({ completedAt: -1 })
        .limit(limit);
};

// Statistiques de duel pour un utilisateur
duelSchema.statics.getDuelStats = async function (userId) {
    const stats = await this.aggregate([
        {
            $match: {
                $or: [
                    { challenger: new mongoose.Types.ObjectId(userId) },
                    { challenged: new mongoose.Types.ObjectId(userId) }
                ],
                status: 'completed'
            }
        },
        {
            $group: {
                _id: null,
                totalDuels: { $sum: 1 },
                wins: {
                    $sum: {
                        $cond: [
                            { $eq: ['$winner', new mongoose.Types.ObjectId(userId)] },
                            1,
                            0
                        ]
                    }
                },
                draws: {
                    $sum: {
                        $cond: ['$isDraw', 1, 0]
                    }
                }
            }
        }
    ]);

    if (stats.length === 0) {
        return { totalDuels: 0, wins: 0, losses: 0, draws: 0, winRate: 0 };
    }

    const result = stats[0];
    return {
        totalDuels: result.totalDuels,
        wins: result.wins,
        losses: result.totalDuels - result.wins - result.draws,
        draws: result.draws,
        winRate: result.totalDuels > 0 ? Math.round((result.wins / result.totalDuels) * 100) : 0
    };
};

module.exports = mongoose.model('Duel', duelSchema);