export function resolveApiBase() {
  const envValue = process.env.NEXT_PUBLIC_OPENCLAW_API_URL;
  if (envValue && envValue.trim()) {
    return envValue.trim();
  }

  if (typeof window !== "undefined") {
    const url = new URL(window.location.origin);
    url.port = "8000";
    return url.origin;
  }

  return "http://localhost:8000";
}

export const OPENCLAW_URL = resolveApiBase();

function parseErrorPayload(payload) {
  if (!payload) {
    return "Request failed";
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (Array.isArray(payload.detail)) {
    return payload.detail
      .map((item) => item?.msg || JSON.stringify(item))
      .join("; ");
  }

  if (payload.detail) {
    return String(payload.detail);
  }

  return JSON.stringify(payload);
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${OPENCLAW_URL}${path}`, {
      ...options,
      headers: {
        ...(options.headers || {}),
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "network error";
    throw new Error(`Cannot reach OpenClaw API at ${OPENCLAW_URL}: ${reason}`);
  }

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    throw new Error(parseErrorPayload(payload));
  }

  return payload;
}

export async function registerUser(username, password) {
  return request("/auth/register", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
}

export async function loginUser(username, password) {
  return request("/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ username, password }),
  });
}

export async function fetchCurrentUser(token) {
  return request("/auth/me", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchAdminOverview(token) {
  return request("/admin/overview", {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function fetchAdminUsers(token, limit = 50) {
  return request(`/admin/users?limit=${encodeURIComponent(String(limit))}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
}

export async function uploadMaterial(token, file, subject) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("subject", subject || "general");

  return request("/api/upload", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
}

export async function runSkillHttp(token, skillName, payload) {
  return request(`/api/skills/${encodeURIComponent(skillName)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ payload: payload || {} }),
  });
}
