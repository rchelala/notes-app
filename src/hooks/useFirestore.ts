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
  getDoc,
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Meeting, MeetingSummary, CustomPrompt } from '../types';

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

  const updateMeetingTranscript = async (meetingId: string, transcript: string) => {
    await updateDoc(doc(db, 'meetings', meetingId), {
      transcript,
      summary: null,
      updatedAt: Date.now(),
    });
  };

  const deleteMeeting = async (meetingId: string) => {
    await deleteDoc(doc(db, 'meetings', meetingId));
  };

  return { meetings, loading, createMeeting, updateMeetingSummary, updateMeetingAttendees, updateMeetingTranscript, deleteMeeting };
};

export const useCustomPrompts = (userId: string | null) => {
  const [customPrompts, setCustomPrompts] = useState<CustomPrompt[]>([]);

  useEffect(() => {
    if (!userId) { setCustomPrompts([]); return; }
    const userDoc = doc(db, 'users', userId);
    getDoc(userDoc)
      .then((snap) => {
        const data = snap.data() as { customPrompts?: CustomPrompt[] } | undefined;
        setCustomPrompts(data?.customPrompts ?? []);
      })
      .catch((err) => {
        console.error('Failed to load custom prompts:', err);
      });
  }, [userId]);

  const saveCustomPrompts = async (prompts: CustomPrompt[]) => {
    if (!userId) return;
    const capped = prompts.slice(0, 5);
    await setDoc(doc(db, 'users', userId), { customPrompts: capped }, { merge: true });
    setCustomPrompts(capped);
  };

  return { customPrompts, saveCustomPrompts };
};
