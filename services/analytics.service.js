const Bookings = require('../models/bookings'); 
const Events = require('../models/events'); 

const getEventAnalytics = async (days = 30, limit = 10) => {
    let targetDate = new Date(); 
    targetDate.setDate(targetDate.getDate() - days); 
    const result = await Bookings.aggregate([
        {
            $match : { status : "CONFIRMED", createdAt : { $gte : targetDate }}
        }, 
        {
            $group : {
                _id : "$eventId", 
                totalEventRevenue : {
                    $sum : "$totalAmount"
                }
            }
        }, 
        {
            $lookup : {
                from : "events", 
                localField : "_id", 
                foreignField : "_id", 
                as : "eventData"
            }
        }, 
        {
            $unwind : "$eventData"
        }, 
        {
            $project : {
                _id : 0, 
                eventName : "$eventData.eventName", 
                totalEventRevenue : 1
            }
        }, 
        {
            $sort : { totalEventRevenue : -1 }
        }, 
        {
            $limit : limit
        }
    ]); 
    return result; 
}; 

const getEventCategoryAnalytics = async () => {
    const result = await Bookings.aggregate([
        {
            $match : { status : "CONFIRMED" }
        }, 
        {
            $unwind : "$bookingRequest"
        },
        { 
            $group : {
                _id : {
                    eventId : "$eventId", 
                    category : "$bookingRequest.category"
                }, 
                categoryTotalRevenue : { $sum : "$bookingRequest.price"}, 
                ticketsSold : { $sum : "$bookingRequest.quantity" }, 
            }
        }, 
        {
            $group : {
                _id : "$_id.eventId", 
                categories : {
                    $push : {
                        category : "$_id.category", 
                        categoryTotalRevenue : "$categoryTotalRevenue", 
                        categoryTicketsSold : "$ticketsSold"
                    }
                }, 
                eventTotalRevenue : { $sum : "$categoryTotalRevenue" }, 
                eventTotalTicketsSold : { $sum : "$ticketsSold"}
            }
        }, 
        {
            $lookup : {
                from : 'events', 
                localField : "_id", 
                foreignField : "_id", 
                as : "eventData"
            }
        }, 
        {
            $unwind : "$eventData"
        }, 
        {
            $project : {
                _id : 0, 
                eventName : "$eventData.eventName", 
                categories : 1, 
                eventTotalRevenue : 1, 
                eventTotalTicketsSold : 1
            }
        }, 
        {
            $sort : {
                eventTotalRevenue : -1 
            }
        }, 
        {
            $limit : 50
        }
    ]); 
    return result; 
}; 

const getTopUserAnalytics = async (limit = 10) => {
    const result = await Bookings.aggregate([
        {
            $match : { status : "CONFIRMED" }
        }, 
        {
            $group : {
                _id : "$userId", 
                totalUserValue : {
                    $sum : "$totalAmount"
                }
            }
        }, 
        {
            $lookup : {
                from : "users", 
                localField : "_id", 
                foreignField : "_id", 
                as : "userData"
            }
        }, 
        {
            $unwind : "$userData"
        }, 
        {
            $project : {
                _id : 0, 
                userName : "$userData.userName", 
                totalUserValue : 1
            }
        }, 
        {
            $sort : { totalUserValue : -1 }
        }, 
        {
            $limit : limit
        }
    ]); 
    return result; 
}; 

const getRiskyEvents = async () => {
    const result = await Events.aggregate([
        {
            $unwind : "$tickets"
        }, 
        {
            $addFields : {
                percentSold : {
                    $multiply : [{
                        $divide : [{
                            $subtract : [ "$tickets.totalCount", "$tickets.availableCount" ]
                        },
                        "$tickets.totalCount" ]    
                    }, 
                    100 ] 
                }
            }
        },
        {
            $addFields : {
                almostSoldOut : {
                    $cond : {
                        if : { $gte : ["$percentSold", 90] }, 
                        then : true, 
                        else: false
                    }
                }
            }
        },
        {
            $project : {
                _id : 0, 
                eventName : 1, 
                category : "$tickets.category", 
                totalCount : "$tickets.totalCount", 
                availableCount: "$tickets.availableCount",
                percentSold: 1,
                almostSoldOut: 1
            }
        }, 
        {
            $sort : { percentSold : -1 }
        }
    ]);
    return result;
};

const getConfirmRate = async () => {
    const result = await Bookings.aggregate([
        {
            $group : {
                _id : "$eventId", 
                confirmCount : {
                    $sum : {
                        $cond : {
                            if : { $eq : ["$status", "CONFIRMED"] }, 
                            then : 1, 
                            else: 0
                        }
                    }
                }, 
                totalCount : { $sum : 1 }
            }
        }, 
        {
            $addFields : {
                confirmRate : {
                    $multiply : [
                        {
                            $divide : ["$confirmCount", "$totalCount"]
                        }, 
                        100
                    ]
                }
            }
        }, 
        {
            $lookup : {
                from : "events", 
                localField : "_id", 
                foreignField : "_id", 
                as : "eventData"
            }
        }, 
        {
            $unwind : "$eventData"
        }, 
        {
            $project : {
                _id : 0, 
                eventName : "$eventData.eventName", 
                totalCount : 1, 
                confirmCount : 1, 
                confirmRate : 1
            }
        }, 
        { $sort : { confirmRate : -1 }}
    ])
    return result;
};

module.exports = { getEventAnalytics, getEventCategoryAnalytics, getTopUserAnalytics, getRiskyEvents, getConfirmRate };