import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config();

// Ensure Node.js resolves IPv4 addresses first to avoid container fetch errors (TypeError: fetch failed on IPv6)
dns.setDefaultResultOrder('ipv4first');

// Ensure Gemini API key is configured
const apiKey = process.env.GEMINI_API_KEY;
let ai: GoogleGenAI | null = null;
if (apiKey) {
  ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });
}

// Helper to pause execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Extract clean error message, code, and status from any Gemini API error
const getErrorDetails = (err: any) => {
  let message = String(err?.message || err || "");
  let code = Number(err?.code) || 0;
  let status = String(err?.status || "");

  // If the message is a JSON-like string, try to parse it
  if (message.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(message);
      if (parsed?.error) {
        if (parsed.error.code) code = Number(parsed.error.code);
        if (parsed.error.status) status = String(parsed.error.status);
        if (parsed.error.message) message = String(parsed.error.message);
      }
    } catch (e) {
      // ignore parsing failure
    }
  } else if (err?.error && typeof err.error === 'object') {
    if (err.error.code) code = Number(err.error.code);
    if (err.error.status) status = String(err.error.status);
    if (err.error.message) message = String(err.error.message);
  }

  return { message, code, status };
};

// Helper to identify transient errors that should be retried or cause a fallback
const isTransientError = (err: any): boolean => {
  const { message, code, status } = getErrorDetails(err);
  const errMsg = message.toLowerCase();
  return (
    code === 503 ||
    code === 429 ||
    status === "UNAVAILABLE" ||
    status === "RESOURCE_EXHAUSTED" ||
    errMsg.includes("503") ||
    errMsg.includes("429") ||
    errMsg.includes("demand") ||
    errMsg.includes("busy") ||
    errMsg.includes("limit") ||
    errMsg.includes("unavailable") ||
    errMsg.includes("fetch failed") ||
    errMsg.includes("network") ||
    errMsg.includes("timeout") ||
    errMsg.includes("econnrefused")
  );
};

// Helper to identify 503 / UNAVAILABLE / high demand errors that should bypass retries on the same model and fall back to other models immediately
const isHighDemandError = (err: any): boolean => {
  const { message, code, status } = getErrorDetails(err);
  const errMsg = message.toLowerCase();
  return (
    code === 503 ||
    status === "UNAVAILABLE" ||
    errMsg.includes("503") ||
    errMsg.includes("demand") ||
    errMsg.includes("busy") ||
    errMsg.includes("unavailable")
  );
};

// Robust recovery JSON parser to handle slightly malformed or truncated responses when too many questions are returned
function parseQuizQuestions(rawJsonStr: string): { questions: any[], totalQuestionsInPDF?: number, validationMessage?: string } {
  // Try to find a JSON object block
  let jsonStr = rawJsonStr.trim();
  const match = jsonStr.match(/\{[\s\S]*\}/);
  if (match) {
    jsonStr = match[0];
  } else {
    // Strip markdown code blocks if present just in case
    jsonStr = rawJsonStr.replace(/```(json)?|```/g, '').trim();
  }

  // First, try standard JSON.parse
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.questions)) {
      return {
        questions: parsed.questions,
        totalQuestionsInPDF: parsed.totalQuestionsInPDF,
        validationMessage: parsed.validationMessage
      };
    } else if (Array.isArray(parsed)) {
       // fallback if model still returned array
       return { questions: parsed };
    }
  } catch (e) {
    // Standard JSON parsing failed, attempt robust block recovery silently
  }

  // If we couldn't parse the root object, fallback to extracting the questions array manually
  const arrayMatch = jsonStr.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (arrayMatch) {
     try {
       const parsedArray = JSON.parse(arrayMatch[0]);
       if (Array.isArray(parsedArray)) {
         return { questions: parsedArray };
       }
     } catch(e) {}
  }

  const questions: any[] = [];
  let braceCount = 0;
  let inString = false;
  let escapeNext = false;
  let objectStartIdx = -1;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escapeNext) {
      escapeNext = false;
      continue;
    }

    if (char === '\\') {
      escapeNext = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === '{') {
        if (braceCount === 0) {
          objectStartIdx = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && objectStartIdx !== -1) {
          const objStr = jsonStr.substring(objectStartIdx, i + 1);
          try {
            const obj = JSON.parse(objStr);
            if (obj && typeof obj === 'object' && obj.questionText) {
              questions.push(obj);
            }
          } catch (err) {
            // Ignore parse errors of incomplete blocks
          }
          objectStartIdx = -1;
        }
      }
    }
  }

  // If no questions parsed but text contains any question-like blocks, try custom regex fallback
  if (questions.length === 0) {
    const regex = /\{\s*"questionText"[\s\S]*?\}/g;
    let match;
    while ((match = regex.exec(jsonStr)) !== null) {
      try {
        let cand = match[0].trim();
        if (!cand.endsWith('}')) {
          cand += '}';
        }
        const obj = JSON.parse(cand);
        if (obj && obj.questionText) {
          questions.push(obj);
        }
      } catch (err) {
        // Ignore
      }
    }
  }

  return { questions };
}

// Robust generator function with model pool and backoff retry logic
async function generateQuizWithFallback(
  aiClient: GoogleGenAI,
  userPrompt: any,
  systemInstruction: string
) {
  const models = ['gemini-3.1-pro-preview', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
  let lastError: any = null;

  for (const model of models) {
    // Only 1 attempt per model to prevent hitting the Cloud Run 60s/120s ingress timeout
    // which causes the browser to throw "Failed to fetch" if the request takes too long.
    for (let attempt = 1; attempt <= 1; attempt++) {
      try {
        console.log(`Generating quiz content using model ${model}...`);
        const response = await aiClient.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction,
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'OBJECT',
              properties: {
                totalQuestionsInPDF: { type: 'INTEGER', description: 'The exact count of pre-existing questions found in the document. Set to 0 if generating new questions.' },
                validationMessage: { type: 'STRING', description: 'A brief message detailing if all questions were successfully extracted or if any were missed.' },
                questions: {
                  type: 'ARRAY',
                  items: {
                    type: 'OBJECT',
                    properties: {
                      questionText: { type: 'STRING' },
                      options: {
                        type: 'ARRAY',
                        items: { type: 'STRING' }
                      },
                      correctAnswerText: { type: 'STRING', description: 'The exact text of the correct option. This must exactly match one of the items in the options array.' },
                      correctIndex: { type: 'INTEGER', description: 'The 0-based index (0, 1, 2, or 3) in the options array that matches the correctAnswerText.' },
                      explanation: { type: 'STRING' },
                      sourceExcerpt: { type: 'STRING' },
                      pageNumber: { type: 'INTEGER' }
                    },
                    required: ['questionText', 'options', 'correctAnswerText', 'correctIndex', 'explanation', 'sourceExcerpt']
                  }
                }
              },
              required: ['totalQuestionsInPDF', 'validationMessage', 'questions']
            }
          }
        });

        if (response && response.text) {
          console.log(`Success generating quiz using model ${model}!`);
          return response;
        }
        throw new Error('Received empty response from Gemini API.');
      } catch (error: any) {
        lastError = error;

        if (isHighDemandError(error)) {
          console.log(`Model ${model} is experiencing high demand. Skipping to the next model...`);
          break; // Exit the attempt loop for this model and move to the next model
        }

        if (isTransientError(error)) {
          if (attempt < 2) {
            const backoffTime = attempt * 1500;
            console.log(`Temporary issue with model ${model}. Retrying in ${backoffTime}ms...`);
            await delay(backoffTime);
          } else {
            console.log(`Model ${model} exhausted maximum attempts. Moving to next model...`);
          }
        } else {
          console.log(`Model ${model} encountered an issue. Moving to next model...`);
          break;
        }
      }
    }
  }

  throw lastError || new Error('All models in fallback pool failed to generate a response.');
}

const app = express();
const PORT = 3000;

// Increase body limit for large PDF text uploads
app.use(express.json({ limit: '50mb' }));

// API endpoint to check configuration and health
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    hasApiKey: !!apiKey,
  });
});

// API endpoint to generate quiz using Gemini API
app.post('/api/generate-quiz', async (req, res) => {
  try {
    if (!ai) {
      return res.status(500).json({
        error: 'Gemini API key is not configured on the server. Please check your AI Studio secrets settings.',
      });
    }

    const { text, config, pdfBase64 } = req.body;

    if (!pdfBase64 && (!text || typeof text !== 'string' || text.trim().length === 0)) {
      return res.status(400).json({ error: 'Extracted PDF text or PDF file is required and cannot be empty.' });
    }

    const rawNumQuestions = config?.numQuestions !== undefined ? config.numQuestions : 10;
    const isAll = rawNumQuestions === -1 || rawNumQuestions === 'all' || rawNumQuestions === 'All';
    const numQuestionsVal = isAll ? 50 : (Number(rawNumQuestions) || 10);
    const numQuestionsStr = isAll ? 'all possible (as many as can be cleanly generated, up to 50)' : `${numQuestionsVal}`;

    const difficulty = config?.difficulty || 'Medium';
    const questionType = config?.questionType || 'Mixed';

    const systemInstruction = `You are an expert, document-grounded multiple-choice quiz scanner, extractor, and generator.
Your absolute, highest-priority goal is to scan the provided PDF, identify ALL pre-existing questions, and faithfully extract every single one of them onto the website without any omissions, alterations, or summaries.

CRITICAL MANDATES FOR PRE-EXISTING QUESTIONS IN THE PDF:
1. 100% COMPLETE COVERAGE (NO OMISSIONS): You MUST scan and extract EVERY SINGLE pre-existing question found in the PDF. No questions should be skipped, omitted, summarized, or condensed. Do not stop early. If the document has hundreds of questions, you must extract every single one. You must seamlessly bridge multi-page and multi-line questions.
2. FAITHFUL REPRODUCTION: Reproduce the complete set of questions exactly as they appear in the original document. Preserve original numbering (e.g., "Question 1", "1. ", "10."), formatting, ordering, and exact verbatim wording. You must accurately capture tables, mathematical expressions, symbols, and special characters. Ensure no question is skipped because of page breaks, inconsistent spacing, headers, footers, or formatting differences.
3. PRESERVE ALL OPTIONS:
   - Extract all answer choices exactly as they appear in the PDF (e.g., A, B, C, D, E) including multi-line answer choices.
   - If the original question has fewer or more than 4 options, map it faithfully into a 4-option structure (A, B, C, D) without losing the original meaning. The correct answer must be one of the options.
4. RECOVERY OF ANSWERS: Correctly identify the "correctIndex" (0 to 3) by matching the correct answer against any answer key provided, or by logical analysis.
5. COMPLETE INTEGRATION: Completely ignore any user-specified question count limit if pre-existing questions are present. Your priority is to extract ALL of them to ensure the user gets exactly what is in the PDF.
6. NEW GENERATION FALLBACK: Only if there are absolutely NO pre-existing questions in the PDF, generate new multiple-choice questions from the informational content up to ${numQuestionsStr}.

Rules:
1. Strict Accuracy: Every question, option, correct index, and explanation must be 100% backed by the provided text or document.
2. Technical Preservation: Keep all exact numerical values, formulas, dates, names, standard identifiers, units, and symbols perfectly intact.
3. Structured JSON Schema: Return a valid JSON object with the following properties:
   - "totalQuestionsInPDF": integer (The EXACT count of pre-existing questions found in the document, or 0 if generating new questions. YOU MUST ACCURATELY COUNT THEM FIRST).
   - "validationMessage": string (A detailed message confirming extraction success or indicating which pages/questions failed or are unclear).
   - "questions": array of objects where each element contains:
     - "questionText": string (the exact original question text and numbering).
     - "options": array of exactly 4 strings.
     - "correctAnswerText": string (the exact string text of the correct option).
     - "correctIndex": integer (0, 1, 2, or 3) representing the index of the correctAnswerText in the options array.
     - "explanation": string (extremely concise, max 15 words).
     - "sourceExcerpt": string (extremely short verbatim text snippet, max 15 words).
     - "pageNumber": integer (approximate page number).
4. No custom formatting outside the JSON object. Do NOT use markdown code blocks. Just return the raw JSON object.`;

    const promptInstructions = `Your absolute, most critical directive is to scan the provided source material for any pre-existing questions, worksheets, quizzes, or exams.
If pre-existing questions are found, you MUST extract ALL of them, preserving their exact wording, original numbering, ordering, options, and meaning with 100% complete coverage and zero omissions. Converting them to standard 4-option multiple choice structure where necessary. Completely ignore the count limit of ${numQuestionsStr} and extract all pre-existing questions found. DO NOT SUMMARIZE. DO NOT SKIP QUESTIONS.

If there are NO pre-existing questions in the text, then generate up to ${numQuestionsStr} brand new high-quality multiple-choice questions of difficulty "${difficulty}" and type "${questionType}" based on the informational content.

Before generating the final JSON array, you MUST count exactly how many questions are physically present in the document. The length of your "questions" array MUST exactly match this count. If there is any discrepancy, you have failed your directive.

Adhere strictly to the system instruction. Generate a valid JSON object matching the schema.`;

    let parsedData: any = null;
    let quizQuestions: any[] = [];
    let success = false;
    let finalResponseText = '';

    const strategies = [];
    if (pdfBase64) {
      strategies.push({
        type: 'pdf',
        prompt: [
          { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
          promptInstructions
        ]
      });
    }
    if (text && text.trim().length > 0) {
      strategies.push({
        type: 'text',
        prompt: `${promptInstructions}\n\n--- BEGIN SOURCE TEXT ---\n${text}\n--- END SOURCE TEXT ---`
      });
    }

    for (let i = 0; i < strategies.length; i++) {
      const strategy = strategies[i];
      console.log(`Trying extraction strategy: ${strategy.type}`);
      try {
        const response = await generateQuizWithFallback(ai, strategy.prompt, systemInstruction);
        const responseText = response.text;
        
        if (!responseText) continue;
        
        finalResponseText = responseText;
        const currentParsedData = parseQuizQuestions(responseText);
        const currentQuestions = currentParsedData.questions;
        
        if (currentQuestions && currentQuestions.length > 0) {
          const totalInPdf = currentParsedData.totalQuestionsInPDF || 0;
          if (totalInPdf > 0 && currentQuestions.length !== totalInPdf) {
             console.log(`Validation failed for strategy ${strategy.type}: Found ${totalInPdf} questions but extracted ${currentQuestions.length}. Retrying if possible.`);
             // Keep the best attempt so far
             if (!parsedData || currentQuestions.length > quizQuestions.length) {
               parsedData = currentParsedData;
               quizQuestions = currentQuestions;
             }
             continue; // try next strategy
          } else {
             // Validation passed!
             success = true;
             parsedData = currentParsedData;
             quizQuestions = currentQuestions;
             break;
          }
        }
      } catch (err) {
        console.error(`Strategy ${strategy.type} failed:`, err);
      }
    }

    if (!parsedData || quizQuestions.length === 0) {
      return res.status(500).json({ error: 'No valid questions could be parsed from the response after all extraction strategies failed.' });
    }

    try {
      // Fix correctIndex if correctAnswerText is provided and matches an option but correctIndex is wrong
      quizQuestions.forEach(q => {
        if (q.correctAnswerText && Array.isArray(q.options)) {
          const actualIndex = q.options.findIndex((opt: string) => 
            String(opt).trim().toLowerCase() === String(q.correctAnswerText).trim().toLowerCase()
          );
          if (actualIndex !== -1 && actualIndex !== q.correctIndex) {
            console.log(`Fixing correctIndex for question: "${q.questionText}". Provided index: ${q.correctIndex}, Actual index: ${actualIndex}`);
            q.correctIndex = actualIndex;
          }
        }
      });

      res.json(parsedData);
    } catch (parseErr) {
      console.error('Error post-processing JSON from Gemini response:', finalResponseText, parseErr);
      res.status(500).json({
        error: 'Failed to parse structured JSON from Gemini response.',
        rawResponse: finalResponseText,
      });
    }

  } catch (error: any) {
    console.error('Error generating quiz:', error);
    const { message, code, status } = getErrorDetails(error);
    const friendlyError = code === 503 || status === 'UNAVAILABLE' || message.toLowerCase().includes('unavailable') || message.toLowerCase().includes('503')
      ? 'All available Gemini models are currently experiencing extremely high demand. Please try again in a few moments.'
      : message.toLowerCase().includes('fetch failed')
      ? 'The connection to the AI service was interrupted or timed out. Please try generating the quiz again.'
      : message || 'An error occurred during quiz generation.';
    res.status(500).json({ error: friendlyError });
  }
});

// Vite middleware or static serving
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
