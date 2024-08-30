# Auth0 Proxy

This is small proxy server that exposes the auth0 management api on a local port and is only intended for testing purposes.

## Usage

Add the auth0 domain and the api key in the env file. Note that the env variables truncate after 4096 characters so if the token is to long you take the last part and add it to the API_KEY2 environment varible.

Run the following command to start the proxy:

```bash
pnpm proxy dev
```

The proxy will be available on `http://localhost:3000`.

You can now use the Authhero manage portal to navigate the Auth0 management api.

It is planned to deploy a management dashboard pointint to localhost:3000 on this domain: https://local.authhe.ro
