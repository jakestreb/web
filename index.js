var myRef = new Firebase('https://thingswithbeth.firebaseio.com/');
var players = myRef.child('players');
var missionRef = myRef.child('roll');

missionRef.on("value", function(snapshot) {
	$('#totalroll').html(snapshot.val().roll);
}, function (errorObject) {
	console.log("The read failed: " + errorObject.code);
});


function submitroll() {
	var numDie = 0;
	if ($('#1').is(':checked')) {
		numDie = 1;
	}
	else if ($('#2').is(':checked')) {
		numDie = 2;
	}
	else if ($('#3').is(':checked')) {
		numDie = 3;
	}
	else if ($('#4').is(':checked')) {
		numDie = 4;
	}
	else if ($('#5').is(':checked')) {
		numDie = 5;
	}
	else if ($('#6').is(':checked')) {
		numDie = 6;
	}
	else if ($('#7').is(':checked')) {
		numDie = 7;
	}
	else if ($('#8').is(':checked')) {
		numDie = 8;
	}
	var totalRoll = 0;
	var currentVal = 1;
    var i = setInterval(function () {
    		var roll = Math.floor((Math.random() * 3));
			totalRoll += roll;
            if (currentVal === numDie) {
                missionRef.set({roll: totalRoll});
                clearInterval(i);
            }
            else
            {
                currentVal++;
                $('#totalroll').text(totalRoll).animate(100);
            }
        }, 25);
}

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