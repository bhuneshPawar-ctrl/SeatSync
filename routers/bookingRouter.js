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
const { getCache, setCache, delCache } = require('../utils/redis');
const redis = require('../config/redis'); 
const { restockQueue } = require('../config/queue');

router.post('/book', async (req, res) => { // add rate limiter as M.W. : rateLimiter('book', 30, 5)
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
        // validate ticket category 
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
        };

        // fetch the specific event 
        let event; 
        const eventCacheKey = `cache:event:${eventId}`;
        event = await getCache(eventCacheKey); 
        if(!event){
            event = await Events.findById(eventId).lean(); 
            if(!event){
                return sendError(res, 400, 'Event not found')
            }
            await setCache(eventCacheKey, event, 3600);
        }
        
        // we track this for rollbacks if an array item fails
        const reservedInventory = [];
        try {
            for(const ticket of ticketDetails){
                const inventoryKey = `inventory:event:${eventId}:${ticket.category}`; 
                const quantity = ticket.quantity; 
                // seed the inventory if not already seeded 
                const categoryDoc = event.tickets.find( t =>
                    t.category === ticket.category
                )
                if(!categoryDoc){
                    throw new Error(`Ticket category ${ticket.category} does not exist.`);
                }
                await redis.set(inventoryKey, categoryDoc.availableCount, { nx : true });
                // atomic subtraction from redis 
                const remaining = await redis.decrby(inventoryKey, quantity); 
                if(remaining < 0){
                    // put the current ticket back into redis inventory
                    await redis.incrby(inventoryKey, quantity);
                    // rollback 
                    for(const reserved of reservedInventory){
                        await redis.incrby(reserved.inventoryKey, reserved.quantity)
                    }
                    return sendError(res, 400, `High Demand: ${ticket.category} tickeys are currently sold out.`);
                }
                // push to tracker (reservedInventory)
                reservedInventory.push({
                    inventoryKey, 
                    category : ticket.category, 
                    quantity
                }); 
            }
            // console.log("Lock acquired by "+req.user.userName+" ! Sleeping for 10 seconds...");
            // await new Promise(resolve => setTimeout(resolve, 10000));
            // console.log("Waking up, processing database transaction...");

            // create the actual booking request 
            const bookingRequest = [];
            let totalAmount = 0; 
            for(const userTicket of ticketDetails){
                const categoryDoc = event.tickets.find( t =>
                    t.category === userTicket.category
                )
                if(!categoryDoc){
                    throw new Error(`Ticket category ${userTicket.category} does not exist.`);
                }
                const price = categoryDoc.price*userTicket.quantity;
                bookingRequest.push({
                    category : userTicket.category, 
                    quantity : userTicket.quantity, 
                    price
                }) 
                totalAmount += price; 
            };

            // create the booking record as PENDING
            const newBooking = await Bookings.create({
                userId : req.user._id,
                eventId, 
                bookingRequest, 
                status : 'PENDING',
                totalAmount
            });

            // ENQUEUE the jobs to restock queue 
            await restockQueue.add('restock-abandoned-tickets', newBooking._id.toString(), { 
                delay : 60000, 
                attempts : 3, 
                backoff : { type : 'exponential', delay : 2000 }, 
                removeOnComplete: true, 
                removeOnFail: { count: 100 }
            });

            // delete from user bookings in redis too.
            const cachedBookingKey = `cache:bookings:${req.user._id}`;
            await delCache(cachedBookingKey); 
            return sendSuccess(res, 201, 'Booking Successful!');
        }catch(err){
            console.error('ERROR-bookingTransaction: ', err)
            for(const reserved of reservedInventory){
                await redis.incrby(reserved.inventoryKey, reserved.quantity)
            }
            return sendError(res, 400, err.message || 'Booking failed')
        }
    }catch(err){
        console.error('ERROR-BookingError: ', err); 
        return sendError(res, 500, 'Something happened during ticket booking')
    }
}); 

router.post('/webhook/payment', async (req, res) => {
    try{
        const { bookingId, paymentStatus } = req.body; 
        if(!bookingId || paymentStatus !== 'SUCCESS'){
            return sendError(res, 400, 'Invalid payment details')
        }
        
        const session = await mongoose.startSession(); 
        try{
            await session.withTransaction(async () => {
                const booking = await Bookings.findById(bookingId).session(session); 
                if(!booking){
                    throw new Error('Booking not found')
                }
                if(booking.status !== 'PENDING'){
                    throw new Error('Cannot confirm, booking status is already '+ booking.status);
                }
                const event = await Events.findById(booking.eventId).session(session); 
                if(!event){
                    throw new Error('Event does not exist')
                }
                const reservedTickets = booking.bookingRequest; 
                for(const reservedTicket of reservedTickets){
                    const categoryDoc = event.tickets.find(t => t.category === reservedTicket.category)
                    if(!categoryDoc){
                        throw new Error(`Category ${reservedTicket.category} not found for the event ${event._id}`)
                    }
                    if(categoryDoc.availableCount < reservedTicket.quantity){
                        throw new Error(`Ticket count exceeded the available count for ${reservedTicket.category}.`)
                    }
                    categoryDoc.availableCount -= reservedTicket.quantity;
                }
                booking.status = 'CONFIRMED'
                await event.save({ session });
                await booking.save({ session }); 
            }); 
            return sendSuccess(res, 200, 'Payment confirmed!Tickets booked.');
        }catch(err){
            console.error('ERROR-PaymentWebhook:', err);
            return sendError(res, 400, err.message || 'Payment processing failed');
        }finally{
            session.endSession();
        }
    }catch(err){
        console.error('ERROR-BookingError: ', err); 
        return sendError(res, 500, 'Something happened during ticket booking');
    }
});

module.exports = router; 

// booking router : phase 1 - 1.5 : basic locking 
// router.post('/book', rateLimiter('book', 30, 5), async (req, res) => {
//     try{
//         const dummyId = '6a806f9d4b4b7a3fdf7b1a1a';// add userAuth after tests
//         req.user = {_id : dummyId} 
//         const {eventId, ticketDetails} = req.body; 
//         if(!eventId || !ticketDetails || !Array.isArray(ticketDetails) || ticketDetails.length === 0){
//             return sendError(res, 400, 'Invalid event details'); 
//         }
//         // validating ticket details first as it does not include db operations
//         if (!mongoose.isValidObjectId(eventId)) {
//             return sendError(res, 400, 'Invalid Event ID format');
//         }
//         const lockKeyArr = []; 
//         const VALID_TICKET_CATEGORY = new Set(['VIP', 'Standard']);
//         for(const ticket of ticketDetails){
//             let category = ticket.category; 
//             if(!VALID_TICKET_CATEGORY.has(category)){
//                 return sendError(res, 400, 'Invalid event ticket details : ticket category does not exist.') 
//             }
//             const ticketCntCheck = Number(ticket.quantity); 
//             if(Number.isNaN(ticketCntCheck) || !Number.isInteger(ticketCntCheck) || ticketCntCheck <= 0){
//                 return sendError(res, 400, 'Invalid ticket quantity') 
//             }
//             VALID_TICKET_CATEGORY.delete(category);
//             ticket.quantity = ticketCntCheck; 
//             // push the category to locked keys array
//             const lockKey = `lock:event-category:${eventId}:${category}`
//             lockKeyArr.push(lockKey)
//         };
//         // redis locking 
//         const acquiredLocks = [];
//         // start transaction
//         const session = await mongoose.startSession();
//         try {
//             for(const lockKey of lockKeyArr){
//                 const lockCheck = await redis.set(lockKey, req.user._id, { nx : true, ex : 10 });
//                 if(!lockCheck){
//                     for(const acquiredLock of acquiredLocks){
//                         const lockHolder = await redis.get(acquiredLock); 
//                         if(lockHolder === req.user._id.toString()){
//                             await redis.del(acquiredLock);
//                         }
//                     }
//                     return sendError(res, 409, 'Someone else is booking, retry after some time.')
//                 }
//                 acquiredLocks.push(lockKey)
//             }
//             // console.log("Lock acquired by "+req.user.userName+" ! Sleeping for 10 seconds...");
//             // await new Promise(resolve => setTimeout(resolve, 10000));
//             // console.log("Waking up, processing database transaction...");
//             await session.withTransaction( async () => {
//                 const bookingRequest = []; 
//                 let totalAmount = 0; 
//                 const event = await Events.findById(eventId).session(session); 
//                 if(!event){
//                     throw new Error('Event not found')
//                 }
//                 for(const userTicket of ticketDetails){
//                     const categoryDoc = event.tickets.find( t =>
//                         t.category === userTicket.category
//                     )
//                     if(!categoryDoc){
//                         throw new Error(`Ticket category ${userTicket.category} does not exist.`);
//                     }
//                     if(categoryDoc.availableCount < userTicket.quantity){
//                         throw new Error(`Ticket count exceeded the available count for ${userTicket.category}.`)
//                     }
//                     categoryDoc.availableCount -= userTicket.quantity
//                     bookingRequest.push({
//                         category : userTicket.category, 
//                         quantity : userTicket.quantity, 
//                         price: categoryDoc.price*userTicket.quantity
//                     }) 
//                     totalAmount += categoryDoc.price*userTicket.quantity; 
//                 };
//                 await event.save( { session });
//                 await Bookings.create([{
//                     userId : req.user._id,
//                     eventId, 
//                     bookingRequest, 
//                     status : 'CONFIRMED',
//                     totalAmount
//                 }], { session });
//             });
//             const cachedBookingKey = `cache:bookings:${req.user._id}`;
//             await delCache(cachedBookingKey); 
//             return sendSuccess(res, 201, 'Booking Successful!');
//         }catch(err){
//             console.error('ERROR-bookingTransaction: ', err)
//             return sendError(res, 400, err.message || 'Booking failed')
//         }finally{
//             session.endSession();
//             for(const acquiredLock of acquiredLocks){
//                 const lockHolder = await redis.get(acquiredLock); 
//                 if(lockHolder === req.user._id.toString()){
//                     await redis.del(acquiredLock);
//                 }
//             }
//         }
//     }catch(err){
//         console.error('ERROR-BookingError: ', err); 
//         return sendError(res, 500, 'Something happened during ticket booking')
//     }
// }); 
