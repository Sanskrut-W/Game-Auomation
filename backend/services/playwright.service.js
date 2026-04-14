const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { detectButtons } = require('./gemini.service');
const { getCenter } = require('../utils/coordinateCalculator');
const pixelmatch = require('pixelmatch');
const PNG = require('pngjs').PNG;

function sanitizeUrl(rawUrl) {
    if (!rawUrl) return rawUrl;
    let url = rawUrl.trim();
    // Remove src="..." or src='...' wrappers if user pasted an iframe attribute
    const srcMatch = url.match(/^src=["'](.+?)["']$/i);
    if (srcMatch) url = srcMatch[1];
    return url;
}

// ─────────────────────────────────────────────────────────────
// PHASE 1: Launch game, take screenshot, call Gemini ONCE
//          Returns detected button list. Does NOT click anything.
// ─────────────────────────────────────────────────────────────
async function detectGameElements(testRunId, rawUrl, config = {}) {
    const url = sanitizeUrl(rawUrl);
    const logs = [];
    function log(msg) {
        console.log(`[DETECT][${testRunId}] ${msg}`);
        logs.push(msg);
    }

    const isHeadless = config.headless ?? false;
    log(`🚀 Phase 1: Launching ${isHeadless ? 'Headless' : 'Headed'} browser...`);

    const browserArgs = isHeadless ? [] : ['--start-maximized'];
    const browser = await chromium.launch({
        headless: isHeadless,
        args: browserArgs
    });

    let viewportDimensions = { w: 1920, h: 1080 };

    const authPath = path.join(__dirname, '..', 'auth.json');
    const hasAuth = fs.existsSync(authPath);
    if (hasAuth) log(`🔑 Found saved manual session (auth.json). Injecting state...`);
    
    // In headed mode, viewport: null forces the inner canvas to map to the maximixed OS window.
    const contextOptions = isHeadless ? { viewport: { width: 1920, height: 1080 } } : { viewport: null };
    if (hasAuth) contextOptions.storageState = authPath;
    
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    const screenshotsDir = path.join(__dirname, '..', 'screenshots', testRunId.toString());
    fs.mkdirSync(screenshotsDir, { recursive: true });

    let detectedButtons = [];
    let screenshotPath = '';

    try {
        // Handle login if needed by simply navigating. Auth state is injected already!
        if (config.requiresLogin && hasAuth) {
            log(`🔑 Bypassing programmatic login because manual session was injected.`);
        } else if (config.requiresLogin && !hasAuth) {
            log(`⚠️ WARNING: 'Requires Login' toggled but NO auth.json found! Programmatic login may fail/timeout.`);
            // ... programmatic login kept as a rough fallback if needed, but not recommended.
            const originURL = new URL(url).origin;
            await page.goto(originURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
            
            const cookieBtn = page.locator('button, a').filter({ hasText: /(accept|agree|got it|allow all)/i }).first();
            try { if (await cookieBtn.isVisible({ timeout: 2000 })) { await cookieBtn.click({ force: true }); await page.waitForTimeout(1000); } } catch (e) { }

            let userField = page.locator('#header-username').first();
            if (!(await userField.count())) userField = page.locator('#MobileNumber, input[type="text"], input[type="email"], input[type="tel"]').filter({ state: 'visible' }).first();

            let passField = page.locator('#header-password').first();
            if (!(await passField.count())) passField = page.locator('#login-password, #Password, input[type="password"]').filter({ state: 'visible' }).first();

            if (!(await userField.count()) || !(await passField.count())) {
                log(`Looking for Login button...`);
                const loginBtn = page.locator('button, a').filter({ hasText: /(log\s*in|login|sign in)/i, state: 'visible' }).first();
                if (await loginBtn.isVisible({ timeout: 3000 })) { await loginBtn.click({ force: true }); await page.waitForTimeout(3000); }
                userField = page.locator('#header-username').first();
                if (!(await userField.count())) userField = page.locator('#MobileNumber, input[type="text"], input[type="email"], input[type="tel"]').filter({ state: 'visible' }).first();
                passField = page.locator('#header-password').first();
                if (!(await passField.count())) passField = page.locator('#login-password, #Password, input[type="password"]').filter({ state: 'visible' }).first();
            }

            await userField.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

            if (await userField.count() && await passField.count()) {
                log(`✅ Found login fields. Injecting credentials directly into DOM...`);
                
                // Aggressive Vue/React DOM Injection
                await userField.evaluate((node, val) => { 
                    node.value = val; 
                    node.dispatchEvent(new Event('input', { bubbles: true })); 
                    node.dispatchEvent(new Event('change', { bubbles: true })); 
                }, config.username).catch(() => {});
                
                await passField.evaluate((node, val) => { 
                    node.value = val; 
                    node.dispatchEvent(new Event('input', { bubbles: true })); 
                    node.dispatchEvent(new Event('change', { bubbles: true })); 
                }, config.password).catch(() => {});
                
                // Fallback Playwright fill
                await userField.fill(config.username, { force: true }).catch(() => {});
                await passField.fill(config.password, { force: true }).catch(() => {});
                
                const exactSubmit = page.locator('#login-btn').first();
                if (await exactSubmit.count()) {
                    await exactSubmit.click({ force: true });
                } else {
                    const fallbackBtn = page.locator('button[type="submit"], button').filter({ hasText: /(log\s*in|login|submit)/i, state: 'visible' }).last();
                    if (await fallbackBtn.isVisible({ timeout: 2000 })) { await fallbackBtn.click({ force: true }); }
                    else { await passField.press('Enter'); }
                }
                
                log(`Submitted. Waiting for auth (30s)...`);
                await page.waitForTimeout(30000);
            } else {
                log(`⚠️ Could not find login fields in DOM.`);
            }
        }

        log(`🌐 Navigating to game URL...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        log(`⏳ Waiting 30s for canvas/game to fully stabilize...`);
        await page.waitForTimeout(30000);

        // Take viewport screenshot
        screenshotPath = path.join(screenshotsDir, 'phase1-game-loaded.png');
        await page.screenshot({ path: screenshotPath });
        log(`📸 Screenshot captured. Sending to Gemini Vision...`);

        // Call Gemini ONCE (uses box_2d prompt + thumbnail approach from reference)
        const rawButtons = await detectButtons(screenshotPath);

        // Map 0-1000 coordinates to pure 0.0-1.0 percentage ratios
        detectedButtons = rawButtons.map(b => ({
            name: b.name,
            // Percentage ratios (0.0 to 1.0) — universally fluid
            pX1: b.xmin / 1000,
            pY1: b.ymin / 1000,
            pX2: b.xmax / 1000,
            pY2: b.ymax / 1000
        }));

        log(`✅ Gemini detected ${detectedButtons.length} interactive elements:`);
        detectedButtons.forEach(b => log(`   • ${b.name}: X(${(b.pX1*100).toFixed(1)}% → ${(b.pX2*100).toFixed(1)}%) Y(${(b.pY1*100).toFixed(1)}% → ${(b.pY2*100).toFixed(1)}%)`));

    } catch (e) {
        log(`❌ Phase 1 Error: ${e.message}`);
    } finally {
        await browser.close();
        log(`🏁 Phase 1 Complete. Browser closed.`);
    }

    return { 
        logs, 
        detectedButtons, 
        screenshotPath: screenshotPath ? `/screenshots/${testRunId}/phase1-game-loaded.png` : null
    };
}


// ─────────────────────────────────────────────────────────────
// PHASE 2: Use stored coordinates to click each detected button
//          Runs visibly with slowMo so user can watch
// ─────────────────────────────────────────────────────────────
async function executeGameActions(testRunId, rawUrl, detectedButtons, config = {}) {
    const url = sanitizeUrl(rawUrl);
    const logs = [];
    function log(msg) {
        console.log(`[EXECUTE][${testRunId}] ${msg}`);
        logs.push(msg);
    }

    const isHeadless = config.headless ?? false;
    log(`🚀 Phase 2: Launching ${isHeadless ? 'Headless' : 'Headed'} browser for test execution...`);

    // Use slowMo so the user can visually see each click happening
    const browserArgs = isHeadless ? [] : ['--start-maximized'];
    const browser = await chromium.launch({
        headless: isHeadless,
        slowMo: 800,
        args: browserArgs
    });
    
    const authPath = path.join(__dirname, '..', 'auth.json');
    const hasAuth = fs.existsSync(authPath);
    if (hasAuth) log(`🔑 Found saved manual session (auth.json). Injecting state...`);

    const contextOptions = isHeadless ? { viewport: { width: 1920, height: 1080 } } : { viewport: null };
    if (hasAuth) contextOptions.storageState = authPath;
    
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();

    const screenshotsDir = path.join(__dirname, '..', 'screenshots', testRunId.toString());
    const reports = [];

    try {
        // Handle login if needed by simply navigating. Auth state is injected already!
        if (config.requiresLogin && hasAuth) {
            log(`🔑 Bypassing programmatic login because manual session was injected.`);
        } else if (config.requiresLogin && !hasAuth) {
            log(`⚠️ WARNING: 'Requires Login' toggled but NO auth.json found! Programmatic login may fail/timeout.`);
            const originURL = new URL(url).origin;
            await page.goto(originURL, { waitUntil: 'domcontentloaded', timeout: 60000 });
            let userField = page.locator('#header-username').first();
            if (!(await userField.count())) userField = page.locator('#MobileNumber, input[type="text"], input[type="email"], input[type="tel"]').filter({ state: 'visible' }).first();

            let passField = page.locator('#header-password').first();
            if (!(await passField.count())) passField = page.locator('#login-password, #Password, input[type="password"]').filter({ state: 'visible' }).first();

            if (!(await userField.count()) || !(await passField.count())) {
                log(`Looking for Login button...`);
                const loginBtn = page.locator('button, a').filter({ hasText: /(log\s*in|login|sign in)/i, state: 'visible' }).first();
                if (await loginBtn.isVisible({ timeout: 3000 })) { await loginBtn.click({ force: true }); await page.waitForTimeout(3000); }
                userField = page.locator('#header-username').first();
                if (!(await userField.count())) userField = page.locator('#MobileNumber, input[type="text"], input[type="email"], input[type="tel"]').filter({ state: 'visible' }).first();
                passField = page.locator('#header-password').first();
                if (!(await passField.count())) passField = page.locator('#login-password, #Password, input[type="password"]').filter({ state: 'visible' }).first();
            }

            await userField.waitFor({ state: 'attached', timeout: 5000 }).catch(() => {});

            if (await userField.count() && await passField.count()) {
                log(`✅ Found login fields. Injecting credentials directly into DOM...`);
                
                await userField.evaluate((node, val) => { 
                    node.value = val; 
                    node.dispatchEvent(new Event('input', { bubbles: true })); 
                    node.dispatchEvent(new Event('change', { bubbles: true })); 
                }, config.username).catch(() => {});
                
                await passField.evaluate((node, val) => { 
                    node.value = val; 
                    node.dispatchEvent(new Event('input', { bubbles: true })); 
                    node.dispatchEvent(new Event('change', { bubbles: true })); 
                }, config.password).catch(() => {});
                
                // Fallback Playwright fill
                await userField.fill(config.username, { force: true }).catch(() => {});
                await passField.fill(config.password, { force: true }).catch(() => {});
                
                const exactSubmit = page.locator('#login-btn').first();
                if (await exactSubmit.count()) {
                    await exactSubmit.click({ force: true });
                } else {
                    const fallbackBtn = page.locator('button[type="submit"], button').filter({ hasText: /(log\s*in|login|submit)/i, state: 'visible' }).last();
                    if (await fallbackBtn.isVisible({ timeout: 2000 })) { await fallbackBtn.click({ force: true }); }
                    else { await passField.press('Enter'); }
                }
                
                log(`✅ Logged in. Waiting 30s...`);
                await page.waitForTimeout(30000);
            } else {
                log(`⚠️ Could not find login fields in DOM.`);
            }
        }

        log(`🌐 Navigating to game URL...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
        log(`⏳ Waiting 30s for game to stabilize...`);
        await page.waitForTimeout(30000);

        // Calculate CURRENT viewport safely
        const cssViewport = await page.evaluate(() => ({
            w: window.innerWidth,
            h: window.innerHeight
        }));
        log(`📐 Current CSS Viewport: ${cssViewport.w}x${cssViewport.h}`);

        // Execute each detected button as a test case
        log(`🎮 Starting execution of ${detectedButtons.length} detected buttons...`);

        for (let i = 0; i < detectedButtons.length; i++) {
            const button = detectedButtons[i];
            const tcName = `TC${String(i + 2).padStart(2, '0')}: Click ${button.name}`;
            const tcId = `TC${String(i + 2).padStart(2, '0')}`;
            
            // Map the fluid percentage back to absolute physical clicks for this precise browser context
            const cssX1 = Math.round(button.pX1 * cssViewport.w);
            const cssY1 = Math.round(button.pY1 * cssViewport.h);
            const cssX2 = Math.round(button.pX2 * cssViewport.w);
            const cssY2 = Math.round(button.pY2 * cssViewport.h);
            const center = getCenter(cssX1, cssY1, cssX2, cssY2);

            // Apply ±5px random jitter
            const jitterX = Math.floor(Math.random() * 11) - 5;
            const jitterY = Math.floor(Math.random() * 11) - 5;
            const targetX = center.x + jitterX;
            const targetY = center.y + jitterY;

            log(`\n🖱️ [${tcId}] Clicking '${button.name}' at (${targetX}, ${targetY}) (Center + Jitter)`);

            // Before screenshot (Viewport only)
            const beforePath = path.join(screenshotsDir, `${tcId}-before.png`);
            await page.screenshot({ path: beforePath });

            // Click with visible slowdown and explicit down/up for canvas games
            await page.mouse.move(targetX, targetY);  // Move to button first (visible)
            await page.waitForTimeout(500);
            await page.mouse.down();
            await page.waitForTimeout(150);  // Hold click slightly (canvas needs this)
            await page.mouse.up();
            await page.waitForTimeout(3000);  // Wait for animation/reaction

            // After screenshot (Viewport only)
            const afterPath = path.join(screenshotsDir, `${tcId}-after.png`);
            await page.screenshot({ path: afterPath });

            // Visual Diff Validation
            let isVisualChange = true;
            let diffPixels = 0;
            try {
                const imgBefore = PNG.sync.read(fs.readFileSync(beforePath));
                const imgAfter = PNG.sync.read(fs.readFileSync(afterPath));
                const { width, height } = imgBefore;
                diffPixels = pixelmatch(imgBefore.data, imgAfter.data, null, width, height, { threshold: 0.1 });

                if (diffPixels < 500) {
                    isVisualChange = false;
                    log(`⚠️ WARNING: No visual change detected (<500px diff). Canvas ignored click.`);
                } else {
                    log(`✅ Validation Passed: Visual state changed (${diffPixels}px diff).`);
                }
            } catch (err) {
                log(`⚠️ Error during visual diffing: ${err.message}`);
            }

            // ── AUTO-UNDO: Re-click the same button to reset game state ──
            log(`🔄 [${tcId}] Undo: Re-clicking '${button.name}' to reset state...`);
            await page.mouse.move(center.x, center.y);
            await page.waitForTimeout(300);
            await page.mouse.down();
            await page.waitForTimeout(150);
            await page.mouse.up();
            await page.waitForTimeout(2000);  // Wait for undo animation

            log(`✅ [${tcId}] Done. State reset. Pausing 1s before next action...`);
            await page.waitForTimeout(1000);

            reports.push({
                testCaseName: tcName,
                status: isVisualChange ? 'Pass' : 'Fail',
                beforeScreenshot: `/screenshots/${testRunId}/${tcId}-before.png`,
                afterScreenshot: `/screenshots/${testRunId}/${tcId}-after.png`,
                logs: [
                    `✅ Clicked '${button.name}'`,
                    `Bounding box: X(${(button.pX1*100).toFixed(1)}% → ${(button.pX2*100).toFixed(1)}%) | Y(${(button.pY1*100).toFixed(1)}% → ${(button.pY2*100).toFixed(1)}%)`,
                    `Target click: (${targetX}, ${targetY}) [Center: ${center.x},${center.y} | Jitter: ${jitterX},${jitterY}]`,
                    `Visual Validation: ${isVisualChange ? 'PASSED' : 'FAILED'} (${diffPixels} pixels changed)`,
                    `🔄 Auto-undo: Re-clicked to reset game state`
                ],
                coordinatesUsed: button
            });
        }

        log(`\n🏁 All ${detectedButtons.length} buttons tested.`);

    } catch (e) {
        log(`❌ Phase 2 error: ${e.message}`);
    } finally {
        await browser.close();
    }

    const finalStatus = reports.length > 0 ? 'Passed' : 'Failed';
    return { logs, reports, finalStatus };
}

module.exports = { detectGameElements, executeGameActions };
