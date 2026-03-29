import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useLayoutEffect,
} from 'react';
import { v4 as uuid } from 'uuid';
import {
  CanvasElement,
  Stroke,
  ShapeElement,
  TextElement,
  Tool,
  ShapeType,
  Point,
  PageData,
} from '../types';
import { Toolbar } from './Toolbar';
import { exportPageAsPDF } from '../lib/pdfExport';

// ─── Constants ───────────────────────────────────────────────────────────────

/** Virtual page size — all stored coords are in this space */
const PAGE_W = 1000;
const PAGE_H = 1414; // ~A4 portrait ratio

const RULED_LINE_SPACING = 36; // px in virtual space
const RULED_LINE_COLOR = '#c8d6e5';
const RULED_MARGIN_COLOR = '#f9a8a8';
const RULED_MARGIN_X = 80;

const HIGHLIGHTER_ALPHA = 0.35;
const ERASER_RADIUS = 20; // virtual px

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toVirtual = (
  clientX: number,
  clientY: number,
  rect: DOMRect
): { x: number; y: number } => ({
  x: ((clientX - rect.left) / rect.width) * PAGE_W,
  y: ((clientY - rect.top) / rect.height) * PAGE_H,
});

const getPointerPoint = (
  e: React.PointerEvent<HTMLCanvasElement>,
  rect: DOMRect
): Point => {
  const { x, y } = toVirtual(e.clientX, e.clientY, rect);
  return { x, y, pressure: e.pressure > 0 ? e.pressure : 0.5 };
};

const dist = (ax: number, ay: number, bx: number, by: number) =>
  Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);

const pointInPolygon = (px: number, py: number, poly: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
};

const strokeInLasso = (stroke: Stroke, lasso: Point[]): boolean =>
  stroke.points.some((p) => pointInPolygon(p.x, p.y, lasso));

// ─── Rendering ───────────────────────────────────────────────────────────────

const scaleX = (x: number, canvas: HTMLCanvasElement) =>
  (x / PAGE_W) * canvas.width;
const scaleY = (y: number, canvas: HTMLCanvasElement) =>
  (y / PAGE_H) * canvas.height;

const drawRuledLines = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
  const scX = w / PAGE_W;
  const scY = h / PAGE_H;
  ctx.save();
  ctx.lineWidth = 0.8;

  // Horizontal rules
  ctx.strokeStyle = RULED_LINE_COLOR;
  for (let y = RULED_LINE_SPACING * 2; y < PAGE_H; y += RULED_LINE_SPACING) {
    ctx.beginPath();
    ctx.moveTo(0, y * scY);
    ctx.lineTo(w, y * scY);
    ctx.stroke();
  }

  // Left margin line
  ctx.strokeStyle = RULED_MARGIN_COLOR;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(RULED_MARGIN_X * scX, 0);
  ctx.lineTo(RULED_MARGIN_X * scX, h);
  ctx.stroke();

  ctx.restore();
};

const renderStroke = (
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  canvas: HTMLCanvasElement,
  selected = false
) => {
  const pts = stroke.points;
  if (pts.length === 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'highlighter') {
    ctx.globalAlpha = HIGHLIGHTER_ALPHA;
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = scaleX(stroke.width * 6, canvas);
  } else {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = selected ? '#2563eb' : stroke.color;
    ctx.lineWidth = scaleX(stroke.width, canvas);
  }

  ctx.beginPath();
  ctx.moveTo(scaleX(pts[0].x, canvas), scaleY(pts[0].y, canvas));

  if (pts.length === 1) {
    // Single dot
    ctx.arc(scaleX(pts[0].x, canvas), scaleY(pts[0].y, canvas), scaleX(stroke.width / 2, canvas), 0, Math.PI * 2);
    ctx.fill();
  } else {
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(
        scaleX(pts[i].x, canvas),
        scaleY(pts[i].y, canvas),
        scaleX(mx, canvas),
        scaleY(my, canvas)
      );
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(scaleX(last.x, canvas), scaleY(last.y, canvas));
    ctx.stroke();
  }

  ctx.restore();
};

const renderShape = (
  ctx: CanvasRenderingContext2D,
  el: ShapeElement,
  canvas: HTMLCanvasElement,
  selected = false
) => {
  const x1 = scaleX(Math.min(el.x1, el.x2), canvas);
  const y1 = scaleY(Math.min(el.y1, el.y2), canvas);
  const x2 = scaleX(Math.max(el.x1, el.x2), canvas);
  const y2 = scaleY(Math.max(el.y1, el.y2), canvas);
  const w = x2 - x1;
  const h = y2 - y1;

  ctx.save();
  ctx.strokeStyle = selected ? '#2563eb' : el.color;
  ctx.lineWidth = scaleX(el.strokeWidth, canvas);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  switch (el.shapeType) {
    case 'rectangle':
      ctx.strokeRect(x1, y1, w, h);
      break;
    case 'circle': {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = w / 2;
      const ry = h / 2;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      break;
    }
    case 'line':
      ctx.moveTo(scaleX(el.x1, canvas), scaleY(el.y1, canvas));
      ctx.lineTo(scaleX(el.x2, canvas), scaleY(el.y2, canvas));
      ctx.stroke();
      break;
    case 'arrow': {
      const ax1 = scaleX(el.x1, canvas);
      const ay1 = scaleY(el.y1, canvas);
      const ax2 = scaleX(el.x2, canvas);
      const ay2 = scaleY(el.y2, canvas);
      const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
      const arrowLen = Math.max(12, scaleX(el.strokeWidth * 5, canvas));
      ctx.moveTo(ax1, ay1);
      ctx.lineTo(ax2, ay2);
      ctx.moveTo(ax2, ay2);
      ctx.lineTo(
        ax2 - arrowLen * Math.cos(angle - Math.PI / 6),
        ay2 - arrowLen * Math.sin(angle - Math.PI / 6)
      );
      ctx.moveTo(ax2, ay2);
      ctx.lineTo(
        ax2 - arrowLen * Math.cos(angle + Math.PI / 6),
        ay2 - arrowLen * Math.sin(angle + Math.PI / 6)
      );
      ctx.stroke();
      break;
    }
  }
  ctx.restore();
};

const renderText = (
  ctx: CanvasRenderingContext2D,
  el: TextElement,
  canvas: HTMLCanvasElement,
  selected = false
) => {
  ctx.save();
  const fs = scaleY(el.fontSize, canvas);
  ctx.font = `${fs}px -apple-system, sans-serif`;
  ctx.fillStyle = selected ? '#2563eb' : el.color;
  ctx.fillText(el.text, scaleX(el.x, canvas), scaleY(el.y, canvas));
  ctx.restore();
};

const renderElement = (
  ctx: CanvasRenderingContext2D,
  el: CanvasElement,
  canvas: HTMLCanvasElement,
  selected = false
) => {
  switch (el.elementType) {
    case 'stroke':
      renderStroke(ctx, el, canvas, selected);
      break;
    case 'shape':
      renderShape(ctx, el, canvas, selected);
      break;
    case 'text':
      renderText(ctx, el, canvas, selected);
      break;
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  pageData: PageData;
  notebookName: string;
  onSave: (elements: CanvasElement[], thumbnail: string) => void;
  onBack: () => void;
}

export const CanvasPage: React.FC<Props> = ({
  pageData,
  notebookName,
  onSave,
  onBack,
}) => {
  // ── Canvas refs
  const staticRef = useRef<HTMLCanvasElement>(null);
  const activeRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const activeCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const lastPointRef = useRef<Point | null>(null);
  const rafRef = useRef<number | null>(null);
  const cachedRectRef = useRef<DOMRect | null>(null);
  // Predicted points drawn speculatively — erased at start of next real frame
  const predictedPointsRef = useRef<Point[]>([]);

  // ── App state
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState('#1a1a1a');
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [shapeType, setShapeType] = useState<ShapeType>('rectangle');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Element history (undo/redo)
  const [history, setHistory] = useState<CanvasElement[][]>([pageData.elements]);
  const [histIdx, setHistIdx] = useState(0);
  const elements = history[histIdx];

  // ── Drawing state in refs (no re-renders during draw)
  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<Point[]>([]);
  const shapeStartRef = useRef<{ x: number; y: number } | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);

  // ── Text overlay state
  const [textPos, setTextPos] = useState<{ x: number; y: number } | null>(null);
  const [textValue, setTextValue] = useState('');
  const textInputRef = useRef<HTMLInputElement>(null);

  // ── Auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Canvas sizing ────────────────────────────────────────────────────────

  const resizeCanvases = useCallback(() => {
    const container = containerRef.current;
    const staticCanvas = staticRef.current;
    const activeCanvas = activeRef.current;
    if (!container || !staticCanvas || !activeCanvas) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = container.offsetWidth;
    const cssH = container.offsetHeight;

    for (const canvas of [staticCanvas, activeCanvas]) {
      canvas.width = cssW * dpr;
      canvas.height = cssH * dpr;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }

    // Invalidate cached rect after resize
    cachedRectRef.current = null;
  }, []);

  useLayoutEffect(() => {
    resizeCanvases();
    const ro = new ResizeObserver(resizeCanvases);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, [resizeCanvases]);

  // ─── Render static canvas ─────────────────────────────────────────────────

  const renderStatic = useCallback(() => {
    const canvas = staticRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // White background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Ruled lines
    drawRuledLines(ctx, canvas.width, canvas.height);

    // All elements
    for (const el of elements) {
      renderElement(ctx, el, canvas, selectedIds.has(el.id));
    }
  }, [elements, selectedIds]);

  useEffect(() => {
    renderStatic();
  }, [renderStatic]);

  // Cancel any pending RAF on unmount
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // ─── Auto-save ────────────────────────────────────────────────────────────

  const scheduleSave = useCallback(
    (els: CanvasElement[]) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const canvas = staticRef.current;
        if (!canvas) return;
        const thumbnail = canvas.toDataURL('image/jpeg', 0.3);
        onSave(els, thumbnail);
      }, 1500);
    },
    [onSave]
  );

  // ─── History helpers ──────────────────────────────────────────────────────

  const pushHistory = useCallback(
    (newElements: CanvasElement[]) => {
      setHistory((h) => {
        const trimmed = h.slice(0, histIdx + 1);
        return [...trimmed, newElements];
      });
      setHistIdx((i) => i + 1);
      scheduleSave(newElements);
    },
    [histIdx, scheduleSave]
  );

  const undo = useCallback(() => {
    if (histIdx > 0) {
      setHistIdx((i) => i - 1);
      scheduleSave(history[histIdx - 1]);
    }
  }, [histIdx, history, scheduleSave]);

  const redo = useCallback(() => {
    if (histIdx < history.length - 1) {
      setHistIdx((i) => i + 1);
      scheduleSave(history[histIdx + 1]);
    }
  }, [histIdx, history, scheduleSave]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'z' && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      if (
        (e.key === 'y' && (e.ctrlKey || e.metaKey)) ||
        (e.key === 'z' && (e.ctrlKey || e.metaKey) && e.shiftKey)
      ) {
        e.preventDefault();
        redo();
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        deleteSelected();
      }
      if (e.key === 'Escape') {
        setSelectedIds(new Set());
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [undo, redo, selectedIds]);

  // ─── Delete selected ──────────────────────────────────────────────────────

  const deleteSelected = useCallback(() => {
    if (selectedIds.size === 0) return;
    const newEls = elements.filter((el) => !selectedIds.has(el.id));
    setSelectedIds(new Set());
    pushHistory(newEls);
  }, [elements, selectedIds, pushHistory]);

  // ─── Active canvas clear ──────────────────────────────────────────────────

  const clearActive = () => {
    const c = activeRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    ctx?.clearRect(0, 0, c.width, c.height);
  };

  // ─── Pointer event helpers ────────────────────────────────────────────────

  const getRect = (): DOMRect => {
    if (!cachedRectRef.current) {
      cachedRectRef.current = activeRef.current!.getBoundingClientRect();
    }
    return cachedRectRef.current;
  };

  // ─── Pen / Highlighter drawing (incremental — never clears mid-stroke) ──────

  const beginActiveStroke = (pt: Point) => {
    const canvas = activeRef.current;
    if (!canvas) return;
    // desynchronized: true lets the GPU composite the canvas without waiting
    // for the main thread — cuts ~1 full frame of latency on iPad
    const ctx = canvas.getContext('2d', { desynchronized: true })!;
    activeCtxRef.current = ctx;
    predictedPointsRef.current = [];

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (tool === 'highlighter') {
      ctx.globalAlpha = HIGHLIGHTER_ALPHA;
      ctx.globalCompositeOperation = 'multiply';
      ctx.strokeStyle = color;
      ctx.lineWidth = scaleX(strokeWidth * 6, canvas);
    } else {
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = scaleX(strokeWidth, canvas);
    }

    // Draw initial dot so a tap always leaves a mark
    ctx.beginPath();
    ctx.arc(
      scaleX(pt.x, canvas),
      scaleY(pt.y, canvas),
      Math.max(1, scaleX(strokeWidth / 2, canvas)),
      0,
      Math.PI * 2
    );
    ctx.fillStyle = color;
    ctx.globalAlpha = tool === 'highlighter' ? HIGHLIGHTER_ALPHA : 1;
    ctx.fill();

    lastPointRef.current = pt;
  };

  const continueActiveStroke = (pt: Point) => {
    const canvas = activeRef.current;
    const ctx = activeCtxRef.current;
    const last = lastPointRef.current;
    if (!canvas || !ctx || !last) return;

    ctx.beginPath();
    ctx.moveTo(scaleX(last.x, canvas), scaleY(last.y, canvas));
    ctx.lineTo(scaleX(pt.x, canvas), scaleY(pt.y, canvas));
    ctx.stroke();

    lastPointRef.current = pt;
  };

  // Draw speculative predicted points in a slightly faded style.
  // They get cleared at the start of the next real coalesced batch.
  const drawPredictedPoints = (predicted: Point[]) => {
    const canvas = activeRef.current;
    const ctx = activeCtxRef.current;
    const last = lastPointRef.current;
    if (!canvas || !ctx || !last || predicted.length === 0) return;

    ctx.save();
    ctx.globalAlpha = (ctx.globalAlpha ?? 1) * 0.5;
    let prev = last;
    for (const pt of predicted) {
      ctx.beginPath();
      ctx.moveTo(scaleX(prev.x, canvas), scaleY(prev.y, canvas));
      ctx.lineTo(scaleX(pt.x, canvas), scaleY(pt.y, canvas));
      ctx.stroke();
      prev = pt;
    }
    ctx.restore();
    predictedPointsRef.current = predicted;
  };

  // Erase the previously drawn predicted segment by redrawing from the
  // last committed point to the first real coalesced point this frame.
  const clearPredicted = () => {
    const canvas = activeRef.current;
    const ctx = activeCtxRef.current;
    if (!canvas || !ctx || predictedPointsRef.current.length === 0) return;

    // Erase just the bounding box of the predicted path with a small margin
    const pts = [lastPointRef.current!, ...predictedPointsRef.current];
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      const sx = scaleX(p.x, canvas);
      const sy = scaleY(p.y, canvas);
      if (sx < minX) minX = sx;
      if (sy < minY) minY = sy;
      if (sx > maxX) maxX = sx;
      if (sy > maxY) maxY = sy;
    }
    const pad = (ctx.lineWidth ?? 4) + 4;
    ctx.clearRect(minX - pad, minY - pad, (maxX - minX) + pad * 2, (maxY - minY) + pad * 2);
    predictedPointsRef.current = [];
  };

  // ─── Shape preview ────────────────────────────────────────────────────────

  const drawActiveShape = (start: { x: number; y: number }, end: { x: number; y: number }) => {
    const canvas = activeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const tempShape: ShapeElement = {
      id: '__active__',
      elementType: 'shape',
      shapeType,
      x1: start.x,
      y1: start.y,
      x2: end.x,
      y2: end.y,
      color,
      strokeWidth,
    };
    renderShape(ctx, tempShape, canvas);
  };

  // ─── Lasso preview ────────────────────────────────────────────────────────

  const drawActiveLasso = (pts: Point[]) => {
    const canvas = activeRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (pts.length < 2) return;

    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(scaleX(pts[0].x, canvas), scaleY(pts[0].y, canvas));
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(scaleX(pts[i].x, canvas), scaleY(pts[i].y, canvas));
    }
    ctx.stroke();
    ctx.restore();
  };

  // ─── Eraser ───────────────────────────────────────────────────────────────

  const eraseAt = useCallback(
    (vx: number, vy: number) => {
      const hit = elements.filter((el) => {
        if (el.elementType === 'stroke') {
          return el.points.some((p) => dist(p.x, p.y, vx, vy) < ERASER_RADIUS);
        }
        if (el.elementType === 'shape') {
          return dist(
            (el.x1 + el.x2) / 2,
            (el.y1 + el.y2) / 2,
            vx,
            vy
          ) < ERASER_RADIUS * 3;
        }
        if (el.elementType === 'text') {
          return dist(el.x, el.y, vx, vy) < ERASER_RADIUS * 4;
        }
        return false;
      });

      if (hit.length > 0) {
        const hitIds = new Set(hit.map((e) => e.id));
        const newEls = elements.filter((e) => !hitIds.has(e.id));
        pushHistory(newEls);
      }
    },
    [elements, pushHistory]
  );

  // ─── Pointer down ─────────────────────────────────────────────────────────

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Palm rejection on iPad: only respond to pen or mouse
    if (e.pointerType === 'touch') return;
    e.preventDefault();
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);

    // Refresh rect cache at the start of each stroke (scroll may have moved canvas)
    cachedRectRef.current = activeRef.current!.getBoundingClientRect();
    const rect = getRect();
    const pt = getPointerPoint(e, rect);
    const vx = pt.x;
    const vy = pt.y;

    if (tool === 'eraser') {
      isDrawingRef.current = true;
      eraseAt(vx, vy);
      return;
    }

    if (tool === 'text') {
      setTextPos({ x: vx, y: vy });
      setTextValue('');
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    if (tool === 'shape') {
      isDrawingRef.current = true;
      shapeStartRef.current = { x: vx, y: vy };
      return;
    }

    if (tool === 'lasso') {
      isDrawingRef.current = true;
      lassoPointsRef.current = [pt];
      setSelectedIds(new Set());
      return;
    }

    // pen / highlighter
    isDrawingRef.current = true;
    currentPointsRef.current = [pt];
    beginActiveStroke(pt);
  };

  // ─── Pointer move ─────────────────────────────────────────────────────────

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') return;
    if (!isDrawingRef.current) return;
    e.preventDefault();

    const rect = getRect();

    if (tool === 'eraser') {
      const pt = getPointerPoint(e, rect);
      eraseAt(pt.x, pt.y);
      return;
    }

    if (tool === 'shape' && shapeStartRef.current) {
      const pt = getPointerPoint(e, rect);
      drawActiveShape(shapeStartRef.current, { x: pt.x, y: pt.y });
      return;
    }

    if (tool === 'lasso') {
      const pt = getPointerPoint(e, rect);
      lassoPointsRef.current.push(pt);
      drawActiveLasso(lassoPointsRef.current);
      return;
    }

    if (tool === 'pen' || tool === 'highlighter') {
      const native = e.nativeEvent as PointerEvent;

      // 1. Erase last frame's speculative predicted points
      clearPredicted();

      // 2. Draw all real coalesced points (240Hz Apple Pencil data)
      const coalesced: PointerEvent[] = native.getCoalescedEvents?.() ?? [native];
      for (const ne of coalesced) {
        const pt: Point = {
          x: ((ne.clientX - rect.left) / rect.width) * PAGE_W,
          y: ((ne.clientY - rect.top) / rect.height) * PAGE_H,
          pressure: ne.pressure > 0 ? ne.pressure : 0.5,
        };
        currentPointsRef.current.push(pt);
        continueActiveStroke(pt);
      }

      // 3. Draw predicted points for next frame — makes pencil feel instant
      const predicted: PointerEvent[] = native.getPredictedEvents?.() ?? [];
      if (predicted.length > 0) {
        const predictedPts = predicted.map((ne) => ({
          x: ((ne.clientX - rect.left) / rect.width) * PAGE_W,
          y: ((ne.clientY - rect.top) / rect.height) * PAGE_H,
          pressure: ne.pressure > 0 ? ne.pressure : 0.5,
        }));
        drawPredictedPoints(predictedPts);
      }
    }
  };

  // ─── Pointer up ───────────────────────────────────────────────────────────

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'touch') return;
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false;
    clearActive();

    const rect = getRect();
    const pt = getPointerPoint(e, rect);

    if (tool === 'shape' && shapeStartRef.current) {
      const newShape: ShapeElement = {
        id: uuid(),
        elementType: 'shape',
        shapeType,
        x1: shapeStartRef.current.x,
        y1: shapeStartRef.current.y,
        x2: pt.x,
        y2: pt.y,
        color,
        strokeWidth,
      };
      shapeStartRef.current = null;
      pushHistory([...elements, newShape]);
      return;
    }

    if (tool === 'lasso') {
      const lasso = lassoPointsRef.current;
      if (lasso.length > 3) {
        const ids = new Set<string>();
        for (const el of elements) {
          if (el.elementType === 'stroke' && strokeInLasso(el, lasso)) {
            ids.add(el.id);
          }
        }
        setSelectedIds(ids);
      }
      lassoPointsRef.current = [];
      return;
    }

    if ((tool === 'pen' || tool === 'highlighter') && currentPointsRef.current.length > 0) {
      const newStroke: Stroke = {
        id: uuid(),
        elementType: 'stroke',
        tool,
        points: currentPointsRef.current,
        color,
        width: strokeWidth,
      };
      currentPointsRef.current = [];
      pushHistory([...elements, newStroke]);
    }
  };

  // ─── Text commit ──────────────────────────────────────────────────────────

  const commitText = () => {
    if (!textPos || !textValue.trim()) {
      setTextPos(null);
      return;
    }
    const newText: TextElement = {
      id: uuid(),
      elementType: 'text',
      x: textPos.x,
      y: textPos.y,
      text: textValue,
      fontSize: 20,
      color,
    };
    setTextPos(null);
    setTextValue('');
    pushHistory([...elements, newText]);
  };

  // ─── PDF export ───────────────────────────────────────────────────────────

  const handleExportPDF = () => {
    const canvas = staticRef.current;
    if (!canvas) return;
    exportPageAsPDF(canvas, notebookName, pageData.pageNumber);
  };

  // ─── Text input position in screen coords ────────────────────────────────

  const getTextScreenPos = () => {
    if (!textPos || !containerRef.current) return { top: 0, left: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    return {
      top: rect.top + (textPos.y / PAGE_H) * rect.height,
      left: rect.left + (textPos.x / PAGE_W) * rect.width,
    };
  };

  const textScreen = getTextScreenPos();

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="canvas-page-root">
      <Toolbar
        tool={tool}
        color={color}
        strokeWidth={strokeWidth}
        shapeType={shapeType}
        canUndo={histIdx > 0}
        canRedo={histIdx < history.length - 1}
        hasSelection={selectedIds.size > 0}
        notebookName={notebookName}
        pageNumber={pageData.pageNumber}
        onToolChange={(t) => {
          setTool(t);
          setSelectedIds(new Set());
        }}
        onColorChange={setColor}
        onStrokeWidthChange={setStrokeWidth}
        onShapeTypeChange={setShapeType}
        onUndo={undo}
        onRedo={redo}
        onDeleteSelected={deleteSelected}
        onExportPDF={handleExportPDF}
        onBack={onBack}
      />

      <div className="canvas-scroll-area">
        <div
          className="canvas-page-container"
          ref={containerRef}
        >
          {/* Static layer — committed elements */}
          <canvas ref={staticRef} className="canvas-layer canvas-static" />

          {/* Active layer — live drawing */}
          <canvas
            ref={activeRef}
            className="canvas-layer canvas-active"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />

          {/* Text input overlay */}
          {textPos && (
            <input
              ref={textInputRef}
              className="text-overlay-input"
              style={{
                position: 'fixed',
                top: textScreen.top,
                left: textScreen.left,
                color,
                fontSize: 18,
              }}
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitText();
                if (e.key === 'Escape') setTextPos(null);
              }}
              onBlur={commitText}
              placeholder="Type here…"
            />
          )}
        </div>
      </div>
    </div>
  );
};
