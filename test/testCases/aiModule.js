var underscore,
    hello,
    world;

exports.$inject = function($hello, $world, $underscore) {
    hello = $hello;
    world = $world;
    underscore = $underscore;
}

exports.speak = function(){
    return hello() +' '+ world();
}

exports.underscore = function(){
    return underscore;
}