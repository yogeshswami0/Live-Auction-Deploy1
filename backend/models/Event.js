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
    isActive: { type: Boolean, default: false },
    bidIncrement: {
        type: Number,
        required: true,
        default: 500000
    },
    usePriceTiers: {
        type: Boolean,
        default: false
    },
    priceTiers: [{
        minPrice: { type: Number, required: true },
        maxPrice: { type: Number, required: true },
        increment: { type: Number, required: true }
    }]
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
