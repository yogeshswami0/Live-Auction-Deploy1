const express = require("express");
const jwt = require("jsonwebtoken");
const Match = require("../models/Match");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "super_secret_key_123";

/* =========================
   ADMIN AUTH
========================= */
const authenticateAdmin = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: "Missing Authorization header" });

    const token = auth.split(" ")[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        if (payload.role !== "Admin") return res.status(403).json({ error: "Admin only" });
        req.user = payload;
        next();
    } catch {
        return res.status(401).json({ error: "Invalid token" });
    }
};

/* =========================
   GENERATE SCHEDULE
========================= */
router.post("/generate", authenticateAdmin, async (req, res) => {
    try {
        const {
            eventId,
            teams,
            venue,
            startDate,
            endDate,
            tournamentType = "league",
            timeSlots = ["Evening (5–8)"],
            matchesPerDay = 1,
            knockoutTeamsCount = 4
        } = req.body;

        if (!eventId || !Array.isArray(teams) || teams.length < 2)
            return res.status(400).json({ error: "Invalid teams or eventId" });

        if (!venue || !startDate || !endDate)
            return res.status(400).json({ error: "venue and dates required" });

        await Match.deleteMany({ event: eventId });

        const start = new Date(startDate);
        const end = new Date(endDate);
        const totalDays = Math.max(1, Math.ceil((end - start) / 86400000));

        let matches = [];
        let dayIndex = 0;
        let slotIndex = 0;

        const getMatchDate = () => {
            const d = new Date(start);
            d.setDate(start.getDate() + (dayIndex % totalDays));
            return d;
        };

        const getTimeSlot = () => {
            const slot = timeSlots[slotIndex % timeSlots.length];
            slotIndex++;
            if (slotIndex % matchesPerDay === 0) dayIndex++;
            return slot;
        };

        /* =========================
           LEAGUE (ROUND ROBIN)
        ========================= */
        if (tournamentType !== "knockout") {
            let leagueTeams = [...teams];
            if (leagueTeams.length % 2 !== 0) leagueTeams.push(null);

            const n = leagueTeams.length;
            const rounds = n - 1;

            for (let round = 0; round < rounds; round++) {
                for (let i = 0; i < n / 2; i++) {
                    const home = leagueTeams[i];
                    const away = leagueTeams[n - 1 - i];
                    if (!home || !away) continue;

                    matches.push({
                        event: eventId,
                        homeTeam: home,
                        awayTeam: away,
                        venue,
                        stage: "League",
                        type: "League",
                        round: round + 1,
                        startTime: getMatchDate(),
                        timeSlot: getTimeSlot()
                    });
                }
                leagueTeams.splice(1, 0, leagueTeams.pop());
            }
        }

        /* =========================
           KNOCKOUT
        ========================= */
        if (tournamentType !== "league" && teams.length >= knockoutTeamsCount) {
            let koTeams = teams.slice(0, knockoutTeamsCount);
            let round = 1;

            while (koTeams.length > 1) {
                const stageName =
                    koTeams.length === 2 ? "Final" :
                    koTeams.length === 4 ? "Semi Final" :
                    "Qualifier";

                let nextRound = [];

                for (let i = 0; i < koTeams.length; i += 2) {
                    matches.push({
                        event: eventId,
                        homeTeam: koTeams[i],
                        awayTeam: koTeams[i + 1],
                        venue,
                        stage: stageName,
                        type: "Knockout",
                        round,
                        startTime: getMatchDate(),
                        timeSlot: getTimeSlot()
                    });
                    nextRound.push(null); // winner placeholder
                }

                koTeams = nextRound;
                round++;
            }
        }

        await Match.insertMany(matches);
        res.json({ success: true, totalMatches: matches.length });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Schedule generation failed" });
    }
});

/* =========================
   UPDATE MATCH
========================= */
router.put("/:id", authenticateAdmin, async (req, res) => {
    try {
        const { venue, date, timeSlot } = req.body;
        const updateData = {};
        if (venue) updateData.venue = venue;
        if (timeSlot) updateData.timeSlot = timeSlot;
        if (date) updateData.startTime = new Date(date);

        const match = await Match.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true }
        );
        res.json(match);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Update failed" });
    }
});

/* =========================
   DELETE MATCH
========================= */
router.delete("/:id", authenticateAdmin, async (req, res) => {
    try {
        await Match.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Delete failed" });
    }
});

/* =========================
   GET EVENT SCHEDULE
========================= */
router.get("/:eventId", async (req, res) => {
    const matches = await Match.find({ event: req.params.eventId })
        .populate("homeTeam awayTeam")
        .sort("startTime");

    res.json(matches);
});

module.exports = router;
