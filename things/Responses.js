
var State = require('./State.js');
var util = require('./util.js');

// Handles creation and crossing out of the list of responses
function Responses(game) {
  this.game = game;

  this.responsesInfo = null;
  this.responseOrder = [];

  util.bindFunc(this.game.gameObj.child('responses'), this.onResponsesUpdate.bind(this));
}

Responses.prototype.count = function() {
  return util.size(this.responsesInfo);
};

Responses.prototype.waitForAll = function() {
  this.game.gameObj.child('responses').off('value');
  util.bindFunc(this.game.gameObj.child('responses'), this.onResponsesUpdate.bind(this));
};

Responses.prototype.showAll = function() {
  this.game.gameObj.child('responses').off('value');
  util.bindFunc(this.game.gameObj.child('responses'), this.onResponseEliminated.bind(this));
};

Responses.prototype.onResponsesUpdate = function(responsesInfo) {
  // Create a JS map from responses for access to forEach, size
  this.responsesInfo = responsesInfo || {};

  util.forEach(this.responsesInfo, (val, key) => {
    // If key isn't in responseOrder, and it`s ready, add it randomly
    if (this.responseOrder.indexOf(key) === -1 && key in this.responsesInfo) {
      util.randomInsert(this.responseOrder, key);
    }
  });
  // If everyone has responded, change to guess state
  if (this.count() === this.game.players.count()) {
    this.game.gameObj.child('state').set(State.GUESS);
  }
};

Responses.prototype.onResponseEliminated = function(responsesInfo) {
  this.responsesInfo = responsesInfo || {};
  util.forEach(this.responsesInfo, this.updateResponseDom.bind(this));
  // If there are no responses in the database, remove
  if (util.size(this.responsesInfo) === 0) {
    $('#responses').html("");
  }
};

Responses.prototype.updateResponseDom = function() {
  // Build all responses from responseOrder array
  // TODO: Currently always from scratch
  var responses = this.responseOrder.map(playerKey => {
    var playerResponse = this.responsesInfo[playerKey];
    return buildResponseDom(playerResponse.response, playerResponse.eliminated);
  });
  $("#responses").html(responses);
};

// Returns a single instance of a response DOM item
function buildResponseDom(response, eliminated) {
  eliminated = eliminated ? "eliminated" : "";
  return "<div class='response'>" +
    "<div class='response_content "+eliminated+"'>" + response + "</div>" +
    "<div class='response_triangle'></div>" +
    "</div>";
}

module.exports = Responses;
