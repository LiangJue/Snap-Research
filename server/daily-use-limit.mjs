export function createDailyUseLimiter(limit) {
  const dailyLimit = Math.max(1, Number(limit) || 1);
  const keysByDay = new Map();

  return {
    reserve({ day, key }) {
      const normalizedDay = String(day || '').trim();
      const normalizedKey = String(key || '').trim();
      if (!normalizedDay || !normalizedKey) return false;

      let keys = keysByDay.get(normalizedDay);
      if (!keys) {
        keys = new Set();
        keysByDay.set(normalizedDay, keys);
      }
      if (keys.has(normalizedKey)) return true;
      if (keys.size >= dailyLimit) return false;
      keys.add(normalizedKey);

      for (const storedDay of keysByDay.keys()) {
        if (storedDay !== normalizedDay) keysByDay.delete(storedDay);
      }
      return true;
    },
    count(day) {
      return keysByDay.get(String(day || '').trim())?.size || 0;
    },
  };
}
