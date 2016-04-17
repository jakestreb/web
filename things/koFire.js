
var ko = require('knockout');
var util = require('./util.js');

(function (ko) {
  // Creates an observable array based on a firebase location.
  // Stores the firebase location object as an array of objects with keys inside.
  ko.fireArray = function(firebaseRef) {
    var ka = ko.observableArray();

    firebaseRef.on('child_added', function(childSnapshot, prevChildKey) {
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

    firebaseRef.on('child_moved', function(childSnapshot, prevChildKey) {
      var child = childSnapshot.val();
      child.key = childSnapshot.key();

      var oldChildIndex = util.findIndex(ka.peek(), item => item.key === child.key);
      var newChildIndex = 0;

      ka.splice(oldChildIndex, 1);

      if (prevChildKey !== null) {
        newChildIndex = util.findIndex(ka.peek(), item => prevChildKey) + 1;
      }
      ka.splice(newChildIndex, 0, child);
    });

    firebaseRef.on('child_removed', function(childSnapshot) {
        var childIndex = util.findIndex(ka.peek(), item => {
          return item.key === childSnapshot.key();
        });
        ka.splice(childIndex, 1);
    });

    return ka;
  };

  ko.fireObservable = function(firebaseRef) {
    var obs = ko.observable();

    firebaseRef.on('value', snapshot => obs(snapshot.val()));

    return obs;
  };

})(ko);

module.exports = ko;
