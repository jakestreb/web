
var App = require('./App.js');
var ko = require('knockout');

// - Test with Safari and Firefox and Mobile
// - Get more questions and filter out bad ones

$(function() {
  window.app = new App();
  ko.applyBindings(window.app);
});
