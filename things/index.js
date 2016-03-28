
var App = require('./App.js');

// TODO Features:
// - End game (host)
// - Report guessed for any response (host)
// - Allow players to sit out a round, or host to make them
// - List of active games to join (instead of type in)
// - Games inactive more than 12hr are removed when looked up (add timestamp game actions)
// - Scoring
// - Notify when host is disconnected (since game will stop running)

window.onload = new App();
