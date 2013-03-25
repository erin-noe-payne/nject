var path = require('path'),
    fs = require('fs'),
    _ = require('underscore');

var dependencies = {};

exports.config = config;
exports.registerDependency = registerDependency;
exports.processTarget = processTarget;
exports.reset = reset;

function config(cfg, baseDir) {
    cfg = _.defaults(cfg, {baseDir:baseDir});

    registerDependency(cfg.dependencies, cfg.baseDir);
    processTarget(cfg.process, cfg.baseDir);
}

function registerDependency(name, mod, baseLocation) {
//allow registering multiple dependencies at once as an object
    if (_.isObject(name)) {
        return _.each(name, function (val, key) {
            registerDependency(key, val, mod)
        });
    }

    if(_.isString(mod)) {
        mod = require(path.resolve(baseLocation, mod));
    }

    dependencies[name] = mod;
}

function getDependencies(deps) {
    return deps.map(function (dependencyName) {
        return dependencies[dependencyName];
    });
}

function processTarget(target, baseDir) {
    if (_.isArray(target)) {
        return _.each(target, function (tar) {
            processTarget(tar, baseDir);
        });
    }

    var location = path.resolve(baseDir, target),
        mod;

    try {
        mod = require(location);
    } catch (err) {
    }

    if (mod) {
        if(_.isFunction(mod.$inject)){
            inject(mod);
        }
    } else {
        walkDirectory(location);
    }
}

function inject(mod) {
    var FN_ARGS = /^function\s*[^\(]*\(\s*([^\)]*)\)/m;
    var FN_ARG_SPLIT = /,/;
    var FN_ARG = /^\s*(\S+?)\s*$/;
    var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

    var fn = mod.$inject,
        fnText,
        argDecl;

    var moduleDependencies = [];
    fnText = fn.toString().replace(STRIP_COMMENTS, '');
    argDecl = fnText.match(FN_ARGS);
    argDecl[1].split(FN_ARG_SPLIT).forEach(function (arg) {
        arg.replace(FN_ARG, function (all, name) {
            moduleDependencies.push(name);
        });
    });

    var dependencies = getDependencies(moduleDependencies)
    fn.apply(mod, dependencies);
}

function walkDirectory(location) {
    var stat = fs.statSync(location);
    //if file is not a directory and is not requireable, we are skipping it
    if (!stat.isDirectory()) {
        return;
    }
    //we are not going to walk node_modules
    if (path.basename(location) == 'node_modules') {
        return;
    }

    var files = fs.readdirSync(location);
    _.each(files, function (file) {
        processTarget(path.resolve(location, file));
    });
}

function reset() {
    dependencies = {};
}