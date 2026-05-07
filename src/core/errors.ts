export class IssuerError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'IssuerError';
  }
}

export class TaskParseError extends IssuerError {
  constructor(message: string, public readonly filePath?: string, cause?: unknown) {
    super(filePath ? `${filePath}: ${message}` : message, cause);
    this.name = 'TaskParseError';
  }
}

export class ConfigError extends IssuerError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ConfigError';
  }
}

export class AdapterError extends IssuerError {
  constructor(message: string, public readonly adapter: string, cause?: unknown) {
    super(`[${adapter}] ${message}`, cause);
    this.name = 'AdapterError';
  }
}
