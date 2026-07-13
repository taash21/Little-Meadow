const express = require("express");

const router = express.Router();

const analyzeController = require("../controllers/analyzeController");

router.post("/", analyzeController.analyze);
router.post("/save", analyzeController.saveApplication);

module.exports = router;