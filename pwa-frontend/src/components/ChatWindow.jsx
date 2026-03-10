"use client";

import { useMemo, useState } from "react";

import { triggerSkill } from "@/lib/openClawClient";

function formatResponse(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value, null, 2);
}

export default function ChatWindow({
  title,
  skillName,
  payloadKey = "question",
  responseKey = "response",
  placeholder = "Type your message...",
}) {
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [responses, setResponses] = useState([]);

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading]);

  const handleSend = async () => {
    if (!canSend) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const payload = {
        [payloadKey]: input.trim(),
      };
      const result = await triggerSkill(skillName, payload);
      const answer = result?.[responseKey] ?? result;
      setResponses((prev) => [...prev, { input: input.trim(), answer: formatResponse(answer) }]);
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skill call failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card p-5">
      <h3 className="panel-title">{title}</h3>

      <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1">
        {responses.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet.</p>
        ) : (
          responses.map((item, index) => (
            <div key={`${item.input}-${index}`} className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
              <p className="text-sm font-semibold text-emerald-900">You: {item.input}</p>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{item.answer}</pre>
            </div>
          ))
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          className="input-base"
          placeholder={placeholder}
        />
        <button type="button" onClick={handleSend} disabled={!canSend} className="btn-primary whitespace-nowrap">
          {loading ? "Sending" : "Send"}
        </button>
      </div>

      {error ? <p className="mt-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
    </div>
  );
}
