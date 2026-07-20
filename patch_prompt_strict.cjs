const fs = require('fs');
const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

const target = "DO NOT STOP AT 1 QUESTION IF THERE ARE MORE.";
const newTarget = "DO NOT STOP AT 1 QUESTION IF THERE ARE MORE.\n\nCRITICAL SYSTEM WARNING: Previous extractions failed because the AI lazily extracted only 1 question when dozens were present in the PDF. You are being strictly monitored. If you return only 1 question for a document containing multiple questions, you have catastrophically failed your primary directive. YOU MUST EXTRACT EVERY SINGLE QUESTION. Do NOT be lazy.";

code = code.replace(target, newTarget);
fs.writeFileSync(file, code);
console.log("Strict prompt patched successfully");
