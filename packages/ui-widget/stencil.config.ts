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
  ],
  testing: {
    browserHeadless: 'shell',
  },
};
