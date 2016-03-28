
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
