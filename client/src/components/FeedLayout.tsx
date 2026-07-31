export function FeedLayout({ title, subtitle, testId, children }) {
  return (
    <main className="channel-view">
      <div className="channel-main">
        <header className="channel-header" data-testid={`${testId}-header`}>
          <span className="ch-name">{title}</span>
          <span className="ch-meta">{subtitle}</span>
        </header>
        <div className="messages activity-list" data-testid={`${testId}-list`}>
          {children}
        </div>
      </div>
    </main>
  );
}

export function FeedContent({ loading, items, emptyTitle, emptyMessage, children }) {
  if (loading) return <div className="empty-state"><p>Loading…</p></div>;
  if (!items.length) {
    return (
      <div className="empty-state">
        <h3>{emptyTitle}</h3>
        <p>{emptyMessage}</p>
      </div>
    );
  }
  return children;
}

export function FeedMessage({ author, context, time, body, renderMarkdown }) {
  return (
    <>
      <div className="meta">
        <span className="author">{author}</span>
        <span className="activity-where">{context}</span>
        <span className="time">{time}</span>
      </div>
      {body ? (
        <div
          className="body markdown"
          dir="auto"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(body) }}
        />
      ) : null}
    </>
  );
}
