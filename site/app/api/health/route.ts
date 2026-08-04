import { getAppConfig } from "@/src/config/app-config";
import { toErrorResponse } from "@/src/errors/app-error";
import { resolveCorrelationId } from "@/src/observability/correlation";
import { createLogger } from "@/src/observability/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const correlationId = resolveCorrelationId(request);

  try {
    const config = getAppConfig();
    const logger = createLogger({
      environment: config.environment,
      service: config.serviceName,
      correlationId,
      minimumLevel: config.logLevel,
    });

    logger.info("health_check", { result: "success" });

    return Response.json(
      {
        status: "ok",
        application: config.applicationName,
        environment: config.environment,
        version: config.version,
        ...(config.commitSha ? { commit: config.commitSha } : {}),
        timestamp: new Date().toISOString(),
        uptime_seconds: Math.round(process.uptime()),
      },
      {
        status: 200,
        headers: {
          "cache-control": "no-store",
          "x-correlation-id": correlationId,
        },
      },
    );
  } catch (error) {
    const logger = createLogger({
      environment: "unknown",
      service: "nexi-web",
      correlationId,
      minimumLevel: "info",
    });
    return toErrorResponse({ error, correlationId, logger });
  }
}
