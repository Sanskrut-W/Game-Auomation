// In-memory store — replaces MongoDB entirely
const { v4: uuidv4 } = require('uuid');

const store = new Map(); // Map<id, testRun>

function createTestRun(url, config) {
    const id = uuidv4();
    const testRun = {
        _id: id,
        url,
        status: 'Detecting',  // Phase 1: detect
        phase: 1,
        config: config || { headless: false, requiresLogin: false },
        logs: [],
        detectedButtons: [],  // Gemini-returned buttons
        reports: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    store.set(id, testRun);
    return testRun;
}

function getTestRun(id) {
    return store.get(id);
}

function getAllTestRuns() {
    return Array.from(store.values())
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 50);
}

function updateTestRun(id, updates) {
    const existing = store.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    store.set(id, updated);
    return updated;
}

module.exports = { createTestRun, getTestRun, getAllTestRuns, updateTestRun };
