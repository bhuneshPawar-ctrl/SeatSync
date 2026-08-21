const redis = require('../config/redis'); 
const { sendError } = require('../utils/response');

const rateLimiter = (endPoint, windowSecs, maxReqs) => {
    return async (req, res, next) => {
        try{
            let ip = req.headers['x-forwarded-for'] || req.ip || 'Unknown';
            if(ip.includes(',')){
                ip = ip.split(',')[0].trim();
            }
            const rateLimiterKey = `rateLimit:${endPoint}:${ip}`; 
            let cnt = await redis.incr(rateLimiterKey); 
            if(cnt == 1){
                await redis.expire(rateLimiterKey, windowSecs); 
            }
            if(cnt > maxReqs){
                console.log('Blocked IP, rate limit reached:', ip)
                return sendError(res, 429, 'Too many requests, Try again later...')
            }
            next();
        }catch(err){
            console.error('ERROR-rateLimitError', err.message); 
            next();
        }
    }
}; 

module.exports = rateLimiter;