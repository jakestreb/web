
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

  this.gameName = null;
  this.playerName = null;
  this.isHost = null;

  this.state = ko.fireObservable(this.gameObj.child('state'));
  this.round = ko.fireObservable(this.gameObj.child('round'));

  this.question = ko.fireObservable(this.gameObj.child('question'));

  this.guessed = ko.fireObservable(this.playerObj.child('guessed'));
  this.responded = ko.fireObservable(this.playerObj.child('responded'));

  // Show prompt computeds
  this.showGuessedButton = ko.computed(() => {
    return !this.guessed() && this.state() === State.GUESS;
  });
  this.showCompleteButton = ko.computed(() => {
    return this.state() === State.GUESS && this.isHost;
  });
  this.showSubmitPrompt = ko.computed(() => {
    return !this.responded() && this.state() === State.RESPOND;
  });

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
    // util.bindFunc(this.gameObj.child('scoring'), this.onScoringUpdate.bind(this));
    ko.applyBindings(this, $('#game_content').get(0));
    if (this.state() === State.INIT) {
      this.onStateChange(State.INIT);
    }
  });

  this.state.subscribe(newState => this.onStateChange(newState));
}

Game.prototype.buildDom = function() {
  console.warn('building game');
  var loadBody = $.Deferred();
  $(document.body).load('game.html', () => loadBody.resolve());
  return loadBody.promise().then(() => {
    // Apply knockout bindings to loaded content
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

  switch (newState) {
    case State.INIT:
      this.playerObj.update({
        guessed: null,
        responded: null,
        vote: null,
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
      this.playerObj.update({
        responded: false
      });
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
  var res = this.gameObj.child('responses').push({
    playerKey: this.playerObj.key(),
    response: input,
    eliminated: false
  });
  this.gameObj.child('responses').child(res.key()).setPriority(Math.random());
};

Game.prototype.onGuessed = function(playerKey) {
  this.gameObj.child('players').child(playerKey).child('guessed').set(true);
  // Look into responsesInfo, find your response and eliminate it
  this.responses.responses().forEach(response => {
    if (response.playerKey === playerKey) {
      this.gameObj.child('responses').child(response.key).child('eliminated').set(true);
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
// Game.prototype.onScoringUpdate = function(scoring) {
//   if (scoring) {
//     $('#guessed_container').hide();
//     $('#scoring_container').show();
//     $('#set_scores').show();
//     $('#next_round').hide();
//     $('.score_adjuster').show();
//     $('.minus').off('click');
//     $('.plus').off('click');
//     $('.minus').click(event => {
//       var adj = $(event.target).siblings('.score_adjustment');
//       var newAdjVal = parseInt(adj.html(), 10) - 1;
//       adj.html(newAdjVal);
//     });
//     $('.plus').click(event => {
//       var adj = $(event.target).siblings('.score_adjustment');
//       var newAdjVal = parseInt(adj.html(), 10) + 1;
//       adj.html(newAdjVal);
//     });
//   }
//   else if (scoring === false) {
//     $('#scoring_container').show();
//     $('#set_scores').hide();
//     $('#next_round').show();
//     $('.score_adjuster').hide();
//   }
//   else {
//     $('#scoring_container').hide();
//   }
// };

module.exports = Game;
