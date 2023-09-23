import crypto  from 'crypto';

// Generate a secure random secret key
const generateSecureSecret = () => {
  return crypto.randomBytes(32).toString('hex'); // 32 bytes (256 bits) as a hexadecimal string
};

const secretKey = generateSecureSecret();
console.log('Secure Secret Key:', secretKey);