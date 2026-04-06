const mongoose = require('mongoose');

const testRunSchema = new mongoose.Schema({
    url: { type: String, required: true },
    status: { type: String, enum: ['Running', 'Passed', 'Failed', 'Pending'], default: 'Pending' },
    config: {
        headless: { type: Boolean, default: false },
        requiresLogin: { type: Boolean, default: false },
        username: { type: String },
        password: { type: String }
    },
    logs: [{ timestamp: Date, message: String }],
    reports: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Report' }],
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('TestRun', testRunSchema);
