// ─── Shared API helper ────────────────────────────────────────
const API_BASE = '';   // ใช้ relative path เพราะ Express serve ทั้ง frontend+backend

async function apiFetch(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด');
  return data;
}

// ─── Auth guard — เรียกใน DOMContentLoaded ────────────────────
async function requireLogin(allowedRoles = []) {
  try {
    const { user } = await apiFetch('/api/auth/me');
    if (user.forceChangePassword && !location.pathname.includes('change-password')) {
      location.href = '/change-password.html';
      return null;
    }
    if (allowedRoles.length && !allowedRoles.includes(user.role)) {
      location.href = '/login.html';
      return null;
    }
    return user;
  } catch {
    location.href = '/login.html';
    return null;
  }
}

async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
  location.href = '/login.html';
}
