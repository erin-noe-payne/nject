var _ = require('lodash'),
    EventEmitter = require('events').EventEmitter;

var Tree = function () {
  // tracks registered constants and dependencies
  this._registry = {};

  // tracks resolved dependencies
  this._resolved = {};
};

_.extend(Tree, EventEmitter);
_.extend(Tree.prototype, EventEmitter.prototype);

var LOG_LEVEL = {
  DEBUG   : 'debug',
  WARN    : 'warn'
};

function interpolate(str, args) {
  return str.replace(/\{([^{}]*)\}/g,
    function (a, b) {
      var r = args[b];
      return typeof r === 'string' || typeof r === 'number' ? r : JSON.stringify(r);
    });
};

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

/**
 * Extracts dependencies of a function from the variable names
 * of the function parameters.
 *
 * This is a copy / paste from angular.
 *
 * @param fn {Function} - A function definition to extract
 *    parameter names from.
 * @returns {Array[Strings]} - Names of parameters required by the
 *    given function, minus any empty values, which is to say,
 *    that if the parameter list is empty the array will be empty.
 */
Tree.prototype._findDependencies = function(fn) {
  var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
  var FN_ARG_SPLIT = /,/;
  var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

  var fnText = fn.toString().replace(STRIP_COMMENTS, '');
  var argDecl = fnText.match(FN_ARGS);
  var dependencies = argDecl[1].split(FN_ARG_SPLIT);

  return _.compact(_.invoke(dependencies, 'trim'));
};

/**
 * Registers a constant or constants with the given @key name.  If the @key
 * is a plain object it will be iterated over, using the key value pairs
 * for registration.
 *
 * A constant will not be resolved, and will be injected into
 * factories as-is.
 *
 * @param key {String|Object} -
 *  Name of dependency or an object containing key/value pairs to be registered.
 *
 * @param value {*} -
 *  The constant to register.
 *
 * @param opts {Object} -
 *  Options hash, passed to `register` function.
 *
 * @returns {*} -
 *  This tree, allowing the further chaining.
 */
Tree.prototype.constant = function (key, value, opts) {
  opts = _.extend({}, opts, {constant:true})

  this.register(key, value, opts)
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
 * @param opts {Object} -
 *  opts.aggregateOn {String|Array[String]} -
 *    Registers one or more aggregation objects on the tree. Aggregation objects
 *    are injectable dependencies whose key / value pairs are a roll-up of all
 *    dependencies that aggregate onto them.
 *  opts.constant {Boolean} -
 *    Indicates where the dependency should be registered as a constant or a
 *    factory function.
 *
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
    this.clear(key)
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

  // Deep with aggregators if they are defined
  if (aggregateOn) {
    // Normalize to an array
    if(!_.isArray(aggregateOn)) {
      aggregateOn = [aggregateOn];
    }

    _.each(aggregateOn, function(aggregateKey){
      var aggregator = registry[aggregateKey];
      if (_.isUndefined(aggregator)) {
        // An aggregator is a special factory which returns a roll-up of its aggregated
        // dependencies
        var aggregateFn = function () {
          var ret = {};
          _.each(_.toArray(arguments), function (injected, i) {
            var key = registry[aggregateKey].dependencies[i];
            ret[key] = injected;
          });

          return ret;
        };

        self.register(aggregateKey, aggregateFn);
        aggregator = registry[aggregateKey];
      }

      aggregator.dependencies.push(key);
    })
  }

  return this;
};

/**
 * Clears the registered and resolved state of a dependency.
 *
 * @param key {String} - Name of a registered injectable.
 */
Tree.prototype.clear = function (key) {
  var resolved = this._resolved[key]
  this._log(LOG_LEVEL.DEBUG, 'Clearing {0} from registry', key)

  if(resolved) {
    var context = resolved.context;

    this._log(LOG_LEVEL.DEBUG, 'Emitting destroy event on {0}', key)
    context.emit('destroy');
    delete this._resolved[key];
  }

  return this;
}

/**
 * Determines if the given key is registered.
 *
 * @param key {String} - Name of a registered injectable.
 * @returns {boolean} - true if the key has been registered.
 */
Tree.prototype.isRegistered = function (key) {
  return !!this._registry[key];
};

// Utility function for pretty-printing error paths
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
      _.extend(context, value.prototype);
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


Tree.prototype.destroy = function () {
  var self = this,
    keys = _.keys(this._registry)

  this._log(LOG_LEVEL.DEBUG, 'Destroying tree')

  _.each(keys, function(key){
    self.clear(key)
  });
};

exports.Tree = Tree;
