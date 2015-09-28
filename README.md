#Nject

Nject is a simple nodejs library for handling dependency tree resolution and injection, inspired by angularjs's DI system. It maps variable names to registered dependencies at time of injection. Here's how it looks...

```javascript
var nject = require('nject');
var tree = new nject.Tree();

tree.constant('a', 7);
tree.register('b', function(){
    return 9;
});

tree.register('sum',
    /*
    variable names matter!
    a will be injected with nject's registered constant a
    b will be injected with constant b
    */
    function(a, b) {
        return a+b;
    });

tree.resolve('sum') == 16
```

##Api

### new nject.Tree()

Constructs a new nject dependency tree.

#### tree.constant(key, value, [opts])

Registers a constant or constants with the given key name.  If the key is a plain object it will be iterated over, using the key value pairs for registration.

A constant will not be resolved, and will be injected into factories as-is.

This function just passes through to `register` with the constant option set to true

 - **key** *String* || *Object* If a string, key is the registered dependency key. If an object, tree.constant is invoked with each key / value pair of the object.
 - **value**  The value that will be injected for any module that requires this constant as a dependency. If the first argument was an object, will be processed as options.
 - **opts** See `register`

```javascript
tree.constant('a', 7)
tree.constant('a', 7', {aggregateOn: 'numbers'})
tree.constant({
    b: 8,
    c: 9
}, {aggregateOn: 'numbers'})
```

#### tree.register(key, value, [opts])

Registers a dependency or dependencies with the given key name. If the key is a plain object it will be iterated over, using the key value pairs for registration.

Unless specified as a constant in the opts, the registered dependency is assumed to be a factory - a function whose arguments (variable names) declare its dependencies. At time of resolution, the factory function will be invoked with its dependencies.

Nject will allow you to overwrite a registered dependency. Last write wins. If the dependency you are overwriting has already been resolved, it's resolved value is cleared from the cache, and its destroy event is emitted to allow for cleanup.

 - **key** *String* || *object* Name of dependency or an object containing key/value pairs to be registered.
 - **value** *Function* || * The registration value. If `opts.constant` is true, the resolved value will be the same as the registered value (the same as `tree.constant`). Otherwise, the argument is expected to be a factory function. This function will be invoked once, and its resolved value will be cached. **Variable names matter.** The variable name for each argument in the function should correspond to a dependency or constant that is be registered with the nject tree.
 - [**opts**] *Object* || *String* Options object. If given a string, it is assumed to be the identifier option.
    - **opts.constant** *Boolean* If true, indicates that the dependency should be registered as a constant.
    - **opts.aggregateOn** *String* || *[String]* Declares one or more new dependencies with the argument as its name. The dependency will resolve to a js objects whose key / value pairs are the keys & resolved values of all dependencies that are aggregating on this name. This is useful when you are dealing with a logical set of entities that you will often want to inject together, or to iterate over.

A few things to note:
 - If your factory function explicitly returns a value, that will be treated as the resolved value. Otherwise the function is new'd up. This means you can use a write a class where the constructor takes the injectables, and the resolved value will be an instance of that class, with the correct prototype and constructor reference.
 - All factory functions are invoked with the `this` context of a native nodejs event emitter object, which can be used to register for the 'destroy' event. You should take care not to overwrite the event emitter functions or undefined behavior may occur.

#### tree.isRegistered(key)

 - **key** *String* Registered dependency key.
 - returns *boolean* True / false if the key has been registered with the tree. 

#### tree.resolve([key])

Resolves the given key. If no key is provided, resolves all registered keys on the tree, and returns an object whose key / value pairs are each registered key and its resolved value.

When resolving a given value, the tree will resolve only those dependencies that are on the required path. All resolved values are cached - a factory function is never invoked more than once.

Resolve will throw an error if it encounters an unregistered dependency or circular dependencies on the resolution path.

 - [**key**] *String* Registered dependency key.
 - returns * Thre resolved value for the provided key. If a key was not provided, returns an object whose key / value pairs are each registered key and its resolved value.

### tree.destroy([key])

Clears the resolved value for the provided key from the cache and emits the `destroy` event on the context of the factory function. If no key is provided, invokes destroy for all registered keys.

Think of this as the inverse of `resolve`. When a dependency is destroyed, any other resolved value that depended on it is also destroyed. This cascades, so that anything that had the provided key on its resolution path will be destroyed.

 - [**key**] *String* Registered dependency key.

## Events

Tree is an event emitter, and supports events for debugging and logging. All standard actions (registration, resolution, etc) are synchronous, and these methods will throw errors as needed.

#### 'debug'

The tree will emit debug messages as it goes through the standard steps of registration and resolution. These messages can be useful in logging or diagnosing unexpected behavior especially in the resolution process.

#### 'warn'

The tree will emit warning messages when actions are taken which are legal, but may result in unexpected behavior. In particular, the tree emits a warning when a user registers a new dependency with the same name as an already registered dependency.

## Examples

### Understanding resolution

Given the following tree...

```javascript
tree = new nject.Tree()

// Register a configuration object
tree.constant('config', {
    dbUrl : 'localhost:27017'
});

// Register a 3rd party lib on the tree for DI
tree.constant('database', function(config){
    // m
});

tree.register('User', function(database){
    var User = {}
    // do some stuff...

    return User;
});

tree.register('Account', function(database){
    var Account = {}
    // do some other stuff...

    return Account;
});

tree.resolve('User');

tree.resolve('Account');

resolved = tree.resolve()
```

When we resolve User, the tree will also resolve database and config, which are dependencies on the resolution path, and their resolved values will be cached.  The tree will NOT resolve Account, because it was not a dependency of User.

When we next resolve Account, the tree will again walk the resolution path. In this case, it will not try to invoke the database factory again, but just pull the cached value.

When we finally resolve the entire tree with `tree.resolve()`, all dependencies have been resolved, and the tree will just pull cached values. The returned object `resolved` will have keys for each of the registered dependencies.

### Aggregation

You can use aggregation to group dependencies on a registration key so that they can be injected together.

```javascript
tree.register('app', function(){return express()});

tree.register('AuthenticationController', function(){/*...*/}, {aggregateOn : 'controllers'});
tree.register('UserController', function(){/*...*/}, {aggregateOn : 'controllers'});
tree.register('PostController', function(){/*...*/}, {aggregateOn : 'controllers'});

tree.register('Router', function(app, controllers){
    _.each(controllers, function(ctrl){
        app.use(ctrl);
    });
});
```

In this example, we have several controllers, that we are aggregating on the controllers key. This allows to inject a single dependency which rolls up all of the aggregated keys, and can be iterated over. Of course, the Router could simple require each controller individually, or we could write a controllers dependency that manually injects each controller and returns the roll up object. By using aggregation we save some effort and maintenance cost as controllers may be added or removed from the tree.

Note that the aggregation key is a valid dependency key, and it can be resolved directly:

```javacript
controllers = tree.resolve('controllers');
```

In addition, dependencies may be aggregated on multiple aggregation keys using an array. Extending the previous example:

```javascript
tree.register('app', function(){return express()});

tree.register('UserModel', function(){/*...*/}, {aggregateOn : ['models', 'User']});
tree.register('PostModel', function(){/*...*/}, {aggregateOn : ['models', 'Post']});

tree.register('AuthenticationController', function(){/*...*/}, {aggregateOn : 'controllers'});
tree.register('UserController', function(){/*...*/}, {aggregateOn : ['controllers', 'User']});
tree.register('PostController', function(){/*...*/}, {aggregateOn : ['controllers', 'Post']});

tree.register('Router', function(app, controllers){
    _.each(controllers, function(ctrl){
        app.use(ctrl);
    });
});

tree.resolve('controllers')
// resolves to the controllers objects

tree.resolve('User')
// resolves to the UserModel and UserController
```


### Using a class

In previous examples we have looked at factory functions that return an explicit value. However, factory functions are invoked is a constructor, and if they do not return an explicit value then the constructed object will be used.  This means you can use a javascript class as your dependency.

```javascript
// explicit return
tree.register('UserCtrl', function(database){

    var User = {
        get : function(id){
            database.find(id)
        }
        create : function(instance){
            database.create(instance)
        }
        update : function(instance){
            database.update(instance)
        }
        destroy : function(instance){
            database.destroy(instance)
        }
    }

    return User;

});


// using a class
var UserCtrl = function(database){
    this.database = database;
}
UserCtrl.prototype.get = function(id){
    this.database.find(id)
}
UserCtrl.prototype.create = function(instance){
    this.database.create(instance)
}
UserCtrl.prototype.update = function(instance){
    this.database.update(instance)
}
UserCtrl.prototype.destroy = function(instance){
    this.database.destroy(instance)
}

tree.register('UserCtrl', UserCtrl);
```

Ultimately these achieve the same thing - it's just a matter of preference. Especially if you use cofeescript, are looking forward to the es6 spec, or are more comfortable with DI patterns coming from Java, you may prefer the class syntax.

### Using destroy event for cleanup

Often you may find yourself writing a dependency that starts some persistent process or captures variables in closure - such as opening a database connection or setting an interval. These can be dangerous because they can cause your process to leak memory.

Especially during unit testing, where you may create and and destroy many instances of dependency, it is important that you cleanup correctly or you risk unexpected behavior.

That's what the destroy event is for!

```javascript
// ex1
tree.register('logger', function(){
    var interval = setInterval(function(){
        console.log('Im still alive!');
    });

    this.on('destroy', function(){
        clearInterval(interval);
    });
});

// ex2
var logger2 = function(){
    this.interval = setInterval(function(){
        console.log('Im still alive!');
    });

    this.on('destroy', function(){
        this.cleanup();
    })'
}

logger2.prototype.cleanup = function(){
    clearInterval(this.interval);
}
tree.register('logger2', logger2);

// ex3
tree.register('dbConnectionPool', function(db, config){
    var connections = db.createConnections(config.dbUrl);

    this.on('destroy', function(){
        db.closeConnections(connections);
    });
});
```

Here we have 3 examples of registered dependencies that need to do some sort of cleanup. Imagine if we were unit testing our logger:

```javascript

beforeEach(function(){
    tree.resolve('logger');
})

afterEach(function(){
    tree.destroy('logger');
});
```

If we do not destroy the logger in the afterEach block, or if the logger did not listen for the destroy event and clear its interval, then each successive test would leak another interval. After running 20 tests we would have 20 different intervals spamming the console.

Obviously the stakes are low with console.log. But if you are doing something more meaningful (and less obvious) in that interval, your tests can easily start to fail in unexpected ways.

The second example captures the same use case, but using the class syntax. Notice that although the factory is newed up, it is already an instance of EventEmitter, and you can still register for the 'destroy' event.

How do you know when the destroy event will be triggered?
 - The destroy event will only ever fire on a dependency that has been resolved. If we never resolve and cache dbConnectionPool, then we will never need to fire the destroy event.
 - Once it has been resolved, if I were to register a new dependency with the same name over top of dbConnectionPool, the cached value would be cleared *and the destroy event would fire*. This guarantees that overwriting a resolved value will result in graceful cleanup.
 - If you explicitly destroy the dependency using `tree.destroy('dbConnectionPool')` or the more broad `tree.destroy()`. This will cause the cached value to be cleared, and will fire the destroy event to force cleanup. Invoking the destroy method on a dependency that has never been resolved will have no effect.

## Changelog

### 2.0.1

 - Adds support for dependency detection and inject with es6 arrow functions

### 2.0.0

 - Drop support for asynchronous resolution. This has become an antipattern.
 - All resolution and destruction is now synchronous, not callback / event based.
 - Drop error events; tree now throws errors rather than emitting an error event, since all methods are synchronous.
 - Drop support for 'destroy' and 'destroyed' events on the tree itself, since destruction is now synchronous.
 - Drop lifecycle stages - tree may be resolved many times, modified, destroy, and resolved again.
 - Drop support for 'identifier' option - it is redundant with the registration key.
 - Allow dependencies to be registered with the same name using a last-write-wins policy.
 - Resolve and destroy methods now accept individual dependencies, rather than forcing you to act on the entire tree.
 - Resolution logic is simplified and should have better performance.
 - Improved in-code documentation and debug / warn messages.

### 1.3.1

 - Support multiple aggregateOn keys

### 1.3.0

 - Add logging events

### 1.2.0

 - Add support for destruction
 - Emit error events consistently

### 1.1.0

 - Add test coverage
 - Add doc improvements

### 1.0.0

 - Introduce asynch resolution

