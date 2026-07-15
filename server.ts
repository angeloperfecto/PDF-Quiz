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
function parseQuizQuestions(jsonStr: string): any[] {
  // First, try standard JSON.parse
  try {
    const trimmed = jsonStr.trim();
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.log("Standard JSON parsing failed, attempting robust block recovery...", e);
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

  return questions;
}

// Robust generator function with model pool and backoff retry logic
async function generateQuizWithFallback(
  aiClient: GoogleGenAI,
  userPrompt: string,
  systemInstruction: string
) {
  const models = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest', 'gemini-3.1-pro-preview'];
  let lastError: any = null;

  for (const model of models) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`Generating quiz content using model ${model} (attempt ${attempt}/2)...`);
        const response = await aiClient.models.generateContent({
          model,
          contents: userPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'ARRAY',
              items: {
                type: 'OBJECT',
                properties: {
                  questionText: { type: 'STRING' },
                  options: {
                    type: 'ARRAY',
                    items: { type: 'STRING' }
                  },
                  correctIndex: { type: 'INTEGER' },
                  explanation: { type: 'STRING' },
                  sourceExcerpt: { type: 'STRING' },
                  pageNumber: { type: 'INTEGER' }
                },
                required: ['questionText', 'options', 'correctIndex', 'explanation', 'sourceExcerpt']
              }
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
        console.log(`Attempt ${attempt} on model ${model} failed. Error:`, error?.message || error);

        if (isHighDemandError(error)) {
          console.log(`High demand or Unavailable status detected on model ${model}. Skipping retries and falling back to the next model immediately...`);
          break; // Exit the attempt loop for this model and move to the next model
        }

        if (isTransientError(error)) {
          if (attempt < 2) {
            const backoffTime = attempt * 1500;
            console.log(`Transient error detected (429/RESOURCE_EXHAUSTED). Retrying model ${model} in ${backoffTime}ms...`);
            await delay(backoffTime);
          } else {
            console.log(`Model ${model} exhausted maximum attempts. Moving to next model...`);
          }
        } else {
          console.log(`Non-transient error on model ${model}. Moving to next model...`);
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
app.use(express.json({ limit: '15mb' }));

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

    const { text, config } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ error: 'Extracted PDF text is required and cannot be empty.' });
    }

    const rawNumQuestions = config?.numQuestions !== undefined ? config.numQuestions : 10;
    const isAll = rawNumQuestions === -1 || rawNumQuestions === 'all' || rawNumQuestions === 'All';
    const numQuestionsVal = isAll ? 50 : (Number(rawNumQuestions) || 10);
    const numQuestionsStr = isAll ? 'all possible (as many as can be cleanly generated, up to 50)' : `${numQuestionsVal}`;

    const difficulty = config?.difficulty || 'Medium';
    const questionType = config?.questionType || 'Mixed';

    const systemInstruction = `You are an expert, document-grounded multiple-choice quiz scanner, extractor, and generator.
Your absolute, highest-priority goal is to scan the provided PDF text, identify ALL pre-existing questions, and faithfully extract every single one of them onto the website without any omissions, alterations, or summaries.

CRITICAL MANDATES FOR PRE-EXISTING QUESTIONS IN THE PDF:
1. 100% COMPLETE COVERAGE: You MUST scan and extract EVERY SINGLE pre-existing question found in the PDF. No questions should be skipped, omitted, summarized, or condensed. The extraction process must achieve 100% coverage.
2. FAITHFUL REPRODUCTION: Reproduce the complete set of questions exactly as they appear in the original document. Preserve original numbering (e.g., "Question 1", "1. ", "10."), formatting, ordering, and exact verbatim wording of the question texts. Do NOT paraphrase, summarize, or alter their meaning or structure.
3. MULTIPLE-CHOICE OPTIONS PRESERVATION: 
   - If the original question has multiple-choice options in the PDF text, extract those options EXACTLY as they are and in their exact original order.
   - If the original question has fewer than 4 options or is a true/false, fill-in-the-blank, or open-ended question, you must map it into a 4-option structure (A, B, C, D) where the correct answer is faithfully represented as one of the options, and the others are plausible, realistic distractors directly derived from the document context.
   - Ensure "options" is always a valid JSON array of exactly 4 choices (A, B, C, D).
4. RECOVERY OF ANSWERS: Correctly identify the "correctIndex" (0 to 3) by matching the correct answer against any answer key provided in the document or by logical analysis of the context.
5. COMPLETE INTEGRATION: Completely ignore any user-specified question count limit if pre-existing questions are present. Your priority is to extract ALL of them (up to 50 questions) to ensure the user can answer the exact full original worksheet/exam on the website.
6. NEW GENERATION FALLBACK: Only if there are absolutely NO pre-existing questions in the PDF, you should generate brand new high-quality multiple-choice questions from the informational content of the document up to the limit of ${numQuestionsStr}.

Rules:
1. Strict Accuracy: Do not hallucinate or guess. Every question, option, correct index, and explanation must be 100% backed by the provided text.
2. Technical Preservation: Keep all exact numerical values, formulas, dates, names, standard identifiers, and units perfectly intact.
3. Structured JSON Schema: Return a valid JSON array where each element contains:
   - "questionText": string (the exact original question text and numbering).
   - "options": array of exactly 4 strings.
   - "correctIndex": integer (0, 1, 2, or 3).
   - "explanation": string (concise explanation).
   - "sourceExcerpt": string (exact verbatim quote or excerpt from the PDF).
   - "pageNumber": integer (approximate page number or best estimate).
4. No custom formatting outside the JSON array of objects.`;

    const userPrompt = `Your absolute, most critical directive is to scan the provided source text for any pre-existing questions, worksheets, quizzes, or exams.
If pre-existing questions are found, you MUST extract ALL of them, preserving their exact wording, original numbering, ordering, options, and meaning with 100% complete coverage and zero omissions. Converting them to standard 4-option multiple choice structure where necessary. Completely ignore the count limit of ${numQuestionsStr} and extract all pre-existing questions found.

If there are NO pre-existing questions in the text, then generate up to ${numQuestionsStr} brand new high-quality multiple-choice questions of difficulty "${difficulty}" and type "${questionType}" based on the informational content.

--- BEGIN SOURCE TEXT ---
${text}
--- END SOURCE TEXT ---

Adhere strictly to the system instruction. Generate a valid JSON array of questions matching the schema.`;

    const response = await generateQuizWithFallback(ai, userPrompt, systemInstruction);

    const responseText = response.text;
    if (!responseText) {
      return res.status(500).json({ error: 'Empty response returned from Gemini AI.' });
    }

    try {
      const quizQuestions = parseQuizQuestions(responseText);
      if (!quizQuestions || quizQuestions.length === 0) {
        throw new Error('No valid questions could be parsed from the response.');
      }
      res.json({ questions: quizQuestions });
    } catch (parseErr) {
      console.error('Error parsing JSON from Gemini response:', responseText, parseErr);
      res.status(500).json({
        error: 'Failed to parse structured JSON from Gemini response.',
        rawResponse: responseText,
      });
    }

  } catch (error: any) {
    console.error('Error generating quiz:', error);
    const { message, code, status } = getErrorDetails(error);
    const friendlyError = code === 503 || status === 'UNAVAILABLE' || message.toLowerCase().includes('unavailable') || message.toLowerCase().includes('503')
      ? 'All available Gemini models are currently experiencing extremely high demand. Please try again in a few moments.'
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
