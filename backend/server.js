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
const AuditLog = require('./models/AuditLog');

const {
    initializeRedis,
    getAuctionState,
    setAuctionState,
    updateAuctionField,
    clearAuctionState,
    addBidToHistory,
    getBidHistory,
    atomicBidPlacement,
    acquireFinalizeLock,
    releaseFinalizeLock,
    setLastBidTime,
    getLastBidTime
} = require('./redisClient');

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

// Initialize Redis
let timerInterval = null;

initializeRedis().then(async () => {
    // Initialize clean auction state on server start
    await setAuctionState({
        isActive: false,
        isPaused: false,
        timer: 0,
        currentPlayer: null,
        highestBid: 0,
        highestBidder: null,
        bidHistory: [],
        startedAt: null,
        pausedAt: null,
        remainingTimeOnPause: null
    });
    console.log("✅ Auction state initialized in Redis");
}).catch((err) => {
    console.error("❌ Redis initialization failed:", err);
    process.exit(1);
});

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

// Auction state now managed in Redis (see redisClient.js)
// timerInterval is managed in memory for server lifecycle

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

// Get bid increment for an event based on current price
app.get('/api/events/:id/bid-increment', async (req, res) => {
    try {
        const eventId = req.params.id;
        const currentPrice = parseInt(req.query.currentPrice) || 0;

        const event = await Event.findById(eventId);
        if (!event) return res.status(404).json({ error: 'Event not found' });

        let increment;
        if (event.usePriceTiers && event.priceTiers && event.priceTiers.length > 0) {
            const tier = event.priceTiers.find(t =>
                currentPrice >= t.minPrice && currentPrice < t.maxPrice
            );
            increment = tier ? tier.increment : event.bidIncrement;
        } else {
            increment = event.bidIncrement;
        }

        res.json({ increment });
    } catch (error) {
        res.status(400).json({ error: error.message });
    }
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
    // Acquire distributed lock to prevent multiple finalization
    const lockAcquired = await acquireFinalizeLock();
    if (!lockAcquired) {
        console.log('Finalization already in progress by another instance');
        return;
    }

    try {
        const state = await getAuctionState();
        const { currentPlayer, highestBid, highestBidder } = state;
        const highestBidderId = state.highestBidder ? state.highestBidder.teamId : null;

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

                    // Audit log
                    await AuditLog.create({
                        event: player.event,
                        player: player._id,
                        action: 'auction_finalized',
                        performedBy: team.owner,
                        details: { teamName: team.teamName, finalBid: highestBid, status: 'SOLD' }
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

                    // Audit log
                    await AuditLog.create({
                        event: player.event,
                        player: player._id,
                        action: 'auction_finalized',
                        performedBy: team.owner,
                        details: { reason: 'Insufficient budget', status: 'UNSOLD' }
                    });

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

                // Audit log
                if (player.event) {
                    await AuditLog.create({
                        event: player.event,
                        player: player._id,
                        action: 'auction_finalized',
                        performedBy: player.user ? player.user._id : null,
                        details: { reason: 'No bids', status: 'UNSOLD' }
                    });
                }

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

        // Clear auction state in Redis
        await clearAuctionState();
        io.emit("auction_ended");

    } catch (error) {
        console.error('Error finalizing auction:', error);
    } finally {
        await releaseFinalizeLock();
    }
};

// Helper function to calculate bid increment
const calculateBidIncrement = (event, currentPrice) => {
    if (event.usePriceTiers && event.priceTiers && event.priceTiers.length > 0) {
        const tier = event.priceTiers.find(t =>
            currentPrice >= t.minPrice && currentPrice < t.maxPrice
        );
        return tier ? tier.increment : event.bidIncrement;
    }
    return event.bidIncrement;
};

io.on('connection', (socket) => {
    // Admin Start Auction (modified for Redis)
    socket.on("admin_start_auction", async (playerId) => {
        try {
            if (!socket.user || socket.user.role !== 'Admin') {
                return socket.emit('error', { message: 'Unauthorized' });
            }

            const state = await getAuctionState();
            if (state.isActive) {
                return socket.emit('error', { message: 'Another auction is already active' });
            }

            const player = await Player.findById(playerId).populate('event');
            const activeEvent = await getActiveEvent();

            if (!player || player.status !== 'Approved') {
                return socket.emit('error', { message: 'Player not found or not approved' });
            }

            if (!activeEvent || !player.event || player.event.toString() !== activeEvent._id.toString()) {
                return socket.emit('error', { message: 'Player not in active event' });
            }

            const event = await Event.findById(activeEvent._id);
            const currentIncrement = calculateBidIncrement(event, player.basePrice);

            // Initialize auction state in Redis
            const newState = {
                isActive: true,
                isPaused: false,
                currentPlayer: player,
                highestBid: player.basePrice,
                highestBidder: { teamId: null, teamName: "Base Price" },
                timer: 30,
                bidHistory: [{
                    bidder: "Base Price",
                    amount: player.basePrice,
                    time: new Date().toLocaleTimeString()
                }],
                startedAt: Date.now(),
                pausedAt: null,
                remainingTimeOnPause: null
            };

            await setAuctionState(newState);
            await clearAuctionState(); // Clear old bid history
            await addBidToHistory({
                teamName: "Base Price",
                bidAmount: player.basePrice,
                timestamp: Date.now()
            });

            // Audit log
            await AuditLog.create({
                event: activeEvent._id,
                player: player._id,
                action: 'auction_started',
                performedBy: socket.user.id,
                details: { playerName: player.name, basePrice: player.basePrice }
            });

            io.emit("auction_started", {
                currentPlayer: player,
                highestBid: player.basePrice,
                timer: 30,
                currentIncrement,
                bidHistory: newState.bidHistory
            });

            // Start timer interval
            if (timerInterval) clearInterval(timerInterval);
            timerInterval = setInterval(async () => {
                try {
                    const currentState = await getAuctionState();

                    // Skip countdown if paused
                    if (currentState.isPaused) return;

                    if (currentState.timer > 0) {
                        const newTimer = currentState.timer - 1;
                        await updateAuctionField('timer', newTimer);
                        io.emit("timer_update", newTimer);
                    } else {
                        // Check if a bid was placed in the last 10 seconds (edge case protection)
                        const lastBidTime = await getLastBidTime();
                        const timeSinceLastBid = lastBidTime ? Date.now() - lastBidTime : Infinity;

                        if (timeSinceLastBid < 10000) {
                            // Bid placed within last 10s, extend timer
                            await updateAuctionField('timer', 20);
                            io.emit('timer_extended', { newTimer: 20, extensionSeconds: 20 });
                            return;
                        }

                        // Finalize auction
                        clearInterval(timerInterval);
                        await finalizeAuction();
                    }
                } catch (error) {
                    console.error('Timer interval error:', error);
                }
            }, 1000);

        } catch (error) {
            console.error('Error starting auction:', error);
            socket.emit('error', { message: 'Failed to start auction' });
        }
    });

    // Place Bid (completely rewritten with Redis + atomic operations)
    socket.on("place_bid", async ({ teamId, teamName, bidAmount }) => {
        try {
            // Authentication check
            if (!socket.user) {
                return socket.emit('error', { message: 'Unauthorized' });
            }

            // Get current state
            const currentState = await getAuctionState();

            if (!currentState.isActive) {
                return socket.emit('bid_rejected', { message: 'No active auction' });
            }

            if (currentState.isPaused) {
                return socket.emit('bid_rejected', { message: 'Auction is paused' });
            }

            // Fetch team and validate
            const team = await Team.findById(teamId).populate('players');
            if (!team) {
                return socket.emit('bid_rejected', { message: 'Team not found' });
            }

            if (team.remainingBudget < bidAmount) {
                return socket.emit('bid_rejected', {
                    message: 'Insufficient budget',
                    remainingBudget: team.remainingBudget
                });
            }

            // Authorization: Only team owner can bid (or admin)
            if (socket.user.role !== 'Admin' && team.owner.toString() !== socket.user.id) {
                return socket.emit('error', { message: 'You do not own this team' });
            }

            // Validate player and event match
            if (!currentState.currentPlayer || !currentState.currentPlayer.event) {
                return socket.emit('bid_rejected', { message: 'No player in auction' });
            }

            if (!team.event || team.event.toString() !== currentState.currentPlayer.event.toString()) {
                return socket.emit('bid_rejected', { message: 'Team not in this event' });
            }

            // Fetch event to get bid increment rules and role limits
            const event = await Event.findById(team.event);
            if (!event) {
                return socket.emit('bid_rejected', { message: 'Event not found' });
            }

            // Calculate required increment
            const requiredIncrement = calculateBidIncrement(event, currentState.highestBid);

            // Validate bid meets increment requirement
            if (bidAmount < currentState.highestBid + requiredIncrement) {
                return socket.emit('bid_rejected', {
                    message: `Bid must be at least ₹${requiredIncrement.toLocaleString('en-IN')} higher`,
                    requiredBid: currentState.highestBid + requiredIncrement,
                    requiredIncrement
                });
            }

            // Validate role limits
            const currentRole = currentState.currentPlayer.role;
            let roleLimit = null;
            if (event.roleLimits) {
                if (currentRole === 'Batsman') roleLimit = event.roleLimits.batsman;
                if (currentRole === 'Bowler') roleLimit = event.roleLimits.bowler;
                if (currentRole === 'All-Rounder') roleLimit = event.roleLimits.allRounder;
                if (currentRole === 'Wicketkeeper') roleLimit = event.roleLimits.wicketkeeper;
            }

            if (roleLimit && roleLimit > 0) {
                const currentRoleCount = team.players.filter(p => p.role === currentRole).length;
                if (currentRoleCount >= roleLimit) {
                    return socket.emit('bid_rejected', {
                        message: `${currentRole} limit reached (${roleLimit} max)`,
                        roleLimit
                    });
                }
            }

            // Atomic bid placement with Redis transaction
            const result = await atomicBidPlacement({
                teamId,
                teamName,
                bidAmount,
                eventId: event._id,
                requiredIncrement
            });

            if (!result.success) {
                return socket.emit('bid_rejected', { message: result.reason });
            }

            // Save bid to database
            await Bid.create({
                event: currentState.currentPlayer.event,
                player: currentState.currentPlayer._id,
                team: team._id,
                amount: bidAmount
            });

            // Audit log
            await AuditLog.create({
                event: event._id,
                player: currentState.currentPlayer._id,
                action: 'bid_placed',
                performedBy: socket.user.id,
                details: { teamName, bidAmount }
            });

            // Calculate next increment based on new bid
            const nextIncrement = calculateBidIncrement(event, bidAmount);

            // Broadcast successful bid to all clients
            io.emit('bid_placed', {
                teamName,
                amount: bidAmount,
                time: new Date().toLocaleTimeString()
            });

            io.emit('update_bid', {
                highestBid: result.updatedState.highestBid,
                highestBidder: result.updatedState.highestBidder.teamName,
                timer: result.updatedState.timer,
                bidHistory: result.bidHistory,
                nextIncrement
            });

            // Emit confirmation to bidder
            socket.emit('bid_confirmed', {
                bidAmount,
                remainingBudget: team.remainingBudget - bidAmount
            });

        } catch (error) {
            console.error('Bid placement error:', error);
            socket.emit('error', { message: 'Failed to place bid, please try again' });
        }
    });

    // Admin Pause Auction
    socket.on("admin_pause_auction", async () => {
        try {
            if (!socket.user || socket.user.role !== 'Admin') {
                return socket.emit('error', { message: 'Unauthorized' });
            }

            const state = await getAuctionState();
            if (!state.isActive) {
                return socket.emit('error', { message: 'No active auction to pause' });
            }

            if (state.isPaused) {
                return socket.emit('error', { message: 'Auction is already paused' });
            }

            // Pause the auction
            const pausedState = {
                ...state,
                isPaused: true,
                pausedAt: Date.now(),
                remainingTimeOnPause: state.timer
            };
            await setAuctionState(pausedState);

            // Audit log
            if (state.currentPlayer && state.currentPlayer.event) {
                await AuditLog.create({
                    event: state.currentPlayer.event,
                    player: state.currentPlayer._id,
                    action: 'auction_paused',
                    performedBy: socket.user.id,
                    details: { remainingTime: state.timer }
                });
            }

            io.emit('auction_paused', { remainingTime: state.timer });

        } catch (error) {
            console.error('Error pausing auction:', error);
            socket.emit('error', { message: 'Failed to pause auction' });
        }
    });

    // Admin Resume Auction
    socket.on("admin_resume_auction", async () => {
        try {
            if (!socket.user || socket.user.role !== 'Admin') {
                return socket.emit('error', { message: 'Unauthorized' });
            }

            const state = await getAuctionState();
            if (!state.isPaused) {
                return socket.emit('error', { message: 'Auction is not paused' });
            }

            // Resume the auction
            const resumedState = {
                ...state,
                isPaused: false,
                timer: state.remainingTimeOnPause,
                pausedAt: null
            };
            await setAuctionState(resumedState);

            // Audit log
            if (state.currentPlayer && state.currentPlayer.event) {
                await AuditLog.create({
                    event: state.currentPlayer.event,
                    player: state.currentPlayer._id,
                    action: 'auction_resumed',
                    performedBy: socket.user.id,
                    details: { restoredTimer: state.remainingTimeOnPause }
                });
            }

            io.emit('auction_resumed', {
                timer: state.remainingTimeOnPause,
                currentPlayer: state.currentPlayer
            });

        } catch (error) {
            console.error('Error resuming auction:', error);
            socket.emit('error', { message: 'Failed to resume auction' });
        }
    });

    // Admin Skip Player
    socket.on("admin_skip_player", async () => {
        try {
            if (!socket.user || socket.user.role !== 'Admin') {
                return socket.emit('error', { message: 'Unauthorized' });
            }

            const state = await getAuctionState();
            if (!state.isActive) {
                return socket.emit('error', { message: 'No active auction to skip' });
            }

            // Stop timer
            if (timerInterval) clearInterval(timerInterval);

            // Update player status to Unsold
            const player = await Player.findById(state.currentPlayer._id);
            if (player) {
                player.status = 'Unsold';
                await player.save();

                // Save bid history (if any bids were placed)
                if (state.highestBidder && state.highestBidder.teamId) {
                    await Bid.create({
                        event: player.event,
                        player: player._id,
                        team: state.highestBidder.teamId,
                        amount: state.highestBid
                    });
                }

                // Audit log
                await AuditLog.create({
                    event: player.event,
                    player: player._id,
                    action: 'player_skipped',
                    performedBy: socket.user.id,
                    details: {
                        reason: 'Admin Skip',
                        finalBid: state.highestBid,
                        highestBidder: state.highestBidder ? state.highestBidder.teamName : null
                    }
                });

                io.emit('player_skipped', {
                    playerId: player._id,
                    playerName: player.name,
                    reason: 'Admin Skip'
                });
            }

            // Clear auction state
            await clearAuctionState();
            io.emit('auction_ended');

        } catch (error) {
            console.error('Error skipping player:', error);
            socket.emit('error', { message: 'Failed to skip player' });
        }
    });

    // Admin Extend Timer
    socket.on("admin_extend_timer", async (data) => {
        try {
            if (!socket.user || socket.user.role !== 'Admin') {
                return socket.emit('error', { message: 'Unauthorized' });
            }

            const extensionSeconds = data.extensionSeconds || 10;
            const state = await getAuctionState();

            if (!state.isActive) {
                return socket.emit('error', { message: 'No active auction' });
            }

            if (state.isPaused) {
                return socket.emit('error', { message: 'Cannot extend timer while paused' });
            }

            const newTimer = state.timer + extensionSeconds;
            await updateAuctionField('timer', newTimer);

            // Audit log
            if (state.currentPlayer && state.currentPlayer.event) {
                await AuditLog.create({
                    event: state.currentPlayer.event,
                    player: state.currentPlayer._id,
                    action: 'timer_extended',
                    performedBy: socket.user.id,
                    details: { extensionSeconds, newTimer }
                });
            }

            io.emit('timer_extended', { newTimer, extensionSeconds });

        } catch (error) {
            console.error('Error extending timer:', error);
            socket.emit('error', { message: 'Failed to extend timer' });
        }
    });

    // Admin Emergency Stop
    socket.on("admin_emergency_stop", async () => {
        try {
            if (!socket.user || socket.user.role !== 'Admin') {
                return socket.emit('error', { message: 'Unauthorized' });
            }

            const state = await getAuctionState();
            if (!state.isActive) {
                return socket.emit('error', { message: 'No active auction to stop' });
            }

            // Stop timer immediately
            if (timerInterval) clearInterval(timerInterval);

            // Audit log
            if (state.currentPlayer && state.currentPlayer.event) {
                await AuditLog.create({
                    event: state.currentPlayer.event,
                    player: state.currentPlayer._id,
                    action: 'emergency_stop',
                    performedBy: socket.user.id,
                    details: { currentPlayer: state.currentPlayer.name, message: 'Emergency stop by admin' }
                });
            }

            // Clear state without finalization
            await clearAuctionState();

            io.emit('emergency_stop', {
                message: 'Auction stopped by admin',
                currentPlayer: state.currentPlayer
            });

        } catch (error) {
            console.error('Error during emergency stop:', error);
            socket.emit('error', { message: 'Failed to stop auction' });
        }
    });
});

//server.listen(5000, () => console.log("🚀 Server running on port 5000"));
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
