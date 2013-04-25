var _ = require('underscore');

var Tree = function () {
    this.registry = {};
    this.resolved = {};
}

/*
 Registers a constant - a dependency that does not need to be resolved
 key String name of the dependency
 mod * the value that will be injected into modules that depend on this
 */
Tree.prototype.constant = function (key, mod) {
    this.registry[key] = {
        dependencies:[],
        constant:mod
    }
}

/*
 TODO: some ideas...
 add a done() constant to allow async dependencies
 */
Tree.prototype.register = function (key, fn, opts) {
    var opts = opts || {},
        identifier = opts.identifier || key,
        aggregateOn = opts.aggregateOn;

    if (_.isString(opts)) {
        identifier = opts;
    }

    var registry = this.registry;


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

    var dependencies = [],
        fn = fn,
        fnText,
        argDecl;

    fnText = fn.toString().replace(STRIP_COMMENTS, '');
    argDecl = fnText.match(FN_ARGS);
    dependencies = argDecl[1].split(FN_ARG_SPLIT);
    dependencies = _.invoke(dependencies, 'trim');
    if (dependencies[0] === '') {
        dependencies = [];
    }

    registry[key] = {
        dependencies:dependencies,
        identifier:identifier,
        fn:fn
    };

    if(aggregateOn) {
        var aggregate = registry[aggregateOn];
        if(_.isUndefined(aggregate)) {
            var aggregateFn = function(){
                var ret = {};
                _.each(_.toArray(arguments), function(injected, i){
                    var key = registry[aggregateOn].dependencies[i];
                    ret[key] = injected;
                });

                return ret;
            }
            aggregate = this.register(aggregateOn, aggregateFn, 'Aggregate for '+key);
        }
        aggregate.dependencies.push(key);
    }

    return registry[key];
}


Tree.prototype.resolve = function () {
    var registry = this.registry,
        resolved = this.resolved,
        resolutionOrder = [],
        unresolved = _.clone(registry);


    //1: check for dependencies w/o registered key
    var allDependencies = _.chain(registry).values().pluck('dependencies').flatten().value();
    var allRegistered = _.keys(registry);
    var unregisteredDependencies = _.difference(allDependencies, allRegistered);
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

        throw new Error(msg);
    }

    // 2: Recursively loop over the unresolved list and push modules into the resolution order list
    // whose dependencies are already in the resolution order list
    var prevLength = -1;
    var nextLength = resolutionOrder.length;
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

        throw new Error(msg);
    }

    _.each(resolutionOrder, function (key) {
        var mod = registry[key],
            resolution;
        if (mod.constant) {
            resolution = mod.constant;
        }
        else {
            var dependencies = registry[key].dependencies;
            var resolvedDependencies = []
            _.each(dependencies, function (dep) {
                resolvedDependencies.push(resolved[dep]);
            })

            resolution = mod.fn.apply(undefined, resolvedDependencies);
        }

        resolved[key] = resolution;
    });

    return resolved;
}

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

exports.Tree = Tree;