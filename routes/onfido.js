import express from "express"
import  url from "url"
import path from "path"
import { Onfido, Region } from "@onfido/api"
import jwt from "jsonwebtoken"

import dotenv from "dotenv"
const __dirname = path.resolve()
console.log(__dirname);
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

router.get("/path/:sessionToken", async (req, res) => {
  console.log(req.params)
  const query = url.parse(req.url, true).query
  const sessionToken = req.params.sessionToken
  const auth0State = String(query.state)
  req.session.auth0State = auth0State

  // const payload = jwt.verify(sessionToken, process.env.APP_SECRET, {
  //   ignoreExpiration: false,
  //   audience :'',
  //   issuer :'',
  //   algorithms :["HS256"]
  // })

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
      message: "Invalid Token! Please go here to re-initiate your account recovery process!",
      url: process.env.OKTA_URL
    })
  }

  req.session.auth0Payload = payload

  const { applicant } = payload
  // create a workflow run
  var workflowRun = await onfidoClient.workflowRun.create( {applicantId: applicant, workflowId : process.env.WORKFLOW_ID} );

  console.log(workflowRun);
  
  req.session.applicant = applicant;
  req.session.workflowRunId = workflowRun.id;
  //create a SDk token and send run id and token to UI
  return onfidoClient.sdkToken
    .generate({
      applicantId: applicant,
      referrer: process.env.ONFIDO_REFERRER_PATTERN
    })
    .then(sdkToken => {
      res.status(200).render("onfido", {
        sdkToken,workflowRunId : workflowRun.id
      })
    })
    .catch(error => {
      console.log(error)
      res.status(500).render("error", {
        message: error,
        url: process.env.OKTA_URL
      })
    })
  }
  catch(e){
    console.log(e)
      res.status(401).render("error", {
        message: "Invalid access!",
        url: process.env.OKTA_URL
      })
  }
})


router.post("/", (req, res) => {
  const { auth0State, auth0Payload, workflowRunId } = req.session
  const complete = req.body.onfidoComplete
  if (complete) {
    //eslint-disable-next-line
    //@ts-ignore
    return onfidoClient.workflowRun.find(workflowRunId)
      .then(response => {
        console.log(response);
        const sessionToken = {
          workflowRunId,
          workflowRunStatus: ["approved", "declined", "review", "abandoned","error"].indexOf(response.status) >=0 ? "complete" : "processing",
          workflowRunSubStatus: response.status,
          applicant: response.applicantId,
          ...auth0Payload,
          state: auth0State
        }
        const signed = jwt.sign(sessionToken, process.env.APP_SECRET)
        console.log(auth0Payload)
        //eslint-disable-next-line
        //@ts-ignore
        const continueUrl = `${auth0Payload.iss}continue/reset-password?state=${auth0State}&session_token=${signed}`
        //const continueUrl = `${auth0Payload.iss}continue?state=${auth0State}`
        res.redirect(continueUrl)
      })
      .catch(error => {
        res.status(500).render("error", { message: error,
        url: process.env.OKTA_URL})
      })
  } else {
    return onfidoClient.workflowRun.find(workflowRunId)
      .then(response => {
        console.log(response);
        const sessionToken = {
          workflowRunId,
          workflowRunStatus: ["approved", "declined", "review", "abandoned","error"].indexOf(response.status) >=0 ? "complete" : "processing",
          workflowRunSubStatus: response.status,
          applicant: response.applicantId,
          ...auth0Payload,
          state: auth0State
        }
        const signed = jwt.sign(sessionToken, process.env.APP_SECRET)
        console.log(auth0Payload)
        const continueUrl = `${auth0Payload.iss}continue/reset-password?state=${auth0State}&session_token=${signed}`
        res.redirect(continueUrl)
      })
      .catch(error => {
        res.status(500).render("error", { message: error,
          url: process.env.OKTA_URL })
      })
  }
})

router.get("/check", (req, res) => {
  console.log(req.session);
  const { applicant } = req.session
  const reportNames = process.env.ONFIDO_REPORT_NAMES.split(",")
  return onfidoClient.workflowRun.find(req.session.workflowRunId)
    //.create({ applicantId: applicant, reportNames })
    .then(response => {
      console.log(response);
      //if(["processing", "awaiting_input","approved", "declined", "review", "abandoned","error"].indexOf(response.status) >=0)
      res.status(200).json({ status: "processing" })
      
    })
    .catch(error => {
      res.status(500).json({ message: error,
        url: process.env.OKTA_URL})
    })
})

router.get("/status", (req, res) => {
  console.log(req.session);
  const { workflowRunId } = req.session
  return onfidoClient.workflowRun.find(workflowRunId)
    .then(response => {
      console.log(response);
      if(["processing", "awaiting_input"].indexOf(response.status) >=0)res.status(200).json({ status: "processing" })
      else  res.status(200).json({ status: "complete" })
      //res.status(200).json({ status: response.status })
    })
    .catch(error => {
      console.log(error);
      res.status(500).json({ message: error,
        url: process.env.OKTA_URL})
    })
})

export default router
