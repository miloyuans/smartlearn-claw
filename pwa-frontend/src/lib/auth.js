const TOKEN_KEY = "smartlearn_token";
const USER_KEY = "smartlearn_user_id";
const TOKEN_COOKIE = "smartlearn_token";

function setCookie(name, value, maxAgeSeconds) {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}

function getCookie(name) {
  if (typeof document === "undefined") {
    return null;
  }

  const target = `${name}=`;
  const parts = document.cookie.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

function clearCookie(name) {
  if (typeof document === "undefined") {
    return;
  }
  document.cookie = `${name}=; path=/; max-age=0; samesite=lax`;
}

export function setAuthSession({ token, userId, expiresMinutes }) {
  if (typeof window === "undefined") {
    return;
  }

  const ttlSeconds = Math.max(60, Number(expiresMinutes || 60) * 60);
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, userId || "student-001");
  setCookie(TOKEN_COOKIE, token, ttlSeconds);
}

export function getToken() {
  if (typeof window === "undefined") {
    return null;
  }

  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    return token;
  }

  const cookieToken = getCookie(TOKEN_COOKIE);
  if (cookieToken) {
    localStorage.setItem(TOKEN_KEY, cookieToken);
    return cookieToken;
  }

  return null;
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
  clearCookie(TOKEN_COOKIE);
}
