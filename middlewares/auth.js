const {sendError} = require('../utils/response');
const jwt = require('jsonwebtoken'); 
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET; 

const userAuth = async (req, res, next) => {
    try{
        const {token} = res.cookie;
        if(!token){
            sendError(res, 401, 'Invalid User, please login again');
        }
        const decodedPayload = jwt.verify(token, JWT_SECRET); 
        // const url = await Url.findById(decodedPayload._id).select('-password');
        // if(!url){
        //     sendError(res, 404, 'User not found')
        // }
        // res.url = url; 
        next()
    }catch(err){
        console.error('ERROR during auth:', err.message);
        sendError(res, 400, 'Something went wrong while authorization')
    }
}; 

module.exports = userAuth; 