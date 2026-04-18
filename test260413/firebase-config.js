/**
 * Firebase initialization (ES module).
 * Imported by progress.js.
 *
 * Note: apiKey is safe to expose publicly — Firebase enforces security via
 * Firestore rules + Authentication, not via secret keys.
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAZbcP--bnAUr4A_yIDcw9s2s9jyqzjI94',
  authDomain: 'mk-claude-tutorial.firebaseapp.com',
  databaseURL: 'https://mk-claude-tutorial-default-rtdb.firebaseio.com',
  projectId: 'mk-claude-tutorial',
  storageBucket: 'mk-claude-tutorial.firebasestorage.app',
  messagingSenderId: '782773112855',
  appId: '1:782773112855:web:3b2d3e18088ee83bcf4c52',
  measurementId: 'G-2TKKQZQLGW',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export {
  auth,
  db,
  provider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp,
};
