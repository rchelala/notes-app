import { useState, useEffect } from 'react';
import { Auth } from './components/Auth';
import { MeetingsLibrary } from './components/MeetingsLibrary';
import { MeetingRecorder } from './components/MeetingRecorder';
import { useAuth } from './hooks/useAuth';
import { useMeetings } from './hooks/useFirestore';
import { Meeting, MeetingSummary } from './types';

type View =
  | { type: 'meetings' }
  | { type: 'meeting-new' }
  | { type: 'meeting-detail'; meeting: Meeting };

export default function App() {
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return (localStorage.getItem('theme') as 'dark' | 'light') ?? 'dark';
  });

  useEffect(() => {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'));

  const { user, loading: authLoading, authError, signIn, signOut } = useAuth();
  const { meetings, loading: meetingsLoading, createMeeting, updateMeetingSummary, updateMeetingAttendees, deleteMeeting } =
    useMeetings(user?.uid ?? null);

  const [view, setView] = useState<View>({ type: 'meetings' });

  const themeBtn = (
    <button
      className="theme-toggle"
      onClick={toggleTheme}
      title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  );

  if (authLoading) {
    return <div className="splash"><div className="splash-spinner" /></div>;
  }

  if (!user) {
    return <>{<Auth onSignIn={signIn} error={authError} />}{themeBtn}</>;
  }

  if (view.type === 'meetings') {
    return (
      <>
        <MeetingsLibrary
          meetings={meetings}
          loading={meetingsLoading}
          userEmail={user.email ?? ''}
          onOpen={(meeting) => setView({ type: 'meeting-detail', meeting })}
          onNewMeeting={() => setView({ type: 'meeting-new' })}
          onDelete={deleteMeeting}
          onSignOut={signOut}
        />
        {themeBtn}
      </>
    );
  }

  if (view.type === 'meeting-new') {
    return (
      <>
        <MeetingRecorder
          userId={user.uid}
          onSave={async (title, transcript, durationSeconds, summary, attendees) => {
            await createMeeting(user.uid, title, transcript, durationSeconds, summary, attendees);
            setView({ type: 'meetings' });
          }}
          onBack={() => setView({ type: 'meetings' })}
        />
        {themeBtn}
      </>
    );
  }

  if (view.type === 'meeting-detail') {
    const { meeting } = view;
    const freshMeeting = meetings.find((m) => m.id === meeting.id) ?? meeting;
    return (
      <>
        <MeetingRecorder
          userId={user.uid}
          existingMeeting={freshMeeting}
          onSave={async (_title, _transcript, _duration, summary, attendees) => {
            await Promise.all([
              summary ? updateMeetingSummary(freshMeeting.id, summary as MeetingSummary) : Promise.resolve(),
              updateMeetingAttendees(freshMeeting.id, attendees),
            ]);
            setView({ type: 'meetings' });
          }}
          onUpdateAttendees={(attendees) => updateMeetingAttendees(freshMeeting.id, attendees)}
          onBack={() => setView({ type: 'meetings' })}
        />
        {themeBtn}
      </>
    );
  }

  return null;
}
