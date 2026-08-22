const express = require('express'); 
const router = express.Router(); 
const {sendSuccess, sendError} = require('../utils/response');
const validator = require('validator'); 
const Users = require('../models/users');
const userAuth = require('../middlewares/auth');  
const Events = require('../models/events'); 
const redis = require('../config/redis');
const Bookings = require('../models/bookings');

const { getEventAnalytics, getEventCategoryAnalytics, getTopUserAnalytics, getRiskyEvents, getConfirmRate } = require('../services/analytics.service');

router.post('/createEvent', userAuth, async (req, res) => {
    try{
        if(req.user.role !== 'Admin'){
            return sendError(res, 401, 'Unauthorized, only admin can create an event'); 
        }
        const {eventName, tickets, date} = req.body; 
        let isDetailsValid = true; 
        if(!eventName || !date || !Array.isArray(tickets) || tickets.length === 0){ 
            isDetailsValid = false 
        }
        // validate date 
        if(isDetailsValid){
            const eventDate = new Date(date); // Date(invalid_date) returns NaN and anything compared to NaN gives false
            if(isNaN(eventDate)){
                return sendError(res, 400, 'Enter a valid date.')
            }
            if(eventDate < new Date()){
                return sendError(res, 400, 'Event Date cannot be in the past or today.')
            }
        }
        let eventTickets = [];
        const validCategory = new Set(['Standard', 'VIP']); 
        if(isDetailsValid){
            for(const ticket of tickets){
                const {category, totalCount, price} = ticket; 
                if(!category || typeof totalCount !== 'number' || typeof price !== 'number'){
                    isDetailsValid = false; 
                    break; 
                }
                if(!validCategory.has(category) || Math.min(totalCount, price) < 0 ){
                    isDetailsValid = false
                    break; 
                }
                validCategory.delete(category); // remove from set too, prevents duplicate insertion
                eventTickets.push({ category, totalCount, availableCount : totalCount, price}); 
            }
        }
        if(!isDetailsValid){
            return sendError(res, 400, 'Invalid event details'); 
        }
        const event = {
            eventName,
            tickets : eventTickets, 
            date, 
        }
        await Events.create(event); 
        try{
            const eventsCacheKey = `cache:events:upcoming`; 
            redis.del(eventsCacheKey);
        }catch(err){
            console.error('ERROR-redisCache', err.message);
        }
        
        sendSuccess(res, 201, 'Event created successfully'); 
    }catch(err){
        console.error('ERROR-eventCreation', err.message); 
        return sendError(res, 500, 'Something went wrong during event creation.')
    }
});

router.get('/analytics', userAuth, async(req, res) => {
    try{
        if(req.user.role !== 'Admin'){
            return sendError(res, 401, 'Only admins can analyze the data.')
        }
        const reportType = req.query.reportType || "event-category"; 
        let analyticsData;
        switch(reportType){
            case "event-category":
                analyticsData = await getEventCategoryAnalytics(); 
                break;
            case "event":
                analyticsData = await getEventAnalytics(); 
                break;
            case "topUsers":
                analyticsData = await getTopUserAnalytics();
                break;
            case "riskyEvents":
                analyticsData = await getRiskyEvents();
                break;
            case "confirmRate":
                analyticsData = await getConfirmRate();
                break; 
            default:
                analyticsData = await Bookings.aggregate([
                    {
                        $match : { status : 'CONFIRMED' }
                    }, 
                    {
                        $unwind : "$bookingRequest"
                    }, 
                    {
                        $group:{
                            _id : "$bookingRequest.category", 
                            ticketsSold : { $sum : "$bookingRequest.quantity" }, 
                            totalRevenue : { $sum : "$bookingRequest.price" }, 
                            totalOrders : { $sum : 1 }
                        }
                    }, 
                    {
                        $project : {
                            _id : 0, 
                            categoryName : "$_id", 
                            totalRevenue : 1, 
                            ticketsSold : 1, 
                            totalOrders : 1
                        }
                    }, 
                    { $sort : { totalRevenue : -1 }}
                ]);

        }
        sendSuccess(res, 200, 'Analytics fetched successfully', analyticsData)
    }catch(err){
        console.error('ERROR-analyticsServer: ', err.message)
        sendError(res, 500, 'Something happened during Analysis.')
    }
});

module.exports = router; 