import { useRef } from 'react';

const PRESETS = [
  { label: 'Black', value: '#1a1a1a' },
  { label: 'Gray', value: '#6b7280' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Red', value: '#dc2626' },
  { label: 'Green', value: '#16a34a' },
  { label: 'Purple', value: '#7c3aed' },
  { label: 'Orange', value: '#ea580c' },
  { label: 'Pink', value: '#db2777' },
];

interface Props {
  color: string;
  onChange: (color: string) => void;
  onClose: () => void;
}

export const ColorPicker = ({ color, onChange, onClose }: Props) => {
  const wheelRef = useRef<HTMLInputElement>(null);

  return (
    <div className="color-picker-panel">
      <div className="color-picker-header">
        <span>Color</span>
        <button className="btn-ghost small" onClick={onClose}>✕</button>
      </div>

      {/* Preset swatches */}
      <div className="color-swatches">
        {PRESETS.map((p) => (
          <button
            key={p.value}
            className={`swatch${color === p.value ? ' active' : ''}`}
            style={{ backgroundColor: p.value }}
            title={p.label}
            onClick={() => onChange(p.value)}
          />
        ))}
      </div>

      {/* Color wheel */}
      <div className="color-wheel-row">
        <span className="color-wheel-label">Custom</span>
        <div className="color-wheel-preview" style={{ backgroundColor: color }} />
        <input
          ref={wheelRef}
          type="color"
          value={color}
          onChange={(e) => onChange(e.target.value)}
          className="color-wheel-input"
          title="Custom color"
        />
      </div>
    </div>
  );
};
