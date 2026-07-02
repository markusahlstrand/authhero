# AuthHero Local Server

A local AuthHero authentication server using SQLite for development.

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Run database migrations:

   ```bash
   npm run migrate
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

The server will be available at `http://localhost:3000`.

## Project Structure

```
├── src/
│   ├── index.ts    # Server entry point
│   ├── app.ts      # AuthHero app configuration
│   ├── migrate.ts  # Database migration script
│   └── seed.ts     # Database seeding script
├── db.sqlite       # SQLite database (created after first run)
└── package.json
```

## API Documentation

Visit `http://localhost:3000/docs` to see the Swagger UI documentation.

## Configuration

You can customize the AuthHero configuration in `src/app.ts`. Common options include:

- Custom hooks for login/signup events
- Custom email templates
- Session configuration

## Encryption at rest

Sensitive credential fields (client secrets, connection secrets, email
credentials, TOTP secrets, migration-source secrets) are encrypted at rest.
A random `ENCRYPTION_KEY` was generated into `.env` when this project was
created, and the dev/seed scripts load it via `--env-file=.env`.

> **The key is load-bearing.** If you delete, rotate, or lose `ENCRYPTION_KEY`,
> any values already encrypted with it become unreadable. In local dev you can
> recover by deleting `db.sqlite` and re-running `npm run migrate && npm run seed`.
> In production, treat the key as a long-lived secret and back it up.

For production, set your own `ENCRYPTION_KEY` in the deployment environment
rather than reusing the generated dev key.

Helper scripts:

```bash
npm run gen:key                   # print a fresh base64 key
npm run decrypt -- "enc:v1:..."   # decrypt a stored value using ENCRYPTION_KEY from .env
```

For more information, visit [https://docs.authhero.net](https://docs.authhero.net).
