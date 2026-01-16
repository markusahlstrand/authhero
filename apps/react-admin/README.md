# react-admin

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fauthhero%2Fauthhero&env=VITE_AUTH0_DOMAIN,VITE_AUTH0_CLIENT_ID,VITE_AUTH0_API_URL,VITE_SINGLE_DOMAIN_MODE&envDescription=Configure%20your%20AuthHero%20connection.%20Set%20VITE_SINGLE_DOMAIN_MODE%20to%20%22true%22%20to%20skip%20domain%20selector.&envLink=https%3A%2F%2Fgithub.com%2Fauthhero%2Fauthhero%2Fblob%2Fmain%2Fapps%2Freact-admin%2FREADME.md&project-name=authhero-admin&repository-name=authhero-admin&root-directory=apps%2Freact-admin&build-command=pnpm%20run%20build&output-directory=dist&install-command=corepack%20enable%20%26%26%20corepack%20prepare%20pnpm%4010.11.0%20--activate%20%26%26%20pnpm%20install%20--no-frozen-lockfile)
[![Deploy to Cloudflare Pages](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/authhero/authhero)

> **Cloudflare Pages Setup:** Select "Pages" during setup, set root directory to `apps/react-admin`, build command to `pnpm run build`, and output directory to `dist`. Add environment variables `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_API_URL`, and `VITE_SINGLE_DOMAIN_MODE`.

## Installation

Install the application dependencies by running:

```sh
npm install
# or
yarn install
```

## Configuration

### Environment Variables

You can configure the default domain connection using environment variables. Create a `.env` file in the `apps/react-admin` directory:

```bash
# Production
VITE_AUTH0_DOMAIN=login.sesamy.com
VITE_AUTH0_CLIENT_ID=auth-admin
VITE_AUTH0_API_URL=https://auth2.sesamy.com

# Or for local development
VITE_AUTH0_DOMAIN=localhost:3000
VITE_AUTH0_CLIENT_ID=auth-admin
VITE_AUTH0_API_URL=https://localhost:3000

# Optional: Skip domain selector and use configured domain directly
VITE_SINGLE_DOMAIN_MODE=true
```

See `.env.example` for more details.

**Notes:**

- If `VITE_AUTH0_DOMAIN` is set, it will be automatically added to the domain list
- Users can still add additional domains through the UI (unless `VITE_SINGLE_DOMAIN_MODE=true`)
- Set `VITE_SINGLE_DOMAIN_MODE=true` to skip the domain selector entirely

## Development

Start the application in development mode by running:

```sh
npm run dev
# or
yarn dev
```

## Production

Build the application in production mode by running:

```sh
npm run build
# or
yarn build
```

## Deployment

The React Admin application can be deployed to Vercel. See the [Vercel deployment guide](../docs/deployment-targets/vercel.md) for detailed instructions.

**Important:** When deploying to Vercel, you must set the environment variable `ENABLE_EXPERIMENTAL_COREPACK=1` to avoid build errors with pnpm.

## DataProvider

The included data provider use [FakeREST](https://github.com/marmelab/fakerest) to simulate a backend.
You'll find a `data.json` file in the `src` directory that includes some fake data for testing purposes.

It includes two resources, posts and comments.
Posts have the following properties: `id`, `title` and `content`.
Comments have the following properties: `id`, `post_id` and `content`.

## Tests

You can run the included tests with the following command:

```sh
npm run test
# or
yarn run test
```
