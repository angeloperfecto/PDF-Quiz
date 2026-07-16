export interface Question {
  id?: string;
  questionText: string;
  options: string[];
  correctIndex: number;
  explanation?: string;
  sourceExcerpt?: string;
  pageNumber?: number;
  difficulty?: 'Easy' | 'Medium' | 'Hard';
  imageAttachment?: string; // base64 string
}

export interface QuizAttempt {
  attemptId: string;
  attemptDate: string;
  score: number;
  percentage: number;
  elapsedSeconds: number;
  userAnswers: number[]; // Index of answer chosen for each question
}

export interface Quiz {
  id: string;
  userId: string;
  
  // PDF specific
  fileName?: string;
  extractedText?: string;
  
  // Manual specific
  title?: string;
  subject?: string;
  isManual?: boolean;
  isDraft?: boolean;
  
  uploadDate: string; // Used as creation date for manual
  numQuestions: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Mixed';
  questionType: 'Definition' | 'Identification' | 'True/False' | 'Multiple Choice' | 'Mixed';
  questions: Question[];
  scoreHistory: QuizAttempt[];
}

export interface QuizConfig {
  numQuestions: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | 'Mixed';
  questionType: 'Definition' | 'Identification' | 'True/False' | 'Multiple Choice' | 'Mixed';
  pageRangeStart: number;
  pageRangeEnd: number;
  allPages: boolean;
}

export type EventStatus = 'Completed' | 'Pending' | 'Overdue';

export interface StudyEvent {
  id: string;
  userId: string;
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  subject: string;
  color: string; // Tailwind color class name prefix e.g., 'indigo', 'rose', 'emerald', 'amber', 'purple'
  notes?: string;
  estimatedMinutes: number;
  reminderType: '30min' | '1hour' | '1day' | 'custom' | 'none';
  customReminderMinutes?: number; // custom number of minutes before
  isRecurring: boolean;
  recurringFrequency?: 'daily' | 'weekly' | 'monthly';
  
  // PDF & Quiz Details if attached
  fileName?: string;
  extractedText?: string;
  quizId?: string; // If a quiz has been generated for this event
  quiz?: Quiz; // The embedded generated quiz
  status: EventStatus;
}
