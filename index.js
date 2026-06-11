const cors = require("cors");
const express = require("express");
const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();
const app = express();
// json accept
app.use(express.json());
// allow url encoding
app.use(express.urlencoded({ extended: true }));

app.use(cors());
app.get("/", (req, res) => {
  // health check endpoint
  res.json({ message: "API is running!" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// connect to mongo
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB connected successfully"))
  .catch((error) => console.error("MongoDB connection failed:", error.message));

const userroutes = require("./routes/userRoutes");
app.use("/api/users", userroutes);
// server fix
