import { describe, expect, it } from 'vitest';

import { createDailyUseLimiter } from '../../server/daily-use-limit.mjs';

describe('Research Report daily-use seam', () => {
  it('charges a report once while allowing all tasks and retries in that report', () => {
    const limiter = createDailyUseLimiter(2);
    const day = '2026-07-26';

    expect(limiter.reserve({ day, key: 'report-a' })).toBe(true);
    expect(limiter.reserve({ day, key: 'report-a' })).toBe(true);
    expect(limiter.reserve({ day, key: 'report-b' })).toBe(true);
    expect(limiter.reserve({ day, key: 'report-c' })).toBe(false);
    expect(limiter.count(day)).toBe(2);
  });
});
