// Password hashing using Web Crypto API for Cloudflare Workers
// Replaces bcryptjs which uses eval() (not allowed in Workers)

async function sha256(message) {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

export async function hashPassword(password) {
  // Simple SHA-256 hash for demo purposes
  // In production, use proper password hashing with salt
  return await sha256(password);
}

export async function verifyPassword(password, hash) {
  const passwordHash = await sha256(password);
  return passwordHash === hash;
}
