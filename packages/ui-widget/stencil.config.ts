import { Config } from '@stencil/core';

export const config: Config = {
  namespace: 'authhero-widget',
  outputTargets: [
    {
      type: 'dist',
      esmLoaderPath: '../loader',
    },
    {
      // CRITICAL: Allows Hono to SSR the widget
      type: 'dist-hydrate-script',
      dir: './hydrate',
    },
    {
      type: 'dist-custom-elements',
      customElementsExportBehavior: 'auto-define-custom-elements',
      externalRuntime: false,
    },
    {
      type: 'www',
      serviceWorker: null, // Disable service worker
      copy: [
        { src: 'demo.html', dest: 'demo.html' },
        { src: '../test/fixtures', dest: 'test/fixtures' },
      ],
    },
  ],
  testing: {
    browserHeadless: 'shell',
  },
};
