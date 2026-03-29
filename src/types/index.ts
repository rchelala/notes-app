export type Tool = 'pen' | 'highlighter' | 'eraser' | 'text' | 'shape' | 'lasso';
export type ShapeType = 'rectangle' | 'circle' | 'line' | 'arrow';

/** All XY coordinates are normalized 0–1 relative to page dimensions */
export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface Stroke {
  id: string;
  elementType: 'stroke';
  tool: 'pen' | 'highlighter';
  points: Point[];
  color: string;
  width: number;
}

export interface ShapeElement {
  id: string;
  elementType: 'shape';
  shapeType: ShapeType;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  strokeWidth: number;
}

export interface TextElement {
  id: string;
  elementType: 'text';
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
}

export type CanvasElement = Stroke | ShapeElement | TextElement;

export interface PageData {
  id: string;
  notebookId: string;
  pageNumber: number;
  elements: CanvasElement[];
  thumbnail?: string;
  updatedAt: number;
}

export interface Notebook {
  id: string;
  name: string;
  userId: string;
  createdAt: number;
  updatedAt: number;
  pageCount: number;
  coverColor: string;
}
