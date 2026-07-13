const connectDB = require("../database/database");

async function getAllApplications() {

    const db = await connectDB();

    return db.all("SELECT * FROM applications");

}

async function createApplication(application) {

    const db = await connectDB();

    return db.run(
        `
        INSERT INTO applications
        (
            company,
            role,
            status,
            notes,
            image,
            createdAt
        )
        VALUES
        (
            ?, ?, ?, ?, ?, ?
        )
        `,
        [
            application.company,
            application.role,
            application.status,
            application.notes,
            application.image,
            application.createdAt
        ]
    );

}

module.exports = {

    getAllApplications,
    createApplication

};