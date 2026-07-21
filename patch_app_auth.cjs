const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetAuthBlock = `  // Initialize Auth & Load User Quizzes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
          const userQuizzes = await getUserQuizzesFromFirestore(firebaseUser.uid);
          setQuizzes(userQuizzes);
        } else {
          // If not authenticated, attempt anonymous sign in
          try {
            const activeUser = await ensureUserSession();
            if (activeUser) {
              setUser(activeUser);
              const userQuizzes = await getUserQuizzesFromFirestore(activeUser.uid);
              setQuizzes(userQuizzes);
            } else {
              const guestUser = { uid: 'guest', isGuest: true, displayName: 'Guest Student' };
              setUser(guestUser);
              const userQuizzes = await getUserQuizzesFromFirestore('guest');
              setQuizzes(userQuizzes);
            }
          } catch (anonErr) {
            console.warn('Anonymous session setup error:', anonErr);
            const guestUser = { uid: 'guest', isGuest: true, displayName: 'Guest Student' };
            setUser(guestUser);
            const userQuizzes = await getUserQuizzesFromFirestore('guest');
            setQuizzes(userQuizzes);
          }
        }
      } catch (err: any) {
        console.error('Session initialization failed:', err);
        // Fallback to local guest sandbox
        const guestUser = { uid: 'guest', isGuest: true, displayName: 'Guest Student' };
        setUser(guestUser);
        try {
          const userQuizzes = await getUserQuizzesFromFirestore('guest');
          setQuizzes(userQuizzes);
        } catch (e) {
          setQuizzes([]);
        }
      } finally {
        setLoadingSession(false);
      }
    });

    return () => unsubscribe();
  }, []);`;

const newAuthBlock = `  // Initialize Auth
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      try {
        if (firebaseUser) {
          setUser(firebaseUser);
        } else {
          // If not authenticated, attempt anonymous sign in
          try {
            const activeUser = await ensureUserSession();
            if (activeUser) {
              setUser(activeUser);
            } else {
              const guestUser = { uid: 'guest', isGuest: true, displayName: 'Guest Student' };
              setUser(guestUser);
            }
          } catch (anonErr) {
            console.warn('Anonymous session setup error:', anonErr);
            const guestUser = { uid: 'guest', isGuest: true, displayName: 'Guest Student' };
            setUser(guestUser);
          }
        }
      } catch (err: any) {
        console.error('Session initialization failed:', err);
        // Fallback to local guest sandbox
        const guestUser = { uid: 'guest', isGuest: true, displayName: 'Guest Student' };
        setUser(guestUser);
      } finally {
        setLoadingSession(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Subscribe to realtime updates for quizzes when user changes
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToUserQuizzesFromFirestore(user.uid, (data) => {
      setQuizzes(data);
    });
    return () => unsubscribe();
  }, [user]);

  // Subscribe to realtime updates for study events when user changes
  useEffect(() => {
    if (!user) return;
    const unsubscribe = subscribeToStudyEventsFromFirestore(user.uid, (data) => {
      setStudyEvents(data);
    });
    return () => unsubscribe();
  }, [user]);`;

code = code.replace(targetAuthBlock, newAuthBlock);
fs.writeFileSync(file, code);
console.log("App.tsx auth block patched successfully");
