/**
 * Print the secret block for .env.vps.
 *
 * Every value is generated locally with the platform's CSPRNG and printed once
 * — nothing is written to disk or sent anywhere, so what you paste is the only
 * copy. PEM newlines are emitted as literal \n because dotenv does not
 * interpret escapes in unquoted values; the runtime expands them on load.
 */
import { generateKeyPairSync, randomBytes } from 'node:crypto';

const keypair = () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return { privateKey: privateKey.trim(), publicKey: publicKey.trim() };
};

const oneLine = (pem) => pem.replace(/\n/g, '\\n');
const access = keypair();
const license = keypair();

console.log(`# Generated ${new Date().toISOString()} — paste into .env.vps.
# Treat every line below as a production credential.

POSTGRES_PASSWORD=${randomBytes(24).toString('base64url')}
LICENSE_SIGNING_SECRET=${randomBytes(32).toString('hex')}
MFA_ENC_KEY=${randomBytes(32).toString('base64')}

JWT_PRIVATE_KEY=${oneLine(access.privateKey)}
JWT_PUBLIC_KEY=${oneLine(access.publicKey)}

LICENSE_JWT_PRIVATE_KEY=${oneLine(license.privateKey)}
LICENSE_JWT_PUBLIC_KEY=${oneLine(license.publicKey)}

# Remember to set DATABASE_URL's password to POSTGRES_PASSWORD above.`);
