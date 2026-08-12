const mongoose = require('mongoose'); 

const ticketSchema = new mongoose.Schema({
    category : {
        type : String, 
        enum : ['Standard', 'VIP'], 
        default : 'Standard',
    }, 
    totalCount : {
        type : Number, 
        required : true,
        min : [0, 'totalCount cannot be less than 0']
    }, 
    availableCount : {
        type : Number, 
        required : true, 
        min : [0, 'availableCount cannot be less than 0']
    },
    price : {
        type : Number, 
        required : true, 
        min : 0, 
    }
}, { _id : false}); 

const eventSchema = new mongoose.Schema({
    eventName : {
        type : String, 
        required : true, 
    }, 
    tickets : [ ticketSchema ], 
    date: {
        type : Date, 
        required : true
    }

});

const Events = mongoose.model('Events', eventSchema); 

module.exports = Events;