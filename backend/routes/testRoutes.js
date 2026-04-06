const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { createTestRun, getTestRun, getAllTestRuns, updateTestRun } = require('../store/memoryStore');
const { detectGameElements, executeGameActions } = require('../services/playwright.service');

// Manual Login: Let the user log in visually, then save session state.
router.post('/manual-login', async (req, res) => {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const originURL = new URL(url).origin;
        res.status(202).json({ message: 'Browser opened. Please log in manually and close the browser when finished.' });

        const browser = await chromium.launch({ headless: false });
        const context = await browser.newContext();
        const page = await context.newPage();

        await page.goto(originURL);

        // Wait for page to close
        page.on('close', async () => {
            try {
                await context.storageState({ path: path.join(__dirname, '..', 'auth.json') });
                console.log('✅ Manual Auth saved to auth.json');
            } catch (e) {
                console.error('Error saving auth.json:', e);
            } finally {
                await browser.close();
            }
        });
    } catch (e) {
        if (!res.headersSent) res.status(500).json({ error: e.message });
    }
});

// PHASE 1: Detect buttons / coordinates via Gemini
router.post('/run-test', async (req, res) => {
    const { url, config } = req.body;
    if (!url) return res.status(400).json({ error: 'URL is required' });

    try {
        const testRun = createTestRun(url, config);
        res.status(202).json({ message: 'Phase 1: Detection started', testRunId: testRun._id });

        // Run Phase 1 in background
        detectGameElements(testRun._id, url, testRun.config)
            .then((result) => {
                const logEntries = result.logs.map(m => ({ timestamp: new Date(), message: m }));
                if (result.detectedButtons.length > 0) {
                    updateTestRun(testRun._id, {
                        status: 'Detected',
                        phase: 1,
                        logs: logEntries,
                        detectedButtons: result.detectedButtons,
                        screenshotPath: result.screenshotPath,
                        viewport: result.viewport
                    });
                } else {
                    updateTestRun(testRun._id, {
                        status: 'Failed',
                        phase: 1,
                        logs: logEntries,
                        detectedButtons: []
                    });
                }
            })
            .catch((err) => {
                updateTestRun(testRun._id, {
                    status: 'Failed',
                    logs: [{ timestamp: new Date(), message: err.message }]
                });
            });

    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PHASE 2: Execute clicks on all detected buttons
router.post('/execute-test/:id', async (req, res) => {
    const testRun = getTestRun(req.params.id);
    if (!testRun) return res.status(404).json({ error: 'Test run not found' });
    if (!testRun.detectedButtons || testRun.detectedButtons.length === 0) {
        return res.status(400).json({ error: 'No detected buttons to execute. Run Phase 1 first.' });
    }

    // Mark as running Phase 2
    updateTestRun(testRun._id, { status: 'Running', phase: 2 });
    res.status(202).json({ message: 'Phase 2: Execution started' });

    executeGameActions(testRun._id, testRun.url, testRun.detectedButtons, testRun.config)
        .then((result) => {
            const existingLogs = testRun.logs || [];
            const newLogs = result.logs.map(m => ({ timestamp: new Date(), message: m }));
            updateTestRun(testRun._id, {
                status: result.finalStatus,
                phase: 2,
                logs: [...existingLogs, ...newLogs],
                reports: result.reports
            });
        })
        .catch((err) => {
            updateTestRun(testRun._id, {
                status: 'Failed',
                phase: 2,
                logs: [...(testRun.logs || []), { timestamp: new Date(), message: err.message }]
            });
        });
});

// Bulk detect
router.post('/run-bulk-tests', async (req, res) => {
    const { urls, config } = req.body;
    if (!urls || !Array.isArray(urls)) return res.status(400).json({ error: 'URLs array is required' });

    try {
        const testRuns = urls.map(url => createTestRun(url, config));
        res.status(202).json({ message: 'Bulk Phase 1 queued', testRuns: testRuns.map(t => t._id) });

        (async () => {
            for (const testRun of testRuns) {
                try {
                    const result = await detectGameElements(testRun._id, testRun.url, testRun.config);
                    const logEntries = result.logs.map(m => ({ timestamp: new Date(), message: m }));
                    updateTestRun(testRun._id, {
                        status: result.detectedButtons.length > 0 ? 'Detected' : 'Failed',
                        logs: logEntries,
                        detectedButtons: result.detectedButtons,
                        screenshotPath: result.screenshotPath,
                        viewport: result.viewport
                    });
                } catch (err) {
                    updateTestRun(testRun._id, { status: 'Failed', logs: [{ timestamp: new Date(), message: err.message }] });
                }
            }
        })();
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get single report
router.get('/reports/:testRunId', async (req, res) => {
    const testRun = getTestRun(req.params.testRunId);
    if (!testRun) return res.status(404).json({ error: 'TestRun not found' });
    res.json(testRun);
});

// Get all
router.get('/all', async (req, res) => {
    res.json(getAllTestRuns());
});

module.exports = router;
