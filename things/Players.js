
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

  // Define frame types observable and create listener to maintain it.
  this.frames = ko.observableArray();

  this.players = ko.fireArrayObservables(this.gameObj.child('players').orderByChild('rank'), players => {
    var numPlayers = players.length;
    var numFrames = this.frames().length;
    while (numFrames < numPlayers) {
      var nextRank = numFrames + 1;
      var player = util.find(players, player => player.peek().rank === nextRank);
      this.frames.push(this.buildFrameObj(player, nextRank));
      numFrames++;
    }
    console.warn('PLAYERS CHANGED!!', console.warn(this.frames.peek()));
    // TODO: Handle removal
  });

  // Computed for showing score adjusters
  this.showAdjusters = ko.computed(() => {
    return this.game.state() === State.SCORE && this.game.isHost();
  });

  util.bindFunc(this.game.playerObj.child('asleep'), this.sleepAlert.bind(this));
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
// TODO: Could be a transaction completed by anyone
Players.prototype.setRanks = function() {
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
          .child('rank').set(index + 1).then(() => {
            console.warn('player ranks frames 1, 2');
            console.warn(this.frames()[0].player().rank);
            console.warn(this.frames()[1].player().rank);
          });
      }
    });
    this.movePlayers();
  });
};

Players.prototype.movePlayers = function() {
  var currentPlayers = util.evaluate(this.players);
  this.frames().forEach(frame => {
    var player = frame.player();
    // console.warn('right place?', player.name, player.rank, frame.rank);
    if (player.rank !== frame.rank) {
      // console.warn('Player must be moved');
      // Player must be moved
      frame.moving(player.rank < frame.rank ? 'left_out' : 'right_out');
      var frameBody = $('.frame_' + frame.rank + ' .body');
      frameBody.one('animationend', () => {
        frame.empty(true);
        frame.moving(undefined);
        // console.warn('this.players()', this.players.peek()[0].peek(), this.players.peek()[1].peek());
        var newPlayerIndex = util.findIndex(currentPlayers, player => player.rank === frame.rank);
        frame.player(currentPlayers[newPlayerIndex]);
        setTimeout(() => {
          frame.empty(false);
          frame.moving(newPlayerIndex + 1 < frame.rank ? 'left_in' : 'right_in');
          frameBody.one('animationend', () => frame.moving(undefined));
        }, 500);
      });
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

// Host only
Players.prototype.onSetScores = function() {
  this.frames().forEach(frame => {
    var adj = frame.scoreAdjustment();
    var key = frame.player().key;
    var scoreRef = this.gameObj.child('players').child(key).child('score');
    scoreRef.once('value', snapshot => scoreRef.set(snapshot.val() + adj));
  });
  this.gameObj.child('state').set(State.RECAP);
  this.setRanks();
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
