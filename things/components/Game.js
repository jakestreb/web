
var ko = require('./koFire.js');
var basicContext = require('basiccontext');
var Players = require('./Players.js');
var Responses = require('./Responses.js');
var Poll = require('./Poll.js');
var State = require('./State.js');
var util = require('./util.js');

// Handles preparing the game and moving between states
function Game() {
  var self = this;
  var stateReady = false;

  this.database = new Firebase('https://thingsgame.firebaseio.com/');
  this.database.once('value').then(function(snapshot) {
    self.gameObj = null;
    self.playerObj = null;
    self.getGameData(snapshot);

    self.gameName = ko.fireObservable(self.gameObj.child('animal'));
    self.playerName = ko.fireObservable(self.playerObj.child('name'), function(name) {
      if (name === null) {
        // You've been removed
        document.location.href = "/things";
      }
    });
    self.isHost = ko.fireObservable(self.playerObj.child('isHost'));

    self.state = ko.fireObservable(self.gameObj.child('state'), function(newState) {
      if (!stateReady) {
        stateReady = true;
      }
      else {
        return self.onStateChange(newState);
      }
    });

    self.round = ko.fireObservable(self.gameObj.child('round'));
    self.question = ko.fireObservable(self.gameObj.child('question'));
    self.guessed = ko.fireObservable(self.playerObj.child('guessed'));
    self.responded = ko.fireObservable(self.playerObj.child('responded'));
    self.random = ko.fireObservable(self.playerObj.child('random'));

    // Show prompt computeds
    self.showBeginButton = ko.computed(function() {
      return self.state() === State.JOIN && self.isHost();
    });
    self.showCompleteButton = ko.computed(function() {
      return self.state() === State.GUESS && self.isHost();
    });
    self.showSubmitPrompt = ko.computed(function() {
      return !self.responded() && self.state() === State.RESPOND;
    });

    util.loadJSON('../components/data.json', function(response) {
      self.jsonData = JSON.parse(response);
    });

    self.players = new Players(self);
    self.responses = new Responses(self);
    self.poll = new Poll(self);

    if (self.state() === State.INIT) {
      self.onStateChange(State.INIT);
    }

    // Only apply bindings after game data is found
    ko.applyBindings(window.game);

    $('#loading_screen').css('display', 'none');
  });
}

Game.prototype.getGameData = function(snapshot) {
  var self = this;
  // Get keys from URL
  var urlGameKey = null;
  var urlPlayerKey = null;
  var urlWatcherKey = null;
  var urlItems = window.location.search.substring(1).split('&');
  urlItems.forEach(function(item) {
    switch (item.slice(0, 1)) {
      case "g":
        urlGameKey = item.slice(2);
        break;
      case "p":
        urlPlayerKey = item.slice(2);
        break;
      case "w":
        urlWatcherKey = item.slice(2);
        break;
    }
  });

  var games = snapshot.val();

  // If game does not exist, URL connection fails
  if (!urlGameKey || !games || !(urlGameKey in games)) {
    window.location.href = "/things"; // Back to homepage
  }

  // Game available
  this.gameObj = snapshot.child(urlGameKey).ref();

  var players = games[this.gameObj.key()].players;
  var watchers = games[this.gameObj.key()].watchers;

  var noPlayer = !urlPlayerKey || !players || !(urlPlayerKey in players);
  var noWatcher = !urlWatcherKey || !watchers || !(urlWatcherKey in watchers);

  if (!noPlayer) {
    this.playerObj = this.gameObj.child("players").child(urlPlayerKey);
  }
  else if (!noWatcher) {
    this.playerObj = this.gameObj.child("watchers").child(urlWatcherKey);
  }
  else {
    window.location.href = "/things"; // Back to homepage
  }
};

Game.prototype.onClickSettings = function(event) {
  var self = this;
  var items = [{
      title: 'Next round',
      icon: 'fa fa-forward',
      fn: function() { return self.onNextRound(); },
      visible: this.isHost()
    }, {
      title: 'Sit out this round',
      icon: 'fa fa-bed',
      fn: function() { return self.players.setSleeping(self.playerObj.key(), true); },
      visible: !this.isHost()
    }, {
      title: 'Leave game',
      icon: 'fa fa-sign-out',
      fn: function() { return self.removeFromGame(self.playerObj.key()); }
  }];
  basicContext.show(items, event.originalEvent);
};

Game.prototype.onStateChange = function(newState) {
  console.log('state => ' + newState);
  var self = this;

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
      this.poll.timer.reset(); // Resets timer dom
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
          votes: null,
          spinner: null,
          timeout: null
        });
      }
      break;
    case State.GUESS:
      this.playerObj.update({
        responded: null,
        guessed: false,
        info: null
      });
      break;
    case State.SCORE:
      this.playerObj.child('score').once('value', function(score) {
        self.playerObj.child('info').set(score.val().toString());
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
  var self = this;
  if (playerKey === this.playerObj.key() && this.isHost()) {
    // TODO: Send out log that host has left
    // The host is leaving, game is over
    this.database.child(this.gameObj.key()).set(null);
  }
  else {
    // Wake the player up (in case they were asleep) for accounting and moving purposes
    this.players.setSleeping(playerKey, false).then(function() {
      // If the player has responsed, remove response
      self.responses.responses().forEach(function(response) {
        if (response.playerKey === playerKey) {
          self.gameObj.child('responses').child(response.key).remove();
        }
      });
      // Decrement numPlayers
      return self.gameObj.child('numPlayers').transaction(function(currNumPlayers) {
        return currNumPlayers - 1;
      });
    }).then(function() {
      // Remove player entirely
      // This will not execute until numPlayers transaction succeeds
      self.gameObj.child('players').child(playerKey).once('value', function(player) {
        player = player.val();
        player.playerKey = playerKey;
        self.gameObj.child('removedPlayers').push(player);
        self.gameObj.child('players').child(playerKey).remove();
        self.gameObj.child('log').push({
          event: 'removed',
          playerKey: playerKey
        });
      });
    });
  }
};

Game.prototype.onSubmit = function() {
  var input = $("#response");
  if (input.val() === "") {
    return;
  }
  this.playerObj.update({
    responded: true,
    info: 'X'
  });
  var res = this.gameObj.child('responses').push({
    playerKey: this.playerObj.key(),
    response: input.val(),
    eliminated: false,
    random: this.random()
  });
  this.gameObj.child('responses').child(res.key()).setPriority(Math.random());
  input.val("");
};

// If overridePlayerKey is not given, the current player is assumed
Game.prototype.onGuessed = function(overridePlayerKey) {
  var self = this;
  var playerKey = overridePlayerKey || this.playerObj.key();
  this.gameObj.child('players').child(playerKey).child('guessed').set(true);
  // Look into responsesInfo, find your response and eliminate it
  this.responses.responses().forEach(function(response) {
    if (response().playerKey === playerKey) {
      self.gameObj.child('responses').child(response().key).child('eliminated').set(true);
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
