const mongoose = require('mongoose');

const userLocationSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'users', // ← Nom de ta collection
        required: true,
        // unique: true
    },
    coordinates: {
        latitude: {
            type: Number,
            required: true,
            min: -90,
            max: 90
        },
        longitude: {
            type: Number,
            required: true,
            min: -180,
            max: 180
        }
    },
    speed: {
        type: Number,
        default: 0,
        min: 0
    },
    isVisible: {
        type: Boolean,
        default: true
    },
    lastMovement: {
        type: Date,
        default: Date.now
    },
    lastUpdate: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Index géospatial pour les requêtes de proximité
userLocationSchema.index({
    "coordinates.latitude": 1,
    "coordinates.longitude": 1
});

// Index pour optimiser les requêtes par utilisateur
userLocationSchema.index({ userId: 1 });

// Index pour les requêtes par visibilité
userLocationSchema.index({ isVisible: 1 });

// Méthode pour vérifier si l'utilisateur est en mouvement
userLocationSchema.methods.isInMovement = function () {
    return this.speed > 2; // > 2 km/h
};

// Méthode pour vérifier si l'utilisateur doit être masqué (arrêté depuis 3 min)
userLocationSchema.methods.shouldBeHidden = function () {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);
    return this.lastMovement < threeMinutesAgo && this.speed <= 2;
};

// Méthode statique pour nettoyer les utilisateurs inactifs
userLocationSchema.statics.hideInactiveUsers = async function () {
    const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000);

    return await this.updateMany(
        {
            lastMovement: { $lt: threeMinutesAgo },
            speed: { $lte: 2 },
            isVisible: true
        },
        {
            isVisible: false
        }
    );
};

// Méthode statique pour trouver les utilisateurs visibles dans un rayon
userLocationSchema.statics.findVisibleUsersNearby = async function (lat, lng, radiusKm = 5) {
    const radiusDegrees = radiusKm / 111.32; // Approximation : 1 degré ≈ 111.32 km

    return await this.find({
        isVisible: true,
        'coordinates.latitude': {
            $gte: lat - radiusDegrees,
            $lte: lat + radiusDegrees
        },
        'coordinates.longitude': {
            $gte: lng - radiusDegrees,
            $lte: lng + radiusDegrees
        }
    }).populate('userId', 'username avatar score stats badges socialSettings');
};

module.exports = mongoose.model('UserLocation', userLocationSchema);