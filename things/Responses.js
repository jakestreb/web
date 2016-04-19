
var ko = require('./koFire.js');
var State = require('./State.js');
var util = require('./util.js');

// Handles creation and crossing out of the list of responses
function Responses(game) {
  this.game = game;

  var responsesRef = this.game.gameObj.child('responses');
  this.responses = ko.fireArrayObservables(responsesRef, newVal => {
    this.checkIfAllIn();
  });
}

Responses.prototype.checkIfAllIn = function() {
  if (this.responses().length === this.game.players.awakeCount()) {
    this.game.gameObj.child('state').set(State.GUESS);
  }
};

module.exports = Responses;
