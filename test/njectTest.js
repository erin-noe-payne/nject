var nject = require('../'),
    should = require('should'),
    path = require('path');

describe('nject', function () {

    var tree;

    var config = {
        db:'mongodb://user:password@server:123456',
        timeout:1000
    }
    var stats = {
        a:1,
        b:2
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
        return dep1+dep2;
    }

    var dep4Args = false;
    var dep4 = function (dep3) {
        dep4Args = arguments;
        return 4;
    }

    var badDep = function(asdf) {
    }

    var circ1 = function(circ2) {}
    var circ2 = function(circ1) {}
    var blocked1 = function(circ1){}

    function reset() {
        dep1Args = false;
        dep2Args = false;
    }

    beforeEach(function(){
        tree = new nject.Tree();
    })

    describe('constant', function () {
        it('works', function () {
            tree.constant('config', config);
        });
    });

    describe('register', function () {

        it('Throws an error if you register the same name twice', function () {
            function doubleRegister() {
                tree.register('fn1', fn1);
                tree.register('fn1', fn1);
            }

            doubleRegister.should.throw();
        });

    });

    describe('resolve', function () {

        it('throws an error if you have an unregistered dependency', function(){
            tree.register('badDep', badDep);

            function doResolve(){
                tree.resolve();
            }

            doResolve.should.throw()
        })

        it('works with a stats dependency', function () {
            tree.constant('config', config);
            tree.register('dep1', dep1, 'dep1');
            tree.resolve();

            dep1Args.should.be.ok;
            dep1Args[0].should.equal(config);
        });

        it('works with 2 stats dependencies', function () {
            tree.constant('config', config);
            tree.constant('stats', stats);
            tree.register('dep1', dep1, 'dep1');
            tree.register('dep2', dep2, 'dep2');

            tree.resolve();

            dep1Args.should.be.ok;
            dep1Args[0].should.equal(config);
            dep2Args.should.be.ok;
            dep2Args[0].should.equal(config);
            dep2Args[1].should.equal(stats);
        });

        it('works with 2 resolved dependencies', function () {
            tree.constant('config', config);
            tree.constant('stats', stats);
            tree.register('dep1', dep1, 'dep1');
            tree.register('dep2', dep2, 'dep2');
            tree.register('dep3', dep3, 'dep3');

            tree.resolve();

            dep3Args.should.be.ok;
            dep3Args[0].should.equal(2);
            dep3Args[1].should.equal(1);
            dep3Args[2].should.equal(stats);
        });

        it('works with complex dependency trees', function () {
            tree.constant('config', config);
            tree.constant('stats', stats);
            tree.register('dep1', dep1, 'dep1');
            tree.register('dep2', dep2, 'dep2');
            tree.register('dep3', dep3, 'dep3');
            tree.register('dep4', dep4, 'dep4');


            tree.resolve();

            dep4Args.should.be.ok;
            dep4Args[0].should.equal(3);
        });

        it('throws an error on circular dependencies', function(){
            tree.register('blocked1', blocked1, 'blocked1');
            tree.register('circ1', circ1, 'circ1');
            tree.register('circ2', circ2, 'circ2');

            function doResolve(){
                tree.resolve();
            }

            doResolve.should.throw()
        });

        it('aggregates correctly', function(){
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
            tree.register('dep3', function(numbers){
                console.log(numbers);
                numbers.dep1.should.equal(1);
                numbers.dep2.should.equal(2);
            });

            tree.resolve();
        });

    });


});