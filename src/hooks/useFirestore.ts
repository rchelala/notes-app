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
  setDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Notebook, PageData, CanvasElement } from '../types';

// ─── Notebooks ───────────────────────────────────────────────────────────────

export const useNotebooks = (userId: string | null) => {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setNotebooks([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'notebooks'),
      where('userId', '==', userId),
      orderBy('updatedAt', 'desc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setNotebooks(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Notebook)));
      setLoading(false);
    }, (err) => {
      console.error('Notebooks query error:', err.code, err.message);
      setLoading(false);
    });

    return unsub;
  }, [userId]);

  const createNotebook = async (name: string): Promise<string> => {
    const covers = ['#4F46E5', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777'];
    const coverColor = covers[Math.floor(Math.random() * covers.length)];
    const now = Date.now();

    const ref = await addDoc(collection(db, 'notebooks'), {
      name,
      userId,
      createdAt: now,
      updatedAt: now,
      pageCount: 1,
      coverColor,
    });

    // Seed first page
    await setDoc(doc(db, 'notebooks', ref.id, 'pages', 'page_1'), {
      id: 'page_1',
      notebookId: ref.id,
      pageNumber: 1,
      elements: [],
      thumbnail: '',
      updatedAt: now,
    });

    return ref.id;
  };

  const renameNotebook = async (id: string, name: string) => {
    await updateDoc(doc(db, 'notebooks', id), { name, updatedAt: Date.now() });
  };

  const deleteNotebook = async (id: string) => {
    await deleteDoc(doc(db, 'notebooks', id));
  };

  return { notebooks, loading, createNotebook, renameNotebook, deleteNotebook };
};

// ─── Pages ───────────────────────────────────────────────────────────────────

export const usePages = (notebookId: string | null) => {
  const [pages, setPages] = useState<PageData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!notebookId) {
      setPages([]);
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, 'notebooks', notebookId, 'pages'),
      orderBy('pageNumber', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      setPages(snap.docs.map((d) => d.data() as PageData));
      setLoading(false);
    });

    return unsub;
  }, [notebookId]);

  const addPage = async (notebookId: string, pageNumber: number) => {
    const now = Date.now();
    const id = `page_${pageNumber}`;
    await setDoc(doc(db, 'notebooks', notebookId, 'pages', id), {
      id,
      notebookId,
      pageNumber,
      elements: [],
      thumbnail: '',
      updatedAt: now,
    });
    await updateDoc(doc(db, 'notebooks', notebookId), {
      pageCount: pageNumber,
      updatedAt: now,
    });
  };

  const savePage = async (
    notebookId: string,
    pageId: string,
    elements: CanvasElement[],
    thumbnail: string
  ) => {
    const now = Date.now();
    await updateDoc(doc(db, 'notebooks', notebookId, 'pages', pageId), {
      elements,
      thumbnail,
      updatedAt: now,
    });
    await updateDoc(doc(db, 'notebooks', notebookId), { updatedAt: now });
  };

  const deletePage = async (notebookId: string, pageId: string) => {
    await deleteDoc(doc(db, 'notebooks', notebookId, 'pages', pageId));
  };

  return { pages, loading, addPage, savePage, deletePage };
};

// ─── Meetings ─────────────────────────────────────────────────────────────────

export const useMeetings = (userId: string | null) => {
  const [meetings, setMeetings] = useState<import('../types').Meeting[]>([]);
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
      setMeetings(snap.docs.map((d) => ({ id: d.id, ...d.data() } as import('../types').Meeting)));
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
    summary: import('../types').MeetingSummary | null
  ): Promise<string> => {
    const now = Date.now();
    const ref = await addDoc(collection(db, 'meetings'), {
      userId,
      title,
      transcript,
      summary,
      durationSeconds,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  };

  const updateMeetingSummary = async (
    meetingId: string,
    summary: import('../types').MeetingSummary
  ) => {
    await updateDoc(doc(db, 'meetings', meetingId), {
      summary,
      updatedAt: Date.now(),
    });
  };

  const deleteMeeting = async (meetingId: string) => {
    await deleteDoc(doc(db, 'meetings', meetingId));
  };

  return { meetings, loading, createMeeting, updateMeetingSummary, deleteMeeting };
};
