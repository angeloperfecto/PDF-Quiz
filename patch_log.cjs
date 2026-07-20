const fs = require('fs');
const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

const target = "if (currentQuestions && currentQuestions.length > 0) {";
const newTarget = "if (currentQuestions && currentQuestions.length > 0) {\n          console.log(`Model extracted ${currentQuestions.length} questions. totalQuestionsInPDF reported by model: ${currentParsedData.totalQuestionsInPDF || 0}`);";

code = code.replace(target, newTarget);
fs.writeFileSync(file, code);
console.log("Log patched successfully");
