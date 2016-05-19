
var App = require('./App.js');
var ko = require('knockout');

// Bugs:
// - Moving players not robust to multiple rank changes/removals
// - Animations keyframes freeze on Safari
// - Leaving game as host sometimes does not fully remove that game
// - Pressing submit player name button multiple times before it loads adds player multiple times
// - (Suspected) Hosting game but having another player enter before you could be problematic
// - (Suspected) Refreshes may cause unwanted changes to Firebase players list/count

// TODO:
// - Disable emojis in responses
// - Use cookies (in addition to URL) to remember game and player
// - Add indicators to show who had responded
// - Test action sequences (removals, rank changes, state changes) during disconnect then reconnect
// - Test on iOS

// CSS Ideas:
// - Adding/removing frames grows/shrinks circle from nothing, other frames slide away
// - Smooth animations

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});
