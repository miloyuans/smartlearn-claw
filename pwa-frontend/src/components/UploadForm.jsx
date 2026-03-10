"use client";

import { useState } from "react";

export default function UploadForm({ onAnalyzeFile, onAnalyzeQuery, disabled = false }) {
  const [subject, setSubject] = useState("math");
  const [query, setQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (selectedFile) {
      await onAnalyzeFile(selectedFile, subject);
      setSelectedFile(null);
      return;
    }

    if (query.trim()) {
      await onAnalyzeQuery(query.trim(), subject);
      return;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card p-4 space-y-3">
      <h3 className="text-lg font-semibold text-brand-900">Material Analysis</h3>

      <select
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        className="w-full rounded-md border border-slate-300 px-3 py-2"
        disabled={disabled}
      >
        <option value="math">Math</option>
        <option value="english">English</option>
        <option value="science">Science</option>
        <option value="history">History</option>
      </select>

      <input
        type="file"
        onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        className="block w-full text-sm"
        disabled={disabled}
      />

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Or search resources by keyword"
        className="w-full rounded-md border border-slate-300 px-3 py-2"
        disabled={disabled}
      />

      <button
        type="submit"
        disabled={disabled || (!selectedFile && !query.trim())}
        className="rounded-md bg-brand-700 px-4 py-2 text-white disabled:bg-slate-400"
      >
        Analyze
      </button>
    </form>
  );
}
