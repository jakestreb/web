
var ko = require('./koFire.js');
var Game = require('./Game.js');
var util = require('./util.js');

// Handles log in and creating a game
function App() {
  this.database = new Firebase('https://thingswithbeth.firebaseio.com/');

  this.selectedGame = ko.observable(null);

  this.foundGame = null;
  this.isHost = false;

  this.urlGameKey = null;
  this.urlPlayerKey = null;

  this.game = null;

  this.jsonData = null;

  this.activeGames = ko.fireArray(this.database);

  // Load JSON data
  _loadJSON(response => this.jsonData = JSON.parse(response));

  this.database.once('value', snapshot => this.attemptURLConnect(snapshot));

  $('#join').on('click', this.onJoinButton.bind(this));
  $('#host').on('click', this.onHostButton.bind(this));
  $('#watch').on('click', this.onJoinButton.bind(this, true));
  $('.color').on('click', this.onClickColor.bind(this));
  $('#submit_name').on('click', this.onSubmitNameButton.bind(this));
}

App.prototype.selectGame = function(game, event) {
  this.selectedGame(game);
  $('.active_game').removeClass('selected');
  $(event.target).addClass('selected');
};

App.prototype.attemptURLConnect = function(snapshot) {
  // Get keys from URL
  var urlItems = window.location.hash.split("/");
  urlItems.forEach(item => {
    switch (item.slice(0, 2)) {
      case "%g":
        this.urlGameKey = item.slice(2);
        break;
      case "%u":
        this.urlPlayerKey = item.slice(2);
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
    window.location.hash = ""; // Clears URL suffix
    console.error("Failed to retrieve game");
    return;
  }
  // Game available
  var gameObj = snapshot.child(this.urlGameKey).ref();

  var players = games[gameObj.key()].players;
  if (!this.urlPlayerKey || !players || !(this.urlPlayerKey in players)) {
    window.location.hash = "/%g" + this.urlGameKey; // Clears player suffix
    console.error("Failed to retrieve player");
    this.game = new Game(this, gameObj);
    return;
  }
  // Player available
  var playerObj = gameObj.child("players").child(this.urlPlayerKey);

  this.game = new Game(this, gameObj, playerObj);
};

App.prototype.onHostButton = function() {
  var animal = "";
  var currentAnimals = [];
  this.activeGames().forEach(game => currentAnimals.push(game.val().animal));
  // Keep trying to get an animal not currently in use
  // TODO: Inefficient, stalls forever if all animals in use
  do {
    animal = util.randomPick(this.jsonData.animals);
  } while (currentAnimals.indexOf(animal) > 0);

  var frames = "";
  for (var i = 0; i < 15; i++) {
    frames += Math.floor(Math.random() * 9);
  }

  this.foundGame = this.database.push({
    round: 1,
    state: State.INIT,
    animal: animal,
    frames: frames,
    numPlayers: 0
  });
  this.isHost = true;

  this.showNamePrompt();
};

App.prototype.onJoinButton = function(watchOnly) {
  this.foundGame = this.database.child(this.selectedGame().key);
  console.warn(this.foundGame);
  if (watchOnly !== true) {
    this.showNamePrompt();
  }
  else {
    console.warn('watchonly', watchOnly);
    window.location.hash = "/%g" + this.selectedGame().key;
    this.game = new Game(this, this.foundGame, null);
  }
};

App.prototype.showNamePrompt = function() {
  $('#join_container').hide();
  $('#host_container').hide();
  $('#name_container').show();
};

App.prototype.onClickColor = function(event) {
  $('.color').removeClass('selected');
  $(event.currentTarget).addClass('selected');
};

App.prototype.onSubmitNameButton = function() {
  var name = $('#name').val();

  this.foundGame.child('numPlayers').transaction(currNumPlayers => {
    return currNumPlayers + 1;
  }, (err, committed, snapshot) => {
    if (!committed) {
      return;
    }
    var playerObj = this.foundGame.child("players").push({
      name: name,
      isHost: this.isHost,
      score: 0,
      added: Date.now(),
      color: $('.color.selected').css('background-color'),
      rank: snapshot.val()
    });
    window.location.hash = "/%g" + this.foundGame.key() + "/%u" + playerObj.key();
    this.game = new Game(this, this.foundGame, playerObj);
  });
};

// Found online, JSON parse function
function _loadJSON(callback) {
  var xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', 'data.json', true);
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
