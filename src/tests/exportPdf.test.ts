import { describe, it, expect } from 'vitest';
import { buildPdfContent } from '../utils/exportPdf';
import type { Meeting } from '../types';

const mockMeeting: Meeting = {
  id: 'test-id',
  userId: 'user-1',
  title: 'Q3 Roadmap Review',
  transcript: 'Test transcript',
  summary: {
    overview: 'Team reviewed Q3 priorities.',
    decisions: ['Onboarding is top priority'],
    actionItems: ['Sarah: share retention data'],
    topics: ['Onboarding', 'Retention'],
  },
  attendees: ['Sarah K.', 'Mike R.'],
  createdAt: new Date('2026-05-24').getTime(),
  updatedAt: new Date('2026-05-24').getTime(),
  durationSeconds: 1800,
};

describe('buildPdfContent', () => {
  it('returns title, date, attendees, and all summary sections', () => {
    const content = buildPdfContent(mockMeeting);
    expect(content.title).toBe('Q3 Roadmap Review');
    expect(content.date).toMatch('May 24, 2026');
    expect(content.attendees).toEqual(['Sarah K.', 'Mike R.']);
    expect(content.overview).toBe('Team reviewed Q3 priorities.');
    expect(content.decisions).toEqual(['Onboarding is top priority']);
    expect(content.actionItems).toEqual(['Sarah: share retention data']);
    expect(content.topics).toEqual(['Onboarding', 'Retention']);
  });

  it('returns empty arrays when summary is null', () => {
    const content = buildPdfContent({ ...mockMeeting, summary: null });
    expect(content.overview).toBe('');
    expect(content.decisions).toEqual([]);
    expect(content.actionItems).toEqual([]);
    expect(content.topics).toEqual([]);
  });
});
