
var App = require('./App.js');

// TODO Features:
// - End game (host)
// - Report guessed for any response (host)
// - Games inactive more than 12hr are removed when looked up (add timestamp game actions)
// - Notify when host is disconnected (since game will stop running)
// - Change most host actions to transactions possible by any player
// - Get more questions and filter out bad ones
// - Speech bubbles
// - Vote counters (icons?)
// - Add more frame shapes (circle)

// - Make banners curved
// - Add white backdrop blocks (?)

// - Allow players to sit out a round, or host to make them
// - Players should start sitting out if they join in the middle of a round
// - Make frames disappear after someone leaves game

// - Players joining state (init)
// - (Maybe) Allow *eliminate players when guessed* setting

window.onload = new App();
