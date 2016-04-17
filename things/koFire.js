
var ko = require('knockout');
var util = require('./util.js');

(function (ko) {
  // Creates an observable array based on a firebase location.
  // Stores the firebase location object as an array of objects with keys inside.
  ko.fireArray = function(firebaseRef, optSubscription) {
    var ka = ko.observableArray();

    if (optSubscription) {
      ka.subscribe(optSubscription);
    }

    firebaseRef.on('child_added', (childSnapshot, prevChildKey) => {
      var child = childSnapshot.val();
      child.key = childSnapshot.key();

      // If no previous child is given, just add it to the end
      if (prevChildKey === undefined) ka.push(child);
      // If previous child is given, but null, ordering is on
      // but this item is the first, so add it to the beginning
      else if (prevChildKey === null) ka.unshift(child);
      // Otherwise, find the correct index to put it in
      else {
        var prevChildIndex = util.findIndex(ka.peek(), item => item.key === prevChildKey);
        ka.splice(prevChildIndex + 1, 0, child);
      }
    });

    firebaseRef.on('child_moved', (childSnapshot, prevChildKey) => {
      var child = childSnapshot.val();
      child.key = childSnapshot.key();

      var oldChildIndex = util.findIndex(ka.peek(), item => item.key === child.key);
      var newChildIndex = 0;

      ka.splice(oldChildIndex, 1);

      if (prevChildKey !== null) {
        newChildIndex = util.findIndex(ka.peek(), item => item.key === prevChildKey) + 1;
      }
      ka.splice(newChildIndex, 0, child);
    });

    firebaseRef.on('child_removed', childSnapshot => {
        var childIndex = util.findIndex(ka.peek(), item => {
          return item.key === childSnapshot.key();
        });
        ka.splice(childIndex, 1);
    });

    return ka;
  };

  ko.fireObservable = function(firebaseRef, optSubscription) {
    var obs = ko.observable();

    if (optSubscription) {
      obs.subscribe(optSubscription);
    }

    firebaseRef.on('value', snapshot => {
      console.warn('fire obs value change', snapshot.val());
      obs(snapshot.val());
    });

    return obs;
  };

  // Subscription is only good for the array
  // Ignores move events, items should not be manually moved.
  // (It should be possible to create a subscription function for items too)
  ko.fireArrayObservables = function(firebaseRef, optArraySubscription) {
    var ka = ko.observableArray();

    if (optArraySubscription) {
      ka.subscribe(optArraySubscription);
    }

    firebaseRef.on('child_added', (childSnapshot, prevChildKey) => {
      var child = childSnapshot.val();
      child.key = childSnapshot.key();
      child = ko.observable(child);

      // If no previous child is given, just add it to the end
      if (prevChildKey === undefined) ka.push(child);
      // If previous child is given, but null, ordering is on
      // but this item is the first, so add it to the beginning
      else if (prevChildKey === null) ka.unshift(child);
      // Otherwise, find the correct index to put it in
      else {
        var prevChildIndex = util.findIndex(ka.peek(), item => {
          return item.peek().key === prevChildKey;
        });
        ka.splice(prevChildIndex + 1, 0, child);
      }
    });

    firebaseRef.on('child_removed', childSnapshot => {
        var childIndex = util.findIndex(ka.peek(), item => {
          return item.peek().key === childSnapshot.key();
        });
        ka.splice(childIndex, 1);
    });

    firebaseRef.on('child_changed', (childSnapshot, prevChildKey) => {
      var child = childSnapshot.val();
      child.key = childSnapshot.key();
      // console.warn('child changed', child);
      // console.warn('state of array playa', ka.peek()[0].peek().name, ka.peek()[1].peek().name);
      // console.warn('state of array rank', ka.peek()[0].peek().rank, ka.peek()[1].peek().rank);
      // console.warn('state of array key', ka.peek()[0].peek().key, ka.peek()[1].peek().key);

      var childIndex = util.findIndex(ka.peek(), item => item.peek().key === child.key);
      var childObs = ka.peek()[childIndex];
      // console.warn('replacing child at', childIndex);
      childObs(child);
    });

    return ka;
  };

  // Nathan Fisher on stack overflow
  ko.bindingHandlers.enterKey = {
    init: function (element, valueAccessor, allBindings, viewModel) {
      var callback = valueAccessor();
      $(element).keypress(function (event) {
        var keyCode = (event.which ? event.which : event.keyCode);
        if (keyCode === 13) {
          callback.call(viewModel);
          return false;
        }
        return true;
      });
    }
  };

})(ko);

module.exports = ko;