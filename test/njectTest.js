var _ = require('lodash'),
  nject = require('../'),
  chai = require('chai'),
  sinon = require('sinon'),
  sinonChai = require('sinon-chai')
expect = chai.expect;

chai.use(sinonChai);

describe('nject', function () {

  var tree;

  var config = {
    db     : 'mongodb://user:password@server:123456',
    timeout: 1000
  };

  var stats = {
    a: 1,
    b: 2
  };

  var dep0Args = false;
  var dep0 = function () {
    dep0Args = arguments;
    return 0;
  };

  var dep1Args = false;
  var dep1 = function (config) {
    dep1Args = arguments;
    return 1;
  };

  var dep2Args = false;
  var dep2 = function (config, stats) {
    dep2Args = arguments;
    return 2;
  };

  var dep3Args = false;
  var dep3 = function (dep2, dep1, stats) {
    dep3Args = arguments;
    return dep1 + dep2;
  };

  var dep4Args = false;
  var dep4 = function (dep3) {
    dep4Args = arguments;
    return 4;
  };

  var dep5Args = false;
  var dep5 = () => {
    dep5Args = arguments;
    return 5;
  };

  var dep6Args = false;
  var dep6 = dep3 => {
    dep6Args = arguments;
    return 6;
  };

  var dep7Args = false;
  var dep7 = (dep3) => {
    dep7Args = arguments;
    return 7;
  };

  var dep8Args = false;
  var dep8 = (dep3, dep4) => {
    dep8Args = arguments;
    return 8;
  };



  var badDep = function (asdf) {
  };
  var circ1 = function (circ2) {
  };
  var circ2 = function (circ1) {
  };
  var blocked1 = function (circ1) {
  };

  beforeEach(function () {
    dep1Args = dep2Args = dep3Args = dep4Args = null;
    tree = new nject.Tree();
  });

  describe('constant', function () {
    it('registers a constant value', function () {
      tree.constant('config', config);
      expect(tree._registry.config).to.exist;
      expect(tree._registry.config.value).to.equal(config);
    });

    it('the registered constant should have no dependencies', function () {
      tree.constant('config', config);
      expect(tree._registry.config.dependencies).to.eql([])
    });

    it('given an object, registers each key value pair as a constant', function () {
      var constants = {
        config: config,
        stats : stats
      };

      tree.constant(constants);
      expect(tree._registry.config).to.exist;
      expect(tree._registry.config.value).to.equal(config);
      expect(tree._registry.stats).to.exist;
      expect(tree._registry.stats.value).to.equal(stats);
    });
  });

  describe('register', function () {

    it('adds the given function to the registry', function () {
      tree.register('dep1', dep1);
      expect(tree._registry.dep1).to.exist;
      expect(tree._registry.dep1.value).to.equal(dep1);
    });

    it('parses the function\'s arguments as dependencies', function () {
      tree.register('dep0', dep0);
      tree.register('dep1', dep1);
      tree.register('dep2', dep2);

      expect(tree._registry.dep0.dependencies).to.eql([]);
      expect(tree._registry.dep1.dependencies).to.eql(['config']);
      expect(tree._registry.dep2.dependencies).to.eql(['config', 'stats']);
    });

    it('parses arrow functions and registers arguments as dependencies' , function () {
      tree.register('dep5', dep5);
      tree.register('dep6', dep6);
      tree.register('dep7', dep7);
      tree.register('dep8', dep8);

      expect(tree._registry.dep5.dependencies).to.eql([]);
      expect(tree._registry.dep6.dependencies).to.eql(['dep3']);
      expect(tree._registry.dep7.dependencies).to.eql(['dep3']);
      expect(tree._registry.dep8.dependencies).to.eql(['dep3', 'dep4']);
    });

    it('given an object, registers each key value pair as a constant', function () {
      var fns = {
        dep1: dep1,
        dep2: dep2
      };

      tree.register(fns);
      expect(tree._registry.dep1).to.exist;
      expect(tree._registry.dep1.value).to.equal(dep1);
      expect(tree._registry.dep2).to.exist;
      expect(tree._registry.dep2.value).to.equal(dep2);
    });

    it('Overwrites with a new value on naming collision', function () {
      tree.register('dep1', dep1);
      tree.register('dep1', dep2);

      expect(tree._registry.dep1.value).to.equal(dep2);
    });
  });

  describe('isRegistered', function () {

    it('returns true for a registered constant', function () {
      tree.constant('test', 7);
      expect(tree.isRegistered('test')).to.be.true;
    });

    it('returns true for a registered dependency', function () {
      tree.register('test', function () {
        return 7;
      });
      expect(tree.isRegistered('test')).to.be.true;
    });

    it('returns false for an unregistered key', function () {
      expect(tree.isRegistered('test')).to.be.false;
    });

    it('should return true if the registered key is a constant with value of false', function () {
      tree.constant('falsy', false);
      expect(tree.isRegistered('falsy')).to.be.true;
    });
  });

  describe('resolve', function () {
    beforeEach(function () {
      tree.constant('config', config);
      tree.constant('stats', stats);
      tree.register('dep0', dep0);
      tree.register('dep1', dep1);
      tree.register('dep2', dep2);
      tree.register('dep3', dep3);
      tree.register('dep4', dep4);
    })

    it('the tree is an event emitter', function () {
      expect(tree.on).to.exist;
      expect(tree.on).to.be.a('function');
    });

    it('should throw an error if given a registration key that does not exist', function () {
      function resolveUnregistered() {
        tree.resolve('asdf');
      }

      expect(resolveUnregistered).to.throw('Detected unregistered dependency `asdf`');
    });

    it('should return the resolved value if given a registration key', function () {
      expect(tree.resolve('config')).to.equal(config);
    });

    it('should return the entire resolved tree if given no arguments', function () {
      expect(tree.resolve()).to.eql({
        config: config,
        stats : stats,
        dep0  : 0,
        dep1  : 1,
        dep2  : 2,
        dep3  : 3,
        dep4  : 4
      });
    });

    it('should not resolve dependencies that are not on the path of given injectable', function () {
      var spy = sinon.spy()
      tree.register('blah', function () {
        spy()
      })

      tree.resolve('dep4');
      expect(spy).to.not.have.been.called
    });
    it('should not invoke a factory function more than once when it is resolved', function () {
      var spy = sinon.spy()
      tree.register('blah', function () {
        spy()
      })

      tree.resolve('blah');
      tree.resolve('blah');
      expect(spy).to.have.been.calledOnce
    });

    it('should not invoke a factory function more than once when it is a dependency', function () {
      var spy = sinon.spy()
      tree.register('blah', function () {
        spy()
      })
      tree.register('blah1', function (blah) {
      })
      tree.register('blah2', function (blah) {
      })

      tree.resolve('blah');
      tree.resolve('blah1');
      tree.resolve('blah2');
      tree.resolve();
      expect(spy).to.have.been.calledOnce
    });

    it('throws an error if you have an unregistered dependency', function () {
      tree.register('badDep', badDep);

      function doResolve() {
        tree.resolve();
      }

      expect(doResolve).to.throw('Detected unregistered dependency `asdf`')
    });

    it('resolves correctly with a single constant dependency', function () {
      tree.resolve('dep1')

      expect(dep1Args[0]).to.equal(config)
    });

    it('resolves correctly with two constant dependencies', function () {
      tree.resolve('dep2');

      expect(dep2Args[0]).to.equal(config);
      expect(dep2Args[1]).to.equal(stats);
    });

    it('works with 2 resolved dependencies', function () {
      tree.resolve('dep3');

      expect(dep3Args[0]).to.equal(2);
      expect(dep3Args[1]).to.equal(1);
      expect(dep3Args[2]).to.equal(stats);
    });

    it('works with complex dependency trees', function () {
      tree.resolve('dep4');

      expect(dep4Args[0]).to.equal(3);
    });

    it('throws a meaningful error on circular dependencies', function () {
      tree.register('circ1', circ1);
      tree.register('circ2', circ2);

      function doResolve() {
        tree.resolve('circ1');
      }

      expect(doResolve).to.throw('Circular dependency detected')
    });

    it('throws a meaningful error on dependents of circular dependencies', function () {
      tree.register('blocked1', blocked1);
      tree.register('circ1', circ1);
      tree.register('circ2', circ2);

      function doResolve() {
        tree.resolve('blocked1');
      }

      expect(doResolve).to.throw('Circular dependency detected')
    });

    describe('contexts', function(){

      it('should invoke a factory function with a event emitter context', function () {
        tree.register('test', function(){
          expect(this.on).to.exist;
          expect(this.on).to.be.a('function')
        });

        tree.resolve('test');
      });

      it('should invoke each factory with a separate context', function () {
        var ctx1,
          ctx2;

        tree.register('test1', function(){
          this.hello = 'world'
          ctx1 = this;
        });

        tree.register('test2', function(test1){
          this.hello = 'monde'
          ctx2 = this;
        });

        tree.resolve('test2')
        expect(ctx1).to.not.equal(ctx2)
        expect(ctx1.hello).to.equal('world')
        expect(ctx2.hello).to.equal('monde')
      });

      it('should allow for class-style dependency declaration and inherit from prototype', function () {

        function ctor(config, stats){
          this.name = 'OH YEAH'
          this.config = config
          this.stats = stats

          return this
        }

        ctor.prototype.calculate = function(){
          return this.stats.a + this.stats.b
        }

        tree.register('ctor', ctor);

        var instance = tree.resolve('ctor');
        expect(instance.stats).to.equal(stats);
        expect(instance.calculate).to.be.a('function');
        expect(instance.calculate()).to.equal(3);
        expect(instance.constructor).to.equal(ctor)
      });
    });

    describe('aggregation', function () {
      it('aggreregates correctly', function () {
        tree.register('dep1', dep1, {
          aggregateOn: 'numbers'
        });
        tree.register('dep2', dep2, {
          aggregateOn: 'numbers'
        });
        tree.register('dep3', function (numbers) {
          expect(numbers).to.eql({
            dep1:1,
            dep2:2
          })
        });

        tree.resolve('dep3')
      });

      it('supports multiple aggregation', function () {
        tree.register('dep1', dep1, {
          aggregateOn: ['numbers', 'stuff']
        });
        tree.register('dep2', dep2, {
          aggregateOn: ['junk', 'numbers']
        });
        tree.register('dep3', function (numbers, stuff, junk) {
          expect(numbers).to.eql({
            dep1:1,
            dep2:2
          })
          expect(stuff).to.eql({
            dep1:1
          })
          expect(junk).to.eql({
            dep2:2
          })
        });

        tree.resolve('dep3')
      });

      it('should allow you to resolve the aggregation key directly', function(){
        tree.register('dep1', dep1, {
          aggregateOn: ['numbers', 'stuff']
        });
        tree.register('dep2', dep2, {
          aggregateOn: ['junk', 'numbers']
        });

        expect(tree.resolve('numbers')).to.eql({
          dep1:1,
          dep2:2
        })
      })
    });

    describe('destruction', function(){
      var spy;

      beforeEach(function(){
        spy = sinon.spy();

        tree.register('destructoid', function(){
          this.on('destroy', spy);
        });
      });

      it('registering over a key should cause that key to be `destroy`ed', function(){
        sinon.stub(tree, 'destroy');

        tree.register('destructoid', function(){})

        expect(tree.destroy).to.have.been.called;
        expect(tree.destroy).to.have.been.calledWith('destructoid');

        tree.destroy.restore()
      });

      it('should not destroy the context of an unresolved dependency if it is `destroy`ed', function(){
        tree.destroy('destructoid', function(){})

        expect(spy).to.not.have.been.called
      });

      it('should destroy the context of a resolved dependency if it is `destroy`ed', function(){
        tree.resolve('destructoid');

        tree.destroy('destructoid');

        expect(spy).to.have.been.called
      });

      it('should destroy all contexts if the tree is destroyed', function(){
        tree.resolve();
        tree.destroy();

        expect(spy).to.have.been.calledOnce;
      });

      it('should destroy all parent dependencies of a `destroy`ed dependency', function(){
        var spies = []
        for(var i = 0; i< 5; i++) {
          spies.push(sinon.spy());
        }

        var d0 = function(){
          this.on('destroy', spies[0])
        }
        var d1 = function(d0){
          this.on('destroy', spies[1])
        }
        var d2 = function(d0){
          this.on('destroy', spies[2])
        }
        var d3 = function(d1){
          this.on('destroy', spies[3])
        }
        var d4 = function(d3){
          this.on('destroy', spies[4])
        }

        tree.register({
          d0:d0,
          d1:d1,
          d2:d2,
          d3:d3,
          d4:d4
        });

        tree.resolve();

        tree.destroy('d0');
        _.each(spies, function(spy){
          expect(spy).to.have.been.calledOnce;
        });
      });
    });

  });
});
