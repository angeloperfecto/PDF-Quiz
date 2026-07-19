import React, { useState, useRef } from 'react';
import { Upload, FileText, Settings, AlertCircle, Sparkles, Loader2, BookOpen } from 'lucide-react';
import { QuizConfig } from '../types';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface UploadZoneProps {
  onQuizGenerated: (quizData: {
    fileName: string;
    questions: any[];
    config: QuizConfig;
    extractedText: string;
  }) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

export default function UploadZone({ onQuizGenerated, isLoading, setIsLoading }: UploadZoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [dragActive, setDragActive] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Generation configurations
  const [numQuestions, setNumQuestions] = useState<number>(10);
  const [difficulty, setDifficulty] = useState<QuizConfig['difficulty']>('Medium');
  const [questionType, setQuestionType] = useState<QuizConfig['questionType']>('Mixed');
  const [useAllPages, setUseAllPages] = useState<boolean>(true);
  const [pageStart, setPageStart] = useState<number>(1);
  const [pageEnd, setPageEnd] = useState<number>(1);
  const [forceOCR, setForceOCR] = useState<boolean>(false);

  // Extraction Progress State
  const [progressStep, setProgressStep] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateAndSetFile = async (selectedFile: File) => {
    if (selectedFile.type !== 'application/pdf' && !selectedFile.name.endsWith('.pdf')) {
      setError('Please upload a valid PDF document.');
      return;
    }
    setError(null);
    setFile(selectedFile);
    setIsLoading(true);
    setProgressStep('Loading PDF document...');
    setProgressPercent(10);

    try {
      const arrayBuffer = await selectedFile.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      setTotalPages(pdf.numPages);
      setPageEnd(pdf.numPages);
      setProgressPercent(100);
    } catch (err: any) {
      console.error('Error reading PDF:', err);
      setError('Failed to parse PDF document. It might be password protected or corrupted.');
      setFile(null);
    } finally {
      setIsLoading(false);
      setProgressStep('');
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleGenerate = async () => {
    if (!pdfDoc || !file) return;

    setIsLoading(true);
    setError(null);

    const start = useAllPages ? 1 : Math.max(1, pageStart);
    const end = useAllPages ? totalPages : Math.min(totalPages, pageEnd);

    if (start > end) {
      setError('Start page cannot be greater than end page.');
      setIsLoading(false);
      return;
    }

    try {
      let combinedText = '';
      const totalPagesToProcess = end - start + 1;
      let ocrWorker: any = null;
      let pdfBase64: string | undefined = undefined;

      // Read PDF file as Base64 for improved Gemini analysis
      if (useAllPages && file.size <= 25 * 1024 * 1024) { // Only if using all pages and under 25MB
        try {
          setProgressStep('Encoding document for deep AI analysis...');
          pdfBase64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
        } catch (e) {
          console.warn('Failed to encode PDF to base64, falling back to text only', e);
        }
      }

      let attempt = 1;
      let currentForceOCR = forceOCR;
      let data: any = null;
      let finalCombinedText = '';

      while (attempt <= 2) {
        combinedText = '';
        
        for (let i = start; i <= end; i++) {
          const pageIndex = i - start;
          const percent = Math.round((pageIndex / totalPagesToProcess) * (attempt === 1 ? 50 : 80)); 
          setProgressPercent(percent);
          setProgressStep(attempt === 2 
            ? `Retry Attempt 2: Performing deep OCR scan on page ${i} of ${totalPages}...` 
            : `Extracting text from page ${i} of ${totalPages}...`);

          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          let pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

          // Automatic OCR detection: if text is very short, looks empty, or if Force OCR is enabled
          const alphanumericCount = (pageText.replace(/[^a-zA-Z0-9]/g, '')).length;
          const needsOCR = currentForceOCR || pageText.length < 150 || alphanumericCount < 80;

          if (needsOCR) {
            setProgressStep(attempt === 2 
              ? `Retry Attempt 2: Deep OCR on page ${i}...` 
              : `Scanned page or complex layout detected. Performing OCR on page ${i}...`);
            
            // Lazy initialize OCR worker to save resources
            if (!ocrWorker) {
              const { createWorker } = await import('tesseract.js');
              ocrWorker = await createWorker('eng');
            }

            // Render page to canvas to get image data
            const viewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            if (context) {
              await page.render({ canvasContext: context, viewport }).promise;
              const { data: { text } } = await ocrWorker.recognize(canvas);
              pageText = text.trim();
            }
          }

          combinedText += `\n--- PAGE ${i} ---\n${pageText}\n`;
        }

        if (combinedText.trim().length < 100) {
          throw new Error('Could not extract sufficient text from the PDF. The document might be fully encrypted, empty, or contain unreadable imagery.');
        }

        // Truncate to ~1000 pages of text to prevent API timeouts and "fetch failed" errors on massive documents
        const MAX_TEXT_LENGTH = 2000000;
        if (combinedText.length > MAX_TEXT_LENGTH) {
          combinedText = combinedText.substring(0, MAX_TEXT_LENGTH) + '\n\n...[DOCUMENT TRUNCATED DUE TO LENGTH LIMITS]...';
          console.warn('PDF text was truncated because it exceeded the maximum allowed length.');
        }
        
        finalCombinedText = combinedText;

        setProgressStep(`Analyzing content and generating questions with Gemini AI (Attempt ${attempt})...`);
        setProgressPercent(90);

        const config: any = {
          numQuestions,
          difficulty,
          questionType,
          pageRangeStart: start,
          pageRangeEnd: end,
          allPages: useAllPages,
        };

        let response;
        try {
          response = await fetch('/api/generate-quiz', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              text: combinedText,
              pdfBase64: attempt === 1 ? pdfBase64 : undefined,
              config,
            }),
          });
        } catch (fetchErr: any) {
          throw new Error('Network error: Could not connect to the server or the connection timed out. Please try again with a smaller document or fewer pages.');
        }

        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          data = await response.json();
        } else {
          const textResponse = await response.text();
          console.error('Non-JSON response received from server:', textResponse);
          if (!response.ok) {
            throw new Error(`The quiz generator server encountered an unexpected error (Status ${response.status}). Please try again in a moment.`);
          }
          throw new Error('Received an unexpected non-JSON response from the server.');
        }

        if (!response.ok) {
          throw new Error(data.error || 'Failed to generate quiz. Please try again.');
        }

        // Validation Step
        if (data.totalQuestionsInPDF > 0 && data.questions.length !== data.totalQuestionsInPDF) {
          if (attempt === 1 && !currentForceOCR) {
             console.log(`Validation failed (found ${data.totalQuestionsInPDF} but extracted ${data.questions.length}). Retrying with Force OCR...`);
             currentForceOCR = true;
             attempt++;
             continue; // Retry the while loop
          } else {
             throw new Error(`Extraction Issue Detected:\nThe system found ${data.totalQuestionsInPDF} questions in the PDF, but only successfully extracted ${data.questions.length}.\n\nAI Validation Message: ${data.validationMessage || 'Some questions were missed or skipped.'}`);
          }
        } else {
          if (data.validationMessage) {
            console.log("Extraction Validation:", data.validationMessage);
          }
          break;
        }
      }

      if (ocrWorker) {
        await ocrWorker.terminate();
      }

      setProgressPercent(100);

      onQuizGenerated({
        fileName: file.name,
        questions: data.questions,
        config: {
          numQuestions,
          difficulty,
          questionType,
          pageRangeStart: start,
          pageRangeEnd: end,
          allPages: useAllPages,
        },
        extractedText: finalCombinedText,
      });

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred during processing.');
    } finally {
      setIsLoading(false);
      setProgressStep('');
      setProgressPercent(0);
    }
  };;

  return (
    <div className="w-full max-w-4xl mx-auto" id="upload-zone-container">
      {!file ? (
        <div
          id="dropzone"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={triggerFileInput}
          className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 backdrop-blur-xl ${
            dragActive
              ? 'border-indigo-500 bg-indigo-500/15 dark:bg-indigo-950/35 shadow-lg shadow-indigo-500/10'
              : 'border-slate-200/60 dark:border-white/10 hover:border-indigo-400 bg-white/45 dark:bg-slate-900/35'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileChange}
            className="hidden"
            id="pdf-file-input"
          />
          <div className="p-5 rounded-full bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 mb-6 shadow-inner">
            <Upload className="w-10 h-10 animate-bounce" />
          </div>
          <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-2 font-display">
            Upload your PDF Study Document
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-300 text-center max-w-md leading-relaxed">
            Drag & drop your PDF file here, or <span className="text-indigo-600 dark:text-indigo-400 font-semibold">browse local files</span>.
          </p>
          <span className="text-xs text-slate-500 dark:text-slate-400 mt-4 bg-slate-100 dark:bg-slate-800/45 px-3 py-1 rounded-full border border-slate-300/50 dark:border-white/5">
            Supports scanned or digital PDFs up to 500 pages
          </span>
        </div>
      ) : (
        <div className="glass-card border border-slate-200/50 dark:border-white/10 rounded-3xl p-8 shadow-xl shadow-slate-100 dark:shadow-none transition-all duration-300">
          <div className="flex items-start justify-between border-b border-slate-200/30 dark:border-white/5 pb-6 mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-red-500/10 dark:bg-red-950/30 text-red-500 dark:text-red-400 rounded-2xl">
                <FileText className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 max-w-md truncate font-display">
                  {file.name}
                </h4>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-600 dark:text-slate-300">
                  <span>{(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                  <span className="w-1 h-1 rounded-full bg-slate-400 dark:bg-slate-700" />
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3 h-3" /> {totalPages} pages
                  </span>
                </div>
              </div>
            </div>
            {!isLoading && (
              <button
                id="change-file-btn"
                onClick={() => {
                  setFile(null);
                  setPdfDoc(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100/60 dark:bg-slate-800/40 px-3 py-1.5 rounded-lg border border-slate-200/30 dark:border-white/5 transition-colors"
              >
                Choose another file
              </button>
            )}
          </div>

          {isLoading ? (
            <div className="py-8 flex flex-col items-center justify-center" id="processing-loader">
              <Loader2 className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-spin mb-4" />
              <p className="text-base font-semibold text-slate-800 dark:text-slate-100 animate-pulse text-center">
                {progressStep}
              </p>
              <div className="w-full max-w-md bg-slate-200/50 dark:bg-slate-800/50 rounded-full h-2.5 mt-6 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 h-full rounded-full transition-all duration-300 shadow-[0_0_12px_rgba(99,102,241,0.5)]"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-slate-600 dark:text-slate-400 mt-2">
                {progressPercent}% Complete
              </span>
            </div>
          ) : (
            <div className="space-y-8" id="quiz-generation-config">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Number of Questions & Difficulty */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-2">
                      <Settings className="w-4 h-4 text-slate-500 dark:text-slate-400" /> Number of Questions
                    </label>
                    <div className="flex gap-2 sm:gap-3 flex-wrap">
                      {[5, 10, 15, 20, -1].map((num) => (
                        <button
                          key={num}
                          id={`num-btn-${num}`}
                          onClick={() => setNumQuestions(num)}
                          className={`flex-1 min-w-[50px] py-3 px-2 sm:px-4 rounded-xl font-medium border text-sm transition-all duration-200 ${
                            numQuestions === num
                              ? 'border-indigo-500/65 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 dark:border-indigo-550/45 dark:bg-indigo-500/15 font-bold shadow-[0_0_15px_rgba(99,102,241,0.08)]'
                              : 'border-slate-300/60 dark:border-white/5 bg-white/30 dark:bg-white/5 hover:border-slate-400 dark:hover:border-white/10 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {num === -1 ? 'All' : num}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                      Difficulty Level
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {(['Easy', 'Medium', 'Hard', 'Mixed'] as const).map((level) => (
                        <button
                          key={level}
                          id={`diff-btn-${level}`}
                          onClick={() => setDifficulty(level)}
                          className={`py-3 px-2 rounded-xl font-medium border text-xs text-center transition-all duration-200 ${
                            difficulty === level
                              ? 'border-indigo-500/65 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 dark:border-indigo-550/45 dark:bg-indigo-500/15 font-bold shadow-[0_0_15px_rgba(99,102,241,0.08)]'
                              : 'border-slate-300/60 dark:border-white/5 bg-white/30 dark:bg-white/5 hover:border-slate-400 dark:hover:border-white/10 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {level}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Question Type & Range */}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                      Question Type
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Multiple Choice', 'True/False', 'Definition', 'Identification', 'Mixed'] as const).map((type) => (
                        <button
                          key={type}
                          id={`type-btn-${type}`}
                          onClick={() => setQuestionType(type)}
                          className={`py-2.5 px-1 rounded-xl font-medium border text-[11px] text-center transition-all duration-200 ${
                            questionType === type
                              ? 'border-indigo-500/65 bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 dark:border-indigo-550/45 dark:bg-indigo-500/15 font-bold shadow-[0_0_15px_rgba(99,102,241,0.08)]'
                              : 'border-slate-300/60 dark:border-white/5 bg-white/30 dark:bg-white/5 hover:border-slate-400 dark:hover:border-white/10 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {type}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                      Extract Questions From
                    </label>
                    <div className="space-y-3">
                      <div className="flex gap-4">
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-200">
                          <input
                            type="radio"
                            checked={useAllPages}
                            onChange={() => setUseAllPages(true)}
                            className="text-indigo-600 border-slate-300 focus:ring-indigo-500 dark:border-white/10"
                          />
                          Entire Document
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-200">
                          <input
                            type="radio"
                            checked={!useAllPages}
                            onChange={() => setUseAllPages(false)}
                            className="text-indigo-600 border-slate-300 focus:ring-indigo-500 dark:border-white/10"
                          />
                          Page Range
                        </label>
                      </div>

                      {!useAllPages && (
                        <div className="flex items-center gap-3 bg-white/20 dark:bg-white/5 p-3 rounded-xl border border-slate-300/40 dark:border-white/5">
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="text-xs text-slate-600 dark:text-slate-400">From</span>
                            <input
                              type="number"
                              min={1}
                              max={totalPages}
                              value={pageStart}
                              onChange={(e) => setPageStart(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-full bg-white/60 dark:bg-[#0f172a]/40 border border-slate-300/60 dark:border-white/5 rounded-lg px-2 py-1 text-sm text-center font-medium focus:ring-2 focus:ring-indigo-500/50 outline-none"
                            />
                          </div>
                          <span className="text-slate-500 dark:text-slate-400 text-xs">to</span>
                          <div className="flex items-center gap-1.5 flex-1">
                            <span className="text-xs text-slate-600 dark:text-slate-400">To</span>
                            <input
                              type="number"
                              min={1}
                              max={totalPages}
                              value={pageEnd}
                              onChange={(e) => setPageEnd(Math.min(totalPages, parseInt(e.target.value) || totalPages))}
                              className="w-full bg-white/60 dark:bg-[#0f172a]/40 border border-slate-300/60 dark:border-white/5 rounded-lg px-2 py-1 text-sm text-center font-medium focus:ring-2 focus:ring-indigo-500/50 outline-none"
                            />
                          </div>
                        </div>
                      )}
                      
                      {/* Force OCR option */}
                      <div className="pt-2 border-t border-slate-200/20 dark:border-white/5">
                        <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={forceOCR}
                            onChange={(e) => setForceOCR(e.target.checked)}
                            className="mt-0.5 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 dark:border-white/10"
                          />
                          <div>
                            <span className="font-semibold block">Force OCR (Deep Scan)</span>
                            <span className="text-slate-500 dark:text-slate-400 block mt-0.5 leading-relaxed">
                              Enable for scanned documents or image-only worksheets to ensure all pre-existing questions are perfectly scanned.
                            </span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2.5 p-4 bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl text-sm border border-red-500/20 backdrop-blur-md">
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                  <p>{error}</p>
                </div>
              )}

              <button
                id="generate-quiz-btn"
                onClick={handleGenerate}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-semibold flex items-center justify-center gap-2.5 shadow-[0_4px_20px_rgba(99,102,241,0.3)] transition-all duration-300 active:scale-[0.98] font-display text-sm tracking-wide"
              >
                <Sparkles className="w-5 h-5" />
                Generate AI Quiz
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
