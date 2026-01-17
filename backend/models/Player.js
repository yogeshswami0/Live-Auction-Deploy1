const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    name: { type: String, required: true },
    age: { type: Number, required: true },
    photo: { type: String },
    role: { type: String, enum: ['Batsman', 'Bowler', 'All-Rounder', 'Wicketkeeper'], required: true },
    basePrice: { type: Number, required: true },
    currentPrice: { type: Number, default: 0 },
    stats: {
        matches: { type: Number, default: 0 },
        runs: { type: Number, default: 0 },
        wickets: { type: Number, default: 0 },
        rating: { type: Number, default: 0 }
    },
    status: { type: String, enum: ['Pending', 'Approved', 'Sold', 'Unsold'], default: 'Pending' },
    wonBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Player', playerSchema);
