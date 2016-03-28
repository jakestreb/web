
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

// Inserts item into array at a random location.
// Returns the array for convenience.
exports.randomInsert = function(array, item) {
  var spliceIndex = Math.floor((array.length+1)*Math.random());
  array.splice(spliceIndex, 0, item);
};

// Object forEach, calls callback with (val, key)
exports.forEach = function(obj, callback) {
  Object.keys(obj).forEach(key => callback(obj[key], key));
};

exports.size = function(obj) {
  return Object.keys(obj).length;
};

exports.values = function(obj) {
  return Object.keys(obj).map(key => {
    return obj[key];
  });
};

exports.find = function(arr, callback) {
  for (var i = 0; i < arr.length; i++) {
    if (callback(arr[i])) {
      return arr[i];
    }
  }
  return undefined;
};
