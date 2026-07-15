/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Local fallback configuration for the AI Studio database environment.
// Using the unmasked credentials as fallbacks allows the app to compile and run perfectly
// out-of-the-box on localhost and external hosting platforms like Vercel,
// while still fully supporting custom database overrides via environment variables.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBIjpgRoMKWcoo-L58E57_GNMoMrd5TUvg",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "strong-torch-txhgq.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "strong-torch-txhgq",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "strong-torch-txhgq.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "1794818203",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:1794818203:web:c24ba2267119c6e8eec63e",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || ""
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Determine database ID:
// If using the default AI Studio project, we target the custom firestoreDatabaseId.
// If the user overrides the project ID (meaning they connected their custom Firebase), we default to "default" (standard Firestore) unless they specifically provide another database ID.
let databaseId = import.meta.env.VITE_FIREBASE_DATABASE_ID;

if (!databaseId || databaseId.startsWith("G-") || databaseId === "undefined" || databaseId === "null") {
  databaseId = firebaseConfig.projectId === "strong-torch-txhgq" ? "ai-studio-91603858-5c28-462a-8fda-553c9f87c9b9" : "default";
}

export const db = getFirestore(app, databaseId === "default" ? undefined : databaseId);

