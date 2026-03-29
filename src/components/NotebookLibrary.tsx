import { useState } from 'react';
import { Notebook } from '../types';

interface Props {
  notebooks: Notebook[];
  loading: boolean;
  onOpen: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onSignOut: () => void;
  userEmail: string;
}

export const NotebookLibrary = ({
  notebooks,
  loading,
  onOpen,
  onCreate,
  onRename,
  onDelete,
  onSignOut,
  userEmail,
}: Props) => {
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const handleCreate = () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    onCreate(trimmed);
    setNewName('');
    setShowCreate(false);
  };

  const commitRename = (id: string) => {
    const trimmed = renameValue.trim();
    if (trimmed) onRename(id, trimmed);
    setRenamingId(null);
  };

  return (
    <div className="library">
      {/* Header */}
      <header className="library-header">
        <h1>My Notebooks</h1>
        <div className="library-header-right">
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            + New Notebook
          </button>
          <div className="user-badge">
            <span className="user-email">{userEmail}</span>
            <button className="btn-ghost" onClick={onSignOut}>Sign out</button>
          </div>
        </div>
      </header>

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>New Notebook</h2>
            <input
              className="modal-input"
              type="text"
              placeholder="Notebook name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setShowCreate(false);
              }}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn-primary" onClick={handleCreate}>Create</button>
              <button className="btn-ghost" onClick={() => setShowCreate(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="loading-state">Loading notebooks…</div>
      ) : notebooks.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📓</div>
          <p>No notebooks yet.</p>
          <button className="btn-primary" onClick={() => setShowCreate(true)}>
            Create your first notebook
          </button>
        </div>
      ) : (
        <div className="notebook-grid">
          {notebooks.map((nb) => (
            <div key={nb.id} className="notebook-card" onClick={() => onOpen(nb.id)}>
              <div className="notebook-cover" style={{ backgroundColor: nb.coverColor }}>
                {/* Decorative lines on cover */}
                <div className="cover-line" />
                <div className="cover-line" />
                <div className="cover-line" />
              </div>
              <div className="notebook-meta">
                {renamingId === nb.id ? (
                  <input
                    className="rename-input"
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename(nb.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    onBlur={() => commitRename(nb.id)}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <h3 className="notebook-name">{nb.name}</h3>
                )}
                <p className="notebook-pages">
                  {nb.pageCount} page{nb.pageCount !== 1 ? 's' : ''}
                </p>
                <div
                  className="notebook-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    className="nb-action-btn"
                    title="Rename"
                    onClick={() => {
                      setRenamingId(nb.id);
                      setRenameValue(nb.name);
                    }}
                  >
                    ✏️
                  </button>
                  <button
                    className="nb-action-btn"
                    title="Delete"
                    onClick={() => {
                      if (window.confirm(`Delete "${nb.name}"? This cannot be undone.`)) {
                        onDelete(nb.id);
                      }
                    }}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
