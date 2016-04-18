(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

var ko = require('./koFire.js');
var Game = require('./Game.js');
var util = require('./util.js');

// Handles log in and creating a game
function App() {
  this.database = new Firebase('https://thingswithbeth.firebaseio.com/');

  this.selectedGame = ko.observable(null);

  this.foundGame = null;
  this.isHost = false;

  this.urlGameKey = null;
  this.urlPlayerKey = null;

  this.game = null;

  this.jsonData = null;
  this.colors = ko.observableArray();
  this.selectedColor = ko.observable("rgb(81, 107, 151)");

  this.activeGames = ko.fireArray(this.database);

  // Load JSON data
  _loadJSON(response => {
    this.jsonData = JSON.parse(response);
    this.colors(this.jsonData.colors);
  });

  this.database.once('value', snapshot => this.attemptURLConnect(snapshot));

  // TODO: Use knockout
  $('#join').on('click', this.onJoinButton.bind(this));
  $('#host').on('click', this.onHostButton.bind(this));
  $('#watch').on('click', this.onJoinButton.bind(this, true));
}

App.prototype.selectGame = function(game, event) {
  this.selectedGame(game);
  $('.active_game').removeClass('selected');
  $(event.target).addClass('selected');
};

App.prototype.attemptURLConnect = function(snapshot) {
  // Get keys from URL
  var urlItems = window.location.hash.split("/");
  urlItems.forEach(item => {
    switch (item.slice(0, 2)) {
      case "%g":
        this.urlGameKey = item.slice(2);
        break;
      case "%u":
        this.urlPlayerKey = item.slice(2);
        break;
    }
  });

  // If URL doesn't contain information, URL connection fails
  if (!this.urlGameKey) {
    window.location.hash = ""; // Clears URL suffix
    return;
  }

  // Initialize game/player based on URL
  var games = snapshot.val();

  // Retrieve game if in database, break if not
  if (!games || !(this.urlGameKey in games)) {
    window.location.hash = ""; // Clears URL suffix
    console.error("Failed to retrieve game");
    return;
  }
  // Game available
  var gameObj = snapshot.child(this.urlGameKey).ref();

  var players = games[gameObj.key()].players;
  if (!this.urlPlayerKey || !players || !(this.urlPlayerKey in players)) {
    window.location.hash = "/%g" + this.urlGameKey; // Clears player suffix
    console.error("Failed to retrieve player");
    this.game = new Game(this, gameObj);
    return;
  }
  // Player available
  var playerObj = gameObj.child("players").child(this.urlPlayerKey);

  this.game = new Game(this, gameObj, playerObj);
};

App.prototype.onHostButton = function() {
  var animal = "";
  var currentAnimals = [];
  this.activeGames().forEach(game => currentAnimals.push(game.animal));
  // Keep trying to get an animal not currently in use
  // TODO: Inefficient, stalls forever if all animals in use
  do {
    animal = util.randomPick(this.jsonData.animals);
  } while (currentAnimals.indexOf(animal) > 0);

  var frames = "";
  for (var i = 0; i < 15; i++) {
    frames += Math.floor(Math.random() * 9);
  }

  this.foundGame = this.database.push({
    round: 1,
    state: State.INIT,
    animal: animal,
    frames: frames,
    numPlayers: 0,
    numSleeping: 0
  });
  this.isHost = true;

  this.showNamePrompt();
};

App.prototype.onJoinButton = function(watchOnly) {
  this.foundGame = this.database.child(this.selectedGame().key);
  console.warn(this.foundGame);
  if (watchOnly !== true) {
    this.showNamePrompt();
  }
  else {
    console.warn('watchonly', watchOnly);
    window.location.hash = "/%g" + this.selectedGame().key;
    this.game = new Game(this, this.foundGame, null);
  }
};

App.prototype.showNamePrompt = function() {
  $('#join_container').hide();
  $('#host_container').hide();
  $('#name_container').show();
};

App.prototype.onSubmitNameButton = function() {
  var name = $('#name').val();

  this.foundGame.child('numPlayers').transaction(currNumPlayers => {
    return currNumPlayers + 1;
  }, (err, committed, snapshot) => {
    if (!committed) {
      return;
    }
    var playerObj = this.foundGame.child("players").push({
      name: name,
      isHost: this.isHost,
      score: 0,
      added: Date.now(),
      color: this.selectedColor(),
      signPosition: util.randomPick(['left', 'right', 'center']),
      rank: snapshot.val()
    });
    window.location.hash = "/%g" + this.foundGame.key() + "/%u" + playerObj.key();
    this.game = new Game(this, this.foundGame, playerObj);
  });
};

// Found online, JSON parse function
function _loadJSON(callback) {
  var xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', 'data.json', true);
  xobj.onreadystatechange = function () {
    if (xobj.readyState == 4 && xobj.status == "200") {
      // Required use of an anonymous callback as .open will NOT return a value but
      // simply returns undefined in asynchronous mode
      callback(xobj.responseText);
    }
  };
  xobj.send(null);
}

module.exports = App;

},{"./Game.js":2,"./koFire.js":8,"./util.js":11}],2:[function(require,module,exports){

var ko = require('./koFire.js');
var basicContext = require('basiccontext');
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
  $(document.body).load('game.html', () => loadBody.resolve());
  loadBody.promise().then(() => {
    // this.prepareSettings();
    this.players = new Players(this);
    this.responses = new Responses(this);
    this.poll = new Poll(this);
    // util.bindFunc(this.gameObj.child('scoring'), this.onScoringUpdate.bind(this));
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
    }, {
      title: 'Sit out this round',
      icon: 'fa fa-bed',
      fn: () => this.playerObj.child('asleep').set(true)
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
      this.playerObj.child('info').set(null);
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
  this.gameObj.child('numPlayers').transaction(currNumPlayers => {
    return currNumPlayers - 1;
  }, (err, committed, snapshot) => {
    if (!committed) {
      return;
    }
    this.gameObj.child('players').child(playerKey).remove();
    // If the player has responsed, remove response
    this.responses.responses().forEach(response => {
      if (response.playerKey === playerKey) {
        this.gameObj.child('responses').child(response.key).remove();
      }
    });
    // If the player was asleep, decrement numSleeping
    if (this.players.isAsleep()) {
      this.gameObj.child('numSleeping').transaction(currNumSleeping => currNumSleeping - 1);
    }
  });
};

Game.prototype.onSubmit = function() {
  var input = $("#response").val();
  if (input === "") {
    return;
  }
  this.playerObj.child('responded').set(true);
  var res = this.gameObj.child('responses').push({
    playerKey: this.playerObj.key(),
    response: input,
    eliminated: false
  });
  this.gameObj.child('responses').child(res.key()).setPriority(Math.random());
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

},{"./Players.js":3,"./Poll.js":4,"./Responses.js":5,"./State.js":6,"./koFire.js":8,"./util.js":11,"basiccontext":9}],3:[function(require,module,exports){

var ko = require('./koFire.js');
var basicContext = require('basiccontext');
var State = require('./State.js');
var util = require('./util.js');

var NUM_FRAMES = 15; // number of different frames before repeats
var FRAME_TYPES = ['frame_oval', 'frame_square', 'frame_rect'];

// Handles creation and maintenance of the list of players
function Players(game) {
  this.game = game;
  this.gameObj = game.gameObj;

  this.framesString = "";
  this.gameObj.child('frames').once('value', snap => this.framesString = snap.val());

  this.numPlayers = ko.fireObservable(this.gameObj.child('numPlayers'));
  this.numSleeping = ko.fireObservable(this.gameObj.child('numSleeping'));

  this.isAsleep = ko.fireObservable(this.game.playerObj.child('asleep'), sleeping => {
    if (sleeping) {
      this.sleepAlert();
    }
  });

  // Define frame types observable and create listener to maintain it.
  this.frames = ko.observableArray();

  this.players = ko.fireArrayObservables(this.gameObj.child('players').orderByChild('rank'), players => {
    console.warn('PLAYERS CHANGED');
    var numPlayers = players.length;
    var numFrames = this.frames().length;
    // Add frames
    while (numFrames < numPlayers) {
      var nextRank = numFrames + 1;
      var player = util.find(players, p => p.peek().rank === nextRank);
      this.frames.push(this.buildFrameObj(player, nextRank));
      numFrames++;
    }
    // Remove frames & player dom
    while (numFrames > numPlayers) {
      // Find which player is missing
      for (var r = 1; r <= numFrames; r++) {
        if (!util.find(players, p => p.peek().rank === r)) {
          // If there is no player with rank r, remove that player DOM
          this.setRanks({ removeRank: r });
          numFrames--;
        }
      }
    }
  });

  // Computed for showing score adjusters
  this.showAdjusters = ko.computed(() => {
    return this.game.state() === State.SCORE && this.game.isHost();
  });
}

Players.prototype.buildFrameObj = function(player, rank) {
  var frameValue = parseInt(this.framesString[(rank - 1) % NUM_FRAMES], 10);
  var frameType = FRAME_TYPES[Math.floor(frameValue % 3)];
  return new Frame(rank, frameType, player);
};

Players.prototype.awakeCount = function() {
  return this.numPlayers() - this.numSleeping();
};

// Writes new player order to database, only host should do this
// Calls movePlayers when done
// options.removeRank - if set, removes the player at the rank and the last frame
// options.callback - if set, runs a callback on every animation end with the frame
//  as the argument
Players.prototype.setRanks = function(options) {
  var playerOrder = util.evaluate(this.players);
  playerOrder.sort((playerA, playerB) => {
    var aPts = playerA.score;
    var bPts = playerB.score;
    return aPts !== bPts ? bPts - aPts : playerA.added - playerB.added;
  });
  playerOrder.forEach((player, index) => {
    if (index + 1 !== player.rank) {
      // Setting new rank in db
      this.gameObj.child('players').child(player.key)
        .child('rank').set(index + 1);
    }
  });
  this._movePlayers(options);
};

// See setRanks for documentation
Players.prototype._movePlayers = function(options) {
  console.warn('STARTING MOVE PLAYERS');
  options = options || {};
  var currentPlayers = util.evaluate(this.players);
  this.frames().forEach(frame => {
    var player = frame.player();
    // console.warn('right place?', player.name, player.rank, frame.rank);
    if (player.rank !== frame.rank || player.rank === options.removeRank) {
      // console.warn('Player must be moved');
      // Player must be moved
      frame.moving(player.rank < frame.rank ? 'left_out' : 'right_out');
      var frameBody = $('.frame_' + frame.rank + ' .body');
      frameBody.one('animationend', () => {
        frame.empty(true);
        frame.moving(undefined);
        // console.warn('this.players()', this.players.peek()[0].peek(), this.players.peek()[1].peek());
        if (options.removeRank && frame.rank === this.frames().length) {
          // Remove the last frame
          $('.frame_' + frame.rank).remove();
          this.frames.pop();
        }
        else {
          var newPlayerIndex = util.findIndex(currentPlayers, player => player.rank === frame.rank);
          // TODO: Updates received during movement are ignored
          frame.player(currentPlayers[newPlayerIndex]);
          setTimeout(() => {
            frame.empty(false);
            frame.moving(newPlayerIndex + 1 < frame.rank ? 'left_in' : 'right_in');
            frameBody.one('animationend', () => {
              frame.moving(undefined);
              console.warn('DONE MOVING A PLAYER');
              if (options.callback) {
                options.callback(frame);
              }
            });
          }, 500);
        }
      });
    }
    else {
      options.callback(frame);
    }
  });
};

Players.prototype.onClickPlayerMenu = function(frame, event) {
  var player = frame.player();
  var isHost = player.isHost;
  var items = [{
      title: 'Give point',
      icon: 'fa fa-plus',
      fn: () => this.adjustScore(player.key, 1)
    }, {
      title: 'Take point',
      icon: 'fa fa-minus',
      fn: () => this.adjustScore(player.key, -1)
    }, {
    }, {
      title: 'Mark response guessed',
      icon: 'fa fa-quote-left',
      visible: !isHost && this.game.state() === State.GUESS,
      disabled: player.guessed,
      fn: () => this.game.onGuessed(player.key)
    }, {
      title: 'Sit out this round',
      icon: 'fa fa-bed',
      visible: !isHost,
      fn: () => this.gameObj.child('players').child(player.key).child('asleep').set(true)
    }, {
      title: 'Remove player',
      icon: 'fa fa-ban',
      visible: !isHost,
      fn: () => this.game.removeFromGame(player.key)
  }];
  basicContext.show(items, event.originalEvent);
};

// Adjusts a players score by amt
Players.prototype.adjustScore = function(key, amt) {
  this.gameObj.child('players').child(key).child('score')
  .transaction(currScore => {
      return currScore + amt;
  }, (err, committed, snapshot) => {
    if (!committed) return;
    this.setRanks();
  });
};

Players.prototype.sleepAlert = function() {
  util.alert({
    text: "You're on break",
    buttonText: "Back to the game",
    buttonFunc: () => this.game.playerObj.child('asleep').set(null)
  });
};

// Host only
Players.prototype.onSetScores = function() {
  this.frames().forEach(frame => {
    var adj = frame.scoreAdjustment();
    var key = frame.player().key;
    var scoreRef = this.gameObj.child('players').child(key).child('score');
    scoreRef.once('value', snapshot => scoreRef.set(snapshot.val() + adj));
  });
  this.gameObj.child('state').set(State.RECAP);
  this.setRanks({
    callback: frame => {
      // After animation finishes, show updated scores
      // var playerObj = this.gameObj.child('players').child(frame.player().key);
      // playerObj.child('score').once(score => {
      //   playerObj.child('info').set(score.val().toString());
      // });
    }
  });
};

function Frame(rank, type, obsPlayer) {
  this.rank = rank;
  this.type = type;
  this.player = obsPlayer;
  this.scoreAdjustment = ko.observable(0);
  this.empty = ko.observable(false);
  this.moving = ko.observable(undefined);
}

module.exports = Players;

},{"./State.js":6,"./koFire.js":8,"./util.js":11,"basiccontext":9}],4:[function(require,module,exports){

var ko = require('./koFire.js');
var State = require('./State.js');
var util = require('./util.js');

var DURATION = 3000;

// Handles creation of the list of questions and the poll process
function Poll(game) {
  this.game = game;
  this.timer = new Timer();
  this.spinner = new Spinner();

  this.pollObj = this.game.gameObj.child('poll');

  this.choices = ko.fireArray(this.pollObj.child('choices'));
  this.allowVoting = ko.fireObservable(this.pollObj.child('allowVoting'));
  this.votes = ko.fireArray(this.pollObj.child('votes'));

  util.bindFunc(this.pollObj.child('timeout'), this.onTimeoutChange.bind(this));
  util.bindFunc(this.pollObj.child('spinner'), this.onSpinnerUpdate.bind(this));

  this.votes.subscribe(this.onVotesUpdate.bind(this));
}

Poll.prototype.pickChoices = function() {
  console.warn('picking choices');
  var allQuestions = this.game.app.jsonData.questions;
  var picks = util.randomPicks(allQuestions, 3);
  var labels = ['A', 'B', 'C'];
  for (var i = 0; i < 3; i++) {
    this.pollObj.child('choices').push({
      label: labels[i], text: picks[i]
    });
  }
  this.pollObj.update({
    allowVoting: true,
    timeout: 'ready'
  });
  this.timer.reset();
};

Poll.prototype.onVotesUpdate = function(votes) {
  var numVoters = votes.length;

  // If someone voted, and it isn't already set, set the timeout.
  if (numVoters > 0) {
    this.pollObj.child('timeout').transaction(currTimeout => {
      return currTimeout === 'ready' ? Date.now() + DURATION : undefined;
    });
  }
  // If everyone voted, pick question and change state to respond.
  if (numVoters === this.game.players.awakeCount()) {
    this.timer.stop();
  }
};

Poll.prototype.onTimeoutChange = function(timeout) {
  if (typeof timeout === 'number') {
    this.timer.start(timeout, () => {
      if (this.game.isHost()) {
        this.pickWinner();
      }
    });
  }
};

Poll.prototype.onVote = function(choice) {
  var alreadyVoted = util.find(this.votes(), vote => {
    return vote.playerKey === this.game.playerObj.key();
  });
  if (alreadyVoted) return;
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
  this.votes().forEach(voteData => count[voteData.vote]++);
  var maxVotes = Math.max.apply(null, util.values(count));
  var finalists = Object.keys(count).filter(choice => {
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
  if (spinObj && spinObj.sequence) {
    this.spinner.start(spinObj.choices, spinObj.sequence, spinObj.startIndex, item => {
      if (this.game.isHost()) {
        this.submitWinner(item);
      }
    });
  }
};

// Only called by host
Poll.prototype.submitWinner = function(winner) {
  // Remove all choices except winner
  var removalKeys = [];
  this.choices().forEach(choice => {
    if (choice.label !== winner) removalKeys.push(choice.key);
  });
  removalKeys.forEach(key => this.pollObj.child('choices').child(key).remove());
  this.game.gameObj.update({
    question: winner,
    state: State.RESPOND
  });
};

// A simple countdown timer
function Timer() {
  this.intervalId = null;
  this.isRunning = false;
  this.stopCallback = () => {};
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
  else if (timeLeft < half && timeLeft > 0) {
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
  this.stopCallback = () => {};
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
      $('#' + pick).addClass('selected');
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

},{"./State.js":6,"./koFire.js":8,"./util.js":11}],5:[function(require,module,exports){

var ko = require('./koFire.js');
var State = require('./State.js');
var util = require('./util.js');

// Handles creation and crossing out of the list of responses
function Responses(game) {
  this.game = game;

  var responsesRef = this.game.gameObj.child('responses');
  this.responses = ko.fireArrayObservables(responsesRef, newVal => {
    if (newVal.length === this.game.players.awakeCount()) {
      this.game.gameObj.child('state').set(State.GUESS);
    }
  });
}

module.exports = Responses;

},{"./State.js":6,"./koFire.js":8,"./util.js":11}],6:[function(require,module,exports){

State = {
  INIT: 1,
  POLL: 2,
  RESPOND: 3,
  GUESS: 4,
  SCORE: 5,
  RECAP: 6
};

module.exports = State;

},{}],7:[function(require,module,exports){

var App = require('./App.js');
var ko = require('knockout');

// TODO:
// HIGH Priority - - - - - - - - - - - -
// - Set up watching mode
// - Players joining state (pre-init)
// - If number of sleeping people change, re-check requirements for response(/voting)
// - Test with Safari and Firefox and Mobile

// Bugs:
// - Fix speech signs logic
// - Fix walking animation
// - Players can vote in respond round

// MEDIUM Priority - - - - - - - - - - -
// - Get more questions and filter out bad ones
// - Add more frame shapes (circle)
// - Change colors
// - Smooth transitions
// - Remove game when host leaves (since game will stop running)

// Bugs:
// - Handle sleeping players moving

// LOW Priority / Ideas - - - - - - - - -
// - Games inactive more than 12hr are removed when looked up (add timestamp game actions)

// - Make banners curved
// - Add white backdrop blocks (?)
// - Allow *eliminate players when guessed* setting

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});

},{"./App.js":1,"knockout":10}],8:[function(require,module,exports){

var ko = require('knockout');
var util = require('./util.js');

(function (ko) {
  // Creates an observable array based on a firebase location.
  // Stores the firebase location object as an array of objects with keys inside.
  ko.fireArray = function(firebaseRef, optSubscription) {
    var ka = ko.observableArray();

    if (optSubscription) {
      ka.subscribe(optSubscription);
    }

    firebaseRef.on('child_added', (childSnapshot, prevChildKey) => {
      var child = childSnapshot.val();
      child.key = childSnapshot.key();

      // If no previous child is given, just add it to the end
      if (prevChildKey === undefined) ka.push(child);
      // If previous child is given, but null, ordering is on
      // but this item is the first, so add it to the beginning
      else if (prevChildKey === null) ka.unshift(child);
      // Otherwise, find the correct index to put it in
      else {
        var prevChildIndex = util.findIndex(ka.peek(), item => item.key === prevChildKey);
        ka.splice(prevChildIndex + 1, 0, child);
      }
    });

    firebaseRef.on('child_moved', (childSnapshot, prevChildKey) => {
      var child = childSnapshot.val();
      child.key = childSnapshot.key();

      var oldChildIndex = util.findIndex(ka.peek(), item => item.key === child.key);
      var newChildIndex = 0;

      ka.splice(oldChildIndex, 1);

      if (prevChildKey !== null) {
        newChildIndex = util.findIndex(ka.peek(), item => item.key === prevChildKey) + 1;
      }
      ka.splice(newChildIndex, 0, child);
    });

    firebaseRef.on('child_removed', childSnapshot => {
        var childIndex = util.findIndex(ka.peek(), item => {
          return item.key === childSnapshot.key();
        });
        ka.splice(childIndex, 1);
    });

    return ka;
  };

  ko.fireObservable = function(firebaseRef, optSubscription) {
    var obs = ko.observable();

    if (optSubscription) {
      obs.subscribe(optSubscription);
    }

    firebaseRef.on('value', snapshot => {
      console.warn('fire obs value change', snapshot.val());
      obs(snapshot.val());
    });

    return obs;
  };

  // Subscription is only good for the array
  // Ignores move events, items should not be manually moved.
  // (It should be possible to create a subscription function for items too)
  ko.fireArrayObservables = function(firebaseRef, optArraySubscription) {
    var ka = ko.observableArray();

    if (optArraySubscription) {
      ka.subscribe(optArraySubscription);
    }

    firebaseRef.on('child_added', (childSnapshot, prevChildKey) => {
      var child = childSnapshot.val();
      child.key = childSnapshot.key();
      child = ko.observable(child);

      // If no previous child is given, just add it to the end
      if (prevChildKey === undefined) ka.push(child);
      // If previous child is given, but null, ordering is on
      // but this item is the first, so add it to the beginning
      else if (prevChildKey === null) ka.unshift(child);
      // Otherwise, find the correct index to put it in
      else {
        var prevChildIndex = util.findIndex(ka.peek(), item => {
          return item.peek().key === prevChildKey;
        });
        ka.splice(prevChildIndex + 1, 0, child);
      }
    });

    firebaseRef.on('child_removed', childSnapshot => {
        var childIndex = util.findIndex(ka.peek(), item => {
          return item.peek().key === childSnapshot.key();
        });
        ka.splice(childIndex, 1);
    });

    firebaseRef.on('child_changed', (childSnapshot, prevChildKey) => {
      var child = childSnapshot.val();
      child.key = childSnapshot.key();
      // console.warn('child changed', child);
      // console.warn('state of array playa', ka.peek()[0].peek().name, ka.peek()[1].peek().name);
      // console.warn('state of array rank', ka.peek()[0].peek().rank, ka.peek()[1].peek().rank);
      // console.warn('state of array key', ka.peek()[0].peek().key, ka.peek()[1].peek().key);

      var childIndex = util.findIndex(ka.peek(), item => item.peek().key === child.key);
      var childObs = ka.peek()[childIndex];
      // console.warn('replacing child at', childIndex);
      childObs(child);
    });

    return ka;
  };

  // Nathan Fisher on stack overflow
  ko.bindingHandlers.enterKey = {
    init: function (element, valueAccessor, allBindings, viewModel) {
      var callback = valueAccessor();
      $(element).keypress(function (event) {
        var keyCode = (event.which ? event.which : event.keyCode);
        if (keyCode === 13) {
          callback.call(viewModel);
          return false;
        }
        return true;
      });
    }
  };

})(ko);

module.exports = ko;

},{"./util.js":11,"knockout":10}],9:[function(require,module,exports){
"use strict";!function(n,t){"undefined"!=typeof module&&module.exports?module.exports=t():"function"==typeof define&&define.amd?define(t):window[n]=t()}("basicContext",function(){var n=null,t="item",e="separator",i=function(){var n=arguments.length<=0||void 0===arguments[0]?"":arguments[0];return document.querySelector(".basicContext "+n)},l=function(){var n=arguments.length<=0||void 0===arguments[0]?{}:arguments[0],i=0===Object.keys(n).length?!0:!1;return i===!0&&(n.type=e),null==n.type&&(n.type=t),null==n["class"]&&(n["class"]=""),n.visible!==!1&&(n.visible=!0),null==n.icon&&(n.icon=null),null==n.title&&(n.title="Undefined"),n.disabled!==!0&&(n.disabled=!1),n.disabled===!0&&(n["class"]+=" basicContext__item--disabled"),null==n.fn&&n.type!==e&&n.disabled===!1?(console.warn("Missing fn for item '"+n.title+"'"),!1):!0},o=function(n,i){var o="",r="";return l(n)===!1?"":n.visible===!1?"":(n.num=i,null!==n.icon&&(r="<span class='basicContext__icon "+n.icon+"'></span>"),n.type===t?o="\n		       <tr class='basicContext__item "+n["class"]+"'>\n		           <td class='basicContext__data' data-num='"+n.num+"'>"+r+n.title+"</td>\n		       </tr>\n		       ":n.type===e&&(o="\n		       <tr class='basicContext__item basicContext__item--separator'></tr>\n		       "),o)},r=function(n){var t="";return t+="\n	        <div class='basicContextContainer'>\n	            <div class='basicContext'>\n	                <table>\n	                    <tbody>\n	        ",n.forEach(function(n,e){return t+=o(n,e)}),t+="\n	                    </tbody>\n	                </table>\n	            </div>\n	        </div>\n	        "},a=function(){var n=arguments.length<=0||void 0===arguments[0]?{}:arguments[0],t={x:n.clientX,y:n.clientY};if("touchend"===n.type&&(null==t.x||null==t.y)){var e=n.changedTouches;null!=e&&e.length>0&&(t.x=e[0].clientX,t.y=e[0].clientY)}return(null==t.x||t.x<0)&&(t.x=0),(null==t.y||t.y<0)&&(t.y=0),t},s=function(n,t){var e=a(n),i=e.x,l=e.y,o={width:window.innerWidth,height:window.innerHeight},r={width:t.offsetWidth,height:t.offsetHeight};i+r.width>o.width&&(i-=i+r.width-o.width),l+r.height>o.height&&(l-=l+r.height-o.height),r.height>o.height&&(l=0,t.classList.add("basicContext--scrollable"));var s=e.x-i,u=e.y-l;return{x:i,y:l,rx:s,ry:u}},u=function(){var n=arguments.length<=0||void 0===arguments[0]?{}:arguments[0];return null==n.fn?!1:n.visible===!1?!1:n.disabled===!0?!1:(i("td[data-num='"+n.num+"']").onclick=n.fn,i("td[data-num='"+n.num+"']").oncontextmenu=n.fn,!0)},c=function(t,e,l,o){var a=r(t);document.body.insertAdjacentHTML("beforeend",a),null==n&&(n=document.body.style.overflow,document.body.style.overflow="hidden");var c=i(),d=s(e,c);return c.style.left=d.x+"px",c.style.top=d.y+"px",c.style.transformOrigin=d.rx+"px "+d.ry+"px",c.style.opacity=1,null==l&&(l=f),c.parentElement.onclick=l,c.parentElement.oncontextmenu=l,t.forEach(u),"function"==typeof e.preventDefault&&e.preventDefault(),"function"==typeof e.stopPropagation&&e.stopPropagation(),"function"==typeof o&&o(),!0},d=function(){var n=i();return null==n||0===n.length?!1:!0},f=function(){if(d()===!1)return!1;var t=document.querySelector(".basicContextContainer");return t.parentElement.removeChild(t),null!=n&&(document.body.style.overflow=n,n=null),!0};return{ITEM:t,SEPARATOR:e,show:c,visible:d,close:f}});
},{}],10:[function(require,module,exports){
/*!
 * Knockout JavaScript library v3.4.0
 * (c) Steven Sanderson - http://knockoutjs.com/
 * License: MIT (http://www.opensource.org/licenses/mit-license.php)
 */

(function(){
var DEBUG=true;
(function(undefined){
    // (0, eval)('this') is a robust way of getting a reference to the global object
    // For details, see http://stackoverflow.com/questions/14119988/return-this-0-evalthis/14120023#14120023
    var window = this || (0, eval)('this'),
        document = window['document'],
        navigator = window['navigator'],
        jQueryInstance = window["jQuery"],
        JSON = window["JSON"];
(function(factory) {
    // Support three module loading scenarios
    if (typeof define === 'function' && define['amd']) {
        // [1] AMD anonymous module
        define(['exports', 'require'], factory);
    } else if (typeof exports === 'object' && typeof module === 'object') {
        // [2] CommonJS/Node.js
        factory(module['exports'] || exports);  // module.exports is for Node.js
    } else {
        // [3] No module loader (plain <script> tag) - put directly in global namespace
        factory(window['ko'] = {});
    }
}(function(koExports, amdRequire){
// Internally, all KO objects are attached to koExports (even the non-exported ones whose names will be minified by the closure compiler).
// In the future, the following "ko" variable may be made distinct from "koExports" so that private objects are not externally reachable.
var ko = typeof koExports !== 'undefined' ? koExports : {};
// Google Closure Compiler helpers (used only to make the minified file smaller)
ko.exportSymbol = function(koPath, object) {
    var tokens = koPath.split(".");

    // In the future, "ko" may become distinct from "koExports" (so that non-exported objects are not reachable)
    // At that point, "target" would be set to: (typeof koExports !== "undefined" ? koExports : ko)
    var target = ko;

    for (var i = 0; i < tokens.length - 1; i++)
        target = target[tokens[i]];
    target[tokens[tokens.length - 1]] = object;
};
ko.exportProperty = function(owner, publicName, object) {
    owner[publicName] = object;
};
ko.version = "3.4.0";

ko.exportSymbol('version', ko.version);
// For any options that may affect various areas of Knockout and aren't directly associated with data binding.
ko.options = {
    'deferUpdates': false,
    'useOnlyNativeEvents': false
};

//ko.exportSymbol('options', ko.options);   // 'options' isn't minified
ko.utils = (function () {
    function objectForEach(obj, action) {
        for (var prop in obj) {
            if (obj.hasOwnProperty(prop)) {
                action(prop, obj[prop]);
            }
        }
    }

    function extend(target, source) {
        if (source) {
            for(var prop in source) {
                if(source.hasOwnProperty(prop)) {
                    target[prop] = source[prop];
                }
            }
        }
        return target;
    }

    function setPrototypeOf(obj, proto) {
        obj.__proto__ = proto;
        return obj;
    }

    var canSetPrototype = ({ __proto__: [] } instanceof Array);
    var canUseSymbols = !DEBUG && typeof Symbol === 'function';

    // Represent the known event types in a compact way, then at runtime transform it into a hash with event name as key (for fast lookup)
    var knownEvents = {}, knownEventTypesByEventName = {};
    var keyEventTypeName = (navigator && /Firefox\/2/i.test(navigator.userAgent)) ? 'KeyboardEvent' : 'UIEvents';
    knownEvents[keyEventTypeName] = ['keyup', 'keydown', 'keypress'];
    knownEvents['MouseEvents'] = ['click', 'dblclick', 'mousedown', 'mouseup', 'mousemove', 'mouseover', 'mouseout', 'mouseenter', 'mouseleave'];
    objectForEach(knownEvents, function(eventType, knownEventsForType) {
        if (knownEventsForType.length) {
            for (var i = 0, j = knownEventsForType.length; i < j; i++)
                knownEventTypesByEventName[knownEventsForType[i]] = eventType;
        }
    });
    var eventsThatMustBeRegisteredUsingAttachEvent = { 'propertychange': true }; // Workaround for an IE9 issue - https://github.com/SteveSanderson/knockout/issues/406

    // Detect IE versions for bug workarounds (uses IE conditionals, not UA string, for robustness)
    // Note that, since IE 10 does not support conditional comments, the following logic only detects IE < 10.
    // Currently this is by design, since IE 10+ behaves correctly when treated as a standard browser.
    // If there is a future need to detect specific versions of IE10+, we will amend this.
    var ieVersion = document && (function() {
        var version = 3, div = document.createElement('div'), iElems = div.getElementsByTagName('i');

        // Keep constructing conditional HTML blocks until we hit one that resolves to an empty fragment
        while (
            div.innerHTML = '<!--[if gt IE ' + (++version) + ']><i></i><![endif]-->',
            iElems[0]
        ) {}
        return version > 4 ? version : undefined;
    }());
    var isIe6 = ieVersion === 6,
        isIe7 = ieVersion === 7;

    function isClickOnCheckableElement(element, eventType) {
        if ((ko.utils.tagNameLower(element) !== "input") || !element.type) return false;
        if (eventType.toLowerCase() != "click") return false;
        var inputType = element.type;
        return (inputType == "checkbox") || (inputType == "radio");
    }

    // For details on the pattern for changing node classes
    // see: https://github.com/knockout/knockout/issues/1597
    var cssClassNameRegex = /\S+/g;

    function toggleDomNodeCssClass(node, classNames, shouldHaveClass) {
        var addOrRemoveFn;
        if (classNames) {
            if (typeof node.classList === 'object') {
                addOrRemoveFn = node.classList[shouldHaveClass ? 'add' : 'remove'];
                ko.utils.arrayForEach(classNames.match(cssClassNameRegex), function(className) {
                    addOrRemoveFn.call(node.classList, className);
                });
            } else if (typeof node.className['baseVal'] === 'string') {
                // SVG tag .classNames is an SVGAnimatedString instance
                toggleObjectClassPropertyString(node.className, 'baseVal', classNames, shouldHaveClass);
            } else {
                // node.className ought to be a string.
                toggleObjectClassPropertyString(node, 'className', classNames, shouldHaveClass);
            }
        }
    }

    function toggleObjectClassPropertyString(obj, prop, classNames, shouldHaveClass) {
        // obj/prop is either a node/'className' or a SVGAnimatedString/'baseVal'.
        var currentClassNames = obj[prop].match(cssClassNameRegex) || [];
        ko.utils.arrayForEach(classNames.match(cssClassNameRegex), function(className) {
            ko.utils.addOrRemoveItem(currentClassNames, className, shouldHaveClass);
        });
        obj[prop] = currentClassNames.join(" ");
    }

    return {
        fieldsIncludedWithJsonPost: ['authenticity_token', /^__RequestVerificationToken(_.*)?$/],

        arrayForEach: function (array, action) {
            for (var i = 0, j = array.length; i < j; i++)
                action(array[i], i);
        },

        arrayIndexOf: function (array, item) {
            if (typeof Array.prototype.indexOf == "function")
                return Array.prototype.indexOf.call(array, item);
            for (var i = 0, j = array.length; i < j; i++)
                if (array[i] === item)
                    return i;
            return -1;
        },

        arrayFirst: function (array, predicate, predicateOwner) {
            for (var i = 0, j = array.length; i < j; i++)
                if (predicate.call(predicateOwner, array[i], i))
                    return array[i];
            return null;
        },

        arrayRemoveItem: function (array, itemToRemove) {
            var index = ko.utils.arrayIndexOf(array, itemToRemove);
            if (index > 0) {
                array.splice(index, 1);
            }
            else if (index === 0) {
                array.shift();
            }
        },

        arrayGetDistinctValues: function (array) {
            array = array || [];
            var result = [];
            for (var i = 0, j = array.length; i < j; i++) {
                if (ko.utils.arrayIndexOf(result, array[i]) < 0)
                    result.push(array[i]);
            }
            return result;
        },

        arrayMap: function (array, mapping) {
            array = array || [];
            var result = [];
            for (var i = 0, j = array.length; i < j; i++)
                result.push(mapping(array[i], i));
            return result;
        },

        arrayFilter: function (array, predicate) {
            array = array || [];
            var result = [];
            for (var i = 0, j = array.length; i < j; i++)
                if (predicate(array[i], i))
                    result.push(array[i]);
            return result;
        },

        arrayPushAll: function (array, valuesToPush) {
            if (valuesToPush instanceof Array)
                array.push.apply(array, valuesToPush);
            else
                for (var i = 0, j = valuesToPush.length; i < j; i++)
                    array.push(valuesToPush[i]);
            return array;
        },

        addOrRemoveItem: function(array, value, included) {
            var existingEntryIndex = ko.utils.arrayIndexOf(ko.utils.peekObservable(array), value);
            if (existingEntryIndex < 0) {
                if (included)
                    array.push(value);
            } else {
                if (!included)
                    array.splice(existingEntryIndex, 1);
            }
        },

        canSetPrototype: canSetPrototype,

        extend: extend,

        setPrototypeOf: setPrototypeOf,

        setPrototypeOfOrExtend: canSetPrototype ? setPrototypeOf : extend,

        objectForEach: objectForEach,

        objectMap: function(source, mapping) {
            if (!source)
                return source;
            var target = {};
            for (var prop in source) {
                if (source.hasOwnProperty(prop)) {
                    target[prop] = mapping(source[prop], prop, source);
                }
            }
            return target;
        },

        emptyDomNode: function (domNode) {
            while (domNode.firstChild) {
                ko.removeNode(domNode.firstChild);
            }
        },

        moveCleanedNodesToContainerElement: function(nodes) {
            // Ensure it's a real array, as we're about to reparent the nodes and
            // we don't want the underlying collection to change while we're doing that.
            var nodesArray = ko.utils.makeArray(nodes);
            var templateDocument = (nodesArray[0] && nodesArray[0].ownerDocument) || document;

            var container = templateDocument.createElement('div');
            for (var i = 0, j = nodesArray.length; i < j; i++) {
                container.appendChild(ko.cleanNode(nodesArray[i]));
            }
            return container;
        },

        cloneNodes: function (nodesArray, shouldCleanNodes) {
            for (var i = 0, j = nodesArray.length, newNodesArray = []; i < j; i++) {
                var clonedNode = nodesArray[i].cloneNode(true);
                newNodesArray.push(shouldCleanNodes ? ko.cleanNode(clonedNode) : clonedNode);
            }
            return newNodesArray;
        },

        setDomNodeChildren: function (domNode, childNodes) {
            ko.utils.emptyDomNode(domNode);
            if (childNodes) {
                for (var i = 0, j = childNodes.length; i < j; i++)
                    domNode.appendChild(childNodes[i]);
            }
        },

        replaceDomNodes: function (nodeToReplaceOrNodeArray, newNodesArray) {
            var nodesToReplaceArray = nodeToReplaceOrNodeArray.nodeType ? [nodeToReplaceOrNodeArray] : nodeToReplaceOrNodeArray;
            if (nodesToReplaceArray.length > 0) {
                var insertionPoint = nodesToReplaceArray[0];
                var parent = insertionPoint.parentNode;
                for (var i = 0, j = newNodesArray.length; i < j; i++)
                    parent.insertBefore(newNodesArray[i], insertionPoint);
                for (var i = 0, j = nodesToReplaceArray.length; i < j; i++) {
                    ko.removeNode(nodesToReplaceArray[i]);
                }
            }
        },

        fixUpContinuousNodeArray: function(continuousNodeArray, parentNode) {
            // Before acting on a set of nodes that were previously outputted by a template function, we have to reconcile
            // them against what is in the DOM right now. It may be that some of the nodes have already been removed, or that
            // new nodes might have been inserted in the middle, for example by a binding. Also, there may previously have been
            // leading comment nodes (created by rewritten string-based templates) that have since been removed during binding.
            // So, this function translates the old "map" output array into its best guess of the set of current DOM nodes.
            //
            // Rules:
            //   [A] Any leading nodes that have been removed should be ignored
            //       These most likely correspond to memoization nodes that were already removed during binding
            //       See https://github.com/knockout/knockout/pull/440
            //   [B] Any trailing nodes that have been remove should be ignored
            //       This prevents the code here from adding unrelated nodes to the array while processing rule [C]
            //       See https://github.com/knockout/knockout/pull/1903
            //   [C] We want to output a continuous series of nodes. So, ignore any nodes that have already been removed,
            //       and include any nodes that have been inserted among the previous collection

            if (continuousNodeArray.length) {
                // The parent node can be a virtual element; so get the real parent node
                parentNode = (parentNode.nodeType === 8 && parentNode.parentNode) || parentNode;

                // Rule [A]
                while (continuousNodeArray.length && continuousNodeArray[0].parentNode !== parentNode)
                    continuousNodeArray.splice(0, 1);

                // Rule [B]
                while (continuousNodeArray.length > 1 && continuousNodeArray[continuousNodeArray.length - 1].parentNode !== parentNode)
                    continuousNodeArray.length--;

                // Rule [C]
                if (continuousNodeArray.length > 1) {
                    var current = continuousNodeArray[0], last = continuousNodeArray[continuousNodeArray.length - 1];
                    // Replace with the actual new continuous node set
                    continuousNodeArray.length = 0;
                    while (current !== last) {
                        continuousNodeArray.push(current);
                        current = current.nextSibling;
                    }
                    continuousNodeArray.push(last);
                }
            }
            return continuousNodeArray;
        },

        setOptionNodeSelectionState: function (optionNode, isSelected) {
            // IE6 sometimes throws "unknown error" if you try to write to .selected directly, whereas Firefox struggles with setAttribute. Pick one based on browser.
            if (ieVersion < 7)
                optionNode.setAttribute("selected", isSelected);
            else
                optionNode.selected = isSelected;
        },

        stringTrim: function (string) {
            return string === null || string === undefined ? '' :
                string.trim ?
                    string.trim() :
                    string.toString().replace(/^[\s\xa0]+|[\s\xa0]+$/g, '');
        },

        stringStartsWith: function (string, startsWith) {
            string = string || "";
            if (startsWith.length > string.length)
                return false;
            return string.substring(0, startsWith.length) === startsWith;
        },

        domNodeIsContainedBy: function (node, containedByNode) {
            if (node === containedByNode)
                return true;
            if (node.nodeType === 11)
                return false; // Fixes issue #1162 - can't use node.contains for document fragments on IE8
            if (containedByNode.contains)
                return containedByNode.contains(node.nodeType === 3 ? node.parentNode : node);
            if (containedByNode.compareDocumentPosition)
                return (containedByNode.compareDocumentPosition(node) & 16) == 16;
            while (node && node != containedByNode) {
                node = node.parentNode;
            }
            return !!node;
        },

        domNodeIsAttachedToDocument: function (node) {
            return ko.utils.domNodeIsContainedBy(node, node.ownerDocument.documentElement);
        },

        anyDomNodeIsAttachedToDocument: function(nodes) {
            return !!ko.utils.arrayFirst(nodes, ko.utils.domNodeIsAttachedToDocument);
        },

        tagNameLower: function(element) {
            // For HTML elements, tagName will always be upper case; for XHTML elements, it'll be lower case.
            // Possible future optimization: If we know it's an element from an XHTML document (not HTML),
            // we don't need to do the .toLowerCase() as it will always be lower case anyway.
            return element && element.tagName && element.tagName.toLowerCase();
        },

        catchFunctionErrors: function (delegate) {
            return ko['onError'] ? function () {
                try {
                    return delegate.apply(this, arguments);
                } catch (e) {
                    ko['onError'] && ko['onError'](e);
                    throw e;
                }
            } : delegate;
        },

        setTimeout: function (handler, timeout) {
            return setTimeout(ko.utils.catchFunctionErrors(handler), timeout);
        },

        deferError: function (error) {
            setTimeout(function () {
                ko['onError'] && ko['onError'](error);
                throw error;
            }, 0);
        },

        registerEventHandler: function (element, eventType, handler) {
            var wrappedHandler = ko.utils.catchFunctionErrors(handler);

            var mustUseAttachEvent = ieVersion && eventsThatMustBeRegisteredUsingAttachEvent[eventType];
            if (!ko.options['useOnlyNativeEvents'] && !mustUseAttachEvent && jQueryInstance) {
                jQueryInstance(element)['bind'](eventType, wrappedHandler);
            } else if (!mustUseAttachEvent && typeof element.addEventListener == "function")
                element.addEventListener(eventType, wrappedHandler, false);
            else if (typeof element.attachEvent != "undefined") {
                var attachEventHandler = function (event) { wrappedHandler.call(element, event); },
                    attachEventName = "on" + eventType;
                element.attachEvent(attachEventName, attachEventHandler);

                // IE does not dispose attachEvent handlers automatically (unlike with addEventListener)
                // so to avoid leaks, we have to remove them manually. See bug #856
                ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
                    element.detachEvent(attachEventName, attachEventHandler);
                });
            } else
                throw new Error("Browser doesn't support addEventListener or attachEvent");
        },

        triggerEvent: function (element, eventType) {
            if (!(element && element.nodeType))
                throw new Error("element must be a DOM node when calling triggerEvent");

            // For click events on checkboxes and radio buttons, jQuery toggles the element checked state *after* the
            // event handler runs instead of *before*. (This was fixed in 1.9 for checkboxes but not for radio buttons.)
            // IE doesn't change the checked state when you trigger the click event using "fireEvent".
            // In both cases, we'll use the click method instead.
            var useClickWorkaround = isClickOnCheckableElement(element, eventType);

            if (!ko.options['useOnlyNativeEvents'] && jQueryInstance && !useClickWorkaround) {
                jQueryInstance(element)['trigger'](eventType);
            } else if (typeof document.createEvent == "function") {
                if (typeof element.dispatchEvent == "function") {
                    var eventCategory = knownEventTypesByEventName[eventType] || "HTMLEvents";
                    var event = document.createEvent(eventCategory);
                    event.initEvent(eventType, true, true, window, 0, 0, 0, 0, 0, false, false, false, false, 0, element);
                    element.dispatchEvent(event);
                }
                else
                    throw new Error("The supplied element doesn't support dispatchEvent");
            } else if (useClickWorkaround && element.click) {
                element.click();
            } else if (typeof element.fireEvent != "undefined") {
                element.fireEvent("on" + eventType);
            } else {
                throw new Error("Browser doesn't support triggering events");
            }
        },

        unwrapObservable: function (value) {
            return ko.isObservable(value) ? value() : value;
        },

        peekObservable: function (value) {
            return ko.isObservable(value) ? value.peek() : value;
        },

        toggleDomNodeCssClass: toggleDomNodeCssClass,

        setTextContent: function(element, textContent) {
            var value = ko.utils.unwrapObservable(textContent);
            if ((value === null) || (value === undefined))
                value = "";

            // We need there to be exactly one child: a text node.
            // If there are no children, more than one, or if it's not a text node,
            // we'll clear everything and create a single text node.
            var innerTextNode = ko.virtualElements.firstChild(element);
            if (!innerTextNode || innerTextNode.nodeType != 3 || ko.virtualElements.nextSibling(innerTextNode)) {
                ko.virtualElements.setDomNodeChildren(element, [element.ownerDocument.createTextNode(value)]);
            } else {
                innerTextNode.data = value;
            }

            ko.utils.forceRefresh(element);
        },

        setElementName: function(element, name) {
            element.name = name;

            // Workaround IE 6/7 issue
            // - https://github.com/SteveSanderson/knockout/issues/197
            // - http://www.matts411.com/post/setting_the_name_attribute_in_ie_dom/
            if (ieVersion <= 7) {
                try {
                    element.mergeAttributes(document.createElement("<input name='" + element.name + "'/>"), false);
                }
                catch(e) {} // For IE9 with doc mode "IE9 Standards" and browser mode "IE9 Compatibility View"
            }
        },

        forceRefresh: function(node) {
            // Workaround for an IE9 rendering bug - https://github.com/SteveSanderson/knockout/issues/209
            if (ieVersion >= 9) {
                // For text nodes and comment nodes (most likely virtual elements), we will have to refresh the container
                var elem = node.nodeType == 1 ? node : node.parentNode;
                if (elem.style)
                    elem.style.zoom = elem.style.zoom;
            }
        },

        ensureSelectElementIsRenderedCorrectly: function(selectElement) {
            // Workaround for IE9 rendering bug - it doesn't reliably display all the text in dynamically-added select boxes unless you force it to re-render by updating the width.
            // (See https://github.com/SteveSanderson/knockout/issues/312, http://stackoverflow.com/questions/5908494/select-only-shows-first-char-of-selected-option)
            // Also fixes IE7 and IE8 bug that causes selects to be zero width if enclosed by 'if' or 'with'. (See issue #839)
            if (ieVersion) {
                var originalWidth = selectElement.style.width;
                selectElement.style.width = 0;
                selectElement.style.width = originalWidth;
            }
        },

        range: function (min, max) {
            min = ko.utils.unwrapObservable(min);
            max = ko.utils.unwrapObservable(max);
            var result = [];
            for (var i = min; i <= max; i++)
                result.push(i);
            return result;
        },

        makeArray: function(arrayLikeObject) {
            var result = [];
            for (var i = 0, j = arrayLikeObject.length; i < j; i++) {
                result.push(arrayLikeObject[i]);
            };
            return result;
        },

        createSymbolOrString: function(identifier) {
            return canUseSymbols ? Symbol(identifier) : identifier;
        },

        isIe6 : isIe6,
        isIe7 : isIe7,
        ieVersion : ieVersion,

        getFormFields: function(form, fieldName) {
            var fields = ko.utils.makeArray(form.getElementsByTagName("input")).concat(ko.utils.makeArray(form.getElementsByTagName("textarea")));
            var isMatchingField = (typeof fieldName == 'string')
                ? function(field) { return field.name === fieldName }
                : function(field) { return fieldName.test(field.name) }; // Treat fieldName as regex or object containing predicate
            var matches = [];
            for (var i = fields.length - 1; i >= 0; i--) {
                if (isMatchingField(fields[i]))
                    matches.push(fields[i]);
            };
            return matches;
        },

        parseJson: function (jsonString) {
            if (typeof jsonString == "string") {
                jsonString = ko.utils.stringTrim(jsonString);
                if (jsonString) {
                    if (JSON && JSON.parse) // Use native parsing where available
                        return JSON.parse(jsonString);
                    return (new Function("return " + jsonString))(); // Fallback on less safe parsing for older browsers
                }
            }
            return null;
        },

        stringifyJson: function (data, replacer, space) {   // replacer and space are optional
            if (!JSON || !JSON.stringify)
                throw new Error("Cannot find JSON.stringify(). Some browsers (e.g., IE < 8) don't support it natively, but you can overcome this by adding a script reference to json2.js, downloadable from http://www.json.org/json2.js");
            return JSON.stringify(ko.utils.unwrapObservable(data), replacer, space);
        },

        postJson: function (urlOrForm, data, options) {
            options = options || {};
            var params = options['params'] || {};
            var includeFields = options['includeFields'] || this.fieldsIncludedWithJsonPost;
            var url = urlOrForm;

            // If we were given a form, use its 'action' URL and pick out any requested field values
            if((typeof urlOrForm == 'object') && (ko.utils.tagNameLower(urlOrForm) === "form")) {
                var originalForm = urlOrForm;
                url = originalForm.action;
                for (var i = includeFields.length - 1; i >= 0; i--) {
                    var fields = ko.utils.getFormFields(originalForm, includeFields[i]);
                    for (var j = fields.length - 1; j >= 0; j--)
                        params[fields[j].name] = fields[j].value;
                }
            }

            data = ko.utils.unwrapObservable(data);
            var form = document.createElement("form");
            form.style.display = "none";
            form.action = url;
            form.method = "post";
            for (var key in data) {
                // Since 'data' this is a model object, we include all properties including those inherited from its prototype
                var input = document.createElement("input");
                input.type = "hidden";
                input.name = key;
                input.value = ko.utils.stringifyJson(ko.utils.unwrapObservable(data[key]));
                form.appendChild(input);
            }
            objectForEach(params, function(key, value) {
                var input = document.createElement("input");
                input.type = "hidden";
                input.name = key;
                input.value = value;
                form.appendChild(input);
            });
            document.body.appendChild(form);
            options['submitter'] ? options['submitter'](form) : form.submit();
            setTimeout(function () { form.parentNode.removeChild(form); }, 0);
        }
    }
}());

ko.exportSymbol('utils', ko.utils);
ko.exportSymbol('utils.arrayForEach', ko.utils.arrayForEach);
ko.exportSymbol('utils.arrayFirst', ko.utils.arrayFirst);
ko.exportSymbol('utils.arrayFilter', ko.utils.arrayFilter);
ko.exportSymbol('utils.arrayGetDistinctValues', ko.utils.arrayGetDistinctValues);
ko.exportSymbol('utils.arrayIndexOf', ko.utils.arrayIndexOf);
ko.exportSymbol('utils.arrayMap', ko.utils.arrayMap);
ko.exportSymbol('utils.arrayPushAll', ko.utils.arrayPushAll);
ko.exportSymbol('utils.arrayRemoveItem', ko.utils.arrayRemoveItem);
ko.exportSymbol('utils.extend', ko.utils.extend);
ko.exportSymbol('utils.fieldsIncludedWithJsonPost', ko.utils.fieldsIncludedWithJsonPost);
ko.exportSymbol('utils.getFormFields', ko.utils.getFormFields);
ko.exportSymbol('utils.peekObservable', ko.utils.peekObservable);
ko.exportSymbol('utils.postJson', ko.utils.postJson);
ko.exportSymbol('utils.parseJson', ko.utils.parseJson);
ko.exportSymbol('utils.registerEventHandler', ko.utils.registerEventHandler);
ko.exportSymbol('utils.stringifyJson', ko.utils.stringifyJson);
ko.exportSymbol('utils.range', ko.utils.range);
ko.exportSymbol('utils.toggleDomNodeCssClass', ko.utils.toggleDomNodeCssClass);
ko.exportSymbol('utils.triggerEvent', ko.utils.triggerEvent);
ko.exportSymbol('utils.unwrapObservable', ko.utils.unwrapObservable);
ko.exportSymbol('utils.objectForEach', ko.utils.objectForEach);
ko.exportSymbol('utils.addOrRemoveItem', ko.utils.addOrRemoveItem);
ko.exportSymbol('utils.setTextContent', ko.utils.setTextContent);
ko.exportSymbol('unwrap', ko.utils.unwrapObservable); // Convenient shorthand, because this is used so commonly

if (!Function.prototype['bind']) {
    // Function.prototype.bind is a standard part of ECMAScript 5th Edition (December 2009, http://www.ecma-international.org/publications/files/ECMA-ST/ECMA-262.pdf)
    // In case the browser doesn't implement it natively, provide a JavaScript implementation. This implementation is based on the one in prototype.js
    Function.prototype['bind'] = function (object) {
        var originalFunction = this;
        if (arguments.length === 1) {
            return function () {
                return originalFunction.apply(object, arguments);
            };
        } else {
            var partialArgs = Array.prototype.slice.call(arguments, 1);
            return function () {
                var args = partialArgs.slice(0);
                args.push.apply(args, arguments);
                return originalFunction.apply(object, args);
            };
        }
    };
}

ko.utils.domData = new (function () {
    var uniqueId = 0;
    var dataStoreKeyExpandoPropertyName = "__ko__" + (new Date).getTime();
    var dataStore = {};

    function getAll(node, createIfNotFound) {
        var dataStoreKey = node[dataStoreKeyExpandoPropertyName];
        var hasExistingDataStore = dataStoreKey && (dataStoreKey !== "null") && dataStore[dataStoreKey];
        if (!hasExistingDataStore) {
            if (!createIfNotFound)
                return undefined;
            dataStoreKey = node[dataStoreKeyExpandoPropertyName] = "ko" + uniqueId++;
            dataStore[dataStoreKey] = {};
        }
        return dataStore[dataStoreKey];
    }

    return {
        get: function (node, key) {
            var allDataForNode = getAll(node, false);
            return allDataForNode === undefined ? undefined : allDataForNode[key];
        },
        set: function (node, key, value) {
            if (value === undefined) {
                // Make sure we don't actually create a new domData key if we are actually deleting a value
                if (getAll(node, false) === undefined)
                    return;
            }
            var allDataForNode = getAll(node, true);
            allDataForNode[key] = value;
        },
        clear: function (node) {
            var dataStoreKey = node[dataStoreKeyExpandoPropertyName];
            if (dataStoreKey) {
                delete dataStore[dataStoreKey];
                node[dataStoreKeyExpandoPropertyName] = null;
                return true; // Exposing "did clean" flag purely so specs can infer whether things have been cleaned up as intended
            }
            return false;
        },

        nextKey: function () {
            return (uniqueId++) + dataStoreKeyExpandoPropertyName;
        }
    };
})();

ko.exportSymbol('utils.domData', ko.utils.domData);
ko.exportSymbol('utils.domData.clear', ko.utils.domData.clear); // Exporting only so specs can clear up after themselves fully

ko.utils.domNodeDisposal = new (function () {
    var domDataKey = ko.utils.domData.nextKey();
    var cleanableNodeTypes = { 1: true, 8: true, 9: true };       // Element, Comment, Document
    var cleanableNodeTypesWithDescendants = { 1: true, 9: true }; // Element, Document

    function getDisposeCallbacksCollection(node, createIfNotFound) {
        var allDisposeCallbacks = ko.utils.domData.get(node, domDataKey);
        if ((allDisposeCallbacks === undefined) && createIfNotFound) {
            allDisposeCallbacks = [];
            ko.utils.domData.set(node, domDataKey, allDisposeCallbacks);
        }
        return allDisposeCallbacks;
    }
    function destroyCallbacksCollection(node) {
        ko.utils.domData.set(node, domDataKey, undefined);
    }

    function cleanSingleNode(node) {
        // Run all the dispose callbacks
        var callbacks = getDisposeCallbacksCollection(node, false);
        if (callbacks) {
            callbacks = callbacks.slice(0); // Clone, as the array may be modified during iteration (typically, callbacks will remove themselves)
            for (var i = 0; i < callbacks.length; i++)
                callbacks[i](node);
        }

        // Erase the DOM data
        ko.utils.domData.clear(node);

        // Perform cleanup needed by external libraries (currently only jQuery, but can be extended)
        ko.utils.domNodeDisposal["cleanExternalData"](node);

        // Clear any immediate-child comment nodes, as these wouldn't have been found by
        // node.getElementsByTagName("*") in cleanNode() (comment nodes aren't elements)
        if (cleanableNodeTypesWithDescendants[node.nodeType])
            cleanImmediateCommentTypeChildren(node);
    }

    function cleanImmediateCommentTypeChildren(nodeWithChildren) {
        var child, nextChild = nodeWithChildren.firstChild;
        while (child = nextChild) {
            nextChild = child.nextSibling;
            if (child.nodeType === 8)
                cleanSingleNode(child);
        }
    }

    return {
        addDisposeCallback : function(node, callback) {
            if (typeof callback != "function")
                throw new Error("Callback must be a function");
            getDisposeCallbacksCollection(node, true).push(callback);
        },

        removeDisposeCallback : function(node, callback) {
            var callbacksCollection = getDisposeCallbacksCollection(node, false);
            if (callbacksCollection) {
                ko.utils.arrayRemoveItem(callbacksCollection, callback);
                if (callbacksCollection.length == 0)
                    destroyCallbacksCollection(node);
            }
        },

        cleanNode : function(node) {
            // First clean this node, where applicable
            if (cleanableNodeTypes[node.nodeType]) {
                cleanSingleNode(node);

                // ... then its descendants, where applicable
                if (cleanableNodeTypesWithDescendants[node.nodeType]) {
                    // Clone the descendants list in case it changes during iteration
                    var descendants = [];
                    ko.utils.arrayPushAll(descendants, node.getElementsByTagName("*"));
                    for (var i = 0, j = descendants.length; i < j; i++)
                        cleanSingleNode(descendants[i]);
                }
            }
            return node;
        },

        removeNode : function(node) {
            ko.cleanNode(node);
            if (node.parentNode)
                node.parentNode.removeChild(node);
        },

        "cleanExternalData" : function (node) {
            // Special support for jQuery here because it's so commonly used.
            // Many jQuery plugins (including jquery.tmpl) store data using jQuery's equivalent of domData
            // so notify it to tear down any resources associated with the node & descendants here.
            if (jQueryInstance && (typeof jQueryInstance['cleanData'] == "function"))
                jQueryInstance['cleanData']([node]);
        }
    };
})();
ko.cleanNode = ko.utils.domNodeDisposal.cleanNode; // Shorthand name for convenience
ko.removeNode = ko.utils.domNodeDisposal.removeNode; // Shorthand name for convenience
ko.exportSymbol('cleanNode', ko.cleanNode);
ko.exportSymbol('removeNode', ko.removeNode);
ko.exportSymbol('utils.domNodeDisposal', ko.utils.domNodeDisposal);
ko.exportSymbol('utils.domNodeDisposal.addDisposeCallback', ko.utils.domNodeDisposal.addDisposeCallback);
ko.exportSymbol('utils.domNodeDisposal.removeDisposeCallback', ko.utils.domNodeDisposal.removeDisposeCallback);
(function () {
    var none = [0, "", ""],
        table = [1, "<table>", "</table>"],
        tbody = [2, "<table><tbody>", "</tbody></table>"],
        tr = [3, "<table><tbody><tr>", "</tr></tbody></table>"],
        select = [1, "<select multiple='multiple'>", "</select>"],
        lookup = {
            'thead': table,
            'tbody': table,
            'tfoot': table,
            'tr': tbody,
            'td': tr,
            'th': tr,
            'option': select,
            'optgroup': select
        },

        // This is needed for old IE if you're *not* using either jQuery or innerShiv. Doesn't affect other cases.
        mayRequireCreateElementHack = ko.utils.ieVersion <= 8;

    function getWrap(tags) {
        var m = tags.match(/^<([a-z]+)[ >]/);
        return (m && lookup[m[1]]) || none;
    }

    function simpleHtmlParse(html, documentContext) {
        documentContext || (documentContext = document);
        var windowContext = documentContext['parentWindow'] || documentContext['defaultView'] || window;

        // Based on jQuery's "clean" function, but only accounting for table-related elements.
        // If you have referenced jQuery, this won't be used anyway - KO will use jQuery's "clean" function directly

        // Note that there's still an issue in IE < 9 whereby it will discard comment nodes that are the first child of
        // a descendant node. For example: "<div><!-- mycomment -->abc</div>" will get parsed as "<div>abc</div>"
        // This won't affect anyone who has referenced jQuery, and there's always the workaround of inserting a dummy node
        // (possibly a text node) in front of the comment. So, KO does not attempt to workaround this IE issue automatically at present.

        // Trim whitespace, otherwise indexOf won't work as expected
        var tags = ko.utils.stringTrim(html).toLowerCase(), div = documentContext.createElement("div"),
            wrap = getWrap(tags),
            depth = wrap[0];

        // Go to html and back, then peel off extra wrappers
        // Note that we always prefix with some dummy text, because otherwise, IE<9 will strip out leading comment nodes in descendants. Total madness.
        var markup = "ignored<div>" + wrap[1] + html + wrap[2] + "</div>";
        if (typeof windowContext['innerShiv'] == "function") {
            // Note that innerShiv is deprecated in favour of html5shiv. We should consider adding
            // support for html5shiv (except if no explicit support is needed, e.g., if html5shiv
            // somehow shims the native APIs so it just works anyway)
            div.appendChild(windowContext['innerShiv'](markup));
        } else {
            if (mayRequireCreateElementHack) {
                // The document.createElement('my-element') trick to enable custom elements in IE6-8
                // only works if we assign innerHTML on an element associated with that document.
                documentContext.appendChild(div);
            }

            div.innerHTML = markup;

            if (mayRequireCreateElementHack) {
                div.parentNode.removeChild(div);
            }
        }

        // Move to the right depth
        while (depth--)
            div = div.lastChild;

        return ko.utils.makeArray(div.lastChild.childNodes);
    }

    function jQueryHtmlParse(html, documentContext) {
        // jQuery's "parseHTML" function was introduced in jQuery 1.8.0 and is a documented public API.
        if (jQueryInstance['parseHTML']) {
            return jQueryInstance['parseHTML'](html, documentContext) || []; // Ensure we always return an array and never null
        } else {
            // For jQuery < 1.8.0, we fall back on the undocumented internal "clean" function.
            var elems = jQueryInstance['clean']([html], documentContext);

            // As of jQuery 1.7.1, jQuery parses the HTML by appending it to some dummy parent nodes held in an in-memory document fragment.
            // Unfortunately, it never clears the dummy parent nodes from the document fragment, so it leaks memory over time.
            // Fix this by finding the top-most dummy parent element, and detaching it from its owner fragment.
            if (elems && elems[0]) {
                // Find the top-most parent element that's a direct child of a document fragment
                var elem = elems[0];
                while (elem.parentNode && elem.parentNode.nodeType !== 11 /* i.e., DocumentFragment */)
                    elem = elem.parentNode;
                // ... then detach it
                if (elem.parentNode)
                    elem.parentNode.removeChild(elem);
            }

            return elems;
        }
    }

    ko.utils.parseHtmlFragment = function(html, documentContext) {
        return jQueryInstance ?
            jQueryHtmlParse(html, documentContext) :   // As below, benefit from jQuery's optimisations where possible
            simpleHtmlParse(html, documentContext);  // ... otherwise, this simple logic will do in most common cases.
    };

    ko.utils.setHtml = function(node, html) {
        ko.utils.emptyDomNode(node);

        // There's no legitimate reason to display a stringified observable without unwrapping it, so we'll unwrap it
        html = ko.utils.unwrapObservable(html);

        if ((html !== null) && (html !== undefined)) {
            if (typeof html != 'string')
                html = html.toString();

            // jQuery contains a lot of sophisticated code to parse arbitrary HTML fragments,
            // for example <tr> elements which are not normally allowed to exist on their own.
            // If you've referenced jQuery we'll use that rather than duplicating its code.
            if (jQueryInstance) {
                jQueryInstance(node)['html'](html);
            } else {
                // ... otherwise, use KO's own parsing logic.
                var parsedNodes = ko.utils.parseHtmlFragment(html, node.ownerDocument);
                for (var i = 0; i < parsedNodes.length; i++)
                    node.appendChild(parsedNodes[i]);
            }
        }
    };
})();

ko.exportSymbol('utils.parseHtmlFragment', ko.utils.parseHtmlFragment);
ko.exportSymbol('utils.setHtml', ko.utils.setHtml);

ko.memoization = (function () {
    var memos = {};

    function randomMax8HexChars() {
        return (((1 + Math.random()) * 0x100000000) | 0).toString(16).substring(1);
    }
    function generateRandomId() {
        return randomMax8HexChars() + randomMax8HexChars();
    }
    function findMemoNodes(rootNode, appendToArray) {
        if (!rootNode)
            return;
        if (rootNode.nodeType == 8) {
            var memoId = ko.memoization.parseMemoText(rootNode.nodeValue);
            if (memoId != null)
                appendToArray.push({ domNode: rootNode, memoId: memoId });
        } else if (rootNode.nodeType == 1) {
            for (var i = 0, childNodes = rootNode.childNodes, j = childNodes.length; i < j; i++)
                findMemoNodes(childNodes[i], appendToArray);
        }
    }

    return {
        memoize: function (callback) {
            if (typeof callback != "function")
                throw new Error("You can only pass a function to ko.memoization.memoize()");
            var memoId = generateRandomId();
            memos[memoId] = callback;
            return "<!--[ko_memo:" + memoId + "]-->";
        },

        unmemoize: function (memoId, callbackParams) {
            var callback = memos[memoId];
            if (callback === undefined)
                throw new Error("Couldn't find any memo with ID " + memoId + ". Perhaps it's already been unmemoized.");
            try {
                callback.apply(null, callbackParams || []);
                return true;
            }
            finally { delete memos[memoId]; }
        },

        unmemoizeDomNodeAndDescendants: function (domNode, extraCallbackParamsArray) {
            var memos = [];
            findMemoNodes(domNode, memos);
            for (var i = 0, j = memos.length; i < j; i++) {
                var node = memos[i].domNode;
                var combinedParams = [node];
                if (extraCallbackParamsArray)
                    ko.utils.arrayPushAll(combinedParams, extraCallbackParamsArray);
                ko.memoization.unmemoize(memos[i].memoId, combinedParams);
                node.nodeValue = ""; // Neuter this node so we don't try to unmemoize it again
                if (node.parentNode)
                    node.parentNode.removeChild(node); // If possible, erase it totally (not always possible - someone else might just hold a reference to it then call unmemoizeDomNodeAndDescendants again)
            }
        },

        parseMemoText: function (memoText) {
            var match = memoText.match(/^\[ko_memo\:(.*?)\]$/);
            return match ? match[1] : null;
        }
    };
})();

ko.exportSymbol('memoization', ko.memoization);
ko.exportSymbol('memoization.memoize', ko.memoization.memoize);
ko.exportSymbol('memoization.unmemoize', ko.memoization.unmemoize);
ko.exportSymbol('memoization.parseMemoText', ko.memoization.parseMemoText);
ko.exportSymbol('memoization.unmemoizeDomNodeAndDescendants', ko.memoization.unmemoizeDomNodeAndDescendants);
ko.tasks = (function () {
    var scheduler,
        taskQueue = [],
        taskQueueLength = 0,
        nextHandle = 1,
        nextIndexToProcess = 0;

    if (window['MutationObserver']) {
        // Chrome 27+, Firefox 14+, IE 11+, Opera 15+, Safari 6.1+
        // From https://github.com/petkaantonov/bluebird * Copyright (c) 2014 Petka Antonov * License: MIT
        scheduler = (function (callback) {
            var div = document.createElement("div");
            new MutationObserver(callback).observe(div, {attributes: true});
            return function () { div.classList.toggle("foo"); };
        })(scheduledProcess);
    } else if (document && "onreadystatechange" in document.createElement("script")) {
        // IE 6-10
        // From https://github.com/YuzuJS/setImmediate * Copyright (c) 2012 Barnesandnoble.com, llc, Donavon West, and Domenic Denicola * License: MIT
        scheduler = function (callback) {
            var script = document.createElement("script");
            script.onreadystatechange = function () {
                script.onreadystatechange = null;
                document.documentElement.removeChild(script);
                script = null;
                callback();
            };
            document.documentElement.appendChild(script);
        };
    } else {
        scheduler = function (callback) {
            setTimeout(callback, 0);
        };
    }

    function processTasks() {
        if (taskQueueLength) {
            // Each mark represents the end of a logical group of tasks and the number of these groups is
            // limited to prevent unchecked recursion.
            var mark = taskQueueLength, countMarks = 0;

            // nextIndexToProcess keeps track of where we are in the queue; processTasks can be called recursively without issue
            for (var task; nextIndexToProcess < taskQueueLength; ) {
                if (task = taskQueue[nextIndexToProcess++]) {
                    if (nextIndexToProcess > mark) {
                        if (++countMarks >= 5000) {
                            nextIndexToProcess = taskQueueLength;   // skip all tasks remaining in the queue since any of them could be causing the recursion
                            ko.utils.deferError(Error("'Too much recursion' after processing " + countMarks + " task groups."));
                            break;
                        }
                        mark = taskQueueLength;
                    }
                    try {
                        task();
                    } catch (ex) {
                        ko.utils.deferError(ex);
                    }
                }
            }
        }
    }

    function scheduledProcess() {
        processTasks();

        // Reset the queue
        nextIndexToProcess = taskQueueLength = taskQueue.length = 0;
    }

    function scheduleTaskProcessing() {
        ko.tasks['scheduler'](scheduledProcess);
    }

    var tasks = {
        'scheduler': scheduler,     // Allow overriding the scheduler

        schedule: function (func) {
            if (!taskQueueLength) {
                scheduleTaskProcessing();
            }

            taskQueue[taskQueueLength++] = func;
            return nextHandle++;
        },

        cancel: function (handle) {
            var index = handle - (nextHandle - taskQueueLength);
            if (index >= nextIndexToProcess && index < taskQueueLength) {
                taskQueue[index] = null;
            }
        },

        // For testing only: reset the queue and return the previous queue length
        'resetForTesting': function () {
            var length = taskQueueLength - nextIndexToProcess;
            nextIndexToProcess = taskQueueLength = taskQueue.length = 0;
            return length;
        },

        runEarly: processTasks
    };

    return tasks;
})();

ko.exportSymbol('tasks', ko.tasks);
ko.exportSymbol('tasks.schedule', ko.tasks.schedule);
//ko.exportSymbol('tasks.cancel', ko.tasks.cancel);  "cancel" isn't minified
ko.exportSymbol('tasks.runEarly', ko.tasks.runEarly);
ko.extenders = {
    'throttle': function(target, timeout) {
        // Throttling means two things:

        // (1) For dependent observables, we throttle *evaluations* so that, no matter how fast its dependencies
        //     notify updates, the target doesn't re-evaluate (and hence doesn't notify) faster than a certain rate
        target['throttleEvaluation'] = timeout;

        // (2) For writable targets (observables, or writable dependent observables), we throttle *writes*
        //     so the target cannot change value synchronously or faster than a certain rate
        var writeTimeoutInstance = null;
        return ko.dependentObservable({
            'read': target,
            'write': function(value) {
                clearTimeout(writeTimeoutInstance);
                writeTimeoutInstance = ko.utils.setTimeout(function() {
                    target(value);
                }, timeout);
            }
        });
    },

    'rateLimit': function(target, options) {
        var timeout, method, limitFunction;

        if (typeof options == 'number') {
            timeout = options;
        } else {
            timeout = options['timeout'];
            method = options['method'];
        }

        // rateLimit supersedes deferred updates
        target._deferUpdates = false;

        limitFunction = method == 'notifyWhenChangesStop' ?  debounce : throttle;
        target.limit(function(callback) {
            return limitFunction(callback, timeout);
        });
    },

    'deferred': function(target, options) {
        if (options !== true) {
            throw new Error('The \'deferred\' extender only accepts the value \'true\', because it is not supported to turn deferral off once enabled.')
        }

        if (!target._deferUpdates) {
            target._deferUpdates = true;
            target.limit(function (callback) {
                var handle;
                return function () {
                    ko.tasks.cancel(handle);
                    handle = ko.tasks.schedule(callback);
                    target['notifySubscribers'](undefined, 'dirty');
                };
            });
        }
    },

    'notify': function(target, notifyWhen) {
        target["equalityComparer"] = notifyWhen == "always" ?
            null :  // null equalityComparer means to always notify
            valuesArePrimitiveAndEqual;
    }
};

var primitiveTypes = { 'undefined':1, 'boolean':1, 'number':1, 'string':1 };
function valuesArePrimitiveAndEqual(a, b) {
    var oldValueIsPrimitive = (a === null) || (typeof(a) in primitiveTypes);
    return oldValueIsPrimitive ? (a === b) : false;
}

function throttle(callback, timeout) {
    var timeoutInstance;
    return function () {
        if (!timeoutInstance) {
            timeoutInstance = ko.utils.setTimeout(function () {
                timeoutInstance = undefined;
                callback();
            }, timeout);
        }
    };
}

function debounce(callback, timeout) {
    var timeoutInstance;
    return function () {
        clearTimeout(timeoutInstance);
        timeoutInstance = ko.utils.setTimeout(callback, timeout);
    };
}

function applyExtenders(requestedExtenders) {
    var target = this;
    if (requestedExtenders) {
        ko.utils.objectForEach(requestedExtenders, function(key, value) {
            var extenderHandler = ko.extenders[key];
            if (typeof extenderHandler == 'function') {
                target = extenderHandler(target, value) || target;
            }
        });
    }
    return target;
}

ko.exportSymbol('extenders', ko.extenders);

ko.subscription = function (target, callback, disposeCallback) {
    this._target = target;
    this.callback = callback;
    this.disposeCallback = disposeCallback;
    this.isDisposed = false;
    ko.exportProperty(this, 'dispose', this.dispose);
};
ko.subscription.prototype.dispose = function () {
    this.isDisposed = true;
    this.disposeCallback();
};

ko.subscribable = function () {
    ko.utils.setPrototypeOfOrExtend(this, ko_subscribable_fn);
    ko_subscribable_fn.init(this);
}

var defaultEvent = "change";

// Moved out of "limit" to avoid the extra closure
function limitNotifySubscribers(value, event) {
    if (!event || event === defaultEvent) {
        this._limitChange(value);
    } else if (event === 'beforeChange') {
        this._limitBeforeChange(value);
    } else {
        this._origNotifySubscribers(value, event);
    }
}

var ko_subscribable_fn = {
    init: function(instance) {
        instance._subscriptions = {};
        instance._versionNumber = 1;
    },

    subscribe: function (callback, callbackTarget, event) {
        var self = this;

        event = event || defaultEvent;
        var boundCallback = callbackTarget ? callback.bind(callbackTarget) : callback;

        var subscription = new ko.subscription(self, boundCallback, function () {
            ko.utils.arrayRemoveItem(self._subscriptions[event], subscription);
            if (self.afterSubscriptionRemove)
                self.afterSubscriptionRemove(event);
        });

        if (self.beforeSubscriptionAdd)
            self.beforeSubscriptionAdd(event);

        if (!self._subscriptions[event])
            self._subscriptions[event] = [];
        self._subscriptions[event].push(subscription);

        return subscription;
    },

    "notifySubscribers": function (valueToNotify, event) {
        event = event || defaultEvent;
        if (event === defaultEvent) {
            this.updateVersion();
        }
        if (this.hasSubscriptionsForEvent(event)) {
            try {
                ko.dependencyDetection.begin(); // Begin suppressing dependency detection (by setting the top frame to undefined)
                for (var a = this._subscriptions[event].slice(0), i = 0, subscription; subscription = a[i]; ++i) {
                    // In case a subscription was disposed during the arrayForEach cycle, check
                    // for isDisposed on each subscription before invoking its callback
                    if (!subscription.isDisposed)
                        subscription.callback(valueToNotify);
                }
            } finally {
                ko.dependencyDetection.end(); // End suppressing dependency detection
            }
        }
    },

    getVersion: function () {
        return this._versionNumber;
    },

    hasChanged: function (versionToCheck) {
        return this.getVersion() !== versionToCheck;
    },

    updateVersion: function () {
        ++this._versionNumber;
    },

    limit: function(limitFunction) {
        var self = this, selfIsObservable = ko.isObservable(self),
            ignoreBeforeChange, previousValue, pendingValue, beforeChange = 'beforeChange';

        if (!self._origNotifySubscribers) {
            self._origNotifySubscribers = self["notifySubscribers"];
            self["notifySubscribers"] = limitNotifySubscribers;
        }

        var finish = limitFunction(function() {
            self._notificationIsPending = false;

            // If an observable provided a reference to itself, access it to get the latest value.
            // This allows computed observables to delay calculating their value until needed.
            if (selfIsObservable && pendingValue === self) {
                pendingValue = self();
            }
            ignoreBeforeChange = false;
            if (self.isDifferent(previousValue, pendingValue)) {
                self._origNotifySubscribers(previousValue = pendingValue);
            }
        });

        self._limitChange = function(value) {
            self._notificationIsPending = ignoreBeforeChange = true;
            pendingValue = value;
            finish();
        };
        self._limitBeforeChange = function(value) {
            if (!ignoreBeforeChange) {
                previousValue = value;
                self._origNotifySubscribers(value, beforeChange);
            }
        };
    },

    hasSubscriptionsForEvent: function(event) {
        return this._subscriptions[event] && this._subscriptions[event].length;
    },

    getSubscriptionsCount: function (event) {
        if (event) {
            return this._subscriptions[event] && this._subscriptions[event].length || 0;
        } else {
            var total = 0;
            ko.utils.objectForEach(this._subscriptions, function(eventName, subscriptions) {
                if (eventName !== 'dirty')
                    total += subscriptions.length;
            });
            return total;
        }
    },

    isDifferent: function(oldValue, newValue) {
        return !this['equalityComparer'] || !this['equalityComparer'](oldValue, newValue);
    },

    extend: applyExtenders
};

ko.exportProperty(ko_subscribable_fn, 'subscribe', ko_subscribable_fn.subscribe);
ko.exportProperty(ko_subscribable_fn, 'extend', ko_subscribable_fn.extend);
ko.exportProperty(ko_subscribable_fn, 'getSubscriptionsCount', ko_subscribable_fn.getSubscriptionsCount);

// For browsers that support proto assignment, we overwrite the prototype of each
// observable instance. Since observables are functions, we need Function.prototype
// to still be in the prototype chain.
if (ko.utils.canSetPrototype) {
    ko.utils.setPrototypeOf(ko_subscribable_fn, Function.prototype);
}

ko.subscribable['fn'] = ko_subscribable_fn;


ko.isSubscribable = function (instance) {
    return instance != null && typeof instance.subscribe == "function" && typeof instance["notifySubscribers"] == "function";
};

ko.exportSymbol('subscribable', ko.subscribable);
ko.exportSymbol('isSubscribable', ko.isSubscribable);

ko.computedContext = ko.dependencyDetection = (function () {
    var outerFrames = [],
        currentFrame,
        lastId = 0;

    // Return a unique ID that can be assigned to an observable for dependency tracking.
    // Theoretically, you could eventually overflow the number storage size, resulting
    // in duplicate IDs. But in JavaScript, the largest exact integral value is 2^53
    // or 9,007,199,254,740,992. If you created 1,000,000 IDs per second, it would
    // take over 285 years to reach that number.
    // Reference http://blog.vjeux.com/2010/javascript/javascript-max_int-number-limits.html
    function getId() {
        return ++lastId;
    }

    function begin(options) {
        outerFrames.push(currentFrame);
        currentFrame = options;
    }

    function end() {
        currentFrame = outerFrames.pop();
    }

    return {
        begin: begin,

        end: end,

        registerDependency: function (subscribable) {
            if (currentFrame) {
                if (!ko.isSubscribable(subscribable))
                    throw new Error("Only subscribable things can act as dependencies");
                currentFrame.callback.call(currentFrame.callbackTarget, subscribable, subscribable._id || (subscribable._id = getId()));
            }
        },

        ignore: function (callback, callbackTarget, callbackArgs) {
            try {
                begin();
                return callback.apply(callbackTarget, callbackArgs || []);
            } finally {
                end();
            }
        },

        getDependenciesCount: function () {
            if (currentFrame)
                return currentFrame.computed.getDependenciesCount();
        },

        isInitial: function() {
            if (currentFrame)
                return currentFrame.isInitial;
        }
    };
})();

ko.exportSymbol('computedContext', ko.computedContext);
ko.exportSymbol('computedContext.getDependenciesCount', ko.computedContext.getDependenciesCount);
ko.exportSymbol('computedContext.isInitial', ko.computedContext.isInitial);

ko.exportSymbol('ignoreDependencies', ko.ignoreDependencies = ko.dependencyDetection.ignore);
var observableLatestValue = ko.utils.createSymbolOrString('_latestValue');

ko.observable = function (initialValue) {
    function observable() {
        if (arguments.length > 0) {
            // Write

            // Ignore writes if the value hasn't changed
            if (observable.isDifferent(observable[observableLatestValue], arguments[0])) {
                observable.valueWillMutate();
                observable[observableLatestValue] = arguments[0];
                observable.valueHasMutated();
            }
            return this; // Permits chained assignments
        }
        else {
            // Read
            ko.dependencyDetection.registerDependency(observable); // The caller only needs to be notified of changes if they did a "read" operation
            return observable[observableLatestValue];
        }
    }

    observable[observableLatestValue] = initialValue;

    // Inherit from 'subscribable'
    if (!ko.utils.canSetPrototype) {
        // 'subscribable' won't be on the prototype chain unless we put it there directly
        ko.utils.extend(observable, ko.subscribable['fn']);
    }
    ko.subscribable['fn'].init(observable);

    // Inherit from 'observable'
    ko.utils.setPrototypeOfOrExtend(observable, observableFn);

    if (ko.options['deferUpdates']) {
        ko.extenders['deferred'](observable, true);
    }

    return observable;
}

// Define prototype for observables
var observableFn = {
    'equalityComparer': valuesArePrimitiveAndEqual,
    peek: function() { return this[observableLatestValue]; },
    valueHasMutated: function () { this['notifySubscribers'](this[observableLatestValue]); },
    valueWillMutate: function () { this['notifySubscribers'](this[observableLatestValue], 'beforeChange'); }
};

// Note that for browsers that don't support proto assignment, the
// inheritance chain is created manually in the ko.observable constructor
if (ko.utils.canSetPrototype) {
    ko.utils.setPrototypeOf(observableFn, ko.subscribable['fn']);
}

var protoProperty = ko.observable.protoProperty = '__ko_proto__';
observableFn[protoProperty] = ko.observable;

ko.hasPrototype = function(instance, prototype) {
    if ((instance === null) || (instance === undefined) || (instance[protoProperty] === undefined)) return false;
    if (instance[protoProperty] === prototype) return true;
    return ko.hasPrototype(instance[protoProperty], prototype); // Walk the prototype chain
};

ko.isObservable = function (instance) {
    return ko.hasPrototype(instance, ko.observable);
}
ko.isWriteableObservable = function (instance) {
    // Observable
    if ((typeof instance == 'function') && instance[protoProperty] === ko.observable)
        return true;
    // Writeable dependent observable
    if ((typeof instance == 'function') && (instance[protoProperty] === ko.dependentObservable) && (instance.hasWriteFunction))
        return true;
    // Anything else
    return false;
}

ko.exportSymbol('observable', ko.observable);
ko.exportSymbol('isObservable', ko.isObservable);
ko.exportSymbol('isWriteableObservable', ko.isWriteableObservable);
ko.exportSymbol('isWritableObservable', ko.isWriteableObservable);
ko.exportSymbol('observable.fn', observableFn);
ko.exportProperty(observableFn, 'peek', observableFn.peek);
ko.exportProperty(observableFn, 'valueHasMutated', observableFn.valueHasMutated);
ko.exportProperty(observableFn, 'valueWillMutate', observableFn.valueWillMutate);
ko.observableArray = function (initialValues) {
    initialValues = initialValues || [];

    if (typeof initialValues != 'object' || !('length' in initialValues))
        throw new Error("The argument passed when initializing an observable array must be an array, or null, or undefined.");

    var result = ko.observable(initialValues);
    ko.utils.setPrototypeOfOrExtend(result, ko.observableArray['fn']);
    return result.extend({'trackArrayChanges':true});
};

ko.observableArray['fn'] = {
    'remove': function (valueOrPredicate) {
        var underlyingArray = this.peek();
        var removedValues = [];
        var predicate = typeof valueOrPredicate == "function" && !ko.isObservable(valueOrPredicate) ? valueOrPredicate : function (value) { return value === valueOrPredicate; };
        for (var i = 0; i < underlyingArray.length; i++) {
            var value = underlyingArray[i];
            if (predicate(value)) {
                if (removedValues.length === 0) {
                    this.valueWillMutate();
                }
                removedValues.push(value);
                underlyingArray.splice(i, 1);
                i--;
            }
        }
        if (removedValues.length) {
            this.valueHasMutated();
        }
        return removedValues;
    },

    'removeAll': function (arrayOfValues) {
        // If you passed zero args, we remove everything
        if (arrayOfValues === undefined) {
            var underlyingArray = this.peek();
            var allValues = underlyingArray.slice(0);
            this.valueWillMutate();
            underlyingArray.splice(0, underlyingArray.length);
            this.valueHasMutated();
            return allValues;
        }
        // If you passed an arg, we interpret it as an array of entries to remove
        if (!arrayOfValues)
            return [];
        return this['remove'](function (value) {
            return ko.utils.arrayIndexOf(arrayOfValues, value) >= 0;
        });
    },

    'destroy': function (valueOrPredicate) {
        var underlyingArray = this.peek();
        var predicate = typeof valueOrPredicate == "function" && !ko.isObservable(valueOrPredicate) ? valueOrPredicate : function (value) { return value === valueOrPredicate; };
        this.valueWillMutate();
        for (var i = underlyingArray.length - 1; i >= 0; i--) {
            var value = underlyingArray[i];
            if (predicate(value))
                underlyingArray[i]["_destroy"] = true;
        }
        this.valueHasMutated();
    },

    'destroyAll': function (arrayOfValues) {
        // If you passed zero args, we destroy everything
        if (arrayOfValues === undefined)
            return this['destroy'](function() { return true });

        // If you passed an arg, we interpret it as an array of entries to destroy
        if (!arrayOfValues)
            return [];
        return this['destroy'](function (value) {
            return ko.utils.arrayIndexOf(arrayOfValues, value) >= 0;
        });
    },

    'indexOf': function (item) {
        var underlyingArray = this();
        return ko.utils.arrayIndexOf(underlyingArray, item);
    },

    'replace': function(oldItem, newItem) {
        var index = this['indexOf'](oldItem);
        if (index >= 0) {
            this.valueWillMutate();
            this.peek()[index] = newItem;
            this.valueHasMutated();
        }
    }
};

// Note that for browsers that don't support proto assignment, the
// inheritance chain is created manually in the ko.observableArray constructor
if (ko.utils.canSetPrototype) {
    ko.utils.setPrototypeOf(ko.observableArray['fn'], ko.observable['fn']);
}

// Populate ko.observableArray.fn with read/write functions from native arrays
// Important: Do not add any additional functions here that may reasonably be used to *read* data from the array
// because we'll eval them without causing subscriptions, so ko.computed output could end up getting stale
ko.utils.arrayForEach(["pop", "push", "reverse", "shift", "sort", "splice", "unshift"], function (methodName) {
    ko.observableArray['fn'][methodName] = function () {
        // Use "peek" to avoid creating a subscription in any computed that we're executing in the context of
        // (for consistency with mutating regular observables)
        var underlyingArray = this.peek();
        this.valueWillMutate();
        this.cacheDiffForKnownOperation(underlyingArray, methodName, arguments);
        var methodCallResult = underlyingArray[methodName].apply(underlyingArray, arguments);
        this.valueHasMutated();
        // The native sort and reverse methods return a reference to the array, but it makes more sense to return the observable array instead.
        return methodCallResult === underlyingArray ? this : methodCallResult;
    };
});

// Populate ko.observableArray.fn with read-only functions from native arrays
ko.utils.arrayForEach(["slice"], function (methodName) {
    ko.observableArray['fn'][methodName] = function () {
        var underlyingArray = this();
        return underlyingArray[methodName].apply(underlyingArray, arguments);
    };
});

ko.exportSymbol('observableArray', ko.observableArray);
var arrayChangeEventName = 'arrayChange';
ko.extenders['trackArrayChanges'] = function(target, options) {
    // Use the provided options--each call to trackArrayChanges overwrites the previously set options
    target.compareArrayOptions = {};
    if (options && typeof options == "object") {
        ko.utils.extend(target.compareArrayOptions, options);
    }
    target.compareArrayOptions['sparse'] = true;

    // Only modify the target observable once
    if (target.cacheDiffForKnownOperation) {
        return;
    }
    var trackingChanges = false,
        cachedDiff = null,
        arrayChangeSubscription,
        pendingNotifications = 0,
        underlyingBeforeSubscriptionAddFunction = target.beforeSubscriptionAdd,
        underlyingAfterSubscriptionRemoveFunction = target.afterSubscriptionRemove;

    // Watch "subscribe" calls, and for array change events, ensure change tracking is enabled
    target.beforeSubscriptionAdd = function (event) {
        if (underlyingBeforeSubscriptionAddFunction)
            underlyingBeforeSubscriptionAddFunction.call(target, event);
        if (event === arrayChangeEventName) {
            trackChanges();
        }
    };
    // Watch "dispose" calls, and for array change events, ensure change tracking is disabled when all are disposed
    target.afterSubscriptionRemove = function (event) {
        if (underlyingAfterSubscriptionRemoveFunction)
            underlyingAfterSubscriptionRemoveFunction.call(target, event);
        if (event === arrayChangeEventName && !target.hasSubscriptionsForEvent(arrayChangeEventName)) {
            arrayChangeSubscription.dispose();
            trackingChanges = false;
        }
    };

    function trackChanges() {
        // Calling 'trackChanges' multiple times is the same as calling it once
        if (trackingChanges) {
            return;
        }

        trackingChanges = true;

        // Intercept "notifySubscribers" to track how many times it was called.
        var underlyingNotifySubscribersFunction = target['notifySubscribers'];
        target['notifySubscribers'] = function(valueToNotify, event) {
            if (!event || event === defaultEvent) {
                ++pendingNotifications;
            }
            return underlyingNotifySubscribersFunction.apply(this, arguments);
        };

        // Each time the array changes value, capture a clone so that on the next
        // change it's possible to produce a diff
        var previousContents = [].concat(target.peek() || []);
        cachedDiff = null;
        arrayChangeSubscription = target.subscribe(function(currentContents) {
            // Make a copy of the current contents and ensure it's an array
            currentContents = [].concat(currentContents || []);

            // Compute the diff and issue notifications, but only if someone is listening
            if (target.hasSubscriptionsForEvent(arrayChangeEventName)) {
                var changes = getChanges(previousContents, currentContents);
            }

            // Eliminate references to the old, removed items, so they can be GCed
            previousContents = currentContents;
            cachedDiff = null;
            pendingNotifications = 0;

            if (changes && changes.length) {
                target['notifySubscribers'](changes, arrayChangeEventName);
            }
        });
    }

    function getChanges(previousContents, currentContents) {
        // We try to re-use cached diffs.
        // The scenarios where pendingNotifications > 1 are when using rate-limiting or the Deferred Updates
        // plugin, which without this check would not be compatible with arrayChange notifications. Normally,
        // notifications are issued immediately so we wouldn't be queueing up more than one.
        if (!cachedDiff || pendingNotifications > 1) {
            cachedDiff = ko.utils.compareArrays(previousContents, currentContents, target.compareArrayOptions);
        }

        return cachedDiff;
    }

    target.cacheDiffForKnownOperation = function(rawArray, operationName, args) {
        // Only run if we're currently tracking changes for this observable array
        // and there aren't any pending deferred notifications.
        if (!trackingChanges || pendingNotifications) {
            return;
        }
        var diff = [],
            arrayLength = rawArray.length,
            argsLength = args.length,
            offset = 0;

        function pushDiff(status, value, index) {
            return diff[diff.length] = { 'status': status, 'value': value, 'index': index };
        }
        switch (operationName) {
            case 'push':
                offset = arrayLength;
            case 'unshift':
                for (var index = 0; index < argsLength; index++) {
                    pushDiff('added', args[index], offset + index);
                }
                break;

            case 'pop':
                offset = arrayLength - 1;
            case 'shift':
                if (arrayLength) {
                    pushDiff('deleted', rawArray[offset], offset);
                }
                break;

            case 'splice':
                // Negative start index means 'from end of array'. After that we clamp to [0...arrayLength].
                // See https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Array/splice
                var startIndex = Math.min(Math.max(0, args[0] < 0 ? arrayLength + args[0] : args[0]), arrayLength),
                    endDeleteIndex = argsLength === 1 ? arrayLength : Math.min(startIndex + (args[1] || 0), arrayLength),
                    endAddIndex = startIndex + argsLength - 2,
                    endIndex = Math.max(endDeleteIndex, endAddIndex),
                    additions = [], deletions = [];
                for (var index = startIndex, argsIndex = 2; index < endIndex; ++index, ++argsIndex) {
                    if (index < endDeleteIndex)
                        deletions.push(pushDiff('deleted', rawArray[index], index));
                    if (index < endAddIndex)
                        additions.push(pushDiff('added', args[argsIndex], index));
                }
                ko.utils.findMovesInArrayComparison(deletions, additions);
                break;

            default:
                return;
        }
        cachedDiff = diff;
    };
};
var computedState = ko.utils.createSymbolOrString('_state');

ko.computed = ko.dependentObservable = function (evaluatorFunctionOrOptions, evaluatorFunctionTarget, options) {
    if (typeof evaluatorFunctionOrOptions === "object") {
        // Single-parameter syntax - everything is on this "options" param
        options = evaluatorFunctionOrOptions;
    } else {
        // Multi-parameter syntax - construct the options according to the params passed
        options = options || {};
        if (evaluatorFunctionOrOptions) {
            options["read"] = evaluatorFunctionOrOptions;
        }
    }
    if (typeof options["read"] != "function")
        throw Error("Pass a function that returns the value of the ko.computed");

    var writeFunction = options["write"];
    var state = {
        latestValue: undefined,
        isStale: true,
        isBeingEvaluated: false,
        suppressDisposalUntilDisposeWhenReturnsFalse: false,
        isDisposed: false,
        pure: false,
        isSleeping: false,
        readFunction: options["read"],
        evaluatorFunctionTarget: evaluatorFunctionTarget || options["owner"],
        disposeWhenNodeIsRemoved: options["disposeWhenNodeIsRemoved"] || options.disposeWhenNodeIsRemoved || null,
        disposeWhen: options["disposeWhen"] || options.disposeWhen,
        domNodeDisposalCallback: null,
        dependencyTracking: {},
        dependenciesCount: 0,
        evaluationTimeoutInstance: null
    };

    function computedObservable() {
        if (arguments.length > 0) {
            if (typeof writeFunction === "function") {
                // Writing a value
                writeFunction.apply(state.evaluatorFunctionTarget, arguments);
            } else {
                throw new Error("Cannot write a value to a ko.computed unless you specify a 'write' option. If you wish to read the current value, don't pass any parameters.");
            }
            return this; // Permits chained assignments
        } else {
            // Reading the value
            ko.dependencyDetection.registerDependency(computedObservable);
            if (state.isStale || (state.isSleeping && computedObservable.haveDependenciesChanged())) {
                computedObservable.evaluateImmediate();
            }
            return state.latestValue;
        }
    }

    computedObservable[computedState] = state;
    computedObservable.hasWriteFunction = typeof writeFunction === "function";

    // Inherit from 'subscribable'
    if (!ko.utils.canSetPrototype) {
        // 'subscribable' won't be on the prototype chain unless we put it there directly
        ko.utils.extend(computedObservable, ko.subscribable['fn']);
    }
    ko.subscribable['fn'].init(computedObservable);

    // Inherit from 'computed'
    ko.utils.setPrototypeOfOrExtend(computedObservable, computedFn);

    if (options['pure']) {
        state.pure = true;
        state.isSleeping = true;     // Starts off sleeping; will awake on the first subscription
        ko.utils.extend(computedObservable, pureComputedOverrides);
    } else if (options['deferEvaluation']) {
        ko.utils.extend(computedObservable, deferEvaluationOverrides);
    }

    if (ko.options['deferUpdates']) {
        ko.extenders['deferred'](computedObservable, true);
    }

    if (DEBUG) {
        // #1731 - Aid debugging by exposing the computed's options
        computedObservable["_options"] = options;
    }

    if (state.disposeWhenNodeIsRemoved) {
        // Since this computed is associated with a DOM node, and we don't want to dispose the computed
        // until the DOM node is *removed* from the document (as opposed to never having been in the document),
        // we'll prevent disposal until "disposeWhen" first returns false.
        state.suppressDisposalUntilDisposeWhenReturnsFalse = true;

        // disposeWhenNodeIsRemoved: true can be used to opt into the "only dispose after first false result"
        // behaviour even if there's no specific node to watch. In that case, clear the option so we don't try
        // to watch for a non-node's disposal. This technique is intended for KO's internal use only and shouldn't
        // be documented or used by application code, as it's likely to change in a future version of KO.
        if (!state.disposeWhenNodeIsRemoved.nodeType) {
            state.disposeWhenNodeIsRemoved = null;
        }
    }

    // Evaluate, unless sleeping or deferEvaluation is true
    if (!state.isSleeping && !options['deferEvaluation']) {
        computedObservable.evaluateImmediate();
    }

    // Attach a DOM node disposal callback so that the computed will be proactively disposed as soon as the node is
    // removed using ko.removeNode. But skip if isActive is false (there will never be any dependencies to dispose).
    if (state.disposeWhenNodeIsRemoved && computedObservable.isActive()) {
        ko.utils.domNodeDisposal.addDisposeCallback(state.disposeWhenNodeIsRemoved, state.domNodeDisposalCallback = function () {
            computedObservable.dispose();
        });
    }

    return computedObservable;
};

// Utility function that disposes a given dependencyTracking entry
function computedDisposeDependencyCallback(id, entryToDispose) {
    if (entryToDispose !== null && entryToDispose.dispose) {
        entryToDispose.dispose();
    }
}

// This function gets called each time a dependency is detected while evaluating a computed.
// It's factored out as a shared function to avoid creating unnecessary function instances during evaluation.
function computedBeginDependencyDetectionCallback(subscribable, id) {
    var computedObservable = this.computedObservable,
        state = computedObservable[computedState];
    if (!state.isDisposed) {
        if (this.disposalCount && this.disposalCandidates[id]) {
            // Don't want to dispose this subscription, as it's still being used
            computedObservable.addDependencyTracking(id, subscribable, this.disposalCandidates[id]);
            this.disposalCandidates[id] = null; // No need to actually delete the property - disposalCandidates is a transient object anyway
            --this.disposalCount;
        } else if (!state.dependencyTracking[id]) {
            // Brand new subscription - add it
            computedObservable.addDependencyTracking(id, subscribable, state.isSleeping ? { _target: subscribable } : computedObservable.subscribeToDependency(subscribable));
        }
    }
}

var computedFn = {
    "equalityComparer": valuesArePrimitiveAndEqual,
    getDependenciesCount: function () {
        return this[computedState].dependenciesCount;
    },
    addDependencyTracking: function (id, target, trackingObj) {
        if (this[computedState].pure && target === this) {
            throw Error("A 'pure' computed must not be called recursively");
        }

        this[computedState].dependencyTracking[id] = trackingObj;
        trackingObj._order = this[computedState].dependenciesCount++;
        trackingObj._version = target.getVersion();
    },
    haveDependenciesChanged: function () {
        var id, dependency, dependencyTracking = this[computedState].dependencyTracking;
        for (id in dependencyTracking) {
            if (dependencyTracking.hasOwnProperty(id)) {
                dependency = dependencyTracking[id];
                if (dependency._target.hasChanged(dependency._version)) {
                    return true;
                }
            }
        }
    },
    markDirty: function () {
        // Process "dirty" events if we can handle delayed notifications
        if (this._evalDelayed && !this[computedState].isBeingEvaluated) {
            this._evalDelayed();
        }
    },
    isActive: function () {
        return this[computedState].isStale || this[computedState].dependenciesCount > 0;
    },
    respondToChange: function () {
        // Ignore "change" events if we've already scheduled a delayed notification
        if (!this._notificationIsPending) {
            this.evaluatePossiblyAsync();
        }
    },
    subscribeToDependency: function (target) {
        if (target._deferUpdates && !this[computedState].disposeWhenNodeIsRemoved) {
            var dirtySub = target.subscribe(this.markDirty, this, 'dirty'),
                changeSub = target.subscribe(this.respondToChange, this);
            return {
                _target: target,
                dispose: function () {
                    dirtySub.dispose();
                    changeSub.dispose();
                }
            };
        } else {
            return target.subscribe(this.evaluatePossiblyAsync, this);
        }
    },
    evaluatePossiblyAsync: function () {
        var computedObservable = this,
            throttleEvaluationTimeout = computedObservable['throttleEvaluation'];
        if (throttleEvaluationTimeout && throttleEvaluationTimeout >= 0) {
            clearTimeout(this[computedState].evaluationTimeoutInstance);
            this[computedState].evaluationTimeoutInstance = ko.utils.setTimeout(function () {
                computedObservable.evaluateImmediate(true /*notifyChange*/);
            }, throttleEvaluationTimeout);
        } else if (computedObservable._evalDelayed) {
            computedObservable._evalDelayed();
        } else {
            computedObservable.evaluateImmediate(true /*notifyChange*/);
        }
    },
    evaluateImmediate: function (notifyChange) {
        var computedObservable = this,
            state = computedObservable[computedState],
            disposeWhen = state.disposeWhen;

        if (state.isBeingEvaluated) {
            // If the evaluation of a ko.computed causes side effects, it's possible that it will trigger its own re-evaluation.
            // This is not desirable (it's hard for a developer to realise a chain of dependencies might cause this, and they almost
            // certainly didn't intend infinite re-evaluations). So, for predictability, we simply prevent ko.computeds from causing
            // their own re-evaluation. Further discussion at https://github.com/SteveSanderson/knockout/pull/387
            return;
        }

        // Do not evaluate (and possibly capture new dependencies) if disposed
        if (state.isDisposed) {
            return;
        }

        if (state.disposeWhenNodeIsRemoved && !ko.utils.domNodeIsAttachedToDocument(state.disposeWhenNodeIsRemoved) || disposeWhen && disposeWhen()) {
            // See comment above about suppressDisposalUntilDisposeWhenReturnsFalse
            if (!state.suppressDisposalUntilDisposeWhenReturnsFalse) {
                computedObservable.dispose();
                return;
            }
        } else {
            // It just did return false, so we can stop suppressing now
            state.suppressDisposalUntilDisposeWhenReturnsFalse = false;
        }

        state.isBeingEvaluated = true;
        try {
            this.evaluateImmediate_CallReadWithDependencyDetection(notifyChange);
        } finally {
            state.isBeingEvaluated = false;
        }

        if (!state.dependenciesCount) {
            computedObservable.dispose();
        }
    },
    evaluateImmediate_CallReadWithDependencyDetection: function (notifyChange) {
        // This function is really just part of the evaluateImmediate logic. You would never call it from anywhere else.
        // Factoring it out into a separate function means it can be independent of the try/catch block in evaluateImmediate,
        // which contributes to saving about 40% off the CPU overhead of computed evaluation (on V8 at least).

        var computedObservable = this,
            state = computedObservable[computedState];

        // Initially, we assume that none of the subscriptions are still being used (i.e., all are candidates for disposal).
        // Then, during evaluation, we cross off any that are in fact still being used.
        var isInitial = state.pure ? undefined : !state.dependenciesCount,   // If we're evaluating when there are no previous dependencies, it must be the first time
            dependencyDetectionContext = {
                computedObservable: computedObservable,
                disposalCandidates: state.dependencyTracking,
                disposalCount: state.dependenciesCount
            };

        ko.dependencyDetection.begin({
            callbackTarget: dependencyDetectionContext,
            callback: computedBeginDependencyDetectionCallback,
            computed: computedObservable,
            isInitial: isInitial
        });

        state.dependencyTracking = {};
        state.dependenciesCount = 0;

        var newValue = this.evaluateImmediate_CallReadThenEndDependencyDetection(state, dependencyDetectionContext);

        if (computedObservable.isDifferent(state.latestValue, newValue)) {
            if (!state.isSleeping) {
                computedObservable["notifySubscribers"](state.latestValue, "beforeChange");
            }

            state.latestValue = newValue;

            if (state.isSleeping) {
                computedObservable.updateVersion();
            } else if (notifyChange) {
                computedObservable["notifySubscribers"](state.latestValue);
            }
        }

        if (isInitial) {
            computedObservable["notifySubscribers"](state.latestValue, "awake");
        }
    },
    evaluateImmediate_CallReadThenEndDependencyDetection: function (state, dependencyDetectionContext) {
        // This function is really part of the evaluateImmediate_CallReadWithDependencyDetection logic.
        // You'd never call it from anywhere else. Factoring it out means that evaluateImmediate_CallReadWithDependencyDetection
        // can be independent of try/finally blocks, which contributes to saving about 40% off the CPU
        // overhead of computed evaluation (on V8 at least).

        try {
            var readFunction = state.readFunction;
            return state.evaluatorFunctionTarget ? readFunction.call(state.evaluatorFunctionTarget) : readFunction();
        } finally {
            ko.dependencyDetection.end();

            // For each subscription no longer being used, remove it from the active subscriptions list and dispose it
            if (dependencyDetectionContext.disposalCount && !state.isSleeping) {
                ko.utils.objectForEach(dependencyDetectionContext.disposalCandidates, computedDisposeDependencyCallback);
            }

            state.isStale = false;
        }
    },
    peek: function () {
        // Peek won't re-evaluate, except while the computed is sleeping or to get the initial value when "deferEvaluation" is set.
        var state = this[computedState];
        if ((state.isStale && !state.dependenciesCount) || (state.isSleeping && this.haveDependenciesChanged())) {
            this.evaluateImmediate();
        }
        return state.latestValue;
    },
    limit: function (limitFunction) {
        // Override the limit function with one that delays evaluation as well
        ko.subscribable['fn'].limit.call(this, limitFunction);
        this._evalDelayed = function () {
            this._limitBeforeChange(this[computedState].latestValue);

            this[computedState].isStale = true; // Mark as dirty

            // Pass the observable to the "limit" code, which will access it when
            // it's time to do the notification.
            this._limitChange(this);
        }
    },
    dispose: function () {
        var state = this[computedState];
        if (!state.isSleeping && state.dependencyTracking) {
            ko.utils.objectForEach(state.dependencyTracking, function (id, dependency) {
                if (dependency.dispose)
                    dependency.dispose();
            });
        }
        if (state.disposeWhenNodeIsRemoved && state.domNodeDisposalCallback) {
            ko.utils.domNodeDisposal.removeDisposeCallback(state.disposeWhenNodeIsRemoved, state.domNodeDisposalCallback);
        }
        state.dependencyTracking = null;
        state.dependenciesCount = 0;
        state.isDisposed = true;
        state.isStale = false;
        state.isSleeping = false;
        state.disposeWhenNodeIsRemoved = null;
    }
};

var pureComputedOverrides = {
    beforeSubscriptionAdd: function (event) {
        // If asleep, wake up the computed by subscribing to any dependencies.
        var computedObservable = this,
            state = computedObservable[computedState];
        if (!state.isDisposed && state.isSleeping && event == 'change') {
            state.isSleeping = false;
            if (state.isStale || computedObservable.haveDependenciesChanged()) {
                state.dependencyTracking = null;
                state.dependenciesCount = 0;
                state.isStale = true;
                computedObservable.evaluateImmediate();
            } else {
                // First put the dependencies in order
                var dependeciesOrder = [];
                ko.utils.objectForEach(state.dependencyTracking, function (id, dependency) {
                    dependeciesOrder[dependency._order] = id;
                });
                // Next, subscribe to each one
                ko.utils.arrayForEach(dependeciesOrder, function (id, order) {
                    var dependency = state.dependencyTracking[id],
                        subscription = computedObservable.subscribeToDependency(dependency._target);
                    subscription._order = order;
                    subscription._version = dependency._version;
                    state.dependencyTracking[id] = subscription;
                });
            }
            if (!state.isDisposed) {     // test since evaluating could trigger disposal
                computedObservable["notifySubscribers"](state.latestValue, "awake");
            }
        }
    },
    afterSubscriptionRemove: function (event) {
        var state = this[computedState];
        if (!state.isDisposed && event == 'change' && !this.hasSubscriptionsForEvent('change')) {
            ko.utils.objectForEach(state.dependencyTracking, function (id, dependency) {
                if (dependency.dispose) {
                    state.dependencyTracking[id] = {
                        _target: dependency._target,
                        _order: dependency._order,
                        _version: dependency._version
                    };
                    dependency.dispose();
                }
            });
            state.isSleeping = true;
            this["notifySubscribers"](undefined, "asleep");
        }
    },
    getVersion: function () {
        // Because a pure computed is not automatically updated while it is sleeping, we can't
        // simply return the version number. Instead, we check if any of the dependencies have
        // changed and conditionally re-evaluate the computed observable.
        var state = this[computedState];
        if (state.isSleeping && (state.isStale || this.haveDependenciesChanged())) {
            this.evaluateImmediate();
        }
        return ko.subscribable['fn'].getVersion.call(this);
    }
};

var deferEvaluationOverrides = {
    beforeSubscriptionAdd: function (event) {
        // This will force a computed with deferEvaluation to evaluate when the first subscription is registered.
        if (event == 'change' || event == 'beforeChange') {
            this.peek();
        }
    }
};

// Note that for browsers that don't support proto assignment, the
// inheritance chain is created manually in the ko.computed constructor
if (ko.utils.canSetPrototype) {
    ko.utils.setPrototypeOf(computedFn, ko.subscribable['fn']);
}

// Set the proto chain values for ko.hasPrototype
var protoProp = ko.observable.protoProperty; // == "__ko_proto__"
ko.computed[protoProp] = ko.observable;
computedFn[protoProp] = ko.computed;

ko.isComputed = function (instance) {
    return ko.hasPrototype(instance, ko.computed);
};

ko.isPureComputed = function (instance) {
    return ko.hasPrototype(instance, ko.computed)
        && instance[computedState] && instance[computedState].pure;
};

ko.exportSymbol('computed', ko.computed);
ko.exportSymbol('dependentObservable', ko.computed);    // export ko.dependentObservable for backwards compatibility (1.x)
ko.exportSymbol('isComputed', ko.isComputed);
ko.exportSymbol('isPureComputed', ko.isPureComputed);
ko.exportSymbol('computed.fn', computedFn);
ko.exportProperty(computedFn, 'peek', computedFn.peek);
ko.exportProperty(computedFn, 'dispose', computedFn.dispose);
ko.exportProperty(computedFn, 'isActive', computedFn.isActive);
ko.exportProperty(computedFn, 'getDependenciesCount', computedFn.getDependenciesCount);

ko.pureComputed = function (evaluatorFunctionOrOptions, evaluatorFunctionTarget) {
    if (typeof evaluatorFunctionOrOptions === 'function') {
        return ko.computed(evaluatorFunctionOrOptions, evaluatorFunctionTarget, {'pure':true});
    } else {
        evaluatorFunctionOrOptions = ko.utils.extend({}, evaluatorFunctionOrOptions);   // make a copy of the parameter object
        evaluatorFunctionOrOptions['pure'] = true;
        return ko.computed(evaluatorFunctionOrOptions, evaluatorFunctionTarget);
    }
}
ko.exportSymbol('pureComputed', ko.pureComputed);

(function() {
    var maxNestedObservableDepth = 10; // Escape the (unlikely) pathalogical case where an observable's current value is itself (or similar reference cycle)

    ko.toJS = function(rootObject) {
        if (arguments.length == 0)
            throw new Error("When calling ko.toJS, pass the object you want to convert.");

        // We just unwrap everything at every level in the object graph
        return mapJsObjectGraph(rootObject, function(valueToMap) {
            // Loop because an observable's value might in turn be another observable wrapper
            for (var i = 0; ko.isObservable(valueToMap) && (i < maxNestedObservableDepth); i++)
                valueToMap = valueToMap();
            return valueToMap;
        });
    };

    ko.toJSON = function(rootObject, replacer, space) {     // replacer and space are optional
        var plainJavaScriptObject = ko.toJS(rootObject);
        return ko.utils.stringifyJson(plainJavaScriptObject, replacer, space);
    };

    function mapJsObjectGraph(rootObject, mapInputCallback, visitedObjects) {
        visitedObjects = visitedObjects || new objectLookup();

        rootObject = mapInputCallback(rootObject);
        var canHaveProperties = (typeof rootObject == "object") && (rootObject !== null) && (rootObject !== undefined) && (!(rootObject instanceof RegExp)) && (!(rootObject instanceof Date)) && (!(rootObject instanceof String)) && (!(rootObject instanceof Number)) && (!(rootObject instanceof Boolean));
        if (!canHaveProperties)
            return rootObject;

        var outputProperties = rootObject instanceof Array ? [] : {};
        visitedObjects.save(rootObject, outputProperties);

        visitPropertiesOrArrayEntries(rootObject, function(indexer) {
            var propertyValue = mapInputCallback(rootObject[indexer]);

            switch (typeof propertyValue) {
                case "boolean":
                case "number":
                case "string":
                case "function":
                    outputProperties[indexer] = propertyValue;
                    break;
                case "object":
                case "undefined":
                    var previouslyMappedValue = visitedObjects.get(propertyValue);
                    outputProperties[indexer] = (previouslyMappedValue !== undefined)
                        ? previouslyMappedValue
                        : mapJsObjectGraph(propertyValue, mapInputCallback, visitedObjects);
                    break;
            }
        });

        return outputProperties;
    }

    function visitPropertiesOrArrayEntries(rootObject, visitorCallback) {
        if (rootObject instanceof Array) {
            for (var i = 0; i < rootObject.length; i++)
                visitorCallback(i);

            // For arrays, also respect toJSON property for custom mappings (fixes #278)
            if (typeof rootObject['toJSON'] == 'function')
                visitorCallback('toJSON');
        } else {
            for (var propertyName in rootObject) {
                visitorCallback(propertyName);
            }
        }
    };

    function objectLookup() {
        this.keys = [];
        this.values = [];
    };

    objectLookup.prototype = {
        constructor: objectLookup,
        save: function(key, value) {
            var existingIndex = ko.utils.arrayIndexOf(this.keys, key);
            if (existingIndex >= 0)
                this.values[existingIndex] = value;
            else {
                this.keys.push(key);
                this.values.push(value);
            }
        },
        get: function(key) {
            var existingIndex = ko.utils.arrayIndexOf(this.keys, key);
            return (existingIndex >= 0) ? this.values[existingIndex] : undefined;
        }
    };
})();

ko.exportSymbol('toJS', ko.toJS);
ko.exportSymbol('toJSON', ko.toJSON);
(function () {
    var hasDomDataExpandoProperty = '__ko__hasDomDataOptionValue__';

    // Normally, SELECT elements and their OPTIONs can only take value of type 'string' (because the values
    // are stored on DOM attributes). ko.selectExtensions provides a way for SELECTs/OPTIONs to have values
    // that are arbitrary objects. This is very convenient when implementing things like cascading dropdowns.
    ko.selectExtensions = {
        readValue : function(element) {
            switch (ko.utils.tagNameLower(element)) {
                case 'option':
                    if (element[hasDomDataExpandoProperty] === true)
                        return ko.utils.domData.get(element, ko.bindingHandlers.options.optionValueDomDataKey);
                    return ko.utils.ieVersion <= 7
                        ? (element.getAttributeNode('value') && element.getAttributeNode('value').specified ? element.value : element.text)
                        : element.value;
                case 'select':
                    return element.selectedIndex >= 0 ? ko.selectExtensions.readValue(element.options[element.selectedIndex]) : undefined;
                default:
                    return element.value;
            }
        },

        writeValue: function(element, value, allowUnset) {
            switch (ko.utils.tagNameLower(element)) {
                case 'option':
                    switch(typeof value) {
                        case "string":
                            ko.utils.domData.set(element, ko.bindingHandlers.options.optionValueDomDataKey, undefined);
                            if (hasDomDataExpandoProperty in element) { // IE <= 8 throws errors if you delete non-existent properties from a DOM node
                                delete element[hasDomDataExpandoProperty];
                            }
                            element.value = value;
                            break;
                        default:
                            // Store arbitrary object using DomData
                            ko.utils.domData.set(element, ko.bindingHandlers.options.optionValueDomDataKey, value);
                            element[hasDomDataExpandoProperty] = true;

                            // Special treatment of numbers is just for backward compatibility. KO 1.2.1 wrote numerical values to element.value.
                            element.value = typeof value === "number" ? value : "";
                            break;
                    }
                    break;
                case 'select':
                    if (value === "" || value === null)       // A blank string or null value will select the caption
                        value = undefined;
                    var selection = -1;
                    for (var i = 0, n = element.options.length, optionValue; i < n; ++i) {
                        optionValue = ko.selectExtensions.readValue(element.options[i]);
                        // Include special check to handle selecting a caption with a blank string value
                        if (optionValue == value || (optionValue == "" && value === undefined)) {
                            selection = i;
                            break;
                        }
                    }
                    if (allowUnset || selection >= 0 || (value === undefined && element.size > 1)) {
                        element.selectedIndex = selection;
                    }
                    break;
                default:
                    if ((value === null) || (value === undefined))
                        value = "";
                    element.value = value;
                    break;
            }
        }
    };
})();

ko.exportSymbol('selectExtensions', ko.selectExtensions);
ko.exportSymbol('selectExtensions.readValue', ko.selectExtensions.readValue);
ko.exportSymbol('selectExtensions.writeValue', ko.selectExtensions.writeValue);
ko.expressionRewriting = (function () {
    var javaScriptReservedWords = ["true", "false", "null", "undefined"];

    // Matches something that can be assigned to--either an isolated identifier or something ending with a property accessor
    // This is designed to be simple and avoid false negatives, but could produce false positives (e.g., a+b.c).
    // This also will not properly handle nested brackets (e.g., obj1[obj2['prop']]; see #911).
    var javaScriptAssignmentTarget = /^(?:[$_a-z][$\w]*|(.+)(\.\s*[$_a-z][$\w]*|\[.+\]))$/i;

    function getWriteableValue(expression) {
        if (ko.utils.arrayIndexOf(javaScriptReservedWords, expression) >= 0)
            return false;
        var match = expression.match(javaScriptAssignmentTarget);
        return match === null ? false : match[1] ? ('Object(' + match[1] + ')' + match[2]) : expression;
    }

    // The following regular expressions will be used to split an object-literal string into tokens

        // These two match strings, either with double quotes or single quotes
    var stringDouble = '"(?:[^"\\\\]|\\\\.)*"',
        stringSingle = "'(?:[^'\\\\]|\\\\.)*'",
        // Matches a regular expression (text enclosed by slashes), but will also match sets of divisions
        // as a regular expression (this is handled by the parsing loop below).
        stringRegexp = '/(?:[^/\\\\]|\\\\.)*/\w*',
        // These characters have special meaning to the parser and must not appear in the middle of a
        // token, except as part of a string.
        specials = ',"\'{}()/:[\\]',
        // Match text (at least two characters) that does not contain any of the above special characters,
        // although some of the special characters are allowed to start it (all but the colon and comma).
        // The text can contain spaces, but leading or trailing spaces are skipped.
        everyThingElse = '[^\\s:,/][^' + specials + ']*[^\\s' + specials + ']',
        // Match any non-space character not matched already. This will match colons and commas, since they're
        // not matched by "everyThingElse", but will also match any other single character that wasn't already
        // matched (for example: in "a: 1, b: 2", each of the non-space characters will be matched by oneNotSpace).
        oneNotSpace = '[^\\s]',

        // Create the actual regular expression by or-ing the above strings. The order is important.
        bindingToken = RegExp(stringDouble + '|' + stringSingle + '|' + stringRegexp + '|' + everyThingElse + '|' + oneNotSpace, 'g'),

        // Match end of previous token to determine whether a slash is a division or regex.
        divisionLookBehind = /[\])"'A-Za-z0-9_$]+$/,
        keywordRegexLookBehind = {'in':1,'return':1,'typeof':1};

    function parseObjectLiteral(objectLiteralString) {
        // Trim leading and trailing spaces from the string
        var str = ko.utils.stringTrim(objectLiteralString);

        // Trim braces '{' surrounding the whole object literal
        if (str.charCodeAt(0) === 123) str = str.slice(1, -1);

        // Split into tokens
        var result = [], toks = str.match(bindingToken), key, values = [], depth = 0;

        if (toks) {
            // Append a comma so that we don't need a separate code block to deal with the last item
            toks.push(',');

            for (var i = 0, tok; tok = toks[i]; ++i) {
                var c = tok.charCodeAt(0);
                // A comma signals the end of a key/value pair if depth is zero
                if (c === 44) { // ","
                    if (depth <= 0) {
                        result.push((key && values.length) ? {key: key, value: values.join('')} : {'unknown': key || values.join('')});
                        key = depth = 0;
                        values = [];
                        continue;
                    }
                // Simply skip the colon that separates the name and value
                } else if (c === 58) { // ":"
                    if (!depth && !key && values.length === 1) {
                        key = values.pop();
                        continue;
                    }
                // A set of slashes is initially matched as a regular expression, but could be division
                } else if (c === 47 && i && tok.length > 1) {  // "/"
                    // Look at the end of the previous token to determine if the slash is actually division
                    var match = toks[i-1].match(divisionLookBehind);
                    if (match && !keywordRegexLookBehind[match[0]]) {
                        // The slash is actually a division punctuator; re-parse the remainder of the string (not including the slash)
                        str = str.substr(str.indexOf(tok) + 1);
                        toks = str.match(bindingToken);
                        toks.push(',');
                        i = -1;
                        // Continue with just the slash
                        tok = '/';
                    }
                // Increment depth for parentheses, braces, and brackets so that interior commas are ignored
                } else if (c === 40 || c === 123 || c === 91) { // '(', '{', '['
                    ++depth;
                } else if (c === 41 || c === 125 || c === 93) { // ')', '}', ']'
                    --depth;
                // The key will be the first token; if it's a string, trim the quotes
                } else if (!key && !values.length && (c === 34 || c === 39)) { // '"', "'"
                    tok = tok.slice(1, -1);
                }
                values.push(tok);
            }
        }
        return result;
    }

    // Two-way bindings include a write function that allow the handler to update the value even if it's not an observable.
    var twoWayBindings = {};

    function preProcessBindings(bindingsStringOrKeyValueArray, bindingOptions) {
        bindingOptions = bindingOptions || {};

        function processKeyValue(key, val) {
            var writableVal;
            function callPreprocessHook(obj) {
                return (obj && obj['preprocess']) ? (val = obj['preprocess'](val, key, processKeyValue)) : true;
            }
            if (!bindingParams) {
                if (!callPreprocessHook(ko['getBindingHandler'](key)))
                    return;

                if (twoWayBindings[key] && (writableVal = getWriteableValue(val))) {
                    // For two-way bindings, provide a write method in case the value
                    // isn't a writable observable.
                    propertyAccessorResultStrings.push("'" + key + "':function(_z){" + writableVal + "=_z}");
                }
            }
            // Values are wrapped in a function so that each value can be accessed independently
            if (makeValueAccessors) {
                val = 'function(){return ' + val + ' }';
            }
            resultStrings.push("'" + key + "':" + val);
        }

        var resultStrings = [],
            propertyAccessorResultStrings = [],
            makeValueAccessors = bindingOptions['valueAccessors'],
            bindingParams = bindingOptions['bindingParams'],
            keyValueArray = typeof bindingsStringOrKeyValueArray === "string" ?
                parseObjectLiteral(bindingsStringOrKeyValueArray) : bindingsStringOrKeyValueArray;

        ko.utils.arrayForEach(keyValueArray, function(keyValue) {
            processKeyValue(keyValue.key || keyValue['unknown'], keyValue.value);
        });

        if (propertyAccessorResultStrings.length)
            processKeyValue('_ko_property_writers', "{" + propertyAccessorResultStrings.join(",") + " }");

        return resultStrings.join(",");
    }

    return {
        bindingRewriteValidators: [],

        twoWayBindings: twoWayBindings,

        parseObjectLiteral: parseObjectLiteral,

        preProcessBindings: preProcessBindings,

        keyValueArrayContainsKey: function(keyValueArray, key) {
            for (var i = 0; i < keyValueArray.length; i++)
                if (keyValueArray[i]['key'] == key)
                    return true;
            return false;
        },

        // Internal, private KO utility for updating model properties from within bindings
        // property:            If the property being updated is (or might be) an observable, pass it here
        //                      If it turns out to be a writable observable, it will be written to directly
        // allBindings:         An object with a get method to retrieve bindings in the current execution context.
        //                      This will be searched for a '_ko_property_writers' property in case you're writing to a non-observable
        // key:                 The key identifying the property to be written. Example: for { hasFocus: myValue }, write to 'myValue' by specifying the key 'hasFocus'
        // value:               The value to be written
        // checkIfDifferent:    If true, and if the property being written is a writable observable, the value will only be written if
        //                      it is !== existing value on that writable observable
        writeValueToProperty: function(property, allBindings, key, value, checkIfDifferent) {
            if (!property || !ko.isObservable(property)) {
                var propWriters = allBindings.get('_ko_property_writers');
                if (propWriters && propWriters[key])
                    propWriters[key](value);
            } else if (ko.isWriteableObservable(property) && (!checkIfDifferent || property.peek() !== value)) {
                property(value);
            }
        }
    };
})();

ko.exportSymbol('expressionRewriting', ko.expressionRewriting);
ko.exportSymbol('expressionRewriting.bindingRewriteValidators', ko.expressionRewriting.bindingRewriteValidators);
ko.exportSymbol('expressionRewriting.parseObjectLiteral', ko.expressionRewriting.parseObjectLiteral);
ko.exportSymbol('expressionRewriting.preProcessBindings', ko.expressionRewriting.preProcessBindings);

// Making bindings explicitly declare themselves as "two way" isn't ideal in the long term (it would be better if
// all bindings could use an official 'property writer' API without needing to declare that they might). However,
// since this is not, and has never been, a public API (_ko_property_writers was never documented), it's acceptable
// as an internal implementation detail in the short term.
// For those developers who rely on _ko_property_writers in their custom bindings, we expose _twoWayBindings as an
// undocumented feature that makes it relatively easy to upgrade to KO 3.0. However, this is still not an official
// public API, and we reserve the right to remove it at any time if we create a real public property writers API.
ko.exportSymbol('expressionRewriting._twoWayBindings', ko.expressionRewriting.twoWayBindings);

// For backward compatibility, define the following aliases. (Previously, these function names were misleading because
// they referred to JSON specifically, even though they actually work with arbitrary JavaScript object literal expressions.)
ko.exportSymbol('jsonExpressionRewriting', ko.expressionRewriting);
ko.exportSymbol('jsonExpressionRewriting.insertPropertyAccessorsIntoJson', ko.expressionRewriting.preProcessBindings);
(function() {
    // "Virtual elements" is an abstraction on top of the usual DOM API which understands the notion that comment nodes
    // may be used to represent hierarchy (in addition to the DOM's natural hierarchy).
    // If you call the DOM-manipulating functions on ko.virtualElements, you will be able to read and write the state
    // of that virtual hierarchy
    //
    // The point of all this is to support containerless templates (e.g., <!-- ko foreach:someCollection -->blah<!-- /ko -->)
    // without having to scatter special cases all over the binding and templating code.

    // IE 9 cannot reliably read the "nodeValue" property of a comment node (see https://github.com/SteveSanderson/knockout/issues/186)
    // but it does give them a nonstandard alternative property called "text" that it can read reliably. Other browsers don't have that property.
    // So, use node.text where available, and node.nodeValue elsewhere
    var commentNodesHaveTextProperty = document && document.createComment("test").text === "<!--test-->";

    var startCommentRegex = commentNodesHaveTextProperty ? /^<!--\s*ko(?:\s+([\s\S]+))?\s*-->$/ : /^\s*ko(?:\s+([\s\S]+))?\s*$/;
    var endCommentRegex =   commentNodesHaveTextProperty ? /^<!--\s*\/ko\s*-->$/ : /^\s*\/ko\s*$/;
    var htmlTagsWithOptionallyClosingChildren = { 'ul': true, 'ol': true };

    function isStartComment(node) {
        return (node.nodeType == 8) && startCommentRegex.test(commentNodesHaveTextProperty ? node.text : node.nodeValue);
    }

    function isEndComment(node) {
        return (node.nodeType == 8) && endCommentRegex.test(commentNodesHaveTextProperty ? node.text : node.nodeValue);
    }

    function getVirtualChildren(startComment, allowUnbalanced) {
        var currentNode = startComment;
        var depth = 1;
        var children = [];
        while (currentNode = currentNode.nextSibling) {
            if (isEndComment(currentNode)) {
                depth--;
                if (depth === 0)
                    return children;
            }

            children.push(currentNode);

            if (isStartComment(currentNode))
                depth++;
        }
        if (!allowUnbalanced)
            throw new Error("Cannot find closing comment tag to match: " + startComment.nodeValue);
        return null;
    }

    function getMatchingEndComment(startComment, allowUnbalanced) {
        var allVirtualChildren = getVirtualChildren(startComment, allowUnbalanced);
        if (allVirtualChildren) {
            if (allVirtualChildren.length > 0)
                return allVirtualChildren[allVirtualChildren.length - 1].nextSibling;
            return startComment.nextSibling;
        } else
            return null; // Must have no matching end comment, and allowUnbalanced is true
    }

    function getUnbalancedChildTags(node) {
        // e.g., from <div>OK</div><!-- ko blah --><span>Another</span>, returns: <!-- ko blah --><span>Another</span>
        //       from <div>OK</div><!-- /ko --><!-- /ko -->,             returns: <!-- /ko --><!-- /ko -->
        var childNode = node.firstChild, captureRemaining = null;
        if (childNode) {
            do {
                if (captureRemaining)                   // We already hit an unbalanced node and are now just scooping up all subsequent nodes
                    captureRemaining.push(childNode);
                else if (isStartComment(childNode)) {
                    var matchingEndComment = getMatchingEndComment(childNode, /* allowUnbalanced: */ true);
                    if (matchingEndComment)             // It's a balanced tag, so skip immediately to the end of this virtual set
                        childNode = matchingEndComment;
                    else
                        captureRemaining = [childNode]; // It's unbalanced, so start capturing from this point
                } else if (isEndComment(childNode)) {
                    captureRemaining = [childNode];     // It's unbalanced (if it wasn't, we'd have skipped over it already), so start capturing
                }
            } while (childNode = childNode.nextSibling);
        }
        return captureRemaining;
    }

    ko.virtualElements = {
        allowedBindings: {},

        childNodes: function(node) {
            return isStartComment(node) ? getVirtualChildren(node) : node.childNodes;
        },

        emptyNode: function(node) {
            if (!isStartComment(node))
                ko.utils.emptyDomNode(node);
            else {
                var virtualChildren = ko.virtualElements.childNodes(node);
                for (var i = 0, j = virtualChildren.length; i < j; i++)
                    ko.removeNode(virtualChildren[i]);
            }
        },

        setDomNodeChildren: function(node, childNodes) {
            if (!isStartComment(node))
                ko.utils.setDomNodeChildren(node, childNodes);
            else {
                ko.virtualElements.emptyNode(node);
                var endCommentNode = node.nextSibling; // Must be the next sibling, as we just emptied the children
                for (var i = 0, j = childNodes.length; i < j; i++)
                    endCommentNode.parentNode.insertBefore(childNodes[i], endCommentNode);
            }
        },

        prepend: function(containerNode, nodeToPrepend) {
            if (!isStartComment(containerNode)) {
                if (containerNode.firstChild)
                    containerNode.insertBefore(nodeToPrepend, containerNode.firstChild);
                else
                    containerNode.appendChild(nodeToPrepend);
            } else {
                // Start comments must always have a parent and at least one following sibling (the end comment)
                containerNode.parentNode.insertBefore(nodeToPrepend, containerNode.nextSibling);
            }
        },

        insertAfter: function(containerNode, nodeToInsert, insertAfterNode) {
            if (!insertAfterNode) {
                ko.virtualElements.prepend(containerNode, nodeToInsert);
            } else if (!isStartComment(containerNode)) {
                // Insert after insertion point
                if (insertAfterNode.nextSibling)
                    containerNode.insertBefore(nodeToInsert, insertAfterNode.nextSibling);
                else
                    containerNode.appendChild(nodeToInsert);
            } else {
                // Children of start comments must always have a parent and at least one following sibling (the end comment)
                containerNode.parentNode.insertBefore(nodeToInsert, insertAfterNode.nextSibling);
            }
        },

        firstChild: function(node) {
            if (!isStartComment(node))
                return node.firstChild;
            if (!node.nextSibling || isEndComment(node.nextSibling))
                return null;
            return node.nextSibling;
        },

        nextSibling: function(node) {
            if (isStartComment(node))
                node = getMatchingEndComment(node);
            if (node.nextSibling && isEndComment(node.nextSibling))
                return null;
            return node.nextSibling;
        },

        hasBindingValue: isStartComment,

        virtualNodeBindingValue: function(node) {
            var regexMatch = (commentNodesHaveTextProperty ? node.text : node.nodeValue).match(startCommentRegex);
            return regexMatch ? regexMatch[1] : null;
        },

        normaliseVirtualElementDomStructure: function(elementVerified) {
            // Workaround for https://github.com/SteveSanderson/knockout/issues/155
            // (IE <= 8 or IE 9 quirks mode parses your HTML weirdly, treating closing </li> tags as if they don't exist, thereby moving comment nodes
            // that are direct descendants of <ul> into the preceding <li>)
            if (!htmlTagsWithOptionallyClosingChildren[ko.utils.tagNameLower(elementVerified)])
                return;

            // Scan immediate children to see if they contain unbalanced comment tags. If they do, those comment tags
            // must be intended to appear *after* that child, so move them there.
            var childNode = elementVerified.firstChild;
            if (childNode) {
                do {
                    if (childNode.nodeType === 1) {
                        var unbalancedTags = getUnbalancedChildTags(childNode);
                        if (unbalancedTags) {
                            // Fix up the DOM by moving the unbalanced tags to where they most likely were intended to be placed - *after* the child
                            var nodeToInsertBefore = childNode.nextSibling;
                            for (var i = 0; i < unbalancedTags.length; i++) {
                                if (nodeToInsertBefore)
                                    elementVerified.insertBefore(unbalancedTags[i], nodeToInsertBefore);
                                else
                                    elementVerified.appendChild(unbalancedTags[i]);
                            }
                        }
                    }
                } while (childNode = childNode.nextSibling);
            }
        }
    };
})();
ko.exportSymbol('virtualElements', ko.virtualElements);
ko.exportSymbol('virtualElements.allowedBindings', ko.virtualElements.allowedBindings);
ko.exportSymbol('virtualElements.emptyNode', ko.virtualElements.emptyNode);
//ko.exportSymbol('virtualElements.firstChild', ko.virtualElements.firstChild);     // firstChild is not minified
ko.exportSymbol('virtualElements.insertAfter', ko.virtualElements.insertAfter);
//ko.exportSymbol('virtualElements.nextSibling', ko.virtualElements.nextSibling);   // nextSibling is not minified
ko.exportSymbol('virtualElements.prepend', ko.virtualElements.prepend);
ko.exportSymbol('virtualElements.setDomNodeChildren', ko.virtualElements.setDomNodeChildren);
(function() {
    var defaultBindingAttributeName = "data-bind";

    ko.bindingProvider = function() {
        this.bindingCache = {};
    };

    ko.utils.extend(ko.bindingProvider.prototype, {
        'nodeHasBindings': function(node) {
            switch (node.nodeType) {
                case 1: // Element
                    return node.getAttribute(defaultBindingAttributeName) != null
                        || ko.components['getComponentNameForNode'](node);
                case 8: // Comment node
                    return ko.virtualElements.hasBindingValue(node);
                default: return false;
            }
        },

        'getBindings': function(node, bindingContext) {
            var bindingsString = this['getBindingsString'](node, bindingContext),
                parsedBindings = bindingsString ? this['parseBindingsString'](bindingsString, bindingContext, node) : null;
            return ko.components.addBindingsForCustomElement(parsedBindings, node, bindingContext, /* valueAccessors */ false);
        },

        'getBindingAccessors': function(node, bindingContext) {
            var bindingsString = this['getBindingsString'](node, bindingContext),
                parsedBindings = bindingsString ? this['parseBindingsString'](bindingsString, bindingContext, node, { 'valueAccessors': true }) : null;
            return ko.components.addBindingsForCustomElement(parsedBindings, node, bindingContext, /* valueAccessors */ true);
        },

        // The following function is only used internally by this default provider.
        // It's not part of the interface definition for a general binding provider.
        'getBindingsString': function(node, bindingContext) {
            switch (node.nodeType) {
                case 1: return node.getAttribute(defaultBindingAttributeName);   // Element
                case 8: return ko.virtualElements.virtualNodeBindingValue(node); // Comment node
                default: return null;
            }
        },

        // The following function is only used internally by this default provider.
        // It's not part of the interface definition for a general binding provider.
        'parseBindingsString': function(bindingsString, bindingContext, node, options) {
            try {
                var bindingFunction = createBindingsStringEvaluatorViaCache(bindingsString, this.bindingCache, options);
                return bindingFunction(bindingContext, node);
            } catch (ex) {
                ex.message = "Unable to parse bindings.\nBindings value: " + bindingsString + "\nMessage: " + ex.message;
                throw ex;
            }
        }
    });

    ko.bindingProvider['instance'] = new ko.bindingProvider();

    function createBindingsStringEvaluatorViaCache(bindingsString, cache, options) {
        var cacheKey = bindingsString + (options && options['valueAccessors'] || '');
        return cache[cacheKey]
            || (cache[cacheKey] = createBindingsStringEvaluator(bindingsString, options));
    }

    function createBindingsStringEvaluator(bindingsString, options) {
        // Build the source for a function that evaluates "expression"
        // For each scope variable, add an extra level of "with" nesting
        // Example result: with(sc1) { with(sc0) { return (expression) } }
        var rewrittenBindings = ko.expressionRewriting.preProcessBindings(bindingsString, options),
            functionBody = "with($context){with($data||{}){return{" + rewrittenBindings + "}}}";
        return new Function("$context", "$element", functionBody);
    }
})();

ko.exportSymbol('bindingProvider', ko.bindingProvider);
(function () {
    ko.bindingHandlers = {};

    // The following element types will not be recursed into during binding.
    var bindingDoesNotRecurseIntoElementTypes = {
        // Don't want bindings that operate on text nodes to mutate <script> and <textarea> contents,
        // because it's unexpected and a potential XSS issue.
        // Also bindings should not operate on <template> elements since this breaks in Internet Explorer
        // and because such elements' contents are always intended to be bound in a different context
        // from where they appear in the document.
        'script': true,
        'textarea': true,
        'template': true
    };

    // Use an overridable method for retrieving binding handlers so that a plugins may support dynamically created handlers
    ko['getBindingHandler'] = function(bindingKey) {
        return ko.bindingHandlers[bindingKey];
    };

    // The ko.bindingContext constructor is only called directly to create the root context. For child
    // contexts, use bindingContext.createChildContext or bindingContext.extend.
    ko.bindingContext = function(dataItemOrAccessor, parentContext, dataItemAlias, extendCallback) {

        // The binding context object includes static properties for the current, parent, and root view models.
        // If a view model is actually stored in an observable, the corresponding binding context object, and
        // any child contexts, must be updated when the view model is changed.
        function updateContext() {
            // Most of the time, the context will directly get a view model object, but if a function is given,
            // we call the function to retrieve the view model. If the function accesses any observables or returns
            // an observable, the dependency is tracked, and those observables can later cause the binding
            // context to be updated.
            var dataItemOrObservable = isFunc ? dataItemOrAccessor() : dataItemOrAccessor,
                dataItem = ko.utils.unwrapObservable(dataItemOrObservable);

            if (parentContext) {
                // When a "parent" context is given, register a dependency on the parent context. Thus whenever the
                // parent context is updated, this context will also be updated.
                if (parentContext._subscribable)
                    parentContext._subscribable();

                // Copy $root and any custom properties from the parent context
                ko.utils.extend(self, parentContext);

                // Because the above copy overwrites our own properties, we need to reset them.
                // During the first execution, "subscribable" isn't set, so don't bother doing the update then.
                if (subscribable) {
                    self._subscribable = subscribable;
                }
            } else {
                self['$parents'] = [];
                self['$root'] = dataItem;

                // Export 'ko' in the binding context so it will be available in bindings and templates
                // even if 'ko' isn't exported as a global, such as when using an AMD loader.
                // See https://github.com/SteveSanderson/knockout/issues/490
                self['ko'] = ko;
            }
            self['$rawData'] = dataItemOrObservable;
            self['$data'] = dataItem;
            if (dataItemAlias)
                self[dataItemAlias] = dataItem;

            // The extendCallback function is provided when creating a child context or extending a context.
            // It handles the specific actions needed to finish setting up the binding context. Actions in this
            // function could also add dependencies to this binding context.
            if (extendCallback)
                extendCallback(self, parentContext, dataItem);

            return self['$data'];
        }
        function disposeWhen() {
            return nodes && !ko.utils.anyDomNodeIsAttachedToDocument(nodes);
        }

        var self = this,
            isFunc = typeof(dataItemOrAccessor) == "function" && !ko.isObservable(dataItemOrAccessor),
            nodes,
            subscribable = ko.dependentObservable(updateContext, null, { disposeWhen: disposeWhen, disposeWhenNodeIsRemoved: true });

        // At this point, the binding context has been initialized, and the "subscribable" computed observable is
        // subscribed to any observables that were accessed in the process. If there is nothing to track, the
        // computed will be inactive, and we can safely throw it away. If it's active, the computed is stored in
        // the context object.
        if (subscribable.isActive()) {
            self._subscribable = subscribable;

            // Always notify because even if the model ($data) hasn't changed, other context properties might have changed
            subscribable['equalityComparer'] = null;

            // We need to be able to dispose of this computed observable when it's no longer needed. This would be
            // easy if we had a single node to watch, but binding contexts can be used by many different nodes, and
            // we cannot assume that those nodes have any relation to each other. So instead we track any node that
            // the context is attached to, and dispose the computed when all of those nodes have been cleaned.

            // Add properties to *subscribable* instead of *self* because any properties added to *self* may be overwritten on updates
            nodes = [];
            subscribable._addNode = function(node) {
                nodes.push(node);
                ko.utils.domNodeDisposal.addDisposeCallback(node, function(node) {
                    ko.utils.arrayRemoveItem(nodes, node);
                    if (!nodes.length) {
                        subscribable.dispose();
                        self._subscribable = subscribable = undefined;
                    }
                });
            };
        }
    }

    // Extend the binding context hierarchy with a new view model object. If the parent context is watching
    // any observables, the new child context will automatically get a dependency on the parent context.
    // But this does not mean that the $data value of the child context will also get updated. If the child
    // view model also depends on the parent view model, you must provide a function that returns the correct
    // view model on each update.
    ko.bindingContext.prototype['createChildContext'] = function (dataItemOrAccessor, dataItemAlias, extendCallback) {
        return new ko.bindingContext(dataItemOrAccessor, this, dataItemAlias, function(self, parentContext) {
            // Extend the context hierarchy by setting the appropriate pointers
            self['$parentContext'] = parentContext;
            self['$parent'] = parentContext['$data'];
            self['$parents'] = (parentContext['$parents'] || []).slice(0);
            self['$parents'].unshift(self['$parent']);
            if (extendCallback)
                extendCallback(self);
        });
    };

    // Extend the binding context with new custom properties. This doesn't change the context hierarchy.
    // Similarly to "child" contexts, provide a function here to make sure that the correct values are set
    // when an observable view model is updated.
    ko.bindingContext.prototype['extend'] = function(properties) {
        // If the parent context references an observable view model, "_subscribable" will always be the
        // latest view model object. If not, "_subscribable" isn't set, and we can use the static "$data" value.
        return new ko.bindingContext(this._subscribable || this['$data'], this, null, function(self, parentContext) {
            // This "child" context doesn't directly track a parent observable view model,
            // so we need to manually set the $rawData value to match the parent.
            self['$rawData'] = parentContext['$rawData'];
            ko.utils.extend(self, typeof(properties) == "function" ? properties() : properties);
        });
    };

    // Returns the valueAccesor function for a binding value
    function makeValueAccessor(value) {
        return function() {
            return value;
        };
    }

    // Returns the value of a valueAccessor function
    function evaluateValueAccessor(valueAccessor) {
        return valueAccessor();
    }

    // Given a function that returns bindings, create and return a new object that contains
    // binding value-accessors functions. Each accessor function calls the original function
    // so that it always gets the latest value and all dependencies are captured. This is used
    // by ko.applyBindingsToNode and getBindingsAndMakeAccessors.
    function makeAccessorsFromFunction(callback) {
        return ko.utils.objectMap(ko.dependencyDetection.ignore(callback), function(value, key) {
            return function() {
                return callback()[key];
            };
        });
    }

    // Given a bindings function or object, create and return a new object that contains
    // binding value-accessors functions. This is used by ko.applyBindingsToNode.
    function makeBindingAccessors(bindings, context, node) {
        if (typeof bindings === 'function') {
            return makeAccessorsFromFunction(bindings.bind(null, context, node));
        } else {
            return ko.utils.objectMap(bindings, makeValueAccessor);
        }
    }

    // This function is used if the binding provider doesn't include a getBindingAccessors function.
    // It must be called with 'this' set to the provider instance.
    function getBindingsAndMakeAccessors(node, context) {
        return makeAccessorsFromFunction(this['getBindings'].bind(this, node, context));
    }

    function validateThatBindingIsAllowedForVirtualElements(bindingName) {
        var validator = ko.virtualElements.allowedBindings[bindingName];
        if (!validator)
            throw new Error("The binding '" + bindingName + "' cannot be used with virtual elements")
    }

    function applyBindingsToDescendantsInternal (bindingContext, elementOrVirtualElement, bindingContextsMayDifferFromDomParentElement) {
        var currentChild,
            nextInQueue = ko.virtualElements.firstChild(elementOrVirtualElement),
            provider = ko.bindingProvider['instance'],
            preprocessNode = provider['preprocessNode'];

        // Preprocessing allows a binding provider to mutate a node before bindings are applied to it. For example it's
        // possible to insert new siblings after it, and/or replace the node with a different one. This can be used to
        // implement custom binding syntaxes, such as {{ value }} for string interpolation, or custom element types that
        // trigger insertion of <template> contents at that point in the document.
        if (preprocessNode) {
            while (currentChild = nextInQueue) {
                nextInQueue = ko.virtualElements.nextSibling(currentChild);
                preprocessNode.call(provider, currentChild);
            }
            // Reset nextInQueue for the next loop
            nextInQueue = ko.virtualElements.firstChild(elementOrVirtualElement);
        }

        while (currentChild = nextInQueue) {
            // Keep a record of the next child *before* applying bindings, in case the binding removes the current child from its position
            nextInQueue = ko.virtualElements.nextSibling(currentChild);
            applyBindingsToNodeAndDescendantsInternal(bindingContext, currentChild, bindingContextsMayDifferFromDomParentElement);
        }
    }

    function applyBindingsToNodeAndDescendantsInternal (bindingContext, nodeVerified, bindingContextMayDifferFromDomParentElement) {
        var shouldBindDescendants = true;

        // Perf optimisation: Apply bindings only if...
        // (1) We need to store the binding context on this node (because it may differ from the DOM parent node's binding context)
        //     Note that we can't store binding contexts on non-elements (e.g., text nodes), as IE doesn't allow expando properties for those
        // (2) It might have bindings (e.g., it has a data-bind attribute, or it's a marker for a containerless template)
        var isElement = (nodeVerified.nodeType === 1);
        if (isElement) // Workaround IE <= 8 HTML parsing weirdness
            ko.virtualElements.normaliseVirtualElementDomStructure(nodeVerified);

        var shouldApplyBindings = (isElement && bindingContextMayDifferFromDomParentElement)             // Case (1)
                               || ko.bindingProvider['instance']['nodeHasBindings'](nodeVerified);       // Case (2)
        if (shouldApplyBindings)
            shouldBindDescendants = applyBindingsToNodeInternal(nodeVerified, null, bindingContext, bindingContextMayDifferFromDomParentElement)['shouldBindDescendants'];

        if (shouldBindDescendants && !bindingDoesNotRecurseIntoElementTypes[ko.utils.tagNameLower(nodeVerified)]) {
            // We're recursing automatically into (real or virtual) child nodes without changing binding contexts. So,
            //  * For children of a *real* element, the binding context is certainly the same as on their DOM .parentNode,
            //    hence bindingContextsMayDifferFromDomParentElement is false
            //  * For children of a *virtual* element, we can't be sure. Evaluating .parentNode on those children may
            //    skip over any number of intermediate virtual elements, any of which might define a custom binding context,
            //    hence bindingContextsMayDifferFromDomParentElement is true
            applyBindingsToDescendantsInternal(bindingContext, nodeVerified, /* bindingContextsMayDifferFromDomParentElement: */ !isElement);
        }
    }

    var boundElementDomDataKey = ko.utils.domData.nextKey();


    function topologicalSortBindings(bindings) {
        // Depth-first sort
        var result = [],                // The list of key/handler pairs that we will return
            bindingsConsidered = {},    // A temporary record of which bindings are already in 'result'
            cyclicDependencyStack = []; // Keeps track of a depth-search so that, if there's a cycle, we know which bindings caused it
        ko.utils.objectForEach(bindings, function pushBinding(bindingKey) {
            if (!bindingsConsidered[bindingKey]) {
                var binding = ko['getBindingHandler'](bindingKey);
                if (binding) {
                    // First add dependencies (if any) of the current binding
                    if (binding['after']) {
                        cyclicDependencyStack.push(bindingKey);
                        ko.utils.arrayForEach(binding['after'], function(bindingDependencyKey) {
                            if (bindings[bindingDependencyKey]) {
                                if (ko.utils.arrayIndexOf(cyclicDependencyStack, bindingDependencyKey) !== -1) {
                                    throw Error("Cannot combine the following bindings, because they have a cyclic dependency: " + cyclicDependencyStack.join(", "));
                                } else {
                                    pushBinding(bindingDependencyKey);
                                }
                            }
                        });
                        cyclicDependencyStack.length--;
                    }
                    // Next add the current binding
                    result.push({ key: bindingKey, handler: binding });
                }
                bindingsConsidered[bindingKey] = true;
            }
        });

        return result;
    }

    function applyBindingsToNodeInternal(node, sourceBindings, bindingContext, bindingContextMayDifferFromDomParentElement) {
        // Prevent multiple applyBindings calls for the same node, except when a binding value is specified
        var alreadyBound = ko.utils.domData.get(node, boundElementDomDataKey);
        if (!sourceBindings) {
            if (alreadyBound) {
                throw Error("You cannot apply bindings multiple times to the same element.");
            }
            ko.utils.domData.set(node, boundElementDomDataKey, true);
        }

        // Optimization: Don't store the binding context on this node if it's definitely the same as on node.parentNode, because
        // we can easily recover it just by scanning up the node's ancestors in the DOM
        // (note: here, parent node means "real DOM parent" not "virtual parent", as there's no O(1) way to find the virtual parent)
        if (!alreadyBound && bindingContextMayDifferFromDomParentElement)
            ko.storedBindingContextForNode(node, bindingContext);

        // Use bindings if given, otherwise fall back on asking the bindings provider to give us some bindings
        var bindings;
        if (sourceBindings && typeof sourceBindings !== 'function') {
            bindings = sourceBindings;
        } else {
            var provider = ko.bindingProvider['instance'],
                getBindings = provider['getBindingAccessors'] || getBindingsAndMakeAccessors;

            // Get the binding from the provider within a computed observable so that we can update the bindings whenever
            // the binding context is updated or if the binding provider accesses observables.
            var bindingsUpdater = ko.dependentObservable(
                function() {
                    bindings = sourceBindings ? sourceBindings(bindingContext, node) : getBindings.call(provider, node, bindingContext);
                    // Register a dependency on the binding context to support observable view models.
                    if (bindings && bindingContext._subscribable)
                        bindingContext._subscribable();
                    return bindings;
                },
                null, { disposeWhenNodeIsRemoved: node }
            );

            if (!bindings || !bindingsUpdater.isActive())
                bindingsUpdater = null;
        }

        var bindingHandlerThatControlsDescendantBindings;
        if (bindings) {
            // Return the value accessor for a given binding. When bindings are static (won't be updated because of a binding
            // context update), just return the value accessor from the binding. Otherwise, return a function that always gets
            // the latest binding value and registers a dependency on the binding updater.
            var getValueAccessor = bindingsUpdater
                ? function(bindingKey) {
                    return function() {
                        return evaluateValueAccessor(bindingsUpdater()[bindingKey]);
                    };
                } : function(bindingKey) {
                    return bindings[bindingKey];
                };

            // Use of allBindings as a function is maintained for backwards compatibility, but its use is deprecated
            function allBindings() {
                return ko.utils.objectMap(bindingsUpdater ? bindingsUpdater() : bindings, evaluateValueAccessor);
            }
            // The following is the 3.x allBindings API
            allBindings['get'] = function(key) {
                return bindings[key] && evaluateValueAccessor(getValueAccessor(key));
            };
            allBindings['has'] = function(key) {
                return key in bindings;
            };

            // First put the bindings into the right order
            var orderedBindings = topologicalSortBindings(bindings);

            // Go through the sorted bindings, calling init and update for each
            ko.utils.arrayForEach(orderedBindings, function(bindingKeyAndHandler) {
                // Note that topologicalSortBindings has already filtered out any nonexistent binding handlers,
                // so bindingKeyAndHandler.handler will always be nonnull.
                var handlerInitFn = bindingKeyAndHandler.handler["init"],
                    handlerUpdateFn = bindingKeyAndHandler.handler["update"],
                    bindingKey = bindingKeyAndHandler.key;

                if (node.nodeType === 8) {
                    validateThatBindingIsAllowedForVirtualElements(bindingKey);
                }

                try {
                    // Run init, ignoring any dependencies
                    if (typeof handlerInitFn == "function") {
                        ko.dependencyDetection.ignore(function() {
                            var initResult = handlerInitFn(node, getValueAccessor(bindingKey), allBindings, bindingContext['$data'], bindingContext);

                            // If this binding handler claims to control descendant bindings, make a note of this
                            if (initResult && initResult['controlsDescendantBindings']) {
                                if (bindingHandlerThatControlsDescendantBindings !== undefined)
                                    throw new Error("Multiple bindings (" + bindingHandlerThatControlsDescendantBindings + " and " + bindingKey + ") are trying to control descendant bindings of the same element. You cannot use these bindings together on the same element.");
                                bindingHandlerThatControlsDescendantBindings = bindingKey;
                            }
                        });
                    }

                    // Run update in its own computed wrapper
                    if (typeof handlerUpdateFn == "function") {
                        ko.dependentObservable(
                            function() {
                                handlerUpdateFn(node, getValueAccessor(bindingKey), allBindings, bindingContext['$data'], bindingContext);
                            },
                            null,
                            { disposeWhenNodeIsRemoved: node }
                        );
                    }
                } catch (ex) {
                    ex.message = "Unable to process binding \"" + bindingKey + ": " + bindings[bindingKey] + "\"\nMessage: " + ex.message;
                    throw ex;
                }
            });
        }

        return {
            'shouldBindDescendants': bindingHandlerThatControlsDescendantBindings === undefined
        };
    };

    var storedBindingContextDomDataKey = ko.utils.domData.nextKey();
    ko.storedBindingContextForNode = function (node, bindingContext) {
        if (arguments.length == 2) {
            ko.utils.domData.set(node, storedBindingContextDomDataKey, bindingContext);
            if (bindingContext._subscribable)
                bindingContext._subscribable._addNode(node);
        } else {
            return ko.utils.domData.get(node, storedBindingContextDomDataKey);
        }
    }

    function getBindingContext(viewModelOrBindingContext) {
        return viewModelOrBindingContext && (viewModelOrBindingContext instanceof ko.bindingContext)
            ? viewModelOrBindingContext
            : new ko.bindingContext(viewModelOrBindingContext);
    }

    ko.applyBindingAccessorsToNode = function (node, bindings, viewModelOrBindingContext) {
        if (node.nodeType === 1) // If it's an element, workaround IE <= 8 HTML parsing weirdness
            ko.virtualElements.normaliseVirtualElementDomStructure(node);
        return applyBindingsToNodeInternal(node, bindings, getBindingContext(viewModelOrBindingContext), true);
    };

    ko.applyBindingsToNode = function (node, bindings, viewModelOrBindingContext) {
        var context = getBindingContext(viewModelOrBindingContext);
        return ko.applyBindingAccessorsToNode(node, makeBindingAccessors(bindings, context, node), context);
    };

    ko.applyBindingsToDescendants = function(viewModelOrBindingContext, rootNode) {
        if (rootNode.nodeType === 1 || rootNode.nodeType === 8)
            applyBindingsToDescendantsInternal(getBindingContext(viewModelOrBindingContext), rootNode, true);
    };

    ko.applyBindings = function (viewModelOrBindingContext, rootNode) {
        // If jQuery is loaded after Knockout, we won't initially have access to it. So save it here.
        if (!jQueryInstance && window['jQuery']) {
            jQueryInstance = window['jQuery'];
        }

        if (rootNode && (rootNode.nodeType !== 1) && (rootNode.nodeType !== 8))
            throw new Error("ko.applyBindings: first parameter should be your view model; second parameter should be a DOM node");
        rootNode = rootNode || window.document.body; // Make "rootNode" parameter optional

        applyBindingsToNodeAndDescendantsInternal(getBindingContext(viewModelOrBindingContext), rootNode, true);
    };

    // Retrieving binding context from arbitrary nodes
    ko.contextFor = function(node) {
        // We can only do something meaningful for elements and comment nodes (in particular, not text nodes, as IE can't store domdata for them)
        switch (node.nodeType) {
            case 1:
            case 8:
                var context = ko.storedBindingContextForNode(node);
                if (context) return context;
                if (node.parentNode) return ko.contextFor(node.parentNode);
                break;
        }
        return undefined;
    };
    ko.dataFor = function(node) {
        var context = ko.contextFor(node);
        return context ? context['$data'] : undefined;
    };

    ko.exportSymbol('bindingHandlers', ko.bindingHandlers);
    ko.exportSymbol('applyBindings', ko.applyBindings);
    ko.exportSymbol('applyBindingsToDescendants', ko.applyBindingsToDescendants);
    ko.exportSymbol('applyBindingAccessorsToNode', ko.applyBindingAccessorsToNode);
    ko.exportSymbol('applyBindingsToNode', ko.applyBindingsToNode);
    ko.exportSymbol('contextFor', ko.contextFor);
    ko.exportSymbol('dataFor', ko.dataFor);
})();
(function(undefined) {
    var loadingSubscribablesCache = {}, // Tracks component loads that are currently in flight
        loadedDefinitionsCache = {};    // Tracks component loads that have already completed

    ko.components = {
        get: function(componentName, callback) {
            var cachedDefinition = getObjectOwnProperty(loadedDefinitionsCache, componentName);
            if (cachedDefinition) {
                // It's already loaded and cached. Reuse the same definition object.
                // Note that for API consistency, even cache hits complete asynchronously by default.
                // You can bypass this by putting synchronous:true on your component config.
                if (cachedDefinition.isSynchronousComponent) {
                    ko.dependencyDetection.ignore(function() { // See comment in loaderRegistryBehaviors.js for reasoning
                        callback(cachedDefinition.definition);
                    });
                } else {
                    ko.tasks.schedule(function() { callback(cachedDefinition.definition); });
                }
            } else {
                // Join the loading process that is already underway, or start a new one.
                loadComponentAndNotify(componentName, callback);
            }
        },

        clearCachedDefinition: function(componentName) {
            delete loadedDefinitionsCache[componentName];
        },

        _getFirstResultFromLoaders: getFirstResultFromLoaders
    };

    function getObjectOwnProperty(obj, propName) {
        return obj.hasOwnProperty(propName) ? obj[propName] : undefined;
    }

    function loadComponentAndNotify(componentName, callback) {
        var subscribable = getObjectOwnProperty(loadingSubscribablesCache, componentName),
            completedAsync;
        if (!subscribable) {
            // It's not started loading yet. Start loading, and when it's done, move it to loadedDefinitionsCache.
            subscribable = loadingSubscribablesCache[componentName] = new ko.subscribable();
            subscribable.subscribe(callback);

            beginLoadingComponent(componentName, function(definition, config) {
                var isSynchronousComponent = !!(config && config['synchronous']);
                loadedDefinitionsCache[componentName] = { definition: definition, isSynchronousComponent: isSynchronousComponent };
                delete loadingSubscribablesCache[componentName];

                // For API consistency, all loads complete asynchronously. However we want to avoid
                // adding an extra task schedule if it's unnecessary (i.e., the completion is already
                // async).
                //
                // You can bypass the 'always asynchronous' feature by putting the synchronous:true
                // flag on your component configuration when you register it.
                if (completedAsync || isSynchronousComponent) {
                    // Note that notifySubscribers ignores any dependencies read within the callback.
                    // See comment in loaderRegistryBehaviors.js for reasoning
                    subscribable['notifySubscribers'](definition);
                } else {
                    ko.tasks.schedule(function() {
                        subscribable['notifySubscribers'](definition);
                    });
                }
            });
            completedAsync = true;
        } else {
            subscribable.subscribe(callback);
        }
    }

    function beginLoadingComponent(componentName, callback) {
        getFirstResultFromLoaders('getConfig', [componentName], function(config) {
            if (config) {
                // We have a config, so now load its definition
                getFirstResultFromLoaders('loadComponent', [componentName, config], function(definition) {
                    callback(definition, config);
                });
            } else {
                // The component has no config - it's unknown to all the loaders.
                // Note that this is not an error (e.g., a module loading error) - that would abort the
                // process and this callback would not run. For this callback to run, all loaders must
                // have confirmed they don't know about this component.
                callback(null, null);
            }
        });
    }

    function getFirstResultFromLoaders(methodName, argsExceptCallback, callback, candidateLoaders) {
        // On the first call in the stack, start with the full set of loaders
        if (!candidateLoaders) {
            candidateLoaders = ko.components['loaders'].slice(0); // Use a copy, because we'll be mutating this array
        }

        // Try the next candidate
        var currentCandidateLoader = candidateLoaders.shift();
        if (currentCandidateLoader) {
            var methodInstance = currentCandidateLoader[methodName];
            if (methodInstance) {
                var wasAborted = false,
                    synchronousReturnValue = methodInstance.apply(currentCandidateLoader, argsExceptCallback.concat(function(result) {
                        if (wasAborted) {
                            callback(null);
                        } else if (result !== null) {
                            // This candidate returned a value. Use it.
                            callback(result);
                        } else {
                            // Try the next candidate
                            getFirstResultFromLoaders(methodName, argsExceptCallback, callback, candidateLoaders);
                        }
                    }));

                // Currently, loaders may not return anything synchronously. This leaves open the possibility
                // that we'll extend the API to support synchronous return values in the future. It won't be
                // a breaking change, because currently no loader is allowed to return anything except undefined.
                if (synchronousReturnValue !== undefined) {
                    wasAborted = true;

                    // Method to suppress exceptions will remain undocumented. This is only to keep
                    // KO's specs running tidily, since we can observe the loading got aborted without
                    // having exceptions cluttering up the console too.
                    if (!currentCandidateLoader['suppressLoaderExceptions']) {
                        throw new Error('Component loaders must supply values by invoking the callback, not by returning values synchronously.');
                    }
                }
            } else {
                // This candidate doesn't have the relevant handler. Synchronously move on to the next one.
                getFirstResultFromLoaders(methodName, argsExceptCallback, callback, candidateLoaders);
            }
        } else {
            // No candidates returned a value
            callback(null);
        }
    }

    // Reference the loaders via string name so it's possible for developers
    // to replace the whole array by assigning to ko.components.loaders
    ko.components['loaders'] = [];

    ko.exportSymbol('components', ko.components);
    ko.exportSymbol('components.get', ko.components.get);
    ko.exportSymbol('components.clearCachedDefinition', ko.components.clearCachedDefinition);
})();
(function(undefined) {

    // The default loader is responsible for two things:
    // 1. Maintaining the default in-memory registry of component configuration objects
    //    (i.e., the thing you're writing to when you call ko.components.register(someName, ...))
    // 2. Answering requests for components by fetching configuration objects
    //    from that default in-memory registry and resolving them into standard
    //    component definition objects (of the form { createViewModel: ..., template: ... })
    // Custom loaders may override either of these facilities, i.e.,
    // 1. To supply configuration objects from some other source (e.g., conventions)
    // 2. Or, to resolve configuration objects by loading viewmodels/templates via arbitrary logic.

    var defaultConfigRegistry = {};

    ko.components.register = function(componentName, config) {
        if (!config) {
            throw new Error('Invalid configuration for ' + componentName);
        }

        if (ko.components.isRegistered(componentName)) {
            throw new Error('Component ' + componentName + ' is already registered');
        }

        defaultConfigRegistry[componentName] = config;
    };

    ko.components.isRegistered = function(componentName) {
        return defaultConfigRegistry.hasOwnProperty(componentName);
    };

    ko.components.unregister = function(componentName) {
        delete defaultConfigRegistry[componentName];
        ko.components.clearCachedDefinition(componentName);
    };

    ko.components.defaultLoader = {
        'getConfig': function(componentName, callback) {
            var result = defaultConfigRegistry.hasOwnProperty(componentName)
                ? defaultConfigRegistry[componentName]
                : null;
            callback(result);
        },

        'loadComponent': function(componentName, config, callback) {
            var errorCallback = makeErrorCallback(componentName);
            possiblyGetConfigFromAmd(errorCallback, config, function(loadedConfig) {
                resolveConfig(componentName, errorCallback, loadedConfig, callback);
            });
        },

        'loadTemplate': function(componentName, templateConfig, callback) {
            resolveTemplate(makeErrorCallback(componentName), templateConfig, callback);
        },

        'loadViewModel': function(componentName, viewModelConfig, callback) {
            resolveViewModel(makeErrorCallback(componentName), viewModelConfig, callback);
        }
    };

    var createViewModelKey = 'createViewModel';

    // Takes a config object of the form { template: ..., viewModel: ... }, and asynchronously convert it
    // into the standard component definition format:
    //    { template: <ArrayOfDomNodes>, createViewModel: function(params, componentInfo) { ... } }.
    // Since both template and viewModel may need to be resolved asynchronously, both tasks are performed
    // in parallel, and the results joined when both are ready. We don't depend on any promises infrastructure,
    // so this is implemented manually below.
    function resolveConfig(componentName, errorCallback, config, callback) {
        var result = {},
            makeCallBackWhenZero = 2,
            tryIssueCallback = function() {
                if (--makeCallBackWhenZero === 0) {
                    callback(result);
                }
            },
            templateConfig = config['template'],
            viewModelConfig = config['viewModel'];

        if (templateConfig) {
            possiblyGetConfigFromAmd(errorCallback, templateConfig, function(loadedConfig) {
                ko.components._getFirstResultFromLoaders('loadTemplate', [componentName, loadedConfig], function(resolvedTemplate) {
                    result['template'] = resolvedTemplate;
                    tryIssueCallback();
                });
            });
        } else {
            tryIssueCallback();
        }

        if (viewModelConfig) {
            possiblyGetConfigFromAmd(errorCallback, viewModelConfig, function(loadedConfig) {
                ko.components._getFirstResultFromLoaders('loadViewModel', [componentName, loadedConfig], function(resolvedViewModel) {
                    result[createViewModelKey] = resolvedViewModel;
                    tryIssueCallback();
                });
            });
        } else {
            tryIssueCallback();
        }
    }

    function resolveTemplate(errorCallback, templateConfig, callback) {
        if (typeof templateConfig === 'string') {
            // Markup - parse it
            callback(ko.utils.parseHtmlFragment(templateConfig));
        } else if (templateConfig instanceof Array) {
            // Assume already an array of DOM nodes - pass through unchanged
            callback(templateConfig);
        } else if (isDocumentFragment(templateConfig)) {
            // Document fragment - use its child nodes
            callback(ko.utils.makeArray(templateConfig.childNodes));
        } else if (templateConfig['element']) {
            var element = templateConfig['element'];
            if (isDomElement(element)) {
                // Element instance - copy its child nodes
                callback(cloneNodesFromTemplateSourceElement(element));
            } else if (typeof element === 'string') {
                // Element ID - find it, then copy its child nodes
                var elemInstance = document.getElementById(element);
                if (elemInstance) {
                    callback(cloneNodesFromTemplateSourceElement(elemInstance));
                } else {
                    errorCallback('Cannot find element with ID ' + element);
                }
            } else {
                errorCallback('Unknown element type: ' + element);
            }
        } else {
            errorCallback('Unknown template value: ' + templateConfig);
        }
    }

    function resolveViewModel(errorCallback, viewModelConfig, callback) {
        if (typeof viewModelConfig === 'function') {
            // Constructor - convert to standard factory function format
            // By design, this does *not* supply componentInfo to the constructor, as the intent is that
            // componentInfo contains non-viewmodel data (e.g., the component's element) that should only
            // be used in factory functions, not viewmodel constructors.
            callback(function (params /*, componentInfo */) {
                return new viewModelConfig(params);
            });
        } else if (typeof viewModelConfig[createViewModelKey] === 'function') {
            // Already a factory function - use it as-is
            callback(viewModelConfig[createViewModelKey]);
        } else if ('instance' in viewModelConfig) {
            // Fixed object instance - promote to createViewModel format for API consistency
            var fixedInstance = viewModelConfig['instance'];
            callback(function (params, componentInfo) {
                return fixedInstance;
            });
        } else if ('viewModel' in viewModelConfig) {
            // Resolved AMD module whose value is of the form { viewModel: ... }
            resolveViewModel(errorCallback, viewModelConfig['viewModel'], callback);
        } else {
            errorCallback('Unknown viewModel value: ' + viewModelConfig);
        }
    }

    function cloneNodesFromTemplateSourceElement(elemInstance) {
        switch (ko.utils.tagNameLower(elemInstance)) {
            case 'script':
                return ko.utils.parseHtmlFragment(elemInstance.text);
            case 'textarea':
                return ko.utils.parseHtmlFragment(elemInstance.value);
            case 'template':
                // For browsers with proper <template> element support (i.e., where the .content property
                // gives a document fragment), use that document fragment.
                if (isDocumentFragment(elemInstance.content)) {
                    return ko.utils.cloneNodes(elemInstance.content.childNodes);
                }
        }

        // Regular elements such as <div>, and <template> elements on old browsers that don't really
        // understand <template> and just treat it as a regular container
        return ko.utils.cloneNodes(elemInstance.childNodes);
    }

    function isDomElement(obj) {
        if (window['HTMLElement']) {
            return obj instanceof HTMLElement;
        } else {
            return obj && obj.tagName && obj.nodeType === 1;
        }
    }

    function isDocumentFragment(obj) {
        if (window['DocumentFragment']) {
            return obj instanceof DocumentFragment;
        } else {
            return obj && obj.nodeType === 11;
        }
    }

    function possiblyGetConfigFromAmd(errorCallback, config, callback) {
        if (typeof config['require'] === 'string') {
            // The config is the value of an AMD module
            if (amdRequire || window['require']) {
                (amdRequire || window['require'])([config['require']], callback);
            } else {
                errorCallback('Uses require, but no AMD loader is present');
            }
        } else {
            callback(config);
        }
    }

    function makeErrorCallback(componentName) {
        return function (message) {
            throw new Error('Component \'' + componentName + '\': ' + message);
        };
    }

    ko.exportSymbol('components.register', ko.components.register);
    ko.exportSymbol('components.isRegistered', ko.components.isRegistered);
    ko.exportSymbol('components.unregister', ko.components.unregister);

    // Expose the default loader so that developers can directly ask it for configuration
    // or to resolve configuration
    ko.exportSymbol('components.defaultLoader', ko.components.defaultLoader);

    // By default, the default loader is the only registered component loader
    ko.components['loaders'].push(ko.components.defaultLoader);

    // Privately expose the underlying config registry for use in old-IE shim
    ko.components._allRegisteredComponents = defaultConfigRegistry;
})();
(function (undefined) {
    // Overridable API for determining which component name applies to a given node. By overriding this,
    // you can for example map specific tagNames to components that are not preregistered.
    ko.components['getComponentNameForNode'] = function(node) {
        var tagNameLower = ko.utils.tagNameLower(node);
        if (ko.components.isRegistered(tagNameLower)) {
            // Try to determine that this node can be considered a *custom* element; see https://github.com/knockout/knockout/issues/1603
            if (tagNameLower.indexOf('-') != -1 || ('' + node) == "[object HTMLUnknownElement]" || (ko.utils.ieVersion <= 8 && node.tagName === tagNameLower)) {
                return tagNameLower;
            }
        }
    };

    ko.components.addBindingsForCustomElement = function(allBindings, node, bindingContext, valueAccessors) {
        // Determine if it's really a custom element matching a component
        if (node.nodeType === 1) {
            var componentName = ko.components['getComponentNameForNode'](node);
            if (componentName) {
                // It does represent a component, so add a component binding for it
                allBindings = allBindings || {};

                if (allBindings['component']) {
                    // Avoid silently overwriting some other 'component' binding that may already be on the element
                    throw new Error('Cannot use the "component" binding on a custom element matching a component');
                }

                var componentBindingValue = { 'name': componentName, 'params': getComponentParamsFromCustomElement(node, bindingContext) };

                allBindings['component'] = valueAccessors
                    ? function() { return componentBindingValue; }
                    : componentBindingValue;
            }
        }

        return allBindings;
    }

    var nativeBindingProviderInstance = new ko.bindingProvider();

    function getComponentParamsFromCustomElement(elem, bindingContext) {
        var paramsAttribute = elem.getAttribute('params');

        if (paramsAttribute) {
            var params = nativeBindingProviderInstance['parseBindingsString'](paramsAttribute, bindingContext, elem, { 'valueAccessors': true, 'bindingParams': true }),
                rawParamComputedValues = ko.utils.objectMap(params, function(paramValue, paramName) {
                    return ko.computed(paramValue, null, { disposeWhenNodeIsRemoved: elem });
                }),
                result = ko.utils.objectMap(rawParamComputedValues, function(paramValueComputed, paramName) {
                    var paramValue = paramValueComputed.peek();
                    // Does the evaluation of the parameter value unwrap any observables?
                    if (!paramValueComputed.isActive()) {
                        // No it doesn't, so there's no need for any computed wrapper. Just pass through the supplied value directly.
                        // Example: "someVal: firstName, age: 123" (whether or not firstName is an observable/computed)
                        return paramValue;
                    } else {
                        // Yes it does. Supply a computed property that unwraps both the outer (binding expression)
                        // level of observability, and any inner (resulting model value) level of observability.
                        // This means the component doesn't have to worry about multiple unwrapping. If the value is a
                        // writable observable, the computed will also be writable and pass the value on to the observable.
                        return ko.computed({
                            'read': function() {
                                return ko.utils.unwrapObservable(paramValueComputed());
                            },
                            'write': ko.isWriteableObservable(paramValue) && function(value) {
                                paramValueComputed()(value);
                            },
                            disposeWhenNodeIsRemoved: elem
                        });
                    }
                });

            // Give access to the raw computeds, as long as that wouldn't overwrite any custom param also called '$raw'
            // This is in case the developer wants to react to outer (binding) observability separately from inner
            // (model value) observability, or in case the model value observable has subobservables.
            if (!result.hasOwnProperty('$raw')) {
                result['$raw'] = rawParamComputedValues;
            }

            return result;
        } else {
            // For consistency, absence of a "params" attribute is treated the same as the presence of
            // any empty one. Otherwise component viewmodels need special code to check whether or not
            // 'params' or 'params.$raw' is null/undefined before reading subproperties, which is annoying.
            return { '$raw': {} };
        }
    }

    // --------------------------------------------------------------------------------
    // Compatibility code for older (pre-HTML5) IE browsers

    if (ko.utils.ieVersion < 9) {
        // Whenever you preregister a component, enable it as a custom element in the current document
        ko.components['register'] = (function(originalFunction) {
            return function(componentName) {
                document.createElement(componentName); // Allows IE<9 to parse markup containing the custom element
                return originalFunction.apply(this, arguments);
            }
        })(ko.components['register']);

        // Whenever you create a document fragment, enable all preregistered component names as custom elements
        // This is needed to make innerShiv/jQuery HTML parsing correctly handle the custom elements
        document.createDocumentFragment = (function(originalFunction) {
            return function() {
                var newDocFrag = originalFunction(),
                    allComponents = ko.components._allRegisteredComponents;
                for (var componentName in allComponents) {
                    if (allComponents.hasOwnProperty(componentName)) {
                        newDocFrag.createElement(componentName);
                    }
                }
                return newDocFrag;
            };
        })(document.createDocumentFragment);
    }
})();(function(undefined) {

    var componentLoadingOperationUniqueId = 0;

    ko.bindingHandlers['component'] = {
        'init': function(element, valueAccessor, ignored1, ignored2, bindingContext) {
            var currentViewModel,
                currentLoadingOperationId,
                disposeAssociatedComponentViewModel = function () {
                    var currentViewModelDispose = currentViewModel && currentViewModel['dispose'];
                    if (typeof currentViewModelDispose === 'function') {
                        currentViewModelDispose.call(currentViewModel);
                    }
                    currentViewModel = null;
                    // Any in-flight loading operation is no longer relevant, so make sure we ignore its completion
                    currentLoadingOperationId = null;
                },
                originalChildNodes = ko.utils.makeArray(ko.virtualElements.childNodes(element));

            ko.utils.domNodeDisposal.addDisposeCallback(element, disposeAssociatedComponentViewModel);

            ko.computed(function () {
                var value = ko.utils.unwrapObservable(valueAccessor()),
                    componentName, componentParams;

                if (typeof value === 'string') {
                    componentName = value;
                } else {
                    componentName = ko.utils.unwrapObservable(value['name']);
                    componentParams = ko.utils.unwrapObservable(value['params']);
                }

                if (!componentName) {
                    throw new Error('No component name specified');
                }

                var loadingOperationId = currentLoadingOperationId = ++componentLoadingOperationUniqueId;
                ko.components.get(componentName, function(componentDefinition) {
                    // If this is not the current load operation for this element, ignore it.
                    if (currentLoadingOperationId !== loadingOperationId) {
                        return;
                    }

                    // Clean up previous state
                    disposeAssociatedComponentViewModel();

                    // Instantiate and bind new component. Implicitly this cleans any old DOM nodes.
                    if (!componentDefinition) {
                        throw new Error('Unknown component \'' + componentName + '\'');
                    }
                    cloneTemplateIntoElement(componentName, componentDefinition, element);
                    var componentViewModel = createViewModel(componentDefinition, element, originalChildNodes, componentParams),
                        childBindingContext = bindingContext['createChildContext'](componentViewModel, /* dataItemAlias */ undefined, function(ctx) {
                            ctx['$component'] = componentViewModel;
                            ctx['$componentTemplateNodes'] = originalChildNodes;
                        });
                    currentViewModel = componentViewModel;
                    ko.applyBindingsToDescendants(childBindingContext, element);
                });
            }, null, { disposeWhenNodeIsRemoved: element });

            return { 'controlsDescendantBindings': true };
        }
    };

    ko.virtualElements.allowedBindings['component'] = true;

    function cloneTemplateIntoElement(componentName, componentDefinition, element) {
        var template = componentDefinition['template'];
        if (!template) {
            throw new Error('Component \'' + componentName + '\' has no template');
        }

        var clonedNodesArray = ko.utils.cloneNodes(template);
        ko.virtualElements.setDomNodeChildren(element, clonedNodesArray);
    }

    function createViewModel(componentDefinition, element, originalChildNodes, componentParams) {
        var componentViewModelFactory = componentDefinition['createViewModel'];
        return componentViewModelFactory
            ? componentViewModelFactory.call(componentDefinition, componentParams, { 'element': element, 'templateNodes': originalChildNodes })
            : componentParams; // Template-only component
    }

})();
var attrHtmlToJavascriptMap = { 'class': 'className', 'for': 'htmlFor' };
ko.bindingHandlers['attr'] = {
    'update': function(element, valueAccessor, allBindings) {
        var value = ko.utils.unwrapObservable(valueAccessor()) || {};
        ko.utils.objectForEach(value, function(attrName, attrValue) {
            attrValue = ko.utils.unwrapObservable(attrValue);

            // To cover cases like "attr: { checked:someProp }", we want to remove the attribute entirely
            // when someProp is a "no value"-like value (strictly null, false, or undefined)
            // (because the absence of the "checked" attr is how to mark an element as not checked, etc.)
            var toRemove = (attrValue === false) || (attrValue === null) || (attrValue === undefined);
            if (toRemove)
                element.removeAttribute(attrName);

            // In IE <= 7 and IE8 Quirks Mode, you have to use the Javascript property name instead of the
            // HTML attribute name for certain attributes. IE8 Standards Mode supports the correct behavior,
            // but instead of figuring out the mode, we'll just set the attribute through the Javascript
            // property for IE <= 8.
            if (ko.utils.ieVersion <= 8 && attrName in attrHtmlToJavascriptMap) {
                attrName = attrHtmlToJavascriptMap[attrName];
                if (toRemove)
                    element.removeAttribute(attrName);
                else
                    element[attrName] = attrValue;
            } else if (!toRemove) {
                element.setAttribute(attrName, attrValue.toString());
            }

            // Treat "name" specially - although you can think of it as an attribute, it also needs
            // special handling on older versions of IE (https://github.com/SteveSanderson/knockout/pull/333)
            // Deliberately being case-sensitive here because XHTML would regard "Name" as a different thing
            // entirely, and there's no strong reason to allow for such casing in HTML.
            if (attrName === "name") {
                ko.utils.setElementName(element, toRemove ? "" : attrValue.toString());
            }
        });
    }
};
(function() {

ko.bindingHandlers['checked'] = {
    'after': ['value', 'attr'],
    'init': function (element, valueAccessor, allBindings) {
        var checkedValue = ko.pureComputed(function() {
            // Treat "value" like "checkedValue" when it is included with "checked" binding
            if (allBindings['has']('checkedValue')) {
                return ko.utils.unwrapObservable(allBindings.get('checkedValue'));
            } else if (allBindings['has']('value')) {
                return ko.utils.unwrapObservable(allBindings.get('value'));
            }

            return element.value;
        });

        function updateModel() {
            // This updates the model value from the view value.
            // It runs in response to DOM events (click) and changes in checkedValue.
            var isChecked = element.checked,
                elemValue = useCheckedValue ? checkedValue() : isChecked;

            // When we're first setting up this computed, don't change any model state.
            if (ko.computedContext.isInitial()) {
                return;
            }

            // We can ignore unchecked radio buttons, because some other radio
            // button will be getting checked, and that one can take care of updating state.
            if (isRadio && !isChecked) {
                return;
            }

            var modelValue = ko.dependencyDetection.ignore(valueAccessor);
            if (valueIsArray) {
                var writableValue = rawValueIsNonArrayObservable ? modelValue.peek() : modelValue;
                if (oldElemValue !== elemValue) {
                    // When we're responding to the checkedValue changing, and the element is
                    // currently checked, replace the old elem value with the new elem value
                    // in the model array.
                    if (isChecked) {
                        ko.utils.addOrRemoveItem(writableValue, elemValue, true);
                        ko.utils.addOrRemoveItem(writableValue, oldElemValue, false);
                    }

                    oldElemValue = elemValue;
                } else {
                    // When we're responding to the user having checked/unchecked a checkbox,
                    // add/remove the element value to the model array.
                    ko.utils.addOrRemoveItem(writableValue, elemValue, isChecked);
                }
                if (rawValueIsNonArrayObservable && ko.isWriteableObservable(modelValue)) {
                    modelValue(writableValue);
                }
            } else {
                ko.expressionRewriting.writeValueToProperty(modelValue, allBindings, 'checked', elemValue, true);
            }
        };

        function updateView() {
            // This updates the view value from the model value.
            // It runs in response to changes in the bound (checked) value.
            var modelValue = ko.utils.unwrapObservable(valueAccessor());

            if (valueIsArray) {
                // When a checkbox is bound to an array, being checked represents its value being present in that array
                element.checked = ko.utils.arrayIndexOf(modelValue, checkedValue()) >= 0;
            } else if (isCheckbox) {
                // When a checkbox is bound to any other value (not an array), being checked represents the value being trueish
                element.checked = modelValue;
            } else {
                // For radio buttons, being checked means that the radio button's value corresponds to the model value
                element.checked = (checkedValue() === modelValue);
            }
        };

        var isCheckbox = element.type == "checkbox",
            isRadio = element.type == "radio";

        // Only bind to check boxes and radio buttons
        if (!isCheckbox && !isRadio) {
            return;
        }

        var rawValue = valueAccessor(),
            valueIsArray = isCheckbox && (ko.utils.unwrapObservable(rawValue) instanceof Array),
            rawValueIsNonArrayObservable = !(valueIsArray && rawValue.push && rawValue.splice),
            oldElemValue = valueIsArray ? checkedValue() : undefined,
            useCheckedValue = isRadio || valueIsArray;

        // IE 6 won't allow radio buttons to be selected unless they have a name
        if (isRadio && !element.name)
            ko.bindingHandlers['uniqueName']['init'](element, function() { return true });

        // Set up two computeds to update the binding:

        // The first responds to changes in the checkedValue value and to element clicks
        ko.computed(updateModel, null, { disposeWhenNodeIsRemoved: element });
        ko.utils.registerEventHandler(element, "click", updateModel);

        // The second responds to changes in the model value (the one associated with the checked binding)
        ko.computed(updateView, null, { disposeWhenNodeIsRemoved: element });

        rawValue = undefined;
    }
};
ko.expressionRewriting.twoWayBindings['checked'] = true;

ko.bindingHandlers['checkedValue'] = {
    'update': function (element, valueAccessor) {
        element.value = ko.utils.unwrapObservable(valueAccessor());
    }
};

})();var classesWrittenByBindingKey = '__ko__cssValue';
ko.bindingHandlers['css'] = {
    'update': function (element, valueAccessor) {
        var value = ko.utils.unwrapObservable(valueAccessor());
        if (value !== null && typeof value == "object") {
            ko.utils.objectForEach(value, function(className, shouldHaveClass) {
                shouldHaveClass = ko.utils.unwrapObservable(shouldHaveClass);
                ko.utils.toggleDomNodeCssClass(element, className, shouldHaveClass);
            });
        } else {
            value = ko.utils.stringTrim(String(value || '')); // Make sure we don't try to store or set a non-string value
            ko.utils.toggleDomNodeCssClass(element, element[classesWrittenByBindingKey], false);
            element[classesWrittenByBindingKey] = value;
            ko.utils.toggleDomNodeCssClass(element, value, true);
        }
    }
};
ko.bindingHandlers['enable'] = {
    'update': function (element, valueAccessor) {
        var value = ko.utils.unwrapObservable(valueAccessor());
        if (value && element.disabled)
            element.removeAttribute("disabled");
        else if ((!value) && (!element.disabled))
            element.disabled = true;
    }
};

ko.bindingHandlers['disable'] = {
    'update': function (element, valueAccessor) {
        ko.bindingHandlers['enable']['update'](element, function() { return !ko.utils.unwrapObservable(valueAccessor()) });
    }
};
// For certain common events (currently just 'click'), allow a simplified data-binding syntax
// e.g. click:handler instead of the usual full-length event:{click:handler}
function makeEventHandlerShortcut(eventName) {
    ko.bindingHandlers[eventName] = {
        'init': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            var newValueAccessor = function () {
                var result = {};
                result[eventName] = valueAccessor();
                return result;
            };
            return ko.bindingHandlers['event']['init'].call(this, element, newValueAccessor, allBindings, viewModel, bindingContext);
        }
    }
}

ko.bindingHandlers['event'] = {
    'init' : function (element, valueAccessor, allBindings, viewModel, bindingContext) {
        var eventsToHandle = valueAccessor() || {};
        ko.utils.objectForEach(eventsToHandle, function(eventName) {
            if (typeof eventName == "string") {
                ko.utils.registerEventHandler(element, eventName, function (event) {
                    var handlerReturnValue;
                    var handlerFunction = valueAccessor()[eventName];
                    if (!handlerFunction)
                        return;

                    try {
                        // Take all the event args, and prefix with the viewmodel
                        var argsForHandler = ko.utils.makeArray(arguments);
                        viewModel = bindingContext['$data'];
                        argsForHandler.unshift(viewModel);
                        handlerReturnValue = handlerFunction.apply(viewModel, argsForHandler);
                    } finally {
                        if (handlerReturnValue !== true) { // Normally we want to prevent default action. Developer can override this be explicitly returning true.
                            if (event.preventDefault)
                                event.preventDefault();
                            else
                                event.returnValue = false;
                        }
                    }

                    var bubble = allBindings.get(eventName + 'Bubble') !== false;
                    if (!bubble) {
                        event.cancelBubble = true;
                        if (event.stopPropagation)
                            event.stopPropagation();
                    }
                });
            }
        });
    }
};
// "foreach: someExpression" is equivalent to "template: { foreach: someExpression }"
// "foreach: { data: someExpression, afterAdd: myfn }" is equivalent to "template: { foreach: someExpression, afterAdd: myfn }"
ko.bindingHandlers['foreach'] = {
    makeTemplateValueAccessor: function(valueAccessor) {
        return function() {
            var modelValue = valueAccessor(),
                unwrappedValue = ko.utils.peekObservable(modelValue);    // Unwrap without setting a dependency here

            // If unwrappedValue is the array, pass in the wrapped value on its own
            // The value will be unwrapped and tracked within the template binding
            // (See https://github.com/SteveSanderson/knockout/issues/523)
            if ((!unwrappedValue) || typeof unwrappedValue.length == "number")
                return { 'foreach': modelValue, 'templateEngine': ko.nativeTemplateEngine.instance };

            // If unwrappedValue.data is the array, preserve all relevant options and unwrap again value so we get updates
            ko.utils.unwrapObservable(modelValue);
            return {
                'foreach': unwrappedValue['data'],
                'as': unwrappedValue['as'],
                'includeDestroyed': unwrappedValue['includeDestroyed'],
                'afterAdd': unwrappedValue['afterAdd'],
                'beforeRemove': unwrappedValue['beforeRemove'],
                'afterRender': unwrappedValue['afterRender'],
                'beforeMove': unwrappedValue['beforeMove'],
                'afterMove': unwrappedValue['afterMove'],
                'templateEngine': ko.nativeTemplateEngine.instance
            };
        };
    },
    'init': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
        return ko.bindingHandlers['template']['init'](element, ko.bindingHandlers['foreach'].makeTemplateValueAccessor(valueAccessor));
    },
    'update': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
        return ko.bindingHandlers['template']['update'](element, ko.bindingHandlers['foreach'].makeTemplateValueAccessor(valueAccessor), allBindings, viewModel, bindingContext);
    }
};
ko.expressionRewriting.bindingRewriteValidators['foreach'] = false; // Can't rewrite control flow bindings
ko.virtualElements.allowedBindings['foreach'] = true;
var hasfocusUpdatingProperty = '__ko_hasfocusUpdating';
var hasfocusLastValue = '__ko_hasfocusLastValue';
ko.bindingHandlers['hasfocus'] = {
    'init': function(element, valueAccessor, allBindings) {
        var handleElementFocusChange = function(isFocused) {
            // Where possible, ignore which event was raised and determine focus state using activeElement,
            // as this avoids phantom focus/blur events raised when changing tabs in modern browsers.
            // However, not all KO-targeted browsers (Firefox 2) support activeElement. For those browsers,
            // prevent a loss of focus when changing tabs/windows by setting a flag that prevents hasfocus
            // from calling 'blur()' on the element when it loses focus.
            // Discussion at https://github.com/SteveSanderson/knockout/pull/352
            element[hasfocusUpdatingProperty] = true;
            var ownerDoc = element.ownerDocument;
            if ("activeElement" in ownerDoc) {
                var active;
                try {
                    active = ownerDoc.activeElement;
                } catch(e) {
                    // IE9 throws if you access activeElement during page load (see issue #703)
                    active = ownerDoc.body;
                }
                isFocused = (active === element);
            }
            var modelValue = valueAccessor();
            ko.expressionRewriting.writeValueToProperty(modelValue, allBindings, 'hasfocus', isFocused, true);

            //cache the latest value, so we can avoid unnecessarily calling focus/blur in the update function
            element[hasfocusLastValue] = isFocused;
            element[hasfocusUpdatingProperty] = false;
        };
        var handleElementFocusIn = handleElementFocusChange.bind(null, true);
        var handleElementFocusOut = handleElementFocusChange.bind(null, false);

        ko.utils.registerEventHandler(element, "focus", handleElementFocusIn);
        ko.utils.registerEventHandler(element, "focusin", handleElementFocusIn); // For IE
        ko.utils.registerEventHandler(element, "blur",  handleElementFocusOut);
        ko.utils.registerEventHandler(element, "focusout",  handleElementFocusOut); // For IE
    },
    'update': function(element, valueAccessor) {
        var value = !!ko.utils.unwrapObservable(valueAccessor());

        if (!element[hasfocusUpdatingProperty] && element[hasfocusLastValue] !== value) {
            value ? element.focus() : element.blur();

            // In IE, the blur method doesn't always cause the element to lose focus (for example, if the window is not in focus).
            // Setting focus to the body element does seem to be reliable in IE, but should only be used if we know that the current
            // element was focused already.
            if (!value && element[hasfocusLastValue]) {
                element.ownerDocument.body.focus();
            }

            // For IE, which doesn't reliably fire "focus" or "blur" events synchronously
            ko.dependencyDetection.ignore(ko.utils.triggerEvent, null, [element, value ? "focusin" : "focusout"]);
        }
    }
};
ko.expressionRewriting.twoWayBindings['hasfocus'] = true;

ko.bindingHandlers['hasFocus'] = ko.bindingHandlers['hasfocus']; // Make "hasFocus" an alias
ko.expressionRewriting.twoWayBindings['hasFocus'] = true;
ko.bindingHandlers['html'] = {
    'init': function() {
        // Prevent binding on the dynamically-injected HTML (as developers are unlikely to expect that, and it has security implications)
        return { 'controlsDescendantBindings': true };
    },
    'update': function (element, valueAccessor) {
        // setHtml will unwrap the value if needed
        ko.utils.setHtml(element, valueAccessor());
    }
};
// Makes a binding like with or if
function makeWithIfBinding(bindingKey, isWith, isNot, makeContextCallback) {
    ko.bindingHandlers[bindingKey] = {
        'init': function(element, valueAccessor, allBindings, viewModel, bindingContext) {
            var didDisplayOnLastUpdate,
                savedNodes;
            ko.computed(function() {
                var dataValue = ko.utils.unwrapObservable(valueAccessor()),
                    shouldDisplay = !isNot !== !dataValue, // equivalent to isNot ? !dataValue : !!dataValue
                    isFirstRender = !savedNodes,
                    needsRefresh = isFirstRender || isWith || (shouldDisplay !== didDisplayOnLastUpdate);

                if (needsRefresh) {
                    // Save a copy of the inner nodes on the initial update, but only if we have dependencies.
                    if (isFirstRender && ko.computedContext.getDependenciesCount()) {
                        savedNodes = ko.utils.cloneNodes(ko.virtualElements.childNodes(element), true /* shouldCleanNodes */);
                    }

                    if (shouldDisplay) {
                        if (!isFirstRender) {
                            ko.virtualElements.setDomNodeChildren(element, ko.utils.cloneNodes(savedNodes));
                        }
                        ko.applyBindingsToDescendants(makeContextCallback ? makeContextCallback(bindingContext, dataValue) : bindingContext, element);
                    } else {
                        ko.virtualElements.emptyNode(element);
                    }

                    didDisplayOnLastUpdate = shouldDisplay;
                }
            }, null, { disposeWhenNodeIsRemoved: element });
            return { 'controlsDescendantBindings': true };
        }
    };
    ko.expressionRewriting.bindingRewriteValidators[bindingKey] = false; // Can't rewrite control flow bindings
    ko.virtualElements.allowedBindings[bindingKey] = true;
}

// Construct the actual binding handlers
makeWithIfBinding('if');
makeWithIfBinding('ifnot', false /* isWith */, true /* isNot */);
makeWithIfBinding('with', true /* isWith */, false /* isNot */,
    function(bindingContext, dataValue) {
        return bindingContext['createChildContext'](dataValue);
    }
);
var captionPlaceholder = {};
ko.bindingHandlers['options'] = {
    'init': function(element) {
        if (ko.utils.tagNameLower(element) !== "select")
            throw new Error("options binding applies only to SELECT elements");

        // Remove all existing <option>s.
        while (element.length > 0) {
            element.remove(0);
        }

        // Ensures that the binding processor doesn't try to bind the options
        return { 'controlsDescendantBindings': true };
    },
    'update': function (element, valueAccessor, allBindings) {
        function selectedOptions() {
            return ko.utils.arrayFilter(element.options, function (node) { return node.selected; });
        }

        var selectWasPreviouslyEmpty = element.length == 0,
            multiple = element.multiple,
            previousScrollTop = (!selectWasPreviouslyEmpty && multiple) ? element.scrollTop : null,
            unwrappedArray = ko.utils.unwrapObservable(valueAccessor()),
            valueAllowUnset = allBindings.get('valueAllowUnset') && allBindings['has']('value'),
            includeDestroyed = allBindings.get('optionsIncludeDestroyed'),
            arrayToDomNodeChildrenOptions = {},
            captionValue,
            filteredArray,
            previousSelectedValues = [];

        if (!valueAllowUnset) {
            if (multiple) {
                previousSelectedValues = ko.utils.arrayMap(selectedOptions(), ko.selectExtensions.readValue);
            } else if (element.selectedIndex >= 0) {
                previousSelectedValues.push(ko.selectExtensions.readValue(element.options[element.selectedIndex]));
            }
        }

        if (unwrappedArray) {
            if (typeof unwrappedArray.length == "undefined") // Coerce single value into array
                unwrappedArray = [unwrappedArray];

            // Filter out any entries marked as destroyed
            filteredArray = ko.utils.arrayFilter(unwrappedArray, function(item) {
                return includeDestroyed || item === undefined || item === null || !ko.utils.unwrapObservable(item['_destroy']);
            });

            // If caption is included, add it to the array
            if (allBindings['has']('optionsCaption')) {
                captionValue = ko.utils.unwrapObservable(allBindings.get('optionsCaption'));
                // If caption value is null or undefined, don't show a caption
                if (captionValue !== null && captionValue !== undefined) {
                    filteredArray.unshift(captionPlaceholder);
                }
            }
        } else {
            // If a falsy value is provided (e.g. null), we'll simply empty the select element
        }

        function applyToObject(object, predicate, defaultValue) {
            var predicateType = typeof predicate;
            if (predicateType == "function")    // Given a function; run it against the data value
                return predicate(object);
            else if (predicateType == "string") // Given a string; treat it as a property name on the data value
                return object[predicate];
            else                                // Given no optionsText arg; use the data value itself
                return defaultValue;
        }

        // The following functions can run at two different times:
        // The first is when the whole array is being updated directly from this binding handler.
        // The second is when an observable value for a specific array entry is updated.
        // oldOptions will be empty in the first case, but will be filled with the previously generated option in the second.
        var itemUpdate = false;
        function optionForArrayItem(arrayEntry, index, oldOptions) {
            if (oldOptions.length) {
                previousSelectedValues = !valueAllowUnset && oldOptions[0].selected ? [ ko.selectExtensions.readValue(oldOptions[0]) ] : [];
                itemUpdate = true;
            }
            var option = element.ownerDocument.createElement("option");
            if (arrayEntry === captionPlaceholder) {
                ko.utils.setTextContent(option, allBindings.get('optionsCaption'));
                ko.selectExtensions.writeValue(option, undefined);
            } else {
                // Apply a value to the option element
                var optionValue = applyToObject(arrayEntry, allBindings.get('optionsValue'), arrayEntry);
                ko.selectExtensions.writeValue(option, ko.utils.unwrapObservable(optionValue));

                // Apply some text to the option element
                var optionText = applyToObject(arrayEntry, allBindings.get('optionsText'), optionValue);
                ko.utils.setTextContent(option, optionText);
            }
            return [option];
        }

        // By using a beforeRemove callback, we delay the removal until after new items are added. This fixes a selection
        // problem in IE<=8 and Firefox. See https://github.com/knockout/knockout/issues/1208
        arrayToDomNodeChildrenOptions['beforeRemove'] =
            function (option) {
                element.removeChild(option);
            };

        function setSelectionCallback(arrayEntry, newOptions) {
            if (itemUpdate && valueAllowUnset) {
                // The model value is authoritative, so make sure its value is the one selected
                // There is no need to use dependencyDetection.ignore since setDomNodeChildrenFromArrayMapping does so already.
                ko.selectExtensions.writeValue(element, ko.utils.unwrapObservable(allBindings.get('value')), true /* allowUnset */);
            } else if (previousSelectedValues.length) {
                // IE6 doesn't like us to assign selection to OPTION nodes before they're added to the document.
                // That's why we first added them without selection. Now it's time to set the selection.
                var isSelected = ko.utils.arrayIndexOf(previousSelectedValues, ko.selectExtensions.readValue(newOptions[0])) >= 0;
                ko.utils.setOptionNodeSelectionState(newOptions[0], isSelected);

                // If this option was changed from being selected during a single-item update, notify the change
                if (itemUpdate && !isSelected) {
                    ko.dependencyDetection.ignore(ko.utils.triggerEvent, null, [element, "change"]);
                }
            }
        }

        var callback = setSelectionCallback;
        if (allBindings['has']('optionsAfterRender') && typeof allBindings.get('optionsAfterRender') == "function") {
            callback = function(arrayEntry, newOptions) {
                setSelectionCallback(arrayEntry, newOptions);
                ko.dependencyDetection.ignore(allBindings.get('optionsAfterRender'), null, [newOptions[0], arrayEntry !== captionPlaceholder ? arrayEntry : undefined]);
            }
        }

        ko.utils.setDomNodeChildrenFromArrayMapping(element, filteredArray, optionForArrayItem, arrayToDomNodeChildrenOptions, callback);

        ko.dependencyDetection.ignore(function () {
            if (valueAllowUnset) {
                // The model value is authoritative, so make sure its value is the one selected
                ko.selectExtensions.writeValue(element, ko.utils.unwrapObservable(allBindings.get('value')), true /* allowUnset */);
            } else {
                // Determine if the selection has changed as a result of updating the options list
                var selectionChanged;
                if (multiple) {
                    // For a multiple-select box, compare the new selection count to the previous one
                    // But if nothing was selected before, the selection can't have changed
                    selectionChanged = previousSelectedValues.length && selectedOptions().length < previousSelectedValues.length;
                } else {
                    // For a single-select box, compare the current value to the previous value
                    // But if nothing was selected before or nothing is selected now, just look for a change in selection
                    selectionChanged = (previousSelectedValues.length && element.selectedIndex >= 0)
                        ? (ko.selectExtensions.readValue(element.options[element.selectedIndex]) !== previousSelectedValues[0])
                        : (previousSelectedValues.length || element.selectedIndex >= 0);
                }

                // Ensure consistency between model value and selected option.
                // If the dropdown was changed so that selection is no longer the same,
                // notify the value or selectedOptions binding.
                if (selectionChanged) {
                    ko.utils.triggerEvent(element, "change");
                }
            }
        });

        // Workaround for IE bug
        ko.utils.ensureSelectElementIsRenderedCorrectly(element);

        if (previousScrollTop && Math.abs(previousScrollTop - element.scrollTop) > 20)
            element.scrollTop = previousScrollTop;
    }
};
ko.bindingHandlers['options'].optionValueDomDataKey = ko.utils.domData.nextKey();
ko.bindingHandlers['selectedOptions'] = {
    'after': ['options', 'foreach'],
    'init': function (element, valueAccessor, allBindings) {
        ko.utils.registerEventHandler(element, "change", function () {
            var value = valueAccessor(), valueToWrite = [];
            ko.utils.arrayForEach(element.getElementsByTagName("option"), function(node) {
                if (node.selected)
                    valueToWrite.push(ko.selectExtensions.readValue(node));
            });
            ko.expressionRewriting.writeValueToProperty(value, allBindings, 'selectedOptions', valueToWrite);
        });
    },
    'update': function (element, valueAccessor) {
        if (ko.utils.tagNameLower(element) != "select")
            throw new Error("values binding applies only to SELECT elements");

        var newValue = ko.utils.unwrapObservable(valueAccessor()),
            previousScrollTop = element.scrollTop;

        if (newValue && typeof newValue.length == "number") {
            ko.utils.arrayForEach(element.getElementsByTagName("option"), function(node) {
                var isSelected = ko.utils.arrayIndexOf(newValue, ko.selectExtensions.readValue(node)) >= 0;
                if (node.selected != isSelected) {      // This check prevents flashing of the select element in IE
                    ko.utils.setOptionNodeSelectionState(node, isSelected);
                }
            });
        }

        element.scrollTop = previousScrollTop;
    }
};
ko.expressionRewriting.twoWayBindings['selectedOptions'] = true;
ko.bindingHandlers['style'] = {
    'update': function (element, valueAccessor) {
        var value = ko.utils.unwrapObservable(valueAccessor() || {});
        ko.utils.objectForEach(value, function(styleName, styleValue) {
            styleValue = ko.utils.unwrapObservable(styleValue);

            if (styleValue === null || styleValue === undefined || styleValue === false) {
                // Empty string removes the value, whereas null/undefined have no effect
                styleValue = "";
            }

            element.style[styleName] = styleValue;
        });
    }
};
ko.bindingHandlers['submit'] = {
    'init': function (element, valueAccessor, allBindings, viewModel, bindingContext) {
        if (typeof valueAccessor() != "function")
            throw new Error("The value for a submit binding must be a function");
        ko.utils.registerEventHandler(element, "submit", function (event) {
            var handlerReturnValue;
            var value = valueAccessor();
            try { handlerReturnValue = value.call(bindingContext['$data'], element); }
            finally {
                if (handlerReturnValue !== true) { // Normally we want to prevent default action. Developer can override this be explicitly returning true.
                    if (event.preventDefault)
                        event.preventDefault();
                    else
                        event.returnValue = false;
                }
            }
        });
    }
};
ko.bindingHandlers['text'] = {
    'init': function() {
        // Prevent binding on the dynamically-injected text node (as developers are unlikely to expect that, and it has security implications).
        // It should also make things faster, as we no longer have to consider whether the text node might be bindable.
        return { 'controlsDescendantBindings': true };
    },
    'update': function (element, valueAccessor) {
        ko.utils.setTextContent(element, valueAccessor());
    }
};
ko.virtualElements.allowedBindings['text'] = true;
(function () {

if (window && window.navigator) {
    var parseVersion = function (matches) {
        if (matches) {
            return parseFloat(matches[1]);
        }
    };

    // Detect various browser versions because some old versions don't fully support the 'input' event
    var operaVersion = window.opera && window.opera.version && parseInt(window.opera.version()),
        userAgent = window.navigator.userAgent,
        safariVersion = parseVersion(userAgent.match(/^(?:(?!chrome).)*version\/([^ ]*) safari/i)),
        firefoxVersion = parseVersion(userAgent.match(/Firefox\/([^ ]*)/));
}

// IE 8 and 9 have bugs that prevent the normal events from firing when the value changes.
// But it does fire the 'selectionchange' event on many of those, presumably because the
// cursor is moving and that counts as the selection changing. The 'selectionchange' event is
// fired at the document level only and doesn't directly indicate which element changed. We
// set up just one event handler for the document and use 'activeElement' to determine which
// element was changed.
if (ko.utils.ieVersion < 10) {
    var selectionChangeRegisteredName = ko.utils.domData.nextKey(),
        selectionChangeHandlerName = ko.utils.domData.nextKey();
    var selectionChangeHandler = function(event) {
        var target = this.activeElement,
            handler = target && ko.utils.domData.get(target, selectionChangeHandlerName);
        if (handler) {
            handler(event);
        }
    };
    var registerForSelectionChangeEvent = function (element, handler) {
        var ownerDoc = element.ownerDocument;
        if (!ko.utils.domData.get(ownerDoc, selectionChangeRegisteredName)) {
            ko.utils.domData.set(ownerDoc, selectionChangeRegisteredName, true);
            ko.utils.registerEventHandler(ownerDoc, 'selectionchange', selectionChangeHandler);
        }
        ko.utils.domData.set(element, selectionChangeHandlerName, handler);
    };
}

ko.bindingHandlers['textInput'] = {
    'init': function (element, valueAccessor, allBindings) {

        var previousElementValue = element.value,
            timeoutHandle,
            elementValueBeforeEvent;

        var updateModel = function (event) {
            clearTimeout(timeoutHandle);
            elementValueBeforeEvent = timeoutHandle = undefined;

            var elementValue = element.value;
            if (previousElementValue !== elementValue) {
                // Provide a way for tests to know exactly which event was processed
                if (DEBUG && event) element['_ko_textInputProcessedEvent'] = event.type;
                previousElementValue = elementValue;
                ko.expressionRewriting.writeValueToProperty(valueAccessor(), allBindings, 'textInput', elementValue);
            }
        };

        var deferUpdateModel = function (event) {
            if (!timeoutHandle) {
                // The elementValueBeforeEvent variable is set *only* during the brief gap between an
                // event firing and the updateModel function running. This allows us to ignore model
                // updates that are from the previous state of the element, usually due to techniques
                // such as rateLimit. Such updates, if not ignored, can cause keystrokes to be lost.
                elementValueBeforeEvent = element.value;
                var handler = DEBUG ? updateModel.bind(element, {type: event.type}) : updateModel;
                timeoutHandle = ko.utils.setTimeout(handler, 4);
            }
        };

        // IE9 will mess up the DOM if you handle events synchronously which results in DOM changes (such as other bindings);
        // so we'll make sure all updates are asynchronous
        var ieUpdateModel = ko.utils.ieVersion == 9 ? deferUpdateModel : updateModel;

        var updateView = function () {
            var modelValue = ko.utils.unwrapObservable(valueAccessor());

            if (modelValue === null || modelValue === undefined) {
                modelValue = '';
            }

            if (elementValueBeforeEvent !== undefined && modelValue === elementValueBeforeEvent) {
                ko.utils.setTimeout(updateView, 4);
                return;
            }

            // Update the element only if the element and model are different. On some browsers, updating the value
            // will move the cursor to the end of the input, which would be bad while the user is typing.
            if (element.value !== modelValue) {
                previousElementValue = modelValue;  // Make sure we ignore events (propertychange) that result from updating the value
                element.value = modelValue;
            }
        };

        var onEvent = function (event, handler) {
            ko.utils.registerEventHandler(element, event, handler);
        };

        if (DEBUG && ko.bindingHandlers['textInput']['_forceUpdateOn']) {
            // Provide a way for tests to specify exactly which events are bound
            ko.utils.arrayForEach(ko.bindingHandlers['textInput']['_forceUpdateOn'], function(eventName) {
                if (eventName.slice(0,5) == 'after') {
                    onEvent(eventName.slice(5), deferUpdateModel);
                } else {
                    onEvent(eventName, updateModel);
                }
            });
        } else {
            if (ko.utils.ieVersion < 10) {
                // Internet Explorer <= 8 doesn't support the 'input' event, but does include 'propertychange' that fires whenever
                // any property of an element changes. Unlike 'input', it also fires if a property is changed from JavaScript code,
                // but that's an acceptable compromise for this binding. IE 9 does support 'input', but since it doesn't fire it
                // when using autocomplete, we'll use 'propertychange' for it also.
                onEvent('propertychange', function(event) {
                    if (event.propertyName === 'value') {
                        ieUpdateModel(event);
                    }
                });

                if (ko.utils.ieVersion == 8) {
                    // IE 8 has a bug where it fails to fire 'propertychange' on the first update following a value change from
                    // JavaScript code. It also doesn't fire if you clear the entire value. To fix this, we bind to the following
                    // events too.
                    onEvent('keyup', updateModel);      // A single keystoke
                    onEvent('keydown', updateModel);    // The first character when a key is held down
                }
                if (ko.utils.ieVersion >= 8) {
                    // Internet Explorer 9 doesn't fire the 'input' event when deleting text, including using
                    // the backspace, delete, or ctrl-x keys, clicking the 'x' to clear the input, dragging text
                    // out of the field, and cutting or deleting text using the context menu. 'selectionchange'
                    // can detect all of those except dragging text out of the field, for which we use 'dragend'.
                    // These are also needed in IE8 because of the bug described above.
                    registerForSelectionChangeEvent(element, ieUpdateModel);  // 'selectionchange' covers cut, paste, drop, delete, etc.
                    onEvent('dragend', deferUpdateModel);
                }
            } else {
                // All other supported browsers support the 'input' event, which fires whenever the content of the element is changed
                // through the user interface.
                onEvent('input', updateModel);

                if (safariVersion < 5 && ko.utils.tagNameLower(element) === "textarea") {
                    // Safari <5 doesn't fire the 'input' event for <textarea> elements (it does fire 'textInput'
                    // but only when typing). So we'll just catch as much as we can with keydown, cut, and paste.
                    onEvent('keydown', deferUpdateModel);
                    onEvent('paste', deferUpdateModel);
                    onEvent('cut', deferUpdateModel);
                } else if (operaVersion < 11) {
                    // Opera 10 doesn't always fire the 'input' event for cut, paste, undo & drop operations.
                    // We can try to catch some of those using 'keydown'.
                    onEvent('keydown', deferUpdateModel);
                } else if (firefoxVersion < 4.0) {
                    // Firefox <= 3.6 doesn't fire the 'input' event when text is filled in through autocomplete
                    onEvent('DOMAutoComplete', updateModel);

                    // Firefox <=3.5 doesn't fire the 'input' event when text is dropped into the input.
                    onEvent('dragdrop', updateModel);       // <3.5
                    onEvent('drop', updateModel);           // 3.5
                }
            }
        }

        // Bind to the change event so that we can catch programmatic updates of the value that fire this event.
        onEvent('change', updateModel);

        ko.computed(updateView, null, { disposeWhenNodeIsRemoved: element });
    }
};
ko.expressionRewriting.twoWayBindings['textInput'] = true;

// textinput is an alias for textInput
ko.bindingHandlers['textinput'] = {
    // preprocess is the only way to set up a full alias
    'preprocess': function (value, name, addBinding) {
        addBinding('textInput', value);
    }
};

})();ko.bindingHandlers['uniqueName'] = {
    'init': function (element, valueAccessor) {
        if (valueAccessor()) {
            var name = "ko_unique_" + (++ko.bindingHandlers['uniqueName'].currentIndex);
            ko.utils.setElementName(element, name);
        }
    }
};
ko.bindingHandlers['uniqueName'].currentIndex = 0;
ko.bindingHandlers['value'] = {
    'after': ['options', 'foreach'],
    'init': function (element, valueAccessor, allBindings) {
        // If the value binding is placed on a radio/checkbox, then just pass through to checkedValue and quit
        if (element.tagName.toLowerCase() == "input" && (element.type == "checkbox" || element.type == "radio")) {
            ko.applyBindingAccessorsToNode(element, { 'checkedValue': valueAccessor });
            return;
        }

        // Always catch "change" event; possibly other events too if asked
        var eventsToCatch = ["change"];
        var requestedEventsToCatch = allBindings.get("valueUpdate");
        var propertyChangedFired = false;
        var elementValueBeforeEvent = null;

        if (requestedEventsToCatch) {
            if (typeof requestedEventsToCatch == "string") // Allow both individual event names, and arrays of event names
                requestedEventsToCatch = [requestedEventsToCatch];
            ko.utils.arrayPushAll(eventsToCatch, requestedEventsToCatch);
            eventsToCatch = ko.utils.arrayGetDistinctValues(eventsToCatch);
        }

        var valueUpdateHandler = function() {
            elementValueBeforeEvent = null;
            propertyChangedFired = false;
            var modelValue = valueAccessor();
            var elementValue = ko.selectExtensions.readValue(element);
            ko.expressionRewriting.writeValueToProperty(modelValue, allBindings, 'value', elementValue);
        }

        // Workaround for https://github.com/SteveSanderson/knockout/issues/122
        // IE doesn't fire "change" events on textboxes if the user selects a value from its autocomplete list
        var ieAutoCompleteHackNeeded = ko.utils.ieVersion && element.tagName.toLowerCase() == "input" && element.type == "text"
                                       && element.autocomplete != "off" && (!element.form || element.form.autocomplete != "off");
        if (ieAutoCompleteHackNeeded && ko.utils.arrayIndexOf(eventsToCatch, "propertychange") == -1) {
            ko.utils.registerEventHandler(element, "propertychange", function () { propertyChangedFired = true });
            ko.utils.registerEventHandler(element, "focus", function () { propertyChangedFired = false });
            ko.utils.registerEventHandler(element, "blur", function() {
                if (propertyChangedFired) {
                    valueUpdateHandler();
                }
            });
        }

        ko.utils.arrayForEach(eventsToCatch, function(eventName) {
            // The syntax "after<eventname>" means "run the handler asynchronously after the event"
            // This is useful, for example, to catch "keydown" events after the browser has updated the control
            // (otherwise, ko.selectExtensions.readValue(this) will receive the control's value *before* the key event)
            var handler = valueUpdateHandler;
            if (ko.utils.stringStartsWith(eventName, "after")) {
                handler = function() {
                    // The elementValueBeforeEvent variable is non-null *only* during the brief gap between
                    // a keyX event firing and the valueUpdateHandler running, which is scheduled to happen
                    // at the earliest asynchronous opportunity. We store this temporary information so that
                    // if, between keyX and valueUpdateHandler, the underlying model value changes separately,
                    // we can overwrite that model value change with the value the user just typed. Otherwise,
                    // techniques like rateLimit can trigger model changes at critical moments that will
                    // override the user's inputs, causing keystrokes to be lost.
                    elementValueBeforeEvent = ko.selectExtensions.readValue(element);
                    ko.utils.setTimeout(valueUpdateHandler, 0);
                };
                eventName = eventName.substring("after".length);
            }
            ko.utils.registerEventHandler(element, eventName, handler);
        });

        var updateFromModel = function () {
            var newValue = ko.utils.unwrapObservable(valueAccessor());
            var elementValue = ko.selectExtensions.readValue(element);

            if (elementValueBeforeEvent !== null && newValue === elementValueBeforeEvent) {
                ko.utils.setTimeout(updateFromModel, 0);
                return;
            }

            var valueHasChanged = (newValue !== elementValue);

            if (valueHasChanged) {
                if (ko.utils.tagNameLower(element) === "select") {
                    var allowUnset = allBindings.get('valueAllowUnset');
                    var applyValueAction = function () {
                        ko.selectExtensions.writeValue(element, newValue, allowUnset);
                    };
                    applyValueAction();

                    if (!allowUnset && newValue !== ko.selectExtensions.readValue(element)) {
                        // If you try to set a model value that can't be represented in an already-populated dropdown, reject that change,
                        // because you're not allowed to have a model value that disagrees with a visible UI selection.
                        ko.dependencyDetection.ignore(ko.utils.triggerEvent, null, [element, "change"]);
                    } else {
                        // Workaround for IE6 bug: It won't reliably apply values to SELECT nodes during the same execution thread
                        // right after you've changed the set of OPTION nodes on it. So for that node type, we'll schedule a second thread
                        // to apply the value as well.
                        ko.utils.setTimeout(applyValueAction, 0);
                    }
                } else {
                    ko.selectExtensions.writeValue(element, newValue);
                }
            }
        };

        ko.computed(updateFromModel, null, { disposeWhenNodeIsRemoved: element });
    },
    'update': function() {} // Keep for backwards compatibility with code that may have wrapped value binding
};
ko.expressionRewriting.twoWayBindings['value'] = true;
ko.bindingHandlers['visible'] = {
    'update': function (element, valueAccessor) {
        var value = ko.utils.unwrapObservable(valueAccessor());
        var isCurrentlyVisible = !(element.style.display == "none");
        if (value && !isCurrentlyVisible)
            element.style.display = "";
        else if ((!value) && isCurrentlyVisible)
            element.style.display = "none";
    }
};
// 'click' is just a shorthand for the usual full-length event:{click:handler}
makeEventHandlerShortcut('click');
// If you want to make a custom template engine,
//
// [1] Inherit from this class (like ko.nativeTemplateEngine does)
// [2] Override 'renderTemplateSource', supplying a function with this signature:
//
//        function (templateSource, bindingContext, options) {
//            // - templateSource.text() is the text of the template you should render
//            // - bindingContext.$data is the data you should pass into the template
//            //   - you might also want to make bindingContext.$parent, bindingContext.$parents,
//            //     and bindingContext.$root available in the template too
//            // - options gives you access to any other properties set on "data-bind: { template: options }"
//            // - templateDocument is the document object of the template
//            //
//            // Return value: an array of DOM nodes
//        }
//
// [3] Override 'createJavaScriptEvaluatorBlock', supplying a function with this signature:
//
//        function (script) {
//            // Return value: Whatever syntax means "Evaluate the JavaScript statement 'script' and output the result"
//            //               For example, the jquery.tmpl template engine converts 'someScript' to '${ someScript }'
//        }
//
//     This is only necessary if you want to allow data-bind attributes to reference arbitrary template variables.
//     If you don't want to allow that, you can set the property 'allowTemplateRewriting' to false (like ko.nativeTemplateEngine does)
//     and then you don't need to override 'createJavaScriptEvaluatorBlock'.

ko.templateEngine = function () { };

ko.templateEngine.prototype['renderTemplateSource'] = function (templateSource, bindingContext, options, templateDocument) {
    throw new Error("Override renderTemplateSource");
};

ko.templateEngine.prototype['createJavaScriptEvaluatorBlock'] = function (script) {
    throw new Error("Override createJavaScriptEvaluatorBlock");
};

ko.templateEngine.prototype['makeTemplateSource'] = function(template, templateDocument) {
    // Named template
    if (typeof template == "string") {
        templateDocument = templateDocument || document;
        var elem = templateDocument.getElementById(template);
        if (!elem)
            throw new Error("Cannot find template with ID " + template);
        return new ko.templateSources.domElement(elem);
    } else if ((template.nodeType == 1) || (template.nodeType == 8)) {
        // Anonymous template
        return new ko.templateSources.anonymousTemplate(template);
    } else
        throw new Error("Unknown template type: " + template);
};

ko.templateEngine.prototype['renderTemplate'] = function (template, bindingContext, options, templateDocument) {
    var templateSource = this['makeTemplateSource'](template, templateDocument);
    return this['renderTemplateSource'](templateSource, bindingContext, options, templateDocument);
};

ko.templateEngine.prototype['isTemplateRewritten'] = function (template, templateDocument) {
    // Skip rewriting if requested
    if (this['allowTemplateRewriting'] === false)
        return true;
    return this['makeTemplateSource'](template, templateDocument)['data']("isRewritten");
};

ko.templateEngine.prototype['rewriteTemplate'] = function (template, rewriterCallback, templateDocument) {
    var templateSource = this['makeTemplateSource'](template, templateDocument);
    var rewritten = rewriterCallback(templateSource['text']());
    templateSource['text'](rewritten);
    templateSource['data']("isRewritten", true);
};

ko.exportSymbol('templateEngine', ko.templateEngine);

ko.templateRewriting = (function () {
    var memoizeDataBindingAttributeSyntaxRegex = /(<([a-z]+\d*)(?:\s+(?!data-bind\s*=\s*)[a-z0-9\-]+(?:=(?:\"[^\"]*\"|\'[^\']*\'|[^>]*))?)*\s+)data-bind\s*=\s*(["'])([\s\S]*?)\3/gi;
    var memoizeVirtualContainerBindingSyntaxRegex = /<!--\s*ko\b\s*([\s\S]*?)\s*-->/g;

    function validateDataBindValuesForRewriting(keyValueArray) {
        var allValidators = ko.expressionRewriting.bindingRewriteValidators;
        for (var i = 0; i < keyValueArray.length; i++) {
            var key = keyValueArray[i]['key'];
            if (allValidators.hasOwnProperty(key)) {
                var validator = allValidators[key];

                if (typeof validator === "function") {
                    var possibleErrorMessage = validator(keyValueArray[i]['value']);
                    if (possibleErrorMessage)
                        throw new Error(possibleErrorMessage);
                } else if (!validator) {
                    throw new Error("This template engine does not support the '" + key + "' binding within its templates");
                }
            }
        }
    }

    function constructMemoizedTagReplacement(dataBindAttributeValue, tagToRetain, nodeName, templateEngine) {
        var dataBindKeyValueArray = ko.expressionRewriting.parseObjectLiteral(dataBindAttributeValue);
        validateDataBindValuesForRewriting(dataBindKeyValueArray);
        var rewrittenDataBindAttributeValue = ko.expressionRewriting.preProcessBindings(dataBindKeyValueArray, {'valueAccessors':true});

        // For no obvious reason, Opera fails to evaluate rewrittenDataBindAttributeValue unless it's wrapped in an additional
        // anonymous function, even though Opera's built-in debugger can evaluate it anyway. No other browser requires this
        // extra indirection.
        var applyBindingsToNextSiblingScript =
            "ko.__tr_ambtns(function($context,$element){return(function(){return{ " + rewrittenDataBindAttributeValue + " } })()},'" + nodeName.toLowerCase() + "')";
        return templateEngine['createJavaScriptEvaluatorBlock'](applyBindingsToNextSiblingScript) + tagToRetain;
    }

    return {
        ensureTemplateIsRewritten: function (template, templateEngine, templateDocument) {
            if (!templateEngine['isTemplateRewritten'](template, templateDocument))
                templateEngine['rewriteTemplate'](template, function (htmlString) {
                    return ko.templateRewriting.memoizeBindingAttributeSyntax(htmlString, templateEngine);
                }, templateDocument);
        },

        memoizeBindingAttributeSyntax: function (htmlString, templateEngine) {
            return htmlString.replace(memoizeDataBindingAttributeSyntaxRegex, function () {
                return constructMemoizedTagReplacement(/* dataBindAttributeValue: */ arguments[4], /* tagToRetain: */ arguments[1], /* nodeName: */ arguments[2], templateEngine);
            }).replace(memoizeVirtualContainerBindingSyntaxRegex, function() {
                return constructMemoizedTagReplacement(/* dataBindAttributeValue: */ arguments[1], /* tagToRetain: */ "<!-- ko -->", /* nodeName: */ "#comment", templateEngine);
            });
        },

        applyMemoizedBindingsToNextSibling: function (bindings, nodeName) {
            return ko.memoization.memoize(function (domNode, bindingContext) {
                var nodeToBind = domNode.nextSibling;
                if (nodeToBind && nodeToBind.nodeName.toLowerCase() === nodeName) {
                    ko.applyBindingAccessorsToNode(nodeToBind, bindings, bindingContext);
                }
            });
        }
    }
})();


// Exported only because it has to be referenced by string lookup from within rewritten template
ko.exportSymbol('__tr_ambtns', ko.templateRewriting.applyMemoizedBindingsToNextSibling);
(function() {
    // A template source represents a read/write way of accessing a template. This is to eliminate the need for template loading/saving
    // logic to be duplicated in every template engine (and means they can all work with anonymous templates, etc.)
    //
    // Two are provided by default:
    //  1. ko.templateSources.domElement       - reads/writes the text content of an arbitrary DOM element
    //  2. ko.templateSources.anonymousElement - uses ko.utils.domData to read/write text *associated* with the DOM element, but
    //                                           without reading/writing the actual element text content, since it will be overwritten
    //                                           with the rendered template output.
    // You can implement your own template source if you want to fetch/store templates somewhere other than in DOM elements.
    // Template sources need to have the following functions:
    //   text() 			- returns the template text from your storage location
    //   text(value)		- writes the supplied template text to your storage location
    //   data(key)			- reads values stored using data(key, value) - see below
    //   data(key, value)	- associates "value" with this template and the key "key". Is used to store information like "isRewritten".
    //
    // Optionally, template sources can also have the following functions:
    //   nodes()            - returns a DOM element containing the nodes of this template, where available
    //   nodes(value)       - writes the given DOM element to your storage location
    // If a DOM element is available for a given template source, template engines are encouraged to use it in preference over text()
    // for improved speed. However, all templateSources must supply text() even if they don't supply nodes().
    //
    // Once you've implemented a templateSource, make your template engine use it by subclassing whatever template engine you were
    // using and overriding "makeTemplateSource" to return an instance of your custom template source.

    ko.templateSources = {};

    // ---- ko.templateSources.domElement -----

    // template types
    var templateScript = 1,
        templateTextArea = 2,
        templateTemplate = 3,
        templateElement = 4;

    ko.templateSources.domElement = function(element) {
        this.domElement = element;

        if (element) {
            var tagNameLower = ko.utils.tagNameLower(element);
            this.templateType =
                tagNameLower === "script" ? templateScript :
                tagNameLower === "textarea" ? templateTextArea :
                    // For browsers with proper <template> element support, where the .content property gives a document fragment
                tagNameLower == "template" && element.content && element.content.nodeType === 11 ? templateTemplate :
                templateElement;
        }
    }

    ko.templateSources.domElement.prototype['text'] = function(/* valueToWrite */) {
        var elemContentsProperty = this.templateType === templateScript ? "text"
                                 : this.templateType === templateTextArea ? "value"
                                 : "innerHTML";

        if (arguments.length == 0) {
            return this.domElement[elemContentsProperty];
        } else {
            var valueToWrite = arguments[0];
            if (elemContentsProperty === "innerHTML")
                ko.utils.setHtml(this.domElement, valueToWrite);
            else
                this.domElement[elemContentsProperty] = valueToWrite;
        }
    };

    var dataDomDataPrefix = ko.utils.domData.nextKey() + "_";
    ko.templateSources.domElement.prototype['data'] = function(key /*, valueToWrite */) {
        if (arguments.length === 1) {
            return ko.utils.domData.get(this.domElement, dataDomDataPrefix + key);
        } else {
            ko.utils.domData.set(this.domElement, dataDomDataPrefix + key, arguments[1]);
        }
    };

    var templatesDomDataKey = ko.utils.domData.nextKey();
    function getTemplateDomData(element) {
        return ko.utils.domData.get(element, templatesDomDataKey) || {};
    }
    function setTemplateDomData(element, data) {
        ko.utils.domData.set(element, templatesDomDataKey, data);
    }

    ko.templateSources.domElement.prototype['nodes'] = function(/* valueToWrite */) {
        var element = this.domElement;
        if (arguments.length == 0) {
            var templateData = getTemplateDomData(element),
                containerData = templateData.containerData;
            return containerData || (
                this.templateType === templateTemplate ? element.content :
                this.templateType === templateElement ? element :
                undefined);
        } else {
            var valueToWrite = arguments[0];
            setTemplateDomData(element, {containerData: valueToWrite});
        }
    };

    // ---- ko.templateSources.anonymousTemplate -----
    // Anonymous templates are normally saved/retrieved as DOM nodes through "nodes".
    // For compatibility, you can also read "text"; it will be serialized from the nodes on demand.
    // Writing to "text" is still supported, but then the template data will not be available as DOM nodes.

    ko.templateSources.anonymousTemplate = function(element) {
        this.domElement = element;
    }
    ko.templateSources.anonymousTemplate.prototype = new ko.templateSources.domElement();
    ko.templateSources.anonymousTemplate.prototype.constructor = ko.templateSources.anonymousTemplate;
    ko.templateSources.anonymousTemplate.prototype['text'] = function(/* valueToWrite */) {
        if (arguments.length == 0) {
            var templateData = getTemplateDomData(this.domElement);
            if (templateData.textData === undefined && templateData.containerData)
                templateData.textData = templateData.containerData.innerHTML;
            return templateData.textData;
        } else {
            var valueToWrite = arguments[0];
            setTemplateDomData(this.domElement, {textData: valueToWrite});
        }
    };

    ko.exportSymbol('templateSources', ko.templateSources);
    ko.exportSymbol('templateSources.domElement', ko.templateSources.domElement);
    ko.exportSymbol('templateSources.anonymousTemplate', ko.templateSources.anonymousTemplate);
})();
(function () {
    var _templateEngine;
    ko.setTemplateEngine = function (templateEngine) {
        if ((templateEngine != undefined) && !(templateEngine instanceof ko.templateEngine))
            throw new Error("templateEngine must inherit from ko.templateEngine");
        _templateEngine = templateEngine;
    }

    function invokeForEachNodeInContinuousRange(firstNode, lastNode, action) {
        var node, nextInQueue = firstNode, firstOutOfRangeNode = ko.virtualElements.nextSibling(lastNode);
        while (nextInQueue && ((node = nextInQueue) !== firstOutOfRangeNode)) {
            nextInQueue = ko.virtualElements.nextSibling(node);
            action(node, nextInQueue);
        }
    }

    function activateBindingsOnContinuousNodeArray(continuousNodeArray, bindingContext) {
        // To be used on any nodes that have been rendered by a template and have been inserted into some parent element
        // Walks through continuousNodeArray (which *must* be continuous, i.e., an uninterrupted sequence of sibling nodes, because
        // the algorithm for walking them relies on this), and for each top-level item in the virtual-element sense,
        // (1) Does a regular "applyBindings" to associate bindingContext with this node and to activate any non-memoized bindings
        // (2) Unmemoizes any memos in the DOM subtree (e.g., to activate bindings that had been memoized during template rewriting)

        if (continuousNodeArray.length) {
            var firstNode = continuousNodeArray[0],
                lastNode = continuousNodeArray[continuousNodeArray.length - 1],
                parentNode = firstNode.parentNode,
                provider = ko.bindingProvider['instance'],
                preprocessNode = provider['preprocessNode'];

            if (preprocessNode) {
                invokeForEachNodeInContinuousRange(firstNode, lastNode, function(node, nextNodeInRange) {
                    var nodePreviousSibling = node.previousSibling;
                    var newNodes = preprocessNode.call(provider, node);
                    if (newNodes) {
                        if (node === firstNode)
                            firstNode = newNodes[0] || nextNodeInRange;
                        if (node === lastNode)
                            lastNode = newNodes[newNodes.length - 1] || nodePreviousSibling;
                    }
                });

                // Because preprocessNode can change the nodes, including the first and last nodes, update continuousNodeArray to match.
                // We need the full set, including inner nodes, because the unmemoize step might remove the first node (and so the real
                // first node needs to be in the array).
                continuousNodeArray.length = 0;
                if (!firstNode) { // preprocessNode might have removed all the nodes, in which case there's nothing left to do
                    return;
                }
                if (firstNode === lastNode) {
                    continuousNodeArray.push(firstNode);
                } else {
                    continuousNodeArray.push(firstNode, lastNode);
                    ko.utils.fixUpContinuousNodeArray(continuousNodeArray, parentNode);
                }
            }

            // Need to applyBindings *before* unmemoziation, because unmemoization might introduce extra nodes (that we don't want to re-bind)
            // whereas a regular applyBindings won't introduce new memoized nodes
            invokeForEachNodeInContinuousRange(firstNode, lastNode, function(node) {
                if (node.nodeType === 1 || node.nodeType === 8)
                    ko.applyBindings(bindingContext, node);
            });
            invokeForEachNodeInContinuousRange(firstNode, lastNode, function(node) {
                if (node.nodeType === 1 || node.nodeType === 8)
                    ko.memoization.unmemoizeDomNodeAndDescendants(node, [bindingContext]);
            });

            // Make sure any changes done by applyBindings or unmemoize are reflected in the array
            ko.utils.fixUpContinuousNodeArray(continuousNodeArray, parentNode);
        }
    }

    function getFirstNodeFromPossibleArray(nodeOrNodeArray) {
        return nodeOrNodeArray.nodeType ? nodeOrNodeArray
                                        : nodeOrNodeArray.length > 0 ? nodeOrNodeArray[0]
                                        : null;
    }

    function executeTemplate(targetNodeOrNodeArray, renderMode, template, bindingContext, options) {
        options = options || {};
        var firstTargetNode = targetNodeOrNodeArray && getFirstNodeFromPossibleArray(targetNodeOrNodeArray);
        var templateDocument = (firstTargetNode || template || {}).ownerDocument;
        var templateEngineToUse = (options['templateEngine'] || _templateEngine);
        ko.templateRewriting.ensureTemplateIsRewritten(template, templateEngineToUse, templateDocument);
        var renderedNodesArray = templateEngineToUse['renderTemplate'](template, bindingContext, options, templateDocument);

        // Loosely check result is an array of DOM nodes
        if ((typeof renderedNodesArray.length != "number") || (renderedNodesArray.length > 0 && typeof renderedNodesArray[0].nodeType != "number"))
            throw new Error("Template engine must return an array of DOM nodes");

        var haveAddedNodesToParent = false;
        switch (renderMode) {
            case "replaceChildren":
                ko.virtualElements.setDomNodeChildren(targetNodeOrNodeArray, renderedNodesArray);
                haveAddedNodesToParent = true;
                break;
            case "replaceNode":
                ko.utils.replaceDomNodes(targetNodeOrNodeArray, renderedNodesArray);
                haveAddedNodesToParent = true;
                break;
            case "ignoreTargetNode": break;
            default:
                throw new Error("Unknown renderMode: " + renderMode);
        }

        if (haveAddedNodesToParent) {
            activateBindingsOnContinuousNodeArray(renderedNodesArray, bindingContext);
            if (options['afterRender'])
                ko.dependencyDetection.ignore(options['afterRender'], null, [renderedNodesArray, bindingContext['$data']]);
        }

        return renderedNodesArray;
    }

    function resolveTemplateName(template, data, context) {
        // The template can be specified as:
        if (ko.isObservable(template)) {
            // 1. An observable, with string value
            return template();
        } else if (typeof template === 'function') {
            // 2. A function of (data, context) returning a string
            return template(data, context);
        } else {
            // 3. A string
            return template;
        }
    }

    ko.renderTemplate = function (template, dataOrBindingContext, options, targetNodeOrNodeArray, renderMode) {
        options = options || {};
        if ((options['templateEngine'] || _templateEngine) == undefined)
            throw new Error("Set a template engine before calling renderTemplate");
        renderMode = renderMode || "replaceChildren";

        if (targetNodeOrNodeArray) {
            var firstTargetNode = getFirstNodeFromPossibleArray(targetNodeOrNodeArray);

            var whenToDispose = function () { return (!firstTargetNode) || !ko.utils.domNodeIsAttachedToDocument(firstTargetNode); }; // Passive disposal (on next evaluation)
            var activelyDisposeWhenNodeIsRemoved = (firstTargetNode && renderMode == "replaceNode") ? firstTargetNode.parentNode : firstTargetNode;

            return ko.dependentObservable( // So the DOM is automatically updated when any dependency changes
                function () {
                    // Ensure we've got a proper binding context to work with
                    var bindingContext = (dataOrBindingContext && (dataOrBindingContext instanceof ko.bindingContext))
                        ? dataOrBindingContext
                        : new ko.bindingContext(ko.utils.unwrapObservable(dataOrBindingContext));

                    var templateName = resolveTemplateName(template, bindingContext['$data'], bindingContext),
                        renderedNodesArray = executeTemplate(targetNodeOrNodeArray, renderMode, templateName, bindingContext, options);

                    if (renderMode == "replaceNode") {
                        targetNodeOrNodeArray = renderedNodesArray;
                        firstTargetNode = getFirstNodeFromPossibleArray(targetNodeOrNodeArray);
                    }
                },
                null,
                { disposeWhen: whenToDispose, disposeWhenNodeIsRemoved: activelyDisposeWhenNodeIsRemoved }
            );
        } else {
            // We don't yet have a DOM node to evaluate, so use a memo and render the template later when there is a DOM node
            return ko.memoization.memoize(function (domNode) {
                ko.renderTemplate(template, dataOrBindingContext, options, domNode, "replaceNode");
            });
        }
    };

    ko.renderTemplateForEach = function (template, arrayOrObservableArray, options, targetNode, parentBindingContext) {
        // Since setDomNodeChildrenFromArrayMapping always calls executeTemplateForArrayItem and then
        // activateBindingsCallback for added items, we can store the binding context in the former to use in the latter.
        var arrayItemContext;

        // This will be called by setDomNodeChildrenFromArrayMapping to get the nodes to add to targetNode
        var executeTemplateForArrayItem = function (arrayValue, index) {
            // Support selecting template as a function of the data being rendered
            arrayItemContext = parentBindingContext['createChildContext'](arrayValue, options['as'], function(context) {
                context['$index'] = index;
            });

            var templateName = resolveTemplateName(template, arrayValue, arrayItemContext);
            return executeTemplate(null, "ignoreTargetNode", templateName, arrayItemContext, options);
        }

        // This will be called whenever setDomNodeChildrenFromArrayMapping has added nodes to targetNode
        var activateBindingsCallback = function(arrayValue, addedNodesArray, index) {
            activateBindingsOnContinuousNodeArray(addedNodesArray, arrayItemContext);
            if (options['afterRender'])
                options['afterRender'](addedNodesArray, arrayValue);

            // release the "cache" variable, so that it can be collected by
            // the GC when its value isn't used from within the bindings anymore.
            arrayItemContext = null;
        };

        return ko.dependentObservable(function () {
            var unwrappedArray = ko.utils.unwrapObservable(arrayOrObservableArray) || [];
            if (typeof unwrappedArray.length == "undefined") // Coerce single value into array
                unwrappedArray = [unwrappedArray];

            // Filter out any entries marked as destroyed
            var filteredArray = ko.utils.arrayFilter(unwrappedArray, function(item) {
                return options['includeDestroyed'] || item === undefined || item === null || !ko.utils.unwrapObservable(item['_destroy']);
            });

            // Call setDomNodeChildrenFromArrayMapping, ignoring any observables unwrapped within (most likely from a callback function).
            // If the array items are observables, though, they will be unwrapped in executeTemplateForArrayItem and managed within setDomNodeChildrenFromArrayMapping.
            ko.dependencyDetection.ignore(ko.utils.setDomNodeChildrenFromArrayMapping, null, [targetNode, filteredArray, executeTemplateForArrayItem, options, activateBindingsCallback]);

        }, null, { disposeWhenNodeIsRemoved: targetNode });
    };

    var templateComputedDomDataKey = ko.utils.domData.nextKey();
    function disposeOldComputedAndStoreNewOne(element, newComputed) {
        var oldComputed = ko.utils.domData.get(element, templateComputedDomDataKey);
        if (oldComputed && (typeof(oldComputed.dispose) == 'function'))
            oldComputed.dispose();
        ko.utils.domData.set(element, templateComputedDomDataKey, (newComputed && newComputed.isActive()) ? newComputed : undefined);
    }

    ko.bindingHandlers['template'] = {
        'init': function(element, valueAccessor) {
            // Support anonymous templates
            var bindingValue = ko.utils.unwrapObservable(valueAccessor());
            if (typeof bindingValue == "string" || bindingValue['name']) {
                // It's a named template - clear the element
                ko.virtualElements.emptyNode(element);
            } else if ('nodes' in bindingValue) {
                // We've been given an array of DOM nodes. Save them as the template source.
                // There is no known use case for the node array being an observable array (if the output
                // varies, put that behavior *into* your template - that's what templates are for), and
                // the implementation would be a mess, so assert that it's not observable.
                var nodes = bindingValue['nodes'] || [];
                if (ko.isObservable(nodes)) {
                    throw new Error('The "nodes" option must be a plain, non-observable array.');
                }
                var container = ko.utils.moveCleanedNodesToContainerElement(nodes); // This also removes the nodes from their current parent
                new ko.templateSources.anonymousTemplate(element)['nodes'](container);
            } else {
                // It's an anonymous template - store the element contents, then clear the element
                var templateNodes = ko.virtualElements.childNodes(element),
                    container = ko.utils.moveCleanedNodesToContainerElement(templateNodes); // This also removes the nodes from their current parent
                new ko.templateSources.anonymousTemplate(element)['nodes'](container);
            }
            return { 'controlsDescendantBindings': true };
        },
        'update': function (element, valueAccessor, allBindings, viewModel, bindingContext) {
            var value = valueAccessor(),
                dataValue,
                options = ko.utils.unwrapObservable(value),
                shouldDisplay = true,
                templateComputed = null,
                templateName;

            if (typeof options == "string") {
                templateName = value;
                options = {};
            } else {
                templateName = options['name'];

                // Support "if"/"ifnot" conditions
                if ('if' in options)
                    shouldDisplay = ko.utils.unwrapObservable(options['if']);
                if (shouldDisplay && 'ifnot' in options)
                    shouldDisplay = !ko.utils.unwrapObservable(options['ifnot']);

                dataValue = ko.utils.unwrapObservable(options['data']);
            }

            if ('foreach' in options) {
                // Render once for each data point (treating data set as empty if shouldDisplay==false)
                var dataArray = (shouldDisplay && options['foreach']) || [];
                templateComputed = ko.renderTemplateForEach(templateName || element, dataArray, options, element, bindingContext);
            } else if (!shouldDisplay) {
                ko.virtualElements.emptyNode(element);
            } else {
                // Render once for this single data point (or use the viewModel if no data was provided)
                var innerBindingContext = ('data' in options) ?
                    bindingContext['createChildContext'](dataValue, options['as']) :  // Given an explitit 'data' value, we create a child binding context for it
                    bindingContext;                                                        // Given no explicit 'data' value, we retain the same binding context
                templateComputed = ko.renderTemplate(templateName || element, innerBindingContext, options, element);
            }

            // It only makes sense to have a single template computed per element (otherwise which one should have its output displayed?)
            disposeOldComputedAndStoreNewOne(element, templateComputed);
        }
    };

    // Anonymous templates can't be rewritten. Give a nice error message if you try to do it.
    ko.expressionRewriting.bindingRewriteValidators['template'] = function(bindingValue) {
        var parsedBindingValue = ko.expressionRewriting.parseObjectLiteral(bindingValue);

        if ((parsedBindingValue.length == 1) && parsedBindingValue[0]['unknown'])
            return null; // It looks like a string literal, not an object literal, so treat it as a named template (which is allowed for rewriting)

        if (ko.expressionRewriting.keyValueArrayContainsKey(parsedBindingValue, "name"))
            return null; // Named templates can be rewritten, so return "no error"
        return "This template engine does not support anonymous templates nested within its templates";
    };

    ko.virtualElements.allowedBindings['template'] = true;
})();

ko.exportSymbol('setTemplateEngine', ko.setTemplateEngine);
ko.exportSymbol('renderTemplate', ko.renderTemplate);
// Go through the items that have been added and deleted and try to find matches between them.
ko.utils.findMovesInArrayComparison = function (left, right, limitFailedCompares) {
    if (left.length && right.length) {
        var failedCompares, l, r, leftItem, rightItem;
        for (failedCompares = l = 0; (!limitFailedCompares || failedCompares < limitFailedCompares) && (leftItem = left[l]); ++l) {
            for (r = 0; rightItem = right[r]; ++r) {
                if (leftItem['value'] === rightItem['value']) {
                    leftItem['moved'] = rightItem['index'];
                    rightItem['moved'] = leftItem['index'];
                    right.splice(r, 1);         // This item is marked as moved; so remove it from right list
                    failedCompares = r = 0;     // Reset failed compares count because we're checking for consecutive failures
                    break;
                }
            }
            failedCompares += r;
        }
    }
};

ko.utils.compareArrays = (function () {
    var statusNotInOld = 'added', statusNotInNew = 'deleted';

    // Simple calculation based on Levenshtein distance.
    function compareArrays(oldArray, newArray, options) {
        // For backward compatibility, if the third arg is actually a bool, interpret
        // it as the old parameter 'dontLimitMoves'. Newer code should use { dontLimitMoves: true }.
        options = (typeof options === 'boolean') ? { 'dontLimitMoves': options } : (options || {});
        oldArray = oldArray || [];
        newArray = newArray || [];

        if (oldArray.length < newArray.length)
            return compareSmallArrayToBigArray(oldArray, newArray, statusNotInOld, statusNotInNew, options);
        else
            return compareSmallArrayToBigArray(newArray, oldArray, statusNotInNew, statusNotInOld, options);
    }

    function compareSmallArrayToBigArray(smlArray, bigArray, statusNotInSml, statusNotInBig, options) {
        var myMin = Math.min,
            myMax = Math.max,
            editDistanceMatrix = [],
            smlIndex, smlIndexMax = smlArray.length,
            bigIndex, bigIndexMax = bigArray.length,
            compareRange = (bigIndexMax - smlIndexMax) || 1,
            maxDistance = smlIndexMax + bigIndexMax + 1,
            thisRow, lastRow,
            bigIndexMaxForRow, bigIndexMinForRow;

        for (smlIndex = 0; smlIndex <= smlIndexMax; smlIndex++) {
            lastRow = thisRow;
            editDistanceMatrix.push(thisRow = []);
            bigIndexMaxForRow = myMin(bigIndexMax, smlIndex + compareRange);
            bigIndexMinForRow = myMax(0, smlIndex - 1);
            for (bigIndex = bigIndexMinForRow; bigIndex <= bigIndexMaxForRow; bigIndex++) {
                if (!bigIndex)
                    thisRow[bigIndex] = smlIndex + 1;
                else if (!smlIndex)  // Top row - transform empty array into new array via additions
                    thisRow[bigIndex] = bigIndex + 1;
                else if (smlArray[smlIndex - 1] === bigArray[bigIndex - 1])
                    thisRow[bigIndex] = lastRow[bigIndex - 1];                  // copy value (no edit)
                else {
                    var northDistance = lastRow[bigIndex] || maxDistance;       // not in big (deletion)
                    var westDistance = thisRow[bigIndex - 1] || maxDistance;    // not in small (addition)
                    thisRow[bigIndex] = myMin(northDistance, westDistance) + 1;
                }
            }
        }

        var editScript = [], meMinusOne, notInSml = [], notInBig = [];
        for (smlIndex = smlIndexMax, bigIndex = bigIndexMax; smlIndex || bigIndex;) {
            meMinusOne = editDistanceMatrix[smlIndex][bigIndex] - 1;
            if (bigIndex && meMinusOne === editDistanceMatrix[smlIndex][bigIndex-1]) {
                notInSml.push(editScript[editScript.length] = {     // added
                    'status': statusNotInSml,
                    'value': bigArray[--bigIndex],
                    'index': bigIndex });
            } else if (smlIndex && meMinusOne === editDistanceMatrix[smlIndex - 1][bigIndex]) {
                notInBig.push(editScript[editScript.length] = {     // deleted
                    'status': statusNotInBig,
                    'value': smlArray[--smlIndex],
                    'index': smlIndex });
            } else {
                --bigIndex;
                --smlIndex;
                if (!options['sparse']) {
                    editScript.push({
                        'status': "retained",
                        'value': bigArray[bigIndex] });
                }
            }
        }

        // Set a limit on the number of consecutive non-matching comparisons; having it a multiple of
        // smlIndexMax keeps the time complexity of this algorithm linear.
        ko.utils.findMovesInArrayComparison(notInBig, notInSml, !options['dontLimitMoves'] && smlIndexMax * 10);

        return editScript.reverse();
    }

    return compareArrays;
})();

ko.exportSymbol('utils.compareArrays', ko.utils.compareArrays);
(function () {
    // Objective:
    // * Given an input array, a container DOM node, and a function from array elements to arrays of DOM nodes,
    //   map the array elements to arrays of DOM nodes, concatenate together all these arrays, and use them to populate the container DOM node
    // * Next time we're given the same combination of things (with the array possibly having mutated), update the container DOM node
    //   so that its children is again the concatenation of the mappings of the array elements, but don't re-map any array elements that we
    //   previously mapped - retain those nodes, and just insert/delete other ones

    // "callbackAfterAddingNodes" will be invoked after any "mapping"-generated nodes are inserted into the container node
    // You can use this, for example, to activate bindings on those nodes.

    function mapNodeAndRefreshWhenChanged(containerNode, mapping, valueToMap, callbackAfterAddingNodes, index) {
        // Map this array value inside a dependentObservable so we re-map when any dependency changes
        var mappedNodes = [];
        var dependentObservable = ko.dependentObservable(function() {
            var newMappedNodes = mapping(valueToMap, index, ko.utils.fixUpContinuousNodeArray(mappedNodes, containerNode)) || [];

            // On subsequent evaluations, just replace the previously-inserted DOM nodes
            if (mappedNodes.length > 0) {
                ko.utils.replaceDomNodes(mappedNodes, newMappedNodes);
                if (callbackAfterAddingNodes)
                    ko.dependencyDetection.ignore(callbackAfterAddingNodes, null, [valueToMap, newMappedNodes, index]);
            }

            // Replace the contents of the mappedNodes array, thereby updating the record
            // of which nodes would be deleted if valueToMap was itself later removed
            mappedNodes.length = 0;
            ko.utils.arrayPushAll(mappedNodes, newMappedNodes);
        }, null, { disposeWhenNodeIsRemoved: containerNode, disposeWhen: function() { return !ko.utils.anyDomNodeIsAttachedToDocument(mappedNodes); } });
        return { mappedNodes : mappedNodes, dependentObservable : (dependentObservable.isActive() ? dependentObservable : undefined) };
    }

    var lastMappingResultDomDataKey = ko.utils.domData.nextKey(),
        deletedItemDummyValue = ko.utils.domData.nextKey();

    ko.utils.setDomNodeChildrenFromArrayMapping = function (domNode, array, mapping, options, callbackAfterAddingNodes) {
        // Compare the provided array against the previous one
        array = array || [];
        options = options || {};
        var isFirstExecution = ko.utils.domData.get(domNode, lastMappingResultDomDataKey) === undefined;
        var lastMappingResult = ko.utils.domData.get(domNode, lastMappingResultDomDataKey) || [];
        var lastArray = ko.utils.arrayMap(lastMappingResult, function (x) { return x.arrayEntry; });
        var editScript = ko.utils.compareArrays(lastArray, array, options['dontLimitMoves']);

        // Build the new mapping result
        var newMappingResult = [];
        var lastMappingResultIndex = 0;
        var newMappingResultIndex = 0;

        var nodesToDelete = [];
        var itemsToProcess = [];
        var itemsForBeforeRemoveCallbacks = [];
        var itemsForMoveCallbacks = [];
        var itemsForAfterAddCallbacks = [];
        var mapData;

        function itemMovedOrRetained(editScriptIndex, oldPosition) {
            mapData = lastMappingResult[oldPosition];
            if (newMappingResultIndex !== oldPosition)
                itemsForMoveCallbacks[editScriptIndex] = mapData;
            // Since updating the index might change the nodes, do so before calling fixUpContinuousNodeArray
            mapData.indexObservable(newMappingResultIndex++);
            ko.utils.fixUpContinuousNodeArray(mapData.mappedNodes, domNode);
            newMappingResult.push(mapData);
            itemsToProcess.push(mapData);
        }

        function callCallback(callback, items) {
            if (callback) {
                for (var i = 0, n = items.length; i < n; i++) {
                    if (items[i]) {
                        ko.utils.arrayForEach(items[i].mappedNodes, function(node) {
                            callback(node, i, items[i].arrayEntry);
                        });
                    }
                }
            }
        }

        for (var i = 0, editScriptItem, movedIndex; editScriptItem = editScript[i]; i++) {
            movedIndex = editScriptItem['moved'];
            switch (editScriptItem['status']) {
                case "deleted":
                    if (movedIndex === undefined) {
                        mapData = lastMappingResult[lastMappingResultIndex];

                        // Stop tracking changes to the mapping for these nodes
                        if (mapData.dependentObservable) {
                            mapData.dependentObservable.dispose();
                            mapData.dependentObservable = undefined;
                        }

                        // Queue these nodes for later removal
                        if (ko.utils.fixUpContinuousNodeArray(mapData.mappedNodes, domNode).length) {
                            if (options['beforeRemove']) {
                                newMappingResult.push(mapData);
                                itemsToProcess.push(mapData);
                                if (mapData.arrayEntry === deletedItemDummyValue) {
                                    mapData = null;
                                } else {
                                    itemsForBeforeRemoveCallbacks[i] = mapData;
                                }
                            }
                            if (mapData) {
                                nodesToDelete.push.apply(nodesToDelete, mapData.mappedNodes);
                            }
                        }
                    }
                    lastMappingResultIndex++;
                    break;

                case "retained":
                    itemMovedOrRetained(i, lastMappingResultIndex++);
                    break;

                case "added":
                    if (movedIndex !== undefined) {
                        itemMovedOrRetained(i, movedIndex);
                    } else {
                        mapData = { arrayEntry: editScriptItem['value'], indexObservable: ko.observable(newMappingResultIndex++) };
                        newMappingResult.push(mapData);
                        itemsToProcess.push(mapData);
                        if (!isFirstExecution)
                            itemsForAfterAddCallbacks[i] = mapData;
                    }
                    break;
            }
        }

        // Store a copy of the array items we just considered so we can difference it next time
        ko.utils.domData.set(domNode, lastMappingResultDomDataKey, newMappingResult);

        // Call beforeMove first before any changes have been made to the DOM
        callCallback(options['beforeMove'], itemsForMoveCallbacks);

        // Next remove nodes for deleted items (or just clean if there's a beforeRemove callback)
        ko.utils.arrayForEach(nodesToDelete, options['beforeRemove'] ? ko.cleanNode : ko.removeNode);

        // Next add/reorder the remaining items (will include deleted items if there's a beforeRemove callback)
        for (var i = 0, nextNode = ko.virtualElements.firstChild(domNode), lastNode, node; mapData = itemsToProcess[i]; i++) {
            // Get nodes for newly added items
            if (!mapData.mappedNodes)
                ko.utils.extend(mapData, mapNodeAndRefreshWhenChanged(domNode, mapping, mapData.arrayEntry, callbackAfterAddingNodes, mapData.indexObservable));

            // Put nodes in the right place if they aren't there already
            for (var j = 0; node = mapData.mappedNodes[j]; nextNode = node.nextSibling, lastNode = node, j++) {
                if (node !== nextNode)
                    ko.virtualElements.insertAfter(domNode, node, lastNode);
            }

            // Run the callbacks for newly added nodes (for example, to apply bindings, etc.)
            if (!mapData.initialized && callbackAfterAddingNodes) {
                callbackAfterAddingNodes(mapData.arrayEntry, mapData.mappedNodes, mapData.indexObservable);
                mapData.initialized = true;
            }
        }

        // If there's a beforeRemove callback, call it after reordering.
        // Note that we assume that the beforeRemove callback will usually be used to remove the nodes using
        // some sort of animation, which is why we first reorder the nodes that will be removed. If the
        // callback instead removes the nodes right away, it would be more efficient to skip reordering them.
        // Perhaps we'll make that change in the future if this scenario becomes more common.
        callCallback(options['beforeRemove'], itemsForBeforeRemoveCallbacks);

        // Replace the stored values of deleted items with a dummy value. This provides two benefits: it marks this item
        // as already "removed" so we won't call beforeRemove for it again, and it ensures that the item won't match up
        // with an actual item in the array and appear as "retained" or "moved".
        for (i = 0; i < itemsForBeforeRemoveCallbacks.length; ++i) {
            if (itemsForBeforeRemoveCallbacks[i]) {
                itemsForBeforeRemoveCallbacks[i].arrayEntry = deletedItemDummyValue;
            }
        }

        // Finally call afterMove and afterAdd callbacks
        callCallback(options['afterMove'], itemsForMoveCallbacks);
        callCallback(options['afterAdd'], itemsForAfterAddCallbacks);
    }
})();

ko.exportSymbol('utils.setDomNodeChildrenFromArrayMapping', ko.utils.setDomNodeChildrenFromArrayMapping);
ko.nativeTemplateEngine = function () {
    this['allowTemplateRewriting'] = false;
}

ko.nativeTemplateEngine.prototype = new ko.templateEngine();
ko.nativeTemplateEngine.prototype.constructor = ko.nativeTemplateEngine;
ko.nativeTemplateEngine.prototype['renderTemplateSource'] = function (templateSource, bindingContext, options, templateDocument) {
    var useNodesIfAvailable = !(ko.utils.ieVersion < 9), // IE<9 cloneNode doesn't work properly
        templateNodesFunc = useNodesIfAvailable ? templateSource['nodes'] : null,
        templateNodes = templateNodesFunc ? templateSource['nodes']() : null;

    if (templateNodes) {
        return ko.utils.makeArray(templateNodes.cloneNode(true).childNodes);
    } else {
        var templateText = templateSource['text']();
        return ko.utils.parseHtmlFragment(templateText, templateDocument);
    }
};

ko.nativeTemplateEngine.instance = new ko.nativeTemplateEngine();
ko.setTemplateEngine(ko.nativeTemplateEngine.instance);

ko.exportSymbol('nativeTemplateEngine', ko.nativeTemplateEngine);
(function() {
    ko.jqueryTmplTemplateEngine = function () {
        // Detect which version of jquery-tmpl you're using. Unfortunately jquery-tmpl
        // doesn't expose a version number, so we have to infer it.
        // Note that as of Knockout 1.3, we only support jQuery.tmpl 1.0.0pre and later,
        // which KO internally refers to as version "2", so older versions are no longer detected.
        var jQueryTmplVersion = this.jQueryTmplVersion = (function() {
            if (!jQueryInstance || !(jQueryInstance['tmpl']))
                return 0;
            // Since it exposes no official version number, we use our own numbering system. To be updated as jquery-tmpl evolves.
            try {
                if (jQueryInstance['tmpl']['tag']['tmpl']['open'].toString().indexOf('__') >= 0) {
                    // Since 1.0.0pre, custom tags should append markup to an array called "__"
                    return 2; // Final version of jquery.tmpl
                }
            } catch(ex) { /* Apparently not the version we were looking for */ }

            return 1; // Any older version that we don't support
        })();

        function ensureHasReferencedJQueryTemplates() {
            if (jQueryTmplVersion < 2)
                throw new Error("Your version of jQuery.tmpl is too old. Please upgrade to jQuery.tmpl 1.0.0pre or later.");
        }

        function executeTemplate(compiledTemplate, data, jQueryTemplateOptions) {
            return jQueryInstance['tmpl'](compiledTemplate, data, jQueryTemplateOptions);
        }

        this['renderTemplateSource'] = function(templateSource, bindingContext, options, templateDocument) {
            templateDocument = templateDocument || document;
            options = options || {};
            ensureHasReferencedJQueryTemplates();

            // Ensure we have stored a precompiled version of this template (don't want to reparse on every render)
            var precompiled = templateSource['data']('precompiled');
            if (!precompiled) {
                var templateText = templateSource['text']() || "";
                // Wrap in "with($whatever.koBindingContext) { ... }"
                templateText = "{{ko_with $item.koBindingContext}}" + templateText + "{{/ko_with}}";

                precompiled = jQueryInstance['template'](null, templateText);
                templateSource['data']('precompiled', precompiled);
            }

            var data = [bindingContext['$data']]; // Prewrap the data in an array to stop jquery.tmpl from trying to unwrap any arrays
            var jQueryTemplateOptions = jQueryInstance['extend']({ 'koBindingContext': bindingContext }, options['templateOptions']);

            var resultNodes = executeTemplate(precompiled, data, jQueryTemplateOptions);
            resultNodes['appendTo'](templateDocument.createElement("div")); // Using "appendTo" forces jQuery/jQuery.tmpl to perform necessary cleanup work

            jQueryInstance['fragments'] = {}; // Clear jQuery's fragment cache to avoid a memory leak after a large number of template renders
            return resultNodes;
        };

        this['createJavaScriptEvaluatorBlock'] = function(script) {
            return "{{ko_code ((function() { return " + script + " })()) }}";
        };

        this['addTemplate'] = function(templateName, templateMarkup) {
            document.write("<script type='text/html' id='" + templateName + "'>" + templateMarkup + "<" + "/script>");
        };

        if (jQueryTmplVersion > 0) {
            jQueryInstance['tmpl']['tag']['ko_code'] = {
                open: "__.push($1 || '');"
            };
            jQueryInstance['tmpl']['tag']['ko_with'] = {
                open: "with($1) {",
                close: "} "
            };
        }
    };

    ko.jqueryTmplTemplateEngine.prototype = new ko.templateEngine();
    ko.jqueryTmplTemplateEngine.prototype.constructor = ko.jqueryTmplTemplateEngine;

    // Use this one by default *only if jquery.tmpl is referenced*
    var jqueryTmplTemplateEngineInstance = new ko.jqueryTmplTemplateEngine();
    if (jqueryTmplTemplateEngineInstance.jQueryTmplVersion > 0)
        ko.setTemplateEngine(jqueryTmplTemplateEngineInstance);

    ko.exportSymbol('jqueryTmplTemplateEngine', ko.jqueryTmplTemplateEngine);
})();
}));
}());
})();

},{}],11:[function(require,module,exports){

// Binds the value of x to value at location firebase.
exports.bindVal = function(firebase, x) {
  firebase.on("value", snapshot => x = snapshot.val());
};

// Binds the function f to the value at location firebase.
// Whenever the firebase value changes, f is called with the new value.
exports.bindFunc = function(firebase, f) {
  firebase.on("value", snapshot => f(snapshot.val()));
};

// Returns a random element of the array.
exports.randomPick = function(array) {
  return array[Math.floor(Math.random()*array.length)];
};

// Returns an array of unique random elements of an array.
exports.randomPicks = function(array, n) {
  array = array.slice(); // Clone array so as not to mutate it.
  var picks = [];
  for (var i = 0; i < array.length && i < n; i++) {
    var index = Math.floor(Math.random()*array.length);
    picks.push(array.splice(index, 1)[0]);
  }
  return picks;
};

// Inserts item into array at a random location.
// Returns the array for convenience.
exports.randomInsert = function(array, item) {
  var spliceIndex = Math.floor((array.length+1)*Math.random());
  array.splice(spliceIndex, 0, item);
};

// Object forEach, calls func with (val, key)
exports.forEach = function(obj, func) {
  Object.keys(obj).forEach(key => func(obj[key], key));
};

exports.size = function(obj) {
  return Object.keys(obj).length;
};

exports.values = function(obj) {
  return Object.keys(obj).map(key => {
    return obj[key];
  });
};

exports.find = function(arr, cond) {
  for (var i = 0; i < arr.length; i++) {
    if (cond(arr[i])) {
      return arr[i];
    }
  }
  return undefined;
};

exports.findIndex = function(arr, cond) {
  for (var i = 0; i < arr.length; i++) {
    if (cond(arr[i])) {
      return i;
    }
  }
  return -1;
};

exports.findKey = function(obj, cond) {
  for (var key in obj) {
    if (cond(obj[key], key)) {
      return key;
    }
  }
  return undefined;
};

exports.contains = function(arr, item) {
  return arr.indexOf(item) !== -1;
};

// Evaluates an obsArray of observables
exports.evaluate = function(obsArray) {
  return obsArray().map(val => val());
};

// Options should have the following properties:
// text - main text content
// buttonText - button title
// buttonFunc - button execute function
exports.alert = function(options) {
  console.warn('ALERT');
  var dom = "<div class='alert'>" +
    "<div class='alert_text'>" + options.text + "</div>" +
    "<button class='alert_button' type='button'>" + options.buttonText + "</button>" +
  "</div>";
  $('#game_content').hide();
  $('body').prepend(dom);
  $('.alert_button').on('click', () => {
    $('.alert').remove();
    $('#game_content').show();
    options.buttonFunc();
  });
};

},{}]},{},[7])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJBcHAuanMiLCJHYW1lLmpzIiwiUGxheWVycy5qcyIsIlBvbGwuanMiLCJSZXNwb25zZXMuanMiLCJTdGF0ZS5qcyIsImluZGV4LmpzIiwia29GaXJlLmpzIiwibm9kZV9tb2R1bGVzL2Jhc2ljY29udGV4dC9kaXN0L2Jhc2ljQ29udGV4dC5taW4uanMiLCJub2RlX21vZHVsZXMva25vY2tvdXQvYnVpbGQvb3V0cHV0L2tub2Nrb3V0LWxhdGVzdC5kZWJ1Zy5qcyIsInV0aWwuanMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNsQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDckNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdJQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMvdUxBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcbnZhciBrbyA9IHJlcXVpcmUoJy4va29GaXJlLmpzJyk7XG52YXIgR2FtZSA9IHJlcXVpcmUoJy4vR2FtZS5qcycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwuanMnKTtcblxuLy8gSGFuZGxlcyBsb2cgaW4gYW5kIGNyZWF0aW5nIGEgZ2FtZVxuZnVuY3Rpb24gQXBwKCkge1xuICB0aGlzLmRhdGFiYXNlID0gbmV3IEZpcmViYXNlKCdodHRwczovL3RoaW5nc3dpdGhiZXRoLmZpcmViYXNlaW8uY29tLycpO1xuXG4gIHRoaXMuc2VsZWN0ZWRHYW1lID0ga28ub2JzZXJ2YWJsZShudWxsKTtcblxuICB0aGlzLmZvdW5kR2FtZSA9IG51bGw7XG4gIHRoaXMuaXNIb3N0ID0gZmFsc2U7XG5cbiAgdGhpcy51cmxHYW1lS2V5ID0gbnVsbDtcbiAgdGhpcy51cmxQbGF5ZXJLZXkgPSBudWxsO1xuXG4gIHRoaXMuZ2FtZSA9IG51bGw7XG5cbiAgdGhpcy5qc29uRGF0YSA9IG51bGw7XG4gIHRoaXMuY29sb3JzID0ga28ub2JzZXJ2YWJsZUFycmF5KCk7XG4gIHRoaXMuc2VsZWN0ZWRDb2xvciA9IGtvLm9ic2VydmFibGUoXCJyZ2IoODEsIDEwNywgMTUxKVwiKTtcblxuICB0aGlzLmFjdGl2ZUdhbWVzID0ga28uZmlyZUFycmF5KHRoaXMuZGF0YWJhc2UpO1xuXG4gIC8vIExvYWQgSlNPTiBkYXRhXG4gIF9sb2FkSlNPTihyZXNwb25zZSA9PiB7XG4gICAgdGhpcy5qc29uRGF0YSA9IEpTT04ucGFyc2UocmVzcG9uc2UpO1xuICAgIHRoaXMuY29sb3JzKHRoaXMuanNvbkRhdGEuY29sb3JzKTtcbiAgfSk7XG5cbiAgdGhpcy5kYXRhYmFzZS5vbmNlKCd2YWx1ZScsIHNuYXBzaG90ID0+IHRoaXMuYXR0ZW1wdFVSTENvbm5lY3Qoc25hcHNob3QpKTtcblxuICAvLyBUT0RPOiBVc2Uga25vY2tvdXRcbiAgJCgnI2pvaW4nKS5vbignY2xpY2snLCB0aGlzLm9uSm9pbkJ1dHRvbi5iaW5kKHRoaXMpKTtcbiAgJCgnI2hvc3QnKS5vbignY2xpY2snLCB0aGlzLm9uSG9zdEJ1dHRvbi5iaW5kKHRoaXMpKTtcbiAgJCgnI3dhdGNoJykub24oJ2NsaWNrJywgdGhpcy5vbkpvaW5CdXR0b24uYmluZCh0aGlzLCB0cnVlKSk7XG59XG5cbkFwcC5wcm90b3R5cGUuc2VsZWN0R2FtZSA9IGZ1bmN0aW9uKGdhbWUsIGV2ZW50KSB7XG4gIHRoaXMuc2VsZWN0ZWRHYW1lKGdhbWUpO1xuICAkKCcuYWN0aXZlX2dhbWUnKS5yZW1vdmVDbGFzcygnc2VsZWN0ZWQnKTtcbiAgJChldmVudC50YXJnZXQpLmFkZENsYXNzKCdzZWxlY3RlZCcpO1xufTtcblxuQXBwLnByb3RvdHlwZS5hdHRlbXB0VVJMQ29ubmVjdCA9IGZ1bmN0aW9uKHNuYXBzaG90KSB7XG4gIC8vIEdldCBrZXlzIGZyb20gVVJMXG4gIHZhciB1cmxJdGVtcyA9IHdpbmRvdy5sb2NhdGlvbi5oYXNoLnNwbGl0KFwiL1wiKTtcbiAgdXJsSXRlbXMuZm9yRWFjaChpdGVtID0+IHtcbiAgICBzd2l0Y2ggKGl0ZW0uc2xpY2UoMCwgMikpIHtcbiAgICAgIGNhc2UgXCIlZ1wiOlxuICAgICAgICB0aGlzLnVybEdhbWVLZXkgPSBpdGVtLnNsaWNlKDIpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCIldVwiOlxuICAgICAgICB0aGlzLnVybFBsYXllcktleSA9IGl0ZW0uc2xpY2UoMik7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gSWYgVVJMIGRvZXNuJ3QgY29udGFpbiBpbmZvcm1hdGlvbiwgVVJMIGNvbm5lY3Rpb24gZmFpbHNcbiAgaWYgKCF0aGlzLnVybEdhbWVLZXkpIHtcbiAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiXCI7IC8vIENsZWFycyBVUkwgc3VmZml4XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gSW5pdGlhbGl6ZSBnYW1lL3BsYXllciBiYXNlZCBvbiBVUkxcbiAgdmFyIGdhbWVzID0gc25hcHNob3QudmFsKCk7XG5cbiAgLy8gUmV0cmlldmUgZ2FtZSBpZiBpbiBkYXRhYmFzZSwgYnJlYWsgaWYgbm90XG4gIGlmICghZ2FtZXMgfHwgISh0aGlzLnVybEdhbWVLZXkgaW4gZ2FtZXMpKSB7XG4gICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSBcIlwiOyAvLyBDbGVhcnMgVVJMIHN1ZmZpeFxuICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmV0cmlldmUgZ2FtZVwiKTtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gR2FtZSBhdmFpbGFibGVcbiAgdmFyIGdhbWVPYmogPSBzbmFwc2hvdC5jaGlsZCh0aGlzLnVybEdhbWVLZXkpLnJlZigpO1xuXG4gIHZhciBwbGF5ZXJzID0gZ2FtZXNbZ2FtZU9iai5rZXkoKV0ucGxheWVycztcbiAgaWYgKCF0aGlzLnVybFBsYXllcktleSB8fCAhcGxheWVycyB8fCAhKHRoaXMudXJsUGxheWVyS2V5IGluIHBsYXllcnMpKSB7XG4gICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSBcIi8lZ1wiICsgdGhpcy51cmxHYW1lS2V5OyAvLyBDbGVhcnMgcGxheWVyIHN1ZmZpeFxuICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmV0cmlldmUgcGxheWVyXCIpO1xuICAgIHRoaXMuZ2FtZSA9IG5ldyBHYW1lKHRoaXMsIGdhbWVPYmopO1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBQbGF5ZXIgYXZhaWxhYmxlXG4gIHZhciBwbGF5ZXJPYmogPSBnYW1lT2JqLmNoaWxkKFwicGxheWVyc1wiKS5jaGlsZCh0aGlzLnVybFBsYXllcktleSk7XG5cbiAgdGhpcy5nYW1lID0gbmV3IEdhbWUodGhpcywgZ2FtZU9iaiwgcGxheWVyT2JqKTtcbn07XG5cbkFwcC5wcm90b3R5cGUub25Ib3N0QnV0dG9uID0gZnVuY3Rpb24oKSB7XG4gIHZhciBhbmltYWwgPSBcIlwiO1xuICB2YXIgY3VycmVudEFuaW1hbHMgPSBbXTtcbiAgdGhpcy5hY3RpdmVHYW1lcygpLmZvckVhY2goZ2FtZSA9PiBjdXJyZW50QW5pbWFscy5wdXNoKGdhbWUuYW5pbWFsKSk7XG4gIC8vIEtlZXAgdHJ5aW5nIHRvIGdldCBhbiBhbmltYWwgbm90IGN1cnJlbnRseSBpbiB1c2VcbiAgLy8gVE9ETzogSW5lZmZpY2llbnQsIHN0YWxscyBmb3JldmVyIGlmIGFsbCBhbmltYWxzIGluIHVzZVxuICBkbyB7XG4gICAgYW5pbWFsID0gdXRpbC5yYW5kb21QaWNrKHRoaXMuanNvbkRhdGEuYW5pbWFscyk7XG4gIH0gd2hpbGUgKGN1cnJlbnRBbmltYWxzLmluZGV4T2YoYW5pbWFsKSA+IDApO1xuXG4gIHZhciBmcmFtZXMgPSBcIlwiO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IDE1OyBpKyspIHtcbiAgICBmcmFtZXMgKz0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogOSk7XG4gIH1cblxuICB0aGlzLmZvdW5kR2FtZSA9IHRoaXMuZGF0YWJhc2UucHVzaCh7XG4gICAgcm91bmQ6IDEsXG4gICAgc3RhdGU6IFN0YXRlLklOSVQsXG4gICAgYW5pbWFsOiBhbmltYWwsXG4gICAgZnJhbWVzOiBmcmFtZXMsXG4gICAgbnVtUGxheWVyczogMCxcbiAgICBudW1TbGVlcGluZzogMFxuICB9KTtcbiAgdGhpcy5pc0hvc3QgPSB0cnVlO1xuXG4gIHRoaXMuc2hvd05hbWVQcm9tcHQoKTtcbn07XG5cbkFwcC5wcm90b3R5cGUub25Kb2luQnV0dG9uID0gZnVuY3Rpb24od2F0Y2hPbmx5KSB7XG4gIHRoaXMuZm91bmRHYW1lID0gdGhpcy5kYXRhYmFzZS5jaGlsZCh0aGlzLnNlbGVjdGVkR2FtZSgpLmtleSk7XG4gIGNvbnNvbGUud2Fybih0aGlzLmZvdW5kR2FtZSk7XG4gIGlmICh3YXRjaE9ubHkgIT09IHRydWUpIHtcbiAgICB0aGlzLnNob3dOYW1lUHJvbXB0KCk7XG4gIH1cbiAgZWxzZSB7XG4gICAgY29uc29sZS53YXJuKCd3YXRjaG9ubHknLCB3YXRjaE9ubHkpO1xuICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gXCIvJWdcIiArIHRoaXMuc2VsZWN0ZWRHYW1lKCkua2V5O1xuICAgIHRoaXMuZ2FtZSA9IG5ldyBHYW1lKHRoaXMsIHRoaXMuZm91bmRHYW1lLCBudWxsKTtcbiAgfVxufTtcblxuQXBwLnByb3RvdHlwZS5zaG93TmFtZVByb21wdCA9IGZ1bmN0aW9uKCkge1xuICAkKCcjam9pbl9jb250YWluZXInKS5oaWRlKCk7XG4gICQoJyNob3N0X2NvbnRhaW5lcicpLmhpZGUoKTtcbiAgJCgnI25hbWVfY29udGFpbmVyJykuc2hvdygpO1xufTtcblxuQXBwLnByb3RvdHlwZS5vblN1Ym1pdE5hbWVCdXR0b24gPSBmdW5jdGlvbigpIHtcbiAgdmFyIG5hbWUgPSAkKCcjbmFtZScpLnZhbCgpO1xuXG4gIHRoaXMuZm91bmRHYW1lLmNoaWxkKCdudW1QbGF5ZXJzJykudHJhbnNhY3Rpb24oY3Vyck51bVBsYXllcnMgPT4ge1xuICAgIHJldHVybiBjdXJyTnVtUGxheWVycyArIDE7XG4gIH0sIChlcnIsIGNvbW1pdHRlZCwgc25hcHNob3QpID0+IHtcbiAgICBpZiAoIWNvbW1pdHRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgcGxheWVyT2JqID0gdGhpcy5mb3VuZEdhbWUuY2hpbGQoXCJwbGF5ZXJzXCIpLnB1c2goe1xuICAgICAgbmFtZTogbmFtZSxcbiAgICAgIGlzSG9zdDogdGhpcy5pc0hvc3QsXG4gICAgICBzY29yZTogMCxcbiAgICAgIGFkZGVkOiBEYXRlLm5vdygpLFxuICAgICAgY29sb3I6IHRoaXMuc2VsZWN0ZWRDb2xvcigpLFxuICAgICAgc2lnblBvc2l0aW9uOiB1dGlsLnJhbmRvbVBpY2soWydsZWZ0JywgJ3JpZ2h0JywgJ2NlbnRlciddKSxcbiAgICAgIHJhbms6IHNuYXBzaG90LnZhbCgpXG4gICAgfSk7XG4gICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSBcIi8lZ1wiICsgdGhpcy5mb3VuZEdhbWUua2V5KCkgKyBcIi8ldVwiICsgcGxheWVyT2JqLmtleSgpO1xuICAgIHRoaXMuZ2FtZSA9IG5ldyBHYW1lKHRoaXMsIHRoaXMuZm91bmRHYW1lLCBwbGF5ZXJPYmopO1xuICB9KTtcbn07XG5cbi8vIEZvdW5kIG9ubGluZSwgSlNPTiBwYXJzZSBmdW5jdGlvblxuZnVuY3Rpb24gX2xvYWRKU09OKGNhbGxiYWNrKSB7XG4gIHZhciB4b2JqID0gbmV3IFhNTEh0dHBSZXF1ZXN0KCk7XG4gIHhvYmoub3ZlcnJpZGVNaW1lVHlwZShcImFwcGxpY2F0aW9uL2pzb25cIik7XG4gIHhvYmoub3BlbignR0VUJywgJ2RhdGEuanNvbicsIHRydWUpO1xuICB4b2JqLm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAoeG9iai5yZWFkeVN0YXRlID09IDQgJiYgeG9iai5zdGF0dXMgPT0gXCIyMDBcIikge1xuICAgICAgLy8gUmVxdWlyZWQgdXNlIG9mIGFuIGFub255bW91cyBjYWxsYmFjayBhcyAub3BlbiB3aWxsIE5PVCByZXR1cm4gYSB2YWx1ZSBidXRcbiAgICAgIC8vIHNpbXBseSByZXR1cm5zIHVuZGVmaW5lZCBpbiBhc3luY2hyb25vdXMgbW9kZVxuICAgICAgY2FsbGJhY2soeG9iai5yZXNwb25zZVRleHQpO1xuICAgIH1cbiAgfTtcbiAgeG9iai5zZW5kKG51bGwpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IEFwcDtcbiIsIlxudmFyIGtvID0gcmVxdWlyZSgnLi9rb0ZpcmUuanMnKTtcbnZhciBiYXNpY0NvbnRleHQgPSByZXF1aXJlKCdiYXNpY2NvbnRleHQnKTtcbnZhciBQbGF5ZXJzID0gcmVxdWlyZSgnLi9QbGF5ZXJzLmpzJyk7XG52YXIgUmVzcG9uc2VzID0gcmVxdWlyZSgnLi9SZXNwb25zZXMuanMnKTtcbnZhciBQb2xsID0gcmVxdWlyZSgnLi9Qb2xsLmpzJyk7XG52YXIgU3RhdGUgPSByZXF1aXJlKCcuL1N0YXRlLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG4vLyBIYW5kbGVzIHByZXBhcmluZyB0aGUgZ2FtZSBhbmQgbW92aW5nIGJldHdlZW4gc3RhdGVzXG5mdW5jdGlvbiBHYW1lKGFwcCwgZ2FtZU9iaiwgcGxheWVyT2JqKSB7XG4gIHRoaXMuYXBwID0gYXBwO1xuICB0aGlzLmdhbWVPYmogPSBnYW1lT2JqO1xuICB0aGlzLnBsYXllck9iaiA9IHBsYXllck9iajtcblxuICB0aGlzLmdhbWVOYW1lID0ga28uZmlyZU9ic2VydmFibGUodGhpcy5nYW1lT2JqLmNoaWxkKCdhbmltYWwnKSk7XG4gIHRoaXMucGxheWVyTmFtZSA9IGtvLmZpcmVPYnNlcnZhYmxlKHRoaXMucGxheWVyT2JqLmNoaWxkKCduYW1lJyksIG5hbWUgPT4ge1xuICAgIGlmIChuYW1lID09PSBudWxsKSB7XG4gICAgICAvLyBZb3UndmUgYmVlbiByZW1vdmVkXG4gICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiXCI7XG4gICAgICB3aW5kb3cubG9jYXRpb24ucmVsb2FkKCk7XG4gICAgfVxuICB9KTtcbiAgdGhpcy5pc0hvc3QgPSBrby5maXJlT2JzZXJ2YWJsZSh0aGlzLnBsYXllck9iai5jaGlsZCgnaXNIb3N0JykpO1xuXG4gIHRoaXMuc3RhdGUgPSBrby5maXJlT2JzZXJ2YWJsZSh0aGlzLmdhbWVPYmouY2hpbGQoJ3N0YXRlJykpO1xuICB0aGlzLnJvdW5kID0ga28uZmlyZU9ic2VydmFibGUodGhpcy5nYW1lT2JqLmNoaWxkKCdyb3VuZCcpKTtcblxuICB0aGlzLnF1ZXN0aW9uID0ga28uZmlyZU9ic2VydmFibGUodGhpcy5nYW1lT2JqLmNoaWxkKCdxdWVzdGlvbicpKTtcblxuICB0aGlzLmd1ZXNzZWQgPSBrby5maXJlT2JzZXJ2YWJsZSh0aGlzLnBsYXllck9iai5jaGlsZCgnZ3Vlc3NlZCcpKTtcbiAgdGhpcy5yZXNwb25kZWQgPSBrby5maXJlT2JzZXJ2YWJsZSh0aGlzLnBsYXllck9iai5jaGlsZCgncmVzcG9uZGVkJykpO1xuXG4gIC8vIFNob3cgcHJvbXB0IGNvbXB1dGVkc1xuICB0aGlzLnNob3dDb21wbGV0ZUJ1dHRvbiA9IGtvLmNvbXB1dGVkKCgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZSgpID09PSBTdGF0ZS5HVUVTUyAmJiB0aGlzLmlzSG9zdCgpO1xuICB9KTtcbiAgdGhpcy5zaG93U3VibWl0UHJvbXB0ID0ga28uY29tcHV0ZWQoKCkgPT4ge1xuICAgIHJldHVybiAhdGhpcy5yZXNwb25kZWQoKSAmJiB0aGlzLnN0YXRlKCkgPT09IFN0YXRlLlJFU1BPTkQ7XG4gIH0pO1xuXG4gIHRoaXMucGxheWVycyA9IG51bGw7XG4gIHRoaXMucmVzcG9uc2VzID0gbnVsbDtcbiAgdGhpcy5wb2xsID0gbnVsbDtcblxuICAvLyBTZXQgdGhlIGdhbWUgYW5kIHBsYXllciBuYW1lcyBiZWZvcmUgYnVpbGRpbmcgdGhlIGRvbVxuICB2YXIgbG9hZEJvZHkgPSAkLkRlZmVycmVkKCk7XG4gICQoZG9jdW1lbnQuYm9keSkubG9hZCgnZ2FtZS5odG1sJywgKCkgPT4gbG9hZEJvZHkucmVzb2x2ZSgpKTtcbiAgbG9hZEJvZHkucHJvbWlzZSgpLnRoZW4oKCkgPT4ge1xuICAgIC8vIHRoaXMucHJlcGFyZVNldHRpbmdzKCk7XG4gICAgdGhpcy5wbGF5ZXJzID0gbmV3IFBsYXllcnModGhpcyk7XG4gICAgdGhpcy5yZXNwb25zZXMgPSBuZXcgUmVzcG9uc2VzKHRoaXMpO1xuICAgIHRoaXMucG9sbCA9IG5ldyBQb2xsKHRoaXMpO1xuICAgIC8vIHV0aWwuYmluZEZ1bmModGhpcy5nYW1lT2JqLmNoaWxkKCdzY29yaW5nJyksIHRoaXMub25TY29yaW5nVXBkYXRlLmJpbmQodGhpcykpO1xuICAgIGtvLmFwcGx5QmluZGluZ3ModGhpcywgJCgnI2dhbWVfY29udGVudCcpLmdldCgwKSk7XG4gICAgaWYgKHRoaXMuc3RhdGUoKSA9PT0gU3RhdGUuSU5JVCkge1xuICAgICAgdGhpcy5vblN0YXRlQ2hhbmdlKFN0YXRlLklOSVQpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gU3Vic2NyaXB0aW9uIHNraXBzIGluaXRpYWwgc2V0dGluZyBub3RpY2VcbiAgdGhpcy5zdGF0ZS5zdWJzY3JpYmUobmV3U3RhdGUgPT4gdGhpcy5vblN0YXRlQ2hhbmdlKG5ld1N0YXRlKSk7XG59XG5cbkdhbWUucHJvdG90eXBlLm9uQ2xpY2tTZXR0aW5ncyA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gIHZhciBpdGVtcyA9IFt7XG4gICAgICB0aXRsZTogJ05leHQgcm91bmQnLFxuICAgICAgaWNvbjogJ2ZhIGZhLWZvcndhcmQnLFxuICAgICAgZm46ICgpID0+IHRoaXMub25OZXh0Um91bmQoKSxcbiAgICAgIHZpc2libGU6IHRoaXMuaXNIb3N0KClcbiAgICB9LCB7XG4gICAgfSwge1xuICAgICAgdGl0bGU6ICdTaXQgb3V0IHRoaXMgcm91bmQnLFxuICAgICAgaWNvbjogJ2ZhIGZhLWJlZCcsXG4gICAgICBmbjogKCkgPT4gdGhpcy5wbGF5ZXJPYmouY2hpbGQoJ2FzbGVlcCcpLnNldCh0cnVlKVxuICAgIH0sIHtcbiAgICAgIHRpdGxlOiAnTGVhdmUgZ2FtZScsXG4gICAgICBpY29uOiAnZmEgZmEtc2lnbi1vdXQnLFxuICAgICAgZm46ICgpID0+IHRoaXMucmVtb3ZlRnJvbUdhbWUodGhpcy5wbGF5ZXJPYmoua2V5KCkpXG4gIH1dO1xuICBiYXNpY0NvbnRleHQuc2hvdyhpdGVtcywgZXZlbnQub3JpZ2luYWxFdmVudCk7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5vblN0YXRlQ2hhbmdlID0gZnVuY3Rpb24obmV3U3RhdGUpIHtcbiAgY29uc29sZS5sb2coJ3N0YXRlID0+ICcgKyBuZXdTdGF0ZSk7XG5cbiAgc3dpdGNoIChuZXdTdGF0ZSkge1xuICAgIGNhc2UgU3RhdGUuSU5JVDpcbiAgICAgIHRoaXMucGxheWVyT2JqLnVwZGF0ZSh7XG4gICAgICAgIGd1ZXNzZWQ6IG51bGwsXG4gICAgICAgIHJlc3BvbmRlZDogbnVsbCxcbiAgICAgICAgdm90ZTogbnVsbCxcbiAgICAgICAgaW5mbzogbnVsbFxuICAgICAgfSk7XG4gICAgICBpZiAodGhpcy5pc0hvc3QoKSkge1xuICAgICAgICB0aGlzLmdhbWVPYmoudXBkYXRlKHtcbiAgICAgICAgICBzdGF0ZTogU3RhdGUuUE9MTCxcbiAgICAgICAgICBwb2xsOiBudWxsLFxuICAgICAgICAgIHJlc3BvbnNlczogbnVsbCxcbiAgICAgICAgICBxdWVzdGlvbjogbnVsbCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlIFN0YXRlLlBPTEw6XG4gICAgICB0aGlzLnBsYXllck9iai51cGRhdGUoe1xuICAgICAgICBpbmZvOiBudWxsXG4gICAgICB9KTtcbiAgICAgIGlmICh0aGlzLmlzSG9zdCgpKSB7XG4gICAgICAgIHRoaXMucG9sbC5waWNrQ2hvaWNlcygpO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBTdGF0ZS5SRVNQT05EOlxuICAgICAgLy8gUmVtb3ZlIHBvbGwgZGF0YSBvbmNlIG5vIGxvbmdlciByZWxldmFudFxuICAgICAgdGhpcy5wbGF5ZXJPYmoudXBkYXRlKHtcbiAgICAgICAgcmVzcG9uZGVkOiBmYWxzZSxcbiAgICAgICAgaW5mbzogbnVsbFxuICAgICAgfSk7XG4gICAgICBpZiAodGhpcy5pc0hvc3QoKSkge1xuICAgICAgICB0aGlzLmdhbWVPYmouY2hpbGQoJ3BvbGwnKS51cGRhdGUoe1xuICAgICAgICAgIGFsbG93Vm90aW5nOiBmYWxzZSxcbiAgICAgICAgICB2b3RlczogbnVsbCxcbiAgICAgICAgICBzcGlubmVyOiBudWxsLFxuICAgICAgICAgIHRpbWVvdXQ6IG51bGxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlIFN0YXRlLkdVRVNTOlxuICAgICAgdGhpcy5wbGF5ZXJPYmoudXBkYXRlKHtcbiAgICAgICAgcmVzcG9uZGVkOiBudWxsLFxuICAgICAgICBndWVzc2VkOiBmYWxzZVxuICAgICAgfSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFN0YXRlLlNDT1JFOlxuICAgICAgdGhpcy5wbGF5ZXJPYmouY2hpbGQoJ3Njb3JlJykub25jZSgndmFsdWUnLCBzY29yZSA9PiB7XG4gICAgICAgIHRoaXMucGxheWVyT2JqLmNoaWxkKCdpbmZvJykuc2V0KHNjb3JlLnZhbCgpLnRvU3RyaW5nKCkpO1xuICAgICAgfSk7XG4gICAgICBicmVhaztcbiAgICBjYXNlIFN0YXRlLlJFQ0FQOlxuICAgICAgdGhpcy5wbGF5ZXJPYmouY2hpbGQoJ2luZm8nKS5zZXQobnVsbCk7XG4gICAgICBicmVhaztcbiAgfVxufTtcblxuR2FtZS5wcm90b3R5cGUub25OZXh0Um91bmQgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5nYW1lT2JqLnVwZGF0ZSh7XG4gICAgc3RhdGU6IFN0YXRlLklOSVQsXG4gICAgcm91bmQ6IHRoaXMucm91bmQoKSArIDEsXG4gIH0pO1xufTtcblxuR2FtZS5wcm90b3R5cGUucmVtb3ZlRnJvbUdhbWUgPSBmdW5jdGlvbihwbGF5ZXJLZXkpIHtcbiAgdGhpcy5nYW1lT2JqLmNoaWxkKCdudW1QbGF5ZXJzJykudHJhbnNhY3Rpb24oY3Vyck51bVBsYXllcnMgPT4ge1xuICAgIHJldHVybiBjdXJyTnVtUGxheWVycyAtIDE7XG4gIH0sIChlcnIsIGNvbW1pdHRlZCwgc25hcHNob3QpID0+IHtcbiAgICBpZiAoIWNvbW1pdHRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKS5jaGlsZChwbGF5ZXJLZXkpLnJlbW92ZSgpO1xuICAgIC8vIElmIHRoZSBwbGF5ZXIgaGFzIHJlc3BvbnNlZCwgcmVtb3ZlIHJlc3BvbnNlXG4gICAgdGhpcy5yZXNwb25zZXMucmVzcG9uc2VzKCkuZm9yRWFjaChyZXNwb25zZSA9PiB7XG4gICAgICBpZiAocmVzcG9uc2UucGxheWVyS2V5ID09PSBwbGF5ZXJLZXkpIHtcbiAgICAgICAgdGhpcy5nYW1lT2JqLmNoaWxkKCdyZXNwb25zZXMnKS5jaGlsZChyZXNwb25zZS5rZXkpLnJlbW92ZSgpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vIElmIHRoZSBwbGF5ZXIgd2FzIGFzbGVlcCwgZGVjcmVtZW50IG51bVNsZWVwaW5nXG4gICAgaWYgKHRoaXMucGxheWVycy5pc0FzbGVlcCgpKSB7XG4gICAgICB0aGlzLmdhbWVPYmouY2hpbGQoJ251bVNsZWVwaW5nJykudHJhbnNhY3Rpb24oY3Vyck51bVNsZWVwaW5nID0+IGN1cnJOdW1TbGVlcGluZyAtIDEpO1xuICAgIH1cbiAgfSk7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5vblN1Ym1pdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgaW5wdXQgPSAkKFwiI3Jlc3BvbnNlXCIpLnZhbCgpO1xuICBpZiAoaW5wdXQgPT09IFwiXCIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5wbGF5ZXJPYmouY2hpbGQoJ3Jlc3BvbmRlZCcpLnNldCh0cnVlKTtcbiAgdmFyIHJlcyA9IHRoaXMuZ2FtZU9iai5jaGlsZCgncmVzcG9uc2VzJykucHVzaCh7XG4gICAgcGxheWVyS2V5OiB0aGlzLnBsYXllck9iai5rZXkoKSxcbiAgICByZXNwb25zZTogaW5wdXQsXG4gICAgZWxpbWluYXRlZDogZmFsc2VcbiAgfSk7XG4gIHRoaXMuZ2FtZU9iai5jaGlsZCgncmVzcG9uc2VzJykuY2hpbGQocmVzLmtleSgpKS5zZXRQcmlvcml0eShNYXRoLnJhbmRvbSgpKTtcbn07XG5cbi8vIElmIG92ZXJyaWRlUGxheWVyS2V5IGlzIG5vdCBnaXZlbiwgdGhlIGN1cnJlbnQgcGxheWVyIGlzIGFzc3VtZWRcbkdhbWUucHJvdG90eXBlLm9uR3Vlc3NlZCA9IGZ1bmN0aW9uKG92ZXJyaWRlUGxheWVyS2V5KSB7XG4gIHZhciBwbGF5ZXJLZXkgPSBvdmVycmlkZVBsYXllcktleSB8fCB0aGlzLnBsYXllck9iai5rZXkoKTtcbiAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykuY2hpbGQocGxheWVyS2V5KS5jaGlsZCgnZ3Vlc3NlZCcpLnNldCh0cnVlKTtcbiAgLy8gTG9vayBpbnRvIHJlc3BvbnNlc0luZm8sIGZpbmQgeW91ciByZXNwb25zZSBhbmQgZWxpbWluYXRlIGl0XG4gIHRoaXMucmVzcG9uc2VzLnJlc3BvbnNlcygpLmZvckVhY2gocmVzcG9uc2UgPT4ge1xuICAgIGlmIChyZXNwb25zZSgpLnBsYXllcktleSA9PT0gcGxheWVyS2V5KSB7XG4gICAgICB0aGlzLmdhbWVPYmouY2hpbGQoJ3Jlc3BvbnNlcycpLmNoaWxkKHJlc3BvbnNlKCkua2V5KS5jaGlsZCgnZWxpbWluYXRlZCcpLnNldCh0cnVlKTtcbiAgICB9XG4gIH0pO1xufTtcblxuLy8gSG9zdCBvbmx5XG5HYW1lLnByb3RvdHlwZS5vbkd1ZXNzaW5nQ29tcGxldGUgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5nYW1lT2JqLnVwZGF0ZSh7XG4gICAgc3RhdGU6IFN0YXRlLlNDT1JFLFxuICAgIHJlc3BvbnNlczogbnVsbFxuICB9KTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gR2FtZTtcbiIsIlxudmFyIGtvID0gcmVxdWlyZSgnLi9rb0ZpcmUuanMnKTtcbnZhciBiYXNpY0NvbnRleHQgPSByZXF1aXJlKCdiYXNpY2NvbnRleHQnKTtcbnZhciBTdGF0ZSA9IHJlcXVpcmUoJy4vU3RhdGUuanMnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsLmpzJyk7XG5cbnZhciBOVU1fRlJBTUVTID0gMTU7IC8vIG51bWJlciBvZiBkaWZmZXJlbnQgZnJhbWVzIGJlZm9yZSByZXBlYXRzXG52YXIgRlJBTUVfVFlQRVMgPSBbJ2ZyYW1lX292YWwnLCAnZnJhbWVfc3F1YXJlJywgJ2ZyYW1lX3JlY3QnXTtcblxuLy8gSGFuZGxlcyBjcmVhdGlvbiBhbmQgbWFpbnRlbmFuY2Ugb2YgdGhlIGxpc3Qgb2YgcGxheWVyc1xuZnVuY3Rpb24gUGxheWVycyhnYW1lKSB7XG4gIHRoaXMuZ2FtZSA9IGdhbWU7XG4gIHRoaXMuZ2FtZU9iaiA9IGdhbWUuZ2FtZU9iajtcblxuICB0aGlzLmZyYW1lc1N0cmluZyA9IFwiXCI7XG4gIHRoaXMuZ2FtZU9iai5jaGlsZCgnZnJhbWVzJykub25jZSgndmFsdWUnLCBzbmFwID0+IHRoaXMuZnJhbWVzU3RyaW5nID0gc25hcC52YWwoKSk7XG5cbiAgdGhpcy5udW1QbGF5ZXJzID0ga28uZmlyZU9ic2VydmFibGUodGhpcy5nYW1lT2JqLmNoaWxkKCdudW1QbGF5ZXJzJykpO1xuICB0aGlzLm51bVNsZWVwaW5nID0ga28uZmlyZU9ic2VydmFibGUodGhpcy5nYW1lT2JqLmNoaWxkKCdudW1TbGVlcGluZycpKTtcblxuICB0aGlzLmlzQXNsZWVwID0ga28uZmlyZU9ic2VydmFibGUodGhpcy5nYW1lLnBsYXllck9iai5jaGlsZCgnYXNsZWVwJyksIHNsZWVwaW5nID0+IHtcbiAgICBpZiAoc2xlZXBpbmcpIHtcbiAgICAgIHRoaXMuc2xlZXBBbGVydCgpO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gRGVmaW5lIGZyYW1lIHR5cGVzIG9ic2VydmFibGUgYW5kIGNyZWF0ZSBsaXN0ZW5lciB0byBtYWludGFpbiBpdC5cbiAgdGhpcy5mcmFtZXMgPSBrby5vYnNlcnZhYmxlQXJyYXkoKTtcblxuICB0aGlzLnBsYXllcnMgPSBrby5maXJlQXJyYXlPYnNlcnZhYmxlcyh0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKS5vcmRlckJ5Q2hpbGQoJ3JhbmsnKSwgcGxheWVycyA9PiB7XG4gICAgY29uc29sZS53YXJuKCdQTEFZRVJTIENIQU5HRUQnKTtcbiAgICB2YXIgbnVtUGxheWVycyA9IHBsYXllcnMubGVuZ3RoO1xuICAgIHZhciBudW1GcmFtZXMgPSB0aGlzLmZyYW1lcygpLmxlbmd0aDtcbiAgICAvLyBBZGQgZnJhbWVzXG4gICAgd2hpbGUgKG51bUZyYW1lcyA8IG51bVBsYXllcnMpIHtcbiAgICAgIHZhciBuZXh0UmFuayA9IG51bUZyYW1lcyArIDE7XG4gICAgICB2YXIgcGxheWVyID0gdXRpbC5maW5kKHBsYXllcnMsIHAgPT4gcC5wZWVrKCkucmFuayA9PT0gbmV4dFJhbmspO1xuICAgICAgdGhpcy5mcmFtZXMucHVzaCh0aGlzLmJ1aWxkRnJhbWVPYmoocGxheWVyLCBuZXh0UmFuaykpO1xuICAgICAgbnVtRnJhbWVzKys7XG4gICAgfVxuICAgIC8vIFJlbW92ZSBmcmFtZXMgJiBwbGF5ZXIgZG9tXG4gICAgd2hpbGUgKG51bUZyYW1lcyA+IG51bVBsYXllcnMpIHtcbiAgICAgIC8vIEZpbmQgd2hpY2ggcGxheWVyIGlzIG1pc3NpbmdcbiAgICAgIGZvciAodmFyIHIgPSAxOyByIDw9IG51bUZyYW1lczsgcisrKSB7XG4gICAgICAgIGlmICghdXRpbC5maW5kKHBsYXllcnMsIHAgPT4gcC5wZWVrKCkucmFuayA9PT0gcikpIHtcbiAgICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBwbGF5ZXIgd2l0aCByYW5rIHIsIHJlbW92ZSB0aGF0IHBsYXllciBET01cbiAgICAgICAgICB0aGlzLnNldFJhbmtzKHsgcmVtb3ZlUmFuazogciB9KTtcbiAgICAgICAgICBudW1GcmFtZXMtLTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfSk7XG5cbiAgLy8gQ29tcHV0ZWQgZm9yIHNob3dpbmcgc2NvcmUgYWRqdXN0ZXJzXG4gIHRoaXMuc2hvd0FkanVzdGVycyA9IGtvLmNvbXB1dGVkKCgpID0+IHtcbiAgICByZXR1cm4gdGhpcy5nYW1lLnN0YXRlKCkgPT09IFN0YXRlLlNDT1JFICYmIHRoaXMuZ2FtZS5pc0hvc3QoKTtcbiAgfSk7XG59XG5cblBsYXllcnMucHJvdG90eXBlLmJ1aWxkRnJhbWVPYmogPSBmdW5jdGlvbihwbGF5ZXIsIHJhbmspIHtcbiAgdmFyIGZyYW1lVmFsdWUgPSBwYXJzZUludCh0aGlzLmZyYW1lc1N0cmluZ1socmFuayAtIDEpICUgTlVNX0ZSQU1FU10sIDEwKTtcbiAgdmFyIGZyYW1lVHlwZSA9IEZSQU1FX1RZUEVTW01hdGguZmxvb3IoZnJhbWVWYWx1ZSAlIDMpXTtcbiAgcmV0dXJuIG5ldyBGcmFtZShyYW5rLCBmcmFtZVR5cGUsIHBsYXllcik7XG59O1xuXG5QbGF5ZXJzLnByb3RvdHlwZS5hd2FrZUNvdW50ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB0aGlzLm51bVBsYXllcnMoKSAtIHRoaXMubnVtU2xlZXBpbmcoKTtcbn07XG5cbi8vIFdyaXRlcyBuZXcgcGxheWVyIG9yZGVyIHRvIGRhdGFiYXNlLCBvbmx5IGhvc3Qgc2hvdWxkIGRvIHRoaXNcbi8vIENhbGxzIG1vdmVQbGF5ZXJzIHdoZW4gZG9uZVxuLy8gb3B0aW9ucy5yZW1vdmVSYW5rIC0gaWYgc2V0LCByZW1vdmVzIHRoZSBwbGF5ZXIgYXQgdGhlIHJhbmsgYW5kIHRoZSBsYXN0IGZyYW1lXG4vLyBvcHRpb25zLmNhbGxiYWNrIC0gaWYgc2V0LCBydW5zIGEgY2FsbGJhY2sgb24gZXZlcnkgYW5pbWF0aW9uIGVuZCB3aXRoIHRoZSBmcmFtZVxuLy8gIGFzIHRoZSBhcmd1bWVudFxuUGxheWVycy5wcm90b3R5cGUuc2V0UmFua3MgPSBmdW5jdGlvbihvcHRpb25zKSB7XG4gIHZhciBwbGF5ZXJPcmRlciA9IHV0aWwuZXZhbHVhdGUodGhpcy5wbGF5ZXJzKTtcbiAgcGxheWVyT3JkZXIuc29ydCgocGxheWVyQSwgcGxheWVyQikgPT4ge1xuICAgIHZhciBhUHRzID0gcGxheWVyQS5zY29yZTtcbiAgICB2YXIgYlB0cyA9IHBsYXllckIuc2NvcmU7XG4gICAgcmV0dXJuIGFQdHMgIT09IGJQdHMgPyBiUHRzIC0gYVB0cyA6IHBsYXllckEuYWRkZWQgLSBwbGF5ZXJCLmFkZGVkO1xuICB9KTtcbiAgcGxheWVyT3JkZXIuZm9yRWFjaCgocGxheWVyLCBpbmRleCkgPT4ge1xuICAgIGlmIChpbmRleCArIDEgIT09IHBsYXllci5yYW5rKSB7XG4gICAgICAvLyBTZXR0aW5nIG5ldyByYW5rIGluIGRiXG4gICAgICB0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKS5jaGlsZChwbGF5ZXIua2V5KVxuICAgICAgICAuY2hpbGQoJ3JhbmsnKS5zZXQoaW5kZXggKyAxKTtcbiAgICB9XG4gIH0pO1xuICB0aGlzLl9tb3ZlUGxheWVycyhvcHRpb25zKTtcbn07XG5cbi8vIFNlZSBzZXRSYW5rcyBmb3IgZG9jdW1lbnRhdGlvblxuUGxheWVycy5wcm90b3R5cGUuX21vdmVQbGF5ZXJzID0gZnVuY3Rpb24ob3B0aW9ucykge1xuICBjb25zb2xlLndhcm4oJ1NUQVJUSU5HIE1PVkUgUExBWUVSUycpO1xuICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgdmFyIGN1cnJlbnRQbGF5ZXJzID0gdXRpbC5ldmFsdWF0ZSh0aGlzLnBsYXllcnMpO1xuICB0aGlzLmZyYW1lcygpLmZvckVhY2goZnJhbWUgPT4ge1xuICAgIHZhciBwbGF5ZXIgPSBmcmFtZS5wbGF5ZXIoKTtcbiAgICAvLyBjb25zb2xlLndhcm4oJ3JpZ2h0IHBsYWNlPycsIHBsYXllci5uYW1lLCBwbGF5ZXIucmFuaywgZnJhbWUucmFuayk7XG4gICAgaWYgKHBsYXllci5yYW5rICE9PSBmcmFtZS5yYW5rIHx8IHBsYXllci5yYW5rID09PSBvcHRpb25zLnJlbW92ZVJhbmspIHtcbiAgICAgIC8vIGNvbnNvbGUud2FybignUGxheWVyIG11c3QgYmUgbW92ZWQnKTtcbiAgICAgIC8vIFBsYXllciBtdXN0IGJlIG1vdmVkXG4gICAgICBmcmFtZS5tb3ZpbmcocGxheWVyLnJhbmsgPCBmcmFtZS5yYW5rID8gJ2xlZnRfb3V0JyA6ICdyaWdodF9vdXQnKTtcbiAgICAgIHZhciBmcmFtZUJvZHkgPSAkKCcuZnJhbWVfJyArIGZyYW1lLnJhbmsgKyAnIC5ib2R5Jyk7XG4gICAgICBmcmFtZUJvZHkub25lKCdhbmltYXRpb25lbmQnLCAoKSA9PiB7XG4gICAgICAgIGZyYW1lLmVtcHR5KHRydWUpO1xuICAgICAgICBmcmFtZS5tb3ZpbmcodW5kZWZpbmVkKTtcbiAgICAgICAgLy8gY29uc29sZS53YXJuKCd0aGlzLnBsYXllcnMoKScsIHRoaXMucGxheWVycy5wZWVrKClbMF0ucGVlaygpLCB0aGlzLnBsYXllcnMucGVlaygpWzFdLnBlZWsoKSk7XG4gICAgICAgIGlmIChvcHRpb25zLnJlbW92ZVJhbmsgJiYgZnJhbWUucmFuayA9PT0gdGhpcy5mcmFtZXMoKS5sZW5ndGgpIHtcbiAgICAgICAgICAvLyBSZW1vdmUgdGhlIGxhc3QgZnJhbWVcbiAgICAgICAgICAkKCcuZnJhbWVfJyArIGZyYW1lLnJhbmspLnJlbW92ZSgpO1xuICAgICAgICAgIHRoaXMuZnJhbWVzLnBvcCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgIHZhciBuZXdQbGF5ZXJJbmRleCA9IHV0aWwuZmluZEluZGV4KGN1cnJlbnRQbGF5ZXJzLCBwbGF5ZXIgPT4gcGxheWVyLnJhbmsgPT09IGZyYW1lLnJhbmspO1xuICAgICAgICAgIC8vIFRPRE86IFVwZGF0ZXMgcmVjZWl2ZWQgZHVyaW5nIG1vdmVtZW50IGFyZSBpZ25vcmVkXG4gICAgICAgICAgZnJhbWUucGxheWVyKGN1cnJlbnRQbGF5ZXJzW25ld1BsYXllckluZGV4XSk7XG4gICAgICAgICAgc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgICBmcmFtZS5lbXB0eShmYWxzZSk7XG4gICAgICAgICAgICBmcmFtZS5tb3ZpbmcobmV3UGxheWVySW5kZXggKyAxIDwgZnJhbWUucmFuayA/ICdsZWZ0X2luJyA6ICdyaWdodF9pbicpO1xuICAgICAgICAgICAgZnJhbWVCb2R5Lm9uZSgnYW5pbWF0aW9uZW5kJywgKCkgPT4ge1xuICAgICAgICAgICAgICBmcmFtZS5tb3ZpbmcodW5kZWZpbmVkKTtcbiAgICAgICAgICAgICAgY29uc29sZS53YXJuKCdET05FIE1PVklORyBBIFBMQVlFUicpO1xuICAgICAgICAgICAgICBpZiAob3B0aW9ucy5jYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIG9wdGlvbnMuY2FsbGJhY2soZnJhbWUpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9LCA1MDApO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICBvcHRpb25zLmNhbGxiYWNrKGZyYW1lKTtcbiAgICB9XG4gIH0pO1xufTtcblxuUGxheWVycy5wcm90b3R5cGUub25DbGlja1BsYXllck1lbnUgPSBmdW5jdGlvbihmcmFtZSwgZXZlbnQpIHtcbiAgdmFyIHBsYXllciA9IGZyYW1lLnBsYXllcigpO1xuICB2YXIgaXNIb3N0ID0gcGxheWVyLmlzSG9zdDtcbiAgdmFyIGl0ZW1zID0gW3tcbiAgICAgIHRpdGxlOiAnR2l2ZSBwb2ludCcsXG4gICAgICBpY29uOiAnZmEgZmEtcGx1cycsXG4gICAgICBmbjogKCkgPT4gdGhpcy5hZGp1c3RTY29yZShwbGF5ZXIua2V5LCAxKVxuICAgIH0sIHtcbiAgICAgIHRpdGxlOiAnVGFrZSBwb2ludCcsXG4gICAgICBpY29uOiAnZmEgZmEtbWludXMnLFxuICAgICAgZm46ICgpID0+IHRoaXMuYWRqdXN0U2NvcmUocGxheWVyLmtleSwgLTEpXG4gICAgfSwge1xuICAgIH0sIHtcbiAgICAgIHRpdGxlOiAnTWFyayByZXNwb25zZSBndWVzc2VkJyxcbiAgICAgIGljb246ICdmYSBmYS1xdW90ZS1sZWZ0JyxcbiAgICAgIHZpc2libGU6ICFpc0hvc3QgJiYgdGhpcy5nYW1lLnN0YXRlKCkgPT09IFN0YXRlLkdVRVNTLFxuICAgICAgZGlzYWJsZWQ6IHBsYXllci5ndWVzc2VkLFxuICAgICAgZm46ICgpID0+IHRoaXMuZ2FtZS5vbkd1ZXNzZWQocGxheWVyLmtleSlcbiAgICB9LCB7XG4gICAgICB0aXRsZTogJ1NpdCBvdXQgdGhpcyByb3VuZCcsXG4gICAgICBpY29uOiAnZmEgZmEtYmVkJyxcbiAgICAgIHZpc2libGU6ICFpc0hvc3QsXG4gICAgICBmbjogKCkgPT4gdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykuY2hpbGQocGxheWVyLmtleSkuY2hpbGQoJ2FzbGVlcCcpLnNldCh0cnVlKVxuICAgIH0sIHtcbiAgICAgIHRpdGxlOiAnUmVtb3ZlIHBsYXllcicsXG4gICAgICBpY29uOiAnZmEgZmEtYmFuJyxcbiAgICAgIHZpc2libGU6ICFpc0hvc3QsXG4gICAgICBmbjogKCkgPT4gdGhpcy5nYW1lLnJlbW92ZUZyb21HYW1lKHBsYXllci5rZXkpXG4gIH1dO1xuICBiYXNpY0NvbnRleHQuc2hvdyhpdGVtcywgZXZlbnQub3JpZ2luYWxFdmVudCk7XG59O1xuXG4vLyBBZGp1c3RzIGEgcGxheWVycyBzY29yZSBieSBhbXRcblBsYXllcnMucHJvdG90eXBlLmFkanVzdFNjb3JlID0gZnVuY3Rpb24oa2V5LCBhbXQpIHtcbiAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykuY2hpbGQoa2V5KS5jaGlsZCgnc2NvcmUnKVxuICAudHJhbnNhY3Rpb24oY3VyclNjb3JlID0+IHtcbiAgICAgIHJldHVybiBjdXJyU2NvcmUgKyBhbXQ7XG4gIH0sIChlcnIsIGNvbW1pdHRlZCwgc25hcHNob3QpID0+IHtcbiAgICBpZiAoIWNvbW1pdHRlZCkgcmV0dXJuO1xuICAgIHRoaXMuc2V0UmFua3MoKTtcbiAgfSk7XG59O1xuXG5QbGF5ZXJzLnByb3RvdHlwZS5zbGVlcEFsZXJ0ID0gZnVuY3Rpb24oKSB7XG4gIHV0aWwuYWxlcnQoe1xuICAgIHRleHQ6IFwiWW91J3JlIG9uIGJyZWFrXCIsXG4gICAgYnV0dG9uVGV4dDogXCJCYWNrIHRvIHRoZSBnYW1lXCIsXG4gICAgYnV0dG9uRnVuYzogKCkgPT4gdGhpcy5nYW1lLnBsYXllck9iai5jaGlsZCgnYXNsZWVwJykuc2V0KG51bGwpXG4gIH0pO1xufTtcblxuLy8gSG9zdCBvbmx5XG5QbGF5ZXJzLnByb3RvdHlwZS5vblNldFNjb3JlcyA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmZyYW1lcygpLmZvckVhY2goZnJhbWUgPT4ge1xuICAgIHZhciBhZGogPSBmcmFtZS5zY29yZUFkanVzdG1lbnQoKTtcbiAgICB2YXIga2V5ID0gZnJhbWUucGxheWVyKCkua2V5O1xuICAgIHZhciBzY29yZVJlZiA9IHRoaXMuZ2FtZU9iai5jaGlsZCgncGxheWVycycpLmNoaWxkKGtleSkuY2hpbGQoJ3Njb3JlJyk7XG4gICAgc2NvcmVSZWYub25jZSgndmFsdWUnLCBzbmFwc2hvdCA9PiBzY29yZVJlZi5zZXQoc25hcHNob3QudmFsKCkgKyBhZGopKTtcbiAgfSk7XG4gIHRoaXMuZ2FtZU9iai5jaGlsZCgnc3RhdGUnKS5zZXQoU3RhdGUuUkVDQVApO1xuICB0aGlzLnNldFJhbmtzKHtcbiAgICBjYWxsYmFjazogZnJhbWUgPT4ge1xuICAgICAgLy8gQWZ0ZXIgYW5pbWF0aW9uIGZpbmlzaGVzLCBzaG93IHVwZGF0ZWQgc2NvcmVzXG4gICAgICAvLyB2YXIgcGxheWVyT2JqID0gdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykuY2hpbGQoZnJhbWUucGxheWVyKCkua2V5KTtcbiAgICAgIC8vIHBsYXllck9iai5jaGlsZCgnc2NvcmUnKS5vbmNlKHNjb3JlID0+IHtcbiAgICAgIC8vICAgcGxheWVyT2JqLmNoaWxkKCdpbmZvJykuc2V0KHNjb3JlLnZhbCgpLnRvU3RyaW5nKCkpO1xuICAgICAgLy8gfSk7XG4gICAgfVxuICB9KTtcbn07XG5cbmZ1bmN0aW9uIEZyYW1lKHJhbmssIHR5cGUsIG9ic1BsYXllcikge1xuICB0aGlzLnJhbmsgPSByYW5rO1xuICB0aGlzLnR5cGUgPSB0eXBlO1xuICB0aGlzLnBsYXllciA9IG9ic1BsYXllcjtcbiAgdGhpcy5zY29yZUFkanVzdG1lbnQgPSBrby5vYnNlcnZhYmxlKDApO1xuICB0aGlzLmVtcHR5ID0ga28ub2JzZXJ2YWJsZShmYWxzZSk7XG4gIHRoaXMubW92aW5nID0ga28ub2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFBsYXllcnM7XG4iLCJcbnZhciBrbyA9IHJlcXVpcmUoJy4va29GaXJlLmpzJyk7XG52YXIgU3RhdGUgPSByZXF1aXJlKCcuL1N0YXRlLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG52YXIgRFVSQVRJT04gPSAzMDAwO1xuXG4vLyBIYW5kbGVzIGNyZWF0aW9uIG9mIHRoZSBsaXN0IG9mIHF1ZXN0aW9ucyBhbmQgdGhlIHBvbGwgcHJvY2Vzc1xuZnVuY3Rpb24gUG9sbChnYW1lKSB7XG4gIHRoaXMuZ2FtZSA9IGdhbWU7XG4gIHRoaXMudGltZXIgPSBuZXcgVGltZXIoKTtcbiAgdGhpcy5zcGlubmVyID0gbmV3IFNwaW5uZXIoKTtcblxuICB0aGlzLnBvbGxPYmogPSB0aGlzLmdhbWUuZ2FtZU9iai5jaGlsZCgncG9sbCcpO1xuXG4gIHRoaXMuY2hvaWNlcyA9IGtvLmZpcmVBcnJheSh0aGlzLnBvbGxPYmouY2hpbGQoJ2Nob2ljZXMnKSk7XG4gIHRoaXMuYWxsb3dWb3RpbmcgPSBrby5maXJlT2JzZXJ2YWJsZSh0aGlzLnBvbGxPYmouY2hpbGQoJ2FsbG93Vm90aW5nJykpO1xuICB0aGlzLnZvdGVzID0ga28uZmlyZUFycmF5KHRoaXMucG9sbE9iai5jaGlsZCgndm90ZXMnKSk7XG5cbiAgdXRpbC5iaW5kRnVuYyh0aGlzLnBvbGxPYmouY2hpbGQoJ3RpbWVvdXQnKSwgdGhpcy5vblRpbWVvdXRDaGFuZ2UuYmluZCh0aGlzKSk7XG4gIHV0aWwuYmluZEZ1bmModGhpcy5wb2xsT2JqLmNoaWxkKCdzcGlubmVyJyksIHRoaXMub25TcGlubmVyVXBkYXRlLmJpbmQodGhpcykpO1xuXG4gIHRoaXMudm90ZXMuc3Vic2NyaWJlKHRoaXMub25Wb3Rlc1VwZGF0ZS5iaW5kKHRoaXMpKTtcbn1cblxuUG9sbC5wcm90b3R5cGUucGlja0Nob2ljZXMgPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS53YXJuKCdwaWNraW5nIGNob2ljZXMnKTtcbiAgdmFyIGFsbFF1ZXN0aW9ucyA9IHRoaXMuZ2FtZS5hcHAuanNvbkRhdGEucXVlc3Rpb25zO1xuICB2YXIgcGlja3MgPSB1dGlsLnJhbmRvbVBpY2tzKGFsbFF1ZXN0aW9ucywgMyk7XG4gIHZhciBsYWJlbHMgPSBbJ0EnLCAnQicsICdDJ107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgMzsgaSsrKSB7XG4gICAgdGhpcy5wb2xsT2JqLmNoaWxkKCdjaG9pY2VzJykucHVzaCh7XG4gICAgICBsYWJlbDogbGFiZWxzW2ldLCB0ZXh0OiBwaWNrc1tpXVxuICAgIH0pO1xuICB9XG4gIHRoaXMucG9sbE9iai51cGRhdGUoe1xuICAgIGFsbG93Vm90aW5nOiB0cnVlLFxuICAgIHRpbWVvdXQ6ICdyZWFkeSdcbiAgfSk7XG4gIHRoaXMudGltZXIucmVzZXQoKTtcbn07XG5cblBvbGwucHJvdG90eXBlLm9uVm90ZXNVcGRhdGUgPSBmdW5jdGlvbih2b3Rlcykge1xuICB2YXIgbnVtVm90ZXJzID0gdm90ZXMubGVuZ3RoO1xuXG4gIC8vIElmIHNvbWVvbmUgdm90ZWQsIGFuZCBpdCBpc24ndCBhbHJlYWR5IHNldCwgc2V0IHRoZSB0aW1lb3V0LlxuICBpZiAobnVtVm90ZXJzID4gMCkge1xuICAgIHRoaXMucG9sbE9iai5jaGlsZCgndGltZW91dCcpLnRyYW5zYWN0aW9uKGN1cnJUaW1lb3V0ID0+IHtcbiAgICAgIHJldHVybiBjdXJyVGltZW91dCA9PT0gJ3JlYWR5JyA/IERhdGUubm93KCkgKyBEVVJBVElPTiA6IHVuZGVmaW5lZDtcbiAgICB9KTtcbiAgfVxuICAvLyBJZiBldmVyeW9uZSB2b3RlZCwgcGljayBxdWVzdGlvbiBhbmQgY2hhbmdlIHN0YXRlIHRvIHJlc3BvbmQuXG4gIGlmIChudW1Wb3RlcnMgPT09IHRoaXMuZ2FtZS5wbGF5ZXJzLmF3YWtlQ291bnQoKSkge1xuICAgIHRoaXMudGltZXIuc3RvcCgpO1xuICB9XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5vblRpbWVvdXRDaGFuZ2UgPSBmdW5jdGlvbih0aW1lb3V0KSB7XG4gIGlmICh0eXBlb2YgdGltZW91dCA9PT0gJ251bWJlcicpIHtcbiAgICB0aGlzLnRpbWVyLnN0YXJ0KHRpbWVvdXQsICgpID0+IHtcbiAgICAgIGlmICh0aGlzLmdhbWUuaXNIb3N0KCkpIHtcbiAgICAgICAgdGhpcy5waWNrV2lubmVyKCk7XG4gICAgICB9XG4gICAgfSk7XG4gIH1cbn07XG5cblBvbGwucHJvdG90eXBlLm9uVm90ZSA9IGZ1bmN0aW9uKGNob2ljZSkge1xuICB2YXIgYWxyZWFkeVZvdGVkID0gdXRpbC5maW5kKHRoaXMudm90ZXMoKSwgdm90ZSA9PiB7XG4gICAgcmV0dXJuIHZvdGUucGxheWVyS2V5ID09PSB0aGlzLmdhbWUucGxheWVyT2JqLmtleSgpO1xuICB9KTtcbiAgaWYgKGFscmVhZHlWb3RlZCkgcmV0dXJuO1xuICB0aGlzLnBvbGxPYmouY2hpbGQoJ3ZvdGVzJykucHVzaCh7XG4gICAgbmFtZTogdGhpcy5nYW1lLnBsYXllck5hbWUoKSxcbiAgICBwbGF5ZXJLZXk6IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCksXG4gICAgdm90ZTogY2hvaWNlLmxhYmVsXG4gIH0pO1xuICB0aGlzLmdhbWUucGxheWVyT2JqLnVwZGF0ZSh7XG4gICAgdm90ZTogY2hvaWNlLmxhYmVsLFxuICAgIGluZm86IGNob2ljZS5sYWJlbFxuICB9KTtcbn07XG5cbi8vIE9ubHkgY2FsbGVkIGJ5IGhvc3RcblBvbGwucHJvdG90eXBlLnBpY2tXaW5uZXIgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGNvdW50ID0geyBBOiAwLCBCOiAwLCBDOiAwIH07XG4gIHRoaXMudm90ZXMoKS5mb3JFYWNoKHZvdGVEYXRhID0+IGNvdW50W3ZvdGVEYXRhLnZvdGVdKyspO1xuICB2YXIgbWF4Vm90ZXMgPSBNYXRoLm1heC5hcHBseShudWxsLCB1dGlsLnZhbHVlcyhjb3VudCkpO1xuICB2YXIgZmluYWxpc3RzID0gT2JqZWN0LmtleXMoY291bnQpLmZpbHRlcihjaG9pY2UgPT4ge1xuICAgIHJldHVybiBjb3VudFtjaG9pY2VdID09PSBtYXhWb3RlcztcbiAgfSk7XG4gIGlmIChmaW5hbGlzdHMubGVuZ3RoID4gMSkge1xuICAgIHRoaXMucG9sbE9iai5jaGlsZCgnc3Bpbm5lcicpLnVwZGF0ZSh7XG4gICAgICBjaG9pY2VzOiBmaW5hbGlzdHMuam9pbignJyksXG4gICAgICBzZXF1ZW5jZTogU3Bpbm5lci5yYW5kb21TZXF1ZW5jZSgpLFxuICAgICAgc3RhcnRJbmRleDogTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogZmluYWxpc3RzLmxlbmd0aClcbiAgICB9KTtcbiAgfVxuICBlbHNlIHtcbiAgICB0aGlzLnN1Ym1pdFdpbm5lcihmaW5hbGlzdHNbMF0pO1xuICB9XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5vblNwaW5uZXJVcGRhdGUgPSBmdW5jdGlvbihzcGluT2JqKSB7XG4gIGlmIChzcGluT2JqICYmIHNwaW5PYmouc2VxdWVuY2UpIHtcbiAgICB0aGlzLnNwaW5uZXIuc3RhcnQoc3Bpbk9iai5jaG9pY2VzLCBzcGluT2JqLnNlcXVlbmNlLCBzcGluT2JqLnN0YXJ0SW5kZXgsIGl0ZW0gPT4ge1xuICAgICAgaWYgKHRoaXMuZ2FtZS5pc0hvc3QoKSkge1xuICAgICAgICB0aGlzLnN1Ym1pdFdpbm5lcihpdGVtKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufTtcblxuLy8gT25seSBjYWxsZWQgYnkgaG9zdFxuUG9sbC5wcm90b3R5cGUuc3VibWl0V2lubmVyID0gZnVuY3Rpb24od2lubmVyKSB7XG4gIC8vIFJlbW92ZSBhbGwgY2hvaWNlcyBleGNlcHQgd2lubmVyXG4gIHZhciByZW1vdmFsS2V5cyA9IFtdO1xuICB0aGlzLmNob2ljZXMoKS5mb3JFYWNoKGNob2ljZSA9PiB7XG4gICAgaWYgKGNob2ljZS5sYWJlbCAhPT0gd2lubmVyKSByZW1vdmFsS2V5cy5wdXNoKGNob2ljZS5rZXkpO1xuICB9KTtcbiAgcmVtb3ZhbEtleXMuZm9yRWFjaChrZXkgPT4gdGhpcy5wb2xsT2JqLmNoaWxkKCdjaG9pY2VzJykuY2hpbGQoa2V5KS5yZW1vdmUoKSk7XG4gIHRoaXMuZ2FtZS5nYW1lT2JqLnVwZGF0ZSh7XG4gICAgcXVlc3Rpb246IHdpbm5lcixcbiAgICBzdGF0ZTogU3RhdGUuUkVTUE9ORFxuICB9KTtcbn07XG5cbi8vIEEgc2ltcGxlIGNvdW50ZG93biB0aW1lclxuZnVuY3Rpb24gVGltZXIoKSB7XG4gIHRoaXMuaW50ZXJ2YWxJZCA9IG51bGw7XG4gIHRoaXMuaXNSdW5uaW5nID0gZmFsc2U7XG4gIHRoaXMuc3RvcENhbGxiYWNrID0gKCkgPT4ge307XG59XG5cblRpbWVyLnByb3RvdHlwZS5yZXNldCA9IGZ1bmN0aW9uKCkge1xuICAkKCcuc2xpY2UnKS5zaG93KCk7XG4gICQoJy5zbGljZScpLmNzcygndHJhbnNmb3JtJywgJ3JvdGF0ZSgwZGVnKScpO1xuICAkKCcubWFza19zbGljZScpLmhpZGUoKTtcbn07XG5cblRpbWVyLnByb3RvdHlwZS5zdGFydCA9IGZ1bmN0aW9uKHRpbWVvdXQsIHN0b3BDYWxsYmFjaykge1xuICBpZiAodGhpcy5pc1J1bm5pbmcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5pc1J1bm5pbmcgPSB0cnVlO1xuICB0aGlzLnN0b3BDYWxsYmFjayA9IHN0b3BDYWxsYmFjaztcbiAgdGhpcy5pbnRlcnZhbElkID0gd2luZG93LnNldEludGVydmFsKHRoaXMuYnVpbGREb20uYmluZCh0aGlzKSwgMTAsIHRpbWVvdXQpO1xufTtcblxuVGltZXIucHJvdG90eXBlLmJ1aWxkRG9tID0gZnVuY3Rpb24odGltZW91dCkge1xuICB2YXIgdGltZUxlZnQgPSB0aW1lb3V0IC0gRGF0ZS5ub3coKTtcbiAgdmFyIGhhbGYgPSBEVVJBVElPTiAvIDI7XG4gIHZhciBmcmFjO1xuICB2YXIgZGVnO1xuICBpZiAodGltZUxlZnQgPiBoYWxmKSB7XG4gICAgJCgnLm1hc2tfc2xpY2UnKS5oaWRlKCk7XG4gICAgJCgnLnNsaWNlJykuc2hvdygpO1xuICAgIC8vIFNsaWNlIGdvZXMgOTBkZWcgLT4gMjcwZGVnXG4gICAgZnJhYyA9IDEgLSAoKHRpbWVMZWZ0IC0gaGFsZikgLyBoYWxmKTtcbiAgICBkZWcgPSAoZnJhYyAqIDE4MCk7XG4gICAgJCgnLnNsaWNlJykuY3NzKCd0cmFuc2Zvcm0nLCAncm90YXRlKCcgKyBkZWcgKyAnZGVnKScpO1xuICB9XG4gIGVsc2UgaWYgKHRpbWVMZWZ0IDwgaGFsZiAmJiB0aW1lTGVmdCA+IDApIHtcbiAgICAkKCcuc2xpY2UnKS5oaWRlKCk7XG4gICAgJCgnLm1hc2tfc2xpY2UnKS5zaG93KCk7XG4gICAgZnJhYyA9IDEgLSAodGltZUxlZnQgLyBoYWxmKTtcbiAgICBkZWcgPSAoZnJhYyAqIDE4MCk7XG4gICAgJCgnLm1hc2tfc2xpY2UnKS5jc3MoJ3RyYW5zZm9ybScsICdyb3RhdGUoJyArIGRlZyArICdkZWcpJyk7XG4gIH1cbiAgZWxzZSB7XG4gICAgdGhpcy5zdG9wKCk7XG4gIH1cbn07XG5cblRpbWVyLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24oKSB7XG4gIHdpbmRvdy5jbGVhckludGVydmFsKHRoaXMuaW50ZXJ2YWxJZCk7XG4gIHRoaXMuaXNSdW5uaW5nID0gZmFsc2U7XG4gIHRoaXMuc3RvcENhbGxiYWNrKCk7XG59O1xuXG4vLyBBIHJhbmRvbSBzZWxlY3Rpb24gc3Bpbm5lclxuZnVuY3Rpb24gU3Bpbm5lcigpIHtcbiAgdGhpcy5pbnRlcnZhbElkID0gbnVsbDtcbiAgdGhpcy5pc1J1bm5pbmcgPSBmYWxzZTtcbiAgdGhpcy5zdG9wQ2FsbGJhY2sgPSAoKSA9PiB7fTtcbn1cblxuU3Bpbm5lci5wcm90b3R5cGUuc3RhcnQgPSBmdW5jdGlvbihjaG9pY2VzLCBzZXEsIHN0YXJ0SW5kZXgsIHN0b3BDYWxsYmFjaykge1xuICBpZiAodGhpcy5pc1J1bm5pbmcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5pc1J1bm5pbmcgPSB0cnVlO1xuICB0aGlzLnN0b3BDYWxsYmFjayA9IHN0b3BDYWxsYmFjaztcbiAgdGhpcy5pbnRlcnZhbElkID0gd2luZG93LnNldEludGVydmFsKFxuICAgIHRoaXMuYnVpbGREb20uYmluZCh0aGlzKSwgMTAsIGNob2ljZXMsIHNlcSwgc3RhcnRJbmRleFxuICApO1xufTtcblxuU3Bpbm5lci5wcm90b3R5cGUuYnVpbGREb20gPSBmdW5jdGlvbihjaG9pY2VzLCBzZXEsIHN0YXJ0SW5kZXgpIHtcbiAgdmFyIG5vdyA9IERhdGUubm93KCk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgc2VxLmxlbmd0aCAtIDE7IGkrKykge1xuICAgIGlmIChub3cgPj0gc2VxW2ldICYmIG5vdyA8IHNlcVtpICsgMV0pIHtcbiAgICAgIHZhciBwaWNrID0gY2hvaWNlc1soc3RhcnRJbmRleCArIGkpICUgY2hvaWNlcy5sZW5ndGhdO1xuICAgICAgJCgnLmNob2ljZV9jb250YWluZXInKS5yZW1vdmVDbGFzcygnc2VsZWN0ZWQnKTtcbiAgICAgICQoJyMnICsgcGljaykuYWRkQ2xhc3MoJ3NlbGVjdGVkJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuICB9XG4gIGlmIChub3cgPj0gc2VxW3NlcS5sZW5ndGggLSAxXSkge1xuICAgIHRoaXMuc3RvcChjaG9pY2VzWyhzdGFydEluZGV4ICsgc2VxLmxlbmd0aCAtIDIpICUgY2hvaWNlcy5sZW5ndGhdKTtcbiAgfVxufTtcblxuU3Bpbm5lci5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKHdpbm5lcikge1xuICB3aW5kb3cuY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsSWQpO1xuICB0aGlzLmlzUnVubmluZyA9IGZhbHNlO1xuICB0aGlzLnN0b3BDYWxsYmFjayh3aW5uZXIpO1xufTtcblxuLy8gR2VuZXJhdGVzIGEgcmFuZG9tIHNlcXVlbmNlIHRoYXQgaXMgZGVsYXllZCBvdmVyIHRpbWVcblNwaW5uZXIucmFuZG9tU2VxdWVuY2UgPSBmdW5jdGlvbigpIHtcbiAgLy8gU2VxdWVuY2VzIG9mIHRpbWUgdmFsdWVzIG9uIHdoaWNoIHRvIGNoYW5nZSBzZWxlY3Rpb25cbiAgdmFyIHNlcSA9IFtdO1xuICB2YXIgdGltZSA9IERhdGUubm93KCk7XG4gIHZhciBkZWxheSA9IDUwO1xuICB3aGlsZSAoZGVsYXkgPCA4MDAgKyAoTWF0aC5yYW5kb20oKSAqIDEwMCkpIHtcbiAgICBzZXEucHVzaCh0aW1lKTtcbiAgICB0aW1lICs9IGRlbGF5O1xuICAgIGRlbGF5ICo9IDEuMiArIChNYXRoLnJhbmRvbSgpICogMC4wNSk7XG4gIH1cbiAgc2VxLnB1c2godGltZSk7XG4gIHJldHVybiBzZXE7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFBvbGw7XG4iLCJcbnZhciBrbyA9IHJlcXVpcmUoJy4va29GaXJlLmpzJyk7XG52YXIgU3RhdGUgPSByZXF1aXJlKCcuL1N0YXRlLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG4vLyBIYW5kbGVzIGNyZWF0aW9uIGFuZCBjcm9zc2luZyBvdXQgb2YgdGhlIGxpc3Qgb2YgcmVzcG9uc2VzXG5mdW5jdGlvbiBSZXNwb25zZXMoZ2FtZSkge1xuICB0aGlzLmdhbWUgPSBnYW1lO1xuXG4gIHZhciByZXNwb25zZXNSZWYgPSB0aGlzLmdhbWUuZ2FtZU9iai5jaGlsZCgncmVzcG9uc2VzJyk7XG4gIHRoaXMucmVzcG9uc2VzID0ga28uZmlyZUFycmF5T2JzZXJ2YWJsZXMocmVzcG9uc2VzUmVmLCBuZXdWYWwgPT4ge1xuICAgIGlmIChuZXdWYWwubGVuZ3RoID09PSB0aGlzLmdhbWUucGxheWVycy5hd2FrZUNvdW50KCkpIHtcbiAgICAgIHRoaXMuZ2FtZS5nYW1lT2JqLmNoaWxkKCdzdGF0ZScpLnNldChTdGF0ZS5HVUVTUyk7XG4gICAgfVxuICB9KTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZXNwb25zZXM7XG4iLCJcblN0YXRlID0ge1xuICBJTklUOiAxLFxuICBQT0xMOiAyLFxuICBSRVNQT05EOiAzLFxuICBHVUVTUzogNCxcbiAgU0NPUkU6IDUsXG4gIFJFQ0FQOiA2XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFN0YXRlO1xuIiwiXG52YXIgQXBwID0gcmVxdWlyZSgnLi9BcHAuanMnKTtcbnZhciBrbyA9IHJlcXVpcmUoJ2tub2Nrb3V0Jyk7XG5cbi8vIFRPRE86XG4vLyBISUdIIFByaW9yaXR5IC0gLSAtIC0gLSAtIC0gLSAtIC0gLSAtXG4vLyAtIFNldCB1cCB3YXRjaGluZyBtb2RlXG4vLyAtIFBsYXllcnMgam9pbmluZyBzdGF0ZSAocHJlLWluaXQpXG4vLyAtIElmIG51bWJlciBvZiBzbGVlcGluZyBwZW9wbGUgY2hhbmdlLCByZS1jaGVjayByZXF1aXJlbWVudHMgZm9yIHJlc3BvbnNlKC92b3RpbmcpXG4vLyAtIFRlc3Qgd2l0aCBTYWZhcmkgYW5kIEZpcmVmb3ggYW5kIE1vYmlsZVxuXG4vLyBCdWdzOlxuLy8gLSBGaXggc3BlZWNoIHNpZ25zIGxvZ2ljXG4vLyAtIEZpeCB3YWxraW5nIGFuaW1hdGlvblxuLy8gLSBQbGF5ZXJzIGNhbiB2b3RlIGluIHJlc3BvbmQgcm91bmRcblxuLy8gTUVESVVNIFByaW9yaXR5IC0gLSAtIC0gLSAtIC0gLSAtIC0gLVxuLy8gLSBHZXQgbW9yZSBxdWVzdGlvbnMgYW5kIGZpbHRlciBvdXQgYmFkIG9uZXNcbi8vIC0gQWRkIG1vcmUgZnJhbWUgc2hhcGVzIChjaXJjbGUpXG4vLyAtIENoYW5nZSBjb2xvcnNcbi8vIC0gU21vb3RoIHRyYW5zaXRpb25zXG4vLyAtIFJlbW92ZSBnYW1lIHdoZW4gaG9zdCBsZWF2ZXMgKHNpbmNlIGdhbWUgd2lsbCBzdG9wIHJ1bm5pbmcpXG5cbi8vIEJ1Z3M6XG4vLyAtIEhhbmRsZSBzbGVlcGluZyBwbGF5ZXJzIG1vdmluZ1xuXG4vLyBMT1cgUHJpb3JpdHkgLyBJZGVhcyAtIC0gLSAtIC0gLSAtIC0gLVxuLy8gLSBHYW1lcyBpbmFjdGl2ZSBtb3JlIHRoYW4gMTJociBhcmUgcmVtb3ZlZCB3aGVuIGxvb2tlZCB1cCAoYWRkIHRpbWVzdGFtcCBnYW1lIGFjdGlvbnMpXG5cbi8vIC0gTWFrZSBiYW5uZXJzIGN1cnZlZFxuLy8gLSBBZGQgd2hpdGUgYmFja2Ryb3AgYmxvY2tzICg/KVxuLy8gLSBBbGxvdyAqZWxpbWluYXRlIHBsYXllcnMgd2hlbiBndWVzc2VkKiBzZXR0aW5nXG5cbiQoZnVuY3Rpb24oKSB7XG4gIHdpbmRvdy5hcHAgPSBuZXcgQXBwKCk7XG4gIGtvLmFwcGx5QmluZGluZ3Mod2luZG93LmFwcCk7XG59KTtcbiIsIlxudmFyIGtvID0gcmVxdWlyZSgna25vY2tvdXQnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsLmpzJyk7XG5cbihmdW5jdGlvbiAoa28pIHtcbiAgLy8gQ3JlYXRlcyBhbiBvYnNlcnZhYmxlIGFycmF5IGJhc2VkIG9uIGEgZmlyZWJhc2UgbG9jYXRpb24uXG4gIC8vIFN0b3JlcyB0aGUgZmlyZWJhc2UgbG9jYXRpb24gb2JqZWN0IGFzIGFuIGFycmF5IG9mIG9iamVjdHMgd2l0aCBrZXlzIGluc2lkZS5cbiAga28uZmlyZUFycmF5ID0gZnVuY3Rpb24oZmlyZWJhc2VSZWYsIG9wdFN1YnNjcmlwdGlvbikge1xuICAgIHZhciBrYSA9IGtvLm9ic2VydmFibGVBcnJheSgpO1xuXG4gICAgaWYgKG9wdFN1YnNjcmlwdGlvbikge1xuICAgICAga2Euc3Vic2NyaWJlKG9wdFN1YnNjcmlwdGlvbik7XG4gICAgfVxuXG4gICAgZmlyZWJhc2VSZWYub24oJ2NoaWxkX2FkZGVkJywgKGNoaWxkU25hcHNob3QsIHByZXZDaGlsZEtleSkgPT4ge1xuICAgICAgdmFyIGNoaWxkID0gY2hpbGRTbmFwc2hvdC52YWwoKTtcbiAgICAgIGNoaWxkLmtleSA9IGNoaWxkU25hcHNob3Qua2V5KCk7XG5cbiAgICAgIC8vIElmIG5vIHByZXZpb3VzIGNoaWxkIGlzIGdpdmVuLCBqdXN0IGFkZCBpdCB0byB0aGUgZW5kXG4gICAgICBpZiAocHJldkNoaWxkS2V5ID09PSB1bmRlZmluZWQpIGthLnB1c2goY2hpbGQpO1xuICAgICAgLy8gSWYgcHJldmlvdXMgY2hpbGQgaXMgZ2l2ZW4sIGJ1dCBudWxsLCBvcmRlcmluZyBpcyBvblxuICAgICAgLy8gYnV0IHRoaXMgaXRlbSBpcyB0aGUgZmlyc3QsIHNvIGFkZCBpdCB0byB0aGUgYmVnaW5uaW5nXG4gICAgICBlbHNlIGlmIChwcmV2Q2hpbGRLZXkgPT09IG51bGwpIGthLnVuc2hpZnQoY2hpbGQpO1xuICAgICAgLy8gT3RoZXJ3aXNlLCBmaW5kIHRoZSBjb3JyZWN0IGluZGV4IHRvIHB1dCBpdCBpblxuICAgICAgZWxzZSB7XG4gICAgICAgIHZhciBwcmV2Q2hpbGRJbmRleCA9IHV0aWwuZmluZEluZGV4KGthLnBlZWsoKSwgaXRlbSA9PiBpdGVtLmtleSA9PT0gcHJldkNoaWxkS2V5KTtcbiAgICAgICAga2Euc3BsaWNlKHByZXZDaGlsZEluZGV4ICsgMSwgMCwgY2hpbGQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgZmlyZWJhc2VSZWYub24oJ2NoaWxkX21vdmVkJywgKGNoaWxkU25hcHNob3QsIHByZXZDaGlsZEtleSkgPT4ge1xuICAgICAgdmFyIGNoaWxkID0gY2hpbGRTbmFwc2hvdC52YWwoKTtcbiAgICAgIGNoaWxkLmtleSA9IGNoaWxkU25hcHNob3Qua2V5KCk7XG5cbiAgICAgIHZhciBvbGRDaGlsZEluZGV4ID0gdXRpbC5maW5kSW5kZXgoa2EucGVlaygpLCBpdGVtID0+IGl0ZW0ua2V5ID09PSBjaGlsZC5rZXkpO1xuICAgICAgdmFyIG5ld0NoaWxkSW5kZXggPSAwO1xuXG4gICAgICBrYS5zcGxpY2Uob2xkQ2hpbGRJbmRleCwgMSk7XG5cbiAgICAgIGlmIChwcmV2Q2hpbGRLZXkgIT09IG51bGwpIHtcbiAgICAgICAgbmV3Q2hpbGRJbmRleCA9IHV0aWwuZmluZEluZGV4KGthLnBlZWsoKSwgaXRlbSA9PiBpdGVtLmtleSA9PT0gcHJldkNoaWxkS2V5KSArIDE7XG4gICAgICB9XG4gICAgICBrYS5zcGxpY2UobmV3Q2hpbGRJbmRleCwgMCwgY2hpbGQpO1xuICAgIH0pO1xuXG4gICAgZmlyZWJhc2VSZWYub24oJ2NoaWxkX3JlbW92ZWQnLCBjaGlsZFNuYXBzaG90ID0+IHtcbiAgICAgICAgdmFyIGNoaWxkSW5kZXggPSB1dGlsLmZpbmRJbmRleChrYS5wZWVrKCksIGl0ZW0gPT4ge1xuICAgICAgICAgIHJldHVybiBpdGVtLmtleSA9PT0gY2hpbGRTbmFwc2hvdC5rZXkoKTtcbiAgICAgICAgfSk7XG4gICAgICAgIGthLnNwbGljZShjaGlsZEluZGV4LCAxKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBrYTtcbiAgfTtcblxuICBrby5maXJlT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uKGZpcmViYXNlUmVmLCBvcHRTdWJzY3JpcHRpb24pIHtcbiAgICB2YXIgb2JzID0ga28ub2JzZXJ2YWJsZSgpO1xuXG4gICAgaWYgKG9wdFN1YnNjcmlwdGlvbikge1xuICAgICAgb2JzLnN1YnNjcmliZShvcHRTdWJzY3JpcHRpb24pO1xuICAgIH1cblxuICAgIGZpcmViYXNlUmVmLm9uKCd2YWx1ZScsIHNuYXBzaG90ID0+IHtcbiAgICAgIGNvbnNvbGUud2FybignZmlyZSBvYnMgdmFsdWUgY2hhbmdlJywgc25hcHNob3QudmFsKCkpO1xuICAgICAgb2JzKHNuYXBzaG90LnZhbCgpKTtcbiAgICB9KTtcblxuICAgIHJldHVybiBvYnM7XG4gIH07XG5cbiAgLy8gU3Vic2NyaXB0aW9uIGlzIG9ubHkgZ29vZCBmb3IgdGhlIGFycmF5XG4gIC8vIElnbm9yZXMgbW92ZSBldmVudHMsIGl0ZW1zIHNob3VsZCBub3QgYmUgbWFudWFsbHkgbW92ZWQuXG4gIC8vIChJdCBzaG91bGQgYmUgcG9zc2libGUgdG8gY3JlYXRlIGEgc3Vic2NyaXB0aW9uIGZ1bmN0aW9uIGZvciBpdGVtcyB0b28pXG4gIGtvLmZpcmVBcnJheU9ic2VydmFibGVzID0gZnVuY3Rpb24oZmlyZWJhc2VSZWYsIG9wdEFycmF5U3Vic2NyaXB0aW9uKSB7XG4gICAgdmFyIGthID0ga28ub2JzZXJ2YWJsZUFycmF5KCk7XG5cbiAgICBpZiAob3B0QXJyYXlTdWJzY3JpcHRpb24pIHtcbiAgICAgIGthLnN1YnNjcmliZShvcHRBcnJheVN1YnNjcmlwdGlvbik7XG4gICAgfVxuXG4gICAgZmlyZWJhc2VSZWYub24oJ2NoaWxkX2FkZGVkJywgKGNoaWxkU25hcHNob3QsIHByZXZDaGlsZEtleSkgPT4ge1xuICAgICAgdmFyIGNoaWxkID0gY2hpbGRTbmFwc2hvdC52YWwoKTtcbiAgICAgIGNoaWxkLmtleSA9IGNoaWxkU25hcHNob3Qua2V5KCk7XG4gICAgICBjaGlsZCA9IGtvLm9ic2VydmFibGUoY2hpbGQpO1xuXG4gICAgICAvLyBJZiBubyBwcmV2aW91cyBjaGlsZCBpcyBnaXZlbiwganVzdCBhZGQgaXQgdG8gdGhlIGVuZFxuICAgICAgaWYgKHByZXZDaGlsZEtleSA9PT0gdW5kZWZpbmVkKSBrYS5wdXNoKGNoaWxkKTtcbiAgICAgIC8vIElmIHByZXZpb3VzIGNoaWxkIGlzIGdpdmVuLCBidXQgbnVsbCwgb3JkZXJpbmcgaXMgb25cbiAgICAgIC8vIGJ1dCB0aGlzIGl0ZW0gaXMgdGhlIGZpcnN0LCBzbyBhZGQgaXQgdG8gdGhlIGJlZ2lubmluZ1xuICAgICAgZWxzZSBpZiAocHJldkNoaWxkS2V5ID09PSBudWxsKSBrYS51bnNoaWZ0KGNoaWxkKTtcbiAgICAgIC8vIE90aGVyd2lzZSwgZmluZCB0aGUgY29ycmVjdCBpbmRleCB0byBwdXQgaXQgaW5cbiAgICAgIGVsc2Uge1xuICAgICAgICB2YXIgcHJldkNoaWxkSW5kZXggPSB1dGlsLmZpbmRJbmRleChrYS5wZWVrKCksIGl0ZW0gPT4ge1xuICAgICAgICAgIHJldHVybiBpdGVtLnBlZWsoKS5rZXkgPT09IHByZXZDaGlsZEtleTtcbiAgICAgICAgfSk7XG4gICAgICAgIGthLnNwbGljZShwcmV2Q2hpbGRJbmRleCArIDEsIDAsIGNoaWxkKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGZpcmViYXNlUmVmLm9uKCdjaGlsZF9yZW1vdmVkJywgY2hpbGRTbmFwc2hvdCA9PiB7XG4gICAgICAgIHZhciBjaGlsZEluZGV4ID0gdXRpbC5maW5kSW5kZXgoa2EucGVlaygpLCBpdGVtID0+IHtcbiAgICAgICAgICByZXR1cm4gaXRlbS5wZWVrKCkua2V5ID09PSBjaGlsZFNuYXBzaG90LmtleSgpO1xuICAgICAgICB9KTtcbiAgICAgICAga2Euc3BsaWNlKGNoaWxkSW5kZXgsIDEpO1xuICAgIH0pO1xuXG4gICAgZmlyZWJhc2VSZWYub24oJ2NoaWxkX2NoYW5nZWQnLCAoY2hpbGRTbmFwc2hvdCwgcHJldkNoaWxkS2V5KSA9PiB7XG4gICAgICB2YXIgY2hpbGQgPSBjaGlsZFNuYXBzaG90LnZhbCgpO1xuICAgICAgY2hpbGQua2V5ID0gY2hpbGRTbmFwc2hvdC5rZXkoKTtcbiAgICAgIC8vIGNvbnNvbGUud2FybignY2hpbGQgY2hhbmdlZCcsIGNoaWxkKTtcbiAgICAgIC8vIGNvbnNvbGUud2Fybignc3RhdGUgb2YgYXJyYXkgcGxheWEnLCBrYS5wZWVrKClbMF0ucGVlaygpLm5hbWUsIGthLnBlZWsoKVsxXS5wZWVrKCkubmFtZSk7XG4gICAgICAvLyBjb25zb2xlLndhcm4oJ3N0YXRlIG9mIGFycmF5IHJhbmsnLCBrYS5wZWVrKClbMF0ucGVlaygpLnJhbmssIGthLnBlZWsoKVsxXS5wZWVrKCkucmFuayk7XG4gICAgICAvLyBjb25zb2xlLndhcm4oJ3N0YXRlIG9mIGFycmF5IGtleScsIGthLnBlZWsoKVswXS5wZWVrKCkua2V5LCBrYS5wZWVrKClbMV0ucGVlaygpLmtleSk7XG5cbiAgICAgIHZhciBjaGlsZEluZGV4ID0gdXRpbC5maW5kSW5kZXgoa2EucGVlaygpLCBpdGVtID0+IGl0ZW0ucGVlaygpLmtleSA9PT0gY2hpbGQua2V5KTtcbiAgICAgIHZhciBjaGlsZE9icyA9IGthLnBlZWsoKVtjaGlsZEluZGV4XTtcbiAgICAgIC8vIGNvbnNvbGUud2FybigncmVwbGFjaW5nIGNoaWxkIGF0JywgY2hpbGRJbmRleCk7XG4gICAgICBjaGlsZE9icyhjaGlsZCk7XG4gICAgfSk7XG5cbiAgICByZXR1cm4ga2E7XG4gIH07XG5cbiAgLy8gTmF0aGFuIEZpc2hlciBvbiBzdGFjayBvdmVyZmxvd1xuICBrby5iaW5kaW5nSGFuZGxlcnMuZW50ZXJLZXkgPSB7XG4gICAgaW5pdDogZnVuY3Rpb24gKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IsIGFsbEJpbmRpbmdzLCB2aWV3TW9kZWwpIHtcbiAgICAgIHZhciBjYWxsYmFjayA9IHZhbHVlQWNjZXNzb3IoKTtcbiAgICAgICQoZWxlbWVudCkua2V5cHJlc3MoZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgIHZhciBrZXlDb2RlID0gKGV2ZW50LndoaWNoID8gZXZlbnQud2hpY2ggOiBldmVudC5rZXlDb2RlKTtcbiAgICAgICAgaWYgKGtleUNvZGUgPT09IDEzKSB7XG4gICAgICAgICAgY2FsbGJhY2suY2FsbCh2aWV3TW9kZWwpO1xuICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH0pO1xuICAgIH1cbiAgfTtcblxufSkoa28pO1xuXG5tb2R1bGUuZXhwb3J0cyA9IGtvO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7IWZ1bmN0aW9uKG4sdCl7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIG1vZHVsZSYmbW9kdWxlLmV4cG9ydHM/bW9kdWxlLmV4cG9ydHM9dCgpOlwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZD9kZWZpbmUodCk6d2luZG93W25dPXQoKX0oXCJiYXNpY0NvbnRleHRcIixmdW5jdGlvbigpe3ZhciBuPW51bGwsdD1cIml0ZW1cIixlPVwic2VwYXJhdG9yXCIsaT1mdW5jdGlvbigpe3ZhciBuPWFyZ3VtZW50cy5sZW5ndGg8PTB8fHZvaWQgMD09PWFyZ3VtZW50c1swXT9cIlwiOmFyZ3VtZW50c1swXTtyZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIi5iYXNpY0NvbnRleHQgXCIrbil9LGw9ZnVuY3Rpb24oKXt2YXIgbj1hcmd1bWVudHMubGVuZ3RoPD0wfHx2b2lkIDA9PT1hcmd1bWVudHNbMF0/e306YXJndW1lbnRzWzBdLGk9MD09PU9iamVjdC5rZXlzKG4pLmxlbmd0aD8hMDohMTtyZXR1cm4gaT09PSEwJiYobi50eXBlPWUpLG51bGw9PW4udHlwZSYmKG4udHlwZT10KSxudWxsPT1uW1wiY2xhc3NcIl0mJihuW1wiY2xhc3NcIl09XCJcIiksbi52aXNpYmxlIT09ITEmJihuLnZpc2libGU9ITApLG51bGw9PW4uaWNvbiYmKG4uaWNvbj1udWxsKSxudWxsPT1uLnRpdGxlJiYobi50aXRsZT1cIlVuZGVmaW5lZFwiKSxuLmRpc2FibGVkIT09ITAmJihuLmRpc2FibGVkPSExKSxuLmRpc2FibGVkPT09ITAmJihuW1wiY2xhc3NcIl0rPVwiIGJhc2ljQ29udGV4dF9faXRlbS0tZGlzYWJsZWRcIiksbnVsbD09bi5mbiYmbi50eXBlIT09ZSYmbi5kaXNhYmxlZD09PSExPyhjb25zb2xlLndhcm4oXCJNaXNzaW5nIGZuIGZvciBpdGVtICdcIituLnRpdGxlK1wiJ1wiKSwhMSk6ITB9LG89ZnVuY3Rpb24obixpKXt2YXIgbz1cIlwiLHI9XCJcIjtyZXR1cm4gbChuKT09PSExP1wiXCI6bi52aXNpYmxlPT09ITE/XCJcIjoobi5udW09aSxudWxsIT09bi5pY29uJiYocj1cIjxzcGFuIGNsYXNzPSdiYXNpY0NvbnRleHRfX2ljb24gXCIrbi5pY29uK1wiJz48L3NwYW4+XCIpLG4udHlwZT09PXQ/bz1cIlxcblx0XHQgICAgICAgPHRyIGNsYXNzPSdiYXNpY0NvbnRleHRfX2l0ZW0gXCIrbltcImNsYXNzXCJdK1wiJz5cXG5cdFx0ICAgICAgICAgICA8dGQgY2xhc3M9J2Jhc2ljQ29udGV4dF9fZGF0YScgZGF0YS1udW09J1wiK24ubnVtK1wiJz5cIityK24udGl0bGUrXCI8L3RkPlxcblx0XHQgICAgICAgPC90cj5cXG5cdFx0ICAgICAgIFwiOm4udHlwZT09PWUmJihvPVwiXFxuXHRcdCAgICAgICA8dHIgY2xhc3M9J2Jhc2ljQ29udGV4dF9faXRlbSBiYXNpY0NvbnRleHRfX2l0ZW0tLXNlcGFyYXRvcic+PC90cj5cXG5cdFx0ICAgICAgIFwiKSxvKX0scj1mdW5jdGlvbihuKXt2YXIgdD1cIlwiO3JldHVybiB0Kz1cIlxcblx0ICAgICAgICA8ZGl2IGNsYXNzPSdiYXNpY0NvbnRleHRDb250YWluZXInPlxcblx0ICAgICAgICAgICAgPGRpdiBjbGFzcz0nYmFzaWNDb250ZXh0Jz5cXG5cdCAgICAgICAgICAgICAgICA8dGFibGU+XFxuXHQgICAgICAgICAgICAgICAgICAgIDx0Ym9keT5cXG5cdCAgICAgICAgXCIsbi5mb3JFYWNoKGZ1bmN0aW9uKG4sZSl7cmV0dXJuIHQrPW8obixlKX0pLHQrPVwiXFxuXHQgICAgICAgICAgICAgICAgICAgIDwvdGJvZHk+XFxuXHQgICAgICAgICAgICAgICAgPC90YWJsZT5cXG5cdCAgICAgICAgICAgIDwvZGl2Plxcblx0ICAgICAgICA8L2Rpdj5cXG5cdCAgICAgICAgXCJ9LGE9ZnVuY3Rpb24oKXt2YXIgbj1hcmd1bWVudHMubGVuZ3RoPD0wfHx2b2lkIDA9PT1hcmd1bWVudHNbMF0/e306YXJndW1lbnRzWzBdLHQ9e3g6bi5jbGllbnRYLHk6bi5jbGllbnRZfTtpZihcInRvdWNoZW5kXCI9PT1uLnR5cGUmJihudWxsPT10Lnh8fG51bGw9PXQueSkpe3ZhciBlPW4uY2hhbmdlZFRvdWNoZXM7bnVsbCE9ZSYmZS5sZW5ndGg+MCYmKHQueD1lWzBdLmNsaWVudFgsdC55PWVbMF0uY2xpZW50WSl9cmV0dXJuKG51bGw9PXQueHx8dC54PDApJiYodC54PTApLChudWxsPT10Lnl8fHQueTwwKSYmKHQueT0wKSx0fSxzPWZ1bmN0aW9uKG4sdCl7dmFyIGU9YShuKSxpPWUueCxsPWUueSxvPXt3aWR0aDp3aW5kb3cuaW5uZXJXaWR0aCxoZWlnaHQ6d2luZG93LmlubmVySGVpZ2h0fSxyPXt3aWR0aDp0Lm9mZnNldFdpZHRoLGhlaWdodDp0Lm9mZnNldEhlaWdodH07aStyLndpZHRoPm8ud2lkdGgmJihpLT1pK3Iud2lkdGgtby53aWR0aCksbCtyLmhlaWdodD5vLmhlaWdodCYmKGwtPWwrci5oZWlnaHQtby5oZWlnaHQpLHIuaGVpZ2h0Pm8uaGVpZ2h0JiYobD0wLHQuY2xhc3NMaXN0LmFkZChcImJhc2ljQ29udGV4dC0tc2Nyb2xsYWJsZVwiKSk7dmFyIHM9ZS54LWksdT1lLnktbDtyZXR1cm57eDppLHk6bCxyeDpzLHJ5OnV9fSx1PWZ1bmN0aW9uKCl7dmFyIG49YXJndW1lbnRzLmxlbmd0aDw9MHx8dm9pZCAwPT09YXJndW1lbnRzWzBdP3t9OmFyZ3VtZW50c1swXTtyZXR1cm4gbnVsbD09bi5mbj8hMTpuLnZpc2libGU9PT0hMT8hMTpuLmRpc2FibGVkPT09ITA/ITE6KGkoXCJ0ZFtkYXRhLW51bT0nXCIrbi5udW0rXCInXVwiKS5vbmNsaWNrPW4uZm4saShcInRkW2RhdGEtbnVtPSdcIituLm51bStcIiddXCIpLm9uY29udGV4dG1lbnU9bi5mbiwhMCl9LGM9ZnVuY3Rpb24odCxlLGwsbyl7dmFyIGE9cih0KTtkb2N1bWVudC5ib2R5Lmluc2VydEFkamFjZW50SFRNTChcImJlZm9yZWVuZFwiLGEpLG51bGw9PW4mJihuPWRvY3VtZW50LmJvZHkuc3R5bGUub3ZlcmZsb3csZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdz1cImhpZGRlblwiKTt2YXIgYz1pKCksZD1zKGUsYyk7cmV0dXJuIGMuc3R5bGUubGVmdD1kLngrXCJweFwiLGMuc3R5bGUudG9wPWQueStcInB4XCIsYy5zdHlsZS50cmFuc2Zvcm1PcmlnaW49ZC5yeCtcInB4IFwiK2QucnkrXCJweFwiLGMuc3R5bGUub3BhY2l0eT0xLG51bGw9PWwmJihsPWYpLGMucGFyZW50RWxlbWVudC5vbmNsaWNrPWwsYy5wYXJlbnRFbGVtZW50Lm9uY29udGV4dG1lbnU9bCx0LmZvckVhY2godSksXCJmdW5jdGlvblwiPT10eXBlb2YgZS5wcmV2ZW50RGVmYXVsdCYmZS5wcmV2ZW50RGVmYXVsdCgpLFwiZnVuY3Rpb25cIj09dHlwZW9mIGUuc3RvcFByb3BhZ2F0aW9uJiZlLnN0b3BQcm9wYWdhdGlvbigpLFwiZnVuY3Rpb25cIj09dHlwZW9mIG8mJm8oKSwhMH0sZD1mdW5jdGlvbigpe3ZhciBuPWkoKTtyZXR1cm4gbnVsbD09bnx8MD09PW4ubGVuZ3RoPyExOiEwfSxmPWZ1bmN0aW9uKCl7aWYoZCgpPT09ITEpcmV0dXJuITE7dmFyIHQ9ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIi5iYXNpY0NvbnRleHRDb250YWluZXJcIik7cmV0dXJuIHQucGFyZW50RWxlbWVudC5yZW1vdmVDaGlsZCh0KSxudWxsIT1uJiYoZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdz1uLG49bnVsbCksITB9O3JldHVybntJVEVNOnQsU0VQQVJBVE9SOmUsc2hvdzpjLHZpc2libGU6ZCxjbG9zZTpmfX0pOyIsIi8qIVxuICogS25vY2tvdXQgSmF2YVNjcmlwdCBsaWJyYXJ5IHYzLjQuMFxuICogKGMpIFN0ZXZlbiBTYW5kZXJzb24gLSBodHRwOi8va25vY2tvdXRqcy5jb20vXG4gKiBMaWNlbnNlOiBNSVQgKGh0dHA6Ly93d3cub3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwKVxuICovXG5cbihmdW5jdGlvbigpe1xudmFyIERFQlVHPXRydWU7XG4oZnVuY3Rpb24odW5kZWZpbmVkKXtcbiAgICAvLyAoMCwgZXZhbCkoJ3RoaXMnKSBpcyBhIHJvYnVzdCB3YXkgb2YgZ2V0dGluZyBhIHJlZmVyZW5jZSB0byB0aGUgZ2xvYmFsIG9iamVjdFxuICAgIC8vIEZvciBkZXRhaWxzLCBzZWUgaHR0cDovL3N0YWNrb3ZlcmZsb3cuY29tL3F1ZXN0aW9ucy8xNDExOTk4OC9yZXR1cm4tdGhpcy0wLWV2YWx0aGlzLzE0MTIwMDIzIzE0MTIwMDIzXG4gICAgdmFyIHdpbmRvdyA9IHRoaXMgfHwgKDAsIGV2YWwpKCd0aGlzJyksXG4gICAgICAgIGRvY3VtZW50ID0gd2luZG93Wydkb2N1bWVudCddLFxuICAgICAgICBuYXZpZ2F0b3IgPSB3aW5kb3dbJ25hdmlnYXRvciddLFxuICAgICAgICBqUXVlcnlJbnN0YW5jZSA9IHdpbmRvd1tcImpRdWVyeVwiXSxcbiAgICAgICAgSlNPTiA9IHdpbmRvd1tcIkpTT05cIl07XG4oZnVuY3Rpb24oZmFjdG9yeSkge1xuICAgIC8vIFN1cHBvcnQgdGhyZWUgbW9kdWxlIGxvYWRpbmcgc2NlbmFyaW9zXG4gICAgaWYgKHR5cGVvZiBkZWZpbmUgPT09ICdmdW5jdGlvbicgJiYgZGVmaW5lWydhbWQnXSkge1xuICAgICAgICAvLyBbMV0gQU1EIGFub255bW91cyBtb2R1bGVcbiAgICAgICAgZGVmaW5lKFsnZXhwb3J0cycsICdyZXF1aXJlJ10sIGZhY3RvcnkpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIGV4cG9ydHMgPT09ICdvYmplY3QnICYmIHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnKSB7XG4gICAgICAgIC8vIFsyXSBDb21tb25KUy9Ob2RlLmpzXG4gICAgICAgIGZhY3RvcnkobW9kdWxlWydleHBvcnRzJ10gfHwgZXhwb3J0cyk7ICAvLyBtb2R1bGUuZXhwb3J0cyBpcyBmb3IgTm9kZS5qc1xuICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFszXSBObyBtb2R1bGUgbG9hZGVyIChwbGFpbiA8c2NyaXB0PiB0YWcpIC0gcHV0IGRpcmVjdGx5IGluIGdsb2JhbCBuYW1lc3BhY2VcbiAgICAgICAgZmFjdG9yeSh3aW5kb3dbJ2tvJ10gPSB7fSk7XG4gICAgfVxufShmdW5jdGlvbihrb0V4cG9ydHMsIGFtZFJlcXVpcmUpe1xuLy8gSW50ZXJuYWxseSwgYWxsIEtPIG9iamVjdHMgYXJlIGF0dGFjaGVkIHRvIGtvRXhwb3J0cyAoZXZlbiB0aGUgbm9uLWV4cG9ydGVkIG9uZXMgd2hvc2UgbmFtZXMgd2lsbCBiZSBtaW5pZmllZCBieSB0aGUgY2xvc3VyZSBjb21waWxlcikuXG4vLyBJbiB0aGUgZnV0dXJlLCB0aGUgZm9sbG93aW5nIFwia29cIiB2YXJpYWJsZSBtYXkgYmUgbWFkZSBkaXN0aW5jdCBmcm9tIFwia29FeHBvcnRzXCIgc28gdGhhdCBwcml2YXRlIG9iamVjdHMgYXJlIG5vdCBleHRlcm5hbGx5IHJlYWNoYWJsZS5cbnZhciBrbyA9IHR5cGVvZiBrb0V4cG9ydHMgIT09ICd1bmRlZmluZWQnID8ga29FeHBvcnRzIDoge307XG4vLyBHb29nbGUgQ2xvc3VyZSBDb21waWxlciBoZWxwZXJzICh1c2VkIG9ubHkgdG8gbWFrZSB0aGUgbWluaWZpZWQgZmlsZSBzbWFsbGVyKVxua28uZXhwb3J0U3ltYm9sID0gZnVuY3Rpb24oa29QYXRoLCBvYmplY3QpIHtcbiAgICB2YXIgdG9rZW5zID0ga29QYXRoLnNwbGl0KFwiLlwiKTtcblxuICAgIC8vIEluIHRoZSBmdXR1cmUsIFwia29cIiBtYXkgYmVjb21lIGRpc3RpbmN0IGZyb20gXCJrb0V4cG9ydHNcIiAoc28gdGhhdCBub24tZXhwb3J0ZWQgb2JqZWN0cyBhcmUgbm90IHJlYWNoYWJsZSlcbiAgICAvLyBBdCB0aGF0IHBvaW50LCBcInRhcmdldFwiIHdvdWxkIGJlIHNldCB0bzogKHR5cGVvZiBrb0V4cG9ydHMgIT09IFwidW5kZWZpbmVkXCIgPyBrb0V4cG9ydHMgOiBrbylcbiAgICB2YXIgdGFyZ2V0ID0ga287XG5cbiAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRva2Vucy5sZW5ndGggLSAxOyBpKyspXG4gICAgICAgIHRhcmdldCA9IHRhcmdldFt0b2tlbnNbaV1dO1xuICAgIHRhcmdldFt0b2tlbnNbdG9rZW5zLmxlbmd0aCAtIDFdXSA9IG9iamVjdDtcbn07XG5rby5leHBvcnRQcm9wZXJ0eSA9IGZ1bmN0aW9uKG93bmVyLCBwdWJsaWNOYW1lLCBvYmplY3QpIHtcbiAgICBvd25lcltwdWJsaWNOYW1lXSA9IG9iamVjdDtcbn07XG5rby52ZXJzaW9uID0gXCIzLjQuMFwiO1xuXG5rby5leHBvcnRTeW1ib2woJ3ZlcnNpb24nLCBrby52ZXJzaW9uKTtcbi8vIEZvciBhbnkgb3B0aW9ucyB0aGF0IG1heSBhZmZlY3QgdmFyaW91cyBhcmVhcyBvZiBLbm9ja291dCBhbmQgYXJlbid0IGRpcmVjdGx5IGFzc29jaWF0ZWQgd2l0aCBkYXRhIGJpbmRpbmcuXG5rby5vcHRpb25zID0ge1xuICAgICdkZWZlclVwZGF0ZXMnOiBmYWxzZSxcbiAgICAndXNlT25seU5hdGl2ZUV2ZW50cyc6IGZhbHNlXG59O1xuXG4vL2tvLmV4cG9ydFN5bWJvbCgnb3B0aW9ucycsIGtvLm9wdGlvbnMpOyAgIC8vICdvcHRpb25zJyBpc24ndCBtaW5pZmllZFxua28udXRpbHMgPSAoZnVuY3Rpb24gKCkge1xuICAgIGZ1bmN0aW9uIG9iamVjdEZvckVhY2gob2JqLCBhY3Rpb24pIHtcbiAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBvYmopIHtcbiAgICAgICAgICAgIGlmIChvYmouaGFzT3duUHJvcGVydHkocHJvcCkpIHtcbiAgICAgICAgICAgICAgICBhY3Rpb24ocHJvcCwgb2JqW3Byb3BdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGV4dGVuZCh0YXJnZXQsIHNvdXJjZSkge1xuICAgICAgICBpZiAoc291cmNlKSB7XG4gICAgICAgICAgICBmb3IodmFyIHByb3AgaW4gc291cmNlKSB7XG4gICAgICAgICAgICAgICAgaWYoc291cmNlLmhhc093blByb3BlcnR5KHByb3ApKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFtwcm9wXSA9IHNvdXJjZVtwcm9wXTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRhcmdldDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBzZXRQcm90b3R5cGVPZihvYmosIHByb3RvKSB7XG4gICAgICAgIG9iai5fX3Byb3RvX18gPSBwcm90bztcbiAgICAgICAgcmV0dXJuIG9iajtcbiAgICB9XG5cbiAgICB2YXIgY2FuU2V0UHJvdG90eXBlID0gKHsgX19wcm90b19fOiBbXSB9IGluc3RhbmNlb2YgQXJyYXkpO1xuICAgIHZhciBjYW5Vc2VTeW1ib2xzID0gIURFQlVHICYmIHR5cGVvZiBTeW1ib2wgPT09ICdmdW5jdGlvbic7XG5cbiAgICAvLyBSZXByZXNlbnQgdGhlIGtub3duIGV2ZW50IHR5cGVzIGluIGEgY29tcGFjdCB3YXksIHRoZW4gYXQgcnVudGltZSB0cmFuc2Zvcm0gaXQgaW50byBhIGhhc2ggd2l0aCBldmVudCBuYW1lIGFzIGtleSAoZm9yIGZhc3QgbG9va3VwKVxuICAgIHZhciBrbm93bkV2ZW50cyA9IHt9LCBrbm93bkV2ZW50VHlwZXNCeUV2ZW50TmFtZSA9IHt9O1xuICAgIHZhciBrZXlFdmVudFR5cGVOYW1lID0gKG5hdmlnYXRvciAmJiAvRmlyZWZveFxcLzIvaS50ZXN0KG5hdmlnYXRvci51c2VyQWdlbnQpKSA/ICdLZXlib2FyZEV2ZW50JyA6ICdVSUV2ZW50cyc7XG4gICAga25vd25FdmVudHNba2V5RXZlbnRUeXBlTmFtZV0gPSBbJ2tleXVwJywgJ2tleWRvd24nLCAna2V5cHJlc3MnXTtcbiAgICBrbm93bkV2ZW50c1snTW91c2VFdmVudHMnXSA9IFsnY2xpY2snLCAnZGJsY2xpY2snLCAnbW91c2Vkb3duJywgJ21vdXNldXAnLCAnbW91c2Vtb3ZlJywgJ21vdXNlb3ZlcicsICdtb3VzZW91dCcsICdtb3VzZWVudGVyJywgJ21vdXNlbGVhdmUnXTtcbiAgICBvYmplY3RGb3JFYWNoKGtub3duRXZlbnRzLCBmdW5jdGlvbihldmVudFR5cGUsIGtub3duRXZlbnRzRm9yVHlwZSkge1xuICAgICAgICBpZiAoa25vd25FdmVudHNGb3JUeXBlLmxlbmd0aCkge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGogPSBrbm93bkV2ZW50c0ZvclR5cGUubGVuZ3RoOyBpIDwgajsgaSsrKVxuICAgICAgICAgICAgICAgIGtub3duRXZlbnRUeXBlc0J5RXZlbnROYW1lW2tub3duRXZlbnRzRm9yVHlwZVtpXV0gPSBldmVudFR5cGU7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICB2YXIgZXZlbnRzVGhhdE11c3RCZVJlZ2lzdGVyZWRVc2luZ0F0dGFjaEV2ZW50ID0geyAncHJvcGVydHljaGFuZ2UnOiB0cnVlIH07IC8vIFdvcmthcm91bmQgZm9yIGFuIElFOSBpc3N1ZSAtIGh0dHBzOi8vZ2l0aHViLmNvbS9TdGV2ZVNhbmRlcnNvbi9rbm9ja291dC9pc3N1ZXMvNDA2XG5cbiAgICAvLyBEZXRlY3QgSUUgdmVyc2lvbnMgZm9yIGJ1ZyB3b3JrYXJvdW5kcyAodXNlcyBJRSBjb25kaXRpb25hbHMsIG5vdCBVQSBzdHJpbmcsIGZvciByb2J1c3RuZXNzKVxuICAgIC8vIE5vdGUgdGhhdCwgc2luY2UgSUUgMTAgZG9lcyBub3Qgc3VwcG9ydCBjb25kaXRpb25hbCBjb21tZW50cywgdGhlIGZvbGxvd2luZyBsb2dpYyBvbmx5IGRldGVjdHMgSUUgPCAxMC5cbiAgICAvLyBDdXJyZW50bHkgdGhpcyBpcyBieSBkZXNpZ24sIHNpbmNlIElFIDEwKyBiZWhhdmVzIGNvcnJlY3RseSB3aGVuIHRyZWF0ZWQgYXMgYSBzdGFuZGFyZCBicm93c2VyLlxuICAgIC8vIElmIHRoZXJlIGlzIGEgZnV0dXJlIG5lZWQgdG8gZGV0ZWN0IHNwZWNpZmljIHZlcnNpb25zIG9mIElFMTArLCB3ZSB3aWxsIGFtZW5kIHRoaXMuXG4gICAgdmFyIGllVmVyc2lvbiA9IGRvY3VtZW50ICYmIChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIHZlcnNpb24gPSAzLCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKSwgaUVsZW1zID0gZGl2LmdldEVsZW1lbnRzQnlUYWdOYW1lKCdpJyk7XG5cbiAgICAgICAgLy8gS2VlcCBjb25zdHJ1Y3RpbmcgY29uZGl0aW9uYWwgSFRNTCBibG9ja3MgdW50aWwgd2UgaGl0IG9uZSB0aGF0IHJlc29sdmVzIHRvIGFuIGVtcHR5IGZyYWdtZW50XG4gICAgICAgIHdoaWxlIChcbiAgICAgICAgICAgIGRpdi5pbm5lckhUTUwgPSAnPCEtLVtpZiBndCBJRSAnICsgKCsrdmVyc2lvbikgKyAnXT48aT48L2k+PCFbZW5kaWZdLS0+JyxcbiAgICAgICAgICAgIGlFbGVtc1swXVxuICAgICAgICApIHt9XG4gICAgICAgIHJldHVybiB2ZXJzaW9uID4gNCA/IHZlcnNpb24gOiB1bmRlZmluZWQ7XG4gICAgfSgpKTtcbiAgICB2YXIgaXNJZTYgPSBpZVZlcnNpb24gPT09IDYsXG4gICAgICAgIGlzSWU3ID0gaWVWZXJzaW9uID09PSA3O1xuXG4gICAgZnVuY3Rpb24gaXNDbGlja09uQ2hlY2thYmxlRWxlbWVudChlbGVtZW50LCBldmVudFR5cGUpIHtcbiAgICAgICAgaWYgKChrby51dGlscy50YWdOYW1lTG93ZXIoZWxlbWVudCkgIT09IFwiaW5wdXRcIikgfHwgIWVsZW1lbnQudHlwZSkgcmV0dXJuIGZhbHNlO1xuICAgICAgICBpZiAoZXZlbnRUeXBlLnRvTG93ZXJDYXNlKCkgIT0gXCJjbGlja1wiKSByZXR1cm4gZmFsc2U7XG4gICAgICAgIHZhciBpbnB1dFR5cGUgPSBlbGVtZW50LnR5cGU7XG4gICAgICAgIHJldHVybiAoaW5wdXRUeXBlID09IFwiY2hlY2tib3hcIikgfHwgKGlucHV0VHlwZSA9PSBcInJhZGlvXCIpO1xuICAgIH1cblxuICAgIC8vIEZvciBkZXRhaWxzIG9uIHRoZSBwYXR0ZXJuIGZvciBjaGFuZ2luZyBub2RlIGNsYXNzZXNcbiAgICAvLyBzZWU6IGh0dHBzOi8vZ2l0aHViLmNvbS9rbm9ja291dC9rbm9ja291dC9pc3N1ZXMvMTU5N1xuICAgIHZhciBjc3NDbGFzc05hbWVSZWdleCA9IC9cXFMrL2c7XG5cbiAgICBmdW5jdGlvbiB0b2dnbGVEb21Ob2RlQ3NzQ2xhc3Mobm9kZSwgY2xhc3NOYW1lcywgc2hvdWxkSGF2ZUNsYXNzKSB7XG4gICAgICAgIHZhciBhZGRPclJlbW92ZUZuO1xuICAgICAgICBpZiAoY2xhc3NOYW1lcykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBub2RlLmNsYXNzTGlzdCA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAgICAgICBhZGRPclJlbW92ZUZuID0gbm9kZS5jbGFzc0xpc3Rbc2hvdWxkSGF2ZUNsYXNzID8gJ2FkZCcgOiAncmVtb3ZlJ107XG4gICAgICAgICAgICAgICAga28udXRpbHMuYXJyYXlGb3JFYWNoKGNsYXNzTmFtZXMubWF0Y2goY3NzQ2xhc3NOYW1lUmVnZXgpLCBmdW5jdGlvbihjbGFzc05hbWUpIHtcbiAgICAgICAgICAgICAgICAgICAgYWRkT3JSZW1vdmVGbi5jYWxsKG5vZGUuY2xhc3NMaXN0LCBjbGFzc05hbWUpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2Ygbm9kZS5jbGFzc05hbWVbJ2Jhc2VWYWwnXSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAvLyBTVkcgdGFnIC5jbGFzc05hbWVzIGlzIGFuIFNWR0FuaW1hdGVkU3RyaW5nIGluc3RhbmNlXG4gICAgICAgICAgICAgICAgdG9nZ2xlT2JqZWN0Q2xhc3NQcm9wZXJ0eVN0cmluZyhub2RlLmNsYXNzTmFtZSwgJ2Jhc2VWYWwnLCBjbGFzc05hbWVzLCBzaG91bGRIYXZlQ2xhc3MpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBub2RlLmNsYXNzTmFtZSBvdWdodCB0byBiZSBhIHN0cmluZy5cbiAgICAgICAgICAgICAgICB0b2dnbGVPYmplY3RDbGFzc1Byb3BlcnR5U3RyaW5nKG5vZGUsICdjbGFzc05hbWUnLCBjbGFzc05hbWVzLCBzaG91bGRIYXZlQ2xhc3MpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gdG9nZ2xlT2JqZWN0Q2xhc3NQcm9wZXJ0eVN0cmluZyhvYmosIHByb3AsIGNsYXNzTmFtZXMsIHNob3VsZEhhdmVDbGFzcykge1xuICAgICAgICAvLyBvYmovcHJvcCBpcyBlaXRoZXIgYSBub2RlLydjbGFzc05hbWUnIG9yIGEgU1ZHQW5pbWF0ZWRTdHJpbmcvJ2Jhc2VWYWwnLlxuICAgICAgICB2YXIgY3VycmVudENsYXNzTmFtZXMgPSBvYmpbcHJvcF0ubWF0Y2goY3NzQ2xhc3NOYW1lUmVnZXgpIHx8IFtdO1xuICAgICAgICBrby51dGlscy5hcnJheUZvckVhY2goY2xhc3NOYW1lcy5tYXRjaChjc3NDbGFzc05hbWVSZWdleCksIGZ1bmN0aW9uKGNsYXNzTmFtZSkge1xuICAgICAgICAgICAga28udXRpbHMuYWRkT3JSZW1vdmVJdGVtKGN1cnJlbnRDbGFzc05hbWVzLCBjbGFzc05hbWUsIHNob3VsZEhhdmVDbGFzcyk7XG4gICAgICAgIH0pO1xuICAgICAgICBvYmpbcHJvcF0gPSBjdXJyZW50Q2xhc3NOYW1lcy5qb2luKFwiIFwiKTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBmaWVsZHNJbmNsdWRlZFdpdGhKc29uUG9zdDogWydhdXRoZW50aWNpdHlfdG9rZW4nLCAvXl9fUmVxdWVzdFZlcmlmaWNhdGlvblRva2VuKF8uKik/JC9dLFxuXG4gICAgICAgIGFycmF5Rm9yRWFjaDogZnVuY3Rpb24gKGFycmF5LCBhY3Rpb24pIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBqID0gYXJyYXkubGVuZ3RoOyBpIDwgajsgaSsrKVxuICAgICAgICAgICAgICAgIGFjdGlvbihhcnJheVtpXSwgaSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXJyYXlJbmRleE9mOiBmdW5jdGlvbiAoYXJyYXksIGl0ZW0pIHtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgQXJyYXkucHJvdG90eXBlLmluZGV4T2YgPT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgICAgICAgIHJldHVybiBBcnJheS5wcm90b3R5cGUuaW5kZXhPZi5jYWxsKGFycmF5LCBpdGVtKTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBqID0gYXJyYXkubGVuZ3RoOyBpIDwgajsgaSsrKVxuICAgICAgICAgICAgICAgIGlmIChhcnJheVtpXSA9PT0gaXRlbSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGk7XG4gICAgICAgICAgICByZXR1cm4gLTE7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXJyYXlGaXJzdDogZnVuY3Rpb24gKGFycmF5LCBwcmVkaWNhdGUsIHByZWRpY2F0ZU93bmVyKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgaiA9IGFycmF5Lmxlbmd0aDsgaSA8IGo7IGkrKylcbiAgICAgICAgICAgICAgICBpZiAocHJlZGljYXRlLmNhbGwocHJlZGljYXRlT3duZXIsIGFycmF5W2ldLCBpKSlcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGFycmF5W2ldO1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXJyYXlSZW1vdmVJdGVtOiBmdW5jdGlvbiAoYXJyYXksIGl0ZW1Ub1JlbW92ZSkge1xuICAgICAgICAgICAgdmFyIGluZGV4ID0ga28udXRpbHMuYXJyYXlJbmRleE9mKGFycmF5LCBpdGVtVG9SZW1vdmUpO1xuICAgICAgICAgICAgaWYgKGluZGV4ID4gMCkge1xuICAgICAgICAgICAgICAgIGFycmF5LnNwbGljZShpbmRleCwgMSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBlbHNlIGlmIChpbmRleCA9PT0gMCkge1xuICAgICAgICAgICAgICAgIGFycmF5LnNoaWZ0KCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgYXJyYXlHZXREaXN0aW5jdFZhbHVlczogZnVuY3Rpb24gKGFycmF5KSB7XG4gICAgICAgICAgICBhcnJheSA9IGFycmF5IHx8IFtdO1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGogPSBhcnJheS5sZW5ndGg7IGkgPCBqOyBpKyspIHtcbiAgICAgICAgICAgICAgICBpZiAoa28udXRpbHMuYXJyYXlJbmRleE9mKHJlc3VsdCwgYXJyYXlbaV0pIDwgMClcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goYXJyYXlbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSxcblxuICAgICAgICBhcnJheU1hcDogZnVuY3Rpb24gKGFycmF5LCBtYXBwaW5nKSB7XG4gICAgICAgICAgICBhcnJheSA9IGFycmF5IHx8IFtdO1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGogPSBhcnJheS5sZW5ndGg7IGkgPCBqOyBpKyspXG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2gobWFwcGluZyhhcnJheVtpXSwgaSkpO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSxcblxuICAgICAgICBhcnJheUZpbHRlcjogZnVuY3Rpb24gKGFycmF5LCBwcmVkaWNhdGUpIHtcbiAgICAgICAgICAgIGFycmF5ID0gYXJyYXkgfHwgW107XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgaiA9IGFycmF5Lmxlbmd0aDsgaSA8IGo7IGkrKylcbiAgICAgICAgICAgICAgICBpZiAocHJlZGljYXRlKGFycmF5W2ldLCBpKSlcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goYXJyYXlbaV0pO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSxcblxuICAgICAgICBhcnJheVB1c2hBbGw6IGZ1bmN0aW9uIChhcnJheSwgdmFsdWVzVG9QdXNoKSB7XG4gICAgICAgICAgICBpZiAodmFsdWVzVG9QdXNoIGluc3RhbmNlb2YgQXJyYXkpXG4gICAgICAgICAgICAgICAgYXJyYXkucHVzaC5hcHBseShhcnJheSwgdmFsdWVzVG9QdXNoKTtcbiAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgaiA9IHZhbHVlc1RvUHVzaC5sZW5ndGg7IGkgPCBqOyBpKyspXG4gICAgICAgICAgICAgICAgICAgIGFycmF5LnB1c2godmFsdWVzVG9QdXNoW2ldKTtcbiAgICAgICAgICAgIHJldHVybiBhcnJheTtcbiAgICAgICAgfSxcblxuICAgICAgICBhZGRPclJlbW92ZUl0ZW06IGZ1bmN0aW9uKGFycmF5LCB2YWx1ZSwgaW5jbHVkZWQpIHtcbiAgICAgICAgICAgIHZhciBleGlzdGluZ0VudHJ5SW5kZXggPSBrby51dGlscy5hcnJheUluZGV4T2Yoa28udXRpbHMucGVla09ic2VydmFibGUoYXJyYXkpLCB2YWx1ZSk7XG4gICAgICAgICAgICBpZiAoZXhpc3RpbmdFbnRyeUluZGV4IDwgMCkge1xuICAgICAgICAgICAgICAgIGlmIChpbmNsdWRlZClcbiAgICAgICAgICAgICAgICAgICAgYXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGlmICghaW5jbHVkZWQpXG4gICAgICAgICAgICAgICAgICAgIGFycmF5LnNwbGljZShleGlzdGluZ0VudHJ5SW5kZXgsIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGNhblNldFByb3RvdHlwZTogY2FuU2V0UHJvdG90eXBlLFxuXG4gICAgICAgIGV4dGVuZDogZXh0ZW5kLFxuXG4gICAgICAgIHNldFByb3RvdHlwZU9mOiBzZXRQcm90b3R5cGVPZixcblxuICAgICAgICBzZXRQcm90b3R5cGVPZk9yRXh0ZW5kOiBjYW5TZXRQcm90b3R5cGUgPyBzZXRQcm90b3R5cGVPZiA6IGV4dGVuZCxcblxuICAgICAgICBvYmplY3RGb3JFYWNoOiBvYmplY3RGb3JFYWNoLFxuXG4gICAgICAgIG9iamVjdE1hcDogZnVuY3Rpb24oc291cmNlLCBtYXBwaW5nKSB7XG4gICAgICAgICAgICBpZiAoIXNvdXJjZSlcbiAgICAgICAgICAgICAgICByZXR1cm4gc291cmNlO1xuICAgICAgICAgICAgdmFyIHRhcmdldCA9IHt9O1xuICAgICAgICAgICAgZm9yICh2YXIgcHJvcCBpbiBzb3VyY2UpIHtcbiAgICAgICAgICAgICAgICBpZiAoc291cmNlLmhhc093blByb3BlcnR5KHByb3ApKSB7XG4gICAgICAgICAgICAgICAgICAgIHRhcmdldFtwcm9wXSA9IG1hcHBpbmcoc291cmNlW3Byb3BdLCBwcm9wLCBzb3VyY2UpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0YXJnZXQ7XG4gICAgICAgIH0sXG5cbiAgICAgICAgZW1wdHlEb21Ob2RlOiBmdW5jdGlvbiAoZG9tTm9kZSkge1xuICAgICAgICAgICAgd2hpbGUgKGRvbU5vZGUuZmlyc3RDaGlsZCkge1xuICAgICAgICAgICAgICAgIGtvLnJlbW92ZU5vZGUoZG9tTm9kZS5maXJzdENoaWxkKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBtb3ZlQ2xlYW5lZE5vZGVzVG9Db250YWluZXJFbGVtZW50OiBmdW5jdGlvbihub2Rlcykge1xuICAgICAgICAgICAgLy8gRW5zdXJlIGl0J3MgYSByZWFsIGFycmF5LCBhcyB3ZSdyZSBhYm91dCB0byByZXBhcmVudCB0aGUgbm9kZXMgYW5kXG4gICAgICAgICAgICAvLyB3ZSBkb24ndCB3YW50IHRoZSB1bmRlcmx5aW5nIGNvbGxlY3Rpb24gdG8gY2hhbmdlIHdoaWxlIHdlJ3JlIGRvaW5nIHRoYXQuXG4gICAgICAgICAgICB2YXIgbm9kZXNBcnJheSA9IGtvLnV0aWxzLm1ha2VBcnJheShub2Rlcyk7XG4gICAgICAgICAgICB2YXIgdGVtcGxhdGVEb2N1bWVudCA9IChub2Rlc0FycmF5WzBdICYmIG5vZGVzQXJyYXlbMF0ub3duZXJEb2N1bWVudCkgfHwgZG9jdW1lbnQ7XG5cbiAgICAgICAgICAgIHZhciBjb250YWluZXIgPSB0ZW1wbGF0ZURvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGogPSBub2Rlc0FycmF5Lmxlbmd0aDsgaSA8IGo7IGkrKykge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5hcHBlbmRDaGlsZChrby5jbGVhbk5vZGUobm9kZXNBcnJheVtpXSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbnRhaW5lcjtcbiAgICAgICAgfSxcblxuICAgICAgICBjbG9uZU5vZGVzOiBmdW5jdGlvbiAobm9kZXNBcnJheSwgc2hvdWxkQ2xlYW5Ob2Rlcykge1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGogPSBub2Rlc0FycmF5Lmxlbmd0aCwgbmV3Tm9kZXNBcnJheSA9IFtdOyBpIDwgajsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIGNsb25lZE5vZGUgPSBub2Rlc0FycmF5W2ldLmNsb25lTm9kZSh0cnVlKTtcbiAgICAgICAgICAgICAgICBuZXdOb2Rlc0FycmF5LnB1c2goc2hvdWxkQ2xlYW5Ob2RlcyA/IGtvLmNsZWFuTm9kZShjbG9uZWROb2RlKSA6IGNsb25lZE5vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG5ld05vZGVzQXJyYXk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0RG9tTm9kZUNoaWxkcmVuOiBmdW5jdGlvbiAoZG9tTm9kZSwgY2hpbGROb2Rlcykge1xuICAgICAgICAgICAga28udXRpbHMuZW1wdHlEb21Ob2RlKGRvbU5vZGUpO1xuICAgICAgICAgICAgaWYgKGNoaWxkTm9kZXMpIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgaiA9IGNoaWxkTm9kZXMubGVuZ3RoOyBpIDwgajsgaSsrKVxuICAgICAgICAgICAgICAgICAgICBkb21Ob2RlLmFwcGVuZENoaWxkKGNoaWxkTm9kZXNbaV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHJlcGxhY2VEb21Ob2RlczogZnVuY3Rpb24gKG5vZGVUb1JlcGxhY2VPck5vZGVBcnJheSwgbmV3Tm9kZXNBcnJheSkge1xuICAgICAgICAgICAgdmFyIG5vZGVzVG9SZXBsYWNlQXJyYXkgPSBub2RlVG9SZXBsYWNlT3JOb2RlQXJyYXkubm9kZVR5cGUgPyBbbm9kZVRvUmVwbGFjZU9yTm9kZUFycmF5XSA6IG5vZGVUb1JlcGxhY2VPck5vZGVBcnJheTtcbiAgICAgICAgICAgIGlmIChub2Rlc1RvUmVwbGFjZUFycmF5Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgICAgICB2YXIgaW5zZXJ0aW9uUG9pbnQgPSBub2Rlc1RvUmVwbGFjZUFycmF5WzBdO1xuICAgICAgICAgICAgICAgIHZhciBwYXJlbnQgPSBpbnNlcnRpb25Qb2ludC5wYXJlbnROb2RlO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBqID0gbmV3Tm9kZXNBcnJheS5sZW5ndGg7IGkgPCBqOyBpKyspXG4gICAgICAgICAgICAgICAgICAgIHBhcmVudC5pbnNlcnRCZWZvcmUobmV3Tm9kZXNBcnJheVtpXSwgaW5zZXJ0aW9uUG9pbnQpO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBqID0gbm9kZXNUb1JlcGxhY2VBcnJheS5sZW5ndGg7IGkgPCBqOyBpKyspIHtcbiAgICAgICAgICAgICAgICAgICAga28ucmVtb3ZlTm9kZShub2Rlc1RvUmVwbGFjZUFycmF5W2ldKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgZml4VXBDb250aW51b3VzTm9kZUFycmF5OiBmdW5jdGlvbihjb250aW51b3VzTm9kZUFycmF5LCBwYXJlbnROb2RlKSB7XG4gICAgICAgICAgICAvLyBCZWZvcmUgYWN0aW5nIG9uIGEgc2V0IG9mIG5vZGVzIHRoYXQgd2VyZSBwcmV2aW91c2x5IG91dHB1dHRlZCBieSBhIHRlbXBsYXRlIGZ1bmN0aW9uLCB3ZSBoYXZlIHRvIHJlY29uY2lsZVxuICAgICAgICAgICAgLy8gdGhlbSBhZ2FpbnN0IHdoYXQgaXMgaW4gdGhlIERPTSByaWdodCBub3cuIEl0IG1heSBiZSB0aGF0IHNvbWUgb2YgdGhlIG5vZGVzIGhhdmUgYWxyZWFkeSBiZWVuIHJlbW92ZWQsIG9yIHRoYXRcbiAgICAgICAgICAgIC8vIG5ldyBub2RlcyBtaWdodCBoYXZlIGJlZW4gaW5zZXJ0ZWQgaW4gdGhlIG1pZGRsZSwgZm9yIGV4YW1wbGUgYnkgYSBiaW5kaW5nLiBBbHNvLCB0aGVyZSBtYXkgcHJldmlvdXNseSBoYXZlIGJlZW5cbiAgICAgICAgICAgIC8vIGxlYWRpbmcgY29tbWVudCBub2RlcyAoY3JlYXRlZCBieSByZXdyaXR0ZW4gc3RyaW5nLWJhc2VkIHRlbXBsYXRlcykgdGhhdCBoYXZlIHNpbmNlIGJlZW4gcmVtb3ZlZCBkdXJpbmcgYmluZGluZy5cbiAgICAgICAgICAgIC8vIFNvLCB0aGlzIGZ1bmN0aW9uIHRyYW5zbGF0ZXMgdGhlIG9sZCBcIm1hcFwiIG91dHB1dCBhcnJheSBpbnRvIGl0cyBiZXN0IGd1ZXNzIG9mIHRoZSBzZXQgb2YgY3VycmVudCBET00gbm9kZXMuXG4gICAgICAgICAgICAvL1xuICAgICAgICAgICAgLy8gUnVsZXM6XG4gICAgICAgICAgICAvLyAgIFtBXSBBbnkgbGVhZGluZyBub2RlcyB0aGF0IGhhdmUgYmVlbiByZW1vdmVkIHNob3VsZCBiZSBpZ25vcmVkXG4gICAgICAgICAgICAvLyAgICAgICBUaGVzZSBtb3N0IGxpa2VseSBjb3JyZXNwb25kIHRvIG1lbW9pemF0aW9uIG5vZGVzIHRoYXQgd2VyZSBhbHJlYWR5IHJlbW92ZWQgZHVyaW5nIGJpbmRpbmdcbiAgICAgICAgICAgIC8vICAgICAgIFNlZSBodHRwczovL2dpdGh1Yi5jb20va25vY2tvdXQva25vY2tvdXQvcHVsbC80NDBcbiAgICAgICAgICAgIC8vICAgW0JdIEFueSB0cmFpbGluZyBub2RlcyB0aGF0IGhhdmUgYmVlbiByZW1vdmUgc2hvdWxkIGJlIGlnbm9yZWRcbiAgICAgICAgICAgIC8vICAgICAgIFRoaXMgcHJldmVudHMgdGhlIGNvZGUgaGVyZSBmcm9tIGFkZGluZyB1bnJlbGF0ZWQgbm9kZXMgdG8gdGhlIGFycmF5IHdoaWxlIHByb2Nlc3NpbmcgcnVsZSBbQ11cbiAgICAgICAgICAgIC8vICAgICAgIFNlZSBodHRwczovL2dpdGh1Yi5jb20va25vY2tvdXQva25vY2tvdXQvcHVsbC8xOTAzXG4gICAgICAgICAgICAvLyAgIFtDXSBXZSB3YW50IHRvIG91dHB1dCBhIGNvbnRpbnVvdXMgc2VyaWVzIG9mIG5vZGVzLiBTbywgaWdub3JlIGFueSBub2RlcyB0aGF0IGhhdmUgYWxyZWFkeSBiZWVuIHJlbW92ZWQsXG4gICAgICAgICAgICAvLyAgICAgICBhbmQgaW5jbHVkZSBhbnkgbm9kZXMgdGhhdCBoYXZlIGJlZW4gaW5zZXJ0ZWQgYW1vbmcgdGhlIHByZXZpb3VzIGNvbGxlY3Rpb25cblxuICAgICAgICAgICAgaWYgKGNvbnRpbnVvdXNOb2RlQXJyYXkubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIHBhcmVudCBub2RlIGNhbiBiZSBhIHZpcnR1YWwgZWxlbWVudDsgc28gZ2V0IHRoZSByZWFsIHBhcmVudCBub2RlXG4gICAgICAgICAgICAgICAgcGFyZW50Tm9kZSA9IChwYXJlbnROb2RlLm5vZGVUeXBlID09PSA4ICYmIHBhcmVudE5vZGUucGFyZW50Tm9kZSkgfHwgcGFyZW50Tm9kZTtcblxuICAgICAgICAgICAgICAgIC8vIFJ1bGUgW0FdXG4gICAgICAgICAgICAgICAgd2hpbGUgKGNvbnRpbnVvdXNOb2RlQXJyYXkubGVuZ3RoICYmIGNvbnRpbnVvdXNOb2RlQXJyYXlbMF0ucGFyZW50Tm9kZSAhPT0gcGFyZW50Tm9kZSlcbiAgICAgICAgICAgICAgICAgICAgY29udGludW91c05vZGVBcnJheS5zcGxpY2UoMCwgMSk7XG5cbiAgICAgICAgICAgICAgICAvLyBSdWxlIFtCXVxuICAgICAgICAgICAgICAgIHdoaWxlIChjb250aW51b3VzTm9kZUFycmF5Lmxlbmd0aCA+IDEgJiYgY29udGludW91c05vZGVBcnJheVtjb250aW51b3VzTm9kZUFycmF5Lmxlbmd0aCAtIDFdLnBhcmVudE5vZGUgIT09IHBhcmVudE5vZGUpXG4gICAgICAgICAgICAgICAgICAgIGNvbnRpbnVvdXNOb2RlQXJyYXkubGVuZ3RoLS07XG5cbiAgICAgICAgICAgICAgICAvLyBSdWxlIFtDXVxuICAgICAgICAgICAgICAgIGlmIChjb250aW51b3VzTm9kZUFycmF5Lmxlbmd0aCA+IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnQgPSBjb250aW51b3VzTm9kZUFycmF5WzBdLCBsYXN0ID0gY29udGludW91c05vZGVBcnJheVtjb250aW51b3VzTm9kZUFycmF5Lmxlbmd0aCAtIDFdO1xuICAgICAgICAgICAgICAgICAgICAvLyBSZXBsYWNlIHdpdGggdGhlIGFjdHVhbCBuZXcgY29udGludW91cyBub2RlIHNldFxuICAgICAgICAgICAgICAgICAgICBjb250aW51b3VzTm9kZUFycmF5Lmxlbmd0aCA9IDA7XG4gICAgICAgICAgICAgICAgICAgIHdoaWxlIChjdXJyZW50ICE9PSBsYXN0KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51b3VzTm9kZUFycmF5LnB1c2goY3VycmVudCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjdXJyZW50ID0gY3VycmVudC5uZXh0U2libGluZztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjb250aW51b3VzTm9kZUFycmF5LnB1c2gobGFzdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNvbnRpbnVvdXNOb2RlQXJyYXk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc2V0T3B0aW9uTm9kZVNlbGVjdGlvblN0YXRlOiBmdW5jdGlvbiAob3B0aW9uTm9kZSwgaXNTZWxlY3RlZCkge1xuICAgICAgICAgICAgLy8gSUU2IHNvbWV0aW1lcyB0aHJvd3MgXCJ1bmtub3duIGVycm9yXCIgaWYgeW91IHRyeSB0byB3cml0ZSB0byAuc2VsZWN0ZWQgZGlyZWN0bHksIHdoZXJlYXMgRmlyZWZveCBzdHJ1Z2dsZXMgd2l0aCBzZXRBdHRyaWJ1dGUuIFBpY2sgb25lIGJhc2VkIG9uIGJyb3dzZXIuXG4gICAgICAgICAgICBpZiAoaWVWZXJzaW9uIDwgNylcbiAgICAgICAgICAgICAgICBvcHRpb25Ob2RlLnNldEF0dHJpYnV0ZShcInNlbGVjdGVkXCIsIGlzU2VsZWN0ZWQpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIG9wdGlvbk5vZGUuc2VsZWN0ZWQgPSBpc1NlbGVjdGVkO1xuICAgICAgICB9LFxuXG4gICAgICAgIHN0cmluZ1RyaW06IGZ1bmN0aW9uIChzdHJpbmcpIHtcbiAgICAgICAgICAgIHJldHVybiBzdHJpbmcgPT09IG51bGwgfHwgc3RyaW5nID09PSB1bmRlZmluZWQgPyAnJyA6XG4gICAgICAgICAgICAgICAgc3RyaW5nLnRyaW0gP1xuICAgICAgICAgICAgICAgICAgICBzdHJpbmcudHJpbSgpIDpcbiAgICAgICAgICAgICAgICAgICAgc3RyaW5nLnRvU3RyaW5nKCkucmVwbGFjZSgvXltcXHNcXHhhMF0rfFtcXHNcXHhhMF0rJC9nLCAnJyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc3RyaW5nU3RhcnRzV2l0aDogZnVuY3Rpb24gKHN0cmluZywgc3RhcnRzV2l0aCkge1xuICAgICAgICAgICAgc3RyaW5nID0gc3RyaW5nIHx8IFwiXCI7XG4gICAgICAgICAgICBpZiAoc3RhcnRzV2l0aC5sZW5ndGggPiBzdHJpbmcubGVuZ3RoKVxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgICAgIHJldHVybiBzdHJpbmcuc3Vic3RyaW5nKDAsIHN0YXJ0c1dpdGgubGVuZ3RoKSA9PT0gc3RhcnRzV2l0aDtcbiAgICAgICAgfSxcblxuICAgICAgICBkb21Ob2RlSXNDb250YWluZWRCeTogZnVuY3Rpb24gKG5vZGUsIGNvbnRhaW5lZEJ5Tm9kZSkge1xuICAgICAgICAgICAgaWYgKG5vZGUgPT09IGNvbnRhaW5lZEJ5Tm9kZSlcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSAxMSlcbiAgICAgICAgICAgICAgICByZXR1cm4gZmFsc2U7IC8vIEZpeGVzIGlzc3VlICMxMTYyIC0gY2FuJ3QgdXNlIG5vZGUuY29udGFpbnMgZm9yIGRvY3VtZW50IGZyYWdtZW50cyBvbiBJRThcbiAgICAgICAgICAgIGlmIChjb250YWluZWRCeU5vZGUuY29udGFpbnMpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnRhaW5lZEJ5Tm9kZS5jb250YWlucyhub2RlLm5vZGVUeXBlID09PSAzID8gbm9kZS5wYXJlbnROb2RlIDogbm9kZSk7XG4gICAgICAgICAgICBpZiAoY29udGFpbmVkQnlOb2RlLmNvbXBhcmVEb2N1bWVudFBvc2l0aW9uKVxuICAgICAgICAgICAgICAgIHJldHVybiAoY29udGFpbmVkQnlOb2RlLmNvbXBhcmVEb2N1bWVudFBvc2l0aW9uKG5vZGUpICYgMTYpID09IDE2O1xuICAgICAgICAgICAgd2hpbGUgKG5vZGUgJiYgbm9kZSAhPSBjb250YWluZWRCeU5vZGUpIHtcbiAgICAgICAgICAgICAgICBub2RlID0gbm9kZS5wYXJlbnROb2RlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuICEhbm9kZTtcbiAgICAgICAgfSxcblxuICAgICAgICBkb21Ob2RlSXNBdHRhY2hlZFRvRG9jdW1lbnQ6IGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICAgICAgICByZXR1cm4ga28udXRpbHMuZG9tTm9kZUlzQ29udGFpbmVkQnkobm9kZSwgbm9kZS5vd25lckRvY3VtZW50LmRvY3VtZW50RWxlbWVudCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgYW55RG9tTm9kZUlzQXR0YWNoZWRUb0RvY3VtZW50OiBmdW5jdGlvbihub2Rlcykge1xuICAgICAgICAgICAgcmV0dXJuICEha28udXRpbHMuYXJyYXlGaXJzdChub2Rlcywga28udXRpbHMuZG9tTm9kZUlzQXR0YWNoZWRUb0RvY3VtZW50KTtcbiAgICAgICAgfSxcblxuICAgICAgICB0YWdOYW1lTG93ZXI6IGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIC8vIEZvciBIVE1MIGVsZW1lbnRzLCB0YWdOYW1lIHdpbGwgYWx3YXlzIGJlIHVwcGVyIGNhc2U7IGZvciBYSFRNTCBlbGVtZW50cywgaXQnbGwgYmUgbG93ZXIgY2FzZS5cbiAgICAgICAgICAgIC8vIFBvc3NpYmxlIGZ1dHVyZSBvcHRpbWl6YXRpb246IElmIHdlIGtub3cgaXQncyBhbiBlbGVtZW50IGZyb20gYW4gWEhUTUwgZG9jdW1lbnQgKG5vdCBIVE1MKSxcbiAgICAgICAgICAgIC8vIHdlIGRvbid0IG5lZWQgdG8gZG8gdGhlIC50b0xvd2VyQ2FzZSgpIGFzIGl0IHdpbGwgYWx3YXlzIGJlIGxvd2VyIGNhc2UgYW55d2F5LlxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQgJiYgZWxlbWVudC50YWdOYW1lICYmIGVsZW1lbnQudGFnTmFtZS50b0xvd2VyQ2FzZSgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGNhdGNoRnVuY3Rpb25FcnJvcnM6IGZ1bmN0aW9uIChkZWxlZ2F0ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGtvWydvbkVycm9yJ10gPyBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGRlbGVnYXRlLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgICAgICAgICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICAgICAgICAgICAgICBrb1snb25FcnJvciddICYmIGtvWydvbkVycm9yJ10oZSk7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IGU7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSA6IGRlbGVnYXRlO1xuICAgICAgICB9LFxuXG4gICAgICAgIHNldFRpbWVvdXQ6IGZ1bmN0aW9uIChoYW5kbGVyLCB0aW1lb3V0KSB7XG4gICAgICAgICAgICByZXR1cm4gc2V0VGltZW91dChrby51dGlscy5jYXRjaEZ1bmN0aW9uRXJyb3JzKGhhbmRsZXIpLCB0aW1lb3V0KTtcbiAgICAgICAgfSxcblxuICAgICAgICBkZWZlckVycm9yOiBmdW5jdGlvbiAoZXJyb3IpIHtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIGtvWydvbkVycm9yJ10gJiYga29bJ29uRXJyb3InXShlcnJvcik7XG4gICAgICAgICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgICAgICB9LCAwKTtcbiAgICAgICAgfSxcblxuICAgICAgICByZWdpc3RlckV2ZW50SGFuZGxlcjogZnVuY3Rpb24gKGVsZW1lbnQsIGV2ZW50VHlwZSwgaGFuZGxlcikge1xuICAgICAgICAgICAgdmFyIHdyYXBwZWRIYW5kbGVyID0ga28udXRpbHMuY2F0Y2hGdW5jdGlvbkVycm9ycyhoYW5kbGVyKTtcblxuICAgICAgICAgICAgdmFyIG11c3RVc2VBdHRhY2hFdmVudCA9IGllVmVyc2lvbiAmJiBldmVudHNUaGF0TXVzdEJlUmVnaXN0ZXJlZFVzaW5nQXR0YWNoRXZlbnRbZXZlbnRUeXBlXTtcbiAgICAgICAgICAgIGlmICgha28ub3B0aW9uc1sndXNlT25seU5hdGl2ZUV2ZW50cyddICYmICFtdXN0VXNlQXR0YWNoRXZlbnQgJiYgalF1ZXJ5SW5zdGFuY2UpIHtcbiAgICAgICAgICAgICAgICBqUXVlcnlJbnN0YW5jZShlbGVtZW50KVsnYmluZCddKGV2ZW50VHlwZSwgd3JhcHBlZEhhbmRsZXIpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICghbXVzdFVzZUF0dGFjaEV2ZW50ICYmIHR5cGVvZiBlbGVtZW50LmFkZEV2ZW50TGlzdGVuZXIgPT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgICAgICAgIGVsZW1lbnQuYWRkRXZlbnRMaXN0ZW5lcihldmVudFR5cGUsIHdyYXBwZWRIYW5kbGVyLCBmYWxzZSk7XG4gICAgICAgICAgICBlbHNlIGlmICh0eXBlb2YgZWxlbWVudC5hdHRhY2hFdmVudCAhPSBcInVuZGVmaW5lZFwiKSB7XG4gICAgICAgICAgICAgICAgdmFyIGF0dGFjaEV2ZW50SGFuZGxlciA9IGZ1bmN0aW9uIChldmVudCkgeyB3cmFwcGVkSGFuZGxlci5jYWxsKGVsZW1lbnQsIGV2ZW50KTsgfSxcbiAgICAgICAgICAgICAgICAgICAgYXR0YWNoRXZlbnROYW1lID0gXCJvblwiICsgZXZlbnRUeXBlO1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuYXR0YWNoRXZlbnQoYXR0YWNoRXZlbnROYW1lLCBhdHRhY2hFdmVudEhhbmRsZXIpO1xuXG4gICAgICAgICAgICAgICAgLy8gSUUgZG9lcyBub3QgZGlzcG9zZSBhdHRhY2hFdmVudCBoYW5kbGVycyBhdXRvbWF0aWNhbGx5ICh1bmxpa2Ugd2l0aCBhZGRFdmVudExpc3RlbmVyKVxuICAgICAgICAgICAgICAgIC8vIHNvIHRvIGF2b2lkIGxlYWtzLCB3ZSBoYXZlIHRvIHJlbW92ZSB0aGVtIG1hbnVhbGx5LiBTZWUgYnVnICM4NTZcbiAgICAgICAgICAgICAgICBrby51dGlscy5kb21Ob2RlRGlzcG9zYWwuYWRkRGlzcG9zZUNhbGxiYWNrKGVsZW1lbnQsIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50LmRldGFjaEV2ZW50KGF0dGFjaEV2ZW50TmFtZSwgYXR0YWNoRXZlbnRIYW5kbGVyKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkJyb3dzZXIgZG9lc24ndCBzdXBwb3J0IGFkZEV2ZW50TGlzdGVuZXIgb3IgYXR0YWNoRXZlbnRcIik7XG4gICAgICAgIH0sXG5cbiAgICAgICAgdHJpZ2dlckV2ZW50OiBmdW5jdGlvbiAoZWxlbWVudCwgZXZlbnRUeXBlKSB7XG4gICAgICAgICAgICBpZiAoIShlbGVtZW50ICYmIGVsZW1lbnQubm9kZVR5cGUpKVxuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImVsZW1lbnQgbXVzdCBiZSBhIERPTSBub2RlIHdoZW4gY2FsbGluZyB0cmlnZ2VyRXZlbnRcIik7XG5cbiAgICAgICAgICAgIC8vIEZvciBjbGljayBldmVudHMgb24gY2hlY2tib3hlcyBhbmQgcmFkaW8gYnV0dG9ucywgalF1ZXJ5IHRvZ2dsZXMgdGhlIGVsZW1lbnQgY2hlY2tlZCBzdGF0ZSAqYWZ0ZXIqIHRoZVxuICAgICAgICAgICAgLy8gZXZlbnQgaGFuZGxlciBydW5zIGluc3RlYWQgb2YgKmJlZm9yZSouIChUaGlzIHdhcyBmaXhlZCBpbiAxLjkgZm9yIGNoZWNrYm94ZXMgYnV0IG5vdCBmb3IgcmFkaW8gYnV0dG9ucy4pXG4gICAgICAgICAgICAvLyBJRSBkb2Vzbid0IGNoYW5nZSB0aGUgY2hlY2tlZCBzdGF0ZSB3aGVuIHlvdSB0cmlnZ2VyIHRoZSBjbGljayBldmVudCB1c2luZyBcImZpcmVFdmVudFwiLlxuICAgICAgICAgICAgLy8gSW4gYm90aCBjYXNlcywgd2UnbGwgdXNlIHRoZSBjbGljayBtZXRob2QgaW5zdGVhZC5cbiAgICAgICAgICAgIHZhciB1c2VDbGlja1dvcmthcm91bmQgPSBpc0NsaWNrT25DaGVja2FibGVFbGVtZW50KGVsZW1lbnQsIGV2ZW50VHlwZSk7XG5cbiAgICAgICAgICAgIGlmICgha28ub3B0aW9uc1sndXNlT25seU5hdGl2ZUV2ZW50cyddICYmIGpRdWVyeUluc3RhbmNlICYmICF1c2VDbGlja1dvcmthcm91bmQpIHtcbiAgICAgICAgICAgICAgICBqUXVlcnlJbnN0YW5jZShlbGVtZW50KVsndHJpZ2dlciddKGV2ZW50VHlwZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkb2N1bWVudC5jcmVhdGVFdmVudCA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGVsZW1lbnQuZGlzcGF0Y2hFdmVudCA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGV2ZW50Q2F0ZWdvcnkgPSBrbm93bkV2ZW50VHlwZXNCeUV2ZW50TmFtZVtldmVudFR5cGVdIHx8IFwiSFRNTEV2ZW50c1wiO1xuICAgICAgICAgICAgICAgICAgICB2YXIgZXZlbnQgPSBkb2N1bWVudC5jcmVhdGVFdmVudChldmVudENhdGVnb3J5KTtcbiAgICAgICAgICAgICAgICAgICAgZXZlbnQuaW5pdEV2ZW50KGV2ZW50VHlwZSwgdHJ1ZSwgdHJ1ZSwgd2luZG93LCAwLCAwLCAwLCAwLCAwLCBmYWxzZSwgZmFsc2UsIGZhbHNlLCBmYWxzZSwgMCwgZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuZGlzcGF0Y2hFdmVudChldmVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHN1cHBsaWVkIGVsZW1lbnQgZG9lc24ndCBzdXBwb3J0IGRpc3BhdGNoRXZlbnRcIik7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHVzZUNsaWNrV29ya2Fyb3VuZCAmJiBlbGVtZW50LmNsaWNrKSB7XG4gICAgICAgICAgICAgICAgZWxlbWVudC5jbGljaygpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZWxlbWVudC5maXJlRXZlbnQgIT0gXCJ1bmRlZmluZWRcIikge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuZmlyZUV2ZW50KFwib25cIiArIGV2ZW50VHlwZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIkJyb3dzZXIgZG9lc24ndCBzdXBwb3J0IHRyaWdnZXJpbmcgZXZlbnRzXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHVud3JhcE9ic2VydmFibGU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGtvLmlzT2JzZXJ2YWJsZSh2YWx1ZSkgPyB2YWx1ZSgpIDogdmFsdWU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcGVla09ic2VydmFibGU6IGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGtvLmlzT2JzZXJ2YWJsZSh2YWx1ZSkgPyB2YWx1ZS5wZWVrKCkgOiB2YWx1ZTtcbiAgICAgICAgfSxcblxuICAgICAgICB0b2dnbGVEb21Ob2RlQ3NzQ2xhc3M6IHRvZ2dsZURvbU5vZGVDc3NDbGFzcyxcblxuICAgICAgICBzZXRUZXh0Q29udGVudDogZnVuY3Rpb24oZWxlbWVudCwgdGV4dENvbnRlbnQpIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZSA9IGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUodGV4dENvbnRlbnQpO1xuICAgICAgICAgICAgaWYgKCh2YWx1ZSA9PT0gbnVsbCkgfHwgKHZhbHVlID09PSB1bmRlZmluZWQpKVxuICAgICAgICAgICAgICAgIHZhbHVlID0gXCJcIjtcblxuICAgICAgICAgICAgLy8gV2UgbmVlZCB0aGVyZSB0byBiZSBleGFjdGx5IG9uZSBjaGlsZDogYSB0ZXh0IG5vZGUuXG4gICAgICAgICAgICAvLyBJZiB0aGVyZSBhcmUgbm8gY2hpbGRyZW4sIG1vcmUgdGhhbiBvbmUsIG9yIGlmIGl0J3Mgbm90IGEgdGV4dCBub2RlLFxuICAgICAgICAgICAgLy8gd2UnbGwgY2xlYXIgZXZlcnl0aGluZyBhbmQgY3JlYXRlIGEgc2luZ2xlIHRleHQgbm9kZS5cbiAgICAgICAgICAgIHZhciBpbm5lclRleHROb2RlID0ga28udmlydHVhbEVsZW1lbnRzLmZpcnN0Q2hpbGQoZWxlbWVudCk7XG4gICAgICAgICAgICBpZiAoIWlubmVyVGV4dE5vZGUgfHwgaW5uZXJUZXh0Tm9kZS5ub2RlVHlwZSAhPSAzIHx8IGtvLnZpcnR1YWxFbGVtZW50cy5uZXh0U2libGluZyhpbm5lclRleHROb2RlKSkge1xuICAgICAgICAgICAgICAgIGtvLnZpcnR1YWxFbGVtZW50cy5zZXREb21Ob2RlQ2hpbGRyZW4oZWxlbWVudCwgW2VsZW1lbnQub3duZXJEb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSh2YWx1ZSldKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgaW5uZXJUZXh0Tm9kZS5kYXRhID0gdmFsdWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGtvLnV0aWxzLmZvcmNlUmVmcmVzaChlbGVtZW50KTtcbiAgICAgICAgfSxcblxuICAgICAgICBzZXRFbGVtZW50TmFtZTogZnVuY3Rpb24oZWxlbWVudCwgbmFtZSkge1xuICAgICAgICAgICAgZWxlbWVudC5uYW1lID0gbmFtZTtcblxuICAgICAgICAgICAgLy8gV29ya2Fyb3VuZCBJRSA2LzcgaXNzdWVcbiAgICAgICAgICAgIC8vIC0gaHR0cHM6Ly9naXRodWIuY29tL1N0ZXZlU2FuZGVyc29uL2tub2Nrb3V0L2lzc3Vlcy8xOTdcbiAgICAgICAgICAgIC8vIC0gaHR0cDovL3d3dy5tYXR0czQxMS5jb20vcG9zdC9zZXR0aW5nX3RoZV9uYW1lX2F0dHJpYnV0ZV9pbl9pZV9kb20vXG4gICAgICAgICAgICBpZiAoaWVWZXJzaW9uIDw9IDcpIHtcbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICBlbGVtZW50Lm1lcmdlQXR0cmlidXRlcyhkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiPGlucHV0IG5hbWU9J1wiICsgZWxlbWVudC5uYW1lICsgXCInLz5cIiksIGZhbHNlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2goZSkge30gLy8gRm9yIElFOSB3aXRoIGRvYyBtb2RlIFwiSUU5IFN0YW5kYXJkc1wiIGFuZCBicm93c2VyIG1vZGUgXCJJRTkgQ29tcGF0aWJpbGl0eSBWaWV3XCJcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBmb3JjZVJlZnJlc2g6IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGFuIElFOSByZW5kZXJpbmcgYnVnIC0gaHR0cHM6Ly9naXRodWIuY29tL1N0ZXZlU2FuZGVyc29uL2tub2Nrb3V0L2lzc3Vlcy8yMDlcbiAgICAgICAgICAgIGlmIChpZVZlcnNpb24gPj0gOSkge1xuICAgICAgICAgICAgICAgIC8vIEZvciB0ZXh0IG5vZGVzIGFuZCBjb21tZW50IG5vZGVzIChtb3N0IGxpa2VseSB2aXJ0dWFsIGVsZW1lbnRzKSwgd2Ugd2lsbCBoYXZlIHRvIHJlZnJlc2ggdGhlIGNvbnRhaW5lclxuICAgICAgICAgICAgICAgIHZhciBlbGVtID0gbm9kZS5ub2RlVHlwZSA9PSAxID8gbm9kZSA6IG5vZGUucGFyZW50Tm9kZTtcbiAgICAgICAgICAgICAgICBpZiAoZWxlbS5zdHlsZSlcbiAgICAgICAgICAgICAgICAgICAgZWxlbS5zdHlsZS56b29tID0gZWxlbS5zdHlsZS56b29tO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGVuc3VyZVNlbGVjdEVsZW1lbnRJc1JlbmRlcmVkQ29ycmVjdGx5OiBmdW5jdGlvbihzZWxlY3RFbGVtZW50KSB7XG4gICAgICAgICAgICAvLyBXb3JrYXJvdW5kIGZvciBJRTkgcmVuZGVyaW5nIGJ1ZyAtIGl0IGRvZXNuJ3QgcmVsaWFibHkgZGlzcGxheSBhbGwgdGhlIHRleHQgaW4gZHluYW1pY2FsbHktYWRkZWQgc2VsZWN0IGJveGVzIHVubGVzcyB5b3UgZm9yY2UgaXQgdG8gcmUtcmVuZGVyIGJ5IHVwZGF0aW5nIHRoZSB3aWR0aC5cbiAgICAgICAgICAgIC8vIChTZWUgaHR0cHM6Ly9naXRodWIuY29tL1N0ZXZlU2FuZGVyc29uL2tub2Nrb3V0L2lzc3Vlcy8zMTIsIGh0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvNTkwODQ5NC9zZWxlY3Qtb25seS1zaG93cy1maXJzdC1jaGFyLW9mLXNlbGVjdGVkLW9wdGlvbilcbiAgICAgICAgICAgIC8vIEFsc28gZml4ZXMgSUU3IGFuZCBJRTggYnVnIHRoYXQgY2F1c2VzIHNlbGVjdHMgdG8gYmUgemVybyB3aWR0aCBpZiBlbmNsb3NlZCBieSAnaWYnIG9yICd3aXRoJy4gKFNlZSBpc3N1ZSAjODM5KVxuICAgICAgICAgICAgaWYgKGllVmVyc2lvbikge1xuICAgICAgICAgICAgICAgIHZhciBvcmlnaW5hbFdpZHRoID0gc2VsZWN0RWxlbWVudC5zdHlsZS53aWR0aDtcbiAgICAgICAgICAgICAgICBzZWxlY3RFbGVtZW50LnN0eWxlLndpZHRoID0gMDtcbiAgICAgICAgICAgICAgICBzZWxlY3RFbGVtZW50LnN0eWxlLndpZHRoID0gb3JpZ2luYWxXaWR0aDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICByYW5nZTogZnVuY3Rpb24gKG1pbiwgbWF4KSB7XG4gICAgICAgICAgICBtaW4gPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKG1pbik7XG4gICAgICAgICAgICBtYXggPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKG1heCk7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gW107XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gbWluOyBpIDw9IG1heDsgaSsrKVxuICAgICAgICAgICAgICAgIHJlc3VsdC5wdXNoKGkpO1xuICAgICAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICAgICAgfSxcblxuICAgICAgICBtYWtlQXJyYXk6IGZ1bmN0aW9uKGFycmF5TGlrZU9iamVjdCkge1xuICAgICAgICAgICAgdmFyIHJlc3VsdCA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGogPSBhcnJheUxpa2VPYmplY3QubGVuZ3RoOyBpIDwgajsgaSsrKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goYXJyYXlMaWtlT2JqZWN0W2ldKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9LFxuXG4gICAgICAgIGNyZWF0ZVN5bWJvbE9yU3RyaW5nOiBmdW5jdGlvbihpZGVudGlmaWVyKSB7XG4gICAgICAgICAgICByZXR1cm4gY2FuVXNlU3ltYm9scyA/IFN5bWJvbChpZGVudGlmaWVyKSA6IGlkZW50aWZpZXI7XG4gICAgICAgIH0sXG5cbiAgICAgICAgaXNJZTYgOiBpc0llNixcbiAgICAgICAgaXNJZTcgOiBpc0llNyxcbiAgICAgICAgaWVWZXJzaW9uIDogaWVWZXJzaW9uLFxuXG4gICAgICAgIGdldEZvcm1GaWVsZHM6IGZ1bmN0aW9uKGZvcm0sIGZpZWxkTmFtZSkge1xuICAgICAgICAgICAgdmFyIGZpZWxkcyA9IGtvLnV0aWxzLm1ha2VBcnJheShmb3JtLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiaW5wdXRcIikpLmNvbmNhdChrby51dGlscy5tYWtlQXJyYXkoZm9ybS5nZXRFbGVtZW50c0J5VGFnTmFtZShcInRleHRhcmVhXCIpKSk7XG4gICAgICAgICAgICB2YXIgaXNNYXRjaGluZ0ZpZWxkID0gKHR5cGVvZiBmaWVsZE5hbWUgPT0gJ3N0cmluZycpXG4gICAgICAgICAgICAgICAgPyBmdW5jdGlvbihmaWVsZCkgeyByZXR1cm4gZmllbGQubmFtZSA9PT0gZmllbGROYW1lIH1cbiAgICAgICAgICAgICAgICA6IGZ1bmN0aW9uKGZpZWxkKSB7IHJldHVybiBmaWVsZE5hbWUudGVzdChmaWVsZC5uYW1lKSB9OyAvLyBUcmVhdCBmaWVsZE5hbWUgYXMgcmVnZXggb3Igb2JqZWN0IGNvbnRhaW5pbmcgcHJlZGljYXRlXG4gICAgICAgICAgICB2YXIgbWF0Y2hlcyA9IFtdO1xuICAgICAgICAgICAgZm9yICh2YXIgaSA9IGZpZWxkcy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgICAgIGlmIChpc01hdGNoaW5nRmllbGQoZmllbGRzW2ldKSlcbiAgICAgICAgICAgICAgICAgICAgbWF0Y2hlcy5wdXNoKGZpZWxkc1tpXSk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIG1hdGNoZXM7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcGFyc2VKc29uOiBmdW5jdGlvbiAoanNvblN0cmluZykge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBqc29uU3RyaW5nID09IFwic3RyaW5nXCIpIHtcbiAgICAgICAgICAgICAgICBqc29uU3RyaW5nID0ga28udXRpbHMuc3RyaW5nVHJpbShqc29uU3RyaW5nKTtcbiAgICAgICAgICAgICAgICBpZiAoanNvblN0cmluZykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoSlNPTiAmJiBKU09OLnBhcnNlKSAvLyBVc2UgbmF0aXZlIHBhcnNpbmcgd2hlcmUgYXZhaWxhYmxlXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gSlNPTi5wYXJzZShqc29uU3RyaW5nKTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIChuZXcgRnVuY3Rpb24oXCJyZXR1cm4gXCIgKyBqc29uU3RyaW5nKSkoKTsgLy8gRmFsbGJhY2sgb24gbGVzcyBzYWZlIHBhcnNpbmcgZm9yIG9sZGVyIGJyb3dzZXJzXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgc3RyaW5naWZ5SnNvbjogZnVuY3Rpb24gKGRhdGEsIHJlcGxhY2VyLCBzcGFjZSkgeyAgIC8vIHJlcGxhY2VyIGFuZCBzcGFjZSBhcmUgb3B0aW9uYWxcbiAgICAgICAgICAgIGlmICghSlNPTiB8fCAhSlNPTi5zdHJpbmdpZnkpXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgSlNPTi5zdHJpbmdpZnkoKS4gU29tZSBicm93c2VycyAoZS5nLiwgSUUgPCA4KSBkb24ndCBzdXBwb3J0IGl0IG5hdGl2ZWx5LCBidXQgeW91IGNhbiBvdmVyY29tZSB0aGlzIGJ5IGFkZGluZyBhIHNjcmlwdCByZWZlcmVuY2UgdG8ganNvbjIuanMsIGRvd25sb2FkYWJsZSBmcm9tIGh0dHA6Ly93d3cuanNvbi5vcmcvanNvbjIuanNcIik7XG4gICAgICAgICAgICByZXR1cm4gSlNPTi5zdHJpbmdpZnkoa28udXRpbHMudW53cmFwT2JzZXJ2YWJsZShkYXRhKSwgcmVwbGFjZXIsIHNwYWNlKTtcbiAgICAgICAgfSxcblxuICAgICAgICBwb3N0SnNvbjogZnVuY3Rpb24gKHVybE9yRm9ybSwgZGF0YSwgb3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICB2YXIgcGFyYW1zID0gb3B0aW9uc1sncGFyYW1zJ10gfHwge307XG4gICAgICAgICAgICB2YXIgaW5jbHVkZUZpZWxkcyA9IG9wdGlvbnNbJ2luY2x1ZGVGaWVsZHMnXSB8fCB0aGlzLmZpZWxkc0luY2x1ZGVkV2l0aEpzb25Qb3N0O1xuICAgICAgICAgICAgdmFyIHVybCA9IHVybE9yRm9ybTtcblxuICAgICAgICAgICAgLy8gSWYgd2Ugd2VyZSBnaXZlbiBhIGZvcm0sIHVzZSBpdHMgJ2FjdGlvbicgVVJMIGFuZCBwaWNrIG91dCBhbnkgcmVxdWVzdGVkIGZpZWxkIHZhbHVlc1xuICAgICAgICAgICAgaWYoKHR5cGVvZiB1cmxPckZvcm0gPT0gJ29iamVjdCcpICYmIChrby51dGlscy50YWdOYW1lTG93ZXIodXJsT3JGb3JtKSA9PT0gXCJmb3JtXCIpKSB7XG4gICAgICAgICAgICAgICAgdmFyIG9yaWdpbmFsRm9ybSA9IHVybE9yRm9ybTtcbiAgICAgICAgICAgICAgICB1cmwgPSBvcmlnaW5hbEZvcm0uYWN0aW9uO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSBpbmNsdWRlRmllbGRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBmaWVsZHMgPSBrby51dGlscy5nZXRGb3JtRmllbGRzKG9yaWdpbmFsRm9ybSwgaW5jbHVkZUZpZWxkc1tpXSk7XG4gICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGogPSBmaWVsZHMubGVuZ3RoIC0gMTsgaiA+PSAwOyBqLS0pXG4gICAgICAgICAgICAgICAgICAgICAgICBwYXJhbXNbZmllbGRzW2pdLm5hbWVdID0gZmllbGRzW2pdLnZhbHVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGF0YSA9IGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUoZGF0YSk7XG4gICAgICAgICAgICB2YXIgZm9ybSA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJmb3JtXCIpO1xuICAgICAgICAgICAgZm9ybS5zdHlsZS5kaXNwbGF5ID0gXCJub25lXCI7XG4gICAgICAgICAgICBmb3JtLmFjdGlvbiA9IHVybDtcbiAgICAgICAgICAgIGZvcm0ubWV0aG9kID0gXCJwb3N0XCI7XG4gICAgICAgICAgICBmb3IgKHZhciBrZXkgaW4gZGF0YSkge1xuICAgICAgICAgICAgICAgIC8vIFNpbmNlICdkYXRhJyB0aGlzIGlzIGEgbW9kZWwgb2JqZWN0LCB3ZSBpbmNsdWRlIGFsbCBwcm9wZXJ0aWVzIGluY2x1ZGluZyB0aG9zZSBpbmhlcml0ZWQgZnJvbSBpdHMgcHJvdG90eXBlXG4gICAgICAgICAgICAgICAgdmFyIGlucHV0ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImlucHV0XCIpO1xuICAgICAgICAgICAgICAgIGlucHV0LnR5cGUgPSBcImhpZGRlblwiO1xuICAgICAgICAgICAgICAgIGlucHV0Lm5hbWUgPSBrZXk7XG4gICAgICAgICAgICAgICAgaW5wdXQudmFsdWUgPSBrby51dGlscy5zdHJpbmdpZnlKc29uKGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUoZGF0YVtrZXldKSk7XG4gICAgICAgICAgICAgICAgZm9ybS5hcHBlbmRDaGlsZChpbnB1dCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBvYmplY3RGb3JFYWNoKHBhcmFtcywgZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgICAgIHZhciBpbnB1dCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJpbnB1dFwiKTtcbiAgICAgICAgICAgICAgICBpbnB1dC50eXBlID0gXCJoaWRkZW5cIjtcbiAgICAgICAgICAgICAgICBpbnB1dC5uYW1lID0ga2V5O1xuICAgICAgICAgICAgICAgIGlucHV0LnZhbHVlID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgZm9ybS5hcHBlbmRDaGlsZChpbnB1dCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoZm9ybSk7XG4gICAgICAgICAgICBvcHRpb25zWydzdWJtaXR0ZXInXSA/IG9wdGlvbnNbJ3N1Ym1pdHRlciddKGZvcm0pIDogZm9ybS5zdWJtaXQoKTtcbiAgICAgICAgICAgIHNldFRpbWVvdXQoZnVuY3Rpb24gKCkgeyBmb3JtLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQoZm9ybSk7IH0sIDApO1xuICAgICAgICB9XG4gICAgfVxufSgpKTtcblxua28uZXhwb3J0U3ltYm9sKCd1dGlscycsIGtvLnV0aWxzKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMuYXJyYXlGb3JFYWNoJywga28udXRpbHMuYXJyYXlGb3JFYWNoKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMuYXJyYXlGaXJzdCcsIGtvLnV0aWxzLmFycmF5Rmlyc3QpO1xua28uZXhwb3J0U3ltYm9sKCd1dGlscy5hcnJheUZpbHRlcicsIGtvLnV0aWxzLmFycmF5RmlsdGVyKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMuYXJyYXlHZXREaXN0aW5jdFZhbHVlcycsIGtvLnV0aWxzLmFycmF5R2V0RGlzdGluY3RWYWx1ZXMpO1xua28uZXhwb3J0U3ltYm9sKCd1dGlscy5hcnJheUluZGV4T2YnLCBrby51dGlscy5hcnJheUluZGV4T2YpO1xua28uZXhwb3J0U3ltYm9sKCd1dGlscy5hcnJheU1hcCcsIGtvLnV0aWxzLmFycmF5TWFwKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMuYXJyYXlQdXNoQWxsJywga28udXRpbHMuYXJyYXlQdXNoQWxsKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMuYXJyYXlSZW1vdmVJdGVtJywga28udXRpbHMuYXJyYXlSZW1vdmVJdGVtKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMuZXh0ZW5kJywga28udXRpbHMuZXh0ZW5kKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMuZmllbGRzSW5jbHVkZWRXaXRoSnNvblBvc3QnLCBrby51dGlscy5maWVsZHNJbmNsdWRlZFdpdGhKc29uUG9zdCk7XG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLmdldEZvcm1GaWVsZHMnLCBrby51dGlscy5nZXRGb3JtRmllbGRzKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMucGVla09ic2VydmFibGUnLCBrby51dGlscy5wZWVrT2JzZXJ2YWJsZSk7XG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLnBvc3RKc29uJywga28udXRpbHMucG9zdEpzb24pO1xua28uZXhwb3J0U3ltYm9sKCd1dGlscy5wYXJzZUpzb24nLCBrby51dGlscy5wYXJzZUpzb24pO1xua28uZXhwb3J0U3ltYm9sKCd1dGlscy5yZWdpc3RlckV2ZW50SGFuZGxlcicsIGtvLnV0aWxzLnJlZ2lzdGVyRXZlbnRIYW5kbGVyKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMuc3RyaW5naWZ5SnNvbicsIGtvLnV0aWxzLnN0cmluZ2lmeUpzb24pO1xua28uZXhwb3J0U3ltYm9sKCd1dGlscy5yYW5nZScsIGtvLnV0aWxzLnJhbmdlKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMudG9nZ2xlRG9tTm9kZUNzc0NsYXNzJywga28udXRpbHMudG9nZ2xlRG9tTm9kZUNzc0NsYXNzKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMudHJpZ2dlckV2ZW50Jywga28udXRpbHMudHJpZ2dlckV2ZW50KTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMudW53cmFwT2JzZXJ2YWJsZScsIGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUpO1xua28uZXhwb3J0U3ltYm9sKCd1dGlscy5vYmplY3RGb3JFYWNoJywga28udXRpbHMub2JqZWN0Rm9yRWFjaCk7XG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLmFkZE9yUmVtb3ZlSXRlbScsIGtvLnV0aWxzLmFkZE9yUmVtb3ZlSXRlbSk7XG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLnNldFRleHRDb250ZW50Jywga28udXRpbHMuc2V0VGV4dENvbnRlbnQpO1xua28uZXhwb3J0U3ltYm9sKCd1bndyYXAnLCBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKTsgLy8gQ29udmVuaWVudCBzaG9ydGhhbmQsIGJlY2F1c2UgdGhpcyBpcyB1c2VkIHNvIGNvbW1vbmx5XG5cbmlmICghRnVuY3Rpb24ucHJvdG90eXBlWydiaW5kJ10pIHtcbiAgICAvLyBGdW5jdGlvbi5wcm90b3R5cGUuYmluZCBpcyBhIHN0YW5kYXJkIHBhcnQgb2YgRUNNQVNjcmlwdCA1dGggRWRpdGlvbiAoRGVjZW1iZXIgMjAwOSwgaHR0cDovL3d3dy5lY21hLWludGVybmF0aW9uYWwub3JnL3B1YmxpY2F0aW9ucy9maWxlcy9FQ01BLVNUL0VDTUEtMjYyLnBkZilcbiAgICAvLyBJbiBjYXNlIHRoZSBicm93c2VyIGRvZXNuJ3QgaW1wbGVtZW50IGl0IG5hdGl2ZWx5LCBwcm92aWRlIGEgSmF2YVNjcmlwdCBpbXBsZW1lbnRhdGlvbi4gVGhpcyBpbXBsZW1lbnRhdGlvbiBpcyBiYXNlZCBvbiB0aGUgb25lIGluIHByb3RvdHlwZS5qc1xuICAgIEZ1bmN0aW9uLnByb3RvdHlwZVsnYmluZCddID0gZnVuY3Rpb24gKG9iamVjdCkge1xuICAgICAgICB2YXIgb3JpZ2luYWxGdW5jdGlvbiA9IHRoaXM7XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbEZ1bmN0aW9uLmFwcGx5KG9iamVjdCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcGFydGlhbEFyZ3MgPSBBcnJheS5wcm90b3R5cGUuc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgYXJncyA9IHBhcnRpYWxBcmdzLnNsaWNlKDApO1xuICAgICAgICAgICAgICAgIGFyZ3MucHVzaC5hcHBseShhcmdzLCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgICAgIHJldHVybiBvcmlnaW5hbEZ1bmN0aW9uLmFwcGx5KG9iamVjdCwgYXJncyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgfTtcbn1cblxua28udXRpbHMuZG9tRGF0YSA9IG5ldyAoZnVuY3Rpb24gKCkge1xuICAgIHZhciB1bmlxdWVJZCA9IDA7XG4gICAgdmFyIGRhdGFTdG9yZUtleUV4cGFuZG9Qcm9wZXJ0eU5hbWUgPSBcIl9fa29fX1wiICsgKG5ldyBEYXRlKS5nZXRUaW1lKCk7XG4gICAgdmFyIGRhdGFTdG9yZSA9IHt9O1xuXG4gICAgZnVuY3Rpb24gZ2V0QWxsKG5vZGUsIGNyZWF0ZUlmTm90Rm91bmQpIHtcbiAgICAgICAgdmFyIGRhdGFTdG9yZUtleSA9IG5vZGVbZGF0YVN0b3JlS2V5RXhwYW5kb1Byb3BlcnR5TmFtZV07XG4gICAgICAgIHZhciBoYXNFeGlzdGluZ0RhdGFTdG9yZSA9IGRhdGFTdG9yZUtleSAmJiAoZGF0YVN0b3JlS2V5ICE9PSBcIm51bGxcIikgJiYgZGF0YVN0b3JlW2RhdGFTdG9yZUtleV07XG4gICAgICAgIGlmICghaGFzRXhpc3RpbmdEYXRhU3RvcmUpIHtcbiAgICAgICAgICAgIGlmICghY3JlYXRlSWZOb3RGb3VuZClcbiAgICAgICAgICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgICAgICAgZGF0YVN0b3JlS2V5ID0gbm9kZVtkYXRhU3RvcmVLZXlFeHBhbmRvUHJvcGVydHlOYW1lXSA9IFwia29cIiArIHVuaXF1ZUlkKys7XG4gICAgICAgICAgICBkYXRhU3RvcmVbZGF0YVN0b3JlS2V5XSA9IHt9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBkYXRhU3RvcmVbZGF0YVN0b3JlS2V5XTtcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgICBnZXQ6IGZ1bmN0aW9uIChub2RlLCBrZXkpIHtcbiAgICAgICAgICAgIHZhciBhbGxEYXRhRm9yTm9kZSA9IGdldEFsbChub2RlLCBmYWxzZSk7XG4gICAgICAgICAgICByZXR1cm4gYWxsRGF0YUZvck5vZGUgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IGFsbERhdGFGb3JOb2RlW2tleV07XG4gICAgICAgIH0sXG4gICAgICAgIHNldDogZnVuY3Rpb24gKG5vZGUsIGtleSwgdmFsdWUpIHtcbiAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICAgICAgLy8gTWFrZSBzdXJlIHdlIGRvbid0IGFjdHVhbGx5IGNyZWF0ZSBhIG5ldyBkb21EYXRhIGtleSBpZiB3ZSBhcmUgYWN0dWFsbHkgZGVsZXRpbmcgYSB2YWx1ZVxuICAgICAgICAgICAgICAgIGlmIChnZXRBbGwobm9kZSwgZmFsc2UpID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBhbGxEYXRhRm9yTm9kZSA9IGdldEFsbChub2RlLCB0cnVlKTtcbiAgICAgICAgICAgIGFsbERhdGFGb3JOb2RlW2tleV0gPSB2YWx1ZTtcbiAgICAgICAgfSxcbiAgICAgICAgY2xlYXI6IGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICAgICAgICB2YXIgZGF0YVN0b3JlS2V5ID0gbm9kZVtkYXRhU3RvcmVLZXlFeHBhbmRvUHJvcGVydHlOYW1lXTtcbiAgICAgICAgICAgIGlmIChkYXRhU3RvcmVLZXkpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgZGF0YVN0b3JlW2RhdGFTdG9yZUtleV07XG4gICAgICAgICAgICAgICAgbm9kZVtkYXRhU3RvcmVLZXlFeHBhbmRvUHJvcGVydHlOYW1lXSA9IG51bGw7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRydWU7IC8vIEV4cG9zaW5nIFwiZGlkIGNsZWFuXCIgZmxhZyBwdXJlbHkgc28gc3BlY3MgY2FuIGluZmVyIHdoZXRoZXIgdGhpbmdzIGhhdmUgYmVlbiBjbGVhbmVkIHVwIGFzIGludGVuZGVkXG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgbmV4dEtleTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICh1bmlxdWVJZCsrKSArIGRhdGFTdG9yZUtleUV4cGFuZG9Qcm9wZXJ0eU5hbWU7XG4gICAgICAgIH1cbiAgICB9O1xufSkoKTtcblxua28uZXhwb3J0U3ltYm9sKCd1dGlscy5kb21EYXRhJywga28udXRpbHMuZG9tRGF0YSk7XG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLmRvbURhdGEuY2xlYXInLCBrby51dGlscy5kb21EYXRhLmNsZWFyKTsgLy8gRXhwb3J0aW5nIG9ubHkgc28gc3BlY3MgY2FuIGNsZWFyIHVwIGFmdGVyIHRoZW1zZWx2ZXMgZnVsbHlcblxua28udXRpbHMuZG9tTm9kZURpc3Bvc2FsID0gbmV3IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGRvbURhdGFLZXkgPSBrby51dGlscy5kb21EYXRhLm5leHRLZXkoKTtcbiAgICB2YXIgY2xlYW5hYmxlTm9kZVR5cGVzID0geyAxOiB0cnVlLCA4OiB0cnVlLCA5OiB0cnVlIH07ICAgICAgIC8vIEVsZW1lbnQsIENvbW1lbnQsIERvY3VtZW50XG4gICAgdmFyIGNsZWFuYWJsZU5vZGVUeXBlc1dpdGhEZXNjZW5kYW50cyA9IHsgMTogdHJ1ZSwgOTogdHJ1ZSB9OyAvLyBFbGVtZW50LCBEb2N1bWVudFxuXG4gICAgZnVuY3Rpb24gZ2V0RGlzcG9zZUNhbGxiYWNrc0NvbGxlY3Rpb24obm9kZSwgY3JlYXRlSWZOb3RGb3VuZCkge1xuICAgICAgICB2YXIgYWxsRGlzcG9zZUNhbGxiYWNrcyA9IGtvLnV0aWxzLmRvbURhdGEuZ2V0KG5vZGUsIGRvbURhdGFLZXkpO1xuICAgICAgICBpZiAoKGFsbERpc3Bvc2VDYWxsYmFja3MgPT09IHVuZGVmaW5lZCkgJiYgY3JlYXRlSWZOb3RGb3VuZCkge1xuICAgICAgICAgICAgYWxsRGlzcG9zZUNhbGxiYWNrcyA9IFtdO1xuICAgICAgICAgICAga28udXRpbHMuZG9tRGF0YS5zZXQobm9kZSwgZG9tRGF0YUtleSwgYWxsRGlzcG9zZUNhbGxiYWNrcyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGFsbERpc3Bvc2VDYWxsYmFja3M7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGRlc3Ryb3lDYWxsYmFja3NDb2xsZWN0aW9uKG5vZGUpIHtcbiAgICAgICAga28udXRpbHMuZG9tRGF0YS5zZXQobm9kZSwgZG9tRGF0YUtleSwgdW5kZWZpbmVkKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjbGVhblNpbmdsZU5vZGUobm9kZSkge1xuICAgICAgICAvLyBSdW4gYWxsIHRoZSBkaXNwb3NlIGNhbGxiYWNrc1xuICAgICAgICB2YXIgY2FsbGJhY2tzID0gZ2V0RGlzcG9zZUNhbGxiYWNrc0NvbGxlY3Rpb24obm9kZSwgZmFsc2UpO1xuICAgICAgICBpZiAoY2FsbGJhY2tzKSB7XG4gICAgICAgICAgICBjYWxsYmFja3MgPSBjYWxsYmFja3Muc2xpY2UoMCk7IC8vIENsb25lLCBhcyB0aGUgYXJyYXkgbWF5IGJlIG1vZGlmaWVkIGR1cmluZyBpdGVyYXRpb24gKHR5cGljYWxseSwgY2FsbGJhY2tzIHdpbGwgcmVtb3ZlIHRoZW1zZWx2ZXMpXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IGNhbGxiYWNrcy5sZW5ndGg7IGkrKylcbiAgICAgICAgICAgICAgICBjYWxsYmFja3NbaV0obm9kZSk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBFcmFzZSB0aGUgRE9NIGRhdGFcbiAgICAgICAga28udXRpbHMuZG9tRGF0YS5jbGVhcihub2RlKTtcblxuICAgICAgICAvLyBQZXJmb3JtIGNsZWFudXAgbmVlZGVkIGJ5IGV4dGVybmFsIGxpYnJhcmllcyAoY3VycmVudGx5IG9ubHkgalF1ZXJ5LCBidXQgY2FuIGJlIGV4dGVuZGVkKVxuICAgICAgICBrby51dGlscy5kb21Ob2RlRGlzcG9zYWxbXCJjbGVhbkV4dGVybmFsRGF0YVwiXShub2RlKTtcblxuICAgICAgICAvLyBDbGVhciBhbnkgaW1tZWRpYXRlLWNoaWxkIGNvbW1lbnQgbm9kZXMsIGFzIHRoZXNlIHdvdWxkbid0IGhhdmUgYmVlbiBmb3VuZCBieVxuICAgICAgICAvLyBub2RlLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiKlwiKSBpbiBjbGVhbk5vZGUoKSAoY29tbWVudCBub2RlcyBhcmVuJ3QgZWxlbWVudHMpXG4gICAgICAgIGlmIChjbGVhbmFibGVOb2RlVHlwZXNXaXRoRGVzY2VuZGFudHNbbm9kZS5ub2RlVHlwZV0pXG4gICAgICAgICAgICBjbGVhbkltbWVkaWF0ZUNvbW1lbnRUeXBlQ2hpbGRyZW4obm9kZSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY2xlYW5JbW1lZGlhdGVDb21tZW50VHlwZUNoaWxkcmVuKG5vZGVXaXRoQ2hpbGRyZW4pIHtcbiAgICAgICAgdmFyIGNoaWxkLCBuZXh0Q2hpbGQgPSBub2RlV2l0aENoaWxkcmVuLmZpcnN0Q2hpbGQ7XG4gICAgICAgIHdoaWxlIChjaGlsZCA9IG5leHRDaGlsZCkge1xuICAgICAgICAgICAgbmV4dENoaWxkID0gY2hpbGQubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICBpZiAoY2hpbGQubm9kZVR5cGUgPT09IDgpXG4gICAgICAgICAgICAgICAgY2xlYW5TaW5nbGVOb2RlKGNoaWxkKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGFkZERpc3Bvc2VDYWxsYmFjayA6IGZ1bmN0aW9uKG5vZGUsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYWxsYmFjayBtdXN0IGJlIGEgZnVuY3Rpb25cIik7XG4gICAgICAgICAgICBnZXREaXNwb3NlQ2FsbGJhY2tzQ29sbGVjdGlvbihub2RlLCB0cnVlKS5wdXNoKGNhbGxiYWNrKTtcbiAgICAgICAgfSxcblxuICAgICAgICByZW1vdmVEaXNwb3NlQ2FsbGJhY2sgOiBmdW5jdGlvbihub2RlLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgdmFyIGNhbGxiYWNrc0NvbGxlY3Rpb24gPSBnZXREaXNwb3NlQ2FsbGJhY2tzQ29sbGVjdGlvbihub2RlLCBmYWxzZSk7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2tzQ29sbGVjdGlvbikge1xuICAgICAgICAgICAgICAgIGtvLnV0aWxzLmFycmF5UmVtb3ZlSXRlbShjYWxsYmFja3NDb2xsZWN0aW9uLCBjYWxsYmFjayk7XG4gICAgICAgICAgICAgICAgaWYgKGNhbGxiYWNrc0NvbGxlY3Rpb24ubGVuZ3RoID09IDApXG4gICAgICAgICAgICAgICAgICAgIGRlc3Ryb3lDYWxsYmFja3NDb2xsZWN0aW9uKG5vZGUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGNsZWFuTm9kZSA6IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgIC8vIEZpcnN0IGNsZWFuIHRoaXMgbm9kZSwgd2hlcmUgYXBwbGljYWJsZVxuICAgICAgICAgICAgaWYgKGNsZWFuYWJsZU5vZGVUeXBlc1tub2RlLm5vZGVUeXBlXSkge1xuICAgICAgICAgICAgICAgIGNsZWFuU2luZ2xlTm9kZShub2RlKTtcblxuICAgICAgICAgICAgICAgIC8vIC4uLiB0aGVuIGl0cyBkZXNjZW5kYW50cywgd2hlcmUgYXBwbGljYWJsZVxuICAgICAgICAgICAgICAgIGlmIChjbGVhbmFibGVOb2RlVHlwZXNXaXRoRGVzY2VuZGFudHNbbm9kZS5ub2RlVHlwZV0pIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gQ2xvbmUgdGhlIGRlc2NlbmRhbnRzIGxpc3QgaW4gY2FzZSBpdCBjaGFuZ2VzIGR1cmluZyBpdGVyYXRpb25cbiAgICAgICAgICAgICAgICAgICAgdmFyIGRlc2NlbmRhbnRzID0gW107XG4gICAgICAgICAgICAgICAgICAgIGtvLnV0aWxzLmFycmF5UHVzaEFsbChkZXNjZW5kYW50cywgbm9kZS5nZXRFbGVtZW50c0J5VGFnTmFtZShcIipcIikpO1xuICAgICAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgaiA9IGRlc2NlbmRhbnRzLmxlbmd0aDsgaSA8IGo7IGkrKylcbiAgICAgICAgICAgICAgICAgICAgICAgIGNsZWFuU2luZ2xlTm9kZShkZXNjZW5kYW50c1tpXSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIG5vZGU7XG4gICAgICAgIH0sXG5cbiAgICAgICAgcmVtb3ZlTm9kZSA6IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgIGtvLmNsZWFuTm9kZShub2RlKTtcbiAgICAgICAgICAgIGlmIChub2RlLnBhcmVudE5vZGUpXG4gICAgICAgICAgICAgICAgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpO1xuICAgICAgICB9LFxuXG4gICAgICAgIFwiY2xlYW5FeHRlcm5hbERhdGFcIiA6IGZ1bmN0aW9uIChub2RlKSB7XG4gICAgICAgICAgICAvLyBTcGVjaWFsIHN1cHBvcnQgZm9yIGpRdWVyeSBoZXJlIGJlY2F1c2UgaXQncyBzbyBjb21tb25seSB1c2VkLlxuICAgICAgICAgICAgLy8gTWFueSBqUXVlcnkgcGx1Z2lucyAoaW5jbHVkaW5nIGpxdWVyeS50bXBsKSBzdG9yZSBkYXRhIHVzaW5nIGpRdWVyeSdzIGVxdWl2YWxlbnQgb2YgZG9tRGF0YVxuICAgICAgICAgICAgLy8gc28gbm90aWZ5IGl0IHRvIHRlYXIgZG93biBhbnkgcmVzb3VyY2VzIGFzc29jaWF0ZWQgd2l0aCB0aGUgbm9kZSAmIGRlc2NlbmRhbnRzIGhlcmUuXG4gICAgICAgICAgICBpZiAoalF1ZXJ5SW5zdGFuY2UgJiYgKHR5cGVvZiBqUXVlcnlJbnN0YW5jZVsnY2xlYW5EYXRhJ10gPT0gXCJmdW5jdGlvblwiKSlcbiAgICAgICAgICAgICAgICBqUXVlcnlJbnN0YW5jZVsnY2xlYW5EYXRhJ10oW25vZGVdKTtcbiAgICAgICAgfVxuICAgIH07XG59KSgpO1xua28uY2xlYW5Ob2RlID0ga28udXRpbHMuZG9tTm9kZURpc3Bvc2FsLmNsZWFuTm9kZTsgLy8gU2hvcnRoYW5kIG5hbWUgZm9yIGNvbnZlbmllbmNlXG5rby5yZW1vdmVOb2RlID0ga28udXRpbHMuZG9tTm9kZURpc3Bvc2FsLnJlbW92ZU5vZGU7IC8vIFNob3J0aGFuZCBuYW1lIGZvciBjb252ZW5pZW5jZVxua28uZXhwb3J0U3ltYm9sKCdjbGVhbk5vZGUnLCBrby5jbGVhbk5vZGUpO1xua28uZXhwb3J0U3ltYm9sKCdyZW1vdmVOb2RlJywga28ucmVtb3ZlTm9kZSk7XG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLmRvbU5vZGVEaXNwb3NhbCcsIGtvLnV0aWxzLmRvbU5vZGVEaXNwb3NhbCk7XG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLmRvbU5vZGVEaXNwb3NhbC5hZGREaXNwb3NlQ2FsbGJhY2snLCBrby51dGlscy5kb21Ob2RlRGlzcG9zYWwuYWRkRGlzcG9zZUNhbGxiYWNrKTtcbmtvLmV4cG9ydFN5bWJvbCgndXRpbHMuZG9tTm9kZURpc3Bvc2FsLnJlbW92ZURpc3Bvc2VDYWxsYmFjaycsIGtvLnV0aWxzLmRvbU5vZGVEaXNwb3NhbC5yZW1vdmVEaXNwb3NlQ2FsbGJhY2spO1xuKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbm9uZSA9IFswLCBcIlwiLCBcIlwiXSxcbiAgICAgICAgdGFibGUgPSBbMSwgXCI8dGFibGU+XCIsIFwiPC90YWJsZT5cIl0sXG4gICAgICAgIHRib2R5ID0gWzIsIFwiPHRhYmxlPjx0Ym9keT5cIiwgXCI8L3Rib2R5PjwvdGFibGU+XCJdLFxuICAgICAgICB0ciA9IFszLCBcIjx0YWJsZT48dGJvZHk+PHRyPlwiLCBcIjwvdHI+PC90Ym9keT48L3RhYmxlPlwiXSxcbiAgICAgICAgc2VsZWN0ID0gWzEsIFwiPHNlbGVjdCBtdWx0aXBsZT0nbXVsdGlwbGUnPlwiLCBcIjwvc2VsZWN0PlwiXSxcbiAgICAgICAgbG9va3VwID0ge1xuICAgICAgICAgICAgJ3RoZWFkJzogdGFibGUsXG4gICAgICAgICAgICAndGJvZHknOiB0YWJsZSxcbiAgICAgICAgICAgICd0Zm9vdCc6IHRhYmxlLFxuICAgICAgICAgICAgJ3RyJzogdGJvZHksXG4gICAgICAgICAgICAndGQnOiB0cixcbiAgICAgICAgICAgICd0aCc6IHRyLFxuICAgICAgICAgICAgJ29wdGlvbic6IHNlbGVjdCxcbiAgICAgICAgICAgICdvcHRncm91cCc6IHNlbGVjdFxuICAgICAgICB9LFxuXG4gICAgICAgIC8vIFRoaXMgaXMgbmVlZGVkIGZvciBvbGQgSUUgaWYgeW91J3JlICpub3QqIHVzaW5nIGVpdGhlciBqUXVlcnkgb3IgaW5uZXJTaGl2LiBEb2Vzbid0IGFmZmVjdCBvdGhlciBjYXNlcy5cbiAgICAgICAgbWF5UmVxdWlyZUNyZWF0ZUVsZW1lbnRIYWNrID0ga28udXRpbHMuaWVWZXJzaW9uIDw9IDg7XG5cbiAgICBmdW5jdGlvbiBnZXRXcmFwKHRhZ3MpIHtcbiAgICAgICAgdmFyIG0gPSB0YWdzLm1hdGNoKC9ePChbYS16XSspWyA+XS8pO1xuICAgICAgICByZXR1cm4gKG0gJiYgbG9va3VwW21bMV1dKSB8fCBub25lO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNpbXBsZUh0bWxQYXJzZShodG1sLCBkb2N1bWVudENvbnRleHQpIHtcbiAgICAgICAgZG9jdW1lbnRDb250ZXh0IHx8IChkb2N1bWVudENvbnRleHQgPSBkb2N1bWVudCk7XG4gICAgICAgIHZhciB3aW5kb3dDb250ZXh0ID0gZG9jdW1lbnRDb250ZXh0WydwYXJlbnRXaW5kb3cnXSB8fCBkb2N1bWVudENvbnRleHRbJ2RlZmF1bHRWaWV3J10gfHwgd2luZG93O1xuXG4gICAgICAgIC8vIEJhc2VkIG9uIGpRdWVyeSdzIFwiY2xlYW5cIiBmdW5jdGlvbiwgYnV0IG9ubHkgYWNjb3VudGluZyBmb3IgdGFibGUtcmVsYXRlZCBlbGVtZW50cy5cbiAgICAgICAgLy8gSWYgeW91IGhhdmUgcmVmZXJlbmNlZCBqUXVlcnksIHRoaXMgd29uJ3QgYmUgdXNlZCBhbnl3YXkgLSBLTyB3aWxsIHVzZSBqUXVlcnkncyBcImNsZWFuXCIgZnVuY3Rpb24gZGlyZWN0bHlcblxuICAgICAgICAvLyBOb3RlIHRoYXQgdGhlcmUncyBzdGlsbCBhbiBpc3N1ZSBpbiBJRSA8IDkgd2hlcmVieSBpdCB3aWxsIGRpc2NhcmQgY29tbWVudCBub2RlcyB0aGF0IGFyZSB0aGUgZmlyc3QgY2hpbGQgb2ZcbiAgICAgICAgLy8gYSBkZXNjZW5kYW50IG5vZGUuIEZvciBleGFtcGxlOiBcIjxkaXY+PCEtLSBteWNvbW1lbnQgLS0+YWJjPC9kaXY+XCIgd2lsbCBnZXQgcGFyc2VkIGFzIFwiPGRpdj5hYmM8L2Rpdj5cIlxuICAgICAgICAvLyBUaGlzIHdvbid0IGFmZmVjdCBhbnlvbmUgd2hvIGhhcyByZWZlcmVuY2VkIGpRdWVyeSwgYW5kIHRoZXJlJ3MgYWx3YXlzIHRoZSB3b3JrYXJvdW5kIG9mIGluc2VydGluZyBhIGR1bW15IG5vZGVcbiAgICAgICAgLy8gKHBvc3NpYmx5IGEgdGV4dCBub2RlKSBpbiBmcm9udCBvZiB0aGUgY29tbWVudC4gU28sIEtPIGRvZXMgbm90IGF0dGVtcHQgdG8gd29ya2Fyb3VuZCB0aGlzIElFIGlzc3VlIGF1dG9tYXRpY2FsbHkgYXQgcHJlc2VudC5cblxuICAgICAgICAvLyBUcmltIHdoaXRlc3BhY2UsIG90aGVyd2lzZSBpbmRleE9mIHdvbid0IHdvcmsgYXMgZXhwZWN0ZWRcbiAgICAgICAgdmFyIHRhZ3MgPSBrby51dGlscy5zdHJpbmdUcmltKGh0bWwpLnRvTG93ZXJDYXNlKCksIGRpdiA9IGRvY3VtZW50Q29udGV4dC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpLFxuICAgICAgICAgICAgd3JhcCA9IGdldFdyYXAodGFncyksXG4gICAgICAgICAgICBkZXB0aCA9IHdyYXBbMF07XG5cbiAgICAgICAgLy8gR28gdG8gaHRtbCBhbmQgYmFjaywgdGhlbiBwZWVsIG9mZiBleHRyYSB3cmFwcGVyc1xuICAgICAgICAvLyBOb3RlIHRoYXQgd2UgYWx3YXlzIHByZWZpeCB3aXRoIHNvbWUgZHVtbXkgdGV4dCwgYmVjYXVzZSBvdGhlcndpc2UsIElFPDkgd2lsbCBzdHJpcCBvdXQgbGVhZGluZyBjb21tZW50IG5vZGVzIGluIGRlc2NlbmRhbnRzLiBUb3RhbCBtYWRuZXNzLlxuICAgICAgICB2YXIgbWFya3VwID0gXCJpZ25vcmVkPGRpdj5cIiArIHdyYXBbMV0gKyBodG1sICsgd3JhcFsyXSArIFwiPC9kaXY+XCI7XG4gICAgICAgIGlmICh0eXBlb2Ygd2luZG93Q29udGV4dFsnaW5uZXJTaGl2J10gPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICAvLyBOb3RlIHRoYXQgaW5uZXJTaGl2IGlzIGRlcHJlY2F0ZWQgaW4gZmF2b3VyIG9mIGh0bWw1c2hpdi4gV2Ugc2hvdWxkIGNvbnNpZGVyIGFkZGluZ1xuICAgICAgICAgICAgLy8gc3VwcG9ydCBmb3IgaHRtbDVzaGl2IChleGNlcHQgaWYgbm8gZXhwbGljaXQgc3VwcG9ydCBpcyBuZWVkZWQsIGUuZy4sIGlmIGh0bWw1c2hpdlxuICAgICAgICAgICAgLy8gc29tZWhvdyBzaGltcyB0aGUgbmF0aXZlIEFQSXMgc28gaXQganVzdCB3b3JrcyBhbnl3YXkpXG4gICAgICAgICAgICBkaXYuYXBwZW5kQ2hpbGQod2luZG93Q29udGV4dFsnaW5uZXJTaGl2J10obWFya3VwKSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpZiAobWF5UmVxdWlyZUNyZWF0ZUVsZW1lbnRIYWNrKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ215LWVsZW1lbnQnKSB0cmljayB0byBlbmFibGUgY3VzdG9tIGVsZW1lbnRzIGluIElFNi04XG4gICAgICAgICAgICAgICAgLy8gb25seSB3b3JrcyBpZiB3ZSBhc3NpZ24gaW5uZXJIVE1MIG9uIGFuIGVsZW1lbnQgYXNzb2NpYXRlZCB3aXRoIHRoYXQgZG9jdW1lbnQuXG4gICAgICAgICAgICAgICAgZG9jdW1lbnRDb250ZXh0LmFwcGVuZENoaWxkKGRpdik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGRpdi5pbm5lckhUTUwgPSBtYXJrdXA7XG5cbiAgICAgICAgICAgIGlmIChtYXlSZXF1aXJlQ3JlYXRlRWxlbWVudEhhY2spIHtcbiAgICAgICAgICAgICAgICBkaXYucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChkaXYpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gTW92ZSB0byB0aGUgcmlnaHQgZGVwdGhcbiAgICAgICAgd2hpbGUgKGRlcHRoLS0pXG4gICAgICAgICAgICBkaXYgPSBkaXYubGFzdENoaWxkO1xuXG4gICAgICAgIHJldHVybiBrby51dGlscy5tYWtlQXJyYXkoZGl2Lmxhc3RDaGlsZC5jaGlsZE5vZGVzKTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBqUXVlcnlIdG1sUGFyc2UoaHRtbCwgZG9jdW1lbnRDb250ZXh0KSB7XG4gICAgICAgIC8vIGpRdWVyeSdzIFwicGFyc2VIVE1MXCIgZnVuY3Rpb24gd2FzIGludHJvZHVjZWQgaW4galF1ZXJ5IDEuOC4wIGFuZCBpcyBhIGRvY3VtZW50ZWQgcHVibGljIEFQSS5cbiAgICAgICAgaWYgKGpRdWVyeUluc3RhbmNlWydwYXJzZUhUTUwnXSkge1xuICAgICAgICAgICAgcmV0dXJuIGpRdWVyeUluc3RhbmNlWydwYXJzZUhUTUwnXShodG1sLCBkb2N1bWVudENvbnRleHQpIHx8IFtdOyAvLyBFbnN1cmUgd2UgYWx3YXlzIHJldHVybiBhbiBhcnJheSBhbmQgbmV2ZXIgbnVsbFxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gRm9yIGpRdWVyeSA8IDEuOC4wLCB3ZSBmYWxsIGJhY2sgb24gdGhlIHVuZG9jdW1lbnRlZCBpbnRlcm5hbCBcImNsZWFuXCIgZnVuY3Rpb24uXG4gICAgICAgICAgICB2YXIgZWxlbXMgPSBqUXVlcnlJbnN0YW5jZVsnY2xlYW4nXShbaHRtbF0sIGRvY3VtZW50Q29udGV4dCk7XG5cbiAgICAgICAgICAgIC8vIEFzIG9mIGpRdWVyeSAxLjcuMSwgalF1ZXJ5IHBhcnNlcyB0aGUgSFRNTCBieSBhcHBlbmRpbmcgaXQgdG8gc29tZSBkdW1teSBwYXJlbnQgbm9kZXMgaGVsZCBpbiBhbiBpbi1tZW1vcnkgZG9jdW1lbnQgZnJhZ21lbnQuXG4gICAgICAgICAgICAvLyBVbmZvcnR1bmF0ZWx5LCBpdCBuZXZlciBjbGVhcnMgdGhlIGR1bW15IHBhcmVudCBub2RlcyBmcm9tIHRoZSBkb2N1bWVudCBmcmFnbWVudCwgc28gaXQgbGVha3MgbWVtb3J5IG92ZXIgdGltZS5cbiAgICAgICAgICAgIC8vIEZpeCB0aGlzIGJ5IGZpbmRpbmcgdGhlIHRvcC1tb3N0IGR1bW15IHBhcmVudCBlbGVtZW50LCBhbmQgZGV0YWNoaW5nIGl0IGZyb20gaXRzIG93bmVyIGZyYWdtZW50LlxuICAgICAgICAgICAgaWYgKGVsZW1zICYmIGVsZW1zWzBdKSB7XG4gICAgICAgICAgICAgICAgLy8gRmluZCB0aGUgdG9wLW1vc3QgcGFyZW50IGVsZW1lbnQgdGhhdCdzIGEgZGlyZWN0IGNoaWxkIG9mIGEgZG9jdW1lbnQgZnJhZ21lbnRcbiAgICAgICAgICAgICAgICB2YXIgZWxlbSA9IGVsZW1zWzBdO1xuICAgICAgICAgICAgICAgIHdoaWxlIChlbGVtLnBhcmVudE5vZGUgJiYgZWxlbS5wYXJlbnROb2RlLm5vZGVUeXBlICE9PSAxMSAvKiBpLmUuLCBEb2N1bWVudEZyYWdtZW50ICovKVxuICAgICAgICAgICAgICAgICAgICBlbGVtID0gZWxlbS5wYXJlbnROb2RlO1xuICAgICAgICAgICAgICAgIC8vIC4uLiB0aGVuIGRldGFjaCBpdFxuICAgICAgICAgICAgICAgIGlmIChlbGVtLnBhcmVudE5vZGUpXG4gICAgICAgICAgICAgICAgICAgIGVsZW0ucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChlbGVtKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGVsZW1zO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAga28udXRpbHMucGFyc2VIdG1sRnJhZ21lbnQgPSBmdW5jdGlvbihodG1sLCBkb2N1bWVudENvbnRleHQpIHtcbiAgICAgICAgcmV0dXJuIGpRdWVyeUluc3RhbmNlID9cbiAgICAgICAgICAgIGpRdWVyeUh0bWxQYXJzZShodG1sLCBkb2N1bWVudENvbnRleHQpIDogICAvLyBBcyBiZWxvdywgYmVuZWZpdCBmcm9tIGpRdWVyeSdzIG9wdGltaXNhdGlvbnMgd2hlcmUgcG9zc2libGVcbiAgICAgICAgICAgIHNpbXBsZUh0bWxQYXJzZShodG1sLCBkb2N1bWVudENvbnRleHQpOyAgLy8gLi4uIG90aGVyd2lzZSwgdGhpcyBzaW1wbGUgbG9naWMgd2lsbCBkbyBpbiBtb3N0IGNvbW1vbiBjYXNlcy5cbiAgICB9O1xuXG4gICAga28udXRpbHMuc2V0SHRtbCA9IGZ1bmN0aW9uKG5vZGUsIGh0bWwpIHtcbiAgICAgICAga28udXRpbHMuZW1wdHlEb21Ob2RlKG5vZGUpO1xuXG4gICAgICAgIC8vIFRoZXJlJ3Mgbm8gbGVnaXRpbWF0ZSByZWFzb24gdG8gZGlzcGxheSBhIHN0cmluZ2lmaWVkIG9ic2VydmFibGUgd2l0aG91dCB1bndyYXBwaW5nIGl0LCBzbyB3ZSdsbCB1bndyYXAgaXRcbiAgICAgICAgaHRtbCA9IGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUoaHRtbCk7XG5cbiAgICAgICAgaWYgKChodG1sICE9PSBudWxsKSAmJiAoaHRtbCAhPT0gdW5kZWZpbmVkKSkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiBodG1sICE9ICdzdHJpbmcnKVxuICAgICAgICAgICAgICAgIGh0bWwgPSBodG1sLnRvU3RyaW5nKCk7XG5cbiAgICAgICAgICAgIC8vIGpRdWVyeSBjb250YWlucyBhIGxvdCBvZiBzb3BoaXN0aWNhdGVkIGNvZGUgdG8gcGFyc2UgYXJiaXRyYXJ5IEhUTUwgZnJhZ21lbnRzLFxuICAgICAgICAgICAgLy8gZm9yIGV4YW1wbGUgPHRyPiBlbGVtZW50cyB3aGljaCBhcmUgbm90IG5vcm1hbGx5IGFsbG93ZWQgdG8gZXhpc3Qgb24gdGhlaXIgb3duLlxuICAgICAgICAgICAgLy8gSWYgeW91J3ZlIHJlZmVyZW5jZWQgalF1ZXJ5IHdlJ2xsIHVzZSB0aGF0IHJhdGhlciB0aGFuIGR1cGxpY2F0aW5nIGl0cyBjb2RlLlxuICAgICAgICAgICAgaWYgKGpRdWVyeUluc3RhbmNlKSB7XG4gICAgICAgICAgICAgICAgalF1ZXJ5SW5zdGFuY2Uobm9kZSlbJ2h0bWwnXShodG1sKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gLi4uIG90aGVyd2lzZSwgdXNlIEtPJ3Mgb3duIHBhcnNpbmcgbG9naWMuXG4gICAgICAgICAgICAgICAgdmFyIHBhcnNlZE5vZGVzID0ga28udXRpbHMucGFyc2VIdG1sRnJhZ21lbnQoaHRtbCwgbm9kZS5vd25lckRvY3VtZW50KTtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHBhcnNlZE5vZGVzLmxlbmd0aDsgaSsrKVxuICAgICAgICAgICAgICAgICAgICBub2RlLmFwcGVuZENoaWxkKHBhcnNlZE5vZGVzW2ldKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH07XG59KSgpO1xuXG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLnBhcnNlSHRtbEZyYWdtZW50Jywga28udXRpbHMucGFyc2VIdG1sRnJhZ21lbnQpO1xua28uZXhwb3J0U3ltYm9sKCd1dGlscy5zZXRIdG1sJywga28udXRpbHMuc2V0SHRtbCk7XG5cbmtvLm1lbW9pemF0aW9uID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbWVtb3MgPSB7fTtcblxuICAgIGZ1bmN0aW9uIHJhbmRvbU1heDhIZXhDaGFycygpIHtcbiAgICAgICAgcmV0dXJuICgoKDEgKyBNYXRoLnJhbmRvbSgpKSAqIDB4MTAwMDAwMDAwKSB8IDApLnRvU3RyaW5nKDE2KS5zdWJzdHJpbmcoMSk7XG4gICAgfVxuICAgIGZ1bmN0aW9uIGdlbmVyYXRlUmFuZG9tSWQoKSB7XG4gICAgICAgIHJldHVybiByYW5kb21NYXg4SGV4Q2hhcnMoKSArIHJhbmRvbU1heDhIZXhDaGFycygpO1xuICAgIH1cbiAgICBmdW5jdGlvbiBmaW5kTWVtb05vZGVzKHJvb3ROb2RlLCBhcHBlbmRUb0FycmF5KSB7XG4gICAgICAgIGlmICghcm9vdE5vZGUpXG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIGlmIChyb290Tm9kZS5ub2RlVHlwZSA9PSA4KSB7XG4gICAgICAgICAgICB2YXIgbWVtb0lkID0ga28ubWVtb2l6YXRpb24ucGFyc2VNZW1vVGV4dChyb290Tm9kZS5ub2RlVmFsdWUpO1xuICAgICAgICAgICAgaWYgKG1lbW9JZCAhPSBudWxsKVxuICAgICAgICAgICAgICAgIGFwcGVuZFRvQXJyYXkucHVzaCh7IGRvbU5vZGU6IHJvb3ROb2RlLCBtZW1vSWQ6IG1lbW9JZCB9KTtcbiAgICAgICAgfSBlbHNlIGlmIChyb290Tm9kZS5ub2RlVHlwZSA9PSAxKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgY2hpbGROb2RlcyA9IHJvb3ROb2RlLmNoaWxkTm9kZXMsIGogPSBjaGlsZE5vZGVzLmxlbmd0aDsgaSA8IGo7IGkrKylcbiAgICAgICAgICAgICAgICBmaW5kTWVtb05vZGVzKGNoaWxkTm9kZXNbaV0sIGFwcGVuZFRvQXJyYXkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgbWVtb2l6ZTogZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGNhbGxiYWNrICE9IFwiZnVuY3Rpb25cIilcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJZb3UgY2FuIG9ubHkgcGFzcyBhIGZ1bmN0aW9uIHRvIGtvLm1lbW9pemF0aW9uLm1lbW9pemUoKVwiKTtcbiAgICAgICAgICAgIHZhciBtZW1vSWQgPSBnZW5lcmF0ZVJhbmRvbUlkKCk7XG4gICAgICAgICAgICBtZW1vc1ttZW1vSWRdID0gY2FsbGJhY2s7XG4gICAgICAgICAgICByZXR1cm4gXCI8IS0tW2tvX21lbW86XCIgKyBtZW1vSWQgKyBcIl0tLT5cIjtcbiAgICAgICAgfSxcblxuICAgICAgICB1bm1lbW9pemU6IGZ1bmN0aW9uIChtZW1vSWQsIGNhbGxiYWNrUGFyYW1zKSB7XG4gICAgICAgICAgICB2YXIgY2FsbGJhY2sgPSBtZW1vc1ttZW1vSWRdO1xuICAgICAgICAgICAgaWYgKGNhbGxiYWNrID09PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ291bGRuJ3QgZmluZCBhbnkgbWVtbyB3aXRoIElEIFwiICsgbWVtb0lkICsgXCIuIFBlcmhhcHMgaXQncyBhbHJlYWR5IGJlZW4gdW5tZW1vaXplZC5cIik7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrLmFwcGx5KG51bGwsIGNhbGxiYWNrUGFyYW1zIHx8IFtdKTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGZpbmFsbHkgeyBkZWxldGUgbWVtb3NbbWVtb0lkXTsgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHVubWVtb2l6ZURvbU5vZGVBbmREZXNjZW5kYW50czogZnVuY3Rpb24gKGRvbU5vZGUsIGV4dHJhQ2FsbGJhY2tQYXJhbXNBcnJheSkge1xuICAgICAgICAgICAgdmFyIG1lbW9zID0gW107XG4gICAgICAgICAgICBmaW5kTWVtb05vZGVzKGRvbU5vZGUsIG1lbW9zKTtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBqID0gbWVtb3MubGVuZ3RoOyBpIDwgajsgaSsrKSB7XG4gICAgICAgICAgICAgICAgdmFyIG5vZGUgPSBtZW1vc1tpXS5kb21Ob2RlO1xuICAgICAgICAgICAgICAgIHZhciBjb21iaW5lZFBhcmFtcyA9IFtub2RlXTtcbiAgICAgICAgICAgICAgICBpZiAoZXh0cmFDYWxsYmFja1BhcmFtc0FycmF5KVxuICAgICAgICAgICAgICAgICAgICBrby51dGlscy5hcnJheVB1c2hBbGwoY29tYmluZWRQYXJhbXMsIGV4dHJhQ2FsbGJhY2tQYXJhbXNBcnJheSk7XG4gICAgICAgICAgICAgICAga28ubWVtb2l6YXRpb24udW5tZW1vaXplKG1lbW9zW2ldLm1lbW9JZCwgY29tYmluZWRQYXJhbXMpO1xuICAgICAgICAgICAgICAgIG5vZGUubm9kZVZhbHVlID0gXCJcIjsgLy8gTmV1dGVyIHRoaXMgbm9kZSBzbyB3ZSBkb24ndCB0cnkgdG8gdW5tZW1vaXplIGl0IGFnYWluXG4gICAgICAgICAgICAgICAgaWYgKG5vZGUucGFyZW50Tm9kZSlcbiAgICAgICAgICAgICAgICAgICAgbm9kZS5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKG5vZGUpOyAvLyBJZiBwb3NzaWJsZSwgZXJhc2UgaXQgdG90YWxseSAobm90IGFsd2F5cyBwb3NzaWJsZSAtIHNvbWVvbmUgZWxzZSBtaWdodCBqdXN0IGhvbGQgYSByZWZlcmVuY2UgdG8gaXQgdGhlbiBjYWxsIHVubWVtb2l6ZURvbU5vZGVBbmREZXNjZW5kYW50cyBhZ2FpbilcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBwYXJzZU1lbW9UZXh0OiBmdW5jdGlvbiAobWVtb1RleHQpIHtcbiAgICAgICAgICAgIHZhciBtYXRjaCA9IG1lbW9UZXh0Lm1hdGNoKC9eXFxba29fbWVtb1xcOiguKj8pXFxdJC8pO1xuICAgICAgICAgICAgcmV0dXJuIG1hdGNoID8gbWF0Y2hbMV0gOiBudWxsO1xuICAgICAgICB9XG4gICAgfTtcbn0pKCk7XG5cbmtvLmV4cG9ydFN5bWJvbCgnbWVtb2l6YXRpb24nLCBrby5tZW1vaXphdGlvbik7XG5rby5leHBvcnRTeW1ib2woJ21lbW9pemF0aW9uLm1lbW9pemUnLCBrby5tZW1vaXphdGlvbi5tZW1vaXplKTtcbmtvLmV4cG9ydFN5bWJvbCgnbWVtb2l6YXRpb24udW5tZW1vaXplJywga28ubWVtb2l6YXRpb24udW5tZW1vaXplKTtcbmtvLmV4cG9ydFN5bWJvbCgnbWVtb2l6YXRpb24ucGFyc2VNZW1vVGV4dCcsIGtvLm1lbW9pemF0aW9uLnBhcnNlTWVtb1RleHQpO1xua28uZXhwb3J0U3ltYm9sKCdtZW1vaXphdGlvbi51bm1lbW9pemVEb21Ob2RlQW5kRGVzY2VuZGFudHMnLCBrby5tZW1vaXphdGlvbi51bm1lbW9pemVEb21Ob2RlQW5kRGVzY2VuZGFudHMpO1xua28udGFza3MgPSAoZnVuY3Rpb24gKCkge1xuICAgIHZhciBzY2hlZHVsZXIsXG4gICAgICAgIHRhc2tRdWV1ZSA9IFtdLFxuICAgICAgICB0YXNrUXVldWVMZW5ndGggPSAwLFxuICAgICAgICBuZXh0SGFuZGxlID0gMSxcbiAgICAgICAgbmV4dEluZGV4VG9Qcm9jZXNzID0gMDtcblxuICAgIGlmICh3aW5kb3dbJ011dGF0aW9uT2JzZXJ2ZXInXSkge1xuICAgICAgICAvLyBDaHJvbWUgMjcrLCBGaXJlZm94IDE0KywgSUUgMTErLCBPcGVyYSAxNSssIFNhZmFyaSA2LjErXG4gICAgICAgIC8vIEZyb20gaHR0cHM6Ly9naXRodWIuY29tL3BldGthYW50b25vdi9ibHVlYmlyZCAqIENvcHlyaWdodCAoYykgMjAxNCBQZXRrYSBBbnRvbm92ICogTGljZW5zZTogTUlUXG4gICAgICAgIHNjaGVkdWxlciA9IChmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHZhciBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICAgICAgICAgbmV3IE11dGF0aW9uT2JzZXJ2ZXIoY2FsbGJhY2spLm9ic2VydmUoZGl2LCB7YXR0cmlidXRlczogdHJ1ZX0pO1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHsgZGl2LmNsYXNzTGlzdC50b2dnbGUoXCJmb29cIik7IH07XG4gICAgICAgIH0pKHNjaGVkdWxlZFByb2Nlc3MpO1xuICAgIH0gZWxzZSBpZiAoZG9jdW1lbnQgJiYgXCJvbnJlYWR5c3RhdGVjaGFuZ2VcIiBpbiBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpKSB7XG4gICAgICAgIC8vIElFIDYtMTBcbiAgICAgICAgLy8gRnJvbSBodHRwczovL2dpdGh1Yi5jb20vWXV6dUpTL3NldEltbWVkaWF0ZSAqIENvcHlyaWdodCAoYykgMjAxMiBCYXJuZXNhbmRub2JsZS5jb20sIGxsYywgRG9uYXZvbiBXZXN0LCBhbmQgRG9tZW5pYyBEZW5pY29sYSAqIExpY2Vuc2U6IE1JVFxuICAgICAgICBzY2hlZHVsZXIgPSBmdW5jdGlvbiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgIHZhciBzY3JpcHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2NyaXB0XCIpO1xuICAgICAgICAgICAgc2NyaXB0Lm9ucmVhZHlzdGF0ZWNoYW5nZSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBzY3JpcHQub25yZWFkeXN0YXRlY2hhbmdlID0gbnVsbDtcbiAgICAgICAgICAgICAgICBkb2N1bWVudC5kb2N1bWVudEVsZW1lbnQucmVtb3ZlQ2hpbGQoc2NyaXB0KTtcbiAgICAgICAgICAgICAgICBzY3JpcHQgPSBudWxsO1xuICAgICAgICAgICAgICAgIGNhbGxiYWNrKCk7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgZG9jdW1lbnQuZG9jdW1lbnRFbGVtZW50LmFwcGVuZENoaWxkKHNjcmlwdCk7XG4gICAgICAgIH07XG4gICAgfSBlbHNlIHtcbiAgICAgICAgc2NoZWR1bGVyID0gZnVuY3Rpb24gKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICBzZXRUaW1lb3V0KGNhbGxiYWNrLCAwKTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwcm9jZXNzVGFza3MoKSB7XG4gICAgICAgIGlmICh0YXNrUXVldWVMZW5ndGgpIHtcbiAgICAgICAgICAgIC8vIEVhY2ggbWFyayByZXByZXNlbnRzIHRoZSBlbmQgb2YgYSBsb2dpY2FsIGdyb3VwIG9mIHRhc2tzIGFuZCB0aGUgbnVtYmVyIG9mIHRoZXNlIGdyb3VwcyBpc1xuICAgICAgICAgICAgLy8gbGltaXRlZCB0byBwcmV2ZW50IHVuY2hlY2tlZCByZWN1cnNpb24uXG4gICAgICAgICAgICB2YXIgbWFyayA9IHRhc2tRdWV1ZUxlbmd0aCwgY291bnRNYXJrcyA9IDA7XG5cbiAgICAgICAgICAgIC8vIG5leHRJbmRleFRvUHJvY2VzcyBrZWVwcyB0cmFjayBvZiB3aGVyZSB3ZSBhcmUgaW4gdGhlIHF1ZXVlOyBwcm9jZXNzVGFza3MgY2FuIGJlIGNhbGxlZCByZWN1cnNpdmVseSB3aXRob3V0IGlzc3VlXG4gICAgICAgICAgICBmb3IgKHZhciB0YXNrOyBuZXh0SW5kZXhUb1Byb2Nlc3MgPCB0YXNrUXVldWVMZW5ndGg7ICkge1xuICAgICAgICAgICAgICAgIGlmICh0YXNrID0gdGFza1F1ZXVlW25leHRJbmRleFRvUHJvY2VzcysrXSkge1xuICAgICAgICAgICAgICAgICAgICBpZiAobmV4dEluZGV4VG9Qcm9jZXNzID4gbWFyaykge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKCsrY291bnRNYXJrcyA+PSA1MDAwKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV4dEluZGV4VG9Qcm9jZXNzID0gdGFza1F1ZXVlTGVuZ3RoOyAgIC8vIHNraXAgYWxsIHRhc2tzIHJlbWFpbmluZyBpbiB0aGUgcXVldWUgc2luY2UgYW55IG9mIHRoZW0gY291bGQgYmUgY2F1c2luZyB0aGUgcmVjdXJzaW9uXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAga28udXRpbHMuZGVmZXJFcnJvcihFcnJvcihcIidUb28gbXVjaCByZWN1cnNpb24nIGFmdGVyIHByb2Nlc3NpbmcgXCIgKyBjb3VudE1hcmtzICsgXCIgdGFzayBncm91cHMuXCIpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgICAgIG1hcmsgPSB0YXNrUXVldWVMZW5ndGg7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRhc2soKTtcbiAgICAgICAgICAgICAgICAgICAgfSBjYXRjaCAoZXgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtvLnV0aWxzLmRlZmVyRXJyb3IoZXgpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gc2NoZWR1bGVkUHJvY2VzcygpIHtcbiAgICAgICAgcHJvY2Vzc1Rhc2tzKCk7XG5cbiAgICAgICAgLy8gUmVzZXQgdGhlIHF1ZXVlXG4gICAgICAgIG5leHRJbmRleFRvUHJvY2VzcyA9IHRhc2tRdWV1ZUxlbmd0aCA9IHRhc2tRdWV1ZS5sZW5ndGggPSAwO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHNjaGVkdWxlVGFza1Byb2Nlc3NpbmcoKSB7XG4gICAgICAgIGtvLnRhc2tzWydzY2hlZHVsZXInXShzY2hlZHVsZWRQcm9jZXNzKTtcbiAgICB9XG5cbiAgICB2YXIgdGFza3MgPSB7XG4gICAgICAgICdzY2hlZHVsZXInOiBzY2hlZHVsZXIsICAgICAvLyBBbGxvdyBvdmVycmlkaW5nIHRoZSBzY2hlZHVsZXJcblxuICAgICAgICBzY2hlZHVsZTogZnVuY3Rpb24gKGZ1bmMpIHtcbiAgICAgICAgICAgIGlmICghdGFza1F1ZXVlTGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgc2NoZWR1bGVUYXNrUHJvY2Vzc2luZygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0YXNrUXVldWVbdGFza1F1ZXVlTGVuZ3RoKytdID0gZnVuYztcbiAgICAgICAgICAgIHJldHVybiBuZXh0SGFuZGxlKys7XG4gICAgICAgIH0sXG5cbiAgICAgICAgY2FuY2VsOiBmdW5jdGlvbiAoaGFuZGxlKSB7XG4gICAgICAgICAgICB2YXIgaW5kZXggPSBoYW5kbGUgLSAobmV4dEhhbmRsZSAtIHRhc2tRdWV1ZUxlbmd0aCk7XG4gICAgICAgICAgICBpZiAoaW5kZXggPj0gbmV4dEluZGV4VG9Qcm9jZXNzICYmIGluZGV4IDwgdGFza1F1ZXVlTGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGFza1F1ZXVlW2luZGV4XSA9IG51bGw7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgLy8gRm9yIHRlc3Rpbmcgb25seTogcmVzZXQgdGhlIHF1ZXVlIGFuZCByZXR1cm4gdGhlIHByZXZpb3VzIHF1ZXVlIGxlbmd0aFxuICAgICAgICAncmVzZXRGb3JUZXN0aW5nJzogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIGxlbmd0aCA9IHRhc2tRdWV1ZUxlbmd0aCAtIG5leHRJbmRleFRvUHJvY2VzcztcbiAgICAgICAgICAgIG5leHRJbmRleFRvUHJvY2VzcyA9IHRhc2tRdWV1ZUxlbmd0aCA9IHRhc2tRdWV1ZS5sZW5ndGggPSAwO1xuICAgICAgICAgICAgcmV0dXJuIGxlbmd0aDtcbiAgICAgICAgfSxcblxuICAgICAgICBydW5FYXJseTogcHJvY2Vzc1Rhc2tzXG4gICAgfTtcblxuICAgIHJldHVybiB0YXNrcztcbn0pKCk7XG5cbmtvLmV4cG9ydFN5bWJvbCgndGFza3MnLCBrby50YXNrcyk7XG5rby5leHBvcnRTeW1ib2woJ3Rhc2tzLnNjaGVkdWxlJywga28udGFza3Muc2NoZWR1bGUpO1xuLy9rby5leHBvcnRTeW1ib2woJ3Rhc2tzLmNhbmNlbCcsIGtvLnRhc2tzLmNhbmNlbCk7ICBcImNhbmNlbFwiIGlzbid0IG1pbmlmaWVkXG5rby5leHBvcnRTeW1ib2woJ3Rhc2tzLnJ1bkVhcmx5Jywga28udGFza3MucnVuRWFybHkpO1xua28uZXh0ZW5kZXJzID0ge1xuICAgICd0aHJvdHRsZSc6IGZ1bmN0aW9uKHRhcmdldCwgdGltZW91dCkge1xuICAgICAgICAvLyBUaHJvdHRsaW5nIG1lYW5zIHR3byB0aGluZ3M6XG5cbiAgICAgICAgLy8gKDEpIEZvciBkZXBlbmRlbnQgb2JzZXJ2YWJsZXMsIHdlIHRocm90dGxlICpldmFsdWF0aW9ucyogc28gdGhhdCwgbm8gbWF0dGVyIGhvdyBmYXN0IGl0cyBkZXBlbmRlbmNpZXNcbiAgICAgICAgLy8gICAgIG5vdGlmeSB1cGRhdGVzLCB0aGUgdGFyZ2V0IGRvZXNuJ3QgcmUtZXZhbHVhdGUgKGFuZCBoZW5jZSBkb2Vzbid0IG5vdGlmeSkgZmFzdGVyIHRoYW4gYSBjZXJ0YWluIHJhdGVcbiAgICAgICAgdGFyZ2V0Wyd0aHJvdHRsZUV2YWx1YXRpb24nXSA9IHRpbWVvdXQ7XG5cbiAgICAgICAgLy8gKDIpIEZvciB3cml0YWJsZSB0YXJnZXRzIChvYnNlcnZhYmxlcywgb3Igd3JpdGFibGUgZGVwZW5kZW50IG9ic2VydmFibGVzKSwgd2UgdGhyb3R0bGUgKndyaXRlcypcbiAgICAgICAgLy8gICAgIHNvIHRoZSB0YXJnZXQgY2Fubm90IGNoYW5nZSB2YWx1ZSBzeW5jaHJvbm91c2x5IG9yIGZhc3RlciB0aGFuIGEgY2VydGFpbiByYXRlXG4gICAgICAgIHZhciB3cml0ZVRpbWVvdXRJbnN0YW5jZSA9IG51bGw7XG4gICAgICAgIHJldHVybiBrby5kZXBlbmRlbnRPYnNlcnZhYmxlKHtcbiAgICAgICAgICAgICdyZWFkJzogdGFyZ2V0LFxuICAgICAgICAgICAgJ3dyaXRlJzogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICAgICAgICBjbGVhclRpbWVvdXQod3JpdGVUaW1lb3V0SW5zdGFuY2UpO1xuICAgICAgICAgICAgICAgIHdyaXRlVGltZW91dEluc3RhbmNlID0ga28udXRpbHMuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0KHZhbHVlKTtcbiAgICAgICAgICAgICAgICB9LCB0aW1lb3V0KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgICdyYXRlTGltaXQnOiBmdW5jdGlvbih0YXJnZXQsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIHRpbWVvdXQsIG1ldGhvZCwgbGltaXRGdW5jdGlvbjtcblxuICAgICAgICBpZiAodHlwZW9mIG9wdGlvbnMgPT0gJ251bWJlcicpIHtcbiAgICAgICAgICAgIHRpbWVvdXQgPSBvcHRpb25zO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGltZW91dCA9IG9wdGlvbnNbJ3RpbWVvdXQnXTtcbiAgICAgICAgICAgIG1ldGhvZCA9IG9wdGlvbnNbJ21ldGhvZCddO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gcmF0ZUxpbWl0IHN1cGVyc2VkZXMgZGVmZXJyZWQgdXBkYXRlc1xuICAgICAgICB0YXJnZXQuX2RlZmVyVXBkYXRlcyA9IGZhbHNlO1xuXG4gICAgICAgIGxpbWl0RnVuY3Rpb24gPSBtZXRob2QgPT0gJ25vdGlmeVdoZW5DaGFuZ2VzU3RvcCcgPyAgZGVib3VuY2UgOiB0aHJvdHRsZTtcbiAgICAgICAgdGFyZ2V0LmxpbWl0KGZ1bmN0aW9uKGNhbGxiYWNrKSB7XG4gICAgICAgICAgICByZXR1cm4gbGltaXRGdW5jdGlvbihjYWxsYmFjaywgdGltZW91dCk7XG4gICAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAnZGVmZXJyZWQnOiBmdW5jdGlvbih0YXJnZXQsIG9wdGlvbnMpIHtcbiAgICAgICAgaWYgKG9wdGlvbnMgIT09IHRydWUpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIFxcJ2RlZmVycmVkXFwnIGV4dGVuZGVyIG9ubHkgYWNjZXB0cyB0aGUgdmFsdWUgXFwndHJ1ZVxcJywgYmVjYXVzZSBpdCBpcyBub3Qgc3VwcG9ydGVkIHRvIHR1cm4gZGVmZXJyYWwgb2ZmIG9uY2UgZW5hYmxlZC4nKVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKCF0YXJnZXQuX2RlZmVyVXBkYXRlcykge1xuICAgICAgICAgICAgdGFyZ2V0Ll9kZWZlclVwZGF0ZXMgPSB0cnVlO1xuICAgICAgICAgICAgdGFyZ2V0LmxpbWl0KGZ1bmN0aW9uIChjYWxsYmFjaykge1xuICAgICAgICAgICAgICAgIHZhciBoYW5kbGU7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAga28udGFza3MuY2FuY2VsKGhhbmRsZSk7XG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZSA9IGtvLnRhc2tzLnNjaGVkdWxlKGNhbGxiYWNrKTtcbiAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Wydub3RpZnlTdWJzY3JpYmVycyddKHVuZGVmaW5lZCwgJ2RpcnR5Jyk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgICdub3RpZnknOiBmdW5jdGlvbih0YXJnZXQsIG5vdGlmeVdoZW4pIHtcbiAgICAgICAgdGFyZ2V0W1wiZXF1YWxpdHlDb21wYXJlclwiXSA9IG5vdGlmeVdoZW4gPT0gXCJhbHdheXNcIiA/XG4gICAgICAgICAgICBudWxsIDogIC8vIG51bGwgZXF1YWxpdHlDb21wYXJlciBtZWFucyB0byBhbHdheXMgbm90aWZ5XG4gICAgICAgICAgICB2YWx1ZXNBcmVQcmltaXRpdmVBbmRFcXVhbDtcbiAgICB9XG59O1xuXG52YXIgcHJpbWl0aXZlVHlwZXMgPSB7ICd1bmRlZmluZWQnOjEsICdib29sZWFuJzoxLCAnbnVtYmVyJzoxLCAnc3RyaW5nJzoxIH07XG5mdW5jdGlvbiB2YWx1ZXNBcmVQcmltaXRpdmVBbmRFcXVhbChhLCBiKSB7XG4gICAgdmFyIG9sZFZhbHVlSXNQcmltaXRpdmUgPSAoYSA9PT0gbnVsbCkgfHwgKHR5cGVvZihhKSBpbiBwcmltaXRpdmVUeXBlcyk7XG4gICAgcmV0dXJuIG9sZFZhbHVlSXNQcmltaXRpdmUgPyAoYSA9PT0gYikgOiBmYWxzZTtcbn1cblxuZnVuY3Rpb24gdGhyb3R0bGUoY2FsbGJhY2ssIHRpbWVvdXQpIHtcbiAgICB2YXIgdGltZW91dEluc3RhbmNlO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGlmICghdGltZW91dEluc3RhbmNlKSB7XG4gICAgICAgICAgICB0aW1lb3V0SW5zdGFuY2UgPSBrby51dGlscy5zZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB0aW1lb3V0SW5zdGFuY2UgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2soKTtcbiAgICAgICAgICAgIH0sIHRpbWVvdXQpO1xuICAgICAgICB9XG4gICAgfTtcbn1cblxuZnVuY3Rpb24gZGVib3VuY2UoY2FsbGJhY2ssIHRpbWVvdXQpIHtcbiAgICB2YXIgdGltZW91dEluc3RhbmNlO1xuICAgIHJldHVybiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SW5zdGFuY2UpO1xuICAgICAgICB0aW1lb3V0SW5zdGFuY2UgPSBrby51dGlscy5zZXRUaW1lb3V0KGNhbGxiYWNrLCB0aW1lb3V0KTtcbiAgICB9O1xufVxuXG5mdW5jdGlvbiBhcHBseUV4dGVuZGVycyhyZXF1ZXN0ZWRFeHRlbmRlcnMpIHtcbiAgICB2YXIgdGFyZ2V0ID0gdGhpcztcbiAgICBpZiAocmVxdWVzdGVkRXh0ZW5kZXJzKSB7XG4gICAgICAgIGtvLnV0aWxzLm9iamVjdEZvckVhY2gocmVxdWVzdGVkRXh0ZW5kZXJzLCBmdW5jdGlvbihrZXksIHZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgZXh0ZW5kZXJIYW5kbGVyID0ga28uZXh0ZW5kZXJzW2tleV07XG4gICAgICAgICAgICBpZiAodHlwZW9mIGV4dGVuZGVySGFuZGxlciA9PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0ID0gZXh0ZW5kZXJIYW5kbGVyKHRhcmdldCwgdmFsdWUpIHx8IHRhcmdldDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIHJldHVybiB0YXJnZXQ7XG59XG5cbmtvLmV4cG9ydFN5bWJvbCgnZXh0ZW5kZXJzJywga28uZXh0ZW5kZXJzKTtcblxua28uc3Vic2NyaXB0aW9uID0gZnVuY3Rpb24gKHRhcmdldCwgY2FsbGJhY2ssIGRpc3Bvc2VDYWxsYmFjaykge1xuICAgIHRoaXMuX3RhcmdldCA9IHRhcmdldDtcbiAgICB0aGlzLmNhbGxiYWNrID0gY2FsbGJhY2s7XG4gICAgdGhpcy5kaXNwb3NlQ2FsbGJhY2sgPSBkaXNwb3NlQ2FsbGJhY2s7XG4gICAgdGhpcy5pc0Rpc3Bvc2VkID0gZmFsc2U7XG4gICAga28uZXhwb3J0UHJvcGVydHkodGhpcywgJ2Rpc3Bvc2UnLCB0aGlzLmRpc3Bvc2UpO1xufTtcbmtvLnN1YnNjcmlwdGlvbi5wcm90b3R5cGUuZGlzcG9zZSA9IGZ1bmN0aW9uICgpIHtcbiAgICB0aGlzLmlzRGlzcG9zZWQgPSB0cnVlO1xuICAgIHRoaXMuZGlzcG9zZUNhbGxiYWNrKCk7XG59O1xuXG5rby5zdWJzY3JpYmFibGUgPSBmdW5jdGlvbiAoKSB7XG4gICAga28udXRpbHMuc2V0UHJvdG90eXBlT2ZPckV4dGVuZCh0aGlzLCBrb19zdWJzY3JpYmFibGVfZm4pO1xuICAgIGtvX3N1YnNjcmliYWJsZV9mbi5pbml0KHRoaXMpO1xufVxuXG52YXIgZGVmYXVsdEV2ZW50ID0gXCJjaGFuZ2VcIjtcblxuLy8gTW92ZWQgb3V0IG9mIFwibGltaXRcIiB0byBhdm9pZCB0aGUgZXh0cmEgY2xvc3VyZVxuZnVuY3Rpb24gbGltaXROb3RpZnlTdWJzY3JpYmVycyh2YWx1ZSwgZXZlbnQpIHtcbiAgICBpZiAoIWV2ZW50IHx8IGV2ZW50ID09PSBkZWZhdWx0RXZlbnQpIHtcbiAgICAgICAgdGhpcy5fbGltaXRDaGFuZ2UodmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoZXZlbnQgPT09ICdiZWZvcmVDaGFuZ2UnKSB7XG4gICAgICAgIHRoaXMuX2xpbWl0QmVmb3JlQ2hhbmdlKHZhbHVlKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLl9vcmlnTm90aWZ5U3Vic2NyaWJlcnModmFsdWUsIGV2ZW50KTtcbiAgICB9XG59XG5cbnZhciBrb19zdWJzY3JpYmFibGVfZm4gPSB7XG4gICAgaW5pdDogZnVuY3Rpb24oaW5zdGFuY2UpIHtcbiAgICAgICAgaW5zdGFuY2UuX3N1YnNjcmlwdGlvbnMgPSB7fTtcbiAgICAgICAgaW5zdGFuY2UuX3ZlcnNpb25OdW1iZXIgPSAxO1xuICAgIH0sXG5cbiAgICBzdWJzY3JpYmU6IGZ1bmN0aW9uIChjYWxsYmFjaywgY2FsbGJhY2tUYXJnZXQsIGV2ZW50KSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcblxuICAgICAgICBldmVudCA9IGV2ZW50IHx8IGRlZmF1bHRFdmVudDtcbiAgICAgICAgdmFyIGJvdW5kQ2FsbGJhY2sgPSBjYWxsYmFja1RhcmdldCA/IGNhbGxiYWNrLmJpbmQoY2FsbGJhY2tUYXJnZXQpIDogY2FsbGJhY2s7XG5cbiAgICAgICAgdmFyIHN1YnNjcmlwdGlvbiA9IG5ldyBrby5zdWJzY3JpcHRpb24oc2VsZiwgYm91bmRDYWxsYmFjaywgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAga28udXRpbHMuYXJyYXlSZW1vdmVJdGVtKHNlbGYuX3N1YnNjcmlwdGlvbnNbZXZlbnRdLCBzdWJzY3JpcHRpb24pO1xuICAgICAgICAgICAgaWYgKHNlbGYuYWZ0ZXJTdWJzY3JpcHRpb25SZW1vdmUpXG4gICAgICAgICAgICAgICAgc2VsZi5hZnRlclN1YnNjcmlwdGlvblJlbW92ZShldmVudCk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChzZWxmLmJlZm9yZVN1YnNjcmlwdGlvbkFkZClcbiAgICAgICAgICAgIHNlbGYuYmVmb3JlU3Vic2NyaXB0aW9uQWRkKGV2ZW50KTtcblxuICAgICAgICBpZiAoIXNlbGYuX3N1YnNjcmlwdGlvbnNbZXZlbnRdKVxuICAgICAgICAgICAgc2VsZi5fc3Vic2NyaXB0aW9uc1tldmVudF0gPSBbXTtcbiAgICAgICAgc2VsZi5fc3Vic2NyaXB0aW9uc1tldmVudF0ucHVzaChzdWJzY3JpcHRpb24pO1xuXG4gICAgICAgIHJldHVybiBzdWJzY3JpcHRpb247XG4gICAgfSxcblxuICAgIFwibm90aWZ5U3Vic2NyaWJlcnNcIjogZnVuY3Rpb24gKHZhbHVlVG9Ob3RpZnksIGV2ZW50KSB7XG4gICAgICAgIGV2ZW50ID0gZXZlbnQgfHwgZGVmYXVsdEV2ZW50O1xuICAgICAgICBpZiAoZXZlbnQgPT09IGRlZmF1bHRFdmVudCkge1xuICAgICAgICAgICAgdGhpcy51cGRhdGVWZXJzaW9uKCk7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKHRoaXMuaGFzU3Vic2NyaXB0aW9uc0ZvckV2ZW50KGV2ZW50KSkge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBrby5kZXBlbmRlbmN5RGV0ZWN0aW9uLmJlZ2luKCk7IC8vIEJlZ2luIHN1cHByZXNzaW5nIGRlcGVuZGVuY3kgZGV0ZWN0aW9uIChieSBzZXR0aW5nIHRoZSB0b3AgZnJhbWUgdG8gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgIGZvciAodmFyIGEgPSB0aGlzLl9zdWJzY3JpcHRpb25zW2V2ZW50XS5zbGljZSgwKSwgaSA9IDAsIHN1YnNjcmlwdGlvbjsgc3Vic2NyaXB0aW9uID0gYVtpXTsgKytpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEluIGNhc2UgYSBzdWJzY3JpcHRpb24gd2FzIGRpc3Bvc2VkIGR1cmluZyB0aGUgYXJyYXlGb3JFYWNoIGN5Y2xlLCBjaGVja1xuICAgICAgICAgICAgICAgICAgICAvLyBmb3IgaXNEaXNwb3NlZCBvbiBlYWNoIHN1YnNjcmlwdGlvbiBiZWZvcmUgaW52b2tpbmcgaXRzIGNhbGxiYWNrXG4gICAgICAgICAgICAgICAgICAgIGlmICghc3Vic2NyaXB0aW9uLmlzRGlzcG9zZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uY2FsbGJhY2sodmFsdWVUb05vdGlmeSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgICBrby5kZXBlbmRlbmN5RGV0ZWN0aW9uLmVuZCgpOyAvLyBFbmQgc3VwcHJlc3NpbmcgZGVwZW5kZW5jeSBkZXRlY3Rpb25cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBnZXRWZXJzaW9uOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl92ZXJzaW9uTnVtYmVyO1xuICAgIH0sXG5cbiAgICBoYXNDaGFuZ2VkOiBmdW5jdGlvbiAodmVyc2lvblRvQ2hlY2spIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuZ2V0VmVyc2lvbigpICE9PSB2ZXJzaW9uVG9DaGVjaztcbiAgICB9LFxuXG4gICAgdXBkYXRlVmVyc2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICArK3RoaXMuX3ZlcnNpb25OdW1iZXI7XG4gICAgfSxcblxuICAgIGxpbWl0OiBmdW5jdGlvbihsaW1pdEZ1bmN0aW9uKSB7XG4gICAgICAgIHZhciBzZWxmID0gdGhpcywgc2VsZklzT2JzZXJ2YWJsZSA9IGtvLmlzT2JzZXJ2YWJsZShzZWxmKSxcbiAgICAgICAgICAgIGlnbm9yZUJlZm9yZUNoYW5nZSwgcHJldmlvdXNWYWx1ZSwgcGVuZGluZ1ZhbHVlLCBiZWZvcmVDaGFuZ2UgPSAnYmVmb3JlQ2hhbmdlJztcblxuICAgICAgICBpZiAoIXNlbGYuX29yaWdOb3RpZnlTdWJzY3JpYmVycykge1xuICAgICAgICAgICAgc2VsZi5fb3JpZ05vdGlmeVN1YnNjcmliZXJzID0gc2VsZltcIm5vdGlmeVN1YnNjcmliZXJzXCJdO1xuICAgICAgICAgICAgc2VsZltcIm5vdGlmeVN1YnNjcmliZXJzXCJdID0gbGltaXROb3RpZnlTdWJzY3JpYmVycztcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBmaW5pc2ggPSBsaW1pdEZ1bmN0aW9uKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi5fbm90aWZpY2F0aW9uSXNQZW5kaW5nID0gZmFsc2U7XG5cbiAgICAgICAgICAgIC8vIElmIGFuIG9ic2VydmFibGUgcHJvdmlkZWQgYSByZWZlcmVuY2UgdG8gaXRzZWxmLCBhY2Nlc3MgaXQgdG8gZ2V0IHRoZSBsYXRlc3QgdmFsdWUuXG4gICAgICAgICAgICAvLyBUaGlzIGFsbG93cyBjb21wdXRlZCBvYnNlcnZhYmxlcyB0byBkZWxheSBjYWxjdWxhdGluZyB0aGVpciB2YWx1ZSB1bnRpbCBuZWVkZWQuXG4gICAgICAgICAgICBpZiAoc2VsZklzT2JzZXJ2YWJsZSAmJiBwZW5kaW5nVmFsdWUgPT09IHNlbGYpIHtcbiAgICAgICAgICAgICAgICBwZW5kaW5nVmFsdWUgPSBzZWxmKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZ25vcmVCZWZvcmVDaGFuZ2UgPSBmYWxzZTtcbiAgICAgICAgICAgIGlmIChzZWxmLmlzRGlmZmVyZW50KHByZXZpb3VzVmFsdWUsIHBlbmRpbmdWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICBzZWxmLl9vcmlnTm90aWZ5U3Vic2NyaWJlcnMocHJldmlvdXNWYWx1ZSA9IHBlbmRpbmdWYWx1ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHNlbGYuX2xpbWl0Q2hhbmdlID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgICAgIHNlbGYuX25vdGlmaWNhdGlvbklzUGVuZGluZyA9IGlnbm9yZUJlZm9yZUNoYW5nZSA9IHRydWU7XG4gICAgICAgICAgICBwZW5kaW5nVmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIGZpbmlzaCgpO1xuICAgICAgICB9O1xuICAgICAgICBzZWxmLl9saW1pdEJlZm9yZUNoYW5nZSA9IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgICAgICBpZiAoIWlnbm9yZUJlZm9yZUNoYW5nZSkge1xuICAgICAgICAgICAgICAgIHByZXZpb3VzVmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICBzZWxmLl9vcmlnTm90aWZ5U3Vic2NyaWJlcnModmFsdWUsIGJlZm9yZUNoYW5nZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG4gICAgfSxcblxuICAgIGhhc1N1YnNjcmlwdGlvbnNGb3JFdmVudDogZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N1YnNjcmlwdGlvbnNbZXZlbnRdICYmIHRoaXMuX3N1YnNjcmlwdGlvbnNbZXZlbnRdLmxlbmd0aDtcbiAgICB9LFxuXG4gICAgZ2V0U3Vic2NyaXB0aW9uc0NvdW50OiBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgaWYgKGV2ZW50KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc3Vic2NyaXB0aW9uc1tldmVudF0gJiYgdGhpcy5fc3Vic2NyaXB0aW9uc1tldmVudF0ubGVuZ3RoIHx8IDA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgdG90YWwgPSAwO1xuICAgICAgICAgICAga28udXRpbHMub2JqZWN0Rm9yRWFjaCh0aGlzLl9zdWJzY3JpcHRpb25zLCBmdW5jdGlvbihldmVudE5hbWUsIHN1YnNjcmlwdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBpZiAoZXZlbnROYW1lICE9PSAnZGlydHknKVxuICAgICAgICAgICAgICAgICAgICB0b3RhbCArPSBzdWJzY3JpcHRpb25zLmxlbmd0aDtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgcmV0dXJuIHRvdGFsO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIGlzRGlmZmVyZW50OiBmdW5jdGlvbihvbGRWYWx1ZSwgbmV3VmFsdWUpIHtcbiAgICAgICAgcmV0dXJuICF0aGlzWydlcXVhbGl0eUNvbXBhcmVyJ10gfHwgIXRoaXNbJ2VxdWFsaXR5Q29tcGFyZXInXShvbGRWYWx1ZSwgbmV3VmFsdWUpO1xuICAgIH0sXG5cbiAgICBleHRlbmQ6IGFwcGx5RXh0ZW5kZXJzXG59O1xuXG5rby5leHBvcnRQcm9wZXJ0eShrb19zdWJzY3JpYmFibGVfZm4sICdzdWJzY3JpYmUnLCBrb19zdWJzY3JpYmFibGVfZm4uc3Vic2NyaWJlKTtcbmtvLmV4cG9ydFByb3BlcnR5KGtvX3N1YnNjcmliYWJsZV9mbiwgJ2V4dGVuZCcsIGtvX3N1YnNjcmliYWJsZV9mbi5leHRlbmQpO1xua28uZXhwb3J0UHJvcGVydHkoa29fc3Vic2NyaWJhYmxlX2ZuLCAnZ2V0U3Vic2NyaXB0aW9uc0NvdW50Jywga29fc3Vic2NyaWJhYmxlX2ZuLmdldFN1YnNjcmlwdGlvbnNDb3VudCk7XG5cbi8vIEZvciBicm93c2VycyB0aGF0IHN1cHBvcnQgcHJvdG8gYXNzaWdubWVudCwgd2Ugb3ZlcndyaXRlIHRoZSBwcm90b3R5cGUgb2YgZWFjaFxuLy8gb2JzZXJ2YWJsZSBpbnN0YW5jZS4gU2luY2Ugb2JzZXJ2YWJsZXMgYXJlIGZ1bmN0aW9ucywgd2UgbmVlZCBGdW5jdGlvbi5wcm90b3R5cGVcbi8vIHRvIHN0aWxsIGJlIGluIHRoZSBwcm90b3R5cGUgY2hhaW4uXG5pZiAoa28udXRpbHMuY2FuU2V0UHJvdG90eXBlKSB7XG4gICAga28udXRpbHMuc2V0UHJvdG90eXBlT2Yoa29fc3Vic2NyaWJhYmxlX2ZuLCBGdW5jdGlvbi5wcm90b3R5cGUpO1xufVxuXG5rby5zdWJzY3JpYmFibGVbJ2ZuJ10gPSBrb19zdWJzY3JpYmFibGVfZm47XG5cblxua28uaXNTdWJzY3JpYmFibGUgPSBmdW5jdGlvbiAoaW5zdGFuY2UpIHtcbiAgICByZXR1cm4gaW5zdGFuY2UgIT0gbnVsbCAmJiB0eXBlb2YgaW5zdGFuY2Uuc3Vic2NyaWJlID09IFwiZnVuY3Rpb25cIiAmJiB0eXBlb2YgaW5zdGFuY2VbXCJub3RpZnlTdWJzY3JpYmVyc1wiXSA9PSBcImZ1bmN0aW9uXCI7XG59O1xuXG5rby5leHBvcnRTeW1ib2woJ3N1YnNjcmliYWJsZScsIGtvLnN1YnNjcmliYWJsZSk7XG5rby5leHBvcnRTeW1ib2woJ2lzU3Vic2NyaWJhYmxlJywga28uaXNTdWJzY3JpYmFibGUpO1xuXG5rby5jb21wdXRlZENvbnRleHQgPSBrby5kZXBlbmRlbmN5RGV0ZWN0aW9uID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgb3V0ZXJGcmFtZXMgPSBbXSxcbiAgICAgICAgY3VycmVudEZyYW1lLFxuICAgICAgICBsYXN0SWQgPSAwO1xuXG4gICAgLy8gUmV0dXJuIGEgdW5pcXVlIElEIHRoYXQgY2FuIGJlIGFzc2lnbmVkIHRvIGFuIG9ic2VydmFibGUgZm9yIGRlcGVuZGVuY3kgdHJhY2tpbmcuXG4gICAgLy8gVGhlb3JldGljYWxseSwgeW91IGNvdWxkIGV2ZW50dWFsbHkgb3ZlcmZsb3cgdGhlIG51bWJlciBzdG9yYWdlIHNpemUsIHJlc3VsdGluZ1xuICAgIC8vIGluIGR1cGxpY2F0ZSBJRHMuIEJ1dCBpbiBKYXZhU2NyaXB0LCB0aGUgbGFyZ2VzdCBleGFjdCBpbnRlZ3JhbCB2YWx1ZSBpcyAyXjUzXG4gICAgLy8gb3IgOSwwMDcsMTk5LDI1NCw3NDAsOTkyLiBJZiB5b3UgY3JlYXRlZCAxLDAwMCwwMDAgSURzIHBlciBzZWNvbmQsIGl0IHdvdWxkXG4gICAgLy8gdGFrZSBvdmVyIDI4NSB5ZWFycyB0byByZWFjaCB0aGF0IG51bWJlci5cbiAgICAvLyBSZWZlcmVuY2UgaHR0cDovL2Jsb2cudmpldXguY29tLzIwMTAvamF2YXNjcmlwdC9qYXZhc2NyaXB0LW1heF9pbnQtbnVtYmVyLWxpbWl0cy5odG1sXG4gICAgZnVuY3Rpb24gZ2V0SWQoKSB7XG4gICAgICAgIHJldHVybiArK2xhc3RJZDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBiZWdpbihvcHRpb25zKSB7XG4gICAgICAgIG91dGVyRnJhbWVzLnB1c2goY3VycmVudEZyYW1lKTtcbiAgICAgICAgY3VycmVudEZyYW1lID0gb3B0aW9ucztcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBlbmQoKSB7XG4gICAgICAgIGN1cnJlbnRGcmFtZSA9IG91dGVyRnJhbWVzLnBvcCgpO1xuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAgIGJlZ2luOiBiZWdpbixcblxuICAgICAgICBlbmQ6IGVuZCxcblxuICAgICAgICByZWdpc3RlckRlcGVuZGVuY3k6IGZ1bmN0aW9uIChzdWJzY3JpYmFibGUpIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50RnJhbWUpIHtcbiAgICAgICAgICAgICAgICBpZiAoIWtvLmlzU3Vic2NyaWJhYmxlKHN1YnNjcmliYWJsZSkpXG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIk9ubHkgc3Vic2NyaWJhYmxlIHRoaW5ncyBjYW4gYWN0IGFzIGRlcGVuZGVuY2llc1wiKTtcbiAgICAgICAgICAgICAgICBjdXJyZW50RnJhbWUuY2FsbGJhY2suY2FsbChjdXJyZW50RnJhbWUuY2FsbGJhY2tUYXJnZXQsIHN1YnNjcmliYWJsZSwgc3Vic2NyaWJhYmxlLl9pZCB8fCAoc3Vic2NyaWJhYmxlLl9pZCA9IGdldElkKCkpKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBpZ25vcmU6IGZ1bmN0aW9uIChjYWxsYmFjaywgY2FsbGJhY2tUYXJnZXQsIGNhbGxiYWNrQXJncykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICBiZWdpbigpO1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjay5hcHBseShjYWxsYmFja1RhcmdldCwgY2FsbGJhY2tBcmdzIHx8IFtdKTtcbiAgICAgICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICAgICAgZW5kKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgZ2V0RGVwZW5kZW5jaWVzQ291bnQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGlmIChjdXJyZW50RnJhbWUpXG4gICAgICAgICAgICAgICAgcmV0dXJuIGN1cnJlbnRGcmFtZS5jb21wdXRlZC5nZXREZXBlbmRlbmNpZXNDb3VudCgpO1xuICAgICAgICB9LFxuXG4gICAgICAgIGlzSW5pdGlhbDogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudEZyYW1lKVxuICAgICAgICAgICAgICAgIHJldHVybiBjdXJyZW50RnJhbWUuaXNJbml0aWFsO1xuICAgICAgICB9XG4gICAgfTtcbn0pKCk7XG5cbmtvLmV4cG9ydFN5bWJvbCgnY29tcHV0ZWRDb250ZXh0Jywga28uY29tcHV0ZWRDb250ZXh0KTtcbmtvLmV4cG9ydFN5bWJvbCgnY29tcHV0ZWRDb250ZXh0LmdldERlcGVuZGVuY2llc0NvdW50Jywga28uY29tcHV0ZWRDb250ZXh0LmdldERlcGVuZGVuY2llc0NvdW50KTtcbmtvLmV4cG9ydFN5bWJvbCgnY29tcHV0ZWRDb250ZXh0LmlzSW5pdGlhbCcsIGtvLmNvbXB1dGVkQ29udGV4dC5pc0luaXRpYWwpO1xuXG5rby5leHBvcnRTeW1ib2woJ2lnbm9yZURlcGVuZGVuY2llcycsIGtvLmlnbm9yZURlcGVuZGVuY2llcyA9IGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlKTtcbnZhciBvYnNlcnZhYmxlTGF0ZXN0VmFsdWUgPSBrby51dGlscy5jcmVhdGVTeW1ib2xPclN0cmluZygnX2xhdGVzdFZhbHVlJyk7XG5cbmtvLm9ic2VydmFibGUgPSBmdW5jdGlvbiAoaW5pdGlhbFZhbHVlKSB7XG4gICAgZnVuY3Rpb24gb2JzZXJ2YWJsZSgpIHtcbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgICAvLyBXcml0ZVxuXG4gICAgICAgICAgICAvLyBJZ25vcmUgd3JpdGVzIGlmIHRoZSB2YWx1ZSBoYXNuJ3QgY2hhbmdlZFxuICAgICAgICAgICAgaWYgKG9ic2VydmFibGUuaXNEaWZmZXJlbnQob2JzZXJ2YWJsZVtvYnNlcnZhYmxlTGF0ZXN0VmFsdWVdLCBhcmd1bWVudHNbMF0pKSB7XG4gICAgICAgICAgICAgICAgb2JzZXJ2YWJsZS52YWx1ZVdpbGxNdXRhdGUoKTtcbiAgICAgICAgICAgICAgICBvYnNlcnZhYmxlW29ic2VydmFibGVMYXRlc3RWYWx1ZV0gPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICAgICAgb2JzZXJ2YWJsZS52YWx1ZUhhc011dGF0ZWQoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzOyAvLyBQZXJtaXRzIGNoYWluZWQgYXNzaWdubWVudHNcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIC8vIFJlYWRcbiAgICAgICAgICAgIGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24ucmVnaXN0ZXJEZXBlbmRlbmN5KG9ic2VydmFibGUpOyAvLyBUaGUgY2FsbGVyIG9ubHkgbmVlZHMgdG8gYmUgbm90aWZpZWQgb2YgY2hhbmdlcyBpZiB0aGV5IGRpZCBhIFwicmVhZFwiIG9wZXJhdGlvblxuICAgICAgICAgICAgcmV0dXJuIG9ic2VydmFibGVbb2JzZXJ2YWJsZUxhdGVzdFZhbHVlXTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIG9ic2VydmFibGVbb2JzZXJ2YWJsZUxhdGVzdFZhbHVlXSA9IGluaXRpYWxWYWx1ZTtcblxuICAgIC8vIEluaGVyaXQgZnJvbSAnc3Vic2NyaWJhYmxlJ1xuICAgIGlmICgha28udXRpbHMuY2FuU2V0UHJvdG90eXBlKSB7XG4gICAgICAgIC8vICdzdWJzY3JpYmFibGUnIHdvbid0IGJlIG9uIHRoZSBwcm90b3R5cGUgY2hhaW4gdW5sZXNzIHdlIHB1dCBpdCB0aGVyZSBkaXJlY3RseVxuICAgICAgICBrby51dGlscy5leHRlbmQob2JzZXJ2YWJsZSwga28uc3Vic2NyaWJhYmxlWydmbiddKTtcbiAgICB9XG4gICAga28uc3Vic2NyaWJhYmxlWydmbiddLmluaXQob2JzZXJ2YWJsZSk7XG5cbiAgICAvLyBJbmhlcml0IGZyb20gJ29ic2VydmFibGUnXG4gICAga28udXRpbHMuc2V0UHJvdG90eXBlT2ZPckV4dGVuZChvYnNlcnZhYmxlLCBvYnNlcnZhYmxlRm4pO1xuXG4gICAgaWYgKGtvLm9wdGlvbnNbJ2RlZmVyVXBkYXRlcyddKSB7XG4gICAgICAgIGtvLmV4dGVuZGVyc1snZGVmZXJyZWQnXShvYnNlcnZhYmxlLCB0cnVlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gb2JzZXJ2YWJsZTtcbn1cblxuLy8gRGVmaW5lIHByb3RvdHlwZSBmb3Igb2JzZXJ2YWJsZXNcbnZhciBvYnNlcnZhYmxlRm4gPSB7XG4gICAgJ2VxdWFsaXR5Q29tcGFyZXInOiB2YWx1ZXNBcmVQcmltaXRpdmVBbmRFcXVhbCxcbiAgICBwZWVrOiBmdW5jdGlvbigpIHsgcmV0dXJuIHRoaXNbb2JzZXJ2YWJsZUxhdGVzdFZhbHVlXTsgfSxcbiAgICB2YWx1ZUhhc011dGF0ZWQ6IGZ1bmN0aW9uICgpIHsgdGhpc1snbm90aWZ5U3Vic2NyaWJlcnMnXSh0aGlzW29ic2VydmFibGVMYXRlc3RWYWx1ZV0pOyB9LFxuICAgIHZhbHVlV2lsbE11dGF0ZTogZnVuY3Rpb24gKCkgeyB0aGlzWydub3RpZnlTdWJzY3JpYmVycyddKHRoaXNbb2JzZXJ2YWJsZUxhdGVzdFZhbHVlXSwgJ2JlZm9yZUNoYW5nZScpOyB9XG59O1xuXG4vLyBOb3RlIHRoYXQgZm9yIGJyb3dzZXJzIHRoYXQgZG9uJ3Qgc3VwcG9ydCBwcm90byBhc3NpZ25tZW50LCB0aGVcbi8vIGluaGVyaXRhbmNlIGNoYWluIGlzIGNyZWF0ZWQgbWFudWFsbHkgaW4gdGhlIGtvLm9ic2VydmFibGUgY29uc3RydWN0b3JcbmlmIChrby51dGlscy5jYW5TZXRQcm90b3R5cGUpIHtcbiAgICBrby51dGlscy5zZXRQcm90b3R5cGVPZihvYnNlcnZhYmxlRm4sIGtvLnN1YnNjcmliYWJsZVsnZm4nXSk7XG59XG5cbnZhciBwcm90b1Byb3BlcnR5ID0ga28ub2JzZXJ2YWJsZS5wcm90b1Byb3BlcnR5ID0gJ19fa29fcHJvdG9fXyc7XG5vYnNlcnZhYmxlRm5bcHJvdG9Qcm9wZXJ0eV0gPSBrby5vYnNlcnZhYmxlO1xuXG5rby5oYXNQcm90b3R5cGUgPSBmdW5jdGlvbihpbnN0YW5jZSwgcHJvdG90eXBlKSB7XG4gICAgaWYgKChpbnN0YW5jZSA9PT0gbnVsbCkgfHwgKGluc3RhbmNlID09PSB1bmRlZmluZWQpIHx8IChpbnN0YW5jZVtwcm90b1Byb3BlcnR5XSA9PT0gdW5kZWZpbmVkKSkgcmV0dXJuIGZhbHNlO1xuICAgIGlmIChpbnN0YW5jZVtwcm90b1Byb3BlcnR5XSA9PT0gcHJvdG90eXBlKSByZXR1cm4gdHJ1ZTtcbiAgICByZXR1cm4ga28uaGFzUHJvdG90eXBlKGluc3RhbmNlW3Byb3RvUHJvcGVydHldLCBwcm90b3R5cGUpOyAvLyBXYWxrIHRoZSBwcm90b3R5cGUgY2hhaW5cbn07XG5cbmtvLmlzT2JzZXJ2YWJsZSA9IGZ1bmN0aW9uIChpbnN0YW5jZSkge1xuICAgIHJldHVybiBrby5oYXNQcm90b3R5cGUoaW5zdGFuY2UsIGtvLm9ic2VydmFibGUpO1xufVxua28uaXNXcml0ZWFibGVPYnNlcnZhYmxlID0gZnVuY3Rpb24gKGluc3RhbmNlKSB7XG4gICAgLy8gT2JzZXJ2YWJsZVxuICAgIGlmICgodHlwZW9mIGluc3RhbmNlID09ICdmdW5jdGlvbicpICYmIGluc3RhbmNlW3Byb3RvUHJvcGVydHldID09PSBrby5vYnNlcnZhYmxlKVxuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAvLyBXcml0ZWFibGUgZGVwZW5kZW50IG9ic2VydmFibGVcbiAgICBpZiAoKHR5cGVvZiBpbnN0YW5jZSA9PSAnZnVuY3Rpb24nKSAmJiAoaW5zdGFuY2VbcHJvdG9Qcm9wZXJ0eV0gPT09IGtvLmRlcGVuZGVudE9ic2VydmFibGUpICYmIChpbnN0YW5jZS5oYXNXcml0ZUZ1bmN0aW9uKSlcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgLy8gQW55dGhpbmcgZWxzZVxuICAgIHJldHVybiBmYWxzZTtcbn1cblxua28uZXhwb3J0U3ltYm9sKCdvYnNlcnZhYmxlJywga28ub2JzZXJ2YWJsZSk7XG5rby5leHBvcnRTeW1ib2woJ2lzT2JzZXJ2YWJsZScsIGtvLmlzT2JzZXJ2YWJsZSk7XG5rby5leHBvcnRTeW1ib2woJ2lzV3JpdGVhYmxlT2JzZXJ2YWJsZScsIGtvLmlzV3JpdGVhYmxlT2JzZXJ2YWJsZSk7XG5rby5leHBvcnRTeW1ib2woJ2lzV3JpdGFibGVPYnNlcnZhYmxlJywga28uaXNXcml0ZWFibGVPYnNlcnZhYmxlKTtcbmtvLmV4cG9ydFN5bWJvbCgnb2JzZXJ2YWJsZS5mbicsIG9ic2VydmFibGVGbik7XG5rby5leHBvcnRQcm9wZXJ0eShvYnNlcnZhYmxlRm4sICdwZWVrJywgb2JzZXJ2YWJsZUZuLnBlZWspO1xua28uZXhwb3J0UHJvcGVydHkob2JzZXJ2YWJsZUZuLCAndmFsdWVIYXNNdXRhdGVkJywgb2JzZXJ2YWJsZUZuLnZhbHVlSGFzTXV0YXRlZCk7XG5rby5leHBvcnRQcm9wZXJ0eShvYnNlcnZhYmxlRm4sICd2YWx1ZVdpbGxNdXRhdGUnLCBvYnNlcnZhYmxlRm4udmFsdWVXaWxsTXV0YXRlKTtcbmtvLm9ic2VydmFibGVBcnJheSA9IGZ1bmN0aW9uIChpbml0aWFsVmFsdWVzKSB7XG4gICAgaW5pdGlhbFZhbHVlcyA9IGluaXRpYWxWYWx1ZXMgfHwgW107XG5cbiAgICBpZiAodHlwZW9mIGluaXRpYWxWYWx1ZXMgIT0gJ29iamVjdCcgfHwgISgnbGVuZ3RoJyBpbiBpbml0aWFsVmFsdWVzKSlcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIGFyZ3VtZW50IHBhc3NlZCB3aGVuIGluaXRpYWxpemluZyBhbiBvYnNlcnZhYmxlIGFycmF5IG11c3QgYmUgYW4gYXJyYXksIG9yIG51bGwsIG9yIHVuZGVmaW5lZC5cIik7XG5cbiAgICB2YXIgcmVzdWx0ID0ga28ub2JzZXJ2YWJsZShpbml0aWFsVmFsdWVzKTtcbiAgICBrby51dGlscy5zZXRQcm90b3R5cGVPZk9yRXh0ZW5kKHJlc3VsdCwga28ub2JzZXJ2YWJsZUFycmF5WydmbiddKTtcbiAgICByZXR1cm4gcmVzdWx0LmV4dGVuZCh7J3RyYWNrQXJyYXlDaGFuZ2VzJzp0cnVlfSk7XG59O1xuXG5rby5vYnNlcnZhYmxlQXJyYXlbJ2ZuJ10gPSB7XG4gICAgJ3JlbW92ZSc6IGZ1bmN0aW9uICh2YWx1ZU9yUHJlZGljYXRlKSB7XG4gICAgICAgIHZhciB1bmRlcmx5aW5nQXJyYXkgPSB0aGlzLnBlZWsoKTtcbiAgICAgICAgdmFyIHJlbW92ZWRWYWx1ZXMgPSBbXTtcbiAgICAgICAgdmFyIHByZWRpY2F0ZSA9IHR5cGVvZiB2YWx1ZU9yUHJlZGljYXRlID09IFwiZnVuY3Rpb25cIiAmJiAha28uaXNPYnNlcnZhYmxlKHZhbHVlT3JQcmVkaWNhdGUpID8gdmFsdWVPclByZWRpY2F0ZSA6IGZ1bmN0aW9uICh2YWx1ZSkgeyByZXR1cm4gdmFsdWUgPT09IHZhbHVlT3JQcmVkaWNhdGU7IH07XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdW5kZXJseWluZ0FycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB1bmRlcmx5aW5nQXJyYXlbaV07XG4gICAgICAgICAgICBpZiAocHJlZGljYXRlKHZhbHVlKSkge1xuICAgICAgICAgICAgICAgIGlmIChyZW1vdmVkVmFsdWVzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgICAgICAgICAgICB0aGlzLnZhbHVlV2lsbE11dGF0ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICByZW1vdmVkVmFsdWVzLnB1c2godmFsdWUpO1xuICAgICAgICAgICAgICAgIHVuZGVybHlpbmdBcnJheS5zcGxpY2UoaSwgMSk7XG4gICAgICAgICAgICAgICAgaS0tO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGlmIChyZW1vdmVkVmFsdWVzLmxlbmd0aCkge1xuICAgICAgICAgICAgdGhpcy52YWx1ZUhhc011dGF0ZWQoKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gcmVtb3ZlZFZhbHVlcztcbiAgICB9LFxuXG4gICAgJ3JlbW92ZUFsbCc6IGZ1bmN0aW9uIChhcnJheU9mVmFsdWVzKSB7XG4gICAgICAgIC8vIElmIHlvdSBwYXNzZWQgemVybyBhcmdzLCB3ZSByZW1vdmUgZXZlcnl0aGluZ1xuICAgICAgICBpZiAoYXJyYXlPZlZhbHVlcyA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB2YXIgdW5kZXJseWluZ0FycmF5ID0gdGhpcy5wZWVrKCk7XG4gICAgICAgICAgICB2YXIgYWxsVmFsdWVzID0gdW5kZXJseWluZ0FycmF5LnNsaWNlKDApO1xuICAgICAgICAgICAgdGhpcy52YWx1ZVdpbGxNdXRhdGUoKTtcbiAgICAgICAgICAgIHVuZGVybHlpbmdBcnJheS5zcGxpY2UoMCwgdW5kZXJseWluZ0FycmF5Lmxlbmd0aCk7XG4gICAgICAgICAgICB0aGlzLnZhbHVlSGFzTXV0YXRlZCgpO1xuICAgICAgICAgICAgcmV0dXJuIGFsbFZhbHVlcztcbiAgICAgICAgfVxuICAgICAgICAvLyBJZiB5b3UgcGFzc2VkIGFuIGFyZywgd2UgaW50ZXJwcmV0IGl0IGFzIGFuIGFycmF5IG9mIGVudHJpZXMgdG8gcmVtb3ZlXG4gICAgICAgIGlmICghYXJyYXlPZlZhbHVlcylcbiAgICAgICAgICAgIHJldHVybiBbXTtcbiAgICAgICAgcmV0dXJuIHRoaXNbJ3JlbW92ZSddKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGtvLnV0aWxzLmFycmF5SW5kZXhPZihhcnJheU9mVmFsdWVzLCB2YWx1ZSkgPj0gMDtcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgICdkZXN0cm95JzogZnVuY3Rpb24gKHZhbHVlT3JQcmVkaWNhdGUpIHtcbiAgICAgICAgdmFyIHVuZGVybHlpbmdBcnJheSA9IHRoaXMucGVlaygpO1xuICAgICAgICB2YXIgcHJlZGljYXRlID0gdHlwZW9mIHZhbHVlT3JQcmVkaWNhdGUgPT0gXCJmdW5jdGlvblwiICYmICFrby5pc09ic2VydmFibGUodmFsdWVPclByZWRpY2F0ZSkgPyB2YWx1ZU9yUHJlZGljYXRlIDogZnVuY3Rpb24gKHZhbHVlKSB7IHJldHVybiB2YWx1ZSA9PT0gdmFsdWVPclByZWRpY2F0ZTsgfTtcbiAgICAgICAgdGhpcy52YWx1ZVdpbGxNdXRhdGUoKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IHVuZGVybHlpbmdBcnJheS5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuICAgICAgICAgICAgdmFyIHZhbHVlID0gdW5kZXJseWluZ0FycmF5W2ldO1xuICAgICAgICAgICAgaWYgKHByZWRpY2F0ZSh2YWx1ZSkpXG4gICAgICAgICAgICAgICAgdW5kZXJseWluZ0FycmF5W2ldW1wiX2Rlc3Ryb3lcIl0gPSB0cnVlO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMudmFsdWVIYXNNdXRhdGVkKCk7XG4gICAgfSxcblxuICAgICdkZXN0cm95QWxsJzogZnVuY3Rpb24gKGFycmF5T2ZWYWx1ZXMpIHtcbiAgICAgICAgLy8gSWYgeW91IHBhc3NlZCB6ZXJvIGFyZ3MsIHdlIGRlc3Ryb3kgZXZlcnl0aGluZ1xuICAgICAgICBpZiAoYXJyYXlPZlZhbHVlcyA9PT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgcmV0dXJuIHRoaXNbJ2Rlc3Ryb3knXShmdW5jdGlvbigpIHsgcmV0dXJuIHRydWUgfSk7XG5cbiAgICAgICAgLy8gSWYgeW91IHBhc3NlZCBhbiBhcmcsIHdlIGludGVycHJldCBpdCBhcyBhbiBhcnJheSBvZiBlbnRyaWVzIHRvIGRlc3Ryb3lcbiAgICAgICAgaWYgKCFhcnJheU9mVmFsdWVzKVxuICAgICAgICAgICAgcmV0dXJuIFtdO1xuICAgICAgICByZXR1cm4gdGhpc1snZGVzdHJveSddKGZ1bmN0aW9uICh2YWx1ZSkge1xuICAgICAgICAgICAgcmV0dXJuIGtvLnV0aWxzLmFycmF5SW5kZXhPZihhcnJheU9mVmFsdWVzLCB2YWx1ZSkgPj0gMDtcbiAgICAgICAgfSk7XG4gICAgfSxcblxuICAgICdpbmRleE9mJzogZnVuY3Rpb24gKGl0ZW0pIHtcbiAgICAgICAgdmFyIHVuZGVybHlpbmdBcnJheSA9IHRoaXMoKTtcbiAgICAgICAgcmV0dXJuIGtvLnV0aWxzLmFycmF5SW5kZXhPZih1bmRlcmx5aW5nQXJyYXksIGl0ZW0pO1xuICAgIH0sXG5cbiAgICAncmVwbGFjZSc6IGZ1bmN0aW9uKG9sZEl0ZW0sIG5ld0l0ZW0pIHtcbiAgICAgICAgdmFyIGluZGV4ID0gdGhpc1snaW5kZXhPZiddKG9sZEl0ZW0pO1xuICAgICAgICBpZiAoaW5kZXggPj0gMCkge1xuICAgICAgICAgICAgdGhpcy52YWx1ZVdpbGxNdXRhdGUoKTtcbiAgICAgICAgICAgIHRoaXMucGVlaygpW2luZGV4XSA9IG5ld0l0ZW07XG4gICAgICAgICAgICB0aGlzLnZhbHVlSGFzTXV0YXRlZCgpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuLy8gTm90ZSB0aGF0IGZvciBicm93c2VycyB0aGF0IGRvbid0IHN1cHBvcnQgcHJvdG8gYXNzaWdubWVudCwgdGhlXG4vLyBpbmhlcml0YW5jZSBjaGFpbiBpcyBjcmVhdGVkIG1hbnVhbGx5IGluIHRoZSBrby5vYnNlcnZhYmxlQXJyYXkgY29uc3RydWN0b3JcbmlmIChrby51dGlscy5jYW5TZXRQcm90b3R5cGUpIHtcbiAgICBrby51dGlscy5zZXRQcm90b3R5cGVPZihrby5vYnNlcnZhYmxlQXJyYXlbJ2ZuJ10sIGtvLm9ic2VydmFibGVbJ2ZuJ10pO1xufVxuXG4vLyBQb3B1bGF0ZSBrby5vYnNlcnZhYmxlQXJyYXkuZm4gd2l0aCByZWFkL3dyaXRlIGZ1bmN0aW9ucyBmcm9tIG5hdGl2ZSBhcnJheXNcbi8vIEltcG9ydGFudDogRG8gbm90IGFkZCBhbnkgYWRkaXRpb25hbCBmdW5jdGlvbnMgaGVyZSB0aGF0IG1heSByZWFzb25hYmx5IGJlIHVzZWQgdG8gKnJlYWQqIGRhdGEgZnJvbSB0aGUgYXJyYXlcbi8vIGJlY2F1c2Ugd2UnbGwgZXZhbCB0aGVtIHdpdGhvdXQgY2F1c2luZyBzdWJzY3JpcHRpb25zLCBzbyBrby5jb21wdXRlZCBvdXRwdXQgY291bGQgZW5kIHVwIGdldHRpbmcgc3RhbGVcbmtvLnV0aWxzLmFycmF5Rm9yRWFjaChbXCJwb3BcIiwgXCJwdXNoXCIsIFwicmV2ZXJzZVwiLCBcInNoaWZ0XCIsIFwic29ydFwiLCBcInNwbGljZVwiLCBcInVuc2hpZnRcIl0sIGZ1bmN0aW9uIChtZXRob2ROYW1lKSB7XG4gICAga28ub2JzZXJ2YWJsZUFycmF5WydmbiddW21ldGhvZE5hbWVdID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBVc2UgXCJwZWVrXCIgdG8gYXZvaWQgY3JlYXRpbmcgYSBzdWJzY3JpcHRpb24gaW4gYW55IGNvbXB1dGVkIHRoYXQgd2UncmUgZXhlY3V0aW5nIGluIHRoZSBjb250ZXh0IG9mXG4gICAgICAgIC8vIChmb3IgY29uc2lzdGVuY3kgd2l0aCBtdXRhdGluZyByZWd1bGFyIG9ic2VydmFibGVzKVxuICAgICAgICB2YXIgdW5kZXJseWluZ0FycmF5ID0gdGhpcy5wZWVrKCk7XG4gICAgICAgIHRoaXMudmFsdWVXaWxsTXV0YXRlKCk7XG4gICAgICAgIHRoaXMuY2FjaGVEaWZmRm9yS25vd25PcGVyYXRpb24odW5kZXJseWluZ0FycmF5LCBtZXRob2ROYW1lLCBhcmd1bWVudHMpO1xuICAgICAgICB2YXIgbWV0aG9kQ2FsbFJlc3VsdCA9IHVuZGVybHlpbmdBcnJheVttZXRob2ROYW1lXS5hcHBseSh1bmRlcmx5aW5nQXJyYXksIGFyZ3VtZW50cyk7XG4gICAgICAgIHRoaXMudmFsdWVIYXNNdXRhdGVkKCk7XG4gICAgICAgIC8vIFRoZSBuYXRpdmUgc29ydCBhbmQgcmV2ZXJzZSBtZXRob2RzIHJldHVybiBhIHJlZmVyZW5jZSB0byB0aGUgYXJyYXksIGJ1dCBpdCBtYWtlcyBtb3JlIHNlbnNlIHRvIHJldHVybiB0aGUgb2JzZXJ2YWJsZSBhcnJheSBpbnN0ZWFkLlxuICAgICAgICByZXR1cm4gbWV0aG9kQ2FsbFJlc3VsdCA9PT0gdW5kZXJseWluZ0FycmF5ID8gdGhpcyA6IG1ldGhvZENhbGxSZXN1bHQ7XG4gICAgfTtcbn0pO1xuXG4vLyBQb3B1bGF0ZSBrby5vYnNlcnZhYmxlQXJyYXkuZm4gd2l0aCByZWFkLW9ubHkgZnVuY3Rpb25zIGZyb20gbmF0aXZlIGFycmF5c1xua28udXRpbHMuYXJyYXlGb3JFYWNoKFtcInNsaWNlXCJdLCBmdW5jdGlvbiAobWV0aG9kTmFtZSkge1xuICAgIGtvLm9ic2VydmFibGVBcnJheVsnZm4nXVttZXRob2ROYW1lXSA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIHVuZGVybHlpbmdBcnJheSA9IHRoaXMoKTtcbiAgICAgICAgcmV0dXJuIHVuZGVybHlpbmdBcnJheVttZXRob2ROYW1lXS5hcHBseSh1bmRlcmx5aW5nQXJyYXksIGFyZ3VtZW50cyk7XG4gICAgfTtcbn0pO1xuXG5rby5leHBvcnRTeW1ib2woJ29ic2VydmFibGVBcnJheScsIGtvLm9ic2VydmFibGVBcnJheSk7XG52YXIgYXJyYXlDaGFuZ2VFdmVudE5hbWUgPSAnYXJyYXlDaGFuZ2UnO1xua28uZXh0ZW5kZXJzWyd0cmFja0FycmF5Q2hhbmdlcyddID0gZnVuY3Rpb24odGFyZ2V0LCBvcHRpb25zKSB7XG4gICAgLy8gVXNlIHRoZSBwcm92aWRlZCBvcHRpb25zLS1lYWNoIGNhbGwgdG8gdHJhY2tBcnJheUNoYW5nZXMgb3ZlcndyaXRlcyB0aGUgcHJldmlvdXNseSBzZXQgb3B0aW9uc1xuICAgIHRhcmdldC5jb21wYXJlQXJyYXlPcHRpb25zID0ge307XG4gICAgaWYgKG9wdGlvbnMgJiYgdHlwZW9mIG9wdGlvbnMgPT0gXCJvYmplY3RcIikge1xuICAgICAgICBrby51dGlscy5leHRlbmQodGFyZ2V0LmNvbXBhcmVBcnJheU9wdGlvbnMsIG9wdGlvbnMpO1xuICAgIH1cbiAgICB0YXJnZXQuY29tcGFyZUFycmF5T3B0aW9uc1snc3BhcnNlJ10gPSB0cnVlO1xuXG4gICAgLy8gT25seSBtb2RpZnkgdGhlIHRhcmdldCBvYnNlcnZhYmxlIG9uY2VcbiAgICBpZiAodGFyZ2V0LmNhY2hlRGlmZkZvcktub3duT3BlcmF0aW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIHRyYWNraW5nQ2hhbmdlcyA9IGZhbHNlLFxuICAgICAgICBjYWNoZWREaWZmID0gbnVsbCxcbiAgICAgICAgYXJyYXlDaGFuZ2VTdWJzY3JpcHRpb24sXG4gICAgICAgIHBlbmRpbmdOb3RpZmljYXRpb25zID0gMCxcbiAgICAgICAgdW5kZXJseWluZ0JlZm9yZVN1YnNjcmlwdGlvbkFkZEZ1bmN0aW9uID0gdGFyZ2V0LmJlZm9yZVN1YnNjcmlwdGlvbkFkZCxcbiAgICAgICAgdW5kZXJseWluZ0FmdGVyU3Vic2NyaXB0aW9uUmVtb3ZlRnVuY3Rpb24gPSB0YXJnZXQuYWZ0ZXJTdWJzY3JpcHRpb25SZW1vdmU7XG5cbiAgICAvLyBXYXRjaCBcInN1YnNjcmliZVwiIGNhbGxzLCBhbmQgZm9yIGFycmF5IGNoYW5nZSBldmVudHMsIGVuc3VyZSBjaGFuZ2UgdHJhY2tpbmcgaXMgZW5hYmxlZFxuICAgIHRhcmdldC5iZWZvcmVTdWJzY3JpcHRpb25BZGQgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgaWYgKHVuZGVybHlpbmdCZWZvcmVTdWJzY3JpcHRpb25BZGRGdW5jdGlvbilcbiAgICAgICAgICAgIHVuZGVybHlpbmdCZWZvcmVTdWJzY3JpcHRpb25BZGRGdW5jdGlvbi5jYWxsKHRhcmdldCwgZXZlbnQpO1xuICAgICAgICBpZiAoZXZlbnQgPT09IGFycmF5Q2hhbmdlRXZlbnROYW1lKSB7XG4gICAgICAgICAgICB0cmFja0NoYW5nZXMoKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgLy8gV2F0Y2ggXCJkaXNwb3NlXCIgY2FsbHMsIGFuZCBmb3IgYXJyYXkgY2hhbmdlIGV2ZW50cywgZW5zdXJlIGNoYW5nZSB0cmFja2luZyBpcyBkaXNhYmxlZCB3aGVuIGFsbCBhcmUgZGlzcG9zZWRcbiAgICB0YXJnZXQuYWZ0ZXJTdWJzY3JpcHRpb25SZW1vdmUgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgaWYgKHVuZGVybHlpbmdBZnRlclN1YnNjcmlwdGlvblJlbW92ZUZ1bmN0aW9uKVxuICAgICAgICAgICAgdW5kZXJseWluZ0FmdGVyU3Vic2NyaXB0aW9uUmVtb3ZlRnVuY3Rpb24uY2FsbCh0YXJnZXQsIGV2ZW50KTtcbiAgICAgICAgaWYgKGV2ZW50ID09PSBhcnJheUNoYW5nZUV2ZW50TmFtZSAmJiAhdGFyZ2V0Lmhhc1N1YnNjcmlwdGlvbnNGb3JFdmVudChhcnJheUNoYW5nZUV2ZW50TmFtZSkpIHtcbiAgICAgICAgICAgIGFycmF5Q2hhbmdlU3Vic2NyaXB0aW9uLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIHRyYWNraW5nQ2hhbmdlcyA9IGZhbHNlO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIHRyYWNrQ2hhbmdlcygpIHtcbiAgICAgICAgLy8gQ2FsbGluZyAndHJhY2tDaGFuZ2VzJyBtdWx0aXBsZSB0aW1lcyBpcyB0aGUgc2FtZSBhcyBjYWxsaW5nIGl0IG9uY2VcbiAgICAgICAgaWYgKHRyYWNraW5nQ2hhbmdlcykge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdHJhY2tpbmdDaGFuZ2VzID0gdHJ1ZTtcblxuICAgICAgICAvLyBJbnRlcmNlcHQgXCJub3RpZnlTdWJzY3JpYmVyc1wiIHRvIHRyYWNrIGhvdyBtYW55IHRpbWVzIGl0IHdhcyBjYWxsZWQuXG4gICAgICAgIHZhciB1bmRlcmx5aW5nTm90aWZ5U3Vic2NyaWJlcnNGdW5jdGlvbiA9IHRhcmdldFsnbm90aWZ5U3Vic2NyaWJlcnMnXTtcbiAgICAgICAgdGFyZ2V0Wydub3RpZnlTdWJzY3JpYmVycyddID0gZnVuY3Rpb24odmFsdWVUb05vdGlmeSwgZXZlbnQpIHtcbiAgICAgICAgICAgIGlmICghZXZlbnQgfHwgZXZlbnQgPT09IGRlZmF1bHRFdmVudCkge1xuICAgICAgICAgICAgICAgICsrcGVuZGluZ05vdGlmaWNhdGlvbnM7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gdW5kZXJseWluZ05vdGlmeVN1YnNjcmliZXJzRnVuY3Rpb24uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgfTtcblxuICAgICAgICAvLyBFYWNoIHRpbWUgdGhlIGFycmF5IGNoYW5nZXMgdmFsdWUsIGNhcHR1cmUgYSBjbG9uZSBzbyB0aGF0IG9uIHRoZSBuZXh0XG4gICAgICAgIC8vIGNoYW5nZSBpdCdzIHBvc3NpYmxlIHRvIHByb2R1Y2UgYSBkaWZmXG4gICAgICAgIHZhciBwcmV2aW91c0NvbnRlbnRzID0gW10uY29uY2F0KHRhcmdldC5wZWVrKCkgfHwgW10pO1xuICAgICAgICBjYWNoZWREaWZmID0gbnVsbDtcbiAgICAgICAgYXJyYXlDaGFuZ2VTdWJzY3JpcHRpb24gPSB0YXJnZXQuc3Vic2NyaWJlKGZ1bmN0aW9uKGN1cnJlbnRDb250ZW50cykge1xuICAgICAgICAgICAgLy8gTWFrZSBhIGNvcHkgb2YgdGhlIGN1cnJlbnQgY29udGVudHMgYW5kIGVuc3VyZSBpdCdzIGFuIGFycmF5XG4gICAgICAgICAgICBjdXJyZW50Q29udGVudHMgPSBbXS5jb25jYXQoY3VycmVudENvbnRlbnRzIHx8IFtdKTtcblxuICAgICAgICAgICAgLy8gQ29tcHV0ZSB0aGUgZGlmZiBhbmQgaXNzdWUgbm90aWZpY2F0aW9ucywgYnV0IG9ubHkgaWYgc29tZW9uZSBpcyBsaXN0ZW5pbmdcbiAgICAgICAgICAgIGlmICh0YXJnZXQuaGFzU3Vic2NyaXB0aW9uc0ZvckV2ZW50KGFycmF5Q2hhbmdlRXZlbnROYW1lKSkge1xuICAgICAgICAgICAgICAgIHZhciBjaGFuZ2VzID0gZ2V0Q2hhbmdlcyhwcmV2aW91c0NvbnRlbnRzLCBjdXJyZW50Q29udGVudHMpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBFbGltaW5hdGUgcmVmZXJlbmNlcyB0byB0aGUgb2xkLCByZW1vdmVkIGl0ZW1zLCBzbyB0aGV5IGNhbiBiZSBHQ2VkXG4gICAgICAgICAgICBwcmV2aW91c0NvbnRlbnRzID0gY3VycmVudENvbnRlbnRzO1xuICAgICAgICAgICAgY2FjaGVkRGlmZiA9IG51bGw7XG4gICAgICAgICAgICBwZW5kaW5nTm90aWZpY2F0aW9ucyA9IDA7XG5cbiAgICAgICAgICAgIGlmIChjaGFuZ2VzICYmIGNoYW5nZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgdGFyZ2V0Wydub3RpZnlTdWJzY3JpYmVycyddKGNoYW5nZXMsIGFycmF5Q2hhbmdlRXZlbnROYW1lKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0Q2hhbmdlcyhwcmV2aW91c0NvbnRlbnRzLCBjdXJyZW50Q29udGVudHMpIHtcbiAgICAgICAgLy8gV2UgdHJ5IHRvIHJlLXVzZSBjYWNoZWQgZGlmZnMuXG4gICAgICAgIC8vIFRoZSBzY2VuYXJpb3Mgd2hlcmUgcGVuZGluZ05vdGlmaWNhdGlvbnMgPiAxIGFyZSB3aGVuIHVzaW5nIHJhdGUtbGltaXRpbmcgb3IgdGhlIERlZmVycmVkIFVwZGF0ZXNcbiAgICAgICAgLy8gcGx1Z2luLCB3aGljaCB3aXRob3V0IHRoaXMgY2hlY2sgd291bGQgbm90IGJlIGNvbXBhdGlibGUgd2l0aCBhcnJheUNoYW5nZSBub3RpZmljYXRpb25zLiBOb3JtYWxseSxcbiAgICAgICAgLy8gbm90aWZpY2F0aW9ucyBhcmUgaXNzdWVkIGltbWVkaWF0ZWx5IHNvIHdlIHdvdWxkbid0IGJlIHF1ZXVlaW5nIHVwIG1vcmUgdGhhbiBvbmUuXG4gICAgICAgIGlmICghY2FjaGVkRGlmZiB8fCBwZW5kaW5nTm90aWZpY2F0aW9ucyA+IDEpIHtcbiAgICAgICAgICAgIGNhY2hlZERpZmYgPSBrby51dGlscy5jb21wYXJlQXJyYXlzKHByZXZpb3VzQ29udGVudHMsIGN1cnJlbnRDb250ZW50cywgdGFyZ2V0LmNvbXBhcmVBcnJheU9wdGlvbnMpO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGNhY2hlZERpZmY7XG4gICAgfVxuXG4gICAgdGFyZ2V0LmNhY2hlRGlmZkZvcktub3duT3BlcmF0aW9uID0gZnVuY3Rpb24ocmF3QXJyYXksIG9wZXJhdGlvbk5hbWUsIGFyZ3MpIHtcbiAgICAgICAgLy8gT25seSBydW4gaWYgd2UncmUgY3VycmVudGx5IHRyYWNraW5nIGNoYW5nZXMgZm9yIHRoaXMgb2JzZXJ2YWJsZSBhcnJheVxuICAgICAgICAvLyBhbmQgdGhlcmUgYXJlbid0IGFueSBwZW5kaW5nIGRlZmVycmVkIG5vdGlmaWNhdGlvbnMuXG4gICAgICAgIGlmICghdHJhY2tpbmdDaGFuZ2VzIHx8IHBlbmRpbmdOb3RpZmljYXRpb25zKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cbiAgICAgICAgdmFyIGRpZmYgPSBbXSxcbiAgICAgICAgICAgIGFycmF5TGVuZ3RoID0gcmF3QXJyYXkubGVuZ3RoLFxuICAgICAgICAgICAgYXJnc0xlbmd0aCA9IGFyZ3MubGVuZ3RoLFxuICAgICAgICAgICAgb2Zmc2V0ID0gMDtcblxuICAgICAgICBmdW5jdGlvbiBwdXNoRGlmZihzdGF0dXMsIHZhbHVlLCBpbmRleCkge1xuICAgICAgICAgICAgcmV0dXJuIGRpZmZbZGlmZi5sZW5ndGhdID0geyAnc3RhdHVzJzogc3RhdHVzLCAndmFsdWUnOiB2YWx1ZSwgJ2luZGV4JzogaW5kZXggfTtcbiAgICAgICAgfVxuICAgICAgICBzd2l0Y2ggKG9wZXJhdGlvbk5hbWUpIHtcbiAgICAgICAgICAgIGNhc2UgJ3B1c2gnOlxuICAgICAgICAgICAgICAgIG9mZnNldCA9IGFycmF5TGVuZ3RoO1xuICAgICAgICAgICAgY2FzZSAndW5zaGlmdCc6XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaW5kZXggPSAwOyBpbmRleCA8IGFyZ3NMZW5ndGg7IGluZGV4KyspIHtcbiAgICAgICAgICAgICAgICAgICAgcHVzaERpZmYoJ2FkZGVkJywgYXJnc1tpbmRleF0sIG9mZnNldCArIGluZGV4KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgIGNhc2UgJ3BvcCc6XG4gICAgICAgICAgICAgICAgb2Zmc2V0ID0gYXJyYXlMZW5ndGggLSAxO1xuICAgICAgICAgICAgY2FzZSAnc2hpZnQnOlxuICAgICAgICAgICAgICAgIGlmIChhcnJheUxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICBwdXNoRGlmZignZGVsZXRlZCcsIHJhd0FycmF5W29mZnNldF0sIG9mZnNldCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBjYXNlICdzcGxpY2UnOlxuICAgICAgICAgICAgICAgIC8vIE5lZ2F0aXZlIHN0YXJ0IGluZGV4IG1lYW5zICdmcm9tIGVuZCBvZiBhcnJheScuIEFmdGVyIHRoYXQgd2UgY2xhbXAgdG8gWzAuLi5hcnJheUxlbmd0aF0uXG4gICAgICAgICAgICAgICAgLy8gU2VlIGh0dHBzOi8vZGV2ZWxvcGVyLm1vemlsbGEub3JnL2VuLVVTL2RvY3MvV2ViL0phdmFTY3JpcHQvUmVmZXJlbmNlL0dsb2JhbF9PYmplY3RzL0FycmF5L3NwbGljZVxuICAgICAgICAgICAgICAgIHZhciBzdGFydEluZGV4ID0gTWF0aC5taW4oTWF0aC5tYXgoMCwgYXJnc1swXSA8IDAgPyBhcnJheUxlbmd0aCArIGFyZ3NbMF0gOiBhcmdzWzBdKSwgYXJyYXlMZW5ndGgpLFxuICAgICAgICAgICAgICAgICAgICBlbmREZWxldGVJbmRleCA9IGFyZ3NMZW5ndGggPT09IDEgPyBhcnJheUxlbmd0aCA6IE1hdGgubWluKHN0YXJ0SW5kZXggKyAoYXJnc1sxXSB8fCAwKSwgYXJyYXlMZW5ndGgpLFxuICAgICAgICAgICAgICAgICAgICBlbmRBZGRJbmRleCA9IHN0YXJ0SW5kZXggKyBhcmdzTGVuZ3RoIC0gMixcbiAgICAgICAgICAgICAgICAgICAgZW5kSW5kZXggPSBNYXRoLm1heChlbmREZWxldGVJbmRleCwgZW5kQWRkSW5kZXgpLFxuICAgICAgICAgICAgICAgICAgICBhZGRpdGlvbnMgPSBbXSwgZGVsZXRpb25zID0gW107XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaW5kZXggPSBzdGFydEluZGV4LCBhcmdzSW5kZXggPSAyOyBpbmRleCA8IGVuZEluZGV4OyArK2luZGV4LCArK2FyZ3NJbmRleCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPCBlbmREZWxldGVJbmRleClcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlbGV0aW9ucy5wdXNoKHB1c2hEaWZmKCdkZWxldGVkJywgcmF3QXJyYXlbaW5kZXhdLCBpbmRleCkpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoaW5kZXggPCBlbmRBZGRJbmRleClcbiAgICAgICAgICAgICAgICAgICAgICAgIGFkZGl0aW9ucy5wdXNoKHB1c2hEaWZmKCdhZGRlZCcsIGFyZ3NbYXJnc0luZGV4XSwgaW5kZXgpKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAga28udXRpbHMuZmluZE1vdmVzSW5BcnJheUNvbXBhcmlzb24oZGVsZXRpb25zLCBhZGRpdGlvbnMpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBjYWNoZWREaWZmID0gZGlmZjtcbiAgICB9O1xufTtcbnZhciBjb21wdXRlZFN0YXRlID0ga28udXRpbHMuY3JlYXRlU3ltYm9sT3JTdHJpbmcoJ19zdGF0ZScpO1xuXG5rby5jb21wdXRlZCA9IGtvLmRlcGVuZGVudE9ic2VydmFibGUgPSBmdW5jdGlvbiAoZXZhbHVhdG9yRnVuY3Rpb25Pck9wdGlvbnMsIGV2YWx1YXRvckZ1bmN0aW9uVGFyZ2V0LCBvcHRpb25zKSB7XG4gICAgaWYgKHR5cGVvZiBldmFsdWF0b3JGdW5jdGlvbk9yT3B0aW9ucyA9PT0gXCJvYmplY3RcIikge1xuICAgICAgICAvLyBTaW5nbGUtcGFyYW1ldGVyIHN5bnRheCAtIGV2ZXJ5dGhpbmcgaXMgb24gdGhpcyBcIm9wdGlvbnNcIiBwYXJhbVxuICAgICAgICBvcHRpb25zID0gZXZhbHVhdG9yRnVuY3Rpb25Pck9wdGlvbnM7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgLy8gTXVsdGktcGFyYW1ldGVyIHN5bnRheCAtIGNvbnN0cnVjdCB0aGUgb3B0aW9ucyBhY2NvcmRpbmcgdG8gdGhlIHBhcmFtcyBwYXNzZWRcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIGlmIChldmFsdWF0b3JGdW5jdGlvbk9yT3B0aW9ucykge1xuICAgICAgICAgICAgb3B0aW9uc1tcInJlYWRcIl0gPSBldmFsdWF0b3JGdW5jdGlvbk9yT3B0aW9ucztcbiAgICAgICAgfVxuICAgIH1cbiAgICBpZiAodHlwZW9mIG9wdGlvbnNbXCJyZWFkXCJdICE9IFwiZnVuY3Rpb25cIilcbiAgICAgICAgdGhyb3cgRXJyb3IoXCJQYXNzIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIHRoZSB2YWx1ZSBvZiB0aGUga28uY29tcHV0ZWRcIik7XG5cbiAgICB2YXIgd3JpdGVGdW5jdGlvbiA9IG9wdGlvbnNbXCJ3cml0ZVwiXTtcbiAgICB2YXIgc3RhdGUgPSB7XG4gICAgICAgIGxhdGVzdFZhbHVlOiB1bmRlZmluZWQsXG4gICAgICAgIGlzU3RhbGU6IHRydWUsXG4gICAgICAgIGlzQmVpbmdFdmFsdWF0ZWQ6IGZhbHNlLFxuICAgICAgICBzdXBwcmVzc0Rpc3Bvc2FsVW50aWxEaXNwb3NlV2hlblJldHVybnNGYWxzZTogZmFsc2UsXG4gICAgICAgIGlzRGlzcG9zZWQ6IGZhbHNlLFxuICAgICAgICBwdXJlOiBmYWxzZSxcbiAgICAgICAgaXNTbGVlcGluZzogZmFsc2UsXG4gICAgICAgIHJlYWRGdW5jdGlvbjogb3B0aW9uc1tcInJlYWRcIl0sXG4gICAgICAgIGV2YWx1YXRvckZ1bmN0aW9uVGFyZ2V0OiBldmFsdWF0b3JGdW5jdGlvblRhcmdldCB8fCBvcHRpb25zW1wib3duZXJcIl0sXG4gICAgICAgIGRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZDogb3B0aW9uc1tcImRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZFwiXSB8fCBvcHRpb25zLmRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZCB8fCBudWxsLFxuICAgICAgICBkaXNwb3NlV2hlbjogb3B0aW9uc1tcImRpc3Bvc2VXaGVuXCJdIHx8IG9wdGlvbnMuZGlzcG9zZVdoZW4sXG4gICAgICAgIGRvbU5vZGVEaXNwb3NhbENhbGxiYWNrOiBudWxsLFxuICAgICAgICBkZXBlbmRlbmN5VHJhY2tpbmc6IHt9LFxuICAgICAgICBkZXBlbmRlbmNpZXNDb3VudDogMCxcbiAgICAgICAgZXZhbHVhdGlvblRpbWVvdXRJbnN0YW5jZTogbnVsbFxuICAgIH07XG5cbiAgICBmdW5jdGlvbiBjb21wdXRlZE9ic2VydmFibGUoKSB7XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgaWYgKHR5cGVvZiB3cml0ZUZ1bmN0aW9uID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAvLyBXcml0aW5nIGEgdmFsdWVcbiAgICAgICAgICAgICAgICB3cml0ZUZ1bmN0aW9uLmFwcGx5KHN0YXRlLmV2YWx1YXRvckZ1bmN0aW9uVGFyZ2V0LCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3Qgd3JpdGUgYSB2YWx1ZSB0byBhIGtvLmNvbXB1dGVkIHVubGVzcyB5b3Ugc3BlY2lmeSBhICd3cml0ZScgb3B0aW9uLiBJZiB5b3Ugd2lzaCB0byByZWFkIHRoZSBjdXJyZW50IHZhbHVlLCBkb24ndCBwYXNzIGFueSBwYXJhbWV0ZXJzLlwiKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHJldHVybiB0aGlzOyAvLyBQZXJtaXRzIGNoYWluZWQgYXNzaWdubWVudHNcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFJlYWRpbmcgdGhlIHZhbHVlXG4gICAgICAgICAgICBrby5kZXBlbmRlbmN5RGV0ZWN0aW9uLnJlZ2lzdGVyRGVwZW5kZW5jeShjb21wdXRlZE9ic2VydmFibGUpO1xuICAgICAgICAgICAgaWYgKHN0YXRlLmlzU3RhbGUgfHwgKHN0YXRlLmlzU2xlZXBpbmcgJiYgY29tcHV0ZWRPYnNlcnZhYmxlLmhhdmVEZXBlbmRlbmNpZXNDaGFuZ2VkKCkpKSB7XG4gICAgICAgICAgICAgICAgY29tcHV0ZWRPYnNlcnZhYmxlLmV2YWx1YXRlSW1tZWRpYXRlKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gc3RhdGUubGF0ZXN0VmFsdWU7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBjb21wdXRlZE9ic2VydmFibGVbY29tcHV0ZWRTdGF0ZV0gPSBzdGF0ZTtcbiAgICBjb21wdXRlZE9ic2VydmFibGUuaGFzV3JpdGVGdW5jdGlvbiA9IHR5cGVvZiB3cml0ZUZ1bmN0aW9uID09PSBcImZ1bmN0aW9uXCI7XG5cbiAgICAvLyBJbmhlcml0IGZyb20gJ3N1YnNjcmliYWJsZSdcbiAgICBpZiAoIWtvLnV0aWxzLmNhblNldFByb3RvdHlwZSkge1xuICAgICAgICAvLyAnc3Vic2NyaWJhYmxlJyB3b24ndCBiZSBvbiB0aGUgcHJvdG90eXBlIGNoYWluIHVubGVzcyB3ZSBwdXQgaXQgdGhlcmUgZGlyZWN0bHlcbiAgICAgICAga28udXRpbHMuZXh0ZW5kKGNvbXB1dGVkT2JzZXJ2YWJsZSwga28uc3Vic2NyaWJhYmxlWydmbiddKTtcbiAgICB9XG4gICAga28uc3Vic2NyaWJhYmxlWydmbiddLmluaXQoY29tcHV0ZWRPYnNlcnZhYmxlKTtcblxuICAgIC8vIEluaGVyaXQgZnJvbSAnY29tcHV0ZWQnXG4gICAga28udXRpbHMuc2V0UHJvdG90eXBlT2ZPckV4dGVuZChjb21wdXRlZE9ic2VydmFibGUsIGNvbXB1dGVkRm4pO1xuXG4gICAgaWYgKG9wdGlvbnNbJ3B1cmUnXSkge1xuICAgICAgICBzdGF0ZS5wdXJlID0gdHJ1ZTtcbiAgICAgICAgc3RhdGUuaXNTbGVlcGluZyA9IHRydWU7ICAgICAvLyBTdGFydHMgb2ZmIHNsZWVwaW5nOyB3aWxsIGF3YWtlIG9uIHRoZSBmaXJzdCBzdWJzY3JpcHRpb25cbiAgICAgICAga28udXRpbHMuZXh0ZW5kKGNvbXB1dGVkT2JzZXJ2YWJsZSwgcHVyZUNvbXB1dGVkT3ZlcnJpZGVzKTtcbiAgICB9IGVsc2UgaWYgKG9wdGlvbnNbJ2RlZmVyRXZhbHVhdGlvbiddKSB7XG4gICAgICAgIGtvLnV0aWxzLmV4dGVuZChjb21wdXRlZE9ic2VydmFibGUsIGRlZmVyRXZhbHVhdGlvbk92ZXJyaWRlcyk7XG4gICAgfVxuXG4gICAgaWYgKGtvLm9wdGlvbnNbJ2RlZmVyVXBkYXRlcyddKSB7XG4gICAgICAgIGtvLmV4dGVuZGVyc1snZGVmZXJyZWQnXShjb21wdXRlZE9ic2VydmFibGUsIHRydWUpO1xuICAgIH1cblxuICAgIGlmIChERUJVRykge1xuICAgICAgICAvLyAjMTczMSAtIEFpZCBkZWJ1Z2dpbmcgYnkgZXhwb3NpbmcgdGhlIGNvbXB1dGVkJ3Mgb3B0aW9uc1xuICAgICAgICBjb21wdXRlZE9ic2VydmFibGVbXCJfb3B0aW9uc1wiXSA9IG9wdGlvbnM7XG4gICAgfVxuXG4gICAgaWYgKHN0YXRlLmRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZCkge1xuICAgICAgICAvLyBTaW5jZSB0aGlzIGNvbXB1dGVkIGlzIGFzc29jaWF0ZWQgd2l0aCBhIERPTSBub2RlLCBhbmQgd2UgZG9uJ3Qgd2FudCB0byBkaXNwb3NlIHRoZSBjb21wdXRlZFxuICAgICAgICAvLyB1bnRpbCB0aGUgRE9NIG5vZGUgaXMgKnJlbW92ZWQqIGZyb20gdGhlIGRvY3VtZW50IChhcyBvcHBvc2VkIHRvIG5ldmVyIGhhdmluZyBiZWVuIGluIHRoZSBkb2N1bWVudCksXG4gICAgICAgIC8vIHdlJ2xsIHByZXZlbnQgZGlzcG9zYWwgdW50aWwgXCJkaXNwb3NlV2hlblwiIGZpcnN0IHJldHVybnMgZmFsc2UuXG4gICAgICAgIHN0YXRlLnN1cHByZXNzRGlzcG9zYWxVbnRpbERpc3Bvc2VXaGVuUmV0dXJuc0ZhbHNlID0gdHJ1ZTtcblxuICAgICAgICAvLyBkaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQ6IHRydWUgY2FuIGJlIHVzZWQgdG8gb3B0IGludG8gdGhlIFwib25seSBkaXNwb3NlIGFmdGVyIGZpcnN0IGZhbHNlIHJlc3VsdFwiXG4gICAgICAgIC8vIGJlaGF2aW91ciBldmVuIGlmIHRoZXJlJ3Mgbm8gc3BlY2lmaWMgbm9kZSB0byB3YXRjaC4gSW4gdGhhdCBjYXNlLCBjbGVhciB0aGUgb3B0aW9uIHNvIHdlIGRvbid0IHRyeVxuICAgICAgICAvLyB0byB3YXRjaCBmb3IgYSBub24tbm9kZSdzIGRpc3Bvc2FsLiBUaGlzIHRlY2huaXF1ZSBpcyBpbnRlbmRlZCBmb3IgS08ncyBpbnRlcm5hbCB1c2Ugb25seSBhbmQgc2hvdWxkbid0XG4gICAgICAgIC8vIGJlIGRvY3VtZW50ZWQgb3IgdXNlZCBieSBhcHBsaWNhdGlvbiBjb2RlLCBhcyBpdCdzIGxpa2VseSB0byBjaGFuZ2UgaW4gYSBmdXR1cmUgdmVyc2lvbiBvZiBLTy5cbiAgICAgICAgaWYgKCFzdGF0ZS5kaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQubm9kZVR5cGUpIHtcbiAgICAgICAgICAgIHN0YXRlLmRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZCA9IG51bGw7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFdmFsdWF0ZSwgdW5sZXNzIHNsZWVwaW5nIG9yIGRlZmVyRXZhbHVhdGlvbiBpcyB0cnVlXG4gICAgaWYgKCFzdGF0ZS5pc1NsZWVwaW5nICYmICFvcHRpb25zWydkZWZlckV2YWx1YXRpb24nXSkge1xuICAgICAgICBjb21wdXRlZE9ic2VydmFibGUuZXZhbHVhdGVJbW1lZGlhdGUoKTtcbiAgICB9XG5cbiAgICAvLyBBdHRhY2ggYSBET00gbm9kZSBkaXNwb3NhbCBjYWxsYmFjayBzbyB0aGF0IHRoZSBjb21wdXRlZCB3aWxsIGJlIHByb2FjdGl2ZWx5IGRpc3Bvc2VkIGFzIHNvb24gYXMgdGhlIG5vZGUgaXNcbiAgICAvLyByZW1vdmVkIHVzaW5nIGtvLnJlbW92ZU5vZGUuIEJ1dCBza2lwIGlmIGlzQWN0aXZlIGlzIGZhbHNlICh0aGVyZSB3aWxsIG5ldmVyIGJlIGFueSBkZXBlbmRlbmNpZXMgdG8gZGlzcG9zZSkuXG4gICAgaWYgKHN0YXRlLmRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZCAmJiBjb21wdXRlZE9ic2VydmFibGUuaXNBY3RpdmUoKSkge1xuICAgICAgICBrby51dGlscy5kb21Ob2RlRGlzcG9zYWwuYWRkRGlzcG9zZUNhbGxiYWNrKHN0YXRlLmRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZCwgc3RhdGUuZG9tTm9kZURpc3Bvc2FsQ2FsbGJhY2sgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICBjb21wdXRlZE9ic2VydmFibGUuZGlzcG9zZSgpO1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICByZXR1cm4gY29tcHV0ZWRPYnNlcnZhYmxlO1xufTtcblxuLy8gVXRpbGl0eSBmdW5jdGlvbiB0aGF0IGRpc3Bvc2VzIGEgZ2l2ZW4gZGVwZW5kZW5jeVRyYWNraW5nIGVudHJ5XG5mdW5jdGlvbiBjb21wdXRlZERpc3Bvc2VEZXBlbmRlbmN5Q2FsbGJhY2soaWQsIGVudHJ5VG9EaXNwb3NlKSB7XG4gICAgaWYgKGVudHJ5VG9EaXNwb3NlICE9PSBudWxsICYmIGVudHJ5VG9EaXNwb3NlLmRpc3Bvc2UpIHtcbiAgICAgICAgZW50cnlUb0Rpc3Bvc2UuZGlzcG9zZSgpO1xuICAgIH1cbn1cblxuLy8gVGhpcyBmdW5jdGlvbiBnZXRzIGNhbGxlZCBlYWNoIHRpbWUgYSBkZXBlbmRlbmN5IGlzIGRldGVjdGVkIHdoaWxlIGV2YWx1YXRpbmcgYSBjb21wdXRlZC5cbi8vIEl0J3MgZmFjdG9yZWQgb3V0IGFzIGEgc2hhcmVkIGZ1bmN0aW9uIHRvIGF2b2lkIGNyZWF0aW5nIHVubmVjZXNzYXJ5IGZ1bmN0aW9uIGluc3RhbmNlcyBkdXJpbmcgZXZhbHVhdGlvbi5cbmZ1bmN0aW9uIGNvbXB1dGVkQmVnaW5EZXBlbmRlbmN5RGV0ZWN0aW9uQ2FsbGJhY2soc3Vic2NyaWJhYmxlLCBpZCkge1xuICAgIHZhciBjb21wdXRlZE9ic2VydmFibGUgPSB0aGlzLmNvbXB1dGVkT2JzZXJ2YWJsZSxcbiAgICAgICAgc3RhdGUgPSBjb21wdXRlZE9ic2VydmFibGVbY29tcHV0ZWRTdGF0ZV07XG4gICAgaWYgKCFzdGF0ZS5pc0Rpc3Bvc2VkKSB7XG4gICAgICAgIGlmICh0aGlzLmRpc3Bvc2FsQ291bnQgJiYgdGhpcy5kaXNwb3NhbENhbmRpZGF0ZXNbaWRdKSB7XG4gICAgICAgICAgICAvLyBEb24ndCB3YW50IHRvIGRpc3Bvc2UgdGhpcyBzdWJzY3JpcHRpb24sIGFzIGl0J3Mgc3RpbGwgYmVpbmcgdXNlZFxuICAgICAgICAgICAgY29tcHV0ZWRPYnNlcnZhYmxlLmFkZERlcGVuZGVuY3lUcmFja2luZyhpZCwgc3Vic2NyaWJhYmxlLCB0aGlzLmRpc3Bvc2FsQ2FuZGlkYXRlc1tpZF0pO1xuICAgICAgICAgICAgdGhpcy5kaXNwb3NhbENhbmRpZGF0ZXNbaWRdID0gbnVsbDsgLy8gTm8gbmVlZCB0byBhY3R1YWxseSBkZWxldGUgdGhlIHByb3BlcnR5IC0gZGlzcG9zYWxDYW5kaWRhdGVzIGlzIGEgdHJhbnNpZW50IG9iamVjdCBhbnl3YXlcbiAgICAgICAgICAgIC0tdGhpcy5kaXNwb3NhbENvdW50O1xuICAgICAgICB9IGVsc2UgaWYgKCFzdGF0ZS5kZXBlbmRlbmN5VHJhY2tpbmdbaWRdKSB7XG4gICAgICAgICAgICAvLyBCcmFuZCBuZXcgc3Vic2NyaXB0aW9uIC0gYWRkIGl0XG4gICAgICAgICAgICBjb21wdXRlZE9ic2VydmFibGUuYWRkRGVwZW5kZW5jeVRyYWNraW5nKGlkLCBzdWJzY3JpYmFibGUsIHN0YXRlLmlzU2xlZXBpbmcgPyB7IF90YXJnZXQ6IHN1YnNjcmliYWJsZSB9IDogY29tcHV0ZWRPYnNlcnZhYmxlLnN1YnNjcmliZVRvRGVwZW5kZW5jeShzdWJzY3JpYmFibGUpKTtcbiAgICAgICAgfVxuICAgIH1cbn1cblxudmFyIGNvbXB1dGVkRm4gPSB7XG4gICAgXCJlcXVhbGl0eUNvbXBhcmVyXCI6IHZhbHVlc0FyZVByaW1pdGl2ZUFuZEVxdWFsLFxuICAgIGdldERlcGVuZGVuY2llc0NvdW50OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHJldHVybiB0aGlzW2NvbXB1dGVkU3RhdGVdLmRlcGVuZGVuY2llc0NvdW50O1xuICAgIH0sXG4gICAgYWRkRGVwZW5kZW5jeVRyYWNraW5nOiBmdW5jdGlvbiAoaWQsIHRhcmdldCwgdHJhY2tpbmdPYmopIHtcbiAgICAgICAgaWYgKHRoaXNbY29tcHV0ZWRTdGF0ZV0ucHVyZSAmJiB0YXJnZXQgPT09IHRoaXMpIHtcbiAgICAgICAgICAgIHRocm93IEVycm9yKFwiQSAncHVyZScgY29tcHV0ZWQgbXVzdCBub3QgYmUgY2FsbGVkIHJlY3Vyc2l2ZWx5XCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpc1tjb21wdXRlZFN0YXRlXS5kZXBlbmRlbmN5VHJhY2tpbmdbaWRdID0gdHJhY2tpbmdPYmo7XG4gICAgICAgIHRyYWNraW5nT2JqLl9vcmRlciA9IHRoaXNbY29tcHV0ZWRTdGF0ZV0uZGVwZW5kZW5jaWVzQ291bnQrKztcbiAgICAgICAgdHJhY2tpbmdPYmouX3ZlcnNpb24gPSB0YXJnZXQuZ2V0VmVyc2lvbigpO1xuICAgIH0sXG4gICAgaGF2ZURlcGVuZGVuY2llc0NoYW5nZWQ6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgdmFyIGlkLCBkZXBlbmRlbmN5LCBkZXBlbmRlbmN5VHJhY2tpbmcgPSB0aGlzW2NvbXB1dGVkU3RhdGVdLmRlcGVuZGVuY3lUcmFja2luZztcbiAgICAgICAgZm9yIChpZCBpbiBkZXBlbmRlbmN5VHJhY2tpbmcpIHtcbiAgICAgICAgICAgIGlmIChkZXBlbmRlbmN5VHJhY2tpbmcuaGFzT3duUHJvcGVydHkoaWQpKSB7XG4gICAgICAgICAgICAgICAgZGVwZW5kZW5jeSA9IGRlcGVuZGVuY3lUcmFja2luZ1tpZF07XG4gICAgICAgICAgICAgICAgaWYgKGRlcGVuZGVuY3kuX3RhcmdldC5oYXNDaGFuZ2VkKGRlcGVuZGVuY3kuX3ZlcnNpb24pKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0sXG4gICAgbWFya0RpcnR5OiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIC8vIFByb2Nlc3MgXCJkaXJ0eVwiIGV2ZW50cyBpZiB3ZSBjYW4gaGFuZGxlIGRlbGF5ZWQgbm90aWZpY2F0aW9uc1xuICAgICAgICBpZiAodGhpcy5fZXZhbERlbGF5ZWQgJiYgIXRoaXNbY29tcHV0ZWRTdGF0ZV0uaXNCZWluZ0V2YWx1YXRlZCkge1xuICAgICAgICAgICAgdGhpcy5fZXZhbERlbGF5ZWQoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgaXNBY3RpdmU6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXNbY29tcHV0ZWRTdGF0ZV0uaXNTdGFsZSB8fCB0aGlzW2NvbXB1dGVkU3RhdGVdLmRlcGVuZGVuY2llc0NvdW50ID4gMDtcbiAgICB9LFxuICAgIHJlc3BvbmRUb0NoYW5nZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBJZ25vcmUgXCJjaGFuZ2VcIiBldmVudHMgaWYgd2UndmUgYWxyZWFkeSBzY2hlZHVsZWQgYSBkZWxheWVkIG5vdGlmaWNhdGlvblxuICAgICAgICBpZiAoIXRoaXMuX25vdGlmaWNhdGlvbklzUGVuZGluZykge1xuICAgICAgICAgICAgdGhpcy5ldmFsdWF0ZVBvc3NpYmx5QXN5bmMoKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgc3Vic2NyaWJlVG9EZXBlbmRlbmN5OiBmdW5jdGlvbiAodGFyZ2V0KSB7XG4gICAgICAgIGlmICh0YXJnZXQuX2RlZmVyVXBkYXRlcyAmJiAhdGhpc1tjb21wdXRlZFN0YXRlXS5kaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQpIHtcbiAgICAgICAgICAgIHZhciBkaXJ0eVN1YiA9IHRhcmdldC5zdWJzY3JpYmUodGhpcy5tYXJrRGlydHksIHRoaXMsICdkaXJ0eScpLFxuICAgICAgICAgICAgICAgIGNoYW5nZVN1YiA9IHRhcmdldC5zdWJzY3JpYmUodGhpcy5yZXNwb25kVG9DaGFuZ2UsIHRoaXMpO1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgICBfdGFyZ2V0OiB0YXJnZXQsXG4gICAgICAgICAgICAgICAgZGlzcG9zZTogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICBkaXJ0eVN1Yi5kaXNwb3NlKCk7XG4gICAgICAgICAgICAgICAgICAgIGNoYW5nZVN1Yi5kaXNwb3NlKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiB0YXJnZXQuc3Vic2NyaWJlKHRoaXMuZXZhbHVhdGVQb3NzaWJseUFzeW5jLCB0aGlzKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgZXZhbHVhdGVQb3NzaWJseUFzeW5jOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBjb21wdXRlZE9ic2VydmFibGUgPSB0aGlzLFxuICAgICAgICAgICAgdGhyb3R0bGVFdmFsdWF0aW9uVGltZW91dCA9IGNvbXB1dGVkT2JzZXJ2YWJsZVsndGhyb3R0bGVFdmFsdWF0aW9uJ107XG4gICAgICAgIGlmICh0aHJvdHRsZUV2YWx1YXRpb25UaW1lb3V0ICYmIHRocm90dGxlRXZhbHVhdGlvblRpbWVvdXQgPj0gMCkge1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXNbY29tcHV0ZWRTdGF0ZV0uZXZhbHVhdGlvblRpbWVvdXRJbnN0YW5jZSk7XG4gICAgICAgICAgICB0aGlzW2NvbXB1dGVkU3RhdGVdLmV2YWx1YXRpb25UaW1lb3V0SW5zdGFuY2UgPSBrby51dGlscy5zZXRUaW1lb3V0KGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICBjb21wdXRlZE9ic2VydmFibGUuZXZhbHVhdGVJbW1lZGlhdGUodHJ1ZSAvKm5vdGlmeUNoYW5nZSovKTtcbiAgICAgICAgICAgIH0sIHRocm90dGxlRXZhbHVhdGlvblRpbWVvdXQpO1xuICAgICAgICB9IGVsc2UgaWYgKGNvbXB1dGVkT2JzZXJ2YWJsZS5fZXZhbERlbGF5ZWQpIHtcbiAgICAgICAgICAgIGNvbXB1dGVkT2JzZXJ2YWJsZS5fZXZhbERlbGF5ZWQoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbXB1dGVkT2JzZXJ2YWJsZS5ldmFsdWF0ZUltbWVkaWF0ZSh0cnVlIC8qbm90aWZ5Q2hhbmdlKi8pO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBldmFsdWF0ZUltbWVkaWF0ZTogZnVuY3Rpb24gKG5vdGlmeUNoYW5nZSkge1xuICAgICAgICB2YXIgY29tcHV0ZWRPYnNlcnZhYmxlID0gdGhpcyxcbiAgICAgICAgICAgIHN0YXRlID0gY29tcHV0ZWRPYnNlcnZhYmxlW2NvbXB1dGVkU3RhdGVdLFxuICAgICAgICAgICAgZGlzcG9zZVdoZW4gPSBzdGF0ZS5kaXNwb3NlV2hlbjtcblxuICAgICAgICBpZiAoc3RhdGUuaXNCZWluZ0V2YWx1YXRlZCkge1xuICAgICAgICAgICAgLy8gSWYgdGhlIGV2YWx1YXRpb24gb2YgYSBrby5jb21wdXRlZCBjYXVzZXMgc2lkZSBlZmZlY3RzLCBpdCdzIHBvc3NpYmxlIHRoYXQgaXQgd2lsbCB0cmlnZ2VyIGl0cyBvd24gcmUtZXZhbHVhdGlvbi5cbiAgICAgICAgICAgIC8vIFRoaXMgaXMgbm90IGRlc2lyYWJsZSAoaXQncyBoYXJkIGZvciBhIGRldmVsb3BlciB0byByZWFsaXNlIGEgY2hhaW4gb2YgZGVwZW5kZW5jaWVzIG1pZ2h0IGNhdXNlIHRoaXMsIGFuZCB0aGV5IGFsbW9zdFxuICAgICAgICAgICAgLy8gY2VydGFpbmx5IGRpZG4ndCBpbnRlbmQgaW5maW5pdGUgcmUtZXZhbHVhdGlvbnMpLiBTbywgZm9yIHByZWRpY3RhYmlsaXR5LCB3ZSBzaW1wbHkgcHJldmVudCBrby5jb21wdXRlZHMgZnJvbSBjYXVzaW5nXG4gICAgICAgICAgICAvLyB0aGVpciBvd24gcmUtZXZhbHVhdGlvbi4gRnVydGhlciBkaXNjdXNzaW9uIGF0IGh0dHBzOi8vZ2l0aHViLmNvbS9TdGV2ZVNhbmRlcnNvbi9rbm9ja291dC9wdWxsLzM4N1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRG8gbm90IGV2YWx1YXRlIChhbmQgcG9zc2libHkgY2FwdHVyZSBuZXcgZGVwZW5kZW5jaWVzKSBpZiBkaXNwb3NlZFxuICAgICAgICBpZiAoc3RhdGUuaXNEaXNwb3NlZCkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHN0YXRlLmRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZCAmJiAha28udXRpbHMuZG9tTm9kZUlzQXR0YWNoZWRUb0RvY3VtZW50KHN0YXRlLmRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZCkgfHwgZGlzcG9zZVdoZW4gJiYgZGlzcG9zZVdoZW4oKSkge1xuICAgICAgICAgICAgLy8gU2VlIGNvbW1lbnQgYWJvdmUgYWJvdXQgc3VwcHJlc3NEaXNwb3NhbFVudGlsRGlzcG9zZVdoZW5SZXR1cm5zRmFsc2VcbiAgICAgICAgICAgIGlmICghc3RhdGUuc3VwcHJlc3NEaXNwb3NhbFVudGlsRGlzcG9zZVdoZW5SZXR1cm5zRmFsc2UpIHtcbiAgICAgICAgICAgICAgICBjb21wdXRlZE9ic2VydmFibGUuZGlzcG9zZSgpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIEl0IGp1c3QgZGlkIHJldHVybiBmYWxzZSwgc28gd2UgY2FuIHN0b3Agc3VwcHJlc3Npbmcgbm93XG4gICAgICAgICAgICBzdGF0ZS5zdXBwcmVzc0Rpc3Bvc2FsVW50aWxEaXNwb3NlV2hlblJldHVybnNGYWxzZSA9IGZhbHNlO1xuICAgICAgICB9XG5cbiAgICAgICAgc3RhdGUuaXNCZWluZ0V2YWx1YXRlZCA9IHRydWU7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLmV2YWx1YXRlSW1tZWRpYXRlX0NhbGxSZWFkV2l0aERlcGVuZGVuY3lEZXRlY3Rpb24obm90aWZ5Q2hhbmdlKTtcbiAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgIHN0YXRlLmlzQmVpbmdFdmFsdWF0ZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghc3RhdGUuZGVwZW5kZW5jaWVzQ291bnQpIHtcbiAgICAgICAgICAgIGNvbXB1dGVkT2JzZXJ2YWJsZS5kaXNwb3NlKCk7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIGV2YWx1YXRlSW1tZWRpYXRlX0NhbGxSZWFkV2l0aERlcGVuZGVuY3lEZXRlY3Rpb246IGZ1bmN0aW9uIChub3RpZnlDaGFuZ2UpIHtcbiAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBpcyByZWFsbHkganVzdCBwYXJ0IG9mIHRoZSBldmFsdWF0ZUltbWVkaWF0ZSBsb2dpYy4gWW91IHdvdWxkIG5ldmVyIGNhbGwgaXQgZnJvbSBhbnl3aGVyZSBlbHNlLlxuICAgICAgICAvLyBGYWN0b3JpbmcgaXQgb3V0IGludG8gYSBzZXBhcmF0ZSBmdW5jdGlvbiBtZWFucyBpdCBjYW4gYmUgaW5kZXBlbmRlbnQgb2YgdGhlIHRyeS9jYXRjaCBibG9jayBpbiBldmFsdWF0ZUltbWVkaWF0ZSxcbiAgICAgICAgLy8gd2hpY2ggY29udHJpYnV0ZXMgdG8gc2F2aW5nIGFib3V0IDQwJSBvZmYgdGhlIENQVSBvdmVyaGVhZCBvZiBjb21wdXRlZCBldmFsdWF0aW9uIChvbiBWOCBhdCBsZWFzdCkuXG5cbiAgICAgICAgdmFyIGNvbXB1dGVkT2JzZXJ2YWJsZSA9IHRoaXMsXG4gICAgICAgICAgICBzdGF0ZSA9IGNvbXB1dGVkT2JzZXJ2YWJsZVtjb21wdXRlZFN0YXRlXTtcblxuICAgICAgICAvLyBJbml0aWFsbHksIHdlIGFzc3VtZSB0aGF0IG5vbmUgb2YgdGhlIHN1YnNjcmlwdGlvbnMgYXJlIHN0aWxsIGJlaW5nIHVzZWQgKGkuZS4sIGFsbCBhcmUgY2FuZGlkYXRlcyBmb3IgZGlzcG9zYWwpLlxuICAgICAgICAvLyBUaGVuLCBkdXJpbmcgZXZhbHVhdGlvbiwgd2UgY3Jvc3Mgb2ZmIGFueSB0aGF0IGFyZSBpbiBmYWN0IHN0aWxsIGJlaW5nIHVzZWQuXG4gICAgICAgIHZhciBpc0luaXRpYWwgPSBzdGF0ZS5wdXJlID8gdW5kZWZpbmVkIDogIXN0YXRlLmRlcGVuZGVuY2llc0NvdW50LCAgIC8vIElmIHdlJ3JlIGV2YWx1YXRpbmcgd2hlbiB0aGVyZSBhcmUgbm8gcHJldmlvdXMgZGVwZW5kZW5jaWVzLCBpdCBtdXN0IGJlIHRoZSBmaXJzdCB0aW1lXG4gICAgICAgICAgICBkZXBlbmRlbmN5RGV0ZWN0aW9uQ29udGV4dCA9IHtcbiAgICAgICAgICAgICAgICBjb21wdXRlZE9ic2VydmFibGU6IGNvbXB1dGVkT2JzZXJ2YWJsZSxcbiAgICAgICAgICAgICAgICBkaXNwb3NhbENhbmRpZGF0ZXM6IHN0YXRlLmRlcGVuZGVuY3lUcmFja2luZyxcbiAgICAgICAgICAgICAgICBkaXNwb3NhbENvdW50OiBzdGF0ZS5kZXBlbmRlbmNpZXNDb3VudFxuICAgICAgICAgICAgfTtcblxuICAgICAgICBrby5kZXBlbmRlbmN5RGV0ZWN0aW9uLmJlZ2luKHtcbiAgICAgICAgICAgIGNhbGxiYWNrVGFyZ2V0OiBkZXBlbmRlbmN5RGV0ZWN0aW9uQ29udGV4dCxcbiAgICAgICAgICAgIGNhbGxiYWNrOiBjb21wdXRlZEJlZ2luRGVwZW5kZW5jeURldGVjdGlvbkNhbGxiYWNrLFxuICAgICAgICAgICAgY29tcHV0ZWQ6IGNvbXB1dGVkT2JzZXJ2YWJsZSxcbiAgICAgICAgICAgIGlzSW5pdGlhbDogaXNJbml0aWFsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHN0YXRlLmRlcGVuZGVuY3lUcmFja2luZyA9IHt9O1xuICAgICAgICBzdGF0ZS5kZXBlbmRlbmNpZXNDb3VudCA9IDA7XG5cbiAgICAgICAgdmFyIG5ld1ZhbHVlID0gdGhpcy5ldmFsdWF0ZUltbWVkaWF0ZV9DYWxsUmVhZFRoZW5FbmREZXBlbmRlbmN5RGV0ZWN0aW9uKHN0YXRlLCBkZXBlbmRlbmN5RGV0ZWN0aW9uQ29udGV4dCk7XG5cbiAgICAgICAgaWYgKGNvbXB1dGVkT2JzZXJ2YWJsZS5pc0RpZmZlcmVudChzdGF0ZS5sYXRlc3RWYWx1ZSwgbmV3VmFsdWUpKSB7XG4gICAgICAgICAgICBpZiAoIXN0YXRlLmlzU2xlZXBpbmcpIHtcbiAgICAgICAgICAgICAgICBjb21wdXRlZE9ic2VydmFibGVbXCJub3RpZnlTdWJzY3JpYmVyc1wiXShzdGF0ZS5sYXRlc3RWYWx1ZSwgXCJiZWZvcmVDaGFuZ2VcIik7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHN0YXRlLmxhdGVzdFZhbHVlID0gbmV3VmFsdWU7XG5cbiAgICAgICAgICAgIGlmIChzdGF0ZS5pc1NsZWVwaW5nKSB7XG4gICAgICAgICAgICAgICAgY29tcHV0ZWRPYnNlcnZhYmxlLnVwZGF0ZVZlcnNpb24oKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAobm90aWZ5Q2hhbmdlKSB7XG4gICAgICAgICAgICAgICAgY29tcHV0ZWRPYnNlcnZhYmxlW1wibm90aWZ5U3Vic2NyaWJlcnNcIl0oc3RhdGUubGF0ZXN0VmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGlzSW5pdGlhbCkge1xuICAgICAgICAgICAgY29tcHV0ZWRPYnNlcnZhYmxlW1wibm90aWZ5U3Vic2NyaWJlcnNcIl0oc3RhdGUubGF0ZXN0VmFsdWUsIFwiYXdha2VcIik7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIGV2YWx1YXRlSW1tZWRpYXRlX0NhbGxSZWFkVGhlbkVuZERlcGVuZGVuY3lEZXRlY3Rpb246IGZ1bmN0aW9uIChzdGF0ZSwgZGVwZW5kZW5jeURldGVjdGlvbkNvbnRleHQpIHtcbiAgICAgICAgLy8gVGhpcyBmdW5jdGlvbiBpcyByZWFsbHkgcGFydCBvZiB0aGUgZXZhbHVhdGVJbW1lZGlhdGVfQ2FsbFJlYWRXaXRoRGVwZW5kZW5jeURldGVjdGlvbiBsb2dpYy5cbiAgICAgICAgLy8gWW91J2QgbmV2ZXIgY2FsbCBpdCBmcm9tIGFueXdoZXJlIGVsc2UuIEZhY3RvcmluZyBpdCBvdXQgbWVhbnMgdGhhdCBldmFsdWF0ZUltbWVkaWF0ZV9DYWxsUmVhZFdpdGhEZXBlbmRlbmN5RGV0ZWN0aW9uXG4gICAgICAgIC8vIGNhbiBiZSBpbmRlcGVuZGVudCBvZiB0cnkvZmluYWxseSBibG9ja3MsIHdoaWNoIGNvbnRyaWJ1dGVzIHRvIHNhdmluZyBhYm91dCA0MCUgb2ZmIHRoZSBDUFVcbiAgICAgICAgLy8gb3ZlcmhlYWQgb2YgY29tcHV0ZWQgZXZhbHVhdGlvbiAob24gVjggYXQgbGVhc3QpLlxuXG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB2YXIgcmVhZEZ1bmN0aW9uID0gc3RhdGUucmVhZEZ1bmN0aW9uO1xuICAgICAgICAgICAgcmV0dXJuIHN0YXRlLmV2YWx1YXRvckZ1bmN0aW9uVGFyZ2V0ID8gcmVhZEZ1bmN0aW9uLmNhbGwoc3RhdGUuZXZhbHVhdG9yRnVuY3Rpb25UYXJnZXQpIDogcmVhZEZ1bmN0aW9uKCk7XG4gICAgICAgIH0gZmluYWxseSB7XG4gICAgICAgICAgICBrby5kZXBlbmRlbmN5RGV0ZWN0aW9uLmVuZCgpO1xuXG4gICAgICAgICAgICAvLyBGb3IgZWFjaCBzdWJzY3JpcHRpb24gbm8gbG9uZ2VyIGJlaW5nIHVzZWQsIHJlbW92ZSBpdCBmcm9tIHRoZSBhY3RpdmUgc3Vic2NyaXB0aW9ucyBsaXN0IGFuZCBkaXNwb3NlIGl0XG4gICAgICAgICAgICBpZiAoZGVwZW5kZW5jeURldGVjdGlvbkNvbnRleHQuZGlzcG9zYWxDb3VudCAmJiAhc3RhdGUuaXNTbGVlcGluZykge1xuICAgICAgICAgICAgICAgIGtvLnV0aWxzLm9iamVjdEZvckVhY2goZGVwZW5kZW5jeURldGVjdGlvbkNvbnRleHQuZGlzcG9zYWxDYW5kaWRhdGVzLCBjb21wdXRlZERpc3Bvc2VEZXBlbmRlbmN5Q2FsbGJhY2spO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBzdGF0ZS5pc1N0YWxlID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9LFxuICAgIHBlZWs6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgLy8gUGVlayB3b24ndCByZS1ldmFsdWF0ZSwgZXhjZXB0IHdoaWxlIHRoZSBjb21wdXRlZCBpcyBzbGVlcGluZyBvciB0byBnZXQgdGhlIGluaXRpYWwgdmFsdWUgd2hlbiBcImRlZmVyRXZhbHVhdGlvblwiIGlzIHNldC5cbiAgICAgICAgdmFyIHN0YXRlID0gdGhpc1tjb21wdXRlZFN0YXRlXTtcbiAgICAgICAgaWYgKChzdGF0ZS5pc1N0YWxlICYmICFzdGF0ZS5kZXBlbmRlbmNpZXNDb3VudCkgfHwgKHN0YXRlLmlzU2xlZXBpbmcgJiYgdGhpcy5oYXZlRGVwZW5kZW5jaWVzQ2hhbmdlZCgpKSkge1xuICAgICAgICAgICAgdGhpcy5ldmFsdWF0ZUltbWVkaWF0ZSgpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBzdGF0ZS5sYXRlc3RWYWx1ZTtcbiAgICB9LFxuICAgIGxpbWl0OiBmdW5jdGlvbiAobGltaXRGdW5jdGlvbikge1xuICAgICAgICAvLyBPdmVycmlkZSB0aGUgbGltaXQgZnVuY3Rpb24gd2l0aCBvbmUgdGhhdCBkZWxheXMgZXZhbHVhdGlvbiBhcyB3ZWxsXG4gICAgICAgIGtvLnN1YnNjcmliYWJsZVsnZm4nXS5saW1pdC5jYWxsKHRoaXMsIGxpbWl0RnVuY3Rpb24pO1xuICAgICAgICB0aGlzLl9ldmFsRGVsYXllZCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMuX2xpbWl0QmVmb3JlQ2hhbmdlKHRoaXNbY29tcHV0ZWRTdGF0ZV0ubGF0ZXN0VmFsdWUpO1xuXG4gICAgICAgICAgICB0aGlzW2NvbXB1dGVkU3RhdGVdLmlzU3RhbGUgPSB0cnVlOyAvLyBNYXJrIGFzIGRpcnR5XG5cbiAgICAgICAgICAgIC8vIFBhc3MgdGhlIG9ic2VydmFibGUgdG8gdGhlIFwibGltaXRcIiBjb2RlLCB3aGljaCB3aWxsIGFjY2VzcyBpdCB3aGVuXG4gICAgICAgICAgICAvLyBpdCdzIHRpbWUgdG8gZG8gdGhlIG5vdGlmaWNhdGlvbi5cbiAgICAgICAgICAgIHRoaXMuX2xpbWl0Q2hhbmdlKHRoaXMpO1xuICAgICAgICB9XG4gICAgfSxcbiAgICBkaXNwb3NlOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgIHZhciBzdGF0ZSA9IHRoaXNbY29tcHV0ZWRTdGF0ZV07XG4gICAgICAgIGlmICghc3RhdGUuaXNTbGVlcGluZyAmJiBzdGF0ZS5kZXBlbmRlbmN5VHJhY2tpbmcpIHtcbiAgICAgICAgICAgIGtvLnV0aWxzLm9iamVjdEZvckVhY2goc3RhdGUuZGVwZW5kZW5jeVRyYWNraW5nLCBmdW5jdGlvbiAoaWQsIGRlcGVuZGVuY3kpIHtcbiAgICAgICAgICAgICAgICBpZiAoZGVwZW5kZW5jeS5kaXNwb3NlKVxuICAgICAgICAgICAgICAgICAgICBkZXBlbmRlbmN5LmRpc3Bvc2UoKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG4gICAgICAgIGlmIChzdGF0ZS5kaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQgJiYgc3RhdGUuZG9tTm9kZURpc3Bvc2FsQ2FsbGJhY2spIHtcbiAgICAgICAgICAgIGtvLnV0aWxzLmRvbU5vZGVEaXNwb3NhbC5yZW1vdmVEaXNwb3NlQ2FsbGJhY2soc3RhdGUuZGlzcG9zZVdoZW5Ob2RlSXNSZW1vdmVkLCBzdGF0ZS5kb21Ob2RlRGlzcG9zYWxDYWxsYmFjayk7XG4gICAgICAgIH1cbiAgICAgICAgc3RhdGUuZGVwZW5kZW5jeVRyYWNraW5nID0gbnVsbDtcbiAgICAgICAgc3RhdGUuZGVwZW5kZW5jaWVzQ291bnQgPSAwO1xuICAgICAgICBzdGF0ZS5pc0Rpc3Bvc2VkID0gdHJ1ZTtcbiAgICAgICAgc3RhdGUuaXNTdGFsZSA9IGZhbHNlO1xuICAgICAgICBzdGF0ZS5pc1NsZWVwaW5nID0gZmFsc2U7XG4gICAgICAgIHN0YXRlLmRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZCA9IG51bGw7XG4gICAgfVxufTtcblxudmFyIHB1cmVDb21wdXRlZE92ZXJyaWRlcyA9IHtcbiAgICBiZWZvcmVTdWJzY3JpcHRpb25BZGQ6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAvLyBJZiBhc2xlZXAsIHdha2UgdXAgdGhlIGNvbXB1dGVkIGJ5IHN1YnNjcmliaW5nIHRvIGFueSBkZXBlbmRlbmNpZXMuXG4gICAgICAgIHZhciBjb21wdXRlZE9ic2VydmFibGUgPSB0aGlzLFxuICAgICAgICAgICAgc3RhdGUgPSBjb21wdXRlZE9ic2VydmFibGVbY29tcHV0ZWRTdGF0ZV07XG4gICAgICAgIGlmICghc3RhdGUuaXNEaXNwb3NlZCAmJiBzdGF0ZS5pc1NsZWVwaW5nICYmIGV2ZW50ID09ICdjaGFuZ2UnKSB7XG4gICAgICAgICAgICBzdGF0ZS5pc1NsZWVwaW5nID0gZmFsc2U7XG4gICAgICAgICAgICBpZiAoc3RhdGUuaXNTdGFsZSB8fCBjb21wdXRlZE9ic2VydmFibGUuaGF2ZURlcGVuZGVuY2llc0NoYW5nZWQoKSkge1xuICAgICAgICAgICAgICAgIHN0YXRlLmRlcGVuZGVuY3lUcmFja2luZyA9IG51bGw7XG4gICAgICAgICAgICAgICAgc3RhdGUuZGVwZW5kZW5jaWVzQ291bnQgPSAwO1xuICAgICAgICAgICAgICAgIHN0YXRlLmlzU3RhbGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgIGNvbXB1dGVkT2JzZXJ2YWJsZS5ldmFsdWF0ZUltbWVkaWF0ZSgpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBGaXJzdCBwdXQgdGhlIGRlcGVuZGVuY2llcyBpbiBvcmRlclxuICAgICAgICAgICAgICAgIHZhciBkZXBlbmRlY2llc09yZGVyID0gW107XG4gICAgICAgICAgICAgICAga28udXRpbHMub2JqZWN0Rm9yRWFjaChzdGF0ZS5kZXBlbmRlbmN5VHJhY2tpbmcsIGZ1bmN0aW9uIChpZCwgZGVwZW5kZW5jeSkge1xuICAgICAgICAgICAgICAgICAgICBkZXBlbmRlY2llc09yZGVyW2RlcGVuZGVuY3kuX29yZGVyXSA9IGlkO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIC8vIE5leHQsIHN1YnNjcmliZSB0byBlYWNoIG9uZVxuICAgICAgICAgICAgICAgIGtvLnV0aWxzLmFycmF5Rm9yRWFjaChkZXBlbmRlY2llc09yZGVyLCBmdW5jdGlvbiAoaWQsIG9yZGVyKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBkZXBlbmRlbmN5ID0gc3RhdGUuZGVwZW5kZW5jeVRyYWNraW5nW2lkXSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1YnNjcmlwdGlvbiA9IGNvbXB1dGVkT2JzZXJ2YWJsZS5zdWJzY3JpYmVUb0RlcGVuZGVuY3koZGVwZW5kZW5jeS5fdGFyZ2V0KTtcbiAgICAgICAgICAgICAgICAgICAgc3Vic2NyaXB0aW9uLl9vcmRlciA9IG9yZGVyO1xuICAgICAgICAgICAgICAgICAgICBzdWJzY3JpcHRpb24uX3ZlcnNpb24gPSBkZXBlbmRlbmN5Ll92ZXJzaW9uO1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5kZXBlbmRlbmN5VHJhY2tpbmdbaWRdID0gc3Vic2NyaXB0aW9uO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFzdGF0ZS5pc0Rpc3Bvc2VkKSB7ICAgICAvLyB0ZXN0IHNpbmNlIGV2YWx1YXRpbmcgY291bGQgdHJpZ2dlciBkaXNwb3NhbFxuICAgICAgICAgICAgICAgIGNvbXB1dGVkT2JzZXJ2YWJsZVtcIm5vdGlmeVN1YnNjcmliZXJzXCJdKHN0YXRlLmxhdGVzdFZhbHVlLCBcImF3YWtlXCIpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfSxcbiAgICBhZnRlclN1YnNjcmlwdGlvblJlbW92ZTogZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgIHZhciBzdGF0ZSA9IHRoaXNbY29tcHV0ZWRTdGF0ZV07XG4gICAgICAgIGlmICghc3RhdGUuaXNEaXNwb3NlZCAmJiBldmVudCA9PSAnY2hhbmdlJyAmJiAhdGhpcy5oYXNTdWJzY3JpcHRpb25zRm9yRXZlbnQoJ2NoYW5nZScpKSB7XG4gICAgICAgICAgICBrby51dGlscy5vYmplY3RGb3JFYWNoKHN0YXRlLmRlcGVuZGVuY3lUcmFja2luZywgZnVuY3Rpb24gKGlkLCBkZXBlbmRlbmN5KSB7XG4gICAgICAgICAgICAgICAgaWYgKGRlcGVuZGVuY3kuZGlzcG9zZSkge1xuICAgICAgICAgICAgICAgICAgICBzdGF0ZS5kZXBlbmRlbmN5VHJhY2tpbmdbaWRdID0ge1xuICAgICAgICAgICAgICAgICAgICAgICAgX3RhcmdldDogZGVwZW5kZW5jeS5fdGFyZ2V0LFxuICAgICAgICAgICAgICAgICAgICAgICAgX29yZGVyOiBkZXBlbmRlbmN5Ll9vcmRlcixcbiAgICAgICAgICAgICAgICAgICAgICAgIF92ZXJzaW9uOiBkZXBlbmRlbmN5Ll92ZXJzaW9uXG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgICAgIGRlcGVuZGVuY3kuZGlzcG9zZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgc3RhdGUuaXNTbGVlcGluZyA9IHRydWU7XG4gICAgICAgICAgICB0aGlzW1wibm90aWZ5U3Vic2NyaWJlcnNcIl0odW5kZWZpbmVkLCBcImFzbGVlcFwiKTtcbiAgICAgICAgfVxuICAgIH0sXG4gICAgZ2V0VmVyc2lvbjogZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBCZWNhdXNlIGEgcHVyZSBjb21wdXRlZCBpcyBub3QgYXV0b21hdGljYWxseSB1cGRhdGVkIHdoaWxlIGl0IGlzIHNsZWVwaW5nLCB3ZSBjYW4ndFxuICAgICAgICAvLyBzaW1wbHkgcmV0dXJuIHRoZSB2ZXJzaW9uIG51bWJlci4gSW5zdGVhZCwgd2UgY2hlY2sgaWYgYW55IG9mIHRoZSBkZXBlbmRlbmNpZXMgaGF2ZVxuICAgICAgICAvLyBjaGFuZ2VkIGFuZCBjb25kaXRpb25hbGx5IHJlLWV2YWx1YXRlIHRoZSBjb21wdXRlZCBvYnNlcnZhYmxlLlxuICAgICAgICB2YXIgc3RhdGUgPSB0aGlzW2NvbXB1dGVkU3RhdGVdO1xuICAgICAgICBpZiAoc3RhdGUuaXNTbGVlcGluZyAmJiAoc3RhdGUuaXNTdGFsZSB8fCB0aGlzLmhhdmVEZXBlbmRlbmNpZXNDaGFuZ2VkKCkpKSB7XG4gICAgICAgICAgICB0aGlzLmV2YWx1YXRlSW1tZWRpYXRlKCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGtvLnN1YnNjcmliYWJsZVsnZm4nXS5nZXRWZXJzaW9uLmNhbGwodGhpcyk7XG4gICAgfVxufTtcblxudmFyIGRlZmVyRXZhbHVhdGlvbk92ZXJyaWRlcyA9IHtcbiAgICBiZWZvcmVTdWJzY3JpcHRpb25BZGQ6IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAvLyBUaGlzIHdpbGwgZm9yY2UgYSBjb21wdXRlZCB3aXRoIGRlZmVyRXZhbHVhdGlvbiB0byBldmFsdWF0ZSB3aGVuIHRoZSBmaXJzdCBzdWJzY3JpcHRpb24gaXMgcmVnaXN0ZXJlZC5cbiAgICAgICAgaWYgKGV2ZW50ID09ICdjaGFuZ2UnIHx8IGV2ZW50ID09ICdiZWZvcmVDaGFuZ2UnKSB7XG4gICAgICAgICAgICB0aGlzLnBlZWsoKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8vIE5vdGUgdGhhdCBmb3IgYnJvd3NlcnMgdGhhdCBkb24ndCBzdXBwb3J0IHByb3RvIGFzc2lnbm1lbnQsIHRoZVxuLy8gaW5oZXJpdGFuY2UgY2hhaW4gaXMgY3JlYXRlZCBtYW51YWxseSBpbiB0aGUga28uY29tcHV0ZWQgY29uc3RydWN0b3JcbmlmIChrby51dGlscy5jYW5TZXRQcm90b3R5cGUpIHtcbiAgICBrby51dGlscy5zZXRQcm90b3R5cGVPZihjb21wdXRlZEZuLCBrby5zdWJzY3JpYmFibGVbJ2ZuJ10pO1xufVxuXG4vLyBTZXQgdGhlIHByb3RvIGNoYWluIHZhbHVlcyBmb3Iga28uaGFzUHJvdG90eXBlXG52YXIgcHJvdG9Qcm9wID0ga28ub2JzZXJ2YWJsZS5wcm90b1Byb3BlcnR5OyAvLyA9PSBcIl9fa29fcHJvdG9fX1wiXG5rby5jb21wdXRlZFtwcm90b1Byb3BdID0ga28ub2JzZXJ2YWJsZTtcbmNvbXB1dGVkRm5bcHJvdG9Qcm9wXSA9IGtvLmNvbXB1dGVkO1xuXG5rby5pc0NvbXB1dGVkID0gZnVuY3Rpb24gKGluc3RhbmNlKSB7XG4gICAgcmV0dXJuIGtvLmhhc1Byb3RvdHlwZShpbnN0YW5jZSwga28uY29tcHV0ZWQpO1xufTtcblxua28uaXNQdXJlQ29tcHV0ZWQgPSBmdW5jdGlvbiAoaW5zdGFuY2UpIHtcbiAgICByZXR1cm4ga28uaGFzUHJvdG90eXBlKGluc3RhbmNlLCBrby5jb21wdXRlZClcbiAgICAgICAgJiYgaW5zdGFuY2VbY29tcHV0ZWRTdGF0ZV0gJiYgaW5zdGFuY2VbY29tcHV0ZWRTdGF0ZV0ucHVyZTtcbn07XG5cbmtvLmV4cG9ydFN5bWJvbCgnY29tcHV0ZWQnLCBrby5jb21wdXRlZCk7XG5rby5leHBvcnRTeW1ib2woJ2RlcGVuZGVudE9ic2VydmFibGUnLCBrby5jb21wdXRlZCk7ICAgIC8vIGV4cG9ydCBrby5kZXBlbmRlbnRPYnNlcnZhYmxlIGZvciBiYWNrd2FyZHMgY29tcGF0aWJpbGl0eSAoMS54KVxua28uZXhwb3J0U3ltYm9sKCdpc0NvbXB1dGVkJywga28uaXNDb21wdXRlZCk7XG5rby5leHBvcnRTeW1ib2woJ2lzUHVyZUNvbXB1dGVkJywga28uaXNQdXJlQ29tcHV0ZWQpO1xua28uZXhwb3J0U3ltYm9sKCdjb21wdXRlZC5mbicsIGNvbXB1dGVkRm4pO1xua28uZXhwb3J0UHJvcGVydHkoY29tcHV0ZWRGbiwgJ3BlZWsnLCBjb21wdXRlZEZuLnBlZWspO1xua28uZXhwb3J0UHJvcGVydHkoY29tcHV0ZWRGbiwgJ2Rpc3Bvc2UnLCBjb21wdXRlZEZuLmRpc3Bvc2UpO1xua28uZXhwb3J0UHJvcGVydHkoY29tcHV0ZWRGbiwgJ2lzQWN0aXZlJywgY29tcHV0ZWRGbi5pc0FjdGl2ZSk7XG5rby5leHBvcnRQcm9wZXJ0eShjb21wdXRlZEZuLCAnZ2V0RGVwZW5kZW5jaWVzQ291bnQnLCBjb21wdXRlZEZuLmdldERlcGVuZGVuY2llc0NvdW50KTtcblxua28ucHVyZUNvbXB1dGVkID0gZnVuY3Rpb24gKGV2YWx1YXRvckZ1bmN0aW9uT3JPcHRpb25zLCBldmFsdWF0b3JGdW5jdGlvblRhcmdldCkge1xuICAgIGlmICh0eXBlb2YgZXZhbHVhdG9yRnVuY3Rpb25Pck9wdGlvbnMgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgcmV0dXJuIGtvLmNvbXB1dGVkKGV2YWx1YXRvckZ1bmN0aW9uT3JPcHRpb25zLCBldmFsdWF0b3JGdW5jdGlvblRhcmdldCwgeydwdXJlJzp0cnVlfSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgZXZhbHVhdG9yRnVuY3Rpb25Pck9wdGlvbnMgPSBrby51dGlscy5leHRlbmQoe30sIGV2YWx1YXRvckZ1bmN0aW9uT3JPcHRpb25zKTsgICAvLyBtYWtlIGEgY29weSBvZiB0aGUgcGFyYW1ldGVyIG9iamVjdFxuICAgICAgICBldmFsdWF0b3JGdW5jdGlvbk9yT3B0aW9uc1sncHVyZSddID0gdHJ1ZTtcbiAgICAgICAgcmV0dXJuIGtvLmNvbXB1dGVkKGV2YWx1YXRvckZ1bmN0aW9uT3JPcHRpb25zLCBldmFsdWF0b3JGdW5jdGlvblRhcmdldCk7XG4gICAgfVxufVxua28uZXhwb3J0U3ltYm9sKCdwdXJlQ29tcHV0ZWQnLCBrby5wdXJlQ29tcHV0ZWQpO1xuXG4oZnVuY3Rpb24oKSB7XG4gICAgdmFyIG1heE5lc3RlZE9ic2VydmFibGVEZXB0aCA9IDEwOyAvLyBFc2NhcGUgdGhlICh1bmxpa2VseSkgcGF0aGFsb2dpY2FsIGNhc2Ugd2hlcmUgYW4gb2JzZXJ2YWJsZSdzIGN1cnJlbnQgdmFsdWUgaXMgaXRzZWxmIChvciBzaW1pbGFyIHJlZmVyZW5jZSBjeWNsZSlcblxuICAgIGtvLnRvSlMgPSBmdW5jdGlvbihyb290T2JqZWN0KSB7XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09IDApXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJXaGVuIGNhbGxpbmcga28udG9KUywgcGFzcyB0aGUgb2JqZWN0IHlvdSB3YW50IHRvIGNvbnZlcnQuXCIpO1xuXG4gICAgICAgIC8vIFdlIGp1c3QgdW53cmFwIGV2ZXJ5dGhpbmcgYXQgZXZlcnkgbGV2ZWwgaW4gdGhlIG9iamVjdCBncmFwaFxuICAgICAgICByZXR1cm4gbWFwSnNPYmplY3RHcmFwaChyb290T2JqZWN0LCBmdW5jdGlvbih2YWx1ZVRvTWFwKSB7XG4gICAgICAgICAgICAvLyBMb29wIGJlY2F1c2UgYW4gb2JzZXJ2YWJsZSdzIHZhbHVlIG1pZ2h0IGluIHR1cm4gYmUgYW5vdGhlciBvYnNlcnZhYmxlIHdyYXBwZXJcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBrby5pc09ic2VydmFibGUodmFsdWVUb01hcCkgJiYgKGkgPCBtYXhOZXN0ZWRPYnNlcnZhYmxlRGVwdGgpOyBpKyspXG4gICAgICAgICAgICAgICAgdmFsdWVUb01hcCA9IHZhbHVlVG9NYXAoKTtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZVRvTWFwO1xuICAgICAgICB9KTtcbiAgICB9O1xuXG4gICAga28udG9KU09OID0gZnVuY3Rpb24ocm9vdE9iamVjdCwgcmVwbGFjZXIsIHNwYWNlKSB7ICAgICAvLyByZXBsYWNlciBhbmQgc3BhY2UgYXJlIG9wdGlvbmFsXG4gICAgICAgIHZhciBwbGFpbkphdmFTY3JpcHRPYmplY3QgPSBrby50b0pTKHJvb3RPYmplY3QpO1xuICAgICAgICByZXR1cm4ga28udXRpbHMuc3RyaW5naWZ5SnNvbihwbGFpbkphdmFTY3JpcHRPYmplY3QsIHJlcGxhY2VyLCBzcGFjZSk7XG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIG1hcEpzT2JqZWN0R3JhcGgocm9vdE9iamVjdCwgbWFwSW5wdXRDYWxsYmFjaywgdmlzaXRlZE9iamVjdHMpIHtcbiAgICAgICAgdmlzaXRlZE9iamVjdHMgPSB2aXNpdGVkT2JqZWN0cyB8fCBuZXcgb2JqZWN0TG9va3VwKCk7XG5cbiAgICAgICAgcm9vdE9iamVjdCA9IG1hcElucHV0Q2FsbGJhY2socm9vdE9iamVjdCk7XG4gICAgICAgIHZhciBjYW5IYXZlUHJvcGVydGllcyA9ICh0eXBlb2Ygcm9vdE9iamVjdCA9PSBcIm9iamVjdFwiKSAmJiAocm9vdE9iamVjdCAhPT0gbnVsbCkgJiYgKHJvb3RPYmplY3QgIT09IHVuZGVmaW5lZCkgJiYgKCEocm9vdE9iamVjdCBpbnN0YW5jZW9mIFJlZ0V4cCkpICYmICghKHJvb3RPYmplY3QgaW5zdGFuY2VvZiBEYXRlKSkgJiYgKCEocm9vdE9iamVjdCBpbnN0YW5jZW9mIFN0cmluZykpICYmICghKHJvb3RPYmplY3QgaW5zdGFuY2VvZiBOdW1iZXIpKSAmJiAoIShyb290T2JqZWN0IGluc3RhbmNlb2YgQm9vbGVhbikpO1xuICAgICAgICBpZiAoIWNhbkhhdmVQcm9wZXJ0aWVzKVxuICAgICAgICAgICAgcmV0dXJuIHJvb3RPYmplY3Q7XG5cbiAgICAgICAgdmFyIG91dHB1dFByb3BlcnRpZXMgPSByb290T2JqZWN0IGluc3RhbmNlb2YgQXJyYXkgPyBbXSA6IHt9O1xuICAgICAgICB2aXNpdGVkT2JqZWN0cy5zYXZlKHJvb3RPYmplY3QsIG91dHB1dFByb3BlcnRpZXMpO1xuXG4gICAgICAgIHZpc2l0UHJvcGVydGllc09yQXJyYXlFbnRyaWVzKHJvb3RPYmplY3QsIGZ1bmN0aW9uKGluZGV4ZXIpIHtcbiAgICAgICAgICAgIHZhciBwcm9wZXJ0eVZhbHVlID0gbWFwSW5wdXRDYWxsYmFjayhyb290T2JqZWN0W2luZGV4ZXJdKTtcblxuICAgICAgICAgICAgc3dpdGNoICh0eXBlb2YgcHJvcGVydHlWYWx1ZSkge1xuICAgICAgICAgICAgICAgIGNhc2UgXCJib29sZWFuXCI6XG4gICAgICAgICAgICAgICAgY2FzZSBcIm51bWJlclwiOlxuICAgICAgICAgICAgICAgIGNhc2UgXCJzdHJpbmdcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwiZnVuY3Rpb25cIjpcbiAgICAgICAgICAgICAgICAgICAgb3V0cHV0UHJvcGVydGllc1tpbmRleGVyXSA9IHByb3BlcnR5VmFsdWU7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgXCJvYmplY3RcIjpcbiAgICAgICAgICAgICAgICBjYXNlIFwidW5kZWZpbmVkXCI6XG4gICAgICAgICAgICAgICAgICAgIHZhciBwcmV2aW91c2x5TWFwcGVkVmFsdWUgPSB2aXNpdGVkT2JqZWN0cy5nZXQocHJvcGVydHlWYWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgIG91dHB1dFByb3BlcnRpZXNbaW5kZXhlcl0gPSAocHJldmlvdXNseU1hcHBlZFZhbHVlICE9PSB1bmRlZmluZWQpXG4gICAgICAgICAgICAgICAgICAgICAgICA/IHByZXZpb3VzbHlNYXBwZWRWYWx1ZVxuICAgICAgICAgICAgICAgICAgICAgICAgOiBtYXBKc09iamVjdEdyYXBoKHByb3BlcnR5VmFsdWUsIG1hcElucHV0Q2FsbGJhY2ssIHZpc2l0ZWRPYmplY3RzKTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBvdXRwdXRQcm9wZXJ0aWVzO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHZpc2l0UHJvcGVydGllc09yQXJyYXlFbnRyaWVzKHJvb3RPYmplY3QsIHZpc2l0b3JDYWxsYmFjaykge1xuICAgICAgICBpZiAocm9vdE9iamVjdCBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHJvb3RPYmplY3QubGVuZ3RoOyBpKyspXG4gICAgICAgICAgICAgICAgdmlzaXRvckNhbGxiYWNrKGkpO1xuXG4gICAgICAgICAgICAvLyBGb3IgYXJyYXlzLCBhbHNvIHJlc3BlY3QgdG9KU09OIHByb3BlcnR5IGZvciBjdXN0b20gbWFwcGluZ3MgKGZpeGVzICMyNzgpXG4gICAgICAgICAgICBpZiAodHlwZW9mIHJvb3RPYmplY3RbJ3RvSlNPTiddID09ICdmdW5jdGlvbicpXG4gICAgICAgICAgICAgICAgdmlzaXRvckNhbGxiYWNrKCd0b0pTT04nKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGZvciAodmFyIHByb3BlcnR5TmFtZSBpbiByb290T2JqZWN0KSB7XG4gICAgICAgICAgICAgICAgdmlzaXRvckNhbGxiYWNrKHByb3BlcnR5TmFtZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgZnVuY3Rpb24gb2JqZWN0TG9va3VwKCkge1xuICAgICAgICB0aGlzLmtleXMgPSBbXTtcbiAgICAgICAgdGhpcy52YWx1ZXMgPSBbXTtcbiAgICB9O1xuXG4gICAgb2JqZWN0TG9va3VwLnByb3RvdHlwZSA9IHtcbiAgICAgICAgY29uc3RydWN0b3I6IG9iamVjdExvb2t1cCxcbiAgICAgICAgc2F2ZTogZnVuY3Rpb24oa2V5LCB2YWx1ZSkge1xuICAgICAgICAgICAgdmFyIGV4aXN0aW5nSW5kZXggPSBrby51dGlscy5hcnJheUluZGV4T2YodGhpcy5rZXlzLCBrZXkpO1xuICAgICAgICAgICAgaWYgKGV4aXN0aW5nSW5kZXggPj0gMClcbiAgICAgICAgICAgICAgICB0aGlzLnZhbHVlc1tleGlzdGluZ0luZGV4XSA9IHZhbHVlO1xuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdGhpcy5rZXlzLnB1c2goa2V5KTtcbiAgICAgICAgICAgICAgICB0aGlzLnZhbHVlcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcbiAgICAgICAgZ2V0OiBmdW5jdGlvbihrZXkpIHtcbiAgICAgICAgICAgIHZhciBleGlzdGluZ0luZGV4ID0ga28udXRpbHMuYXJyYXlJbmRleE9mKHRoaXMua2V5cywga2V5KTtcbiAgICAgICAgICAgIHJldHVybiAoZXhpc3RpbmdJbmRleCA+PSAwKSA/IHRoaXMudmFsdWVzW2V4aXN0aW5nSW5kZXhdIDogdW5kZWZpbmVkO1xuICAgICAgICB9XG4gICAgfTtcbn0pKCk7XG5cbmtvLmV4cG9ydFN5bWJvbCgndG9KUycsIGtvLnRvSlMpO1xua28uZXhwb3J0U3ltYm9sKCd0b0pTT04nLCBrby50b0pTT04pO1xuKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgaGFzRG9tRGF0YUV4cGFuZG9Qcm9wZXJ0eSA9ICdfX2tvX19oYXNEb21EYXRhT3B0aW9uVmFsdWVfXyc7XG5cbiAgICAvLyBOb3JtYWxseSwgU0VMRUNUIGVsZW1lbnRzIGFuZCB0aGVpciBPUFRJT05zIGNhbiBvbmx5IHRha2UgdmFsdWUgb2YgdHlwZSAnc3RyaW5nJyAoYmVjYXVzZSB0aGUgdmFsdWVzXG4gICAgLy8gYXJlIHN0b3JlZCBvbiBET00gYXR0cmlidXRlcykuIGtvLnNlbGVjdEV4dGVuc2lvbnMgcHJvdmlkZXMgYSB3YXkgZm9yIFNFTEVDVHMvT1BUSU9OcyB0byBoYXZlIHZhbHVlc1xuICAgIC8vIHRoYXQgYXJlIGFyYml0cmFyeSBvYmplY3RzLiBUaGlzIGlzIHZlcnkgY29udmVuaWVudCB3aGVuIGltcGxlbWVudGluZyB0aGluZ3MgbGlrZSBjYXNjYWRpbmcgZHJvcGRvd25zLlxuICAgIGtvLnNlbGVjdEV4dGVuc2lvbnMgPSB7XG4gICAgICAgIHJlYWRWYWx1ZSA6IGZ1bmN0aW9uKGVsZW1lbnQpIHtcbiAgICAgICAgICAgIHN3aXRjaCAoa28udXRpbHMudGFnTmFtZUxvd2VyKGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAnb3B0aW9uJzpcbiAgICAgICAgICAgICAgICAgICAgaWYgKGVsZW1lbnRbaGFzRG9tRGF0YUV4cGFuZG9Qcm9wZXJ0eV0gPT09IHRydWUpXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ga28udXRpbHMuZG9tRGF0YS5nZXQoZWxlbWVudCwga28uYmluZGluZ0hhbmRsZXJzLm9wdGlvbnMub3B0aW9uVmFsdWVEb21EYXRhS2V5KTtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGtvLnV0aWxzLmllVmVyc2lvbiA8PSA3XG4gICAgICAgICAgICAgICAgICAgICAgICA/IChlbGVtZW50LmdldEF0dHJpYnV0ZU5vZGUoJ3ZhbHVlJykgJiYgZWxlbWVudC5nZXRBdHRyaWJ1dGVOb2RlKCd2YWx1ZScpLnNwZWNpZmllZCA/IGVsZW1lbnQudmFsdWUgOiBlbGVtZW50LnRleHQpXG4gICAgICAgICAgICAgICAgICAgICAgICA6IGVsZW1lbnQudmFsdWU7XG4gICAgICAgICAgICAgICAgY2FzZSAnc2VsZWN0JzpcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQuc2VsZWN0ZWRJbmRleCA+PSAwID8ga28uc2VsZWN0RXh0ZW5zaW9ucy5yZWFkVmFsdWUoZWxlbWVudC5vcHRpb25zW2VsZW1lbnQuc2VsZWN0ZWRJbmRleF0pIDogdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBlbGVtZW50LnZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHdyaXRlVmFsdWU6IGZ1bmN0aW9uKGVsZW1lbnQsIHZhbHVlLCBhbGxvd1Vuc2V0KSB7XG4gICAgICAgICAgICBzd2l0Y2ggKGtvLnV0aWxzLnRhZ05hbWVMb3dlcihlbGVtZW50KSkge1xuICAgICAgICAgICAgICAgIGNhc2UgJ29wdGlvbic6XG4gICAgICAgICAgICAgICAgICAgIHN3aXRjaCh0eXBlb2YgdmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhc2UgXCJzdHJpbmdcIjpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBrby51dGlscy5kb21EYXRhLnNldChlbGVtZW50LCBrby5iaW5kaW5nSGFuZGxlcnMub3B0aW9ucy5vcHRpb25WYWx1ZURvbURhdGFLZXksIHVuZGVmaW5lZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhc0RvbURhdGFFeHBhbmRvUHJvcGVydHkgaW4gZWxlbWVudCkgeyAvLyBJRSA8PSA4IHRocm93cyBlcnJvcnMgaWYgeW91IGRlbGV0ZSBub24tZXhpc3RlbnQgcHJvcGVydGllcyBmcm9tIGEgRE9NIG5vZGVcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVsZXRlIGVsZW1lbnRbaGFzRG9tRGF0YUV4cGFuZG9Qcm9wZXJ0eV07XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3RvcmUgYXJiaXRyYXJ5IG9iamVjdCB1c2luZyBEb21EYXRhXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAga28udXRpbHMuZG9tRGF0YS5zZXQoZWxlbWVudCwga28uYmluZGluZ0hhbmRsZXJzLm9wdGlvbnMub3B0aW9uVmFsdWVEb21EYXRhS2V5LCB2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudFtoYXNEb21EYXRhRXhwYW5kb1Byb3BlcnR5XSA9IHRydWU7XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBTcGVjaWFsIHRyZWF0bWVudCBvZiBudW1iZXJzIGlzIGp1c3QgZm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHkuIEtPIDEuMi4xIHdyb3RlIG51bWVyaWNhbCB2YWx1ZXMgdG8gZWxlbWVudC52YWx1ZS5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbGVtZW50LnZhbHVlID0gdHlwZW9mIHZhbHVlID09PSBcIm51bWJlclwiID8gdmFsdWUgOiBcIlwiO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIGNhc2UgJ3NlbGVjdCc6XG4gICAgICAgICAgICAgICAgICAgIGlmICh2YWx1ZSA9PT0gXCJcIiB8fCB2YWx1ZSA9PT0gbnVsbCkgICAgICAgLy8gQSBibGFuayBzdHJpbmcgb3IgbnVsbCB2YWx1ZSB3aWxsIHNlbGVjdCB0aGUgY2FwdGlvblxuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzZWxlY3Rpb24gPSAtMTtcbiAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIG4gPSBlbGVtZW50Lm9wdGlvbnMubGVuZ3RoLCBvcHRpb25WYWx1ZTsgaSA8IG47ICsraSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgb3B0aW9uVmFsdWUgPSBrby5zZWxlY3RFeHRlbnNpb25zLnJlYWRWYWx1ZShlbGVtZW50Lm9wdGlvbnNbaV0pO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gSW5jbHVkZSBzcGVjaWFsIGNoZWNrIHRvIGhhbmRsZSBzZWxlY3RpbmcgYSBjYXB0aW9uIHdpdGggYSBibGFuayBzdHJpbmcgdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChvcHRpb25WYWx1ZSA9PSB2YWx1ZSB8fCAob3B0aW9uVmFsdWUgPT0gXCJcIiAmJiB2YWx1ZSA9PT0gdW5kZWZpbmVkKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbiA9IGk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgaWYgKGFsbG93VW5zZXQgfHwgc2VsZWN0aW9uID49IDAgfHwgKHZhbHVlID09PSB1bmRlZmluZWQgJiYgZWxlbWVudC5zaXplID4gMSkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGVsZW1lbnQuc2VsZWN0ZWRJbmRleCA9IHNlbGVjdGlvbjtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICBkZWZhdWx0OlxuICAgICAgICAgICAgICAgICAgICBpZiAoKHZhbHVlID09PSBudWxsKSB8fCAodmFsdWUgPT09IHVuZGVmaW5lZCkpXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZSA9IFwiXCI7XG4gICAgICAgICAgICAgICAgICAgIGVsZW1lbnQudmFsdWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xufSkoKTtcblxua28uZXhwb3J0U3ltYm9sKCdzZWxlY3RFeHRlbnNpb25zJywga28uc2VsZWN0RXh0ZW5zaW9ucyk7XG5rby5leHBvcnRTeW1ib2woJ3NlbGVjdEV4dGVuc2lvbnMucmVhZFZhbHVlJywga28uc2VsZWN0RXh0ZW5zaW9ucy5yZWFkVmFsdWUpO1xua28uZXhwb3J0U3ltYm9sKCdzZWxlY3RFeHRlbnNpb25zLndyaXRlVmFsdWUnLCBrby5zZWxlY3RFeHRlbnNpb25zLndyaXRlVmFsdWUpO1xua28uZXhwcmVzc2lvblJld3JpdGluZyA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIGphdmFTY3JpcHRSZXNlcnZlZFdvcmRzID0gW1widHJ1ZVwiLCBcImZhbHNlXCIsIFwibnVsbFwiLCBcInVuZGVmaW5lZFwiXTtcblxuICAgIC8vIE1hdGNoZXMgc29tZXRoaW5nIHRoYXQgY2FuIGJlIGFzc2lnbmVkIHRvLS1laXRoZXIgYW4gaXNvbGF0ZWQgaWRlbnRpZmllciBvciBzb21ldGhpbmcgZW5kaW5nIHdpdGggYSBwcm9wZXJ0eSBhY2Nlc3NvclxuICAgIC8vIFRoaXMgaXMgZGVzaWduZWQgdG8gYmUgc2ltcGxlIGFuZCBhdm9pZCBmYWxzZSBuZWdhdGl2ZXMsIGJ1dCBjb3VsZCBwcm9kdWNlIGZhbHNlIHBvc2l0aXZlcyAoZS5nLiwgYStiLmMpLlxuICAgIC8vIFRoaXMgYWxzbyB3aWxsIG5vdCBwcm9wZXJseSBoYW5kbGUgbmVzdGVkIGJyYWNrZXRzIChlLmcuLCBvYmoxW29iajJbJ3Byb3AnXV07IHNlZSAjOTExKS5cbiAgICB2YXIgamF2YVNjcmlwdEFzc2lnbm1lbnRUYXJnZXQgPSAvXig/OlskX2Etel1bJFxcd10qfCguKykoXFwuXFxzKlskX2Etel1bJFxcd10qfFxcWy4rXFxdKSkkL2k7XG5cbiAgICBmdW5jdGlvbiBnZXRXcml0ZWFibGVWYWx1ZShleHByZXNzaW9uKSB7XG4gICAgICAgIGlmIChrby51dGlscy5hcnJheUluZGV4T2YoamF2YVNjcmlwdFJlc2VydmVkV29yZHMsIGV4cHJlc3Npb24pID49IDApXG4gICAgICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICAgIHZhciBtYXRjaCA9IGV4cHJlc3Npb24ubWF0Y2goamF2YVNjcmlwdEFzc2lnbm1lbnRUYXJnZXQpO1xuICAgICAgICByZXR1cm4gbWF0Y2ggPT09IG51bGwgPyBmYWxzZSA6IG1hdGNoWzFdID8gKCdPYmplY3QoJyArIG1hdGNoWzFdICsgJyknICsgbWF0Y2hbMl0pIDogZXhwcmVzc2lvbjtcbiAgICB9XG5cbiAgICAvLyBUaGUgZm9sbG93aW5nIHJlZ3VsYXIgZXhwcmVzc2lvbnMgd2lsbCBiZSB1c2VkIHRvIHNwbGl0IGFuIG9iamVjdC1saXRlcmFsIHN0cmluZyBpbnRvIHRva2Vuc1xuXG4gICAgICAgIC8vIFRoZXNlIHR3byBtYXRjaCBzdHJpbmdzLCBlaXRoZXIgd2l0aCBkb3VibGUgcXVvdGVzIG9yIHNpbmdsZSBxdW90ZXNcbiAgICB2YXIgc3RyaW5nRG91YmxlID0gJ1wiKD86W15cIlxcXFxcXFxcXXxcXFxcXFxcXC4pKlwiJyxcbiAgICAgICAgc3RyaW5nU2luZ2xlID0gXCInKD86W14nXFxcXFxcXFxdfFxcXFxcXFxcLikqJ1wiLFxuICAgICAgICAvLyBNYXRjaGVzIGEgcmVndWxhciBleHByZXNzaW9uICh0ZXh0IGVuY2xvc2VkIGJ5IHNsYXNoZXMpLCBidXQgd2lsbCBhbHNvIG1hdGNoIHNldHMgb2YgZGl2aXNpb25zXG4gICAgICAgIC8vIGFzIGEgcmVndWxhciBleHByZXNzaW9uICh0aGlzIGlzIGhhbmRsZWQgYnkgdGhlIHBhcnNpbmcgbG9vcCBiZWxvdykuXG4gICAgICAgIHN0cmluZ1JlZ2V4cCA9ICcvKD86W14vXFxcXFxcXFxdfFxcXFxcXFxcLikqL1xcdyonLFxuICAgICAgICAvLyBUaGVzZSBjaGFyYWN0ZXJzIGhhdmUgc3BlY2lhbCBtZWFuaW5nIHRvIHRoZSBwYXJzZXIgYW5kIG11c3Qgbm90IGFwcGVhciBpbiB0aGUgbWlkZGxlIG9mIGFcbiAgICAgICAgLy8gdG9rZW4sIGV4Y2VwdCBhcyBwYXJ0IG9mIGEgc3RyaW5nLlxuICAgICAgICBzcGVjaWFscyA9ICcsXCJcXCd7fSgpLzpbXFxcXF0nLFxuICAgICAgICAvLyBNYXRjaCB0ZXh0IChhdCBsZWFzdCB0d28gY2hhcmFjdGVycykgdGhhdCBkb2VzIG5vdCBjb250YWluIGFueSBvZiB0aGUgYWJvdmUgc3BlY2lhbCBjaGFyYWN0ZXJzLFxuICAgICAgICAvLyBhbHRob3VnaCBzb21lIG9mIHRoZSBzcGVjaWFsIGNoYXJhY3RlcnMgYXJlIGFsbG93ZWQgdG8gc3RhcnQgaXQgKGFsbCBidXQgdGhlIGNvbG9uIGFuZCBjb21tYSkuXG4gICAgICAgIC8vIFRoZSB0ZXh0IGNhbiBjb250YWluIHNwYWNlcywgYnV0IGxlYWRpbmcgb3IgdHJhaWxpbmcgc3BhY2VzIGFyZSBza2lwcGVkLlxuICAgICAgICBldmVyeVRoaW5nRWxzZSA9ICdbXlxcXFxzOiwvXVteJyArIHNwZWNpYWxzICsgJ10qW15cXFxccycgKyBzcGVjaWFscyArICddJyxcbiAgICAgICAgLy8gTWF0Y2ggYW55IG5vbi1zcGFjZSBjaGFyYWN0ZXIgbm90IG1hdGNoZWQgYWxyZWFkeS4gVGhpcyB3aWxsIG1hdGNoIGNvbG9ucyBhbmQgY29tbWFzLCBzaW5jZSB0aGV5J3JlXG4gICAgICAgIC8vIG5vdCBtYXRjaGVkIGJ5IFwiZXZlcnlUaGluZ0Vsc2VcIiwgYnV0IHdpbGwgYWxzbyBtYXRjaCBhbnkgb3RoZXIgc2luZ2xlIGNoYXJhY3RlciB0aGF0IHdhc24ndCBhbHJlYWR5XG4gICAgICAgIC8vIG1hdGNoZWQgKGZvciBleGFtcGxlOiBpbiBcImE6IDEsIGI6IDJcIiwgZWFjaCBvZiB0aGUgbm9uLXNwYWNlIGNoYXJhY3RlcnMgd2lsbCBiZSBtYXRjaGVkIGJ5IG9uZU5vdFNwYWNlKS5cbiAgICAgICAgb25lTm90U3BhY2UgPSAnW15cXFxcc10nLFxuXG4gICAgICAgIC8vIENyZWF0ZSB0aGUgYWN0dWFsIHJlZ3VsYXIgZXhwcmVzc2lvbiBieSBvci1pbmcgdGhlIGFib3ZlIHN0cmluZ3MuIFRoZSBvcmRlciBpcyBpbXBvcnRhbnQuXG4gICAgICAgIGJpbmRpbmdUb2tlbiA9IFJlZ0V4cChzdHJpbmdEb3VibGUgKyAnfCcgKyBzdHJpbmdTaW5nbGUgKyAnfCcgKyBzdHJpbmdSZWdleHAgKyAnfCcgKyBldmVyeVRoaW5nRWxzZSArICd8JyArIG9uZU5vdFNwYWNlLCAnZycpLFxuXG4gICAgICAgIC8vIE1hdGNoIGVuZCBvZiBwcmV2aW91cyB0b2tlbiB0byBkZXRlcm1pbmUgd2hldGhlciBhIHNsYXNoIGlzIGEgZGl2aXNpb24gb3IgcmVnZXguXG4gICAgICAgIGRpdmlzaW9uTG9va0JlaGluZCA9IC9bXFxdKVwiJ0EtWmEtejAtOV8kXSskLyxcbiAgICAgICAga2V5d29yZFJlZ2V4TG9va0JlaGluZCA9IHsnaW4nOjEsJ3JldHVybic6MSwndHlwZW9mJzoxfTtcblxuICAgIGZ1bmN0aW9uIHBhcnNlT2JqZWN0TGl0ZXJhbChvYmplY3RMaXRlcmFsU3RyaW5nKSB7XG4gICAgICAgIC8vIFRyaW0gbGVhZGluZyBhbmQgdHJhaWxpbmcgc3BhY2VzIGZyb20gdGhlIHN0cmluZ1xuICAgICAgICB2YXIgc3RyID0ga28udXRpbHMuc3RyaW5nVHJpbShvYmplY3RMaXRlcmFsU3RyaW5nKTtcblxuICAgICAgICAvLyBUcmltIGJyYWNlcyAneycgc3Vycm91bmRpbmcgdGhlIHdob2xlIG9iamVjdCBsaXRlcmFsXG4gICAgICAgIGlmIChzdHIuY2hhckNvZGVBdCgwKSA9PT0gMTIzKSBzdHIgPSBzdHIuc2xpY2UoMSwgLTEpO1xuXG4gICAgICAgIC8vIFNwbGl0IGludG8gdG9rZW5zXG4gICAgICAgIHZhciByZXN1bHQgPSBbXSwgdG9rcyA9IHN0ci5tYXRjaChiaW5kaW5nVG9rZW4pLCBrZXksIHZhbHVlcyA9IFtdLCBkZXB0aCA9IDA7XG5cbiAgICAgICAgaWYgKHRva3MpIHtcbiAgICAgICAgICAgIC8vIEFwcGVuZCBhIGNvbW1hIHNvIHRoYXQgd2UgZG9uJ3QgbmVlZCBhIHNlcGFyYXRlIGNvZGUgYmxvY2sgdG8gZGVhbCB3aXRoIHRoZSBsYXN0IGl0ZW1cbiAgICAgICAgICAgIHRva3MucHVzaCgnLCcpO1xuXG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgdG9rOyB0b2sgPSB0b2tzW2ldOyArK2kpIHtcbiAgICAgICAgICAgICAgICB2YXIgYyA9IHRvay5jaGFyQ29kZUF0KDApO1xuICAgICAgICAgICAgICAgIC8vIEEgY29tbWEgc2lnbmFscyB0aGUgZW5kIG9mIGEga2V5L3ZhbHVlIHBhaXIgaWYgZGVwdGggaXMgemVyb1xuICAgICAgICAgICAgICAgIGlmIChjID09PSA0NCkgeyAvLyBcIixcIlxuICAgICAgICAgICAgICAgICAgICBpZiAoZGVwdGggPD0gMCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgcmVzdWx0LnB1c2goKGtleSAmJiB2YWx1ZXMubGVuZ3RoKSA/IHtrZXk6IGtleSwgdmFsdWU6IHZhbHVlcy5qb2luKCcnKX0gOiB7J3Vua25vd24nOiBrZXkgfHwgdmFsdWVzLmpvaW4oJycpfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBrZXkgPSBkZXB0aCA9IDA7XG4gICAgICAgICAgICAgICAgICAgICAgICB2YWx1ZXMgPSBbXTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gU2ltcGx5IHNraXAgdGhlIGNvbG9uIHRoYXQgc2VwYXJhdGVzIHRoZSBuYW1lIGFuZCB2YWx1ZVxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoYyA9PT0gNTgpIHsgLy8gXCI6XCJcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFkZXB0aCAmJiAha2V5ICYmIHZhbHVlcy5sZW5ndGggPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtleSA9IHZhbHVlcy5wb3AoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gQSBzZXQgb2Ygc2xhc2hlcyBpcyBpbml0aWFsbHkgbWF0Y2hlZCBhcyBhIHJlZ3VsYXIgZXhwcmVzc2lvbiwgYnV0IGNvdWxkIGJlIGRpdmlzaW9uXG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSA0NyAmJiBpICYmIHRvay5sZW5ndGggPiAxKSB7ICAvLyBcIi9cIlxuICAgICAgICAgICAgICAgICAgICAvLyBMb29rIGF0IHRoZSBlbmQgb2YgdGhlIHByZXZpb3VzIHRva2VuIHRvIGRldGVybWluZSBpZiB0aGUgc2xhc2ggaXMgYWN0dWFsbHkgZGl2aXNpb25cbiAgICAgICAgICAgICAgICAgICAgdmFyIG1hdGNoID0gdG9rc1tpLTFdLm1hdGNoKGRpdmlzaW9uTG9va0JlaGluZCk7XG4gICAgICAgICAgICAgICAgICAgIGlmIChtYXRjaCAmJiAha2V5d29yZFJlZ2V4TG9va0JlaGluZFttYXRjaFswXV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoZSBzbGFzaCBpcyBhY3R1YWxseSBhIGRpdmlzaW9uIHB1bmN0dWF0b3I7IHJlLXBhcnNlIHRoZSByZW1haW5kZXIgb2YgdGhlIHN0cmluZyAobm90IGluY2x1ZGluZyB0aGUgc2xhc2gpXG4gICAgICAgICAgICAgICAgICAgICAgICBzdHIgPSBzdHIuc3Vic3RyKHN0ci5pbmRleE9mKHRvaykgKyAxKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva3MgPSBzdHIubWF0Y2goYmluZGluZ1Rva2VuKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRva3MucHVzaCgnLCcpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaSA9IC0xO1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgd2l0aCBqdXN0IHRoZSBzbGFzaFxuICAgICAgICAgICAgICAgICAgICAgICAgdG9rID0gJy8nO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgLy8gSW5jcmVtZW50IGRlcHRoIGZvciBwYXJlbnRoZXNlcywgYnJhY2VzLCBhbmQgYnJhY2tldHMgc28gdGhhdCBpbnRlcmlvciBjb21tYXMgYXJlIGlnbm9yZWRcbiAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKGMgPT09IDQwIHx8IGMgPT09IDEyMyB8fCBjID09PSA5MSkgeyAvLyAnKCcsICd7JywgJ1snXG4gICAgICAgICAgICAgICAgICAgICsrZGVwdGg7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChjID09PSA0MSB8fCBjID09PSAxMjUgfHwgYyA9PT0gOTMpIHsgLy8gJyknLCAnfScsICddJ1xuICAgICAgICAgICAgICAgICAgICAtLWRlcHRoO1xuICAgICAgICAgICAgICAgIC8vIFRoZSBrZXkgd2lsbCBiZSB0aGUgZmlyc3QgdG9rZW47IGlmIGl0J3MgYSBzdHJpbmcsIHRyaW0gdGhlIHF1b3Rlc1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIWtleSAmJiAhdmFsdWVzLmxlbmd0aCAmJiAoYyA9PT0gMzQgfHwgYyA9PT0gMzkpKSB7IC8vICdcIicsIFwiJ1wiXG4gICAgICAgICAgICAgICAgICAgIHRvayA9IHRvay5zbGljZSgxLCAtMSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHZhbHVlcy5wdXNoKHRvayk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICAvLyBUd28td2F5IGJpbmRpbmdzIGluY2x1ZGUgYSB3cml0ZSBmdW5jdGlvbiB0aGF0IGFsbG93IHRoZSBoYW5kbGVyIHRvIHVwZGF0ZSB0aGUgdmFsdWUgZXZlbiBpZiBpdCdzIG5vdCBhbiBvYnNlcnZhYmxlLlxuICAgIHZhciB0d29XYXlCaW5kaW5ncyA9IHt9O1xuXG4gICAgZnVuY3Rpb24gcHJlUHJvY2Vzc0JpbmRpbmdzKGJpbmRpbmdzU3RyaW5nT3JLZXlWYWx1ZUFycmF5LCBiaW5kaW5nT3B0aW9ucykge1xuICAgICAgICBiaW5kaW5nT3B0aW9ucyA9IGJpbmRpbmdPcHRpb25zIHx8IHt9O1xuXG4gICAgICAgIGZ1bmN0aW9uIHByb2Nlc3NLZXlWYWx1ZShrZXksIHZhbCkge1xuICAgICAgICAgICAgdmFyIHdyaXRhYmxlVmFsO1xuICAgICAgICAgICAgZnVuY3Rpb24gY2FsbFByZXByb2Nlc3NIb29rKG9iaikge1xuICAgICAgICAgICAgICAgIHJldHVybiAob2JqICYmIG9ialsncHJlcHJvY2VzcyddKSA/ICh2YWwgPSBvYmpbJ3ByZXByb2Nlc3MnXSh2YWwsIGtleSwgcHJvY2Vzc0tleVZhbHVlKSkgOiB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKCFiaW5kaW5nUGFyYW1zKSB7XG4gICAgICAgICAgICAgICAgaWYgKCFjYWxsUHJlcHJvY2Vzc0hvb2soa29bJ2dldEJpbmRpbmdIYW5kbGVyJ10oa2V5KSkpXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgICAgIGlmICh0d29XYXlCaW5kaW5nc1trZXldICYmICh3cml0YWJsZVZhbCA9IGdldFdyaXRlYWJsZVZhbHVlKHZhbCkpKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZvciB0d28td2F5IGJpbmRpbmdzLCBwcm92aWRlIGEgd3JpdGUgbWV0aG9kIGluIGNhc2UgdGhlIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgIC8vIGlzbid0IGEgd3JpdGFibGUgb2JzZXJ2YWJsZS5cbiAgICAgICAgICAgICAgICAgICAgcHJvcGVydHlBY2Nlc3NvclJlc3VsdFN0cmluZ3MucHVzaChcIidcIiArIGtleSArIFwiJzpmdW5jdGlvbihfeil7XCIgKyB3cml0YWJsZVZhbCArIFwiPV96fVwiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICAvLyBWYWx1ZXMgYXJlIHdyYXBwZWQgaW4gYSBmdW5jdGlvbiBzbyB0aGF0IGVhY2ggdmFsdWUgY2FuIGJlIGFjY2Vzc2VkIGluZGVwZW5kZW50bHlcbiAgICAgICAgICAgIGlmIChtYWtlVmFsdWVBY2Nlc3NvcnMpIHtcbiAgICAgICAgICAgICAgICB2YWwgPSAnZnVuY3Rpb24oKXtyZXR1cm4gJyArIHZhbCArICcgfSc7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXN1bHRTdHJpbmdzLnB1c2goXCInXCIgKyBrZXkgKyBcIic6XCIgKyB2YWwpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHJlc3VsdFN0cmluZ3MgPSBbXSxcbiAgICAgICAgICAgIHByb3BlcnR5QWNjZXNzb3JSZXN1bHRTdHJpbmdzID0gW10sXG4gICAgICAgICAgICBtYWtlVmFsdWVBY2Nlc3NvcnMgPSBiaW5kaW5nT3B0aW9uc1sndmFsdWVBY2Nlc3NvcnMnXSxcbiAgICAgICAgICAgIGJpbmRpbmdQYXJhbXMgPSBiaW5kaW5nT3B0aW9uc1snYmluZGluZ1BhcmFtcyddLFxuICAgICAgICAgICAga2V5VmFsdWVBcnJheSA9IHR5cGVvZiBiaW5kaW5nc1N0cmluZ09yS2V5VmFsdWVBcnJheSA9PT0gXCJzdHJpbmdcIiA/XG4gICAgICAgICAgICAgICAgcGFyc2VPYmplY3RMaXRlcmFsKGJpbmRpbmdzU3RyaW5nT3JLZXlWYWx1ZUFycmF5KSA6IGJpbmRpbmdzU3RyaW5nT3JLZXlWYWx1ZUFycmF5O1xuXG4gICAgICAgIGtvLnV0aWxzLmFycmF5Rm9yRWFjaChrZXlWYWx1ZUFycmF5LCBmdW5jdGlvbihrZXlWYWx1ZSkge1xuICAgICAgICAgICAgcHJvY2Vzc0tleVZhbHVlKGtleVZhbHVlLmtleSB8fCBrZXlWYWx1ZVsndW5rbm93biddLCBrZXlWYWx1ZS52YWx1ZSk7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGlmIChwcm9wZXJ0eUFjY2Vzc29yUmVzdWx0U3RyaW5ncy5sZW5ndGgpXG4gICAgICAgICAgICBwcm9jZXNzS2V5VmFsdWUoJ19rb19wcm9wZXJ0eV93cml0ZXJzJywgXCJ7XCIgKyBwcm9wZXJ0eUFjY2Vzc29yUmVzdWx0U3RyaW5ncy5qb2luKFwiLFwiKSArIFwiIH1cIik7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdFN0cmluZ3Muam9pbihcIixcIik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgYmluZGluZ1Jld3JpdGVWYWxpZGF0b3JzOiBbXSxcblxuICAgICAgICB0d29XYXlCaW5kaW5nczogdHdvV2F5QmluZGluZ3MsXG5cbiAgICAgICAgcGFyc2VPYmplY3RMaXRlcmFsOiBwYXJzZU9iamVjdExpdGVyYWwsXG5cbiAgICAgICAgcHJlUHJvY2Vzc0JpbmRpbmdzOiBwcmVQcm9jZXNzQmluZGluZ3MsXG5cbiAgICAgICAga2V5VmFsdWVBcnJheUNvbnRhaW5zS2V5OiBmdW5jdGlvbihrZXlWYWx1ZUFycmF5LCBrZXkpIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwga2V5VmFsdWVBcnJheS5sZW5ndGg7IGkrKylcbiAgICAgICAgICAgICAgICBpZiAoa2V5VmFsdWVBcnJheVtpXVsna2V5J10gPT0ga2V5KVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBJbnRlcm5hbCwgcHJpdmF0ZSBLTyB1dGlsaXR5IGZvciB1cGRhdGluZyBtb2RlbCBwcm9wZXJ0aWVzIGZyb20gd2l0aGluIGJpbmRpbmdzXG4gICAgICAgIC8vIHByb3BlcnR5OiAgICAgICAgICAgIElmIHRoZSBwcm9wZXJ0eSBiZWluZyB1cGRhdGVkIGlzIChvciBtaWdodCBiZSkgYW4gb2JzZXJ2YWJsZSwgcGFzcyBpdCBoZXJlXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgIElmIGl0IHR1cm5zIG91dCB0byBiZSBhIHdyaXRhYmxlIG9ic2VydmFibGUsIGl0IHdpbGwgYmUgd3JpdHRlbiB0byBkaXJlY3RseVxuICAgICAgICAvLyBhbGxCaW5kaW5nczogICAgICAgICBBbiBvYmplY3Qgd2l0aCBhIGdldCBtZXRob2QgdG8gcmV0cmlldmUgYmluZGluZ3MgaW4gdGhlIGN1cnJlbnQgZXhlY3V0aW9uIGNvbnRleHQuXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgIFRoaXMgd2lsbCBiZSBzZWFyY2hlZCBmb3IgYSAnX2tvX3Byb3BlcnR5X3dyaXRlcnMnIHByb3BlcnR5IGluIGNhc2UgeW91J3JlIHdyaXRpbmcgdG8gYSBub24tb2JzZXJ2YWJsZVxuICAgICAgICAvLyBrZXk6ICAgICAgICAgICAgICAgICBUaGUga2V5IGlkZW50aWZ5aW5nIHRoZSBwcm9wZXJ0eSB0byBiZSB3cml0dGVuLiBFeGFtcGxlOiBmb3IgeyBoYXNGb2N1czogbXlWYWx1ZSB9LCB3cml0ZSB0byAnbXlWYWx1ZScgYnkgc3BlY2lmeWluZyB0aGUga2V5ICdoYXNGb2N1cydcbiAgICAgICAgLy8gdmFsdWU6ICAgICAgICAgICAgICAgVGhlIHZhbHVlIHRvIGJlIHdyaXR0ZW5cbiAgICAgICAgLy8gY2hlY2tJZkRpZmZlcmVudDogICAgSWYgdHJ1ZSwgYW5kIGlmIHRoZSBwcm9wZXJ0eSBiZWluZyB3cml0dGVuIGlzIGEgd3JpdGFibGUgb2JzZXJ2YWJsZSwgdGhlIHZhbHVlIHdpbGwgb25seSBiZSB3cml0dGVuIGlmXG4gICAgICAgIC8vICAgICAgICAgICAgICAgICAgICAgIGl0IGlzICE9PSBleGlzdGluZyB2YWx1ZSBvbiB0aGF0IHdyaXRhYmxlIG9ic2VydmFibGVcbiAgICAgICAgd3JpdGVWYWx1ZVRvUHJvcGVydHk6IGZ1bmN0aW9uKHByb3BlcnR5LCBhbGxCaW5kaW5ncywga2V5LCB2YWx1ZSwgY2hlY2tJZkRpZmZlcmVudCkge1xuICAgICAgICAgICAgaWYgKCFwcm9wZXJ0eSB8fCAha28uaXNPYnNlcnZhYmxlKHByb3BlcnR5KSkge1xuICAgICAgICAgICAgICAgIHZhciBwcm9wV3JpdGVycyA9IGFsbEJpbmRpbmdzLmdldCgnX2tvX3Byb3BlcnR5X3dyaXRlcnMnKTtcbiAgICAgICAgICAgICAgICBpZiAocHJvcFdyaXRlcnMgJiYgcHJvcFdyaXRlcnNba2V5XSlcbiAgICAgICAgICAgICAgICAgICAgcHJvcFdyaXRlcnNba2V5XSh2YWx1ZSk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGtvLmlzV3JpdGVhYmxlT2JzZXJ2YWJsZShwcm9wZXJ0eSkgJiYgKCFjaGVja0lmRGlmZmVyZW50IHx8IHByb3BlcnR5LnBlZWsoKSAhPT0gdmFsdWUpKSB7XG4gICAgICAgICAgICAgICAgcHJvcGVydHkodmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbn0pKCk7XG5cbmtvLmV4cG9ydFN5bWJvbCgnZXhwcmVzc2lvblJld3JpdGluZycsIGtvLmV4cHJlc3Npb25SZXdyaXRpbmcpO1xua28uZXhwb3J0U3ltYm9sKCdleHByZXNzaW9uUmV3cml0aW5nLmJpbmRpbmdSZXdyaXRlVmFsaWRhdG9ycycsIGtvLmV4cHJlc3Npb25SZXdyaXRpbmcuYmluZGluZ1Jld3JpdGVWYWxpZGF0b3JzKTtcbmtvLmV4cG9ydFN5bWJvbCgnZXhwcmVzc2lvblJld3JpdGluZy5wYXJzZU9iamVjdExpdGVyYWwnLCBrby5leHByZXNzaW9uUmV3cml0aW5nLnBhcnNlT2JqZWN0TGl0ZXJhbCk7XG5rby5leHBvcnRTeW1ib2woJ2V4cHJlc3Npb25SZXdyaXRpbmcucHJlUHJvY2Vzc0JpbmRpbmdzJywga28uZXhwcmVzc2lvblJld3JpdGluZy5wcmVQcm9jZXNzQmluZGluZ3MpO1xuXG4vLyBNYWtpbmcgYmluZGluZ3MgZXhwbGljaXRseSBkZWNsYXJlIHRoZW1zZWx2ZXMgYXMgXCJ0d28gd2F5XCIgaXNuJ3QgaWRlYWwgaW4gdGhlIGxvbmcgdGVybSAoaXQgd291bGQgYmUgYmV0dGVyIGlmXG4vLyBhbGwgYmluZGluZ3MgY291bGQgdXNlIGFuIG9mZmljaWFsICdwcm9wZXJ0eSB3cml0ZXInIEFQSSB3aXRob3V0IG5lZWRpbmcgdG8gZGVjbGFyZSB0aGF0IHRoZXkgbWlnaHQpLiBIb3dldmVyLFxuLy8gc2luY2UgdGhpcyBpcyBub3QsIGFuZCBoYXMgbmV2ZXIgYmVlbiwgYSBwdWJsaWMgQVBJIChfa29fcHJvcGVydHlfd3JpdGVycyB3YXMgbmV2ZXIgZG9jdW1lbnRlZCksIGl0J3MgYWNjZXB0YWJsZVxuLy8gYXMgYW4gaW50ZXJuYWwgaW1wbGVtZW50YXRpb24gZGV0YWlsIGluIHRoZSBzaG9ydCB0ZXJtLlxuLy8gRm9yIHRob3NlIGRldmVsb3BlcnMgd2hvIHJlbHkgb24gX2tvX3Byb3BlcnR5X3dyaXRlcnMgaW4gdGhlaXIgY3VzdG9tIGJpbmRpbmdzLCB3ZSBleHBvc2UgX3R3b1dheUJpbmRpbmdzIGFzIGFuXG4vLyB1bmRvY3VtZW50ZWQgZmVhdHVyZSB0aGF0IG1ha2VzIGl0IHJlbGF0aXZlbHkgZWFzeSB0byB1cGdyYWRlIHRvIEtPIDMuMC4gSG93ZXZlciwgdGhpcyBpcyBzdGlsbCBub3QgYW4gb2ZmaWNpYWxcbi8vIHB1YmxpYyBBUEksIGFuZCB3ZSByZXNlcnZlIHRoZSByaWdodCB0byByZW1vdmUgaXQgYXQgYW55IHRpbWUgaWYgd2UgY3JlYXRlIGEgcmVhbCBwdWJsaWMgcHJvcGVydHkgd3JpdGVycyBBUEkuXG5rby5leHBvcnRTeW1ib2woJ2V4cHJlc3Npb25SZXdyaXRpbmcuX3R3b1dheUJpbmRpbmdzJywga28uZXhwcmVzc2lvblJld3JpdGluZy50d29XYXlCaW5kaW5ncyk7XG5cbi8vIEZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5LCBkZWZpbmUgdGhlIGZvbGxvd2luZyBhbGlhc2VzLiAoUHJldmlvdXNseSwgdGhlc2UgZnVuY3Rpb24gbmFtZXMgd2VyZSBtaXNsZWFkaW5nIGJlY2F1c2Vcbi8vIHRoZXkgcmVmZXJyZWQgdG8gSlNPTiBzcGVjaWZpY2FsbHksIGV2ZW4gdGhvdWdoIHRoZXkgYWN0dWFsbHkgd29yayB3aXRoIGFyYml0cmFyeSBKYXZhU2NyaXB0IG9iamVjdCBsaXRlcmFsIGV4cHJlc3Npb25zLilcbmtvLmV4cG9ydFN5bWJvbCgnanNvbkV4cHJlc3Npb25SZXdyaXRpbmcnLCBrby5leHByZXNzaW9uUmV3cml0aW5nKTtcbmtvLmV4cG9ydFN5bWJvbCgnanNvbkV4cHJlc3Npb25SZXdyaXRpbmcuaW5zZXJ0UHJvcGVydHlBY2Nlc3NvcnNJbnRvSnNvbicsIGtvLmV4cHJlc3Npb25SZXdyaXRpbmcucHJlUHJvY2Vzc0JpbmRpbmdzKTtcbihmdW5jdGlvbigpIHtcbiAgICAvLyBcIlZpcnR1YWwgZWxlbWVudHNcIiBpcyBhbiBhYnN0cmFjdGlvbiBvbiB0b3Agb2YgdGhlIHVzdWFsIERPTSBBUEkgd2hpY2ggdW5kZXJzdGFuZHMgdGhlIG5vdGlvbiB0aGF0IGNvbW1lbnQgbm9kZXNcbiAgICAvLyBtYXkgYmUgdXNlZCB0byByZXByZXNlbnQgaGllcmFyY2h5IChpbiBhZGRpdGlvbiB0byB0aGUgRE9NJ3MgbmF0dXJhbCBoaWVyYXJjaHkpLlxuICAgIC8vIElmIHlvdSBjYWxsIHRoZSBET00tbWFuaXB1bGF0aW5nIGZ1bmN0aW9ucyBvbiBrby52aXJ0dWFsRWxlbWVudHMsIHlvdSB3aWxsIGJlIGFibGUgdG8gcmVhZCBhbmQgd3JpdGUgdGhlIHN0YXRlXG4gICAgLy8gb2YgdGhhdCB2aXJ0dWFsIGhpZXJhcmNoeVxuICAgIC8vXG4gICAgLy8gVGhlIHBvaW50IG9mIGFsbCB0aGlzIGlzIHRvIHN1cHBvcnQgY29udGFpbmVybGVzcyB0ZW1wbGF0ZXMgKGUuZy4sIDwhLS0ga28gZm9yZWFjaDpzb21lQ29sbGVjdGlvbiAtLT5ibGFoPCEtLSAva28gLS0+KVxuICAgIC8vIHdpdGhvdXQgaGF2aW5nIHRvIHNjYXR0ZXIgc3BlY2lhbCBjYXNlcyBhbGwgb3ZlciB0aGUgYmluZGluZyBhbmQgdGVtcGxhdGluZyBjb2RlLlxuXG4gICAgLy8gSUUgOSBjYW5ub3QgcmVsaWFibHkgcmVhZCB0aGUgXCJub2RlVmFsdWVcIiBwcm9wZXJ0eSBvZiBhIGNvbW1lbnQgbm9kZSAoc2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9TdGV2ZVNhbmRlcnNvbi9rbm9ja291dC9pc3N1ZXMvMTg2KVxuICAgIC8vIGJ1dCBpdCBkb2VzIGdpdmUgdGhlbSBhIG5vbnN0YW5kYXJkIGFsdGVybmF0aXZlIHByb3BlcnR5IGNhbGxlZCBcInRleHRcIiB0aGF0IGl0IGNhbiByZWFkIHJlbGlhYmx5LiBPdGhlciBicm93c2VycyBkb24ndCBoYXZlIHRoYXQgcHJvcGVydHkuXG4gICAgLy8gU28sIHVzZSBub2RlLnRleHQgd2hlcmUgYXZhaWxhYmxlLCBhbmQgbm9kZS5ub2RlVmFsdWUgZWxzZXdoZXJlXG4gICAgdmFyIGNvbW1lbnROb2Rlc0hhdmVUZXh0UHJvcGVydHkgPSBkb2N1bWVudCAmJiBkb2N1bWVudC5jcmVhdGVDb21tZW50KFwidGVzdFwiKS50ZXh0ID09PSBcIjwhLS10ZXN0LS0+XCI7XG5cbiAgICB2YXIgc3RhcnRDb21tZW50UmVnZXggPSBjb21tZW50Tm9kZXNIYXZlVGV4dFByb3BlcnR5ID8gL148IS0tXFxzKmtvKD86XFxzKyhbXFxzXFxTXSspKT9cXHMqLS0+JC8gOiAvXlxccyprbyg/OlxccysoW1xcc1xcU10rKSk/XFxzKiQvO1xuICAgIHZhciBlbmRDb21tZW50UmVnZXggPSAgIGNvbW1lbnROb2Rlc0hhdmVUZXh0UHJvcGVydHkgPyAvXjwhLS1cXHMqXFwva29cXHMqLS0+JC8gOiAvXlxccypcXC9rb1xccyokLztcbiAgICB2YXIgaHRtbFRhZ3NXaXRoT3B0aW9uYWxseUNsb3NpbmdDaGlsZHJlbiA9IHsgJ3VsJzogdHJ1ZSwgJ29sJzogdHJ1ZSB9O1xuXG4gICAgZnVuY3Rpb24gaXNTdGFydENvbW1lbnQobm9kZSkge1xuICAgICAgICByZXR1cm4gKG5vZGUubm9kZVR5cGUgPT0gOCkgJiYgc3RhcnRDb21tZW50UmVnZXgudGVzdChjb21tZW50Tm9kZXNIYXZlVGV4dFByb3BlcnR5ID8gbm9kZS50ZXh0IDogbm9kZS5ub2RlVmFsdWUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzRW5kQ29tbWVudChub2RlKSB7XG4gICAgICAgIHJldHVybiAobm9kZS5ub2RlVHlwZSA9PSA4KSAmJiBlbmRDb21tZW50UmVnZXgudGVzdChjb21tZW50Tm9kZXNIYXZlVGV4dFByb3BlcnR5ID8gbm9kZS50ZXh0IDogbm9kZS5ub2RlVmFsdWUpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFZpcnR1YWxDaGlsZHJlbihzdGFydENvbW1lbnQsIGFsbG93VW5iYWxhbmNlZCkge1xuICAgICAgICB2YXIgY3VycmVudE5vZGUgPSBzdGFydENvbW1lbnQ7XG4gICAgICAgIHZhciBkZXB0aCA9IDE7XG4gICAgICAgIHZhciBjaGlsZHJlbiA9IFtdO1xuICAgICAgICB3aGlsZSAoY3VycmVudE5vZGUgPSBjdXJyZW50Tm9kZS5uZXh0U2libGluZykge1xuICAgICAgICAgICAgaWYgKGlzRW5kQ29tbWVudChjdXJyZW50Tm9kZSkpIHtcbiAgICAgICAgICAgICAgICBkZXB0aC0tO1xuICAgICAgICAgICAgICAgIGlmIChkZXB0aCA9PT0gMClcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGNoaWxkcmVuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBjaGlsZHJlbi5wdXNoKGN1cnJlbnROb2RlKTtcblxuICAgICAgICAgICAgaWYgKGlzU3RhcnRDb21tZW50KGN1cnJlbnROb2RlKSlcbiAgICAgICAgICAgICAgICBkZXB0aCsrO1xuICAgICAgICB9XG4gICAgICAgIGlmICghYWxsb3dVbmJhbGFuY2VkKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgY2xvc2luZyBjb21tZW50IHRhZyB0byBtYXRjaDogXCIgKyBzdGFydENvbW1lbnQubm9kZVZhbHVlKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0TWF0Y2hpbmdFbmRDb21tZW50KHN0YXJ0Q29tbWVudCwgYWxsb3dVbmJhbGFuY2VkKSB7XG4gICAgICAgIHZhciBhbGxWaXJ0dWFsQ2hpbGRyZW4gPSBnZXRWaXJ0dWFsQ2hpbGRyZW4oc3RhcnRDb21tZW50LCBhbGxvd1VuYmFsYW5jZWQpO1xuICAgICAgICBpZiAoYWxsVmlydHVhbENoaWxkcmVuKSB7XG4gICAgICAgICAgICBpZiAoYWxsVmlydHVhbENoaWxkcmVuLmxlbmd0aCA+IDApXG4gICAgICAgICAgICAgICAgcmV0dXJuIGFsbFZpcnR1YWxDaGlsZHJlblthbGxWaXJ0dWFsQ2hpbGRyZW4ubGVuZ3RoIC0gMV0ubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICByZXR1cm4gc3RhcnRDb21tZW50Lm5leHRTaWJsaW5nO1xuICAgICAgICB9IGVsc2VcbiAgICAgICAgICAgIHJldHVybiBudWxsOyAvLyBNdXN0IGhhdmUgbm8gbWF0Y2hpbmcgZW5kIGNvbW1lbnQsIGFuZCBhbGxvd1VuYmFsYW5jZWQgaXMgdHJ1ZVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldFVuYmFsYW5jZWRDaGlsZFRhZ3Mobm9kZSkge1xuICAgICAgICAvLyBlLmcuLCBmcm9tIDxkaXY+T0s8L2Rpdj48IS0tIGtvIGJsYWggLS0+PHNwYW4+QW5vdGhlcjwvc3Bhbj4sIHJldHVybnM6IDwhLS0ga28gYmxhaCAtLT48c3Bhbj5Bbm90aGVyPC9zcGFuPlxuICAgICAgICAvLyAgICAgICBmcm9tIDxkaXY+T0s8L2Rpdj48IS0tIC9rbyAtLT48IS0tIC9rbyAtLT4sICAgICAgICAgICAgIHJldHVybnM6IDwhLS0gL2tvIC0tPjwhLS0gL2tvIC0tPlxuICAgICAgICB2YXIgY2hpbGROb2RlID0gbm9kZS5maXJzdENoaWxkLCBjYXB0dXJlUmVtYWluaW5nID0gbnVsbDtcbiAgICAgICAgaWYgKGNoaWxkTm9kZSkge1xuICAgICAgICAgICAgZG8ge1xuICAgICAgICAgICAgICAgIGlmIChjYXB0dXJlUmVtYWluaW5nKSAgICAgICAgICAgICAgICAgICAvLyBXZSBhbHJlYWR5IGhpdCBhbiB1bmJhbGFuY2VkIG5vZGUgYW5kIGFyZSBub3cganVzdCBzY29vcGluZyB1cCBhbGwgc3Vic2VxdWVudCBub2Rlc1xuICAgICAgICAgICAgICAgICAgICBjYXB0dXJlUmVtYWluaW5nLnB1c2goY2hpbGROb2RlKTtcbiAgICAgICAgICAgICAgICBlbHNlIGlmIChpc1N0YXJ0Q29tbWVudChjaGlsZE5vZGUpKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBtYXRjaGluZ0VuZENvbW1lbnQgPSBnZXRNYXRjaGluZ0VuZENvbW1lbnQoY2hpbGROb2RlLCAvKiBhbGxvd1VuYmFsYW5jZWQ6ICovIHRydWUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobWF0Y2hpbmdFbmRDb21tZW50KSAgICAgICAgICAgICAvLyBJdCdzIGEgYmFsYW5jZWQgdGFnLCBzbyBza2lwIGltbWVkaWF0ZWx5IHRvIHRoZSBlbmQgb2YgdGhpcyB2aXJ0dWFsIHNldFxuICAgICAgICAgICAgICAgICAgICAgICAgY2hpbGROb2RlID0gbWF0Y2hpbmdFbmRDb21tZW50O1xuICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICBjYXB0dXJlUmVtYWluaW5nID0gW2NoaWxkTm9kZV07IC8vIEl0J3MgdW5iYWxhbmNlZCwgc28gc3RhcnQgY2FwdHVyaW5nIGZyb20gdGhpcyBwb2ludFxuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoaXNFbmRDb21tZW50KGNoaWxkTm9kZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgY2FwdHVyZVJlbWFpbmluZyA9IFtjaGlsZE5vZGVdOyAgICAgLy8gSXQncyB1bmJhbGFuY2VkIChpZiBpdCB3YXNuJ3QsIHdlJ2QgaGF2ZSBza2lwcGVkIG92ZXIgaXQgYWxyZWFkeSksIHNvIHN0YXJ0IGNhcHR1cmluZ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gd2hpbGUgKGNoaWxkTm9kZSA9IGNoaWxkTm9kZS5uZXh0U2libGluZyk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIGNhcHR1cmVSZW1haW5pbmc7XG4gICAgfVxuXG4gICAga28udmlydHVhbEVsZW1lbnRzID0ge1xuICAgICAgICBhbGxvd2VkQmluZGluZ3M6IHt9LFxuXG4gICAgICAgIGNoaWxkTm9kZXM6IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgIHJldHVybiBpc1N0YXJ0Q29tbWVudChub2RlKSA/IGdldFZpcnR1YWxDaGlsZHJlbihub2RlKSA6IG5vZGUuY2hpbGROb2RlcztcbiAgICAgICAgfSxcblxuICAgICAgICBlbXB0eU5vZGU6IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgIGlmICghaXNTdGFydENvbW1lbnQobm9kZSkpXG4gICAgICAgICAgICAgICAga28udXRpbHMuZW1wdHlEb21Ob2RlKG5vZGUpO1xuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdmFyIHZpcnR1YWxDaGlsZHJlbiA9IGtvLnZpcnR1YWxFbGVtZW50cy5jaGlsZE5vZGVzKG5vZGUpO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBqID0gdmlydHVhbENoaWxkcmVuLmxlbmd0aDsgaSA8IGo7IGkrKylcbiAgICAgICAgICAgICAgICAgICAga28ucmVtb3ZlTm9kZSh2aXJ0dWFsQ2hpbGRyZW5baV0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIHNldERvbU5vZGVDaGlsZHJlbjogZnVuY3Rpb24obm9kZSwgY2hpbGROb2Rlcykge1xuICAgICAgICAgICAgaWYgKCFpc1N0YXJ0Q29tbWVudChub2RlKSlcbiAgICAgICAgICAgICAgICBrby51dGlscy5zZXREb21Ob2RlQ2hpbGRyZW4obm9kZSwgY2hpbGROb2Rlcyk7XG4gICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICBrby52aXJ0dWFsRWxlbWVudHMuZW1wdHlOb2RlKG5vZGUpO1xuICAgICAgICAgICAgICAgIHZhciBlbmRDb21tZW50Tm9kZSA9IG5vZGUubmV4dFNpYmxpbmc7IC8vIE11c3QgYmUgdGhlIG5leHQgc2libGluZywgYXMgd2UganVzdCBlbXB0aWVkIHRoZSBjaGlsZHJlblxuICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBqID0gY2hpbGROb2Rlcy5sZW5ndGg7IGkgPCBqOyBpKyspXG4gICAgICAgICAgICAgICAgICAgIGVuZENvbW1lbnROb2RlLnBhcmVudE5vZGUuaW5zZXJ0QmVmb3JlKGNoaWxkTm9kZXNbaV0sIGVuZENvbW1lbnROb2RlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBwcmVwZW5kOiBmdW5jdGlvbihjb250YWluZXJOb2RlLCBub2RlVG9QcmVwZW5kKSB7XG4gICAgICAgICAgICBpZiAoIWlzU3RhcnRDb21tZW50KGNvbnRhaW5lck5vZGUpKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNvbnRhaW5lck5vZGUuZmlyc3RDaGlsZClcbiAgICAgICAgICAgICAgICAgICAgY29udGFpbmVyTm9kZS5pbnNlcnRCZWZvcmUobm9kZVRvUHJlcGVuZCwgY29udGFpbmVyTm9kZS5maXJzdENoaWxkKTtcbiAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lck5vZGUuYXBwZW5kQ2hpbGQobm9kZVRvUHJlcGVuZCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIFN0YXJ0IGNvbW1lbnRzIG11c3QgYWx3YXlzIGhhdmUgYSBwYXJlbnQgYW5kIGF0IGxlYXN0IG9uZSBmb2xsb3dpbmcgc2libGluZyAodGhlIGVuZCBjb21tZW50KVxuICAgICAgICAgICAgICAgIGNvbnRhaW5lck5vZGUucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobm9kZVRvUHJlcGVuZCwgY29udGFpbmVyTm9kZS5uZXh0U2libGluZyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgaW5zZXJ0QWZ0ZXI6IGZ1bmN0aW9uKGNvbnRhaW5lck5vZGUsIG5vZGVUb0luc2VydCwgaW5zZXJ0QWZ0ZXJOb2RlKSB7XG4gICAgICAgICAgICBpZiAoIWluc2VydEFmdGVyTm9kZSkge1xuICAgICAgICAgICAgICAgIGtvLnZpcnR1YWxFbGVtZW50cy5wcmVwZW5kKGNvbnRhaW5lck5vZGUsIG5vZGVUb0luc2VydCk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCFpc1N0YXJ0Q29tbWVudChjb250YWluZXJOb2RlKSkge1xuICAgICAgICAgICAgICAgIC8vIEluc2VydCBhZnRlciBpbnNlcnRpb24gcG9pbnRcbiAgICAgICAgICAgICAgICBpZiAoaW5zZXJ0QWZ0ZXJOb2RlLm5leHRTaWJsaW5nKVxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXJOb2RlLmluc2VydEJlZm9yZShub2RlVG9JbnNlcnQsIGluc2VydEFmdGVyTm9kZS5uZXh0U2libGluZyk7XG4gICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICBjb250YWluZXJOb2RlLmFwcGVuZENoaWxkKG5vZGVUb0luc2VydCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIENoaWxkcmVuIG9mIHN0YXJ0IGNvbW1lbnRzIG11c3QgYWx3YXlzIGhhdmUgYSBwYXJlbnQgYW5kIGF0IGxlYXN0IG9uZSBmb2xsb3dpbmcgc2libGluZyAodGhlIGVuZCBjb21tZW50KVxuICAgICAgICAgICAgICAgIGNvbnRhaW5lck5vZGUucGFyZW50Tm9kZS5pbnNlcnRCZWZvcmUobm9kZVRvSW5zZXJ0LCBpbnNlcnRBZnRlck5vZGUubmV4dFNpYmxpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9LFxuXG4gICAgICAgIGZpcnN0Q2hpbGQ6IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgIGlmICghaXNTdGFydENvbW1lbnQobm9kZSkpXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5vZGUuZmlyc3RDaGlsZDtcbiAgICAgICAgICAgIGlmICghbm9kZS5uZXh0U2libGluZyB8fCBpc0VuZENvbW1lbnQobm9kZS5uZXh0U2libGluZykpXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICByZXR1cm4gbm9kZS5uZXh0U2libGluZztcbiAgICAgICAgfSxcblxuICAgICAgICBuZXh0U2libGluZzogZnVuY3Rpb24obm9kZSkge1xuICAgICAgICAgICAgaWYgKGlzU3RhcnRDb21tZW50KG5vZGUpKVxuICAgICAgICAgICAgICAgIG5vZGUgPSBnZXRNYXRjaGluZ0VuZENvbW1lbnQobm9kZSk7XG4gICAgICAgICAgICBpZiAobm9kZS5uZXh0U2libGluZyAmJiBpc0VuZENvbW1lbnQobm9kZS5uZXh0U2libGluZykpXG4gICAgICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgICByZXR1cm4gbm9kZS5uZXh0U2libGluZztcbiAgICAgICAgfSxcblxuICAgICAgICBoYXNCaW5kaW5nVmFsdWU6IGlzU3RhcnRDb21tZW50LFxuXG4gICAgICAgIHZpcnR1YWxOb2RlQmluZGluZ1ZhbHVlOiBmdW5jdGlvbihub2RlKSB7XG4gICAgICAgICAgICB2YXIgcmVnZXhNYXRjaCA9IChjb21tZW50Tm9kZXNIYXZlVGV4dFByb3BlcnR5ID8gbm9kZS50ZXh0IDogbm9kZS5ub2RlVmFsdWUpLm1hdGNoKHN0YXJ0Q29tbWVudFJlZ2V4KTtcbiAgICAgICAgICAgIHJldHVybiByZWdleE1hdGNoID8gcmVnZXhNYXRjaFsxXSA6IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgbm9ybWFsaXNlVmlydHVhbEVsZW1lbnREb21TdHJ1Y3R1cmU6IGZ1bmN0aW9uKGVsZW1lbnRWZXJpZmllZCkge1xuICAgICAgICAgICAgLy8gV29ya2Fyb3VuZCBmb3IgaHR0cHM6Ly9naXRodWIuY29tL1N0ZXZlU2FuZGVyc29uL2tub2Nrb3V0L2lzc3Vlcy8xNTVcbiAgICAgICAgICAgIC8vIChJRSA8PSA4IG9yIElFIDkgcXVpcmtzIG1vZGUgcGFyc2VzIHlvdXIgSFRNTCB3ZWlyZGx5LCB0cmVhdGluZyBjbG9zaW5nIDwvbGk+IHRhZ3MgYXMgaWYgdGhleSBkb24ndCBleGlzdCwgdGhlcmVieSBtb3ZpbmcgY29tbWVudCBub2Rlc1xuICAgICAgICAgICAgLy8gdGhhdCBhcmUgZGlyZWN0IGRlc2NlbmRhbnRzIG9mIDx1bD4gaW50byB0aGUgcHJlY2VkaW5nIDxsaT4pXG4gICAgICAgICAgICBpZiAoIWh0bWxUYWdzV2l0aE9wdGlvbmFsbHlDbG9zaW5nQ2hpbGRyZW5ba28udXRpbHMudGFnTmFtZUxvd2VyKGVsZW1lbnRWZXJpZmllZCldKVxuICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgLy8gU2NhbiBpbW1lZGlhdGUgY2hpbGRyZW4gdG8gc2VlIGlmIHRoZXkgY29udGFpbiB1bmJhbGFuY2VkIGNvbW1lbnQgdGFncy4gSWYgdGhleSBkbywgdGhvc2UgY29tbWVudCB0YWdzXG4gICAgICAgICAgICAvLyBtdXN0IGJlIGludGVuZGVkIHRvIGFwcGVhciAqYWZ0ZXIqIHRoYXQgY2hpbGQsIHNvIG1vdmUgdGhlbSB0aGVyZS5cbiAgICAgICAgICAgIHZhciBjaGlsZE5vZGUgPSBlbGVtZW50VmVyaWZpZWQuZmlyc3RDaGlsZDtcbiAgICAgICAgICAgIGlmIChjaGlsZE5vZGUpIHtcbiAgICAgICAgICAgICAgICBkbyB7XG4gICAgICAgICAgICAgICAgICAgIGlmIChjaGlsZE5vZGUubm9kZVR5cGUgPT09IDEpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciB1bmJhbGFuY2VkVGFncyA9IGdldFVuYmFsYW5jZWRDaGlsZFRhZ3MoY2hpbGROb2RlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh1bmJhbGFuY2VkVGFncykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIEZpeCB1cCB0aGUgRE9NIGJ5IG1vdmluZyB0aGUgdW5iYWxhbmNlZCB0YWdzIHRvIHdoZXJlIHRoZXkgbW9zdCBsaWtlbHkgd2VyZSBpbnRlbmRlZCB0byBiZSBwbGFjZWQgLSAqYWZ0ZXIqIHRoZSBjaGlsZFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBub2RlVG9JbnNlcnRCZWZvcmUgPSBjaGlsZE5vZGUubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB1bmJhbGFuY2VkVGFncy5sZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobm9kZVRvSW5zZXJ0QmVmb3JlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudFZlcmlmaWVkLmluc2VydEJlZm9yZSh1bmJhbGFuY2VkVGFnc1tpXSwgbm9kZVRvSW5zZXJ0QmVmb3JlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZWxlbWVudFZlcmlmaWVkLmFwcGVuZENoaWxkKHVuYmFsYW5jZWRUYWdzW2ldKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9IHdoaWxlIChjaGlsZE5vZGUgPSBjaGlsZE5vZGUubmV4dFNpYmxpbmcpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfTtcbn0pKCk7XG5rby5leHBvcnRTeW1ib2woJ3ZpcnR1YWxFbGVtZW50cycsIGtvLnZpcnR1YWxFbGVtZW50cyk7XG5rby5leHBvcnRTeW1ib2woJ3ZpcnR1YWxFbGVtZW50cy5hbGxvd2VkQmluZGluZ3MnLCBrby52aXJ0dWFsRWxlbWVudHMuYWxsb3dlZEJpbmRpbmdzKTtcbmtvLmV4cG9ydFN5bWJvbCgndmlydHVhbEVsZW1lbnRzLmVtcHR5Tm9kZScsIGtvLnZpcnR1YWxFbGVtZW50cy5lbXB0eU5vZGUpO1xuLy9rby5leHBvcnRTeW1ib2woJ3ZpcnR1YWxFbGVtZW50cy5maXJzdENoaWxkJywga28udmlydHVhbEVsZW1lbnRzLmZpcnN0Q2hpbGQpOyAgICAgLy8gZmlyc3RDaGlsZCBpcyBub3QgbWluaWZpZWRcbmtvLmV4cG9ydFN5bWJvbCgndmlydHVhbEVsZW1lbnRzLmluc2VydEFmdGVyJywga28udmlydHVhbEVsZW1lbnRzLmluc2VydEFmdGVyKTtcbi8va28uZXhwb3J0U3ltYm9sKCd2aXJ0dWFsRWxlbWVudHMubmV4dFNpYmxpbmcnLCBrby52aXJ0dWFsRWxlbWVudHMubmV4dFNpYmxpbmcpOyAgIC8vIG5leHRTaWJsaW5nIGlzIG5vdCBtaW5pZmllZFxua28uZXhwb3J0U3ltYm9sKCd2aXJ0dWFsRWxlbWVudHMucHJlcGVuZCcsIGtvLnZpcnR1YWxFbGVtZW50cy5wcmVwZW5kKTtcbmtvLmV4cG9ydFN5bWJvbCgndmlydHVhbEVsZW1lbnRzLnNldERvbU5vZGVDaGlsZHJlbicsIGtvLnZpcnR1YWxFbGVtZW50cy5zZXREb21Ob2RlQ2hpbGRyZW4pO1xuKGZ1bmN0aW9uKCkge1xuICAgIHZhciBkZWZhdWx0QmluZGluZ0F0dHJpYnV0ZU5hbWUgPSBcImRhdGEtYmluZFwiO1xuXG4gICAga28uYmluZGluZ1Byb3ZpZGVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMuYmluZGluZ0NhY2hlID0ge307XG4gICAgfTtcblxuICAgIGtvLnV0aWxzLmV4dGVuZChrby5iaW5kaW5nUHJvdmlkZXIucHJvdG90eXBlLCB7XG4gICAgICAgICdub2RlSGFzQmluZGluZ3MnOiBmdW5jdGlvbihub2RlKSB7XG4gICAgICAgICAgICBzd2l0Y2ggKG5vZGUubm9kZVR5cGUpIHtcbiAgICAgICAgICAgICAgICBjYXNlIDE6IC8vIEVsZW1lbnRcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5vZGUuZ2V0QXR0cmlidXRlKGRlZmF1bHRCaW5kaW5nQXR0cmlidXRlTmFtZSkgIT0gbnVsbFxuICAgICAgICAgICAgICAgICAgICAgICAgfHwga28uY29tcG9uZW50c1snZ2V0Q29tcG9uZW50TmFtZUZvck5vZGUnXShub2RlKTtcbiAgICAgICAgICAgICAgICBjYXNlIDg6IC8vIENvbW1lbnQgbm9kZVxuICAgICAgICAgICAgICAgICAgICByZXR1cm4ga28udmlydHVhbEVsZW1lbnRzLmhhc0JpbmRpbmdWYWx1ZShub2RlKTtcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiByZXR1cm4gZmFsc2U7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0sXG5cbiAgICAgICAgJ2dldEJpbmRpbmdzJzogZnVuY3Rpb24obm9kZSwgYmluZGluZ0NvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciBiaW5kaW5nc1N0cmluZyA9IHRoaXNbJ2dldEJpbmRpbmdzU3RyaW5nJ10obm9kZSwgYmluZGluZ0NvbnRleHQpLFxuICAgICAgICAgICAgICAgIHBhcnNlZEJpbmRpbmdzID0gYmluZGluZ3NTdHJpbmcgPyB0aGlzWydwYXJzZUJpbmRpbmdzU3RyaW5nJ10oYmluZGluZ3NTdHJpbmcsIGJpbmRpbmdDb250ZXh0LCBub2RlKSA6IG51bGw7XG4gICAgICAgICAgICByZXR1cm4ga28uY29tcG9uZW50cy5hZGRCaW5kaW5nc0ZvckN1c3RvbUVsZW1lbnQocGFyc2VkQmluZGluZ3MsIG5vZGUsIGJpbmRpbmdDb250ZXh0LCAvKiB2YWx1ZUFjY2Vzc29ycyAqLyBmYWxzZSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgJ2dldEJpbmRpbmdBY2Nlc3NvcnMnOiBmdW5jdGlvbihub2RlLCBiaW5kaW5nQ29udGV4dCkge1xuICAgICAgICAgICAgdmFyIGJpbmRpbmdzU3RyaW5nID0gdGhpc1snZ2V0QmluZGluZ3NTdHJpbmcnXShub2RlLCBiaW5kaW5nQ29udGV4dCksXG4gICAgICAgICAgICAgICAgcGFyc2VkQmluZGluZ3MgPSBiaW5kaW5nc1N0cmluZyA/IHRoaXNbJ3BhcnNlQmluZGluZ3NTdHJpbmcnXShiaW5kaW5nc1N0cmluZywgYmluZGluZ0NvbnRleHQsIG5vZGUsIHsgJ3ZhbHVlQWNjZXNzb3JzJzogdHJ1ZSB9KSA6IG51bGw7XG4gICAgICAgICAgICByZXR1cm4ga28uY29tcG9uZW50cy5hZGRCaW5kaW5nc0ZvckN1c3RvbUVsZW1lbnQocGFyc2VkQmluZGluZ3MsIG5vZGUsIGJpbmRpbmdDb250ZXh0LCAvKiB2YWx1ZUFjY2Vzc29ycyAqLyB0cnVlKTtcbiAgICAgICAgfSxcblxuICAgICAgICAvLyBUaGUgZm9sbG93aW5nIGZ1bmN0aW9uIGlzIG9ubHkgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoaXMgZGVmYXVsdCBwcm92aWRlci5cbiAgICAgICAgLy8gSXQncyBub3QgcGFydCBvZiB0aGUgaW50ZXJmYWNlIGRlZmluaXRpb24gZm9yIGEgZ2VuZXJhbCBiaW5kaW5nIHByb3ZpZGVyLlxuICAgICAgICAnZ2V0QmluZGluZ3NTdHJpbmcnOiBmdW5jdGlvbihub2RlLCBiaW5kaW5nQ29udGV4dCkge1xuICAgICAgICAgICAgc3dpdGNoIChub2RlLm5vZGVUeXBlKSB7XG4gICAgICAgICAgICAgICAgY2FzZSAxOiByZXR1cm4gbm9kZS5nZXRBdHRyaWJ1dGUoZGVmYXVsdEJpbmRpbmdBdHRyaWJ1dGVOYW1lKTsgICAvLyBFbGVtZW50XG4gICAgICAgICAgICAgICAgY2FzZSA4OiByZXR1cm4ga28udmlydHVhbEVsZW1lbnRzLnZpcnR1YWxOb2RlQmluZGluZ1ZhbHVlKG5vZGUpOyAvLyBDb21tZW50IG5vZGVcbiAgICAgICAgICAgICAgICBkZWZhdWx0OiByZXR1cm4gbnVsbDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICAvLyBUaGUgZm9sbG93aW5nIGZ1bmN0aW9uIGlzIG9ubHkgdXNlZCBpbnRlcm5hbGx5IGJ5IHRoaXMgZGVmYXVsdCBwcm92aWRlci5cbiAgICAgICAgLy8gSXQncyBub3QgcGFydCBvZiB0aGUgaW50ZXJmYWNlIGRlZmluaXRpb24gZm9yIGEgZ2VuZXJhbCBiaW5kaW5nIHByb3ZpZGVyLlxuICAgICAgICAncGFyc2VCaW5kaW5nc1N0cmluZyc6IGZ1bmN0aW9uKGJpbmRpbmdzU3RyaW5nLCBiaW5kaW5nQ29udGV4dCwgbm9kZSwgb3B0aW9ucykge1xuICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICB2YXIgYmluZGluZ0Z1bmN0aW9uID0gY3JlYXRlQmluZGluZ3NTdHJpbmdFdmFsdWF0b3JWaWFDYWNoZShiaW5kaW5nc1N0cmluZywgdGhpcy5iaW5kaW5nQ2FjaGUsIG9wdGlvbnMpO1xuICAgICAgICAgICAgICAgIHJldHVybiBiaW5kaW5nRnVuY3Rpb24oYmluZGluZ0NvbnRleHQsIG5vZGUpO1xuICAgICAgICAgICAgfSBjYXRjaCAoZXgpIHtcbiAgICAgICAgICAgICAgICBleC5tZXNzYWdlID0gXCJVbmFibGUgdG8gcGFyc2UgYmluZGluZ3MuXFxuQmluZGluZ3MgdmFsdWU6IFwiICsgYmluZGluZ3NTdHJpbmcgKyBcIlxcbk1lc3NhZ2U6IFwiICsgZXgubWVzc2FnZTtcbiAgICAgICAgICAgICAgICB0aHJvdyBleDtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAga28uYmluZGluZ1Byb3ZpZGVyWydpbnN0YW5jZSddID0gbmV3IGtvLmJpbmRpbmdQcm92aWRlcigpO1xuXG4gICAgZnVuY3Rpb24gY3JlYXRlQmluZGluZ3NTdHJpbmdFdmFsdWF0b3JWaWFDYWNoZShiaW5kaW5nc1N0cmluZywgY2FjaGUsIG9wdGlvbnMpIHtcbiAgICAgICAgdmFyIGNhY2hlS2V5ID0gYmluZGluZ3NTdHJpbmcgKyAob3B0aW9ucyAmJiBvcHRpb25zWyd2YWx1ZUFjY2Vzc29ycyddIHx8ICcnKTtcbiAgICAgICAgcmV0dXJuIGNhY2hlW2NhY2hlS2V5XVxuICAgICAgICAgICAgfHwgKGNhY2hlW2NhY2hlS2V5XSA9IGNyZWF0ZUJpbmRpbmdzU3RyaW5nRXZhbHVhdG9yKGJpbmRpbmdzU3RyaW5nLCBvcHRpb25zKSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY3JlYXRlQmluZGluZ3NTdHJpbmdFdmFsdWF0b3IoYmluZGluZ3NTdHJpbmcsIG9wdGlvbnMpIHtcbiAgICAgICAgLy8gQnVpbGQgdGhlIHNvdXJjZSBmb3IgYSBmdW5jdGlvbiB0aGF0IGV2YWx1YXRlcyBcImV4cHJlc3Npb25cIlxuICAgICAgICAvLyBGb3IgZWFjaCBzY29wZSB2YXJpYWJsZSwgYWRkIGFuIGV4dHJhIGxldmVsIG9mIFwid2l0aFwiIG5lc3RpbmdcbiAgICAgICAgLy8gRXhhbXBsZSByZXN1bHQ6IHdpdGgoc2MxKSB7IHdpdGgoc2MwKSB7IHJldHVybiAoZXhwcmVzc2lvbikgfSB9XG4gICAgICAgIHZhciByZXdyaXR0ZW5CaW5kaW5ncyA9IGtvLmV4cHJlc3Npb25SZXdyaXRpbmcucHJlUHJvY2Vzc0JpbmRpbmdzKGJpbmRpbmdzU3RyaW5nLCBvcHRpb25zKSxcbiAgICAgICAgICAgIGZ1bmN0aW9uQm9keSA9IFwid2l0aCgkY29udGV4dCl7d2l0aCgkZGF0YXx8e30pe3JldHVybntcIiArIHJld3JpdHRlbkJpbmRpbmdzICsgXCJ9fX1cIjtcbiAgICAgICAgcmV0dXJuIG5ldyBGdW5jdGlvbihcIiRjb250ZXh0XCIsIFwiJGVsZW1lbnRcIiwgZnVuY3Rpb25Cb2R5KTtcbiAgICB9XG59KSgpO1xuXG5rby5leHBvcnRTeW1ib2woJ2JpbmRpbmdQcm92aWRlcicsIGtvLmJpbmRpbmdQcm92aWRlcik7XG4oZnVuY3Rpb24gKCkge1xuICAgIGtvLmJpbmRpbmdIYW5kbGVycyA9IHt9O1xuXG4gICAgLy8gVGhlIGZvbGxvd2luZyBlbGVtZW50IHR5cGVzIHdpbGwgbm90IGJlIHJlY3Vyc2VkIGludG8gZHVyaW5nIGJpbmRpbmcuXG4gICAgdmFyIGJpbmRpbmdEb2VzTm90UmVjdXJzZUludG9FbGVtZW50VHlwZXMgPSB7XG4gICAgICAgIC8vIERvbid0IHdhbnQgYmluZGluZ3MgdGhhdCBvcGVyYXRlIG9uIHRleHQgbm9kZXMgdG8gbXV0YXRlIDxzY3JpcHQ+IGFuZCA8dGV4dGFyZWE+IGNvbnRlbnRzLFxuICAgICAgICAvLyBiZWNhdXNlIGl0J3MgdW5leHBlY3RlZCBhbmQgYSBwb3RlbnRpYWwgWFNTIGlzc3VlLlxuICAgICAgICAvLyBBbHNvIGJpbmRpbmdzIHNob3VsZCBub3Qgb3BlcmF0ZSBvbiA8dGVtcGxhdGU+IGVsZW1lbnRzIHNpbmNlIHRoaXMgYnJlYWtzIGluIEludGVybmV0IEV4cGxvcmVyXG4gICAgICAgIC8vIGFuZCBiZWNhdXNlIHN1Y2ggZWxlbWVudHMnIGNvbnRlbnRzIGFyZSBhbHdheXMgaW50ZW5kZWQgdG8gYmUgYm91bmQgaW4gYSBkaWZmZXJlbnQgY29udGV4dFxuICAgICAgICAvLyBmcm9tIHdoZXJlIHRoZXkgYXBwZWFyIGluIHRoZSBkb2N1bWVudC5cbiAgICAgICAgJ3NjcmlwdCc6IHRydWUsXG4gICAgICAgICd0ZXh0YXJlYSc6IHRydWUsXG4gICAgICAgICd0ZW1wbGF0ZSc6IHRydWVcbiAgICB9O1xuXG4gICAgLy8gVXNlIGFuIG92ZXJyaWRhYmxlIG1ldGhvZCBmb3IgcmV0cmlldmluZyBiaW5kaW5nIGhhbmRsZXJzIHNvIHRoYXQgYSBwbHVnaW5zIG1heSBzdXBwb3J0IGR5bmFtaWNhbGx5IGNyZWF0ZWQgaGFuZGxlcnNcbiAgICBrb1snZ2V0QmluZGluZ0hhbmRsZXInXSA9IGZ1bmN0aW9uKGJpbmRpbmdLZXkpIHtcbiAgICAgICAgcmV0dXJuIGtvLmJpbmRpbmdIYW5kbGVyc1tiaW5kaW5nS2V5XTtcbiAgICB9O1xuXG4gICAgLy8gVGhlIGtvLmJpbmRpbmdDb250ZXh0IGNvbnN0cnVjdG9yIGlzIG9ubHkgY2FsbGVkIGRpcmVjdGx5IHRvIGNyZWF0ZSB0aGUgcm9vdCBjb250ZXh0LiBGb3IgY2hpbGRcbiAgICAvLyBjb250ZXh0cywgdXNlIGJpbmRpbmdDb250ZXh0LmNyZWF0ZUNoaWxkQ29udGV4dCBvciBiaW5kaW5nQ29udGV4dC5leHRlbmQuXG4gICAga28uYmluZGluZ0NvbnRleHQgPSBmdW5jdGlvbihkYXRhSXRlbU9yQWNjZXNzb3IsIHBhcmVudENvbnRleHQsIGRhdGFJdGVtQWxpYXMsIGV4dGVuZENhbGxiYWNrKSB7XG5cbiAgICAgICAgLy8gVGhlIGJpbmRpbmcgY29udGV4dCBvYmplY3QgaW5jbHVkZXMgc3RhdGljIHByb3BlcnRpZXMgZm9yIHRoZSBjdXJyZW50LCBwYXJlbnQsIGFuZCByb290IHZpZXcgbW9kZWxzLlxuICAgICAgICAvLyBJZiBhIHZpZXcgbW9kZWwgaXMgYWN0dWFsbHkgc3RvcmVkIGluIGFuIG9ic2VydmFibGUsIHRoZSBjb3JyZXNwb25kaW5nIGJpbmRpbmcgY29udGV4dCBvYmplY3QsIGFuZFxuICAgICAgICAvLyBhbnkgY2hpbGQgY29udGV4dHMsIG11c3QgYmUgdXBkYXRlZCB3aGVuIHRoZSB2aWV3IG1vZGVsIGlzIGNoYW5nZWQuXG4gICAgICAgIGZ1bmN0aW9uIHVwZGF0ZUNvbnRleHQoKSB7XG4gICAgICAgICAgICAvLyBNb3N0IG9mIHRoZSB0aW1lLCB0aGUgY29udGV4dCB3aWxsIGRpcmVjdGx5IGdldCBhIHZpZXcgbW9kZWwgb2JqZWN0LCBidXQgaWYgYSBmdW5jdGlvbiBpcyBnaXZlbixcbiAgICAgICAgICAgIC8vIHdlIGNhbGwgdGhlIGZ1bmN0aW9uIHRvIHJldHJpZXZlIHRoZSB2aWV3IG1vZGVsLiBJZiB0aGUgZnVuY3Rpb24gYWNjZXNzZXMgYW55IG9ic2VydmFibGVzIG9yIHJldHVybnNcbiAgICAgICAgICAgIC8vIGFuIG9ic2VydmFibGUsIHRoZSBkZXBlbmRlbmN5IGlzIHRyYWNrZWQsIGFuZCB0aG9zZSBvYnNlcnZhYmxlcyBjYW4gbGF0ZXIgY2F1c2UgdGhlIGJpbmRpbmdcbiAgICAgICAgICAgIC8vIGNvbnRleHQgdG8gYmUgdXBkYXRlZC5cbiAgICAgICAgICAgIHZhciBkYXRhSXRlbU9yT2JzZXJ2YWJsZSA9IGlzRnVuYyA/IGRhdGFJdGVtT3JBY2Nlc3NvcigpIDogZGF0YUl0ZW1PckFjY2Vzc29yLFxuICAgICAgICAgICAgICAgIGRhdGFJdGVtID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZShkYXRhSXRlbU9yT2JzZXJ2YWJsZSk7XG5cbiAgICAgICAgICAgIGlmIChwYXJlbnRDb250ZXh0KSB7XG4gICAgICAgICAgICAgICAgLy8gV2hlbiBhIFwicGFyZW50XCIgY29udGV4dCBpcyBnaXZlbiwgcmVnaXN0ZXIgYSBkZXBlbmRlbmN5IG9uIHRoZSBwYXJlbnQgY29udGV4dC4gVGh1cyB3aGVuZXZlciB0aGVcbiAgICAgICAgICAgICAgICAvLyBwYXJlbnQgY29udGV4dCBpcyB1cGRhdGVkLCB0aGlzIGNvbnRleHQgd2lsbCBhbHNvIGJlIHVwZGF0ZWQuXG4gICAgICAgICAgICAgICAgaWYgKHBhcmVudENvbnRleHQuX3N1YnNjcmliYWJsZSlcbiAgICAgICAgICAgICAgICAgICAgcGFyZW50Q29udGV4dC5fc3Vic2NyaWJhYmxlKCk7XG5cbiAgICAgICAgICAgICAgICAvLyBDb3B5ICRyb290IGFuZCBhbnkgY3VzdG9tIHByb3BlcnRpZXMgZnJvbSB0aGUgcGFyZW50IGNvbnRleHRcbiAgICAgICAgICAgICAgICBrby51dGlscy5leHRlbmQoc2VsZiwgcGFyZW50Q29udGV4dCk7XG5cbiAgICAgICAgICAgICAgICAvLyBCZWNhdXNlIHRoZSBhYm92ZSBjb3B5IG92ZXJ3cml0ZXMgb3VyIG93biBwcm9wZXJ0aWVzLCB3ZSBuZWVkIHRvIHJlc2V0IHRoZW0uXG4gICAgICAgICAgICAgICAgLy8gRHVyaW5nIHRoZSBmaXJzdCBleGVjdXRpb24sIFwic3Vic2NyaWJhYmxlXCIgaXNuJ3Qgc2V0LCBzbyBkb24ndCBib3RoZXIgZG9pbmcgdGhlIHVwZGF0ZSB0aGVuLlxuICAgICAgICAgICAgICAgIGlmIChzdWJzY3JpYmFibGUpIHtcbiAgICAgICAgICAgICAgICAgICAgc2VsZi5fc3Vic2NyaWJhYmxlID0gc3Vic2NyaWJhYmxlO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgc2VsZlsnJHBhcmVudHMnXSA9IFtdO1xuICAgICAgICAgICAgICAgIHNlbGZbJyRyb290J10gPSBkYXRhSXRlbTtcblxuICAgICAgICAgICAgICAgIC8vIEV4cG9ydCAna28nIGluIHRoZSBiaW5kaW5nIGNvbnRleHQgc28gaXQgd2lsbCBiZSBhdmFpbGFibGUgaW4gYmluZGluZ3MgYW5kIHRlbXBsYXRlc1xuICAgICAgICAgICAgICAgIC8vIGV2ZW4gaWYgJ2tvJyBpc24ndCBleHBvcnRlZCBhcyBhIGdsb2JhbCwgc3VjaCBhcyB3aGVuIHVzaW5nIGFuIEFNRCBsb2FkZXIuXG4gICAgICAgICAgICAgICAgLy8gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9TdGV2ZVNhbmRlcnNvbi9rbm9ja291dC9pc3N1ZXMvNDkwXG4gICAgICAgICAgICAgICAgc2VsZlsna28nXSA9IGtvO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgc2VsZlsnJHJhd0RhdGEnXSA9IGRhdGFJdGVtT3JPYnNlcnZhYmxlO1xuICAgICAgICAgICAgc2VsZlsnJGRhdGEnXSA9IGRhdGFJdGVtO1xuICAgICAgICAgICAgaWYgKGRhdGFJdGVtQWxpYXMpXG4gICAgICAgICAgICAgICAgc2VsZltkYXRhSXRlbUFsaWFzXSA9IGRhdGFJdGVtO1xuXG4gICAgICAgICAgICAvLyBUaGUgZXh0ZW5kQ2FsbGJhY2sgZnVuY3Rpb24gaXMgcHJvdmlkZWQgd2hlbiBjcmVhdGluZyBhIGNoaWxkIGNvbnRleHQgb3IgZXh0ZW5kaW5nIGEgY29udGV4dC5cbiAgICAgICAgICAgIC8vIEl0IGhhbmRsZXMgdGhlIHNwZWNpZmljIGFjdGlvbnMgbmVlZGVkIHRvIGZpbmlzaCBzZXR0aW5nIHVwIHRoZSBiaW5kaW5nIGNvbnRleHQuIEFjdGlvbnMgaW4gdGhpc1xuICAgICAgICAgICAgLy8gZnVuY3Rpb24gY291bGQgYWxzbyBhZGQgZGVwZW5kZW5jaWVzIHRvIHRoaXMgYmluZGluZyBjb250ZXh0LlxuICAgICAgICAgICAgaWYgKGV4dGVuZENhbGxiYWNrKVxuICAgICAgICAgICAgICAgIGV4dGVuZENhbGxiYWNrKHNlbGYsIHBhcmVudENvbnRleHQsIGRhdGFJdGVtKTtcblxuICAgICAgICAgICAgcmV0dXJuIHNlbGZbJyRkYXRhJ107XG4gICAgICAgIH1cbiAgICAgICAgZnVuY3Rpb24gZGlzcG9zZVdoZW4oKSB7XG4gICAgICAgICAgICByZXR1cm4gbm9kZXMgJiYgIWtvLnV0aWxzLmFueURvbU5vZGVJc0F0dGFjaGVkVG9Eb2N1bWVudChub2Rlcyk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgc2VsZiA9IHRoaXMsXG4gICAgICAgICAgICBpc0Z1bmMgPSB0eXBlb2YoZGF0YUl0ZW1PckFjY2Vzc29yKSA9PSBcImZ1bmN0aW9uXCIgJiYgIWtvLmlzT2JzZXJ2YWJsZShkYXRhSXRlbU9yQWNjZXNzb3IpLFxuICAgICAgICAgICAgbm9kZXMsXG4gICAgICAgICAgICBzdWJzY3JpYmFibGUgPSBrby5kZXBlbmRlbnRPYnNlcnZhYmxlKHVwZGF0ZUNvbnRleHQsIG51bGwsIHsgZGlzcG9zZVdoZW46IGRpc3Bvc2VXaGVuLCBkaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQ6IHRydWUgfSk7XG5cbiAgICAgICAgLy8gQXQgdGhpcyBwb2ludCwgdGhlIGJpbmRpbmcgY29udGV4dCBoYXMgYmVlbiBpbml0aWFsaXplZCwgYW5kIHRoZSBcInN1YnNjcmliYWJsZVwiIGNvbXB1dGVkIG9ic2VydmFibGUgaXNcbiAgICAgICAgLy8gc3Vic2NyaWJlZCB0byBhbnkgb2JzZXJ2YWJsZXMgdGhhdCB3ZXJlIGFjY2Vzc2VkIGluIHRoZSBwcm9jZXNzLiBJZiB0aGVyZSBpcyBub3RoaW5nIHRvIHRyYWNrLCB0aGVcbiAgICAgICAgLy8gY29tcHV0ZWQgd2lsbCBiZSBpbmFjdGl2ZSwgYW5kIHdlIGNhbiBzYWZlbHkgdGhyb3cgaXQgYXdheS4gSWYgaXQncyBhY3RpdmUsIHRoZSBjb21wdXRlZCBpcyBzdG9yZWQgaW5cbiAgICAgICAgLy8gdGhlIGNvbnRleHQgb2JqZWN0LlxuICAgICAgICBpZiAoc3Vic2NyaWJhYmxlLmlzQWN0aXZlKCkpIHtcbiAgICAgICAgICAgIHNlbGYuX3N1YnNjcmliYWJsZSA9IHN1YnNjcmliYWJsZTtcblxuICAgICAgICAgICAgLy8gQWx3YXlzIG5vdGlmeSBiZWNhdXNlIGV2ZW4gaWYgdGhlIG1vZGVsICgkZGF0YSkgaGFzbid0IGNoYW5nZWQsIG90aGVyIGNvbnRleHQgcHJvcGVydGllcyBtaWdodCBoYXZlIGNoYW5nZWRcbiAgICAgICAgICAgIHN1YnNjcmliYWJsZVsnZXF1YWxpdHlDb21wYXJlciddID0gbnVsbDtcblxuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBiZSBhYmxlIHRvIGRpc3Bvc2Ugb2YgdGhpcyBjb21wdXRlZCBvYnNlcnZhYmxlIHdoZW4gaXQncyBubyBsb25nZXIgbmVlZGVkLiBUaGlzIHdvdWxkIGJlXG4gICAgICAgICAgICAvLyBlYXN5IGlmIHdlIGhhZCBhIHNpbmdsZSBub2RlIHRvIHdhdGNoLCBidXQgYmluZGluZyBjb250ZXh0cyBjYW4gYmUgdXNlZCBieSBtYW55IGRpZmZlcmVudCBub2RlcywgYW5kXG4gICAgICAgICAgICAvLyB3ZSBjYW5ub3QgYXNzdW1lIHRoYXQgdGhvc2Ugbm9kZXMgaGF2ZSBhbnkgcmVsYXRpb24gdG8gZWFjaCBvdGhlci4gU28gaW5zdGVhZCB3ZSB0cmFjayBhbnkgbm9kZSB0aGF0XG4gICAgICAgICAgICAvLyB0aGUgY29udGV4dCBpcyBhdHRhY2hlZCB0bywgYW5kIGRpc3Bvc2UgdGhlIGNvbXB1dGVkIHdoZW4gYWxsIG9mIHRob3NlIG5vZGVzIGhhdmUgYmVlbiBjbGVhbmVkLlxuXG4gICAgICAgICAgICAvLyBBZGQgcHJvcGVydGllcyB0byAqc3Vic2NyaWJhYmxlKiBpbnN0ZWFkIG9mICpzZWxmKiBiZWNhdXNlIGFueSBwcm9wZXJ0aWVzIGFkZGVkIHRvICpzZWxmKiBtYXkgYmUgb3ZlcndyaXR0ZW4gb24gdXBkYXRlc1xuICAgICAgICAgICAgbm9kZXMgPSBbXTtcbiAgICAgICAgICAgIHN1YnNjcmliYWJsZS5fYWRkTm9kZSA9IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgICAgICBub2Rlcy5wdXNoKG5vZGUpO1xuICAgICAgICAgICAgICAgIGtvLnV0aWxzLmRvbU5vZGVEaXNwb3NhbC5hZGREaXNwb3NlQ2FsbGJhY2sobm9kZSwgZnVuY3Rpb24obm9kZSkge1xuICAgICAgICAgICAgICAgICAgICBrby51dGlscy5hcnJheVJlbW92ZUl0ZW0obm9kZXMsIG5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIW5vZGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3Vic2NyaWJhYmxlLmRpc3Bvc2UoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNlbGYuX3N1YnNjcmliYWJsZSA9IHN1YnNjcmliYWJsZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIEV4dGVuZCB0aGUgYmluZGluZyBjb250ZXh0IGhpZXJhcmNoeSB3aXRoIGEgbmV3IHZpZXcgbW9kZWwgb2JqZWN0LiBJZiB0aGUgcGFyZW50IGNvbnRleHQgaXMgd2F0Y2hpbmdcbiAgICAvLyBhbnkgb2JzZXJ2YWJsZXMsIHRoZSBuZXcgY2hpbGQgY29udGV4dCB3aWxsIGF1dG9tYXRpY2FsbHkgZ2V0IGEgZGVwZW5kZW5jeSBvbiB0aGUgcGFyZW50IGNvbnRleHQuXG4gICAgLy8gQnV0IHRoaXMgZG9lcyBub3QgbWVhbiB0aGF0IHRoZSAkZGF0YSB2YWx1ZSBvZiB0aGUgY2hpbGQgY29udGV4dCB3aWxsIGFsc28gZ2V0IHVwZGF0ZWQuIElmIHRoZSBjaGlsZFxuICAgIC8vIHZpZXcgbW9kZWwgYWxzbyBkZXBlbmRzIG9uIHRoZSBwYXJlbnQgdmlldyBtb2RlbCwgeW91IG11c3QgcHJvdmlkZSBhIGZ1bmN0aW9uIHRoYXQgcmV0dXJucyB0aGUgY29ycmVjdFxuICAgIC8vIHZpZXcgbW9kZWwgb24gZWFjaCB1cGRhdGUuXG4gICAga28uYmluZGluZ0NvbnRleHQucHJvdG90eXBlWydjcmVhdGVDaGlsZENvbnRleHQnXSA9IGZ1bmN0aW9uIChkYXRhSXRlbU9yQWNjZXNzb3IsIGRhdGFJdGVtQWxpYXMsIGV4dGVuZENhbGxiYWNrKSB7XG4gICAgICAgIHJldHVybiBuZXcga28uYmluZGluZ0NvbnRleHQoZGF0YUl0ZW1PckFjY2Vzc29yLCB0aGlzLCBkYXRhSXRlbUFsaWFzLCBmdW5jdGlvbihzZWxmLCBwYXJlbnRDb250ZXh0KSB7XG4gICAgICAgICAgICAvLyBFeHRlbmQgdGhlIGNvbnRleHQgaGllcmFyY2h5IGJ5IHNldHRpbmcgdGhlIGFwcHJvcHJpYXRlIHBvaW50ZXJzXG4gICAgICAgICAgICBzZWxmWyckcGFyZW50Q29udGV4dCddID0gcGFyZW50Q29udGV4dDtcbiAgICAgICAgICAgIHNlbGZbJyRwYXJlbnQnXSA9IHBhcmVudENvbnRleHRbJyRkYXRhJ107XG4gICAgICAgICAgICBzZWxmWyckcGFyZW50cyddID0gKHBhcmVudENvbnRleHRbJyRwYXJlbnRzJ10gfHwgW10pLnNsaWNlKDApO1xuICAgICAgICAgICAgc2VsZlsnJHBhcmVudHMnXS51bnNoaWZ0KHNlbGZbJyRwYXJlbnQnXSk7XG4gICAgICAgICAgICBpZiAoZXh0ZW5kQ2FsbGJhY2spXG4gICAgICAgICAgICAgICAgZXh0ZW5kQ2FsbGJhY2soc2VsZik7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBFeHRlbmQgdGhlIGJpbmRpbmcgY29udGV4dCB3aXRoIG5ldyBjdXN0b20gcHJvcGVydGllcy4gVGhpcyBkb2Vzbid0IGNoYW5nZSB0aGUgY29udGV4dCBoaWVyYXJjaHkuXG4gICAgLy8gU2ltaWxhcmx5IHRvIFwiY2hpbGRcIiBjb250ZXh0cywgcHJvdmlkZSBhIGZ1bmN0aW9uIGhlcmUgdG8gbWFrZSBzdXJlIHRoYXQgdGhlIGNvcnJlY3QgdmFsdWVzIGFyZSBzZXRcbiAgICAvLyB3aGVuIGFuIG9ic2VydmFibGUgdmlldyBtb2RlbCBpcyB1cGRhdGVkLlxuICAgIGtvLmJpbmRpbmdDb250ZXh0LnByb3RvdHlwZVsnZXh0ZW5kJ10gPSBmdW5jdGlvbihwcm9wZXJ0aWVzKSB7XG4gICAgICAgIC8vIElmIHRoZSBwYXJlbnQgY29udGV4dCByZWZlcmVuY2VzIGFuIG9ic2VydmFibGUgdmlldyBtb2RlbCwgXCJfc3Vic2NyaWJhYmxlXCIgd2lsbCBhbHdheXMgYmUgdGhlXG4gICAgICAgIC8vIGxhdGVzdCB2aWV3IG1vZGVsIG9iamVjdC4gSWYgbm90LCBcIl9zdWJzY3JpYmFibGVcIiBpc24ndCBzZXQsIGFuZCB3ZSBjYW4gdXNlIHRoZSBzdGF0aWMgXCIkZGF0YVwiIHZhbHVlLlxuICAgICAgICByZXR1cm4gbmV3IGtvLmJpbmRpbmdDb250ZXh0KHRoaXMuX3N1YnNjcmliYWJsZSB8fCB0aGlzWyckZGF0YSddLCB0aGlzLCBudWxsLCBmdW5jdGlvbihzZWxmLCBwYXJlbnRDb250ZXh0KSB7XG4gICAgICAgICAgICAvLyBUaGlzIFwiY2hpbGRcIiBjb250ZXh0IGRvZXNuJ3QgZGlyZWN0bHkgdHJhY2sgYSBwYXJlbnQgb2JzZXJ2YWJsZSB2aWV3IG1vZGVsLFxuICAgICAgICAgICAgLy8gc28gd2UgbmVlZCB0byBtYW51YWxseSBzZXQgdGhlICRyYXdEYXRhIHZhbHVlIHRvIG1hdGNoIHRoZSBwYXJlbnQuXG4gICAgICAgICAgICBzZWxmWyckcmF3RGF0YSddID0gcGFyZW50Q29udGV4dFsnJHJhd0RhdGEnXTtcbiAgICAgICAgICAgIGtvLnV0aWxzLmV4dGVuZChzZWxmLCB0eXBlb2YocHJvcGVydGllcykgPT0gXCJmdW5jdGlvblwiID8gcHJvcGVydGllcygpIDogcHJvcGVydGllcyk7XG4gICAgICAgIH0pO1xuICAgIH07XG5cbiAgICAvLyBSZXR1cm5zIHRoZSB2YWx1ZUFjY2Vzb3IgZnVuY3Rpb24gZm9yIGEgYmluZGluZyB2YWx1ZVxuICAgIGZ1bmN0aW9uIG1ha2VWYWx1ZUFjY2Vzc29yKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB2YWx1ZTtcbiAgICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBSZXR1cm5zIHRoZSB2YWx1ZSBvZiBhIHZhbHVlQWNjZXNzb3IgZnVuY3Rpb25cbiAgICBmdW5jdGlvbiBldmFsdWF0ZVZhbHVlQWNjZXNzb3IodmFsdWVBY2Nlc3Nvcikge1xuICAgICAgICByZXR1cm4gdmFsdWVBY2Nlc3NvcigpO1xuICAgIH1cblxuICAgIC8vIEdpdmVuIGEgZnVuY3Rpb24gdGhhdCByZXR1cm5zIGJpbmRpbmdzLCBjcmVhdGUgYW5kIHJldHVybiBhIG5ldyBvYmplY3QgdGhhdCBjb250YWluc1xuICAgIC8vIGJpbmRpbmcgdmFsdWUtYWNjZXNzb3JzIGZ1bmN0aW9ucy4gRWFjaCBhY2Nlc3NvciBmdW5jdGlvbiBjYWxscyB0aGUgb3JpZ2luYWwgZnVuY3Rpb25cbiAgICAvLyBzbyB0aGF0IGl0IGFsd2F5cyBnZXRzIHRoZSBsYXRlc3QgdmFsdWUgYW5kIGFsbCBkZXBlbmRlbmNpZXMgYXJlIGNhcHR1cmVkLiBUaGlzIGlzIHVzZWRcbiAgICAvLyBieSBrby5hcHBseUJpbmRpbmdzVG9Ob2RlIGFuZCBnZXRCaW5kaW5nc0FuZE1ha2VBY2Nlc3NvcnMuXG4gICAgZnVuY3Rpb24gbWFrZUFjY2Vzc29yc0Zyb21GdW5jdGlvbihjYWxsYmFjaykge1xuICAgICAgICByZXR1cm4ga28udXRpbHMub2JqZWN0TWFwKGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlKGNhbGxiYWNrKSwgZnVuY3Rpb24odmFsdWUsIGtleSkge1xuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjYWxsYmFjaygpW2tleV07XG4gICAgICAgICAgICB9O1xuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBHaXZlbiBhIGJpbmRpbmdzIGZ1bmN0aW9uIG9yIG9iamVjdCwgY3JlYXRlIGFuZCByZXR1cm4gYSBuZXcgb2JqZWN0IHRoYXQgY29udGFpbnNcbiAgICAvLyBiaW5kaW5nIHZhbHVlLWFjY2Vzc29ycyBmdW5jdGlvbnMuIFRoaXMgaXMgdXNlZCBieSBrby5hcHBseUJpbmRpbmdzVG9Ob2RlLlxuICAgIGZ1bmN0aW9uIG1ha2VCaW5kaW5nQWNjZXNzb3JzKGJpbmRpbmdzLCBjb250ZXh0LCBub2RlKSB7XG4gICAgICAgIGlmICh0eXBlb2YgYmluZGluZ3MgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiBtYWtlQWNjZXNzb3JzRnJvbUZ1bmN0aW9uKGJpbmRpbmdzLmJpbmQobnVsbCwgY29udGV4dCwgbm9kZSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIGtvLnV0aWxzLm9iamVjdE1hcChiaW5kaW5ncywgbWFrZVZhbHVlQWNjZXNzb3IpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gVGhpcyBmdW5jdGlvbiBpcyB1c2VkIGlmIHRoZSBiaW5kaW5nIHByb3ZpZGVyIGRvZXNuJ3QgaW5jbHVkZSBhIGdldEJpbmRpbmdBY2Nlc3NvcnMgZnVuY3Rpb24uXG4gICAgLy8gSXQgbXVzdCBiZSBjYWxsZWQgd2l0aCAndGhpcycgc2V0IHRvIHRoZSBwcm92aWRlciBpbnN0YW5jZS5cbiAgICBmdW5jdGlvbiBnZXRCaW5kaW5nc0FuZE1ha2VBY2Nlc3NvcnMobm9kZSwgY29udGV4dCkge1xuICAgICAgICByZXR1cm4gbWFrZUFjY2Vzc29yc0Zyb21GdW5jdGlvbih0aGlzWydnZXRCaW5kaW5ncyddLmJpbmQodGhpcywgbm9kZSwgY29udGV4dCkpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIHZhbGlkYXRlVGhhdEJpbmRpbmdJc0FsbG93ZWRGb3JWaXJ0dWFsRWxlbWVudHMoYmluZGluZ05hbWUpIHtcbiAgICAgICAgdmFyIHZhbGlkYXRvciA9IGtvLnZpcnR1YWxFbGVtZW50cy5hbGxvd2VkQmluZGluZ3NbYmluZGluZ05hbWVdO1xuICAgICAgICBpZiAoIXZhbGlkYXRvcilcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlRoZSBiaW5kaW5nICdcIiArIGJpbmRpbmdOYW1lICsgXCInIGNhbm5vdCBiZSB1c2VkIHdpdGggdmlydHVhbCBlbGVtZW50c1wiKVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFwcGx5QmluZGluZ3NUb0Rlc2NlbmRhbnRzSW50ZXJuYWwgKGJpbmRpbmdDb250ZXh0LCBlbGVtZW50T3JWaXJ0dWFsRWxlbWVudCwgYmluZGluZ0NvbnRleHRzTWF5RGlmZmVyRnJvbURvbVBhcmVudEVsZW1lbnQpIHtcbiAgICAgICAgdmFyIGN1cnJlbnRDaGlsZCxcbiAgICAgICAgICAgIG5leHRJblF1ZXVlID0ga28udmlydHVhbEVsZW1lbnRzLmZpcnN0Q2hpbGQoZWxlbWVudE9yVmlydHVhbEVsZW1lbnQpLFxuICAgICAgICAgICAgcHJvdmlkZXIgPSBrby5iaW5kaW5nUHJvdmlkZXJbJ2luc3RhbmNlJ10sXG4gICAgICAgICAgICBwcmVwcm9jZXNzTm9kZSA9IHByb3ZpZGVyWydwcmVwcm9jZXNzTm9kZSddO1xuXG4gICAgICAgIC8vIFByZXByb2Nlc3NpbmcgYWxsb3dzIGEgYmluZGluZyBwcm92aWRlciB0byBtdXRhdGUgYSBub2RlIGJlZm9yZSBiaW5kaW5ncyBhcmUgYXBwbGllZCB0byBpdC4gRm9yIGV4YW1wbGUgaXQnc1xuICAgICAgICAvLyBwb3NzaWJsZSB0byBpbnNlcnQgbmV3IHNpYmxpbmdzIGFmdGVyIGl0LCBhbmQvb3IgcmVwbGFjZSB0aGUgbm9kZSB3aXRoIGEgZGlmZmVyZW50IG9uZS4gVGhpcyBjYW4gYmUgdXNlZCB0b1xuICAgICAgICAvLyBpbXBsZW1lbnQgY3VzdG9tIGJpbmRpbmcgc3ludGF4ZXMsIHN1Y2ggYXMge3sgdmFsdWUgfX0gZm9yIHN0cmluZyBpbnRlcnBvbGF0aW9uLCBvciBjdXN0b20gZWxlbWVudCB0eXBlcyB0aGF0XG4gICAgICAgIC8vIHRyaWdnZXIgaW5zZXJ0aW9uIG9mIDx0ZW1wbGF0ZT4gY29udGVudHMgYXQgdGhhdCBwb2ludCBpbiB0aGUgZG9jdW1lbnQuXG4gICAgICAgIGlmIChwcmVwcm9jZXNzTm9kZSkge1xuICAgICAgICAgICAgd2hpbGUgKGN1cnJlbnRDaGlsZCA9IG5leHRJblF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgbmV4dEluUXVldWUgPSBrby52aXJ0dWFsRWxlbWVudHMubmV4dFNpYmxpbmcoY3VycmVudENoaWxkKTtcbiAgICAgICAgICAgICAgICBwcmVwcm9jZXNzTm9kZS5jYWxsKHByb3ZpZGVyLCBjdXJyZW50Q2hpbGQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gUmVzZXQgbmV4dEluUXVldWUgZm9yIHRoZSBuZXh0IGxvb3BcbiAgICAgICAgICAgIG5leHRJblF1ZXVlID0ga28udmlydHVhbEVsZW1lbnRzLmZpcnN0Q2hpbGQoZWxlbWVudE9yVmlydHVhbEVsZW1lbnQpO1xuICAgICAgICB9XG5cbiAgICAgICAgd2hpbGUgKGN1cnJlbnRDaGlsZCA9IG5leHRJblF1ZXVlKSB7XG4gICAgICAgICAgICAvLyBLZWVwIGEgcmVjb3JkIG9mIHRoZSBuZXh0IGNoaWxkICpiZWZvcmUqIGFwcGx5aW5nIGJpbmRpbmdzLCBpbiBjYXNlIHRoZSBiaW5kaW5nIHJlbW92ZXMgdGhlIGN1cnJlbnQgY2hpbGQgZnJvbSBpdHMgcG9zaXRpb25cbiAgICAgICAgICAgIG5leHRJblF1ZXVlID0ga28udmlydHVhbEVsZW1lbnRzLm5leHRTaWJsaW5nKGN1cnJlbnRDaGlsZCk7XG4gICAgICAgICAgICBhcHBseUJpbmRpbmdzVG9Ob2RlQW5kRGVzY2VuZGFudHNJbnRlcm5hbChiaW5kaW5nQ29udGV4dCwgY3VycmVudENoaWxkLCBiaW5kaW5nQ29udGV4dHNNYXlEaWZmZXJGcm9tRG9tUGFyZW50RWxlbWVudCk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhcHBseUJpbmRpbmdzVG9Ob2RlQW5kRGVzY2VuZGFudHNJbnRlcm5hbCAoYmluZGluZ0NvbnRleHQsIG5vZGVWZXJpZmllZCwgYmluZGluZ0NvbnRleHRNYXlEaWZmZXJGcm9tRG9tUGFyZW50RWxlbWVudCkge1xuICAgICAgICB2YXIgc2hvdWxkQmluZERlc2NlbmRhbnRzID0gdHJ1ZTtcblxuICAgICAgICAvLyBQZXJmIG9wdGltaXNhdGlvbjogQXBwbHkgYmluZGluZ3Mgb25seSBpZi4uLlxuICAgICAgICAvLyAoMSkgV2UgbmVlZCB0byBzdG9yZSB0aGUgYmluZGluZyBjb250ZXh0IG9uIHRoaXMgbm9kZSAoYmVjYXVzZSBpdCBtYXkgZGlmZmVyIGZyb20gdGhlIERPTSBwYXJlbnQgbm9kZSdzIGJpbmRpbmcgY29udGV4dClcbiAgICAgICAgLy8gICAgIE5vdGUgdGhhdCB3ZSBjYW4ndCBzdG9yZSBiaW5kaW5nIGNvbnRleHRzIG9uIG5vbi1lbGVtZW50cyAoZS5nLiwgdGV4dCBub2RlcyksIGFzIElFIGRvZXNuJ3QgYWxsb3cgZXhwYW5kbyBwcm9wZXJ0aWVzIGZvciB0aG9zZVxuICAgICAgICAvLyAoMikgSXQgbWlnaHQgaGF2ZSBiaW5kaW5ncyAoZS5nLiwgaXQgaGFzIGEgZGF0YS1iaW5kIGF0dHJpYnV0ZSwgb3IgaXQncyBhIG1hcmtlciBmb3IgYSBjb250YWluZXJsZXNzIHRlbXBsYXRlKVxuICAgICAgICB2YXIgaXNFbGVtZW50ID0gKG5vZGVWZXJpZmllZC5ub2RlVHlwZSA9PT0gMSk7XG4gICAgICAgIGlmIChpc0VsZW1lbnQpIC8vIFdvcmthcm91bmQgSUUgPD0gOCBIVE1MIHBhcnNpbmcgd2VpcmRuZXNzXG4gICAgICAgICAgICBrby52aXJ0dWFsRWxlbWVudHMubm9ybWFsaXNlVmlydHVhbEVsZW1lbnREb21TdHJ1Y3R1cmUobm9kZVZlcmlmaWVkKTtcblxuICAgICAgICB2YXIgc2hvdWxkQXBwbHlCaW5kaW5ncyA9IChpc0VsZW1lbnQgJiYgYmluZGluZ0NvbnRleHRNYXlEaWZmZXJGcm9tRG9tUGFyZW50RWxlbWVudCkgICAgICAgICAgICAgLy8gQ2FzZSAoMSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB8fCBrby5iaW5kaW5nUHJvdmlkZXJbJ2luc3RhbmNlJ11bJ25vZGVIYXNCaW5kaW5ncyddKG5vZGVWZXJpZmllZCk7ICAgICAgIC8vIENhc2UgKDIpXG4gICAgICAgIGlmIChzaG91bGRBcHBseUJpbmRpbmdzKVxuICAgICAgICAgICAgc2hvdWxkQmluZERlc2NlbmRhbnRzID0gYXBwbHlCaW5kaW5nc1RvTm9kZUludGVybmFsKG5vZGVWZXJpZmllZCwgbnVsbCwgYmluZGluZ0NvbnRleHQsIGJpbmRpbmdDb250ZXh0TWF5RGlmZmVyRnJvbURvbVBhcmVudEVsZW1lbnQpWydzaG91bGRCaW5kRGVzY2VuZGFudHMnXTtcblxuICAgICAgICBpZiAoc2hvdWxkQmluZERlc2NlbmRhbnRzICYmICFiaW5kaW5nRG9lc05vdFJlY3Vyc2VJbnRvRWxlbWVudFR5cGVzW2tvLnV0aWxzLnRhZ05hbWVMb3dlcihub2RlVmVyaWZpZWQpXSkge1xuICAgICAgICAgICAgLy8gV2UncmUgcmVjdXJzaW5nIGF1dG9tYXRpY2FsbHkgaW50byAocmVhbCBvciB2aXJ0dWFsKSBjaGlsZCBub2RlcyB3aXRob3V0IGNoYW5naW5nIGJpbmRpbmcgY29udGV4dHMuIFNvLFxuICAgICAgICAgICAgLy8gICogRm9yIGNoaWxkcmVuIG9mIGEgKnJlYWwqIGVsZW1lbnQsIHRoZSBiaW5kaW5nIGNvbnRleHQgaXMgY2VydGFpbmx5IHRoZSBzYW1lIGFzIG9uIHRoZWlyIERPTSAucGFyZW50Tm9kZSxcbiAgICAgICAgICAgIC8vICAgIGhlbmNlIGJpbmRpbmdDb250ZXh0c01heURpZmZlckZyb21Eb21QYXJlbnRFbGVtZW50IGlzIGZhbHNlXG4gICAgICAgICAgICAvLyAgKiBGb3IgY2hpbGRyZW4gb2YgYSAqdmlydHVhbCogZWxlbWVudCwgd2UgY2FuJ3QgYmUgc3VyZS4gRXZhbHVhdGluZyAucGFyZW50Tm9kZSBvbiB0aG9zZSBjaGlsZHJlbiBtYXlcbiAgICAgICAgICAgIC8vICAgIHNraXAgb3ZlciBhbnkgbnVtYmVyIG9mIGludGVybWVkaWF0ZSB2aXJ0dWFsIGVsZW1lbnRzLCBhbnkgb2Ygd2hpY2ggbWlnaHQgZGVmaW5lIGEgY3VzdG9tIGJpbmRpbmcgY29udGV4dCxcbiAgICAgICAgICAgIC8vICAgIGhlbmNlIGJpbmRpbmdDb250ZXh0c01heURpZmZlckZyb21Eb21QYXJlbnRFbGVtZW50IGlzIHRydWVcbiAgICAgICAgICAgIGFwcGx5QmluZGluZ3NUb0Rlc2NlbmRhbnRzSW50ZXJuYWwoYmluZGluZ0NvbnRleHQsIG5vZGVWZXJpZmllZCwgLyogYmluZGluZ0NvbnRleHRzTWF5RGlmZmVyRnJvbURvbVBhcmVudEVsZW1lbnQ6ICovICFpc0VsZW1lbnQpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgdmFyIGJvdW5kRWxlbWVudERvbURhdGFLZXkgPSBrby51dGlscy5kb21EYXRhLm5leHRLZXkoKTtcblxuXG4gICAgZnVuY3Rpb24gdG9wb2xvZ2ljYWxTb3J0QmluZGluZ3MoYmluZGluZ3MpIHtcbiAgICAgICAgLy8gRGVwdGgtZmlyc3Qgc29ydFxuICAgICAgICB2YXIgcmVzdWx0ID0gW10sICAgICAgICAgICAgICAgIC8vIFRoZSBsaXN0IG9mIGtleS9oYW5kbGVyIHBhaXJzIHRoYXQgd2Ugd2lsbCByZXR1cm5cbiAgICAgICAgICAgIGJpbmRpbmdzQ29uc2lkZXJlZCA9IHt9LCAgICAvLyBBIHRlbXBvcmFyeSByZWNvcmQgb2Ygd2hpY2ggYmluZGluZ3MgYXJlIGFscmVhZHkgaW4gJ3Jlc3VsdCdcbiAgICAgICAgICAgIGN5Y2xpY0RlcGVuZGVuY3lTdGFjayA9IFtdOyAvLyBLZWVwcyB0cmFjayBvZiBhIGRlcHRoLXNlYXJjaCBzbyB0aGF0LCBpZiB0aGVyZSdzIGEgY3ljbGUsIHdlIGtub3cgd2hpY2ggYmluZGluZ3MgY2F1c2VkIGl0XG4gICAgICAgIGtvLnV0aWxzLm9iamVjdEZvckVhY2goYmluZGluZ3MsIGZ1bmN0aW9uIHB1c2hCaW5kaW5nKGJpbmRpbmdLZXkpIHtcbiAgICAgICAgICAgIGlmICghYmluZGluZ3NDb25zaWRlcmVkW2JpbmRpbmdLZXldKSB7XG4gICAgICAgICAgICAgICAgdmFyIGJpbmRpbmcgPSBrb1snZ2V0QmluZGluZ0hhbmRsZXInXShiaW5kaW5nS2V5KTtcbiAgICAgICAgICAgICAgICBpZiAoYmluZGluZykge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaXJzdCBhZGQgZGVwZW5kZW5jaWVzIChpZiBhbnkpIG9mIHRoZSBjdXJyZW50IGJpbmRpbmdcbiAgICAgICAgICAgICAgICAgICAgaWYgKGJpbmRpbmdbJ2FmdGVyJ10pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN5Y2xpY0RlcGVuZGVuY3lTdGFjay5wdXNoKGJpbmRpbmdLZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAga28udXRpbHMuYXJyYXlGb3JFYWNoKGJpbmRpbmdbJ2FmdGVyJ10sIGZ1bmN0aW9uKGJpbmRpbmdEZXBlbmRlbmN5S2V5KSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGJpbmRpbmdzW2JpbmRpbmdEZXBlbmRlbmN5S2V5XSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoa28udXRpbHMuYXJyYXlJbmRleE9mKGN5Y2xpY0RlcGVuZGVuY3lTdGFjaywgYmluZGluZ0RlcGVuZGVuY3lLZXkpICE9PSAtMSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgRXJyb3IoXCJDYW5ub3QgY29tYmluZSB0aGUgZm9sbG93aW5nIGJpbmRpbmdzLCBiZWNhdXNlIHRoZXkgaGF2ZSBhIGN5Y2xpYyBkZXBlbmRlbmN5OiBcIiArIGN5Y2xpY0RlcGVuZGVuY3lTdGFjay5qb2luKFwiLCBcIikpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcHVzaEJpbmRpbmcoYmluZGluZ0RlcGVuZGVuY3lLZXkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjeWNsaWNEZXBlbmRlbmN5U3RhY2subGVuZ3RoLS07XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgLy8gTmV4dCBhZGQgdGhlIGN1cnJlbnQgYmluZGluZ1xuICAgICAgICAgICAgICAgICAgICByZXN1bHQucHVzaCh7IGtleTogYmluZGluZ0tleSwgaGFuZGxlcjogYmluZGluZyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgYmluZGluZ3NDb25zaWRlcmVkW2JpbmRpbmdLZXldID0gdHJ1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgcmV0dXJuIHJlc3VsdDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBhcHBseUJpbmRpbmdzVG9Ob2RlSW50ZXJuYWwobm9kZSwgc291cmNlQmluZGluZ3MsIGJpbmRpbmdDb250ZXh0LCBiaW5kaW5nQ29udGV4dE1heURpZmZlckZyb21Eb21QYXJlbnRFbGVtZW50KSB7XG4gICAgICAgIC8vIFByZXZlbnQgbXVsdGlwbGUgYXBwbHlCaW5kaW5ncyBjYWxscyBmb3IgdGhlIHNhbWUgbm9kZSwgZXhjZXB0IHdoZW4gYSBiaW5kaW5nIHZhbHVlIGlzIHNwZWNpZmllZFxuICAgICAgICB2YXIgYWxyZWFkeUJvdW5kID0ga28udXRpbHMuZG9tRGF0YS5nZXQobm9kZSwgYm91bmRFbGVtZW50RG9tRGF0YUtleSk7XG4gICAgICAgIGlmICghc291cmNlQmluZGluZ3MpIHtcbiAgICAgICAgICAgIGlmIChhbHJlYWR5Qm91bmQpIHtcbiAgICAgICAgICAgICAgICB0aHJvdyBFcnJvcihcIllvdSBjYW5ub3QgYXBwbHkgYmluZGluZ3MgbXVsdGlwbGUgdGltZXMgdG8gdGhlIHNhbWUgZWxlbWVudC5cIik7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBrby51dGlscy5kb21EYXRhLnNldChub2RlLCBib3VuZEVsZW1lbnREb21EYXRhS2V5LCB0cnVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIE9wdGltaXphdGlvbjogRG9uJ3Qgc3RvcmUgdGhlIGJpbmRpbmcgY29udGV4dCBvbiB0aGlzIG5vZGUgaWYgaXQncyBkZWZpbml0ZWx5IHRoZSBzYW1lIGFzIG9uIG5vZGUucGFyZW50Tm9kZSwgYmVjYXVzZVxuICAgICAgICAvLyB3ZSBjYW4gZWFzaWx5IHJlY292ZXIgaXQganVzdCBieSBzY2FubmluZyB1cCB0aGUgbm9kZSdzIGFuY2VzdG9ycyBpbiB0aGUgRE9NXG4gICAgICAgIC8vIChub3RlOiBoZXJlLCBwYXJlbnQgbm9kZSBtZWFucyBcInJlYWwgRE9NIHBhcmVudFwiIG5vdCBcInZpcnR1YWwgcGFyZW50XCIsIGFzIHRoZXJlJ3Mgbm8gTygxKSB3YXkgdG8gZmluZCB0aGUgdmlydHVhbCBwYXJlbnQpXG4gICAgICAgIGlmICghYWxyZWFkeUJvdW5kICYmIGJpbmRpbmdDb250ZXh0TWF5RGlmZmVyRnJvbURvbVBhcmVudEVsZW1lbnQpXG4gICAgICAgICAgICBrby5zdG9yZWRCaW5kaW5nQ29udGV4dEZvck5vZGUobm9kZSwgYmluZGluZ0NvbnRleHQpO1xuXG4gICAgICAgIC8vIFVzZSBiaW5kaW5ncyBpZiBnaXZlbiwgb3RoZXJ3aXNlIGZhbGwgYmFjayBvbiBhc2tpbmcgdGhlIGJpbmRpbmdzIHByb3ZpZGVyIHRvIGdpdmUgdXMgc29tZSBiaW5kaW5nc1xuICAgICAgICB2YXIgYmluZGluZ3M7XG4gICAgICAgIGlmIChzb3VyY2VCaW5kaW5ncyAmJiB0eXBlb2Ygc291cmNlQmluZGluZ3MgIT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIGJpbmRpbmdzID0gc291cmNlQmluZGluZ3M7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgcHJvdmlkZXIgPSBrby5iaW5kaW5nUHJvdmlkZXJbJ2luc3RhbmNlJ10sXG4gICAgICAgICAgICAgICAgZ2V0QmluZGluZ3MgPSBwcm92aWRlclsnZ2V0QmluZGluZ0FjY2Vzc29ycyddIHx8IGdldEJpbmRpbmdzQW5kTWFrZUFjY2Vzc29ycztcblxuICAgICAgICAgICAgLy8gR2V0IHRoZSBiaW5kaW5nIGZyb20gdGhlIHByb3ZpZGVyIHdpdGhpbiBhIGNvbXB1dGVkIG9ic2VydmFibGUgc28gdGhhdCB3ZSBjYW4gdXBkYXRlIHRoZSBiaW5kaW5ncyB3aGVuZXZlclxuICAgICAgICAgICAgLy8gdGhlIGJpbmRpbmcgY29udGV4dCBpcyB1cGRhdGVkIG9yIGlmIHRoZSBiaW5kaW5nIHByb3ZpZGVyIGFjY2Vzc2VzIG9ic2VydmFibGVzLlxuICAgICAgICAgICAgdmFyIGJpbmRpbmdzVXBkYXRlciA9IGtvLmRlcGVuZGVudE9ic2VydmFibGUoXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIGJpbmRpbmdzID0gc291cmNlQmluZGluZ3MgPyBzb3VyY2VCaW5kaW5ncyhiaW5kaW5nQ29udGV4dCwgbm9kZSkgOiBnZXRCaW5kaW5ncy5jYWxsKHByb3ZpZGVyLCBub2RlLCBiaW5kaW5nQ29udGV4dCk7XG4gICAgICAgICAgICAgICAgICAgIC8vIFJlZ2lzdGVyIGEgZGVwZW5kZW5jeSBvbiB0aGUgYmluZGluZyBjb250ZXh0IHRvIHN1cHBvcnQgb2JzZXJ2YWJsZSB2aWV3IG1vZGVscy5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGJpbmRpbmdzICYmIGJpbmRpbmdDb250ZXh0Ll9zdWJzY3JpYmFibGUpXG4gICAgICAgICAgICAgICAgICAgICAgICBiaW5kaW5nQ29udGV4dC5fc3Vic2NyaWJhYmxlKCk7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBiaW5kaW5ncztcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIG51bGwsIHsgZGlzcG9zZVdoZW5Ob2RlSXNSZW1vdmVkOiBub2RlIH1cbiAgICAgICAgICAgICk7XG5cbiAgICAgICAgICAgIGlmICghYmluZGluZ3MgfHwgIWJpbmRpbmdzVXBkYXRlci5pc0FjdGl2ZSgpKVxuICAgICAgICAgICAgICAgIGJpbmRpbmdzVXBkYXRlciA9IG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgYmluZGluZ0hhbmRsZXJUaGF0Q29udHJvbHNEZXNjZW5kYW50QmluZGluZ3M7XG4gICAgICAgIGlmIChiaW5kaW5ncykge1xuICAgICAgICAgICAgLy8gUmV0dXJuIHRoZSB2YWx1ZSBhY2Nlc3NvciBmb3IgYSBnaXZlbiBiaW5kaW5nLiBXaGVuIGJpbmRpbmdzIGFyZSBzdGF0aWMgKHdvbid0IGJlIHVwZGF0ZWQgYmVjYXVzZSBvZiBhIGJpbmRpbmdcbiAgICAgICAgICAgIC8vIGNvbnRleHQgdXBkYXRlKSwganVzdCByZXR1cm4gdGhlIHZhbHVlIGFjY2Vzc29yIGZyb20gdGhlIGJpbmRpbmcuIE90aGVyd2lzZSwgcmV0dXJuIGEgZnVuY3Rpb24gdGhhdCBhbHdheXMgZ2V0c1xuICAgICAgICAgICAgLy8gdGhlIGxhdGVzdCBiaW5kaW5nIHZhbHVlIGFuZCByZWdpc3RlcnMgYSBkZXBlbmRlbmN5IG9uIHRoZSBiaW5kaW5nIHVwZGF0ZXIuXG4gICAgICAgICAgICB2YXIgZ2V0VmFsdWVBY2Nlc3NvciA9IGJpbmRpbmdzVXBkYXRlclxuICAgICAgICAgICAgICAgID8gZnVuY3Rpb24oYmluZGluZ0tleSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4gZXZhbHVhdGVWYWx1ZUFjY2Vzc29yKGJpbmRpbmdzVXBkYXRlcigpW2JpbmRpbmdLZXldKTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICB9IDogZnVuY3Rpb24oYmluZGluZ0tleSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4gYmluZGluZ3NbYmluZGluZ0tleV07XG4gICAgICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgLy8gVXNlIG9mIGFsbEJpbmRpbmdzIGFzIGEgZnVuY3Rpb24gaXMgbWFpbnRhaW5lZCBmb3IgYmFja3dhcmRzIGNvbXBhdGliaWxpdHksIGJ1dCBpdHMgdXNlIGlzIGRlcHJlY2F0ZWRcbiAgICAgICAgICAgIGZ1bmN0aW9uIGFsbEJpbmRpbmdzKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBrby51dGlscy5vYmplY3RNYXAoYmluZGluZ3NVcGRhdGVyID8gYmluZGluZ3NVcGRhdGVyKCkgOiBiaW5kaW5ncywgZXZhbHVhdGVWYWx1ZUFjY2Vzc29yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgaXMgdGhlIDMueCBhbGxCaW5kaW5ncyBBUElcbiAgICAgICAgICAgIGFsbEJpbmRpbmdzWydnZXQnXSA9IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBiaW5kaW5nc1trZXldICYmIGV2YWx1YXRlVmFsdWVBY2Nlc3NvcihnZXRWYWx1ZUFjY2Vzc29yKGtleSkpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIGFsbEJpbmRpbmdzWydoYXMnXSA9IGZ1bmN0aW9uKGtleSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBrZXkgaW4gYmluZGluZ3M7XG4gICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAvLyBGaXJzdCBwdXQgdGhlIGJpbmRpbmdzIGludG8gdGhlIHJpZ2h0IG9yZGVyXG4gICAgICAgICAgICB2YXIgb3JkZXJlZEJpbmRpbmdzID0gdG9wb2xvZ2ljYWxTb3J0QmluZGluZ3MoYmluZGluZ3MpO1xuXG4gICAgICAgICAgICAvLyBHbyB0aHJvdWdoIHRoZSBzb3J0ZWQgYmluZGluZ3MsIGNhbGxpbmcgaW5pdCBhbmQgdXBkYXRlIGZvciBlYWNoXG4gICAgICAgICAgICBrby51dGlscy5hcnJheUZvckVhY2gob3JkZXJlZEJpbmRpbmdzLCBmdW5jdGlvbihiaW5kaW5nS2V5QW5kSGFuZGxlcikge1xuICAgICAgICAgICAgICAgIC8vIE5vdGUgdGhhdCB0b3BvbG9naWNhbFNvcnRCaW5kaW5ncyBoYXMgYWxyZWFkeSBmaWx0ZXJlZCBvdXQgYW55IG5vbmV4aXN0ZW50IGJpbmRpbmcgaGFuZGxlcnMsXG4gICAgICAgICAgICAgICAgLy8gc28gYmluZGluZ0tleUFuZEhhbmRsZXIuaGFuZGxlciB3aWxsIGFsd2F5cyBiZSBub25udWxsLlxuICAgICAgICAgICAgICAgIHZhciBoYW5kbGVySW5pdEZuID0gYmluZGluZ0tleUFuZEhhbmRsZXIuaGFuZGxlcltcImluaXRcIl0sXG4gICAgICAgICAgICAgICAgICAgIGhhbmRsZXJVcGRhdGVGbiA9IGJpbmRpbmdLZXlBbmRIYW5kbGVyLmhhbmRsZXJbXCJ1cGRhdGVcIl0sXG4gICAgICAgICAgICAgICAgICAgIGJpbmRpbmdLZXkgPSBiaW5kaW5nS2V5QW5kSGFuZGxlci5rZXk7XG5cbiAgICAgICAgICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gOCkge1xuICAgICAgICAgICAgICAgICAgICB2YWxpZGF0ZVRoYXRCaW5kaW5nSXNBbGxvd2VkRm9yVmlydHVhbEVsZW1lbnRzKGJpbmRpbmdLZXkpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIFJ1biBpbml0LCBpZ25vcmluZyBhbnkgZGVwZW5kZW5jaWVzXG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgaGFuZGxlckluaXRGbiA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBpbml0UmVzdWx0ID0gaGFuZGxlckluaXRGbihub2RlLCBnZXRWYWx1ZUFjY2Vzc29yKGJpbmRpbmdLZXkpLCBhbGxCaW5kaW5ncywgYmluZGluZ0NvbnRleHRbJyRkYXRhJ10sIGJpbmRpbmdDb250ZXh0KTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgYmluZGluZyBoYW5kbGVyIGNsYWltcyB0byBjb250cm9sIGRlc2NlbmRhbnQgYmluZGluZ3MsIG1ha2UgYSBub3RlIG9mIHRoaXNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoaW5pdFJlc3VsdCAmJiBpbml0UmVzdWx0Wydjb250cm9sc0Rlc2NlbmRhbnRCaW5kaW5ncyddKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChiaW5kaW5nSGFuZGxlclRoYXRDb250cm9sc0Rlc2NlbmRhbnRCaW5kaW5ncyAhPT0gdW5kZWZpbmVkKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiTXVsdGlwbGUgYmluZGluZ3MgKFwiICsgYmluZGluZ0hhbmRsZXJUaGF0Q29udHJvbHNEZXNjZW5kYW50QmluZGluZ3MgKyBcIiBhbmQgXCIgKyBiaW5kaW5nS2V5ICsgXCIpIGFyZSB0cnlpbmcgdG8gY29udHJvbCBkZXNjZW5kYW50IGJpbmRpbmdzIG9mIHRoZSBzYW1lIGVsZW1lbnQuIFlvdSBjYW5ub3QgdXNlIHRoZXNlIGJpbmRpbmdzIHRvZ2V0aGVyIG9uIHRoZSBzYW1lIGVsZW1lbnQuXCIpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBiaW5kaW5nSGFuZGxlclRoYXRDb250cm9sc0Rlc2NlbmRhbnRCaW5kaW5ncyA9IGJpbmRpbmdLZXk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAvLyBSdW4gdXBkYXRlIGluIGl0cyBvd24gY29tcHV0ZWQgd3JhcHBlclxuICAgICAgICAgICAgICAgICAgICBpZiAodHlwZW9mIGhhbmRsZXJVcGRhdGVGbiA9PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtvLmRlcGVuZGVudE9ic2VydmFibGUoXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGhhbmRsZXJVcGRhdGVGbihub2RlLCBnZXRWYWx1ZUFjY2Vzc29yKGJpbmRpbmdLZXkpLCBhbGxCaW5kaW5ncywgYmluZGluZ0NvbnRleHRbJyRkYXRhJ10sIGJpbmRpbmdDb250ZXh0KTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgeyBkaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQ6IG5vZGUgfVxuICAgICAgICAgICAgICAgICAgICAgICAgKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0gY2F0Y2ggKGV4KSB7XG4gICAgICAgICAgICAgICAgICAgIGV4Lm1lc3NhZ2UgPSBcIlVuYWJsZSB0byBwcm9jZXNzIGJpbmRpbmcgXFxcIlwiICsgYmluZGluZ0tleSArIFwiOiBcIiArIGJpbmRpbmdzW2JpbmRpbmdLZXldICsgXCJcXFwiXFxuTWVzc2FnZTogXCIgKyBleC5tZXNzYWdlO1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBleDtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAnc2hvdWxkQmluZERlc2NlbmRhbnRzJzogYmluZGluZ0hhbmRsZXJUaGF0Q29udHJvbHNEZXNjZW5kYW50QmluZGluZ3MgPT09IHVuZGVmaW5lZFxuICAgICAgICB9O1xuICAgIH07XG5cbiAgICB2YXIgc3RvcmVkQmluZGluZ0NvbnRleHREb21EYXRhS2V5ID0ga28udXRpbHMuZG9tRGF0YS5uZXh0S2V5KCk7XG4gICAga28uc3RvcmVkQmluZGluZ0NvbnRleHRGb3JOb2RlID0gZnVuY3Rpb24gKG5vZGUsIGJpbmRpbmdDb250ZXh0KSB7XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09IDIpIHtcbiAgICAgICAgICAgIGtvLnV0aWxzLmRvbURhdGEuc2V0KG5vZGUsIHN0b3JlZEJpbmRpbmdDb250ZXh0RG9tRGF0YUtleSwgYmluZGluZ0NvbnRleHQpO1xuICAgICAgICAgICAgaWYgKGJpbmRpbmdDb250ZXh0Ll9zdWJzY3JpYmFibGUpXG4gICAgICAgICAgICAgICAgYmluZGluZ0NvbnRleHQuX3N1YnNjcmliYWJsZS5fYWRkTm9kZShub2RlKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHJldHVybiBrby51dGlscy5kb21EYXRhLmdldChub2RlLCBzdG9yZWRCaW5kaW5nQ29udGV4dERvbURhdGFLZXkpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0QmluZGluZ0NvbnRleHQodmlld01vZGVsT3JCaW5kaW5nQ29udGV4dCkge1xuICAgICAgICByZXR1cm4gdmlld01vZGVsT3JCaW5kaW5nQ29udGV4dCAmJiAodmlld01vZGVsT3JCaW5kaW5nQ29udGV4dCBpbnN0YW5jZW9mIGtvLmJpbmRpbmdDb250ZXh0KVxuICAgICAgICAgICAgPyB2aWV3TW9kZWxPckJpbmRpbmdDb250ZXh0XG4gICAgICAgICAgICA6IG5ldyBrby5iaW5kaW5nQ29udGV4dCh2aWV3TW9kZWxPckJpbmRpbmdDb250ZXh0KTtcbiAgICB9XG5cbiAgICBrby5hcHBseUJpbmRpbmdBY2Nlc3NvcnNUb05vZGUgPSBmdW5jdGlvbiAobm9kZSwgYmluZGluZ3MsIHZpZXdNb2RlbE9yQmluZGluZ0NvbnRleHQpIHtcbiAgICAgICAgaWYgKG5vZGUubm9kZVR5cGUgPT09IDEpIC8vIElmIGl0J3MgYW4gZWxlbWVudCwgd29ya2Fyb3VuZCBJRSA8PSA4IEhUTUwgcGFyc2luZyB3ZWlyZG5lc3NcbiAgICAgICAgICAgIGtvLnZpcnR1YWxFbGVtZW50cy5ub3JtYWxpc2VWaXJ0dWFsRWxlbWVudERvbVN0cnVjdHVyZShub2RlKTtcbiAgICAgICAgcmV0dXJuIGFwcGx5QmluZGluZ3NUb05vZGVJbnRlcm5hbChub2RlLCBiaW5kaW5ncywgZ2V0QmluZGluZ0NvbnRleHQodmlld01vZGVsT3JCaW5kaW5nQ29udGV4dCksIHRydWUpO1xuICAgIH07XG5cbiAgICBrby5hcHBseUJpbmRpbmdzVG9Ob2RlID0gZnVuY3Rpb24gKG5vZGUsIGJpbmRpbmdzLCB2aWV3TW9kZWxPckJpbmRpbmdDb250ZXh0KSB7XG4gICAgICAgIHZhciBjb250ZXh0ID0gZ2V0QmluZGluZ0NvbnRleHQodmlld01vZGVsT3JCaW5kaW5nQ29udGV4dCk7XG4gICAgICAgIHJldHVybiBrby5hcHBseUJpbmRpbmdBY2Nlc3NvcnNUb05vZGUobm9kZSwgbWFrZUJpbmRpbmdBY2Nlc3NvcnMoYmluZGluZ3MsIGNvbnRleHQsIG5vZGUpLCBjb250ZXh0KTtcbiAgICB9O1xuXG4gICAga28uYXBwbHlCaW5kaW5nc1RvRGVzY2VuZGFudHMgPSBmdW5jdGlvbih2aWV3TW9kZWxPckJpbmRpbmdDb250ZXh0LCByb290Tm9kZSkge1xuICAgICAgICBpZiAocm9vdE5vZGUubm9kZVR5cGUgPT09IDEgfHwgcm9vdE5vZGUubm9kZVR5cGUgPT09IDgpXG4gICAgICAgICAgICBhcHBseUJpbmRpbmdzVG9EZXNjZW5kYW50c0ludGVybmFsKGdldEJpbmRpbmdDb250ZXh0KHZpZXdNb2RlbE9yQmluZGluZ0NvbnRleHQpLCByb290Tm9kZSwgdHJ1ZSk7XG4gICAgfTtcblxuICAgIGtvLmFwcGx5QmluZGluZ3MgPSBmdW5jdGlvbiAodmlld01vZGVsT3JCaW5kaW5nQ29udGV4dCwgcm9vdE5vZGUpIHtcbiAgICAgICAgLy8gSWYgalF1ZXJ5IGlzIGxvYWRlZCBhZnRlciBLbm9ja291dCwgd2Ugd29uJ3QgaW5pdGlhbGx5IGhhdmUgYWNjZXNzIHRvIGl0LiBTbyBzYXZlIGl0IGhlcmUuXG4gICAgICAgIGlmICghalF1ZXJ5SW5zdGFuY2UgJiYgd2luZG93WydqUXVlcnknXSkge1xuICAgICAgICAgICAgalF1ZXJ5SW5zdGFuY2UgPSB3aW5kb3dbJ2pRdWVyeSddO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHJvb3ROb2RlICYmIChyb290Tm9kZS5ub2RlVHlwZSAhPT0gMSkgJiYgKHJvb3ROb2RlLm5vZGVUeXBlICE9PSA4KSlcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcImtvLmFwcGx5QmluZGluZ3M6IGZpcnN0IHBhcmFtZXRlciBzaG91bGQgYmUgeW91ciB2aWV3IG1vZGVsOyBzZWNvbmQgcGFyYW1ldGVyIHNob3VsZCBiZSBhIERPTSBub2RlXCIpO1xuICAgICAgICByb290Tm9kZSA9IHJvb3ROb2RlIHx8IHdpbmRvdy5kb2N1bWVudC5ib2R5OyAvLyBNYWtlIFwicm9vdE5vZGVcIiBwYXJhbWV0ZXIgb3B0aW9uYWxcblxuICAgICAgICBhcHBseUJpbmRpbmdzVG9Ob2RlQW5kRGVzY2VuZGFudHNJbnRlcm5hbChnZXRCaW5kaW5nQ29udGV4dCh2aWV3TW9kZWxPckJpbmRpbmdDb250ZXh0KSwgcm9vdE5vZGUsIHRydWUpO1xuICAgIH07XG5cbiAgICAvLyBSZXRyaWV2aW5nIGJpbmRpbmcgY29udGV4dCBmcm9tIGFyYml0cmFyeSBub2Rlc1xuICAgIGtvLmNvbnRleHRGb3IgPSBmdW5jdGlvbihub2RlKSB7XG4gICAgICAgIC8vIFdlIGNhbiBvbmx5IGRvIHNvbWV0aGluZyBtZWFuaW5nZnVsIGZvciBlbGVtZW50cyBhbmQgY29tbWVudCBub2RlcyAoaW4gcGFydGljdWxhciwgbm90IHRleHQgbm9kZXMsIGFzIElFIGNhbid0IHN0b3JlIGRvbWRhdGEgZm9yIHRoZW0pXG4gICAgICAgIHN3aXRjaCAobm9kZS5ub2RlVHlwZSkge1xuICAgICAgICAgICAgY2FzZSAxOlxuICAgICAgICAgICAgY2FzZSA4OlxuICAgICAgICAgICAgICAgIHZhciBjb250ZXh0ID0ga28uc3RvcmVkQmluZGluZ0NvbnRleHRGb3JOb2RlKG5vZGUpO1xuICAgICAgICAgICAgICAgIGlmIChjb250ZXh0KSByZXR1cm4gY29udGV4dDtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5wYXJlbnROb2RlKSByZXR1cm4ga28uY29udGV4dEZvcihub2RlLnBhcmVudE5vZGUpO1xuICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfTtcbiAgICBrby5kYXRhRm9yID0gZnVuY3Rpb24obm9kZSkge1xuICAgICAgICB2YXIgY29udGV4dCA9IGtvLmNvbnRleHRGb3Iobm9kZSk7XG4gICAgICAgIHJldHVybiBjb250ZXh0ID8gY29udGV4dFsnJGRhdGEnXSA6IHVuZGVmaW5lZDtcbiAgICB9O1xuXG4gICAga28uZXhwb3J0U3ltYm9sKCdiaW5kaW5nSGFuZGxlcnMnLCBrby5iaW5kaW5nSGFuZGxlcnMpO1xuICAgIGtvLmV4cG9ydFN5bWJvbCgnYXBwbHlCaW5kaW5ncycsIGtvLmFwcGx5QmluZGluZ3MpO1xuICAgIGtvLmV4cG9ydFN5bWJvbCgnYXBwbHlCaW5kaW5nc1RvRGVzY2VuZGFudHMnLCBrby5hcHBseUJpbmRpbmdzVG9EZXNjZW5kYW50cyk7XG4gICAga28uZXhwb3J0U3ltYm9sKCdhcHBseUJpbmRpbmdBY2Nlc3NvcnNUb05vZGUnLCBrby5hcHBseUJpbmRpbmdBY2Nlc3NvcnNUb05vZGUpO1xuICAgIGtvLmV4cG9ydFN5bWJvbCgnYXBwbHlCaW5kaW5nc1RvTm9kZScsIGtvLmFwcGx5QmluZGluZ3NUb05vZGUpO1xuICAgIGtvLmV4cG9ydFN5bWJvbCgnY29udGV4dEZvcicsIGtvLmNvbnRleHRGb3IpO1xuICAgIGtvLmV4cG9ydFN5bWJvbCgnZGF0YUZvcicsIGtvLmRhdGFGb3IpO1xufSkoKTtcbihmdW5jdGlvbih1bmRlZmluZWQpIHtcbiAgICB2YXIgbG9hZGluZ1N1YnNjcmliYWJsZXNDYWNoZSA9IHt9LCAvLyBUcmFja3MgY29tcG9uZW50IGxvYWRzIHRoYXQgYXJlIGN1cnJlbnRseSBpbiBmbGlnaHRcbiAgICAgICAgbG9hZGVkRGVmaW5pdGlvbnNDYWNoZSA9IHt9OyAgICAvLyBUcmFja3MgY29tcG9uZW50IGxvYWRzIHRoYXQgaGF2ZSBhbHJlYWR5IGNvbXBsZXRlZFxuXG4gICAga28uY29tcG9uZW50cyA9IHtcbiAgICAgICAgZ2V0OiBmdW5jdGlvbihjb21wb25lbnROYW1lLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgdmFyIGNhY2hlZERlZmluaXRpb24gPSBnZXRPYmplY3RPd25Qcm9wZXJ0eShsb2FkZWREZWZpbml0aW9uc0NhY2hlLCBjb21wb25lbnROYW1lKTtcbiAgICAgICAgICAgIGlmIChjYWNoZWREZWZpbml0aW9uKSB7XG4gICAgICAgICAgICAgICAgLy8gSXQncyBhbHJlYWR5IGxvYWRlZCBhbmQgY2FjaGVkLiBSZXVzZSB0aGUgc2FtZSBkZWZpbml0aW9uIG9iamVjdC5cbiAgICAgICAgICAgICAgICAvLyBOb3RlIHRoYXQgZm9yIEFQSSBjb25zaXN0ZW5jeSwgZXZlbiBjYWNoZSBoaXRzIGNvbXBsZXRlIGFzeW5jaHJvbm91c2x5IGJ5IGRlZmF1bHQuXG4gICAgICAgICAgICAgICAgLy8gWW91IGNhbiBieXBhc3MgdGhpcyBieSBwdXR0aW5nIHN5bmNocm9ub3VzOnRydWUgb24geW91ciBjb21wb25lbnQgY29uZmlnLlxuICAgICAgICAgICAgICAgIGlmIChjYWNoZWREZWZpbml0aW9uLmlzU3luY2hyb25vdXNDb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAga28uZGVwZW5kZW5jeURldGVjdGlvbi5pZ25vcmUoZnVuY3Rpb24oKSB7IC8vIFNlZSBjb21tZW50IGluIGxvYWRlclJlZ2lzdHJ5QmVoYXZpb3JzLmpzIGZvciByZWFzb25pbmdcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGNhY2hlZERlZmluaXRpb24uZGVmaW5pdGlvbik7XG4gICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGtvLnRhc2tzLnNjaGVkdWxlKGZ1bmN0aW9uKCkgeyBjYWxsYmFjayhjYWNoZWREZWZpbml0aW9uLmRlZmluaXRpb24pOyB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC8vIEpvaW4gdGhlIGxvYWRpbmcgcHJvY2VzcyB0aGF0IGlzIGFscmVhZHkgdW5kZXJ3YXksIG9yIHN0YXJ0IGEgbmV3IG9uZS5cbiAgICAgICAgICAgICAgICBsb2FkQ29tcG9uZW50QW5kTm90aWZ5KGNvbXBvbmVudE5hbWUsIGNhbGxiYWNrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSxcblxuICAgICAgICBjbGVhckNhY2hlZERlZmluaXRpb246IGZ1bmN0aW9uKGNvbXBvbmVudE5hbWUpIHtcbiAgICAgICAgICAgIGRlbGV0ZSBsb2FkZWREZWZpbml0aW9uc0NhY2hlW2NvbXBvbmVudE5hbWVdO1xuICAgICAgICB9LFxuXG4gICAgICAgIF9nZXRGaXJzdFJlc3VsdEZyb21Mb2FkZXJzOiBnZXRGaXJzdFJlc3VsdEZyb21Mb2FkZXJzXG4gICAgfTtcblxuICAgIGZ1bmN0aW9uIGdldE9iamVjdE93blByb3BlcnR5KG9iaiwgcHJvcE5hbWUpIHtcbiAgICAgICAgcmV0dXJuIG9iai5oYXNPd25Qcm9wZXJ0eShwcm9wTmFtZSkgPyBvYmpbcHJvcE5hbWVdIDogdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGxvYWRDb21wb25lbnRBbmROb3RpZnkoY29tcG9uZW50TmFtZSwgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHN1YnNjcmliYWJsZSA9IGdldE9iamVjdE93blByb3BlcnR5KGxvYWRpbmdTdWJzY3JpYmFibGVzQ2FjaGUsIGNvbXBvbmVudE5hbWUpLFxuICAgICAgICAgICAgY29tcGxldGVkQXN5bmM7XG4gICAgICAgIGlmICghc3Vic2NyaWJhYmxlKSB7XG4gICAgICAgICAgICAvLyBJdCdzIG5vdCBzdGFydGVkIGxvYWRpbmcgeWV0LiBTdGFydCBsb2FkaW5nLCBhbmQgd2hlbiBpdCdzIGRvbmUsIG1vdmUgaXQgdG8gbG9hZGVkRGVmaW5pdGlvbnNDYWNoZS5cbiAgICAgICAgICAgIHN1YnNjcmliYWJsZSA9IGxvYWRpbmdTdWJzY3JpYmFibGVzQ2FjaGVbY29tcG9uZW50TmFtZV0gPSBuZXcga28uc3Vic2NyaWJhYmxlKCk7XG4gICAgICAgICAgICBzdWJzY3JpYmFibGUuc3Vic2NyaWJlKGNhbGxiYWNrKTtcblxuICAgICAgICAgICAgYmVnaW5Mb2FkaW5nQ29tcG9uZW50KGNvbXBvbmVudE5hbWUsIGZ1bmN0aW9uKGRlZmluaXRpb24sIGNvbmZpZykge1xuICAgICAgICAgICAgICAgIHZhciBpc1N5bmNocm9ub3VzQ29tcG9uZW50ID0gISEoY29uZmlnICYmIGNvbmZpZ1snc3luY2hyb25vdXMnXSk7XG4gICAgICAgICAgICAgICAgbG9hZGVkRGVmaW5pdGlvbnNDYWNoZVtjb21wb25lbnROYW1lXSA9IHsgZGVmaW5pdGlvbjogZGVmaW5pdGlvbiwgaXNTeW5jaHJvbm91c0NvbXBvbmVudDogaXNTeW5jaHJvbm91c0NvbXBvbmVudCB9O1xuICAgICAgICAgICAgICAgIGRlbGV0ZSBsb2FkaW5nU3Vic2NyaWJhYmxlc0NhY2hlW2NvbXBvbmVudE5hbWVdO1xuXG4gICAgICAgICAgICAgICAgLy8gRm9yIEFQSSBjb25zaXN0ZW5jeSwgYWxsIGxvYWRzIGNvbXBsZXRlIGFzeW5jaHJvbm91c2x5LiBIb3dldmVyIHdlIHdhbnQgdG8gYXZvaWRcbiAgICAgICAgICAgICAgICAvLyBhZGRpbmcgYW4gZXh0cmEgdGFzayBzY2hlZHVsZSBpZiBpdCdzIHVubmVjZXNzYXJ5IChpLmUuLCB0aGUgY29tcGxldGlvbiBpcyBhbHJlYWR5XG4gICAgICAgICAgICAgICAgLy8gYXN5bmMpLlxuICAgICAgICAgICAgICAgIC8vXG4gICAgICAgICAgICAgICAgLy8gWW91IGNhbiBieXBhc3MgdGhlICdhbHdheXMgYXN5bmNocm9ub3VzJyBmZWF0dXJlIGJ5IHB1dHRpbmcgdGhlIHN5bmNocm9ub3VzOnRydWVcbiAgICAgICAgICAgICAgICAvLyBmbGFnIG9uIHlvdXIgY29tcG9uZW50IGNvbmZpZ3VyYXRpb24gd2hlbiB5b3UgcmVnaXN0ZXIgaXQuXG4gICAgICAgICAgICAgICAgaWYgKGNvbXBsZXRlZEFzeW5jIHx8IGlzU3luY2hyb25vdXNDb21wb25lbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gTm90ZSB0aGF0IG5vdGlmeVN1YnNjcmliZXJzIGlnbm9yZXMgYW55IGRlcGVuZGVuY2llcyByZWFkIHdpdGhpbiB0aGUgY2FsbGJhY2suXG4gICAgICAgICAgICAgICAgICAgIC8vIFNlZSBjb21tZW50IGluIGxvYWRlclJlZ2lzdHJ5QmVoYXZpb3JzLmpzIGZvciByZWFzb25pbmdcbiAgICAgICAgICAgICAgICAgICAgc3Vic2NyaWJhYmxlWydub3RpZnlTdWJzY3JpYmVycyddKGRlZmluaXRpb24pO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGtvLnRhc2tzLnNjaGVkdWxlKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgc3Vic2NyaWJhYmxlWydub3RpZnlTdWJzY3JpYmVycyddKGRlZmluaXRpb24pO1xuICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbXBsZXRlZEFzeW5jID0gdHJ1ZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHN1YnNjcmliYWJsZS5zdWJzY3JpYmUoY2FsbGJhY2spO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gYmVnaW5Mb2FkaW5nQ29tcG9uZW50KGNvbXBvbmVudE5hbWUsIGNhbGxiYWNrKSB7XG4gICAgICAgIGdldEZpcnN0UmVzdWx0RnJvbUxvYWRlcnMoJ2dldENvbmZpZycsIFtjb21wb25lbnROYW1lXSwgZnVuY3Rpb24oY29uZmlnKSB7XG4gICAgICAgICAgICBpZiAoY29uZmlnKSB7XG4gICAgICAgICAgICAgICAgLy8gV2UgaGF2ZSBhIGNvbmZpZywgc28gbm93IGxvYWQgaXRzIGRlZmluaXRpb25cbiAgICAgICAgICAgICAgICBnZXRGaXJzdFJlc3VsdEZyb21Mb2FkZXJzKCdsb2FkQ29tcG9uZW50JywgW2NvbXBvbmVudE5hbWUsIGNvbmZpZ10sIGZ1bmN0aW9uKGRlZmluaXRpb24pIHtcbiAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2soZGVmaW5pdGlvbiwgY29uZmlnKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIGNvbXBvbmVudCBoYXMgbm8gY29uZmlnIC0gaXQncyB1bmtub3duIHRvIGFsbCB0aGUgbG9hZGVycy5cbiAgICAgICAgICAgICAgICAvLyBOb3RlIHRoYXQgdGhpcyBpcyBub3QgYW4gZXJyb3IgKGUuZy4sIGEgbW9kdWxlIGxvYWRpbmcgZXJyb3IpIC0gdGhhdCB3b3VsZCBhYm9ydCB0aGVcbiAgICAgICAgICAgICAgICAvLyBwcm9jZXNzIGFuZCB0aGlzIGNhbGxiYWNrIHdvdWxkIG5vdCBydW4uIEZvciB0aGlzIGNhbGxiYWNrIHRvIHJ1biwgYWxsIGxvYWRlcnMgbXVzdFxuICAgICAgICAgICAgICAgIC8vIGhhdmUgY29uZmlybWVkIHRoZXkgZG9uJ3Qga25vdyBhYm91dCB0aGlzIGNvbXBvbmVudC5cbiAgICAgICAgICAgICAgICBjYWxsYmFjayhudWxsLCBudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gZ2V0Rmlyc3RSZXN1bHRGcm9tTG9hZGVycyhtZXRob2ROYW1lLCBhcmdzRXhjZXB0Q2FsbGJhY2ssIGNhbGxiYWNrLCBjYW5kaWRhdGVMb2FkZXJzKSB7XG4gICAgICAgIC8vIE9uIHRoZSBmaXJzdCBjYWxsIGluIHRoZSBzdGFjaywgc3RhcnQgd2l0aCB0aGUgZnVsbCBzZXQgb2YgbG9hZGVyc1xuICAgICAgICBpZiAoIWNhbmRpZGF0ZUxvYWRlcnMpIHtcbiAgICAgICAgICAgIGNhbmRpZGF0ZUxvYWRlcnMgPSBrby5jb21wb25lbnRzWydsb2FkZXJzJ10uc2xpY2UoMCk7IC8vIFVzZSBhIGNvcHksIGJlY2F1c2Ugd2UnbGwgYmUgbXV0YXRpbmcgdGhpcyBhcnJheVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gVHJ5IHRoZSBuZXh0IGNhbmRpZGF0ZVxuICAgICAgICB2YXIgY3VycmVudENhbmRpZGF0ZUxvYWRlciA9IGNhbmRpZGF0ZUxvYWRlcnMuc2hpZnQoKTtcbiAgICAgICAgaWYgKGN1cnJlbnRDYW5kaWRhdGVMb2FkZXIpIHtcbiAgICAgICAgICAgIHZhciBtZXRob2RJbnN0YW5jZSA9IGN1cnJlbnRDYW5kaWRhdGVMb2FkZXJbbWV0aG9kTmFtZV07XG4gICAgICAgICAgICBpZiAobWV0aG9kSW5zdGFuY2UpIHtcbiAgICAgICAgICAgICAgICB2YXIgd2FzQWJvcnRlZCA9IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgICBzeW5jaHJvbm91c1JldHVyblZhbHVlID0gbWV0aG9kSW5zdGFuY2UuYXBwbHkoY3VycmVudENhbmRpZGF0ZUxvYWRlciwgYXJnc0V4Y2VwdENhbGxiYWNrLmNvbmNhdChmdW5jdGlvbihyZXN1bHQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICh3YXNBYm9ydGVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2sobnVsbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2UgaWYgKHJlc3VsdCAhPT0gbnVsbCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIC8vIFRoaXMgY2FuZGlkYXRlIHJldHVybmVkIGEgdmFsdWUuIFVzZSBpdC5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFjayhyZXN1bHQpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvLyBUcnkgdGhlIG5leHQgY2FuZGlkYXRlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZ2V0Rmlyc3RSZXN1bHRGcm9tTG9hZGVycyhtZXRob2ROYW1lLCBhcmdzRXhjZXB0Q2FsbGJhY2ssIGNhbGxiYWNrLCBjYW5kaWRhdGVMb2FkZXJzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgfSkpO1xuXG4gICAgICAgICAgICAgICAgLy8gQ3VycmVudGx5LCBsb2FkZXJzIG1heSBub3QgcmV0dXJuIGFueXRoaW5nIHN5bmNocm9ub3VzbHkuIFRoaXMgbGVhdmVzIG9wZW4gdGhlIHBvc3NpYmlsaXR5XG4gICAgICAgICAgICAgICAgLy8gdGhhdCB3ZSdsbCBleHRlbmQgdGhlIEFQSSB0byBzdXBwb3J0IHN5bmNocm9ub3VzIHJldHVybiB2YWx1ZXMgaW4gdGhlIGZ1dHVyZS4gSXQgd29uJ3QgYmVcbiAgICAgICAgICAgICAgICAvLyBhIGJyZWFraW5nIGNoYW5nZSwgYmVjYXVzZSBjdXJyZW50bHkgbm8gbG9hZGVyIGlzIGFsbG93ZWQgdG8gcmV0dXJuIGFueXRoaW5nIGV4Y2VwdCB1bmRlZmluZWQuXG4gICAgICAgICAgICAgICAgaWYgKHN5bmNocm9ub3VzUmV0dXJuVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgICAgICB3YXNBYm9ydGVkID0gdHJ1ZTtcblxuICAgICAgICAgICAgICAgICAgICAvLyBNZXRob2QgdG8gc3VwcHJlc3MgZXhjZXB0aW9ucyB3aWxsIHJlbWFpbiB1bmRvY3VtZW50ZWQuIFRoaXMgaXMgb25seSB0byBrZWVwXG4gICAgICAgICAgICAgICAgICAgIC8vIEtPJ3Mgc3BlY3MgcnVubmluZyB0aWRpbHksIHNpbmNlIHdlIGNhbiBvYnNlcnZlIHRoZSBsb2FkaW5nIGdvdCBhYm9ydGVkIHdpdGhvdXRcbiAgICAgICAgICAgICAgICAgICAgLy8gaGF2aW5nIGV4Y2VwdGlvbnMgY2x1dHRlcmluZyB1cCB0aGUgY29uc29sZSB0b28uXG4gICAgICAgICAgICAgICAgICAgIGlmICghY3VycmVudENhbmRpZGF0ZUxvYWRlclsnc3VwcHJlc3NMb2FkZXJFeGNlcHRpb25zJ10pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ29tcG9uZW50IGxvYWRlcnMgbXVzdCBzdXBwbHkgdmFsdWVzIGJ5IGludm9raW5nIHRoZSBjYWxsYmFjaywgbm90IGJ5IHJldHVybmluZyB2YWx1ZXMgc3luY2hyb25vdXNseS4nKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gVGhpcyBjYW5kaWRhdGUgZG9lc24ndCBoYXZlIHRoZSByZWxldmFudCBoYW5kbGVyLiBTeW5jaHJvbm91c2x5IG1vdmUgb24gdG8gdGhlIG5leHQgb25lLlxuICAgICAgICAgICAgICAgIGdldEZpcnN0UmVzdWx0RnJvbUxvYWRlcnMobWV0aG9kTmFtZSwgYXJnc0V4Y2VwdENhbGxiYWNrLCBjYWxsYmFjaywgY2FuZGlkYXRlTG9hZGVycyk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBObyBjYW5kaWRhdGVzIHJldHVybmVkIGEgdmFsdWVcbiAgICAgICAgICAgIGNhbGxiYWNrKG51bGwpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gUmVmZXJlbmNlIHRoZSBsb2FkZXJzIHZpYSBzdHJpbmcgbmFtZSBzbyBpdCdzIHBvc3NpYmxlIGZvciBkZXZlbG9wZXJzXG4gICAgLy8gdG8gcmVwbGFjZSB0aGUgd2hvbGUgYXJyYXkgYnkgYXNzaWduaW5nIHRvIGtvLmNvbXBvbmVudHMubG9hZGVyc1xuICAgIGtvLmNvbXBvbmVudHNbJ2xvYWRlcnMnXSA9IFtdO1xuXG4gICAga28uZXhwb3J0U3ltYm9sKCdjb21wb25lbnRzJywga28uY29tcG9uZW50cyk7XG4gICAga28uZXhwb3J0U3ltYm9sKCdjb21wb25lbnRzLmdldCcsIGtvLmNvbXBvbmVudHMuZ2V0KTtcbiAgICBrby5leHBvcnRTeW1ib2woJ2NvbXBvbmVudHMuY2xlYXJDYWNoZWREZWZpbml0aW9uJywga28uY29tcG9uZW50cy5jbGVhckNhY2hlZERlZmluaXRpb24pO1xufSkoKTtcbihmdW5jdGlvbih1bmRlZmluZWQpIHtcblxuICAgIC8vIFRoZSBkZWZhdWx0IGxvYWRlciBpcyByZXNwb25zaWJsZSBmb3IgdHdvIHRoaW5nczpcbiAgICAvLyAxLiBNYWludGFpbmluZyB0aGUgZGVmYXVsdCBpbi1tZW1vcnkgcmVnaXN0cnkgb2YgY29tcG9uZW50IGNvbmZpZ3VyYXRpb24gb2JqZWN0c1xuICAgIC8vICAgIChpLmUuLCB0aGUgdGhpbmcgeW91J3JlIHdyaXRpbmcgdG8gd2hlbiB5b3UgY2FsbCBrby5jb21wb25lbnRzLnJlZ2lzdGVyKHNvbWVOYW1lLCAuLi4pKVxuICAgIC8vIDIuIEFuc3dlcmluZyByZXF1ZXN0cyBmb3IgY29tcG9uZW50cyBieSBmZXRjaGluZyBjb25maWd1cmF0aW9uIG9iamVjdHNcbiAgICAvLyAgICBmcm9tIHRoYXQgZGVmYXVsdCBpbi1tZW1vcnkgcmVnaXN0cnkgYW5kIHJlc29sdmluZyB0aGVtIGludG8gc3RhbmRhcmRcbiAgICAvLyAgICBjb21wb25lbnQgZGVmaW5pdGlvbiBvYmplY3RzIChvZiB0aGUgZm9ybSB7IGNyZWF0ZVZpZXdNb2RlbDogLi4uLCB0ZW1wbGF0ZTogLi4uIH0pXG4gICAgLy8gQ3VzdG9tIGxvYWRlcnMgbWF5IG92ZXJyaWRlIGVpdGhlciBvZiB0aGVzZSBmYWNpbGl0aWVzLCBpLmUuLFxuICAgIC8vIDEuIFRvIHN1cHBseSBjb25maWd1cmF0aW9uIG9iamVjdHMgZnJvbSBzb21lIG90aGVyIHNvdXJjZSAoZS5nLiwgY29udmVudGlvbnMpXG4gICAgLy8gMi4gT3IsIHRvIHJlc29sdmUgY29uZmlndXJhdGlvbiBvYmplY3RzIGJ5IGxvYWRpbmcgdmlld21vZGVscy90ZW1wbGF0ZXMgdmlhIGFyYml0cmFyeSBsb2dpYy5cblxuICAgIHZhciBkZWZhdWx0Q29uZmlnUmVnaXN0cnkgPSB7fTtcblxuICAgIGtvLmNvbXBvbmVudHMucmVnaXN0ZXIgPSBmdW5jdGlvbihjb21wb25lbnROYW1lLCBjb25maWcpIHtcbiAgICAgICAgaWYgKCFjb25maWcpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignSW52YWxpZCBjb25maWd1cmF0aW9uIGZvciAnICsgY29tcG9uZW50TmFtZSk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoa28uY29tcG9uZW50cy5pc1JlZ2lzdGVyZWQoY29tcG9uZW50TmFtZSkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQ29tcG9uZW50ICcgKyBjb21wb25lbnROYW1lICsgJyBpcyBhbHJlYWR5IHJlZ2lzdGVyZWQnKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGRlZmF1bHRDb25maWdSZWdpc3RyeVtjb21wb25lbnROYW1lXSA9IGNvbmZpZztcbiAgICB9O1xuXG4gICAga28uY29tcG9uZW50cy5pc1JlZ2lzdGVyZWQgPSBmdW5jdGlvbihjb21wb25lbnROYW1lKSB7XG4gICAgICAgIHJldHVybiBkZWZhdWx0Q29uZmlnUmVnaXN0cnkuaGFzT3duUHJvcGVydHkoY29tcG9uZW50TmFtZSk7XG4gICAgfTtcblxuICAgIGtvLmNvbXBvbmVudHMudW5yZWdpc3RlciA9IGZ1bmN0aW9uKGNvbXBvbmVudE5hbWUpIHtcbiAgICAgICAgZGVsZXRlIGRlZmF1bHRDb25maWdSZWdpc3RyeVtjb21wb25lbnROYW1lXTtcbiAgICAgICAga28uY29tcG9uZW50cy5jbGVhckNhY2hlZERlZmluaXRpb24oY29tcG9uZW50TmFtZSk7XG4gICAgfTtcblxuICAgIGtvLmNvbXBvbmVudHMuZGVmYXVsdExvYWRlciA9IHtcbiAgICAgICAgJ2dldENvbmZpZyc6IGZ1bmN0aW9uKGNvbXBvbmVudE5hbWUsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICB2YXIgcmVzdWx0ID0gZGVmYXVsdENvbmZpZ1JlZ2lzdHJ5Lmhhc093blByb3BlcnR5KGNvbXBvbmVudE5hbWUpXG4gICAgICAgICAgICAgICAgPyBkZWZhdWx0Q29uZmlnUmVnaXN0cnlbY29tcG9uZW50TmFtZV1cbiAgICAgICAgICAgICAgICA6IG51bGw7XG4gICAgICAgICAgICBjYWxsYmFjayhyZXN1bHQpO1xuICAgICAgICB9LFxuXG4gICAgICAgICdsb2FkQ29tcG9uZW50JzogZnVuY3Rpb24oY29tcG9uZW50TmFtZSwgY29uZmlnLCBjYWxsYmFjaykge1xuICAgICAgICAgICAgdmFyIGVycm9yQ2FsbGJhY2sgPSBtYWtlRXJyb3JDYWxsYmFjayhjb21wb25lbnROYW1lKTtcbiAgICAgICAgICAgIHBvc3NpYmx5R2V0Q29uZmlnRnJvbUFtZChlcnJvckNhbGxiYWNrLCBjb25maWcsIGZ1bmN0aW9uKGxvYWRlZENvbmZpZykge1xuICAgICAgICAgICAgICAgIHJlc29sdmVDb25maWcoY29tcG9uZW50TmFtZSwgZXJyb3JDYWxsYmFjaywgbG9hZGVkQ29uZmlnLCBjYWxsYmFjayk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcblxuICAgICAgICAnbG9hZFRlbXBsYXRlJzogZnVuY3Rpb24oY29tcG9uZW50TmFtZSwgdGVtcGxhdGVDb25maWcsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICByZXNvbHZlVGVtcGxhdGUobWFrZUVycm9yQ2FsbGJhY2soY29tcG9uZW50TmFtZSksIHRlbXBsYXRlQ29uZmlnLCBjYWxsYmFjayk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgJ2xvYWRWaWV3TW9kZWwnOiBmdW5jdGlvbihjb21wb25lbnROYW1lLCB2aWV3TW9kZWxDb25maWcsIGNhbGxiYWNrKSB7XG4gICAgICAgICAgICByZXNvbHZlVmlld01vZGVsKG1ha2VFcnJvckNhbGxiYWNrKGNvbXBvbmVudE5hbWUpLCB2aWV3TW9kZWxDb25maWcsIGNhbGxiYWNrKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICB2YXIgY3JlYXRlVmlld01vZGVsS2V5ID0gJ2NyZWF0ZVZpZXdNb2RlbCc7XG5cbiAgICAvLyBUYWtlcyBhIGNvbmZpZyBvYmplY3Qgb2YgdGhlIGZvcm0geyB0ZW1wbGF0ZTogLi4uLCB2aWV3TW9kZWw6IC4uLiB9LCBhbmQgYXN5bmNocm9ub3VzbHkgY29udmVydCBpdFxuICAgIC8vIGludG8gdGhlIHN0YW5kYXJkIGNvbXBvbmVudCBkZWZpbml0aW9uIGZvcm1hdDpcbiAgICAvLyAgICB7IHRlbXBsYXRlOiA8QXJyYXlPZkRvbU5vZGVzPiwgY3JlYXRlVmlld01vZGVsOiBmdW5jdGlvbihwYXJhbXMsIGNvbXBvbmVudEluZm8pIHsgLi4uIH0gfS5cbiAgICAvLyBTaW5jZSBib3RoIHRlbXBsYXRlIGFuZCB2aWV3TW9kZWwgbWF5IG5lZWQgdG8gYmUgcmVzb2x2ZWQgYXN5bmNocm9ub3VzbHksIGJvdGggdGFza3MgYXJlIHBlcmZvcm1lZFxuICAgIC8vIGluIHBhcmFsbGVsLCBhbmQgdGhlIHJlc3VsdHMgam9pbmVkIHdoZW4gYm90aCBhcmUgcmVhZHkuIFdlIGRvbid0IGRlcGVuZCBvbiBhbnkgcHJvbWlzZXMgaW5mcmFzdHJ1Y3R1cmUsXG4gICAgLy8gc28gdGhpcyBpcyBpbXBsZW1lbnRlZCBtYW51YWxseSBiZWxvdy5cbiAgICBmdW5jdGlvbiByZXNvbHZlQ29uZmlnKGNvbXBvbmVudE5hbWUsIGVycm9yQ2FsbGJhY2ssIGNvbmZpZywgY2FsbGJhY2spIHtcbiAgICAgICAgdmFyIHJlc3VsdCA9IHt9LFxuICAgICAgICAgICAgbWFrZUNhbGxCYWNrV2hlblplcm8gPSAyLFxuICAgICAgICAgICAgdHJ5SXNzdWVDYWxsYmFjayA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGlmICgtLW1ha2VDYWxsQmFja1doZW5aZXJvID09PSAwKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKHJlc3VsdCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHRlbXBsYXRlQ29uZmlnID0gY29uZmlnWyd0ZW1wbGF0ZSddLFxuICAgICAgICAgICAgdmlld01vZGVsQ29uZmlnID0gY29uZmlnWyd2aWV3TW9kZWwnXTtcblxuICAgICAgICBpZiAodGVtcGxhdGVDb25maWcpIHtcbiAgICAgICAgICAgIHBvc3NpYmx5R2V0Q29uZmlnRnJvbUFtZChlcnJvckNhbGxiYWNrLCB0ZW1wbGF0ZUNvbmZpZywgZnVuY3Rpb24obG9hZGVkQ29uZmlnKSB7XG4gICAgICAgICAgICAgICAga28uY29tcG9uZW50cy5fZ2V0Rmlyc3RSZXN1bHRGcm9tTG9hZGVycygnbG9hZFRlbXBsYXRlJywgW2NvbXBvbmVudE5hbWUsIGxvYWRlZENvbmZpZ10sIGZ1bmN0aW9uKHJlc29sdmVkVGVtcGxhdGUpIHtcbiAgICAgICAgICAgICAgICAgICAgcmVzdWx0Wyd0ZW1wbGF0ZSddID0gcmVzb2x2ZWRUZW1wbGF0ZTtcbiAgICAgICAgICAgICAgICAgICAgdHJ5SXNzdWVDYWxsYmFjaygpO1xuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0cnlJc3N1ZUNhbGxiYWNrKCk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodmlld01vZGVsQ29uZmlnKSB7XG4gICAgICAgICAgICBwb3NzaWJseUdldENvbmZpZ0Zyb21BbWQoZXJyb3JDYWxsYmFjaywgdmlld01vZGVsQ29uZmlnLCBmdW5jdGlvbihsb2FkZWRDb25maWcpIHtcbiAgICAgICAgICAgICAgICBrby5jb21wb25lbnRzLl9nZXRGaXJzdFJlc3VsdEZyb21Mb2FkZXJzKCdsb2FkVmlld01vZGVsJywgW2NvbXBvbmVudE5hbWUsIGxvYWRlZENvbmZpZ10sIGZ1bmN0aW9uKHJlc29sdmVkVmlld01vZGVsKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlc3VsdFtjcmVhdGVWaWV3TW9kZWxLZXldID0gcmVzb2x2ZWRWaWV3TW9kZWw7XG4gICAgICAgICAgICAgICAgICAgIHRyeUlzc3VlQ2FsbGJhY2soKTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdHJ5SXNzdWVDYWxsYmFjaygpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gcmVzb2x2ZVRlbXBsYXRlKGVycm9yQ2FsbGJhY2ssIHRlbXBsYXRlQ29uZmlnLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIHRlbXBsYXRlQ29uZmlnID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgLy8gTWFya3VwIC0gcGFyc2UgaXRcbiAgICAgICAgICAgIGNhbGxiYWNrKGtvLnV0aWxzLnBhcnNlSHRtbEZyYWdtZW50KHRlbXBsYXRlQ29uZmlnKSk7XG4gICAgICAgIH0gZWxzZSBpZiAodGVtcGxhdGVDb25maWcgaW5zdGFuY2VvZiBBcnJheSkge1xuICAgICAgICAgICAgLy8gQXNzdW1lIGFscmVhZHkgYW4gYXJyYXkgb2YgRE9NIG5vZGVzIC0gcGFzcyB0aHJvdWdoIHVuY2hhbmdlZFxuICAgICAgICAgICAgY2FsbGJhY2sodGVtcGxhdGVDb25maWcpO1xuICAgICAgICB9IGVsc2UgaWYgKGlzRG9jdW1lbnRGcmFnbWVudCh0ZW1wbGF0ZUNvbmZpZykpIHtcbiAgICAgICAgICAgIC8vIERvY3VtZW50IGZyYWdtZW50IC0gdXNlIGl0cyBjaGlsZCBub2Rlc1xuICAgICAgICAgICAgY2FsbGJhY2soa28udXRpbHMubWFrZUFycmF5KHRlbXBsYXRlQ29uZmlnLmNoaWxkTm9kZXMpKTtcbiAgICAgICAgfSBlbHNlIGlmICh0ZW1wbGF0ZUNvbmZpZ1snZWxlbWVudCddKSB7XG4gICAgICAgICAgICB2YXIgZWxlbWVudCA9IHRlbXBsYXRlQ29uZmlnWydlbGVtZW50J107XG4gICAgICAgICAgICBpZiAoaXNEb21FbGVtZW50KGVsZW1lbnQpKSB7XG4gICAgICAgICAgICAgICAgLy8gRWxlbWVudCBpbnN0YW5jZSAtIGNvcHkgaXRzIGNoaWxkIG5vZGVzXG4gICAgICAgICAgICAgICAgY2FsbGJhY2soY2xvbmVOb2Rlc0Zyb21UZW1wbGF0ZVNvdXJjZUVsZW1lbnQoZWxlbWVudCkpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZWxlbWVudCA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgICAgICAvLyBFbGVtZW50IElEIC0gZmluZCBpdCwgdGhlbiBjb3B5IGl0cyBjaGlsZCBub2Rlc1xuICAgICAgICAgICAgICAgIHZhciBlbGVtSW5zdGFuY2UgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChlbGVtZW50KTtcbiAgICAgICAgICAgICAgICBpZiAoZWxlbUluc3RhbmNlKSB7XG4gICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKGNsb25lTm9kZXNGcm9tVGVtcGxhdGVTb3VyY2VFbGVtZW50KGVsZW1JbnN0YW5jZSkpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgIGVycm9yQ2FsbGJhY2soJ0Nhbm5vdCBmaW5kIGVsZW1lbnQgd2l0aCBJRCAnICsgZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlcnJvckNhbGxiYWNrKCdVbmtub3duIGVsZW1lbnQgdHlwZTogJyArIGVsZW1lbnQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyb3JDYWxsYmFjaygnVW5rbm93biB0ZW1wbGF0ZSB2YWx1ZTogJyArIHRlbXBsYXRlQ29uZmlnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIHJlc29sdmVWaWV3TW9kZWwoZXJyb3JDYWxsYmFjaywgdmlld01vZGVsQ29uZmlnLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIHZpZXdNb2RlbENvbmZpZyA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgLy8gQ29uc3RydWN0b3IgLSBjb252ZXJ0IHRvIHN0YW5kYXJkIGZhY3RvcnkgZnVuY3Rpb24gZm9ybWF0XG4gICAgICAgICAgICAvLyBCeSBkZXNpZ24sIHRoaXMgZG9lcyAqbm90KiBzdXBwbHkgY29tcG9uZW50SW5mbyB0byB0aGUgY29uc3RydWN0b3IsIGFzIHRoZSBpbnRlbnQgaXMgdGhhdFxuICAgICAgICAgICAgLy8gY29tcG9uZW50SW5mbyBjb250YWlucyBub24tdmlld21vZGVsIGRhdGEgKGUuZy4sIHRoZSBjb21wb25lbnQncyBlbGVtZW50KSB0aGF0IHNob3VsZCBvbmx5XG4gICAgICAgICAgICAvLyBiZSB1c2VkIGluIGZhY3RvcnkgZnVuY3Rpb25zLCBub3Qgdmlld21vZGVsIGNvbnN0cnVjdG9ycy5cbiAgICAgICAgICAgIGNhbGxiYWNrKGZ1bmN0aW9uIChwYXJhbXMgLyosIGNvbXBvbmVudEluZm8gKi8pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gbmV3IHZpZXdNb2RlbENvbmZpZyhwYXJhbXMpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIHZpZXdNb2RlbENvbmZpZ1tjcmVhdGVWaWV3TW9kZWxLZXldID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgICAgICAvLyBBbHJlYWR5IGEgZmFjdG9yeSBmdW5jdGlvbiAtIHVzZSBpdCBhcy1pc1xuICAgICAgICAgICAgY2FsbGJhY2sodmlld01vZGVsQ29uZmlnW2NyZWF0ZVZpZXdNb2RlbEtleV0pO1xuICAgICAgICB9IGVsc2UgaWYgKCdpbnN0YW5jZScgaW4gdmlld01vZGVsQ29uZmlnKSB7XG4gICAgICAgICAgICAvLyBGaXhlZCBvYmplY3QgaW5zdGFuY2UgLSBwcm9tb3RlIHRvIGNyZWF0ZVZpZXdNb2RlbCBmb3JtYXQgZm9yIEFQSSBjb25zaXN0ZW5jeVxuICAgICAgICAgICAgdmFyIGZpeGVkSW5zdGFuY2UgPSB2aWV3TW9kZWxDb25maWdbJ2luc3RhbmNlJ107XG4gICAgICAgICAgICBjYWxsYmFjayhmdW5jdGlvbiAocGFyYW1zLCBjb21wb25lbnRJbmZvKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpeGVkSW5zdGFuY2U7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSBlbHNlIGlmICgndmlld01vZGVsJyBpbiB2aWV3TW9kZWxDb25maWcpIHtcbiAgICAgICAgICAgIC8vIFJlc29sdmVkIEFNRCBtb2R1bGUgd2hvc2UgdmFsdWUgaXMgb2YgdGhlIGZvcm0geyB2aWV3TW9kZWw6IC4uLiB9XG4gICAgICAgICAgICByZXNvbHZlVmlld01vZGVsKGVycm9yQ2FsbGJhY2ssIHZpZXdNb2RlbENvbmZpZ1sndmlld01vZGVsJ10sIGNhbGxiYWNrKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGVycm9yQ2FsbGJhY2soJ1Vua25vd24gdmlld01vZGVsIHZhbHVlOiAnICsgdmlld01vZGVsQ29uZmlnKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGNsb25lTm9kZXNGcm9tVGVtcGxhdGVTb3VyY2VFbGVtZW50KGVsZW1JbnN0YW5jZSkge1xuICAgICAgICBzd2l0Y2ggKGtvLnV0aWxzLnRhZ05hbWVMb3dlcihlbGVtSW5zdGFuY2UpKSB7XG4gICAgICAgICAgICBjYXNlICdzY3JpcHQnOlxuICAgICAgICAgICAgICAgIHJldHVybiBrby51dGlscy5wYXJzZUh0bWxGcmFnbWVudChlbGVtSW5zdGFuY2UudGV4dCk7XG4gICAgICAgICAgICBjYXNlICd0ZXh0YXJlYSc6XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtvLnV0aWxzLnBhcnNlSHRtbEZyYWdtZW50KGVsZW1JbnN0YW5jZS52YWx1ZSk7XG4gICAgICAgICAgICBjYXNlICd0ZW1wbGF0ZSc6XG4gICAgICAgICAgICAgICAgLy8gRm9yIGJyb3dzZXJzIHdpdGggcHJvcGVyIDx0ZW1wbGF0ZT4gZWxlbWVudCBzdXBwb3J0IChpLmUuLCB3aGVyZSB0aGUgLmNvbnRlbnQgcHJvcGVydHlcbiAgICAgICAgICAgICAgICAvLyBnaXZlcyBhIGRvY3VtZW50IGZyYWdtZW50KSwgdXNlIHRoYXQgZG9jdW1lbnQgZnJhZ21lbnQuXG4gICAgICAgICAgICAgICAgaWYgKGlzRG9jdW1lbnRGcmFnbWVudChlbGVtSW5zdGFuY2UuY29udGVudCkpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIGtvLnV0aWxzLmNsb25lTm9kZXMoZWxlbUluc3RhbmNlLmNvbnRlbnQuY2hpbGROb2Rlcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gUmVndWxhciBlbGVtZW50cyBzdWNoIGFzIDxkaXY+LCBhbmQgPHRlbXBsYXRlPiBlbGVtZW50cyBvbiBvbGQgYnJvd3NlcnMgdGhhdCBkb24ndCByZWFsbHlcbiAgICAgICAgLy8gdW5kZXJzdGFuZCA8dGVtcGxhdGU+IGFuZCBqdXN0IHRyZWF0IGl0IGFzIGEgcmVndWxhciBjb250YWluZXJcbiAgICAgICAgcmV0dXJuIGtvLnV0aWxzLmNsb25lTm9kZXMoZWxlbUluc3RhbmNlLmNoaWxkTm9kZXMpO1xuICAgIH1cblxuICAgIGZ1bmN0aW9uIGlzRG9tRWxlbWVudChvYmopIHtcbiAgICAgICAgaWYgKHdpbmRvd1snSFRNTEVsZW1lbnQnXSkge1xuICAgICAgICAgICAgcmV0dXJuIG9iaiBpbnN0YW5jZW9mIEhUTUxFbGVtZW50O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcmV0dXJuIG9iaiAmJiBvYmoudGFnTmFtZSAmJiBvYmoubm9kZVR5cGUgPT09IDE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBpc0RvY3VtZW50RnJhZ21lbnQob2JqKSB7XG4gICAgICAgIGlmICh3aW5kb3dbJ0RvY3VtZW50RnJhZ21lbnQnXSkge1xuICAgICAgICAgICAgcmV0dXJuIG9iaiBpbnN0YW5jZW9mIERvY3VtZW50RnJhZ21lbnQ7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICByZXR1cm4gb2JqICYmIG9iai5ub2RlVHlwZSA9PT0gMTE7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBwb3NzaWJseUdldENvbmZpZ0Zyb21BbWQoZXJyb3JDYWxsYmFjaywgY29uZmlnLCBjYWxsYmFjaykge1xuICAgICAgICBpZiAodHlwZW9mIGNvbmZpZ1sncmVxdWlyZSddID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgLy8gVGhlIGNvbmZpZyBpcyB0aGUgdmFsdWUgb2YgYW4gQU1EIG1vZHVsZVxuICAgICAgICAgICAgaWYgKGFtZFJlcXVpcmUgfHwgd2luZG93WydyZXF1aXJlJ10pIHtcbiAgICAgICAgICAgICAgICAoYW1kUmVxdWlyZSB8fCB3aW5kb3dbJ3JlcXVpcmUnXSkoW2NvbmZpZ1sncmVxdWlyZSddXSwgY2FsbGJhY2spO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBlcnJvckNhbGxiYWNrKCdVc2VzIHJlcXVpcmUsIGJ1dCBubyBBTUQgbG9hZGVyIGlzIHByZXNlbnQnKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNhbGxiYWNrKGNvbmZpZyk7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBtYWtlRXJyb3JDYWxsYmFjayhjb21wb25lbnROYW1lKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbiAobWVzc2FnZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb21wb25lbnQgXFwnJyArIGNvbXBvbmVudE5hbWUgKyAnXFwnOiAnICsgbWVzc2FnZSk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAga28uZXhwb3J0U3ltYm9sKCdjb21wb25lbnRzLnJlZ2lzdGVyJywga28uY29tcG9uZW50cy5yZWdpc3Rlcik7XG4gICAga28uZXhwb3J0U3ltYm9sKCdjb21wb25lbnRzLmlzUmVnaXN0ZXJlZCcsIGtvLmNvbXBvbmVudHMuaXNSZWdpc3RlcmVkKTtcbiAgICBrby5leHBvcnRTeW1ib2woJ2NvbXBvbmVudHMudW5yZWdpc3RlcicsIGtvLmNvbXBvbmVudHMudW5yZWdpc3Rlcik7XG5cbiAgICAvLyBFeHBvc2UgdGhlIGRlZmF1bHQgbG9hZGVyIHNvIHRoYXQgZGV2ZWxvcGVycyBjYW4gZGlyZWN0bHkgYXNrIGl0IGZvciBjb25maWd1cmF0aW9uXG4gICAgLy8gb3IgdG8gcmVzb2x2ZSBjb25maWd1cmF0aW9uXG4gICAga28uZXhwb3J0U3ltYm9sKCdjb21wb25lbnRzLmRlZmF1bHRMb2FkZXInLCBrby5jb21wb25lbnRzLmRlZmF1bHRMb2FkZXIpO1xuXG4gICAgLy8gQnkgZGVmYXVsdCwgdGhlIGRlZmF1bHQgbG9hZGVyIGlzIHRoZSBvbmx5IHJlZ2lzdGVyZWQgY29tcG9uZW50IGxvYWRlclxuICAgIGtvLmNvbXBvbmVudHNbJ2xvYWRlcnMnXS5wdXNoKGtvLmNvbXBvbmVudHMuZGVmYXVsdExvYWRlcik7XG5cbiAgICAvLyBQcml2YXRlbHkgZXhwb3NlIHRoZSB1bmRlcmx5aW5nIGNvbmZpZyByZWdpc3RyeSBmb3IgdXNlIGluIG9sZC1JRSBzaGltXG4gICAga28uY29tcG9uZW50cy5fYWxsUmVnaXN0ZXJlZENvbXBvbmVudHMgPSBkZWZhdWx0Q29uZmlnUmVnaXN0cnk7XG59KSgpO1xuKGZ1bmN0aW9uICh1bmRlZmluZWQpIHtcbiAgICAvLyBPdmVycmlkYWJsZSBBUEkgZm9yIGRldGVybWluaW5nIHdoaWNoIGNvbXBvbmVudCBuYW1lIGFwcGxpZXMgdG8gYSBnaXZlbiBub2RlLiBCeSBvdmVycmlkaW5nIHRoaXMsXG4gICAgLy8geW91IGNhbiBmb3IgZXhhbXBsZSBtYXAgc3BlY2lmaWMgdGFnTmFtZXMgdG8gY29tcG9uZW50cyB0aGF0IGFyZSBub3QgcHJlcmVnaXN0ZXJlZC5cbiAgICBrby5jb21wb25lbnRzWydnZXRDb21wb25lbnROYW1lRm9yTm9kZSddID0gZnVuY3Rpb24obm9kZSkge1xuICAgICAgICB2YXIgdGFnTmFtZUxvd2VyID0ga28udXRpbHMudGFnTmFtZUxvd2VyKG5vZGUpO1xuICAgICAgICBpZiAoa28uY29tcG9uZW50cy5pc1JlZ2lzdGVyZWQodGFnTmFtZUxvd2VyKSkge1xuICAgICAgICAgICAgLy8gVHJ5IHRvIGRldGVybWluZSB0aGF0IHRoaXMgbm9kZSBjYW4gYmUgY29uc2lkZXJlZCBhICpjdXN0b20qIGVsZW1lbnQ7IHNlZSBodHRwczovL2dpdGh1Yi5jb20va25vY2tvdXQva25vY2tvdXQvaXNzdWVzLzE2MDNcbiAgICAgICAgICAgIGlmICh0YWdOYW1lTG93ZXIuaW5kZXhPZignLScpICE9IC0xIHx8ICgnJyArIG5vZGUpID09IFwiW29iamVjdCBIVE1MVW5rbm93bkVsZW1lbnRdXCIgfHwgKGtvLnV0aWxzLmllVmVyc2lvbiA8PSA4ICYmIG5vZGUudGFnTmFtZSA9PT0gdGFnTmFtZUxvd2VyKSkge1xuICAgICAgICAgICAgICAgIHJldHVybiB0YWdOYW1lTG93ZXI7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAga28uY29tcG9uZW50cy5hZGRCaW5kaW5nc0ZvckN1c3RvbUVsZW1lbnQgPSBmdW5jdGlvbihhbGxCaW5kaW5ncywgbm9kZSwgYmluZGluZ0NvbnRleHQsIHZhbHVlQWNjZXNzb3JzKSB7XG4gICAgICAgIC8vIERldGVybWluZSBpZiBpdCdzIHJlYWxseSBhIGN1c3RvbSBlbGVtZW50IG1hdGNoaW5nIGEgY29tcG9uZW50XG4gICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSAxKSB7XG4gICAgICAgICAgICB2YXIgY29tcG9uZW50TmFtZSA9IGtvLmNvbXBvbmVudHNbJ2dldENvbXBvbmVudE5hbWVGb3JOb2RlJ10obm9kZSk7XG4gICAgICAgICAgICBpZiAoY29tcG9uZW50TmFtZSkge1xuICAgICAgICAgICAgICAgIC8vIEl0IGRvZXMgcmVwcmVzZW50IGEgY29tcG9uZW50LCBzbyBhZGQgYSBjb21wb25lbnQgYmluZGluZyBmb3IgaXRcbiAgICAgICAgICAgICAgICBhbGxCaW5kaW5ncyA9IGFsbEJpbmRpbmdzIHx8IHt9O1xuXG4gICAgICAgICAgICAgICAgaWYgKGFsbEJpbmRpbmdzWydjb21wb25lbnQnXSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBBdm9pZCBzaWxlbnRseSBvdmVyd3JpdGluZyBzb21lIG90aGVyICdjb21wb25lbnQnIGJpbmRpbmcgdGhhdCBtYXkgYWxyZWFkeSBiZSBvbiB0aGUgZWxlbWVudFxuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ0Nhbm5vdCB1c2UgdGhlIFwiY29tcG9uZW50XCIgYmluZGluZyBvbiBhIGN1c3RvbSBlbGVtZW50IG1hdGNoaW5nIGEgY29tcG9uZW50Jyk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgdmFyIGNvbXBvbmVudEJpbmRpbmdWYWx1ZSA9IHsgJ25hbWUnOiBjb21wb25lbnROYW1lLCAncGFyYW1zJzogZ2V0Q29tcG9uZW50UGFyYW1zRnJvbUN1c3RvbUVsZW1lbnQobm9kZSwgYmluZGluZ0NvbnRleHQpIH07XG5cbiAgICAgICAgICAgICAgICBhbGxCaW5kaW5nc1snY29tcG9uZW50J10gPSB2YWx1ZUFjY2Vzc29yc1xuICAgICAgICAgICAgICAgICAgICA/IGZ1bmN0aW9uKCkgeyByZXR1cm4gY29tcG9uZW50QmluZGluZ1ZhbHVlOyB9XG4gICAgICAgICAgICAgICAgICAgIDogY29tcG9uZW50QmluZGluZ1ZhbHVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIGFsbEJpbmRpbmdzO1xuICAgIH1cblxuICAgIHZhciBuYXRpdmVCaW5kaW5nUHJvdmlkZXJJbnN0YW5jZSA9IG5ldyBrby5iaW5kaW5nUHJvdmlkZXIoKTtcblxuICAgIGZ1bmN0aW9uIGdldENvbXBvbmVudFBhcmFtc0Zyb21DdXN0b21FbGVtZW50KGVsZW0sIGJpbmRpbmdDb250ZXh0KSB7XG4gICAgICAgIHZhciBwYXJhbXNBdHRyaWJ1dGUgPSBlbGVtLmdldEF0dHJpYnV0ZSgncGFyYW1zJyk7XG5cbiAgICAgICAgaWYgKHBhcmFtc0F0dHJpYnV0ZSkge1xuICAgICAgICAgICAgdmFyIHBhcmFtcyA9IG5hdGl2ZUJpbmRpbmdQcm92aWRlckluc3RhbmNlWydwYXJzZUJpbmRpbmdzU3RyaW5nJ10ocGFyYW1zQXR0cmlidXRlLCBiaW5kaW5nQ29udGV4dCwgZWxlbSwgeyAndmFsdWVBY2Nlc3NvcnMnOiB0cnVlLCAnYmluZGluZ1BhcmFtcyc6IHRydWUgfSksXG4gICAgICAgICAgICAgICAgcmF3UGFyYW1Db21wdXRlZFZhbHVlcyA9IGtvLnV0aWxzLm9iamVjdE1hcChwYXJhbXMsIGZ1bmN0aW9uKHBhcmFtVmFsdWUsIHBhcmFtTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICByZXR1cm4ga28uY29tcHV0ZWQocGFyYW1WYWx1ZSwgbnVsbCwgeyBkaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQ6IGVsZW0gfSk7XG4gICAgICAgICAgICAgICAgfSksXG4gICAgICAgICAgICAgICAgcmVzdWx0ID0ga28udXRpbHMub2JqZWN0TWFwKHJhd1BhcmFtQ29tcHV0ZWRWYWx1ZXMsIGZ1bmN0aW9uKHBhcmFtVmFsdWVDb21wdXRlZCwgcGFyYW1OYW1lKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBwYXJhbVZhbHVlID0gcGFyYW1WYWx1ZUNvbXB1dGVkLnBlZWsoKTtcbiAgICAgICAgICAgICAgICAgICAgLy8gRG9lcyB0aGUgZXZhbHVhdGlvbiBvZiB0aGUgcGFyYW1ldGVyIHZhbHVlIHVud3JhcCBhbnkgb2JzZXJ2YWJsZXM/XG4gICAgICAgICAgICAgICAgICAgIGlmICghcGFyYW1WYWx1ZUNvbXB1dGVkLmlzQWN0aXZlKCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIE5vIGl0IGRvZXNuJ3QsIHNvIHRoZXJlJ3Mgbm8gbmVlZCBmb3IgYW55IGNvbXB1dGVkIHdyYXBwZXIuIEp1c3QgcGFzcyB0aHJvdWdoIHRoZSBzdXBwbGllZCB2YWx1ZSBkaXJlY3RseS5cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIEV4YW1wbGU6IFwic29tZVZhbDogZmlyc3ROYW1lLCBhZ2U6IDEyM1wiICh3aGV0aGVyIG9yIG5vdCBmaXJzdE5hbWUgaXMgYW4gb2JzZXJ2YWJsZS9jb21wdXRlZClcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBwYXJhbVZhbHVlO1xuICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gWWVzIGl0IGRvZXMuIFN1cHBseSBhIGNvbXB1dGVkIHByb3BlcnR5IHRoYXQgdW53cmFwcyBib3RoIHRoZSBvdXRlciAoYmluZGluZyBleHByZXNzaW9uKVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gbGV2ZWwgb2Ygb2JzZXJ2YWJpbGl0eSwgYW5kIGFueSBpbm5lciAocmVzdWx0aW5nIG1vZGVsIHZhbHVlKSBsZXZlbCBvZiBvYnNlcnZhYmlsaXR5LlxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGhpcyBtZWFucyB0aGUgY29tcG9uZW50IGRvZXNuJ3QgaGF2ZSB0byB3b3JyeSBhYm91dCBtdWx0aXBsZSB1bndyYXBwaW5nLiBJZiB0aGUgdmFsdWUgaXMgYVxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gd3JpdGFibGUgb2JzZXJ2YWJsZSwgdGhlIGNvbXB1dGVkIHdpbGwgYWxzbyBiZSB3cml0YWJsZSBhbmQgcGFzcyB0aGUgdmFsdWUgb24gdG8gdGhlIG9ic2VydmFibGUuXG4gICAgICAgICAgICAgICAgICAgICAgICByZXR1cm4ga28uY29tcHV0ZWQoe1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICdyZWFkJzogZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybiBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHBhcmFtVmFsdWVDb21wdXRlZCgpKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICd3cml0ZSc6IGtvLmlzV3JpdGVhYmxlT2JzZXJ2YWJsZShwYXJhbVZhbHVlKSAmJiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBwYXJhbVZhbHVlQ29tcHV0ZWQoKSh2YWx1ZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQ6IGVsZW1cbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIC8vIEdpdmUgYWNjZXNzIHRvIHRoZSByYXcgY29tcHV0ZWRzLCBhcyBsb25nIGFzIHRoYXQgd291bGRuJ3Qgb3ZlcndyaXRlIGFueSBjdXN0b20gcGFyYW0gYWxzbyBjYWxsZWQgJyRyYXcnXG4gICAgICAgICAgICAvLyBUaGlzIGlzIGluIGNhc2UgdGhlIGRldmVsb3BlciB3YW50cyB0byByZWFjdCB0byBvdXRlciAoYmluZGluZykgb2JzZXJ2YWJpbGl0eSBzZXBhcmF0ZWx5IGZyb20gaW5uZXJcbiAgICAgICAgICAgIC8vIChtb2RlbCB2YWx1ZSkgb2JzZXJ2YWJpbGl0eSwgb3IgaW4gY2FzZSB0aGUgbW9kZWwgdmFsdWUgb2JzZXJ2YWJsZSBoYXMgc3Vib2JzZXJ2YWJsZXMuXG4gICAgICAgICAgICBpZiAoIXJlc3VsdC5oYXNPd25Qcm9wZXJ0eSgnJHJhdycpKSB7XG4gICAgICAgICAgICAgICAgcmVzdWx0WyckcmF3J10gPSByYXdQYXJhbUNvbXB1dGVkVmFsdWVzO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0O1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gRm9yIGNvbnNpc3RlbmN5LCBhYnNlbmNlIG9mIGEgXCJwYXJhbXNcIiBhdHRyaWJ1dGUgaXMgdHJlYXRlZCB0aGUgc2FtZSBhcyB0aGUgcHJlc2VuY2Ugb2ZcbiAgICAgICAgICAgIC8vIGFueSBlbXB0eSBvbmUuIE90aGVyd2lzZSBjb21wb25lbnQgdmlld21vZGVscyBuZWVkIHNwZWNpYWwgY29kZSB0byBjaGVjayB3aGV0aGVyIG9yIG5vdFxuICAgICAgICAgICAgLy8gJ3BhcmFtcycgb3IgJ3BhcmFtcy4kcmF3JyBpcyBudWxsL3VuZGVmaW5lZCBiZWZvcmUgcmVhZGluZyBzdWJwcm9wZXJ0aWVzLCB3aGljaCBpcyBhbm5veWluZy5cbiAgICAgICAgICAgIHJldHVybiB7ICckcmF3Jzoge30gfTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy8gQ29tcGF0aWJpbGl0eSBjb2RlIGZvciBvbGRlciAocHJlLUhUTUw1KSBJRSBicm93c2Vyc1xuXG4gICAgaWYgKGtvLnV0aWxzLmllVmVyc2lvbiA8IDkpIHtcbiAgICAgICAgLy8gV2hlbmV2ZXIgeW91IHByZXJlZ2lzdGVyIGEgY29tcG9uZW50LCBlbmFibGUgaXQgYXMgYSBjdXN0b20gZWxlbWVudCBpbiB0aGUgY3VycmVudCBkb2N1bWVudFxuICAgICAgICBrby5jb21wb25lbnRzWydyZWdpc3RlciddID0gKGZ1bmN0aW9uKG9yaWdpbmFsRnVuY3Rpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihjb21wb25lbnROYW1lKSB7XG4gICAgICAgICAgICAgICAgZG9jdW1lbnQuY3JlYXRlRWxlbWVudChjb21wb25lbnROYW1lKTsgLy8gQWxsb3dzIElFPDkgdG8gcGFyc2UgbWFya3VwIGNvbnRhaW5pbmcgdGhlIGN1c3RvbSBlbGVtZW50XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9yaWdpbmFsRnVuY3Rpb24uYXBwbHkodGhpcywgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSkoa28uY29tcG9uZW50c1sncmVnaXN0ZXInXSk7XG5cbiAgICAgICAgLy8gV2hlbmV2ZXIgeW91IGNyZWF0ZSBhIGRvY3VtZW50IGZyYWdtZW50LCBlbmFibGUgYWxsIHByZXJlZ2lzdGVyZWQgY29tcG9uZW50IG5hbWVzIGFzIGN1c3RvbSBlbGVtZW50c1xuICAgICAgICAvLyBUaGlzIGlzIG5lZWRlZCB0byBtYWtlIGlubmVyU2hpdi9qUXVlcnkgSFRNTCBwYXJzaW5nIGNvcnJlY3RseSBoYW5kbGUgdGhlIGN1c3RvbSBlbGVtZW50c1xuICAgICAgICBkb2N1bWVudC5jcmVhdGVEb2N1bWVudEZyYWdtZW50ID0gKGZ1bmN0aW9uKG9yaWdpbmFsRnVuY3Rpb24pIHtcbiAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB2YXIgbmV3RG9jRnJhZyA9IG9yaWdpbmFsRnVuY3Rpb24oKSxcbiAgICAgICAgICAgICAgICAgICAgYWxsQ29tcG9uZW50cyA9IGtvLmNvbXBvbmVudHMuX2FsbFJlZ2lzdGVyZWRDb21wb25lbnRzO1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGNvbXBvbmVudE5hbWUgaW4gYWxsQ29tcG9uZW50cykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoYWxsQ29tcG9uZW50cy5oYXNPd25Qcm9wZXJ0eShjb21wb25lbnROYW1lKSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3RG9jRnJhZy5jcmVhdGVFbGVtZW50KGNvbXBvbmVudE5hbWUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIHJldHVybiBuZXdEb2NGcmFnO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfSkoZG9jdW1lbnQuY3JlYXRlRG9jdW1lbnRGcmFnbWVudCk7XG4gICAgfVxufSkoKTsoZnVuY3Rpb24odW5kZWZpbmVkKSB7XG5cbiAgICB2YXIgY29tcG9uZW50TG9hZGluZ09wZXJhdGlvblVuaXF1ZUlkID0gMDtcblxuICAgIGtvLmJpbmRpbmdIYW5kbGVyc1snY29tcG9uZW50J10gPSB7XG4gICAgICAgICdpbml0JzogZnVuY3Rpb24oZWxlbWVudCwgdmFsdWVBY2Nlc3NvciwgaWdub3JlZDEsIGlnbm9yZWQyLCBiaW5kaW5nQ29udGV4dCkge1xuICAgICAgICAgICAgdmFyIGN1cnJlbnRWaWV3TW9kZWwsXG4gICAgICAgICAgICAgICAgY3VycmVudExvYWRpbmdPcGVyYXRpb25JZCxcbiAgICAgICAgICAgICAgICBkaXNwb3NlQXNzb2NpYXRlZENvbXBvbmVudFZpZXdNb2RlbCA9IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGN1cnJlbnRWaWV3TW9kZWxEaXNwb3NlID0gY3VycmVudFZpZXdNb2RlbCAmJiBjdXJyZW50Vmlld01vZGVsWydkaXNwb3NlJ107XG4gICAgICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudFZpZXdNb2RlbERpc3Bvc2UgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGN1cnJlbnRWaWV3TW9kZWxEaXNwb3NlLmNhbGwoY3VycmVudFZpZXdNb2RlbCk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgY3VycmVudFZpZXdNb2RlbCA9IG51bGw7XG4gICAgICAgICAgICAgICAgICAgIC8vIEFueSBpbi1mbGlnaHQgbG9hZGluZyBvcGVyYXRpb24gaXMgbm8gbG9uZ2VyIHJlbGV2YW50LCBzbyBtYWtlIHN1cmUgd2UgaWdub3JlIGl0cyBjb21wbGV0aW9uXG4gICAgICAgICAgICAgICAgICAgIGN1cnJlbnRMb2FkaW5nT3BlcmF0aW9uSWQgPSBudWxsO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgb3JpZ2luYWxDaGlsZE5vZGVzID0ga28udXRpbHMubWFrZUFycmF5KGtvLnZpcnR1YWxFbGVtZW50cy5jaGlsZE5vZGVzKGVsZW1lbnQpKTtcblxuICAgICAgICAgICAga28udXRpbHMuZG9tTm9kZURpc3Bvc2FsLmFkZERpc3Bvc2VDYWxsYmFjayhlbGVtZW50LCBkaXNwb3NlQXNzb2NpYXRlZENvbXBvbmVudFZpZXdNb2RlbCk7XG5cbiAgICAgICAgICAgIGtvLmNvbXB1dGVkKGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgICAgICB2YXIgdmFsdWUgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHZhbHVlQWNjZXNzb3IoKSksXG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudE5hbWUsIGNvbXBvbmVudFBhcmFtcztcblxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICAgICAgICAgIGNvbXBvbmVudE5hbWUgPSB2YWx1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBjb21wb25lbnROYW1lID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZSh2YWx1ZVsnbmFtZSddKTtcbiAgICAgICAgICAgICAgICAgICAgY29tcG9uZW50UGFyYW1zID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZSh2YWx1ZVsncGFyYW1zJ10pO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIGlmICghY29tcG9uZW50TmFtZSkge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ05vIGNvbXBvbmVudCBuYW1lIHNwZWNpZmllZCcpO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIHZhciBsb2FkaW5nT3BlcmF0aW9uSWQgPSBjdXJyZW50TG9hZGluZ09wZXJhdGlvbklkID0gKytjb21wb25lbnRMb2FkaW5nT3BlcmF0aW9uVW5pcXVlSWQ7XG4gICAgICAgICAgICAgICAga28uY29tcG9uZW50cy5nZXQoY29tcG9uZW50TmFtZSwgZnVuY3Rpb24oY29tcG9uZW50RGVmaW5pdGlvbikge1xuICAgICAgICAgICAgICAgICAgICAvLyBJZiB0aGlzIGlzIG5vdCB0aGUgY3VycmVudCBsb2FkIG9wZXJhdGlvbiBmb3IgdGhpcyBlbGVtZW50LCBpZ25vcmUgaXQuXG4gICAgICAgICAgICAgICAgICAgIGlmIChjdXJyZW50TG9hZGluZ09wZXJhdGlvbklkICE9PSBsb2FkaW5nT3BlcmF0aW9uSWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIC8vIENsZWFuIHVwIHByZXZpb3VzIHN0YXRlXG4gICAgICAgICAgICAgICAgICAgIGRpc3Bvc2VBc3NvY2lhdGVkQ29tcG9uZW50Vmlld01vZGVsKCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gSW5zdGFudGlhdGUgYW5kIGJpbmQgbmV3IGNvbXBvbmVudC4gSW1wbGljaXRseSB0aGlzIGNsZWFucyBhbnkgb2xkIERPTSBub2Rlcy5cbiAgICAgICAgICAgICAgICAgICAgaWYgKCFjb21wb25lbnREZWZpbml0aW9uKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ1Vua25vd24gY29tcG9uZW50IFxcJycgKyBjb21wb25lbnROYW1lICsgJ1xcJycpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIGNsb25lVGVtcGxhdGVJbnRvRWxlbWVudChjb21wb25lbnROYW1lLCBjb21wb25lbnREZWZpbml0aW9uLCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGNvbXBvbmVudFZpZXdNb2RlbCA9IGNyZWF0ZVZpZXdNb2RlbChjb21wb25lbnREZWZpbml0aW9uLCBlbGVtZW50LCBvcmlnaW5hbENoaWxkTm9kZXMsIGNvbXBvbmVudFBhcmFtcyksXG4gICAgICAgICAgICAgICAgICAgICAgICBjaGlsZEJpbmRpbmdDb250ZXh0ID0gYmluZGluZ0NvbnRleHRbJ2NyZWF0ZUNoaWxkQ29udGV4dCddKGNvbXBvbmVudFZpZXdNb2RlbCwgLyogZGF0YUl0ZW1BbGlhcyAqLyB1bmRlZmluZWQsIGZ1bmN0aW9uKGN0eCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN0eFsnJGNvbXBvbmVudCddID0gY29tcG9uZW50Vmlld01vZGVsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGN0eFsnJGNvbXBvbmVudFRlbXBsYXRlTm9kZXMnXSA9IG9yaWdpbmFsQ2hpbGROb2RlcztcbiAgICAgICAgICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICAgICAgICBjdXJyZW50Vmlld01vZGVsID0gY29tcG9uZW50Vmlld01vZGVsO1xuICAgICAgICAgICAgICAgICAgICBrby5hcHBseUJpbmRpbmdzVG9EZXNjZW5kYW50cyhjaGlsZEJpbmRpbmdDb250ZXh0LCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH0sIG51bGwsIHsgZGlzcG9zZVdoZW5Ob2RlSXNSZW1vdmVkOiBlbGVtZW50IH0pO1xuXG4gICAgICAgICAgICByZXR1cm4geyAnY29udHJvbHNEZXNjZW5kYW50QmluZGluZ3MnOiB0cnVlIH07XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAga28udmlydHVhbEVsZW1lbnRzLmFsbG93ZWRCaW5kaW5nc1snY29tcG9uZW50J10gPSB0cnVlO1xuXG4gICAgZnVuY3Rpb24gY2xvbmVUZW1wbGF0ZUludG9FbGVtZW50KGNvbXBvbmVudE5hbWUsIGNvbXBvbmVudERlZmluaXRpb24sIGVsZW1lbnQpIHtcbiAgICAgICAgdmFyIHRlbXBsYXRlID0gY29tcG9uZW50RGVmaW5pdGlvblsndGVtcGxhdGUnXTtcbiAgICAgICAgaWYgKCF0ZW1wbGF0ZSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdDb21wb25lbnQgXFwnJyArIGNvbXBvbmVudE5hbWUgKyAnXFwnIGhhcyBubyB0ZW1wbGF0ZScpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGNsb25lZE5vZGVzQXJyYXkgPSBrby51dGlscy5jbG9uZU5vZGVzKHRlbXBsYXRlKTtcbiAgICAgICAga28udmlydHVhbEVsZW1lbnRzLnNldERvbU5vZGVDaGlsZHJlbihlbGVtZW50LCBjbG9uZWROb2Rlc0FycmF5KTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjcmVhdGVWaWV3TW9kZWwoY29tcG9uZW50RGVmaW5pdGlvbiwgZWxlbWVudCwgb3JpZ2luYWxDaGlsZE5vZGVzLCBjb21wb25lbnRQYXJhbXMpIHtcbiAgICAgICAgdmFyIGNvbXBvbmVudFZpZXdNb2RlbEZhY3RvcnkgPSBjb21wb25lbnREZWZpbml0aW9uWydjcmVhdGVWaWV3TW9kZWwnXTtcbiAgICAgICAgcmV0dXJuIGNvbXBvbmVudFZpZXdNb2RlbEZhY3RvcnlcbiAgICAgICAgICAgID8gY29tcG9uZW50Vmlld01vZGVsRmFjdG9yeS5jYWxsKGNvbXBvbmVudERlZmluaXRpb24sIGNvbXBvbmVudFBhcmFtcywgeyAnZWxlbWVudCc6IGVsZW1lbnQsICd0ZW1wbGF0ZU5vZGVzJzogb3JpZ2luYWxDaGlsZE5vZGVzIH0pXG4gICAgICAgICAgICA6IGNvbXBvbmVudFBhcmFtczsgLy8gVGVtcGxhdGUtb25seSBjb21wb25lbnRcbiAgICB9XG5cbn0pKCk7XG52YXIgYXR0ckh0bWxUb0phdmFzY3JpcHRNYXAgPSB7ICdjbGFzcyc6ICdjbGFzc05hbWUnLCAnZm9yJzogJ2h0bWxGb3InIH07XG5rby5iaW5kaW5nSGFuZGxlcnNbJ2F0dHInXSA9IHtcbiAgICAndXBkYXRlJzogZnVuY3Rpb24oZWxlbWVudCwgdmFsdWVBY2Nlc3NvciwgYWxsQmluZGluZ3MpIHtcbiAgICAgICAgdmFyIHZhbHVlID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZSh2YWx1ZUFjY2Vzc29yKCkpIHx8IHt9O1xuICAgICAgICBrby51dGlscy5vYmplY3RGb3JFYWNoKHZhbHVlLCBmdW5jdGlvbihhdHRyTmFtZSwgYXR0clZhbHVlKSB7XG4gICAgICAgICAgICBhdHRyVmFsdWUgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKGF0dHJWYWx1ZSk7XG5cbiAgICAgICAgICAgIC8vIFRvIGNvdmVyIGNhc2VzIGxpa2UgXCJhdHRyOiB7IGNoZWNrZWQ6c29tZVByb3AgfVwiLCB3ZSB3YW50IHRvIHJlbW92ZSB0aGUgYXR0cmlidXRlIGVudGlyZWx5XG4gICAgICAgICAgICAvLyB3aGVuIHNvbWVQcm9wIGlzIGEgXCJubyB2YWx1ZVwiLWxpa2UgdmFsdWUgKHN0cmljdGx5IG51bGwsIGZhbHNlLCBvciB1bmRlZmluZWQpXG4gICAgICAgICAgICAvLyAoYmVjYXVzZSB0aGUgYWJzZW5jZSBvZiB0aGUgXCJjaGVja2VkXCIgYXR0ciBpcyBob3cgdG8gbWFyayBhbiBlbGVtZW50IGFzIG5vdCBjaGVja2VkLCBldGMuKVxuICAgICAgICAgICAgdmFyIHRvUmVtb3ZlID0gKGF0dHJWYWx1ZSA9PT0gZmFsc2UpIHx8IChhdHRyVmFsdWUgPT09IG51bGwpIHx8IChhdHRyVmFsdWUgPT09IHVuZGVmaW5lZCk7XG4gICAgICAgICAgICBpZiAodG9SZW1vdmUpXG4gICAgICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoYXR0ck5hbWUpO1xuXG4gICAgICAgICAgICAvLyBJbiBJRSA8PSA3IGFuZCBJRTggUXVpcmtzIE1vZGUsIHlvdSBoYXZlIHRvIHVzZSB0aGUgSmF2YXNjcmlwdCBwcm9wZXJ0eSBuYW1lIGluc3RlYWQgb2YgdGhlXG4gICAgICAgICAgICAvLyBIVE1MIGF0dHJpYnV0ZSBuYW1lIGZvciBjZXJ0YWluIGF0dHJpYnV0ZXMuIElFOCBTdGFuZGFyZHMgTW9kZSBzdXBwb3J0cyB0aGUgY29ycmVjdCBiZWhhdmlvcixcbiAgICAgICAgICAgIC8vIGJ1dCBpbnN0ZWFkIG9mIGZpZ3VyaW5nIG91dCB0aGUgbW9kZSwgd2UnbGwganVzdCBzZXQgdGhlIGF0dHJpYnV0ZSB0aHJvdWdoIHRoZSBKYXZhc2NyaXB0XG4gICAgICAgICAgICAvLyBwcm9wZXJ0eSBmb3IgSUUgPD0gOC5cbiAgICAgICAgICAgIGlmIChrby51dGlscy5pZVZlcnNpb24gPD0gOCAmJiBhdHRyTmFtZSBpbiBhdHRySHRtbFRvSmF2YXNjcmlwdE1hcCkge1xuICAgICAgICAgICAgICAgIGF0dHJOYW1lID0gYXR0ckh0bWxUb0phdmFzY3JpcHRNYXBbYXR0ck5hbWVdO1xuICAgICAgICAgICAgICAgIGlmICh0b1JlbW92ZSlcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudC5yZW1vdmVBdHRyaWJ1dGUoYXR0ck5hbWUpO1xuICAgICAgICAgICAgICAgIGVsc2VcbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFthdHRyTmFtZV0gPSBhdHRyVmFsdWU7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKCF0b1JlbW92ZSkge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQuc2V0QXR0cmlidXRlKGF0dHJOYW1lLCBhdHRyVmFsdWUudG9TdHJpbmcoKSk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIC8vIFRyZWF0IFwibmFtZVwiIHNwZWNpYWxseSAtIGFsdGhvdWdoIHlvdSBjYW4gdGhpbmsgb2YgaXQgYXMgYW4gYXR0cmlidXRlLCBpdCBhbHNvIG5lZWRzXG4gICAgICAgICAgICAvLyBzcGVjaWFsIGhhbmRsaW5nIG9uIG9sZGVyIHZlcnNpb25zIG9mIElFIChodHRwczovL2dpdGh1Yi5jb20vU3RldmVTYW5kZXJzb24va25vY2tvdXQvcHVsbC8zMzMpXG4gICAgICAgICAgICAvLyBEZWxpYmVyYXRlbHkgYmVpbmcgY2FzZS1zZW5zaXRpdmUgaGVyZSBiZWNhdXNlIFhIVE1MIHdvdWxkIHJlZ2FyZCBcIk5hbWVcIiBhcyBhIGRpZmZlcmVudCB0aGluZ1xuICAgICAgICAgICAgLy8gZW50aXJlbHksIGFuZCB0aGVyZSdzIG5vIHN0cm9uZyByZWFzb24gdG8gYWxsb3cgZm9yIHN1Y2ggY2FzaW5nIGluIEhUTUwuXG4gICAgICAgICAgICBpZiAoYXR0ck5hbWUgPT09IFwibmFtZVwiKSB7XG4gICAgICAgICAgICAgICAga28udXRpbHMuc2V0RWxlbWVudE5hbWUoZWxlbWVudCwgdG9SZW1vdmUgPyBcIlwiIDogYXR0clZhbHVlLnRvU3RyaW5nKCkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59O1xuKGZ1bmN0aW9uKCkge1xuXG5rby5iaW5kaW5nSGFuZGxlcnNbJ2NoZWNrZWQnXSA9IHtcbiAgICAnYWZ0ZXInOiBbJ3ZhbHVlJywgJ2F0dHInXSxcbiAgICAnaW5pdCc6IGZ1bmN0aW9uIChlbGVtZW50LCB2YWx1ZUFjY2Vzc29yLCBhbGxCaW5kaW5ncykge1xuICAgICAgICB2YXIgY2hlY2tlZFZhbHVlID0ga28ucHVyZUNvbXB1dGVkKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgLy8gVHJlYXQgXCJ2YWx1ZVwiIGxpa2UgXCJjaGVja2VkVmFsdWVcIiB3aGVuIGl0IGlzIGluY2x1ZGVkIHdpdGggXCJjaGVja2VkXCIgYmluZGluZ1xuICAgICAgICAgICAgaWYgKGFsbEJpbmRpbmdzWydoYXMnXSgnY2hlY2tlZFZhbHVlJykpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZShhbGxCaW5kaW5ncy5nZXQoJ2NoZWNrZWRWYWx1ZScpKTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoYWxsQmluZGluZ3NbJ2hhcyddKCd2YWx1ZScpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUoYWxsQmluZGluZ3MuZ2V0KCd2YWx1ZScpKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGVsZW1lbnQudmFsdWU7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGZ1bmN0aW9uIHVwZGF0ZU1vZGVsKCkge1xuICAgICAgICAgICAgLy8gVGhpcyB1cGRhdGVzIHRoZSBtb2RlbCB2YWx1ZSBmcm9tIHRoZSB2aWV3IHZhbHVlLlxuICAgICAgICAgICAgLy8gSXQgcnVucyBpbiByZXNwb25zZSB0byBET00gZXZlbnRzIChjbGljaykgYW5kIGNoYW5nZXMgaW4gY2hlY2tlZFZhbHVlLlxuICAgICAgICAgICAgdmFyIGlzQ2hlY2tlZCA9IGVsZW1lbnQuY2hlY2tlZCxcbiAgICAgICAgICAgICAgICBlbGVtVmFsdWUgPSB1c2VDaGVja2VkVmFsdWUgPyBjaGVja2VkVmFsdWUoKSA6IGlzQ2hlY2tlZDtcblxuICAgICAgICAgICAgLy8gV2hlbiB3ZSdyZSBmaXJzdCBzZXR0aW5nIHVwIHRoaXMgY29tcHV0ZWQsIGRvbid0IGNoYW5nZSBhbnkgbW9kZWwgc3RhdGUuXG4gICAgICAgICAgICBpZiAoa28uY29tcHV0ZWRDb250ZXh0LmlzSW5pdGlhbCgpKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBXZSBjYW4gaWdub3JlIHVuY2hlY2tlZCByYWRpbyBidXR0b25zLCBiZWNhdXNlIHNvbWUgb3RoZXIgcmFkaW9cbiAgICAgICAgICAgIC8vIGJ1dHRvbiB3aWxsIGJlIGdldHRpbmcgY2hlY2tlZCwgYW5kIHRoYXQgb25lIGNhbiB0YWtlIGNhcmUgb2YgdXBkYXRpbmcgc3RhdGUuXG4gICAgICAgICAgICBpZiAoaXNSYWRpbyAmJiAhaXNDaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgbW9kZWxWYWx1ZSA9IGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlKHZhbHVlQWNjZXNzb3IpO1xuICAgICAgICAgICAgaWYgKHZhbHVlSXNBcnJheSkge1xuICAgICAgICAgICAgICAgIHZhciB3cml0YWJsZVZhbHVlID0gcmF3VmFsdWVJc05vbkFycmF5T2JzZXJ2YWJsZSA/IG1vZGVsVmFsdWUucGVlaygpIDogbW9kZWxWYWx1ZTtcbiAgICAgICAgICAgICAgICBpZiAob2xkRWxlbVZhbHVlICE9PSBlbGVtVmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gV2hlbiB3ZSdyZSByZXNwb25kaW5nIHRvIHRoZSBjaGVja2VkVmFsdWUgY2hhbmdpbmcsIGFuZCB0aGUgZWxlbWVudCBpc1xuICAgICAgICAgICAgICAgICAgICAvLyBjdXJyZW50bHkgY2hlY2tlZCwgcmVwbGFjZSB0aGUgb2xkIGVsZW0gdmFsdWUgd2l0aCB0aGUgbmV3IGVsZW0gdmFsdWVcbiAgICAgICAgICAgICAgICAgICAgLy8gaW4gdGhlIG1vZGVsIGFycmF5LlxuICAgICAgICAgICAgICAgICAgICBpZiAoaXNDaGVja2VkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBrby51dGlscy5hZGRPclJlbW92ZUl0ZW0od3JpdGFibGVWYWx1ZSwgZWxlbVZhbHVlLCB0cnVlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtvLnV0aWxzLmFkZE9yUmVtb3ZlSXRlbSh3cml0YWJsZVZhbHVlLCBvbGRFbGVtVmFsdWUsIGZhbHNlKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIG9sZEVsZW1WYWx1ZSA9IGVsZW1WYWx1ZTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAvLyBXaGVuIHdlJ3JlIHJlc3BvbmRpbmcgdG8gdGhlIHVzZXIgaGF2aW5nIGNoZWNrZWQvdW5jaGVja2VkIGEgY2hlY2tib3gsXG4gICAgICAgICAgICAgICAgICAgIC8vIGFkZC9yZW1vdmUgdGhlIGVsZW1lbnQgdmFsdWUgdG8gdGhlIG1vZGVsIGFycmF5LlxuICAgICAgICAgICAgICAgICAgICBrby51dGlscy5hZGRPclJlbW92ZUl0ZW0od3JpdGFibGVWYWx1ZSwgZWxlbVZhbHVlLCBpc0NoZWNrZWQpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAocmF3VmFsdWVJc05vbkFycmF5T2JzZXJ2YWJsZSAmJiBrby5pc1dyaXRlYWJsZU9ic2VydmFibGUobW9kZWxWYWx1ZSkpIHtcbiAgICAgICAgICAgICAgICAgICAgbW9kZWxWYWx1ZSh3cml0YWJsZVZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIGtvLmV4cHJlc3Npb25SZXdyaXRpbmcud3JpdGVWYWx1ZVRvUHJvcGVydHkobW9kZWxWYWx1ZSwgYWxsQmluZGluZ3MsICdjaGVja2VkJywgZWxlbVZhbHVlLCB0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICBmdW5jdGlvbiB1cGRhdGVWaWV3KCkge1xuICAgICAgICAgICAgLy8gVGhpcyB1cGRhdGVzIHRoZSB2aWV3IHZhbHVlIGZyb20gdGhlIG1vZGVsIHZhbHVlLlxuICAgICAgICAgICAgLy8gSXQgcnVucyBpbiByZXNwb25zZSB0byBjaGFuZ2VzIGluIHRoZSBib3VuZCAoY2hlY2tlZCkgdmFsdWUuXG4gICAgICAgICAgICB2YXIgbW9kZWxWYWx1ZSA9IGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUodmFsdWVBY2Nlc3NvcigpKTtcblxuICAgICAgICAgICAgaWYgKHZhbHVlSXNBcnJheSkge1xuICAgICAgICAgICAgICAgIC8vIFdoZW4gYSBjaGVja2JveCBpcyBib3VuZCB0byBhbiBhcnJheSwgYmVpbmcgY2hlY2tlZCByZXByZXNlbnRzIGl0cyB2YWx1ZSBiZWluZyBwcmVzZW50IGluIHRoYXQgYXJyYXlcbiAgICAgICAgICAgICAgICBlbGVtZW50LmNoZWNrZWQgPSBrby51dGlscy5hcnJheUluZGV4T2YobW9kZWxWYWx1ZSwgY2hlY2tlZFZhbHVlKCkpID49IDA7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKGlzQ2hlY2tib3gpIHtcbiAgICAgICAgICAgICAgICAvLyBXaGVuIGEgY2hlY2tib3ggaXMgYm91bmQgdG8gYW55IG90aGVyIHZhbHVlIChub3QgYW4gYXJyYXkpLCBiZWluZyBjaGVja2VkIHJlcHJlc2VudHMgdGhlIHZhbHVlIGJlaW5nIHRydWVpc2hcbiAgICAgICAgICAgICAgICBlbGVtZW50LmNoZWNrZWQgPSBtb2RlbFZhbHVlO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBGb3IgcmFkaW8gYnV0dG9ucywgYmVpbmcgY2hlY2tlZCBtZWFucyB0aGF0IHRoZSByYWRpbyBidXR0b24ncyB2YWx1ZSBjb3JyZXNwb25kcyB0byB0aGUgbW9kZWwgdmFsdWVcbiAgICAgICAgICAgICAgICBlbGVtZW50LmNoZWNrZWQgPSAoY2hlY2tlZFZhbHVlKCkgPT09IG1vZGVsVmFsdWUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIHZhciBpc0NoZWNrYm94ID0gZWxlbWVudC50eXBlID09IFwiY2hlY2tib3hcIixcbiAgICAgICAgICAgIGlzUmFkaW8gPSBlbGVtZW50LnR5cGUgPT0gXCJyYWRpb1wiO1xuXG4gICAgICAgIC8vIE9ubHkgYmluZCB0byBjaGVjayBib3hlcyBhbmQgcmFkaW8gYnV0dG9uc1xuICAgICAgICBpZiAoIWlzQ2hlY2tib3ggJiYgIWlzUmFkaW8pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciByYXdWYWx1ZSA9IHZhbHVlQWNjZXNzb3IoKSxcbiAgICAgICAgICAgIHZhbHVlSXNBcnJheSA9IGlzQ2hlY2tib3ggJiYgKGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUocmF3VmFsdWUpIGluc3RhbmNlb2YgQXJyYXkpLFxuICAgICAgICAgICAgcmF3VmFsdWVJc05vbkFycmF5T2JzZXJ2YWJsZSA9ICEodmFsdWVJc0FycmF5ICYmIHJhd1ZhbHVlLnB1c2ggJiYgcmF3VmFsdWUuc3BsaWNlKSxcbiAgICAgICAgICAgIG9sZEVsZW1WYWx1ZSA9IHZhbHVlSXNBcnJheSA/IGNoZWNrZWRWYWx1ZSgpIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgdXNlQ2hlY2tlZFZhbHVlID0gaXNSYWRpbyB8fCB2YWx1ZUlzQXJyYXk7XG5cbiAgICAgICAgLy8gSUUgNiB3b24ndCBhbGxvdyByYWRpbyBidXR0b25zIHRvIGJlIHNlbGVjdGVkIHVubGVzcyB0aGV5IGhhdmUgYSBuYW1lXG4gICAgICAgIGlmIChpc1JhZGlvICYmICFlbGVtZW50Lm5hbWUpXG4gICAgICAgICAgICBrby5iaW5kaW5nSGFuZGxlcnNbJ3VuaXF1ZU5hbWUnXVsnaW5pdCddKGVsZW1lbnQsIGZ1bmN0aW9uKCkgeyByZXR1cm4gdHJ1ZSB9KTtcblxuICAgICAgICAvLyBTZXQgdXAgdHdvIGNvbXB1dGVkcyB0byB1cGRhdGUgdGhlIGJpbmRpbmc6XG5cbiAgICAgICAgLy8gVGhlIGZpcnN0IHJlc3BvbmRzIHRvIGNoYW5nZXMgaW4gdGhlIGNoZWNrZWRWYWx1ZSB2YWx1ZSBhbmQgdG8gZWxlbWVudCBjbGlja3NcbiAgICAgICAga28uY29tcHV0ZWQodXBkYXRlTW9kZWwsIG51bGwsIHsgZGlzcG9zZVdoZW5Ob2RlSXNSZW1vdmVkOiBlbGVtZW50IH0pO1xuICAgICAgICBrby51dGlscy5yZWdpc3RlckV2ZW50SGFuZGxlcihlbGVtZW50LCBcImNsaWNrXCIsIHVwZGF0ZU1vZGVsKTtcblxuICAgICAgICAvLyBUaGUgc2Vjb25kIHJlc3BvbmRzIHRvIGNoYW5nZXMgaW4gdGhlIG1vZGVsIHZhbHVlICh0aGUgb25lIGFzc29jaWF0ZWQgd2l0aCB0aGUgY2hlY2tlZCBiaW5kaW5nKVxuICAgICAgICBrby5jb21wdXRlZCh1cGRhdGVWaWV3LCBudWxsLCB7IGRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZDogZWxlbWVudCB9KTtcblxuICAgICAgICByYXdWYWx1ZSA9IHVuZGVmaW5lZDtcbiAgICB9XG59O1xua28uZXhwcmVzc2lvblJld3JpdGluZy50d29XYXlCaW5kaW5nc1snY2hlY2tlZCddID0gdHJ1ZTtcblxua28uYmluZGluZ0hhbmRsZXJzWydjaGVja2VkVmFsdWUnXSA9IHtcbiAgICAndXBkYXRlJzogZnVuY3Rpb24gKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IpIHtcbiAgICAgICAgZWxlbWVudC52YWx1ZSA9IGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUodmFsdWVBY2Nlc3NvcigpKTtcbiAgICB9XG59O1xuXG59KSgpO3ZhciBjbGFzc2VzV3JpdHRlbkJ5QmluZGluZ0tleSA9ICdfX2tvX19jc3NWYWx1ZSc7XG5rby5iaW5kaW5nSGFuZGxlcnNbJ2NzcyddID0ge1xuICAgICd1cGRhdGUnOiBmdW5jdGlvbiAoZWxlbWVudCwgdmFsdWVBY2Nlc3Nvcikge1xuICAgICAgICB2YXIgdmFsdWUgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHZhbHVlQWNjZXNzb3IoKSk7XG4gICAgICAgIGlmICh2YWx1ZSAhPT0gbnVsbCAmJiB0eXBlb2YgdmFsdWUgPT0gXCJvYmplY3RcIikge1xuICAgICAgICAgICAga28udXRpbHMub2JqZWN0Rm9yRWFjaCh2YWx1ZSwgZnVuY3Rpb24oY2xhc3NOYW1lLCBzaG91bGRIYXZlQ2xhc3MpIHtcbiAgICAgICAgICAgICAgICBzaG91bGRIYXZlQ2xhc3MgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHNob3VsZEhhdmVDbGFzcyk7XG4gICAgICAgICAgICAgICAga28udXRpbHMudG9nZ2xlRG9tTm9kZUNzc0NsYXNzKGVsZW1lbnQsIGNsYXNzTmFtZSwgc2hvdWxkSGF2ZUNsYXNzKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFsdWUgPSBrby51dGlscy5zdHJpbmdUcmltKFN0cmluZyh2YWx1ZSB8fCAnJykpOyAvLyBNYWtlIHN1cmUgd2UgZG9uJ3QgdHJ5IHRvIHN0b3JlIG9yIHNldCBhIG5vbi1zdHJpbmcgdmFsdWVcbiAgICAgICAgICAgIGtvLnV0aWxzLnRvZ2dsZURvbU5vZGVDc3NDbGFzcyhlbGVtZW50LCBlbGVtZW50W2NsYXNzZXNXcml0dGVuQnlCaW5kaW5nS2V5XSwgZmFsc2UpO1xuICAgICAgICAgICAgZWxlbWVudFtjbGFzc2VzV3JpdHRlbkJ5QmluZGluZ0tleV0gPSB2YWx1ZTtcbiAgICAgICAgICAgIGtvLnV0aWxzLnRvZ2dsZURvbU5vZGVDc3NDbGFzcyhlbGVtZW50LCB2YWx1ZSwgdHJ1ZSk7XG4gICAgICAgIH1cbiAgICB9XG59O1xua28uYmluZGluZ0hhbmRsZXJzWydlbmFibGUnXSA9IHtcbiAgICAndXBkYXRlJzogZnVuY3Rpb24gKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IpIHtcbiAgICAgICAgdmFyIHZhbHVlID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZSh2YWx1ZUFjY2Vzc29yKCkpO1xuICAgICAgICBpZiAodmFsdWUgJiYgZWxlbWVudC5kaXNhYmxlZClcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQXR0cmlidXRlKFwiZGlzYWJsZWRcIik7XG4gICAgICAgIGVsc2UgaWYgKCghdmFsdWUpICYmICghZWxlbWVudC5kaXNhYmxlZCkpXG4gICAgICAgICAgICBlbGVtZW50LmRpc2FibGVkID0gdHJ1ZTtcbiAgICB9XG59O1xuXG5rby5iaW5kaW5nSGFuZGxlcnNbJ2Rpc2FibGUnXSA9IHtcbiAgICAndXBkYXRlJzogZnVuY3Rpb24gKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IpIHtcbiAgICAgICAga28uYmluZGluZ0hhbmRsZXJzWydlbmFibGUnXVsndXBkYXRlJ10oZWxlbWVudCwgZnVuY3Rpb24oKSB7IHJldHVybiAha28udXRpbHMudW53cmFwT2JzZXJ2YWJsZSh2YWx1ZUFjY2Vzc29yKCkpIH0pO1xuICAgIH1cbn07XG4vLyBGb3IgY2VydGFpbiBjb21tb24gZXZlbnRzIChjdXJyZW50bHkganVzdCAnY2xpY2snKSwgYWxsb3cgYSBzaW1wbGlmaWVkIGRhdGEtYmluZGluZyBzeW50YXhcbi8vIGUuZy4gY2xpY2s6aGFuZGxlciBpbnN0ZWFkIG9mIHRoZSB1c3VhbCBmdWxsLWxlbmd0aCBldmVudDp7Y2xpY2s6aGFuZGxlcn1cbmZ1bmN0aW9uIG1ha2VFdmVudEhhbmRsZXJTaG9ydGN1dChldmVudE5hbWUpIHtcbiAgICBrby5iaW5kaW5nSGFuZGxlcnNbZXZlbnROYW1lXSA9IHtcbiAgICAgICAgJ2luaXQnOiBmdW5jdGlvbihlbGVtZW50LCB2YWx1ZUFjY2Vzc29yLCBhbGxCaW5kaW5ncywgdmlld01vZGVsLCBiaW5kaW5nQ29udGV4dCkge1xuICAgICAgICAgICAgdmFyIG5ld1ZhbHVlQWNjZXNzb3IgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICAgICAgdmFyIHJlc3VsdCA9IHt9O1xuICAgICAgICAgICAgICAgIHJlc3VsdFtldmVudE5hbWVdID0gdmFsdWVBY2Nlc3NvcigpO1xuICAgICAgICAgICAgICAgIHJldHVybiByZXN1bHQ7XG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgcmV0dXJuIGtvLmJpbmRpbmdIYW5kbGVyc1snZXZlbnQnXVsnaW5pdCddLmNhbGwodGhpcywgZWxlbWVudCwgbmV3VmFsdWVBY2Nlc3NvciwgYWxsQmluZGluZ3MsIHZpZXdNb2RlbCwgYmluZGluZ0NvbnRleHQpO1xuICAgICAgICB9XG4gICAgfVxufVxuXG5rby5iaW5kaW5nSGFuZGxlcnNbJ2V2ZW50J10gPSB7XG4gICAgJ2luaXQnIDogZnVuY3Rpb24gKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IsIGFsbEJpbmRpbmdzLCB2aWV3TW9kZWwsIGJpbmRpbmdDb250ZXh0KSB7XG4gICAgICAgIHZhciBldmVudHNUb0hhbmRsZSA9IHZhbHVlQWNjZXNzb3IoKSB8fCB7fTtcbiAgICAgICAga28udXRpbHMub2JqZWN0Rm9yRWFjaChldmVudHNUb0hhbmRsZSwgZnVuY3Rpb24oZXZlbnROYW1lKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGV2ZW50TmFtZSA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAga28udXRpbHMucmVnaXN0ZXJFdmVudEhhbmRsZXIoZWxlbWVudCwgZXZlbnROYW1lLCBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGhhbmRsZXJSZXR1cm5WYWx1ZTtcbiAgICAgICAgICAgICAgICAgICAgdmFyIGhhbmRsZXJGdW5jdGlvbiA9IHZhbHVlQWNjZXNzb3IoKVtldmVudE5hbWVdO1xuICAgICAgICAgICAgICAgICAgICBpZiAoIWhhbmRsZXJGdW5jdGlvbilcbiAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcblxuICAgICAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICAgICAgLy8gVGFrZSBhbGwgdGhlIGV2ZW50IGFyZ3MsIGFuZCBwcmVmaXggd2l0aCB0aGUgdmlld21vZGVsXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgYXJnc0ZvckhhbmRsZXIgPSBrby51dGlscy5tYWtlQXJyYXkoYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZpZXdNb2RlbCA9IGJpbmRpbmdDb250ZXh0WyckZGF0YSddO1xuICAgICAgICAgICAgICAgICAgICAgICAgYXJnc0ZvckhhbmRsZXIudW5zaGlmdCh2aWV3TW9kZWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaGFuZGxlclJldHVyblZhbHVlID0gaGFuZGxlckZ1bmN0aW9uLmFwcGx5KHZpZXdNb2RlbCwgYXJnc0ZvckhhbmRsZXIpO1xuICAgICAgICAgICAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGhhbmRsZXJSZXR1cm5WYWx1ZSAhPT0gdHJ1ZSkgeyAvLyBOb3JtYWxseSB3ZSB3YW50IHRvIHByZXZlbnQgZGVmYXVsdCBhY3Rpb24uIERldmVsb3BlciBjYW4gb3ZlcnJpZGUgdGhpcyBiZSBleHBsaWNpdGx5IHJldHVybmluZyB0cnVlLlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChldmVudC5wcmV2ZW50RGVmYXVsdClcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBlbHNlXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGV2ZW50LnJldHVyblZhbHVlID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICB2YXIgYnViYmxlID0gYWxsQmluZGluZ3MuZ2V0KGV2ZW50TmFtZSArICdCdWJibGUnKSAhPT0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIGlmICghYnViYmxlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBldmVudC5jYW5jZWxCdWJibGUgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LnN0b3BQcm9wYWdhdGlvbilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBldmVudC5zdG9wUHJvcGFnYXRpb24oKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG59O1xuLy8gXCJmb3JlYWNoOiBzb21lRXhwcmVzc2lvblwiIGlzIGVxdWl2YWxlbnQgdG8gXCJ0ZW1wbGF0ZTogeyBmb3JlYWNoOiBzb21lRXhwcmVzc2lvbiB9XCJcbi8vIFwiZm9yZWFjaDogeyBkYXRhOiBzb21lRXhwcmVzc2lvbiwgYWZ0ZXJBZGQ6IG15Zm4gfVwiIGlzIGVxdWl2YWxlbnQgdG8gXCJ0ZW1wbGF0ZTogeyBmb3JlYWNoOiBzb21lRXhwcmVzc2lvbiwgYWZ0ZXJBZGQ6IG15Zm4gfVwiXG5rby5iaW5kaW5nSGFuZGxlcnNbJ2ZvcmVhY2gnXSA9IHtcbiAgICBtYWtlVGVtcGxhdGVWYWx1ZUFjY2Vzc29yOiBmdW5jdGlvbih2YWx1ZUFjY2Vzc29yKSB7XG4gICAgICAgIHJldHVybiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBtb2RlbFZhbHVlID0gdmFsdWVBY2Nlc3NvcigpLFxuICAgICAgICAgICAgICAgIHVud3JhcHBlZFZhbHVlID0ga28udXRpbHMucGVla09ic2VydmFibGUobW9kZWxWYWx1ZSk7ICAgIC8vIFVud3JhcCB3aXRob3V0IHNldHRpbmcgYSBkZXBlbmRlbmN5IGhlcmVcblxuICAgICAgICAgICAgLy8gSWYgdW53cmFwcGVkVmFsdWUgaXMgdGhlIGFycmF5LCBwYXNzIGluIHRoZSB3cmFwcGVkIHZhbHVlIG9uIGl0cyBvd25cbiAgICAgICAgICAgIC8vIFRoZSB2YWx1ZSB3aWxsIGJlIHVud3JhcHBlZCBhbmQgdHJhY2tlZCB3aXRoaW4gdGhlIHRlbXBsYXRlIGJpbmRpbmdcbiAgICAgICAgICAgIC8vIChTZWUgaHR0cHM6Ly9naXRodWIuY29tL1N0ZXZlU2FuZGVyc29uL2tub2Nrb3V0L2lzc3Vlcy81MjMpXG4gICAgICAgICAgICBpZiAoKCF1bndyYXBwZWRWYWx1ZSkgfHwgdHlwZW9mIHVud3JhcHBlZFZhbHVlLmxlbmd0aCA9PSBcIm51bWJlclwiKVxuICAgICAgICAgICAgICAgIHJldHVybiB7ICdmb3JlYWNoJzogbW9kZWxWYWx1ZSwgJ3RlbXBsYXRlRW5naW5lJzoga28ubmF0aXZlVGVtcGxhdGVFbmdpbmUuaW5zdGFuY2UgfTtcblxuICAgICAgICAgICAgLy8gSWYgdW53cmFwcGVkVmFsdWUuZGF0YSBpcyB0aGUgYXJyYXksIHByZXNlcnZlIGFsbCByZWxldmFudCBvcHRpb25zIGFuZCB1bndyYXAgYWdhaW4gdmFsdWUgc28gd2UgZ2V0IHVwZGF0ZXNcbiAgICAgICAgICAgIGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUobW9kZWxWYWx1ZSk7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgICdmb3JlYWNoJzogdW53cmFwcGVkVmFsdWVbJ2RhdGEnXSxcbiAgICAgICAgICAgICAgICAnYXMnOiB1bndyYXBwZWRWYWx1ZVsnYXMnXSxcbiAgICAgICAgICAgICAgICAnaW5jbHVkZURlc3Ryb3llZCc6IHVud3JhcHBlZFZhbHVlWydpbmNsdWRlRGVzdHJveWVkJ10sXG4gICAgICAgICAgICAgICAgJ2FmdGVyQWRkJzogdW53cmFwcGVkVmFsdWVbJ2FmdGVyQWRkJ10sXG4gICAgICAgICAgICAgICAgJ2JlZm9yZVJlbW92ZSc6IHVud3JhcHBlZFZhbHVlWydiZWZvcmVSZW1vdmUnXSxcbiAgICAgICAgICAgICAgICAnYWZ0ZXJSZW5kZXInOiB1bndyYXBwZWRWYWx1ZVsnYWZ0ZXJSZW5kZXInXSxcbiAgICAgICAgICAgICAgICAnYmVmb3JlTW92ZSc6IHVud3JhcHBlZFZhbHVlWydiZWZvcmVNb3ZlJ10sXG4gICAgICAgICAgICAgICAgJ2FmdGVyTW92ZSc6IHVud3JhcHBlZFZhbHVlWydhZnRlck1vdmUnXSxcbiAgICAgICAgICAgICAgICAndGVtcGxhdGVFbmdpbmUnOiBrby5uYXRpdmVUZW1wbGF0ZUVuZ2luZS5pbnN0YW5jZVxuICAgICAgICAgICAgfTtcbiAgICAgICAgfTtcbiAgICB9LFxuICAgICdpbml0JzogZnVuY3Rpb24oZWxlbWVudCwgdmFsdWVBY2Nlc3NvciwgYWxsQmluZGluZ3MsIHZpZXdNb2RlbCwgYmluZGluZ0NvbnRleHQpIHtcbiAgICAgICAgcmV0dXJuIGtvLmJpbmRpbmdIYW5kbGVyc1sndGVtcGxhdGUnXVsnaW5pdCddKGVsZW1lbnQsIGtvLmJpbmRpbmdIYW5kbGVyc1snZm9yZWFjaCddLm1ha2VUZW1wbGF0ZVZhbHVlQWNjZXNzb3IodmFsdWVBY2Nlc3NvcikpO1xuICAgIH0sXG4gICAgJ3VwZGF0ZSc6IGZ1bmN0aW9uKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IsIGFsbEJpbmRpbmdzLCB2aWV3TW9kZWwsIGJpbmRpbmdDb250ZXh0KSB7XG4gICAgICAgIHJldHVybiBrby5iaW5kaW5nSGFuZGxlcnNbJ3RlbXBsYXRlJ11bJ3VwZGF0ZSddKGVsZW1lbnQsIGtvLmJpbmRpbmdIYW5kbGVyc1snZm9yZWFjaCddLm1ha2VUZW1wbGF0ZVZhbHVlQWNjZXNzb3IodmFsdWVBY2Nlc3NvciksIGFsbEJpbmRpbmdzLCB2aWV3TW9kZWwsIGJpbmRpbmdDb250ZXh0KTtcbiAgICB9XG59O1xua28uZXhwcmVzc2lvblJld3JpdGluZy5iaW5kaW5nUmV3cml0ZVZhbGlkYXRvcnNbJ2ZvcmVhY2gnXSA9IGZhbHNlOyAvLyBDYW4ndCByZXdyaXRlIGNvbnRyb2wgZmxvdyBiaW5kaW5nc1xua28udmlydHVhbEVsZW1lbnRzLmFsbG93ZWRCaW5kaW5nc1snZm9yZWFjaCddID0gdHJ1ZTtcbnZhciBoYXNmb2N1c1VwZGF0aW5nUHJvcGVydHkgPSAnX19rb19oYXNmb2N1c1VwZGF0aW5nJztcbnZhciBoYXNmb2N1c0xhc3RWYWx1ZSA9ICdfX2tvX2hhc2ZvY3VzTGFzdFZhbHVlJztcbmtvLmJpbmRpbmdIYW5kbGVyc1snaGFzZm9jdXMnXSA9IHtcbiAgICAnaW5pdCc6IGZ1bmN0aW9uKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IsIGFsbEJpbmRpbmdzKSB7XG4gICAgICAgIHZhciBoYW5kbGVFbGVtZW50Rm9jdXNDaGFuZ2UgPSBmdW5jdGlvbihpc0ZvY3VzZWQpIHtcbiAgICAgICAgICAgIC8vIFdoZXJlIHBvc3NpYmxlLCBpZ25vcmUgd2hpY2ggZXZlbnQgd2FzIHJhaXNlZCBhbmQgZGV0ZXJtaW5lIGZvY3VzIHN0YXRlIHVzaW5nIGFjdGl2ZUVsZW1lbnQsXG4gICAgICAgICAgICAvLyBhcyB0aGlzIGF2b2lkcyBwaGFudG9tIGZvY3VzL2JsdXIgZXZlbnRzIHJhaXNlZCB3aGVuIGNoYW5naW5nIHRhYnMgaW4gbW9kZXJuIGJyb3dzZXJzLlxuICAgICAgICAgICAgLy8gSG93ZXZlciwgbm90IGFsbCBLTy10YXJnZXRlZCBicm93c2VycyAoRmlyZWZveCAyKSBzdXBwb3J0IGFjdGl2ZUVsZW1lbnQuIEZvciB0aG9zZSBicm93c2VycyxcbiAgICAgICAgICAgIC8vIHByZXZlbnQgYSBsb3NzIG9mIGZvY3VzIHdoZW4gY2hhbmdpbmcgdGFicy93aW5kb3dzIGJ5IHNldHRpbmcgYSBmbGFnIHRoYXQgcHJldmVudHMgaGFzZm9jdXNcbiAgICAgICAgICAgIC8vIGZyb20gY2FsbGluZyAnYmx1cigpJyBvbiB0aGUgZWxlbWVudCB3aGVuIGl0IGxvc2VzIGZvY3VzLlxuICAgICAgICAgICAgLy8gRGlzY3Vzc2lvbiBhdCBodHRwczovL2dpdGh1Yi5jb20vU3RldmVTYW5kZXJzb24va25vY2tvdXQvcHVsbC8zNTJcbiAgICAgICAgICAgIGVsZW1lbnRbaGFzZm9jdXNVcGRhdGluZ1Byb3BlcnR5XSA9IHRydWU7XG4gICAgICAgICAgICB2YXIgb3duZXJEb2MgPSBlbGVtZW50Lm93bmVyRG9jdW1lbnQ7XG4gICAgICAgICAgICBpZiAoXCJhY3RpdmVFbGVtZW50XCIgaW4gb3duZXJEb2MpIHtcbiAgICAgICAgICAgICAgICB2YXIgYWN0aXZlO1xuICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgIGFjdGl2ZSA9IG93bmVyRG9jLmFjdGl2ZUVsZW1lbnQ7XG4gICAgICAgICAgICAgICAgfSBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElFOSB0aHJvd3MgaWYgeW91IGFjY2VzcyBhY3RpdmVFbGVtZW50IGR1cmluZyBwYWdlIGxvYWQgKHNlZSBpc3N1ZSAjNzAzKVxuICAgICAgICAgICAgICAgICAgICBhY3RpdmUgPSBvd25lckRvYy5ib2R5O1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpc0ZvY3VzZWQgPSAoYWN0aXZlID09PSBlbGVtZW50KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIHZhciBtb2RlbFZhbHVlID0gdmFsdWVBY2Nlc3NvcigpO1xuICAgICAgICAgICAga28uZXhwcmVzc2lvblJld3JpdGluZy53cml0ZVZhbHVlVG9Qcm9wZXJ0eShtb2RlbFZhbHVlLCBhbGxCaW5kaW5ncywgJ2hhc2ZvY3VzJywgaXNGb2N1c2VkLCB0cnVlKTtcblxuICAgICAgICAgICAgLy9jYWNoZSB0aGUgbGF0ZXN0IHZhbHVlLCBzbyB3ZSBjYW4gYXZvaWQgdW5uZWNlc3NhcmlseSBjYWxsaW5nIGZvY3VzL2JsdXIgaW4gdGhlIHVwZGF0ZSBmdW5jdGlvblxuICAgICAgICAgICAgZWxlbWVudFtoYXNmb2N1c0xhc3RWYWx1ZV0gPSBpc0ZvY3VzZWQ7XG4gICAgICAgICAgICBlbGVtZW50W2hhc2ZvY3VzVXBkYXRpbmdQcm9wZXJ0eV0gPSBmYWxzZTtcbiAgICAgICAgfTtcbiAgICAgICAgdmFyIGhhbmRsZUVsZW1lbnRGb2N1c0luID0gaGFuZGxlRWxlbWVudEZvY3VzQ2hhbmdlLmJpbmQobnVsbCwgdHJ1ZSk7XG4gICAgICAgIHZhciBoYW5kbGVFbGVtZW50Rm9jdXNPdXQgPSBoYW5kbGVFbGVtZW50Rm9jdXNDaGFuZ2UuYmluZChudWxsLCBmYWxzZSk7XG5cbiAgICAgICAga28udXRpbHMucmVnaXN0ZXJFdmVudEhhbmRsZXIoZWxlbWVudCwgXCJmb2N1c1wiLCBoYW5kbGVFbGVtZW50Rm9jdXNJbik7XG4gICAgICAgIGtvLnV0aWxzLnJlZ2lzdGVyRXZlbnRIYW5kbGVyKGVsZW1lbnQsIFwiZm9jdXNpblwiLCBoYW5kbGVFbGVtZW50Rm9jdXNJbik7IC8vIEZvciBJRVxuICAgICAgICBrby51dGlscy5yZWdpc3RlckV2ZW50SGFuZGxlcihlbGVtZW50LCBcImJsdXJcIiwgIGhhbmRsZUVsZW1lbnRGb2N1c091dCk7XG4gICAgICAgIGtvLnV0aWxzLnJlZ2lzdGVyRXZlbnRIYW5kbGVyKGVsZW1lbnQsIFwiZm9jdXNvdXRcIiwgIGhhbmRsZUVsZW1lbnRGb2N1c091dCk7IC8vIEZvciBJRVxuICAgIH0sXG4gICAgJ3VwZGF0ZSc6IGZ1bmN0aW9uKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IpIHtcbiAgICAgICAgdmFyIHZhbHVlID0gISFrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHZhbHVlQWNjZXNzb3IoKSk7XG5cbiAgICAgICAgaWYgKCFlbGVtZW50W2hhc2ZvY3VzVXBkYXRpbmdQcm9wZXJ0eV0gJiYgZWxlbWVudFtoYXNmb2N1c0xhc3RWYWx1ZV0gIT09IHZhbHVlKSB7XG4gICAgICAgICAgICB2YWx1ZSA/IGVsZW1lbnQuZm9jdXMoKSA6IGVsZW1lbnQuYmx1cigpO1xuXG4gICAgICAgICAgICAvLyBJbiBJRSwgdGhlIGJsdXIgbWV0aG9kIGRvZXNuJ3QgYWx3YXlzIGNhdXNlIHRoZSBlbGVtZW50IHRvIGxvc2UgZm9jdXMgKGZvciBleGFtcGxlLCBpZiB0aGUgd2luZG93IGlzIG5vdCBpbiBmb2N1cykuXG4gICAgICAgICAgICAvLyBTZXR0aW5nIGZvY3VzIHRvIHRoZSBib2R5IGVsZW1lbnQgZG9lcyBzZWVtIHRvIGJlIHJlbGlhYmxlIGluIElFLCBidXQgc2hvdWxkIG9ubHkgYmUgdXNlZCBpZiB3ZSBrbm93IHRoYXQgdGhlIGN1cnJlbnRcbiAgICAgICAgICAgIC8vIGVsZW1lbnQgd2FzIGZvY3VzZWQgYWxyZWFkeS5cbiAgICAgICAgICAgIGlmICghdmFsdWUgJiYgZWxlbWVudFtoYXNmb2N1c0xhc3RWYWx1ZV0pIHtcbiAgICAgICAgICAgICAgICBlbGVtZW50Lm93bmVyRG9jdW1lbnQuYm9keS5mb2N1cygpO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBGb3IgSUUsIHdoaWNoIGRvZXNuJ3QgcmVsaWFibHkgZmlyZSBcImZvY3VzXCIgb3IgXCJibHVyXCIgZXZlbnRzIHN5bmNocm9ub3VzbHlcbiAgICAgICAgICAgIGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlKGtvLnV0aWxzLnRyaWdnZXJFdmVudCwgbnVsbCwgW2VsZW1lbnQsIHZhbHVlID8gXCJmb2N1c2luXCIgOiBcImZvY3Vzb3V0XCJdKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5rby5leHByZXNzaW9uUmV3cml0aW5nLnR3b1dheUJpbmRpbmdzWydoYXNmb2N1cyddID0gdHJ1ZTtcblxua28uYmluZGluZ0hhbmRsZXJzWydoYXNGb2N1cyddID0ga28uYmluZGluZ0hhbmRsZXJzWydoYXNmb2N1cyddOyAvLyBNYWtlIFwiaGFzRm9jdXNcIiBhbiBhbGlhc1xua28uZXhwcmVzc2lvblJld3JpdGluZy50d29XYXlCaW5kaW5nc1snaGFzRm9jdXMnXSA9IHRydWU7XG5rby5iaW5kaW5nSGFuZGxlcnNbJ2h0bWwnXSA9IHtcbiAgICAnaW5pdCc6IGZ1bmN0aW9uKCkge1xuICAgICAgICAvLyBQcmV2ZW50IGJpbmRpbmcgb24gdGhlIGR5bmFtaWNhbGx5LWluamVjdGVkIEhUTUwgKGFzIGRldmVsb3BlcnMgYXJlIHVubGlrZWx5IHRvIGV4cGVjdCB0aGF0LCBhbmQgaXQgaGFzIHNlY3VyaXR5IGltcGxpY2F0aW9ucylcbiAgICAgICAgcmV0dXJuIHsgJ2NvbnRyb2xzRGVzY2VuZGFudEJpbmRpbmdzJzogdHJ1ZSB9O1xuICAgIH0sXG4gICAgJ3VwZGF0ZSc6IGZ1bmN0aW9uIChlbGVtZW50LCB2YWx1ZUFjY2Vzc29yKSB7XG4gICAgICAgIC8vIHNldEh0bWwgd2lsbCB1bndyYXAgdGhlIHZhbHVlIGlmIG5lZWRlZFxuICAgICAgICBrby51dGlscy5zZXRIdG1sKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IoKSk7XG4gICAgfVxufTtcbi8vIE1ha2VzIGEgYmluZGluZyBsaWtlIHdpdGggb3IgaWZcbmZ1bmN0aW9uIG1ha2VXaXRoSWZCaW5kaW5nKGJpbmRpbmdLZXksIGlzV2l0aCwgaXNOb3QsIG1ha2VDb250ZXh0Q2FsbGJhY2spIHtcbiAgICBrby5iaW5kaW5nSGFuZGxlcnNbYmluZGluZ0tleV0gPSB7XG4gICAgICAgICdpbml0JzogZnVuY3Rpb24oZWxlbWVudCwgdmFsdWVBY2Nlc3NvciwgYWxsQmluZGluZ3MsIHZpZXdNb2RlbCwgYmluZGluZ0NvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciBkaWREaXNwbGF5T25MYXN0VXBkYXRlLFxuICAgICAgICAgICAgICAgIHNhdmVkTm9kZXM7XG4gICAgICAgICAgICBrby5jb21wdXRlZChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB2YXIgZGF0YVZhbHVlID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZSh2YWx1ZUFjY2Vzc29yKCkpLFxuICAgICAgICAgICAgICAgICAgICBzaG91bGREaXNwbGF5ID0gIWlzTm90ICE9PSAhZGF0YVZhbHVlLCAvLyBlcXVpdmFsZW50IHRvIGlzTm90ID8gIWRhdGFWYWx1ZSA6ICEhZGF0YVZhbHVlXG4gICAgICAgICAgICAgICAgICAgIGlzRmlyc3RSZW5kZXIgPSAhc2F2ZWROb2RlcyxcbiAgICAgICAgICAgICAgICAgICAgbmVlZHNSZWZyZXNoID0gaXNGaXJzdFJlbmRlciB8fCBpc1dpdGggfHwgKHNob3VsZERpc3BsYXkgIT09IGRpZERpc3BsYXlPbkxhc3RVcGRhdGUpO1xuXG4gICAgICAgICAgICAgICAgaWYgKG5lZWRzUmVmcmVzaCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBTYXZlIGEgY29weSBvZiB0aGUgaW5uZXIgbm9kZXMgb24gdGhlIGluaXRpYWwgdXBkYXRlLCBidXQgb25seSBpZiB3ZSBoYXZlIGRlcGVuZGVuY2llcy5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGlzRmlyc3RSZW5kZXIgJiYga28uY29tcHV0ZWRDb250ZXh0LmdldERlcGVuZGVuY2llc0NvdW50KCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNhdmVkTm9kZXMgPSBrby51dGlscy5jbG9uZU5vZGVzKGtvLnZpcnR1YWxFbGVtZW50cy5jaGlsZE5vZGVzKGVsZW1lbnQpLCB0cnVlIC8qIHNob3VsZENsZWFuTm9kZXMgKi8pO1xuICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgaWYgKHNob3VsZERpc3BsYXkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghaXNGaXJzdFJlbmRlcikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGtvLnZpcnR1YWxFbGVtZW50cy5zZXREb21Ob2RlQ2hpbGRyZW4oZWxlbWVudCwga28udXRpbHMuY2xvbmVOb2RlcyhzYXZlZE5vZGVzKSk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBrby5hcHBseUJpbmRpbmdzVG9EZXNjZW5kYW50cyhtYWtlQ29udGV4dENhbGxiYWNrID8gbWFrZUNvbnRleHRDYWxsYmFjayhiaW5kaW5nQ29udGV4dCwgZGF0YVZhbHVlKSA6IGJpbmRpbmdDb250ZXh0LCBlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtvLnZpcnR1YWxFbGVtZW50cy5lbXB0eU5vZGUoZWxlbWVudCk7XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBkaWREaXNwbGF5T25MYXN0VXBkYXRlID0gc2hvdWxkRGlzcGxheTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LCBudWxsLCB7IGRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZDogZWxlbWVudCB9KTtcbiAgICAgICAgICAgIHJldHVybiB7ICdjb250cm9sc0Rlc2NlbmRhbnRCaW5kaW5ncyc6IHRydWUgfTtcbiAgICAgICAgfVxuICAgIH07XG4gICAga28uZXhwcmVzc2lvblJld3JpdGluZy5iaW5kaW5nUmV3cml0ZVZhbGlkYXRvcnNbYmluZGluZ0tleV0gPSBmYWxzZTsgLy8gQ2FuJ3QgcmV3cml0ZSBjb250cm9sIGZsb3cgYmluZGluZ3NcbiAgICBrby52aXJ0dWFsRWxlbWVudHMuYWxsb3dlZEJpbmRpbmdzW2JpbmRpbmdLZXldID0gdHJ1ZTtcbn1cblxuLy8gQ29uc3RydWN0IHRoZSBhY3R1YWwgYmluZGluZyBoYW5kbGVyc1xubWFrZVdpdGhJZkJpbmRpbmcoJ2lmJyk7XG5tYWtlV2l0aElmQmluZGluZygnaWZub3QnLCBmYWxzZSAvKiBpc1dpdGggKi8sIHRydWUgLyogaXNOb3QgKi8pO1xubWFrZVdpdGhJZkJpbmRpbmcoJ3dpdGgnLCB0cnVlIC8qIGlzV2l0aCAqLywgZmFsc2UgLyogaXNOb3QgKi8sXG4gICAgZnVuY3Rpb24oYmluZGluZ0NvbnRleHQsIGRhdGFWYWx1ZSkge1xuICAgICAgICByZXR1cm4gYmluZGluZ0NvbnRleHRbJ2NyZWF0ZUNoaWxkQ29udGV4dCddKGRhdGFWYWx1ZSk7XG4gICAgfVxuKTtcbnZhciBjYXB0aW9uUGxhY2Vob2xkZXIgPSB7fTtcbmtvLmJpbmRpbmdIYW5kbGVyc1snb3B0aW9ucyddID0ge1xuICAgICdpbml0JzogZnVuY3Rpb24oZWxlbWVudCkge1xuICAgICAgICBpZiAoa28udXRpbHMudGFnTmFtZUxvd2VyKGVsZW1lbnQpICE9PSBcInNlbGVjdFwiKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwib3B0aW9ucyBiaW5kaW5nIGFwcGxpZXMgb25seSB0byBTRUxFQ1QgZWxlbWVudHNcIik7XG5cbiAgICAgICAgLy8gUmVtb3ZlIGFsbCBleGlzdGluZyA8b3B0aW9uPnMuXG4gICAgICAgIHdoaWxlIChlbGVtZW50Lmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlKDApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRW5zdXJlcyB0aGF0IHRoZSBiaW5kaW5nIHByb2Nlc3NvciBkb2Vzbid0IHRyeSB0byBiaW5kIHRoZSBvcHRpb25zXG4gICAgICAgIHJldHVybiB7ICdjb250cm9sc0Rlc2NlbmRhbnRCaW5kaW5ncyc6IHRydWUgfTtcbiAgICB9LFxuICAgICd1cGRhdGUnOiBmdW5jdGlvbiAoZWxlbWVudCwgdmFsdWVBY2Nlc3NvciwgYWxsQmluZGluZ3MpIHtcbiAgICAgICAgZnVuY3Rpb24gc2VsZWN0ZWRPcHRpb25zKCkge1xuICAgICAgICAgICAgcmV0dXJuIGtvLnV0aWxzLmFycmF5RmlsdGVyKGVsZW1lbnQub3B0aW9ucywgZnVuY3Rpb24gKG5vZGUpIHsgcmV0dXJuIG5vZGUuc2VsZWN0ZWQ7IH0pO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHNlbGVjdFdhc1ByZXZpb3VzbHlFbXB0eSA9IGVsZW1lbnQubGVuZ3RoID09IDAsXG4gICAgICAgICAgICBtdWx0aXBsZSA9IGVsZW1lbnQubXVsdGlwbGUsXG4gICAgICAgICAgICBwcmV2aW91c1Njcm9sbFRvcCA9ICghc2VsZWN0V2FzUHJldmlvdXNseUVtcHR5ICYmIG11bHRpcGxlKSA/IGVsZW1lbnQuc2Nyb2xsVG9wIDogbnVsbCxcbiAgICAgICAgICAgIHVud3JhcHBlZEFycmF5ID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZSh2YWx1ZUFjY2Vzc29yKCkpLFxuICAgICAgICAgICAgdmFsdWVBbGxvd1Vuc2V0ID0gYWxsQmluZGluZ3MuZ2V0KCd2YWx1ZUFsbG93VW5zZXQnKSAmJiBhbGxCaW5kaW5nc1snaGFzJ10oJ3ZhbHVlJyksXG4gICAgICAgICAgICBpbmNsdWRlRGVzdHJveWVkID0gYWxsQmluZGluZ3MuZ2V0KCdvcHRpb25zSW5jbHVkZURlc3Ryb3llZCcpLFxuICAgICAgICAgICAgYXJyYXlUb0RvbU5vZGVDaGlsZHJlbk9wdGlvbnMgPSB7fSxcbiAgICAgICAgICAgIGNhcHRpb25WYWx1ZSxcbiAgICAgICAgICAgIGZpbHRlcmVkQXJyYXksXG4gICAgICAgICAgICBwcmV2aW91c1NlbGVjdGVkVmFsdWVzID0gW107XG5cbiAgICAgICAgaWYgKCF2YWx1ZUFsbG93VW5zZXQpIHtcbiAgICAgICAgICAgIGlmIChtdWx0aXBsZSkge1xuICAgICAgICAgICAgICAgIHByZXZpb3VzU2VsZWN0ZWRWYWx1ZXMgPSBrby51dGlscy5hcnJheU1hcChzZWxlY3RlZE9wdGlvbnMoKSwga28uc2VsZWN0RXh0ZW5zaW9ucy5yZWFkVmFsdWUpO1xuICAgICAgICAgICAgfSBlbHNlIGlmIChlbGVtZW50LnNlbGVjdGVkSW5kZXggPj0gMCkge1xuICAgICAgICAgICAgICAgIHByZXZpb3VzU2VsZWN0ZWRWYWx1ZXMucHVzaChrby5zZWxlY3RFeHRlbnNpb25zLnJlYWRWYWx1ZShlbGVtZW50Lm9wdGlvbnNbZWxlbWVudC5zZWxlY3RlZEluZGV4XSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgaWYgKHVud3JhcHBlZEFycmF5KSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHVud3JhcHBlZEFycmF5Lmxlbmd0aCA9PSBcInVuZGVmaW5lZFwiKSAvLyBDb2VyY2Ugc2luZ2xlIHZhbHVlIGludG8gYXJyYXlcbiAgICAgICAgICAgICAgICB1bndyYXBwZWRBcnJheSA9IFt1bndyYXBwZWRBcnJheV07XG5cbiAgICAgICAgICAgIC8vIEZpbHRlciBvdXQgYW55IGVudHJpZXMgbWFya2VkIGFzIGRlc3Ryb3llZFxuICAgICAgICAgICAgZmlsdGVyZWRBcnJheSA9IGtvLnV0aWxzLmFycmF5RmlsdGVyKHVud3JhcHBlZEFycmF5LCBmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGluY2x1ZGVEZXN0cm95ZWQgfHwgaXRlbSA9PT0gdW5kZWZpbmVkIHx8IGl0ZW0gPT09IG51bGwgfHwgIWtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUoaXRlbVsnX2Rlc3Ryb3knXSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gSWYgY2FwdGlvbiBpcyBpbmNsdWRlZCwgYWRkIGl0IHRvIHRoZSBhcnJheVxuICAgICAgICAgICAgaWYgKGFsbEJpbmRpbmdzWydoYXMnXSgnb3B0aW9uc0NhcHRpb24nKSkge1xuICAgICAgICAgICAgICAgIGNhcHRpb25WYWx1ZSA9IGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUoYWxsQmluZGluZ3MuZ2V0KCdvcHRpb25zQ2FwdGlvbicpKTtcbiAgICAgICAgICAgICAgICAvLyBJZiBjYXB0aW9uIHZhbHVlIGlzIG51bGwgb3IgdW5kZWZpbmVkLCBkb24ndCBzaG93IGEgY2FwdGlvblxuICAgICAgICAgICAgICAgIGlmIChjYXB0aW9uVmFsdWUgIT09IG51bGwgJiYgY2FwdGlvblZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgZmlsdGVyZWRBcnJheS51bnNoaWZ0KGNhcHRpb25QbGFjZWhvbGRlcik7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gSWYgYSBmYWxzeSB2YWx1ZSBpcyBwcm92aWRlZCAoZS5nLiBudWxsKSwgd2UnbGwgc2ltcGx5IGVtcHR5IHRoZSBzZWxlY3QgZWxlbWVudFxuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gYXBwbHlUb09iamVjdChvYmplY3QsIHByZWRpY2F0ZSwgZGVmYXVsdFZhbHVlKSB7XG4gICAgICAgICAgICB2YXIgcHJlZGljYXRlVHlwZSA9IHR5cGVvZiBwcmVkaWNhdGU7XG4gICAgICAgICAgICBpZiAocHJlZGljYXRlVHlwZSA9PSBcImZ1bmN0aW9uXCIpICAgIC8vIEdpdmVuIGEgZnVuY3Rpb247IHJ1biBpdCBhZ2FpbnN0IHRoZSBkYXRhIHZhbHVlXG4gICAgICAgICAgICAgICAgcmV0dXJuIHByZWRpY2F0ZShvYmplY3QpO1xuICAgICAgICAgICAgZWxzZSBpZiAocHJlZGljYXRlVHlwZSA9PSBcInN0cmluZ1wiKSAvLyBHaXZlbiBhIHN0cmluZzsgdHJlYXQgaXQgYXMgYSBwcm9wZXJ0eSBuYW1lIG9uIHRoZSBkYXRhIHZhbHVlXG4gICAgICAgICAgICAgICAgcmV0dXJuIG9iamVjdFtwcmVkaWNhdGVdO1xuICAgICAgICAgICAgZWxzZSAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gR2l2ZW4gbm8gb3B0aW9uc1RleHQgYXJnOyB1c2UgdGhlIGRhdGEgdmFsdWUgaXRzZWxmXG4gICAgICAgICAgICAgICAgcmV0dXJuIGRlZmF1bHRWYWx1ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFRoZSBmb2xsb3dpbmcgZnVuY3Rpb25zIGNhbiBydW4gYXQgdHdvIGRpZmZlcmVudCB0aW1lczpcbiAgICAgICAgLy8gVGhlIGZpcnN0IGlzIHdoZW4gdGhlIHdob2xlIGFycmF5IGlzIGJlaW5nIHVwZGF0ZWQgZGlyZWN0bHkgZnJvbSB0aGlzIGJpbmRpbmcgaGFuZGxlci5cbiAgICAgICAgLy8gVGhlIHNlY29uZCBpcyB3aGVuIGFuIG9ic2VydmFibGUgdmFsdWUgZm9yIGEgc3BlY2lmaWMgYXJyYXkgZW50cnkgaXMgdXBkYXRlZC5cbiAgICAgICAgLy8gb2xkT3B0aW9ucyB3aWxsIGJlIGVtcHR5IGluIHRoZSBmaXJzdCBjYXNlLCBidXQgd2lsbCBiZSBmaWxsZWQgd2l0aCB0aGUgcHJldmlvdXNseSBnZW5lcmF0ZWQgb3B0aW9uIGluIHRoZSBzZWNvbmQuXG4gICAgICAgIHZhciBpdGVtVXBkYXRlID0gZmFsc2U7XG4gICAgICAgIGZ1bmN0aW9uIG9wdGlvbkZvckFycmF5SXRlbShhcnJheUVudHJ5LCBpbmRleCwgb2xkT3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKG9sZE9wdGlvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgcHJldmlvdXNTZWxlY3RlZFZhbHVlcyA9ICF2YWx1ZUFsbG93VW5zZXQgJiYgb2xkT3B0aW9uc1swXS5zZWxlY3RlZCA/IFsga28uc2VsZWN0RXh0ZW5zaW9ucy5yZWFkVmFsdWUob2xkT3B0aW9uc1swXSkgXSA6IFtdO1xuICAgICAgICAgICAgICAgIGl0ZW1VcGRhdGUgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdmFyIG9wdGlvbiA9IGVsZW1lbnQub3duZXJEb2N1bWVudC5jcmVhdGVFbGVtZW50KFwib3B0aW9uXCIpO1xuICAgICAgICAgICAgaWYgKGFycmF5RW50cnkgPT09IGNhcHRpb25QbGFjZWhvbGRlcikge1xuICAgICAgICAgICAgICAgIGtvLnV0aWxzLnNldFRleHRDb250ZW50KG9wdGlvbiwgYWxsQmluZGluZ3MuZ2V0KCdvcHRpb25zQ2FwdGlvbicpKTtcbiAgICAgICAgICAgICAgICBrby5zZWxlY3RFeHRlbnNpb25zLndyaXRlVmFsdWUob3B0aW9uLCB1bmRlZmluZWQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBBcHBseSBhIHZhbHVlIHRvIHRoZSBvcHRpb24gZWxlbWVudFxuICAgICAgICAgICAgICAgIHZhciBvcHRpb25WYWx1ZSA9IGFwcGx5VG9PYmplY3QoYXJyYXlFbnRyeSwgYWxsQmluZGluZ3MuZ2V0KCdvcHRpb25zVmFsdWUnKSwgYXJyYXlFbnRyeSk7XG4gICAgICAgICAgICAgICAga28uc2VsZWN0RXh0ZW5zaW9ucy53cml0ZVZhbHVlKG9wdGlvbiwga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZShvcHRpb25WYWx1ZSkpO1xuXG4gICAgICAgICAgICAgICAgLy8gQXBwbHkgc29tZSB0ZXh0IHRvIHRoZSBvcHRpb24gZWxlbWVudFxuICAgICAgICAgICAgICAgIHZhciBvcHRpb25UZXh0ID0gYXBwbHlUb09iamVjdChhcnJheUVudHJ5LCBhbGxCaW5kaW5ncy5nZXQoJ29wdGlvbnNUZXh0JyksIG9wdGlvblZhbHVlKTtcbiAgICAgICAgICAgICAgICBrby51dGlscy5zZXRUZXh0Q29udGVudChvcHRpb24sIG9wdGlvblRleHQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIFtvcHRpb25dO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQnkgdXNpbmcgYSBiZWZvcmVSZW1vdmUgY2FsbGJhY2ssIHdlIGRlbGF5IHRoZSByZW1vdmFsIHVudGlsIGFmdGVyIG5ldyBpdGVtcyBhcmUgYWRkZWQuIFRoaXMgZml4ZXMgYSBzZWxlY3Rpb25cbiAgICAgICAgLy8gcHJvYmxlbSBpbiBJRTw9OCBhbmQgRmlyZWZveC4gU2VlIGh0dHBzOi8vZ2l0aHViLmNvbS9rbm9ja291dC9rbm9ja291dC9pc3N1ZXMvMTIwOFxuICAgICAgICBhcnJheVRvRG9tTm9kZUNoaWxkcmVuT3B0aW9uc1snYmVmb3JlUmVtb3ZlJ10gPVxuICAgICAgICAgICAgZnVuY3Rpb24gKG9wdGlvbikge1xuICAgICAgICAgICAgICAgIGVsZW1lbnQucmVtb3ZlQ2hpbGQob3B0aW9uKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgZnVuY3Rpb24gc2V0U2VsZWN0aW9uQ2FsbGJhY2soYXJyYXlFbnRyeSwgbmV3T3B0aW9ucykge1xuICAgICAgICAgICAgaWYgKGl0ZW1VcGRhdGUgJiYgdmFsdWVBbGxvd1Vuc2V0KSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIG1vZGVsIHZhbHVlIGlzIGF1dGhvcml0YXRpdmUsIHNvIG1ha2Ugc3VyZSBpdHMgdmFsdWUgaXMgdGhlIG9uZSBzZWxlY3RlZFxuICAgICAgICAgICAgICAgIC8vIFRoZXJlIGlzIG5vIG5lZWQgdG8gdXNlIGRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlIHNpbmNlIHNldERvbU5vZGVDaGlsZHJlbkZyb21BcnJheU1hcHBpbmcgZG9lcyBzbyBhbHJlYWR5LlxuICAgICAgICAgICAgICAgIGtvLnNlbGVjdEV4dGVuc2lvbnMud3JpdGVWYWx1ZShlbGVtZW50LCBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKGFsbEJpbmRpbmdzLmdldCgndmFsdWUnKSksIHRydWUgLyogYWxsb3dVbnNldCAqLyk7XG4gICAgICAgICAgICB9IGVsc2UgaWYgKHByZXZpb3VzU2VsZWN0ZWRWYWx1ZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgLy8gSUU2IGRvZXNuJ3QgbGlrZSB1cyB0byBhc3NpZ24gc2VsZWN0aW9uIHRvIE9QVElPTiBub2RlcyBiZWZvcmUgdGhleSdyZSBhZGRlZCB0byB0aGUgZG9jdW1lbnQuXG4gICAgICAgICAgICAgICAgLy8gVGhhdCdzIHdoeSB3ZSBmaXJzdCBhZGRlZCB0aGVtIHdpdGhvdXQgc2VsZWN0aW9uLiBOb3cgaXQncyB0aW1lIHRvIHNldCB0aGUgc2VsZWN0aW9uLlxuICAgICAgICAgICAgICAgIHZhciBpc1NlbGVjdGVkID0ga28udXRpbHMuYXJyYXlJbmRleE9mKHByZXZpb3VzU2VsZWN0ZWRWYWx1ZXMsIGtvLnNlbGVjdEV4dGVuc2lvbnMucmVhZFZhbHVlKG5ld09wdGlvbnNbMF0pKSA+PSAwO1xuICAgICAgICAgICAgICAgIGtvLnV0aWxzLnNldE9wdGlvbk5vZGVTZWxlY3Rpb25TdGF0ZShuZXdPcHRpb25zWzBdLCBpc1NlbGVjdGVkKTtcblxuICAgICAgICAgICAgICAgIC8vIElmIHRoaXMgb3B0aW9uIHdhcyBjaGFuZ2VkIGZyb20gYmVpbmcgc2VsZWN0ZWQgZHVyaW5nIGEgc2luZ2xlLWl0ZW0gdXBkYXRlLCBub3RpZnkgdGhlIGNoYW5nZVxuICAgICAgICAgICAgICAgIGlmIChpdGVtVXBkYXRlICYmICFpc1NlbGVjdGVkKSB7XG4gICAgICAgICAgICAgICAgICAgIGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlKGtvLnV0aWxzLnRyaWdnZXJFdmVudCwgbnVsbCwgW2VsZW1lbnQsIFwiY2hhbmdlXCJdKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgY2FsbGJhY2sgPSBzZXRTZWxlY3Rpb25DYWxsYmFjaztcbiAgICAgICAgaWYgKGFsbEJpbmRpbmdzWydoYXMnXSgnb3B0aW9uc0FmdGVyUmVuZGVyJykgJiYgdHlwZW9mIGFsbEJpbmRpbmdzLmdldCgnb3B0aW9uc0FmdGVyUmVuZGVyJykgPT0gXCJmdW5jdGlvblwiKSB7XG4gICAgICAgICAgICBjYWxsYmFjayA9IGZ1bmN0aW9uKGFycmF5RW50cnksIG5ld09wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICBzZXRTZWxlY3Rpb25DYWxsYmFjayhhcnJheUVudHJ5LCBuZXdPcHRpb25zKTtcbiAgICAgICAgICAgICAgICBrby5kZXBlbmRlbmN5RGV0ZWN0aW9uLmlnbm9yZShhbGxCaW5kaW5ncy5nZXQoJ29wdGlvbnNBZnRlclJlbmRlcicpLCBudWxsLCBbbmV3T3B0aW9uc1swXSwgYXJyYXlFbnRyeSAhPT0gY2FwdGlvblBsYWNlaG9sZGVyID8gYXJyYXlFbnRyeSA6IHVuZGVmaW5lZF0pO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAga28udXRpbHMuc2V0RG9tTm9kZUNoaWxkcmVuRnJvbUFycmF5TWFwcGluZyhlbGVtZW50LCBmaWx0ZXJlZEFycmF5LCBvcHRpb25Gb3JBcnJheUl0ZW0sIGFycmF5VG9Eb21Ob2RlQ2hpbGRyZW5PcHRpb25zLCBjYWxsYmFjayk7XG5cbiAgICAgICAga28uZGVwZW5kZW5jeURldGVjdGlvbi5pZ25vcmUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgaWYgKHZhbHVlQWxsb3dVbnNldCkge1xuICAgICAgICAgICAgICAgIC8vIFRoZSBtb2RlbCB2YWx1ZSBpcyBhdXRob3JpdGF0aXZlLCBzbyBtYWtlIHN1cmUgaXRzIHZhbHVlIGlzIHRoZSBvbmUgc2VsZWN0ZWRcbiAgICAgICAgICAgICAgICBrby5zZWxlY3RFeHRlbnNpb25zLndyaXRlVmFsdWUoZWxlbWVudCwga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZShhbGxCaW5kaW5ncy5nZXQoJ3ZhbHVlJykpLCB0cnVlIC8qIGFsbG93VW5zZXQgKi8pO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBEZXRlcm1pbmUgaWYgdGhlIHNlbGVjdGlvbiBoYXMgY2hhbmdlZCBhcyBhIHJlc3VsdCBvZiB1cGRhdGluZyB0aGUgb3B0aW9ucyBsaXN0XG4gICAgICAgICAgICAgICAgdmFyIHNlbGVjdGlvbkNoYW5nZWQ7XG4gICAgICAgICAgICAgICAgaWYgKG11bHRpcGxlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIEZvciBhIG11bHRpcGxlLXNlbGVjdCBib3gsIGNvbXBhcmUgdGhlIG5ldyBzZWxlY3Rpb24gY291bnQgdG8gdGhlIHByZXZpb3VzIG9uZVxuICAgICAgICAgICAgICAgICAgICAvLyBCdXQgaWYgbm90aGluZyB3YXMgc2VsZWN0ZWQgYmVmb3JlLCB0aGUgc2VsZWN0aW9uIGNhbid0IGhhdmUgY2hhbmdlZFxuICAgICAgICAgICAgICAgICAgICBzZWxlY3Rpb25DaGFuZ2VkID0gcHJldmlvdXNTZWxlY3RlZFZhbHVlcy5sZW5ndGggJiYgc2VsZWN0ZWRPcHRpb25zKCkubGVuZ3RoIDwgcHJldmlvdXNTZWxlY3RlZFZhbHVlcy5sZW5ndGg7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gRm9yIGEgc2luZ2xlLXNlbGVjdCBib3gsIGNvbXBhcmUgdGhlIGN1cnJlbnQgdmFsdWUgdG8gdGhlIHByZXZpb3VzIHZhbHVlXG4gICAgICAgICAgICAgICAgICAgIC8vIEJ1dCBpZiBub3RoaW5nIHdhcyBzZWxlY3RlZCBiZWZvcmUgb3Igbm90aGluZyBpcyBzZWxlY3RlZCBub3csIGp1c3QgbG9vayBmb3IgYSBjaGFuZ2UgaW4gc2VsZWN0aW9uXG4gICAgICAgICAgICAgICAgICAgIHNlbGVjdGlvbkNoYW5nZWQgPSAocHJldmlvdXNTZWxlY3RlZFZhbHVlcy5sZW5ndGggJiYgZWxlbWVudC5zZWxlY3RlZEluZGV4ID49IDApXG4gICAgICAgICAgICAgICAgICAgICAgICA/IChrby5zZWxlY3RFeHRlbnNpb25zLnJlYWRWYWx1ZShlbGVtZW50Lm9wdGlvbnNbZWxlbWVudC5zZWxlY3RlZEluZGV4XSkgIT09IHByZXZpb3VzU2VsZWN0ZWRWYWx1ZXNbMF0pXG4gICAgICAgICAgICAgICAgICAgICAgICA6IChwcmV2aW91c1NlbGVjdGVkVmFsdWVzLmxlbmd0aCB8fCBlbGVtZW50LnNlbGVjdGVkSW5kZXggPj0gMCk7XG4gICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgLy8gRW5zdXJlIGNvbnNpc3RlbmN5IGJldHdlZW4gbW9kZWwgdmFsdWUgYW5kIHNlbGVjdGVkIG9wdGlvbi5cbiAgICAgICAgICAgICAgICAvLyBJZiB0aGUgZHJvcGRvd24gd2FzIGNoYW5nZWQgc28gdGhhdCBzZWxlY3Rpb24gaXMgbm8gbG9uZ2VyIHRoZSBzYW1lLFxuICAgICAgICAgICAgICAgIC8vIG5vdGlmeSB0aGUgdmFsdWUgb3Igc2VsZWN0ZWRPcHRpb25zIGJpbmRpbmcuXG4gICAgICAgICAgICAgICAgaWYgKHNlbGVjdGlvbkNoYW5nZWQpIHtcbiAgICAgICAgICAgICAgICAgICAga28udXRpbHMudHJpZ2dlckV2ZW50KGVsZW1lbnQsIFwiY2hhbmdlXCIpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgLy8gV29ya2Fyb3VuZCBmb3IgSUUgYnVnXG4gICAgICAgIGtvLnV0aWxzLmVuc3VyZVNlbGVjdEVsZW1lbnRJc1JlbmRlcmVkQ29ycmVjdGx5KGVsZW1lbnQpO1xuXG4gICAgICAgIGlmIChwcmV2aW91c1Njcm9sbFRvcCAmJiBNYXRoLmFicyhwcmV2aW91c1Njcm9sbFRvcCAtIGVsZW1lbnQuc2Nyb2xsVG9wKSA+IDIwKVxuICAgICAgICAgICAgZWxlbWVudC5zY3JvbGxUb3AgPSBwcmV2aW91c1Njcm9sbFRvcDtcbiAgICB9XG59O1xua28uYmluZGluZ0hhbmRsZXJzWydvcHRpb25zJ10ub3B0aW9uVmFsdWVEb21EYXRhS2V5ID0ga28udXRpbHMuZG9tRGF0YS5uZXh0S2V5KCk7XG5rby5iaW5kaW5nSGFuZGxlcnNbJ3NlbGVjdGVkT3B0aW9ucyddID0ge1xuICAgICdhZnRlcic6IFsnb3B0aW9ucycsICdmb3JlYWNoJ10sXG4gICAgJ2luaXQnOiBmdW5jdGlvbiAoZWxlbWVudCwgdmFsdWVBY2Nlc3NvciwgYWxsQmluZGluZ3MpIHtcbiAgICAgICAga28udXRpbHMucmVnaXN0ZXJFdmVudEhhbmRsZXIoZWxlbWVudCwgXCJjaGFuZ2VcIiwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHZhbHVlID0gdmFsdWVBY2Nlc3NvcigpLCB2YWx1ZVRvV3JpdGUgPSBbXTtcbiAgICAgICAgICAgIGtvLnV0aWxzLmFycmF5Rm9yRWFjaChlbGVtZW50LmdldEVsZW1lbnRzQnlUYWdOYW1lKFwib3B0aW9uXCIpLCBmdW5jdGlvbihub2RlKSB7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuc2VsZWN0ZWQpXG4gICAgICAgICAgICAgICAgICAgIHZhbHVlVG9Xcml0ZS5wdXNoKGtvLnNlbGVjdEV4dGVuc2lvbnMucmVhZFZhbHVlKG5vZGUpKTtcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAga28uZXhwcmVzc2lvblJld3JpdGluZy53cml0ZVZhbHVlVG9Qcm9wZXJ0eSh2YWx1ZSwgYWxsQmluZGluZ3MsICdzZWxlY3RlZE9wdGlvbnMnLCB2YWx1ZVRvV3JpdGUpO1xuICAgICAgICB9KTtcbiAgICB9LFxuICAgICd1cGRhdGUnOiBmdW5jdGlvbiAoZWxlbWVudCwgdmFsdWVBY2Nlc3Nvcikge1xuICAgICAgICBpZiAoa28udXRpbHMudGFnTmFtZUxvd2VyKGVsZW1lbnQpICE9IFwic2VsZWN0XCIpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ2YWx1ZXMgYmluZGluZyBhcHBsaWVzIG9ubHkgdG8gU0VMRUNUIGVsZW1lbnRzXCIpO1xuXG4gICAgICAgIHZhciBuZXdWYWx1ZSA9IGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUodmFsdWVBY2Nlc3NvcigpKSxcbiAgICAgICAgICAgIHByZXZpb3VzU2Nyb2xsVG9wID0gZWxlbWVudC5zY3JvbGxUb3A7XG5cbiAgICAgICAgaWYgKG5ld1ZhbHVlICYmIHR5cGVvZiBuZXdWYWx1ZS5sZW5ndGggPT0gXCJudW1iZXJcIikge1xuICAgICAgICAgICAga28udXRpbHMuYXJyYXlGb3JFYWNoKGVsZW1lbnQuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJvcHRpb25cIiksIGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgICAgICB2YXIgaXNTZWxlY3RlZCA9IGtvLnV0aWxzLmFycmF5SW5kZXhPZihuZXdWYWx1ZSwga28uc2VsZWN0RXh0ZW5zaW9ucy5yZWFkVmFsdWUobm9kZSkpID49IDA7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGUuc2VsZWN0ZWQgIT0gaXNTZWxlY3RlZCkgeyAgICAgIC8vIFRoaXMgY2hlY2sgcHJldmVudHMgZmxhc2hpbmcgb2YgdGhlIHNlbGVjdCBlbGVtZW50IGluIElFXG4gICAgICAgICAgICAgICAgICAgIGtvLnV0aWxzLnNldE9wdGlvbk5vZGVTZWxlY3Rpb25TdGF0ZShub2RlLCBpc1NlbGVjdGVkKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGVsZW1lbnQuc2Nyb2xsVG9wID0gcHJldmlvdXNTY3JvbGxUb3A7XG4gICAgfVxufTtcbmtvLmV4cHJlc3Npb25SZXdyaXRpbmcudHdvV2F5QmluZGluZ3NbJ3NlbGVjdGVkT3B0aW9ucyddID0gdHJ1ZTtcbmtvLmJpbmRpbmdIYW5kbGVyc1snc3R5bGUnXSA9IHtcbiAgICAndXBkYXRlJzogZnVuY3Rpb24gKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IpIHtcbiAgICAgICAgdmFyIHZhbHVlID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZSh2YWx1ZUFjY2Vzc29yKCkgfHwge30pO1xuICAgICAgICBrby51dGlscy5vYmplY3RGb3JFYWNoKHZhbHVlLCBmdW5jdGlvbihzdHlsZU5hbWUsIHN0eWxlVmFsdWUpIHtcbiAgICAgICAgICAgIHN0eWxlVmFsdWUgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHN0eWxlVmFsdWUpO1xuXG4gICAgICAgICAgICBpZiAoc3R5bGVWYWx1ZSA9PT0gbnVsbCB8fCBzdHlsZVZhbHVlID09PSB1bmRlZmluZWQgfHwgc3R5bGVWYWx1ZSA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAvLyBFbXB0eSBzdHJpbmcgcmVtb3ZlcyB0aGUgdmFsdWUsIHdoZXJlYXMgbnVsbC91bmRlZmluZWQgaGF2ZSBubyBlZmZlY3RcbiAgICAgICAgICAgICAgICBzdHlsZVZhbHVlID0gXCJcIjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZWxlbWVudC5zdHlsZVtzdHlsZU5hbWVdID0gc3R5bGVWYWx1ZTtcbiAgICAgICAgfSk7XG4gICAgfVxufTtcbmtvLmJpbmRpbmdIYW5kbGVyc1snc3VibWl0J10gPSB7XG4gICAgJ2luaXQnOiBmdW5jdGlvbiAoZWxlbWVudCwgdmFsdWVBY2Nlc3NvciwgYWxsQmluZGluZ3MsIHZpZXdNb2RlbCwgYmluZGluZ0NvbnRleHQpIHtcbiAgICAgICAgaWYgKHR5cGVvZiB2YWx1ZUFjY2Vzc29yKCkgIT0gXCJmdW5jdGlvblwiKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGhlIHZhbHVlIGZvciBhIHN1Ym1pdCBiaW5kaW5nIG11c3QgYmUgYSBmdW5jdGlvblwiKTtcbiAgICAgICAga28udXRpbHMucmVnaXN0ZXJFdmVudEhhbmRsZXIoZWxlbWVudCwgXCJzdWJtaXRcIiwgZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgICAgICB2YXIgaGFuZGxlclJldHVyblZhbHVlO1xuICAgICAgICAgICAgdmFyIHZhbHVlID0gdmFsdWVBY2Nlc3NvcigpO1xuICAgICAgICAgICAgdHJ5IHsgaGFuZGxlclJldHVyblZhbHVlID0gdmFsdWUuY2FsbChiaW5kaW5nQ29udGV4dFsnJGRhdGEnXSwgZWxlbWVudCk7IH1cbiAgICAgICAgICAgIGZpbmFsbHkge1xuICAgICAgICAgICAgICAgIGlmIChoYW5kbGVyUmV0dXJuVmFsdWUgIT09IHRydWUpIHsgLy8gTm9ybWFsbHkgd2Ugd2FudCB0byBwcmV2ZW50IGRlZmF1bHQgYWN0aW9uLiBEZXZlbG9wZXIgY2FuIG92ZXJyaWRlIHRoaXMgYmUgZXhwbGljaXRseSByZXR1cm5pbmcgdHJ1ZS5cbiAgICAgICAgICAgICAgICAgICAgaWYgKGV2ZW50LnByZXZlbnREZWZhdWx0KVxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQucHJldmVudERlZmF1bHQoKTtcbiAgICAgICAgICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgICAgICAgICAgZXZlbnQucmV0dXJuVmFsdWUgPSBmYWxzZTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn07XG5rby5iaW5kaW5nSGFuZGxlcnNbJ3RleHQnXSA9IHtcbiAgICAnaW5pdCc6IGZ1bmN0aW9uKCkge1xuICAgICAgICAvLyBQcmV2ZW50IGJpbmRpbmcgb24gdGhlIGR5bmFtaWNhbGx5LWluamVjdGVkIHRleHQgbm9kZSAoYXMgZGV2ZWxvcGVycyBhcmUgdW5saWtlbHkgdG8gZXhwZWN0IHRoYXQsIGFuZCBpdCBoYXMgc2VjdXJpdHkgaW1wbGljYXRpb25zKS5cbiAgICAgICAgLy8gSXQgc2hvdWxkIGFsc28gbWFrZSB0aGluZ3MgZmFzdGVyLCBhcyB3ZSBubyBsb25nZXIgaGF2ZSB0byBjb25zaWRlciB3aGV0aGVyIHRoZSB0ZXh0IG5vZGUgbWlnaHQgYmUgYmluZGFibGUuXG4gICAgICAgIHJldHVybiB7ICdjb250cm9sc0Rlc2NlbmRhbnRCaW5kaW5ncyc6IHRydWUgfTtcbiAgICB9LFxuICAgICd1cGRhdGUnOiBmdW5jdGlvbiAoZWxlbWVudCwgdmFsdWVBY2Nlc3Nvcikge1xuICAgICAgICBrby51dGlscy5zZXRUZXh0Q29udGVudChlbGVtZW50LCB2YWx1ZUFjY2Vzc29yKCkpO1xuICAgIH1cbn07XG5rby52aXJ0dWFsRWxlbWVudHMuYWxsb3dlZEJpbmRpbmdzWyd0ZXh0J10gPSB0cnVlO1xuKGZ1bmN0aW9uICgpIHtcblxuaWYgKHdpbmRvdyAmJiB3aW5kb3cubmF2aWdhdG9yKSB7XG4gICAgdmFyIHBhcnNlVmVyc2lvbiA9IGZ1bmN0aW9uIChtYXRjaGVzKSB7XG4gICAgICAgIGlmIChtYXRjaGVzKSB7XG4gICAgICAgICAgICByZXR1cm4gcGFyc2VGbG9hdChtYXRjaGVzWzFdKTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICAvLyBEZXRlY3QgdmFyaW91cyBicm93c2VyIHZlcnNpb25zIGJlY2F1c2Ugc29tZSBvbGQgdmVyc2lvbnMgZG9uJ3QgZnVsbHkgc3VwcG9ydCB0aGUgJ2lucHV0JyBldmVudFxuICAgIHZhciBvcGVyYVZlcnNpb24gPSB3aW5kb3cub3BlcmEgJiYgd2luZG93Lm9wZXJhLnZlcnNpb24gJiYgcGFyc2VJbnQod2luZG93Lm9wZXJhLnZlcnNpb24oKSksXG4gICAgICAgIHVzZXJBZ2VudCA9IHdpbmRvdy5uYXZpZ2F0b3IudXNlckFnZW50LFxuICAgICAgICBzYWZhcmlWZXJzaW9uID0gcGFyc2VWZXJzaW9uKHVzZXJBZ2VudC5tYXRjaCgvXig/Oig/IWNocm9tZSkuKSp2ZXJzaW9uXFwvKFteIF0qKSBzYWZhcmkvaSkpLFxuICAgICAgICBmaXJlZm94VmVyc2lvbiA9IHBhcnNlVmVyc2lvbih1c2VyQWdlbnQubWF0Y2goL0ZpcmVmb3hcXC8oW14gXSopLykpO1xufVxuXG4vLyBJRSA4IGFuZCA5IGhhdmUgYnVncyB0aGF0IHByZXZlbnQgdGhlIG5vcm1hbCBldmVudHMgZnJvbSBmaXJpbmcgd2hlbiB0aGUgdmFsdWUgY2hhbmdlcy5cbi8vIEJ1dCBpdCBkb2VzIGZpcmUgdGhlICdzZWxlY3Rpb25jaGFuZ2UnIGV2ZW50IG9uIG1hbnkgb2YgdGhvc2UsIHByZXN1bWFibHkgYmVjYXVzZSB0aGVcbi8vIGN1cnNvciBpcyBtb3ZpbmcgYW5kIHRoYXQgY291bnRzIGFzIHRoZSBzZWxlY3Rpb24gY2hhbmdpbmcuIFRoZSAnc2VsZWN0aW9uY2hhbmdlJyBldmVudCBpc1xuLy8gZmlyZWQgYXQgdGhlIGRvY3VtZW50IGxldmVsIG9ubHkgYW5kIGRvZXNuJ3QgZGlyZWN0bHkgaW5kaWNhdGUgd2hpY2ggZWxlbWVudCBjaGFuZ2VkLiBXZVxuLy8gc2V0IHVwIGp1c3Qgb25lIGV2ZW50IGhhbmRsZXIgZm9yIHRoZSBkb2N1bWVudCBhbmQgdXNlICdhY3RpdmVFbGVtZW50JyB0byBkZXRlcm1pbmUgd2hpY2hcbi8vIGVsZW1lbnQgd2FzIGNoYW5nZWQuXG5pZiAoa28udXRpbHMuaWVWZXJzaW9uIDwgMTApIHtcbiAgICB2YXIgc2VsZWN0aW9uQ2hhbmdlUmVnaXN0ZXJlZE5hbWUgPSBrby51dGlscy5kb21EYXRhLm5leHRLZXkoKSxcbiAgICAgICAgc2VsZWN0aW9uQ2hhbmdlSGFuZGxlck5hbWUgPSBrby51dGlscy5kb21EYXRhLm5leHRLZXkoKTtcbiAgICB2YXIgc2VsZWN0aW9uQ2hhbmdlSGFuZGxlciA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIHZhciB0YXJnZXQgPSB0aGlzLmFjdGl2ZUVsZW1lbnQsXG4gICAgICAgICAgICBoYW5kbGVyID0gdGFyZ2V0ICYmIGtvLnV0aWxzLmRvbURhdGEuZ2V0KHRhcmdldCwgc2VsZWN0aW9uQ2hhbmdlSGFuZGxlck5hbWUpO1xuICAgICAgICBpZiAoaGFuZGxlcikge1xuICAgICAgICAgICAgaGFuZGxlcihldmVudCk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHZhciByZWdpc3RlckZvclNlbGVjdGlvbkNoYW5nZUV2ZW50ID0gZnVuY3Rpb24gKGVsZW1lbnQsIGhhbmRsZXIpIHtcbiAgICAgICAgdmFyIG93bmVyRG9jID0gZWxlbWVudC5vd25lckRvY3VtZW50O1xuICAgICAgICBpZiAoIWtvLnV0aWxzLmRvbURhdGEuZ2V0KG93bmVyRG9jLCBzZWxlY3Rpb25DaGFuZ2VSZWdpc3RlcmVkTmFtZSkpIHtcbiAgICAgICAgICAgIGtvLnV0aWxzLmRvbURhdGEuc2V0KG93bmVyRG9jLCBzZWxlY3Rpb25DaGFuZ2VSZWdpc3RlcmVkTmFtZSwgdHJ1ZSk7XG4gICAgICAgICAgICBrby51dGlscy5yZWdpc3RlckV2ZW50SGFuZGxlcihvd25lckRvYywgJ3NlbGVjdGlvbmNoYW5nZScsIHNlbGVjdGlvbkNoYW5nZUhhbmRsZXIpO1xuICAgICAgICB9XG4gICAgICAgIGtvLnV0aWxzLmRvbURhdGEuc2V0KGVsZW1lbnQsIHNlbGVjdGlvbkNoYW5nZUhhbmRsZXJOYW1lLCBoYW5kbGVyKTtcbiAgICB9O1xufVxuXG5rby5iaW5kaW5nSGFuZGxlcnNbJ3RleHRJbnB1dCddID0ge1xuICAgICdpbml0JzogZnVuY3Rpb24gKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IsIGFsbEJpbmRpbmdzKSB7XG5cbiAgICAgICAgdmFyIHByZXZpb3VzRWxlbWVudFZhbHVlID0gZWxlbWVudC52YWx1ZSxcbiAgICAgICAgICAgIHRpbWVvdXRIYW5kbGUsXG4gICAgICAgICAgICBlbGVtZW50VmFsdWVCZWZvcmVFdmVudDtcblxuICAgICAgICB2YXIgdXBkYXRlTW9kZWwgPSBmdW5jdGlvbiAoZXZlbnQpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0SGFuZGxlKTtcbiAgICAgICAgICAgIGVsZW1lbnRWYWx1ZUJlZm9yZUV2ZW50ID0gdGltZW91dEhhbmRsZSA9IHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgdmFyIGVsZW1lbnRWYWx1ZSA9IGVsZW1lbnQudmFsdWU7XG4gICAgICAgICAgICBpZiAocHJldmlvdXNFbGVtZW50VmFsdWUgIT09IGVsZW1lbnRWYWx1ZSkge1xuICAgICAgICAgICAgICAgIC8vIFByb3ZpZGUgYSB3YXkgZm9yIHRlc3RzIHRvIGtub3cgZXhhY3RseSB3aGljaCBldmVudCB3YXMgcHJvY2Vzc2VkXG4gICAgICAgICAgICAgICAgaWYgKERFQlVHICYmIGV2ZW50KSBlbGVtZW50Wydfa29fdGV4dElucHV0UHJvY2Vzc2VkRXZlbnQnXSA9IGV2ZW50LnR5cGU7XG4gICAgICAgICAgICAgICAgcHJldmlvdXNFbGVtZW50VmFsdWUgPSBlbGVtZW50VmFsdWU7XG4gICAgICAgICAgICAgICAga28uZXhwcmVzc2lvblJld3JpdGluZy53cml0ZVZhbHVlVG9Qcm9wZXJ0eSh2YWx1ZUFjY2Vzc29yKCksIGFsbEJpbmRpbmdzLCAndGV4dElucHV0JywgZWxlbWVudFZhbHVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgZGVmZXJVcGRhdGVNb2RlbCA9IGZ1bmN0aW9uIChldmVudCkge1xuICAgICAgICAgICAgaWYgKCF0aW1lb3V0SGFuZGxlKSB7XG4gICAgICAgICAgICAgICAgLy8gVGhlIGVsZW1lbnRWYWx1ZUJlZm9yZUV2ZW50IHZhcmlhYmxlIGlzIHNldCAqb25seSogZHVyaW5nIHRoZSBicmllZiBnYXAgYmV0d2VlbiBhblxuICAgICAgICAgICAgICAgIC8vIGV2ZW50IGZpcmluZyBhbmQgdGhlIHVwZGF0ZU1vZGVsIGZ1bmN0aW9uIHJ1bm5pbmcuIFRoaXMgYWxsb3dzIHVzIHRvIGlnbm9yZSBtb2RlbFxuICAgICAgICAgICAgICAgIC8vIHVwZGF0ZXMgdGhhdCBhcmUgZnJvbSB0aGUgcHJldmlvdXMgc3RhdGUgb2YgdGhlIGVsZW1lbnQsIHVzdWFsbHkgZHVlIHRvIHRlY2huaXF1ZXNcbiAgICAgICAgICAgICAgICAvLyBzdWNoIGFzIHJhdGVMaW1pdC4gU3VjaCB1cGRhdGVzLCBpZiBub3QgaWdub3JlZCwgY2FuIGNhdXNlIGtleXN0cm9rZXMgdG8gYmUgbG9zdC5cbiAgICAgICAgICAgICAgICBlbGVtZW50VmFsdWVCZWZvcmVFdmVudCA9IGVsZW1lbnQudmFsdWU7XG4gICAgICAgICAgICAgICAgdmFyIGhhbmRsZXIgPSBERUJVRyA/IHVwZGF0ZU1vZGVsLmJpbmQoZWxlbWVudCwge3R5cGU6IGV2ZW50LnR5cGV9KSA6IHVwZGF0ZU1vZGVsO1xuICAgICAgICAgICAgICAgIHRpbWVvdXRIYW5kbGUgPSBrby51dGlscy5zZXRUaW1lb3V0KGhhbmRsZXIsIDQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9O1xuXG4gICAgICAgIC8vIElFOSB3aWxsIG1lc3MgdXAgdGhlIERPTSBpZiB5b3UgaGFuZGxlIGV2ZW50cyBzeW5jaHJvbm91c2x5IHdoaWNoIHJlc3VsdHMgaW4gRE9NIGNoYW5nZXMgKHN1Y2ggYXMgb3RoZXIgYmluZGluZ3MpO1xuICAgICAgICAvLyBzbyB3ZSdsbCBtYWtlIHN1cmUgYWxsIHVwZGF0ZXMgYXJlIGFzeW5jaHJvbm91c1xuICAgICAgICB2YXIgaWVVcGRhdGVNb2RlbCA9IGtvLnV0aWxzLmllVmVyc2lvbiA9PSA5ID8gZGVmZXJVcGRhdGVNb2RlbCA6IHVwZGF0ZU1vZGVsO1xuXG4gICAgICAgIHZhciB1cGRhdGVWaWV3ID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIG1vZGVsVmFsdWUgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHZhbHVlQWNjZXNzb3IoKSk7XG5cbiAgICAgICAgICAgIGlmIChtb2RlbFZhbHVlID09PSBudWxsIHx8IG1vZGVsVmFsdWUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgIG1vZGVsVmFsdWUgPSAnJztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYgKGVsZW1lbnRWYWx1ZUJlZm9yZUV2ZW50ICE9PSB1bmRlZmluZWQgJiYgbW9kZWxWYWx1ZSA9PT0gZWxlbWVudFZhbHVlQmVmb3JlRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBrby51dGlscy5zZXRUaW1lb3V0KHVwZGF0ZVZpZXcsIDQpO1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gVXBkYXRlIHRoZSBlbGVtZW50IG9ubHkgaWYgdGhlIGVsZW1lbnQgYW5kIG1vZGVsIGFyZSBkaWZmZXJlbnQuIE9uIHNvbWUgYnJvd3NlcnMsIHVwZGF0aW5nIHRoZSB2YWx1ZVxuICAgICAgICAgICAgLy8gd2lsbCBtb3ZlIHRoZSBjdXJzb3IgdG8gdGhlIGVuZCBvZiB0aGUgaW5wdXQsIHdoaWNoIHdvdWxkIGJlIGJhZCB3aGlsZSB0aGUgdXNlciBpcyB0eXBpbmcuXG4gICAgICAgICAgICBpZiAoZWxlbWVudC52YWx1ZSAhPT0gbW9kZWxWYWx1ZSkge1xuICAgICAgICAgICAgICAgIHByZXZpb3VzRWxlbWVudFZhbHVlID0gbW9kZWxWYWx1ZTsgIC8vIE1ha2Ugc3VyZSB3ZSBpZ25vcmUgZXZlbnRzIChwcm9wZXJ0eWNoYW5nZSkgdGhhdCByZXN1bHQgZnJvbSB1cGRhdGluZyB0aGUgdmFsdWVcbiAgICAgICAgICAgICAgICBlbGVtZW50LnZhbHVlID0gbW9kZWxWYWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfTtcblxuICAgICAgICB2YXIgb25FdmVudCA9IGZ1bmN0aW9uIChldmVudCwgaGFuZGxlcikge1xuICAgICAgICAgICAga28udXRpbHMucmVnaXN0ZXJFdmVudEhhbmRsZXIoZWxlbWVudCwgZXZlbnQsIGhhbmRsZXIpO1xuICAgICAgICB9O1xuXG4gICAgICAgIGlmIChERUJVRyAmJiBrby5iaW5kaW5nSGFuZGxlcnNbJ3RleHRJbnB1dCddWydfZm9yY2VVcGRhdGVPbiddKSB7XG4gICAgICAgICAgICAvLyBQcm92aWRlIGEgd2F5IGZvciB0ZXN0cyB0byBzcGVjaWZ5IGV4YWN0bHkgd2hpY2ggZXZlbnRzIGFyZSBib3VuZFxuICAgICAgICAgICAga28udXRpbHMuYXJyYXlGb3JFYWNoKGtvLmJpbmRpbmdIYW5kbGVyc1sndGV4dElucHV0J11bJ19mb3JjZVVwZGF0ZU9uJ10sIGZ1bmN0aW9uKGV2ZW50TmFtZSkge1xuICAgICAgICAgICAgICAgIGlmIChldmVudE5hbWUuc2xpY2UoMCw1KSA9PSAnYWZ0ZXInKSB7XG4gICAgICAgICAgICAgICAgICAgIG9uRXZlbnQoZXZlbnROYW1lLnNsaWNlKDUpLCBkZWZlclVwZGF0ZU1vZGVsKTtcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBvbkV2ZW50KGV2ZW50TmFtZSwgdXBkYXRlTW9kZWwpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaWYgKGtvLnV0aWxzLmllVmVyc2lvbiA8IDEwKSB7XG4gICAgICAgICAgICAgICAgLy8gSW50ZXJuZXQgRXhwbG9yZXIgPD0gOCBkb2Vzbid0IHN1cHBvcnQgdGhlICdpbnB1dCcgZXZlbnQsIGJ1dCBkb2VzIGluY2x1ZGUgJ3Byb3BlcnR5Y2hhbmdlJyB0aGF0IGZpcmVzIHdoZW5ldmVyXG4gICAgICAgICAgICAgICAgLy8gYW55IHByb3BlcnR5IG9mIGFuIGVsZW1lbnQgY2hhbmdlcy4gVW5saWtlICdpbnB1dCcsIGl0IGFsc28gZmlyZXMgaWYgYSBwcm9wZXJ0eSBpcyBjaGFuZ2VkIGZyb20gSmF2YVNjcmlwdCBjb2RlLFxuICAgICAgICAgICAgICAgIC8vIGJ1dCB0aGF0J3MgYW4gYWNjZXB0YWJsZSBjb21wcm9taXNlIGZvciB0aGlzIGJpbmRpbmcuIElFIDkgZG9lcyBzdXBwb3J0ICdpbnB1dCcsIGJ1dCBzaW5jZSBpdCBkb2Vzbid0IGZpcmUgaXRcbiAgICAgICAgICAgICAgICAvLyB3aGVuIHVzaW5nIGF1dG9jb21wbGV0ZSwgd2UnbGwgdXNlICdwcm9wZXJ0eWNoYW5nZScgZm9yIGl0IGFsc28uXG4gICAgICAgICAgICAgICAgb25FdmVudCgncHJvcGVydHljaGFuZ2UnLCBmdW5jdGlvbihldmVudCkge1xuICAgICAgICAgICAgICAgICAgICBpZiAoZXZlbnQucHJvcGVydHlOYW1lID09PSAndmFsdWUnKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZVVwZGF0ZU1vZGVsKGV2ZW50KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgaWYgKGtvLnV0aWxzLmllVmVyc2lvbiA9PSA4KSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIElFIDggaGFzIGEgYnVnIHdoZXJlIGl0IGZhaWxzIHRvIGZpcmUgJ3Byb3BlcnR5Y2hhbmdlJyBvbiB0aGUgZmlyc3QgdXBkYXRlIGZvbGxvd2luZyBhIHZhbHVlIGNoYW5nZSBmcm9tXG4gICAgICAgICAgICAgICAgICAgIC8vIEphdmFTY3JpcHQgY29kZS4gSXQgYWxzbyBkb2Vzbid0IGZpcmUgaWYgeW91IGNsZWFyIHRoZSBlbnRpcmUgdmFsdWUuIFRvIGZpeCB0aGlzLCB3ZSBiaW5kIHRvIHRoZSBmb2xsb3dpbmdcbiAgICAgICAgICAgICAgICAgICAgLy8gZXZlbnRzIHRvby5cbiAgICAgICAgICAgICAgICAgICAgb25FdmVudCgna2V5dXAnLCB1cGRhdGVNb2RlbCk7ICAgICAgLy8gQSBzaW5nbGUga2V5c3Rva2VcbiAgICAgICAgICAgICAgICAgICAgb25FdmVudCgna2V5ZG93bicsIHVwZGF0ZU1vZGVsKTsgICAgLy8gVGhlIGZpcnN0IGNoYXJhY3RlciB3aGVuIGEga2V5IGlzIGhlbGQgZG93blxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBpZiAoa28udXRpbHMuaWVWZXJzaW9uID49IDgpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gSW50ZXJuZXQgRXhwbG9yZXIgOSBkb2Vzbid0IGZpcmUgdGhlICdpbnB1dCcgZXZlbnQgd2hlbiBkZWxldGluZyB0ZXh0LCBpbmNsdWRpbmcgdXNpbmdcbiAgICAgICAgICAgICAgICAgICAgLy8gdGhlIGJhY2tzcGFjZSwgZGVsZXRlLCBvciBjdHJsLXgga2V5cywgY2xpY2tpbmcgdGhlICd4JyB0byBjbGVhciB0aGUgaW5wdXQsIGRyYWdnaW5nIHRleHRcbiAgICAgICAgICAgICAgICAgICAgLy8gb3V0IG9mIHRoZSBmaWVsZCwgYW5kIGN1dHRpbmcgb3IgZGVsZXRpbmcgdGV4dCB1c2luZyB0aGUgY29udGV4dCBtZW51LiAnc2VsZWN0aW9uY2hhbmdlJ1xuICAgICAgICAgICAgICAgICAgICAvLyBjYW4gZGV0ZWN0IGFsbCBvZiB0aG9zZSBleGNlcHQgZHJhZ2dpbmcgdGV4dCBvdXQgb2YgdGhlIGZpZWxkLCBmb3Igd2hpY2ggd2UgdXNlICdkcmFnZW5kJy5cbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlc2UgYXJlIGFsc28gbmVlZGVkIGluIElFOCBiZWNhdXNlIG9mIHRoZSBidWcgZGVzY3JpYmVkIGFib3ZlLlxuICAgICAgICAgICAgICAgICAgICByZWdpc3RlckZvclNlbGVjdGlvbkNoYW5nZUV2ZW50KGVsZW1lbnQsIGllVXBkYXRlTW9kZWwpOyAgLy8gJ3NlbGVjdGlvbmNoYW5nZScgY292ZXJzIGN1dCwgcGFzdGUsIGRyb3AsIGRlbGV0ZSwgZXRjLlxuICAgICAgICAgICAgICAgICAgICBvbkV2ZW50KCdkcmFnZW5kJywgZGVmZXJVcGRhdGVNb2RlbCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBBbGwgb3RoZXIgc3VwcG9ydGVkIGJyb3dzZXJzIHN1cHBvcnQgdGhlICdpbnB1dCcgZXZlbnQsIHdoaWNoIGZpcmVzIHdoZW5ldmVyIHRoZSBjb250ZW50IG9mIHRoZSBlbGVtZW50IGlzIGNoYW5nZWRcbiAgICAgICAgICAgICAgICAvLyB0aHJvdWdoIHRoZSB1c2VyIGludGVyZmFjZS5cbiAgICAgICAgICAgICAgICBvbkV2ZW50KCdpbnB1dCcsIHVwZGF0ZU1vZGVsKTtcblxuICAgICAgICAgICAgICAgIGlmIChzYWZhcmlWZXJzaW9uIDwgNSAmJiBrby51dGlscy50YWdOYW1lTG93ZXIoZWxlbWVudCkgPT09IFwidGV4dGFyZWFcIikge1xuICAgICAgICAgICAgICAgICAgICAvLyBTYWZhcmkgPDUgZG9lc24ndCBmaXJlIHRoZSAnaW5wdXQnIGV2ZW50IGZvciA8dGV4dGFyZWE+IGVsZW1lbnRzIChpdCBkb2VzIGZpcmUgJ3RleHRJbnB1dCdcbiAgICAgICAgICAgICAgICAgICAgLy8gYnV0IG9ubHkgd2hlbiB0eXBpbmcpLiBTbyB3ZSdsbCBqdXN0IGNhdGNoIGFzIG11Y2ggYXMgd2UgY2FuIHdpdGgga2V5ZG93biwgY3V0LCBhbmQgcGFzdGUuXG4gICAgICAgICAgICAgICAgICAgIG9uRXZlbnQoJ2tleWRvd24nLCBkZWZlclVwZGF0ZU1vZGVsKTtcbiAgICAgICAgICAgICAgICAgICAgb25FdmVudCgncGFzdGUnLCBkZWZlclVwZGF0ZU1vZGVsKTtcbiAgICAgICAgICAgICAgICAgICAgb25FdmVudCgnY3V0JywgZGVmZXJVcGRhdGVNb2RlbCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChvcGVyYVZlcnNpb24gPCAxMSkge1xuICAgICAgICAgICAgICAgICAgICAvLyBPcGVyYSAxMCBkb2Vzbid0IGFsd2F5cyBmaXJlIHRoZSAnaW5wdXQnIGV2ZW50IGZvciBjdXQsIHBhc3RlLCB1bmRvICYgZHJvcCBvcGVyYXRpb25zLlxuICAgICAgICAgICAgICAgICAgICAvLyBXZSBjYW4gdHJ5IHRvIGNhdGNoIHNvbWUgb2YgdGhvc2UgdXNpbmcgJ2tleWRvd24nLlxuICAgICAgICAgICAgICAgICAgICBvbkV2ZW50KCdrZXlkb3duJywgZGVmZXJVcGRhdGVNb2RlbCk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIGlmIChmaXJlZm94VmVyc2lvbiA8IDQuMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBGaXJlZm94IDw9IDMuNiBkb2Vzbid0IGZpcmUgdGhlICdpbnB1dCcgZXZlbnQgd2hlbiB0ZXh0IGlzIGZpbGxlZCBpbiB0aHJvdWdoIGF1dG9jb21wbGV0ZVxuICAgICAgICAgICAgICAgICAgICBvbkV2ZW50KCdET01BdXRvQ29tcGxldGUnLCB1cGRhdGVNb2RlbCk7XG5cbiAgICAgICAgICAgICAgICAgICAgLy8gRmlyZWZveCA8PTMuNSBkb2Vzbid0IGZpcmUgdGhlICdpbnB1dCcgZXZlbnQgd2hlbiB0ZXh0IGlzIGRyb3BwZWQgaW50byB0aGUgaW5wdXQuXG4gICAgICAgICAgICAgICAgICAgIG9uRXZlbnQoJ2RyYWdkcm9wJywgdXBkYXRlTW9kZWwpOyAgICAgICAvLyA8My41XG4gICAgICAgICAgICAgICAgICAgIG9uRXZlbnQoJ2Ryb3AnLCB1cGRhdGVNb2RlbCk7ICAgICAgICAgICAvLyAzLjVcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICAvLyBCaW5kIHRvIHRoZSBjaGFuZ2UgZXZlbnQgc28gdGhhdCB3ZSBjYW4gY2F0Y2ggcHJvZ3JhbW1hdGljIHVwZGF0ZXMgb2YgdGhlIHZhbHVlIHRoYXQgZmlyZSB0aGlzIGV2ZW50LlxuICAgICAgICBvbkV2ZW50KCdjaGFuZ2UnLCB1cGRhdGVNb2RlbCk7XG5cbiAgICAgICAga28uY29tcHV0ZWQodXBkYXRlVmlldywgbnVsbCwgeyBkaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQ6IGVsZW1lbnQgfSk7XG4gICAgfVxufTtcbmtvLmV4cHJlc3Npb25SZXdyaXRpbmcudHdvV2F5QmluZGluZ3NbJ3RleHRJbnB1dCddID0gdHJ1ZTtcblxuLy8gdGV4dGlucHV0IGlzIGFuIGFsaWFzIGZvciB0ZXh0SW5wdXRcbmtvLmJpbmRpbmdIYW5kbGVyc1sndGV4dGlucHV0J10gPSB7XG4gICAgLy8gcHJlcHJvY2VzcyBpcyB0aGUgb25seSB3YXkgdG8gc2V0IHVwIGEgZnVsbCBhbGlhc1xuICAgICdwcmVwcm9jZXNzJzogZnVuY3Rpb24gKHZhbHVlLCBuYW1lLCBhZGRCaW5kaW5nKSB7XG4gICAgICAgIGFkZEJpbmRpbmcoJ3RleHRJbnB1dCcsIHZhbHVlKTtcbiAgICB9XG59O1xuXG59KSgpO2tvLmJpbmRpbmdIYW5kbGVyc1sndW5pcXVlTmFtZSddID0ge1xuICAgICdpbml0JzogZnVuY3Rpb24gKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IpIHtcbiAgICAgICAgaWYgKHZhbHVlQWNjZXNzb3IoKSkge1xuICAgICAgICAgICAgdmFyIG5hbWUgPSBcImtvX3VuaXF1ZV9cIiArICgrK2tvLmJpbmRpbmdIYW5kbGVyc1sndW5pcXVlTmFtZSddLmN1cnJlbnRJbmRleCk7XG4gICAgICAgICAgICBrby51dGlscy5zZXRFbGVtZW50TmFtZShlbGVtZW50LCBuYW1lKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5rby5iaW5kaW5nSGFuZGxlcnNbJ3VuaXF1ZU5hbWUnXS5jdXJyZW50SW5kZXggPSAwO1xua28uYmluZGluZ0hhbmRsZXJzWyd2YWx1ZSddID0ge1xuICAgICdhZnRlcic6IFsnb3B0aW9ucycsICdmb3JlYWNoJ10sXG4gICAgJ2luaXQnOiBmdW5jdGlvbiAoZWxlbWVudCwgdmFsdWVBY2Nlc3NvciwgYWxsQmluZGluZ3MpIHtcbiAgICAgICAgLy8gSWYgdGhlIHZhbHVlIGJpbmRpbmcgaXMgcGxhY2VkIG9uIGEgcmFkaW8vY2hlY2tib3gsIHRoZW4ganVzdCBwYXNzIHRocm91Z2ggdG8gY2hlY2tlZFZhbHVlIGFuZCBxdWl0XG4gICAgICAgIGlmIChlbGVtZW50LnRhZ05hbWUudG9Mb3dlckNhc2UoKSA9PSBcImlucHV0XCIgJiYgKGVsZW1lbnQudHlwZSA9PSBcImNoZWNrYm94XCIgfHwgZWxlbWVudC50eXBlID09IFwicmFkaW9cIikpIHtcbiAgICAgICAgICAgIGtvLmFwcGx5QmluZGluZ0FjY2Vzc29yc1RvTm9kZShlbGVtZW50LCB7ICdjaGVja2VkVmFsdWUnOiB2YWx1ZUFjY2Vzc29yIH0pO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQWx3YXlzIGNhdGNoIFwiY2hhbmdlXCIgZXZlbnQ7IHBvc3NpYmx5IG90aGVyIGV2ZW50cyB0b28gaWYgYXNrZWRcbiAgICAgICAgdmFyIGV2ZW50c1RvQ2F0Y2ggPSBbXCJjaGFuZ2VcIl07XG4gICAgICAgIHZhciByZXF1ZXN0ZWRFdmVudHNUb0NhdGNoID0gYWxsQmluZGluZ3MuZ2V0KFwidmFsdWVVcGRhdGVcIik7XG4gICAgICAgIHZhciBwcm9wZXJ0eUNoYW5nZWRGaXJlZCA9IGZhbHNlO1xuICAgICAgICB2YXIgZWxlbWVudFZhbHVlQmVmb3JlRXZlbnQgPSBudWxsO1xuXG4gICAgICAgIGlmIChyZXF1ZXN0ZWRFdmVudHNUb0NhdGNoKSB7XG4gICAgICAgICAgICBpZiAodHlwZW9mIHJlcXVlc3RlZEV2ZW50c1RvQ2F0Y2ggPT0gXCJzdHJpbmdcIikgLy8gQWxsb3cgYm90aCBpbmRpdmlkdWFsIGV2ZW50IG5hbWVzLCBhbmQgYXJyYXlzIG9mIGV2ZW50IG5hbWVzXG4gICAgICAgICAgICAgICAgcmVxdWVzdGVkRXZlbnRzVG9DYXRjaCA9IFtyZXF1ZXN0ZWRFdmVudHNUb0NhdGNoXTtcbiAgICAgICAgICAgIGtvLnV0aWxzLmFycmF5UHVzaEFsbChldmVudHNUb0NhdGNoLCByZXF1ZXN0ZWRFdmVudHNUb0NhdGNoKTtcbiAgICAgICAgICAgIGV2ZW50c1RvQ2F0Y2ggPSBrby51dGlscy5hcnJheUdldERpc3RpbmN0VmFsdWVzKGV2ZW50c1RvQ2F0Y2gpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIHZhbHVlVXBkYXRlSGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgZWxlbWVudFZhbHVlQmVmb3JlRXZlbnQgPSBudWxsO1xuICAgICAgICAgICAgcHJvcGVydHlDaGFuZ2VkRmlyZWQgPSBmYWxzZTtcbiAgICAgICAgICAgIHZhciBtb2RlbFZhbHVlID0gdmFsdWVBY2Nlc3NvcigpO1xuICAgICAgICAgICAgdmFyIGVsZW1lbnRWYWx1ZSA9IGtvLnNlbGVjdEV4dGVuc2lvbnMucmVhZFZhbHVlKGVsZW1lbnQpO1xuICAgICAgICAgICAga28uZXhwcmVzc2lvblJld3JpdGluZy53cml0ZVZhbHVlVG9Qcm9wZXJ0eShtb2RlbFZhbHVlLCBhbGxCaW5kaW5ncywgJ3ZhbHVlJywgZWxlbWVudFZhbHVlKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFdvcmthcm91bmQgZm9yIGh0dHBzOi8vZ2l0aHViLmNvbS9TdGV2ZVNhbmRlcnNvbi9rbm9ja291dC9pc3N1ZXMvMTIyXG4gICAgICAgIC8vIElFIGRvZXNuJ3QgZmlyZSBcImNoYW5nZVwiIGV2ZW50cyBvbiB0ZXh0Ym94ZXMgaWYgdGhlIHVzZXIgc2VsZWN0cyBhIHZhbHVlIGZyb20gaXRzIGF1dG9jb21wbGV0ZSBsaXN0XG4gICAgICAgIHZhciBpZUF1dG9Db21wbGV0ZUhhY2tOZWVkZWQgPSBrby51dGlscy5pZVZlcnNpb24gJiYgZWxlbWVudC50YWdOYW1lLnRvTG93ZXJDYXNlKCkgPT0gXCJpbnB1dFwiICYmIGVsZW1lbnQudHlwZSA9PSBcInRleHRcIlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgJiYgZWxlbWVudC5hdXRvY29tcGxldGUgIT0gXCJvZmZcIiAmJiAoIWVsZW1lbnQuZm9ybSB8fCBlbGVtZW50LmZvcm0uYXV0b2NvbXBsZXRlICE9IFwib2ZmXCIpO1xuICAgICAgICBpZiAoaWVBdXRvQ29tcGxldGVIYWNrTmVlZGVkICYmIGtvLnV0aWxzLmFycmF5SW5kZXhPZihldmVudHNUb0NhdGNoLCBcInByb3BlcnR5Y2hhbmdlXCIpID09IC0xKSB7XG4gICAgICAgICAgICBrby51dGlscy5yZWdpc3RlckV2ZW50SGFuZGxlcihlbGVtZW50LCBcInByb3BlcnR5Y2hhbmdlXCIsIGZ1bmN0aW9uICgpIHsgcHJvcGVydHlDaGFuZ2VkRmlyZWQgPSB0cnVlIH0pO1xuICAgICAgICAgICAga28udXRpbHMucmVnaXN0ZXJFdmVudEhhbmRsZXIoZWxlbWVudCwgXCJmb2N1c1wiLCBmdW5jdGlvbiAoKSB7IHByb3BlcnR5Q2hhbmdlZEZpcmVkID0gZmFsc2UgfSk7XG4gICAgICAgICAgICBrby51dGlscy5yZWdpc3RlckV2ZW50SGFuZGxlcihlbGVtZW50LCBcImJsdXJcIiwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKHByb3BlcnR5Q2hhbmdlZEZpcmVkKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhbHVlVXBkYXRlSGFuZGxlcigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0pO1xuICAgICAgICB9XG5cbiAgICAgICAga28udXRpbHMuYXJyYXlGb3JFYWNoKGV2ZW50c1RvQ2F0Y2gsIGZ1bmN0aW9uKGV2ZW50TmFtZSkge1xuICAgICAgICAgICAgLy8gVGhlIHN5bnRheCBcImFmdGVyPGV2ZW50bmFtZT5cIiBtZWFucyBcInJ1biB0aGUgaGFuZGxlciBhc3luY2hyb25vdXNseSBhZnRlciB0aGUgZXZlbnRcIlxuICAgICAgICAgICAgLy8gVGhpcyBpcyB1c2VmdWwsIGZvciBleGFtcGxlLCB0byBjYXRjaCBcImtleWRvd25cIiBldmVudHMgYWZ0ZXIgdGhlIGJyb3dzZXIgaGFzIHVwZGF0ZWQgdGhlIGNvbnRyb2xcbiAgICAgICAgICAgIC8vIChvdGhlcndpc2UsIGtvLnNlbGVjdEV4dGVuc2lvbnMucmVhZFZhbHVlKHRoaXMpIHdpbGwgcmVjZWl2ZSB0aGUgY29udHJvbCdzIHZhbHVlICpiZWZvcmUqIHRoZSBrZXkgZXZlbnQpXG4gICAgICAgICAgICB2YXIgaGFuZGxlciA9IHZhbHVlVXBkYXRlSGFuZGxlcjtcbiAgICAgICAgICAgIGlmIChrby51dGlscy5zdHJpbmdTdGFydHNXaXRoKGV2ZW50TmFtZSwgXCJhZnRlclwiKSkge1xuICAgICAgICAgICAgICAgIGhhbmRsZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gVGhlIGVsZW1lbnRWYWx1ZUJlZm9yZUV2ZW50IHZhcmlhYmxlIGlzIG5vbi1udWxsICpvbmx5KiBkdXJpbmcgdGhlIGJyaWVmIGdhcCBiZXR3ZWVuXG4gICAgICAgICAgICAgICAgICAgIC8vIGEga2V5WCBldmVudCBmaXJpbmcgYW5kIHRoZSB2YWx1ZVVwZGF0ZUhhbmRsZXIgcnVubmluZywgd2hpY2ggaXMgc2NoZWR1bGVkIHRvIGhhcHBlblxuICAgICAgICAgICAgICAgICAgICAvLyBhdCB0aGUgZWFybGllc3QgYXN5bmNocm9ub3VzIG9wcG9ydHVuaXR5LiBXZSBzdG9yZSB0aGlzIHRlbXBvcmFyeSBpbmZvcm1hdGlvbiBzbyB0aGF0XG4gICAgICAgICAgICAgICAgICAgIC8vIGlmLCBiZXR3ZWVuIGtleVggYW5kIHZhbHVlVXBkYXRlSGFuZGxlciwgdGhlIHVuZGVybHlpbmcgbW9kZWwgdmFsdWUgY2hhbmdlcyBzZXBhcmF0ZWx5LFxuICAgICAgICAgICAgICAgICAgICAvLyB3ZSBjYW4gb3ZlcndyaXRlIHRoYXQgbW9kZWwgdmFsdWUgY2hhbmdlIHdpdGggdGhlIHZhbHVlIHRoZSB1c2VyIGp1c3QgdHlwZWQuIE90aGVyd2lzZSxcbiAgICAgICAgICAgICAgICAgICAgLy8gdGVjaG5pcXVlcyBsaWtlIHJhdGVMaW1pdCBjYW4gdHJpZ2dlciBtb2RlbCBjaGFuZ2VzIGF0IGNyaXRpY2FsIG1vbWVudHMgdGhhdCB3aWxsXG4gICAgICAgICAgICAgICAgICAgIC8vIG92ZXJyaWRlIHRoZSB1c2VyJ3MgaW5wdXRzLCBjYXVzaW5nIGtleXN0cm9rZXMgdG8gYmUgbG9zdC5cbiAgICAgICAgICAgICAgICAgICAgZWxlbWVudFZhbHVlQmVmb3JlRXZlbnQgPSBrby5zZWxlY3RFeHRlbnNpb25zLnJlYWRWYWx1ZShlbGVtZW50KTtcbiAgICAgICAgICAgICAgICAgICAga28udXRpbHMuc2V0VGltZW91dCh2YWx1ZVVwZGF0ZUhhbmRsZXIsIDApO1xuICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgZXZlbnROYW1lID0gZXZlbnROYW1lLnN1YnN0cmluZyhcImFmdGVyXCIubGVuZ3RoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGtvLnV0aWxzLnJlZ2lzdGVyRXZlbnRIYW5kbGVyKGVsZW1lbnQsIGV2ZW50TmFtZSwgaGFuZGxlcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHZhciB1cGRhdGVGcm9tTW9kZWwgPSBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgbmV3VmFsdWUgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHZhbHVlQWNjZXNzb3IoKSk7XG4gICAgICAgICAgICB2YXIgZWxlbWVudFZhbHVlID0ga28uc2VsZWN0RXh0ZW5zaW9ucy5yZWFkVmFsdWUoZWxlbWVudCk7XG5cbiAgICAgICAgICAgIGlmIChlbGVtZW50VmFsdWVCZWZvcmVFdmVudCAhPT0gbnVsbCAmJiBuZXdWYWx1ZSA9PT0gZWxlbWVudFZhbHVlQmVmb3JlRXZlbnQpIHtcbiAgICAgICAgICAgICAgICBrby51dGlscy5zZXRUaW1lb3V0KHVwZGF0ZUZyb21Nb2RlbCwgMCk7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB2YXIgdmFsdWVIYXNDaGFuZ2VkID0gKG5ld1ZhbHVlICE9PSBlbGVtZW50VmFsdWUpO1xuXG4gICAgICAgICAgICBpZiAodmFsdWVIYXNDaGFuZ2VkKSB7XG4gICAgICAgICAgICAgICAgaWYgKGtvLnV0aWxzLnRhZ05hbWVMb3dlcihlbGVtZW50KSA9PT0gXCJzZWxlY3RcIikge1xuICAgICAgICAgICAgICAgICAgICB2YXIgYWxsb3dVbnNldCA9IGFsbEJpbmRpbmdzLmdldCgndmFsdWVBbGxvd1Vuc2V0Jyk7XG4gICAgICAgICAgICAgICAgICAgIHZhciBhcHBseVZhbHVlQWN0aW9uID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAga28uc2VsZWN0RXh0ZW5zaW9ucy53cml0ZVZhbHVlKGVsZW1lbnQsIG5ld1ZhbHVlLCBhbGxvd1Vuc2V0KTtcbiAgICAgICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgICAgICAgYXBwbHlWYWx1ZUFjdGlvbigpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmICghYWxsb3dVbnNldCAmJiBuZXdWYWx1ZSAhPT0ga28uc2VsZWN0RXh0ZW5zaW9ucy5yZWFkVmFsdWUoZWxlbWVudCkpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIElmIHlvdSB0cnkgdG8gc2V0IGEgbW9kZWwgdmFsdWUgdGhhdCBjYW4ndCBiZSByZXByZXNlbnRlZCBpbiBhbiBhbHJlYWR5LXBvcHVsYXRlZCBkcm9wZG93biwgcmVqZWN0IHRoYXQgY2hhbmdlLFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gYmVjYXVzZSB5b3UncmUgbm90IGFsbG93ZWQgdG8gaGF2ZSBhIG1vZGVsIHZhbHVlIHRoYXQgZGlzYWdyZWVzIHdpdGggYSB2aXNpYmxlIFVJIHNlbGVjdGlvbi5cbiAgICAgICAgICAgICAgICAgICAgICAgIGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlKGtvLnV0aWxzLnRyaWdnZXJFdmVudCwgbnVsbCwgW2VsZW1lbnQsIFwiY2hhbmdlXCJdKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIFdvcmthcm91bmQgZm9yIElFNiBidWc6IEl0IHdvbid0IHJlbGlhYmx5IGFwcGx5IHZhbHVlcyB0byBTRUxFQ1Qgbm9kZXMgZHVyaW5nIHRoZSBzYW1lIGV4ZWN1dGlvbiB0aHJlYWRcbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIHJpZ2h0IGFmdGVyIHlvdSd2ZSBjaGFuZ2VkIHRoZSBzZXQgb2YgT1BUSU9OIG5vZGVzIG9uIGl0LiBTbyBmb3IgdGhhdCBub2RlIHR5cGUsIHdlJ2xsIHNjaGVkdWxlIGEgc2Vjb25kIHRocmVhZFxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gdG8gYXBwbHkgdGhlIHZhbHVlIGFzIHdlbGwuXG4gICAgICAgICAgICAgICAgICAgICAgICBrby51dGlscy5zZXRUaW1lb3V0KGFwcGx5VmFsdWVBY3Rpb24sIDApO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAga28uc2VsZWN0RXh0ZW5zaW9ucy53cml0ZVZhbHVlKGVsZW1lbnQsIG5ld1ZhbHVlKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH07XG5cbiAgICAgICAga28uY29tcHV0ZWQodXBkYXRlRnJvbU1vZGVsLCBudWxsLCB7IGRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZDogZWxlbWVudCB9KTtcbiAgICB9LFxuICAgICd1cGRhdGUnOiBmdW5jdGlvbigpIHt9IC8vIEtlZXAgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IHdpdGggY29kZSB0aGF0IG1heSBoYXZlIHdyYXBwZWQgdmFsdWUgYmluZGluZ1xufTtcbmtvLmV4cHJlc3Npb25SZXdyaXRpbmcudHdvV2F5QmluZGluZ3NbJ3ZhbHVlJ10gPSB0cnVlO1xua28uYmluZGluZ0hhbmRsZXJzWyd2aXNpYmxlJ10gPSB7XG4gICAgJ3VwZGF0ZSc6IGZ1bmN0aW9uIChlbGVtZW50LCB2YWx1ZUFjY2Vzc29yKSB7XG4gICAgICAgIHZhciB2YWx1ZSA9IGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUodmFsdWVBY2Nlc3NvcigpKTtcbiAgICAgICAgdmFyIGlzQ3VycmVudGx5VmlzaWJsZSA9ICEoZWxlbWVudC5zdHlsZS5kaXNwbGF5ID09IFwibm9uZVwiKTtcbiAgICAgICAgaWYgKHZhbHVlICYmICFpc0N1cnJlbnRseVZpc2libGUpXG4gICAgICAgICAgICBlbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBcIlwiO1xuICAgICAgICBlbHNlIGlmICgoIXZhbHVlKSAmJiBpc0N1cnJlbnRseVZpc2libGUpXG4gICAgICAgICAgICBlbGVtZW50LnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcbiAgICB9XG59O1xuLy8gJ2NsaWNrJyBpcyBqdXN0IGEgc2hvcnRoYW5kIGZvciB0aGUgdXN1YWwgZnVsbC1sZW5ndGggZXZlbnQ6e2NsaWNrOmhhbmRsZXJ9XG5tYWtlRXZlbnRIYW5kbGVyU2hvcnRjdXQoJ2NsaWNrJyk7XG4vLyBJZiB5b3Ugd2FudCB0byBtYWtlIGEgY3VzdG9tIHRlbXBsYXRlIGVuZ2luZSxcbi8vXG4vLyBbMV0gSW5oZXJpdCBmcm9tIHRoaXMgY2xhc3MgKGxpa2Uga28ubmF0aXZlVGVtcGxhdGVFbmdpbmUgZG9lcylcbi8vIFsyXSBPdmVycmlkZSAncmVuZGVyVGVtcGxhdGVTb3VyY2UnLCBzdXBwbHlpbmcgYSBmdW5jdGlvbiB3aXRoIHRoaXMgc2lnbmF0dXJlOlxuLy9cbi8vICAgICAgICBmdW5jdGlvbiAodGVtcGxhdGVTb3VyY2UsIGJpbmRpbmdDb250ZXh0LCBvcHRpb25zKSB7XG4vLyAgICAgICAgICAgIC8vIC0gdGVtcGxhdGVTb3VyY2UudGV4dCgpIGlzIHRoZSB0ZXh0IG9mIHRoZSB0ZW1wbGF0ZSB5b3Ugc2hvdWxkIHJlbmRlclxuLy8gICAgICAgICAgICAvLyAtIGJpbmRpbmdDb250ZXh0LiRkYXRhIGlzIHRoZSBkYXRhIHlvdSBzaG91bGQgcGFzcyBpbnRvIHRoZSB0ZW1wbGF0ZVxuLy8gICAgICAgICAgICAvLyAgIC0geW91IG1pZ2h0IGFsc28gd2FudCB0byBtYWtlIGJpbmRpbmdDb250ZXh0LiRwYXJlbnQsIGJpbmRpbmdDb250ZXh0LiRwYXJlbnRzLFxuLy8gICAgICAgICAgICAvLyAgICAgYW5kIGJpbmRpbmdDb250ZXh0LiRyb290IGF2YWlsYWJsZSBpbiB0aGUgdGVtcGxhdGUgdG9vXG4vLyAgICAgICAgICAgIC8vIC0gb3B0aW9ucyBnaXZlcyB5b3UgYWNjZXNzIHRvIGFueSBvdGhlciBwcm9wZXJ0aWVzIHNldCBvbiBcImRhdGEtYmluZDogeyB0ZW1wbGF0ZTogb3B0aW9ucyB9XCJcbi8vICAgICAgICAgICAgLy8gLSB0ZW1wbGF0ZURvY3VtZW50IGlzIHRoZSBkb2N1bWVudCBvYmplY3Qgb2YgdGhlIHRlbXBsYXRlXG4vLyAgICAgICAgICAgIC8vXG4vLyAgICAgICAgICAgIC8vIFJldHVybiB2YWx1ZTogYW4gYXJyYXkgb2YgRE9NIG5vZGVzXG4vLyAgICAgICAgfVxuLy9cbi8vIFszXSBPdmVycmlkZSAnY3JlYXRlSmF2YVNjcmlwdEV2YWx1YXRvckJsb2NrJywgc3VwcGx5aW5nIGEgZnVuY3Rpb24gd2l0aCB0aGlzIHNpZ25hdHVyZTpcbi8vXG4vLyAgICAgICAgZnVuY3Rpb24gKHNjcmlwdCkge1xuLy8gICAgICAgICAgICAvLyBSZXR1cm4gdmFsdWU6IFdoYXRldmVyIHN5bnRheCBtZWFucyBcIkV2YWx1YXRlIHRoZSBKYXZhU2NyaXB0IHN0YXRlbWVudCAnc2NyaXB0JyBhbmQgb3V0cHV0IHRoZSByZXN1bHRcIlxuLy8gICAgICAgICAgICAvLyAgICAgICAgICAgICAgIEZvciBleGFtcGxlLCB0aGUganF1ZXJ5LnRtcGwgdGVtcGxhdGUgZW5naW5lIGNvbnZlcnRzICdzb21lU2NyaXB0JyB0byAnJHsgc29tZVNjcmlwdCB9J1xuLy8gICAgICAgIH1cbi8vXG4vLyAgICAgVGhpcyBpcyBvbmx5IG5lY2Vzc2FyeSBpZiB5b3Ugd2FudCB0byBhbGxvdyBkYXRhLWJpbmQgYXR0cmlidXRlcyB0byByZWZlcmVuY2UgYXJiaXRyYXJ5IHRlbXBsYXRlIHZhcmlhYmxlcy5cbi8vICAgICBJZiB5b3UgZG9uJ3Qgd2FudCB0byBhbGxvdyB0aGF0LCB5b3UgY2FuIHNldCB0aGUgcHJvcGVydHkgJ2FsbG93VGVtcGxhdGVSZXdyaXRpbmcnIHRvIGZhbHNlIChsaWtlIGtvLm5hdGl2ZVRlbXBsYXRlRW5naW5lIGRvZXMpXG4vLyAgICAgYW5kIHRoZW4geW91IGRvbid0IG5lZWQgdG8gb3ZlcnJpZGUgJ2NyZWF0ZUphdmFTY3JpcHRFdmFsdWF0b3JCbG9jaycuXG5cbmtvLnRlbXBsYXRlRW5naW5lID0gZnVuY3Rpb24gKCkgeyB9O1xuXG5rby50ZW1wbGF0ZUVuZ2luZS5wcm90b3R5cGVbJ3JlbmRlclRlbXBsYXRlU291cmNlJ10gPSBmdW5jdGlvbiAodGVtcGxhdGVTb3VyY2UsIGJpbmRpbmdDb250ZXh0LCBvcHRpb25zLCB0ZW1wbGF0ZURvY3VtZW50KSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFwiT3ZlcnJpZGUgcmVuZGVyVGVtcGxhdGVTb3VyY2VcIik7XG59O1xuXG5rby50ZW1wbGF0ZUVuZ2luZS5wcm90b3R5cGVbJ2NyZWF0ZUphdmFTY3JpcHRFdmFsdWF0b3JCbG9jayddID0gZnVuY3Rpb24gKHNjcmlwdCkge1xuICAgIHRocm93IG5ldyBFcnJvcihcIk92ZXJyaWRlIGNyZWF0ZUphdmFTY3JpcHRFdmFsdWF0b3JCbG9ja1wiKTtcbn07XG5cbmtvLnRlbXBsYXRlRW5naW5lLnByb3RvdHlwZVsnbWFrZVRlbXBsYXRlU291cmNlJ10gPSBmdW5jdGlvbih0ZW1wbGF0ZSwgdGVtcGxhdGVEb2N1bWVudCkge1xuICAgIC8vIE5hbWVkIHRlbXBsYXRlXG4gICAgaWYgKHR5cGVvZiB0ZW1wbGF0ZSA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgIHRlbXBsYXRlRG9jdW1lbnQgPSB0ZW1wbGF0ZURvY3VtZW50IHx8IGRvY3VtZW50O1xuICAgICAgICB2YXIgZWxlbSA9IHRlbXBsYXRlRG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQodGVtcGxhdGUpO1xuICAgICAgICBpZiAoIWVsZW0pXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJDYW5ub3QgZmluZCB0ZW1wbGF0ZSB3aXRoIElEIFwiICsgdGVtcGxhdGUpO1xuICAgICAgICByZXR1cm4gbmV3IGtvLnRlbXBsYXRlU291cmNlcy5kb21FbGVtZW50KGVsZW0pO1xuICAgIH0gZWxzZSBpZiAoKHRlbXBsYXRlLm5vZGVUeXBlID09IDEpIHx8ICh0ZW1wbGF0ZS5ub2RlVHlwZSA9PSA4KSkge1xuICAgICAgICAvLyBBbm9ueW1vdXMgdGVtcGxhdGVcbiAgICAgICAgcmV0dXJuIG5ldyBrby50ZW1wbGF0ZVNvdXJjZXMuYW5vbnltb3VzVGVtcGxhdGUodGVtcGxhdGUpO1xuICAgIH0gZWxzZVxuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJVbmtub3duIHRlbXBsYXRlIHR5cGU6IFwiICsgdGVtcGxhdGUpO1xufTtcblxua28udGVtcGxhdGVFbmdpbmUucHJvdG90eXBlWydyZW5kZXJUZW1wbGF0ZSddID0gZnVuY3Rpb24gKHRlbXBsYXRlLCBiaW5kaW5nQ29udGV4dCwgb3B0aW9ucywgdGVtcGxhdGVEb2N1bWVudCkge1xuICAgIHZhciB0ZW1wbGF0ZVNvdXJjZSA9IHRoaXNbJ21ha2VUZW1wbGF0ZVNvdXJjZSddKHRlbXBsYXRlLCB0ZW1wbGF0ZURvY3VtZW50KTtcbiAgICByZXR1cm4gdGhpc1sncmVuZGVyVGVtcGxhdGVTb3VyY2UnXSh0ZW1wbGF0ZVNvdXJjZSwgYmluZGluZ0NvbnRleHQsIG9wdGlvbnMsIHRlbXBsYXRlRG9jdW1lbnQpO1xufTtcblxua28udGVtcGxhdGVFbmdpbmUucHJvdG90eXBlWydpc1RlbXBsYXRlUmV3cml0dGVuJ10gPSBmdW5jdGlvbiAodGVtcGxhdGUsIHRlbXBsYXRlRG9jdW1lbnQpIHtcbiAgICAvLyBTa2lwIHJld3JpdGluZyBpZiByZXF1ZXN0ZWRcbiAgICBpZiAodGhpc1snYWxsb3dUZW1wbGF0ZVJld3JpdGluZyddID09PSBmYWxzZSlcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgcmV0dXJuIHRoaXNbJ21ha2VUZW1wbGF0ZVNvdXJjZSddKHRlbXBsYXRlLCB0ZW1wbGF0ZURvY3VtZW50KVsnZGF0YSddKFwiaXNSZXdyaXR0ZW5cIik7XG59O1xuXG5rby50ZW1wbGF0ZUVuZ2luZS5wcm90b3R5cGVbJ3Jld3JpdGVUZW1wbGF0ZSddID0gZnVuY3Rpb24gKHRlbXBsYXRlLCByZXdyaXRlckNhbGxiYWNrLCB0ZW1wbGF0ZURvY3VtZW50KSB7XG4gICAgdmFyIHRlbXBsYXRlU291cmNlID0gdGhpc1snbWFrZVRlbXBsYXRlU291cmNlJ10odGVtcGxhdGUsIHRlbXBsYXRlRG9jdW1lbnQpO1xuICAgIHZhciByZXdyaXR0ZW4gPSByZXdyaXRlckNhbGxiYWNrKHRlbXBsYXRlU291cmNlWyd0ZXh0J10oKSk7XG4gICAgdGVtcGxhdGVTb3VyY2VbJ3RleHQnXShyZXdyaXR0ZW4pO1xuICAgIHRlbXBsYXRlU291cmNlWydkYXRhJ10oXCJpc1Jld3JpdHRlblwiLCB0cnVlKTtcbn07XG5cbmtvLmV4cG9ydFN5bWJvbCgndGVtcGxhdGVFbmdpbmUnLCBrby50ZW1wbGF0ZUVuZ2luZSk7XG5cbmtvLnRlbXBsYXRlUmV3cml0aW5nID0gKGZ1bmN0aW9uICgpIHtcbiAgICB2YXIgbWVtb2l6ZURhdGFCaW5kaW5nQXR0cmlidXRlU3ludGF4UmVnZXggPSAvKDwoW2Etel0rXFxkKikoPzpcXHMrKD8hZGF0YS1iaW5kXFxzKj1cXHMqKVthLXowLTlcXC1dKyg/Oj0oPzpcXFwiW15cXFwiXSpcXFwifFxcJ1teXFwnXSpcXCd8W14+XSopKT8pKlxccyspZGF0YS1iaW5kXFxzKj1cXHMqKFtcIiddKShbXFxzXFxTXSo/KVxcMy9naTtcbiAgICB2YXIgbWVtb2l6ZVZpcnR1YWxDb250YWluZXJCaW5kaW5nU3ludGF4UmVnZXggPSAvPCEtLVxccyprb1xcYlxccyooW1xcc1xcU10qPylcXHMqLS0+L2c7XG5cbiAgICBmdW5jdGlvbiB2YWxpZGF0ZURhdGFCaW5kVmFsdWVzRm9yUmV3cml0aW5nKGtleVZhbHVlQXJyYXkpIHtcbiAgICAgICAgdmFyIGFsbFZhbGlkYXRvcnMgPSBrby5leHByZXNzaW9uUmV3cml0aW5nLmJpbmRpbmdSZXdyaXRlVmFsaWRhdG9ycztcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBrZXlWYWx1ZUFycmF5Lmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIga2V5ID0ga2V5VmFsdWVBcnJheVtpXVsna2V5J107XG4gICAgICAgICAgICBpZiAoYWxsVmFsaWRhdG9ycy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgdmFyIHZhbGlkYXRvciA9IGFsbFZhbGlkYXRvcnNba2V5XTtcblxuICAgICAgICAgICAgICAgIGlmICh0eXBlb2YgdmFsaWRhdG9yID09PSBcImZ1bmN0aW9uXCIpIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIHBvc3NpYmxlRXJyb3JNZXNzYWdlID0gdmFsaWRhdG9yKGtleVZhbHVlQXJyYXlbaV1bJ3ZhbHVlJ10pO1xuICAgICAgICAgICAgICAgICAgICBpZiAocG9zc2libGVFcnJvck1lc3NhZ2UpXG4gICAgICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IocG9zc2libGVFcnJvck1lc3NhZ2UpO1xuICAgICAgICAgICAgICAgIH0gZWxzZSBpZiAoIXZhbGlkYXRvcikge1xuICAgICAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJUaGlzIHRlbXBsYXRlIGVuZ2luZSBkb2VzIG5vdCBzdXBwb3J0IHRoZSAnXCIgKyBrZXkgKyBcIicgYmluZGluZyB3aXRoaW4gaXRzIHRlbXBsYXRlc1wiKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICBmdW5jdGlvbiBjb25zdHJ1Y3RNZW1vaXplZFRhZ1JlcGxhY2VtZW50KGRhdGFCaW5kQXR0cmlidXRlVmFsdWUsIHRhZ1RvUmV0YWluLCBub2RlTmFtZSwgdGVtcGxhdGVFbmdpbmUpIHtcbiAgICAgICAgdmFyIGRhdGFCaW5kS2V5VmFsdWVBcnJheSA9IGtvLmV4cHJlc3Npb25SZXdyaXRpbmcucGFyc2VPYmplY3RMaXRlcmFsKGRhdGFCaW5kQXR0cmlidXRlVmFsdWUpO1xuICAgICAgICB2YWxpZGF0ZURhdGFCaW5kVmFsdWVzRm9yUmV3cml0aW5nKGRhdGFCaW5kS2V5VmFsdWVBcnJheSk7XG4gICAgICAgIHZhciByZXdyaXR0ZW5EYXRhQmluZEF0dHJpYnV0ZVZhbHVlID0ga28uZXhwcmVzc2lvblJld3JpdGluZy5wcmVQcm9jZXNzQmluZGluZ3MoZGF0YUJpbmRLZXlWYWx1ZUFycmF5LCB7J3ZhbHVlQWNjZXNzb3JzJzp0cnVlfSk7XG5cbiAgICAgICAgLy8gRm9yIG5vIG9idmlvdXMgcmVhc29uLCBPcGVyYSBmYWlscyB0byBldmFsdWF0ZSByZXdyaXR0ZW5EYXRhQmluZEF0dHJpYnV0ZVZhbHVlIHVubGVzcyBpdCdzIHdyYXBwZWQgaW4gYW4gYWRkaXRpb25hbFxuICAgICAgICAvLyBhbm9ueW1vdXMgZnVuY3Rpb24sIGV2ZW4gdGhvdWdoIE9wZXJhJ3MgYnVpbHQtaW4gZGVidWdnZXIgY2FuIGV2YWx1YXRlIGl0IGFueXdheS4gTm8gb3RoZXIgYnJvd3NlciByZXF1aXJlcyB0aGlzXG4gICAgICAgIC8vIGV4dHJhIGluZGlyZWN0aW9uLlxuICAgICAgICB2YXIgYXBwbHlCaW5kaW5nc1RvTmV4dFNpYmxpbmdTY3JpcHQgPVxuICAgICAgICAgICAgXCJrby5fX3RyX2FtYnRucyhmdW5jdGlvbigkY29udGV4dCwkZWxlbWVudCl7cmV0dXJuKGZ1bmN0aW9uKCl7cmV0dXJueyBcIiArIHJld3JpdHRlbkRhdGFCaW5kQXR0cmlidXRlVmFsdWUgKyBcIiB9IH0pKCl9LCdcIiArIG5vZGVOYW1lLnRvTG93ZXJDYXNlKCkgKyBcIicpXCI7XG4gICAgICAgIHJldHVybiB0ZW1wbGF0ZUVuZ2luZVsnY3JlYXRlSmF2YVNjcmlwdEV2YWx1YXRvckJsb2NrJ10oYXBwbHlCaW5kaW5nc1RvTmV4dFNpYmxpbmdTY3JpcHQpICsgdGFnVG9SZXRhaW47XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgICAgZW5zdXJlVGVtcGxhdGVJc1Jld3JpdHRlbjogZnVuY3Rpb24gKHRlbXBsYXRlLCB0ZW1wbGF0ZUVuZ2luZSwgdGVtcGxhdGVEb2N1bWVudCkge1xuICAgICAgICAgICAgaWYgKCF0ZW1wbGF0ZUVuZ2luZVsnaXNUZW1wbGF0ZVJld3JpdHRlbiddKHRlbXBsYXRlLCB0ZW1wbGF0ZURvY3VtZW50KSlcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZUVuZ2luZVsncmV3cml0ZVRlbXBsYXRlJ10odGVtcGxhdGUsIGZ1bmN0aW9uIChodG1sU3RyaW5nKSB7XG4gICAgICAgICAgICAgICAgICAgIHJldHVybiBrby50ZW1wbGF0ZVJld3JpdGluZy5tZW1vaXplQmluZGluZ0F0dHJpYnV0ZVN5bnRheChodG1sU3RyaW5nLCB0ZW1wbGF0ZUVuZ2luZSk7XG4gICAgICAgICAgICAgICAgfSwgdGVtcGxhdGVEb2N1bWVudCk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgbWVtb2l6ZUJpbmRpbmdBdHRyaWJ1dGVTeW50YXg6IGZ1bmN0aW9uIChodG1sU3RyaW5nLCB0ZW1wbGF0ZUVuZ2luZSkge1xuICAgICAgICAgICAgcmV0dXJuIGh0bWxTdHJpbmcucmVwbGFjZShtZW1vaXplRGF0YUJpbmRpbmdBdHRyaWJ1dGVTeW50YXhSZWdleCwgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBjb25zdHJ1Y3RNZW1vaXplZFRhZ1JlcGxhY2VtZW50KC8qIGRhdGFCaW5kQXR0cmlidXRlVmFsdWU6ICovIGFyZ3VtZW50c1s0XSwgLyogdGFnVG9SZXRhaW46ICovIGFyZ3VtZW50c1sxXSwgLyogbm9kZU5hbWU6ICovIGFyZ3VtZW50c1syXSwgdGVtcGxhdGVFbmdpbmUpO1xuICAgICAgICAgICAgfSkucmVwbGFjZShtZW1vaXplVmlydHVhbENvbnRhaW5lckJpbmRpbmdTeW50YXhSZWdleCwgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGNvbnN0cnVjdE1lbW9pemVkVGFnUmVwbGFjZW1lbnQoLyogZGF0YUJpbmRBdHRyaWJ1dGVWYWx1ZTogKi8gYXJndW1lbnRzWzFdLCAvKiB0YWdUb1JldGFpbjogKi8gXCI8IS0tIGtvIC0tPlwiLCAvKiBub2RlTmFtZTogKi8gXCIjY29tbWVudFwiLCB0ZW1wbGF0ZUVuZ2luZSk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfSxcblxuICAgICAgICBhcHBseU1lbW9pemVkQmluZGluZ3NUb05leHRTaWJsaW5nOiBmdW5jdGlvbiAoYmluZGluZ3MsIG5vZGVOYW1lKSB7XG4gICAgICAgICAgICByZXR1cm4ga28ubWVtb2l6YXRpb24ubWVtb2l6ZShmdW5jdGlvbiAoZG9tTm9kZSwgYmluZGluZ0NvbnRleHQpIHtcbiAgICAgICAgICAgICAgICB2YXIgbm9kZVRvQmluZCA9IGRvbU5vZGUubmV4dFNpYmxpbmc7XG4gICAgICAgICAgICAgICAgaWYgKG5vZGVUb0JpbmQgJiYgbm9kZVRvQmluZC5ub2RlTmFtZS50b0xvd2VyQ2FzZSgpID09PSBub2RlTmFtZSkge1xuICAgICAgICAgICAgICAgICAgICBrby5hcHBseUJpbmRpbmdBY2Nlc3NvcnNUb05vZGUobm9kZVRvQmluZCwgYmluZGluZ3MsIGJpbmRpbmdDb250ZXh0KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH1cbn0pKCk7XG5cblxuLy8gRXhwb3J0ZWQgb25seSBiZWNhdXNlIGl0IGhhcyB0byBiZSByZWZlcmVuY2VkIGJ5IHN0cmluZyBsb29rdXAgZnJvbSB3aXRoaW4gcmV3cml0dGVuIHRlbXBsYXRlXG5rby5leHBvcnRTeW1ib2woJ19fdHJfYW1idG5zJywga28udGVtcGxhdGVSZXdyaXRpbmcuYXBwbHlNZW1vaXplZEJpbmRpbmdzVG9OZXh0U2libGluZyk7XG4oZnVuY3Rpb24oKSB7XG4gICAgLy8gQSB0ZW1wbGF0ZSBzb3VyY2UgcmVwcmVzZW50cyBhIHJlYWQvd3JpdGUgd2F5IG9mIGFjY2Vzc2luZyBhIHRlbXBsYXRlLiBUaGlzIGlzIHRvIGVsaW1pbmF0ZSB0aGUgbmVlZCBmb3IgdGVtcGxhdGUgbG9hZGluZy9zYXZpbmdcbiAgICAvLyBsb2dpYyB0byBiZSBkdXBsaWNhdGVkIGluIGV2ZXJ5IHRlbXBsYXRlIGVuZ2luZSAoYW5kIG1lYW5zIHRoZXkgY2FuIGFsbCB3b3JrIHdpdGggYW5vbnltb3VzIHRlbXBsYXRlcywgZXRjLilcbiAgICAvL1xuICAgIC8vIFR3byBhcmUgcHJvdmlkZWQgYnkgZGVmYXVsdDpcbiAgICAvLyAgMS4ga28udGVtcGxhdGVTb3VyY2VzLmRvbUVsZW1lbnQgICAgICAgLSByZWFkcy93cml0ZXMgdGhlIHRleHQgY29udGVudCBvZiBhbiBhcmJpdHJhcnkgRE9NIGVsZW1lbnRcbiAgICAvLyAgMi4ga28udGVtcGxhdGVTb3VyY2VzLmFub255bW91c0VsZW1lbnQgLSB1c2VzIGtvLnV0aWxzLmRvbURhdGEgdG8gcmVhZC93cml0ZSB0ZXh0ICphc3NvY2lhdGVkKiB3aXRoIHRoZSBET00gZWxlbWVudCwgYnV0XG4gICAgLy8gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgd2l0aG91dCByZWFkaW5nL3dyaXRpbmcgdGhlIGFjdHVhbCBlbGVtZW50IHRleHQgY29udGVudCwgc2luY2UgaXQgd2lsbCBiZSBvdmVyd3JpdHRlblxuICAgIC8vICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHdpdGggdGhlIHJlbmRlcmVkIHRlbXBsYXRlIG91dHB1dC5cbiAgICAvLyBZb3UgY2FuIGltcGxlbWVudCB5b3VyIG93biB0ZW1wbGF0ZSBzb3VyY2UgaWYgeW91IHdhbnQgdG8gZmV0Y2gvc3RvcmUgdGVtcGxhdGVzIHNvbWV3aGVyZSBvdGhlciB0aGFuIGluIERPTSBlbGVtZW50cy5cbiAgICAvLyBUZW1wbGF0ZSBzb3VyY2VzIG5lZWQgdG8gaGF2ZSB0aGUgZm9sbG93aW5nIGZ1bmN0aW9uczpcbiAgICAvLyAgIHRleHQoKSBcdFx0XHQtIHJldHVybnMgdGhlIHRlbXBsYXRlIHRleHQgZnJvbSB5b3VyIHN0b3JhZ2UgbG9jYXRpb25cbiAgICAvLyAgIHRleHQodmFsdWUpXHRcdC0gd3JpdGVzIHRoZSBzdXBwbGllZCB0ZW1wbGF0ZSB0ZXh0IHRvIHlvdXIgc3RvcmFnZSBsb2NhdGlvblxuICAgIC8vICAgZGF0YShrZXkpXHRcdFx0LSByZWFkcyB2YWx1ZXMgc3RvcmVkIHVzaW5nIGRhdGEoa2V5LCB2YWx1ZSkgLSBzZWUgYmVsb3dcbiAgICAvLyAgIGRhdGEoa2V5LCB2YWx1ZSlcdC0gYXNzb2NpYXRlcyBcInZhbHVlXCIgd2l0aCB0aGlzIHRlbXBsYXRlIGFuZCB0aGUga2V5IFwia2V5XCIuIElzIHVzZWQgdG8gc3RvcmUgaW5mb3JtYXRpb24gbGlrZSBcImlzUmV3cml0dGVuXCIuXG4gICAgLy9cbiAgICAvLyBPcHRpb25hbGx5LCB0ZW1wbGF0ZSBzb3VyY2VzIGNhbiBhbHNvIGhhdmUgdGhlIGZvbGxvd2luZyBmdW5jdGlvbnM6XG4gICAgLy8gICBub2RlcygpICAgICAgICAgICAgLSByZXR1cm5zIGEgRE9NIGVsZW1lbnQgY29udGFpbmluZyB0aGUgbm9kZXMgb2YgdGhpcyB0ZW1wbGF0ZSwgd2hlcmUgYXZhaWxhYmxlXG4gICAgLy8gICBub2Rlcyh2YWx1ZSkgICAgICAgLSB3cml0ZXMgdGhlIGdpdmVuIERPTSBlbGVtZW50IHRvIHlvdXIgc3RvcmFnZSBsb2NhdGlvblxuICAgIC8vIElmIGEgRE9NIGVsZW1lbnQgaXMgYXZhaWxhYmxlIGZvciBhIGdpdmVuIHRlbXBsYXRlIHNvdXJjZSwgdGVtcGxhdGUgZW5naW5lcyBhcmUgZW5jb3VyYWdlZCB0byB1c2UgaXQgaW4gcHJlZmVyZW5jZSBvdmVyIHRleHQoKVxuICAgIC8vIGZvciBpbXByb3ZlZCBzcGVlZC4gSG93ZXZlciwgYWxsIHRlbXBsYXRlU291cmNlcyBtdXN0IHN1cHBseSB0ZXh0KCkgZXZlbiBpZiB0aGV5IGRvbid0IHN1cHBseSBub2RlcygpLlxuICAgIC8vXG4gICAgLy8gT25jZSB5b3UndmUgaW1wbGVtZW50ZWQgYSB0ZW1wbGF0ZVNvdXJjZSwgbWFrZSB5b3VyIHRlbXBsYXRlIGVuZ2luZSB1c2UgaXQgYnkgc3ViY2xhc3Npbmcgd2hhdGV2ZXIgdGVtcGxhdGUgZW5naW5lIHlvdSB3ZXJlXG4gICAgLy8gdXNpbmcgYW5kIG92ZXJyaWRpbmcgXCJtYWtlVGVtcGxhdGVTb3VyY2VcIiB0byByZXR1cm4gYW4gaW5zdGFuY2Ugb2YgeW91ciBjdXN0b20gdGVtcGxhdGUgc291cmNlLlxuXG4gICAga28udGVtcGxhdGVTb3VyY2VzID0ge307XG5cbiAgICAvLyAtLS0tIGtvLnRlbXBsYXRlU291cmNlcy5kb21FbGVtZW50IC0tLS0tXG5cbiAgICAvLyB0ZW1wbGF0ZSB0eXBlc1xuICAgIHZhciB0ZW1wbGF0ZVNjcmlwdCA9IDEsXG4gICAgICAgIHRlbXBsYXRlVGV4dEFyZWEgPSAyLFxuICAgICAgICB0ZW1wbGF0ZVRlbXBsYXRlID0gMyxcbiAgICAgICAgdGVtcGxhdGVFbGVtZW50ID0gNDtcblxuICAgIGtvLnRlbXBsYXRlU291cmNlcy5kb21FbGVtZW50ID0gZnVuY3Rpb24oZWxlbWVudCkge1xuICAgICAgICB0aGlzLmRvbUVsZW1lbnQgPSBlbGVtZW50O1xuXG4gICAgICAgIGlmIChlbGVtZW50KSB7XG4gICAgICAgICAgICB2YXIgdGFnTmFtZUxvd2VyID0ga28udXRpbHMudGFnTmFtZUxvd2VyKGVsZW1lbnQpO1xuICAgICAgICAgICAgdGhpcy50ZW1wbGF0ZVR5cGUgPVxuICAgICAgICAgICAgICAgIHRhZ05hbWVMb3dlciA9PT0gXCJzY3JpcHRcIiA/IHRlbXBsYXRlU2NyaXB0IDpcbiAgICAgICAgICAgICAgICB0YWdOYW1lTG93ZXIgPT09IFwidGV4dGFyZWFcIiA/IHRlbXBsYXRlVGV4dEFyZWEgOlxuICAgICAgICAgICAgICAgICAgICAvLyBGb3IgYnJvd3NlcnMgd2l0aCBwcm9wZXIgPHRlbXBsYXRlPiBlbGVtZW50IHN1cHBvcnQsIHdoZXJlIHRoZSAuY29udGVudCBwcm9wZXJ0eSBnaXZlcyBhIGRvY3VtZW50IGZyYWdtZW50XG4gICAgICAgICAgICAgICAgdGFnTmFtZUxvd2VyID09IFwidGVtcGxhdGVcIiAmJiBlbGVtZW50LmNvbnRlbnQgJiYgZWxlbWVudC5jb250ZW50Lm5vZGVUeXBlID09PSAxMSA/IHRlbXBsYXRlVGVtcGxhdGUgOlxuICAgICAgICAgICAgICAgIHRlbXBsYXRlRWxlbWVudDtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGtvLnRlbXBsYXRlU291cmNlcy5kb21FbGVtZW50LnByb3RvdHlwZVsndGV4dCddID0gZnVuY3Rpb24oLyogdmFsdWVUb1dyaXRlICovKSB7XG4gICAgICAgIHZhciBlbGVtQ29udGVudHNQcm9wZXJ0eSA9IHRoaXMudGVtcGxhdGVUeXBlID09PSB0ZW1wbGF0ZVNjcmlwdCA/IFwidGV4dFwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IHRoaXMudGVtcGxhdGVUeXBlID09PSB0ZW1wbGF0ZVRleHRBcmVhID8gXCJ2YWx1ZVwiXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA6IFwiaW5uZXJIVE1MXCI7XG5cbiAgICAgICAgaWYgKGFyZ3VtZW50cy5sZW5ndGggPT0gMCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuZG9tRWxlbWVudFtlbGVtQ29udGVudHNQcm9wZXJ0eV07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB2YXIgdmFsdWVUb1dyaXRlID0gYXJndW1lbnRzWzBdO1xuICAgICAgICAgICAgaWYgKGVsZW1Db250ZW50c1Byb3BlcnR5ID09PSBcImlubmVySFRNTFwiKVxuICAgICAgICAgICAgICAgIGtvLnV0aWxzLnNldEh0bWwodGhpcy5kb21FbGVtZW50LCB2YWx1ZVRvV3JpdGUpO1xuICAgICAgICAgICAgZWxzZVxuICAgICAgICAgICAgICAgIHRoaXMuZG9tRWxlbWVudFtlbGVtQ29udGVudHNQcm9wZXJ0eV0gPSB2YWx1ZVRvV3JpdGU7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIGRhdGFEb21EYXRhUHJlZml4ID0ga28udXRpbHMuZG9tRGF0YS5uZXh0S2V5KCkgKyBcIl9cIjtcbiAgICBrby50ZW1wbGF0ZVNvdXJjZXMuZG9tRWxlbWVudC5wcm90b3R5cGVbJ2RhdGEnXSA9IGZ1bmN0aW9uKGtleSAvKiwgdmFsdWVUb1dyaXRlICovKSB7XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09PSAxKSB7XG4gICAgICAgICAgICByZXR1cm4ga28udXRpbHMuZG9tRGF0YS5nZXQodGhpcy5kb21FbGVtZW50LCBkYXRhRG9tRGF0YVByZWZpeCArIGtleSk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBrby51dGlscy5kb21EYXRhLnNldCh0aGlzLmRvbUVsZW1lbnQsIGRhdGFEb21EYXRhUHJlZml4ICsga2V5LCBhcmd1bWVudHNbMV0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIHZhciB0ZW1wbGF0ZXNEb21EYXRhS2V5ID0ga28udXRpbHMuZG9tRGF0YS5uZXh0S2V5KCk7XG4gICAgZnVuY3Rpb24gZ2V0VGVtcGxhdGVEb21EYXRhKGVsZW1lbnQpIHtcbiAgICAgICAgcmV0dXJuIGtvLnV0aWxzLmRvbURhdGEuZ2V0KGVsZW1lbnQsIHRlbXBsYXRlc0RvbURhdGFLZXkpIHx8IHt9O1xuICAgIH1cbiAgICBmdW5jdGlvbiBzZXRUZW1wbGF0ZURvbURhdGEoZWxlbWVudCwgZGF0YSkge1xuICAgICAgICBrby51dGlscy5kb21EYXRhLnNldChlbGVtZW50LCB0ZW1wbGF0ZXNEb21EYXRhS2V5LCBkYXRhKTtcbiAgICB9XG5cbiAgICBrby50ZW1wbGF0ZVNvdXJjZXMuZG9tRWxlbWVudC5wcm90b3R5cGVbJ25vZGVzJ10gPSBmdW5jdGlvbigvKiB2YWx1ZVRvV3JpdGUgKi8pIHtcbiAgICAgICAgdmFyIGVsZW1lbnQgPSB0aGlzLmRvbUVsZW1lbnQ7XG4gICAgICAgIGlmIChhcmd1bWVudHMubGVuZ3RoID09IDApIHtcbiAgICAgICAgICAgIHZhciB0ZW1wbGF0ZURhdGEgPSBnZXRUZW1wbGF0ZURvbURhdGEoZWxlbWVudCksXG4gICAgICAgICAgICAgICAgY29udGFpbmVyRGF0YSA9IHRlbXBsYXRlRGF0YS5jb250YWluZXJEYXRhO1xuICAgICAgICAgICAgcmV0dXJuIGNvbnRhaW5lckRhdGEgfHwgKFxuICAgICAgICAgICAgICAgIHRoaXMudGVtcGxhdGVUeXBlID09PSB0ZW1wbGF0ZVRlbXBsYXRlID8gZWxlbWVudC5jb250ZW50IDpcbiAgICAgICAgICAgICAgICB0aGlzLnRlbXBsYXRlVHlwZSA9PT0gdGVtcGxhdGVFbGVtZW50ID8gZWxlbWVudCA6XG4gICAgICAgICAgICAgICAgdW5kZWZpbmVkKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZVRvV3JpdGUgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICBzZXRUZW1wbGF0ZURvbURhdGEoZWxlbWVudCwge2NvbnRhaW5lckRhdGE6IHZhbHVlVG9Xcml0ZX0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIC0tLS0ga28udGVtcGxhdGVTb3VyY2VzLmFub255bW91c1RlbXBsYXRlIC0tLS0tXG4gICAgLy8gQW5vbnltb3VzIHRlbXBsYXRlcyBhcmUgbm9ybWFsbHkgc2F2ZWQvcmV0cmlldmVkIGFzIERPTSBub2RlcyB0aHJvdWdoIFwibm9kZXNcIi5cbiAgICAvLyBGb3IgY29tcGF0aWJpbGl0eSwgeW91IGNhbiBhbHNvIHJlYWQgXCJ0ZXh0XCI7IGl0IHdpbGwgYmUgc2VyaWFsaXplZCBmcm9tIHRoZSBub2RlcyBvbiBkZW1hbmQuXG4gICAgLy8gV3JpdGluZyB0byBcInRleHRcIiBpcyBzdGlsbCBzdXBwb3J0ZWQsIGJ1dCB0aGVuIHRoZSB0ZW1wbGF0ZSBkYXRhIHdpbGwgbm90IGJlIGF2YWlsYWJsZSBhcyBET00gbm9kZXMuXG5cbiAgICBrby50ZW1wbGF0ZVNvdXJjZXMuYW5vbnltb3VzVGVtcGxhdGUgPSBmdW5jdGlvbihlbGVtZW50KSB7XG4gICAgICAgIHRoaXMuZG9tRWxlbWVudCA9IGVsZW1lbnQ7XG4gICAgfVxuICAgIGtvLnRlbXBsYXRlU291cmNlcy5hbm9ueW1vdXNUZW1wbGF0ZS5wcm90b3R5cGUgPSBuZXcga28udGVtcGxhdGVTb3VyY2VzLmRvbUVsZW1lbnQoKTtcbiAgICBrby50ZW1wbGF0ZVNvdXJjZXMuYW5vbnltb3VzVGVtcGxhdGUucHJvdG90eXBlLmNvbnN0cnVjdG9yID0ga28udGVtcGxhdGVTb3VyY2VzLmFub255bW91c1RlbXBsYXRlO1xuICAgIGtvLnRlbXBsYXRlU291cmNlcy5hbm9ueW1vdXNUZW1wbGF0ZS5wcm90b3R5cGVbJ3RleHQnXSA9IGZ1bmN0aW9uKC8qIHZhbHVlVG9Xcml0ZSAqLykge1xuICAgICAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB2YXIgdGVtcGxhdGVEYXRhID0gZ2V0VGVtcGxhdGVEb21EYXRhKHRoaXMuZG9tRWxlbWVudCk7XG4gICAgICAgICAgICBpZiAodGVtcGxhdGVEYXRhLnRleHREYXRhID09PSB1bmRlZmluZWQgJiYgdGVtcGxhdGVEYXRhLmNvbnRhaW5lckRhdGEpXG4gICAgICAgICAgICAgICAgdGVtcGxhdGVEYXRhLnRleHREYXRhID0gdGVtcGxhdGVEYXRhLmNvbnRhaW5lckRhdGEuaW5uZXJIVE1MO1xuICAgICAgICAgICAgcmV0dXJuIHRlbXBsYXRlRGF0YS50ZXh0RGF0YTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHZhciB2YWx1ZVRvV3JpdGUgPSBhcmd1bWVudHNbMF07XG4gICAgICAgICAgICBzZXRUZW1wbGF0ZURvbURhdGEodGhpcy5kb21FbGVtZW50LCB7dGV4dERhdGE6IHZhbHVlVG9Xcml0ZX0pO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGtvLmV4cG9ydFN5bWJvbCgndGVtcGxhdGVTb3VyY2VzJywga28udGVtcGxhdGVTb3VyY2VzKTtcbiAgICBrby5leHBvcnRTeW1ib2woJ3RlbXBsYXRlU291cmNlcy5kb21FbGVtZW50Jywga28udGVtcGxhdGVTb3VyY2VzLmRvbUVsZW1lbnQpO1xuICAgIGtvLmV4cG9ydFN5bWJvbCgndGVtcGxhdGVTb3VyY2VzLmFub255bW91c1RlbXBsYXRlJywga28udGVtcGxhdGVTb3VyY2VzLmFub255bW91c1RlbXBsYXRlKTtcbn0pKCk7XG4oZnVuY3Rpb24gKCkge1xuICAgIHZhciBfdGVtcGxhdGVFbmdpbmU7XG4gICAga28uc2V0VGVtcGxhdGVFbmdpbmUgPSBmdW5jdGlvbiAodGVtcGxhdGVFbmdpbmUpIHtcbiAgICAgICAgaWYgKCh0ZW1wbGF0ZUVuZ2luZSAhPSB1bmRlZmluZWQpICYmICEodGVtcGxhdGVFbmdpbmUgaW5zdGFuY2VvZiBrby50ZW1wbGF0ZUVuZ2luZSkpXG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJ0ZW1wbGF0ZUVuZ2luZSBtdXN0IGluaGVyaXQgZnJvbSBrby50ZW1wbGF0ZUVuZ2luZVwiKTtcbiAgICAgICAgX3RlbXBsYXRlRW5naW5lID0gdGVtcGxhdGVFbmdpbmU7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gaW52b2tlRm9yRWFjaE5vZGVJbkNvbnRpbnVvdXNSYW5nZShmaXJzdE5vZGUsIGxhc3ROb2RlLCBhY3Rpb24pIHtcbiAgICAgICAgdmFyIG5vZGUsIG5leHRJblF1ZXVlID0gZmlyc3ROb2RlLCBmaXJzdE91dE9mUmFuZ2VOb2RlID0ga28udmlydHVhbEVsZW1lbnRzLm5leHRTaWJsaW5nKGxhc3ROb2RlKTtcbiAgICAgICAgd2hpbGUgKG5leHRJblF1ZXVlICYmICgobm9kZSA9IG5leHRJblF1ZXVlKSAhPT0gZmlyc3RPdXRPZlJhbmdlTm9kZSkpIHtcbiAgICAgICAgICAgIG5leHRJblF1ZXVlID0ga28udmlydHVhbEVsZW1lbnRzLm5leHRTaWJsaW5nKG5vZGUpO1xuICAgICAgICAgICAgYWN0aW9uKG5vZGUsIG5leHRJblF1ZXVlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGFjdGl2YXRlQmluZGluZ3NPbkNvbnRpbnVvdXNOb2RlQXJyYXkoY29udGludW91c05vZGVBcnJheSwgYmluZGluZ0NvbnRleHQpIHtcbiAgICAgICAgLy8gVG8gYmUgdXNlZCBvbiBhbnkgbm9kZXMgdGhhdCBoYXZlIGJlZW4gcmVuZGVyZWQgYnkgYSB0ZW1wbGF0ZSBhbmQgaGF2ZSBiZWVuIGluc2VydGVkIGludG8gc29tZSBwYXJlbnQgZWxlbWVudFxuICAgICAgICAvLyBXYWxrcyB0aHJvdWdoIGNvbnRpbnVvdXNOb2RlQXJyYXkgKHdoaWNoICptdXN0KiBiZSBjb250aW51b3VzLCBpLmUuLCBhbiB1bmludGVycnVwdGVkIHNlcXVlbmNlIG9mIHNpYmxpbmcgbm9kZXMsIGJlY2F1c2VcbiAgICAgICAgLy8gdGhlIGFsZ29yaXRobSBmb3Igd2Fsa2luZyB0aGVtIHJlbGllcyBvbiB0aGlzKSwgYW5kIGZvciBlYWNoIHRvcC1sZXZlbCBpdGVtIGluIHRoZSB2aXJ0dWFsLWVsZW1lbnQgc2Vuc2UsXG4gICAgICAgIC8vICgxKSBEb2VzIGEgcmVndWxhciBcImFwcGx5QmluZGluZ3NcIiB0byBhc3NvY2lhdGUgYmluZGluZ0NvbnRleHQgd2l0aCB0aGlzIG5vZGUgYW5kIHRvIGFjdGl2YXRlIGFueSBub24tbWVtb2l6ZWQgYmluZGluZ3NcbiAgICAgICAgLy8gKDIpIFVubWVtb2l6ZXMgYW55IG1lbW9zIGluIHRoZSBET00gc3VidHJlZSAoZS5nLiwgdG8gYWN0aXZhdGUgYmluZGluZ3MgdGhhdCBoYWQgYmVlbiBtZW1vaXplZCBkdXJpbmcgdGVtcGxhdGUgcmV3cml0aW5nKVxuXG4gICAgICAgIGlmIChjb250aW51b3VzTm9kZUFycmF5Lmxlbmd0aCkge1xuICAgICAgICAgICAgdmFyIGZpcnN0Tm9kZSA9IGNvbnRpbnVvdXNOb2RlQXJyYXlbMF0sXG4gICAgICAgICAgICAgICAgbGFzdE5vZGUgPSBjb250aW51b3VzTm9kZUFycmF5W2NvbnRpbnVvdXNOb2RlQXJyYXkubGVuZ3RoIC0gMV0sXG4gICAgICAgICAgICAgICAgcGFyZW50Tm9kZSA9IGZpcnN0Tm9kZS5wYXJlbnROb2RlLFxuICAgICAgICAgICAgICAgIHByb3ZpZGVyID0ga28uYmluZGluZ1Byb3ZpZGVyWydpbnN0YW5jZSddLFxuICAgICAgICAgICAgICAgIHByZXByb2Nlc3NOb2RlID0gcHJvdmlkZXJbJ3ByZXByb2Nlc3NOb2RlJ107XG5cbiAgICAgICAgICAgIGlmIChwcmVwcm9jZXNzTm9kZSkge1xuICAgICAgICAgICAgICAgIGludm9rZUZvckVhY2hOb2RlSW5Db250aW51b3VzUmFuZ2UoZmlyc3ROb2RlLCBsYXN0Tm9kZSwgZnVuY3Rpb24obm9kZSwgbmV4dE5vZGVJblJhbmdlKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBub2RlUHJldmlvdXNTaWJsaW5nID0gbm9kZS5wcmV2aW91c1NpYmxpbmc7XG4gICAgICAgICAgICAgICAgICAgIHZhciBuZXdOb2RlcyA9IHByZXByb2Nlc3NOb2RlLmNhbGwocHJvdmlkZXIsIG5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBpZiAobmV3Tm9kZXMpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmIChub2RlID09PSBmaXJzdE5vZGUpXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZmlyc3ROb2RlID0gbmV3Tm9kZXNbMF0gfHwgbmV4dE5vZGVJblJhbmdlO1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG5vZGUgPT09IGxhc3ROb2RlKVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGxhc3ROb2RlID0gbmV3Tm9kZXNbbmV3Tm9kZXMubGVuZ3RoIC0gMV0gfHwgbm9kZVByZXZpb3VzU2libGluZztcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAgICAgLy8gQmVjYXVzZSBwcmVwcm9jZXNzTm9kZSBjYW4gY2hhbmdlIHRoZSBub2RlcywgaW5jbHVkaW5nIHRoZSBmaXJzdCBhbmQgbGFzdCBub2RlcywgdXBkYXRlIGNvbnRpbnVvdXNOb2RlQXJyYXkgdG8gbWF0Y2guXG4gICAgICAgICAgICAgICAgLy8gV2UgbmVlZCB0aGUgZnVsbCBzZXQsIGluY2x1ZGluZyBpbm5lciBub2RlcywgYmVjYXVzZSB0aGUgdW5tZW1vaXplIHN0ZXAgbWlnaHQgcmVtb3ZlIHRoZSBmaXJzdCBub2RlIChhbmQgc28gdGhlIHJlYWxcbiAgICAgICAgICAgICAgICAvLyBmaXJzdCBub2RlIG5lZWRzIHRvIGJlIGluIHRoZSBhcnJheSkuXG4gICAgICAgICAgICAgICAgY29udGludW91c05vZGVBcnJheS5sZW5ndGggPSAwO1xuICAgICAgICAgICAgICAgIGlmICghZmlyc3ROb2RlKSB7IC8vIHByZXByb2Nlc3NOb2RlIG1pZ2h0IGhhdmUgcmVtb3ZlZCBhbGwgdGhlIG5vZGVzLCBpbiB3aGljaCBjYXNlIHRoZXJlJ3Mgbm90aGluZyBsZWZ0IHRvIGRvXG4gICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgaWYgKGZpcnN0Tm9kZSA9PT0gbGFzdE5vZGUpIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludW91c05vZGVBcnJheS5wdXNoKGZpcnN0Tm9kZSk7XG4gICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgY29udGludW91c05vZGVBcnJheS5wdXNoKGZpcnN0Tm9kZSwgbGFzdE5vZGUpO1xuICAgICAgICAgICAgICAgICAgICBrby51dGlscy5maXhVcENvbnRpbnVvdXNOb2RlQXJyYXkoY29udGludW91c05vZGVBcnJheSwgcGFyZW50Tm9kZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBOZWVkIHRvIGFwcGx5QmluZGluZ3MgKmJlZm9yZSogdW5tZW1vemlhdGlvbiwgYmVjYXVzZSB1bm1lbW9pemF0aW9uIG1pZ2h0IGludHJvZHVjZSBleHRyYSBub2RlcyAodGhhdCB3ZSBkb24ndCB3YW50IHRvIHJlLWJpbmQpXG4gICAgICAgICAgICAvLyB3aGVyZWFzIGEgcmVndWxhciBhcHBseUJpbmRpbmdzIHdvbid0IGludHJvZHVjZSBuZXcgbWVtb2l6ZWQgbm9kZXNcbiAgICAgICAgICAgIGludm9rZUZvckVhY2hOb2RlSW5Db250aW51b3VzUmFuZ2UoZmlyc3ROb2RlLCBsYXN0Tm9kZSwgZnVuY3Rpb24obm9kZSkge1xuICAgICAgICAgICAgICAgIGlmIChub2RlLm5vZGVUeXBlID09PSAxIHx8IG5vZGUubm9kZVR5cGUgPT09IDgpXG4gICAgICAgICAgICAgICAgICAgIGtvLmFwcGx5QmluZGluZ3MoYmluZGluZ0NvbnRleHQsIG5vZGUpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBpbnZva2VGb3JFYWNoTm9kZUluQ29udGludW91c1JhbmdlKGZpcnN0Tm9kZSwgbGFzdE5vZGUsIGZ1bmN0aW9uKG5vZGUpIHtcbiAgICAgICAgICAgICAgICBpZiAobm9kZS5ub2RlVHlwZSA9PT0gMSB8fCBub2RlLm5vZGVUeXBlID09PSA4KVxuICAgICAgICAgICAgICAgICAgICBrby5tZW1vaXphdGlvbi51bm1lbW9pemVEb21Ob2RlQW5kRGVzY2VuZGFudHMobm9kZSwgW2JpbmRpbmdDb250ZXh0XSk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICAgICAgLy8gTWFrZSBzdXJlIGFueSBjaGFuZ2VzIGRvbmUgYnkgYXBwbHlCaW5kaW5ncyBvciB1bm1lbW9pemUgYXJlIHJlZmxlY3RlZCBpbiB0aGUgYXJyYXlcbiAgICAgICAgICAgIGtvLnV0aWxzLmZpeFVwQ29udGludW91c05vZGVBcnJheShjb250aW51b3VzTm9kZUFycmF5LCBwYXJlbnROb2RlKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIGZ1bmN0aW9uIGdldEZpcnN0Tm9kZUZyb21Qb3NzaWJsZUFycmF5KG5vZGVPck5vZGVBcnJheSkge1xuICAgICAgICByZXR1cm4gbm9kZU9yTm9kZUFycmF5Lm5vZGVUeXBlID8gbm9kZU9yTm9kZUFycmF5XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgOiBub2RlT3JOb2RlQXJyYXkubGVuZ3RoID4gMCA/IG5vZGVPck5vZGVBcnJheVswXVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIDogbnVsbDtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiBleGVjdXRlVGVtcGxhdGUodGFyZ2V0Tm9kZU9yTm9kZUFycmF5LCByZW5kZXJNb2RlLCB0ZW1wbGF0ZSwgYmluZGluZ0NvbnRleHQsIG9wdGlvbnMpIHtcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIHZhciBmaXJzdFRhcmdldE5vZGUgPSB0YXJnZXROb2RlT3JOb2RlQXJyYXkgJiYgZ2V0Rmlyc3ROb2RlRnJvbVBvc3NpYmxlQXJyYXkodGFyZ2V0Tm9kZU9yTm9kZUFycmF5KTtcbiAgICAgICAgdmFyIHRlbXBsYXRlRG9jdW1lbnQgPSAoZmlyc3RUYXJnZXROb2RlIHx8IHRlbXBsYXRlIHx8IHt9KS5vd25lckRvY3VtZW50O1xuICAgICAgICB2YXIgdGVtcGxhdGVFbmdpbmVUb1VzZSA9IChvcHRpb25zWyd0ZW1wbGF0ZUVuZ2luZSddIHx8IF90ZW1wbGF0ZUVuZ2luZSk7XG4gICAgICAgIGtvLnRlbXBsYXRlUmV3cml0aW5nLmVuc3VyZVRlbXBsYXRlSXNSZXdyaXR0ZW4odGVtcGxhdGUsIHRlbXBsYXRlRW5naW5lVG9Vc2UsIHRlbXBsYXRlRG9jdW1lbnQpO1xuICAgICAgICB2YXIgcmVuZGVyZWROb2Rlc0FycmF5ID0gdGVtcGxhdGVFbmdpbmVUb1VzZVsncmVuZGVyVGVtcGxhdGUnXSh0ZW1wbGF0ZSwgYmluZGluZ0NvbnRleHQsIG9wdGlvbnMsIHRlbXBsYXRlRG9jdW1lbnQpO1xuXG4gICAgICAgIC8vIExvb3NlbHkgY2hlY2sgcmVzdWx0IGlzIGFuIGFycmF5IG9mIERPTSBub2Rlc1xuICAgICAgICBpZiAoKHR5cGVvZiByZW5kZXJlZE5vZGVzQXJyYXkubGVuZ3RoICE9IFwibnVtYmVyXCIpIHx8IChyZW5kZXJlZE5vZGVzQXJyYXkubGVuZ3RoID4gMCAmJiB0eXBlb2YgcmVuZGVyZWROb2Rlc0FycmF5WzBdLm5vZGVUeXBlICE9IFwibnVtYmVyXCIpKVxuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVGVtcGxhdGUgZW5naW5lIG11c3QgcmV0dXJuIGFuIGFycmF5IG9mIERPTSBub2Rlc1wiKTtcblxuICAgICAgICB2YXIgaGF2ZUFkZGVkTm9kZXNUb1BhcmVudCA9IGZhbHNlO1xuICAgICAgICBzd2l0Y2ggKHJlbmRlck1vZGUpIHtcbiAgICAgICAgICAgIGNhc2UgXCJyZXBsYWNlQ2hpbGRyZW5cIjpcbiAgICAgICAgICAgICAgICBrby52aXJ0dWFsRWxlbWVudHMuc2V0RG9tTm9kZUNoaWxkcmVuKHRhcmdldE5vZGVPck5vZGVBcnJheSwgcmVuZGVyZWROb2Rlc0FycmF5KTtcbiAgICAgICAgICAgICAgICBoYXZlQWRkZWROb2Rlc1RvUGFyZW50ID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIGNhc2UgXCJyZXBsYWNlTm9kZVwiOlxuICAgICAgICAgICAgICAgIGtvLnV0aWxzLnJlcGxhY2VEb21Ob2Rlcyh0YXJnZXROb2RlT3JOb2RlQXJyYXksIHJlbmRlcmVkTm9kZXNBcnJheSk7XG4gICAgICAgICAgICAgICAgaGF2ZUFkZGVkTm9kZXNUb1BhcmVudCA9IHRydWU7XG4gICAgICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgICBjYXNlIFwiaWdub3JlVGFyZ2V0Tm9kZVwiOiBicmVhaztcbiAgICAgICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFwiVW5rbm93biByZW5kZXJNb2RlOiBcIiArIHJlbmRlck1vZGUpO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGhhdmVBZGRlZE5vZGVzVG9QYXJlbnQpIHtcbiAgICAgICAgICAgIGFjdGl2YXRlQmluZGluZ3NPbkNvbnRpbnVvdXNOb2RlQXJyYXkocmVuZGVyZWROb2Rlc0FycmF5LCBiaW5kaW5nQ29udGV4dCk7XG4gICAgICAgICAgICBpZiAob3B0aW9uc1snYWZ0ZXJSZW5kZXInXSlcbiAgICAgICAgICAgICAgICBrby5kZXBlbmRlbmN5RGV0ZWN0aW9uLmlnbm9yZShvcHRpb25zWydhZnRlclJlbmRlciddLCBudWxsLCBbcmVuZGVyZWROb2Rlc0FycmF5LCBiaW5kaW5nQ29udGV4dFsnJGRhdGEnXV0pO1xuICAgICAgICB9XG5cbiAgICAgICAgcmV0dXJuIHJlbmRlcmVkTm9kZXNBcnJheTtcbiAgICB9XG5cbiAgICBmdW5jdGlvbiByZXNvbHZlVGVtcGxhdGVOYW1lKHRlbXBsYXRlLCBkYXRhLCBjb250ZXh0KSB7XG4gICAgICAgIC8vIFRoZSB0ZW1wbGF0ZSBjYW4gYmUgc3BlY2lmaWVkIGFzOlxuICAgICAgICBpZiAoa28uaXNPYnNlcnZhYmxlKHRlbXBsYXRlKSkge1xuICAgICAgICAgICAgLy8gMS4gQW4gb2JzZXJ2YWJsZSwgd2l0aCBzdHJpbmcgdmFsdWVcbiAgICAgICAgICAgIHJldHVybiB0ZW1wbGF0ZSgpO1xuICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiB0ZW1wbGF0ZSA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgLy8gMi4gQSBmdW5jdGlvbiBvZiAoZGF0YSwgY29udGV4dCkgcmV0dXJuaW5nIGEgc3RyaW5nXG4gICAgICAgICAgICByZXR1cm4gdGVtcGxhdGUoZGF0YSwgY29udGV4dCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyAzLiBBIHN0cmluZ1xuICAgICAgICAgICAgcmV0dXJuIHRlbXBsYXRlO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAga28ucmVuZGVyVGVtcGxhdGUgPSBmdW5jdGlvbiAodGVtcGxhdGUsIGRhdGFPckJpbmRpbmdDb250ZXh0LCBvcHRpb25zLCB0YXJnZXROb2RlT3JOb2RlQXJyYXksIHJlbmRlck1vZGUpIHtcbiAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgIGlmICgob3B0aW9uc1sndGVtcGxhdGVFbmdpbmUnXSB8fCBfdGVtcGxhdGVFbmdpbmUpID09IHVuZGVmaW5lZClcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcIlNldCBhIHRlbXBsYXRlIGVuZ2luZSBiZWZvcmUgY2FsbGluZyByZW5kZXJUZW1wbGF0ZVwiKTtcbiAgICAgICAgcmVuZGVyTW9kZSA9IHJlbmRlck1vZGUgfHwgXCJyZXBsYWNlQ2hpbGRyZW5cIjtcblxuICAgICAgICBpZiAodGFyZ2V0Tm9kZU9yTm9kZUFycmF5KSB7XG4gICAgICAgICAgICB2YXIgZmlyc3RUYXJnZXROb2RlID0gZ2V0Rmlyc3ROb2RlRnJvbVBvc3NpYmxlQXJyYXkodGFyZ2V0Tm9kZU9yTm9kZUFycmF5KTtcblxuICAgICAgICAgICAgdmFyIHdoZW5Ub0Rpc3Bvc2UgPSBmdW5jdGlvbiAoKSB7IHJldHVybiAoIWZpcnN0VGFyZ2V0Tm9kZSkgfHwgIWtvLnV0aWxzLmRvbU5vZGVJc0F0dGFjaGVkVG9Eb2N1bWVudChmaXJzdFRhcmdldE5vZGUpOyB9OyAvLyBQYXNzaXZlIGRpc3Bvc2FsIChvbiBuZXh0IGV2YWx1YXRpb24pXG4gICAgICAgICAgICB2YXIgYWN0aXZlbHlEaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQgPSAoZmlyc3RUYXJnZXROb2RlICYmIHJlbmRlck1vZGUgPT0gXCJyZXBsYWNlTm9kZVwiKSA/IGZpcnN0VGFyZ2V0Tm9kZS5wYXJlbnROb2RlIDogZmlyc3RUYXJnZXROb2RlO1xuXG4gICAgICAgICAgICByZXR1cm4ga28uZGVwZW5kZW50T2JzZXJ2YWJsZSggLy8gU28gdGhlIERPTSBpcyBhdXRvbWF0aWNhbGx5IHVwZGF0ZWQgd2hlbiBhbnkgZGVwZW5kZW5jeSBjaGFuZ2VzXG4gICAgICAgICAgICAgICAgZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBFbnN1cmUgd2UndmUgZ290IGEgcHJvcGVyIGJpbmRpbmcgY29udGV4dCB0byB3b3JrIHdpdGhcbiAgICAgICAgICAgICAgICAgICAgdmFyIGJpbmRpbmdDb250ZXh0ID0gKGRhdGFPckJpbmRpbmdDb250ZXh0ICYmIChkYXRhT3JCaW5kaW5nQ29udGV4dCBpbnN0YW5jZW9mIGtvLmJpbmRpbmdDb250ZXh0KSlcbiAgICAgICAgICAgICAgICAgICAgICAgID8gZGF0YU9yQmluZGluZ0NvbnRleHRcbiAgICAgICAgICAgICAgICAgICAgICAgIDogbmV3IGtvLmJpbmRpbmdDb250ZXh0KGtvLnV0aWxzLnVud3JhcE9ic2VydmFibGUoZGF0YU9yQmluZGluZ0NvbnRleHQpKTtcblxuICAgICAgICAgICAgICAgICAgICB2YXIgdGVtcGxhdGVOYW1lID0gcmVzb2x2ZVRlbXBsYXRlTmFtZSh0ZW1wbGF0ZSwgYmluZGluZ0NvbnRleHRbJyRkYXRhJ10sIGJpbmRpbmdDb250ZXh0KSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlbmRlcmVkTm9kZXNBcnJheSA9IGV4ZWN1dGVUZW1wbGF0ZSh0YXJnZXROb2RlT3JOb2RlQXJyYXksIHJlbmRlck1vZGUsIHRlbXBsYXRlTmFtZSwgYmluZGluZ0NvbnRleHQsIG9wdGlvbnMpO1xuXG4gICAgICAgICAgICAgICAgICAgIGlmIChyZW5kZXJNb2RlID09IFwicmVwbGFjZU5vZGVcIikge1xuICAgICAgICAgICAgICAgICAgICAgICAgdGFyZ2V0Tm9kZU9yTm9kZUFycmF5ID0gcmVuZGVyZWROb2Rlc0FycmF5O1xuICAgICAgICAgICAgICAgICAgICAgICAgZmlyc3RUYXJnZXROb2RlID0gZ2V0Rmlyc3ROb2RlRnJvbVBvc3NpYmxlQXJyYXkodGFyZ2V0Tm9kZU9yTm9kZUFycmF5KTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgbnVsbCxcbiAgICAgICAgICAgICAgICB7IGRpc3Bvc2VXaGVuOiB3aGVuVG9EaXNwb3NlLCBkaXNwb3NlV2hlbk5vZGVJc1JlbW92ZWQ6IGFjdGl2ZWx5RGlzcG9zZVdoZW5Ob2RlSXNSZW1vdmVkIH1cbiAgICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBXZSBkb24ndCB5ZXQgaGF2ZSBhIERPTSBub2RlIHRvIGV2YWx1YXRlLCBzbyB1c2UgYSBtZW1vIGFuZCByZW5kZXIgdGhlIHRlbXBsYXRlIGxhdGVyIHdoZW4gdGhlcmUgaXMgYSBET00gbm9kZVxuICAgICAgICAgICAgcmV0dXJuIGtvLm1lbW9pemF0aW9uLm1lbW9pemUoZnVuY3Rpb24gKGRvbU5vZGUpIHtcbiAgICAgICAgICAgICAgICBrby5yZW5kZXJUZW1wbGF0ZSh0ZW1wbGF0ZSwgZGF0YU9yQmluZGluZ0NvbnRleHQsIG9wdGlvbnMsIGRvbU5vZGUsIFwicmVwbGFjZU5vZGVcIik7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgIH07XG5cbiAgICBrby5yZW5kZXJUZW1wbGF0ZUZvckVhY2ggPSBmdW5jdGlvbiAodGVtcGxhdGUsIGFycmF5T3JPYnNlcnZhYmxlQXJyYXksIG9wdGlvbnMsIHRhcmdldE5vZGUsIHBhcmVudEJpbmRpbmdDb250ZXh0KSB7XG4gICAgICAgIC8vIFNpbmNlIHNldERvbU5vZGVDaGlsZHJlbkZyb21BcnJheU1hcHBpbmcgYWx3YXlzIGNhbGxzIGV4ZWN1dGVUZW1wbGF0ZUZvckFycmF5SXRlbSBhbmQgdGhlblxuICAgICAgICAvLyBhY3RpdmF0ZUJpbmRpbmdzQ2FsbGJhY2sgZm9yIGFkZGVkIGl0ZW1zLCB3ZSBjYW4gc3RvcmUgdGhlIGJpbmRpbmcgY29udGV4dCBpbiB0aGUgZm9ybWVyIHRvIHVzZSBpbiB0aGUgbGF0dGVyLlxuICAgICAgICB2YXIgYXJyYXlJdGVtQ29udGV4dDtcblxuICAgICAgICAvLyBUaGlzIHdpbGwgYmUgY2FsbGVkIGJ5IHNldERvbU5vZGVDaGlsZHJlbkZyb21BcnJheU1hcHBpbmcgdG8gZ2V0IHRoZSBub2RlcyB0byBhZGQgdG8gdGFyZ2V0Tm9kZVxuICAgICAgICB2YXIgZXhlY3V0ZVRlbXBsYXRlRm9yQXJyYXlJdGVtID0gZnVuY3Rpb24gKGFycmF5VmFsdWUsIGluZGV4KSB7XG4gICAgICAgICAgICAvLyBTdXBwb3J0IHNlbGVjdGluZyB0ZW1wbGF0ZSBhcyBhIGZ1bmN0aW9uIG9mIHRoZSBkYXRhIGJlaW5nIHJlbmRlcmVkXG4gICAgICAgICAgICBhcnJheUl0ZW1Db250ZXh0ID0gcGFyZW50QmluZGluZ0NvbnRleHRbJ2NyZWF0ZUNoaWxkQ29udGV4dCddKGFycmF5VmFsdWUsIG9wdGlvbnNbJ2FzJ10sIGZ1bmN0aW9uKGNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICBjb250ZXh0WyckaW5kZXgnXSA9IGluZGV4O1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgICAgIHZhciB0ZW1wbGF0ZU5hbWUgPSByZXNvbHZlVGVtcGxhdGVOYW1lKHRlbXBsYXRlLCBhcnJheVZhbHVlLCBhcnJheUl0ZW1Db250ZXh0KTtcbiAgICAgICAgICAgIHJldHVybiBleGVjdXRlVGVtcGxhdGUobnVsbCwgXCJpZ25vcmVUYXJnZXROb2RlXCIsIHRlbXBsYXRlTmFtZSwgYXJyYXlJdGVtQ29udGV4dCwgb3B0aW9ucyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBUaGlzIHdpbGwgYmUgY2FsbGVkIHdoZW5ldmVyIHNldERvbU5vZGVDaGlsZHJlbkZyb21BcnJheU1hcHBpbmcgaGFzIGFkZGVkIG5vZGVzIHRvIHRhcmdldE5vZGVcbiAgICAgICAgdmFyIGFjdGl2YXRlQmluZGluZ3NDYWxsYmFjayA9IGZ1bmN0aW9uKGFycmF5VmFsdWUsIGFkZGVkTm9kZXNBcnJheSwgaW5kZXgpIHtcbiAgICAgICAgICAgIGFjdGl2YXRlQmluZGluZ3NPbkNvbnRpbnVvdXNOb2RlQXJyYXkoYWRkZWROb2Rlc0FycmF5LCBhcnJheUl0ZW1Db250ZXh0KTtcbiAgICAgICAgICAgIGlmIChvcHRpb25zWydhZnRlclJlbmRlciddKVxuICAgICAgICAgICAgICAgIG9wdGlvbnNbJ2FmdGVyUmVuZGVyJ10oYWRkZWROb2Rlc0FycmF5LCBhcnJheVZhbHVlKTtcblxuICAgICAgICAgICAgLy8gcmVsZWFzZSB0aGUgXCJjYWNoZVwiIHZhcmlhYmxlLCBzbyB0aGF0IGl0IGNhbiBiZSBjb2xsZWN0ZWQgYnlcbiAgICAgICAgICAgIC8vIHRoZSBHQyB3aGVuIGl0cyB2YWx1ZSBpc24ndCB1c2VkIGZyb20gd2l0aGluIHRoZSBiaW5kaW5ncyBhbnltb3JlLlxuICAgICAgICAgICAgYXJyYXlJdGVtQ29udGV4dCA9IG51bGw7XG4gICAgICAgIH07XG5cbiAgICAgICAgcmV0dXJuIGtvLmRlcGVuZGVudE9ic2VydmFibGUoZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdmFyIHVud3JhcHBlZEFycmF5ID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZShhcnJheU9yT2JzZXJ2YWJsZUFycmF5KSB8fCBbXTtcbiAgICAgICAgICAgIGlmICh0eXBlb2YgdW53cmFwcGVkQXJyYXkubGVuZ3RoID09IFwidW5kZWZpbmVkXCIpIC8vIENvZXJjZSBzaW5nbGUgdmFsdWUgaW50byBhcnJheVxuICAgICAgICAgICAgICAgIHVud3JhcHBlZEFycmF5ID0gW3Vud3JhcHBlZEFycmF5XTtcblxuICAgICAgICAgICAgLy8gRmlsdGVyIG91dCBhbnkgZW50cmllcyBtYXJrZWQgYXMgZGVzdHJveWVkXG4gICAgICAgICAgICB2YXIgZmlsdGVyZWRBcnJheSA9IGtvLnV0aWxzLmFycmF5RmlsdGVyKHVud3JhcHBlZEFycmF5LCBmdW5jdGlvbihpdGVtKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9wdGlvbnNbJ2luY2x1ZGVEZXN0cm95ZWQnXSB8fCBpdGVtID09PSB1bmRlZmluZWQgfHwgaXRlbSA9PT0gbnVsbCB8fCAha28udXRpbHMudW53cmFwT2JzZXJ2YWJsZShpdGVtWydfZGVzdHJveSddKTtcbiAgICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgICAvLyBDYWxsIHNldERvbU5vZGVDaGlsZHJlbkZyb21BcnJheU1hcHBpbmcsIGlnbm9yaW5nIGFueSBvYnNlcnZhYmxlcyB1bndyYXBwZWQgd2l0aGluIChtb3N0IGxpa2VseSBmcm9tIGEgY2FsbGJhY2sgZnVuY3Rpb24pLlxuICAgICAgICAgICAgLy8gSWYgdGhlIGFycmF5IGl0ZW1zIGFyZSBvYnNlcnZhYmxlcywgdGhvdWdoLCB0aGV5IHdpbGwgYmUgdW53cmFwcGVkIGluIGV4ZWN1dGVUZW1wbGF0ZUZvckFycmF5SXRlbSBhbmQgbWFuYWdlZCB3aXRoaW4gc2V0RG9tTm9kZUNoaWxkcmVuRnJvbUFycmF5TWFwcGluZy5cbiAgICAgICAgICAgIGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlKGtvLnV0aWxzLnNldERvbU5vZGVDaGlsZHJlbkZyb21BcnJheU1hcHBpbmcsIG51bGwsIFt0YXJnZXROb2RlLCBmaWx0ZXJlZEFycmF5LCBleGVjdXRlVGVtcGxhdGVGb3JBcnJheUl0ZW0sIG9wdGlvbnMsIGFjdGl2YXRlQmluZGluZ3NDYWxsYmFja10pO1xuXG4gICAgICAgIH0sIG51bGwsIHsgZGlzcG9zZVdoZW5Ob2RlSXNSZW1vdmVkOiB0YXJnZXROb2RlIH0pO1xuICAgIH07XG5cbiAgICB2YXIgdGVtcGxhdGVDb21wdXRlZERvbURhdGFLZXkgPSBrby51dGlscy5kb21EYXRhLm5leHRLZXkoKTtcbiAgICBmdW5jdGlvbiBkaXNwb3NlT2xkQ29tcHV0ZWRBbmRTdG9yZU5ld09uZShlbGVtZW50LCBuZXdDb21wdXRlZCkge1xuICAgICAgICB2YXIgb2xkQ29tcHV0ZWQgPSBrby51dGlscy5kb21EYXRhLmdldChlbGVtZW50LCB0ZW1wbGF0ZUNvbXB1dGVkRG9tRGF0YUtleSk7XG4gICAgICAgIGlmIChvbGRDb21wdXRlZCAmJiAodHlwZW9mKG9sZENvbXB1dGVkLmRpc3Bvc2UpID09ICdmdW5jdGlvbicpKVxuICAgICAgICAgICAgb2xkQ29tcHV0ZWQuZGlzcG9zZSgpO1xuICAgICAgICBrby51dGlscy5kb21EYXRhLnNldChlbGVtZW50LCB0ZW1wbGF0ZUNvbXB1dGVkRG9tRGF0YUtleSwgKG5ld0NvbXB1dGVkICYmIG5ld0NvbXB1dGVkLmlzQWN0aXZlKCkpID8gbmV3Q29tcHV0ZWQgOiB1bmRlZmluZWQpO1xuICAgIH1cblxuICAgIGtvLmJpbmRpbmdIYW5kbGVyc1sndGVtcGxhdGUnXSA9IHtcbiAgICAgICAgJ2luaXQnOiBmdW5jdGlvbihlbGVtZW50LCB2YWx1ZUFjY2Vzc29yKSB7XG4gICAgICAgICAgICAvLyBTdXBwb3J0IGFub255bW91cyB0ZW1wbGF0ZXNcbiAgICAgICAgICAgIHZhciBiaW5kaW5nVmFsdWUgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHZhbHVlQWNjZXNzb3IoKSk7XG4gICAgICAgICAgICBpZiAodHlwZW9mIGJpbmRpbmdWYWx1ZSA9PSBcInN0cmluZ1wiIHx8IGJpbmRpbmdWYWx1ZVsnbmFtZSddKSB7XG4gICAgICAgICAgICAgICAgLy8gSXQncyBhIG5hbWVkIHRlbXBsYXRlIC0gY2xlYXIgdGhlIGVsZW1lbnRcbiAgICAgICAgICAgICAgICBrby52aXJ0dWFsRWxlbWVudHMuZW1wdHlOb2RlKGVsZW1lbnQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICgnbm9kZXMnIGluIGJpbmRpbmdWYWx1ZSkge1xuICAgICAgICAgICAgICAgIC8vIFdlJ3ZlIGJlZW4gZ2l2ZW4gYW4gYXJyYXkgb2YgRE9NIG5vZGVzLiBTYXZlIHRoZW0gYXMgdGhlIHRlbXBsYXRlIHNvdXJjZS5cbiAgICAgICAgICAgICAgICAvLyBUaGVyZSBpcyBubyBrbm93biB1c2UgY2FzZSBmb3IgdGhlIG5vZGUgYXJyYXkgYmVpbmcgYW4gb2JzZXJ2YWJsZSBhcnJheSAoaWYgdGhlIG91dHB1dFxuICAgICAgICAgICAgICAgIC8vIHZhcmllcywgcHV0IHRoYXQgYmVoYXZpb3IgKmludG8qIHlvdXIgdGVtcGxhdGUgLSB0aGF0J3Mgd2hhdCB0ZW1wbGF0ZXMgYXJlIGZvciksIGFuZFxuICAgICAgICAgICAgICAgIC8vIHRoZSBpbXBsZW1lbnRhdGlvbiB3b3VsZCBiZSBhIG1lc3MsIHNvIGFzc2VydCB0aGF0IGl0J3Mgbm90IG9ic2VydmFibGUuXG4gICAgICAgICAgICAgICAgdmFyIG5vZGVzID0gYmluZGluZ1ZhbHVlWydub2RlcyddIHx8IFtdO1xuICAgICAgICAgICAgICAgIGlmIChrby5pc09ic2VydmFibGUobm9kZXMpKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignVGhlIFwibm9kZXNcIiBvcHRpb24gbXVzdCBiZSBhIHBsYWluLCBub24tb2JzZXJ2YWJsZSBhcnJheS4nKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgdmFyIGNvbnRhaW5lciA9IGtvLnV0aWxzLm1vdmVDbGVhbmVkTm9kZXNUb0NvbnRhaW5lckVsZW1lbnQobm9kZXMpOyAvLyBUaGlzIGFsc28gcmVtb3ZlcyB0aGUgbm9kZXMgZnJvbSB0aGVpciBjdXJyZW50IHBhcmVudFxuICAgICAgICAgICAgICAgIG5ldyBrby50ZW1wbGF0ZVNvdXJjZXMuYW5vbnltb3VzVGVtcGxhdGUoZWxlbWVudClbJ25vZGVzJ10oY29udGFpbmVyKTtcbiAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgLy8gSXQncyBhbiBhbm9ueW1vdXMgdGVtcGxhdGUgLSBzdG9yZSB0aGUgZWxlbWVudCBjb250ZW50cywgdGhlbiBjbGVhciB0aGUgZWxlbWVudFxuICAgICAgICAgICAgICAgIHZhciB0ZW1wbGF0ZU5vZGVzID0ga28udmlydHVhbEVsZW1lbnRzLmNoaWxkTm9kZXMoZWxlbWVudCksXG4gICAgICAgICAgICAgICAgICAgIGNvbnRhaW5lciA9IGtvLnV0aWxzLm1vdmVDbGVhbmVkTm9kZXNUb0NvbnRhaW5lckVsZW1lbnQodGVtcGxhdGVOb2Rlcyk7IC8vIFRoaXMgYWxzbyByZW1vdmVzIHRoZSBub2RlcyBmcm9tIHRoZWlyIGN1cnJlbnQgcGFyZW50XG4gICAgICAgICAgICAgICAgbmV3IGtvLnRlbXBsYXRlU291cmNlcy5hbm9ueW1vdXNUZW1wbGF0ZShlbGVtZW50KVsnbm9kZXMnXShjb250YWluZXIpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHsgJ2NvbnRyb2xzRGVzY2VuZGFudEJpbmRpbmdzJzogdHJ1ZSB9O1xuICAgICAgICB9LFxuICAgICAgICAndXBkYXRlJzogZnVuY3Rpb24gKGVsZW1lbnQsIHZhbHVlQWNjZXNzb3IsIGFsbEJpbmRpbmdzLCB2aWV3TW9kZWwsIGJpbmRpbmdDb250ZXh0KSB7XG4gICAgICAgICAgICB2YXIgdmFsdWUgPSB2YWx1ZUFjY2Vzc29yKCksXG4gICAgICAgICAgICAgICAgZGF0YVZhbHVlLFxuICAgICAgICAgICAgICAgIG9wdGlvbnMgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKHZhbHVlKSxcbiAgICAgICAgICAgICAgICBzaG91bGREaXNwbGF5ID0gdHJ1ZSxcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZUNvbXB1dGVkID0gbnVsbCxcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZU5hbWU7XG5cbiAgICAgICAgICAgIGlmICh0eXBlb2Ygb3B0aW9ucyA9PSBcInN0cmluZ1wiKSB7XG4gICAgICAgICAgICAgICAgdGVtcGxhdGVOYW1lID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgb3B0aW9ucyA9IHt9O1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZU5hbWUgPSBvcHRpb25zWyduYW1lJ107XG5cbiAgICAgICAgICAgICAgICAvLyBTdXBwb3J0IFwiaWZcIi9cImlmbm90XCIgY29uZGl0aW9uc1xuICAgICAgICAgICAgICAgIGlmICgnaWYnIGluIG9wdGlvbnMpXG4gICAgICAgICAgICAgICAgICAgIHNob3VsZERpc3BsYXkgPSBrby51dGlscy51bndyYXBPYnNlcnZhYmxlKG9wdGlvbnNbJ2lmJ10pO1xuICAgICAgICAgICAgICAgIGlmIChzaG91bGREaXNwbGF5ICYmICdpZm5vdCcgaW4gb3B0aW9ucylcbiAgICAgICAgICAgICAgICAgICAgc2hvdWxkRGlzcGxheSA9ICFrby51dGlscy51bndyYXBPYnNlcnZhYmxlKG9wdGlvbnNbJ2lmbm90J10pO1xuXG4gICAgICAgICAgICAgICAgZGF0YVZhbHVlID0ga28udXRpbHMudW53cmFwT2JzZXJ2YWJsZShvcHRpb25zWydkYXRhJ10pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoJ2ZvcmVhY2gnIGluIG9wdGlvbnMpIHtcbiAgICAgICAgICAgICAgICAvLyBSZW5kZXIgb25jZSBmb3IgZWFjaCBkYXRhIHBvaW50ICh0cmVhdGluZyBkYXRhIHNldCBhcyBlbXB0eSBpZiBzaG91bGREaXNwbGF5PT1mYWxzZSlcbiAgICAgICAgICAgICAgICB2YXIgZGF0YUFycmF5ID0gKHNob3VsZERpc3BsYXkgJiYgb3B0aW9uc1snZm9yZWFjaCddKSB8fCBbXTtcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZUNvbXB1dGVkID0ga28ucmVuZGVyVGVtcGxhdGVGb3JFYWNoKHRlbXBsYXRlTmFtZSB8fCBlbGVtZW50LCBkYXRhQXJyYXksIG9wdGlvbnMsIGVsZW1lbnQsIGJpbmRpbmdDb250ZXh0KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoIXNob3VsZERpc3BsYXkpIHtcbiAgICAgICAgICAgICAgICBrby52aXJ0dWFsRWxlbWVudHMuZW1wdHlOb2RlKGVsZW1lbnQpO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAvLyBSZW5kZXIgb25jZSBmb3IgdGhpcyBzaW5nbGUgZGF0YSBwb2ludCAob3IgdXNlIHRoZSB2aWV3TW9kZWwgaWYgbm8gZGF0YSB3YXMgcHJvdmlkZWQpXG4gICAgICAgICAgICAgICAgdmFyIGlubmVyQmluZGluZ0NvbnRleHQgPSAoJ2RhdGEnIGluIG9wdGlvbnMpID9cbiAgICAgICAgICAgICAgICAgICAgYmluZGluZ0NvbnRleHRbJ2NyZWF0ZUNoaWxkQ29udGV4dCddKGRhdGFWYWx1ZSwgb3B0aW9uc1snYXMnXSkgOiAgLy8gR2l2ZW4gYW4gZXhwbGl0aXQgJ2RhdGEnIHZhbHVlLCB3ZSBjcmVhdGUgYSBjaGlsZCBiaW5kaW5nIGNvbnRleHQgZm9yIGl0XG4gICAgICAgICAgICAgICAgICAgIGJpbmRpbmdDb250ZXh0OyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgLy8gR2l2ZW4gbm8gZXhwbGljaXQgJ2RhdGEnIHZhbHVlLCB3ZSByZXRhaW4gdGhlIHNhbWUgYmluZGluZyBjb250ZXh0XG4gICAgICAgICAgICAgICAgdGVtcGxhdGVDb21wdXRlZCA9IGtvLnJlbmRlclRlbXBsYXRlKHRlbXBsYXRlTmFtZSB8fCBlbGVtZW50LCBpbm5lckJpbmRpbmdDb250ZXh0LCBvcHRpb25zLCBlbGVtZW50KTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gSXQgb25seSBtYWtlcyBzZW5zZSB0byBoYXZlIGEgc2luZ2xlIHRlbXBsYXRlIGNvbXB1dGVkIHBlciBlbGVtZW50IChvdGhlcndpc2Ugd2hpY2ggb25lIHNob3VsZCBoYXZlIGl0cyBvdXRwdXQgZGlzcGxheWVkPylcbiAgICAgICAgICAgIGRpc3Bvc2VPbGRDb21wdXRlZEFuZFN0b3JlTmV3T25lKGVsZW1lbnQsIHRlbXBsYXRlQ29tcHV0ZWQpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIC8vIEFub255bW91cyB0ZW1wbGF0ZXMgY2FuJ3QgYmUgcmV3cml0dGVuLiBHaXZlIGEgbmljZSBlcnJvciBtZXNzYWdlIGlmIHlvdSB0cnkgdG8gZG8gaXQuXG4gICAga28uZXhwcmVzc2lvblJld3JpdGluZy5iaW5kaW5nUmV3cml0ZVZhbGlkYXRvcnNbJ3RlbXBsYXRlJ10gPSBmdW5jdGlvbihiaW5kaW5nVmFsdWUpIHtcbiAgICAgICAgdmFyIHBhcnNlZEJpbmRpbmdWYWx1ZSA9IGtvLmV4cHJlc3Npb25SZXdyaXRpbmcucGFyc2VPYmplY3RMaXRlcmFsKGJpbmRpbmdWYWx1ZSk7XG5cbiAgICAgICAgaWYgKChwYXJzZWRCaW5kaW5nVmFsdWUubGVuZ3RoID09IDEpICYmIHBhcnNlZEJpbmRpbmdWYWx1ZVswXVsndW5rbm93biddKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7IC8vIEl0IGxvb2tzIGxpa2UgYSBzdHJpbmcgbGl0ZXJhbCwgbm90IGFuIG9iamVjdCBsaXRlcmFsLCBzbyB0cmVhdCBpdCBhcyBhIG5hbWVkIHRlbXBsYXRlICh3aGljaCBpcyBhbGxvd2VkIGZvciByZXdyaXRpbmcpXG5cbiAgICAgICAgaWYgKGtvLmV4cHJlc3Npb25SZXdyaXRpbmcua2V5VmFsdWVBcnJheUNvbnRhaW5zS2V5KHBhcnNlZEJpbmRpbmdWYWx1ZSwgXCJuYW1lXCIpKVxuICAgICAgICAgICAgcmV0dXJuIG51bGw7IC8vIE5hbWVkIHRlbXBsYXRlcyBjYW4gYmUgcmV3cml0dGVuLCBzbyByZXR1cm4gXCJubyBlcnJvclwiXG4gICAgICAgIHJldHVybiBcIlRoaXMgdGVtcGxhdGUgZW5naW5lIGRvZXMgbm90IHN1cHBvcnQgYW5vbnltb3VzIHRlbXBsYXRlcyBuZXN0ZWQgd2l0aGluIGl0cyB0ZW1wbGF0ZXNcIjtcbiAgICB9O1xuXG4gICAga28udmlydHVhbEVsZW1lbnRzLmFsbG93ZWRCaW5kaW5nc1sndGVtcGxhdGUnXSA9IHRydWU7XG59KSgpO1xuXG5rby5leHBvcnRTeW1ib2woJ3NldFRlbXBsYXRlRW5naW5lJywga28uc2V0VGVtcGxhdGVFbmdpbmUpO1xua28uZXhwb3J0U3ltYm9sKCdyZW5kZXJUZW1wbGF0ZScsIGtvLnJlbmRlclRlbXBsYXRlKTtcbi8vIEdvIHRocm91Z2ggdGhlIGl0ZW1zIHRoYXQgaGF2ZSBiZWVuIGFkZGVkIGFuZCBkZWxldGVkIGFuZCB0cnkgdG8gZmluZCBtYXRjaGVzIGJldHdlZW4gdGhlbS5cbmtvLnV0aWxzLmZpbmRNb3Zlc0luQXJyYXlDb21wYXJpc29uID0gZnVuY3Rpb24gKGxlZnQsIHJpZ2h0LCBsaW1pdEZhaWxlZENvbXBhcmVzKSB7XG4gICAgaWYgKGxlZnQubGVuZ3RoICYmIHJpZ2h0Lmxlbmd0aCkge1xuICAgICAgICB2YXIgZmFpbGVkQ29tcGFyZXMsIGwsIHIsIGxlZnRJdGVtLCByaWdodEl0ZW07XG4gICAgICAgIGZvciAoZmFpbGVkQ29tcGFyZXMgPSBsID0gMDsgKCFsaW1pdEZhaWxlZENvbXBhcmVzIHx8IGZhaWxlZENvbXBhcmVzIDwgbGltaXRGYWlsZWRDb21wYXJlcykgJiYgKGxlZnRJdGVtID0gbGVmdFtsXSk7ICsrbCkge1xuICAgICAgICAgICAgZm9yIChyID0gMDsgcmlnaHRJdGVtID0gcmlnaHRbcl07ICsrcikge1xuICAgICAgICAgICAgICAgIGlmIChsZWZ0SXRlbVsndmFsdWUnXSA9PT0gcmlnaHRJdGVtWyd2YWx1ZSddKSB7XG4gICAgICAgICAgICAgICAgICAgIGxlZnRJdGVtWydtb3ZlZCddID0gcmlnaHRJdGVtWydpbmRleCddO1xuICAgICAgICAgICAgICAgICAgICByaWdodEl0ZW1bJ21vdmVkJ10gPSBsZWZ0SXRlbVsnaW5kZXgnXTtcbiAgICAgICAgICAgICAgICAgICAgcmlnaHQuc3BsaWNlKHIsIDEpOyAgICAgICAgIC8vIFRoaXMgaXRlbSBpcyBtYXJrZWQgYXMgbW92ZWQ7IHNvIHJlbW92ZSBpdCBmcm9tIHJpZ2h0IGxpc3RcbiAgICAgICAgICAgICAgICAgICAgZmFpbGVkQ29tcGFyZXMgPSByID0gMDsgICAgIC8vIFJlc2V0IGZhaWxlZCBjb21wYXJlcyBjb3VudCBiZWNhdXNlIHdlJ3JlIGNoZWNraW5nIGZvciBjb25zZWN1dGl2ZSBmYWlsdXJlc1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBmYWlsZWRDb21wYXJlcyArPSByO1xuICAgICAgICB9XG4gICAgfVxufTtcblxua28udXRpbHMuY29tcGFyZUFycmF5cyA9IChmdW5jdGlvbiAoKSB7XG4gICAgdmFyIHN0YXR1c05vdEluT2xkID0gJ2FkZGVkJywgc3RhdHVzTm90SW5OZXcgPSAnZGVsZXRlZCc7XG5cbiAgICAvLyBTaW1wbGUgY2FsY3VsYXRpb24gYmFzZWQgb24gTGV2ZW5zaHRlaW4gZGlzdGFuY2UuXG4gICAgZnVuY3Rpb24gY29tcGFyZUFycmF5cyhvbGRBcnJheSwgbmV3QXJyYXksIG9wdGlvbnMpIHtcbiAgICAgICAgLy8gRm9yIGJhY2t3YXJkIGNvbXBhdGliaWxpdHksIGlmIHRoZSB0aGlyZCBhcmcgaXMgYWN0dWFsbHkgYSBib29sLCBpbnRlcnByZXRcbiAgICAgICAgLy8gaXQgYXMgdGhlIG9sZCBwYXJhbWV0ZXIgJ2RvbnRMaW1pdE1vdmVzJy4gTmV3ZXIgY29kZSBzaG91bGQgdXNlIHsgZG9udExpbWl0TW92ZXM6IHRydWUgfS5cbiAgICAgICAgb3B0aW9ucyA9ICh0eXBlb2Ygb3B0aW9ucyA9PT0gJ2Jvb2xlYW4nKSA/IHsgJ2RvbnRMaW1pdE1vdmVzJzogb3B0aW9ucyB9IDogKG9wdGlvbnMgfHwge30pO1xuICAgICAgICBvbGRBcnJheSA9IG9sZEFycmF5IHx8IFtdO1xuICAgICAgICBuZXdBcnJheSA9IG5ld0FycmF5IHx8IFtdO1xuXG4gICAgICAgIGlmIChvbGRBcnJheS5sZW5ndGggPCBuZXdBcnJheS5sZW5ndGgpXG4gICAgICAgICAgICByZXR1cm4gY29tcGFyZVNtYWxsQXJyYXlUb0JpZ0FycmF5KG9sZEFycmF5LCBuZXdBcnJheSwgc3RhdHVzTm90SW5PbGQsIHN0YXR1c05vdEluTmV3LCBvcHRpb25zKTtcbiAgICAgICAgZWxzZVxuICAgICAgICAgICAgcmV0dXJuIGNvbXBhcmVTbWFsbEFycmF5VG9CaWdBcnJheShuZXdBcnJheSwgb2xkQXJyYXksIHN0YXR1c05vdEluTmV3LCBzdGF0dXNOb3RJbk9sZCwgb3B0aW9ucyk7XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gY29tcGFyZVNtYWxsQXJyYXlUb0JpZ0FycmF5KHNtbEFycmF5LCBiaWdBcnJheSwgc3RhdHVzTm90SW5TbWwsIHN0YXR1c05vdEluQmlnLCBvcHRpb25zKSB7XG4gICAgICAgIHZhciBteU1pbiA9IE1hdGgubWluLFxuICAgICAgICAgICAgbXlNYXggPSBNYXRoLm1heCxcbiAgICAgICAgICAgIGVkaXREaXN0YW5jZU1hdHJpeCA9IFtdLFxuICAgICAgICAgICAgc21sSW5kZXgsIHNtbEluZGV4TWF4ID0gc21sQXJyYXkubGVuZ3RoLFxuICAgICAgICAgICAgYmlnSW5kZXgsIGJpZ0luZGV4TWF4ID0gYmlnQXJyYXkubGVuZ3RoLFxuICAgICAgICAgICAgY29tcGFyZVJhbmdlID0gKGJpZ0luZGV4TWF4IC0gc21sSW5kZXhNYXgpIHx8IDEsXG4gICAgICAgICAgICBtYXhEaXN0YW5jZSA9IHNtbEluZGV4TWF4ICsgYmlnSW5kZXhNYXggKyAxLFxuICAgICAgICAgICAgdGhpc1JvdywgbGFzdFJvdyxcbiAgICAgICAgICAgIGJpZ0luZGV4TWF4Rm9yUm93LCBiaWdJbmRleE1pbkZvclJvdztcblxuICAgICAgICBmb3IgKHNtbEluZGV4ID0gMDsgc21sSW5kZXggPD0gc21sSW5kZXhNYXg7IHNtbEluZGV4KyspIHtcbiAgICAgICAgICAgIGxhc3RSb3cgPSB0aGlzUm93O1xuICAgICAgICAgICAgZWRpdERpc3RhbmNlTWF0cml4LnB1c2godGhpc1JvdyA9IFtdKTtcbiAgICAgICAgICAgIGJpZ0luZGV4TWF4Rm9yUm93ID0gbXlNaW4oYmlnSW5kZXhNYXgsIHNtbEluZGV4ICsgY29tcGFyZVJhbmdlKTtcbiAgICAgICAgICAgIGJpZ0luZGV4TWluRm9yUm93ID0gbXlNYXgoMCwgc21sSW5kZXggLSAxKTtcbiAgICAgICAgICAgIGZvciAoYmlnSW5kZXggPSBiaWdJbmRleE1pbkZvclJvdzsgYmlnSW5kZXggPD0gYmlnSW5kZXhNYXhGb3JSb3c7IGJpZ0luZGV4KyspIHtcbiAgICAgICAgICAgICAgICBpZiAoIWJpZ0luZGV4KVxuICAgICAgICAgICAgICAgICAgICB0aGlzUm93W2JpZ0luZGV4XSA9IHNtbEluZGV4ICsgMTtcbiAgICAgICAgICAgICAgICBlbHNlIGlmICghc21sSW5kZXgpICAvLyBUb3Agcm93IC0gdHJhbnNmb3JtIGVtcHR5IGFycmF5IGludG8gbmV3IGFycmF5IHZpYSBhZGRpdGlvbnNcbiAgICAgICAgICAgICAgICAgICAgdGhpc1Jvd1tiaWdJbmRleF0gPSBiaWdJbmRleCArIDE7XG4gICAgICAgICAgICAgICAgZWxzZSBpZiAoc21sQXJyYXlbc21sSW5kZXggLSAxXSA9PT0gYmlnQXJyYXlbYmlnSW5kZXggLSAxXSlcbiAgICAgICAgICAgICAgICAgICAgdGhpc1Jvd1tiaWdJbmRleF0gPSBsYXN0Um93W2JpZ0luZGV4IC0gMV07ICAgICAgICAgICAgICAgICAgLy8gY29weSB2YWx1ZSAobm8gZWRpdClcbiAgICAgICAgICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgdmFyIG5vcnRoRGlzdGFuY2UgPSBsYXN0Um93W2JpZ0luZGV4XSB8fCBtYXhEaXN0YW5jZTsgICAgICAgLy8gbm90IGluIGJpZyAoZGVsZXRpb24pXG4gICAgICAgICAgICAgICAgICAgIHZhciB3ZXN0RGlzdGFuY2UgPSB0aGlzUm93W2JpZ0luZGV4IC0gMV0gfHwgbWF4RGlzdGFuY2U7ICAgIC8vIG5vdCBpbiBzbWFsbCAoYWRkaXRpb24pXG4gICAgICAgICAgICAgICAgICAgIHRoaXNSb3dbYmlnSW5kZXhdID0gbXlNaW4obm9ydGhEaXN0YW5jZSwgd2VzdERpc3RhbmNlKSArIDE7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGVkaXRTY3JpcHQgPSBbXSwgbWVNaW51c09uZSwgbm90SW5TbWwgPSBbXSwgbm90SW5CaWcgPSBbXTtcbiAgICAgICAgZm9yIChzbWxJbmRleCA9IHNtbEluZGV4TWF4LCBiaWdJbmRleCA9IGJpZ0luZGV4TWF4OyBzbWxJbmRleCB8fCBiaWdJbmRleDspIHtcbiAgICAgICAgICAgIG1lTWludXNPbmUgPSBlZGl0RGlzdGFuY2VNYXRyaXhbc21sSW5kZXhdW2JpZ0luZGV4XSAtIDE7XG4gICAgICAgICAgICBpZiAoYmlnSW5kZXggJiYgbWVNaW51c09uZSA9PT0gZWRpdERpc3RhbmNlTWF0cml4W3NtbEluZGV4XVtiaWdJbmRleC0xXSkge1xuICAgICAgICAgICAgICAgIG5vdEluU21sLnB1c2goZWRpdFNjcmlwdFtlZGl0U2NyaXB0Lmxlbmd0aF0gPSB7ICAgICAvLyBhZGRlZFxuICAgICAgICAgICAgICAgICAgICAnc3RhdHVzJzogc3RhdHVzTm90SW5TbWwsXG4gICAgICAgICAgICAgICAgICAgICd2YWx1ZSc6IGJpZ0FycmF5Wy0tYmlnSW5kZXhdLFxuICAgICAgICAgICAgICAgICAgICAnaW5kZXgnOiBiaWdJbmRleCB9KTtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAoc21sSW5kZXggJiYgbWVNaW51c09uZSA9PT0gZWRpdERpc3RhbmNlTWF0cml4W3NtbEluZGV4IC0gMV1bYmlnSW5kZXhdKSB7XG4gICAgICAgICAgICAgICAgbm90SW5CaWcucHVzaChlZGl0U2NyaXB0W2VkaXRTY3JpcHQubGVuZ3RoXSA9IHsgICAgIC8vIGRlbGV0ZWRcbiAgICAgICAgICAgICAgICAgICAgJ3N0YXR1cyc6IHN0YXR1c05vdEluQmlnLFxuICAgICAgICAgICAgICAgICAgICAndmFsdWUnOiBzbWxBcnJheVstLXNtbEluZGV4XSxcbiAgICAgICAgICAgICAgICAgICAgJ2luZGV4Jzogc21sSW5kZXggfSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgIC0tYmlnSW5kZXg7XG4gICAgICAgICAgICAgICAgLS1zbWxJbmRleDtcbiAgICAgICAgICAgICAgICBpZiAoIW9wdGlvbnNbJ3NwYXJzZSddKSB7XG4gICAgICAgICAgICAgICAgICAgIGVkaXRTY3JpcHQucHVzaCh7XG4gICAgICAgICAgICAgICAgICAgICAgICAnc3RhdHVzJzogXCJyZXRhaW5lZFwiLFxuICAgICAgICAgICAgICAgICAgICAgICAgJ3ZhbHVlJzogYmlnQXJyYXlbYmlnSW5kZXhdIH0pO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFNldCBhIGxpbWl0IG9uIHRoZSBudW1iZXIgb2YgY29uc2VjdXRpdmUgbm9uLW1hdGNoaW5nIGNvbXBhcmlzb25zOyBoYXZpbmcgaXQgYSBtdWx0aXBsZSBvZlxuICAgICAgICAvLyBzbWxJbmRleE1heCBrZWVwcyB0aGUgdGltZSBjb21wbGV4aXR5IG9mIHRoaXMgYWxnb3JpdGhtIGxpbmVhci5cbiAgICAgICAga28udXRpbHMuZmluZE1vdmVzSW5BcnJheUNvbXBhcmlzb24obm90SW5CaWcsIG5vdEluU21sLCAhb3B0aW9uc1snZG9udExpbWl0TW92ZXMnXSAmJiBzbWxJbmRleE1heCAqIDEwKTtcblxuICAgICAgICByZXR1cm4gZWRpdFNjcmlwdC5yZXZlcnNlKCk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGNvbXBhcmVBcnJheXM7XG59KSgpO1xuXG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLmNvbXBhcmVBcnJheXMnLCBrby51dGlscy5jb21wYXJlQXJyYXlzKTtcbihmdW5jdGlvbiAoKSB7XG4gICAgLy8gT2JqZWN0aXZlOlxuICAgIC8vICogR2l2ZW4gYW4gaW5wdXQgYXJyYXksIGEgY29udGFpbmVyIERPTSBub2RlLCBhbmQgYSBmdW5jdGlvbiBmcm9tIGFycmF5IGVsZW1lbnRzIHRvIGFycmF5cyBvZiBET00gbm9kZXMsXG4gICAgLy8gICBtYXAgdGhlIGFycmF5IGVsZW1lbnRzIHRvIGFycmF5cyBvZiBET00gbm9kZXMsIGNvbmNhdGVuYXRlIHRvZ2V0aGVyIGFsbCB0aGVzZSBhcnJheXMsIGFuZCB1c2UgdGhlbSB0byBwb3B1bGF0ZSB0aGUgY29udGFpbmVyIERPTSBub2RlXG4gICAgLy8gKiBOZXh0IHRpbWUgd2UncmUgZ2l2ZW4gdGhlIHNhbWUgY29tYmluYXRpb24gb2YgdGhpbmdzICh3aXRoIHRoZSBhcnJheSBwb3NzaWJseSBoYXZpbmcgbXV0YXRlZCksIHVwZGF0ZSB0aGUgY29udGFpbmVyIERPTSBub2RlXG4gICAgLy8gICBzbyB0aGF0IGl0cyBjaGlsZHJlbiBpcyBhZ2FpbiB0aGUgY29uY2F0ZW5hdGlvbiBvZiB0aGUgbWFwcGluZ3Mgb2YgdGhlIGFycmF5IGVsZW1lbnRzLCBidXQgZG9uJ3QgcmUtbWFwIGFueSBhcnJheSBlbGVtZW50cyB0aGF0IHdlXG4gICAgLy8gICBwcmV2aW91c2x5IG1hcHBlZCAtIHJldGFpbiB0aG9zZSBub2RlcywgYW5kIGp1c3QgaW5zZXJ0L2RlbGV0ZSBvdGhlciBvbmVzXG5cbiAgICAvLyBcImNhbGxiYWNrQWZ0ZXJBZGRpbmdOb2Rlc1wiIHdpbGwgYmUgaW52b2tlZCBhZnRlciBhbnkgXCJtYXBwaW5nXCItZ2VuZXJhdGVkIG5vZGVzIGFyZSBpbnNlcnRlZCBpbnRvIHRoZSBjb250YWluZXIgbm9kZVxuICAgIC8vIFlvdSBjYW4gdXNlIHRoaXMsIGZvciBleGFtcGxlLCB0byBhY3RpdmF0ZSBiaW5kaW5ncyBvbiB0aG9zZSBub2Rlcy5cblxuICAgIGZ1bmN0aW9uIG1hcE5vZGVBbmRSZWZyZXNoV2hlbkNoYW5nZWQoY29udGFpbmVyTm9kZSwgbWFwcGluZywgdmFsdWVUb01hcCwgY2FsbGJhY2tBZnRlckFkZGluZ05vZGVzLCBpbmRleCkge1xuICAgICAgICAvLyBNYXAgdGhpcyBhcnJheSB2YWx1ZSBpbnNpZGUgYSBkZXBlbmRlbnRPYnNlcnZhYmxlIHNvIHdlIHJlLW1hcCB3aGVuIGFueSBkZXBlbmRlbmN5IGNoYW5nZXNcbiAgICAgICAgdmFyIG1hcHBlZE5vZGVzID0gW107XG4gICAgICAgIHZhciBkZXBlbmRlbnRPYnNlcnZhYmxlID0ga28uZGVwZW5kZW50T2JzZXJ2YWJsZShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBuZXdNYXBwZWROb2RlcyA9IG1hcHBpbmcodmFsdWVUb01hcCwgaW5kZXgsIGtvLnV0aWxzLmZpeFVwQ29udGludW91c05vZGVBcnJheShtYXBwZWROb2RlcywgY29udGFpbmVyTm9kZSkpIHx8IFtdO1xuXG4gICAgICAgICAgICAvLyBPbiBzdWJzZXF1ZW50IGV2YWx1YXRpb25zLCBqdXN0IHJlcGxhY2UgdGhlIHByZXZpb3VzbHktaW5zZXJ0ZWQgRE9NIG5vZGVzXG4gICAgICAgICAgICBpZiAobWFwcGVkTm9kZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICAgIGtvLnV0aWxzLnJlcGxhY2VEb21Ob2RlcyhtYXBwZWROb2RlcywgbmV3TWFwcGVkTm9kZXMpO1xuICAgICAgICAgICAgICAgIGlmIChjYWxsYmFja0FmdGVyQWRkaW5nTm9kZXMpXG4gICAgICAgICAgICAgICAgICAgIGtvLmRlcGVuZGVuY3lEZXRlY3Rpb24uaWdub3JlKGNhbGxiYWNrQWZ0ZXJBZGRpbmdOb2RlcywgbnVsbCwgW3ZhbHVlVG9NYXAsIG5ld01hcHBlZE5vZGVzLCBpbmRleF0pO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBSZXBsYWNlIHRoZSBjb250ZW50cyBvZiB0aGUgbWFwcGVkTm9kZXMgYXJyYXksIHRoZXJlYnkgdXBkYXRpbmcgdGhlIHJlY29yZFxuICAgICAgICAgICAgLy8gb2Ygd2hpY2ggbm9kZXMgd291bGQgYmUgZGVsZXRlZCBpZiB2YWx1ZVRvTWFwIHdhcyBpdHNlbGYgbGF0ZXIgcmVtb3ZlZFxuICAgICAgICAgICAgbWFwcGVkTm9kZXMubGVuZ3RoID0gMDtcbiAgICAgICAgICAgIGtvLnV0aWxzLmFycmF5UHVzaEFsbChtYXBwZWROb2RlcywgbmV3TWFwcGVkTm9kZXMpO1xuICAgICAgICB9LCBudWxsLCB7IGRpc3Bvc2VXaGVuTm9kZUlzUmVtb3ZlZDogY29udGFpbmVyTm9kZSwgZGlzcG9zZVdoZW46IGZ1bmN0aW9uKCkgeyByZXR1cm4gIWtvLnV0aWxzLmFueURvbU5vZGVJc0F0dGFjaGVkVG9Eb2N1bWVudChtYXBwZWROb2Rlcyk7IH0gfSk7XG4gICAgICAgIHJldHVybiB7IG1hcHBlZE5vZGVzIDogbWFwcGVkTm9kZXMsIGRlcGVuZGVudE9ic2VydmFibGUgOiAoZGVwZW5kZW50T2JzZXJ2YWJsZS5pc0FjdGl2ZSgpID8gZGVwZW5kZW50T2JzZXJ2YWJsZSA6IHVuZGVmaW5lZCkgfTtcbiAgICB9XG5cbiAgICB2YXIgbGFzdE1hcHBpbmdSZXN1bHREb21EYXRhS2V5ID0ga28udXRpbHMuZG9tRGF0YS5uZXh0S2V5KCksXG4gICAgICAgIGRlbGV0ZWRJdGVtRHVtbXlWYWx1ZSA9IGtvLnV0aWxzLmRvbURhdGEubmV4dEtleSgpO1xuXG4gICAga28udXRpbHMuc2V0RG9tTm9kZUNoaWxkcmVuRnJvbUFycmF5TWFwcGluZyA9IGZ1bmN0aW9uIChkb21Ob2RlLCBhcnJheSwgbWFwcGluZywgb3B0aW9ucywgY2FsbGJhY2tBZnRlckFkZGluZ05vZGVzKSB7XG4gICAgICAgIC8vIENvbXBhcmUgdGhlIHByb3ZpZGVkIGFycmF5IGFnYWluc3QgdGhlIHByZXZpb3VzIG9uZVxuICAgICAgICBhcnJheSA9IGFycmF5IHx8IFtdO1xuICAgICAgICBvcHRpb25zID0gb3B0aW9ucyB8fCB7fTtcbiAgICAgICAgdmFyIGlzRmlyc3RFeGVjdXRpb24gPSBrby51dGlscy5kb21EYXRhLmdldChkb21Ob2RlLCBsYXN0TWFwcGluZ1Jlc3VsdERvbURhdGFLZXkpID09PSB1bmRlZmluZWQ7XG4gICAgICAgIHZhciBsYXN0TWFwcGluZ1Jlc3VsdCA9IGtvLnV0aWxzLmRvbURhdGEuZ2V0KGRvbU5vZGUsIGxhc3RNYXBwaW5nUmVzdWx0RG9tRGF0YUtleSkgfHwgW107XG4gICAgICAgIHZhciBsYXN0QXJyYXkgPSBrby51dGlscy5hcnJheU1hcChsYXN0TWFwcGluZ1Jlc3VsdCwgZnVuY3Rpb24gKHgpIHsgcmV0dXJuIHguYXJyYXlFbnRyeTsgfSk7XG4gICAgICAgIHZhciBlZGl0U2NyaXB0ID0ga28udXRpbHMuY29tcGFyZUFycmF5cyhsYXN0QXJyYXksIGFycmF5LCBvcHRpb25zWydkb250TGltaXRNb3ZlcyddKTtcblxuICAgICAgICAvLyBCdWlsZCB0aGUgbmV3IG1hcHBpbmcgcmVzdWx0XG4gICAgICAgIHZhciBuZXdNYXBwaW5nUmVzdWx0ID0gW107XG4gICAgICAgIHZhciBsYXN0TWFwcGluZ1Jlc3VsdEluZGV4ID0gMDtcbiAgICAgICAgdmFyIG5ld01hcHBpbmdSZXN1bHRJbmRleCA9IDA7XG5cbiAgICAgICAgdmFyIG5vZGVzVG9EZWxldGUgPSBbXTtcbiAgICAgICAgdmFyIGl0ZW1zVG9Qcm9jZXNzID0gW107XG4gICAgICAgIHZhciBpdGVtc0ZvckJlZm9yZVJlbW92ZUNhbGxiYWNrcyA9IFtdO1xuICAgICAgICB2YXIgaXRlbXNGb3JNb3ZlQ2FsbGJhY2tzID0gW107XG4gICAgICAgIHZhciBpdGVtc0ZvckFmdGVyQWRkQ2FsbGJhY2tzID0gW107XG4gICAgICAgIHZhciBtYXBEYXRhO1xuXG4gICAgICAgIGZ1bmN0aW9uIGl0ZW1Nb3ZlZE9yUmV0YWluZWQoZWRpdFNjcmlwdEluZGV4LCBvbGRQb3NpdGlvbikge1xuICAgICAgICAgICAgbWFwRGF0YSA9IGxhc3RNYXBwaW5nUmVzdWx0W29sZFBvc2l0aW9uXTtcbiAgICAgICAgICAgIGlmIChuZXdNYXBwaW5nUmVzdWx0SW5kZXggIT09IG9sZFBvc2l0aW9uKVxuICAgICAgICAgICAgICAgIGl0ZW1zRm9yTW92ZUNhbGxiYWNrc1tlZGl0U2NyaXB0SW5kZXhdID0gbWFwRGF0YTtcbiAgICAgICAgICAgIC8vIFNpbmNlIHVwZGF0aW5nIHRoZSBpbmRleCBtaWdodCBjaGFuZ2UgdGhlIG5vZGVzLCBkbyBzbyBiZWZvcmUgY2FsbGluZyBmaXhVcENvbnRpbnVvdXNOb2RlQXJyYXlcbiAgICAgICAgICAgIG1hcERhdGEuaW5kZXhPYnNlcnZhYmxlKG5ld01hcHBpbmdSZXN1bHRJbmRleCsrKTtcbiAgICAgICAgICAgIGtvLnV0aWxzLmZpeFVwQ29udGludW91c05vZGVBcnJheShtYXBEYXRhLm1hcHBlZE5vZGVzLCBkb21Ob2RlKTtcbiAgICAgICAgICAgIG5ld01hcHBpbmdSZXN1bHQucHVzaChtYXBEYXRhKTtcbiAgICAgICAgICAgIGl0ZW1zVG9Qcm9jZXNzLnB1c2gobWFwRGF0YSk7XG4gICAgICAgIH1cblxuICAgICAgICBmdW5jdGlvbiBjYWxsQ2FsbGJhY2soY2FsbGJhY2ssIGl0ZW1zKSB7XG4gICAgICAgICAgICBpZiAoY2FsbGJhY2spIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBpID0gMCwgbiA9IGl0ZW1zLmxlbmd0aDsgaSA8IG47IGkrKykge1xuICAgICAgICAgICAgICAgICAgICBpZiAoaXRlbXNbaV0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGtvLnV0aWxzLmFycmF5Rm9yRWFjaChpdGVtc1tpXS5tYXBwZWROb2RlcywgZnVuY3Rpb24obm9kZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrKG5vZGUsIGksIGl0ZW1zW2ldLmFycmF5RW50cnkpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBmb3IgKHZhciBpID0gMCwgZWRpdFNjcmlwdEl0ZW0sIG1vdmVkSW5kZXg7IGVkaXRTY3JpcHRJdGVtID0gZWRpdFNjcmlwdFtpXTsgaSsrKSB7XG4gICAgICAgICAgICBtb3ZlZEluZGV4ID0gZWRpdFNjcmlwdEl0ZW1bJ21vdmVkJ107XG4gICAgICAgICAgICBzd2l0Y2ggKGVkaXRTY3JpcHRJdGVtWydzdGF0dXMnXSkge1xuICAgICAgICAgICAgICAgIGNhc2UgXCJkZWxldGVkXCI6XG4gICAgICAgICAgICAgICAgICAgIGlmIChtb3ZlZEluZGV4ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIG1hcERhdGEgPSBsYXN0TWFwcGluZ1Jlc3VsdFtsYXN0TWFwcGluZ1Jlc3VsdEluZGV4XTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgLy8gU3RvcCB0cmFja2luZyBjaGFuZ2VzIHRvIHRoZSBtYXBwaW5nIGZvciB0aGVzZSBub2Rlc1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKG1hcERhdGEuZGVwZW5kZW50T2JzZXJ2YWJsZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcERhdGEuZGVwZW5kZW50T2JzZXJ2YWJsZS5kaXNwb3NlKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgbWFwRGF0YS5kZXBlbmRlbnRPYnNlcnZhYmxlID0gdW5kZWZpbmVkO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBRdWV1ZSB0aGVzZSBub2RlcyBmb3IgbGF0ZXIgcmVtb3ZhbFxuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGtvLnV0aWxzLmZpeFVwQ29udGludW91c05vZGVBcnJheShtYXBEYXRhLm1hcHBlZE5vZGVzLCBkb21Ob2RlKS5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAob3B0aW9uc1snYmVmb3JlUmVtb3ZlJ10pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbmV3TWFwcGluZ1Jlc3VsdC5wdXNoKG1hcERhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtc1RvUHJvY2Vzcy5wdXNoKG1hcERhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAobWFwRGF0YS5hcnJheUVudHJ5ID09PSBkZWxldGVkSXRlbUR1bW15VmFsdWUpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG1hcERhdGEgPSBudWxsO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgaXRlbXNGb3JCZWZvcmVSZW1vdmVDYWxsYmFja3NbaV0gPSBtYXBEYXRhO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChtYXBEYXRhKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5vZGVzVG9EZWxldGUucHVzaC5hcHBseShub2Rlc1RvRGVsZXRlLCBtYXBEYXRhLm1hcHBlZE5vZGVzKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICAgICAgbGFzdE1hcHBpbmdSZXN1bHRJbmRleCsrO1xuICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgIGNhc2UgXCJyZXRhaW5lZFwiOlxuICAgICAgICAgICAgICAgICAgICBpdGVtTW92ZWRPclJldGFpbmVkKGksIGxhc3RNYXBwaW5nUmVzdWx0SW5kZXgrKyk7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgY2FzZSBcImFkZGVkXCI6XG4gICAgICAgICAgICAgICAgICAgIGlmIChtb3ZlZEluZGV4ICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGl0ZW1Nb3ZlZE9yUmV0YWluZWQoaSwgbW92ZWRJbmRleCk7XG4gICAgICAgICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBtYXBEYXRhID0geyBhcnJheUVudHJ5OiBlZGl0U2NyaXB0SXRlbVsndmFsdWUnXSwgaW5kZXhPYnNlcnZhYmxlOiBrby5vYnNlcnZhYmxlKG5ld01hcHBpbmdSZXN1bHRJbmRleCsrKSB9O1xuICAgICAgICAgICAgICAgICAgICAgICAgbmV3TWFwcGluZ1Jlc3VsdC5wdXNoKG1hcERhdGEpO1xuICAgICAgICAgICAgICAgICAgICAgICAgaXRlbXNUb1Byb2Nlc3MucHVzaChtYXBEYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGlmICghaXNGaXJzdEV4ZWN1dGlvbilcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpdGVtc0ZvckFmdGVyQWRkQ2FsbGJhY2tzW2ldID0gbWFwRGF0YTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFN0b3JlIGEgY29weSBvZiB0aGUgYXJyYXkgaXRlbXMgd2UganVzdCBjb25zaWRlcmVkIHNvIHdlIGNhbiBkaWZmZXJlbmNlIGl0IG5leHQgdGltZVxuICAgICAgICBrby51dGlscy5kb21EYXRhLnNldChkb21Ob2RlLCBsYXN0TWFwcGluZ1Jlc3VsdERvbURhdGFLZXksIG5ld01hcHBpbmdSZXN1bHQpO1xuXG4gICAgICAgIC8vIENhbGwgYmVmb3JlTW92ZSBmaXJzdCBiZWZvcmUgYW55IGNoYW5nZXMgaGF2ZSBiZWVuIG1hZGUgdG8gdGhlIERPTVxuICAgICAgICBjYWxsQ2FsbGJhY2sob3B0aW9uc1snYmVmb3JlTW92ZSddLCBpdGVtc0Zvck1vdmVDYWxsYmFja3MpO1xuXG4gICAgICAgIC8vIE5leHQgcmVtb3ZlIG5vZGVzIGZvciBkZWxldGVkIGl0ZW1zIChvciBqdXN0IGNsZWFuIGlmIHRoZXJlJ3MgYSBiZWZvcmVSZW1vdmUgY2FsbGJhY2spXG4gICAgICAgIGtvLnV0aWxzLmFycmF5Rm9yRWFjaChub2Rlc1RvRGVsZXRlLCBvcHRpb25zWydiZWZvcmVSZW1vdmUnXSA/IGtvLmNsZWFuTm9kZSA6IGtvLnJlbW92ZU5vZGUpO1xuXG4gICAgICAgIC8vIE5leHQgYWRkL3Jlb3JkZXIgdGhlIHJlbWFpbmluZyBpdGVtcyAod2lsbCBpbmNsdWRlIGRlbGV0ZWQgaXRlbXMgaWYgdGhlcmUncyBhIGJlZm9yZVJlbW92ZSBjYWxsYmFjaylcbiAgICAgICAgZm9yICh2YXIgaSA9IDAsIG5leHROb2RlID0ga28udmlydHVhbEVsZW1lbnRzLmZpcnN0Q2hpbGQoZG9tTm9kZSksIGxhc3ROb2RlLCBub2RlOyBtYXBEYXRhID0gaXRlbXNUb1Byb2Nlc3NbaV07IGkrKykge1xuICAgICAgICAgICAgLy8gR2V0IG5vZGVzIGZvciBuZXdseSBhZGRlZCBpdGVtc1xuICAgICAgICAgICAgaWYgKCFtYXBEYXRhLm1hcHBlZE5vZGVzKVxuICAgICAgICAgICAgICAgIGtvLnV0aWxzLmV4dGVuZChtYXBEYXRhLCBtYXBOb2RlQW5kUmVmcmVzaFdoZW5DaGFuZ2VkKGRvbU5vZGUsIG1hcHBpbmcsIG1hcERhdGEuYXJyYXlFbnRyeSwgY2FsbGJhY2tBZnRlckFkZGluZ05vZGVzLCBtYXBEYXRhLmluZGV4T2JzZXJ2YWJsZSkpO1xuXG4gICAgICAgICAgICAvLyBQdXQgbm9kZXMgaW4gdGhlIHJpZ2h0IHBsYWNlIGlmIHRoZXkgYXJlbid0IHRoZXJlIGFscmVhZHlcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBub2RlID0gbWFwRGF0YS5tYXBwZWROb2Rlc1tqXTsgbmV4dE5vZGUgPSBub2RlLm5leHRTaWJsaW5nLCBsYXN0Tm9kZSA9IG5vZGUsIGorKykge1xuICAgICAgICAgICAgICAgIGlmIChub2RlICE9PSBuZXh0Tm9kZSlcbiAgICAgICAgICAgICAgICAgICAga28udmlydHVhbEVsZW1lbnRzLmluc2VydEFmdGVyKGRvbU5vZGUsIG5vZGUsIGxhc3ROb2RlKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gUnVuIHRoZSBjYWxsYmFja3MgZm9yIG5ld2x5IGFkZGVkIG5vZGVzIChmb3IgZXhhbXBsZSwgdG8gYXBwbHkgYmluZGluZ3MsIGV0Yy4pXG4gICAgICAgICAgICBpZiAoIW1hcERhdGEuaW5pdGlhbGl6ZWQgJiYgY2FsbGJhY2tBZnRlckFkZGluZ05vZGVzKSB7XG4gICAgICAgICAgICAgICAgY2FsbGJhY2tBZnRlckFkZGluZ05vZGVzKG1hcERhdGEuYXJyYXlFbnRyeSwgbWFwRGF0YS5tYXBwZWROb2RlcywgbWFwRGF0YS5pbmRleE9ic2VydmFibGUpO1xuICAgICAgICAgICAgICAgIG1hcERhdGEuaW5pdGlhbGl6ZWQgPSB0cnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gSWYgdGhlcmUncyBhIGJlZm9yZVJlbW92ZSBjYWxsYmFjaywgY2FsbCBpdCBhZnRlciByZW9yZGVyaW5nLlxuICAgICAgICAvLyBOb3RlIHRoYXQgd2UgYXNzdW1lIHRoYXQgdGhlIGJlZm9yZVJlbW92ZSBjYWxsYmFjayB3aWxsIHVzdWFsbHkgYmUgdXNlZCB0byByZW1vdmUgdGhlIG5vZGVzIHVzaW5nXG4gICAgICAgIC8vIHNvbWUgc29ydCBvZiBhbmltYXRpb24sIHdoaWNoIGlzIHdoeSB3ZSBmaXJzdCByZW9yZGVyIHRoZSBub2RlcyB0aGF0IHdpbGwgYmUgcmVtb3ZlZC4gSWYgdGhlXG4gICAgICAgIC8vIGNhbGxiYWNrIGluc3RlYWQgcmVtb3ZlcyB0aGUgbm9kZXMgcmlnaHQgYXdheSwgaXQgd291bGQgYmUgbW9yZSBlZmZpY2llbnQgdG8gc2tpcCByZW9yZGVyaW5nIHRoZW0uXG4gICAgICAgIC8vIFBlcmhhcHMgd2UnbGwgbWFrZSB0aGF0IGNoYW5nZSBpbiB0aGUgZnV0dXJlIGlmIHRoaXMgc2NlbmFyaW8gYmVjb21lcyBtb3JlIGNvbW1vbi5cbiAgICAgICAgY2FsbENhbGxiYWNrKG9wdGlvbnNbJ2JlZm9yZVJlbW92ZSddLCBpdGVtc0ZvckJlZm9yZVJlbW92ZUNhbGxiYWNrcyk7XG5cbiAgICAgICAgLy8gUmVwbGFjZSB0aGUgc3RvcmVkIHZhbHVlcyBvZiBkZWxldGVkIGl0ZW1zIHdpdGggYSBkdW1teSB2YWx1ZS4gVGhpcyBwcm92aWRlcyB0d28gYmVuZWZpdHM6IGl0IG1hcmtzIHRoaXMgaXRlbVxuICAgICAgICAvLyBhcyBhbHJlYWR5IFwicmVtb3ZlZFwiIHNvIHdlIHdvbid0IGNhbGwgYmVmb3JlUmVtb3ZlIGZvciBpdCBhZ2FpbiwgYW5kIGl0IGVuc3VyZXMgdGhhdCB0aGUgaXRlbSB3b24ndCBtYXRjaCB1cFxuICAgICAgICAvLyB3aXRoIGFuIGFjdHVhbCBpdGVtIGluIHRoZSBhcnJheSBhbmQgYXBwZWFyIGFzIFwicmV0YWluZWRcIiBvciBcIm1vdmVkXCIuXG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBpdGVtc0ZvckJlZm9yZVJlbW92ZUNhbGxiYWNrcy5sZW5ndGg7ICsraSkge1xuICAgICAgICAgICAgaWYgKGl0ZW1zRm9yQmVmb3JlUmVtb3ZlQ2FsbGJhY2tzW2ldKSB7XG4gICAgICAgICAgICAgICAgaXRlbXNGb3JCZWZvcmVSZW1vdmVDYWxsYmFja3NbaV0uYXJyYXlFbnRyeSA9IGRlbGV0ZWRJdGVtRHVtbXlWYWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpbmFsbHkgY2FsbCBhZnRlck1vdmUgYW5kIGFmdGVyQWRkIGNhbGxiYWNrc1xuICAgICAgICBjYWxsQ2FsbGJhY2sob3B0aW9uc1snYWZ0ZXJNb3ZlJ10sIGl0ZW1zRm9yTW92ZUNhbGxiYWNrcyk7XG4gICAgICAgIGNhbGxDYWxsYmFjayhvcHRpb25zWydhZnRlckFkZCddLCBpdGVtc0ZvckFmdGVyQWRkQ2FsbGJhY2tzKTtcbiAgICB9XG59KSgpO1xuXG5rby5leHBvcnRTeW1ib2woJ3V0aWxzLnNldERvbU5vZGVDaGlsZHJlbkZyb21BcnJheU1hcHBpbmcnLCBrby51dGlscy5zZXREb21Ob2RlQ2hpbGRyZW5Gcm9tQXJyYXlNYXBwaW5nKTtcbmtvLm5hdGl2ZVRlbXBsYXRlRW5naW5lID0gZnVuY3Rpb24gKCkge1xuICAgIHRoaXNbJ2FsbG93VGVtcGxhdGVSZXdyaXRpbmcnXSA9IGZhbHNlO1xufVxuXG5rby5uYXRpdmVUZW1wbGF0ZUVuZ2luZS5wcm90b3R5cGUgPSBuZXcga28udGVtcGxhdGVFbmdpbmUoKTtcbmtvLm5hdGl2ZVRlbXBsYXRlRW5naW5lLnByb3RvdHlwZS5jb25zdHJ1Y3RvciA9IGtvLm5hdGl2ZVRlbXBsYXRlRW5naW5lO1xua28ubmF0aXZlVGVtcGxhdGVFbmdpbmUucHJvdG90eXBlWydyZW5kZXJUZW1wbGF0ZVNvdXJjZSddID0gZnVuY3Rpb24gKHRlbXBsYXRlU291cmNlLCBiaW5kaW5nQ29udGV4dCwgb3B0aW9ucywgdGVtcGxhdGVEb2N1bWVudCkge1xuICAgIHZhciB1c2VOb2Rlc0lmQXZhaWxhYmxlID0gIShrby51dGlscy5pZVZlcnNpb24gPCA5KSwgLy8gSUU8OSBjbG9uZU5vZGUgZG9lc24ndCB3b3JrIHByb3Blcmx5XG4gICAgICAgIHRlbXBsYXRlTm9kZXNGdW5jID0gdXNlTm9kZXNJZkF2YWlsYWJsZSA/IHRlbXBsYXRlU291cmNlWydub2RlcyddIDogbnVsbCxcbiAgICAgICAgdGVtcGxhdGVOb2RlcyA9IHRlbXBsYXRlTm9kZXNGdW5jID8gdGVtcGxhdGVTb3VyY2VbJ25vZGVzJ10oKSA6IG51bGw7XG5cbiAgICBpZiAodGVtcGxhdGVOb2Rlcykge1xuICAgICAgICByZXR1cm4ga28udXRpbHMubWFrZUFycmF5KHRlbXBsYXRlTm9kZXMuY2xvbmVOb2RlKHRydWUpLmNoaWxkTm9kZXMpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHZhciB0ZW1wbGF0ZVRleHQgPSB0ZW1wbGF0ZVNvdXJjZVsndGV4dCddKCk7XG4gICAgICAgIHJldHVybiBrby51dGlscy5wYXJzZUh0bWxGcmFnbWVudCh0ZW1wbGF0ZVRleHQsIHRlbXBsYXRlRG9jdW1lbnQpO1xuICAgIH1cbn07XG5cbmtvLm5hdGl2ZVRlbXBsYXRlRW5naW5lLmluc3RhbmNlID0gbmV3IGtvLm5hdGl2ZVRlbXBsYXRlRW5naW5lKCk7XG5rby5zZXRUZW1wbGF0ZUVuZ2luZShrby5uYXRpdmVUZW1wbGF0ZUVuZ2luZS5pbnN0YW5jZSk7XG5cbmtvLmV4cG9ydFN5bWJvbCgnbmF0aXZlVGVtcGxhdGVFbmdpbmUnLCBrby5uYXRpdmVUZW1wbGF0ZUVuZ2luZSk7XG4oZnVuY3Rpb24oKSB7XG4gICAga28uanF1ZXJ5VG1wbFRlbXBsYXRlRW5naW5lID0gZnVuY3Rpb24gKCkge1xuICAgICAgICAvLyBEZXRlY3Qgd2hpY2ggdmVyc2lvbiBvZiBqcXVlcnktdG1wbCB5b3UncmUgdXNpbmcuIFVuZm9ydHVuYXRlbHkganF1ZXJ5LXRtcGxcbiAgICAgICAgLy8gZG9lc24ndCBleHBvc2UgYSB2ZXJzaW9uIG51bWJlciwgc28gd2UgaGF2ZSB0byBpbmZlciBpdC5cbiAgICAgICAgLy8gTm90ZSB0aGF0IGFzIG9mIEtub2Nrb3V0IDEuMywgd2Ugb25seSBzdXBwb3J0IGpRdWVyeS50bXBsIDEuMC4wcHJlIGFuZCBsYXRlcixcbiAgICAgICAgLy8gd2hpY2ggS08gaW50ZXJuYWxseSByZWZlcnMgdG8gYXMgdmVyc2lvbiBcIjJcIiwgc28gb2xkZXIgdmVyc2lvbnMgYXJlIG5vIGxvbmdlciBkZXRlY3RlZC5cbiAgICAgICAgdmFyIGpRdWVyeVRtcGxWZXJzaW9uID0gdGhpcy5qUXVlcnlUbXBsVmVyc2lvbiA9IChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICghalF1ZXJ5SW5zdGFuY2UgfHwgIShqUXVlcnlJbnN0YW5jZVsndG1wbCddKSlcbiAgICAgICAgICAgICAgICByZXR1cm4gMDtcbiAgICAgICAgICAgIC8vIFNpbmNlIGl0IGV4cG9zZXMgbm8gb2ZmaWNpYWwgdmVyc2lvbiBudW1iZXIsIHdlIHVzZSBvdXIgb3duIG51bWJlcmluZyBzeXN0ZW0uIFRvIGJlIHVwZGF0ZWQgYXMganF1ZXJ5LXRtcGwgZXZvbHZlcy5cbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgaWYgKGpRdWVyeUluc3RhbmNlWyd0bXBsJ11bJ3RhZyddWyd0bXBsJ11bJ29wZW4nXS50b1N0cmluZygpLmluZGV4T2YoJ19fJykgPj0gMCkge1xuICAgICAgICAgICAgICAgICAgICAvLyBTaW5jZSAxLjAuMHByZSwgY3VzdG9tIHRhZ3Mgc2hvdWxkIGFwcGVuZCBtYXJrdXAgdG8gYW4gYXJyYXkgY2FsbGVkIFwiX19cIlxuICAgICAgICAgICAgICAgICAgICByZXR1cm4gMjsgLy8gRmluYWwgdmVyc2lvbiBvZiBqcXVlcnkudG1wbFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0gY2F0Y2goZXgpIHsgLyogQXBwYXJlbnRseSBub3QgdGhlIHZlcnNpb24gd2Ugd2VyZSBsb29raW5nIGZvciAqLyB9XG5cbiAgICAgICAgICAgIHJldHVybiAxOyAvLyBBbnkgb2xkZXIgdmVyc2lvbiB0aGF0IHdlIGRvbid0IHN1cHBvcnRcbiAgICAgICAgfSkoKTtcblxuICAgICAgICBmdW5jdGlvbiBlbnN1cmVIYXNSZWZlcmVuY2VkSlF1ZXJ5VGVtcGxhdGVzKCkge1xuICAgICAgICAgICAgaWYgKGpRdWVyeVRtcGxWZXJzaW9uIDwgMilcbiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXCJZb3VyIHZlcnNpb24gb2YgalF1ZXJ5LnRtcGwgaXMgdG9vIG9sZC4gUGxlYXNlIHVwZ3JhZGUgdG8galF1ZXJ5LnRtcGwgMS4wLjBwcmUgb3IgbGF0ZXIuXCIpO1xuICAgICAgICB9XG5cbiAgICAgICAgZnVuY3Rpb24gZXhlY3V0ZVRlbXBsYXRlKGNvbXBpbGVkVGVtcGxhdGUsIGRhdGEsIGpRdWVyeVRlbXBsYXRlT3B0aW9ucykge1xuICAgICAgICAgICAgcmV0dXJuIGpRdWVyeUluc3RhbmNlWyd0bXBsJ10oY29tcGlsZWRUZW1wbGF0ZSwgZGF0YSwgalF1ZXJ5VGVtcGxhdGVPcHRpb25zKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXNbJ3JlbmRlclRlbXBsYXRlU291cmNlJ10gPSBmdW5jdGlvbih0ZW1wbGF0ZVNvdXJjZSwgYmluZGluZ0NvbnRleHQsIG9wdGlvbnMsIHRlbXBsYXRlRG9jdW1lbnQpIHtcbiAgICAgICAgICAgIHRlbXBsYXRlRG9jdW1lbnQgPSB0ZW1wbGF0ZURvY3VtZW50IHx8IGRvY3VtZW50O1xuICAgICAgICAgICAgb3B0aW9ucyA9IG9wdGlvbnMgfHwge307XG4gICAgICAgICAgICBlbnN1cmVIYXNSZWZlcmVuY2VkSlF1ZXJ5VGVtcGxhdGVzKCk7XG5cbiAgICAgICAgICAgIC8vIEVuc3VyZSB3ZSBoYXZlIHN0b3JlZCBhIHByZWNvbXBpbGVkIHZlcnNpb24gb2YgdGhpcyB0ZW1wbGF0ZSAoZG9uJ3Qgd2FudCB0byByZXBhcnNlIG9uIGV2ZXJ5IHJlbmRlcilcbiAgICAgICAgICAgIHZhciBwcmVjb21waWxlZCA9IHRlbXBsYXRlU291cmNlWydkYXRhJ10oJ3ByZWNvbXBpbGVkJyk7XG4gICAgICAgICAgICBpZiAoIXByZWNvbXBpbGVkKSB7XG4gICAgICAgICAgICAgICAgdmFyIHRlbXBsYXRlVGV4dCA9IHRlbXBsYXRlU291cmNlWyd0ZXh0J10oKSB8fCBcIlwiO1xuICAgICAgICAgICAgICAgIC8vIFdyYXAgaW4gXCJ3aXRoKCR3aGF0ZXZlci5rb0JpbmRpbmdDb250ZXh0KSB7IC4uLiB9XCJcbiAgICAgICAgICAgICAgICB0ZW1wbGF0ZVRleHQgPSBcInt7a29fd2l0aCAkaXRlbS5rb0JpbmRpbmdDb250ZXh0fX1cIiArIHRlbXBsYXRlVGV4dCArIFwie3sva29fd2l0aH19XCI7XG5cbiAgICAgICAgICAgICAgICBwcmVjb21waWxlZCA9IGpRdWVyeUluc3RhbmNlWyd0ZW1wbGF0ZSddKG51bGwsIHRlbXBsYXRlVGV4dCk7XG4gICAgICAgICAgICAgICAgdGVtcGxhdGVTb3VyY2VbJ2RhdGEnXSgncHJlY29tcGlsZWQnLCBwcmVjb21waWxlZCk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHZhciBkYXRhID0gW2JpbmRpbmdDb250ZXh0WyckZGF0YSddXTsgLy8gUHJld3JhcCB0aGUgZGF0YSBpbiBhbiBhcnJheSB0byBzdG9wIGpxdWVyeS50bXBsIGZyb20gdHJ5aW5nIHRvIHVud3JhcCBhbnkgYXJyYXlzXG4gICAgICAgICAgICB2YXIgalF1ZXJ5VGVtcGxhdGVPcHRpb25zID0galF1ZXJ5SW5zdGFuY2VbJ2V4dGVuZCddKHsgJ2tvQmluZGluZ0NvbnRleHQnOiBiaW5kaW5nQ29udGV4dCB9LCBvcHRpb25zWyd0ZW1wbGF0ZU9wdGlvbnMnXSk7XG5cbiAgICAgICAgICAgIHZhciByZXN1bHROb2RlcyA9IGV4ZWN1dGVUZW1wbGF0ZShwcmVjb21waWxlZCwgZGF0YSwgalF1ZXJ5VGVtcGxhdGVPcHRpb25zKTtcbiAgICAgICAgICAgIHJlc3VsdE5vZGVzWydhcHBlbmRUbyddKHRlbXBsYXRlRG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKSk7IC8vIFVzaW5nIFwiYXBwZW5kVG9cIiBmb3JjZXMgalF1ZXJ5L2pRdWVyeS50bXBsIHRvIHBlcmZvcm0gbmVjZXNzYXJ5IGNsZWFudXAgd29ya1xuXG4gICAgICAgICAgICBqUXVlcnlJbnN0YW5jZVsnZnJhZ21lbnRzJ10gPSB7fTsgLy8gQ2xlYXIgalF1ZXJ5J3MgZnJhZ21lbnQgY2FjaGUgdG8gYXZvaWQgYSBtZW1vcnkgbGVhayBhZnRlciBhIGxhcmdlIG51bWJlciBvZiB0ZW1wbGF0ZSByZW5kZXJzXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0Tm9kZXM7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpc1snY3JlYXRlSmF2YVNjcmlwdEV2YWx1YXRvckJsb2NrJ10gPSBmdW5jdGlvbihzY3JpcHQpIHtcbiAgICAgICAgICAgIHJldHVybiBcInt7a29fY29kZSAoKGZ1bmN0aW9uKCkgeyByZXR1cm4gXCIgKyBzY3JpcHQgKyBcIiB9KSgpKSB9fVwiO1xuICAgICAgICB9O1xuXG4gICAgICAgIHRoaXNbJ2FkZFRlbXBsYXRlJ10gPSBmdW5jdGlvbih0ZW1wbGF0ZU5hbWUsIHRlbXBsYXRlTWFya3VwKSB7XG4gICAgICAgICAgICBkb2N1bWVudC53cml0ZShcIjxzY3JpcHQgdHlwZT0ndGV4dC9odG1sJyBpZD0nXCIgKyB0ZW1wbGF0ZU5hbWUgKyBcIic+XCIgKyB0ZW1wbGF0ZU1hcmt1cCArIFwiPFwiICsgXCIvc2NyaXB0PlwiKTtcbiAgICAgICAgfTtcblxuICAgICAgICBpZiAoalF1ZXJ5VG1wbFZlcnNpb24gPiAwKSB7XG4gICAgICAgICAgICBqUXVlcnlJbnN0YW5jZVsndG1wbCddWyd0YWcnXVsna29fY29kZSddID0ge1xuICAgICAgICAgICAgICAgIG9wZW46IFwiX18ucHVzaCgkMSB8fCAnJyk7XCJcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBqUXVlcnlJbnN0YW5jZVsndG1wbCddWyd0YWcnXVsna29fd2l0aCddID0ge1xuICAgICAgICAgICAgICAgIG9wZW46IFwid2l0aCgkMSkge1wiLFxuICAgICAgICAgICAgICAgIGNsb3NlOiBcIn0gXCJcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAga28uanF1ZXJ5VG1wbFRlbXBsYXRlRW5naW5lLnByb3RvdHlwZSA9IG5ldyBrby50ZW1wbGF0ZUVuZ2luZSgpO1xuICAgIGtvLmpxdWVyeVRtcGxUZW1wbGF0ZUVuZ2luZS5wcm90b3R5cGUuY29uc3RydWN0b3IgPSBrby5qcXVlcnlUbXBsVGVtcGxhdGVFbmdpbmU7XG5cbiAgICAvLyBVc2UgdGhpcyBvbmUgYnkgZGVmYXVsdCAqb25seSBpZiBqcXVlcnkudG1wbCBpcyByZWZlcmVuY2VkKlxuICAgIHZhciBqcXVlcnlUbXBsVGVtcGxhdGVFbmdpbmVJbnN0YW5jZSA9IG5ldyBrby5qcXVlcnlUbXBsVGVtcGxhdGVFbmdpbmUoKTtcbiAgICBpZiAoanF1ZXJ5VG1wbFRlbXBsYXRlRW5naW5lSW5zdGFuY2UualF1ZXJ5VG1wbFZlcnNpb24gPiAwKVxuICAgICAgICBrby5zZXRUZW1wbGF0ZUVuZ2luZShqcXVlcnlUbXBsVGVtcGxhdGVFbmdpbmVJbnN0YW5jZSk7XG5cbiAgICBrby5leHBvcnRTeW1ib2woJ2pxdWVyeVRtcGxUZW1wbGF0ZUVuZ2luZScsIGtvLmpxdWVyeVRtcGxUZW1wbGF0ZUVuZ2luZSk7XG59KSgpO1xufSkpO1xufSgpKTtcbn0pKCk7XG4iLCJcbi8vIEJpbmRzIHRoZSB2YWx1ZSBvZiB4IHRvIHZhbHVlIGF0IGxvY2F0aW9uIGZpcmViYXNlLlxuZXhwb3J0cy5iaW5kVmFsID0gZnVuY3Rpb24oZmlyZWJhc2UsIHgpIHtcbiAgZmlyZWJhc2Uub24oXCJ2YWx1ZVwiLCBzbmFwc2hvdCA9PiB4ID0gc25hcHNob3QudmFsKCkpO1xufTtcblxuLy8gQmluZHMgdGhlIGZ1bmN0aW9uIGYgdG8gdGhlIHZhbHVlIGF0IGxvY2F0aW9uIGZpcmViYXNlLlxuLy8gV2hlbmV2ZXIgdGhlIGZpcmViYXNlIHZhbHVlIGNoYW5nZXMsIGYgaXMgY2FsbGVkIHdpdGggdGhlIG5ldyB2YWx1ZS5cbmV4cG9ydHMuYmluZEZ1bmMgPSBmdW5jdGlvbihmaXJlYmFzZSwgZikge1xuICBmaXJlYmFzZS5vbihcInZhbHVlXCIsIHNuYXBzaG90ID0+IGYoc25hcHNob3QudmFsKCkpKTtcbn07XG5cbi8vIFJldHVybnMgYSByYW5kb20gZWxlbWVudCBvZiB0aGUgYXJyYXkuXG5leHBvcnRzLnJhbmRvbVBpY2sgPSBmdW5jdGlvbihhcnJheSkge1xuICByZXR1cm4gYXJyYXlbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpKmFycmF5Lmxlbmd0aCldO1xufTtcblxuLy8gUmV0dXJucyBhbiBhcnJheSBvZiB1bmlxdWUgcmFuZG9tIGVsZW1lbnRzIG9mIGFuIGFycmF5LlxuZXhwb3J0cy5yYW5kb21QaWNrcyA9IGZ1bmN0aW9uKGFycmF5LCBuKSB7XG4gIGFycmF5ID0gYXJyYXkuc2xpY2UoKTsgLy8gQ2xvbmUgYXJyYXkgc28gYXMgbm90IHRvIG11dGF0ZSBpdC5cbiAgdmFyIHBpY2tzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoICYmIGkgPCBuOyBpKyspIHtcbiAgICB2YXIgaW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqYXJyYXkubGVuZ3RoKTtcbiAgICBwaWNrcy5wdXNoKGFycmF5LnNwbGljZShpbmRleCwgMSlbMF0pO1xuICB9XG4gIHJldHVybiBwaWNrcztcbn07XG5cbi8vIEluc2VydHMgaXRlbSBpbnRvIGFycmF5IGF0IGEgcmFuZG9tIGxvY2F0aW9uLlxuLy8gUmV0dXJucyB0aGUgYXJyYXkgZm9yIGNvbnZlbmllbmNlLlxuZXhwb3J0cy5yYW5kb21JbnNlcnQgPSBmdW5jdGlvbihhcnJheSwgaXRlbSkge1xuICB2YXIgc3BsaWNlSW5kZXggPSBNYXRoLmZsb29yKChhcnJheS5sZW5ndGgrMSkqTWF0aC5yYW5kb20oKSk7XG4gIGFycmF5LnNwbGljZShzcGxpY2VJbmRleCwgMCwgaXRlbSk7XG59O1xuXG4vLyBPYmplY3QgZm9yRWFjaCwgY2FsbHMgZnVuYyB3aXRoICh2YWwsIGtleSlcbmV4cG9ydHMuZm9yRWFjaCA9IGZ1bmN0aW9uKG9iaiwgZnVuYykge1xuICBPYmplY3Qua2V5cyhvYmopLmZvckVhY2goa2V5ID0+IGZ1bmMob2JqW2tleV0sIGtleSkpO1xufTtcblxuZXhwb3J0cy5zaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLmxlbmd0aDtcbn07XG5cbmV4cG9ydHMudmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChrZXkgPT4ge1xuICAgIHJldHVybiBvYmpba2V5XTtcbiAgfSk7XG59O1xuXG5leHBvcnRzLmZpbmQgPSBmdW5jdGlvbihhcnIsIGNvbmQpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoY29uZChhcnJbaV0pKSB7XG4gICAgICByZXR1cm4gYXJyW2ldO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuZXhwb3J0cy5maW5kSW5kZXggPSBmdW5jdGlvbihhcnIsIGNvbmQpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoY29uZChhcnJbaV0pKSB7XG4gICAgICByZXR1cm4gaTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIC0xO1xufTtcblxuZXhwb3J0cy5maW5kS2V5ID0gZnVuY3Rpb24ob2JqLCBjb25kKSB7XG4gIGZvciAodmFyIGtleSBpbiBvYmopIHtcbiAgICBpZiAoY29uZChvYmpba2V5XSwga2V5KSkge1xuICAgICAgcmV0dXJuIGtleTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmV4cG9ydHMuY29udGFpbnMgPSBmdW5jdGlvbihhcnIsIGl0ZW0pIHtcbiAgcmV0dXJuIGFyci5pbmRleE9mKGl0ZW0pICE9PSAtMTtcbn07XG5cbi8vIEV2YWx1YXRlcyBhbiBvYnNBcnJheSBvZiBvYnNlcnZhYmxlc1xuZXhwb3J0cy5ldmFsdWF0ZSA9IGZ1bmN0aW9uKG9ic0FycmF5KSB7XG4gIHJldHVybiBvYnNBcnJheSgpLm1hcCh2YWwgPT4gdmFsKCkpO1xufTtcblxuLy8gT3B0aW9ucyBzaG91bGQgaGF2ZSB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4vLyB0ZXh0IC0gbWFpbiB0ZXh0IGNvbnRlbnRcbi8vIGJ1dHRvblRleHQgLSBidXR0b24gdGl0bGVcbi8vIGJ1dHRvbkZ1bmMgLSBidXR0b24gZXhlY3V0ZSBmdW5jdGlvblxuZXhwb3J0cy5hbGVydCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgY29uc29sZS53YXJuKCdBTEVSVCcpO1xuICB2YXIgZG9tID0gXCI8ZGl2IGNsYXNzPSdhbGVydCc+XCIgK1xuICAgIFwiPGRpdiBjbGFzcz0nYWxlcnRfdGV4dCc+XCIgKyBvcHRpb25zLnRleHQgKyBcIjwvZGl2PlwiICtcbiAgICBcIjxidXR0b24gY2xhc3M9J2FsZXJ0X2J1dHRvbicgdHlwZT0nYnV0dG9uJz5cIiArIG9wdGlvbnMuYnV0dG9uVGV4dCArIFwiPC9idXR0b24+XCIgK1xuICBcIjwvZGl2PlwiO1xuICAkKCcjZ2FtZV9jb250ZW50JykuaGlkZSgpO1xuICAkKCdib2R5JykucHJlcGVuZChkb20pO1xuICAkKCcuYWxlcnRfYnV0dG9uJykub24oJ2NsaWNrJywgKCkgPT4ge1xuICAgICQoJy5hbGVydCcpLnJlbW92ZSgpO1xuICAgICQoJyNnYW1lX2NvbnRlbnQnKS5zaG93KCk7XG4gICAgb3B0aW9ucy5idXR0b25GdW5jKCk7XG4gIH0pO1xufTtcbiJdfQ==
