import { useState } from 'react';
import { Auth } from './components/Auth';
import { NotebookLibrary } from './components/NotebookLibrary';
import { NotebookView } from './components/NotebookView';
import { CanvasPage } from './components/CanvasPage';
import { MeetingsLibrary } from './components/MeetingsLibrary';
import { MeetingRecorder } from './components/MeetingRecorder';
import { useAuth } from './hooks/useAuth';
import { useNotebooks, usePages, useMeetings } from './hooks/useFirestore';
import { PageData, Notebook, CanvasElement, Meeting, MeetingSummary } from './types';

type View =
  | { type: 'library' }
  | { type: 'notebook'; notebook: Notebook }
  | { type: 'page'; notebook: Notebook; page: PageData }
  | { type: 'meetings' }
  | { type: 'meeting-new' }
  | { type: 'meeting-detail'; meeting: Meeting };

export default function App() {
  const { user, loading: authLoading, authError, signIn, signOut } = useAuth();
  const { notebooks, loading: nbLoading, createNotebook, renameNotebook, deleteNotebook } =
    useNotebooks(user?.uid ?? null);
  const { meetings, loading: meetingsLoading, createMeeting, updateMeetingSummary, deleteMeeting } =
    useMeetings(user?.uid ?? null);
  const [view, setView] = useState<View>({ type: 'library' });

  const activeNotebookId =
    view.type === 'notebook' || view.type === 'page' ? view.notebook.id : null;

  const { pages, loading: pagesLoading, addPage, savePage, deletePage } =
    usePages(activeNotebookId);

  if (authLoading) {
    return <div className="splash"><div className="splash-spinner" /></div>;
  }

  if (!user) {
    return <Auth onSignIn={signIn} error={authError} />;
  }

  // ── Notebook library ─────────────────────────────────────────────────────
  if (view.type === 'library') {
    return (
      <NotebookLibrary
        notebooks={notebooks}
        loading={nbLoading}
        onOpen={(id) => {
          const nb = notebooks.find((n) => n.id === id);
          if (nb) setView({ type: 'notebook', notebook: nb });
        }}
        onCreate={async (name) => {
          try {
            await createNotebook(name);
          } catch (err: unknown) {
            const e = err as { code?: string; message?: string };
            console.error('Create notebook error:', e.code, e.message);
            alert(`Could not create notebook: ${e.code ?? e.message}`);
          }
        }}
        onRename={renameNotebook}
        onDelete={deleteNotebook}
        onSignOut={signOut}
        userEmail={user.email ?? ''}
        onOpenMeetings={() => setView({ type: 'meetings' })}
      />
    );
  }

  // ── Notebook page list ───────────────────────────────────────────────────
  if (view.type === 'notebook') {
    const nb = view.notebook;
    const freshNb = notebooks.find((n) => n.id === nb.id) ?? nb;
    return (
      <NotebookView
        notebookName={freshNb.name}
        pages={pages}
        loading={pagesLoading}
        onOpenPage={(page) => setView({ type: 'page', notebook: freshNb, page })}
        onAddPage={async () => {
          const nextNum = (pages[pages.length - 1]?.pageNumber ?? 0) + 1;
          await addPage(freshNb.id, nextNum);
        }}
        onDeletePage={async (pageId) => {
          await deletePage(freshNb.id, pageId);
        }}
        onBack={() => setView({ type: 'library' })}
      />
    );
  }

  // ── Canvas page ──────────────────────────────────────────────────────────
  if (view.type === 'page') {
    const { notebook, page } = view;
    const freshNb = notebooks.find((n) => n.id === notebook.id) ?? notebook;
    const freshPage = pages.find((p) => p.id === page.id) ?? page;
    return (
      <CanvasPage
        key={freshPage.id}
        pageData={freshPage}
        notebookName={freshNb.name}
        onSave={async (elements: CanvasElement[], thumbnail: string) => {
          await savePage(freshNb.id, freshPage.id, elements, thumbnail);
        }}
        onBack={() => setView({ type: 'notebook', notebook: freshNb })}
      />
    );
  }

  // ── Meetings list ─────────────────────────────────────────────────────────
  if (view.type === 'meetings') {
    return (
      <MeetingsLibrary
        meetings={meetings}
        loading={meetingsLoading}
        onOpen={(meeting) => setView({ type: 'meeting-detail', meeting })}
        onNewMeeting={() => setView({ type: 'meeting-new' })}
        onDelete={deleteMeeting}
        onBack={() => setView({ type: 'library' })}
      />
    );
  }

  // ── New meeting recording ─────────────────────────────────────────────────
  if (view.type === 'meeting-new') {
    return (
      <MeetingRecorder
        userId={user.uid}
        onSave={async (title, transcript, durationSeconds, summary) => {
          await createMeeting(user.uid, title, transcript, durationSeconds, summary);
          setView({ type: 'meetings' });
        }}
        onBack={() => setView({ type: 'meetings' })}
      />
    );
  }

  // ── Existing meeting detail ───────────────────────────────────────────────
  if (view.type === 'meeting-detail') {
    const { meeting } = view;
    const freshMeeting = meetings.find((m) => m.id === meeting.id) ?? meeting;
    return (
      <MeetingRecorder
        userId={user.uid}
        existingMeeting={freshMeeting}
        onSave={async (_title, _transcript, _duration, summary) => {
          if (summary) await updateMeetingSummary(freshMeeting.id, summary as MeetingSummary);
          setView({ type: 'meetings' });
        }}
        onBack={() => setView({ type: 'meetings' })}
      />
    );
  }

  return null;
}
