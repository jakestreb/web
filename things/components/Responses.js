
var ko = require('./koFire.js');
var State = require('./State.js');
var util = require('./util.js');

// Handles creation and crossing out of the list of responses
function Responses(game) {
  var self = this;
  this.game = game;

  var responsesRef = this.game.gameObj.child('responses');
  this.responses = ko.fireArrayObservables(responsesRef, function(newVal) {
    self.checkIfAllIn(newVal);
  });
}

// If optResponses is given, use instead of reading observable again
Responses.prototype.checkIfAllIn = function(optResponses) {
  var responses = optResponses || this.responses();
  if (responses.length === this.game.players.awakeCount()) {
    this.game.gameObj.child('state').set(State.GUESS);
  }
};

module.exports = Responses;
