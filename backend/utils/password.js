const bcrypt = require('bcryptjs');

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, storedPassword) {
  if (!storedPassword) {
    return false;
  }

  if (storedPassword.startsWith('$2') || storedPassword.startsWith('$2a') || storedPassword.startsWith('$2b')) {
    return bcrypt.compare(password, storedPassword);
  }

  return password === storedPassword;
}

module.exports = { hashPassword, verifyPassword };
