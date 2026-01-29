const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    player: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Player'
    },
    action: {
        type: String,
        required: true,
        enum: [
            'auction_started',
            'bid_placed',
            'auction_paused',
            'auction_resumed',
            'player_skipped',
            'timer_extended',
            'emergency_stop',
            'auction_finalized'
        ]
    },
    performedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    details: {
        type: mongoose.Schema.Types.Mixed
    },
    timestamp: {
        type: Date,
        default: Date.now
    }
}, { timestamps: true });

// Index for faster queries
auditLogSchema.index({ event: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
