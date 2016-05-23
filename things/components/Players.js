
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
