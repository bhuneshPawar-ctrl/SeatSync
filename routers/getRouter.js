const express = require('express'); 
const router = express.Router(); 
const {sendSuccess, sendError} = require('../utils/response');
const Users = require('../models/users');
const Events = require('../models/events');
const Bookings = require('../models/bookings');
const jwt = require('jsonwebtoken'); 
const userAuth = require('../middlewares/auth');
const { getCache, setCache } = require('../utils/redis');

router.get('/events', async (req, res) => {
    try{
        const eventsCacheKey = `cache:events:upcoming`; 
        const cachedEvents = await getCache(eventsCacheKey); 
        if(cachedEvents){
            console.log('cache hit...')
            return sendSuccess(res, 200, `Events fetched successfully!`, cachedEvents);
        }
        console.log('cache miss...')
        const events = await Events.find({
            date : {$gte : new Date()}
        }).sort({ date : 1 })
        .lean(); // makes mongoose return Plain old Js objects(POJO) 
        await setCache(eventsCacheKey, events);
        sendSuccess(res, 200, `Events fetched successfully!`, events);
    }catch(err){
        console.error('ERROR-getEvents', err.message); 
        sendError(res, 500, 'Something happened when fetching events')
    } 
}); 

router.get('/bookings', userAuth, async (req, res) => {
    try{
        const cachedBookingKey = `cache:bookings:${req.user._id}`; 
        const cachedBookings = await getCache(cachedBookingKey); 
        if(cachedBookings){
            console.log('cacheBooking.. HIT')
            return sendSuccess(res, 200, `Bookings fetched successfully!`, cachedBookings);
        }
        console.log('cacheBooking.. MISS')
        const bookings = await Bookings.find({
            userId : req.user._id, 
        }).populate('eventId', 'eventName date')
        .sort({createdAt : -1})
        .lean(); // makes mongoose return Plain old Js objects(POJO) 
            /* 
                MOdel.find(): Mongoose does a lot of heavy lifting under the hood:  It wraps every single returned record in a massive Mongoose Document instance.
                It attaches built-in methods, getters, setters, validation hooks, and internal state trackers.
                This makes database objects heavy and memory-intensive.
                When you chain .lean() to the end of a query, you are telling Mongoose:
                "Skip all that heavy wrapper stuff. Just give me raw, plain old JavaScript objects (POJOs)."
                Lean queries are typically 2x to 5x faster and consume significantly less memory.
            */
        await setCache(cachedBookingKey, bookings, 30);
        sendSuccess(res, 200, `Bookings fetched successfully!`, bookings);
    }catch(err){
        console.error('ERROR-getBookings', err.message); 
        sendError(res, 500, 'Something happened when fetching Bookings')
    } 
}); 

module.exports = router; 