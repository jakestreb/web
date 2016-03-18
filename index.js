var dbAddr = 'https://thingswithbeth.firebaseio.com/';
var myRef = new Firebase(dbAddr);
var players = myRef.child('players');

var playerKey = window.location.href.split("/").pop();
var playerObj = null;

var responseOrder = [];

var state = "respond"; // Monitors db value
myRef.child("state").on("value", snapshot => state = snapshot.val());

var round = 1; // Monitors db value
myRef.child("round").on("value", snapshot => round = snapshot.val());

var clientPlayers = {}; // The players content the client is aware of

// Handles all changes to the database (expect player removals)
myRef.on("value", snapshot => handleUpdate(snapshot));

// Check if a player has been removed
players.on("child_removed", snapshot => removePlayer(snapshot));

window.onload = init;

// Init
function init() {
  $('input#name').keyup(e => {
    // Enter key
    if (e.keyCode === 13) addPlayer();
  });
}

// Handles the following tasks whenever a value in the database changes:
// - Shows join prompt if no players exist
// - "Logs in" current user if in the database
// - Builds/updates player list dom
// - Builds response list dom
// - Determines which prompt to show at the top
function handleUpdate(snapshot) {
  // Get object containing players in the database
  var dbPlayers = snapshot.child("players").val();

  // If there are no players yet, show the "join" prompt and stop updating
  if (!dbPlayers) {
    _showNameContainer();
    return;
  }

  // Retrieve player if in database
  if (playerObj === null) {
    if (playerKey in dbPlayers) {
      playerObj = players.child(playerKey).ref();
    } else {
      window.location.hash = ""; // Clears URL suffix
      _showNameContainer();
    }
  }

  var playersReady = true;

  Object.keys(dbPlayers).forEach(key => {
    var dbPlayer = dbPlayers[key];
    _updatePlayerDOM(key, dbPlayer);

    // If key isn't in responseOrder, and it`s ready, add it
    if (responseOrder.indexOf(key) === -1 && dbPlayer.ready >= round) {
      var spliceIndex = Math.floor((responseOrder.length+1)*Math.random());
      responseOrder.splice(spliceIndex, 0, key);
    }
    // If player isn't ready, not ready to display answers
    if (dbPlayer.ready < round) playersReady = false;
  });

  // Set to guess state if all players are ready
  if (playersReady && state === "respond") myRef.child("state").set("guess");

  // Build all responses from responseOrder array (always from scratch,
  // inefficient but probably doesn`t matter)
  if (state === "guess") {
    var responses = responseOrder.map(key => {
      var player = dbPlayers[key];
      if (!player) return null; // Occurs if player is removed during guess state
      return _responseDOM(player.response, player.guessed);
    });
    $("#responses").html(responses);
  }

  if (playerObj !== null) {
    // Set current user class if the current window has a user
    $("#players ." + playerKey).addClass("current_user");
    // Determine which prompt to show to the user
    if (state === "guess" && dbPlayers[playerObj.key()].ready >= round) {
      _showGuessedContainer();
    }
    else if (state === "respond") {
      $("#responses").html("");
      _showSubmitContainer();
    }
  }

  // Save data to client
  clientPlayers = dbPlayers;
}

// Triggered when a player enters their name and submits
function addPlayer() {
  // TODO: Disallow adding during guess round
  var input = $('#name').val();
  playerObj = players.push({
    name: input, response: "", guessed: false, ready: 0
  });
  playerKey = playerObj.key();
  window.location.hash = "/" + playerKey;
  $("#players ." + playerKey).addClass("current_user");
  $("#name_container").hide();
  if (state !== "guess") _showSubmitContainer();
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
  playerObj.update({response: input, guessed: false, ready: round});
}

function reportGuess() {
  playerObj.update({guessed: true});
}

function newRound() {
  myRef.update({state: "respond", round: round+1});
}

// Toggles visibility of remove player buttons
function toggleRemoveButtons() {
  if ($(".remove").is(":visible")) $(".remove").hide();
  else $(".remove").show();
}

function _updatePlayerDOM(key, dbPlayer) {
  if (!(key in clientPlayers)) {
    // Player not in client
    $("#players").append(
      _playerDOM(key, dbPlayer.name, dbPlayer.ready)
    );
    // Add remove listener
    $(".player."+key+" .remove").on('click', () => {
      players.child(key).remove();
    });
  }
  else {
    // Player in client
    var clientPlayer = clientPlayers[key];
    if (dbPlayer.name !== clientPlayer.name) {
      $("#players ."+key+" .name").html(dbPlayer.name);
    }
    $("#players ."+key+" .ready").html(dbPlayer.ready < round ? "waiting" : "ready");
  }
}

// Returns a single instance of a player DOM item
function _playerDOM(key, name, ready) {
  ready = ready < round ? "waiting" : "ready";
  return "<div class='player "+key+"'>" +
    "<span class='remove'>x</span>" +
    "<span class='name'>"+name+"</span>" +
    "<span class='ready'>"+ready+"</span>" +
    "</div>";
}

// Returns a single instance of a response DOM item
function _responseDOM(response, guessed) {
  guessed = guessed ? "guessed" : "";
  return "<div class='response'><div class='response_content "+
    guessed+"'>"+response+"</div><div class='response_triangle'></div></div>";
}

// Enter name and join button
function _showNameContainer() {
  $("#guessed_container").hide();
  $("#submit_container").hide();
  $("#name_container").show();
}

// Enter response and submit button
function _showSubmitContainer() {
  $("#name_container").hide();
  $("#guessed_container").hide();
  $("#submit_container").show();
}

// Button to indicate if response was guessed
function _showGuessedContainer() {
  $("#name_container").hide();
  $("#submit_container").hide();
  $("#guessed_container").show();
}
