var _ = require('lodash'),
    EventEmitter = require('events').EventEmitter;

/*************************
  Log Level constants
 *************************/
var LOG_LEVEL = {
  DEBUG   : 'debug',
  WARN    : 'warn'
};

/*************************
  Utility functions
 *************************/
function interpolate(str, args) {
  return str.replace(/\{([^{}]*)\}/g,
    function (a, b) {
      var r = args[b];
      return typeof r === 'string' || typeof r === 'number' ? r : JSON.stringify(r);
    });
};

function buildPathErrorMsg(msg, path) {
  var msg = msg || ''
  msg += '\n    '

  _.each(path, function (item, index) {
    if(index != 0) {
      msg += ' -> '
    }
    msg+= item;
  });

  return msg;
}

/*
  Setup tree class
 */
var Tree = function () {
  // tracks registered constants and dependencies
  this._registry = {};

  // tracks resolved dependencies
  this._resolved = {};
};

_.extend(Tree, EventEmitter);
_.extend(Tree.prototype, EventEmitter.prototype);


/*************************
  Private methods
 *************************/
/*
 * Emits log events for debugging or warning information
 */
Tree.prototype._log = function(level, msg) {
  if(!_.contains(LOG_LEVEL, level)) {
    throw new Error('Cannot log on unknown level: '+level);
  }

  var args = _.toArray(arguments);
  if (args.length > 2) {
    msg = interpolate(msg, args.slice(2));
  }

  this.emit(level, msg);
}

/*
 * Extracts dependencies of a function from the variable names
 * of the function parameters using function.toString().
 *
 * This is a copy / paste from angular.
 */
Tree.prototype._findDependencies = function(fn) {
  var ARROW_ARG = /^([^\(]+?)=>/;
  var FN_ARGS = /^[^\(]*\(\s*([^\)]*)\)/m;
  var FN_ARG_SPLIT = /,/;
  var FN_ARG = /^\s*(_?)(\S+?)\1\s*$/;
  var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

  var fnText = fn.toString().replace(STRIP_COMMENTS, '');
  var argDecl = fnText.match(ARROW_ARG) || fnText.match(FN_ARGS);
  var dependencies = argDecl[1].split(FN_ARG_SPLIT);

  return _.compact(_.invoke(dependencies, 'trim'));
};


/*
 * Does the heavy lifting of resolving dependencies
 */
Tree.prototype._resolve = function (key, path) {
  var self = this,
    msg,
    config = this._registry[key],
    path = _.clone(path) || [];

  path.push(key)

  if(_.isUndefined(config)) {
    msg = buildPathErrorMsg('Detected unregistered dependency `'+key+'`', path)
    throw new Error(msg)
  }

  if(_.countBy(path)[key] > 1){
    msg = buildPathErrorMsg('Circular dependency detected! Please check the following dependencies to correct the problem', path)
    throw new Error(msg)
  }

  var value = config.value,
    isConstant = config.isConstant,
    dependencies = config.dependencies,
    resolvedDeps = [],
    resolvedValue,
    context = new EventEmitter();

  this._log(LOG_LEVEL.DEBUG, 'Resolving {0}', key)

  if(!this._resolved.hasOwnProperty(key)) {
    if(isConstant) {
      this._log(LOG_LEVEL.DEBUG, ' - {0} resolved as constant, result is cached', key)
      resolvedValue = value
    } else {
      this._log(LOG_LEVEL.DEBUG, ' - {0} depends on {1}', key, dependencies)

      // recursively get resolved dependencies
      _.each(dependencies, function(dependency){
        resolvedDeps.push(self._resolve(dependency, path))
      });

      this._log(LOG_LEVEL.DEBUG, ' - {0} factory function being invoked with dependencies {1}', key, dependencies);

      // extend the context with the prototype of the factory function (support classes as factories)
      context = Object.create(value.prototype || {});
      EventEmitter.call(context);
      _.extend(context, EventEmitter.prototype);
      resolvedValue = value.apply(context, resolvedDeps);

      // if the factory function does not return a value, set the value to the context object
      // (supports classes as factories)
      if(_.isUndefined(resolvedValue)){
        this._log(LOG_LEVEL.DEBUG, ' - {0} returns undefined, treating context as resolved value', key);
        resolvedValue = context
      }

      this._log(LOG_LEVEL.DEBUG, ' - {0} resolved as factory, result is cached', key);
    }

    this._resolved[key] = {
      context : context,
      value : resolvedValue
    };
  } else {
    this._log(LOG_LEVEL.DEBUG, ' - {0} has already been resolved, retrieving from cache', key);
  }

  return this._resolved[key].value
}


/*
 * Does the heavy lifting of destroying the provided dependency and anything that has that dependency
 * on its resolution path.
 */
Tree.prototype._destroy = function (key) {
  var self = this,
    resolved = this._resolved[key],
    dependsOnKey = []

  if(!resolved) {
    this._log(LOG_LEVEL.DEBUG, '{0} is not in resolved cache and does not need to be destroyed', key)
    return;
  } else {
    dependsOnKey = _(this._registry).map(function(config, depName){
      if(_.contains(config.dependencies, key)){
        return depName
      } else {
        return null
      }
    }).compact().valueOf();

    this._log(LOG_LEVEL.DEBUG, '{0} depends on {1} and must be destroyed.', dependsOnKey, key)
    _.each(dependsOnKey, function(depName){
      self._destroy(depName);
    });

    var context = resolved.context;
    this._log(LOG_LEVEL.DEBUG, 'Destroying {0} and clearing from resolved cache', key)
    context.emit('destroy');
    context.removeAllListeners('destroy');
    delete this._resolved[key];
  }
}


/*************************
 Public API
 *************************/

/**
 * Registers a constant or constants with the given @key name.  If the @key
 * is a plain object it will be iterated over, using the key value pairs
 * for registration.
 *
 * A constant will not be resolved, and will be injected into
 * factories as-is.
 *
 * This function just passes through to register with the `constant` option set to true
 *
 * @param key {String|Object} -
 *  Name of dependency or an object containing key/value pairs to be registered.
 *
 * @param value {*} -
 *  The constant to register.
 *
 * @param opts {Object} optional -
 *  Options hash, passed to `register` function.
 *
 * @returns {*} -
 *  This tree, allowing the further chaining.
 */
Tree.prototype.constant = function (key, value, opts) {
  opts = _.extend({}, opts, {constant:true})

  this.register(key, value, opts)
  return this
};

/**
 * Registers a dependency or dependencies with the given @key name. If the @key
 * is a plain object it will be iterated over, using the key value pairs
 * for registration.
 *
 * Unless specified as a constant in the opts, the registered dependency is assumed
 * to be a factory - a function whose arguments (variable names) declare its
 * dependencies. At time of resolution, the factory function will be invoked
 * with its dependencies.
 *
 * @param key {String|Object} -
 *  Name of dependency or an object containing key/value pairs to be registered.
 *
 * @param value {*|Function} -
 *  The dependency to register.
 *
 * @param opts {Object} optional -
 *  opts.aggregateOn {String|Array[String]} -
 *    Registers one or more aggregation objects on the tree. Aggregation objects
 *    are injectable dependencies whose key / value pairs are a roll-up of all
 *    dependencies that aggregate onto them.
 *  opts.constant {Boolean} -
 *    Indicates where the dependency should be registered as a constant or a
 *    factory function.
 *
 * @returns {*} -
 *  This tree, allowing the further chaining.
 */
Tree.prototype.register = function (key, value, opts) {
  var self = this,
    msg = null,
    registry      = this._registry,
    dependencies = [];

  // If key is an object, iterate over the key value pairs and register each
  if (_.isObject(key)) {
    // If the user is registering using object notation, value argument is optional
    if(_.isUndefined(opts)) {
      opts = value;
    }
    _.each(key, function(v, k) { self.register(k, v, opts); });
    return this;
  }

  // Normalize options
  opts              = opts || {};
  if(!_.isPlainObject(opts)) {
    throw new Error('Registration options must be a plain object');
  }
  var aggregateOn   = opts.aggregateOn,
      constant      = opts.constant || false;

  this._log(LOG_LEVEL.DEBUG, "Registering {0} as {1}", key, (constant ? 'constant' : 'factory'));

  // Allow for overriding of registered dependencies
  if (this.isRegistered(key)) {
    msg =
      'Naming conflict encountered on {0} \n' +
      'Overwriting registered dependency with new definition.'
    this._log(LOG_LEVEL.WARN, msg, key)
    this.destroy(key)
  }

  // If we are not registering a constant, check that the factory is a function
  // and get its dependencies
  if(!constant) {
    if (!_.isFunction(value)) {
      throw new Error('Cannot register non-function as factory: ' + key);
    }
    dependencies = this._findDependencies(value);
  }

  // Add new dependency to the registry
  registry[key] = {
    dependencies : dependencies,
    isConstant   : constant,
    value        : value
  };

  // Deal with aggregators if they are defined
  if (aggregateOn) {
    // Normalize to an array
    if(!_.isArray(aggregateOn)) {
      aggregateOn = [aggregateOn];
    }

    _.each(aggregateOn, function(aggregateKey){
      var aggregator = registry[aggregateKey];
      if (_.isUndefined(aggregator)) {
        // An aggregator is a special factory which returns a roll-up of its aggregated
        // dependencies as an object
        var aggregateFn = function () {
          var ret = {};
          _.each(_.toArray(arguments), function (injected, i) {
            var key = registry[aggregateKey].dependencies[i];
            ret[key] = injected;
          });

          return ret;
        };

        // Register the aggregator on the tree
        self.register(aggregateKey, aggregateFn);
        aggregator = registry[aggregateKey];
      }

      // Manually manage the dependencies of the aggregator
      aggregator.dependencies.push(key);
    })
  }

  return this;
};

/**
 * Determines if the given key is registered.
 *
 * @param key {String} -
 *  Name of a registered injectable.
 *
 * @returns {boolean} -
 *  True if the key has been registered.
 */
Tree.prototype.isRegistered = function (key) {
  return !!this._registry[key];
};

/**
 * Resolves one or more dependencies on the the tree. If a key is provided, the method will
 * return the resolved value of the dependency. If no key is provided, it will resolve
 * all dependencies on the tree, and return an object whose key value pairs are each
 * registered dependency and its resolved value.
 *
 * @param key {String} optional -
 *  The name of the dependency to resolve. If not provided, all dependencies on the tree
 *  will be resolved.
 *
 * @returns {*} -
 *  The resolved value or values.
 */
Tree.prototype.resolve = function (key) {
  var self = this;

  if(_.isUndefined(key)) {
    this._log(LOG_LEVEL.DEBUG, 'Beginning resolution for all dependencies')
    var o = {};
    _.each(_.keys(this._registry), function(key) {
      o[key] = self._resolve(key);
    })
    return o;
  } else {
    this._log(LOG_LEVEL.DEBUG, 'Beginning resolution for {0}', key)
    return this._resolve(key);
  }
}

/**
 *
 * Clears the resolved state of one or more dependencies on the tree. If the dependency has been resolved,
 * its resolved value is cleared from the cache and the destroy event is triggered on its context. When
 * a dependency is destroyed, anything that depended upon it will also be destroyed.
 *
 * @param key {String} optional -
 *  The registration key of the dependency. If not provided, all registered dependencies on the tree
 *  are destroyed.
 */
Tree.prototype.destroy = function (key) {
  var self = this
    keys = _.keys(this._registry);

  if(key) {
    this._log(LOG_LEVEL.DEBUG, 'Beginning destroy for {0}', key)
    this._destroy(key)
  } else {
    this._log(LOG_LEVEL.DEBUG, 'Destroying tree')
    _.each(keys, function(key){
      self._destroy(key)
    });
  }
};

exports.Tree = Tree;
