const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const User = require('./models/User');
const Player = require('./models/Player');
const Team = require('./models/Team');
const Event = require('./models/Event');
const Bid = require('./models/Bid');
const Match = require('./models/Match');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_123';

// Simple express middleware to protect REST endpoints
const authenticate = (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Missing Authorization header' });
    const token = auth.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Invalid Authorization header' });
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid token' });
    }
};

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.log("❌ DB Error:", err));

const getActiveEvent = async () => {
    const active = await Event.findOne({ isActive: true });
    if (active) return active;
    const fallback = await Event.findOne();
    return fallback;
};

const scheduleMatchesForEvent = async (eventId) => {
    const event = await Event.findById(eventId);
    if (!event || !event.startTime) return;
    const teams = await Team.find({ event: eventId }).sort({ createdAt: 1 });
    if (teams.length < 2) return;
    const existingMatches = await Match.find({ event: eventId });
    const existingPairs = new Set(existingMatches.map(m => `${m.homeTeam.toString()}-${m.awayTeam.toString()}`));
    let index = existingMatches.length;
    for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
            const homeId = teams[i]._id.toString();
            const awayId = teams[j]._id.toString();
            const key = `${homeId}-${awayId}`;
            if (existingPairs.has(key)) continue;
            const startTime = new Date(event.startTime.getTime() + index * 2 * 60 * 60 * 1000);
            await Match.create({
                event: eventId,
                homeTeam: teams[i]._id,
                awayTeam: teams[j]._id,
                startTime,
                type: 'League'
            });
            existingPairs.add(key);
            index += 1;
        }
    }
};

let auctionState = {
    currentPlayer: null,
    highestBid: 0,
    highestBidder: null,
    highestBidderId: null,
    timer: 30,
    isActive: false,
    timerInterval: null,
    bidHistory: []
};

// --- ROUTES ---

app.post('/api/register', async (req, res) => {
    try {
        const { name, email, password, role } = req.body;
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email, password: hashedPassword, role });
        await newUser.save();
        // Return the user so frontend gets the _id
        res.status(201).json({ message: "User created", user: newUser });
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ error: "User not found" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ error: "Invalid credentials" });
        const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
        const team = await Team.findOne({ owner: user._id });
        res.json({ token, user: { id: user._id, name: user.name, role: user.role }, team });
    } catch (error) { res.status(500).json({ error: error.message }); }
});

app.get('/api/events', authenticate, async (req, res) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Insufficient privileges' });
    const events = await Event.find().sort({ createdAt: -1 });
    res.json(events);
});

app.post('/api/events', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Insufficient privileges' });
        const event = new Event(req.body);
        await event.save();
        res.status(201).json(event);
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete('/api/events/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Insufficient privileges' });
        const eventId = req.params.id;
        await Event.findByIdAndDelete(eventId);
        res.json({ message: 'Event deleted' });
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/events/active', async (req, res) => {
    const events = await Event.find({ isActive: true }).sort({ createdAt: -1 });
    res.json(events);
});

app.post('/api/events/:id/activate', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Insufficient privileges' });
        const eventId = req.params.id;
        await Event.updateMany({}, { isActive: false });
        const updated = await Event.findByIdAndUpdate(eventId, { isActive: true }, { new: true });
        res.json(updated);
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/events/:id/matches', authenticate, async (req, res) => {
    try {
        const eventId = req.params.id;
        const matches = await Match.find({ event: eventId }).populate('homeTeam').populate('awayTeam');
        res.json(matches);
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/players', async (req, res) => {
    const filter = {};
    const eventId = req.query.eventId;
    if (eventId) filter.event = eventId;
    const players = await Player.find(filter);
    res.json(players);
});

app.get('/api/admin/players', authenticate, async (req, res) => {
    if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Insufficient privileges' });
    const eventId = req.query.eventId;
    const filter = {};
    if (eventId) filter.event = eventId;
    const players = await Player.find(filter);
    res.json(players);
});

app.post('/api/players/register', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Player') return res.status(403).json({ error: 'Only players can register profiles' });
        const activeEvent = await getActiveEvent();
        if (!activeEvent) return res.status(400).json({ error: 'No active event found. Contact admin.' });
        const payload = {
            user: req.user.id,
            event: activeEvent._id,
            name: req.body.name,
            age: req.body.age,
            role: req.body.role,
            basePrice: req.body.basePrice,
            photo: req.body.photo,
            stats: req.body.stats
        };
        const newPlayer = new Player(payload);
        await newPlayer.save();
        res.status(201).json(newPlayer);
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/players/me', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Player') return res.status(403).json({ error: 'Only players can access this resource' });
        const activeEvent = await getActiveEvent();
        if (!activeEvent) return res.status(400).json({ error: 'No active event found. Contact admin.' });
        const player = await Player.findOne({ user: req.user.id, event: activeEvent._id });
        if (!player) return res.status(404).json({ error: 'Profile not found for active event' });
        res.json(player);
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.put('/api/players/me', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Player') return res.status(403).json({ error: 'Only players can update this resource' });
        const activeEvent = await getActiveEvent();
        if (!activeEvent) return res.status(400).json({ error: 'No active event found. Contact admin.' });
        const player = await Player.findOne({ user: req.user.id, event: activeEvent._id });
        if (!player) return res.status(404).json({ error: 'Profile not found for active event' });
        if (typeof req.body.name === 'string') player.name = req.body.name;
        if (typeof req.body.age === 'number') player.age = req.body.age;
        if (typeof req.body.role === 'string') player.role = req.body.role;
        if (typeof req.body.basePrice === 'number') player.basePrice = req.body.basePrice;
        if (typeof req.body.photo === 'string') player.photo = req.body.photo;
        if (req.body.stats && typeof req.body.stats === 'object') {
            const stats = req.body.stats;
            if (typeof stats.matches === 'number') player.stats.matches = stats.matches;
            if (typeof stats.runs === 'number') player.stats.runs = stats.runs;
            if (typeof stats.wickets === 'number') player.stats.wickets = stats.wickets;
            if (typeof stats.rating === 'number') player.stats.rating = stats.rating;
        }
        await player.save();
        res.json(player);
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/admin/players/:id/approve', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Insufficient privileges' });
        const player = await Player.findByIdAndUpdate(req.params.id, { status: 'Approved' }, { new: true });
        res.json(player);
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/admin/players/:id/reauction', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Insufficient privileges' });
        const updates = { status: 'Approved' };
        if (typeof req.body.basePrice === 'number' && req.body.basePrice > 0) {
            updates.basePrice = req.body.basePrice;
        }
        const player = await Player.findByIdAndUpdate(req.params.id, updates, { new: true });
        res.json(player);
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.delete('/api/admin/players/:id', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Admin') return res.status(403).json({ error: 'Insufficient privileges' });
        await Player.findByIdAndDelete(req.params.id);
        res.json({ message: 'Player deleted' });
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.post('/api/teams/register', authenticate, async (req, res) => {
    try {
        if (req.user.role !== 'Owner' && req.user.role !== 'Admin') return res.status(403).json({ error: 'Insufficient privileges' });
        const activeEvent = await getActiveEvent();
        if (!activeEvent) return res.status(400).json({ error: 'No active event found. Contact admin.' });
        const teamData = { ...req.body, event: activeEvent._id };
        if (req.user.role === 'Owner') teamData.owner = req.user.id;
        const newTeam = new Team(teamData);
        if (activeEvent.teamBudget && activeEvent.teamBudget > 0) {
            newTeam.budget = activeEvent.teamBudget;
            newTeam.remainingBudget = activeEvent.teamBudget;
        }
        await newTeam.save();
        await scheduleMatchesForEvent(activeEvent._id);
        res.status(201).json(newTeam);
    } catch (error) { res.status(400).json({ error: error.message }); }
});

app.get('/api/teams', async (req, res) => {
    const teams = await Team.find().populate('players');
    res.json(teams);
});

app.get('/api/teams/owner/:ownerId', async (req, res) => {
    const team = await Team.findOne({ owner: req.params.ownerId }).populate('players');
    res.json(team);
});

// --- SOCKET ENGINE ---
//const io = new Server(server, { cors: { origin: "*" } });

const io = new Server(server, {
    cors: {
        origin: process.env.FRONTEND_URL || "http://localhost:3000",
        methods: ["GET", "POST"]
    }
});

// Socket authentication: expect `auth: { token }` from client when connecting
io.use(async (socket, next) => {
    try {
        const token = socket.handshake.auth && socket.handshake.auth.token;
        if (!token) return next(); // allow anonymous sockets for public viewers
        const payload = jwt.verify(token, JWT_SECRET);
        socket.user = payload; // { id, role }
        return next();
    } catch (err) {
        return next();
    }
});

const finalizeAuction = async () => {
    const { currentPlayer, highestBid, highestBidderId } = auctionState;
    auctionState.isActive = false;
    if (highestBidderId) {
        const team = await Team.findById(highestBidderId);
        const player = await Player.findById(currentPlayer._id).populate('user');
        if (team && player) {
            if (team.remainingBudget >= highestBid) {
                team.remainingBudget -= highestBid;
                team.players.push(player._id);
                await team.save();
                player.status = 'Sold';
                player.wonBy = team._id;
                player.currentPrice = highestBid;
                await player.save();
                await Bid.create({
                    event: player.event,
                    player: player._id,
                    team: team._id,
                    amount: highestBid
                });
                const payload = {
                    status: "SOLD",
                    player: player.name,
                    playerId: player._id,
                    playerUserId: player.user ? player.user._id : null,
                    team: team.teamName,
                    teamId: team._id,
                    teamOwnerId: team.owner,
                    price: highestBid
                };
                io.emit("auction_result", payload);
                io.emit("congratulations_trigger", payload);
            } else {
                player.status = 'Unsold';
                await player.save();
                io.emit("auction_result", {
                    status: "UNSOLD",
                    player: player.name,
                    playerId: player._id,
                    playerUserId: player.user ? player.user._id : null
                });
            }
        }
    } else {
        const player = await Player.findById(currentPlayer._id).populate('user');
        if (player) {
            player.status = 'Unsold';
            await player.save();
            io.emit("auction_result", {
                status: "UNSOLD",
                player: player.name,
                playerId: player._id,
                playerUserId: player.user ? player.user._id : null
            });
        } else {
            io.emit("auction_result", { status: "UNSOLD", player: currentPlayer.name });
        }
    }
    auctionState.currentPlayer = null;
    auctionState.bidHistory = [];
    io.emit("auction_ended");
};

io.on('connection', (socket) => {
    socket.on("admin_start_auction", async (playerId) => {
        if (!socket.user || socket.user.role !== 'Admin') return socket.emit('error', { message: 'Unauthorized' });
        if (auctionState.isActive) return socket.emit('error', { message: 'Another auction is already active' });
        const player = await Player.findById(playerId).populate('event');
        const activeEvent = await getActiveEvent();
        if (!player || player.status !== 'Approved') return;
        if (!activeEvent || !player.event || player.event.toString() !== activeEvent._id.toString()) return;
        auctionState = {
            ...auctionState,
            currentPlayer: player,
            highestBid: player.basePrice,
            timer: 30,
            isActive: true,
            highestBidderId: null,
            highestBidder: "Base Price",
            bidHistory: [{
                bidder: "Base Price",
                amount: player.basePrice,
                time: new Date().toLocaleTimeString()
            }]
        };
        io.emit("auction_started", auctionState);
        const interval = setInterval(() => {
            if (auctionState.timer > 0) {
                auctionState.timer--;
                io.emit("timer_update", auctionState.timer);
            } else {
                clearInterval(interval);
                finalizeAuction();
            }
        }, 1000);
    });

    socket.on("place_bid", async ({ teamId, teamName, bidAmount }) => {
        if (!auctionState.isActive || bidAmount <= auctionState.highestBid) return;
        if (!socket.user) return socket.emit('error', { message: 'Unauthorized' });
        const team = await Team.findById(teamId).populate('players');
        if (!team || team.remainingBudget < bidAmount) return;
        if (socket.user.role !== 'Admin' && team.owner.toString() !== socket.user.id) return socket.emit('error', { message: 'You do not own this team' });
        if (!auctionState.currentPlayer || !auctionState.currentPlayer.event) return;
        if (!team.event || team.event.toString() !== auctionState.currentPlayer.event.toString()) return;
        const currentRole = auctionState.currentPlayer.role;
        const event = await Event.findById(team.event);
        let roleLimit = null;
        if (event && event.roleLimits) {
            if (currentRole === 'Batsman') roleLimit = event.roleLimits.batsman;
            if (currentRole === 'Bowler') roleLimit = event.roleLimits.bowler;
            if (currentRole === 'All-Rounder') roleLimit = event.roleLimits.allRounder;
            if (currentRole === 'Wicketkeeper') roleLimit = event.roleLimits.wicketkeeper;
        }
        if (roleLimit && roleLimit > 0) {
            const currentRoleCount = team.players.filter(p => p.role === currentRole).length;
            if (currentRoleCount >= roleLimit) return;
        }
        await Bid.create({
            event: auctionState.currentPlayer.event,
            player: auctionState.currentPlayer._id,
            team: team._id,
            amount: bidAmount
        });
        io.emit("bid_placed", { teamName, amount: bidAmount });
        auctionState.highestBid = bidAmount;
        auctionState.highestBidder = teamName;
        auctionState.highestBidderId = teamId;
        auctionState.bidHistory.unshift({ bidder: teamName, amount: bidAmount, time: new Date().toLocaleTimeString() });
        if (auctionState.timer < 10) auctionState.timer = 20;
        io.emit("update_bid", { highestBid: auctionState.highestBid, highestBidder: auctionState.highestBidder, timer: auctionState.timer, bidHistory: auctionState.bidHistory });
    });
});

//server.listen(5000, () => console.log("🚀 Server running on port 5000"));
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
