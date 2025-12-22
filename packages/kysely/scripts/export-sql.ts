#!/usr/bin/env npx tsx
/**
 * Export Kysely migrations as raw SQL for D1
 *
 * This script creates a "fake" Kysely instance that captures SQL
 * instead of executing it, then runs all migrations through it.
 *
 * Usage:
 *   npx tsx scripts/export-sql.ts              # Output combined SQL to stdout
 *   npx tsx scripts/export-sql.ts --split      # Create individual migration files in ./sql-migrations/
 *   npx tsx scripts/export-sql.ts --d1         # Create D1-compatible migrations folder
 *   npx tsx scripts/export-sql.ts --squash     # Create a single squashed migration (for new projects)
 */

import { Kysely, SqliteDialect } from "kysely";
import type { CompiledQuery, DatabaseConnection, Driver, QueryResult } from "kysely";
import migrations from "../migrate/migrations";
import fs from "fs";
import path from "path";

// Collected SQL statements
const sqlStatements: string[] = [];

// A fake driver that captures SQL instead of executing it
class SqlCaptureDriver implements Driver {
  async init(): Promise<void> {}
  async destroy(): Promise<void> {}
  async acquireConnection(): Promise<DatabaseConnection> {
    return new SqlCaptureConnection();
  }
  async beginTransaction(): Promise<void> {}
  async commitTransaction(): Promise<void> {}
  async rollbackTransaction(): Promise<void> {}
  async releaseConnection(): Promise<void> {}
}

// Patterns to filter out - these are runtime detection queries or MySQL-only syntax
const SKIP_PATTERNS = [
  /^SELECT VERSION\(\)/i,
  /INFORMATION_SCHEMA/i,
  /^SELECT.*FROM.*sqlite_master/i,
  /^PRAGMA/i,
  /ADD CONSTRAINT/i,                   // SQLite doesn't support ADD CONSTRAINT via ALTER
  /DROP FOREIGN KEY/i,                 // SQLite doesn't support DROP FOREIGN KEY
  /DROP CONSTRAINT/i,                  // SQLite doesn't support DROP CONSTRAINT
  /CREATE TABLE.*_backup/i,            // Skip backup table creation (MySQL migration pattern)
  /_backup/i,                          // Skip any statement involving backup tables
  /rename to.*_backup/i,               // Skip rename to backup
  /^DROP TABLE/i,                      // Skip DROP TABLE (not needed for fresh db)
  /^drop table/i,                      // Skip drop table (lowercase variant)
];

function shouldSkipStatement(sql: string): boolean {
  return SKIP_PATTERNS.some(pattern => pattern.test(sql));
}

class SqlCaptureConnection implements DatabaseConnection {
  async executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    // Format the SQL with parameters substituted
    let sqlStr = compiledQuery.sql;

    // Replace ? placeholders with actual values
    compiledQuery.parameters.forEach((param) => {
      const value =
        param === null
          ? "NULL"
          : typeof param === "string"
            ? `'${param.replace(/'/g, "''")}'`
            : typeof param === "boolean"
              ? param
                ? "1"
                : "0"
              : String(param);

      // Replace first ? with the value
      sqlStr = sqlStr.replace("?", value);
    });

    // Skip diagnostic/detection queries that shouldn't be in migrations
    if (!shouldSkipStatement(sqlStr)) {
      sqlStatements.push(sqlStr);
    }

    return {
      rows: [],
      numAffectedRows: BigInt(0),
      insertId: undefined,
    };
  }

  async *streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    // Not needed for migrations
  }
}

// Create a Kysely instance with our capturing driver
const db = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteDialect({ database: {} as any }).createAdapter(),
    createDriver: () => new SqlCaptureDriver(),
    createIntrospector: (db) => new SqliteDialect({ database: {} as any }).createIntrospector(db),
    createQueryCompiler: () => new SqliteDialect({ database: {} as any }).createQueryCompiler(),
  },
});

interface MigrationResult {
  name: string;
  sql: string[];
  skipped: boolean;
}

async function collectMigrations(): Promise<MigrationResult[]> {
  const results: MigrationResult[] = [];

  // Sort migrations by name (which includes timestamp)
  const sortedMigrations = Object.entries(migrations).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  for (const [name, migration] of sortedMigrations) {
    sqlStatements.length = 0; // Clear previous statements

    try {
      await migration.up(db);
      results.push({
        name,
        sql: [...sqlStatements],
        skipped: false,
      });
    } catch {
      results.push({
        name,
        sql: [],
        skipped: true,
      });
    }
  }

  return results;
}

async function outputCombined(results: MigrationResult[]) {
  console.log("-- AuthHero Database Schema");
  console.log("-- Generated from Kysely migrations");
  console.log(`-- Generated at: ${new Date().toISOString()}`);
  console.log("-- This file is auto-generated. Do not edit manually.");
  console.log("");

  for (const result of results) {
    console.log(`-- Migration: ${result.name}`);
    console.log("-- " + "=".repeat(70));

    if (result.skipped) {
      console.log("-- SKIPPED: Migration uses dynamic queries");
    } else {
      for (const stmt of result.sql) {
        console.log(stmt + ";");
      }
    }
    console.log("");
  }
}

async function outputD1Migrations(results: MigrationResult[]) {
  const outDir = path.join(process.cwd(), "migrations");
  
  // Create migrations directory
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  let migrationIndex = 0;
  
  for (const result of results) {
    if (result.skipped || result.sql.length === 0) {
      continue;
    }

    // D1 migration format: 0001_name.sql
    const paddedIndex = String(migrationIndex).padStart(4, "0");
    const safeName = result.name.replace(/[^a-zA-Z0-9_]/g, "_");
    const fileName = `${paddedIndex}_${safeName}.sql`;
    const filePath = path.join(outDir, fileName);

    const content = [
      `-- Migration: ${result.name}`,
      `-- Generated from Kysely migration`,
      "",
      ...result.sql.map(s => s + ";"),
      "",
    ].join("\n");

    fs.writeFileSync(filePath, content);
    console.log(`Created: ${fileName}`);
    migrationIndex++;
  }

  console.log(`\nGenerated ${migrationIndex} migration files in ${outDir}`);
}

async function outputSingleFile(results: MigrationResult[]) {
  const outDir = path.join(process.cwd(), "sql-migrations");
  
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Combine all non-skipped migrations into one file
  const allSql: string[] = [
    "-- AuthHero Complete Schema",
    "-- Generated from Kysely migrations",
    `-- Generated at: ${new Date().toISOString()}`,
    "",
  ];

  for (const result of results) {
    if (!result.skipped && result.sql.length > 0) {
      allSql.push(`-- ${result.name}`);
      allSql.push(...result.sql.map(s => s + ";"));
      allSql.push("");
    }
  }

  const filePath = path.join(outDir, "0000_init.sql");
  fs.writeFileSync(filePath, allSql.join("\n"));
  console.log(`Created: ${filePath}`);
}

async function outputSquashed(results: MigrationResult[], outputDir?: string) {
  const outDir = outputDir || path.join(process.cwd(), "migrations");
  
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // Collect all SQL statements
  const allStatements: string[] = [];
  for (const result of results) {
    if (!result.skipped && result.sql.length > 0) {
      allStatements.push(...result.sql);
    }
  }

  // For fresh databases, we need to:
  // 1. Keep only the LAST CREATE TABLE for each table name
  // 2. Merge ALTER TABLE ADD COLUMN into the CREATE TABLE
  // 3. Keep CREATE INDEX statements
  // 4. Skip intermediate table versions (like sessions_2, refresh_tokens_2)

  // Track CREATE TABLE statements by table name - keep last occurrence
  const createTableMap = new Map<string, string>();
  const createIndexStatements: string[] = [];
  // Track columns to add per table
  const addColumnMap = new Map<string, string[]>();

  for (const stmt of allStatements) {
    const createTableMatch = stmt.match(/^create table "([^"]+)"/i);
    if (createTableMatch) {
      const tableName = createTableMatch[1];
      // Skip intermediate migration tables (ending with _2, _backup, etc.)
      if (!tableName.match(/_\d+$/) && !tableName.includes('_backup')) {
        createTableMap.set(tableName, stmt);
        // Reset added columns when we see a new CREATE TABLE for this table
        addColumnMap.delete(tableName);
      }
      continue;
    }

    const createIndexMatch = stmt.match(/^create index/i);
    if (createIndexMatch) {
      // Skip duplicate indices (keep first occurrence of each)
      const indexName = stmt.match(/create index "([^"]+)"/i)?.[1];
      if (indexName && !createIndexStatements.some(s => s.includes(`"${indexName}"`))) {
        createIndexStatements.push(stmt);
      }
      continue;
    }

    // Track ALTER TABLE ADD COLUMN to merge into CREATE TABLE
    const addColumnMatch = stmt.match(/^alter table "([^"]+)" add column (.+)$/i);
    if (addColumnMatch) {
      const tableName = addColumnMatch[1];
      const columnDef = addColumnMatch[2];
      if (!addColumnMap.has(tableName)) {
        addColumnMap.set(tableName, []);
      }
      addColumnMap.get(tableName)!.push(columnDef);
      continue;
    }
  }

  // Helper function to merge ADD COLUMN into CREATE TABLE
  function mergeColumnsIntoCreateTable(createStmt: string, columnsToAdd: string[]): string {
    // Find the closing paren of the CREATE TABLE
    // CREATE TABLE "x" (...columns...) -> need to insert before the last )
    const lastParenIndex = createStmt.lastIndexOf(')');
    if (lastParenIndex === -1) return createStmt;
    
    // Build the new column definitions
    const newColumns = columnsToAdd.join(', ');
    
    // Insert the new columns before the closing paren
    return createStmt.slice(0, lastParenIndex) + ', ' + newColumns + createStmt.slice(lastParenIndex);
  }

  // Merge ADD COLUMN statements into CREATE TABLE statements
  for (const [tableName, columns] of addColumnMap) {
    const createStmt = createTableMap.get(tableName);
    if (createStmt) {
      // Filter out columns that already exist in the CREATE TABLE
      const filteredColumns = columns.filter(col => {
        const colNameMatch = col.match(/^"([^"]+)"/);
        if (colNameMatch) {
          const colName = colNameMatch[1];
          // Check if column already exists in CREATE TABLE
          return !createStmt.includes(`"${colName}"`);
        }
        return true;
      });
      
      if (filteredColumns.length > 0) {
        createTableMap.set(tableName, mergeColumnsIntoCreateTable(createStmt, filteredColumns));
      }
    }
  }

  // Define table creation order based on foreign key dependencies
  const tableOrder = [
    'tenants',
    'members',
    'applications',
    'connections',
    'migrations',
    'domains',
    'users',
    'passwords',
    'keys',
    'logs',
    'sessions',
    'refresh_tokens',
    'tickets',
    'otps',
    'codes',
    'logins',
    'forms',
    'branding',
    'themes',
    'email_providers',
    'hooks',
    'prompt_settings',
  ];

  const orderedSql: string[] = [
    "-- AuthHero Database Schema",
    "-- Squashed migration for new projects",
    `-- Generated at: ${new Date().toISOString()}`,
    "-- This file creates all tables needed for AuthHero",
    "",
  ];

  // Add CREATE TABLE in order
  for (const tableName of tableOrder) {
    const createStmt = createTableMap.get(tableName);
    if (createStmt) {
      orderedSql.push(createStmt + ";");
    }
  }

  // Add any remaining tables not in the predefined order
  for (const [tableName, createStmt] of createTableMap) {
    if (!tableOrder.includes(tableName)) {
      orderedSql.push(createStmt + ";");
    }
  }

  // Add CREATE INDEX statements
  if (createIndexStatements.length > 0) {
    orderedSql.push("");
    orderedSql.push("-- Indexes");
    for (const stmt of createIndexStatements) {
      orderedSql.push(stmt + ";");
    }
  }

  const filePath = path.join(outDir, "0000_init.sql");
  fs.writeFileSync(filePath, orderedSql.join("\n"));
  console.log(`Created: ${filePath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const results = await collectMigrations();

  // Check for --output flag
  const outputIndex = args.indexOf("--output");
  const outputDir = outputIndex !== -1 ? args[outputIndex + 1] : undefined;

  if (args.includes("--d1")) {
    await outputD1Migrations(results);
  } else if (args.includes("--squash")) {
    await outputSquashed(results, outputDir);
  } else if (args.includes("--split")) {
    await outputSingleFile(results);
  } else {
    await outputCombined(results);
  }
}

main().catch(console.error);
