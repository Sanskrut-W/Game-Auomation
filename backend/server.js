const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
const testRoutes = require('./routes/testRoutes');
app.use('/api/tests', testRoutes);

// Static screenshots folder
app.use('/screenshots', express.static(path.join(__dirname, 'screenshots')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT} (In-Memory Mode)`));
