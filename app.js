import express from "express";
import path from "path";
import bodyParser from "body-parser";
import sessions from "client-sessions";
import { rateLimit } from 'express-rate-limit';
import dotenv from "dotenv";

const app = express();
const __dirname = path.resolve();
dotenv.config({ path: path.join(__dirname, './.env') });

const LOG = process.env.DEBUG === "true" ? console.log.bind(console) : () => {};

// Define the rate limit options
const limiter = rateLimit({
  windowMs: 60000, // 60 seconds
  max: process.env.RATE_LIMIT_PER_IP_PER_MIN || 20, // Max requests per IP per 60 seconds
  message: 'Rate limit exceeded. Please wait and try again.',
  keyGenerator: (req) => req.ip,
});

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use(sessions({
  cookieName: 'session',
  secret: process.env.COOKIE_SESSION_SECRET,
  duration: (process.env.SESSION_DURATION_MINUTES  || 20) * 60 * 1000, // 10 minutes in milliseconds
  cookie: {
    path: '/redirect-rule',
    ephemeral: true,
    httpOnly: true,
    secure: process.env.SECURE_COOKIE === "true" ?  true : false,
  }
}));

app.set("views", path.join(__dirname, "/views"));
app.set("view engine", "pug");
app.use(express.static(path.join(__dirname, "/public")));

import onfido from "./routes/onfido.js";
const useRateLimiting = process.env.USE_RATE_LIMITING === "true" ? true : false;

if(useRateLimiting) app.use("/redirect-rule", limiter, onfido);
else app.use("/redirect-rule", onfido);

app.use((req, res, next) => {
  next(new Error("Not Found"));
});

const errorMiddleware = (err, req, res, next) => {
  res.status(500).render("error", {
    message: err.message,
    error: app.get("env") === "development" ? err : {},
  });
};

app.use(errorMiddleware);

app.listen(process.env.PORT || 3000, () => {
  LOG(`Listening on ${process.env.PORT}`);
});
