const fs = require('fs');
const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

const oldPrompt = "const promptInstructions = `Your absolute, most critical directive is to scan the provided source material for any pre-existing questions, worksheets, quizzes, or exams.";

const startIndex = code.indexOf(oldPrompt);
if (startIndex === -1) {
  console.error("Could not find promptInstructions");
  process.exit(1);
}

const endStr = "Adhere strictly to the system instruction. Generate a valid JSON object matching the schema.`;";
const endIndex = code.indexOf(endStr, startIndex) + endStr.length;

const newPrompt = `const promptInstructions = \`Your absolute, most critical directive is to scan the provided source material for any pre-existing questions, worksheets, quizzes, or exams.
If pre-existing questions are found, you MUST extract ALL of them, preserving their exact wording, original numbering, ordering, options, and meaning with 100% complete coverage and zero omissions. Converting them to standard 4-option multiple choice structure where necessary. Completely ignore the count limit of \${numQuestionsStr} and extract all pre-existing questions found. DO NOT SUMMARIZE. DO NOT SKIP QUESTIONS.

If there are NO pre-existing questions in the text, then generate up to \${numQuestionsStr} brand new high-quality multiple-choice questions of difficulty "\${difficulty}" and type "\${questionType}" based on the informational content.

Before generating the final JSON array, you MUST count exactly how many questions are physically present in the document. The length of your "questions" array MUST exactly match this count. If there is any discrepancy, you have failed your directive.

Adhere strictly to the system instruction. Generate a valid JSON object matching the schema.\`;`;

code = code.substring(0, startIndex) + newPrompt + code.substring(endIndex);
fs.writeFileSync(file, code);
console.log("Patch applied successfully");
