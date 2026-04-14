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
                    const coordsPath = path.join(__dirname, '..', `coordinates-${testRun._id}.json`);
                    try { fs.writeFileSync(coordsPath, JSON.stringify(result.detectedButtons, null, 2)); } catch(e){}

                    updateTestRun(testRun._id, {
                        status: 'Detected', // Stays here. Awaiting Phase 2.
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

    // Did the UI send updated coordinates?
    let finalCoords = req.body.updatedCoordinates || null;
    console.log('[DEBUG] Received finalCoords from UI:', finalCoords ? 'YES (length ' + finalCoords.length + ')' : 'NO');

    // If no UI overrides, check if the coordinates file was manually edited on disk
    if (!finalCoords) {
        const coordsPath = path.join(__dirname, '..', `coordinates-${testRun._id}.json`);
        try {
            if (fs.existsSync(coordsPath)) {
                finalCoords = JSON.parse(fs.readFileSync(coordsPath, 'utf8'));
            }
        } catch(e) { console.error('Failed to parse coordinates file', e); }
    }

    // Fallback to original memory state if neither exists
    if (!finalCoords) {
        finalCoords = testRun.detectedButtons;
    }

    // Filter to only selected test cases if the UI sent specific indices
    const selectedIndices = req.body.selectedIndices || null;
    if (selectedIndices && Array.isArray(selectedIndices) && selectedIndices.length > 0) {
        console.log(`[DEBUG] Filtering to ${selectedIndices.length} selected TCs: [${selectedIndices.join(', ')}]`);
        finalCoords = selectedIndices.map(i => finalCoords[i]).filter(Boolean);
    }

    // Update memory to the final executing coordinates
    updateTestRun(testRun._id, { status: 'Running', phase: 2, detectedButtons: testRun.detectedButtons });
    res.status(202).json({ message: 'Phase 2: Execution started' });

    executeGameActions(testRun._id, testRun.url, finalCoords, testRun.config)
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
