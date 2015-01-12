/*
    Location Module
    Handles geocoding and other location based interactions
*/

/* Foursquare Params */
var TIP_BASE = 'https://api.foursquare.com/v2/venues/';
var TIP = TIP_BASE + 'explore';
var TIP_SEARCH = TIP_BASE + 'search';
var VERSION_NUMBER = '20140705';
/* Deleted Tokens */
var FS_CLIENT_ID = 'foo';
var FS_CLIENT_SECRET = 'bar';
var CUSTOM_LOCATION_SEARCH_RADIUS = 100; // number of meters to search for a custom location
var BROWSE_RADIUS = 6000; // number of meters to limit browsing radius

var VERBOSE = false;

var generateCredentials = function() {
    return {
        'v': VERSION_NUMBER,
        'client_id': FS_CLIENT_ID,
        'client_secret': FS_CLIENT_SECRET,
    };
};

function getVenuePhoto(venueID) {
    var queryParams = generateCredentials();
    var url = TIP_BASE + venueID + '/photos';

    var promise = new Parse.Promise();
    Parse.Cloud.httpRequest({
        url: url,
        params: queryParams,
        success: function(httpResponse) {
            var photoURL = parsePhotoURLFromResponse(httpResponse);
            if (photoURL) {
                promise.resolve(photoURL);
            } else {
                promise.reject('Error: No photo found for venue: ' + venueID);
            }
        },
        error: function(httpResponse) {
            console.log('Failed with URL: ' + url);
            promise.reject('Request failed with response code ' + httpResponse.status);
        }
    });
    return promise;
}
exports.getVenuePhoto = getVenuePhoto;

function parsePhotoURLFromResponse(response) {
    console.log('In parsePhotoURLFromResponse()');
    console.log('FS Photos Response: ' + Object.keys(response));
    var photoURL = null;
    var data = response.data;
    if (data.meta && data.meta.code != 200) {
        console.log('FS return non-200 response.');
        return photoURL; // early exit if FS does not 200
    }
    try {
        var photos = data.response.photos.items;
        console.log('Photos: ' + JSON.stringify(photos));
        if (photos.length > 0) {
            return photos[0].prefix + 'original' + photos[0].suffix;
        }
    } catch(error) {
        console.log('Could not get photos array from FS: ' + JSON.stringify(response));
    }
    return photoURL;
}

function getGeoCodeData(geopoint, query, response) {
    var queryParams = generateCredentials();
    var lat = geopoint.latitude;
    var lng = geopoint.longitude;
    var url = TIP;

    console.log("Got lat/lng: " + lat + ', ' + lng);
    queryParams['ll'] = lat + ',' + lng;
    queryParams['intent'] = 'browse';
    // TODO: need to accept accuracy from GPS and adjust static 100 meters
    //       to a variable radius matching
    queryParams['radius'] = 100; // radius to search within in meters
    queryParams['limit'] = 20; // set the limit of the number of results that are returned

    if (query) {
        // update TIP
        url = TIP_SEARCH
        queryParams['query'] = query;
        queryParams['radius'] = BROWSE_RADIUS;
    }

    Parse.Cloud.httpRequest({
        url: url,
        params: queryParams,
        success: function(httpResponse) {
            parseResults(httpResponse).then(function(venues) {
                if (VERBOSE) console.log(JSON.stringify(venues, null, 4));
                response.success(venues);
            }, function(error) {
                response.error(error);
            });
        },
        error: function(httpResponse) {
            response.error('Request failed with response code ' + httpResponse.status);
        }
    });
}
exports.getGeoCodeData = getGeoCodeData;

function parseResults(httpResponse) {
    /*
        Keys returned from httpResponse Object
        ["uuid","status","headers","text","data","buffer","cookies"]
    */
    var promise = new Parse.Promise();
    var data = httpResponse.data;
    var result = data.response;

    // 'data' has two keys: meta, response
    if (data.meta.code != '200') { // check to make sure that data.meta.code == '200'
        // TODO: need to do something to signal if not 200.
        console.log('getGeoCodeData from endpoint TIP ' + TIP + ' did not return success code of 200.');
    }

    if (VERBOSE) {
        /*
            result.groups == [
                {
                    type: String
                    name: String
                    items: [{},{},{}]
                },
            ]
        */
        console.log('result.headerFullLocation:        ' + result.headerFullLocation);
        console.log('result.headerLocation:            ' + result.headerLocation);
        console.log('result.headerLocationGranularity: ' + result.headerLocationGranularity);
        console.log('result.suggestedRadius:           ' + result.suggestedRadius);
        // NOTE: totalResults is not the number of results sent, but the number
        //       of results available to pull
        console.log('result.totalResults:              ' + result.totalResults);
        console.log('\n');
        console.log('result.groups[0].type:            ' + result.groups[0].type);
        console.log('result.groups[0].name:            ' + result.groups[0].name);
    }

    // note that results returned from FS is an array which only holds one value
    // TODO: HACKY CODE (need to not do this if statement)
    var fsVenues;
    var venues = [];
    if (result.groups) {
        fsVenues = result.groups[0].items;
    } else {
        fsVenues = result.venues;
    }
    venues = fsVenues;
    console.log('fsVenues count:'  + fsVenues.length);
    fsVenues.forEach(function(value, index, array) {
        venues.push(translateFoursquareLocationToWhereUAtLocation(value));
    });

    // TODO: if length of venues == 0, do something special.

    // Test if FS sort is better than distance sort
    var currentUser = Parse.User.current();
    //var cohort = parseInt(currentUser.get('phoneNumber').slice(-1)) % 2;

    /* Create Experiment Entry

       LocationExperiment Object
        user             : pointer to user
        cohort           : 0 if distance sort and 1 if FS sort
        cohortSuggestion : first place of cohort
        actualLocation   : actual location the user selects
        otherSuggestion  : first place of the non-selected cohort
    */
    var cohort = 0
    var experimentEntry = new Parse.Object('LocationExperiment');
    experimentEntry.set('user', currentUser);
    experimentEntry.set('cohort', cohort);

    var finalVenues = [];
    finalVenues = experimentBranchLocation(venues, experimentEntry);

    promise.resolve(finalVenues);
    return promise;
}

function experimentBranchFS(venues, experimentEntry) {
    // clone venues to be sorted by distance
    var venuesByDistance = [];
    venues.forEach(function(venue, index, array) {
        venuesByDistance.push(venue);
    });
    // custom sort by lowest distance value assuming location object has a
    // comparable parameter called distance.
    venuesByDistance.sort(compareLocationsByDistance);

    experimentEntry.set('cohortSuggestion',
        (venues.length > 0 ? venues[0] : null)
    );
    experimentEntry.set('otherSuggestion',
        (venuesByDistance.length > 0 ? venuesByDistance[0] : null)
    );
    return venues;
}

function experimentBranchLocation(venues, experimentEntry) {
    // clone venues to be sorted by distance
    var venuesByDistance = [];
    venues.forEach(function(venue, index, array) {
        venuesByDistance.push(venue);
    });
    // custom sort by lowest distance value assuming location object has a
    // comparable parameter called distance.
    venuesByDistance.sort(compareLocationsByDistance);

    experimentEntry.set('cohortSuggestion',
        (venuesByDistance.length > 0 ? venuesByDistance[0] : null)
    );
    experimentEntry.set('otherSuggestion',
        (venues.length > 0 ? venues[0] : null)
    );
    return venuesByDistance;
}

function translateFoursquareLocationToWhereUAtLocation(fsObj) {
    var base = fsObj['venue'] ? fsObj['venue'] : fsObj;
    return {
        'id':           base.id,
        'name':         base.name,
        'lat':          base.location.lat,
        'lng':          base.location.lng,
        'distance':     base.location.distance,
        'address':      base.location.address,
        'city':         base.location.city,
        'state':        base.location.state,
        'country':      base.location.cc,
        'crossStreet':  base.location.crossStreet,
        'icon':         base.categories[0].icon ? base.categories[0].icon['prefix'] + '88' + base.categories[0].icon['suffix'] : null
    }
}

function compareLocationsByDistance(a,b) {
    if (a.distance < b.distance) return -1;
    if (a.distance > b.distance) return 1;
    return 0;
}

/*******************
* Custom Locations *
*******************/
var CustomLocation = Parse.Object.extend('CustomLocation');

/*
    params: user       - User Object, of the user who owns this custom location
            name       - Sting, the custom name of the location
            lat        - Float, which represent the latitude passed by user
            lng        - Float, which represent the longitude passed by user
            address    - String, the street address of a location (i.e 123 Main St.)
            city       - String, the city name of the location
            state      - String, the state abbreviation of the location
            postalCode - String, the alpha-numeric postal code (ZIP in US)
            country    - String, the country name of the location
            isPreset   - Boolean, true if the location is one of our preset locations
                         (i.e. Home, Work, Gym), otherwise false
    return: a Parse.Promise that is resolved with the newly added CustomLocation
            object if the save of the new location happened properly. If there
            was an error during saving, an error object is returned as the rejected
            promise's result value.
    NOTE: this function does no validation, and expects that the values passed
          to it are already validated.
*/
function createLocation(user, name, lat, lng, address, city, state, postalCode, country, isPreset) {
    var promise  = new Parse.Promise();
    var geoPoint = new Parse.GeoPoint(lat, lng);
    // create new CustomLocation object
    var location = new CustomLocation();
    location.set('owner', user);
    location.set('name', name);
    location.set('geoPoint', geoPoint);
    location.set('address', address);
    location.set('city', city);
    location.set('state', state);
    location.set('country', country);
    location.set('postalCode', postalCode);
    location.set('isPreset', isPreset);

    location.save(null, {
        success: function(customLocation) {
            // Execute any logic that should take place after the object is saved.
            alert('New object created with objectId: ' + gameScore.id);
            promise.resolve(customLocation);
        },
        error: function(customLocation, error) {
            // Execute any logic that should take place if the save fails.
            // error is a Parse.Error with an error code and description.
            promise.reject(error);
        }
    });
    return promise;
}

/*
    params: user - User Object, that you want to look up CustomLocations for

    return: a Parse.Promise that is resolved with the user's custom locations
            or nothing if the user does not have any.
    NOTE: this function does no validation and assumes that the caller of this
          function is the same user as the owner
*/
function getCustomLocationsNearLatLng(user, lat, lng) {
    var promise      = new Parse.Promise();
    var currentPoint = new Parse.GeoPoint(lat, lng);
    var maxDistance  = CUSTOM_LOCATION_SEARCH_RADIUS / 1000; // meters to km

    var query = new Parse.Query('CustomLocation');
    query.equalTo('owner', user);
    query.include('geoPoint');
    query.withinKilometers('geoPoint', currentPoint, maxDistance)
    query.find({
        success: function(customLocations) {

            promise.resolve(customLocations);
        },
        error: function(customLocations, error) {
            promise.reject(error);
        }
    });
    return promise;
}
