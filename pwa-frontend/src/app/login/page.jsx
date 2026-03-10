"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { loginUser, registerUser } from "@/lib/apiClient";
import { setAuthSession } from "@/lib/auth";
import { resetTransportMode } from "@/lib/openClawClient";

export default function LoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.trim().length >= 6,
    [username, password]
  );

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!canSubmit) {
      setError("Please enter username and password (min 6 chars).");
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (mode === "register") {
        await registerUser(username.trim(), password);
      }

      const loginResult = await loginUser(username.trim(), password);
      setAuthSession({
        token: loginResult.access_token,
        userId: loginResult.user?.user_id,
        expiresMinutes: loginResult.expires_minutes,
      });
      resetTransportMode();
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen px-4 py-10">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.2fr_1fr]">
        <section className="card p-8">
          <p className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            SmartLearn AI Classroom
          </p>
          <h1 className="mt-4 text-4xl font-black tracking-tight text-emerald-900">SmartLearn Hub</h1>
          <p className="mt-3 text-slate-600">
            AI-powered workspace for tutoring, review plans, mock exams, points, and learning journals.
          </p>

          <div className="mt-6 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                mode === "login" ? "bg-white text-emerald-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
                mode === "register" ? "bg-white text-emerald-900 shadow-sm" : "text-slate-600"
              }`}
            >
              Register
            </button>
          </div>

          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="Username"
              className="input-base"
              disabled={loading}
            />

            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password (min 6 chars)"
              className="input-base"
              disabled={loading}
            />

            <button type="submit" disabled={!canSubmit || loading} className="btn-primary w-full">
              {loading ? "Submitting..." : mode === "login" ? "Login" : "Register & Login"}
            </button>
          </form>

          {error ? <p className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
        </section>

        <aside className="card p-6">
          <h2 className="panel-title">What You Get</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            <li className="rounded-xl bg-emerald-50 px-3 py-2">AI tutoring with step-by-step guidance</li>
            <li className="rounded-xl bg-sky-50 px-3 py-2">Material upload and structured analysis</li>
            <li className="rounded-xl bg-amber-50 px-3 py-2">Exams, points rewards, wish wall, diary insights</li>
          </ul>
          <p className="mt-6 text-xs text-slate-500">If WebSocket is unavailable, calls auto-fallback to HTTP.</p>
        </aside>
      </div>
    </main>
  );
}
