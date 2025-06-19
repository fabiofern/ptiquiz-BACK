var express = require("express");
var router = express.Router();
const jwt = require('jsonwebtoken');
const User = require("../database/models/User"); // chemin correct selon ton architecture
const bcrypt = require("bcrypt");
const uid2 = require("uid2");
const { checkBody } = require("../modules/checkBody");
const verifySecureToken = require("../middlewares/verifySecureToken");


router.get("/profile/:token", verifySecureToken, async (req, res) => {
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
				const secureToken = jwt.sign({ userId: data._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
				res.json({ result: true, token: data.token, secureToken, _id: data._id });
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
				const secureToken = jwt.sign({ userId: updatedUser._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
				return res.json({
					result: true,
					token: updatedUser.token,
					secureToken,
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


router.post('/test-activate', async (req, res) => {
	try {
		console.log('🧪 Activation des faux users pour test...');

		// Positions dans Paris pour les faux users
		const testPositions = [
			{
				username: "JulieQuizPro",
				coordinates: { latitude: 48.8606, longitude: 2.3472 },
				speed: 3.5 // En mouvement à pied
			},
			{
				username: "AishaVeteran",
				coordinates: { latitude: 48.8676, longitude: 2.3633 },
				speed: 4.2 // En mouvement
			},
			{
				username: "LucasChampion",
				coordinates: { latitude: 48.8540, longitude: 2.3359 },
				speed: 2.8 // En mouvement lent
			},
			{
				username: "EmmaExploratrice",
				coordinates: { latitude: 48.8420, longitude: 2.3219 },
				speed: 5.1 // En mouvement rapide
			},
			{
				username: "KarimStriker",
				coordinates: { latitude: 48.8826, longitude: 2.3379 },
				speed: 3.0 // En mouvement
			}
		];

		let activatedCount = 0;

		for (const testUser of testPositions) {
			try {
				// Trouver l'utilisateur par username
				const user = await User.findOne({ username: testUser.username });
				if (!user) {
					console.log(`❌ User ${testUser.username} non trouvé`);
					continue;
				}

				// Flouter les coordonnées comme en vrai
				const blurredCoords = blurCoordinates(
					testUser.coordinates.latitude,
					testUser.coordinates.longitude
				);

				// Créer/mettre à jour UserLocation
				await UserLocation.findOneAndUpdate(
					{ userId: user._id },
					{
						coordinates: blurredCoords,
						speed: testUser.speed,
						isVisible: true, // Forcer visible pour le test
						lastMovement: new Date(),
						lastUpdate: new Date()
					},
					{ upsert: true, new: true }
				);

				activatedCount++;
				console.log(`✅ ${testUser.username} activé à ${blurredCoords.latitude}, ${blurredCoords.longitude}`);

			} catch (error) {
				console.error(`❌ Erreur activation ${testUser.username}:`, error);
			}
		}

		res.status(200).json({
			success: true,
			message: `${activatedCount} utilisateurs activés pour le test`,
			activatedUsers: activatedCount,
			totalPositions: testPositions.length
		});

	} catch (error) {
		console.error('❌ Erreur activation test users:', error);
		res.status(500).json({ error: 'Erreur serveur' });
	}
});

// 🧪 GET /users/test-status 
router.get('/test-status', async (req, res) => {
	try {
		console.log('🔍 Vérification statut test...');

		// Version simple sans populate
		const activeUsers = await UserLocation.find({ isVisible: true });

		console.log(`📊 ${activeUsers.length} utilisateurs actifs trouvés`);

		res.status(200).json({
			success: true,
			activeUsersCount: activeUsers.length,
			users: activeUsers
		});

	} catch (error) {
		console.error('❌ Erreur statut test:', error.message);
		console.error('Stack:', error.stack);
		res.status(500).json({
			error: 'Erreur serveur',
			details: error.message
		});
	}
});

// 🧹 POST /users/test-cleanup - Nettoyer les données de test
router.post('/test-cleanup', async (req, res) => {
	try {
		const result = await UserLocation.deleteMany({});

		res.status(200).json({
			success: true,
			message: `${result.deletedCount} positions supprimées`,
			deletedCount: result.deletedCount
		});

	} catch (error) {
		console.error('❌ Erreur nettoyage test:', error);
		res.status(500).json({ error: 'Erreur serveur' });
	}
});

// 🔓 PUT - Débloquer un quiz basé sur la position
router.put('/unlock/:userId', async (req, res) => {
	try {
		const { userId } = req.params;
		const { userLatitude, userLongitude, forceUnlockAll } = req.body;

		console.log('🔍 Tentative déverrouillage pour user:', userId);
		console.log('📍 Position:', userLatitude, userLongitude);

		// Récupérer l'utilisateur
		const user = await User.findById(userId);
		if (!user) {
			return res.json({ result: false, error: 'Utilisateur non trouvé' });
		}

		// Récupérer tous les quiz
		const allQuiz = await Quiz.find({});
		console.log(`📊 ${allQuiz.length} quiz trouvés en base`);

		// Fonction de calcul de distance
		const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
			const R = 6371e3;
			const toRad = (x) => (x * Math.PI) / 180;
			const dLat = toRad(lat2 - lat1);
			const dLon = toRad(lon2 - lon1);
			const a = Math.sin(dLat / 2) ** 2 +
				Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
			const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
			return R * c;
		};

		const currentUnlocked = user.unlockedQuizzes || [];
		const newUnlocked = [];
		const nearbyQuiz = [];

		// 🎯 BOUCLE CORRIGÉE
		allQuiz.forEach(quiz => {
			const quizId = quiz._id.toString();

			// Si forceUnlockAll est true, débloquer tous les quiz
			if (forceUnlockAll) {
				if (!currentUnlocked.includes(quizId)) {
					newUnlocked.push(quizId);
					nearbyQuiz.push({
						id: quizId,
						name: quiz.name,
						distance: 0
					});
				}
				return;
			}

			// Vérifier la distance si coordonnées fournies
			if (userLatitude && userLongitude && quiz.location) {
				const distance = getDistanceInMeters(
					userLatitude,
					userLongitude,
					parseFloat(quiz.location.latitude),
					parseFloat(quiz.location.longitude)
				);

				// 🎯 RAYON ÉNORME pour test
				const unlockRadius = 200;

				console.log(`📏 Quiz "${quiz.name}": ${Math.round(distance)}m (seuil: ${unlockRadius}m)`);

				if (distance <= unlockRadius && !currentUnlocked.includes(quizId)) {
					newUnlocked.push(quizId);
					nearbyQuiz.push({
						id: quizId,
						name: quiz.name,
						distance: Math.round(distance)
					});
				}
			} else {
				// 🐛 DEBUG - Log si problème de structure
				console.log(`❌ Quiz "${quiz.name}" - Pas de coordonnées valides:`, {
					hasUserCoords: !!(userLatitude && userLongitude),
					hasQuizLocation: !!quiz.location,
					quizLocation: quiz.location
				});
			}
		});

		// Mettre à jour la BDD si nouveaux déverrouillages
		if (newUnlocked.length > 0) {
			await User.findByIdAndUpdate(userId, {
				$set: {
					unlockedQuizzes: [...currentUnlocked, ...newUnlocked]
				}
			});

			console.log(`🎉 ${newUnlocked.length} nouveau(x) quiz débloqué(s) !`);
		}

		res.json({
			result: true,
			newUnlocked: newUnlocked.length,
			unlockedQuizzes: [...currentUnlocked, ...newUnlocked],
			nearbyQuiz,
			message: newUnlocked.length > 0
				? `🎉 ${newUnlocked.length} nouveau(x) quiz débloqué(s) !`
				: 'Aucun nouveau quiz à débloquer'
		});

	} catch (error) {
		console.error('❌ Erreur déverrouillage:', error);
		res.json({ result: false, error: error.message });
	}
});
module.exports = router;
