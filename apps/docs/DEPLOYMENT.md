# Vercel Deployment

This VitePress site can be deployed to Vercel easily.

## Deployment Steps

1. Connect your repository to Vercel
2. Set the Project Root (Root Directory) to: `apps/docs`
3. Set the Install Command (optional):
   - npm: `npm ci`
   - pnpm: `pnpm install --frozen-lockfile`
4. Set the Build Command:
   - npm: `npm run build`
   - pnpm: `pnpm run build`
5. Set the Output Directory to: `.vitepress/dist`
6. Deploy

## Environment Variables

No environment variables are needed for the basic deployment.

## Custom Domain

You can configure a custom domain in your Vercel project settings.
