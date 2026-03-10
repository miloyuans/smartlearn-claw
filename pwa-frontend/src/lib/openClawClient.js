"use client";

import { io } from "socket.io-client";

const OPENCLAW_URL = process.env.NEXT_PUBLIC_OPENCLAW_API_URL || "http://localhost:8000";

let socket;

function getSocket() {
  if (!socket) {
    socket = io(OPENCLAW_URL, {
      transports: ["websocket", "polling"],
      autoConnect: true,
    });
  }
  return socket;
}

function createRequestId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function triggerSkill(skillName, payload, options = {}) {
  const skillPayload = payload || {};
  const timeoutMs = options.timeoutMs ?? 20000;
  const requestId = createRequestId();

  return new Promise((resolve, reject) => {
    const ws = getSocket();
    let settled = false;

    const cleanup = () => {
      ws.off("skill_response", onResponse);
      ws.off("skill_error", onError);
      clearTimeout(timer);
    };

    const finalize = (callback, value) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback(value);
    };

    const onResponse = (data) => {
      if (data?.requestId && data.requestId !== requestId) {
        return;
      }
      finalize(resolve, data);
    };

    const onError = (error) => {
      const message = error?.message || "OpenClaw skill call failed";
      finalize(reject, new Error(message));
    };

    const timer = setTimeout(() => {
      finalize(reject, new Error(`Skill ${skillName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on("skill_response", onResponse);
    ws.on("skill_error", onError);

    ws.emit("trigger_skill", {
      requestId,
      skill: skillName,
      payload: skillPayload,
    });
  });
}
