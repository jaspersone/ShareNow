API_TOKEN = '5f835e61-2823-4891-9d95-1fe657ea8024';

var mojioRequest = function(endpoint, vid, methodType, queryParams) {
    var promise = new Parse.Promise();
    var base_url = 'http://data.api.hackthedrive.com:80/v1/';
    var url = base_url + endpoint + '/' + vid;
    console.log(url);
    var header = {
        MojioAPIToken: API_TOKEN,
        'User-Agent' : "Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US; rv:1.9.2.2) Gecko/20100316 Firefox/3.6.2"
    }
    Parse.Cloud.httpRequest({
        url: url,
        method: methodType,
        params: queryParams,
        headers: header,
        success: function(httpResponse) {
            promise.resolve(httpResponse);
        },
        error: function(httpResponse) {
            promise.reject('Request failed with response code ' + httpResponse.status);
        }
    });
    return promise;
}

var getVehicleData = function() {
    var endpoint = 'Vehicles';
    var vid = '9759b6f8-9293-42db-b88a-f74aa6babe59';
    var methodType = 'GET';
    var promise = new Parse.Promise();
    mojioRequest(endpoint, vid, methodType).then(function(results) {
        promise.resolve(results.data);
    }, function(error) {
        promise.reject(error);
    });
    return promise;
}
exports.getVehicleData = getVehicleData;