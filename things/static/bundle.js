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
    $('#guessed').on('click', this.onGuessed.bind(this, this.playerObj.key()));
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

  this.playerObj.child('state').once('value', snapshot => {
    var playerState = snapshot.val();
    if (playerState === newState && newState !== State.INIT) {
      // It is always safe to run the INIT state
      return;
    }
    var playerObjUpdate;
    switch (newState) {
      case State.INIT:
        playerObjUpdate = {
          guessed: null,
          responded: null,
          vote: null,
        };
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
        playerObjUpdate = {
          responded: false
        };
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
        playerObjUpdate = {
          responded: null,
          guessed: false
        };
        break;
      case State.SCORE:
        break;
      case State.RECAP:
        break;
    }
    // Add player state update to whatever updates the state determined
    playerObjUpdate = playerObjUpdate || {};
    playerObjUpdate.state = newState;
    this.playerObj.update(playerObjUpdate);
  });
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

Game.prototype.onGuessed = function(playerKey) {
  this.gameObj.child('players').child(playerKey).child('guessed').set(true);
  // Look into responsesInfo, find your response and eliminate it
  util.forEach(this.responses.responsesInfo, (val, key) => {
    if (val.key === playerKey) {
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
var State = require('./State.js');
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
  util.bindFunc(this.game.playerObj.child('asleep'), this.sleepAlert.bind(this));
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
}

Players.prototype.awakeCount = function() {
  var count = 0;
  util.forEach(this.playersInfo, player => {
    count = count + (player.asleep ? 0 : 1);
  });
  return count;
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
    ranks = ranks.filter(rank => rank <= player.rank);
    if (ranks.length === 0) {
      console.warn('appending to players');
      $('#players').prepend(this.buildPlayerDom(player, key));
    }
    else {
      var prev = Math.max.apply(null, ranks);
      if (prev === player.rank) {
        // If frame already exists, replace it
        $('.frame_' + prev).replaceWith(this.buildPlayerDom(player, key));
      }
      else {
        // If frame is less, add after it
        $('.frame_' + prev).after(this.buildPlayerDom(player, key));
      }
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
    // Set sleeping or awake
    $('.frame_' + player.rank + ' .body').css('opacity', player.asleep ? 0.2 : 1.0);
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
      // If the moving player is hosting, show the cog
      // if (this.game.isHost && !player.isHost) {
      //   $('.frame_' + end + ' .player_menu').show();
      // }
    }, (dist * 250) + 500);
  };

  startBody.css('animation-duration', duration);
  startBody.addClass(seq[0]); // Walk out
  // Fade out tag
  startTag.css({
    'opacity': '0.0',
    'transition-duration': duration
  });
  // If the moving player is hosting, also hide cog
  // if (this.game.isHost) {
  //   $('.frame_' + start + ' .player_menu').hide();
  // }
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
    "<div class='player_menu fa fa-cog' style='display:" +
      (this.game.isHost ? 'block' : 'none') + ";'></div>" +
    "<div class='frame_content " + frame + "'>" +
      "<div class='body' style='opacity:" + (player.asleep ? "0.2" : "1.0") + ";'>" +
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
        title: 'Give point',
        icon: 'fa fa-plus',
        fn: () => this.adjustScore(key, 1)
      }, {
        title: 'Take point',
        icon: 'fa fa-minus',
        fn: () => this.adjustScore(key, -1)
      }, {
      }, {
        title: 'Mark response guessed',
        icon: 'fa fa-quote-left',
        visible: !player.isHost && this.game.state === State.GUESS,
        disabled: player.guessed,
        fn: () => this.game.onGuessed(key)
      }, {
        title: 'Sit out this round',
        icon: 'fa fa-bed',
        visible: !player.isHost,
        fn: () => this.gameObj.child('players').child(key).child('asleep').set(true)
      }, {
        title: 'Remove player',
        icon: 'fa fa-ban',
        visible: !player.isHost,
        fn: () => this.game.removeFromGame(key)
    }];
    basicContext.show(items, event.originalEvent);
  });
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

Players.prototype.sleepAlert = function(sleeping) {
  console.warn('sleeping', sleeping);
  if (sleeping) {
    util.alert({
      text: "You're on break",
      buttonText: "Back to the game",
      buttonFunc: () => this.game.playerObj.child('asleep').set(null)
    });
  }
};

module.exports = Players;

},{"./State.js":6,"./util.js":9,"basiccontext":8}],4:[function(require,module,exports){

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
  console.warn('awakeCount', numVoters, this.game.players.awakeCount());
  if (numVoters === this.game.players.awakeCount()) {
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
  if (this.count() === this.game.players.awakeCount()) {
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

// HIGH Priority
// - Report guessed for any response (host)
// - Add icons everywhere
// - Speech bubbles
// - Set up watching mode
// - Players joining state (pre-init)
// - New round sometimes doesn't pick questions
// - If number of sleeping people change, re-check requirements for response(/voting)

// Bugs:
// - Fix walking animation
// - All players see scoring currently
// - More buttons are visible than should be on certain refreshes

// MEDIUM Priority
// - Get more questions and filter out bad ones
// - Add more frame shapes (circle)
// - Smooth transitions

// Bugs:
// - Make frames disappear after someone leaves game
// - Handle sleeping players moving

// LOW Priority / Ideas
// - Games inactive more than 12hr are removed when looked up (add timestamp game actions)
// - Notify when host is disconnected (since game will stop running)
// - Vote counters (icons?)

// - Make banners curved
// - Add white backdrop blocks (?)
// - Allow *eliminate players when guessed* setting

$(function() { new App(); });

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uL3Vzci9sb2NhbC9saWIvbm9kZV9tb2R1bGVzL3dhdGNoaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJBcHAuanMiLCJHYW1lLmpzIiwiUGxheWVycy5qcyIsIlBvbGwuanMiLCJSZXNwb25zZXMuanMiLCJTdGF0ZS5qcyIsImluZGV4LmpzIiwibm9kZV9tb2R1bGVzL2Jhc2ljY29udGV4dC9kaXN0L2Jhc2ljQ29udGV4dC5taW4uanMiLCJ1dGlsLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdE1BO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNqVEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JTQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9RQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RFQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDWEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RDQTs7QUNBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCJcbnZhciBHYW1lID0gcmVxdWlyZSgnLi9HYW1lLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG4vLyBIYW5kbGVzIGxvZyBpbiBhbmQgY3JlYXRpbmcgYSBnYW1lXG5mdW5jdGlvbiBBcHAoKSB7XG4gIHRoaXMuZGF0YWJhc2UgPSBuZXcgRmlyZWJhc2UoJ2h0dHBzOi8vdGhpbmdzd2l0aGJldGguZmlyZWJhc2Vpby5jb20vJyk7XG5cbiAgdGhpcy5zZWxlY3RlZE5hbWUgPSBudWxsO1xuICB0aGlzLnNlbGVjdGVkR2FtZSA9IG51bGw7XG5cbiAgdGhpcy5mb3VuZEdhbWUgPSBudWxsO1xuICB0aGlzLmlzSG9zdCA9IGZhbHNlO1xuXG4gIHRoaXMudXJsR2FtZUtleSA9IG51bGw7XG4gIHRoaXMudXJsUGxheWVyS2V5ID0gbnVsbDtcblxuICB0aGlzLmdhbWUgPSBudWxsO1xuXG4gIHRoaXMuanNvbkRhdGEgPSBudWxsO1xuXG4gIC8vIExvYWQgSlNPTiBkYXRhXG4gIF9sb2FkSlNPTihyZXNwb25zZSA9PiB0aGlzLmpzb25EYXRhID0gSlNPTi5wYXJzZShyZXNwb25zZSkpO1xuXG4gIHRoaXMuZGF0YWJhc2Uub25jZSgndmFsdWUnLCBzbmFwc2hvdCA9PiB7XG4gICAgdGhpcy5hdHRlbXB0VVJMQ29ubmVjdChzbmFwc2hvdCk7XG4gICAgdGhpcy5idWlsZFN0YXJ0UGFnZShzbmFwc2hvdCk7XG4gIH0pO1xufVxuXG5BcHAucHJvdG90eXBlLmJ1aWxkU3RhcnRQYWdlID0gZnVuY3Rpb24oc25hcHNob3QpIHtcbiAgdmFyIGZpcnN0ID0gdHJ1ZTtcbiAgc25hcHNob3QuZm9yRWFjaChnYW1lID0+IHtcbiAgICB2YXIgYW5pbWFsID0gZ2FtZS52YWwoKS5hbmltYWw7XG4gICAgaWYgKGZpcnN0KSB7XG4gICAgICAkKCcjYWN0aXZlX2dhbWVzJykuaHRtbChcbiAgICAgICAgXCI8ZGl2IGNsYXNzPSdhY3RpdmVfZ2FtZSBzZWxlY3RlZCc+XCIgKyBnYW1lLnZhbCgpLmFuaW1hbCArIFwiPC9kaXY+XCJcbiAgICAgICk7XG4gICAgICB0aGlzLnNlbGVjdGVkR2FtZSA9IGFuaW1hbDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAkKCcjYWN0aXZlX2dhbWVzJykuYXBwZW5kKFxuICAgICAgICBcIjxkaXYgY2xhc3M9J2FjdGl2ZV9nYW1lJz5cIiArIGdhbWUudmFsKCkuYW5pbWFsICsgXCI8L2Rpdj5cIlxuICAgICAgKTtcbiAgICB9XG4gICAgJCgnLmFjdGl2ZV9nYW1lOmxhc3QnKS5vbignY2xpY2snLCBldmVudCA9PiB7XG4gICAgICB0aGlzLnNlbGVjdGVkR2FtZSA9IGFuaW1hbDtcbiAgICAgICQoJy5hY3RpdmVfZ2FtZScpLnJlbW92ZUNsYXNzKCdzZWxlY3RlZCcpO1xuICAgICAgJChldmVudC50YXJnZXQpLmFkZENsYXNzKCdzZWxlY3RlZCcpO1xuICAgIH0pO1xuICAgIGZpcnN0ID0gZmFsc2U7XG4gIH0pO1xuXG4gICQoJyNqb2luJykub24oJ2NsaWNrJywgdGhpcy5vbkpvaW5CdXR0b24uYmluZCh0aGlzLCBzbmFwc2hvdCkpO1xuICAkKCcjaG9zdCcpLm9uKCdjbGljaycsIHRoaXMub25Ib3N0QnV0dG9uLmJpbmQodGhpcywgc25hcHNob3QpKTtcbiAgJCgnI3dhdGNoJykub24oJ2NsaWNrJywgdGhpcy5vbkpvaW5CdXR0b24uYmluZCh0aGlzLCBzbmFwc2hvdCwgdHJ1ZSkpO1xuICAkKCcuY29sb3InKS5vbignY2xpY2snLCB0aGlzLm9uQ2xpY2tDb2xvci5iaW5kKHRoaXMpKTtcbiAgJCgnI3N1Ym1pdF9uYW1lJykub24oJ2NsaWNrJywgdGhpcy5vblN1Ym1pdE5hbWVCdXR0b24uYmluZCh0aGlzKSk7XG59O1xuXG5BcHAucHJvdG90eXBlLmF0dGVtcHRVUkxDb25uZWN0ID0gZnVuY3Rpb24oc25hcHNob3QpIHtcbiAgLy8gR2V0IGtleXMgZnJvbSBVUkxcbiAgdmFyIHVybEl0ZW1zID0gd2luZG93LmxvY2F0aW9uLmhhc2guc3BsaXQoXCIvXCIpO1xuICB1cmxJdGVtcy5mb3JFYWNoKGl0ZW0gPT4ge1xuICAgIHN3aXRjaCAoaXRlbS5zbGljZSgwLCAyKSkge1xuICAgICAgY2FzZSBcIiVnXCI6XG4gICAgICAgIHRoaXMudXJsR2FtZUtleSA9IGl0ZW0uc2xpY2UoMik7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBcIiV1XCI6XG4gICAgICAgIHRoaXMudXJsUGxheWVyS2V5ID0gaXRlbS5zbGljZSgyKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9KTtcblxuICAvLyBJZiBVUkwgZG9lc24ndCBjb250YWluIGluZm9ybWF0aW9uLCBVUkwgY29ubmVjdGlvbiBmYWlsc1xuICBpZiAoIXRoaXMudXJsR2FtZUtleSkge1xuICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gXCJcIjsgLy8gQ2xlYXJzIFVSTCBzdWZmaXhcbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBJbml0aWFsaXplIGdhbWUvcGxheWVyIGJhc2VkIG9uIFVSTFxuICB2YXIgZ2FtZXMgPSBzbmFwc2hvdC52YWwoKTtcblxuICAvLyBSZXRyaWV2ZSBnYW1lIGlmIGluIGRhdGFiYXNlLCBicmVhayBpZiBub3RcbiAgaWYgKCFnYW1lcyB8fCAhKHRoaXMudXJsR2FtZUtleSBpbiBnYW1lcykpIHtcbiAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiXCI7IC8vIENsZWFycyBVUkwgc3VmZml4XG4gICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXRyaWV2ZSBnYW1lXCIpO1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBHYW1lIGF2YWlsYWJsZVxuICB2YXIgZ2FtZU9iaiA9IHNuYXBzaG90LmNoaWxkKHRoaXMudXJsR2FtZUtleSkucmVmKCk7XG5cbiAgdmFyIHBsYXllcnMgPSBnYW1lc1tnYW1lT2JqLmtleSgpXS5wbGF5ZXJzO1xuICBpZiAoIXRoaXMudXJsUGxheWVyS2V5IHx8ICFwbGF5ZXJzIHx8ICEodGhpcy51cmxQbGF5ZXJLZXkgaW4gcGxheWVycykpIHtcbiAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiLyVnXCIgKyB0aGlzLnVybEdhbWVLZXk7IC8vIENsZWFycyBwbGF5ZXIgc3VmZml4XG4gICAgY29uc29sZS5lcnJvcihcIkZhaWxlZCB0byByZXRyaWV2ZSBwbGF5ZXJcIik7XG4gICAgdGhpcy5nYW1lID0gbmV3IEdhbWUodGhpcywgZ2FtZU9iaik7XG4gICAgcmV0dXJuO1xuICB9XG4gIC8vIFBsYXllciBhdmFpbGFibGVcbiAgdmFyIHBsYXllck9iaiA9IGdhbWVPYmouY2hpbGQoXCJwbGF5ZXJzXCIpLmNoaWxkKHRoaXMudXJsUGxheWVyS2V5KTtcblxuICB0aGlzLmdhbWUgPSBuZXcgR2FtZSh0aGlzLCBnYW1lT2JqLCBwbGF5ZXJPYmopO1xufTtcblxuQXBwLnByb3RvdHlwZS5vbkhvc3RCdXR0b24gPSBmdW5jdGlvbihzbmFwc2hvdCkge1xuICB2YXIgYW5pbWFsID0gXCJcIjtcbiAgdmFyIGN1cnJlbnRBbmltYWxzID0gW107XG4gIHNuYXBzaG90LmZvckVhY2goZ2FtZSA9PiBjdXJyZW50QW5pbWFscy5wdXNoKGdhbWUudmFsKCkuYW5pbWFsKSk7XG4gIC8vIEtlZXAgdHJ5aW5nIHRvIGdldCBhbiBhbmltYWwgbm90IGN1cnJlbnRseSBpbiB1c2VcbiAgLy8gVE9ETzogSW5lZmZpY2llbnQsIHN0YWxscyBmb3JldmVyIGlmIGFsbCBhbmltYWxzIGluIHVzZVxuICBkbyB7XG4gICAgYW5pbWFsID0gdXRpbC5yYW5kb21QaWNrKHRoaXMuanNvbkRhdGEuYW5pbWFscyk7XG4gIH0gd2hpbGUgKGN1cnJlbnRBbmltYWxzLmluZGV4T2YoYW5pbWFsKSA+IDApO1xuXG4gIHZhciBmcmFtZXMgPSBcIlwiO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IDE1OyBpKyspIHtcbiAgICBmcmFtZXMgKz0gTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpICogOSk7XG4gIH1cblxuICB0aGlzLmZvdW5kR2FtZSA9IHRoaXMuZGF0YWJhc2UucHVzaCh7XG4gICAgcm91bmQ6IDEsXG4gICAgc3RhdGU6IFN0YXRlLklOSVQsXG4gICAgYW5pbWFsOiBhbmltYWwsXG4gICAgZnJhbWVzOiBmcmFtZXMsXG4gICAgbnVtUGxheWVyczogMFxuICB9KTtcbiAgdGhpcy5pc0hvc3QgPSB0cnVlO1xuXG4gIHRoaXMuc2hvd05hbWVQcm9tcHQoKTtcbn07XG5cbkFwcC5wcm90b3R5cGUub25Kb2luQnV0dG9uID0gZnVuY3Rpb24oc25hcHNob3QsIHdhdGNoT25seSkge1xuICBzbmFwc2hvdC5mb3JFYWNoKGdhbWUgPT4ge1xuICAgIGlmIChnYW1lLnZhbCgpLmFuaW1hbCA9PT0gdGhpcy5zZWxlY3RlZEdhbWUpIHtcbiAgICAgIHRoaXMuZm91bmRHYW1lID0gc25hcHNob3QuY2hpbGQoZ2FtZS5rZXkoKSkucmVmKCk7XG4gICAgICBjb25zb2xlLndhcm4odGhpcy5mb3VuZEdhbWUpO1xuICAgICAgaWYgKHdhdGNoT25seSAhPT0gdHJ1ZSkge1xuICAgICAgICB0aGlzLnNob3dOYW1lUHJvbXB0KCk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgY29uc29sZS53YXJuKCd3YXRjaG9ubHknLCB3YXRjaE9ubHkpO1xuICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiLyVnXCIgKyB0aGlzLmZvdW5kR2FtZS5rZXkoKTtcbiAgICAgICAgdGhpcy5nYW1lID0gbmV3IEdhbWUodGhpcywgdGhpcy5mb3VuZEdhbWUsIG51bGwpO1xuICAgICAgfVxuICAgIH1cbiAgfSk7XG59O1xuXG5BcHAucHJvdG90eXBlLnNob3dOYW1lUHJvbXB0ID0gZnVuY3Rpb24oKSB7XG4gICQoJyNqb2luX2NvbnRhaW5lcicpLmhpZGUoKTtcbiAgJCgnI2hvc3RfY29udGFpbmVyJykuaGlkZSgpO1xuICAkKCcjbmFtZV9jb250YWluZXInKS5zaG93KCk7XG59O1xuXG5BcHAucHJvdG90eXBlLm9uQ2xpY2tDb2xvciA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICQoJy5jb2xvcicpLnJlbW92ZUNsYXNzKCdzZWxlY3RlZCcpO1xuICAkKGV2ZW50LmN1cnJlbnRUYXJnZXQpLmFkZENsYXNzKCdzZWxlY3RlZCcpO1xufTtcblxuQXBwLnByb3RvdHlwZS5vblN1Ym1pdE5hbWVCdXR0b24gPSBmdW5jdGlvbigpIHtcbiAgdmFyIG5hbWUgPSAkKCcjbmFtZScpLnZhbCgpO1xuXG4gIHRoaXMuZm91bmRHYW1lLmNoaWxkKCdudW1QbGF5ZXJzJykudHJhbnNhY3Rpb24oY3Vyck51bVBsYXllcnMgPT4ge1xuICAgIHJldHVybiBjdXJyTnVtUGxheWVycyArIDE7XG4gIH0sIChlcnIsIGNvbW1pdHRlZCwgc25hcHNob3QpID0+IHtcbiAgICBpZiAoIWNvbW1pdHRlZCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICB2YXIgcGxheWVyT2JqID0gdGhpcy5mb3VuZEdhbWUuY2hpbGQoXCJwbGF5ZXJzXCIpLnB1c2goe1xuICAgICAgbmFtZTogbmFtZSxcbiAgICAgIGlzSG9zdDogdGhpcy5pc0hvc3QsXG4gICAgICBzY29yZTogMCxcbiAgICAgIGFkZGVkOiBEYXRlLm5vdygpLFxuICAgICAgY29sb3I6ICQoJy5jb2xvci5zZWxlY3RlZCcpLmNzcygnYmFja2dyb3VuZC1jb2xvcicpLFxuICAgICAgcmFuazogc25hcHNob3QudmFsKClcbiAgICB9KTtcbiAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiLyVnXCIgKyB0aGlzLmZvdW5kR2FtZS5rZXkoKSArIFwiLyV1XCIgKyBwbGF5ZXJPYmoua2V5KCk7XG4gICAgdGhpcy5nYW1lID0gbmV3IEdhbWUodGhpcywgdGhpcy5mb3VuZEdhbWUsIHBsYXllck9iaik7XG4gIH0pO1xufTtcblxuLy8gRm91bmQgb25saW5lLCBKU09OIHBhcnNlIGZ1bmN0aW9uXG5mdW5jdGlvbiBfbG9hZEpTT04oY2FsbGJhY2spIHtcbiAgdmFyIHhvYmogPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgeG9iai5vdmVycmlkZU1pbWVUeXBlKFwiYXBwbGljYXRpb24vanNvblwiKTtcbiAgeG9iai5vcGVuKCdHRVQnLCAnZGF0YS5qc29uJywgdHJ1ZSk7XG4gIHhvYmoub25yZWFkeXN0YXRlY2hhbmdlID0gZnVuY3Rpb24gKCkge1xuICAgIGlmICh4b2JqLnJlYWR5U3RhdGUgPT0gNCAmJiB4b2JqLnN0YXR1cyA9PSBcIjIwMFwiKSB7XG4gICAgICAvLyBSZXF1aXJlZCB1c2Ugb2YgYW4gYW5vbnltb3VzIGNhbGxiYWNrIGFzIC5vcGVuIHdpbGwgTk9UIHJldHVybiBhIHZhbHVlIGJ1dFxuICAgICAgLy8gc2ltcGx5IHJldHVybnMgdW5kZWZpbmVkIGluIGFzeW5jaHJvbm91cyBtb2RlXG4gICAgICBjYWxsYmFjayh4b2JqLnJlc3BvbnNlVGV4dCk7XG4gICAgfVxuICB9O1xuICB4b2JqLnNlbmQobnVsbCk7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQXBwO1xuIiwiXG52YXIgYmFzaWNDb250ZXh0ID0gcmVxdWlyZSgnYmFzaWNjb250ZXh0Jyk7XG52YXIgUGxheWVycyA9IHJlcXVpcmUoJy4vUGxheWVycy5qcycpO1xudmFyIFJlc3BvbnNlcyA9IHJlcXVpcmUoJy4vUmVzcG9uc2VzLmpzJyk7XG52YXIgUG9sbCA9IHJlcXVpcmUoJy4vUG9sbC5qcycpO1xudmFyIFN0YXRlID0gcmVxdWlyZSgnLi9TdGF0ZS5qcycpO1xudmFyIHV0aWwgPSByZXF1aXJlKCcuL3V0aWwuanMnKTtcblxuLy8gSGFuZGxlcyBwcmVwYXJpbmcgdGhlIGdhbWUgYW5kIG1vdmluZyBiZXR3ZWVuIHN0YXRlc1xuZnVuY3Rpb24gR2FtZShhcHAsIGdhbWVPYmosIHBsYXllck9iaikge1xuICB0aGlzLmFwcCA9IGFwcDtcbiAgdGhpcy5nYW1lT2JqID0gZ2FtZU9iajtcbiAgdGhpcy5wbGF5ZXJPYmogPSBwbGF5ZXJPYmo7XG5cbiAgdGhpcy5nYW1lTmFtZSA9IG51bGw7XG4gIHRoaXMucGxheWVyTmFtZSA9IG51bGw7XG4gIHRoaXMuaXNIb3N0ID0gbnVsbDtcblxuICB0aGlzLnN0YXRlID0gU3RhdGUuSU5JVDtcbiAgdGhpcy5yb3VuZCA9IDE7XG5cbiAgdGhpcy5wbGF5ZXJzID0gbnVsbDtcbiAgdGhpcy5yZXNwb25zZXMgPSBudWxsO1xuICB0aGlzLnBvbGwgPSBudWxsO1xuXG4gIC8vIFNldCB0aGUgZ2FtZSBhbmQgcGxheWVyIG5hbWVzIGJlZm9yZSBidWlsZGluZyB0aGUgZG9tXG4gIGdhbWVPYmouY2hpbGQoXCJhbmltYWxcIikub25jZShcInZhbHVlXCIpLnRoZW4oc25hcHNob3QgPT4ge1xuICAgIHRoaXMuZ2FtZU5hbWUgPSBzbmFwc2hvdC52YWwoKTtcbiAgICByZXR1cm4gdGhpcy5wbGF5ZXJPYmoub25jZShcInZhbHVlXCIpO1xuICB9KS50aGVuKHNuYXBzaG90ID0+IHtcbiAgICB0aGlzLnBsYXllck5hbWUgPSBzbmFwc2hvdC5jaGlsZChcIm5hbWVcIikudmFsKCk7XG4gICAgdGhpcy5pc0hvc3QgPSBzbmFwc2hvdC5jaGlsZChcImlzSG9zdFwiKS52YWwoKTtcbiAgICByZXR1cm4gdGhpcy5idWlsZERvbSgpO1xuICB9KS50aGVuKCgpID0+IHtcbiAgICB0aGlzLnBsYXllcnMgPSBuZXcgUGxheWVycyh0aGlzKTtcbiAgICB0aGlzLnJlc3BvbnNlcyA9IG5ldyBSZXNwb25zZXModGhpcyk7XG4gICAgdGhpcy5wb2xsID0gbmV3IFBvbGwodGhpcyk7XG4gICAgdXRpbC5iaW5kVmFsKHRoaXMuZ2FtZU9iai5jaGlsZCgncm91bmQnKSwgdGhpcy5yb3VuZCk7XG4gICAgdXRpbC5iaW5kRnVuYyh0aGlzLmdhbWVPYmouY2hpbGQoJ3N0YXRlJyksIHRoaXMub25TdGF0ZUNoYW5nZS5iaW5kKHRoaXMpKTtcbiAgICB1dGlsLmJpbmRGdW5jKHRoaXMuZ2FtZU9iai5jaGlsZCgncXVlc3Rpb24nKSwgdGhpcy5vblF1ZXN0aW9uVXBkYXRlLmJpbmQodGhpcykpO1xuICAgIHV0aWwuYmluZEZ1bmModGhpcy5wbGF5ZXJPYmouY2hpbGQoJ2d1ZXNzZWQnKSwgdGhpcy5vbkd1ZXNzZWRVcGRhdGUuYmluZCh0aGlzKSk7XG4gICAgdXRpbC5iaW5kRnVuYyh0aGlzLnBsYXllck9iai5jaGlsZCgncmVzcG9uZGVkJyksIHRoaXMub25SZXNwb25kZWRVcGRhdGUuYmluZCh0aGlzKSk7XG4gICAgdXRpbC5iaW5kRnVuYyh0aGlzLmdhbWVPYmouY2hpbGQoJ3Njb3JpbmcnKSwgdGhpcy5vblNjb3JpbmdVcGRhdGUuYmluZCh0aGlzKSk7XG4gIH0pO1xufVxuXG5HYW1lLnByb3RvdHlwZS5idWlsZERvbSA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLndhcm4oJ2J1aWxkaW5nIGdhbWUnKTtcbiAgdmFyIGxvYWRCb2R5ID0gJC5EZWZlcnJlZCgpO1xuICAkKGRvY3VtZW50LmJvZHkpLmxvYWQoJ2dhbWUuaHRtbCcsICgpID0+IGxvYWRCb2R5LnJlc29sdmUoKSk7XG4gIHJldHVybiBsb2FkQm9keS5wcm9taXNlKCkudGhlbigoKSA9PiB7XG4gICAgJCgnI2hlYWRlcl9uYW1lJykuaHRtbCh0aGlzLnBsYXllck5hbWUpO1xuICAgICQoJyNoZWFkZXJfZ2FtZScpLmh0bWwodGhpcy5nYW1lTmFtZSk7XG4gICAgJCgnI3N1Ym1pdCcpLm9uKCdjbGljaycsIHRoaXMub25TdWJtaXQuYmluZCh0aGlzKSk7XG4gICAgJCgnI2d1ZXNzZWQnKS5vbignY2xpY2snLCB0aGlzLm9uR3Vlc3NlZC5iaW5kKHRoaXMsIHRoaXMucGxheWVyT2JqLmtleSgpKSk7XG4gICAgJCgnI2NvbXBsZXRlJykub24oJ2NsaWNrJywgdGhpcy5vbkd1ZXNzaW5nQ29tcGxldGUuYmluZCh0aGlzKSk7XG4gICAgJCgnI3NldF9zY29yZXMnKS5vbignY2xpY2snLCB0aGlzLm9uU2V0U2NvcmVzLmJpbmQodGhpcykpO1xuICAgICQoJyNuZXh0X3JvdW5kJykub24oJ2NsaWNrJywgdGhpcy5vbk5leHRSb3VuZC5iaW5kKHRoaXMpKTtcbiAgICAkKCcjcmVzcG9uc2UnKS5rZXlwcmVzcyhldmVudCA9PiB7XG4gICAgICBpZiAoZXZlbnQud2hpY2ggPT09IDEzKSB7XG4gICAgICAgIHRoaXMub25TdWJtaXQoKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICB0aGlzLnByZXBhcmVTZXR0aW5ncygpO1xuICB9KTtcbn07XG5cbkdhbWUucHJvdG90eXBlLnByZXBhcmVTZXR0aW5ncyA9IGZ1bmN0aW9uKCkge1xuICAkKCcjc2V0dGluZ3MnKS5vbignY2xpY2snLCBldmVudCA9PiB7XG4gICAgdmFyIGl0ZW1zID0gW3tcbiAgICAgICAgdGl0bGU6ICdOZXh0IHJvdW5kJyxcbiAgICAgICAgaWNvbjogJ2ZhIGZhLWZvcndhcmQnLFxuICAgICAgICBmbjogKCkgPT4gdGhpcy5vbk5leHRSb3VuZCgpLFxuICAgICAgICB2aXNpYmxlOiB0aGlzLmlzSG9zdFxuICAgICAgfSwge1xuICAgICAgfSwge1xuICAgICAgICB0aXRsZTogJ1NpdCBvdXQgdGhpcyByb3VuZCcsXG4gICAgICAgIGljb246ICdmYSBmYS1iZWQnLFxuICAgICAgICBmbjogKCkgPT4ge31cbiAgICAgIH0sIHtcbiAgICAgICAgdGl0bGU6ICdMZWF2ZSBnYW1lJyxcbiAgICAgICAgaWNvbjogJ2ZhIGZhLXNpZ24tb3V0JyxcbiAgICAgICAgZm46IHRoaXMucmVtb3ZlRnJvbUdhbWUuYmluZCh0aGlzLCB0aGlzLnBsYXllck9iai5rZXkoKSlcbiAgICB9XTtcbiAgICBiYXNpY0NvbnRleHQuc2hvdyhpdGVtcywgZXZlbnQub3JpZ2luYWxFdmVudCk7XG4gIH0pO1xufTtcblxuR2FtZS5wcm90b3R5cGUub25TdGF0ZUNoYW5nZSA9IGZ1bmN0aW9uKG5ld1N0YXRlKSB7XG4gIGNvbnNvbGUubG9nKCdzdGF0ZSA9PiAnICsgbmV3U3RhdGUpO1xuICB0aGlzLnN0YXRlID0gbmV3U3RhdGU7XG5cbiAgdGhpcy5wbGF5ZXJPYmouY2hpbGQoJ3N0YXRlJykub25jZSgndmFsdWUnLCBzbmFwc2hvdCA9PiB7XG4gICAgdmFyIHBsYXllclN0YXRlID0gc25hcHNob3QudmFsKCk7XG4gICAgaWYgKHBsYXllclN0YXRlID09PSBuZXdTdGF0ZSAmJiBuZXdTdGF0ZSAhPT0gU3RhdGUuSU5JVCkge1xuICAgICAgLy8gSXQgaXMgYWx3YXlzIHNhZmUgdG8gcnVuIHRoZSBJTklUIHN0YXRlXG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBwbGF5ZXJPYmpVcGRhdGU7XG4gICAgc3dpdGNoIChuZXdTdGF0ZSkge1xuICAgICAgY2FzZSBTdGF0ZS5JTklUOlxuICAgICAgICBwbGF5ZXJPYmpVcGRhdGUgPSB7XG4gICAgICAgICAgZ3Vlc3NlZDogbnVsbCxcbiAgICAgICAgICByZXNwb25kZWQ6IG51bGwsXG4gICAgICAgICAgdm90ZTogbnVsbCxcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKHRoaXMuaXNIb3N0KSB7XG4gICAgICAgICAgdGhpcy5nYW1lT2JqLnVwZGF0ZSh7XG4gICAgICAgICAgICBzdGF0ZTogU3RhdGUuUE9MTCxcbiAgICAgICAgICAgIHBvbGw6IG51bGwsXG4gICAgICAgICAgICByZXNwb25zZXM6IG51bGwsXG4gICAgICAgICAgICBxdWVzdGlvbjogbnVsbCxcbiAgICAgICAgICAgIHNjb3Jpbmc6IG51bGxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgU3RhdGUuUE9MTDpcbiAgICAgICAgaWYgKHRoaXMuaXNIb3N0KSB7XG4gICAgICAgICAgdGhpcy5wb2xsLnBpY2tDaG9pY2VzKCk7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFN0YXRlLlJFU1BPTkQ6XG4gICAgICAgIC8vIFJlbW92ZSBwb2xsIGRhdGEgb25jZSBubyBsb25nZXIgcmVsZXZhbnRcbiAgICAgICAgcGxheWVyT2JqVXBkYXRlID0ge1xuICAgICAgICAgIHJlc3BvbmRlZDogZmFsc2VcbiAgICAgICAgfTtcbiAgICAgICAgaWYgKHRoaXMuaXNIb3N0KSB7XG4gICAgICAgICAgdGhpcy5nYW1lT2JqLmNoaWxkKCdwb2xsJykudXBkYXRlKHtcbiAgICAgICAgICAgIGFsbG93Vm90aW5nOiBmYWxzZSxcbiAgICAgICAgICAgIHZvdGVzOiBudWxsLFxuICAgICAgICAgICAgc3Bpbm5lcjogbnVsbCxcbiAgICAgICAgICAgIHRpbWVvdXQ6IG51bGxcbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgU3RhdGUuR1VFU1M6XG4gICAgICAgIHBsYXllck9ialVwZGF0ZSA9IHtcbiAgICAgICAgICByZXNwb25kZWQ6IG51bGwsXG4gICAgICAgICAgZ3Vlc3NlZDogZmFsc2VcbiAgICAgICAgfTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIFN0YXRlLlNDT1JFOlxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgU3RhdGUuUkVDQVA6XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgICAvLyBBZGQgcGxheWVyIHN0YXRlIHVwZGF0ZSB0byB3aGF0ZXZlciB1cGRhdGVzIHRoZSBzdGF0ZSBkZXRlcm1pbmVkXG4gICAgcGxheWVyT2JqVXBkYXRlID0gcGxheWVyT2JqVXBkYXRlIHx8IHt9O1xuICAgIHBsYXllck9ialVwZGF0ZS5zdGF0ZSA9IG5ld1N0YXRlO1xuICAgIHRoaXMucGxheWVyT2JqLnVwZGF0ZShwbGF5ZXJPYmpVcGRhdGUpO1xuICB9KTtcbn07XG5cbkdhbWUucHJvdG90eXBlLm9uUXVlc3Rpb25VcGRhdGUgPSBmdW5jdGlvbihjaG9pY2UpIHtcbiAgaWYgKGNob2ljZSkge1xuICAgICQoJy5jaG9pY2VfY29udGFpbmVyJykuaGlkZSgpO1xuICAgICQoJyMnICsgY2hvaWNlKS5zaG93KCk7XG4gICAgJCgnIycgKyBjaG9pY2UpLmFkZENsYXNzKCd3aW5uZXInKTtcbiAgfVxuICBlbHNlIHtcbiAgICAkKCcuY2hvaWNlX2NvbnRhaW5lcicpLnNob3coKTtcbiAgICAkKCcuY2hvaWNlX2NvbnRhaW5lcicpLnJlbW92ZUNsYXNzKCd3aW5uZXIgc2VsZWN0ZWQnKTtcbiAgfVxufTtcblxuR2FtZS5wcm90b3R5cGUub25HdWVzc2VkVXBkYXRlID0gZnVuY3Rpb24oZ3Vlc3NlZCkge1xuICBpZiAodGhpcy5pc0hvc3QpIHtcbiAgICBpZiAoZ3Vlc3NlZCA9PT0gZmFsc2UpIHtcbiAgICAgICQoJyNndWVzc2VkX2NvbnRhaW5lcicpLnNob3coKTtcbiAgICAgICQoJyNjb21wbGV0ZScpLnNob3coKTtcbiAgICAgICQoJyNndWVzc2VkJykuc2hvdygpO1xuICAgIH1cbiAgICBlbHNlIGlmIChndWVzc2VkID09PSB0cnVlKSB7XG4gICAgICAkKCcjZ3Vlc3NlZCcpLmhpZGUoKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAkKCcjZ3Vlc3NlZF9jb250YWluZXInKS5oaWRlKCk7XG4gICAgfVxuICB9XG4gIGVsc2UgaWYgKGd1ZXNzZWQgPT09IGZhbHNlKSB7XG4gICAgJCgnI2d1ZXNzZWRfY29udGFpbmVyJykuc2hvdygpO1xuICB9IGVsc2Uge1xuICAgICQoJyNndWVzc2VkX2NvbnRhaW5lcicpLmhpZGUoKTtcbiAgfVxufTtcblxuR2FtZS5wcm90b3R5cGUub25SZXNwb25kZWRVcGRhdGUgPSBmdW5jdGlvbihyZXNwb25kZWQpIHtcbiAgaWYgKHJlc3BvbmRlZCA9PT0gZmFsc2UpIHtcbiAgICAkKCcjc3VibWl0X2NvbnRhaW5lcicpLnNob3coKTtcbiAgfSBlbHNlIHtcbiAgICAkKCcjc3VibWl0X2NvbnRhaW5lcicpLmhpZGUoKTtcbiAgfVxufTtcblxuR2FtZS5wcm90b3R5cGUub25OZXh0Um91bmQgPSBmdW5jdGlvbigpIHtcbiAgdGhpcy5nYW1lT2JqLnVwZGF0ZSh7XG4gICAgc3RhdGU6IFN0YXRlLklOSVQsXG4gICAgcm91bmQ6IHRoaXMucm91bmQgKyAxLFxuICB9KTtcbn07XG5cbkdhbWUucHJvdG90eXBlLnJlbW92ZUZyb21HYW1lID0gZnVuY3Rpb24ocGxheWVyS2V5KSB7XG4gIHRoaXMuZ2FtZU9iai5jaGlsZCgnbnVtUGxheWVycycpLnRyYW5zYWN0aW9uKGN1cnJOdW1QbGF5ZXJzID0+IHtcbiAgICByZXR1cm4gY3Vyck51bVBsYXllcnMgLSAxO1xuICB9LCAoZXJyLCBjb21taXR0ZWQsIHNuYXBzaG90KSA9PiB7XG4gICAgaWYgKCFjb21taXR0ZWQpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgLy8gU2V0IHRoZSBwbGF5ZXIncyByYW5rIHRvIDAsIG1lYW5pbmcgdGhleSBhcmUgdG8gYmUgcmVtb3ZlZFxuICAgIHRoaXMuZ2FtZU9iai5jaGlsZCgncGxheWVycycpLmNoaWxkKHBsYXllcktleSkucmVtb3ZlKCk7XG4gICAgdmFyIHJlc3BvbnNlc0luZm8gPSB0aGlzLnJlc3BvbnNlcy5yZXNwb25zZXNJbmZvO1xuICAgIC8vIElmIHRoZSBwbGF5ZXIgaGFzIHJlc3BvbnNlZCwgcmVtb3ZlIHJlc3BvbnNlXG4gICAgaWYgKHJlc3BvbnNlc0luZm8gIT09IG51bGwpIHtcbiAgICAgIHV0aWwuZm9yRWFjaChyZXNwb25zZXNJbmZvLCAodmFsLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKHZhbC5rZXkgPT09IHBsYXllcktleSkge1xuICAgICAgICAgIHRoaXMuZ2FtZU9iai5jaGlsZCgncmVzcG9uc2VzJykuY2hpbGQoa2V5KS5yZW1vdmUoKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuICB9KTtcbn07XG5cbkdhbWUucHJvdG90eXBlLm9uU3VibWl0ID0gZnVuY3Rpb24oKSB7XG4gIHZhciBpbnB1dCA9ICQoXCIjcmVzcG9uc2VcIikudmFsKCk7XG4gIGlmIChpbnB1dCA9PT0gXCJcIikge1xuICAgIHJldHVybjtcbiAgfVxuICB0aGlzLnBsYXllck9iai5jaGlsZCgncmVzcG9uZGVkJykuc2V0KHRydWUpO1xuICB0aGlzLmdhbWVPYmouY2hpbGQoJ3Jlc3BvbnNlcycpLnB1c2goe1xuICAgIGtleTogdGhpcy5wbGF5ZXJPYmoua2V5KCksXG4gICAgcmVzcG9uc2U6IGlucHV0XG4gIH0pO1xufTtcblxuR2FtZS5wcm90b3R5cGUub25HdWVzc2VkID0gZnVuY3Rpb24ocGxheWVyS2V5KSB7XG4gIHRoaXMuZ2FtZU9iai5jaGlsZCgncGxheWVycycpLmNoaWxkKHBsYXllcktleSkuY2hpbGQoJ2d1ZXNzZWQnKS5zZXQodHJ1ZSk7XG4gIC8vIExvb2sgaW50byByZXNwb25zZXNJbmZvLCBmaW5kIHlvdXIgcmVzcG9uc2UgYW5kIGVsaW1pbmF0ZSBpdFxuICB1dGlsLmZvckVhY2godGhpcy5yZXNwb25zZXMucmVzcG9uc2VzSW5mbywgKHZhbCwga2V5KSA9PiB7XG4gICAgaWYgKHZhbC5rZXkgPT09IHBsYXllcktleSkge1xuICAgICAgdGhpcy5nYW1lT2JqLmNoaWxkKCdyZXNwb25zZXMnKS5jaGlsZChrZXkpLnVwZGF0ZSh7XG4gICAgICAgIGVsaW1pbmF0ZWQ6IHRydWVcbiAgICAgIH0pO1xuICAgIH1cbiAgfSk7XG59O1xuXG4vLyBIb3N0IG9ubHlcbkdhbWUucHJvdG90eXBlLm9uR3Vlc3NpbmdDb21wbGV0ZSA9IGZ1bmN0aW9uKCkge1xuICB0aGlzLmdhbWVPYmoudXBkYXRlKHtcbiAgICBzdGF0ZTogU3RhdGUuU0NPUkUsXG4gICAgc2NvcmluZzogdHJ1ZSxcbiAgICByZXNwb25zZXM6IG51bGxcbiAgfSk7XG59O1xuXG4vLyBIb3N0IG9ubHlcbkdhbWUucHJvdG90eXBlLm9uU2V0U2NvcmVzID0gZnVuY3Rpb24oKSB7XG4gIHRoaXMuZ2FtZU9iai5jaGlsZCgncGxheWVycycpLm9uY2UoJ3ZhbHVlJywgc25hcHNob3QgPT4ge1xuICAgIHNuYXBzaG90LmZvckVhY2gocGxheWVyU25hcHNob3QgPT4ge1xuICAgICAgdmFyIHNjb3JlU25hcHNob3QgPSBwbGF5ZXJTbmFwc2hvdC5jaGlsZCgnc2NvcmUnKTtcbiAgICAgIHZhciByYW5rID0gcGxheWVyU25hcHNob3QuY2hpbGQoJ3JhbmsnKS52YWwoKTtcbiAgICAgIHZhciBhZGogPSAkKCcuc2NvcmVfYWRqdXN0bWVudCcpLmVxKHJhbmsgLSAxKTtcbiAgICAgIHNjb3JlU25hcHNob3QucmVmKCkuc2V0KHNjb3JlU25hcHNob3QudmFsKCkgKyBwYXJzZUludChhZGouaHRtbCgpLCAxMCkpO1xuICAgIH0pO1xuICB9KTtcbiAgdGhpcy5nYW1lT2JqLnVwZGF0ZSh7XG4gICAgc3RhdGU6IFN0YXRlLlJFQ0FQLFxuICAgIHNjb3Jpbmc6IGZhbHNlXG4gIH0pO1xuICB0aGlzLnBsYXllcnMuc2V0UmFua3MoKTtcbn07XG5cbi8vIEhvc3Qgb25seVxuR2FtZS5wcm90b3R5cGUub25TY29yaW5nVXBkYXRlID0gZnVuY3Rpb24oc2NvcmluZykge1xuICBpZiAoc2NvcmluZykge1xuICAgICQoJyNndWVzc2VkX2NvbnRhaW5lcicpLmhpZGUoKTtcbiAgICAkKCcjc2NvcmluZ19jb250YWluZXInKS5zaG93KCk7XG4gICAgJCgnI3NldF9zY29yZXMnKS5zaG93KCk7XG4gICAgJCgnI25leHRfcm91bmQnKS5oaWRlKCk7XG4gICAgJCgnLnNjb3JlX2FkanVzdGVyJykuc2hvdygpO1xuICAgICQoJy5taW51cycpLm9mZignY2xpY2snKTtcbiAgICAkKCcucGx1cycpLm9mZignY2xpY2snKTtcbiAgICAkKCcubWludXMnKS5jbGljayhldmVudCA9PiB7XG4gICAgICB2YXIgYWRqID0gJChldmVudC50YXJnZXQpLnNpYmxpbmdzKCcuc2NvcmVfYWRqdXN0bWVudCcpO1xuICAgICAgdmFyIG5ld0FkalZhbCA9IHBhcnNlSW50KGFkai5odG1sKCksIDEwKSAtIDE7XG4gICAgICBhZGouaHRtbChuZXdBZGpWYWwpO1xuICAgIH0pO1xuICAgICQoJy5wbHVzJykuY2xpY2soZXZlbnQgPT4ge1xuICAgICAgdmFyIGFkaiA9ICQoZXZlbnQudGFyZ2V0KS5zaWJsaW5ncygnLnNjb3JlX2FkanVzdG1lbnQnKTtcbiAgICAgIHZhciBuZXdBZGpWYWwgPSBwYXJzZUludChhZGouaHRtbCgpLCAxMCkgKyAxO1xuICAgICAgYWRqLmh0bWwobmV3QWRqVmFsKTtcbiAgICB9KTtcbiAgfVxuICBlbHNlIGlmIChzY29yaW5nID09PSBmYWxzZSkge1xuICAgICQoJyNzY29yaW5nX2NvbnRhaW5lcicpLnNob3coKTtcbiAgICAkKCcjc2V0X3Njb3JlcycpLmhpZGUoKTtcbiAgICAkKCcjbmV4dF9yb3VuZCcpLnNob3coKTtcbiAgICAkKCcuc2NvcmVfYWRqdXN0ZXInKS5oaWRlKCk7XG4gIH1cbiAgZWxzZSB7XG4gICAgJCgnI3Njb3JpbmdfY29udGFpbmVyJykuaGlkZSgpO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEdhbWU7XG4iLCJcbnZhciBiYXNpY0NvbnRleHQgPSByZXF1aXJlKCdiYXNpY2NvbnRleHQnKTtcbnZhciBTdGF0ZSA9IHJlcXVpcmUoJy4vU3RhdGUuanMnKTtcbnZhciB1dGlsID0gcmVxdWlyZSgnLi91dGlsLmpzJyk7XG52YXIgTlVNX0ZSQU1FUyA9IDE1OyAvLyBudW1iZXIgb2YgZGlmZmVyZW50IGZyYW1lcyBiZWZvcmUgcmVwZWF0c1xuXG4vLyBIYW5kbGVzIGNyZWF0aW9uIGFuZCBtYWludGVuYW5jZSBvZiB0aGUgbGlzdCBvZiBwbGF5ZXJzXG5mdW5jdGlvbiBQbGF5ZXJzKGdhbWUpIHtcbiAgdGhpcy5nYW1lID0gZ2FtZTtcbiAgdGhpcy5nYW1lT2JqID0gZ2FtZS5nYW1lT2JqO1xuICB0aGlzLnBsYXllcnNJbmZvID0gbnVsbDtcblxuICB0aGlzLmZyYW1lcyA9IFwiXCI7XG5cbiAgdGhpcy5nYW1lT2JqLmNoaWxkKCdmcmFtZXMnKS5vbigndmFsdWUnLFxuICAgIHNuYXBzaG90ID0+IHRoaXMuZnJhbWVzID0gc25hcHNob3QudmFsKClcbiAgKTtcbiAgdXRpbC5iaW5kRnVuYyh0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKSxcbiAgICB0aGlzLm9uUGxheWVyc1VwZGF0ZS5iaW5kKHRoaXMpKTtcbiAgdXRpbC5iaW5kRnVuYyh0aGlzLmdhbWUucGxheWVyT2JqLmNoaWxkKCdhc2xlZXAnKSwgdGhpcy5zbGVlcEFsZXJ0LmJpbmQodGhpcykpO1xuICAvLyBOb3RlOiByZW1vdmluZyBhIHBsYXllciBkb2VzIG5vdCB0cmlnZ2VyIGEgJ3BsYXllcnMnIHZhbHVlIHVwZGF0ZVxuICB0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKS5vbignY2hpbGRfcmVtb3ZlZCcsIHBsYXllck9iaiA9PiB7XG4gICAgdmFyIHBsYXllciA9IHBsYXllck9iai52YWwoKTtcbiAgICBjb25zb2xlLndhcm4oJ21vdmluZzonLCBwbGF5ZXIsIHBsYXllci5yYW5rLCAtMSk7XG4gICAgdGhpcy5tb3ZlUGxheWVyRG9tKHBsYXllciwgcGxheWVyLnJhbmssIC0xKTtcbiAgICBpZiAodGhpcy5nYW1lLmlzSG9zdCkge1xuICAgICAgdGhpcy5zZXRSYW5rcygpO1xuICAgIH1cbiAgICAvLyBJZiB5b3UgYXJlIHRoZSBwbGF5ZXIgYmVpbmcgcmVtb3ZlZCwgZ28gYmFjayB0byBob21lIHNjcmVlblxuICAgIGlmIChwbGF5ZXJPYmoua2V5KCkgPT09IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCkpIHtcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gXCJcIjsgLy8gQ2xlYXJzIFVSTCBzdWZmaXhcbiAgICAgIHdpbmRvdy5sb2NhdGlvbi5yZWxvYWQoKTsgLy8gRm9yY2UgcmVsb2FkXG4gICAgfVxuICB9KTtcbn1cblxuUGxheWVycy5wcm90b3R5cGUuYXdha2VDb3VudCA9IGZ1bmN0aW9uKCkge1xuICB2YXIgY291bnQgPSAwO1xuICB1dGlsLmZvckVhY2godGhpcy5wbGF5ZXJzSW5mbywgcGxheWVyID0+IHtcbiAgICBjb3VudCA9IGNvdW50ICsgKHBsYXllci5hc2xlZXAgPyAwIDogMSk7XG4gIH0pO1xuICByZXR1cm4gY291bnQ7XG59O1xuXG4vLyBXcml0ZXMgbmV3IHBsYXllciBvcmRlciB0byBkYXRhYmFzZSwgb25seSBob3N0IHNob3VsZCBkbyB0aGlzXG4vLyBUT0RPOiBDb3VsZCBiZSBhIHRyYW5zYWN0aW9uIGNvbXBsZXRlZCBieSBhbnlvbmVcblBsYXllcnMucHJvdG90eXBlLnNldFJhbmtzID0gZnVuY3Rpb24oKSB7XG4gIGNvbnNvbGUud2FybignY2hpbGQgcmVtb3ZlZCcpO1xuICB2YXIgcGxheWVyT3JkZXIgPSBbXTtcbiAgY29uc29sZS53YXJuKCdzZXR0aW5nIHJhbmtzJyk7XG4gIHRoaXMuZ2FtZU9iai5jaGlsZCgncGxheWVycycpLm9uY2UoJ3ZhbHVlJywgc25hcHNob3QgPT4ge1xuICAgIHZhciBuZXdQbGF5ZXJzSW5mbyA9IHNuYXBzaG90LnZhbCgpO1xuICAgIHV0aWwuZm9yRWFjaChuZXdQbGF5ZXJzSW5mbywgKHZhbCwga2V5KSA9PiB7XG4gICAgICBwbGF5ZXJPcmRlci5wdXNoKHtrZXk6IGtleSwgdmFsOiB2YWx9KTtcbiAgICB9KTtcbiAgICBwbGF5ZXJPcmRlci5zb3J0KChwbGF5ZXJBLCBwbGF5ZXJCKSA9PiB7XG4gICAgICB2YXIgYVB0cyA9IHBsYXllckEudmFsLnNjb3JlO1xuICAgICAgdmFyIGJQdHMgPSBwbGF5ZXJCLnZhbC5zY29yZTtcbiAgICAgIHJldHVybiBhUHRzICE9PSBiUHRzID8gYlB0cyAtIGFQdHMgOiBwbGF5ZXJBLnZhbC5hZGRlZCAtIHBsYXllckIudmFsLmFkZGVkO1xuICAgIH0pO1xuICAgIHBsYXllck9yZGVyLmZvckVhY2goKHBsYXllciwgaW5kZXgpID0+IHtcbiAgICAgIGlmIChpbmRleCArIDEgIT09IG5ld1BsYXllcnNJbmZvW3BsYXllci5rZXldLnJhbmspIHtcbiAgICAgICAgLy8gU2V0dGluZyBuZXcgcmFuayBpbiBkYlxuICAgICAgICB0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKS5jaGlsZChwbGF5ZXIua2V5KVxuICAgICAgICAgIC5jaGlsZCgncmFuaycpLnNldChpbmRleCArIDEpO1xuICAgICAgfVxuICAgIH0pO1xuICB9KTtcbn07XG5cblBsYXllcnMucHJvdG90eXBlLm9uUGxheWVyc1VwZGF0ZSA9IGZ1bmN0aW9uKG5ld1BsYXllcnNJbmZvKSB7XG4gIGNvbnNvbGUud2FybigndmFsdWUgY2hhbmdlZCcpO1xuICBuZXdQbGF5ZXJzSW5mbyA9IG5ld1BsYXllcnNJbmZvIHx8IHt9O1xuICBjb25zb2xlLndhcm4oJ05FVyBQTEFZRVJTIElORk8/JywgbmV3UGxheWVyc0luZm8pO1xuICAvLyBVcGRhdGUgRG9tIGZvciBlYWNoIHBsYXllclxuICB1dGlsLmZvckVhY2gobmV3UGxheWVyc0luZm8sIHRoaXMudXBkYXRlUGxheWVyRG9tLmJpbmQodGhpcykpO1xuICAvLyBTYXZlIGRhdGEgdG8gY2xpZW50XG4gIHRoaXMucGxheWVyc0luZm8gPSBuZXdQbGF5ZXJzSW5mbztcbn07XG5cblBsYXllcnMucHJvdG90eXBlLnVwZGF0ZVBsYXllckRvbSA9IGZ1bmN0aW9uKHBsYXllciwga2V5KSB7XG4gIC8vIFRPRE86IFNob3VsZCByZXBsYWNlIGZyYW1lIHdpdGggdGhlIHNhbWUgaW5kZXgsIGFwcGVuZCBvbmx5IGlmIG5vbi1leGlzdGVudFxuICBpZiAoIXRoaXMucGxheWVyc0luZm8gfHwgIShrZXkgaW4gdGhpcy5wbGF5ZXJzSW5mbykpIHtcbiAgICAvLyBQbGF5ZXIgbm90IGluIGNsaWVudCwgZmluZCBwbGFjZSB0byBwdXQgdGhlbVxuICAgIHZhciByYW5rcyA9ICQoJyNwbGF5ZXJzID4gKicpLnRvQXJyYXkoKS5tYXAoZnJhbWUgPT4ge1xuICAgICAgdmFyIGNsYXNzTGlzdCA9IGZyYW1lLmNsYXNzTmFtZS5zcGxpdCgvXFxzKy8pO1xuICAgICAgdmFyIGNscyA9IGNsYXNzTGlzdC5maWx0ZXIoY2xzID0+IGNscy5zbGljZSgwLCA2KSA9PT0gJ2ZyYW1lXycpWzBdO1xuICAgICAgcmV0dXJuIHBhcnNlSW50KGNsc1tjbHMubGVuZ3RoIC0gMV0sIDEwKTtcbiAgICB9KTtcbiAgICByYW5rcyA9IHJhbmtzLmZpbHRlcihyYW5rID0+IHJhbmsgPD0gcGxheWVyLnJhbmspO1xuICAgIGlmIChyYW5rcy5sZW5ndGggPT09IDApIHtcbiAgICAgIGNvbnNvbGUud2FybignYXBwZW5kaW5nIHRvIHBsYXllcnMnKTtcbiAgICAgICQoJyNwbGF5ZXJzJykucHJlcGVuZCh0aGlzLmJ1aWxkUGxheWVyRG9tKHBsYXllciwga2V5KSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgdmFyIHByZXYgPSBNYXRoLm1heC5hcHBseShudWxsLCByYW5rcyk7XG4gICAgICBpZiAocHJldiA9PT0gcGxheWVyLnJhbmspIHtcbiAgICAgICAgLy8gSWYgZnJhbWUgYWxyZWFkeSBleGlzdHMsIHJlcGxhY2UgaXRcbiAgICAgICAgJCgnLmZyYW1lXycgKyBwcmV2KS5yZXBsYWNlV2l0aCh0aGlzLmJ1aWxkUGxheWVyRG9tKHBsYXllciwga2V5KSk7XG4gICAgICB9XG4gICAgICBlbHNlIHtcbiAgICAgICAgLy8gSWYgZnJhbWUgaXMgbGVzcywgYWRkIGFmdGVyIGl0XG4gICAgICAgICQoJy5mcmFtZV8nICsgcHJldikuYWZ0ZXIodGhpcy5idWlsZFBsYXllckRvbShwbGF5ZXIsIGtleSkpO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAodGhpcy5nYW1lLmlzSG9zdCkge1xuICAgICAgdGhpcy5wcmVwYXJlUGxheWVyTWVudShwbGF5ZXIsIGtleSk7XG4gICAgfVxuICB9XG4gIGVsc2UgaWYgKHBsYXllci5yYW5rICE9PSB0aGlzLnBsYXllcnNJbmZvW2tleV0ucmFuaykge1xuICAgIGNvbnNvbGUud2FybignUExBWUVSIFJBTksgQ0hBTkdFRCEnLCBwbGF5ZXIubmFtZSxcbiAgICAgIHRoaXMucGxheWVyc0luZm9ba2V5XS5yYW5rICsgJyAtPiAnICsgcGxheWVyLnJhbmspO1xuICAgIC8vIFBsYXllciByYW5rIGhhcyBjaGFuZ2VkXG4gICAgdGhpcy5tb3ZlUGxheWVyRG9tKHBsYXllciwgdGhpcy5wbGF5ZXJzSW5mb1trZXldLnJhbmssIHBsYXllci5yYW5rKTtcbiAgICBpZiAodGhpcy5nYW1lLmlzSG9zdCkge1xuICAgICAgdGhpcy5wcmVwYXJlUGxheWVyTWVudShwbGF5ZXIsIGtleSk7XG4gICAgfVxuICB9XG4gIGVsc2Uge1xuICAgIC8vIFBsYXllciBpbiBjbGllbnRcbiAgICBjb25zb2xlLndhcm4oJ1VQREFUSU5HIFBMQVlBIERPTScpO1xuICAgIC8vIFNldCBzbGVlcGluZyBvciBhd2FrZVxuICAgICQoJy5mcmFtZV8nICsgcGxheWVyLnJhbmsgKyAnIC5ib2R5JykuY3NzKCdvcGFjaXR5JywgcGxheWVyLmFzbGVlcCA/IDAuMiA6IDEuMCk7XG4gIH1cbn07XG5cbi8vIEFuaW1hdGVzIHBsYXllciBtb3ZpbmcgZnJvbSBvbmUgZnJhbWUgdG8gYW5vdGhlclxuLy8gQXNzdW1lcyBhbGwgcGxheWVycyB3aWxsIGJlIG1vdmVkIGluIGEgbG9vcFxuUGxheWVycy5wcm90b3R5cGUubW92ZVBsYXllckRvbSA9IGZ1bmN0aW9uKHBsYXllciwgc3RhcnQsIGVuZCkge1xuICB2YXIgc2VxID0gc3RhcnQgPCBlbmQgfHwgZW5kID09PSAtMSA/IFsncmlnaHRfb3V0JywgJ2xlZnRfaW4nXSA6XG4gICAgWydsZWZ0X291dCcsICdyaWdodF9pbiddO1xuICB2YXIgZGlzdCA9IE1hdGguYWJzKHN0YXJ0IC0gZW5kKTtcbiAgdmFyIGR1cmF0aW9uID0gKE1hdGgucmFuZG9tKCkqMS4wICsgMS4wKSArICdzJztcbiAgdmFyIHN0YXJ0Qm9keSA9ICQoJy5mcmFtZV8nICsgc3RhcnQgKyAnIC5ib2R5Jyk7XG4gIHZhciBlbmRCb2R5ID0gJCgnLmZyYW1lXycgKyBlbmQgKyAnIC5ib2R5Jyk7XG4gIHZhciBzdGFydFRhZyA9ICQoJy5mcmFtZV8nICsgc3RhcnQgKyAnIC5wbGF5ZXJfbmFtZScpO1xuICB2YXIgZW5kVGFnID0gJCgnLmZyYW1lXycgKyBlbmQgKyAnIC5wbGF5ZXJfbmFtZScpO1xuXG4gIHZhciB3YWxrSW4gPSAoKSA9PiB7XG4gICAgZW5kQm9keS5maW5kKCcuaGVhZCcpLmNzcygnYmFja2dyb3VuZC1jb2xvcicsIHBsYXllci5jb2xvcik7XG4gICAgZW5kQm9keS5maW5kKCcudG9yc28nKS5jc3MoJ2JhY2tncm91bmQtY29sb3InLCBwbGF5ZXIuY29sb3IpO1xuICAgIGVuZFRhZy5odG1sKHBsYXllci5uYW1lKTtcbiAgICBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgIGVuZEJvZHkuY3NzKCdhbmltYXRpb24tZHVyYXRpb24nLCBkdXJhdGlvbik7XG4gICAgICBlbmRCb2R5LmFkZENsYXNzKHNlcVsxXSk7XG4gICAgICBlbmRCb2R5LnNob3coKTtcbiAgICAgIGVuZEJvZHkub25lKCdhbmltYXRpb25lbmQnLCAoKSA9PiBlbmRCb2R5LnJlbW92ZUNsYXNzKHNlcVsxXSkpO1xuICAgICAgLy8gRmFkZSBpbiB0YWdcbiAgICAgIGVuZFRhZy5jc3Moe1xuICAgICAgICAnb3BhY2l0eSc6ICcxLjAnLFxuICAgICAgICAndHJhbnNpdGlvbi1kdXJhdGlvbic6IGR1cmF0aW9uXG4gICAgICB9KTtcbiAgICAgIC8vIElmIHRoZSBtb3ZpbmcgcGxheWVyIGlzIGhvc3RpbmcsIHNob3cgdGhlIGNvZ1xuICAgICAgLy8gaWYgKHRoaXMuZ2FtZS5pc0hvc3QgJiYgIXBsYXllci5pc0hvc3QpIHtcbiAgICAgIC8vICAgJCgnLmZyYW1lXycgKyBlbmQgKyAnIC5wbGF5ZXJfbWVudScpLnNob3coKTtcbiAgICAgIC8vIH1cbiAgICB9LCAoZGlzdCAqIDI1MCkgKyA1MDApO1xuICB9O1xuXG4gIHN0YXJ0Qm9keS5jc3MoJ2FuaW1hdGlvbi1kdXJhdGlvbicsIGR1cmF0aW9uKTtcbiAgc3RhcnRCb2R5LmFkZENsYXNzKHNlcVswXSk7IC8vIFdhbGsgb3V0XG4gIC8vIEZhZGUgb3V0IHRhZ1xuICBzdGFydFRhZy5jc3Moe1xuICAgICdvcGFjaXR5JzogJzAuMCcsXG4gICAgJ3RyYW5zaXRpb24tZHVyYXRpb24nOiBkdXJhdGlvblxuICB9KTtcbiAgLy8gSWYgdGhlIG1vdmluZyBwbGF5ZXIgaXMgaG9zdGluZywgYWxzbyBoaWRlIGNvZ1xuICAvLyBpZiAodGhpcy5nYW1lLmlzSG9zdCkge1xuICAvLyAgICQoJy5mcmFtZV8nICsgc3RhcnQgKyAnIC5wbGF5ZXJfbWVudScpLmhpZGUoKTtcbiAgLy8gfVxuICBzdGFydEJvZHkub25lKCdhbmltYXRpb25lbmQnLCAoKSA9PiB7XG4gICAgc3RhcnRCb2R5LmhpZGUoKTtcbiAgICBzdGFydEJvZHkucmVtb3ZlQ2xhc3MoJ3JpZ2h0X291dCBsZWZ0X2luIGxlZnRfb3V0IHJpZ2h0X2luJyk7XG4gICAgaWYgKGVuZCA9PT0gLTEpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgZWxzZSBpZiAoZW5kQm9keS5oYXNDbGFzcygncmlnaHRfb3V0JykgfHwgZW5kQm9keS5oYXNDbGFzcygnbGVmdF9vdXQnKSkge1xuICAgICAgLy8gSWYgZGVzdGluYXRpb24gaXMgc3RpbGwgYW5pbWF0aW5nLCB3YWl0IHVudGlsIGl0IGZpbmlzaGVzXG4gICAgICBlbmRCb2R5Lm9uZSgnYW5pbWF0aW9uZW5kJywgd2Fsa0luKTtcbiAgICB9IGVsc2Uge1xuICAgICAgd2Fsa0luKCk7XG4gICAgfVxuICB9KTtcbn07XG5cbi8vIFJldHVybnMgYSBzaW5nbGUgaW5zdGFuY2Ugb2YgYSBwbGF5ZXIgRE9NIGl0ZW1cblBsYXllcnMucHJvdG90eXBlLmJ1aWxkUGxheWVyRG9tID0gZnVuY3Rpb24ocGxheWVyLCBrZXkpIHtcbiAgY29uc29sZS53YXJuKCdwbGF5ZXIsIGtleScsIHBsYXllciwga2V5KTtcbiAgdmFyIHBsYXllcktleSA9IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCk7XG4gIHZhciBpc1VzZXIgPSBrZXkgPT09IHBsYXllcktleTtcblxuICB2YXIgYWxsRnJhbWVzID0gWydmcmFtZV9vdmFsJywgJ2ZyYW1lX3NxdWFyZScsICdmcmFtZV9yZWN0J107XG5cbiAgLy8gMTUgaXMgdGhlIG51bWJlciBvZiBmcmFtZXNcbiAgdmFyIHZhbHVlID0gcGFyc2VJbnQodGhpcy5mcmFtZXNbKHBsYXllci5yYW5rIC0gMSkgJSBOVU1fRlJBTUVTXSwgMTApO1xuICB2YXIgZnJhbWUgPSBhbGxGcmFtZXNbTWF0aC5mbG9vcih2YWx1ZSAlIDMpXTtcblxuICByZXR1cm4gXCI8ZGl2IGNsYXNzPSdmcmFtZSBmcmFtZV9cIiArIHBsYXllci5yYW5rICsgXCInPlwiICtcbiAgICBcIjxkaXYgY2xhc3M9J3BsYXllcl9tZW51IGZhIGZhLWNvZycgc3R5bGU9J2Rpc3BsYXk6XCIgK1xuICAgICAgKHRoaXMuZ2FtZS5pc0hvc3QgPyAnYmxvY2snIDogJ25vbmUnKSArIFwiOyc+PC9kaXY+XCIgK1xuICAgIFwiPGRpdiBjbGFzcz0nZnJhbWVfY29udGVudCBcIiArIGZyYW1lICsgXCInPlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0nYm9keScgc3R5bGU9J29wYWNpdHk6XCIgKyAocGxheWVyLmFzbGVlcCA/IFwiMC4yXCIgOiBcIjEuMFwiKSArIFwiOyc+XCIgK1xuICAgICAgICBcIjxkaXYgY2xhc3M9J2hlYWQnIHN0eWxlPSdiYWNrZ3JvdW5kLWNvbG9yOlwiICsgcGxheWVyLmNvbG9yICsgXCI7Jz48L2Rpdj5cIiArXG4gICAgICAgIFwiPGRpdiBjbGFzcz0ndG9yc28nIHN0eWxlPSdiYWNrZ3JvdW5kLWNvbG9yOlwiICsgcGxheWVyLmNvbG9yICsgXCI7Jz48L2Rpdj5cIiArXG4gICAgICBcIjwvZGl2PlwiICtcbiAgICBcIjwvZGl2PlwiICtcbiAgICB0aGlzLmJ1aWxkUGxhcXVlKHBsYXllci5uYW1lKSArXG4gICAgXCI8ZGl2IGNsYXNzPSdzY29yZV9hZGp1c3Rlcic+XCIgK1xuICAgICAgXCI8ZGl2IGNsYXNzPSdtaW51cyc+LTwvZGl2PlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0nc2NvcmVfYWRqdXN0bWVudCc+MDwvZGl2PlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0ncGx1cyc+KzwvZGl2PlwiICtcbiAgICBcIjwvZGl2PlwiICtcbiAgXCI8L2Rpdj5cIjtcbiAgLy8gICBcIjxkaXYgY2xhc3M9J3NwZWVjaF9idWJibGUgc3BlZWNoX2J1YmJsZV9sZWZ0Jz5cIiArXG4gIC8vICAgICBcIjxkaXYgY2xhc3M9J3NwZWVjaCBzcGVlY2hfbGVmdCc+PC9kaXY+XCIgK1xuICAvLyAgICAgXCI8ZGl2IGNsYXNzPSdwb2ludGVyX2xlZnQnPjwvZGl2PlwiICtcbiAgLy8gICBcIjwvZGl2PlwiICtcbiAgLy8gICBcIjxkaXYgY2xhc3M9J3NwZWVjaF9idWJibGUgc3BlZWNoX2J1YmJsZV9yaWdodCc+XCIgK1xuICAvLyAgICAgXCI8ZGl2IGNsYXNzPSdzcGVlY2ggc3BlZWNoX3JpZ2h0Jz48L2Rpdj5cIiArXG4gIC8vICAgICBcIjxkaXYgY2xhc3M9J3BvaW50ZXJfcmlnaHQnPjwvZGl2PlwiICtcbiAgLy8gICBcIjwvZGl2PlwiICtcbn07XG5cblBsYXllcnMucHJvdG90eXBlLnByZXBhcmVQbGF5ZXJNZW51ID0gZnVuY3Rpb24ocGxheWVyLCBrZXkpIHtcbiAgdmFyIG1lbnUgPSAkKCcuZnJhbWVfJyArIHBsYXllci5yYW5rICsgJyAucGxheWVyX21lbnUnKTtcbiAgLy8gSW4gY2FzZSBpdCBpcyBjYWxsZWQgdHdpY2VcbiAgbWVudS5vZmYoJ2NsaWNrJyk7XG4gIG1lbnUub24oJ2NsaWNrJywgZXZlbnQgPT4ge1xuICAgIHZhciBpdGVtcyA9IFt7XG4gICAgICAgIHRpdGxlOiAnR2l2ZSBwb2ludCcsXG4gICAgICAgIGljb246ICdmYSBmYS1wbHVzJyxcbiAgICAgICAgZm46ICgpID0+IHRoaXMuYWRqdXN0U2NvcmUoa2V5LCAxKVxuICAgICAgfSwge1xuICAgICAgICB0aXRsZTogJ1Rha2UgcG9pbnQnLFxuICAgICAgICBpY29uOiAnZmEgZmEtbWludXMnLFxuICAgICAgICBmbjogKCkgPT4gdGhpcy5hZGp1c3RTY29yZShrZXksIC0xKVxuICAgICAgfSwge1xuICAgICAgfSwge1xuICAgICAgICB0aXRsZTogJ01hcmsgcmVzcG9uc2UgZ3Vlc3NlZCcsXG4gICAgICAgIGljb246ICdmYSBmYS1xdW90ZS1sZWZ0JyxcbiAgICAgICAgdmlzaWJsZTogIXBsYXllci5pc0hvc3QgJiYgdGhpcy5nYW1lLnN0YXRlID09PSBTdGF0ZS5HVUVTUyxcbiAgICAgICAgZGlzYWJsZWQ6IHBsYXllci5ndWVzc2VkLFxuICAgICAgICBmbjogKCkgPT4gdGhpcy5nYW1lLm9uR3Vlc3NlZChrZXkpXG4gICAgICB9LCB7XG4gICAgICAgIHRpdGxlOiAnU2l0IG91dCB0aGlzIHJvdW5kJyxcbiAgICAgICAgaWNvbjogJ2ZhIGZhLWJlZCcsXG4gICAgICAgIHZpc2libGU6ICFwbGF5ZXIuaXNIb3N0LFxuICAgICAgICBmbjogKCkgPT4gdGhpcy5nYW1lT2JqLmNoaWxkKCdwbGF5ZXJzJykuY2hpbGQoa2V5KS5jaGlsZCgnYXNsZWVwJykuc2V0KHRydWUpXG4gICAgICB9LCB7XG4gICAgICAgIHRpdGxlOiAnUmVtb3ZlIHBsYXllcicsXG4gICAgICAgIGljb246ICdmYSBmYS1iYW4nLFxuICAgICAgICB2aXNpYmxlOiAhcGxheWVyLmlzSG9zdCxcbiAgICAgICAgZm46ICgpID0+IHRoaXMuZ2FtZS5yZW1vdmVGcm9tR2FtZShrZXkpXG4gICAgfV07XG4gICAgYmFzaWNDb250ZXh0LnNob3coaXRlbXMsIGV2ZW50Lm9yaWdpbmFsRXZlbnQpO1xuICB9KTtcbn07XG5cbi8vIEFkanVzdHMgYSBwbGF5ZXJzIHNjb3JlIGJ5IGFtdFxuUGxheWVycy5wcm90b3R5cGUuYWRqdXN0U2NvcmUgPSBmdW5jdGlvbihrZXksIGFtdCkge1xuICB0aGlzLmdhbWVPYmouY2hpbGQoJ3BsYXllcnMnKS5jaGlsZChrZXkpLmNoaWxkKCdzY29yZScpXG4gIC50cmFuc2FjdGlvbihjdXJyU2NvcmUgPT4ge1xuICAgICAgcmV0dXJuIGN1cnJTY29yZSArIGFtdDtcbiAgfSwgKGVyciwgY29tbWl0dGVkLCBzbmFwc2hvdCkgPT4ge1xuICAgIGlmICghY29tbWl0dGVkKSByZXR1cm47XG4gICAgdGhpcy5zZXRSYW5rcygpO1xuICB9KTtcbn07XG5cblBsYXllcnMucHJvdG90eXBlLmJ1aWxkUGxhcXVlID0gZnVuY3Rpb24obmFtZSkge1xuICByZXR1cm4gXCI8ZGl2IGNsYXNzPSdwbGFxdWUgcGxhcXVlX2Jhbm5lcic+XCIgK1xuICAgIFwiPGRpdiBjbGFzcz0nbmFtZXRhZyc+XCIgK1xuICAgICAgXCI8ZGl2IGNsYXNzPSdwbGF5ZXJfbmFtZSc+XCIgKyBuYW1lICsgXCI8L2Rpdj5cIiArXG4gICAgXCI8L2Rpdj5cIiArXG4gICAgXCI8ZGl2IGNsYXNzPSdiYW5uZXJfbGVmdF9mb2xkJz48L2Rpdj5cIiArXG4gICAgXCI8ZGl2IGNsYXNzPSdiYW5uZXJfbGVmdF9mcmluZ2UnPjwvZGl2PlwiICtcbiAgICBcIjxkaXYgY2xhc3M9J2Jhbm5lcl9yaWdodF9mb2xkJz48L2Rpdj5cIiArXG4gICAgXCI8ZGl2IGNsYXNzPSdiYW5uZXJfcmlnaHRfZnJpbmdlJz48L2Rpdj5cIiArXG4gIFwiPC9kaXY+XCI7XG59O1xuXG5QbGF5ZXJzLnByb3RvdHlwZS5zbGVlcEFsZXJ0ID0gZnVuY3Rpb24oc2xlZXBpbmcpIHtcbiAgY29uc29sZS53YXJuKCdzbGVlcGluZycsIHNsZWVwaW5nKTtcbiAgaWYgKHNsZWVwaW5nKSB7XG4gICAgdXRpbC5hbGVydCh7XG4gICAgICB0ZXh0OiBcIllvdSdyZSBvbiBicmVha1wiLFxuICAgICAgYnV0dG9uVGV4dDogXCJCYWNrIHRvIHRoZSBnYW1lXCIsXG4gICAgICBidXR0b25GdW5jOiAoKSA9PiB0aGlzLmdhbWUucGxheWVyT2JqLmNoaWxkKCdhc2xlZXAnKS5zZXQobnVsbClcbiAgICB9KTtcbiAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQbGF5ZXJzO1xuIiwiXG52YXIgU3RhdGUgPSByZXF1aXJlKCcuL1N0YXRlLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG52YXIgRFVSQVRJT04gPSAzMDAwO1xuXG4vLyBIYW5kbGVzIGNyZWF0aW9uIG9mIHRoZSBsaXN0IG9mIHF1ZXN0aW9ucyBhbmQgdGhlIHBvbGwgcHJvY2Vzc1xuZnVuY3Rpb24gUG9sbChnYW1lKSB7XG4gIHRoaXMuZ2FtZSA9IGdhbWU7XG4gIHRoaXMudGltZXIgPSBuZXcgVGltZXIoKTtcbiAgdGhpcy5zcGlubmVyID0gbmV3IFNwaW5uZXIoKTtcblxuICB0aGlzLnBvbGxPYmogPSB0aGlzLmdhbWUuZ2FtZU9iai5jaGlsZCgncG9sbCcpO1xuXG4gIHRoaXMuY2hvaWNlc0luZm8gPSBudWxsO1xuICB0aGlzLnZvdGVzSW5mbyA9IG51bGw7XG4gIHRoaXMudGltZW91dCA9IG51bGw7XG5cbiAgdGhpcy5jb3VudCA9IHsgYTogMCwgYjogMCwgYzogMCB9O1xuXG4gIHV0aWwuYmluZEZ1bmModGhpcy5wb2xsT2JqLmNoaWxkKCdjaG9pY2VzJyksIHRoaXMub25DaG9pY2VzVXBkYXRlLmJpbmQodGhpcykpO1xuICB1dGlsLmJpbmRGdW5jKHRoaXMucG9sbE9iai5jaGlsZCgnYWxsb3dWb3RpbmcnKSwgdGhpcy5vbkFsbG93Vm90aW5nVXBkYXRlLmJpbmQodGhpcykpO1xuICB1dGlsLmJpbmRGdW5jKHRoaXMucG9sbE9iai5jaGlsZCgndm90ZXMnKSwgdGhpcy5vblZvdGVzVXBkYXRlLmJpbmQodGhpcykpO1xuICB1dGlsLmJpbmRGdW5jKHRoaXMucG9sbE9iai5jaGlsZCgndGltZW91dCcpLCB0aGlzLm9uVGltZW91dENoYW5nZS5iaW5kKHRoaXMpKTtcbiAgdXRpbC5iaW5kRnVuYyh0aGlzLnBvbGxPYmouY2hpbGQoJ3NwaW5uZXInKSwgdGhpcy5vblNwaW5uZXJVcGRhdGUuYmluZCh0aGlzKSk7XG59XG5cblBvbGwucHJvdG90eXBlLm9uQWxsb3dWb3RpbmdVcGRhdGUgPSBmdW5jdGlvbihhbGxvd1ZvdGluZykge1xuICBpZiAoYWxsb3dWb3RpbmcpIHtcbiAgICAkKFwiI2FcIikub24oJ2NsaWNrJywgdGhpcy5vblZvdGUuYmluZCh0aGlzLCAnYScpKTtcbiAgICAkKFwiI2JcIikub24oJ2NsaWNrJywgdGhpcy5vblZvdGUuYmluZCh0aGlzLCAnYicpKTtcbiAgICAkKFwiI2NcIikub24oJ2NsaWNrJywgdGhpcy5vblZvdGUuYmluZCh0aGlzLCAnYycpKTtcbiAgICB0aGlzLnRpbWVyLnNob3coKTtcbiAgfVxuICBlbHNlIHtcbiAgICAkKFwiLmNob2ljZV9jb250YWluZXJcIikub2ZmKCdjbGljaycpO1xuICAgIHRoaXMudGltZXIuaGlkZSgpO1xuICB9XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5waWNrQ2hvaWNlcyA9IGZ1bmN0aW9uKCkge1xuICB2YXIgYWxsUXVlc3Rpb25zID0gdGhpcy5nYW1lLmFwcC5qc29uRGF0YS5xdWVzdGlvbnM7XG4gIHZhciBwaWNrcyA9IHV0aWwucmFuZG9tUGlja3MoYWxsUXVlc3Rpb25zLCAzKTtcbiAgdGhpcy5nYW1lLmdhbWVPYmoudXBkYXRlKHtcbiAgICByZXNwb25zZXM6IG51bGwsXG4gICAgcG9sbDoge1xuICAgICAgYWxsb3dWb3Rpbmc6IHRydWUsXG4gICAgICBjaG9pY2VzOiB7XG4gICAgICAgIGE6IHBpY2tzWzBdLFxuICAgICAgICBiOiBwaWNrc1sxXSxcbiAgICAgICAgYzogcGlja3NbMl1cbiAgICAgIH0sXG4gICAgICB0aW1lb3V0OiAncmVhZHknXG4gICAgfVxuICB9KTtcbn07XG5cblBvbGwucHJvdG90eXBlLm9uQ2hvaWNlc1VwZGF0ZSA9IGZ1bmN0aW9uKGNob2ljZXNJbmZvKSB7XG4gIHRoaXMuY2hvaWNlc0luZm8gPSBjaG9pY2VzSW5mbyB8fCB7fTtcbiAgdXRpbC5mb3JFYWNoKHRoaXMuY2hvaWNlc0luZm8sIChjaG9pY2UsIGxldHRlcikgPT4gJCgnI2Nob2ljZV8nICsgbGV0dGVyKS5odG1sKGNob2ljZSkpO1xuICAvLyBJZiBubyBjaG9pY2VzLCByZW1vdmUgZG9tXG4gIGlmICh1dGlsLnNpemUodGhpcy5jaG9pY2VzSW5mbykgPT09IDApIHtcbiAgICAkKCcuY2hvaWNlJykuZWFjaCgoaSwgbWF0Y2gpID0+IHtcbiAgICAgIG1hdGNoLmlubmVySFRNTCA9IFwiXCI7XG4gICAgfSk7XG4gIH1cbiAgdGhpcy5oYXNWb3RlZCA9IGZhbHNlO1xufTtcblxuUG9sbC5wcm90b3R5cGUub25Wb3Rlc1VwZGF0ZSA9IGZ1bmN0aW9uKHZvdGVzSW5mbykge1xuICAvLyBCdWlsZCBhbGwgbWFya2VycyB0byBpbmRpY2F0ZSB2b3RlcnNcbiAgLy8gVE9ETzogQ3VycmVudGx5IGJ1aWxkcyBhbGwgZnJvbSBzY3JhdGNoIG9uIGFueSBjaGFuZ2VcbiAgdGhpcy52b3Rlc0luZm8gPSB2b3Rlc0luZm8gfHwge307XG4gIHRoaXMuY291bnQgPSB7IGE6IDAsIGI6IDAsIGM6IDAgfTtcbiAgdXRpbC5mb3JFYWNoKHRoaXMudm90ZXNJbmZvLCB2b3RlRGF0YSA9PiB0aGlzLmNvdW50W3ZvdGVEYXRhLnZvdGVdKyspO1xuXG4gIHZhciBudW1Wb3RlcnMgPSB1dGlsLnNpemUodGhpcy52b3Rlc0luZm8pO1xuXG4gIC8vIElmIG5vIG9uZSBoYXMgdm90ZWQgKGluaXRpYWwgc3RhdGUpLCBjbGVhciB2b3RlIGNvdW50c1xuICBpZiAobnVtVm90ZXJzID09PSAwKSB7XG4gICAgJCgnLnZvdGVycycpLmVhY2goKGksIG1hdGNoKSA9PiBtYXRjaC5pbm5lckhUTUwgPSBcIlwiKTtcbiAgfVxuICAvLyBJZiBzb21lb25lIHZvdGVkLCBhbmQgaXQgaXNuJ3QgYWxyZWFkeSBzZXQsIHNldCB0aGUgdGltZW91dC5cbiAgaWYgKG51bVZvdGVycyA+IDApIHtcbiAgICB0aGlzLnBvbGxPYmouY2hpbGQoJ3RpbWVvdXQnKS50cmFuc2FjdGlvbihjdXJyVGltZW91dCA9PiB7XG4gICAgICByZXR1cm4gY3VyclRpbWVvdXQgPT09ICdyZWFkeScgPyBEYXRlLm5vdygpICsgRFVSQVRJT04gOiB1bmRlZmluZWQ7XG4gICAgfSk7XG4gIH1cbiAgLy8gSWYgZXZlcnlvbmUgdm90ZWQsIHBpY2sgcXVlc3Rpb24gYW5kIGNoYW5nZSBzdGF0ZSB0byByZXNwb25kLlxuICBjb25zb2xlLndhcm4oJ2F3YWtlQ291bnQnLCBudW1Wb3RlcnMsIHRoaXMuZ2FtZS5wbGF5ZXJzLmF3YWtlQ291bnQoKSk7XG4gIGlmIChudW1Wb3RlcnMgPT09IHRoaXMuZ2FtZS5wbGF5ZXJzLmF3YWtlQ291bnQoKSkge1xuICAgIHRoaXMudGltZXIuc3RvcCgpO1xuICB9XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5vblRpbWVvdXRDaGFuZ2UgPSBmdW5jdGlvbih0aW1lb3V0KSB7XG4gIHRoaXMudGltZW91dCA9IHRpbWVvdXQ7XG4gIGlmICh0eXBlb2YgdGltZW91dCA9PT0gJ251bWJlcicpIHtcbiAgICB0aGlzLnRpbWVyLnN0YXJ0KHRpbWVvdXQsICgpID0+IHtcbiAgICAgIGlmICh0aGlzLmdhbWUuaXNIb3N0KSB7XG4gICAgICAgIHRoaXMucGlja1dpbm5lcigpO1xuICAgICAgfVxuICAgIH0pO1xuICB9XG59O1xuXG5Qb2xsLnByb3RvdHlwZS5vblZvdGUgPSBmdW5jdGlvbihjaG9pY2UpIHtcbiAgdmFyIHBlcnNvbmFsVm90ZSA9IHV0aWwuZmluZChPYmplY3Qua2V5cyh0aGlzLnZvdGVzSW5mbyksIHZvdGVLZXkgPT4ge1xuICAgIHJldHVybiB0aGlzLnZvdGVzSW5mb1t2b3RlS2V5XS5wbGF5ZXJLZXkgPT09IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCk7XG4gIH0pO1xuICBpZiAocGVyc29uYWxWb3RlKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMucG9sbE9iai5jaGlsZCgndm90ZXMnKS5wdXNoKHtcbiAgICBuYW1lOiB0aGlzLmdhbWUucGxheWVyTmFtZSxcbiAgICBwbGF5ZXJLZXk6IHRoaXMuZ2FtZS5wbGF5ZXJPYmoua2V5KCksXG4gICAgdm90ZTogY2hvaWNlXG4gIH0pO1xuICB0aGlzLmdhbWUucGxheWVyT2JqLmNoaWxkKCd2b3RlJykuc2V0KGNob2ljZSk7XG59O1xuXG4vLyBPbmx5IGNhbGxlZCBieSBob3N0XG5Qb2xsLnByb3RvdHlwZS5waWNrV2lubmVyID0gZnVuY3Rpb24oKSB7XG4gIHZhciBtYXhWb3RlcyA9IE1hdGgubWF4LmFwcGx5KG51bGwsIHV0aWwudmFsdWVzKHRoaXMuY291bnQpKTtcbiAgdmFyIGZpbmFsaXN0cyA9IE9iamVjdC5rZXlzKHRoaXMuY291bnQpLmZpbHRlcihjaG9pY2UgPT4ge1xuICAgIHJldHVybiB0aGlzLmNvdW50W2Nob2ljZV0gPT09IG1heFZvdGVzO1xuICB9KTtcbiAgaWYgKGZpbmFsaXN0cy5sZW5ndGggPiAxKSB7XG4gICAgdGhpcy5wb2xsT2JqLmNoaWxkKCdzcGlubmVyJykudXBkYXRlKHtcbiAgICAgIGNob2ljZXM6IGZpbmFsaXN0cy5qb2luKCcnKSxcbiAgICAgIHNlcXVlbmNlOiBTcGlubmVyLnJhbmRvbVNlcXVlbmNlKCksXG4gICAgICBzdGFydEluZGV4OiBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkgKiBmaW5hbGlzdHMubGVuZ3RoKVxuICAgIH0pO1xuICB9XG4gIGVsc2Uge1xuICAgIHRoaXMuc3VibWl0V2lubmVyKGZpbmFsaXN0c1swXSk7XG4gIH1cbn07XG5cblBvbGwucHJvdG90eXBlLm9uU3Bpbm5lclVwZGF0ZSA9IGZ1bmN0aW9uKHNwaW5PYmopIHtcbiAgaWYgKHNwaW5PYmogJiYgc3Bpbk9iai5zZXF1ZW5jZSkge1xuICAgIHRoaXMuc3Bpbm5lci5zdGFydChzcGluT2JqLmNob2ljZXMsIHNwaW5PYmouc2VxdWVuY2UsIHNwaW5PYmouc3RhcnRJbmRleCwgaXRlbSA9PiB7XG4gICAgICBpZiAodGhpcy5nYW1lLmlzSG9zdCkge1xuICAgICAgICB0aGlzLnN1Ym1pdFdpbm5lcihpdGVtKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufTtcblxuLy8gT25seSBjYWxsZWQgYnkgaG9zdFxuUG9sbC5wcm90b3R5cGUuc3VibWl0V2lubmVyID0gZnVuY3Rpb24od2lubmVyKSB7XG4gIHRoaXMuZ2FtZS5nYW1lT2JqLnVwZGF0ZSh7XG4gICAgcXVlc3Rpb246IHdpbm5lcixcbiAgICBzdGF0ZTogU3RhdGUuUkVTUE9ORCxcbiAgfSk7XG59O1xuXG4vLyBBIHNpbXBsZSBjb3VudGRvd24gdGltZXJcbmZ1bmN0aW9uIFRpbWVyKCkge1xuICB0aGlzLmludGVydmFsSWQgPSBudWxsO1xuICB0aGlzLmlzUnVubmluZyA9IGZhbHNlO1xuICB0aGlzLnN0b3BDYWxsYmFjayA9ICgpID0+IHt9O1xufVxuXG5UaW1lci5wcm90b3R5cGUuc3RhcnQgPSBmdW5jdGlvbih0aW1lb3V0LCBzdG9wQ2FsbGJhY2spIHtcbiAgaWYgKHRoaXMuaXNSdW5uaW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuaXNSdW5uaW5nID0gdHJ1ZTtcbiAgdGhpcy5zdG9wQ2FsbGJhY2sgPSBzdG9wQ2FsbGJhY2s7XG4gIHRoaXMuaW50ZXJ2YWxJZCA9IHdpbmRvdy5zZXRJbnRlcnZhbCh0aGlzLmJ1aWxkRG9tLmJpbmQodGhpcyksIDEwLCB0aW1lb3V0KTtcbn07XG5cblRpbWVyLnByb3RvdHlwZS5idWlsZERvbSA9IGZ1bmN0aW9uKHRpbWVvdXQpIHtcbiAgdmFyIHRpbWVMZWZ0ID0gdGltZW91dCAtIERhdGUubm93KCk7XG4gIHZhciBoYWxmID0gRFVSQVRJT04gLyAyO1xuICB2YXIgZnJhYztcbiAgdmFyIGRlZztcbiAgaWYgKHRpbWVMZWZ0ID4gaGFsZikge1xuICAgICQoJy5tYXNrX3NsaWNlJykuaGlkZSgpO1xuICAgICQoJy5zbGljZScpLnNob3coKTtcbiAgICAvLyBTbGljZSBnb2VzIDkwZGVnIC0+IDI3MGRlZ1xuICAgIGZyYWMgPSAxIC0gKCh0aW1lTGVmdCAtIGhhbGYpIC8gaGFsZik7XG4gICAgZGVnID0gKGZyYWMgKiAxODApO1xuICAgICQoJy5zbGljZScpLmNzcygndHJhbnNmb3JtJywgJ3JvdGF0ZSgnICsgZGVnICsgJ2RlZyknKTtcbiAgfVxuICBlbHNlIGlmICh0aW1lTGVmdCA8IGhhbGYgJiYgdGltZUxlZnQgPiAwKSB7XG4gICAgJCgnLnNsaWNlJykuaGlkZSgpO1xuICAgICQoJy5tYXNrX3NsaWNlJykuc2hvdygpO1xuICAgIGZyYWMgPSAxIC0gKHRpbWVMZWZ0IC8gaGFsZik7XG4gICAgZGVnID0gKGZyYWMgKiAxODApO1xuICAgICQoJy5tYXNrX3NsaWNlJykuY3NzKCd0cmFuc2Zvcm0nLCAncm90YXRlKCcgKyBkZWcgKyAnZGVnKScpO1xuICB9XG4gIGVsc2Uge1xuICAgIHRoaXMuc3RvcCgpO1xuICB9XG59O1xuXG5UaW1lci5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKCkge1xuICB3aW5kb3cuY2xlYXJJbnRlcnZhbCh0aGlzLmludGVydmFsSWQpO1xuICB0aGlzLmlzUnVubmluZyA9IGZhbHNlO1xuICB0aGlzLnN0b3BDYWxsYmFjaygpO1xufTtcblxuVGltZXIucHJvdG90eXBlLnNob3cgPSBmdW5jdGlvbigpIHtcbiAgJCgnLnRpbWVyJykuc2hvdygpO1xuICAkKCcuc2xpY2UnKS5jc3MoJ3RyYW5zZm9ybScsICdyb3RhdGUoMGRlZyknKTtcbiAgJCgnLnNsaWNlJykuc2hvdygpO1xuICAkKCcubWFza19zbGljZScpLmhpZGUoKTtcbn07XG5cblRpbWVyLnByb3RvdHlwZS5oaWRlID0gZnVuY3Rpb24oKSB7XG4gICQoJy50aW1lcicpLmhpZGUoKTtcbn07XG5cblxuLy8gQSByYW5kb20gc2VsZWN0aW9uIHNwaW5uZXJcbmZ1bmN0aW9uIFNwaW5uZXIoKSB7XG4gIHRoaXMuaW50ZXJ2YWxJZCA9IG51bGw7XG4gIHRoaXMuaXNSdW5uaW5nID0gZmFsc2U7XG4gIHRoaXMuc3RvcENhbGxiYWNrID0gKCkgPT4ge307XG59XG5cblNwaW5uZXIucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24oY2hvaWNlcywgc2VxLCBzdGFydEluZGV4LCBzdG9wQ2FsbGJhY2spIHtcbiAgaWYgKHRoaXMuaXNSdW5uaW5nKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIHRoaXMuaXNSdW5uaW5nID0gdHJ1ZTtcbiAgdGhpcy5zdG9wQ2FsbGJhY2sgPSBzdG9wQ2FsbGJhY2s7XG4gIHRoaXMuaW50ZXJ2YWxJZCA9IHdpbmRvdy5zZXRJbnRlcnZhbChcbiAgICB0aGlzLmJ1aWxkRG9tLmJpbmQodGhpcyksIDEwLCBjaG9pY2VzLCBzZXEsIHN0YXJ0SW5kZXhcbiAgKTtcbn07XG5cblNwaW5uZXIucHJvdG90eXBlLmJ1aWxkRG9tID0gZnVuY3Rpb24oY2hvaWNlcywgc2VxLCBzdGFydEluZGV4KSB7XG4gIHZhciBub3cgPSBEYXRlLm5vdygpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHNlcS5sZW5ndGggLSAxOyBpKyspIHtcbiAgICBpZiAobm93ID49IHNlcVtpXSAmJiBub3cgPCBzZXFbaSArIDFdKSB7XG4gICAgICB2YXIgcGljayA9IGNob2ljZXNbKHN0YXJ0SW5kZXggKyBpKSAlIGNob2ljZXMubGVuZ3RoXTtcbiAgICAgICQoJy5jaG9pY2VfY29udGFpbmVyJykucmVtb3ZlQ2xhc3MoJ3NlbGVjdGVkJyk7XG4gICAgICAkKCcjJyArIHBpY2spLmFkZENsYXNzKCdzZWxlY3RlZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuICBpZiAobm93ID49IHNlcVtzZXEubGVuZ3RoIC0gMV0pIHtcbiAgICB0aGlzLnN0b3AoY2hvaWNlc1soc3RhcnRJbmRleCArIHNlcS5sZW5ndGggLSAyKSAlIGNob2ljZXMubGVuZ3RoXSk7XG4gIH1cbn07XG5cblNwaW5uZXIucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbih3aW5uZXIpIHtcbiAgd2luZG93LmNsZWFySW50ZXJ2YWwodGhpcy5pbnRlcnZhbElkKTtcbiAgdGhpcy5pc1J1bm5pbmcgPSBmYWxzZTtcbiAgdGhpcy5zdG9wQ2FsbGJhY2sod2lubmVyKTtcbn07XG5cbi8vIEdlbmVyYXRlcyBhIHJhbmRvbSBzZXF1ZW5jZSB0aGF0IGlzIGRlbGF5ZWQgb3ZlciB0aW1lXG5TcGlubmVyLnJhbmRvbVNlcXVlbmNlID0gZnVuY3Rpb24oKSB7XG4gIC8vIFNlcXVlbmNlcyBvZiB0aW1lIHZhbHVlcyBvbiB3aGljaCB0byBjaGFuZ2Ugc2VsZWN0aW9uXG4gIHZhciBzZXEgPSBbXTtcbiAgdmFyIHRpbWUgPSBEYXRlLm5vdygpO1xuICB2YXIgZGVsYXkgPSA1MDtcbiAgd2hpbGUgKGRlbGF5IDwgODAwICsgKE1hdGgucmFuZG9tKCkgKiAxMDApKSB7XG4gICAgc2VxLnB1c2godGltZSk7XG4gICAgdGltZSArPSBkZWxheTtcbiAgICBkZWxheSAqPSAxLjIgKyAoTWF0aC5yYW5kb20oKSAqIDAuMDUpO1xuICB9XG4gIHNlcS5wdXNoKHRpbWUpO1xuICByZXR1cm4gc2VxO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQb2xsO1xuIiwiXG52YXIgU3RhdGUgPSByZXF1aXJlKCcuL1N0YXRlLmpzJyk7XG52YXIgdXRpbCA9IHJlcXVpcmUoJy4vdXRpbC5qcycpO1xuXG4vLyBIYW5kbGVzIGNyZWF0aW9uIGFuZCBjcm9zc2luZyBvdXQgb2YgdGhlIGxpc3Qgb2YgcmVzcG9uc2VzXG5mdW5jdGlvbiBSZXNwb25zZXMoZ2FtZSkge1xuICB0aGlzLmdhbWUgPSBnYW1lO1xuXG4gIHRoaXMucmVzcG9uc2VzSW5mbyA9IG51bGw7XG4gIHRoaXMucmVzcG9uc2VPcmRlciA9IFtdO1xuXG4gIHV0aWwuYmluZEZ1bmModGhpcy5nYW1lLmdhbWVPYmouY2hpbGQoJ3Jlc3BvbnNlcycpLCB0aGlzLm9uUmVzcG9uc2VzVXBkYXRlLmJpbmQodGhpcykpO1xufVxuXG5SZXNwb25zZXMucHJvdG90eXBlLmNvdW50ID0gZnVuY3Rpb24oKSB7XG4gIHJldHVybiB1dGlsLnNpemUodGhpcy5yZXNwb25zZXNJbmZvKTtcbn07XG5cblJlc3BvbnNlcy5wcm90b3R5cGUub25SZXNwb25zZXNVcGRhdGUgPSBmdW5jdGlvbihyZXNwb25zZXNJbmZvKSB7XG4gIC8vIENyZWF0ZSBhIEpTIG1hcCBmcm9tIHJlc3BvbnNlcyBmb3IgYWNjZXNzIHRvIGZvckVhY2gsIHNpemVcbiAgdGhpcy5yZXNwb25zZXNJbmZvID0gcmVzcG9uc2VzSW5mbyB8fCB7fTtcbiAgY29uc29sZS53YXJuKCdvblJlc3BvbnNlc1VwZGF0ZScsIHRoaXMucmVzcG9uc2VzSW5mbyk7XG5cbiAgLy8gSWYgdGhlcmUgYXJlIG5vIHJlc3BvbnNlcyBpbiB0aGUgZGF0YWJhc2UsIHJlbW92ZVxuICBpZiAodXRpbC5zaXplKHRoaXMucmVzcG9uc2VzSW5mbykgPT09IDApIHtcbiAgICB0aGlzLnJlc3BvbnNlT3JkZXIgPSBbXTtcbiAgICAkKFwiI3Jlc3BvbnNlc1wiKS5jc3MoJ2ZsZXgtZ3JvdycsICcwJyk7XG4gICAgJCgnI3Jlc3BvbnNlcycpLmh0bWwoXCJcIik7XG4gIH1cblxuICB1dGlsLmZvckVhY2godGhpcy5yZXNwb25zZXNJbmZvLCAodmFsLCBrZXkpID0+IHtcbiAgICAvLyBJZiBrZXkgaXNuJ3QgaW4gcmVzcG9uc2VPcmRlciwgYW5kIGl0YHMgcmVhZHksIGFkZCBpdCByYW5kb21seVxuICAgIGlmICghdXRpbC5jb250YWlucyh0aGlzLnJlc3BvbnNlT3JkZXIsIGtleSkgJiYga2V5IGluIHRoaXMucmVzcG9uc2VzSW5mbykge1xuICAgICAgdXRpbC5yYW5kb21JbnNlcnQodGhpcy5yZXNwb25zZU9yZGVyLCBrZXkpO1xuICAgIH1cbiAgfSk7XG4gIC8vIElmIGV2ZXJ5b25lIGhhcyByZXNwb25kZWQsIGNoYW5nZSB0byBndWVzcyBzdGF0ZVxuICBpZiAodGhpcy5jb3VudCgpID09PSB0aGlzLmdhbWUucGxheWVycy5hd2FrZUNvdW50KCkpIHtcbiAgICB0aGlzLmdhbWUuZ2FtZU9iai5jaGlsZCgnc3RhdGUnKS5zZXQoU3RhdGUuR1VFU1MpO1xuICB9XG4gIC8vIElmIGd1ZXNzIHN0YXRlLCBzaG93IHJlc3BvbnNlc1xuICBpZiAodGhpcy5nYW1lLnN0YXRlID09PSBTdGF0ZS5HVUVTUykge1xuICAgIHRoaXMudXBkYXRlUmVzcG9uc2VEb20oKTtcbiAgfVxufTtcblxuUmVzcG9uc2VzLnByb3RvdHlwZS51cGRhdGVSZXNwb25zZURvbSA9IGZ1bmN0aW9uKCkge1xuICBjb25zb2xlLndhcm4oJ3VwZGF0aW5nIHJlc3BvbnNlIGRvbScsIHRoaXMucmVzcG9uc2VPcmRlcik7XG4gIC8vIEJ1aWxkIGFsbCByZXNwb25zZXMgZnJvbSByZXNwb25zZU9yZGVyIGFycmF5XG4gIC8vIFRPRE86IEN1cnJlbnRseSBhbHdheXMgZnJvbSBzY3JhdGNoXG4gIHZhciByZXNwb25zZXMgPSB0aGlzLnJlc3BvbnNlT3JkZXIubWFwKHBsYXllcktleSA9PiB7XG4gICAgY29uc29sZS53YXJuKCdyZXNwb25zZXNJbmZvJywgdGhpcy5yZXNwb25zZXNJbmZvLCAncGxheWVyS2V5JywgcGxheWVyS2V5KTtcbiAgICB2YXIgcGxheWVyUmVzcG9uc2UgPSB0aGlzLnJlc3BvbnNlc0luZm9bcGxheWVyS2V5XTtcbiAgICByZXR1cm4gYnVpbGRSZXNwb25zZURvbShwbGF5ZXJSZXNwb25zZS5yZXNwb25zZSwgcGxheWVyUmVzcG9uc2UuZWxpbWluYXRlZCk7XG4gIH0pO1xuICAkKFwiI3Jlc3BvbnNlc1wiKS5odG1sKHJlc3BvbnNlcyk7XG4gICQoXCIjcmVzcG9uc2VzXCIpLmNzcygnZmxleC1ncm93JywgJzEnKTtcbn07XG5cbi8vIFJldHVybnMgYSBzaW5nbGUgaW5zdGFuY2Ugb2YgYSByZXNwb25zZSBET00gaXRlbVxuZnVuY3Rpb24gYnVpbGRSZXNwb25zZURvbShyZXNwb25zZSwgZWxpbWluYXRlZCkge1xuICBlbGltaW5hdGVkID0gZWxpbWluYXRlZCA/IFwiZWxpbWluYXRlZFwiIDogXCJcIjtcbiAgcmV0dXJuIFwiPGRpdiBjbGFzcz0ncmVzcG9uc2UnPlwiICtcbiAgICAgIFwiPGRpdiBjbGFzcz0ncmVzcG9uc2VfcXVvdGVzJz5cIiArXG4gICAgICAgIFwiPGRpdiBjbGFzcz0ncmVzcG9uc2VfY29udGVudCBcIitlbGltaW5hdGVkK1wiJz5cIiArIHJlc3BvbnNlICsgXCI8L2Rpdj5cIiArXG4gICAgICBcIjwvZGl2PlwiICtcbiAgICBcIjwvZGl2PlwiO1xufVxuXG5tb2R1bGUuZXhwb3J0cyA9IFJlc3BvbnNlcztcbiIsIlxuU3RhdGUgPSB7XG4gIElOSVQ6IDEsXG4gIFBPTEw6IDIsXG4gIFJFU1BPTkQ6IDMsXG4gIEdVRVNTOiA0LFxuICBTQ09SRTogNSxcbiAgUkVDQVA6IDZcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gU3RhdGU7XG4iLCJcbnZhciBBcHAgPSByZXF1aXJlKCcuL0FwcC5qcycpO1xuXG4vLyBUT0RPIEZlYXR1cmVzOlxuXG4vLyBISUdIIFByaW9yaXR5XG4vLyAtIFJlcG9ydCBndWVzc2VkIGZvciBhbnkgcmVzcG9uc2UgKGhvc3QpXG4vLyAtIEFkZCBpY29ucyBldmVyeXdoZXJlXG4vLyAtIFNwZWVjaCBidWJibGVzXG4vLyAtIFNldCB1cCB3YXRjaGluZyBtb2RlXG4vLyAtIFBsYXllcnMgam9pbmluZyBzdGF0ZSAocHJlLWluaXQpXG4vLyAtIE5ldyByb3VuZCBzb21ldGltZXMgZG9lc24ndCBwaWNrIHF1ZXN0aW9uc1xuLy8gLSBJZiBudW1iZXIgb2Ygc2xlZXBpbmcgcGVvcGxlIGNoYW5nZSwgcmUtY2hlY2sgcmVxdWlyZW1lbnRzIGZvciByZXNwb25zZSgvdm90aW5nKVxuXG4vLyBCdWdzOlxuLy8gLSBGaXggd2Fsa2luZyBhbmltYXRpb25cbi8vIC0gQWxsIHBsYXllcnMgc2VlIHNjb3JpbmcgY3VycmVudGx5XG4vLyAtIE1vcmUgYnV0dG9ucyBhcmUgdmlzaWJsZSB0aGFuIHNob3VsZCBiZSBvbiBjZXJ0YWluIHJlZnJlc2hlc1xuXG4vLyBNRURJVU0gUHJpb3JpdHlcbi8vIC0gR2V0IG1vcmUgcXVlc3Rpb25zIGFuZCBmaWx0ZXIgb3V0IGJhZCBvbmVzXG4vLyAtIEFkZCBtb3JlIGZyYW1lIHNoYXBlcyAoY2lyY2xlKVxuLy8gLSBTbW9vdGggdHJhbnNpdGlvbnNcblxuLy8gQnVnczpcbi8vIC0gTWFrZSBmcmFtZXMgZGlzYXBwZWFyIGFmdGVyIHNvbWVvbmUgbGVhdmVzIGdhbWVcbi8vIC0gSGFuZGxlIHNsZWVwaW5nIHBsYXllcnMgbW92aW5nXG5cbi8vIExPVyBQcmlvcml0eSAvIElkZWFzXG4vLyAtIEdhbWVzIGluYWN0aXZlIG1vcmUgdGhhbiAxMmhyIGFyZSByZW1vdmVkIHdoZW4gbG9va2VkIHVwIChhZGQgdGltZXN0YW1wIGdhbWUgYWN0aW9ucylcbi8vIC0gTm90aWZ5IHdoZW4gaG9zdCBpcyBkaXNjb25uZWN0ZWQgKHNpbmNlIGdhbWUgd2lsbCBzdG9wIHJ1bm5pbmcpXG4vLyAtIFZvdGUgY291bnRlcnMgKGljb25zPylcblxuLy8gLSBNYWtlIGJhbm5lcnMgY3VydmVkXG4vLyAtIEFkZCB3aGl0ZSBiYWNrZHJvcCBibG9ja3MgKD8pXG4vLyAtIEFsbG93ICplbGltaW5hdGUgcGxheWVycyB3aGVuIGd1ZXNzZWQqIHNldHRpbmdcblxuJChmdW5jdGlvbigpIHsgbmV3IEFwcCgpOyB9KTtcbiIsIlwidXNlIHN0cmljdFwiOyFmdW5jdGlvbihuLHQpe1widW5kZWZpbmVkXCIhPXR5cGVvZiBtb2R1bGUmJm1vZHVsZS5leHBvcnRzP21vZHVsZS5leHBvcnRzPXQoKTpcImZ1bmN0aW9uXCI9PXR5cGVvZiBkZWZpbmUmJmRlZmluZS5hbWQ/ZGVmaW5lKHQpOndpbmRvd1tuXT10KCl9KFwiYmFzaWNDb250ZXh0XCIsZnVuY3Rpb24oKXt2YXIgbj1udWxsLHQ9XCJpdGVtXCIsZT1cInNlcGFyYXRvclwiLGk9ZnVuY3Rpb24oKXt2YXIgbj1hcmd1bWVudHMubGVuZ3RoPD0wfHx2b2lkIDA9PT1hcmd1bWVudHNbMF0/XCJcIjphcmd1bWVudHNbMF07cmV0dXJuIGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIuYmFzaWNDb250ZXh0IFwiK24pfSxsPWZ1bmN0aW9uKCl7dmFyIG49YXJndW1lbnRzLmxlbmd0aDw9MHx8dm9pZCAwPT09YXJndW1lbnRzWzBdP3t9OmFyZ3VtZW50c1swXSxpPTA9PT1PYmplY3Qua2V5cyhuKS5sZW5ndGg/ITA6ITE7cmV0dXJuIGk9PT0hMCYmKG4udHlwZT1lKSxudWxsPT1uLnR5cGUmJihuLnR5cGU9dCksbnVsbD09bltcImNsYXNzXCJdJiYobltcImNsYXNzXCJdPVwiXCIpLG4udmlzaWJsZSE9PSExJiYobi52aXNpYmxlPSEwKSxudWxsPT1uLmljb24mJihuLmljb249bnVsbCksbnVsbD09bi50aXRsZSYmKG4udGl0bGU9XCJVbmRlZmluZWRcIiksbi5kaXNhYmxlZCE9PSEwJiYobi5kaXNhYmxlZD0hMSksbi5kaXNhYmxlZD09PSEwJiYobltcImNsYXNzXCJdKz1cIiBiYXNpY0NvbnRleHRfX2l0ZW0tLWRpc2FibGVkXCIpLG51bGw9PW4uZm4mJm4udHlwZSE9PWUmJm4uZGlzYWJsZWQ9PT0hMT8oY29uc29sZS53YXJuKFwiTWlzc2luZyBmbiBmb3IgaXRlbSAnXCIrbi50aXRsZStcIidcIiksITEpOiEwfSxvPWZ1bmN0aW9uKG4saSl7dmFyIG89XCJcIixyPVwiXCI7cmV0dXJuIGwobik9PT0hMT9cIlwiOm4udmlzaWJsZT09PSExP1wiXCI6KG4ubnVtPWksbnVsbCE9PW4uaWNvbiYmKHI9XCI8c3BhbiBjbGFzcz0nYmFzaWNDb250ZXh0X19pY29uIFwiK24uaWNvbitcIic+PC9zcGFuPlwiKSxuLnR5cGU9PT10P289XCJcXG5cdFx0ICAgICAgIDx0ciBjbGFzcz0nYmFzaWNDb250ZXh0X19pdGVtIFwiK25bXCJjbGFzc1wiXStcIic+XFxuXHRcdCAgICAgICAgICAgPHRkIGNsYXNzPSdiYXNpY0NvbnRleHRfX2RhdGEnIGRhdGEtbnVtPSdcIituLm51bStcIic+XCIrcituLnRpdGxlK1wiPC90ZD5cXG5cdFx0ICAgICAgIDwvdHI+XFxuXHRcdCAgICAgICBcIjpuLnR5cGU9PT1lJiYobz1cIlxcblx0XHQgICAgICAgPHRyIGNsYXNzPSdiYXNpY0NvbnRleHRfX2l0ZW0gYmFzaWNDb250ZXh0X19pdGVtLS1zZXBhcmF0b3InPjwvdHI+XFxuXHRcdCAgICAgICBcIiksbyl9LHI9ZnVuY3Rpb24obil7dmFyIHQ9XCJcIjtyZXR1cm4gdCs9XCJcXG5cdCAgICAgICAgPGRpdiBjbGFzcz0nYmFzaWNDb250ZXh0Q29udGFpbmVyJz5cXG5cdCAgICAgICAgICAgIDxkaXYgY2xhc3M9J2Jhc2ljQ29udGV4dCc+XFxuXHQgICAgICAgICAgICAgICAgPHRhYmxlPlxcblx0ICAgICAgICAgICAgICAgICAgICA8dGJvZHk+XFxuXHQgICAgICAgIFwiLG4uZm9yRWFjaChmdW5jdGlvbihuLGUpe3JldHVybiB0Kz1vKG4sZSl9KSx0Kz1cIlxcblx0ICAgICAgICAgICAgICAgICAgICA8L3Rib2R5Plxcblx0ICAgICAgICAgICAgICAgIDwvdGFibGU+XFxuXHQgICAgICAgICAgICA8L2Rpdj5cXG5cdCAgICAgICAgPC9kaXY+XFxuXHQgICAgICAgIFwifSxhPWZ1bmN0aW9uKCl7dmFyIG49YXJndW1lbnRzLmxlbmd0aDw9MHx8dm9pZCAwPT09YXJndW1lbnRzWzBdP3t9OmFyZ3VtZW50c1swXSx0PXt4Om4uY2xpZW50WCx5Om4uY2xpZW50WX07aWYoXCJ0b3VjaGVuZFwiPT09bi50eXBlJiYobnVsbD09dC54fHxudWxsPT10LnkpKXt2YXIgZT1uLmNoYW5nZWRUb3VjaGVzO251bGwhPWUmJmUubGVuZ3RoPjAmJih0Lng9ZVswXS5jbGllbnRYLHQueT1lWzBdLmNsaWVudFkpfXJldHVybihudWxsPT10Lnh8fHQueDwwKSYmKHQueD0wKSwobnVsbD09dC55fHx0Lnk8MCkmJih0Lnk9MCksdH0scz1mdW5jdGlvbihuLHQpe3ZhciBlPWEobiksaT1lLngsbD1lLnksbz17d2lkdGg6d2luZG93LmlubmVyV2lkdGgsaGVpZ2h0OndpbmRvdy5pbm5lckhlaWdodH0scj17d2lkdGg6dC5vZmZzZXRXaWR0aCxoZWlnaHQ6dC5vZmZzZXRIZWlnaHR9O2krci53aWR0aD5vLndpZHRoJiYoaS09aStyLndpZHRoLW8ud2lkdGgpLGwrci5oZWlnaHQ+by5oZWlnaHQmJihsLT1sK3IuaGVpZ2h0LW8uaGVpZ2h0KSxyLmhlaWdodD5vLmhlaWdodCYmKGw9MCx0LmNsYXNzTGlzdC5hZGQoXCJiYXNpY0NvbnRleHQtLXNjcm9sbGFibGVcIikpO3ZhciBzPWUueC1pLHU9ZS55LWw7cmV0dXJue3g6aSx5Omwscng6cyxyeTp1fX0sdT1mdW5jdGlvbigpe3ZhciBuPWFyZ3VtZW50cy5sZW5ndGg8PTB8fHZvaWQgMD09PWFyZ3VtZW50c1swXT97fTphcmd1bWVudHNbMF07cmV0dXJuIG51bGw9PW4uZm4/ITE6bi52aXNpYmxlPT09ITE/ITE6bi5kaXNhYmxlZD09PSEwPyExOihpKFwidGRbZGF0YS1udW09J1wiK24ubnVtK1wiJ11cIikub25jbGljaz1uLmZuLGkoXCJ0ZFtkYXRhLW51bT0nXCIrbi5udW0rXCInXVwiKS5vbmNvbnRleHRtZW51PW4uZm4sITApfSxjPWZ1bmN0aW9uKHQsZSxsLG8pe3ZhciBhPXIodCk7ZG9jdW1lbnQuYm9keS5pbnNlcnRBZGphY2VudEhUTUwoXCJiZWZvcmVlbmRcIixhKSxudWxsPT1uJiYobj1kb2N1bWVudC5ib2R5LnN0eWxlLm92ZXJmbG93LGRvY3VtZW50LmJvZHkuc3R5bGUub3ZlcmZsb3c9XCJoaWRkZW5cIik7dmFyIGM9aSgpLGQ9cyhlLGMpO3JldHVybiBjLnN0eWxlLmxlZnQ9ZC54K1wicHhcIixjLnN0eWxlLnRvcD1kLnkrXCJweFwiLGMuc3R5bGUudHJhbnNmb3JtT3JpZ2luPWQucngrXCJweCBcIitkLnJ5K1wicHhcIixjLnN0eWxlLm9wYWNpdHk9MSxudWxsPT1sJiYobD1mKSxjLnBhcmVudEVsZW1lbnQub25jbGljaz1sLGMucGFyZW50RWxlbWVudC5vbmNvbnRleHRtZW51PWwsdC5mb3JFYWNoKHUpLFwiZnVuY3Rpb25cIj09dHlwZW9mIGUucHJldmVudERlZmF1bHQmJmUucHJldmVudERlZmF1bHQoKSxcImZ1bmN0aW9uXCI9PXR5cGVvZiBlLnN0b3BQcm9wYWdhdGlvbiYmZS5zdG9wUHJvcGFnYXRpb24oKSxcImZ1bmN0aW9uXCI9PXR5cGVvZiBvJiZvKCksITB9LGQ9ZnVuY3Rpb24oKXt2YXIgbj1pKCk7cmV0dXJuIG51bGw9PW58fDA9PT1uLmxlbmd0aD8hMTohMH0sZj1mdW5jdGlvbigpe2lmKGQoKT09PSExKXJldHVybiExO3ZhciB0PWRvY3VtZW50LnF1ZXJ5U2VsZWN0b3IoXCIuYmFzaWNDb250ZXh0Q29udGFpbmVyXCIpO3JldHVybiB0LnBhcmVudEVsZW1lbnQucmVtb3ZlQ2hpbGQodCksbnVsbCE9biYmKGRvY3VtZW50LmJvZHkuc3R5bGUub3ZlcmZsb3c9bixuPW51bGwpLCEwfTtyZXR1cm57SVRFTTp0LFNFUEFSQVRPUjplLHNob3c6Yyx2aXNpYmxlOmQsY2xvc2U6Zn19KTsiLCJcbi8vIEJpbmRzIHRoZSB2YWx1ZSBvZiB4IHRvIHZhbHVlIGF0IGxvY2F0aW9uIGZpcmViYXNlLlxuZXhwb3J0cy5iaW5kVmFsID0gZnVuY3Rpb24oZmlyZWJhc2UsIHgpIHtcbiAgZmlyZWJhc2Uub24oXCJ2YWx1ZVwiLCBzbmFwc2hvdCA9PiB4ID0gc25hcHNob3QudmFsKCkpO1xufTtcblxuLy8gQmluZHMgdGhlIGZ1bmN0aW9uIGYgdG8gdGhlIHZhbHVlIGF0IGxvY2F0aW9uIGZpcmViYXNlLlxuLy8gV2hlbmV2ZXIgdGhlIGZpcmViYXNlIHZhbHVlIGNoYW5nZXMsIGYgaXMgY2FsbGVkIHdpdGggdGhlIG5ldyB2YWx1ZS5cbmV4cG9ydHMuYmluZEZ1bmMgPSBmdW5jdGlvbihmaXJlYmFzZSwgZikge1xuICBmaXJlYmFzZS5vbihcInZhbHVlXCIsIHNuYXBzaG90ID0+IGYoc25hcHNob3QudmFsKCkpKTtcbn07XG5cbi8vIFJldHVybnMgYSByYW5kb20gZWxlbWVudCBvZiB0aGUgYXJyYXkuXG5leHBvcnRzLnJhbmRvbVBpY2sgPSBmdW5jdGlvbihhcnJheSkge1xuICByZXR1cm4gYXJyYXlbTWF0aC5mbG9vcihNYXRoLnJhbmRvbSgpKmFycmF5Lmxlbmd0aCldO1xufTtcblxuLy8gUmV0dXJucyBhbiBhcnJheSBvZiB1bmlxdWUgcmFuZG9tIGVsZW1lbnRzIG9mIGFuIGFycmF5LlxuZXhwb3J0cy5yYW5kb21QaWNrcyA9IGZ1bmN0aW9uKGFycmF5LCBuKSB7XG4gIGFycmF5ID0gYXJyYXkuc2xpY2UoKTsgLy8gQ2xvbmUgYXJyYXkgc28gYXMgbm90IHRvIG11dGF0ZSBpdC5cbiAgdmFyIHBpY2tzID0gW107XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgYXJyYXkubGVuZ3RoICYmIGkgPCBuOyBpKyspIHtcbiAgICB2YXIgaW5kZXggPSBNYXRoLmZsb29yKE1hdGgucmFuZG9tKCkqYXJyYXkubGVuZ3RoKTtcbiAgICBwaWNrcy5wdXNoKGFycmF5LnNwbGljZShpbmRleCwgMSlbMF0pO1xuICB9XG4gIHJldHVybiBwaWNrcztcbn07XG5cbi8vIEluc2VydHMgaXRlbSBpbnRvIGFycmF5IGF0IGEgcmFuZG9tIGxvY2F0aW9uLlxuLy8gUmV0dXJucyB0aGUgYXJyYXkgZm9yIGNvbnZlbmllbmNlLlxuZXhwb3J0cy5yYW5kb21JbnNlcnQgPSBmdW5jdGlvbihhcnJheSwgaXRlbSkge1xuICB2YXIgc3BsaWNlSW5kZXggPSBNYXRoLmZsb29yKChhcnJheS5sZW5ndGgrMSkqTWF0aC5yYW5kb20oKSk7XG4gIGFycmF5LnNwbGljZShzcGxpY2VJbmRleCwgMCwgaXRlbSk7XG59O1xuXG4vLyBPYmplY3QgZm9yRWFjaCwgY2FsbHMgZnVuYyB3aXRoICh2YWwsIGtleSlcbmV4cG9ydHMuZm9yRWFjaCA9IGZ1bmN0aW9uKG9iaiwgZnVuYykge1xuICBPYmplY3Qua2V5cyhvYmopLmZvckVhY2goa2V5ID0+IGZ1bmMob2JqW2tleV0sIGtleSkpO1xufTtcblxuZXhwb3J0cy5zaXplID0gZnVuY3Rpb24ob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLmxlbmd0aDtcbn07XG5cbmV4cG9ydHMudmFsdWVzID0gZnVuY3Rpb24ob2JqKSB7XG4gIHJldHVybiBPYmplY3Qua2V5cyhvYmopLm1hcChrZXkgPT4ge1xuICAgIHJldHVybiBvYmpba2V5XTtcbiAgfSk7XG59O1xuXG5leHBvcnRzLmZpbmQgPSBmdW5jdGlvbihhcnIsIGNvbmQpIHtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnIubGVuZ3RoOyBpKyspIHtcbiAgICBpZiAoY29uZChhcnJbaV0pKSB7XG4gICAgICByZXR1cm4gYXJyW2ldO1xuICAgIH1cbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuZXhwb3J0cy5jb250YWlucyA9IGZ1bmN0aW9uKGFyciwgaXRlbSkge1xuICByZXR1cm4gYXJyLmluZGV4T2YoaXRlbSkgIT09IC0xO1xufTtcblxuLy8gT3B0aW9ucyBzaG91bGQgaGF2ZSB0aGUgZm9sbG93aW5nIHByb3BlcnRpZXM6XG4vLyB0ZXh0IC0gbWFpbiB0ZXh0IGNvbnRlbnRcbi8vIGJ1dHRvblRleHQgLSBidXR0b24gdGl0bGVcbi8vIGJ1dHRvbkZ1bmMgLSBidXR0b24gZXhlY3V0ZSBmdW5jdGlvblxuZXhwb3J0cy5hbGVydCA9IGZ1bmN0aW9uKG9wdGlvbnMpIHtcbiAgY29uc29sZS53YXJuKCdBTEVSVCcpO1xuICB2YXIgZG9tID0gXCI8ZGl2IGNsYXNzPSdhbGVydCc+XCIgK1xuICAgIFwiPGRpdiBjbGFzcz0nYWxlcnRfdGV4dCc+XCIgKyBvcHRpb25zLnRleHQgKyBcIjwvZGl2PlwiICtcbiAgICBcIjxidXR0b24gY2xhc3M9J2FsZXJ0X2J1dHRvbicgdHlwZT0nYnV0dG9uJz5cIiArIG9wdGlvbnMuYnV0dG9uVGV4dCArIFwiPC9idXR0b24+XCIgK1xuICBcIjwvZGl2PlwiO1xuICAkKCcjZ2FtZV9jb250ZW50JykuaGlkZSgpO1xuICAkKCdib2R5JykucHJlcGVuZChkb20pO1xuICAkKCcuYWxlcnRfYnV0dG9uJykub24oJ2NsaWNrJywgKCkgPT4ge1xuICAgICQoJy5hbGVydCcpLnJlbW92ZSgpO1xuICAgICQoJyNnYW1lX2NvbnRlbnQnKS5zaG93KCk7XG4gICAgb3B0aW9ucy5idXR0b25GdW5jKCk7XG4gIH0pO1xufTtcbiJdfQ==
