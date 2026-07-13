const express = require("express");

const router = express.Router();

const analyzeController = require("../controller/analyzeController");

router.post("/", analyzeController.analyze);
router.post("/save", analyzeController.saveApplication);

module.exports = router;