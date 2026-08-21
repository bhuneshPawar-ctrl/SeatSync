const redis = require('../config/redis'); 

const getCache = async (key) => {
    try{
        const data = await redis.get(key); 
        if(!data) return null; 
        // console.log('in...Get-cache:', data)
        return typeof data == 'string' ? JSON.parse(data) : data; 
    }catch(err){
        console.error(`[Redis GET Failed] Key: ${key} | Error:`, err.message);
        return null 
    }
}

const setCache = async (key, value, ttlSecs = 60) => {
    try{
        await redis.set(key, value, { ex : ttlSecs }); 
    }catch(err){
        console.error(`[Redis SET Failed] Key: ${key} | Error:`, err.message);
    }
}; 

const delCache = async (key) => {
    try{
        await redis.del(key); 
    }catch(err){
        console.error(`[Redis DEL Failed] Key: ${key} | Error:`, err.message);
    }
};

module.exports = { getCache, setCache, delCache };