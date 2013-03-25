var _ = require('underscore'),
    hello,
    world;

exports.$inject = function($hello, $world) {
    hello = $hello;
    world = $world;
}

exports.speak = function(){
    return hello() +' '+ world();
}