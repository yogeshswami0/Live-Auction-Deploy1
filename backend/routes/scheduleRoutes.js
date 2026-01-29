const express = require("express");
const jwt = require("jsonwebtoken");
const Match = require("../models/Match");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_123";

const authenticateAdmin = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: "Missing Authorization header" });
    const token = auth.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Invalid Authorization header" });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.role !== "Admin") return res.status(403).json({ error: "Admin only" });
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
};

/**
 * Generate full tournament schedule
 * ADMIN ONLY
 */
router.post("/generate", authenticateAdmin, async (req, res) => {
    const { eventId, teams, venue, startDate, endDate } = req.body;
    if (!eventId || !teams || !Array.isArray(teams) || teams.length < 2) {
        return res.status(400).json({ error: "eventId and teams (min 2) required" });
    }
    if (!venue || !startDate || !endDate) {
        return res.status(400).json({ error: "venue, startDate, endDate required" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.max(
        1,
        Math.ceil((end - start) / (1000 * 60 * 60 * 24))
    );

    const STAGES = [
        { name: "League", type: "League" },
        { name: "Qualifier", type: "Knockout" },
        { name: "Semi Final", type: "Knockout" },
        { name: "Final", type: "Knockout" }
    ];

    let matches = [];
    let dayIndex = 0;

    STAGES.forEach((stage, roundIndex) => {
        for (let i = 0; i < teams.length - 1; i += 2) {
            const matchDate = new Date(start);
            matchDate.setDate(start.getDate() + (dayIndex % totalDays));

            matches.push({
                event: eventId,
                homeTeam: teams[i],
                awayTeam: teams[i + 1],
                startTime: matchDate,
                venue,
                stage: stage.name,
                type: stage.type,
                round: roundIndex + 1,
                timeSlot: "Evening (5–8)"
            });

            dayIndex++;
        }
    });

    await Match.insertMany(matches);
    res.json({ success: true });
});

/**
 * Get schedule for event
 */
router.get("/:eventId", async (req, res) => {
    const matches = await Match.find({ event: req.params.eventId })
        .populate("homeTeam awayTeam")
        .sort("startTime");

    res.json(matches);
});

module.exports = router;
