const OPENCLAW_URL = process.env.NEXT_PUBLIC_OPENCLAW_API_URL || "http://localhost:8000";

function parseErrorPayload(payload) {
  if (!payload) {
    return "Request failed";
  }
  if (typeof payload === "string") {
    return payload;
  }
  if (payload.detail) {
    return String(payload.detail);
  }
  return JSON.stringify(payload);
}

async function request(path, options = {}) {
  const response = await fetch(`${OPENCLAW_URL}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });

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
