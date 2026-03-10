"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import ChatWindow from "@/components/ChatWindow";
import PointsDisplay from "@/components/PointsDisplay";
import UploadForm from "@/components/UploadForm";
import { fetchCurrentUser, uploadMaterial } from "@/lib/apiClient";
import { clearAuthSession, getToken } from "@/lib/auth";
import { resetTransportMode, triggerSkill } from "@/lib/openClawClient";

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
      } catch (_error) {
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
  const welcomeText = useMemo(() => `Welcome back, ${user?.username || userId}`, [user, userId]);

  const callSkill = async (skillName, payload, onSuccess) => {
    setBusy(true);
    setStatus(`Running ${skillName} ...`);
    try {
      const result = await triggerSkill(skillName, payload);
      onSuccess(result);

      if (result?._transport === "http") {
        setStatus(`${skillName} done (WebSocket unavailable, HTTP fallback used).`);
      } else {
        setStatus(`${skillName} completed.`);
      }
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
      setStatus("Material upload and analysis completed.");
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
    resetTransportMode();
    clearAuthSession();
    router.push("/login");
  };

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-slate-600">Loading...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <header className="card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">SmartLearn Dashboard</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-emerald-950">Learning Console</h1>
          <p className="mt-1 text-sm text-slate-600">{welcomeText}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => router.push("/chat")} className="btn-outline">
            Chat
          </button>
          {user?.role === "admin" ? (
            <button type="button" onClick={() => router.push("/admin")} className="btn-outline">
              Admin
            </button>
          ) : null}
          <button type="button" onClick={handleLogout} className="btn-outline">
            Logout
          </button>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <ChatWindow
          title="AI Subject Tutor"
          skillName="tutor_subject"
          payloadKey="question"
          responseKey="response"
          placeholder="Example: Explain quadratic vertex form"
        />

        <UploadForm onAnalyzeFile={handleAnalyzeFile} onAnalyzeQuery={handleAnalyzeQuery} disabled={busy} />
      </section>

      <section className="card p-5">
        <h3 className="panel-title">Review Plan</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={reviewSubject}
            onChange={(event) => setReviewSubject(event.target.value)}
            className="input-base max-w-xs"
            disabled={busy}
          >
            <option value="math">Math</option>
            <option value="english">English</option>
            <option value="science">Science</option>
            <option value="history">History</option>
          </select>
          <button type="button" onClick={handleReviewPlan} disabled={busy} className="btn-primary">
            Generate 7-day Plan
          </button>
        </div>
        {reviewPlanResult ? (
          <pre className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">{reviewPlanResult}</pre>
        ) : null}
      </section>

      <section className="card p-5">
        <h3 className="panel-title">Mock Exam</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            value={examSubject}
            onChange={(event) => setExamSubject(event.target.value)}
            className="input-base max-w-xs"
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
            className="input-base max-w-xs"
            disabled={busy}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>

          <button type="button" onClick={handleGenerateExam} disabled={busy} className="btn-primary">
            Generate Exam
          </button>
        </div>

        {examResult ? (
          <pre className="mt-3 max-h-60 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">
            {examResult}
          </pre>
        ) : null}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <PointsDisplay points={points} onAward={handleAwardPoints} onRedeem={handleRedeem} />

        <div className="space-y-4">
          <ChatWindow
            title="Wish Wall"
            skillName="post_wish"
            payloadKey="wish"
            responseKey="encouragement"
            placeholder="Share a goal for this week"
          />

          <ChatWindow
            title="Learning Diary"
            skillName="write_diary"
            payloadKey="entry"
            responseKey="suggestions"
            placeholder="Write your reflection for today"
          />
        </div>
      </section>

      <section className="card p-5">
        <h3 className="panel-title">Latest Analysis Output</h3>
        {materialResult ? (
          <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm">
            {materialResult}
          </pre>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No analysis output yet.</p>
        )}
      </section>

      {status ? <p className="card px-4 py-3 text-sm text-slate-700">{status}</p> : null}
      {busy ? <p className="text-xs text-slate-500">Task running...</p> : null}
    </main>
  );
}
