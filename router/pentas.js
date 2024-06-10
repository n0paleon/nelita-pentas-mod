const router = require('express').Router()
const session = require('express-session')
const axios = require('axios')
const db = require('../db')
const MySQLStore = require('express-mysql-session')(session)

const sessionStore = new MySQLStore({
    host: "*",
    port: 3306,
    user: "*",
    password: "*",
    database: "*",
    createDatabaseTable: true
})

router.use(session({
    store: sessionStore,
    secret: 'smkn5tgrpentas',
    resave: false,
    saveUninitialized: true,
    cookie: {
        secure: false
    }
}))

const apiUrl = 'http://smkn5tangerangkota.sch.id:5680/api'

router.use((request, response, next) => {
    request.session.ip = request.headers['x-forwarded-for'] || request.ip

    next()
})


router.get('/', (request, response, next) => {
    if (!request.session.siswa) {
        response.render("login", {
            success: null
        })
    } else {
        response.redirect('/pentas/home')
    }
})

router.get('/logout', async (request, response, next) => {
    if (!request.session.siswa) {
        return response.redirect('/pentas')
    }

    await logout(request.session.siswa.nisn)
    await request.session.destroy()
    
    return response.redirect('/pentas')
})

router.get('/logout_acc', async (request, response, next) => {
    response.render('logout_acc', {
        success: false,
        reason: null
    })
})

router.post('/logout_acc', async (request, response, next) => {
    if (request.body.nisn.length > 1) {
        await logout(request.body.nisn)
        return response.render("logout_acc", {
            success: true,
            reason: "dah mek, coba login aja lagi sono!"
        })
    } else {
        return response.render("logout_acc", {
            success: false,
            reason: "masukin nisn yg bener paok!"
        })
    }
})

router.post('/', async (request, response, next) => {
    if (request.session.siswa) {
        return response.redirect('/pentas/home')
    }

    if (request.body.nisn && request.body.nama) {
        
        try {
            const payload1 = {
                username: request.body.nisn,
                password: request.body.nama,
                imei: Date.now()
            }
            const doLogin = await axios.post(apiUrl + '/login', payload1)
            
            if (doLogin.data.success == 'true') {
                const checkPremium = await db.promise().query('SELECT * FROM premium WHERE nisn=?', request.body.nisn)
                await db.promise().releaseConnection()
                if (checkPremium[0].length === 0) {
                    await logout(payload1.username)

                    await insertLoginLogs({
                        nisn: payload1.username,
                        nama: payload1.password,
                        ip: request.headers['x-forwarded-for'] || request.ip,
                        status: "not VIP"
                    })

                    return response.render("login", {
                        success: false,
                        reason: "keluar dari website ini atau nilai anda akan jadi 0! - by Operator SMKN 5"
                    })
                } else if (checkPremium[0][0].status === "suspended") {
                    await logout(payload1.username)

                    await insertLoginLogs({
                        nisn: payload1.username,
                        nama: payload1.password,
                        ip: request.headers['x-forwarded-for'] || request.ip,
                        status: "account suspended"
                    })

                    return response.render("login", {
                        success: false,
                        reason: checkPremium[0][0].reason
                    })
                } else {
                    await insertLoginLogs({
                        nisn: payload1.username,
                        nama: payload1.password,
                        ip: request.headers['x-forwarded-for'] || request.ip,
                        status: "success"
                    })

                    request.session.siswa = doLogin.data.siswa
                    return response.redirect('/pentas/home')
                }          
            } else {
                if (doLogin.data.success == "false" && doLogin.data.msg.toLowerCase() !== "nama dan nisn tidak ditemukan!") {
                    const doLogout = await logout(request.body.nisn)

                    await insertLoginLogs({
                        nisn: payload1.username,
                        nama: payload1.password,
                        ip: request.headers['x-forwarded-for'] || request.ip,
                        status: "double login"
                    })
                    
                    if (doLogout === true) {
                        return response.render("login", {
                            success: false,
                            reason: "ulangin tod, akun lu di perangkat lain tadi"
                        })
                    }
                } else {
                    await insertLoginLogs({
                        nisn: payload1.username,
                        nama: payload1.password,
                        ip: request.headers['x-forwarded-for'] || request.ip,
                        status: "invalid account"
                    })
    
                    return response.render("login", {
                        success: false,
                        reason: "gada otak lu, salah mulu masukin akun!"
                    })
                }
            }
        } catch (e) {
            console.error(e)
            return response.send("api error, go back and refresh")
        }
    } else {
        response.render("login", {
            success: false,
            reason: "masukin NISN dan NAMA LENGKAP kontollll!"
        })
    }
})

router.get('/home', async (request, response, next) => {
    if (!request.session.siswa) {
        return response.redirect('/pentas')
    } else {
        try {
            const getListUjian = await axios.post(apiUrl + '/main', {
                siswa_id: request.session.siswa.id
            })

            if (getListUjian.data.success == 'true') {
                const [rows] = await db.promise().query('SELECT * FROM premium WHERE nisn=?', request.session.siswa.nisn)
                await db.promise().releaseConnection()

                request.session.kkm = rows[0].kkm
                request.session.nilai = []
                getListUjian.data.jadwal.forEach((item) => {
                    request.session.nilai.push(item.nilai)
                })
                
                response.render("home", {
                    tipe: getListUjian.data.tipe,
                    jadwal: getListUjian.data.jadwal,
                    kkm: rows[0].kkm,
                    alert: function () {
                        if (request.cookie.alert) {
                            var msg = request.cookie.alert
                            response.clearCookie('alert')
                            return msg
                        } else {
                            return null
                        }
                    }
                })
            } else {
                response.render("home", {
                    tipe: null,
                    alert: 'tlol lu, hari ni gada ujian buat elu!'
                })
            }
        } catch (e) {
            console.error(e)
            return response.send("api error, go back and refresh")
        }
    }
})

router.post('/ujian/:tipe/:jadwal_id/:pelajaran_id/:jadwal_detail_id/:urutan', async (request, response, next) => {
    if (!request.session.siswa) {
        return response.redirect('/pentas')
    }

    try {
        if (request.body.soal_id) {
            const payload = {
                tipe: request.params.tipe,
                ujian_id: request.session.ujian_id,
                jawaban_pg: []
            }

            for (const id of request.body.soal_id) {
                const newObject = {
                    id: id,
                    kunci: '',
                    jawaban: request.body[`jawaban_${id}`] || ""
                }

                payload.jawaban_pg.push(newObject)
            }

            const payloadString = new URLSearchParams()
            payloadString.append('tipe', payload.tipe)
            payloadString.append('ujian_id', payload.ujian_id)
            payloadString.append('jawaban_pg', JSON.stringify(payload.jawaban_pg))

            //console.log(payloadString.toString())

            const selesaiUjian = await axios.post(apiUrl + '/selesaiujian', payloadString.toString(), {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            })

            console.log(selesaiUjian.data)

            if (selesaiUjian.data.success == "true") {
                const [rows] = await db.promise().query("UPDATE premium SET total_revisi=total_revisi+1 WHERE nisn=?", request.session.siswa.nisn)
                await db.promise().releaseConnection()

                response.cookie('alert', 'sukses tot, jawaban lu berhasil gw kirim!')
                response.redirect('/pentas/home')
            } else {
                //request.session.gagal = true
                response.redirect(`/pentas/ujian/${request.params.tipe}/${request.params.jadwal_id}/${request.params.pelajaran_id}/${request.params.jadwal_detail_id}/${request.params.urutan}`)
            }
        }
    } catch (e) {
        console.error(e)
        return response.send("api error, go back and refresh")
    }
})

router.get('/ujian/:tipe/:jadwal_id/:pelajaran_id/:jadwal_detail_id/:urutan', async (request, response, next) => {
    if (!request.session.siswa) {
        return response.redirect('/pentas')
    }

    if (request.session.nilai[request.params.urutan - 1] > request.session.kkm) {
        return response.redirect('/pentas/home')
    }

    try {
        if (request.params.tipe && request.params.jadwal_id && request.params.pelajaran_id && request.params.jadwal_detail_id && request.params.urutan) {
            const mulaiujian = await axios.post(apiUrl + '/mulaiujian', {
                tipe: request.params.tipe,
                siswa_id: request.session.siswa.id,
                jadwal_id: request.params.jadwal_id,
                pelajaran_id: request.params.pelajaran_id,
                urutan: request.params.urutan
            })

            if (mulaiujian.data.success == true) {
                request.session.ujian_id = mulaiujian.data.ujian_id

                const [rows] = await db.promise().query('SELECT * FROM soal WHERE jadwal_detail_id=?', request.params.jadwal_detail_id)
                await db.promise().releaseConnection()
                if (rows.length > 0) {
                    //console.log(rows)
                    response.render("ujian", {
                        success: true,
                        data: rows,
                        alert: null
                    })
                } else {
                    try {
                        const accessSoal = await axios.post(apiUrl + '/getsoal', {
                            tipe: request.params.tipe,
                            jadwal_detail_id: request.params.jadwal_detail_id
                        })

                        if (accessSoal.data.success == "true") {
                            accessSoal.data.soal.forEach(async (soal) => {
                                var payload = {
                                    id: soal.id,
                                    jadwal_detail_id: request.params.jadwal_detail_id,
                                    soal: await cleanAndFormatHTML(soal.soal),
                                    pil_a: await cleanAndFormatHTML(soal.pil_a),
                                    pil_b: await cleanAndFormatHTML(soal.pil_b),
                                    pil_c: await cleanAndFormatHTML(soal.pil_c),
                                    pil_d: await cleanAndFormatHTML(soal.pil_d),
                                    pil_e: await cleanAndFormatHTML(soal.pil_e)
                                }
                                await db.promise().query("INSERT INTO soal SET ?", payload)
                                await db.promise().releaseConnection()
                                await delay(10)
                            })

                            const updateGetSoal = await db.promise().query('SELECT * FROM soal WHERE jadwal_detail_id=?', request.params.jadwal_detail_id)
                            await db.promise().releaseConnection()

                            if (updateGetSoal[0].length > 0) {
                                response.render("ujian", {
                                    success: true,
                                    data: updateGetSoal[0],
                                    alert: null
                                })
                            } else {
                                response.render("ujian", {
                                    success: false,
                                    reason: "error mulu dh ngentod!",
                                    data: null,
                                    alert: null
                                })
                            }
                        } else {
                            return response.render("ujian", {
                                success: false,
                                reason: "dah selesai ujian ini paok, kerjain yg laen sono tolol",
                                data: null,
                                alert: null
                            })
                        }
                    } catch (e) {
                        return response.render("ujian", {
                            success: false,
                            reason: "awokwkwkw mmek refresh lagi tod, web smkn5 nya cacat!",
                            data: null,
                            alert: null
                        })
                    }
                }
            } else {
                return response.render("ujian", {
                    success: false,
                    reason: "awokwokawok refresh tod, web smkn5 nya cacat buat gw akses!",
                    data: null,
                    alert: null
                })
            }
        } else {
            response.send("ngapain lo kontl?!")
        }
    } catch (e) {
        console.error(e)
        return response.send("api error, go back and refresh")
    }
})

async function insertLoginLogs (payload) {
    const [rows] = await db.promise().query("INSERT INTO login_logs SET ?", payload)
    await db.promise().releaseConnection()
}


function cleanAndFormatHTML(input) {
    // Membersihkan string dari karakter escape seperti '\'
    var cleanedString = input.replace(/\\/g, '');
  
    // Mencari tag <img> dalam string
    const imgRegex = /<img [^>]*src="([^"]+)"[^>]*>/g;
    const matches = Array.from(cleanedString.matchAll(imgRegex));
  
    // Menggantikan tag <img> dengan tag <img> yang benar
    for (const match of matches) {
      const originalImgTag = match[0];
      const base64Data = match[1];
      const newImgTag = `<img src="${base64Data}" />`;
      cleanedString = cleanedString.replace(originalImgTag, newImgTag);
    }
  
    return cleanedString;
  }

async function logout (username) {
    try {
        await axios.post(apiUrl + '/logout', {
            username: username
        })
    } catch (e) {
        console.log(e.message)
        return false
    }
    
    return true
}

function delay (ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

function generateRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}



module.exports = router