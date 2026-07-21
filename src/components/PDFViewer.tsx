import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, Search, RotateCcw, Highlighter, Info } from 'lucide-react';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString();

interface PDFViewerProps {
  pdfFile: File | null;
  initialPage?: number;
  highlightText?: string; // Text to highlight or show reference for
}

export default function PDFViewer({ pdfFile, initialPage = 1, highlightText }: PDFViewerProps) {
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(initialPage);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [currentResultIndex, setCurrentResultIndex] = useState<number>(-1);
  const [loading, setLoading] = useState<boolean>(false);
  const [extractedTexts, setExtractedTexts] = useState<string[]>([]); // Saved text per page for search

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const renderTaskRef = useRef<any>(null);

  // Load PDF document
  useEffect(() => {
    if (!pdfFile) return;

    const loadPDF = async () => {
      setLoading(true);
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(Math.min(initialPage, pdf.numPages));

        // Pre-extract text for search
        const texts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const textContent = await page.getTextContent();
          const text = textContent.items.map((item: any) => item.str).join(' ');
          texts.push(text);
        }
        setExtractedTexts(texts);
      } catch (err) {
        console.error('Error loading PDF in viewer:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPDF();
  }, [pdfFile]);

  // Jump to page if initialPage changes from props (e.g. from a quiz reference)
  useEffect(() => {
    if (pdfDoc && initialPage > 0 && initialPage <= totalPages) {
      setCurrentPage(initialPage);
    }
  }, [initialPage, pdfDoc, totalPages]);

  const [containerWidth, setContainerWidth] = useState<number>(0);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (let entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Render the current page on canvas
  useEffect(() => {
    if (!pdfDoc) return;

    const renderPage = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      try {
        // Cancel previous render task if active
        if (renderTaskRef.current) {
          renderTaskRef.current.cancel();
        }

        const page = await pdfDoc.getPage(currentPage);
        
        // Match width of parent container for responsive scale
        const cw = containerWidth || containerRef.current?.clientWidth || 600;
        const unscaledViewport = page.getViewport({ scale: 1.0 });
        const widthScale = (cw - 32) / unscaledViewport.width;
        
        const viewport = page.getViewport({ scale: widthScale * scale });
        const context = canvas.getContext('2d');

        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;

          const renderContext = {
            canvasContext: context,
            viewport: viewport,
          };

          const renderTask = page.render(renderContext);
          renderTaskRef.current = renderTask;
          await renderTask.promise;
          renderTaskRef.current = null;
        }
      } catch (err: any) {
        if (err.name !== 'RenderingCancelledException') {
          console.error('Error rendering page:', err);
        }
      }
    };

    renderPage();
  }, [pdfDoc, currentPage, scale]);

  // Handle local searching across extracted pages
  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentResultIndex(-1);
      return;
    }

    const results: { page: number; text: string }[] = [];
    extractedTexts.forEach((text, index) => {
      if (text.toLowerCase().includes(query.toLowerCase())) {
        // Find small snippet around the match
        const idx = text.toLowerCase().indexOf(query.toLowerCase());
        const start = Math.max(0, idx - 40);
        const end = Math.min(text.length, idx + query.length + 40);
        const snippet = (start > 0 ? '...' : '') + text.substring(start, end).trim() + (end < text.length ? '...' : '');
        
        results.push({
          page: index + 1,
          text: snippet,
        });
      }
    });

    setSearchResults(results);
    if (results.length > 0) {
      setCurrentResultIndex(0);
      setCurrentPage(results[0].page);
    } else {
      setCurrentResultIndex(-1);
    }
  };

  const navigateSearchMatch = (direction: 'next' | 'prev') => {
    if (searchResults.length === 0) return;
    let nextIdx = currentResultIndex;
    if (direction === 'next') {
      nextIdx = (currentResultIndex + 1) % searchResults.length;
    } else {
      nextIdx = (currentResultIndex - 1 + searchResults.length) % searchResults.length;
    }
    setCurrentResultIndex(nextIdx);
    setCurrentPage(searchResults[nextIdx].page);
  };

  return (
    <div className="flex flex-col h-full glass-panel border border-slate-200/50 dark:border-white/5 rounded-3xl overflow-hidden shadow-sm" id="pdf-viewer-root">
      {/* Search and Toolbar */}
      <div className="bg-white/45 dark:bg-[#0f172a]/45 backdrop-blur-md border-b border-slate-200/30 dark:border-white/5 p-4 space-y-3 flex-shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Page navigation */}
          <div className="flex items-center gap-2 bg-white/30 dark:bg-white/5 border border-slate-200/40 dark:border-white/5 px-2 py-1.5 rounded-xl">
            <button
              id="pdf-prev-page"
              disabled={currentPage <= 1 || loading}
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 min-w-16 text-center">
              Page {currentPage} / {totalPages || '?'}
            </span>
            <button
              id="pdf-next-page"
              disabled={currentPage >= totalPages || loading}
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500 disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1.5 bg-white/30 dark:bg-white/5 border border-slate-200/40 dark:border-white/5 px-1.5 py-1.5 rounded-xl">
            <button
              id="pdf-zoom-out"
              onClick={() => setScale(prev => Math.max(0.5, prev - 0.2))}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 min-w-12 text-center">
              {Math.round(scale * 100)}%
            </span>
            <button
              id="pdf-zoom-in"
              onClick={() => setScale(prev => Math.min(2.5, prev + 0.2))}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-500"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              id="pdf-zoom-reset"
              onClick={() => setScale(1.0)}
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-600"
              title="Reset Zoom"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Local text search bar */}
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="Search words in document..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full bg-white/40 dark:bg-white/5 border border-slate-300 dark:border-white/5 rounded-xl pl-9 pr-24 py-2 text-sm focus:ring-2 focus:ring-indigo-500/50 outline-none text-slate-900 dark:text-slate-100 placeholder-slate-500 dark:placeholder-slate-400"
          />
          {searchResults.length > 0 && (
            <div className="absolute inset-y-0 right-2 flex items-center gap-1.5">
              <span className="text-xs text-slate-500 dark:text-slate-400 mr-1.5">
                {currentResultIndex + 1}/{searchResults.length}
              </span>
              <button
                onClick={() => navigateSearchMatch('prev')}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-500"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => navigateSearchMatch('next')}
                className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-500"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* active quiz highlights reference panel */}
      {highlightText && (
        <div className="bg-indigo-500/10 dark:bg-indigo-950/30 border-b border-indigo-500/20 dark:border-indigo-500/10 p-4 flex items-start gap-2.5 flex-shrink-0 animate-fade-in backdrop-blur-md" id="pdf-highlight-panel">
          <div className="p-1 bg-indigo-500/20 dark:bg-indigo-950/60 rounded text-indigo-600 dark:text-indigo-400">
            <Highlighter className="w-4 h-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-indigo-800 dark:text-indigo-400 uppercase tracking-wider mb-1 flex items-center gap-1 font-display">
              <Info className="w-3 h-3" /> Factual Source Reference
            </p>
            <p className="text-xs text-indigo-950 dark:text-slate-200 italic font-medium leading-relaxed max-h-16 overflow-y-auto pr-1">
              &ldquo;{highlightText}&rdquo;
            </p>
          </div>
        </div>
      )}

      {/* PDF canvas view container */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex justify-center items-start bg-slate-100/30 dark:bg-slate-900/20"
        id="pdf-canvas-container"
      >
        {loading ? (
          <div className="flex flex-col items-center justify-center h-48 py-12">
            <div className="w-8 h-8 border-2 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm text-slate-705 dark:text-slate-300 font-medium">Extracting PDF layout...</p>
          </div>
        ) : (
          <div className="shadow-lg border border-slate-200/40 dark:border-white/10 rounded-2xl overflow-hidden bg-white dark:bg-slate-950 relative">
            <canvas ref={canvasRef} className="block" />
          </div>
        )}
      </div>
    </div>
  );
}
