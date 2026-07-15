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
    console.warn("Standard JSON parsing failed, attempting robust block recovery...", e);
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
        console.warn(`Attempt ${attempt} on model ${model} failed. Error:`, error?.message || error);

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

    const systemInstruction = `You are a professional, document-grounded multiple-choice quiz generator.
Your goal is to generate high-quality, highly accurate multiple-choice questions based ONLY on the provided PDF text.

CRITICAL RULE FOR PRE-EXISTING QUESTIONS IN THE PDF:
If the provided PDF text already contains pre-existing questions (such as exam questions, practice tests, quiz questions, worksheets, homework questions, or review questionnaires), your absolute highest priority is to SCAN, EXTRACT, and PRESERVE every single one of those questions!
- Detect all questions in the text, including multiple-choice questions, true/false questions, fill-in-the-blank questions, or open-ended/conceptual questions.
- For each question found in the PDF, you MUST map it directly to the structured JSON schema:
  1. "questionText": The exact (or slightly cleaned up for clarity) question text from the PDF. Do NOT change its meaning.
  2. "options": If the original question already has choices in the PDF, extract them exactly as they are and present them (exactly 4 options). If the original question does not have options, or has fewer than 4 options, you must formulate plausible multiple-choice options (A, B, C, D) based on the text, ensuring one of them is the correct answer and the others are high-quality, realistic distractors.
  3. "correctIndex": The index (0-3) of the correct option. Determine the correct answer using either the answer key provided in the PDF, or by analyzing the document text.
  4. "explanation": A concise, clear explanation explaining why that option is correct. Keep this to max 1-2 sentences to prevent hitting token limits.
  5. "sourceExcerpt": The exact text snippet or sentence from the PDF where the question's content or answer is located. Keep this brief.
  6. "pageNumber": The approximate page number in the PDF where this question is found.
- DO NOT skip or ignore any questions that are in the PDF. Scan and reflect ALL of them on the website.
- If the PDF contains pre-existing questions, you MUST scan and extract EVERY SINGLE pre-existing question found in the document. Completely ignore the requested question limit (${numQuestionsStr}) and prioritize full extraction of all pre-existing questions (up to 50 questions).
- If there are no pre-existing questions found in the PDF, only then should you generate new high-quality questions based on the informational content of the document up to the limit (${numQuestionsStr}).

Rules:
1. Strict Accuracy Requirement: Do not invent facts, hallucinate facts, or guess. Every question, choice, and correct answer must be directly supported by information found explicitly in the text.
2. Technical Preservation: Keep all numerical values, dates, formulas, names, standards (e.g. ISO, IEEE), technical terms, definitions, and units exact. Do not simplify or round off figures unless specified in the text.
3. Document-based: Rely only on the provided text. Never reference external knowledge, real-world events, or information outside the document. If a concept is unclear, skip generating a question for it rather than guessing.
4. Structure:
   - Exactly four choices (A, B, C, D) per question.
   - Only ONE option must be unambiguously correct.
   - The other three options (distractors) must be plausible but incorrect based strictly on the text.
   - Explanation: Provide a helpful, concise explanation referencing the factual source.
   - Source Excerpt: Provide the exact text snippet or sentence from the PDF supporting the answer.
   - Page Number: Specify the integer page number where the answer is found. If there are no clear page indicators, make a best estimate or omit if impossible to trace.
5. Question Types:
   - Definition: Focus on definitions of technical terms, concepts, acronyms, or formulas.
   - Identification: Ask the user to identify components, standards, rules, dates, or names based on a description.
   - True/False: Format the four choices so that the question presents a statement and asks if it is True or False (e.g., choice 0 is "True, because...", choice 1 is "False, because...", and choice 2 and 3 are alternative assertions or simple "True", "False", "Both True & False", "Cannot be determined from text"). Keep it elegant and easy to read.
   - Multiple Choice: Standard conceptual or application multiple-choice questions.
   - Mixed: A combination of the above types.
6. Return a valid JSON array of questions matching the rules above.`;

    const userPrompt = `Your absolute highest priority task is to analyze the document text for any pre-existing questions, worksheets, quizzes, or exams. 
If pre-existing questions are present, you MUST extract ALL of them (converting them to 4-option multiple-choice structure while preserving the exact original questions and answers), and completely ignore the requested limit of ${numQuestionsStr}.
If there are NO pre-existing questions in the text, then generate up to ${numQuestionsStr} new multiple-choice questions of difficulty "${difficulty}" and type "${questionType}" based on the informational content of the document.

--- BEGIN SOURCE TEXT ---
${text}
--- END SOURCE TEXT ---

Adhere strictly to the system instruction and response schema. Generate a valid JSON array of questions.`;

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
