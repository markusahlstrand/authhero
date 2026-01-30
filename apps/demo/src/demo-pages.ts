import { Hono } from "hono";
import { html } from "hono/html";

/**
 * Demo pages for testing the 5 widget integration patterns
 */
export const demoPages = new Hono();

// Common HTML head with widget script
const htmlHead = (title: string) => html`
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - AuthHero Widget Demo</title>
    <script type="module" src="/widget/authhero-widget.esm.js"></script>
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        background: #f5f5f5;
        margin: 0;
        padding: 20px;
        min-height: 100vh;
      }
      .demo-container {
        max-width: 800px;
        margin: 0 auto;
      }
      h1 {
        color: #333;
        margin-bottom: 10px;
      }
      .description {
        color: #666;
        margin-bottom: 20px;
        line-height: 1.6;
      }
      .widget-wrapper {
        background: white;
        border-radius: 12px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
        padding: 40px;
        margin-bottom: 20px;
      }
      .debug-panel {
        background: #1e1e1e;
        color: #d4d4d4;
        border-radius: 8px;
        padding: 16px;
        font-family: 'Monaco', 'Menlo', monospace;
        font-size: 12px;
        max-height: 300px;
        overflow-y: auto;
      }
      .debug-panel h3 {
        color: #569cd6;
        margin: 0 0 10px 0;
        font-size: 14px;
      }
      .debug-entry {
        margin: 4px 0;
        padding: 4px;
        border-left: 2px solid #569cd6;
        padding-left: 8px;
      }
      .debug-entry.event { border-color: #4ec9b0; }
      .debug-entry.response { border-color: #ce9178; }
      .debug-entry.error { border-color: #f44747; }
      .nav {
        display: flex;
        gap: 10px;
        margin-bottom: 20px;
        flex-wrap: wrap;
      }
      .nav a {
        padding: 8px 16px;
        background: #6366f1;
        color: white;
        text-decoration: none;
        border-radius: 6px;
        font-size: 14px;
      }
      .nav a:hover {
        background: #4f46e5;
      }
      .nav a.active {
        background: #4338ca;
      }
      pre {
        background: #f8f8f8;
        padding: 12px;
        border-radius: 6px;
        overflow-x: auto;
        font-size: 12px;
      }
      code {
        font-family: 'Monaco', 'Menlo', monospace;
      }
      .status {
        padding: 8px 16px;
        border-radius: 6px;
        margin-bottom: 16px;
        font-weight: 500;
      }
      .status.info { background: #dbeafe; color: #1e40af; }
      .status.success { background: #dcfce7; color: #166534; }
      .status.error { background: #fee2e2; color: #991b1b; }
    </style>
  </head>
`;

// Navigation component
const navigation = (active: string) => html`
  <nav class="nav">
    <a href="/demo" class="${active === 'index' ? 'active' : ''}">Index</a>
    <a href="/demo/pattern1" class="${active === 'pattern1' ? 'active' : ''}">1. Event-Based</a>
    <a href="/demo/pattern2" class="${active === 'pattern2' ? 'active' : ''}">2. Self-Contained</a>
    <a href="/demo/pattern3" class="${active === 'pattern3' ? 'active' : ''}">3. Auth0-SPA-JS</a>
    <a href="/demo/pattern4" class="${active === 'pattern4' ? 'active' : ''}">4. Custom Tokens</a>
    <a href="/demo/pattern5" class="${active === 'pattern5' ? 'active' : ''}">5. Generic Forms</a>
    <a href="/demo/pattern6" class="${active === 'pattern6' ? 'active' : ''}">6. Cross-Domain</a>
  </nav>
`;

// Index page
demoPages.get("/", (c) => {
  return c.html(html`
    ${htmlHead("Widget Integration Demos")}
    <body>
      <div class="demo-container">
        ${navigation("index")}
        <h1>AuthHero Widget Integration Demos</h1>
        <p class="description">
          These demos showcase different patterns for integrating the AuthHero widget
          into your application. Each pattern demonstrates a different approach to handling
          authentication, from fully event-driven to self-contained mode.
        </p>
        
        <div class="widget-wrapper">
          <h2>Available Patterns</h2>
          
          <h3>1. Event-Based (Recommended for SPAs)</h3>
          <p>Widget emits events, your application handles everything. Most flexible approach.</p>
          
          <h3>2. Self-Contained (Recommended for Hosted Pages)</h3>
          <p>Widget handles everything: API calls, social login, navigation. No JS required.</p>
          
          <h3>3. With auth0-spa-js</h3>
          <p>Integrate with Auth0's SPA SDK for token management and silent auth.</p>
          
          <h3>4. Custom Token Management</h3>
          <p>Handle token storage and refresh yourself without a library.</p>
          
          <h3>5. Generic Forms (Non-Auth)</h3>
          <p>Use the widget for any multi-step form, not just authentication.</p>
          
          <h3>6. Cross-Domain Embedded</h3>
          <p>Embed the widget on a different domain with session-based state persistence.</p>
        </div>

        <div class="widget-wrapper">
          <h2>Quick Start</h2>
          <p>Before testing patterns 1-4, you need a login ticket. Start the auth flow:</p>
          <pre><code>GET /authorize?
  response_type=code&
  client_id=YOUR_CLIENT_ID&
  redirect_uri=http://localhost:3000/demo/pattern1&
  scope=openid profile email&
  state=csrf-token</code></pre>
          <p>
            <a href="/authorize?response_type=code&client_id=test-client&redirect_uri=http://localhost:3000/demo/pattern1&scope=openid%20profile%20email&state=csrf-123" 
               style="color: #6366f1;">
              Start Auth Flow →
            </a>
          </p>
        </div>
      </div>
    </body>
    </html>
  `);
});

// Pattern 1: Event-Based
demoPages.get("/pattern1", (c) => {
  return c.html(html`
    ${htmlHead("Pattern 1: Event-Based")}
    <body>
      <div class="demo-container">
        ${navigation("pattern1")}
        <h1>Pattern 1: Event-Based (Recommended)</h1>
        <p class="description">
          The widget emits events and your application handles all HTTP requests.
          This gives you full control over the authentication flow.
        </p>
        
        <div id="status" class="status info">Checking for login ticket...</div>
        
        <div class="widget-wrapper">
          <authhero-widget id="widget"></authhero-widget>
        </div>
        
        <div class="debug-panel">
          <h3>Event Log</h3>
          <div id="log"></div>
        </div>
      </div>

      <script type="module">
        const widget = document.getElementById('widget');
        const logEl = document.getElementById('log');
        const statusEl = document.getElementById('status');
        
        function log(type, message, data) {
          const entry = document.createElement('div');
          entry.className = 'debug-entry ' + type;
          entry.textContent = new Date().toLocaleTimeString() + ' [' + type.toUpperCase() + '] ' + message;
          if (data) {
            entry.textContent += ': ' + JSON.stringify(data).substring(0, 100);
          }
          logEl.insertBefore(entry, logEl.firstChild);
        }
        
        // Get login ticket from URL
        const params = new URLSearchParams(window.location.search);
        const loginTicket = params.get('state');
        
        if (!loginTicket) {
          statusEl.textContent = 'No login ticket found. Start the auth flow from the index page.';
          statusEl.className = 'status error';
        } else {
          statusEl.textContent = 'Login ticket: ' + loginTicket.substring(0, 20) + '...';
          statusEl.className = 'status success';
          
          // Fetch initial screen
          fetch('/u/flow/screen?form=login&state=' + loginTicket)
            .then(r => r.json())
            .then(data => {
              log('response', 'Initial screen loaded', data.screen?.title);
              widget.screen = data.screen;
              widget.branding = data.branding;
            })
            .catch(err => {
              log('error', 'Failed to load screen', err.message);
            });
        }
        
        // Handle form submissions
        widget.addEventListener('formSubmit', async (e) => {
          log('event', 'formSubmit', e.detail.data);
          
          if (!loginTicket) return;
          
          widget.loading = true;
          try {
            const response = await fetch('/u/flow/screen?form=login&state=' + loginTicket, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: e.detail.data }),
            });
            
            const result = await response.json();
            log('response', 'Submit response', result);
            
            if (result.redirect) {
              statusEl.textContent = 'Auth complete! Redirecting...';
              statusEl.className = 'status success';
              log('event', 'Redirecting to', result.redirect);
              // In real app: window.location.href = result.redirect;
            } else if (result.screen) {
              widget.screen = result.screen;
            }
          } catch (err) {
            log('error', 'Submit failed', err.message);
          } finally {
            widget.loading = false;
          }
        });
        
        // Handle button clicks
        widget.addEventListener('buttonClick', (e) => {
          log('event', 'buttonClick', e.detail);
          
          if (e.detail.type === 'SOCIAL') {
            log('event', 'Would redirect to social provider', e.detail.value);
          }
        });
        
        // Handle link clicks
        widget.addEventListener('linkClick', (e) => {
          log('event', 'linkClick', e.detail);
        });
        
        // Handle screen changes
        widget.addEventListener('screenChange', (e) => {
          log('event', 'screenChange', e.detail?.title);
        });
      </script>
    </body>
    </html>
  `);
});

// Pattern 2: Self-Contained Mode
demoPages.get("/pattern2", (c) => {
  return c.html(html`
    ${htmlHead("Pattern 2: Self-Contained")}
    <body>
      <div class="demo-container">
        ${navigation("pattern2")}
        <h1>Pattern 2: Self-Contained Mode</h1>
        <p class="description">
          The widget handles everything: API calls, social login, link navigation, and resend.
          Just provide the <code>state</code> and <code>api-url</code> props. No JavaScript required!
        </p>
        
        <div id="status" class="status info">Checking for login ticket...</div>
        
        <div class="widget-wrapper">
          <authhero-widget 
            id="widget" 
            auto-submit="true"
            auto-navigate="true"
          ></authhero-widget>
        </div>
        
        <div class="debug-panel">
          <h3>Event Log</h3>
          <div id="log"></div>
        </div>
        
        <div class="widget-wrapper">
          <h3>How It Works</h3>
          <p>With <code>auto-submit</code> and <code>auto-navigate</code> enabled, the widget:</p>
          <ul>
            <li>Automatically POSTs form data to the API</li>
            <li>Handles social login redirects</li>
            <li>Handles link navigation (forgot password, sign up, etc.)</li>
            <li>Handles code resend requests</li>
            <li>Updates screen state automatically</li>
          </ul>
          <pre><code>&lt;authhero-widget 
  api-url="/u/flow/screen"
  state="your-login-ticket"
  screen-id="login-id"
  auto-submit="true"
  auto-navigate="true"
&gt;&lt;/authhero-widget&gt;</code></pre>
        </div>
      </div>

      <script type="module">
        const widget = document.getElementById('widget');
        const logEl = document.getElementById('log');
        const statusEl = document.getElementById('status');
        
        function log(type, message, data) {
          const entry = document.createElement('div');
          entry.className = 'debug-entry ' + type;
          entry.textContent = new Date().toLocaleTimeString() + ' [' + type.toUpperCase() + '] ' + message;
          if (data) {
            entry.textContent += ': ' + JSON.stringify(data).substring(0, 100);
          }
          logEl.insertBefore(entry, logEl.firstChild);
        }
        
        const params = new URLSearchParams(window.location.search);
        const loginTicket = params.get('state');
        
        if (!loginTicket) {
          statusEl.textContent = 'No login ticket found. Start the auth flow from the index page.';
          statusEl.className = 'status error';
        } else {
          statusEl.textContent = 'Login ticket: ' + loginTicket.substring(0, 20) + '...';
          statusEl.className = 'status success';
          
          // Set up the widget - just provide state and API URL!
          widget.setAttribute('api-url', '/u/flow/screen?form=login');
          widget.setAttribute('state', loginTicket);
          
          // Fetch initial screen to get screen ID
          fetch('/u/flow/screen?form=login&state=' + loginTicket)
            .then(r => r.json())
            .then(data => {
              log('response', 'Initial screen loaded', data.screen?.title);
              widget.screen = data.screen;
              widget.branding = data.branding;
              if (data.screenId) {
                widget.setAttribute('screen-id', data.screenId);
              }
            });
        }
        
        // In self-contained mode, just listen for completion
        widget.addEventListener('flowComplete', (e) => {
          log('event', 'flowComplete', e.detail);
          statusEl.textContent = 'Auth complete! Redirect URL: ' + (e.detail.redirectUrl || 'none');
          statusEl.className = 'status success';
        });
        
        widget.addEventListener('flowError', (e) => {
          log('error', 'flowError', e.detail);
          statusEl.textContent = 'Error: ' + e.detail.message;
          statusEl.className = 'status error';
        });
        
        widget.addEventListener('screenChange', (e) => {
          log('event', 'screenChange', e.detail?.title);
        });
        
        // These events fire but widget handles them automatically
        widget.addEventListener('buttonClick', (e) => {
          log('event', 'buttonClick (auto-handled)', e.detail);
        });
        
        widget.addEventListener('linkClick', (e) => {
          log('event', 'linkClick (auto-handled)', e.detail);
        });
        
        widget.addEventListener('resend', (e) => {
          log('event', 'resend (auto-handled)', e.detail);
        });
      </script>
    </body>
    </html>
  `);
});

// Pattern 3: With auth0-spa-js (simulated)
demoPages.get("/pattern3", (c) => {
  return c.html(html`
    ${htmlHead("Pattern 3: auth0-spa-js")}
    <body>
      <div class="demo-container">
        ${navigation("pattern3")}
        <h1>Pattern 3: With auth0-spa-js</h1>
        <p class="description">
          This pattern shows how to integrate with auth0-spa-js for token management.
          The widget handles the UI, auth0-spa-js handles tokens and silent auth.
          <br><br>
          <em>Note: This demo simulates auth0-spa-js behavior without the actual library.</em>
        </p>
        
        <div id="status" class="status info">Checking authentication state...</div>
        
        <div class="widget-wrapper">
          <authhero-widget id="widget"></authhero-widget>
        </div>
        
        <div class="debug-panel">
          <h3>Event Log (simulated auth0-spa-js)</h3>
          <div id="log"></div>
        </div>
      </div>

      <script type="module">
        const widget = document.getElementById('widget');
        const logEl = document.getElementById('log');
        const statusEl = document.getElementById('status');
        
        function log(type, message, data) {
          const entry = document.createElement('div');
          entry.className = 'debug-entry ' + type;
          entry.textContent = new Date().toLocaleTimeString() + ' [' + type.toUpperCase() + '] ' + message;
          if (data) {
            entry.textContent += ': ' + JSON.stringify(data).substring(0, 100);
          }
          logEl.insertBefore(entry, logEl.firstChild);
        }
        
        // Simulated auth0-spa-js client
        const auth0 = {
          isAuthenticated: () => !!localStorage.getItem('demo_token'),
          getUser: () => JSON.parse(localStorage.getItem('demo_user') || 'null'),
          getTokenSilently: async () => {
            const token = localStorage.getItem('demo_token');
            if (!token) throw new Error('Not authenticated');
            log('event', '[auth0] getTokenSilently', 'success');
            return token;
          },
          loginWithRedirect: async (options) => {
            log('event', '[auth0] loginWithRedirect', options);
            const params = new URLSearchParams({
              response_type: 'code',
              client_id: 'test-client',
              redirect_uri: window.location.origin + '/demo/pattern3',
              scope: 'openid profile email',
              state: 'csrf-123',
              ...(options?.connection && { connection: options.connection }),
            });
            window.location.href = '/authorize?' + params;
          },
        };
        
        const params = new URLSearchParams(window.location.search);
        const loginTicket = params.get('state');
        
        if (auth0.isAuthenticated()) {
          statusEl.textContent = 'Authenticated! User: ' + auth0.getUser()?.email;
          statusEl.className = 'status success';
          widget.innerHTML = '<p>You are logged in!</p>';
        } else if (!loginTicket) {
          statusEl.textContent = 'Not authenticated. Starting login flow...';
          log('event', '[auth0] Starting loginWithRedirect');
          // In real app, would call: auth0.loginWithRedirect();
          statusEl.innerHTML = 'Not authenticated. <a href="#" id="startAuth">Click to start auth flow</a>';
          document.getElementById('startAuth')?.addEventListener('click', (e) => {
            e.preventDefault();
            auth0.loginWithRedirect();
          });
        } else {
          statusEl.textContent = 'Login ticket received. Showing login form...';
          statusEl.className = 'status success';
          log('event', '[auth0] Received login ticket', loginTicket.substring(0, 20));
          
          // Fetch initial screen
          fetch('/u/flow/screen?form=login&state=' + loginTicket)
            .then(r => r.json())
            .then(data => {
              log('response', 'Initial screen loaded');
              widget.screen = data.screen;
              widget.branding = data.branding;
            });
        }
        
        // Handle form submissions
        widget.addEventListener('formSubmit', async (e) => {
          log('event', 'formSubmit', e.detail.data);
          
          widget.loading = true;
          try {
            const response = await fetch('/u/flow/screen?form=login&state=' + loginTicket, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: e.detail.data }),
            });
            
            const result = await response.json();
            
            if (result.redirect) {
              log('event', '[auth0] Would handle callback', result.redirect);
              statusEl.textContent = 'Auth complete! In real app, auth0-spa-js handles the callback.';
              statusEl.className = 'status success';
              // Simulate storing token
              localStorage.setItem('demo_token', 'fake-token-123');
              localStorage.setItem('demo_user', JSON.stringify({ email: e.detail.data.email }));
            } else if (result.screen) {
              widget.screen = result.screen;
            }
          } finally {
            widget.loading = false;
          }
        });
        
        // Handle social login with auth0-spa-js
        widget.addEventListener('buttonClick', async (e) => {
          log('event', 'buttonClick', e.detail);
          if (e.detail.type === 'SOCIAL') {
            log('event', '[auth0] loginWithRedirect for social', e.detail.value);
            await auth0.loginWithRedirect({ connection: e.detail.value });
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Pattern 4: Custom Token Management
demoPages.get("/pattern4", (c) => {
  return c.html(html`
    ${htmlHead("Pattern 4: Custom Tokens")}
    <body>
      <div class="demo-container">
        ${navigation("pattern4")}
        <h1>Pattern 4: Custom Token Management</h1>
        <p class="description">
          Handle token storage and refresh yourself without any auth library.
          This gives you complete control over the token lifecycle.
        </p>
        
        <div id="status" class="status info">Checking for tokens...</div>
        
        <div style="margin-bottom: 16px;">
          <button id="clearTokens" style="padding: 8px 16px; cursor: pointer;">Clear Tokens</button>
          <button id="refreshToken" style="padding: 8px 16px; cursor: pointer;">Refresh Token</button>
        </div>
        
        <div class="widget-wrapper">
          <authhero-widget id="widget"></authhero-widget>
        </div>
        
        <div class="debug-panel">
          <h3>Token Storage & Events</h3>
          <div id="log"></div>
        </div>
      </div>

      <script type="module">
        const widget = document.getElementById('widget');
        const logEl = document.getElementById('log');
        const statusEl = document.getElementById('status');
        
        function log(type, message, data) {
          const entry = document.createElement('div');
          entry.className = 'debug-entry ' + type;
          entry.textContent = new Date().toLocaleTimeString() + ' [' + type.toUpperCase() + '] ' + message;
          if (data) {
            entry.textContent += ': ' + JSON.stringify(data).substring(0, 100);
          }
          logEl.insertBefore(entry, logEl.firstChild);
        }
        
        // Custom token storage
        const tokenStorage = {
          getAccessToken: () => localStorage.getItem('custom_access_token'),
          getRefreshToken: () => localStorage.getItem('custom_refresh_token'),
          setTokens: (tokens) => {
            log('event', 'Storing tokens');
            localStorage.setItem('custom_access_token', tokens.access_token);
            if (tokens.refresh_token) {
              localStorage.setItem('custom_refresh_token', tokens.refresh_token);
            }
          },
          clearTokens: () => {
            log('event', 'Clearing tokens');
            localStorage.removeItem('custom_access_token');
            localStorage.removeItem('custom_refresh_token');
          },
        };
        
        // Exchange code for tokens (simulated)
        async function exchangeCodeForTokens(code) {
          log('event', 'Exchanging code for tokens', code);
          // In real app, call /oauth/token
          // Simulating response:
          return {
            access_token: 'at_' + Math.random().toString(36).substring(7),
            refresh_token: 'rt_' + Math.random().toString(36).substring(7),
            expires_in: 3600,
          };
        }
        
        // Refresh tokens (simulated)
        async function refreshAccessToken() {
          const refreshToken = tokenStorage.getRefreshToken();
          if (!refreshToken) {
            throw new Error('No refresh token');
          }
          log('event', 'Refreshing access token');
          // Simulating response:
          const tokens = {
            access_token: 'at_refreshed_' + Math.random().toString(36).substring(7),
          };
          localStorage.setItem('custom_access_token', tokens.access_token);
          return tokens.access_token;
        }
        
        // UI handlers
        document.getElementById('clearTokens').addEventListener('click', () => {
          tokenStorage.clearTokens();
          statusEl.textContent = 'Tokens cleared';
          statusEl.className = 'status info';
          window.location.reload();
        });
        
        document.getElementById('refreshToken').addEventListener('click', async () => {
          try {
            const newToken = await refreshAccessToken();
            statusEl.textContent = 'Token refreshed: ' + newToken.substring(0, 20) + '...';
            statusEl.className = 'status success';
          } catch (err) {
            statusEl.textContent = 'Refresh failed: ' + err.message;
            statusEl.className = 'status error';
          }
        });
        
        // Check auth state
        const accessToken = tokenStorage.getAccessToken();
        const params = new URLSearchParams(window.location.search);
        const loginTicket = params.get('state');
        
        if (accessToken) {
          statusEl.textContent = 'Authenticated! Token: ' + accessToken.substring(0, 20) + '...';
          statusEl.className = 'status success';
          widget.innerHTML = '<p>You are logged in! Token stored in localStorage.</p>';
          log('event', 'Found existing access token');
        } else if (!loginTicket) {
          statusEl.textContent = 'Not authenticated. Start the auth flow from the index page.';
          statusEl.className = 'status error';
        } else {
          statusEl.textContent = 'Login ticket: ' + loginTicket.substring(0, 20) + '...';
          statusEl.className = 'status success';
          
          // Fetch initial screen
          fetch('/u/flow/screen?form=login&state=' + loginTicket)
            .then(r => r.json())
            .then(data => {
              log('response', 'Initial screen loaded');
              widget.screen = data.screen;
              widget.branding = data.branding;
            });
        }
        
        // Handle form submissions
        widget.addEventListener('formSubmit', async (e) => {
          log('event', 'formSubmit', e.detail.data);
          
          widget.loading = true;
          try {
            const response = await fetch('/u/flow/screen?form=login&state=' + loginTicket, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ data: e.detail.data }),
            });
            
            const result = await response.json();
            
            if (result.redirect) {
              // Extract code from redirect URL
              const url = new URL(result.redirect, window.location.origin);
              const code = url.searchParams.get('code');
              
              if (code) {
                log('event', 'Extracted auth code', code);
                const tokens = await exchangeCodeForTokens(code);
                tokenStorage.setTokens(tokens);
                statusEl.textContent = 'Auth complete! Tokens stored.';
                statusEl.className = 'status success';
                // Clear URL and reload
                window.history.replaceState({}, '', window.location.pathname);
                setTimeout(() => window.location.reload(), 1000);
              }
            } else if (result.screen) {
              widget.screen = result.screen;
            }
          } finally {
            widget.loading = false;
          }
        });
        
        widget.addEventListener('buttonClick', (e) => {
          log('event', 'buttonClick', e.detail);
        });
      </script>
    </body>
    </html>
  `);
});

// Pattern 5: Generic Forms (Non-Auth)
demoPages.get("/pattern5", (c) => {
  return c.html(html`
    ${htmlHead("Pattern 5: Generic Forms")}
    <body>
      <div class="demo-container">
        ${navigation("pattern5")}
        <h1>Pattern 5: Generic Forms (Non-Auth)</h1>
        <p class="description">
          The widget can render any multi-step form, not just authentication.
          This demo shows an onboarding wizard.
        </p>
        
        <div id="status" class="status info">Step 1 of 3: Company Info</div>
        
        <div class="widget-wrapper">
          <authhero-widget id="widget"></authhero-widget>
        </div>
        
        <div class="debug-panel">
          <h3>Form Data</h3>
          <div id="log"></div>
        </div>
      </div>

      <script type="module">
        const widget = document.getElementById('widget');
        const logEl = document.getElementById('log');
        const statusEl = document.getElementById('status');
        
        let currentStep = 1;
        let formData = {};
        
        function log(type, message, data) {
          const entry = document.createElement('div');
          entry.className = 'debug-entry ' + type;
          entry.textContent = new Date().toLocaleTimeString() + ' [' + type.toUpperCase() + '] ' + message;
          if (data) {
            entry.textContent += ': ' + JSON.stringify(data);
          }
          logEl.insertBefore(entry, logEl.firstChild);
        }
        
        // Define the form screens
        const screens = {
          step1: {
            action: '/api/onboarding/step1',
            method: 'POST',
            title: 'Company Information',
            description: 'Tell us about your company',
            components: [
              {
                id: 'company_name',
                type: 'TEXT',
                category: 'FIELD',
                required: true,
                label: 'Company Name',
                config: { placeholder: 'Acme Inc.' },
              },
              {
                id: 'industry',
                type: 'TEXT',
                category: 'FIELD',
                required: true,
                label: 'Industry',
                config: { placeholder: 'Technology, Finance, Healthcare...' },
              },
              {
                id: 'submit',
                type: 'NEXT_BUTTON',
                category: 'BLOCK',
                config: { text: 'Continue' },
              },
            ],
          },
          step2: {
            action: '/api/onboarding/step2',
            method: 'POST',
            title: 'Team Size',
            description: 'How big is your team?',
            components: [
              {
                id: 'team_size',
                type: 'TEXT',
                category: 'FIELD',
                required: true,
                label: 'Number of Employees',
                config: { placeholder: '10' },
              },
              {
                id: 'plan',
                type: 'TEXT',
                category: 'FIELD',
                required: true,
                label: 'Preferred Plan',
                config: { placeholder: 'Starter, Pro, Enterprise' },
              },
              {
                id: 'submit',
                type: 'NEXT_BUTTON',
                category: 'BLOCK',
                config: { text: 'Continue' },
              },
            ],
            links: [
              { id: 'back', text: '← Back to company info', href: '#step1' },
            ],
          },
          step3: {
            action: '/api/onboarding/step3',
            method: 'POST',
            title: 'Almost Done!',
            description: 'Review your information and complete setup',
            components: [
              {
                id: 'terms',
                type: 'CHECKBOX',
                category: 'FIELD',
                required: true,
                label: 'I agree to the Terms of Service',
              },
              {
                id: 'submit',
                type: 'NEXT_BUTTON',
                category: 'BLOCK',
                config: { text: 'Complete Setup' },
              },
            ],
            links: [
              { id: 'back', text: '← Back to team size', href: '#step2' },
            ],
          },
          complete: {
            action: '#',
            method: 'GET',
            title: '🎉 Setup Complete!',
            description: 'Your account is ready to use.',
            components: [
              {
                id: 'info',
                type: 'RICH_TEXT',
                category: 'BLOCK',
                config: {
                  html: '<p style="text-align: center; color: #059669;">Welcome aboard! Your workspace has been created.</p>',
                },
              },
            ],
          },
        };
        
        // Initialize with step 1
        widget.screen = screens.step1;
        
        // Handle form submissions
        widget.addEventListener('formSubmit', async (e) => {
          const data = e.detail.data;
          log('event', 'Step ' + currentStep + ' submitted', data);
          
          // Merge form data
          formData = { ...formData, ...data };
          log('event', 'Total form data', formData);
          
          // Move to next step
          currentStep++;
          
          if (currentStep === 2) {
            widget.screen = screens.step2;
            statusEl.textContent = 'Step 2 of 3: Team Size';
          } else if (currentStep === 3) {
            widget.screen = screens.step3;
            statusEl.textContent = 'Step 3 of 3: Confirmation';
          } else {
            widget.screen = screens.complete;
            statusEl.textContent = 'Onboarding complete!';
            statusEl.className = 'status success';
            log('response', 'Final form data', formData);
          }
        });
        
        // Handle link clicks for back navigation
        widget.addEventListener('linkClick', (e) => {
          log('event', 'linkClick', e.detail);
          
          if (e.detail.href === '#step1') {
            currentStep = 1;
            widget.screen = screens.step1;
            statusEl.textContent = 'Step 1 of 3: Company Info';
          } else if (e.detail.href === '#step2') {
            currentStep = 2;
            widget.screen = screens.step2;
            statusEl.textContent = 'Step 2 of 3: Team Size';
          }
        });
      </script>
    </body>
    </html>
  `);
});

// Pattern 6: Cross-Domain Embedded
demoPages.get("/pattern6", (c) => {
  return c.html(html`
    ${htmlHead("Pattern 6: Cross-Domain")}
    <body>
      <div class="demo-container">
        ${navigation("pattern6")}
        <h1>Pattern 6: Cross-Domain Embedded</h1>
        <p class="description">
          Embed the widget on a different domain with session-based state persistence.
          The widget stores state in <code>sessionStorage</code> so it survives page reloads.
        </p>
        
        <div id="status" class="status info">Widget configured for cross-domain use</div>
        
        <div class="widget-wrapper">
          <authhero-widget 
            id="widget"
            auto-submit="true"
            auto-navigate="true"
            state-persistence="session"
            storage-key="authhero-demo-state"
          ></authhero-widget>
        </div>
        
        <div class="debug-panel">
          <h3>Event Log</h3>
          <div id="log"></div>
        </div>
        
        <div class="widget-wrapper">
          <h3>How It Works</h3>
          <p>For cross-domain scenarios, you configure:</p>
          <ul>
            <li><code>base-url</code> - Full URL to the AuthHero server</li>
            <li><code>api-url</code> - Full URL to the screen API endpoint</li>
            <li><code>state-persistence="session"</code> - Store state in sessionStorage</li>
            <li><code>storage-key</code> - Custom key for storage (optional)</li>
          </ul>
          <pre><code>&lt;authhero-widget 
  base-url="https://auth.example.com"
  api-url="https://auth.example.com/u/flow/screen"
  state="initial-state-token"
  auth-params='{"client_id":"abc","redirect_uri":"https://app.example.com/callback"}'
  auto-submit="true"
  auto-navigate="true"
  state-persistence="session"
  storage-key="my-app-auth-state"
&gt;&lt;/authhero-widget&gt;</code></pre>
          
          <h3>State Persistence Options</h3>
          <ul>
            <li><code>url</code> - Store in URL path (default for universal login)</li>
            <li><code>session</code> - Store in sessionStorage (survives reloads)</li>
            <li><code>memory</code> - Store in memory only (lost on reload)</li>
          </ul>
          
          <h3>Test State Persistence</h3>
          <p>
            <button onclick="location.reload()">Reload Page</button>
            <button onclick="sessionStorage.removeItem('authhero-demo-state'); location.reload();">Clear State & Reload</button>
          </p>
        </div>
      </div>

      <script type="module">
        const widget = document.getElementById('widget');
        const logEl = document.getElementById('log');
        const statusEl = document.getElementById('status');
        
        function log(type, message, data) {
          const entry = document.createElement('div');
          entry.className = 'debug-entry ' + type;
          entry.textContent = new Date().toLocaleTimeString() + ' [' + type.toUpperCase() + '] ' + message;
          if (data) {
            entry.textContent += ': ' + JSON.stringify(data).substring(0, 100);
          }
          logEl.insertBefore(entry, logEl.firstChild);
        }
        
        // Check for persisted state
        const persistedState = sessionStorage.getItem('authhero-demo-state');
        if (persistedState) {
          log('info', 'Restored state from sessionStorage', persistedState);
          statusEl.textContent = 'State restored from sessionStorage';
          statusEl.className = 'status success';
        }
        
        // Check for login ticket in URL
        const params = new URLSearchParams(window.location.search);
        const loginTicket = params.get('state');
        
        if (loginTicket) {
          // Configure widget with the provided state
          widget.setAttribute('api-url', '/u/flow/screen?form=login');
          widget.setAttribute('state', loginTicket);
          
          // Store auth params for cross-domain use
          widget.setAttribute('auth-params', JSON.stringify({
            client_id: params.get('client_id') || 'demo-client',
            redirect_uri: params.get('redirect_uri') || window.location.origin + '/demo/callback',
            scope: params.get('scope') || 'openid profile email',
          }));
          
          // Fetch initial screen
          fetch('/u/flow/screen?form=login&state=' + loginTicket)
            .then(r => r.json())
            .then(data => {
              log('response', 'Initial screen loaded', data.screen?.title);
              widget.screen = data.screen;
              widget.branding = data.branding;
              if (data.screenId) {
                widget.setAttribute('screen-id', data.screenId);
              }
              statusEl.textContent = 'Ready - state will persist in sessionStorage';
              statusEl.className = 'status success';
            });
        } else if (!persistedState) {
          statusEl.textContent = 'No login ticket. Start auth flow from index page, or widget will use persisted state.';
          statusEl.className = 'status error';
          
          // Demo: Create a sample screen to show the widget works
          widget.screen = {
            action: '/api/demo',
            method: 'POST',
            title: 'Cross-Domain Demo',
            description: 'This demonstrates the widget in cross-domain mode. Start a real auth flow to test persistence.',
            components: [
              {
                id: 'email',
                type: 'TEXT',
                category: 'FIELD',
                label: 'Email',
                config: { placeholder: 'you@example.com' },
              },
              {
                id: 'submit',
                type: 'NEXT_BUTTON',
                category: 'BLOCK',
                config: { text: 'Demo Submit' },
              },
            ],
          };
        }
        
        // Listen for events
        widget.addEventListener('flowComplete', (e) => {
          log('event', 'flowComplete', e.detail);
          statusEl.textContent = 'Auth complete!';
          statusEl.className = 'status success';
        });
        
        widget.addEventListener('screenChange', (e) => {
          log('event', 'screenChange', e.detail?.title);
        });
        
        widget.addEventListener('formSubmit', (e) => {
          log('event', 'formSubmit (handled by widget)', e.detail);
        });
      </script>
    </body>
    </html>
  `);
});