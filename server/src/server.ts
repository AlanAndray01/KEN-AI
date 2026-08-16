import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { app } from "./app.js";
import { bootstrapProviders } from "./services/ai/bootstrap.js";
import { toSafeError } from "./utils/redact.js";
import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);




async function start(): Promise<void> {
  try {
    await connectDatabase();
    await bootstrapProviders();
  } catch (error) {
    logger.fatal({ err: toSafeError(error) }, "Failed to connect to MongoDB");
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
      "Aether API listening",
    );
  });

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
