"use client";

import { io } from "socket.io-client";

import { getToken } from "@/lib/auth";
import { OPENCLAW_URL, runSkillHttp } from "@/lib/apiClient";

let socket;
let socketToken;
let forceHttpFallback = false;

function createSocket(token) {
  return io(OPENCLAW_URL, {
    transports: ["websocket"],
    autoConnect: true,
    auth: { token },
    timeout: 8000,
  });
}

function getSocket(token) {
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

function triggerSkillWithSocket(token, skillName, payload, options = {}) {
  const skillPayload = payload || {};
  const timeoutMs = options.timeoutMs ?? 12000;
  const requestId = createRequestId();

  return new Promise((resolve, reject) => {
    const ws = getSocket(token);
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
      finalize(reject, new Error(error?.message || "WebSocket connection failed"));
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

export async function triggerSkill(skillName, payload, options = {}) {
  const token = getToken();
  if (!token) {
    throw new Error("Not authenticated");
  }

  if (forceHttpFallback || options.preferHttp) {
    const httpResult = await runSkillHttp(token, skillName, payload);
    return {
      ...httpResult,
      _transport: "http",
    };
  }

  try {
    const wsResult = await triggerSkillWithSocket(token, skillName, payload, options);
    return {
      ...wsResult,
      _transport: "websocket",
    };
  } catch (socketError) {
    if (options.noHttpFallback) {
      throw socketError;
    }

    forceHttpFallback = true;
    const httpResult = await runSkillHttp(token, skillName, payload);
    return {
      ...httpResult,
      _transport: "http",
      _socketError: socketError instanceof Error ? socketError.message : String(socketError),
    };
  }
}

export function resetTransportMode() {
  forceHttpFallback = false;
}
