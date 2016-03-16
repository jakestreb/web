var myRef = new Firebase('https://thingswithbeth.firebaseio.com/');
console.warn(myRef);
var players = myRef.child('players');

missionRef.on("value", function(snapshot) {
	$('#totalroll').html(snapshot.val().roll);
}, function (errorObject) {
	console.log("The read failed: " + errorObject.code);
});

function addPlayer() {
  var name = $('#name').value();
  players.set({name: 'ye'});
}

function updateStyle() {
	for (var i = 1; i <= 8; i++) {
		if ($('#' + i).is(':checked')) {
			$('#' + i + 'Text').css({
				'color': 'red',
				'font-weight': 'bold'
			});
		} else {
			$('#' + i + 'Text').css({
				'color': 'inherit',
				'font-weight': 'inherit'
			});
		}
	}
}