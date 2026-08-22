import React, { useState, useMemo } from 'react';
import { 
  BookOpen, 
  Calendar, 
  HelpCircle, 
  Trophy, 
  Trash2, 
  ArrowRight, 
  FileText, 
  Search, 
  Filter, 
  Sparkles, 
  Loader2, 
  ShieldCheck, 
  RefreshCw, 
  CheckCircle 
} from 'lucide-react';
import { Quiz } from '../types';

interface HistoryViewProps {
  quizzes: Quiz[];
  user: any;
  onSelectQuiz: (quiz: Quiz) => void;
  onDeleteQuiz: (quizId: string) => void;
  onEditQuiz: (quiz: Quiz) => void;
  onUpdateQuiz?: (quiz: Quiz) => void;
}

export default function HistoryView({ 
  quizzes, 
  user,
  onSelectQuiz, 
  onDeleteQuiz, 
  onEditQuiz,
  onUpdateQuiz 
}: HistoryViewProps) {
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState<string>('All');
  const [filterType, setFilterType] = useState<'All' | 'Manual' | 'PDF'>('All');

  // Audit and Healing State
  const [isAuditing, setIsAuditing] = useState<boolean>(false);
  const [singleAuditId, setSingleAuditId] = useState<string | null>(null);
  const [auditProgress, setAuditProgress] = useState<{ 
    total: number; 
    current: number; 
    corrections: number; 
    activeQuizName: string; 
  } | null>(null);

  const getBestScore = (quiz: Quiz) => {
    if (!quiz.scoreHistory || quiz.scoreHistory.length === 0) return null;
    const percentages = quiz.scoreHistory.map(h => h.percentage);
    return Math.max(...percentages);
  };

  const filteredQuizzes = useMemo(() => {
    return quizzes.filter((quiz) => {
      const matchesSearch = 
        !searchTerm || 
        (quiz.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (quiz.subject || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (quiz.fileName || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesDifficulty = filterDifficulty === 'All' || quiz.difficulty === filterDifficulty;

      const matchesType = 
        filterType === 'All' || 
        (filterType === 'Manual' && quiz.isManual) || 
        (filterType === 'PDF' && !quiz.isManual);

      return matchesSearch && matchesDifficulty && matchesType;
    });
  }, [quizzes, searchTerm, filterDifficulty, filterType]);

  // Core Audit API Handler
  const auditQuiz = async (quiz: Quiz): Promise<number> => {
    try {
      const response = await fetch('/api/audit-quiz', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ questions: quiz.questions }),
      });
      
      if (!response.ok) {
        throw new Error('Audit API returned an error');
      }
      
      const data = await response.json();
      if (data && Array.isArray(data.questions)) {
        let correctionCount = 0;
        const updatedQuestions = quiz.questions.map((originalQ, qIdx) => {
          const correctedQ = data.questions[qIdx];
          if (correctedQ) {
            const originalIndex = Number(originalQ.correctIndex);
            const correctedIndex = Number(correctedQ.correctIndex);
            const originalText = String(originalQ.correctAnswerText || '').trim().toLowerCase();
            const correctedText = String(correctedQ.correctAnswerText || '').trim().toLowerCase();
            
            if (originalIndex !== correctedIndex || originalText !== correctedText) {
              correctionCount++;
            }
            return {
              ...originalQ,
              correctIndex: correctedIndex,
              correctAnswerText: correctedQ.correctAnswerText,
              explanation: correctedQ.explanation || originalQ.explanation
            };
          }
          return originalQ;
        });
        
        if (correctionCount > 0 || updatedQuestions.some((q, i) => q.explanation !== quiz.questions[i].explanation)) {
          const updatedQuiz = {
            ...quiz,
            questions: updatedQuestions
          };
          if (onUpdateQuiz) {
            await onUpdateQuiz(updatedQuiz);
          }
        }
        return correctionCount;
      }
    } catch (err) {
      console.error(`Failed to audit quiz ${quiz.id}:`, err);
    }
    return 0;
  };

  // Batch Audit All Quizzes
  const auditAllQuizzes = async () => {
    if (quizzes.length === 0) return;
    setIsAuditing(true);
    let totalCorrections = 0;
    
    setAuditProgress({
      total: quizzes.length,
      current: 0,
      corrections: 0,
      activeQuizName: ''
    });
    
    for (let i = 0; i < quizzes.length; i++) {
      const quiz = quizzes[i];
      setAuditProgress(prev => prev ? {
        ...prev,
        current: i,
        activeQuizName: quiz.title || quiz.fileName || 'Untitled'
      } : null);
      
      const corrections = await auditQuiz(quiz);
      totalCorrections += corrections;
      
      setAuditProgress(prev => prev ? {
        ...prev,
        corrections: prev.corrections + corrections
      } : null);
    }
    
    setAuditProgress(prev => prev ? {
      ...prev,
      current: quizzes.length,
      activeQuizName: 'Verification Complete!'
    } : null);
    
    setTimeout(() => {
      setIsAuditing(false);
      setAuditProgress(null);
    }, 6000);
  };

  return (
    <div className="space-y-6" id="history-view-root">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200/30 dark:border-white/5 pb-4">
        <div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 font-display">
            Study History
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Re-access, study, or review previous generated quizzes and files.
          </p>
        </div>
      </div>

      {/* Diagnostic & Healing Hub Banner */}
      <div className="bg-slate-50 dark:bg-slate-900/60 border border-slate-200/80 dark:border-white/5 rounded-2xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h4 className="font-bold text-sm text-slate-800 dark:text-slate-100 uppercase tracking-wider font-display">
                Smart Quiz Auditing & Healing Hub
              </h4>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed max-w-2xl">
              Verify your questions against original technical references, recalculate equations, and repair any misaligned answer keys using our dual-layer correction engine.
            </p>
          </div>
          
          <button
            onClick={auditAllQuizzes}
            disabled={isAuditing || quizzes.length === 0}
            className="self-start sm:self-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-200 disabled:dark:bg-slate-800 disabled:text-slate-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
          >
            {isAuditing && !singleAuditId ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5" />
            )}
            {isAuditing && !singleAuditId ? 'Auditing & Repairing...' : 'Verify & Heal All Quizzes'}
          </button>
        </div>

        {/* Audit Progress Dashboard */}
        {auditProgress && (
          <div className="bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-white/5 rounded-xl p-4 space-y-3 animate-fadeIn">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                {auditProgress.current < auditProgress.total ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                    Analyzing: <span className="text-indigo-600 dark:text-indigo-400 font-mono font-extrabold">{auditProgress.activeQuizName}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                    Audit Complete!
                  </>
                )}
              </span>
              <span className="font-mono font-bold text-slate-500 dark:text-slate-400">
                {auditProgress.current} / {auditProgress.total} Quizzes
              </span>
            </div>

            {/* Progress Bar */}
            <div className="w-full bg-slate-100 dark:bg-slate-900 h-2 rounded-full overflow-hidden">
              <div
                className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
                style={{ width: `${(auditProgress.current / auditProgress.total) * 100}%` }}
              />
            </div>

            {/* Corrections Found */}
            <div className="flex items-center justify-between text-xs pt-1">
              <span className="text-slate-600 dark:text-slate-400 font-semibold">
                Mismatched answer keys detected & healed:
              </span>
              <span className={`px-2 py-0.5 rounded-full font-bold font-mono text-[11px] ${
                auditProgress.corrections > 0 
                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-400' 
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}>
                {auditProgress.corrections} Fixed
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-3 bg-white/40 dark:bg-slate-900/30 p-3 rounded-2xl border border-slate-200/50 dark:border-white/5">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by title, subject, or keyword..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-slate-800 dark:text-slate-100 placeholder:text-slate-400"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            className="flex-1 sm:w-32 px-3 py-2 bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-700 dark:text-slate-200"
          >
            <option value="All">Any Difficulty</option>
            <option value="Easy">Easy</option>
            <option value="Medium">Medium</option>
            <option value="Hard">Hard</option>
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="flex-1 sm:w-32 px-3 py-2 bg-white dark:bg-slate-950/50 border border-slate-200 dark:border-white/10 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 text-slate-700 dark:text-slate-200"
          >
            <option value="All">All Types</option>
            <option value="Manual">Manual</option>
            <option value="PDF">PDF Generated</option>
          </select>
        </div>
      </div>

      {filteredQuizzes.length === 0 ? (
        <div className="text-center py-16 glass-card border border-slate-200/50 dark:border-white/10 rounded-3xl p-8 shadow-sm">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4 animate-pulse" />
          <h4 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1 font-display">No quizzes found</h4>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-sm mx-auto mb-6 leading-relaxed">
            {quizzes.length === 0 
              ? "Upload your first study PDF to instantly generate interactive smart quizzes based on factual references."
              : "Try adjusting your search or filters."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredQuizzes.map((quiz) => {
            const bestScore = getBestScore(quiz);
            const formattedDate = new Date(quiz.uploadDate).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            });

            return (
              <div
                key={quiz.id}
                id={`history-card-${quiz.id}`}
                className="glass-card border border-slate-200/50 dark:border-white/10 rounded-3xl p-6 shadow-sm hover:shadow-md hover:border-indigo-500/50 dark:hover:border-indigo-400/50 transition-all duration-300 flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${quiz.isManual ? 'bg-indigo-500/10 text-indigo-500 dark:text-indigo-400' : 'bg-red-500/10 text-red-500 dark:text-red-400'}`}>
                        {quiz.isManual ? <BookOpen className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors font-display">
                          {quiz.title || quiz.fileName}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300 mt-1">
                          {quiz.isManual && (
                            <span className="flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400 border border-indigo-600/30 px-1.5 py-0.5 rounded">
                              {quiz.isDraft ? 'DRAFT' : 'MANUAL'}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" /> {formattedDate}
                          </span>
                        </div>
                      </div>
                    </div>

                    {deleteConfirmId === quiz.id ? (
                      <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 p-1 rounded-xl">
                        <span className="text-[10px] font-bold text-red-600 dark:text-red-400 px-1">Delete?</span>
                        <button
                          id={`confirm-delete-yes-${quiz.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteQuiz(quiz.id);
                            setDeleteConfirmId(null);
                          }}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-[9px] font-bold uppercase transition-all"
                        >
                          Yes
                        </button>
                        <button
                          id={`confirm-delete-no-${quiz.id}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeleteConfirmId(null);
                          }}
                          className="px-2 py-1 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-700 dark:text-slate-300 rounded-lg text-[9px] font-bold uppercase transition-all"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        id={`delete-quiz-${quiz.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirmId(quiz.id);
                        }}
                        className="p-1.5 hover:bg-red-500/10 text-slate-400 hover:text-red-500 rounded-lg transition-colors"
                        title="Delete study reference"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Config Badges */}
                  <div className="flex flex-wrap gap-1.5">
                    <span className="text-[10px] font-bold bg-white/25 dark:bg-white/5 border border-slate-300/40 dark:border-white/5 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                      {quiz.numQuestions} Questions
                    </span>
                    <span className="text-[10px] font-bold bg-white/25 dark:bg-white/5 border border-slate-300/40 dark:border-white/5 text-slate-700 dark:text-slate-300 px-2 py-0.5 rounded">
                      {quiz.difficulty}
                    </span>
                    <span className="text-[10px] font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded">
                      {quiz.questionType}
                    </span>
                  </div>
                </div>

                <div className="border-t border-slate-200/30 dark:border-white/5 pt-4 mt-5 flex items-center justify-between">
                  <div>
                    {bestScore !== null ? (
                      <div className="flex items-center gap-1.5">
                        <Trophy className="w-4 h-4 text-amber-500 animate-bounce" />
                        <span className="text-xs text-slate-600 dark:text-slate-300">Best Score:</span>
                        <span className="text-sm font-extrabold text-slate-800 dark:text-slate-200 font-display">
                          {Math.round(bestScore)}%
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
                        <HelpCircle className="w-4 h-4" />
                        <span className="text-xs italic">Not taken yet</span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => onEditQuiz(quiz)}
                      className="text-xs font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
                    >
                      {quiz.isManual ? 'Edit Quiz' : 'Clone to Manual'}
                    </button>
                    
                    <button
                      onClick={async () => {
                        if (isAuditing) return;
                        setIsAuditing(true);
                        setSingleAuditId(quiz.id);
                        const corrections = await auditQuiz(quiz);
                        setIsAuditing(false);
                        setSingleAuditId(null);
                        alert(`Verification complete! Successfully healed ${corrections} mismatched answer keys in this quiz.`);
                      }}
                      disabled={isAuditing}
                      className="text-xs font-bold text-indigo-600 dark:text-indigo-400 disabled:text-slate-400 flex items-center gap-1 font-display"
                    >
                      {singleAuditId === quiz.id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-indigo-500" />
                      ) : (
                        <ShieldCheck className="w-3.5 h-3.5 text-indigo-500" />
                      )}
                      Verify Answers
                    </button>

                    {!quiz.isDraft && (
                      <button
                        id={`open-quiz-${quiz.id}`}
                        onClick={() => onSelectQuiz(quiz)}
                        className="text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 font-display"
                      >
                        Open Quiz <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
