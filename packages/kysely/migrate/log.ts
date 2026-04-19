let debugEnabled = false;

export function setMigrationDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

export function migrationLog(...args: unknown[]): void {
  if (debugEnabled) {
    console.log(...args);
  }
}

export function migrationWarn(...args: unknown[]): void {
  console.warn(...args);
}
