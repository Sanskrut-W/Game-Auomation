const { chromium } = require('playwright');
(async () => {
    console.log('Starting generic login debugger...');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
        await page.goto('https://www.betway.co.za', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(5000);
        
        const loginBtn = page.locator('button, a').filter({ hasText: /(log\s*in|sign\s*in|login|log in)/i }).first();
        if (await loginBtn.isVisible()) {
            console.log("Found login button. Clicking...");
            await loginBtn.click({ force: true });
            await page.waitForTimeout(3000);
        }

        const inputs = await page.locator('input').all();
        console.log(`Found ${inputs.length} inputs total on the page.`);
        for (const input of inputs) {
            const isVis = await input.isVisible();
            const id = await input.getAttribute('id');
            const type = await input.getAttribute('type');
            const name = await input.getAttribute('name');
            const placeholder = await input.getAttribute('placeholder');
            console.log(`Input: id=${id}, type=${type}, name=${name}, placeholder=${placeholder}, visible=${isVis}`);
        }

    } catch (e) {
        console.error(e);
    } finally {
        await browser.close();
    }
})();
