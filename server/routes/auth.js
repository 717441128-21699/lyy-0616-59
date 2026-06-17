const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { findOne, findMany } = require('../database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: '请输入用户名和密码' });
  }

  const user = findOne('users', u => u.username === username);
  
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const isValid = bcrypt.compareSync(password, user.password);
  
  if (!isValid) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }

  const token = jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    }
  });
});

router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

router.get('/students', authenticateToken, (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '权限不足' });
  }
  
  const students = findMany('users', u => u.role === 'student')
    .map(u => ({ id: u.id, username: u.username, name: u.name }));
  
  res.json({ students });
});

module.exports = router;
