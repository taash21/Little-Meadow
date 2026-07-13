require("dotenv").config();

const { GoogleGenAI } = require("@google/genai");

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

(async () => {
  try {
    const model = "gemini-3.5-flash";
    console.log("Testing:", model);

    const response = await ai.models.generateContent({
      model,
      contents: "Say hello",
    });

    console.log(response.text);
  } catch (e) {
    console.dir(e, { depth: null });
  }
})();