const fs = require('fs');
const file = 'src/App.tsx';
let code = fs.readFileSync(file, 'utf8');

// Replace handleGoogleSignIn
const targetGoogleSignIn = `  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        setUser(result.user);
        const userQuizzes = await getUserQuizzesFromFirestore(result.user.uid);
        setQuizzes(userQuizzes);
        setError(null);
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      setError('Google Sign-In failed or cancelled. Running in local guest mode.');
    }
  };`;
const newGoogleSignIn = `  const handleGoogleSignIn = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (result.user) {
        setUser(result.user);
        setError(null);
      }
    } catch (err: any) {
      console.error('Google Sign-In failed:', err);
      setError('Google Sign-In failed or cancelled. Running in local guest mode.');
    }
  };`;
code = code.replace(targetGoogleSignIn, newGoogleSignIn);

// Replace handleSignOut
const targetSignOut = `  const handleSignOut = async () => {
    try {
      await signOut(auth);
      const guestUser = { uid: 'guest', isGuest: true, displayName: 'Guest Student' };
      setUser(guestUser);
      const userQuizzes = await getUserQuizzesFromFirestore('guest');
      setQuizzes(userQuizzes);
      setCurrentQuiz(null);
      setCurrentAttempt(null);
      setActiveTab('dashboard');
    } catch (err: any) {
      console.error('Sign-out failed:', err);
      setError('Failed to sign out cleanly.');
    }
  };`;
const newSignOut = `  const handleSignOut = async () => {
    try {
      await signOut(auth);
      const guestUser = { uid: 'guest', isGuest: true, displayName: 'Guest Student' };
      setUser(guestUser);
      setCurrentQuiz(null);
      setCurrentAttempt(null);
      setActiveTab('dashboard');
    } catch (err: any) {
      console.error('Sign-out failed:', err);
      setError('Failed to sign out cleanly.');
    }
  };`;
code = code.replace(targetSignOut, newSignOut);

fs.writeFileSync(file, code);
console.log("App inline fetches patched successfully");
