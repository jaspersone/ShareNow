// Global Imports
var SNLocation  = require('cloud/SNLocation.js');
var MojioClientToken = '5f835e61-2823-4891-9d95-1fe657ea8024';
var MojioClient = require('cloud/SNMojioClient.js');

var BMWClient, bmw, config;

/*
config = {
  application: 'YOUR APPLICATION KEY',
  secret: 'YOUR SECRET KEY',
  hostname: 'data.api.hackthedrive.com',
  version: 'v1',
  port: '80',
  scheme: 'http'
};

BMW = require('cloud/MojioClient.js');

bmw = new BMW(config);

bmw.login('YOUR USERNAME', 'YOUR PASSWORD', function(error, result) {
  if (error) {
    return console.log("error: " + error);
  } else {
    return console.log("success:" + result);
  }
});
*/

/*
    A function when called with a GeoPoint will return n venues closed to the
    GeoPoint. Please refer to Location.js for implementation and value of n.
    params: request.params.geopoint - a Parse.GeoPoint of the location to search
            for near venues
    return: an JSON object of locations formatted according to
            Location.getGeoCodeData

    User Story: As a user, I would like to know the nearest venues to my current
                location so that I can share it with my friends and family.
*/
Parse.Cloud.define('getNearbyLocations', function(request, response) {
    //var TEMP = new Parse.GeoPoint({latitude: 37.352281, longitude: -121.982754});
    var searchQuery = request.params.query;
    SNLocation.getGeoCodeData(request.params.geopoint, searchQuery, response);
});

Parse.Cloud.define('getVenuePhoto', function(request, response) {
    var venueID = request.params.venueID;
    SNLocation.getVenuePhoto(venueID).then(function(photoURL) {
        response.success(photoURL);
    }, function(error) {
        response.error(error);
    });
});

Parse.Cloud.define('startTrip', function(request, response) {
    var rideID = request.params.rideID;
    if (!rideID) {
        console.log('Must pass ride ID.');
    }
    MojioClient.getVehicleData().then(function(data) {
        var miles = data['LastOdometer'];
        var batteryLevel = data['LastBatteryLevel'] ? data['LastBatteryLevel'] : 100;

        var query = new Parse.Query('Ride');
        query.get(rideID, {
            success: function(myRide) {
                // object is an instance of Parse.Object.
                myRide.set('isRideStarted', true);
                myRide.set('startMiles', miles);
                myRide.set('startBattery', batteryLevel);
                myRide.save().then(function(result) {
                    response.success();
                }, function(error) {
                    response.error(error);
                });
            },
            error: function(object, error) {
                // error is an instance of Parse.Error.
                response.error(error);
            }
        });
    }, function(error) {
        response.error(error);
    });

});

Parse.Cloud.define('pickUp', function(request, response) {
    var rideID = request.params.rideID;
    if (!rideID) {
        console.log('Must pass ride ID.');
    }
    MojioClient.getVehicleData().then(function(data) {
        var query = new Parse.Query('Ride');
        query.get(rideID, {
            success: function(myRide) {
                // object is an instance of Parse.Object.
                myRide.set('isRiderPickedUp', true);
                myRide.save().then(function(result) {
                    response.success();
                }, function(error) {
                    response.error(error);
                });
            },
            error: function(object, error) {
                // error is an instance of Parse.Error.
                response.error(error);
            }
        });
    }, function(error) {
        response.error(error);
    });

});

Parse.Cloud.define('endTrip', function(request, response) {
    var rideID = request.params.rideID;
    if (!rideID) {
        console.log('Must pass ride ID.');
    }
    MojioClient.getVehicleData().then(function(data) {
        var miles = data['LastOdometer'];
        var batteryLevel = data['LastBatteryLevel'] ? data['LastBatteryLevel'] : 0;

        var query = new Parse.Query('Ride');
        query.get(rideID, {
            success: function(myRide) {
                // object is an instance of Parse.Object.
                var tripMiles = miles - myRide.get("startMiles");
                var batteryUsed = myRide.get("startBattery") - batteryLevel
                myRide.set('isRideEnded', true);
                myRide.set('tripMiles', tripMiles);
                myRide.set('batteryUsed', batteryUsed);
                myRide.save().then(function(result) {
                    var kwh = 22 * (batteryUsed / 100);
                    response.success({"kwh":kwh});
                }, function(error) {
                    response.error(error);
                });
            },
            error: function(object, error) {
                // error is an instance of Parse.Error.
                response.error(error);
            }
        });
    }, function(error) {
        response.error(error);
    });

});

Parse.Cloud.define('sendNavigationDestination', function(request, response) {
    var prefix = 'http://api.hackthedrive.com/vehicles/'
    var suffix = '/navigation/';

    /* Params needed to be passed */
    var vin = request.params.vin;
    var label = request.params.label;
    var lat = request.params.lat;
    var lng = request.params.lng;

    var url = prefix + vin + suffix;

    var queryParams = {
        'label': label,
        'lat': lat,
        'lon': lng
    };

    console.log('in sendNavigationDestination()');
    console.log('got url: ' + url);
    console.log('sending params: ' + Object.keys(queryParams));

    Parse.Cloud.httpRequest({
        url: url,
        params: queryParams,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        success: function(httpResponse) {
            console.log(JSON.stringify(httpResponse));
            response.success();
        },
        error: function(httpResponse) {
            console.log(Object.keys(httpResponse));
            response.error('Request failed with response code ' + httpResponse.status + ' : ' + httpResponse.text);
        }
    });
});
