const { Worker, JobScheduler } = require('bullmq');
const { bullRedisConnection } = require('../config/queue'); 
const Bookings = require('../models/bookings'); 
const Events = require('../models/events'); 
const { findOneAndUpdate } = require('../models/users');
const mongoose = require('mongoose');

const restockWorker = new Worker('ticket-restock', async (job) => {
    const bookingId = job.data; 
    const booking = await Bookings.findById(bookingId); 
    if(!booking) return;
    console.log('in-worker: ') 
    
    if(booking.status === 'PENDING'){
        //user never paid, cancel the booking and restock the inventory
        try{
            const multi = bullRedisConnection.multi(); 
            const eventId = booking.eventId;
            for(const categoryDoc of booking.bookingRequest){
                const inventoryKey = `inventory:event:${eventId}:${categoryDoc.category}`;
                multi.incrby(inventoryKey, categoryDoc.quantity)
            }
            const results = await multi.exec();
            // results will be an array like: [[null, 10], [null, 15]]
            // (The first element of each sub-array is the error, if any)
            for(const result of results){
                if(result[0]){
                    throw new Error(`Redis Transaction failed: ${result[0].message}`);
                }
            }
            const updateRes = await Bookings.findOneAndUpdate(
                { _id : bookingId, status : 'PENDING' }, 
                { $set : { status : 'EXPIRED' }}, 
                { returnDocument : 'after' }
            )
            if(!updateRes){
                console.log(`Booking ${bookingId} was modified by another process. Skipping EXPIRED state.`);
                return;
            }
            console.log(`Successfully [RESTOCKED] inventory for event ${eventId}`);
        }catch(err){
            console.error('Worker Restock Error:', err.message);
            throw err;
        }
    }else if(booking.status === 'CONFIRMED'){
        console.log(`[PAID] Booking ${bookingId} was paid. No restock needed.`);
    }else if(booking.status === 'FAILED'){
        console.log(`[FAILED] Booking ${bookingId} failed previously.`);
    }
}, { connection : bullRedisConnection }); 

restockWorker.on('failed', (job, err) =>{
    console.error(`Job ${job.id} failed:`, err);
});

module.exports = restockWorker; 