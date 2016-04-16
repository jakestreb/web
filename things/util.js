
// Binds the value of x to value at location firebase.
exports.bindVal = function(firebase, x) {
  firebase.on("value", snapshot => x = snapshot.val());
};

// Binds the function f to the value at location firebase.
// Whenever the firebase value changes, f is called with the new value.
exports.bindFunc = function(firebase, f) {
  firebase.on("value", snapshot => f(snapshot.val()));
};

// Returns a random element of the array.
exports.randomPick = function(array) {
  return array[Math.floor(Math.random()*array.length)];
};

// Returns an array of unique random elements of an array.
exports.randomPicks = function(array, n) {
  array = array.slice(); // Clone array so as not to mutate it.
  var picks = [];
  for (var i = 0; i < array.length && i < n; i++) {
    var index = Math.floor(Math.random()*array.length);
    picks.push(array.splice(index, 1)[0]);
  }
  return picks;
};

// Inserts item into array at a random location.
// Returns the array for convenience.
exports.randomInsert = function(array, item) {
  var spliceIndex = Math.floor((array.length+1)*Math.random());
  array.splice(spliceIndex, 0, item);
};

// Object forEach, calls func with (val, key)
exports.forEach = function(obj, func) {
  Object.keys(obj).forEach(key => func(obj[key], key));
};

exports.size = function(obj) {
  return Object.keys(obj).length;
};

exports.values = function(obj) {
  return Object.keys(obj).map(key => {
    return obj[key];
  });
};

exports.find = function(arr, cond) {
  for (var i = 0; i < arr.length; i++) {
    if (cond(arr[i])) {
      return arr[i];
    }
  }
  return undefined;
};

exports.contains = function(arr, item) {
  return arr.indexOf(item) !== -1;
};
