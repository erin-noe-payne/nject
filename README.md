#Nject

Nject is a simple dependency injector for nodejs.  It is designed to support dependency injection in nodejs without patching require in any way, and is inspired by angular.js's dependency injection system. It 'magically' maps variable names to registered dependencies at time of injection. Here's how it looks...

```javascript
//hello.js

module.exports = function(){
  return "hello";
}
```

```javascript
//world.js

module.exports = function(){
  return "world";
}
```

```javascript
//myModule.js
var hello,
    world;


exports.$inject = function($hello, $world){
  hello = $hello;
  world = $world;
}

exports.speak = function(){
  console.log( hello()+' '+world() );
}
```

```javascript
var nject = require('nject'),
    myModule = require('./myModule');

nject.config({
  process: ['./myModule'],
  dependencies: {
    '$hello':'./hello',
    '$world':'./world'
  },
  baseDir: __dirname
})

myModule.speak() //"hello world"
```

##Api

### nject.config(cfg, [baseDir])
 - cfg.process Array A list of file names that should be processed and injected. Any directories given will be recursively walked. When walking a directory, nject will ignore any node_modules directory and its children, any non-requirable javascript file, or any module that does not have an $inject function on the exports.
 - cfg.dependencies Object A list of key value pairs mapping variable names to modules that will be injected at time of processing.
 - cfg.baseDir String Fully qualified path that all other paths (those from process / dependencies will be resolved against. In most cases this will just be __dirname
 - [baseDir] String Exactly the same as cfg.baseDir. nject.config allows you to hand baseDir as a second argument for convenience in case you wish to put your nject configuration into a separate json file, in which case you would not cfg.baseDir hardcoded into the json.

##Nject-Enabling your modules

 - To enable your module for Nject's dependency injection, you need to add an $inject method to the module's exports. This method will take any number of arguments which are the dependencies to be injected.

```javascript
//myModule
var dep1,
    dep2

exports.$inject = function($dep1, $dep2) {
  dep1 = $dep1;
  dep2 = $dep2;
}

exports.doStuff = function(){...}
exports.doOtherStuff = function(){...}
```

 - **The argument names in the $inject method matter.** Nject parses the arguments of your $inject method. If your inject method taks $dep1 as an argument, then you must register $dep1 as a dependency in nject.config. If you have not registered a dependency, then $inject will be invoked with undefined for the unrecognized dependencies.

```javascript
nject.config({
  process:['./myModule'],
  dependencies:{
    '$dep1': './dependency1'
  }
}, __dirname);

//mymodule.$inject(require('./dependency1'), undefined)
```

 - You should run nject.config BEFORE you use your modules.  Dependency injection occurs at the time that you call nject.config(), so it should happen very early in your application's lifecycle. If you try to use your module before its dependencies are injected, it's going to have issues!

## Random stuff

### Nested dependencies?

No problem.  Because Nject simply hands references between your modules, dependency trees or circular dependencies are not an issue *as long as you do injection before you use your modules*. 

### Why all the dollar signs? 

For convention. The dollar sign on the $inject method is 1) consistent with angular js and 2) hopefully prevents conflicts on your modules. In injected variables, the dollar signs are not required and as long as your `exports.$inject(...)` arguments match your registered dependencies you are good to go. However as a convention, `$variableName` allows you to easily recognize injected variables.

### My module exports a function, not an object.

That's fine. It ends up being slightly less pretty since you will have to attach your $inject method after `module.exports = ...`

```javascript
var dep1;

module.exports = function(){
  //...
}

module.exports.$inject = function($dep1){
  dep1 = $dep1;  
}
```

### Defaults 

If you want functional defaults, or are comfortable with hardwiring your dependencies in production, you can actually skip nject's config altogether for production, and just use DI for testing.

```jasvascript
var dep1 = require('./dependency1);

exports.$inject = function($dep1){
  dep1 = $dep1;
}
```

You now have the ability to do DI, but if you never run `nject.config()` your module is still functional.

### Testing

How do I take advantage of Nject for testing? Either...

 - Use a custom nject.config() as part of your testing setup, registering mock objects for your dependencies or...

```javascript
//as part of testing spec setup...

nject.config({
  process: ['./myModule'],
  dependencies: {
    '$hello': {/*mock object...*/},
    '$world': {/*mock object...*/}
  },
  baseDir: __dirname
})
```

 - Require and manually invoke $inject on your modules in tests.

```javascript
var myModule = require('./myModule');

describe('my module', function(){
  
  beforeEach(function(){
    myModule.$inject({/*mock object...*/}, {/*mock object...*/});
  });
  
  //...
  
})

```
