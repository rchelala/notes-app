import { useState, useEffect } from 'react';
import { Meeting } from '../types';
import { searchMeetings, getMatchSnippet } from '../utils/searchMeetings';

interface Props {
  meetings: Meeting[];
  loading: boolean;
  userEmail: string;
  onOpen: (meeting: Meeting) => void;
  onNewMeeting: () => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
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
  meetings, loading, userEmail, onOpen, onNewMeeting, onDelete, onSignOut,
}: Props) => {
  const [query, setQuery] = useState('');
  const filtered = searchMeetings(meetings, query);

  useEffect(() => {
    if (meetings.length === 0) setQuery('');
  }, [meetings.length]);

  return (
  <div className="meetings-library">
    <header className="library-header">
      <h1>Meetings</h1>
      <div className="library-header-right">
        <button className="btn-primary" onClick={onNewMeeting}>
          + New Recording
        </button>
        <div className="user-badge">
          <span className="user-email">{userEmail}</span>
          <button className="btn-ghost" onClick={onSignOut}>Sign out</button>
        </div>
      </div>
    </header>

    {!loading && meetings.length > 0 && (
      <div className="search-bar-container">
        <span className="search-icon">🔍</span>
        <input
          className="search-input"
          type="text"
          aria-label="Search meetings"
          placeholder="Search transcripts and summaries…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button className="search-clear" onClick={() => setQuery('')} aria-label="Clear search">✕</button>
        )}
      </div>
    )}

    {query && (
      <p className="search-results-count">
        {filtered.length === 0
          ? 'No meetings matched'
          : `${filtered.length} meeting${filtered.length === 1 ? '' : 's'} matched`}
      </p>
    )}

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
        {filtered.map((m) => {
          const snippet = query ? getMatchSnippet(m, query) : null;
          return (
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
              {m.attendees?.length > 0 && (
                <div className="meeting-card-attendees">
                  {m.attendees.map(a => (
                    <span key={a} className="meeting-card-attendee-chip">{a}</span>
                  ))}
                </div>
              )}
              {snippet && (
                <div className={`match-snippet match-snippet--${snippet.source}`}>
                  <span className="match-snippet-label">
                    {snippet.source === 'transcript' ? 'Transcript' : snippet.source === 'summary' ? 'Summary' : 'Title'}
                  </span>
                  {' · '}
                  {snippet.text}
                </div>
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
          );
        })}
      </div>
    )}
  </div>
  );
};
