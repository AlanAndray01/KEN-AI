import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { API_PREFIX } from "@aether/shared";
import { corsOptions } from "./config/cors.js";
import { isProduction } from "./config/env.js";
import { logger } from "./config/logger.js";
import { mountClientSpa } from "./middleware/clientSpa.js";
import { errorHandler } from "./middleware/errorHandler.js";
import { notFoundHandler } from "./middleware/notFound.js";
import { requestId } from "./middleware/requestId.js";
import { sanitizeInput } from "./middleware/sanitizeInput.js";
import { apiRouter } from "./routes/index.js";

export const app = express();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
    hsts: isProduction ? { maxAge: 15_552_000, includeSubDomains: true } : false,
  }),
);
app.use(cors(corsOptions));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));
app.use(cookieParser());
app.use(requestId);
app.use(sanitizeInput);
app.use(
  pinoHttp({
    logger,
    genReqId: (req) => {
      const id = "requestId" in req && typeof req.requestId === "string" ? req.requestId : "";
      return id;
    },
    customProps: (req) => {
      const id = "requestId" in req && typeof req.requestId === "string" ? req.requestId : undefined;
      return id ? { requestId: id } : {};
    },
    serializers: {
      req(req) {
        const pathOnly = (req.url ?? "").split("?")[0];
        return {
          method: req.method,
          url: pathOnly,
        };
      },
    },
  }),
);

app.use(API_PREFIX, apiRouter);
mountClientSpa(app);
app.use(notFoundHandler);
app.use(errorHandler);
