/** Minimum horizontal movement before locking swipe vs scroll. */
export const SWIPE_DIRECTION_LOCK_PX = 10;

/** Full swipe past this fraction of row width deletes immediately. */
export const FULL_SWIPE_RATIO = 0.6;

/** Ignore horizontal swipes that start in the left inset (iOS back gesture). */
export const IOS_EDGE_INSET_PX = 24;

export const DEFAULT_DELETE_ACTION_WIDTH_PX = 76;

export type GestureLock = 'pending' | 'horizontal' | 'vertical';

export function resolveGestureLock(
  lock: GestureLock,
  dx: number,
  dy: number,
): GestureLock {
  if (lock !== 'pending') return lock;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx >= SWIPE_DIRECTION_LOCK_PX && adx > ady) return 'horizontal';
  if (ady >= SWIPE_DIRECTION_LOCK_PX && ady > adx) return 'vertical';
  return 'pending';
}

export function shouldAllowSwipeStart(pointerClientX: number): boolean {
  return pointerClientX >= IOS_EDGE_INSET_PX;
}

export function horizontalSwipeOffset(
  startOffsetPx: number,
  dx: number,
  rowWidthPx: number,
  revealWidthPx: number,
): number {
  const next = startOffsetPx - dx;
  const maxReveal = Math.max(revealWidthPx, rowWidthPx * FULL_SWIPE_RATIO);
  if (next < 0) return 0;
  if (next > maxReveal) return maxReveal;
  return next;
}

export type SwipeReleaseAction = 'delete' | 'open' | 'close';

export function swipeReleaseAction(
  offsetPx: number,
  rowWidthPx: number,
  revealWidthPx: number,
): SwipeReleaseAction {
  if (rowWidthPx > 0 && offsetPx >= rowWidthPx * FULL_SWIPE_RATIO) return 'delete';
  if (offsetPx >= revealWidthPx * 0.45) return 'open';
  return 'close';
}

const SWIPE_EXCLUDE_SELECTOR =
  '.set-chk, .set-val-input, .step-btn, input, textarea, button, .set-swipe-delete, .set-edit-actions';

export function isSwipeExcludedTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest(SWIPE_EXCLUDE_SELECTOR));
}
