const fs = require("fs");
const jwt = require("jsonwebtoken");

const TEAM_ID = process.env.APPLE_TEAM_ID ?? "235G724JXB";
const CLIENT_ID = process.env.APPLE_CLIENT_ID;
const KEY_ID = process.env.APPLE_KEY_ID;
const PRIVATE_KEY_PATH = process.env.APPLE_PRIVATE_KEY_PATH ?? `./AuthKey_${KEY_ID}.p8`;

if (!CLIENT_ID || !KEY_ID) {
  console.error(`
Missing Apple configuration.

Create fresh Apple Developer resources first, then run:

  APPLE_CLIENT_ID=yellowjerseyofficial \\
  APPLE_KEY_ID=<new key id> \\
  APPLE_PRIVATE_KEY_PATH=./AuthKey_<new key id>.p8 \\
  node generate-apple-secret.js

APPLE_CLIENT_ID must be the Services ID identifier, not the App ID.
`);
  process.exit(1);
}

if (!fs.existsSync(PRIVATE_KEY_PATH)) {
  console.error(`Apple private key not found at ${PRIVATE_KEY_PATH}`);
  process.exit(1);
}

const PRIVATE_KEY = fs.readFileSync(PRIVATE_KEY_PATH);

// Generate issue and expiry times
const now = Math.floor(Date.now() / 1000);
const exp = now + 15777000; // 6 months

// Sign the JWT - this becomes your client_secret
const clientSecret = jwt.sign(
  {
    iss: TEAM_ID,
    iat: now,
    exp: exp,
    aud: "https://appleid.apple.com",
    sub: CLIENT_ID,
  },
  PRIVATE_KEY,
  {
    algorithm: "ES256",
    header: {
      kid: KEY_ID,
    },
  }
);

console.log(`\nApple client_secret for ${CLIENT_ID}`);
console.log(`Team ID: ${TEAM_ID}`);
console.log(`Key ID: ${KEY_ID}`);
console.log(`Expires: ${new Date(exp * 1000).toISOString()}`);
console.log("\nJWT:\n");
console.log(clientSecret + "\n");
