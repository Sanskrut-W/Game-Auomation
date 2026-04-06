require('dotenv').config();
const { runTestCase } = require('./services/playwright.service');

(async () => {
    console.log("Starting direct Playwright execution for Freeplay Link...");
    const url = "https://freeplay.ragingriver.io/goldBlitz?gameId=1876101&operatorId=00000000-0000-0000-0000-000000000013&token=ef6b847f-9729-f111-ab3a-00155da50c15&freeplay=False&currency=ZAR&symbol=";
    
    const mockId = "test-run-freeplay-" + Date.now();
    
    // As per user request: headed mode, no login required
    const config = {
        headless: false,
        requiresLogin: false
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
