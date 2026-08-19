import { useRef, useState, useEffect } from 'react';
import { X, Check, EyeOff, Loader2 } from 'lucide-react';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function ImageAnnotator({
  file,
  onComplete,
  onCancel,
}: {
  file: File;
  onComplete: (fileData: { name: string, data: string, mimeType: 'image/png' | 'image/jpeg', preview: string }) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [rects, setRects] = useState<Rect[]>([]);
  const [currentRect, setCurrentRect] = useState<Rect | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load image
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setImage(img);
      setLoading(false);
    };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Draw canvas
  useEffect(() => {
    if (!image || !canvasRef.current || !containerRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Scale canvas to fit container
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;

    const scale = Math.min(containerWidth / image.width, containerHeight / image.height);
    const w = image.width * scale;
    const h = image.height * scale;

    canvas.width = w;
    canvas.height = h;

    ctx.drawImage(image, 0, 0, w, h);

    // Keep selected areas visible until the operator confirms redaction.
    rects.forEach((r) => {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.18)';
      ctx.fillRect(r.x, r.y, r.w, r.h);
    });

    // Draw current rect (red outline)
    if (currentRect) {
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
      ctx.fillStyle = 'rgba(239, 68, 68, 0.2)';
      ctx.fillRect(currentRect.x, currentRect.y, currentRect.w, currentRect.h);
    }
  }, [image, rects, currentRect]);

  const getCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const handleStart = (clientX: number, clientY: number) => {
    setIsDrawing(true);
    const { x, y } = getCoordinates(clientX, clientY);
    setCurrentRect({ x, y, w: 0, h: 0 });
  };

  const handleMove = (clientX: number, clientY: number) => {
    if (!isDrawing || !currentRect) return;
    const { x, y } = getCoordinates(clientX, clientY);
    setCurrentRect((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        w: x - prev.x,
        h: y - prev.y
      };
    });
  };

  const handleEnd = () => {
    if (!isDrawing || !currentRect) return;
    setIsDrawing(false);
    
    // Normalize rect (handle negative width/height)
    let { x, y, w, h } = currentRect;
    if (w < 0) { x += w; w = Math.abs(w); }
    if (h < 0) { y += h; h = Math.abs(h); }

    if (w > 5 && h > 5) {
      setRects([...rects, { x, y, w, h }]);
    }
    setCurrentRect(null);
  };

  const handleRedact = () => {
    if (!image) return;
    let mime = file.type as any;
    if (mime !== 'image/png' && mime !== 'image/jpeg') mime = 'image/jpeg';

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = image.width;
    exportCanvas.height = image.height;
    const exportContext = exportCanvas.getContext('2d');
    if (!exportContext || !canvasRef.current) return;

    exportContext.drawImage(image, 0, 0);
    const xScale = image.width / canvasRef.current.width;
    const yScale = image.height / canvasRef.current.height;
    exportContext.fillStyle = '#000000';
    rects.forEach((rect) => {
      exportContext.fillRect(rect.x * xScale, rect.y * yScale, rect.w * xScale, rect.h * yScale);
    });
    const dataUrl = exportCanvas.toDataURL(mime, 0.8);
    const [prefix, data] = dataUrl.split(',');
    
    onComplete({
      name: file.name,
      data,
      mimeType: mime,
      preview: dataUrl
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <button onClick={onCancel} className="p-2 -ml-2 text-muted-foreground hover:text-foreground">
          <X className="w-5 h-5" />
        </button>
          <span className="font-medium text-sm">Protect your photo</span>
        <div className="w-9" />
      </div>

      <div 
        ref={containerRef} 
        className="flex-1 overflow-hidden relative flex items-center justify-center bg-card p-4 touch-none"
      >
        {loading && <Loader2 className="w-8 h-8 animate-spin text-muted-foreground absolute" />}
        <canvas
          ref={canvasRef}
          className="max-w-full max-h-full shadow-xl"
          onMouseDown={(e) => handleStart(e.clientX, e.clientY)}
          onMouseMove={(e) => handleMove(e.clientX, e.clientY)}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={(e) => handleStart(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchMove={(e) => handleMove(e.touches[0].clientX, e.touches[0].clientY)}
          onTouchEnd={handleEnd}
          onTouchCancel={handleEnd}
        />
      </div>

      <div className="p-4 bg-background border-t border-border flex flex-col gap-3">
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground mb-1">
          <EyeOff className="w-4 h-4" />
          <span>Draw red boxes over anything confidential</span>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => setRects([])}
            disabled={rects.length === 0}
            className="flex-1 py-3 px-4 rounded-xl border border-border text-sm font-medium disabled:opacity-50 hover:bg-muted transition-colors"
          >
            Clear
          </button>
          <button 
            onClick={handleRedact}
            className="flex-1 py-3 px-4 rounded-xl bg-primary text-primary-foreground text-sm font-medium flex items-center justify-center gap-2 active:opacity-80 transition-opacity"
          >
            <Check className="w-4 h-4" />
            Hide selected area
          </button>
        </div>
      </div>
    </div>
  );
}
