import { collection, doc, setDoc, updateDoc, getDocs, query, where, orderBy, arrayUnion, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';
import { Quiz, QuizAttempt } from '../types';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const QUIZ_COLLECTION = 'quizzes';

export const saveQuizToFirestore = async (quiz: Quiz): Promise<void> => {
  if (quiz.userId === 'guest') {
    try {
      const stored = localStorage.getItem('quizzes_guest');
      const quizzes: Quiz[] = stored ? JSON.parse(stored) : [];
      const filtered = quizzes.filter(q => q.id !== quiz.id);
      localStorage.setItem('quizzes_guest', JSON.stringify([quiz, ...filtered]));
      return;
    } catch (e) {
      console.error('Error saving guest quiz to localStorage:', e);
      throw e;
    }
  }

  try {
    const docRef = doc(db, QUIZ_COLLECTION, quiz.id);
    const cleanedQuiz = JSON.parse(JSON.stringify(quiz));
    await setDoc(docRef, cleanedQuiz);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${QUIZ_COLLECTION}/${quiz.id}`);
  }
};

export const addQuizAttemptToFirestore = async (quizId: string, attempt: QuizAttempt): Promise<void> => {
  try {
    const stored = localStorage.getItem('quizzes_guest');
    const quizzes: Quiz[] = stored ? JSON.parse(stored) : [];
    const quizIdx = quizzes.findIndex(q => q.id === quizId);
    if (quizIdx !== -1) {
      const quiz = quizzes[quizIdx];
      quiz.scoreHistory = [...(quiz.scoreHistory || []), attempt];
      localStorage.setItem('quizzes_guest', JSON.stringify(quizzes));
      return;
    }
  } catch (e) {
    console.error('Error checking local guest quizzes:', e);
  }

  try {
    const docRef = doc(db, QUIZ_COLLECTION, quizId);
    await updateDoc(docRef, {
      scoreHistory: arrayUnion(attempt),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${QUIZ_COLLECTION}/${quizId}`);
  }
};

export const getUserQuizzesFromFirestore = async (userId: string): Promise<Quiz[]> => {
  if (userId === 'guest') {
    try {
      const stored = localStorage.getItem('quizzes_guest');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      console.error('Error reading guest quizzes from localStorage:', e);
      return [];
    }
  }

  try {
    const q = query(
      collection(db, QUIZ_COLLECTION),
      where('userId', '==', userId),
      orderBy('uploadDate', 'desc')
    );
    const querySnapshot = await getDocs(q);
    const quizzes: Quiz[] = [];
    querySnapshot.forEach((doc) => {
      quizzes.push(doc.data() as Quiz);
    });
    return quizzes;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, QUIZ_COLLECTION);
  }
};

export const deleteQuizFromFirestore = async (quizId: string, userId?: string): Promise<void> => {
  if (userId === 'guest') {
    try {
      const stored = localStorage.getItem('quizzes_guest');
      if (stored) {
        const quizzes: Quiz[] = JSON.parse(stored);
        const filtered = quizzes.filter(q => q.id !== quizId);
        localStorage.setItem('quizzes_guest', JSON.stringify(filtered));
      }
      return;
    } catch (e) {
      console.error('Error deleting local guest quiz:', e);
      throw e;
    }
  }

  try {
    const stored = localStorage.getItem('quizzes_guest');
    if (stored) {
      const quizzes: Quiz[] = JSON.parse(stored);
      const filtered = quizzes.filter(q => q.id !== quizId);
      if (filtered.length !== quizzes.length) {
        localStorage.setItem('quizzes_guest', JSON.stringify(filtered));
        return;
      }
    }
  } catch (e) {
    console.error('Error deleting local guest quiz from fallback check:', e);
  }

  try {
    const docRef = doc(db, QUIZ_COLLECTION, quizId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${QUIZ_COLLECTION}/${quizId}`);
  }
};


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
    handleFirestoreError(error, OperationType.GET, QUIZ_COLLECTION);
  });

  return unsubscribe;
};
