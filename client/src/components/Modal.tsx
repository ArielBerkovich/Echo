export default function Modal({ title, className = "", closeLabel = "Close", closeDisabled = false, onClose, children }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className={`modal${className ? ` ${className}` : ""}`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label={closeLabel} disabled={closeDisabled}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
