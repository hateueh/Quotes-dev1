import { useEffect, useState, useCallback, useRef } from 'react';
import {
  ArrowRight,
  Check,
  ChevronLeft,
  Copy,
  Feather,
  Home,
  LogIn,
  Moon,
  Plus,
  Search,
  Settings as SettingsIcon,
  Share2,
  Sparkles,
  UserRound,
  X,
  Loader2,
  Eye,
  EyeOff,
  Pencil,
  FileText,
  Users,
  Copy as CopyIcon,
  Sun,
  Info,
} from 'lucide-react';
import type { Quote, User, Screen, AppStats } from '@/types';
import { timeAgo, generateId } from '@/lib/timeAgo';
import {
  fetchQuotes,
  incrementCopy,
  publishQuote,
  getUser,
  createUser,
  loginUser,
  getUserQuotes,
  checkUsernameExists,
  hashPassword,
  PLACEHOLDER_AVATAR,
  getAppStats,
  updateUserProfile,
} from '@/lib/firebaseData';

const STORAGE_KEY = 'athar_session';
const DARK_KEY = 'athar_dark_mode';
const PLACEHOLDER_IMG = PLACEHOLDER_AVATAR;

interface StoredSession {
  userId: string;
  username: string;
}

function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as StoredSession;
  } catch {
    return null;
  }
}

function saveSession(s: StoredSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
}

function clearSession() {
  localStorage.removeItem(STORAGE_KEY);
}

// ---------- Dev Error Panel ----------
function DevErrorPanel({ error, onDismiss }: { error: string; onDismiss: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard?.writeText(error);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };
  return (
    <div className="dev-error-panel" dir="ltr">
      <div className="dev-error-head">
        <span className="dev-error-tag">DEV ERROR</span>
        <div className="dev-error-actions">
          <button onClick={handleCopy} className="dev-error-copy">
            {copied ? <><Check size={13} /> Copied</> : <><Copy size={13} /> Copy</>}
          </button>
          <button onClick={onDismiss} className="dev-error-close"><X size={14} /></button>
        </div>
      </div>
      <pre className="dev-error-body">{error}</pre>
    </div>
  );
}

function VerifiedBadge({ verified = true }: { verified?: boolean }) {
  if (!verified) return null;
  return <span className="verified" aria-label="حساب موثق"><Check size={11} strokeWidth={4} /></span>;
}

function Avatar({ src, small = false }: { src?: string; small?: boolean }) {
  const cls = small ? 'avatar avatar-small' : 'avatar';
  return <img src={src ?? PLACEHOLDER_IMG} alt="صورة شخصية" className={cls} loading="lazy" />;
}

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [screen, setScreen] = useState<Screen>('home');
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [currentOffset, setCurrentOffset] = useState<number | null>(null);
  const [loadingQuotes, setLoadingQuotes] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [publisherQuotes, setPublisherQuotes] = useState<Quote[]>([]);
  const [showPublish, setShowPublish] = useState(false);
  const [publishText, setPublishText] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [myQuotes, setMyQuotes] = useState<Quote[]>([]);
  const [authReady, setAuthReady] = useState(false);
  const [devError, setDevError] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(false);
  const [appStats, setAppStats] = useState<AppStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [showEditAccount, setShowEditAccount] = useState(false);
  const loadMoreLock = useRef(false);
  const currentUserId = useRef<string | null>(null);

  // Splash
  useEffect(() => {
    const timeout = window.setTimeout(() => setShowSplash(false), 3000);
    return () => window.clearTimeout(timeout);
  }, []);

  // Dark mode
  useEffect(() => {
    const stored = localStorage.getItem(DARK_KEY);
    if (stored === 'true') {
      setDarkMode(true);
      document.body.classList.add('dark-mode');
    }
  }, []);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => {
      const next = !prev;
      if (next) {
        document.body.classList.add('dark-mode');
        localStorage.setItem(DARK_KEY, 'true');
      } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem(DARK_KEY, 'false');
      }
      return next;
    });
  }, []);

  // Load app stats when settings opens
  useEffect(() => {
    if (screen === 'settings' && !appStats && !statsLoading) {
      setStatsLoading(true);
      getAppStats()
        .then((stats) => setAppStats(stats))
        .catch(() => setAppStats({ totall_users: 'غير معروف', totall_quotes: 'غير معروف', totall_copies: 'غير معروف' }))
        .finally(() => setStatsLoading(false));
    }
  }, [screen, appStats, statsLoading]);

  // Restore session from localStorage on mount
  useEffect(() => {
    (async () => {
      const stored = loadSession();
      if (stored) {
        try {
          const user = await getUser(stored.userId);
          if (user) {
            currentUserId.current = stored.userId;
            setCurrentUser(user);
            setSignedIn(true);
          } else {
            clearSession();
          }
        } catch {
          clearSession();
        }
      }
      setAuthReady(true);
    })();
  }, []);

  // Load first batch of quotes
  const loadQuotes = useCallback(async () => {
    setLoadingQuotes(true);
    setFetchError(false);
    try {
      const { quotes: batch, nextOffset } = await fetchQuotes(10, 0);
      setQuotes(batch);
      setCurrentOffset(nextOffset);
      setHasMore(nextOffset !== null);
    } catch (err: unknown) {
      setFetchError(true);
      const msg = err instanceof Error ? `${err.message}` : String(err);
      setDevError(`[loadQuotes]\n${msg}`);
    } finally {
      setLoadingQuotes(false);
    }
  }, []);

  useEffect(() => {
    if (screen === 'home' && quotes.length === 0) {
      loadQuotes();
    }
  }, [screen, quotes.length, loadQuotes]);

  // Infinite scroll
  useEffect(() => {
    if (screen !== 'home') return;
    const onScroll = () => {
      const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 360;
      if (!nearBottom || loadingMore || !hasMore || loadMoreLock.current || currentOffset === null) return;
      loadMoreLock.current = true;
      setLoadingMore(true);
      (async () => {
        try {
          const { quotes: batch, nextOffset } = await fetchQuotes(10, currentOffset);
          setQuotes((prev) => [...prev, ...batch]);
          setCurrentOffset(nextOffset);
          setHasMore(nextOffset !== null);
        } catch {
          setHasMore(false);
        } finally {
          setLoadingMore(false);
          loadMoreLock.current = false;
        }
      })();
    };
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, [screen, loadingMore, hasMore, currentOffset]);

  // Copy quote
  const handleCopy = async (quoteId: string, text: string, userId: string) => {
    try {
      await navigator.clipboard?.writeText(text);
    } catch {
      // ignore
    }
    setQuotes((items) => items.map((q) => q.id === quoteId ? { ...q, copies: q.copies + 1 } : q));
    setPublisherQuotes((items) => items.map((q) => q.id === quoteId ? { ...q, copies: q.copies + 1 } : q));
    setMyQuotes((items) => items.map((q) => q.id === quoteId ? { ...q, copies: q.copies + 1 } : q));
    setCopied(quoteId);
    window.setTimeout(() => setCopied(null), 1600);
    try {
      await incrementCopy(quoteId, userId);
    } catch {
      // optimistic already applied
    }
  };

  // After successful signup/login
  const onAuthSuccess = useCallback(async (userId: string) => {
    const user = await getUser(userId);
    if (user) {
      currentUserId.current = userId;
      setCurrentUser(user);
      setSignedIn(true);
      saveSession({ userId, username: user.username });
      setScreen('profile');
    }
  }, []);

  // Publish quote
  const handlePublish = async () => {
    const trimmed = publishText.trim();
    if (!trimmed || !currentUser) return;
    setPublishing(true);
    try {
      const quoteId = await publishQuote(trimmed, currentUser.id);
      if (quoteId) {
        const newQuote: Quote = {
          id: quoteId,
          text: trimmed,
          userId: currentUser.id,
          time: new Date().toISOString(),
          copies: 0,
          verified: currentUser.verified,
          user: currentUser,
        };
        setQuotes((prev) => [newQuote, ...prev]);
        setMyQuotes((prev) => [newQuote, ...prev]);
      }
      setPublishText('');
      setShowPublish(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDevError(`[handlePublish]\n${msg}`);
    } finally {
      setPublishing(false);
    }
  };

  // Open publisher profile
  const openPublisher = async (userId: string) => {
    if (!userId) return;
    setScreen('publisher');
    try {
      const user = await getUser(userId);
      setSelectedUser(user);
      const uQuotes = await getUserQuotes(userId);
      setPublisherQuotes(uQuotes);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDevError(`[openPublisher] userId=${userId}\n${msg}`);
    }
  };

  // Load my quotes when profile opens
  useEffect(() => {
    if (screen === 'profile' && currentUser && myQuotes.length === 0) {
      (async () => {
        try {
          const uQuotes = await getUserQuotes(currentUser.id);
          setMyQuotes(uQuotes);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          setDevError(`[loadMyQuotes]\n${msg}`);
        }
      })();
    }
  }, [screen, currentUser, myQuotes.length]);

  // Handle sign out
  const handleSignOut = () => {
    clearSession();
    currentUserId.current = null;
    setSignedIn(false);
    setCurrentUser(null);
    setMyQuotes([]);
    setScreen('home');
  };

  // Handle account edit
  const handleEditAccount = async (newName: string) => {
    if (!currentUser) return;
    try {
      await updateUserProfile(currentUser.id, newName);
      const updated = { ...currentUser, name: newName.trim() };
      setCurrentUser(updated);
      saveSession({ userId: currentUser.id, username: currentUser.username });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setDevError(`[handleEditAccount]\n${msg}`);
    }
  };

  // ---------- Render ----------

  const devErrorPanel = devError && <DevErrorPanel error={devError} onDismiss={() => setDevError(null)} />;

  if (showSplash) {
    return (
      <div className="splash">
        <div className="splash-mark"><Feather size={34} /></div>
        <h1>أثر</h1>
        <p>عبارتك، بصمتك</p>
        <div className="splash-loader"><span /></div>
        {devErrorPanel}
      </div>
    );
  }

  if (!authReady) {
    return (
      <div className="app-frame">
        <div className="full-loader">
          <div className="full-loader-mark"><Feather size={28} /></div>
          <Loader2 size={24} className="spin" />
          <span>جارٍ التحميل...</span>
        </div>
        {devErrorPanel}
      </div>
    );
  }

  if (screen === 'auth') {
    return (
      <AuthScreen
        onSuccess={onAuthSuccess}
        onBack={() => setScreen('home')}
        devError={devError}
        onDevError={setDevError}
      />
    );
  }

  if (screen === 'onboarding') {
    return (
      <OnboardingScreen
        userId={currentUserId.current!}
        onSuccess={onAuthSuccess}
        devError={devError}
        onDevError={setDevError}
      />
    );
  }

  return (
    <div className="app-frame">
      {devErrorPanel}
      <header className="topbar">
        <div className="brand">
          <div className="brand-icon"><Feather size={19} /></div>
          <span>أثر</span>
        </div>
        <button className="icon-button" aria-label="بحث"><Search size={20} /></button>
      </header>
      <main className="content">
        {screen === 'home' && (
          <HomeScreen
            quotes={quotes}
            loading={loadingQuotes}
            loadingMore={loadingMore}
            hasMore={hasMore}
            copied={copied}
            onCopy={handleCopy}
            onPublisher={openPublisher}
            fetchError={fetchError}
            onRetry={loadQuotes}
          />
        )}
        {screen === 'settings' && (
          <SettingsScreen
            darkMode={darkMode}
            onToggleDarkMode={toggleDarkMode}
            appStats={appStats}
            statsLoading={statsLoading}
          />
        )}
        {screen === 'profile' && (
          <ProfileScreen
            signedIn={signedIn}
            currentUser={currentUser}
            myQuotes={myQuotes}
            copied={copied}
            onCopy={handleCopy}
            onLogin={() => setScreen('auth')}
            onPublish={() => setShowPublish(true)}
            onSignOut={handleSignOut}
            onEditAccount={() => setShowEditAccount(true)}
          />
        )}
        {screen === 'publisher' && (
          <PublisherScreen
            user={selectedUser}
            quotes={publisherQuotes}
            copied={copied}
            onCopy={handleCopy}
            onBack={() => setScreen('home')}
          />
        )}
      </main>
      {screen !== 'publisher' && (
        <nav className="bottom-nav">
          <button className={screen === 'home' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('home')}>
            <Home size={22} /><span>الرئيسية</span>
          </button>
          <button className={screen === 'settings' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('settings')}>
            <SettingsIcon size={22} /><span>الإعدادات</span>
          </button>
          <button className={screen === 'profile' ? 'nav-item active' : 'nav-item'} onClick={() => setScreen('profile')}>
            <UserRound size={22} /><span>ملفي</span>
          </button>
        </nav>
      )}
      {showPublish && (
        <PublishSheet
          text={publishText}
          setText={setPublishText}
          onClose={() => setShowPublish(false)}
          onPublish={handlePublish}
          publishing={publishing}
        />
      )}
      {showEditAccount && currentUser && (
        <EditAccountSheet
          currentName={currentUser.name}
          onClose={() => setShowEditAccount(false)}
          onSave={async (name) => { await handleEditAccount(name); setShowEditAccount(false); }}
        />
      )}
    </div>
  );
}

// ---------- Auth Screen (Login + Signup) ----------

function AuthScreen({ onSuccess, onBack, devError, onDevError }: {
  onSuccess: (userId: string) => void;
  onBack: () => void;
  devError: string | null;
  onDevError: (e: string | null) => void;
}) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Real-time username validation (signup only)
  useEffect(() => {
    if (mode !== 'signup') return;
    const raw = username.trim();
    // strip leading @ for validation
    const clean = raw.startsWith('@') ? raw.slice(1) : raw;
    if (!clean || clean.length < 3) {
      setUsernameAvailable(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);
    setUsernameChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const exists = await checkUsernameExists(clean);
        setUsernameAvailable(!exists);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username, mode]);

  const handleSubmit = async () => {
    setError('');

    if (mode === 'signup') {
      const cleanName = name.trim();
      const rawUser = username.trim();
      const cleanUser = rawUser.startsWith('@') ? rawUser.slice(1) : rawUser;

      if (cleanName.length < 2) {
        setError('يرجى إدخال اسمك بالكامل.');
        return;
      }
      if (!/^[a-zA-Z][a-zA-Z0-9._]{2,19}$/.test(cleanUser)) {
        setError('المعرّف يجب أن يبدأ بحرف إنجليزي ويحتوي على 3 إلى 20 حرفاً أو رقماً.');
        return;
      }
      if (password.length < 8) {
        setError('كلمة المرور يجب أن لا تقل عن 8 رموز.');
        return;
      }

      setLoading(true);
      try {
        const exists = await checkUsernameExists(cleanUser);
        if (exists) {
          setError('هذا المعرف مستخدم بالفعل، يرجى اختيار معرف آخر.');
          setLoading(false);
          return;
        }
        const userId = generateId(24);
        const hashed = await hashPassword(password);
        await createUser(userId, cleanName, cleanUser, hashed);
        await onSuccess(userId);
      } catch (err: unknown) {
        setError('تعذّر إنشاء الحساب. تحقق من اتصالك وحاول مرة أخرى.');
        const msg = err instanceof Error ? err.message : String(err);
        onDevError(`[signup] username=${username}\n${msg}`);
      } finally {
        setLoading(false);
      }
    } else {
      // login
      const rawUser = username.trim();
      const cleanUser = rawUser.startsWith('@') ? rawUser.slice(1) : rawUser;
      if (!cleanUser || !password) {
        setError('يرجى إدخال المعرّف وكلمة المرور.');
        return;
      }

      setLoading(true);
      try {
        const user = await loginUser(cleanUser, password);
        if (!user) {
          setError('المعرّف أو كلمة المرور غير صحيحة.');
          setLoading(false);
          return;
        }
        await onSuccess(user.id);
      } catch (err: unknown) {
        setError('تعذّر تسجيل الدخول. تحقق من اتصالك وحاول مرة أخرى.');
        const msg = err instanceof Error ? err.message : String(err);
        onDevError(`[login] username=${username}\n${msg}`);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <div className="app-frame">
      {devError && <DevErrorPanel error={devError} onDismiss={() => onDevError(null)} />}
      <div className="auth-screen">
        <div className="auth-top">
          <button className="back-button" onClick={onBack}><ChevronLeft size={21} /></button>
          <div className="brand-mini">
            <div className="brand-icon"><Feather size={18} /></div>
            <span>أثر</span>
          </div>
        </div>

        <div className="auth-art">
          <Sparkles size={34} />
          <span>{mode === 'signup' ? 'انضم إلى عالم أثر' : 'مرحباً بعودتك'}</span>
        </div>

        <div className="auth-copy">
          <span className="eyebrow">{mode === 'signup' ? 'حساب جديد' : 'تسجيل الدخول'}</span>
          <h1>{mode === 'signup' ? 'أنشئ حسابك' : 'ادخل إلى حسابك'}</h1>
          <p>{mode === 'signup' ? 'اختر معرّفاً فريداً يبدأ بـ @، وابدأ مشاركة عباراتك.' : 'أدخل معرّفك وكلمة المرور للمتابعة.'}</p>
        </div>

        <div className="form-stack">
          {mode === 'signup' && (
            <label>
              الاسم الظاهر
              <input value={name} onChange={(e) => { setName(e.target.value); setError(''); }} placeholder="مثال: أحمد سالم" />
            </label>
          )}

          <label>
            المعرّف الفريد
            <div className="input-with-status">
              <input
                value={username}
                onChange={(e) => { setUsername(e.target.value.replace(/\s/g, '')); setError(''); setUsernameAvailable(null); }}
                placeholder="@ahmed707"
                dir="ltr"
              />
              {mode === 'signup' && usernameChecking && <Loader2 size={16} className="spin input-icon" />}
              {mode === 'signup' && !usernameChecking && usernameAvailable === true && <Check size={16} className="input-icon input-ok" />}
              {mode === 'signup' && !usernameChecking && usernameAvailable === false && <X size={16} className="input-icon input-bad" />}
            </div>
            {mode === 'signup' && usernameAvailable === false && (
              <small className="input-error-msg">هذا المعرف مستخدم بالفعل، يرجى اختيار معرف آخر.</small>
            )}
            {mode === 'signup' && usernameAvailable === true && (
              <small className="input-ok-msg">هذا المعرف متاح!</small>
            )}
            {mode === 'signup' && usernameAvailable === null && (
              <small>يبدأ بـ @ ويحتوي على 3 إلى 20 حرفاً أو رقماً</small>
            )}
          </label>

          <label>
            كلمة المرور
            <div className="input-with-status">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder={mode === 'signup' ? '8 رموز على الأقل' : 'كلمة المرور'}
                dir="ltr"
              />
              <button type="button" className="input-icon input-toggle" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {mode === 'signup' && <small>كلمة مرور قوية لا تقل عن 8 رموز</small>}
          </label>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button className="primary-button" onClick={handleSubmit} disabled={loading}>
            {loading
              ? <><Loader2 size={18} className="spin" /> جارٍ المعالجة...</>
              : <>{mode === 'signup' ? 'إنشاء الحساب' : 'تسجيل الدخول'} <ArrowRight size={18} /></>
            }
          </button>
        </div>

        <p className="auth-switch">
          {mode === 'signup' ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}
          <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setUsernameAvailable(null); }}>
            {mode === 'signup' ? 'تسجيل الدخول' : 'إنشاء حساب'}
          </button>
        </p>
      </div>
    </div>
  );
}

// ---------- Onboarding (for existing users without profile) ----------

function OnboardingScreen({ userId, onSuccess, devError, onDevError }: {
  userId: string;
  onSuccess: (userId: string) => void;
  devError: string | null;
  onDevError: (e: string | null) => void;
}) {
  const [accountName, setAccountName] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [usernameChecking, setUsernameChecking] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const raw = username.trim();
    const clean = raw.startsWith('@') ? raw.slice(1) : raw;
    if (!clean || clean.length < 3) {
      setUsernameAvailable(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setUsernameChecking(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const exists = await checkUsernameExists(clean);
        setUsernameAvailable(!exists);
      } catch {
        setUsernameAvailable(null);
      } finally {
        setUsernameChecking(false);
      }
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [username]);

  const saveProfile = async () => {
    const cleanName = accountName.trim();
    const rawUser = username.trim();
    const cleanUser = rawUser.startsWith('@') ? rawUser.slice(1) : rawUser;

    if (cleanName.length < 2) {
      setError('اكتب اسم الحساب بالكامل قبل المتابعة.');
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z0-9._]{2,19}$/.test(cleanUser)) {
      setError('المعرّف يجب أن يبدأ بحرف إنجليزي ويحتوي على 3 إلى 20 حرفاً أو رقماً.');
      return;
    }
    if (password.length < 8) {
      setError('كلمة المرور يجب أن لا تقل عن 8 رموز.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const exists = await checkUsernameExists(cleanUser);
      if (exists) {
        setError('هذا المعرف مستخدم بالفعل، يرجى اختيار معرف آخر.');
        setSaving(false);
        return;
      }
      const hashed = await hashPassword(password);
      await createUser(userId, cleanName, cleanUser, hashed);
      await onSuccess(userId);
    } catch (err: unknown) {
      setError('تعذّر حفظ البيانات. تحقق من اتصالك وحاول مرة أخرى.');
      const msg = err instanceof Error ? err.message : String(err);
      onDevError(`[saveProfile] userId=${userId}\n${msg}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="app-frame">
      {devError && <DevErrorPanel error={devError} onDismiss={() => onDevError(null)} />}
      <div className="onboarding-screen">
        <div className="brand-mini">
          <div className="brand-icon"><Feather size={18} /></div>
          <span>أثر</span>
        </div>
        <div className="onboarding-art">
          <Sparkles size={34} />
          <span>خطوة واحدة تفصلك عن ترك أثرك</span>
        </div>
        <div className="onboarding-copy">
          <span className="eyebrow">أهلاً بك في أثر</span>
          <h1>عرّفنا بنفسك</h1>
          <p>اختر اسماً يعبّر عنك، وابدأ مشاركة الكلمات التي تستحق أن تُقرأ.</p>
        </div>
        <div className="form-stack">
          <label>
            الاسم الظاهر
            <input value={accountName} onChange={(e) => { setAccountName(e.target.value); setError(''); }} placeholder="مثال: أحمد سالم" />
          </label>
          <label>
            المعرّف الفريد
            <div className="input-with-status">
              <input
                value={username}
                onChange={(e) => { setUsername(e.target.value.replace(/\s/g, '')); setError(''); setUsernameAvailable(null); }}
                placeholder="@ahmed707"
                dir="ltr"
              />
              {usernameChecking && <Loader2 size={16} className="spin input-icon" />}
              {!usernameChecking && usernameAvailable === true && <Check size={16} className="input-icon input-ok" />}
              {!usernameChecking && usernameAvailable === false && <X size={16} className="input-icon input-bad" />}
            </div>
            {usernameAvailable === false && (
              <small className="input-error-msg">هذا المعرف مستخدم بالفعل، يرجى اختيار معرف آخر.</small>
            )}
            {usernameAvailable === true && (
              <small className="input-ok-msg">هذا المعرف متاح!</small>
            )}
            {usernameAvailable === null && (
              <small>يبدأ بـ @ ويحتوي على 3 إلى 20 حرفاً أو رقماً</small>
            )}
          </label>
          <label>
            كلمة المرور
            <div className="input-with-status">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                placeholder="8 رموز على الأقل"
                dir="ltr"
              />
              <button type="button" className="input-icon input-toggle" onClick={() => setShowPassword((s) => !s)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <small>كلمة مرور قوية لا تقل عن 8 رموز</small>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" onClick={saveProfile} disabled={saving}>
            {saving ? <><Loader2 size={18} className="spin" /> جارٍ الحفظ...</> : <>حفظ والبدء <ArrowRight size={18} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Home ----------

function HomeScreen({ quotes, loading, loadingMore, hasMore, copied, onCopy, onPublisher, fetchError, onRetry }: {
  quotes: Quote[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  copied: string | null;
  onCopy: (id: string, text: string, userId: string) => void;
  onPublisher: (userId: string) => void;
  fetchError: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="home-screen">
      <section className="hero">
        <div>
          <span className="eyebrow">مساحة للكلمات التي تبقى</span>
          <h1>خذ كلمة،<br /><em>واترك أثراً.</em></h1>
        </div>
        <div className="hero-spark"><Sparkles size={20} /></div>
      </section>
      <div className="feed-heading">
        <h2>أحدث العبارات</h2>
        <span>مختارة لك</span>
      </div>
      {loading ? (
        <div className="loading-state"><Loader2 size={26} className="spin" /><span>جارٍ تحميل العبارات...</span></div>
      ) : fetchError ? (
        <div className="empty-feed">
          <Feather size={28} />
          <p>تعذّر جلب العبارات. تأكد من اتصال قاعدة البيانات وحاول مرة أخرى.</p>
          <button className="primary-button" onClick={onRetry}>إعادة المحاولة</button>
        </div>
      ) : quotes.length === 0 ? (
        <div className="empty-feed"><Feather size={28} /><p>لا توجد عبارات بعد. كن أول من يترك أثراً!</p></div>
      ) : (
        <div className="quote-list">
          {quotes.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} copied={copied === quote.id} onCopy={() => onCopy(quote.id, quote.text, quote.userId)} onPublisher={() => onPublisher(quote.userId)} />
          ))}
        </div>
      )}
      {loadingMore && <div className="loading-more"><Loader2 size={18} className="spin" /> جارٍ تحميل المزيد...</div>}
      {!loading && !loadingMore && !hasMore && quotes.length > 0 && <div className="end-feed">وصلت إلى النهاية</div>}
    </div>
  );
}

// ---------- Quote Card ----------

function QuoteCard({ quote, copied, onCopy, onPublisher }: {
  quote: Quote;
  copied: boolean;
  onCopy: () => void;
  onPublisher: () => void;
}) {
  return (
    <article className="quote-card">
      <div className="quote-author">
        <Avatar small />
        <div className="author-info">
          <button className="publisher-name" onClick={onPublisher}>
            {quote.user?.name || 'غير معروف'}<VerifiedBadge verified={quote.verified} />
          </button>
          <button className="username-link" onClick={onPublisher} dir="ltr">@{quote.user?.username || 'غير معروف'}</button>
        </div>
        <button className="share-button" aria-label="مشاركة"><Share2 size={17} /></button>
      </div>
      <p className="quote-text">{quote.text || 'غير معروف'}</p>
      <div className="quote-footer">
        <span>{timeAgo(quote.time)}</span>
        <button className={copied ? 'copy-button copied' : 'copy-button'} onClick={onCopy}>
          {copied ? <><Check size={15} /> تم النسخ</> : <><Copy size={15} /> نسخ العبارة</>}
          <b>{quote.copies ?? 'غير معروف'}</b>
        </button>
      </div>
    </article>
  );
}

// ---------- Profile ----------

function ProfileScreen({ signedIn, currentUser, myQuotes, copied, onCopy, onLogin, onPublish, onSignOut, onEditAccount }: {
  signedIn: boolean;
  currentUser: User | null;
  myQuotes: Quote[];
  copied: string | null;
  onCopy: (id: string, text: string, userId: string) => void;
  onLogin: () => void;
  onPublish: () => void;
  onSignOut: () => void;
  onEditAccount: () => void;
}) {
  if (!signedIn || !currentUser) {
    return (
      <div className="profile-screen">
        <div className="profile-head">
          <div className="profile-title">
            <span className="eyebrow">مساحتي</span>
            <h1>ملفي الشخصي</h1>
          </div>
        </div>
        <div className="empty-profile">
          <div className="empty-orbit"><Feather size={34} /></div>
          <h2>كن مبدعاً</h2>
          <p>شارك العالم أفكارك، واترك شيئاً جميلاً<br />يستحق أن يُتداول.</p>
          <button className="primary-button" onClick={onLogin}>
            <LogIn size={18} /> تسجيل الدخول / إنشاء حساب
          </button>
          <span className="login-note"><LogIn size={14} /> انضم بمعرّف فريد وكلمة مرور</span>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-screen">
      <div className="profile-head">
        <div className="profile-title">
          <span className="eyebrow">مساحتي</span>
          <h1>ملفي الشخصي</h1>
        </div>
        <div className="profile-head-actions">
          <button className="icon-button" aria-label="تعديل الحساب" onClick={onEditAccount}>
            <Pencil size={17} />
          </button>
          <button className="icon-button" aria-label="تسجيل الخروج" onClick={onSignOut}>
            <LogIn size={18} style={{ transform: 'scaleX(-1)' }} />
          </button>
        </div>
      </div>
      <div className="account-card">
        <Avatar src={PLACEHOLDER_IMG} />
        <div className="account-details">
          <div className="account-name">{currentUser.name || 'غير معروف'}<VerifiedBadge verified={currentUser.verified} /></div>
          <span dir="ltr">@{currentUser.username || 'غير معروف'}</span>
        </div>
        <div className="account-copies">
          <strong>{currentUser.copies_us.toLocaleString('ar-EG')}</strong>
          <span>مرّة نسخ</span>
        </div>
      </div>
      <div className="profile-posts">
        <div className="section-heading">
          <div>
            <span className="eyebrow">أرشيفك</span>
            <h2>منشوراتي <small>{myQuotes.length}</small></h2>
          </div>
          <button className="add-button" onClick={onPublish}><Plus size={17} /> إضافة</button>
        </div>
        {myQuotes.length === 0 ? (
          <div className="no-posts">
            <Feather size={25} />
            <h3>ضع بصمتك!</h3>
            <p>أول عبارة لك تبدأ منها حكاية جميلة.</p>
            <button className="primary-button" onClick={onPublish}><Plus size={17} /> إضافة منشور</button>
          </div>
        ) : (
          <div className="quote-list compact">
            {myQuotes.map((quote) => (
              <QuoteCard key={quote.id} quote={quote} copied={copied === quote.id} onCopy={() => onCopy(quote.id, quote.text, quote.userId)} onPublisher={() => undefined} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------- Publisher ----------

function PublisherScreen({ user, quotes, copied, onCopy, onBack }: {
  user: User | null;
  quotes: Quote[];
  copied: string | null;
  onCopy: (id: string, text: string, userId: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="publisher-screen">
      <div className="publisher-top">
        <button className="back-button" onClick={onBack}><ChevronLeft size={21} /></button>
        <span>ملف الناشر</span>
      </div>
      <div className="publisher-hero">
        <div className="publisher-avatar-wrap">
          <Avatar src={PLACEHOLDER_IMG} />
        </div>
        <h1>{user?.name || 'غير معروف'} <VerifiedBadge verified={user?.verified ?? false} /></h1>
        <span className="publisher-username" dir="ltr">@{user?.username || 'غير معروف'}</span>
        <p className="publisher-bio">يكتب ليترك في كل يوم معنى جديداً.</p>
        <div className="publisher-stat-row">
          <div className="publisher-stat-item">
            <strong>{(user?.copies_us ?? 0).toLocaleString('ar-EG')}</strong>
            <span>مرّة نسخ</span>
          </div>
          <div className="publisher-stat-divider" />
          <div className="publisher-stat-item">
            <strong>{quotes.length}</strong>
            <span>عبارة منشورة</span>
          </div>
        </div>
      </div>
      <div className="section-heading publisher-heading">
        <div>
          <span className="eyebrow">مختاراته</span>
          <h2>العبارات <small>{quotes.length}</small></h2>
        </div>
      </div>
      {quotes.length === 0 ? (
        <div className="empty-feed"><Feather size={25} /><p>لا توجد عبارات لهذا الناشر بعد.</p></div>
      ) : (
        <div className="quote-list compact">
          {quotes.map((quote) => (
            <QuoteCard key={quote.id} quote={quote} copied={copied === quote.id} onCopy={() => onCopy(quote.id, quote.text, quote.userId)} onPublisher={() => undefined} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------- Publish Sheet ----------

function PublishSheet({ text, setText, onClose, onPublish, publishing }: {
  text: string;
  setText: (t: string) => void;
  onClose: () => void;
  onPublish: () => void;
  publishing: boolean;
}) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="publish-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-top">
          <div>
            <span className="eyebrow">منك إلى العالم</span>
            <h2>اكتب أثرك</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>
        <textarea autoFocus value={text} onChange={(e) => setText(e.target.value)} placeholder="ما العبارة التي تستحق أن تُقرأ اليوم؟" maxLength={180} />
        <div className="sheet-footer">
          <span>{text.length}/180</span>
          <button className="primary-button" onClick={onPublish} disabled={publishing || !text.trim()}>
            {publishing ? <Loader2 size={16} className="spin" /> : <Feather size={16} />}
            {publishing ? 'جارٍ النشر...' : 'نشر العبارة'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Settings Screen ----------

function SettingsScreen({ darkMode, onToggleDarkMode, appStats, statsLoading }: {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  appStats: AppStats | null;
  statsLoading: boolean;
}) {
  const [showAbout, setShowAbout] = useState(false);
  const formatStat = (val: number | string): string => {
    if (typeof val === 'number') return val.toLocaleString('ar-EG');
    return val;
  };

  return (
    <div className="settings-screen">
      <div className="settings-head">
        <div className="profile-title">
          <span className="eyebrow">تخصيص</span>
          <h1>الإعدادات</h1>
        </div>
      </div>

      <div className="settings-section">
        <span className="eyebrow">المظهر</span>
        <div className="setting-row" onClick={onToggleDarkMode}>
          <div className="setting-row-info">
            <div className="setting-icon-wrap">
              {darkMode ? <Moon size={18} /> : <Sun size={18} />}
            </div>
            <div>
              <div className="setting-label">الوضع الليلي</div>
              <div className="setting-desc">{darkMode ? 'مفعّل — مظهر داكن مريح' : 'متوقف — المظهر الفاتح'}</div>
            </div>
          </div>
          <button className={darkMode ? 'toggle-switch active' : 'toggle-switch'} aria-label="تبديل الوضع الليلي">
            <span className="toggle-knob" />
          </button>
        </div>
      </div>

      <div className="settings-section">
        <span className="eyebrow">إحصائيات التطبيق</span>
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon stat-icon-green"><FileText size={20} /></div>
            <div className="stat-body">
              <strong>{statsLoading ? '…' : appStats ? formatStat(appStats.totall_quotes) : 'غير معروف'}</strong>
              <span>عدد المنشورات</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-blue"><Users size={20} /></div>
            <div className="stat-body">
              <strong>{statsLoading ? '…' : appStats ? formatStat(appStats.totall_users) : 'غير معروف'}</strong>
              <span>عدد الناشرين</span>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon stat-icon-amber"><CopyIcon size={20} /></div>
            <div className="stat-body">
              <strong>{statsLoading ? '…' : appStats ? formatStat(appStats.totall_copies) : 'غير معروف'}</strong>
              <span>مرات النسخ</span>
            </div>
          </div>
        </div>
      </div>

      <div className="settings-section">
        <span className="eyebrow">عن التطبيق</span>
        <div className="setting-row" onClick={() => setShowAbout(true)}>
          <div className="setting-row-info">
            <div className="setting-icon-wrap">
              <Info size={18} />
            </div>
            <div>
              <div className="setting-label">نبذة عن أثر</div>
              <div className="setting-desc">تعرّف على فكرة التطبيق ورسالته</div>
            </div>
          </div>
          <ChevronLeft size={18} className="setting-chevron" />
        </div>
      </div>

      <div className="settings-footer">
        <div className="brand-mini" style={{ justifyContent: 'center', margin: '0 auto 6px' }}>
          <div className="brand-icon"><Feather size={16} /></div>
          <span>أثر</span>
        </div>
        <p>عبارتك، بصمتك</p>
      </div>

      {showAbout && <AboutSheet onClose={() => setShowAbout(false)} />}
    </div>
  );
}

// ---------- About Sheet ----------

function AboutSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="publish-sheet about-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-top">
          <div>
            <span className="eyebrow">عن التطبيق</span>
            <h2>نبذة عن أثر</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>
        <div className="about-body">
          <div className="about-mark"><Feather size={30} /></div>
          <p className="about-tagline">عبارتك، بصمتك</p>
          <p className="about-text">
            «أثر» مساحة بسيطة وجميلة لمشاركة العبارات التي تستحق أن تُقرأ.
            اكتب كلمتك، شاركها مع العالم، واترك أثراً يبقى بعدك.
          </p>
          <p className="about-text">
            كل عبارة هنا تبدأ بقلم ناشر، وتنتقل بين القرّاء بنسخة واحدة.
            لا ضوضاء، لا تعقيد — فقط كلمات صادقة في مكان واحد.
          </p>
          <div className="about-meta">
            <span>الإصدار 1.0</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Edit Account Sheet ----------

function EditAccountSheet({ currentName, onClose, onSave }: {
  currentName: string;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed === currentName.trim()) {
      onClose();
      return;
    }
    setSaving(true);
    try {
      await onSave(trimmed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="publish-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-top">
          <div>
            <span className="eyebrow">تعديل الحساب</span>
            <h2>تعديل المعلومات</h2>
          </div>
          <button className="icon-button" onClick={onClose}><X size={19} /></button>
        </div>
        <label className="edit-field">
          <span>الاسم الظاهر</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: أحمد سالم"
          />
        </label>
        <div className="sheet-footer">
          <span />
          <button className="primary-button" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
            {saving ? 'جارٍ الحفظ...' : 'حفظ التغييرات'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
