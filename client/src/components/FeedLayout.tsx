import { memo, useEffect, useRef } from "react";

export function FeedLayout({ title, subtitle, testId, actions, children }) {
  const headerRef = useRef(null);

  useEffect(() => {
    headerRef.current?.focus();
  }, []);

  return (
    <main className="channel-view">
      <div className="channel-main">
        <header ref={headerRef} className="channel-header" data-testid={`${testId}-header`} tabIndex={-1}>
          <span className="ch-name">{title}</span>
          <span className="ch-meta">{subtitle}</span>
          {actions ? <div className="header-actions">{actions}</div> : null}
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

export const FeedMessage = memo(function FeedMessage({ author, context, time, body, renderMarkdown }) {
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
});
