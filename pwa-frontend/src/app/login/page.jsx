"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { loginUser, registerUser } from "@/lib/apiClient";
import { setAuthSession } from "@/lib/auth";

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
      setError("Please input username and password (min 6 chars).");
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
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <section className="card w-full max-w-md p-6">
        <h1 className="text-2xl font-bold text-brand-900">SmartLearn Hub</h1>
        <p className="mt-2 text-sm text-slate-600">AI-led learning workspace powered by OpenClaw.</p>

        <div className="mt-4 grid grid-cols-2 gap-2 rounded-md bg-slate-100 p-1">
          <button
            type="button"
            onClick={() => setMode("login")}
            className={`rounded-md px-3 py-2 text-sm ${
              mode === "login" ? "bg-white text-brand-900" : "text-slate-600"
            }`}
          >
            Login
          </button>
          <button
            type="button"
            onClick={() => setMode("register")}
            className={`rounded-md px-3 py-2 text-sm ${
              mode === "register" ? "bg-white text-brand-900" : "text-slate-600"
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
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            disabled={loading}
          />

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password (min 6 chars)"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
            disabled={loading}
          />

          <button
            type="submit"
            disabled={!canSubmit || loading}
            className="w-full rounded-md bg-brand-500 px-4 py-2 text-white disabled:bg-slate-400"
          >
            {loading ? "Submitting..." : mode === "login" ? "Login" : "Register & Login"}
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </section>
    </main>
  );
}

