export interface UserAgentInfo {
  browser?: {
    name?: string;
    version?: string;
  };
  os?: {
    name?: string;
    version?: string;
  };
  device?: {
    type?: string;
    name?: string;
  };
  isEmbedded?: boolean; // For embedded browser detection
}

export interface UserAgentDetector {
  parse(userAgent: string): UserAgentInfo;
}

export class DefaultUserAgentDetector implements UserAgentDetector {
  parse(userAgent: string): UserAgentInfo {
    // Basic fallback implementation
    const embeddedInfo = this.detectEmbedded(userAgent);
    return {
      browser: embeddedInfo.browser,
      isEmbedded: embeddedInfo.isEmbedded,
    };
  }

  private detectEmbedded(userAgent: string): {
    isEmbedded: boolean;
    browser?: { name?: string };
  } {
    // Simple checks for embedded browsers with names
    const embeddedPatterns: Array<[RegExp, string]> = [
      [/wv\)/i, "WebView"],
      [/GSA\//i, "Google Search App"],
      [/FBAN\//i, "Facebook"],
      [/FBAV\//i, "Facebook"],
      [/Instagram/i, "Instagram"],
      [/Snapchat/i, "Snapchat"],
      [/TikTok/i, "TikTok"],
      [/Twitter/i, "Twitter/X"],
      [/LinkedIn/i, "LinkedIn"],
      [/UC Browser/i, "UC Browser"],
      [/SamsungBrowser/i, "Samsung Internet"],
      [/Electron/i, "Electron"],
      [/Tauri/i, "Tauri"],
    ];

    for (const [pattern, name] of embeddedPatterns) {
      if (pattern.test(userAgent)) {
        return { isEmbedded: true, browser: { name } };
      }
    }

    return { isEmbedded: false };
  }
}
