const ai = require("../services/geminiService");
const applicationModel = require("../models/applicationModel");

// AI Analyze Route
exports.analyze = async (req, res) => {
    try {
        console.log("saveApplication called");
console.log(req.body);
        const { prompt } = req.body;

        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: prompt
        });

        res.json({
            success: true,
            result: response.text
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }
};

// Save Application Route
exports.saveApplication = async (req, res) => {

    try {

        const application = req.body;

        application.createdAt = new Date().toISOString();

        await applicationModel.createApplication(application);

        res.json({
            success: true,
            message: "Application Saved"
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            success: false,
            error: error.message
        });

    }

};