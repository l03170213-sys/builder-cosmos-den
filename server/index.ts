import "dotenv/config";
import express from "express";
import cors from "cors";
import { handleDemo } from "./routes/demo";
import { getResortAverages } from "./routes/sheets";
import { getResortSummary } from "./routes/summary";
import { getResortRespondents } from "./routes/respondents";
import { getResortRespondentDetails } from "./routes/respondent";

export function createServer() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Normalize Netlify function invocation path prefix: /.netlify/functions/api
  // When Netlify rewrites /api/* to /.netlify/functions/api/:splat the function will receive
  // a path starting with '/.netlify/functions/api'. Strip that prefix so existing
  // express routes defined as /api/... still match.
  app.use((req, _res, next) => {
    try {
      if (
        typeof req.url === "string" &&
        req.url.startsWith("/.netlify/functions/api")
      ) {
        req.url = req.url.replace("/.netlify/functions/api", "/api");
      }
    } catch (e) {
      // ignore
    }
    next();
  });

  // Example API routes
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  app.get("/api/demo", handleDemo);

  // Google Sheets-powered data for resorts (dynamic)
  app.get("/api/resort/:resort/averages", getResortAverages);
  app.get("/api/resort/:resort/summary", getResortSummary);
  app.get("/api/resort/:resort/respondents", getResortRespondents);
  app.get("/api/resort/:resort/respondent", getResortRespondentDetails);

  return app;
}
