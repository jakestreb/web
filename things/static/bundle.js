(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

var Game = require('./Game.js');
var util = require('./util.js');

// Handles log in and creating a game
function App() {
  this.database = new Firebase('https://thingswithbeth.firebaseio.com/');

  this.urlGameKey = null;
  this.urlPlayerKey = null;

  this.game = null;

  this.jsonData = null;

  // Load JSON data
  _loadJSON(response => this.jsonData = JSON.parse(response));

  this.database.once('value', snapshot => {
    this.attemptURLConnect(snapshot);
    $('#join').on('click', this.onJoinButton.bind(this, snapshot));
    $('#host').on('click', this.onHostButton.bind(this, snapshot));
    $('#watch').on('click', this.onJoinButton.bind(this, snapshot, true));
  });
}

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

App.prototype.onHostButton = function(snapshot) {
  var animal = "";
  var currentAnimals = [];
  snapshot.forEach(game => currentAnimals.push(game.val().animal));
  // Keep trying to get an animal not currently in use
  // TODO: Inefficient, stalls forever if all animals in use
  do {
    animal = util.randomPick(this.jsonData.animals);
  } while (currentAnimals.indexOf(animal) > 0);

  var gameObj = this.database.push({
    round: 1,
    state: State.INIT,
    animal: animal
  });
  window.location.hash = "/%g" + gameObj.key();

  var name = $('#name').val().toUpperCase();
  var gender = this.jsonData.gender[name] || util.randomPick(["male", "female"]);

  var playerObj = gameObj.child("players").push({
    name: name,
    isHost: true,
    gender: gender
  });
  window.location.hash += "/%u" + playerObj.key();

  this.game = new Game(this, gameObj, playerObj);
};

App.prototype.onJoinButton = function(snapshot, watchOnly) {
  var animalInput = $('#game').val();
  var found = false;
  snapshot.forEach(game => {
    if (game.val().animal === animalInput) {
      found = true;
      var gameKey = game.key();
      var gameObj = snapshot.child(gameKey).ref();
      window.location.hash = "/%g" + gameKey;

      var name = $('#name').val().toUpperCase();
      var gender = this.jsonData.gender[name] || util.randomPick(["male", "female"]);

      var playerObj = gameObj.child("players").push({
        name: name,
        isHost: false,
        gender: gender
      });
      window.location.hash += "/%u" + playerObj.key();

      this.game = new Game(this, gameObj, playerObj);
    }
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

},{"./Game.js":2,"./util.js":8}],2:[function(require,module,exports){

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

},{"./Players.js":3,"./Poll.js":4,"./Responses.js":5,"./State.js":6,"./util.js":8}],3:[function(require,module,exports){

var util = require('./util.js');

// Handles creation and maintenance of the list of players
function Players(game) {
  this.game = game;
  this.gameObj = game.gameObj;
  this.playersInfo = null;

  util.bindFunc(this.gameObj.child('players'), this.onPlayersUpdate.bind(this));
  this.gameObj.child('players').on('child_removed', this.onPlayerRemoved.bind(this));
}

Players.prototype.count = function() {
  return util.size(this.playersInfo);
};

Players.prototype.onPlayerRemoved = function(playerObj) {
  var removedKey = playerObj.key();
  if (removedKey === this.game.playerObj.key()) {
    // You have been removed
    window.location.hash = ""; // Clears URL suffix
    $(document.body).load('index.html');
  } else {
    $('.player.' + removedKey).remove();
  }
};

Players.prototype.onPlayersUpdate = function(newPlayersInfo) {
  newPlayersInfo = newPlayersInfo || {};
  // Update Dom for each player
  util.forEach(newPlayersInfo, this.updatePlayerDom.bind(this));
  // Save data to client
  this.playersInfo = newPlayersInfo;
};

Players.prototype.updatePlayerDom = function(player, key) {
  if (!this.playersInfo || !(key in this.playersInfo)) {
    // Player not in client
    $("#players").append(this.buildPlayerDom(player, key));
    // Re-apply remove handler
    $('.remove.'+key).on('click', this.game.removeFromGame.bind(this.game, key));
  }
  else {
    // Player in client
    var clientPlayer = this.playersInfo[key];
    var speechDir = util.randomPick(["left", "right"]);
    var playerDom = $(".player." + key);
    if (player.vote !== clientPlayer.vote) {
      var bubble = playerDom.find(".speech_bubble_" + speechDir);
      bubble.show();
      bubble.find('.speech').html(player.vote.toUpperCase());
    }
    // TODO: Update other properties
  }
};

// Returns a single instance of a player DOM item
Players.prototype.buildPlayerDom = function(player, key) {
  var playerKey = this.game.playerObj.key();
  var isUser = key === playerKey;
  return "<div class='player " + key + "'>" +
      (this.game.isHost && key !== playerKey ?
        "<span class='remove " + key + "'>x</span>" : "") +
      "<img class='avatar' src='res/" + player.gender + "_blue.png'>" +
      "<div class='speech_bubble speech_bubble_left'>" +
        "<div class='speech speech_left'></div>" +
        "<div class='pointer_left'></div>" +
      "</div>" +
      "<div class='speech_bubble speech_bubble_right'>" +
        "<div class='speech speech_right'></div>" +
        "<div class='pointer_right'></div>" +
      "</div>" +
      "<div class='banner'>" +
        "<div class='nametag'>" + player.name + "</div>" +
        "<div class='banner_left_fold'></div>" +
        "<div class='banner_left_fringe'></div>" +
        "<div class='banner_right_fold'></div>" +
        "<div class='banner_right_fringe'></div>" +
      "</div>" +
    "</div>";
};

Players.prototype.onRemovePlayer = function(snapshot) {
  var key = snapshot.key();
  $('.player.' + key).remove();
};

Players.prototype.shh = function() {
  $('.speech_bubble').hide();
};

module.exports = Players;

},{"./util.js":8}],4:[function(require,module,exports){

var State = require('./State.js');
var util = require('./util.js');

var DURATION = 3000;

// Handles creation of the list of questions and the poll process
function Poll(game) {
  this.game = game;
  this.timer = new Timer();

  this.pollObj = this.game.gameObj.child('poll');

  this.choicesInfo = null;
  this.votesInfo = null;
  this.timeout = null;

  this.count = { a: 0, b: 0, c: 0 };

  util.bindFunc(this.pollObj.child('choices'), this.onChoicesUpdate.bind(this));
  util.bindFunc(this.pollObj.child('votes'), this.onVotesUpdate.bind(this));
  util.bindFunc(this.pollObj.child('timeout'), this.onTimeoutChange.bind(this));

  $("#a").on('click', this.onVote.bind(this, 'a'));
  $("#b").on('click', this.onVote.bind(this, 'b'));
  $("#c").on('click', this.onVote.bind(this, 'c'));
}

Poll.prototype.pickChoices = function() {
  // TODO: Picked questions should not allow repeats
  var allQuestions = this.game.app.jsonData.questions;
  this.game.gameObj.update({
    responses: null,
    poll: {
      choices: {
        a: util.randomPick(allQuestions),
        b: util.randomPick(allQuestions),
        c: util.randomPick(allQuestions)
      }
    }
  });
};

Poll.prototype.onChoicesUpdate = function(choicesInfo) {
  this.choicesInfo = choicesInfo || {};
  util.forEach(this.choicesInfo, (choice, letter) => $('#choice_' + letter).html(choice));
  // If no choices, remove dom
  if (util.size(this.choicesInfo) === 0) {
    $('.choice').each((i, match) => {
      match.innerHTML = "";
    });
  }
  this.hasVoted = false;
};

Poll.prototype.onVotesUpdate = function(votesInfo) {
  // Build all markers to indicate voters
  // TODO: Currently builds all from scratch on any change
  this.votesInfo = votesInfo || {};
  this.count = { a: 0, b: 0, c: 0 };
  util.forEach(this.votesInfo, voteData => this.count[voteData.vote]++);
  // Print current counts in each selection
  util.forEach(this.count, (val, key) => $('#voters_' + key).html(val));

  var numVoters = util.size(this.votesInfo);

  // If no one has voted (initial state), clear vote counts
  if (numVoters === 0) {
    $('.voters').each((i, match) => match.innerHTML = "");
  }
  // If someone voted, set the timeout.
  if (numVoters > 0 && !this.timeout) {
    this.pollObj.update({timeout: Date.now() + DURATION});
  }
  // If everyone voted, pick question and change state to respond.
  if (numVoters === this.game.players.count() && false) {
    this.timer.stop();
  }
};

Poll.prototype.onTimeoutChange = function(timeout) {
  this.timeout = timeout;
  if (timeout) {
    this.timer.start(timeout, () => {
      if (this.game.isHost) {
        this.pickWinner();
      }
    });
  }
};

Poll.prototype.onVote = function(choice) {
  var personalVote = util.find(Object.keys(this.votesInfo), voteKey => {
    return this.votesInfo[voteKey].playerKey === this.game.playerObj.key();
  });
  if (personalVote) {
    return;
  }
  this.pollObj.child('votes').push({
    name: this.game.playerName,
    playerKey: this.game.playerObj.key(),
    vote: choice
  });
  this.game.playerObj.child('vote').set(choice);
};

Poll.prototype.pickWinner = function() {
  var maxVotes = Math.max.apply(null, util.values(this.count));
  var finalists = Object.keys(this.count).filter(choice => {
    return this.count[choice] === maxVotes;
  });
  this.game.gameObj.update({
    question: this.choicesInfo[util.randomPick(finalists)],
    state: State.RESPOND,
    timeout: null
  });
};

// A simple countdown timer
function Timer() {
  this.intervalId = null;
  this.isRunning = false;
  this.stopCallback = () => {};
}

Timer.prototype.start = function(timeout, stopCallback) {
  if (this.isRunning) {
    return;
  }
  this.isRunning = true;
  this.stopCallback = stopCallback;
  this.intervalId = window.setInterval(this.buildDom.bind(this), 10, timeout);
};

Timer.prototype.buildDom = function(timeout) {
  var time = Date.now();
  var ms;
  // var seconds = Math.floor(ms / 1000);
  // var tenths = Math.floor((ms / 100) % 10);
  // $("#timer").html(ms < 0 ? ms : seconds + "." + tenths);
  var half = DURATION / 2;
  var halftime = timeout - half;
  var frac;
  var deg;
  if (time < halftime) {
    $('.mask_slice').hide();
    $('.slice').show();
    // Slice goes 90deg -> 270deg
    frac = 1 - ((halftime - time) / half);
    deg = (frac * 180);
    console.warn(frac, deg);
    $('.slice').css('transform', 'rotate(' + deg + 'deg)');
  }
  else if (time < timeout) {
    $('.slice').hide();
    $('.mask_slice').show();
    frac = 1 - ((timeout - time) / half);
    deg = (frac * 180);
    $('.mask_slice').css('transform', 'rotate(' + deg + 'deg)');
  }
  else {
    this.stop();
  }
};

Timer.prototype.stop = function() {
  window.clearInterval(this.intervalId);
  $("#timer").html("");
  this.isRunning = false;
  this.stopCallback();
};

module.exports = Poll;

},{"./State.js":6,"./util.js":8}],5:[function(require,module,exports){

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

},{"./State.js":6,"./util.js":8}],6:[function(require,module,exports){

State = {
  INIT: 1,
  POLL: 2,
  RESPOND: 3,
  GUESS: 4
};

module.exports = State;

},{}],7:[function(require,module,exports){

var App = require('./App.js');

// TODO Features:
// - End game (host)
// - Report guessed for any response (host)
// - Allow players to sit out a round, or host to make them
// - List of active games to join (instead of type in)
// - Games inactive more than 12hr are removed when looked up (add timestamp game actions)
// - Scoring
// - Notify when host is disconnected (since game will stop running)

window.onload = new App();

},{"./App.js":1}],8:[function(require,module,exports){

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

// Inserts item into array at a random location.
// Returns the array for convenience.
exports.randomInsert = function(array, item) {
  var spliceIndex = Math.floor((array.length+1)*Math.random());
  array.splice(spliceIndex, 0, item);
};

// Object forEach, calls callback with (val, key)
exports.forEach = function(obj, callback) {
  Object.keys(obj).forEach(key => callback(obj[key], key));
};

exports.size = function(obj) {
  return Object.keys(obj).length;
};

exports.values = function(obj) {
  return Object.keys(obj).map(key => {
    return obj[key];
  });
};

exports.find = function(arr, callback) {
  for (var i = 0; i < arr.length; i++) {
    if (callback(arr[i])) {
      return arr[i];
    }
  }
  return undefined;
};

},{}]},{},[7])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJBcHAuanMiLCJHYW1lLmpzIiwiUGxheWVycy5qcyIsIlBvbGwuanMiLCJSZXNwb25zZXMuanMiLCJTdGF0ZS5qcyIsImluZGV4LmpzIiwidXRpbC5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUlBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN0ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbiBlKHQsbixyKXtmdW5jdGlvbiBzKG8sdSl7aWYoIW5bb10pe2lmKCF0W29dKXt2YXIgYT10eXBlb2YgcmVxdWlyZT09XCJmdW5jdGlvblwiJiZyZXF1aXJlO2lmKCF1JiZhKXJldHVybiBhKG8sITApO2lmKGkpcmV0dXJuIGkobywhMCk7dmFyIGY9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitvK1wiJ1wiKTt0aHJvdyBmLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsZn12YXIgbD1uW29dPXtleHBvcnRzOnt9fTt0W29dWzBdLmNhbGwobC5leHBvcnRzLGZ1bmN0aW9uKGUpe3ZhciBuPXRbb11bMV1bZV07cmV0dXJuIHMobj9uOmUpfSxsLGwuZXhwb3J0cyxlLHQsbixyKX1yZXR1cm4gbltvXS5leHBvcnRzfXZhciBpPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7Zm9yKHZhciBvPTA7bzxyLmxlbmd0aDtvKyspcyhyW29dKTtyZXR1cm4gc30pIiwiXG52YXIgR2FtZSA9IHJlcXVpcmUoJy4vR2FtZS5qcycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwuanMnKTtcblxuLy8gSGFuZGxlcyBsb2cgaW4gYW5kIGNyZWF0aW5nIGEgZ2FtZVxuZnVuY3Rpb24gQXBwKCkge1xuICB0aGlzLmRhdGFiYXNlID0gbmV3IEZpcmViYXNlKCdodHRwczovL3RoaW5nc3dpdGhiZXRoLmZpcmViYXNlaW8uY29tLycpO1xuXG4gIHRoaXMudXJsR2FtZUtleSA9IG51bGw7XG4gIHRoaXMudXJsUGxheWVyS2V5ID0gbnVsbDtcblxuICB0aGlzLmdhbWUgPSBudWxsO1xuXG4gIHRoaXMuanNvbkRhdGEgPSBudWxsO1xuXG4gIC8vIExvYWQgSlNPTiBkYXRhXG4gIF9sb2FkSlNPTihyZXNwb25zZSA9PiB0aGlzLmpzb25EYXRhID0gSlNPTi5wYXJzZShyZXNwb25zZSkpO1xuXG4gIHRoaXMuZGF0YWJhc2Uub25jZSgndmFsdWUnLCBzbmFwc2hvdCA9PiB7XG4gICAgdGhpcy5hdHRlbXB0VVJMQ29ubmVjdChzbmFwc2hvdCk7XG4gICAgJCgnI2pvaW4nKS5vbignY2xpY2snLCB0aGlzLm9uSm9pbkJ1dHRvbi5iaW5kKHRoaXMsIHNuYXBzaG90KSk7XG4gICAgJCgnI2hvc3QnKS5vbignY2xpY2snLCB0aGlzLm9uSG9zdEJ1dHRvbi5iaW5kKHRoaXMsIHNuYXBzaG90KSk7XG4gICAgJCgnI3dhdGNoJykub24oJ2NsaWNrJywgdGhpcy5vbkpvaW5CdXR0b24uYmluZCh0aGlzLCBzbmFwc2hvdCwgdHJ1ZSkpO1xuICB9KTtcbn1cblxuQXBwLnByb3RvdHlwZS5hdHRlbXB0VVJMQ29ubmVjdCA9IGZ1bmN0aW9uKHNuYXBzaG90KSB7XG4gIC8vIEdldCBrZXlzIGZyb20gVVJMXG4gIHZhciB1cmxJdGVtcyA9IHdpbmRvdy5sb2NhdGlvbi5oYXNoLnNwbGl0KFwiL1wiKTtcbiAgdXJsSXRlbXMuZm9yRWFjaChpdGVtID0+IHtcbiAgICBzd2l0Y2ggKGl0ZW0uc2xpY2UoMCwgMikpIHtcbiAgICAgIGNhc2UgXCIlZ1wiOlxuICAgICAgICB0aGlzLnVybEdhbWVLZXkgPSBpdGVtLnNsaWNlKDIpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgXCIldVwiOlxuICAgICAgICB0aGlzLnVybFBsYXllcktleSA9IGl0ZW0uc2xpY2UoMik7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfSk7XG5cbiAgLy8gSWYgVVJMIGRvZXNuJ3QgY29udGFpbiBpbmZvcm1hdGlvbiwgVVJMIGNvbm5lY3Rpb24gZmFpbHNcbiAgaWYgKCF0aGlzLnVybEdhbWVLZXkpIHtcbiAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiXCI7IC8vIENsZWFycyBVUkwgc3VmZml4XG4gICAgcmV0dXJuO1xuICB9XG5cbiAgLy8gSW5pdGlhbGl6ZSBnYW1lL3BsYXllciBiYXNlZCBvbiBVUkxcbiAgdmFyIGdhbWVzID0gc25hcHNob3QudmFsKCk7XG5cbiAgLy8gUmV0cmlldmUgZ2FtZSBpZiBpbiBkYXRhYmFzZSwgYnJlYWsgaWYgbm90XG4gIGlmICghZ2FtZXMgfHwgISh0aGlzLnVybEdhbWVLZXkgaW4gZ2FtZXMpKSB7XG4gICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSBcIlwiOyAvLyBDbGVhcnMgVVJMIHN1ZmZpeFxuICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmV0cmlldmUgZ2FtZVwiKTtcbiAgICByZXR1cm47XG4gIH1cbiAgLy8gR2FtZSBhdmFpbGFibGVcbiAgdmFyIGdhbWVPYmogPSBzbmFwc2hvdC5jaGlsZCh0aGlzLnVybEdhbWVLZXkpLnJlZigpO1xuXG4gIHZhciBwbGF5ZXJzID0gZ2FtZXNbZ2FtZU9iai5rZXkoKV0ucGxheWVycztcbiAgaWYgKCF0aGlzLnVybFBsYXllcktleSB8fCAhcGxheWVycyB8fCAhKHRoaXMudXJsUGxheWVyS2V5IGluIHBsYXllcnMpKSB7XG4gICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSBcIi8lZ1wiICsgdGhpcy51cmxHYW1lS2V5OyAvLyBDbGVhcnMgcGxheWVyIHN1ZmZpeFxuICAgIGNvbnNvbGUuZXJyb3IoXCJGYWlsZWQgdG8gcmV0cmlldmUgcGxheWVyXCIpO1xuICAgIHRoaXMuZ2FtZSA9IG5ldyBHYW1lKHRoaXMsIGdhbWVPYmopO1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBQbGF5ZXIgYXZhaWxhYmxlXG4gIHZhciBwbGF5ZXJPYmogPSBnYW1lT2JqLmNoaWxkKFwicGxheWVyc1wiKS5jaGlsZCh0aGlzLnVybFBsYXllcktleSk7XG5cbiAgdGhpcy5nYW1lID0gbmV3IEdhbWUodGhpcywgZ2FtZU9iaiwgcGxheWVyT2JqKTtcbn07XG5cbkFwcC5wcm90b3R5cGUub25Ib3N0QnV0dG9uID0gZnVuY3Rpb24oc25hcHNob3QpIHtcbiAgdmFyIGFuaW1hbCA9IFwiXCI7XG4gIHZhciBjdXJyZW50QW5pbWFscyA9IFtdO1xuICBzbmFwc2hvdC5mb3JFYWNoKGdhbWUgPT4gY3VycmVudEFuaW1hbHMucHVzaChnYW1lLnZhbCgpLmFuaW1hbCkpO1xuICAvLyBLZWVwIHRyeWluZyB0byBnZXQgYW4gYW5pbWFsIG5vdCBjdXJyZW50bHkgaW4gdXNlXG4gIC8vIFRPRE86IEluZWZmaWNpZW50LCBzdGFsbHMgZm9yZXZlciBpZiBhbGwgYW5pbWFscyBpbiB1c2VcbiAgZG8ge1xuICAgIGFuaW1hbCA9IHV0aWwucmFuZG9tUGljayh0aGlzLmpzb25EYXRhLmFuaW1hbHMpO1xuICB9IHdoaWxlIChjdXJyZW50QW5pbWFscy5pbmRleE9mKGFuaW1hbCkgPiAwKTtcblxuICB2YXIgZ2FtZU9iaiA9IHRoaXMuZGF0YWJhc2UucHVzaCh7XG4gICAgcm91bmQ6IDEsXG4gICAgc3RhdGU6IFN0YXRlLklOSVQsXG4gICAgYW5pbWFsOiBhbmltYWxcbiAgfSk7XG4gIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gXCIvJWdcIiArIGdhbWVPYmoua2V5KCk7XG5cbiAgdmFyIG5hbWUgPSAkKCcjbmFtZScpLnZhbCgpLnRvVXBwZXJDYXNlKCk7XG4gIHZhciBnZW5kZXIgPSB0aGlzLmpzb25EYXRhLmdlbmRlcltuYW1lXSB8fCB1dGlsLnJhbmRvbVBpY2soW1wibWFsZVwiLCBcImZlbWFsZVwiXSk7XG5cbiAgdmFyIHBsYXllck9iaiA9IGdhbWVPYmouY2hpbGQoXCJwbGF5ZXJzXCIpLnB1c2goe1xuICAgIG5hbWU6IG5hbWUsXG4gICAgaXNIb3N0OiB0cnVlLFxuICAgIGdlbmRlcjogZ2VuZGVyXG4gIH0pO1xuICB3aW5kb3cubG9jYXRpb24uaGFzaCArPSBcIi8ldVwiICsgcGxheWVyT2JqLmtleSgpO1xuXG4gIHRoaXMuZ2FtZSA9IG5ldyBHYW1lKHRoaXMsIGdhbWVPYmosIHBsYXllck9iaik7XG59O1xuXG5BcHAucHJvdG90eXBlLm9uSm9pbkJ1dHRvbiA9IGZ1bmN0aW9uKHNuYXBzaG90LCB3YXRjaE9ubHkpIHtcbiAgdmFyIGFuaW1hbElucHV0ID0gJCgnI2dhbWUnKS52YWwoKTtcbiAgdmFyIGZvdW5kID0gZmFsc2U7XG4gIHNuYXBzaG90LmZvckVhY2goZ2FtZSA9PiB7XG4gICAgaWYgKGdhbWUudmFsKCkuYW5pbWFsID09PSBhbmltYWxJbnB1dCkge1xuICAgICAgZm91bmQgPSB0cnVlO1xuICAgICAgdmFyIGdhbWVLZXkgPSBnYW1lLmtleSgpO1xuICAgICAgdmFyIGdhbWVPYmogPSBzbmFwc2hvdC5jaGlsZChnYW1lS2V5KS5yZWYoKTtcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gXCIvJWdcIiArIGdhbWVLZXk7XG5cbiAgICAgIHZhciBuYW1lID0gJCgnI25hbWUnKS52YWwoKS50b1VwcGVyQ2FzZSgpO1xuICAgICAgdmFyIGdlbmRlciA9IHRoaXMuanNvbkRhdGEuZ2VuZGVyW25hbWVdIHx8IHV0aWwucmFuZG9tUGljayhbXCJtYWxlXCIsIFwiZmVtYWxlXCJdKTtcblxuICAgICAgdmFyIHBsYXllck9iaiA9IGdhbWVPYmouY2hpbGQoXCJwbGF5ZXJzXCIpLnB1c2goe1xuICAgICAgICBuYW1lOiBuYW1lLFxuICAgICAgICBpc0hvc3Q6IGZhbHNlLFxuICAgICAgICBnZW5kZXI6IGdlbmRlclxuICAgICAgfSk7XG4gICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCArPSBcIi8ldVwiICsgcGxheWVyT2JqLmtleSgpO1xuXG4gICAgICB0aGlzLmdhbWUgPSBuZXcgR2FtZSh0aGlzLCBnYW1lT2JqLCBwbGF5ZXJPYmopO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBGb3VuZCBvbmxpbmUsIEpTT04gcGFyc2UgZnVuY3Rpb25cbmZ1bmN0aW9uIF9sb2FkSlNPTihjYWxsYmFjaykge1xuICB2YXIgeG9iaiA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICB4b2JqLm92ZXJyaWRlTWltZVR5cGUoXCJhcHBsaWNhdGlvbi9qc29uXCIpO1xuICB4b2JqLm9wZW4oJ0dFVCcsICdkYXRhLmpzb24nLCB0cnVlKTtcbiAgeG9iai5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKHhvYmoucmVhZHlTdGF0ZSA9PSA0ICYmIHhvYmouc3RhdHVzID09IFwiMjAwXCIpIHtcbiAgICAgIC8vIFJlcXVpcmVkIHVzZSBvZiBhbiBhbm9ueW1vdXMgY2FsbGJhY2sgYXMgLm9wZW4gd2lsbCBOT1QgcmV0dXJuIGEgdmFsdWUgYnV0XG4gICAgICAvLyBzaW1wbHkgcmV0dXJucyB1bmRlZmluZWQgaW4gYXN5bmNocm9ub3VzIG1vZGVcbiAgICAgIGNhbGxiYWNrKHhvYmoucmVzcG9uc2VUZXh0KTtcbiAgICB9XG4gIH07XG4gIHhvYmouc2VuZChudWxsKTtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBBcHA7XG4iLCJcbnZhciBQbGF5ZXJzID0gcmVxdWlyZSgnLi9QbGF5ZXJzLmpzJyk7XG52YXIgUmVzcG9uc2VzID0gcmVxdWlyZSgnLi9SZXNwb25zZXMuanMnKTtcbnZhciBQb2xsID0gcmVxdWlyZSgnLi9Qb2xsLmpzJyk7XG52YXIgU3RhdGUgPSByZXF1aXJlKCcuL1N0YXRlLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG4vLyBIYW5kbGVzIHByZXBhcmluZyB0aGUgZ2FtZSBhbmQgbW92aW5nIGJldHdlZW4gc3RhdGVzXG5mdW5jdGlvbiBHYW1lKGFwcCwgZ2FtZU9iaiwgcGxheWVyT2JqKSB7XG4gIHRoaXMuYXBwID0gYXBwO1xuICB0aGlzLmdhbWVPYmogPSBnYW1lT2JqO1xuICB0aGlzLnBsYXllck9iaiA9IHBsYXllck9iajtcblxuICB0aGlzLmdhbWVOYW1lID0gbnVsbDtcbiAgdGhpcy5wbGF5ZXJOYW1lID0gbnVsbDtcbiAgdGhpcy5pc0hvc3QgPSBudWxsO1xuXG4gIHRoaXMuc3RhdGUgPSBTdGF0ZS5JTklUO1xuICB0aGlzLnJvdW5kID0gMTtcblxuICB0aGlzLnBsYXllcnMgPSBudWxsO1xuICB0aGlzLnJlc3BvbnNlcyA9IG51bGw7XG4gIHRoaXMucG9sbCA9IG51bGw7XG5cbiAgLy8gU2V0IHRoZSBnYW1lIGFuZCBwbGF5ZXIgbmFtZXMgYmVmb3JlIGJ1aWxkaW5nIHRoZSBkb21cbiAgZ2FtZU9iai5jaGlsZChcImFuaW1hbFwiKS5vbmNlKFwidmFsdWVcIikudGhlbihzbmFwc2hvdCA9PiB7XG4gICAgdGhpcy5nYW1lTmFtZSA9IHNuYXBzaG90LnZhbCgpO1xuICAgIHJldHVybiB0aGlzLnBsYXllck9iai5vbmNlKFwidmFsdWVcIik7XG4gIH0pLnRoZW4oc25hcHNob3QgPT4ge1xuICAgIHRoaXMucGxheWVyTmFtZSA9IHNuYXBzaG90LmNoaWxkKFwibmFtZVwiKS52YWwoKTtcbiAgICB0aGlzLmlzSG9zdCA9IHNuYXBzaG90LmNoaWxkKFwiaXNIb3N0XCIpLnZhbCgpO1xuICAgIHJldHVybiB0aGlzLmJ1aWxkRG9tKCk7XG4gIH0pLnRoZW4oKCkgPT4ge1xuICAgIHRoaXMucGxheWVycyA9IG5ldyBQbGF5ZXJzKHRoaXMpO1xuICAgIHRoaXMucmVzcG9uc2VzID0gbmV3IFJlc3BvbnNlcyh0aGlzKTtcbiAgICB0aGlzLnBvbGwgPSBuZXcgUG9sbCh0aGlzKTtcbiAgICB1dGlsLmJpbmRWYWwodGhpcy5nYW1lT2JqLmNoaWxkKCdyb3VuZCcpLCB0aGlzLnJvdW5kKTtcbiAgICB1dGlsLmJpbmRGdW5jKHRoaXMuZ2FtZU9iai5jaGlsZCgnc3RhdGUnKSwgdGhpcy5vblN0YXRlQ2hhbmdlLmJpbmQodGhpcykpO1xuICAgIHV0aWwuYmluZEZ1bmModGhpcy5nYW1lT2JqLmNoaWxkKCdxdWVzdGlvbicpLCB0aGlzLm9uUXVlc3Rpb25VcGRhdGUuYmluZCh0aGlzKSk7XG4gICAgdXRpbC5iaW5kRnVuYyh0aGlzLnBsYXllck9iai5jaGlsZCgnZ3Vlc3NlZCcpLCB0aGlzLm9uR3Vlc3NlZFVwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgICB1dGlsLmJpbmRGdW5jKHRoaXMucGxheWVyT2JqLmNoaWxkKCdyZXNwb25kZWQnKSwgdGhpcy5vblJlc3BvbmRlZFVwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgfSk7XG59XG5cbkdhbWUucHJvdG90eXBlLmJ1aWxkRG9tID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUud2FybignYnVpbGRpbmcgZ2FtZScpO1xuICB2YXIgbG9hZEJvZHkgPSAkLkRlZmVycmVkKCk7XG4gICQoZG9jdW1lbnQuYm9keSkubG9hZCgnZ2FtZS5odG1sJywgKCkgPT4gbG9hZEJvZHkucmVzb2x2ZSgpKTtcbiAgcmV0dXJuIGxvYWRCb2R5LnByb21pc2UoKS50aGVuKCgpID0+IHtcbiAgICAkKCcjaW5mb19jb250YWluZXInKS5odG1sKHRoaXMuZ2FtZU5hbWUpO1xuICAgICQoJyNzdWJtaXQnKS5vbignY2xpY2snLCB0aGlzLm9uU3VibWl0LmJpbmQodGhpcykpO1xuICAgICQoJyNndWVzc2VkJykub24oJ2NsaWNrJywgdGhpcy5vbkd1ZXNzZWQuYmluZCh0aGlzKSk7XG4gICAgJCgnI2xlYXZlJykub24oJ2NsaWNrJywgdGhpcy5yZW1vdmVGcm9tR2FtZS5iaW5kKHRoaXMsIHRoaXMucGxheWVyT2JqLmtleSgpKSk7XG4gICAgaWYgKHRoaXMuaXNIb3N0KSB7XG4gICAgICAkKCcjbmV3X3JvdW5kJykub24oJ2NsaWNrJywgdGhpcy5vbk5ld1JvdW5kQnV0dG9uLmJpbmQodGhpcykpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICQoJyNob3N0X3NldHRpbmdzJykuaGlkZSgpO1xuICAgIH1cbiAgfSk7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5vblN0YXRlQ2hhbmdlID0gZnVuY3Rpb24obmV3U3RhdGUpIHtcbiAgY29uc29sZS5sb2coJ3N0YXRlID0+ICcgKyBuZXdTdGF0ZSk7XG4gIHRoaXMuc3RhdGUgPSBuZXdTdGF0ZTtcbiAgLy8gVE9ETzogVXBkYXRlcyBzaG91bGQgb25seSBvY2N1ciBvbiB0cmFuc2l0aW9uXG4gIHN3aXRjaCAobmV3U3RhdGUpIHtcbiAgICBjYXNlIFN0YXRlLklOSVQ6XG4gICAgICB0aGlzLnBsYXllck9iai51cGRhdGUoe1xuICAgICAgICBndWVzc2VkOiBudWxsLFxuICAgICAgICByZXNwb25kZWQ6IG51bGxcbiAgICAgIH0pO1xuICAgICAgaWYgKHRoaXMuaXNIb3N0KSB7XG4gICAgICAgIHRoaXMuZ2FtZU9iai51cGRhdGUoe1xuICAgICAgICAgIHN0YXRlOiBTdGF0ZS5QT0xMLFxuICAgICAgICAgIHBvbGw6IG51bGwsXG4gICAgICAgICAgcmVzcG9uc2VzOiBudWxsLFxuICAgICAgICAgIHF1ZXN0aW9uOiBudWxsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBTdGF0ZS5QT0xMOlxuICAgICAgaWYgKHRoaXMuaXNIb3N0KSB7XG4gICAgICAgIHRoaXMucG9sbC5waWNrQ2hvaWNlcygpO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBTdGF0ZS5SRVNQT05EOlxuICAgICAgLy8gUmVtb3ZlIHBvbGwgZGF0YSBvbmNlIG5vIGxvbmdlciByZWxldmFudFxuICAgICAgdGhpcy5yZXNwb25zZXMud2FpdEZvckFsbCgpO1xuICAgICAgdGhpcy5wbGF5ZXJPYmouY2hpbGQoJ3Jlc3BvbmRlZCcpLnNldChmYWxzZSk7XG4gICAgICBpZiAodGhpcy5pc0hvc3QpIHtcbiAgICAgICAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwb2xsJykucmVtb3ZlKCk7XG4gICAgICB9XG4gICAgICBicmVhaztcbiAgICBjYXNlIFN0YXRlLkdVRVNTOlxuICAgICAgdGhpcy5wbGF5ZXJPYmoudXBkYXRlKHtcbiAgICAgICAgcmVzcG9uZGVkOiBudWxsLFxuICAgICAgICBndWVzc2VkOiBmYWxzZVxuICAgICAgfSk7XG4gICAgICB0aGlzLnJlc3BvbnNlcy5zaG93QWxsKCk7XG4gICAgICBicmVhaztcbiAgfVxufTtcblxuR2FtZS5wcm90b3R5cGUub25RdWVzdGlvblVwZGF0ZSA9IGZ1bmN0aW9uKHF1ZXN0aW9uKSB7XG4gIGlmIChxdWVzdGlvbikge1xuICAgICQoJyNxdWVzdGlvbicpLmh0bWwocXVlc3Rpb24pO1xuICB9IGVsc2Uge1xuICAgICQoJyNxdWVzdGlvbicpLmh0bWwoXCJcIik7XG4gIH1cbn07XG5cbkdhbWUucHJvdG90eXBlLm9uR3Vlc3NlZFVwZGF0ZSA9IGZ1bmN0aW9uKGd1ZXNzZWQpIHtcbiAgaWYgKGd1ZXNzZWQgPT09IGZhbHNlKSB7XG4gICAgJCgnI2d1ZXNzZWRfY29udGFpbmVyJykuc2hvdygpO1xuICB9IGVsc2Uge1xuICAgICQoJyNndWVzc2VkX2NvbnRhaW5lcicpLmhpZGUoKTtcbiAgfVxufTtcblxuR2FtZS5wcm90b3R5cGUub25SZXNwb25kZWRVcGRhdGUgPSBmdW5jdGlvbihyZXNwb25kZWQpIHtcbiAgaWYgKHJlc3BvbmRlZCA9PT0gZmFsc2UpIHtcbiAgICAkKCcjc3VibWl0X2NvbnRhaW5lcicpLnNob3coKTtcbiAgfSBlbHNlIHtcbiAgICAkKCcjc3VibWl0X2NvbnRhaW5lcicpLmhpZGUoKTtcbiAgfVxufTtcblxuR2FtZS5wcm90b3R5cGUub25OZXdSb3VuZEJ1dHRvbiA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdhbWVPYmoudXBkYXRlKHtcbiAgICBzdGF0ZTogU3RhdGUuSU5JVCxcbiAgICByb3VuZDogdGhpcy5yb3VuZCArIDEsXG4gIH0pO1xufTtcblxuR2FtZS5wcm90b3R5cGUucmVtb3ZlRnJvbUdhbWUgPSBmdW5jdGlvbihwbGF5ZXJLZXkpIHtcbiAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykuY2hpbGQocGxheWVyS2V5KS5yZW1vdmUoKTtcbiAgdmFyIHJlc3BvbnNlc0luZm8gPSB0aGlzLnJlc3BvbnNlcy5yZXNwb25zZXNJbmZvO1xuICAvLyBJZiB0aGUgcGxheWVyIGhhcyByZXNwb25zZWQsIHJlbW92ZSByZXNwb25zZVxuICBpZiAocmVzcG9uc2VzSW5mbyAhPT0gbnVsbCkge1xuICAgIHV0aWwuZm9yRWFjaChyZXNwb25zZXNJbmZvLCAodmFsLCBrZXkpID0+IHtcbiAgICAgIGlmICh2YWwua2V5ID09PSBwbGF5ZXJLZXkpIHtcbiAgICAgICAgdGhpcy5nYW1lT2JqLmNoaWxkKCdyZXNwb25zZXMnKS5jaGlsZChrZXkpLnJlbW92ZSgpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59O1xuXG5HYW1lLnByb3RvdHlwZS5vblN1Ym1pdCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgaW5wdXQgPSAkKFwiI3Jlc3BvbnNlXCIpLnZhbCgpO1xuICBpZiAoaW5wdXQgPT09IFwiXCIpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5wbGF5ZXJPYmouY2hpbGQoJ3Jlc3BvbmRlZCcpLnNldCh0cnVlKTtcbiAgdGhpcy5nYW1lT2JqLmNoaWxkKCdyZXNwb25zZXMnKS5wdXNoKHtcbiAgICBrZXk6IHRoaXMucGxheWVyT2JqLmtleSgpLFxuICAgIHJlc3BvbnNlOiBpbnB1dFxuICB9KTtcbn07XG5cbkdhbWUucHJvdG90eXBlLm9uR3Vlc3NlZCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLnBsYXllck9iai5jaGlsZCgnZ3Vlc3NlZCcpLnNldCh0cnVlKTtcbiAgLy8gTG9vayBpbnRvIHJlc3BvbnNlc0luZm8sIGZpbmQgeW91ciByZXNwb25zZSBhbmQgZWxpbWluYXRlIGl0XG4gIHV0aWwuZm9yRWFjaCh0aGlzLnJlc3BvbnNlcy5yZXNwb25zZXNJbmZvLCAodmFsLCBrZXkpID0+IHtcbiAgICBpZiAodmFsLmtleSA9PT0gdGhpcy5wbGF5ZXJPYmoua2V5KCkpIHtcbiAgICAgIHRoaXMuZ2FtZU9iai5jaGlsZCgncmVzcG9uc2VzJykuY2hpbGQoa2V5KS51cGRhdGUoe1xuICAgICAgICBlbGltaW5hdGVkOiB0cnVlXG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBHYW1lO1xuIiwiXG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG4vLyBIYW5kbGVzIGNyZWF0aW9uIGFuZCBtYWludGVuYW5jZSBvZiB0aGUgbGlzdCBvZiBwbGF5ZXJzXG5mdW5jdGlvbiBQbGF5ZXJzKGdhbWUpIHtcbiAgdGhpcy5nYW1lID0gZ2FtZTtcbiAgdGhpcy5nYW1lT2JqID0gZ2FtZS5nYW1lT2JqO1xuICB0aGlzLnBsYXllcnNJbmZvID0gbnVsbDtcblxuICB1dGlsLmJpbmRGdW5jKHRoaXMuZ2FtZU9iai5jaGlsZCgncGxheWVycycpLCB0aGlzLm9uUGxheWVyc1VwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykub24oJ2NoaWxkX3JlbW92ZWQnLCB0aGlzLm9uUGxheWVyUmVtb3ZlZC5iaW5kKHRoaXMpKTtcbn1cblxuUGxheWVycy5wcm90b3R5cGUuY291bnQgPSBmdW5jdGlvbigpIHtcbiAgcmV0dXJuIHV0aWwuc2l6ZSh0aGlzLnBsYXllcnNJbmZvKTtcbn07XG5cblBsYXllcnMucHJvdG90eXBlLm9uUGxheWVyUmVtb3ZlZCA9IGZ1bmN0aW9uKHBsYXllck9iaikge1xuICB2YXIgcmVtb3ZlZEtleSA9IHBsYXllck9iai5rZXkoKTtcbiAgaWYgKHJlbW92ZWRLZXkgPT09IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCkpIHtcbiAgICAvLyBZb3UgaGF2ZSBiZWVuIHJlbW92ZWRcbiAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiXCI7IC8vIENsZWFycyBVUkwgc3VmZml4XG4gICAgJChkb2N1bWVudC5ib2R5KS5sb2FkKCdpbmRleC5odG1sJyk7XG4gIH0gZWxzZSB7XG4gICAgJCgnLnBsYXllci4nICsgcmVtb3ZlZEtleSkucmVtb3ZlKCk7XG4gIH1cbn07XG5cblBsYXllcnMucHJvdG90eXBlLm9uUGxheWVyc1VwZGF0ZSA9IGZ1bmN0aW9uKG5ld1BsYXllcnNJbmZvKSB7XG4gIG5ld1BsYXllcnNJbmZvID0gbmV3UGxheWVyc0luZm8gfHwge307XG4gIC8vIFVwZGF0ZSBEb20gZm9yIGVhY2ggcGxheWVyXG4gIHV0aWwuZm9yRWFjaChuZXdQbGF5ZXJzSW5mbywgdGhpcy51cGRhdGVQbGF5ZXJEb20uYmluZCh0aGlzKSk7XG4gIC8vIFNhdmUgZGF0YSB0byBjbGllbnRcbiAgdGhpcy5wbGF5ZXJzSW5mbyA9IG5ld1BsYXllcnNJbmZvO1xufTtcblxuUGxheWVycy5wcm90b3R5cGUudXBkYXRlUGxheWVyRG9tID0gZnVuY3Rpb24ocGxheWVyLCBrZXkpIHtcbiAgaWYgKCF0aGlzLnBsYXllcnNJbmZvIHx8ICEoa2V5IGluIHRoaXMucGxheWVyc0luZm8pKSB7XG4gICAgLy8gUGxheWVyIG5vdCBpbiBjbGllbnRcbiAgICAkKFwiI3BsYXllcnNcIikuYXBwZW5kKHRoaXMuYnVpbGRQbGF5ZXJEb20ocGxheWVyLCBrZXkpKTtcbiAgICAvLyBSZS1hcHBseSByZW1vdmUgaGFuZGxlclxuICAgICQoJy5yZW1vdmUuJytrZXkpLm9uKCdjbGljaycsIHRoaXMuZ2FtZS5yZW1vdmVGcm9tR2FtZS5iaW5kKHRoaXMuZ2FtZSwga2V5KSk7XG4gIH1cbiAgZWxzZSB7XG4gICAgLy8gUGxheWVyIGluIGNsaWVudFxuICAgIHZhciBjbGllbnRQbGF5ZXIgPSB0aGlzLnBsYXllcnNJbmZvW2tleV07XG4gICAgdmFyIHNwZWVjaERpciA9IHV0aWwucmFuZG9tUGljayhbXCJsZWZ0XCIsIFwicmlnaHRcIl0pO1xuICAgIHZhciBwbGF5ZXJEb20gPSAkKFwiLnBsYXllci5cIiArIGtleSk7XG4gICAgaWYgKHBsYXllci52b3RlICE9PSBjbGllbnRQbGF5ZXIudm90ZSkge1xuICAgICAgdmFyIGJ1YmJsZSA9IHBsYXllckRvbS5maW5kKFwiLnNwZWVjaF9idWJibGVfXCIgKyBzcGVlY2hEaXIpO1xuICAgICAgYnViYmxlLnNob3coKTtcbiAgICAgIGJ1YmJsZS5maW5kKCcuc3BlZWNoJykuaHRtbChwbGF5ZXIudm90ZS50b1VwcGVyQ2FzZSgpKTtcbiAgICB9XG4gICAgLy8gVE9ETzogVXBkYXRlIG90aGVyIHByb3BlcnRpZXNcbiAgfVxufTtcblxuLy8gUmV0dXJucyBhIHNpbmdsZSBpbnN0YW5jZSBvZiBhIHBsYXllciBET00gaXRlbVxuUGxheWVycy5wcm90b3R5cGUuYnVpbGRQbGF5ZXJEb20gPSBmdW5jdGlvbihwbGF5ZXIsIGtleSkge1xuICB2YXIgcGxheWVyS2V5ID0gdGhpcy5nYW1lLnBsYXllck9iai5rZXkoKTtcbiAgdmFyIGlzVXNlciA9IGtleSA9PT0gcGxheWVyS2V5O1xuICByZXR1cm4gXCI8ZGl2IGNsYXNzPSdwbGF5ZXIgXCIgKyBrZXkgKyBcIic+XCIgK1xuICAgICAgKHRoaXMuZ2FtZS5pc0hvc3QgJiYga2V5ICE9PSBwbGF5ZXJLZXkgP1xuICAgICAgICBcIjxzcGFuIGNsYXNzPSdyZW1vdmUgXCIgKyBrZXkgKyBcIic+eDwvc3Bhbj5cIiA6IFwiXCIpICtcbiAgICAgIFwiPGltZyBjbGFzcz0nYXZhdGFyJyBzcmM9J3Jlcy9cIiArIHBsYXllci5nZW5kZXIgKyBcIl9ibHVlLnBuZyc+XCIgK1xuICAgICAgXCI8ZGl2IGNsYXNzPSdzcGVlY2hfYnViYmxlIHNwZWVjaF9idWJibGVfbGVmdCc+XCIgK1xuICAgICAgICBcIjxkaXYgY2xhc3M9J3NwZWVjaCBzcGVlY2hfbGVmdCc+PC9kaXY+XCIgK1xuICAgICAgICBcIjxkaXYgY2xhc3M9J3BvaW50ZXJfbGVmdCc+PC9kaXY+XCIgK1xuICAgICAgXCI8L2Rpdj5cIiArXG4gICAgICBcIjxkaXYgY2xhc3M9J3NwZWVjaF9idWJibGUgc3BlZWNoX2J1YmJsZV9yaWdodCc+XCIgK1xuICAgICAgICBcIjxkaXYgY2xhc3M9J3NwZWVjaCBzcGVlY2hfcmlnaHQnPjwvZGl2PlwiICtcbiAgICAgICAgXCI8ZGl2IGNsYXNzPSdwb2ludGVyX3JpZ2h0Jz48L2Rpdj5cIiArXG4gICAgICBcIjwvZGl2PlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0nYmFubmVyJz5cIiArXG4gICAgICAgIFwiPGRpdiBjbGFzcz0nbmFtZXRhZyc+XCIgKyBwbGF5ZXIubmFtZSArIFwiPC9kaXY+XCIgK1xuICAgICAgICBcIjxkaXYgY2xhc3M9J2Jhbm5lcl9sZWZ0X2ZvbGQnPjwvZGl2PlwiICtcbiAgICAgICAgXCI8ZGl2IGNsYXNzPSdiYW5uZXJfbGVmdF9mcmluZ2UnPjwvZGl2PlwiICtcbiAgICAgICAgXCI8ZGl2IGNsYXNzPSdiYW5uZXJfcmlnaHRfZm9sZCc+PC9kaXY+XCIgK1xuICAgICAgICBcIjxkaXYgY2xhc3M9J2Jhbm5lcl9yaWdodF9mcmluZ2UnPjwvZGl2PlwiICtcbiAgICAgIFwiPC9kaXY+XCIgK1xuICAgIFwiPC9kaXY+XCI7XG59O1xuXG5QbGF5ZXJzLnByb3RvdHlwZS5vblJlbW92ZVBsYXllciA9IGZ1bmN0aW9uKHNuYXBzaG90KSB7XG4gIHZhciBrZXkgPSBzbmFwc2hvdC5rZXkoKTtcbiAgJCgnLnBsYXllci4nICsga2V5KS5yZW1vdmUoKTtcbn07XG5cblBsYXllcnMucHJvdG90eXBlLnNoaCA9IGZ1bmN0aW9uKCkge1xuICAkKCcuc3BlZWNoX2J1YmJsZScpLmhpZGUoKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gUGxheWVycztcbiIsIlxudmFyIFN0YXRlID0gcmVxdWlyZSgnLi9TdGF0ZS5qcycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwuanMnKTtcblxudmFyIERVUkFUSU9OID0gMzAwMDtcblxuLy8gSGFuZGxlcyBjcmVhdGlvbiBvZiB0aGUgbGlzdCBvZiBxdWVzdGlvbnMgYW5kIHRoZSBwb2xsIHByb2Nlc3NcbmZ1bmN0aW9uIFBvbGwoZ2FtZSkge1xuICB0aGlzLmdhbWUgPSBnYW1lO1xuICB0aGlzLnRpbWVyID0gbmV3IFRpbWVyKCk7XG5cbiAgdGhpcy5wb2xsT2JqID0gdGhpcy5nYW1lLmdhbWVPYmouY2hpbGQoJ3BvbGwnKTtcblxuICB0aGlzLmNob2ljZXNJbmZvID0gbnVsbDtcbiAgdGhpcy52b3Rlc0luZm8gPSBudWxsO1xuICB0aGlzLnRpbWVvdXQgPSBudWxsO1xuXG4gIHRoaXMuY291bnQgPSB7IGE6IDAsIGI6IDAsIGM6IDAgfTtcblxuICB1dGlsLmJpbmRGdW5jKHRoaXMucG9sbE9iai5jaGlsZCgnY2hvaWNlcycpLCB0aGlzLm9uQ2hvaWNlc1VwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgdXRpbC5iaW5kRnVuYyh0aGlzLnBvbGxPYmouY2hpbGQoJ3ZvdGVzJyksIHRoaXMub25Wb3Rlc1VwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgdXRpbC5iaW5kRnVuYyh0aGlzLnBvbGxPYmouY2hpbGQoJ3RpbWVvdXQnKSwgdGhpcy5vblRpbWVvdXRDaGFuZ2UuYmluZCh0aGlzKSk7XG5cbiAgJChcIiNhXCIpLm9uKCdjbGljaycsIHRoaXMub25Wb3RlLmJpbmQodGhpcywgJ2EnKSk7XG4gICQoXCIjYlwiKS5vbignY2xpY2snLCB0aGlzLm9uVm90ZS5iaW5kKHRoaXMsICdiJykpO1xuICAkKFwiI2NcIikub24oJ2NsaWNrJywgdGhpcy5vblZvdGUuYmluZCh0aGlzLCAnYycpKTtcbn1cblxuUG9sbC5wcm90b3R5cGUucGlja0Nob2ljZXMgPSBmdW5jdGlvbigpIHtcbiAgLy8gVE9ETzogUGlja2VkIHF1ZXN0aW9ucyBzaG91bGQgbm90IGFsbG93IHJlcGVhdHNcbiAgdmFyIGFsbFF1ZXN0aW9ucyA9IHRoaXMuZ2FtZS5hcHAuanNvbkRhdGEucXVlc3Rpb25zO1xuICB0aGlzLmdhbWUuZ2FtZU9iai51cGRhdGUoe1xuICAgIHJlc3BvbnNlczogbnVsbCxcbiAgICBwb2xsOiB7XG4gICAgICBjaG9pY2VzOiB7XG4gICAgICAgIGE6IHV0aWwucmFuZG9tUGljayhhbGxRdWVzdGlvbnMpLFxuICAgICAgICBiOiB1dGlsLnJhbmRvbVBpY2soYWxsUXVlc3Rpb25zKSxcbiAgICAgICAgYzogdXRpbC5yYW5kb21QaWNrKGFsbFF1ZXN0aW9ucylcbiAgICAgIH1cbiAgICB9XG4gIH0pO1xufTtcblxuUG9sbC5wcm90b3R5cGUub25DaG9pY2VzVXBkYXRlID0gZnVuY3Rpb24oY2hvaWNlc0luZm8pIHtcbiAgdGhpcy5jaG9pY2VzSW5mbyA9IGNob2ljZXNJbmZvIHx8IHt9O1xuICB1dGlsLmZvckVhY2godGhpcy5jaG9pY2VzSW5mbywgKGNob2ljZSwgbGV0dGVyKSA9PiAkKCcjY2hvaWNlXycgKyBsZXR0ZXIpLmh0bWwoY2hvaWNlKSk7XG4gIC8vIElmIG5vIGNob2ljZXMsIHJlbW92ZSBkb21cbiAgaWYgKHV0aWwuc2l6ZSh0aGlzLmNob2ljZXNJbmZvKSA9PT0gMCkge1xuICAgICQoJy5jaG9pY2UnKS5lYWNoKChpLCBtYXRjaCkgPT4ge1xuICAgICAgbWF0Y2guaW5uZXJIVE1MID0gXCJcIjtcbiAgICB9KTtcbiAgfVxuICB0aGlzLmhhc1ZvdGVkID0gZmFsc2U7XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5vblZvdGVzVXBkYXRlID0gZnVuY3Rpb24odm90ZXNJbmZvKSB7XG4gIC8vIEJ1aWxkIGFsbCBtYXJrZXJzIHRvIGluZGljYXRlIHZvdGVyc1xuICAvLyBUT0RPOiBDdXJyZW50bHkgYnVpbGRzIGFsbCBmcm9tIHNjcmF0Y2ggb24gYW55IGNoYW5nZVxuICB0aGlzLnZvdGVzSW5mbyA9IHZvdGVzSW5mbyB8fCB7fTtcbiAgdGhpcy5jb3VudCA9IHsgYTogMCwgYjogMCwgYzogMCB9O1xuICB1dGlsLmZvckVhY2godGhpcy52b3Rlc0luZm8sIHZvdGVEYXRhID0+IHRoaXMuY291bnRbdm90ZURhdGEudm90ZV0rKyk7XG4gIC8vIFByaW50IGN1cnJlbnQgY291bnRzIGluIGVhY2ggc2VsZWN0aW9uXG4gIHV0aWwuZm9yRWFjaCh0aGlzLmNvdW50LCAodmFsLCBrZXkpID0+ICQoJyN2b3RlcnNfJyArIGtleSkuaHRtbCh2YWwpKTtcblxuICB2YXIgbnVtVm90ZXJzID0gdXRpbC5zaXplKHRoaXMudm90ZXNJbmZvKTtcblxuICAvLyBJZiBubyBvbmUgaGFzIHZvdGVkIChpbml0aWFsIHN0YXRlKSwgY2xlYXIgdm90ZSBjb3VudHNcbiAgaWYgKG51bVZvdGVycyA9PT0gMCkge1xuICAgICQoJy52b3RlcnMnKS5lYWNoKChpLCBtYXRjaCkgPT4gbWF0Y2guaW5uZXJIVE1MID0gXCJcIik7XG4gIH1cbiAgLy8gSWYgc29tZW9uZSB2b3RlZCwgc2V0IHRoZSB0aW1lb3V0LlxuICBpZiAobnVtVm90ZXJzID4gMCAmJiAhdGhpcy50aW1lb3V0KSB7XG4gICAgdGhpcy5wb2xsT2JqLnVwZGF0ZSh7dGltZW91dDogRGF0ZS5ub3coKSArIERVUkFUSU9OfSk7XG4gIH1cbiAgLy8gSWYgZXZlcnlvbmUgdm90ZWQsIHBpY2sgcXVlc3Rpb24gYW5kIGNoYW5nZSBzdGF0ZSB0byByZXNwb25kLlxuICBpZiAobnVtVm90ZXJzID09PSB0aGlzLmdhbWUucGxheWVycy5jb3VudCgpICYmIGZhbHNlKSB7XG4gICAgdGhpcy50aW1lci5zdG9wKCk7XG4gIH1cbn07XG5cblBvbGwucHJvdG90eXBlLm9uVGltZW91dENoYW5nZSA9IGZ1bmN0aW9uKHRpbWVvdXQpIHtcbiAgdGhpcy50aW1lb3V0ID0gdGltZW91dDtcbiAgaWYgKHRpbWVvdXQpIHtcbiAgICB0aGlzLnRpbWVyLnN0YXJ0KHRpbWVvdXQsICgpID0+IHtcbiAgICAgIGlmICh0aGlzLmdhbWUuaXNIb3N0KSB7XG4gICAgICAgIHRoaXMucGlja1dpbm5lcigpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5vblZvdGUgPSBmdW5jdGlvbihjaG9pY2UpIHtcbiAgdmFyIHBlcnNvbmFsVm90ZSA9IHV0aWwuZmluZChPYmplY3Qua2V5cyh0aGlzLnZvdGVzSW5mbyksIHZvdGVLZXkgPT4ge1xuICAgIHJldHVybiB0aGlzLnZvdGVzSW5mb1t2b3RlS2V5XS5wbGF5ZXJLZXkgPT09IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCk7XG4gIH0pO1xuICBpZiAocGVyc29uYWxWb3RlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMucG9sbE9iai5jaGlsZCgndm90ZXMnKS5wdXNoKHtcbiAgICBuYW1lOiB0aGlzLmdhbWUucGxheWVyTmFtZSxcbiAgICBwbGF5ZXJLZXk6IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCksXG4gICAgdm90ZTogY2hvaWNlXG4gIH0pO1xuICB0aGlzLmdhbWUucGxheWVyT2JqLmNoaWxkKCd2b3RlJykuc2V0KGNob2ljZSk7XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5waWNrV2lubmVyID0gZnVuY3Rpb24oKSB7XG4gIHZhciBtYXhWb3RlcyA9IE1hdGgubWF4LmFwcGx5KG51bGwsIHV0aWwudmFsdWVzKHRoaXMuY291bnQpKTtcbiAgdmFyIGZpbmFsaXN0cyA9IE9iamVjdC5rZXlzKHRoaXMuY291bnQpLmZpbHRlcihjaG9pY2UgPT4ge1xuICAgIHJldHVybiB0aGlzLmNvdW50W2Nob2ljZV0gPT09IG1heFZvdGVzO1xuICB9KTtcbiAgdGhpcy5nYW1lLmdhbWVPYmoudXBkYXRlKHtcbiAgICBxdWVzdGlvbjogdGhpcy5jaG9pY2VzSW5mb1t1dGlsLnJhbmRvbVBpY2soZmluYWxpc3RzKV0sXG4gICAgc3RhdGU6IFN0YXRlLlJFU1BPTkQsXG4gICAgdGltZW91dDogbnVsbFxuICB9KTtcbn07XG5cbi8vIEEgc2ltcGxlIGNvdW50ZG93biB0aW1lclxuZnVuY3Rpb24gVGltZXIoKSB7XG4gIHRoaXMuaW50ZXJ2YWxJZCA9IG51bGw7XG4gIHRoaXMuaXNSdW5uaW5nID0gZmFsc2U7XG4gIHRoaXMuc3RvcENhbGxiYWNrID0gKCkgPT4ge307XG59XG5cblRpbWVyLnByb3RvdHlwZS5zdGFydCA9IGZ1bmN0aW9uKHRpbWVvdXQsIHN0b3BDYWxsYmFjaykge1xuICBpZiAodGhpcy5pc1J1bm5pbmcpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgdGhpcy5pc1J1bm5pbmcgPSB0cnVlO1xuICB0aGlzLnN0b3BDYWxsYmFjayA9IHN0b3BDYWxsYmFjaztcbiAgdGhpcy5pbnRlcnZhbElkID0gd2luZG93LnNldEludGVydmFsKHRoaXMuYnVpbGREb20uYmluZCh0aGlzKSwgMTAsIHRpbWVvdXQpO1xufTtcblxuVGltZXIucHJvdG90eXBlLmJ1aWxkRG9tID0gZnVuY3Rpb24odGltZW91dCkge1xuICB2YXIgdGltZSA9IERhdGUubm93KCk7XG4gIHZhciBtcztcbiAgLy8gdmFyIHNlY29uZHMgPSBNYXRoLmZsb29yKG1zIC8gMTAwMCk7XG4gIC8vIHZhciB0ZW50aHMgPSBNYXRoLmZsb29yKChtcyAvIDEwMCkgJSAxMCk7XG4gIC8vICQoXCIjdGltZXJcIikuaHRtbChtcyA8IDAgPyBtcyA6IHNlY29uZHMgKyBcIi5cIiArIHRlbnRocyk7XG4gIHZhciBoYWxmID0gRFVSQVRJT04gLyAyO1xuICB2YXIgaGFsZnRpbWUgPSB0aW1lb3V0IC0gaGFsZjtcbiAgdmFyIGZyYWM7XG4gIHZhciBkZWc7XG4gIGlmICh0aW1lIDwgaGFsZnRpbWUpIHtcbiAgICAkKCcubWFza19zbGljZScpLmhpZGUoKTtcbiAgICAkKCcuc2xpY2UnKS5zaG93KCk7XG4gICAgLy8gU2xpY2UgZ29lcyA5MGRlZyAtPiAyNzBkZWdcbiAgICBmcmFjID0gMSAtICgoaGFsZnRpbWUgLSB0aW1lKSAvIGhhbGYpO1xuICAgIGRlZyA9IChmcmFjICogMTgwKTtcbiAgICBjb25zb2xlLndhcm4oZnJhYywgZGVnKTtcbiAgICAkKCcuc2xpY2UnKS5jc3MoJ3RyYW5zZm9ybScsICdyb3RhdGUoJyArIGRlZyArICdkZWcpJyk7XG4gIH1cbiAgZWxzZSBpZiAodGltZSA8IHRpbWVvdXQpIHtcbiAgICAkKCcuc2xpY2UnKS5oaWRlKCk7XG4gICAgJCgnLm1hc2tfc2xpY2UnKS5zaG93KCk7XG4gICAgZnJhYyA9IDEgLSAoKHRpbWVvdXQgLSB0aW1lKSAvIGhhbGYpO1xuICAgIGRlZyA9IChmcmFjICogMTgwKTtcbiAgICAkKCcubWFza19zbGljZScpLmNzcygndHJhbnNmb3JtJywgJ3JvdGF0ZSgnICsgZGVnICsgJ2RlZyknKTtcbiAgfVxuICBlbHNlIHtcbiAgICB0aGlzLnN0b3AoKTtcbiAgfVxufTtcblxuVGltZXIucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgd2luZG93LmNsZWFySW50ZXJ2YWwodGhpcy5pbnRlcnZhbElkKTtcbiAgJChcIiN0aW1lclwiKS5odG1sKFwiXCIpO1xuICB0aGlzLmlzUnVubmluZyA9IGZhbHNlO1xuICB0aGlzLnN0b3BDYWxsYmFjaygpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQb2xsO1xuIiwiXG52YXIgU3RhdGUgPSByZXF1aXJlKCcuL1N0YXRlLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG4vLyBIYW5kbGVzIGNyZWF0aW9uIGFuZCBjcm9zc2luZyBvdXQgb2YgdGhlIGxpc3Qgb2YgcmVzcG9uc2VzXG5mdW5jdGlvbiBSZXNwb25zZXMoZ2FtZSkge1xuICB0aGlzLmdhbWUgPSBnYW1lO1xuXG4gIHRoaXMucmVzcG9uc2VzSW5mbyA9IG51bGw7XG4gIHRoaXMucmVzcG9uc2VPcmRlciA9IFtdO1xuXG4gIHV0aWwuYmluZEZ1bmModGhpcy5nYW1lLmdhbWVPYmouY2hpbGQoJ3Jlc3BvbnNlcycpLCB0aGlzLm9uUmVzcG9uc2VzVXBkYXRlLmJpbmQodGhpcykpO1xufVxuXG5SZXNwb25zZXMucHJvdG90eXBlLmNvdW50ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB1dGlsLnNpemUodGhpcy5yZXNwb25zZXNJbmZvKTtcbn07XG5cblJlc3BvbnNlcy5wcm90b3R5cGUud2FpdEZvckFsbCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdhbWUuZ2FtZU9iai5jaGlsZCgncmVzcG9uc2VzJykub2ZmKCd2YWx1ZScpO1xuICB1dGlsLmJpbmRGdW5jKHRoaXMuZ2FtZS5nYW1lT2JqLmNoaWxkKCdyZXNwb25zZXMnKSwgdGhpcy5vblJlc3BvbnNlc1VwZGF0ZS5iaW5kKHRoaXMpKTtcbn07XG5cblJlc3BvbnNlcy5wcm90b3R5cGUuc2hvd0FsbCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdhbWUuZ2FtZU9iai5jaGlsZCgncmVzcG9uc2VzJykub2ZmKCd2YWx1ZScpO1xuICB1dGlsLmJpbmRGdW5jKHRoaXMuZ2FtZS5nYW1lT2JqLmNoaWxkKCdyZXNwb25zZXMnKSwgdGhpcy5vblJlc3BvbnNlRWxpbWluYXRlZC5iaW5kKHRoaXMpKTtcbn07XG5cblJlc3BvbnNlcy5wcm90b3R5cGUub25SZXNwb25zZXNVcGRhdGUgPSBmdW5jdGlvbihyZXNwb25zZXNJbmZvKSB7XG4gIC8vIENyZWF0ZSBhIEpTIG1hcCBmcm9tIHJlc3BvbnNlcyBmb3IgYWNjZXNzIHRvIGZvckVhY2gsIHNpemVcbiAgdGhpcy5yZXNwb25zZXNJbmZvID0gcmVzcG9uc2VzSW5mbyB8fCB7fTtcblxuICB1dGlsLmZvckVhY2godGhpcy5yZXNwb25zZXNJbmZvLCAodmFsLCBrZXkpID0+IHtcbiAgICAvLyBJZiBrZXkgaXNuJ3QgaW4gcmVzcG9uc2VPcmRlciwgYW5kIGl0YHMgcmVhZHksIGFkZCBpdCByYW5kb21seVxuICAgIGlmICh0aGlzLnJlc3BvbnNlT3JkZXIuaW5kZXhPZihrZXkpID09PSAtMSAmJiBrZXkgaW4gdGhpcy5yZXNwb25zZXNJbmZvKSB7XG4gICAgICB1dGlsLnJhbmRvbUluc2VydCh0aGlzLnJlc3BvbnNlT3JkZXIsIGtleSk7XG4gICAgfVxuICB9KTtcbiAgLy8gSWYgZXZlcnlvbmUgaGFzIHJlc3BvbmRlZCwgY2hhbmdlIHRvIGd1ZXNzIHN0YXRlXG4gIGlmICh0aGlzLmNvdW50KCkgPT09IHRoaXMuZ2FtZS5wbGF5ZXJzLmNvdW50KCkpIHtcbiAgICB0aGlzLmdhbWUuZ2FtZU9iai5jaGlsZCgnc3RhdGUnKS5zZXQoU3RhdGUuR1VFU1MpO1xuICB9XG59O1xuXG5SZXNwb25zZXMucHJvdG90eXBlLm9uUmVzcG9uc2VFbGltaW5hdGVkID0gZnVuY3Rpb24ocmVzcG9uc2VzSW5mbykge1xuICB0aGlzLnJlc3BvbnNlc0luZm8gPSByZXNwb25zZXNJbmZvIHx8IHt9O1xuICB1dGlsLmZvckVhY2godGhpcy5yZXNwb25zZXNJbmZvLCB0aGlzLnVwZGF0ZVJlc3BvbnNlRG9tLmJpbmQodGhpcykpO1xuICAvLyBJZiB0aGVyZSBhcmUgbm8gcmVzcG9uc2VzIGluIHRoZSBkYXRhYmFzZSwgcmVtb3ZlXG4gIGlmICh1dGlsLnNpemUodGhpcy5yZXNwb25zZXNJbmZvKSA9PT0gMCkge1xuICAgICQoJyNyZXNwb25zZXMnKS5odG1sKFwiXCIpO1xuICB9XG59O1xuXG5SZXNwb25zZXMucHJvdG90eXBlLnVwZGF0ZVJlc3BvbnNlRG9tID0gZnVuY3Rpb24oKSB7XG4gIC8vIEJ1aWxkIGFsbCByZXNwb25zZXMgZnJvbSByZXNwb25zZU9yZGVyIGFycmF5XG4gIC8vIFRPRE86IEN1cnJlbnRseSBhbHdheXMgZnJvbSBzY3JhdGNoXG4gIHZhciByZXNwb25zZXMgPSB0aGlzLnJlc3BvbnNlT3JkZXIubWFwKHBsYXllcktleSA9PiB7XG4gICAgdmFyIHBsYXllclJlc3BvbnNlID0gdGhpcy5yZXNwb25zZXNJbmZvW3BsYXllcktleV07XG4gICAgcmV0dXJuIGJ1aWxkUmVzcG9uc2VEb20ocGxheWVyUmVzcG9uc2UucmVzcG9uc2UsIHBsYXllclJlc3BvbnNlLmVsaW1pbmF0ZWQpO1xuICB9KTtcbiAgJChcIiNyZXNwb25zZXNcIikuaHRtbChyZXNwb25zZXMpO1xufTtcblxuLy8gUmV0dXJucyBhIHNpbmdsZSBpbnN0YW5jZSBvZiBhIHJlc3BvbnNlIERPTSBpdGVtXG5mdW5jdGlvbiBidWlsZFJlc3BvbnNlRG9tKHJlc3BvbnNlLCBlbGltaW5hdGVkKSB7XG4gIGVsaW1pbmF0ZWQgPSBlbGltaW5hdGVkID8gXCJlbGltaW5hdGVkXCIgOiBcIlwiO1xuICByZXR1cm4gXCI8ZGl2IGNsYXNzPSdyZXNwb25zZSc+XCIgK1xuICAgIFwiPGRpdiBjbGFzcz0ncmVzcG9uc2VfY29udGVudCBcIitlbGltaW5hdGVkK1wiJz5cIiArIHJlc3BvbnNlICsgXCI8L2Rpdj5cIiArXG4gICAgXCI8ZGl2IGNsYXNzPSdyZXNwb25zZV90cmlhbmdsZSc+PC9kaXY+XCIgK1xuICAgIFwiPC9kaXY+XCI7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUmVzcG9uc2VzO1xuIiwiXG5TdGF0ZSA9IHtcbiAgSU5JVDogMSxcbiAgUE9MTDogMixcbiAgUkVTUE9ORDogMyxcbiAgR1VFU1M6IDRcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU3RhdGU7XG4iLCJcbnZhciBBcHAgPSByZXF1aXJlKCcuL0FwcC5qcycpO1xuXG4vLyBUT0RPIEZlYXR1cmVzOlxuLy8gLSBFbmQgZ2FtZSAoaG9zdClcbi8vIC0gUmVwb3J0IGd1ZXNzZWQgZm9yIGFueSByZXNwb25zZSAoaG9zdClcbi8vIC0gQWxsb3cgcGxheWVycyB0byBzaXQgb3V0IGEgcm91bmQsIG9yIGhvc3QgdG8gbWFrZSB0aGVtXG4vLyAtIExpc3Qgb2YgYWN0aXZlIGdhbWVzIHRvIGpvaW4gKGluc3RlYWQgb2YgdHlwZSBpbilcbi8vIC0gR2FtZXMgaW5hY3RpdmUgbW9yZSB0aGFuIDEyaHIgYXJlIHJlbW92ZWQgd2hlbiBsb29rZWQgdXAgKGFkZCB0aW1lc3RhbXAgZ2FtZSBhY3Rpb25zKVxuLy8gLSBTY29yaW5nXG4vLyAtIE5vdGlmeSB3aGVuIGhvc3QgaXMgZGlzY29ubmVjdGVkIChzaW5jZSBnYW1lIHdpbGwgc3RvcCBydW5uaW5nKVxuXG53aW5kb3cub25sb2FkID0gbmV3IEFwcCgpO1xuIiwiXG4vLyBCaW5kcyB0aGUgdmFsdWUgb2YgeCB0byB2YWx1ZSBhdCBsb2NhdGlvbiBmaXJlYmFzZS5cbmV4cG9ydHMuYmluZFZhbCA9IGZ1bmN0aW9uKGZpcmViYXNlLCB4KSB7XG4gIGZpcmViYXNlLm9uKFwidmFsdWVcIiwgc25hcHNob3QgPT4geCA9IHNuYXBzaG90LnZhbCgpKTtcbn07XG5cbi8vIEJpbmRzIHRoZSBmdW5jdGlvbiBmIHRvIHRoZSB2YWx1ZSBhdCBsb2NhdGlvbiBmaXJlYmFzZS5cbi8vIFdoZW5ldmVyIHRoZSBmaXJlYmFzZSB2YWx1ZSBjaGFuZ2VzLCBmIGlzIGNhbGxlZCB3aXRoIHRoZSBuZXcgdmFsdWUuXG5leHBvcnRzLmJpbmRGdW5jID0gZnVuY3Rpb24oZmlyZWJhc2UsIGYpIHtcbiAgZmlyZWJhc2Uub24oXCJ2YWx1ZVwiLCBzbmFwc2hvdCA9PiBmKHNuYXBzaG90LnZhbCgpKSk7XG59O1xuXG4vLyBSZXR1cm5zIGEgcmFuZG9tIGVsZW1lbnQgb2YgdGhlIGFycmF5LlxuZXhwb3J0cy5yYW5kb21QaWNrID0gZnVuY3Rpb24oYXJyYXkpIHtcbiAgcmV0dXJuIGFycmF5W01hdGguZmxvb3IoTWF0aC5yYW5kb20oKSphcnJheS5sZW5ndGgpXTtcbn07XG5cbi8vIEluc2VydHMgaXRlbSBpbnRvIGFycmF5IGF0IGEgcmFuZG9tIGxvY2F0aW9uLlxuLy8gUmV0dXJucyB0aGUgYXJyYXkgZm9yIGNvbnZlbmllbmNlLlxuZXhwb3J0cy5yYW5kb21JbnNlcnQgPSBmdW5jdGlvbihhcnJheSwgaXRlbSkge1xuICB2YXIgc3BsaWNlSW5kZXggPSBNYXRoLmZsb29yKChhcnJheS5sZW5ndGgrMSkqTWF0aC5yYW5kb20oKSk7XG4gIGFycmF5LnNwbGljZShzcGxpY2VJbmRleCwgMCwgaXRlbSk7XG59O1xuXG4vLyBPYmplY3QgZm9yRWFjaCwgY2FsbHMgY2FsbGJhY2sgd2l0aCAodmFsLCBrZXkpXG5leHBvcnRzLmZvckVhY2ggPSBmdW5jdGlvbihvYmosIGNhbGxiYWNrKSB7XG4gIE9iamVjdC5rZXlzKG9iaikuZm9yRWFjaChrZXkgPT4gY2FsbGJhY2sob2JqW2tleV0sIGtleSkpO1xufTtcblxuZXhwb3J0cy5zaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLmxlbmd0aDtcbn07XG5cbmV4cG9ydHMudmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChrZXkgPT4ge1xuICAgIHJldHVybiBvYmpba2V5XTtcbiAgfSk7XG59O1xuXG5leHBvcnRzLmZpbmQgPSBmdW5jdGlvbihhcnIsIGNhbGxiYWNrKSB7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyLmxlbmd0aDsgaSsrKSB7XG4gICAgaWYgKGNhbGxiYWNrKGFycltpXSkpIHtcbiAgICAgIHJldHVybiBhcnJbaV07XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuIl19
