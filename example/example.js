const lokisvc = require('../lokiservice.js');

// By default the relative path to your initializer is resolved according to the position of the loki-service module.
// When this project is included as a node dependency, it will be easier to base this on require.main.filename root.
const path = require('path');
var appDir = path.dirname(require.main.filename);
const svcname = appDir + "/demo1-service.init.js"; 

// Currently just use the interface designed according to asp.net core node services requirements.
// Eventually i will provide a more native node interface as well.
// The path to this database file is relative to the initializer module (examples dir)
lokisvc.find(function(res, result) { console.log(result); }, svcname, "./demo1.db", "users" );

// our particular initializer sets up autosave timer, so we will need to ctrl-c to quit
console.log("");
console.log("Query in Progress...");
console.log("When complete, Press CTRL-C to quit");
console.log("");

// Since autosave timer keeps program from exiting, we exit this program by ctrl-c.
// (optionally) For best practice, lets use the standard exit events to force a db flush to disk 
//    if autosave timer has not had a fired yet (if exiting before 4 seconds).
process.on('SIGINT', function() {
  lokisvc.shutdown(function() {
      console.log("shutdown complete");
  });
});

