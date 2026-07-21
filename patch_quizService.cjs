const fs = require('fs');
const file = 'src/lib/quizService.ts';
let code = fs.readFileSync(file, 'utf8');

const importTarget = "import { collection, doc, setDoc, updateDoc, getDocs, query, where, orderBy, arrayUnion, deleteDoc } from 'firebase/firestore';";
const newImport = "import { collection, doc, setDoc, updateDoc, getDocs, query, where, orderBy, arrayUnion, deleteDoc, onSnapshot } from 'firebase/firestore';";
code = code.replace(importTarget, newImport);

const subscribeFn = `

export const subscribeToUserQuizzesFromFirestore = (userId: string, callback: (quizzes: Quiz[]) => void): (() => void) => {
  if (userId === 'guest') {
    // Guest doesn't have real-time sync across tabs, but we'll simulate an immediate return
    getUserQuizzesFromFirestore(userId).then(callback);
    return () => {};
  }

  const q = query(
    collection(db, QUIZ_COLLECTION),
    where('userId', '==', userId),
    orderBy('uploadDate', 'desc')
  );

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const quizzes: Quiz[] = [];
    querySnapshot.forEach((doc) => {
      quizzes.push(doc.data() as Quiz);
    });
    callback(quizzes);
  }, (error) => {
    console.error('Error listening to user quizzes from Firestore:', error);
  });

  return unsubscribe;
};
`;

code += subscribeFn;
fs.writeFileSync(file, code);
console.log("quizService patched successfully");
