
var ko = require('./koFire.js');
var State = require('./State.js');
var util = require('./util.js');

var DURATION = 8000;

// Handles creation of the list of questions and the poll process
function Poll(game) {
  var self = this;
  this.game = game;
  this.timer = new Timer();
  this.spinner = new Spinner();

  this.pollObj = this.game.gameObj.child('poll');

  this.choices = ko.fireArray(this.pollObj.child('choices'));
  this.votes = ko.fireArray(this.pollObj.child('votes'));

  util.bindFunc(this.pollObj.child('timeout'), this.onTimeoutChange.bind(this));
  util.bindFunc(this.pollObj.child('spinner'), this.onSpinnerUpdate.bind(this));

  this.votes.subscribe(this.onVotesUpdate.bind(this));
}

Poll.prototype.pickChoices = function() {
  var allQuestions = this.game.jsonData.questions;
  var picks = util.randomPicks(allQuestions, 3);
  var labels = ['A', 'B', 'C'];
  for (var i = 0; i < 3; i++) {
    this.pollObj.child('choices').push({
      label: labels[i], text: picks[i]
    });
  }
  this.pollObj.child('timeout').set('ready');
};

Poll.prototype.onVotesUpdate = function(votes) {
  var numVoters = votes.length;

  // If someone voted, and it isn't already set, set the timeout.
  if (numVoters > 0) {
    this.pollObj.child('timeout').transaction(function(currTimeout) {
      return currTimeout === 'ready' ? Date.now() + DURATION : undefined;
    });
  }
  // If everyone voted, pick question and change state to respond.
  if (numVoters === this.game.players.awakeCount()) {
    this.timer.stop();
  }
};

Poll.prototype.onTimeoutChange = function(timeout) {
  var self = this;
  if (typeof timeout === 'number') {
    this.timer.start(timeout, function() {
      if (self.game.isHost()) {
        self.pickWinner();
      }
    });
  }
};

Poll.prototype.onVote = function(choice) {
  var self = this;
  var alreadyVoted = util.find(this.votes(), function(vote) {
    return vote.playerKey === self.game.playerObj.key();
  });
  if (alreadyVoted || this.game.state() !== State.POLL) return;
  this.pollObj.child('votes').push({
    name: this.game.playerName(),
    playerKey: this.game.playerObj.key(),
    vote: choice.label
  });
  this.game.playerObj.update({
    vote: choice.label,
    info: choice.label
  });
};

// Only called by host
Poll.prototype.pickWinner = function() {
  var count = { A: 0, B: 0, C: 0 };
  this.votes().forEach(function(voteData) { return count[voteData.vote]++; });
  var maxVotes = Math.max.apply(null, util.values(count));
  var finalists = Object.keys(count).filter(function(choice) {
    return count[choice] === maxVotes;
  });
  if (finalists.length > 1) {
    this.pollObj.child('spinner').update({
      choices: finalists.join(''),
      sequence: Spinner.randomSequence(),
      startIndex: Math.floor(Math.random() * finalists.length)
    });
  }
  else {
    this.submitWinner(finalists[0]);
  }
};

Poll.prototype.onSpinnerUpdate = function(spinObj) {
  var self = this;
  if (spinObj && spinObj.sequence) {
    this.spinner.start(spinObj.choices, spinObj.sequence, spinObj.startIndex, function(item) {
      if (self.game.isHost()) {
        self.submitWinner(item);
      }
    });
  }
};

// Only called by host
Poll.prototype.submitWinner = function(winner) {
  var self = this;
  // Remove all choices except winner
  var removalKeys = [];
  this.choices().forEach(function(choice) {
    if (choice.label !== winner) removalKeys.push(choice.key);
  });
  removalKeys.forEach(function(key) { return self.pollObj.child('choices').child(key).remove(); });
  this.game.gameObj.update({
    question: winner,
    state: State.RESPOND
  });
};

// A simple countdown timer
function Timer() {
  this.intervalId = null;
  this.isRunning = false;
  this.stopCallback = function() {};
}

Timer.prototype.reset = function() {
  $('.slice').show();
  $('.slice').css('transform', 'rotate(0deg)');
  $('.mask_slice').hide();
};

Timer.prototype.start = function(timeout, stopCallback) {
  if (this.isRunning) {
    return;
  }
  this.isRunning = true;
  this.stopCallback = stopCallback;
  this.intervalId = window.setInterval(this.buildDom.bind(this), 10, timeout);
};

Timer.prototype.buildDom = function(timeout) {
  var timeLeft = timeout - Date.now();
  var half = DURATION / 2;
  var frac;
  var deg;
  if (timeLeft > half) {
    $('.mask_slice').hide();
    $('.slice').show();
    // Slice goes 90deg -> 270deg
    frac = 1 - ((timeLeft - half) / half);
    deg = (frac * 180);
    $('.slice').css('transform', 'rotate(' + deg + 'deg)');
  }
  else if (timeLeft <= half && timeLeft > 0) {
    $('.slice').hide();
    $('.mask_slice').show();
    frac = 1 - (timeLeft / half);
    deg = (frac * 180);
    $('.mask_slice').css('transform', 'rotate(' + deg + 'deg)');
  }
  else {
    this.stop();
  }
};

Timer.prototype.stop = function() {
  window.clearInterval(this.intervalId);
  this.isRunning = false;
  this.stopCallback();
};

// A random selection spinner
function Spinner() {
  this.intervalId = null;
  this.isRunning = false;
  this.stopCallback = function() {};
}

Spinner.prototype.start = function(choices, seq, startIndex, stopCallback) {
  if (this.isRunning) {
    return;
  }
  this.isRunning = true;
  this.stopCallback = stopCallback;
  this.intervalId = window.setInterval(
    this.buildDom.bind(this), 10, choices, seq, startIndex
  );
};

Spinner.prototype.buildDom = function(choices, seq, startIndex) {
  var now = Date.now();
  for (var i = 0; i < seq.length - 1; i++) {
    if (now >= seq[i] && now < seq[i + 1]) {
      var pick = choices[(startIndex + i) % choices.length];
      $('.choice_container').removeClass('selected');
      $('.' + pick).addClass('selected');
      return;
    }
  }
  if (now >= seq[seq.length - 1]) {
    this.stop(choices[(startIndex + seq.length - 2) % choices.length]);
  }
};

Spinner.prototype.stop = function(winner) {
  window.clearInterval(this.intervalId);
  this.isRunning = false;
  $('.choice_container').removeClass('selected');
  this.stopCallback(winner);
};

// Generates a random sequence that is delayed over time
Spinner.randomSequence = function() {
  // Sequences of time values on which to change selection
  var seq = [];
  var time = Date.now();
  var delay = 50;
  while (delay < 800 + (Math.random() * 100)) {
    seq.push(time);
    time += delay;
    delay *= 1.2 + (Math.random() * 0.05);
  }
  seq.push(time);
  return seq;
};

module.exports = Poll;
