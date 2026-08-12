const express = require('express'); 
const app = express(); 
require('dotenv').config({ quiet : true}); 
const connectDB = require('./config/database'); 

const PORT = process.env.PORT || 3000; 

connectDB().then(() => {
    console.log('DB connected successfully'); 
    app.listen(PORT, () => {
        console.log('server is listening at port: ', PORT);
    })
}).catch((err) => console.error('ERROR-DBConnection', err,message));


