const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
	// CHAMPS PRINCIPAUX
	email: { type: String, required: true, unique: true }, // unique: true suffit !
	password: { type: String, required: true },
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

	// STATISTIQUES
	statistics: {
		totalQuizzesCompleted: { type: Number, default: 0 },
		perfectQuizzes: { type: Number, default: 0 },
		streakDays: { type: Number, default: 0 },
		lastPlayDate: Date
	}
}, {
	timestamps: true
});


userSchema.index({ token: 1 });

module.exports = mongoose.model("users", userSchema);