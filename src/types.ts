export type Quote = {
  id: string;
  text: string;
  userId: string;
  time: string;
  copies: number;
  verified: boolean;
  user?: User | null;
};

export type User = {
  id: string;
  name: string;
  username: string;
  copies_us: number;
  dateOfCreating: string;
  verified: boolean;
};

export type Screen = 'home' | 'profile' | 'publisher' | 'onboarding' | 'auth' | 'settings';

export type AppStats = {
  totall_users: number | string;
  totall_quotes: number | string;
  totall_copies: number | string;
};
