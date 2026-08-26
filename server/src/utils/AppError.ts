export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: unknown;
  readonly extra?: Record<string, unknown>;
  readonly expose: boolean;

  constructor(
    message: string,
    options: {
      statusCode?: number;
      code?: string;
      details?: unknown;
      extra?: Record<string, unknown>;
      expose?: boolean;
      cause?: unknown;
    } = {},
  ) {
    super(message, options.cause ? { cause: options.cause } : undefined);
    this.name = "AppError";
    this.statusCode = options.statusCode ?? 500;
    this.code = options.code ?? "INTERNAL_ERROR";
    this.expose = options.expose ?? this.statusCode < 500;
    if (options.details !== undefined) {
      this.details = options.details;
    }
    if (options.extra !== undefined) {
      this.extra = options.extra;
    }
  }
}
