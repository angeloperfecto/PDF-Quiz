import React, { useState, useEffect } from 'react';
import {
  Menu,
  X,
  BookOpen,
  History,
  LayoutDashboard,
  Moon,
  Sun,
  Loader2,
  AlertCircle,
  FileText,
  Sparkles,
  HelpCircle,
  Upload,
  LogIn,
  LogOut,
  Cloud,
  Database,
  User as UserIcon,
  Maximize2,
  Minimize2,
  Calendar,
  Trash2,
  Plus
} from 'lucide-react';
import { auth, ensureUserSession, googleProvider, signInWithPopup, signOut } from './lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import {
  saveQuizToFirestore,
  addQuizAttemptToFirestore,
  getUserQuizzesFromFirestore,
  deleteQuizFromFirestore,
  subscribeToUserQuizzesFromFirestore
} from './lib/quizService';
import { getStudyEventsFromFirestore, deleteStudyEventFromFirestore, subscribeToStudyEventsFromFirestore } from './lib/calendarService';
import { Quiz, QuizAttempt, QuizConfig, StudyEvent } from './types';
import UploadZone from './components/UploadZone';
import PDFViewer from './components/PDFViewer';
import QuizView from './components/QuizView';
import ResultsView from './components/ResultsView';
import HistoryView from './components/HistoryView';
import ManualQuizCreator from './components/ManualQuizCreator';
import CalendarView from './components/CalendarView';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [studyEvents, setStudyEvents] = useState<StudyEvent[]>([]);
  const [currentQuiz, setCurrentQuiz] = useState<Quiz | null>(null);
  const [currentAttempt, setCurrentAttempt] = useState<QuizAttempt | null>(null);
  const [activeFile, setActiveFile] = useState<File | null>(null);

  // Layout & UI States
  const [activeTab, setActiveTab] = useState<'dashboard' | 'active-study' | 'history' | 'calendar' | 'manual-quiz'>('dashboard');
  const [manualQuizToEdit, setManualQuizToEdit] = useState<Quiz | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(false);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [loadingSession, setLoadingSession] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // PDF Viewer Focus States
  const [activePDFPage, setActivePDFPage] = useState<number>(1);
  const [activeHighlightText, setActiveHighlightText] = useState<string>('');
  const [mobileSplit, setMobileSplit] = useState<'study' | 'pdf'>('study');
  const [layoutMode, setLayoutMode] = useState<'split' | 'quiz-only' | 'pdf-only'>('split');

  // Initialize Auth
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
  }, [user]);

  // Load study events whenever user changes
  useEffect(() => {
    const loadEvents = async () => {
      if (user) {
        try {
          const events = await getStudyEventsFromFirestore(user.uid);
          setStudyEvents(events);
        } catch (err) {
          console.error('Error loading study events:', err);
        }
      }
    };
    loadEvents();
  }, [user]);

  const refreshStudyEvents = async () => {
    if (user) {
      try {
        const events = await getStudyEventsFromFirestore(user.uid);
        setStudyEvents(events);
      } catch (err) {
        console.error('Error refreshing study events:', err);
      }
    }
  };

  const handleGoogleSignIn = async () => {
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
  };

  const handleSignOut = async () => {
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
  };

  // Theme Sync
  useEffect(() => {
    const isDark = localStorage.getItem('theme') === 'dark';
    setDarkMode(isDark);
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const nextDark = !darkMode;
    setDarkMode(nextDark);
    if (nextDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  };

  // Callback when quiz is generated successfully
  const handleQuizGenerated = async (data: {
    fileName: string;
    questions: any[];
    config: QuizConfig;
    extractedText: string;
  }) => {
    if (!user) return;

    const newQuiz: Quiz = {
      id: crypto.randomUUID(),
      userId: user.uid,
      fileName: data.fileName,
      uploadDate: new Date().toISOString(),
      numQuestions: data.config.numQuestions === -1 ? data.questions.length : data.config.numQuestions,
      difficulty: data.config.difficulty,
      questionType: data.config.questionType,
      questions: data.questions,
      scoreHistory: [],
      extractedText: data.extractedText,
    };

    try {
      await saveQuizToFirestore(newQuiz);
      setQuizzes(prev => [newQuiz, ...prev]);
      setCurrentQuiz(newQuiz);
      setCurrentAttempt(null);
      setActiveTab('active-study');
      setMobileSplit('study');
      setLayoutMode('split');
    } catch (err) {
      console.error('Error saving quiz:', err);
      setError('Quiz generated but failed to save in your cloud history.');
    }
  };

  // Submit quiz answers and score
  const handleQuizSubmit = async (userAnswers: number[], elapsedSeconds: number, questionMap?: number[], optionMaps?: number[][]) => {
    if (!currentQuiz || !user) return;

    let score = 0;
    currentQuiz.questions.forEach((q, idx) => {
      if (userAnswers[idx] === q.correctIndex) {
        score++;
      }
    });

    const percentage = (score / currentQuiz.questions.length) * 100;

    const attempt: QuizAttempt = {
      attemptId: crypto.randomUUID(),
      attemptDate: new Date().toISOString(),
      score,
      percentage,
      elapsedSeconds,
      userAnswers,
      questionMap,
      optionMaps: optionMaps?.map(om => JSON.stringify(om)),
    };

    try {
      await addQuizAttemptToFirestore(currentQuiz.id, attempt);
      
      // Update local state
      const updatedQuiz = {
        ...currentQuiz,
        scoreHistory: [...(currentQuiz.scoreHistory || []), attempt],
      };
      
      setQuizzes(prev => prev.map(q => q.id === currentQuiz.id ? updatedQuiz : q));
      setCurrentQuiz(updatedQuiz);
      setCurrentAttempt(attempt);
      setMobileSplit('study'); // Keep on study review panel on mobile
      refreshStudyEvents();
    } catch (err) {
      console.error('Failed to submit attempt:', err);
      setError('Failed to record attempt details to your database history.');
    }
  };

  const handleSelectQuizFromHistory = (quiz: Quiz) => {
    setCurrentQuiz(quiz);
    // Retrieve last attempt if available
    const lastAttempt = quiz.scoreHistory && quiz.scoreHistory.length > 0 
      ? quiz.scoreHistory[quiz.scoreHistory.length - 1] 
      : null;
    
    setCurrentAttempt(lastAttempt);
    setActiveTab('active-study');
    setMobileSplit('study');
    setLayoutMode(quiz.isManual ? 'quiz-only' : 'split');
    // Clear page ref states
    setActivePDFPage(1);
    setActiveHighlightText('');
  };

  const handleDeleteQuiz = async (quizId: string) => {
    try {
      await deleteQuizFromFirestore(quizId, user?.uid);
      setQuizzes(prev => prev.filter(q => q.id !== quizId));
      if (currentQuiz?.id === quizId) {
        setCurrentQuiz(null);
        setCurrentAttempt(null);
        setActiveTab('dashboard');
      }
    } catch (err) {
      console.error('Error deleting quiz:', err);
      setError('Failed to delete history item.');
    }
  };

  const handleAssociateFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setActiveFile(e.target.files[0]);
    }
  };

  const handleSelectReference = (pageNumber?: number, textExcerpt?: string) => {
    if (pageNumber) setActivePDFPage(pageNumber);
    if (textExcerpt) setActiveHighlightText(textExcerpt);
  };

  if (loadingSession) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 dark:bg-[#0b0f19] relative overflow-hidden">
        {/* Decorative background orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 blur-[100px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-500/10 dark:bg-purple-500/20 blur-[100px] pointer-events-none" />
        
        <div className="glass-card max-w-md w-full p-8 rounded-3xl border border-slate-200/50 dark:border-white/5 flex flex-col items-center text-center">
          <Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin mb-4" />
          <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-display">
            Establishing Secure Session...
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Configuring Firebase Auth and Firestore Cloud environments.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-[#0b0f19] text-slate-800 dark:text-slate-100 overflow-hidden font-sans relative">
      {/* Decorative background orbs */}
      <div className="absolute top-[-20%] left-[-20%] w-[60%] h-[60%] rounded-full bg-indigo-500/10 dark:bg-indigo-500/15 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-20%] w-[60%] h-[60%] rounded-full bg-purple-500/10 dark:bg-purple-500/15 blur-[120px] pointer-events-none" />
      <div className="absolute top-[30%] right-[10%] w-[40%] h-[40%] rounded-full bg-blue-500/5 dark:bg-blue-500/10 blur-[100px] pointer-events-none" />

      {/* Sidebar Navigation */}
      <aside
        id="sidebar-navigation"
        className={`fixed inset-y-0 left-0 z-50 w-64 glass-panel border-r border-slate-200/50 dark:border-white/5 transform lg:translate-x-0 lg:static lg:inset-auto transition-transform duration-300 ease-in-out flex flex-col justify-between ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex flex-col h-full relative z-10">
          {/* Sidebar Header */}
          <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200/30 dark:border-white/5 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-gradient-to-tr from-indigo-500 to-indigo-600 text-white rounded-xl shadow-md shadow-indigo-100 dark:shadow-none">
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="font-extrabold text-base tracking-tight font-display bg-gradient-to-r from-slate-900 to-indigo-950 dark:from-slate-50 dark:to-slate-300 bg-clip-text text-transparent">
                Quiz Pro PH
              </span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-1.5 hover:bg-white/20 dark:hover:bg-white/5 rounded-lg text-slate-600 dark:text-slate-300"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Sidebar Tabs */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            <button
              id="sidebar-tab-dashboard"
              onClick={() => {
                setActiveTab('dashboard');
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all border ${
                activeTab === 'dashboard'
                  ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/15'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/30 dark:hover:bg-white/5 border-transparent'
              }`}
            >
              <LayoutDashboard className="w-5 h-5" />
              Upload & Generate
            </button>

            <button
              id="sidebar-tab-calendar"
              onClick={() => {
                setActiveTab('calendar');
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all border ${
                activeTab === 'calendar'
                  ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/15'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/30 dark:hover:bg-white/5 border-transparent'
              }`}
            >
              <Calendar className="w-5 h-5" />
              Study Calendar
            </button>

            <button
              id="sidebar-tab-manual-quiz"
              onClick={() => {
                setManualQuizToEdit(null);
                setActiveTab('manual-quiz');
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all border ${
                activeTab === 'manual-quiz'
                  ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/15'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/30 dark:hover:bg-white/5 border-transparent'
              }`}
            >
              <Plus className="w-5 h-5" />
              Manual Quiz Creator
            </button>

            {currentQuiz && (
              <button
                id="sidebar-tab-active"
                onClick={() => {
                  setActiveTab('active-study');
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all border ${
                  activeTab === 'active-study'
                    ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/15'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/30 dark:hover:bg-white/5 border-transparent'
                }`}
              >
                <Sparkles className="w-5 h-5 animate-pulse text-indigo-500" />
                Active Quiz Session
              </button>
            )}

            <button
              id="sidebar-tab-history"
              onClick={() => {
                setActiveTab('history');
                setIsSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-semibold transition-all border ${
                activeTab === 'history'
                  ? 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400 border-indigo-500/15'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-white/30 dark:hover:bg-white/5 border-transparent'
              }`}
            >
              <History className="w-5 h-5" />
              Study History
            </button>
          </nav>

          {/* User Profile / Auth Area */}
          <div className="px-4 py-4 border-t border-slate-200/30 dark:border-white/5 space-y-3 flex-shrink-0">
            {user && !user.isGuest ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 px-2">
                  {user.photoURL ? (
                    <img
                      src={user.photoURL}
                      alt={user.displayName || 'User'}
                      className="w-8 h-8 rounded-full border border-slate-200 dark:border-white/10"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs">
                      {user.displayName ? user.displayName.charAt(0) : 'U'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate font-display">
                      {user.displayName || 'Student'}
                    </p>
                    <p className="text-[10px] text-slate-600 dark:text-slate-400 truncate flex items-center gap-1 font-semibold">
                      <Cloud className="w-2.5 h-2.5 text-indigo-500" /> Cloud Synced
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-white/5 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded-xl text-xs font-bold transition-all border border-slate-300/40 dark:border-white/5 active:scale-[0.98]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            ) : (
              <div className="space-y-2 bg-indigo-500/5 dark:bg-indigo-500/5 p-3 rounded-2xl border border-indigo-500/10">
                <div className="flex items-start gap-2">
                  <Database className="w-4 h-4 text-indigo-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 font-display">
                      Guest Sandbox
                    </p>
                    <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-normal font-medium">
                      Saved to this browser only. Sign in to enable secure cloud sync.
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleGoogleSignIn}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm active:scale-[0.98]"
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Google Sign-In
                </button>
              </div>
            )}
          </div>

          {/* Sidebar Footer with Theme Toggle */}
          <div className="p-4 border-t border-slate-200/30 dark:border-white/5 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full animate-ping ${user && !user.isGuest ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                {user && !user.isGuest ? 'Cloud Connected' : 'Local Sandbox'}
              </span>
            </div>
            <button
              id="theme-toggle-btn"
              onClick={toggleTheme}
              className="p-2 hover:bg-white/20 dark:hover:bg-white/5 rounded-xl text-slate-600 hover:text-indigo-600 dark:text-slate-300 dark:hover:text-indigo-400 transition-colors"
              title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Top Header */}
        <header
          id="top-header"
          className="h-16 border-b border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-[#0b0f19]/40 backdrop-blur-md px-6 flex items-center justify-between flex-shrink-0 print:hidden"
        >
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(true)}
              className="lg:hidden p-2 hover:bg-white/20 dark:hover:bg-white/5 rounded-xl text-slate-600 dark:text-slate-300"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h2 className="text-xs font-extrabold text-slate-850 dark:text-indigo-300 uppercase tracking-wider font-display">
              {activeTab === 'dashboard'
                ? 'Document Quiz Workbench'
                : activeTab === 'calendar'
                ? 'Study Schedule & AI Planner'
                : activeTab === 'active-study'
                ? 'Interactive AI Session'
                : 'Study Performance History'}
            </h2>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold text-slate-600 dark:text-slate-300">
            {currentQuiz && activeTab === 'active-study' && (
              <>
                {/* Desktop Layout Mode Selectors */}
                {!currentQuiz.isManual && (
                  <div className="hidden lg:flex items-center gap-0.5 bg-slate-200/50 dark:bg-white/5 p-1 rounded-xl border border-slate-250 dark:border-white/5">
                    <button
                      id="layout-split-btn"
                      onClick={() => setLayoutMode('split')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        layoutMode === 'split'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'hover:text-slate-900 dark:hover:text-slate-100 text-slate-500 dark:text-slate-400 hover:bg-slate-200/40 dark:hover:bg-white/5'
                      }`}
                    >
                      Split View
                    </button>
                    <button
                      id="layout-quiz-btn"
                      onClick={() => setLayoutMode('quiz-only')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        layoutMode === 'quiz-only'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'hover:text-slate-900 dark:hover:text-slate-100 text-slate-500 dark:text-slate-400 hover:bg-slate-200/40 dark:hover:bg-white/5'
                      }`}
                    >
                      Quiz Only
                    </button>
                    <button
                      id="layout-pdf-btn"
                      onClick={() => setLayoutMode('pdf-only')}
                      className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all ${
                        layoutMode === 'pdf-only'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'hover:text-slate-900 dark:hover:text-slate-100 text-slate-500 dark:text-slate-400 hover:bg-slate-200/40 dark:hover:bg-white/5'
                      }`}
                    >
                      PDF Only
                    </button>
                  </div>
                )}

                <span className="hidden sm:inline-flex items-center gap-1.5 bg-white/20 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 px-3 py-1.5 rounded-full truncate max-w-xs">
                  {currentQuiz.isManual ? (
                    <>
                      <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                      {currentQuiz.title || 'Manual Quiz'}
                    </>
                  ) : (
                    <>
                      <FileText className="w-3.5 h-3.5 text-red-500" />
                      {currentQuiz.fileName}
                    </>
                  )}
                </span>
              </>
            )}
          </div>
        </header>

        {/* Dynamic Views Container */}
        <main className="flex-1 overflow-hidden relative">
          {error && (
            <div className="absolute top-4 left-4 right-4 z-40 bg-red-500/10 dark:bg-red-950/20 border border-red-500/20 p-4 rounded-2xl text-sm text-red-600 dark:text-red-400 flex items-start gap-2.5 shadow-sm backdrop-blur-md">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold">Action Encountered Error</p>
                <p className="text-xs mt-0.5">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-xs font-bold underline">
                Dismiss
              </button>
            </div>
          )}

          {/* Tab 1: Dashboard / Upload */}
          {activeTab === 'dashboard' && (
            <div className="h-full overflow-y-auto px-6 py-8">
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="text-center space-y-2">
                  <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 dark:text-slate-50 tracking-tight font-display bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-500 dark:from-indigo-400 dark:via-purple-400 dark:to-pink-400 bg-clip-text text-transparent">
                    Convert any PDF into a Smart Quiz
                  </h1>
                  <p className="text-sm text-slate-600 dark:text-slate-300 max-w-lg mx-auto font-medium">
                    Perfect for certifications, exam preps, and technical learning. Every single question generated is strictly grounded with direct page references.
                  </p>
                </div>

                <UploadZone
                  onQuizGenerated={(data) => {
                    handleQuizGenerated(data);
                  }}
                  isLoading={isGenerating}
                  setIsLoading={setIsGenerating}
                />

                {/* Upcoming Scheduled Quizzes Dashboard Integration */}
                <div className="glass-card bg-white/40 dark:bg-[#0f1422]/40 border border-slate-200/50 dark:border-white/5 p-6 rounded-3xl space-y-5 shadow-sm">
                  <div className="flex items-center justify-between border-b border-slate-200/20 dark:border-white/5 pb-3">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                      <h3 className="font-extrabold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider font-display">
                        Upcoming Scheduled Quizzes
                      </h3>
                    </div>
                    <button
                      onClick={() => setActiveTab('calendar')}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                    >
                      View Full Calendar
                    </button>
                  </div>

                  {studyEvents.filter(e => e.status !== 'Completed').length === 0 ? (
                    <div className="py-8 text-center opacity-60 flex flex-col items-center justify-center">
                      <HelpCircle className="w-8 h-8 text-slate-500 mb-2" />
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No upcoming scheduled quiz events.</p>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Use the Study Calendar tab to plan and schedule your AI exam preparation!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {studyEvents
                        .filter(e => e.status !== 'Completed')
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                        .slice(0, 4)
                        .map(event => (
                          <div
                            key={event.id}
                            className="p-4 bg-white/60 dark:bg-slate-900/40 border border-slate-200/40 dark:border-white/5 rounded-2xl flex flex-col justify-between gap-3 shadow-sm"
                          >
                            <div>
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 font-mono uppercase bg-slate-100 dark:bg-white/5 px-2 py-0.5 rounded-md">
                                  {new Date(event.date).toLocaleDateString('default', { month: 'short', day: 'numeric' })}
                                </span>
                                <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider ${
                                  event.status === 'Overdue' ? 'bg-red-500/10 text-red-600 dark:text-red-400 border border-red-500/15' : 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/15'
                                }`}>
                                  {event.status}
                                </span>
                              </div>
                              <h4 className="font-extrabold text-xs text-slate-800 dark:text-slate-100 mt-2 truncate">
                                {event.title}
                              </h4>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                                📘 {event.fileName || 'No PDF attached'} • {event.subject}
                              </p>
                            </div>

                            <div className="flex items-center gap-1.5 border-t border-slate-200/30 dark:border-white/5 pt-2">
                              {event.quizId ? (
                                <button
                                  onClick={() => {
                                    const quiz = quizzes.find(q => q.id === event.quizId);
                                    if (quiz) {
                                      setCurrentQuiz(quiz);
                                      setCurrentAttempt(null);
                                      setActiveTab('active-study');
                                      setMobileSplit('study');
                                      setLayoutMode('split');
                                    } else {
                                      alert('Linking quiz. Please start it from the study history or calendar view.');
                                    }
                                  }}
                                  className="flex-1 py-1 px-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[10px] font-extrabold shadow-sm cursor-pointer"
                                >
                                  Start Quiz
                                </button>
                              ) : (
                                <button
                                  onClick={() => {
                                    setActiveTab('calendar');
                                  }}
                                  className="flex-1 py-1 px-2.5 bg-amber-500 hover:bg-amber-400 text-white rounded-lg text-[10px] font-extrabold shadow-sm cursor-pointer"
                                >
                                  Configure Quiz
                                </button>
                              )}
                              <button
                                onClick={() => setActiveTab('calendar')}
                                className="py-1 px-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-[10px] font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                              >
                                Edit
                              </button>
                              <button
                                onClick={async () => {
                                  if (window.confirm(`Are you sure you want to delete "${event.title}" study schedule?`)) {
                                    try {
                                      await deleteStudyEventFromFirestore(event.id, user?.uid || 'guest');
                                      refreshStudyEvents();
                                    } catch (err) {
                                      console.error(err);
                                    }
                                  }
                                }}
                                className="p-1 text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                                title="Delete study schedule"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Active Study (Side-by-Side Split View!) */}
          {activeTab === 'active-study' && currentQuiz && (
            <div className="h-full flex flex-col lg:flex-row">
              {/* Left Panel: Quiz taking or scoring Results */}
              <div className={`h-full flex-col p-6 overflow-hidden border-r border-slate-200 dark:border-slate-800 ${
                mobileSplit === 'study' ? 'flex' : 'hidden'
              } ${
                layoutMode === 'pdf-only' ? 'lg:hidden' : 'lg:flex'
              } ${
                layoutMode === 'quiz-only' ? 'w-full lg:w-full' : 'w-full lg:w-3/5'
              }`}>
                {/* Panel Header with Maximize / Minimize controls */}
                <div className="hidden lg:flex items-center justify-between pb-3 mb-2 border-b border-slate-200/30 dark:border-white/5 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider font-display">
                      Quiz Panel
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      id="toggle-quiz-maximize"
                      onClick={() => setLayoutMode(layoutMode === 'quiz-only' ? 'split' : 'quiz-only')}
                      className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-all flex items-center gap-1.5 text-xs font-semibold"
                      title={layoutMode === 'quiz-only' ? "Minimize/Split Panel" : "Maximize Panel"}
                    >
                      {layoutMode === 'quiz-only' ? (
                        <>
                          <Minimize2 className="w-4 h-4" />
                          <span>Split View</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-4 h-4" />
                          <span>Maximize Quiz</span>
                        </>
                      )}
                    </button>
                    <button
                      id="toggle-quiz-hide"
                      onClick={() => setLayoutMode('pdf-only')}
                      className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-all flex items-center gap-1.5 text-xs font-semibold"
                      title="Hide Quiz Panel"
                    >
                      <X className="w-4 h-4" />
                      <span>Hide</span>
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                  {currentAttempt ? (
                    <ResultsView
                      quiz={currentQuiz}
                      attempt={currentAttempt}
                      onRetake={() => {
                        setCurrentAttempt(null);
                        setMobileSplit('study');
                      }}
                      onSelectReference={(page, text) => {
                        handleSelectReference(page, text);
                        setMobileSplit('pdf'); // Auto transition to PDF tab on mobile to show reference
                      }}
                    />
                  ) : (
                    <QuizView
                      questions={currentQuiz.questions}
                      onQuizSubmit={(userAnswers, elapsedSeconds, questionMap, optionMaps) => {
                        handleQuizSubmit(userAnswers, elapsedSeconds, questionMap, optionMaps);
                      }}
                      onSelectReference={(page, text) => {
                        handleSelectReference(page, text);
                      }}
                    />
                  )}
                </div>
              </div>

               {/* Right Panel: Interactive PDF Viewer */}
              <div className={`h-full flex-col p-6 overflow-hidden bg-white/20 dark:bg-slate-900/40 ${
                mobileSplit === 'pdf' ? 'flex' : 'hidden'
              } ${
                layoutMode === 'quiz-only' ? 'lg:hidden' : 'lg:flex'
              } ${
                layoutMode === 'pdf-only' ? 'w-full lg:w-full' : 'w-full lg:w-2/5'
              }`}>
                {/* Panel Header with Maximize / Minimize controls */}
                <div className="hidden lg:flex items-center justify-between pb-3 mb-2 border-b border-slate-200/30 dark:border-white/5 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-650 dark:text-indigo-400 uppercase tracking-wider font-display">
                      PDF Reference Panel
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      id="toggle-pdf-maximize"
                      onClick={() => setLayoutMode(layoutMode === 'pdf-only' ? 'split' : 'pdf-only')}
                      className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-all flex items-center gap-1.5 text-xs font-semibold"
                      title={layoutMode === 'pdf-only' ? "Minimize/Split Panel" : "Maximize Panel"}
                    >
                      {layoutMode === 'pdf-only' ? (
                        <>
                          <Minimize2 className="w-4 h-4" />
                          <span>Split View</span>
                        </>
                      ) : (
                        <>
                          <Maximize2 className="w-4 h-4" />
                          <span>Maximize PDF</span>
                        </>
                      )}
                    </button>
                    <button
                      id="toggle-pdf-hide"
                      onClick={() => setLayoutMode('quiz-only')}
                      className="p-1.5 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-all flex items-center gap-1.5 text-xs font-semibold"
                      title="Hide PDF Panel"
                    >
                      <X className="w-4 h-4" />
                      <span>Hide</span>
                    </button>
                  </div>
                </div>

                {activeFile ? (
                  <PDFViewer
                    pdfFile={activeFile}
                    initialPage={activePDFPage}
                    highlightText={activeHighlightText}
                  />
                ) : (
                  <div className="flex-1 glass-card border border-slate-200/50 dark:border-white/5 rounded-3xl p-8 flex flex-col items-center justify-center text-center shadow-sm">
                    <div className="p-4 bg-indigo-500/10 dark:bg-indigo-500/20 rounded-full text-indigo-600 dark:text-indigo-450 mb-5">
                      <Upload className="w-8 h-8" />
                    </div>
                    <h4 className="font-bold text-slate-800 dark:text-slate-100 font-display mb-1">
                      PDF Layout Reference is Closed
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mb-6">
                      Since this session was reloaded from your history, you need to drag or open the original PDF file to view pages side-by-side.
                    </p>
                    <label className="py-2.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white font-semibold text-xs cursor-pointer shadow-md transition-colors">
                      Open Original PDF
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleAssociateFile}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
              </div>

              {/* Mobile Navigation Split-Bar */}
              {!currentQuiz.isManual && (
                <div className="lg:hidden flex border-t border-slate-200/50 dark:border-white/5 bg-white/40 dark:bg-[#0b0f19]/40 backdrop-blur-md p-2.5 flex-shrink-0">
                  <button
                    onClick={() => setMobileSplit('study')}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                      mobileSplit === 'study'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    <HelpCircle className="w-4 h-4" />
                    Quiz / Review
                  </button>
                  <button
                    onClick={() => setMobileSplit('pdf')}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                      mobileSplit === 'pdf'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-500'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    View PDF Reference
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Tab 3: Study History */}
          {activeTab === 'history' && (
            <div className="h-full overflow-y-auto px-6 py-8">
              <div className="max-w-4xl mx-auto">
                <HistoryView
                  quizzes={quizzes}
                  onSelectQuiz={handleSelectQuizFromHistory}
                  onDeleteQuiz={handleDeleteQuiz}
                  onEditQuiz={(quiz) => {
                    setManualQuizToEdit(quiz);
                    setActiveTab('manual-quiz');
                  }}
                />
              </div>
            </div>
          )}

          {/* Tab 4: Study Calendar */}
          {activeTab === 'calendar' && (
            <div className="h-full overflow-y-auto px-6 py-8">
              <div className="max-w-[1400px] mx-auto h-full">
                <CalendarView
                  user={user}
                  quizzes={quizzes}
                  studyEvents={studyEvents}
                  onRefreshEvents={refreshStudyEvents}
                  onStartQuiz={(quiz) => {
                    setCurrentQuiz(quiz);
                    setCurrentAttempt(null);
                    setActiveTab('active-study');
                    setMobileSplit('study');
                    setLayoutMode(quiz.isManual ? 'quiz-only' : 'split');
                  }}
                  onViewPDF={(file) => {
                    // Logic to view PDF if needed
                  }}
                />
              </div>
            </div>
          )}

          {/* Tab 5: Manual Quiz Creator */}
          {activeTab === 'manual-quiz' && (
            <div className="h-full px-4 py-6 sm:px-6 lg:py-8 lg:px-8">
              <ManualQuizCreator
                initialQuiz={manualQuizToEdit}
                onCancel={() => {
                  setManualQuizToEdit(null);
                  setActiveTab('dashboard');
                }}
                onSave={async (quizData) => {
                  if (!user) return;
                  
                  const isEditingManual = manualQuizToEdit && manualQuizToEdit.isManual;
                  const newQuiz: Quiz = {
                    id: isEditingManual ? manualQuizToEdit.id : crypto.randomUUID(),
                    userId: user.uid,
                    uploadDate: isEditingManual ? manualQuizToEdit.uploadDate : new Date().toISOString(),
                    scoreHistory: isEditingManual ? manualQuizToEdit.scoreHistory : [],
                    ...quizData,
                  };

                  try {
                    await saveQuizToFirestore(newQuiz);
                    setQuizzes(prev => {
                      if (isEditingManual) {
                        return prev.map(q => q.id === newQuiz.id ? newQuiz : q);
                      }
                      return [newQuiz, ...prev];
                    });
                    
                    setManualQuizToEdit(null);
                    
                    if (!newQuiz.isDraft) {
                      // Launch directly if published
                      setCurrentQuiz(newQuiz);
                      setCurrentAttempt(null);
                      setActiveTab('active-study');
                      setMobileSplit('study');
                      setLayoutMode('quiz-only');
                    } else {
                      // Back to history if just saved as draft
                      setActiveTab('history');
                    }
                  } catch (err) {
                    console.error('Error saving manual quiz:', err);
                    setError('Failed to save manual quiz to your cloud history.');
                  }
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
