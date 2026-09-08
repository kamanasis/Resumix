/// <reference types="vite/client" />
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase configuration — reads from .env.local first, falls back to defaults.
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCA9GO8tANfKx_zZSjsyOVV_WVYcj7zg8s",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "gemini-reumixxxx.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "gemini-reumixxxx",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "gemini-reumixxxx.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "372407733756",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:372407733756:web:0053ea6a9f9e48478d3679",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-6R9Z12Q4WY"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Initialize Auth
export const auth = getAuth(app);

// Determine Firestore database ID.
// For custom user projects (non-legacy AI Studio projects), use the standard "default" database.
const customDbId = import.meta.env.VITE_FIREBASE_DATABASE_ID;
const useDefaultDb =
  !customDbId ||
  customDbId === "undefined" ||
  customDbId === "null" ||
  customDbId.startsWith("G-");

export const db = getFirestore(app, useDefaultDb ? undefined : customDbId);

