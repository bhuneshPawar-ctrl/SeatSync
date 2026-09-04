const express = require('express'); 
const router = express.Router(); 
const {sendSuccess, sendError} = require('../utils/response');
const Users = require('../models/users');
const userAuth = require('../middlewares/auth');  
const Events = require('../models/events'); 
const redis = require('../config/redis');
const Bookings = require('../models/bookings');
require('dotenv').config();
const { getCache, setCache, delCache } = require('../utils/redis')

const { getEventAnalytics, getEventCategoryAnalytics,
    getTopUserAnalytics, getRiskyEvents,
    getConfirmRate,  getCategoryAnalytics } = require('../services/aggregationPipeline');

const {GoogleGenAI} = require('@google/genai');
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey : GEMINI_API_KEY });


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
        const newEvent = await Events.create(event); 
        try{
            const eventsCacheKey = `cache:events:upcoming`; 
            redis.del(eventsCacheKey);
        }catch(err){
            console.error('ERROR-redisCachingEvents', err.message);
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
        const reportType = req.query.reportType || 'category'; 
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
                analyticsData = await  getCategoryAnalytics();
        }
        sendSuccess(res, 200, 'Analytics fetched successfully for ' + `${reportType}`, analyticsData)
    }catch(err){
        console.error('ERROR-analyticsServer: ', err.message)
        sendError(res, 500, 'Something happened during Analysis.')
    }
});

router.get('/analytics/summary', userAuth, async (req, res) => {
    try {
        if(req.user.role !== 'Admin'){
            return sendError(res, 401, 'Only admins can analyze the data.')
        }
        const cacheKey = `cache:analytics:summary`;
        let summaryData; 
        summaryData = await getCache(cacheKey); 
        if(summaryData){
            return sendSuccess(res, 200, 'Analytics summary fetched successfully', summaryData);
        }
        const [
            eventRevenue, 
            categoryRevenue, 
            riskyEvents, 
            confirmRates,
            topUsers
        ] = await Promise.all([
            getEventAnalytics(30, 5), // Top 5 events last 30 days
            getCategoryAnalytics(),
            getRiskyEvents(),
            getConfirmRate(),
            getTopUserAnalytics(3)
        ]);

        // Filter data to save LLM tokens (Only send events that are almost sold out)
        const criticalInventory = riskyEvents.filter(event => event.almostSoldOut === true);

        const rawData = {
            topPerformingEvents: eventRevenue,
            categoryPerformance: categoryRevenue,
            almostSoldOutEvents: criticalInventory,
            bookingSuccessRates: confirmRates,
            topSpenders: topUsers
        };

        const prompt = `
            You are a Senior Business Analyst for a ticketing platform named SeatSync. 
            I am providing you with real-time JSON data generated from our MongoDB aggregation pipelines.
            Write a concise, 3-4 sentence executive summary for the Admin Dashboard.
            Highlight the highest-grossing events/categories, identify if any events are critically close to selling out (almostSoldOutEvents), and mention the overall booking success rates.            
            Keep it highly professional, metric-driven, and easy to read. 
            Do NOT use markdown formatting (no bolding, no asterisks). Just return plain text.          
            Here is the data: ${JSON.stringify(rawData)}
        `;

        let aiSummary = "AI analysis is currently unavailable. Please view the raw charts.";
        try{
            const response = await ai.models.generateContent({
                model: 'gemini-3.1-flash-lite',
                contents: prompt,
            });
            aiSummary = response.text;
        }catch(err) {
            console.error("LLM Generation Error:", err.message);
        }
        summaryData = {
            summary: aiSummary,
            charts: rawData 
        }
        await setCache(cacheKey, summaryData, 180)
        return sendSuccess(res, 200, summaryData);
    }catch(err){
        console.error('ERROR-AdminAnalytics:', err.message);
        return sendError(res, 500, 'Failed to fetch analytics data');
    }
});

router.delete('/events/:eventId', userAuth, async(req, res) => {
    try{
        if(req.user.role !== 'Admin'){
            return sendError(res, 401, 'Only admins are allowed to manipulate db.')
        }
        const { eventId } = req.params; 
        const activeBookings = await Bookings.exists({
            eventId : eventId, 
            status : { $in : ['CONFIRMED', 'PENDING'] } 
        }); 
        if(activeBookings){
            return sendError(res, 400, 'Cannot delete event: Tickets have been sold or are currently in user carts. Refund process required.')
        }
        const event = await Events.findById(eventId);
        if(!event){
            return sendSuccess(res, 200, 'Event not found.')
        } 
        await Events.findByIdAndDelete(eventId); 
        try {
            const key1 = `cache:event:${eventId}`
            const key2 = `cache:events:upcoming` 
            redis.del(key2) // its ttl is only 60 secs
            await redis.del(key1) // needs to be dsleted as its ttl is 1hr
            // delete from redis inventory 
            for(const ticket of event.tickets){
                const inventoryKey = `inventory:event:${eventId}:${ticket.category}`;
                await redis.del(inventoryKey); 
            }
        }catch(err){
            console.error('ERROR-RedisCleanup on Deletion:', err.message);
        }
        return sendSuccess(res, 200, 'Event and associated inventory safely deleted.');
    }catch(err){
        console.error('ERROR-DeleteEvent:', err.message)
        return sendError(res, 500, 'Something happened during deletion of event.');
    }
});

module.exports = router; 