// Simple manual test to check where double encoding might occur
console.log("=== URL Encoding Test ===");

const originalUrl = "https://auth2.sesamy.dev/callback";
console.log("Original URL:", originalUrl);

// Test URL.searchParams.set (what Arctic uses)
const url1 = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url1.searchParams.set("redirect_uri", originalUrl);
console.log("URL.searchParams.set result:", url1.toString());
console.log("redirect_uri param:", url1.searchParams.get("redirect_uri"));

// Test if URL constructor itself encodes
const url2 = new URL("https://accounts.google.com/o/oauth2/v2/auth?redirect_uri=" + originalUrl);
console.log("URL constructor with concatenation:", url2.toString());

// Test manual encoding
const url3 = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url3.searchParams.set("redirect_uri", encodeURIComponent(originalUrl));
console.log("Manual encodeURIComponent + searchParams.set:", url3.toString());

// Test double encoding scenario
const preEncoded = encodeURIComponent(originalUrl);
console.log("Pre-encoded URL:", preEncoded);

const url4 = new URL("https://accounts.google.com/o/oauth2/v2/auth");
url4.searchParams.set("redirect_uri", preEncoded);
console.log("Double encoding result:", url4.toString());

console.log("\n=== Check for double encoding patterns ===");
console.log("Normal encoding contains %3A:", url1.toString().includes("%3A"));
console.log("Normal encoding contains %253A:", url1.toString().includes("%253A"));
console.log("Double encoding contains %253A:", url4.toString().includes("%253A"));
