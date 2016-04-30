
var App = require('./App.js');
var ko = require('knockout');

// - Removing a player throws an error and causes issues sometimes (DOM fix should be in watch.html too)
// - removing player messes up num sleeping

// - Test with Safari and Firefox and Mobile
// - Get more questions and filter out bad ones

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});
