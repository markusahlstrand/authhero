# Custom SAML Signers

This guide explains how to implement custom SAML signing logic by implementing the `SamlSigner` interface.

## The SamlSigner Interface

All SAML signers must implement the `SamlSigner` interface:

```typescript
interface SamlSigner {
  signSAML(xml: string): Promise<string>;
}
```

The interface has a single method:

- **`signSAML(xml: string): Promise<string>`** - Takes unsigned SAML XML and returns signed XML

## Basic Custom Signer

Here's a basic example of a custom signer:

```typescript
import type { SamlSigner } from "authhero";
import { init } from "authhero";

class MyCustomSigner implements SamlSigner {
  async signSAML(xml: string): Promise<string> {
    // Your signing logic here
    const signedXml = await yourSigningFunction(xml);
    return signedXml;
  }
}

// Use it
const app = init({
  dataAdapter,
  samlSigner: new MyCustomSigner(),
});
```

## Example Implementations

### 1. AWS KMS Signer

Sign SAML responses using AWS Key Management Service:

```typescript
import { KMSClient, SignCommand } from "@aws-sdk/client-kms";
import type { SamlSigner } from "authhero";

class AwsKmsSigner implements SamlSigner {
  private kms: KMSClient;
  private keyId: string;

  constructor(keyId: string, region: string = "us-east-1") {
    this.kms = new KMSClient({ region });
    this.keyId = keyId;
  }

  async signSAML(xml: string): Promise<string> {
    // Parse XML and find the element to sign
    const elementToSign = this.extractElementToSign(xml);

    // Create digest
    const digest = await this.createDigest(elementToSign);

    // Sign with KMS
    const command = new SignCommand({
      KeyId: this.keyId,
      Message: Buffer.from(digest),
      MessageType: "DIGEST",
      SigningAlgorithm: "RSASSA_PKCS1_V1_5_SHA_256",
    });

    const { Signature } = await this.kms.send(command);

    // Insert signature into XML
    return this.insertSignature(xml, Signature);
  }

  private extractElementToSign(xml: string): string {
    // Implementation depends on your XML parsing library
    // Extract the element that needs to be signed
    return elementToSign;
  }

  private async createDigest(data: string): Promise<string> {
    // Create SHA-256 digest
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest("SHA-256", dataBuffer);
    return Buffer.from(hashBuffer).toString("base64");
  }

  private insertSignature(xml: string, signature: Uint8Array): string {
    // Insert the signature into the XML document
    // This depends on your XML manipulation library
    return signedXml;
  }
}

// Usage
const signer = new AwsKmsSigner("your-kms-key-id", "us-west-2");

const app = init({
  dataAdapter,
  samlSigner: signer,
});
```

### 2. Cached Signer

Wrap another signer with caching to improve performance:

```typescript
import type { SamlSigner } from "authhero";

class CachedSigner implements SamlSigner {
  private cache = new Map<string, string>();
  private ttl: number;
  private innerSigner: SamlSigner;

  constructor(innerSigner: SamlSigner, ttlSeconds: number = 300) {
    this.innerSigner = innerSigner;
    this.ttl = ttlSeconds * 1000;
  }

  async signSAML(xml: string): Promise<string> {
    // Create cache key
    const cacheKey = this.createHash(xml);

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Sign with inner signer
    const signed = await this.innerSigner.signSAML(xml);

    // Cache result
    this.cache.set(cacheKey, signed);

    // Auto-expire
    setTimeout(() => {
      this.cache.delete(cacheKey);
    }, this.ttl);

    return signed;
  }

  private createHash(data: string): string {
    // Simple hash for demo - use crypto.subtle.digest in production
    return btoa(data).slice(0, 32);
  }
}

// Usage
import { HttpSamlSigner } from "authhero";

const httpSigner = new HttpSamlSigner("https://signing-service.com/sign");
const cachedSigner = new CachedSigner(httpSigner, 300); // 5 minute cache

const app = init({
  dataAdapter,
  samlSigner: cachedSigner,
});
```

### 3. Retry Signer

Add automatic retry logic with exponential backoff:

```typescript
import type { SamlSigner } from "authhero";

class RetrySigner implements SamlSigner {
  private innerSigner: SamlSigner;
  private maxRetries: number;
  private baseDelay: number;

  constructor(
    innerSigner: SamlSigner,
    maxRetries: number = 3,
    baseDelay: number = 1000,
  ) {
    this.innerSigner = innerSigner;
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async signSAML(xml: string): Promise<string> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await this.innerSigner.signSAML(xml);
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.maxRetries) {
          // Exponential backoff
          const delay = this.baseDelay * Math.pow(2, attempt);
          await this.sleep(delay);
          console.warn(
            `Retry ${attempt + 1}/${this.maxRetries} after ${delay}ms`,
          );
        }
      }
    }

    throw new Error(
      `Failed to sign SAML after ${this.maxRetries} retries: ${lastError.message}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Usage
import { HttpSamlSigner } from "authhero";

const httpSigner = new HttpSamlSigner("https://signing-service.com/sign");
const retrySigner = new RetrySigner(httpSigner, 3, 1000);

const app = init({
  dataAdapter,
  samlSigner: retrySigner,
});
```

### 4. Multi-Key Signer

Rotate between multiple signing keys:

```typescript
import type { SamlSigner } from "authhero";
import { LocalSamlSigner } from "@authhero/saml/local-signer";

class MultiKeySigner implements SamlSigner {
  private signers: SamlSigner[];
  private currentIndex: number = 0;

  constructor(signers: SamlSigner[]) {
    if (signers.length === 0) {
      throw new Error("At least one signer required");
    }
    this.signers = signers;
  }

  async signSAML(xml: string): Promise<string> {
    const signer = this.getCurrentSigner();
    return await signer.signSAML(xml);
  }

  private getCurrentSigner(): SamlSigner {
    return this.signers[this.currentIndex];
  }

  // Call this to rotate to next key
  rotate(): void {
    this.currentIndex = (this.currentIndex + 1) % this.signers.length;
  }

  // Call this to set a specific key
  useKey(index: number): void {
    if (index < 0 || index >= this.signers.length) {
      throw new Error(`Invalid key index: ${index}`);
    }
    this.currentIndex = index;
  }
}

// Usage
const signer1 = new LocalSamlSigner();
const signer2 = new LocalSamlSigner();
const multiKeySigner = new MultiKeySigner([signer1, signer2]);

const app = init({
  dataAdapter,
  samlSigner: multiKeySigner,
});

// Rotate keys periodically
setInterval(
  () => {
    multiKeySigner.rotate();
    console.log("Rotated to next signing key");
  },
  24 * 60 * 60 * 1000,
); // Daily rotation
```

### 5. Logging/Monitoring Signer

Wrap another signer with logging and monitoring:

```typescript
import type { SamlSigner } from "authhero";

class MonitoredSigner implements SamlSigner {
  private innerSigner: SamlSigner;
  private logger: (message: string, metadata?: any) => void;

  constructor(
    innerSigner: SamlSigner,
    logger: (message: string, metadata?: any) => void = console.log,
  ) {
    this.innerSigner = innerSigner;
    this.logger = logger;
  }

  async signSAML(xml: string): Promise<string> {
    const startTime = Date.now();

    this.logger("SAML signing started", {
      xmlLength: xml.length,
      timestamp: new Date().toISOString(),
    });

    try {
      const result = await this.innerSigner.signSAML(xml);
      const duration = Date.now() - startTime;

      this.logger("SAML signing completed", {
        duration,
        resultLength: result.length,
        success: true,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger("SAML signing failed", {
        duration,
        error: error.message,
        success: false,
      });

      throw error;
    }
  }
}

// Usage
import { HttpSamlSigner } from "authhero";

const httpSigner = new HttpSamlSigner("https://signing-service.com/sign");
const monitoredSigner = new MonitoredSigner(httpSigner, (msg, meta) => {
  // Send to your monitoring service
  console.log(msg, meta);
});

const app = init({
  dataAdapter,
  samlSigner: monitoredSigner,
});
```

## Best Practices

### 1. Error Handling

Always handle errors appropriately:

```typescript
class MySigner implements SamlSigner {
  async signSAML(xml: string): Promise<string> {
    try {
      return await this.performSigning(xml);
    } catch (error) {
      // Log the error
      console.error("Signing failed:", error);

      // Optionally wrap with more context
      throw new Error(`SAML signing failed: ${error.message}`);
    }
  }
}
```

### 2. Validation

Validate inputs before processing:

```typescript
class ValidatingSigner implements SamlSigner {
  async signSAML(xml: string): Promise<string> {
    if (!xml || xml.trim().length === 0) {
      throw new Error("XML cannot be empty");
    }

    if (!xml.includes("<saml")) {
      throw new Error("Invalid SAML XML");
    }

    return await this.sign(xml);
  }
}
```

### 3. Timeout Handling

Implement timeouts for external services:

```typescript
class TimeoutSigner implements SamlSigner {
  constructor(
    private innerSigner: SamlSigner,
    private timeoutMs: number = 5000,
  ) {}

  async signSAML(xml: string): Promise<string> {
    return Promise.race([
      this.innerSigner.signSAML(xml),
      this.timeout(this.timeoutMs),
    ]);
  }

  private timeout(ms: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error("Signing timeout")), ms);
    });
  }
}
```

### 4. Testing

Make your signers testable:

```typescript
class MockSigner implements SamlSigner {
  async signSAML(xml: string): Promise<string> {
    // Return unsigned XML for testing
    return xml.replace(
      "</samlp:Response>",
      "<ds:Signature>mock-signature</ds:Signature></samlp:Response>",
    );
  }
}

// In tests
const app = init({
  dataAdapter: mockAdapter,
  samlSigner: new MockSigner(),
});
```

## Composing Signers

You can compose multiple signer wrappers:

```typescript
import { HttpSamlSigner } from "authhero";

// Base signer
const baseSigner = new HttpSamlSigner("https://signing-service.com/sign");

// Add retry logic
const withRetry = new RetrySigner(baseSigner, 3);

// Add caching
const withCache = new CachedSigner(withRetry, 300);

// Add monitoring
const withMonitoring = new MonitoredSigner(withCache, logger);

// Use the composed signer
const app = init({
  dataAdapter,
  samlSigner: withMonitoring,
});
```

This gives you: monitoring → caching → retry → HTTP signing in a clean, composable way.
