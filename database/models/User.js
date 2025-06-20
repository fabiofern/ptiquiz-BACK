const mongoose = require('mongoose');


const userSchema = mongoose.Schema({
	// Dans models/User.js (ajouter ces champs à ton schema existant)
	socialSettings: {
		// Paramètres de visibilité existants
		visibleWhenMoving: {
			type: Boolean,
			default: false
		},
		minSpeed: {
			type: Number,
			default: 2.0 // km/h
		},
		autoHideDelay: {
			type: Number,
			default: 180 // secondes (3 minutes)
		},
		// NOUVEAUX paramètres map sociale
		mapVisibility: {
			type: Boolean,
			default: true
		},
		showProfile: {
			type: Boolean,
			default: true
		},
		shareLocation: {
			type: Boolean,
			default: true
		},
		visibilityRadius: {
			type: Number,
			default: 5, // kilomètres
			min: 1,
			max: 50
		},
		allowMessages: {
			type: Boolean,
			default: true
		}
	},
	safePlace: {
		address: String,        // Adresse saisie par l'user
		latitude: Number,       // Coordonnée latitude
		longitude: Number,      // Coordonnée longitude  
		radius: {              // Rayon de protection en mètres
			type: Number,
			default: 200
		},
		createdAt: Date        // Date de création
	},
	// 👤 Informations de base (existantes)
	username: String,
	email: String,
	password: String,
	token: String,
	avatar: String,

	// SYSTÈME QUIZ
	score: { type: Number, default: 0 },
	completedQuizzes: { type: Object, default: {} },
	unlockedQuizzes: { type: Array, default: [] },
	scenarios: { type: Array, default: [] },

	// PERMISSIONS GÉOLOCALISATION
	locationPermissions: {
		foreground: { type: Boolean, default: false },
		background: { type: Boolean, default: false }
	},

	// RÉCOMPENSES
	rewards: {
		medals: { type: Array, default: [] },
		trophies: { type: Array, default: [] },
		titles: { type: Array, default: [] }
	},

	// 🏆 Statistiques et récompenses (VOS CHAMPS ACTUELS)
	badges: [{
		name: String,
		unlockedAt: Date,
		quizId: String
	}],

	// --- NOUVEAUX CHAMPS IMPORTANTS POUR LES DONNÉES DUEL ET RÉCOMPENSES ---
	// Ajout de duelStats (pour les stats de duels)
	duelStats: {
		victories: { type: Number, default: 0 },
		defeats: { type: Number, default: 0 },
		winRate: { type: Number, default: 0 }, // Calculé ou stocké
		rank: { type: String, default: 'Recrue' }, // Rang duelliste
		vsYou: { type: Array, default: [] } // Historique des duels contre un utilisateur spécifique
	},
	// Ajout de achievements (pour le trophée principal et les stats générales du profil)
	achievements: {
		totalBadges: { type: Number, default: 0 }, // Nombre total de badges
		perfectQuizzes: { type: Number, default: 0 }, // Nombre de quiz parfaits
		bestStreak: { type: Number, default: 0 }, // Meilleure série
		trophy: { type: String, default: 'Explorateur TiQuiz' }, // Texte du trophée principal (ex: "Trophée Diamant")
		title: { type: String, default: 'Aventurier TiQuiz' } // Titre du joueur (ex: "Maître des énigmes")
	},
	// ---------------------------------------------------------------------

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

	// Mettre à jour les achievements basés sur les stats
	this.achievements.perfectQuizzes = perfectCount;
	// this.achievements.totalBadges = this.badges.length; // Assurez-vous que badges est bien un Array si c'est comme ça que vous le gérez
	// Logique pour mettre à jour 'bestStreak' et 'trophy' / 'title' devrait être dans RewardsService
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

userSchema.methods.canBeSeenBy = function (otherUser) {
	// Note: this.socialSettings.mapVisibility et this.socialSettings.shareLocation
	// sont déjà des Boolean par défaut dans votre schéma.
	return this.socialSettings.mapVisibility &&
		this.socialSettings.shareLocation &&
		this.socialSettings.showProfile;
};

// Méthode pour obtenir les infos publiques pour la map
userSchema.methods.getPublicMapInfo = function () {
	return {
		id: this._id,
		username: this.username,
		avatar: this.avatar,
		score: this.score, // Utilise ton score existant
		// MODIFIÉ : Inclure les objets complets duelStats et achievements
		duelStats: this.duelStats || {}, // Assure qu'il y a un objet même s'il est vide
		achievements: this.achievements || {}, // Assure qu'il y a un objet même s'il est vide
		stats: { // Ces stats sont déjà bien définies dans votre schéma
			totalQuizCompleted: this.stats.totalQuizCompleted,
			averageScore: this.stats.averageScore,
			bestStreak: this.stats.bestStreak
		},
		badges: this.badges.slice(-3), // Les 3 derniers badges
		canReceiveMessages: this.socialSettings.allowMessages,
		lastPlayedAt: this.stats.lastPlayedAt
	};
};

const User = mongoose.model('users', userSchema);

module.exports = User;