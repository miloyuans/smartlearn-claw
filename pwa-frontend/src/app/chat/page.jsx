"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import ChatWindow from "@/components/ChatWindow";
import { clearAuthSession, getToken } from "@/lib/auth";
import { fetchCurrentUser } from "@/lib/apiClient";
import { resetTransportMode } from "@/lib/openClawClient";

export default function ChatPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [username, setUsername] = useState("student");
  const [role, setRole] = useState("student");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    let cancelled = false;
    const boot = async () => {
      try {
        const me = await fetchCurrentUser(token);
        if (cancelled) {
          return;
        }
        setUsername(me?.user?.username || "student");
        setRole(me?.user?.role || "student");
        setReady(true);
      } catch (_error) {
        if (!cancelled) {
          clearAuthSession();
          router.push("/login");
        }
      }
    };

    boot();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = () => {
    resetTransportMode();
    clearAuthSession();
    router.push("/login");
  };

  if (!ready) {
    return (
      <main className="grid min-h-screen place-items-center">
        <p className="text-slate-600">Loading chat...</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-4 px-4 py-8">
      <header className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">SmartLearn Chat</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-emerald-950">Conversation Workspace</h1>
          <p className="mt-1 text-sm text-slate-600">Signed in as {username}</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => router.push("/dashboard")}>
            Dashboard
          </button>
          {role === "admin" ? (
            <button className="btn-outline" onClick={() => router.push("/admin")}>
              Admin
            </button>
          ) : null}
          <button className="btn-outline" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      <ChatWindow
        title="General Tutor Chat"
        skillName="tutor_subject"
        payloadKey="question"
        responseKey="response"
        placeholder="Ask anything about your study topics..."
      />
    </main>
  );
}
