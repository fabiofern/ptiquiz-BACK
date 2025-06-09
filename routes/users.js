var express = require("express");
var router = express.Router();
const User = require("../database/models/User"); // chemin correct selon ton architecture
const bcrypt = require("bcrypt");
const uid2 = require("uid2");
const { checkBody } = require("../modules/checkBody");


router.get("/profile/:token", async (req, res) => {
	try {
		const user = await User.findOne({ token: req.params.token });

		if (!user) return res.json({ result: false, message: "Utilisateur non trouvé" });

		res.json({
			result: true,
			email: user.email,
			username: user.username,
			totalPoints: user.totalPoints,
			avatar: user.avatar,
		});
	} catch (error) {
		res.json({ result: false, message: "Erreur serveur", error: error.message });
	}
});

router.post("/addPoints", async (req, res) => {
	const { token, points } = req.body;
	if (!token || typeof points !== "number") {
		return res.json({ result: false, error: "Token ou points manquants" });
	}

	try {
		const update = await User.updateOne({ token }, { $inc: { totalPoints: points } });

		if (update.modifiedCount === 0) {
			return res.json({ result: false, message: "Utilisateur non trouvé" });
		}

		res.json({ result: true, message: "Points ajoutés" });
	} catch (error) {
		res.status(500).json({ result: false, error: "Erreur serveur", details: error.message });
	}
});

router.post("/signup", (req, res) => {
	if (!checkBody(req.body, ["email", "password"])) {
		return res.json({ result: false, error: "Missing or empty fields" });
		;
	}
	User.findOne({ email: req.body.email }).then((data) => {
		if (data) {
			res.json({ result: false, error: "User already exists" });
		} else {
			const newUser = new User({
				username: null,
				email: req.body.email,
				password: bcrypt.hashSync(req.body.password, 10),
				token: uid2(32),
				// totalPoints: 0,
				avatar: null,
				// scenarios: [],
			});
			newUser.save().then((data) => {
				res.json({ result: true, token: data.token, _id: data._id });
			});
		}
	})
});

// Dans routes/users.js - ajoutez cette route :
router.put("/locationPermissions", async (req, res) => {
	try {
		const { token, foreground, background } = req.body;

		if (!token) {
			return res.json({ result: false, error: "Token manquant" });
		}

		const updatedUser = await User.findOneAndUpdate(
			{ token },
			{
				$set: {
					locationPermissions: {
						foreground: foreground || false,
						background: background || false
					}
				}
			},
			{ new: true }
		);

		if (!updatedUser) {
			return res.json({ result: false, error: "Utilisateur introuvable" });
		}

		res.json({
			result: true,
			message: "Permissions mises à jour",
			locationPermissions: updatedUser.locationPermissions
		});

	} catch (error) {
		console.error("Erreur permissions:", error);
		res.json({ result: false, error: "Erreur interne" });
	}
});

router.post("/signin", async (req, res) => {
	if (!checkBody(req.body, ["email", "password"])) {
		return res.json({ result: false, error: "Missing or empty fields" });
	}
	try {
		const user = await User.findOne({ email: req.body.email });

		if (user && bcrypt.compareSync(req.body.password, user.password)) {
			const newToken = uid2(32);

			// Mettre à jour l'utilisateur et récupérer les nouvelles données
			const updatedUser = await User.findOneAndUpdate(
				{ email: req.body.email },
				{ $set: { token: newToken } },
				{ new: true } // Retourne l'utilisateur mis à jour avec le nouveau token
			);

			if (updatedUser) {
				return res.json({
					result: true,
					token: updatedUser.token,
					username: updatedUser.username,
					avatar: updatedUser.avatar,
					_id: updatedUser._id,
					//  AJOUT DES CHAMPS MANQUANTS
					score: updatedUser.score || 0,
					completedQuizzes: updatedUser.completedQuizzes || {},
					unlockedQuizzes: updatedUser.unlockedQuizzes || [],
					locationPermissions: updatedUser.locationPermissions || null,
					rewards: updatedUser.rewards || {
						medals: [],
						trophies: [],
						titles: []
					},
					statistics: updatedUser.statistics || {
						totalQuizzesCompleted: 0,
						perfectQuizzes: 0,
						streakDays: 0,
						lastPlayDate: null
					}
				});
			} else {
				return res.json({ result: false, error: "Failed to update token" });
			}
		} else {
			return res.json({ result: false, error: "User not found or wrong password" });
		}
	} catch (error) {
		console.error("Error during signin:", error);
		return res.status(500).json({ result: false, error: "Server error" });
	}
});

//// ROUTE UPDATEPROFIL : route pour modifier le username et l'image de l'avatar via le lien en BDD qui fait référence à l'image hébergée sur cloudinary
router.put("/updateProfil", async (req, res) => {
	try {
		const { token, username, avatar } = req.body;

		if (!token) {
			return res.json({ result: false, error: "Token manquant" });
		}

		// Création objet de modification
		const update = {};
		if (username) {
			const user = await User.findOne({ username });

			if (user && user.token !== token) {
				return res.json({ result: false, error: "Username already exists" });
			} else {
				update.username = username;
			}
		}
		if (avatar) {
			update.avatar = avatar;
		}

		//  MODIFICATION : Utiliser findOneAndUpdate pour récupérer les données
		const updatedUser = await User.findOneAndUpdate(
			{ token },
			update,
			{ new: true } // Retourne l'utilisateur mis à jour
		);

		if (!updatedUser) {
			return res.json({ result: false, error: "Utilisateur introuvable" });
		}

		//  RETOURNER LES DONNÉES MISES À JOUR
		res.json({
			result: true,
			message: "Profil mis à jour",
			// Données pour le frontend
			username: updatedUser.username,
			avatar: updatedUser.avatar
		});

	} catch (error) {
		res.json({ result: false, error: "Erreur interne", details: error.message });
	}
});

//// ROUTE DELETE TOKEN : route pour supprimer le token de l'utilisateur
router.put("/deleteToken", async (req, res) => {
	try {
		const { token } = req.body;
		const updateResult = await User.updateOne({ token }, { $set: { token: null } });

		if (updateResult.modifiedCount === 0) {
			return res.json({ result: false, message: "Token introuvable" });
		}

		res.json({ result: true, message: "Token supprimé" });

	} catch (error) {
		console.error("Erreur dans la route DELETE /deleteToken :", error);
		res.status(500).json({ result: false, message: "Erreur serveur" });
	}
});

module.exports = router;
