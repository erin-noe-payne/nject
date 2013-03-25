var french;

module.exports = function(){
    return french.hello;
}

module.exports.$inject = function($french) {
    french = $french;
}