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

For more information, visit [https://authhero.net/docs](https://authhero.net/docs).
