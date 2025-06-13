const express = require('express');
const router = express.Router();
const User = require('../database/models/User'); // Chemin corrigé selon ton architecture
const UserLocation = require('../database/models/UserLocation'); // À créer

// 🛡️ Fonction pour flouter les coordonnées (~100m de précision)
function blurCoordinates(lat, lng) {
    // Flouter à ~0.001 degré = ~110m
    const precision = 0.001;
    return {
        latitude: Math.round(lat / precision) * precision,
        longitude: Math.round(lng / precision) * precision
    };
}

// 🏠 Fonction pour vérifier si position dans la Safe Place
function isInSafePlace(lat, lng, safePlace, radiusMeters = 200) {
    if (!safePlace || !safePlace.latitude || !safePlace.longitude) {
        return false;
    }

    // Calcul distance approximative en mètres
    const latDiff = lat - safePlace.latitude;
    const lngDiff = lng - safePlace.longitude;
    const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff) * 111320; // ~111km par degré

    return distance <= radiusMeters;
}

// 📍 POST /users/location - Mettre à jour la position
router.post('/location', async (req, res) => {
    try {
        const { userId, latitude, longitude, speed = 0 } = req.body;

        // Validation
        if (!userId || !latitude || !longitude) {
            return res.status(400).json({
                error: 'userId, latitude et longitude requis'
            });
        }

        // Récupérer l'utilisateur avec ses paramètres
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        // Vérifier si partage de localisation activé
        if (!user.socialSettings.shareLocation) {
            return res.status(200).json({
                message: 'Localisation désactivée',
                nearbyUsers: []
            });
        }

        // 🏠 Vérifier Safe Place
        const inSafePlace = isInSafePlace(latitude, longitude, user.safePlace);

        // 🛡️ Flouter les coordonnées
        const blurredCoords = blurCoordinates(latitude, longitude);

        // Déterminer visibilité
        const isMoving = speed > user.socialSettings.minSpeed;
        const shouldBeVisible = isMoving &&
            !inSafePlace &&
            user.socialSettings.visibleWhenMoving;

        // Mettre à jour ou créer UserLocation
        const locationUpdate = {
            coordinates: blurredCoords,
            speed: speed,
            isVisible: shouldBeVisible,
            lastUpdate: new Date()
        };

        // Si en mouvement, mettre à jour lastMovement
        if (isMoving) {
            locationUpdate.lastMovement = new Date();
        }

        const userLocation = await UserLocation.findOneAndUpdate(
            { userId: userId },
            locationUpdate,
            { upsert: true, new: true }
        );

        // 👥 Trouver les utilisateurs visibles à proximité
        let nearbyUsers = [];
        const radius = user.socialSettings.visibilityRadius || 5;
        const nearbyLocations = await UserLocation.findVisibleUsersNearby(
            blurredCoords.latitude,
            blurredCoords.longitude,
            radius
        );

        // Filtrer et formater les données publiques
        nearbyUsers = nearbyLocations
            .filter(loc => loc.userId._id.toString() !== userId)
            .filter(loc => loc.userId.canBeSeenBy(user))
            .map(loc => ({
                id: loc.userId._id,
                username: loc.userId.username,
                avatar: loc.userId.avatar,
                coordinates: loc.coordinates, // Déjà floutées
                lastSeen: loc.lastMovement,
                // 🏆 FOCUS sur les récompenses et titres
                badges: loc.userId.badges.slice(-3), // 3 derniers badges/médailles
                achievements: {
                    totalBadges: loc.userId.badges.length,
                    perfectQuizzes: loc.userId.stats.totalQuizPerfect,
                    bestStreak: loc.userId.stats.bestStreak,
                    // Titre basé sur le niveau
                    title: getTitleFromStats(loc.userId.stats),
                    // Coupe basée sur les performances
                    trophy: getTrophyFromPerformance(loc.userId.stats)
                }
            }));


        res.status(200).json({
            success: true,
            isVisible: shouldBeVisible,
            inSafePlace: inSafePlace,
            nearbyUsers: nearbyUsers,
            userLocation: {
                coordinates: userLocation.coordinates,
                speed: userLocation.speed,
                lastUpdate: userLocation.lastUpdate
            }
        });

    } catch (error) {
        console.error('Erreur mise à jour localisation:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🏠 POST /users/safe-place - Définir la Safe Place
router.post('/safe-place', async (req, res) => {
    try {
        const { userId, address, latitude, longitude } = req.body;

        if (!userId || !latitude || !longitude) {
            return res.status(400).json({
                error: 'userId, latitude et longitude requis'
            });
        }

        const user = await User.findByIdAndUpdate(
            userId,
            {
                safePlace: {
                    address: address || 'Mon domicile',
                    latitude: latitude,
                    longitude: longitude,
                    createdAt: new Date()
                }
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'Utilisateur non trouvé' });
        }

        res.status(200).json({
            success: true,
            message: 'Safe Place définie',
            safePlace: user.safePlace
        });

    } catch (error) {
        console.error('Erreur Safe Place:', error);
        res.status(500).json({ error: 'Erreur serveur' });
    }
});

// 🏆 Fonction pour déterminer le titre basé sur les stats
function getTitleFromStats(stats) {
    const completed = stats.totalQuizCompleted || 0;
    const perfect = stats.totalQuizPerfect || 0;

    if (perfect >= 50) return "Maître Absolu";
    if (perfect >= 25) return "Expert Légende";
    if (perfect >= 10) return "As du Quiz";
    if (perfect >= 5) return "Champion";
    if (completed >= 100) return "Vétéran";
    if (completed >= 50) return "Explorateur";
    if (completed >= 20) return "Aventurier";
    if (completed >= 10) return "Apprenti";
    return "Débutant";
}

// 🏆 Fonction pour déterminer la coupe/trophée
function getTrophyFromPerformance(stats) {
    const avgScore = stats.averageScore || 0;
    const enchaînement = stats.bestStreak || 0; // bestStreak = meilleur enchaînement
    const perfect = stats.totalQuizPerfect || 0;

    // Trophées spéciaux pour performances exceptionnelles
    if (avgScore >= 95 && perfect >= 20) return "🏆 Trophée Diamant";
    if (avgScore >= 90 && perfect >= 15) return "🥇 Médaille d'Or";
    if (avgScore >= 85 && perfect >= 10) return "🥈 Médaille d'Argent";
    if (avgScore >= 80 && perfect >= 5) return "🥉 Médaille de Bronze";

    // Trophées basés sur les enchaînements
    if (enchaînement >= 20) return "🔥 Coupe de Feu";
    if (enchaînement >= 10) return "⚡ Coupe Éclair";
    if (enchaînement >= 5) return "⭐ Étoile Montante";

    return "🎯 En progression";
}

// 🧹 Tâche de nettoyage - Masquer les utilisateurs inactifs
setInterval(async () => {
    try {
        await UserLocation.hideInactiveUsers();
        console.log('🧹 Nettoyage utilisateurs inactifs effectué');
    } catch (error) {
        console.error('Erreur nettoyage:', error);
    }
}, 60000); // Toutes les minutes




// 🔧 POST /users/fix-social - Ajouter socialSettings manquants
router.post('/fix-social', async (req, res) => {
    try {
        const { userId } = req.body;

        const user = await User.findByIdAndUpdate(userId, {
            $set: {
                socialSettings: {
                    visibleWhenMoving: true,
                    minSpeed: 2.0,
                    autoHideDelay: 180,
                    mapVisibility: true,
                    showProfile: true,
                    shareLocation: true,
                    visibilityRadius: 5,
                    allowMessages: true
                }
            }
        }, { new: true });

        res.json({
            success: true,
            message: "SocialSettings ajoutés !",
            socialSettings: user.socialSettings
        });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// 🧪 POST /users/test-activate - Activer les faux users pour les tests
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

// 🧪 GET /users/test-status - Voir le statut des users actifs
router.get('/test-status', async (req, res) => {
    try {
        const activeUsers = await UserLocation.find({ isVisible: true })
            .populate('userId', 'username')
            .exec();

        const userStatus = activeUsers.map(loc => ({
            username: loc.userId.username,
            coordinates: loc.coordinates,
            speed: loc.speed,
            lastUpdate: loc.lastUpdate,
            lastMovement: loc.lastMovement
        }));

        res.status(200).json({
            success: true,
            activeUsersCount: activeUsers.length,
            users: userStatus
        });

    } catch (error) {
        console.error('❌ Erreur statut test:', error);
        res.status(500).json({ error: 'Erreur serveur' });
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



module.exports = router;