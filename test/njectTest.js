var nject = require('../'),
    should = require('should'),
    path = require('path');

describe('nject', function () {

    var tree;

    var config = {
        db: 'mongodb://user:password@server:123456',
        timeout: 1000
    }
    var stats = {
        a: 1,
        b: 2
    }

    var dep0Args = false;
    var dep0 = function () {
        dep0Args = arguments;
        return 0;
    }

    var dep1Args = false;
    var dep1 = function (config) {
        dep1Args = arguments;
        return 1;
    }

    var dep2Args = false;
    var dep2 = function (config, stats) {
        dep2Args = arguments;
        return 2;
    }

    var dep3Args = false;
    var dep3 = function (dep2, dep1, stats) {
        dep3Args = arguments;
        return dep1 + dep2;
    }

    var dep4Args = false;
    var dep4 = function (dep3) {
        dep4Args = arguments;
        return 4;
    }

    var dep5Args = false;
    var dep5 = function (_done) {
        dep5Args = arguments
        setTimeout(function () {
            _done(null, 5)
        }, 100)
    }

    var dep6Args = false;
    var dep6 = function (_done) {
        dep6Args = arguments
        setTimeout(function () {
            _done(null, 6)
        }, 11000)
    }

    var dep7Args = false;
    var dep7 = function (_done) {
        dep7Args = arguments
        setTimeout(function () {
            _done(new Error('I am an error!'))
        }, 100)
    }

    var dep8Args = false;
    var dep8 = function (next) {
        dep8Args = arguments
        setTimeout(function () {
            next(null, 8)
        }, 100)
    }

    var badDep = function (asdf) {
    }

    var circ1 = function (circ2) {
    }
    var circ2 = function (circ1) {
    }
    var blocked1 = function (circ1) {
    }

    beforeEach(function () {
        dep1Args = dep2Args = dep3Args = dep4Args = dep5Args = dep6Args = dep7Args = dep8Args = false;
        tree = new nject.Tree();
    })

    describe('constant', function () {
        it('registers a constant value', function () {
            tree.constant('config', config);
            should.exist(tree.registry.config)
            tree.registry.config.constant.should.equal(config)
        });

        it('the registered constant should have no dependencies', function () {
            tree.constant('config', config);
            tree.registry.config.dependencies.should.eql([])
        });

        it('given an object, registers each key value pair as a constant', function(){
            var constants = {
                config: config,
                stats: stats
            }

            tree.constant(constants)
            should.exist(tree.registry.config)
            tree.registry.config.constant.should.equal(config)
            should.exist(tree.registry.stats)
            tree.registry.stats.constant.should.equal(stats)
        });
    });

    describe('register', function () {

        it('adds the given function to the registry', function(){
            tree.register('dep1', dep1)
            should.exist(tree.registry.dep1)
            tree.registry.dep1.fn.should.equal(dep1)
        });

        it('parses the function\'s arguments as dependencies', function(){
            tree.register('dep0', dep0)
            tree.register('dep1', dep1)
            tree.register('dep2', dep2)

            tree.registry.dep0.dependencies.should.eql([])
            tree.registry.dep1.dependencies.should.eql(['config'])
            tree.registry.dep2.dependencies.should.eql(['config', 'stats'])
        });

        it('given an object, registers each key value pair as a constant', function(){
            var fns = {
                dep1: dep1,
                dep2: dep2
            }

            tree.register(fns)
            should.exist(tree.registry.dep1)
            tree.registry.dep1.fn.should.equal(dep1)
            should.exist(tree.registry.dep2)
            tree.registry.dep2.fn.should.equal(dep2)
        });

        it('Throws an error on naming collision', function () {
            function doubleRegister() {
                tree.register('dep1', dep1);
                tree.register('dep1', dep1);
            }

            doubleRegister.should.throw();
        });

    });

    describe('isRegistered', function () {

        it('returns true for a registered constant', function () {
            tree.constant('test', 7);
            tree.isRegistered('test').should.equal(true);
        });

        it('returns true for a registered dependency', function () {
            tree.register('test', function () {
                return 7;
            });
            tree.isRegistered('test').should.equal(true);
        });

        it('returns false for an unregistered key', function () {
            tree.isRegistered('test').should.equal(false);
        })

    })

    describe('resolve', function () {
        it('returns the tree', function(){
            var returned = tree.resolve()
            returned.should.equal(tree);
        });

        it('the tree is an event emitter', function(){
            should.exist(tree.on)
            tree.on.should.be.a('function');
        });

        it('throws an error if you have an unregistered dependency', function () {
            tree.register('badDep', badDep);

            function doResolve() {
                tree.resolve();
            }

            doResolve.should.throw()
        });

        it('resolves correctly with a single constant dependency', function (done) {
            tree.constant('config', config);
            tree.register('dep1', dep1, 'dep1');
            tree.resolve(function (err, resolved) {
                dep1Args.should.be.ok;
                dep1Args[0].should.equal(config);
                done()
            });
        });

        it('fires the resolved event when resolution is completed successfully', function(done){
            tree.on('resolved', function(resolved){
                dep1Args.should.be.ok;
                dep1Args[0].should.equal(config);
                done();
            });

            tree.constant('config', config);
            tree.register('dep1', dep1, 'dep1');
            tree.resolve();
        });

        it('fires the resolved event even when set after calling resolve', function(done){
            tree.constant('config', config);
            tree.register('dep1', dep1, 'dep1');
            tree.resolve();
            tree.on('resolved', function(resolved){
                dep1Args.should.be.ok;
                dep1Args[0].should.equal(config);
                done();
            });
        });

        it('resolves correctly with two constant dependencies', function (done) {
            tree.constant('config', config);
            tree.constant('stats', stats);
            tree.register('dep1', dep1, 'dep1');
            tree.register('dep2', dep2, 'dep2');

            tree.resolve(function (err, resolved) {
                dep1Args.should.be.ok;
                dep1Args[0].should.equal(config);
                dep2Args.should.be.ok;
                dep2Args[0].should.equal(config);
                dep2Args[1].should.equal(stats);

                done()
            });
        });

        it('works with 2 resolved dependencies', function (done) {
            tree.constant('config', config);
            tree.constant('stats', stats);
            tree.register('dep1', dep1, 'dep1');
            tree.register('dep2', dep2, 'dep2');
            tree.register('dep3', dep3, 'dep3');

            tree.resolve(function (err, resolved) {
                dep3Args.should.be.ok;
                dep3Args[0].should.equal(2);
                dep3Args[1].should.equal(1);
                dep3Args[2].should.equal(stats);

                done()
            });
        });

        it('works with complex dependency trees', function (done) {
            tree.constant('config', config);
            tree.constant('stats', stats);
            tree.register('dep1', dep1, 'dep1');
            tree.register('dep2', dep2, 'dep2');
            tree.register('dep3', dep3, 'dep3');
            tree.register('dep4', dep4, 'dep4');


            tree.resolve(function (err, resolved) {
                dep4Args.should.be.ok;
                dep4Args[0].should.equal(3);
                done()
            });
        });

        it('throws an error on circular dependencies', function () {
            tree.register('blocked1', blocked1, 'blocked1');
            tree.register('circ1', circ1, 'circ1');
            tree.register('circ2', circ2, 'circ2');

            function doResolve() {
                tree.resolve();
            }

            doResolve.should.throw()
        });

        it('aggregates correctly', function (done) {
            tree.constant('config', config);
            tree.constant('stats', stats);
            tree.register('dep1', dep1, {
                aggregateOn: 'numbers',
                identifier: 'dep1'
            });
            tree.register('dep2', dep2, {
                aggregateOn: 'numbers',
                identifier: 'dep2'
            });
            tree.register('dep3', function (numbers) {
                numbers.dep1.should.equal(1);
                numbers.dep2.should.equal(2);
            });

            tree.resolve(function (err, resolved) {
                done()
            });
        });
    });

    describe('async resolution', function () {
        this.timeout(12000);

        it('passes a callback to the function', function (done) {
            tree.register('dep5', dep5)

            tree.resolve(function (err, resolved) {
                dep5Args[0].should.be.an.instanceOf(Function)
                done()
            });
        });

        it("resolves to the callback's second argument, rather than return value", function (done) {
            tree.register('dep5', dep5)
            tree.register('dep6', function (dep5) {
                dep5.should.equal(5)
                return 6;
            })

            tree.resolve(function (err, resolved) {
                done()
            });
        });
        it('the resolve callback receives the resolved object', function (done) {
            tree.register('dep5', dep5)
            tree.register('dep6', function (dep5) {
                dep5.should.equal(5)
                return 6;
            });

            tree.resolve(function (err, resolved) {
                should.exist(resolved);
                should.exist(resolved.dep5);
                should.exist(resolved.dep6);

                resolved.dep5.should.equal(5)
                resolved.dep6.should.equal(6)
                done();
            })
        });

        it('throws an error if the resolution takes longer than timeout', function (done) {
            tree.register('dep6', dep6)

            tree.resolve(function (err, resolved) {
                err.should.be.an.instanceOf(Error)
                done()
            });
        });

        it('_timeout can be changed on the tree object', function (done) {
            tree.register('dep5', dep5)
            tree._timeout = 10

            tree.resolve(function (err, resolved) {
                err.should.be.an.instanceOf(Error)
                done()
            });
        });

        it('if timeout is < 0, resolution will never timeout', function (done) {
            tree.register('dep6', dep6)
            tree._timeout = 0

            tree.resolve(function (err, resolved) {
                resolved.dep6.should.equal(6)
                done()
            });
        });

        it('_asyncConstant can be changed on the tree object', function (done) {
            tree._asyncConstant = 'next'
            tree.register('dep8', dep8)

            tree.resolve(function (err, resolved) {
                resolved.dep8.should.equal(8)
                done()
            });
        });

        it('will not continue to resolve dependencies if it breaks', function (done) {
            var gotCalled = false;
            tree.register('dep7', dep7);
            tree.register('dep8', function (dep7) {
                gotCalled = true;
            });

            tree.resolve(function (err, resolved) {
                err.should.be.an.instanceOf(Error)
                setTimeout(function () {
                    gotCalled.should.equal(false);
                    done()
                }, 1000)
            });
        });

        it('fires the error event if an error occurrs', function(done){
            tree.on('error', function(err){
                err.should.be.an.instanceOf(Error)
                done();
            });

            tree.register('dep7', dep7);
            tree.resolve()

        })
    });
});