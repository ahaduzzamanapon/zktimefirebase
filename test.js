const ZKLib = require('./zklib');
const { DateTime } = require('luxon');
const { initializeApp } = require('firebase/app');
const { getDatabase, ref, set } = require('firebase/database');

const pollInterval = 15000; // Polling interval in milliseconds

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAocs5RyWdSwsPYKMAThQfwOAbyuaYXeVU",
    authDomain: "smart-hr-79540.firebaseapp.com",
    databaseURL: "https://smart-hr-79540-default-rtdb.asia-southeast1.firebasedatabase.app/",
    projectId: "smart-hr-79540",
    storageBucket: "smart-hr-79540.appspot.com",
    messagingSenderId: "323140750651",
    appId: "1:323140750651:web:a8a2ea86bf16f12717bb1e"
};

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const database = getDatabase(firebaseApp);

// Define an array of device configurations
const devices = [
    { ip: '192.168.30.14', port: 4370, timeout: 1000000, retry: 4000 },
    { ip: '192.168.30.20', port: 4370, timeout: 1000000, retry: 4000 }
    // Add more devices here if needed
];
let previousData = {}; // Initialize previousData as an empty object
async function fetchData(deviceConfig) {
    const { ip, port, timeout, retry } = deviceConfig;
    const zkInstance = new ZKLib(ip, port, timeout, retry);
    try {
        await zkInstance.createSocket();
        const attendances = await zkInstance.getAttendances();
        return attendances.data;
    } catch (error) {
        console.error(`Error fetching attendance data for device ${ip}:${port}:`, error);
        return null;
    }
}
async function startPolling() {
    console.log('Polling started...');
    // Iterate through each device configuration
    for (const deviceConfig of devices) {
        const currentData = await fetchData(deviceConfig);
        if (currentData !== null) {
            if (!previousData[deviceConfig.ip]) {
                previousData[deviceConfig.ip] = currentData;
                const oldPunches = [];
                currentData.forEach(newRecord => {
                        try {
                            // Convert the recordTime to a JavaScript Date object
                            const recordTime = new Date(newRecord.recordTime);
                            // Convert the JavaScript Date object to a Luxon DateTime object and set it to UTC timezone
                            const recordTimeUtc = DateTime.fromJSDate(recordTime, { zone: 'utc' });
                            // Convert the UTC DateTime to Dhaka timezone and format it
                            const recordTimeDhaka = recordTimeUtc.setZone('Asia/Dhaka').toFormat('yyyy-MM-dd HH:mm:ss');
                            // Push the new record with the formatted Dhaka timezone time to recentPunches array
                            oldPunches.push({ ...newRecord, recordTimeDhaka });
                        } catch (error) {
                            console.error('Error converting recordTime to Dhaka timezone:', error);
                        }
                    
                });
                await sendRecentPunches(oldPunches);
                console.log(`Initial data for device ${deviceConfig.ip}:`, currentData);
            }
        }
    }

    setInterval(async () => {
        console.log("Polling...");
        for (const deviceConfig of devices) {
            const newData = await fetchData(deviceConfig);
            if (newData !== null && JSON.stringify(previousData[deviceConfig.ip]) !== JSON.stringify(newData)) {
                const recentPunches = findRecentPunches(previousData[deviceConfig.ip], newData);
                console.log(`Recent punches for device ${deviceConfig.ip}:`, recentPunches);
                await sendRecentPunches(recentPunches);
                previousData[deviceConfig.ip] = newData;
            }
        }
    }, pollInterval);
}

function findRecentPunches(previousData, newData) {
    const recentPunches = [];
    newData.forEach(newRecord => {
        const found = previousData.find(previousRecord => previousRecord.userSn === newRecord.userSn);
        if (!found) {
            try {
                // Convert the recordTime to a JavaScript Date object
                const recordTime = new Date(newRecord.recordTime);

                // Convert the JavaScript Date object to a Luxon DateTime object and set it to UTC timezone
                const recordTimeUtc = DateTime.fromJSDate(recordTime, { zone: 'utc' });

                // Convert the UTC DateTime to Dhaka timezone and format it
                const recordTimeDhaka = recordTimeUtc.setZone('Asia/Dhaka').toFormat('yyyy-MM-dd HH:mm:ss');

                // Push the new record with the formatted Dhaka timezone time to recentPunches array
                recentPunches.push({ ...newRecord, recordTimeDhaka });
            } catch (error) {
                console.error('Error converting recordTime to Dhaka timezone:', error);
            }
        }
    });
    return recentPunches;
}

// async function sendRecentPunches(recentPunches) {
//     console.log("punches=>>>>>>>:", recentPunches);
//     try {
//         const myHeaders = new Headers();
//         myHeaders.append("Cookie", "ci_session=25p5jrm7bt560lkara9dbtpf576254lk");

//         const formdata = new FormData();
//         formdata.append("data", JSON.stringify(recentPunches));

//         const requestOptions = {
//             method: "POST",
//             headers: myHeaders,
//             body: formdata,
//             redirect: "follow"
//         };

//         fetch("http://173.212.223.213/smarthr/api/admin/sendRecentPunches", requestOptions)
//             .then((response) => response.text())
//             .then((result) => console.log(result))
//             .catch((error) => console.error(error));
//     } catch (error) {
//         console.error("Error sending recent punches:", error);
//     }
// }

async function sendRecentPunches(recentPunches) {
    try {
        const dbRef = ref(database, 'recentPunches');
        await set(dbRef, recentPunches);
        console.log('Recent punches sent to Firebase:', recentPunches);
    } catch (error) {
        console.error('Error sending recent punches to Firebase:', error);
    }
}

startPolling();
