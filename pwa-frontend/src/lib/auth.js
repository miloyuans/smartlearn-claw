const TOKEN_KEY = "smartlearn_token";
const USER_KEY = "smartlearn_user_id";

export function setAuthSession(username) {
  if (typeof window === "undefined") {
    return;
  }

  const token = `token-${Date.now()}`;
  const userId = username.trim().toLowerCase().replace(/\s+/g, "-");

  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, userId || "student-001");
}

export function getToken() {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
}

export function getUserId() {
  if (typeof window === "undefined") {
    return "student-001";
  }
  return localStorage.getItem(USER_KEY) || "student-001";
}

export function clearAuthSession() {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
