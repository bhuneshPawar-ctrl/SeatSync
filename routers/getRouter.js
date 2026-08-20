const express = require('express'); 
const router = express.Router(); 
const {sendSuccess, sendError} = require('../utils/response');
const validator = require('validator'); 
const bcrypt = require('bcrypt'); 
const Users = require('../models/users');
const Events = require('../models/events');
const Bookings = require('../models/bookings');
const jwt = require('jsonwebtoken'); 
const userAuth = require('../middlewares/auth');

router.get('/events', async (req, res) => {
    try{
        const events = await Events.find({
            date : {$gte : new Date()}
        }).sort({ date : 1 })
        sendSuccess(res, 200, `Events fetched successfully!`, events);
    }catch(err){
        console.error('ERROR-getEvents', err.message); 
        sendError(res, 500, 'Something happened when fetching events')
    } 
}); 

router.get('/bookings', userAuth, async (req, res) => {
    try{
        const bookings = await Bookings.find({
            userId : req.user._id, 
        }).populate('eventId', 'eventName date')
        .sort({createdAt : -1})
        sendSuccess(res, 200, `Bookings fetched successfully!`, bookings);
    }catch(err){
        console.error('ERROR-getBookings', err.message); 
        sendError(res, 500, 'Something happened when fetching Bookings')
    } 
}); 

module.exports = router; 