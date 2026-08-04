import { AppConfigError } from "@/src/config/app-config";
import type { Logger } from "@/src/observability/logger";

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly publicMessage: string;

  constructor(options: {
    code: string;
    status: number;
    publicMessage: string;
    cause?: unknown;
  }) {
    super(options.publicMessage, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status;
    this.publicMessage = options.publicMessage;
  }
}

export class ValidationError extends AppError {
  constructor(publicMessage = "La solicitud no es válida.") {
    super({
      code: "VALIDATION_ERROR",
      status: 400,
      publicMessage,
    });
    this.name = "ValidationError";
  }
}

export function toErrorResponse(options: {
  error: unknown;
  correlationId: string;
  logger: Logger;
}): Response {
  const { error, correlationId, logger } = options;
  const controlled = error instanceof AppError;
  const configurationError = error instanceof AppConfigError;
  const status = controlled ? error.status : 500;
  const code = controlled ? error.code : "INTERNAL_ERROR";
  const message = controlled
    ? error.publicMessage
    : "No pudimos completar la solicitud.";

  logger.error("request_failed", {
    result: "failure",
    error_code: configurationError ? "CONFIGURATION_ERROR" : code,
    error_name: error instanceof Error ? error.name : "UnknownError",
    ...(configurationError
      ? { configuration_key: error.variableName }
      : {}),
  });

  return Response.json(
    {
      error: {
        code,
        message,
        correlation_id: correlationId,
      },
    },
    {
      status,
      headers: {
        "cache-control": "no-store",
        "x-correlation-id": correlationId,
      },
    },
  );
}
