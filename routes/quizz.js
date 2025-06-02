const express = require("express");
const router = express.Router();
const Quizz = require("../database/models/quizz");

// GET - Récupérer tous les lieux avec leurs quiz
router.get("/", async (req, res) => {
    try {
        const quizzList = await Quizz.find();
        res.json(quizzList);
    } catch (error) {
        console.error("Erreur lors de la récupération des quiz :", error);
        res.status(500).json({ result: false, error: "Erreur serveur" });
    }
});

module.exports = router;
