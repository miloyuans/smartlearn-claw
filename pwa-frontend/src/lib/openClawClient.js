"use client";

import { io } from "socket.io-client";

import { getToken } from "@/lib/auth";

const OPENCLAW_URL = process.env.NEXT_PUBLIC_OPENCLAW_API_URL || "http://localhost:8000";

let socket;
let socketToken;

function createSocket(token) {
  return io(OPENCLAW_URL, {
    transports: ["websocket", "polling"],
    autoConnect: true,
    auth: { token },
  });
}

function getSocket() {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  if (!socket || socketToken !== token) {
    if (socket) {
      socket.disconnect();
    }
    socket = createSocket(token);
    socketToken = token;
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
      ws.off("skill_error", onSkillError);
      ws.off("connect_error", onConnectError);
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
      if (data?.requestId !== requestId) {
        return;
      }
      finalize(resolve, data);
    };

    const onSkillError = (error) => {
      if (error?.requestId && error.requestId !== requestId) {
        return;
      }
      const message = error?.message || "OpenClaw skill call failed";
      finalize(reject, new Error(message));
    };

    const onConnectError = (error) => {
      finalize(reject, new Error(error?.message || "Socket authentication failed"));
    };

    const timer = setTimeout(() => {
      finalize(reject, new Error(`Skill ${skillName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    ws.on("skill_response", onResponse);
    ws.on("skill_error", onSkillError);
    ws.on("connect_error", onConnectError);

    ws.emit("trigger_skill", {
      requestId,
      skill: skillName,
      payload: skillPayload,
    });
  });
}
