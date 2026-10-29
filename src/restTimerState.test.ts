import { describe, expect, it } from 'vitest';
import { extendRestTimer, restartRestTimer, startRestTimer } from './restTimerState';

describe('rest timer draft', () => {
  const meta = {
    exerciseId: 'ex1',
    exerciseName: 'Bench press',
    setNumber: 2,
    nextLabel: '80 kg × 8',
  };

  it('starts with preset seconds', () => {
    const t0 = 1_000_000;
    const timer = startRestTimer(null, 180, meta, t0);
    expect(timer.endsAtMs).toBe(t0 + 180_000);
  });

  it('restarts on preset bump', () => {
    const t0 = 1_000_000;
    const timer = startRestTimer(null, 180, meta, t0);
    const bumped = restartRestTimer(timer, 120, t0 + 50_000);
    expect(bumped.endsAtMs).toBe(t0 + 50_000 + 120_000);
  });

  it('extends by 30 seconds from remaining time', () => {
    const t0 = 1_000_000;
    const timer = startRestTimer(null, 180, meta, t0);
    const extended = extendRestTimer(timer, 30, t0 + 60_000);
    expect(extended.endsAtMs).toBe(t0 + 60_000 + (120 + 30) * 1000);
  });
});
