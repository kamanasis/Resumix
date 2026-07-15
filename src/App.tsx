import { useState, useEffect } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { auth, db } from "./lib/firebase";
import { doc, getDocFromServer } from "firebase/firestore";
// Main App component containing Auth gate and Dashboard. Triggering a fresh build to resolve any cached assets issues.
import AuthPage from "./components/AuthPage";
import Dashboard from "./components/Dashboard";
import Cursor3D from "./components/Cursor3D";
import { Sparkles } from "lucide-react";

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Validate Firestore Connection on initial boot as requested by Firebase Integration guidelines
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, "test", "connection"));
      } catch (error: any) {
        if (error instanceof Error && error.message.includes("the client is offline")) {
          console.warn("Please check your Firebase configuration or internet connection.");
        }
      }
    }
    testConnection();
  }, []);

  // Monitor Authentication State change
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F0F9FF] bg-gradient-to-br from-white via-cyan-50/70 to-blue-50/70 flex flex-col items-center justify-center font-sans select-none">
        <div className="relative mb-4">
          <div className="w-14 h-14 border-4 border-cyan-100 border-t-cyan-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-cyan-500 animate-pulse" />
          </div>
        </div>
        <h2 className="text-slate-800 font-display font-bold text-xl tracking-wider">
          Resumix
        </h2>
        <p className="text-slate-400 text-xs mt-1.5 font-medium animate-pulse">
          Securing workspace connections...
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Interactive 3D Trailing Cursor */}
      <Cursor3D />

      {/* Auth state gate */}
      {!user ? (
        <AuthPage />
      ) : (
        <Dashboard user={user} />
      )}
    </>
  );
}
