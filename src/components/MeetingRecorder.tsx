import { useState, useEffect, useRef, useCallback } from 'react';
import { Meeting, MeetingSummary } from '../types';

interface Props {
  userId: string;
  existingMeeting?: Meeting;
  onSave: (
    title: string,
    transcript: string,
    durationSeconds: number,
    summary: MeetingSummary | null
  ) => Promise<void>;
  onBack: () => void;
}

type RecordingState = 'idle' | 'recording' | 'stopped';

// Extend Window for webkit prefix and polyfill missing lib types
interface ISpeechRecognitionEvent {
  resultIndex: number;
  results: { isFinal: boolean; [index: number]: { transcript: string } }[];
}
interface ISpeechRecognitionError { error: string; }
interface ISpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  onresult: ((e: ISpeechRecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: ISpeechRecognitionError) => void) | null;
  start(): void;
  stop(): void;
}
declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition;
    webkitSpeechRecognition: new () => ISpeechRecognition;
  }
}

export const MeetingRecorder = ({ userId, existingMeeting, onSave, onBack }: Props) => {
  const [recordingState, setRecordingState] = useState<RecordingState>(
    existingMeeting ? 'stopped' : 'idle'
  );
  const [transcript, setTranscript] = useState(existingMeeting?.transcript ?? '');
  const [interimText, setInterimText] = useState('');
  const [title, setTitle] = useState(existingMeeting?.title ?? '');
  const [summary, setSummary] = useState<MeetingSummary | null>(existingMeeting?.summary ?? null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [elapsed, setElapsed] = useState(existingMeeting?.durationSeconds ?? 0);
  const [speechSupported] = useState(
    () => !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const transcriptRef = useRef(transcript);
  transcriptRef.current = transcript;
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript, interimText]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(() => {
    if (!speechSupported) return;

    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event) => {
      let interim = '';
      let finalChunk = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalChunk += result[0].transcript + ' ';
        } else {
          interim += result[0].transcript;
        }
      }

      if (finalChunk) {
        setTranscript((prev) => prev + finalChunk);
        setInterimText('');
      } else {
        setInterimText(interim);
      }
    };

    // On iOS Safari, continuous mode stops after silence — restart automatically
    recognition.onend = () => {
      if (recognitionRef.current === recognition && recordingState === 'recording') {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    recognition.onerror = (e) => {
      if (e.error === 'no-speech') return; // common on pauses — ignore
      console.error('Speech recognition error:', e.error);
    };

    recognitionRef.current = recognition;
    recognition.start();

    startTimeRef.current = Date.now() - elapsed * 1000;
    timerRef.current = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    setRecordingState('recording');
  }, [speechSupported, elapsed, recordingState]);

  const stopRecording = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setInterimText('');
    setRecordingState('stopped');
  }, []);

  const handleToggleRecording = () => {
    if (recordingState === 'idle' || recordingState === 'stopped') {
      startRecording();
    } else {
      stopRecording();
    }
  };

  const handleAnalyze = async () => {
    const text = transcriptRef.current.trim();
    if (!text) return;

    setAnalyzing(true);
    setAnalyzeError(null);

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

  const handleSave = async () => {
    const finalTitle = title.trim() || `Meeting ${new Date().toLocaleDateString()}`;
    setSaving(true);
    try {
      await onSave(finalTitle, transcript, elapsed, summary);
    } finally {
      setSaving(false);
    }
  };

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  };

  const hasTranscript = transcript.trim().length > 0;

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
        <button
          className="btn-primary"
          onClick={handleSave}
          disabled={saving || !hasTranscript}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </header>

      <div className="meeting-body">
        {/* Record controls */}
        <div className="record-controls">
          {!speechSupported ? (
            <p className="speech-unsupported">
              Speech recognition is not supported in this browser. Try Chrome or Safari on iOS.
            </p>
          ) : (
            <>
              <button
                className={`record-btn${recordingState === 'recording' ? ' recording' : ''}`}
                onClick={handleToggleRecording}
              >
                {recordingState === 'recording' ? '⏹ Stop' : '🎙 Record'}
              </button>
              <span className="record-timer">{formatTime(elapsed)}</span>
              {recordingState === 'recording' && (
                <span className="record-pulse">● Recording</span>
              )}
            </>
          )}
        </div>

        <div className="meeting-columns">
          {/* Transcript panel */}
          <div className="meeting-panel">
            <div className="meeting-panel-header">
              <h2>Transcript</h2>
              {hasTranscript && (
                <button
                  className="btn-primary"
                  onClick={handleAnalyze}
                  disabled={analyzing || recordingState === 'recording'}
                >
                  {analyzing ? 'Analyzing…' : '✨ Analyze with AI'}
                </button>
              )}
            </div>
            <div className="transcript-box" ref={scrollRef}>
              {!hasTranscript && recordingState === 'idle' && (
                <p className="transcript-placeholder">
                  Tap Record to start capturing your meeting…
                </p>
              )}
              {!hasTranscript && recordingState === 'recording' && (
                <p className="transcript-placeholder">Listening…</p>
              )}
              <span className="transcript-committed">{transcript}</span>
              <span className="transcript-interim">{interimText}</span>
            </div>
            {analyzeError && (
              <div className="analyze-error">⚠️ {analyzeError}</div>
            )}
          </div>

          {/* Summary panel */}
          <div className="meeting-panel">
            <div className="meeting-panel-header">
              <h2>AI Summary</h2>
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
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
