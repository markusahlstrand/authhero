# react-admin

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
```

See `.env.example` for more details.

**Notes:**

- If `VITE_AUTH0_DOMAIN` is set, it will be automatically added to the domain list
- Users can still add additional domains through the UI

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
