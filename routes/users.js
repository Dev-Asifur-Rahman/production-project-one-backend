const express = require('express')
const users = express.Router()

users.get('/',(req,res)=>{
    res.send('I am from User Route')
})


module.exports = users