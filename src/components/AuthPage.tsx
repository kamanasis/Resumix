import React, { useState } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from "firebase/auth";
import { auth, db } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { Shield, Sparkles, LogIn, UserPlus, Eye, EyeOff } from "lucide-react";

// Authentication Page component handling Sign In and Sign Up flows with Firebase Auth. Touching to force rebuild.
export default function AuthPage() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Please fill in all required fields.");
      return;
    }
    if (isSignUp && !displayName) {
      setError("Please provide your name.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (isSignUp) {
        // Create user
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        // Set user's name
        await updateProfile(user, { displayName });

        // Save user profile doc in Firestore
        try {
          await setDoc(doc(db, "users", user.uid), {
            uid: user.uid,
            email: user.email,
            displayName: displayName,
            createdAt: new Date().toISOString(),
          });
        } catch (dbErr) {
          console.warn("Could not write user profile to database (likely Firestore rules are not set up):", dbErr);
          // Let the user continue. The Dashboard will prompt them with instructions to set up rules if needed.
        }
      } else {
        // Sign in
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      console.error("Auth error:", err);
      let errMsg = "An error occurred during authentication.";
      if (err.code === "auth/user-not-found" || err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        errMsg = "Incorrect email address or password.";
      } else if (err.code === "auth/email-already-in-use") {
        errMsg = "This email is already registered.";
      } else if (err.code === "auth/weak-password") {
        errMsg = "Password must be at least 6 characters long.";
      } else if (err.code === "auth/invalid-email") {
        errMsg = "Please enter a valid email address.";
      } else if (err.code === "auth/operation-not-allowed") {
        errMsg = "Email/Password sign-in is not enabled for your Firebase project. Please open your Firebase Console, go to Authentication -> Sign-in method, enable 'Email/Password' and click Save.";
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-[#F0F9FF] bg-gradient-to-br from-white via-cyan-50/70 to-blue-50/70 flex items-center justify-center px-4 py-12 font-sans select-none">
      {/* Dynamic ambient background mesh / glowing circles */}
      <div className="absolute -top-40 -left-40 w-96 h-96 rounded-full bg-cyan-200/40 blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 rounded-full bg-blue-200/40 blur-[150px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-white/30 border border-cyan-200/30 blur-sm pointer-events-none" />

      {/* Auth Card */}
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white/75 backdrop-blur-xl border border-white rounded-3xl p-8 shadow-2xl transition-all duration-300 hover:border-cyan-200">
          
          {/* Logo / Title Area */}
          <div className="flex flex-col items-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-cyan-100 flex items-center justify-center border border-cyan-200 shadow-sm mb-3">
              <Sparkles className="w-6 h-6 text-cyan-600" />
            </div>
            <h1 className="text-3xl font-display font-bold tracking-tight text-slate-900 mb-1">
              Resumix
            </h1>
            <p className="text-slate-500 text-sm text-center font-medium">
              ATS Resume Tailor & Job Match Optimizer
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-5">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-xs flex items-center gap-2">
                <Shield className="w-4 h-4 shrink-0 text-red-500" />
                <span>{error}</span>
              </div>
            )}

            {isSignUp && (
              <div>
                <label className="block text-slate-700 text-xs font-bold mb-1.5 uppercase tracking-wider">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full px-4 py-3 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-2xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
                />
              </div>
            )}

            <div>
              <label className="block text-slate-700 text-xs font-bold mb-1.5 uppercase tracking-wider">
                Email Address
              </label>
              <input
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-3 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-2xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
              />
            </div>

            <div>
              <label className="block text-slate-700 text-xs font-bold mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-4 pr-10 py-3 bg-white/50 backdrop-blur-sm border border-slate-200 rounded-2xl text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:border-cyan-400 focus:ring-1 focus:ring-cyan-400 transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors clickable-cursor"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-bold text-sm rounded-xl flex items-center justify-center gap-2 shadow-[0_4px_20px_rgba(6,182,212,0.3)] hover:shadow-[0_4px_24px_rgba(6,182,212,0.4)] disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none transition-all duration-300 clickable-cursor mt-6"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isSignUp ? (
                <>
                  <UserPlus className="w-4 h-4" />
                  <span>Create Account</span>
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  <span>Sign In</span>
                </>
              )}
            </button>
          </form>

          {/* Toggle Button */}
          <div className="mt-6 pt-6 border-t border-slate-100 text-center text-xs font-medium">
            {isSignUp ? (
              <div>
                <span className="text-slate-500">Already have an account?</span>{" "}
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(false);
                    setError("");
                  }}
                  className="text-cyan-600 font-bold hover:text-cyan-700 hover:underline transition-all ml-1.5 clickable-cursor"
                >
                  Sign In
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center space-y-1">
                <span className="text-slate-500">Don't have an account?</span>
                <span className="text-slate-400 italic">Don't worry</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsSignUp(true);
                    setError("");
                  }}
                  className="text-cyan-600 font-bold hover:text-cyan-700 hover:underline transition-all clickable-cursor mt-1"
                >
                  create an account
                </button>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
