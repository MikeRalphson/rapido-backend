"use strict";

const representer = require('../representers/json.js')();
const registrationService = require('../services/registration.js');
const winston = require('winston');
const bcrypt = require('bcrypt-nodejs');
const RapidoError = require('../../src/errors/rapido-error.js');
const RapidoErrorCodes = require('../../src/errors/codes.js');
const pgp = require('pg-promise');
const authentication = require('../security/authentication.js')
const users = require('../model/users.js');

module.exports = {

	registrationHandler: function(req, res, next) {
		winston.log('debug', 'registrationHandler called.');
		winston.log('debug', req.body);

		// Create the user object
		var fullName = req.body.fullname;
		var nickName = req.body.nickname;
		var password = req.body.password;
		var email = req.body.email;

		// Make sure that all mandatory properties are present.  The actual values are validated inside the service object
		let fieldErrors = [];

		if( !fullName ) {
			winston.log('debug', 'fullname property is missing.')
			fieldErrors.push({
				field: 'fullname',
				type: 'missing',
				description: 'the "fullname" property is missing from the request body'
			});
		}
		if( !nickName ) {
			winston.log('debug', 'nickname property is missing.');
			winston.log('debug', 'using fullname as the nickname property');
			nickName = fullName;
		}
		if( !email ) {
			winston.log('debug', 'email property is missing.')
			fieldErrors.push({
				field: 'email',
				type: 'missing',
				description: 'the "email" property is missing from the request body'
			});
		}
		if( !password ) {
			winston.log('debug', 'password property is missing.')
			fieldErrors.push({
				field: 'password',
				type: 'missing',
				description: 'the "password" property is missing from the request body'
			});
		}

		if( fieldErrors.length > 0 ) {
			let error = new RapidoError(
				RapidoErrorCodes.fieldValidationError,
				'One or more registration arguments are invalid',
				400,
				fieldErrors
			);
			next(error);
		}

		registrationService.register(email, password, fullName, nickName)
		.then((result)=>{
			winston.log('debug', '[RegistrationHandler] Returning succesful registration response message');
			winston.log('debug', '[RegistrationHandler] User ID is:', result.newUser.id);
			res.send(representer.responseMessage({
			user: {
				id: result.newUser.id,
				email: result.newUser.email,
				nickName: result.newUser.nickName,
				fullName: result.newUser.fullName,
				isVerified: result.newUser.isVerified
			}}));
		})
		.catch((error)=>{
			winston.log('debug', 'Unable to register', error);
			if( error.name === 'RapidoError') {
				next(error);
			}else {
				next(new RapidoError(
					RapidoErrorCodes.genericError,
					'Unable to register',
					500,
					null,
					'Registration Error'
				));
			}
		})
	},

	loginHandler: function(req, res, next) {

		// Extract the user details from the request
		let email = req.body.email;
		let password = req.body.password

		// Lookup the user
		users.find({email: email})
		.then( (result) => {
			if( result.length === 0) {
				throw new RapidoError(
					RapidoErrorCodes.invalidLoginCredentials,
					'Invalid login credentials',
					401,
					null,
					'Login Error'
				);
			}else if( result.length === 1) {
				winston.log('debug', 'result: ', result[0]);
				// Compare the passwords
				bcrypt.compare(password, result[0].password, function(err, equivalent) {
					if( !equivalent || err ) {
						if( err ) {
							winston.log('warn', 'Unexpected error from bcrypt compare: ', err);
						}
						winston.log('info', 'password mismatch');
						next(new RapidoError(
							RapidoErrorCodes.invalidLoginCredentials,
							'Invalid login credentials',
							401,
							null,
							'Login Error'
						));
					}else {
						// generate and return jwt token
						let jwtToken = authentication.generateJWT({id: result[0].id, email: email});
						winston.log('debug', 'token: ', jwtToken);
						let responseBody = {
							token: jwtToken,
							email: result[0].email,
							userId: result[0].id,
							nickName: result[0].nickname,
							fullName: result[0].fullname,
							isVerified: result[0].isverified

						}
						res.send(representer.responseMessage(responseBody));
					}
        })
			}else {
				//uh oh
				//console.log(result);
				winston.log('warn', 'More than one user was returned when looking up user ', email);
				throw new RapidoError(
					RapidoErrorCodes.genericError,
					'An error occurred while trying to login',
					500
				);
			}
		})
		.catch((error)=>{
			// Could not lookup the user
			winston.log('error', error);
			if( error.name === 'RapidoError') {
				next(error)
			}else {
				next(new RapidoError(
					RapidoErrorCodes.genericError,
					'An error occurred while trying to login',
					500
				))
			}
		})

	},

	/***
	Resend Verification email
	***/
	resendHandler: function(req, res, next) {
		winston.log('debug', 'resendHandler called.');

		let email = req.body.email;

		if( !email ) {
			next(new RapidoError(
				RapidoErrorCodes.fieldValidationError,
				'Cannot send verification email without an email address to send to',
				400,
				[{field: 'email', type: 'missing', description: 'the parameter "email" is missing from the request body'}]
			))
			return;
		}

		registrationService.resendVerificationEmail(email)
		.then( result => {
			res.status(204).send();
		}).catch(e => {
			winston.log('error', e);
			if( e.name === 'RapidoError') {
				next(e)
			}else {
				next(new RapidoError(
					RapidoErrorCodes.genericError,
					'An error occurred while trying to login',
					500
				))
			}
		});
	},

	/***
	Verify email registration code
	***/
	verifyHandler: function(req, res, next) {
		winston.log('debug', 'verifyHandler called.');
		let token = req.body.code;

		if( !token ) {
			next(new RapidoError(
				RapidoErrorCodes.fieldValidationError,
				'Verification code cannot be found',
				400,
				[{field: 'code', type: 'missing', description: 'the parameter "code" is missing from the request body'}]
			))
			return;
		}

		let userId;

		registrationService.verify(token)
		.then( result => {
			userId = result.userId;
			// Update the isVerified flag
			return users.update({isVerified: true}, userId);
		}).then( result => {
			// Retrieve this user's information
			return users.find({id: userId});
		}).then( result => {
			// Generate an authentication token for this user
			let jwtToken = authentication.generateJWT({id: result[0].id, email: result[0].email});
			winston.log('debug', 'token: ', jwtToken);
			let responseBody = {
				token: jwtToken,
				email: result[0].email,
				userId: result[0].id,
				nickName: result[0].nickname,
				fullName: result[0].fullname,
				isVerified: result[0].isverified
			}
			res.send(representer.responseMessage(responseBody));
		}).catch(e => {
			winston.log('error', e);
			if( e.name === 'RapidoError') {
				next(e)
			}else {
				next(new RapidoError(
					RapidoErrorCodes.genericError,
					'An error occurred while trying to login',
					500
				))
			}
		})
	}

}
