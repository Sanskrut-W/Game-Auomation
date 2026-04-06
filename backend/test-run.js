require('dotenv').config();
const { runTestCase } = require('./services/playwright.service');
const fs = require('fs');
const path = require('path');

(async () => {
    console.log("Starting direct Playwright execution (Bypassing MongoDB for local test)...");
    const url = "https://www.betway.co.za/lobby/casino-games/game/gold-blitz-za?vertical=casino-games";
    
    // Mock ID string for folder creation
    const mockId = "test-run-local-" + Date.now();
    
    const config = {
        headless: false, // Run headed
        requiresLogin: true,
        username: "222212222",
        password: "1234567890"
    };

    try {
        const result = await runTestCase(mockId, url, config);
        console.log("------------------------------------------");
        console.log("FINAL STATUS:", result.finalStatus);
        console.log("LOGS:");
        result.logs.forEach(l => console.log(l));
    } catch (e) {
        console.error("Test Script Failed:", e);
    }
    process.exit(0);
})();
