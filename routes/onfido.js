import express from "express"
import url from "url"
import path from "path"
import { Onfido, Region } from "@onfido/api"
import jwt from "jsonwebtoken"

import dotenv from "dotenv"
const __dirname = path.resolve()
dotenv.config({ path: path.join(__dirname, './.env') })

const onfidoClient = new Onfido({
  apiToken: process.env.ONFIDO_API_TOKEN,
  region:
    process.env.ONFIDO_REGION === "EU"
      ? Region.EU
      : process.env.ONFIDO_REGION === "US"
        ? Region.US
        : process.env.ONFIDO_REGION === "CA"
          ? Region.CA
          : Region.EU
})
const router = express.Router()
const onfidoCompleteSubStatuses = ["approved", "declined", "review", "abandoned", "error"];
const onfidoSubStatuses = ["processing", "awaiting_input", "approved", "declined", "review", "abandoned", "error"];
const LOG = process.env.DEBUG === "true" ? console.log.bind(console) : function () { };
const LOGERR = console.log;


// Check Session Middleware
const checkSession = (req, res, next) => {
  if (!req.session || !req.session.auth0State) {
    return res.status(401).json({ error: 'Session expired or not authenticated' });
  }

  // Session exists, continue to the next middleware
  next();
};

router.get("/path/:sessionToken", async (req, res) => {
  LOG(process.env);
  LOG(req.params)
  const query = url.parse(req.url, true).query
  const sessionToken = req.params.sessionToken
  const auth0State = String(query.state)
  req.session.auth0State = auth0State

  // TO DO - make token expiry short!, consider adding a JTI for replay prevention
  try {

    const payload = jwt.verify(sessionToken, process.env.APP_SECRET, {
      ignoreExpiration: false,
      audience: process.env.SELF_AUD,
      issuer: `${process.env.ISSUER_BASE_URL}/`,
      algorithms: ["HS256"],
    });

    if (!payload.exp) {
      res.status(403).render("error", {
        message: "Invalid attempt!",
        url: process.env.OKTA_URL
      })
    }

    req.session.auth0Payload = payload

    const { applicant } = payload

    // create or use a workflow run
    req.session.applicant = applicant;
    req.session.workflowRunId = (await onfidoClient.workflowRun.create({ applicantId: applicant, workflowId: process.env.WORKFLOW_ID })).id;
    //create a SDk token and send run id and token to UI
    return onfidoClient.sdkToken
      .generate({
        applicantId: applicant,
        referrer: process.env.ONFIDO_REFERRER_PATTERN
      })
      .then(sdkToken => {
        res.status(200).render("onfido", {
          sdkToken, 
          workflowRunId: req.session.workflowRunId,
          timesRun: process.env.IDV_CHECK_TIMES_RUN || 18, 
          idvCheckInterval: process.env.IDV_CHECK_INTERVAL || 15000
        })
      })
      .catch(error => {
        LOGERR(error)
        res.status(500).render("error", {
          message: error,
          url: process.env.OKTA_URL
        })
      })
  }
  catch (e) {
    LOGERR(e)
    res.status(401).render("error", {
      message: "Invalid access!",
      url: process.env.OKTA_URL
    })
  }
})

router.post("/", checkSession, (req, res) => {
  const { auth0State, auth0Payload, workflowRunId } = req.session
  console.log(req.body);
  const complete = req.body.onfidoComplete;
  LOG(complete);
    return onfidoClient.workflowRun.find(workflowRunId)
      .then(response => {
        LOG(response);
        const sessionToken = {
          workflowRunStatus: onfidoCompleteSubStatuses.indexOf(response.status) >= 0 ? "complete" : "processing",
          workflowRunSubStatus: response.status,
          applicant: response.applicantId,
          ...auth0Payload,
          state: auth0State
        }
        LOG(sessionToken)
        sessionToken.exp = Math.floor(Date.now() / 1000) + 60;
        const signed = jwt.sign(sessionToken, process.env.APP_SECRET)

        const continueUrl = `${auth0Payload.iss}continue/reset-password?state=${auth0State}&session_token=${signed}`
        res.redirect(continueUrl)
      })
      .catch(error => {
        res.status(500).render("error", {
          message: error,
          url: process.env.OKTA_URL
        })
      })
  
})

router.get("/check", checkSession, (req, res) => {
      LOG(req.session);
  return onfidoClient.workflowRun.find(req.session.workflowRunId)
    .then(response => {
      LOG(response);
      res.status(200).json({ status: "processing" })

    })
    .catch(error => {
      res.status(500).json({
        message: error,
        url: process.env.OKTA_URL
      })
    })
})

router.get("/status", checkSession, (req, res) => {
  LOG(req.session);
  const { workflowRunId } = req.session
  return onfidoClient.workflowRun.find(workflowRunId)
    .then(response => {
      LOG(response);
      if (["processing", "awaiting_input"].indexOf(response.status) >= 0) res.status(200).json({ status: "processing" })
      else res.status(200).json({ status: "complete" })
    })
    .catch(error => {
      LOGERR(error);
      res.status(500).json({
        message: error,
        url: process.env.OKTA_URL
      })
    })
})

export default router
