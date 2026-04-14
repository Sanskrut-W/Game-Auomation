const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const sharp = require('sharp');
const path = require('path');

/**
 * Detects interactive buttons in a game screenshot using Gemini Vision API.
 * 
 * Approach adopted from the reference slot-auto implementation:
 * 1. Thumbnail the image to max 1024x1024 before sending (standardizes input).
 * 2. Use the official Google `box_2d` prompt format for best accuracy.
 * 3. Force `response_mime_type: application/json` for clean output.
 * 4. Return raw 0-1000 normalized coordinates — caller converts to percentages.
 */
async function detectButtons(screenshotPath) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing in .env');
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ── Thumbnail the image to max 1024x1024 (matches reference approach) ──
    const thumbPath = screenshotPath.replace('.png', '-thumb.png');
    await sharp(screenshotPath)
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .toFile(thumbPath);

    const thumbMeta = await sharp(thumbPath).metadata();
    console.log(`[Gemini] Thumbnail created: ${thumbMeta.width}x${thumbMeta.height}`);

    // ── Prompt (adopted from reference slot-auto) ──
    // Focus specifically on these UI buttons/elements in this slot game interface:
    // - Spin button (the large circular play/arrow button)
    // - Autospin (if present, circular arrows or auto-play icon)  
    // - Bet Increment (plus + button)
    // - Bet Decrement (minus - button)
    // - Max Bet button
    // - Menu button (hamburger icon, usually bottom-left)
    // - Sound/speaker icon
    // - Turbo/lightning bolt icon
    const prompt = `You are analyzing a screenshot of a slot casino game. Your ONLY job is to locate exactly these 8 button types — NOTHING ELSE.

ALLOWED BUTTONS (use these EXACT labels):
1. "Menu" — hamburger icon (≡) or gear/settings icon
2. "Spin" — the LARGEST circular button, usually bottom-center, with a play/arrow symbol
3. "Auto Spin" — smaller circular arrows icon or "AUTO" text, near the Spin button
4. "Increase Bet" — a plus sign (+) icon
5. "Decrease Bet" — a minus sign (-) icon  
6. "Max Bet" — button with text "MAX" or "MAX BET"
7. "Turbo" — lightning bolt (⚡) icon
8. "Sound" — speaker icon (🔊/🔈)

STRICT RULES:
- Return ONLY buttons from the list above. If a button type is not visible, DO NOT invent it.
- NEVER detect static text labels like "CREDITS", "BALANCE", "WIN", "BET", "WAYS", or game logos.
- NEVER detect reel symbols, decorative icons, or non-interactive elements.
- Each bounding box must TIGHTLY wrap the button icon only — no extra padding.
- Use the EXACT label strings listed above (e.g., "Spin", "Menu", not "Spin Button" or "Menu Icon").

OUTPUT FORMAT:
Return a JSON array. Each object must have:
- "label": one of the 8 exact strings above
- "box_2d": [ymin, xmin, ymax, xmax] normalized to 0-1000 grid`;

    let rawText = '';
    let retries = 3;
    let delay = 2000;

    while (retries > 0) {
        try {
            const imageData = Buffer.from(fs.readFileSync(thumbPath)).toString('base64');

            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    {
                        role: 'user',
                        parts: [
                            { inlineData: { mimeType: 'image/png', data: imageData } },
                            { text: prompt }
                        ]
                    }
                ],
                config: {
                    responseMimeType: 'application/json',
                    thinkingConfig: { thinkingBudget: 0 }
                }
            });

            rawText = typeof response.text === 'function' ? response.text() : response.text;
            break;
        } catch (error) {
            console.error(`Gemini API Error (${retries} retries left):`, error.message);
            retries--;
            if (retries === 0) throw error;
            console.log(`Waiting ${delay}ms before retrying...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2;
        }
    }

    // Clean up thumbnail
    try { fs.unlinkSync(thumbPath); } catch (e) { }

    try {
        rawText = rawText.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '');

        const items = JSON.parse(rawText);

        if (!Array.isArray(items)) {
            throw new Error('Gemini did not return a JSON array.');
        }

        // Normalize from reference's box_2d format to our internal format
        const buttons = items
            .filter(item => item.box_2d && item.box_2d.length === 4)
            .map(item => {
                const [ymin, xmin, ymax, xmax] = item.box_2d;
                return {
                    name: item.label || 'Unknown',
                    // Keep raw 0-1000 values — these get converted to 0-1 percentages upstream
                    ymin: Math.min(ymin, ymax),
                    xmin: Math.min(xmin, xmax),
                    ymax: Math.max(ymin, ymax),
                    xmax: Math.max(xmin, xmax)
                };
            });

        console.log(`[Gemini] Parsed ${buttons.length} buttons from response`);
        return buttons;

    } catch (parseError) {
        console.error('Gemini Parse Error. Raw Response:', rawText);
        throw parseError;
    }
}

module.exports = { detectButtons };
