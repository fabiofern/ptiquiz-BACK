const express = require('express');
const router = express.Router();
const User = require('../database/models/User');
const Duel = require('../database/models/Duel');

// 🎯 Fonction utilitaire pour trouver les quiz communs
async function findCommonQuizzes(userId1, userId2) {
    const user1 = await User.findById(userId1);
    const user2 = await User.findById(userId2);

    if (!user1 || !user2) {
        throw new Error('Utilisateurs non trouvés');
    }

    // Trouver les quiz débloqués par les deux
    const user1Quizzes = user1.unlockedQuizzes || [];
    const user2Quizzes = user2.unlockedQuizzes || [];

    const commonQuizzes = user1Quizzes.filter(quizId =>
        user2Quizzes.includes(quizId)
    );

    console.log(`👥 Quiz communs trouvés: ${commonQuizzes.length}`);
    return commonQuizzes;
}

// 🎲 Fonction pour générer les questions de duel
async function generateDuelQuestions(commonQuizIds) {
    const questionsNeeded = 10;
    const questions = [];

    // Ici, tu devras adapter selon ta structure de quiz
    // Je simule la récupération des questions depuis tes quiz
    try {
        // Récupérer tous les quiz communs (adapter selon ta DB)
        const allQuestions = [];

        for (const quizId of commonQuizIds) {
            // Simuler la récupération - adapte selon ta structure
            const quizQuestions = await getQuestionsFromQuiz(quizId);
            allQuestions.push(...quizQuestions);
        }

        if (allQuestions.length < questionsNeeded) {
            throw new Error(`Pas assez de questions (${allQuestions.length}/${questionsNeeded})`);
        }

        // Mélanger et prendre 10 questions
        const shuffled = allQuestions.sort(() => 0.5 - Math.random());
        return shuffled.slice(0, questionsNeeded);

    } catch (error) {
        console.error('❌ Erreur génération questions:', error);
        throw error;
    }
}

// 🎯 Fonction helper pour récupérer les questions d'un quiz
async function getQuestionsFromQuiz(quizId) {
    // ⚠️ À ADAPTER selon ta structure de quiz !
    // Exemple si tes quiz sont dans une collection séparée :

    try {
        // Supposons que tu aies une collection Quiz ou que les questions soient dans User
        // const quiz = await Quiz.findById(quizId);
        // return quiz.questions.map(q => ({
        //   quizId: quizId,
        //   questionId: q._id,
        //   question: q.question,
        //   answers: q.answers,
        //   correctAnswer: q.correctAnswer,
        //   points: q.points || 10
        // }));

        // 🧪 SIMULATION pour le test - REMPLACE par ta vraie logique
        return Array.from({ length: 5 }, (_, i) => ({
            quizId: quizId,
            questionId: `q_${i}_${Date.now()}`,
            question: `Question ${i + 1} du quiz ${quizId}`,
            answers: [
                "Réponse A",
                "Réponse B",
                "Réponse C",
                "Réponse D"
            ],
            correctAnswer: Math.floor(Math.random() * 4),
            points: 10
        }));

    } catch (error) {
        console.error(`❌ Erreur récupération quiz ${quizId}:`, error);
        return [];
    }
}

// ⚔️ POST /duels/challenge - Défier un joueur
router.post('/challenge', async (req, res) => {
    try {
        const { challengerId, challengedId } = req.body;

        if (!challengerId || !challengedId) {
            return res.status(400).json({
                success: false,
                error: 'IDs des joueurs requis'
            });
        }

        if (challengerId === challengedId) {
            return res.status(400).json({
                success: false,
                error: 'Impossible de se défier soi-même'
            });
        }

        // Vérifier qu'il n'y a pas déjà un duel en cours
        const existingDuel = await Duel.findOne({
            $or: [
                { challenger: challengerId, challenged: challengedId },
                { challenger: challengedId, challenged: challengerId }
            ],
            status: { $in: ['pending', 'active'] }
        });

        if (existingDuel) {
            return res.status(400).json({
                success: false,
                error: 'Un duel est déjà en cours entre ces joueurs'
            });
        }

        // Trouver les quiz communs
        const commonQuizzes = await findCommonQuizzes(challengerId, challengedId);

        if (commonQuizzes.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Aucun quiz commun débloqué entre les joueurs'
            });
        }

        // Générer les questions
        const questions = await generateDuelQuestions(commonQuizzes);

        // Créer le duel
        const duel = new Duel({
            challenger: challengerId,
            challenged: challengedId,
            questions: questions,
            status: 'pending'
        });

        await duel.save();

        // Populer les infos des joueurs pour la réponse
        await duel.populate('challenger challenged', 'username avatar');

        console.log(`⚔️ Duel créé: ${duel.challenger.username} vs ${duel.challenged.username}`);

        res.status(201).json({
            success: true,
            message: 'Défi envoyé !',
            duel: {
                id: duel._id,
                challenger: duel.challenger,
                challenged: duel.challenged,
                questionsCount: duel.questions.length,
                status: duel.status,
                expiresAt: duel.expiresAt
            }
        });

    } catch (error) {
        console.error('❌ Erreur création défi:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// ✅ POST /duels/:duelId/accept - Accepter un duel
router.post('/:duelId/accept', async (req, res) => {
    try {
        const { duelId } = req.params;
        const { userId } = req.body;

        const duel = await Duel.findById(duelId);
        if (!duel) {
            return res.status(404).json({
                success: false,
                error: 'Duel non trouvé'
            });
        }

        // Vérifier que c'est bien le joueur défié
        if (duel.challenged.toString() !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Vous n\'êtes pas autorisé à accepter ce duel'
            });
        }

        // Vérifier que le duel est en attente
        if (duel.status !== 'pending') {
            return res.status(400).json({
                success: false,
                error: 'Ce duel ne peut plus être accepté'
            });
        }

        // Accepter le duel
        duel.status = 'active';
        duel.acceptedAt = new Date();
        await duel.save();

        await duel.populate('challenger challenged', 'username avatar');

        console.log(`✅ Duel accepté: ${duel._id}`);

        res.status(200).json({
            success: true,
            message: 'Duel accepté ! Que le meilleur gagne !',
            duel: {
                id: duel._id,
                challenger: duel.challenger,
                challenged: duel.challenged,
                status: duel.status,
                questionsCount: duel.questions.length
            }
        });

    } catch (error) {
        console.error('❌ Erreur acceptation duel:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// ❌ POST /duels/:duelId/decline - Refuser un duel
router.post('/:duelId/decline', async (req, res) => {
    try {
        const { duelId } = req.params;
        const { userId } = req.body;

        const duel = await Duel.findById(duelId);
        if (!duel) {
            return res.status(404).json({
                success: false,
                error: 'Duel non trouvé'
            });
        }

        if (duel.challenged.toString() !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Vous n\'êtes pas autorisé à refuser ce duel'
            });
        }

        duel.status = 'declined';
        await duel.save();

        res.status(200).json({
            success: true,
            message: 'Duel refusé'
        });

    } catch (error) {
        console.error('❌ Erreur refus duel:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// 🎯 GET /duels/:duelId/questions - Récupérer les questions du duel
router.get('/:duelId/questions', async (req, res) => {
    try {
        const { duelId } = req.params;
        const { userId } = req.query;

        const duel = await Duel.findById(duelId);
        if (!duel) {
            return res.status(404).json({
                success: false,
                error: 'Duel non trouvé'
            });
        }

        // Vérifier que l'utilisateur peut jouer
        if (!duel.canPlay(userId)) {
            return res.status(403).json({
                success: false,
                error: 'Vous n\'êtes pas autorisé à jouer ce duel'
            });
        }

        // Vérifier que l'utilisateur n'a pas déjà terminé
        if (duel.hasPlayerCompleted(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Vous avez déjà terminé ce duel'
            });
        }

        // Retourner les questions sans les bonnes réponses
        const questionsForPlayer = duel.questions.map((q, index) => ({
            index: index,
            question: q.question,
            answers: q.answers,
            points: q.points
        }));

        res.status(200).json({
            success: true,
            duel: {
                id: duel._id,
                status: duel.status,
                questionsCount: duel.questions.length
            },
            questions: questionsForPlayer
        });

    } catch (error) {
        console.error('❌ Erreur récupération questions:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// 🎯 POST /duels/:duelId/submit - Soumettre les réponses
router.post('/:duelId/submit', async (req, res) => {
    try {
        const { duelId } = req.params;
        const { userId, answers, totalTime } = req.body;

        const duel = await Duel.findById(duelId);
        if (!duel) {
            return res.status(404).json({
                success: false,
                error: 'Duel non trouvé'
            });
        }

        if (!duel.canPlay(userId)) {
            return res.status(403).json({
                success: false,
                error: 'Vous n\'êtes pas autorisé à jouer ce duel'
            });
        }

        if (duel.hasPlayerCompleted(userId)) {
            return res.status(400).json({
                success: false,
                error: 'Vous avez déjà soumis vos réponses'
            });
        }

        // Calculer le score
        let score = 0;
        const detailedAnswers = answers.map((answer, index) => {
            const question = duel.questions[index];
            const isCorrect = answer.selectedAnswer === question.correctAnswer;
            if (isCorrect) score += question.points;

            return {
                questionIndex: index,
                selectedAnswer: answer.selectedAnswer,
                isCorrect: isCorrect,
                timeSpent: answer.timeSpent || 0
            };
        });

        // Sauvegarder les résultats
        const isChallenger = duel.challenger.toString() === userId;
        const playerKey = isChallenger ? 'challenger' : 'challenged';

        duel.results[playerKey] = {
            score: score,
            answers: detailedAnswers,
            completedAt: new Date(),
            totalTime: totalTime || 0
        };

        await duel.save();

        // Vérifier si les deux joueurs ont terminé
        const bothCompleted = duel.results.challenger.completedAt &&
            duel.results.challenged.completedAt;

        let gameResult = {
            yourScore: score,
            maxScore: duel.questions.length * 10,
            completed: bothCompleted
        };

        if (bothCompleted) {
            // Calculer le gagnant
            const winner = duel.calculateWinner();
            await duel.save();

            await duel.populate('challenger challenged winner', 'username avatar');

            gameResult = {
                ...gameResult,
                opponentScore: isChallenger ? duel.results.challenged.score : duel.results.challenger.score,
                winner: duel.isDraw ? null : duel.winner,
                isDraw: duel.isDraw,
                duelCompleted: true,
                challenger: duel.challenger,
                challenged: duel.challenged
            };

            console.log(`🏆 Duel terminé: ${duel._id} - Gagnant: ${duel.isDraw ? 'Égalité' : duel.winner.username}`);
        }

        res.status(200).json({
            success: true,
            message: 'Réponses soumises !',
            result: gameResult
        });

    } catch (error) {
        console.error('❌ Erreur soumission réponses:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// 📊 GET /duels/user/:userId/pending - Duels en attente
router.get('/user/:userId/pending', async (req, res) => {
    try {
        const { userId } = req.params;

        const pendingDuels = await Duel.findPendingDuels(userId);

        res.status(200).json({
            success: true,
            duels: pendingDuels
        });

    } catch (error) {
        console.error('❌ Erreur récupération duels en attente:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// 📊 GET /duels/user/:userId/active - Duels actifs
router.get('/user/:userId/active', async (req, res) => {
    try {
        const { userId } = req.params;

        const activeDuels = await Duel.findActiveDuels(userId);

        res.status(200).json({
            success: true,
            duels: activeDuels
        });

    } catch (error) {
        console.error('❌ Erreur récupération duels actifs:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

// 📊 GET /duels/user/:userId/history - Historique des duels
router.get('/user/:userId/history', async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 10;

        const history = await Duel.findDuelHistory(userId, limit);
        const stats = await Duel.getDuelStats(userId);

        res.status(200).json({
            success: true,
            history: history,
            stats: stats
        });

    } catch (error) {
        console.error('❌ Erreur récupération historique:', error);
        res.status(500).json({
            success: false,
            error: 'Erreur serveur'
        });
    }
});

module.exports = router;