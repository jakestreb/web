
var ko = require('./koFire.js');
var State = require('./State.js');
var util = require('./util.js');

// Handles creation and crossing out of the list of responses
function Responses(game) {
  this.game = game;

  var responsesRef = this.game.gameObj.child('responses');
  this.responses = ko.fireArray(responsesRef);

  util.bindFunc(responsesRef, this.onResponsesUpdated.bind(this));
}

Responses.prototype.onResponsesUpdated = function(responsesInfo) {
  if (!responsesInfo) return;
  if (util.size(responsesInfo) === this.game.players.awakeCount()) {
    this.game.gameObj.child('state').set(State.GUESS);
  }
  util.forEach(responsesInfo, (val, key) => {
    if (val.eliminated) {
      $('.response_content:contains(' + val.response + ')').addClass('eliminated');
    }
  });
};

module.exports = Responses;
