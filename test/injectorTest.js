var nject = require('../'),
    should = require('should'),
    path = require('path'),
    mod = require('./testCases/aiModule');

describe('injector', function () {

    afterEach(function(){
        nject.reset()
        mod.$inject(undefined, undefined);
    });

    describe('config', function () {
        it('accepts a json object directly', function () {
            nject.config({
                "process":[
                    "./testCases/aiModule"
                ],
                "dependencies":{
                    "$hello":"./testCases/dependencies/englishHello",
                    "$world":"./testCases/dependencies/englishWorld"
                },
                baseDir: __dirname
            });

            mod.speak().should.equal('hello world');
        });

        it('accepts a baseDir as a second option', function () {
            nject.config({
                "process":[
                    "./testCases/aiModule"
                ],
                "dependencies":{
                    "$hello":"./testCases/dependencies/englishHello",
                    "$world":"./testCases/dependencies/englishWorld"
                }
            }, __dirname);

            mod.speak().should.equal('hello world');
        });

        it('walks directories and handles nested dependencies', function(){
            nject.config({
                "process":[
                    "./testCases/aiModule",
                    "./testCases/dependencies"
                ],
                "dependencies":{
                    "$hello":"./testCases/dependencies/frenchHello",
                    "$world":"./testCases/dependencies/frenchWorld",
                    "$french":"./testCases/dependencies/french"
                }
            }, __dirname);

            mod.speak().should.equal('bonjour monde');
        });

        it('ignores node_modules and non requireable files correctly', function(){
            nject.config({
                "process":[
                    "./"
                ],
                "dependencies":{
                    "$hello":"./testCases/dependencies/frenchHello",
                    "$world":"./testCases/dependencies/frenchWorld",
                    "$french":"./testCases/dependencies/french"
                }
            }, __dirname);

            //no errors were thrown
        });

        it('requires global modules', function(){
            nject.config({
                "process":[
                    "./"
                ],
                "dependencies":{
                    "$hello":"./testCases/dependencies/frenchHello",
                    "$world":"./testCases/dependencies/frenchWorld",
                    "$underscore":"underscore"
                }
            }, __dirname);

            mod.underscore().should.equal(require('underscore'));
        });

        it('accepts objects directly', function(){
            var injectedObject = {};

            nject.config({
                "process":[
                    "./"
                ],
                "dependencies":{
                    "$hello":"./testCases/dependencies/frenchHello",
                    "$world":"./testCases/dependencies/frenchWorld",
                    "$underscore":injectedObject
                }
            }, __dirname);

            mod.underscore().should.equal(injectedObject);
        });

        it('works with my json file', function(){
            nject.config(require('./testCases/nject.json'), path.resolve(__dirname, './testCases'));

            mod.speak().should.equal('hello monde');
        });
    });
});