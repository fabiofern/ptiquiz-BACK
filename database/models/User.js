const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
	// 👤 Informations de base (existantes)
	username: String,
	email: String,
	password: String,
	token: String,
	avatar: String,
	hasProfile: String,

	// 📍 Permissions géolocalisation (existantes)
	locationPermissions: {
		foreground: { type: Boolean, default: false },
		background: { type: Boolean, default: false }
	},

	// 🎯 NOUVEAUX CHAMPS QUIZ
	// Score total de l'utilisateur
	score: {
		type: Number,
		default: 0
	},

	// Quiz débloqués (array d'IDs de quiz)
	unlockedQuizzes: [{
		type: String, // ID du quiz en string
		default: []
	}],

	// Quiz complétés avec détails
	completedQuizzes: {
		type: Map,
		of: {
			name: String,           // Nom du quiz
			score: Number,          // Score obtenu
			totalPoints: Number,    // Points totaux possibles
			percentage: Number,     // Pourcentage de réussite
			badge: String,          // Badge débloqué
			completedAt: Date,      // Date de completion
			theme: String,          // Thème du quiz
			answers: [{             // Détail des réponses (optionnel)
				questionId: String,
				selectedAnswer: Number,
				isCorrect: Boolean,
				points: Number
			}]
		},
		default: new Map()
	},

	// 🏆 Statistiques et récompenses
	badges: [{
		name: String,
		unlockedAt: Date,
		quizId: String
	}],

	// 📊 Statistiques de jeu
	stats: {
		totalQuizCompleted: { type: Number, default: 0 },
		totalQuizPerfect: { type: Number, default: 0 },
		averageScore: { type: Number, default: 0 },
		bestStreak: { type: Number, default: 0 },
		currentStreak: { type: Number, default: 0 },
		lastPlayedAt: Date,

		// Statistiques par thème
		themeStats: {
			type: Map,
			of: {
				completed: { type: Number, default: 0 },
				totalScore: { type: Number, default: 0 },
				averageScore: { type: Number, default: 0 }
			},
			default: new Map()
		}
	},

	// 🎮 Préférences de jeu
	gameSettings: {
		notificationsEnabled: { type: Boolean, default: true },
		soundEnabled: { type: Boolean, default: true },
		difficultySetting: {
			type: String,
			enum: ['Facile', 'Moyenne', 'Difficile', 'Toutes'],
			default: 'Toutes'
		},
		preferredThemes: [String] // Thèmes préférés
	},

	// 📅 Dates importantes
	createdAt: { type: Date, default: Date.now },
	lastLoginAt: Date,
	lastLocationUpdate: Date
});

// 📊 Méthodes pour calculer les statistiques
userSchema.methods.updateStats = function () {
	const completedQuizzes = this.completedQuizzes;
	const completed = completedQuizzes.size;

	if (completed === 0) {
		this.stats.totalQuizCompleted = 0;
		this.stats.averageScore = 0;
		return;
	}

	let totalScore = 0;
	let totalPossible = 0;
	let perfectCount = 0;
	const themeStats = new Map();

	for (const [quizId, quizData] of completedQuizzes) {
		totalScore += quizData.score;
		totalPossible += quizData.totalPoints;

		if (quizData.score === quizData.totalPoints) {
			perfectCount++;
		}

		// Stats par thème
		const theme = quizData.theme;
		if (theme) {
			const current = themeStats.get(theme) || { completed: 0, totalScore: 0, averageScore: 0 };
			current.completed++;
			current.totalScore += quizData.score;
			current.averageScore = current.totalScore / current.completed;
			themeStats.set(theme, current);
		}
	}

	this.stats.totalQuizCompleted = completed;
	this.stats.totalQuizPerfect = perfectCount;
	this.stats.averageScore = totalPossible > 0 ? Math.round((totalScore / totalPossible) * 100) : 0;
	this.stats.themeStats = themeStats;
	this.stats.lastPlayedAt = new Date();
};

// 🎯 Méthode pour débloquer un quiz
userSchema.methods.unlockQuiz = function (quizId) {
	if (!this.unlockedQuizzes.includes(quizId)) {
		this.unlockedQuizzes.push(quizId);
		console.log(`🎉 Quiz ${quizId} débloqué pour ${this.username}`);
		return true;
	}
	return false;
};

// 🏆 Méthode pour compléter un quiz
userSchema.methods.completeQuiz = function (quizId, quizData) {
	// Ancien score pour ce quiz (si rejouée)
	const previousData = this.completedQuizzes.get(quizId);
	const previousScore = previousData ? previousData.score : 0;

	// Mettre à jour le quiz complété
	this.completedQuizzes.set(quizId, {
		...quizData,
		completedAt: new Date()
	});

	// Mettre à jour le score total (uniquement si amélioration)
	const scoreDifference = quizData.score - previousScore;
	if (scoreDifference > 0) {
		this.score = (this.score || 0) + scoreDifference;
	}

	// Mettre à jour les statistiques
	this.updateStats();

	console.log(`✅ Quiz ${quizId} complété: ${quizData.score}/${quizData.totalPoints} points`);
};

// 🔍 Méthode pour vérifier si un quiz est débloqué
userSchema.methods.isQuizUnlocked = function (quizId) {
	return this.unlockedQuizzes.includes(quizId);
};

// 📊 Méthode pour obtenir le classement de l'utilisateur
userSchema.methods.getRank = async function () {
	const higherScoreCount = await this.constructor.countDocuments({
		score: { $gt: this.score }
	});
	return higherScoreCount + 1;
};

// 🎮 Méthode pour obtenir les quiz recommandés
userSchema.methods.getRecommendedThemes = function () {
	const themeStats = this.stats.themeStats;
	const preferences = this.gameSettings.preferredThemes || [];

	// Combiner préférences et performance
	const recommendations = [];

	for (const [theme, stats] of themeStats) {
		if (stats.averageScore < 70) { // Moins de 70% de réussite
			recommendations.push({
				theme,
				reason: 'À améliorer',
				priority: 'high'
			});
		}
	}

	preferences.forEach(theme => {
		if (!recommendations.find(r => r.theme === theme)) {
			recommendations.push({
				theme,
				reason: 'Thème préféré',
				priority: 'medium'
			});
		}
	});

	return recommendations;
};

const User = mongoose.model('users', userSchema);

module.exports = User;