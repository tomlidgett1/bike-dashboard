import fs from "fs";
import jwt from "jsonwebtoken";

// CONFIGURE THESE VALUES
const TEAM_ID = "235G724JXB";                       // Your Apple Team ID
const CLIENT_ID = "yellowjerseyofficial";           // Your Service ID (client_id)
const KEY_ID = "CDZZ56TGCS";                        // Your Key ID
const PRIVATE_KEY = fs.readFileSync("./AuthKey_CDZZ56TGCS.p8");

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

console.log("\nYour new Apple client_secret (JWT):\n");
console.log(clientSecret + "\n");
