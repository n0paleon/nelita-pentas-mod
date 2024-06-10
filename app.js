const express = require('express')
const https = require('https')
const fs = require('fs')


const app = express()
const app_port = 5680


app.set('view engine', 'ejs')
app.set('views', './views')

app.use(express.urlencoded({
    extended: true
}))


app.use('/pentas', require('./router/pentas'))



app.listen(app_port, () => {
    console.log(`server berjalan di port ${app_port}`)
})