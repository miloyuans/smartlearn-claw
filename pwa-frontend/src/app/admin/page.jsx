"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { clearAuthSession, getToken } from "@/lib/auth";
import { fetchAdminOverview, fetchAdminUsers, fetchCurrentUser } from "@/lib/apiClient";

export default function AdminPage() {
  const router = useRouter();

  const [ready, setReady] = useState(false);
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      router.push("/login");
      return;
    }

    let cancelled = false;

    const load = async () => {
      try {
        const me = await fetchCurrentUser(token);
        if (me?.user?.role !== "admin") {
          throw new Error("Admin permission required");
        }

        const [ov, us] = await Promise.all([fetchAdminOverview(token), fetchAdminUsers(token, 100)]);
        if (cancelled) {
          return;
        }

        setOverview(ov);
        setUsers(us?.items || []);
        setReady(true);
      } catch (err) {
        if (cancelled) {
          return;
        }
        const msg = err instanceof Error ? err.message : "Admin load failed";
        setError(msg);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleLogout = () => {
    clearAuthSession();
    router.push("/login");
  };

  return (
    <main className="mx-auto max-w-6xl space-y-4 px-4 py-8">
      <header className="card flex flex-wrap items-center justify-between gap-3 p-5">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">SmartLearn Admin</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-emerald-950">Management Console</h1>
        </div>
        <div className="flex gap-2">
          <button className="btn-outline" onClick={() => router.push("/dashboard")}>
            Dashboard
          </button>
          <button className="btn-outline" onClick={() => router.push("/chat")}>
            Chat
          </button>
          <button className="btn-outline" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </header>

      {error ? (
        <section className="card p-5">
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
        </section>
      ) : null}

      {ready ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <div className="card p-4">
              <p className="text-xs text-slate-500">Users</p>
              <p className="mt-1 text-3xl font-black text-emerald-800">{overview?.users ?? 0}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500">Materials</p>
              <p className="mt-1 text-3xl font-black text-emerald-800">{overview?.materials ?? 0}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500">Diaries</p>
              <p className="mt-1 text-3xl font-black text-emerald-800">{overview?.diaries ?? 0}</p>
            </div>
            <div className="card p-4">
              <p className="text-xs text-slate-500">Wishes</p>
              <p className="mt-1 text-3xl font-black text-emerald-800">{overview?.wishes ?? 0}</p>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="panel-title">User List</h2>
            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-600">
                    <th className="px-3 py-2">User ID</th>
                    <th className="px-3 py-2">Username</th>
                    <th className="px-3 py-2">Role</th>
                    <th className="px-3 py-2">Points</th>
                    <th className="px-3 py-2">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((item) => (
                    <tr key={item._id} className="border-b border-slate-100">
                      <td className="px-3 py-2">{item._id}</td>
                      <td className="px-3 py-2">{item.username}</td>
                      <td className="px-3 py-2">{item.role || "student"}</td>
                      <td className="px-3 py-2">{item.points ?? 0}</td>
                      <td className="px-3 py-2">{item.created_at || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : null}
    </main>
  );
}
