
var State = require('./State.js');
var util = require('./util.js');

var DURATION = 3000;

// Handles creation of the list of questions and the poll process
function Poll(game) {
  this.game = game;
  this.timer = new Timer();
  this.spinner = new Spinner();

  this.pollObj = this.game.gameObj.child('poll');

  this.choicesInfo = null;
  this.votesInfo = null;
  this.timeout = null;

  this.count = { a: 0, b: 0, c: 0 };

  util.bindFunc(this.pollObj.child('choices'), this.onChoicesUpdate.bind(this));
  util.bindFunc(this.pollObj.child('allowVoting'), this.onAllowVotingUpdate.bind(this));
  util.bindFunc(this.pollObj.child('votes'), this.onVotesUpdate.bind(this));
  util.bindFunc(this.pollObj.child('timeout'), this.onTimeoutChange.bind(this));
  util.bindFunc(this.pollObj.child('spinner'), this.onSpinnerUpdate.bind(this));
}

Poll.prototype.onAllowVotingUpdate = function(allowVoting) {
  if (allowVoting) {
    $("#a").on('click', this.onVote.bind(this, 'a'));
    $("#b").on('click', this.onVote.bind(this, 'b'));
    $("#c").on('click', this.onVote.bind(this, 'c'));
    this.timer.show();
  }
  else {
    $(".choice_container").off('click');
    this.timer.hide();
  }
};

Poll.prototype.pickChoices = function() {
  var allQuestions = this.game.app.jsonData.questions;
  var picks = util.randomPicks(allQuestions, 3);
  this.game.gameObj.update({
    responses: null,
    poll: {
      allowVoting: true,
      choices: {
        a: picks[0],
        b: picks[1],
        c: picks[2]
      },
      timeout: 'ready'
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

  var numVoters = util.size(this.votesInfo);

  // If no one has voted (initial state), clear vote counts
  if (numVoters === 0) {
    $('.voters').each((i, match) => match.innerHTML = "");
  }
  // If someone voted, and it isn't already set, set the timeout.
  if (numVoters > 0) {
    this.pollObj.child('timeout').transaction(currTimeout => {
      return currTimeout === 'ready' ? Date.now() + DURATION : undefined;
    });
  }
  // If everyone voted, pick question and change state to respond.
  console.warn('awakeCount', numVoters, this.game.players.awakeCount());
  if (numVoters === this.game.players.awakeCount()) {
    this.timer.stop();
  }
};

Poll.prototype.onTimeoutChange = function(timeout) {
  this.timeout = timeout;
  if (typeof timeout === 'number') {
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

// Only called by host
Poll.prototype.pickWinner = function() {
  var maxVotes = Math.max.apply(null, util.values(this.count));
  var finalists = Object.keys(this.count).filter(choice => {
    return this.count[choice] === maxVotes;
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
  if (spinObj && spinObj.sequence) {
    this.spinner.start(spinObj.choices, spinObj.sequence, spinObj.startIndex, item => {
      if (this.game.isHost) {
        this.submitWinner(item);
      }
    });
  }
};

// Only called by host
Poll.prototype.submitWinner = function(winner) {
  this.game.gameObj.update({
    question: winner,
    state: State.RESPOND,
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
  else if (timeLeft < half && timeLeft > 0) {
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

Timer.prototype.show = function() {
  $('.timer').show();
  $('.slice').css('transform', 'rotate(0deg)');
  $('.slice').show();
  $('.mask_slice').hide();
};

Timer.prototype.hide = function() {
  $('.timer').hide();
};


// A random selection spinner
function Spinner() {
  this.intervalId = null;
  this.isRunning = false;
  this.stopCallback = () => {};
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
      $('#' + pick).addClass('selected');
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
