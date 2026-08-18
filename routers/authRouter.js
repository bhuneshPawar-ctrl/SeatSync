const express = require('express'); 
const router = express.Router(); 
const {sendSuccess, sendError} = require('../utils/response');
const validator = require('validator'); 
const bcrypt = require('bcrypt'); 
const Users = require('../models/users');
const jwt = require('jsonwebtoken'); 


const SALT_ROUNDS = 10; 

const util = require('util'); 
const signJwtAsync = util.promisify(jwt.sign);

router.post('/signup', async (req, res) => {
    try{
        const { emailId, userName, password } = req.body; 
        if(!emailId || !password || password.trim().length === 0 || !validator.isEmail(emailId)){
            return sendError(res, 400, 'Provide both valid EmailId and Password or EmailId already exists.'); 
        }
        const userExists = await Users.exists({emailId}); 
        if(userExists){ 
            return sendError(res, 400, 'Provide both valid EmailId and Password or EmailId already exists'); 
        }
        const hashedPass = await bcrypt.hash(password, SALT_ROUNDS); 
        await Users.create({
            emailId, 
            userName,
            password : hashedPass,
        })
        sendSuccess(res, 201, `${userName} signed up successfully`);
    }catch(err){
        console.error('ERROR-signUpError', err.message); 
        sendError(res, 500, 'Something happened during SignUp')
    } 
}); 

router.post('/login', async (req, res) => {
    try{
        const {emailId, password} = req.body; 
        if(!emailId || !password || password.trim().length === 0 || !validator.isEmail(emailId)){
            return sendError(res, 401, 'Provide both valid EmailId and Password'); 
        }
        const userDoc = await Users.findOne({emailId}); 
        if(!userDoc){
            return sendError(res, 401, 'Invalid Credentials');
        };  
        const isPassValid = await bcrypt.compare(password, userDoc.password); 
        if(!isPassValid){
            return sendError(res, 401, 'Invalid Credentials');
        }
        const token = await signJwtAsync({ _id : userDoc._id}, process.env.JWT_SECRET, {expiresIn : '1d'});
        res.cookie('token', token, { httpOnly : true, secure : true});
        sendSuccess(res, 200, 'login successfull', {});
    }catch(err){
        console.error('ERROR-loginError', err.message);
        sendError(res, 500, 'Something happened during login'); 
    }
});

module.exports = router; 