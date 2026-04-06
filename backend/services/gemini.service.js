const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');

async function detectButtons(screenshotPath) {
    if (!process.env.GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY is missing in .env');
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const prompt = `You are a strict, layout-agnostic computer vision AI designed to identify interactive elements on HTML5 Canvas casino games.

Analyze this image of a slot casino game. Identify the interactive buttons.

CRITICAL DIRECTIVES:
1. STRICT IMAGE-BASED DETECTION: Analyze THIS specific image only. Do NOT assume standard layouts.
2. NORMALIZED SPATIAL COORDINATES: Return bounding box coordinates for each button exactly in the format [ymin, xmin, ymax, xmax], scaled to a 0-1000 grid over the full image dimensions.
   - [0, 0] is the top-left corner of the image. [1000, 1000] is the bottom-right corner.
   - The coordinates MUST be proportional to the image width and height. Do not provide absolute pixel values.
3. ANTI-HALLUCINATION & TEXT FILTER: 
   - NEVER label static text (like "CREDITS", "BALANCE", "WIN", "WAYS") as interactive buttons!
   - Ensure the bounding box tightly wraps the interactive icon/circle, NOT the blank space next to it.
4. VISUAL DICTIONARY - ONLY IDENTIFY THESE:
   - "Menu": Usually a hamburger icon (≡) or gear/settings icon.
   - "Spin": The largest circular button, usually in the bottom center. Often has a circular arrow or play symbol.
   - "Auto Spin": A smaller circular arrow icon or "AUTO" text, usually next to Spin.
   - "Increase Bet": A plus sign (+) icon.
   - "Decrease Bet": A minus sign (-) icon.
   - "Max Bet": A button containing the text "MAX" or "MAX BET".
   - "Turbo": A lightning bolt (⚡) icon.
   - "Sound": A speaker icon (🔊/🔈).
5. CLASSIFICATION & CONFIDENCE: Assign a precise 'type' and a 'confidence' score (0.0 to 1.0). If you are unsure, do NOT return the button.

Return ONLY a raw valid JSON array. Each object MUST have this exact structure:
{
  "name": "Exact Button Name (e.g. Spin Button)",
  "type": "spin|auto_spin|turbo|min_bet|max_bet|increase_bet|decrease_bet|menu|sound",
  "confidence": <float>,
  "ymin": <int 0-1000>, "xmin": <int 0-1000>, "ymax": <int 0-1000>, "xmax": <int 0-1000>
}`;

    let rawText = '';
    let retries = 3;
    let delay = 2000;

    while (retries > 0) {
        try {
            const imageData = Buffer.from(fs.readFileSync(screenshotPath)).toString('base64');
            
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: [
                    { 
                        role: 'user', 
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: 'image/png', data: imageData } }
                        ]
                    }
                ],
                config: {
                    responseMimeType: "application/json",
                    temperature: 0.1
                }
            });

            // Handle both property and function variants of .text
            rawText = typeof response.text === 'function' ? response.text() : response.text;
            break; // Success, exit retry loop
            
        } catch (error) {
            console.error(`Gemini API Error (${retries} retries left):`, error.message);
            retries--;
            if (retries === 0) throw error;
            console.log(`Waiting ${delay}ms before retrying...`);
            await new Promise(resolve => setTimeout(resolve, delay));
            delay *= 2; // Exponential backoff
        }
    }

    try {
        // Strip any accidental markdown wrapping
        rawText = rawText.trim()
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/\s*```$/i, '');

        const buttons = JSON.parse(rawText);
        
        if (!Array.isArray(buttons)) {
            throw new Error('Gemini did not return a JSON array.');
        }

        return buttons;

    } catch (parseError) {
        console.error('Gemini Parse Error. Raw Response:', rawText);
        throw parseError;
    }

}

module.exports = { detectButtons };
