const fs = require('fs');
const file = 'server.ts';
let code = fs.readFileSync(file, 'utf8');

const oldPromptInstructions = "const promptInstructions = `Your absolute, most critical directive is to scan the provided source material for any pre-existing questions, worksheets, quizzes, or exams.";

const startIndex = code.indexOf(oldPromptInstructions);
if (startIndex === -1) {
  console.error("Could not find promptInstructions");
  process.exit(1);
}

const endStr = "Adhere strictly to the system instruction. Generate a valid JSON object matching the schema.`;";
const endIndex = code.indexOf(endStr, startIndex) + endStr.length;

const newPromptInstructions = `const promptInstructions = \`Your absolute, most critical directive is to scan the provided source material for any pre-existing questions, worksheets, quizzes, or exams.
If pre-existing questions are found, you MUST extract ALL of them, preserving their exact wording, original numbering, ordering, options, and meaning with 100% complete coverage and zero omissions. Converting them to standard 4-option multiple choice structure where necessary. Completely ignore the count limit of \${numQuestionsStr} and extract all pre-existing questions found. DO NOT SUMMARIZE. DO NOT SKIP QUESTIONS. DO NOT STOP AT 1 QUESTION IF THERE ARE MORE.

If there are NO pre-existing questions in the text, then generate up to \${numQuestionsStr} brand new high-quality multiple-choice questions of difficulty "\${difficulty}" and type "\${questionType}" based on the informational content.

Before generating the final JSON array, you MUST count exactly how many questions are physically present in the document. The length of your "questions" array MUST exactly match this count. If you return 1 question, but there are 10 questions in the text, you have failed. If there are 50 questions, you MUST return all 50.

Adhere strictly to the system instruction. Generate a valid JSON object matching the schema.\`;`;

code = code.substring(0, startIndex) + newPromptInstructions + code.substring(endIndex);
fs.writeFileSync(file, code);
console.log("Prompt patched successfully");
