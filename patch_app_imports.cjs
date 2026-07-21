const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetImport = `import {
  saveQuizToFirestore,
  addQuizAttemptToFirestore,
  getUserQuizzesFromFirestore,
  deleteQuizFromFirestore
} from './lib/quizService';`;
const newImport = `import {
  saveQuizToFirestore,
  addQuizAttemptToFirestore,
  getUserQuizzesFromFirestore,
  deleteQuizFromFirestore,
  subscribeToUserQuizzesFromFirestore
} from './lib/quizService';`;
code = code.replace(targetImport, newImport);
fs.writeFileSync(file, code);
