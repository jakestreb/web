var db = new Firebase('https://thingswithbeth.firebaseio.com/');
var data = null;

var nameInput = null;
var interval = null;

var gameKey = null;
var gameObj = null;
var playerKey = null;
var playerObj = null;

var responseOrder = [];

var state = "pick"; // Monitors db value
var round = 0; // Monitors db value

var clientPlayers = {}; // The players content the client is aware of

window.onload = init;

// TODO Features:
// - Leave game
// - End game (host)
// - Report guessed for any response (host)
// - List of active games to join (instead of type in)
// - Games more than 24hr old are removed when looked up (add timestamp on new game)
// - Scoring

// Init
function init() {
  // $('input#name').keyup(e => {
  //   // Enter key
  //   if (e.keyCode === 13) addPlayer();
  // });
  _loadJSON(function(response) {
  // Parse JSON string into object
    data = JSON.parse(response);
  });

  // Get keys from URL
  var urlItems = window.location.hash.split("/");
  urlItems.forEach(item => {
    switch (item.slice(0, 2)) {
      case "%g":
        gameKey = item.slice(2);
        break;
      case "%u":
        playerKey = item.slice(2);
        break;
    }
  });
  console.warn('keys', gameKey, playerKey);

  // Initialize page based on URL
  var games = [];
  db.once('value').then(snapshot => {
    games = snapshot.val();

    // Retrieve game if in database, break if not
    if (!gameKey || !games || !(gameKey in games)) {
      window.location.hash = ""; // Clears URL suffix
      throw "cannot retrieve game";
    }
    // Initialize game
    gameObj = snapshot.child(gameKey).ref();
    return prepareGame();
  }).then(() => {
    // Retrieve player if in database, break if not
    var players = games[gameKey].players;
    if (!playerKey || !players || !(playerKey in players)) {
      window.location.hash = "/%g" + gameKey; // Clears player suffix
      throw "cannot retrieve player";
    }
    // Initialize player prompt
    playerObj = gameObj.child("players").child(playerKey);
    preparePlayer();
  }, error => {
    console.warn(error);
  });
}

// Handles the following tasks whenever a value in the database changes:
// - Builds/updates player list dom
// - Builds response list dom
// - Determines which prompt to show at the top
function handleUpdate(snapshot) {
  // Get object containing players in the database
  var game = snapshot.val();
  var dbPlayers = snapshot.child("players").val();
  if (dbPlayers === null) return;

  var playersReady = true;
  var dbPlayersKeys = Object.keys(dbPlayers);
  var numPlayers = dbPlayersKeys.length;

  dbPlayersKeys.forEach(key => {
    var dbPlayer = dbPlayers[key];
    _updatePlayerDOM(key, dbPlayer);

    // If key isn't in responseOrder, and it`s ready, add it
    if (responseOrder.indexOf(key) === -1 && dbPlayer.responseReady >= round) {
      var spliceIndex = Math.floor((responseOrder.length+1)*Math.random());
      responseOrder.splice(spliceIndex, 0, key);
    }
    // If player isn't ready, not ready to display answers
    if (dbPlayer.responseReady < round) playersReady = false;
  });

  // -----

  // Set to guess state if all players are ready
  if (playersReady && state === "respond")  db.child(gameKey).update({state: "guess"});

  if (state === "guess") {
    // Build all responses from responseOrder array (always from scratch,
    // inefficient but probably doesn`t matter)
    _showResponses();
    var responses = responseOrder.map(key => {
      var player = dbPlayers[key];
      if (!player) return null; // Occurs if player is removed during guess state
      return _responseDOM(player.response, player.guessed);
    });
    $("#responses").html(responses);
  }
  else if (state === "pick") {
    // Build all questions and markers to indicate voters (always from scratch)
    _showQuestions();
    $('#question').html("");
    $('#question_a').html(game.questionA);
    $('#question_b').html(game.questionB);
    $('#question_c').html(game.questionC);

    var a = {question: game.questionA, voters: []};
    var b = {question: game.questionB, voters: []};
    var c = {question: game.questionC, voters: []};
    var numVoters = 0;
    Object.keys(dbPlayers).forEach(key => {
      var dbPlayer = dbPlayers[key];
      if (dbPlayer.voteReady === round) {
        switch (dbPlayer.vote) {
          case "a":
            a.voters.push(dbPlayer.name);
            numVoters++;
            break;
          case "b":
            b.voters.push(dbPlayer.name);
            numVoters++;
            break;
          case "c":
            c.voters.push(dbPlayer.name);
            numVoters++;
            break;
        }
      }
    });
    $('#question_a_container .voters').html(a.voters);
    $('#question_b_container .voters').html(b.voters);
    $('#question_c_container .voters').html(c.voters);

    // If someone voted, start the countdown.
    if (numVoters > 0) {
      var timeout = game.timeout;
      if (!game.timeout) {
        timeout = Date.now() + 10000;
        gameObj.update({timeout: timeout});
      }
      interval = setInterval(countdown, 100, timeout);
    }
    // If everyone voted or the countdown ran out, pick question and
    // change state to respond.
    console.warn('numVoters', numVoters, 'numPlayers', numPlayers,
      'time expired?', Date.now() > game.timeout);
    if (numVoters === numPlayers || Date.now() > game.timeout) {
      clearInterval(interval);
      var qDatas = [a, b, c];
      var maxVotes = Math.max.apply(null, qDatas.map(qd => qd.voters.length));
      var finalists = qDatas.filter(qd => qd.voters.length >= maxVotes);
      var winner = finalists[Math.floor(Math.random() * finalists.length)];
      console.warn('winner', winner.question);

      gameObj.update({question: winner.question, state: "respond", timeout: null});
    }
  }
  else {
    $("#responses").html("");
    $('#question').html(game.question);
    _showResponses();
  }

  if (playerObj !== null) {
    // Set current user class if the current window has a user
    $("#players ." + playerKey).addClass("current_user");
    // Determine which prompt to show to the user
    if (state === "guess" && dbPlayers[playerObj.key()].responseReady >= round) {
      _showGuessedContainer();
    }
    else if (state === "respond") {
      _showSubmitContainer();
    }
  }

  // Save data to client
  clientPlayers = dbPlayers;
}

function newGame() {
  nameInput = $('#name').val().toLowerCase();
  db.once('value').then(snapshot => {
    var animal = "";
    var currentAnimals = [];
    snapshot.forEach(game => currentAnimals.push(game.val().animal));
    // Keep trying to get an animal not currently in use
    // TODO: Inefficient, stalls forever if all animals in use
    do {
      animal = data.animals[Math.floor(data.animals.length*Math.random())];
    } while (currentAnimals.indexOf(animal) > 0);

    gameObj = db.push({
      round: 0,
      state: "pick",
      animal: animal
    });
    gameKey = gameObj.key();

    window.location.hash = "/%g" + gameKey;

    return prepareGame();
  }).then(() => {
    addPlayer(true);
  });
}

function joinGame(playerStatus) {
  var input = $('#game').val();
  nameInput = $('#name').val().toLowerCase();
  db.once('value').then(snapshot => {
    var found = false;
    snapshot.forEach(game => {
      if (game.val().animal === input) {
        found = true;
        gameKey = game.key();
        gameObj = snapshot.child(gameKey).ref();
        window.location.hash = "/%g" + gameKey;
      }
    });
    if (found) return prepareGame();
  }).then(() => {
    if (playerStatus !== "watcher") addPlayer(false);
  }, error => {
    alert('not found');
  });
}

function watchGame() {
  joinGame("watcher");
}

// Helper to prepare the game after it is found or created.
function prepareGame() {
  var loadBody = $.Deferred();
  $(document.body).load("game.html", () => loadBody.resolve());

  return loadBody.promise().then(() => {
    gameObj.child("animal").once("value", snapshot => {
      $("#info_container").html(snapshot.val());
    });
    $("#question_a").on('click', () => vote('a'));
    $("#question_b").on('click', () => vote('b'));
    $("#question_c").on('click', () => vote('c'));
    gameObj.child("state").on("value", snapshot => state = snapshot.val());
    gameObj.child("round").on("value", snapshot => round = snapshot.val());
    gameObj.child("players").on("child_removed", snapshot => removePlayer(snapshot));
    return gameObj.on("value", snapshot => handleUpdate(snapshot));
  });
}

// Triggered when a player enters their name and submits
function addPlayer(isHost) {
  // TODO: Disallow adding during guess round
  console.warn('about to push player');
  playerObj = gameObj.child("players").push({
    name: nameInput,
    response: "",
    guessed: false,
    responseReady: 0,
    voteReady: 0,
    isHost: isHost
  });
  playerKey = playerObj.key();
  window.location.hash += "/%u" + playerKey;
  $("#players ." + playerKey).addClass("current_user");
  preparePlayer();
}

// Shows the correct player prompt on startup / player addition
function preparePlayer() {
  db.child(gameKey).child("players").child(playerKey).once("value", snapshot => {
    // Show remove and settings buttons if player is host
    console.warn('preparing player', snapshot.val(), console.trace());
    if (snapshot.val().isHost) $('#settings_container').show();

    // Show correct prompt at the top
    if (state === "respond") {
      _showSubmitContainer();
    }
    else if (state === "guess" && snapshot.val().responseReady === round) {
      _showGuessedContainer();
    }
  });
}

function removePlayer(snapshot) {
  var key = snapshot.key();
  console.warn('removing player', key);
  delete clientPlayers[key];
  $('.player.' + key).remove();
}

function submit() {
  var input = $("#response").val();
  if (input === "") return;
  $("#response").val("");
  playerObj.update({response: input, guessed: false, responseReady: round});
}

function reportGuess() {
  playerObj.update({guessed: true});
}

function vote(option) {
  playerObj.update({
    vote: option,
    voteReady: round
  });
}

function newRound() {
  var game = db.child(gameKey);
  var qs = data.questions;
  game.update({
    state: "pick",
    round: round+1,
    questionA: _randomPick(qs),
    questionB: _randomPick(qs),
    questionC: _randomPick(qs)
  });
}

function countdown(timeout) {
  var ms = timeout - Date.now();
  var seconds = Math.floor(ms/1000);
  var tenths = Math.floor((ms/100)%10);
  $("#timer").html(ms < 0 ? "0.0" : seconds + "." + tenths);
  if (ms < 0) clearInterval(interval);
}

function _updatePlayerDOM(key, dbPlayer) {
  if (!(key in clientPlayers)) {
    // Player not in client
    $("#players").append(
      _playerDOM(key, dbPlayer)
    );
    // Add remove listener
    $(".player."+key+" .remove").on('click', () => playerObj.remove());
  }
  else {
    // Player in client
    var clientPlayer = clientPlayers[key];
    if (dbPlayer.name !== clientPlayer.name) {
      $("#players ."+key+" .name").html(dbPlayer.name);
    }
    $("#players ."+key+" .ready").html(dbPlayer.responseReady < round ? "waiting" : "ready");
  }
}

// Returns a single instance of a player DOM item
function _playerDOM(key, dbPlayer) {
  var ready = dbPlayer.responseReady < round ? "waiting" : "ready";
  return "<div class='player "+key+"'>" +
    (dbPlayer.isHost ? "<span class='remove'>x</span>" : "") +
    "<span class='name'>"+dbPlayer.name+"</span>" +
    "<span class='ready'>"+ready+"</span>" +
    "</div>";
}

// Returns a single instance of a response DOM item
function _responseDOM(response, guessed) {
  guessed = guessed ? "guessed" : "";
  return "<div class='response'><div class='response_content "+
    guessed+"'>"+response+"</div><div class='response_triangle'></div></div>";
}

// Enter response and submit button
function _showSubmitContainer() {
  $("#guessed_container").hide();
  $("#submit_container").show();
}

// Button to indicate if response was guessed
function _showGuessedContainer() {
  $("#submit_container").hide();
  $("#guessed_container").show();
}

function _showQuestions() {
  $("#responses").hide();
  $("#questions").show();
}

function _showResponses() {
  $("#questions").hide();
  $("#responses").show();
}

// Returns a random element of the array
function _randomPick(array) {
  return array[Math.floor(Math.random()*array.length)];
}

// Found online, json parse function
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
