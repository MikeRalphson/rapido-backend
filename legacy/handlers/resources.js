// CRUD Resource API
// TODO: Add authentication and register mock listeners on changes
var mongo = require('mongoskin');
var passport = require('passport');

module.exports = function(app, conn){

	// Retrieve list of resources
    app.get('/projects/:projectId/resources', function(req, res){
		
		var projectId = req.params.projectId;
    		    
		if( projectId == null ) {
			res.send(400, '{"message": "invalid project ID"}');
		}

		conn.collection('resources').find({project: projectId}).toArray(function (err, resources) {
			res.send(resources);
			//TODO: Include response data
		});
	 });
	
	// Create a new resource
	app.post('/projects/:projectId/resources', function(req,res) {

		// Store a newly created task object		
		var _resource = req.body.resource;

        console.log(_resource);
		
		var resource = {
			name: _resource.name,
			description: _resource.description,
			responses: _resource.responses,
			url: _resource.url,
			children: _resource.children,
			parent: _resource.parent,
			methods: _resource.methods,
            class: _resource.class,
			project: req.params.projectId
		}

        console.log(resource);
		
						
		conn.collection('resources').insert(resource, function (err, insertResult) {
			if( err ) {
				res.send(500, err);
			} else {				
				// Update the resource parent's children property
				console.log(insertResult[0]);
				if( insertResult[0].parent ) {
					var parentId = mongo.helper.toObjectID(insertResult[0].parent);
					var resourceId = insertResult[0]._id.toString();
					conn.collection('resources').update(
						{_id: parentId },
						{'$push': { children: resourceId} },
						function (err, result) {
						if( err ) {
							// We aren't using commits so just fail if this happens.  Not great, but no time to deal with this for now.
							console.log('warn...');
							console.warn('Unable to update parent resource');
							res.send(insertResult);
						} else {			
							res.send(insertResult);
						}
					});
				} else {
					res.send(insertResult);
				}
				
			}
		});
				
		//registerMockListeners();
	});
	
	// Replace an existing resource
	app.put('/projects/:projectId/resources/:resourceId', function(req,res) {
		// Store a newly created task object		
		var _resource = req.body.resource;
		var id = req.params.resourceId;
						
		var resource = {
			name: _resource.name,
			description: _resource.description,
			responses: _resource.responses,
			url: _resource.url,
			children: _resource.children,
			parent: _resource.parent,
			methods: _resource.methods,
            class: _resource.class,
			project: req.params.projectId
		}
		
		conn.collection('resources').updateById(mongo.helper.toObjectID(id), resource, function (err, result) {
			if( err ) {
				res.status(500);
				res.send('{"message" : "Unable to store data in database."}');
				console.log(err);
			}else {						
				res.send(200, result);
			}        	        
    	});		
	});

	app.delete('/projects/:projectId/resources/:resourceId', function(req,res) {
		var id = req.params.resourceId;
		
		conn.collection('resources').removeById(mongo.helper.toObjectID(id), function (err, result) {
			if( err ) {
				res.status(500);
				res.send('{"message" : "Unable to store data in database."}');
				console.log(err);
			}else {						
				res.send(200, result);
			}        	        
		});
	});
	
	//TODO: I ran out of time trying to get atomic response manipulation working.  I'll just deal with it at the resources level instead.
	
	
	/**
	// Create a new response for a particular resource
	app.post('/projects/:projectId/resources/:resourceId/responses', function(req,res) {
		var projectId = req.params.projectId;
		var resourceId = req.params.resourceId;

		var _response = req.body.response;

		var response = {
			name: "",
			status: "200",
			headers: {},
			conditions : _response.conditions,
			body: _response.body,
			resource: resourceId,
			project: projectId
		}
		
		console.log(response);
		
		
		conn.collection('responses').insert(response, function (err, result) {
			if( err ) {
				res.send(500, err);
			}else {
				res.send(result);
			}
		})
	});
	**/
	
	/*
	// Upsert a response 
	app.put('/projects/:projectId/resources/:resourceId/responses/:name', function(req,res) {
		var projectId = req.params.projectId;
		var resourceId = req.params.resourceId;
		var responseName = req.params.name;
		
		//db.resources.update({_id: ObjectId("54426195293ae6d92f000002")}, {$set: { "responses.second": {'name': 'second'} } } )
		
		//TODO: This is a security problem.  We should blacklist this field.
		var responseSelector = "responses." + responseName;
		
		conn.collection('resources').updateById(conn.ObjectID.createFromHexString(resourceId), 
												{$set: { 'responses.' + responseName: {'name': responseName} } },
												function (err, result) {
													if(err) res.send(500,err);
													else res.send(result);
												});
	});
			
		
	// Delete an existing response
	app.delete('/projects/:projectId/resources/:resourceId/responses/:name', function(req,res) {
	});
		
		*/
}
