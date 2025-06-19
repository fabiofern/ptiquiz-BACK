var express = require("express");
var router = express.Router();
const jwt = require('jsonwebtoken');
const User = require("../database/models/User"); // Chemin correct vers le modèle User
const Quiz = require("../database/models/Quiz"); // Import du modèle Quiz
const UserLocation = require("../database/models/UserLocation"); // Import du modèle UserLocation

const bcrypt = require("bcrypt");
const uid2 = require("uid2");
const { checkBody } = require("../modules/checkBody");
const verifySecureToken = require("../middlewares/verifySecureToken");

// Fonction utilitaire pour flouter les coordonnées pour la confidentialité
const blurCoordinates = (latitude, longitude, blurFactor = 0.0001) => {
	const blurredLat = latitude + (Math.random() - 0.5) * blurFactor;
	const blurredLon = longitude + (Math.random() - 0.5) * blurFactor;
	return { latitude: blurredLat, longitude: blurredLon };
};

// Fonction pour calculer la distance (nécessaire pour le déverrouillage des quiz et le rayon social)
const getDistanceInMeters = (lat1, lon1, lat2, lon2) => {
	const R = 6371e3; // Rayon de la Terre en mètres
	const toRad = (x) => (x * Math.PI) / 180;
	const dLat = toRad(lat2 - lat1);
	const dLon = toRad(lon2 - lon1);
	const a = Math.sin(dLat / 2) ** 2 +
		Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
	const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
	return R * c;
};

// --- ROUTES ---

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
				avatar: null,
			});
			newUser.save().then((data) => {
				const secureToken = jwt.sign({ userId: data._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
				res.json({ result: true, token: data.token, secureToken, _id: data._id });
			});
		}
	})
});

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

			const updatedUser = await User.findOneAndUpdate(
				{ email: req.body.email },
				{ $set: { token: newToken } },
				{ new: true }
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

router.put("/updateProfil", async (req, res) => {
	try {
		const { token, username, avatar } = req.body;

		if (!token) {
			return res.json({ result: false, error: "Token manquant" });
		}

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

		const updatedUser = await User.findOneAndUpdate(
			{ token },
			update,
			{ new: true }
		);

		if (!updatedUser) {
			return res.json({ result: false, error: "Utilisateur introuvable" });
		}

		res.json({
			result: true,
			message: "Profil mis à jour",
			username: updatedUser.username,
			avatar: updatedUser.avatar
		});

	} catch (error) {
		res.json({ result: false, error: "Erreur interne", details: error.message });
	}
});

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

		const testPositions = [
			{
				username: "JulieQuizPro",
				coordinates: { latitude: 48.8606, longitude: 2.3472 },
				speed: 3.5
			},
			{
				username: "AishaVeteran",
				coordinates: { latitude: 48.8676, longitude: 2.3633 },
				speed: 4.2
			},
			{
				username: "LucasChampion",
				coordinates: { latitude: 48.8540, longitude: 2.3359 },
				speed: 2.8
			},
			{
				username: "EmmaExploratrice",
				coordinates: { latitude: 48.8420, longitude: 2.3219 },
				speed: 5.1
			},
			{
				username: "KarimStriker",
				coordinates: { latitude: 48.8826, longitude: 2.3379 },
				speed: 3.0
			}
		];

		let activatedCount = 0;

		for (const testUser of testPositions) {
			try {
				const user = await User.findOne({ username: testUser.username });
				if (!user) {
					console.log(`❌ User ${testUser.username} non trouvé`);
					continue;
				}

				const blurredCoords = blurCoordinates(
					testUser.coordinates.latitude,
					testUser.coordinates.longitude
				);

				await UserLocation.findOneAndUpdate(
					{ userId: user._id },
					{
						coordinates: blurredCoords,
						speed: testUser.speed,
						isVisible: true,
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

router.get('/test-status', async (req, res) => {
	try {
		console.log('🔍 Vérification statut test...');

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

// 🔓 PUT - Débloquer un quiz basé sur la position ET récupérer les utilisateurs à proximité
router.put('/unlock/:userId', async (req, res) => {
	try {
		const { userId } = req.params;
		const { userLatitude, userLongitude, forceUnlockAll } = req.body;

		console.log('🔍 Tentative déverrouillage pour user:', userId);
		console.log('📍 Position reçue:', userLatitude, userLongitude);

		// Récupérer l'utilisateur principal
		const user = await User.findById(userId);
		if (!user) {
			return res.json({ result: false, error: 'Utilisateur non trouvé' });
		}

		// --- PARTIE GESTION DES QUIZ ---
		const allQuiz = await Quiz.find({});
		console.log(`📊 ${allQuiz.length} quiz trouvés en base`);

		const currentUnlocked = user.unlockedQuizzes || [];
		const newUnlockedQuizIds = [];
		const newlyUnlockedQuizNames = []; // Pour envoyer les noms au frontend

		allQuiz.forEach(quiz => {
			const quizId = quiz._id.toString();

			if (forceUnlockAll) {
				if (!currentUnlocked.includes(quizId)) {
					newUnlockedQuizIds.push(quizId);
					newlyUnlockedQuizNames.push(quiz.name);
				}
				return;
			}

			// Vérifier la distance si coordonnées fournies et valides
			// ATTENTION : J'utilise quiz.location.latitude et quiz.location.longitude
			// car votre schéma Quiz utilise le champ 'location'.
			// Si vous avez mis à jour le schéma Quiz pour avoir des Numbers, c'est parfait.
			// Si c'est toujours des Strings dans votre DB, assurez-vous que parseFloat() les gère bien.
			if (userLatitude && userLongitude && quiz.location?.latitude && quiz.location?.longitude) {
				const distance = getDistanceInMeters(
					userLatitude,
					userLongitude,
					parseFloat(quiz.location.latitude), // Assurez-vous que c'est bien quiz.location
					parseFloat(quiz.location.longitude) // Assurez-vous que c'est bien quiz.location
				);

				const unlockRadius = 100; // Rayon de déverrouillage (100m)

				// console.log(`📏 Quiz "${quiz.name}": ${Math.round(distance)}m (seuil: ${unlockRadius}m)`); // Décommenter pour débogage

				if (distance <= unlockRadius && !currentUnlocked.includes(quizId)) {
					newUnlockedQuizIds.push(quizId);
					newlyUnlockedQuizNames.push(quiz.name);
				}
			} else {
				console.warn(`⚠️ Quiz "${quiz.name}" ignoré: Coordonnées de quiz invalides ou userLocation manquante. Quiz coords:`, quiz.location);
			}
		});

		// Mettre à jour la BDD si nouveaux déverrouillages
		if (newUnlockedQuizIds.length > 0) {
			await User.findByIdAndUpdate(userId, {
				$set: {
					unlockedQuizzes: [...currentUnlocked, ...newUnlockedQuizIds]
				}
			});
			console.log(`🎉 ${newUnlockedQuizIds.length} nouveau(x) quiz débloqué(s) pour ${user.username}!`);
		}

		// --- NOUVELLE PARTIE : MISE À JOUR DE LA POSITION SOCIALE ET RÉCUPÉRATION DES UTILISATEURS À PROXIMITÉ ---
		let nearbyUsers = [];
		let isUserVisible = false;

		if (userLatitude && userLongitude) {
			// Flouter les coordonnées avant de les stocker
			const blurredUserCoords = blurCoordinates(userLatitude, userLongitude);

			// Mettre à jour la position de l'utilisateur actuel dans UserLocation
			const updatedUserLocation = await UserLocation.findOneAndUpdate(
				{ userId: user._id },
				{
					coordinates: blurredUserCoords,
					lastUpdate: new Date(),
					lastMovement: new Date(), // À ajuster si vous avez une logique de mouvement distincte
					isVisible: true, // L'utilisateur est actif, donc potentiellement visible
				},
				{ upsert: true, new: true } // Crée si n'existe pas, renvoie le doc mis à jour
			);

			isUserVisible = updatedUserLocation.isVisible; // Récupérer le statut de visibilité réel

			const socialRadiusKm = 2; // Rayon social : 2km
			// Utilisation de la méthode statique findVisibleUsersNearby du modèle UserLocation
			const allActiveNearbyUserLocations = await UserLocation.findVisibleUsersNearby(
				userLatitude,
				userLongitude,
				socialRadiusKm
			);

			// Filtrer et formater les utilisateurs proches pour le frontend
			for (const otherUserLocation of allActiveNearbyUserLocations) {
				// Exclure l'utilisateur actuel
				if (otherUserLocation.userId._id.toString() === user._id.toString()) {
					continue;
				}

				if (otherUserLocation.coordinates?.latitude && otherUserLocation.coordinates?.longitude) {
					const distance = getDistanceInMeters(
						userLatitude,
						userLongitude,
						otherUserLocation.coordinates.latitude,
						otherUserLocation.coordinates.longitude
					);

					// Re-vérifier la distance car findVisibleUsersNearby utilise une approximation
					if (distance <= (socialRadiusKm * 1000)) { // Convertir km en mètres pour la vérification exacte
						nearbyUsers.push({
							id: otherUserLocation.userId._id,
							username: otherUserLocation.userId.username,
							avatar: otherUserLocation.userId.avatar,
							location: { // Format attendu par le frontend
								latitude: otherUserLocation.coordinates.latitude,
								longitude: otherUserLocation.coordinates.longitude,
							},
							// Ajouter les champs nécessaires pour le profil modal ou UserMarker
							duelStats: otherUserLocation.userId.duelStats || {},
							achievements: otherUserLocation.userId.achievements || {},
							// badges: otherUserLocation.userId.badges || [], // Si vous voulez les badges directement
							// score: otherUserLocation.userId.score || 0, // Si vous voulez le score directement
							distance: Math.round(distance) // Utile pour débogage ou affichage
						});
					}
				} else {
					console.warn(`⚠️ Utilisateur social "${otherUserLocation.userId?.username}" ignoré: Coordonnées invalides dans UserLocation.`, otherUserLocation.coordinates);
				}
			}
			console.log(`👥 ${nearbyUsers.length} utilisateurs à proximité trouvés.`);
		} else {
			console.warn(`⚠️ Impossible de mettre à jour la position sociale: userLatitude ou userLongitude manquant.`);
		}

		res.json({
			result: true,
			user: {
				unlockedQuizzes: [...currentUnlocked, ...newUnlockedQuizIds],
				rewards: user.rewards,
			},
			newUnlockedCount: newUnlockedQuizIds.length,
			unlockedQuizNames: newlyUnlockedQuizNames,
			nearbyUsers: nearbyUsers,
			isVisible: isUserVisible,
		});

	} catch (error) {
		console.error('❌ Erreur déverrouillage et social:', error);
		res.status(500).json({ result: false, error: 'Erreur serveur interne', details: error.message });
	}
});

module.exports = router;