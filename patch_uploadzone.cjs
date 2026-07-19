const fs = require('fs');
const file = 'src/components/UploadZone.tsx';
let code = fs.readFileSync(file, 'utf8');

const startStr = "const handleGenerate = async () => {";
const startIndex = code.indexOf(startStr);
if (startIndex === -1) {
  console.error("Could not find handleGenerate start");
  process.exit(1);
}

// Find the matching closing brace for handleGenerate
let openBraces = 0;
let endIndex = -1;
for (let i = startIndex + startStr.length; i < code.length; i++) {
  if (code[i] === '{') openBraces++;
  if (code[i] === '}') {
    if (openBraces === 0) {
      endIndex = i;
      break;
    }
    openBraces--;
  }
}

if (endIndex === -1) {
  console.error("Could not find handleGenerate end");
  process.exit(1);
}

const newHandleGenerate = `const handleGenerate = async () => {
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
            ? \`Retry Attempt 2: Performing deep OCR scan on page \${i} of \${totalPages}...\` 
            : \`Extracting text from page \${i} of \${totalPages}...\`);

          const page = await pdfDoc.getPage(i);
          const textContent = await page.getTextContent();
          let pageText = textContent.items
            .map((item: any) => item.str)
            .join(' ')
            .replace(/\\s+/g, ' ')
            .trim();

          // Automatic OCR detection: if text is very short, looks empty, or if Force OCR is enabled
          const alphanumericCount = (pageText.replace(/[^a-zA-Z0-9]/g, '')).length;
          const needsOCR = currentForceOCR || pageText.length < 150 || alphanumericCount < 80;

          if (needsOCR) {
            setProgressStep(attempt === 2 
              ? \`Retry Attempt 2: Deep OCR on page \${i}...\` 
              : \`Scanned page or complex layout detected. Performing OCR on page \${i}...\`);
            
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

          combinedText += \`\\n--- PAGE \${i} ---\\n\${pageText}\\n\`;
        }

        if (combinedText.trim().length < 100) {
          throw new Error('Could not extract sufficient text from the PDF. The document might be fully encrypted, empty, or contain unreadable imagery.');
        }

        // Truncate to ~100 pages of text to prevent API timeouts and "fetch failed" errors on massive documents
        const MAX_TEXT_LENGTH = 200000;
        if (combinedText.length > MAX_TEXT_LENGTH) {
          combinedText = combinedText.substring(0, MAX_TEXT_LENGTH) + '\\n\\n...[DOCUMENT TRUNCATED DUE TO LENGTH LIMITS]...';
          console.warn('PDF text was truncated because it exceeded the maximum allowed length.');
        }
        
        finalCombinedText = combinedText;

        setProgressStep(\`Analyzing content and generating questions with Gemini AI (Attempt \${attempt})...\`);
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
            throw new Error(\`The quiz generator server encountered an unexpected error (Status \${response.status}). Please try again in a moment.\`);
          }
          throw new Error('Received an unexpected non-JSON response from the server.');
        }

        if (!response.ok) {
          throw new Error(data.error || 'Failed to generate quiz. Please try again.');
        }

        // Validation Step
        if (data.totalQuestionsInPDF > 0 && data.questions.length !== data.totalQuestionsInPDF) {
          if (attempt === 1 && !currentForceOCR) {
             console.log(\`Validation failed (found \${data.totalQuestionsInPDF} but extracted \${data.questions.length}). Retrying with Force OCR...\`);
             currentForceOCR = true;
             attempt++;
             continue; // Retry the while loop
          } else {
             alert(\`Extraction Issue Detected:\\nThe system found \${data.totalQuestionsInPDF} questions in the PDF, but only successfully extracted \${data.questions.length}.\\n\\nAI Validation Message: \${data.validationMessage || 'Some questions were missed or skipped.'}\`);
             break;
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
    }`;

code = code.substring(0, startIndex) + newHandleGenerate + code.substring(endIndex + 1);
fs.writeFileSync(file, code);
console.log("Patch applied successfully");
