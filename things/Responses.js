
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

Responses.prototype.onResponsesUpdate = function(responsesInfo) {
  // Create a JS map from responses for access to forEach, size
  this.responsesInfo = responsesInfo || {};
  console.warn('onResponsesUpdate', this.responsesInfo);

  // If there are no responses in the database, remove
  if (util.size(this.responsesInfo) === 0) {
    this.responseOrder = [];
    $("#responses").css('flex-grow', '0');
    $('#responses').html("");
  }

  util.forEach(this.responsesInfo, (val, key) => {
    // If key isn't in responseOrder, and it`s ready, add it randomly
    if (!util.contains(this.responseOrder, key) && key in this.responsesInfo) {
      util.randomInsert(this.responseOrder, key);
    }
  });
  // If everyone has responded, change to guess state
  if (this.count() === this.game.players.count()) {
    this.game.gameObj.child('state').set(State.GUESS);
  }
  // If guess state, show responses
  if (this.game.state === State.GUESS) {
    this.updateResponseDom();
  }
};

Responses.prototype.updateResponseDom = function() {
  console.warn('updating response dom', this.responseOrder);
  // Build all responses from responseOrder array
  // TODO: Currently always from scratch
  var responses = this.responseOrder.map(playerKey => {
    console.warn('responsesInfo', this.responsesInfo, 'playerKey', playerKey);
    var playerResponse = this.responsesInfo[playerKey];
    return buildResponseDom(playerResponse.response, playerResponse.eliminated);
  });
  $("#responses").html(responses);
  $("#responses").css('flex-grow', '1');
};

// Returns a single instance of a response DOM item
function buildResponseDom(response, eliminated) {
  eliminated = eliminated ? "eliminated" : "";
  return "<div class='response'>" +
      "<div class='response_quotes'>" +
        "<div class='response_content "+eliminated+"'>" + response + "</div>" +
      "</div>" +
    "</div>";
}

module.exports = Responses;
