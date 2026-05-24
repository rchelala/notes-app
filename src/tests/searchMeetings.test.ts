import { describe, it, expect } from 'vitest';
import { searchMeetings, getMatchSnippet } from '../utils/searchMeetings';
import type { Meeting } from '../types';

const base: Meeting = {
  id: '1', userId: 'u', title: 'Q3 Review', transcript: '', summary: null,
  attendees: [], createdAt: 0, updatedAt: 0, durationSeconds: 0,
};

describe('searchMeetings', () => {
  it('returns all meetings when query is empty', () => {
    const meetings = [base, { ...base, id: '2' }];
    expect(searchMeetings(meetings, '')).toHaveLength(2);
  });

  it('matches on title (case-insensitive)', () => {
    const meetings = [base, { ...base, id: '2', title: 'Sprint Planning' }];
    expect(searchMeetings(meetings, 'sprint')).toHaveLength(1);
    expect(searchMeetings(meetings, 'sprint')[0].id).toBe('2');
  });

  it('matches on transcript text', () => {
    const meetings = [{ ...base, transcript: 'retention is down 12%' }];
    expect(searchMeetings(meetings, 'retention')).toHaveLength(1);
  });

  it('matches on summary overview', () => {
    const meetings = [{
      ...base,
      summary: { overview: 'Budget review', decisions: [], actionItems: [], topics: [] },
    }];
    expect(searchMeetings(meetings, 'budget')).toHaveLength(1);
  });

  it('matches on summary action items', () => {
    const meetings = [{
      ...base,
      summary: { overview: '', decisions: [], actionItems: ['Alice: send report'], topics: [] },
    }];
    expect(searchMeetings(meetings, 'send report')).toHaveLength(1);
  });

  it('returns no matches when nothing matches', () => {
    expect(searchMeetings([base], 'zzznomatch')).toHaveLength(0);
  });
});

describe('getMatchSnippet', () => {
  it('returns transcript snippet when match is in transcript', () => {
    const meeting = { ...base, transcript: 'retention is the main topic today' };
    const result = getMatchSnippet(meeting, 'retention');
    expect(result?.source).toBe('transcript');
    expect(result?.text).toContain('retention');
  });

  it('returns summary snippet when match is in summary', () => {
    const meeting = {
      ...base,
      summary: { overview: 'budget discussed', decisions: [], actionItems: [], topics: [] },
    };
    const result = getMatchSnippet(meeting, 'budget');
    expect(result?.source).toBe('summary');
  });

  it('returns null when no match', () => {
    expect(getMatchSnippet(base, 'zzz')).toBeNull();
  });
});
