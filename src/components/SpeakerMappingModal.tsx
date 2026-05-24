import { useState } from 'react';

interface Props {
  speakerCount: number;
  attendees: string[];
  onApply: (mapping: Record<number, string>) => void;
  onSkip: () => void;
}

const SPEAKER_COLORS = ['#6c63ff', '#e07b39', '#4ecdc4', '#f7b731', '#a29bfe'];

export const SpeakerMappingModal = ({ speakerCount, attendees, onApply, onSkip }: Props) => {
  const [mapping, setMapping] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    for (let i = 0; i < speakerCount; i++) {
      init[i] = attendees[i] ?? 'Unknown';
    }
    return init;
  });

  const options = ['Unknown', ...attendees];

  return (
    <div className="modal-overlay">
      <div className="modal">
        <h2 className="modal-title">Who was speaking?</h2>
        <p className="modal-subtitle">
          {speakerCount} speaker{speakerCount !== 1 ? 's' : ''} detected. Assign names from your attendees list.
        </p>

        <div className="speaker-rows">
          {Array.from({ length: speakerCount }, (_, i) => (
            <div key={i} className="speaker-row">
              <span
                className="speaker-label"
                style={{ borderColor: SPEAKER_COLORS[i % SPEAKER_COLORS.length] }}
              >
                Speaker {i}
              </span>
              <span className="speaker-arrow">→</span>
              <select
                className="speaker-select"
                value={mapping[i] ?? 'Unknown'}
                onChange={(e) => setMapping(prev => ({ ...prev, [i]: e.target.value }))}
              >
                {options.map((opt, idx) => (
                  <option key={idx} value={opt}>{opt}</option>
                ))}
              </select>
            </div>
          ))}
        </div>

        <div className="modal-actions">
          <button className="btn-ghost" onClick={onSkip}>Skip</button>
          <button className="btn-primary" onClick={() => onApply(mapping)}>Apply & Save</button>
        </div>
      </div>
    </div>
  );
};
