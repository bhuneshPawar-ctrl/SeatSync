const mongoose = require('mongoose'); 
const validator = require('validator')
const userSchema = new mongoose.Schema({
    emailId : {
        type : String, 
        unique : true, 
        required : true, 
        lowercase : true, 
        validate(value){
            if(!validator.isEmail(value)){
                throw new Error("Not a valid Email")
            }
        }, 
    }, 
    userName : {
        type : String, 
        maxLength : [50, 'name exceeds maximum length of 50'],
        trim : true
    }, 
    password : {
        type : String, 
        required : true
    }, 
    role : {
        type : String, 
        enum : {
            values : ['Admin', 'User'], 
            message : 'Invalid role, Choose from "Admin, User"',
        }, 
        default : 'User',
    }

});

const Users = mongoose.model('Users', userSchema); 
module.exports = Users;