const mysql = require('mysql2')

require('dotenv').config()


// make connection to database
const connection = mysql.createPool({
    host: '*',
    user: '*',
    password: '*',
    database: '*',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
})


// grant all function to use this module
module.exports = connection