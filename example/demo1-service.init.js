/**
 * Loki-NodeService example database initializer
 * 
 * On the node/loki side of this project we are going to split out 
 * the implementation specific initializer from a general purpose loki nodejs interface.
 * 
 * This initializer will handle constructing the loki database with its specific 
 * constructor options, as well as initializing it with collections, views, transforms, and data.
 * 
 * Currently the only export interface is that your initializer needs to implement :
 * An 'init' function which can accept a filename/path.  
 * It should invoke the callback with the created loki db instance.
 * 
 * If persistence is required, it is assumed you will implement 
 * an autosave interval, as this example does.
 */

const loki = require("lokijs");

var db;

/**
 * Handles both constructing and initializng a loki db instance
 * 
 * @param {string} filename - filename/pathname to where your database should be created.
 * @param {function} callback - accepting loki db instance
 */
function init(filename, callback) {
    db = new loki(filename, { 
        autoload: true,
        autoloadCallback: function() {
            seedDatabase();

            callback(db);
        },
        autosave: 'true',
        autosaveInterval: 4000
    });
}

function seedDatabase() {
    var users = db.getCollection('users');

    if (users === null) {
        users = db.addCollection('users', { indices: ["age"]});

        // This users collection will have concrete type defined for it, where:
        //  - gender is an enumeration (0=male, 1=female)
        //  - tags is a (generic) list of type string

        users.insert({name:'odin', age: 999, gender:0, tags: ["knowlege", "sorcery", "frenzy", "runes"] });
        users.insert({name:'frigga', age: 980, gender:1, tags: ["foreknowlege"] });
        users.insert({name:'thor', age: 35, gender: 0, tags: ["storms", "hammer"] });
        users.insert({ name: "sif", age: 30, gender: 1, tags: ["golden hair"] });
        users.insert({name:'loki', age: 25, gender: 0, tags: ["shapeshifter", "trickster"] });
        users.insert({ name: "sigyn", age: 24, gender: 1, tags: ["relief"] });
        users.insert({name:'heimdallr', age: 870, gender: 0, tags: ["bifrost", "keen eyesight", "keen hearing"]})
    }

    var locations = db.getCollection('locations');
    if (locations === null) {
        locations = db.addCollection('locations');

        locations.insert({ name: 'Asgard', dwellers: 'Aesir', ruler: 'Odin' });
        locations.insert({ name: 'Alfheim', dwellers: 'Elves' });
        locations.insert({ name: 'Svartalfheim', dwellers: 'Dwarves' });
        locations.insert({ name: 'Midgard', dwellers: 'Puny Humans' });
        locations.insert({ name: 'Jotunheim', dwellers: 'Giants' });
        locations.insert({ name: 'Vanaheimr', dwellers: 'Vanir' });
        locations.insert({ name: 'Niflheim', dwellers: 'Ice/Snow' });
        locations.insert({ name: 'Muspelheim', dwellers: 'Fire Giants', ruler: 'Surtr' });
        locations.insert({ name: 'Helheim', dwellers: 'Deceased' });
    }

    // add/update a (currently non-parameterized) transform for example
    users.setTransform("goddesses", [
        {
            type: 'find',
            value: {
                'gender': 1, 
                'age': { $lte: '[%lktxp]AgeFilter'}
            }
        },
        {
            type: 'simplesort',
            property: "age",
            desc: true
        }
    ]);

    // The 'where' filter function will not be correctly serialized but we are 
    // overwriting/adding the transform on every initialization.
    users.setTransform("knowlege", [
        {
            type: 'where',
            value: function(obj) {
                var found = false;
                // if any of the object's tags contain substring 'knowlege' the obj passes the 'filter'
                obj.tags.forEach(function(tag) {
                    if (tag.indexOf("knowlege") !== -1) found = true;
                }, this);

                return found;
            }
        }
    ]);
  
    var youngsterView = users.getDynamicView("Youngsters");
    if (!youngsterView) {
        youngsterView = users.addDynamicView("Youngsters");
        youngsterView.applyFind({age: { $lt: 100 }});
        youngsterView.applySimpleSort("age", true);
    }
}

module.exports = { 
    init: init
}