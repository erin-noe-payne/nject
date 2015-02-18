var nject = require('../'),
  should = require('should');

describe('nject', function () {

  var tree;

  var config = {
    db     : 'mongodb://user:password@server:123456',
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

  /* Helper method that make defaults the saved arguments to dep6Args. */
  var saveDepArgs = function(args) {
    dep6Args = args
  };

  /**
   * Generic curry of the dep timeout functions.  Partially applies
   * the 2 parameters.
   *
   * @param ms {Number} -
   *    how long to set a timeout, which when the timeout
   *    fires, will call _done, and so resolve.
   * @param saveArgs {Funciton} -
   *    A function to call that will save off the arugments of passed to
   *    the resolved function.  It defaults to saveDepArgs which saves
   *    arguments to dep6Args.
   * @returns {Function} -
   *    A function with a _done parameter that will delay calling this
   *    parameter after the specified timeout in ms.
   */
  var depTimeout = function(ms, saveArgs) {
    return function(_done) {
      saveArgs = saveArgs || saveDepArgs
      saveArgs(arguments)
      setTimeout(function () {
        _done(null, 6)
      }, ms || 11000)
    }
  };

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
      should.exist(tree._registry.config)
      tree._registry.config.fn.should.equal(config)
    });

    it('the registered constant should have no dependencies', function () {
      tree.constant('config', config);
      tree._registry.config.dependencies.should.eql([])
    });

    it('given an object, registers each key value pair as a constant', function () {
      var constants = {
        config: config,
        stats : stats
      }

      tree.constant(constants)
      should.exist(tree._registry.config)
      tree._registry.config.fn.should.equal(config)
      should.exist(tree._registry.stats)
      tree._registry.stats.fn.should.equal(stats)
    });
  });

  describe('register', function () {

    it('adds the given function to the registry', function () {
      tree.register('dep1', dep1)
      should.exist(tree._registry.dep1)
      tree._registry.dep1.fn.should.equal(dep1)
    });

    it('parses the function\'s arguments as dependencies', function () {
      tree.register('dep0', dep0)
      tree.register('dep1', dep1)
      tree.register('dep2', dep2)

      tree._registry.dep0.dependencies.should.eql([])
      tree._registry.dep1.dependencies.should.eql(['config'])
      tree._registry.dep2.dependencies.should.eql(['config', 'stats'])
    });

    it('given an object, registers each key value pair as a constant', function () {
      var fns = {
        dep1: dep1,
        dep2: dep2
      }

      tree.register(fns)
      should.exist(tree._registry.dep1)
      tree._registry.dep1.fn.should.equal(dep1)
      should.exist(tree._registry.dep2)
      tree._registry.dep2.fn.should.equal(dep2)
    });

    it('Overwrites with a new value on naming collision', function () {
      tree.register('dep1', dep1);
      tree.register('dep1', dep2);

      tree._registry.dep1.fn.should.equal(dep2)
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
    });

    it('should return true if the registered key is a constant with value of false', function() {
      tree.constant('falsy', false);
      tree.isRegistered('falsy').should.equal(true);
    })
  });

  describe.only('_getResolutionOrder', function(){
    beforeEach(function(){
      tree.constant('config', config)
      tree.constant('stats', stats)
      tree.register('dep0', dep0)
      tree.register('dep1', dep1)
      tree.register('dep2', dep2)
      tree.register('dep3', dep3)
      tree.register('dep4', dep4)
      tree.register('badDep', badDep)
      tree.register('circ1', circ1)
      tree.register('circ2', circ2)
      tree.register('blocked1', blocked1)
    })


    it('should do stuff', function(){
      tree.resolve('circ1')
    })

  })

  xdescribe('resolve', function () {
    it('returns the tree', function () {
      var returned = tree.resolve()
      returned.should.equal(tree);
    });

    it('the tree is an event emitter', function () {
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

    it('invokes registered dependencies with a this context of the tree', function (done) {
      var dep = function () {
        this.should.equal(tree)
        done()
      }

      tree.register('dep', dep, 'dep')
      tree.resolve();
    })

    it('fires the resolved event when resolution is completed successfully', function (done) {
      tree.on('resolved', function (resolved) {
        dep1Args.should.be.ok;
        dep1Args[0].should.equal(config);
        done();
      });

      tree.constant('config', config);
      tree.register('dep1', dep1, 'dep1');
      tree.resolve();
    });

    it('fires the resolved event even when set after calling resolve', function (done) {
      tree.constant('config', config);
      tree.register('dep1', dep1, 'dep1');
      tree.resolve();
      tree.on('resolved', function (resolved) {
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

    it('aggreregates correctly', function (done) {
      tree.constant('config', config);
      tree.constant('stats', stats);
      tree.register('dep1', dep1, {
        aggregateOn: 'numbers',
        identifier : 'dep1'
      });
      tree.register('dep2', dep2, {
        aggregateOn: 'numbers',
        identifier : 'dep2'
      });
      tree.register('dep3', function (numbers) {
        numbers.dep1.should.equal(1);
        numbers.dep2.should.equal(2);
      });

      tree.resolve(function (err, resolved) {
        done()
      });
    });

    it('supports multiple aggregation', function(done) {
      tree.constant('config', config);
      tree.constant('stats', stats);
      tree.register('dep1', dep1, {
        aggregateOn: ['numbers', 'stuff'],
        identifier : 'dep1'
      });
      tree.register('dep2', dep2, {
        aggregateOn: ['junk', 'numbers'],
        identifier : 'dep2'
      });
      tree.register('dep3', function (numbers, stuff, junk) {
        numbers.dep1.should.equal(1);
        numbers.dep2.should.equal(2);
        stuff.dep1.should.equal(1);
        should.not.exist(stuff.dep2);
        junk.dep2.should.equal(2);
        should.not.exist(junk.dep1);
      });

      tree.resolve(function (err, resolved) {
        done()
      });

    });

    it('emits an error event when registering a constant after resolution has begun', function (done) {
      tree.constant('config', config);
      tree.register('dep1', dep1);

      tree.resolve(function (err) {
        err.should.be.an.instanceOf(Error);
        done()
      });

      tree.constant('stats', stats)
    });

    it('emits an error event when registering a module after resolution has begun', function (done) {
      tree.constant('config', config);
      tree.constant('stats', stats);
      tree.register('dep1', dep1);

      tree.resolve(function (err) {
        err.should.be.an.instanceOf(Error)
        done()
      })

      tree.register('dep2', dep2)
    });
  });

  xdescribe('async resolution', function () {
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
      tree._asyncTimeout = 100
      tree.register('dep6', dep6)

      tree.resolve(function (err, resolved) {
        err.should.be.an.instanceOf(Error)
        done()
      });
    });

    it('_asyncTimeout can be changed on the tree object', function (done) {
      tree.register('dep5', dep5)
      tree._asyncTimeout = 10

      tree.resolve(function (err, resolved) {
        err.should.be.an.instanceOf(Error)
        done()
      });
    });

    /*
      This test should be written so that it makes sure no 'timeout' error
      is thrown, instead of just resolving after a 'really long time'
      because it proves only that it eventually resolves, not that nothing
      else has gone wrong.
     */
    it('if timeout is < 0, resolution will never timeout', function (done) {
      tree._asyncTimeout = 0
      tree.register('dep6', depTimeout(100))

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
      tree._asyncTimeout = 100
      tree.register('dep7', dep7);
      tree.register('dep8', function (dep7) {
        gotCalled = true;
      });

      // Simple gaurantee that the timeout exceeds the internal tree asyncTimeout interval
      var excessTimeout = tree._asyncTimeout + 100;

      tree.resolve(function (err, resolved) {
        err.should.be.an.instanceOf(Error)
        setTimeout(function () {
          gotCalled.should.equal(false);
          done()
        }, excessTimeout);
      });
    });

    it('fires the error event if an error occurrs', function (done) {
      tree.on('error', function (err) {
        err.should.be.an.instanceOf(Error)
        done();
      });

      tree.register('dep7', dep7);
      tree.resolve()

    });

    it('throws an error if a module attempts to register to the tree', function (done) {

      tree.register('badFunction', function () {
        this.constant('config', config)
      });

      tree.resolve(function (err) {
        err.should.be.an.instanceOf(Error)
        done()
      })
    })
  });

  xdescribe('destroy', function () {
    it('should emit a destroy event when invoked', function (done) {
      tree.on('destroy', function () {
        done();
      });

      tree.destroy();
    });

    it('should emit a destroyed event when destruction is complete', function (done) {
      tree.on('destroyed', done)
      tree.destroy()
    });

    it('should take a callback and register that callback as a listener for the destroyed event', function (done) {
      tree.destroy(done)
    });

    it('should emit an error event if any of the destroy handlers pass an error', function (done) {
      var err = new Error('HALP')
      tree.on('destroy', function (cb) {
        cb(err)
      });

      tree.on('error', function (e) {
        should.exist(e);
        e.should.equal(err);
        done();
      });

      tree.destroy();
    });


    it('should self destruct if there are no registered destroy event listeners', function (done) {
      tree.destroy(done)
    });

    it('should remove all event listeners when it self destructs', function (done) {
      tree.on('resolved', function () {
      })
      tree.on('resolved', function () {
      })
      tree.on('destroy', function () {
      })
      tree.on('destroyed', function () {
        tree.listeners('resolved').length.should.equal(0)
        tree.listeners('destroy').length.should.equal(0)
        tree.listeners('destroyed').length.should.equal(0)
        done();
      });

      tree.destroy();
    });

    it('should empty its registry when it self destructs', function (done) {
      tree.constant('a', 1)
      tree.constant('b', 2)
      tree.register('c', function (a, b) {

      });

      tree._registry.should.not.eql({})
      tree.destroy(function () {
        tree._registry.should.eql({})
        done();
      })
    });

    it('should empty its resolved object when it self destructs', function (done) {
      tree.constant('a', 1)
      tree.constant('b', 2)
      tree.register('c', function (a, b) {

      });

      tree.resolve(function () {
        tree._resolved.should.not.eql({})
        tree.destroy(function () {
          tree._resolved.should.eql({})
          done();
        });
      });
    });

    it('should wait for all destroy event listeners with arity > 0', function (done) {
      var i = 0
      tree.on('destroy', function (cb) {
        setTimeout(function () {
          i++;
          cb();
        }, 20)
      });
      tree.on('destroy', function (cb) {
        setTimeout(function () {
          i++;
          cb();
        }, 20)
      });
      tree.destroy(function () {
        i.should.equal(2)
        done()
      });
    });

    it('should not wait for any destroy event listeners with arity of 0', function (done) {
      var i = 0
      tree.on('destroy', function () {
        setTimeout(function () {
          i++;
        }, 20)
      });
      tree.on('destroy', function () {
        setTimeout(function () {
          i++;
        }, 20)
      });
      tree.destroy(function () {
        i.should.equal(0)
        done()
      });
    });

    it('should emit an error if a destroy takes too long to complete', function (done) {
      tree._destroyTimeout = 50

      tree.on('destroy', function (cb) {
      });

      tree.on('error', function(err){
        should.exist(err);
        err.should.be.an.Error
        done();
      });

      tree.destroy()
    });

    it('should complete destruction, even if a handler does not complete', function (done) {
      tree._destroyTimeout = 50

      tree.on('destroy', function (cb) {
      });

      tree.on('error', function(){})

      tree.destroy(function () {
        done();
      });
    });

    it('should throw an error event for each cleanup error, and destruction should still complete', function (done) {
      var i = 0;
      tree.on('destroy', function (cb) {
        cb(new Error('AHHH'))
      });

      tree.on('destroy', function (cb) {
        cb(new Error('OHNOES'))
      });

      tree.on('error', function () {
        i++
      });

      tree.destroy(function(){
        i.should.equal(2)
        done()
      });
    });
  });
});