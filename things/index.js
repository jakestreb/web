
var App = require('./App.js');
var ko = require('knockout');

// TODO Features:

// HIGH Priority
// - Removing players
// - Speech bubbles
// - Set up watching mode
// - Players joining state (pre-init)
// - If number of sleeping people change, re-check requirements for response(/voting)

// Bugs:
// - Fix walking animation

// MEDIUM Priority
// - Get more questions and filter out bad ones
// - Add more frame shapes (circle)
// - Smooth transitions

// Bugs:
// - Make frames disappear after someone leaves game
// - Handle sleeping players moving

// LOW Priority / Ideas
// - Games inactive more than 12hr are removed when looked up (add timestamp game actions)
// - Notify when host is disconnected (since game will stop running)
// - Vote counters (icons?)

// - Make banners curved
// - Add white backdrop blocks (?)
// - Allow *eliminate players when guessed* setting

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});
