import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "AuthHero",
  description: "Comprehensive authentication solution",
  head: [
    ['link', { rel: 'icon', href: '/favicon.ico' }],
    ['meta', { name: 'theme-color', content: '#3c82f6' }],
  ],
  lastUpdated: true,
  cleanUrls: true,
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'API Reference', link: '/api/' }
    ],

    sidebar: [
      {
        text: 'Introduction',
        items: [
          { text: 'What is AuthHero?', link: '/' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Architecture', link: '/architecture' },
          { text: 'Concepts', link: '/concepts' }
        ]
      },
      {
        text: 'Applications',
        items: [
          { text: 'React Admin', link: '/apps/react-admin/' },
          { text: 'Auth0 Proxy', link: '/apps/auth0-proxy/' },
          { text: 'Demo App', link: '/apps/demo/' }
        ]
      },
      {
        text: 'Packages',
        items: [
          { text: 'Core Library', link: '/packages/authhero/' },
          { text: 'Adapters', link: '/packages/adapters/' },
          { text: 'Create AuthHero', link: '/packages/create-authhero/' }
        ]
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Overview', link: '/api/overview' },
          { text: 'Endpoints', link: '/api/endpoints' },
          { text: 'Error Codes', link: '/api/error-codes' },
          { text: 'Forms', link: '/api/forms' }
        ]
      },
      {
        text: 'Guides',
        items: [
          { text: 'Authentication Flow', link: '/guides/authentication-flow' },
          { text: 'Custom Domain Setup', link: '/guides/custom-domain-setup' },
          { text: 'Database Integration', link: '/guides/database-integration' },
          { text: 'Troubleshooting', link: '/guides/troubleshooting' }
        ]
      },
      {
        text: 'Auth0 Comparison',
        items: [
          { text: 'Hooks', link: '/auth0-comparison/hooks' },
          { text: 'Multi-Tenant', link: '/auth0-comparison/multi-tenant' }
        ]
      },
      {
        text: 'Contributing',
        items: [
          { text: 'Development Setup', link: '/contributing/development-setup' },
          { text: 'Code Style', link: '/contributing/code-style' },
          { text: 'Testing', link: '/contributing/testing' },
          { text: 'Release Process', link: '/contributing/release-process' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/markusahlstrand/authhero' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Released under the ISC License.',
      copyright: 'Copyright © 2025 AuthHero'
    }
  }
})
