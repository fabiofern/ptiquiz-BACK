// routes/quizz.js - Version corrigée pour tes données
const express = require('express');
const router = express.Router();
const Quiz = require('../database/models/Quiz');
const User = require('../database/models/User');

// GET tous les quiz pour la carte
router.get('/', async (req, res) => {
    try {
        console.log('📡 Récupération de tous les quiz...');

        const quiz = await Quiz.find({});
        console.log(`📊 ${quiz.length} quiz trouvés en base`);

        if (quiz.length === 0) {
            return res.json({
                result: true,
                quiz: [],
                message: 'Aucun quiz trouvé'
            });
        }

        // Transformer les données pour l'app
        const quizWithStats = quiz.map(q => {
            const totalPoints = q.quiz ? q.quiz.reduce((sum, question) => sum + (question.points || 0), 0) : 0;
            const questionCount = q.quiz ? q.quiz.length : 0;

            return {
                _id: q._id,
                name: q.name,
                arrondissement: q.arrondissement,
                ville: q.ville,
                descriptionLieu: q.descriptionLieu,
                image: q.image,
                badgeDebloque: q.badgeDebloque,
                themeLieu: q.themeLieu,
                difficulteGlobale: q.difficulteGlobale,
                tempsEstime: q.tempsEstime,
                popularite: q.popularite,
                accessible: q.accessible,
                horaires: q.horaires,
                conseilVisite: q.conseilVisite,
                funFact: q.funFact,
                hashtags: q.hashtags,
                lieuxProches: q.lieuxProches,
                anecdoteBonus: q.anecdoteBonus,
                unlockRadius: 100,
                totalPoints,
                questionCount,
                // Convertir les coordonnées string en numbers
                coordinate: {
                    latitude: parseFloat(q.location?.latitude || 0),
                    longitude: parseFloat(q.location?.longitude || 0)
                }
            };
        });

        console.log(`✅ ${quizWithStats.length} quiz préparés pour envoi`);
        console.log('📍 Premier quiz:', quizWithStats[0]?.name);

        res.json({
            result: true,
            quiz: quizWithStats
        });

    } catch (error) {
        console.error('❌ Erreur récupération quiz:', error);
        res.status(500).json({
            result: false,
            error: 'Erreur serveur',
            details: error.message
        });
    }
});



// 🎮 GET - Récupérer les quiz débloqués pour QuizScreen
router.get('/unlocked/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        console.log('📚 Récupération quiz débloqués pour:', userId);

        const user = await User.findById(userId);
        if (!user) {
            return res.json({ result: false, error: 'Utilisateur non trouvé' });
        }

        const unlockedQuizIds = user.unlockedQuizzes || [];

        if (unlockedQuizIds.length === 0) {
            return res.json({
                result: true,
                quiz: [],
                message: 'Aucun quiz débloqué'
            });
        }

        const unlockedQuiz = await Quiz.find({
            '_id': { $in: unlockedQuizIds }
        });

        const enrichedQuiz = unlockedQuiz.map(quiz => {
            const quizId = quiz._id.toString();
            const completedData = user.completedQuizzes?.[quizId];

            return {
                ...quiz.toObject(),
                _id: { $oid: quizId },
                location: {
                    latitude: quiz.location?.latitude?.toString() || "0",
                    longitude: quiz.location?.longitude?.toString() || "0"
                },
                isCompleted: !!completedData,
                userScore: completedData?.score || 0,
                userPercentage: completedData?.percentage || 0,
                totalPointsAvailable: quiz.totalPoints
            };
        });

        console.log(`✅ ${enrichedQuiz.length} quiz débloqués trouvés`);

        res.json({
            result: true,
            quiz: enrichedQuiz,
            userStats: {
                totalScore: user.score || 0,
                unlockedCount: unlockedQuizIds.length,
                completedCount: Object.keys(user.completedQuizzes || {}).length
            }
        });

    } catch (error) {
        console.error('❌ Erreur récupération quiz débloqués:', error);
        res.json({ result: false, error: error.message });
    }
});

// 🏆 POST - Sauvegarder le résultat d'un quiz complété
router.post('/complete', async (req, res) => {
    try {
        const {
            userId,
            quizId,
            score,
            totalPoints,
            percentage,
            answers,
            completedAt
        } = req.body;

        console.log('💾 Sauvegarde résultat quiz:', { userId, quizId, score, totalPoints });

        const user = await User.findById(userId);
        const quiz = await Quiz.findById(quizId);

        if (!user || !quiz) {
            return res.json({ result: false, error: 'Utilisateur ou quiz non trouvé' });
        }

        const completionData = {
            name: quiz.name,
            score,
            totalPoints,
            percentage,
            badge: quiz.badgeDebloque,
            completedAt: completedAt || new Date().toISOString(),
            theme: quiz.themeLieu,
            answers: answers || []
        };

        const currentScore = user.score || 0;
        const previousScore = user.completedQuizzes?.[quizId]?.score || 0;
        const scoreToAdd = score - previousScore;

        await User.findByIdAndUpdate(userId, {
            $set: {
                [`completedQuizzes.${quizId}`]: completionData,
                score: Math.max(currentScore + scoreToAdd, currentScore)
            }
        });

        console.log(`✅ Quiz "${quiz.name}" sauvegardé avec ${score}/${totalPoints} points`);

        res.json({
            result: true,
            message: 'Quiz complété et sauvegardé !',
            completionData,
            newTotalScore: Math.max(currentScore + scoreToAdd, currentScore)
        });

    } catch (error) {
        console.error('❌ Erreur sauvegarde quiz:', error);
        res.json({ result: false, error: error.message });
    }
});

// GET un quiz spécifique avec toutes les questions (pour jouer)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        console.log(`📡 Récupération quiz ${id}...`);

        const quiz = await Quiz.findById(id);

        if (!quiz) {
            return res.status(404).json({
                result: false,
                error: 'Quiz non trouvé'
            });
        }

        const questionsSecurisees = quiz.quiz.map(q => ({
            question: q.question,
            reponses: q.reponses,
            theme: q.theme,
            difficulte: q.difficulte,
            points: q.points,
            _id: q._id
        }));

        res.json({
            result: true,
            quiz: {
                ...quiz.toObject(),
                quiz: questionsSecurisees,
                coordinate: {
                    latitude: parseFloat(quiz.location?.latitude || 0),
                    longitude: parseFloat(quiz.location?.longitude || 0)
                }
            }
        });

    } catch (error) {
        console.error('❌ Erreur récupération quiz:', error);
        res.status(500).json({
            result: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;