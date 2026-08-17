export function timeAgo(rawTime: string | undefined | null): string {
  if (!rawTime) return 'غير معروف';

  const date = new Date(rawTime);
  if (isNaN(date.getTime())) return 'غير معروف';

  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);
  const diffWeek = Math.floor(diffDay / 7);
  const diffMonth = Math.floor(diffDay / 30);
  const diffYear = Math.floor(diffDay / 365);

  if (diffSec < 60) return 'الآن';
  if (diffMin < 60) return `قبل ${diffMin} دقيقة`;
  if (diffHr === 1) return 'قبل ساعة';
  if (diffHr < 24) return `قبل ${diffHr} ساعة`;
  if (diffDay === 1) return 'أمس';
  if (diffDay < 7) return `قبل ${diffDay} أيام`;
  if (diffWeek === 1) return 'قبل أسبوع';
  if (diffWeek < 4) return `قبل ${diffWeek} أسابيع`;
  if (diffMonth === 1) return 'قبل شهر';
  if (diffMonth < 12) return `قبل ${diffMonth} أشهر`;
  if (diffYear === 1) return 'قبل سنة';
  return `قبل ${diffYear} سنوات`;
}

export function generateId(length: number = 20): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const cryptoObj = typeof crypto !== 'undefined' ? crypto : null;
  for (let i = 0; i < length; i++) {
    const randomIndex = cryptoObj
      ? cryptoObj.getRandomValues(new Uint32Array(1))[0] % chars.length
      : Math.floor(Math.random() * chars.length);
    result += chars[randomIndex];
  }
  return result;
}
