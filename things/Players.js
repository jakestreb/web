
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
