import { useState, useEffect, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Meeting, MeetingSummary } from '../types';
import { useDualStreamTranscription } from '../hooks/useDualStreamTranscription';
import { exportMeetingPdf } from '../utils/exportPdf';
import { SpeakerMappingModal } from './SpeakerMappingModal';
import { useCustomPrompts } from '../hooks/useFirestore';
import type { CustomPrompt } from '../types';

interface Props {
  userId: string;
  existingMeeting?: Meeting;
  onSave: (
    title: string,
    transcript: string,
    durationSeconds: number,
    summary: MeetingSummary | null,
    attendees: string[]
  ) => Promise<void>;
  onUpdateAttendees?: (attendees: string[]) => Promise<void>;
  onUpdateTranscript?: (transcript: string) => Promise<void>;
  onBack: () => void;
}

type RecordingState = 'idle' | 'starting' | 'recording' | 'stopped';

export const MeetingRecorder = ({ userId, existingMeeting, onSave, onUpdateAttendees, onUpdateTranscript, onBack }: Props) => {
  const [recordingState, setRecordingState] = useState<RecordingState>(
    existingMeeting ? 'stopped' : 'idle'
  );
  const [transcript, setTranscript] = useState(existingMeeting?.transcript ?? '');
  const [interimText, setInterimText] = useState('');
  const [title, setTitle] = useState(existingMeeting?.title ?? '');
  const [summary, setSummary] = useState<MeetingSummary | null>(existingMeeting?.summary ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [quickResult, setQuickResult] = useState<{ label: string; items: string[] } | null>(null);
  const [quickLoading, setQuickLoading] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(existingMeeting?.durationSeconds ?? 0);

  const [attendees, setAttendees] = useState<string[]>(existingMeeting?.attendees ?? []);
  const [attendeeInput, setAttendeeInput] = useState('');
  const [savingAttendees, setSavingAttendees] = useState(false);

  const [editingTranscript, setEditingTranscript] = useState(false);
  const [editedTranscript, setEditedTranscript] = useState('');
  const [savingTranscript, setSavingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  const [micDevices, setMicDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicId, setSelectedMicId] = useState<string>('');
  const [showSpeakerModal, setShowSpeakerModal] = useState(false);

  const { customPrompts, saveCustomPrompts } = useCustomPrompts(userId);

  const [showAddPrompt, setShowAddPrompt] = useState(false);
  const [newPromptLabel, setNewPromptLabel] = useState('');
  const [newPromptText, setNewPromptText] = useState('');
  const [savingPrompts, setSavingPrompts] = useState(false);

  const enumerateMics = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const mics = devices.filter(d => d.kind === 'audioinput');
    setMicDevices(mics);
    setSelectedMicId(prev => {
      // Keep current selection if still available, otherwise pick default
      if (prev && mics.some(m => m.deviceId === prev)) return prev;
      return mics.find(m => m.deviceId === 'default')?.deviceId ?? mics[0]?.deviceId ?? '';
    });
  }, []);

  useEffect(() => {
    enumerateMics();
    navigator.mediaDevices.addEventListener('devicechange', enumerateMics);
    return () => navigator.mediaDevices.removeEventListener('devicechange', enumerateMics);
  }, [enumerateMics]);

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleFinalText = useCallback((text: string) => {
    setTranscript(prev => prev + text);
  }, []);

  const handleInterimText = useCallback((text: string) => {
    setInterimText(text);
  }, []);

  const { start, stop, displayDenied, captureError, detectedSpeakers } = useDualStreamTranscription({
    onFinalText: handleFinalText,
    onInterimText: handleInterimText,
    micDeviceId: selectedMicId || undefined,
  });

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [stop]);

  const startRecording = useCallback(async () => {
    setRecordingState('starting');
    const ok = await start();
    if (!ok) {
      setRecordingState(prev => (prev === 'starting' ? 'idle' : prev));
      return;
    }
    startTimeRef.current = Date.now() - elapsed * 1000;
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    setRecordingState('recording');
  }, [start, elapsed]);

  const stopRecording = useCallback(() => {
    const speakerCount = stop();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setRecordingState('stopped');
    if (!existingMeeting && speakerCount > 1) {
      setShowSpeakerModal(true);
    }
  }, [stop, existingMeeting]);

  const handleToggleRecording = () => {
    if (recordingState === 'idle' || recordingState === 'stopped') {
      startRecording();
    } else if (recordingState === 'recording') {
      stopRecording();
    }
  };

  const handleAnalyze = async () => {
    const text = transcriptRef.current.trim();
    if (!text) return;

    setAnalyzing(true);
    setAnalyzeError(null);
    setQuickResult(null);

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      });

      const data = await res.json() as { summary?: MeetingSummary; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Unknown error');
      }

      setSummary(data.summary ?? null);
    } catch (err: unknown) {
      setAnalyzeError((err as Error).message ?? 'Failed to analyze. Try again.');
    } finally {
      setAnalyzing(false);
    }
  };

  const QUICK_PROMPTS = [
    { key: 'actionable', label: 'Actionable Bullet Points' },
    { key: 'decisions',  label: 'Decisions Made' },
    { key: 'takeaways',  label: 'Key Takeaways' },
    { key: 'owners',     label: 'Action Item Owners' },
  ] as const;

  const handleQuickPrompt = async (promptType: string, label: string) => {
    const text = transcriptRef.current.trim();
    if (!text) return;

    setQuickLoading(promptType);
    setAnalyzeError(null);

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, promptType }),
      });

      const data = await res.json() as { items?: string[]; error?: string };

      if (!res.ok || data.error) {
        throw new Error(data.error ?? 'Unknown error');
      }

      setQuickResult({ label, items: data.items ?? [] });
    } catch (err: unknown) {
      setAnalyzeError((err as Error).message ?? 'Failed to analyze. Try again.');
    } finally {
      setQuickLoading(null);
    }
  };

  const addAttendee = () => {
    const name = attendeeInput.trim();
    if (!name || attendees.includes(name)) return;
    setAttendees(prev => [...prev, name]);
    setAttendeeInput('');
  };

  const removeAttendee = (name: string) => {
    setAttendees(prev => prev.filter(a => a !== name));
  };

  const handleStartEdit = () => {
    setEditedTranscript(transcript);
    setAnalyzeError(null);
    setEditingTranscript(true);
  };

  const handleCancelEdit = () => {
    setEditingTranscript(false);
    setEditedTranscript('');
  };

  const handleSaveTranscript = async () => {
    if (!existingMeeting?.id) return;
    setSavingTranscript(true);
    setTranscriptError(null);
    try {
      await onUpdateTranscript?.(editedTranscript);
      setTranscript(editedTranscript);
      setSummary(null);
      setQuickResult(null);
      setEditingTranscript(false);
      setEditedTranscript('');
    } catch (err) {
      setTranscriptError((err as Error).message ?? 'Failed to save. Try again.');
    } finally {
      setSavingTranscript(false);
    }
  };

  const handleCustomPrompt = async (cp: CustomPrompt) => {
    const text = transcriptRef.current.trim();
    if (!text) return;
    setQuickLoading(cp.id);
    setAnalyzeError(null);
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text, customPrompt: cp.prompt }),
      });
      const data = await res.json() as { items?: string[]; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? 'Unknown error');
      setQuickResult({ label: cp.label, items: data.items ?? [] });
    } catch (err: unknown) {
      setAnalyzeError((err as Error).message ?? 'Failed to analyze.');
    } finally {
      setQuickLoading(null);
    }
  };

  const handleSaveCustomPrompt = async () => {
    const label = newPromptLabel.trim();
    const prompt = newPromptText.trim();
    if (!label || !prompt || customPrompts.length >= 5 || savingPrompts) return;
    setSavingPrompts(true);
    try {
      const updated = [...customPrompts, { id: uuidv4(), label, prompt }];
      await saveCustomPrompts(updated);
      setNewPromptLabel('');
      setNewPromptText('');
      setShowAddPrompt(false);
    } finally {
      setSavingPrompts(false);
    }
  };

  const handleDeleteCustomPrompt = async (id: string) => {
    if (savingPrompts) return;
    setSavingPrompts(true);
    try {
      await saveCustomPrompts(customPrompts.filter(cp => cp.id !== id));
    } finally {
      setSavingPrompts(false);
    }
  };

  const handleSaveAttendees = async () => {
    if (!onUpdateAttendees) return;
    setSavingAttendees(true);
    try {
      await onUpdateAttendees(attendees);
    } finally {
      setSavingAttendees(false);
    }
  };

  const handleSave = async () => {
    const finalTitle = title.trim() || `Meeting ${new Date().toLocaleDateString()}`;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(finalTitle, transcript, elapsed, summary, attendees);
    } catch (err: unknown) {
      setSaveError((err as Error).message ?? 'Failed to save. Try again.');
      setSaving(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const hasTranscript = transcript.trim().length > 0;
  const isSupported = !!navigator.mediaDevices?.getUserMedia;

  return (
    <div className="meeting-recorder">
      {/* Header */}
      <header className="library-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn-back" onClick={onBack}>← Meetings</button>
          <input
            className="meeting-title-input"
            placeholder="Meeting title…"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button
            className="btn-primary"
            onClick={handleSave}
            disabled={saving || !hasTranscript || recordingState === 'recording'}
            title={
              recordingState === 'recording'
                ? 'Stop recording before saving'
                : !hasTranscript
                ? 'Record something first'
                : 'Save meeting to your list'
            }
          >
            {saving ? 'Saving…' : 'Save & Close'}
          </button>
          {saveError && (
            <span style={{ fontSize: 12, color: 'var(--danger)' }}>⚠️ {saveError}</span>
          )}
        </div>
      </header>

      <div className="meeting-body">
        {/* Record controls */}
        <div className="record-controls">
          {!isSupported ? (
            <p className="speech-unsupported">
              Audio capture is not supported in this browser. Try Chrome or Edge on desktop.
            </p>
          ) : (
            <>
              {micDevices.length > 1 && (
                <select
                  className="mic-select"
                  value={selectedMicId}
                  onChange={e => setSelectedMicId(e.target.value)}
                  disabled={recordingState === 'recording' || recordingState === 'starting'}
                  title="Select microphone"
                >
                  {micDevices.map(d => (
                    <option key={d.deviceId} value={d.deviceId}>
                      {d.label || `Microphone ${d.deviceId.slice(0, 6)}`}
                    </option>
                  ))}
                </select>
              )}
              <button
                className={`record-btn${recordingState === 'recording' ? ' recording' : ''}`}
                onClick={handleToggleRecording}
                disabled={recordingState === 'starting'}
              >
                {recordingState === 'starting'
                  ? 'Starting…'
                  : recordingState === 'recording'
                  ? '⏹ Stop'
                  : '🎙 Record'}
              </button>
              <span className="record-timer">{formatTime(elapsed)}</span>
              {recordingState === 'recording' && (
                <span className="record-pulse">● Recording</span>
              )}
              {recordingState === 'recording' && displayDenied && (
                <span style={{ fontSize: 13, color: 'var(--warning, #b45309)', marginLeft: 8 }}>
                  Mic only — meeting audio not shared
                </span>
              )}
              {captureError && (
                <span style={{ fontSize: 13, color: 'var(--danger)', marginLeft: 8 }}>
                  ⚠️ {captureError}
                </span>
              )}
            </>
          )}
        </div>

        {/* Attendees */}
        <div className="attendees-section">
          <div className="attendees-header">
            <h2>Attendees</h2>
            {onUpdateAttendees && (
              <button
                className="btn-ghost btn-sm"
                onClick={handleSaveAttendees}
                disabled={savingAttendees}
              >
                {savingAttendees ? 'Saving…' : 'Save'}
              </button>
            )}
          </div>
          <div className="attendees-input-row">
            <input
              className="attendee-input"
              placeholder="Add name or email…"
              value={attendeeInput}
              onChange={e => setAttendeeInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addAttendee(); } }}
            />
            <button className="btn-ghost btn-sm" onClick={addAttendee} disabled={!attendeeInput.trim()}>
              + Add
            </button>
          </div>
          {attendees.length > 0 && (
            <div className="attendee-chips">
              {attendees.map(name => (
                <span key={name} className="attendee-chip">
                  {name}
                  <button className="attendee-chip-remove" onClick={() => removeAttendee(name)} title="Remove">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="meeting-columns">
          {/* Transcript panel */}
          <div className="meeting-panel">
            <div className="meeting-panel-header">
              <div className="transcript-header">
                <h2>Transcript</h2>
                {recordingState === 'stopped' && !editingTranscript && (
                  <button className="btn-ghost btn-sm" onClick={handleStartEdit}>
                    ✏️ Edit
                  </button>
                )}
                {editingTranscript && (
                  <div className="transcript-edit-actions">
                    <button
                      className="btn-primary btn-sm"
                      onClick={handleSaveTranscript}
                      disabled={savingTranscript}
                    >
                      {savingTranscript ? 'Saving…' : 'Save'}
                    </button>
                    <button className="btn-ghost btn-sm" onClick={handleCancelEdit}>
                      Cancel
                    </button>
                  </div>
                )}
              </div>
              {hasTranscript && !editingTranscript && (
                <button
                  className="btn-primary"
                  onClick={handleAnalyze}
                  disabled={analyzing || recordingState === 'recording'}
                >
                  {analyzing ? 'Analyzing…' : '✨ Analyze with AI'}
                </button>
              )}
            </div>
            {editingTranscript ? (
              <div className="transcript-edit-container">
                {summary && (
                  <div className="transcript-edit-warning">
                    ⚠️ Saving changes will clear the existing AI summary. Re-run analysis after saving.
                  </div>
                )}
                <textarea
                  className="transcript-textarea"
                  value={editedTranscript}
                  onChange={(e) => setEditedTranscript(e.target.value)}
                  rows={12}
                />
                {transcriptError && (
                  <p className="error-text">{transcriptError}</p>
                )}
              </div>
            ) : (
              <div className="transcript-box" ref={scrollRef}>
                {!hasTranscript && recordingState === 'idle' && (
                  <p className="transcript-placeholder">
                    Tap Record to start capturing your meeting…
                  </p>
                )}
                {!hasTranscript && (recordingState === 'starting' || recordingState === 'recording') && (
                  <p className="transcript-placeholder">Listening…</p>
                )}
                <span className="transcript-committed">{transcript}</span>
                <span className="transcript-interim">{interimText}</span>
              </div>
            )}
            {analyzeError && (
              <div className="analyze-error">⚠️ {analyzeError}</div>
            )}
          </div>

          {/* Summary panel */}
          <div className="meeting-panel">
            <div className="meeting-panel-header">
              <div className="summary-header">
                <h2>AI Summary</h2>
                {summary && existingMeeting && (
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => exportMeetingPdf({ ...existingMeeting, summary, transcript, attendees })}
                  >
                    ⬇️ Export PDF
                  </button>
                )}
              </div>
            </div>
            {!summary && !analyzing && (
              <div className="summary-empty">
                {hasTranscript
                  ? 'Click "Analyze with AI" to generate highlights.'
                  : 'Record a meeting first, then analyze it.'}
              </div>
            )}
            {analyzing && (
              <div className="summary-loading">
                <div className="splash-spinner" />
                <p>Gemini is analyzing your transcript…</p>
              </div>
            )}
            {summary && !analyzing && (
              <div className="summary-content">
                <section className="summary-section">
                  <h3>Overview</h3>
                  <p>{summary.overview}</p>
                </section>

                {summary.decisions.length > 0 && (
                  <section className="summary-section">
                    <h3>✅ Decisions Made</h3>
                    <ul>
                      {summary.decisions.map((d, i) => <li key={i}>{d}</li>)}
                    </ul>
                  </section>
                )}

                {summary.actionItems.length > 0 && (
                  <section className="summary-section">
                    <h3>📋 Action Items</h3>
                    <ul>
                      {summary.actionItems.map((a, i) => <li key={i}>{a}</li>)}
                    </ul>
                  </section>
                )}

                {summary.topics.length > 0 && (
                  <section className="summary-section">
                    <h3>💬 Topics Discussed</h3>
                    <div className="topic-chips">
                      {summary.topics.map((t, i) => (
                        <span key={i} className="topic-chip">{t}</span>
                      ))}
                    </div>
                  </section>
                )}

                <section className="summary-section quick-prompts-section">
                  <h3>Ask AI</h3>
                  <div className="quick-prompt-btns">
                    {QUICK_PROMPTS.map(({ key, label }) => (
                      <button
                        key={key}
                        className={`quick-prompt-btn${quickLoading === key ? ' loading' : ''}${quickResult?.label === label && !quickLoading ? ' active' : ''}`}
                        onClick={() => handleQuickPrompt(key, label)}
                        disabled={!!quickLoading || recordingState === 'recording'}
                      >
                        {quickLoading === key ? 'Thinking…' : label}
                      </button>
                    ))}
                  </div>

                  {/* Divider */}
                  <hr className="prompts-divider" />

                  {/* Custom prompts */}
                  <div className="custom-prompts-row">
                    {customPrompts.map((cp) => (
                      <div key={cp.id} className="custom-prompt-chip">
                        <button
                          className="custom-prompt-btn"
                          onClick={() => handleCustomPrompt(cp)}
                          disabled={!!quickLoading}
                        >
                          {quickLoading === cp.id ? '…' : cp.label}
                        </button>
                        <button
                          className="custom-prompt-delete"
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomPrompt(cp.id); }}
                          aria-label={`Delete ${cp.label} prompt`}
                        >
                          ✕
                        </button>
                      </div>
                    ))}

                    {customPrompts.length < 5 && !showAddPrompt && (
                      <button className="btn-ghost btn-sm add-prompt-btn" onClick={() => setShowAddPrompt(true)}>
                        + Add prompt
                      </button>
                    )}
                  </div>

                  {/* Inline add form */}
                  {showAddPrompt && (
                    <div className="add-prompt-form">
                      <p className="add-prompt-form-title">New prompt</p>
                      <label className="form-label">Button label</label>
                      <input
                        className="form-input"
                        placeholder="e.g. Budget Mentions"
                        value={newPromptLabel}
                        onChange={(e) => setNewPromptLabel(e.target.value)}
                      />
                      <label className="form-label">Prompt sent to AI</label>
                      <textarea
                        className="form-textarea"
                        placeholder="e.g. Extract all mentions of budget, costs, or spending from this transcript."
                        value={newPromptText}
                        onChange={(e) => setNewPromptText(e.target.value)}
                        rows={3}
                      />
                      <div className="form-actions">
                        <button className="btn-ghost btn-sm" onClick={() => {
                          setShowAddPrompt(false);
                          setNewPromptLabel('');
                          setNewPromptText('');
                        }}>Cancel</button>
                        <button
                          className="btn-primary btn-sm"
                          onClick={handleSaveCustomPrompt}
                          disabled={!newPromptLabel.trim() || !newPromptText.trim()}
                        >
                          Save prompt
                        </button>
                      </div>
                    </div>
                  )}
                </section>

                {quickResult && !quickLoading && (
                  <section className="summary-section quick-result-section">
                    <h3>{quickResult.label}</h3>
                    <ul>
                      {quickResult.items.map((item, i) => <li key={i}>{item}</li>)}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {showSpeakerModal && (
        <SpeakerMappingModal
          speakerCount={detectedSpeakers}
          attendees={attendees}
          onSkip={() => setShowSpeakerModal(false)}
          onApply={(mapping) => {
            setTranscript(prev => {
              const speakerNums = Object.keys(mapping).join('|');
              const pattern = new RegExp(`\\[Speaker (${speakerNums})\\]:`, 'g');
              return prev.replace(pattern, (_, num) => `[${mapping[Number(num)]}]:`);
            });
            setShowSpeakerModal(false);
          }}
        />
      )}
    </div>
  );
};
