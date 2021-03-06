"use strict";

const express = require('express');
const winston = require('winston');
const logger = require('morgan');
const bodyParser = require('body-parser');
const RapidoError = require('./errors/rapido-error.js');
const RapidoErrorCodes = require('./errors/codes.js');
const representer = require('./representers/json.js')();
const cors = require('cors');

const users = require('./handlers/users.js');
const projects = require('./handlers/projects.js');
const sketches = require('./handlers/sketches.js');
const echo = require('./handlers/echo.js');
const authentication = require('./security/authentication.js');
const middleware = require('./handlers/middleware.js');
const nodes = require('./handlers/nodes.js');

//TODO: Rename this to routesetup or something more meaningful

const start = function start(serverPort, cb) {

  // Setup the express server
  const app = express();
  //app.use(logger('dev'));
  app.use(bodyParser.json());
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(cors());
  //server.use(express.static(path.join(__dirname, 'public')));

  winston.log('info', 'server is listening on port: ' + serverPort);


  app.use(middleware.requestValidator);

  winston.log('debug', 'setting up routes...');
  // Setup routes
  app.all('/api/echo', echo.echoHandler);
  app.post('/api/register', users.registrationHandler);
  app.post('/api/verify', users.verifyHandler);
  app.post('/api/resendEmail', users.resendHandler);
  app.post('/api/login', users.loginHandler);
  app.get('/api/sketch/:sketchId', authentication.authenticateRequest, sketches.retrieveSketchHandler);
  app.post('/api/projects', authentication.authenticateRequest, projects.createProjectHandler);
  app.get('/api/projects', authentication.authenticateRequest, projects.findProjectsHandler);
  app.get('/api/projects/:projectId', authentication.authenticateRequest, projects.findProjectHandler);
  app.post('/api/projects/:projectId/sketches', authentication.authenticateRequest, sketches.createSketchHandler);
  //app.post('/api/projects/:projectId/sketches/:sketchIndex/nodes', authentication.authenticateRequest, nodes.createNodeHandler);
  app.post('/api/projects/:projectId/sketches/:sketchIndex/nodes/:nodeId', authentication.authenticateRequest, nodes.createNodeHandler);
  app.patch('/api/projects/:projectId/sketches/:sketchIndex/nodes/:nodeId', authentication.authenticateRequest, nodes.updateNodePropertiesHandler);
  app.delete('/api/projects/:projectId/sketches/:sketchIndex/nodes/:nodeId', authentication.authenticateRequest, nodes.deleteNodeHandler);
  app.put('/api/projects/:projectId/sketches/:sketchIndex/nodes/:nodeId/move', authentication.authenticateRequest, nodes.moveNodeHandler);
  app.get('/api/projects/:projectId/sketches/:sketchIndex/export', authentication.authenticateRequest, sketches.exportSketchHandler);


  winston.log('debug', 'finished setting up routes');
  winston.log('debug', serverPort);

  // app._router.stack.forEach(route => {
  //   console.log(route);
  // });

  // Setup error handlers
  app.use(function (err, req, res, next) {
    //console.log('!!!!!!!!!!!!!!!!!! IN ERROR HANDLER');
    if (res.headersSent) {
      return next(err)
    }

    // Set the media type for a problem report
    res.set('Content-Type', 'application/problem+json');
    if( err.name === 'RapidoError') {
      winston.log('warn', err.stack);
      res.status(err.status).send(representer.convertRapidoError(err, err.title));
    }else if( err.name === 'SyntaxError') {
      winston.log('warn', err.stack);
      res.status(400).send(representer.errorMessage(err.code, 'Malformed request body'));
    }else {
      winston.log('error', err.stack);
      res.status(500).send(representer.errorMessage(RapidoErrorCodes.genericError, 'Something has gone wrong on the server side'));
    }
  })

  // Start the server
  const server = app.listen(serverPort, () => {
    // winston.log('debug', '%s listening at %s', app.name, app.url);
    // Return the server to a callback function if one has been specified
    // TODO: turn this into a Promise
    if (cb) {
      cb(server, app);
    }
  });


};

module.exports = {
  start
};
