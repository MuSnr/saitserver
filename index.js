const cors = require('cors');
const express = require('express');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
// json accept
app.use(express.json());
// allow url encoding
app.use(express.urlencoded({ extended: true }));

app.use(cors());
app.get('/api', (req, res) => {
  res.json({ message: 'Hello from the API!' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
connectDB = require('./services/dbconnection');
connectDB();

const userroutes = require('./routes/userRoutes');
app.use('/api/users', userroutes);
// server fix