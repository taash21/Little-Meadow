const express = require("express");
const cors = require("cors");
const uploadRoute = require("./routes/uploads");
const app = express();
const analyzeRoute = require("./routes/analyze");
require("dotenv").config();
const applicationModel = require("./models/applicationModel");
app.use(cors());
app.use(express.json());
app.use("/api/uploads", uploadRoute);
app.get("/", (req, res) => {
    res.send("Little Meadow Backend Running!");
});

app.get("/api/health", (req, res) => {
    res.json({
        working: true,
        message: "Backend Connected"
    });
});
app.use("/api/analyze", analyzeRoute);
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
});
console.log("Gemini Key Loaded:", process.env.GEMINI_API_KEY ? "YES" : "NO");
(async () => {

    const apps = await applicationModel.getAllApplications();

    console.log("Applications in database:");

    console.log(apps);

})();