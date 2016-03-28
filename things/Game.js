
var Players = require('./Players.js');
var Responses = require('./Responses.js');
var Poll = require('./Poll.js');
var State = require('./State.js');
var util = require('./util.js');

// Handles preparing the game and moving between states
function Game(app, gameObj, playerObj) {
  this.app = app;
  this.gameObj = gameObj;
  this.playerObj = playerObj;

  this.gameName = null;
  this.playerName = null;
  this.isHost = null;

  this.state = State.INIT;
  this.round = 1;

  this.players = null;
  this.responses = null;
  this.poll = null;

  // Set the game and player names before building the dom
  gameObj.child("animal").once("value").then(snapshot => {
    this.gameName = snapshot.val();
    return this.playerObj.once("value");
  }).then(snapshot => {
    this.playerName = snapshot.child("name").val();
    this.isHost = snapshot.child("isHost").val();
    return this.buildDom();
  }).then(() => {
    this.players = new Players(this);
    this.responses = new Responses(this);
    this.poll = new Poll(this);
    util.bindVal(this.gameObj.child('round'), this.round);
    util.bindFunc(this.gameObj.child('state'), this.onStateChange.bind(this));
    util.bindFunc(this.gameObj.child('question'), this.onQuestionUpdate.bind(this));
    util.bindFunc(this.playerObj.child('guessed'), this.onGuessedUpdate.bind(this));
    util.bindFunc(this.playerObj.child('responded'), this.onRespondedUpdate.bind(this));
  });
}

Game.prototype.buildDom = function() {
  console.warn('building game');
  var loadBody = $.Deferred();
  $(document.body).load('game.html', () => loadBody.resolve());
  return loadBody.promise().then(() => {
    $('#info_container').html(this.gameName);
    $('#submit').on('click', this.onSubmit.bind(this));
    $('#guessed').on('click', this.onGuessed.bind(this));
    $('#leave').on('click', this.removeFromGame.bind(this, this.playerObj.key()));
    if (this.isHost) {
      $('#new_round').on('click', this.onNewRoundButton.bind(this));
    }
    else {
      $('#host_settings').hide();
    }
  });
};

Game.prototype.onStateChange = function(newState) {
  console.log('state => ' + newState);
  this.state = newState;
  // TODO: Updates should only occur on transition
  switch (newState) {
    case State.INIT:
      this.playerObj.update({
        guessed: null,
        responded: null
      });
      if (this.isHost) {
        this.gameObj.update({
          state: State.POLL,
          poll: null,
          responses: null,
          question: null
        });
      }
      break;
    case State.POLL:
      if (this.isHost) {
        this.poll.pickChoices();
      }
      break;
    case State.RESPOND:
      // Remove poll data once no longer relevant
      this.responses.waitForAll();
      this.playerObj.child('responded').set(false);
      if (this.isHost) {
        this.gameObj.child('poll').remove();
      }
      break;
    case State.GUESS:
      this.playerObj.update({
        responded: null,
        guessed: false
      });
      this.responses.showAll();
      break;
  }
};

Game.prototype.onQuestionUpdate = function(question) {
  if (question) {
    $('#question').html(question);
  } else {
    $('#question').html("");
  }
};

Game.prototype.onGuessedUpdate = function(guessed) {
  if (guessed === false) {
    $('#guessed_container').show();
  } else {
    $('#guessed_container').hide();
  }
};

Game.prototype.onRespondedUpdate = function(responded) {
  if (responded === false) {
    $('#submit_container').show();
  } else {
    $('#submit_container').hide();
  }
};

Game.prototype.onNewRoundButton = function() {
  this.gameObj.update({
    state: State.INIT,
    round: this.round + 1,
  });
};

Game.prototype.removeFromGame = function(playerKey) {
  this.gameObj.child('players').child(playerKey).remove();
  var responsesInfo = this.responses.responsesInfo;
  // If the player has responsed, remove response
  if (responsesInfo !== null) {
    util.forEach(responsesInfo, (val, key) => {
      if (val.key === playerKey) {
        this.gameObj.child('responses').child(key).remove();
      }
    });
  }
};

Game.prototype.onSubmit = function() {
  var input = $("#response").val();
  if (input === "") {
    return;
  }
  this.playerObj.child('responded').set(true);
  this.gameObj.child('responses').push({
    key: this.playerObj.key(),
    response: input
  });
};

Game.prototype.onGuessed = function() {
  this.playerObj.child('guessed').set(true);
  // Look into responsesInfo, find your response and eliminate it
  util.forEach(this.responses.responsesInfo, (val, key) => {
    if (val.key === this.playerObj.key()) {
      this.gameObj.child('responses').child(key).update({
        eliminated: true
      });
    }
  });
};

module.exports = Game;
