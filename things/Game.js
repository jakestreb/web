
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
