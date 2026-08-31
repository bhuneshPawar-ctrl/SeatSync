const redis = require('../config/redis')

const REDIS_KEY = 'delayed:jobs';

const queueJob = async (jobData, jobDelay = 600000) => {
    try{
        const jobStartTime = Date.now() + jobDelay; 
        await redis.zadd(REDIS_KEY, {
            score : jobStartTime, 
            member : jobData
        })
    }catch(err){
        throw new Error('ERROR-manualJobScheduling'); 
        console.error(err.meassage);
    }
}

// background worker
setInterval(async () =>{
    const currTime = Date.now(); 
    const dueJobs = await redis.zrange(REDIS_KEY, 0, currTime, { byScore : true }); 
    for (const job of dueJobs){
        const parsedJob = JSON.parse(job); 
        await redis.incrby(`inventory:event:${parsedJob.eventId}:${parsedJob.category}`, parsedJob.quantity);
        await redis.zrem(REDIS_KEY, job);
    }
}, 1000); 

module.exports = { queueJob };

// problems with this manual approach:
/*
1.Concurrency: If you run two Node servers (for load balancing), they will both run the setInterval at the same time,
  grab the same job, and put Alice's 2 tickets back twice (restocking 4 tickets total).
  You would need to write complex Lua scripts to lock the job while it's processing.
2.Failure Handling: What if redis.incrby fails midway?
  The job is already deleted, or it gets stuck forever.
*/