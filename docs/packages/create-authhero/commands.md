# Create AuthHero CLI Commands

## Base Command

```bash
pnpm create authhero [project-name] [options]
```

## Options

- `--template <template>` - Specify the template to use (default: "basic")
- `--adapter <adapter>` - Specify the database adapter to use (options: "kysely", "drizzle", "cloudflare")
- `--skip-install` - Skip installing dependencies
- `--help` - Show help information
- `--version` - Show version information

## Examples

Create a basic project:

```bash
pnpm create authhero my-auth-app
```

Create a project with a specific template and adapter:

```bash
pnpm create authhero my-auth-app --template fullstack --adapter kysely
```

Create a project without installing dependencies:

```bash
pnpm create authhero my-auth-app --skip-install
```

## Templates

[Template descriptions will be listed here]

## Environment Variables

You can configure certain aspects of the CLI using environment variables:

[Environment variable descriptions will be listed here]