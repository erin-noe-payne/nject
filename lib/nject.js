var _ = require('underscore');

var registry = {},
    resolved = {};

exports.registerResolved = function (key, val) {
    resolved[key] = val;
}

exports.register = function (key, mod, filename) {
    var dependencies = [];

    if (!_.isUndefined(registry[key])) {
        var msg = 'Naming conflict encountered. Attempting to register two dependencies with the same name from files: \n' +
            '  ' + registry[key].filename + '\n' +
            '  ' + filename + '\n' +
            'Please resolve this conflict before you run again.'
        throw new Error(msg)
    }

    if (!_.isFunction(mod)) {
        throw new Error('Cannot register non-function for dependency injection: '+filename);
    }
    var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
    var FN_ARG_SPLIT = /,/;
    var FN_ARG = /^\s*(\S+?)\s*$/;
    var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

    var fn = mod,
        fnText,
        argDecl;

    var moduleDependencies = [];
    fnText = fn.toString().replace(STRIP_COMMENTS, '');
    argDecl = fnText.match(FN_ARGS);
    dependencies = argDecl[1].split(FN_ARG_SPLIT)
    dependencies = _.invoke(dependencies, 'trim');

    registry[key] = {
        dependencies:dependencies,
        filename:filename,
        fn:mod
    };
}

exports.resolve = function () {
    var resolutionOrder = _.keys(resolved),
        unresolved = _.clone(registry);

    //1: check for dependencies w/o registered key
    var allDependencies = _.chain(registry).values().pluck('dependencies').flatten().value();
    var allRegistered = _.union(_.keys(registry), _.keys(resolved));
    var unregisteredDependencies = _.difference(allDependencies, allRegistered);
    if (unregisteredDependencies.length > 0) {
        var report = {};

        _.each(unregisteredDependencies, function (dep) {
            var violaters = _.filter(registry, function (item) {
                return _.contains(item.dependencies, dep);
            });

            report[dep] = _.pluck(violaters, 'filename');
        });

        var msg = 'Cannot resolve the following dependencies: \n'
        _.each(report, function (file, dep) {
            msg += '  ' + dep + ' in ' + file;
        });

        throw new Error(msg);
    }

    function pushToResolveOrder() {
        _.each(unresolved, function (item, key) {
            if (_.difference(item.dependencies, resolutionOrder).length == 0) {
                resolutionOrder.push(key);
                delete unresolved[key];
            }
        })
    }


    var prevLength = -100;
    var nextLength = resolutionOrder.length;
    while (nextLength > prevLength) {
        //stall out if we are not continuing to resolve dependencies
        pushToResolveOrder()
        prevLength = nextLength;
        nextLength = resolutionOrder.length;
    }

    var expectLength = _.keys(registry).length + _.keys(resolved).length
    if (resolutionOrder.length < expectLength) {
        var msg = 'Circular dependency detected! Please check the following files to correct the problem: \n ';
        _.each(unresolved, function (item) {
            msg += '  ' + item.filename + '\n';
        });

        throw new Error(msg);
    }

    _.each(resolutionOrder, function (key) {
        if(resolved[key]){
            return;
        }
        var dependencies = registry[key].dependencies;
        var resolvedDependencies = []
        _.each(dependencies, function(dep) {
            resolvedDependencies.push(resolved[dep]);
        })

        resolved[key] = registry[key].fn.apply(undefined, resolvedDependencies);
    });
}


exports.reset = function () {
    registry = {};
    resolved = {};
}