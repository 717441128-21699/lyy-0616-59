require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const { loadDatabase } = require('./database');
const { setupSocket } = require('./sockets/proctorSocket');

const authRoutes = require('./routes/auth');
const examRoutes = require('./routes/exams');
const examActionRoutes = require('./routes/exam-actions');
const reportRoutes = require('./routes/reports');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.set('io', io);

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use('/api/auth', authRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/exam', examActionRoutes);
app.use('/api/reports', reportRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: '监考系统运行正常' });
});

setupSocket(io);

loadDatabase();

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`监考系统服务运行在端口 ${PORT}`);
  console.log(`HTTP API: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}`);
});
