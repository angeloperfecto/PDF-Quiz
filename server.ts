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
    code === 429 ||
    status === "UNAVAILABLE" ||
    status === "RESOURCE_EXHAUSTED" ||
    errMsg.includes("503") ||
    errMsg.includes("429") ||
    errMsg.includes("demand") ||
    errMsg.includes("busy") ||
    errMsg.includes("quota") ||
    errMsg.includes("limit") ||
    errMsg.includes("exhausted") ||
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
  systemInstruction: string,
  customSchema?: any
) {
  const models = ['gemini-3.5-flash', 'gemini-3.1-pro-preview', 'gemini-3.1-flash-lite', 'gemini-1.5-flash'];
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
            responseSchema: customSchema || {
              type: 'OBJECT',
              properties: {
                reasoning: { type: 'STRING', description: 'MANDATORY. Before generating questions, analyze the document here. Identify if there are pre-existing questions. Explicitly list all their numbers and count them. State your commitment to extract EVERY SINGLE ONE without skipping.' },
                totalQuestionsInPDF: { type: 'INTEGER', description: 'The TRUE EXACT count of pre-existing questions physically present in the document. Do not lie. Count them all. Set to 0 if generating new questions.' },
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
                      pageNumber: { type: 'INTEGER' },
                      imageAttachment: { type: 'STRING', description: 'optional, the exact Image reference ID if the question relies on an image' }
                    },
                    required: ['questionText', 'options', 'correctAnswerText', 'correctIndex', 'explanation', 'sourceExcerpt']
                  }
                }
              },
              required: ['reasoning', 'totalQuestionsInPDF', 'validationMessage', 'questions']
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
          const highDemandBackoff = 2500 + Math.floor(Math.random() * 1500);
          console.log(`Model ${model} is experiencing high demand. Sleeping ${highDemandBackoff}ms before skipping to the next model...`);
          await delay(highDemandBackoff);
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

function parseTextIntoPages(text: string): { pageNum: number; content: string }[] {
  const pages: { pageNum: number; content: string }[] = [];
  const regex = /--- PAGE (\d+) ---/g;
  
  let match;
  const matches: { index: number; pageNum: number; header: string }[] = [];
  
  while ((match = regex.exec(text)) !== null) {
    matches.push({
      index: match.index,
      pageNum: parseInt(match[1], 10),
      header: match[0]
    });
  }
  
  if (matches.length === 0) {
    return [{ pageNum: 1, content: text }];
  }
  
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const nextMatch = matches[i + 1];
    
    const startIdx = currentMatch.index + currentMatch.header.length;
    const endIdx = nextMatch ? nextMatch.index : text.length;
    
    const pageContent = text.substring(startIdx, endIdx).trim();
    pages.push({
      pageNum: currentMatch.pageNum,
      content: pageContent
    });
  }
  
  return pages;
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

    const { text, config, pdfBase64, images } = req.body;

    if (!pdfBase64 && (!text || typeof text !== 'string' || text.trim().length === 0)) {
      return res.status(400).json({ error: 'Extracted PDF text or PDF file is required and cannot be empty.' });
    }

    const rawNumQuestions = config?.numQuestions !== undefined ? config.numQuestions : 10;
    const isAll = rawNumQuestions === -1 || rawNumQuestions === 'all' || rawNumQuestions === 'All';
    const numQuestionsVal = isAll ? 50 : (Number(rawNumQuestions) || 10);
    
    const difficulty = config?.difficulty || 'Medium';
    const questionType = config?.questionType || 'Mixed';
    
    const targetCountPhrase = isAll 
      ? 'as many high-quality, distinct questions as possible from the content (up to a maximum of 50 questions)' 
      : `exactly ${numQuestionsVal} questions`;

    const systemInstruction = `You are an expert, document-grounded multiple-choice quiz scanner, extractor, and generator.
Your absolute, highest-priority goal is to scan the provided PDF, identify ALL pre-existing questions, and faithfully extract every single one of them onto the website without any omissions, alterations, or summaries.

CRITICAL MANDATES FOR PRE-EXISTING QUESTIONS IN THE PDF:
1. 100% COMPLETE COVERAGE (NO OMISSIONS): You MUST scan and extract EVERY SINGLE pre-existing question found in the PDF. No questions should be skipped, omitted, summarized, or condensed. Do not stop early. If the document has hundreds of questions, you must extract every single one. You must seamlessly bridge multi-page and multi-line questions.
2. FAITHFUL REPRODUCTION: Reproduce the complete set of questions exactly as they appear in the original document. Preserve original numbering (e.g., "Question 1", "1. ", "10."), formatting, ordering, and exact verbatim wording. You must accurately capture tables, mathematical expressions, symbols, and special characters. Ensure no question is skipped because of page breaks, inconsistent spacing, headers, footers, or formatting differences.
3. PRESERVE ALL OPTIONS:
   - Extract all answer choices exactly as they appear in the PDF (e.g., A, B, C, D, E) including multi-line answer choices.
   - If the original question has fewer or more than 4 options, map it faithfully into a 4-option structure (A, B, C, D) without losing the original meaning. The correct answer must be one of the options.
4. RECOVERY OF ANSWERS: Correctly identify the "correctIndex" (0 to 3) by matching the correct answer against any answer key provided, or by logical analysis.
5. NO SUPPLEMENTATION WHEN PRE-EXISTING QUESTIONS EXIST: If the document contains ANY pre-existing questions (even if it is only 1 or 2 word problems), your ONLY task is to extract those exact pre-existing questions. DO NOT generate, create, or add any supplementary questions. If there is only 1 pre-existing question, return exactly 1. If there are 15, return exactly 15.
6. NO MOCK OR BLANK STUBS: Every extracted question must be complete with fully populated questions and options. Never return empty arrays or incomplete data.
7. IMAGE DETECTION: We have provided the extracted text which may contain "[Image reference: img_id]" placeholders, alongside actual images. If a question refers to an image (e.g. "Based on the figure below"), you MUST set the "imageAttachment" field for that question to the EXACT image ID from the reference.

Rules:
1. Strict Accuracy: Every question, option, correct index, and explanation must be 100% backed by the provided text or document.
2. Technical Preservation: Keep all exact numerical values, formulas, dates, names, standard identifiers, units, and symbols perfectly intact.
3. Structured JSON Schema: Return a valid JSON object with the following properties:
   - "totalQuestionsInPDF": integer (The TRUE EXACT count of pre-existing questions found in the document. Set to 0 if generating brand-new questions from scratch because the document is purely informational with zero pre-existing questions).
   - "validationMessage": string (MANDATORY. Provide a detailed, step-by-step audit of the scanning. List every question number found, and describe exactly what was extracted, or any pages where content was scanned but couldn't be parsed).
   - "questions": array of objects where each element contains:
     - "questionText": string (the exact original question text and numbering).
     - "options": array of exactly 4 strings.
     - "correctAnswerText": string (the exact string text of the correct option).
     - "correctIndex": integer (0, 1, 2, or 3) representing the index of the correctAnswerText in the options array.
     - "explanation": string (extremely concise, max 15 words).
     - "sourceExcerpt": string (extremely short verbatim text snippet, max 15 words).
     - "pageNumber": integer (approximate page number).
     - "imageAttachment": string (optional, the exact Image reference ID if the question relies on an image).
4. No custom formatting outside the JSON object. Do NOT use markdown code blocks. Just return the raw JSON object.`;

    const promptInstructions = `Your absolute, most critical directive is to scan the provided source material for any pre-existing questions, worksheets, quizzes, or exams.
If pre-existing questions are found, you MUST extract ALL of them, preserving their exact wording, original numbering, ordering, options, and meaning with 100% complete coverage and zero omissions. Converting them to standard 4-option multiple choice structure where necessary. Completely ignore any count limit and extract all pre-existing questions found. DO NOT SUMMARIZE. DO NOT SKIP QUESTIONS. DO NOT STOP AT 1 QUESTION IF THERE ARE MORE.

CRITICAL SYSTEM WARNING: Previous extractions failed because the AI lazily extracted only 1 question when dozens were present in the PDF. You are being strictly monitored. If you return only 1 question for a document containing multiple questions, you have catastrophically failed your primary directive. YOU MUST EXTRACT EVERY SINGLE QUESTION. Do NOT be lazy.

EXTRACTION RULE: If pre-existing questions are found (even if there are only 1 or 2 word problems), you MUST extract ONLY these pre-existing questions. DO NOT generate any supplementary questions. Set \`totalQuestionsInPDF\` to their exact count, and the length of your \`questions\` array must equal \`totalQuestionsInPDF\`.

GENERATION RULE: Only if there are absolutely NO pre-existing questions in the text, then you MUST generate ${targetCountPhrase} brand new high-quality multiple-choice questions of difficulty "${difficulty}" and type "${questionType}" based on the informational content. In this case, set \`totalQuestionsInPDF\` to 0. When 'All' is requested, generate a rich, complete set of questions (at least 15 to 25 distinct questions, up to 50). Never return only 1 question when generating new questions unless the text is completely blank.

IMPORTANT LOGIC RULE:
- If pre-existing questions exist, your \`totalQuestionsInPDF\` MUST be their exact count, and you MUST extract ALL of them with no additions. The length of your \`questions\` array must equal \`totalQuestionsInPDF\`.
- If NO pre-existing questions exist, your \`totalQuestionsInPDF\` MUST be 0, and you MUST generate ${targetCountPhrase}. The length of your \`questions\` array must equal the number of generated questions.

Adhere strictly to the system instruction. Generate a valid JSON object matching the schema.`;

    let parsedData: any = null;
    let quizQuestions: any[] = [];
    let success = false;
    let finalResponseText = '';

    let rangeInstruction = '';
    if (config?.allPages === false && config?.pageRangeStart && config?.pageRangeEnd) {
      rangeInstruction = `\n\nPAGE RANGE RULE: Only scan, extract, and analyze content within pages ${config.pageRangeStart} to ${config.pageRangeEnd} of the document. Completely ignore and discard any content on pages outside of this range.`;
    }
    const finalPrompt = promptInstructions + rangeInstruction;

    // 1. Detection Step to see if there are pre-existing questions in the PDF
    let hasPreExisting = true; // Default to true for maximum safety
    let detectedCount = 0;
    
    if (text && text.trim().length > 0) {
      // Robust heuristic detection based on regex patterns
      const hasOptionsPattern = (text.match(/\b[A-Ea-e][\.\)\-]\s/g) || []).length > 8;
      const hasNumberingPattern = (text.match(/\b\d+[\.\)\-]\s/g) || []).length > 8;
      const hasKeywords = (text.toLowerCase().match(/\b(question|quiz|exam|test|worksheet|problem|correct answer)\b/g) || []).length > 3;
      
      const heuristicHasPreExisting = (hasOptionsPattern && hasNumberingPattern) || (hasKeywords && hasOptionsPattern);
      console.log(`[PDF Parser] Heuristic Check - hasOptionsPattern: ${hasOptionsPattern}, hasNumberingPattern: ${hasNumberingPattern}, hasKeywords: ${hasKeywords}, heuristicHasPreExisting: ${heuristicHasPreExisting}`);

      try {
        console.log('[PDF Parser] Scanning document to detect pre-existing questions...');
        const detectSystemInstruction = `You are an expert document analyzer. Your task is to detect if there are any pre-existing multiple-choice questions, worksheets, quizzes, or exam problems written inside the provided text.`;

        const detectPrompt = `Analyze the document text below. Determine if the text contains any pre-existing multiple-choice questions, exam problems, worksheets, or quizzes.

--- DOCUMENT TEXT ---
${text.substring(0, 500000)}`;

        const detectSchema = {
          type: 'OBJECT',
          properties: {
            hasPreExisting: { type: 'BOOLEAN', description: 'True if there are pre-existing multiple-choice questions, exam problems, worksheets, or quizzes in the document.' },
            totalQuestions: { type: 'INTEGER', description: 'The exact count of pre-existing questions found in the document.' }
          },
          required: ['hasPreExisting', 'totalQuestions']
        };

        const detectResponse = await generateQuizWithFallback(ai, detectPrompt, detectSystemInstruction, detectSchema);
        const detectText = (detectResponse.text || '').replace(/```json/g, '').replace(/```/g, '').trim();
        const parsedDetect = JSON.parse(detectText);
        hasPreExisting = !!parsedDetect.hasPreExisting || heuristicHasPreExisting;
        detectedCount = Number(parsedDetect.totalQuestions) || 0;
        
        // If heuristic is very strong, override count if it was parsed as 0
        if (heuristicHasPreExisting && detectedCount === 0) {
          detectedCount = Math.max(8, (text.match(/\b\d+[\.\)\-]\s/g) || []).length);
        }
        
        console.log(`[PDF Parser] Detection result: hasPreExisting = ${hasPreExisting}, detectedCount = ${detectedCount}`);
      } catch (detectErr) {
        console.warn('[PDF Parser] Failed to detect pre-existing questions, assuming true for safety:', detectErr);
        hasPreExisting = true;
        if (heuristicHasPreExisting) {
          detectedCount = Math.max(8, (text.match(/\b\d+[\.\)\-]\s/g) || []).length);
        }
      }
    }

    // 2. If pre-existing questions are present, perform Parallel Chunked Extraction with concurrency limit to prevent 429 errors
    if (hasPreExisting && text && text.trim().length > 0) {
      try {
        const pages = parseTextIntoPages(text);
        const totalPages = pages.length;

        // Dynamic chunk sizing to balance speed, rate limits, and output token safety
        let chunkSize = 3;
        if (totalPages > 30) {
          chunkSize = 5;
        } else if (totalPages > 15) {
          chunkSize = 4;
        }

        const pageChunks: { pageNum: number; content: string }[][] = [];
        for (let i = 0; i < pages.length; i += chunkSize) {
          pageChunks.push(pages.slice(i, i + chunkSize));
        }

        console.log(`[PDF Parser] Initializing Parallel Chunked Extraction. Total pages: ${totalPages}, chunk size: ${chunkSize}, total chunks: ${pageChunks.length}`);

        // Helper concurrency limited promise execution (running maximum 2 chunks concurrently)
        const runWithConcurrencyLimit = async <T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> => {
          const results: T[] = [];
          const executing: Promise<any>[] = [];
          for (const task of tasks) {
            const p = Promise.resolve().then(() => task());
            results.push(p as any);
            const e: Promise<any> = p.then(() => {
              executing.splice(executing.indexOf(e), 1);
            });
            executing.push(e);
            if (executing.length >= limit) {
              await Promise.race(executing);
            }
          }
          return Promise.all(results);
        };

        const chunkTasks = pageChunks.map((chunk, index) => {
          return async () => {
            const chunkText = chunk.map(p => `--- PAGE ${p.pageNum} ---\n${p.content}`).join('\n\n');
            // Filter images relevant to this specific page chunk to keep context clean
            const chunkImages = images ? images.filter((img: any) => chunkText.includes(img.id)) : [];
            
            const chunkPromptInstructions = `Your absolute, most critical directive is to scan the provided text from pages ${chunk[0].pageNum} to ${chunk[chunk.length - 1].pageNum} for any pre-existing questions, worksheets, quizzes, or exams.
You MUST extract ALL pre-existing questions found on these pages with 100% complete coverage and zero omissions. DO NOT SUMMARIZE. DO NOT SKIP QUESTIONS. DO NOT STOP EARLY.
Convert them to standard 4-option multiple choice structure where necessary.

Set \`totalQuestionsInPDF\` to the exact count of pre-existing questions found in this specific chunk.
Set the \`questions\` array to contain all the extracted questions from this chunk.

If there are NO pre-existing questions on these pages, return an empty array for \`questions\` and set \`totalQuestionsInPDF\` to 0.`;

            let promptPayload: any = `${chunkPromptInstructions}\n\n--- BEGIN SOURCE TEXT FOR PAGES ${chunk[0].pageNum}-${chunk[chunk.length - 1].pageNum} ---\n${chunkText}\n--- END SOURCE TEXT ---`;
            
            if (chunkImages.length > 0) {
              promptPayload = [ { text: promptPayload } ];
              for (const img of chunkImages) {
                if (img.dataUrl && img.dataUrl.includes('base64,')) {
                  const [prefix, b64] = img.dataUrl.split('base64,');
                  const mimeType = prefix.replace('data:', '').replace(';', '');
                  promptPayload.push({ text: `[Image reference: ${img.id}]` });
                  promptPayload.push({ inlineData: { mimeType, data: b64 } });
                }
              }
            }

            let chunkParsedData: any = null;
            let chunkSuccess = false;

            for (let attempt = 1; attempt <= 3; attempt++) {
              try {
                console.log(`[PDF Parser] [Chunk ${index + 1}/${pageChunks.length}] Extracting pages ${chunk[0].pageNum}-${chunk[chunk.length - 1].pageNum} (Attempt ${attempt})...`);
                const response = await generateQuizWithFallback(ai, promptPayload, systemInstruction);
                const responseText = response.text;
                if (!responseText) continue;

                const parsed = parseQuizQuestions(responseText);
                if (parsed && Array.isArray(parsed.questions)) {
                  chunkParsedData = parsed;
                  chunkSuccess = true;
                  console.log(`[PDF Parser] [Chunk ${index + 1}/${pageChunks.length}] Successfully extracted ${parsed.questions.length} questions.`);
                  break;
                }
              } catch (err) {
                console.warn(`[PDF Parser] [Chunk ${index + 1}/${pageChunks.length}] Attempt ${attempt} failed:`, err instanceof Error ? err.message : String(err));
                if (attempt < 3) {
                  // Wait progressively longer (exponential-ish backoff) with some randomized jitter (e.g. 2000ms - 5000ms)
                  const backoffTime = (attempt * 2500) + Math.floor(Math.random() * 2000);
                  console.log(`[PDF Parser] Chunk ${index + 1} retrying in ${backoffTime}ms...`);
                  await new Promise(resolve => setTimeout(resolve, backoffTime));
                }
              }
            }

            return {
              index,
              success: chunkSuccess,
              parsedData: chunkParsedData,
              pages: chunk.map(p => p.pageNum)
            };
          };
        });

        // Run with concurrency limit of 1 parallel requests to avoid 429 quota exhaustion
        const chunkResults = await runWithConcurrencyLimit(chunkTasks, 1);

        let mergedQuestions: any[] = [];
        let totalQuestionsInPDFSum = 0;
        let validationMessages: string[] = [];

        for (const result of chunkResults) {
          if (result.success && result.parsedData) {
            const chunkQuestions = result.parsedData.questions || [];
            mergedQuestions.push(...chunkQuestions);
            totalQuestionsInPDFSum += result.parsedData.totalQuestionsInPDF || chunkQuestions.length;
            if (result.parsedData.validationMessage) {
              validationMessages.push(`Pages ${result.pages.join(',')}: ${result.parsedData.validationMessage}`);
            } else {
              validationMessages.push(`Pages ${result.pages.join(',')}: Successfully extracted ${chunkQuestions.length} questions.`);
            }
          } else {
            console.warn(`[PDF Parser] [Chunk ${result.index + 1}] Failed to extract questions.`);
            validationMessages.push(`Pages ${result.pages.join(',')}: FAILED to extract questions completely.`);
          }
        }

        // De-duplicate questions by normalized question text to prevent duplicate questions across chunk boundaries
        const seenTexts = new Set<string>();
        const uniqueQuestions: any[] = [];
        for (const q of mergedQuestions) {
          const normText = q.questionText.replace(/\s+/g, '').toLowerCase();
          if (!seenTexts.has(normText)) {
            seenTexts.add(normText);
            uniqueQuestions.push(q);
          } else {
            console.log(`[PDF Parser] De-duplicated question: "${q.questionText.substring(0, 60)}..."`);
          }
        }

        // Set totalExpected to be the highest of detectedCount from first pass or total questions sum or unique questions length.
        // This makes sure our validation in UploadZone will accurately catch any missing questions!
        const finalTotalExpected = Math.max(detectedCount, uniqueQuestions.length, totalQuestionsInPDFSum);

        parsedData = {
          reasoning: `Merged questions from ${chunkResults.length} parallel page chunks.`,
          totalQuestionsInPDF: finalTotalExpected,
          validationMessage: validationMessages.join('\n'),
          questions: uniqueQuestions
        };
        quizQuestions = uniqueQuestions;
        
        // If we found questions, consider it a success. Otherwise, let it fallback to standard generation.
        if (uniqueQuestions.length > 0) {
          success = true;
          console.log(`[PDF Parser] Chunked Extraction complete! Successfully extracted ${uniqueQuestions.length} unique questions out of expected ${finalTotalExpected}.`);
        } else {
          console.log('[PDF Parser] Chunked extraction returned 0 questions. Document is likely purely informational. Falling back to single-pass generator.');
        }
      } catch (chunkErr) {
        console.warn('[PDF Parser] Parallel chunked extraction failed, falling back to standard single-pass strategies:', chunkErr instanceof Error ? chunkErr.message : String(chunkErr));
      }
    }

    // 3. Fallback to standard Single-Pass Strategies if chunking failed, or if no pre-existing questions were detected
    if (!success) {
      const strategies = [];
      if (pdfBase64) {
        strategies.push({
          type: 'pdf',
          prompt: [
            { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
            finalPrompt
          ]
        });
      }
      if (text && text.trim().length > 0) {
        let promptPayload: any = `${finalPrompt}\n\n--- BEGIN SOURCE TEXT ---\n${text}\n--- END SOURCE TEXT ---`;
        
        if (images && images.length > 0) {
          promptPayload = [ { text: promptPayload } ];
          for (const img of images) {
             if (img.dataUrl && img.dataUrl.includes('base64,')) {
               const [prefix, b64] = img.dataUrl.split('base64,');
               const mimeType = prefix.replace('data:', '').replace(';', '');
               promptPayload.push({ text: `[Image reference: ${img.id}]` });
               promptPayload.push({ inlineData: { mimeType, data: b64 } });
             }
          }
        }
        
        strategies.push({
          type: 'text',
          prompt: promptPayload
        });
      }

      for (let i = 0; i < strategies.length; i++) {
        const strategy = strategies[i];
        console.log(`[PDF Parser] Trying single-pass extraction strategy: ${strategy.type}`);
        let strategySuccess = false;
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            const response = await generateQuizWithFallback(ai, strategy.prompt, systemInstruction);
            const responseText = response.text;
            
            if (!responseText) continue;
            
            finalResponseText = responseText;
            const currentParsedData = parseQuizQuestions(responseText);
            const currentQuestions = currentParsedData.questions;
            
            if (currentQuestions && currentQuestions.length > 0) {
              console.log(`[PDF Parser] Attempt ${attempt}: Single-pass extracted ${currentQuestions.length} questions. totalQuestionsInPDF reported: ${currentParsedData.totalQuestionsInPDF || 0}`);
              const totalInPdf = currentParsedData.totalQuestionsInPDF || 0;
              
              if (totalInPdf > 0 && currentQuestions.length < totalInPdf) {
                 console.log(`[PDF Parser] Validation failed for strategy ${strategy.type}: Found ${totalInPdf} questions but extracted ${currentQuestions.length}. Retrying.`);
                 if (!parsedData || currentQuestions.length > quizQuestions.length) {
                   parsedData = currentParsedData;
                   quizQuestions = currentQuestions;
                 }
                 continue; // retry
              } else if (totalInPdf === 0 && !isAll && currentQuestions.length < numQuestionsVal && numQuestionsVal > 1 && attempt < 2) {
                 console.log(`[PDF Parser] Validation failed: Model generated only ${currentQuestions.length} questions when ${numQuestionsVal} were requested. Retrying.`);
                 if (!parsedData || currentQuestions.length > quizQuestions.length) {
                   parsedData = currentParsedData;
                   quizQuestions = currentQuestions;
                 }
                 continue; // retry
              } else {
                 strategySuccess = true;
                 parsedData = currentParsedData;
                 quizQuestions = currentQuestions;
                 break;
              }
            }
          } catch (err) {
            console.error(`[PDF Parser] Strategy ${strategy.type} attempt ${attempt} failed:`, err);
          }
        }
        if (strategySuccess) {
           success = true;
           break;
        }
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

      if (parsedData.questions && images && images.length > 0) {
        for (const q of parsedData.questions) {
          if (q.imageAttachment) {
            const matchedImg = images.find((img: any) => img.id === q.imageAttachment);
            if (matchedImg) {
               q.imageAttachment = matchedImg.dataUrl;
            }
          }
        }
      }

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
