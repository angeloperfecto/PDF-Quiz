import React, { useState } from 'react';
import { Award, RotateCcw, Download, Printer, Check, X, FileJson, FileText, ArrowRight, Highlighter } from 'lucide-react';
import { Quiz, QuizAttempt } from '../types';

interface ResultsViewProps {
  quiz: Quiz;
  attempt: QuizAttempt;
  onRetake: () => void;
  onSelectReference: (pageNumber?: number, textExcerpt?: string) => void;
}

export default function ResultsView({ quiz, attempt, onRetake, onSelectReference }: ResultsViewProps) {
  const [activeQuestionTab, setActiveQuestionTab] = useState<'all' | 'correct' | 'incorrect'>('all');

  const correctCount = attempt.score;
  const incorrectCount = quiz.questions.length - attempt.score;
  const percentage = Math.round(attempt.percentage);

  // Format time elapsed
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Export handlers
  const exportToJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(quiz, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${quiz.fileName.replace('.pdf', '')}_quiz_data.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const exportToTXT = () => {
    let text = `========================================================================\n`;
    text += `STUDY WORKsheet & EXAM PAPER\n`;
    text += `Source Document: ${quiz.fileName}\n`;
    text += `Generated on: ${new Date(quiz.uploadDate).toLocaleDateString()}\n`;
    text += `Difficulty Level: ${quiz.difficulty} | Mode: ${quiz.questionType}\n`;
    text += `========================================================================\n\n`;

    quiz.questions.forEach((q, idx) => {
      text += `${idx + 1}. ${q.questionText}\n`;
      const letters = ['A', 'B', 'C', 'D'];
      q.options.forEach((opt, oIdx) => {
        text += `   [ ] ${letters[oIdx]}) ${opt}\n`;
      });
      text += `\n`;
    });

    text += `\n================== DETAILED ANSWER KEY & SOURCE EXPLANATIONS ==================\n\n`;
    quiz.questions.forEach((q, idx) => {
      const letters = ['A', 'B', 'C', 'D'];
      text += `${idx + 1}. Correct Answer: ${letters[q.correctIndex]}) ${q.options[q.correctIndex]}\n`;
      if (q.explanation) {
        text += `   Explanatory Rationale: ${q.explanation}\n`;
      }
      if (q.sourceExcerpt) {
        text += `   Direct Grounded Quote: "${q.sourceExcerpt}"\n`;
      }
      if (q.pageNumber) {
        text += `   PDF Reference Page: ${q.pageNumber}\n`;
      }
      text += `\n------------------------------------------------------------------------\n\n`;
    });

    const dataStr = 'data:text/plain;charset=utf-8,' + encodeURIComponent(text);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `${quiz.fileName.replace('.pdf', '')}_study_worksheet.txt`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  // Filter questions based on active tab
  const filteredQuestions = quiz.questions.map((q, idx) => ({ q, idx })).filter(({ q, idx }) => {
    const isCorrect = attempt.userAnswers[idx] === q.correctIndex;
    if (activeQuestionTab === 'correct') return isCorrect;
    if (activeQuestionTab === 'incorrect') return !isCorrect;
    return true;
  });

  return (
    <div className="space-y-8" id="results-view-root">
      {/* Score Summary Dashboard */}
      <div className="glass-card border border-slate-200/50 dark:border-white/10 rounded-3xl p-8 shadow-xl shadow-slate-100/10 dark:shadow-none print:hidden">
        <div className="flex flex-col md:flex-row items-center gap-8">
          <div className="relative flex-shrink-0 flex items-center justify-center w-40 h-40 rounded-full bg-white/20 dark:bg-white/5 border-4 border-slate-200/40 dark:border-white/5">
            <div className="text-center">
              <span className="block text-4xl font-extrabold text-indigo-600 dark:text-indigo-400 font-display">
                {percentage}%
              </span>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mt-1 block font-display">
                Total Score
              </span>
            </div>
            <div className="absolute -top-1 -right-1 p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-2xl shadow-md">
              <Award className="w-5 h-5" />
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-100 font-display">
                {percentage >= 80 ? 'Exceptional Work!' : percentage >= 50 ? 'Keep Practicing!' : 'Needs Revision!'}
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                You took a {quiz.numQuestions} question quiz in {formatTime(attempt.elapsedSeconds)} minutes on {quiz.fileName}.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="bg-emerald-500/10 border border-emerald-500/20 p-3 rounded-2xl animate-fade-in">
                <span className="block text-xs font-semibold text-emerald-600 dark:text-emerald-400">Correct Answers</span>
                <span className="text-lg font-bold text-emerald-700 dark:text-emerald-300">{correctCount}</span>
              </div>
              <div className="bg-red-500/10 border border-red-500/20 p-3 rounded-2xl animate-fade-in">
                <span className="block text-xs font-semibold text-red-600 dark:text-red-400">Incorrect Answers</span>
                <span className="text-lg font-bold text-red-700 dark:text-red-300">{incorrectCount}</span>
              </div>
              <div className="bg-white/20 dark:bg-white/5 border border-slate-300/55 dark:border-white/5 p-3 rounded-2xl col-span-2 sm:col-span-1">
                <span className="block text-xs font-semibold text-slate-600 dark:text-slate-300">Completion Time</span>
                <span className="text-lg font-bold text-slate-800 dark:text-slate-200">{formatTime(attempt.elapsedSeconds)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <button
                id="retake-quiz-btn"
                onClick={onRetake}
                className="py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-sm flex items-center gap-1.5 transition-all shadow-[0_4px_12px_rgba(99,102,241,0.2)] active:scale-[0.98]"
              >
                <RotateCcw className="w-4 h-4" /> Retake Quiz
              </button>

              <div className="flex items-center gap-1.5">
                <button
                  id="export-txt-btn"
                  onClick={exportToTXT}
                  className="p-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300"
                  title="Export study worksheet (.txt)"
                >
                  <FileText className="w-4 h-4" />
                </button>
                <button
                  id="export-json-btn"
                  onClick={exportToJSON}
                  className="p-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300"
                  title="Export schema JSON (.json)"
                >
                  <FileJson className="w-4 h-4" />
                </button>
                <button
                  id="print-exam-btn"
                  onClick={handlePrint}
                  className="p-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-850 text-slate-600 dark:text-slate-300"
                  title="Print paper"
                >
                  <Printer className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Detailed Question Review Sheet */}
      <div className="space-y-6" id="review-panel">
        <div className="flex items-center justify-between border-b border-slate-200/30 dark:border-white/5 pb-4 print:hidden">
          <h4 className="font-bold text-slate-800 dark:text-slate-200 text-lg font-display">
            Review Questions
          </h4>
          <div className="flex bg-white/20 dark:bg-white/5 border border-slate-200/40 dark:border-white/5 p-1 rounded-xl">
            {(['all', 'correct', 'incorrect'] as const).map((tab) => (
              <button
                key={tab}
                id={`tab-filter-${tab}`}
                onClick={() => setActiveQuestionTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                  activeQuestionTab === tab
                    ? 'bg-white/85 dark:bg-indigo-600 text-slate-900 dark:text-slate-50 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900 dark:text-slate-450 dark:hover:text-slate-200'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        {/* List of Questions with explanations */}
        <div className="space-y-6">
          {filteredQuestions.length === 0 ? (
            <div className="text-center py-12 bg-white dark:bg-slate-900/40 rounded-3xl border border-slate-300 dark:border-slate-800/80">
              <p className="text-sm text-slate-600 dark:text-slate-300 font-medium">No questions match the active review filter.</p>
            </div>
          ) : (
            filteredQuestions.map(({ q, idx }) => {
              const userAnswer = attempt.userAnswers[idx];
              const isCorrect = userAnswer === q.correctIndex;
              const letters = ['A', 'B', 'C', 'D'];

              return (
                <div
                  key={idx}
                  id={`review-card-${idx}`}
                  className={`glass-card border rounded-3xl p-6 sm:p-8 shadow-sm transition-all duration-300 print:border-slate-300 print:shadow-none ${
                    isCorrect
                      ? 'border-slate-200/40 dark:border-white/5 bg-white/10 dark:bg-[#0f172a]/20'
                      : 'border-red-500/20 bg-red-500/5'
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-slate-300/50 dark:bg-white/10 text-slate-800 dark:text-slate-200 font-extrabold text-sm flex items-center justify-center">
                        {idx + 1}
                      </span>
                      {isCorrect ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                          <Check className="w-3.5 h-3.5" /> Correct
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 dark:text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full border border-red-500/20">
                          <X className="w-3.5 h-3.5" /> Incorrect
                        </span>
                      )}
                    </div>

                    {/* PDF locator */}
                    {q.pageNumber && (
                      <button
                        id={`locate-page-btn-${idx}`}
                        onClick={() => onSelectReference(q.pageNumber, q.sourceExcerpt)}
                        className="text-xs text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 font-bold bg-indigo-500/10 px-3 py-1.5 rounded-xl border border-indigo-500/20 flex items-center gap-1.5 transition-colors print:hidden font-display"
                      >
                        <Highlighter className="w-3.5 h-3.5" /> View source page {q.pageNumber}
                      </button>
                    )}
                  </div>

                  <h5 className="text-base font-bold text-slate-800 dark:text-slate-100 mb-5 leading-relaxed font-display">
                    {q.questionText}
                  </h5>

                  {/* Options output */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                    {q.options.map((opt, oIdx) => {
                      const isOptionSelected = userAnswer === oIdx;
                      const isOptionCorrect = q.correctIndex === oIdx;
                      
                      let optionStyle = 'border-slate-200/40 dark:border-white/5 bg-white/10 dark:bg-[#0f172a]/20';
                      if (isOptionCorrect) {
                        optionStyle = 'border-emerald-500 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300';
                      } else if (isOptionSelected) {
                        optionStyle = 'border-red-500 bg-red-500/10 text-red-900 dark:text-red-300';
                      }

                      return (
                        <div
                          key={oIdx}
                          className={`p-3.5 rounded-xl border text-sm font-medium flex items-start gap-3 transition-colors ${optionStyle}`}
                        >
                          <span
                            className={`w-5 h-5 rounded-md text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                              isOptionCorrect
                                ? 'bg-emerald-600 text-white'
                                : isOptionSelected
                                ? 'bg-red-600 text-white'
                                : 'bg-slate-300/60 dark:bg-white/10 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            {letters[oIdx]}
                          </span>
                          <span className="leading-normal">{opt}</span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation Block */}
                  {q.explanation && (
                    <div className="p-4 bg-white/20 dark:bg-white/5 rounded-2xl border border-slate-200/45 dark:border-white/5 text-sm backdrop-blur-md">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                        <ArrowRight className="w-3.5 h-3.5 text-indigo-500" /> Explanation
                      </p>
                      <p className="text-slate-750 dark:text-slate-200 leading-relaxed">
                        {q.explanation}
                      </p>

                      {q.sourceExcerpt && (
                        <div className="mt-3 pt-3 border-t border-slate-200/30 dark:border-white/5">
                          <p className="text-[11px] font-bold text-slate-550 dark:text-slate-400 uppercase tracking-wider mb-1 font-display">
                            Grounded Reference Snippet
                          </p>
                          <p className="text-xs text-slate-600 dark:text-slate-300 italic font-medium leading-relaxed">
                            &ldquo;{q.sourceExcerpt}&rdquo;
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
