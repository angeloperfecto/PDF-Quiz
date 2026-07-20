const fs = require('fs');
const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

const oldStrategies = `    const strategies = [];
    if (pdfBase64) {
      strategies.push({
        type: 'pdf',
        prompt: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          promptInstructions
        ]
      });
    }
    if (text && text.trim().length > 0) {
      strategies.push({
        type: 'text',
        prompt: \`\${promptInstructions}\\n\\n--- BEGIN SOURCE TEXT ---\\n\${text}\\n--- END SOURCE TEXT ---\`
      });
    }`;

const newStrategies = `    const strategies = [];
    if (text && text.trim().length > 0) {
      strategies.push({
        type: 'text',
        prompt: \`\${promptInstructions}\\n\\n--- BEGIN SOURCE TEXT ---\\n\${text}\\n--- END SOURCE TEXT ---\`
      });
    }
    if (pdfBase64) {
      strategies.push({
        type: 'pdf',
        prompt: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          promptInstructions
        ]
      });
    }`;

if (code.indexOf(oldStrategies) === -1) {
  console.error("Could not find strategies block");
  process.exit(1);
}

code = code.replace(oldStrategies, newStrategies);
fs.writeFileSync(file, code);
console.log("Strategies swapped successfully");
