
var App = require('./App.js');
var ko = require('knockout');

// TODO:
// HIGH Priority - - - - - - - - - - - -
// - Set up watching mode
// - Players joining state (pre-init)
// - If number of sleeping people change, re-check requirements for response(/voting)
// - Test with Safari and Firefox and Mobile

// Bugs:
// - Fix speech signs logic
// - Fix walking animation
// - Players can vote in respond round

// MEDIUM Priority - - - - - - - - - - -
// - Get more questions and filter out bad ones
// - Add more frame shapes (circle)
// - Change colors
// - Smooth transitions
// - Remove game when host leaves (since game will stop running)

// Bugs:
// - Handle sleeping players moving

// LOW Priority / Ideas - - - - - - - - -
// - Games inactive more than 12hr are removed when looked up (add timestamp game actions)

// - Make banners curved
// - Add white backdrop blocks (?)
// - Allow *eliminate players when guessed* setting

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});
