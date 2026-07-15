import React, { useState, useRef, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  Copy,
  ChevronLeft,
  ChevronRight,
  Download,
  Bell,
  BookOpen,
  FileText,
  Sparkles,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Search,
  Filter,
  Info,
  CalendarDays,
  ListTodo,
  TrendingUp,
  Award,
  Zap,
  Printer,
  CalendarCheck,
  ExternalLink,
  ChevronDown,
  RefreshCw,
  Loader2,
  Upload
} from 'lucide-react';
import { Quiz, StudyEvent, QuizConfig, EventStatus } from '../types';
import { saveStudyEventToFirestore, deleteStudyEventFromFirestore } from '../lib/calendarService';
import { saveQuizToFirestore } from '../lib/quizService';
import * as pdfjsLib from 'pdfjs-dist';
import { createWorker } from 'tesseract.js';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface CalendarViewProps {
  user: any;
  quizzes: Quiz[];
  studyEvents: StudyEvent[];
  onRefreshEvents: () => void;
  onStartQuiz: (quiz: Quiz) => void;
  onViewPDF: (file: File | string) => void;
}

export default function CalendarView({
  user,
  quizzes,
  studyEvents,
  onRefreshEvents,
  onStartQuiz,
  onViewPDF
}: CalendarViewProps) {
  // Calendar Navigation & Views
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day' | 'schedule'>('month');
  
  // Modals & Forms
  const [isEventModalOpen, setIsEventModalOpen] = useState<boolean>(false);
  const [selectedEvent, setSelectedEvent] = useState<StudyEvent | null>(null);
  const [selectedDateStr, setSelectedDateStr] = useState<string>('');
  
  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [subjectFilter, setSubjectFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  
  // Event Form State
  const [formTitle, setFormTitle] = useState<string>('');
  const [formSubject, setFormSubject] = useState<string>('');
  const [formColor, setFormColor] = useState<string>('indigo');
  const [formTime, setFormTime] = useState<string>('09:00');
  const [formMinutes, setFormMinutes] = useState<number>(30);
  const [formNotes, setFormNotes] = useState<string>('');
  const [formReminder, setFormReminder] = useState<StudyEvent['reminderType']>('30min');
  const [formCustomReminder, setFormCustomReminder] = useState<number>(15);
  const [formIsRecurring, setFormIsRecurring] = useState<boolean>(false);
  const [formRecurrence, setFormRecurrence] = useState<'daily' | 'weekly' | 'monthly'>('weekly');
  
  // PDF Upload state inside event modal
  const [modalFile, setModalFile] = useState<File | null>(null);
  const [modalTotalPages, setModalTotalPages] = useState<number>(0);
  const [modalPdfDoc, setModalPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isGeneratingQuiz, setIsGeneratingQuiz] = useState<boolean>(false);
  const [generationProgress, setGenerationProgress] = useState<string>('');
  const [generationPercent, setGenerationPercent] = useState<number>(0);
  const [generatedQuizData, setGeneratedQuizData] = useState<Quiz | null>(null);
  
  // Quiz Generator Config for modal PDF
  const [modalNumQuestions, setModalNumQuestions] = useState<number>(10);
  const [modalDifficulty, setModalDifficulty] = useState<QuizConfig['difficulty']>('Medium');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeNotifications, setActiveNotifications] = useState<string[]>([]);

  // Subject options & colors
  const subjects = [
    { name: 'Mathematics', color: 'indigo' },
    { name: 'Science', color: 'emerald' },
    { name: 'History', color: 'amber' },
    { name: 'Literature', color: 'rose' },
    { name: 'Engineering', color: 'purple' },
    { name: 'Computer Science', color: 'sky' },
    { name: 'Other', color: 'slate' }
  ];

  // Helper to trigger active study event notification reminders
  useEffect(() => {
    // Check for reminder triggers every 15 seconds
    const interval = setInterval(() => {
      const now = new Date();
      studyEvents.forEach(event => {
        if (event.status === 'Pending' && event.time) {
          const [eventHour, eventMin] = event.time.split(':').map(Number);
          const eventDate = new Date(event.date);
          eventDate.setHours(eventHour, eventMin, 0, 0);

          let reminderOffsetMinutes = 0;
          if (event.reminderType === '30min') reminderOffsetMinutes = 30;
          else if (event.reminderType === '1hour') reminderOffsetMinutes = 60;
          else if (event.reminderType === '1day') reminderOffsetMinutes = 1440;
          else if (event.reminderType === 'custom') reminderOffsetMinutes = event.customReminderMinutes || 15;

          if (reminderOffsetMinutes > 0) {
            const triggerTime = new Date(eventDate.getTime() - reminderOffsetMinutes * 60 * 1000);
            // If we are within 1 minute of trigger time and hasn't notified yet
            const diffMs = Math.abs(now.getTime() - triggerTime.getTime());
            if (diffMs < 30000) {
              const notificationId = `${event.id}-reminder`;
              if (!activeNotifications.includes(notificationId)) {
                setActiveNotifications(prev => [...prev, notificationId]);
                // Show browser notification if permitted
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification(`Study Reminder: ${event.title}`, {
                    body: `Your scheduled quiz on "${event.subject}" starts in ${reminderOffsetMinutes} minutes.`,
                    icon: '/favicon.ico'
                  });
                }
                // Also trigger standard web speech / audio alert
                try {
                  const speech = new SpeechSynthesisUtterance(`Reminder: Your study session for ${event.title} is coming up.`);
                  window.speechSynthesis.speak(speech);
                } catch (speechErr) {}
              }
            }
          }
        }
      });
    }, 15000);

    return () => clearInterval(interval);
  }, [studyEvents, activeNotifications]);

  // Request notification permission on load
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        alert('Notification access granted! You will receive timely desktop notifications.');
      }
    } else {
      alert('Your browser does not support desktop notifications.');
    }
  };

  // Helper to format date YYYY-MM-DD
  const formatDateString = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Get days in current month
  const getDaysInMonth = (date: Date): Date[] => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const days: Date[] = [];
    
    // Fill in days of previous month to align first weekday (Sunday = 0)
    const startOffset = firstDay.getDay();
    for (let i = startOffset - 1; i >= 0; i--) {
      days.push(new Date(year, month, -i));
    }
    
    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }
    
    // Fill in days of next month to complete the 6-row grid (42 cells)
    const endOffset = 42 - days.length;
    for (let i = 1; i <= endOffset; i++) {
      days.push(new Date(year, month + 1, i));
    }
    
    return days;
  };

  // Get days in current week
  const getDaysInWeek = (date: Date): Date[] => {
    const currentDayOfWeek = date.getDay();
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(date);
      d.setDate(date.getDate() - currentDayOfWeek + i);
      days.push(d);
    }
    return days;
  };

  // Check event status relative to current date
  const computeEventStatus = (event: StudyEvent): EventStatus => {
    if (event.quizId) {
      // Find if quiz is completed by inspecting scoreHistory of that quiz or event's quiz
      const matchedQuiz = quizzes.find(q => q.id === event.quizId);
      if (matchedQuiz && matchedQuiz.scoreHistory && matchedQuiz.scoreHistory.length > 0) {
        return 'Completed';
      }
    }
    
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const eventDate = new Date(event.date);
    eventDate.setHours(0, 0, 0, 0);
    
    if (eventDate.getTime() < now.getTime()) {
      return 'Overdue';
    }
    return 'Pending';
  };

  // Filter study events based on search, subject, and status
  const getFilteredEvents = (): StudyEvent[] => {
    return studyEvents.map(event => ({
      ...event,
      status: computeEventStatus(event)
    })).filter(event => {
      const matchesSearch = event.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            (event.notes && event.notes.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesSubject = subjectFilter === 'All' || event.subject === subjectFilter;
      const matchesStatus = statusFilter === 'All' || event.status === statusFilter;
      return matchesSearch && matchesSubject && matchesStatus;
    });
  };

  const filteredEvents = getFilteredEvents();

  // Navigation handlers
  const handlePrev = () => {
    if (calendarView === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
    } else if (calendarView === 'week') {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() - 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() - 1);
      setCurrentDate(d);
    }
  };

  const handleNext = () => {
    if (calendarView === 'month') {
      setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
    } else if (calendarView === 'week') {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() + 7);
      setCurrentDate(d);
    } else {
      const d = new Date(currentDate);
      d.setDate(currentDate.getDate() + 1);
      setCurrentDate(d);
    }
  };

  // Handle Drag & Drop to reschedule events
  const handleDragStart = (e: React.DragEvent, eventId: string) => {
    e.dataTransfer.setData('text/plain', eventId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetDateStr: string) => {
    e.preventDefault();
    const eventId = e.dataTransfer.getData('text/plain');
    const matchedEvent = studyEvents.find(event => event.id === eventId);
    if (matchedEvent) {
      const updatedEvent: StudyEvent = {
        ...matchedEvent,
        date: targetDateStr
      };
      try {
        await saveStudyEventToFirestore(updatedEvent);
        onRefreshEvents();
      } catch (err) {
        console.error('Error rescheduling event via drag-drop:', err);
      }
    }
  };

  // Handle open add event
  const handleOpenAddEvent = (dateStr: string) => {
    setSelectedDateStr(dateStr);
    setSelectedEvent(null);
    setFormTitle('');
    setFormSubject('Computer Science');
    setFormColor('indigo');
    setFormTime('09:00');
    setFormMinutes(30);
    setFormNotes('');
    setFormReminder('30min');
    setFormCustomReminder(15);
    setFormIsRecurring(false);
    setFormRecurrence('weekly');
    setModalFile(null);
    setModalTotalPages(0);
    setModalPdfDoc(null);
    setGeneratedQuizData(null);
    setIsEventModalOpen(true);
  };

  // Handle open edit/view event
  const handleOpenEditEvent = (event: StudyEvent) => {
    setSelectedEvent(event);
    setSelectedDateStr(event.date);
    setFormTitle(event.title);
    setFormSubject(event.subject);
    setFormColor(event.color);
    setFormTime(event.time || '09:00');
    setFormMinutes(event.estimatedMinutes);
    setFormNotes(event.notes || '');
    setFormReminder(event.reminderType);
    setFormCustomReminder(event.customReminderMinutes || 15);
    setFormIsRecurring(event.isRecurring);
    setFormRecurrence(event.recurringFrequency || 'weekly');
    setModalFile(null);
    setModalTotalPages(0);
    setModalPdfDoc(null);
    setGeneratedQuizData(event.quiz || null);
    setIsEventModalOpen(true);
  };

  // Handle Direct PDF upload in Modal
  const handleModalFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      setModalFile(selectedFile);
      setGenerationProgress('Parsing PDF pages...');
      try {
        const arrayBuffer = await selectedFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        setModalPdfDoc(pdf);
        setModalTotalPages(pdf.numPages);
      } catch (err) {
        console.error('Error loading pdf in modal:', err);
        alert('Could not parse PDF file.');
        setModalFile(null);
      } finally {
        setGenerationProgress('');
      }
    }
  };

  // Trigger Quiz generation inside the calendar event modal
  const handleGenerateModalQuiz = async () => {
    if (!modalPdfDoc || !modalFile) return;
    setIsGeneratingQuiz(true);
    setGenerationProgress('Extracting reference text from document...');
    setGenerationPercent(15);

    try {
      let combinedText = '';
      const pagesToProcess = Math.min(modalPdfDoc.numPages, 15); // limit to first 15 pages in modal quick mode

      for (let i = 1; i <= pagesToProcess; i++) {
        setGenerationProgress(`Extracting page ${i} of ${pagesToProcess}...`);
        setGenerationPercent(Math.round((i / pagesToProcess) * 60));
        
        const page = await modalPdfDoc.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(' ').trim();
        combinedText += `\n--- PAGE ${i} ---\n${pageText}\n`;
      }

      setGenerationProgress('Running Gemini AI quiz generation...');
      setGenerationPercent(85);

      const config: QuizConfig = {
        numQuestions: modalNumQuestions,
        difficulty: modalDifficulty,
        questionType: 'Multiple Choice',
        pageRangeStart: 1,
        pageRangeEnd: pagesToProcess,
        allPages: true
      };

      const response = await fetch('/api/generate-quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: combinedText,
          config
        })
      });

      let data: any = {};
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const textResponse = await response.text();
        console.error('Non-JSON response received from server in calendar modal:', textResponse);
        if (!response.ok) {
          throw new Error(`The quiz generator server encountered an unexpected error (Status ${response.status}). Please try again in a moment.`);
        }
        throw new Error('Received an unexpected non-JSON response from the server.');
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate quiz. Please try again.');
      }
      
      const newQuiz: Quiz = {
        id: `quiz-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        userId: user?.uid || 'guest',
        fileName: modalFile.name,
        uploadDate: new Date().toISOString(),
        numQuestions: modalNumQuestions,
        difficulty: modalDifficulty,
        questionType: 'Multiple Choice',
        questions: data.questions,
        scoreHistory: [],
        extractedText: combinedText
      };

      // Save to databases
      await saveQuizToFirestore(newQuiz);
      setGeneratedQuizData(newQuiz);
      setGenerationPercent(100);
      setGenerationProgress('Successfully generated & linked AI Quiz!');
      setTimeout(() => setGenerationProgress(''), 2000);
    } catch (err) {
      console.error('Quiz Generation Error in calendar modal:', err);
      alert('Failed to generate AI quiz from the uploaded PDF document.');
    } finally {
      setIsGeneratingQuiz(false);
    }
  };

  // Submit study event schedule
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle) return;

    const eventId = selectedEvent ? selectedEvent.id : `event-${Date.now()}`;
    const matchedSubject = subjects.find(s => s.name === formSubject);
    const colorCode = matchedSubject ? matchedSubject.color : formColor;

    const eventData: StudyEvent = {
      id: eventId,
      userId: user?.uid || 'guest',
      title: formTitle,
      date: selectedDateStr,
      time: formTime,
      subject: formSubject,
      color: colorCode,
      notes: formNotes,
      estimatedMinutes: formMinutes,
      reminderType: formReminder,
      customReminderMinutes: formCustomReminder,
      isRecurring: formIsRecurring,
      recurringFrequency: formIsRecurring ? formRecurrence : undefined,
      fileName: modalFile ? modalFile.name : (selectedEvent?.fileName || undefined),
      extractedText: generatedQuizData ? generatedQuizData.extractedText : (selectedEvent?.extractedText || undefined),
      quizId: generatedQuizData ? generatedQuizData.id : (selectedEvent?.quizId || undefined),
      quiz: generatedQuizData || (selectedEvent?.quiz || undefined),
      status: 'Pending'
    };

    // Calculate final status
    eventData.status = computeEventStatus(eventData);

    try {
      await saveStudyEventToFirestore(eventData);
      
      // If recurring, we can optionally schedule secondary future instances (e.g., next 4 weeks)
      if (formIsRecurring && !selectedEvent) {
        const baseDate = new Date(selectedDateStr);
        for (let i = 1; i <= 4; i++) {
          const nextDate = new Date(baseDate);
          if (formRecurrence === 'daily') nextDate.setDate(baseDate.getDate() + i);
          else if (formRecurrence === 'weekly') nextDate.setDate(baseDate.getDate() + i * 7);
          else if (formRecurrence === 'monthly') nextDate.setMonth(baseDate.getMonth() + i);

          const recurringEvent: StudyEvent = {
            ...eventData,
            id: `${eventId}-rec-${i}`,
            date: formatDateString(nextDate),
            isRecurring: true,
            status: 'Pending'
          };
          await saveStudyEventToFirestore(recurringEvent);
        }
      }

      onRefreshEvents();
      setIsEventModalOpen(false);
    } catch (err) {
      console.error('Error saving study event:', err);
    }
  };

  // Delete event
  const handleDeleteEvent = async (eventId: string) => {
    if (window.confirm('Are you sure you want to delete this study schedule event?')) {
      try {
        await deleteStudyEventFromFirestore(eventId, user?.uid || 'guest');
        onRefreshEvents();
        setIsEventModalOpen(false);
      } catch (err) {
        console.error('Error deleting study event:', err);
      }
    }
  };

  // Duplicate schedule event helper
  const handleDuplicateEvent = async (event: StudyEvent) => {
    const nextDate = new Date(event.date);
    nextDate.setDate(nextDate.getDate() + 7); // Default duplicate to next week
    
    const duplicated: StudyEvent = {
      ...event,
      id: `event-${Date.now()}-${Math.floor(Math.random() * 100)}`,
      title: `${event.title} (Copy)`,
      date: formatDateString(nextDate),
      status: 'Pending'
    };

    try {
      await saveStudyEventToFirestore(duplicated);
      onRefreshEvents();
      alert(`Successfully duplicated session to next week (${duplicated.date})`);
    } catch (err) {
      console.error('Error duplicating event:', err);
    }
  };

  // Google Calendar integration template generator URL
  const getGoogleCalendarUrl = (event: StudyEvent): string => {
    const title = encodeURIComponent(`Study Session: ${event.title}`);
    const notes = encodeURIComponent(`${event.notes || ''}\n\nSubject: ${event.subject}\nEstimated Time: ${event.estimatedMinutes} mins\nGenerated AI Quiz available in QuizPDF AI app!`);
    
    // Format start & end date for Google URL YYYYMMDDTHHMMSSZ
    const datePart = event.date.replace(/-/g, '');
    const timePart = event.time ? event.time.replace(/:/g, '') + '00' : '090000';
    const startStr = `${datePart}T${timePart}`;
    
    // Add estimated duration
    const endHour = Math.floor(event.estimatedMinutes / 60);
    const endMin = event.estimatedMinutes % 60;
    const startHourNum = event.time ? Number(event.time.split(':')[0]) : 9;
    const startMinNum = event.time ? Number(event.time.split(':')[1]) : 0;
    
    const finalEndHour = String((startHourNum + endHour) % 24).padStart(2, '0');
    const finalEndMin = String((startMinNum + endMin) % 60).padStart(2, '0');
    const endStr = `${datePart}T${finalEndHour}${finalEndMin}00`;

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startStr}/${endStr}&details=${notes}`;
  };

  // Export full schedule to print/layout or copy JSON
  const handleExportSchedule = () => {
    const scheduleStr = JSON.stringify(studyEvents, null, 2);
    const blob = new Blob([scheduleStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `StudySchedule-${formatDateString(new Date())}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Analytics Computation
  const computeAnalytics = () => {
    const completed = studyEvents.filter(e => computeEventStatus(e) === 'Completed');
    const upcoming = studyEvents.filter(e => computeEventStatus(e) === 'Pending');
    const overdue = studyEvents.filter(e => computeEventStatus(e) === 'Overdue');
    
    // Average score computation from attached quizzes
    let totalScore = 0;
    let quizAttemptsCount = 0;
    const subjectScores: { [key: string]: { sum: number; count: number } } = {};

    quizzes.forEach(quiz => {
      if (quiz.scoreHistory && quiz.scoreHistory.length > 0) {
        quiz.scoreHistory.forEach(attempt => {
          totalScore += attempt.percentage;
          quizAttemptsCount++;

          // Associate with subject if a study event linked to this quiz exists
          const matchedEvent = studyEvents.find(e => e.quizId === quiz.id);
          const subject = matchedEvent ? matchedEvent.subject : 'General';
          if (!subjectScores[subject]) {
            subjectScores[subject] = { sum: 0, count: 0 };
          }
          subjectScores[subject].sum += attempt.percentage;
          subjectScores[subject].count++;
        });
      }
    });

    const averageScore = quizAttemptsCount > 0 ? Math.round(totalScore / quizAttemptsCount) : 0;

    // Identify weak subjects (average score < 75%)
    const weakSubjects: string[] = [];
    Object.keys(subjectScores).forEach(subject => {
      const avg = subjectScores[subject].sum / subjectScores[subject].count;
      if (avg < 75) {
        weakSubjects.push(`${subject} (${Math.round(avg)}% Avg)`);
      }
    });

    // Simple consecutive day streak calculation based on completed attempts
    let streak = 0;
    const sortedDates = quizzes
      .flatMap(q => q.scoreHistory || [])
      .map(attempt => attempt.attemptDate.split('T')[0])
      .filter((v, i, a) => a.indexOf(v) === i)
      .sort((a, b) => new Date(b).getTime() - new Date(a).getTime()); // descending

    if (sortedDates.length > 0) {
      const todayStr = formatDateString(new Date());
      const yesterdayStr = formatDateString(new Date(Date.now() - 86400000));
      
      let checkDate = sortedDates[0] === todayStr || sortedDates[0] === yesterdayStr ? new Date(sortedDates[0]) : null;
      if (checkDate) {
        streak = 1;
        for (let i = 1; i < sortedDates.length; i++) {
          const prev = new Date(sortedDates[i]);
          const diffDays = Math.round((checkDate.getTime() - prev.getTime()) / 86400000);
          if (diffDays === 1) {
            streak++;
            checkDate = prev;
          } else if (diffDays > 1) {
            break;
          }
        }
      }
    }

    // Time spent studying
    const totalMinutes = studyEvents
      .filter(e => computeEventStatus(e) === 'Completed')
      .reduce((sum, e) => sum + (e.estimatedMinutes || 30), 0);

    return {
      completedCount: completed.length,
      upcomingCount: upcoming.length,
      overdueCount: overdue.length,
      averageScore,
      streak,
      totalMinutes,
      weakSubjects
    };
  };

  const analytics = computeAnalytics();

  // Color helper mapping
  const getColorClasses = (color: string) => {
    switch (color) {
      case 'indigo': return 'bg-indigo-500/10 border-indigo-500/30 text-indigo-700 dark:text-indigo-300';
      case 'emerald': return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300';
      case 'amber': return 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300';
      case 'rose': return 'bg-rose-500/10 border-rose-500/30 text-rose-700 dark:text-rose-300';
      case 'purple': return 'bg-purple-500/10 border-purple-500/30 text-purple-700 dark:text-purple-300';
      case 'sky': return 'bg-sky-500/10 border-sky-500/30 text-sky-700 dark:text-sky-300';
      default: return 'bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-300';
    }
  };

  const getDayElementEvents = (dateStr: string) => {
    return filteredEvents.filter(e => e.date === dateStr);
  };

  return (
    <div className="w-full flex flex-col gap-6" id="calendar-view-root">
      
      {/* Top Banner Alert list if reminders trigger */}
      {activeNotifications.length > 0 && (
        <div className="flex flex-col gap-2 p-4 bg-indigo-600 text-white rounded-3xl shadow-lg border border-indigo-500 relative overflow-hidden animate-fadeIn">
          <div className="absolute top-[-20%] right-[-10%] w-[30%] h-[120%] bg-white/10 blur-[40px] rotate-12 pointer-events-none" />
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-2.5">
              <Bell className="w-5 h-5 text-indigo-200 animate-bounce" />
              <div>
                <h5 className="font-bold text-sm">Active Study Reminders Triggered</h5>
                <p className="text-xs text-indigo-100 mt-0.5 font-medium">Be sure to start your scheduled study quizzes to maintain your streak!</p>
              </div>
            </div>
            <button
              onClick={() => setActiveNotifications([])}
              className="text-xs font-bold underline text-indigo-200 hover:text-white"
            >
              Clear All Alerts
            </button>
          </div>
        </div>
      )}

      {/* Analytics Overview Panels */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4" id="calendar-analytics-dashboard">
        <div className="glass-card bg-white/40 dark:bg-[#0f1422]/40 border border-slate-200/50 dark:border-white/5 p-4 rounded-3xl flex items-center gap-3.5 shadow-sm">
          <div className="p-3 bg-indigo-500/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 rounded-2xl">
            <CalendarCheck className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">Completed Sessions</p>
            <h4 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 font-display mt-0.5">{analytics.completedCount}</h4>
          </div>
        </div>

        <div className="glass-card bg-white/40 dark:bg-[#0f1422]/40 border border-slate-200/50 dark:border-white/5 p-4 rounded-3xl flex items-center gap-3.5 shadow-sm">
          <div className="p-3 bg-emerald-500/10 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-2xl">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">Avg Quiz Accuracy</p>
            <h4 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 font-display mt-0.5">{analytics.averageScore}%</h4>
          </div>
        </div>

        <div className="glass-card bg-white/40 dark:bg-[#0f1422]/40 border border-slate-200/50 dark:border-white/5 p-4 rounded-3xl flex items-center gap-3.5 shadow-sm">
          <div className="p-3 bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 rounded-2xl">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">Study Streak</p>
            <h4 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 font-display mt-0.5">{analytics.streak} days</h4>
          </div>
        </div>

        <div className="glass-card bg-white/40 dark:bg-[#0f1422]/40 border border-slate-200/50 dark:border-white/5 p-4 rounded-3xl flex items-center gap-3.5 shadow-sm">
          <div className="p-3 bg-purple-500/10 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-2xl">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">Study Time Spent</p>
            <h4 className="text-xl font-extrabold text-slate-800 dark:text-slate-100 font-display mt-0.5">{analytics.totalMinutes} min</h4>
          </div>
        </div>

        <div className="col-span-2 lg:col-span-1 glass-card bg-white/40 dark:bg-[#0f1422]/40 border border-slate-200/50 dark:border-white/5 p-4 rounded-3xl flex items-center gap-3.5 shadow-sm">
          <div className="p-3 bg-rose-500/10 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 rounded-2xl">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider">Focus Attention Areas</p>
            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mt-1 truncate">
              {analytics.weakSubjects.length > 0 ? analytics.weakSubjects.join(', ') : 'All subjects optimized!'}
            </p>
          </div>
        </div>
      </section>

      {/* Filter and Control Bar */}
      <section className="glass-panel border border-slate-200/50 dark:border-white/5 p-5 rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm" id="calendar-toolbar">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search */}
          <div className="relative flex-1 md:flex-initial">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search scheduled quizzes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 rounded-2xl text-xs font-medium focus:outline-none focus:border-indigo-500 w-full md:w-56"
            />
          </div>

          {/* Subject Filter */}
          <div className="relative">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="pl-8 pr-8 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
            >
              <option value="All">All Subjects</option>
              {subjects.map(sub => (
                <option key={sub.name} value={sub.name}>{sub.name}</option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div className="relative">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 bg-slate-100 dark:bg-white/5 border border-slate-200/60 dark:border-white/5 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
            >
              <option value="All">All Statuses</option>
              <option value="Pending">🟡 Pending</option>
              <option value="Completed">🟢 Completed</option>
              <option value="Overdue">🔴 Overdue</option>
            </select>
          </div>
        </div>

        {/* Calendar View Selectors & Add Buttons */}
        <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0">
          <div className="flex bg-slate-200/50 dark:bg-white/5 p-1 rounded-2xl border border-slate-200/30 dark:border-white/5 text-xs font-bold">
            <button
              onClick={() => setCalendarView('month')}
              className={`px-3 py-1.5 rounded-xl transition-all ${calendarView === 'month' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
            >
              Month
            </button>
            <button
              onClick={() => setCalendarView('week')}
              className={`px-3 py-1.5 rounded-xl transition-all ${calendarView === 'week' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
            >
              Week
            </button>
            <button
              onClick={() => setCalendarView('day')}
              className={`px-3 py-1.5 rounded-xl transition-all ${calendarView === 'day' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
            >
              Day
            </button>
            <button
              onClick={() => setCalendarView('schedule')}
              className={`px-3 py-1.5 rounded-xl transition-all ${calendarView === 'schedule' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}
            >
              Planner
            </button>
          </div>

          <button
            onClick={() => handleOpenAddEvent(formatDateString(new Date()))}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold transition-all shadow-md hover:shadow-indigo-500/10 active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" /> Schedule Session
          </button>
        </div>
      </section>

      {/* Main Calendar Frame */}
      <section className="glass-panel border border-slate-200/50 dark:border-white/5 p-6 rounded-3xl shadow-sm min-h-[500px] flex flex-col justify-between" id="calendar-core-frame">
        {/* Navigation header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-200/30 dark:border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrev}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl border border-slate-200/40 dark:border-white/5 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-display min-w-[150px] text-center">
              {calendarView === 'month' && currentDate.toLocaleString('default', { month: 'long', year: 'numeric' })}
              {calendarView === 'week' && `Week of ${getDaysInWeek(currentDate)[0].toLocaleDateString('default', { month: 'short', day: 'numeric' })}`}
              {calendarView === 'day' && currentDate.toLocaleDateString('default', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              {calendarView === 'schedule' && 'Quiz Planner Agenda'}
            </h3>
            <button
              onClick={handleNext}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl border border-slate-200/40 dark:border-white/5 text-slate-600 dark:text-slate-300 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-3.5 py-1.5 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl border border-slate-200/40 dark:border-white/5 text-xs font-bold text-slate-600 dark:text-slate-300 transition-all"
            >
              Today
            </button>
            <button
              onClick={requestNotificationPermission}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl border border-slate-200/40 dark:border-white/5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              title="Configure Reminders Permission"
            >
              <Bell className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportSchedule}
              className="p-2 hover:bg-slate-100 dark:hover:bg-white/5 rounded-xl border border-slate-200/40 dark:border-white/5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
              title="Export Schedule JSON"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Render Views */}
        <div className="flex-1 min-h-0 pt-6">
          {calendarView === 'month' && (
            <div className="grid grid-cols-7 gap-2 h-full text-center">
              {/* Day Headers */}
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
                <div key={i} className="text-xs font-extrabold text-slate-600 dark:text-slate-400 uppercase tracking-wider pb-2">
                  {d}
                </div>
              ))}
              
              {/* Grid Cells */}
              {getDaysInMonth(currentDate).map((day, idx) => {
                const dateStr = formatDateString(day);
                const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                const isToday = formatDateString(new Date()) === dateStr;
                const cellEvents = getDayElementEvents(dateStr);

                return (
                  <div
                    key={idx}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, dateStr)}
                    onDoubleClick={() => handleOpenAddEvent(dateStr)}
                    className={`min-h-[90px] rounded-2xl border p-2 flex flex-col justify-between transition-all group cursor-pointer relative ${
                      isToday 
                        ? 'bg-indigo-500/5 dark:bg-indigo-500/10 border-indigo-500/40 dark:border-indigo-500/30' 
                        : isCurrentMonth 
                        ? 'bg-white/20 dark:bg-[#0f1422]/20 border-slate-200/30 dark:border-white/5 hover:border-slate-300 dark:hover:border-white/10' 
                        : 'bg-slate-100/10 dark:bg-slate-900/10 border-transparent opacity-40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold ${isToday ? 'bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center' : 'text-slate-700 dark:text-slate-300'}`}>
                        {day.getDate()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenAddEvent(dateStr);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 bg-slate-100 dark:bg-white/5 hover:bg-indigo-500 hover:text-white rounded-lg text-slate-500 transition-all"
                        title="Add quiz to this date"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex-1 flex flex-col gap-1.5 mt-2 overflow-y-auto max-h-[80px] pr-1">
                      {cellEvents.map(event => (
                        <div
                          key={event.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, event.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenEditEvent(event);
                          }}
                          className={`px-2 py-1 rounded-xl text-[10px] font-bold border transition-all truncate shadow-sm hover:scale-[1.02] active:scale-[0.98] cursor-grab active:cursor-grabbing ${getColorClasses(event.color)}`}
                          title={`${event.title} (${event.time || ''})`}
                        >
                          {event.time && <span className="opacity-85 mr-1 font-mono">{event.time}</span>}
                          {event.title}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {calendarView === 'week' && (
            <div className="grid grid-cols-7 gap-3 h-full">
              {getDaysInWeek(currentDate).map((day, idx) => {
                const dateStr = formatDateString(day);
                const isToday = formatDateString(new Date()) === dateStr;
                const cellEvents = getDayElementEvents(dateStr);

                return (
                  <div
                    key={idx}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleDrop(e, dateStr)}
                    className={`min-h-[350px] rounded-2xl border p-3 flex flex-col bg-white/20 dark:bg-[#0f1422]/20 transition-all ${
                      isToday 
                        ? 'border-indigo-500/40 dark:border-indigo-500/30 bg-indigo-500/5 dark:bg-indigo-500/10' 
                        : 'border-slate-200/30 dark:border-white/5'
                    }`}
                  >
                    <div className="pb-3 border-b border-slate-200/30 dark:border-white/5 flex flex-col items-center gap-1">
                      <span className="text-[10px] font-extrabold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {day.toLocaleString('default', { weekday: 'short' })}
                      </span>
                      <span className={`text-sm font-extrabold w-6 h-6 rounded-full flex items-center justify-center ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                        {day.getDate()}
                      </span>
                    </div>

                    <div className="flex-1 flex flex-col gap-2.5 mt-3 overflow-y-auto">
                      {cellEvents.map(event => (
                        <div
                          key={event.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, event.id)}
                          onClick={() => handleOpenEditEvent(event)}
                          className={`p-2.5 rounded-2xl border text-xs font-bold flex flex-col gap-1 cursor-grab active:cursor-grabbing hover:shadow-md transition-all ${getColorClasses(event.color)}`}
                        >
                          <div className="flex items-center justify-between text-[10px] opacity-80 font-mono">
                            <span>{event.time || 'All Day'}</span>
                            <span>{event.estimatedMinutes}m</span>
                          </div>
                          <span className="font-extrabold leading-tight text-slate-800 dark:text-slate-200 truncate">{event.title}</span>
                          <span className="text-[9px] opacity-75 font-medium">{event.subject}</span>
                        </div>
                      ))}

                      <button
                        onClick={() => handleOpenAddEvent(dateStr)}
                        className="w-full py-2 border border-dashed border-slate-300 dark:border-white/10 hover:border-indigo-400 rounded-xl text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 flex items-center justify-center gap-1 text-[11px] font-bold mt-auto bg-white/10 hover:bg-indigo-500/5 transition-all"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {calendarView === 'day' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-slate-500/5 dark:bg-white/5 border border-slate-200/40 dark:border-white/5 rounded-2xl flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">Daily Schedule Detail</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">Manage study events for this specific date.</p>
                </div>
                <button
                  onClick={() => handleOpenAddEvent(formatDateString(currentDate))}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  <Plus className="w-4 h-4" /> Add Event
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {getDayElementEvents(formatDateString(currentDate)).length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center opacity-60">
                    <CalendarIcon className="w-10 h-10 text-slate-600 dark:text-slate-400 mb-3" />
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No events scheduled for today.</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">Double click or click the schedule button to add your first quiz task!</p>
                  </div>
                ) : (
                  getDayElementEvents(formatDateString(currentDate)).map(event => (
                    <div
                      key={event.id}
                      className={`p-4 rounded-3xl border flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all shadow-sm hover:shadow-md ${getColorClasses(event.color)}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/20 dark:bg-black/10 rounded-2xl">
                          <BookOpen className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100">{event.title}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              event.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                              event.status === 'Overdue' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                              'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                            }`}>
                              {event.status}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300 mt-1 font-medium">
                            <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> {event.time || '09:00'}</span>
                            <span>•</span>
                            <span>{event.estimatedMinutes} minutes</span>
                            <span>•</span>
                            <span>{event.subject}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0">
                        {event.quizId ? (
                          <button
                            onClick={() => {
                              const quiz = quizzes.find(q => q.id === event.quizId);
                              if (quiz) onStartQuiz(quiz);
                            }}
                            className="flex-1 md:flex-initial px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all text-center"
                          >
                            Start Quiz
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenEditEvent(event)}
                            className="flex-1 md:flex-initial px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-xs font-bold shadow-sm transition-all text-center"
                          >
                            Attach PDF & Generate Quiz
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenEditEvent(event)}
                          className="px-3 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl border border-slate-200/40 dark:border-white/5 text-xs font-bold text-slate-600 dark:text-slate-300 transition-all"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {calendarView === 'schedule' && (
            <div className="flex flex-col gap-4">
              <div className="p-4 bg-indigo-500/5 dark:bg-indigo-500/10 border border-indigo-500/10 rounded-3xl flex items-center justify-between">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-800 dark:text-slate-100">Study Planner Agenda</h4>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">Unified checklist of all active study tasks & upcoming examinations.</p>
                </div>
                <button
                  onClick={handleExportSchedule}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition-all"
                >
                  <Printer className="w-4 h-4" /> Export Planner
                </button>
              </div>

              <div className="flex flex-col gap-3">
                {filteredEvents.length === 0 ? (
                  <div className="py-12 flex flex-col items-center justify-center text-center opacity-60">
                    <ListTodo className="w-10 h-10 text-slate-600 dark:text-slate-400 mb-3" />
                    <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No scheduled study events match your filters.</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">Try resetting the filters or create a new schedule!</p>
                  </div>
                ) : (
                  filteredEvents.map(event => (
                    <div
                      key={event.id}
                      className="glass-card bg-white/40 dark:bg-[#0f1422]/40 border border-slate-200/40 dark:border-white/5 p-5 rounded-3xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 transition-all shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-start gap-4 flex-1 min-w-0">
                        <div className={`p-3 rounded-2xl border ${getColorClasses(event.color)} flex-shrink-0`}>
                          <FileText className="w-5 h-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-extrabold text-sm text-slate-800 dark:text-slate-100 truncate">{event.title}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              event.status === 'Completed' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' :
                              event.status === 'Overdue' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                              'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                            }`}>
                              {event.status}
                            </span>
                          </div>
                          
                          {event.notes && (
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                              {event.notes}
                            </p>
                          )}

                          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 dark:text-slate-300 mt-2 font-medium">
                            <span className="bg-slate-200/55 dark:bg-white/5 px-2.5 py-1 rounded-xl text-[10px] font-bold uppercase text-indigo-650 dark:text-indigo-400">{event.subject}</span>
                            <span>•</span>
                            <span className="font-mono">{event.date}</span>
                            {event.time && (
                              <>
                                <span>•</span>
                                <span className="font-mono">{event.time}</span>
                              </>
                            )}
                            <span>•</span>
                            <span>{event.estimatedMinutes} minutes estimate</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto border-t md:border-t-0 pt-3 md:pt-0">
                        <a
                          href={getGoogleCalendarUrl(event)}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl border border-slate-200/40 dark:border-white/5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center gap-1 text-[11px] font-bold"
                          title="Export event to Google Calendar"
                        >
                          <ExternalLink className="w-3.5 h-3.5" /> Sync
                        </a>
                        
                        <button
                          onClick={() => handleDuplicateEvent(event)}
                          className="p-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl border border-slate-200/40 dark:border-white/5 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors flex items-center justify-center"
                          title="Duplicate schedule task"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleOpenEditEvent(event)}
                          className="px-3.5 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-xl border border-slate-200/40 dark:border-white/5 text-xs font-bold text-slate-600 dark:text-slate-300 transition-all flex-1 md:flex-initial"
                        >
                          Edit
                        </button>

                        {event.quizId ? (
                          <button
                            onClick={() => {
                              const q = quizzes.find(quizItem => quizItem.id === event.quizId);
                              if (q) onStartQuiz(q);
                            }}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex-1 md:flex-initial"
                          >
                            Start Quiz
                          </button>
                        ) : (
                          <button
                            onClick={() => handleOpenEditEvent(event)}
                            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-xs font-bold shadow-sm transition-all flex-1 md:flex-initial"
                          >
                            Configure AI Quiz
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Scheduler Event Details and Creation Modal */}
      {isEventModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 dark:bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4 overflow-y-auto">
          <div className="glass-card bg-white dark:bg-[#0b0f19] border border-slate-200/80 dark:border-white/10 max-w-2xl w-full rounded-3xl shadow-2xl p-6 md:p-8 animate-fadeIn max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200/30 dark:border-white/5 pb-4 mb-6">
              <h4 className="text-lg font-bold text-slate-800 dark:text-slate-100 font-display">
                {selectedEvent ? 'Modify Study Session Schedule' : 'Schedule AI Quiz Study Task'}
              </h4>
              <button
                onClick={() => setIsEventModalOpen(false)}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 text-sm font-bold bg-slate-100 dark:bg-white/5 p-1.5 rounded-xl border border-slate-200/40 dark:border-white/5"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSaveEvent} className="space-y-6">
              {/* Event Title */}
              <div>
                <label className="block text-xs font-bold text-slate-650 dark:text-slate-300 uppercase tracking-wider mb-2">Study Event Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Engineering Mathematics Midterm Prep"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* Subject & Color mapping */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-650 dark:text-slate-300 uppercase tracking-wider mb-2">Academic Subject</label>
                  <select
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  >
                    {subjects.map(sub => (
                      <option key={sub.name} value={sub.name}>{sub.name}</option>
                    ))}
                  </select>
                </div>

                {/* Color-Code visual theme representation */}
                <div>
                  <label className="block text-xs font-bold text-slate-650 dark:text-slate-300 uppercase tracking-wider mb-2">Color Label Group</label>
                  <div className="flex items-center gap-2.5 py-1.5">
                    {['indigo', 'emerald', 'amber', 'rose', 'purple', 'sky', 'slate'].map(color => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormColor(color)}
                        className={`w-6 h-6 rounded-full border-2 transition-transform duration-200 ${
                          formColor === color ? 'border-indigo-600 scale-110 shadow-sm' : 'border-transparent hover:scale-105'
                        } ${
                          color === 'indigo' ? 'bg-indigo-500' :
                          color === 'emerald' ? 'bg-emerald-500' :
                          color === 'amber' ? 'bg-amber-500' :
                          color === 'rose' ? 'bg-rose-500' :
                          color === 'purple' ? 'bg-purple-500' :
                          color === 'sky' ? 'bg-sky-500' :
                          'bg-slate-500'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Date, Time & Estimated Minutes */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-650 dark:text-slate-300 uppercase tracking-wider mb-2">Target Date</label>
                  <input
                    type="date"
                    required
                    value={selectedDateStr}
                    onChange={(e) => setSelectedDateStr(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-650 dark:text-slate-300 uppercase tracking-wider mb-2">Target Time</label>
                  <input
                    type="time"
                    required
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-650 dark:text-slate-300 uppercase tracking-wider mb-2">Duration (Minutes)</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={formMinutes}
                    onChange={(e) => setFormMinutes(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* Reminders & Recurrence */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-650 dark:text-slate-300 uppercase tracking-wider mb-2">Reminder settings</label>
                  <select
                    value={formReminder}
                    onChange={(e) => setFormReminder(e.target.value as StudyEvent['reminderType'])}
                    className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                  >
                    <option value="none">No Reminder</option>
                    <option value="30min">30 minutes before</option>
                    <option value="1hour">1 hour before</option>
                    <option value="1day">1 day before</option>
                    <option value="custom">Custom reminder</option>
                  </select>

                  {formReminder === 'custom' && (
                    <input
                      type="number"
                      placeholder="Minutes before event"
                      value={formCustomReminder}
                      onChange={(e) => setFormCustomReminder(Number(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 mt-2"
                    />
                  )}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2.5 pt-1.5">
                    <span className="text-xs font-bold text-slate-650 dark:text-slate-300 uppercase tracking-wider">Recurring Study Sessions</span>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formIsRecurring}
                        onChange={(e) => setFormIsRecurring(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-slate-200 dark:bg-slate-750 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-650"></div>
                    </label>
                  </div>

                  {formIsRecurring && (
                    <select
                      value={formRecurrence}
                      onChange={(e) => setFormRecurrence(e.target.value as 'daily' | 'weekly' | 'monthly')}
                      className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                    >
                      <option value="daily">Every Day</option>
                      <option value="weekly">Every Week</option>
                      <option value="monthly">Every Month</option>
                    </select>
                  )}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-650 dark:text-slate-300 uppercase tracking-wider mb-2">Study Notes / Syllabus Details</label>
                <textarea
                  placeholder="Enter specific formulas, reference links, textbook sections, or details."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  className="w-full px-4 py-3 bg-slate-100 dark:bg-white/5 border border-slate-200/80 dark:border-white/10 rounded-2xl text-xs font-bold focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-100"
                />
              </div>

              {/* PDF Document Upload and Autogeneration Section */}
              <div className="p-5 bg-slate-500/5 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 rounded-3xl space-y-4">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  <h5 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-indigo-300">
                    Generate Quiz Automatically from PDF Reference
                  </h5>
                </div>

                {!modalFile && !generatedQuizData ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-300 dark:border-white/15 hover:border-indigo-400 p-6 rounded-2xl flex flex-col items-center justify-center cursor-pointer bg-white/20 dark:bg-black/10 hover:bg-indigo-500/5 transition-all text-center"
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf"
                      onChange={modalFileChange => handleModalFileChange(modalFileChange)}
                      className="hidden"
                    />
                    <Upload className="w-8 h-8 text-slate-500 mb-2" />
                    <p className="text-xs font-extrabold text-slate-700 dark:text-slate-300">Upload PDF directly to schedule date</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">Accepts standard PDF documents</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3.5 bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 rounded-2xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="w-5 h-5 text-red-500" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">{modalFile ? modalFile.name : selectedEvent?.fileName}</p>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{modalTotalPages || 'Embedded'} pages detected</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setModalFile(null);
                          setGeneratedQuizData(null);
                        }}
                        className="text-[10px] text-red-500 hover:underline font-bold"
                      >
                        Remove
                      </button>
                    </div>

                    {!generatedQuizData && (
                      <div className="grid grid-cols-2 gap-3 p-3 bg-white/25 dark:bg-black/15 border border-slate-200/30 dark:border-white/5 rounded-2xl text-xs font-bold">
                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Number of Questions</label>
                          <select
                            value={modalNumQuestions}
                            onChange={(e) => setModalNumQuestions(Number(e.target.value))}
                            className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 p-2 rounded-xl"
                          >
                            <option value={5}>5 Questions</option>
                            <option value={10}>10 Questions</option>
                            <option value={20}>20 Questions</option>
                            <option value={30}>30 Questions</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[10px] text-slate-500 mb-1">Difficulty level</label>
                          <select
                            value={modalDifficulty}
                            onChange={(e) => setModalDifficulty(e.target.value as QuizConfig['difficulty'])}
                            className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/10 p-2 rounded-xl"
                          >
                            <option value="Easy">Easy</option>
                            <option value="Medium">Medium</option>
                            <option value="Hard">Hard</option>
                            <option value="Mixed">Mixed</option>
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={handleGenerateModalQuiz}
                          disabled={isGeneratingQuiz}
                          className="col-span-2 mt-2 w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex items-center justify-center gap-1.5 shadow-sm active:scale-[0.98] transition-all disabled:opacity-50 text-xs font-extrabold"
                        >
                          {isGeneratingQuiz ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Generating ({generationPercent}%)</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4 animate-pulse" />
                              <span>Generate Study Quiz</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {generationProgress && (
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 animate-pulse font-bold">{generationProgress}</p>
                    )}

                    {generatedQuizData && (
                      <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center gap-2 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                        <span>Linked with Quiz containing {generatedQuizData.questions.length} questions.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-200/30 dark:border-white/5">
                {selectedEvent ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteEvent(selectedEvent.id)}
                    className="flex items-center gap-1 text-xs font-bold text-red-500 hover:text-red-650 bg-red-500/5 hover:bg-red-500/10 px-4 py-2 rounded-xl transition-all"
                  >
                    <Trash2 className="w-4 h-4" /> Delete Schedule
                  </button>
                ) : (
                  <div />
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEventModalOpen(false)}
                    className="px-5 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-white/5 transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-extrabold shadow-md active:scale-[0.98] transition-all"
                  >
                    Save Study Session
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
