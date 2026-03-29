import { PageData } from '../types';

interface Props {
  notebookName: string;
  pages: PageData[];
  loading: boolean;
  onOpenPage: (page: PageData) => void;
  onAddPage: () => void;
  onDeletePage: (pageId: string, pageNumber: number) => void;
  onBack: () => void;
}

export const NotebookView = ({
  notebookName,
  pages,
  loading,
  onOpenPage,
  onAddPage,
  onDeletePage,
  onBack,
}: Props) => (
  <div className="notebook-view">
    <header className="notebook-view-header">
      <button className="btn-back" onClick={onBack}>
        ← Library
      </button>
      <h1 className="notebook-view-title">{notebookName}</h1>
      <button className="btn-primary" onClick={onAddPage}>
        + Add Page
      </button>
    </header>

    {loading ? (
      <div className="loading-state">Loading pages…</div>
    ) : (
      <div className="pages-grid">
        {pages.map((page) => (
          <div key={page.id} className="page-card" onClick={() => onOpenPage(page)}>
            <div className="page-thumbnail">
              {page.thumbnail ? (
                <img src={page.thumbnail} alt={`Page ${page.pageNumber}`} />
              ) : (
                <div className="page-thumbnail-empty">
                  <div className="thumb-line" />
                  <div className="thumb-line" />
                  <div className="thumb-line" />
                  <div className="thumb-line" />
                  <div className="thumb-line" />
                </div>
              )}
            </div>
            <div className="page-meta">
              <span className="page-label">Page {page.pageNumber}</span>
              {pages.length > 1 && (
                <button
                  className="page-delete-btn"
                  title="Delete page"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`Delete Page ${page.pageNumber}?`)) {
                      onDeletePage(page.id, page.pageNumber);
                    }
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);
