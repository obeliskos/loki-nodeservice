/**
 * lokiservice.js
 * 
 * This module represents a module which aspnet nodeservices can 'call into' to 
 * perform actions on loki databases.
 * 
 * This module is to be paired with a 'service init' module which takes care
 * of details like instantiating, initializing collections, transforms, dynamic views
 * and seeding the database with data.
 * 
 * Ideally, once refined, this module should never need to be modified and you
 * can just add new 'service initializers' to make it fit your purposes.
 * 
 * This module is currently designed to leave modifying the structure of the database
 * to node-side code (initializers) and provide aspnet access to the collection, 
 * transform, and dynamic view functionality.
 */
const loki = require("lokijs");
var serviceName;

// global loki db instance(s) hashobject for interacting with multiple databases simultaneously
var databaseRegistry = {
};

// global/volatile stat variable
var serviceStats = {
    processVersions: process.versions,
    memoryUsage: {},
    cpuUsage: "",
    start: (new Date()).getTime(),
    nodeUptime: 0.0,
    platform: process.platform,
    arch: process.arch,
    execPath: process.execPath,
    instanceNames: [],
    requestStats : {
        totalRequests : 0,
        totalTime: 0.0,
        getRequests: 0,
        getTime: 0.0,
        findRequests: 0,
        findTime: 0.0,
        transformRequests: 0,
        transformTime: 0.0,
        dynamicViewRequests: 0,
        dynamicViewTime: 0.0,
        insertRequests: 0,
        insertTime: 0.0,
        updateRequests: 0,
        updateTime: 0.0,
        removeRequests: 0,
        removeTime: 0.0
    }
};

/**
 * Helper method to convert number of bytes to more readable string
 * @param {int} bytes - number of bytes
 * @param {int} decimals - number of decimals to allow when converting to higher size group
 */
function formatBytes(bytes,decimals) {
   if(bytes == 0) return '0 Byte';
   var k = 1000; // or 1024 for binary
   var dm = decimals + 1 || 3;
   var sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
   var i = Math.floor(Math.log(bytes) / Math.log(k));
   return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Ensures that if this is our first request, we have initialized our global loki database instance
 * 
 * @param {*} callback 
 */
function getDatabase(serviceName, filename, callback) {
    databaseRegistry[serviceName] = databaseRegistry[serviceName] || {};

    // if this database is already initialized and registered, invoke callback with a reference to it
    if (databaseRegistry[serviceName][filename]) {
        callback(databaseRegistry[serviceName][filename].instance);
        return;
    }

    var serviceInitializer = require(serviceName);
    serviceInitializer.init(filename, function(dbInstance) {
        databaseRegistry[serviceName][filename] = {
            instance : dbInstance,
            stats : {
                totalRequests : 0,
                totalTime: 0.0,
                getRequests: 0,
                getTime: 0.0,
                findRequests: 0,
                findTime: 0.0,
                transformRequests: 0,
                transformTime: 0.0,
                dynamicViewRequests: 0,
                dynamicViewTime: 0.0,
                insertRequests: 0,
                insertTime: 0.0,
                updateRequests: 0,
                updateTime: 0.0,
                removeRequests: 0,
                removeTime: 0.0
            }
        }
        callback(databaseRegistry[serviceName][filename].instance);
    });
}

function processGet(serviceName, filename, collection, id, callback) {
    getDatabase(serviceName, filename, function(db) {
        if (typeof id === "string") {
            id = parseInt(id, 10);
        }

        var result = db.getCollection(collection).get(id);

        callback(JSON.stringify(result));
    });
}

/**
 * 
 * @param {string} collection 
 * @param {object|string} query 
 * @param {function} callback - callback up to module export/aspnet nodeservices
 */
function processFind(serviceName, filename, collection, query, callback) {
    getDatabase(serviceName, filename, function(db) {
        if (typeof query === "string") {
            query = JSON.parse(query);
        }

        var result = db.getCollection(collection).find(query);

        callback(JSON.stringify(result));
    });
}

/**
 * 
 * @param {*} collection 
 * @param {*} obj 
 * @param {*} callback 
 */
function processInsert(serviceName, filename, collection, obj, callback) {

    getDatabase(serviceName, filename, function(db) {
        if (typeof obj === "string") {
            obj = JSON.parse(obj);
        }

        if (obj.$loki === 0) {
            delete obj.$loki;

        }

        if (obj.hasOwnProperty("meta")) {
            delete obj.meta;
        }

        var result = db.getCollection(collection).insert(obj);

        callback(JSON.stringify(result));
    });
}

/**
 * 
 * @param {*} collection 
 * @param {*} obj 
 * @param {*} callback 
 */
function processUpdate(serviceName, filename, collection, obj, callback) {

    getDatabase(serviceName, filename, function(db) {
        if (typeof obj === "string") {
            obj = JSON.parse(obj);
        }
        // lets remove meta before shallow cloning all other properties onto
        // existing one.
        if (obj.hasOwnProperty("meta")) {
            delete obj.meta;
        }

        // lookup existing doc
        var doc = db.getCollection(collection).get(obj.$loki);

        // overwrite property values which were given
        Object.assign(doc, obj);

        // can't remember why i wrapped result, verify if we can just return update() return value
        var result = db.getCollection(collection).update(doc);

        callback(JSON.stringify(result));
    });
}

/**
 * 
 * @param {*} collection 
 * @param {*} obj 
 * @param {*} callback 
 */
function processRemove(serviceName, filename, collection, obj, callback) {

    getDatabase(serviceName, filename, function(db) {
        if (typeof obj === "string") {
            obj = JSON.parse(obj);
        }

        var result = {
            "val" : db.getCollection(collection).remove(obj)
        };

        callback(JSON.stringify(result));
    });
}

/**
 * Invokes a 'named' transform stored within a loki collection, and returns the result.
 * 
 * @param {string} collection - name of collection which named transform is registered
 * @param {string} transform  - string representing a named transform 
 * @param {string} transformParams - JSON encoded params to pass
 * @param {boolean} dataInvoke - (default: true) terminate chain with call to data()
 * @param {function} callback - callback up to module export/aspnet nodeservices
 */
function processTransform(serviceName, filename, collection, transform, transformParams, dataInvoke, callback) {
    // allow optional transform params to be parsed and then passed
    transformParams = transformParams?JSON.parse(transformParams): undefined;

    // we may want to utilize a map within our transform which breaks chain,
    // In that case we should pass false for invokeData.
    if (typeof dataInvoke === 'undefined' || dataInvoke === null) {
        dataInvoke = true;
    }

    getDatabase(serviceName, filename, function(db) {
        var result = db.getCollection(collection).chain(transform, transformParams);

        if (dataInvoke) {
            result = result.data();
        }

        callback(JSON.stringify(result));
    });
}

/**
 * Used for obtaining results from a dynamic view, with optional (named) transform extract
 * @param {*} serviceName 
 * @param {*} filename 
 * @param {*} collection 
 * @param {*} viewname 
 * @param {*} transformName 
 * @param {*} callback 
 */
function processDynamicView(serviceName, filename, collection, viewname, transformName, transformParams, callback) {

    getDatabase(serviceName, filename, function(db) {
        transformParams = transformParams?JSON.parse(transformParams): undefined;

        var dv = db.getCollection(collection).getDynamicView(viewname);

        var result;

        if (transformName) {
            result = dv.branchResultset("transformName", transformParams).data();
        }
        else {
            result = dv.data();
        }

        callback(JSON.stringify(result));
    });
}

/**
 * Used for Dynamic View (with optional named transform extract) when post query chaining (implemented as raw transform) is required.
 * 
 * @param {*} serviceName 
 * @param {*} filename 
 * @param {*} collection 
 * @param {*} viewname 
 * @param {*} transform 
 * @param {*} callback 
 */
function processDynamicViewTransform(serviceName, filename, collection, viewname, transformName, transformParams, rawTransform, callback) {
    if (!rawTransform) {
        return processDynamicView(serviceName, filename, collection, viewname, transformName, transformParams, callback);
    }

    // parse the raw transform string
    rawTransform = JSON.parse(rawTransform);

    if (!transformName) {
        transformName = undefined;
        transferParams = undefined;
    }
    else {
        transformParams = transformParams?JSON.parse(transformParams):undefined;
    }

    getDatabase(serviceName, filename, function(db) {
        var dv = db.getCollection(collection).getDynamicView(viewname);

        var result = dv.branchResultset(transformName, transformParams).transform(rawTransform).data();

        callback(JSON.stringify(result));
    });
}

var counter = 0;
var start, started, startMS, end, endMS, totalMS;

function startTiming(statName) {
    start = process.hrtime();
    return start[0] * 1e3 + start[1] / 1e6
}

function stopTiming(startTimeMS, statName, serviceName, filename) {
    end=process.hrtime();
    endMS = end[0] * 1e3 + end[1] / 1e6;
    totalMS = endMS - startTimeMS;

    serviceStats.requestStats.totalRequests++;
    serviceStats.requestStats.totalTime += totalMS;
    serviceStats.requestStats[statName + "Requests"] += 1;
    serviceStats.requestStats[statName + "Time"] += totalMS;

    databaseRegistry[serviceName][filename].stats.totalRequests++;
    databaseRegistry[serviceName][filename].stats.totalTime += totalMS;
    databaseRegistry[serviceName][filename].stats[statName + "Requests"]++;
    databaseRegistry[serviceName][filename].stats[statName + "Time"] += totalMS;
}

/**
 * Define our module export as having multiple exports, thus requiring the InvokeExportAsync method
 * on the NodeServices / aspnetcore side
 */
module.exports = {
   get: function(callback, serviceName, filename, collection, id) {
        started = startTiming("get");

        processGet(serviceName, filename, collection, id, function(response) {
            stopTiming(started, "get", serviceName, filename);

            callback(null, response);
        });
   },
   find: function(callback, serviceName, filename, collection, query) {
        started = startTiming("find");

        processFind(serviceName, filename, collection, query, function(response) {
            stopTiming(started, "find", serviceName, filename);

            callback(null, response);
        });
   },

   insert: function(callback, serviceName, filename, collection, obj) {
        started = startTiming("insert");

        processInsert(serviceName, filename, collection, obj, function(response) {
            stopTiming(started, "insert", serviceName, filename);

            callback(null, response);
        });
   },

   update: function(callback, serviceName, filename, collection, obj) {
        started = startTiming("update");

        processUpdate(serviceName, filename, collection, obj, function(response) {
            stopTiming(started, "update", serviceName, filename);

            callback(null, response);
        });
   },

   remove: function(callback, serviceName, filename, collection, obj) {
        started = startTiming("remove");

        processRemove(serviceName, filename, collection, obj, function(response) {
            stopTiming(started, "remove", serviceName, filename);

            callback(null, response);
        });
   },

   transform: function(callback, serviceName, filename, collection, transform, transformParams, dataInvoke) {
        started = startTiming("transform");

        processTransform(serviceName, filename, collection, transform, transformParams, dataInvoke, function(response) {
            stopTiming(started, "transform", serviceName, filename);

            callback(null, response);
        });
   },

   transformRaw: function(callback, serviceName, filename, collection, transform, transformParams, dataInvoke) {
        started = startTiming("transform");

        var rawTransform = JSON.parse(transform);

        processTransform(serviceName, filename, collection, rawTransform, transformParams, dataInvoke, function(response) {
            stopTiming(started, "transform", serviceName, filename);

            callback(null, response);
        });
   },

   dynamicView: function(callback, serviceName, filename, collection, viewname, transformName, transformParams) {
        started = startTiming("dynamicView");

        processDynamicView(serviceName, filename, collection, viewname, transformName, transformParams, function(response) {
            stopTiming(started, "dynamicView", serviceName, filename);

            callback(null, response);
        });
   },

   dynamicViewTransform: function(callback, serviceName, filename, collection, viewname, transform, transformParams, rawTransform) {
        started = startTiming("dynamicView");

        processDynamicViewTransform(serviceName, filename, collection, viewname, transform, transformParams, rawTransform, function(response) {
            stopTiming(started, "dynamicView", serviceName, filename);

            callback(null, response);
        });
   },
   
   stats: function(callback, serviceName, filename) {
        var pmu = process.memoryUsage();
        serviceStats.memoryUsage = {
            rss: pmu.rss,
            rssText : formatBytes(pmu.rss),
            heapTotal: pmu.heapTotal,
            heapTotalText: formatBytes(pmu.heapTotal),
            heapUsed: pmu.heapUsed,
            heapUsedText: formatBytes(pmu.heapUsed)
        }

       serviceStats.instanceNames = [];
        for (initName in databaseRegistry) {
            for (instName in databaseRegistry[initName]) {
                serviceStats.instanceNames.push({ initializerName: initName, instanceName: instName });
            }
        }

        serviceStats.nodeUptime = process.uptime();
        var cpuUsage = process.cpuUsage();
        serviceStats.cpuUsageUser = cpuUsage.user / 1e3;
        serviceStats.cpuUsageSystem = cpuUsage.system / 1e3;
        serviceStats.cpuUsage = "user: " + serviceStats.cpuUsageUser + "ms; system :" + serviceStats.cpuUsageSystem + "ms";

        callback(null, JSON.stringify(serviceStats));
   },

   instanceStats: function(callback, serviceName, filename) {
       if (!databaseRegistry.hasOwnProperty(serviceName)) callback(null);
       if (!databaseRegistry[serviceName].hasOwnProperty(filename)) callback(null);

       var dbinst = databaseRegistry[serviceName][filename].instance;

       var resultStats = {
           serviceName: serviceName,
           filename: filename,
           autosave: dbinst.autosave,
           autosaveInterval: dbinst.autosaveInterval,
           throttledSaves :  dbinst.throttledSaves,
           databaseVersion:  dbinst.databaseVersion,
           requestStats: databaseRegistry[serviceName][filename].stats,
           collectionInfo: []
       }

       dbinst.collections.forEach(function(coll) {
           var rs = {
                name: coll.name,
                count: coll.count(),
                dirty: coll.dirty,
                clone: coll.cloneObjects,
                adaptiveBinaryIndices: coll.adaptiveBinaryIndices,
                binaryIndices: Object.keys(coll.binaryIndices),
                uniqueIndices: coll.uniqueNames,
                transforms: Object.keys(coll.transforms),
                dynamicViews: []
            };

            coll.DynamicViews.forEach(dv => {
                rs.dynamicViews.push(dv.name);
            });

            resultStats.collectionInfo.push(rs);

       }, this);

       callback(null, JSON.stringify(resultStats));
   },

   shutdown: function(callback) {
        for (initName in databaseRegistry) {
            for (instName in databaseRegistry[initName]) {
                var dbreg = databaseRegistry[initName][instName];
                if (dbreg.instance !== null) {
                    console.log("closing : " + instName);
                    dbreg.instance.close();
                    callback(null);
                }
            }
        }
   }
}; 
