var nject       = require('../'),
    should      = require('should'),
    _           = require('lodash')

var logger = { log: console.log };
var opts   = { logger: logger   };


xdescribe('deep tree', function() {

//  beforeEach(function() {
//    nject.Tree.prototype._asyncTimeout    = 500;
//    nject.Tree.prototype._destroyTimeout  = 500;
//  });

  describe('registry =>', function() {

    it('should fail with properly reported async timeout on delay', function() {
      tree = new nject.Tree();
      tree.register('logger', function() { return console.log; });
      tree.register('delay', function(logger, _done) { });

      tree.resolve(function(err, res) {
        (!!err).should.be.true;
        err.should.be.an.instanceOf(Error);
        msg = err.toString();
        msg.should.include('delay');
      });
    });

    it('should report that tree resolution has begun (and looger is ready)', function() {
      tree = new nject.Tree();
      tree.register('logger', function() { return console.log; });
      tree.register('delay', function(logger, _done) { _done(null, {}); });

      var args = null;
      var opts = {
        logger : {
          log: function(params) {
            args = params;
          }
        }
      };

      tree.resolve(function(err, res) {
        (!!err).should.be.false;
        args.should.contain("Started tree resolution.");
      }, opts);
    });

  });

  describe('findDeps', function() {
    it('should find zero deps for no param fn', function() {
      var f = function() { };
      var tree = new nject.Tree();
      var deps = tree.findDependencies(f);
      (!!deps).should.be.true;
      deps.should.have.length(0);
    });

    it('should find zero deps for comments in params fn', function() {
      var f = function( // with some text in params
      ) { };
      var tree = new nject.Tree();
      var deps = tree.findDependencies(f);
      (!!deps).should.be.true;
      deps.should.have.length(0);
    });
  });

  describe('logging events =>', function() {
    it('should emit logs for registering constants', function(done) {
      var log = function(msg) {
        msg.should.include('yyy');
        done()
      }
      var tree = new nject.Tree();
      tree.on('info', log)
      tree.constant('yyy', 1);
    })

    it('should emit debug for unregistered dependency', function(done) {
      var calledLog = false
      var log = function(msg) {
        calledLog = true
      }
      var tree = new nject.Tree();
      tree.on('debug', log)
      tree.register('add', function(add, sub) { });
      tree.resolve(function(err, resolved) {
        err.should.exist
        calledLog.should.be.true
        done()
      })
    })

    it('should log all areas', function(done) {
      var tree = new nject.Tree();
      var res = {
        config    : false,
        _done     : false,
        sqlPool   : false,
        Database  : false,
        HomeCtrl  : false
      }

      tree.on('info', function(msg) {
        var keys = _.keys(res)
        var dep = _.find(keys, function(k) {
          return new RegExp(k + "$").test(msg);
        });

        if (!!dep) {
          res[dep] = true
        }
      });

      tree.on('info', function(msg) {
        console.log('info: ', msg)
      })
      tree.on('debug', function(msg) {
        console.log('debug: ', msg)
      })

      tree
        .register('sqlPool', function(config, _done) {
          setTimeout(function() {
            _done(null, {})
          }, 100)
        })
        .constant('config', {name:'config'})
        .register('HomeCtrl', function(Database, config) {
          return {};
        })
        .register('Database', function(sqlPool, _done) {
          _done(null, {})
        })
        .resolve(function(err, resolved) {
          (!err).should.be.true
          _.all(_.values(res), function(a) { return a; }).should.be.true
          done()
        })
    })

    it.skip("should run a 'false' constant with async resolution", function() {

    })

    it.skip("should not allow constant registration once an error is detected", function() {

    })

    it("should 'debug' log when an injectable throws an error during injection", function(done) {
      var cHasError = 1;
      var tree = new nject.Tree();
      tree.on('info', function(msg) {
        console.log('info: ', msg)
      })
      tree.on('debug', function(msg) {
        console.log('debug: ', msg)
      })

      var fn = function() {
        tree
          .register('y', function() { return 12; })
          .register('x', function() { return 11; })
          .register('d', function(x, y) { cHasError = 100; })
          .register('a', function(b, c, d, _done) { _done(null, true); })
          .register('b', function(x, y, _done) { _done(null, 32); })
          .register('c', function() {
            cHasError = 2;
            throw new Error("Purposefully throwing error in module 'c'")
          })
          .resolve(function(err, res) {
            var hasError = !!err
            hasError.should.be.true
            cHasError.should.equal(1)
            done()
          })
          .on('error', function(err) {
            console.log('error', err)
            (!err).should.be.true
            cHasError = 22;
            done();
          })
      }

      fn.should.throw(Error)
    })

    it("should have registered the async constant if no async injectables are registered", function() {
      var tree = new nject.Tree();
      tree.constant("un", void(0))
      tree.resolve(function(err, res) {
          (!err).should.be.true
        _.isUndefined(res.un).should.be.true
      })
    })
  })

});

