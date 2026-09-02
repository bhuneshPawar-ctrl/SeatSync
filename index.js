const express = require('express'); 
const app = express(); 
require('dotenv').config({ quiet : true}); 
const connectDB = require('./config/database'); 
const adminRouter = require('./routers/adminRouter'); 
const authRouter = require('./routers/authRouter')
const bookingRouter = require('./routers/bookingRouter'); 
const getRouter = require('./routers/getRouter');
const {sendSuccess, sendError} = require('./utils/response');
const cookieParser = require('cookie-parser');

const PORT = process.env.PORT || 3000; 

connectDB().then(() => {
    console.log('DB connected successfully'); 
    app.listen(PORT, () => {
        console.log('server is listening at port: ', PORT);
    })
}).catch((err) => console.error('ERROR-DBConnection', err,message));

require('./workers/restockWorker');
app.use(express.json());
app.use(cookieParser());
app.use('/', authRouter); 
app.use('/', adminRouter); 
app.use('/', bookingRouter); 
app.use('/', getRouter);



app.get('/', (req, res, next) => {
    console.log('--- this is home ---');
    return sendSuccess(res, 200, 'This is Home Page', {} );
})

app.use((req, res) => {
    return sendError(res, 404, 'Route does not exist');
})

app.use((err, req, res, next) => {
    if(err){
        console.error('ERROR - global error handeler', err);
        return sendError(res, 500, 'Unexpected Error'); 
    }
    next(); 
});