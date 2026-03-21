export class EtoroApiError extends Error {
  readonly statusCode: number;
  readonly errorCode: string | undefined;
  readonly body: unknown;

  constructor(
    message: string,
    statusCode: number,
    body?: unknown,
    errorCode?: string,
  ) {
    super(message);
    this.name = "EtoroApiError";
    this.statusCode = statusCode;
    this.body = body;
    this.errorCode = errorCode;
  }
}
