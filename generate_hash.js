// Simple script to generate SHA-256 hash for password
const crypto = require('crypto');

function sha256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

// Change this to your desired password
const password = 'admin123'; // Change this!
const hash = sha256(password);

console.log('Password:', password);
console.log('SHA-256 Hash:', hash);
console.log('');
console.log('SQL INSERT statement:');
console.log(`INSERT INTO users (Name, Email, Password, Role, Faculty, Department, force_change_password) VALUES`);
console.log(`('New Admin', 'newadmin@university.ac.th', '${hash}', 'admin', 'IT', 'Computer Science', 0);`);
