var french;

module.exports = function(){
    return french.world;
}

module.exports.$inject = function($french) {
    french = $french;
}