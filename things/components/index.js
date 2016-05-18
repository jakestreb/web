
var App = require('./App.js');
var ko = require('knockout');

// Bugs:
// - Moving players not robust to multiple rank changes
// - Animations keyframes freeze on Safari
// - Leaving game as host sometimes does not fully remove that game
// - Pressing submit player name button multiple times before it loads adds player multiple times
// - (Suspected) Refreshes may cause unwanted changes to Firebase players list/count

// TODO:
// - Disable emojis in responses
// - Use cookies (in addition to URL) to remember game and player
// - Add indicators to show who had responded
// - Allow rejoining as a certain player (ping current players to see who is inactive?)
// - Test action sequences (removals, rank changes, state changes) during disconnect then reconnect
// - Test on iOS

// CSS Ideas:
// - Change css to dark grey background, color frame background and white characters
//  (all round, simpler banner (floating ends))
// - Show preview of circle and character when choosing color and name
// - Make responses have background color lighter than background, line spacing between background bars.
//  Rotate background bars (slightly and independently of eachother)
// - Faster walking

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});
