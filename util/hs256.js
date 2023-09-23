import crypto  from 'crypto';

// Generate a random secret key for HS256 (HMAC-SHA256)
const generateHS256Secret = () => {
  return crypto.randomBytes(32).toString('base64'); // 32 bytes (256 bits) as a base64-encoded string
};

const hs256Secret = generateHS256Secret();
console.log('HS256 Secret:', hs256Secret);
