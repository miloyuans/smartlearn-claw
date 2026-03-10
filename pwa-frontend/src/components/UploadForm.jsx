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
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-3 p-5">
      <h3 className="panel-title">Material Analysis</h3>

      <select value={subject} onChange={(event) => setSubject(event.target.value)} className="input-base" disabled={disabled}>
        <option value="math">Math</option>
        <option value="english">English</option>
        <option value="science">Science</option>
        <option value="history">History</option>
      </select>

      <input
        type="file"
        onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
        className="input-base file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-50 file:px-3 file:py-1 file:text-emerald-700"
        disabled={disabled}
      />

      <input
        type="text"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Or search by keyword"
        className="input-base"
        disabled={disabled}
      />

      <button type="submit" disabled={disabled || (!selectedFile && !query.trim())} className="btn-primary">
        Analyze
      </button>
    </form>
  );
}
