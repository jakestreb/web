(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){

var Game = require('./Game.js');
var util = require('./util.js');

// Handles log in and creating a game
function App() {
  this.database = new Firebase('https://thingswithbeth.firebaseio.com/');

  this.selectedName = null;
  this.selectedGame = null;

  this.foundGame = null;
  this.isHost = false;

  this.urlGameKey = null;
  this.urlPlayerKey = null;

  this.game = null;

  this.jsonData = null;

  // Load JSON data
  _loadJSON(response => this.jsonData = JSON.parse(response));

  this.database.once('value', snapshot => {
    this.attemptURLConnect(snapshot);
    this.buildStartPage(snapshot);
  });
}

App.prototype.buildStartPage = function(snapshot) {
  var first = true;
  snapshot.forEach(game => {
    var animal = game.val().animal;
    if (first) {
      $('#active_games').html(
        "<div class='active_game selected'>" + game.val().animal + "</div>"
      );
      this.selectedGame = animal;
    }
    else {
      $('#active_games').append(
        "<div class='active_game'>" + game.val().animal + "</div>"
      );
    }
    $('.active_game:last').on('click', event => {
      this.selectedGame = animal;
      $('.active_game').removeClass('selected');
      $(event.target).addClass('selected');
    });
    first = false;
  });

  $('#join').on('click', this.onJoinButton.bind(this, snapshot));
  $('#host').on('click', this.onHostButton.bind(this, snapshot));
  $('#watch').on('click', this.onJoinButton.bind(this, snapshot, true));
  $('.color').on('click', this.onClickColor.bind(this));
  $('#submit_name').on('click', this.onSubmitNameButton.bind(this));
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

App.prototype.onHostButton = function(snapshot) {
  var animal = "";
  var currentAnimals = [];
  snapshot.forEach(game => currentAnimals.push(game.val().animal));
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
    numPlayers: 0
  });
  this.isHost = true;

  this.showNamePrompt();
};

App.prototype.onJoinButton = function(snapshot, watchOnly) {
  snapshot.forEach(game => {
    if (game.val().animal === this.selectedGame) {
      this.foundGame = snapshot.child(game.key()).ref();
      console.warn(this.foundGame);
      if (watchOnly !== true) {
        this.showNamePrompt();
      }
      else {
        console.warn('watchonly', watchOnly);
        window.location.hash = "/%g" + this.foundGame.key();
        this.game = new Game(this, this.foundGame, null);
      }
    }
  });
};

App.prototype.showNamePrompt = function() {
  $('#join_container').hide();
  $('#host_container').hide();
  $('#name_container').show();
};

App.prototype.onClickColor = function(event) {
  $('.color').removeClass('selected');
  $(event.currentTarget).addClass('selected');
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
      color: $('.color.selected').css('background-color'),
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

},{"./Game.js":2,"./util.js":9}],2:[function(require,module,exports){

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

  this.gameName = null;
  this.playerName = null;
  this.isHost = null;

  this.state = State.INIT;
  this.round = 1;

  this.players = null;
  this.responses = null;
  this.poll = null;

  this.ignoreInitialRead = true; // Allows program to ignore initial state read

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
    util.bindFunc(this.gameObj.child('scoring'), this.onScoringUpdate.bind(this));
  });
}

Game.prototype.buildDom = function() {
  console.warn('building game');
  var loadBody = $.Deferred();
  $(document.body).load('game.html', () => loadBody.resolve());
  return loadBody.promise().then(() => {
    $('#header_name').html(this.playerName);
    $('#header_game').html(this.gameName);
    $('#submit').on('click', this.onSubmit.bind(this));
    $('#guessed').on('click', this.onGuessed.bind(this));
    $('#complete').on('click', this.onGuessingComplete.bind(this));
    $('#set_scores').on('click', this.onSetScores.bind(this));
    $('#next_round').on('click', this.onNextRound.bind(this));
    $('#response').keypress(event => {
      if (event.which === 13) {
        this.onSubmit();
      }
    });
    this.prepareSettings();
  });
};

Game.prototype.prepareSettings = function() {
  $('#settings').on('click', event => {
    var items = [{
        title: 'Next round',
        icon: 'fa fa-forward',
        fn: () => this.onNextRound(),
        visible: this.isHost
      }, {
      }, {
        title: 'Sit out this round',
        icon: 'fa fa-bed',
        fn: () => {}
      }, {
        title: 'Leave game',
        icon: 'fa fa-sign-out',
        fn: this.removeFromGame.bind(this, this.playerObj.key())
    }];
    basicContext.show(items, event.originalEvent);
  });
};

Game.prototype.onStateChange = function(newState) {
  console.log('state => ' + newState);
  this.state = newState;

  // Updates should only occur on transition
  var skip = this.ignoreInitialRead;
  this.ignoreInitialRead = false;
  if (skip && newState !== State.INIT) {
    return;
  }

  switch (newState) {
    case State.INIT:
      this.playerObj.update({
        guessed: null,
        responded: null,
        vote: null
      });
      if (this.isHost) {
        this.gameObj.update({
          state: State.POLL,
          poll: null,
          responses: null,
          question: null,
          scoring: null
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
      this.playerObj.child('responded').set(false);
      if (this.isHost) {
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
      break;
    case State.RECAP:
      break;
  }
};

Game.prototype.onQuestionUpdate = function(choice) {
  if (choice) {
    $('.choice_container').hide();
    $('#' + choice).show();
    $('#' + choice).addClass('winner');
  }
  else {
    $('.choice_container').show();
    $('.choice_container').removeClass('winner selected');
  }
};

Game.prototype.onGuessedUpdate = function(guessed) {
  if (this.isHost) {
    if (guessed === false) {
      $('#guessed_container').show();
      $('#complete').show();
      $('#guessed').show();
    }
    else if (guessed === true) {
      $('#guessed').hide();
    }
    else {
      $('#guessed_container').hide();
    }
  }
  else if (guessed === false) {
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

Game.prototype.onNextRound = function() {
  this.gameObj.update({
    state: State.INIT,
    round: this.round + 1,
  });
};

Game.prototype.removeFromGame = function(playerKey) {
  this.gameObj.child('numPlayers').transaction(currNumPlayers => {
    return currNumPlayers - 1;
  }, (err, committed, snapshot) => {
    if (!committed) {
      return;
    }
    // Set the player's rank to 0, meaning they are to be removed
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
  });
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

// Host only
Game.prototype.onGuessingComplete = function() {
  this.gameObj.update({
    state: State.SCORE,
    scoring: true,
    responses: null
  });
};

// Host only
Game.prototype.onSetScores = function() {
  this.gameObj.child('players').once('value', snapshot => {
    snapshot.forEach(playerSnapshot => {
      var scoreSnapshot = playerSnapshot.child('score');
      var rank = playerSnapshot.child('rank').val();
      var adj = $('.score_adjustment').eq(rank - 1);
      scoreSnapshot.ref().set(scoreSnapshot.val() + parseInt(adj.html(), 10));
    });
  });
  this.gameObj.update({
    state: State.RECAP,
    scoring: false
  });
  this.players.setRanks();
};

// Host only
Game.prototype.onScoringUpdate = function(scoring) {
  if (scoring) {
    $('#guessed_container').hide();
    $('#scoring_container').show();
    $('#set_scores').show();
    $('#next_round').hide();
    $('.score_adjuster').show();
    $('.minus').off('click');
    $('.plus').off('click');
    $('.minus').click(event => {
      var adj = $(event.target).siblings('.score_adjustment');
      var newAdjVal = parseInt(adj.html(), 10) - 1;
      adj.html(newAdjVal);
    });
    $('.plus').click(event => {
      var adj = $(event.target).siblings('.score_adjustment');
      var newAdjVal = parseInt(adj.html(), 10) + 1;
      adj.html(newAdjVal);
    });
  }
  else if (scoring === false) {
    $('#scoring_container').show();
    $('#set_scores').hide();
    $('#next_round').show();
    $('.score_adjuster').hide();
  }
  else {
    $('#scoring_container').hide();
  }
};

module.exports = Game;

},{"./Players.js":3,"./Poll.js":4,"./Responses.js":5,"./State.js":6,"./util.js":9,"basiccontext":8}],3:[function(require,module,exports){

var basicContext = require('basiccontext');
var util = require('./util.js');
var NUM_FRAMES = 15; // number of different frames before repeats

// Handles creation and maintenance of the list of players
function Players(game) {
  this.game = game;
  this.gameObj = game.gameObj;
  this.playersInfo = null;

  this.frames = "";

  this.gameObj.child('frames').on('value',
    snapshot => this.frames = snapshot.val()
  );
  util.bindFunc(this.gameObj.child('players'),
    this.onPlayersUpdate.bind(this));
  // Note: removing a player does not trigger a 'players' value update
  this.gameObj.child('players').on('child_removed', playerObj => {
    var player = playerObj.val();
    console.warn('moving:', player, player.rank, -1);
    this.movePlayerDom(player, player.rank, -1);
    if (this.game.isHost) {
      this.setRanks();
    }
    // If you are the player being removed, go back to home screen
    if (playerObj.key() === this.game.playerObj.key()) {
      window.location.hash = ""; // Clears URL suffix
      window.location.reload(); // Force reload
    }
  });

  // this.shh();
}

Players.prototype.count = function() {
  return util.size(this.playersInfo);
};

// Writes new player order to database, only host should do this
// TODO: Could be a transaction completed by anyone
Players.prototype.setRanks = function() {
  console.warn('child removed');
  var playerOrder = [];
  console.warn('setting ranks');
  this.gameObj.child('players').once('value', snapshot => {
    var newPlayersInfo = snapshot.val();
    util.forEach(newPlayersInfo, (val, key) => {
      playerOrder.push({key: key, val: val});
    });
    playerOrder.sort((playerA, playerB) => {
      var aPts = playerA.val.score;
      var bPts = playerB.val.score;
      return aPts !== bPts ? bPts - aPts : playerA.val.added - playerB.val.added;
    });
    playerOrder.forEach((player, index) => {
      if (index + 1 !== newPlayersInfo[player.key].rank) {
        // Setting new rank in db
        this.gameObj.child('players').child(player.key)
          .child('rank').set(index + 1);
      }
    });
  });
};

Players.prototype.onPlayersUpdate = function(newPlayersInfo) {
  console.warn('value changed');
  newPlayersInfo = newPlayersInfo || {};
  console.warn('NEW PLAYERS INFO?', newPlayersInfo);
  // Update Dom for each player
  util.forEach(newPlayersInfo, this.updatePlayerDom.bind(this));
  // Save data to client
  this.playersInfo = newPlayersInfo;
};

Players.prototype.updatePlayerDom = function(player, key) {
  // TODO: Should replace frame with the same index, append only if non-existent
  if (!this.playersInfo || !(key in this.playersInfo)) {
    // Player not in client, find place to put them
    var ranks = $('#players > *').toArray().map(frame => {
      var classList = frame.className.split(/\s+/);
      var cls = classList.filter(cls => cls.slice(0, 6) === 'frame_')[0];
      return parseInt(cls[cls.length - 1], 10);
    });
    ranks = ranks.filter(rank => rank < player.rank);
    if (ranks.length === 0) {
      console.warn('appending to players');
      $('#players').prepend(this.buildPlayerDom(player, key));
    }
    else {
      var prev = Math.max.apply(null, ranks);
      $('.frame_' + prev).after(this.buildPlayerDom(player, key));
    }
    if (this.game.isHost) {
      this.preparePlayerMenu(player, key);
    }
  }
  else if (player.rank !== this.playersInfo[key].rank) {
    console.warn('PLAYER RANK CHANGED!', player.name,
      this.playersInfo[key].rank + ' -> ' + player.rank);
    // Player rank has changed
    this.movePlayerDom(player, this.playersInfo[key].rank, player.rank);
    if (this.game.isHost) {
      this.preparePlayerMenu(player, key);
    }
  }
  else {
    // Player in client
    console.warn('UPDATING PLAYA DOM');
    this.setZs(player);
    // var speechDir = util.randomPick(["left", "right"]);
    // if (player.vote && player.vote !== clientPlayer.vote) {
    //   var bubble = playerDom.find(".speech_bubble_" + speechDir);
    //   bubble.show();
    //   bubble.find('.speech').html(player.vote.toUpperCase());
    // }
    // else if (!player.vote) {
    //   this.shh();
    // }
    // TODO: Update other properties
  }
};

// Animates player moving from one frame to another
// Assumes all players will be moved in a loop
Players.prototype.movePlayerDom = function(player, start, end) {
  var seq = start < end || end === -1 ? ['right_out', 'left_in'] :
    ['left_out', 'right_in'];
  var dist = Math.abs(start - end);
  var duration = (Math.random()*1.0 + 1.0) + 's';
  var startBody = $('.frame_' + start + ' .body');
  var endBody = $('.frame_' + end + ' .body');
  var startTag = $('.frame_' + start + ' .player_name');
  var endTag = $('.frame_' + end + ' .player_name');

  var walkIn = () => {
    endBody.find('.head').css('background-color', player.color);
    endBody.find('.torso').css('background-color', player.color);
    endTag.html(player.name);
    setTimeout(() => {
      endBody.css('animation-duration', duration);
      endBody.addClass(seq[1]);
      endBody.show();
      endBody.one('animationend', () => endBody.removeClass(seq[1]));
      // Fade in tag
      endTag.css({
        'opacity': '1.0',
        'transition-duration': duration
      });
    }, (dist * 250) + 500);
  };

  startBody.css('animation-duration', duration);
  startBody.addClass(seq[0]); // Walk out
  // Fade out tag
  startTag.css({
    'opacity': '0.0',
    'transition-duration': duration
  });
  startBody.one('animationend', () => {
    startBody.hide();
    startBody.removeClass('right_out left_in left_out right_in');
    if (end === -1) {
      return;
    }
    else if (endBody.hasClass('right_out') || endBody.hasClass('left_out')) {
      // If destination is still animating, wait until it finishes
      endBody.one('animationend', walkIn);
    } else {
      walkIn();
    }
  });
};

// Returns a single instance of a player DOM item
Players.prototype.buildPlayerDom = function(player, key) {
  console.warn('player, key', player, key);
  var playerKey = this.game.playerObj.key();
  var isUser = key === playerKey;

  var allFrames = ['frame_oval', 'frame_square', 'frame_rect'];

  // 15 is the number of frames
  var value = parseInt(this.frames[(player.rank - 1) % NUM_FRAMES], 10);
  var frame = allFrames[Math.floor(value % 3)];

  return "<div class='frame frame_" + player.rank + "'>" +
    (this.game.isHost && !isUser ? "<div class='player_menu fa fa-cog'></div>" : "") +
    "<div class='frame_content " + frame + "'>" +
      "<div class='zzz' style='display:" + (player.asleep ? "block" : "none") + ";'>" +
        "<div class='z z1'>z</div>" +
        "<div class='z z2'>z</div>" +
        "<div class='z z3'>z</div>" +
      "</div>" +
      "<div class='body'>" +
        "<div class='head' style='background-color:" + player.color + ";'></div>" +
        "<div class='torso' style='background-color:" + player.color + ";'></div>" +
      "</div>" +
    "</div>" +
    this.buildPlaque(player.name) +
    "<div class='score_adjuster'>" +
      "<div class='minus'>-</div>" +
      "<div class='score_adjustment'>0</div>" +
      "<div class='plus'>+</div>" +
    "</div>" +
  "</div>";
  //   "<div class='speech_bubble speech_bubble_left'>" +
  //     "<div class='speech speech_left'></div>" +
  //     "<div class='pointer_left'></div>" +
  //   "</div>" +
  //   "<div class='speech_bubble speech_bubble_right'>" +
  //     "<div class='speech speech_right'></div>" +
  //     "<div class='pointer_right'></div>" +
  //   "</div>" +
};

Players.prototype.preparePlayerMenu = function(player, key) {
  var menu = $('.frame_' + player.rank + ' .player_menu');
  // In case it is called twice
  menu.off('click');
  menu.on('click', event => {
    var items = [{
        title: 'Sit out this round',
        icon: 'fa fa-bed',
        fn: () => this.gameObj.child('players').child(key).child('asleep').set(true)
      }, {
        title: 'Remove player',
        icon: 'fa fa-ban',
        fn: () => this.game.removeFromGame(key)
    }];
    basicContext.show(items, event.originalEvent);
  });
};

Players.prototype.buildPlaque = function(name) {
  return "<div class='plaque plaque_banner'>" +
    "<div class='nametag'>" +
      "<div class='player_name'>" + name + "</div>" +
    "</div>" +
    "<div class='banner_left_fold'></div>" +
    "<div class='banner_left_fringe'></div>" +
    "<div class='banner_right_fold'></div>" +
    "<div class='banner_right_fringe'></div>" +
  "</div>";
};

Players.prototype.setZs = function(player) {
  var zzz = $('.frame_' + player.rank + ' .zzz');
  if (player.asleep) {
    zzz.show();
  }
  else {
    zzz.hide();
  }
};

// Players.prototype.shh = function() {
//   $('.speech_bubble').hide();
// };

module.exports = Players;

},{"./util.js":9,"basiccontext":8}],4:[function(require,module,exports){

var State = require('./State.js');
var util = require('./util.js');

var DURATION = 3000;

// Handles creation of the list of questions and the poll process
function Poll(game) {
  this.game = game;
  this.timer = new Timer();
  this.spinner = new Spinner();

  this.pollObj = this.game.gameObj.child('poll');

  this.choicesInfo = null;
  this.votesInfo = null;
  this.timeout = null;

  this.count = { a: 0, b: 0, c: 0 };

  util.bindFunc(this.pollObj.child('choices'), this.onChoicesUpdate.bind(this));
  util.bindFunc(this.pollObj.child('allowVoting'), this.onAllowVotingUpdate.bind(this));
  util.bindFunc(this.pollObj.child('votes'), this.onVotesUpdate.bind(this));
  util.bindFunc(this.pollObj.child('timeout'), this.onTimeoutChange.bind(this));
  util.bindFunc(this.pollObj.child('spinner'), this.onSpinnerUpdate.bind(this));
}

Poll.prototype.onAllowVotingUpdate = function(allowVoting) {
  if (allowVoting) {
    $("#a").on('click', this.onVote.bind(this, 'a'));
    $("#b").on('click', this.onVote.bind(this, 'b'));
    $("#c").on('click', this.onVote.bind(this, 'c'));
    this.timer.show();
  }
  else {
    $(".choice_container").off('click');
    this.timer.hide();
  }
};

Poll.prototype.pickChoices = function() {
  var allQuestions = this.game.app.jsonData.questions;
  var picks = util.randomPicks(allQuestions, 3);
  this.game.gameObj.update({
    responses: null,
    poll: {
      allowVoting: true,
      choices: {
        a: picks[0],
        b: picks[1],
        c: picks[2]
      },
      timeout: 'ready'
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

  var numVoters = util.size(this.votesInfo);

  // If no one has voted (initial state), clear vote counts
  if (numVoters === 0) {
    $('.voters').each((i, match) => match.innerHTML = "");
  }
  // If someone voted, and it isn't already set, set the timeout.
  if (numVoters > 0) {
    this.pollObj.child('timeout').transaction(currTimeout => {
      return currTimeout === 'ready' ? Date.now() + DURATION : undefined;
    });
  }
  // If everyone voted, pick question and change state to respond.
  if (numVoters === this.game.players.count()) {
    this.timer.stop();
  }
};

Poll.prototype.onTimeoutChange = function(timeout) {
  this.timeout = timeout;
  if (typeof timeout === 'number') {
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

// Only called by host
Poll.prototype.pickWinner = function() {
  var maxVotes = Math.max.apply(null, util.values(this.count));
  var finalists = Object.keys(this.count).filter(choice => {
    return this.count[choice] === maxVotes;
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
      if (this.game.isHost) {
        this.submitWinner(item);
      }
    });
  }
};

// Only called by host
Poll.prototype.submitWinner = function(winner) {
  this.game.gameObj.update({
    question: winner,
    state: State.RESPOND,
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

Timer.prototype.show = function() {
  $('.timer').show();
  $('.slice').css('transform', 'rotate(0deg)');
  $('.slice').show();
  $('.mask_slice').hide();
};

Timer.prototype.hide = function() {
  $('.timer').hide();
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

},{"./State.js":6,"./util.js":9}],5:[function(require,module,exports){

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

},{"./State.js":6,"./util.js":9}],6:[function(require,module,exports){

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

// TODO Features:
// - End game (host)
// - Report guessed for any response (host)
// - Games inactive more than 12hr are removed when looked up (add timestamp game actions)
// - Notify when host is disconnected (since game will stop running)
// - Change most host actions to transactions possible by any player
// - Get more questions and filter out bad ones
// - Speech bubbles
// - Vote counters (icons?)
// - Add more frame shapes (circle)

// - Make banners curved
// - Add white backdrop blocks (?)

// - Allow players to sit out a round, or host to make them
// - Players should start sitting out if they join in the middle of a round
// - Make frames disappear after someone leaves game

// - Players joining state (init)
// - (Maybe) Allow *eliminate players when guessed* setting

window.onload = new App();

},{"./App.js":1}],8:[function(require,module,exports){
"use strict";!function(n,t){"undefined"!=typeof module&&module.exports?module.exports=t():"function"==typeof define&&define.amd?define(t):window[n]=t()}("basicContext",function(){var n=null,t="item",e="separator",i=function(){var n=arguments.length<=0||void 0===arguments[0]?"":arguments[0];return document.querySelector(".basicContext "+n)},l=function(){var n=arguments.length<=0||void 0===arguments[0]?{}:arguments[0],i=0===Object.keys(n).length?!0:!1;return i===!0&&(n.type=e),null==n.type&&(n.type=t),null==n["class"]&&(n["class"]=""),n.visible!==!1&&(n.visible=!0),null==n.icon&&(n.icon=null),null==n.title&&(n.title="Undefined"),n.disabled!==!0&&(n.disabled=!1),n.disabled===!0&&(n["class"]+=" basicContext__item--disabled"),null==n.fn&&n.type!==e&&n.disabled===!1?(console.warn("Missing fn for item '"+n.title+"'"),!1):!0},o=function(n,i){var o="",r="";return l(n)===!1?"":n.visible===!1?"":(n.num=i,null!==n.icon&&(r="<span class='basicContext__icon "+n.icon+"'></span>"),n.type===t?o="\n		       <tr class='basicContext__item "+n["class"]+"'>\n		           <td class='basicContext__data' data-num='"+n.num+"'>"+r+n.title+"</td>\n		       </tr>\n		       ":n.type===e&&(o="\n		       <tr class='basicContext__item basicContext__item--separator'></tr>\n		       "),o)},r=function(n){var t="";return t+="\n	        <div class='basicContextContainer'>\n	            <div class='basicContext'>\n	                <table>\n	                    <tbody>\n	        ",n.forEach(function(n,e){return t+=o(n,e)}),t+="\n	                    </tbody>\n	                </table>\n	            </div>\n	        </div>\n	        "},a=function(){var n=arguments.length<=0||void 0===arguments[0]?{}:arguments[0],t={x:n.clientX,y:n.clientY};if("touchend"===n.type&&(null==t.x||null==t.y)){var e=n.changedTouches;null!=e&&e.length>0&&(t.x=e[0].clientX,t.y=e[0].clientY)}return(null==t.x||t.x<0)&&(t.x=0),(null==t.y||t.y<0)&&(t.y=0),t},s=function(n,t){var e=a(n),i=e.x,l=e.y,o={width:window.innerWidth,height:window.innerHeight},r={width:t.offsetWidth,height:t.offsetHeight};i+r.width>o.width&&(i-=i+r.width-o.width),l+r.height>o.height&&(l-=l+r.height-o.height),r.height>o.height&&(l=0,t.classList.add("basicContext--scrollable"));var s=e.x-i,u=e.y-l;return{x:i,y:l,rx:s,ry:u}},u=function(){var n=arguments.length<=0||void 0===arguments[0]?{}:arguments[0];return null==n.fn?!1:n.visible===!1?!1:n.disabled===!0?!1:(i("td[data-num='"+n.num+"']").onclick=n.fn,i("td[data-num='"+n.num+"']").oncontextmenu=n.fn,!0)},c=function(t,e,l,o){var a=r(t);document.body.insertAdjacentHTML("beforeend",a),null==n&&(n=document.body.style.overflow,document.body.style.overflow="hidden");var c=i(),d=s(e,c);return c.style.left=d.x+"px",c.style.top=d.y+"px",c.style.transformOrigin=d.rx+"px "+d.ry+"px",c.style.opacity=1,null==l&&(l=f),c.parentElement.onclick=l,c.parentElement.oncontextmenu=l,t.forEach(u),"function"==typeof e.preventDefault&&e.preventDefault(),"function"==typeof e.stopPropagation&&e.stopPropagation(),"function"==typeof o&&o(),!0},d=function(){var n=i();return null==n||0===n.length?!1:!0},f=function(){if(d()===!1)return!1;var t=document.querySelector(".basicContextContainer");return t.parentElement.removeChild(t),null!=n&&(document.body.style.overflow=n,n=null),!0};return{ITEM:t,SEPARATOR:e,show:c,visible:d,close:f}});
},{}],9:[function(require,module,exports){

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

exports.contains = function(arr, item) {
  return arr.indexOf(item) !== -1;
};

},{}]},{},[7])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJBcHAuanMiLCJHYW1lLmpzIiwiUGxheWVycy5qcyIsIlBvbGwuanMiLCJSZXNwb25zZXMuanMiLCJTdGF0ZS5qcyIsImluZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jhc2ljY29udGV4dC9kaXN0L2Jhc2ljQ29udGV4dC5taW4uanMiLCJ1dGlsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RRQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5UUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN0RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDekJBOztBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcbnZhciBHYW1lID0gcmVxdWlyZSgnLi9HYW1lLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG4vLyBIYW5kbGVzIGxvZyBpbiBhbmQgY3JlYXRpbmcgYSBnYW1lXG5mdW5jdGlvbiBBcHAoKSB7XG4gIHRoaXMuZGF0YWJhc2UgPSBuZXcgRmlyZWJhc2UoJ2h0dHBzOi8vdGhpbmdzd2l0aGJldGguZmlyZWJhc2Vpby5jb20vJyk7XG5cbiAgdGhpcy5zZWxlY3RlZE5hbWUgPSBudWxsO1xuICB0aGlzLnNlbGVjdGVkR2FtZSA9IG51bGw7XG5cbiAgdGhpcy5mb3VuZEdhbWUgPSBudWxsO1xuICB0aGlzLmlzSG9zdCA9IGZhbHNlO1xuXG4gIHRoaXMudXJsR2FtZUtleSA9IG51bGw7XG4gIHRoaXMudXJsUGxheWVyS2V5ID0gbnVsbDtcblxuICB0aGlzLmdhbWUgPSBudWxsO1xuXG4gIHRoaXMuanNvbkRhdGEgPSBudWxsO1xuXG4gIC8vIExvYWQgSlNPTiBkYXRhXG4gIF9sb2FkSlNPTihyZXNwb25zZSA9PiB0aGlzLmpzb25EYXRhID0gSlNPTi5wYXJzZShyZXNwb25zZSkpO1xuXG4gIHRoaXMuZGF0YWJhc2Uub25jZSgndmFsdWUnLCBzbmFwc2hvdCA9PiB7XG4gICAgdGhpcy5hdHRlbXB0VVJMQ29ubmVjdChzbmFwc2hvdCk7XG4gICAgdGhpcy5idWlsZFN0YXJ0UGFnZShzbmFwc2hvdCk7XG4gIH0pO1xufVxuXG5BcHAucHJvdG90eXBlLmJ1aWxkU3RhcnRQYWdlID0gZnVuY3Rpb24oc25hcHNob3QpIHtcbiAgdmFyIGZpcnN0ID0gdHJ1ZTtcbiAgc25hcHNob3QuZm9yRWFjaChnYW1lID0+IHtcbiAgICB2YXIgYW5pbWFsID0gZ2FtZS52YWwoKS5hbmltYWw7XG4gICAgaWYgKGZpcnN0KSB7XG4gICAgICAkKCcjYWN0aXZlX2dhbWVzJykuaHRtbChcbiAgICAgICAgXCI8ZGl2IGNsYXNzPSdhY3RpdmVfZ2FtZSBzZWxlY3RlZCc+XCIgKyBnYW1lLnZhbCgpLmFuaW1hbCArIFwiPC9kaXY+XCJcbiAgICAgICk7XG4gICAgICB0aGlzLnNlbGVjdGVkR2FtZSA9IGFuaW1hbDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAkKCcjYWN0aXZlX2dhbWVzJykuYXBwZW5kKFxuICAgICAgICBcIjxkaXYgY2xhc3M9J2FjdGl2ZV9nYW1lJz5cIiArIGdhbWUudmFsKCkuYW5pbWFsICsgXCI8L2Rpdj5cIlxuICAgICAgKTtcbiAgICB9XG4gICAgJCgnLmFjdGl2ZV9nYW1lOmxhc3QnKS5vbignY2xpY2snLCBldmVudCA9PiB7XG4gICAgICB0aGlzLnNlbGVjdGVkR2FtZSA9IGFuaW1hbDtcbiAgICAgICQoJy5hY3RpdmVfZ2FtZScpLnJlbW92ZUNsYXNzKCdzZWxlY3RlZCcpO1xuICAgICAgJChldmVudC50YXJnZXQpLmFkZENsYXNzKCdzZWxlY3RlZCcpO1xuICAgIH0pO1xuICAgIGZpcnN0ID0gZmFsc2U7XG4gIH0pO1xuXG4gICQoJyNqb2luJykub24oJ2NsaWNrJywgdGhpcy5vbkpvaW5CdXR0b24uYmluZCh0aGlzLCBzbmFwc2hvdCkpO1xuICAkKCcjaG9zdCcpLm9uKCdjbGljaycsIHRoaXMub25Ib3N0QnV0dG9uLmJpbmQodGhpcywgc25hcHNob3QpKTtcbiAgJCgnI3dhdGNoJykub24oJ2NsaWNrJywgdGhpcy5vbkpvaW5CdXR0b24uYmluZCh0aGlzLCBzbmFwc2hvdCwgdHJ1ZSkpO1xuICAkKCcuY29sb3InKS5vbignY2xpY2snLCB0aGlzLm9uQ2xpY2tDb2xvci5iaW5kKHRoaXMpKTtcbiAgJCgnI3N1Ym1pdF9uYW1lJykub24oJ2NsaWNrJywgdGhpcy5vblN1Ym1pdE5hbWVCdXR0b24uYmluZCh0aGlzKSk7XG59O1xuXG5BcHAucHJvdG90eXBlLmF0dGVtcHRVUkxDb25uZWN0ID0gZnVuY3Rpb24oc25hcHNob3QpIHtcbiAgLy8gR2V0IGtleXMgZnJvbSBVUkxcbiAgdmFyIHVybEl0ZW1zID0gd2luZG93LmxvY2F0aW9uLmhhc2guc3BsaXQoXCIvXCIpO1xuICB1cmxJdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgIHN3aXRjaCAoaXRlbS5zbGljZSgwLCAyKSkge1xuICAgICAgY2FzZSBcIiVnXCI6XG4gICAgICAgIHRoaXMudXJsR2FtZUtleSA9IGl0ZW0uc2xpY2UoMik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcIiV1XCI6XG4gICAgICAgIHRoaXMudXJsUGxheWVyS2V5ID0gaXRlbS5zbGljZSgyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9KTtcblxuICAvLyBJZiBVUkwgZG9lc24ndCBjb250YWluIGluZm9ybWF0aW9uLCBVUkwgY29ubmVjdGlvbiBmYWlsc1xuICBpZiAoIXRoaXMudXJsR2FtZUtleSkge1xuICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gXCJcIjsgLy8gQ2xlYXJzIFVSTCBzdWZmaXhcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBJbml0aWFsaXplIGdhbWUvcGxheWVyIGJhc2VkIG9uIFVSTFxuICB2YXIgZ2FtZXMgPSBzbmFwc2hvdC52YWwoKTtcblxuICAvLyBSZXRyaWV2ZSBnYW1lIGlmIGluIGRhdGFiYXNlLCBicmVhayBpZiBub3RcbiAgaWYgKCFnYW1lcyB8fCAhKHRoaXMudXJsR2FtZUtleSBpbiBnYW1lcykpIHtcbiAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiXCI7IC8vIENsZWFycyBVUkwgc3VmZml4XG4gICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXRyaWV2ZSBnYW1lXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBHYW1lIGF2YWlsYWJsZVxuICB2YXIgZ2FtZU9iaiA9IHNuYXBzaG90LmNoaWxkKHRoaXMudXJsR2FtZUtleSkucmVmKCk7XG5cbiAgdmFyIHBsYXllcnMgPSBnYW1lc1tnYW1lT2JqLmtleSgpXS5wbGF5ZXJzO1xuICBpZiAoIXRoaXMudXJsUGxheWVyS2V5IHx8ICFwbGF5ZXJzIHx8ICEodGhpcy51cmxQbGF5ZXJLZXkgaW4gcGxheWVycykpIHtcbiAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiLyVnXCIgKyB0aGlzLnVybEdhbWVLZXk7IC8vIENsZWFycyBwbGF5ZXIgc3VmZml4XG4gICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXRyaWV2ZSBwbGF5ZXJcIik7XG4gICAgdGhpcy5nYW1lID0gbmV3IEdhbWUodGhpcywgZ2FtZU9iaik7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIFBsYXllciBhdmFpbGFibGVcbiAgdmFyIHBsYXllck9iaiA9IGdhbWVPYmouY2hpbGQoXCJwbGF5ZXJzXCIpLmNoaWxkKHRoaXMudXJsUGxheWVyS2V5KTtcblxuICB0aGlzLmdhbWUgPSBuZXcgR2FtZSh0aGlzLCBnYW1lT2JqLCBwbGF5ZXJPYmopO1xufTtcblxuQXBwLnByb3RvdHlwZS5vbkhvc3RCdXR0b24gPSBmdW5jdGlvbihzbmFwc2hvdCkge1xuICB2YXIgYW5pbWFsID0gXCJcIjtcbiAgdmFyIGN1cnJlbnRBbmltYWxzID0gW107XG4gIHNuYXBzaG90LmZvckVhY2goZ2FtZSA9PiBjdXJyZW50QW5pbWFscy5wdXNoKGdhbWUudmFsKCkuYW5pbWFsKSk7XG4gIC8vIEtlZXAgdHJ5aW5nIHRvIGdldCBhbiBhbmltYWwgbm90IGN1cnJlbnRseSBpbiB1c2VcbiAgLy8gVE9ETzogSW5lZmZpY2llbnQsIHN0YWxscyBmb3JldmVyIGlmIGFsbCBhbmltYWxzIGluIHVzZVxuICBkbyB7XG4gICAgYW5pbWFsID0gdXRpbC5yYW5kb21QaWNrKHRoaXMuanNvbkRhdGEuYW5pbWFscyk7XG4gIH0gd2hpbGUgKGN1cnJlbnRBbmltYWxzLmluZGV4T2YoYW5pbWFsKSA+IDApO1xuXG4gIHZhciBmcmFtZXMgPSBcIlwiO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IDE1OyBpKyspIHtcbiAgICBmcmFtZXMgKz0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogOSk7XG4gIH1cblxuICB0aGlzLmZvdW5kR2FtZSA9IHRoaXMuZGF0YWJhc2UucHVzaCh7XG4gICAgcm91bmQ6IDEsXG4gICAgc3RhdGU6IFN0YXRlLklOSVQsXG4gICAgYW5pbWFsOiBhbmltYWwsXG4gICAgZnJhbWVzOiBmcmFtZXMsXG4gICAgbnVtUGxheWVyczogMFxuICB9KTtcbiAgdGhpcy5pc0hvc3QgPSB0cnVlO1xuXG4gIHRoaXMuc2hvd05hbWVQcm9tcHQoKTtcbn07XG5cbkFwcC5wcm90b3R5cGUub25Kb2luQnV0dG9uID0gZnVuY3Rpb24oc25hcHNob3QsIHdhdGNoT25seSkge1xuICBzbmFwc2hvdC5mb3JFYWNoKGdhbWUgPT4ge1xuICAgIGlmIChnYW1lLnZhbCgpLmFuaW1hbCA9PT0gdGhpcy5zZWxlY3RlZEdhbWUpIHtcbiAgICAgIHRoaXMuZm91bmRHYW1lID0gc25hcHNob3QuY2hpbGQoZ2FtZS5rZXkoKSkucmVmKCk7XG4gICAgICBjb25zb2xlLndhcm4odGhpcy5mb3VuZEdhbWUpO1xuICAgICAgaWYgKHdhdGNoT25seSAhPT0gdHJ1ZSkge1xuICAgICAgICB0aGlzLnNob3dOYW1lUHJvbXB0KCk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKCd3YXRjaG9ubHknLCB3YXRjaE9ubHkpO1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiLyVnXCIgKyB0aGlzLmZvdW5kR2FtZS5rZXkoKTtcbiAgICAgICAgdGhpcy5nYW1lID0gbmV3IEdhbWUodGhpcywgdGhpcy5mb3VuZEdhbWUsIG51bGwpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG59O1xuXG5BcHAucHJvdG90eXBlLnNob3dOYW1lUHJvbXB0ID0gZnVuY3Rpb24oKSB7XG4gICQoJyNqb2luX2NvbnRhaW5lcicpLmhpZGUoKTtcbiAgJCgnI2hvc3RfY29udGFpbmVyJykuaGlkZSgpO1xuICAkKCcjbmFtZV9jb250YWluZXInKS5zaG93KCk7XG59O1xuXG5BcHAucHJvdG90eXBlLm9uQ2xpY2tDb2xvciA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICQoJy5jb2xvcicpLnJlbW92ZUNsYXNzKCdzZWxlY3RlZCcpO1xuICAkKGV2ZW50LmN1cnJlbnRUYXJnZXQpLmFkZENsYXNzKCdzZWxlY3RlZCcpO1xufTtcblxuQXBwLnByb3RvdHlwZS5vblN1Ym1pdE5hbWVCdXR0b24gPSBmdW5jdGlvbigpIHtcbiAgdmFyIG5hbWUgPSAkKCcjbmFtZScpLnZhbCgpO1xuXG4gIHRoaXMuZm91bmRHYW1lLmNoaWxkKCdudW1QbGF5ZXJzJykudHJhbnNhY3Rpb24oY3Vyck51bVBsYXllcnMgPT4ge1xuICAgIHJldHVybiBjdXJyTnVtUGxheWVycyArIDE7XG4gIH0sIChlcnIsIGNvbW1pdHRlZCwgc25hcHNob3QpID0+IHtcbiAgICBpZiAoIWNvbW1pdHRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgcGxheWVyT2JqID0gdGhpcy5mb3VuZEdhbWUuY2hpbGQoXCJwbGF5ZXJzXCIpLnB1c2goe1xuICAgICAgbmFtZTogbmFtZSxcbiAgICAgIGlzSG9zdDogdGhpcy5pc0hvc3QsXG4gICAgICBzY29yZTogMCxcbiAgICAgIGFkZGVkOiBEYXRlLm5vdygpLFxuICAgICAgY29sb3I6ICQoJy5jb2xvci5zZWxlY3RlZCcpLmNzcygnYmFja2dyb3VuZC1jb2xvcicpLFxuICAgICAgcmFuazogc25hcHNob3QudmFsKClcbiAgICB9KTtcbiAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiLyVnXCIgKyB0aGlzLmZvdW5kR2FtZS5rZXkoKSArIFwiLyV1XCIgKyBwbGF5ZXJPYmoua2V5KCk7XG4gICAgdGhpcy5nYW1lID0gbmV3IEdhbWUodGhpcywgdGhpcy5mb3VuZEdhbWUsIHBsYXllck9iaik7XG4gIH0pO1xufTtcblxuLy8gRm91bmQgb25saW5lLCBKU09OIHBhcnNlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfbG9hZEpTT04oY2FsbGJhY2spIHtcbiAgdmFyIHhvYmogPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgeG9iai5vdmVycmlkZU1pbWVUeXBlKFwiYXBwbGljYXRpb24vanNvblwiKTtcbiAgeG9iai5vcGVuKCdHRVQnLCAnZGF0YS5qc29uJywgdHJ1ZSk7XG4gIHhvYmoub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh4b2JqLnJlYWR5U3RhdGUgPT0gNCAmJiB4b2JqLnN0YXR1cyA9PSBcIjIwMFwiKSB7XG4gICAgICAvLyBSZXF1aXJlZCB1c2Ugb2YgYW4gYW5vbnltb3VzIGNhbGxiYWNrIGFzIC5vcGVuIHdpbGwgTk9UIHJldHVybiBhIHZhbHVlIGJ1dFxuICAgICAgLy8gc2ltcGx5IHJldHVybnMgdW5kZWZpbmVkIGluIGFzeW5jaHJvbm91cyBtb2RlXG4gICAgICBjYWxsYmFjayh4b2JqLnJlc3BvbnNlVGV4dCk7XG4gICAgfVxuICB9O1xuICB4b2JqLnNlbmQobnVsbCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQXBwO1xuIiwiXG52YXIgYmFzaWNDb250ZXh0ID0gcmVxdWlyZSgnYmFzaWNjb250ZXh0Jyk7XG52YXIgUGxheWVycyA9IHJlcXVpcmUoJy4vUGxheWVycy5qcycpO1xudmFyIFJlc3BvbnNlcyA9IHJlcXVpcmUoJy4vUmVzcG9uc2VzLmpzJyk7XG52YXIgUG9sbCA9IHJlcXVpcmUoJy4vUG9sbC5qcycpO1xudmFyIFN0YXRlID0gcmVxdWlyZSgnLi9TdGF0ZS5qcycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwuanMnKTtcblxuLy8gSGFuZGxlcyBwcmVwYXJpbmcgdGhlIGdhbWUgYW5kIG1vdmluZyBiZXR3ZWVuIHN0YXRlc1xuZnVuY3Rpb24gR2FtZShhcHAsIGdhbWVPYmosIHBsYXllck9iaikge1xuICB0aGlzLmFwcCA9IGFwcDtcbiAgdGhpcy5nYW1lT2JqID0gZ2FtZU9iajtcbiAgdGhpcy5wbGF5ZXJPYmogPSBwbGF5ZXJPYmo7XG5cbiAgdGhpcy5nYW1lTmFtZSA9IG51bGw7XG4gIHRoaXMucGxheWVyTmFtZSA9IG51bGw7XG4gIHRoaXMuaXNIb3N0ID0gbnVsbDtcblxuICB0aGlzLnN0YXRlID0gU3RhdGUuSU5JVDtcbiAgdGhpcy5yb3VuZCA9IDE7XG5cbiAgdGhpcy5wbGF5ZXJzID0gbnVsbDtcbiAgdGhpcy5yZXNwb25zZXMgPSBudWxsO1xuICB0aGlzLnBvbGwgPSBudWxsO1xuXG4gIHRoaXMuaWdub3JlSW5pdGlhbFJlYWQgPSB0cnVlOyAvLyBBbGxvd3MgcHJvZ3JhbSB0byBpZ25vcmUgaW5pdGlhbCBzdGF0ZSByZWFkXG5cbiAgLy8gU2V0IHRoZSBnYW1lIGFuZCBwbGF5ZXIgbmFtZXMgYmVmb3JlIGJ1aWxkaW5nIHRoZSBkb21cbiAgZ2FtZU9iai5jaGlsZChcImFuaW1hbFwiKS5vbmNlKFwidmFsdWVcIikudGhlbihzbmFwc2hvdCA9PiB7XG4gICAgdGhpcy5nYW1lTmFtZSA9IHNuYXBzaG90LnZhbCgpO1xuICAgIHJldHVybiB0aGlzLnBsYXllck9iai5vbmNlKFwidmFsdWVcIik7XG4gIH0pLnRoZW4oc25hcHNob3QgPT4ge1xuICAgIHRoaXMucGxheWVyTmFtZSA9IHNuYXBzaG90LmNoaWxkKFwibmFtZVwiKS52YWwoKTtcbiAgICB0aGlzLmlzSG9zdCA9IHNuYXBzaG90LmNoaWxkKFwiaXNIb3N0XCIpLnZhbCgpO1xuICAgIHJldHVybiB0aGlzLmJ1aWxkRG9tKCk7XG4gIH0pLnRoZW4oKCkgPT4ge1xuICAgIHRoaXMucGxheWVycyA9IG5ldyBQbGF5ZXJzKHRoaXMpO1xuICAgIHRoaXMucmVzcG9uc2VzID0gbmV3IFJlc3BvbnNlcyh0aGlzKTtcbiAgICB0aGlzLnBvbGwgPSBuZXcgUG9sbCh0aGlzKTtcbiAgICB1dGlsLmJpbmRWYWwodGhpcy5nYW1lT2JqLmNoaWxkKCdyb3VuZCcpLCB0aGlzLnJvdW5kKTtcbiAgICB1dGlsLmJpbmRGdW5jKHRoaXMuZ2FtZU9iai5jaGlsZCgnc3RhdGUnKSwgdGhpcy5vblN0YXRlQ2hhbmdlLmJpbmQodGhpcykpO1xuICAgIHV0aWwuYmluZEZ1bmModGhpcy5nYW1lT2JqLmNoaWxkKCdxdWVzdGlvbicpLCB0aGlzLm9uUXVlc3Rpb25VcGRhdGUuYmluZCh0aGlzKSk7XG4gICAgdXRpbC5iaW5kRnVuYyh0aGlzLnBsYXllck9iai5jaGlsZCgnZ3Vlc3NlZCcpLCB0aGlzLm9uR3Vlc3NlZFVwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgICB1dGlsLmJpbmRGdW5jKHRoaXMucGxheWVyT2JqLmNoaWxkKCdyZXNwb25kZWQnKSwgdGhpcy5vblJlc3BvbmRlZFVwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgICB1dGlsLmJpbmRGdW5jKHRoaXMuZ2FtZU9iai5jaGlsZCgnc2NvcmluZycpLCB0aGlzLm9uU2NvcmluZ1VwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgfSk7XG59XG5cbkdhbWUucHJvdG90eXBlLmJ1aWxkRG9tID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUud2FybignYnVpbGRpbmcgZ2FtZScpO1xuICB2YXIgbG9hZEJvZHkgPSAkLkRlZmVycmVkKCk7XG4gICQoZG9jdW1lbnQuYm9keSkubG9hZCgnZ2FtZS5odG1sJywgKCkgPT4gbG9hZEJvZHkucmVzb2x2ZSgpKTtcbiAgcmV0dXJuIGxvYWRCb2R5LnByb21pc2UoKS50aGVuKCgpID0+IHtcbiAgICAkKCcjaGVhZGVyX25hbWUnKS5odG1sKHRoaXMucGxheWVyTmFtZSk7XG4gICAgJCgnI2hlYWRlcl9nYW1lJykuaHRtbCh0aGlzLmdhbWVOYW1lKTtcbiAgICAkKCcjc3VibWl0Jykub24oJ2NsaWNrJywgdGhpcy5vblN1Ym1pdC5iaW5kKHRoaXMpKTtcbiAgICAkKCcjZ3Vlc3NlZCcpLm9uKCdjbGljaycsIHRoaXMub25HdWVzc2VkLmJpbmQodGhpcykpO1xuICAgICQoJyNjb21wbGV0ZScpLm9uKCdjbGljaycsIHRoaXMub25HdWVzc2luZ0NvbXBsZXRlLmJpbmQodGhpcykpO1xuICAgICQoJyNzZXRfc2NvcmVzJykub24oJ2NsaWNrJywgdGhpcy5vblNldFNjb3Jlcy5iaW5kKHRoaXMpKTtcbiAgICAkKCcjbmV4dF9yb3VuZCcpLm9uKCdjbGljaycsIHRoaXMub25OZXh0Um91bmQuYmluZCh0aGlzKSk7XG4gICAgJCgnI3Jlc3BvbnNlJykua2V5cHJlc3MoZXZlbnQgPT4ge1xuICAgICAgaWYgKGV2ZW50LndoaWNoID09PSAxMykge1xuICAgICAgICB0aGlzLm9uU3VibWl0KCk7XG4gICAgICB9XG4gICAgfSk7XG4gICAgdGhpcy5wcmVwYXJlU2V0dGluZ3MoKTtcbiAgfSk7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5wcmVwYXJlU2V0dGluZ3MgPSBmdW5jdGlvbigpIHtcbiAgJCgnI3NldHRpbmdzJykub24oJ2NsaWNrJywgZXZlbnQgPT4ge1xuICAgIHZhciBpdGVtcyA9IFt7XG4gICAgICAgIHRpdGxlOiAnTmV4dCByb3VuZCcsXG4gICAgICAgIGljb246ICdmYSBmYS1mb3J3YXJkJyxcbiAgICAgICAgZm46ICgpID0+IHRoaXMub25OZXh0Um91bmQoKSxcbiAgICAgICAgdmlzaWJsZTogdGhpcy5pc0hvc3RcbiAgICAgIH0sIHtcbiAgICAgIH0sIHtcbiAgICAgICAgdGl0bGU6ICdTaXQgb3V0IHRoaXMgcm91bmQnLFxuICAgICAgICBpY29uOiAnZmEgZmEtYmVkJyxcbiAgICAgICAgZm46ICgpID0+IHt9XG4gICAgICB9LCB7XG4gICAgICAgIHRpdGxlOiAnTGVhdmUgZ2FtZScsXG4gICAgICAgIGljb246ICdmYSBmYS1zaWduLW91dCcsXG4gICAgICAgIGZuOiB0aGlzLnJlbW92ZUZyb21HYW1lLmJpbmQodGhpcywgdGhpcy5wbGF5ZXJPYmoua2V5KCkpXG4gICAgfV07XG4gICAgYmFzaWNDb250ZXh0LnNob3coaXRlbXMsIGV2ZW50Lm9yaWdpbmFsRXZlbnQpO1xuICB9KTtcbn07XG5cbkdhbWUucHJvdG90eXBlLm9uU3RhdGVDaGFuZ2UgPSBmdW5jdGlvbihuZXdTdGF0ZSkge1xuICBjb25zb2xlLmxvZygnc3RhdGUgPT4gJyArIG5ld1N0YXRlKTtcbiAgdGhpcy5zdGF0ZSA9IG5ld1N0YXRlO1xuXG4gIC8vIFVwZGF0ZXMgc2hvdWxkIG9ubHkgb2NjdXIgb24gdHJhbnNpdGlvblxuICB2YXIgc2tpcCA9IHRoaXMuaWdub3JlSW5pdGlhbFJlYWQ7XG4gIHRoaXMuaWdub3JlSW5pdGlhbFJlYWQgPSBmYWxzZTtcbiAgaWYgKHNraXAgJiYgbmV3U3RhdGUgIT09IFN0YXRlLklOSVQpIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBzd2l0Y2ggKG5ld1N0YXRlKSB7XG4gICAgY2FzZSBTdGF0ZS5JTklUOlxuICAgICAgdGhpcy5wbGF5ZXJPYmoudXBkYXRlKHtcbiAgICAgICAgZ3Vlc3NlZDogbnVsbCxcbiAgICAgICAgcmVzcG9uZGVkOiBudWxsLFxuICAgICAgICB2b3RlOiBudWxsXG4gICAgICB9KTtcbiAgICAgIGlmICh0aGlzLmlzSG9zdCkge1xuICAgICAgICB0aGlzLmdhbWVPYmoudXBkYXRlKHtcbiAgICAgICAgICBzdGF0ZTogU3RhdGUuUE9MTCxcbiAgICAgICAgICBwb2xsOiBudWxsLFxuICAgICAgICAgIHJlc3BvbnNlczogbnVsbCxcbiAgICAgICAgICBxdWVzdGlvbjogbnVsbCxcbiAgICAgICAgICBzY29yaW5nOiBudWxsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBTdGF0ZS5QT0xMOlxuICAgICAgaWYgKHRoaXMuaXNIb3N0KSB7XG4gICAgICAgIHRoaXMucG9sbC5waWNrQ2hvaWNlcygpO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBTdGF0ZS5SRVNQT05EOlxuICAgICAgLy8gUmVtb3ZlIHBvbGwgZGF0YSBvbmNlIG5vIGxvbmdlciByZWxldmFudFxuICAgICAgdGhpcy5wbGF5ZXJPYmouY2hpbGQoJ3Jlc3BvbmRlZCcpLnNldChmYWxzZSk7XG4gICAgICBpZiAodGhpcy5pc0hvc3QpIHtcbiAgICAgICAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwb2xsJykudXBkYXRlKHtcbiAgICAgICAgICBhbGxvd1ZvdGluZzogZmFsc2UsXG4gICAgICAgICAgdm90ZXM6IG51bGwsXG4gICAgICAgICAgc3Bpbm5lcjogbnVsbCxcbiAgICAgICAgICB0aW1lb3V0OiBudWxsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgICAgYnJlYWs7XG4gICAgY2FzZSBTdGF0ZS5HVUVTUzpcbiAgICAgIHRoaXMucGxheWVyT2JqLnVwZGF0ZSh7XG4gICAgICAgIHJlc3BvbmRlZDogbnVsbCxcbiAgICAgICAgZ3Vlc3NlZDogZmFsc2VcbiAgICAgIH0pO1xuICAgICAgYnJlYWs7XG4gICAgY2FzZSBTdGF0ZS5TQ09SRTpcbiAgICAgIGJyZWFrO1xuICAgIGNhc2UgU3RhdGUuUkVDQVA6XG4gICAgICBicmVhaztcbiAgfVxufTtcblxuR2FtZS5wcm90b3R5cGUub25RdWVzdGlvblVwZGF0ZSA9IGZ1bmN0aW9uKGNob2ljZSkge1xuICBpZiAoY2hvaWNlKSB7XG4gICAgJCgnLmNob2ljZV9jb250YWluZXInKS5oaWRlKCk7XG4gICAgJCgnIycgKyBjaG9pY2UpLnNob3coKTtcbiAgICAkKCcjJyArIGNob2ljZSkuYWRkQ2xhc3MoJ3dpbm5lcicpO1xuICB9XG4gIGVsc2Uge1xuICAgICQoJy5jaG9pY2VfY29udGFpbmVyJykuc2hvdygpO1xuICAgICQoJy5jaG9pY2VfY29udGFpbmVyJykucmVtb3ZlQ2xhc3MoJ3dpbm5lciBzZWxlY3RlZCcpO1xuICB9XG59O1xuXG5HYW1lLnByb3RvdHlwZS5vbkd1ZXNzZWRVcGRhdGUgPSBmdW5jdGlvbihndWVzc2VkKSB7XG4gIGlmICh0aGlzLmlzSG9zdCkge1xuICAgIGlmIChndWVzc2VkID09PSBmYWxzZSkge1xuICAgICAgJCgnI2d1ZXNzZWRfY29udGFpbmVyJykuc2hvdygpO1xuICAgICAgJCgnI2NvbXBsZXRlJykuc2hvdygpO1xuICAgICAgJCgnI2d1ZXNzZWQnKS5zaG93KCk7XG4gICAgfVxuICAgIGVsc2UgaWYgKGd1ZXNzZWQgPT09IHRydWUpIHtcbiAgICAgICQoJyNndWVzc2VkJykuaGlkZSgpO1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICQoJyNndWVzc2VkX2NvbnRhaW5lcicpLmhpZGUoKTtcbiAgICB9XG4gIH1cbiAgZWxzZSBpZiAoZ3Vlc3NlZCA9PT0gZmFsc2UpIHtcbiAgICAkKCcjZ3Vlc3NlZF9jb250YWluZXInKS5zaG93KCk7XG4gIH0gZWxzZSB7XG4gICAgJCgnI2d1ZXNzZWRfY29udGFpbmVyJykuaGlkZSgpO1xuICB9XG59O1xuXG5HYW1lLnByb3RvdHlwZS5vblJlc3BvbmRlZFVwZGF0ZSA9IGZ1bmN0aW9uKHJlc3BvbmRlZCkge1xuICBpZiAocmVzcG9uZGVkID09PSBmYWxzZSkge1xuICAgICQoJyNzdWJtaXRfY29udGFpbmVyJykuc2hvdygpO1xuICB9IGVsc2Uge1xuICAgICQoJyNzdWJtaXRfY29udGFpbmVyJykuaGlkZSgpO1xuICB9XG59O1xuXG5HYW1lLnByb3RvdHlwZS5vbk5leHRSb3VuZCA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdhbWVPYmoudXBkYXRlKHtcbiAgICBzdGF0ZTogU3RhdGUuSU5JVCxcbiAgICByb3VuZDogdGhpcy5yb3VuZCArIDEsXG4gIH0pO1xufTtcblxuR2FtZS5wcm90b3R5cGUucmVtb3ZlRnJvbUdhbWUgPSBmdW5jdGlvbihwbGF5ZXJLZXkpIHtcbiAgdGhpcy5nYW1lT2JqLmNoaWxkKCdudW1QbGF5ZXJzJykudHJhbnNhY3Rpb24oY3Vyck51bVBsYXllcnMgPT4ge1xuICAgIHJldHVybiBjdXJyTnVtUGxheWVycyAtIDE7XG4gIH0sIChlcnIsIGNvbW1pdHRlZCwgc25hcHNob3QpID0+IHtcbiAgICBpZiAoIWNvbW1pdHRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICAvLyBTZXQgdGhlIHBsYXllcidzIHJhbmsgdG8gMCwgbWVhbmluZyB0aGV5IGFyZSB0byBiZSByZW1vdmVkXG4gICAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykuY2hpbGQocGxheWVyS2V5KS5yZW1vdmUoKTtcbiAgICB2YXIgcmVzcG9uc2VzSW5mbyA9IHRoaXMucmVzcG9uc2VzLnJlc3BvbnNlc0luZm87XG4gICAgLy8gSWYgdGhlIHBsYXllciBoYXMgcmVzcG9uc2VkLCByZW1vdmUgcmVzcG9uc2VcbiAgICBpZiAocmVzcG9uc2VzSW5mbyAhPT0gbnVsbCkge1xuICAgICAgdXRpbC5mb3JFYWNoKHJlc3BvbnNlc0luZm8sICh2YWwsIGtleSkgPT4ge1xuICAgICAgICBpZiAodmFsLmtleSA9PT0gcGxheWVyS2V5KSB7XG4gICAgICAgICAgdGhpcy5nYW1lT2JqLmNoaWxkKCdyZXNwb25zZXMnKS5jaGlsZChrZXkpLnJlbW92ZSgpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG4gIH0pO1xufTtcblxuR2FtZS5wcm90b3R5cGUub25TdWJtaXQgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGlucHV0ID0gJChcIiNyZXNwb25zZVwiKS52YWwoKTtcbiAgaWYgKGlucHV0ID09PSBcIlwiKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMucGxheWVyT2JqLmNoaWxkKCdyZXNwb25kZWQnKS5zZXQodHJ1ZSk7XG4gIHRoaXMuZ2FtZU9iai5jaGlsZCgncmVzcG9uc2VzJykucHVzaCh7XG4gICAga2V5OiB0aGlzLnBsYXllck9iai5rZXkoKSxcbiAgICByZXNwb25zZTogaW5wdXRcbiAgfSk7XG59O1xuXG5HYW1lLnByb3RvdHlwZS5vbkd1ZXNzZWQgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5wbGF5ZXJPYmouY2hpbGQoJ2d1ZXNzZWQnKS5zZXQodHJ1ZSk7XG4gIC8vIExvb2sgaW50byByZXNwb25zZXNJbmZvLCBmaW5kIHlvdXIgcmVzcG9uc2UgYW5kIGVsaW1pbmF0ZSBpdFxuICB1dGlsLmZvckVhY2godGhpcy5yZXNwb25zZXMucmVzcG9uc2VzSW5mbywgKHZhbCwga2V5KSA9PiB7XG4gICAgaWYgKHZhbC5rZXkgPT09IHRoaXMucGxheWVyT2JqLmtleSgpKSB7XG4gICAgICB0aGlzLmdhbWVPYmouY2hpbGQoJ3Jlc3BvbnNlcycpLmNoaWxkKGtleSkudXBkYXRlKHtcbiAgICAgICAgZWxpbWluYXRlZDogdHJ1ZVxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIEhvc3Qgb25seVxuR2FtZS5wcm90b3R5cGUub25HdWVzc2luZ0NvbXBsZXRlID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZ2FtZU9iai51cGRhdGUoe1xuICAgIHN0YXRlOiBTdGF0ZS5TQ09SRSxcbiAgICBzY29yaW5nOiB0cnVlLFxuICAgIHJlc3BvbnNlczogbnVsbFxuICB9KTtcbn07XG5cbi8vIEhvc3Qgb25seVxuR2FtZS5wcm90b3R5cGUub25TZXRTY29yZXMgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykub25jZSgndmFsdWUnLCBzbmFwc2hvdCA9PiB7XG4gICAgc25hcHNob3QuZm9yRWFjaChwbGF5ZXJTbmFwc2hvdCA9PiB7XG4gICAgICB2YXIgc2NvcmVTbmFwc2hvdCA9IHBsYXllclNuYXBzaG90LmNoaWxkKCdzY29yZScpO1xuICAgICAgdmFyIHJhbmsgPSBwbGF5ZXJTbmFwc2hvdC5jaGlsZCgncmFuaycpLnZhbCgpO1xuICAgICAgdmFyIGFkaiA9ICQoJy5zY29yZV9hZGp1c3RtZW50JykuZXEocmFuayAtIDEpO1xuICAgICAgc2NvcmVTbmFwc2hvdC5yZWYoKS5zZXQoc2NvcmVTbmFwc2hvdC52YWwoKSArIHBhcnNlSW50KGFkai5odG1sKCksIDEwKSk7XG4gICAgfSk7XG4gIH0pO1xuICB0aGlzLmdhbWVPYmoudXBkYXRlKHtcbiAgICBzdGF0ZTogU3RhdGUuUkVDQVAsXG4gICAgc2NvcmluZzogZmFsc2VcbiAgfSk7XG4gIHRoaXMucGxheWVycy5zZXRSYW5rcygpO1xufTtcblxuLy8gSG9zdCBvbmx5XG5HYW1lLnByb3RvdHlwZS5vblNjb3JpbmdVcGRhdGUgPSBmdW5jdGlvbihzY29yaW5nKSB7XG4gIGlmIChzY29yaW5nKSB7XG4gICAgJCgnI2d1ZXNzZWRfY29udGFpbmVyJykuaGlkZSgpO1xuICAgICQoJyNzY29yaW5nX2NvbnRhaW5lcicpLnNob3coKTtcbiAgICAkKCcjc2V0X3Njb3JlcycpLnNob3coKTtcbiAgICAkKCcjbmV4dF9yb3VuZCcpLmhpZGUoKTtcbiAgICAkKCcuc2NvcmVfYWRqdXN0ZXInKS5zaG93KCk7XG4gICAgJCgnLm1pbnVzJykub2ZmKCdjbGljaycpO1xuICAgICQoJy5wbHVzJykub2ZmKCdjbGljaycpO1xuICAgICQoJy5taW51cycpLmNsaWNrKGV2ZW50ID0+IHtcbiAgICAgIHZhciBhZGogPSAkKGV2ZW50LnRhcmdldCkuc2libGluZ3MoJy5zY29yZV9hZGp1c3RtZW50Jyk7XG4gICAgICB2YXIgbmV3QWRqVmFsID0gcGFyc2VJbnQoYWRqLmh0bWwoKSwgMTApIC0gMTtcbiAgICAgIGFkai5odG1sKG5ld0FkalZhbCk7XG4gICAgfSk7XG4gICAgJCgnLnBsdXMnKS5jbGljayhldmVudCA9PiB7XG4gICAgICB2YXIgYWRqID0gJChldmVudC50YXJnZXQpLnNpYmxpbmdzKCcuc2NvcmVfYWRqdXN0bWVudCcpO1xuICAgICAgdmFyIG5ld0FkalZhbCA9IHBhcnNlSW50KGFkai5odG1sKCksIDEwKSArIDE7XG4gICAgICBhZGouaHRtbChuZXdBZGpWYWwpO1xuICAgIH0pO1xuICB9XG4gIGVsc2UgaWYgKHNjb3JpbmcgPT09IGZhbHNlKSB7XG4gICAgJCgnI3Njb3JpbmdfY29udGFpbmVyJykuc2hvdygpO1xuICAgICQoJyNzZXRfc2NvcmVzJykuaGlkZSgpO1xuICAgICQoJyNuZXh0X3JvdW5kJykuc2hvdygpO1xuICAgICQoJy5zY29yZV9hZGp1c3RlcicpLmhpZGUoKTtcbiAgfVxuICBlbHNlIHtcbiAgICAkKCcjc2NvcmluZ19jb250YWluZXInKS5oaWRlKCk7XG4gIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gR2FtZTtcbiIsIlxudmFyIGJhc2ljQ29udGV4dCA9IHJlcXVpcmUoJ2Jhc2ljY29udGV4dCcpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwuanMnKTtcbnZhciBOVU1fRlJBTUVTID0gMTU7IC8vIG51bWJlciBvZiBkaWZmZXJlbnQgZnJhbWVzIGJlZm9yZSByZXBlYXRzXG5cbi8vIEhhbmRsZXMgY3JlYXRpb24gYW5kIG1haW50ZW5hbmNlIG9mIHRoZSBsaXN0IG9mIHBsYXllcnNcbmZ1bmN0aW9uIFBsYXllcnMoZ2FtZSkge1xuICB0aGlzLmdhbWUgPSBnYW1lO1xuICB0aGlzLmdhbWVPYmogPSBnYW1lLmdhbWVPYmo7XG4gIHRoaXMucGxheWVyc0luZm8gPSBudWxsO1xuXG4gIHRoaXMuZnJhbWVzID0gXCJcIjtcblxuICB0aGlzLmdhbWVPYmouY2hpbGQoJ2ZyYW1lcycpLm9uKCd2YWx1ZScsXG4gICAgc25hcHNob3QgPT4gdGhpcy5mcmFtZXMgPSBzbmFwc2hvdC52YWwoKVxuICApO1xuICB1dGlsLmJpbmRGdW5jKHRoaXMuZ2FtZU9iai5jaGlsZCgncGxheWVycycpLFxuICAgIHRoaXMub25QbGF5ZXJzVXBkYXRlLmJpbmQodGhpcykpO1xuICAvLyBOb3RlOiByZW1vdmluZyBhIHBsYXllciBkb2VzIG5vdCB0cmlnZ2VyIGEgJ3BsYXllcnMnIHZhbHVlIHVwZGF0ZVxuICB0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKS5vbignY2hpbGRfcmVtb3ZlZCcsIHBsYXllck9iaiA9PiB7XG4gICAgdmFyIHBsYXllciA9IHBsYXllck9iai52YWwoKTtcbiAgICBjb25zb2xlLndhcm4oJ21vdmluZzonLCBwbGF5ZXIsIHBsYXllci5yYW5rLCAtMSk7XG4gICAgdGhpcy5tb3ZlUGxheWVyRG9tKHBsYXllciwgcGxheWVyLnJhbmssIC0xKTtcbiAgICBpZiAodGhpcy5nYW1lLmlzSG9zdCkge1xuICAgICAgdGhpcy5zZXRSYW5rcygpO1xuICAgIH1cbiAgICAvLyBJZiB5b3UgYXJlIHRoZSBwbGF5ZXIgYmVpbmcgcmVtb3ZlZCwgZ28gYmFjayB0byBob21lIHNjcmVlblxuICAgIGlmIChwbGF5ZXJPYmoua2V5KCkgPT09IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCkpIHtcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gXCJcIjsgLy8gQ2xlYXJzIFVSTCBzdWZmaXhcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTsgLy8gRm9yY2UgcmVsb2FkXG4gICAgfVxuICB9KTtcblxuICAvLyB0aGlzLnNoaCgpO1xufVxuXG5QbGF5ZXJzLnByb3RvdHlwZS5jb3VudCA9IGZ1bmN0aW9uKCkge1xuICByZXR1cm4gdXRpbC5zaXplKHRoaXMucGxheWVyc0luZm8pO1xufTtcblxuLy8gV3JpdGVzIG5ldyBwbGF5ZXIgb3JkZXIgdG8gZGF0YWJhc2UsIG9ubHkgaG9zdCBzaG91bGQgZG8gdGhpc1xuLy8gVE9ETzogQ291bGQgYmUgYSB0cmFuc2FjdGlvbiBjb21wbGV0ZWQgYnkgYW55b25lXG5QbGF5ZXJzLnByb3RvdHlwZS5zZXRSYW5rcyA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLndhcm4oJ2NoaWxkIHJlbW92ZWQnKTtcbiAgdmFyIHBsYXllck9yZGVyID0gW107XG4gIGNvbnNvbGUud2Fybignc2V0dGluZyByYW5rcycpO1xuICB0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKS5vbmNlKCd2YWx1ZScsIHNuYXBzaG90ID0+IHtcbiAgICB2YXIgbmV3UGxheWVyc0luZm8gPSBzbmFwc2hvdC52YWwoKTtcbiAgICB1dGlsLmZvckVhY2gobmV3UGxheWVyc0luZm8sICh2YWwsIGtleSkgPT4ge1xuICAgICAgcGxheWVyT3JkZXIucHVzaCh7a2V5OiBrZXksIHZhbDogdmFsfSk7XG4gICAgfSk7XG4gICAgcGxheWVyT3JkZXIuc29ydCgocGxheWVyQSwgcGxheWVyQikgPT4ge1xuICAgICAgdmFyIGFQdHMgPSBwbGF5ZXJBLnZhbC5zY29yZTtcbiAgICAgIHZhciBiUHRzID0gcGxheWVyQi52YWwuc2NvcmU7XG4gICAgICByZXR1cm4gYVB0cyAhPT0gYlB0cyA/IGJQdHMgLSBhUHRzIDogcGxheWVyQS52YWwuYWRkZWQgLSBwbGF5ZXJCLnZhbC5hZGRlZDtcbiAgICB9KTtcbiAgICBwbGF5ZXJPcmRlci5mb3JFYWNoKChwbGF5ZXIsIGluZGV4KSA9PiB7XG4gICAgICBpZiAoaW5kZXggKyAxICE9PSBuZXdQbGF5ZXJzSW5mb1twbGF5ZXIua2V5XS5yYW5rKSB7XG4gICAgICAgIC8vIFNldHRpbmcgbmV3IHJhbmsgaW4gZGJcbiAgICAgICAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykuY2hpbGQocGxheWVyLmtleSlcbiAgICAgICAgICAuY2hpbGQoJ3JhbmsnKS5zZXQoaW5kZXggKyAxKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfSk7XG59O1xuXG5QbGF5ZXJzLnByb3RvdHlwZS5vblBsYXllcnNVcGRhdGUgPSBmdW5jdGlvbihuZXdQbGF5ZXJzSW5mbykge1xuICBjb25zb2xlLndhcm4oJ3ZhbHVlIGNoYW5nZWQnKTtcbiAgbmV3UGxheWVyc0luZm8gPSBuZXdQbGF5ZXJzSW5mbyB8fCB7fTtcbiAgY29uc29sZS53YXJuKCdORVcgUExBWUVSUyBJTkZPPycsIG5ld1BsYXllcnNJbmZvKTtcbiAgLy8gVXBkYXRlIERvbSBmb3IgZWFjaCBwbGF5ZXJcbiAgdXRpbC5mb3JFYWNoKG5ld1BsYXllcnNJbmZvLCB0aGlzLnVwZGF0ZVBsYXllckRvbS5iaW5kKHRoaXMpKTtcbiAgLy8gU2F2ZSBkYXRhIHRvIGNsaWVudFxuICB0aGlzLnBsYXllcnNJbmZvID0gbmV3UGxheWVyc0luZm87XG59O1xuXG5QbGF5ZXJzLnByb3RvdHlwZS51cGRhdGVQbGF5ZXJEb20gPSBmdW5jdGlvbihwbGF5ZXIsIGtleSkge1xuICAvLyBUT0RPOiBTaG91bGQgcmVwbGFjZSBmcmFtZSB3aXRoIHRoZSBzYW1lIGluZGV4LCBhcHBlbmQgb25seSBpZiBub24tZXhpc3RlbnRcbiAgaWYgKCF0aGlzLnBsYXllcnNJbmZvIHx8ICEoa2V5IGluIHRoaXMucGxheWVyc0luZm8pKSB7XG4gICAgLy8gUGxheWVyIG5vdCBpbiBjbGllbnQsIGZpbmQgcGxhY2UgdG8gcHV0IHRoZW1cbiAgICB2YXIgcmFua3MgPSAkKCcjcGxheWVycyA+IConKS50b0FycmF5KCkubWFwKGZyYW1lID0+IHtcbiAgICAgIHZhciBjbGFzc0xpc3QgPSBmcmFtZS5jbGFzc05hbWUuc3BsaXQoL1xccysvKTtcbiAgICAgIHZhciBjbHMgPSBjbGFzc0xpc3QuZmlsdGVyKGNscyA9PiBjbHMuc2xpY2UoMCwgNikgPT09ICdmcmFtZV8nKVswXTtcbiAgICAgIHJldHVybiBwYXJzZUludChjbHNbY2xzLmxlbmd0aCAtIDFdLCAxMCk7XG4gICAgfSk7XG4gICAgcmFua3MgPSByYW5rcy5maWx0ZXIocmFuayA9PiByYW5rIDwgcGxheWVyLnJhbmspO1xuICAgIGlmIChyYW5rcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUud2FybignYXBwZW5kaW5nIHRvIHBsYXllcnMnKTtcbiAgICAgICQoJyNwbGF5ZXJzJykucHJlcGVuZCh0aGlzLmJ1aWxkUGxheWVyRG9tKHBsYXllciwga2V5KSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdmFyIHByZXYgPSBNYXRoLm1heC5hcHBseShudWxsLCByYW5rcyk7XG4gICAgICAkKCcuZnJhbWVfJyArIHByZXYpLmFmdGVyKHRoaXMuYnVpbGRQbGF5ZXJEb20ocGxheWVyLCBrZXkpKTtcbiAgICB9XG4gICAgaWYgKHRoaXMuZ2FtZS5pc0hvc3QpIHtcbiAgICAgIHRoaXMucHJlcGFyZVBsYXllck1lbnUocGxheWVyLCBrZXkpO1xuICAgIH1cbiAgfVxuICBlbHNlIGlmIChwbGF5ZXIucmFuayAhPT0gdGhpcy5wbGF5ZXJzSW5mb1trZXldLnJhbmspIHtcbiAgICBjb25zb2xlLndhcm4oJ1BMQVlFUiBSQU5LIENIQU5HRUQhJywgcGxheWVyLm5hbWUsXG4gICAgICB0aGlzLnBsYXllcnNJbmZvW2tleV0ucmFuayArICcgLT4gJyArIHBsYXllci5yYW5rKTtcbiAgICAvLyBQbGF5ZXIgcmFuayBoYXMgY2hhbmdlZFxuICAgIHRoaXMubW92ZVBsYXllckRvbShwbGF5ZXIsIHRoaXMucGxheWVyc0luZm9ba2V5XS5yYW5rLCBwbGF5ZXIucmFuayk7XG4gICAgaWYgKHRoaXMuZ2FtZS5pc0hvc3QpIHtcbiAgICAgIHRoaXMucHJlcGFyZVBsYXllck1lbnUocGxheWVyLCBrZXkpO1xuICAgIH1cbiAgfVxuICBlbHNlIHtcbiAgICAvLyBQbGF5ZXIgaW4gY2xpZW50XG4gICAgY29uc29sZS53YXJuKCdVUERBVElORyBQTEFZQSBET00nKTtcbiAgICB0aGlzLnNldFpzKHBsYXllcik7XG4gICAgLy8gdmFyIHNwZWVjaERpciA9IHV0aWwucmFuZG9tUGljayhbXCJsZWZ0XCIsIFwicmlnaHRcIl0pO1xuICAgIC8vIGlmIChwbGF5ZXIudm90ZSAmJiBwbGF5ZXIudm90ZSAhPT0gY2xpZW50UGxheWVyLnZvdGUpIHtcbiAgICAvLyAgIHZhciBidWJibGUgPSBwbGF5ZXJEb20uZmluZChcIi5zcGVlY2hfYnViYmxlX1wiICsgc3BlZWNoRGlyKTtcbiAgICAvLyAgIGJ1YmJsZS5zaG93KCk7XG4gICAgLy8gICBidWJibGUuZmluZCgnLnNwZWVjaCcpLmh0bWwocGxheWVyLnZvdGUudG9VcHBlckNhc2UoKSk7XG4gICAgLy8gfVxuICAgIC8vIGVsc2UgaWYgKCFwbGF5ZXIudm90ZSkge1xuICAgIC8vICAgdGhpcy5zaGgoKTtcbiAgICAvLyB9XG4gICAgLy8gVE9ETzogVXBkYXRlIG90aGVyIHByb3BlcnRpZXNcbiAgfVxufTtcblxuLy8gQW5pbWF0ZXMgcGxheWVyIG1vdmluZyBmcm9tIG9uZSBmcmFtZSB0byBhbm90aGVyXG4vLyBBc3N1bWVzIGFsbCBwbGF5ZXJzIHdpbGwgYmUgbW92ZWQgaW4gYSBsb29wXG5QbGF5ZXJzLnByb3RvdHlwZS5tb3ZlUGxheWVyRG9tID0gZnVuY3Rpb24ocGxheWVyLCBzdGFydCwgZW5kKSB7XG4gIHZhciBzZXEgPSBzdGFydCA8IGVuZCB8fCBlbmQgPT09IC0xID8gWydyaWdodF9vdXQnLCAnbGVmdF9pbiddIDpcbiAgICBbJ2xlZnRfb3V0JywgJ3JpZ2h0X2luJ107XG4gIHZhciBkaXN0ID0gTWF0aC5hYnMoc3RhcnQgLSBlbmQpO1xuICB2YXIgZHVyYXRpb24gPSAoTWF0aC5yYW5kb20oKSoxLjAgKyAxLjApICsgJ3MnO1xuICB2YXIgc3RhcnRCb2R5ID0gJCgnLmZyYW1lXycgKyBzdGFydCArICcgLmJvZHknKTtcbiAgdmFyIGVuZEJvZHkgPSAkKCcuZnJhbWVfJyArIGVuZCArICcgLmJvZHknKTtcbiAgdmFyIHN0YXJ0VGFnID0gJCgnLmZyYW1lXycgKyBzdGFydCArICcgLnBsYXllcl9uYW1lJyk7XG4gIHZhciBlbmRUYWcgPSAkKCcuZnJhbWVfJyArIGVuZCArICcgLnBsYXllcl9uYW1lJyk7XG5cbiAgdmFyIHdhbGtJbiA9ICgpID0+IHtcbiAgICBlbmRCb2R5LmZpbmQoJy5oZWFkJykuY3NzKCdiYWNrZ3JvdW5kLWNvbG9yJywgcGxheWVyLmNvbG9yKTtcbiAgICBlbmRCb2R5LmZpbmQoJy50b3JzbycpLmNzcygnYmFja2dyb3VuZC1jb2xvcicsIHBsYXllci5jb2xvcik7XG4gICAgZW5kVGFnLmh0bWwocGxheWVyLm5hbWUpO1xuICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgZW5kQm9keS5jc3MoJ2FuaW1hdGlvbi1kdXJhdGlvbicsIGR1cmF0aW9uKTtcbiAgICAgIGVuZEJvZHkuYWRkQ2xhc3Moc2VxWzFdKTtcbiAgICAgIGVuZEJvZHkuc2hvdygpO1xuICAgICAgZW5kQm9keS5vbmUoJ2FuaW1hdGlvbmVuZCcsICgpID0+IGVuZEJvZHkucmVtb3ZlQ2xhc3Moc2VxWzFdKSk7XG4gICAgICAvLyBGYWRlIGluIHRhZ1xuICAgICAgZW5kVGFnLmNzcyh7XG4gICAgICAgICdvcGFjaXR5JzogJzEuMCcsXG4gICAgICAgICd0cmFuc2l0aW9uLWR1cmF0aW9uJzogZHVyYXRpb25cbiAgICAgIH0pO1xuICAgIH0sIChkaXN0ICogMjUwKSArIDUwMCk7XG4gIH07XG5cbiAgc3RhcnRCb2R5LmNzcygnYW5pbWF0aW9uLWR1cmF0aW9uJywgZHVyYXRpb24pO1xuICBzdGFydEJvZHkuYWRkQ2xhc3Moc2VxWzBdKTsgLy8gV2FsayBvdXRcbiAgLy8gRmFkZSBvdXQgdGFnXG4gIHN0YXJ0VGFnLmNzcyh7XG4gICAgJ29wYWNpdHknOiAnMC4wJyxcbiAgICAndHJhbnNpdGlvbi1kdXJhdGlvbic6IGR1cmF0aW9uXG4gIH0pO1xuICBzdGFydEJvZHkub25lKCdhbmltYXRpb25lbmQnLCAoKSA9PiB7XG4gICAgc3RhcnRCb2R5LmhpZGUoKTtcbiAgICBzdGFydEJvZHkucmVtb3ZlQ2xhc3MoJ3JpZ2h0X291dCBsZWZ0X2luIGxlZnRfb3V0IHJpZ2h0X2luJyk7XG4gICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZWxzZSBpZiAoZW5kQm9keS5oYXNDbGFzcygncmlnaHRfb3V0JykgfHwgZW5kQm9keS5oYXNDbGFzcygnbGVmdF9vdXQnKSkge1xuICAgICAgLy8gSWYgZGVzdGluYXRpb24gaXMgc3RpbGwgYW5pbWF0aW5nLCB3YWl0IHVudGlsIGl0IGZpbmlzaGVzXG4gICAgICBlbmRCb2R5Lm9uZSgnYW5pbWF0aW9uZW5kJywgd2Fsa0luKTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2Fsa0luKCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBzaW5nbGUgaW5zdGFuY2Ugb2YgYSBwbGF5ZXIgRE9NIGl0ZW1cblBsYXllcnMucHJvdG90eXBlLmJ1aWxkUGxheWVyRG9tID0gZnVuY3Rpb24ocGxheWVyLCBrZXkpIHtcbiAgY29uc29sZS53YXJuKCdwbGF5ZXIsIGtleScsIHBsYXllciwga2V5KTtcbiAgdmFyIHBsYXllcktleSA9IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCk7XG4gIHZhciBpc1VzZXIgPSBrZXkgPT09IHBsYXllcktleTtcblxuICB2YXIgYWxsRnJhbWVzID0gWydmcmFtZV9vdmFsJywgJ2ZyYW1lX3NxdWFyZScsICdmcmFtZV9yZWN0J107XG5cbiAgLy8gMTUgaXMgdGhlIG51bWJlciBvZiBmcmFtZXNcbiAgdmFyIHZhbHVlID0gcGFyc2VJbnQodGhpcy5mcmFtZXNbKHBsYXllci5yYW5rIC0gMSkgJSBOVU1fRlJBTUVTXSwgMTApO1xuICB2YXIgZnJhbWUgPSBhbGxGcmFtZXNbTWF0aC5mbG9vcih2YWx1ZSAlIDMpXTtcblxuICByZXR1cm4gXCI8ZGl2IGNsYXNzPSdmcmFtZSBmcmFtZV9cIiArIHBsYXllci5yYW5rICsgXCInPlwiICtcbiAgICAodGhpcy5nYW1lLmlzSG9zdCAmJiAhaXNVc2VyID8gXCI8ZGl2IGNsYXNzPSdwbGF5ZXJfbWVudSBmYSBmYS1jb2cnPjwvZGl2PlwiIDogXCJcIikgK1xuICAgIFwiPGRpdiBjbGFzcz0nZnJhbWVfY29udGVudCBcIiArIGZyYW1lICsgXCInPlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0nenp6JyBzdHlsZT0nZGlzcGxheTpcIiArIChwbGF5ZXIuYXNsZWVwID8gXCJibG9ja1wiIDogXCJub25lXCIpICsgXCI7Jz5cIiArXG4gICAgICAgIFwiPGRpdiBjbGFzcz0neiB6MSc+ejwvZGl2PlwiICtcbiAgICAgICAgXCI8ZGl2IGNsYXNzPSd6IHoyJz56PC9kaXY+XCIgK1xuICAgICAgICBcIjxkaXYgY2xhc3M9J3ogejMnPno8L2Rpdj5cIiArXG4gICAgICBcIjwvZGl2PlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0nYm9keSc+XCIgK1xuICAgICAgICBcIjxkaXYgY2xhc3M9J2hlYWQnIHN0eWxlPSdiYWNrZ3JvdW5kLWNvbG9yOlwiICsgcGxheWVyLmNvbG9yICsgXCI7Jz48L2Rpdj5cIiArXG4gICAgICAgIFwiPGRpdiBjbGFzcz0ndG9yc28nIHN0eWxlPSdiYWNrZ3JvdW5kLWNvbG9yOlwiICsgcGxheWVyLmNvbG9yICsgXCI7Jz48L2Rpdj5cIiArXG4gICAgICBcIjwvZGl2PlwiICtcbiAgICBcIjwvZGl2PlwiICtcbiAgICB0aGlzLmJ1aWxkUGxhcXVlKHBsYXllci5uYW1lKSArXG4gICAgXCI8ZGl2IGNsYXNzPSdzY29yZV9hZGp1c3Rlcic+XCIgK1xuICAgICAgXCI8ZGl2IGNsYXNzPSdtaW51cyc+LTwvZGl2PlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0nc2NvcmVfYWRqdXN0bWVudCc+MDwvZGl2PlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0ncGx1cyc+KzwvZGl2PlwiICtcbiAgICBcIjwvZGl2PlwiICtcbiAgXCI8L2Rpdj5cIjtcbiAgLy8gICBcIjxkaXYgY2xhc3M9J3NwZWVjaF9idWJibGUgc3BlZWNoX2J1YmJsZV9sZWZ0Jz5cIiArXG4gIC8vICAgICBcIjxkaXYgY2xhc3M9J3NwZWVjaCBzcGVlY2hfbGVmdCc+PC9kaXY+XCIgK1xuICAvLyAgICAgXCI8ZGl2IGNsYXNzPSdwb2ludGVyX2xlZnQnPjwvZGl2PlwiICtcbiAgLy8gICBcIjwvZGl2PlwiICtcbiAgLy8gICBcIjxkaXYgY2xhc3M9J3NwZWVjaF9idWJibGUgc3BlZWNoX2J1YmJsZV9yaWdodCc+XCIgK1xuICAvLyAgICAgXCI8ZGl2IGNsYXNzPSdzcGVlY2ggc3BlZWNoX3JpZ2h0Jz48L2Rpdj5cIiArXG4gIC8vICAgICBcIjxkaXYgY2xhc3M9J3BvaW50ZXJfcmlnaHQnPjwvZGl2PlwiICtcbiAgLy8gICBcIjwvZGl2PlwiICtcbn07XG5cblBsYXllcnMucHJvdG90eXBlLnByZXBhcmVQbGF5ZXJNZW51ID0gZnVuY3Rpb24ocGxheWVyLCBrZXkpIHtcbiAgdmFyIG1lbnUgPSAkKCcuZnJhbWVfJyArIHBsYXllci5yYW5rICsgJyAucGxheWVyX21lbnUnKTtcbiAgLy8gSW4gY2FzZSBpdCBpcyBjYWxsZWQgdHdpY2VcbiAgbWVudS5vZmYoJ2NsaWNrJyk7XG4gIG1lbnUub24oJ2NsaWNrJywgZXZlbnQgPT4ge1xuICAgIHZhciBpdGVtcyA9IFt7XG4gICAgICAgIHRpdGxlOiAnU2l0IG91dCB0aGlzIHJvdW5kJyxcbiAgICAgICAgaWNvbjogJ2ZhIGZhLWJlZCcsXG4gICAgICAgIGZuOiAoKSA9PiB0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKS5jaGlsZChrZXkpLmNoaWxkKCdhc2xlZXAnKS5zZXQodHJ1ZSlcbiAgICAgIH0sIHtcbiAgICAgICAgdGl0bGU6ICdSZW1vdmUgcGxheWVyJyxcbiAgICAgICAgaWNvbjogJ2ZhIGZhLWJhbicsXG4gICAgICAgIGZuOiAoKSA9PiB0aGlzLmdhbWUucmVtb3ZlRnJvbUdhbWUoa2V5KVxuICAgIH1dO1xuICAgIGJhc2ljQ29udGV4dC5zaG93KGl0ZW1zLCBldmVudC5vcmlnaW5hbEV2ZW50KTtcbiAgfSk7XG59O1xuXG5QbGF5ZXJzLnByb3RvdHlwZS5idWlsZFBsYXF1ZSA9IGZ1bmN0aW9uKG5hbWUpIHtcbiAgcmV0dXJuIFwiPGRpdiBjbGFzcz0ncGxhcXVlIHBsYXF1ZV9iYW5uZXInPlwiICtcbiAgICBcIjxkaXYgY2xhc3M9J25hbWV0YWcnPlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0ncGxheWVyX25hbWUnPlwiICsgbmFtZSArIFwiPC9kaXY+XCIgK1xuICAgIFwiPC9kaXY+XCIgK1xuICAgIFwiPGRpdiBjbGFzcz0nYmFubmVyX2xlZnRfZm9sZCc+PC9kaXY+XCIgK1xuICAgIFwiPGRpdiBjbGFzcz0nYmFubmVyX2xlZnRfZnJpbmdlJz48L2Rpdj5cIiArXG4gICAgXCI8ZGl2IGNsYXNzPSdiYW5uZXJfcmlnaHRfZm9sZCc+PC9kaXY+XCIgK1xuICAgIFwiPGRpdiBjbGFzcz0nYmFubmVyX3JpZ2h0X2ZyaW5nZSc+PC9kaXY+XCIgK1xuICBcIjwvZGl2PlwiO1xufTtcblxuUGxheWVycy5wcm90b3R5cGUuc2V0WnMgPSBmdW5jdGlvbihwbGF5ZXIpIHtcbiAgdmFyIHp6eiA9ICQoJy5mcmFtZV8nICsgcGxheWVyLnJhbmsgKyAnIC56enonKTtcbiAgaWYgKHBsYXllci5hc2xlZXApIHtcbiAgICB6enouc2hvdygpO1xuICB9XG4gIGVsc2Uge1xuICAgIHp6ei5oaWRlKCk7XG4gIH1cbn07XG5cbi8vIFBsYXllcnMucHJvdG90eXBlLnNoaCA9IGZ1bmN0aW9uKCkge1xuLy8gICAkKCcuc3BlZWNoX2J1YmJsZScpLmhpZGUoKTtcbi8vIH07XG5cbm1vZHVsZS5leHBvcnRzID0gUGxheWVycztcbiIsIlxudmFyIFN0YXRlID0gcmVxdWlyZSgnLi9TdGF0ZS5qcycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwuanMnKTtcblxudmFyIERVUkFUSU9OID0gMzAwMDtcblxuLy8gSGFuZGxlcyBjcmVhdGlvbiBvZiB0aGUgbGlzdCBvZiBxdWVzdGlvbnMgYW5kIHRoZSBwb2xsIHByb2Nlc3NcbmZ1bmN0aW9uIFBvbGwoZ2FtZSkge1xuICB0aGlzLmdhbWUgPSBnYW1lO1xuICB0aGlzLnRpbWVyID0gbmV3IFRpbWVyKCk7XG4gIHRoaXMuc3Bpbm5lciA9IG5ldyBTcGlubmVyKCk7XG5cbiAgdGhpcy5wb2xsT2JqID0gdGhpcy5nYW1lLmdhbWVPYmouY2hpbGQoJ3BvbGwnKTtcblxuICB0aGlzLmNob2ljZXNJbmZvID0gbnVsbDtcbiAgdGhpcy52b3Rlc0luZm8gPSBudWxsO1xuICB0aGlzLnRpbWVvdXQgPSBudWxsO1xuXG4gIHRoaXMuY291bnQgPSB7IGE6IDAsIGI6IDAsIGM6IDAgfTtcblxuICB1dGlsLmJpbmRGdW5jKHRoaXMucG9sbE9iai5jaGlsZCgnY2hvaWNlcycpLCB0aGlzLm9uQ2hvaWNlc1VwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgdXRpbC5iaW5kRnVuYyh0aGlzLnBvbGxPYmouY2hpbGQoJ2FsbG93Vm90aW5nJyksIHRoaXMub25BbGxvd1ZvdGluZ1VwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgdXRpbC5iaW5kRnVuYyh0aGlzLnBvbGxPYmouY2hpbGQoJ3ZvdGVzJyksIHRoaXMub25Wb3Rlc1VwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgdXRpbC5iaW5kRnVuYyh0aGlzLnBvbGxPYmouY2hpbGQoJ3RpbWVvdXQnKSwgdGhpcy5vblRpbWVvdXRDaGFuZ2UuYmluZCh0aGlzKSk7XG4gIHV0aWwuYmluZEZ1bmModGhpcy5wb2xsT2JqLmNoaWxkKCdzcGlubmVyJyksIHRoaXMub25TcGlubmVyVXBkYXRlLmJpbmQodGhpcykpO1xufVxuXG5Qb2xsLnByb3RvdHlwZS5vbkFsbG93Vm90aW5nVXBkYXRlID0gZnVuY3Rpb24oYWxsb3dWb3RpbmcpIHtcbiAgaWYgKGFsbG93Vm90aW5nKSB7XG4gICAgJChcIiNhXCIpLm9uKCdjbGljaycsIHRoaXMub25Wb3RlLmJpbmQodGhpcywgJ2EnKSk7XG4gICAgJChcIiNiXCIpLm9uKCdjbGljaycsIHRoaXMub25Wb3RlLmJpbmQodGhpcywgJ2InKSk7XG4gICAgJChcIiNjXCIpLm9uKCdjbGljaycsIHRoaXMub25Wb3RlLmJpbmQodGhpcywgJ2MnKSk7XG4gICAgdGhpcy50aW1lci5zaG93KCk7XG4gIH1cbiAgZWxzZSB7XG4gICAgJChcIi5jaG9pY2VfY29udGFpbmVyXCIpLm9mZignY2xpY2snKTtcbiAgICB0aGlzLnRpbWVyLmhpZGUoKTtcbiAgfVxufTtcblxuUG9sbC5wcm90b3R5cGUucGlja0Nob2ljZXMgPSBmdW5jdGlvbigpIHtcbiAgdmFyIGFsbFF1ZXN0aW9ucyA9IHRoaXMuZ2FtZS5hcHAuanNvbkRhdGEucXVlc3Rpb25zO1xuICB2YXIgcGlja3MgPSB1dGlsLnJhbmRvbVBpY2tzKGFsbFF1ZXN0aW9ucywgMyk7XG4gIHRoaXMuZ2FtZS5nYW1lT2JqLnVwZGF0ZSh7XG4gICAgcmVzcG9uc2VzOiBudWxsLFxuICAgIHBvbGw6IHtcbiAgICAgIGFsbG93Vm90aW5nOiB0cnVlLFxuICAgICAgY2hvaWNlczoge1xuICAgICAgICBhOiBwaWNrc1swXSxcbiAgICAgICAgYjogcGlja3NbMV0sXG4gICAgICAgIGM6IHBpY2tzWzJdXG4gICAgICB9LFxuICAgICAgdGltZW91dDogJ3JlYWR5J1xuICAgIH1cbiAgfSk7XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5vbkNob2ljZXNVcGRhdGUgPSBmdW5jdGlvbihjaG9pY2VzSW5mbykge1xuICB0aGlzLmNob2ljZXNJbmZvID0gY2hvaWNlc0luZm8gfHwge307XG4gIHV0aWwuZm9yRWFjaCh0aGlzLmNob2ljZXNJbmZvLCAoY2hvaWNlLCBsZXR0ZXIpID0+ICQoJyNjaG9pY2VfJyArIGxldHRlcikuaHRtbChjaG9pY2UpKTtcbiAgLy8gSWYgbm8gY2hvaWNlcywgcmVtb3ZlIGRvbVxuICBpZiAodXRpbC5zaXplKHRoaXMuY2hvaWNlc0luZm8pID09PSAwKSB7XG4gICAgJCgnLmNob2ljZScpLmVhY2goKGksIG1hdGNoKSA9PiB7XG4gICAgICBtYXRjaC5pbm5lckhUTUwgPSBcIlwiO1xuICAgIH0pO1xuICB9XG4gIHRoaXMuaGFzVm90ZWQgPSBmYWxzZTtcbn07XG5cblBvbGwucHJvdG90eXBlLm9uVm90ZXNVcGRhdGUgPSBmdW5jdGlvbih2b3Rlc0luZm8pIHtcbiAgLy8gQnVpbGQgYWxsIG1hcmtlcnMgdG8gaW5kaWNhdGUgdm90ZXJzXG4gIC8vIFRPRE86IEN1cnJlbnRseSBidWlsZHMgYWxsIGZyb20gc2NyYXRjaCBvbiBhbnkgY2hhbmdlXG4gIHRoaXMudm90ZXNJbmZvID0gdm90ZXNJbmZvIHx8IHt9O1xuICB0aGlzLmNvdW50ID0geyBhOiAwLCBiOiAwLCBjOiAwIH07XG4gIHV0aWwuZm9yRWFjaCh0aGlzLnZvdGVzSW5mbywgdm90ZURhdGEgPT4gdGhpcy5jb3VudFt2b3RlRGF0YS52b3RlXSsrKTtcblxuICB2YXIgbnVtVm90ZXJzID0gdXRpbC5zaXplKHRoaXMudm90ZXNJbmZvKTtcblxuICAvLyBJZiBubyBvbmUgaGFzIHZvdGVkIChpbml0aWFsIHN0YXRlKSwgY2xlYXIgdm90ZSBjb3VudHNcbiAgaWYgKG51bVZvdGVycyA9PT0gMCkge1xuICAgICQoJy52b3RlcnMnKS5lYWNoKChpLCBtYXRjaCkgPT4gbWF0Y2guaW5uZXJIVE1MID0gXCJcIik7XG4gIH1cbiAgLy8gSWYgc29tZW9uZSB2b3RlZCwgYW5kIGl0IGlzbid0IGFscmVhZHkgc2V0LCBzZXQgdGhlIHRpbWVvdXQuXG4gIGlmIChudW1Wb3RlcnMgPiAwKSB7XG4gICAgdGhpcy5wb2xsT2JqLmNoaWxkKCd0aW1lb3V0JykudHJhbnNhY3Rpb24oY3VyclRpbWVvdXQgPT4ge1xuICAgICAgcmV0dXJuIGN1cnJUaW1lb3V0ID09PSAncmVhZHknID8gRGF0ZS5ub3coKSArIERVUkFUSU9OIDogdW5kZWZpbmVkO1xuICAgIH0pO1xuICB9XG4gIC8vIElmIGV2ZXJ5b25lIHZvdGVkLCBwaWNrIHF1ZXN0aW9uIGFuZCBjaGFuZ2Ugc3RhdGUgdG8gcmVzcG9uZC5cbiAgaWYgKG51bVZvdGVycyA9PT0gdGhpcy5nYW1lLnBsYXllcnMuY291bnQoKSkge1xuICAgIHRoaXMudGltZXIuc3RvcCgpO1xuICB9XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5vblRpbWVvdXRDaGFuZ2UgPSBmdW5jdGlvbih0aW1lb3V0KSB7XG4gIHRoaXMudGltZW91dCA9IHRpbWVvdXQ7XG4gIGlmICh0eXBlb2YgdGltZW91dCA9PT0gJ251bWJlcicpIHtcbiAgICB0aGlzLnRpbWVyLnN0YXJ0KHRpbWVvdXQsICgpID0+IHtcbiAgICAgIGlmICh0aGlzLmdhbWUuaXNIb3N0KSB7XG4gICAgICAgIHRoaXMucGlja1dpbm5lcigpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5vblZvdGUgPSBmdW5jdGlvbihjaG9pY2UpIHtcbiAgdmFyIHBlcnNvbmFsVm90ZSA9IHV0aWwuZmluZChPYmplY3Qua2V5cyh0aGlzLnZvdGVzSW5mbyksIHZvdGVLZXkgPT4ge1xuICAgIHJldHVybiB0aGlzLnZvdGVzSW5mb1t2b3RlS2V5XS5wbGF5ZXJLZXkgPT09IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCk7XG4gIH0pO1xuICBpZiAocGVyc29uYWxWb3RlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMucG9sbE9iai5jaGlsZCgndm90ZXMnKS5wdXNoKHtcbiAgICBuYW1lOiB0aGlzLmdhbWUucGxheWVyTmFtZSxcbiAgICBwbGF5ZXJLZXk6IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCksXG4gICAgdm90ZTogY2hvaWNlXG4gIH0pO1xuICB0aGlzLmdhbWUucGxheWVyT2JqLmNoaWxkKCd2b3RlJykuc2V0KGNob2ljZSk7XG59O1xuXG4vLyBPbmx5IGNhbGxlZCBieSBob3N0XG5Qb2xsLnByb3RvdHlwZS5waWNrV2lubmVyID0gZnVuY3Rpb24oKSB7XG4gIHZhciBtYXhWb3RlcyA9IE1hdGgubWF4LmFwcGx5KG51bGwsIHV0aWwudmFsdWVzKHRoaXMuY291bnQpKTtcbiAgdmFyIGZpbmFsaXN0cyA9IE9iamVjdC5rZXlzKHRoaXMuY291bnQpLmZpbHRlcihjaG9pY2UgPT4ge1xuICAgIHJldHVybiB0aGlzLmNvdW50W2Nob2ljZV0gPT09IG1heFZvdGVzO1xuICB9KTtcbiAgaWYgKGZpbmFsaXN0cy5sZW5ndGggPiAxKSB7XG4gICAgdGhpcy5wb2xsT2JqLmNoaWxkKCdzcGlubmVyJykudXBkYXRlKHtcbiAgICAgIGNob2ljZXM6IGZpbmFsaXN0cy5qb2luKCcnKSxcbiAgICAgIHNlcXVlbmNlOiBTcGlubmVyLnJhbmRvbVNlcXVlbmNlKCksXG4gICAgICBzdGFydEluZGV4OiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBmaW5hbGlzdHMubGVuZ3RoKVxuICAgIH0pO1xuICB9XG4gIGVsc2Uge1xuICAgIHRoaXMuc3VibWl0V2lubmVyKGZpbmFsaXN0c1swXSk7XG4gIH1cbn07XG5cblBvbGwucHJvdG90eXBlLm9uU3Bpbm5lclVwZGF0ZSA9IGZ1bmN0aW9uKHNwaW5PYmopIHtcbiAgaWYgKHNwaW5PYmogJiYgc3Bpbk9iai5zZXF1ZW5jZSkge1xuICAgIHRoaXMuc3Bpbm5lci5zdGFydChzcGluT2JqLmNob2ljZXMsIHNwaW5PYmouc2VxdWVuY2UsIHNwaW5PYmouc3RhcnRJbmRleCwgaXRlbSA9PiB7XG4gICAgICBpZiAodGhpcy5nYW1lLmlzSG9zdCkge1xuICAgICAgICB0aGlzLnN1Ym1pdFdpbm5lcihpdGVtKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufTtcblxuLy8gT25seSBjYWxsZWQgYnkgaG9zdFxuUG9sbC5wcm90b3R5cGUuc3VibWl0V2lubmVyID0gZnVuY3Rpb24od2lubmVyKSB7XG4gIHRoaXMuZ2FtZS5nYW1lT2JqLnVwZGF0ZSh7XG4gICAgcXVlc3Rpb246IHdpbm5lcixcbiAgICBzdGF0ZTogU3RhdGUuUkVTUE9ORCxcbiAgfSk7XG59O1xuXG4vLyBBIHNpbXBsZSBjb3VudGRvd24gdGltZXJcbmZ1bmN0aW9uIFRpbWVyKCkge1xuICB0aGlzLmludGVydmFsSWQgPSBudWxsO1xuICB0aGlzLmlzUnVubmluZyA9IGZhbHNlO1xuICB0aGlzLnN0b3BDYWxsYmFjayA9ICgpID0+IHt9O1xufVxuXG5UaW1lci5wcm90b3R5cGUuc3RhcnQgPSBmdW5jdGlvbih0aW1lb3V0LCBzdG9wQ2FsbGJhY2spIHtcbiAgaWYgKHRoaXMuaXNSdW5uaW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuaXNSdW5uaW5nID0gdHJ1ZTtcbiAgdGhpcy5zdG9wQ2FsbGJhY2sgPSBzdG9wQ2FsbGJhY2s7XG4gIHRoaXMuaW50ZXJ2YWxJZCA9IHdpbmRvdy5zZXRJbnRlcnZhbCh0aGlzLmJ1aWxkRG9tLmJpbmQodGhpcyksIDEwLCB0aW1lb3V0KTtcbn07XG5cblRpbWVyLnByb3RvdHlwZS5idWlsZERvbSA9IGZ1bmN0aW9uKHRpbWVvdXQpIHtcbiAgdmFyIHRpbWVMZWZ0ID0gdGltZW91dCAtIERhdGUubm93KCk7XG4gIHZhciBoYWxmID0gRFVSQVRJT04gLyAyO1xuICB2YXIgZnJhYztcbiAgdmFyIGRlZztcbiAgaWYgKHRpbWVMZWZ0ID4gaGFsZikge1xuICAgICQoJy5tYXNrX3NsaWNlJykuaGlkZSgpO1xuICAgICQoJy5zbGljZScpLnNob3coKTtcbiAgICAvLyBTbGljZSBnb2VzIDkwZGVnIC0+IDI3MGRlZ1xuICAgIGZyYWMgPSAxIC0gKCh0aW1lTGVmdCAtIGhhbGYpIC8gaGFsZik7XG4gICAgZGVnID0gKGZyYWMgKiAxODApO1xuICAgICQoJy5zbGljZScpLmNzcygndHJhbnNmb3JtJywgJ3JvdGF0ZSgnICsgZGVnICsgJ2RlZyknKTtcbiAgfVxuICBlbHNlIGlmICh0aW1lTGVmdCA8IGhhbGYgJiYgdGltZUxlZnQgPiAwKSB7XG4gICAgJCgnLnNsaWNlJykuaGlkZSgpO1xuICAgICQoJy5tYXNrX3NsaWNlJykuc2hvdygpO1xuICAgIGZyYWMgPSAxIC0gKHRpbWVMZWZ0IC8gaGFsZik7XG4gICAgZGVnID0gKGZyYWMgKiAxODApO1xuICAgICQoJy5tYXNrX3NsaWNlJykuY3NzKCd0cmFuc2Zvcm0nLCAncm90YXRlKCcgKyBkZWcgKyAnZGVnKScpO1xuICB9XG4gIGVsc2Uge1xuICAgIHRoaXMuc3RvcCgpO1xuICB9XG59O1xuXG5UaW1lci5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKCkge1xuICB3aW5kb3cuY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsSWQpO1xuICB0aGlzLmlzUnVubmluZyA9IGZhbHNlO1xuICB0aGlzLnN0b3BDYWxsYmFjaygpO1xufTtcblxuVGltZXIucHJvdG90eXBlLnNob3cgPSBmdW5jdGlvbigpIHtcbiAgJCgnLnRpbWVyJykuc2hvdygpO1xuICAkKCcuc2xpY2UnKS5jc3MoJ3RyYW5zZm9ybScsICdyb3RhdGUoMGRlZyknKTtcbiAgJCgnLnNsaWNlJykuc2hvdygpO1xuICAkKCcubWFza19zbGljZScpLmhpZGUoKTtcbn07XG5cblRpbWVyLnByb3RvdHlwZS5oaWRlID0gZnVuY3Rpb24oKSB7XG4gICQoJy50aW1lcicpLmhpZGUoKTtcbn07XG5cblxuLy8gQSByYW5kb20gc2VsZWN0aW9uIHNwaW5uZXJcbmZ1bmN0aW9uIFNwaW5uZXIoKSB7XG4gIHRoaXMuaW50ZXJ2YWxJZCA9IG51bGw7XG4gIHRoaXMuaXNSdW5uaW5nID0gZmFsc2U7XG4gIHRoaXMuc3RvcENhbGxiYWNrID0gKCkgPT4ge307XG59XG5cblNwaW5uZXIucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24oY2hvaWNlcywgc2VxLCBzdGFydEluZGV4LCBzdG9wQ2FsbGJhY2spIHtcbiAgaWYgKHRoaXMuaXNSdW5uaW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuaXNSdW5uaW5nID0gdHJ1ZTtcbiAgdGhpcy5zdG9wQ2FsbGJhY2sgPSBzdG9wQ2FsbGJhY2s7XG4gIHRoaXMuaW50ZXJ2YWxJZCA9IHdpbmRvdy5zZXRJbnRlcnZhbChcbiAgICB0aGlzLmJ1aWxkRG9tLmJpbmQodGhpcyksIDEwLCBjaG9pY2VzLCBzZXEsIHN0YXJ0SW5kZXhcbiAgKTtcbn07XG5cblNwaW5uZXIucHJvdG90eXBlLmJ1aWxkRG9tID0gZnVuY3Rpb24oY2hvaWNlcywgc2VxLCBzdGFydEluZGV4KSB7XG4gIHZhciBub3cgPSBEYXRlLm5vdygpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHNlcS5sZW5ndGggLSAxOyBpKyspIHtcbiAgICBpZiAobm93ID49IHNlcVtpXSAmJiBub3cgPCBzZXFbaSArIDFdKSB7XG4gICAgICB2YXIgcGljayA9IGNob2ljZXNbKHN0YXJ0SW5kZXggKyBpKSAlIGNob2ljZXMubGVuZ3RoXTtcbiAgICAgICQoJy5jaG9pY2VfY29udGFpbmVyJykucmVtb3ZlQ2xhc3MoJ3NlbGVjdGVkJyk7XG4gICAgICAkKCcjJyArIHBpY2spLmFkZENsYXNzKCdzZWxlY3RlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuICBpZiAobm93ID49IHNlcVtzZXEubGVuZ3RoIC0gMV0pIHtcbiAgICB0aGlzLnN0b3AoY2hvaWNlc1soc3RhcnRJbmRleCArIHNlcS5sZW5ndGggLSAyKSAlIGNob2ljZXMubGVuZ3RoXSk7XG4gIH1cbn07XG5cblNwaW5uZXIucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbih3aW5uZXIpIHtcbiAgd2luZG93LmNsZWFySW50ZXJ2YWwodGhpcy5pbnRlcnZhbElkKTtcbiAgdGhpcy5pc1J1bm5pbmcgPSBmYWxzZTtcbiAgdGhpcy5zdG9wQ2FsbGJhY2sod2lubmVyKTtcbn07XG5cbi8vIEdlbmVyYXRlcyBhIHJhbmRvbSBzZXF1ZW5jZSB0aGF0IGlzIGRlbGF5ZWQgb3ZlciB0aW1lXG5TcGlubmVyLnJhbmRvbVNlcXVlbmNlID0gZnVuY3Rpb24oKSB7XG4gIC8vIFNlcXVlbmNlcyBvZiB0aW1lIHZhbHVlcyBvbiB3aGljaCB0byBjaGFuZ2Ugc2VsZWN0aW9uXG4gIHZhciBzZXEgPSBbXTtcbiAgdmFyIHRpbWUgPSBEYXRlLm5vdygpO1xuICB2YXIgZGVsYXkgPSA1MDtcbiAgd2hpbGUgKGRlbGF5IDwgODAwICsgKE1hdGgucmFuZG9tKCkgKiAxMDApKSB7XG4gICAgc2VxLnB1c2godGltZSk7XG4gICAgdGltZSArPSBkZWxheTtcbiAgICBkZWxheSAqPSAxLjIgKyAoTWF0aC5yYW5kb20oKSAqIDAuMDUpO1xuICB9XG4gIHNlcS5wdXNoKHRpbWUpO1xuICByZXR1cm4gc2VxO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQb2xsO1xuIiwiXG52YXIgU3RhdGUgPSByZXF1aXJlKCcuL1N0YXRlLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG4vLyBIYW5kbGVzIGNyZWF0aW9uIGFuZCBjcm9zc2luZyBvdXQgb2YgdGhlIGxpc3Qgb2YgcmVzcG9uc2VzXG5mdW5jdGlvbiBSZXNwb25zZXMoZ2FtZSkge1xuICB0aGlzLmdhbWUgPSBnYW1lO1xuXG4gIHRoaXMucmVzcG9uc2VzSW5mbyA9IG51bGw7XG4gIHRoaXMucmVzcG9uc2VPcmRlciA9IFtdO1xuXG4gIHV0aWwuYmluZEZ1bmModGhpcy5nYW1lLmdhbWVPYmouY2hpbGQoJ3Jlc3BvbnNlcycpLCB0aGlzLm9uUmVzcG9uc2VzVXBkYXRlLmJpbmQodGhpcykpO1xufVxuXG5SZXNwb25zZXMucHJvdG90eXBlLmNvdW50ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB1dGlsLnNpemUodGhpcy5yZXNwb25zZXNJbmZvKTtcbn07XG5cblJlc3BvbnNlcy5wcm90b3R5cGUub25SZXNwb25zZXNVcGRhdGUgPSBmdW5jdGlvbihyZXNwb25zZXNJbmZvKSB7XG4gIC8vIENyZWF0ZSBhIEpTIG1hcCBmcm9tIHJlc3BvbnNlcyBmb3IgYWNjZXNzIHRvIGZvckVhY2gsIHNpemVcbiAgdGhpcy5yZXNwb25zZXNJbmZvID0gcmVzcG9uc2VzSW5mbyB8fCB7fTtcbiAgY29uc29sZS53YXJuKCdvblJlc3BvbnNlc1VwZGF0ZScsIHRoaXMucmVzcG9uc2VzSW5mbyk7XG5cbiAgLy8gSWYgdGhlcmUgYXJlIG5vIHJlc3BvbnNlcyBpbiB0aGUgZGF0YWJhc2UsIHJlbW92ZVxuICBpZiAodXRpbC5zaXplKHRoaXMucmVzcG9uc2VzSW5mbykgPT09IDApIHtcbiAgICB0aGlzLnJlc3BvbnNlT3JkZXIgPSBbXTtcbiAgICAkKFwiI3Jlc3BvbnNlc1wiKS5jc3MoJ2ZsZXgtZ3JvdycsICcwJyk7XG4gICAgJCgnI3Jlc3BvbnNlcycpLmh0bWwoXCJcIik7XG4gIH1cblxuICB1dGlsLmZvckVhY2godGhpcy5yZXNwb25zZXNJbmZvLCAodmFsLCBrZXkpID0+IHtcbiAgICAvLyBJZiBrZXkgaXNuJ3QgaW4gcmVzcG9uc2VPcmRlciwgYW5kIGl0YHMgcmVhZHksIGFkZCBpdCByYW5kb21seVxuICAgIGlmICghdXRpbC5jb250YWlucyh0aGlzLnJlc3BvbnNlT3JkZXIsIGtleSkgJiYga2V5IGluIHRoaXMucmVzcG9uc2VzSW5mbykge1xuICAgICAgdXRpbC5yYW5kb21JbnNlcnQodGhpcy5yZXNwb25zZU9yZGVyLCBrZXkpO1xuICAgIH1cbiAgfSk7XG4gIC8vIElmIGV2ZXJ5b25lIGhhcyByZXNwb25kZWQsIGNoYW5nZSB0byBndWVzcyBzdGF0ZVxuICBpZiAodGhpcy5jb3VudCgpID09PSB0aGlzLmdhbWUucGxheWVycy5jb3VudCgpKSB7XG4gICAgdGhpcy5nYW1lLmdhbWVPYmouY2hpbGQoJ3N0YXRlJykuc2V0KFN0YXRlLkdVRVNTKTtcbiAgfVxuICAvLyBJZiBndWVzcyBzdGF0ZSwgc2hvdyByZXNwb25zZXNcbiAgaWYgKHRoaXMuZ2FtZS5zdGF0ZSA9PT0gU3RhdGUuR1VFU1MpIHtcbiAgICB0aGlzLnVwZGF0ZVJlc3BvbnNlRG9tKCk7XG4gIH1cbn07XG5cblJlc3BvbnNlcy5wcm90b3R5cGUudXBkYXRlUmVzcG9uc2VEb20gPSBmdW5jdGlvbigpIHtcbiAgY29uc29sZS53YXJuKCd1cGRhdGluZyByZXNwb25zZSBkb20nLCB0aGlzLnJlc3BvbnNlT3JkZXIpO1xuICAvLyBCdWlsZCBhbGwgcmVzcG9uc2VzIGZyb20gcmVzcG9uc2VPcmRlciBhcnJheVxuICAvLyBUT0RPOiBDdXJyZW50bHkgYWx3YXlzIGZyb20gc2NyYXRjaFxuICB2YXIgcmVzcG9uc2VzID0gdGhpcy5yZXNwb25zZU9yZGVyLm1hcChwbGF5ZXJLZXkgPT4ge1xuICAgIGNvbnNvbGUud2FybigncmVzcG9uc2VzSW5mbycsIHRoaXMucmVzcG9uc2VzSW5mbywgJ3BsYXllcktleScsIHBsYXllcktleSk7XG4gICAgdmFyIHBsYXllclJlc3BvbnNlID0gdGhpcy5yZXNwb25zZXNJbmZvW3BsYXllcktleV07XG4gICAgcmV0dXJuIGJ1aWxkUmVzcG9uc2VEb20ocGxheWVyUmVzcG9uc2UucmVzcG9uc2UsIHBsYXllclJlc3BvbnNlLmVsaW1pbmF0ZWQpO1xuICB9KTtcbiAgJChcIiNyZXNwb25zZXNcIikuaHRtbChyZXNwb25zZXMpO1xuICAkKFwiI3Jlc3BvbnNlc1wiKS5jc3MoJ2ZsZXgtZ3JvdycsICcxJyk7XG59O1xuXG4vLyBSZXR1cm5zIGEgc2luZ2xlIGluc3RhbmNlIG9mIGEgcmVzcG9uc2UgRE9NIGl0ZW1cbmZ1bmN0aW9uIGJ1aWxkUmVzcG9uc2VEb20ocmVzcG9uc2UsIGVsaW1pbmF0ZWQpIHtcbiAgZWxpbWluYXRlZCA9IGVsaW1pbmF0ZWQgPyBcImVsaW1pbmF0ZWRcIiA6IFwiXCI7XG4gIHJldHVybiBcIjxkaXYgY2xhc3M9J3Jlc3BvbnNlJz5cIiArXG4gICAgICBcIjxkaXYgY2xhc3M9J3Jlc3BvbnNlX3F1b3Rlcyc+XCIgK1xuICAgICAgICBcIjxkaXYgY2xhc3M9J3Jlc3BvbnNlX2NvbnRlbnQgXCIrZWxpbWluYXRlZCtcIic+XCIgKyByZXNwb25zZSArIFwiPC9kaXY+XCIgK1xuICAgICAgXCI8L2Rpdj5cIiArXG4gICAgXCI8L2Rpdj5cIjtcbn1cblxubW9kdWxlLmV4cG9ydHMgPSBSZXNwb25zZXM7XG4iLCJcblN0YXRlID0ge1xuICBJTklUOiAxLFxuICBQT0xMOiAyLFxuICBSRVNQT05EOiAzLFxuICBHVUVTUzogNCxcbiAgU0NPUkU6IDUsXG4gIFJFQ0FQOiA2XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IFN0YXRlO1xuIiwiXG52YXIgQXBwID0gcmVxdWlyZSgnLi9BcHAuanMnKTtcblxuLy8gVE9ETyBGZWF0dXJlczpcbi8vIC0gRW5kIGdhbWUgKGhvc3QpXG4vLyAtIFJlcG9ydCBndWVzc2VkIGZvciBhbnkgcmVzcG9uc2UgKGhvc3QpXG4vLyAtIEdhbWVzIGluYWN0aXZlIG1vcmUgdGhhbiAxMmhyIGFyZSByZW1vdmVkIHdoZW4gbG9va2VkIHVwIChhZGQgdGltZXN0YW1wIGdhbWUgYWN0aW9ucylcbi8vIC0gTm90aWZ5IHdoZW4gaG9zdCBpcyBkaXNjb25uZWN0ZWQgKHNpbmNlIGdhbWUgd2lsbCBzdG9wIHJ1bm5pbmcpXG4vLyAtIENoYW5nZSBtb3N0IGhvc3QgYWN0aW9ucyB0byB0cmFuc2FjdGlvbnMgcG9zc2libGUgYnkgYW55IHBsYXllclxuLy8gLSBHZXQgbW9yZSBxdWVzdGlvbnMgYW5kIGZpbHRlciBvdXQgYmFkIG9uZXNcbi8vIC0gU3BlZWNoIGJ1YmJsZXNcbi8vIC0gVm90ZSBjb3VudGVycyAoaWNvbnM/KVxuLy8gLSBBZGQgbW9yZSBmcmFtZSBzaGFwZXMgKGNpcmNsZSlcblxuLy8gLSBNYWtlIGJhbm5lcnMgY3VydmVkXG4vLyAtIEFkZCB3aGl0ZSBiYWNrZHJvcCBibG9ja3MgKD8pXG5cbi8vIC0gQWxsb3cgcGxheWVycyB0byBzaXQgb3V0IGEgcm91bmQsIG9yIGhvc3QgdG8gbWFrZSB0aGVtXG4vLyAtIFBsYXllcnMgc2hvdWxkIHN0YXJ0IHNpdHRpbmcgb3V0IGlmIHRoZXkgam9pbiBpbiB0aGUgbWlkZGxlIG9mIGEgcm91bmRcbi8vIC0gTWFrZSBmcmFtZXMgZGlzYXBwZWFyIGFmdGVyIHNvbWVvbmUgbGVhdmVzIGdhbWVcblxuLy8gLSBQbGF5ZXJzIGpvaW5pbmcgc3RhdGUgKGluaXQpXG4vLyAtIChNYXliZSkgQWxsb3cgKmVsaW1pbmF0ZSBwbGF5ZXJzIHdoZW4gZ3Vlc3NlZCogc2V0dGluZ1xuXG53aW5kb3cub25sb2FkID0gbmV3IEFwcCgpO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7IWZ1bmN0aW9uKG4sdCl7XCJ1bmRlZmluZWRcIiE9dHlwZW9mIG1vZHVsZSYmbW9kdWxlLmV4cG9ydHM/bW9kdWxlLmV4cG9ydHM9dCgpOlwiZnVuY3Rpb25cIj09dHlwZW9mIGRlZmluZSYmZGVmaW5lLmFtZD9kZWZpbmUodCk6d2luZG93W25dPXQoKX0oXCJiYXNpY0NvbnRleHRcIixmdW5jdGlvbigpe3ZhciBuPW51bGwsdD1cIml0ZW1cIixlPVwic2VwYXJhdG9yXCIsaT1mdW5jdGlvbigpe3ZhciBuPWFyZ3VtZW50cy5sZW5ndGg8PTB8fHZvaWQgMD09PWFyZ3VtZW50c1swXT9cIlwiOmFyZ3VtZW50c1swXTtyZXR1cm4gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIi5iYXNpY0NvbnRleHQgXCIrbil9LGw9ZnVuY3Rpb24oKXt2YXIgbj1hcmd1bWVudHMubGVuZ3RoPD0wfHx2b2lkIDA9PT1hcmd1bWVudHNbMF0/e306YXJndW1lbnRzWzBdLGk9MD09PU9iamVjdC5rZXlzKG4pLmxlbmd0aD8hMDohMTtyZXR1cm4gaT09PSEwJiYobi50eXBlPWUpLG51bGw9PW4udHlwZSYmKG4udHlwZT10KSxudWxsPT1uW1wiY2xhc3NcIl0mJihuW1wiY2xhc3NcIl09XCJcIiksbi52aXNpYmxlIT09ITEmJihuLnZpc2libGU9ITApLG51bGw9PW4uaWNvbiYmKG4uaWNvbj1udWxsKSxudWxsPT1uLnRpdGxlJiYobi50aXRsZT1cIlVuZGVmaW5lZFwiKSxuLmRpc2FibGVkIT09ITAmJihuLmRpc2FibGVkPSExKSxuLmRpc2FibGVkPT09ITAmJihuW1wiY2xhc3NcIl0rPVwiIGJhc2ljQ29udGV4dF9faXRlbS0tZGlzYWJsZWRcIiksbnVsbD09bi5mbiYmbi50eXBlIT09ZSYmbi5kaXNhYmxlZD09PSExPyhjb25zb2xlLndhcm4oXCJNaXNzaW5nIGZuIGZvciBpdGVtICdcIituLnRpdGxlK1wiJ1wiKSwhMSk6ITB9LG89ZnVuY3Rpb24obixpKXt2YXIgbz1cIlwiLHI9XCJcIjtyZXR1cm4gbChuKT09PSExP1wiXCI6bi52aXNpYmxlPT09ITE/XCJcIjoobi5udW09aSxudWxsIT09bi5pY29uJiYocj1cIjxzcGFuIGNsYXNzPSdiYXNpY0NvbnRleHRfX2ljb24gXCIrbi5pY29uK1wiJz48L3NwYW4+XCIpLG4udHlwZT09PXQ/bz1cIlxcblx0XHQgICAgICAgPHRyIGNsYXNzPSdiYXNpY0NvbnRleHRfX2l0ZW0gXCIrbltcImNsYXNzXCJdK1wiJz5cXG5cdFx0ICAgICAgICAgICA8dGQgY2xhc3M9J2Jhc2ljQ29udGV4dF9fZGF0YScgZGF0YS1udW09J1wiK24ubnVtK1wiJz5cIityK24udGl0bGUrXCI8L3RkPlxcblx0XHQgICAgICAgPC90cj5cXG5cdFx0ICAgICAgIFwiOm4udHlwZT09PWUmJihvPVwiXFxuXHRcdCAgICAgICA8dHIgY2xhc3M9J2Jhc2ljQ29udGV4dF9faXRlbSBiYXNpY0NvbnRleHRfX2l0ZW0tLXNlcGFyYXRvcic+PC90cj5cXG5cdFx0ICAgICAgIFwiKSxvKX0scj1mdW5jdGlvbihuKXt2YXIgdD1cIlwiO3JldHVybiB0Kz1cIlxcblx0ICAgICAgICA8ZGl2IGNsYXNzPSdiYXNpY0NvbnRleHRDb250YWluZXInPlxcblx0ICAgICAgICAgICAgPGRpdiBjbGFzcz0nYmFzaWNDb250ZXh0Jz5cXG5cdCAgICAgICAgICAgICAgICA8dGFibGU+XFxuXHQgICAgICAgICAgICAgICAgICAgIDx0Ym9keT5cXG5cdCAgICAgICAgXCIsbi5mb3JFYWNoKGZ1bmN0aW9uKG4sZSl7cmV0dXJuIHQrPW8obixlKX0pLHQrPVwiXFxuXHQgICAgICAgICAgICAgICAgICAgIDwvdGJvZHk+XFxuXHQgICAgICAgICAgICAgICAgPC90YWJsZT5cXG5cdCAgICAgICAgICAgIDwvZGl2Plxcblx0ICAgICAgICA8L2Rpdj5cXG5cdCAgICAgICAgXCJ9LGE9ZnVuY3Rpb24oKXt2YXIgbj1hcmd1bWVudHMubGVuZ3RoPD0wfHx2b2lkIDA9PT1hcmd1bWVudHNbMF0/e306YXJndW1lbnRzWzBdLHQ9e3g6bi5jbGllbnRYLHk6bi5jbGllbnRZfTtpZihcInRvdWNoZW5kXCI9PT1uLnR5cGUmJihudWxsPT10Lnh8fG51bGw9PXQueSkpe3ZhciBlPW4uY2hhbmdlZFRvdWNoZXM7bnVsbCE9ZSYmZS5sZW5ndGg+MCYmKHQueD1lWzBdLmNsaWVudFgsdC55PWVbMF0uY2xpZW50WSl9cmV0dXJuKG51bGw9PXQueHx8dC54PDApJiYodC54PTApLChudWxsPT10Lnl8fHQueTwwKSYmKHQueT0wKSx0fSxzPWZ1bmN0aW9uKG4sdCl7dmFyIGU9YShuKSxpPWUueCxsPWUueSxvPXt3aWR0aDp3aW5kb3cuaW5uZXJXaWR0aCxoZWlnaHQ6d2luZG93LmlubmVySGVpZ2h0fSxyPXt3aWR0aDp0Lm9mZnNldFdpZHRoLGhlaWdodDp0Lm9mZnNldEhlaWdodH07aStyLndpZHRoPm8ud2lkdGgmJihpLT1pK3Iud2lkdGgtby53aWR0aCksbCtyLmhlaWdodD5vLmhlaWdodCYmKGwtPWwrci5oZWlnaHQtby5oZWlnaHQpLHIuaGVpZ2h0Pm8uaGVpZ2h0JiYobD0wLHQuY2xhc3NMaXN0LmFkZChcImJhc2ljQ29udGV4dC0tc2Nyb2xsYWJsZVwiKSk7dmFyIHM9ZS54LWksdT1lLnktbDtyZXR1cm57eDppLHk6bCxyeDpzLHJ5OnV9fSx1PWZ1bmN0aW9uKCl7dmFyIG49YXJndW1lbnRzLmxlbmd0aDw9MHx8dm9pZCAwPT09YXJndW1lbnRzWzBdP3t9OmFyZ3VtZW50c1swXTtyZXR1cm4gbnVsbD09bi5mbj8hMTpuLnZpc2libGU9PT0hMT8hMTpuLmRpc2FibGVkPT09ITA/ITE6KGkoXCJ0ZFtkYXRhLW51bT0nXCIrbi5udW0rXCInXVwiKS5vbmNsaWNrPW4uZm4saShcInRkW2RhdGEtbnVtPSdcIituLm51bStcIiddXCIpLm9uY29udGV4dG1lbnU9bi5mbiwhMCl9LGM9ZnVuY3Rpb24odCxlLGwsbyl7dmFyIGE9cih0KTtkb2N1bWVudC5ib2R5Lmluc2VydEFkamFjZW50SFRNTChcImJlZm9yZWVuZFwiLGEpLG51bGw9PW4mJihuPWRvY3VtZW50LmJvZHkuc3R5bGUub3ZlcmZsb3csZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdz1cImhpZGRlblwiKTt2YXIgYz1pKCksZD1zKGUsYyk7cmV0dXJuIGMuc3R5bGUubGVmdD1kLngrXCJweFwiLGMuc3R5bGUudG9wPWQueStcInB4XCIsYy5zdHlsZS50cmFuc2Zvcm1PcmlnaW49ZC5yeCtcInB4IFwiK2QucnkrXCJweFwiLGMuc3R5bGUub3BhY2l0eT0xLG51bGw9PWwmJihsPWYpLGMucGFyZW50RWxlbWVudC5vbmNsaWNrPWwsYy5wYXJlbnRFbGVtZW50Lm9uY29udGV4dG1lbnU9bCx0LmZvckVhY2godSksXCJmdW5jdGlvblwiPT10eXBlb2YgZS5wcmV2ZW50RGVmYXVsdCYmZS5wcmV2ZW50RGVmYXVsdCgpLFwiZnVuY3Rpb25cIj09dHlwZW9mIGUuc3RvcFByb3BhZ2F0aW9uJiZlLnN0b3BQcm9wYWdhdGlvbigpLFwiZnVuY3Rpb25cIj09dHlwZW9mIG8mJm8oKSwhMH0sZD1mdW5jdGlvbigpe3ZhciBuPWkoKTtyZXR1cm4gbnVsbD09bnx8MD09PW4ubGVuZ3RoPyExOiEwfSxmPWZ1bmN0aW9uKCl7aWYoZCgpPT09ITEpcmV0dXJuITE7dmFyIHQ9ZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIi5iYXNpY0NvbnRleHRDb250YWluZXJcIik7cmV0dXJuIHQucGFyZW50RWxlbWVudC5yZW1vdmVDaGlsZCh0KSxudWxsIT1uJiYoZG9jdW1lbnQuYm9keS5zdHlsZS5vdmVyZmxvdz1uLG49bnVsbCksITB9O3JldHVybntJVEVNOnQsU0VQQVJBVE9SOmUsc2hvdzpjLHZpc2libGU6ZCxjbG9zZTpmfX0pOyIsIlxuLy8gQmluZHMgdGhlIHZhbHVlIG9mIHggdG8gdmFsdWUgYXQgbG9jYXRpb24gZmlyZWJhc2UuXG5leHBvcnRzLmJpbmRWYWwgPSBmdW5jdGlvbihmaXJlYmFzZSwgeCkge1xuICBmaXJlYmFzZS5vbihcInZhbHVlXCIsIHNuYXBzaG90ID0+IHggPSBzbmFwc2hvdC52YWwoKSk7XG59O1xuXG4vLyBCaW5kcyB0aGUgZnVuY3Rpb24gZiB0byB0aGUgdmFsdWUgYXQgbG9jYXRpb24gZmlyZWJhc2UuXG4vLyBXaGVuZXZlciB0aGUgZmlyZWJhc2UgdmFsdWUgY2hhbmdlcywgZiBpcyBjYWxsZWQgd2l0aCB0aGUgbmV3IHZhbHVlLlxuZXhwb3J0cy5iaW5kRnVuYyA9IGZ1bmN0aW9uKGZpcmViYXNlLCBmKSB7XG4gIGZpcmViYXNlLm9uKFwidmFsdWVcIiwgc25hcHNob3QgPT4gZihzbmFwc2hvdC52YWwoKSkpO1xufTtcblxuLy8gUmV0dXJucyBhIHJhbmRvbSBlbGVtZW50IG9mIHRoZSBhcnJheS5cbmV4cG9ydHMucmFuZG9tUGljayA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gIHJldHVybiBhcnJheVtNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqYXJyYXkubGVuZ3RoKV07XG59O1xuXG4vLyBSZXR1cm5zIGFuIGFycmF5IG9mIHVuaXF1ZSByYW5kb20gZWxlbWVudHMgb2YgYW4gYXJyYXkuXG5leHBvcnRzLnJhbmRvbVBpY2tzID0gZnVuY3Rpb24oYXJyYXksIG4pIHtcbiAgYXJyYXkgPSBhcnJheS5zbGljZSgpOyAvLyBDbG9uZSBhcnJheSBzbyBhcyBub3QgdG8gbXV0YXRlIGl0LlxuICB2YXIgcGlja3MgPSBbXTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGggJiYgaSA8IG47IGkrKykge1xuICAgIHZhciBpbmRleCA9IE1hdGguZmxvb3IoTWF0aC5yYW5kb20oKSphcnJheS5sZW5ndGgpO1xuICAgIHBpY2tzLnB1c2goYXJyYXkuc3BsaWNlKGluZGV4LCAxKVswXSk7XG4gIH1cbiAgcmV0dXJuIHBpY2tzO1xufTtcblxuLy8gSW5zZXJ0cyBpdGVtIGludG8gYXJyYXkgYXQgYSByYW5kb20gbG9jYXRpb24uXG4vLyBSZXR1cm5zIHRoZSBhcnJheSBmb3IgY29udmVuaWVuY2UuXG5leHBvcnRzLnJhbmRvbUluc2VydCA9IGZ1bmN0aW9uKGFycmF5LCBpdGVtKSB7XG4gIHZhciBzcGxpY2VJbmRleCA9IE1hdGguZmxvb3IoKGFycmF5Lmxlbmd0aCsxKSpNYXRoLnJhbmRvbSgpKTtcbiAgYXJyYXkuc3BsaWNlKHNwbGljZUluZGV4LCAwLCBpdGVtKTtcbn07XG5cbi8vIE9iamVjdCBmb3JFYWNoLCBjYWxscyBmdW5jIHdpdGggKHZhbCwga2V5KVxuZXhwb3J0cy5mb3JFYWNoID0gZnVuY3Rpb24ob2JqLCBmdW5jKSB7XG4gIE9iamVjdC5rZXlzKG9iaikuZm9yRWFjaChrZXkgPT4gZnVuYyhvYmpba2V5XSwga2V5KSk7XG59O1xuXG5leHBvcnRzLnNpemUgPSBmdW5jdGlvbihvYmopIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikubGVuZ3RoO1xufTtcblxuZXhwb3J0cy52YWx1ZXMgPSBmdW5jdGlvbihvYmopIHtcbiAgcmV0dXJuIE9iamVjdC5rZXlzKG9iaikubWFwKGtleSA9PiB7XG4gICAgcmV0dXJuIG9ialtrZXldO1xuICB9KTtcbn07XG5cbmV4cG9ydHMuZmluZCA9IGZ1bmN0aW9uKGFyciwgY29uZCkge1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGFyci5sZW5ndGg7IGkrKykge1xuICAgIGlmIChjb25kKGFycltpXSkpIHtcbiAgICAgIHJldHVybiBhcnJbaV07XG4gICAgfVxuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5leHBvcnRzLmNvbnRhaW5zID0gZnVuY3Rpb24oYXJyLCBpdGVtKSB7XG4gIHJldHVybiBhcnIuaW5kZXhPZihpdGVtKSAhPT0gLTE7XG59O1xuIl19
