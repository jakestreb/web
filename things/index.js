
var App = require('./App.js');
var ko = require('knockout');

// TODO:
// HIGH Priority - - - - - - - - - - - -
// - Set up watching mode
// - Players joining state (pre-init)
// - If number of sleeping people change, re-check requirements for response(/voting)
// - Test with Safari and Firefox and Mobile

// Bugs:
//

// MEDIUM Priority - - - - - - - - - - -
// - Get more questions and filter out bad ones
// - Add more frame shapes (circle)
// - Change colors
// - Smooth transitions
// - Change header appearance
// - Add host label to header
// - Vertically center players on join, score, and recap states

// Bugs:
//

// LOW Priority / Ideas - - - - - - - - -
// - Games inactive more than 12hr are removed when looked up (add timestamp game actions)

// Bugs:
// - Timer sometimes acts weird (new round?)

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});
