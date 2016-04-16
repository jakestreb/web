
var App = require('./App.js');

// TODO Features:

// HIGH Priority
// - Report guessed for any response (host)
// - Add icons everywhere
// - Speech bubbles
// - Set up watching mode
// - Players joining state (pre-init)
// - New round sometimes doesn't pick questions
// - If number of sleeping people change, re-check requirements for response(/voting)

// Bugs:
// - Fix walking animation
// - All players see scoring currently
// - More buttons are visible than should be on certain refreshes

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

$(function() { new App(); });
