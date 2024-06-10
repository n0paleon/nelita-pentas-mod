const axios = require('axios')
const fs = require('fs')
const qs = require('qs')
const { URLSearchParams } = require('url')

const users = JSON.parse(fs.readFileSync('./login.json'))
const apiUrl = 'http://smkn5tangerangkota.sch.id:5680/api'


async function start (user) {
    try {
        var userPayload = {
            username: user.NISN,
            password: user.NAMA,
            imei: generateRandomNumber(100, 900)
        }
        const login = await axios.post(apiUrl + '/login', userPayload)
        // delay 1500ms
        await delay(500)
        
        if (login.data.success == "true") {
            const siswa_id = login.data.siswa.id
            const getJadwal = await axios.post(apiUrl + '/main', {
                siswa_id: siswa_id
            })
            // delay 1500ms
            await delay(500)
            console.log('siswa_id: ' + siswa_id)
            console.log('mencoba mencari jadwal ujian...\n')
            
            if (getJadwal.data.success == "true") {
                const filterJadwal = getJadwal.data.jadwal.filter(item => item.nilai == null || item.nilai == 0)

                const mulaiUjian = await axios.post(apiUrl + '/mulaiujian', {
                    tipe: getJadwal.data.tipe,
                    siswa_id: siswa_id,
                    jadwal_id: filterJadwal[0].id,
                    pelajaran_id: filterJadwal[0].pelajaran_id,
                    urutan: filterJadwal[0].urutan
                })
                // delay 1500ms
                await delay(500)
                console.log('tipe: ' + getJadwal.data.tipe)
                console.log('jadwal_id: ' + filterJadwal[0].id)
                console.log('pelajaran_id: ' + filterJadwal[0].pelajaran_id)
                console.log('urutan: ' + filterJadwal[0].urutan)
                console.log('mencoba mendapatkan soal....\n')

                if (mulaiUjian.data.success == true) {
                    console.log('ujian_id: ' + mulaiUjian.data.ujian_id)
                    console.log('mencari soal...\n')

                    const getSoal = await axios.post(apiUrl + '/getsoal', {
                        tipe: getJadwal.data.tipe,
                        jadwal_detail_id: filterJadwal[0].jadwal_detail_id
                    })
                    // delay 1500ms
                    await delay(500)

                    if (getSoal.data.success == "true") {
                        console.log('panjang soal: '+ getSoal.data.soal.length)
                        console.log('mencoba mengerjakan ujian...\n')

                        await kirimUjian(getJadwal.data.tipe, mulaiUjian.data.ujian_id, getSoal.data.soal, filterJadwal[0].urutan, siswa_id, generateRandomNumber(90, 100))
                    } else {
                        console.log('gagal mendapatkan soal!')
                        console.log(filterJadwal[0])
                    }
                } else {
                    console.log("error ketika mencari jadwal ujian!")
                }
            } else {
                console.log('nothing to do!')
                console.log('no task here...')
            }
        } else {
            console.log('failed to login because this account has been logged in!')
            console.log('trying to logout account....')
            await logout(userPayload.username)
            console.log('success, restart program!')
        }
    } catch (e) {
        console.log(e)
        console.log('failed because api host was error!')
    }
}


async function kirimUjian (tipe, ujian_id, soal, urutan, siswa_id, kkm) {
    var payload = {
        tipe: tipe,
        ujian_id: ujian_id,
        jawaban_pg: []
    }

    let nilai = 0

    for (let i = 0; i < soal.length; i++) {
        payload.jawaban_pg.push({
            id: soal[i].id,
            kunci: 'A',
            jawaban: await generateRandomAnswer()
        })
    }

    const payloadString = new URLSearchParams(payload).toString()
    console.log(payload)
    await axios.post(apiUrl + '/selesaiujian', payloadString)
    .then(result => console.log(result.data))
    
    // for (let i = 0; i < soal.length; i++) {
    //     payload.jawaban_pg.push({
    //         id: soal[i].id,
    //         kunci: '',
    //         jawaban: await generateRandomAnswer()
    //     })

    //     let send = true
    //     while (send) {
    //         console.log(payload)
    //         // payload.jawaban_pg[i].jawaban = await generateRandomAnswer()

    //         const payloadString = new URLSearchParams(payload).toString()
            
    //         const post = await axios.post(apiUrl + '/selesaiujian', payloadString, {
    //             headers: {
    //                 'content-type': 'application/x-www-form-urlencoded'
    //             }
    //         })

    //         if (post.data.success == "true") {
    //             await delay(500)
    //             const checkNilai = await getNilai(urutan, siswa_id)
    //             console.log(checkNilai)
    //             console.log(post.data)
                
    //             if (checkNilai > nilai) {
    //                 nilai = checkNilai
    //                 send = false
    //             }
    //         }
            
    //         // set delay 500 every while loop
    //         await delay(1000)
    //     }
    //     send = true

    //     if (nilai >= kkm) {
    //         console.log(`program telah selesai dijalankan dengan nilai kkm ditetapkan menjadi ${kkm} dan nilai anda adalah ${nilai}`)
    //         break
    //     }
        
    //     // set delay 1000
    //     await delay(1000)
    // }

    //console.log(payload)
}


function generateRandomAnswer() {
    const answers = ['A', 'B', 'C', 'D', 'E']
    const randomIndex = Math.floor(Math.random() * answers.length)
    return answers[randomIndex]
}


async function logout (username) {
    await axios.post(apiUrl + '/logout', {
        username: username
    })
    return true
}


function generateRandomNumber(min, max) {
    return Math.floor(Math.random() * (max - min) + min);
}


function delay (ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function getNilai (urutan, siswa_id) {
    const nilai = await axios.post(apiUrl + '/main', {
        siswa_id: siswa_id
    })
    return nilai.data.jadwal.filter(item => item.urutan == urutan)[0].nilai
}


start(users)