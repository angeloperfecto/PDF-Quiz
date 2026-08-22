import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Timer, HelpCircle, CheckCircle, Clock, XCircle, Sparkles, Eye, EyeOff } from 'lucide-react';
import { Question } from '../types';

interface QuizViewProps {
  questions: Question[];
  onQuizSubmit: (userAnswers: number[], elapsedSeconds: number, questionMap?: number[], optionMaps?: number[][]) => void;
  onSelectReference: (pageNumber?: number, textExcerpt?: string) => void;
}

export default function QuizView({ questions, onQuizSubmit, onSelectReference }: QuizViewProps) {
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [randomize, setRandomize] = useState<boolean>(false);

  const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>([]);
  const [questionMap, setQuestionMap] = useState<number[]>([]);
  const [optionMaps, setOptionMaps] = useState<number[][]>([]);

  const [currentIdx, setCurrentIdx] = useState<number>(0);
  const [selectedAnswers, setSelectedAnswers] = useState<number[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [timerEnabled, setTimerEnabled] = useState<boolean>(true);
  const [instantFeedback, setInstantFeedback] = useState<boolean>(false);
  const [showGrid, setShowGrid] = useState<boolean>(true);

  // Reset when questions change
  useEffect(() => {
    setHasStarted(false);
    setRandomize(false);
    setCurrentIdx(0);
    setElapsedSeconds(0);
    setSelectedAnswers([]);
  }, [questions]);

  // Set up Timer
  useEffect(() => {
    if (!timerEnabled || !hasStarted) return;
    const interval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [timerEnabled, hasStarted]);

  const handleStart = () => {
    let newShuffledQuestions: Question[] = [];
    let newQuestionMap: number[] = [];
    let newOptionMaps: number[][] = [];

    if (randomize) {
      let indices = questions.map((_, i) => i);
      indices = indices.sort(() => Math.random() - 0.5);
      newQuestionMap = indices;
      
      newShuffledQuestions = indices.map((originalIdx) => {
        const q = questions[originalIdx];
        let optIndices = q.options.map((_, i) => i);
        optIndices = optIndices.sort(() => Math.random() - 0.5);
        newOptionMaps.push(optIndices);

        const shuffledOptions = optIndices.map(i => q.options[i]);
        const newCorrectIndex = optIndices.findIndex(val => Number(val) === Number(q.correctIndex));

        return {
          ...q,
          options: shuffledOptions,
          correctIndex: newCorrectIndex
        };
      });
    } else {
      newShuffledQuestions = questions.map(q => ({
        ...q,
        correctIndex: Number(q.correctIndex)
      }));
      newQuestionMap = questions.map((_, i) => i);
      newOptionMaps = questions.map(q => q.options.map((_, i) => i));
    }

    setShuffledQuestions(newShuffledQuestions);
    setQuestionMap(newQuestionMap);
    setOptionMaps(newOptionMaps);
    setSelectedAnswers(new Array(questions.length).fill(-1));
    setHasStarted(true);
  };

  const handleSelectOption = (optionIdx: number) => {
    const newAnswers = [...selectedAnswers];
    newAnswers[currentIdx] = optionIdx;
    setSelectedAnswers(newAnswers);

    // Auto update PDF viewer reference in the side-by-side mode if question has source page
    const currentQuestion = shuffledQuestions[currentIdx];
    if (currentQuestion.pageNumber || currentQuestion.sourceExcerpt) {
      onSelectReference(currentQuestion.pageNumber, currentQuestion.sourceExcerpt);
    }
  };

  const handleNext = () => {
    if (currentIdx < shuffledQuestions.length - 1) {
      const nextIdx = currentIdx + 1;
      setCurrentIdx(nextIdx);
      const nextQuestion = shuffledQuestions[nextIdx];
      if (nextQuestion.pageNumber || nextQuestion.sourceExcerpt) {
        onSelectReference(nextQuestion.pageNumber, nextQuestion.sourceExcerpt);
      }
    }
  };

  const handlePrev = () => {
    if (currentIdx > 0) {
      const prevIdx = currentIdx - 1;
      setCurrentIdx(prevIdx);
      const prevQuestion = shuffledQuestions[prevIdx];
      if (prevQuestion.pageNumber || prevQuestion.sourceExcerpt) {
        onSelectReference(prevQuestion.pageNumber, prevQuestion.sourceExcerpt);
      }
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSubmit = () => {
    const mappedUserAnswers = new Array(questions.length).fill(-1);

    for (let k = 0; k < shuffledQuestions.length; k++) {
      const originalQuestionIdx = questionMap[k];
      const selectedShuffledOptIdx = selectedAnswers[k];
      
      if (selectedShuffledOptIdx !== -1) {
        const originalOptIdx = optionMaps[k][selectedShuffledOptIdx];
        mappedUserAnswers[originalQuestionIdx] = originalOptIdx;
      }
    }

    onQuizSubmit(mappedUserAnswers, elapsedSeconds, questionMap, optionMaps);
  };

  if (!hasStarted) {
    return (
      <div className="glass-card border border-slate-200/50 dark:border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl shadow-slate-100/10 dark:shadow-none flex flex-col items-center justify-center h-full text-center">
        <div className="w-16 h-16 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-full flex items-center justify-center mb-6">
          <HelpCircle className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-800 dark:text-slate-100 font-display mb-2">Ready to Start?</h2>
        <p className="text-slate-600 dark:text-slate-400 max-w-sm mb-8 text-sm leading-relaxed">
          You are about to begin a {questions.length}-question quiz. Make sure you are ready to focus.
        </p>
        
        <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-white/10 p-5 rounded-2xl w-full max-w-sm mb-8">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                checked={randomize}
                onChange={(e) => setRandomize(e.target.checked)}
                className="w-5 h-5 appearance-none border-2 border-slate-300 dark:border-slate-600 rounded-lg checked:border-indigo-600 dark:checked:border-indigo-400 checked:bg-indigo-600 dark:checked:bg-indigo-400 transition-colors cursor-pointer peer"
              />
              <CheckCircle className="w-3.5 h-3.5 text-white absolute pointer-events-none opacity-0 peer-checked:opacity-100 transition-opacity" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200">Randomize Questions & Choices</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors">
                Shuffle the order of questions and all answer options to ensure a fresh experience.
              </p>
            </div>
          </label>
        </div>

        <button
          onClick={handleStart}
          className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold flex items-center gap-2 transition-all shadow-md active:scale-95"
        >
          <Timer className="w-5 h-5" /> Start Quiz Now
        </button>
      </div>
    );
  }

  const allAnswered = selectedAnswers.length > 0 && selectedAnswers.every(ans => ans !== -1);
  const totalAnsweredCount = selectedAnswers.filter(ans => ans !== -1).length;

  return (
    <div className="glass-card border border-slate-200/50 dark:border-white/10 rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-xl shadow-slate-100/10 dark:shadow-none flex flex-col h-full" id="quiz-view-root">
      {/* Quiz Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200/30 dark:border-white/5 pb-4 sm:pb-5 mb-4 sm:mb-6 flex-shrink-0">
        <div className="flex items-center gap-2 sm:gap-2.5">
          <HelpCircle className="w-5 h-5 text-indigo-500 flex-shrink-0" />
          <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base sm:text-lg font-display truncate">
            Question {currentIdx + 1} of {questions.length}
          </h3>
        </div>

        {/* Timer & Instant Feedback Controls */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            id="toggle-feedback-btn"
            onClick={() => setInstantFeedback(!instantFeedback)}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
              instantFeedback
                ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400'
                : 'bg-white/25 text-slate-600 border-slate-300/40 dark:bg-white/5 dark:border-white/5 dark:text-slate-300 hover:border-slate-400 dark:hover:border-white/10'
            }`}
            title="When turned on, you will see correct/wrong answers immediately after choosing"
          >
            <Sparkles className={`w-3.5 h-3.5 flex-shrink-0 ${instantFeedback ? 'animate-pulse text-emerald-500' : 'text-slate-400'}`} />
            <span className="truncate">Feedback: {instantFeedback ? 'ON' : 'OFF'}</span>
          </button>

          <button
            id="toggle-timer-btn"
            onClick={() => setTimerEnabled(!timerEnabled)}
            className={`flex items-center justify-center gap-1.5 px-2.5 py-2 sm:py-1.5 rounded-xl border text-[11px] sm:text-xs font-semibold transition-all cursor-pointer ${
              timerEnabled
                ? 'bg-red-500/10 text-red-600 border-red-500/20 dark:text-red-400'
                : 'bg-white/25 text-slate-600 border-slate-300/40 dark:bg-white/5 dark:border-white/5 dark:text-slate-300 hover:border-slate-400 dark:hover:border-white/10'
            }`}
          >
            <Timer className={`w-3.5 h-3.5 flex-shrink-0 ${timerEnabled ? 'animate-pulse' : ''}`} />
            <span className="truncate">{formatTime(elapsedSeconds)} {timerEnabled ? 'Pause' : 'Play'}</span>
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-slate-200/50 dark:bg-slate-800/50 h-1.5 rounded-full overflow-hidden mb-5 sm:mb-8 flex-shrink-0">
        <div
          className="bg-indigo-600 dark:bg-indigo-400 h-full transition-all duration-300"
          style={{ width: `${((currentIdx + 1) / questions.length) * 100}%` }}
        />
      </div>

      {/* Question Content */}
      <div className="flex-1 overflow-y-auto space-y-6 pr-1" id="quiz-question-container">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {shuffledQuestions[currentIdx].pageNumber && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 dark:bg-indigo-950/30 px-2.5 py-1 rounded-md border border-indigo-500/20">
                <Clock className="w-3 h-3" /> Grounded on Page {shuffledQuestions[currentIdx].pageNumber}
              </span>
            )}
            {shuffledQuestions[currentIdx].difficulty && (
              <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-md border ${
                shuffledQuestions[currentIdx].difficulty === 'Hard' ? 'text-rose-600 dark:text-rose-400 bg-rose-500/10 border-rose-500/20' :
                shuffledQuestions[currentIdx].difficulty === 'Medium' ? 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/20' :
                'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
              }`}>
                {shuffledQuestions[currentIdx].difficulty}
              </span>
            )}
          </div>
          
          {shuffledQuestions[currentIdx].imageAttachment && (
            <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-white/10 max-w-sm">
              <img src={shuffledQuestions[currentIdx].imageAttachment} alt="Question Reference" className="w-full h-auto object-contain bg-slate-50 dark:bg-slate-900" />
            </div>
          )}

          <h4 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100 leading-snug sm:leading-relaxed font-display">
            {shuffledQuestions[currentIdx].questionText}
          </h4>
        </div>

        {/* Answer Choices */}
        <div className="space-y-2.5 sm:space-y-3.5">
          {shuffledQuestions[currentIdx].options.map((option, optIdx) => {
            const letters = ['A', 'B', 'C', 'D'];
            const isSelected = selectedAnswers[currentIdx] === optIdx;
            const correctIndex = shuffledQuestions[currentIdx].correctIndex;
            const hasAnswered = selectedAnswers[currentIdx] !== -1;
            const showFeedback = instantFeedback && hasAnswered;

            let buttonClass = '';
            let bubbleClass = '';
            let textClass = '';

            if (showFeedback) {
              if (optIdx === correctIndex) {
                buttonClass = 'border-emerald-500/60 bg-emerald-500/10 dark:bg-emerald-500/15 shadow-md shadow-emerald-500/5 cursor-default';
                bubbleClass = 'bg-emerald-600 text-white';
                textClass = 'text-emerald-950 dark:text-emerald-200 font-bold';
              } else if (isSelected) {
                buttonClass = 'border-red-500/60 bg-red-500/10 dark:bg-red-500/15 shadow-md shadow-red-500/5 cursor-default';
                bubbleClass = 'bg-red-600 text-white';
                textClass = 'text-red-950 dark:text-red-200 font-bold';
              } else {
                buttonClass = 'border-slate-200/30 dark:border-white/5 bg-white/10 dark:bg-white/5 opacity-50 cursor-default';
                bubbleClass = 'bg-slate-100 dark:bg-white/5 text-slate-400 dark:text-slate-500';
                textClass = 'text-slate-400 dark:text-slate-500';
              }
            } else {
              if (isSelected) {
                buttonClass = 'border-indigo-500/60 bg-indigo-500/10 dark:bg-indigo-500/15 shadow-md shadow-indigo-500/5';
                bubbleClass = 'bg-indigo-600 text-white shadow-sm';
                textClass = 'text-indigo-950 dark:text-indigo-200 font-bold';
              } else {
                buttonClass = 'border-slate-200/50 dark:border-white/5 bg-white/20 dark:bg-white/5 hover:border-slate-300 dark:hover:border-white/10';
                bubbleClass = 'bg-slate-200/60 dark:bg-white/10 text-slate-600 dark:text-slate-300 group-hover:bg-slate-300/70 dark:group-hover:bg-slate-700';
                textClass = 'text-slate-800 dark:text-slate-200';
              }
            }

            return (
              <button
                key={optIdx}
                id={`option-${currentIdx}-${optIdx}`}
                disabled={showFeedback}
                onClick={() => !showFeedback && handleSelectOption(optIdx)}
                className={`w-full p-3 sm:p-4 rounded-xl sm:rounded-2xl border text-left flex items-start gap-3 sm:gap-4 transition-all duration-200 group cursor-pointer ${buttonClass} min-h-[44px] sm:min-h-[52px]`}
              >
                <span className={`w-6 h-6 sm:w-7 sm:h-7 flex-shrink-0 rounded-lg sm:rounded-xl font-bold text-xs flex items-center justify-center transition-all ${bubbleClass}`}>
                  {letters[optIdx]}
                </span>
                <span className={`text-xs sm:text-sm font-medium leading-relaxed flex-1 ${textClass} break-words whitespace-normal`}>
                  {option}
                </span>
                {showFeedback && optIdx === correctIndex && (
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0 self-center animate-pulse ml-auto" />
                )}
                {showFeedback && isSelected && optIdx !== correctIndex && (
                  <XCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 self-center animate-pulse ml-auto" />
                )}
              </button>
            );
          })}
        </div>

        {/* Instant Feedback Explanation */}
        {instantFeedback && selectedAnswers[currentIdx] !== -1 && shuffledQuestions[currentIdx].explanation && (
          <div className="bg-emerald-500/5 dark:bg-emerald-950/15 border border-emerald-500/20 dark:border-emerald-500/10 rounded-2xl p-4 mt-4 animate-fadeIn">
            <h5 className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider mb-1.5 font-display flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Explanation
            </h5>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
              {shuffledQuestions[currentIdx].explanation}
            </p>
          </div>
        )}
      </div>

      {/* Quick Jump Grid */}
      <div className="border-t border-slate-200/30 dark:border-white/5 pt-4 sm:pt-6 mt-4 sm:mt-6 flex-shrink-0">
        <div className="flex items-center justify-between gap-2 mb-3">
          <p className="text-[11px] sm:text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider truncate flex-1">
            Progress ({totalAnsweredCount}/{questions.length} answered)
          </p>
          <button
            id="toggle-progress-grid-btn"
            onClick={() => setShowGrid(!showGrid)}
            className="flex items-center gap-1 px-2 py-1 sm:px-2.5 sm:py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] sm:text-[11px] font-bold text-slate-600 dark:text-slate-300 transition-all cursor-pointer flex-shrink-0"
          >
            {showGrid ? (
              <>
                <EyeOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Hide Grid</span>
              </>
            ) : (
              <>
                <Eye className="w-3 h-3 sm:w-3.5 sm:h-3.5" /> <span className="hidden xs:inline">Show Grid</span>
              </>
            )}
          </button>
        </div>

        {showGrid && (
          <div className="flex flex-wrap gap-1.5 sm:gap-2 animate-fadeIn max-h-[140px] overflow-y-auto pr-1">
            {shuffledQuestions.map((_, idx) => {
              const isAnswered = selectedAnswers[idx] !== -1;
              const isCurrent = idx === currentIdx;
              return (
                <button
                  key={idx}
                  id={`jump-btn-${idx}`}
                  onClick={() => {
                    setCurrentIdx(idx);
                    const q = shuffledQuestions[idx];
                    if (q.pageNumber || q.sourceExcerpt) {
                      onSelectReference(q.pageNumber, q.sourceExcerpt);
                    }
                  }}
                  className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg font-bold text-xs flex items-center justify-center border transition-all cursor-pointer flex-shrink-0 ${
                    isCurrent
                      ? 'border-indigo-500/60 bg-indigo-600 text-white scale-105 shadow-md font-extrabold'
                      : isAnswered
                      ? 'border-slate-300 dark:border-white/10 bg-slate-200/40 dark:bg-white/10 text-slate-800 dark:text-slate-200'
                      : 'border-slate-300/60 dark:border-white/5 bg-white/25 dark:bg-white/5 hover:border-slate-400 dark:hover:border-white/10 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="flex items-center justify-between gap-3 border-t border-slate-200/30 dark:border-white/5 pt-4 sm:pt-6 mt-4 sm:mt-6 flex-shrink-0">
        <button
          id="prev-question-btn"
          disabled={currentIdx === 0}
          onClick={handlePrev}
          className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-100 dark:disabled:hover:bg-slate-800 transition-all active:scale-[0.98] cursor-pointer min-h-[44px]"
        >
          <ChevronLeft className="w-4 h-4 flex-shrink-0" /> Previous
        </button>

        {currentIdx === questions.length - 1 ? (
          <button
            id="submit-quiz-btn"
            onClick={handleSubmit}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold text-white shadow-lg transition-all duration-200 active:scale-[0.98] cursor-pointer min-h-[44px] ${
              allAnswered
                ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 shadow-green-100 dark:shadow-none hover:scale-[1.02]'
                : 'bg-indigo-600 hover:bg-indigo-500 shadow-indigo-100 dark:shadow-none'
            }`}
          >
            <CheckCircle className="w-4 h-4 flex-shrink-0" /> <span className="truncate">Submit Quiz</span>
          </button>
        ) : (
          <button
            id="next-question-btn"
            onClick={handleNext}
            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 sm:px-5 py-2.5 sm:py-3 rounded-xl text-xs sm:text-sm font-semibold text-indigo-700 bg-indigo-100 hover:bg-indigo-200 dark:text-indigo-300 dark:bg-indigo-500/20 dark:hover:bg-indigo-500/30 transition-all active:scale-[0.98] cursor-pointer min-h-[44px]"
          >
            Next <ChevronRight className="w-4 h-4 flex-shrink-0" />
          </button>
        )}
      </div>
    </div>
  );
}
