#Nject

## 1.0 release - asynchronous resolution is introduced!

Nject is a simple nodejs library for handling dependency tree resolution and injection, inspired by angularjs's DI system. It 'magically' maps variable names to registered dependencies at time of injection. It supports synchronous or asynchronous resolution. Here's how it looks...

```javascript
var nject = require('nject');
var tree = new nject.Tree();

tree.constant('a', 7);
tree.constant('b', 9);

tree.register('sum',
    /*
    variable names matter!
    a will be injected with nject's registered constant a
    b will be injected with constant b
    */
    function(a, b) {
        return a+b;
    });

tree.register('asyncDifference',
    /*
    this module resolves asynchronously, because it is injected with the reserved word _done
    */
    function(a, b, _done) {
        setTimeout(function(){
          _done(b-a)
        }, 1000)
    });

tree.register('printer',
    function(sum, asyncDifference) {
        console.log(asyncDifference);
        console.log(sum);
    });

tree.resolve(function(err, resolved){
  //all are true...
  resolved.a == 7
  resolved.b == 9
  resolved.sum == 16
  resolved.asyncDifference == 2
  resolved.printer == undefined
});

// console logs from printer:
// 2
// 16
```

##Api

### nject.Tree()

Constructs a new nject dependency tree.

#### tree.prototype._timeout = 10000
*number* Represents the timeout expiration for asynchronously resolved modules in ms. Default to 10 seconds. If set to a value <= 0, resolution will never time out.

#### tree.prototype._asyncConstant = '_done'
*String* The injectable key for asynchronous support. By default a module resolves synchronously to its return value. However, if a function receives the _asyncConstant as an injected dependency then it is resolved asynchronously.

#### tree.constant(key, value)

 - **key** *String* || *object* If a string, key is the registered dependency key. If an object, tree.constant is invoked with each key / value pair of the object.
 - **value** * The value that will be injected for any module that requires this constant as a dependency.

 ```
 tree.constant('a', 7)
 tree.constant({
    b: 8,
    c: 9
 })
 ```

#### tree.register(key, fn, [opts])

 - **key** *String* || *object* If a string, key is the registered dependency key. If an object, tree.register is invoked with each key / value pair of the object. Note that if you use the object shorthand, you are not able to pass the 3rd opts argument, and optional values are set to defaults.
 - **fn** *Function* The DI function for this module. **Variable names matter.** The variable name for each argument in the function should correspond to a dependency or constant that will be registered with nject. If not, nject will throw an error at resolution time. The function can be resolved synchronously or asynchronously, depending on if the _asyncConstant is injected.
   - Synchronous resolution: The module is resolved to the return value of the function. This will be injected in the case of other modules listing this module as a dependency.
   - Asynchronous resolution: If the module is injected with the _asyncConstant (by default '_done'), the module will be resolved asynchronously. `_done` is a callback function that conforms the nodejs standard, expecting to be called with an error and the resolution value: `_done(err, resolution)`. Unless there were errors, the module will be resolved to the passed resolution value.
 - [**opts**] *Object* || *String* Options object. If given a string, it is assumed to be the identifier option.
    - **opts.identifier** *String* Identifier string used in error messaging. In the case of errors resulting from naming conflicts, circular dependencies, or undeclared dependencies the identifier string will be referenced to give context to the error. This is useful because such an error will be thrown from nject's resolve() method, not from the original code of the injection function, so a stack trace may not always be clear. When not specified, defaults to the registration key.
    - **opts.aggregateOn** *String* Declares a new dependency with the argument as its name. The dependency will resolve to a js objects whose key / value pairs are the keys & resolutions of all dependencies that are aggregating on this name. This is useful when you are dealing with a logical set of entities that you will often want to inject together, or to iterate over.

    ```javascript

    var tree = new nject.Tree();

    tree.register('Users', function(){
        return 'this is a users model';
    }, {aggregateOn: 'models'});
    tree.register('Accounts', function(){
        return 'this is an accounts model';
    }, {aggregateOn: 'models'});
    tree.register('demo', function(models){
        /*
        models == {
            Users: 'this is a users model',
            Accounts: 'this is an accounts model'
        }
        */
    });

    ```

#### tree.isRegistered(key)

 - **key** *String* Registered dependency key.
 - returns *boolean* True / false if the key has been registered with the tree. 

#### tree.resolve(callback)

Resolves the dependency tree and invokes the registered functions in the order needed to make sure each function gets all dependencies needed.
 - **callback** *Function* `function(err, resolved)` Callback function. err represent any error passed by the executing dependencies. If there were no errors, resolved is an object whose keys are the keys of regsitered dependencies, and whose values are their resolved values.

### Events

Tree is an event emitter, and supports the following events associated with resolution:

## error
`tree.on('error', function(err){})`
Occurs when there is an error resolving the dependency tree - generally because of a timeout or an error during asynchronous resolution of a dependency. Note that errors which block resolution from beginning, such as naming conflicts, undeclared dependencies, or circular dependencies will be thrown by the resolve method rather than emit this event.

## resolved
`tree.on('resolved', function(resolved){})`
Occurs when dependency tree resolution is complete. `resolved` is an object whose key / value pairs are the registered dependency keys and the resolved values of your tree.