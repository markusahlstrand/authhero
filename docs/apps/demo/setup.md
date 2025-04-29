# Demo App Setup

## Prerequisites

- Node.js (version 16 or higher)
- npm, yarn, or pnpm package manager

## Installation Steps

1. Clone the AuthHero repository or download the source code
2. Navigate to the demo directory

```bash
cd apps/demo
```

3. Install dependencies

```bash
pnpm install
```

## Configuration

The demo app uses SQLite as its database, which requires minimal configuration. The database file (`db.sqlite`) is included in the repository.

You may configure the application through environment variables. Create a `.env` file in the demo directory with the following variables:

```
# Configuration variables will be listed here
```

## Running the Demo

Start the demo application:

```bash
pnpm dev
```

The server will start by default on `http://localhost:8787`.