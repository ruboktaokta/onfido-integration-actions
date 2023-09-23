import crypto  from 'crypto';

// Generate a random secret key for HS512 (HMAC-SHA512)
const generateHS512Secret = () => {
  return crypto.randomBytes(64).toString('base64'); // 64 bytes (512 bits) as a base64-encoded string
};

const hs512Secret = generateHS512Secret();
console.log('HS512 Secret:', hs512Secret);
