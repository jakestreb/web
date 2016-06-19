require=(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({12:[function(require,module,exports){

var Game = require('../components/Game.js');

$(function() {
  window.game = new Game();
});

},{"../components/Game.js":2}],2:[function(require,module,exports){

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

},{"./Players.js":3,"./Poll.js":4,"./Responses.js":5,"./State.js":6,"./koFire.js":7,"./util.js":8,"basiccontext":10}],5:[function(require,module,exports){

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

},{"./State.js":6,"./koFire.js":7,"./util.js":8}],4:[function(require,module,exports){

var ko = require('./koFire.js');
var State = require('./State.js');
var util = require('./util.js');

var DURATION = 8000;

// Handles creation of the list of questions and the poll process
function Poll(game) {
  var self = this;
  this.game = game;
  this.timer = new Timer();
  this.spinner = new Spinner();

  this.pollObj = this.game.gameObj.child('poll');

  this.choices = ko.fireArray(this.pollObj.child('choices'));
  this.votes = ko.fireArray(this.pollObj.child('votes'));

  util.bindFunc(this.pollObj.child('timeout'), this.onTimeoutChange.bind(this));
  util.bindFunc(this.pollObj.child('spinner'), this.onSpinnerUpdate.bind(this));

  this.votes.subscribe(this.onVotesUpdate.bind(this));
}

Poll.prototype.pickChoices = function() {
  var allQuestions = this.game.jsonData.questions;
  var picks = util.randomPicks(allQuestions, 3);
  var labels = ['A', 'B', 'C'];
  for (var i = 0; i < 3; i++) {
    this.pollObj.child('choices').push({
      label: labels[i], text: picks[i]
    });
  }
  this.pollObj.child('timeout').set('ready');
};

Poll.prototype.onVotesUpdate = function(votes) {
  var numVoters = votes.length;

  // If someone voted, and it isn't already set, set the timeout.
  if (numVoters > 0) {
    this.pollObj.child('timeout').transaction(function(currTimeout) {
      return currTimeout === 'ready' ? Date.now() + DURATION : undefined;
    });
  }
  // If everyone voted, pick question and change state to respond.
  if (numVoters === this.game.players.awakeCount()) {
    this.timer.stop();
  }
};

Poll.prototype.onTimeoutChange = function(timeout) {
  var self = this;
  if (typeof timeout === 'number') {
    this.timer.start(timeout, function() {
      if (self.game.isHost()) {
        self.pickWinner();
      }
    });
  }
};

Poll.prototype.onVote = function(choice) {
  var self = this;
  var alreadyVoted = util.find(this.votes(), function(vote) {
    return vote.playerKey === self.game.playerObj.key();
  });
  if (alreadyVoted || this.game.state() !== State.POLL) return;
  this.pollObj.child('votes').push({
    name: this.game.playerName(),
    playerKey: this.game.playerObj.key(),
    vote: choice.label
  });
  this.game.playerObj.update({
    vote: choice.label,
    info: choice.label
  });
};

// Only called by host
Poll.prototype.pickWinner = function() {
  var count = { A: 0, B: 0, C: 0 };
  this.votes().forEach(function(voteData) { return count[voteData.vote]++; });
  var maxVotes = Math.max.apply(null, util.values(count));
  var finalists = Object.keys(count).filter(function(choice) {
    return count[choice] === maxVotes;
  });
  if (finalists.length > 1) {
    this.pollObj.child('spinner').update({
      choices: finalists.join(''),
      sequence: Spinner.randomSequence(),
      startIndex: Math.floor(Math.random() * finalists.length)
    });
  }
  else {
    this.submitWinner(finalists[0]);
  }
};

Poll.prototype.onSpinnerUpdate = function(spinObj) {
  var self = this;
  if (spinObj && spinObj.sequence) {
    this.spinner.start(spinObj.choices, spinObj.sequence, spinObj.startIndex, function(item) {
      if (self.game.isHost()) {
        self.submitWinner(item);
      }
    });
  }
};

// Only called by host
Poll.prototype.submitWinner = function(winner) {
  var self = this;
  // Remove all choices except winner
  var removalKeys = [];
  this.choices().forEach(function(choice) {
    if (choice.label !== winner) removalKeys.push(choice.key);
  });
  removalKeys.forEach(function(key) { return self.pollObj.child('choices').child(key).remove(); });
  this.game.gameObj.update({
    question: winner,
    state: State.RESPOND
  });
};

// A simple countdown timer
function Timer() {
  this.intervalId = null;
  this.isRunning = false;
  this.stopCallback = function() {};
}

Timer.prototype.reset = function() {
  $('.slice').show();
  $('.slice').css('transform', 'rotate(0deg)');
  $('.mask_slice').hide();
};

Timer.prototype.start = function(timeout, stopCallback) {
  if (this.isRunning) {
    return;
  }
  this.isRunning = true;
  this.stopCallback = stopCallback;
  this.intervalId = window.setInterval(this.buildDom.bind(this), 10, timeout);
};

Timer.prototype.buildDom = function(timeout) {
  var timeLeft = timeout - Date.now();
  var half = DURATION / 2;
  var frac;
  var deg;
  if (timeLeft > half) {
    $('.mask_slice').hide();
    $('.slice').show();
    // Slice goes 90deg -> 270deg
    frac = 1 - ((timeLeft - half) / half);
    deg = (frac * 180);
    $('.slice').css('transform', 'rotate(' + deg + 'deg)');
  }
  else if (timeLeft <= half && timeLeft > 0) {
    $('.slice').hide();
    $('.mask_slice').show();
    frac = 1 - (timeLeft / half);
    deg = (frac * 180);
    $('.mask_slice').css('transform', 'rotate(' + deg + 'deg)');
  }
  else {
    this.stop();
  }
};

Timer.prototype.stop = function() {
  window.clearInterval(this.intervalId);
  this.isRunning = false;
  this.stopCallback();
};

// A random selection spinner
function Spinner() {
  this.intervalId = null;
  this.isRunning = false;
  this.stopCallback = function() {};
}

Spinner.prototype.start = function(choices, seq, startIndex, stopCallback) {
  if (this.isRunning) {
    return;
  }
  this.isRunning = true;
  this.stopCallback = stopCallback;
  this.intervalId = window.setInterval(
    this.buildDom.bind(this), 10, choices, seq, startIndex
  );
};

Spinner.prototype.buildDom = function(choices, seq, startIndex) {
  var now = Date.now();
  for (var i = 0; i < seq.length - 1; i++) {
    if (now >= seq[i] && now < seq[i + 1]) {
      var pick = choices[(startIndex + i) % choices.length];
      $('.choice_container').removeClass('selected');
      $('.' + pick).addClass('selected');
      return;
    }
  }
  if (now >= seq[seq.length - 1]) {
    this.stop(choices[(startIndex + seq.length - 2) % choices.length]);
  }
};

Spinner.prototype.stop = function(winner) {
  window.clearInterval(this.intervalId);
  this.isRunning = false;
  $('.choice_container').removeClass('selected');
  this.stopCallback(winner);
};

// Generates a random sequence that is delayed over time
Spinner.randomSequence = function() {
  // Sequences of time values on which to change selection
  var seq = [];
  var time = Date.now();
  var delay = 50;
  while (delay < 800 + (Math.random() * 100)) {
    seq.push(time);
    time += delay;
    delay *= 1.2 + (Math.random() * 0.05);
  }
  seq.push(time);
  return seq;
};

module.exports = Poll;

},{"./State.js":6,"./koFire.js":7,"./util.js":8}],3:[function(require,module,exports){

var ko = require('./koFire.js');
var basicContext = require('basiccontext');
var State = require('./State.js');
var util = require('./util.js');

var FRAME_ID = 0;

// Handles creation and maintenance of the list of players
function Players(game) {
  var self = this;

  this.game = game;
  this.gameObj = game.gameObj;

  this.numPlayers = ko.fireObservable(this.gameObj.child('numPlayers'));
  this.numSleeping = ko.fireObservable(this.gameObj.child('numSleeping'));

  this.color = ko.fireObservable(this.game.playerObj.child('color'));

  this.isAsleep = ko.fireObservable(this.game.playerObj.child('asleep'), function(sleeping) {
    if (sleeping) { self.sleepAlert(); }
  });

  // Define frame types observable and create listener to maintain it.
  this.frames = ko.observableArray([]);

  this.players = ko.fireArrayObservables(this.gameObj.child('players'));
  this.removedPlayers = ko.fireArrayObservables(this.gameObj.child('removedPlayers'));

  this.awakeCount = ko.computed(function() {
    return self.numPlayers() - self.numSleeping();
  });
  // Re-check if responses are all in if awakeCount changes
  this.awakeCount.subscribe(function(numAwake) {
    if (self.game.state() === State.RESPOND) {
      self.game.responses.checkIfAllIn();
    }
  });

  // Computed for showing score adjusters
  this.showAdjusters = ko.computed(function() {
    return self.game.state() === State.SCORE && self.game.isHost();
  });

  this.isDomBusy = false;

  this.unhandledLog = [];
  this.log = ko.fireArray(this.gameObj.child('log'));

  this.gameObj.child('log').once('value', function() {
    // When the log is done loading, subscribe and initialize frames
    self.initPlayerDom();
    self.log.subscribe(function(logUpdate) {
      logUpdate.forEach(function(update) {
        console.warn('LOG UPDATED', update.value.event, update);
        if (!self.isDomBusy) {
          console.warn('dom READY');
          self.isDomBusy = true;
          self._handleLogUpdate(update.value);
        } else {
          console.warn('dom BUSY');
          self.unhandledLog.push(update.value);
        }
      });
    }, self, 'arrayChange');
  });
}

Players.prototype.initPlayerDom = function() {
  var self = this;
  var players = this.players();
  var playerOrder = util.evaluate(this.players);
  playerOrder.sort(function(playerA, playerB) {
    var aPts = playerA.score;
    var bPts = playerB.score;
    return aPts !== bPts ? bPts - aPts : playerA.scoreTime - playerB.scoreTime;
  });
  playerOrder.forEach(function(staticPlayer) {
    var player = util.find(players, function(p) { return p().key === staticPlayer.key; });
    self.frames.push(new Frame(player));
  });
};

// Should be called at the end of every dom update function to check if more updates are on deck.
Players.prototype._domUpdated = function() {
  var self = this;
  if (this.unhandledLog.length > 0) {
    console.warn('DONE UPDATING DOM, handling next update');
    // SetTimeout used in case any css animation classes need time off
    setTimeout(function() {
      self._handleLogUpdate(self.unhandledLog.shift());
    }, 10);
  }
  else {
    console.warn('DONE UPDATING DOM');
    this.isDomBusy = false;
  }
};

Players.prototype._handleLogUpdate = function(update) {
  var handlerMap = {
    'added': this.addPlayerDom.bind(this),
    'removed': this.removePlayerDom.bind(this),
    'moved': this.movePlayerDom.bind(this)
  };
  handlerMap[update.event](update);
};

Players.prototype.addPlayerDom = function(update) {
  console.warn('adding player', update);
  var self = this;
  var players = self.players();
  var removedPlayers = self.removedPlayers();
  var player = util.find(players, function(player) { return player().key === update.playerKey; }) ||
    util.find(removedPlayers, function(player) { return player().playerKey === update.playerKey; });
  var frame = new Frame(player, true);
  this.frames.push(frame);
  setTimeout(function() {
    frame.collapsed(false);
    setTimeout(function() {
      frame.empty(false);
      frame.moving('right_in');
      setTimeout(function() {
        frame.moving(undefined);
        self._domUpdated();
      }, 700);
    }, 500);
  }, 10);
};

Players.prototype.removePlayerDom = function(update) {
  console.warn('removing player', update);
  var self = this;
  var frames = this.frames();
  var frameIndex = util.findIndex(frames, function(f) { return f.player().key === update.playerKey; });
  var frame = frames[frameIndex];
  frame.moving('right_out');
  setTimeout(function() {
    frame.empty(true);
    frame.collapsed(true);
    setTimeout(function() {
      self.frames.splice(frameIndex, 1);
      self._domUpdated();
    }, 500);
  }, 700);
};

Players.prototype.movePlayerDom = function(update) {
  console.warn('moving players', update);
  var self = this;
  var changes = update.changes;
  var frames = this.frames();
  var getIndex = function(key) {
    return util.findIndex(frames, function(f) { return f.player().key === key; });
  };
  var outCount = 0;
  changes.forEach(function(change) {
    change.from = getIndex(change.playerKey);
    change.to = getIndex(change.toPlayerKey);
    frames[change.from].moving(change.to < change.from ? 'left_out' : 'right_out');
    $('.frame_' + change.to + ' .sign').addClass('unlifted');
    setTimeout(function() {
      outCount++;
      if (outCount === changes.length) {
        walkIn();
      }
    }, 700);
  });
  // Called once all players have walked out
  var walkIn = function() {
    var inCount = 0;
    var players = util.evaluate(self.players);
    var removedPlayers = util.evaluate(self.removedPlayers);
    changes.forEach(function(change) {
      var fromFrame = frames[change.from];
      var toFrame = frames[change.to];
      fromFrame.empty(true);
      fromFrame.moving(undefined);
      var player = util.find(players, function(player) { return player.key === change.playerKey; }) ||
        util.find(removedPlayers, function(player) { return player.playerKey === change.playerKey; });
      toFrame.player(player);
      setTimeout(function() {
        toFrame.empty(false);
        toFrame.moving(change.to < change.from ? 'right_in' : 'left_in');
        setTimeout(function() {
          toFrame.moving(undefined);
          $('.frame_' + change.to + ' .sign').removeClass('unlifted');
          inCount++;
          if (inCount === changes.length) {
            // All animations complete
            self._domUpdated();
          }
        }, 700);
      }, 500);
    });
  };
};

// Writes new player order to database, only host should do this
Players.prototype.checkForRankChange = function() {
  console.warn('setting ranks');
  var self = this;
  var changes = [];
  var frames = this.frames();
  var playerOrder = util.evaluate(this.players);
  playerOrder.sort(function(playerA, playerB) {
    var aPts = playerA.score;
    var bPts = playerB.score;
    return aPts !== bPts ? bPts - aPts : playerA.scoreTime - playerB.scoreTime;
  });
  playerOrder.forEach(function(player, index) {
    var oldIndex = util.findIndex(frames, function(f) { return f.player().key === player.key; });
    if (index !== oldIndex) {
      changes.push({
        playerKey: player.key,
        toPlayerKey: frames[index].player().key
      });
    }
  });
  if (changes.length > 0) {
    this.gameObj.child('log').push({
      event: 'moved',
      changes: changes
    });
  }
};

Players.prototype.onClickPlayerMenu = function(frame, event) {
  var self = this;
  var player = frame.player();
  var isHost = player.isHost;
  var items = [{
      title: 'Give point (' + player.score + ')',
      icon: 'fa fa-plus',
      fn: function() { return self.adjustScore(player.key, 1); }
    }, {
      title: 'Take point (' + player.score + ')',
      icon: 'fa fa-minus',
      fn: function() { return self.adjustScore(player.key, -1); }
    }, {
    }, {
      title: 'Mark response guessed',
      icon: 'fa fa-quote-left',
      visible: !isHost && this.game.state() === State.GUESS,
      disabled: player.guessed,
      fn: function() { return self.game.onGuessed(player.key); }
    }, {
      title: 'Sit out this round',
      icon: 'fa fa-bed',
      visible: !isHost,
      disabled: player.asleep,
      fn: function() { return self.setSleeping(player.key, true); }
    }, {
      title: 'Remove player',
      icon: 'fa fa-ban',
      visible: !isHost,
      fn: function() { return self.game.removeFromGame(player.key); }
  }];
  basicContext.show(items, event.originalEvent);
};

// Sets the status of the player sleeping to bool
Players.prototype.setSleeping = function(playerKey, bool) {
  var self = this;
  // Sets player to sleeping and increments numSleeping
  var playerObj = this.gameObj.child('players').child(playerKey);
  return playerObj.child('asleep').transaction(function(sleeping) {
    return sleeping === bool ? undefined : bool;
  }, function(error, committed, snapshot) {
    if (committed) {
      // Only update numSleeping if asleep value changed
      return self.gameObj.child('numSleeping').transaction(function(numSleeping) {
        return numSleeping + (bool ? 1 : -1);
      });
    }
  });
};

// Adjusts a players score by amt
Players.prototype.adjustScore = function(key, amt) {
  var self = this;
  var playerRef = this.gameObj.child('players').child(key);
  playerRef.child('score')
  .transaction(function(currScore) {
      return currScore + amt;
  }, function(err, committed, snapshot) {
    if (!committed) return;
    playerRef.child('scoreTime').set(Date.now())
    .then(function() {
      self.checkForRankChange();
    });
  });
};

Players.prototype.sleepAlert = function() {
  var self = this;
  util.alert({
    text: "You're on break",
    buttonText: "Back to the game",
    buttonFunc: function() { return self.setSleeping(self.game.playerObj.key(), false); },
    color: this.color()
  });
};

// Host only
Players.prototype.onSetScores = function() {
  var self = this;
  var transactions = [];
  this.frames().forEach(function(frame) {
    var adj = frame.scoreAdjustment();
    var key = frame.player().key;
    var playerRef = self.gameObj.child('players').child(key);
    transactions.push(playerRef.child('score').transaction(function(currScore) {
      return currScore + adj;
    }, function(err, committed, snapshot) {
      if (committed) {
        playerRef.child('scoreTime').set(Date.now());
        frame.scoreAdjustment(0); // Reset to 0 for next round
      }
    }));
  });
  Promise.all(transactions).then(function() {
    self.gameObj.child('state').set(State.RECAP);
    self.checkForRankChange();
    // Show updated scores
    self.players().forEach(function(player) {
      var playerObj = self.gameObj.child('players').child(player().key);
      playerObj.child('score').once('value', function(score) {
        playerObj.child('info').set(score.val().toString());
      });
    });
  });
};

function Frame(obsPlayer, optCollapsed) {
  this.id = FRAME_ID++;
  this.player = obsPlayer;
  this.scoreAdjustment = ko.observable(0);
  this.empty = ko.observable(optCollapsed || false);
  this.moving = ko.observable(undefined);
  this.collapsed = ko.observable(optCollapsed || false);
}

Frame.prototype.getBodySelector = function() {
  return $('.frame_' + this.id + ' .body');
};

module.exports = Players;

},{"./State.js":6,"./koFire.js":7,"./util.js":8,"basiccontext":10}],10:[function(require,module,exports){
"use strict";!function(n,t){"undefined"!=typeof module&&module.exports?module.exports=t():"function"==typeof define&&define.amd?define(t):window[n]=t()}("basicContext",function(){var n=null,t="item",e="separator",i=function(){var n=arguments.length<=0||void 0===arguments[0]?"":arguments[0];return document.querySelector(".basicContext "+n)},l=function(){var n=arguments.length<=0||void 0===arguments[0]?{}:arguments[0],i=0===Object.keys(n).length?!0:!1;return i===!0&&(n.type=e),null==n.type&&(n.type=t),null==n["class"]&&(n["class"]=""),n.visible!==!1&&(n.visible=!0),null==n.icon&&(n.icon=null),null==n.title&&(n.title="Undefined"),n.disabled!==!0&&(n.disabled=!1),n.disabled===!0&&(n["class"]+=" basicContext__item--disabled"),null==n.fn&&n.type!==e&&n.disabled===!1?(console.warn("Missing fn for item '"+n.title+"'"),!1):!0},o=function(n,i){var o="",r="";return l(n)===!1?"":n.visible===!1?"":(n.num=i,null!==n.icon&&(r="<span class='basicContext__icon "+n.icon+"'></span>"),n.type===t?o="\n		       <tr class='basicContext__item "+n["class"]+"'>\n		           <td class='basicContext__data' data-num='"+n.num+"'>"+r+n.title+"</td>\n		       </tr>\n		       ":n.type===e&&(o="\n		       <tr class='basicContext__item basicContext__item--separator'></tr>\n		       "),o)},r=function(n){var t="";return t+="\n	        <div class='basicContextContainer'>\n	            <div class='basicContext'>\n	                <table>\n	                    <tbody>\n	        ",n.forEach(function(n,e){return t+=o(n,e)}),t+="\n	                    </tbody>\n	                </table>\n	            </div>\n	        </div>\n	        "},a=function(){var n=arguments.length<=0||void 0===arguments[0]?{}:arguments[0],t={x:n.clientX,y:n.clientY};if("touchend"===n.type&&(null==t.x||null==t.y)){var e=n.changedTouches;null!=e&&e.length>0&&(t.x=e[0].clientX,t.y=e[0].clientY)}return(null==t.x||t.x<0)&&(t.x=0),(null==t.y||t.y<0)&&(t.y=0),t},s=function(n,t){var e=a(n),i=e.x,l=e.y,o={width:window.innerWidth,height:window.innerHeight},r={width:t.offsetWidth,height:t.offsetHeight};i+r.width>o.width&&(i-=i+r.width-o.width),l+r.height>o.height&&(l-=l+r.height-o.height),r.height>o.height&&(l=0,t.classList.add("basicContext--scrollable"));var s=e.x-i,u=e.y-l;return{x:i,y:l,rx:s,ry:u}},u=function(){var n=arguments.length<=0||void 0===arguments[0]?{}:arguments[0];return null==n.fn?!1:n.visible===!1?!1:n.disabled===!0?!1:(i("td[data-num='"+n.num+"']").onclick=n.fn,i("td[data-num='"+n.num+"']").oncontextmenu=n.fn,!0)},c=function(t,e,l,o){var a=r(t);document.body.insertAdjacentHTML("beforeend",a),null==n&&(n=document.body.style.overflow,document.body.style.overflow="hidden");var c=i(),d=s(e,c);return c.style.left=d.x+"px",c.style.top=d.y+"px",c.style.transformOrigin=d.rx+"px "+d.ry+"px",c.style.opacity=1,null==l&&(l=f),c.parentElement.onclick=l,c.parentElement.oncontextmenu=l,t.forEach(u),"function"==typeof e.preventDefault&&e.preventDefault(),"function"==typeof e.stopPropagation&&e.stopPropagation(),"function"==typeof o&&o(),!0},d=function(){var n=i();return null==n||0===n.length?!1:!0},f=function(){if(d()===!1)return!1;var t=document.querySelector(".basicContextContainer");return t.parentElement.removeChild(t),null!=n&&(document.body.style.overflow=n,n=null),!0};return{ITEM:t,SEPARATOR:e,show:c,visible:d,close:f}});
},{}]},{},[12]);
