
// Binds the value of x to value at location firebase.
exports.bindVal = function(firebase, x) {
  firebase.on("value", function(snapshot) { return x = snapshot.val(); });
};

// Binds the function f to the value at location firebase.
// Whenever the firebase value changes, f is called with the new value.
exports.bindFunc = function(firebase, f) {
  firebase.on("value", function(snapshot) { return f(snapshot.val()); });
};

// Returns a random element of the array.
exports.randomPick = function(array) {
  return array[Math.floor(Math.random()*array.length)];
};

exports.randomIndex = function(array) {
  return Math.floor(Math.random() * array.length);
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
  Object.keys(obj).forEach(function(key) { return func(obj[key], key); });
};

exports.size = function(obj) {
  return Object.keys(obj).length;
};

exports.values = function(obj) {
  return Object.keys(obj).map(function(key) {
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

exports.findIndex = function(arr, cond) {
  for (var i = 0; i < arr.length; i++) {
    if (cond(arr[i])) {
      return i;
    }
  }
  return -1;
};

exports.findKey = function(obj, cond) {
  for (var key in obj) {
    if (cond(obj[key], key)) {
      return key;
    }
  }
  return undefined;
};

exports.contains = function(arr, item) {
  return arr.indexOf(item) !== -1;
};

// Counts the number of items in arr that meet cond
exports.count = function(arr, cond) {
  var count = 0;
  for (var i = 0; i < arr.length; i++) {
    if (cond(arr[i])) {
      count++;
    }
  }
  return count;
};

// Evaluates an obsArray of observables
exports.evaluate = function(obsArray) {
  return obsArray.peek().map(function(val) { return val(); });
};

exports.loadJSON = function(url, callback) {
  // Found online, JSON parse function
  var xobj = new XMLHttpRequest();
  xobj.overrideMimeType("application/json");
  xobj.open('GET', url, true);
  xobj.onreadystatechange = function() {
    if (xobj.readyState == 4 && xobj.status == "200") {
      // Required use of an anonymous callback as .open will NOT return a value but
      // simply returns undefined in asynchronous mode
      callback(xobj.responseText);
    }
  };
  xobj.send(null);
};

// Options should have the following properties:
// text - main text content
// buttonText - button title
// buttonFunc - button execute function
// color - color object with color and alt color
exports.alert = function(options) {
  console.warn('ALERT');
  var color = options.color;
  var dom = "<div class='alert'>" +
    "<div class='alert_text'>" + options.text + "</div>" +
    "<button class='alert_button' style='background-color:" + color +
      ";border-color:" + color + ";'>" + options.buttonText + "</button>" +
  "</div>";
  $('#game_content').hide();
  $('body').prepend(dom);
  $('.alert_button').on('click', function() {
    $('.alert').remove();
    $('#game_content').show();
    options.buttonFunc();
  });
};
