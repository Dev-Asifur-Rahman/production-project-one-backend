require('dotenv').config();

// route files 
const users = require('./routes/users.js')

const express = require('express')
const cors = require('cors');

// const { connectDb } = require('./config/mongodb.js');

const app = express()
const PORT = process.env.PORT || 5000

app.use(cors())
app.use(express.json())

// connectDb()

app.get('/',(req,res)=>{
    res.send('slick deals backend')
})

// using routes 
app.use('/users',users)

app.listen(PORT,()=>{
    console.log('app is running on port')
})
