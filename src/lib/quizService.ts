import { collection, doc, setDoc, updateDoc, getDocs, query, where, orderBy, arrayUnion, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { Quiz, QuizAttempt } from '../types';

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
    console.error('Error saving quiz to Firestore:', error);
    throw error;
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
    console.error('Error saving attempt to Firestore:', error);
    throw error;
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
    console.error('Error loading user quizzes from Firestore:', error);
    throw error;
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
    console.error('Error deleting quiz from Firestore:', error);
    throw error;
  }
};
