const fs = require('fs');
const file = 'src/lib/calendarService.ts';
let code = fs.readFileSync(file, 'utf8');

const importTarget = "import { collection, doc, setDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';";
const newImport = "import { collection, doc, setDoc, getDocs, query, where, deleteDoc, onSnapshot } from 'firebase/firestore';";
code = code.replace(importTarget, newImport);

const subscribeFn = `

export const subscribeToStudyEventsFromFirestore = (userId: string, callback: (events: StudyEvent[]) => void): (() => void) => {
  if (userId === 'guest') {
    getStudyEventsFromFirestore(userId).then(callback);
    return () => {};
  }

  const q = query(
    collection(db, EVENT_COLLECTION),
    where('userId', '==', userId)
  );

  const unsubscribe = onSnapshot(q, (querySnapshot) => {
    const events: StudyEvent[] = [];
    querySnapshot.forEach((doc) => {
      events.push(doc.data() as StudyEvent);
    });
    callback(events);
  }, (error) => {
    console.error('Error listening to study events from Firestore:', error);
  });

  return unsubscribe;
};
`;

code += subscribeFn;
fs.writeFileSync(file, code);
console.log("calendarService patched successfully");
