const express = require('express'); 
const router = express.Router(); 
const {sendSuccess, sendError} = require('../utils/response');
const validator = require('validator'); 
const Users = require('../models/users');
const userAuth = require('../middlewares/auth');  
const Events = require('../models/events'); 


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
        sendSuccess(res, 201, 'Event created successfully'); 
    }catch(err){
        console.error('ERROR-eventCreation', err.message); 
        return sendError(res, 500, 'Something went wrong during event creation.')
    }
});

module.exports = router; 