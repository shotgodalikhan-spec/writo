// Simple brute-force protection for login and sign-up (15-minute window).
const WINDOW_MS = 15 * 60 * 1000;

export async function tooManyAttempts(db, key, max) {
  const row = await db.prepare("SELECT count, window_start FROM login_attempts WHERE key = ?").bind(key).first();
  if (!row) return false;
  if (Date.now() - row.window_start > WINDOW_MS) return false;
  return row.count >= max;
}

export async function noteAttempt(db, key) {
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO login_attempts (key, count, window_start) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = CASE WHEN ? - window_start > ? THEN 1 ELSE count + 1 END, window_start = CASE WHEN ? - window_start > ? THEN ? ELSE window_start END")
      .bind(key, now, now, WINDOW_MS, now, WINDOW_MS, now),
    db.prepare("DELETE FROM login_attempts WHERE window_start < ?").bind(now - 24 * 3600 * 1000),
  ]);
}

export async function clearAttempts(db, key) {
  await db.prepare("DELETE FROM login_attempts WHERE key = ?").bind(key).run();
}
