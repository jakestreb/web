
var ko = require('./koFire.js');
var Game = require('./Game.js');
var util = require('./util.js');

// Handles log in and creating a game
function App() {
  var self = this;
  this.database = new Firebase('https://thingsgame.firebaseio.com/');

  this.selectedGame = ko.observable(null);

  this.foundGame = null;
  this.isHost = false;

  this.urlGameKey = null;
  this.urlPlayerKey = null;
  this.urlWatcherKey = null;

  this.game = null;

  this.jsonData = null;
  this.colors = ko.observableArray();
  this.selectedColor = ko.observable({ "color": "#E74C3C", "alt": "#F76C5C" });

  this.activeGames = ko.fireArray(this.database);

  // Load JSON data
  _loadJSON(function(response) {
    self.jsonData = JSON.parse(response);
    self.colors(self.jsonData.colors.map(function(swatch) { return ko.observableArray(swatch); }));
  });

  this.database.once('value', function(snapshot) { return self.attemptURLConnect(snapshot); });

  // TODO: Use knockout
  $('#join').on('click', this.onJoinButton.bind(this));
  $('#host').on('click', this.onHostButton.bind(this));
  $('#watch').on('click', this.onJoinButton.bind(this, true));
}

App.prototype.selectGame = function(game, event) {
  this.selectedGame(game);
  $('.active_game').removeClass('selected');
  $(event.target).addClass('selected');
};

App.prototype.attemptURLConnect = function(snapshot) {
  var self = this;
  // Get keys from URL
  var urlItems = window.location.hash.split("/");
  urlItems.forEach(function(item) {
    switch (item.slice(0, 2)) {
      case "%g":
        self.urlGameKey = item.slice(2);
        break;
      case "%u":
        self.urlPlayerKey = item.slice(2);
        break;
      case "%w":
        self.urlWatcherKey = item.slice(2);
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
    window.location.hash = ""; // Clear suffix
    console.error("Failed to retrieve game");
    return;
  }
  // Game available
  var gameObj = snapshot.child(this.urlGameKey).ref();

  var players = games[gameObj.key()].players;
  var watchers = games[gameObj.key()].watchers;
  if (!this.urlPlayerKey || !players || !(this.urlPlayerKey in players)) {
    if (!this.urlWatcherKey || !watchers || !(this.urlWatcherKey in watchers)) {
      window.location.hash = ""; // Clear suffix
      console.error("Failed to retrieve player");
      return;
    }
    else {
      // Watcher available
      var watcherObj = gameObj.child("watchers").child(this.urlWatcherKey);
      this.game = new Game(this, gameObj, watcherObj, true);
    }
  }
  else {
    // Player available
    var playerObj = gameObj.child("players").child(this.urlPlayerKey);
    this.game = new Game(this, gameObj, playerObj);
  }
};

App.prototype.onHostButton = function() {
  var currentAnimals = [];
  var animalsToTry = this.jsonData.animals.slice();
  this.activeGames().forEach(function(game) { return currentAnimals.push(game.animal); });

  // Keep trying to get an animal not currently in use
  var animalIndex = util.randomIndex(animalsToTry);
  while (util.contains(currentAnimals, animalsToTry[animalIndex])) {
    animalsToTry.splice(animalIndex, 1);
    if (animalsToTry.length === 0) {
      throw "Too many active games";
    }
    animalIndex = util.randomIndex(animalsToTry);
  }

  var frames = "";
  for (var i = 0; i < 15; i++) {
    frames += Math.floor(Math.random() * 9);
  }

  this.foundGame = this.database.push({
    round: 1,
    state: State.JOIN,
    animal: animalsToTry[animalIndex],
    frames: frames,
    numPlayers: 0,
    numSleeping: 0
  });
  this.isHost = true;

  this.showNamePrompt();
};

App.prototype.onJoinButton = function(watchOnly) {
  this.foundGame = this.database.child(this.selectedGame().key);
  if (watchOnly !== true) {
    this.showNamePrompt();
  }
  else {
    // Create a player object with arbitrary information to avoid errors
    var fakePlayerObj = this.foundGame.child("watchers").push({
      name: 'Watching',
      isHost: false,
      score: 0,
      scoreTime: Date.now(),
      color: "#E74C3C",
      signPosition: 'center',
      rank: 0
    });
    window.location.hash = "/%g" + this.foundGame.key() + "/%w" + fakePlayerObj.key();
    this.game = new Game(this, this.foundGame, fakePlayerObj, true);
  }
};

App.prototype.showNamePrompt = function() {
  $('#join_container').hide();
  $('#host_container').hide();
  $('#name_container').show();
};

App.prototype.onSubmitNameButton = function() {
  var self = this;
  var name = $('#name').val();
  if (name === "") {
    return;
  }

  this.foundGame.child('numPlayers').transaction(function(currNumPlayers) {
    return currNumPlayers + 1;
  }, function(err, committed, snapshot) {
    if (!committed) { return; }
    var playerObj = self.foundGame.child("players").push({
      name: name,
      isHost: self.isHost,
      score: 0,
      scoreTime: Date.now(),
      color: self.selectedColor(),
      signPosition: util.randomPick(['left', 'right', 'center']),
      rank: snapshot.val(),
      asleep: false
    });
    window.location.hash = "/%g" + self.foundGame.key() + "/%u" + playerObj.key();
    self.game = new Game(self, self.foundGame, playerObj);
  });
};

// Found online, JSON parse function
function _loadJSON(callback) {
  var xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', 'components/data.json', true);
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
