const { Queue } = require('bullmq'); 
const IORedis = require('ioredis'); 
require('dotenv').config();

const bullRedisConnection = new IORedis(process.env.REDIS_TCP_URL, {
    maxRetriesPerRequest : null, 
    tls : {}
}); 

const restockQueue = new Queue('ticket-restock', { connection : bullRedisConnection })

module.exports = { bullRedisConnection, restockQueue }