#Nject

Nject is a simple nodejs library for handling dependency tree resolution and injection, inspired by angularjs's DI system. It 'magically' maps variable names to registered dependencies at time of injection. Here's how it looks...

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

tree.register('printer',
    function(product) {
        console.log(product);
    });

tree.resolve();
//54

```

##Api

### nject.Tree()

Constructs a new nject dependency tree.

#### tree.constant(key, value)

 - **key** *String* Registered dependency key.
 - **value** * The value that will be injected for any module that requires this constant as a dependency.

#### tree.register(key, fn, [opts])

 - **key** *String* Registered dependency name
 - **fn** *Function* The DI function for this module. **Variable names matter.** The variable name for each argument in the function should correspond to a dependency or constant that will be registered with nject. If not, nject will throw an error at resolution time. The return value of the function is what will be injected in the case of other modules listing this module as a dependency.
 - [**opts**] *Object* || *String* Options object. If given a string, it is assumed to be the identified option.
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

 #### tree.resolve()

 - Resolves the dependency tree and invokes the registered functions in the order needed to make sure each function gets all dependencies needed.
