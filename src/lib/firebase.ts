import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDnuaIzQfWT7i5IKXrvAOJs695zXVFM7yI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "edificio-agustina.firebaseapp.com",
  databaseURL:
    import.meta.env.VITE_FIREBASE_DATABASE_URL ||
    "https://edificio-agustina-default-rtdb.firebaseio.com/",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "edificio-agustina",
  storageBucket:
    import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "edificio-agustina.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "746749808585",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:746749808585:web:c6b55442dfc5fb525c6218",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const database = getDatabase(app);
