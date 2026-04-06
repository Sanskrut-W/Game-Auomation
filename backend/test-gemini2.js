const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const screensDir = path.join(__dirname, 'screenshots');
let imgPath = null;
for (const dir of fs.readdirSync(screensDir)) {
  const p = path.join(screensDir, dir);
  if (!fs.statSync(p).isDirectory()) continue;
  const f = fs.readdirSync(p).find(f => f === 'phase1-game-loaded.png');
  if (f) { imgPath = path.join(p, f); break; }
}

if (!imgPath) { console.log('No image found!'); process.exit(1); }
console.log('Testing image:', imgPath);

const prompt = `Identify ONLY the 'Spin' button (the large blue circular button at the bottom center of the game).
Return ONLY valid JSON:
[{ "name": "Spin", "ymin":<val>, "xmin":<val>, "ymax":<val>, "xmax":<val> }]`;

const imageData = Buffer.from(fs.readFileSync(imgPath)).toString('base64');

ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: [ { role: 'user', parts: [ { text: prompt }, { inlineData: { mimeType: 'image/png', data: imageData } } ] } ],
    config: { responseMimeType: 'application/json', temperature: 0.1 }
}).then(res => {
    let text = typeof res.text === 'function' ? res.text() : res.text;
    console.log('Raw Output:', text);
}).catch(console.error);
