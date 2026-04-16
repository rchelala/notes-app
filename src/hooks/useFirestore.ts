import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Meeting, MeetingSummary } from '../types';

export const useMeetings = (userId: string | null) => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setMeetings([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'meetings'),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setMeetings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Meeting)));
      setLoading(false);
    }, (err) => {
      console.error('Meetings query error:', err.code, err.message);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  const createMeeting = async (
    userId: string,
    title: string,
    transcript: string,
    durationSeconds: number,
    summary: MeetingSummary | null,
    attendees: string[] = []
  ): Promise<string> => {
    const now = Date.now();
    const ref = await addDoc(collection(db, 'meetings'), {
      userId,
      title,
      transcript,
      summary,
      attendees,
      durationSeconds,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  };

  const updateMeetingSummary = async (meetingId: string, summary: MeetingSummary) => {
    await updateDoc(doc(db, 'meetings', meetingId), { summary, updatedAt: Date.now() });
  };

  const updateMeetingAttendees = async (meetingId: string, attendees: string[]) => {
    await updateDoc(doc(db, 'meetings', meetingId), { attendees, updatedAt: Date.now() });
  };

  const deleteMeeting = async (meetingId: string) => {
    await deleteDoc(doc(db, 'meetings', meetingId));
  };

  return { meetings, loading, createMeeting, updateMeetingSummary, updateMeetingAttendees, deleteMeeting };
};
