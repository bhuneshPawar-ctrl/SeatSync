const {sendError} = require('../utils/response');
const jwt = require('jsonwebtoken'); 
require('dotenv').config();
const util = require('util'); 
const Users = require('../models/users')

const JWT_SECRET = process.env.JWT_SECRET; 
const jwtVerifyAsync = util.promisify(jwt.verify); 

const userAuth = async (req, res, next) => {
    try{
        const {token} = req.cookies;
        if(!token){
            return sendError(res, 401, 'Invalid User, please login again');
        }
        const decodedPayload = await jwtVerifyAsync(token, JWT_SECRET); 
        const userDoc = await Users.findById(decodedPayload._id).select('-password');
        if(!userDoc){
            return sendError(res, 404, 'User not found')
        }
        res.user = userDoc; 
        next(); 
    }catch(err){
        console.error('ERROR-authMW:', err.message);
        sendError(res, 500, 'Something went wrong while authorization')
    }
}; 

module.exports = userAuth; 