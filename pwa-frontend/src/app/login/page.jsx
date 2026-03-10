"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { setAuthSession } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const canSubmit = useMemo(
    () => username.trim().length > 0 && password.trim().length > 0,
    [username, password]
  );

  const handleLogin = (event) => {
    event.preventDefault();

    if (!canSubmit) {
      setError("Please input username and password.");
      return;
    }

    setAuthSession(username);
    router.push("/dashboard");
  };

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <section className="card w-full max-w-md p-6">
        <h1 className="text-2xl font-bold text-brand-900">SmartLearn Hub</h1>
        <p className="mt-2 text-sm text-slate-600">AI-led learning workspace powered by OpenClaw.</p>

        <form onSubmit={handleLogin} className="mt-6 space-y-3">
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />

          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-md border border-slate-300 px-3 py-2"
          />

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded-md bg-brand-500 px-4 py-2 text-white disabled:bg-slate-400"
          >
            Login
          </button>
        </form>

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
      </section>
    </main>
  );
}
