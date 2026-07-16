import React, { useState, useRef, useEffect } from 'react';
import { Quiz, Question } from '../types';
import { Plus, Trash2, Save, Image as ImageIcon, CheckCircle2, Circle, AlertCircle, Copy, ArrowLeft, Download } from 'lucide-react';

interface ManualQuizCreatorProps {
  initialQuiz?: Quiz | null;
  onSave: (quiz: Omit<Quiz, 'id' | 'userId' | 'uploadDate' | 'scoreHistory'>) => void;
  onCancel: () => void;
}

export default function ManualQuizCreator({ initialQuiz, onSave, onCancel }: ManualQuizCreatorProps) {
  const [title, setTitle] = useState(initialQuiz?.title || initialQuiz?.fileName || '');
  const [subject, setSubject] = useState(initialQuiz?.subject || '');
  const [difficulty, setDifficulty] = useState<Quiz['difficulty']>(initialQuiz?.difficulty || 'Mixed');
  const [questions, setQuestions] = useState<Question[]>(initialQuiz?.questions || []);
  const [activeQuestionIndex, setActiveQuestionIndex] = useState<number>(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // If no questions exist, create an initial empty one
  useEffect(() => {
    if (questions.length === 0) {
      setQuestions([{
        questionText: '',
        options: ['', '', '', ''],
        correctIndex: 0,
        explanation: '',
        difficulty: 'Medium',
      }]);
    }
  }, [questions]);

  const activeQuestion = questions[activeQuestionIndex] || null;

  const handleUpdateActiveQuestion = (updates: Partial<Question>) => {
    setQuestions(prev => {
      const newQs = [...prev];
      newQs[activeQuestionIndex] = { ...newQs[activeQuestionIndex], ...updates };
      return newQs;
    });
  };

  const handleUpdateOption = (index: number, text: string) => {
    setQuestions(prev => {
      const newQs = [...prev];
      const newOptions = [...newQs[activeQuestionIndex].options];
      newOptions[index] = text;
      newQs[activeQuestionIndex].options = newOptions;
      return newQs;
    });
  };

  const handleAddQuestion = () => {
    setQuestions(prev => [...prev, {
      questionText: '',
      options: ['', '', '', ''],
      correctIndex: 0,
      explanation: '',
      difficulty: 'Medium',
    }]);
    setActiveQuestionIndex(questions.length);
  };

  const handleDuplicateQuestion = () => {
    if (!activeQuestion) return;
    setQuestions(prev => {
      const newQs = [...prev];
      newQs.splice(activeQuestionIndex + 1, 0, { ...activeQuestion, id: undefined });
      return newQs;
    });
    setActiveQuestionIndex(activeQuestionIndex + 1);
  };

  const handleDeleteQuestion = (index: number) => {
    setQuestions(prev => {
      const newQs = prev.filter((_, i) => i !== index);
      return newQs;
    });
    if (activeQuestionIndex >= index && activeQuestionIndex > 0) {
      setActiveQuestionIndex(activeQuestionIndex - 1);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) { // 1MB limit for Firestore sanity
      setErrorMsg('Image is too large. Please select an image under 1MB.');
      return;
    }
    setErrorMsg(null);

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      handleUpdateActiveQuestion({ imageAttachment: base64 });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = (isDraft: boolean) => {
    if (!title.trim()) {
      setErrorMsg('Please enter a quiz title before saving.');
      return;
    }
    setErrorMsg(null);

    onSave({
      title,
      subject,
      isManual: true,
      isDraft,
      fileName: title,
      numQuestions: questions.length,
      difficulty,
      questionType: 'Multiple Choice',
      questions,
    });
  };

  const handleExport = () => {
    const exportData = {
      title,
      subject,
      difficulty,
      isManual: true,
      questions
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/\s+/g, '_').toLowerCase() || 'quiz'}_backup.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900/50 rounded-3xl border border-slate-200/50 dark:border-white/5 overflow-hidden shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200/50 dark:border-white/5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onCancel} className="p-2 hover:bg-slate-200 dark:hover:bg-white/5 rounded-xl text-slate-500 transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-display">
            {initialQuiz ? 'Edit Quiz' : 'Manual Quiz Creator'}
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExport}
            className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors mr-2"
            title="Export for Backup"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={() => handleSave(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 bg-slate-200/50 hover:bg-slate-200 dark:text-slate-300 dark:bg-white/5 dark:hover:bg-white/10 transition-colors"
          >
            Save as Draft
          </button>
          <button
            onClick={() => handleSave(false)}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" />
            Publish Quiz
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-500/10 border-l-4 border-red-500 p-4 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3 text-red-600 dark:text-red-400">
            <AlertCircle className="w-5 h-5" />
            <p className="text-sm font-medium">{errorMsg}</p>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-500 hover:text-red-700">
            &times;
          </button>
        </div>
      )}

      {/* Main Content Split */}
      <div className="flex flex-1 overflow-hidden flex-col md:flex-row">
        {/* Left sidebar: Question List */}
        <div className="w-full md:w-64 border-r border-slate-200/50 dark:border-white/5 flex flex-col bg-white/30 dark:bg-[#0b0f19]/30 shrink-0 h-48 md:h-full">
          <div className="p-3 border-b border-slate-200/50 dark:border-white/5 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Questions ({questions.length})</span>
            <button onClick={handleAddQuestion} className="p-1 hover:bg-slate-200 dark:hover:bg-white/10 rounded-lg text-indigo-600 dark:text-indigo-400">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {questions.map((q, idx) => (
              <div
                key={idx}
                onClick={() => setActiveQuestionIndex(idx)}
                className={`flex items-center justify-between px-3 py-2 rounded-xl cursor-pointer transition-colors text-sm font-medium ${
                  activeQuestionIndex === idx
                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-white/5'
                }`}
              >
                <div className="truncate flex-1 pr-2">
                  <span className="opacity-60 mr-2">{idx + 1}.</span>
                  {q.questionText || 'New Question'}
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (questions.length > 1) {
                      handleDeleteQuestion(idx);
                    }
                  }}
                  className="p-1 hover:bg-slate-300/50 dark:hover:bg-white/10 rounded-md text-slate-400 hover:text-red-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Editor Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          <div className="max-w-2xl mx-auto space-y-8 pb-12">
            
            {/* Quiz Metadata (only show when question 1 is active to save space, or always show at top) */}
            <div className="space-y-4 bg-white/60 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-200/50 dark:border-white/5">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Quiz Details</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Title</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Midterm Review"
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Subject / Category</label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Science"
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">Difficulty</label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value as Quiz['difficulty'])}
                    className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  >
                    <option value="Mixed">Mixed</option>
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Active Question Editor */}
            {activeQuestion && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-display">
                    Question {activeQuestionIndex + 1}
                  </h3>
                  <div className="flex gap-2">
                    <button onClick={handleDuplicateQuestion} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-200/50 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 text-xs font-semibold text-slate-600 dark:text-slate-300">
                      <Copy className="w-3.5 h-3.5" /> Duplicate
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  {/* Question Text */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Question Text</label>
                    <textarea
                      value={activeQuestion.questionText}
                      onChange={(e) => handleUpdateActiveQuestion({ questionText: e.target.value })}
                      placeholder="What is the capital of France?"
                      className="w-full h-24 resize-none bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Image Attachment */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Image Attachment (Optional)</label>
                    {activeQuestion.imageAttachment ? (
                      <div className="relative inline-block border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden group">
                        <img src={activeQuestion.imageAttachment} alt="Question attachment" className="max-h-48 object-contain bg-slate-100 dark:bg-slate-900" />
                        <button
                          onClick={() => handleUpdateActiveQuestion({ imageAttachment: undefined })}
                          className="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 text-white rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <input
                          type="file"
                          accept="image/*"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          className="hidden"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium text-slate-600 dark:text-slate-300 transition-colors"
                        >
                          <ImageIcon className="w-4 h-4" /> Add Image
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Options */}
                  <div className="space-y-3 pt-2">
                    <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Answers (Select correct one)</label>
                    {[0, 1, 2, 3].map((idx) => (
                      <div key={idx} className={`flex items-center gap-3 p-2 rounded-xl border-2 transition-all ${
                        activeQuestion.correctIndex === idx 
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10' 
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}>
                        <button
                          onClick={() => handleUpdateActiveQuestion({ correctIndex: idx })}
                          className="p-1 flex-shrink-0"
                        >
                          {activeQuestion.correctIndex === idx ? (
                            <CheckCircle2 className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                          ) : (
                            <Circle className="w-6 h-6 text-slate-300 dark:text-slate-600 hover:text-indigo-400" />
                          )}
                        </button>
                        <input
                          type="text"
                          value={activeQuestion.options[idx] || ''}
                          onChange={(e) => handleUpdateOption(idx, e.target.value)}
                          placeholder={`Option ${String.fromCharCode(65 + idx)}`}
                          className="flex-1 bg-transparent text-sm text-slate-800 dark:text-slate-100 font-medium focus:outline-none"
                        />
                      </div>
                    ))}
                  </div>

                  {/* Explanation & Difficulty */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200/50 dark:border-white/5">
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Explanation (Optional)</label>
                      <textarea
                        value={activeQuestion.explanation || ''}
                        onChange={(e) => handleUpdateActiveQuestion({ explanation: e.target.value })}
                        placeholder="Why is this answer correct?"
                        className="w-full h-20 resize-none bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-xs text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Question Difficulty</label>
                      <select
                        value={activeQuestion.difficulty || 'Medium'}
                        onChange={(e) => handleUpdateActiveQuestion({ difficulty: e.target.value as Question['difficulty'] })}
                        className="w-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      >
                        <option value="Easy">Easy</option>
                        <option value="Medium">Medium</option>
                        <option value="Hard">Hard</option>
                      </select>
                    </div>
                  </div>

                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
