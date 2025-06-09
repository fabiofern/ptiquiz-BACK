// routes/quizz.js - Version corrigée pour tes données
const express = require('express');
const router = express.Router();
const Quiz = require('../database/models/Quiz');

// GET tous les quiz pour la carte
router.get('/', async (req, res) => {
    try {
        console.log('📡 Récupération de tous les quiz...');

        // ✅ SANS FILTRE isActive puisque tes données n'ont pas ce champ
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
                unlockRadius: 1000000000000000000, // Valeur par défaut
                totalPoints,
                questionCount,
                // ✅ Convertir les coordonnées string en numbers pour la carte
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

        // Préparer les questions sans révéler les bonnes réponses
        const questionsSecurisees = quiz.quiz.map(q => ({
            question: q.question,
            reponses: q.reponses,
            theme: q.theme,
            difficulte: q.difficulte,
            points: q.points,
            _id: q._id
            // NE PAS envoyer bonneReponseIndex et explication !
        }));

        res.json({
            result: true,
            quiz: {
                ...quiz.toObject(),
                quiz: questionsSecurisees,
                coordinate: {
                    latitude: parseFloat(quiz.location.latitude),
                    longitude: parseFloat(quiz.location.longitude)
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

// POST vérifier les réponses d'un quiz
router.post('/:id/submit', async (req, res) => {
    try {
        const { id } = req.params;
        const { answers, userToken } = req.body;

        console.log(`📝 Soumission quiz ${id}...`);

        const quiz = await Quiz.findById(id);

        if (!quiz) {
            return res.status(404).json({
                result: false,
                error: 'Quiz non trouvé'
            });
        }

        // Vérifier les réponses
        let correctAnswers = 0;
        let totalPoints = 0;

        const results = quiz.quiz.map((question, index) => {
            const userAnswer = answers[index];
            const isCorrect = userAnswer === question.bonneReponseIndex;

            if (isCorrect) {
                correctAnswers++;
                totalPoints += question.points;
            }

            return {
                questionId: question._id,
                correct: isCorrect,
                correctAnswer: question.bonneReponseIndex,
                userAnswer: userAnswer,
                explication: question.explication,
                funFactReponse: question.funFactReponse,
                points: isCorrect ? question.points : 0
            };
        });

        // Calculer le score et les récompenses
        const scorePercentage = (correctAnswers / quiz.quiz.length) * 100;
        const isPerfectScore = correctAnswers === quiz.quiz.length;

        let bonusPoints = 0;
        let specialTitle = null;
        let rewardMessage = '';

        if (isPerfectScore && quiz.recompenses.parfait) {
            bonusPoints = quiz.recompenses.parfait.points;
            specialTitle = quiz.recompenses.parfait.titreSpecial;
            rewardMessage = quiz.recompenses.parfait.message;
        } else if (quiz.recompenses.premiereFois) {
            bonusPoints = quiz.recompenses.premiereFois.points;
            rewardMessage = quiz.recompenses.premiereFois.message;
        }

        const finalScore = totalPoints + bonusPoints;

        console.log(`✅ Quiz terminé: ${correctAnswers}/${quiz.quiz.length} (${finalScore} points)`);

        res.json({
            result: true,
            score: {
                correctAnswers,
                totalQuestions: quiz.quiz.length,
                percentage: scorePercentage,
                pointsEarned: totalPoints,
                bonusPoints,
                finalScore,
                isPerfect: isPerfectScore
            },
            rewards: {
                badge: quiz.badgeDebloque,
                specialTitle,
                message: rewardMessage,
                anecdoteBonus: quiz.anecdoteBonus
            },
            results: results
        });

    } catch (error) {
        console.error('❌ Erreur soumission quiz:', error);
        res.status(500).json({
            result: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;