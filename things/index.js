
var ko = require('knockout');
var App = require('./components/App.js');

// watchify index.js play/index.js -p [ factor-bundle -o static/app-bundle.js -o static/game-bundle.js ] -o static/bundle.js

// - Responses overflow in some cases
// - Use Shabby quotation marks, flip right one

// Bugs:
// - Leaving game as host sometimes does not fully remove that game

// CSS:
// - Title
// - Differences on mobile/Safari
// - Smooth animations

// Testing:
// - Test action sequences (removals, rank changes, state changes) during disconnect then reconnect on Safari
// - Test on iOS

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});
