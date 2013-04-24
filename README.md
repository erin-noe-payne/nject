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

### tree.constant(key, value)

 - **key** String registered dependency key
 - **value** * the value that will be injected for any module that requires this constant as a dependency

### tree.register(key, fn, [identifier])

 - key String registered dependency name
 - fn Function the DI function for this module. **Variable names matter.** The variable name for each argument in the function should correspond to a dependency or constant that will be registered with nject. If not, nject will throw an error at resolution time. The return value of the function is what will be injected in the case of other modules listing this module as a dependency.
 - identifier String An identifier string for error messaging. In the case of naming conflicts, undefined dependencies or circular dependencies, the identifier will be referenced to help give context. Defaults to key.

 ### tree.resolve()

  - Resolves the dependency tree and invokes the registered functions in the order needed to make sure each function gets all dependencies needed.