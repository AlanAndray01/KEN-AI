import dns from "node:dns";
import { APP_NAME } from "@Ken/shared";
import { env, isProduction } from "./config/env.js";
import { installProviderHttpKeepAlive, warmupGeminiConnection } from "./config/http.js";
import { logger } from "./config/logger.js";
import { captureError } from "./config/sentry.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { app } from "./app.js";
import { bootstrapProviders } from "./services/ai/bootstrap.js";
import { GENERATION_TIMEOUT_MS } from "./services/chat/generationRegistry.js";
import { toSafeError } from "./utils/redact.js";

installProviderHttpKeepAlive();

// Nothing in the request pipeline reaches these — errorHandler.ts covers
// every error a route or middleware throws. These are the two ways Node
// itself signals that something escaped that pipeline entirely (a rejected
// promise nobody awaited, a throw outside any try/catch); logging and
// reporting is all that is safe to do at that point.
process.on("uncaughtException", (error) => {
  logger.fatal({ err: toSafeError(error) }, "Uncaught exception");
  captureError(error, { source: "uncaughtException" });
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ err: toSafeError(reason) }, "Unhandled promise rejection");
  captureError(reason, { source: "unhandledRejection" });
});

/**
 * Some local networks (notably Windows machines behind an ISP resolver that
 * drops SRV records) cannot resolve a MongoDB Atlas `mongodb+srv://` URI. A
 * public resolver fixes that during development.
 *
 * It must NOT apply in production: hosts like Render provide their own resolver
 * with private networking and egress rules, and overriding it can break Atlas
 * lookups or add latency on every connection.
 */
if (!isProduction) {
  dns.setServers(["8.8.8.8", "1.1.1.1"]);
}


async function start(): Promise<void> {
  try {
    await connectDatabase();
    await bootstrapProviders();
  } catch (error) {
    logger.fatal(
      { err: toSafeError(error) },
      "Failed to connect to MongoDB. For Atlas, add this machine's current IP in Network Access and run npm run dev again.",
    );
    process.exit(1);
  }

  const server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        env: env.NODE_ENV,
        clientUrl: env.CLIENT_URL,
        database: "connected",
      },
      `${APP_NAME} API listening`,
    );
    void warmupGeminiConnection(env.GEMINI_API_KEY);
  });

  // Node defaults requestTimeout to 300s, which is shorter than a long chat
  // generation is now allowed to run (GENERATION_TIMEOUT_MS). Left alone it
  // destroys the socket mid-stream and the reply just stops, with no error for
  // the client to report. Kept above the generation ceiling so the generation's
  // own timeout is always the one that fires, and that path returns a real
  // GENERATION_TIMEOUT to the UI.
  server.requestTimeout = GENERATION_TIMEOUT_MS + 60_000;
  // Only bounds the wait for headers, so it stays short.
  server.headersTimeout = 60_000;
  // Must exceed a proxy's idle keep-alive or the socket is reused as it closes.
  server.keepAliveTimeout = 75_000;

  const shutdown = (signal: string): void => {
    logger.info({ signal }, "Shutting down");
    server.close(() => {
      void disconnectDatabase()
        .catch((error: unknown) => {
          logger.error({ err: toSafeError(error) }, "Error while closing MongoDB");
        })
        .finally(() => {
          process.exit(0);
        });
    });
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

void start();
