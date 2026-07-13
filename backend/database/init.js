const connectDB = require("./database");

async function initializeDatabase() {

    const db = await connectDB();

    await db.exec(`
        CREATE TABLE IF NOT EXISTS applications (

            id INTEGER PRIMARY KEY AUTOINCREMENT,

            company TEXT,

            role TEXT,

            status TEXT,

            notes TEXT,

            image TEXT,

            createdAt TEXT

        );
    `);

    console.log("Applications table ready.");

}

initializeDatabase();