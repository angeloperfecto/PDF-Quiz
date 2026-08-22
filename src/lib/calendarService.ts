import { collection, doc, setDoc, getDocs, query, where, deleteDoc, onSnapshot } from 'firebase/firestore';
import { db, auth } from './firebase';
import { StudyEvent } from '../types';

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
    handleFirestoreError(error, OperationType.WRITE, `${EVENT_COLLECTION}/${event.id}`);
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
    handleFirestoreError(error, OperationType.GET, EVENT_COLLECTION);
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
    handleFirestoreError(error, OperationType.DELETE, `${EVENT_COLLECTION}/${eventId}`);
  }
};


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
    handleFirestoreError(error, OperationType.GET, EVENT_COLLECTION);
  });

  return unsubscribe;
};
