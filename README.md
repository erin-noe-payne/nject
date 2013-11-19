#Nject

## 1.0 release - asynchronous resolution is introduced!

Nject is a simple nodejs library for handling dependency tree resolution and injection, inspired by angularjs's DI system. It 'magically' maps variable names to registered dependencies at time of injection. It supports synchronous or asynchronous resolution. Here's how it looks...

```javascript
var nject = require('nject');
var tree = new nject.Tree();

tree.constant('a', 7);
tree.constant('b', 9);

tree.register('product',
    /*
    variable names matter!
    a will be injected with nject's registered constant a
    b will be injected with constant b
    */
    function(a, b) {
        return a*b;
    });

tree.register('asyncProduct',
    /*
    variable names matter!
    a will be injected with nject's registered constant a
    b will be injected with constant b
    */
    function(a, _done) {
        setTimeout(function(){
          _done(null, a*5
        }, 1000)
    });

tree.register('printer',
    function(product, asyncProduct) {
        console.log(asyncProduct);
        console.log(product);
    });

tree.resolve(function(err, resolved){
  //all are true...
  resolved.a == 7
  resolved.b == 9
  resolved.product == 63
  resolved.asyncProduct == 45
  resolved.printer == undefined
});

//console logs:
//45
//63
```

##Api

### nject.Tree()

Constructs a new nject dependency tree.

#### tree.constant(key, value)

 - **key** *String* Registered dependency key.
 - **value** * The value that will be injected for any module that requires this constant as a dependency.

#### tree.prototype._timeout = 10000
*number* Represents the timeout expiration for asynchronously resolved modules in ms. Default to 10 seconds. If set to a value <= 0, resolution will never time out.

#### tree.prototype._asyncConstant = '_done'
*String* The injectable key for asynchronous support. By default a module resolves synchronously to its return value. However, if a function receives the _asyncConstant as an injected dependency then it is resolved asynchronously.


#### tree.register(key, fn, [opts])

 - **key** *String* Registered dependency name
 - **fn** *Function* The DI function for this module. **Variable names matter.** The variable name for each argument in the function should correspond to a dependency or constant that will be registered with nject. If not, nject will throw an error at resolution time. The function can be resolved synchronously or asynchronously, depending on if the _asyncConstant is injected.
   - Synchronous resolution: The module is resolved to the return value of the function. This will be injected in the case of other modules listing this module as a dependency.
   - Asynchronous resolution: If the module is injected with the _asyncConstant (by default '_done'), the module will be resolved asynchronously. `_done` is a callback function that conforms the nodejs standard, expecting to be called with an error and the resolution value: `_done(err, resolution)`. Unless there were errors, the module will be resolved to the passed resolution value.
 - [**opts**] *Object* || *String* Options object. If given a string, it is assumed to be the identifier option.
    - **opts.identifier** *String* Identifier string used in error messaging. In the case of errors resulting from naming conflicts, circular dependencies, or undeclared dependencies the identifier string will be referenced to give context to the error. This is useful because such an error will be thrown from nject's resolve() method, not from the original code of the injection function, so a stack trace may not always be clear.
    - **opts.aggregateOn** *String* Declares a new dependency with the argument as its name. The dependency will resolve to a js objects whose key / value pairs are the keys & resolutions of all dependencies that are aggregating on this name.

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

