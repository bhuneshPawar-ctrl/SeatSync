const mongoose = require('mongoose'); 
const { schema } = require('./events');

const bookingSchema = new mongoose.Schema({
    userId : {
        type : mongoose.Schema.Types.ObjectId, 
        required : true, 
        ref : 'Users',
    }, 
    eventId : {
        type : mongoose.Schema.Types.ObjectId, 
        required : true, 
        ref : 'Events', 
    },
    bookingRequest : [{
        category : {type : String, required : true}, 
        quantity : {type : Number, required :true},
        price : {type : Number, required : true}
    }], 
    status : {
        type : String, 
        enum : {
            values : ['PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED'], 
            message : "Give a valid status"
        }, 
        default : "PENDING"
    }, 
    totalAmount : {
        type : Number, 
        required : true,
    }
});

const Bookings = mongoose.model('Bookings', bookingSchema); 
module.exports = Bookings;