export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId?: string;
  readonly emailSent?: boolean;
  readonly requiresVerification?: boolean;
  readonly email?: string;

  constructor(
    message: string,
    options: {
      status: number;
      code: string;
      requestId?: string;
      emailSent?: boolean;
      requiresVerification?: boolean;
      email?: string;
    },
  ) {
    super(message);
    this.name = "ApiError";
    this.status = options.status;
    this.code = options.code;
    if (options.requestId !== undefined) {
      this.requestId = options.requestId;
    }
    if (options.emailSent !== undefined) {
      this.emailSent = options.emailSent;
    }
    if (options.requiresVerification !== undefined) {
      this.requiresVerification = options.requiresVerification;
    }
    if (options.email !== undefined) {
      this.email = options.email;
    }
  }
}
