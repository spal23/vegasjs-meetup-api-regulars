var MEETUP_GROUP_NAME = 'VegasJS';
var MEETUP_API_KEY = '';


var meetup = require('meetup-api')(MEETUP_API_KEY),
    levelup = require('levelup'),
    Q = require('q'),
    _ = require('underscore'),
    winston = require('winston');

// Initialize logger console transport
var logger = new (winston.Logger)({
  transports: [
    new (winston.transports.Console)({ level: 'error' })
  ]
});

// Initialize local cache using leveldb
var cache = levelup('./cache');


if (!MEETUP_API_KEY) logger.error("set MEETUP_API_KEY in app.js"); return false;

/**
 * Retrieve a cached list of attendees of a gevent event.
 */
function getEventAttendance(eventId) {

  var deferred = Q.defer();

  var cacheId = 'event_attendance.' + eventId;

  // Check cache for event attendance
  cache.get(cacheId, function (err, cachedEventAttendance) {

    if (!cachedEventAttendance) { // not cached

      // Get fresh attendence of a particular event from api
      meetup.getEventAttendance({'urlname': MEETUP_GROUP_NAME, 'id': eventId}, function (err, attendees) {

        logger.info('event:' + eventId + ': attendance from api');

        // Store event in cache
        cache.put(cacheId, JSON.stringify(attendees), function () {
          logger.info('event:' + eventId + ': attendance cached');
        });

        // Throw error for promise, if api has an error
        if (attendees.errors) deferred.reject(attendees.errors.pop().message);
        if (err) deferred.reject(err.toString());

        deferred.resolve(attendees);
      });

    }
    else {

      logger.info('event:' + eventId + ': attendance from cache');
      // get cached attendence
      attendees = JSON.parse(cachedEventAttendance);

      // Throw error for promise, if cache has an error
      if (attendees.errors) deferred.reject(attendees.errors.pop().message);

      deferred.resolve(attendees);
    }

  });

  return deferred.promise;

}

/**
 * Retrieve a cached list of past events for the group.
 */
function getEvents() {

  var deferred = Q.defer();

  var cacheId = 'events';

  // Check cache for event
  cache.get(cacheId, function (err, cachedEvents) {

    if (!cachedEvents) { // event not cached

      // get fresh event list from the meetup api
      meetup.getEvents({'group_urlname' : MEETUP_GROUP_NAME, 'status' : 'past'}, function (err, events) {

        logger.info('events from api');

        // store the event in cache
        cache.put(cacheId, JSON.stringify(events), function () {
          logger.info('events cached');
        });

        // Throw error , if cache has an error
        if (events.errors) deferred.reject(events.errors.pop().message);

        deferred.resolve(events);
      });

    }
    else {
      logger.info('event from cache');

      // get cached event
      events = JSON.parse(cachedEvents);

      deferred.resolve(events);
    }

  });

  return deferred.promise;
}

/**
 * Retrieve a list of past events for the that occured after regulus (and including).
 */
function getEventsAfterRegulus() {
  var deferred = Q.defer();

  var eventsAfterRegulus = [];

  getEvents().then(function (events) {

    events.results.forEach(function (event) {
      if (event.name.indexOf('#') !== -1) {
        var vegasJSEventNum = event.name.match(/#([0-9]+)/)[1]
        if (vegasJSEventNum >= 21) {
          eventsAfterRegulus.push(event);
        }
      }
    });

    deferred.resolve({results: eventsAfterRegulus});

  });

  return deferred.promise;
}

/**
 * Create a Sorted list of members from the given events by their attendance.
 */
function getSortedAttendance(events) {

  var deferred = Q.defer();

  var eventAttendance = [];

  events.results.forEach(function (event) {
    eventAttendance.push(getEventAttendance(event.id));
  });

  Q.all(eventAttendance).then(function (eventsAttended) {

    var memberAttendance = {};

    eventsAttended.forEach(function (attendees) {
      attendees.forEach(function (attendee) {
        memberAttendance[attendee.member.id] = memberAttendance[attendee.member.id] || {count: 0, name: attendee.member.name};
        memberAttendance[attendee.member.id].count = memberAttendance[attendee.member.id].count + 1;
      });
    });

    var members = [];

    for (key in memberAttendance) {
      members.push(memberAttendance[key]);
    }

    var sortedAttendance = _(members).sortBy(function (member) {
      return member.count;
    }).reverse();

    deferred.resolve(sortedAttendance);

  }).catch(function (err) {
    logger.error(err);
  });

  return deferred.promise;
}

function listRegulars(events) {

    getSortedAttendance(events).then(function (sortedAttendance) {

      process.stdout.write("\Regulars:\n");

      sortedAttendance.forEach(function (member) {
        if (member.count >= 5) {
          process.stdout.write("\t" + member.name + "(" + member.count + ")\n");
        }
      });

      process.stdout.write("\nAlmost Regulars:\n");

      sortedAttendance.forEach(function (member) {
        if (member.count < 5 && member.count >= 3) {
          process.stdout.write("\t" + member.name + "(" + member.count + ")\n");
        }
      });

      process.stdout.write("\n\n");

    });

}

//getEvents().then(listRegulars);

getEventsAfterRegulus().then(listRegulars);


