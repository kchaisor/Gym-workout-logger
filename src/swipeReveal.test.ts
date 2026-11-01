import { describe, expect, it } from 'vitest';
import {
  FULL_SWIPE_RATIO,
  IOS_EDGE_INSET_PX,
  SWIPE_DIRECTION_LOCK_PX,
  horizontalSwipeOffset,
  resolveGestureLock,
  shouldAllowSwipeStart,
  swipeReleaseAction,
} from './swipeReveal';

describe('resolveGestureLock', () => {
  it('stays pending until 10px dominant move', () => {
    expect(resolveGestureLock('pending', 5, 0)).toBe('pending');
    expect(resolveGestureLock('pending', 0, 5)).toBe('pending');
  });

  it('locks horizontal when dx exceeds threshold and beats dy', () => {
    expect(resolveGestureLock('pending', SWIPE_DIRECTION_LOCK_PX, 2)).toBe('horizontal');
    expect(resolveGestureLock('pending', -12, 3)).toBe('horizontal');
  });

  it('locks vertical when dy exceeds threshold and beats dx', () => {
    expect(resolveGestureLock('pending', 2, SWIPE_DIRECTION_LOCK_PX)).toBe('vertical');
    expect(resolveGestureLock('pending', 3, -11)).toBe('vertical');
  });

  it('keeps an established lock', () => {
    expect(resolveGestureLock('horizontal', 0, 50)).toBe('horizontal');
    expect(resolveGestureLock('vertical', 50, 0)).toBe('vertical');
  });
});

describe('shouldAllowSwipeStart', () => {
  it('blocks swipes starting in the left edge inset', () => {
    expect(shouldAllowSwipeStart(IOS_EDGE_INSET_PX - 1)).toBe(false);
    expect(shouldAllowSwipeStart(IOS_EDGE_INSET_PX)).toBe(true);
  });
});

describe('horizontalSwipeOffset', () => {
  const rowWidth = 300;
  const reveal = 76;

  it('reveals on left swipe and clamps at full-swipe distance', () => {
    expect(horizontalSwipeOffset(0, -40, rowWidth, reveal)).toBe(40);
    const max = Math.max(reveal, rowWidth * FULL_SWIPE_RATIO);
    expect(horizontalSwipeOffset(0, -500, rowWidth, reveal)).toBe(max);
  });

  it('does not go negative on right swipe', () => {
    expect(horizontalSwipeOffset(20, 50, rowWidth, reveal)).toBe(0);
  });
});

describe('swipeReleaseAction', () => {
  const rowWidth = 200;
  const reveal = 76;

  it('deletes on full swipe past 60%', () => {
    expect(swipeReleaseAction(rowWidth * FULL_SWIPE_RATIO, rowWidth, reveal)).toBe('delete');
    expect(swipeReleaseAction(rowWidth * FULL_SWIPE_RATIO + 1, rowWidth, reveal)).toBe('delete');
  });

  it('opens on partial reveal past snap threshold', () => {
    expect(swipeReleaseAction(reveal * 0.5, rowWidth, reveal)).toBe('open');
  });

  it('closes on small offset', () => {
    expect(swipeReleaseAction(10, rowWidth, reveal)).toBe('close');
  });
});
