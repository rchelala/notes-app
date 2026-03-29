import { Meeting } from '../types';

interface Props {
  meetings: Meeting[];
  loading: boolean;
  onOpen: (meeting: Meeting) => void;
  onNewMeeting: () => void;
  onDelete: (id: string) => void;
  onBack: () => void;
}

const formatDuration = (seconds: number) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
};

const formatDate = (ts: number) =>
  new Date(ts).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });

export const MeetingsLibrary = ({
  meetings, loading, onOpen, onNewMeeting, onDelete, onBack,
}: Props) => (
  <div className="meetings-library">
    <header className="library-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn-back" onClick={onBack}>← Notebooks</button>
        <h1>Meetings</h1>
      </div>
      <button className="btn-primary" onClick={onNewMeeting}>
        🎙 New Recording
      </button>
    </header>

    {loading ? (
      <div className="loading-state">Loading meetings…</div>
    ) : meetings.length === 0 ? (
      <div className="empty-state">
        <div className="empty-icon">🎙</div>
        <p>No meetings recorded yet.</p>
        <button className="btn-primary" onClick={onNewMeeting}>
          Start your first recording
        </button>
      </div>
    ) : (
      <div className="meetings-list">
        {meetings.map((m) => (
          <div key={m.id} className="meeting-card" onClick={() => onOpen(m)}>
            <div className="meeting-card-icon">🎙</div>
            <div className="meeting-card-body">
              <h3 className="meeting-card-title">{m.title}</h3>
              <p className="meeting-card-meta">
                {formatDate(m.createdAt)} · {formatDuration(m.durationSeconds)}
              </p>
              {m.summary ? (
                <p className="meeting-card-overview">{m.summary.overview}</p>
              ) : (
                <p className="meeting-card-no-summary">No summary yet</p>
              )}
            </div>
            <button
              className="meeting-delete-btn"
              title="Delete"
              onClick={(e) => {
                e.stopPropagation();
                if (window.confirm(`Delete "${m.title}"?`)) onDelete(m.id);
              }}
            >
              🗑️
            </button>
          </div>
        ))}
      </div>
    )}
  </div>
);
