const mongoose = require('mongoose');

const matchSchema = new mongoose.Schema({
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },

    homeTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        required: true
    },

    awayTeam: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Team',
        required: true
    },

    // Auto-assigned between startDate → endDate
    startTime: {
        type: Date,
        required: true
    },

    type: {
        type: String,
        enum: ['League', 'Knockout'],
        default: 'League'
    },

    // 🔥 NEW
    stage: {
        type: String,
        enum: ['League', 'Qualifier', 'Semi Final', 'Final'],
        default: 'League'
    },

    venue: {
        type: String,
        required: true
    },

    timeSlot: {
        type: String,
        enum: [
            'Morning (9–12)',
            'Afternoon (1–4)',
            'Evening (5–8)',
            'Night (8–11)'
        ],
        default: 'Evening (5–8)'
    },

    round: Number

}, { timestamps: true });

module.exports = mongoose.model('Match', matchSchema);
