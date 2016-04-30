
var ko = require('./koFire.js');
var basicContext = require('basiccontext');
var Players = require('./Players.js');
var Responses = require('./Responses.js');
var Poll = require('./Poll.js');
var State = require('./State.js');
var util = require('./util.js');

// Handles preparing the game and moving between states
function Game(app, gameObj, playerObj, isWatching) {
  this.app = app;
  this.gameObj = gameObj;
  this.playerObj = playerObj;
  this.isWatching = isWatching;

  this.gameName = ko.fireObservable(this.gameObj.child('animal'));
  this.playerName = ko.fireObservable(this.playerObj.child('name'), name => {
    if (name === null) {
      // You've been removed
      window.location.hash = "";
      window.location.reload();
    }
  });
  this.isHost = ko.fireObservable(this.playerObj.child('isHost'));

  this.state = ko.fireObservable(this.gameObj.child('state'));
  this.round = ko.fireObservable(this.gameObj.child('round'));

  this.question = ko.fireObservable(this.gameObj.child('question'));

  this.guessed = ko.fireObservable(this.playerObj.child('guessed'));
  this.responded = ko.fireObservable(this.playerObj.child('responded'));

  // Show prompt computeds
  this.showBeginButton = ko.computed(() => {
    return this.state() === State.JOIN && this.isHost();
  });
  this.showCompleteButton = ko.computed(() => {
    return this.state() === State.GUESS && this.isHost();
  });
  this.showSubmitPrompt = ko.computed(() => {
    return !this.responded() && this.state() === State.RESPOND;
  });

  this.players = null;
  this.responses = null;
  this.poll = null;

  // Set the game and player names before building the dom
  var loadBody = $.Deferred();
  var domFile = this.isWatching ? 'watch.html' : 'game.html';
  $(document.body).load(domFile, () => loadBody.resolve());
  loadBody.promise().then(() => {
    this.players = new Players(this);
    this.responses = new Responses(this);
    this.poll = new Poll(this);
    ko.applyBindings(this, $('#game_content').get(0));
    if (this.state() === State.INIT) {
      this.onStateChange(State.INIT);
    }
  });

  // Subscription skips initial setting notice
  this.state.subscribe(newState => this.onStateChange(newState));
}

Game.prototype.onClickSettings = function(event) {
  var items = [{
      title: 'Next round',
      icon: 'fa fa-forward',
      fn: () => this.onNextRound(),
      visible: this.isHost()
    }, {
      title: 'Sit out this round',
      icon: 'fa fa-bed',
      fn: () => this.players.setSleeping(this.playerObj.key(), true),
      visible: !this.isHost()
    }, {
      title: 'Leave game',
      icon: 'fa fa-sign-out',
      fn: () => this.removeFromGame(this.playerObj.key())
  }];
  basicContext.show(items, event.originalEvent);
};

Game.prototype.onStateChange = function(newState) {
  console.log('state => ' + newState);

  switch (newState) {
    case State.JOIN:
      break;
    case State.INIT:
      this.playerObj.update({
        guessed: null,
        responded: null,
        vote: null,
        info: null
      });
      if (this.isHost()) {
        this.gameObj.update({
          state: State.POLL,
          poll: null,
          responses: null,
          question: null,
        });
      }
      break;
    case State.POLL:
      this.playerObj.update({
        info: null
      });
      if (this.isHost()) {
        this.poll.pickChoices();
      }
      break;
    case State.RESPOND:
      // Remove poll data once no longer relevant
      this.playerObj.update({
        responded: false,
        info: null
      });
      if (this.isHost()) {
        this.gameObj.child('poll').update({
          allowVoting: false,
          votes: null,
          spinner: null,
          timeout: null
        });
      }
      break;
    case State.GUESS:
      this.playerObj.update({
        responded: null,
        guessed: false
      });
      break;
    case State.SCORE:
      this.playerObj.child('score').once('value', score => {
        this.playerObj.child('info').set(score.val().toString());
      });
      break;
    case State.RECAP:
      break;
  }
};

Game.prototype.onNextRound = function() {
  this.gameObj.update({
    state: State.INIT,
    round: this.round() + 1,
  });
};

Game.prototype.removeFromGame = function(playerKey) {
  if (playerKey === this.playerObj.key() && this.isHost()) {
    // The host is leaving, game is over
    this.app.database.child(this.gameObj.key()).set(null);
  }
  else {
    // Wake the player up (in case they were asleep) for accounting and moving purposes
    this.players.setSleeping(playerKey, false).then(() => {
      // If the player has responsed, remove response
      this.responses.responses().forEach(response => {
        if (response.playerKey === playerKey) {
          this.gameObj.child('responses').child(response.key).remove();
        }
      });
      // Decrement numPlayers
      return this.gameObj.child('numPlayers').transaction(currNumPlayers => {
        return currNumPlayers - 1;
      });
    }).then(() => {
      // Remove player entirely
      // This will not execute until numPlayers transaction succeeds
      this.gameObj.child('players').child(playerKey).remove();
    });
  }
};

Game.prototype.onSubmit = function() {
  var input = $("#response");
  if (input.val() === "") {
    return;
  }
  this.playerObj.child('responded').set(true);
  var res = this.gameObj.child('responses').push({
    playerKey: this.playerObj.key(),
    response: input.val(),
    eliminated: false
  });
  this.gameObj.child('responses').child(res.key()).setPriority(Math.random());
  input.val("");
};

// If overridePlayerKey is not given, the current player is assumed
Game.prototype.onGuessed = function(overridePlayerKey) {
  var playerKey = overridePlayerKey || this.playerObj.key();
  this.gameObj.child('players').child(playerKey).child('guessed').set(true);
  // Look into responsesInfo, find your response and eliminate it
  this.responses.responses().forEach(response => {
    if (response().playerKey === playerKey) {
      this.gameObj.child('responses').child(response().key).child('eliminated').set(true);
    }
  });
};

// Host only
Game.prototype.onGuessingComplete = function() {
  this.gameObj.update({
    state: State.SCORE,
    responses: null
  });
};

module.exports = Game;
