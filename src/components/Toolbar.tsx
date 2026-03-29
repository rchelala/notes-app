import { useState } from 'react';
import { Tool, ShapeType } from '../types';
import { ColorPicker } from './ColorPicker';

interface Props {
  tool: Tool;
  color: string;
  strokeWidth: number;
  shapeType: ShapeType;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  notebookName: string;
  pageNumber: number;
  onToolChange: (t: Tool) => void;
  onColorChange: (c: string) => void;
  onStrokeWidthChange: (w: number) => void;
  onShapeTypeChange: (s: ShapeType) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDeleteSelected: () => void;
  onExportPDF: () => void;
  onBack: () => void;
}

const TOOL_ICONS: Record<Tool, string> = {
  pen: '✒️',
  highlighter: '🖊️',
  eraser: '◻️',
  text: 'T',
  shape: '⬜',
  lasso: '⭕',
};

const SHAPE_ICONS: Record<ShapeType, string> = {
  rectangle: '⬜',
  circle: '⭕',
  line: '╱',
  arrow: '→',
};

const WIDTHS = [
  { label: 'Fine', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Thick', value: 8 },
];

export const Toolbar = ({
  tool,
  color,
  strokeWidth,
  shapeType,
  canUndo,
  canRedo,
  hasSelection,
  notebookName,
  pageNumber,
  onToolChange,
  onColorChange,
  onStrokeWidthChange,
  onShapeTypeChange,
  onUndo,
  onRedo,
  onDeleteSelected,
  onExportPDF,
  onBack,
}: Props) => {
  const [showColors, setShowColors] = useState(false);
  const [showShapes, setShowShapes] = useState(false);

  const handleToolClick = (t: Tool) => {
    if (t === 'shape') {
      setShowShapes((v) => !v);
    } else {
      setShowShapes(false);
    }
    onToolChange(t);
  };

  return (
    <div className="toolbar">
      {/* Back + title */}
      <div className="toolbar-section">
        <button className="btn-back small" onClick={onBack} title="Back to pages">
          ← Pages
        </button>
        <span className="toolbar-title">
          {notebookName} · Page {pageNumber}
        </span>
      </div>

      {/* Drawing tools */}
      <div className="toolbar-section tools-group">
        {(['pen', 'highlighter', 'eraser', 'text', 'shape', 'lasso'] as Tool[]).map((t) => (
          <button
            key={t}
            className={`tool-btn${tool === t ? ' active' : ''}`}
            title={t.charAt(0).toUpperCase() + t.slice(1)}
            onClick={() => handleToolClick(t)}
          >
            {TOOL_ICONS[t]}
          </button>
        ))}
      </div>

      {/* Shape sub-toolbar */}
      {tool === 'shape' && showShapes && (
        <div className="toolbar-section shape-picker">
          {(['rectangle', 'circle', 'line', 'arrow'] as ShapeType[]).map((s) => (
            <button
              key={s}
              className={`tool-btn small${shapeType === s ? ' active' : ''}`}
              title={s}
              onClick={() => {
                onShapeTypeChange(s);
                setShowShapes(false);
              }}
            >
              {SHAPE_ICONS[s]}
            </button>
          ))}
        </div>
      )}

      {/* Stroke width (pen / highlighter / shape) */}
      {(tool === 'pen' || tool === 'highlighter' || tool === 'shape') && (
        <div className="toolbar-section">
          {WIDTHS.map((w) => (
            <button
              key={w.value}
              className={`width-btn${strokeWidth === w.value ? ' active' : ''}`}
              title={w.label}
              onClick={() => onStrokeWidthChange(w.value)}
            >
              <span
                className="width-dot"
                style={{ width: w.value * 2.5, height: w.value * 2.5 }}
              />
            </button>
          ))}
        </div>
      )}

      {/* Color swatch */}
      {tool !== 'eraser' && tool !== 'lasso' && (
        <div className="toolbar-section">
          <button
            className="color-swatch-btn"
            style={{ backgroundColor: color }}
            title="Color"
            onClick={() => setShowColors((v) => !v)}
          />
          {showColors && (
            <div className="color-picker-anchor">
              <ColorPicker
                color={color}
                onChange={onColorChange}
                onClose={() => setShowColors(false)}
              />
            </div>
          )}
        </div>
      )}

      {/* Lasso delete */}
      {hasSelection && (
        <div className="toolbar-section">
          <button className="btn-danger small" onClick={onDeleteSelected}>
            Delete Selected
          </button>
        </div>
      )}

      {/* History */}
      <div className="toolbar-section">
        <button
          className="tool-btn"
          title="Undo (Ctrl+Z)"
          disabled={!canUndo}
          onClick={onUndo}
        >
          ↩
        </button>
        <button
          className="tool-btn"
          title="Redo (Ctrl+Y)"
          disabled={!canRedo}
          onClick={onRedo}
        >
          ↪
        </button>
      </div>

      {/* Export */}
      <div className="toolbar-section">
        <button className="btn-ghost small" onClick={onExportPDF} title="Export as PDF">
          ⬇ PDF
        </button>
      </div>
    </div>
  );
};
