import { ref, get, set, update, push, runTransaction } from 'firebase/database';
import { db } from '@/lib/firebase';
import type { Quote, User, AppStats } from '@/types';

export const PLACEHOLDER_AVATAR = 'https://placehold.co/100x100/eef5df/1f5b4d/png?text=%D8%A3';

const UNKNOWN = 'غير معروف';

// ---------- Session User Cache ----------
// Caches user data already fetched in this session to avoid redundant reads
// of users_list when multiple quotes share the same author.
const userCache = new Map<string, User>();

async function fetchUsersBatch(userIds: string[]): Promise<Record<string, User | null>> {
  const map: Record<string, User | null> = {};
  const unique = [...new Set(userIds.filter((id) => id && id !== UNKNOWN))];
  const toFetch = unique.filter((id) => !userCache.has(id));
  await Promise.all(
    toFetch.map(async (id) => {
      try {
        const user = await getUser(id);
        if (user) userCache.set(id, user);
      } catch {
        // ignore fetch errors; user stays uncached
      }
    }),
  );
  for (const id of unique) {
    map[id] = userCache.get(id) ?? null;
  }
  return map;
}

// ---------- Auth / Users ----------

export async function checkUsernameExists(username: string): Promise<boolean> {
  const clean = username.trim().toLowerCase();
  if (!clean) return false;
  const snap = await get(ref(db, `usernames/${clean}`));
  return snap.exists();
}

export async function createUser(
  userId: string,
  name: string,
  username: string,
  hashedPassword: string,
): Promise<void> {
  const cleanName = name.trim();
  const cleanUsername = username.trim().toLowerCase();
  const now = new Date().toISOString();

  await set(ref(db, `users_list/${userId}`), {
    id: userId,
    name: cleanName,
    username: cleanUsername,
    password: hashedPassword,
    copies_us: 0,
    date_of_creating: now,
    verified: true,
  });
  await set(ref(db, `usernames/${cleanUsername}`), userId);
  await runTransaction(ref(db, 'status/totall_users'), (curr: number | null) => (curr ?? 0) + 1);
}

export async function loginUser(username: string, password: string): Promise<User | null> {
  const clean = username.trim().toLowerCase();
  const usernameSnap = await get(ref(db, `usernames/${clean}`));
  if (!usernameSnap.exists()) return null;

  const userId = usernameSnap.val() as string;
  const userSnap = await get(ref(db, `users_list/${userId}`));
  if (!userSnap.exists()) return null;

  const data = userSnap.val();
  const storedHash = data.password;
  const inputHash = await hashPassword(password);
  if (storedHash !== inputHash) return null;

  const user: User = {
    id: data.id,
    name: data.name,
    username: data.username,
    copies_us: data.copies_us ?? 0,
    dateOfCreating: data.date_of_creating,
    verified: data.verified ?? true,
  };
  userCache.set(userId, user);
  return user;
}

export async function getUser(userId: string): Promise<User | null> {
  if (!userId) return null;
  const snap = await get(ref(db, `users_list/${userId}`));
  if (!snap.exists()) return null;
  const data = snap.val();
  if (!data.name || !data.username) return null;

  const user: User = {
    id: data.id,
    name: data.name,
    username: data.username,
    copies_us: data.copies_us ?? 0,
    dateOfCreating: data.date_of_creating,
    verified: data.verified ?? true,
  };
  userCache.set(userId, user);
  return user;
}

export async function getUserByUsername(username: string): Promise<User | null> {
  const clean = username.trim().toLowerCase();
  const usernameSnap = await get(ref(db, `usernames/${clean}`));
  if (!usernameSnap.exists()) return null;
  return getUser(usernameSnap.val() as string);
}

// ---------- Quotes ----------

export async function fetchQuotes(
  batchSize: number = 10,
  offset: number = 0,
): Promise<{ quotes: Quote[]; nextOffset: number | null }> {
  const snap = await get(ref(db, 'quotes_list'));
  if (!snap.exists()) return { quotes: [], nextOffset: null };

  const all: Quote[] = [];
  const userIds: string[] = [];
  snap.forEach((child) => {
    const data = child.val();
    const uid = data.user_id ?? UNKNOWN;
    userIds.push(uid);
    all.push({
      id: child.key as string,
      text: data.text ?? UNKNOWN,
      userId: uid,
      time: data.time ?? UNKNOWN,
      copies: data.copies ?? 0,
      verified: false,
      user: null,
    });
  });

  const usersMap = await fetchUsersBatch(userIds);
  for (const q of all) {
    const u = usersMap[q.userId] ?? null;
    q.user = u;
    q.verified = u?.verified ?? false;
  }

  all.sort((a, b) => {
    const ta = a.time !== UNKNOWN ? new Date(a.time).getTime() : 0;
    const tb = b.time !== UNKNOWN ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });

  const batch = all.slice(offset, offset + batchSize);
  const nextOffset = offset + batchSize < all.length ? offset + batchSize : null;

  return { quotes: batch, nextOffset };
}

export async function publishQuote(text: string, userId: string): Promise<string | null> {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const now = Date.now();
  const quoteRef = push(ref(db, 'quotes_list'));
  const quoteId = quoteRef.key!;
  await set(quoteRef, {
    id: quoteId,
    text: trimmed,
    user_id: userId,
    time: new Date(now).toISOString(),
    copies: 0,
  });
  await runTransaction(ref(db, 'status/totall_quotes'), (curr: number | null) => (curr ?? 0) + 1);
  return quoteId;
}

export async function incrementCopy(quoteId: string, userId: string): Promise<void> {
  const quoteRef = ref(db, `quotes_list/${quoteId}/copies`);
  const snap = await get(quoteRef);
  const current = snap.exists() ? snap.val() : 0;
  await update(ref(db, `quotes_list/${quoteId}`), { copies: current + 1 });

  if (userId) {
    const userRef = ref(db, `users_list/${userId}/copies_us`);
    const uSnap = await get(userRef);
    const uCurrent = uSnap.exists() ? uSnap.val() : 0;
    await update(ref(db, `users_list/${userId}`), { copies_us: uCurrent + 1 });
  }
  await runTransaction(ref(db, 'status/totall_copies'), (curr: number | null) => (curr ?? 0) + 1);
}

export async function getUserQuotes(userId: string): Promise<Quote[]> {
  const snap = await get(ref(db, 'quotes_list'));
  if (!snap.exists()) return [];

  const quotes: Quote[] = [];
  snap.forEach((child) => {
    const data = child.val();
    if ((data.user_id ?? UNKNOWN) !== userId) return;
    quotes.push({
      id: child.key as string,
      text: data.text ?? UNKNOWN,
      userId: data.user_id ?? UNKNOWN,
      time: data.time ?? UNKNOWN,
      copies: data.copies ?? 0,
      verified: false,
      user: null,
    });
  });

  const usersMap = await fetchUsersBatch([userId]);
  const u = usersMap[userId] ?? null;
  for (const q of quotes) {
    q.user = u;
    q.verified = u?.verified ?? false;
  }

  quotes.sort((a, b) => {
    const ta = a.time !== UNKNOWN ? new Date(a.time).getTime() : 0;
    const tb = b.time !== UNKNOWN ? new Date(b.time).getTime() : 0;
    return tb - ta;
  });
  return quotes;
}

// ---------- Stats ----------

export async function getAppStats(): Promise<AppStats> {
  try {
    const snap = await get(ref(db, 'status'));
    if (!snap.exists()) {
      return { totall_users: UNKNOWN, totall_quotes: UNKNOWN, totall_copies: UNKNOWN };
    }
    const data = snap.val();
    return {
      totall_users: data.totall_users ?? UNKNOWN,
      totall_quotes: data.totall_quotes ?? UNKNOWN,
      totall_copies: data.totall_copies ?? UNKNOWN,
    };
  } catch {
    return { totall_users: UNKNOWN, totall_quotes: UNKNOWN, totall_copies: UNKNOWN };
  }
}

// ---------- Account Update ----------

export async function updateUserProfile(
  userId: string,
  name: string,
): Promise<void> {
  await update(ref(db, `users_list/${userId}`), { name: name.trim() });
  userCache.delete(userId);
}

// Simple SHA-256 hash using SubtleCrypto for storing passwords
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}
