"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ChatWindow from "@/components/ChatWindow";
import PointsDisplay from "@/components/PointsDisplay";
import UploadForm from "@/components/UploadForm";
import { fetchCurrentUser, uploadMaterial } from "@/lib/apiClient";
import { clearAuthSession, getToken } from "@/lib/auth";
import { triggerSkill } from "@/lib/openClawClient";

function formatMaybeJSON(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export default function DashboardPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [points, setPoints] = useState(0);

  const [reviewSubject, setReviewSubject] = useState("math");
  const [reviewPlanResult, setReviewPlanResult] = useState("");

  const [examSubject, setExamSubject] = useState("math");
  const [examDifficulty, setExamDifficulty] = useState("medium");
  const [examResult, setExamResult] = useState("");

  const [materialResult, setMaterialResult] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const nextToken = getToken();
    if (!nextToken) {
      router.push("/login");
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        const result = await fetchCurrentUser(nextToken);
        if (cancelled) {
          return;
        }
        setToken(nextToken);
        setUser(result.user);
        setPoints(Number(result.user?.points || 0));
        setReady(true);
      } catch (error) {
        if (!cancelled) {
          clearAuthSession();
          router.push("/login");
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const userId = user?.user_id || "student-001";
  const welcomeText = useMemo(() => `Signed in as ${user?.username || userId}`, [user, userId]);

  const callSkill = async (skillName, payload, onSuccess) => {
    setBusy(true);
    setStatus(`Running ${skillName}...`);
    try {
      const result = await triggerSkill(skillName, payload);
      onSuccess(result);
      setStatus(`${skillName} completed.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Skill call failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyzeFile = async (file, subject) => {
    if (!token) {
      return;
    }

    setBusy(true);
    setStatus("Uploading and analyzing material...");
    try {
      const result = await uploadMaterial(token, file, subject);
      setMaterialResult(formatMaybeJSON(result));
      setStatus("Material uploaded and analyzed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const handleAnalyzeQuery = async (query, subject) => {
    await callSkill("analyze_material", { query, subject }, (result) => {
      setMaterialResult(formatMaybeJSON(result));
    });
  };

  const handleReviewPlan = async () => {
    await callSkill(
      "review_plan",
      {
        subject: reviewSubject,
      },
      (result) => {
        setReviewPlanResult(result?.plan ? String(result.plan) : formatMaybeJSON(result));
      }
    );
  };

  const handleGenerateExam = async () => {
    await callSkill(
      "generate_exam",
      {
        subject: examSubject,
        difficulty: examDifficulty,
      },
      (result) => {
        setExamResult(formatMaybeJSON(result));
      }
    );
  };

  const handleAwardPoints = async (action) => {
    await callSkill(
      "award_points",
      {
        action,
      },
      (result) => {
        if (typeof result?.current_points === "number") {
          setPoints(result.current_points);
          return;
        }
        setPoints((prev) => prev + Number(result?.points_awarded || 0));
      }
    );
  };

  const handleRedeem = async (cost) => {
    await callSkill(
      "award_points",
      {
        action: "redeem",
        points: 0,
        redeem_cost: cost,
      },
      (result) => {
        if (result?.redeemed) {
          if (typeof result?.current_points === "number") {
            setPoints(result.current_points);
          } else {
            setPoints((prev) => Math.max(0, prev - cost));
          }
          return;
        }

        setStatus("Redeem failed: insufficient points.");
      }
    );
  };

  const handleLogout = () => {
    clearAuthSession();
    router.push("/login");
  };

  if (!ready) {
    return (
      <main className="min-h-screen grid place-items-center">
        <p className="text-slate-600">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-brand-900">Learning Dashboard</h1>
          <p className="text-sm text-slate-600">{welcomeText}</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          Logout
        </button>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <ChatWindow
          title="Subject Tutor"
          skillName="tutor_subject"
          payloadKey="question"
          responseKey="response"
          placeholder="Ask your homework question"
        />

        <UploadForm onAnalyzeFile={handleAnalyzeFile} onAnalyzeQuery={handleAnalyzeQuery} disabled={busy} />
      </section>

      <section className="mt-4 card p-4">
        <h3 className="text-lg font-semibold text-brand-900">Review Plan</h3>
        <div className="mt-3 flex gap-2">
          <select
            value={reviewSubject}
            onChange={(event) => setReviewSubject(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
            disabled={busy}
          >
            <option value="math">Math</option>
            <option value="english">English</option>
            <option value="science">Science</option>
            <option value="history">History</option>
          </select>
          <button
            type="button"
            onClick={handleReviewPlan}
            disabled={busy}
            className="rounded-md bg-brand-700 px-4 py-2 text-white disabled:bg-slate-400"
          >
            Generate 7-day Plan
          </button>
        </div>
        {reviewPlanResult ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">{reviewPlanResult}</pre>
        ) : null}
      </section>

      <section className="mt-4 card p-4">
        <h3 className="text-lg font-semibold text-brand-900">Mock Exam</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={examSubject}
            onChange={(event) => setExamSubject(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
            disabled={busy}
          >
            <option value="math">Math</option>
            <option value="english">English</option>
            <option value="science">Science</option>
            <option value="history">History</option>
          </select>

          <select
            value={examDifficulty}
            onChange={(event) => setExamDifficulty(event.target.value)}
            className="rounded-md border border-slate-300 px-3 py-2"
            disabled={busy}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          <button
            type="button"
            onClick={handleGenerateExam}
            disabled={busy}
            className="rounded-md bg-brand-700 px-4 py-2 text-white disabled:bg-slate-400"
          >
            Generate Exam
          </button>
        </div>

        {examResult ? (
          <pre className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">
            {examResult}
          </pre>
        ) : null}
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <PointsDisplay points={points} onAward={handleAwardPoints} onRedeem={handleRedeem} />

        <div className="space-y-4">
          <ChatWindow
            title="Wish Wall"
            skillName="post_wish"
            payloadKey="wish"
            responseKey="encouragement"
            placeholder="Post a wish"
          />

          <ChatWindow
            title="Learning Diary"
            skillName="write_diary"
            payloadKey="entry"
            responseKey="suggestions"
            placeholder="Write your daily diary"
          />
        </div>
      </section>

      <section className="mt-4 card p-4">
        <h3 className="text-lg font-semibold text-brand-900">Latest Results</h3>
        {materialResult ? (
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">
            {materialResult}
          </pre>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No material analysis yet.</p>
        )}
      </section>

      {status ? (
        <p className="mt-4 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-700">{status}</p>
      ) : null}

      {busy ? <p className="mt-2 text-xs text-slate-500">A skill task is running.</p> : null}
    </main>
  );
}

