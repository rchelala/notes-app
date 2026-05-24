import type { Meeting } from '../types';

export interface MatchSnippet {
  source: 'transcript' | 'summary' | 'title';
  text: string;
}

function haystack(meeting: Meeting): { transcript: string; summary: string } {
  const summaryFields = meeting.summary
    ? [
        meeting.summary.overview,
        ...meeting.summary.decisions,
        ...meeting.summary.actionItems,
        ...meeting.summary.topics,
      ].join(' ')
    : '';
  return { transcript: meeting.transcript, summary: summaryFields };
}

export function searchMeetings(meetings: Meeting[], query: string): Meeting[] {
  if (!query.trim()) return meetings;
  const q = query.toLowerCase();
  return meetings.filter((m) => {
    const { transcript, summary } = haystack(m);
    return (
      m.title.toLowerCase().includes(q) ||
      transcript.toLowerCase().includes(q) ||
      summary.toLowerCase().includes(q)
    );
  });
}

export function getMatchSnippet(meeting: Meeting, query: string): MatchSnippet | null {
  if (!query.trim()) return null;
  const q = query.toLowerCase();
  const { transcript, summary } = haystack(meeting);

  if (meeting.title.toLowerCase().includes(q)) {
    return { source: 'title', text: meeting.title };
  }

  if (transcript.toLowerCase().includes(q)) {
    const idx = transcript.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 40);
    const end = Math.min(transcript.length, idx + query.length + 60);
    const text = (start > 0 ? '…' : '') + transcript.slice(start, end) + (end < transcript.length ? '…' : '');
    return { source: 'transcript', text };
  }

  if (summary.toLowerCase().includes(q)) {
    const idx = summary.toLowerCase().indexOf(q);
    const start = Math.max(0, idx - 40);
    const end = Math.min(summary.length, idx + query.length + 60);
    const text = (start > 0 ? '…' : '') + summary.slice(start, end) + (end < summary.length ? '…' : '');
    return { source: 'summary', text };
  }

  return null;
}
