const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    description: { type: String },
    startTime: { type: Date },
    endTime: { type: Date },
    teamBudget: { type: Number },
    roleLimits: {
        batsman: { type: Number, default: 5 },
        bowler: { type: Number, default: 4 },
        allRounder: { type: Number, default: 3 },
        wicketkeeper: { type: Number, default: 2 }
    },
    isActive: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
