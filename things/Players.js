
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
