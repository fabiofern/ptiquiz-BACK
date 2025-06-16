

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
	email: String,
	password: String,
	username: String,
	token: String,
	avatar: String,
	totalPoints: Number,
	scenarios: [String], // Ou un tableau d’IDs de quiz terminés
});

module.exports = mongoose.model("users", userSchema);

