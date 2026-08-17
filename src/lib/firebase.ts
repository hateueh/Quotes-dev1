import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyCzWmnsEuKUvF4etAc4dEMrhRbyYrWh-pA',
  databaseURL: 'https://ebarat-f587a-default-rtdb.firebaseio.com',
  projectId: 'ebarat-f587a',
  storageBucket: 'ebarat-f587a.firebasestorage.app',
  appId: '1:334975243140:android:e0cc347fbde805907a03d1',
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
