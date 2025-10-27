# Database Schema

AuthHero uses a comprehensive database schema designed for multi-tenant authentication and authorization. This page documents the complete database structure and relationships.

<style>
.mermaid-container {
  position: relative;
  width: 100%;
  min-height: 400px;
  max-height: 80vh;
  border: 1px solid var(--vp-c-border);
  border-radius: 8px;
  overflow: hidden;
  background: var(--vp-c-bg);
}

.mermaid-controls {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 100;
  display: flex;
  gap: 8px;
}

.mermaid-btn {
  padding: 6px 12px;
  background: var(--vp-c-brand);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
}

.mermaid-btn:hover {
  background: var(--vp-c-brand-dark);
}

.mermaid-wrapper {
  width: 100%;
  height: 100%;
  overflow: auto;
  transform-origin: 0 0;
  transition: transform 0.3s ease;
}

.fullscreen-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(0, 0, 0, 0.9);
  z-index: 1000;
  display: none;
}

.fullscreen-overlay.active {
  display: flex;
  align-items: center;
  justify-content: center;
}

.fullscreen-content {
  width: 95%;
  height: 95%;
  background: var(--vp-c-bg);
  border-radius: 8px;
  position: relative;
  overflow: hidden;
}

.fullscreen-controls {
  position: absolute;
  top: 15px;
  right: 15px;
  z-index: 101;
  display: flex;
  gap: 8px;
}

.close-btn {
  background: #ef4444;
}

.close-btn:hover {
  background: #dc2626;
}

#mermaid-diagram {
  transform-origin: center center;
}

.mermaid {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  height: 100%;
  background: transparent !important;
}

.mermaid svg {
  max-width: 100%;
  height: auto;
  background: transparent !important;
}

/* Fix Mermaid text rendering */
.mermaid .er.entityBox {
  fill: var(--vp-c-bg) !important;
  stroke: var(--vp-c-border) !important;
  stroke-width: 1px !important;
}

.mermaid .er.entityLabel {
  fill: var(--vp-c-text-1) !important;
  font-family: var(--vp-font-family-base) !important;
  font-size: 14px !important;
  font-weight: 600 !important;
}

.mermaid .er.attributeBoxEven,
.mermaid .er.attributeBoxOdd {
  fill: var(--vp-c-bg-soft) !important;
  stroke: var(--vp-c-border) !important;
  stroke-width: 0.5px !important;
}

.mermaid text {
  fill: var(--vp-c-text-1) !important;
  font-family: var(--vp-font-family-base) !important;
  font-size: 12px !important;
}

/* More specific targeting for ERD elements */
.mermaid .er .er-attributeText {
  fill: var(--vp-c-text-2) !important;
  font-size: 11px !important;
}

.mermaid .er .er-entityNameText {
  fill: var(--vp-c-text-1) !important;
  font-weight: bold !important;
  font-size: 14px !important;
}

/* Ensure all text is visible */
.mermaid g text {
  fill: var(--vp-c-text-1) !important;
  visibility: visible !important;
  opacity: 1 !important;
}

/* Override any white text */
.mermaid [fill="white"] {
  fill: var(--vp-c-text-1) !important;
}

.mermaid [fill="#ffffff"] {
  fill: var(--vp-c-text-1) !important;
}
</style>

## Entity Relationship Diagram

<div class="mermaid-container">
  <div class="mermaid-controls">
    <button class="mermaid-btn" onclick="zoomIn()">Zoom In</button>
    <button class="mermaid-btn" onclick="zoomOut()">Zoom Out</button>
    <button class="mermaid-btn" onclick="resetZoom()">Reset</button>
    <button class="mermaid-btn" onclick="toggleFullscreen()">Fullscreen</button>
  </div>
  <div class="mermaid-wrapper" id="mermaid-wrapper">

```mermaid
erDiagram
    %% Core Tables
    tenants {
        varchar id PK
        varchar name
        varchar audience
        varchar sender_email
        varchar sender_name
        varchar language
        varchar logo
        varchar primary_color
        varchar secondary_color
        varchar support_url
        varchar created_at
        varchar updated_at
    }

    users {
        varchar user_id PK
        varchar tenant_id PK,FK
        varchar email
        varchar given_name
        varchar family_name
        varchar nickname
        varchar name
        varchar picture
        varchar phone_number
        boolean phone_verified
        varchar username
        varchar linked_to FK
        varchar last_ip
        integer login_count
        varchar last_login
        varchar provider
        varchar connection
        boolean email_verified
        boolean is_social
        varchar app_metadata
        varchar user_metadata
        varchar profileData
        varchar locale
        varchar created_at
        varchar updated_at
    }

    applications {
        varchar id PK
        varchar tenant_id FK
        varchar name
        varchar client_secret
        varchar allowed_logout_urls
        varchar authentication_settings
        varchar addons
        varchar callbacks
        varchar allowed_origins
        varchar web_origins
        varchar allowed_clients
        varchar email_validation
        boolean disable_sign_ups
        varchar created_at
        varchar updated_at
    }

    connections {
        varchar id PK
        varchar tenant_id FK
        varchar name
        varchar response_type
        varchar response_mode
        varchar strategy
        varchar options
        varchar created_at
        varchar updated_at
    }

    %% Authentication & Sessions
    sessions {
        varchar id PK
        varchar tenant_id FK
        varchar user_id FK
        varchar login_session_id FK
        varchar device
        varchar clients
        varchar created_at
        varchar updated_at
        varchar expires_at
        varchar idle_expires_at
        varchar authenticated_at
        varchar last_interaction_at
        varchar used_at
        varchar revoked_at
    }

    login_sessions {
        varchar id PK
        varchar tenant_id FK
        varchar session_id FK
        varchar csrf_token
        varchar authParams_client_id
        varchar authorization_url
        varchar ip
        varchar useragent
        varchar auth0Client
        boolean login_completed
        varchar created_at
        varchar updated_at
        varchar expires_at
    }

    refresh_tokens {
        varchar id PK
        varchar client_id FK
        varchar tenant_id FK
        varchar session_id
        varchar user_id FK
        varchar device
        varchar resource_servers
        boolean rotating
        varchar created_at
        varchar expires_at
        varchar idle_expires_at
        varchar last_exchanged_at
    }

    codes {
        varchar code_id PK
        varchar code_type PK
        varchar tenant_id FK
        varchar user_id FK
        varchar login_id
        varchar connection_id
        varchar code_verifier
        varchar code_challenge
        varchar code_challenge_method
        varchar redirect_uri
        varchar nonce
        varchar state
        varchar created_at
        varchar expires_at
        varchar used_at
    }

    passwords {
        varchar user_id PK,FK
        varchar tenant_id PK,FK
        varchar password
        varchar algorithm
        varchar created_at
        varchar updated_at
    }

    %% RBAC (Role-Based Access Control)
    roles {
        varchar id PK
        varchar tenant_id PK,FK
        varchar name
        varchar description
        varchar created_at
        varchar updated_at
    }

    resource_servers {
        varchar id PK
        varchar tenant_id PK,FK
        varchar identifier
        varchar name
        varchar scopes
        varchar signing_alg
        varchar signing_secret
        integer token_lifetime
        integer token_lifetime_for_web
        varchar verification_key
        varchar options
        varchar created_at
        varchar updated_at
    }

    role_permissions {
        varchar tenant_id PK,FK
        varchar role_id PK,FK
        varchar resource_server_identifier PK
        varchar permission_name PK
        varchar created_at
    }

    user_permissions {
        varchar tenant_id PK,FK
        varchar user_id PK,FK
        varchar resource_server_identifier PK
        varchar permission_name PK
        varchar created_at
    }

    user_roles {
        varchar tenant_id PK,FK
        varchar user_id PK,FK
        varchar role_id PK,FK
        varchar created_at
    }

    %% Organizations (Multi-tenant Organizations)
    organizations {
        varchar id PK
        varchar tenant_id FK
        varchar name
        varchar display_name
        text branding
        text metadata
        text enabled_connections
        text token_quota
        varchar created_at
        varchar updated_at
    }

    user_organizations {
        varchar id PK
        varchar tenant_id FK
        varchar user_id FK
        varchar organization_id FK
        varchar created_at
        varchar updated_at
    }

    invites {
        varchar id PK
        varchar tenant_id FK
        varchar organization_id FK
        text inviter
        text invitee
        varchar invitation_url
        varchar ticket_id
        varchar client_id
        varchar connection_id
        text app_metadata
        text user_metadata
        text roles
        integer ttl_sec
        boolean send_invitation_email
        varchar created_at
        varchar expires_at
    }

    %% Customization & Branding
    branding {
        varchar tenant_id PK,FK
        varchar logo_url
        varchar favicon_url
        varchar font_url
        varchar colors_primary
        varchar colors_page_background_type
        varchar colors_page_background_start
        varchar colors_page_background_end
        integer colors_page_background_angle_dev
    }

    %% Configuration & Settings
    prompt_settings {
        varchar tenant_id PK,FK
        varchar universal_login_experience
        boolean identifier_first
        boolean password_first
        boolean webauthn_platform_first_factor
    }

    email_providers {
        varchar tenant_id PK,FK
        varchar name
        boolean enabled
        varchar default_from_address
        varchar credentials
        varchar settings
        varchar created_at
        varchar updated_at
    }

    custom_domains {
        varchar custom_domain_id PK
        varchar tenant_id FK
        varchar domain
        boolean primary
        varchar status
        varchar type
        varchar origin_domain_name
        varchar verification
        varchar custom_client_ip_header
        varchar tls_policy
        varchar domain_metadata
        varchar created_at
        varchar updated_at
    }

    %% Forms & Hooks
    forms {
        varchar id PK
        varchar tenant_id FK
        varchar name
        varchar messages
        varchar languages
        varchar translations
        varchar nodes
        varchar start
        varchar ending
        varchar style
        varchar created_at
        varchar updated_at
    }

    hooks {
        varchar hook_id PK
        varchar tenant_id FK
        varchar trigger_id
        boolean enabled
        boolean synchronous
        integer priority
        text form_id
        varchar url
        varchar created_at
        varchar updated_at
    }

    %% Security & Cryptography
    keys {
        varchar kid PK
        varchar tenant_id FK
        varchar connection FK
        varchar type
        varchar cert
        varchar pkcs7
        varchar fingerprint
        varchar thumbprint
        varchar current_since
        varchar current_until
        varchar created_at
        varchar revoked_at
    }

    %% Audit & Logging
    logs {
        varchar id PK
        varchar tenant_id FK
        varchar user_id
        varchar ip
        varchar type
        varchar date
        varchar client_id
        varchar client_name
        varchar description
        varchar details
        varchar user_name
        varchar auth0_client
        boolean isMobile
        varchar connection
        varchar connection_id
        varchar audience
        varchar scope
        varchar strategy
        varchar strategy_type
        varchar hostname
        varchar session_connection
        varchar user_agent
    }

    %% Legacy/Administrative
    members {
        varchar id PK
        varchar tenant_id FK
        varchar sub
        varchar email
        varchar name
        varchar status
        varchar role
        varchar picture
        varchar created_at
        varchar updated_at
    }

    migrations {
        varchar id PK
        varchar tenant_id FK
        varchar provider
        varchar client_id
        varchar origin
        varchar domain
        varchar created_at
        varchar updated_at
    }

    %% Core Relationships
    tenants ||--o{ users : "has many"
    tenants ||--o{ applications : "has many"
    tenants ||--o{ connections : "has many"
    tenants ||--o{ sessions : "has many"
    tenants ||--o{ login_sessions : "has many"
    tenants ||--o{ refresh_tokens : "has many"
    tenants ||--o{ codes : "has many"
    tenants ||--o{ roles : "has many"
    tenants ||--o{ resource_servers : "has many"
    tenants ||--o{ organizations : "has many"
    tenants ||--|| branding : "has one"
    tenants ||--|| prompt_settings : "has one"
    tenants ||--|| email_providers : "has one"
    tenants ||--o{ custom_domains : "has many"
    tenants ||--o{ forms : "has many"
    tenants ||--o{ hooks : "has many"
    tenants ||--o{ keys : "has many"
    tenants ||--o{ logs : "has many"
    tenants ||--o{ members : "has many"
    tenants ||--o{ migrations : "has many"

    %% User Relationships
    users ||--|| passwords : "has one"
    users ||--o{ sessions : "has many"
    users ||--o{ refresh_tokens : "has many"
    users ||--o{ codes : "has many"
    users ||--o{ user_permissions : "has many"
    users ||--o{ user_roles : "has many"
    users ||--o{ user_organizations : "has many"
    users ||--o{ users : "linked to"

    %% Application Relationships
    applications ||--o{ refresh_tokens : "has many"

    %% Connection Relationships
    connections ||--o{ keys : "has many"

    %% Session Relationships
    sessions ||--|| login_sessions : "belongs to"

    %% RBAC Relationships
    roles ||--o{ role_permissions : "has many"
    roles ||--o{ user_roles : "has many"
    resource_servers ||--o{ role_permissions : "has many"
    resource_servers ||--o{ user_permissions : "has many"

    %% Organization Relationships
    organizations ||--o{ user_organizations : "has many"
    organizations ||--o{ invites : "has many"
    user_organizations }o--|| users : "belongs to"
    user_organizations }o--|| organizations : "belongs to"

    %% Form Relationships
    forms ||--o{ hooks : "used by"
```

  </div>
</div>

<div class="fullscreen-overlay" id="fullscreen-overlay">
  <div class="fullscreen-content">
    <div class="fullscreen-controls">
      <button class="mermaid-btn" onclick="zoomIn()">Zoom In</button>
      <button class="mermaid-btn" onclick="zoomOut()">Zoom Out</button>
      <button class="mermaid-btn" onclick="resetZoom()">Reset</button>
      <button class="mermaid-btn close-btn" onclick="toggleFullscreen()">Close</button>
    </div>
    <div class="mermaid-wrapper" id="fullscreen-mermaid-wrapper"></div>
  </div>
</div>

<script>
// Initialize when page loads
if (typeof window !== 'undefined') {
  // Global variables
  window.currentZoom = 1;
  window.isFullscreen = false;
  window.mermaidSvg = null;

  // Make functions globally available
  window.zoomIn = function() {
    window.currentZoom = Math.min(window.currentZoom * 1.2, 3);
    applyZoom();
  }

  window.zoomOut = function() {
    window.currentZoom = Math.max(window.currentZoom / 1.2, 0.3);
    applyZoom();
  }

  window.resetZoom = function() {
    window.currentZoom = 1;
    applyZoom();
    
    // Reset scroll position
    const wrapper = window.isFullscreen ? 
      document.getElementById('fullscreen-mermaid-wrapper') : 
      document.getElementById('mermaid-wrapper');
    if (wrapper) {
      wrapper.scrollLeft = 0;
      wrapper.scrollTop = 0;
    }
  }

  window.toggleFullscreen = function() {
    const overlay = document.getElementById('fullscreen-overlay');
    const normalWrapper = document.getElementById('mermaid-wrapper');
    const fullscreenWrapper = document.getElementById('fullscreen-mermaid-wrapper');
    
    if (!overlay || !normalWrapper || !fullscreenWrapper) {
      console.log('Missing elements:', { overlay: !!overlay, normalWrapper: !!normalWrapper, fullscreenWrapper: !!fullscreenWrapper });
      return;
    }
    
    window.isFullscreen = !window.isFullscreen;
    
    if (window.isFullscreen) {
      overlay.classList.add('active');
      // Move mermaid to fullscreen container
      const mermaidElement = normalWrapper.querySelector('.mermaid');
      if (mermaidElement) {
        fullscreenWrapper.appendChild(mermaidElement);
        addPanFunctionality(); // Re-add pan functionality for fullscreen
        fixMermaidTextColors(); // Fix text colors after moving
      }
      document.body.style.overflow = 'hidden';
    } else {
      overlay.classList.remove('active');
      // Move mermaid back to normal container
      const mermaidElement = fullscreenWrapper.querySelector('.mermaid');
      if (mermaidElement) {
        normalWrapper.appendChild(mermaidElement);
        addPanFunctionality(); // Re-add pan functionality for normal view
        fixMermaidTextColors(); // Fix text colors after moving
      }
      document.body.style.overflow = '';
    }
    
    applyZoom();
  }
  // Try multiple initialization methods
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeMermaidControls);
  } else {
    initializeMermaidControls();
  }
  
  // Also try with a timeout for Mermaid rendering
  setTimeout(initializeMermaidControls, 1000);
  setTimeout(initializeMermaidControls, 2000);
  
  // Set up MutationObserver to detect when Mermaid renders
  const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList') {
        const mermaidElements = document.querySelectorAll('.mermaid svg');
        if (mermaidElements.length > 0 && !window.mermaidSvg) {
          initializeMermaidControls();
        }
      }
    });
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

function initializeMermaidControls() {
  console.log('Initializing Mermaid controls...');
  
  // Look for mermaid element
  const mermaidElement = document.querySelector('.mermaid');
  const mermaidSvg = document.querySelector('.mermaid svg');
  
  console.log('Found elements:', { 
    mermaidElement: !!mermaidElement, 
    mermaidSvg: !!mermaidSvg 
  });
  
  if (mermaidElement && mermaidSvg) {
    window.mermaidSvg = mermaidSvg;
    console.log('Found Mermaid SVG, initializing...');
    window.mermaidSvg.id = 'mermaid-diagram';
    
    // Ensure proper styling
    window.mermaidSvg.style.maxWidth = '100%';
    window.mermaidSvg.style.height = 'auto';
    window.mermaidSvg.style.background = 'transparent';
    
    // Fix text colors
    fixMermaidTextColors();
    
    // Make sure it's in the wrapper
    const wrapper = document.getElementById('mermaid-wrapper');
    if (wrapper && !wrapper.contains(mermaidElement)) {
      wrapper.appendChild(mermaidElement);
      console.log('Moved mermaid to wrapper');
    }
    
    // Add pan functionality
    addPanFunctionality();
    
    // Apply initial zoom
    applyZoom();
    
    return true;
  }
  
  console.log('Mermaid elements not found yet');
  return false;
}

function fixMermaidTextColors() {
  if (!window.mermaidSvg) return;
  
  console.log('Fixing Mermaid text colors...');
  
  // Get computed CSS variables
  const textColor = getComputedStyle(document.documentElement).getPropertyValue('--vp-c-text-1').trim() || '#213547';
  const textColor2 = getComputedStyle(document.documentElement).getPropertyValue('--vp-c-text-2').trim() || '#476582';
  
  // Fix all text elements
  const textElements = window.mermaidSvg.querySelectorAll('text');
  textElements.forEach(text => {
    text.style.fill = textColor;
    text.style.fontFamily = 'inherit';
    text.style.visibility = 'visible';
    text.style.opacity = '1';
  });
  
  // Fix specific ERD text elements
  const entityLabels = window.mermaidSvg.querySelectorAll('.er-entityNameText, .entityLabel');
  entityLabels.forEach(label => {
    label.style.fill = textColor;
    label.style.fontWeight = 'bold';
    label.style.fontSize = '14px';
  });
  
  const attributeTexts = window.mermaidSvg.querySelectorAll('.er-attributeText');
  attributeTexts.forEach(attr => {
    attr.style.fill = textColor2;
    attr.style.fontSize = '12px';
  });
  
  // Force any white text to be visible
  const whiteTexts = window.mermaidSvg.querySelectorAll('[fill="white"], [fill="#ffffff"], [fill="#FFFFFF"]');
  whiteTexts.forEach(text => {
    text.setAttribute('fill', textColor);
  });
  
  console.log(`Fixed ${textElements.length} text elements`);
}

function addPanFunctionality() {
  if (!window.mermaidSvg) return;
  
  let isPanning = false;
  let startX, startY, scrollLeft, scrollTop;
  
  const wrapper = window.isFullscreen ? 
    document.getElementById('fullscreen-mermaid-wrapper') : 
    document.getElementById('mermaid-wrapper');
  
  if (!wrapper) return;
  
  // Remove existing event listeners to avoid duplicates
  wrapper.style.cursor = 'grab';
  
  const startPan = (e) => {
    isPanning = true;
    startX = e.pageX - wrapper.offsetLeft;
    startY = e.pageY - wrapper.offsetTop;
    scrollLeft = wrapper.scrollLeft;
    scrollTop = wrapper.scrollTop;
    wrapper.style.cursor = 'grabbing';
  };
  
  const endPan = () => {
    isPanning = false;
    wrapper.style.cursor = 'grab';
  };
  
  const pan = (e) => {
    if (!isPanning) return;
    e.preventDefault();
    const x = e.pageX - wrapper.offsetLeft;
    const y = e.pageY - wrapper.offsetTop;
    const walkX = (x - startX) * 2;
    const walkY = (y - startY) * 2;
    wrapper.scrollLeft = scrollLeft - walkX;
    wrapper.scrollTop = scrollTop - walkY;
  };
  
  wrapper.addEventListener('mousedown', startPan);
  wrapper.addEventListener('mouseleave', endPan);
  wrapper.addEventListener('mouseup', endPan);
  wrapper.addEventListener('mousemove', pan);
}

function applyZoom() {
  if (!window.mermaidSvg) return;
  
  window.mermaidSvg.style.transform = `scale(${window.currentZoom})`;
  
  // Fix text colors after zoom (sometimes they get reset)
  fixMermaidTextColors();
  
  // Update container size to accommodate scaled content
  const wrapper = window.isFullscreen ? 
    document.getElementById('fullscreen-mermaid-wrapper') : 
    document.getElementById('mermaid-wrapper');
    
  if (wrapper && window.mermaidSvg) {
    const rect = window.mermaidSvg.getBoundingClientRect();
    wrapper.style.minWidth = `${rect.width * window.currentZoom}px`;
    wrapper.style.minHeight = `${rect.height * window.currentZoom}px`;
  }
}

// Close fullscreen with Escape key
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && window.isFullscreen) {
      window.toggleFullscreen();
    }
  });
}
</script>

## Key Tables and Their Purpose

### Core Multi-Tenant Tables

#### `tenants`

The root table for multi-tenancy. Every other table references this through `tenant_id` to ensure complete data isolation between tenants.

#### `users`

Stores user accounts with comprehensive profile information. Supports:

- Social and password-based authentication
- Account linking (users can link multiple social accounts)
- Detailed profile data and metadata
- Email and phone verification status

#### `applications`

OAuth/OIDC client applications that can authenticate users. Each application has:

- Client secrets for confidential clients
- Allowed redirect URIs and origins
- OAuth flow configuration
- Custom addons and settings

#### `connections`

Identity providers (social logins, enterprise connections, etc.) that users can authenticate through:

- Strategy-based configuration (Google, Facebook, SAML, etc.)
- Custom options for each provider
- Response type and mode settings

### Authentication Flow Tables

#### `login_sessions`

Tracks the authentication flow from start to completion:

- CSRF protection tokens
- OAuth parameters (client_id, scope, redirect_uri, etc.)
- Authorization URL construction
- Login completion status

#### `sessions`

Active user sessions after successful authentication:

- Session expiration and idle timeout
- Device and client information
- Session lifecycle tracking

#### `refresh_tokens`

Enables token renewal without re-authentication:

- Rotating refresh token support
- Resource server scoping
- Device binding

#### `codes`

Temporary authorization codes for OAuth flows:

- Multiple code types (authorization, password reset, etc.)
- PKCE support (code challenge/verifier)
- Expiration and usage tracking

#### `passwords`

Secure password storage:

- Algorithm specification for password hashing
- Linked to users via composite foreign key

### Role-Based Access Control (RBAC)

#### `roles`

User roles within a tenant:

- Role names and descriptions
- Tenant-scoped roles

#### `resource_servers`

APIs that can be accessed through AuthHero:

- JWT signing configuration
- Token lifetime settings
- Scope definitions
- Verification keys

#### `role_permissions`

Links roles to specific permissions on resource servers:

- Composite primary key (tenant_id, role_id, resource_server_identifier, permission_name)
- Enables fine-grained access control

#### `user_permissions`

Direct user permissions (bypass roles):

- Same structure as role permissions
- Allows for user-specific access grants

#### `user_roles`

Assigns roles to users:

- Many-to-many relationship between users and roles
- Tenant-scoped assignments

### Organizations (Sub-Tenancy)

#### `organizations`

Enables hierarchical multi-tenancy within a tenant:

- Organization branding and metadata
- Enabled connections per organization
- Token quotas and limits

#### `user_organizations`

Maps users to organizations (many-to-many relationship):

- Allows users to belong to multiple organizations
- Tracks organization membership per tenant

#### `invites`

Manages organization invitations for user onboarding:

- Pre-configured user attributes (roles, metadata)
- Invitation tracking with inviter/invitee information
- Expiration management (default 7 days, max 30 days)
- Connection specification for authentication
- Unique invitation URLs with tickets
- Optional email delivery

### Customization and Branding

#### `branding`

Simple branding configuration per tenant:

- Logo and favicon URLs
- Primary colors and page backgrounds
- Font customization

#### `themes`

Comprehensive UI theming (more detailed than branding):

- Complete color palette customization
- Typography settings
- Border and layout configurations
- Widget positioning and styling

#### `custom_domains`

White-label domain support:

- Domain verification and status
- TLS policy configuration
- Custom client IP headers

### Configuration and Settings

#### `prompt_settings`

Controls the login flow behavior:

- Universal login experience settings
- Username-first vs password-first flows
- WebAuthn configuration

#### `email_providers`

Custom email delivery configuration:

- Provider credentials (SendGrid, Mailgun, etc.)
- Email templates and settings
- Per-tenant email customization

### Forms and Extensibility

#### `forms`

Custom forms for various workflows:

- Multi-language support
- Node-based form definition
- Custom styling and branding

#### `hooks`

Webhooks for extending AuthHero functionality:

- Trigger-based execution
- Synchronous and asynchronous hooks
- Form integration
- Priority-based ordering

### Security and Cryptography

#### `keys`

Cryptographic keys for JWT signing and other security operations:

- Key rotation support
- Connection-specific keys
- Certificate and fingerprint storage
- Revocation tracking

### Audit and Logging

#### `logs`

Comprehensive audit trail:

- All authentication events
- User actions and administrative changes
- Detailed context including IP, user agent, etc.
- Performance and security monitoring

### Administrative Tables

#### `members`

Administrative users who can manage tenants:

- Separate from regular users
- Role-based access to admin functions
- Multi-tenant administration support

#### `migrations`

Tracks data migrations and imports:

- Migration from other auth providers
- Audit trail for data movement
- Client and domain mapping

## Database Design Principles

### Multi-Tenancy

Every table (except `tenants` and system tables) includes a `tenant_id` foreign key, ensuring complete data isolation between tenants.

### Audit Trail

Most tables include `created_at` and `updated_at` timestamps for audit purposes and change tracking.

### Soft Relationships

Many relationships use varchar IDs rather than integer foreign keys, providing flexibility for distributed systems and easier data migration.

### JSON Storage

Complex configuration data is often stored as JSON strings in varchar/text fields, allowing for flexible schema evolution without database migrations.

### Composite Keys

Several tables use composite primary keys (typically including `tenant_id`) to enforce tenant isolation at the database level.

This schema supports AuthHero's core mission of providing a flexible, secure, and scalable multi-tenant authentication system while maintaining compatibility with Auth0 APIs.
