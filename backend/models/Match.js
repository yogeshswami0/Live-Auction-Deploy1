const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
    event: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
    homeTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    awayTeam: { type: mongoose.Schema.Types.ObjectId, ref: 'Team', required: true },
    startTime: { type: Date, required: true },
    type: { type: String, enum: ['League', 'Knockout'], default: 'League' }
}, { timestamps: true });

module.exports = mongoose.model('Match', matchSchema);

