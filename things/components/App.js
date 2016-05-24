
var ko = require('./koFire.js');
var util = require('./util.js');
var State = require('./State.js');

// Handles log in and creating a game
function App() {
  var self = this;
  this.database = new Firebase('https://thingsgame.firebaseio.com/');

  this.selectedGame = ko.observable(null);

  this.foundGame = null;
  this.nameSubmitted = false;
  this.isHost = false;

  this.game = null;

  this.jsonData = null;
  this.colors = ko.observableArray();
  this.selectedColor = ko.observable("#EC644B");

  this.activeGames = ko.fireArray(this.database);

  // Load JSON data
  util.loadJSON('components/data.json', function(response) {
    self.jsonData = JSON.parse(response);
    self.colors(self.jsonData.colors.map(function(swatch) { return ko.observableArray(swatch); }));
  });
}

App.prototype.selectGame = function(game, event) {
  this.selectedGame(game);
  $('.active_game').removeClass('selected');
  $(event.target).addClass('selected');
};

App.prototype.onHostButton = function() {
  this.isHost = true;
  this.showNamePrompt();
};

App.prototype.onWatchButton = function() {
  this.onJoinButton(true);
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
      random: 0
    });
    window.location.href += "watch?g=" + this.foundGame.key() + "&w=" + fakePlayerObj.key();
  }
};

App.prototype.showNamePrompt = function() {
  $('#join_or_host').hide();
  $('.title').hide();
  $('#name_container').show();
};

App.prototype.onSubmitNameButton = function() {
  var self = this;
  var name = $('#name').val();
  if (name === "" || this.nameSubmitted) {
    return;
  }
  this.nameSubmitted = true; // Prevents multiple submissions

  // If hosting, get animal and create game
  if (this.isHost) {
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

    this.foundGame = this.database.push({
      round: 1,
      state: State.JOIN,
      animal: animalsToTry[animalIndex],
      numPlayers: 0,
      numSleeping: 0
    });
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
      random: (Math.random() * 6) - 3, // Random [-3, 3)
      asleep: false
    });
    self.foundGame.child('log').push({
      event: 'added',
      playerKey: playerObj.key()
    });
    window.location.href += "play?g=" + self.foundGame.key() + "&p=" + playerObj.key();
  });
};

module.exports = App;
