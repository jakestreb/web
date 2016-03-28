
var State = require('./State.js');
var util = require('./util.js');

var DURATION = 3000;

// Handles creation of the list of questions and the poll process
function Poll(game) {
  this.game = game;
  this.timer = new Timer();

  this.pollObj = this.game.gameObj.child('poll');

  this.choicesInfo = null;
  this.votesInfo = null;
  this.timeout = null;

  this.count = { a: 0, b: 0, c: 0 };

  util.bindFunc(this.pollObj.child('choices'), this.onChoicesUpdate.bind(this));
  util.bindFunc(this.pollObj.child('votes'), this.onVotesUpdate.bind(this));
  util.bindFunc(this.pollObj.child('timeout'), this.onTimeoutChange.bind(this));

  $("#a").on('click', this.onVote.bind(this, 'a'));
  $("#b").on('click', this.onVote.bind(this, 'b'));
  $("#c").on('click', this.onVote.bind(this, 'c'));
}

Poll.prototype.pickChoices = function() {
  // TODO: Picked questions should not allow repeats
  var allQuestions = this.game.app.jsonData.questions;
  this.game.gameObj.update({
    responses: null,
    poll: {
      choices: {
        a: util.randomPick(allQuestions),
        b: util.randomPick(allQuestions),
        c: util.randomPick(allQuestions)
      }
    }
  });
};

Poll.prototype.onChoicesUpdate = function(choicesInfo) {
  this.choicesInfo = choicesInfo || {};
  util.forEach(this.choicesInfo, (choice, letter) => $('#choice_' + letter).html(choice));
  // If no choices, remove dom
  if (util.size(this.choicesInfo) === 0) {
    $('.choice').each((i, match) => {
      match.innerHTML = "";
    });
  }
  this.hasVoted = false;
};

Poll.prototype.onVotesUpdate = function(votesInfo) {
  // Build all markers to indicate voters
  // TODO: Currently builds all from scratch on any change
  this.votesInfo = votesInfo || {};
  this.count = { a: 0, b: 0, c: 0 };
  util.forEach(this.votesInfo, voteData => this.count[voteData.vote]++);
  // Print current counts in each selection
  util.forEach(this.count, (val, key) => $('#voters_' + key).html(val));

  var numVoters = util.size(this.votesInfo);

  // If no one has voted (initial state), clear vote counts
  if (numVoters === 0) {
    $('.voters').each((i, match) => match.innerHTML = "");
  }
  // If someone voted, set the timeout.
  if (numVoters > 0 && !this.timeout) {
    this.pollObj.update({timeout: Date.now() + DURATION});
  }
  // If everyone voted, pick question and change state to respond.
  if (numVoters === this.game.players.count() && false) {
    this.timer.stop();
  }
};

Poll.prototype.onTimeoutChange = function(timeout) {
  this.timeout = timeout;
  if (timeout) {
    this.timer.start(timeout, () => {
      if (this.game.isHost) {
        this.pickWinner();
      }
    });
  }
};

Poll.prototype.onVote = function(choice) {
  var personalVote = util.find(Object.keys(this.votesInfo), voteKey => {
    return this.votesInfo[voteKey].playerKey === this.game.playerObj.key();
  });
  if (personalVote) {
    return;
  }
  this.pollObj.child('votes').push({
    name: this.game.playerName,
    playerKey: this.game.playerObj.key(),
    vote: choice
  });
  this.game.playerObj.child('vote').set(choice);
};

Poll.prototype.pickWinner = function() {
  var maxVotes = Math.max.apply(null, util.values(this.count));
  var finalists = Object.keys(this.count).filter(choice => {
    return this.count[choice] === maxVotes;
  });
  this.game.gameObj.update({
    question: this.choicesInfo[util.randomPick(finalists)],
    state: State.RESPOND,
    timeout: null
  });
};

// A simple countdown timer
function Timer() {
  this.intervalId = null;
  this.isRunning = false;
  this.stopCallback = () => {};
}

Timer.prototype.start = function(timeout, stopCallback) {
  if (this.isRunning) {
    return;
  }
  this.isRunning = true;
  this.stopCallback = stopCallback;
  this.intervalId = window.setInterval(this.buildDom.bind(this), 10, timeout);
};

Timer.prototype.buildDom = function(timeout) {
  var time = Date.now();
  var ms;
  // var seconds = Math.floor(ms / 1000);
  // var tenths = Math.floor((ms / 100) % 10);
  // $("#timer").html(ms < 0 ? ms : seconds + "." + tenths);
  var half = DURATION / 2;
  var halftime = timeout - half;
  var frac;
  var deg;
  if (time < halftime) {
    $('.mask_slice').hide();
    $('.slice').show();
    // Slice goes 90deg -> 270deg
    frac = 1 - ((halftime - time) / half);
    deg = (frac * 180);
    console.warn(frac, deg);
    $('.slice').css('transform', 'rotate(' + deg + 'deg)');
  }
  else if (time < timeout) {
    $('.slice').hide();
    $('.mask_slice').show();
    frac = 1 - ((timeout - time) / half);
    deg = (frac * 180);
    $('.mask_slice').css('transform', 'rotate(' + deg + 'deg)');
  }
  else {
    this.stop();
  }
};

Timer.prototype.stop = function() {
  window.clearInterval(this.intervalId);
  $("#timer").html("");
  this.isRunning = false;
  this.stopCallback();
};

module.exports = Poll;
