const jwt = require('jsonwebtoken');
const { findOne } = require('../database');

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = findOne('users', u => u.id === decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    req.user = {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role
    };
    next();
  } catch (err) {
    return res.status(403).json({ error: '令牌无效' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (req.user.role !== role) {
      return res.status(403).json({ error: '权限不足' });
    }
    next();
  };
}

module.exports = { authenticateToken, requireRole };
