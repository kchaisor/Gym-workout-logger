import { useEffect } from 'react';

const UNDO_MS = 5000;

export function UndoToast({
  message,
  hasRestDock,
  onUndo,
  onDismiss,
}: {
  message: string;
  hasRestDock?: boolean;
  onUndo: () => void;
  onDismiss: () => void;
}) {
  useEffect(() => {
    const id = window.setTimeout(onDismiss, UNDO_MS);
    return () => window.clearTimeout(id);
  }, [message, onDismiss]);

  return (
    <div
      className={hasRestDock ? 'undo-toast has-rest-dock' : 'undo-toast'}
      role="status"
      aria-live="polite"
    >
      <span className="undo-toast-msg">{message}</span>
      <button type="button" className="undo-toast-btn" onClick={onUndo}>
        Undo
      </button>
    </div>
  );
}
