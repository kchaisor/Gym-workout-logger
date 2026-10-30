import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  DEFAULT_DELETE_ACTION_WIDTH_PX,
  horizontalSwipeOffset,
  isSwipeExcludedTarget,
  resolveGestureLock,
  shouldAllowSwipeStart,
  swipeReleaseAction,
  type GestureLock,
} from './swipeReveal';

type SetSwipeRowProps = {
  setId: string;
  enabled: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onDelete: () => void;
  children: ReactNode;
};

export function SetSwipeRow({
  setId,
  enabled,
  isOpen,
  onOpen,
  onClose,
  onDelete,
  children,
}: SetSwipeRowProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragOffsetRef = useRef(0);
  const gestureRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startOffset: number;
    lock: GestureLock;
    captured: boolean;
  } | null>(null);

  const revealWidth = DEFAULT_DELETE_ACTION_WIDTH_PX;

  const settledOffset = isOpen ? revealWidth : 0;
  const displayOffset = dragOffset ?? settledOffset;

  const measureRowWidth = useCallback(() => {
    return wrapRef.current?.clientWidth ?? 0;
  }, []);

  useLayoutEffect(() => {
    if (!isOpen && dragOffset === null) return;
    if (!isOpen) setDragOffset(null);
  }, [isOpen, dragOffset]);

  function finishGesture(finalOffset: number) {
    const rowWidth = measureRowWidth();
    const action = swipeReleaseAction(finalOffset, rowWidth, revealWidth);
    setDragOffset(null);
    gestureRef.current = null;
    if (action === 'delete') {
      onClose();
      onDelete();
      return;
    }
    if (action === 'open') onOpen();
    else onClose();
  }

  function onPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!enabled || event.button !== 0) return;
    if (isSwipeExcludedTarget(event.target)) return;
    if (!shouldAllowSwipeStart(event.clientX)) return;

    const startOffset = isOpen ? revealWidth : 0;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startOffset,
      lock: 'pending',
      captured: false,
    };
  }

  function onPointerMove(event: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== event.pointerId) return;

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    g.lock = resolveGestureLock(g.lock, dx, dy);

    if (g.lock === 'vertical') {
      gestureRef.current = null;
      setDragOffset(null);
      return;
    }

    if (g.lock === 'horizontal') {
      if (!g.captured) {
        event.currentTarget.setPointerCapture(event.pointerId);
        g.captured = true;
      }
      event.preventDefault();
      const rowWidth = measureRowWidth();
      const offset = horizontalSwipeOffset(g.startOffset, dx, rowWidth, revealWidth);
      dragOffsetRef.current = offset;
      setDragOffset(offset);
    }
  }

  function onPointerUp(event: React.PointerEvent<HTMLDivElement>) {
    const g = gestureRef.current;
    if (!g || g.pointerId !== event.pointerId) return;
    if (g.captured) event.currentTarget.releasePointerCapture(event.pointerId);

    if (g.lock === 'horizontal') {
      finishGesture(dragOffsetRef.current);
      return;
    }
    gestureRef.current = null;
    setDragOffset(null);
  }

  function onPointerCancel(event: React.PointerEvent<HTMLDivElement>) {
    if (gestureRef.current?.pointerId === event.pointerId) {
      gestureRef.current = null;
      setDragOffset(null);
    }
  }

  return (
    <div
      ref={wrapRef}
      className="set-swipe-row"
      data-set-id={setId}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="set-swipe-actions" aria-hidden={displayOffset <= 0}>
        <button
          type="button"
          className="set-swipe-delete"
          aria-label="Delete set"
          onClick={(event) => {
            event.stopPropagation();
            onClose();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>
      <div
        className="set-swipe-content set-trow done"
        style={{
          transform: displayOffset > 0 ? `translate3d(${-displayOffset}px, 0, 0)` : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
