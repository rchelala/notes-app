export interface MeetingSummary {
  overview: string;
  decisions: string[];
  actionItems: string[];
  topics: string[];
}

export interface Meeting {
  id: string;
  userId: string;
  title: string;
  transcript: string;
  summary: MeetingSummary | null;
  attendees: string[];
  createdAt: number;
  updatedAt: number;
  durationSeconds: number;
}
