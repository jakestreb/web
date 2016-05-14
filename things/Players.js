
var ko = require('./koFire.js');
var basicContext = require('basiccontext');
var State = require('./State.js');
var util = require('./util.js');

var NUM_FRAMES = 15; // number of different frames before repeats
var FRAME_TYPES = ['frame_oval', 'frame_square', 'frame_rect'];

// Handles creation and maintenance of the list of players
function Players(game) {
  var self = this;
  this.game = game;
  this.gameObj = game.gameObj;

  this.framesString = "";
  this.gameObj.child('frames').once('value', function(snap) { return self.framesString = snap.val(); });

  this.numPlayers = ko.fireObservable(this.gameObj.child('numPlayers'));
  this.numSleeping = ko.fireObservable(this.gameObj.child('numSleeping'));

  // Briefly set to true whenever a rank change occurs. Observable only useful for subscription.
  this.rankChange = ko.fireObservable(this.gameObj.child('rankChange'));

  this.color = ko.fireObservable(this.game.playerObj.child('color'));

  this.isAsleep = ko.fireObservable(this.game.playerObj.child('asleep'), function(sleeping) {
    if (sleeping) {
      self.sleepAlert();
    }
  });

  // Define frame types observable and create listener to maintain it.
  this.frames = ko.observableArray();

  this.players = ko.fireArrayObservables(this.gameObj.child('players').orderByChild('rank'), function(players) {
    var numPlayers = players.length;
    var numFrames = self.frames().length;
    // Add frames
    while (numFrames < numPlayers) {
      var nextRank = numFrames + 1;
      var player = util.find(players, function(p) { return p.peek().rank === nextRank; });
      self.frames.push(self.buildFrameObj(player, nextRank));
      numFrames++;
    }
    // Remove frames & player dom
    while (numFrames > numPlayers) {
      // Find which player is missing
      for (var r = 1; r <= numFrames; r++) {
        if (!util.find(players, function(p) { return p.peek().rank === r; })) {
          // If there is no player with rank r, remove that player DOM
          if (self.game.isHost()) {
            self.setRanks(r); // Removes player ranked r
          }
          numFrames--;
        }
      }
    }
  });

  this.awakeCount = ko.computed(function() {
    return self.numPlayers() - self.numSleeping();
  });
  // Re-check if responses are all in if awakeCount changes
  this.awakeCount.subscribe(function(numAwake) {
    if (self.game.state() === State.RESPOND) {
      self.game.responses.checkIfAllIn();
    }
  });

  this.rankChange.subscribe(function(changed) {
    if (changed) {
      self.movePlayers(changed);
    }
  });

  // Computed for showing score adjusters
  this.showAdjusters = ko.computed(function() {
    return self.game.state() === State.SCORE && self.game.isHost();
  });
}

Players.prototype.buildFrameObj = function(player, rank) {
  var frameValue = parseInt(this.framesString[(rank - 1) % NUM_FRAMES], 10);
  var frameType = FRAME_TYPES[Math.floor(frameValue % 3)];
  return new Frame(rank, frameType, player);
};

// Writes new player order to database, only host should do this
Players.prototype.setRanks = function(optRemoveRank) {
  var playerOrder = util.evaluate(this.players);
  playerOrder.sort(function(playerA, playerB) {
    var aPts = playerA.score;
    var bPts = playerB.score;
    return aPts !== bPts ? bPts - aPts : playerA.rankTime - playerB.rankTime;
  });
  playerOrder.forEach(function(player, index) {
    if (index + 1 !== player.rank) {
      // Setting new rank in db
      self.gameObj.child('players').child(player.key).update({
        rank: index + 1,
        rankTime: Date.now(),
        info: null // Also nullify info, since players are about to move
      });
    }
  });
  this.gameObj.child('rankChange').set(optRemoveRank || true).then(function() {
    self.gameObj.child('rankChange').set(false);
  });
};

Players.prototype.movePlayers = function(optRemoveRank) {
  var removeRank = typeof optRemoveRank === "number" ? optRemoveRank : false;
  // Get all frames with players walking out
  var activeFrames = this.frames().filter(function(frame) {
    var player = frame.player();
    if (player.rank !== frame.rank || player.rank === removeRank) {
      $('.frame_' + frame.rank + ' .sign').addClass('unlifted'); // Hide all signs while players are walking
      return true;
    }
  });
  var outCount = 0;
  var getBody = function(frame) { return $('.frame_' + frame.rank + ' .body'); };
  // Make all players walk out
  activeFrames.forEach(function(frame) {
    var player = frame.player();
    frame.moving(player.rank < frame.rank ? 'left_out' : 'right_out');
    getBody(frame).one('animationend', function() {
      outCount++;
      if (outCount === activeFrames.length) {
        if (removeRank) {
          // Remove the last frame
          $('.frame_' + self.frames().length).remove();
          self.frames.pop();
        }
        walkIn();
      }
    });
  });
  // Called once all players have walked out
  var walkIn = function() {
    var currentPlayers = util.evaluate(this.players);
    activeFrames.forEach(function(frame) {
      frame.empty(true);
      frame.moving(undefined);
      var newPlayerIndex = util.findIndex(currentPlayers, function(player) { return player.rank === frame.rank; });
      if (newPlayerIndex === -1) {
        return;
      }
      // TODO: Updates received during movement are ignored
      frame.player(currentPlayers[newPlayerIndex]);
      setTimeout(function() {
        frame.empty(false);
        frame.moving(newPlayerIndex + 1 < frame.rank ? 'left_in' : 'right_in');
        getBody(frame).one('animationend', function() {
          frame.moving(undefined);
          $('.frame_' + frame.rank + ' .sign').removeClass('unlifted');
        });
      }, 500);
    });
  };
};

Players.prototype.onClickPlayerMenu = function(frame, event) {
  var self = this;
  var player = frame.player();
  var isHost = player.isHost;
  var items = [{
      title: 'Give point',
      icon: 'fa fa-plus',
      fn: function() { return self.adjustScore(player.key, 1); }
    }, {
      title: 'Take point',
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
  this.gameObj.child('players').child(key).child('score')
  .transaction(function(currScore) {
      return currScore + amt;
  }, function(err, committed, snapshot) {
    if (!committed) return;
    self.setRanks();
  });
};

Players.prototype.sleepAlert = function() {
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
  this.frames().forEach(function(frame) {
    var adj = frame.scoreAdjustment();
    var key = frame.player().key;
    var scoreRef = self.gameObj.child('players').child(key).child('score');
    scoreRef.once('value', function(snapshot) { return scoreRef.set(snapshot.val() + adj); });
    frame.scoreAdjustment(0); // Reset to 0 for next round
  });
  this.gameObj.child('state').set(State.RECAP);
  this.setRanks();
  // Show updated scores
  this.players().forEach(function(player) {
    var playerObj = self.gameObj.child('players').child(player().key);
    playerObj.child('score').once('value', function(score) {
      playerObj.child('info').set(score.val().toString());
    });
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
