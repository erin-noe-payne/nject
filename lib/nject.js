var _ = require('lodash'),
    EventEmitter = require('events').EventEmitter;

/*
Describes the possible states of an nject tree
 */
var STATES = {
  // tree is in the registering state from the time it is initialize until resolution begins
  REGISTERING : 'REGISTERING',

  // tree enters resolving state once .resolve has been called
  RESOLVING : 'RESOLVING',

  // tree enters resolved state when resolution was completed successfully without error
  RESOLVED : 'RESOLVED',

  // the tree enters an error state if any error occurs during the resolution process
  ERROR : 'ERROR'
}

var Tree = function () {
  // tracks registered constants and dependencies
  this._registry = {};
  // tracks resolved dependencies
  this._resolved = {};

  this._state = STATES.REGISTERING
}

_.extend(Tree, EventEmitter)
_.extend(Tree.prototype, EventEmitter.prototype)

// indicates the name of the injectable constant that will make a module resolve asynchronously. Can be overridden
// on the prototype, or on an instance.
Tree.prototype._asyncConstant = '_done'
// time in ms before asynchronous resolution will fail with a timeout. Can be disabled by setting to <= 0
Tree.prototype._asyncTimeout = 10000
// time in ms before asynchronous destroy handlers will fail with a timeout. Can be disabled by setting to <= 0
Tree.prototype._destroyTimeout = 10000

/*
 Registers a constant - a dependency that does not need to be resolved
 key String name of the dependency
 value * the value that will be injected into modules that depend on this
 */
Tree.prototype.constant = function (key, value) {
  var self = this

  if(self._state == STATES.RESOLVING) {
    var msg = 'Cannot register a constant after tree resolution has begun.'
    return emitError(self, msg)
  }

  if (_.isObject(key)) {
    return _.each(key, function (v, k) {
      self.constant(k, v)
    });
  }
  this._registry[key] = {
    dependencies: [],
    constant: value,
    identifier: key,
    isAsync: false
  }
}

/*
Registers a module - a function whose arguments are dependencies that need to be resolved and injected at resolution time
key String name of dependency
fn Function The DI function for this module. Variable names matter. The variable name for each argument in the function should correspond to a dependency or constant that will be registered with nject.
opts String || Object registration options
 */
Tree.prototype.register = function (key, fn, opts) {
  var self = this;

  if(self._state == STATES.RESOLVING) {
    var msg = 'Cannot register a module after tree resolution has begun.'
    return emitError(self, msg)
  }

  if (_.isObject(key)) {
    return _.each(key, function (v, k) {
      self.register(k, v)
    });
  }

  var opts = opts || {},
      identifier = opts.identifier || key,
      aggregateOn = opts.aggregateOn,
      registry = this._registry;

  if (_.isString(opts)) {
    identifier = opts;
  }

  if (!_.isUndefined(registry[key])) {
    var msg = 'Naming conflict encountered. Attempting to register two dependencies with the same name: \n' +
        '  ' + registry[key].identifier + '\n' +
        '  ' + identifier + '\n' +
        'Please resolve this conflict before you run again.'
    throw new Error(msg)
  }

  if (!_.isFunction(fn)) {
    throw new Error('Cannot register non-function for dependency injection: ' + identifier);
  }

  var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
  var FN_ARG_SPLIT = /,/;
  var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

  var fn = fn,
      fnText,
      argDecl,
      dependencies,
      isAsync;

  fnText = fn.toString().replace(STRIP_COMMENTS, '');
  argDecl = fnText.match(FN_ARGS);
  dependencies = argDecl[1].split(FN_ARG_SPLIT);
  dependencies = _.invoke(dependencies, 'trim');
  if (dependencies[0] === '') {
    dependencies = [];
  }

  isAsync = _.contains(dependencies, this._asyncConstant)

  registry[key] = {
    dependencies: dependencies,
    identifier: identifier,
    fn: fn,
    isAsync: isAsync
  };

  if (aggregateOn) {
    var aggregate = registry[aggregateOn];
    if (_.isUndefined(aggregate)) {
      var aggregateFn = function () {
        var ret = {};
        _.each(_.toArray(arguments), function (injected, i) {
          var key = registry[aggregateOn].dependencies[i];
          ret[key] = injected;
        });

        return ret;
      }
      aggregate = this.register(aggregateOn, aggregateFn, 'Aggregate for ' + key);
    }
    aggregate.dependencies.push(key);
  }

  return registry[key];
}

Tree.prototype.isRegistered = function (key) {
  return this._registry[key] ? true : false;
}

Tree.prototype.resolve = function (callback) {
  var self = this,
      registry = this._registry,
      resolved = this._resolved,
      resolutionOrder = [],
      async,
      unresolved;

  if (callback) {
    self.on('error', callback);
    self.on('resolved', function (resolved) {
      callback.apply(self, [null, resolved]);
    });
  }

  //0: Check if any of the registered modules are async; if so, register the done constant as a no-op to avoid errors
  async = _.findWhere(registry, {isAsync: true});
  if (async) {
    this.register(this._asyncConstant, function () {
    });
  }

  // set state to resolving AFTER registering the async constant to avoid an error
  self._state = STATES.RESOLVING

  unresolved = _.clone(registry);

  //1: check for modules that have dependencies that have not been registered
  var allDependencies = _.chain(registry).values().pluck('dependencies').flatten().value(),
      allRegistered = _.keys(registry),
      unregisteredDependencies = _.difference(allDependencies, allRegistered);

  if (unregisteredDependencies.length > 0) {
    var report = {};

    _.each(unregisteredDependencies, function (dep) {
      var violaters = _.filter(registry, function (item) {
        return _.contains(item.dependencies, dep);
      });

      report[dep] = _.pluck(violaters, 'identifier');
    });

    var msg = 'Cannot resolve the following dependencies: \n'
    _.each(report, function (file, dep) {
      msg += '  ' + dep + ' in ' + file;
    });

    return emitError(self, msg)
  }

  // 2: Recursively loop over the unresolved list and push modules into the resolution order list
  // whose dependencies are already in the resolution order list
  var prevLength = -1,
      nextLength = resolutionOrder.length;
  while (nextLength > prevLength) {
    //stall out if we are not continuing to resolve dependencies
    pushToResolveOrder()
    prevLength = nextLength;
    nextLength = resolutionOrder.length;
  }

  function pushToResolveOrder() {
    _.each(unresolved, function (item, key) {
      if (_.difference(item.dependencies, resolutionOrder).length == 0) {
        resolutionOrder.push(key);
        delete unresolved[key];
      }
    })
  }

  var expectLength = _.keys(registry).length;
  if (resolutionOrder.length < expectLength) {
    var circle = findCircularDependencies(unresolved);

    var msg = 'Circular dependency detected! Please check the following files to correct the problem: \n';
    _.each(circle, function (item, index) {
      var first = index == 0;
      var last = index == (circle.length - 1);
      if (first || last) {
        msg += '\033[31m';
      }
      msg += '  -> ' + item + '\n';
      if (first || last) {
        msg += '\033[0m';
      }
    });

    return emitError(self, msg)
  }

  unresolved = _.clone(registry);

  function canBeResolved() {
    var toResolve = {}
    _.each(unresolved, function (item, key) {
      if (_.difference(item.dependencies, _.keys(resolved)).length == 0) {
        toResolve[key] = item
        delete unresolved[key]
      }
    })
    return toResolve
  }

  function doResolving() {
    if (self._state == STATES.ERROR) return;

    var toResolve = canBeResolved()
    _.each(toResolve, function (mod, key) {
      var timeout,
          resolution;

      if (self._asyncTimeout > 0) {
        timeout = setTimeout(function () {
          if (self._state == STATES.ERROR) return;

          //Throw a timeout error if
          if (!resolved.hasOwnProperty(key)) {
            emitError(self, msg)
          }
        }, self._asyncTimeout)
      }

      function doneFn(err, resolution) {
        clearTimeout(timeout)
        if (self._state == STATES.ERROR) return;

        if (err) {
          emitError(self, msg)
        }

        resolved[key] = resolution;

        // if there are outstanding unresolved functions, recursively run doResolving
        if (_.size(unresolved) > 0) {
          doResolving()
        }
        // if all modules are resolved, execute callback - this can happen at most once
        else if (_.size(resolved) == _.size(registry) && self._state == STATES.RESOLVING) {
          self._state = STATES.RESOLVED
          return self.emit('resolved', resolved)
        }
      }

      if (mod.constant) {
        resolution = mod.constant;
      } else {
        var dependencies = mod.dependencies;
        var resolvedDependencies = []
        _.each(dependencies, function (dep) {
          if (dep == self._asyncConstant) {
            resolvedDependencies.push(doneFn);
          } else {
            resolvedDependencies.push(resolved[dep]);
          }
        });

        resolution = mod.fn.apply(self, resolvedDependencies);
      }
      if (!mod.isAsync) {
        // force asynchronous resolution even in the case of synchronously resolving modules, so that a tree can have
        // event handlers registered after .resolve() has been called.
        setImmediate(doneFn, null, resolution)
      }
    })
  }

  doResolving();
  return this;
}

/*
Emits a destroy event so that modules can do any cleanup needed, then clears all event listeners and makes the tree
eligible for garbage collection.
 */
Tree.prototype.destroy = function (done) {
  var self = this,
      callbacksCalled = 0,
      callbacksExpected = _.reduce(this.listeners('destroy'), function (sum, fn) {
        return sum += fn.length > 0 ? 1 : 0;
      }, 0);

  if (done) {
    self.on('error', done);
    self.on('destroyed', done);
  }

  this.emit('destroy', function (err) {
    if (self._state == STATES.ERROR) return;
    if(err) {
      self._state = STATES.ERROR
      return self.emit('error', err)
    }
    callbacksCalled++;
    if (callbacksCalled == callbacksExpected) {
      selfDestruct();
    }
  });

  if(callbacksExpected == 0){
    selfDestruct();
  }
  else {
    setTimeout(function(){
      if (callbacksCalled != callbacksExpected && self._state != STATES.ERROR) {
        self._state = STATES.ERROR;
        self.emit('error', new Error('Timeout on destroy'))
      }
    }, self._destroyTimeout)
  }

  function selfDestruct() {
    var destroyedListeners = self.listeners('destroyed');
    self.removeAllListeners();

    // re-initialize the object
    Tree.call(self)

    _.each(destroyedListeners, function(fn){
      fn.apply(self);
    });
  }
}

/*
Utility functions
 */
function findCircularDependencies(unresolved) {
  var first = _.find(unresolved, function () {
    return true;
  })
  var circle = walk(first, []);

  function walk(mod, path) {
    //this is not a possible scenario im pretty sure
    if (mod.dependencies.length == 0) {
      return;
    }

    var lastElement = path.slice(-1)[0];
    var firstInstance = path.slice(0, -1).indexOf(lastElement);
    if (firstInstance >= 0) {
      //we have a circle!
      return path.slice(firstInstance);
    }

    else {
      path.push(mod.identifier);
      var nextMod = _.find(mod.dependencies, function (dep) {
        return !_.isUndefined(unresolved[dep]);
      });
      nextMod = unresolved[nextMod];

      return walk(nextMod, path);
    }
  }

  return circle;
}

function emitError(tree, msg){
  tree._state = STATES.ERROR
  tree.emit('error', new Error(msg))
}

exports.Tree = Tree;