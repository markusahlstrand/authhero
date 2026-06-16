#!/usr/bin/env node
import crypto from "node:crypto";

// Print a fresh base64-encoded 32-byte (AES-256) key suitable for
// ENCRYPTION_KEY. Copy the output into your env file (.env / .dev.vars) or set
// it as a production secret.
console.log(crypto.randomBytes(32).toString("base64"));
