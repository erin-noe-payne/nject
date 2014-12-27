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
};

var Tree = function () {
  // tracks registered constants and dependencies
  this._registry = {};

  // tracks resolved dependencies
  this._resolved = {};

  // Initial state.  Should never return to this state once it transitions
  // to any other state.
  this._state = STATES.REGISTERING;
};

_.extend(Tree, EventEmitter);
_.extend(Tree.prototype, EventEmitter.prototype);

// indicates the name of the injectable constant that will make a module resolve asynchronously. Can be overridden
// on the prototype, or on an instance.
Tree.prototype._asyncConstant = '_done';
// time in ms before asynchronous resolution will fail with a timeout. Can be disabled by setting to <= 0
Tree.prototype._asyncTimeout = 10000;
// time in ms before asynchronous destroy handlers will fail with a timeout. Can be disabled by setting to <= 0
Tree.prototype._destroyTimeout = 10000;

/**
 * Registers the given value with the given @key name.  If the @key
 * is a plain object it will be traversed using the values as constants
 * and the keys as the name for each of the values.
 *
 * A constant dependency does not need to be resolved, the value that
 * will be injected into modules that depend on this value will be
 * provided unprocessed, and simply as the value passed to this method.
 *
 * @param key {String|Object} - name of the value or an object containing
 *                              many key/value pairs.
 * @param value {*} - the value to inject as parameter during resolution.
 * @returns {*} - this tree, allowing the further chaining.
 */
Tree.prototype.constant = function (key, value) {
  var self = this;

  if (self._state != STATES.REGISTERING) {
    return emitError(
      self, 'Cannot register a constant after tree resolution has begun.');
  }

  emitLog(self, LOG_LEVEL.INFO, "Registering constant: {0}", key);

  if (_.isObject(key)) {
    _.each(key, function (v, k) { self.constant(k, v); });

    return this; // Consistent return value type (chainable).
  }

  this._registry[key] = {
    dependencies: [],
    constant: value,
    identifier: key,
    isConstant: true,  // <= the constant value may it self be 'falsy'
    isAsync: false
  };

  return this;
};

/**
 * Extracts from the given function definition (.toString()) the
 * names of it's parameters to later match those parameters to
 * registered injectables.
 *
 * @param fn {Function} - A function definition to extract
 *    paramter names from.
 * @returns {Array[Strings]} - Names of parameters required by the
 *    given function, minus any empty values, which is to say,
 *    that if the parameter list is empty the array will be empty.
 */
Tree.prototype.findDependencies = function(fn) {
  var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
  var FN_ARG_SPLIT = /,/;
  var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

  var fnText = fn.toString().replace(STRIP_COMMENTS, '');
  var argDecl = fnText.match(FN_ARGS);
  var dependencies = argDecl[1].split(FN_ARG_SPLIT);

  return _.compact(_.invoke(dependencies, 'trim'));
};

/**
 * Registers a module, a function, whose arguments are dependencies that
 * need to be resolved and injected at resolution time.
 *
 * @param key {String} - name of dependency.
 *
 * @param fn {Function} - The DI function for this module. Variable names
 * matter. The variable name for each argument in the function should
 * correspond to a dependency or constant that will be registered with
 * nject.
 *
 * @param opts {String|Object} - registration options.  If a string, then it's
 * used as an identifier during error reporting where a stack trace from
 * within nject might be clear.  An object can declare the string value
 * as 'identifier', but also contain a property 'aggregateOn' that
 * informs inject to include the injectable as a value on a property of
 * the resulting resolved symbols with that given name as well it's
 * formal name given as key.
 *
 * @returns {*}
 */
Tree.prototype.register = function (key, fn, opts) {
  var self = this, msg;

  if (self._state == STATES.RESOLVING) {
    msg = 'Cannot register a module after tree resolution has begun.';
    return emitError(self, msg);
  }

  if (_.isObject(key)) {
    _.each(key, function(v, k) { self.register(k, v); });
    return this;
  }

  opts              = opts || {};
  var identifier    = opts.identifier || key,
      aggregateOn   = opts.aggregateOn,
      registry      = this._registry;

  if (_.isString(opts)) {
    identifier = opts;
  }

  if (this.isRegistered(key)) {
    msg =
      'Naming conflict encountered.' +
      ' Attempting to register two dependencies with the same name: \n' +
      '  ' + registry[key].identifier + '\n' +
      '  ' + identifier + '\n' +
      'Please resolve this conflict before you run again.';
    throw new Error(msg);
  }

  if (!_.isFunction(fn)) {
    throw new Error('Cannot register non-function for dependency injection: ' + identifier);
  }

  emitLog(self, LOG_LEVEL.INFO, "Registering injectable: {0}", key);

  var dependencies = this.findDependencies(fn);
  var isAsync      = _.contains(dependencies, this._asyncConstant);

  registry[key] = {
    dependencies : dependencies,
    identifier   : identifier,
    // By definition not a constant, but propery 'constant' could somewhere
    // be interpreted as the value of a given constant.
    isConstant   : false,
    fn           : fn,
    isAsync      : isAsync
  };

  if (aggregateOn) {
    if(!_.isArray(aggregateOn)) {
      aggregateOn = [aggregateOn]
    }
    _.each(aggregateOn, function(aggregateKey){

      var aggregator = registry[aggregateKey];
      if (_.isUndefined(aggregator)) {
        var aggregateFn = function () {
          var ret = {};
          _.each(_.toArray(arguments), function (injected, i) {
            var key = registry[aggregateKey].dependencies[i];
            ret[key] = injected;
          });

          return ret;
        };

        // The register function has been updated to return consistent types
        // and that type is the Tree, which makes the register call chainable.
        self.register(aggregateKey, aggregateFn, 'Aggregate for ' + key);
        aggregator = registry[aggregateKey];
      }
      aggregator.dependencies.push(key);

    })
  }

  return this;
};

/**
 * Determines if the given key is registered.
 *
 * @param key {String} - Name of a registered injectable.
 * @returns {boolean} - true iff the key has been registered.
 */
Tree.prototype.isRegistered = function (key) {
  return !!this._registry[key];
};

/**
 *
 * @param tree
 * @param registry
 * @returns {boolean}
 */
function hasRegisteredAllDependencies(tree, registry) {

  emitLog(tree, LOG_LEVEL.INFO, "Resolving Tree.");

  // Set state to resolving AFTER registering the async constant to avoid an error.
  tree._state = STATES.RESOLVING;

  emitLog(tree, LOG_LEVEL.INFO, "Checking for any unregistered dependencies");

  //1: check for modules that have dependencies that have not been registered
  var allDependencies           = _.chain(registry).values().pluck('dependencies').flatten().value();
  var allRegistered             = _.keys(registry);
  var unregisteredDependencies  = _.difference(allDependencies, allRegistered);

  emitLog(tree,
    LOG_LEVEL.INFO,
    "All dependencies count: {0}, all registered count: {1}, unregistered count: {2}",
    allDependencies.length,
    allRegistered.length,
    unregisteredDependencies.length);

  if (unregisteredDependencies.length > 0) {
    emitLog(tree,
      LOG_LEVEL.DEBUG,
      "Detected unregistered dependencies: {0}",
      unregisteredDependencies.length);
    emitError(tree, createUnregisteredMessage(registry, unregisteredDependencies));
    return false; // Don't continue (stop continuation).
  }

  return true;
};

function createUnregisteredMessage(registry, unregisteredDependencies) {

  var report = {};

  _.each(unregisteredDependencies, function (dep) {
    var violaters = _.filter(registry, function (item) {
      return _.contains(item.dependencies, dep);
    });

    report[dep] = _.pluck(violaters, 'identifier');
  });

  msg = 'Cannot resolve the following dependencies: \n';
  _.each(report, function (file, dep) {
    msg += '  ' + dep + ' in ' + file;
  });

  return msg;
};


function hasFoundAllDependencies(tree, registry) {
  var prevLength      = -1,
      resolutionOrder = [],
      nextLength      = resolutionOrder.length,
      unresolved      = _.clone(registry);

  // Loops at least once with the default values since 0 > -1; where
  // prevLength defaults to -1, and resolutionOrder defaults to 0.
  while (nextLength > prevLength) {
    // Stall out if we are not continuing to resolve dependencies.
    pushToResolveOrder(unresolved, resolutionOrder);
    prevLength = nextLength;
    nextLength = resolutionOrder.length;
  }

  function pushToResolveOrder(unresolvedDeps, resOrder) {
    _.each(unresolvedDeps, function (item, key) {
      if (_.difference(item.dependencies, resOrder).length == 0) {
        emitLog(tree, LOG_LEVEL.INFO, "Found all dependecies for module: {0}", key);
        resOrder.push(key);
        delete unresolvedDeps[key];
      }
    });
  };

  var expectLength = _.keys(registry).length;
  var hasFoundAll  = resolutionOrder.length >= expectLength

  if (!hasFoundAll) {
    /*
     * unresolved - here should be an object with key as the name of
     * the injected, and an object { dependencies: [] } of it's
     * required dependencies.
     */
    var circle = findCircularDependencies(unresolved);

    var msg = 'Circular dependency detected! Please check the following files to correct the problem: \n';

    // If circle is empty do you really have an issue?  If circle is
    // empty this message will be you a Circular dependency, but we
    // can't help you find it.
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

    emitError(tree, msg);
  }

  return hasFoundAll;
};

function canBeResolved(unresolved, resolved) {
  var toResolve = {};
  _.each(unresolved, function (item, key) {
    if (_.difference(item.dependencies, _.keys(resolved)).length == 0) {
      toResolve[key] = item;
      delete unresolved[key];
    }
  });
  return toResolve;
};

function registerAsyncPlaceholder(tree, registry, asyncName) {
  var async = _.findWhere(registry, {isAsync: true})
  if (async) {
    emitLog(tree, LOG_LEVEL.INFO,
      "Detected there exists async injectables." +
      "  Registering internal async callback." +
      "  Found: {0} as async.",
      async.identifier)
    tree.register(asyncName, function () { });
  }
}


Tree.prototype.resolve = function (callback) {

  emitLog(this, LOG_LEVEL.INFO, "Registration phase closed.");

  if (callback) {
    this.on('error', callback);
    this.on('resolved', callback);
  }

  // 0: Check if any of the registered modules are async; if so,
  // register the _done constant as a no-op to avoid errors where
  // the dependency goes unregistered.
  registerAsyncPlaceholder(this, this._registry, this._asyncConstant);

  if (!hasRegisteredAllDependencies(this, this._registry)) { return this; }

  // 2: Loops over the unresolved items looking for those that have
  // fully identified each of it's dependencies.
  if (!hasFoundAllDependencies(this, this._registry)) { return this; }

  // 3: Recursively loop over the unresolved list and push modules
  // into the resolution order list whose dependencies are already
  // in the resolution order list
  var unresolved    = _.clone(this._registry);
  var registrySize  = _.size(this._registry)

  doResolving(this, unresolved, this._resolved, registrySize, 1);
  return this;
}

function doResolving(self, unresolved, resolved, registrySize, level) {

  if (self._state == STATES.ERROR) {
    return emitLog(self, LOG_LEVEL.DEBUG,
      "Error detected.  Skipping unresolved: {0}, resolved: {1}, registry size: {2}",
      _.size(unresolved),
      _.size(resolved),
      registrySize)
 }

  var toResolve = canBeResolved(unresolved, resolved);

  emitLog(self, LOG_LEVEL.INFO,
    "Remaining items to resolve: {0}, recursion level: {1}",
    _.size(toResolve),
    level || "UNKNOWN")

  _.each(toResolve, function (mod, key) {
    var timeout, resolution;

    emitLog(self, LOG_LEVEL.INFO, "Resolving: {0}", key);

    if (self._asyncTimeout > 0) {
      timeout = setTimeout(function () {
        if (self._state == STATES.ERROR) {
          return emitLog(self, LOG_LEVEL.DEBUG,
            "Previous error detected.  Skipping timeout.  Resolution of {0}", key)
        }
        if (!resolved.hasOwnProperty(key)) {
          var message = 'Timeout.  Module \'{0}\' took longer then {1}ms to load.';
          emitError(self, message, key, self._asyncTimeout);
        }
      }, self._asyncTimeout);
    }

    var doneFn = function(err, resolution) {
      clearTimeout(timeout);
      if (self._state == STATES.ERROR) {
        return emitLog(self, LOG_LEVEL.DEBUG,
          "Previous error detected.  Skipping resolution of {0}", key)
      }
      if (err) {
        return emitError(self, err);
      }

      resolved[key] = resolution;

      // if there are outstanding unresolved functions, recursively run doResolving
      if (_.size(unresolved) > 0) {
        doResolving(self, unresolved, resolved, registrySize, level + 1);
      }
      // if all modules are resolved, execute callback - this can happen at most once
      else if (_.size(resolved) == registrySize && self._state == STATES.RESOLVING) {
        emitLog(self, LOG_LEVEL.INFO, 'Transitioning state to {0}', STATES.RESOLVED)
        self._state = STATES.RESOLVED;
        emitLog(self, LOG_LEVEL.INFO,
          'Tree resolution complete. Final module resolved: {0}.', key)
        return self.emit('resolved', null, resolved);
      } else {
        emitLog(self, LOG_LEVEL.DEBUG,
          'No further processing should be done.  Attached key: {0}.', key)
      }
    };

    // Updated to use a flag to denote a constant registered value, instead of the
    // constant itself, to prevent constants of 0, false, '', and undefined from
    // posing as 'falsy' here, when they should be resolved as constants.
    if (mod.isConstant) {
      resolution = mod.constant;
    } else {

      var resolvedDependencies = [];

      _.each(mod.dependencies, function (dep) {
        if (dep == self._asyncConstant) {
          resolvedDependencies.push(doneFn);
        } else {
          resolvedDependencies.push(resolved[dep]);
        }
      });

      try {
        emitLog(self, LOG_LEVEL.INFO,
          "Applying/resolving module: {0}", mod.identifier)
        resolution = mod.fn.apply(self, resolvedDependencies);
      } catch (ex) {
        emitLog(self, LOG_LEVEL.DEBUG,
          "Exception thrown during apply/resolution of module: {0}.\n[[{1}]]",
          mod.identifier,
          ex.toString()
        )
        throw ex;
      }
    }

    if (mod.isAsync) {
      // Resolves async methods via the above doneFn.
    } else {
      // Force asynchronous resolution even in the case of synchronously
      // resolving modules, so that a tree can have event handlers
      // registered after .resolve() has been called.
      setImmediate(doneFn, null, resolution);
    }
  });
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
    self.on('destroyed', done);
  }

  this.emit('destroy', function (err) {
    if(err) {
      emitError(self, err);
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
        emitError(self, 'Timeout on destroy');
        selfDestruct();
      }
    }, self._destroyTimeout);
  }

  function selfDestruct() {
    var destroyedListeners = self.listeners('destroyed');
    self.removeAllListeners();

    // re-initialize the object
    Tree.call(self);
    _.each(destroyedListeners, function(fn){
      fn.apply(self);
    });
  }
};

/*
  Utility functions
 */

/**
 * Expects a set of objects with remaining dependencies.  If an item
 * has zero dependencies then it should have been considered resolvable.
 *
 * @param unresolved - A non-empty object.
 * @returns {*}
 */
function findCircularDependencies(unresolved) {

  var first = _.find(unresolved, function () {
    return true;
  });

  if (!first) {
    return [];
  }

  /**
   * We've eliminated the possibility of first being null/undefined in the
   * previous test.  If first were either this function would throw an
   * exception.  (Because of the mod.dependencies access.)
   */
  var circle = walk(first, []);

  function walk(mod, path) {
    // This possibility should not truly be possible since by definition
    // a module with 0 dependecies is resolvable.
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
  };

  return circle;
}

function interpolate(str, obj) {
  return str.replace(/\{([^{}]*)\}/g,
    function (a, b) {
      var r = obj[b];
      return typeof r === 'string' || typeof r === 'number' ? r : a;
    });
};

var LOG_LEVEL = {
  INFO    : 'info',
  DEBUG   : 'debug',
  WARN    : 'warn'
};

/**
 * Consider 'supplant' so that we can do something like "message: {0} and {1}"
 * where the arguments are provided and spliced fr
 * @param tree
 * @param level
 * @param msg
 */
function emitLog(tree, level, msg) {
  if (!level) {
    return emitError(tree, "Cannot without level: " + level);
  }
  if (!_.isString(level)){
    return emitError(tree, "Cannot emit log with non-string level: " + JSON.stringify(level))
  }
  if (!_.has(LOG_LEVEL, (level || "").toUpperCase())) {
    return emitError(tree, "Cannot emit log unknown-level: " + level)
  }
  var args = _.toArray(arguments);
  if (args.length > 3) {
    msg = interpolate(msg, args.slice(3));
  }
  tree.emit(level, msg);
};

function emitError(tree, msg){
  tree._state = STATES.ERROR;
  var args = _.toArray(arguments);
  if(!(msg instanceof Error)){
    if (args.length > 2) {
      msg = interpolate(msg, args.slice(2));
    }
    msg = new Error(msg);
  }
  tree.emit('error', msg);
}

exports.Tree = Tree;
