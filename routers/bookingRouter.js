const express = require('express'); 
const router = express.Router(); 
const {sendSuccess, sendError} = require('../utils/response');
const validator = require('validator'); 
const Users = require('../models/users');
const userAuth = require('../middlewares/auth');  
const Events = require('../models/events');
const Bookings = require('../models/bookings');
const mongoose = require('mongoose');

const VALID_TICKET_CATEGORY = new Set(['VIP', 'Standard']);

router.post('./book', userAuth, async (req, res) => {
    try{
        const {eventId, ticketDetails} = req.body; 
        if(!eventId || !ticketDetails || !Array.isArray(ticketDetails) || ticketDetails.length === 0){
            return sendError(res, 400, 'Invalid event details'); 
        }
        // validating ticket details first as it does not include db operations
        for(const ticket of ticketDetails){
            let category = ticket.category; 
            if(!VALID_TICKET_CATEGORY.has(category)){
                return sendError(res, 400, 'Invalid event ticket details : ticket category does not exist.') 
            }
            let ticketCnt = Number(ticket.quantity); 
            if(Number.isNaN(ticketCnt) || !Number.isInteger(ticketCnt) || ticketCnt < 0){
                return sendError(res, 400, 'Invalid ticket quantity') 
            }
        };
        // start transaction
        const session = await mongoose.startSession();
        try {
            const userBooking = {}; 


        }catch(err){

        }finally{

        }

    }catch(err){
        console.error('ERROR-BookingError: ', err); 
        return sendError(res, 500, 'Something happened during ticket booking')
    }

}); 

module.exports = router; 
