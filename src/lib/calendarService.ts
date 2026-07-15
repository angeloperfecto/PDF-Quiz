import { collection, doc, setDoc, getDocs, query, where, deleteDoc } from 'firebase/firestore';
import { db } from './firebase';
import { StudyEvent } from '../types';

const EVENT_COLLECTION = 'study_events';

export const saveStudyEventToFirestore = async (event: StudyEvent): Promise<void> => {
  if (event.userId === 'guest') {
    try {
      const stored = localStorage.getItem('study_events_guest');
      const events: StudyEvent[] = stored ? JSON.parse(stored) : [];
      const filtered = events.filter(e => e.id !== event.id);
      localStorage.setItem('study_events_guest', JSON.stringify([event, ...filtered]));
      return;
    } catch (e) {
      console.error('Error saving guest study event to localStorage:', e);
      throw e;
    }
  }

  try {
    const docRef = doc(db, EVENT_COLLECTION, event.id);
    // Remove undefined fields since Firestore does not allow them
    const cleanedEvent = JSON.parse(JSON.stringify(event));
    await setDoc(docRef, cleanedEvent);
  } catch (error) {
    console.error('Error saving study event to Firestore:', error);
    throw error;
  }
};

export const getStudyEventsFromFirestore = async (userId: string): Promise<StudyEvent[]> => {
  if (userId === 'guest') {
    try {
      const stored = localStorage.getItem('study_events_guest');
      const parsed: StudyEvent[] = stored ? JSON.parse(stored) : [];
      return parsed;
    } catch (e) {
      console.error('Error reading guest study events from localStorage:', e);
      return [];
    }
  }

  try {
    const q = query(
      collection(db, EVENT_COLLECTION),
      where('userId', '==', userId)
    );
    const querySnapshot = await getDocs(q);
    const events: StudyEvent[] = [];
    querySnapshot.forEach((doc) => {
      events.push(doc.data() as StudyEvent);
    });
    return events;
  } catch (error) {
    console.error('Error loading study events from Firestore:', error);
    throw error;
  }
};

export const deleteStudyEventFromFirestore = async (eventId: string, userId: string): Promise<void> => {
  if (userId === 'guest') {
    try {
      const stored = localStorage.getItem('study_events_guest');
      if (stored) {
        const events: StudyEvent[] = JSON.parse(stored);
        const filtered = events.filter(e => e.id !== eventId);
        localStorage.setItem('study_events_guest', JSON.stringify(filtered));
      }
      return;
    } catch (e) {
      console.error('Error deleting guest study event:', e);
      throw e;
    }
  }

  try {
    const docRef = doc(db, EVENT_COLLECTION, eventId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting study event from Firestore:', error);
    throw error;
  }
};
