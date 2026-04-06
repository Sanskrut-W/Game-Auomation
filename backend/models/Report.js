const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
    testRunId: { type: mongoose.Schema.Types.ObjectId, ref: 'TestRun', required: true },
    testCaseName: { type: String, required: true },
    status: { type: String, enum: ['Pass', 'Fail'], required: true },
    beforeScreenshot: String,
    afterScreenshot: String,
    logs: [String],
    coordinatesUsed: mongoose.Schema.Types.Mixed,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Report', reportSchema);
