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
const redis = require('../config/redis'); 


router.post('/book', rateLimiter('book', 30, 5), async (req, res) => {
    try{
        const dummyId = '6a806f9d4b4b7a3fdf7b1a1a';// add userAuth after tests
        req.user = {_id : dummyId} 
        const {eventId, ticketDetails} = req.body; 
        if(!eventId || !ticketDetails || !Array.isArray(ticketDetails) || ticketDetails.length === 0){
            return sendError(res, 400, 'Invalid event details'); 
        }
        // validating ticket details first as it does not include db operations
        if (!mongoose.isValidObjectId(eventId)) {
            return sendError(res, 400, 'Invalid Event ID format');
        }
        const lockKeyArr = []; 
        const VALID_TICKET_CATEGORY = new Set(['VIP', 'Standard']);
        for(const ticket of ticketDetails){
            let category = ticket.category; 
            if(!VALID_TICKET_CATEGORY.has(category)){
                return sendError(res, 400, 'Invalid event ticket details : ticket category does not exist.') 
            }
            const ticketCntCheck = Number(ticket.quantity); 
            if(Number.isNaN(ticketCntCheck) || !Number.isInteger(ticketCntCheck) || ticketCntCheck <= 0){
                return sendError(res, 400, 'Invalid ticket quantity') 
            }
            VALID_TICKET_CATEGORY.delete(category);
            ticket.quantity = ticketCntCheck; 
            // push the category to locked keys array
            const lockKey = `lock:event-category:${eventId}:${category}`
            lockKeyArr.push(lockKey)
        };
        // redis locking 
        const acquiredLocks = [];
        // start transaction
        const session = await mongoose.startSession();
        try {
            for(const lockKey of lockKeyArr){
                const lockCheck = await redis.set(lockKey, req.user._id, { nx : true, ex : 10 });
                if(!lockCheck){
                    for(const acquiredLock of acquiredLocks){
                        const lockHolder = await redis.get(acquiredLock); 
                        if(lockHolder === req.user._id.toString()){
                            await redis.del(acquiredLock);
                        }
                    }
                    return sendError(res, 409, 'Someone else is booking, retry after some time.')
                }
                acquiredLocks.push(lockKey)
            }
            // console.log(lockCheck)
            hasLock = true; 
            // console.log("Lock acquired by "+req.user.userName+" ! Sleeping for 10 seconds...");
            // await new Promise(resolve => setTimeout(resolve, 10000));
            // console.log("Waking up, processing database transaction...");
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
                    status : 'CONFIRMED',
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
            for(const acquiredLock of acquiredLocks){
                const lockHolder = await redis.get(acquiredLock); 
                if(lockHolder === req.user._id.toString()){
                    await redis.del(acquiredLock);
                }
            }
        }
    }catch(err){
        console.error('ERROR-BookingError: ', err); 
        return sendError(res, 500, 'Something happened during ticket booking')
    }
}); 

module.exports = router; 
