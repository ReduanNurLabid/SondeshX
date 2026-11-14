import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { getAnalytics, isSupported } from 'firebase/analytics';

const firebaseConfig = {
  apiKey: 'AIzaSyAVdUJ92uxnBDi4ldvrI-B6DZ6qbykTxGI',
  appId: '1:495756674713:web:2bbcf26bd61d2a983d5a08',
  messagingSenderId: '495756674713',
  projectId: 'dorpon-a99a6',
  authDomain: 'dorpon-a99a6.firebaseapp.com',
  storageBucket: 'dorpon-a99a6.firebasestorage.app',
  measurementId: 'G-27VV8QPL9X',
};

// Initialize Firebase safely
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// Google Analytics (GA4): page views and visits from Facebook links (utm_source=facebook).
isSupported().then((ok) => { if (ok && typeof window !== 'undefined') getAnalytics(app); }).catch(() => undefined);

export { app, db, auth };
