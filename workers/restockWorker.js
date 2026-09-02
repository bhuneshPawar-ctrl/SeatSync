const { Worker, JobScheduler } = require('bullmq');
const { bullRedisConnection } = require('../config/queue'); 
const Bookings = require('../models/bookings'); 
const Events = require('../models/events'); 

const restockWorker = new Worker('ticket-restock', async (job) => {
    const { bookingId, eventId, category, quantity } = job.data; 
    const booking = await Bookings.findById(bookingId); 
    if(!booking) return;
    const inventoryKey = `inventory:event:${eventId}:${category}`; 
    if(booking.status === 'PENDING'){
        //user never paid, cancel the booking and restock the inventory
        booking.status = 'EXPIRED'
        await booking.save(); 
        await bullRedisConnection.incrby(inventoryKey, quantity); 
        console.log(`[RESTOCKED] ${quantity} ${category} tickets for event ${eventId}`);
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