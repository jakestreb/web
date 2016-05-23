
var ko = require('knockout');
var App = require('./components/App.js');

// Bugs:
// - Animations keyframes freeze on Safari
// - Leaving game as host sometimes does not fully remove that game
// - (Suspected) Refreshes may cause unwanted changes to Firebase players list/count

// TODO:
// - Fix watch mode
// - Test action sequences (removals, rank changes, state changes) during disconnect then reconnect
// - Test on iOS

// CSS:
// - Title
// - Differences on mobile/Safari
// - Smooth animations

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});
