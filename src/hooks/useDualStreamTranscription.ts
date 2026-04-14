import { useState, useRef, useCallback } from 'react';

const DG_WS_URL =
  `wss://api.deepgram.com/v1/listen?` +
  new URLSearchParams({
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
    interim_results: 'true',
    language: 'en-US',
    smart_format: 'true',
    model: 'nova-2',
  }).toString();

interface Callbacks {
  onFinalText: (text: string) => void;
  onInterimText: (text: string) => void;
  micDeviceId?: string;
}

export function useDualStreamTranscription({ onFinalText, onInterimText, micDeviceId }: Callbacks) {
  const [displayDenied, setDisplayDenied] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  // Audio graph refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  // ScriptProcessorNode is deprecated but AudioWorklet requires a separate worklet file.
  // It still works across all modern browsers and is simpler for this use case.
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const displayStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const stop = useCallback(() => {
    // Close WebSocket gracefully
    if (wsRef.current) {
      wsRef.current.onclose = null; // suppress the error handler on intentional close
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    // Disconnect audio nodes
    processorRef.current?.disconnect();
    processorRef.current = null;
    // Close audio context
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    // Stop all media tracks (clears the browser recording indicator)
    displayStreamRef.current?.getTracks().forEach(t => t.stop());
    displayStreamRef.current = null;
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    // Clear interim text
    onInterimText('');
  }, [onInterimText]);

  /** Returns true when recording successfully started, false on failure. */
  const start = useCallback(async (): Promise<boolean> => {
    setCaptureError(null);
    setDisplayDenied(false);

    // 1. Fetch Deepgram token from our server-side endpoint
    let token: string;
    try {
      const res = await fetch('/api/deepgram-token', { method: 'POST' });
      if (!res.ok) throw new Error();
      ({ token } = await res.json() as { token: string });
    } catch {
      setCaptureError('Could not reach transcription service. Check your API key.');
      return false;
    }

    // 2. Request display audio (what you hear — Teams/meeting output)
    let displayStream: MediaStream | null = null;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({ audio: true, video: false });
      if (displayStream.getAudioTracks().length === 0) {
        // User shared a source without audio
        displayStream.getTracks().forEach(t => t.stop());
        displayStream = null;
        setDisplayDenied(true);
      }
    } catch {
      // User dismissed the share dialog — fall back to mic-only
      setDisplayDenied(true);
    }

    // 3. Request microphone (your voice)
    let micStream: MediaStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({
        audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
      });
    } catch {
      displayStream?.getTracks().forEach(t => t.stop());
      setCaptureError('Microphone access denied. Please allow microphone access and try again.');
      return false;
    }

    displayStreamRef.current = displayStream;
    micStreamRef.current = micStream;

    // 4. Build the AudioContext mixing graph
    // 16 kHz mono is Deepgram's preferred format for linear16 — halves bandwidth vs 44.1 kHz
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    await audioCtx.resume(); // ensure context is running (may start suspended on some browsers)
    audioCtxRef.current = audioCtx;

    // ScriptProcessorNode sums all connected inputs automatically.
    // bufferSize=4096 gives ~256ms chunks at 16kHz — good balance of latency and overhead.
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    processorRef.current = processor;

    const micSource = audioCtx.createMediaStreamSource(micStream);
    micSource.connect(processor);

    if (displayStream) {
      const displaySource = audioCtx.createMediaStreamSource(displayStream);
      displaySource.connect(processor);
    }

    // Connect to the silent destination to keep the graph alive
    processor.connect(audioCtx.destination);

    // 5. Open Deepgram WebSocket — token passed as subprotocol since browser WS can't send custom headers
    const ws = new WebSocket(DG_WS_URL, ['token', token]);
    wsRef.current = ws;

    ws.onerror = () => {
      setCaptureError('Transcription connection error.');
      stop();
    };

    ws.onclose = (evt) => {
      if (evt.code !== 1000) {
        setCaptureError('Transcription connection lost.');
      }
    };

    ws.onopen = () => console.log('[DG] WebSocket opened');
    ws.onmessage = (evt) => {
      type DGResult = {
        type: string;
        is_final: boolean;
        channel: { alternatives: { transcript: string }[] };
      };
      try {
        const msg = JSON.parse(evt.data as string) as DGResult;
        console.log('[DG] message type:', msg.type, msg.type === 'Results' ? JSON.stringify(msg.channel?.alternatives?.[0]) : '');
        if (msg.type !== 'Results') return;
        const text = msg.channel?.alternatives?.[0]?.transcript ?? '';
        if (!text) return;
        if (msg.is_final) {
          onFinalText(text + ' ');
          onInterimText('');
        } else {
          onInterimText(text);
        }
      } catch {
        // ignore malformed Deepgram messages
      }
    };

    // 6. Send PCM chunks to Deepgram on every audio buffer
    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const input = e.inputBuffer.getChannelData(0);
      // Convert Float32 [-1, 1] to Int16 [-32768, 32767]
      const int16 = new Int16Array(input.length);
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      ws.send(int16.buffer);
    };

    return true;
  }, [stop, onFinalText, onInterimText]);

  return { start, stop, displayDenied, captureError };
}
