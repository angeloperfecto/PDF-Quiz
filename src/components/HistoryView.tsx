import React from 'react';
import { BookOpen, Calendar, HelpCircle, Trophy, Trash2, ArrowRight, FileText } from 'lucide-react';
import { Quiz } from '../types';

interface HistoryViewProps {
  quizzes: Quiz[];
  onSelectQuiz: (quiz: Quiz) => void;
  onDeleteQuiz: (quizId: string) => void;
}

export default function HistoryView({ quizzes, onSelectQuiz, onDeleteQuiz }: HistoryViewProps) {
  const [deleteConfirmId, setDeleteConfirmId] = React.useState<string | null>(null);

  const getBestScore = (quiz: Quiz) => {
    if (!quiz.scoreHistory || quiz.scoreHistory.length === 0) return null;
    const percentages = quiz.scoreHistory.map(h => h.percentage);
    return Math.max(...percentages);
  };

  return (
    <div className="space-y-6" id="history-view-root">
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

      {quizzes.length === 0 ? (
        <div className="text-center py-16 glass-card border border-slate-200/50 dark:border-white/10 rounded-3xl p-8 shadow-sm">
          <BookOpen className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-4 animate-pulse" />
          <h4 className="text-lg font-bold text-slate-800 dark:text-slate-200 mb-1 font-display">No quizzes generated yet</h4>
          <p className="text-sm text-slate-600 dark:text-slate-300 max-w-sm mx-auto mb-6 leading-relaxed">
            Upload your first study PDF to instantly generate interactive smart quizzes based on factual references.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {quizzes.map((quiz) => {
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
                      <div className="p-2.5 bg-red-500/10 text-red-500 dark:text-red-400 rounded-xl">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-100 line-clamp-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors font-display">
                          {quiz.fileName}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-300 mt-1">
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

                  <button
                    id={`open-quiz-${quiz.id}`}
                    onClick={() => onSelectQuiz(quiz)}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 flex items-center gap-1 font-display"
                  >
                    Open Quiz <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
