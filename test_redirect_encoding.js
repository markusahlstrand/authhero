// Test script to demonstrate redirect_uri encoding issue
const { URL } = require('url');

// Simulate the issue scenario
const originalRedirectUri = "https://example.com/callback?param=value&other=test";
console.log("Original redirect_uri:", originalRedirectUri);

// This is what might happen when the URL is created
const getAuthUrl = "https://auth.example.com/";
const callbackUrl = `${getAuthUrl}callback`;
console.log("Callback URL passed to OAuth provider:", callbackUrl);

// When creating the authorization URL, if the redirect_uri is already encoded
// and gets encoded again, we get double encoding
const encodedOnce = encodeURIComponent(originalRedirectUri);
console.log("Encoded once:", encodedOnce);

const encodedTwice = encodeURIComponent(encodedOnce);
console.log("Encoded twice (double encoded):", encodedTwice);

// Test with URL constructor to see how it handles the redirect_uri parameter
const authUrl = new URL("https://oauth.example.com/authorize");
authUrl.searchParams.set("redirect_uri", originalRedirectUri);
authUrl.searchParams.set("client_id", "test_client");
authUrl.searchParams.set("state", "test_state");

console.log("\nCorrect authorization URL:");
console.log(authUrl.toString());

// Test if there's an issue with how the URL parameters are being set
const authUrl2 = new URL("https://oauth.example.com/authorize");
authUrl2.searchParams.set("redirect_uri", encodedOnce); // This would cause double encoding if redirect_uri was already encoded

console.log("\nDouble encoded authorization URL (wrong):");
console.log(authUrl2.toString());
