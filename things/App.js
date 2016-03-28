
var Game = require('./Game.js');
var util = require('./util.js');

// Handles log in and creating a game
function App() {
  this.database = new Firebase('https://thingswithbeth.firebaseio.com/');

  this.urlGameKey = null;
  this.urlPlayerKey = null;

  this.game = null;

  this.jsonData = null;

  // Load JSON data
  _loadJSON(response => this.jsonData = JSON.parse(response));

  this.database.once('value', snapshot => {
    this.attemptURLConnect(snapshot);
    $('#join').on('click', this.onJoinButton.bind(this, snapshot));
    $('#host').on('click', this.onHostButton.bind(this, snapshot));
    $('#watch').on('click', this.onJoinButton.bind(this, snapshot, true));
  });
}

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

App.prototype.onHostButton = function(snapshot) {
  var animal = "";
  var currentAnimals = [];
  snapshot.forEach(game => currentAnimals.push(game.val().animal));
  // Keep trying to get an animal not currently in use
  // TODO: Inefficient, stalls forever if all animals in use
  do {
    animal = util.randomPick(this.jsonData.animals);
  } while (currentAnimals.indexOf(animal) > 0);

  var gameObj = this.database.push({
    round: 1,
    state: State.INIT,
    animal: animal
  });
  window.location.hash = "/%g" + gameObj.key();

  var name = $('#name').val().toUpperCase();
  var gender = this.jsonData.gender[name] || util.randomPick(["male", "female"]);

  var playerObj = gameObj.child("players").push({
    name: name,
    isHost: true,
    gender: gender
  });
  window.location.hash += "/%u" + playerObj.key();

  this.game = new Game(this, gameObj, playerObj);
};

App.prototype.onJoinButton = function(snapshot, watchOnly) {
  var animalInput = $('#game').val();
  var found = false;
  snapshot.forEach(game => {
    if (game.val().animal === animalInput) {
      found = true;
      var gameKey = game.key();
      var gameObj = snapshot.child(gameKey).ref();
      window.location.hash = "/%g" + gameKey;

      var name = $('#name').val().toUpperCase();
      var gender = this.jsonData.gender[name] || util.randomPick(["male", "female"]);

      var playerObj = gameObj.child("players").push({
        name: name,
        isHost: false,
        gender: gender
      });
      window.location.hash += "/%u" + playerObj.key();

      this.game = new Game(this, gameObj, playerObj);
    }
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
