const express = require('express'); 
const router = express.Router(); 
const {sendSuccess, sendError} = require('../utils/response');
const validator = require('validator'); 
const Users = require('../models/users');
const userAuth = require('../middlewares/auth');  
const rateLimiter = require('../middlewares/rateLimiter');
const Events = require('../models/events');
const Bookings = require('../models/bookings');
const mongoose = require('mongoose');
const { delCache } = require('../utils/redis');

const VALID_TICKET_CATEGORY = new Set(['VIP', 'Standard']);

router.post('/book', userAuth, rateLimiter('book', 30, 5), async (req, res) => {
    try{
        const {eventId, ticketDetails} = req.body; 
        if(!eventId || !ticketDetails || !Array.isArray(ticketDetails) || ticketDetails.length === 0){
            return sendError(res, 400, 'Invalid event details'); 
        }
        // validating ticket details first as it does not include db operations
        if (!mongoose.isValidObjectId(eventId)) {
            return sendError(res, 400, 'Invalid Event ID format');
        }
        for(const ticket of ticketDetails){
            let category = ticket.category; 
            if(!VALID_TICKET_CATEGORY.has(category)){
                return sendError(res, 400, 'Invalid event ticket details : ticket category does not exist.') 
            }
            const ticketCntCheck = Number(ticket.quantity); 
            if(Number.isNaN(ticketCntCheck) || !Number.isInteger(ticketCntCheck) || ticketCntCheck <= 0){
                return sendError(res, 400, 'Invalid ticket quantity') 
            }
            ticket.quantity = ticketCntCheck; 
        };
        // start transaction
        const session = await mongoose.startSession();
        try {
            await session.withTransaction( async () => {
                const bookingRequest = []; 
                let totalAmount = 0; 
                const event = await Events.findById(eventId).session(session); 
                if(!event){
                    throw new Error('Event not found')
                }
                for(const userTicket of ticketDetails){
                    const categoryDoc = event.tickets.find( t =>
                        t.category === userTicket.category
                    )
                    if(!categoryDoc){
                        throw new Error(`Ticket category ${userTicket.category} does not exist.`);
                    }
                    if(categoryDoc.availableCount < userTicket.quantity){
                        throw new Error(`Ticket count exceeded the available count for ${userTicket.category}.`)
                    }
                    categoryDoc.availableCount -= userTicket.quantity
                    bookingRequest.push({
                        category : userTicket.category, 
                        quantity : userTicket.quantity, 
                        price: categoryDoc.price*userTicket.quantity
                    }) 
                    totalAmount += categoryDoc.price*userTicket.quantity; 
                };
                await event.save( { session });
                await Bookings.create([{
                    userId : req.user._id, 
                    eventId, 
                    bookingRequest, 
                    totalAmount
                }], { session });
            });
            const cachedBookingKey = `cache:bookings:${req.user._id}`;
            await delCache(cachedBookingKey); 
            return sendSuccess(res, 201, 'Booking Successful!');
        }catch(err){
            console.error('ERROR-bookingTransaction: ', err)
            return sendError(res, 400, err.message || 'Booking failed')
        }finally{
            session.endSession();
        }
    }catch(err){
        console.error('ERROR-BookingError: ', err); 
        return sendError(res, 500, 'Something happened during ticket booking')
    }
}); 

module.exports = router; 
