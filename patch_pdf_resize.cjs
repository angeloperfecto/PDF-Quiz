const fs = require('fs');
const file = 'src/components/PDFViewer.tsx';
let code = fs.readFileSync(file, 'utf8');

const targetEffect = `  // Render the current page on canvas
  useEffect(() => {
    if (!pdfDoc) return;`;

const resizeEffect = `  const [containerWidth, setContainerWidth] = useState<number>(0);

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
    if (!pdfDoc) return;`;

code = code.replace(targetEffect, resizeEffect);

const targetWidth = `const containerWidth = containerRef.current?.clientWidth || 600;`;
const newWidth = `const cw = containerWidth || containerRef.current?.clientWidth || 600;`;
code = code.replace(targetWidth, newWidth);

const targetWidth2 = `const widthScale = (containerWidth - 32) / unscaledViewport.width;`;
const newWidth2 = `const widthScale = (cw - 32) / unscaledViewport.width;`;
code = code.replace(targetWidth2, newWidth2);

// also need to add containerWidth as dependency to the render useEffect
const targetDep = `  }, [currentPage, pdfDoc, scale]);`;
const newDep = `  }, [currentPage, pdfDoc, scale, containerWidth]);`;
code = code.replace(targetDep, newDep);

fs.writeFileSync(file, code);
console.log("PDF resize patched successfully");
