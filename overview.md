# Resumix — System Architecture & Project Overview

> **Current Status**: Fully functional full-stack AI resume intelligence platform built with React 19, TypeScript, Express, Firebase Auth & Cloud Firestore, and Google Gemini Generative AI.

---

## 1. Executive Summary

**Resumix** is an intelligent career acceleration platform designed to bridge the gap between job seekers' resumes and corporate applicant tracking systems (ATS). The application enables candidates to upload existing resumes or generate starter resumes from scratch, benchmark them against target companies and roles, discover critical skill gaps, and automatically rewrite resume sections into high-impact, ATS-optimized bullet points.

---

## 2. Tech Stack Architecture

| Layer | Technology | Key Packages & Versions |
| :--- | :--- | :--- |
| **Frontend UI** | React 19 (SPA) + TypeScript | `react` 19.0.1, `vite` 6.2.3, `motion` 12.23.24 |
| **Styling & Design** | Tailwind CSS v4 + Custom Design System | `@tailwindcss/vite` 4.1.14, `@theme`, Glassmorphism, Neon Glows |
| **Icons & Typography** | Lucide Icons + Google Fonts | `lucide-react` 0.546.0, *Inter*, *Space Grotesk*, *JetBrains Mono* |
| **Backend API** | Node.js + Express (Hybrid Dev/Prod/Serverless) | `express` 4.21.2, `tsx` 4.21.0, `esbuild` 0.25.0 |
| **AI Intelligence** | Google Gemini Generative AI SDK | `@google/genai` 2.4.0 (`gemini-1.5-flash` with strict JSON Schema) |
| **Authentication & DB**| Firebase Auth & Cloud Firestore | `firebase` 12.15.0 (Email/Password Auth + Real-time Firestore sync) |
| **Deployment Targets**| Localhost (`tsx server.ts`) / Vercel Serverless | `vercel.json`, `api/index.ts` |

---

## 3. Directory & File Structure

```text
Resumix-main/
├── api/
│   └── index.ts                 # Serverless entrypoint for Vercel deployment
├── src/
│   ├── components/
│   │   ├── AnalysisHistory.tsx  # Full audit log of past resume tailoring reports & exports
│   │   ├── AuthPage.tsx         # Sign-in & sign-up flows with Firebase Auth
│   │   ├── Cursor3D.tsx         # Custom 3D interactive trailing cursor
│   │   ├── Dashboard.tsx        # Core authenticated dashboard shell & tab controller
│   │   ├── FresherHub.tsx       # Entry-level & student career roadmap & starter resume builder
│   │   ├── ResumeList.tsx       # Resume file card vault with selection & deletion
│   │   ├── ResumeUpload.tsx     # File ingestion (.txt, .md, PDF extraction) & preview editor
│   │   └── TailorWizard.tsx     # Deterministic multi-phase AI tailoring & gap analysis pipeline
│   ├── lib/
│   │   └── firebase.ts          # Firebase SDK initialization (Auth & Firestore configuration)
│   ├── App.tsx                  # Root component with auth listener & loading spinner
│   ├── index.css                # Tailwind CSS v4, custom scrollbars, glassmorphism, cursor styling
│   ├── main.tsx                 # React DOM mount
│   └── types.ts                 # TypeScript definitions for resumes, profiles, gap reports & scores
├── .env.example                 # Example environment variables (Gemini API key & Firebase credentials)
├── firebase-blueprint.json      # Firestore entity schema definition (User, Resume, Analysis)
├── firestore.rules              # Firestore user-scoped security rules
├── index.html                   # HTML entry point with metadata and fonts
├── metadata.json                # Project capabilities and metadata
├── overview.md                  # Comprehensive site analysis and technical overview
├── package.json                 # Dependency manifests and scripts
├── server.ts                    # Express server with Gemini AI endpoints and Vite middleware
├── tsconfig.json                # TypeScript compiler configuration
├── vercel.json                  # Vercel deployment rewrite rules
└── vite.config.ts               # Vite build and Tailwind plugin configuration
```

---

## 4. Key Functional Modules

### 4.1. Authentication & Security ([`AuthPage.tsx`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/components/AuthPage.tsx))
- Supports email/password user registration and authentication.
- Automatically initializes user profiles in Firestore under `/users/{userId}`.
- Protected client-side routing in [`App.tsx`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/App.tsx) that displays an authentication gate when unauthenticated.

### 4.2. Resume Management Vault ([`ResumeUpload.tsx`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/components/ResumeUpload.tsx) & [`ResumeList.tsx`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/components/ResumeList.tsx))
- **File Ingestion**: Accepts plain text (`.txt`, `.md`) and binary files (PDF/DOC), performing client-side binary buffer scanning and ASCII extraction.
- **Verification & Edit**: Users can preview, verify, and modify the parsed text in an inline editor before saving to Firestore.
- **Resume Vault**: Lists uploaded resumes with file size, upload timestamp, and quick selection for AI tailoring.

### 4.3. Multi-Phase AI Resume Tailoring Pipeline ([`TailorWizard.tsx`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/components/TailorWizard.tsx))
The AI pipeline utilizes a deterministic multi-phase methodology:
1. **Requirement Profiling (`/api/generate-requirement-profile`)**: Prompts Gemini to generate a frozen requirement specification (Required skills, soft skills, responsibilities, ATS keywords, tools, leadership expectations) based on the target company and role.
2. **Resume Parsing (`/api/parse-resume`)**: Extracts structured components from the candidate's resume (skills, experience, projects, metrics, certifications) without hallucinations.
3. **Gap Analysis (`/api/gap-analysis`)**: Compares the parsed resume with the frozen requirement profile, identifying missing items categorized by importance (Critical, Recommended, Optional), calculating category scorecards (ATS compatibility, skills, leadership, etc.).
4. **Targeted & Batch Tailoring (`/api/tailor-resume-batch` / `/api/tailor-gap`)**: Generates optimized Markdown resume drafts and provides bullet point replacements explaining *what changed*, *why*, and the *ATS benefit*.

### 4.4. Fresher & Entry-Level Career Hub ([`FresherHub.tsx`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/components/FresherHub.tsx))
- Designed for university students and fresh graduates who lack prior industry experience.
- Prompts Gemini (`/api/generate-fresher-template`) to research the target company’s hiring standards, required entry-level tech stacks, and interview tips.
- Generates step-by-step project blueprints and fully filled starter resume templates in Markdown that can be saved directly into the user's Resume Vault.

### 4.5. Analysis History & Audit Log ([`AnalysisHistory.tsx`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/components/AnalysisHistory.tsx))
- Synchronizes with Firestore collection `/users/{userId}/analyses`.
- Displays historical audit cards with match scores, company overviews, missing requirements, and allows one-click clipboard copying or `.txt`/`.md` download.

### 4.6. Visual Effects & 3D Interactivity ([`Cursor3D.tsx`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/components/Cursor3D.tsx))
- Custom interactive dual-layer cursor with GPU-accelerated translate coordinates (`translate3d`) and spring-interpolated trailing outer ring (`lerp`).
- Automatically tracks interactive elements (`a`, `button`, `input`, `.clickable-cursor`) to expand and glow on hover.

---

## 5. API Endpoints Overview

| Route | Method | Purpose | Input Parameters | Output Schema |
| :--- | :--- | :--- | :--- | :--- |
| `/api/tailor-resume` | `POST` | V1 Complete Resume Analysis & Rewrite | `resumeText`, `targetCompany`, `targetRole`, `jobDescription`, `experienceLevel`, `location` | Full analysis object with match score, gaps, bullet diffs, and tailored markdown |
| `/api/generate-fresher-template` | `POST` | Fresher Career Blueprint & Starter Resume | `targetCompany`, `targetRole`, `fieldsOfInterest`, `academicProjects`, `strengths` | Overview, hiring standards, project blueprints, interview tips, starter resume |
| `/api/generate-requirement-profile` | `POST` | V2 Phase 1: Frozen Company Requirements | `targetCompany`, `targetRole`, `jobDescription`, `experienceLevel` | Frozen requirement profile object |
| `/api/parse-resume` | `POST` | V2 Phase 2: Resume Entity Extraction | `resumeText` | Parsed structured resume data |
| `/api/gap-analysis` | `POST` | V2 Phase 3: Resume vs. Profile Matching | `parsedResume`, `frozenProfile` | Missing items, ATS keyword analysis, category scorecard (0–100) |
| `/api/tailor-gap` | `POST` | V2 Phase 5: Single Item Remediation | `resumeText`, `frozenProfile`, `missingItem` | Targeted sentence suggestion with evidence verification |
| `/api/tailor-resume-batch` | `POST` | V2 Phase 5 & 14: Batch Optimization | `resumeText`, `frozenProfile`, `selectedItems` | Tailored resume markdown with itemized change explanations |

---

## 6. Database & Storage Architecture

Cloud Firestore is organized in a hierarchical user-scoped structure:
- `/users/{userId}`: User profile document (`uid`, `email`, `displayName`, `createdAt`).
- `/users/{userId}/resumes/{resumeId}`: Uploaded resume documents (`id`, `name`, `size`, `type`, `uploadedAt`, `content`).
- `/users/{userId}/analyses/{analysisId}`: Tailoring reports and match scores (`id`, `resumeId`, `targetCompany`, `targetRole`, `matchingScore`, `tailoredContent`, `suggestedChanges`, etc.).

Firestore Security Rules enforce that users can only read and write their own documents:
```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
      match /{document=**} {
        allow read, write: if request.auth != null && request.auth.uid == userId;
      }
    }
  }
}
```

---

## 7. Configuration & Environment Variables

| Variable | Scope | Description |
| :--- | :--- | :--- |
| `GEMINI_API_KEY` | Server (`.env.local` / `.env`) | Google Gemini API key for server-side AI generation |
| `VITE_FIREBASE_API_KEY` | Client / Browser | Firebase Web API Key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Client / Browser | Firebase Auth Domain |
| `VITE_FIREBASE_PROJECT_ID` | Client / Browser | Firebase Project ID |
| `VITE_FIREBASE_STORAGE_BUCKET`| Client / Browser | Firebase Storage Bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Client / Browser | Firebase Messaging Sender ID |
| `VITE_FIREBASE_APP_ID` | Client / Browser | Firebase Web App ID |
| `VITE_FIREBASE_DATABASE_ID` | Client / Browser | Optional custom Firestore Database ID |
| `PORT` | Server | Express HTTP server port (Default: `3000`) |

---

## 8. Current System Health & Recommendations

1. **AI Integration**: Uses `@google/genai` with strict `responseSchema` validation on Gemini 1.5 Flash. Generates structured JSON responses without parsing errors.
2. **Client-Side PDF Parsing**: [`ResumeUpload.tsx`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/components/ResumeUpload.tsx) currently uses ASCII buffer extraction. For complex multi-column or scanned PDFs, integrating a dedicated client parser like `pdfjs-dist` or backend OCR could improve text extraction fidelity.
3. **Database Fallback**: [`src/lib/firebase.ts`](file:///c:/Users/KAMANASIS/OneDrive/Desktop/Resumix-main/src/lib/firebase.ts) contains preset fallback credentials for AI Studio preview environments, enabling the application to run out-of-the-box locally while supporting production overrides.
